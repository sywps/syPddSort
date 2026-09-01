#!/usr/bin/env python3
"""Analyze the current 300-level mainline corpus with reproducible design metrics."""

from __future__ import annotations

import hashlib
import json
import math
import statistics
from collections import Counter, deque
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEVEL_DIR = ROOT / "assets" / "LevelData"
OUTPUT = ROOT / "tools" / "generated_levels" / "live_300_design_analysis.json"
DIRS4 = ((-1, 0), (1, 0), (0, -1), (0, 1))


def quantile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def normalized(value: float, values: list[float]) -> float:
    low, high = min(values), max(values)
    return 0.0 if math.isclose(low, high) else (value - low) / (high - low)


def grid_metrics(target: list[list[int]], initial: list[list[int]]) -> dict:
    cells = [(row, col) for row, line in enumerate(target) for col, value in enumerate(line) if value > 0]
    colors = sorted({target[row][col] for row, col in cells})
    displaced = sum(target[row][col] != initial[row][col] for row, col in cells)
    same_edges = 0
    edges = 0
    singletons = 0
    visited: set[tuple[int, int]] = set()
    component_sizes: list[int] = []
    for row, col in cells:
        same_neighbors = 0
        for row_delta, col_delta in DIRS4:
            next_row, next_col = row + row_delta, col + col_delta
            if not (0 <= next_row < len(target) and 0 <= next_col < len(target[0])):
                continue
            if target[next_row][next_col] <= 0:
                continue
            if row_delta > 0 or col_delta > 0:
                edges += 1
                same_edges += initial[row][col] == initial[next_row][next_col]
            same_neighbors += initial[row][col] == initial[next_row][next_col]
        singletons += same_neighbors == 0
        if (row, col) in visited:
            continue
        color = initial[row][col]
        queue = deque([(row, col)])
        visited.add((row, col))
        size = 0
        while queue:
            current_row, current_col = queue.popleft()
            size += 1
            for row_delta, col_delta in DIRS4:
                next_row, next_col = current_row + row_delta, current_col + col_delta
                if not (0 <= next_row < len(target) and 0 <= next_col < len(target[0])):
                    continue
                key = (next_row, next_col)
                if key in visited or target[next_row][next_col] <= 0 or initial[next_row][next_col] != color:
                    continue
                visited.add(key)
                queue.append(key)
        component_sizes.append(size)
    filled = len(cells)
    return {
        "displacement": displaced / filled,
        "sameNeighborRatio": same_edges / max(1, edges),
        "singletonRatio": singletons / filled,
        "componentsPerColor": len(component_sizes) / max(1, len(colors)),
        "largestCluster": max(component_sizes, default=0),
    }


def canonical_hashes(grid: list[list[int]]) -> tuple[str, str]:
    shape = "/".join("".join("1" if value > 0 else "0" for value in row) for row in grid)
    color_map: dict[int, int] = {}
    next_color = 1
    canonical = []
    for row in grid:
        canonical_row = []
        for value in row:
            if value <= 0:
                canonical_row.append(0)
                continue
            if value not in color_map:
                color_map[value] = next_color
                next_color += 1
            canonical_row.append(color_map[value])
        canonical.append(canonical_row)
    pattern = json.dumps(canonical, separators=(",", ":"))
    return hashlib.sha1(shape.encode()).hexdigest()[:12], hashlib.sha1(pattern.encode()).hexdigest()[:12]


def level_metrics(level_id: int) -> dict:
    level = json.loads((LEVEL_DIR / f"level_{level_id}.json").read_text(encoding="utf-8"))
    if int(level["levelId"]) != level_id:
        raise ValueError(f"level {level_id} internal ID mismatch")
    target = level["correctColorArr"]
    initial = level["initRandomColorArr"]
    filled = int(level["slotTotalCount"])
    colors = Counter(value for row in target for value in row if value > 0)
    shape_hash, pattern_hash = canonical_hashes(target)
    result = {
        "id": level_id,
        "width": int(level["boardWidth"]),
        "height": int(level["boardHeight"]),
        "filled": filled,
        "colors": len(colors),
        "time": int(level["timeLimit"]),
        "beansPerSecond": filled / max(1, int(level["timeLimit"])),
        "density": filled / (int(level["boardWidth"]) * int(level["boardHeight"])),
        "capacityWaves": filled / max(1, int(level["conveyorCapacity"])),
        "largestColorShare": max(colors.values()) / filled,
        "smallestColorCount": min(colors.values()),
        "shapeHash": shape_hash,
        "patternHash": pattern_hash,
    }
    result.update(grid_metrics(target, initial))
    return result


def average(rows: list[dict], key: str) -> float:
    return statistics.mean(row[key] for row in rows)


