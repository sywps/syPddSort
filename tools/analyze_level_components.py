#!/usr/bin/env python3
"""Summarize target color components for LevelData files."""

from __future__ import annotations

import argparse
import json
from collections import Counter, deque
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

Point = Tuple[int, int]
Grid = List[List[int]]
DIRS8 = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze target color component sizes.")
    parser.add_argument("--dir", default="assets/LevelData")
    parser.add_argument("--start", type=int, default=6)
    parser.add_argument("--end", type=int, default=20)
    parser.add_argument("--small-threshold", type=int, default=3)
    parser.add_argument("--output")
    return parser.parse_args()


def neighbors(cell: Point, height: int, width: int) -> Iterable[Point]:
    row, col = cell
    for dr, dc in DIRS8:
        nr = row + dr
        nc = col + dc
        if 0 <= nr < height and 0 <= nc < width:
            yield nr, nc


def component_sizes(grid: Grid) -> Dict[int, List[int]]:
    height = len(grid)
    width = len(grid[0])
    visited: set[Point] = set()
    result: Dict[int, List[int]] = {}
    for row in range(height):
        for col in range(width):
            color = int(grid[row][col])
            if color <= 0 or (row, col) in visited:
                continue
            queue = deque([(row, col)])
            visited.add((row, col))
            size = 0
            while queue:
                cell = queue.popleft()
                size += 1
                for nb in neighbors(cell, height, width):
                    if nb in visited:
                        continue
                    if int(grid[nb[0]][nb[1]]) != color:
                        continue
                    visited.add(nb)
                    queue.append(nb)
            result.setdefault(color, []).append(size)
    return {color: sorted(sizes) for color, sizes in sorted(result.items())}


def color_counts(grid: Grid) -> Dict[int, int]:
    counts: Counter[int] = Counter()
    for row in grid:
        for value in row:
            color = int(value)
            if color > 0:
                counts[color] += 1
    return dict(sorted(counts.items()))


def main() -> None:
    args = parse_args()
    level_dir = Path(args.dir)
    rows: List[Dict[str, object]] = []
    for level_id in range(args.start, args.end + 1):
        path = level_dir / f"level_{level_id}.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        grid = payload["correctColorArr"]
        comps = component_sizes(grid)
        small = {
            str(color): [size for size in sizes if size <= args.small_threshold]
            for color, sizes in comps.items()
            if any(size <= args.small_threshold for size in sizes)
        }
        row = {
            "levelId": level_id,
            "filled": sum(color_counts(grid).values()),
            "colors": color_counts(grid),
            "components": {str(color): sizes for color, sizes in comps.items()},
            "smallComponents": small,
        }
        rows.append(row)
        print(f"L{level_id} small={small} components={row['components']}")
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"levels": rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
