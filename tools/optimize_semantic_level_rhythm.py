#!/usr/bin/env python3
"""Optimize early levels while preserving semantic target art."""

from __future__ import annotations

import argparse
import json
import math
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

from calc_guanka_min_steps import LevelMinStepSolver, evaluate_rhythm, resolve_slot_capacity
from move_target_to_initial import displacement_ratio

ROOT = Path(__file__).resolve().parents[1]
LEVEL_DIR = ROOT / "assets" / "RemoteBundle" / "LevelData"
REPORT_PATH = ROOT / ".planning" / "session-plans" / "2026-06-03-restore-semantic-levels" / "semantic-rhythm-report.json"

Grid = List[List[int]]
Point = Tuple[int, int]
DIRS8 = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Optimize LevelData rhythm while preserving semantic target art.")
    parser.add_argument("--dir", default=str(LEVEL_DIR))
    parser.add_argument("--start", type=int, default=6)
    parser.add_argument("--end", type=int, default=20)
    parser.add_argument("--attempts", type=int, default=28)
    parser.add_argument("--merge-rounds", type=int, default=10)
    parser.add_argument("--merge-candidates", type=int, default=16)
    parser.add_argument("--max-merge-component", type=int, default=3)
    parser.add_argument("--max-change-ratio", type=float, default=0.055)
    parser.add_argument("--max-color-drops", type=int, default=2)
    parser.add_argument("--solve-mode", choices=["auto", "greedy"], default="greedy")
    parser.add_argument("--allow-target-merge", action="store_true")
    parser.add_argument("--force-target-cleanup", action="store_true")
    parser.add_argument("--require-target-cleanup", action="store_true")
    parser.add_argument("--report", default=str(REPORT_PATH))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def read_json(path: Path) -> Dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")


def valid_cells(grid: Grid) -> List[Point]:
    return [(r, c) for r, row in enumerate(grid) for c, value in enumerate(row) if value > 0]


def color_counts(grid: Grid) -> Dict[int, int]:
    counts: Counter[int] = Counter()
    for row in grid:
        for value in row:
            if value > 0:
                counts[int(value)] += 1
    return dict(sorted(counts.items()))


def copy_grid(grid: Grid) -> Grid:
    return [row[:] for row in grid]


def filled_count(grid: Grid) -> int:
    return sum(1 for row in grid for value in row if value > 0)


def changed_cell_count(original: Grid, candidate: Grid) -> int:
    return sum(
        1
        for row in range(len(original))
        for col in range(len(original[row]))
        if original[row][col] != candidate[row][col]
    )


def same_silhouette(original: Grid, candidate: Grid) -> bool:
    for row in range(len(original)):
        for col in range(len(original[row])):
            if (original[row][col] > 0) != (candidate[row][col] > 0):
                return False
    return True


def target_change_cap(original: Grid, max_change_ratio: float) -> int:
    filled = filled_count(original)
    ratio = max(0.0, float(max_change_ratio))
    if filled <= 120:
        return max(6, min(16, int(round(filled * max(0.08, ratio)))))
    if filled <= 240:
        return max(8, min(24, int(round(filled * max(0.065, ratio)))))
    if filled <= 420:
        return max(10, min(32, int(round(filled * max(0.055, ratio)))))
    return max(12, min(180, int(round(filled * max(0.055, ratio)))))


def target_components(grid: Grid) -> List[Tuple[int, List[Point]]]:
    height = len(grid)
    width = len(grid[0])
    visited: set[Point] = set()
    components: List[Tuple[int, List[Point]]] = []
    for row in range(height):
        for col in range(width):
            color = grid[row][col]
            if color <= 0 or (row, col) in visited:
                continue
            stack = [(row, col)]
            visited.add((row, col))
            cells: List[Point] = []
            while stack:
                cell = stack.pop()
                cells.append(cell)
                for nb in neighbors(cell, height, width):
                    if nb in visited:
                        continue
                    if grid[nb[0]][nb[1]] != color:
                        continue
                    visited.add(nb)
                    stack.append(nb)
            components.append((color, cells))
    return components


