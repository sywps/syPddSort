#!/usr/bin/env python3
"""Select and copy 300 mainline levels that match the 182-level DBT design profile."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from collections import Counter
from pathlib import Path
from typing import Any

from analyze_dbt_levels import metric_for_level


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REFERENCE = ROOT / "tools" / "dbt" / "dbt_level_analysis.json"
DEFAULT_SOURCE = ROOT / "assets" / "LevelData"
DEFAULT_OUTPUT = ROOT / "tools" / "dbt-selected-300"
FEATURES = {
    "filled": 1.35,
    "colors": 1.10,
    "density": 0.90,
    "mismatch": 0.75,
    "fragmentation": 1.15,
    "beansPerSecond": 1.00,
    "width": 0.35,
    "height": 0.35,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--count", type=int, default=300)
    parser.add_argument("--replace", action="store_true", help="Replace generated files in the output directory")
    return parser.parse_args()


def transformed(item: dict[str, Any], key: str) -> float:
    value = float(item[key])
    if key in {"filled", "fragmentation", "beansPerSecond", "width", "height"}:
        return math.log1p(value)
    return value


def reference_scales(reference: list[dict[str, Any]]) -> dict[str, tuple[float, float]]:
    scales: dict[str, tuple[float, float]] = {}
    for key in FEATURES:
        values = [transformed(item, key) for item in reference]
        center = statistics.median(values)
        deviations = [abs(value - center) for value in values]
        spread = statistics.median(deviations) * 1.4826
        if spread < 1e-6:
            spread = statistics.pstdev(values) or 1.0
        scales[key] = (center, spread)
    return scales


def vector(item: dict[str, Any], scales: dict[str, tuple[float, float]]) -> dict[str, float]:
    return {
        key: (transformed(item, key) - center) / spread
        for key, (center, spread) in scales.items()
    }


def distance(left: dict[str, float], right: dict[str, float]) -> float:
    return sum(FEATURES[key] * (left[key] - right[key]) ** 2 for key in FEATURES)


def validate_level(level: dict[str, Any], path: Path) -> None:
    required = {
        "levelId",
        "boardWidth",
        "boardHeight",
        "timeLimit",
        "slotTotalCount",
        "conveyorCapacity",
        "correctColorArr",
        "initRandomColorArr",
    }
    missing = sorted(required - level.keys())
    if missing:
        raise ValueError(f"{path} missing required fields: {missing}")
    width = int(level["boardWidth"])
    height = int(level["boardHeight"])
    for field in ("correctColorArr", "initRandomColorArr"):
        grid = level[field]
        if len(grid) != height or any(len(row) != width for row in grid):
            raise ValueError(f"{path} has invalid {field} dimensions")
    correct_inventory = Counter(value for row in level["correctColorArr"] for value in row if value > 0)
    initial_inventory = Counter(value for row in level["initRandomColorArr"] for value in row if value > 0)
    if correct_inventory != initial_inventory:
        raise ValueError(f"{path} target and initial color inventories differ")


def load_candidates(source_dir: Path) -> list[dict[str, Any]]:
    candidates = []
    paths = sorted(
        source_dir.glob("level_*.json"),
        key=lambda path: int(path.stem.removeprefix("level_")),
    )
    for path in paths:
        level = json.loads(path.read_text(encoding="utf-8"))
        validate_level(level, path)
        metric = metric_for_level(level)
        candidates.append({"path": path, "level": level, "metric": metric})
    return candidates


def target_references(reference: list[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    if count <= 0:
        raise ValueError("count must be positive")
    if count == 1:
        return [reference[0]]
    last = len(reference) - 1
    return [reference[round(index * last / (count - 1))] for index in range(count)]


def select_levels(
    reference: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
    count: int,
) -> list[dict[str, Any]]:
    if len(candidates) < count:
        raise ValueError(f"source has {len(candidates)} levels, fewer than requested {count}")
    scales = reference_scales(reference)
    reference_vectors = {int(item["id"]): vector(item, scales) for item in reference}
    for candidate in candidates:
        candidate["vector"] = vector(candidate["metric"], scales)
    targets = target_references(reference, count)
    remaining = {int(candidate["metric"]["id"]): candidate for candidate in candidates}
    used_patterns: set[str] = set()
    shape_counts: Counter[str] = Counter()
    selected: list[dict[str, Any]] = []
    for order, target in enumerate(targets, start=1):
        target_vector = reference_vectors[int(target["id"])]
        ranked = []
        for source_id, candidate in remaining.items():
            metric = candidate["metric"]
            if metric["patternHash"] in used_patterns:
                continue
            score = distance(target_vector, candidate["vector"])
            score += shape_counts[metric["shapeHash"]] * 0.45
            if selected and abs(source_id - selected[-1]["sourceId"]) <= 2:
                score += 0.25
            ranked.append((score, source_id, candidate))
        if not ranked:
            raise RuntimeError(f"no unique-pattern candidate remains for selection position {order}")
        score, source_id, candidate = min(ranked, key=lambda item: (item[0], item[1]))
        metric = candidate["metric"]
        used_patterns.add(metric["patternHash"])
        shape_counts[metric["shapeHash"]] += 1
        remaining.pop(source_id)
        selected.append({
            "order": order,
            "sourceId": source_id,
            "sourceFile": candidate["path"].name,
            "matchedDbtLevelId": int(target["id"]),
            "matchedDbtCategory": target["category"],
            "matchedDbtTier": target["tier"],
            "distance": round(score, 5),
            "metrics": {key: metric[key] for key in (
                "width", "height", "filled", "colors", "time", "density", "mismatch",
                "fragmentation", "beansPerSecond", "shapeHash", "patternHash",
            )},
            "candidate": candidate,
        })
    return selected


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mean_metrics(rows: list[dict[str, Any]]) -> dict[str, float]:
    keys = ("filled", "colors", "density", "mismatch", "fragmentation", "beansPerSecond")
    return {
        key: round(statistics.mean(float(row[key]) for row in rows), 4)
        for key in keys
    }


def write_outputs(
    output_dir: Path,
    source_dir: Path,
    reference_path: Path,
    reference: list[dict[str, Any]],
    selected: list[dict[str, Any]],
    replace: bool,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    existing_levels = list(output_dir.glob("level_*.json"))
    if existing_levels and not replace:
        raise FileExistsError(f"output already contains {len(existing_levels)} level files: {output_dir}")
    if replace:
        for path in existing_levels:
            path.unlink()
        for filename in ("selection_manifest.json", "shuffle_report.json", "README.md"):
            path = output_dir / filename
            if path.exists():
                path.unlink()
    manifest_rows = []
    for row in selected:
        source_path = row["candidate"]["path"]
        output_filename = f"level_{row['order']}.json"
        output_path = output_dir / output_filename
        output_level = dict(row["candidate"]["level"])
        output_level["levelId"] = row["order"]
        output_path.write_text(
            json.dumps(output_level, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        source_hash = sha256(source_path)
        output_hash = sha256(output_path)
        manifest_row = {key: value for key, value in row.items() if key != "candidate"}
        manifest_row["outputFile"] = output_filename
        manifest_row["sourceSha256"] = source_hash
        manifest_row["outputSha256"] = output_hash
        manifest_rows.append(manifest_row)
    selected_metrics = [row["metrics"] for row in manifest_rows]
    summary = {
        "count": len(manifest_rows),
        "sourceCorpusCount": len(list(source_dir.glob("level_*.json"))),
        "uniqueSourceIds": len({row["sourceId"] for row in manifest_rows}),
        "uniquePatternHashes": len({row["metrics"]["patternHash"] for row in manifest_rows}),
        "uniqueShapeHashes": len({row["metrics"]["shapeHash"] for row in manifest_rows}),
        "matchedDbtCategoryCounts": dict(Counter(row["matchedDbtCategory"] for row in manifest_rows)),
        "matchedDbtTierCounts": dict(Counter(row["matchedDbtTier"] for row in manifest_rows)),
        "referenceMeans": mean_metrics(reference),
        "selectedMeans": mean_metrics(selected_metrics),
        "meanMatchDistance": round(statistics.mean(row["distance"] for row in manifest_rows), 5),
    }
    manifest = {
        "methodVersion": 2,
        "method": "DBT 182 proportional target resampling + robust-scaled nearest feature match + pattern uniqueness",
        "reference": str(reference_path.relative_to(ROOT)),
        "source": str(source_dir.relative_to(ROOT)),
        "output": str(output_dir.relative_to(ROOT)),
        "featureWeights": FEATURES,
        "summary": summary,
        "levels": manifest_rows,
    }
    (output_dir / "selection_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    readme = "\n".join([
        "# DBT 风格 300 关筛选结果",
        "",
        f"- 来源：`{manifest['source']}`（{summary['sourceCorpusCount']} 关）",
        f"- 参考：`{manifest['reference']}`（182 关）",
        f"- 结果：{summary['count']} 关，观看/关卡编号连续为 1–{summary['count']}",
        "- 原始编号：保留在 `selection_manifest.json` 的 `sourceId` / `sourceFile` 字段中",
        f"- 去重：{summary['uniqueSourceIds']} 个源 ID，{summary['uniquePatternHashes']} 个布局图案哈希",
        "- 选择标准：参考 `tools/dbt/dbt-level-design-report.html`，按八类关卡、四档压力和锯齿式节奏，把 182 关比例扩展为 300 个目标位。",
        "- 匹配指标：体量、颜色数、密度、乱序、碎片度、时间压力和尺寸；禁止重复标准化配色图案。",
        "- 明细：见 `selection_manifest.json`，包含新编号、源编号、DBT 参考关、类型、压力档、距离、指标及源/输出 SHA-256。",
        "",
        "除 `levelId` 按观看顺序改为 1–300 外，关卡内容字段沿用选中的源关卡。",
        "筛选完成后运行 `node tools/apply_controlled_shuffle_to_levels.js`，用 182 个 DBT 参考关学习出的新算法重建全部 `initRandomColorArr`。",
        "",
    ])
    (output_dir / "README.md").write_text(readme, encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def main() -> None:
    args = parse_args()
    reference_payload = json.loads(args.reference.read_text(encoding="utf-8"))
    reference = reference_payload["levels"]
    if len(reference) != 182:
        raise ValueError(f"reference must contain 182 levels, got {len(reference)}")
    candidates = load_candidates(args.source)
    selected = select_levels(reference, candidates, args.count)
    write_outputs(args.output, args.source, args.reference, reference, selected, args.replace)


if __name__ == "__main__":
    main()
