#!/usr/bin/env python3
"""Compute reproducible design metrics for the 182 converted DBT levels."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from collections import Counter, deque
from pathlib import Path
from typing import Any


DIRS8 = tuple(
    (row_delta, col_delta)
    for row_delta in (-1, 0, 1)
    for col_delta in (-1, 0, 1)
    if row_delta or col_delta
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("level_dir", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def quantile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def minmax(value: float, values: list[float]) -> float:
    low = min(values)
    high = max(values)
    return 0.0 if math.isclose(low, high) else (value - low) / (high - low)


def group_sizes(grid: list[list[int]]) -> list[int]:
    height = len(grid)
    width = len(grid[0]) if grid else 0
    visited: set[tuple[int, int]] = set()
    sizes: list[int] = []
    for row in range(height):
        for col in range(width):
            color = grid[row][col]
            if color <= 0 or (row, col) in visited:
                continue
            queue = deque([(row, col)])
            visited.add((row, col))
            size = 0
            while queue:
                current_row, current_col = queue.popleft()
                size += 1
                for row_delta, col_delta in DIRS8:
                    next_row = current_row + row_delta
                    next_col = current_col + col_delta
                    if not 0 <= next_row < height or not 0 <= next_col < width:
                        continue
                    if (next_row, next_col) in visited or grid[next_row][next_col] != color:
                        continue
                    visited.add((next_row, next_col))
                    queue.append((next_row, next_col))
            sizes.append(size)
    return sizes


def metric_for_level(level: dict[str, Any]) -> dict[str, Any]:
    correct = level["correctColorArr"]
    initial = level["initRandomColorArr"]
    filled = int(level["slotTotalCount"])
    colors = sorted({color for row in correct for color in row if color > 0})
    initial_groups = group_sizes(initial)
    target_groups = group_sizes(correct)
    locked = sum(
        1
        for row in range(level["boardHeight"])
        for col in range(level["boardWidth"])
        if correct[row][col] > 0 and correct[row][col] == initial[row][col]
    )
    mismatch = 0.0 if filled == 0 else 1.0 - locked / filled
    density = filled / (level["boardWidth"] * level["boardHeight"])
    fragmentation = len(initial_groups) / max(1, len(colors))
    shape_body = "/".join("".join("1" if color > 0 else "0" for color in row) for row in correct)
    canonical_colors: dict[int, int] = {}
    next_color = 1
    canonical_rows = []
    for row in correct:
        canonical_row = []
        for color in row:
            if color <= 0:
                canonical_row.append(0)
                continue
            if color not in canonical_colors:
                canonical_colors[color] = next_color
                next_color += 1
            canonical_row.append(canonical_colors[color])
        canonical_rows.append(canonical_row)
    pattern_body = json.dumps(canonical_rows, separators=(",", ":"))
    return {
        "id": int(level["levelId"]),
        "width": int(level["boardWidth"]),
        "height": int(level["boardHeight"]),
        "filled": filled,
        "colors": len(colors),
        "time": int(level["timeLimit"]),
        "secondsPerBean": round(level["timeLimit"] / max(1, filled), 4),
        "beansPerSecond": round(filled / max(1, level["timeLimit"]), 4),
        "density": round(density, 4),
        "mismatch": round(mismatch, 4),
        "locked": locked,
        "initialGroups": len(initial_groups),
        "targetGroups": len(target_groups),
        "fragmentation": round(fragmentation, 4),
        "largestInitialGroup": max(initial_groups, default=0),
        "meanInitialGroup": round(statistics.mean(initial_groups), 2) if initial_groups else 0.0,
        "capacityWaves": round(filled / max(1, level["conveyorCapacity"]), 2),
        "shapeHash": hashlib.sha1(shape_body.encode("utf-8")).hexdigest()[:12],
        "patternHash": hashlib.sha1(pattern_body.encode("utf-8")).hexdigest()[:12],
    }


def add_scores(metrics: list[dict[str, Any]], hard_by_id: dict[int, int]) -> None:
    filled_values = [math.log1p(item["filled"]) for item in metrics]
    color_values = [float(item["colors"]) for item in metrics]
    pressure_values = [float(item["beansPerSecond"]) for item in metrics]
    fragment_values = [float(item["fragmentation"]) for item in metrics]
    mismatch_values = [float(item["mismatch"]) for item in metrics]
    density_values = [float(item["density"]) for item in metrics]
    dimensions = {
        "体量": (filled_values, 0.24),
        "辨色": (color_values, 0.18),
        "时间": (pressure_values, 0.18),
        "碎片": (fragment_values, 0.18),
        "乱序": (mismatch_values, 0.12),
    }
    for index, item in enumerate(metrics):
        dimension_scores = {
            name: minmax(values[index], values)
            for name, (values, _weight) in dimensions.items()
        }
        weighted = sum(
            dimension_scores[name] * weight
            for name, (_values, weight) in dimensions.items()
        )
        hard = 1 if hard_by_id.get(item["id"], 0) else 0
        weighted += hard * 0.10
        item["hard"] = hard
        item["difficulty"] = round(weighted * 100.0, 1)
        primary_scores = {name: value for name, value in dimension_scores.items() if name != "乱序"}
        item["dominantPressure"] = max(primary_scores, key=primary_scores.get)
        tags = [name for name, value in dimension_scores.items() if value >= 0.72]
        if hard:
            tags.append("原始Hard")
        item["tags"] = tags or ["常规节奏"]
    filled_low = quantile([item["filled"] for item in metrics], 0.20)
    fragment_high = quantile(fragment_values, 0.80)
    density_low = quantile(density_values, 0.20)
    for item in metrics:
        if item["id"] <= 2:
            item["category"] = "引导小局"
        elif item["filled"] >= 1200 and math.isclose(item["density"], 1.0):
            item["category"] = "巨幅满盘"
        elif item["filled"] >= 1200:
            item["category"] = "巨幅图案"
        elif item["colors"] >= 12:
            item["category"] = "多色辨识"
        elif item["fragmentation"] >= fragment_high:
            item["category"] = "碎片调度"
        elif item["density"] <= density_low:
            item["category"] = "稀疏轮廓"
        elif item["filled"] <= filled_low:
            item["category"] = "轻量恢复"
        else:
            item["category"] = "标准图案"


def summarize(metrics: list[dict[str, Any]]) -> dict[str, Any]:
    difficulty_values = [item["difficulty"] for item in metrics]
    score_q25 = quantile(difficulty_values, 0.25)
    score_q70 = quantile(difficulty_values, 0.70)
    score_q90 = quantile(difficulty_values, 0.90)
    for item in metrics:
        score = item["difficulty"]
        item["tier"] = "舒缓" if score <= score_q25 else "稳定" if score <= score_q70 else "高压" if score <= score_q90 else "尖峰"
    window = 7
    moving = []
    for index in range(len(metrics)):
        start = max(0, index - window // 2)
        end = min(len(metrics), index + window // 2 + 1)
        moving.append(round(statistics.mean(item["difficulty"] for item in metrics[start:end]), 2))
    peaks = sorted(metrics, key=lambda item: item["difficulty"], reverse=True)[:12]
    relief = sorted(metrics[20:], key=lambda item: item["difficulty"])[:10]
    jumps = sorted(
        (
            {
                "id": metrics[index]["id"],
                "delta": round(metrics[index]["difficulty"] - metrics[index - 1]["difficulty"], 1),
            }
            for index in range(1, len(metrics))
        ),
        key=lambda item: abs(item["delta"]),
        reverse=True,
    )[:12]
    phase_ranges = [(1, 15), (16, 40), (41, 80), (81, 120), (121, 160), (161, 182)]
    phases = []
    for start, end in phase_ranges:
        rows = metrics[start - 1:end]
        phases.append({
            "range": f"{start}–{end}",
            "meanDifficulty": round(statistics.mean(item["difficulty"] for item in rows), 1),
            "meanFilled": round(statistics.mean(item["filled"] for item in rows), 1),
            "meanColors": round(statistics.mean(item["colors"] for item in rows), 1),
            "meanSecondsPerBean": round(statistics.mean(item["secondsPerBean"] for item in rows), 2),
            "hardCount": sum(item["hard"] for item in rows),
        })
    shape_groups = [ids for ids in (
        [item["id"] for item in metrics if item["shapeHash"] == shape_hash]
        for shape_hash in {item["shapeHash"] for item in metrics}
    ) if len(ids) > 1]
    pattern_groups = [ids for ids in (
        [item["id"] for item in metrics if item["patternHash"] == pattern_hash]
        for pattern_hash in {item["patternHash"] for item in metrics}
    ) if len(ids) > 1]
    return {
        "count": len(metrics),
        "difficultyMean": round(statistics.mean(difficulty_values), 1),
        "difficultyMedian": round(statistics.median(difficulty_values), 1),
        "filledRange": [min(item["filled"] for item in metrics), max(item["filled"] for item in metrics)],
        "colorRange": [min(item["colors"] for item in metrics), max(item["colors"] for item in metrics)],
        "hardCount": sum(item["hard"] for item in metrics),
        "tierCounts": dict(Counter(item["tier"] for item in metrics)),
        "pressureCounts": dict(Counter(item["dominantPressure"] for item in metrics)),
        "categoryCounts": dict(Counter(item["category"] for item in metrics)),
        "timeCounts": dict(sorted(Counter(item["time"] for item in metrics).items())),
        "fullBoardCount": sum(item["filled"] == item["width"] * item["height"] for item in metrics),
        "shapeRepeatGroups": sorted(shape_groups, key=lambda ids: (-len(ids), ids[0]))[:12],
        "patternRepeatGroups": sorted(pattern_groups, key=lambda ids: (-len(ids), ids[0]))[:12],
        "mismatchMedian": round(statistics.median(item["mismatch"] for item in metrics), 3),
        "fullyDisplacedCount": sum(math.isclose(item["mismatch"], 1.0) for item in metrics),
        "fragmentationMedian": round(statistics.median(item["fragmentation"] for item in metrics), 2),
        "movingDifficulty": moving,
        "peaks": [{key: item[key] for key in ("id", "difficulty", "filled", "colors", "secondsPerBean", "dominantPressure", "tags")} for item in peaks],
        "relief": [{key: item[key] for key in ("id", "difficulty", "filled", "colors", "secondsPerBean", "dominantPressure")} for item in relief],
        "jumps": jumps,
        "phases": phases,
    }


def main() -> None:
    args = parse_args()
    aggregate = json.loads((args.level_dir / "levels_original_1_182_gameplay_v2.json").read_text(encoding="utf-8"))
    hard_by_id = {int(level["level_id"]): int(level.get("hard", 0)) for level in aggregate["levels"]}
    metrics = [
        metric_for_level(json.loads((args.level_dir / f"level_{level_id}.json").read_text(encoding="utf-8")))
        for level_id in range(1, int(aggregate["level_count"]) + 1)
    ]
    add_scores(metrics, hard_by_id)
    summary = summarize(metrics)
    result = {"methodVersion": 1, "summary": summary, "levels": metrics}
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