def adjacent_target_colors(grid: Grid, cells: Sequence[Point], color: int) -> Counter[int]:
    height = len(grid)
    width = len(grid[0])
    cell_set = set(cells)
    counts: Counter[int] = Counter()
    for cell in cells:
        for nb in neighbors(cell, height, width):
            if nb in cell_set:
                continue
            nb_color = grid[nb[0]][nb[1]]
            if nb_color > 0 and nb_color != color:
                counts[nb_color] += 1
    return counts


def small_action_colors(result: object) -> set[int]:
    colors: set[int] = set()
    for action in getattr(result, "actions", []):
        if action.bean_count <= 3 or (action.placed_count > 0 and action.placed_count <= 3):
            colors.add(int(action.color_id))
    return colors


def make_target_merge_candidates(
    original: Grid,
    current: Grid,
    result: object,
    max_component_size: int,
    max_change_ratio: float,
    max_color_drops: int,
    limit: int,
) -> List[Tuple[Grid, Dict[str, object]]]:
    original_counts = color_counts(original)
    current_counts = color_counts(current)
    min_colors = max(2, len(original_counts) - max_color_drops)
    max_changed = target_change_cap(original, max_change_ratio)
    priority_colors = small_action_colors(result)
    rows: List[Tuple[float, Grid, Dict[str, object]]] = []

    for color, cells in target_components(current):
        size = len(cells)
        if size > max_component_size:
            continue
        if priority_colors and color not in priority_colors:
            continue
        adjacent = adjacent_target_colors(current, cells, color)
        if not adjacent:
            continue
        for new_color, adjacency in adjacent.most_common(3):
            next_grid = copy_grid(current)
            for row, col in cells:
                next_grid[row][col] = int(new_color)
            if not same_silhouette(original, next_grid):
                continue
            changed = changed_cell_count(original, next_grid)
            if changed > max_changed:
                continue
            next_counts = color_counts(next_grid)
            if len(next_counts) < min_colors:
                continue
            if current_counts[color] - size <= 0 and len(current_counts) <= min_colors:
                continue
            score = adjacency * 100 - size * 3 - changed * 0.5 + current_counts.get(new_color, 0) * 0.01
            rows.append((
                score,
                next_grid,
                {
                    "fromColor": int(color),
                    "toColor": int(new_color),
                    "cells": [{"row": int(row), "col": int(col)} for row, col in cells],
                    "size": int(size),
                    "adjacency": int(adjacency),
                    "changedCells": int(changed),
                    "colorCount": int(len(next_counts)),
                },
            ))

    if not rows and priority_colors:
        class EmptyResult:
            actions: List[object] = []

        return make_target_merge_candidates(
            original,
            current,
            EmptyResult(),
            max_component_size,
            max_change_ratio,
            max_color_drops,
            limit,
        )

    rows.sort(key=lambda row: row[0], reverse=True)
    return [(grid, meta) for _, grid, meta in rows[: max(1, limit)]]


def cleanup_small_target_components(
    original: Grid,
    current: Grid,
    result: object,
    max_component_size: int,
    max_change_ratio: float,
    max_color_drops: int,
) -> Tuple[Grid, List[Dict[str, object]]]:
    cleaned = copy_grid(current)
    history: List[Dict[str, object]] = []
    max_changed = target_change_cap(original, max_change_ratio)
    while True:
        options = make_target_merge_candidates(
            original=original,
            current=cleaned,
            result=result,
            max_component_size=max_component_size,
            max_change_ratio=max_change_ratio,
            max_color_drops=max_color_drops,
            limit=1,
        )
        if not options:
            break
        next_grid, meta = options[0]
        if changed_cell_count(original, next_grid) > max_changed:
            break
        if changed_cell_count(cleaned, next_grid) <= 0:
            break
        cleaned = next_grid
        history.append(meta)
    return cleaned, history


