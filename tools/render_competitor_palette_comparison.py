#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


BG = (248, 245, 239, 255)
CARD_BG = (255, 255, 255, 255)
BORDER = (223, 217, 208, 255)
TEXT = (56, 52, 47, 255)
SUBTEXT = (110, 103, 94, 255)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render competitor palette comparison images.")
    parser.add_argument("--raw-level-dir", required=True)
    parser.add_argument("--converted-level-dir", required=True)
    parser.add_argument("--current-color-table", required=True)
    parser.add_argument("--baseline-color-table", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--manifest-json")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--levels", nargs="*", type=int)
    return parser.parse_args()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def hex_to_rgba(value: str) -> tuple[int, int, int, int]:
    text = value.strip().lstrip("#")
    return tuple(int(text[index : index + 2], 16) for index in (0, 2, 4)) + (255,)


def rgb_distance(lhs: list[int] | tuple[int, int, int], rhs: list[int] | tuple[int, int, int]) -> float:
    return sum((int(lhs[index]) - int(rhs[index])) ** 2 for index in range(3)) ** 0.5


def load_source_palette(path: Path) -> dict[str, dict]:
    data = read_json(path)
    return {
        str(color_id): {
            "hex": entry["sourceHex"],
            "rgb": entry["sourceRgb"],
            "localColorId": entry["localColorId"],
            "distance": entry["distance"],
        }
        for color_id, entry in data["sourceColors"].items()
    }


def crop_grid(grid: list[list[int]], padding: int = 1) -> list[list[int]]:
    non_zero = [
        (row_index, col_index)
        for row_index, row in enumerate(grid)
        for col_index, value in enumerate(row)
        if int(value) > 0
    ]
    if not non_zero:
        return [[0]]

    min_row = max(0, min(point[0] for point in non_zero) - padding)
    max_row = min(len(grid) - 1, max(point[0] for point in non_zero) + padding)
    min_col = max(0, min(point[1] for point in non_zero) - padding)
    max_col = min(len(grid[0]) - 1, max(point[1] for point in non_zero) + padding)
    return [row[min_col : max_col + 1] for row in grid[min_row : max_row + 1]]


