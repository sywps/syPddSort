#!/usr/bin/env python3
"""Import local MakeBead templates into guanka levels."""

from __future__ import annotations

import argparse
import colorsys
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

from PIL import Image

from move_target_to_initial import assign_initial_layout, displacement_ratio

Grid = List[List[int]]
Rgb = Tuple[int, int, int]
DIRS8 = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]

PALETTE: Dict[int, Tuple[str, Rgb]] = {
    1: ("red", (0xD7, 0x3D, 0x2B)),
    2: ("orange", (0xEF, 0x91, 0x37)),
    3: ("yellow", (0xEE, 0xEC, 0x7C)),
    4: ("green", (0xAE, 0xD9, 0x3B)),
    5: ("blue", (0xAA, 0xE4, 0xF0)),
    6: ("purple", (0xA5, 0x6F, 0xE2)),
    7: ("pink", (0xFF, 0x98, 0xF3)),
    8: ("brown", (0x9E, 0x72, 0x5A)),
    9: ("white", (0xFD, 0xF6, 0xE3)),
    10: ("navy", (0x4A, 0x90, 0xD9)),
    11: ("lime", (0x2E, 0xCC, 0x71)),
    12: ("magenta", (0xE7, 0x4C, 0x8B)),
    13: ("teal", (0x1A, 0xBC, 0x9C)),
    14: ("gold", (0xF1, 0xC4, 0x0F)),
    15: ("indigo", (0x8E, 0x44, 0xAD)),
    16: ("rust", (0xD3, 0x54, 0x00)),
    17: ("emerald", (0x27, 0xAE, 0x60)),
    18: ("crimson", (0xC0, 0x39, 0x2B)),
    19: ("steel", (0x5D, 0xAD, 0xE2)),
    20: ("peach", (0xF0, 0xB2, 0x7A)),
}

ANIMAL_NAMES = {
    "bear",
    "sheep",
    "frog",
    "toad",
    "crocodile",
    "lizard",
    "beetle",
    "butterfly",
    "parrot",
    "goldfish",
}

CHARACTER_NAMES = {
    "blue king",
    "green king",
    "queen",
    "yellow mage",
    "purple mage",
    "red priest",
    "wizard",
    "witch",
    "axe knight",
    "dark knight",
    "red warrior",
    "viking",
    "barbarian",
}

EXACT_PREFERENCES: Dict[str, List[int]] = {
    "cherry": [18, 1, 17, 4, 8],
    "strawberry": [18, 1, 11, 4, 7],
    "watermelon": [18, 1, 11, 4, 9],
    "mushroom": [18, 1, 20, 9, 8],
    "cheese": [14, 3, 20],
    "pie": [20, 2, 8, 3],
    "banana": [3, 14, 4],
    "grapes": [15, 6, 12, 17],
    "pineapple": [14, 3, 4, 17],
    "fish": [10, 19, 2, 20],
    "carrot": [16, 2, 4, 11],
    "orange": [2, 14, 3],
    "diamond": [9, 19, 5, 10],
    "ruby": [18, 1, 12, 9],
    "sapphire": [10, 19, 5, 9],
    "key": [14, 3, 8],
    "chest": [8, 20, 14, 18],
    "crystal": [5, 19, 6, 9],
    "book": [8, 20, 18, 14],
    "clover": [17, 11, 4],
    "sword": [19, 9, 8, 14],
    "axe": [19, 8, 14, 16],
    "bow": [8, 20, 14],
    "staff": [8, 14, 19, 6],
    "dagger": [19, 9, 8],
    "red devil": [18, 1, 15],
    "blue dragon": [10, 19, 5, 15],
    "green dragon": [17, 11, 4, 14],
    "beholder": [15, 6, 12, 3],
    "hydra": [17, 11, 4, 8],
    "giant spider": [8, 15, 18],
    "purple spider": [15, 6, 12, 8],
    "griffin": [14, 20, 8, 18],
    "sphinx": [14, 20, 8],
    "djinn": [10, 19, 6, 9],
    "panther": [15, 19, 8],
    "dark wolf": [15, 19, 8],
    "wolf mage": [15, 19, 6, 8],
    "green serpent": [17, 11, 4],
    "worm": [16, 2, 8, 20],
    "cactus man": [17, 11, 4, 8],
    "reaper": [15, 19, 18, 9],
    "giant fly": [10, 13, 17, 8],
    "blue king": [10, 19, 14, 9],
    "green king": [17, 11, 14, 9],
    "queen": [7, 12, 14, 9],
    "yellow mage": [14, 3, 6, 15],
    "purple mage": [15, 6, 12, 9],
    "red priest": [18, 1, 9, 14],
    "wizard": [10, 15, 6, 9],
    "witch": [15, 12, 8, 9],
    "axe knight": [19, 8, 14, 18],
    "dark knight": [15, 19, 8, 18],
    "red warrior": [18, 1, 19, 8],
    "viking": [8, 20, 19, 14],
    "barbarian": [16, 8, 20, 18],
    "crossed swords": [19, 8, 14, 9],
    "bear": [8, 20, 9],
    "sheep": [9, 20, 8],
    "frog": [17, 11, 4, 3],
    "toad": [4, 11, 8, 3],
    "crocodile": [17, 11, 4, 8],
    "lizard": [17, 11, 13, 4],
    "beetle": [15, 17, 14, 8],
    "butterfly": [12, 6, 14, 15],
    "parrot": [17, 14, 18, 10, 19],
    "goldfish": [14, 2, 3, 10],
}

