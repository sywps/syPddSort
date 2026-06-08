#!/usr/bin/env python3
"""Generate movie-theme zt levels for 《给阿嬷的情书》 from reference images."""

from __future__ import annotations

import json
import math
import uuid
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

from generate_initial_shuffle import build_updated_payload, choose_best_init
from move_target_to_initial import displacement_ratio


ROOT = Path(__file__).resolve().parent.parent
LEVEL_DIR = ROOT / "assets" / "RemoteBundle" / "LevelData"
PREVIEW_DIR = ROOT / "artifacts" / "dear_you_theme_previews"
SOURCE_DIR = Path("/Users/shengyemac80-202504/Downloads")

PALETTE_HEX = {
    1: "#D23376",
    2: "#42C8BE",
    3: "#EB9902",
    4: "#E36B00",
    5: "#E4A791",
    6: "#D7C98F",
    7: "#3F42C8",
    8: "#6519AB",
    9: "#87BB08",
    10: "#D72515",
    11: "#309729",
    12: "#166747",
    13: "#138FCA",
    14: "#D59FA7",
    15: "#A59FBA",
    16: "#80390C",
    17: "#702330",
    18: "#2A2B6E",
    19: "#2D2D2D",
    20: "#D9D4CA",
}
PALETTE = {
    color_id: tuple(int(color.lstrip("#")[idx : idx + 2], 16) for idx in (0, 2, 4))
    for color_id, color in PALETTE_HEX.items()
}

LEVEL_SPECS = [
    {
        "levelId": 1401,
        "levelName": "青绿邮筒",
        "sourceImage": "《阿嬷的情书》评论素材整理 (15).png",
        "maxSide": 48,
        "maxArea": 1800,
        "maxColors": 4,
        "targetFilled": 520,
    },
    {
        "levelId": 1402,
        "levelName": "灯下家书",
        "sourceImage": "《阿嬷的情书》评论素材整理 (16).png",
        "maxSide": 54,
        "maxArea": 2800,
        "cropRect": (0.12, 0.12, 0.90, 0.94),
        "maxColors": 7,
        "targetFilled": 1800,
    },
    {
        "levelId": 1403,
        "levelName": "阿嬷笑颜",
        "sourceImage": "《阿嬷的情书》评论素材整理 (24).png",
        "maxSide": 54,
        "maxArea": 2600,
        "cropRect": (0.14, 0.10, 0.88, 0.95),
        "maxColors": 7,
        "targetFilled": 1450,
    },
    {
        "levelId": 1404,
        "levelName": "侨批木箱",
        "sourceImage": "《阿嬷的情书》评论素材整理.png",
        "maxSide": 48,
        "maxArea": 1900,
        "maxColors": 6,
        "targetFilled": 720,
    },
    {
        "levelId": 1405,
        "levelName": "望海阿嬷",
        "sourceImage": "《阿嬷的情书》评论素材整理 (1).png",
        "maxSide": 56,
        "maxArea": 3200,
        "cropRect": (0.08, 0.20, 0.92, 0.96),
        "maxColors": 6,
        "targetFilled": 1400,
    },
    {
        "levelId": 1406,
        "levelName": "归家邮差",
        "sourceImage": "《阿嬷的情书》评论素材整理 (3).png",
        "maxSide": 56,
        "maxArea": 3200,
        "cropRect": (0.08, 0.18, 0.96, 0.96),
        "maxColors": 8,
        "targetFilled": 1700,
    },
    {
        "levelId": 1407,
        "levelName": "平安侨批",
        "sourceImage": "《阿嬷的情书》评论素材整理 (7).png",
        "maxSide": 48,
        "maxArea": 1800,
        "maxColors": 5,
        "targetFilled": 660,
    },
    {
        "levelId": 1408,
        "levelName": "红印封缄",
        "sourceImage": "《阿嬷的情书》评论素材整理 (13).png",
        "maxSide": 48,
        "maxArea": 1900,
        "maxColors": 4,
        "targetFilled": 500,
    },
    {
        "levelId": 1409,
        "levelName": "雨巷阿嬷",
        "sourceImage": "《阿嬷的情书》评论素材整理 (20).png",
        "maxSide": 54,
        "maxArea": 3000,
        "cropRect": (0.10, 0.16, 0.88, 0.96),
        "maxColors": 6,
        "targetFilled": 1080,
    },
    {
        "levelId": 1410,
        "levelName": "纸短情长",
        "sourceImage": "《阿嬷的情书》评论素材整理 (32).png",
        "maxSide": 50,
        "maxArea": 2000,
        "cropRect": (0.03, 0.24, 0.84, 0.74),
        "maxColors": 4,
        "targetFilled": 860,
    },
    {
        "levelId": 1411,
        "levelName": "煤油灯",
        "sourceImage": "《阿嬷的情书》评论素材整理 (34).png",
        "maxSide": 48,
        "maxArea": 1900,
        "cropRect": (0.10, 0.04, 0.82, 0.98),
        "maxColors": 4,
        "targetFilled": 520,
    },
    {
        "levelId": 1412,
        "levelName": "老花镜",
        "sourceImage": "《阿嬷的情书》评论素材整理 (28).png",
        "maxSide": 50,
        "maxArea": 1800,
        "cropRect": (0.02, 0.18, 0.84, 0.80),
        "maxColors": 2,
        "targetFilled": 500,
    },
    {
        "levelId": 1413,
        "levelName": "南洋木船",
        "sourceImage": "《阿嬷的情书》评论素材整理 (30).png",
        "maxSide": 52,
        "maxArea": 2100,
        "cropRect": (0.08, 0.22, 0.84, 0.82),
        "maxColors": 6,
        "targetFilled": 1050,
    },
    {
        "levelId": 1414,
        "levelName": "榕树石磨",
        "sourceImage": "《阿嬷的情书》评论素材整理 (22).png",
        "maxSide": 58,
        "maxArea": 3400,
        "cropRect": (0.06, 0.08, 0.92, 0.96),
        "maxColors": 8,
        "targetFilled": 1850,
    },
    {
        "levelId": 1415,
        "levelName": "侨批文化馆",
        "sourceImage": "《阿嬷的情书》评论素材整理 (11).png",
        "maxSide": 56,
        "maxArea": 3200,
        "cropRect": (0.10, 0.08, 0.90, 0.97),
        "maxColors": 7,
        "targetFilled": 1380,
    },
]

