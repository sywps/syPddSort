#!/usr/bin/env python3
"""Generate isolated ZT levels 6-205 from the approved placement-first pool."""

from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import statistics
import tempfile
from collections import Counter, deque
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tools" / "online-levels-2026-08-01"
ONLINE_DIR = ROOT / "assets" / "LevelData"
ANALYSIS = ROOT / "tools" / "generated_levels" / "zt_200_candidate_analysis.json"
OUTPUT_DIR = ROOT / "tools" / "online-levels-2026-08-01-zt-selected-200"
RHYTHM_RANKS = (1, 3, 4, 6, 8, 0, 5, 2, 7, 9)
RHYTHM_ROLES = ("relief", "normal", "normal", "growth", "mini_peak", "relief", "growth", "normal", "growth", "chapter_peak")
DIRS4 = ((-1, 0), (1, 0), (0, -1), (0, 1))


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_level(path: Path, level: dict) -> tuple[Counter, int]:
    target = level.get("correctColorArr")
    initial = level.get("initRandomColorArr")
    if not isinstance(target, list) or not target or not isinstance(initial, list):
        raise ValueError(f"{path}: missing color arrays")
    height = len(target)
    width = len(target[0])
    if width == 0 or any(not isinstance(row, list) or len(row) != width for row in target):
        raise ValueError(f"{path}: target is not rectangular")
    if len(initial) != height or any(not isinstance(row, list) or len(row) != width for row in initial):
        raise ValueError(f"{path}: initial dimensions differ from target")
    if int(level.get("boardWidth", -1)) != width or int(level.get("boardHeight", -1)) != height:
        raise ValueError(f"{path}: board dimensions do not match arrays")
    target_inventory = Counter(value for row in target for value in row if value > 0)
    initial_inventory = Counter(value for row in initial for value in row if value > 0)
    if target_inventory != initial_inventory:
        raise ValueError(f"{path}: target/initial color inventory mismatch")
    for row in range(height):
        for col in range(width):
            if (target[row][col] > 0) != (initial[row][col] > 0):
                raise ValueError(f"{path}: target/initial outline mismatch at {row},{col}")
    return target_inventory, sum(target_inventory.values())


def crop_mask(target: list[list[int]]) -> list[list[bool]]:
    cells = [(r, c) for r, row in enumerate(target) for c, value in enumerate(row) if value > 0]
    r0, r1 = min(r for r, _ in cells), max(r for r, _ in cells)
    c0, c1 = min(c for _, c in cells), max(c for _, c in cells)
    return [[target[r][c] > 0 for c in range(c0, c1 + 1)] for r in range(r0, r1 + 1)]


def shape_metrics(target: list[list[int]]) -> tuple[float, int, float]:
    mask = crop_mask(target)
    height, width = len(mask), len(mask[0])
    beans = sum(value for row in mask for value in row)
    perimeter = 0
    branches = 0
    for row in range(height):
        for col in range(width):
            if not mask[row][col]:
                continue
            neighbors = 0
            for dr, dc in DIRS4:
                nr, nc = row + dr, col + dc
                if 0 <= nr < height and 0 <= nc < width and mask[nr][nc]:
                    neighbors += 1
                else:
                    perimeter += 1
            branches += neighbors <= 1
    outside = set()
    queue = deque()
    for row in range(height):
        for col in range(width):
            if row in (0, height - 1) or col in (0, width - 1):
                if not mask[row][col] and (row, col) not in outside:
                    outside.add((row, col))
                    queue.append((row, col))
    while queue:
        row, col = queue.popleft()
        for dr, dc in DIRS4:
            nr, nc = row + dr, col + dc
            if 0 <= nr < height and 0 <= nc < width and not mask[nr][nc] and (nr, nc) not in outside:
                outside.add((nr, nc))
                queue.append((nr, nc))
    visited = set(outside)
    holes = 0
    for row in range(height):
        for col in range(width):
            if mask[row][col] or (row, col) in visited:
                continue
            holes += 1
            visited.add((row, col))
            queue.append((row, col))
            while queue:
                current_row, current_col = queue.popleft()
                for dr, dc in DIRS4:
                    nr, nc = current_row + dr, current_col + dc
                    if 0 <= nr < height and 0 <= nc < width and not mask[nr][nc] and (nr, nc) not in visited:
                        visited.add((nr, nc))
                        queue.append((nr, nc))
    return perimeter / max(1, beans), holes, branches / max(1, beans)


