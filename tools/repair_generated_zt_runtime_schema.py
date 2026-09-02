#!/usr/bin/env python3
"""Add current runtime-required fields to the isolated generated ZT corpus."""

from __future__ import annotations

import hashlib
import json
import statistics
from pathlib import Path

from generate_zt_selected_200 import assign_time_limits


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "tools" / "online-levels-2026-08-01-zt-selected-200"
MANIFEST_PATH = OUTPUT_DIR / "selection_manifest.json"
REPORT_PATH = OUTPUT_DIR / "selection_report.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("selectionPolicy") != "placementFirst" or manifest.get("outputRange") != [6, 205]:
        raise ValueError("refusing to repair an unrecognized output directory")
    entries = {entry["ztLevelId"]: entry for entry in manifest.get("levels", [])}
    if set(entries) != set(range(6, 206)):
        raise ValueError("manifest IDs must be exactly 6-205")
    ordered_entries = [entries[level_id] for level_id in range(6, 206)]
    assign_time_limits(ordered_entries)
    for entry in ordered_entries:
        entry.pop("targetBeansPerSecond", None)
        entry.pop("timeComplexityScore", None)
    protected_hashes = {level_id: digest(OUTPUT_DIR / f"zt_level_{level_id}.json") for level_id in range(1, 6)}
    for level_id in range(6, 206):
        path = OUTPUT_DIR / f"zt_level_{level_id}.json"
        level = json.loads(path.read_text(encoding="utf-8"))
        if level.get("levelId") != level_id:
            raise ValueError(f"{path}: internal ID mismatch")
        if level.get("Hard") not in (None, 0):
            raise ValueError(f"{path}: refusing to replace nonzero Hard")
        if level.get("conveyorCapacity") not in (None, 60):
            raise ValueError(f"{path}: refusing to replace nonstandard conveyorCapacity")
        level["Hard"] = 0
        level["conveyorCapacity"] = 60
        level.pop("slotPolicy", None)
        level.pop("initialSlotUnlockedRows", None)
        entries[level_id]["sourceTimeLimit"] = json.loads((ROOT / manifest["sourceDirectory"] / entries[level_id]["sourceFilename"]).read_text(encoding="utf-8")).get("timeLimit")
        level["timeLimit"] = entries[level_id]["timeLimit"]
        path.write_text(json.dumps(level, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
        entries[level_id]["Hard"] = 0
        entries[level_id]["conveyorCapacity"] = 60
        entries[level_id]["outputSha256"] = digest(path)
    manifest["runtimeSchema"] = {"Hard": 0, "conveyorCapacity": 60}
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    report["runtimeSchema"] = {"Hard": 0, "conveyorCapacity": 60}
    report["timeLimit"] = {
        "policy": "mainline: min(150, ceil(beanCount / 200) * 30)",
        "min": min(entry["timeLimit"] for entry in ordered_entries),
        "mean": statistics.mean(entry["timeLimit"] for entry in ordered_entries),
        "median": statistics.median(entry["timeLimit"] for entry in ordered_entries),
        "max": max(entry["timeLimit"] for entry in ordered_entries),
        "step": 30,
        "meanActualBeansPerSecond": statistics.mean(entry["actualBeansPerSecond"] for entry in ordered_entries),
    }
    for chapter, summary in enumerate(report["chapters"]):
        items = ordered_entries[chapter * 10:(chapter + 1) * 10]
        summary["meanTimeLimit"] = statistics.mean(item["timeLimit"] for item in items)
        summary["meanActualBeansPerSecond"] = statistics.mean(item["actualBeansPerSecond"] for item in items)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if any(digest(OUTPUT_DIR / f"zt_level_{level_id}.json") != protected_hashes[level_id] for level_id in range(1, 6)):
        raise ValueError("protected online ZT 1-5 changed during repair")
    print(json.dumps({"repaired": 200, "Hard": 0, "conveyorCapacity": 60, "timeLimit": report["timeLimit"]}))


if __name__ == "__main__":
    main()
