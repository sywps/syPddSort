#!/usr/bin/env python3
"""Generate a cute animal target board for the bead puzzle."""

from __future__ import annotations

import argparse
import json
import math
import random
from typing import Dict, Iterable, List, Sequence, Tuple

Grid = List[List[int]]
Mask = List[List[bool]]
Point = Tuple[int, int]

DEFAULT_PALETTE = [3, 1, 2, 6, 5, 7, 8, 9, 10, 4, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]


def make_grid(width: int, height: int, value: int = 0) -> Grid:
    return [[value for _ in range(width)] for _ in range(height)]


def make_mask(width: int, height: int, value: bool = False) -> Mask:
    return [[value for _ in range(width)] for _ in range(height)]


def clone_mask(mask: Mask) -> Mask:
    return [row[:] for row in mask]


def in_bounds(mask: Mask, row: int, col: int) -> bool:
    return 0 <= row < len(mask) and 0 <= col < len(mask[0])


def paint_mask(dst: Mask, src: Mask) -> None:
    for row in range(len(dst)):
        for col in range(len(dst[0])):
            if src[row][col]:
                dst[row][col] = True


def fill_ellipse(mask: Mask, cx: float, cy: float, rx: float, ry: float) -> None:
    if rx <= 0 or ry <= 0:
        return
    for row in range(len(mask)):
        for col in range(len(mask[0])):
            nx = (col - cx) / rx
            ny = (row - cy) / ry
            if nx * nx + ny * ny <= 1.0:
                mask[row][col] = True


def fill_rect(mask: Mask, left: float, top: float, right: float, bottom: float) -> None:
    r0 = max(0, math.floor(top))
    r1 = min(len(mask) - 1, math.ceil(bottom))
    c0 = max(0, math.floor(left))
    c1 = min(len(mask[0]) - 1, math.ceil(right))
    for row in range(r0, r1 + 1):
        for col in range(c0, c1 + 1):
            mask[row][col] = True