def rhythm_allowed_sizes(filled: int) -> Tuple[List[int], Tuple[int, int]]:
    if filled <= 60:
        return list(range(5, 11)), (7, 9)
    if filled <= 120:
        return list(range(6, 13)), (8, 10)
    if filled <= 240:
        return list(range(6, 17)), (8, 12)
    if filled <= 420:
        return list(range(7, 21)), (9, 13)
    return list(range(8, 25)), (10, 14)


def partition_count(total: int, allowed: Sequence[int], main_range: Tuple[int, int]) -> List[int]:
    if total <= 0:
        return []
    if total <= 3:
        return [total]
    if total in allowed:
        return [total]

    best: List[Tuple[float, List[int]]] = [(10**9, []) for _ in range(total + 1)]
    best[0] = (0.0, [])
    main_low, main_high = main_range
    target = (main_low + main_high) / 2
    for current in range(total + 1):
        score, sizes = best[current]
        if score >= 10**8:
            continue
        for size in allowed:
            nxt = current + size
            if nxt > total:
                continue
            penalty = 0.0 if main_low <= size <= main_high else 4.0
            penalty += abs(size - target) * 0.08
            candidate = score + penalty
            if candidate < best[nxt][0]:
                best[nxt] = (candidate, sizes + [size])
    if best[total][1]:
        return best[total][1]

    low = min(allowed)
    if total > low and total - low >= 4:
        return [low, total - low]
    return [total]


def neighbors(cell: Point, height: int, width: int) -> List[Point]:
    row, col = cell
    result: List[Point] = []
    for dr, dc in DIRS8:
        nr, nc = row + dr, col + dc
        if 0 <= nr < height and 0 <= nc < width:
            result.append((nr, nc))
    return result


def adjacent_same_color_count(cell: Point, color: int, assigned: Dict[Point, int], height: int, width: int) -> int:
    return sum(1 for nb in neighbors(cell, height, width) if assigned.get(nb) == color)


def choose_seed(
    unassigned: set[Point],
    assigned: Dict[Point, int],
    correct: Grid,
    color: int,
    height: int,
    width: int,
    rng: random.Random,
) -> Point:
    sample = list(unassigned)
    rng.shuffle(sample)
    sample = sample[: min(len(sample), 96)]
    return min(
        sample,
        key=lambda cell: (
            (1 if correct[cell[0]][cell[1]] == color else 0) * 140,
            adjacent_same_color_count(cell, color, assigned, height, width) * 100,
            -min(cell[0], height - 1 - cell[0], cell[1], width - 1 - cell[1]),
            rng.random(),
        ),
    )


def grow_chunk(
    seed: Point,
    size: int,
    color: int,
    correct: Grid,
    unassigned: set[Point],
    assigned: Dict[Point, int],
    valid: set[Point],
    height: int,
    width: int,
    rng: random.Random,
) -> List[Point]:
    cells = [seed]
    unassigned.remove(seed)
    frontier = {cell for cell in neighbors(seed, height, width) if cell in unassigned and cell in valid}
    while len(cells) < size and unassigned:
        if frontier:
            chosen = min(
                frontier,
                key=lambda cell: (
                    (1 if correct[cell[0]][cell[1]] == color else 0) * 140,
                    adjacent_same_color_count(cell, color, assigned, height, width) * 80,
                    abs(cell[0] - seed[0]) + abs(cell[1] - seed[1]),
                    rng.random(),
                ),
            )
            frontier.remove(chosen)
        else:
            chosen = min(
                unassigned,
                key=lambda cell: (
                    (1 if correct[cell[0]][cell[1]] == color else 0) * 140,
                    adjacent_same_color_count(cell, color, assigned, height, width) * 80,
                    min(abs(cell[0] - r) + abs(cell[1] - c) for r, c in cells),
                    rng.random(),
                ),
            )
        cells.append(chosen)
        unassigned.remove(chosen)
        for nb in neighbors(chosen, height, width):
            if nb in unassigned and nb in valid:
                frontier.add(nb)
    return cells