UPSCALE = 14
EMPTY_COVERAGE_THRESHOLD = 0.08
TRIM_PADDING = 1
BORDER_NOISE_COLORS = {15, 20, 19, 6}


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def saturation(rgb: tuple[int, int, int]) -> int:
    return max(rgb) - min(rgb)


def is_background_pixel(rgba: tuple[int, int, int, int]) -> bool:
    r, g, b, a = rgba
    if a < 20:
        return True
    rgb = (r, g, b)
    lum = luminance(rgb)
    sat = saturation(rgb)
    if lum >= 246:
        return True
    if lum >= 238 and sat <= 18:
        return True
    if lum >= 230 and sat <= 10:
        return True
    return False


def is_auxiliary_grid_pixel(rgba: tuple[int, int, int, int]) -> bool:
    r, g, b, a = rgba
    if a < 20:
        return False
    rgb = (r, g, b)
    lum = luminance(rgb)
    sat = saturation(rgb)
    channel_spread = max(abs(r - g), abs(g - b), abs(r - b))
    if 145 <= lum <= 232 and sat <= 20:
        return True
    if 150 <= lum <= 228 and channel_spread <= 34 and sat <= 32:
        return True
    return False


def nearest_palette_id(rgb: tuple[int, int, int]) -> int:
    lum = luminance(rgb)
    sat = saturation(rgb)
    best_id = 20
    best_score: float | None = None
    for color_id, target in PALETTE.items():
        score = sum((rgb[idx] - target[idx]) ** 2 for idx in range(3))
        target_lum = luminance(target)
        if color_id == 19 and sat < 20 and lum < 120:
            score *= 0.65
        if color_id in {20, 6} and lum > 210:
            score *= 0.72
        if color_id in {13, 18, 7, 8} and sat < 18:
            score += 600
        if color_id == 9 and lum < 110:
            score += 1800
        score += abs(lum - target_lum) * 0.6
        if best_score is None or score < best_score:
            best_score = score
            best_id = color_id
    return best_id