def fill_triangle(mask: Mask, p1: Tuple[float, float], p2: Tuple[float, float], p3: Tuple[float, float]) -> None:
    xs = [p1[0], p2[0], p3[0]]
    ys = [p1[1], p2[1], p3[1]]
    c0 = max(0, math.floor(min(xs)))
    c1 = min(len(mask[0]) - 1, math.ceil(max(xs)))
    r0 = max(0, math.floor(min(ys)))
    r1 = min(len(mask) - 1, math.ceil(max(ys)))

    def sign(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
        return (px - bx) * (ay - by) - (ax - bx) * (py - by)

    for row in range(r0, r1 + 1):
        for col in range(c0, c1 + 1):
            px = col + 0.5
            py = row + 0.5
            d1 = sign(px, py, *p1, *p2)
            d2 = sign(px, py, *p2, *p3)
            d3 = sign(px, py, *p3, *p1)
            has_neg = d1 < 0 or d2 < 0 or d3 < 0
            has_pos = d1 > 0 or d2 > 0 or d3 > 0
            if not (has_neg and has_pos):
                mask[row][col] = True


def ellipse_mask(width: int, height: int, cx: float, cy: float, rx: float, ry: float) -> Mask:
    mask = make_mask(width, height)
    fill_ellipse(mask, cx, cy, rx, ry)
    return mask


def rect_mask(width: int, height: int, left: float, top: float, right: float, bottom: float) -> Mask:
    mask = make_mask(width, height)
    fill_rect(mask, left, top, right, bottom)
    return mask


def triangle_mask(
    width: int,
    height: int,
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    p3: Tuple[float, float],
) -> Mask:
    mask = make_mask(width, height)
    fill_triangle(mask, p1, p2, p3)
    return mask


def intersection(a: Mask, b: Mask) -> Mask:
    result = make_mask(len(a[0]), len(a))
    for row in range(len(a)):
        for col in range(len(a[0])):
            result[row][col] = a[row][col] and b[row][col]
    return result


def subtract(a: Mask, b: Mask) -> Mask:
    result = make_mask(len(a[0]), len(a))
    for row in range(len(a)):
        for col in range(len(a[0])):
            result[row][col] = a[row][col] and not b[row][col]
    return result


def boundary_mask(mask: Mask) -> Mask:
    result = make_mask(len(mask[0]), len(mask))
    dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    for row in range(len(mask)):
        for col in range(len(mask[0])):
            if not mask[row][col]:
                continue
            for dr, dc in dirs:
                nr, nc = row + dr, col + dc
                if not in_bounds(mask, nr, nc) or not mask[nr][nc]:
                    result[row][col] = True
                    break
    return result


def cells_from_mask(mask: Mask) -> List[Point]:
    cells: List[Point] = []
    for row in range(len(mask)):
        for col in range(len(mask[0])):
            if mask[row][col]:
                cells.append((row, col))
    return cells


def choose_colors(color_count: int, seed: int) -> List[int]:
    rng = random.Random(seed * 131 + 17)
    palette = DEFAULT_PALETTE[:]
    rng.shuffle(palette)
    ordered = [3, 1, 2, 6, 5, 7, 8, 9, 10, 4]
    for color_id in reversed(ordered):
        if color_id in palette:
            palette.remove(color_id)
            palette.insert(0, color_id)
    count = max(6, min(color_count, len(DEFAULT_PALETTE)))
    return palette[:count]


def layer_fill(grid: Grid, mask: Mask, color_id: int, allow_overwrite: bool = True) -> None:
    for row in range(len(grid)):
        for col in range(len(grid[0])):
            if mask[row][col] and (allow_overwrite or grid[row][col] == 0):
                grid[row][col] = color_id


def mask_bounds(mask: Mask) -> Tuple[int, int, int, int]:
    cells = cells_from_mask(mask)
    if not cells:
        return 0, 0, 0, 0
    rows = [row for row, _ in cells]
    cols = [col for _, col in cells]
    return min(rows), max(rows), min(cols), max(cols)


def fill_mask_pattern(grid: Grid, mask: Mask, colors: Sequence[int], mode: str, phase: float = 0.0) -> None:
    cells = cells_from_mask(mask)
    if not cells or not colors:
        return
    min_row, max_row, min_col, max_col = mask_bounds(mask)
    row_span = max(1, max_row - min_row)
    col_span = max(1, max_col - min_col)
    center_row = (min_row + max_row) / 2
    center_col = (min_col + max_col) / 2
    max_radius = max(1.0, math.sqrt((row_span / 2) ** 2 + (col_span / 2) ** 2))

    for row, col in cells:
        x_ratio = (col - min_col) / col_span
        y_ratio = (row - min_row) / row_span
        dx = col - center_col
        dy = row - center_row
        if mode == "horizontal":
            t = y_ratio
        elif mode == "vertical":
            t = x_ratio
        elif mode == "diagonal":
            t = 0.58 * x_ratio + 0.42 * y_ratio + 0.10 * math.sin((x_ratio + y_ratio + phase) * math.pi * 1.6)
        elif mode == "radial":
            t = math.sqrt(dx * dx + dy * dy) / max_radius
        elif mode == "fan":
            t = (math.atan2(dy, dx) + math.pi) / (2 * math.pi)
        elif mode == "rings":
            t = (math.sqrt(dx * dx + dy * dy) / max_radius) * 1.25 + 0.12 * math.sin((x_ratio + phase) * math.pi * 2.0)
        else:
            t = y_ratio
        t = max(0.0, min(0.999, t))
        idx = min(len(colors) - 1, int(t * len(colors)))
        grid[row][col] = colors[idx]


def build_cat_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    cx = width * 0.48
    head_cy = height * 0.33
    body_cy = height * 0.70
    head = ellipse_mask(width, height, cx, head_cy, width * 0.19, height * 0.18)
    body = ellipse_mask(width, height, width * 0.46, body_cy, width * 0.29, height * 0.25)
    bridge = rect_mask(width, height, width * 0.33, height * 0.45, width * 0.60, height * 0.58)
    paw_left = rect_mask(width, height, width * 0.29, height * 0.80, width * 0.35, height * 0.97)
    paw_right = rect_mask(width, height, width * 0.47, height * 0.80, width * 0.53, height * 0.97)
    ear_y = height * 0.05
    left_ear = triangle_mask(
        width,
        height,
        (width * 0.25, height * 0.20),
        (width * 0.37, height * 0.20),
        (width * 0.31, ear_y),
    )
    right_ear = triangle_mask(
        width,
        height,
        (width * 0.55, height * 0.20),
        (width * 0.67, height * 0.20),
        (width * 0.61, ear_y + rng.uniform(-0.4, 0.8)),
    )
    tail_side = 1 if rng.random() > 0.25 else -1
    tail_cx = width * (0.76 if tail_side > 0 else 0.18)
    tail = ellipse_mask(width, height, tail_cx, height * 0.73, width * 0.09, height * 0.21)
    if tail_side > 0:
        tail_bridge = rect_mask(width, height, width * 0.60, height * 0.72, width * 0.72, height * 0.80)
    else:
        tail_bridge = rect_mask(width, height, width * 0.21, height * 0.72, width * 0.33, height * 0.80)
    for layer in [head, body, bridge, paw_left, paw_right, left_ear, right_ear, tail, tail_bridge]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, cx, height * 0.36, width * 0.16, height * 0.12)
    muzzle = ellipse_mask(width, height, cx, height * 0.46, width * 0.12, height * 0.08)
    belly = ellipse_mask(width, height, width * 0.46, height * 0.74, width * 0.15, height * 0.14)
    tail_tip = ellipse_mask(width, height, tail_cx + tail_side * width * 0.02, height * 0.60, width * 0.05, height * 0.10)

    inner_left_ear = triangle_mask(
        width,
        height,
        (width * 0.28, height * 0.19),
        (width * 0.34, height * 0.19),
        (width * 0.31, height * 0.10),
    )
    inner_right_ear = triangle_mask(
        width,
        height,
        (width * 0.58, height * 0.19),
        (width * 0.64, height * 0.19),
        (width * 0.61, height * 0.10),
    )
    inner_ears = intersection(full, make_mask(width, height))
    paint_mask(inner_ears, inner_left_ear)
    paint_mask(inner_ears, inner_right_ear)
    inner_ears = intersection(inner_ears, full)

    left_eye = ellipse_mask(width, height, width * 0.40, height * 0.36, width * 0.025, height * 0.04)
    right_eye = ellipse_mask(width, height, width * 0.54, height * 0.36, width * 0.025, height * 0.04)
    eyes = intersection(full, make_mask(width, height))
    paint_mask(eyes, left_eye)
    paint_mask(eyes, right_eye)
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": intersection(tail_tip, full),
        "inner_ears": inner_ears,
        "eyes": eyes,
    }


