#!/usr/bin/env python3
"""Generate a refined guanka level candidate with limited shape drift."""

from __future__ import annotations

import argparse
import colorsys
import json
import math
import random
from collections import Counter, defaultdict, deque
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

from move_target_to_initial import assign_initial_layout, displacement_ratio

Grid = List[List[int]]
Point = Tuple[int, int]

DIRS4: Sequence[Point] = [(-1, 0), (1, 0), (0, -1), (0, 1)]
DIRS8: Sequence[Point] = [
    (-1, 0),
    (1, 0),
    (0, -1),
    (0, 1),
    (-1, -1),
    (-1, 1),
    (1, -1),
    (1, 1),
]

PALETTE_RGB: Dict[int, Tuple[int, int, int]] = {
    1: (0xD7, 0x3D, 0x2B),
    2: (0xEF, 0x91, 0x37),
    3: (0xEE, 0xEC, 0x7C),
    4: (0xAE, 0xD9, 0x3B),
    5: (0xAA, 0xE4, 0xF0),
    6: (0xA5, 0x6F, 0xE2),
    7: (0xFF, 0x98, 0xF3),
    8: (0x9E, 0x72, 0x5A),
    9: (0xFD, 0xF6, 0xE3),
    10: (0x4A, 0x90, 0xD9),
    11: (0x2E, 0xCC, 0x71),
    12: (0xE7, 0x4C, 0x8B),
    13: (0x1A, 0xBC, 0x9C),
    14: (0xF1, 0xC4, 0x0F),
    15: (0x8E, 0x44, 0xAD),
    16: (0xD3, 0x54, 0x00),
    17: (0x27, 0xAE, 0x60),
    18: (0xC0, 0x39, 0x2B),
    19: (0x5D, 0xAD, 0xE2),
    20: (0xF0, 0xB2, 0x7A),
}

# Style priors tuned for a clearer "cute fuse-bead" look:
# darker outline-friendly colors, brighter candy-like fill colors,
# and punchy accent colors with enough contrast.
PALETTE_STYLE_WEIGHTS: Dict[int, Dict[str, float]] = {
    1: {"outline": 0.35, "fill": 0.35, "accent": 0.85, "cute": 0.55},
    2: {"outline": 0.25, "fill": 0.60, "accent": 0.70, "cute": 0.70},
    3: {"outline": 0.05, "fill": 0.78, "accent": 0.65, "cute": 0.78},
    4: {"outline": 0.15, "fill": 0.60, "accent": 0.55, "cute": 0.58},
    5: {"outline": 0.20, "fill": 0.88, "accent": 0.60, "cute": 0.90},
    6: {"outline": 0.45, "fill": 0.45, "accent": 0.60, "cute": 0.52},
    7: {"outline": 0.20, "fill": 0.90, "accent": 0.78, "cute": 0.98},
    8: {"outline": 0.98, "fill": 0.18, "accent": 0.35, "cute": 0.45},
    9: {"outline": 0.10, "fill": 0.82, "accent": 0.55, "cute": 0.74},
    10: {"outline": 0.72, "fill": 0.55, "accent": 0.45, "cute": 0.62},
    11: {"outline": 0.22, "fill": 0.86, "accent": 0.62, "cute": 0.88},
    12: {"outline": 0.42, "fill": 0.72, "accent": 0.90, "cute": 0.90},
    13: {"outline": 0.38, "fill": 0.45, "accent": 0.55, "cute": 0.58},
    14: {"outline": 0.12, "fill": 0.80, "accent": 0.82, "cute": 0.82},
    15: {"outline": 0.94, "fill": 0.18, "accent": 0.52, "cute": 0.36},
    16: {"outline": 0.78, "fill": 0.22, "accent": 0.55, "cute": 0.40},
    17: {"outline": 0.35, "fill": 0.58, "accent": 0.48, "cute": 0.55},
    18: {"outline": 0.72, "fill": 0.28, "accent": 0.86, "cute": 0.56},
    19: {"outline": 0.32, "fill": 0.78, "accent": 0.52, "cute": 0.78},
    20: {"outline": 0.10, "fill": 0.84, "accent": 0.78, "cute": 0.94},
}

