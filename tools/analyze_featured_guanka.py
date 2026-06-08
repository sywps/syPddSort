#!/usr/bin/env python3
"""Analyze featured levels in guanka using the classification report."""

from __future__ import annotations

import argparse
import csv
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze guanka levels marked isFeatured=true.")
    parser.add_argument("--guanka-dir", default="guanka")
    parser.add_argument(
        "--classification",
        default="tools/generated_levels/guanka_level_classification.json",
    )
    parser.add_argument("--output-dir", default="tools/generated_levels")
    parser.add_argument("--prefix", default="guanka_featured_analysis")
    return parser.parse_args()


def iter_level_files(guanka_dir: Path) -> Iterable[Path]:
    return sorted(
        guanka_dir.glob("level_*.json"),
        key=lambda path: int(path.stem.split("_")[1]),
    )


def read_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def safe_mean(values: List[float]) -> float:
    return round(statistics.mean(values), 4) if values else 0.0


def safe_median(values: List[float]) -> float:
    return round(statistics.median(values), 4) if values else 0.0


def percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * p)))
    return round(ordered[idx], 4)


def load_classification(path: Path) -> Dict[int, Dict[str, object]]:
    payload = read_json(path)
    return {int(row["levelId"]): row for row in payload["levels"]}


def load_featured_levels(
    guanka_dir: Path,
    classification_by_id: Dict[int, Dict[str, object]],
) -> tuple[List[Dict[str, object]], List[int], int]:
    featured: List[Dict[str, object]] = []
    explicit_false: List[int] = []
    total = 0
    for path in iter_level_files(guanka_dir):
        total += 1
        level_id = int(path.stem.split("_")[1])
        payload = read_json(path)
        if payload.get("isFeatured") is True:
            row = dict(classification_by_id.get(level_id, {}))
            row.setdefault("levelId", level_id)
            row.setdefault("file", str(path))
            row["isFeatured"] = True
            featured.append(row)
        elif "isFeatured" in payload and payload.get("isFeatured") is False:
            explicit_false.append(level_id)
    return featured, explicit_false, total


