#!/usr/bin/env python3
"""Import Pixel Beads patterns into guanka level JSON files."""

from __future__ import annotations

import argparse
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, deque
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Set, Tuple

from generate_initial_shuffle import DIFFICULTY_PRESETS, choose_best_init, default_time_limit

Grid = List[List[int]]
CodeGrid = List[List[str]]
Rgb = Tuple[int, int, int]
Point = Tuple[int, int]

LIST_PATH = "/zh/perler-bead-pattern"
LIST_URL = f"https://www.pixel-beads.com{LIST_PATH}"
IMPORT_SOURCE = "https://www.pixel-beads.com/zh/perler-bead-pattern"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

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

ASSET_RE = re.compile(r'href="(/assets/[^"]+\.js)"')
ACTION_RE = re.compile(r'([0-9a-f]+#fetchPatternsAction)')
COLOR_RE = re.compile(r'id:"([^"]+)",name:"[^"]*",hex:"(#[0-9A-Fa-f]{6})"')
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
DIRS4: Tuple[Point, ...] = ((-1, 0), (1, 0), (0, -1), (0, 1))
TRANSPARENT_CODES = {"", "transparent", "#00000000"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Pixel Beads patterns and convert them into guanka level JSON files."
    )
    parser.add_argument(
        "--output-dir",
        default="guanka",
        help="Directory to write the generated level JSON files to.",
    )
    parser.add_argument(
        "--report-output",
        default="tools/generated_levels/pixel_beads_import_report.json",
        help="Path to write the import report JSON.",
    )
    parser.add_argument(
        "--start-level",
        type=int,
        default=20000,
        help="First level id to write.",
    )
    parser.add_argument(
        "--page-start",
        type=int,
        default=1,
        help="First Pixel Beads list page to import.",
    )
    parser.add_argument(
        "--page-end",
        type=int,
        help="Last Pixel Beads list page to import. Defaults to importing until exhaustion.",
    )
    parser.add_argument(
        "--limit-per-page",
        type=int,
        default=100,
        help="Patterns to request per list page.",
    )
    parser.add_argument(
        "--max-patterns",
        type=int,
        help="Optional hard cap on the number of patterns to import.",
    )
    parser.add_argument(
        "--sort-by",
        choices=("popular", "newest"),
        default="popular",
        help="Pixel Beads list sort mode.",
    )
    parser.add_argument(
        "--difficulty",
        choices=sorted(DIFFICULTY_PRESETS.keys()),
        default="normal",
        help="Difficulty preset used to build initRandomColorArr.",
    )
    parser.add_argument(
        "--attempts",
        type=int,
        default=10,
        help="Shuffle attempts per group-count setting.",
    )
    parser.add_argument(
        "--target-displacement",
        type=float,
        help="Optional displacement target override.",
    )
    parser.add_argument(
        "--min-displacement",
        type=float,
        help="Optional soft lower bound for displacement ratio.",
    )
    parser.add_argument(
        "--max-displacement",
        type=float,
        help="Optional soft upper bound for displacement ratio.",
    )
    parser.add_argument(
        "--request-delay",
        type=float,
        default=0.25,
        help="Delay in seconds between list-page requests.",
    )
    parser.add_argument(
        "--border-padding",
        type=int,
        default=0,
        help="Optional empty-cell padding to keep around the cropped artwork.",
    )
    parser.add_argument(
        "--max-side",
        type=int,
        default=100,
        help="Maximum allowed board width or height after conversion. Set to 0 to disable.",
    )
    parser.add_argument(
        "--max-area",
        type=int,
        default=10000,
        help="Maximum allowed board area after conversion. Set to 0 to disable.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Do not overwrite output files that already exist.",
    )
    return parser.parse_args()


def build_headers(referer: str | None = None, extra: Dict[str, str] | None = None) -> Dict[str, str]:
    headers = {
        "user-agent": DEFAULT_USER_AGENT,
        "accept": "*/*",
    }
    if referer:
        headers["referer"] = referer
        headers["origin"] = "https://www.pixel-beads.com"
    if extra:
        headers.update(extra)
    return headers


def fetch_text(
    url: str,
    *,
    method: str = "GET",
    body: bytes | None = None,
    headers: Dict[str, str] | None = None,
    timeout: int = 60,
) -> str:
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers=headers or {},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {exc.code} for {url}: {detail[:400]}") from exc


