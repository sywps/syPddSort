#!/usr/bin/env python3
"""Publish the isolated selected ZT 6-205 corpus into active LevelData."""

from __future__ import annotations

import hashlib
import json
import shutil
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tools" / "online-levels-2026-08-01-zt-selected-200"
TARGET_DIR = ROOT / "assets" / "LevelData"
BACKUP_ROOT = ROOT / "tools" / "backups"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_level(path: Path, expected_id: int) -> None:
    level = load_json(path)
    if int(level.get("levelId", 0)) != expected_id:
        raise ValueError(f"{path}: internal levelId mismatch")
    if level.get("Hard") != 0 or level.get("conveyorCapacity") != 60:
        raise ValueError(f"{path}: runtime schema mismatch")
    if "slotPolicy" in level or "initialSlotUnlockedRows" in level:
        raise ValueError(f"{path}: retired slot schema remains")
    target = level.get("correctColorArr")
    initial = level.get("initRandomColorArr")
    height = int(level.get("boardHeight", 0))
    width = int(level.get("boardWidth", 0))
    if not isinstance(target, list) or not isinstance(initial, list) or len(target) != height or len(initial) != height:
        raise ValueError(f"{path}: invalid board height")
    if any(not isinstance(row, list) or len(row) != width for row in target + initial):
        raise ValueError(f"{path}: invalid board width")
    target_inventory = Counter(value for row in target for value in row if value > 0)
    initial_inventory = Counter(value for row in initial for value in row if value > 0)
    if target_inventory != initial_inventory:
        raise ValueError(f"{path}: target/initial inventory mismatch")
    if int(level.get("timeLimit", 0)) != min(150, ((sum(target_inventory.values()) + 199) // 200) * 30):
        raise ValueError(f"{path}: mainline time rule mismatch")


def json_meta() -> dict:
    return {
        "ver": "2.0.1",
        "importer": "json",
        "imported": True,
        "uuid": str(uuid.uuid4()),
        "files": [".json"],
        "subMetas": {},
        "userData": {},
    }


def main() -> None:
    source_manifest = load_json(SOURCE_DIR / "selection_manifest.json")
    if source_manifest.get("outputRange") != [6, 205] or len(source_manifest.get("levels", [])) != 200:
        raise ValueError("unrecognized selected ZT source corpus")
    protected_hashes = {level_id: digest(TARGET_DIR / f"zt_level_{level_id}.json") for level_id in range(1, 6)}
    for level_id in range(6, 206):
        source_path = SOURCE_DIR / f"zt_level_{level_id}.json"
        validate_level(source_path, level_id)
        expected_hash = next(entry["outputSha256"] for entry in source_manifest["levels"] if entry["ztLevelId"] == level_id)
        if digest(source_path) != expected_hash:
            raise ValueError(f"{source_path}: manifest hash mismatch")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = BACKUP_ROOT / f"zt-before-selected-200-{stamp}"
    backup_level_dir = backup_dir / "LevelData"
    backup_level_dir.mkdir(parents=True)
    backed_up = []
    for level_id in range(6, 206):
        for suffix in (".json", ".json.meta"):
            current = TARGET_DIR / f"zt_level_{level_id}{suffix}"
            if current.exists():
                shutil.copyfile(current, backup_level_dir / current.name)
                backed_up.append(str(current.relative_to(ROOT)))
    for level_id in range(6, 206):
        source_path = SOURCE_DIR / f"zt_level_{level_id}.json"
        target_path = TARGET_DIR / source_path.name
        shutil.copyfile(source_path, target_path)
        meta_path = target_path.with_suffix(".json.meta")
        if not meta_path.exists():
            meta_path.write_text(json.dumps(json_meta(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for level_id in range(1, 206):
        validate_level(TARGET_DIR / f"zt_level_{level_id}.json", level_id) if level_id >= 6 else None
        if not (TARGET_DIR / f"zt_level_{level_id}.json.meta").exists():
            raise ValueError(f"zt_level_{level_id}.json.meta missing after publication")
    if any(digest(TARGET_DIR / f"zt_level_{level_id}.json") != protected_hashes[level_id] for level_id in range(1, 6)):
        raise ValueError("protected online ZT 1-5 changed during publication")
    published_hashes = {str(level_id): digest(TARGET_DIR / f"zt_level_{level_id}.json") for level_id in range(6, 206)}
    receipt = {
        "publishedAt": datetime.now().astimezone().isoformat(),
        "sourceDirectory": str(SOURCE_DIR.relative_to(ROOT)),
        "targetDirectory": str(TARGET_DIR.relative_to(ROOT)),
        "publishedRange": [6, 205],
        "preservedRange": [1, 5],
        "backedUpFiles": backed_up,
        "protectedHashes": {str(key): value for key, value in protected_hashes.items()},
        "publishedHashes": published_hashes,
    }
    (backup_dir / "publication-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"published": 200, "backup": str(backup_dir.relative_to(ROOT)), "themeLevels": 205}, ensure_ascii=False))


if __name__ == "__main__":
    main()