def normalize(values: list[float]) -> list[float]:
    low, high = min(values), max(values)
    if math.isclose(low, high):
        return [0.0] * len(values)
    return [(value - low) / (high - low) for value in values]


def add_difficulty(rows: list[dict]) -> None:
    dimensions = {
        "inversePlaced": ([1 - row["placedBeanRatio"] for row in rows], 0.25),
        "colorCount": ([row["colorCount"] for row in rows], 0.15),
        "componentsPerColor": ([row["componentsPerColor"] for row in rows], 0.12),
        "singletonRatio": ([row["singletonRatio"] for row in rows], 0.08),
        "outlineComplexity": ([row["outlineComplexity"] for row in rows], 0.08),
        "holesAndBranches": ([row["holeCount"] + row["branchRatio"] * 10 for row in rows], 0.07),
        "shuffleComplexity": ([(1 - row["sameColorAdjacency"] + 1 - row["largestInitialBlock"] / row["beanCount"]) / 2 for row in rows], 0.10),
        "beanCount": ([math.log1p(row["beanCount"]) for row in rows], 0.15),
    }
    normalized = {key: normalize(values) for key, (values, _) in dimensions.items()}
    for index, row in enumerate(rows):
        row["difficultyScore"] = round(100 * sum(normalized[key][index] * weight for key, (_, weight) in dimensions.items()), 6)


def wave_order(rows: list[dict]) -> list[dict]:
    ordered = sorted(rows, key=lambda row: (row["difficultyScore"], row["sourceLevelId"]))
    result = []
    for chapter in range(20):
        bucket = ordered[chapter * 10:(chapter + 1) * 10]
        chapter_rows = [None] * 10
        for position, rank in enumerate(RHYTHM_RANKS):
            chapter_rows[position] = bucket[rank]
        result.extend(chapter_rows)
    return result


def assign_time_limits(rows: list[dict]) -> None:
    for row in rows:
        time_limit = min(150, math.ceil(row["beanCount"] / 200) * 30)
        row["timeLimit"] = time_limit
        row["actualBeansPerSecond"] = round(row["beanCount"] / time_limit, 6)


def build_output_text(source_text: str, source_id: int, output_id: int, time_limit: int) -> str:
    pattern = re.compile(r'("levelId"\s*:\s*)' + re.escape(str(source_id)) + r'\b')
    updated, count = pattern.subn(lambda match: match.group(1) + str(output_id), source_text, count=1)
    if count != 1:
        raise ValueError(f"source levelId {source_id} was not replaced exactly once")
    payload = json.loads(updated)
    payload["Hard"] = 0
    payload["conveyorCapacity"] = 60
    payload["timeLimit"] = time_limit
    payload.pop("slotPolicy", None)
    payload.pop("initialSlotUnlockedRows", None)
    return json.dumps(payload, ensure_ascii=False, indent=4) + "\n"