def build_chunk_plan(correct: Grid, rng: random.Random) -> List[Tuple[int, int]]:
    filled = len(valid_cells(correct))
    allowed, main_range = rhythm_allowed_sizes(filled)
    by_color = color_counts(correct)
    chunks_by_color: Dict[int, List[int]] = {}
    for color, count in by_color.items():
        sizes = partition_count(count, allowed, main_range)
        rng.shuffle(sizes)
        chunks_by_color[color] = sizes

    plan: List[Tuple[int, int]] = []
    remaining = {color: sizes[:] for color, sizes in chunks_by_color.items()}
    previous_color = None
    while any(remaining.values()):
        candidates = [color for color, sizes in remaining.items() if sizes and color != previous_color]
        if not candidates:
            candidates = [color for color, sizes in remaining.items() if sizes]
        candidates.sort(key=lambda color: (-len(remaining[color]), rng.random()))
        color = candidates[0]
        size = remaining[color].pop(0)
        plan.append((color, size))
        previous_color = color
    return plan


def component_cells_for_color(correct: Grid, color: int) -> List[List[Point]]:
    height = len(correct)
    width = len(correct[0])
    color_cells = {(r, c) for r, row in enumerate(correct) for c, value in enumerate(row) if value == color}
    visited: set[Point] = set()
    components: List[List[Point]] = []
    for start in sorted(color_cells):
        if start in visited:
            continue
        stack = [start]
        visited.add(start)
        cells: List[Point] = []
        while stack:
            cell = stack.pop()
            cells.append(cell)
            for nb in neighbors(cell, height, width):
                if nb not in color_cells or nb in visited:
                    continue
                visited.add(nb)
                stack.append(nb)
        components.append(sorted(cells))
    components.sort(key=lambda cells: (-len(cells), cells[0]))
    return components


def take_connected_chunk(available: set[Point], size: int, rng: random.Random, height: int, width: int) -> List[Point]:
    if not available:
        return []
    seed = rng.choice(tuple(available))
    cells = [seed]
    available.remove(seed)
    frontier = {nb for nb in neighbors(seed, height, width) if nb in available}
    while len(cells) < size and available:
        if frontier:
            chosen = min(
                frontier,
                key=lambda cell: (
                    min(abs(cell[0] - r) + abs(cell[1] - c) for r, c in cells),
                    rng.random(),
                ),
            )
            frontier.remove(chosen)
        else:
            chosen = min(
                available,
                key=lambda cell: (
                    min(abs(cell[0] - r) + abs(cell[1] - c) for r, c in cells),
                    rng.random(),
                ),
            )
        cells.append(chosen)
        available.remove(chosen)
        for nb in neighbors(chosen, height, width):
            if nb in available:
                frontier.add(nb)
    return cells


def build_target_chunks(correct: Grid, rng: random.Random) -> List[Dict[str, object]]:
    height = len(correct)
    width = len(correct[0])
    filled = len(valid_cells(correct))
    allowed, main_range = rhythm_allowed_sizes(filled)
    chunks: List[Dict[str, object]] = []
    for color, count in color_counts(correct).items():
        sizes = partition_count(count, allowed, main_range)
        rng.shuffle(sizes)
        available = {cell for component in component_cells_for_color(correct, color) for cell in component}
        for size in sizes:
            cells = take_connected_chunk(available, size, rng, height, width)
            if len(cells) != size:
                raise ValueError("unable to split target color into requested chunks")
            chunks.append({"targetColor": color, "size": size, "cells": cells})
    return chunks


def touches_assigned_source(cells: Sequence[Point], source_color: int, assigned: Dict[Point, int], height: int, width: int) -> int:
    total = 0
    for cell in cells:
        for nb in neighbors(cell, height, width):
            if assigned.get(nb) == source_color:
                total += 1
    return total


