#!/usr/bin/env python3
"""Analyze historical main levels for a non-mutating 200-level ZT selection."""

from __future__ import annotations

import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict, deque
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tools" / "online-levels-2026-08-01"
ONLINE_DIR = ROOT / "assets" / "LevelData"
OUTPUT = ROOT / "tools" / "generated_levels" / "zt_200_candidate_analysis.json"
DIRS4 = ((-1, 0), (1, 0), (0, -1), (0, 1))
PLACED_THRESHOLDS = (0.03, 0.05, 0.08, 0.12, 0.15)


def load_level(path: Path) -> dict:
    level = json.loads(path.read_text(encoding="utf-8"))
    target = level.get("correctColorArr")
    initial = level.get("initRandomColorArr")
    if not isinstance(target, list) or not target or not isinstance(initial, list):
        raise ValueError(f"{path}: missing color arrays")
    width = len(target[0])
    if width == 0 or any(not isinstance(row, list) or len(row) != width for row in target):
        raise ValueError(f"{path}: target is not rectangular")
    if len(initial) != len(target) or any(not isinstance(row, list) or len(row) != width for row in initial):
        raise ValueError(f"{path}: initial dimensions differ from target")
    return level


def crop(grid: list[list[int]]) -> list[list[int]]:
    cells = [(r, c) for r, row in enumerate(grid) for c, value in enumerate(row) if value > 0]
    if not cells:
        raise ValueError("board has no effective beans")
    r0, r1 = min(r for r, _ in cells), max(r for r, _ in cells)
    c0, c1 = min(c for _, c in cells), max(c for _, c in cells)
    return [row[c0:c1 + 1] for row in grid[r0:r1 + 1]]


def transforms(grid: list[list[int]]) -> list[list[list[int]]]:
    horizontal = [list(reversed(row)) for row in grid]
    vertical = list(reversed(grid))
    rotated = [list(reversed(row)) for row in reversed(grid)]
    return [grid, horizontal, vertical, rotated]


def canonical(grid: list[list[int]], colors: bool = True) -> str:
    mapping: dict[int, int] = {}
    next_id = 1
    rows = []
    for row in grid:
        values = []
        for value in row:
            if value <= 0:
                values.append(0)
            elif not colors:
                values.append(1)
            else:
                if value not in mapping:
                    mapping[value] = next_id
                    next_id += 1
                values.append(mapping[value])
        rows.append(values)
    return json.dumps(rows, separators=(",", ":"))


def transform_signatures(grid: list[list[int]], colors: bool = True) -> set[str]:
    return {hashlib.sha256(canonical(item, colors).encode()).hexdigest() for item in transforms(crop(grid))}


def shape_and_color_similarity(left: list[list[int]], right: list[list[int]]) -> tuple[float, float]:
    if len(left) != len(right) or len(left[0]) != len(right[0]):
        return 0.0, 0.0
    union = 0
    overlap = 0
    pairs: Counter[tuple[int, int]] = Counter()
    for r in range(len(left)):
        for c in range(len(left[0])):
            a, b = left[r][c], right[r][c]
            if a > 0 or b > 0:
                union += 1
            if a > 0 and b > 0:
                overlap += 1
                pairs[(a, b)] += 1
    shape_similarity = overlap / max(1, union)
    used_left: set[int] = set()
    used_right: set[int] = set()
    matched = 0
    for (a, b), count in sorted(pairs.items(), key=lambda item: (-item[1], item[0])):
        if a in used_left or b in used_right:
            continue
        used_left.add(a)
        used_right.add(b)
        matched += count
    return shape_similarity, matched / max(1, union)


