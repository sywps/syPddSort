#!/usr/bin/env python3
"""Apply the verified DBT bean-count timer rule to live mainline levels."""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEVEL_DIR = ROOT / "assets" / "LevelData"
MANIFEST_PATH = LEVEL_DIR / "level-manifest.json"
DEFAULT_REPORT = ROOT / "tools" / "generated_levels" / "dbt_time_rule_level_5_300_report.json"
TIME_PATTERN = re.compile(r'"timeLimit":\s*\d+')
AUTHORED_OVERRIDES = {5: 120, 6: 120, 9: 120, 10: 120, 14: 150}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=int, default=5)
    parser.add_argument("--end", type=int, default=300)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    return parser.parse_args()


def dbt_time_limit(filled: int) -> int:
    if filled <= 0:
        raise ValueError(f"filled bean count must be positive, got {filled}")
    return min(150, math.ceil(filled / 200) * 30)


def replace_time_limit(path: Path, old_time: int, new_time: int) -> None:
    original = path.read_text(encoding="utf-8")
    matches = TIME_PATTERN.findall(original)
    if len(matches) != 1:
        raise ValueError(f"{path} expected one timeLimit field, got {len(matches)}")
    expected = re.compile(rf'"timeLimit":\s*{old_time}(?=\D)')
    updated, count = expected.subn(f'"timeLimit":{new_time}', original, count=1)
    if count != 1:
        raise ValueError(f"{path} timeLimit text does not match parsed value {old_time}")
    path.write_text(updated, encoding="utf-8")


def main() -> None:
    args = parse_args()
    if args.start < 1 or args.end < args.start:
        raise ValueError(f"invalid range {args.start}-{args.end}")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entries = {int(entry["levelId"]): entry for entry in manifest["entries"]}
    expected_ids = list(range(args.start, args.end + 1))
    missing_entries = [level_id for level_id in expected_ids if level_id not in entries]
    if missing_entries:
        raise ValueError(f"manifest missing levels: {missing_entries[:10]}")

    changes = []
    for level_id in expected_ids:
        path = LEVEL_DIR / f"level_{level_id}.json"
        if not path.exists():
            raise FileNotFoundError(path)
        level = json.loads(path.read_text(encoding="utf-8"))
        if int(level["levelId"]) != level_id:
            raise ValueError(f"{path} internal levelId mismatch")
        filled = int(level["slotTotalCount"])
        old_time = int(level["timeLimit"])
        manifest_time = int(entries[level_id]["timeLimit"])
        if manifest_time != old_time:
            raise ValueError(f"level {level_id} manifest time {manifest_time} != JSON time {old_time}")
        new_time = AUTHORED_OVERRIDES.get(level_id, dbt_time_limit(filled))
        changes.append({
            "levelId": level_id,
            "filled": filled,
            "oldTimeLimit": old_time,
            "newTimeLimit": new_time,
            "changed": old_time != new_time,
            "belowVerifiedProductionRange": filled < 420,
        })

    changed = [item for item in changes if item["changed"]]
    if args.write:
        for item in changed:
            path = LEVEL_DIR / f"level_{item['levelId']}.json"
            replace_time_limit(path, item["oldTimeLimit"], item["newTimeLimit"])
        for item in changes:
            entries[item["levelId"]]["timeLimit"] = item["newTimeLimit"]
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report = {
        "methodVersion": 1,
        "formula": "min(150, ceil(slotTotalCount / 200) * 30)",
        "authoredOverrides": AUTHORED_OVERRIDES,
        "range": [args.start, args.end],
        "writeMode": bool(args.write),
        "count": len(changes),
        "changedCount": len(changed),
        "unchangedCount": len(changes) - len(changed),
        "newTimeCounts": dict(sorted(Counter(item["newTimeLimit"] for item in changes).items())),
        "belowVerifiedProductionRange": [item for item in changes if item["belowVerifiedProductionRange"]],
        "levels": changes,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in (
        "formula", "range", "writeMode", "count", "changedCount", "unchangedCount", "newTimeCounts",
    )}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