def build_target_chunk_init_grid(correct: Grid, seed: int) -> Grid:
    rng = random.Random(seed)
    height = len(correct)
    width = len(correct[0])
    chunks = build_target_chunks(correct, rng)
    rng.shuffle(chunks)
    remaining = color_counts(correct)
    assigned: Dict[Point, int] = {}

    for chunk in sorted(chunks, key=lambda item: (-int(item["size"]), rng.random())):
        size = int(chunk["size"])
        target_color = int(chunk["targetColor"])
        cells = chunk["cells"]
        candidates = [
            color
            for color, count in remaining.items()
            if color != target_color and count >= size and (count - size == 0 or count - size >= 4)
        ]
        if not candidates:
            candidates = [
                color
                for color, count in remaining.items()
                if color != target_color and count >= size
            ]
        if not candidates:
            raise ValueError("unable to assign target chunks without color count mismatch")
        source_color = min(
            candidates,
            key=lambda color: (
                touches_assigned_source(cells, color, assigned, height, width),
                remaining[color] - size,
                rng.random(),
            ),
        )
        for cell in cells:
            assigned[cell] = source_color
        remaining[source_color] -= size

    grid = [[0 for _ in range(width)] for _ in range(height)]
    for row, col in valid_cells(correct):
        color = assigned.get((row, col))
        if color is None:
            raise ValueError("target chunk strategy left cells unassigned")
        grid[row][col] = color
    if color_counts(grid) != color_counts(correct):
        raise ValueError("target chunk strategy changed color counts")
    return grid


def ordered_valid_cells(correct: Grid, mode: str) -> List[Point]:
    cells = valid_cells(correct)
    height = len(correct)
    width = len(correct[0])
    center_r = (height - 1) / 2
    center_c = (width - 1) / 2
    if mode == "row":
        return sorted(cells)
    if mode == "row_rev":
        return sorted(cells, reverse=True)
    if mode == "col":
        return sorted(cells, key=lambda cell: (cell[1], cell[0]))
    if mode == "diag":
        return sorted(cells, key=lambda cell: (cell[0] + cell[1], cell[0]))
    if mode == "angle":
        return sorted(cells, key=lambda cell: math.atan2(cell[0] - center_r, cell[1] - center_c))
    if mode == "snake":
        rows: Dict[int, List[Point]] = defaultdict(list)
        for cell in cells:
            rows[cell[0]].append(cell)
        ordered: List[Point] = []
        for row in sorted(rows):
            row_cells = sorted(rows[row], key=lambda cell: cell[1], reverse=row % 2 == 1)
            ordered.extend(row_cells)
        return ordered
    raise ValueError(f"unknown order mode: {mode}")


def build_linear_init_grid(correct: Grid, seed: int, mode: str) -> Grid:
    rng = random.Random(seed)
    height = len(correct)
    width = len(correct[0])
    cells = ordered_valid_cells(correct, mode)
    if cells:
        offset = seed % len(cells)
        cells = cells[offset:] + cells[:offset]
    plan = build_chunk_plan(correct, rng)
    grid = [[0 for _ in range(width)] for _ in range(height)]
    cursor = 0
    for color, size in plan:
        for cell in cells[cursor: cursor + size]:
            grid[cell[0]][cell[1]] = color
        cursor += size
    if color_counts(grid) != color_counts(correct):
        raise ValueError("linear initial layout changed color counts")
    return grid


def build_grown_init_grid(correct: Grid, seed: int) -> Grid:
    rng = random.Random(seed)
    height = len(correct)
    width = len(correct[0])
    valid = set(valid_cells(correct))
    unassigned = set(valid)
    assigned: Dict[Point, int] = {}
    plan = build_chunk_plan(correct, rng)
    rng.shuffle(plan)

    for color, size in plan:
        if not unassigned:
            break
        seed_cell = choose_seed(unassigned, assigned, correct, color, height, width, rng)
        cells = grow_chunk(seed_cell, size, color, correct, unassigned, assigned, valid, height, width, rng)
        for cell in cells:
            assigned[cell] = color

    grid = [[0 for _ in range(width)] for _ in range(height)]
    for (row, col), color in assigned.items():
        grid[row][col] = color
    if color_counts(grid) != color_counts(correct):
        raise ValueError("generated initial layout changed color counts")
    return grid


