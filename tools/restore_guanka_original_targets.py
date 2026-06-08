#!/usr/bin/env python3
"""Restore guanka target colors/shapes from the original source datasets."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from statistics import mean
from typing import Dict, Iterable, List, Tuple

from generate_cute_target import count_colors
from move_target_to_initial import assign_initial_layout, displacement_ratio

Grid = List[List[int]]

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GUANKA_DIR = ROOT / "guanka"
DEFAULT_PDD_RAW = ROOT / "tools" / "pdd-levels-raw.json"
DEFAULT_MAKEBEAD_BUNDLE = ROOT / "tools" / "downloaded" / "makebead_templates_bundle.json"
DEFAULT_MAKEBEAD_IMAGE_DIR = ROOT / "tools" / "downloaded"
DEFAULT_RUNTIME_DIR = ROOT / "assets" / "LevelData"
DEFAULT_REPORT = ROOT / "tools" / "generated_levels" / "restore_guanka_original_report.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Restore guanka level targets from the original source datasets."
    )
    parser.add_argument("--guanka-dir", default=str(DEFAULT_GUANKA_DIR))
    parser.add_argument("--runtime-dir", default=str(DEFAULT_RUNTIME_DIR))
    parser.add_argument("--pdd-raw", default=str(DEFAULT_PDD_RAW))
    parser.add_argument("--makebead-bundle", default=str(DEFAULT_MAKEBEAD_BUNDLE))
    parser.add_argument("--makebead-image-dir", default=str(DEFAULT_MAKEBEAD_IMAGE_DIR))
    parser.add_argument(
        "--makebead-temp-dir",
        default=str(ROOT / "tools" / "generated_levels" / "_restore_makebead_temp"),
    )
    parser.add_argument(
        "--backup-dir",
        default=str(ROOT / "guanka.restore_backup_20260428"),
        help="Directory used to store a full backup of the current guanka state.",
    )
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--skip-backup", action="store_true")
    return parser.parse_args()


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def remap_sorted_colors(grid: Grid) -> Grid:
    colors = sorted({value for row in grid for value in row if value != 0})
    remap = {value: index + 1 for index, value in enumerate(colors)}
    return [[remap.get(value, 0) for value in row] for row in grid]


def build_hacked_level_payload(level_id: int) -> Dict[str, object]:
    path = ROOT / "hacked-level" / f"level_{level_id}.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    correct = remap_sorted_colors(raw["target_grid"])
    init_grid = remap_sorted_colors(raw["shuffle_grid"])
    return {
        "levelId": level_id,
        "correctColorArr": correct,
        "initRandomColorArr": init_grid,
        "initShuffleSeed": None,
        "displacementRatio": round(displacement_ratio(correct, init_grid), 4),
    }


def convert_pdd_entry(entry: Dict[str, object], level_id: int) -> Dict[str, object]:
    payload = entry["json"]
    if payload and isinstance(payload, dict) and isinstance(payload.get("data"), str):
        lines = payload["data"].split("\n")
        rows = len(lines)
        cols = max(len(line) for line in lines)
        chars = sorted({ch for line in lines for ch in line if ch != " "})
        remap = {ch: index + 1 for index, ch in enumerate(chars)}
        correct = [
            [
                0
                if col >= len(lines[row]) or lines[row][col] == " "
                else remap[lines[row][col]]
                for col in range(cols)
            ]
            for row in range(rows)
        ]
    elif payload and isinstance(payload, dict) and payload.get("MonoBehaviour"):
        board = payload["MonoBehaviour"].get("references", {}).get("RefIds", [{}])[0].get("data")
        if not board or "_layout" not in board:
            raise ValueError(f"Unsupported MonoBehaviour payload for level {level_id}")
        width = board["_layoutSize"]["x"]
        height = board["_layoutSize"]["y"]
        correct = [[0] * width for _ in range(height)]
        for block in board["_layout"]:
            x = block["_position"]["x"]
            y = block["_position"]["y"]
            color = block["_color"]
            if 0 <= x < width and 0 <= y < height:
                correct[y][x] = color
    else:
        raise ValueError(f"Unsupported pdd payload format for level {level_id}")

    seed = 20260423 + level_id * 7919
    init_grid = assign_initial_layout(correct, seed=seed, max_groups_per_color=4)
    return {
        "levelId": level_id,
        "correctColorArr": correct,
        "initRandomColorArr": init_grid,
        "initShuffleSeed": seed,
        "displacementRatio": round(displacement_ratio(correct, init_grid), 4),
    }


def load_pdd_payloads(raw_path: Path) -> Dict[int, Dict[str, object]]:
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    payloads: Dict[int, Dict[str, object]] = {}
    for index, entry in enumerate(raw):
        level_id = 245 + index
        payloads[level_id] = convert_pdd_entry(entry, level_id)
    return payloads


def build_makebead_payloads(
    bundle_path: Path,
    image_dir: Path,
    temp_dir: Path,
) -> Dict[int, Dict[str, object]]:
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "tools" / "import_makebead_templates.py"),
            "--bundle",
            str(bundle_path),
            "--image-dir",
            str(image_dir),
            "--output-dir",
            str(temp_dir),
            "--start-level",
            "10001",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payloads: Dict[int, Dict[str, object]] = {}
    for path in sorted(temp_dir.glob("level_*.json"), key=lambda item: int(item.stem.split("_")[1])):
        payload = json.loads(path.read_text(encoding="utf-8"))
        payloads[int(payload["levelId"])] = payload
    return payloads


def load_runtime_payloads(runtime_dir: Path) -> Dict[int, Dict[str, object]]:
    payloads: Dict[int, Dict[str, object]] = {}
    for level_id in range(100001, 100018):
        path = runtime_dir / f"level_{level_id}.json"
        payloads[level_id] = json.loads(path.read_text(encoding="utf-8"))
    return payloads


def source_payload_for(
    level_id: int,
    pdd_payloads: Dict[int, Dict[str, object]],
    makebead_payloads: Dict[int, Dict[str, object]],
    runtime_payloads: Dict[int, Dict[str, object]],
) -> Dict[str, object]:
    if 1 <= level_id <= 244:
        return build_hacked_level_payload(level_id)
    if 245 <= level_id <= 2381:
        return pdd_payloads[level_id]
    if 10001 <= level_id <= 10073:
        return makebead_payloads[level_id]
    if 100001 <= level_id <= 100017:
        return runtime_payloads[level_id]
    raise KeyError(f"No original source mapping for level_{level_id}")


def filled_count(grid: Grid) -> int:
    return sum(1 for row in grid for value in row if value > 0)


def shape_change_cells(before: Grid, after: Grid) -> int:
    changed = 0
    for row in range(len(before)):
        for col in range(len(before[0])):
            if (before[row][col] > 0) != (after[row][col] > 0):
                changed += 1
    return changed


def color_change_cells(before: Grid, after: Grid) -> int:
    changed = 0
    for row in range(len(before)):
        for col in range(len(before[0])):
            if before[row][col] > 0 and after[row][col] > 0 and before[row][col] != after[row][col]:
                changed += 1
    return changed


def restore_level_payload(current: Dict[str, object], source: Dict[str, object]) -> Dict[str, object]:
    restored = dict(current)
    correct = source["correctColorArr"]
    init_grid = source["initRandomColorArr"]
    restored["correctColorArr"] = correct
    restored["initRandomColorArr"] = init_grid
    restored["boardWidth"] = len(correct[0])
    restored["boardHeight"] = len(correct)
    restored["slotTotalCount"] = filled_count(correct)
    restored["filledCellCount"] = filled_count(correct)
    restored["colorStats"] = count_colors(correct)
    restored["colorCount"] = len(restored["colorStats"])
    restored["displacementRatio"] = round(displacement_ratio(correct, init_grid), 4)

    init_seed = source.get("initShuffleSeed")
    if init_seed is None:
        restored.pop("initShuffleSeed", None)
    else:
        restored["initShuffleSeed"] = init_seed

    for key in (
        "minStepCount",
        "minStepSolver",
        "minStepSlotCapacity",
        "defaultUnlockedSlotRows",
    ):
        restored.pop(key, None)
    return restored


def backup_dir(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def main() -> None:
    args = parse_args()
    guanka_dir = Path(args.guanka_dir)
    runtime_dir = Path(args.runtime_dir)
    pdd_raw = Path(args.pdd_raw)
    makebead_bundle = Path(args.makebead_bundle)
    makebead_image_dir = Path(args.makebead_image_dir)
    makebead_temp_dir = Path(args.makebead_temp_dir)
    backup_path = Path(args.backup_dir)
    report_path = Path(args.report)

    if not args.skip_backup:
        backup_dir(guanka_dir, backup_path)

    pdd_payloads = load_pdd_payloads(pdd_raw)
    makebead_payloads = build_makebead_payloads(makebead_bundle, makebead_image_dir, makebead_temp_dir)
    runtime_payloads = load_runtime_payloads(runtime_dir)

    rows: List[Dict[str, object]] = []
    shape_changes: List[int] = []
    color_changes: List[int] = []

    level_paths = sorted(
        [path for path in guanka_dir.glob("level_*.json") if not path.name.endswith(".meta")],
        key=lambda item: int(item.stem.split("_")[1]),
    )
    for path in level_paths:
        level_id = int(path.stem.split("_")[1])
        current = json.loads(path.read_text(encoding="utf-8"))
        source = source_payload_for(level_id, pdd_payloads, makebead_payloads, runtime_payloads)
        restored = restore_level_payload(current, source)
        write_json(path, restored)

        shape_cells = shape_change_cells(current["correctColorArr"], restored["correctColorArr"])
        color_cells = color_change_cells(current["correctColorArr"], restored["correctColorArr"])
        shape_changes.append(shape_cells)
        color_changes.append(color_cells)
        rows.append(
            {
                "levelId": level_id,
                "path": str(path.resolve().relative_to(ROOT.resolve())),
                "shapeChangedCells": shape_cells,
                "colorChangedCells": color_cells,
                "filledCellCount": restored["filledCellCount"],
                "colorCount": restored["colorCount"],
                "displacementRatio": restored["displacementRatio"],
            }
        )

    report = {
        "guankaDir": str(guanka_dir),
        "backupDir": None if args.skip_backup else str(backup_path),
        "processed": len(rows),
        "clearedMinStepFields": True,
        "averageShapeChangedCells": round(mean(shape_changes), 4) if shape_changes else 0.0,
        "averageColorChangedCells": round(mean(color_changes), 4) if color_changes else 0.0,
        "levels": rows,
    }
    write_json(report_path, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