def palette_distance(color_a: int, color_b: int) -> float:
    rgb_a = PALETTE[color_a]
    rgb_b = PALETTE[color_b]
    base = sum((rgb_a[idx] - rgb_b[idx]) ** 2 for idx in range(3))
    lum_gap = abs(luminance(rgb_a) - luminance(rgb_b))
    return base + lum_gap * 18.0


def count_filled_cells(grid: list[list[int]]) -> int:
    return sum(1 for row in grid for value in row if value > 0)


def count_used_colors(grid: list[list[int]]) -> Counter[int]:
    return Counter(value for row in grid for value in row if value > 0)


def simplify_palette(grid: list[list[int]], max_colors: int) -> list[list[int]]:
    counts = count_used_colors(grid)
    if len(counts) <= max_colors:
        return [row[:] for row in grid]

    keepers = [color for color, _ in counts.most_common(max_colors)]
    mapping: dict[int, int] = {color: color for color in keepers}
    for color, _ in counts.most_common():
        if color in mapping:
            continue
        mapping[color] = min(keepers, key=lambda candidate: palette_distance(color, candidate))

    simplified: list[list[int]] = []
    for row in grid:
        simplified.append([mapping.get(value, value) if value > 0 else 0 for value in row])
    return simplified


def rebalance_density(
    grid: list[list[int]],
    *,
    target_filled: int | None,
    max_side: int,
    max_area: int,
) -> list[list[int]]:
    if target_filled is None:
        return grid

    adjusted = [row[:] for row in grid]
    current_filled = count_filled_cells(adjusted)
    if current_filled <= target_filled:
        return adjusted

    for _ in range(4):
        height = len(adjusted)
        width = len(adjusted[0]) if height else 0
        if width <= 1 or height <= 1:
            break

        scale = math.sqrt(target_filled / float(max(current_filled, 1)))
        target_width = max(1, min(width, round(width * scale)))
        target_height = max(1, min(height, round(height * scale)))
        if target_width == width and target_height == height:
            if width >= height and width > 1:
                target_width -= 1
            elif height > 1:
                target_height -= 1
        candidate = downscale_grid(adjusted, target_width, target_height)
        candidate = fit_grid_to_limits(candidate, max_side=max_side, max_area=max_area)
        candidate = cleanup_grid(candidate)
        new_filled = count_filled_cells(candidate)
        adjusted = candidate
        current_filled = new_filled
        if current_filled <= target_filled or new_filled == 0:
            break
    return adjusted


def apply_manual_crop(img: Image.Image, crop_rect: tuple[float, float, float, float] | None) -> Image.Image:
    if crop_rect is None:
        return img
    left_ratio, top_ratio, right_ratio, bottom_ratio = crop_rect
    left = int(img.width * left_ratio)
    top = int(img.height * top_ratio)
    right = int(img.width * right_ratio)
    bottom = int(img.height * bottom_ratio)
    left = max(0, min(left, img.width - 1))
    top = max(0, min(top, img.height - 1))
    right = max(left + 1, min(right, img.width))
    bottom = max(top + 1, min(bottom, img.height))
    return img.crop((left, top, right, bottom))


