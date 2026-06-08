#!/usr/bin/env python3
"""Merge tiny target color islands, then minimally rebalance initial color counts."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

from optimize_semantic_level_rhythm import (
    Grid,
    Point,
    cleanup_small_target_components,
    color_counts,
    copy_grid,
    filled_count,
    neighbors,
)


class EmptyResult:
    actions: List[object] = []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cleanup target islands while preserving most of initRandomColorArr.")
    parser.add_argument("input")
    parser.add_argument("--output")
    parser.add_argument("--max-merge-component", type=int, default=3)
    parser.add_argument("--max-change-ratio", type=float, default=0.08)
    parser.add_argument("--max-color-drops", type=int, default=2)
    return parser.parse_args()


def read_json(path: Path) -> Dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")


def init_color_counts(init_grid: Grid) -> Dict[int, int]:
    counts: Counter[int] = Counter()
    for row in init_grid:
        for value in row:
            color = int(value)
            if color > 0:
                counts[color] += 1
    return dict(sorted(counts.items()))


def same_color_neighbor_count(grid: Grid, cell: Point, color: int) -> int:
    height = len(grid)
    width = len(grid[0])
    return sum(1 for nb in neighbors(cell, height, width) if grid[nb[0]][nb[1]] == color)


def choose_recolor_cells(init_grid: Grid, target_grid: Grid, from_color: int, to_color: int, amount: int) -> List[Point]:
    candidates: List[Point] = []
    for row in range(len(init_grid)):
        for col in range(len(init_grid[row])):
            if init_grid[row][col] == from_color:
                candidates.append((row, col))
    candidates.sort(
        key=lambda cell: (
            0 if target_grid[cell[0]][cell[1]] != to_color else 1,
            0 if target_grid[cell[0]][cell[1]] != from_color else 1,
            -same_color_neighbor_count(init_grid, cell, to_color),
            same_color_neighbor_count(init_grid, cell, from_color),
            cell[0],
            cell[1],
        )
    )
    if len(candidates) < amount:
        raise ValueError(f"not enough init cells to recolor from {from_color} to {to_color}")
    return candidates[:amount]


def rebalance_init_counts(init_grid: Grid, target_grid: Grid) -> Tuple[Grid, List[Dict[str, object]]]:
    grid = copy_grid(init_grid)
    current = Counter(init_color_counts(grid))
    target = Counter(color_counts(target_grid))
    surplus = Counter({color: current[color] - target[color] for color in current if current[color] > target[color]})
    deficit = Counter({color: target[color] - current[color] for color in target if target[color] > current[color]})
    history: List[Dict[str, object]] = []

    for to_color in sorted(deficit, key=lambda color: (-deficit[color], color)):
        needed = deficit[to_color]
        while needed > 0:
            from_options = [color for color, count in surplus.items() if count > 0 and color != to_color]
            if not from_options:
                raise ValueError("unable to rebalance init color counts")
            from_color = max(from_options, key=lambda color: (surplus[color], -color))
            amount = min(needed, surplus[from_color])
            cells = choose_recolor_cells(grid, target_grid, from_color, to_color, amount)
            for row, col in cells:
                grid[row][col] = to_color
            surplus[from_color] -= amount
            needed -= amount
            history.append({
                "fromColor": int(from_color),
                "toColor": int(to_color),
                "count": int(amount),
                "cells": [{"row": int(row), "col": int(col)} for row, col in cells],
            })

    if init_color_counts(grid) != color_counts(target_grid):
        raise ValueError("init color counts still do not match target counts")
    return grid, history


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path
    payload = read_json(input_path)
    original_target = payload["correctColorArr"]
    original_init = payload["initRandomColorArr"]
    cleaned_target, merge_history = cleanup_small_target_components(
        original=original_target,
        current=original_target,
        result=EmptyResult(),
        max_component_size=args.max_merge_component,
        max_change_ratio=args.max_change_ratio,
        max_color_drops=args.max_color_drops,
    )
    rebalanced_init, init_history = rebalance_init_counts(original_init, cleaned_target)
    updated = dict(payload)
    updated["correctColorArr"] = cleaned_target
    updated["initRandomColorArr"] = rebalanced_init
    updated["filledCellCount"] = filled_count(cleaned_target)
    updated["slotTotalCount"] = filled_count(cleaned_target)
    updated["colorCount"] = len(color_counts(cleaned_target))
    updated["colorStats"] = color_counts(cleaned_target)
    updated["targetMergeStrategy"] = "adjacent_small_components_preserve_init"
    updated["targetMergeChangedCells"] = sum(int(item["size"]) for item in merge_history)
    updated["targetMergeHistory"] = merge_history
    updated["initRecolorHistory"] = init_history
    for key in ("minStepCount", "minStepSolver", "minStepSlotCapacity", "defaultUnlockedSlotRows"):
        updated.pop(key, None)
    write_json(output_path, updated)
    print(
        f"updated {output_path} targetChanges={updated['targetMergeChangedCells']} "
        f"initRecolors={sum(item['count'] for item in init_history)} colors={updated['colorCount']}"
    )


if __name__ == "__main__":
    main()