NEAR_COLOR_PAIR_PENALTIES: Dict[frozenset[int], float] = {
    frozenset((1, 18)): 120.0,  # red / crimson
    frozenset((2, 20)): 60.0,   # orange / peach
    frozenset((3, 14)): 40.0,   # yellow / gold
    frozenset((4, 17)): 75.0,   # lime / emerald
    frozenset((5, 19)): 70.0,   # light blue / steel blue
    frozenset((6, 15)): 70.0,   # violet / indigo
    frozenset((7, 12)): 90.0,   # pink / magenta
    frozenset((10, 19)): 45.0,  # ocean blue / steel blue
    frozenset((11, 13)): 45.0,  # mint / teal
}

DEFAULT_INSTRUCTION_PROMPT = """请对选中的 guanka 关卡进行批量微调，目标是“优先提升配色表现，其次做极小幅度形状优化”。

要求如下：
1. 配色优先优化：明显提升图案辨识度，让主体更像原始对象；提升画面生动感、层次感和质感；避免使用过于相近、难区分的颜色；优先使用更符合当前主流拼豆豆风格的配色；优先强化主体边缘、五官、关键轮廓、转折处、受光面和阴影面。
2. 风格方向：结果要更像市场上流行的拼豆豆作品风格，形象明确、颜色讨喜、视觉更精致、更有完成度；可以增加少量更合理的明暗过渡和材质感，但不能失真。
3. 形状控制：形状只能做微调，整体形状改变度必须控制在 5% 以内；保留原关卡主体轮廓、比例、姿态和识别特征；仅允许做小范围修边、补缺口、去毛刺、圆润轮廓、增强关键结构的微调；如果配色优化已经足够，就尽量少动形状。
4. 调整原则：配色改动应明显大于形状改动；优先解决颜色接近、主体不突出、层次不足、质感不够、看起来不像的问题；调整后要更自然、更完整、更精致，不要引入无意义噪点。
5. 输出目标：生成适合直接落到 guanka 的优化结果，在“更像、更生动、更有质感、更符合流行拼豆豆风格”和“形状变化 <= 5%”之间取得平衡。"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Refine a guanka level by improving palette assignment and making "
            "small shape edits under a change budget."
        )
    )
    parser.add_argument("input", help="Input level JSON.")
    parser.add_argument("--seed", type=int, help="Base random seed.")
    parser.add_argument(
        "--shape-budget-pct",
        type=float,
        default=5.0,
        help="Maximum percent of filled cells allowed to change mask state.",
    )
    parser.add_argument(
        "--shuffle-attempts",
        type=int,
        default=16,
        help="Number of initial shuffle attempts. Closest displacement ratio wins.",
    )
    parser.add_argument(
        "--max-groups-per-color",
        type=int,
        default=4,
        help="Upper bound for clustered initial regions per color.",
    )
    parser.add_argument(
        "--output",
        help="Optional output path. Defaults to stdout-only preview mode.",
    )
    parser.add_argument(
        "--instruction-prompt",
        default=DEFAULT_INSTRUCTION_PROMPT,
        help="Optional refinement prompt used to tune palette/shape heuristics.",
    )
    return parser.parse_args()


def load_payload(path: Path) -> Dict[str, object]:
    with path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    if "correctColorArr" not in payload:
        raise ValueError(f"{path} does not contain correctColorArr")
    return payload


def validate_grid(grid: Grid) -> Tuple[int, int]:
    if not grid or not grid[0]:
        raise ValueError("correctColorArr is empty")
    width = len(grid[0])
    for row in grid:
        if len(row) != width:
            raise ValueError("correctColorArr rows must all have the same width")
    return width, len(grid)


def prompt_signal_score(text: str, keywords: Sequence[str], cap: int = 4) -> float:
    if not text:
        return 0.0
    hits = sum(1 for keyword in keywords if keyword in text)
    return min(1.0, hits / max(1, cap))


def build_instruction_profile(prompt_text: str, shape_budget_pct: float) -> Dict[str, float | bool | str]:
    normalized = " ".join(str(prompt_text or "").strip().split())
    color_priority = max(
        0.25,
        prompt_signal_score(
            normalized,
            ("配色", "颜色", "调色", "色彩", "主体", "轮廓", "边缘", "关键结构"),
        ),
    )
    avoid_near = prompt_signal_score(
        normalized,
        ("相近色", "近似色", "低对比", "难区分", "邻接配色", "颜色接近"),
    )
    likeness = prompt_signal_score(
        normalized,
        ("更像", "像原始对象", "像原对象", "还原", "辨识度", "识别特征", "形象"),
    )
    vividness = prompt_signal_score(
        normalized,
        ("生动", "鲜活", "明快", "层次", "高光", "阴影", "受光", "发灰", "发闷"),
    )
    texture = prompt_signal_score(
        normalized,
        ("质感", "材质", "精致", "完成度", "细腻", "成熟图稿", "可售卖"),
    )
    cute_style = prompt_signal_score(
        normalized,
        ("可爱", "萌", "讨喜", "拼豆", "拼豆豆", "流行", "市场", "主流", "风格"),
    )
    structure_preserve = prompt_signal_score(
        normalized,
        ("5%", "少动形状", "形状变化", "微调", "小范围", "保留", "禁止大改", "不要大改", "轮廓"),
    )

    effective_shape_budget = min(max(0.0, float(shape_budget_pct)), 5.0)
    reduction = min(0.55, color_priority * 0.12 + structure_preserve * 0.18 + likeness * 0.10)
    effective_shape_budget = max(0.0, effective_shape_budget * (1.0 - reduction))
    if structure_preserve >= 0.7:
        effective_shape_budget = min(effective_shape_budget, 3.8)
    if color_priority >= 0.8:
        effective_shape_budget = min(effective_shape_budget, 3.2)

    return {
        "promptText": normalized,
        "promptApplied": bool(normalized),
        "colorPriority": round(color_priority, 4),
        "avoidNearColors": round(avoid_near, 4),
        "likeness": round(likeness, 4),
        "vividness": round(vividness, 4),
        "texture": round(texture, 4),
        "cuteStyle": round(cute_style, 4),
        "structurePreserve": round(structure_preserve, 4),
        "effectiveShapeBudgetPct": round(effective_shape_budget, 4),
    }


def count_colors(grid: Grid) -> Dict[str, int]:
    stats = Counter(value for row in grid for value in row if value > 0)
    return {str(color_id): stats[color_id] for color_id in sorted(stats)}


def derive_seed(payload: Dict[str, object], explicit_seed: int | None) -> int:
    if explicit_seed is not None:
        return explicit_seed
    level_id = int(payload.get("levelId", 0) or 0)
    return 20260424 + level_id * 6151


def filled_points(grid: Grid) -> List[Point]:
    cells: List[Point] = []
    for row, line in enumerate(grid):
        for col, value in enumerate(line):
            if value > 0:
                cells.append((row, col))
    return cells


def inside(height: int, width: int, row: int, col: int) -> bool:
    return 0 <= row < height and 0 <= col < width


def build_mask(grid: Grid) -> List[List[bool]]:
    return [[value > 0 for value in row] for row in grid]


def filled_count(grid: Grid) -> int:
    return sum(1 for row in grid for value in row if value > 0)


def neighbor_count(mask: List[List[bool]], row: int, col: int, dirs: Sequence[Point]) -> int:
    height = len(mask)
    width = len(mask[0])
    total = 0
    for dr, dc in dirs:
        nr = row + dr
        nc = col + dc
        if inside(height, width, nr, nc) and mask[nr][nc]:
            total += 1
    return total


def boundary_cells(mask: List[List[bool]]) -> List[Point]:
    height = len(mask)
    width = len(mask[0])
    result: List[Point] = []
    for row in range(height):
        for col in range(width):
            if not mask[row][col]:
                continue
            for dr, dc in DIRS4:
                nr = row + dr
                nc = col + dc
                if not inside(height, width, nr, nc) or not mask[nr][nc]:
                    result.append((row, col))
                    break
    return result


def compute_depth(mask: List[List[bool]]) -> List[List[int]]:
    height = len(mask)
    width = len(mask[0])
    depth = [[-1 for _ in range(width)] for _ in range(height)]
    q: deque[Point] = deque()
    for row, col in boundary_cells(mask):
        depth[row][col] = 0
        q.append((row, col))

    while q:
        row, col = q.popleft()
        for dr, dc in DIRS4:
            nr = row + dr
            nc = col + dc
            if not inside(height, width, nr, nc) or not mask[nr][nc]:
                continue
            if depth[nr][nc] != -1:
                continue
            depth[nr][nc] = depth[row][col] + 1
            q.append((nr, nc))
    return depth


def local_hole_bonus(mask: List[List[bool]], row: int, col: int) -> int:
    height = len(mask)
    width = len(mask[0])
    left = col - 1 >= 0 and mask[row][col - 1]
    right = col + 1 < width and mask[row][col + 1]
    up = row - 1 >= 0 and mask[row - 1][col]
    down = row + 1 < height and mask[row + 1][col]
    diag = neighbor_count(mask, row, col, DIRS8)
    bonus = 0
    if left and right:
        bonus += 3
    if up and down:
        bonus += 3
    if diag >= 6:
        bonus += 4
    return bonus


def square_support(mask: List[List[bool]], row: int, col: int) -> int:
    height = len(mask)
    width = len(mask[0])
    best = 0
    for base_row in (row - 1, row):
        for base_col in (col - 1, col):
            if base_row < 0 or base_col < 0 or base_row + 1 >= height or base_col + 1 >= width:
                continue
            total = 0
            for dr in (0, 1):
                for dc in (0, 1):
                    if mask[base_row + dr][base_col + dc]:
                        total += 1
            best = max(best, total)
    return best


def tip_prune_bonus(mask: List[List[bool]], row: int, col: int) -> int:
    n4 = neighbor_count(mask, row, col, DIRS4)
    n8 = neighbor_count(mask, row, col, DIRS8)
    bonus = 0
    if n4 <= 1:
        bonus += 7
    if n8 <= 2:
        bonus += 4
    if square_support(mask, row, col) <= 2:
        bonus += 5
    return bonus


def corner_fill_bonus(mask: List[List[bool]], row: int, col: int) -> int:
    height = len(mask)
    width = len(mask[0])
    left = col - 1 >= 0 and mask[row][col - 1]
    right = col + 1 < width and mask[row][col + 1]
    up = row - 1 >= 0 and mask[row - 1][col]
    down = row + 1 < height and mask[row + 1][col]
    bonus = 0
    if left and up:
        bonus += 4
    if left and down:
        bonus += 4
    if right and up:
        bonus += 4
    if right and down:
        bonus += 4
    if square_support(mask, row, col) >= 3:
        bonus += 5
    return bonus


def choose_shape_swaps(
    grid: Grid,
    shape_budget_pct: float,
    rng: random.Random,
) -> Tuple[List[Point], List[Point]]:
    mask = build_mask(grid)
    filled = filled_count(grid)
    if filled == 0:
        return [], []
    max_changed = int(filled * max(0.0, shape_budget_pct) / 100.0)
    max_swaps = max_changed // 2
    if max_swaps <= 0:
        return [], []

    height = len(mask)
    width = len(mask[0])
    depth = compute_depth(mask)
    removal_candidates: List[Tuple[float, Point]] = []
    addition_candidates: List[Tuple[float, Point]] = []

    for row in range(height):
        for col in range(width):
            if mask[row][col]:
                n4 = neighbor_count(mask, row, col, DIRS4)
                n8 = neighbor_count(mask, row, col, DIRS8)
                if depth[row][col] > 0:
                    continue
                if n4 <= 1 or n8 <= 3:
                    score = (4 - n4) * 6 + (8 - n8) * 3 + tip_prune_bonus(mask, row, col) + rng.random()
                    removal_candidates.append((score, (row, col)))
            else:
                n4 = neighbor_count(mask, row, col, DIRS4)
                n8 = neighbor_count(mask, row, col, DIRS8)
                if n4 >= 2 or n8 >= 5:
                    score = (
                        n4 * 6
                        + n8 * 2
                        + local_hole_bonus(mask, row, col)
                        + corner_fill_bonus(mask, row, col)
                        + rng.random()
                    )
                    addition_candidates.append((score, (row, col)))

    removal_candidates.sort(key=lambda item: (-item[0], item[1][0], item[1][1]))
    addition_candidates.sort(key=lambda item: (-item[0], item[1][0], item[1][1]))

    removals: List[Point] = []
    additions: List[Point] = []
    used_rows_cols: set[Point] = set()
    for _, point in removal_candidates:
        if len(removals) >= max_swaps:
            break
        if point in used_rows_cols:
            continue
        removals.append(point)
        used_rows_cols.add(point)

    used_additions: set[Point] = set()
    for _, point in addition_candidates:
        if len(additions) >= len(removals):
            break
        if point in used_additions or point in used_rows_cols:
            continue
        additions.append(point)
        used_additions.add(point)

    swap_count = min(len(removals), len(additions))
    return removals[:swap_count], additions[:swap_count]


def choose_added_color(
    point: Point,
    pool: Counter,
    grid: Grid,
) -> int:
    row, col = point
    height = len(grid)
    width = len(grid[0])
    neighbor_colors = Counter()
    for dr, dc in DIRS8:
        nr = row + dr
        nc = col + dc
        if not inside(height, width, nr, nc):
            continue
        value = grid[nr][nc]
        if value > 0 and pool[value] > 0:
            neighbor_colors[value] += 1
    if neighbor_colors:
        return max(
            neighbor_colors,
            key=lambda color_id: (neighbor_colors[color_id], pool[color_id], -color_id),
        )
    return max(pool, key=lambda color_id: (pool[color_id], -color_id))


def apply_shape_swaps(grid: Grid, removals: List[Point], additions: List[Point]) -> Grid:
    new_grid = [row[:] for row in grid]
    removed_pool: Counter = Counter()
    for row, col in removals:
        removed_pool[new_grid[row][col]] += 1
        new_grid[row][col] = 0
    for point in additions:
        color_id = choose_added_color(point, removed_pool, new_grid)
        new_grid[point[0]][point[1]] = color_id
        removed_pool[color_id] -= 1
        if removed_pool[color_id] <= 0:
            del removed_pool[color_id]
    return new_grid


def rgb_metrics(rgb: Tuple[int, int, int]) -> Dict[str, float]:
    luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    saturation = (max(rgb) - min(rgb)) / max(1, max(rgb))
    hue, _, value = colorsys.rgb_to_hsv(rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0)
    return {
        "lum": luminance,
        "sat": saturation,
        "hue": hue,
        "value": value * 255.0,
    }


PALETTE_METRICS: Dict[int, Dict[str, float]] = {
    color_id: rgb_metrics(rgb)
    for color_id, rgb in PALETTE_RGB.items()
}


def hue_distance(a: float, b: float) -> float:
    gap = abs(a - b)
    return min(gap, 1.0 - gap)


def palette_distance(color_a: int, color_b: int) -> float:
    rgb_a = PALETTE_RGB[color_a]
    rgb_b = PALETTE_RGB[color_b]
    dr = rgb_a[0] - rgb_b[0]
    dg = rgb_a[1] - rgb_b[1]
    db = rgb_a[2] - rgb_b[2]
    return math.sqrt(dr * dr + dg * dg + db * db)


def palette_proximity_penalty(
    color_a: int,
    color_b: int,
    instruction_profile: Dict[str, float | bool | str],
    weight: float = 1.0,
) -> float:
    meta_a = PALETTE_METRICS[color_a]
    meta_b = PALETTE_METRICS[color_b]
    rgb_gap = palette_distance(color_a, color_b)
    hue_gap = hue_distance(meta_a["hue"], meta_b["hue"])
    lum_gap = abs(meta_a["lum"] - meta_b["lum"])
    sat_gap = abs(meta_a["sat"] - meta_b["sat"])

    penalty = 0.0
    if rgb_gap < 92:
        penalty += (92 - rgb_gap) * 1.05
    if hue_gap < 0.08:
        penalty += (0.08 - hue_gap) * 180
    if lum_gap < 42 and sat_gap < 0.22:
        penalty += (42 - lum_gap) * 0.35 + (0.22 - sat_gap) * 90
    penalty += NEAR_COLOR_PAIR_PENALTIES.get(frozenset((color_a, color_b)), 0.0)
    near_color_multiplier = 1.0 + float(instruction_profile["avoidNearColors"]) * 0.95
    vivid_multiplier = 1.0 + float(instruction_profile["vividness"]) * 0.15
    return penalty * weight * near_color_multiplier * vivid_multiplier


def infer_role_weights(source: Dict[str, float]) -> Dict[str, float]:
    outline = min(
        1.0,
        source["boundaryRatio"] * 1.15 + max(0.0, 0.45 - source["avgDepth"]) * 0.35,
    )
    fill = min(
        1.0,
        source["areaRatio"] * 2.1
        + max(0.0, source["avgDepth"] - 0.2) * 0.45
        + (1.0 - source["boundaryRatio"]) * 0.15,
    )
    accent = min(
        1.0,
        max(0.0, 0.12 - source["areaRatio"]) * 5.8
        + max(0.0, 0.7 - source["avgDepth"]) * 0.15,
    )
    total = outline + fill + accent
    if total <= 0:
        return {"outline": 0.34, "fill": 0.33, "accent": 0.33}
    return {
        "outline": outline / total,
        "fill": fill / total,
        "accent": accent / total,
    }


def palette_style_penalty(
    target_id: int,
    role_weights: Dict[str, float],
    instruction_profile: Dict[str, float | bool | str],
) -> float:
    style = PALETTE_STYLE_WEIGHTS[target_id]
    meta = PALETTE_METRICS[target_id]
    vividness = float(instruction_profile["vividness"])
    texture = float(instruction_profile["texture"])
    cute_style = float(instruction_profile["cuteStyle"])
    likeness = float(instruction_profile["likeness"])

    penalty = 0.0
    penalty += (1.0 - style["outline"]) * role_weights["outline"] * (100 + texture * 12)
    penalty += (1.0 - style["fill"]) * role_weights["fill"] * (105 + vividness * 10)
    penalty += (1.0 - style["accent"]) * role_weights["accent"] * (90 + cute_style * 14)

    cute_weight = 0.35 + role_weights["fill"] * 0.55 + role_weights["accent"] * 0.35
    cute_weight *= 1.0 + cute_style * 0.55 + vividness * 0.12
    penalty += (1.0 - style["cute"]) * cute_weight * (55 + texture * 14)

    if role_weights["outline"] >= 0.35:
        desired_outline_sat = 0.42 + texture * 0.04
        penalty += meta["lum"] * role_weights["outline"] * (0.18 + likeness * 0.03)
        penalty += abs(meta["sat"] - desired_outline_sat) * role_weights["outline"] * (12 + texture * 3)
    if role_weights["fill"] >= 0.35:
        desired_fill_lum = 182 + vividness * 10 + cute_style * 6
        desired_fill_sat = 0.50 + vividness * 0.08 + cute_style * 0.05
        penalty += abs(meta["lum"] - desired_fill_lum) * role_weights["fill"] * (0.22 + texture * 0.03)
        penalty += abs(meta["sat"] - desired_fill_sat) * role_weights["fill"] * (45 + vividness * 12)
    if role_weights["accent"] >= 0.25:
        desired_accent_sat = 0.62 + vividness * 0.10 + cute_style * 0.08
        penalty += abs(meta["sat"] - desired_accent_sat) * role_weights["accent"] * (28 + cute_style * 10)
    return penalty


def color_adjacency(grid: Grid) -> Dict[int, Counter]:
    height = len(grid)
    width = len(grid[0])
    adjacency: Dict[int, Counter] = defaultdict(Counter)
    for row in range(height):
        for col in range(width):
            value = grid[row][col]
            if value <= 0:
                continue
            for dr, dc in ((1, 0), (0, 1)):
                nr = row + dr
                nc = col + dc
                if not inside(height, width, nr, nc):
                    continue
                other = grid[nr][nc]
                if other <= 0 or other == value:
                    continue
                adjacency[value][other] += 1
                adjacency[other][value] += 1
    return adjacency


def build_palette_mapping(
    grid: Grid,
    instruction_profile: Dict[str, float | bool | str],
) -> Dict[int, int]:
    mask = build_mask(grid)
    depth = compute_depth(mask)
    filled = filled_count(grid)
    if filled == 0:
        return {}

    by_color: Dict[int, List[Point]] = defaultdict(list)
    for row, line in enumerate(grid):
        for col, value in enumerate(line):
            if value > 0:
                by_color[value].append((row, col))

    adjacency = color_adjacency(grid)
    source_stats: Dict[int, Dict[str, float]] = {}
    source_roles: Dict[int, Dict[str, float]] = {}
    for color_id, cells in by_color.items():
        depth_values = [depth[row][col] for row, col in cells if depth[row][col] >= 0]
        boundary_hits = sum(1 for row, col in cells if depth[row][col] == 0)
        source_meta = PALETTE_METRICS[color_id]
        source_stats[color_id] = {
            "count": float(len(cells)),
            "areaRatio": len(cells) / filled,
            "avgDepth": sum(depth_values) / max(1, len(depth_values)),
            "boundaryRatio": boundary_hits / max(1, len(cells)),
            "lum": source_meta["lum"],
            "sat": source_meta["sat"],
            "hue": source_meta["hue"],
        }
        source_roles[color_id] = infer_role_weights(source_stats[color_id])

    def palette_score(source_id: int, target_id: int, mapping: Dict[int, int]) -> float:
        source = source_stats[source_id]
        target_meta = PALETTE_METRICS[target_id]
        source_lum = source["lum"]
        source_sat = source["sat"]
        role_weights = source_roles[source_id]
        likeness = float(instruction_profile["likeness"])
        vividness = float(instruction_profile["vividness"])
        texture = float(instruction_profile["texture"])
        cute_style = float(instruction_profile["cuteStyle"])

        score = abs(source_lum - target_meta["lum"]) * (1.1 + likeness * 0.28)
        score += abs(source_sat - target_meta["sat"]) * (70 + vividness * 15 + texture * 10)
        score += hue_distance(source["hue"], target_meta["hue"]) * (26 + likeness * 80 + float(instruction_profile["colorPriority"]) * 20)
        score += palette_style_penalty(target_id, role_weights, instruction_profile)
        if source["boundaryRatio"] >= 0.5:
            score += target_meta["lum"] * (1.05 + texture * 0.06)
        elif source["avgDepth"] >= 1.3 and source["areaRatio"] >= 0.18:
            score += abs(target_meta["lum"] - (175 + vividness * 8)) * 0.7
        elif source["areaRatio"] <= 0.08:
            score += abs(target_meta["sat"] - (0.72 + cute_style * 0.08)) * (85 + vividness * 10)

        for assigned_target in mapping.values():
            score += palette_proximity_penalty(target_id, assigned_target, instruction_profile, weight=0.65)

        for neighbor_id, weight in adjacency.get(source_id, {}).items():
            if neighbor_id not in mapping:
                continue
            neighbor_target = mapping[neighbor_id]
            score -= min(170.0, palette_distance(target_id, neighbor_target)) * weight * (
                0.028 + vividness * 0.007 + cute_style * 0.004
            )
            score += palette_proximity_penalty(
                target_id,
                neighbor_target,
                instruction_profile,
                weight=max(0.6, weight * 0.25),
            ) * (1.25 + float(instruction_profile["avoidNearColors"]) * 0.35)
        return score

    ordered_sources = sorted(
        source_stats,
        key=lambda color_id: (
            -source_stats[color_id]["boundaryRatio"],
            -source_stats[color_id]["areaRatio"],
            source_stats[color_id]["avgDepth"],
            color_id,
        ),
    )
    available_targets = set(PALETTE_RGB.keys())
    mapping: Dict[int, int] = {}
    for source_id in ordered_sources:
        target_id = min(
            available_targets,
            key=lambda palette_id: palette_score(source_id, palette_id, mapping),
        )
        mapping[source_id] = target_id
        available_targets.remove(target_id)
    return mapping


def remap_colors(grid: Grid, mapping: Dict[int, int]) -> Grid:
    return [[mapping.get(value, 0) if value > 0 else 0 for value in row] for row in grid]


def can_reuse_init_grid(init_grid: object, correct: Grid) -> bool:
    if not isinstance(init_grid, list) or not init_grid:
        return False
    if len(init_grid) != len(correct):
        return False
    width = len(correct[0])
    for row in init_grid:
        if not isinstance(row, list) or len(row) != width:
            return False
    return True


def shape_change_pct(original: Grid, candidate: Grid) -> float:
    total = filled_count(original)
    changed = 0
    for row in range(len(original)):
        for col in range(len(original[0])):
            if (original[row][col] > 0) != (candidate[row][col] > 0):
                changed += 1
    return 0.0 if total == 0 else changed * 100.0 / total


def color_change_pct(original: Grid, candidate: Grid) -> float:
    total = filled_count(original)
    changed = 0
    for row in range(len(original)):
        for col in range(len(original[0])):
            if original[row][col] > 0 and candidate[row][col] > 0 and original[row][col] != candidate[row][col]:
                changed += 1
            elif (original[row][col] > 0) != (candidate[row][col] > 0):
                changed += 1
    return 0.0 if total == 0 else changed * 100.0 / total


def original_displacement_ratio(payload: Dict[str, object]) -> float:
    correct: Grid = payload["correctColorArr"]  # type: ignore[assignment]
    init_grid = payload.get("initRandomColorArr")
    if isinstance(init_grid, list) and init_grid:
        return displacement_ratio(correct, init_grid)  # type: ignore[arg-type]
    ratio = payload.get("displacementRatio")
    return float(ratio) if ratio is not None else 0.9


def choose_init_closest_to_target(
    correct: Grid,
    base_seed: int,
    attempts: int,
    max_groups_per_color: int,
    target_ratio: float,
) -> Tuple[Grid, float, int]:
    best_grid: Grid | None = None
    best_ratio = -1.0
    best_seed = base_seed
    best_key: Tuple[float, float] | None = None
    for attempt in range(max(1, attempts)):
        seed = base_seed + attempt * 9973
        init_grid = assign_initial_layout(
            correct,
            seed=seed,
            max_groups_per_color=max_groups_per_color,
        )
        ratio = displacement_ratio(correct, init_grid)
        key = (abs(ratio - target_ratio), -ratio)
        if best_key is None or key < best_key:
            best_grid = init_grid
            best_ratio = ratio
            best_seed = seed
            best_key = key
    if best_grid is None:
        raise ValueError("Unable to generate an initial shuffled board")
    return best_grid, best_ratio, best_seed


def build_candidate(payload: Dict[str, object], args: argparse.Namespace) -> Dict[str, object]:
    original: Grid = payload["correctColorArr"]  # type: ignore[assignment]
    validate_grid(original)
    rng = random.Random(derive_seed(payload, args.seed))
    instruction_profile = build_instruction_profile(args.instruction_prompt, args.shape_budget_pct)
    effective_shape_budget = float(instruction_profile["effectiveShapeBudgetPct"])

    removals, additions = choose_shape_swaps(
        original,
        shape_budget_pct=effective_shape_budget,
        rng=rng,
    )
    shape_adjusted = apply_shape_swaps(original, removals, additions)
    mapping = build_palette_mapping(shape_adjusted, instruction_profile)
    refined = remap_colors(shape_adjusted, mapping)

    target_ratio = original_displacement_ratio(payload)
    init_strategy = "regenerated"
    if not removals and not additions and can_reuse_init_grid(payload.get("initRandomColorArr"), refined):
        init_grid = remap_colors(payload["initRandomColorArr"], mapping)  # type: ignore[arg-type]
        ratio = displacement_ratio(refined, init_grid)
        chosen_seed = int(payload.get("initShuffleSeed", derive_seed(payload, args.seed)) or derive_seed(payload, args.seed))
        init_strategy = "remapped_original_init"
    else:
        init_grid, ratio, chosen_seed = choose_init_closest_to_target(
            correct=refined,
            base_seed=derive_seed(payload, args.seed),
            attempts=args.shuffle_attempts,
            max_groups_per_color=args.max_groups_per_color,
            target_ratio=target_ratio,
        )

    updated = dict(payload)
    updated["correctColorArr"] = refined
    updated["initRandomColorArr"] = init_grid
    updated["boardWidth"] = len(refined[0])
    updated["boardHeight"] = len(refined)
    updated["slotTotalCount"] = filled_count(refined)
    updated["filledCellCount"] = filled_count(refined)
    updated["colorCount"] = len(count_colors(refined))
    updated["colorStats"] = count_colors(refined)
    updated["displacementRatio"] = round(ratio, 4)
    updated["initShuffleSeed"] = chosen_seed

    metrics = {
        "shapeChangePct": round(shape_change_pct(original, refined), 4),
        "colorChangePct": round(color_change_pct(original, refined), 4),
        "removedCellCount": len(removals),
        "addedCellCount": len(additions),
        "filledDelta": filled_count(refined) - filled_count(original),
        "colorCountDelta": len(count_colors(refined)) - len(count_colors(original)),
        "originalDisplacementRatio": round(target_ratio, 4),
        "candidateDisplacementRatio": round(ratio, 4),
        "displacementDelta": round(ratio - target_ratio, 4),
        "paletteMapping": {str(key): value for key, value in sorted(mapping.items())},
        "initStrategy": init_strategy,
        "instructionPrompt": str(instruction_profile["promptText"]),
        "instructionProfile": {
            "colorPriority": instruction_profile["colorPriority"],
            "avoidNearColors": instruction_profile["avoidNearColors"],
            "likeness": instruction_profile["likeness"],
            "vividness": instruction_profile["vividness"],
            "texture": instruction_profile["texture"],
            "cuteStyle": instruction_profile["cuteStyle"],
            "structurePreserve": instruction_profile["structurePreserve"],
        },
        "appliedShapeBudgetPct": round(effective_shape_budget, 4),
    }
    return {"candidate": updated, "metrics": metrics}


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    payload = load_payload(input_path)
    result = build_candidate(payload, args)
    if args.output:
        with Path(args.output).open("w", encoding="utf-8") as fh:
            json.dump(result["candidate"], fh, ensure_ascii=False, indent=2)
            fh.write("\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
