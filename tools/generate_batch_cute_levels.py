#!/usr/bin/env python3
"""Generate a batch of cute animal levels and Cocos meta files."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Dict, List

from generate_cute_target import generate_target_payload
from generate_initial_shuffle import build_updated_payload, choose_best_init
from move_target_to_initial import build_move_map

ROOT = Path(__file__).resolve().parent.parent
LEVEL_DIR = ROOT / "assets" / "RemoteBundle" / "LevelData"
DEBUG_DIR = ROOT / "tools" / "generated_levels"


LEVEL_SPECS: List[Dict[str, int | str]] = [
    {"level_id": 100002, "animal": "bear", "width": 27, "height": 23, "colors": 9, "seed": 20260423},
    {"level_id": 100003, "animal": "bunny", "width": 28, "height": 24, "colors": 9, "seed": 20260424},
    {"level_id": 100004, "animal": "fox", "width": 29, "height": 23, "colors": 10, "seed": 20260425},
    {"level_id": 100005, "animal": "panda", "width": 27, "height": 24, "colors": 8, "seed": 20260426},
    {"level_id": 100006, "animal": "chick", "width": 25, "height": 22, "colors": 8, "seed": 20260427},
    {"level_id": 100007, "animal": "puppy", "width": 28, "height": 23, "colors": 10, "seed": 20260428},
    {"level_id": 100008, "animal": "piglet", "width": 27, "height": 23, "colors": 9, "seed": 20260429},
    {"level_id": 100009, "animal": "koala", "width": 27, "height": 24, "colors": 9, "seed": 20260430},
    {"level_id": 100010, "animal": "raccoon", "width": 28, "height": 23, "colors": 10, "seed": 20260501},
    {"level_id": 100011, "animal": "penguin", "width": 25, "height": 25, "colors": 8, "seed": 20260519},
]


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_meta(path: Path) -> None:
    meta_path = Path(str(path) + ".meta")
    if meta_path.exists():
        return
    payload = {
        "ver": "2.0.1",
        "importer": "json",
        "imported": True,
        "uuid": str(uuid.uuid4()),
        "files": [".json"],
        "subMetas": {},
        "userData": {},
    }
    meta_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    LEVEL_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    summary = []
    for spec in LEVEL_SPECS:
        level_id = int(spec["level_id"])
        animal = str(spec["animal"])
        seed = int(spec["seed"])
        target_payload = generate_target_payload(
            width=int(spec["width"]),
            height=int(spec["height"]),
            animal=animal,
            color_count=int(spec["colors"]),
            seed=seed,
            level_id=level_id,
        )
        chosen = choose_best_init(
            correct=target_payload["correctColorArr"],
            base_seed=seed + 97,
            attempts=16,
            min_groups_per_color=2,
            max_groups_per_color=4,
            target_displacement=0.88,
            min_displacement=0.78,
            max_displacement=0.95,
        )
        level_payload = build_updated_payload(
            target_payload,
            chosen["init_grid"],
            float(chosen["displacement_ratio"]),
            int(chosen["seed"]),
            chosen_group_count=int(chosen["group_count"]),
        )
        move_payload = {
            "levelId": level_id,
            "animal": animal,
            "moveCount": level_payload["filledCellCount"],
            "displacementRatio": level_payload["displacementRatio"],
            "moveMap": build_move_map(target_payload["correctColorArr"], chosen["init_grid"]),
        }

        level_path = LEVEL_DIR / f"level_{level_id}.json"
        target_path = DEBUG_DIR / f"level_{level_id}_target.json"
        moves_path = DEBUG_DIR / f"level_{level_id}_moves.json"

        write_json(level_path, level_payload)
        write_json(target_path, target_payload)
        write_json(moves_path, move_payload)
        write_meta(level_path)

        summary.append(
            {
                "levelId": level_id,
                "animal": animal,
                "size": f"{level_payload['boardWidth']}x{level_payload['boardHeight']}",
                "colors": level_payload["colorCount"],
                "filled": level_payload["filledCellCount"],
                "ratio": level_payload["displacementRatio"],
            }
        )

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
