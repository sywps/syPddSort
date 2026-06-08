#!/usr/bin/env python3
"""Build min-step-based difficulty reference coefficients for guanka and launch planning."""

from __future__ import annotations

import argparse
import bisect
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GUANKA_DIR = ROOT / "guanka"
DEFAULT_CLASSIFICATION = ROOT / "tools" / "generated_levels" / "guanka_level_classification.json"
DEFAULT_SELECTION = ROOT / "tools" / "generated_levels" / "launch_600_selection.json"
DEFAULT_LIBRARY_OUT = ROOT / "tools" / "generated_levels" / "guanka_minstep_coefficients.json"
DEFAULT_SELECTION_OUT = ROOT / "tools" / "generated_levels" / "launch_600_selection_with_minstep.json"
DEFAULT_SUMMARY_OUT = ROOT / "tools" / "generated_levels" / "launch_600_minstep_reference.json"
DEFAULT_MD_OUT = ROOT / "tools" / "generated_levels" / "launch_600_minstep_reference.md"

RAW_WEIGHT = 0.72
DENSITY_WEIGHT = 0.28

TIER_BANDS = (
    (20.0, "教学"),
    (35.0, "偏易"),
    (50.0, "中低"),
    (65.0, "中等"),
    (80.0, "中高"),
    (90.0, "偏难"),
    (96.0, "高压"),
    (101.0, "超高压"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build a min-step-based difficulty reference coefficient for the guanka library "
            "and for the current launch-600 selection."
        )
    )
    parser.add_argument("--guanka-dir", default=str(DEFAULT_GUANKA_DIR))
    parser.add_argument("--classification", default=str(DEFAULT_CLASSIFICATION))
    parser.add_argument("--selection", default=str(DEFAULT_SELECTION))
    parser.add_argument("--library-out", default=str(DEFAULT_LIBRARY_OUT))
    parser.add_argument("--selection-out", default=str(DEFAULT_SELECTION_OUT))
    parser.add_argument("--summary-out", default=str(DEFAULT_SUMMARY_OUT))
    parser.add_argument("--markdown-out", default=str(DEFAULT_MD_OUT))
    return parser.parse_args()


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def iter_level_paths(level_dir: Path) -> Iterable[Path]:
    def level_sort_key(path: Path) -> tuple[int, str]:
        try:
            return int(path.stem.split("_")[1]), path.stem
        except Exception:
            return 10**9, path.stem

    yield from sorted(level_dir.glob("level_*.json"), key=level_sort_key)


