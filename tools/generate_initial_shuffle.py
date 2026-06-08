#!/usr/bin/env python3
"""Regenerate initRandomColorArr for an existing level or target JSON."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Dict, List, Tuple

from calc_guanka_min_steps import DEFAULT_SLOT_CAPACITY, LevelMinStepSolver
from generate_cute_target import count_colors
from move_target_to_initial import (
    assign_initial_layout,
    build_move_map,
    displacement_ratio,
)

Grid = List[List[int]]

DIFFICULTY_PRESETS: Dict[str, Dict[str, object]] = {
    "tutorial": {
        "target_displacement": 0.60,
        "min_displacement": 0.48,
        "max_displacement": 0.70,
        "group_range": (1, 2),
        "target_min_steps": 4,
        "min_min_steps": 2,
        "max_min_steps": 7,
    },
    "easy": {
        "target_displacement": 0.70,
        "min_displacement": 0.58,
        "max_displacement": 0.80,
        "group_range": (1, 3),
        "target_min_steps": 7,
        "min_min_steps": 4,
        "max_min_steps": 11,
    },
    "normal": {
        "target_displacement": 0.80,
        "min_displacement": 0.68,
        "max_displacement": 0.90,
        "group_range": (2, 3),
        "target_min_steps": 11,
        "min_min_steps": 7,
        "max_min_steps": 16,
    },
    "hard": {
        "target_displacement": 0.88,
        "min_displacement": 0.78,
        "max_displacement": 0.95,
        "group_range": (2, 4),
        "target_min_steps": 16,
        "min_min_steps": 11,
        "max_min_steps": 24,
    },
    "expert": {
        "target_displacement": 0.94,
        "min_displacement": 0.86,
        "max_displacement": 0.99,
        "group_range": (3, 4),
        "target_min_steps": 22,
        "min_min_steps": 16,
        "max_min_steps": 36,
    },
}


def default_time_limit(filled: int) -> int:
    return max(120, min(300, math.ceil(filled * 0.55))) + 60


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a clustered initial shuffled board from correctColorArr."
    )
    parser.add_argument("input", help="Input JSON containing correctColorArr.")
    parser.add_argument(
        "--output",
        help="Output JSON path. Defaults to overwriting the input file.",
    )
    parser.add_argument(
        "--moves-output",
        help="Optional path to write a move map for debugging.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Base random seed. Defaults to a deterministic value derived from levelId.",
    )
    parser.add_argument(
        "--attempts",
        type=int,
        default=12,
        help="Number of seed attempts per group-count setting.",
    )
    parser.add_argument(
        "--max-groups-per-color",
        type=int,
        help="Upper bound for clustered regions created per color.",
    )
    parser.add_argument(
        "--min-groups-per-color",
        type=int,
        help="Lower bound for clustered regions created per color.",
    )
    parser.add_argument(
        "--difficulty",
        choices=sorted(DIFFICULTY_PRESETS.keys()),
        help="Difficulty preset used to target displacement and optional min-step bands.",
    )
    parser.add_argument(
        "--target-displacement",
        type=float,
        help="Preferred displacement ratio for the generated initial board.",
    )
    parser.add_argument(
        "--min-displacement",
        type=float,
        help="Soft lower bound for displacement ratio.",
    )
    parser.add_argument(
        "--max-displacement",
        type=float,
        help="Soft upper bound for displacement ratio.",
    )
    parser.add_argument(
        "--minstep-mode",
        choices=("off", "greedy", "auto", "knn"),
        default="off",
        help="Optional min-step evaluation mode used while scoring candidates.",
    )
    parser.add_argument(
        "--target-min-steps",
        type=int,
        help="Preferred min-step count when min-step scoring is enabled.",
    )
    parser.add_argument(
        "--min-min-steps",
        type=int,
        help="Soft lower bound for min-step count when min-step scoring is enabled.",
    )
    parser.add_argument(
        "--max-min-steps",
        type=int,
        help="Soft upper bound for min-step count when min-step scoring is enabled.",
    )
    parser.add_argument(
        "--report-output",
        help="Optional path to write the chosen-candidate report JSON.",
    )
    return parser.parse_args()


def load_payload(path: Path) -> Dict[str, object]:
    with path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    if "correctColorArr" not in payload:
        raise ValueError(f"{path} does not contain correctColorArr")
    return payload


def validate_grid(grid: Grid) -> Tuple[int, int]:
    if not grid or not grid[0]:
        raise ValueError("correctColorArr is empty")
    width = len(grid[0])
    for row in grid:
        if len(row) != width:
            raise ValueError("correctColorArr rows must all have the same width")
    return width, len(grid)


def filled_count(grid: Grid) -> int:
    return sum(1 for row in grid for value in row if value > 0)


def derive_seed(payload: Dict[str, object], explicit_seed: int | None) -> int:
    if explicit_seed is not None:
        return explicit_seed
    level_id = int(payload.get("levelId", 0) or 0)
    return 20260423 + level_id * 7919


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def resolve_search_config(args: argparse.Namespace) -> Dict[str, object]:
    preset = DIFFICULTY_PRESETS.get(args.difficulty or "")
    max_groups = args.max_groups_per_color
    if max_groups is None:
        if preset is not None:
            max_groups = int(preset["group_range"][1])
        else:
            max_groups = 4
    min_groups = args.min_groups_per_color
    if min_groups is None:
        if preset is not None:
            min_groups = int(preset["group_range"][0])
        else:
            min_groups = max_groups
    if min_groups > max_groups:
        raise ValueError("min-groups-per-color cannot exceed max-groups-per-color")

    target_displacement = args.target_displacement
    min_displacement = args.min_displacement
    max_displacement = args.max_displacement
    if preset is not None:
        if target_displacement is None:
            target_displacement = float(preset["target_displacement"])
        if min_displacement is None:
            min_displacement = float(preset["min_displacement"])
        if max_displacement is None:
            max_displacement = float(preset["max_displacement"])
    target_min_steps = args.target_min_steps
    min_min_steps = args.min_min_steps
    max_min_steps = args.max_min_steps
    if preset is not None:
        if target_min_steps is None:
            target_min_steps = int(preset["target_min_steps"])
        if min_min_steps is None:
            min_min_steps = int(preset["min_min_steps"])
        if max_min_steps is None:
            max_min_steps = int(preset["max_min_steps"])

    minstep_mode = args.minstep_mode
    if (
        minstep_mode == "off"
        and any(value is not None for value in (target_min_steps, min_min_steps, max_min_steps))
    ):
        minstep_mode = "greedy"

    return {
        "difficulty": args.difficulty,
        "min_groups": int(min_groups),
        "max_groups": int(max_groups),
        "target_displacement": target_displacement,
        "min_displacement": min_displacement,
        "max_displacement": max_displacement,
        "minstep_mode": minstep_mode,
        "target_min_steps": target_min_steps,
        "min_min_steps": min_min_steps,
        "max_min_steps": max_min_steps,
    }


def score_against_range(
    value: float,
    target: float | None,
    lower: float | None,
    upper: float | None,
    range_weight: float = 220.0,
    target_weight: float = 100.0,
) -> float:
    penalty = 0.0
    if lower is not None and value < lower:
        penalty += (lower - value) * range_weight
    if upper is not None and value > upper:
        penalty += (value - upper) * range_weight
    if target is not None:
        penalty += abs(value - target) * target_weight
    return penalty


def estimate_candidate_min_steps(correct: Grid, init_grid: Grid, mode: str) -> Tuple[int, str] | Tuple[None, None]:
    if mode == "off":
        return None, None
    payload = {
        "boardWidth": len(correct[0]),
        "boardHeight": len(correct),
        "correctColorArr": correct,
        "initRandomColorArr": init_grid,
    }
    result = LevelMinStepSolver(payload, slot_capacity=DEFAULT_SLOT_CAPACITY).solve(mode=mode)
    return result.min_steps, result.solver


def soften_init_layout(correct: Grid, init_grid: Grid, target_ratio: float) -> Tuple[Grid, float]:
    current_ratio = displacement_ratio(correct, init_grid)
    if current_ratio <= target_ratio:
        return init_grid, current_ratio

    height = len(correct)
    width = len(correct[0])
    grid = [row[:] for row in init_grid]
    total = sum(1 for row in correct for value in row if value > 0)
    moved = int(round(current_ratio * total))

    def flatten(row: int, col: int) -> int:
        return row * width + col

    def unflatten(index: int) -> Tuple[int, int]:
        return index // width, index % width

    while total > 0 and moved / total > target_ratio:
        wrong_positions: List[int] = []
        wrong_by_current_color: Dict[int, List[int]] = {}
        for row in range(height):
            for col in range(width):
                if correct[row][col] <= 0 or grid[row][col] == correct[row][col]:
                    continue
                idx = flatten(row, col)
                wrong_positions.append(idx)
                wrong_by_current_color.setdefault(grid[row][col], []).append(idx)

        best_pair: Tuple[int, int] | None = None
        best_gain = 0
        for idx_a in wrong_positions:
            row_a, col_a = unflatten(idx_a)
            desired_color = correct[row_a][col_a]
            current_color = grid[row_a][col_a]
            for idx_b in wrong_by_current_color.get(desired_color, []):
                if idx_a == idx_b:
                    continue
                row_b, col_b = unflatten(idx_b)
                gain = 1
                if correct[row_b][col_b] == current_color:
                    gain = 2
                if gain > best_gain:
                    best_pair = (idx_a, idx_b)
                    best_gain = gain
                    if gain == 2:
                        break
            if best_gain == 2:
                break

        if best_pair is None or best_gain <= 0:
            break

        row_a, col_a = unflatten(best_pair[0])
        row_b, col_b = unflatten(best_pair[1])
        grid[row_a][col_a], grid[row_b][col_b] = grid[row_b][col_b], grid[row_a][col_a]
        moved = max(0, moved - best_gain)

    return grid, displacement_ratio(correct, grid)


def choose_best_init(
    correct: Grid,
    base_seed: int,
    attempts: int,
    min_groups_per_color: int,
    max_groups_per_color: int,
    target_displacement: float | None = None,
    min_displacement: float | None = None,
    max_displacement: float | None = None,
    minstep_mode: str = "off",
    target_min_steps: int | None = None,
    min_min_steps: int | None = None,
    max_min_steps: int | None = None,
) -> Dict[str, object]:
    best_grid: Grid | None = None
    best_ratio = -1.0
    best_seed = base_seed
    best_groups = max_groups_per_color
    best_min_steps: int | None = None
    best_minstep_solver: str | None = None
    best_score: float | None = None
    total_attempts = max(1, attempts)
    for group_count in range(min_groups_per_color, max_groups_per_color + 1):
        for attempt in range(total_attempts):
            seed = base_seed + group_count * 131 + attempt * 9973
            init_grid = assign_initial_layout(
                correct,
                seed=seed,
                max_groups_per_color=group_count,
            )
            ratio = displacement_ratio(correct, init_grid)
            soften_target = target_displacement
            if soften_target is None and max_displacement is not None:
                soften_target = max_displacement
            if soften_target is not None:
                soften_target = clamp(float(soften_target), 0.0, 0.999)
            if soften_target is not None and ratio > soften_target:
                init_grid, ratio = soften_init_layout(correct, init_grid, soften_target)
            min_steps, minstep_solver = estimate_candidate_min_steps(correct, init_grid, minstep_mode)
            displacement_penalty = score_against_range(
                ratio,
                target_displacement,
                min_displacement,
                max_displacement,
            )
            minstep_penalty = 0.0
            if min_steps is not None:
                minstep_penalty = score_against_range(
                    float(min_steps),
                    float(target_min_steps) if target_min_steps is not None else None,
                    float(min_min_steps) if min_min_steps is not None else None,
                    float(max_min_steps) if max_min_steps is not None else None,
                    range_weight=24.0,
                    target_weight=8.0,
                )
            base_score = -displacement_penalty - minstep_penalty
            if target_displacement is None and min_displacement is None and max_displacement is None:
                base_score += ratio * 100.0
            if min_steps is None and target_min_steps is None and min_min_steps is None and max_min_steps is None:
                base_score += group_count * 0.25

            if best_score is None or base_score > best_score or (
                math.isclose(base_score, best_score, abs_tol=1e-9) and ratio > best_ratio
            ):
                best_grid = init_grid
                best_ratio = ratio
                best_seed = seed
                best_groups = group_count
                best_min_steps = min_steps
                best_minstep_solver = minstep_solver
                best_score = base_score
    if best_grid is None:
        raise ValueError("Unable to generate an initial shuffled board")
    return {
        "init_grid": best_grid,
        "displacement_ratio": best_ratio,
        "seed": best_seed,
        "group_count": best_groups,
        "score": round(best_score or 0.0, 4),
        "min_step_count": best_min_steps,
        "min_step_solver": best_minstep_solver,
    }


def build_updated_payload(
    payload: Dict[str, object],
    init_grid: Grid,
    ratio: float,
    chosen_seed: int,
    chosen_group_count: int | None = None,
) -> Dict[str, object]:
    correct = payload["correctColorArr"]
    width, height = validate_grid(correct)
    stats = count_colors(correct)
    filled = filled_count(correct)
    updated = dict(payload)
    updated["boardWidth"] = width
    updated["boardHeight"] = height
    updated["slotTotalCount"] = filled
    updated["filledCellCount"] = filled
    updated["colorCount"] = len(stats)
    updated["colorStats"] = stats
    updated["displacementRatio"] = round(ratio, 4)
    updated["initRandomColorArr"] = init_grid
    updated["initShuffleSeed"] = chosen_seed
    if chosen_group_count is not None:
        updated["initShuffleMaxGroupsPerColor"] = chosen_group_count
    if "timeLimit" not in updated:
        updated["timeLimit"] = default_time_limit(filled)
    return updated


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path

    payload = load_payload(input_path)
    correct = payload["correctColorArr"]
    validate_grid(correct)

    base_seed = derive_seed(payload, args.seed)
    search_config = resolve_search_config(args)
    chosen = choose_best_init(
        correct=correct,
        base_seed=base_seed,
        attempts=args.attempts,
        min_groups_per_color=int(search_config["min_groups"]),
        max_groups_per_color=int(search_config["max_groups"]),
        target_displacement=search_config["target_displacement"],
        min_displacement=search_config["min_displacement"],
        max_displacement=search_config["max_displacement"],
        minstep_mode=str(search_config["minstep_mode"]),
        target_min_steps=search_config["target_min_steps"],
        min_min_steps=search_config["min_min_steps"],
        max_min_steps=search_config["max_min_steps"],
    )
    updated = build_updated_payload(
        payload=payload,
        init_grid=chosen["init_grid"],
        ratio=float(chosen["displacement_ratio"]),
        chosen_seed=int(chosen["seed"]),
        chosen_group_count=int(chosen["group_count"]),
    )
    if chosen["min_step_count"] is not None:
        updated["minStepCount"] = int(chosen["min_step_count"])
        updated["minStepSolver"] = chosen["min_step_solver"]
        updated["minStepSlotCapacity"] = int(DEFAULT_SLOT_CAPACITY)
    write_json(output_path, updated)

    if args.moves_output:
        move_payload = {
            "levelId": int(updated.get("levelId", 0) or 0),
            "animal": updated.get("animal", "custom"),
            "style": updated.get("style"),
            "seed": int(chosen["seed"]),
            "moveCount": filled_count(correct),
            "displacementRatio": updated["displacementRatio"],
            "moveMap": build_move_map(correct, chosen["init_grid"]),
        }
        write_json(Path(args.moves_output), move_payload)

    report_payload = {
        "input": str(input_path),
        "output": str(output_path),
        "difficulty": search_config["difficulty"],
        "seed": int(chosen["seed"]),
        "attempts": max(1, args.attempts),
        "size": f"{updated['boardWidth']}x{updated['boardHeight']}",
        "colors": updated["colorCount"],
        "filled": updated["filledCellCount"],
        "ratio": updated["displacementRatio"],
        "groupCount": int(chosen["group_count"]),
        "targetDisplacement": search_config["target_displacement"],
        "displacementRange": [
            search_config["min_displacement"],
            search_config["max_displacement"],
        ],
        "minStepMode": search_config["minstep_mode"],
        "minStepCount": chosen["min_step_count"],
        "minStepTarget": search_config["target_min_steps"],
        "minStepRange": [
            search_config["min_min_steps"],
            search_config["max_min_steps"],
        ],
        "selectionScore": chosen["score"],
    }
    if args.report_output:
        write_json(Path(args.report_output), report_payload)

    print(
        json.dumps(
            report_payload,
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
