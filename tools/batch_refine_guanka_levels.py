#!/usr/bin/env python3
"""Batch refine guanka levels with a cute-style, contrast-aware configuration."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from types import SimpleNamespace
from typing import Dict, List

from refine_guanka_level import build_candidate, load_payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Batch refine guanka levels. This mode favors clearer contrast, "
            "fewer near-color pairings, and a cute fuse-bead look."
        )
    )
    parser.add_argument(
        "--dir",
        default="guanka",
        help="Directory containing level_*.json files.",
    )
    parser.add_argument(
        "--start",
        type=int,
        help="Optional minimum level id to process.",
    )
    parser.add_argument(
        "--end",
        type=int,
        help="Optional maximum level id to process.",
    )
    parser.add_argument(
        "--shape-budget-pct",
        type=float,
        default=5.0,
        help="Maximum shape drift percent. Defaults to 5.0 for limited cute-style reshaping.",
    )
    parser.add_argument(
        "--shuffle-attempts",
        type=int,
        default=10,
        help="Initial shuffle attempts per level.",
    )
    parser.add_argument(
        "--max-groups-per-color",
        type=int,
        default=4,
        help="Upper bound for clustered initial regions per color.",
    )
    parser.add_argument(
        "--seed-offset",
        type=int,
        default=0,
        help="Optional seed offset added to each level's derived seed.",
    )
    parser.add_argument(
        "--print-every",
        type=int,
        default=50,
        help="Progress print interval.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute summaries without writing files.",
    )
    parser.add_argument(
        "--report",
        default="tools/generated_levels/batch_refine_guanka_report.json",
        help="Path to write a JSON summary report.",
    )
    return parser.parse_args()


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def discover_level_paths(level_dir: Path, start: int | None, end: int | None) -> List[Path]:
    results: List[Path] = []
    for path in level_dir.glob("level_*.json"):
        try:
            level_id = int(path.stem.split("_")[1])
        except Exception:
            continue
        if start is not None and level_id < start:
            continue
        if end is not None and level_id > end:
            continue
        results.append(path)
    results.sort(key=lambda p: int(p.stem.split("_")[1]))
    return results


def main() -> None:
    args = parse_args()
    level_dir = Path(args.dir)
    paths = discover_level_paths(level_dir, args.start, args.end)
    if not paths:
        raise SystemExit("No matching level files found")

    summary_rows: List[Dict[str, object]] = []
    shape_changes: List[float] = []
    color_changes: List[float] = []
    displacement_deltas: List[float] = []
    init_strategy_counts: Dict[str, int] = {}

    build_args = SimpleNamespace(
        shape_budget_pct=args.shape_budget_pct,
        shuffle_attempts=args.shuffle_attempts,
        max_groups_per_color=args.max_groups_per_color,
        seed=None,
        output=None,
    )

    total = len(paths)
    for index, path in enumerate(paths, start=1):
        payload = load_payload(path)
        if args.seed_offset:
            level_id = int(payload.get("levelId", 0) or 0)
            build_args.seed = 20260424 + level_id * 6151 + args.seed_offset
        else:
            build_args.seed = None

        result = build_candidate(payload, build_args)
        candidate = result["candidate"]
        metrics = result["metrics"]

        if not args.dry_run:
            write_json(path, candidate)

        row = {
            "levelId": int(candidate.get("levelId", 0) or 0),
            "path": str(path),
            "shapeChangePct": metrics["shapeChangePct"],
            "colorChangePct": metrics["colorChangePct"],
            "displacementDelta": metrics["displacementDelta"],
            "colorCountDelta": metrics["colorCountDelta"],
            "filledDelta": metrics["filledDelta"],
            "initStrategy": metrics["initStrategy"],
        }
        summary_rows.append(row)
        shape_changes.append(float(metrics["shapeChangePct"]))
        color_changes.append(float(metrics["colorChangePct"]))
        displacement_deltas.append(float(metrics["displacementDelta"]))
        init_strategy = str(metrics["initStrategy"])
        init_strategy_counts[init_strategy] = init_strategy_counts.get(init_strategy, 0) + 1

        if args.print_every > 0 and (
            index == 1 or index % args.print_every == 0 or index == total
        ):
            print(
                f"[{index}/{total}] level_{candidate['levelId']} "
                f"shape={metrics['shapeChangePct']:.2f}% "
                f"color={metrics['colorChangePct']:.2f}% "
                f"disp_delta={metrics['displacementDelta']:+.4f}"
            )

    report = {
        "dir": str(level_dir),
        "processed": total,
        "shapeBudgetPct": args.shape_budget_pct,
        "shuffleAttempts": args.shuffle_attempts,
        "maxGroupsPerColor": args.max_groups_per_color,
        "dryRun": args.dry_run,
        "averageShapeChangePct": round(mean(shape_changes), 4) if shape_changes else 0.0,
        "averageColorChangePct": round(mean(color_changes), 4) if color_changes else 0.0,
        "averageDisplacementDelta": round(mean(displacement_deltas), 4) if displacement_deltas else 0.0,
        "maxShapeChangePct": round(max(shape_changes), 4) if shape_changes else 0.0,
        "minDisplacementDelta": round(min(displacement_deltas), 4) if displacement_deltas else 0.0,
        "maxDisplacementDelta": round(max(displacement_deltas), 4) if displacement_deltas else 0.0,
        "initStrategyCounts": init_strategy_counts,
        "levels": summary_rows,
    }
    write_json(Path(args.report), report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
