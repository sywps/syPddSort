#!/usr/bin/env python3
"""Import extracted original PCH levels into game-pdd-v2 LevelData."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = ROOT / "tools" / "dbt"
DEFAULT_OUTPUT = ROOT / "assets" / "LevelData"
AGGREGATE_NAME = "levels_original_1_182_gameplay_v2.json"
SOURCE_GAME = "pch-original-package"
STACK_DEPTH = 3


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--start-level", type=int, default=21)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return payload


def project_relative(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix() if not path.is_absolute() else path.name


def count_nonzero(grid: list[list[int]]) -> Counter[int]:
    return Counter(value for row in grid for value in row if int(value) > 0)


def validate_grid(name: str, grid: Any, width: int, height: int) -> list[list[int]]:
    if not isinstance(grid, list) or len(grid) != height:
        raise ValueError(f"{name} must contain {height} rows")
    normalized: list[list[int]] = []
    for row_index, row in enumerate(grid):
        if not isinstance(row, list) or len(row) != width:
            raise ValueError(f"{name}[{row_index}] must contain {width} columns")
        normalized.append([max(0, int(value)) for value in row])
    return normalized


def validate_source_level(path: Path, expected_source_level: int) -> dict[str, Any]:
    payload = read_json(path)
    source_level = int(payload.get("levelId") or 0)
    if source_level != expected_source_level:
        raise ValueError(f"{project_relative(path)} has levelId={source_level}, expected {expected_source_level}")
    width = int(payload.get("boardWidth") or 0)
    height = int(payload.get("boardHeight") or 0)
    if width <= 0 or height <= 0:
        raise ValueError(f"{project_relative(path)} has invalid board size {width}x{height}")
    capacity = int(payload.get("conveyorCapacity") or 0)
    if capacity <= 0 or capacity % STACK_DEPTH != 0:
        raise ValueError(f"{project_relative(path)} has invalid conveyorCapacity={capacity}")
    correct = validate_grid("correctColorArr", payload.get("correctColorArr"), width, height)
    initial = validate_grid("initRandomColorArr", payload.get("initRandomColorArr"), width, height)
    correct_inventory = count_nonzero(correct)
    initial_inventory = count_nonzero(initial)
    if correct_inventory != initial_inventory:
        raise ValueError(f"{project_relative(path)} target and initial inventories differ")
    slot_total = int(payload.get("slotTotalCount") or 0)
    filled = sum(correct_inventory.values())
    if slot_total != filled:
        raise ValueError(f"{project_relative(path)} slotTotalCount={slot_total}, expected {filled}")
    payload["correctColorArr"] = correct
    payload["initRandomColorArr"] = initial
    return payload


def load_source_levels(source_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    aggregate_path = source_dir / AGGREGATE_NAME
    aggregate = read_json(aggregate_path)
    levels = aggregate.get("levels")
    level_count = int(aggregate.get("level_count") or 0)
    if not isinstance(levels, list) or len(levels) != level_count:
        raise ValueError(f"{project_relative(aggregate_path)} levels array does not match level_count")
    converted: list[dict[str, Any]] = []
    for source_level in range(1, level_count + 1):
        converted.append(validate_source_level(source_dir / f"level_{source_level}.json", source_level))
    return aggregate, converted


def convert_level(
    aggregate_path: Path,
    aggregate: dict[str, Any],
    source_path: Path,
    source_level: dict[str, Any],
    target_level_id: int,
) -> dict[str, Any]:
    inventory = count_nonzero(source_level["correctColorArr"])
    color_ids = sorted(inventory)
    result = dict(source_level)
    result["levelId"] = target_level_id
    result["filledCellCount"] = sum(inventory.values())
    result["colorCount"] = len(color_ids)
    result["colorStats"] = {str(color_id): inventory[color_id] for color_id in color_ids}
    result["sourceGame"] = SOURCE_GAME
    result["sourceKind"] = str(aggregate.get("source_kind") or "unknown")
    result["sourceAggregate"] = project_relative(aggregate_path)
    result["sourceLevelFile"] = project_relative(source_path)
    result["sourceLevel"] = int(source_level["levelId"])
    return result


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    if args.start_level < 1:
        raise ValueError("--start-level must be positive")
    aggregate, source_levels = load_source_levels(args.source_dir)
    aggregate_path = args.source_dir / AGGREGATE_NAME
    for index, source_level in enumerate(source_levels):
        target_level_id = args.start_level + index
        source_path = args.source_dir / f"level_{source_level['levelId']}.json"
        converted = convert_level(aggregate_path, aggregate, source_path, source_level, target_level_id)
        target_path = args.output / f"level_{target_level_id}.json"
        if args.dry_run:
            print(
                f"{project_relative(target_path)} <= {project_relative(source_path)} "
                f"{converted['boardWidth']}x{converted['boardHeight']} beans={converted['filledCellCount']}"
            )
        else:
            write_json(target_path, converted)
            print(f"wrote {project_relative(target_path)} from {project_relative(source_path)}")


if __name__ == "__main__":
    main()
