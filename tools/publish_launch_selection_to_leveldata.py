#!/usr/bin/env python3
"""Publish launch selection into assets/RemoteBundle/LevelData sequential slots."""

from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path
from typing import Dict, List


ROOT = Path(__file__).resolve().parents[1]
GUANKA_DIR = ROOT / "guanka"
LEVELDATA_DIR = ROOT / "assets" / "RemoteBundle" / "LevelData"
GENERATED_DIR = ROOT / "tools" / "generated_levels"

DEFAULT_SELECTIONS = {
    200: GENERATED_DIR / "launch_200_selection.json",
    300: GENERATED_DIR / "launch_300_selection.json",
    600: GENERATED_DIR / "launch_600_selection.json",
}

META_TEMPLATE = {
    "ver": "2.0.1",
    "importer": "json",
    "imported": True,
    "uuid": "",
    "files": [".json"],
    "subMetas": {},
    "userData": {},
}

ONLINE_KEYS = (
    "levelId",
    "boardWidth",
    "boardHeight",
    "timeLimit",
    "slotTotalCount",
    "correctColorArr",
    "initRandomColorArr",
)


def read_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=4)
        fh.write("\n")


def normalize_online_level(source: Dict[str, object], level_id: int) -> Dict[str, object]:
    normalized = {key: source[key] for key in ONLINE_KEYS}
    normalized["levelId"] = level_id
    return normalized


def iter_color_values(cells: object):
    if not isinstance(cells, list):
        return
    for item in cells:
        if isinstance(item, list):
            for nested in item:
                yield nested
            continue
        yield item


def color_count(source: Dict[str, object]) -> int:
    return len({int(color) for color in iter_color_values(source.get("correctColorArr")) if int(color) != 0})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish launch selection to assets/RemoteBundle/LevelData.")
    parser.add_argument("--count", type=int, choices=sorted(DEFAULT_SELECTIONS), default=300)
    parser.add_argument("--selection")
    parser.add_argument("--mapping-out")
    return parser.parse_args()


def pick_replacement(
    item: Dict[str, object],
    alternates: List[Dict[str, object]],
    used_source_ids: set[int],
) -> Dict[str, object]:
    stage_label = str(item.get("stageLabel", ""))
    target_score = float(item.get("targetScore", item.get("complexityScore", 0.0)))
    ranked: List[tuple[tuple[float, float, float, int], Dict[str, object]]] = []
    for alternate in alternates:
        level_id = int(alternate["levelId"])
        if level_id in used_source_ids:
            continue
        source_path = GUANKA_DIR / f"level_{level_id}.json"
        if not source_path.exists():
            continue
        source = read_json(source_path)
        if color_count(source) <= 1:
            continue
        recommended_stage = str(alternate.get("recommendedStage", ""))
        score_gap = abs(float(alternate.get("complexityScore", 0.0)) - target_score)
        ranked.append(
            (
                (
                    0.0 if recommended_stage.startswith(stage_label) else 1.0,
                    score_gap,
                    0.0 if alternate.get("isFeatured") else 1.0,
                    level_id,
                ),
                alternate,
            )
        )
    if not ranked:
        raise ValueError(f"No non-single-color replacement found for launchOrder={item['launchOrder']}")
    ranked.sort(key=lambda row: row[0])
    return ranked[0][1]


def ensure_meta(path: Path) -> None:
    if path.exists():
        return
    payload = dict(META_TEMPLATE)
    payload["uuid"] = str(uuid.uuid4())
    write_json(path, payload)


def main() -> None:
    args = parse_args()
    selection_path = (Path(args.selection) if args.selection else DEFAULT_SELECTIONS[args.count]).resolve()
    selection_payload = read_json(selection_path)
    selection: List[Dict[str, object]] = list(selection_payload["selection"])
    alternates: List[Dict[str, object]] = list(selection_payload.get("alternates", []))
    profile = dict(selection_payload.get("profile") or {})
    expected_count = int(profile.get("count") or args.count)
    if len(selection) != expected_count:
        raise ValueError(f"Expected {expected_count} selected levels, got {len(selection)}")

    published = []
    used_source_ids: set[int] = set()
    for item in selection:
        launch_order = int(item["launchOrder"])
        requested_source_level_id = int(item.get("sourceLevelId", item["levelId"]))
        source_level_id = requested_source_level_id
        source_path = GUANKA_DIR / f"level_{source_level_id}.json"
        if not source_path.exists():
            raise FileNotFoundError(f"Missing source level: {source_path}")
        source = read_json(source_path)
        replacement_reason = None
        if color_count(source) <= 1:
            replacement = pick_replacement(item, alternates, used_source_ids)
            source_level_id = int(replacement["levelId"])
            source_path = GUANKA_DIR / f"level_{source_level_id}.json"
            source = read_json(source_path)
            replacement_reason = "filtered_single_color"
        target_path = LEVELDATA_DIR / f"level_{launch_order}.json"
        target_meta = LEVELDATA_DIR / f"level_{launch_order}.json.meta"
        target_payload = normalize_online_level(source, launch_order)
        write_json(target_path, target_payload)
        ensure_meta(target_meta)
        used_source_ids.add(source_level_id)
        published.append(
            {
                "launchOrder": launch_order,
                "sourceLevelId": source_level_id,
                "requestedSourceLevelId": requested_source_level_id,
                "replacementReason": replacement_reason,
                "targetPath": str(target_path.relative_to(ROOT)),
            }
        )

    mapping_path = (Path(args.mapping_out) if args.mapping_out else GENERATED_DIR / f"launch_{expected_count}_publish_mapping.json").resolve()
    write_json(
        mapping_path,
        {
            "selectionPath": str(selection_path.relative_to(ROOT)),
            "targetDir": str(LEVELDATA_DIR.relative_to(ROOT)),
            "profile": {"count": expected_count, "title": profile.get("title")},
            "published": published,
        },
    )

    print(f"Published {len(published)} levels to {LEVELDATA_DIR}")
    print(f"Mapping written to {mapping_path}")


if __name__ == "__main__":
    main()
