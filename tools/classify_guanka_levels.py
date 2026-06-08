#!/usr/bin/env python3
"""Classify guanka levels by generated visual names and pattern categories."""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

Grid = List[List[int]]
Point = Tuple[int, int]

ANIMAL_CN = {
    "cat": "猫咪",
    "bear": "小熊",
    "bunny": "兔子",
    "fox": "狐狸",
    "panda": "熊猫",
    "chick": "小鸡",
    "puppy": "小狗",
    "piglet": "小猪",
    "koala": "考拉",
    "raccoon": "浣熊",
    "penguin": "企鹅",
    "butterfly": "蝴蝶",
    "bunny_scooter": "滑板车兔子",
}

STYLE_CN = {
    "monarch": "帝王蝶",
    "pastel": "粉彩",
    "jewel": "宝石",
    "sunset": "夕阳",
    "garden": "花园",
    "reference_image": "参考图临摹",
}

SPECIAL_META = {
    100016: {"animal": "butterfly", "style": "garden"},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Classify guanka level JSON files.")
    parser.add_argument("--input-dir", default="guanka")
    parser.add_argument("--output-dir", default="tools/generated_levels")
    parser.add_argument("--prefix", default="guanka_level_classification")
    return parser.parse_args()


def read_level(path: Path) -> Dict[str, object]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def iter_level_files(input_dir: Path) -> Iterable[Path]:
    return sorted(
        input_dir.glob("level_*.json"),
        key=lambda path: int(path.stem.split("_")[1]),
    )


def color_counts(grid: Grid) -> Counter:
    counts: Counter = Counter()
    for row in grid:
        for value in row:
            if value > 0:
                counts[value] += 1
    return counts


def displacement_ratio(correct: Grid, init: Grid) -> float:
    total = 0
    moved = 0
    for row, line in enumerate(correct):
        for col, value in enumerate(line):
            if value <= 0:
                continue
            total += 1
            if row >= len(init) or col >= len(init[row]) or init[row][col] != value:
                moved += 1
    return 0.0 if total == 0 else moved / total


def bbox(grid: Grid) -> Tuple[int, int, int, int] | None:
    points = [
        (row, col)
        for row, line in enumerate(grid)
        for col, value in enumerate(line)
        if value > 0
    ]
    if not points:
        return None
    rows = [point[0] for point in points]
    cols = [point[1] for point in points]
    return min(rows), min(cols), max(rows), max(cols)


def neighbor4(point: Point, height: int, width: int) -> Iterable[Point]:
    row, col = point
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nr, nc = row + dr, col + dc
        if 0 <= nr < height and 0 <= nc < width:
            yield nr, nc


def component_count(grid: Grid, same_color: bool) -> int:
    if not grid or not grid[0]:
        return 0
    height = len(grid)
    width = len(grid[0])
    seen: set[Point] = set()
    count = 0
    for row in range(height):
        for col in range(width):
            if grid[row][col] <= 0 or (row, col) in seen:
                continue
            count += 1
            color = grid[row][col]
            stack = [(row, col)]
            seen.add((row, col))
            while stack:
                point = stack.pop()
                for nr, nc in neighbor4(point, height, width):
                    if (nr, nc) in seen or grid[nr][nc] <= 0:
                        continue
                    if same_color and grid[nr][nc] != color:
                        continue
                    seen.add((nr, nc))
                    stack.append((nr, nc))
    return count


def enclosed_holes(grid: Grid, box: Tuple[int, int, int, int] | None) -> int:
    if box is None:
        return 0
    top, left, bottom, right = box
    seen: set[Point] = set()
    holes = 0
    for row in range(top, bottom + 1):
        for col in range(left, right + 1):
            if grid[row][col] > 0 or (row, col) in seen:
                continue
            stack = [(row, col)]
            seen.add((row, col))
            touches_edge = False
            while stack:
                cr, cc = stack.pop()
                if cr in (top, bottom) or cc in (left, right):
                    touches_edge = True
                for nr, nc in neighbor4((cr, cc), len(grid), len(grid[0])):
                    if nr < top or nr > bottom or nc < left or nc > right:
                        continue
                    if grid[nr][nc] > 0 or (nr, nc) in seen:
                        continue
                    seen.add((nr, nc))
                    stack.append((nr, nc))
            if not touches_edge:
                holes += 1
    return holes


def mask_symmetry(grid: Grid, box: Tuple[int, int, int, int] | None, axis: str) -> float:
    if box is None:
        return 0.0
    top, left, bottom, right = box
    matches = 0
    total = 0
    for row in range(top, bottom + 1):
        for col in range(left, right + 1):
            mirror_row = bottom - (row - top) if axis == "vertical" else row
            mirror_col = right - (col - left) if axis == "horizontal" else col
            a = grid[row][col] > 0
            b = grid[mirror_row][mirror_col] > 0
            matches += 1 if a == b else 0
            total += 1
    return 0.0 if total == 0 else matches / total


def projection_variation(grid: Grid) -> Tuple[float, float]:
    if not grid or not grid[0]:
        return 0.0, 0.0
    rows = [sum(1 for value in line if value > 0) for line in grid]
    cols = [sum(1 for row in grid if row[col] > 0) for col in range(len(grid[0]))]
    return coefficient_variation(rows), coefficient_variation(cols)


def coefficient_variation(values: List[int]) -> float:
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    if mean <= 0:
        return 0.0
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return math.sqrt(variance) / mean


def complexity_score(
    filled: int,
    colors: int,
    displacement: float,
    color_components: int,
    sec_per_cell: float | None,
) -> float:
    if filled <= 0:
        return 0.0
    score = 0.0
    score += min(45.0, math.log2(filled + 1) * 4.0)
    score += min(20.0, colors * 1.8)
    score += min(15.0, displacement * 15.0)
    score += min(15.0, color_components / max(filled, 1) * 100.0)
    if sec_per_cell is not None:
        if sec_per_cell < 0.2:
            score += 15.0
        elif sec_per_cell < 0.4:
            score += 10.0
        elif sec_per_cell < 0.65:
            score += 5.0
    return round(score, 2)


def difficulty_tier(score: float, filled: int) -> str:
    if filled <= 0:
        return "异常"
    if score < 35:
        return "入门"
    if score < 50:
        return "简单"
    if score < 65:
        return "普通"
    if score < 78:
        return "困难"
    if score < 90:
        return "专家"
    return "超高压"


def pattern_category(features: Dict[str, object], payload: Dict[str, object]) -> str:
    animal = features.get("animal") or payload.get("animal")
    style = features.get("style") or payload.get("style")
    filled = int(features["filled"])
    colors = int(features["colors"])
    fill_rate = float(features["fillRate"])
    bbox_aspect = float(features["bboxAspect"])
    horizontal_symmetry = float(features["horizontalSymmetry"])
    vertical_symmetry = float(features["verticalSymmetry"])
    holes = int(features["holes"])
    shape_components = int(features["shapeComponents"])
    color_components = int(features["colorComponents"])

    if filled == 0:
        return "异常/空关"
    if filled < 20:
        return "异常/极小图案"
    if animal == "butterfly" or style in {"monarch", "pastel", "jewel", "sunset", "garden"}:
        return "动物/蝴蝶"
    if animal:
        return "动物/卡通动物"
    if holes >= 2 and horizontal_symmetry > 0.82:
        return "纹样/镂空图腾"
    if holes >= 1:
        return "纹样/环形纹章"
    if horizontal_symmetry > 0.9 and vertical_symmetry > 0.86:
        return "纹样/双轴对称图腾"
    if horizontal_symmetry > 0.9:
        return "纹样/左右对称徽章"
    if bbox_aspect >= 1.75:
        return "构图/横幅长卷"
    if bbox_aspect <= 0.58:
        return "构图/竖幅立像"
    if shape_components >= 10:
        return "纹样/多物件散点"
    if color_components >= max(80, filled * 0.18):
        return "纹样/碎色马赛克"
    if fill_rate >= 0.86:
        return "构图/满版色块"
    if colors <= 3 and filled < 120:
        return "图标/极简图标"
    if colors <= 5:
        return "图标/简笔轮廓"
    return "图案/普通拼豆图"


def generated_name(features: Dict[str, object], payload: Dict[str, object]) -> str:
    category = str(features["category"])
    filled = int(features["filled"])
    colors = int(features["colors"])
    bbox_aspect = float(features["bboxAspect"])
    horizontal_symmetry = float(features["horizontalSymmetry"])
    vertical_symmetry = float(features["verticalSymmetry"])
    holes = int(features["holes"])
    fill_rate = float(features["fillRate"])

    animal = features.get("animal") or payload.get("animal")
    style = features.get("style") or payload.get("style")
    if animal:
        animal_name = ANIMAL_CN.get(str(animal), str(animal))
        style_name = STYLE_CN.get(str(style), "") if style else ""
        if animal == "butterfly" and style_name:
            return f"{style_name}蝴蝶"
        if style_name:
            return f"{style_name}{animal_name}"
        return f"卡通{animal_name}"

    if filled == 0:
        return "空白异常关"
    if filled < 20:
        return "极小点阵图"

    size_word = "小型"
    if filled >= 1800:
        size_word = "超大型"
    elif filled >= 900:
        size_word = "大型"
    elif filled >= 350:
        size_word = "中型"

    color_word = "单色" if colors <= 1 else "双色" if colors == 2 else "多色"
    if colors >= 9:
        color_word = "高彩"

    if "镂空图腾" in category:
        base = "镂空对称图腾"
    elif "环形纹章" in category:
        base = "环形纹章"
    elif "双轴对称" in category:
        base = "双轴对称图腾"
    elif "左右对称" in category:
        base = "左右对称徽章"
    elif "横幅长卷" in category:
        base = "横幅长卷"
    elif "竖幅立像" in category:
        base = "竖幅立像"
    elif "多物件散点" in category:
        base = "散点组合图"
    elif "碎色马赛克" in category:
        base = "碎色拼贴图"
    elif "满版色块" in category:
        base = "满版色块图"
    elif "极简图标" in category:
        base = "极简图标"
    elif "简笔轮廓" in category:
        base = "简笔轮廓"
    else:
        if holes > 0:
            base = "镂空拼豆图"
        elif horizontal_symmetry > 0.86:
            base = "对称拼豆图"
        elif bbox_aspect > 1.35:
            base = "横向拼豆图"
        elif bbox_aspect < 0.75:
            base = "纵向拼豆图"
        elif fill_rate > 0.75:
            base = "饱满拼豆图"
        else:
            base = "普通拼豆图"

    suffix = ""
    if horizontal_symmetry > 0.9 and vertical_symmetry > 0.86 and "对称" not in base:
        suffix = "（双轴）"
    elif horizontal_symmetry > 0.9 and "对称" not in base:
        suffix = "（左右对称）"

    return f"{size_word}{color_word}{base}{suffix}"


def extract_features(path: Path, payload: Dict[str, object]) -> Dict[str, object]:
    grid = payload["correctColorArr"]
    init = payload.get("initRandomColorArr", grid)
    counts = color_counts(grid)
    width = int(payload.get("boardWidth", len(grid[0]) if grid else 0))
    height = int(payload.get("boardHeight", len(grid)))
    area = width * height
    filled = sum(counts.values())
    box = bbox(grid)
    if box is None:
        bbox_width = bbox_height = bbox_area = 0
        bbox_aspect = 0.0
        bbox_fill_rate = 0.0
    else:
        top, left, bottom, right = box
        bbox_width = right - left + 1
        bbox_height = bottom - top + 1
        bbox_area = bbox_width * bbox_height
        bbox_aspect = bbox_width / bbox_height if bbox_height else 0.0
        bbox_fill_rate = filled / bbox_area if bbox_area else 0.0

    shape_components = component_count(grid, same_color=False) if filled else 0
    color_components = component_count(grid, same_color=True) if filled else 0
    holes = enclosed_holes(grid, box)
    horizontal = mask_symmetry(grid, box, "horizontal")
    vertical = mask_symmetry(grid, box, "vertical")
    row_variation, col_variation = projection_variation(grid)
    displacement = float(payload.get("displacementRatio") or displacement_ratio(grid, init))
    sec_per_cell = None
    time_limit = int(payload.get("timeLimit", 0) or 0)
    if filled > 0 and time_limit > 0:
        sec_per_cell = time_limit / filled
    dominant_share = 0.0 if filled == 0 else max(counts.values()) / filled
    score = complexity_score(filled, len(counts), displacement, color_components, sec_per_cell)

    level_id = int(payload.get("levelId", path.stem.split("_")[1]))
    meta = SPECIAL_META.get(level_id, {})

    features: Dict[str, object] = {
        "levelId": level_id,
        "file": str(path),
        "width": width,
        "height": height,
        "area": area,
        "filled": filled,
        "colors": len(counts),
        "timeLimit": time_limit,
        "fillRate": round(filled / area, 4) if area else 0.0,
        "bboxWidth": bbox_width,
        "bboxHeight": bbox_height,
        "bboxArea": bbox_area,
        "bboxAspect": round(bbox_aspect, 4),
        "bboxFillRate": round(bbox_fill_rate, 4),
        "shapeComponents": shape_components,
        "colorComponents": color_components,
        "holes": holes,
        "horizontalSymmetry": round(horizontal, 4),
        "verticalSymmetry": round(vertical, 4),
        "rowVariation": round(row_variation, 4),
        "colVariation": round(col_variation, 4),
        "dominantShare": round(dominant_share, 4),
        "displacementRatio": round(displacement, 4),
        "secPerCell": round(sec_per_cell, 4) if sec_per_cell is not None else None,
        "complexityScore": score,
        "difficultyTier": difficulty_tier(score, filled),
        "animal": payload.get("animal") or meta.get("animal"),
        "style": payload.get("style") or meta.get("style"),
    }
    features["category"] = pattern_category(features, payload)
    features["generatedName"] = generated_name(features, payload)
    return features


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


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
        "shapeComponents",
        "colorComponents",
        "holes",
        "horizontalSymmetry",
        "verticalSymmetry",
        "fillRate",
        "animal",
        "style",
        "file",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field) for field in fields})