TOKEN_PREFERENCES: Dict[str, List[int]] = {
    "red": [18, 1],
    "orange": [2, 16, 14],
    "yellow": [14, 3],
    "green": [17, 11, 4],
    "blue": [10, 19, 5],
    "purple": [15, 6, 12],
    "pink": [12, 7, 20],
    "gold": [14, 3, 20],
    "dark": [15, 8, 19],
    "wolf": [15, 19, 8],
    "dragon": [10, 17, 14],
    "mage": [15, 6, 14],
    "king": [14, 10, 19],
    "queen": [7, 12, 14],
    "knight": [19, 15, 8],
    "warrior": [18, 19, 8],
}

CATEGORY_BASE: Dict[str, List[int]] = {
    "food": [18, 2, 14, 4, 17, 20, 9, 8],
    "item": [9, 19, 10, 14, 15, 8, 20],
    "potion": [9, 8, 14, 10, 19, 6, 7, 17, 18],
    "weapon": [19, 8, 14, 20, 16, 9, 15],
    "monster": [15, 18, 8, 17, 10, 14, 6],
    "animal": [8, 20, 9, 17, 10, 14, 6, 12],
    "character": [15, 19, 14, 18, 8, 9, 20],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert downloaded MakeBead templates into guanka levels."
    )
    parser.add_argument(
        "--bundle",
        default="tools/downloaded/makebead_templates_bundle.json",
        help="Template bundle JSON exported from MakeBead.",
    )
    parser.add_argument(
        "--image-dir",
        default="tools/downloaded",
        help="Directory containing the downloaded template PNG files.",
    )
    parser.add_argument(
        "--output-dir",
        default="guanka",
        help="Directory to write the generated level JSON files to.",
    )
    parser.add_argument(
        "--start-level",
        type=int,
        default=10001,
        help="First level id to write.",
    )
    parser.add_argument(
        "--attempts",
        type=int,
        default=18,
        help="Shuffle attempts per level. Highest displacement ratio wins.",
    )
    parser.add_argument(
        "--max-groups-per-color",
        type=int,
        default=5,
        help="Upper bound for clustered initial regions per color.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Optional number of templates to import.",
    )
    return parser.parse_args()