def main() -> None:
    if OUTPUT_DIR.exists():
        raise FileExistsError(f"refusing to overwrite existing directory: {OUTPUT_DIR}")
    analysis = load_json(ANALYSIS)
    candidates = analysis.get("placementFirstCandidates")
    if not isinstance(candidates, list) or len(candidates) != 200:
        raise ValueError("analysis must contain exactly 200 placement-first candidates")
    protected_hashes = {path.name: sha256_bytes(path.read_bytes()) for path in [ONLINE_DIR / f"zt_level_{index}.json" for index in range(1, 6)]}
    rows = []
    for candidate in candidates:
        source_path = SOURCE_DIR / candidate["sourceFilename"]
        level = load_json(source_path)
        inventory, bean_count = validate_level(source_path, level)
        if bean_count != candidate["beanCount"]:
            raise ValueError(f"{source_path}: analysis bean count drift")
        outline_complexity, hole_count, branch_ratio = shape_metrics(level["correctColorArr"])
        row = dict(candidate)
        row.update({
            "sourcePath": str(source_path.relative_to(ROOT)),
            "sourceSha256": sha256_bytes(source_path.read_bytes()),
            "outlineComplexity": outline_complexity,
            "holeCount": hole_count,
            "branchRatio": branch_ratio,
            "targetInventory": dict(sorted(inventory.items())),
        })
        rows.append(row)
    add_difficulty(rows)
    ordered = wave_order(rows)
    assign_time_limits(ordered)
    temporary = Path(tempfile.mkdtemp(prefix="zt-selected-200.", dir=ROOT / "tools"))
    manifest_rows = []
    try:
        for level_id in range(1, 6):
            source_path = ONLINE_DIR / f"zt_level_{level_id}.json"
            output_path = temporary / source_path.name
            shutil.copyfile(source_path, output_path)
            if sha256_bytes(output_path.read_bytes()) != protected_hashes[source_path.name]:
                raise ValueError(f"{source_path.name}: preserved online copy hash mismatch")
        for index, row in enumerate(ordered):
            zt_level_id = index + 6
            source_path = ROOT / row["sourcePath"]
            output_path = temporary / f"zt_level_{zt_level_id}.json"
            output_text = build_output_text(source_path.read_text(encoding="utf-8"), row["sourceLevelId"], zt_level_id, row["timeLimit"])
            output_path.write_text(output_text, encoding="utf-8")
            output_level = load_json(output_path)
            validate_level(output_path, output_level)
            source_level = load_json(source_path)
            source_without_id = dict(source_level)
            output_without_id = dict(output_level)
            source_without_id.pop("levelId", None)
            output_without_id.pop("levelId", None)
            output_without_id.pop("Hard", None)
            output_without_id.pop("conveyorCapacity", None)
            output_without_id.pop("timeLimit", None)
            source_without_id.pop("timeLimit", None)
            source_without_id.pop("slotPolicy", None)
            source_without_id.pop("initialSlotUnlockedRows", None)
            if source_without_id != output_without_id or int(output_level["levelId"]) != zt_level_id:
                raise ValueError(f"{output_path}: output changed fields beyond levelId, timeLimit, and runtime schema additions")
            if output_level["Hard"] != 0 or output_level["conveyorCapacity"] != 60 or output_level["timeLimit"] != row["timeLimit"]:
                raise ValueError(f"{output_path}: invalid runtime schema additions")
            manifest_rows.append({
                "ztLevelId": zt_level_id,
                "outputFilename": output_path.name,
                "sourceLevelId": row["sourceLevelId"],
                "sourceFilename": row["sourceFilename"],
                "beanCount": row["beanCount"],
                "colorCount": row["colorCount"],
                "placedBeanCount": row["placedBeanCount"],
                "placedBeanRatio": row["placedBeanRatio"],
                "sameColorAdjacency": row["sameColorAdjacency"],
                "singletonRatio": row["singletonRatio"],
                "componentsPerColor": row["componentsPerColor"],
                "largestInitialBlock": row["largestInitialBlock"],
                "outlineComplexity": row["outlineComplexity"],
                "holeCount": row["holeCount"],
                "branchRatio": row["branchRatio"],
                "difficultyScore": row["difficultyScore"],
                "sourceTimeLimit": source_level.get("timeLimit"),
                "timeLimit": row["timeLimit"],
                "actualBeansPerSecond": row["actualBeansPerSecond"],
                "chapterIndex": index // 10 + 1,
                "chapterRole": RHYTHM_ROLES[index % 10],
                "nearestOnlineFile": row["nearestOnlineFile"],
                "outlineSimilarity": row["outlineSimilarity"],
                "colorLayoutSimilarity": row["colorLayoutSimilarity"],
                "sourceSha256": row["sourceSha256"],
                "outputSha256": sha256_bytes(output_path.read_bytes()),
                "Hard": 0,
                "conveyorCapacity": 60,
            })
        (temporary / "selection_manifest.json").write_text(json.dumps({
            "version": 1,
            "sourceDirectory": str(SOURCE_DIR.relative_to(ROOT)),
            "onlineComparisonDirectory": str(ONLINE_DIR.relative_to(ROOT)),
            "outputRange": [6, 205],
            "preservedOnlineRange": [1, 5],
            "totalThemeLevelRange": [1, 205],
            "protectedOnlineThemeHashes": protected_hashes,
            "selectionPolicy": "placementFirst",
            "runtimeSchema": {"Hard": 0, "conveyorCapacity": 60},
            "levels": manifest_rows,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        chapter_summaries = []
        for chapter in range(20):
            items = manifest_rows[chapter * 10:(chapter + 1) * 10]
            chapter_summaries.append({
                "chapter": chapter + 1,
                "range": [items[0]["ztLevelId"], items[-1]["ztLevelId"]],
                "meanDifficulty": statistics.mean(item["difficultyScore"] for item in items),
                "miniPeakDifficulty": items[4]["difficultyScore"],
                "reliefDifficulty": items[5]["difficultyScore"],
                "chapterPeakDifficulty": items[9]["difficultyScore"],
                "meanTimeLimit": statistics.mean(item["timeLimit"] for item in items),
                "meanActualBeansPerSecond": statistics.mean(item["actualBeansPerSecond"] for item in items),
            })
        report = {
            "generatedLevelCount": len(manifest_rows),
            "preservedOnlineLevelCount": 5,
            "totalLevelFileCount": len(manifest_rows) + 5,
            "beanCount": {
                "min": min(item["beanCount"] for item in manifest_rows),
                "mean": statistics.mean(item["beanCount"] for item in manifest_rows),
                "median": statistics.median(item["beanCount"] for item in manifest_rows),
                "max": max(item["beanCount"] for item in manifest_rows),
                "ge1000": sum(item["beanCount"] >= 1000 for item in manifest_rows),
                "ge900": sum(item["beanCount"] >= 900 for item in manifest_rows),
            },
            "placedBeanRatio": {
                "mean": statistics.mean(item["placedBeanRatio"] for item in manifest_rows),
                "below8Pct": sum(item["placedBeanRatio"] < 0.08 for item in manifest_rows),
                "above12Pct": sum(item["placedBeanRatio"] > 0.12 for item in manifest_rows),
                "max": max(item["placedBeanRatio"] for item in manifest_rows),
            },
            "timeLimit": {
                "policy": "mainline: min(150, ceil(beanCount / 200) * 30)",
                "min": min(item["timeLimit"] for item in manifest_rows),
                "mean": statistics.mean(item["timeLimit"] for item in manifest_rows),
                "median": statistics.median(item["timeLimit"] for item in manifest_rows),
                "max": max(item["timeLimit"] for item in manifest_rows),
                "step": 30,
                "meanActualBeansPerSecond": statistics.mean(item["actualBeansPerSecond"] for item in manifest_rows),
            },
            "chapters": chapter_summaries,
        }
        (temporary / "selection_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if any(sha256_bytes((ONLINE_DIR / name).read_bytes()) != digest for name, digest in protected_hashes.items()):
            raise ValueError("protected online ZT 1-5 changed during generation")
        temporary.rename(OUTPUT_DIR)
    except Exception:
        for path in sorted(temporary.glob("*")):
            path.unlink()
        temporary.rmdir()
        raise
    print(json.dumps({"output": str(OUTPUT_DIR), "report": report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