def build_classification_index(path: Path) -> Dict[int, Dict[str, object]]:
    if not path.exists():
        return {}
    payload = load_json(path)
    if not isinstance(payload, dict):
        return {}
    rows = payload.get("levels")
    if not isinstance(rows, list):
        return {}
    result: Dict[int, Dict[str, object]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        level_id = row.get("levelId")
        if level_id is None:
            continue
        result[int(level_id)] = row
    return result


def quantile(sorted_values: Sequence[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    q = min(max(q, 0.0), 1.0)
    pos = (len(sorted_values) - 1) * q
    left = int(math.floor(pos))
    right = int(math.ceil(pos))
    if left == right:
        return float(sorted_values[left])
    frac = pos - left
    return float(sorted_values[left] * (1.0 - frac) + sorted_values[right] * frac)


def percentile_rank(sorted_values: Sequence[float], value: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return 50.0
    left = bisect.bisect_left(sorted_values, value)
    right = bisect.bisect_right(sorted_values, value)
    mid = (left + right - 1) / 2.0
    return round(mid * 100.0 / (len(sorted_values) - 1), 2)


def tier_for_coeff(value: float) -> str:
    for upper, label in TIER_BANDS:
        if value < upper:
            return label
    return TIER_BANDS[-1][1]


def safe_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def build_library_rows(
    level_dir: Path,
    classification_index: Dict[int, Dict[str, object]],
) -> List[Dict[str, object]]:
    raw_rows: List[Dict[str, object]] = []
    raw_logs: List[float] = []
    density_logs: List[float] = []

    for path in iter_level_paths(level_dir):
        payload = load_json(path)
        if not isinstance(payload, dict):
            continue
        level_id = safe_int(payload.get("levelId"))
        min_step = payload.get("minStepCount")
        filled = safe_int(payload.get("filledCellCount") or payload.get("slotTotalCount"))
        colors = safe_int(payload.get("colorCount"))
        if min_step is None or filled <= 0:
            continue

        min_step_value = float(min_step)
        density = min_step_value / (filled / 100.0)
        raw_log = math.log1p(min_step_value)
        density_log = math.log1p(density)
        raw_logs.append(raw_log)
        density_logs.append(density_log)

        classification = classification_index.get(level_id, {})
        raw_rows.append(
            {
                "levelId": level_id,
                "file": str(path.relative_to(ROOT)),
                "minStepCount": int(min_step_value),
                "minStepSolver": payload.get("minStepSolver"),
                "filled": filled,
                "colors": colors,
                "timeLimit": safe_int(payload.get("timeLimit")),
                "displacementRatio": round(float(payload.get("displacementRatio") or 0.0), 4),
                "minStepPer100Cells": round(density, 4),
                "rawLog": raw_log,
                "densityLog": density_log,
                "complexityScore": classification.get("complexityScore"),
                "difficultyTier": classification.get("difficultyTier"),
                "category": classification.get("category"),
                "generatedName": classification.get("generatedName"),
            }
        )

    raw_logs.sort()
    density_logs.sort()

    enriched: List[Dict[str, object]] = []
    for row in raw_rows:
        raw_pct = percentile_rank(raw_logs, float(row["rawLog"]))
        density_pct = percentile_rank(density_logs, float(row["densityLog"]))
        coeff = round(raw_pct * RAW_WEIGHT + density_pct * DENSITY_WEIGHT, 2)
        item = dict(row)
        item["minStepCountPct"] = raw_pct
        item["minStepDensityPct"] = density_pct
        item["minStepRefCoeff"] = coeff
        item["minStepRefTier"] = tier_for_coeff(coeff)
        item.pop("rawLog", None)
        item.pop("densityLog", None)
        enriched.append(item)

    enriched.sort(key=lambda item: (float(item["minStepRefCoeff"]), int(item["levelId"])))
    return enriched


def build_library_summary(rows: Sequence[Dict[str, object]]) -> Dict[str, object]:
    coeffs = sorted(float(row["minStepRefCoeff"]) for row in rows)
    steps = sorted(float(row["minStepCount"]) for row in rows)
    densities = sorted(float(row["minStepPer100Cells"]) for row in rows)
    tiers = Counter(str(row["minStepRefTier"]) for row in rows)
    return {
        "count": len(rows),
        "formula": {
            "rawWeight": RAW_WEIGHT,
            "densityWeight": DENSITY_WEIGHT,
            "rawBasis": "log1p(minStepCount) percentile",
            "densityBasis": "log1p(minStepCount / (filledCellCount / 100)) percentile",
            "note": "Use minStepRefCoeff as the planning coefficient; use raw minStepCount only as a secondary absolute load indicator.",
        },
        "quantiles": {
            "minStepCount": {
                "p05": round(quantile(steps, 0.05), 2),
                "p10": round(quantile(steps, 0.10), 2),
                "p25": round(quantile(steps, 0.25), 2),
                "p50": round(quantile(steps, 0.50), 2),
                "p75": round(quantile(steps, 0.75), 2),
                "p90": round(quantile(steps, 0.90), 2),
                "p95": round(quantile(steps, 0.95), 2),
                "max": round(quantile(steps, 1.0), 2),
            },
            "minStepPer100Cells": {
                "p05": round(quantile(densities, 0.05), 2),
                "p10": round(quantile(densities, 0.10), 2),
                "p25": round(quantile(densities, 0.25), 2),
                "p50": round(quantile(densities, 0.50), 2),
                "p75": round(quantile(densities, 0.75), 2),
                "p90": round(quantile(densities, 0.90), 2),
                "p95": round(quantile(densities, 0.95), 2),
                "max": round(quantile(densities, 1.0), 2),
            },
            "minStepRefCoeff": {
                "p05": round(quantile(coeffs, 0.05), 2),
                "p10": round(quantile(coeffs, 0.10), 2),
                "p25": round(quantile(coeffs, 0.25), 2),
                "p50": round(quantile(coeffs, 0.50), 2),
                "p75": round(quantile(coeffs, 0.75), 2),
                "p90": round(quantile(coeffs, 0.90), 2),
                "p95": round(quantile(coeffs, 0.95), 2),
                "max": round(quantile(coeffs, 1.0), 2),
            },
        },
        "tierCounts": dict(tiers),
    }


def enrich_selection(
    selection_path: Path,
    library_index: Dict[int, Dict[str, object]],
) -> Dict[str, object]:
    payload = load_json(selection_path)
    if not isinstance(payload, dict):
        raise ValueError("selection JSON must be an object")
    selection = payload.get("selection")
    if not isinstance(selection, list):
        raise ValueError("selection JSON missing selection list")

    enriched_rows: List[Dict[str, object]] = []
    for row in selection:
        if not isinstance(row, dict):
            continue
        source_level_id = safe_int(row.get("sourceLevelId") or row.get("levelId"))
        lib = library_index.get(source_level_id)
        if lib is None:
            raise ValueError(f"min-step reference missing for level {source_level_id}")
        merged = dict(row)
        merged["minStepCount"] = lib["minStepCount"]
        merged["minStepPer100Cells"] = lib["minStepPer100Cells"]
        merged["minStepCountPct"] = lib["minStepCountPct"]
        merged["minStepDensityPct"] = lib["minStepDensityPct"]
        merged["minStepRefCoeff"] = lib["minStepRefCoeff"]
        merged["minStepRefTier"] = lib["minStepRefTier"]
        enriched_rows.append(merged)

    stage_groups: Dict[str, List[Dict[str, object]]] = defaultdict(list)
    for row in enriched_rows:
        stage_groups[str(row["stageName"])].append(row)

    stage_summaries: List[Dict[str, object]] = []
    for stage_name, rows in sorted(
        stage_groups.items(),
        key=lambda item: min(int(row["launchOrder"]) for row in item[1]),
    ):
        coeffs = sorted(float(row["minStepRefCoeff"]) for row in rows)
        steps = sorted(float(row["minStepCount"]) for row in rows)
        densities = sorted(float(row["minStepPer100Cells"]) for row in rows)
        stage_summaries.append(
            {
                "stageName": stage_name,
                "launchOrderStart": min(int(row["launchOrder"]) for row in rows),
                "launchOrderEnd": max(int(row["launchOrder"]) for row in rows),
                "count": len(rows),
                "coeffWindowRecommended": {
                    "p25": round(quantile(coeffs, 0.25), 2),
                    "p50": round(quantile(coeffs, 0.50), 2),
                    "p75": round(quantile(coeffs, 0.75), 2),
                },
                "coeffWindowGuardrail": {
                    "p10": round(quantile(coeffs, 0.10), 2),
                    "p90": round(quantile(coeffs, 0.90), 2),
                },
                "minStepWindow": {
                    "p25": round(quantile(steps, 0.25), 2),
                    "p50": round(quantile(steps, 0.50), 2),
                    "p75": round(quantile(steps, 0.75), 2),
                },
                "densityWindow": {
                    "p25": round(quantile(densities, 0.25), 2),
                    "p50": round(quantile(densities, 0.50), 2),
                    "p75": round(quantile(densities, 0.75), 2),
                },
                "tierCounts": dict(Counter(str(row["minStepRefTier"]) for row in rows)),
            }
        )

    prev_p25 = 0.0
    prev_p50 = 0.0
    prev_p75 = 0.0
    for stage in stage_summaries:
        raw_window = stage["coeffWindowRecommended"]
        smooth_p25 = round(max(float(raw_window["p25"]), prev_p25), 2)
        smooth_p50 = round(max(float(raw_window["p50"]), smooth_p25, prev_p50), 2)
        smooth_p75 = round(max(float(raw_window["p75"]), smooth_p50, prev_p75), 2)
        stage["coeffWindowSuggested"] = {
            "p25": smooth_p25,
            "p50": smooth_p50,
            "p75": smooth_p75,
        }
        prev_p25 = smooth_p25
        prev_p50 = smooth_p50
        prev_p75 = smooth_p75

    summary = {
        "selectionCount": len(enriched_rows),
        "selectionCoeffAvg": round(statistics.mean(float(row["minStepRefCoeff"]) for row in enriched_rows), 2),
        "selectionCoeffMedian": round(statistics.median(float(row["minStepRefCoeff"]) for row in enriched_rows), 2),
        "selectionMinStepAvg": round(statistics.mean(float(row["minStepCount"]) for row in enriched_rows), 2),
        "selectionMinStepMedian": round(statistics.median(float(row["minStepCount"]) for row in enriched_rows), 2),
        "tierCounts": dict(Counter(str(row["minStepRefTier"]) for row in enriched_rows)),
        "stages": stage_summaries,
    }

    return {
        "profile": payload.get("profile"),
        "originalSummary": payload.get("summary"),
        "minStepReferenceSummary": summary,
        "selection": enriched_rows,
        "alternates": payload.get("alternates"),
    }


def build_markdown(
    library_summary: Dict[str, object],
    selection_summary: Dict[str, object],
) -> str:
    lib_quantiles = library_summary["quantiles"]["minStepRefCoeff"]  # type: ignore[index]
    lines: List[str] = [
        "# 600关最小还原步数难度参考",
        "",
        "## 系数定义",
        "",
        "- `minStepRefCoeff = 0.72 * rawPct + 0.28 * densityPct`",
        "- `rawPct = log1p(minStepCount)` 在全库中的百分位",
        "- `densityPct = log1p(minStepCount / (filledCellCount / 100))` 在全库中的百分位",
        "- 使用建议：排 600 关时优先看 `minStepRefCoeff`，原始 `minStepCount` 只作为绝对体量的辅助参考。",
        "",
        "## 全库分布",
        "",
        f"- 关卡总数：{library_summary['count']}",
        f"- 系数 P10 / P25 / P50 / P75 / P90：{lib_quantiles['p10']} / {lib_quantiles['p25']} / {lib_quantiles['p50']} / {lib_quantiles['p75']} / {lib_quantiles['p90']}",
        "",
        "## 600关分段参考",
        "",
        "| 阶段 | 位置 | 推荐系数窗(平滑P25-P75) | 守门系数窗(P10-P90) | 步数中位 | 密度中位 |",
        "|---|---:|---:|---:|---:|---:|",
    ]

    for stage in selection_summary["stages"]:  # type: ignore[index]
        coeff_window = stage["coeffWindowSuggested"]
        coeff_guardrail = stage["coeffWindowGuardrail"]
        minstep_window = stage["minStepWindow"]
        density_window = stage["densityWindow"]
        lines.append(
            f"| {stage['stageName']} | {stage['launchOrderStart']}-{stage['launchOrderEnd']} | "
            f"{coeff_window['p25']}-{coeff_window['p75']} | "
            f"{coeff_guardrail['p10']}-{coeff_guardrail['p90']} | "
            f"{minstep_window['p50']} | {density_window['p50']} |"
        )

    lines.extend(
        [
            "",
            "## 使用建议",
            "",
            "- 做 600 关排布时，优先把每一段的 `minStepRefCoeff` 控制在推荐窗内。",
            "- 如果某关 `minStepCount` 很高，但 `minStepPer100Cells` 不高，通常是大图体量关，适合放在中后段而不是直接判成尖峰关。",
            "- 如果某关原始步数不算高，但 `minStepPer100Cells` 很高，说明单位体量压力大，前段要谨慎放。",
            "- 真正定稿时，建议把 `minStepRefCoeff` 和现有 `complexityScore` 一起看，不要单独依赖任一指标。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    guanka_dir = Path(args.guanka_dir)
    classification_path = Path(args.classification)
    selection_path = Path(args.selection)
    library_out = Path(args.library_out)
    selection_out = Path(args.selection_out)
    summary_out = Path(args.summary_out)
    markdown_out = Path(args.markdown_out)

    classification_index = build_classification_index(classification_path)
    library_rows = build_library_rows(guanka_dir, classification_index)
    library_summary = build_library_summary(library_rows)
    library_index = {int(row["levelId"]): row for row in library_rows}

    enriched_selection_payload = enrich_selection(selection_path, library_index)
    selection_summary = enriched_selection_payload["minStepReferenceSummary"]

    write_json(
        library_out,
        {
            "summary": library_summary,
            "levels": library_rows,
        },
    )
    write_json(selection_out, enriched_selection_payload)
    write_json(
        summary_out,
        {
            "librarySummary": library_summary,
            "selectionSummary": selection_summary,
        },
    )
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.write_text(build_markdown(library_summary, selection_summary), encoding="utf-8")

    print(
        json.dumps(
            {
                "ok": True,
                "libraryOut": str(library_out),
                "selectionOut": str(selection_out),
                "summaryOut": str(summary_out),
                "markdownOut": str(markdown_out),
                "libraryCount": len(library_rows),
                "selectionCount": selection_summary["selectionCount"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