def build_bear_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    head = ellipse_mask(width, height, width * 0.50, height * 0.30, width * 0.19, height * 0.17)
    body = ellipse_mask(width, height, width * 0.50, height * 0.70, width * 0.25, height * 0.25)
    ear_left = ellipse_mask(width, height, width * 0.37, height * 0.15, width * 0.06, height * 0.06)
    ear_right = ellipse_mask(width, height, width * 0.63, height * 0.15, width * 0.06, height * 0.06)
    arm_left = ellipse_mask(width, height, width * 0.31, height * 0.68, width * 0.08, height * 0.16)
    arm_right = ellipse_mask(width, height, width * 0.69, height * 0.68, width * 0.08, height * 0.16)
    leg_left = ellipse_mask(width, height, width * 0.42, height * 0.92, width * 0.08, height * 0.08)
    leg_right = ellipse_mask(width, height, width * 0.58, height * 0.92, width * 0.08, height * 0.08)
    for layer in [head, body, ear_left, ear_right, arm_left, arm_right, leg_left, leg_right]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.34, width * 0.14, height * 0.10)
    muzzle = ellipse_mask(width, height, width * 0.50, height * 0.42, width * 0.10, height * 0.07)
    belly = ellipse_mask(width, height, width * 0.50, height * 0.73, width * 0.13, height * 0.14)
    inner_ears = make_mask(width, height)
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.37, height * 0.15, width * 0.03, height * 0.03))
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.63, height * 0.15, width * 0.03, height * 0.03))
    inner_ears = intersection(inner_ears, full)
    eyes = make_mask(width, height)
    eye_offset = width * 0.05 + rng.uniform(-0.3, 0.3)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.50 - eye_offset, height * 0.34, width * 0.02, height * 0.03))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.50 + eye_offset, height * 0.34, width * 0.02, height * 0.03))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": make_mask(width, height),
        "inner_ears": inner_ears,
        "eyes": eyes,
    }


def build_bunny_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    head = ellipse_mask(width, height, width * 0.50, height * 0.34, width * 0.17, height * 0.16)
    body = ellipse_mask(width, height, width * 0.49, height * 0.73, width * 0.24, height * 0.22)
    ear_left = ellipse_mask(width, height, width * 0.41, height * 0.10, width * 0.05, height * 0.15)
    ear_right = ellipse_mask(width, height, width * 0.59, height * 0.10, width * 0.05, height * 0.15)
    paw_left = ellipse_mask(width, height, width * 0.40, height * 0.92, width * 0.07, height * 0.07)
    paw_right = ellipse_mask(width, height, width * 0.58, height * 0.92, width * 0.07, height * 0.07)
    for layer in [head, body, ear_left, ear_right, paw_left, paw_right]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.36, width * 0.12, height * 0.10)
    muzzle = ellipse_mask(width, height, width * 0.50, height * 0.44, width * 0.10, height * 0.07)
    belly = ellipse_mask(width, height, width * 0.49, height * 0.75, width * 0.12, height * 0.12)
    inner_ears = make_mask(width, height)
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.41, height * 0.10, width * 0.02, height * 0.10))
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.59, height * 0.10, width * 0.02, height * 0.10))
    inner_ears = intersection(inner_ears, full)
    eyes = make_mask(width, height)
    eye_y = height * 0.34 + rng.uniform(-0.2, 0.3)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.45, eye_y, width * 0.018, height * 0.03))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.55, eye_y, width * 0.018, height * 0.03))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": make_mask(width, height),
        "inner_ears": inner_ears,
        "eyes": eyes,
    }


def build_fox_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    head = ellipse_mask(width, height, width * 0.50, height * 0.33, width * 0.18, height * 0.15)
    body = ellipse_mask(width, height, width * 0.47, height * 0.72, width * 0.26, height * 0.20)
    chest = rect_mask(width, height, width * 0.38, height * 0.45, width * 0.56, height * 0.64)
    left_ear = triangle_mask(width, height, (width * 0.28, height * 0.20), (width * 0.40, height * 0.20), (width * 0.34, height * 0.03))
    right_ear = triangle_mask(width, height, (width * 0.56, height * 0.20), (width * 0.68, height * 0.20), (width * 0.62, height * 0.03))
    tail = ellipse_mask(width, height, width * 0.74, height * 0.76, width * 0.11, height * 0.19)
    tail_bridge = rect_mask(width, height, width * 0.57, height * 0.70, width * 0.70, height * 0.80)
    for layer in [head, body, chest, left_ear, right_ear, tail, tail_bridge]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.37, width * 0.13, height * 0.09)
    muzzle = ellipse_mask(width, height, width * 0.50, height * 0.44, width * 0.09, height * 0.06)
    belly = ellipse_mask(width, height, width * 0.44, height * 0.76, width * 0.10, height * 0.10)
    tail_tip = ellipse_mask(width, height, width * 0.81, height * 0.62, width * 0.05, height * 0.09)
    inner_ears = make_mask(width, height)
    paint_mask(inner_ears, triangle_mask(width, height, (width * 0.31, height * 0.19), (width * 0.37, height * 0.19), (width * 0.34, height * 0.09)))
    paint_mask(inner_ears, triangle_mask(width, height, (width * 0.59, height * 0.19), (width * 0.65, height * 0.19), (width * 0.62, height * 0.09)))
    inner_ears = intersection(inner_ears, full)
    eyes = make_mask(width, height)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.45, height * 0.35, width * 0.02, height * 0.03))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.55, height * 0.35, width * 0.02, height * 0.03))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": intersection(tail_tip, full),
        "inner_ears": inner_ears,
        "eyes": eyes,
    }


