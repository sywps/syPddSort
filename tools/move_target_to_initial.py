#!/usr/bin/env python3
"""Transform a final target board into a clustered initial board."""

from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from generate_cute_target import ANIMAL_BUILDERS, count_colors, generate_target_payload

Grid = List[List[int]]
Point = Tuple[int, int]
DIRS8 = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]


def default_time_limit(filled: int) -> int:
    return max(120, min(300, math.ceil(filled * 0.55))) + 60


@dataclass
class GrowGroup:
    group_id: int
    color_id: int
    quota: int
    seed: Point
    cells: List[Point] = field(default_factory=list)
    frontier: Set[Point] = field(default_factory=set)
    row_sum: int = 0
    col_sum: int = 0

    @property
    def remaining(self) -> int:
        return self.quota - len(self.cells)

    @property
    def centroid(self) -> Tuple[float, float]:
        if not self.cells:
            return float(self.seed[0]), float(self.seed[1])
        count = len(self.cells)
        return self.row_sum / count, self.col_sum / count

    def add_cell(self, cell: Point) -> None:
        self.cells.append(cell)
        self.row_sum += cell[0]
        self.col_sum += cell[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build an initial board from a final target board.")
    parser.add_argument("--target", help="Existing target JSON with correctColorArr.")
    parser.add_argument("--animal", default="cat", choices=sorted(ANIMAL_BUILDERS.keys()))
    parser.add_argument("--width", type=int, default=29)
    parser.add_argument("--height", type=int, default=23)
    parser.add_argument("--colors", type=int, default=10)
    parser.add_argument("--seed", type=int, default=20260422)
    parser.add_argument("--level-id", type=int, default=9001)
    parser.add_argument("--max-groups-per-color", type=int, default=3)
    parser.add_argument("--output", required=True)
    parser.add_argument("--moves-output")
    return parser.parse_args()


def read_payload(args: argparse.Namespace) -> Dict[str, object]:
    if args.target:
        with open(args.target, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        if "correctColorArr" not in payload:
            raise ValueError(f"{args.target} does not contain correctColorArr")
        payload.setdefault("boardWidth", len(payload["correctColorArr"][0]))
        payload.setdefault("boardHeight", len(payload["correctColorArr"]))
        payload.setdefault("animal", "custom")
        payload.setdefault("seed", args.seed)
        payload.setdefault("levelId", args.level_id)
        return payload
    return generate_target_payload(
        width=args.width,
        height=args.height,
        animal=args.animal,
        color_count=args.colors,
        seed=args.seed,
        level_id=args.level_id,
    )


def valid_cells(grid: Grid) -> List[Point]:
    cells: List[Point] = []
    for row, line in enumerate(grid):
        for col, value in enumerate(line):
            if value > 0:
                cells.append((row, col))
    return cells


def cells_by_color(grid: Grid) -> Dict[int, List[Point]]:
    result: Dict[int, List[Point]] = {}
    for row, line in enumerate(grid):
        for col, value in enumerate(line):
            if value <= 0:
                continue
            result.setdefault(value, []).append((row, col))
    return dict(sorted(result.items()))


def split_quota(total: int, group_count: int) -> List[int]:
    base = total // group_count
    extra = total % group_count
    return [base + (1 if idx < extra else 0) for idx in range(group_count)]


def manhattan(a: Point | Tuple[float, float], b: Point | Tuple[float, float]) -> float:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def desired_group_count(total: int, max_groups: int) -> int:
    if total < 22:
        return 1
    if total < 70:
        return min(max_groups, 2)
    return min(max_groups, 3)


def choose_seed(
    candidates: Sequence[Point],
    target_grid: Grid,
    color_id: int,
    target_centroid: Tuple[float, float],
    taken: Set[Point],
    same_color_seeds: Sequence[Point],
    rng: random.Random,
) -> Point:
    best_cell: Optional[Point] = None
    best_score = -10**9
    for cell in candidates:
        if cell in taken:
            continue
        row, col = cell
        centroid_dist = manhattan(cell, target_centroid)
        same_seed_dist = min((manhattan(cell, seed) for seed in same_color_seeds), default=8.0)
        wrong_target_bonus = 8.0 if target_grid[row][col] != color_id else 0.0
        edge_bonus = 1.6 * min(row, len(target_grid) - 1 - row, col, len(target_grid[0]) - 1 - col)
        jitter = rng.random() * 0.35
        score = centroid_dist * 1.25 + same_seed_dist * 1.15 + wrong_target_bonus + edge_bonus + jitter
        if score > best_score:
            best_score = score
            best_cell = cell
    if best_cell is None:
        raise ValueError("Unable to choose a seed cell")
    return best_cell


def neighbor_cells(cell: Point, height: int, width: int) -> Iterable[Point]:
    row, col = cell
    for dr, dc in DIRS8:
        nr, nc = row + dr, col + dc
        if 0 <= nr < height and 0 <= nc < width:
            yield nr, nc


def candidate_score(group: GrowGroup, cell: Point, target_grid: Grid) -> float:
    centroid = group.centroid
    score = 0.72 * manhattan(cell, group.seed) + 0.48 * manhattan(cell, centroid)
    if target_grid[cell[0]][cell[1]] == group.color_id:
        score += 4.0
    return score


def choose_candidate(
    group: GrowGroup,
    unassigned: Set[Point],
    target_grid: Grid,
    height: int,
    width: int,
) -> Optional[Point]:
    group.frontier = {cell for cell in group.frontier if cell in unassigned}
    if group.frontier:
        return min(group.frontier, key=lambda cell: candidate_score(group, cell, target_grid))
    if not unassigned:
        return None
    return min(unassigned, key=lambda cell: candidate_score(group, cell, target_grid) + 3.0)


def assign_initial_layout(target_grid: Grid, seed: int, max_groups_per_color: int) -> Grid:
    rng = random.Random(seed)
    height = len(target_grid)
    width = len(target_grid[0])
    by_color = cells_by_color(target_grid)
    all_valid = valid_cells(target_grid)
    unassigned: Set[Point] = set(all_valid)
    taken_seed_cells: Set[Point] = set()
    groups: List[GrowGroup] = []
    next_group_id = 0

    for color_id, color_cells in sorted(by_color.items(), key=lambda item: (-len(item[1]), item[0])):
        target_centroid = (
            sum(cell[0] for cell in color_cells) / len(color_cells),
            sum(cell[1] for cell in color_cells) / len(color_cells),
        )
        group_count = desired_group_count(len(color_cells), max_groups_per_color)
        quotas = split_quota(len(color_cells), group_count)
        seed_candidates = [cell for cell in all_valid if target_grid[cell[0]][cell[1]] != color_id]
        if len(seed_candidates) < group_count:
            seed_candidates = all_valid
        same_color_seeds: List[Point] = []
        for quota in quotas:
            seed_cell = choose_seed(
                candidates=seed_candidates,
                target_grid=target_grid,
                color_id=color_id,
                target_centroid=target_centroid,
                taken=taken_seed_cells,
                same_color_seeds=same_color_seeds,
                rng=rng,
            )
            same_color_seeds.append(seed_cell)
            taken_seed_cells.add(seed_cell)
            group = GrowGroup(group_id=next_group_id, color_id=color_id, quota=quota, seed=seed_cell)
            group.add_cell(seed_cell)
            groups.append(group)
            unassigned.remove(seed_cell)
            next_group_id += 1

    for group in groups:
        for neighbor in neighbor_cells(group.seed, height, width):
            if neighbor in unassigned:
                group.frontier.add(neighbor)

    while unassigned:
        progress = False
        active_groups = [group for group in groups if group.remaining > 0]
        if not active_groups:
            break
        active_groups.sort(key=lambda group: (-group.remaining, group.color_id, group.group_id))
        for group in active_groups:
            if group.remaining <= 0:
                continue
            chosen = choose_candidate(group, unassigned, target_grid, height, width)
            if chosen is None:
                continue
            group.frontier.discard(chosen)
            group.add_cell(chosen)
            unassigned.discard(chosen)
            for neighbor in neighbor_cells(chosen, height, width):
                if neighbor in unassigned:
                    group.frontier.add(neighbor)
            progress = True
            if not unassigned:
                break
        if not progress:
            break

    if unassigned:
        fallback_groups = [group for group in groups if group.remaining > 0] or groups
        leftover = list(unassigned)
        for cell in leftover:
            group = min(fallback_groups, key=lambda item: candidate_score(item, cell, target_grid))
            group.add_cell(cell)
            unassigned.remove(cell)

    init_grid = [[0 for _ in range(width)] for _ in range(height)]
    for group in groups:
        for row, col in group.cells:
            init_grid[row][col] = group.color_id
    return init_grid


def build_move_map(target_grid: Grid, init_grid: Grid) -> List[Dict[str, object]]:
    source_by_color = cells_by_color(target_grid)
    target_by_color = cells_by_color(init_grid)
    move_map: List[Dict[str, object]] = []
    if set(source_by_color) != set(target_by_color):
        raise ValueError("Color sets differ between target and initial grids")

    for color_id in sorted(source_by_color):
        sources = sorted(source_by_color[color_id])
        destinations = target_by_color[color_id][:]
        if len(sources) != len(destinations):
            raise ValueError(f"Color count mismatch for color {color_id}")
        for source in sources:
            best_index = max(range(len(destinations)), key=lambda idx: manhattan(source, destinations[idx]))
            destination = destinations.pop(best_index)
            move_map.append(
                {
                    "colorId": color_id,
                    "from": {"row": source[0], "col": source[1]},
                    "to": {"row": destination[0], "col": destination[1]},
                }
            )
    return move_map


def displacement_ratio(target_grid: Grid, init_grid: Grid) -> float:
    total = 0
    moved = 0
    for row in range(len(target_grid)):
        for col in range(len(target_grid[0])):
            if target_grid[row][col] <= 0:
                continue
            total += 1
            if target_grid[row][col] != init_grid[row][col]:
                moved += 1
    return 0.0 if total == 0 else moved / total


def build_level_payload(base_payload: Dict[str, object], init_grid: Grid) -> Dict[str, object]:
    correct = base_payload["correctColorArr"]
    filled = sum(1 for row in correct for value in row if value > 0)
    ratio = displacement_ratio(correct, init_grid)
    color_stats = count_colors(correct)
    payload = {
        "levelId": int(base_payload.get("levelId", 9001)),
        "animal": base_payload.get("animal", "custom"),
        "seed": int(base_payload.get("seed", 0)),
        "boardWidth": int(base_payload["boardWidth"]),
        "boardHeight": int(base_payload["boardHeight"]),
        "timeLimit": default_time_limit(filled),
        "slotTotalCount": filled,
        "colorCount": len(color_stats),
        "filledCellCount": filled,
        "displacementRatio": round(ratio, 4),
        "colorStats": color_stats,
        "correctColorArr": correct,
        "initRandomColorArr": init_grid,
    }
    if "style" in base_payload:
        payload["style"] = base_payload["style"]
    return payload


def main() -> None:
    args = parse_args()
    base_payload = read_payload(args)
    correct = base_payload["correctColorArr"]
    init_grid = assign_initial_layout(correct, seed=args.seed + 97, max_groups_per_color=args.max_groups_per_color)
    level_payload = build_level_payload(base_payload, init_grid)
    move_map = build_move_map(correct, init_grid)

    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(level_payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    if args.moves_output:
        with open(args.moves_output, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "levelId": level_payload["levelId"],
                    "animal": level_payload["animal"],
                    "style": level_payload.get("style"),
                    "moveCount": len(move_map),
                    "displacementRatio": level_payload["displacementRatio"],
                    "moveMap": move_map,
                },
                fh,
                ensure_ascii=False,
                indent=2,
            )
            fh.write("\n")

    print(
        f"generated init: animal={level_payload['animal']} size={level_payload['boardWidth']}x{level_payload['boardHeight']} "
        f"colors={level_payload['colorCount']} displacement={level_payload['displacementRatio']:.2%} output={args.output}"
    )


if __name__ == "__main__":
    main()