def build_summary(rows: List[Dict[str, object]]) -> Dict[str, object]:
    by_category: Dict[str, int] = defaultdict(int)
    by_difficulty: Dict[str, int] = defaultdict(int)
    by_range: Dict[str, int] = defaultdict(int)
    for row in rows:
        by_category[str(row["category"])] += 1
        by_difficulty[str(row["difficultyTier"])] += 1
        level_id = int(row["levelId"])
        if level_id >= 100001:
            by_range["100001+"] += 1
        else:
            start = ((level_id - 1) // 100) * 100 + 1
            end = start + 99
            by_range[f"{start}-{end}"] += 1
    return {
        "total": len(rows),
        "byCategory": dict(sorted(by_category.items(), key=lambda item: (-item[1], item[0]))),
        "byDifficulty": dict(sorted(by_difficulty.items(), key=lambda item: (-item[1], item[0]))),
        "byRange": dict(sorted(by_range.items(), key=lambda item: item[0])),
        "emptyLevels": [row["levelId"] for row in rows if row["category"] == "异常/空关"],
        "tinyLevels": [row["levelId"] for row in rows if row["category"] == "异常/极小图案"],
    }


def write_markdown(path: Path, rows: List[Dict[str, object]], summary: Dict[str, object]) -> None:
    top_categories = list(summary["byCategory"].items())
    top_difficulties = list(summary["byDifficulty"].items())
    examples_by_category: Dict[str, List[Dict[str, object]]] = defaultdict(list)
    for row in rows:
        category = str(row["category"])
        if len(examples_by_category[category]) < 8:
            examples_by_category[category].append(row)

    lines = [
        "# Guanka 关卡图案命名与分类",
        "",
        f"- 总关卡数：{summary['total']}",
        f"- 空关卡：{summary['emptyLevels']}",
        f"- 极小异常关：{summary['tinyLevels']}",
        "",
        "## 分类统计",
        "",
    ]
    for category, count in top_categories:
        lines.append(f"- {category}: {count}")
    lines += ["", "## 难度统计", ""]
    for tier, count in top_difficulties:
        lines.append(f"- {tier}: {count}")
    lines += ["", "## 分类样例", ""]
    for category, examples in sorted(examples_by_category.items()):
        lines.append(f"### {category}")
        for row in examples:
            lines.append(
                f"- level_{row['levelId']}: {row['generatedName']} "
                f"(难度 {row['difficultyTier']}, 豆豆 {row['filled']}, 颜色 {row['colors']})"
            )
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    rows: List[Dict[str, object]] = []
    for path in iter_level_files(input_dir):
        payload = read_level(path)
        if "correctColorArr" not in payload:
            continue
        rows.append(extract_features(path, payload))

    summary = build_summary(rows)
    json_path = output_dir / f"{args.prefix}.json"
    csv_path = output_dir / f"{args.prefix}.csv"
    md_path = output_dir / f"{args.prefix}_summary.md"
    write_json(json_path, {"summary": summary, "levels": rows})
    write_csv(csv_path, rows)
    write_markdown(md_path, rows, summary)
    print(
        json.dumps(
            {
                "total": len(rows),
                "json": str(json_path),
                "csv": str(csv_path),
                "summary": str(md_path),
                "categories": summary["byCategory"],
                "difficulty": summary["byDifficulty"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
