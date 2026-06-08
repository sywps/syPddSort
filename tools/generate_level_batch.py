#!/usr/bin/env python3
"""Generate a curated batch of levels with difficulty-aware shuffle search."""

from __future__ import annotations

import argparse
import json
import random
import uuid
from collections import deque
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

from generate_cute_target import ANIMAL_BUILDERS, generate_target_payload
from generate_initial_shuffle import DIFFICULTY_PRESETS, build_updated_payload, choose_best_init
from move_target_to_initial import build_move_map

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "guanka"
DEFAULT_DEBUG_DIR = ROOT / "tools" / "generated_levels" / "generated_batch_levels"
DEFAULT_REPORT_PATH = ROOT / "tools" / "generated_levels" / "level_generation_batch_report.json"
BUTTERFLY_STYLES = ("monarch", "pastel", "jewel", "sunset", "garden")

Grid = List[List[int]]

GENERATION_PRESETS: Dict[str, Dict[str, object]] = {
    "tutorial": {"width": (14, 17), "height": (14, 18), "colors": (4, 5), "fill_center": 0.46, "fill_band": (0.34, 0.58)},
    "easy": {"width": (16, 20), "height": (16, 20), "colors": (5, 6), "fill_center": 0.43, "fill_band": (0.31, 0.56)},
    "normal": {"width": (20, 26), "height": (18, 24), "colors": (6, 8), "fill_center": 0.40, "fill_band": (0.28, 0.52)},
    "hard": {"width": (24, 30), "height": (20, 26), "colors": (8, 10), "fill_center": 0.37, "fill_band": (0.26, 0.48)},
    "expert": {"width": (28, 34), "height": (22, 28), "colors": (9, 11), "fill_center": 0.34, "fill_band": (0.24, 0.44)},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a curated batch of levels.")
    parser.add_argument("--specs", required=True, help="JSON file containing a list of generation specs.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--debug-dir", default=str(DEFAULT_DEBUG_DIR))
    parser.add_argument("--report", default=str(DEFAULT_REPORT_PATH))
    parser.add_argument("--target-variants", type=int, default=5, help="Number of target seeds to try per spec.")
    parser.add_argument("--shuffle-attempts", type=int, default=18, help="Seed attempts per shuffle group-count setting.")
    parser.add_argument("--minstep-mode", choices=("off", "greedy", "auto", "knn"), default="off")
    parser.add_argument("--runtime-format", action="store_true", help="Write Cocos .meta files next to generated JSON.")
    return parser.parse_args()


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
    write_json(meta_path, payload)


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def normalize_specs(payload: object) -> List[Dict[str, object]]:
    if isinstance(payload, list):
        return [dict(item) for item in payload]
    if isinstance(payload, dict) and isinstance(payload.get("levels"), list):
        return [dict(item) for item in payload["levels"]]
    raise ValueError("specs JSON must be a list or an object with a 'levels' array")


def load_specs(path: Path) -> List[Dict[str, object]]:
    return normalize_specs(json.loads(path.read_text(encoding="utf-8")))


def level_cells(grid: Grid) -> List[Tuple[int, int]]:
    return [(row, col) for row, line in enumerate(grid) for col, value in enumerate(line) if value > 0]


def compute_bbox(cells: Sequence[Tuple[int, int]]) -> Tuple[int, int, int, int]:
    rows = [row for row, _ in cells]
    cols = [col for _, col in cells]
    return min(rows), max(rows), min(cols), max(cols)


def edge_touch_ratio(grid: Grid, cells: Sequence[Tuple[int, int]]) -> float:
    if not cells:
        return 1.0
    height = len(grid)
    width = len(grid[0])
    edge_hits = 0
    for row, col in cells:
        if row == 0 or col == 0 or row == height - 1 or col == width - 1:
            edge_hits += 1
    return edge_hits / len(cells)


def count_components(grid: Grid) -> int:
    height = len(grid)
    width = len(grid[0])
    visited = [[False for _ in range(width)] for _ in range(height)]
    components = 0
    for start_row in range(height):
        for start_col in range(width):
            if grid[start_row][start_col] <= 0 or visited[start_row][start_col]:
                continue
            components += 1
            queue = deque([(start_row, start_col)])
            visited[start_row][start_col] = True
            while queue:
                row, col = queue.popleft()
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nr = row + dr
                    nc = col + dc
                    if nr < 0 or nr >= height or nc < 0 or nc >= width:
                        continue
                    if visited[nr][nc] or grid[nr][nc] <= 0:
                        continue
                    visited[nr][nc] = True
                    queue.append((nr, nc))
    return components


def evaluate_target_metrics(payload: Dict[str, object]) -> Dict[str, float | int]:
    grid = payload["correctColorArr"]
    height = len(grid)
    width = len(grid[0])
    cells = level_cells(grid)
    if not cells:
        raise ValueError("Generated target is empty")
    bbox_top, bbox_bottom, bbox_left, bbox_right = compute_bbox(cells)
    bbox_area = (bbox_bottom - bbox_top + 1) * (bbox_right - bbox_left + 1)
    filled = len(cells)
    fill_ratio = filled / (width * height)
    bbox_fill_ratio = filled / max(1, bbox_area)
    min_margin = min(bbox_top, bbox_left, height - 1 - bbox_bottom, width - 1 - bbox_right)
    return {
        "filled": filled,
        "fill_ratio": round(fill_ratio, 4),
        "bbox_fill_ratio": round(bbox_fill_ratio, 4),
        "edge_touch_ratio": round(edge_touch_ratio(grid, cells), 4),
        "component_count": count_components(grid),
        "min_margin": int(min_margin),
    }


def score_target_metrics(
    metrics: Dict[str, float | int],
    preset: Dict[str, object],
    target_colors: int,
    actual_colors: int,
) -> float:
    fill_center = float(preset["fill_center"])
    fill_low, fill_high = preset["fill_band"]
    fill_ratio = float(metrics["fill_ratio"])
    edge_ratio = float(metrics["edge_touch_ratio"])
    bbox_fill_ratio = float(metrics["bbox_fill_ratio"])
    components = int(metrics["component_count"])
    min_margin = int(metrics["min_margin"])

    penalty = abs(fill_ratio - fill_center) * 120.0
    if fill_ratio < fill_low:
        penalty += (fill_low - fill_ratio) * 180.0
    if fill_ratio > fill_high:
        penalty += (fill_ratio - fill_high) * 180.0
    if edge_ratio > 0.08:
        penalty += (edge_ratio - 0.08) * 240.0
    if bbox_fill_ratio < 0.38:
        penalty += (0.38 - bbox_fill_ratio) * 100.0
    if bbox_fill_ratio > 0.82:
        penalty += (bbox_fill_ratio - 0.82) * 100.0
    if components > 3:
        penalty += (components - 3) * 18.0
    if min_margin < 1:
        penalty += 35.0
    penalty += abs(actual_colors - target_colors) * 10.0
    return round(-penalty, 4)


def choose_int(rng: random.Random, bounds: Tuple[int, int]) -> int:
    low, high = bounds
    return low if low == high else rng.randint(low, high)


def resolve_spec(spec: Dict[str, object], index: int) -> Dict[str, object]:
    if "level_id" not in spec:
        raise ValueError(f"Spec at index {index} is missing level_id")
    if "animal" not in spec:
        raise ValueError(f"Spec at index {index} is missing animal")

    level_id = int(spec["level_id"])
    animal = str(spec["animal"]).lower()
    difficulty = str(spec.get("difficulty", "normal")).lower()
    if difficulty not in GENERATION_PRESETS:
        raise ValueError(f"Unsupported difficulty '{difficulty}' for level {level_id}")
    if animal != "butterfly" and animal not in ANIMAL_BUILDERS:
        raise ValueError(f"Unsupported animal '{animal}' for level {level_id}")

    base_seed = int(spec.get("seed", 20260428 + level_id * 31))
    rng = random.Random(base_seed + index * 17)
    preset = GENERATION_PRESETS[difficulty]

    resolved = dict(spec)
    resolved["level_id"] = level_id
    resolved["animal"] = animal
    resolved["difficulty"] = difficulty
    resolved["seed"] = base_seed
    resolved["width"] = int(spec.get("width") or choose_int(rng, preset["width"]))
    resolved["height"] = int(spec.get("height") or choose_int(rng, preset["height"]))
    resolved["colors"] = int(spec.get("colors") or choose_int(rng, preset["colors"]))
    if animal == "butterfly" and not spec.get("style"):
        resolved["style"] = BUTTERFLY_STYLES[index % len(BUTTERFLY_STYLES)]
    return resolved


def spec_search_config(spec: Dict[str, object], cli_minstep_mode: str) -> Dict[str, object]:
    difficulty = str(spec["difficulty"])
    shuffle_preset = DIFFICULTY_PRESETS[difficulty]
    target_min_steps = spec.get("target_min_steps", shuffle_preset["target_min_steps"])
    min_min_steps = spec.get("min_min_steps", shuffle_preset["min_min_steps"])
    max_min_steps = spec.get("max_min_steps", shuffle_preset["max_min_steps"])
    minstep_mode = str(spec.get("minstep_mode", cli_minstep_mode))
    if minstep_mode == "off":
        target_min_steps = None
        min_min_steps = None
        max_min_steps = None

    group_low, group_high = shuffle_preset["group_range"]
    return {
        "target_displacement": float(spec.get("target_displacement", shuffle_preset["target_displacement"])),
        "min_displacement": float(spec.get("min_displacement", shuffle_preset["min_displacement"])),
        "max_displacement": float(spec.get("max_displacement", shuffle_preset["max_displacement"])),
        "min_groups": int(spec.get("min_groups_per_color", group_low)),
        "max_groups": int(spec.get("max_groups_per_color", group_high)),
        "minstep_mode": minstep_mode,
        "target_min_steps": int(target_min_steps) if target_min_steps is not None else None,
        "min_min_steps": int(min_min_steps) if min_min_steps is not None else None,
        "max_min_steps": int(max_min_steps) if max_min_steps is not None else None,
    }


def build_level_candidate(
    spec: Dict[str, object],
    target_seed: int,
    shuffle_attempts: int,
    minstep_mode: str,
) -> Dict[str, object]:
    target_payload = generate_target_payload(
        width=int(spec["width"]),
        height=int(spec["height"]),
        animal=str(spec["animal"]),
        color_count=int(spec["colors"]),
        seed=target_seed,
        level_id=int(spec["level_id"]),
        style=str(spec["style"]) if spec.get("style") is not None else None,
    )
    search = spec_search_config(spec, minstep_mode)
    chosen = choose_best_init(
        correct=target_payload["correctColorArr"],
        base_seed=target_seed + 97,
        attempts=shuffle_attempts,
        min_groups_per_color=int(search["min_groups"]),
        max_groups_per_color=int(search["max_groups"]),
        target_displacement=float(search["target_displacement"]),
        min_displacement=float(search["min_displacement"]),
        max_displacement=float(search["max_displacement"]),
        minstep_mode=str(search["minstep_mode"]),
        target_min_steps=search["target_min_steps"],
        min_min_steps=search["min_min_steps"],
        max_min_steps=search["max_min_steps"],
    )
    payload = build_updated_payload(
        payload=target_payload,
        init_grid=chosen["init_grid"],
        ratio=float(chosen["displacement_ratio"]),
        chosen_seed=int(chosen["seed"]),
        chosen_group_count=int(chosen["group_count"]),
    )
    if chosen["min_step_count"] is not None:
        payload["minStepCount"] = int(chosen["min_step_count"])
        payload["minStepSolver"] = chosen["min_step_solver"]
    if "name" in spec:
        payload["levelName"] = spec["name"]
    if "category" in spec:
        payload["levelCategory"] = spec["category"]
    if "online" in spec:
        payload["online"] = bool(spec["online"])
    if "is_featured" in spec:
        payload["isFeatured"] = bool(spec["is_featured"])

    target_metrics = evaluate_target_metrics(target_payload)
    target_score = score_target_metrics(
        target_metrics,
        GENERATION_PRESETS[str(spec["difficulty"])],
        target_colors=int(spec["colors"]),
        actual_colors=int(payload["colorCount"]),
    )
    total_score = round(target_score + float(chosen["score"]), 4)
    return {
        "payload": payload,
        "target_payload": target_payload,
        "moves_payload": {
            "levelId": int(spec["level_id"]),
            "animal": spec["animal"],
            "style": spec.get("style"),
            "moveCount": payload["filledCellCount"],
            "displacementRatio": payload["displacementRatio"],
            "moveMap": build_move_map(target_payload["correctColorArr"], chosen["init_grid"]),
        },
        "report_row": {
            "levelId": int(spec["level_id"]),
            "animal": spec["animal"],
            "style": spec.get("style"),
            "difficulty": spec["difficulty"],
            "size": f"{payload['boardWidth']}x{payload['boardHeight']}",
            "requestedColors": int(spec["colors"]),
            "actualColors": int(payload["colorCount"]),
            "filled": int(payload["filledCellCount"]),
            "fillRatio": target_metrics["fill_ratio"],
            "bboxFillRatio": target_metrics["bbox_fill_ratio"],
            "edgeTouchRatio": target_metrics["edge_touch_ratio"],
            "componentCount": target_metrics["component_count"],
            "minMargin": target_metrics["min_margin"],
            "targetSeed": target_seed,
            "initSeed": int(chosen["seed"]),
            "groupCount": int(chosen["group_count"]),
            "displacementRatio": float(payload["displacementRatio"]),
            "minStepCount": payload.get("minStepCount"),
            "targetScore": target_score,
            "shuffleScore": float(chosen["score"]),
            "qualityScore": total_score,
        },
    }


def iter_target_seeds(base_seed: int, count: int) -> Iterable[int]:
    for variant in range(max(1, count)):
        yield base_seed + variant * 104729


def choose_best_candidate(
    spec: Dict[str, object],
    target_variants: int,
    shuffle_attempts: int,
    minstep_mode: str,
) -> Dict[str, object]:
    best_candidate: Dict[str, object] | None = None
    best_score: float | None = None
    for target_seed in iter_target_seeds(int(spec["seed"]), target_variants):
        candidate = build_level_candidate(spec, target_seed, shuffle_attempts, minstep_mode)
        score = float(candidate["report_row"]["qualityScore"])
        if best_candidate is None or best_score is None or score > best_score:
            best_candidate = candidate
            best_score = score
    if best_candidate is None:
        raise ValueError(f"Unable to generate level {spec['level_id']}")
    return best_candidate


def main() -> None:
    args = parse_args()
    specs = [resolve_spec(spec, index) for index, spec in enumerate(load_specs(Path(args.specs)))]
    output_dir = Path(args.output_dir)
    debug_dir = Path(args.debug_dir)
    report_rows: List[Dict[str, object]] = []

    for spec in specs:
        candidate = choose_best_candidate(
            spec=spec,
            target_variants=args.target_variants,
            shuffle_attempts=args.shuffle_attempts,
            minstep_mode=args.minstep_mode,
        )
        level_id = int(spec["level_id"])
        level_path = output_dir / f"level_{level_id}.json"
        target_path = debug_dir / f"level_{level_id}_target.json"
        moves_path = debug_dir / f"level_{level_id}_moves.json"
        write_json(level_path, candidate["payload"])
        write_json(target_path, candidate["target_payload"])
        write_json(moves_path, candidate["moves_payload"])
        if args.runtime_format:
            write_meta(level_path)
        report_rows.append(candidate["report_row"])

    summary = {
        "specCount": len(specs),
        "outputDir": str(output_dir),
        "debugDir": str(debug_dir),
        "targetVariants": max(1, args.target_variants),
        "shuffleAttempts": max(1, args.shuffle_attempts),
        "minstepMode": args.minstep_mode,
        "levels": report_rows,
    }
    write_json(Path(args.report), summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