def discover_runtime_metadata() -> Tuple[str, Dict[str, str]]:
    html = fetch_text(LIST_URL, headers=build_headers())
    asset_paths: List[str] = []
    seen: Set[str] = set()
    for path in ASSET_RE.findall(html):
        if path in seen:
            continue
        seen.add(path)
        asset_paths.append(path)
    asset_paths.sort(key=lambda path: ("BaseLink" not in path, path))

    action_id: str | None = None
    color_map: Dict[str, str] = {}
    for asset_path in asset_paths:
        asset_url = urllib.parse.urljoin(LIST_URL, asset_path)
        asset_text = fetch_text(asset_url, headers=build_headers(referer=LIST_URL))
        if action_id is None:
            match = ACTION_RE.search(asset_text)
            if match:
                action_id = match.group(1)
        for code, hex_value in COLOR_RE.findall(asset_text):
            color_map.setdefault(code, hex_value.upper())
        if action_id and len(color_map) >= 200:
            break

    if action_id is None:
        raise RuntimeError("Failed to discover fetchPatternsAction id from Pixel Beads assets.")
    if not color_map:
        raise RuntimeError("Failed to discover Pixel Beads color catalog from frontend assets.")
    return action_id, color_map


def list_rsc_url() -> str:
    return f"https://www.pixel-beads.com{rsc_path(LIST_PATH)}"


def rsc_path(path: str) -> str:
    clean_path = path.split("#", 1)[0]
    query_index = clean_path.find("?")
    base_path = clean_path if query_index == -1 else clean_path[:query_index]
    query = "" if query_index == -1 else clean_path[query_index:]
    if len(base_path) > 1 and base_path.endswith("/"):
        base_path = base_path[:-1]
    return f"{base_path}.rsc{query}"


def parse_rsc_action_response(text: str) -> Dict[str, object]:
    for line in text.splitlines():
        prefix, separator, payload = line.partition(":")
        if prefix != "0" or not separator:
            continue
        root = json.loads(payload)
        return_value = root.get("returnValue")
        if not isinstance(return_value, dict) or not return_value.get("ok"):
            raise RuntimeError("Pixel Beads server action returned an error payload.")
        data = return_value.get("data")
        if not isinstance(data, dict):
            raise RuntimeError("Pixel Beads server action returned an unexpected data payload.")
        return data
    raise RuntimeError("Failed to parse Pixel Beads RSC action response.")


