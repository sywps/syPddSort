#!/usr/bin/env python3
"""Set initialSlotUnlockedRows on selected LevelData JSON files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Set initialSlotUnlockedRows on level JSON files.")
    parser.add_argument("--dir", default="assets/RemoteBundle/LevelData")
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("levels", nargs="+", type=int)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    level_dir = Path(args.dir)
    for level_id in args.levels:
        path = level_dir / f"level_{level_id}.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload["initialSlotUnlockedRows"] = int(args.rows)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
        print(f"updated {path} initialSlotUnlockedRows={args.rows}")


if __name__ == "__main__":
    main()