def choose_cell_size(grid: list[list[int]], max_art_size: int = 240) -> int:
    rows = max(1, len(grid))
    cols = max(1, len(grid[0]))
    return max(10, min(32, max_art_size // max(rows, cols)))


def render_grid(grid: list[list[int]], palette: dict[str, str], title: str, font: ImageFont.ImageFont) -> Image.Image:
    cropped = crop_grid(grid)
    rows = len(cropped)
    cols = len(cropped[0]) if rows else 1
    cell = choose_cell_size(cropped)
    art_width = cols * cell
    art_height = rows * cell
    panel_width = 292
    panel_height = 340
    header_height = 42
    image = Image.new("RGBA", (panel_width, panel_height), CARD_BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, panel_width - 1, panel_height - 1), radius=16, outline=BORDER, width=2, fill=CARD_BG)
    draw.text((18, 14), title, fill=TEXT, font=font)

    left = (panel_width - art_width) // 2
    top = header_height + (panel_height - header_height - art_height) // 2
    for row_index, row in enumerate(cropped):
        for col_index, value in enumerate(row):
            if int(value) <= 0:
                continue
            color = hex_to_rgba(palette.get(str(value), "#CCCCCC"))
            x0 = left + col_index * cell
            y0 = top + row_index * cell
            draw.rectangle((x0, y0, x0 + cell - 1, y0 + cell - 1), fill=color)
    return image


def stack_row(images: list[Image.Image], padding: int = 18) -> Image.Image:
    width = sum(image.width for image in images) + padding * (len(images) - 1)
    height = max(image.height for image in images)
    canvas = Image.new("RGBA", (width, height), BG)
    cursor_x = 0
    for image in images:
        canvas.alpha_composite(image, (cursor_x, (height - image.height) // 2))
        cursor_x += image.width + padding
    return canvas


def build_montage(level_title: str, subtitle: str, row_top: Image.Image, row_bottom: Image.Image) -> Image.Image:
    font_title = load_font(28)
    font_sub = load_font(16)
    width = max(row_top.width, row_bottom.width) + 64
    height = 96 + row_top.height + 20 + row_bottom.height + 36
    canvas = Image.new("RGBA", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((32, 24), level_title, fill=TEXT, font=font_title)
    draw.text((32, 60), subtitle, fill=SUBTEXT, font=font_sub)
    canvas.alpha_composite(row_top, ((width - row_top.width) // 2, 96))
    canvas.alpha_composite(row_bottom, ((width - row_bottom.width) // 2, 96 + row_top.height + 20))
    return canvas


def load_font(size: int) -> ImageFont.ImageFont:
    for name in ("arial.ttf", "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/msyh.ttc"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def count_colors(*grids: list[list[int]]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for grid in grids:
        for row in grid:
            for value in row:
                if int(value) > 0:
                    counter[str(value)] += 1
    return counter


def iter_raw_levels(raw_level_dir: Path) -> list[Path]:
    return sorted(raw_level_dir.glob("lv_*.json"), key=lambda path: int(path.stem.split("_", 1)[1]))


def choose_level_files(raw_level_dir: Path, explicit_levels: list[int] | None) -> list[Path]:
    if explicit_levels:
        return [raw_level_dir / f"lv_{level_id:03d}.json" for level_id in explicit_levels]
    return iter_raw_levels(raw_level_dir)


def compute_level_score(raw_level: dict, baseline_palette: dict[str, dict], current_palette: dict[str, dict]) -> tuple[float, dict]:
    target_grid = raw_level["raw"]["target_grid"]
    shuffle_grid = raw_level["raw"].get("shuffle_grid") or []
    counts = count_colors(target_grid, shuffle_grid)
    score = 0.0
    changed_colors = []
    top_deltas = []
    for color_id, cell_count in counts.items():
        baseline = baseline_palette[color_id]
        current = current_palette[color_id]
        delta = rgb_distance(baseline["rgb"], current["rgb"])
        score += delta * cell_count
        if baseline["localColorId"] != current["localColorId"]:
            changed_colors.append(color_id)
        top_deltas.append({"colorId": color_id, "delta": round(delta, 3), "cells": cell_count})
    top_deltas.sort(key=lambda item: (item["delta"] * item["cells"]), reverse=True)
    summary = {
        "usedSourceColors": sorted(counts.keys(), key=lambda value: int(value)),
        "changedLocalMappingColors": sorted(changed_colors, key=lambda value: int(value)),
        "topSourceColorDeltas": top_deltas[:6],
    }
    return score, summary


def pick_levels(raw_level_files: list[Path], baseline_palette: dict[str, dict], current_palette: dict[str, dict], limit: int) -> list[dict]:
    ranked = []
    for raw_file in raw_level_files:
        raw_level = read_json(raw_file)
        score, summary = compute_level_score(raw_level, baseline_palette, current_palette)
        ranked.append(
            {
                "path": raw_file,
                "raw": raw_level,
                "score": score,
                "summary": summary,
            }
        )
    ranked.sort(key=lambda entry: entry["score"], reverse=True)
    return ranked[:limit]


def save_variants(
    output_dir: Path,
    file_stem: str,
    raw_level: dict,
    converted_level: dict,
    baseline_palette: dict[str, dict],
    current_palette: dict[str, dict],
    local_hex: dict[str, str],
) -> dict[str, str]:
    font = load_font(18)
    target_grid = raw_level["raw"]["target_grid"]
    shuffle_grid = raw_level["raw"].get("shuffle_grid") or target_grid
    baseline_hex = {color_id: data["hex"] for color_id, data in baseline_palette.items()}
    current_hex = {color_id: data["hex"] for color_id, data in current_palette.items()}

    images = {
        "target_thumb": render_grid(target_grid, baseline_hex, "Target / Thumb palette", font),
        "target_atlas": render_grid(target_grid, current_hex, "Target / Native atlas", font),
        "init_thumb": render_grid(shuffle_grid, baseline_hex, "Init / Thumb palette", font),
        "init_atlas": render_grid(shuffle_grid, current_hex, "Init / Native atlas", font),
        "target_official": render_grid(converted_level["correctColorArr"], local_hex, "Target / Official20", font),
        "init_official": render_grid(converted_level["initRandomColorArr"], local_hex, "Init / Official20", font),
    }

    saved = {}
    for name, image in images.items():
        target = output_dir / f"{file_stem}_{name}.png"
        image.save(target)
        saved[name] = str(target)

    row_top = stack_row([images["target_thumb"], images["target_atlas"], images["target_official"]])
    row_bottom = stack_row([images["init_thumb"], images["init_atlas"], images["init_official"]])
    subtitle = f"source colors: {', '.join(converted_level['sourceColorUsed'])}"
    montage = build_montage(f"Level {converted_level['sourceLevel']}", subtitle, row_top, row_bottom)
    montage_path = output_dir / f"{file_stem}_montage.png"
    montage.save(montage_path)
    saved["montage"] = str(montage_path)
    return saved


def main(args: argparse.Namespace) -> None:
    raw_level_dir = Path(args.raw_level_dir)
    converted_level_dir = Path(args.converted_level_dir)
    current_color_table_data = read_json(Path(args.current_color_table))
    baseline_palette = load_source_palette(Path(args.baseline_color_table))
    current_palette = load_source_palette(Path(args.current_color_table))
    local_hex = {str(color_id): data["hex"] for color_id, data in current_color_table_data["localColors"].items()}
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    raw_level_files = choose_level_files(raw_level_dir, args.levels)
    selected = pick_levels(raw_level_files, baseline_palette, current_palette, args.limit if not args.levels else len(args.levels))
    manifest = {"levels": []}

    for entry in selected:
        raw_level = entry["raw"]
        level_number = int(entry["path"].stem.split("_", 1)[1])
        converted_level = read_json(converted_level_dir / entry["path"].name)
        saved = save_variants(output_dir, entry["path"].stem, raw_level, converted_level, baseline_palette, current_palette, local_hex)
        manifest["levels"].append(
            {
                "levelNumber": level_number,
                "sourceLevel": converted_level["sourceLevel"],
                "invokeId": raw_level["invokeId"],
                "hash": raw_level["hash"],
                "score": round(entry["score"], 3),
                "usedSourceColors": entry["summary"]["usedSourceColors"],
                "changedLocalMappingColors": entry["summary"]["changedLocalMappingColors"],
                "topSourceColorDeltas": entry["summary"]["topSourceColorDeltas"],
                "sourceFile": converted_level["sourceFile"],
                "images": saved,
            }
        )

    target_manifest = Path(args.manifest_json) if args.manifest_json else output_dir / "comparison_manifest.json"
    write_json(target_manifest, manifest)
    print(f"Rendered {len(manifest['levels'])} level comparison set(s)")
    print(target_manifest)


if __name__ == "__main__":
    args = parse_args()
    main(args)