def build_panda_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    head = ellipse_mask(width, height, width * 0.50, height * 0.31, width * 0.20, height * 0.17)
    body = ellipse_mask(width, height, width * 0.50, height * 0.72, width * 0.26, height * 0.23)
    ear_left = ellipse_mask(width, height, width * 0.33, height * 0.15, width * 0.07, height * 0.07)
    ear_right = ellipse_mask(width, height, width * 0.67, height * 0.15, width * 0.07, height * 0.07)
    arm_left = ellipse_mask(width, height, width * 0.31, height * 0.68, width * 0.08, height * 0.16)
    arm_right = ellipse_mask(width, height, width * 0.69, height * 0.68, width * 0.08, height * 0.16)
    leg_left = ellipse_mask(width, height, width * 0.41, height * 0.91, width * 0.08, height * 0.08)
    leg_right = ellipse_mask(width, height, width * 0.59, height * 0.91, width * 0.08, height * 0.08)
    for layer in [head, body, ear_left, ear_right, arm_left, arm_right, leg_left, leg_right]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.34, width * 0.15, height * 0.10)
    muzzle = ellipse_mask(width, height, width * 0.50, height * 0.43, width * 0.10, height * 0.07)
    belly = ellipse_mask(width, height, width * 0.50, height * 0.74, width * 0.13, height * 0.14)
    inner_ears = make_mask(width, height)
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.33, height * 0.15, width * 0.03, height * 0.03))
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.67, height * 0.15, width * 0.03, height * 0.03))
    inner_ears = intersection(inner_ears, full)
    eyes = make_mask(width, height)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.44, height * 0.35, width * 0.025, height * 0.035))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.56, height * 0.35, width * 0.025, height * 0.035))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": make_mask(width, height),
        "inner_ears": inner_ears,
        "eyes": eyes,
    }


def build_chick_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    body = ellipse_mask(width, height, width * 0.50, height * 0.60, width * 0.24, height * 0.25)
    head = ellipse_mask(width, height, width * 0.50, height * 0.28, width * 0.15, height * 0.13)
    wing_left = ellipse_mask(width, height, width * 0.34, height * 0.59, width * 0.07, height * 0.12)
    wing_right = ellipse_mask(width, height, width * 0.66, height * 0.59, width * 0.07, height * 0.12)
    tuft_left = triangle_mask(width, height, (width * 0.44, height * 0.16), (width * 0.50, height * 0.16), (width * 0.46, height * 0.05))
    tuft_right = triangle_mask(width, height, (width * 0.50, height * 0.16), (width * 0.56, height * 0.16), (width * 0.54, height * 0.05))
    foot_left = rect_mask(width, height, width * 0.43, height * 0.87, width * 0.46, height * 0.97)
    foot_right = rect_mask(width, height, width * 0.54, height * 0.87, width * 0.57, height * 0.97)
    for layer in [body, head, wing_left, wing_right, tuft_left, tuft_right, foot_left, foot_right]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.30, width * 0.10, height * 0.08)
    muzzle = triangle_mask(width, height, (width * 0.46, height * 0.38), (width * 0.54, height * 0.38), (width * 0.50, height * 0.46))
    belly = ellipse_mask(width, height, width * 0.50, height * 0.66, width * 0.11, height * 0.11)
    eyes = make_mask(width, height)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.46, height * 0.30, width * 0.018, height * 0.025))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.54, height * 0.30, width * 0.018, height * 0.025))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": make_mask(width, height),
        "inner_ears": make_mask(width, height),
        "eyes": eyes,
    }


def build_puppy_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    head = ellipse_mask(width, height, width * 0.50, height * 0.31, width * 0.19, height * 0.16)
    body = ellipse_mask(width, height, width * 0.50, height * 0.71, width * 0.27, height * 0.22)
    ear_left = ellipse_mask(width, height, width * 0.31, height * 0.29, width * 0.07, height * 0.13)
    ear_right = ellipse_mask(width, height, width * 0.69, height * 0.29, width * 0.07, height * 0.13)
    paw_left = ellipse_mask(width, height, width * 0.40, height * 0.92, width * 0.07, height * 0.07)
    paw_right = ellipse_mask(width, height, width * 0.60, height * 0.92, width * 0.07, height * 0.07)
    tail = ellipse_mask(width, height, width * 0.77, height * 0.67, width * 0.05, height * 0.12)
    tail_bridge = rect_mask(width, height, width * 0.66, height * 0.68, width * 0.76, height * 0.74)
    for layer in [head, body, ear_left, ear_right, paw_left, paw_right, tail, tail_bridge]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.35, width * 0.12, height * 0.09)
    muzzle = ellipse_mask(width, height, width * 0.50, height * 0.43, width * 0.10, height * 0.07)
    belly = ellipse_mask(width, height, width * 0.50, height * 0.73, width * 0.12, height * 0.12)
    inner_ears = make_mask(width, height)
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.32, height * 0.30, width * 0.03, height * 0.07))
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.68, height * 0.30, width * 0.03, height * 0.07))
    inner_ears = intersection(inner_ears, full)
    eyes = make_mask(width, height)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.45, height * 0.34, width * 0.02, height * 0.03))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.55, height * 0.34, width * 0.02, height * 0.03))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": intersection(tail, full),
        "inner_ears": inner_ears,
        "eyes": eyes,
    }


def build_piglet_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    head = ellipse_mask(width, height, width * 0.50, height * 0.30, width * 0.18, height * 0.15)
    body = ellipse_mask(width, height, width * 0.50, height * 0.70, width * 0.26, height * 0.22)
    ear_left = triangle_mask(width, height, (width * 0.33, height * 0.19), (width * 0.42, height * 0.19), (width * 0.36, height * 0.06))
    ear_right = triangle_mask(width, height, (width * 0.58, height * 0.19), (width * 0.67, height * 0.19), (width * 0.64, height * 0.06))
    paw_left = rect_mask(width, height, width * 0.39, height * 0.84, width * 0.43, height * 0.96)
    paw_right = rect_mask(width, height, width * 0.57, height * 0.84, width * 0.61, height * 0.96)
    tail = ellipse_mask(width, height, width * 0.75, height * 0.69, width * 0.04, height * 0.09)
    tail_bridge = rect_mask(width, height, width * 0.65, height * 0.70, width * 0.75, height * 0.74)
    for layer in [head, body, ear_left, ear_right, paw_left, paw_right, tail, tail_bridge]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.34, width * 0.11, height * 0.08)
    muzzle = ellipse_mask(width, height, width * 0.50, height * 0.41, width * 0.11, height * 0.07)
    belly = ellipse_mask(width, height, width * 0.50, height * 0.72, width * 0.12, height * 0.12)
    inner_ears = make_mask(width, height)
    paint_mask(inner_ears, triangle_mask(width, height, (width * 0.35, height * 0.19), (width * 0.39, height * 0.19), (width * 0.37, height * 0.11)))
    paint_mask(inner_ears, triangle_mask(width, height, (width * 0.61, height * 0.19), (width * 0.65, height * 0.19), (width * 0.63, height * 0.11)))
    inner_ears = intersection(inner_ears, full)
    eyes = make_mask(width, height)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.45, height * 0.33, width * 0.02, height * 0.025))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.55, height * 0.33, width * 0.02, height * 0.025))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": intersection(tail, full),
        "inner_ears": inner_ears,
        "eyes": eyes,
    }