def normalize_name(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    return re.sub(r"\s+", " ", cleaned)


def infer_category(template_name: str, source_name: str) -> str:
    prefix = source_name.split("-", 1)[0]
    normalized = normalize_name(template_name)
    if prefix in {"food", "item", "potion", "weapon"}:
        return prefix
    if normalized in ANIMAL_NAMES:
        return "animal"
    if normalized in CHARACTER_NAMES:
        return "character"
    return "monster"


def ordered_unique(values: Iterable[int]) -> List[int]:
    result: List[int] = []
    seen = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def preferred_palette_ids(template_name: str, category: str) -> List[int]:
    normalized = normalize_name(template_name)
    result: List[int] = []
    result.extend(EXACT_PREFERENCES.get(normalized, []))
    for token in normalized.split():
        result.extend(TOKEN_PREFERENCES.get(token, []))
    result.extend(CATEGORY_BASE.get(category, []))
    return ordered_unique(result)


def choose_outline_id(template_name: str, category: str, preferred_ids: Sequence[int]) -> int:
    normalized = normalize_name(template_name)
    if category == "food":
        return 8
    if category == "potion":
        return 8
    if category == "item":
        return 19
    if category == "weapon":
        if normalized in {"bow", "staff"}:
            return 8
        return 19
    if category == "character":
        return 15
    if 15 in preferred_ids[:3] or 6 in preferred_ids[:3] or 12 in preferred_ids[:3]:
        return 15
    if 10 in preferred_ids[:3] or 19 in preferred_ids[:3]:
        return 19
    if 18 in preferred_ids[:2] and category == "monster":
        return 18
    return 8


def weighted_rgb_distance(a: Rgb, b: Rgb) -> float:
    dr = a[0] - b[0]
    dg = a[1] - b[1]
    db = a[2] - b[2]
    return 2.0 * dr * dr + 4.0 * dg * dg + 3.0 * db * db


def rgb_metrics(rgb: Rgb) -> Tuple[float, float, float, float]:
    r, g, b = rgb
    hue, sat, val = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return hue, sat, val, lum


def dark_candidate_ids(outline_id: int) -> List[int]:
    return ordered_unique([outline_id, 8, 15, 18, 16, 17, 10, 19])


def dark_hue_candidates(avg_rgb: Rgb, category: str, outline_id: int) -> List[int]:
    hue, sat, _, lum = rgb_metrics(avg_rgb)
    degrees = hue * 360.0
    if lum < 40 and sat < 0.18:
        if category in {"item", "weapon"}:
            return ordered_unique([outline_id, 19, 15, 8])
        if category == "character":
            return ordered_unique([outline_id, 15, 8, 18])
        return ordered_unique([outline_id, 8, 15, 17])
    if sat < 0.18:
        if category in {"food", "animal"}:
            return ordered_unique([outline_id, 8, 17, 15])
        return ordered_unique([outline_id, 15, 19, 8])
    if degrees < 20 or degrees >= 345:
        return ordered_unique([outline_id, 18, 1, 16, 8])
    if degrees < 50:
        return ordered_unique([outline_id, 16, 8, 14, 2])
    if degrees < 75:
        return ordered_unique([outline_id, 14, 3, 8, 20])
    if degrees < 170:
        return ordered_unique([outline_id, 17, 11, 4, 8])
    if degrees < 245:
        return ordered_unique([outline_id, 10, 19, 13, 15])
    if degrees < 320:
        return ordered_unique([outline_id, 15, 6, 12, 8])
    return ordered_unique([outline_id, 12, 15, 18, 8])


def map_region_color(
    avg_rgb: Rgb,
    count: int,
    boundary_ratio: float,
    category: str,
    preferred_ids: Sequence[int],
    outline_id: int,
    used_ids: Counter,
) -> int:
    _, sat, val, lum = rgb_metrics(avg_rgb)
    if lum >= 230 and sat <= 0.14:
        return 9

    is_outline_like = boundary_ratio >= 0.58
    is_dark = lum < 72 or (lum < 105 and is_outline_like and sat < 0.55)
    candidate_ids = (
        dark_hue_candidates(avg_rgb, category, outline_id)
        if is_dark
        else list(PALETTE.keys())
    )

    def score_candidate(palette_id: int) -> float:
        _, palette_rgb = PALETTE[palette_id]
        score = weighted_rgb_distance(avg_rgb, palette_rgb)

        if palette_id in preferred_ids[:3]:
            score -= 1400
        elif palette_id in preferred_ids[:6]:
            score -= 700

        if palette_id == outline_id and not is_dark:
            score += 500

        if palette_id in {8, 15, 16, 18, 19} and lum > 150:
            score += 450

        if palette_id == 9 and lum < 180:
            score += 650

        if palette_id in {3, 14} and lum < 90:
            score += 800

        if palette_id in {11, 17} and sat < 0.25 and lum < 90:
            score += 500

        if palette_id == 8 and category in {"item", "character"} and lum > 180:
            score += 550

        if count < 20 and palette_id == outline_id and not is_outline_like:
            score += 250

        return score

    unused_candidates = [palette_id for palette_id in candidate_ids if used_ids[palette_id] == 0]
    if unused_candidates:
        best_id = min(unused_candidates, key=score_candidate)
    else:
        best_id = min(candidate_ids, key=score_candidate)
    used_ids[best_id] += 1
    return best_id


def count_colors(grid: Grid) -> Dict[str, int]:
    stats = Counter(value for row in grid for value in row if value > 0)
    return {str(color_id): stats[color_id] for color_id in sorted(stats)}


def filled_count(grid: Grid) -> int:
    return sum(1 for row in grid for value in row if value > 0)


def region_samples(entry: Dict[str, object], image: Image.Image) -> List[Dict[str, object]]:
    grid: Grid = entry["correctColorArr"]  # type: ignore[assignment]
    height = len(grid)
    width = len(grid[0])
    sums: Dict[int, List[int]] = defaultdict(lambda: [0, 0, 0])
    counts: Counter = Counter()
    boundary: Counter = Counter()

    for row in range(height):
        for col in range(width):
            source_id = grid[row][col]
            if source_id <= 0:
                continue
            r, g, b, a = image.getpixel((col, row))
            if a <= 0:
                continue
            sums[source_id][0] += r
            sums[source_id][1] += g
            sums[source_id][2] += b
            counts[source_id] += 1
            for dr, dc in DIRS8:
                nr = row + dr
                nc = col + dc
                if nr < 0 or nr >= height or nc < 0 or nc >= width or grid[nr][nc] == 0:
                    boundary[source_id] += 1
                    break

    descriptors: List[Dict[str, object]] = []
    for source_id in sorted(counts):
        count = counts[source_id]
        avg_rgb = tuple(round(sums[source_id][idx] / count) for idx in range(3))
        descriptors.append(
            {
                "sourceId": source_id,
                "count": count,
                "avgRgb": avg_rgb,
                "boundaryRatio": boundary[source_id] / max(1, count),
            }
        )
    descriptors.sort(key=lambda item: (-int(item["count"]), int(item["sourceId"])))
    return descriptors


def build_color_mapping(
    entry: Dict[str, object],
    image_path: Path,
) -> Dict[int, int]:
    with Image.open(image_path).convert("RGBA") as image:
        descriptors = region_samples(entry, image)

    template_name = str(entry.get("templateName", "Template"))
    category = infer_category(template_name, str(entry.get("templateSource", "")))
    preferred_ids = preferred_palette_ids(template_name, category)
    outline_id = choose_outline_id(template_name, category, preferred_ids)

    used_ids: Counter = Counter()
    mapping: Dict[int, int] = {}
    total_count = sum(int(descriptor["count"]) for descriptor in descriptors)
    outline_source_id = None
    outline_score = -1.0
    for descriptor in descriptors:
        avg_rgb = descriptor["avgRgb"]  # type: ignore[assignment]
        _, sat, _, lum = rgb_metrics(avg_rgb)
        count = int(descriptor["count"])
        count_ratio = count / max(1, total_count)
        boundary_ratio = float(descriptor["boundaryRatio"])
        if count_ratio > 0.55:
            continue
        score = boundary_ratio * 100.0 + max(0.0, 120.0 - lum) * 0.8
        if sat < 0.45:
            score += 10.0
        if score > outline_score and (boundary_ratio >= 0.28 or lum < 90):
            outline_score = score
            outline_source_id = int(descriptor["sourceId"])

    if outline_source_id is not None:
        mapping[outline_source_id] = outline_id
        used_ids[outline_id] += 1

    for descriptor in descriptors:
        source_id = int(descriptor["sourceId"])
        if outline_source_id is not None and source_id == outline_source_id:
            continue
        mapping[source_id] = map_region_color(
            avg_rgb=descriptor["avgRgb"],  # type: ignore[arg-type]
            count=int(descriptor["count"]),
            boundary_ratio=float(descriptor["boundaryRatio"]),
            category=category,
            preferred_ids=preferred_ids,
            outline_id=outline_id,
            used_ids=used_ids,
        )
    return mapping


def remap_grid(grid: Grid, color_mapping: Dict[int, int]) -> Grid:
    return [
        [color_mapping.get(value, 0) if value > 0 else 0 for value in row]
        for row in grid
    ]


def choose_best_init(
    correct: Grid,
    base_seed: int,
    attempts: int,
    max_groups_per_color: int,
) -> Tuple[Grid, float, int]:
    best_grid: Grid | None = None
    best_ratio = -1.0
    best_seed = base_seed
    total_attempts = max(1, attempts)
    for attempt in range(total_attempts):
        seed = base_seed + attempt * 9973
        init_grid = assign_initial_layout(
            correct,
            seed=seed,
            max_groups_per_color=max_groups_per_color,
        )
        ratio = displacement_ratio(correct, init_grid)
        if ratio > best_ratio:
            best_grid = init_grid
            best_ratio = ratio
            best_seed = seed
    if best_grid is None:
        raise ValueError("Unable to generate an initial shuffled board")
    return best_grid, best_ratio, best_seed


def estimate_time_limit(filled: int, color_count: int, width: int, height: int) -> int:
    density = filled / max(1, width * height)
    time_value = filled * 0.38 + color_count * 16 + density * 40
    return max(150, min(420, int(round(time_value))))


def build_payload(
    level_id: int,
    entry: Dict[str, object],
    correct_grid: Grid,
    init_grid: Grid,
    ratio: float,
    shuffle_seed: int,
) -> Dict[str, object]:
    width = len(correct_grid[0])
    height = len(correct_grid)
    filled = filled_count(correct_grid)
    color_stats = count_colors(correct_grid)
    category = infer_category(
        str(entry.get("templateName", "Template")),
        str(entry.get("templateSource", "")),
    )
    payload: Dict[str, object] = {
        "levelId": level_id,
        "boardWidth": width,
        "boardHeight": height,
        "timeLimit": estimate_time_limit(filled, len(color_stats), width, height),
        "slotTotalCount": filled,
        "filledCellCount": filled,
        "colorCount": len(color_stats),
        "colorStats": color_stats,
        "displacementRatio": round(ratio, 4),
        "initShuffleSeed": shuffle_seed,
        "isFeatured": False,
        "templateName": entry.get("templateName"),
        "templateSource": entry.get("templateSource"),
        "templateCategory": category,
        "sourceTemplateId": entry.get("levelId"),
        "importSource": "https://makebead.com/zh-Hans/templates/",
        "correctColorArr": correct_grid,
        "initRandomColorArr": init_grid,
    }
    return payload


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def load_templates(bundle_path: Path) -> List[Dict[str, object]]:
    with bundle_path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    levels = payload.get("levels")
    if not isinstance(levels, list):
        raise ValueError(f"{bundle_path} does not contain a levels list")
    return levels


def import_templates(args: argparse.Namespace) -> Dict[str, object]:
    bundle_path = Path(args.bundle)
    image_dir = Path(args.image_dir)
    output_dir = Path(args.output_dir)
    templates = load_templates(bundle_path)
    if args.limit:
        templates = templates[: max(0, args.limit)]

    summary_levels: List[Dict[str, object]] = []
    ratios: List[float] = []
    color_counts: List[int] = []
    filled_values: List[int] = []

    for offset, entry in enumerate(templates):
        level_id = args.start_level + offset
        image_name = str(entry["templateSource"])
        image_path = image_dir / image_name
        if not image_path.exists():
            raise FileNotFoundError(f"Missing template image: {image_path}")

        source_grid: Grid = entry["correctColorArr"]
        color_mapping = build_color_mapping(entry, image_path)
        correct_grid = remap_grid(source_grid, color_mapping)
        base_seed = 20260424 + level_id * 7919
        init_grid, ratio, chosen_seed = choose_best_init(
            correct=correct_grid,
            base_seed=base_seed,
            attempts=args.attempts,
            max_groups_per_color=args.max_groups_per_color,
        )
        payload = build_payload(
            level_id=level_id,
            entry=entry,
            correct_grid=correct_grid,
            init_grid=init_grid,
            ratio=ratio,
            shuffle_seed=chosen_seed,
        )
        output_path = output_dir / f"level_{level_id}.json"
        write_json(output_path, payload)

        summary_levels.append(
            {
                "levelId": level_id,
                "templateName": entry.get("templateName"),
                "templateSource": entry.get("templateSource"),
                "templateCategory": payload["templateCategory"],
                "filledCellCount": payload["filledCellCount"],
                "colorCount": payload["colorCount"],
                "displacementRatio": payload["displacementRatio"],
            }
        )
        ratios.append(float(payload["displacementRatio"]))
        color_counts.append(int(payload["colorCount"]))
        filled_values.append(int(payload["filledCellCount"]))

    return {
        "imported": len(summary_levels),
        "startLevel": args.start_level,
        "endLevel": args.start_level + len(summary_levels) - 1 if summary_levels else args.start_level,
        "averageDisplacementRatio": round(sum(ratios) / len(ratios), 4) if ratios else 0.0,
        "averageColorCount": round(sum(color_counts) / len(color_counts), 2) if color_counts else 0.0,
        "averageFilledCellCount": round(sum(filled_values) / len(filled_values), 2) if filled_values else 0.0,
        "levels": summary_levels,
    }


def main() -> None:
    args = parse_args()
    summary = import_templates(args)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
