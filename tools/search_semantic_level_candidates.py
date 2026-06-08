#!/usr/bin/env python3
"""Search semantic-preserving rhythm candidates and validate with the runtime solver model."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Dict, List, Tuple

from calc_guanka_min_steps import LevelMinStepSolver, evaluate_rhythm
from optimize_semantic_level_rhythm import (
    changed_cell_count,
    color_counts,
    optimize_level,
    read_json,
    write_json,
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = ROOT / "assets" / "LevelData"
DEFAULT_WORK_DIR = ROOT / ".planning" / "session-plans" / "2026-06-03-restore-semantic-levels" / "candidate-search"
SLOTS_PER_ROW = 12


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search L6-L20 semantic level rhythm candidates.")
    parser.add_argument("--dir", default=str(DEFAULT_SOURCE_DIR))
    parser.add_argument("--work-dir", default=str(DEFAULT_WORK_DIR))
    parser.add_argument("--start", type=int, default=6)
    parser.add_argument("--end", type=int, default=20)
    parser.add_argument("--output", default=str(DEFAULT_WORK_DIR / "candidate-report.json"))
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def make_profile_rows(filled: int, has_small_target: bool) -> List[Dict[str, object]]:
    base_attempts = 180 if filled <= 240 else 80
    rows: List[Dict[str, object]] = [
        {
            "name": "layout",
            "attempts": base_attempts,
            "allow_target_merge": False,
            "force_target_cleanup": False,
            "require_target_cleanup": False,
            "merge_rounds": 0,
            "merge_candidates": 1,
            "max_merge_component": 3,
            "max_change_ratio": 0.055,
            "max_color_drops": 1,
        }
    ]
    if has_small_target:
        rows.extend([
            {
                "name": "merge-small",
                "attempts": base_attempts,
                "allow_target_merge": True,
                "force_target_cleanup": True,
                "require_target_cleanup": True,
                "merge_rounds": 10,
                "merge_candidates": 12,
                "max_merge_component": 3,
                "max_change_ratio": 0.08,
                "max_color_drops": 1,
            },
            {
                "name": "merge-medium",
                "attempts": base_attempts + (180 if filled <= 140 else 60),
                "allow_target_merge": True,
                "force_target_cleanup": True,
                "require_target_cleanup": True,
                "merge_rounds": 16,
                "merge_candidates": 18,
                "max_merge_component": 5,
                "max_change_ratio": 0.13 if filled <= 140 else 0.075,
                "max_color_drops": 1,
            },
        ])
    if filled >= 420 or has_small_target:
        rows.append({
            "name": "merge-wide",
            "attempts": base_attempts,
            "allow_target_merge": True,
            "force_target_cleanup": True,
            "require_target_cleanup": True,
            "merge_rounds": 18,
            "merge_candidates": 20,
            "max_merge_component": 8,
            "max_change_ratio": 0.10,
            "max_color_drops": 2,
        })
    return rows


def target_small_components(payload: Dict[str, object]) -> bool:
    grid = payload["correctColorArr"]
    height = len(grid)
    width = len(grid[0])
    visited: set[Tuple[int, int]] = set()
    dirs = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    for row in range(height):
        for col in range(width):
            color = int(grid[row][col])
            if color <= 0 or (row, col) in visited:
                continue
            stack = [(row, col)]
            visited.add((row, col))
            size = 0
            while stack:
                cr, cc = stack.pop()
                size += 1
                for dr, dc in dirs:
                    nr = cr + dr
                    nc = cc + dc
                    if nr < 0 or nr >= height or nc < 0 or nc >= width:
                        continue
                    if (nr, nc) in visited or int(grid[nr][nc]) != color:
                        continue
                    visited.add((nr, nc))
                    stack.append((nr, nc))
            if size <= 3:
                return True
    return False


def validate_payload(payload: Dict[str, object], slot_rows: int) -> Dict[str, object]:
    slot_capacity = SLOTS_PER_ROW * slot_rows
    result = LevelMinStepSolver(payload, slot_capacity=slot_capacity).solve(mode="auto")
    rhythm = evaluate_rhythm(result, slot_capacity)
    return {
        "slotRows": slot_rows,
        "complete": bool(result.complete),
        "steps": int(result.min_steps),
        "smallStepTotal": int(sum(result.small_step_histogram.values())),
        "smallPlaceTotal": int(sum(result.small_place_histogram.values())),
        "hist": result.step_size_histogram,
        "rhythmPass": bool(rhythm["pass"]),
        "reasons": rhythm["reasons"],
        "mainStepRatio": rhythm["mainStepRatio"],
        "fullSlotRatio": rhythm["fullSlotRatio"],
        "outOfRangeTotal": rhythm["outOfRangeTotal"],
    }


def candidate_score(row: Dict[str, object]) -> Tuple[int, int, int, float, int, int]:
    validation = row["validation"]
    small_total = int(validation["smallStepTotal"]) + int(validation["smallPlaceTotal"])
    complete_penalty = 0 if validation["complete"] else 1000
    rhythm_penalty = len(validation["reasons"])
    target_changes = int(row["targetChanges"])
    full_ratio = float(validation["fullSlotRatio"])
    steps = int(validation["steps"])
    return (complete_penalty, small_total, rhythm_penalty, full_ratio, target_changes, steps)


def build_candidate_payload(path: Path, profile: Dict[str, object], work_dir: Path) -> Tuple[Dict[str, object], Dict[str, object]]:
    candidate_dir = work_dir / "single"
    candidate_dir.mkdir(parents=True, exist_ok=True)
    candidate_path = candidate_dir / path.name
    shutil.copyfile(path, candidate_path)
    report = optimize_level(
        candidate_path,
        attempts=int(profile["attempts"]),
        dry_run=False,
        allow_target_merge=bool(profile["allow_target_merge"]),
        merge_rounds=int(profile["merge_rounds"]),
        merge_candidates=int(profile["merge_candidates"]),
        max_merge_component=int(profile["max_merge_component"]),
        max_change_ratio=float(profile["max_change_ratio"]),
        max_color_drops=int(profile["max_color_drops"]),
        force_target_cleanup=bool(profile["force_target_cleanup"]),
        require_target_cleanup=bool(profile["require_target_cleanup"]),
        solve_mode="greedy",
    )
    return read_json(candidate_path), report


def main() -> None:
    args = parse_args()
    source_dir = Path(args.dir)
    work_dir = Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    rows: List[Dict[str, object]] = []
    for level_id in range(args.start, args.end + 1):
        path = source_dir / f"level_{level_id}.json"
        original = read_json(path)
        filled = int(original.get("filledCellCount") or sum(color_counts(original["correctColorArr"]).values()))
        profiles = make_profile_rows(filled, target_small_components(original))
        candidates: List[Dict[str, object]] = []

        for slot_rows in (1, 2):
            validation = validate_payload(original, slot_rows)
            candidates.append({
                "profile": "original",
                "payload": original,
                "validation": validation,
                "targetChanges": 0,
                "targetColorCountBefore": len(color_counts(original["correctColorArr"])),
                "targetColorCountAfter": len(color_counts(original["correctColorArr"])),
            })

        for profile in profiles:
            candidate_payload, optimizer_report = build_candidate_payload(path, profile, work_dir / f"level_{level_id}_{profile['name']}")
            for slot_rows in (1, 2):
                payload_for_validation = dict(candidate_payload)
                if slot_rows == 2:
                    payload_for_validation["initialSlotUnlockedRows"] = 2
                validation = validate_payload(payload_for_validation, slot_rows)
                candidates.append({
                    "profile": str(profile["name"]),
                    "payload": payload_for_validation,
                    "validation": validation,
                    "targetChanges": int(optimizer_report["targetChanges"]),
                    "targetChangeRatio": optimizer_report["targetChangeRatio"],
                    "targetColorCountBefore": optimizer_report["targetColorCountBefore"],
                    "targetColorCountAfter": optimizer_report["targetColorCountAfter"],
                    "optimizerAfter": optimizer_report["after"],
                })

        best = min(candidates, key=candidate_score)
        best_payload = best.pop("payload")
        candidate_summaries = []
        for candidate in candidates:
            summary = {key: value for key, value in candidate.items() if key != "payload"}
            candidate_summaries.append(summary)
        chosen_path = work_dir / f"level_{level_id}_chosen.json"
        write_json(chosen_path, best_payload)
        if args.apply:
            write_json(path, best_payload)
        row = {
            "levelId": level_id,
            "chosenPath": str(chosen_path),
            "chosen": best,
            "candidates": candidate_summaries,
            "candidateCount": len(candidates),
        }
        rows.append(row)
        validation = best["validation"]
        print(
            f"L{level_id} {best['profile']} rows={validation['slotRows']} "
            f"small={validation['smallStepTotal']}/{validation['smallPlaceTotal']} "
            f"targetChanges={best['targetChanges']} hist={validation['hist']}"
        )

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"levels": rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"report={output}")


if __name__ == "__main__":
    main()