def build_init_grid(correct: Grid, seed: int, strategy: str) -> Grid:
    if strategy.startswith("linear:"):
        return build_linear_init_grid(correct, seed, strategy.split(":", 1)[1])
    if strategy == "target_chunks":
        return build_target_chunk_init_grid(correct, seed)
    return build_grown_init_grid(correct, seed)


def score_result(
    payload: Dict[str, object],
    result: object,
    ratio: float,
    target_changes: int = 0,
    color_drops: int = 0,
) -> Tuple[float, Dict[str, object]]:
    slot_capacity = resolve_slot_capacity(payload)
    rhythm = evaluate_rhythm(result, slot_capacity)
    small_total = int(rhythm.get("totalActions", 0)) * 0
    small_total += int(sum(result.small_step_histogram.values()))
    small_total += int(sum(result.small_place_histogram.values()))
    full_ratio = float(rhythm["fullSlotRatio"])
    main_ratio = float(rhythm["mainStepRatio"])
    out_of_range = int(rhythm["outOfRangeTotal"])
    unique_sizes = int(rhythm["uniqueStepSizes"])
    min_unique = int(rhythm["rule"]["minUniqueStepSizes"])
    score = (
        small_total * 100000
        + (0 if result.complete else 10000000)
        + out_of_range * 900
        + full_ratio * 2800
        + max(0.0, 0.45 - main_ratio) * 1800
        + max(0, min_unique - unique_sizes) * 750
        + abs(ratio - 0.78) * 80
        + target_changes * 260
        + color_drops * 1800
    )
    return score, rhythm


def payload_with_grids(payload: Dict[str, object], correct: Grid, init_grid: Grid) -> Dict[str, object]:
    candidate = dict(payload)
    candidate["correctColorArr"] = correct
    candidate["initRandomColorArr"] = init_grid
    candidate["boardWidth"] = len(correct[0])
    candidate["boardHeight"] = len(correct)
    candidate["filledCellCount"] = filled_count(correct)
    candidate["slotTotalCount"] = filled_count(correct)
    candidate["colorCount"] = len(color_counts(correct))
    candidate["colorStats"] = color_counts(correct)
    candidate["displacementRatio"] = round(displacement_ratio(correct, init_grid), 4)
    return candidate


def solve_payload(payload: Dict[str, object], correct: Grid, init_grid: Grid, solve_mode: str) -> object:
    candidate = payload_with_grids(payload, correct, init_grid)
    slot_capacity = resolve_slot_capacity(candidate)
    return LevelMinStepSolver(candidate, slot_capacity=slot_capacity).solve(mode=solve_mode)


def evaluate_layout(
    payload: Dict[str, object],
    original_correct: Grid,
    correct: Grid,
    init_grid: Grid,
    solve_mode: str,
) -> Tuple[float, Dict[str, object], object, float]:
    candidate = payload_with_grids(payload, correct, init_grid)
    result = solve_payload(payload, correct, init_grid, solve_mode)
    ratio = displacement_ratio(correct, init_grid)
    target_changes = changed_cell_count(original_correct, correct)
    color_drops = max(0, len(color_counts(original_correct)) - len(color_counts(correct)))
    score, rhythm = score_result(candidate, result, ratio, target_changes, color_drops)
    return score, rhythm, result, ratio


