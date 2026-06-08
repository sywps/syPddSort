#!/usr/bin/env python3
"""
Render guanka target images into two variants per level:
1. pixel art
2. stylized bead pattern
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
LEVEL_CONFIG_PATH = ROOT / "assets" / "Scripts" / "Core" / "LevelConfig.ts"

FALLBACK_COLOR_HEX = {
    1: "#ED5090",
    2: "#4EEAEA",
    3: "#F8C811",
    4: "#FE8B10",
    5: "#F4BD9E",
    6: "#EBDEA6",
    7: "#4A4DCF",
    8: "#7221BC",
    9: "#9FCE21",
    10: "#EA281A",
    11: "#37A92D",
    12: "#207955",
    13: "#20A8DC",
    14: "#EEB2BC",
    15: "#C4BED9",
    16: "#974714",
    17: "#782F3C",
    18: "#36387E",
    19: "#373737",
    20: "#F2EDE4",
}

PIXEL_BG = (248, 245, 239, 255)
PATTERN_BG = (248, 245, 239, 255)


def load_color_hex() -> dict[int, str]:
    if not LEVEL_CONFIG_PATH.exists():
        return dict(FALLBACK_COLOR_HEX)

    text = LEVEL_CONFIG_PATH.read_text(encoding="utf-8")
    match = re.search(
        r"export const COLOR_HEX: Record<number, string> = \{(.*?)\};",
        text,
        re.S,
    )
    if not match:
        return dict(FALLBACK_COLOR_HEX)

    color_hex: dict[int, str] = {}
    for color_id, hex_value in re.findall(r"(\d+)\s*:\s*'(#(?:[0-9A-Fa-f]{6}))'", match.group(1)):
        color_hex[int(color_id)] = hex_value.upper()

    return color_hex or dict(FALLBACK_COLOR_HEX)


COLOR_HEX = load_color_hex()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render guanka target images.")
    parser.add_argument(
        "--guanka-dir",
        default="guanka",
        help="Directory containing level_*.json files.",
    )
    parser.add_argument(
        "--output-dir",
        default="images",
        help="Directory to write PNG files into.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only render the first N levels after sorting by level id.",
    )
    parser.add_argument(
        "--levels",
        nargs="*",
        type=int,
        default=None,
        help="Explicit level ids to render.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing PNG files.",
    )
    return parser.parse_args()


def hex_to_rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4)) + (alpha,)


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def lighten(rgb: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(clamp(int(channel + (255 - channel) * amount), 0, 255) for channel in rgb)


def darken(rgb: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(clamp(int(channel * (1 - amount)), 0, 255) for channel in rgb)


def iter_level_files(guanka_dir: Path) -> Iterable[Path]:
    return sorted(
        guanka_dir.glob("level_*.json"),
        key=lambda path: int(path.stem.split("_", 1)[1]),
    )


def choose_levels(guanka_dir: Path, explicit_ids: list[int] | None, limit: int | None) -> list[Path]:
    if explicit_ids:
        return [guanka_dir / f"level_{level_id}.json" for level_id in explicit_ids]

    level_files = list(iter_level_files(guanka_dir))
    if limit is not None:
        level_files = level_files[:limit]
    return level_files


def load_level(level_path: Path) -> dict:
    return json.loads(level_path.read_text(encoding="utf-8"))


def crop_grid(grid: list[list[int]], padding: int = 1) -> list[list[int]]:
    non_zero_points = [
        (row_index, col_index)
        for row_index, row in enumerate(grid)
        for col_index, value in enumerate(row)
        if value > 0
    ]
    if not non_zero_points:
        return [[0]]

    min_row = max(0, min(point[0] for point in non_zero_points) - padding)
    max_row = min(len(grid) - 1, max(point[0] for point in non_zero_points) + padding)
    min_col = max(0, min(point[1] for point in non_zero_points) - padding)
    max_col = min(len(grid[0]) - 1, max(point[1] for point in non_zero_points) + padding)

    return [row[min_col : max_col + 1] for row in grid[min_row : max_row + 1]]


def render_pixel_image(grid: list[list[int]], pixel_scale: int = 32) -> Image.Image:
    cropped = crop_grid(grid, padding=1)
    height = len(cropped)
    width = len(cropped[0]) if height else 1
    base = Image.new("RGBA", (width, height), PIXEL_BG)

    pixels = base.load()
    for row_index, row in enumerate(cropped):
        for col_index, value in enumerate(row):
            if value > 0:
                pixels[col_index, row_index] = hex_to_rgba(COLOR_HEX.get(value, "#CCCCCC"))

    return base.resize((width * pixel_scale, height * pixel_scale), Image.Resampling.NEAREST)


def choose_pattern_cell_size(grid: list[list[int]]) -> int:
    max_dim = max(len(grid), len(grid[0]) if grid else 1)
    return max(20, min(54, 900 // max(max_dim, 1)))


def create_bean_tile(color_id: int, cell_size: int) -> Image.Image:
    rgba = hex_to_rgba(COLOR_HEX.get(color_id, "#CCCCCC"))
    rgb = rgba[:3]
    image = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    outer_pad = max(1, int(cell_size * 0.02))
    inner_pad = max(2, int(cell_size * 0.08))
    radius_outer = max(4, int(cell_size * 0.25))
    radius_inner = max(3, int(cell_size * 0.18))

    draw.rounded_rectangle(
        [outer_pad, outer_pad, cell_size - outer_pad - 1, cell_size - outer_pad - 1],
        radius=radius_outer,
        fill=darken(rgb, 0.35) + (255,),
    )
    draw.rounded_rectangle(
        [inner_pad, inner_pad, cell_size - inner_pad - 1, cell_size - inner_pad - 1],
        radius=radius_inner,
        fill=rgb + (255,),
    )

    shine_height = max(4, int(cell_size * 0.34))
    shine_color = lighten(rgb, 0.5) + (110,)
    draw.rounded_rectangle(
        [inner_pad + 1, inner_pad + 1, cell_size - inner_pad - 2, inner_pad + shine_height],
        radius=radius_inner,
        fill=shine_color,
    )
    draw.line(
        [(inner_pad + 2, cell_size - inner_pad - 3), (cell_size - inner_pad - 3, inner_pad + 2)],
        fill=(255, 255, 255, 48),
        width=max(1, cell_size // 18),
    )
    return image


def render_pattern_image(grid: list[list[int]]) -> Image.Image:
    cropped = crop_grid(grid, padding=1)
    cell_size = choose_pattern_cell_size(cropped)
    gap = max(1, cell_size // 16)
    padding = max(8, cell_size // 5)
    rows = len(cropped)
    cols = len(cropped[0]) if rows else 1

    width = cols * cell_size + max(cols - 1, 0) * gap + padding * 2
    height = rows * cell_size + max(rows - 1, 0) * gap + padding * 2
    image = Image.new("RGBA", (width, height), PATTERN_BG)

    tile_cache: dict[int, Image.Image] = {}
    for row_index, row in enumerate(cropped):
        for col_index, value in enumerate(row):
            if value <= 0:
                continue
            if value not in tile_cache:
                tile_cache[value] = create_bean_tile(value, cell_size)
            x = padding + col_index * (cell_size + gap)
            y = padding + row_index * (cell_size + gap)
            image.alpha_composite(tile_cache[value], (x, y))

    return image


def render_level_variants(level: dict, output_dir: Path, overwrite: bool) -> list[Path]:
    correct = level["correctColorArr"]
    level_id = int(level["levelId"])
    variants = {
        "correct_pixel": render_pixel_image(correct),
        "correct_pattern": render_pattern_image(correct),
    }

    rendered: list[Path] = []
    for suffix, image in variants.items():
        output_path = output_dir / f"level_{level_id}_{suffix}.png"
        if output_path.exists() and not overwrite:
            continue
        image.save(output_path)
        rendered.append(output_path)
    return rendered


def render_levels(level_paths: list[Path], output_dir: Path, overwrite: bool) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    rendered: list[Path] = []

    for level_path in level_paths:
        if not level_path.exists():
            raise FileNotFoundError(f"Missing level file: {level_path}")
        level = load_level(level_path)
        rendered.extend(render_level_variants(level, output_dir, overwrite))
    return rendered


def main() -> None:
    args = parse_args()
    guanka_dir = Path(args.guanka_dir)
    output_dir = Path(args.output_dir)
    level_paths = choose_levels(guanka_dir, args.levels, args.limit)
    if not level_paths:
        raise SystemExit("No level files matched the request.")

    rendered = render_levels(level_paths, output_dir, overwrite=args.overwrite)
    if not rendered:
        print("No files rendered. Existing files were kept.")
        return

    print(f"Rendered {len(rendered)} file(s) to {output_dir}")
    for path in rendered:
        print(path)


if __name__ == "__main__":
    main()