def initial_metrics(target: list[list[int]], initial: list[list[int]]) -> dict:
    cells = [(r, c) for r, row in enumerate(target) for c, value in enumerate(row) if value > 0]
    placed = sum(target[r][c] == initial[r][c] for r, c in cells)
    colors = sorted({target[r][c] for r, c in cells})
    same_edges = 0
    edges = 0
    singletons = 0
    visited: set[tuple[int, int]] = set()
    component_sizes: list[int] = []
    for r, c in cells:
        same_neighbors = 0
        for dr, dc in DIRS4:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < len(target) and 0 <= nc < len(target[0])) or target[nr][nc] <= 0:
                continue
            if dr > 0 or dc > 0:
                edges += 1
                same_edges += initial[r][c] == initial[nr][nc]
            same_neighbors += initial[r][c] == initial[nr][nc]
        singletons += same_neighbors == 0
        if (r, c) in visited:
            continue
        color = initial[r][c]
        queue = deque([(r, c)])
        visited.add((r, c))
        size = 0
        while queue:
            cr, cc = queue.popleft()
            size += 1
            for dr, dc in DIRS4:
                nr, nc = cr + dr, cc + dc
                key = (nr, nc)
                if not (0 <= nr < len(target) and 0 <= nc < len(target[0])):
                    continue
                if key in visited or target[nr][nc] <= 0 or initial[nr][nc] != color:
                    continue
                visited.add(key)
                queue.append(key)
        component_sizes.append(size)
    beans = len(cells)
    return {
        "beanCount": beans,
        "colorCount": len(colors),
        "placedBeanCount": placed,
        "placedBeanRatio": placed / beans,
        "misplacedBeanCount": beans - placed,
        "sameColorAdjacency": same_edges / max(1, edges),
        "singletonRatio": singletons / beans,
        "componentsPerColor": len(component_sizes) / max(1, len(colors)),
        "largestInitialBlock": max(component_sizes, default=0),
    }


def quantile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower, upper = math.floor(position), math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def selection_summary(rows: list[dict]) -> dict:
    return {
        "count": len(rows),
        "beansGe1000": sum(row["beanCount"] >= 1000 for row in rows),
        "beansGe900": sum(row["beanCount"] >= 900 for row in rows),
        "beansGe800": sum(row["beanCount"] >= 800 for row in rows),
        "meanBeanCount": statistics.mean(row["beanCount"] for row in rows),
        "minBeanCount": min(row["beanCount"] for row in rows),
        "placedBelow8Pct": sum(row["placedBeanRatio"] < 0.08 for row in rows),
        "placedAbove12Pct": sum(row["placedBeanRatio"] > 0.12 for row in rows),
        "meanPlacedBeanRatio": statistics.mean(row["placedBeanRatio"] for row in rows),
        "maxPlacedBeanRatio": max(row["placedBeanRatio"] for row in rows),
    }


def online_boards() -> list[dict]:
    paths = sorted(ONLINE_DIR.glob("level_*.json")) + sorted(ONLINE_DIR.glob("zt_level_*.json"))
    boards = []
    for path in paths:
        target = load_level(path)["correctColorArr"]
        cropped = crop(target)
        boards.append({
            "filename": path.name,
            "grid": cropped,
            "beanCount": sum(value > 0 for row in cropped for value in row),
            "patternSignatures": transform_signatures(cropped),
            "shapeSignatures": transform_signatures(cropped, colors=False),
        })
    return boards


def duplicate_metrics(target: list[list[int]], online: list[dict], dimension_index: dict) -> dict:
    cropped = crop(target)
    pattern_signatures = transform_signatures(cropped)
    shape_signatures = transform_signatures(cropped, colors=False)
    exact_pattern = next((item["filename"] for item in online if pattern_signatures & item["patternSignatures"]), None)
    exact_shape = next((item["filename"] for item in online if shape_signatures & item["shapeSignatures"]), None)
    nearest_file = None
    nearest_shape = 0.0
    nearest_color = 0.0
    for variant in transforms(cropped):
        for item in dimension_index.get((len(variant), len(variant[0])), []):
            if abs(item["beanCount"] - sum(value > 0 for row in variant for value in row)) > max(2, item["beanCount"] * 0.05):
                continue
            shape_similarity, color_similarity = shape_and_color_similarity(variant, item["grid"])
            if (shape_similarity, color_similarity) > (nearest_shape, nearest_color):
                nearest_file = item["filename"]
                nearest_shape = shape_similarity
                nearest_color = color_similarity
    return {
        "exactOnlinePattern": exact_pattern,
        "exactOnlineShape": exact_shape,
        "nearestOnlineFile": nearest_file,
        "outlineSimilarity": nearest_shape,
        "colorLayoutSimilarity": nearest_color,
        "highSimilarityOnline": nearest_shape >= 0.98 and nearest_color >= 0.95,
    }