def bucket_level_id(level_id: int) -> str:
    if level_id >= 100001:
        return "100001+"
    start = ((level_id - 1) // 100) * 100 + 1
    end = start + 99
    return f"{start}-{end}"


def summarize_rows(rows: List[Dict[str, object]]) -> Dict[str, object]:
    numeric_fields = [
        "width",
        "height",
        "filled",
        "colors",
        "timeLimit",
        "displacementRatio",
        "secPerCell",
        "complexityScore",
        "colorComponents",
        "holes",
        "horizontalSymmetry",
        "verticalSymmetry",
    ]
    summary: Dict[str, object] = {}
    for field in numeric_fields:
        values = [
            float(row[field])
            for row in rows
            if row.get(field) is not None and isinstance(row.get(field), (int, float))
        ]
        summary[field] = {
            "avg": safe_mean(values),
            "median": safe_median(values),
            "p25": percentile(values, 0.25),
            "p75": percentile(values, 0.75),
            "min": round(min(values), 4) if values else 0,
            "max": round(max(values), 4) if values else 0,
        }
    return summary


def counter(rows: List[Dict[str, object]], field: str) -> Dict[str, int]:
    counts = Counter(str(row.get(field, "")) for row in rows)
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def pick_representatives(rows: List[Dict[str, object]]) -> Dict[str, List[Dict[str, object]]]:
    def brief(row: Dict[str, object]) -> Dict[str, object]:
        return {
            "levelId": row.get("levelId"),
            "generatedName": row.get("generatedName"),
            "category": row.get("category"),
            "difficultyTier": row.get("difficultyTier"),
            "filled": row.get("filled"),
            "colors": row.get("colors"),
            "complexityScore": row.get("complexityScore"),
            "displacementRatio": row.get("displacementRatio"),
            "secPerCell": row.get("secPerCell"),
        }

    return {
        "hardest": [
            brief(row)
            for row in sorted(rows, key=lambda item: float(item.get("complexityScore") or 0), reverse=True)[:15]
        ],
        "largest": [
            brief(row)
            for row in sorted(rows, key=lambda item: int(item.get("filled") or 0), reverse=True)[:15]
        ],
        "lowPressure": [
            brief(row)
            for row in sorted(rows, key=lambda item: float(item.get("complexityScore") or 0))[:15]
        ],
        "highestDisplacement": [
            brief(row)
            for row in sorted(rows, key=lambda item: float(item.get("displacementRatio") or 0), reverse=True)[:15]
        ],
    }


def build_report(
    featured: List[Dict[str, object]],
    explicit_false: List[int],
    total: int,
) -> Dict[str, object]:
    by_range: Dict[str, int] = defaultdict(int)
    for row in featured:
        by_range[bucket_level_id(int(row["levelId"]))] += 1

    rows_by_category: Dict[str, List[Dict[str, object]]] = defaultdict(list)
    for row in featured:
        rows_by_category[str(row.get("category"))].append(row)

    category_details = {}
    for category, rows in sorted(rows_by_category.items(), key=lambda item: (-len(item[1]), item[0])):
        category_details[category] = {
            "count": len(rows),
            "avgFilled": safe_mean([float(row.get("filled") or 0) for row in rows]),
            "avgComplexity": safe_mean([float(row.get("complexityScore") or 0) for row in rows]),
            "examples": [
                {
                    "levelId": row.get("levelId"),
                    "generatedName": row.get("generatedName"),
                    "difficultyTier": row.get("difficultyTier"),
                    "filled": row.get("filled"),
                    "colors": row.get("colors"),
                }
                for row in rows[:8]
            ],
        }

    return {
        "totalLevels": total,
        "featuredCount": len(featured),
        "featuredRate": round(len(featured) / total, 4) if total else 0,
        "explicitFalseCount": len(explicit_false),
        "explicitFalseLevels": explicit_false,
        "metrics": summarize_rows(featured),
        "byCategory": counter(featured, "category"),
        "byDifficulty": counter(featured, "difficultyTier"),
        "byRange": dict(sorted(by_range.items(), key=lambda item: item[0])),
        "categoryDetails": category_details,
        "representatives": pick_representatives(featured),
    }


def write_csv(path: Path, rows: List[Dict[str, object]]) -> None:
    fields = [
        "levelId",
        "generatedName",
        "category",
        "difficultyTier",
        "complexityScore",
        "width",
        "height",
        "filled",
        "colors",
        "timeLimit",
        "displacementRatio",
        "secPerCell",
        "colorComponents",
        "holes",
        "horizontalSymmetry",
        "verticalSymmetry",
        "file",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for row in sorted(rows, key=lambda item: int(item["levelId"])):
            writer.writerow({field: row.get(field) for field in fields})


def markdown_table(rows: List[Dict[str, object]]) -> List[str]:
    lines = ["| 关卡 | 名称 | 分类 | 难度 | 豆豆 | 颜色 | 分数 |", "|---:|---|---|---|---:|---:|---:|"]
    for row in rows:
        lines.append(
            f"| {row.get('levelId')} | {row.get('generatedName')} | {row.get('category')} | "
            f"{row.get('difficultyTier')} | {row.get('filled')} | {row.get('colors')} | "
            f"{row.get('complexityScore')} |"
        )
    return lines


def write_markdown(path: Path, report: Dict[str, object], featured: List[Dict[str, object]]) -> None:
    metrics = report["metrics"]
    reps = report["representatives"]
    lines = [
        "# Guanka 精选关卡分析",
        "",
        f"- 总关卡数：{report['totalLevels']}",
        f"- 精选关卡数：{report['featuredCount']}",
        f"- 精选占比：{report['featuredRate']:.2%}",
        f"- 显式取消精选数：{report['explicitFalseCount']}",
        "",
        "## 核心指标",
        "",
        f"- 豆豆数：中位 {metrics['filled']['median']}，平均 {metrics['filled']['avg']}，范围 {metrics['filled']['min']} - {metrics['filled']['max']}",
        f"- 颜色数：中位 {metrics['colors']['median']}，平均 {metrics['colors']['avg']}，范围 {metrics['colors']['min']} - {metrics['colors']['max']}",
        f"- 位移率：中位 {metrics['displacementRatio']['median']}，平均 {metrics['displacementRatio']['avg']}",
        f"- 难度分数：中位 {metrics['complexityScore']['median']}，平均 {metrics['complexityScore']['avg']}",
        f"- 每豆秒数：中位 {metrics['secPerCell']['median']}，平均 {metrics['secPerCell']['avg']}",
        "",
        "## 分类分布",
        "",
    ]
    for category, count in report["byCategory"].items():
        lines.append(f"- {category}: {count}")
    lines += ["", "## 难度分布", ""]
    for tier, count in report["byDifficulty"].items():
        lines.append(f"- {tier}: {count}")
    lines += ["", "## 编号段分布", ""]
    for bucket, count in report["byRange"].items():
        lines.append(f"- {bucket}: {count}")

    lines += ["", "## 最高难度精选", ""]
    lines.extend(markdown_table(reps["hardest"][:10]))
    lines += ["", "## 最大体量精选", ""]
    lines.extend(markdown_table(reps["largest"][:10]))
    lines += ["", "## 低压精选", ""]
    lines.extend(markdown_table(reps["lowPressure"][:10]))

    lines += ["", "## 分类代表", ""]
    for category, detail in report["categoryDetails"].items():
        lines.append(f"### {category}")
        for row in detail["examples"]:
            lines.append(
                f"- level_{row['levelId']}: {row['generatedName']} "
                f"({row['difficultyTier']}, {row['filled']} 豆, {row['colors']} 色)"
            )
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    classification = load_classification(Path(args.classification))
    featured, explicit_false, total = load_featured_levels(Path(args.guanka_dir), classification)
    report = build_report(featured, explicit_false, total)

    output_dir = Path(args.output_dir)
    json_path = output_dir / f"{args.prefix}.json"
    csv_path = output_dir / f"{args.prefix}.csv"
    md_path = output_dir / f"{args.prefix}.md"
    write_json(json_path, {"summary": report, "levels": sorted(featured, key=lambda row: int(row["levelId"]))})
    write_csv(csv_path, featured)
    write_markdown(md_path, report, featured)

    print(
        json.dumps(
            {
                "totalLevels": total,
                "featuredCount": len(featured),
                "featuredRate": report["featuredRate"],
                "json": str(json_path),
                "csv": str(csv_path),
                "markdown": str(md_path),
                "byCategory": report["byCategory"],
                "byDifficulty": report["byDifficulty"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
