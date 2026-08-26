#!/usr/bin/env python3
"""Convert extracted DBT gameplay data to the current online level contract."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LEVEL_CONFIG_PATH = ROOT / "assets" / "Scripts" / "Core" / "LevelConfig.ts"
CONVEYOR_CAPACITY = 60
ONLINE_KEYS = (
    "levelId",
    "boardWidth",
    "boardHeight",
    "timeLimit",
    "slotTotalCount",
    "conveyorCapacity",
    "correctColorArr",
    "initRandomColorArr",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    return parser.parse_args()


def load_online_palette() -> dict[int, str]:
    source = LEVEL_CONFIG_PATH.read_text(encoding="utf-8")
    match = re.search(
        r"export const COLOR_HEX: Record<number, string> = \{(.*?)\};",
        source,
        re.DOTALL,
    )
    if not match:
        raise ValueError(f"Unable to read COLOR_HEX from {LEVEL_CONFIG_PATH}")
    palette = {
        int(color_id): hex_value.upper()
        for color_id, hex_value in re.findall(r"(\d+):\s*'(#(?:[0-9A-Fa-f]{6}))'", match.group(1))
    }
    if sorted(palette) != list(range(1, 21)):
        raise ValueError("Online palette must contain exactly color IDs 1 through 20")
    return palette


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    normalized = value.strip().lstrip("#")
    if len(normalized) != 6:
        raise ValueError(f"Invalid color value: {value}")
    return tuple(int(normalized[index:index + 2], 16) for index in (0, 2, 4))


def weighted_rgb_distance(left: str, right: str) -> float:
    a = hex_to_rgb(left)
    b = hex_to_rgb(right)
    red_mean = (a[0] + b[0]) / 2.0
    red_delta = a[0] - b[0]
    green_delta = a[1] - b[1]
    blue_delta = a[2] - b[2]
    return (
        (2.0 + red_mean / 256.0) * red_delta * red_delta
        + 4.0 * green_delta * green_delta
        + (2.0 + (255.0 - red_mean) / 256.0) * blue_delta * blue_delta
    )


def minimum_cost_assignment(costs: list[list[float]]) -> list[int]:
    row_count = len(costs)
    column_count = len(costs[0]) if costs else 0
    if row_count == 0 or row_count > column_count:
        raise ValueError("Color assignment requires 1..20 source colors")
    u = [0.0] * (row_count + 1)
    v = [0.0] * (column_count + 1)
    matched_row = [0] * (column_count + 1)
    previous_column = [0] * (column_count + 1)
    for row in range(1, row_count + 1):
        matched_row[0] = row
        column = 0
        min_value = [float("inf")] * (column_count + 1)
        used = [False] * (column_count + 1)
        while True:
            used[column] = True
            current_row = matched_row[column]
            delta = float("inf")
            next_column = 0
            for candidate in range(1, column_count + 1):
                if used[candidate]:
                    continue
                current = costs[current_row - 1][candidate - 1] - u[current_row] - v[candidate]
                if current < min_value[candidate]:
                    min_value[candidate] = current
                    previous_column[candidate] = column
                if min_value[candidate] < delta:
                    delta = min_value[candidate]
                    next_column = candidate
            for candidate in range(column_count + 1):
                if used[candidate]:
                    u[matched_row[candidate]] += delta
                    v[candidate] -= delta
                else:
                    min_value[candidate] -= delta
            column = next_column
            if matched_row[column] == 0:
                break
        while True:
            previous = previous_column[column]
            matched_row[column] = matched_row[previous]
            column = previous
            if column == 0:
                break
    assignment = [-1] * row_count
    for column in range(1, column_count + 1):
        if matched_row[column] > 0:
            assignment[matched_row[column] - 1] = column - 1
    if any(column < 0 for column in assignment):
        raise ValueError("Unable to assign every source color")
    return assignment


def build_color_mapping(level: dict[str, Any], palette: dict[int, str]) -> dict[int, int]:
    source_colors = sorted(level["colors"], key=lambda item: int(item["id"]))
    online_ids = sorted(palette)
    costs = [
        [weighted_rgb_distance(str(source["mat_color"]), palette[online_id]) for online_id in online_ids]
        for source in source_colors
    ]
    assigned_columns = minimum_cost_assignment(costs)
    return {
        int(source["id"]): online_ids[column]
        for source, column in zip(source_colors, assigned_columns)
    }


def build_grid(level: dict[str, Any], color_key: str, mapping: dict[int, int]) -> list[list[int]]:
    map_data = level["map"]
    bounds = map_data["bounds"]
    rows = int(map_data["rows"])
    cols = int(map_data["cols"])
    row_start = int(bounds["row_start"])
    col_start = int(bounds["col_start"])
    grid = [[0 for _ in range(cols)] for _ in range(rows)]
    occupied: set[tuple[int, int]] = set()
    for cell in map_data["cells"]:
        source_row = int(cell["row"]) - row_start
        row = rows - 1 - source_row
        col = int(cell["col"]) - col_start
        if not 0 <= row < rows or not 0 <= col < cols:
            raise ValueError(f"level {level['level_id']} contains a cell outside map bounds")
        if (row, col) in occupied:
            raise ValueError(f"level {level['level_id']} contains duplicate cell ({row}, {col})")
        occupied.add((row, col))
        source_color = int(cell[color_key])
        if source_color not in mapping:
            raise ValueError(f"level {level['level_id']} has unmapped color {source_color}")
        grid[row][col] = mapping[source_color]
    return grid


def inventory(grid: list[list[int]]) -> Counter[int]:
    return Counter(color for row in grid for color in row if color > 0)


def convert_level(level: dict[str, Any], palette: dict[int, str]) -> dict[str, Any]:
    mapping = build_color_mapping(level, palette)
    correct = build_grid(level, "target_color_id", mapping)
    initial = build_grid(level, "sphere_color_id", mapping)
    if inventory(correct) != inventory(initial):
        raise ValueError(f"level {level['level_id']} target and initial inventories differ")
    if len(inventory(correct)) != len(level["colors"]):
        raise ValueError(f"level {level['level_id']} color identities collapsed during conversion")
    result = {
        "levelId": int(level["level_id"]),
        "boardWidth": int(level["map"]["cols"]),
        "boardHeight": int(level["map"]["rows"]),
        "timeLimit": int(level["limit_seconds"]),
        "slotTotalCount": int(level["target_count"]),
        "conveyorCapacity": CONVEYOR_CAPACITY,
        "correctColorArr": correct,
        "initRandomColorArr": initial,
    }
    if tuple(result) != ONLINE_KEYS:
        raise AssertionError("online field order changed")
    return result


def main() -> None:
    args = parse_args()
    payload = json.loads(args.source.read_text(encoding="utf-8"))
    levels = payload.get("levels")
    if not isinstance(levels, list) or len(levels) != int(payload.get("level_count", -1)):
        raise ValueError("source levels array does not match level_count")
    ids = [int(level["level_id"]) for level in levels]
    if len(ids) != len(set(ids)):
        raise ValueError("source contains duplicate level IDs")
    palette = load_online_palette()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for level in sorted(levels, key=lambda item: int(item["level_id"])):
        converted = convert_level(level, palette)
        target = args.output_dir / f"level_{converted['levelId']}.json"
        target.write_text(json.dumps(converted, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
    print(f"Converted {len(levels)} DBT levels to {args.output_dir}")


if __name__ == "__main__":
    main()