def main() -> None:
    online = online_boards()
    dimension_index: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for item in online:
        dimension_index[(len(item["grid"]), len(item["grid"][0]))].append(item)
    rows = []
    for level_id in range(1, 1644):
        path = SOURCE_DIR / f"level_{level_id}.json"
        level = load_level(path)
        target = level["correctColorArr"]
        initial = level["initRandomColorArr"]
        metrics = initial_metrics(target, initial)
        metrics.update(duplicate_metrics(target, online, dimension_index))
        metrics.update({
            "sourceLevelId": level_id,
            "sourceFilename": path.name,
            "width": len(target[0]),
            "height": len(target),
            "sourcePatternKey": min(transform_signatures(target)),
        })
        rows.append(metrics)

    strict_unique = [row for row in rows if not row["exactOnlinePattern"] and not row["highSimilarityOnline"]]
    threshold_counts = {}
    for threshold in PLACED_THRESHOLDS:
        key = f"le{int(threshold * 100):02d}pct"
        threshold_counts[key] = {
            "all": sum(row["placedBeanRatio"] <= threshold for row in rows),
            "beansGe1000": sum(row["beanCount"] >= 1000 and row["placedBeanRatio"] <= threshold for row in rows),
            "uniqueBeansGe1000": sum(row["beanCount"] >= 1000 and row["placedBeanRatio"] <= threshold for row in strict_unique),
        }
    eligible = [row for row in strict_unique if row["beanCount"] >= 1000 and row["placedBeanRatio"] <= 0.12]
    eligible.sort(key=lambda row: (row["placedBeanRatio"], -row["beanCount"], row["sourceLevelId"]))
    pool_matrix = {}
    for minimum_beans in (700, 800, 900, 1000):
        bean_key = f"ge{minimum_beans}"
        pool_matrix[bean_key] = {}
        for threshold in PLACED_THRESHOLDS:
            ratio_key = f"le{int(threshold * 100):02d}pct"
            pool = [
                row for row in strict_unique
                if row["beanCount"] >= minimum_beans and row["placedBeanRatio"] <= threshold
            ]
            pool_matrix[bean_key][ratio_key] = {
                "afterOnlineDedup": len(pool),
                "afterInternalExactDedup": len({row["sourcePatternKey"] for row in pool}),
            }
    unique_pool: dict[str, dict] = {}
    for row in strict_unique:
        if row["beanCount"] < 800 or row["placedBeanRatio"] > 0.15:
            continue
        previous = unique_pool.get(row["sourcePatternKey"])
        if previous is None or (row["placedBeanRatio"], -row["beanCount"], row["sourceLevelId"]) < (
            previous["placedBeanRatio"], -previous["beanCount"], previous["sourceLevelId"]
        ):
            unique_pool[row["sourcePatternKey"]] = row
    unique_rows = list(unique_pool.values())
    low_high_beans = [row for row in unique_rows if row["beanCount"] >= 1000 and row["placedBeanRatio"] < 0.08]
    high_high_beans = sorted(
        (row for row in unique_rows if row["beanCount"] >= 1000 and row["placedBeanRatio"] >= 0.08),
        key=lambda row: (row["placedBeanRatio"], -row["beanCount"], row["sourceLevelId"]),
    )[:40]
    selected_ids = {row["sourceLevelId"] for row in low_high_beans + high_high_beans}
    low_fillers = sorted(
        (row for row in unique_rows if row["placedBeanRatio"] < 0.08 and row["sourceLevelId"] not in selected_ids),
        key=lambda row: (row["placedBeanRatio"], -row["beanCount"], row["sourceLevelId"]),
    )
    feasibility_selection = low_high_beans + high_high_beans
    feasibility_selection += low_fillers[:200 - len(feasibility_selection)]
    conservative_selection = [row for row in unique_rows if row["placedBeanRatio"] <= 0.12]
    conservative_exceptions = sorted(
        (row for row in unique_rows if row["placedBeanRatio"] > 0.12),
        key=lambda row: (row["placedBeanRatio"], -row["beanCount"], row["sourceLevelId"]),
    )
    conservative_selection += conservative_exceptions[:200 - len(conservative_selection)]
    bean_values = [row["beanCount"] for row in rows]
    placed_values = [row["placedBeanRatio"] for row in rows]
    summary = {
        "sourceCount": len(rows),
        "onlineComparisonCount": len(online),
        "beanCount": {
            "mean": statistics.mean(bean_values),
            "median": statistics.median(bean_values),
            "p70": quantile(bean_values, 0.70),
            "p80": quantile(bean_values, 0.80),
            "p90": quantile(bean_values, 0.90),
            "max": max(bean_values),
            "ge800": sum(value >= 800 for value in bean_values),
            "ge900": sum(value >= 900 for value in bean_values),
            "ge1000": sum(value >= 1000 for value in bean_values),
        },
        "placedBeanRatio": {
            "mean": statistics.mean(placed_values),
            "median": statistics.median(placed_values),
            "min": min(placed_values),
            "max": max(placed_values),
        },
        "placedThresholdCounts": threshold_counts,
        "deduplication": {
            "exactPatternDuplicates": sum(bool(row["exactOnlinePattern"]) for row in rows),
            "exactShapeDuplicates": sum(bool(row["exactOnlineShape"]) for row in rows),
            "highSimilarityDuplicates": sum(row["highSimilarityOnline"] for row in rows),
            "strictUnique": len(strict_unique),
        },
        "strictEligibleCount": len(eligible),
        "canFill200Strict": len(eligible) >= 200,
        "candidatePoolMatrix": pool_matrix,
        "constraintFeasibilityExamples": {
            "placementFirst": selection_summary(conservative_selection),
            "beanCountFirst": selection_summary(feasibility_selection),
        },
    }
    result = {
        "methodVersion": 1,
        "scope": "analysis-only; no level files generated or modified",
        "definitions": {
            "placedBeanRatio": "positive target cells where initial equals target, divided by beanCount",
            "exactPatternDuplicate": "cropped target pattern equal after color-ID normalization and H/V/180 transforms",
            "highSimilarityDuplicate": "outlineSimilarity >= 0.98 and greedy colorLayoutSimilarity >= 0.95",
        },
        "recommendation": {
            "policy": "placementFirst",
            "reason": "Only 101 internally unique candidates meet >=1000 beans, <=12% placed, and online dedup; placementFirst fills 200 with all levels >=800 beans and only two minimal >12% exceptions.",
            "difficultyWeights": {
                "inversePlacedBeanRatio": 0.25,
                "colorCount": 0.15,
                "componentsPerColor": 0.12,
                "singletonRatio": 0.08,
                "outlineComplexity": 0.08,
                "holesAndBranches": 0.07,
                "shuffleComplexity": 0.10,
                "beanCount": 0.15,
            },
            "curve": [
                {"range": "zt_level_6-25", "role": "onboarding", "targetPercentile": "15-40"},
                {"range": "zt_level_26-65", "role": "growth", "targetPercentile": "25-60"},
                {"range": "zt_level_66-125", "role": "retention", "targetPercentile": "35-75"},
                {"range": "zt_level_126-175", "role": "advanced", "targetPercentile": "50-90"},
                {"range": "zt_level_176-205", "role": "mastery", "targetPercentile": "65-100"},
            ],
            "chapterRhythm": "Each 10-level chapter uses relief, normal, normal, growth, mini-peak, relief, growth, normal, growth, chapter-peak.",
        },
        "summary": summary,
        "strictEligibleCandidates": eligible,
        "placementFirstCandidates": conservative_selection,
        "beanCountFirstCandidates": feasibility_selection,
        "allCandidates": rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
