#!/usr/bin/env python3
import json
import sys
from collections import Counter, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))

from generate_initial_shuffle import build_updated_payload, choose_best_init
from move_target_to_initial import (
    assign_initial_layout,
    displacement_ratio,
)

DIRS4 = ((-1, 0), (1, 0), (0, -1), (0, 1))


def active_inventory(grid):
    return Counter(value for row in grid for value in row if value > 0)


def outline(grid):
    return [[value > 0 for value in row] for row in grid]


def component_counts(grid):
    visited = set()
    result = Counter()
    for row, line in enumerate(grid):
        for col, color in enumerate(line):
            if color <= 0 or (row, col) in visited:
                continue
            result[color] += 1
            queue = deque([(row, col)])
            visited.add((row, col))
            while queue:
                current_row, current_col = queue.popleft()
                for dr, dc in DIRS4:
                    nr, nc = current_row + dr, current_col + dc
                    if nr < 0 or nc < 0 or nr >= len(grid) or nc >= len(grid[nr]):
                        continue
                    if (nr, nc) in visited or grid[nr][nc] != color:
                        continue
                    visited.add((nr, nc))
                    queue.append((nr, nc))
    return result


def main() -> None:
    toy = [
        [1, 1, 2, 2],
        [1, 1, 2, 2],
        [3, 3, 4, 4],
    ]
    implicit = assign_initial_layout(toy, seed=1701, max_groups_per_color=2)
    explicit = assign_initial_layout(toy, seed=1701, max_groups_per_color=2, layout_mode="clustered")
    if implicit != explicit:
        raise AssertionError("default clustered mode changed")

    ordered = assign_initial_layout(toy, seed=1701, max_groups_per_color=1, layout_mode="target-color-ordered")
    repeated = assign_initial_layout(toy, seed=1701, max_groups_per_color=1, layout_mode="target-color-ordered")
    if ordered != repeated:
        raise AssertionError("target-color-ordered mode must be deterministic")
    if active_inventory(ordered) != active_inventory(toy):
        raise AssertionError("target-color-ordered mode changed color inventory")
    if outline(ordered) != outline(toy):
        raise AssertionError("target-color-ordered mode changed the active-cell mask")

    level_path = ROOT / "assets" / "LevelData" / "level_3.json"
    selected = json.loads(level_path.read_text(encoding="utf-8"))
    correct = selected["correctColorArr"]

    chosen = choose_best_init(
        correct=correct,
        base_seed=20285059,
        attempts=1,
        min_groups_per_color=1,
        max_groups_per_color=1,
        target_displacement=0.85,
        min_displacement=0.80,
        max_displacement=0.90,
        layout_mode="target-color-ordered",
    )
    updated = build_updated_payload(
        selected,
        chosen["init_grid"],
        chosen["displacement_ratio"],
        chosen["seed"],
        chosen["group_count"],
        chosen["layout_mode"],
    )
    if updated.get("initShuffleMode") != "target-color-ordered":
        raise AssertionError("generated payload did not record the layout mode")
    initial = updated["initRandomColorArr"]
    components = component_counts(initial)
    if set(components) != set(active_inventory(correct)):
        raise AssertionError("generated layout changed the color set")
    if any(count != 1 for count in components.values()):
        raise AssertionError(f"each bean color must have one 4-way component: {dict(components)}")
    if sum(components.values()) != len(active_inventory(correct)):
        raise AssertionError("generated layout has extra bean-color components")
    if active_inventory(initial) != active_inventory(correct):
        raise AssertionError("generated layout changed color inventory")
    if outline(initial) != outline(correct):
        raise AssertionError("generated layout changed the active-cell mask")
    if displacement_ratio(correct, initial) < 0.80:
        raise AssertionError("generated layout did not reach 80% displacement")
    print("target-color-ordered-shuffle.test.py passed")


if __name__ == "__main__":
    main()
