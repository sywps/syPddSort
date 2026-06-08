#!/usr/bin/env python3
"""Convert hacked-level-1/ levels (MonoBehaviour format) to game format in guanka/.

Reads DL_*.json and Saga_*.json files, extracts target grid from _layout,
remaps colors to 1..N, writes to guanka/, then runs generate_initial_shuffle.py
to produce initRandomColorArr.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = ROOT / "hacked-level-1"
OUTPUT_DIR = ROOT / "guanka"
SHUFFLE_SCRIPT = ROOT / "tools" / "generate_initial_shuffle.py"

OUTPUT_DIR.mkdir(exist_ok=True)


START_LEVEL_ID = 245


def parse_monologue(filepath: Path) -> dict | None:
    """Parse a MonoBehaviour-format level file, return {correctColorArr, ...} (no levelId)."""
    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    if "MonoBehaviour" not in data:
        return None

    mb = data["MonoBehaviour"]
    refs = mb.get("references", {})
    ref_ids = refs.get("RefIds", [])
    if not ref_ids:
        return None

    board_data = ref_ids[0]["data"]
    layout = board_data["_layout"]
    size = board_data["_layoutSize"]
    w, h = size["x"], size["y"]

    # Build target grid from non-zero blockType + non-zero color items
    grid = [[0] * w for _ in range(h)]
    for item in layout:
        if item["_blockType"] != 0 and item["_color"] != 0:
            x, y = item["_position"]["x"], item["_position"]["y"]
            if 0 <= y < h and 0 <= x < w:
                grid[y][x] = item["_color"]

    # Collect unique non-zero colors and remap to 1..N
    color_set = set()
    for row in grid:
        for v in row:
            if v != 0:
                color_set.add(v)

    sorted_colors = sorted(color_set)
    remap = {v: idx + 1 for idx, v in enumerate(sorted_colors)}

    correct = [[remap.get(v, 0) for v in row] for row in grid]

    # Count filled cells
    slot_count = sum(1 for row in correct for v in row if v != 0)

    return {
        "boardWidth": w,
        "boardHeight": h,
        "timeLimit": max(120, min(300, int(slot_count * 0.55))),
        "slotTotalCount": slot_count,
        "correctColorArr": correct,
    }


def main():
    files = sorted(INPUT_DIR.glob("*.json"))
    files = [f for f in files if not f.name.endswith(".meta")]

    # Assign sequential IDs starting from START_LEVEL_ID
    level_id = START_LEVEL_ID
    converted = 0
    skipped = 0

    for filepath in files:
        result = parse_monologue(filepath)
        if result is None:
            skipped += 1
            continue

        result["levelId"] = level_id

        out_path = OUTPUT_DIR / f"level_{level_id}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
            f.write("\n")
        level_id += 1
        converted += 1

    print(f"Converted {converted} levels (IDs {START_LEVEL_ID}-{level_id - 1}), skipped {skipped}")

    # Now run generate_initial_shuffle.py on the newly converted files
    print("Generating initial shuffles...")
    shuffled = 0
    errors = 0
    for lid in range(START_LEVEL_ID, level_id):
        fpath = OUTPUT_DIR / f"level_{lid}.json"
        if not fpath.exists():
            continue
        try:
            subprocess.run(
                [sys.executable, str(SHUFFLE_SCRIPT), str(fpath), "--output", str(fpath)],
                check=True,
                capture_output=True,
                text=True,
            )
            shuffled += 1
        except subprocess.CalledProcessError as e:
            errors += 1
            print(f"  ERROR shuffling level_{lid}.json: {e.stderr[:200]}")

    print(f"Generated shuffles for {shuffled} levels, {errors} errors")


if __name__ == "__main__":
    main()