def best_init_for_target(
    payload: Dict[str, object],
    original_correct: Grid,
    correct: Grid,
    attempts: int,
    base_seed: int,
    solve_mode: str,
) -> Dict[str, object]:
    strategies = ["target_chunks", "grown", "linear:snake", "linear:row", "linear:row_rev", "linear:col", "linear:diag", "linear:angle"]
    original_init = payload["initRandomColorArr"]
    candidates: List[Tuple[Grid, int | None, str]] = []
    if color_counts(original_init) == color_counts(correct):
        candidates.append((original_init, None, "existing"))
    for attempt in range(max(1, attempts)):
        seed = base_seed + attempt * 7919
        strategy = strategies[attempt % len(strategies)]
        try:
            candidates.append((build_init_grid(correct, seed, strategy), seed, strategy))
        except ValueError:
            continue

    best: Dict[str, object] | None = None
    for init_grid, seed, strategy in candidates:
        score, rhythm, result, ratio = evaluate_layout(payload, original_correct, correct, init_grid, solve_mode)
        if best is None or score < float(best["score"]):
            best = {
                "score": score,
                "correct": correct,
                "init": init_grid,
                "seed": seed,
                "strategy": strategy,
                "result": result,
                "ratio": ratio,
                "rhythm": rhythm,
            }
    if best is None:
        raise ValueError("unable to evaluate target")
    return best


