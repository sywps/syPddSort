#!/usr/bin/env python3
"""Generate a bunny-on-scooter level from the provided reference style."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from generate_cute_target import (
    boundary_mask,
    count_colors,
    ellipse_mask,
    fill_ellipse,
    fill_rect,
    intersection,
    layer_fill,
    make_grid,
    make_mask,
    paint_mask,
    rect_mask,
    subtract,
)
from generate_initial_shuffle import build_updated_payload, choose_best_init
from move_target_to_initial import build_move_map

ROOT = Path(__file__).resolve().parent.parent
LEVEL_DIR = ROOT / "assets" / "RemoteBundle" / "LevelData"
DEBUG_DIR = ROOT / "tools" / "generated_levels"

LEVEL_ID = 100017
BASE_WIDTH = 18
BASE_HEIGHT = 25
SCALE = 3
WIDTH = BASE_WIDTH * SCALE
HEIGHT = BASE_HEIGHT * SCALE
TARGET_SEED = 2026042301
INIT_SEED = 2026042415

BROWN = 8
YELLOW = 3
GOLD = 14
PINK = 7
PEACH = 20
WHITE = 9
BLUE = 5
NAVY = 10


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_meta(path: Path) -> None:
    meta_path = Path(str(path) + ".meta")
    if meta_path.exists():
        return
    payload = {
        "ver": "2.0.1",
        "importer": "json",
        "imported": True,
        "uuid": str(uuid.uuid4()),
        "files": [".json"],
        "subMetas": {},
        "userData": {},
    }
    meta_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def circle_mask(width: int, height: int, cx: float, cy: float, r: float):
    return ellipse_mask(width, height, cx, cy, r, r)


def scale_mask(mask: list[list[bool]], factor: int) -> list[list[bool]]:
    scaled = make_mask(len(mask[0]) * factor, len(mask) * factor)
    for row, line in enumerate(mask):
        for col, value in enumerate(line):
            if not value:
                continue
            for dr in range(factor):
                for dc in range(factor):
                    scaled[row * factor + dr][col * factor + dc] = True
    return scaled


def paint_cells(mask: list[list[bool]], cells: list[tuple[int, int]]) -> None:
    for row, col in cells:
        if 0 <= row < len(mask) and 0 <= col < len(mask[0]):
            mask[row][col] = True


def build_target_grid() -> list[list[int]]:
    bunny = make_mask(BASE_WIDTH, BASE_HEIGHT)
    scooter = make_mask(BASE_WIDTH, BASE_HEIGHT)
    wheel_left = make_mask(BASE_WIDTH, BASE_HEIGHT)
    wheel_right = make_mask(BASE_WIDTH, BASE_HEIGHT)
    face_features = make_mask(BASE_WIDTH, BASE_HEIGHT)
    body_lines = make_mask(BASE_WIDTH, BASE_HEIGHT)
    hand = make_mask(BASE_WIDTH, BASE_HEIGHT)
    scooter_highlight = make_mask(BASE_WIDTH, BASE_HEIGHT)
    light_mask = make_mask(BASE_WIDTH, BASE_HEIGHT)
    light_core = make_mask(BASE_WIDTH, BASE_HEIGHT)
    wheel_left_white = make_mask(BASE_WIDTH, BASE_HEIGHT)
    wheel_right_white = make_mask(BASE_WIDTH, BASE_HEIGHT)
    wheel_left_core = make_mask(BASE_WIDTH, BASE_HEIGHT)
    wheel_right_core = make_mask(BASE_WIDTH, BASE_HEIGHT)
    blush_left = make_mask(BASE_WIDTH, BASE_HEIGHT)
    blush_right = make_mask(BASE_WIDTH, BASE_HEIGHT)
    blush_left_core = make_mask(BASE_WIDTH, BASE_HEIGHT)
    blush_right_core = make_mask(BASE_WIDTH, BASE_HEIGHT)
    tail_mask = make_mask(BASE_WIDTH, BASE_HEIGHT)
    tail_core = make_mask(BASE_WIDTH, BASE_HEIGHT)
    ear_left_inner = make_mask(BASE_WIDTH, BASE_HEIGHT)
    ear_right_inner = make_mask(BASE_WIDTH, BASE_HEIGHT)

    # Bunny silhouette in low-res pixel space.
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 7.2, 7.9, 4.7, 5.9))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 7.7, 15.9, 4.8, 6.4))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 4.7, 2.2, 1.6, 6.1))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 8.9, 2.3, 1.55, 5.8))
    paint_mask(bunny, rect_mask(BASE_WIDTH, BASE_HEIGHT, 8.8, 4.4, 10.0, 8.9))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 5.9, 14.8, 1.8, 2.8))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 10.4, 11.0, 1.3, 2.9))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 10.2, 15.4, 2.0, 3.0))
    paint_mask(bunny, rect_mask(BASE_WIDTH, BASE_HEIGHT, 4.8, 18.0, 10.8, 21.5))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 6.9, 19.4, 2.4, 1.9))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 4.3, 15.9, 1.4, 1.4))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 8.5, 18.3, 1.6, 2.0))
    paint_mask(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 5.0, 11.7, 1.1, 1.6))
    bunny = subtract(bunny, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 6.8, 2.5, 0.65, 2.2))

    # Scooter silhouette.
    paint_mask(scooter, rect_mask(BASE_WIDTH, BASE_HEIGHT, 2.2, 20.0, 15.2, 21.5))
    paint_mask(scooter, rect_mask(BASE_WIDTH, BASE_HEIGHT, 11.8, 14.2, 12.9, 20.6))
    paint_mask(scooter, rect_mask(BASE_WIDTH, BASE_HEIGHT, 10.0, 13.2, 15.6, 14.3))
    paint_mask(scooter, rect_mask(BASE_WIDTH, BASE_HEIGHT, 8.0, 19.0, 8.7, 20.2))
    paint_mask(wheel_left, circle_mask(BASE_WIDTH, BASE_HEIGHT, 4.6, 22.6, 1.6))
    paint_mask(wheel_right, circle_mask(BASE_WIDTH, BASE_HEIGHT, 13.1, 22.6, 1.6))
    paint_mask(scooter, wheel_left)
    paint_mask(scooter, wheel_right)

    # Face and body lines.
    paint_cells(
        face_features,
        [
            (7, 6),
            (8, 6),
            (7, 9),
            (8, 9),
            (10, 8),
            (10, 9),
        ],
    )
    fill_rect(body_lines, 7.2, 2.8, 7.7, 5.6)
    fill_rect(body_lines, 7.75, 12.2, 8.0, 14.5)
    fill_rect(body_lines, 8.25, 12.25, 9.7, 12.45)
    fill_rect(body_lines, 8.55, 15.15, 10.0, 15.35)
    fill_rect(body_lines, 7.95, 17.2, 8.65, 17.4)

    # Blush, nose and tail.
    paint_mask(blush_left, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 4.45, 9.25, 1.55, 1.25))
    paint_mask(blush_right, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 10.95, 9.25, 1.55, 1.25))
    paint_mask(blush_left_core, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 4.15, 9.1, 0.95, 0.8))
    paint_mask(blush_right_core, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 11.25, 9.1, 0.95, 0.8))
    paint_mask(tail_mask, circle_mask(BASE_WIDTH, BASE_HEIGHT, 3.8, 16.0, 1.2))
    paint_mask(tail_core, circle_mask(BASE_WIDTH, BASE_HEIGHT, 3.2, 15.6, 0.45))
    paint_mask(ear_left_inner, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 4.8, 3.2, 0.3, 1.6))
    paint_mask(ear_right_inner, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 8.8, 3.3, 0.3, 1.4))

    # Scooter coloring and details.
    paint_mask(scooter_highlight, rect_mask(BASE_WIDTH, BASE_HEIGHT, 2.9, 20.2, 14.6, 20.8))
    paint_mask(scooter_highlight, rect_mask(BASE_WIDTH, BASE_HEIGHT, 10.5, 13.4, 14.8, 13.9))
    paint_mask(scooter_highlight, rect_mask(BASE_WIDTH, BASE_HEIGHT, 12.1, 14.8, 12.5, 19.7))
    paint_mask(light_mask, rect_mask(BASE_WIDTH, BASE_HEIGHT, 13.5, 14.0, 14.7, 16.4))
    paint_mask(light_core, rect_mask(BASE_WIDTH, BASE_HEIGHT, 14.0, 14.5, 14.5, 15.7))
    paint_mask(wheel_left_white, circle_mask(BASE_WIDTH, BASE_HEIGHT, 4.6, 22.6, 0.85))
    paint_mask(wheel_right_white, circle_mask(BASE_WIDTH, BASE_HEIGHT, 13.1, 22.6, 0.85))
    paint_mask(wheel_left_core, circle_mask(BASE_WIDTH, BASE_HEIGHT, 4.6, 22.6, 0.35))
    paint_mask(wheel_right_core, circle_mask(BASE_WIDTH, BASE_HEIGHT, 13.1, 22.6, 0.35))

    # Hand over the handlebar in low-res before scaling.
    paint_mask(hand, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 12.0, 13.3, 0.8, 0.7))
    paint_mask(hand, ellipse_mask(BASE_WIDTH, BASE_HEIGHT, 12.8, 13.3, 0.5, 0.5))
    nose_mask = make_mask(BASE_WIDTH, BASE_HEIGHT)
    paint_cells(nose_mask, [(9, 8)])

    # Scale masks first, then redraw a thin outline in the high-res board.
    bunny = scale_mask(bunny, SCALE)
    scooter = scale_mask(scooter, SCALE)
    wheel_left = scale_mask(wheel_left, SCALE)
    wheel_right = scale_mask(wheel_right, SCALE)
    face_features = scale_mask(face_features, SCALE)
    body_lines = scale_mask(body_lines, SCALE)
    hand = scale_mask(hand, SCALE)
    scooter_highlight = scale_mask(scooter_highlight, SCALE)
    light_mask = scale_mask(light_mask, SCALE)
    light_core = scale_mask(light_core, SCALE)
    wheel_left_white = scale_mask(wheel_left_white, SCALE)
    wheel_right_white = scale_mask(wheel_right_white, SCALE)
    wheel_left_core = scale_mask(wheel_left_core, SCALE)
    wheel_right_core = scale_mask(wheel_right_core, SCALE)
    blush_left = scale_mask(blush_left, SCALE)
    blush_right = scale_mask(blush_right, SCALE)
    blush_left_core = scale_mask(blush_left_core, SCALE)
    blush_right_core = scale_mask(blush_right_core, SCALE)
    tail_mask = scale_mask(tail_mask, SCALE)
    tail_core = scale_mask(tail_core, SCALE)
    ear_left_inner = scale_mask(ear_left_inner, SCALE)
    ear_right_inner = scale_mask(ear_right_inner, SCALE)
    nose_mask = scale_mask(nose_mask, SCALE)

    bunny_boundary = boundary_mask(bunny)
    bunny_fill = subtract(bunny, bunny_boundary)
    scooter_boundary = boundary_mask(scooter)
    scooter_fill = subtract(scooter, scooter_boundary)
    wheel_left_boundary = boundary_mask(wheel_left)
    wheel_right_boundary = boundary_mask(wheel_right)

    grid = make_grid(WIDTH, HEIGHT, 0)
    layer_fill(grid, bunny_boundary, BROWN)
    layer_fill(grid, bunny_fill, WHITE)
    layer_fill(grid, intersection(ear_left_inner, bunny_fill), PEACH)
    layer_fill(grid, intersection(ear_right_inner, bunny_fill), PEACH)
    layer_fill(grid, intersection(face_features, bunny), BROWN)
    layer_fill(grid, intersection(body_lines, bunny), BROWN)
    layer_fill(grid, intersection(blush_left, bunny_fill), PINK)
    layer_fill(grid, intersection(blush_right, bunny_fill), PINK)
    layer_fill(grid, intersection(blush_left_core, bunny_fill), PEACH)
    layer_fill(grid, intersection(blush_right_core, bunny_fill), PEACH)
    layer_fill(grid, intersection(nose_mask, bunny_fill), PINK)
    layer_fill(grid, intersection(tail_mask, bunny_fill), PINK)
    layer_fill(grid, intersection(tail_core, tail_mask), WHITE)
    layer_fill(grid, scooter_boundary, NAVY)
    layer_fill(grid, scooter_fill, NAVY)
    layer_fill(grid, intersection(scooter_highlight, scooter_fill), BLUE)
    layer_fill(grid, wheel_left_boundary, BROWN)
    layer_fill(grid, wheel_right_boundary, BROWN)
    layer_fill(grid, intersection(light_mask, scooter_fill), GOLD)
    layer_fill(grid, intersection(light_core, scooter_fill), YELLOW)
    layer_fill(grid, intersection(wheel_left_white, scooter_fill), WHITE)
    layer_fill(grid, intersection(wheel_right_white, scooter_fill), WHITE)
    layer_fill(grid, intersection(wheel_left_core, scooter_fill), YELLOW)
    layer_fill(grid, intersection(wheel_right_core, scooter_fill), YELLOW)
    layer_fill(grid, intersection(hand, bunny_fill), WHITE)

    return grid


def main() -> None:
    LEVEL_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    correct = build_target_grid()
    target_payload = {
        "levelId": LEVEL_ID,
        "animal": "bunny_scooter",
        "style": "reference_image",
        "seed": TARGET_SEED,
        "boardWidth": WIDTH,
        "boardHeight": HEIGHT,
        "colorCount": len(count_colors(correct)),
        "filledCellCount": sum(count_colors(correct).values()),
        "correctColorArr": correct,
        "colorStats": count_colors(correct),
    }

    chosen = choose_best_init(
        correct=correct,
        base_seed=INIT_SEED,
        attempts=18,
        min_groups_per_color=3,
        max_groups_per_color=6,
        target_displacement=0.92,
        min_displacement=0.84,
        max_displacement=0.98,
    )
    level_payload = build_updated_payload(
        target_payload,
        chosen["init_grid"],
        float(chosen["displacement_ratio"]),
        int(chosen["seed"]),
        chosen_group_count=int(chosen["group_count"]),
    )
    move_payload = {
        "levelId": LEVEL_ID,
        "animal": "bunny_scooter",
        "style": "reference_image",
        "moveCount": level_payload["filledCellCount"],
        "displacementRatio": level_payload["displacementRatio"],
        "moveMap": build_move_map(correct, chosen["init_grid"]),
    }

    level_path = LEVEL_DIR / f"level_{LEVEL_ID}.json"
    target_path = DEBUG_DIR / f"level_{LEVEL_ID}_target.json"
    moves_path = DEBUG_DIR / f"level_{LEVEL_ID}_moves.json"

    write_json(level_path, level_payload)
    write_json(target_path, target_payload)
    write_json(moves_path, move_payload)
    write_meta(level_path)

    print(
        json.dumps(
            {
                "levelId": LEVEL_ID,
                "animal": "bunny_scooter",
                "style": "reference_image",
                "size": f"{WIDTH}x{HEIGHT}",
                "colors": level_payload["colorCount"],
                "filled": level_payload["filledCellCount"],
                "ratio": level_payload["displacementRatio"],
                "output": str(level_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
