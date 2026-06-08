#!/usr/bin/env python3
"""Flip upside-down guanka levels vertically and rebuild their initial shuffle."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

from generate_initial_shuffle import (
    build_updated_payload,
    choose_best_init,
    derive_seed,
    load_payload,
    validate_grid,
    write_json,
)

Grid = List[List[int]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Flip guanka levels vertically by reversing correctColorArr rows, "
            "then regenerate initRandomColorArr."
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
        default=837,
        help="First level id to process.",
    )
    parser.add_argument(
        "--end",
        type=int,
        default=2400,
        help="Last level id to process.",
    )
    parser.add_argument(
        "--attempts",
        type=int,
        default=12,
        help="Shuffle attempts per level. Highest displacement ratio wins.",
    )
    parser.add_argument(
        "--max-groups-per-color",
        type=int,
        default=4,
        help="Upper bound for clustered regions created per color.",
    )
    parser.add_argument(
        "--print-every",
        type=int,
        default=100,
        help="Progress print interval.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Inspect matching files without writing changes.",
    )
    return parser.parse_args()


def flip_vertical(grid: Grid) -> Grid:
    return [row[:] for row in reversed(grid)]


def process_level(
    path: Path,
    attempts: int,
    max_groups_per_color: int,
) -> Dict[str, object]:
    payload = load_payload(path)
    correct: Grid = payload["correctColorArr"]  # type: ignore[assignment]
    validate_grid(correct)

    flipped = flip_vertical(correct)
    updated_payload = dict(payload)
    updated_payload["correctColorArr"] = flipped

    base_seed = derive_seed(updated_payload, None)
    chosen = choose_best_init(
        correct=flipped,
        base_seed=base_seed,
        attempts=attempts,
        min_groups_per_color=max_groups_per_color,
        max_groups_per_color=max_groups_per_color,
    )
    rebuilt = build_updated_payload(
        payload=updated_payload,
        init_grid=chosen["init_grid"],
        ratio=float(chosen["displacement_ratio"]),
        chosen_seed=int(chosen["seed"]),
        chosen_group_count=int(chosen["group_count"]),
    )
    return rebuilt


def main() -> None:
    args = parse_args()
    level_dir = Path(args.dir)
    existing_paths: List[Path] = []
    missing_ids: List[int] = []
    for level_id in range(args.start, args.end + 1):
        path = level_dir / f"level_{level_id}.json"
        if path.exists():
            existing_paths.append(path)
        else:
            missing_ids.append(level_id)

    if args.dry_run:
        print(
            json.dumps(
                {
                    "dir": str(level_dir),
                    "start": args.start,
                    "end": args.end,
                    "matched": len(existing_paths),
                    "missing": len(missing_ids),
                    "missingSample": missing_ids[:20],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    processed = 0
    ratios: List[float] = []
    for path in existing_paths:
        rebuilt = process_level(
            path=path,
            attempts=max(1, args.attempts),
            max_groups_per_color=args.max_groups_per_color,
        )
        write_json(path, rebuilt)
        processed += 1
        ratios.append(float(rebuilt["displacementRatio"]))
        if args.print_every > 0 and (
            processed == 1
            or processed % args.print_every == 0
            or processed == len(existing_paths)
        ):
            print(
                f"[{processed}/{len(existing_paths)}] "
                f"level_{rebuilt['levelId']} ratio={rebuilt['displacementRatio']:.4f}"
            )

    print(
        json.dumps(
            {
                "dir": str(level_dir),
                "start": args.start,
                "end": args.end,
                "processed": processed,
                "missing": len(missing_ids),
                "missingSample": missing_ids[:20],
                "averageDisplacementRatio": round(sum(ratios) / len(ratios), 4)
                if ratios
                else 0.0,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
