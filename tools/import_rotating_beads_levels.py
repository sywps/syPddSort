#!/usr/bin/env python3
"""Convert rotating-beads Cocos JsonAssets into level-preview JSON files."""

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
# Exact source key/name/hex records from 旋转拼豆's LevelUtils.parseColorFromCode and IdToTypeMap.
# `officialColorId` is an explicit semantic correspondence, never a per-level generated sequence.
SOURCE_SYMBOLS = {
    "0": {"sourceName": "green", "sourceHex": "#29BE4B", "officialColorId": 11},
    "1": {"sourceName": "beige", "sourceHex": "#FFDBC9", "officialColorId": 5},
    "2": {"sourceName": "black", "sourceHex": "#000000", "officialColorId": 19},
    "3": {"sourceName": "blue", "sourceHex": "#2F21CB", "officialColorId": 7},
    "4": {"sourceName": "brise", "sourceHex": "#00FFF9", "officialColorId": 2},
    "5": {"sourceName": "brown_light", "sourceHex": "#571D1D", "officialColorId": 17},
    "6": {"sourceName": "brown", "sourceHex": "#B55318", "officialColorId": 16},
    "7": {"sourceName": "dark_blue", "sourceHex": "#2B2E66", "officialColorId": 18},
    "8": {"sourceName": "dark_green", "sourceHex": "#135B40", "officialColorId": 12},
    "9": {"sourceName": "green_light", "sourceHex": "#92EB30", "officialColorId": 9},
    "a": {"sourceName": "grey", "sourceHex": "#616161", "officialColorId": 19},
    "b": {"sourceName": "light_grey", "sourceHex": "#B3B3B3", "officialColorId": 15},
    "c": {"sourceName": "light_blue", "sourceHex": "#139ADC", "officialColorId": 13},
    "d": {"sourceName": "orange", "sourceHex": "#FF8D00", "officialColorId": 4},
    "e": {"sourceName": "pink_light", "sourceHex": "#FF98BA", "officialColorId": 14},
    "f": {"sourceName": "pink", "sourceHex": "#FF11C9", "officialColorId": 1},
    "g": {"sourceName": "red", "sourceHex": "#E42F2F", "officialColorId": 10},
    "h": {"sourceName": "violet", "sourceHex": "#8A19E0", "officialColorId": 8},
    "i": {"sourceName": "white", "sourceHex": "#FFFFFF", "officialColorId": 20},
    "j": {"sourceName": "yellow_light", "sourceHex": "#FFF29F", "officialColorId": 6},
    "k": {"sourceName": "yellow", "sourceHex": "#FFD000", "officialColorId": 3},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(r"C:\Users\EDY\workspaces\旋转拼豆\OUTPUT\subpackages\json\import"),
        help="Directory containing source Cocos JsonAsset files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tools/competitors/旋转拼豆/levels/main"),
        help="Empty target directory for preview JSON files.",
    )
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


def find_level_payload(document: Any, source_file: Path) -> tuple[int, dict[str, Any]]:
    candidates: list[tuple[int, dict[str, Any]]] = []
    for value in walk(document):
        if not isinstance(value, list):
            continue
        for index, item in enumerate(value[:-1]):
            match = LEVEL_NAME.fullmatch(item) if isinstance(item, str) else None
            payload = value[index + 1]
            if match and isinstance(payload, dict) and {"width", "height", "data"}.issubset(payload):
                candidates.append((int(match.group(1)), payload))
    if len(candidates) != 1:
        raise ValueError(f"{source_file}: expected one level payload, found {len(candidates)}")
    return candidates[0]


def map_source_symbol(symbol: str, source_file: Path) -> int:
    source_color = SOURCE_SYMBOLS.get(symbol)
    if source_color is None:
        raise ValueError(f"{source_file}: no fixed official-color mapping for source symbol {symbol!r}")
    return int(source_color["officialColorId"])


