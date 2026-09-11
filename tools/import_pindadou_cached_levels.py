#!/usr/bin/env python3
"""Convert downloaded 拼大豆 Cocos Level-bundle cache records to preview JSON."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterable


LEVEL_NAME = re.compile(r"level_(\d+)$")
OFFICIAL_COLOR_HEX = {
    1: "#ED5090", 2: "#4EEAEA", 3: "#F8C811", 4: "#FE8B10", 5: "#F4BD9E",
    6: "#EBDEA6", 7: "#4A4DCF", 8: "#7221BC", 9: "#9FCE21", 10: "#CC3827",
    11: "#37A92D", 12: "#207955", 13: "#20A8DC", 14: "#EEB2BC", 15: "#C4BED9",
    16: "#974714", 17: "#782F3C", 18: "#36387E", 19: "#373737", 20: "#F2EDE4",
}
# Exact order from 拼大豆's generated `bead-palette.json`; index zero is reserved for empty cells.
SOURCE_COLOR_HEX = (
    "#2C2C2C", "#FDF48A", "#F9B256", "#F99856", "#F38144", "#FDE7B6", "#FDCB7E",
    "#A9F38A", "#44F356", "#1E9E56", "#166B44", "#B6FDFD", "#B6E7FD", "#00B2E7",
    "#56B2F3", "#4481D3", "#0044B2", "#56D3E7", "#44F3F3", "#E7F3FD", "#1E44B2",
    "#B281D3", "#9856B2", "#E7D3FD", "#B20081", "#331E81", "#B256B2", "#E7D3D3",
    "#9E0081", "#FDCBE7", "#FDB6E7", "#F381B2", "#D34481", "#FDE7F3", "#E7001E",
    "#B20016", "#F35644", "#FDE7D3", "#F3B244", "#9E5644", "#6B331E", "#F3CB9E",
    "#B28156", "#FFFFFF", "#B2B2B2", "#818181", "#444444", "#000000",
)
# Fixed source-palette index -> project official color ID. Values are grouped by the proven source hex's
# hue family, so every source ID means the same rendered project color in every imported level.
SOURCE_COLOR_TO_OFFICIAL = {
    1: 6, 2: 4, 3: 4, 4: 4, 5: 6, 6: 5, 7: 9, 8: 11, 9: 12, 10: 12, 11: 2, 12: 13,
    13: 13, 14: 13, 15: 7, 16: 18, 17: 2, 18: 2, 19: 15, 20: 7, 21: 15, 22: 8, 23: 15,
    24: 1, 25: 18, 26: 8, 27: 5, 28: 8, 29: 14, 30: 14, 31: 1, 32: 1, 33: 14, 34: 10,
    35: 10, 36: 10, 37: 5, 38: 4, 39: 16, 40: 16, 41: 5, 42: 16, 43: 20, 44: 15, 45: 19,
    46: 19, 47: 19,
}
DEFAULT_CACHE_ROOT = Path(
    r"C:\Users\EDY\AppData\Roaming\Tencent\xwechat\radium\users\20f0856314e3dace0b2fba7db5bc6262\applet\local\wxf6aba47bafd06e46\usr\gamecaches"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-root", type=Path, default=DEFAULT_CACHE_ROOT)
    parser.add_argument("--version", default="6.3.0.6", help="Cached client version to import.")
    parser.add_argument("--output", type=Path, default=Path("tools/competitors/拼大豆/levels/main"))
    parser.add_argument("--check", action="store_true", help="Validate source files without writing output.")
    return parser.parse_args()


def walk(value: Any) -> Iterable[Any]:
    yield value
    if isinstance(value, list):
        for child in value:
            yield from walk(child)
    elif isinstance(value, dict):
        for child in value.values():
            yield from walk(child)


def read_level_cache_files(cache_root: Path, version: str) -> list[tuple[Path, str]]:
    manifest_path = cache_root / "cacheList.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"cache index does not exist: {manifest_path}")
    entries = json.loads(manifest_path.read_text(encoding="utf-8"))["files"]
    prefix = f"/client/{version}/remote/Level/import/"
    cached_files: list[tuple[Path, str]] = []
    for remote_url, entry in entries.items():
        if entry.get("bundle") != "Level" or prefix not in remote_url:
            continue
        cache_url = entry.get("url", "")
        relative = cache_url.removeprefix("wxfile://usr/gamecaches/")
        if relative == cache_url:
            raise ValueError(f"unexpected cache URL for {remote_url}: {cache_url}")
        source_file = cache_root / relative
        if not source_file.is_file():
            raise FileNotFoundError(f"cached file missing for {remote_url}: {source_file}")
        cached_files.append((source_file, remote_url))
    if not cached_files:
        raise ValueError(f"no Level JsonAssets found for cached version {version}")
    return cached_files


def find_level_payload(document: Any, source_file: Path) -> tuple[int, dict[str, Any]]:
    candidates: list[tuple[int, dict[str, Any]]] = []
    for value in walk(document):
        if not isinstance(value, list):
            continue
        for index, item in enumerate(value[:-1]):
            match = LEVEL_NAME.fullmatch(item) if isinstance(item, str) else None
            payload = value[index + 1]
            if match and isinstance(payload, dict) and {"grid", "baseLayer", "pieces"}.issubset(payload):
                candidates.append((int(match.group(1)), payload))
    if len(candidates) != 1:
        raise ValueError(f"{source_file}: expected one cached level payload, found {len(candidates)}")
    return candidates[0]


def normalize_grid(values: Any, width: Any, height: Any, source_file: Path, field: str) -> list[list[int]]:
    if not isinstance(width, int) or width <= 0 or not isinstance(height, int) or height <= 0:
        raise ValueError(f"{source_file}: invalid grid dimensions {width!r}×{height!r}")
    if not isinstance(values, list) or len(values) != width * height:
        actual = len(values) if isinstance(values, list) else type(values).__name__
        raise ValueError(f"{source_file}: {field} has {actual} cells, expected {width * height}")
    if any(not isinstance(value, int) or value < 0 for value in values):
        raise ValueError(f"{source_file}: {field} contains invalid source color IDs")
    return [values[row * width:(row + 1) * width] for row in range(height)]


def map_source_color(source_color: int, source_file: Path) -> int:
    official_color = SOURCE_COLOR_TO_OFFICIAL.get(source_color)
    if official_color is None:
        raise ValueError(f"{source_file}: no fixed official-color mapping for source color ID {source_color}")
    return official_color


def convert_level(level_id: int, payload: dict[str, Any], source_file: Path, remote_url: str) -> dict[str, Any]:
    grid = payload["grid"]
    if not isinstance(grid, dict):
        raise ValueError(f"{source_file}: grid must be an object")
    width, height = grid.get("width"), grid.get("height")
    correct_raw = normalize_grid(payload["baseLayer"], width, height, source_file, "baseLayer")
    initial_raw = normalize_grid(payload["pieces"], width, height, source_file, "pieces")
    source_colors = sorted({value for row in correct_raw + initial_raw for value in row if value != 0})
    if not source_colors:
        raise ValueError(f"{source_file}: board has no occupied cells")
    color_map = {source_color: map_source_color(source_color, source_file) for source_color in source_colors}
    correct_grid = [[0 if value == 0 else color_map[value] for value in row] for row in correct_raw]
    initial_grid = [[0 if value == 0 else color_map[value] for value in row] for row in initial_raw]
    official_colors = sorted(set(color_map.values()))
    palette = {str(color_id): OFFICIAL_COLOR_HEX[color_id] for color_id in official_colors}
    filled_cell_count = sum(value != 0 for row in correct_grid for value in row)

    return {
        "levelId": level_id,
        "boardWidth": width,
        "boardHeight": height,
        "timeLimit": payload.get("time", 0),
        "slotTotalCount": 0,
        "hard": payload.get("difficulty", 0) == 1,
        "correctColorArr": correct_grid,
        "initRandomColorArr": initial_grid,
        "filledCellCount": filled_cell_count,
        "colorCount": len(official_colors),
        "levelName": f"原缓存第 {level_id} 关",
        "levelCategory": "extracted_pindadou_cache",
        "palette": palette,
        "sourceFields": {
            "sourceProject": "拼大豆",
            "sourceCacheVersion": remote_url.split("/client/", 1)[1].split("/", 1)[0],
            "sourceRemoteUrl": remote_url,
            "sourceCacheFile": source_file.name,
            "sourceEncoding": "Cocos JsonAsset baseLayer/pieces",
            "sourceTargetField": "baseLayer",
            "sourceInitialField": "pieces",
            "sourceColorIds": source_colors,
            "sourceColorMappings": [
                {
                    "sourceColorId": source_color,
                    "sourceHex": SOURCE_COLOR_HEX[source_color],
                    "officialColorId": color_map[source_color],
                    "officialHex": OFFICIAL_COLOR_HEX[color_map[source_color]],
                }
                for source_color in source_colors
            ],
            "sourceDifficulty": payload.get("difficulty"),
        },
    }


def load_levels(cache_root: Path, version: str) -> list[tuple[int, dict[str, Any]]]:
    levels: list[tuple[int, dict[str, Any]]] = []
    seen_ids: set[int] = set()
    for source_file, remote_url in read_level_cache_files(cache_root, version):
        try:
            level_id, payload = find_level_payload(json.loads(source_file.read_text(encoding="utf-8")), source_file)
        except ValueError as error:
            if "found 0" in str(error):
                continue
            raise
        if level_id in seen_ids:
            raise ValueError(f"duplicate source level ID {level_id}: {source_file}")
        seen_ids.add(level_id)
        levels.append((level_id, convert_level(level_id, payload, source_file, remote_url)))
    return sorted(levels, key=lambda item: item[0])


def write_levels(levels: list[tuple[int, dict[str, Any]]], output_dir: Path) -> None:
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"refusing to overwrite non-empty output directory: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    for level_id, level in levels:
        (output_dir / f"lv_{level_id:03d}.json").write_text(
            json.dumps(level, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
        )


def main() -> None:
    args = parse_args()
    levels = load_levels(args.cache_root, args.version)
    if args.check:
        print(f"validated {len(levels)} cached 拼大豆 levels from {args.cache_root} ({args.version})")
        return
    write_levels(levels, args.output)
    print(f"wrote {len(levels)} cached 拼大豆 levels to {args.output}")


if __name__ == "__main__":
    main()