def crop_to_subject(img: Image.Image) -> Image.Image:
    width, height = img.size
    active_rows: list[int] = []
    active_cols: list[int] = []
    row_counts = [0] * height
    col_counts = [0] * width
    for y in range(height):
        for x in range(width):
            if not is_background_pixel(img.getpixel((x, y))):
                row_counts[y] += 1
                col_counts[x] += 1
    row_threshold = max(8, width // 110)
    col_threshold = max(8, height // 110)
    active_rows = [idx for idx, count in enumerate(row_counts) if count >= row_threshold]
    active_cols = [idx for idx, count in enumerate(col_counts) if count >= col_threshold]
    if not active_rows or not active_cols:
        return img

    top = active_rows[0]
    bottom = active_rows[-1]
    left = active_cols[0]
    right = active_cols[-1]
    pad_x = max(12, (right - left + 1) // 18)
    pad_y = max(12, (bottom - top + 1) // 18)
    left = max(0, left - pad_x)
    right = min(width - 1, right + pad_x)
    top = max(0, top - pad_y)
    bottom = min(height - 1, bottom + pad_y)
    return img.crop((left, top, right + 1, bottom + 1))


def fit_size(width: int, height: int, max_side: int, max_area: int) -> tuple[int, int]:
    if width <= 0 or height <= 0:
        return 1, 1
    scale = min(max_side / width, max_side / height)
    scale = max(scale, 1.0 / max(width, height))
    target_w = max(1, round(width * scale))
    target_h = max(1, round(height * scale))
    while max(target_w, target_h) > max_side:
        if target_w >= target_h and target_w > 1:
            target_w -= 1
        elif target_h > 1:
            target_h -= 1
        else:
            break
    while target_w * target_h > max_area:
        if target_w >= target_h and target_w > 1:
            target_w -= 1
        elif target_h > 1:
            target_h -= 1
        else:
            break
    return target_w, target_h


def trim_grid(grid: list[list[int]], padding: int) -> list[list[int]]:
    height = len(grid)
    width = len(grid[0]) if height else 0
    min_row = height
    max_row = -1
    min_col = width
    max_col = -1
    for row in range(height):
        for col in range(width):
            if grid[row][col] <= 0:
                continue
            min_row = min(min_row, row)
            max_row = max(max_row, row)
            min_col = min(min_col, col)
            max_col = max(max_col, col)
    if max_row < 0 or max_col < 0:
        return [[0]]
    pad = max(0, padding)
    min_row = max(0, min_row - pad)
    max_row = min(height - 1, max_row + pad)
    min_col = max(0, min_col - pad)
    max_col = min(width - 1, max_col + pad)
    return [line[min_col : max_col + 1] for line in grid[min_row : max_row + 1]]


def downscale_grid(grid: list[list[int]], target_width: int, target_height: int) -> list[list[int]]:
    source_height = len(grid)
    source_width = len(grid[0])
    if target_width >= source_width and target_height >= source_height:
        return [row[:] for row in grid]
    downscaled: list[list[int]] = []
    for dest_row in range(target_height):
        src_row_start = int(dest_row * source_height / target_height)
        src_row_end = max(src_row_start + 1, int((dest_row + 1) * source_height / target_height))
        row_values: list[int] = []
        for dest_col in range(target_width):
            src_col_start = int(dest_col * source_width / target_width)
            src_col_end = max(src_col_start + 1, int((dest_col + 1) * source_width / target_width))
            counts: Counter[int] = Counter()
            for src_row in range(src_row_start, min(src_row_end, source_height)):
                for src_col in range(src_col_start, min(src_col_end, source_width)):
                    value = grid[src_row][src_col]
                    if value > 0:
                        counts[value] += 1
            row_values.append(counts.most_common(1)[0][0] if counts else 0)
        downscaled.append(row_values)
    return downscaled


def fit_grid_to_limits(grid: list[list[int]], max_side: int, max_area: int) -> list[list[int]]:
    width = len(grid[0])
    height = len(grid)
    resized = grid
    if max(width, height) > max_side or width * height > max_area:
        scale = max(width / max_side, height / max_side, math.sqrt((width * height) / max_area))
        target_width = max(1, min(width, round(width / scale)))
        target_height = max(1, min(height, round(height / scale)))
        while max(target_width, target_height) > max_side:
            if target_width >= target_height and target_width > 1:
                target_width -= 1
            elif target_height > 1:
                target_height -= 1
            else:
                break
        while target_width * target_height > max_area:
            if target_width >= target_height and target_width > 1:
                target_width -= 1
            elif target_height > 1:
                target_height -= 1
            else:
                break
        resized = downscale_grid(grid, target_width, target_height)
    return trim_grid(resized, TRIM_PADDING)


def cleanup_grid(grid: list[list[int]]) -> list[list[int]]:
    height = len(grid)
    width = len(grid[0]) if height else 0
    result = [row[:] for row in grid]
    visited: set[tuple[int, int]] = set()
    dirs = (-1, 0, 1)

    def neighbors(row: int, col: int) -> list[tuple[int, int]]:
        out: list[tuple[int, int]] = []
        for dy in dirs:
            for dx in dirs:
                if dx == 0 and dy == 0:
                    continue
                nr = row + dy
                nc = col + dx
                if 0 <= nr < height and 0 <= nc < width:
                    out.append((nr, nc))
        return out

    for row in range(height):
        for col in range(width):
            color = result[row][col]
            if color <= 0 or (row, col) in visited:
                continue
            stack = [(row, col)]
            component: list[tuple[int, int]] = []
            visited.add((row, col))
            while stack:
                cr, cc = stack.pop()
                component.append((cr, cc))
                for nr, nc in neighbors(cr, cc):
                    if (nr, nc) in visited or result[nr][nc] != color:
                        continue
                    visited.add((nr, nc))
                    stack.append((nr, nc))

            min_row = min(cell[0] for cell in component)
            max_row = max(cell[0] for cell in component)
            min_col = min(cell[1] for cell in component)
            max_col = max(cell[1] for cell in component)
            bbox_w = max_col - min_col + 1
            bbox_h = max_row - min_row + 1
            bbox_area = bbox_w * bbox_h
            fill_rate = len(component) / max(1, bbox_area)
            touches_border = min_row == 0 or min_col == 0 or max_row == height - 1 or max_col == width - 1
            aspect = max(bbox_w / max(1, bbox_h), bbox_h / max(1, bbox_w))

            if color in BORDER_NOISE_COLORS:
                ultra_thin_line = bbox_w <= 2 or bbox_h <= 2
                long_aux_line = aspect >= 5.0 and max(bbox_w, bbox_h) >= 6
                slender_line = ultra_thin_line or (long_aux_line and fill_rate <= 0.9)
                sparse_strip = aspect >= 3.5 and fill_rate <= 0.45
                small_border_junk = touches_border and len(component) <= 18 and max(bbox_w, bbox_h) <= 8
                if slender_line or sparse_strip or small_border_junk:
                    for cr, cc in component:
                        result[cr][cc] = 0
                    continue

            if len(component) > 4:
                continue
            zero_neighbors = 0
            nonzero_neighbors = 0
            for cr, cc in component:
                for nr, nc in neighbors(cr, cc):
                    if (nr, nc) in component:
                        continue
                    if result[nr][nc] <= 0:
                        zero_neighbors += 1
                    else:
                        nonzero_neighbors += 1
            if zero_neighbors >= max(6, len(component) * 4) and nonzero_neighbors <= len(component) * 2:
                for cr, cc in component:
                    result[cr][cc] = 0
    return trim_grid(result, TRIM_PADDING)


def flip_horizontal(grid: list[list[int]]) -> list[list[int]]:
    return [list(reversed(row)) for row in grid]


def flip_vertical(grid: list[list[int]]) -> list[list[int]]:
    return list(reversed([row[:] for row in grid]))


def rotate_180(grid: list[list[int]]) -> list[list[int]]:
    return [list(reversed(row)) for row in reversed(grid)]


def shift_grid(grid: list[list[int]], dx: int, dy: int) -> list[list[int]]:
    height = len(grid)
    width = len(grid[0]) if height else 0
    shifted = [[0] * width for _ in range(height)]
    for row in range(height):
        for col in range(width):
            shifted[(row + dy) % height][(col + dx) % width] = grid[row][col]
    return shifted


def transform_score(ratio: float) -> float:
    penalty = abs(ratio - 0.80)
    if ratio < 0.68:
        penalty += (ratio - 0.68) * -2.5
    if ratio > 0.90:
        penalty += (ratio - 0.90) * 4.0
    return -penalty


def optimize_init_transform(correct: list[list[int]], init_grid: list[list[int]]) -> tuple[list[list[int]], float]:
    best_grid = init_grid
    best_ratio = displacement_ratio(correct, init_grid)
    best_score = transform_score(best_ratio)
    if best_ratio >= 0.74:
        return best_grid, best_ratio

    variants = [
        init_grid,
        flip_horizontal(init_grid),
        flip_vertical(init_grid),
        rotate_180(init_grid),
    ]
    for variant in variants:
        height = len(variant)
        width = len(variant[0]) if height else 0
        for dx in range(width):
            for dy in range(height):
                shifted = shift_grid(variant, dx, dy)
                ratio = displacement_ratio(correct, shifted)
                score = transform_score(ratio)
                if score > best_score or (math.isclose(score, best_score, abs_tol=1e-9) and ratio > best_ratio):
                    best_grid = shifted
                    best_ratio = ratio
                    best_score = score
    return best_grid, round(best_ratio, 4)


def grid_from_image(
    image_path: Path,
    max_side: int,
    max_area: int,
    crop_rect: tuple[float, float, float, float] | None = None,
    max_colors: int | None = None,
    target_filled: int | None = None,
) -> tuple[list[list[int]], dict[str, int]]:
    with Image.open(image_path).convert("RGBA") as original:
        prepared = apply_manual_crop(original, crop_rect)
        cropped = crop_to_subject(prepared)
        target_w, target_h = fit_size(cropped.width, cropped.height, max_side, max_area)
        sampled = cropped.resize((target_w * UPSCALE, target_h * UPSCALE), Image.Resampling.LANCZOS)

    grid: list[list[int]] = []
    for row in range(target_h):
        values: list[int] = []
        for col in range(target_w):
            color_weights: Counter[int] = Counter()
            visible = 0
            for py in range(row * UPSCALE, (row + 1) * UPSCALE):
                for px in range(col * UPSCALE, (col + 1) * UPSCALE):
                    rgba = sampled.getpixel((px, py))
                    if is_background_pixel(rgba) or is_auxiliary_grid_pixel(rgba):
                        continue
                    r, g, b, a = rgba
                    visible += 1
                    palette_id = nearest_palette_id((r, g, b))
                    color_weights[palette_id] += a
            coverage = visible / float(UPSCALE * UPSCALE)
            if coverage < EMPTY_COVERAGE_THRESHOLD or not color_weights:
                values.append(0)
            else:
                values.append(color_weights.most_common(1)[0][0])
        grid.append(values)

    fitted = fit_grid_to_limits(grid, max_side=max_side, max_area=max_area)
    fitted = cleanup_grid(fitted)
    if max_colors is not None:
        fitted = simplify_palette(fitted, max_colors=max_colors)
        fitted = cleanup_grid(fitted)
    fitted = rebalance_density(
        fitted,
        target_filled=target_filled,
        max_side=max_side,
        max_area=max_area,
    )
    metadata = {
        "sourceWidth": cropped.width,
        "sourceHeight": cropped.height,
        "boardWidth": len(fitted[0]),
        "boardHeight": len(fitted),
    }
    return fitted, metadata


def render_preview(grid: list[list[int]], cell: int = 14) -> Image.Image:
    height = len(grid)
    width = len(grid[0]) if height else 0
    img = Image.new("RGB", (width * cell, height * cell), (247, 244, 238))
    draw = ImageDraw.Draw(img)
    for row_idx, row in enumerate(grid):
        for col_idx, value in enumerate(row):
            if value <= 0:
                continue
            draw.rectangle(
                (col_idx * cell, row_idx * cell, (col_idx + 1) * cell - 1, (row_idx + 1) * cell - 1),
                fill=PALETTE[value],
            )
    return img


def write_meta(json_path: Path) -> None:
    meta_path = Path(f"{json_path}.meta")
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


def build_level(spec: dict[str, object]) -> tuple[dict[str, object], Image.Image]:
    level_id = int(spec["levelId"])
    level_name = str(spec["levelName"])
    source_image = SOURCE_DIR / str(spec["sourceImage"])
    correct, image_meta = grid_from_image(
        source_image,
        max_side=int(spec["maxSide"]),
        max_area=int(spec["maxArea"]),
        crop_rect=spec.get("cropRect"),
        max_colors=int(spec["maxColors"]) if spec.get("maxColors") is not None else None,
        target_filled=int(spec["targetFilled"]) if spec.get("targetFilled") is not None else None,
    )
    preview = render_preview(correct)
    payload = {
        "levelId": level_id,
        "theme": "给阿嬷的情书",
        "levelName": level_name,
        "boardWidth": len(correct[0]),
        "boardHeight": len(correct),
        "correctColorArr": correct,
    }
    chosen = choose_best_init(
        correct=correct,
        base_seed=20260518 + level_id * 7919,
        attempts=10,
        min_groups_per_color=2,
        max_groups_per_color=3,
        target_displacement=0.80,
        min_displacement=0.68,
        max_displacement=0.90,
        minstep_mode="off",
    )
    init_grid, optimized_ratio = optimize_init_transform(correct, chosen["init_grid"])
    updated = build_updated_payload(
        payload=payload,
        init_grid=init_grid,
        ratio=float(optimized_ratio),
        chosen_seed=int(chosen["seed"]),
        chosen_group_count=int(chosen["group_count"]),
    )
    used_colors = len(count_used_colors(correct))
    filled_cells = int(updated["filledCellCount"])
    estimated_time = 85 + int(round(filled_cells * 0.045)) + used_colors * 9
    if filled_cells >= 1500:
        estimated_time += 14
    if used_colors >= 8:
        estimated_time += 12
    updated["timeLimit"] = max(140, min(280, estimated_time))
    updated["online"] = False
    updated["isFeatured"] = True
    updated["levelCategory"] = "movie-theme"
    updated["levelType"] = "theme"
    updated["fileName"] = f"zt_level_{level_id}.json"
    updated["themeGroupName"] = "给阿嬷的情书"
    updated["themeLevelName"] = level_name
    updated["themeGroupIndex"] = 1400
    updated["themeLevelIndex"] = level_id - 1400
    updated["difficultyPreset"] = "normal"
    updated["source"] = "reference-image-generated"
    updated["sourcePatternName"] = level_name
    updated["sourceImageName"] = source_image.name
    updated["sourceCropWidth"] = image_meta["sourceWidth"]
    updated["sourceCropHeight"] = image_meta["sourceHeight"]
    return updated, preview


def save_contact_sheet(previews: list[tuple[int, str, Image.Image]]) -> None:
    cols = 3
    rows = math.ceil(len(previews) / cols)
    cell_w = max(item[2].width for item in previews)
    cell_h = max(item[2].height for item in previews)
    canvas = Image.new(
        "RGB",
        (cols * cell_w + (cols + 1) * 16, rows * cell_h + (rows + 1) * 28),
        (250, 246, 238),
    )
    draw = ImageDraw.Draw(canvas)
    for idx, (level_id, name, preview) in enumerate(previews):
        row = idx // cols
        col = idx % cols
        ox = 16 + col * (cell_w + 16)
        oy = 16 + row * (cell_h + 28)
        px = ox + (cell_w - preview.width) // 2
        py = oy + (cell_h - preview.height) // 2
        canvas.paste(preview, (px, py))
        draw.rectangle((px, py, px + preview.width - 1, py + preview.height - 1), outline=(160, 120, 90), width=2)
        draw.text((ox + 4, oy + cell_h + 6), f"{level_id} {name}", fill=(72, 52, 40))
    canvas.save(PREVIEW_DIR / "contact_sheet.png")


def main() -> None:
    LEVEL_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    previews: list[tuple[int, str, Image.Image]] = []
    for spec in LEVEL_SPECS:
        payload, preview = build_level(spec)
        level_id = int(spec["levelId"])
        level_name = str(spec["levelName"])
        json_path = LEVEL_DIR / f"zt_level_{level_id}.json"
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        write_meta(json_path)
        preview.save(PREVIEW_DIR / f"zt_level_{level_id}.png")
        previews.append((level_id, level_name, preview))
        print(
            f"{level_id} {level_name}: {payload['boardWidth']}x{payload['boardHeight']} "
            f"filled={payload['filledCellCount']} disp={payload['displacementRatio']}"
        )
    save_contact_sheet(previews)
    print(f"generated {len(LEVEL_SPECS)} levels into {LEVEL_DIR}")
    print(f"previews saved to {PREVIEW_DIR}")


if __name__ == "__main__":
    main()