def build_koala_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    head = ellipse_mask(width, height, width * 0.50, height * 0.31, width * 0.18, height * 0.16)
    body = ellipse_mask(width, height, width * 0.50, height * 0.71, width * 0.24, height * 0.22)
    ear_left = ellipse_mask(width, height, width * 0.32, height * 0.20, width * 0.08, height * 0.08)
    ear_right = ellipse_mask(width, height, width * 0.68, height * 0.20, width * 0.08, height * 0.08)
    arm_left = ellipse_mask(width, height, width * 0.36, height * 0.66, width * 0.06, height * 0.15)
    arm_right = ellipse_mask(width, height, width * 0.64, height * 0.66, width * 0.06, height * 0.15)
    leg_left = ellipse_mask(width, height, width * 0.42, height * 0.91, width * 0.07, height * 0.07)
    leg_right = ellipse_mask(width, height, width * 0.58, height * 0.91, width * 0.07, height * 0.07)
    for layer in [head, body, ear_left, ear_right, arm_left, arm_right, leg_left, leg_right]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.35, width * 0.12, height * 0.09)
    muzzle = ellipse_mask(width, height, width * 0.50, height * 0.43, width * 0.10, height * 0.07)
    belly = ellipse_mask(width, height, width * 0.50, height * 0.73, width * 0.11, height * 0.12)
    inner_ears = make_mask(width, height)
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.32, height * 0.20, width * 0.04, height * 0.04))
    paint_mask(inner_ears, ellipse_mask(width, height, width * 0.68, height * 0.20, width * 0.04, height * 0.04))
    inner_ears = intersection(inner_ears, full)
    eyes = make_mask(width, height)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.45, height * 0.35, width * 0.02, height * 0.03))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.55, height * 0.35, width * 0.02, height * 0.03))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": make_mask(width, height),
        "inner_ears": inner_ears,
        "eyes": eyes,
    }


def build_raccoon_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    head = ellipse_mask(width, height, width * 0.50, height * 0.31, width * 0.18, height * 0.15)
    body = ellipse_mask(width, height, width * 0.47, height * 0.71, width * 0.24, height * 0.21)
    ear_left = triangle_mask(width, height, (width * 0.34, height * 0.20), (width * 0.42, height * 0.20), (width * 0.38, height * 0.08))
    ear_right = triangle_mask(width, height, (width * 0.58, height * 0.20), (width * 0.66, height * 0.20), (width * 0.62, height * 0.08))
    tail = ellipse_mask(width, height, width * 0.75, height * 0.76, width * 0.10, height * 0.17)
    tail_bridge = rect_mask(width, height, width * 0.59, height * 0.73, width * 0.72, height * 0.81)
    paw_left = ellipse_mask(width, height, width * 0.40, height * 0.92, width * 0.06, height * 0.06)
    paw_right = ellipse_mask(width, height, width * 0.55, height * 0.92, width * 0.06, height * 0.06)
    for layer in [head, body, ear_left, ear_right, tail, tail_bridge, paw_left, paw_right]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.35, width * 0.13, height * 0.08)
    muzzle = ellipse_mask(width, height, width * 0.50, height * 0.43, width * 0.10, height * 0.07)
    belly = ellipse_mask(width, height, width * 0.46, height * 0.74, width * 0.11, height * 0.11)
    inner_ears = make_mask(width, height)
    paint_mask(inner_ears, triangle_mask(width, height, (width * 0.36, height * 0.20), (width * 0.40, height * 0.20), (width * 0.38, height * 0.12)))
    paint_mask(inner_ears, triangle_mask(width, height, (width * 0.60, height * 0.20), (width * 0.64, height * 0.20), (width * 0.62, height * 0.12)))
    inner_ears = intersection(inner_ears, full)
    eyes = make_mask(width, height)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.45, height * 0.35, width * 0.025, height * 0.03))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.55, height * 0.35, width * 0.025, height * 0.03))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": intersection(tail, full),
        "inner_ears": inner_ears,
        "eyes": eyes,
    }