def pearson(left: list[float], right: list[float]) -> float:
    left_mean, right_mean = statistics.mean(left), statistics.mean(right)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left, right))
    denominator = math.sqrt(sum((a - left_mean) ** 2 for a in left) * sum((b - right_mean) ** 2 for b in right))
    return 0.0 if math.isclose(denominator, 0.0) else numerator / denominator


def main() -> None:
    levels = [level_metrics(level_id) for level_id in range(1, 301)]
    dimensions = {
        "filled": ([math.log1p(row["filled"]) for row in levels], 0.27),
        "colors": ([row["colors"] for row in levels], 0.16),
        "beansPerSecond": ([row["beansPerSecond"] for row in levels], 0.24),
        "componentsPerColor": ([row["componentsPerColor"] for row in levels], 0.18),
        "singletonRatio": ([row["singletonRatio"] for row in levels], 0.08),
        "capacityWaves": ([row["capacityWaves"] for row in levels], 0.07),
    }
    for index, row in enumerate(levels):
        row["configDifficulty"] = 100 * sum(
            normalized(values[index], values) * weight for values, weight in dimensions.values()
        )

    segments = [(1, 10), (11, 30), (31, 60), (61, 100), (101, 150), (151, 200), (201, 250), (251, 300)]
    segment_rows = []
    for start, end in segments:
        rows = levels[start - 1:end]
        segment_rows.append({
            "range": f"{start}-{end}",
            **{f"mean{key[0].upper()}{key[1:]}": round(average(rows, key), 4) for key in (
                "filled", "colors", "time", "beansPerSecond", "density", "sameNeighborRatio",
                "singletonRatio", "componentsPerColor", "capacityWaves", "configDifficulty",
            )},
        })

    shape_groups: dict[str, list[int]] = {}
    pattern_groups: dict[str, list[int]] = {}
    for row in levels:
        shape_groups.setdefault(row["shapeHash"], []).append(row["id"])
        pattern_groups.setdefault(row["patternHash"], []).append(row["id"])
    jumps = [{
        "from": index,
        "to": index + 1,
        "delta": levels[index]["configDifficulty"] - levels[index - 1]["configDifficulty"],
        "fromScore": levels[index - 1]["configDifficulty"],
        "toScore": levels[index]["configDifficulty"],
    } for index in range(1, 300)]
    summary = {
        "count": 300,
        "means": {key: round(average(levels, key), 4) for key in (
            "filled", "colors", "time", "beansPerSecond", "density", "displacement",
            "sameNeighborRatio", "singletonRatio", "componentsPerColor", "largestCluster",
            "capacityWaves", "largestColorShare", "configDifficulty",
        )},
        "medians": {key: round(statistics.median(row[key] for row in levels), 4) for key in (
            "filled", "colors", "time", "beansPerSecond", "sameNeighborRatio",
            "singletonRatio", "componentsPerColor", "configDifficulty",
        )},
        "ranges": {key: [round(min(row[key] for row in levels), 4), round(max(row[key] for row in levels), 4)] for key in (
            "filled", "colors", "time", "beansPerSecond", "density", "componentsPerColor", "configDifficulty",
        )},
        "timeCounts": dict(sorted(Counter(row["time"] for row in levels).items())),
        "colorCounts": dict(sorted(Counter(row["colors"] for row in levels).items())),
        "levelIdCorrelations": {key: round(pearson([row["id"] for row in levels], [row[key] for row in levels]), 4) for key in (
            "filled", "colors", "time", "beansPerSecond", "componentsPerColor", "configDifficulty",
        )},
        "fullBoardCount": sum(math.isclose(row["density"], 1.0) for row in levels),
        "fullyDisplacedCount": sum(math.isclose(row["displacement"], 1.0) for row in levels),
        "uniqueShapes": len(shape_groups),
        "uniquePatterns": len(pattern_groups),
        "repeatedShapeGroups": sorted((ids for ids in shape_groups.values() if len(ids) > 1), key=lambda ids: (-len(ids), ids[0])),
        "repeatedPatternGroups": sorted((ids for ids in pattern_groups.values() if len(ids) > 1), key=lambda ids: (-len(ids), ids[0])),
        "topPeaks": [{key: row[key] for key in ("id", "configDifficulty", "filled", "colors", "time", "beansPerSecond", "componentsPerColor")} for row in sorted(levels, key=lambda row: row["configDifficulty"], reverse=True)[:15]],
        "largestPositiveJumps": sorted(jumps, key=lambda row: row["delta"], reverse=True)[:15],
        "largestNegativeJumps": sorted(jumps, key=lambda row: row["delta"])[:15],
        "segments": segment_rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"methodVersion": 1, "summary": summary, "levels": levels}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
