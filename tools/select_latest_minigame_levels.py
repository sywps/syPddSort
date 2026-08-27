#!/usr/bin/env python3
"""Select a paced, traceable 300-level mini-game sequence from 1,643 mainline levels."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from collections import Counter
from pathlib import Path
from typing import Any

from select_dbt_like_levels import (
    FEATURES,
    ROOT,
    distance,
    load_candidates,
    reference_scales,
    sha256,
    target_references,
    vector,
)


DEFAULT_REFERENCE = ROOT / "tools" / "dbt" / "dbt_level_analysis.json"
DEFAULT_SOURCE = ROOT / "assets" / "LevelData"
DEFAULT_OUTPUT = ROOT / "tools" / "latest-minigame-selected-300"
STAGES = ((1, 10, "极低门槛教学段"), (11, 30, "建立信心段"), (31, 80, "稳定留存段"),
          (81, 160, "主体消耗段"), (161, 240, "中高压段"), (241, 280, "版本尾段"),
          (281, 300, "深度展示段"))
SHOWCASE_POSITIONS = tuple(range(172, 300, 12)) + (300,)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--replace", action="store_true")
    return parser.parse_args()


def stage_name(order: int) -> str:
    return next(name for start, end, name in STAGES if start <= order <= end)


def progression_targets(order: int, tier: str) -> tuple[float, float]:
    stage_index = next(index for index, (start, end, _name) in enumerate(STAGES) if start <= order <= end)
    base_filled = (420, 650, 800, 1000, 1180, 1350, 1500)[stage_index]
    base_colors = (4.0, 5.5, 6.5, 7.5, 8.5, 9.5, 10.0)[stage_index]
    factor = {"舒缓": 0.72, "稳定": 0.95, "高压": 1.15, "尖峰": 1.35}[tier]
    return base_filled * factor, base_colors + {"舒缓": -1.0, "稳定": 0.0, "高压": 1.0, "尖峰": 1.5}[tier]


def paced_targets(reference: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[int]]:
    base = target_references(reference, 300)
    peaks = [item for item in base if item["tier"] == "尖峰"]
    non_peaks = [item for item in base if item["tier"] != "尖峰"]
    if len(peaks) != 30:
        raise ValueError(f"expected 30 proportional peak targets, got {len(peaks)}")
    peak_positions = []
    for index in range(len(peaks)):
        position = round(28 + index * (295 - 28) / (len(peaks) - 1))
        while position in peak_positions or position + 1 in peak_positions:
            position += 1
        peak_positions.append(position)
    calm = [item for item in non_peaks if item["tier"] == "舒缓"]
    remaining = non_peaks[:]
    slots: list[dict[str, Any] | None] = [None] * 300
    for position, peak in zip(peak_positions, peaks):
        slots[position - 1] = peak
        relief = min(calm, key=lambda item: (item["difficulty"], item["id"]))
        calm.remove(relief)
        remaining.remove(relief)
        slots[position] = relief
    iterator = iter(remaining)
    for index, item in enumerate(slots):
        if item is None:
            slots[index] = next(iterator)
    return [item for item in slots if item is not None], peak_positions


def visual_score(level: dict[str, Any], metric: dict[str, Any]) -> float:
    grid = level["correctColorArr"]
    height = len(grid)
    width = len(grid[0])
    occupied = [[value > 0 for value in row] for row in grid]
    horizontal = sum(occupied[row][col] == occupied[row][width - 1 - col]
                     for row in range(height) for col in range(width)) / (height * width)
    vertical = sum(occupied[row][col] == occupied[height - 1 - row][col]
                   for row in range(height) for col in range(width)) / (height * width)
    center_rows = range(height // 4, max(height // 4 + 1, math.ceil(height * 0.75)))
    center_cols = range(width // 4, max(width // 4 + 1, math.ceil(width * 0.75)))
    center_total = max(1, len(center_rows) * len(center_cols))
    center_fill = sum(occupied[row][col] for row in center_rows for col in center_cols) / center_total
    return round(max(horizontal, vertical) * 0.45 + center_fill * 0.25
                 + min(1.0, metric["colors"] / 12) * 0.15 + metric["density"] * 0.15, 4)


def dominant_pressure(candidate_vector: dict[str, float]) -> str:
    values = {
        "体量压力": candidate_vector["filled"],
        "颜色辨识": candidate_vector["colors"],
        "碎片调度": candidate_vector["fragmentation"],
        "时间压力": candidate_vector["beansPerSecond"],
    }
    return max(values, key=values.get)


def source_digest(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.name.encode())
        digest.update(sha256(path).encode())
    return digest.hexdigest()


def select(reference: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[int]]:
    targets, peak_positions = paced_targets(reference)
    scales = reference_scales(reference)
    reference_vectors = {int(item["id"]): vector(item, scales) for item in reference}
    for candidate in candidates:
        candidate["vector"] = vector(candidate["metric"], scales)
        candidate["visualScore"] = visual_score(candidate["level"], candidate["metric"])
    remaining = {int(item["metric"]["id"]): item for item in candidates if item["metric"]["colors"] > 1}
    used_patterns: set[str] = set()
    shape_counts: Counter[str] = Counter()
    selected = []
    for order, target in enumerate(targets, start=1):
        target_vector = reference_vectors[int(target["id"])]
        target_filled, target_colors = progression_targets(order, target["tier"])
        ranked = []
        for source_id, candidate in remaining.items():
            metric = candidate["metric"]
            if metric["patternHash"] in used_patterns:
                continue
            if order <= 10 and (metric["colors"] > 5 or metric["filled"] > 700):
                continue
            if order == 1 and (metric["colors"] > 3 or metric["filled"] > 180):
                continue
            score = distance(target_vector, candidate["vector"])
            score += abs(math.log1p(metric["filled"]) - math.log1p(target_filled)) * 20.0
            score += abs(metric["colors"] - target_colors) * 4.0
            score += shape_counts[metric["shapeHash"]] * 0.65
            if selected:
                previous = selected[-1]["candidate"]["metric"]
                if metric["width"] == previous["width"] and metric["height"] == previous["height"]:
                    score += 0.4
                if metric["colors"] == previous["colors"]:
                    score += 0.12
            visual_weight = 0.4 if order < 161 else 1.2
            if order in SHOWCASE_POSITIONS:
                visual_weight += 2.5
            if order == 300:
                visual_weight += 7.0
                if metric["filled"] < 800:
                    score += 8.0
            score -= candidate["visualScore"] * visual_weight
            ranked.append((score, source_id, candidate))
        if not ranked:
            raise RuntimeError(f"no eligible candidate remains at order {order}")
        score, source_id, candidate = min(ranked, key=lambda item: (item[0], item[1]))
        metric = candidate["metric"]
        remaining.pop(source_id)
        used_patterns.add(metric["patternHash"])
        shape_counts[metric["shapeHash"]] += 1
        selected.append({
            "order": order,
            "sourceId": source_id,
            "sourceFile": candidate["path"].name,
            "outputFile": f"level_{order}.json",
            "matchedReferenceLevelId": int(target["id"]),
            "category": target["category"],
            "pressureTier": target["tier"],
            "dominantPressure": dominant_pressure(candidate["vector"]),
            "selectionScore": round(score, 5),
            "selectionReasons": [f"匹配 DBT 第 {target['id']} 关设计角色", target["category"], target["tier"],
                                 "强视觉展示位" if order in SHOWCASE_POSITIONS else stage_name(order)],
            "visualScore": candidate["visualScore"],
            "metrics": {key: metric[key] for key in ("width", "height", "filled", "colors", "time",
                        "density", "mismatch", "fragmentation", "beansPerSecond", "shapeHash", "patternHash")},
            "candidate": candidate,
        })
    return selected, peak_positions


def stage_summaries(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for start, end, name in STAGES:
        stage = rows[start - 1:end]
        result.append({"range": f"{start}-{end}", "name": name,
                       "meanFilled": round(statistics.mean(row["metrics"]["filled"] for row in stage), 1),
                       "meanColors": round(statistics.mean(row["metrics"]["colors"] for row in stage), 2),
                       "meanMismatch": round(statistics.mean(row["metrics"]["mismatch"] for row in stage), 4),
                       "meanBeansPerSecond": round(statistics.mean(row["metrics"]["beansPerSecond"] for row in stage), 4)})
    return result


def write_output(args: argparse.Namespace, reference: list[dict[str, Any]], candidates: list[dict[str, Any]],
                 selected: list[dict[str, Any]], peak_positions: list[int]) -> None:
    if args.output.exists() and any(args.output.iterdir()) and not args.replace:
        raise FileExistsError(f"new output directory is not empty: {args.output}")
    args.output.mkdir(parents=True, exist_ok=True)
    if args.replace:
        for path in args.output.iterdir():
            if not path.is_file():
                raise IsADirectoryError(f"refusing to replace nested path: {path}")
            path.unlink()
    source_paths = [candidate["path"] for candidate in candidates]
    digest = source_digest(source_paths)
    manifest_rows = []
    for row in selected:
        output_level = dict(row["candidate"]["level"])
        output_level["levelId"] = row["order"]
        output_path = args.output / row["outputFile"]
        output_path.write_text(json.dumps(output_level, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        clean = {key: value for key, value in row.items() if key != "candidate"}
        clean["sourceSha256"] = sha256(row["candidate"]["path"])
        clean["outputSha256"] = sha256(output_path)
        manifest_rows.append(clean)
    category_counts = dict(Counter(row["category"] for row in manifest_rows))
    tier_counts = dict(Counter(row["pressureTier"] for row in manifest_rows))
    relief_positions = [position + 1 for position in peak_positions]
    summary = {"count": 300, "sourceCorpusCount": len(candidates), "sourceCorpusDigest": digest,
               "categoryCounts": category_counts, "tierCounts": tier_counts,
               "peakPositions": peak_positions, "reliefPositions": relief_positions,
               "showcasePositions": list(SHOWCASE_POSITIONS), "stages": stage_summaries(manifest_rows),
               "difficultyBoundary": "配置代理指标，不代表真实玩家通过率或失败率"}
    manifest = {"methodVersion": 1, "method": "DBT-paced latest mini-game selection",
                "reference": "tools/dbt/dbt-level-design-report.html", "source": "assets/LevelData",
                "output": str(args.output.relative_to(ROOT)), "featureWeights": FEATURES,
                "summary": summary, "levels": manifest_rows}
    (args.output / "selection_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    source_ids = ", ".join(str(row["sourceId"]) for row in manifest_rows)
    report = ["# 最新小游戏正式 300 关筛选报告", "", "## 结论", "",
              "已从 1643 个源关卡中选择 300 个非重复图案，采用 DBT 八类设计、四档压力与尖峰后泄压节奏。",
              "难度均为配置代理指标；当前没有真实玩家通过率、失败次数、平均耗时或道具使用数据。", "",
              "## 分布", "", f"- 八类：`{json.dumps(category_counts, ensure_ascii=False)}`",
              f"- 四档：`{json.dumps(tier_counts, ensure_ascii=False)}`",
              f"- 尖峰位置：{', '.join(map(str, peak_positions))}",
              f"- 恢复位置：{', '.join(map(str, relief_positions))}",
              f"- 强视觉展示位：{', '.join(map(str, SHOWCASE_POSITIONS))}", "", "## 阶段均值", ""]
    for stage in summary["stages"]:
        report.append(f"- {stage['range']} {stage['name']}：体量 {stage['meanFilled']}，颜色 {stage['meanColors']}，错位 {stage['meanMismatch']}，豆/秒 {stage['meanBeansPerSecond']}")
    report.extend(["", "## 300 个源编号", "", source_ids, "", "## 验证边界", "",
                   "结构、库存、轮廓、确定性与配置节奏可静态验证；真实失败率、乐趣、短视频传播效果和商业化表现仍需玩家数据与运行时 A/B 测试。", ""])
    (args.output / "selection_report.md").write_text("\n".join(report), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def main() -> None:
    args = parse_args()
    reference = json.loads(args.reference.read_text(encoding="utf-8"))["levels"]
    candidates = load_candidates(args.source)
    if len(candidates) != 1643:
        raise ValueError(f"expected 1643 source levels, got {len(candidates)}")
    selected, peaks = select(reference, candidates)
    write_output(args, reference, candidates, selected, peaks)


if __name__ == "__main__":
    main()