def build_penguin_masks(width: int, height: int, rng: random.Random) -> Dict[str, Mask]:
    full = make_mask(width, height)
    body = ellipse_mask(width, height, width * 0.50, height * 0.62, width * 0.21, height * 0.32)
    head = ellipse_mask(width, height, width * 0.50, height * 0.24, width * 0.15, height * 0.13)
    wing_left = ellipse_mask(width, height, width * 0.34, height * 0.58, width * 0.06, height * 0.16)
    wing_right = ellipse_mask(width, height, width * 0.66, height * 0.58, width * 0.06, height * 0.16)
    foot_left = ellipse_mask(width, height, width * 0.45, height * 0.93, width * 0.05, height * 0.04)
    foot_right = ellipse_mask(width, height, width * 0.55, height * 0.93, width * 0.05, height * 0.04)
    for layer in [body, head, wing_left, wing_right, foot_left, foot_right]:
        paint_mask(full, layer)

    face = ellipse_mask(width, height, width * 0.50, height * 0.28, width * 0.10, height * 0.07)
    muzzle = triangle_mask(width, height, (width * 0.46, height * 0.35), (width * 0.54, height * 0.35), (width * 0.50, height * 0.42))
    belly = ellipse_mask(width, height, width * 0.50, height * 0.66, width * 0.12, height * 0.22)
    eyes = make_mask(width, height)
    paint_mask(eyes, ellipse_mask(width, height, width * 0.46, height * 0.27, width * 0.018, height * 0.024))
    paint_mask(eyes, ellipse_mask(width, height, width * 0.54, height * 0.27, width * 0.018, height * 0.024))
    eyes = intersection(eyes, full)

    return {
        "full": full,
        "head": intersection(head, full),
        "body": intersection(body, full),
        "face": intersection(face, full),
        "muzzle": intersection(muzzle, full),
        "belly": intersection(belly, full),
        "tail_tip": make_mask(width, height),
        "inner_ears": make_mask(width, height),
        "eyes": eyes,
    }


BUTTERFLY_STYLE_CONFIGS: Dict[str, Dict[str, object]] = {
    "monarch": {
        "outline": 10,
        "body": 8,
        "body_highlight": 9,
        "upper_colors": [2, 14, 2, 1],
        "lower_colors": [2, 14, 3],
        "upper_mode": "fan",
        "lower_mode": "radial",
        "accent_upper": 14,
        "accent_lower": 3,
        "tip_spot": 9,
        "lower_spot": 9,
        "geometry": {
            "upper_offset": 0.18,
            "upper_cy": 0.29,
            "upper_rx": 0.16,
            "upper_ry": 0.18,
            "upper_lobe_offset": 0.24,
            "upper_lobe_cy": 0.36,
            "upper_lobe_rx": 0.10,
            "upper_lobe_ry": 0.12,
            "lower_offset": 0.16,
            "lower_cy": 0.66,
            "lower_rx": 0.12,
            "lower_ry": 0.15,
            "tip_point": True,
        },
    },
    "pastel": {
        "outline": 6,
        "body": 12,
        "body_highlight": 9,
        "upper_colors": [20, 7, 6, 5],
        "lower_colors": [7, 20, 5],
        "upper_mode": "radial",
        "lower_mode": "vertical",
        "accent_upper": 9,
        "accent_lower": 20,
        "tip_spot": 9,
        "lower_spot": 7,
        "geometry": {
            "upper_offset": 0.17,
            "upper_cy": 0.31,
            "upper_rx": 0.17,
            "upper_ry": 0.17,
            "upper_lobe_offset": 0.23,
            "upper_lobe_cy": 0.40,
            "upper_lobe_rx": 0.10,
            "upper_lobe_ry": 0.11,
            "lower_offset": 0.15,
            "lower_cy": 0.68,
            "lower_rx": 0.12,
            "lower_ry": 0.14,
            "tip_point": False,
        },
    },
    "jewel": {
        "outline": 15,
        "body": 10,
        "body_highlight": 14,
        "upper_colors": [13, 17, 5, 15],
        "lower_colors": [17, 13, 5],
        "upper_mode": "diagonal",
        "lower_mode": "fan",
        "accent_upper": 14,
        "accent_lower": 9,
        "tip_spot": 14,
        "lower_spot": 9,
        "geometry": {
            "upper_offset": 0.19,
            "upper_cy": 0.28,
            "upper_rx": 0.15,
            "upper_ry": 0.16,
            "upper_lobe_offset": 0.25,
            "upper_lobe_cy": 0.38,
            "upper_lobe_rx": 0.09,
            "upper_lobe_ry": 0.10,
            "lower_offset": 0.17,
            "lower_cy": 0.67,
            "lower_rx": 0.11,
            "lower_ry": 0.14,
            "tip_point": True,
        },
    },
    "sunset": {
        "outline": 18,
        "body": 8,
        "body_highlight": 14,
        "upper_colors": [20, 2, 14, 3],
        "lower_colors": [2, 20, 7],
        "upper_mode": "horizontal",
        "lower_mode": "diagonal",
        "accent_upper": 7,
        "accent_lower": 14,
        "tip_spot": 9,
        "lower_spot": 20,
        "geometry": {
            "upper_offset": 0.20,
            "upper_cy": 0.30,
            "upper_rx": 0.17,
            "upper_ry": 0.16,
            "upper_lobe_offset": 0.25,
            "upper_lobe_cy": 0.39,
            "upper_lobe_rx": 0.10,
            "upper_lobe_ry": 0.10,
            "lower_offset": 0.16,
            "lower_cy": 0.69,
            "lower_rx": 0.12,
            "lower_ry": 0.13,
            "tip_point": True,
        },
    },
    "garden": {
        "outline": 17,
        "body": 4,
        "body_highlight": 3,
        "upper_colors": [7, 12, 20, 4],
        "lower_colors": [4, 7, 6],
        "upper_mode": "fan",
        "lower_mode": "rings",
        "accent_upper": 20,
        "accent_lower": 3,
        "tip_spot": 9,
        "lower_spot": 12,
        "geometry": {
            "upper_offset": 0.18,
            "upper_cy": 0.29,
            "upper_rx": 0.16,
            "upper_ry": 0.17,
            "upper_lobe_offset": 0.24,
            "upper_lobe_cy": 0.41,
            "upper_lobe_rx": 0.11,
            "upper_lobe_ry": 0.10,
            "lower_offset": 0.15,
            "lower_cy": 0.69,
            "lower_rx": 0.12,
            "lower_ry": 0.13,
            "tip_point": False,
        },
    },
}


