#!/usr/bin/env python3
"""Sync `online` flags in guanka JSONs to match a launch selection."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, Iterable, List, Set


ROOT = Path(__file__).resolve().parents[1]
GUANKA_DIR = ROOT / "guanka"
GENERATED_DIR = ROOT / "tools" / "generated_levels"

DEFAULT_SELECTIONS = {
    200: GENERATED_DIR / "launch_200_selection.json",
    300: GENERATED_DIR / "launch_300_selection.json",
    600: GENERATED_DIR / "launch_600_selection.json",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync guanka online flags to a launch selection.")
    parser.add_argument("--count", type=int, choices=sorted(DEFAULT_SELECTIONS), default=300)
    parser.add_argument("--selection")
    parser.add_argument("--input-dir", default=str(GUANKA_DIR))
    return parser.parse_args()


def read_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, payload: object) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def iter_level_files(input_dir: Path) -> Iterable[Path]:
    return sorted(
        input_dir.glob("level_*.json"),
        key=lambda path: int(path.stem.split("_")[1]),
    )


def extract_selected_ids(payload: Dict[str, object]) -> Set[int]:
    selected_ids: Set[int] = set()
    for item in payload.get("selection", []):
        row = dict(item)
        selected_ids.add(int(row.get("sourceLevelId", row["levelId"])))
    return selected_ids


def sync_selection_payload(payload: Dict[str, object], selected_ids: Set[int]) -> bool:
    changed = False
    for key in ("selection", "alternates"):
        rows = payload.get(key)
        if not isinstance(rows, list):
            continue
        for item in rows:
            if not isinstance(item, dict):
                continue
            source_level_id = int(item.get("sourceLevelId", item["levelId"]))
            desired = source_level_id in selected_ids
            if item.get("online") is not desired:
                item["online"] = desired
                changed = True
    return changed


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir)
    selection_path = (Path(args.selection) if args.selection else DEFAULT_SELECTIONS[args.count]).resolve()

    payload = read_json(selection_path)
    if not isinstance(payload, dict):
        raise ValueError(f"Unexpected selection payload in {selection_path}")
    selected_ids = extract_selected_ids(payload)
    if not selected_ids:
        raise ValueError(f"No selected levels found in {selection_path}")

    changed_true = 0
    changed_false = 0
    untouched = 0
    total = 0

    for path in iter_level_files(input_dir):
        total += 1
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        level_id = int(data.get("levelId", path.stem.split("_")[1]))
        desired = level_id in selected_ids
        current = data.get("online") is True
        if current == desired:
            untouched += 1
            continue
        data["online"] = desired
        write_json(path, data)
        if desired:
            changed_true += 1
        else:
            changed_false += 1

    payload_changed = sync_selection_payload(payload, selected_ids)
    if payload_changed:
        write_json(selection_path, payload)

    print(
        json.dumps(
            {
                "selectionPath": str(selection_path.relative_to(ROOT)),
                "selectedOnlineCount": len(selected_ids),
                "guankaTotal": total,
                "changedTrue": changed_true,
                "changedFalse": changed_false,
                "untouched": untouched,
                "selectionPayloadUpdated": payload_changed,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
