#!/usr/bin/env python3
"""Generate five butterfly levels with distinct visual styles."""

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
    {"level_id": 100012, "animal": "butterfly", "style": "monarch", "width": 29, "height": 23, "colors": 7, "seed": 20260511},
    {"level_id": 100013, "animal": "butterfly", "style": "pastel", "width": 31, "height": 24, "colors": 8, "seed": 20260512},
    {"level_id": 100014, "animal": "butterfly", "style": "jewel", "width": 29, "height": 24, "colors": 8, "seed": 20260513},
    {"level_id": 100015, "animal": "butterfly", "style": "sunset", "width": 30, "height": 23, "colors": 8, "seed": 20260514},
    {"level_id": 100016, "animal": "butterfly", "style": "garden", "width": 31, "height": 25, "colors": 8, "seed": 20260515},
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

    summary: List[Dict[str, object]] = []
    for spec in LEVEL_SPECS:
        level_id = int(spec["level_id"])
        animal = str(spec["animal"])
        style = str(spec["style"])
        seed = int(spec["seed"])

        target_payload = generate_target_payload(
            width=int(spec["width"]),
            height=int(spec["height"]),
            animal=animal,
            color_count=int(spec["colors"]),
            seed=seed,
            level_id=level_id,
            style=style,
        )
        chosen = choose_best_init(
            correct=target_payload["correctColorArr"],
            base_seed=seed + 97,
            attempts=16,
            min_groups_per_color=2,
            max_groups_per_color=4,
            target_displacement=0.90,
            min_displacement=0.80,
            max_displacement=0.96,
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
            "style": style,
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
                "style": style,
                "size": f"{level_payload['boardWidth']}x{level_payload['boardHeight']}",
                "colors": level_payload["colorCount"],
                "filled": level_payload["filledCellCount"],
                "ratio": level_payload["displacementRatio"],
            }
        )

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