def fetch_patterns_page(
    *,
    page: int,
    limit: int,
    sort_by: str,
    action_id: str,
) -> Dict[str, object]:
    payload = json.dumps(
        [{"page": page, "limit": limit, "sortBy": sort_by}],
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    headers = build_headers(
        referer=LIST_URL,
        extra={
            "x-rsc-action": action_id,
            "content-type": "text/plain;charset=UTF-8",
        },
    )
    text = fetch_text(
        list_rsc_url(),
        method="POST",
        body=payload,
        headers=headers,
    )
    return parse_rsc_action_response(text)


def hex_to_rgb(hex_value: str) -> Rgb:
    value = hex_value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def weighted_rgb_distance(a: Rgb, b: Rgb) -> float:
    dr = a[0] - b[0]
    dg = a[1] - b[1]
    db = a[2] - b[2]
    return 2.0 * dr * dr + 4.0 * dg * dg + 3.0 * db * db


def luminance(rgb: Rgb) -> float:
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def valid_code_grid(pixels: object) -> CodeGrid:
    if not isinstance(pixels, list) or not pixels or not isinstance(pixels[0], list):
        raise ValueError("Pattern pixels must be a non-empty 2D array.")
    width = len(pixels[0])
    grid: CodeGrid = []
    for row in pixels:
        if not isinstance(row, list) or len(row) != width:
            raise ValueError("Pattern pixels must have consistent row width.")
        grid.append([str(cell) for cell in row])
    return grid


def border_points(height: int, width: int) -> List[Point]:
    points: List[Point] = []
    for row in range(height):
        for col in range(width):
            if row == 0 or row == height - 1 or col == 0 or col == width - 1:
                points.append((row, col))
    return points


def corner_points(height: int, width: int) -> List[Point]:
    return [(0, 0), (0, width - 1), (height - 1, 0), (height - 1, width - 1)]


def border_connected_mask(grid: CodeGrid, target_code: str) -> Set[Point]:
    height = len(grid)
    width = len(grid[0])
    queue: deque[Point] = deque()
    visited: Set[Point] = set()
    for row, col in border_points(height, width):
        if grid[row][col] == target_code:
            point = (row, col)
            queue.append(point)
            visited.add(point)
    while queue:
        row, col = queue.popleft()
        for dr, dc in DIRS4:
            nr = row + dr
            nc = col + dc
            point = (nr, nc)
            if nr < 0 or nr >= height or nc < 0 or nc >= width:
                continue
            if point in visited or grid[nr][nc] != target_code:
                continue
            visited.add(point)
            queue.append(point)
    return visited


def infer_background_code(grid: CodeGrid) -> str | None:
    height = len(grid)
    width = len(grid[0])
    border_counts: Counter[str] = Counter()
    corner_counts: Counter[str] = Counter()
    for row, col in border_points(height, width):
        border_counts[grid[row][col]] += 1
    for row, col in corner_points(height, width):
        corner_counts[grid[row][col]] += 1

    best_code: str | None = None
    best_score = -1.0
    border_len = max(1, len(border_points(height, width)))
    for code, count in border_counts.items():
        connected = len(border_connected_mask(grid, code))
        score = connected * 4.0 + count * 2.0 + corner_counts[code] * 24.0
        if score > best_score:
            best_code = code
            best_score = score

    if best_code is None:
        return None

    connected = len(border_connected_mask(grid, best_code))
    if corner_counts[best_code] >= 2:
        return best_code
    if border_counts[best_code] / border_len >= 0.30:
        return best_code
    if connected / max(1, height * width) >= 0.12:
        return best_code
    return None


def clamp(value: int, lower: int, upper: int) -> int:
    return max(lower, min(upper, value))


def trim_grid(grid: Grid, padding: int) -> Grid:
    height = len(grid)
    width = len(grid[0])
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
    min_row = clamp(min_row - pad, 0, height - 1)
    max_row = clamp(max_row + pad, 0, height - 1)
    min_col = clamp(min_col - pad, 0, width - 1)
    max_col = clamp(max_col + pad, 0, width - 1)
    return [row[min_col : max_col + 1] for row in grid[min_row : max_row + 1]]


def downscale_grid(grid: Grid, target_width: int, target_height: int) -> Grid:
    source_height = len(grid)
    source_width = len(grid[0])
    if target_width >= source_width and target_height >= source_height:
        return [row[:] for row in grid]

    downscaled: Grid = []
    for dest_row in range(target_height):
        src_row_start = int(dest_row * source_height / target_height)
        src_row_end = max(src_row_start + 1, int((dest_row + 1) * source_height / target_height))
        row_values: List[int] = []
        for dest_col in range(target_width):
            src_col_start = int(dest_col * source_width / target_width)
            src_col_end = max(src_col_start + 1, int((dest_col + 1) * source_width / target_width))
            counts: Counter[int] = Counter()
            for src_row in range(src_row_start, min(src_row_end, source_height)):
                for src_col in range(src_col_start, min(src_col_end, source_width)):
                    value = grid[src_row][src_col]
                    if value > 0:
                        counts[value] += 1
            if counts:
                chosen = min(
                    counts.items(),
                    key=lambda item: (-item[1], item[0]),
                )[0]
            else:
                chosen = 0
            row_values.append(chosen)
        downscaled.append(row_values)
    return downscaled


def fit_grid_to_limits(grid: Grid, max_side: int, max_area: int) -> Tuple[Grid, Dict[str, object]]:
    width = len(grid[0])
    height = len(grid)
    area = width * height
    metadata = {
        "resized": False,
        "preResizeWidth": width,
        "preResizeHeight": height,
        "preResizeArea": area,
        "preResizeFilled": fill_count(grid),
        "maxSide": max_side,
        "maxArea": max_area,
    }
    side_limit = max(0, int(max_side))
    area_limit = max(0, int(max_area))
    exceeds_side = side_limit > 0 and max(width, height) > side_limit
    exceeds_area = area_limit > 0 and area > area_limit
    if not exceeds_side and not exceeds_area:
        metadata.update(
            {
                "postResizeWidth": width,
                "postResizeHeight": height,
                "postResizeArea": area,
                "postResizeFilled": fill_count(grid),
                "resizeScale": 1.0,
            }
        )
        return grid, metadata

    scale = 1.0
    if side_limit > 0:
        scale = max(scale, width / side_limit, height / side_limit)
    if area_limit > 0 and area > 0:
        scale = max(scale, math.sqrt(area / area_limit))

    target_width = max(1, min(width, round(width / scale)))
    target_height = max(1, min(height, round(height / scale)))
    while side_limit > 0 and max(target_width, target_height) > side_limit:
        if target_width >= target_height and target_width > 1:
            target_width -= 1
        elif target_height > 1:
            target_height -= 1
        else:
            break
    while area_limit > 0 and target_width * target_height > area_limit:
        if target_width >= target_height and target_width > 1:
            target_width -= 1
        elif target_height > 1:
            target_height -= 1
        else:
            break

    resized = downscale_grid(grid, target_width, target_height)
    resized = trim_grid(resized, 0)
    metadata.update(
        {
            "resized": True,
            "postResizeWidth": len(resized[0]),
            "postResizeHeight": len(resized),
            "postResizeArea": len(resized[0]) * len(resized),
            "postResizeFilled": fill_count(resized),
            "resizeScale": round(scale, 4),
        }
    )
    return resized, metadata


def assign_palette_ids(hex_values: Iterable[str]) -> Dict[str, int]:
    counts = Counter(hex_values)
    items = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    assignments: Dict[str, int] = {}
    usage: Counter[int] = Counter()
    unique_total = len(items)

    for hex_value, _ in items:
        rgb = hex_to_rgb(hex_value)
        lum = luminance(rgb)
        best_palette_id: int | None = None
        best_score: float | None = None
        for palette_id, (_, palette_rgb) in PALETTE.items():
            score = weighted_rgb_distance(rgb, palette_rgb)
            if palette_id == 9 and lum < 182:
                score += 6000
            if palette_id in {8, 15, 16, 18} and lum > 225:
                score += 4500
            if palette_id in {3, 14} and lum < 92:
                score += 2200
            reuse_penalty = (4800 if unique_total <= len(PALETTE) else 1400) * usage[palette_id]
            score += reuse_penalty
            if best_score is None or score < best_score:
                best_score = score
                best_palette_id = palette_id
        if best_palette_id is None:
            raise RuntimeError(f"Failed to assign a palette color for {hex_value}")
        assignments[hex_value] = best_palette_id
        usage[best_palette_id] += 1
    return assignments


def fill_count(grid: Grid) -> int:
    return sum(1 for row in grid for value in row if value > 0)


def color_stats(grid: Grid) -> Dict[str, int]:
    counts = Counter(value for row in grid for value in row if value > 0)
    return {str(color_id): counts[color_id] for color_id in sorted(counts)}


def convert_pattern_grid(
    code_grid: CodeGrid,
    code_to_hex: Dict[str, str],
    border_padding: int,
    max_side: int,
    max_area: int,
) -> Tuple[Grid, Dict[str, object]]:
    height = len(code_grid)
    width = len(code_grid[0])
    background_code = infer_background_code(code_grid)
    background_mask: Set[Point] = set()
    if background_code:
        background_mask = border_connected_mask(code_grid, background_code)

    def build_visible_grid(mask: Set[Point]) -> Tuple[Grid, List[List[str | None]], List[str], Set[str]]:
        converted: Grid = []
        non_background_hexes: List[str] = []
        missing_codes: Set[str] = set()
        visible_hexes: List[List[str | None]] = []
        for row in range(height):
            converted_row: List[int] = []
            visible_row: List[str | None] = []
            for col in range(width):
                code = code_grid[row][col]
                point = (row, col)
                if code in TRANSPARENT_CODES or point in mask:
                    converted_row.append(0)
                    visible_row.append(None)
                    continue
                hex_value = code_to_hex.get(code)
                if hex_value is None:
                    if HEX_RE.match(code):
                        hex_value = code.upper()
                    else:
                        missing_codes.add(code)
                        converted_row.append(0)
                        visible_row.append(None)
                        continue
                converted_row.append(-1)
                visible_row.append(hex_value)
                non_background_hexes.append(hex_value)
            converted.append(converted_row)
            visible_hexes.append(visible_row)
        return converted, visible_hexes, non_background_hexes, missing_codes

    converted, visible_hexes, non_background_hexes, missing_codes = build_visible_grid(background_mask)
    background_fallback_disabled = False
    effective_background_code = background_code
    effective_background_mask = background_mask
    if not non_background_hexes and background_mask:
        converted, visible_hexes, non_background_hexes, missing_codes = build_visible_grid(set())
        background_fallback_disabled = True
        effective_background_code = None
        effective_background_mask = set()

    if missing_codes:
        raise ValueError(f"Missing hex mapping for Pixel Beads codes: {sorted(missing_codes)}")
    if not non_background_hexes:
        raise ValueError("Pattern produced an empty board after background removal.")

    assignments = assign_palette_ids(non_background_hexes)
    for row in range(height):
        for col in range(width):
            if converted[row][col] != -1:
                continue
            hex_value = visible_hexes[row][col]
            if hex_value is None:
                converted[row][col] = 0
            else:
                converted[row][col] = assignments[hex_value]

    trimmed = trim_grid(converted, border_padding)
    fitted, resize_meta = fit_grid_to_limits(trimmed, max_side=max_side, max_area=max_area)
    filled = fill_count(fitted)
    if filled <= 0:
        raise ValueError("Pattern became empty after trimming.")

    metadata = {
        "sourceWidth": width,
        "sourceHeight": height,
        "trimmedWidth": len(trimmed[0]),
        "trimmedHeight": len(trimmed),
        "backgroundCode": effective_background_code,
        "backgroundCellCount": len(effective_background_mask),
        "inferredBackgroundCode": background_code,
        "inferredBackgroundCellCount": len(background_mask),
        "backgroundFallbackDisabled": background_fallback_disabled,
        "missingCodes": sorted(missing_codes),
        "sourceColorCount": len(set(non_background_hexes)),
        "mappedColorCount": len(set(assignments.values())),
    }
    metadata.update(resize_meta)
    return fitted, metadata


def build_level_payload(
    *,
    level_id: int,
    pattern: Dict[str, object],
    correct_grid: Grid,
    difficulty: str,
    attempts: int,
    target_displacement: float | None,
    min_displacement: float | None,
    max_displacement: float | None,
) -> Dict[str, object]:
    preset = DIFFICULTY_PRESETS[difficulty]
    width = len(correct_grid[0])
    height = len(correct_grid)
    filled = fill_count(correct_grid)
    stats = color_stats(correct_grid)
    base_seed = 20260428 + level_id * 7919

    chosen = choose_best_init(
        correct=correct_grid,
        base_seed=base_seed,
        attempts=max(1, attempts),
        min_groups_per_color=int(preset["group_range"][0]),
        max_groups_per_color=int(preset["group_range"][1]),
        target_displacement=(
            float(target_displacement)
            if target_displacement is not None
            else float(preset["target_displacement"])
        ),
        min_displacement=(
            float(min_displacement)
            if min_displacement is not None
            else float(preset["min_displacement"])
        ),
        max_displacement=(
            float(max_displacement)
            if max_displacement is not None
            else float(preset["max_displacement"])
        ),
        minstep_mode="off",
    )

    return {
        "levelId": level_id,
        "boardWidth": width,
        "boardHeight": height,
        "timeLimit": default_time_limit(filled),
        "slotTotalCount": filled,
        "filledCellCount": filled,
        "colorCount": len(stats),
        "colorStats": stats,
        "displacementRatio": round(float(chosen["displacement_ratio"]), 4),
        "initShuffleSeed": int(chosen["seed"]),
        "initShuffleMaxGroupsPerColor": int(chosen["group_count"]),
        "isFeatured": False,
        "levelCategory": "pixel-beads",
        "levelName": str(pattern.get("name") or ""),
        "online": False,
        "source": "pixel-beads.com",
        "importSource": IMPORT_SOURCE,
        "sourcePatternId": str(pattern.get("id") or ""),
        "sourcePatternName": str(pattern.get("name") or ""),
        "sourcePatternAuthor": pattern.get("author"),
        "sourcePatternCreatedAt": pattern.get("createdAt"),
        "sourcePatternFormat": pattern.get("format"),
        "sourcePatternViewCount": pattern.get("viewCount"),
        "sourcePatternPublic": bool(pattern.get("public", True)),
        "sourcePatternThemes": pattern.get("themes") or [],
        "sourcePatternSortBy": None,
        "difficultyPreset": difficulty,
        "correctColorArr": correct_grid,
        "initRandomColorArr": chosen["init_grid"],
    }


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def import_patterns(args: argparse.Namespace) -> Dict[str, object]:
    action_id, code_to_hex = discover_runtime_metadata()
    print(
        f"[pixel-beads] discovered action={action_id} colors={len(code_to_hex)}",
        flush=True,
    )
    output_dir = Path(args.output_dir)
    report_path = Path(args.report_output)
    written_levels: List[Dict[str, object]] = []
    errors: List[Dict[str, object]] = []
    skipped: List[Dict[str, object]] = []
    level_id = int(args.start_level)
    imported_count = 0
    fetched_pages = 0
    source_total: int | None = None
    max_patterns = args.max_patterns if args.max_patterns and args.max_patterns > 0 else None

    current_page = max(1, int(args.page_start))
    while True:
        if args.page_end is not None and current_page > args.page_end:
            break
        print(f"[pixel-beads] fetching page {current_page}", flush=True)
        page_payload = fetch_patterns_page(
            page=current_page,
            limit=max(1, int(args.limit_per_page)),
            sort_by=args.sort_by,
            action_id=action_id,
        )
        fetched_pages += 1
        if source_total is None:
            try:
                source_total = int(page_payload.get("total") or 0)
            except (TypeError, ValueError):
                source_total = 0
        patterns = page_payload.get("data")
        if not isinstance(patterns, list) or not patterns:
            break

        for pattern in patterns:
            if max_patterns is not None and imported_count >= max_patterns:
                break
            if not isinstance(pattern, dict):
                continue
            target_path = output_dir / f"level_{level_id}.json"
            if args.skip_existing and target_path.exists():
                skipped.append(
                    {
                        "levelId": level_id,
                        "file": str(target_path),
                        "reason": "exists",
                        "sourcePatternId": pattern.get("id"),
                    }
                )
                level_id += 1
                continue
            try:
                code_grid = valid_code_grid(pattern.get("pixels"))
                correct_grid, conversion_meta = convert_pattern_grid(
                    code_grid,
                    code_to_hex=code_to_hex,
                    border_padding=max(0, int(args.border_padding)),
                    max_side=max(0, int(args.max_side)),
                    max_area=max(0, int(args.max_area)),
                )
                payload = build_level_payload(
                    level_id=level_id,
                    pattern=pattern,
                    correct_grid=correct_grid,
                    difficulty=args.difficulty,
                    attempts=args.attempts,
                    target_displacement=args.target_displacement,
                    min_displacement=args.min_displacement,
                    max_displacement=args.max_displacement,
                )
                payload["sourcePatternSortBy"] = args.sort_by
                payload["conversionMeta"] = conversion_meta
                write_json(target_path, payload)
                written_levels.append(
                    {
                        "levelId": level_id,
                        "file": str(target_path),
                        "sourcePatternId": pattern.get("id"),
                        "sourcePatternName": pattern.get("name"),
                        "size": f"{payload['boardWidth']}x{payload['boardHeight']}",
                        "filled": payload["filledCellCount"],
                        "colors": payload["colorCount"],
                        "displacementRatio": payload["displacementRatio"],
                    }
                )
                imported_count += 1
                if imported_count % 25 == 0:
                    print(
                        f"[pixel-beads] imported {imported_count} levels; latest={level_id}",
                        flush=True,
                    )
                level_id += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(
                    {
                        "levelId": level_id,
                        "sourcePatternId": pattern.get("id"),
                        "sourcePatternName": pattern.get("name"),
                        "error": str(exc),
                    }
                )
                level_id += 1

        if max_patterns is not None and imported_count >= max_patterns:
            break
        total_pages = None
        if source_total:
            total_pages = max(1, math.ceil(source_total / max(1, int(args.limit_per_page))))
        if total_pages is not None and current_page >= total_pages:
            break
        current_page += 1
        if args.request_delay > 0:
            time.sleep(args.request_delay)

    print(
        f"[pixel-beads] finished pages={fetched_pages} written={len(written_levels)} "
        f"skipped={len(skipped)} errors={len(errors)}",
        flush=True,
    )
    report = {
        "source": IMPORT_SOURCE,
        "actionId": action_id,
        "sortBy": args.sort_by,
        "pageStart": args.page_start,
        "pageEnd": args.page_end,
        "limitPerPage": args.limit_per_page,
        "maxPatterns": max_patterns,
        "maxSide": args.max_side,
        "maxArea": args.max_area,
        "startLevel": args.start_level,
        "difficulty": args.difficulty,
        "fetchedPages": fetched_pages,
        "sourceTotal": source_total,
        "writtenCount": len(written_levels),
        "skippedCount": len(skipped),
        "errorCount": len(errors),
        "writtenLevels": written_levels,
        "skippedLevels": skipped,
        "errors": errors,
    }
    write_json(report_path, report)
    return report


def main() -> None:
    args = parse_args()
    report = import_patterns(args)
    print(
        json.dumps(
            {
                "writtenCount": report["writtenCount"],
                "skippedCount": report["skippedCount"],
                "errorCount": report["errorCount"],
                "report": str(Path(args.report_output)),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
