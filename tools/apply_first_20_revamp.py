#!/usr/bin/env python3
"""Apply the approved first-20 timer edits and level 16/17 relief swap."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEVEL_DIR = ROOT / "assets" / "LevelData"
CANDIDATE_DIR = ROOT / "tools" / "latest-minigame-selected-300"
MANIFEST_PATH = LEVEL_DIR / "level-manifest.json"
REPORT_PATH = ROOT / "tools" / "generated_levels" / "first_20_revamp_report.json"
TIME_OVERRIDES = {3: 150, 4: 150, 6: 120, 9: 120, 10: 120, 14: 150, 16: 120, 17: 150}
SWAP = {16: 17, 17: 16}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    return parser.parse_args()


def replace_single(raw: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, raw, count=1)
    if count != 1:
        raise ValueError(f"expected one {label}, got {count}")
    return updated


def manifest_fields(level: dict) -> dict:
    colors = sorted({value for row in level["correctColorArr"] for value in row if value > 0})
    return {
        "boardWidth": int(level["boardWidth"]),
        "boardHeight": int(level["boardHeight"]),
        "colorIds": colors,
        "colorCount": len(colors),
        "slotTotalCount": int(level["slotTotalCount"]),
        "conveyorCapacity": int(level["conveyorCapacity"]),
        "timeLimit": int(level["timeLimit"]),
    }


def main() -> None:
    args = parse_args()
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entries = {int(entry["levelId"]): entry for entry in manifest["entries"]}
    before = {}
    output_raw = {}

    for level_id in sorted(set(TIME_OVERRIDES) | set(SWAP)):
        path = LEVEL_DIR / f"level_{level_id}.json"
        raw = path.read_text(encoding="utf-8")
        level = json.loads(raw)
        if int(level["levelId"]) != level_id:
            raise ValueError(f"{path} internal levelId mismatch")
        before[level_id] = manifest_fields(level)
        output_raw[level_id] = raw

    for target_id, source_id in SWAP.items():
        source_raw = (CANDIDATE_DIR / f"level_{source_id}.json").read_text(encoding="utf-8")
        output_raw[target_id] = replace_single(
            source_raw, rf'"levelId":\s*{source_id}(?=\D)', f'"levelId":{target_id}', f"level {source_id} levelId"
        )

    for level_id, new_time in TIME_OVERRIDES.items():
        current_time = int(json.loads(output_raw[level_id])["timeLimit"])
        output_raw[level_id] = replace_single(
            output_raw[level_id], rf'"timeLimit":\s*{current_time}(?=\D)', f'"timeLimit":{new_time}', f"level {level_id} timeLimit"
        )

    after = {level_id: manifest_fields(json.loads(raw)) for level_id, raw in output_raw.items()}
    if args.write:
        for level_id, raw in output_raw.items():
            (LEVEL_DIR / f"level_{level_id}.json").write_text(raw, encoding="utf-8")
            entries[level_id].update(after[level_id])
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report = {
        "methodVersion": 1,
        "writeMode": bool(args.write),
        "timerOverrides": TIME_OVERRIDES,
        "contentSourceByLevel": {str(level_id): source_id for level_id, source_id in SWAP.items()},
        "before": before,
        "after": after,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