def optimize_level(
    path: Path,
    attempts: int,
    dry_run: bool,
    allow_target_merge: bool,
    merge_rounds: int,
    merge_candidates: int,
    max_merge_component: int,
    max_change_ratio: float,
    max_color_drops: int,
    force_target_cleanup: bool,
    require_target_cleanup: bool,
    solve_mode: str,
) -> Dict[str, object]:
    payload = read_json(path)
    correct = payload["correctColorArr"]
    original_init = payload["initRandomColorArr"]
    original_result = solve_payload(payload, correct, original_init, solve_mode)
    original_ratio = displacement_ratio(correct, original_init)
    original_score, original_rhythm = score_result(payload, original_result, original_ratio)

    level_id = int(payload.get("levelId", 0) or 0)
    base_seed = 20260603 + level_id * 1009
    best = best_init_for_target(payload, correct, correct, attempts, base_seed, solve_mode)
    best["mergeHistory"] = []

    if allow_target_merge and force_target_cleanup:
        cleaned_target, cleanup_history = cleanup_small_target_components(
            original=correct,
            current=correct,
            result=original_result,
            max_component_size=max_merge_component,
            max_change_ratio=max_change_ratio,
            max_color_drops=max_color_drops,
        )
        if cleanup_history:
            cleanup_best = best_init_for_target(
                payload,
                correct,
                cleaned_target,
                attempts,
                base_seed + 65537,
                solve_mode,
            )
            cleanup_best["mergeHistory"] = cleanup_history
            if require_target_cleanup or float(cleanup_best["score"]) < float(best["score"]):
                best = cleanup_best

    for round_index in range(max(0, merge_rounds if allow_target_merge else 0)):
        if int(sum(best["result"].small_step_histogram.values())) == 0 and int(sum(best["result"].small_place_histogram.values())) == 0:
            break
        target_options = make_target_merge_candidates(
            original=correct,
            current=best["correct"],
            result=best["result"],
            max_component_size=max_merge_component,
            max_change_ratio=max_change_ratio,
            max_color_drops=max_color_drops,
            limit=merge_candidates,
        )
        if not target_options:
            break

        round_best: Dict[str, object] | None = None
        for candidate_target, merge_meta in target_options:
            candidate = best_init_for_target(
                payload,
                correct,
                candidate_target,
                max(2, attempts // 2),
                base_seed + (round_index + 1) * 104729,
                solve_mode,
            )
            candidate["merge"] = merge_meta
            if round_best is None or float(candidate["score"]) < float(round_best["score"]):
                round_best = candidate

        if round_best is None or float(round_best["score"]) >= float(best["score"]):
            break
        previous_history = list(best.get("mergeHistory") or [])
        previous_history.append(round_best.get("merge"))
        round_best["mergeHistory"] = previous_history
        best = round_best

    result = best["result"]
    updated = payload_with_grids(payload, best["correct"], best["init"])
    updated["displacementRatio"] = round(float(best["ratio"]), 4)
    updated["initShuffleStrategy"] = "semantic_rhythm_chunks"
    updated["targetMergeStrategy"] = "none"
    if best["seed"] is not None:
        updated["initShuffleSeed"] = int(best["seed"])
        updated["initShuffleStrategy"] = str(best.get("strategy") or "semantic_rhythm_chunks")
    merge_history = list(best.get("mergeHistory") or [])
    if merge_history:
        updated["targetMergeStrategy"] = "adjacent_small_components"
        updated["targetMergeChangedCells"] = changed_cell_count(correct, best["correct"])
        updated["targetMergeHistory"] = merge_history
    for key in ("minStepCount", "minStepSolver", "minStepSlotCapacity", "defaultUnlockedSlotRows"):
        updated.pop(key, None)
    if not dry_run:
        write_json(path, updated)

    target_changes = changed_cell_count(correct, best["correct"])
    return {
        "levelId": level_id,
        "changed": best["seed"] is not None or target_changes > 0,
        "seed": best["seed"],
        "strategy": best.get("strategy"),
        "targetChanges": int(target_changes),
        "targetChangeRatio": round(target_changes / max(1, filled_count(correct)), 4),
        "targetColorCountBefore": int(len(color_counts(correct))),
        "targetColorCountAfter": int(len(color_counts(best["correct"]))),
        "mergeHistory": merge_history,
        "before": {
            "score": round(float(original_score), 4),
            "steps": int(original_result.min_steps),
            "hist": original_result.step_size_histogram,
            "smallStepTotal": int(sum(original_result.small_step_histogram.values())),
            "smallPlaceTotal": int(sum(original_result.small_place_histogram.values())),
            "rhythmPass": bool(original_rhythm["pass"]),
            "complete": bool(original_result.complete),
        },
        "after": {
            "score": round(float(best["score"]), 4),
            "steps": int(result.min_steps),
            "hist": result.step_size_histogram,
            "smallStepTotal": int(sum(result.small_step_histogram.values())),
            "smallPlaceTotal": int(sum(result.small_place_histogram.values())),
            "rhythmPass": bool(best["rhythm"]["pass"]),
            "complete": bool(result.complete),
            "reasons": best["rhythm"]["reasons"],
        },
    }


def main() -> None:
    args = parse_args()
    level_dir = Path(args.dir)
    report = {
        "dryRun": bool(args.dry_run),
        "attempts": int(args.attempts),
        "allowTargetMerge": bool(args.allow_target_merge),
        "forceTargetCleanup": bool(args.force_target_cleanup),
        "requireTargetCleanup": bool(args.require_target_cleanup),
        "mergeRounds": int(args.merge_rounds),
        "mergeCandidates": int(args.merge_candidates),
        "maxMergeComponent": int(args.max_merge_component),
        "maxChangeRatio": float(args.max_change_ratio),
        "maxColorDrops": int(args.max_color_drops),
        "solveMode": str(args.solve_mode),
        "levels": [],
    }
    for level_id in range(args.start, args.end + 1):
        row = optimize_level(
            level_dir / f"level_{level_id}.json",
            args.attempts,
            args.dry_run,
            args.allow_target_merge,
            args.merge_rounds,
            args.merge_candidates,
            args.max_merge_component,
            args.max_change_ratio,
            args.max_color_drops,
            args.force_target_cleanup,
            args.require_target_cleanup,
            args.solve_mode,
        )
        report["levels"].append(row)
        print(
            f"L{row['levelId']} small {row['before']['smallStepTotal']}/{row['before']['smallPlaceTotal']}"
            f" -> {row['after']['smallStepTotal']}/{row['after']['smallPlaceTotal']}"
            f" targetChanges={row['targetChanges']}"
            f" hist={row['after']['hist']}"
        )
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(report_path, report)
    print(f"report={report_path}")


if __name__ == "__main__":
    main()