def build_butterfly_masks(width: int, height: int, style: str, rng: random.Random) -> Dict[str, Mask]:
    config = BUTTERFLY_STYLE_CONFIGS[style]
    geometry = config["geometry"]
    full = make_mask(width, height)
    upper_outer = make_mask(width, height)
    lower_outer = make_mask(width, height)
    upper_inner = make_mask(width, height)
    lower_inner = make_mask(width, height)
    tip_spots = make_mask(width, height)
    lower_spots = make_mask(width, height)
    body = make_mask(width, height)
    body_highlight = make_mask(width, height)

    upper_offset = width * float(geometry["upper_offset"])
    upper_cy = height * float(geometry["upper_cy"])
    upper_rx = width * float(geometry["upper_rx"])
    upper_ry = height * float(geometry["upper_ry"])
    upper_lobe_offset = width * float(geometry["upper_lobe_offset"])
    upper_lobe_cy = height * float(geometry["upper_lobe_cy"])
    upper_lobe_rx = width * float(geometry["upper_lobe_rx"])
    upper_lobe_ry = height * float(geometry["upper_lobe_ry"])
    lower_offset = width * float(geometry["lower_offset"])
    lower_cy = height * float(geometry["lower_cy"])
    lower_rx = width * float(geometry["lower_rx"])
    lower_ry = height * float(geometry["lower_ry"])
    tip_point = bool(geometry["tip_point"])

    for sign in (-1, 1):
        fill_ellipse(upper_outer, width * 0.50 + sign * upper_offset, upper_cy, upper_rx, upper_ry)
        fill_ellipse(upper_outer, width * 0.50 + sign * upper_lobe_offset, upper_lobe_cy, upper_lobe_rx, upper_lobe_ry)
        fill_ellipse(lower_outer, width * 0.50 + sign * lower_offset, lower_cy, lower_rx, lower_ry)
        fill_ellipse(upper_inner, width * 0.50 + sign * upper_offset * 0.88, upper_cy + height * 0.01, upper_rx * 0.55, upper_ry * 0.55)
        fill_ellipse(lower_inner, width * 0.50 + sign * lower_offset * 0.92, lower_cy, lower_rx * 0.58, lower_ry * 0.58)
        fill_ellipse(tip_spots, width * 0.50 + sign * upper_offset * 1.35, upper_cy - height * 0.02, upper_rx * 0.20, upper_ry * 0.16)
        fill_ellipse(lower_spots, width * 0.50 + sign * lower_offset * 1.04, lower_cy + height * 0.05, lower_rx * 0.22, lower_ry * 0.18)
        if tip_point:
            fill_triangle(
                upper_outer,
                (width * 0.50 + sign * width * 0.28, height * 0.27),
                (width * 0.50 + sign * width * 0.20, height * 0.40),
                (width * 0.50 + sign * width * 0.35, height * 0.36),
            )
            fill_triangle(
                lower_outer,
                (width * 0.50 + sign * width * 0.18, height * 0.61),
                (width * 0.50 + sign * width * 0.27, height * 0.80),
                (width * 0.50 + sign * width * 0.10, height * 0.75),
            )

    fill_rect(body, width * 0.47, height * 0.18, width * 0.53, height * 0.84)
    fill_ellipse(body, width * 0.50, height * 0.17, width * 0.045, height * 0.06)
    fill_ellipse(body, width * 0.50, height * 0.86, width * 0.03, height * 0.05)
    fill_rect(body_highlight, width * 0.49, height * 0.24, width * 0.51, height * 0.72)
    fill_triangle(body, (width * 0.49, height * 0.17), (width * 0.46, height * 0.04), (width * 0.48, height * 0.02))
    fill_triangle(body, (width * 0.51, height * 0.17), (width * 0.54, height * 0.04), (width * 0.52, height * 0.02))

    for part in [upper_outer, lower_outer, body]:
        paint_mask(full, part)

    return {
        "full": full,
        "body": intersection(body, full),
        "body_highlight": intersection(body_highlight, full),
        "upper_outer": intersection(upper_outer, full),
        "lower_outer": intersection(lower_outer, full),
        "upper_inner": intersection(upper_inner, full),
        "lower_inner": intersection(lower_inner, full),
        "tip_spots": intersection(tip_spots, full),
        "lower_spots": intersection(lower_spots, full),
    }


def paint_butterfly_board(width: int, height: int, style: str, color_count: int, seed: int) -> Grid:
    style = style.lower()
    if style not in BUTTERFLY_STYLE_CONFIGS:
        raise ValueError(f"Unsupported butterfly style: {style}")

    rng = random.Random(seed)
    config = BUTTERFLY_STYLE_CONFIGS[style]
    masks = build_butterfly_masks(width, height, style, rng)
    full = masks["full"]
    boundary = boundary_mask(full)
    wing_interior = subtract(subtract(full, masks["body"]), boundary)
    upper_fill = intersection(wing_interior, masks["upper_outer"])
    lower_fill = intersection(wing_interior, masks["lower_outer"])

    grid = make_grid(width, height, 0)
    layer_fill(grid, boundary, int(config["outline"]))
    fill_mask_pattern(grid, upper_fill, [int(c) for c in config["upper_colors"]], str(config["upper_mode"]), phase=rng.uniform(0.0, 1.0))
    fill_mask_pattern(grid, lower_fill, [int(c) for c in config["lower_colors"]], str(config["lower_mode"]), phase=rng.uniform(0.0, 1.0))
    layer_fill(grid, masks["upper_inner"], int(config["accent_upper"]))
    layer_fill(grid, masks["lower_inner"], int(config["accent_lower"]))
    layer_fill(grid, masks["tip_spots"], int(config["tip_spot"]))
    layer_fill(grid, masks["lower_spots"], int(config["lower_spot"]))
    layer_fill(grid, masks["body"], int(config["body"]))
    layer_fill(grid, masks["body_highlight"], int(config["body_highlight"]))

    fallback_colors = [int(c) for c in config["upper_colors"]] + [int(c) for c in config["lower_colors"]]
    if color_count > len(set(fallback_colors)):
        extras = [color for color in choose_colors(color_count, seed) if color not in fallback_colors]
        fallback_colors.extend(extras)

    fill_cycle = fallback_colors or [int(config["outline"])]
    idx = 0
    for row in range(height):
        for col in range(width):
            if full[row][col] and grid[row][col] == 0:
                grid[row][col] = fill_cycle[idx % len(fill_cycle)]
                idx += 1
    return grid