def convert_level(level_id: int, payload: dict[str, Any], source_file: Path) -> dict[str, Any]:
    declared_width = payload["width"]
    declared_height = payload["height"]
    encoded_grid = payload["data"]
    if not isinstance(declared_width, int) or declared_width <= 0:
        raise ValueError(f"{source_file}: invalid declared width {declared_width!r}")
    if not isinstance(declared_height, int) or declared_height <= 0:
        raise ValueError(f"{source_file}: invalid declared height {declared_height!r}")
    if not isinstance(encoded_grid, str):
        raise ValueError(f"{source_file}: grid data must be a string")

    rows = encoded_grid.splitlines()
    if not rows:
        raise ValueError(f"{source_file}: grid has no rows")
    grid_width = max(len(row) for row in rows)
    if grid_width == 0:
        raise ValueError(f"{source_file}: grid has no columns")
    if any(len(row) != grid_width for row in rows):
        rows = [row.ljust(grid_width) for row in rows]

    symbols = sorted({cell for row in rows for cell in row if not cell.isspace()})
    if not symbols:
        raise ValueError(f"{source_file}: grid has no filled cells")
    color_by_symbol = {symbol: map_source_symbol(symbol, source_file) for symbol in symbols}
    correct_grid = [
        [0 if cell.isspace() else color_by_symbol[cell] for cell in row]
        for row in rows
    ]
    official_colors = sorted(set(color_by_symbol.values()))
    palette = {
        str(color_id): OFFICIAL_COLOR_HEX[color_id]
        for color_id in official_colors
    }
    filled_cell_count = sum(cell != 0 for row in correct_grid for cell in row)

    return {
        "levelId": level_id,
        "boardWidth": grid_width,
        "boardHeight": len(rows),
        "timeLimit": 0,
        "slotTotalCount": 0,
        "correctColorArr": correct_grid,
        "initRandomColorArr": correct_grid,
        "filledCellCount": filled_cell_count,
        "colorCount": len(official_colors),
        "displacementRatio": 0.0,
        "levelName": f"原包第 {level_id} 关",
        "levelCategory": "extracted_rotating_beads",
        "palette": palette,
        "sourceFields": {
            "sourceProject": "旋转拼豆",
            "sourceFile": source_file.name,
            "sourceEncoding": "Cocos JsonAsset character grid",
            "sourceSymbols": symbols,
            "sourceColorMappings": [
                {
                    "sourceSymbol": symbol,
                    "sourceName": SOURCE_SYMBOLS[symbol]["sourceName"],
                    "sourceHex": SOURCE_SYMBOLS[symbol]["sourceHex"],
                    "officialColorId": color_by_symbol[symbol],
                    "officialHex": OFFICIAL_COLOR_HEX[color_by_symbol[symbol]],
                }
                for symbol in symbols
            ],
            "sourceGameplay": "rotation_puzzle",
            "sourceDeclaredWidth": declared_width,
            "sourceDeclaredHeight": declared_height,
            "sourceTimeLimit": None,
            "sourceSlotTotalCount": None,
        },
    }


def load_levels(source_dir: Path) -> list[tuple[int, dict[str, Any]]]:
    if not source_dir.is_dir():
        raise FileNotFoundError(f"source directory does not exist: {source_dir}")

    levels: list[tuple[int, dict[str, Any]]] = []
    seen_ids: set[int] = set()
    for source_file in sorted(source_dir.rglob("*.json")):
        document = json.loads(source_file.read_text(encoding="utf-8"))
        try:
            level_id, payload = find_level_payload(document, source_file)
        except ValueError as error:
            if "found 0" in str(error):
                continue
            raise
        if level_id in seen_ids:
            raise ValueError(f"duplicate source level id {level_id}: {source_file}")
        seen_ids.add(level_id)
        levels.append((level_id, convert_level(level_id, payload, source_file)))
    if not levels:
        raise ValueError(f"no Cocos level payloads found below {source_dir}")
    return sorted(levels, key=lambda item: item[0])


def write_levels(levels: list[tuple[int, dict[str, Any]]], output_dir: Path) -> None:
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"refusing to overwrite non-empty output directory: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    for level_id, level in levels:
        output_file = output_dir / f"lv_{level_id:03d}.json"
        output_file.write_text(json.dumps(level, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    levels = load_levels(args.source)
    if args.check:
        print(f"validated {len(levels)} levels from {args.source}")
        return
    write_levels(levels, args.output)
    print(f"wrote {len(levels)} levels to {args.output}")


if __name__ == "__main__":
    main()