ANIMAL_BUILDERS = {
    "cat": build_cat_masks,
    "bear": build_bear_masks,
    "bunny": build_bunny_masks,
    "fox": build_fox_masks,
    "panda": build_panda_masks,
    "chick": build_chick_masks,
    "puppy": build_puppy_masks,
    "piglet": build_piglet_masks,
    "koala": build_koala_masks,
    "raccoon": build_raccoon_masks,
    "penguin": build_penguin_masks,
}


def paint_target_board(width: int, height: int, animal: str, color_count: int, seed: int, style: str | None = None) -> Grid:
    animal = animal.lower()
    if animal == "butterfly":
        return paint_butterfly_board(width, height, style or "monarch", color_count, seed)
    if animal not in ANIMAL_BUILDERS:
        raise ValueError(f"Unsupported animal: {animal}")

    rng = random.Random(seed)
    masks = ANIMAL_BUILDERS[animal](width, height, rng)
    full = masks["full"]
    boundary = boundary_mask(full)
    interior = subtract(full, boundary)
    colors = choose_colors(color_count, seed)

    outline_color = colors[0]
    eye_color = colors[-1]
    ear_color = colors[-2] if len(colors) >= 2 else colors[0]
    muzzle_color = colors[-3] if len(colors) >= 3 else colors[0]
    belly_color = colors[-4] if len(colors) >= 4 else muzzle_color
    band_colors = colors[1:-4] if len(colors) > 6 else colors[1:]
    if not band_colors:
        band_colors = [outline_color]

    grid = make_grid(width, height, 0)
    layer_fill(grid, boundary, outline_color)

    phase = rng.uniform(0.0, math.pi)
    band_count = max(3, len(band_colors))
    for row in range(height):
        for col in range(width):
            if not interior[row][col]:
                continue
            x_ratio = col / max(1, width - 1)
            y_ratio = row / max(1, height - 1)
            wave = 0.08 * math.sin((x_ratio * 2.2 + phase) * math.pi)
            diag = 0.04 * math.sin((x_ratio + y_ratio + phase) * math.pi * 1.3)
            t = max(0.0, min(0.999, y_ratio * 0.92 + wave + diag))
            band_idx = min(band_count - 1, int(t * band_count))
            grid[row][col] = band_colors[band_idx % len(band_colors)]

    if cells_from_mask(masks["face"]):
        face_color = band_colors[max(0, len(band_colors) // 2 - 1)]
        layer_fill(grid, masks["face"], face_color)
    layer_fill(grid, masks["belly"], belly_color)
    layer_fill(grid, masks["muzzle"], muzzle_color)
    layer_fill(grid, masks["inner_ears"], ear_color)
    if cells_from_mask(masks["tail_tip"]):
        layer_fill(grid, masks["tail_tip"], muzzle_color)
    layer_fill(grid, masks["eyes"], eye_color)

    for row in range(height):
        for col in range(width):
            if full[row][col] and grid[row][col] == 0:
                grid[row][col] = band_colors[0]

    return grid


def count_colors(grid: Grid) -> Dict[int, int]:
    counts: Dict[int, int] = {}
    for row in grid:
        for value in row:
            if value <= 0:
                continue
            counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def generate_target_payload(
    width: int,
    height: int,
    animal: str,
    color_count: int,
    seed: int,
    level_id: int = 9001,
    style: str | None = None,
) -> Dict[str, object]:
    correct = paint_target_board(width, height, animal, color_count, seed, style=style)
    counts = count_colors(correct)
    payload = {
        "levelId": level_id,
        "animal": animal,
        "seed": seed,
        "boardWidth": width,
        "boardHeight": height,
        "colorCount": len(counts),
        "filledCellCount": sum(counts.values()),
        "correctColorArr": correct,
        "colorStats": counts,
    }
    if style:
        payload["style"] = style
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a cute animal target board.")
    parser.add_argument("--animal", default="cat", choices=sorted(list(ANIMAL_BUILDERS.keys()) + ["butterfly"]))
    parser.add_argument("--style", default=None)
    parser.add_argument("--width", type=int, default=29)
    parser.add_argument("--height", type=int, default=23)
    parser.add_argument("--colors", type=int, default=10)
    parser.add_argument("--seed", type=int, default=20260422)
    parser.add_argument("--level-id", type=int, default=9001)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = generate_target_payload(
        width=args.width,
        height=args.height,
        animal=args.animal,
        color_count=args.colors,
        seed=args.seed,
        level_id=args.level_id,
        style=args.style,
    )
    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    style_info = f" style={payload['style']}" if "style" in payload else ""
    print(
        f"generated target: animal={payload['animal']}{style_info} size={payload['boardWidth']}x{payload['boardHeight']} "
        f"colors={payload['colorCount']} filled={payload['filledCellCount']} output={args.output}"
    )


if __name__ == "__main__":
    main()
