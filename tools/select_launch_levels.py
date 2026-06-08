#!/usr/bin/env python3
"""Select a launch-ready progression from guanka classifications."""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path
from typing import Dict, List, Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "tools" / "generated_levels" / "guanka_level_classification.json"
DEFAULT_JSON_300 = ROOT / "tools" / "generated_levels" / "launch_300_selection.json"
DEFAULT_MD_300 = ROOT / "tools" / "generated_levels" / "launch_300_selection.md"
DEFAULT_JSON_200 = ROOT / "tools" / "generated_levels" / "launch_200_selection.json"
DEFAULT_MD_200 = ROOT / "tools" / "generated_levels" / "launch_200_selection.md"
DEFAULT_JSON_600 = ROOT / "tools" / "generated_levels" / "launch_600_selection.json"
DEFAULT_MD_600 = ROOT / "tools" / "generated_levels" / "launch_600_selection.md"

SPECIAL_CATEGORIES = {
    "动物/卡通动物",
    "动物/蝴蝶",
    "图标/简笔轮廓",
    "图案/普通拼豆图",
}

MOTIF_CATEGORIES = {
    "纹样/双轴对称图腾",
    "纹样/环形纹章",
    "纹样/镂空图腾",
    "纹样/左右对称徽章",
}

RELAX_STEPS = (0.0, 2.0, 4.0, 7.0, 11.0)

PALETTE_RGB: Dict[int, tuple[int, int, int]] = {
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

PROFILE_CONFIGS = {
    600: {
        "title": "拼豆豆首发600关长线版",
        "default_json": DEFAULT_JSON_600,
        "default_md": DEFAULT_MD_600,
        "peaks": {30, 60, 100, 140, 180, 220, 260, 300, 340, 380, 420, 460, 500, 540, 585},
        "rests": {
            8, 18, 28, 40, 52, 66, 80, 96, 112, 128, 144, 160, 176, 194, 212, 230, 248,
            266, 284, 302, 320, 338, 356, 374, 392, 410, 428, 446, 464, 482, 500, 518,
            536, 552, 568, 584,
        },
        "stages": [
            {"name": "教学建立信心段", "label": "1-12", "start": 1, "end": 12, "min_score": 34.0, "max_score": 64.0, "center": 55.0},
            {"name": "轻提升段", "label": "13-40", "start": 13, "end": 40, "min_score": 56.0, "max_score": 67.0, "center": 63.0},
            {"name": "稳定留存段", "label": "41-100", "start": 41, "end": 100, "min_score": 61.0, "max_score": 74.0, "center": 69.0},
            {"name": "主体消耗段上半", "label": "101-180", "start": 101, "end": 180, "min_score": 66.0, "max_score": 77.0, "center": 73.0},
            {"name": "主体消耗段下半", "label": "181-280", "start": 181, "end": 280, "min_score": 70.0, "max_score": 80.0, "center": 76.0},
            {"name": "中高压段上半", "label": "281-380", "start": 281, "end": 380, "min_score": 74.0, "max_score": 84.0, "center": 80.0},
            {"name": "中高压段下半", "label": "381-480", "start": 381, "end": 480, "min_score": 78.0, "max_score": 88.0, "center": 84.0},
            {"name": "版本尾段", "label": "481-560", "start": 481, "end": 560, "min_score": 82.0, "max_score": 92.0, "center": 88.0},
            {"name": "深度展示段", "label": "561-600", "start": 561, "end": 600, "min_score": 88.0, "max_score": 96.0, "center": 92.0},
        ],
        "strict_easy_end": 40,
        "strict_easy_max": 72.0,
        "strict_mid_end": 100,
        "strict_mid_max": 78.0,
        "pre_superhard_end": 520,
        "high_score_block_end": 560,
        "high_score_block_max": 96.0,
        "front_complexity_end": 80,
        "front_complexity_max": 79.0,
        "light_segment_end": 100,
        "mid_segment_end": 280,
        "superhard_open_pos": 548,
        "superhard_bonus_pos": 570,
        "superhard_min": 10,
        "superhard_max": 14,
        "superhard_target": 12,
        "score_over_92_limit": 22,
        "special_window": 80,
        "special_floor": 16,
        "special_risk": 20,
        "easy_pool_warning": 120,
        "featured_stage_ratios": {
            "1-12": 0.28,
            "13-40": 0.40,
            "41-100": 0.45,
            "101-180": 0.50,
            "181-280": 0.56,
            "281-380": 0.62,
            "381-480": 0.68,
            "481-560": 0.72,
            "561-600": 0.78,
        },
        "featured_target_buffer": 24,
        "featured_target_relax": 4.0,
        "showcase_positions": {
            6, 12, 18, 26, 34, 42, 50, 60, 70, 82, 94, 108, 122, 136, 150, 166, 182, 198,
            214, 230, 246, 262, 278, 296, 314, 332, 350, 368, 386, 404, 422, 440, 458, 476,
            494, 512, 530, 548, 566, 584, 596,
        },
        "featured_gap_limit_early": 5,
        "featured_gap_limit_mid": 6,
        "featured_gap_limit_late": 7,
        "special_gap_limit_early": 7,
        "special_gap_limit_mid": 10,
        "special_gap_limit_late": 12,
        "featured_bonus_early": 4.4,
        "featured_bonus_mid": 5.5,
        "featured_bonus_late": 6.2,
        "showcase_featured_bonus": 2.4,
        "showcase_special_bonus": 2.6,
        "color_clarity_end": 100,
        "color_clarity_hard_end": 30,
        "color_clarity_soft_distance": 58.0,
        "color_clarity_hard_distance": 50.0,
        "color_clarity_critical_distance": 36.0,
    },
    300: {
        "title": "拼豆豆首发300关候选",
        "default_json": DEFAULT_JSON_300,
        "default_md": DEFAULT_MD_300,
        "peaks": {30, 60, 100, 140, 180, 220, 260, 295},
        "rests": {8, 18, 28, 42, 54, 68, 88, 102, 116, 130, 148, 162, 176, 190, 206, 222, 236, 248, 264, 276, 290},
        "stages": [
            {"name": "教学建立信心段", "label": "1-10", "start": 1, "end": 10, "min_score": 34.0, "max_score": 65.0, "center": 57.0},
            {"name": "轻提升段", "label": "11-30", "start": 11, "end": 30, "min_score": 58.0, "max_score": 68.0, "center": 65.0},
            {"name": "稳定留存段", "label": "31-80", "start": 31, "end": 80, "min_score": 64.0, "max_score": 75.0, "center": 70.0},
            {"name": "主体消耗段", "label": "81-160", "start": 81, "end": 160, "min_score": 68.0, "max_score": 78.0, "center": 75.0},
            {"name": "中高压段", "label": "161-240", "start": 161, "end": 240, "min_score": 75.0, "max_score": 84.0, "center": 80.0},
            {"name": "版本尾段", "label": "241-280", "start": 241, "end": 280, "min_score": 80.0, "max_score": 90.0, "center": 86.0},
            {"name": "深度展示段", "label": "281-300", "start": 281, "end": 300, "min_score": 86.0, "max_score": 95.0, "center": 91.0},
        ],
        "strict_easy_end": 30,
        "strict_easy_max": 72.0,
        "strict_mid_end": 80,
        "strict_mid_max": 76.0,
        "pre_superhard_end": 240,
        "high_score_block_end": 280,
        "high_score_block_max": 95.0,
        "front_complexity_end": 50,
        "front_complexity_max": 78.0,
        "light_segment_end": 80,
        "mid_segment_end": 160,
        "superhard_open_pos": 286,
        "superhard_bonus_pos": 291,
        "superhard_min": 5,
        "superhard_max": 8,
        "superhard_target": 6,
        "score_over_92_limit": 8,
        "special_window": 50,
        "special_floor": 10,
        "special_risk": 14,
        "easy_pool_warning": 80,
        "featured_stage_ratios": {
            "1-10": 0.30,
            "11-30": 0.45,
            "31-80": 0.48,
            "81-160": 0.52,
            "161-240": 0.68,
            "241-280": 0.70,
            "281-300": 0.80,
        },
        "featured_target_buffer": 18,
        "featured_target_relax": 4.0,
        "showcase_positions": {
            6, 12, 18, 24, 32, 40, 48, 60, 72, 84, 98, 112, 126,
            140, 156, 172, 188, 204, 220, 236, 252, 268,
            284, 296,
        },
        "featured_gap_limit_early": 5,
        "featured_gap_limit_mid": 6,
        "featured_gap_limit_late": 7,
        "special_gap_limit_early": 7,
        "special_gap_limit_mid": 10,
        "special_gap_limit_late": 12,
        "featured_bonus_early": 4.2,
        "featured_bonus_mid": 5.4,
        "featured_bonus_late": 6.0,
        "showcase_featured_bonus": 2.4,
        "showcase_special_bonus": 2.6,
        "color_clarity_end": 100,
        "color_clarity_hard_end": 30,
        "color_clarity_soft_distance": 58.0,
        "color_clarity_hard_distance": 50.0,
        "color_clarity_critical_distance": 36.0,
    },
    200: {
        "title": "拼豆豆首发200关保守版",
        "default_json": DEFAULT_JSON_200,
        "default_md": DEFAULT_MD_200,
        "peaks": {26, 52, 84, 118, 152, 184, 198},
        "rests": {8, 18, 32, 44, 58, 72, 90, 104, 122, 138, 156, 172, 188},
        "stages": [
            {"name": "教学建立信心段", "label": "1-10", "start": 1, "end": 10, "min_score": 34.0, "max_score": 63.0, "center": 54.0},
            {"name": "轻提升段", "label": "11-30", "start": 11, "end": 30, "min_score": 56.0, "max_score": 66.0, "center": 62.0},
            {"name": "稳定留存段", "label": "31-70", "start": 31, "end": 70, "min_score": 62.0, "max_score": 72.0, "center": 68.0},
            {"name": "主体消耗段", "label": "71-120", "start": 71, "end": 120, "min_score": 66.0, "max_score": 76.0, "center": 72.0},
            {"name": "中高压段", "label": "121-170", "start": 121, "end": 170, "min_score": 72.0, "max_score": 82.0, "center": 77.0},
            {"name": "版本尾段", "label": "171-190", "start": 171, "end": 190, "min_score": 78.0, "max_score": 88.0, "center": 83.0},
            {"name": "深度展示段", "label": "191-200", "start": 191, "end": 200, "min_score": 84.0, "max_score": 92.0, "center": 88.0},
        ],
        "strict_easy_end": 30,
        "strict_easy_max": 70.0,
        "strict_mid_end": 60,
        "strict_mid_max": 74.0,
        "pre_superhard_end": 180,
        "high_score_block_end": 190,
        "high_score_block_max": 92.0,
        "front_complexity_end": 40,
        "front_complexity_max": 76.0,
        "light_segment_end": 60,
        "mid_segment_end": 120,
        "superhard_open_pos": 191,
        "superhard_bonus_pos": 194,
        "superhard_min": 2,
        "superhard_max": 4,
        "superhard_target": 3,
        "score_over_92_limit": 1,
        "special_window": 40,
        "special_floor": 8,
        "special_risk": 10,
        "easy_pool_warning": 60,
        "featured_stage_ratios": {
            "1-10": 0.20,
            "11-30": 0.40,
            "31-70": 0.45,
            "71-120": 0.52,
            "121-170": 0.60,
            "171-190": 0.65,
            "191-200": 0.75,
        },
        "featured_target_buffer": 16,
        "featured_target_relax": 4.0,
        "showcase_positions": {
            6, 12, 18, 24, 32, 40, 48, 60, 74, 88, 102, 118, 134,
            150, 166, 182, 194,
        },
        "featured_gap_limit_early": 5,
        "featured_gap_limit_mid": 6,
        "featured_gap_limit_late": 7,
        "special_gap_limit_early": 7,
        "special_gap_limit_mid": 10,
        "special_gap_limit_late": 12,
        "featured_bonus_early": 3.8,
        "featured_bonus_mid": 4.8,
        "featured_bonus_late": 5.4,
        "showcase_featured_bonus": 2.2,
        "showcase_special_bonus": 2.4,
        "color_clarity_end": 100,
        "color_clarity_hard_end": 30,
        "color_clarity_soft_distance": 58.0,
        "color_clarity_hard_distance": 50.0,
        "color_clarity_critical_distance": 36.0,
    },
}

SELECTION_COUNT = 300
SELECTION_TITLE = PROFILE_CONFIGS[300]["title"]
PEAK_POSITIONS = PROFILE_CONFIGS[300]["peaks"]
REST_POSITIONS = PROFILE_CONFIGS[300]["rests"]
STAGES = PROFILE_CONFIGS[300]["stages"]
STRICT_EASY_END = PROFILE_CONFIGS[300]["strict_easy_end"]
STRICT_EASY_MAX = PROFILE_CONFIGS[300]["strict_easy_max"]
STRICT_MID_END = PROFILE_CONFIGS[300]["strict_mid_end"]
STRICT_MID_MAX = PROFILE_CONFIGS[300]["strict_mid_max"]
PRE_SUPERHARD_END = PROFILE_CONFIGS[300]["pre_superhard_end"]
HIGH_SCORE_BLOCK_END = PROFILE_CONFIGS[300]["high_score_block_end"]
HIGH_SCORE_BLOCK_MAX = PROFILE_CONFIGS[300]["high_score_block_max"]
FRONT_COMPLEXITY_END = PROFILE_CONFIGS[300]["front_complexity_end"]
FRONT_COMPLEXITY_MAX = PROFILE_CONFIGS[300]["front_complexity_max"]
LIGHT_SEGMENT_END = PROFILE_CONFIGS[300]["light_segment_end"]
MID_SEGMENT_END = PROFILE_CONFIGS[300]["mid_segment_end"]
SUPERHARD_OPEN_POS = PROFILE_CONFIGS[300]["superhard_open_pos"]
SUPERHARD_BONUS_POS = PROFILE_CONFIGS[300]["superhard_bonus_pos"]
SUPERHARD_MIN = PROFILE_CONFIGS[300]["superhard_min"]
SUPERHARD_MAX = PROFILE_CONFIGS[300]["superhard_max"]
SUPERHARD_TARGET = PROFILE_CONFIGS[300]["superhard_target"]
SCORE_OVER_92_LIMIT = PROFILE_CONFIGS[300]["score_over_92_limit"]
SPECIAL_WINDOW = PROFILE_CONFIGS[300]["special_window"]
SPECIAL_FLOOR = PROFILE_CONFIGS[300]["special_floor"]
SPECIAL_RISK = PROFILE_CONFIGS[300]["special_risk"]
EASY_POOL_WARNING = PROFILE_CONFIGS[300]["easy_pool_warning"]
FEATURED_STAGE_RATIOS = PROFILE_CONFIGS[300]["featured_stage_ratios"]
FEATURED_TARGET_BUFFER = PROFILE_CONFIGS[300]["featured_target_buffer"]
FEATURED_TARGET_RELAX = PROFILE_CONFIGS[300]["featured_target_relax"]
SHOWCASE_POSITIONS = PROFILE_CONFIGS[300]["showcase_positions"]
FEATURED_GAP_LIMIT_EARLY = PROFILE_CONFIGS[300]["featured_gap_limit_early"]
FEATURED_GAP_LIMIT_MID = PROFILE_CONFIGS[300]["featured_gap_limit_mid"]
FEATURED_GAP_LIMIT_LATE = PROFILE_CONFIGS[300]["featured_gap_limit_late"]
SPECIAL_GAP_LIMIT_EARLY = PROFILE_CONFIGS[300]["special_gap_limit_early"]
SPECIAL_GAP_LIMIT_MID = PROFILE_CONFIGS[300]["special_gap_limit_mid"]
SPECIAL_GAP_LIMIT_LATE = PROFILE_CONFIGS[300]["special_gap_limit_late"]
FEATURED_BONUS_EARLY = PROFILE_CONFIGS[300]["featured_bonus_early"]
FEATURED_BONUS_MID = PROFILE_CONFIGS[300]["featured_bonus_mid"]
FEATURED_BONUS_LATE = PROFILE_CONFIGS[300]["featured_bonus_late"]
SHOWCASE_FEATURED_BONUS = PROFILE_CONFIGS[300]["showcase_featured_bonus"]
SHOWCASE_SPECIAL_BONUS = PROFILE_CONFIGS[300]["showcase_special_bonus"]
COLOR_CLARITY_END = PROFILE_CONFIGS[300]["color_clarity_end"]
COLOR_CLARITY_HARD_END = PROFILE_CONFIGS[300]["color_clarity_hard_end"]
COLOR_CLARITY_SOFT_DISTANCE = PROFILE_CONFIGS[300]["color_clarity_soft_distance"]
COLOR_CLARITY_HARD_DISTANCE = PROFILE_CONFIGS[300]["color_clarity_hard_distance"]
COLOR_CLARITY_CRITICAL_DISTANCE = PROFILE_CONFIGS[300]["color_clarity_critical_distance"]
FEATURED_TARGETS = {}
FEATURED_TARGET_TOTAL = 0
FEATURED_POOL_COUNT = 0


def apply_profile(count: int) -> dict:
    global SELECTION_COUNT, SELECTION_TITLE
    global PEAK_POSITIONS, REST_POSITIONS, STAGES
    global STRICT_EASY_END, STRICT_EASY_MAX, STRICT_MID_END, STRICT_MID_MAX
    global PRE_SUPERHARD_END, HIGH_SCORE_BLOCK_END, HIGH_SCORE_BLOCK_MAX
    global FRONT_COMPLEXITY_END, FRONT_COMPLEXITY_MAX
    global LIGHT_SEGMENT_END, MID_SEGMENT_END
    global SUPERHARD_OPEN_POS, SUPERHARD_BONUS_POS
    global SUPERHARD_MIN, SUPERHARD_MAX, SUPERHARD_TARGET
    global SCORE_OVER_92_LIMIT
    global SPECIAL_WINDOW, SPECIAL_FLOOR, SPECIAL_RISK, EASY_POOL_WARNING
    global FEATURED_STAGE_RATIOS, FEATURED_TARGET_BUFFER, FEATURED_TARGET_RELAX
    global SHOWCASE_POSITIONS
    global FEATURED_GAP_LIMIT_EARLY, FEATURED_GAP_LIMIT_MID, FEATURED_GAP_LIMIT_LATE
    global SPECIAL_GAP_LIMIT_EARLY, SPECIAL_GAP_LIMIT_MID, SPECIAL_GAP_LIMIT_LATE
    global FEATURED_BONUS_EARLY, FEATURED_BONUS_MID, FEATURED_BONUS_LATE
    global SHOWCASE_FEATURED_BONUS, SHOWCASE_SPECIAL_BONUS
    global COLOR_CLARITY_END, COLOR_CLARITY_HARD_END
    global COLOR_CLARITY_SOFT_DISTANCE, COLOR_CLARITY_HARD_DISTANCE, COLOR_CLARITY_CRITICAL_DISTANCE
    global FEATURED_TARGETS, FEATURED_TARGET_TOTAL, FEATURED_POOL_COUNT

    config = PROFILE_CONFIGS[count]
    SELECTION_COUNT = count
    SELECTION_TITLE = config["title"]
    PEAK_POSITIONS = config["peaks"]
    REST_POSITIONS = config["rests"]
    STAGES = config["stages"]
    STRICT_EASY_END = config["strict_easy_end"]
    STRICT_EASY_MAX = config["strict_easy_max"]
    STRICT_MID_END = config["strict_mid_end"]
    STRICT_MID_MAX = config["strict_mid_max"]
    PRE_SUPERHARD_END = config["pre_superhard_end"]
    HIGH_SCORE_BLOCK_END = config["high_score_block_end"]
    HIGH_SCORE_BLOCK_MAX = config["high_score_block_max"]
    FRONT_COMPLEXITY_END = config["front_complexity_end"]
    FRONT_COMPLEXITY_MAX = config["front_complexity_max"]
    LIGHT_SEGMENT_END = config["light_segment_end"]
    MID_SEGMENT_END = config["mid_segment_end"]
    SUPERHARD_OPEN_POS = config["superhard_open_pos"]
    SUPERHARD_BONUS_POS = config["superhard_bonus_pos"]
    SUPERHARD_MIN = config["superhard_min"]
    SUPERHARD_MAX = config["superhard_max"]
    SUPERHARD_TARGET = config["superhard_target"]
    SCORE_OVER_92_LIMIT = config["score_over_92_limit"]
    SPECIAL_WINDOW = config["special_window"]
    SPECIAL_FLOOR = config["special_floor"]
    SPECIAL_RISK = config["special_risk"]
    EASY_POOL_WARNING = config["easy_pool_warning"]
    FEATURED_STAGE_RATIOS = config["featured_stage_ratios"]
    FEATURED_TARGET_BUFFER = config["featured_target_buffer"]
    FEATURED_TARGET_RELAX = config["featured_target_relax"]
    SHOWCASE_POSITIONS = config["showcase_positions"]
    FEATURED_GAP_LIMIT_EARLY = config["featured_gap_limit_early"]
    FEATURED_GAP_LIMIT_MID = config["featured_gap_limit_mid"]
    FEATURED_GAP_LIMIT_LATE = config["featured_gap_limit_late"]
    SPECIAL_GAP_LIMIT_EARLY = config["special_gap_limit_early"]
    SPECIAL_GAP_LIMIT_MID = config["special_gap_limit_mid"]
    SPECIAL_GAP_LIMIT_LATE = config["special_gap_limit_late"]
    FEATURED_BONUS_EARLY = config["featured_bonus_early"]
    FEATURED_BONUS_MID = config["featured_bonus_mid"]
    FEATURED_BONUS_LATE = config["featured_bonus_late"]
    SHOWCASE_FEATURED_BONUS = config["showcase_featured_bonus"]
    SHOWCASE_SPECIAL_BONUS = config["showcase_special_bonus"]
    COLOR_CLARITY_END = config["color_clarity_end"]
    COLOR_CLARITY_HARD_END = config["color_clarity_hard_end"]
    COLOR_CLARITY_SOFT_DISTANCE = config["color_clarity_soft_distance"]
    COLOR_CLARITY_HARD_DISTANCE = config["color_clarity_hard_distance"]
    COLOR_CLARITY_CRITICAL_DISTANCE = config["color_clarity_critical_distance"]
    FEATURED_TARGETS = {}
    FEATURED_TARGET_TOTAL = 0
    FEATURED_POOL_COUNT = 0
    return config


def stage_for_pos(pos: int) -> Dict[str, float]:
    for stage in STAGES:
        if stage["start"] <= pos <= stage["end"]:
            return stage
    raise ValueError(f"Position out of range: {pos}")


def target_score(pos: int) -> float:
    stage = stage_for_pos(pos)
    span = stage["end"] - stage["start"]
    progress = 0.0 if span == 0 else (pos - stage["start"]) / span
    base = stage["min_score"] + (stage["max_score"] - stage["min_score"]) * (0.38 + progress * 0.34)
    base += (-1.4, -0.3, 0.6, 1.0, -0.8, 0.2)[(pos - 1) % 6]
    if pos in PEAK_POSITIONS:
        base += 2.8
    if pos - 1 in PEAK_POSITIONS or pos - 2 in PEAK_POSITIONS:
        base -= 2.4
    if pos in REST_POSITIONS:
        base -= 1.6
    return round(base, 2)


def is_special(level: Dict[str, object]) -> bool:
    return str(level["category"]) in SPECIAL_CATEGORIES


def is_motif(level: Dict[str, object]) -> bool:
    return str(level["category"]) in MOTIF_CATEGORIES


def is_featured(level: Dict[str, object]) -> bool:
    return bool(level.get("isFeatured"))


def stage_slot_count(stage: Dict[str, float]) -> int:
    return int(stage["end"] - stage["start"] + 1)


def featured_gap_limit(pos: int) -> int:
    if pos <= LIGHT_SEGMENT_END:
        return FEATURED_GAP_LIMIT_EARLY
    if pos <= MID_SEGMENT_END:
        return FEATURED_GAP_LIMIT_MID
    return FEATURED_GAP_LIMIT_LATE


def special_gap_limit(pos: int) -> int:
    if pos <= LIGHT_SEGMENT_END:
        return SPECIAL_GAP_LIMIT_EARLY
    if pos <= MID_SEGMENT_END:
        return SPECIAL_GAP_LIMIT_MID
    return SPECIAL_GAP_LIMIT_LATE


def gap_since(selection: Sequence[Dict[str, object]], predicate) -> int:
    gap = 0
    for item in reversed(selection):
        if predicate(item):
            return gap
        gap += 1
    return gap


def is_showcase_pos(pos: int) -> bool:
    return pos in SHOWCASE_POSITIONS


def featured_stage_capacity(levels: Sequence[Dict[str, object]], stage: Dict[str, float]) -> int:
    available: set[int] = set()
    min_score = float(stage["min_score"]) - FEATURED_TARGET_RELAX
    max_score = float(stage["max_score"]) + FEATURED_TARGET_RELAX
    for level in levels:
        score = float(level["complexityScore"])
        if score < min_score or score > max_score:
            continue
        for pos in range(int(stage["start"]), int(stage["end"]) + 1):
            if not hard_excluded(level, pos):
                available.add(int(level["levelId"]))
                break
    return len(available)


def resolve_featured_targets(levels: Sequence[Dict[str, object]]) -> None:
    global FEATURED_TARGETS, FEATURED_TARGET_TOTAL, FEATURED_POOL_COUNT

    featured_levels = [level for level in levels if is_featured(level)]
    FEATURED_POOL_COUNT = len(featured_levels)

    union_capacity: Dict[str, int] = {
        str(stage["label"]): featured_stage_capacity(featured_levels, stage)
        for stage in STAGES
    }
    assigned_supply: Counter = Counter()
    for level in featured_levels:
        feasible_stages: List[Dict[str, float]] = []
        score = float(level["complexityScore"])
        for stage in STAGES:
            label = str(stage["label"])
            if score < float(stage["min_score"]) - FEATURED_TARGET_RELAX:
                continue
            if score > float(stage["max_score"]) + FEATURED_TARGET_RELAX:
                continue
            if union_capacity[label] <= 0:
                continue
            for pos in range(int(stage["start"]), int(stage["end"]) + 1):
                if not hard_excluded(level, pos):
                    feasible_stages.append(stage)
                    break
        if not feasible_stages:
            continue
        best_stage = min(
            feasible_stages,
            key=lambda stage: (
                abs(score - float(stage["center"])),
                abs(int(stage["end"]) - int(stage["start"])),
                int(stage["start"]),
            ),
        )
        assigned_supply[str(best_stage["label"])] += 1

    targets: Dict[str, int] = {}
    total_target = 0
    for stage in STAGES:
        label = str(stage["label"])
        desired = round(stage_slot_count(stage) * float(FEATURED_STAGE_RATIOS.get(label, 0.0)))
        borrow_slots = max(1, stage_slot_count(stage) // 16)
        capacity = min(union_capacity[label], int(assigned_supply[label]) + borrow_slots)
        target = min(desired, capacity)
        if desired > 0 and capacity > 0:
            target = max(1, target)
        targets[label] = target
        total_target += target

    pool_cap = max(0, FEATURED_POOL_COUNT - FEATURED_TARGET_BUFFER)
    if total_target > pool_cap:
        adjustable = sorted(
            STAGES,
            key=lambda stage: (float(FEATURED_STAGE_RATIOS.get(stage["label"], 0.0)), int(stage["start"])),
        )
        while total_target > pool_cap:
            changed = False
            for stage in adjustable:
                label = str(stage["label"])
                if targets[label] <= 1:
                    continue
                targets[label] -= 1
                total_target -= 1
                changed = True
                if total_target <= pool_cap:
                    break
            if not changed:
                break

    FEATURED_TARGETS = targets
    FEATURED_TARGET_TOTAL = total_target


def featured_stage_state(selection: Sequence[Dict[str, object]], pos: int) -> tuple[Dict[str, float], int, int, int, int]:
    stage = stage_for_pos(pos)
    target = int(FEATURED_TARGETS.get(stage["label"], 0))
    selected = sum(
        1
        for item in selection
        if stage["start"] <= int(item["launchOrder"]) <= stage["end"] and is_featured(item)
    )
    slots_left = stage["end"] - pos + 1
    needed = max(0, target - selected)
    return stage, target, selected, slots_left, needed


def tag_role(pos: int, level: Dict[str, object]) -> str:
    if pos in PEAK_POSITIONS:
        return "小高潮关"
    if pos in REST_POSITIONS:
        return "休息关"
    if pos <= 10:
        return "教学关"
    if is_special(level):
        return "内容关"
    return "常规关"


def color_distance(color_a: int, color_b: int) -> float:
    rgb_a = PALETTE_RGB.get(color_a)
    rgb_b = PALETTE_RGB.get(color_b)
    if rgb_a is None or rgb_b is None:
        return 999.0
    return ((rgb_a[0] - rgb_b[0]) ** 2 + (rgb_a[1] - rgb_b[1]) ** 2 + (rgb_a[2] - rgb_b[2]) ** 2) ** 0.5


def color_clarity_penalty(level: Dict[str, object], pos: int) -> float:
    if pos > COLOR_CLARITY_END:
        return 0.0
    min_distance = float(level.get("colorMinDistance") or 999.0)
    soft_pairs = int(level.get("nearColorPairsSoft") or 0)
    hard_pairs = int(level.get("nearColorPairsHard") or 0)
    critical_pairs = int(level.get("nearColorPairsCritical") or 0)

    early_factor = 1.0 + max(0.0, (COLOR_CLARITY_END - pos) / max(COLOR_CLARITY_END, 1))
    penalty = 0.0
    if min_distance < COLOR_CLARITY_SOFT_DISTANCE:
        penalty += (COLOR_CLARITY_SOFT_DISTANCE - min_distance) * 0.55 * early_factor
    if min_distance < COLOR_CLARITY_HARD_DISTANCE:
        penalty += (COLOR_CLARITY_HARD_DISTANCE - min_distance) * 0.7 * early_factor
    penalty += soft_pairs * 2.4 * early_factor
    penalty += hard_pairs * 2.8 * early_factor
    penalty += critical_pairs * 6.0 * early_factor
    return penalty


def hard_excluded(level: Dict[str, object], pos: int) -> bool:
    score = float(level["complexityScore"])
    tier = str(level["difficultyTier"])
    if pos <= STRICT_EASY_END and score > STRICT_EASY_MAX:
        return True
    if pos <= STRICT_MID_END and score > STRICT_MID_MAX:
        return True
    if pos <= PRE_SUPERHARD_END and tier == "超高压":
        return True
    if pos <= HIGH_SCORE_BLOCK_END and score > HIGH_SCORE_BLOCK_MAX:
        return True
    if pos <= FRONT_COMPLEXITY_END and score > FRONT_COMPLEXITY_MAX:
        return True
    if pos <= COLOR_CLARITY_END and float(level.get("colorMinDistance") or 999.0) < COLOR_CLARITY_HARD_DISTANCE:
        return True
    if pos <= COLOR_CLARITY_HARD_END and float(level.get("colorMinDistance") or 999.0) < COLOR_CLARITY_CRITICAL_DISTANCE:
        return True
    return False


def candidate_weight(
    level: Dict[str, object],
    pos: int,
    selection: Sequence[Dict[str, object]],
    cat_counts: Counter,
    rng: random.Random,
) -> float:
    stage = stage_for_pos(pos)
    score = float(level["complexityScore"])
    colors = int(level["colors"])
    filled = int(level["filled"])
    holes = int(level["holes"])
    sec_per_cell = float(level.get("secPerCell") or 0.65)
    tier = str(level["difficultyTier"])
    target = target_score(pos)
    superhard_used = sum(1 for item in selection if str(item["difficultyTier"]) == "超高压")
    featured = is_featured(level)
    showcase = is_showcase_pos(pos)
    featured_gap = gap_since(selection, is_featured)
    special_gap = gap_since(selection, is_special)
    _, _, _, stage_slots_left, featured_needed = featured_stage_state(selection, pos)

    weight = 100.0
    weight -= abs(score - target) * 4.4
    if score < stage["min_score"] - 3:
        weight -= (stage["min_score"] - 3 - score) * 1.6
    if score > stage["max_score"] + 2:
        weight -= (score - stage["max_score"] - 2) * 5.3

    if pos <= STRICT_EASY_END:
        weight -= filled / 55.0
        weight -= max(colors - 4, 0) * 2.1
        weight -= holes * 1.0
        weight += min(sec_per_cell, 0.9) * 4.8
        if is_special(level):
            weight += 4.1
        if str(level["category"]) == "图标/简笔轮廓":
            weight += 3.0
        if str(level["generatedName"]).startswith("小型"):
            weight += 1.3
    elif pos <= LIGHT_SEGMENT_END:
        weight -= max(colors - 5, 0) * 1.5
        weight -= max(filled - 260, 0) / 85.0
        weight += 2.4 if is_special(level) else 0.0
    elif pos <= MID_SEGMENT_END:
        weight -= max(colors - 7, 0) * 0.8
        weight += 1.4 if is_special(level) else 0.0
    else:
        if str(level["category"]) == "图案/普通拼豆图":
            weight += 0.8
        if tier == "超高压":
            if pos >= SUPERHARD_BONUS_POS and superhard_used < SUPERHARD_TARGET:
                weight += 4.2
            elif superhard_used >= SUPERHARD_TARGET:
                weight -= 0.8

    if featured:
        if pos <= STRICT_EASY_END:
            weight += FEATURED_BONUS_EARLY
        elif pos <= MID_SEGMENT_END:
            weight += FEATURED_BONUS_MID
        else:
            weight += FEATURED_BONUS_LATE
        if is_special(level):
            weight += 1.4
        if showcase:
            weight += SHOWCASE_FEATURED_BONUS
        if pos <= FRONT_COMPLEXITY_END and score > target + 3.5:
            weight -= 2.4
    elif featured_needed > 0:
        urgency = featured_needed / max(stage_slots_left, 1)
        weight -= urgency * 6.2

    if featured_needed > 0:
        urgency = featured_needed / max(stage_slots_left, 1)
        if featured:
            weight += 3.4 + urgency * 9.2
        elif pos > STRICT_EASY_END:
            weight -= urgency * 2.6

    if featured_gap >= featured_gap_limit(pos):
        over_gap = featured_gap - featured_gap_limit(pos) + 1
        if featured:
            weight += 1.8 + over_gap * 1.1
        else:
            weight -= 3.4 + over_gap * 1.6

    if special_gap >= special_gap_limit(pos):
        over_gap = special_gap - special_gap_limit(pos) + 1
        if is_special(level):
            weight += 2.2 + over_gap * 0.9
            if featured:
                weight += 0.8
        elif pos <= MID_SEGMENT_END:
            weight -= 1.4 + over_gap * 0.4

    if showcase:
        if is_special(level):
            weight += SHOWCASE_SPECIAL_BONUS
            if score <= target + 2.0:
                weight += 0.8
        elif pos <= MID_SEGMENT_END:
            weight -= 1.6

    if pos in PEAK_POSITIONS:
        weight += max(0.0, score - target) * 0.8
        if featured:
            weight += 0.9
    if pos in REST_POSITIONS:
        weight += max(0.0, target - score) * 0.9
        if is_special(level):
            weight += 0.9
        if featured and score <= target + 1.5:
            weight += 0.8

    recent = list(selection[-9:])
    recent20 = list(selection[-19:])
    if selection:
        if str(selection[-1]["category"]) == str(level["category"]):
            weight -= 4.2
        if is_special(level) and not is_special(selection[-1]):
            weight += 0.5
        if tier == "超高压" and str(selection[-1]["difficultyTier"]) == "超高压":
            weight -= 5.5
    if len(selection) >= 2 and all(str(item["category"]) == str(level["category"]) for item in selection[-2:]):
        weight -= 999.0
    if tier == "超高压" and len(selection) >= 2 and all(
        str(item["difficultyTier"]) == "超高压" for item in selection[-2:]
    ):
        weight -= 999.0

    recent_categories = {str(item["category"]) for item in recent}
    if str(level["category"]) not in recent_categories:
        weight += 1.7
    if len(recent_categories) < 3 and str(level["category"]) not in recent_categories:
        weight += 2.7

    recent_special = sum(1 for item in recent20 if is_special(item))
    if recent_special < 2 and is_special(level):
        weight += 4.5
    elif recent_special >= 3 and is_special(level) and pos <= LIGHT_SEGMENT_END:
        weight -= 0.8

    recent_featured = sum(1 for item in recent if is_featured(item))
    if recent_featured < 2 and featured:
        weight += 2.1
    elif recent_featured >= 5 and not featured and pos <= MID_SEGMENT_END:
        weight += 0.4

    if pos <= FRONT_COMPLEXITY_END and is_motif(level):
        motif_recent = sum(1 for item in selection[-5:] if is_motif(item))
        weight -= motif_recent * 0.8
        if featured and motif_recent >= 2:
            weight -= 0.9
    if showcase and pos <= MID_SEGMENT_END and is_motif(level) and not is_special(level):
        weight -= 0.6

    weight -= color_clarity_penalty(level, pos)
    weight -= cat_counts[str(level["category"])] * 0.12
    weight += rng.uniform(-0.35, 0.35)
    return weight


def merge_priority_candidates(
    priority: Sequence[Dict[str, object]],
    ranked: Sequence[Dict[str, object]],
    priority_limit: int,
    total_limit: int,
) -> List[Dict[str, object]]:
    merged: List[Dict[str, object]] = []
    seen: set[int] = set()

    for level in priority[:priority_limit]:
        level_id = int(level["levelId"])
        if level_id in seen:
            continue
        merged.append(level)
        seen.add(level_id)

    for level in ranked:
        if len(merged) >= total_limit:
            break
        level_id = int(level["levelId"])
        if level_id in seen:
            continue
        merged.append(level)
        seen.add(level_id)
    return merged


def pick_candidates(
    levels: Sequence[Dict[str, object]],
    pos: int,
    selection: Sequence[Dict[str, object]],
    cat_counts: Counter,
    rng: random.Random,
) -> List[Dict[str, object]]:
    available = [level for level in levels if not hard_excluded(level, pos)]
    if not available:
        available = list(levels)
    superhard_used = sum(1 for item in selection if str(item["difficultyTier"]) == "超高压")
    _, _, _, stage_slots_left, featured_needed = featured_stage_state(selection, pos)
    showcase = is_showcase_pos(pos)
    force_featured = bool(
        featured_needed > 0
        and (
            featured_needed >= stage_slots_left
            or stage_slots_left <= featured_needed + 3
            or gap_since(selection, is_featured) >= featured_gap_limit(pos)
            or showcase
        )
    )

    stage = stage_for_pos(pos)
    ranked: List[tuple[float, Dict[str, object]]] = []
    for relax in RELAX_STEPS:
        ranked.clear()
        for level in available:
            score = float(level["complexityScore"])
            tier = str(level["difficultyTier"])
            if pos <= PRE_SUPERHARD_END and tier == "超高压":
                continue
            if tier == "超高压":
                if pos < SUPERHARD_OPEN_POS:
                    continue
                if superhard_used >= SUPERHARD_MAX:
                    continue
                if len(selection) >= 2 and all(str(item["difficultyTier"]) == "超高压" for item in selection[-2:]):
                    continue
            if score < stage["min_score"] - relax or score > stage["max_score"] + relax:
                continue
            ranked.append((candidate_weight(level, pos, selection, cat_counts, rng), level))
        if ranked:
            break

    if not ranked:
        ranked = [(candidate_weight(level, pos, selection, cat_counts, rng), level) for level in levels]

    ranked.sort(key=lambda item: item[0], reverse=True)
    ranked_levels = [item[1] for item in ranked]
    featured_ranked = [level for _, level in ranked if is_featured(level)]
    showcase_featured = [level for level in featured_ranked if is_special(level)]
    showcase_special = [level for _, level in ranked if is_special(level)]

    if force_featured and featured_ranked:
        priority = showcase_featured if showcase and showcase_featured else featured_ranked
        return merge_priority_candidates(priority, ranked_levels, priority_limit=8, total_limit=12)
    if featured_needed > 0 and featured_ranked:
        priority = showcase_featured if showcase and showcase_featured else featured_ranked
        return merge_priority_candidates(priority, ranked_levels, priority_limit=5, total_limit=12)
    if showcase and showcase_special:
        return merge_priority_candidates(showcase_special, ranked_levels, priority_limit=4, total_limit=12)
    return ranked_levels[:12]


def build_selection(levels: Sequence[Dict[str, object]], seed: int) -> List[Dict[str, object]]:
    rng = random.Random(seed)
    by_id = {int(level["levelId"]): dict(level) for level in levels}
    forced_positions = {1: 1}

    selected: List[Dict[str, object]] = []
    used_ids: set[int] = set()
    cat_counts: Counter = Counter()

    for pos in range(1, SELECTION_COUNT + 1):
        if pos in forced_positions:
            level = dict(by_id[forced_positions[pos]])
        else:
            remaining = [level for level in levels if int(level["levelId"]) not in used_ids]
            candidates = pick_candidates(remaining, pos, selected, cat_counts, rng)
            _, _, _, stage_slots_left, featured_needed = featured_stage_state(selected, pos)
            featured_candidates = [level for level in candidates if is_featured(level)]
            showcase = is_showcase_pos(pos)
            featured_gap = gap_since(selected, is_featured)
            special_gap = gap_since(selected, is_special)
            showcase_featured = [level for level in featured_candidates if is_special(level)]
            showcase_special = [level for level in candidates if is_special(level)]
            top = candidates[: min(6, len(candidates))]
            force_featured = featured_candidates and (
                featured_needed >= stage_slots_left
                or (featured_needed > 0 and stage_slots_left <= featured_needed + 3)
                or featured_gap >= featured_gap_limit(pos)
                or (showcase and featured_needed > 0)
            )
            if force_featured:
                priority = showcase_featured if showcase and showcase_featured else featured_candidates
                top = merge_priority_candidates(priority, featured_candidates, priority_limit=6, total_limit=6)
            elif featured_candidates and featured_needed > 0:
                priority = showcase_featured if showcase and showcase_featured else featured_candidates
                top = merge_priority_candidates(priority, candidates, priority_limit=4, total_limit=6)
            elif showcase and showcase_special:
                top = merge_priority_candidates(showcase_special, candidates, priority_limit=3, total_limit=6)
            elif special_gap >= special_gap_limit(pos) and showcase_special:
                top = merge_priority_candidates(showcase_special, candidates, priority_limit=3, total_limit=6)
            weights = [max(1e-4, 100.0 + candidate_weight(level, pos, selected, cat_counts, rng)) for level in top]
            level = dict(rng.choices(top, weights=weights, k=1)[0])

        level["launchOrder"] = pos
        level["sourceLevelId"] = int(level["levelId"])
        level["stageName"] = stage_for_pos(pos)["name"]
        level["stageLabel"] = stage_for_pos(pos)["label"]
        level["targetScore"] = target_score(pos)
        level["role"] = tag_role(pos, level)
        level["selectionReason"] = build_reason(level, pos)
        selected.append(level)
        used_ids.add(int(level["levelId"]))
        cat_counts[str(level["category"])] += 1

    return selected


def build_reason(level: Dict[str, object], pos: int) -> str:
    bits: List[str] = []
    score = float(level["complexityScore"])
    if is_featured(level):
        bits.append("精选优先")
    if is_showcase_pos(pos) and is_special(level):
        bits.append("承担内容爆点")
    if pos <= STRICT_EASY_END:
        bits.append("前段压低理解成本")
        if is_special(level):
            bits.append("题材识别快")
        if int(level["colors"]) <= 4:
            bits.append("颜色负担较轻")
    elif pos in REST_POSITIONS:
        bits.append("用于阶段缓冲")
        if is_special(level):
            bits.append("顺带补视觉新鲜感")
    elif pos in PEAK_POSITIONS:
        bits.append("承担阶段小高潮")
        if score >= 86:
            bits.append("挑战感更强")
    else:
        bits.append("贴合当前阶段目标分数")
        if is_special(level):
            bits.append("补内容感")
    if str(level["category"]) == "图标/简笔轮廓":
        bits.append("轮廓清晰")
    elif str(level["category"]).startswith("动物/"):
        bits.append("传播素材感强")
    return "，".join(bits[:3])


def evaluate(selection: Sequence[Dict[str, object]], all_levels: Sequence[Dict[str, object]]) -> Dict[str, object]:
    cost = 0.0
    score_over_92 = 0
    superhard_count = 0
    featured_count = sum(1 for item in selection if is_featured(item))
    early_color_soft = 0
    early_color_hard = 0
    early_color_sum = 0.0
    violations: List[str] = []

    for pos, level in enumerate(selection, start=1):
        score = float(level["complexityScore"])
        tier = str(level["difficultyTier"])
        target = float(level["targetScore"])
        cost += abs(score - target)
        if score > 92:
            score_over_92 += 1
        if tier == "超高压":
            superhard_count += 1
            if pos <= PRE_SUPERHARD_END:
                cost += 200
                violations.append(f"超高压过早: {pos} -> {level['levelId']}")
        if pos <= STRICT_EASY_END and score > STRICT_EASY_MAX:
            cost += 120
        if pos <= STRICT_MID_END and score > STRICT_MID_MAX:
            cost += 100
        if pos <= FRONT_COMPLEXITY_END and int(level["colors"]) > 7:
            cost += 25
        if pos <= COLOR_CLARITY_END:
            min_distance = float(level.get("colorMinDistance") or 999.0)
            early_color_sum += min_distance
            if min_distance < COLOR_CLARITY_SOFT_DISTANCE:
                early_color_soft += 1
                cost += (COLOR_CLARITY_SOFT_DISTANCE - min_distance) * 1.3
            if min_distance < COLOR_CLARITY_HARD_DISTANCE:
                early_color_hard += 1
                cost += (COLOR_CLARITY_HARD_DISTANCE - min_distance) * 1.7
                violations.append(f"前{COLOR_CLARITY_END}颜色过近: {pos} -> {level['levelId']} ({min_distance:.1f})")

    if score_over_92 > SCORE_OVER_92_LIMIT:
        cost += (score_over_92 - SCORE_OVER_92_LIMIT) * 55
        violations.append(f"score>92 过多: {score_over_92}")
    if not SUPERHARD_MIN <= superhard_count <= SUPERHARD_MAX:
        cost += abs(superhard_count - SUPERHARD_TARGET) * 40
        violations.append(f"超高压数量不在推荐区间: {superhard_count}")
    if featured_count < FEATURED_TARGET_TOTAL:
        cost += (FEATURED_TARGET_TOTAL - featured_count) * 3.6
        violations.append(f"精选数量不足: {featured_count}/{FEATURED_TARGET_TOTAL}")
    if early_color_hard > max(2, COLOR_CLARITY_END // 40):
        cost += (early_color_hard - max(2, COLOR_CLARITY_END // 40)) * 30
    if early_color_soft > max(10, COLOR_CLARITY_END // 8):
        cost += (early_color_soft - max(10, COLOR_CLARITY_END // 8)) * 8

    for idx in range(2, len(selection)):
        cats = [str(selection[idx - delta]["category"]) for delta in (2, 1, 0)]
        if cats[0] == cats[1] == cats[2]:
            cost += 150
            violations.append(f"连续三关同类: {idx - 1}-{idx + 1}")

    for start in range(0, len(selection) - 9):
        window = selection[start : start + 10]
        unique_categories = len({str(item["category"]) for item in window})
        if unique_categories < 3:
            cost += (3 - unique_categories) * 90
            violations.append(f"10关类别不足3种: {start + 1}-{start + 10}")

    for start in range(0, len(selection) - 19):
        window = selection[start : start + 20]
        special_count = sum(1 for item in window if is_special(item))
        if special_count < 2:
            cost += (2 - special_count) * 70
            violations.append(f"20关强识别题材不足: {start + 1}-{start + 20}")

    early_window = selection[:SPECIAL_WINDOW]
    early_special = sum(1 for item in early_window if is_special(item))
    if early_special < SPECIAL_FLOOR:
        cost += (SPECIAL_FLOOR - early_special) * 18
        violations.append(f"前{SPECIAL_WINDOW}强识别题材偏少: {early_special}")

    all_easy = sum(1 for level in all_levels if float(level["complexityScore"]) <= 65)
    stage_summaries = []
    for stage in STAGES:
        rows = [item for item in selection if stage["start"] <= int(item["launchOrder"]) <= stage["end"]]
        avg_score = round(sum(float(item["complexityScore"]) for item in rows) / len(rows), 2)
        categories = Counter(str(item["category"]) for item in rows).most_common(5)
        stage_featured = sum(1 for item in rows if is_featured(item))
        stage_target = int(FEATURED_TARGETS.get(stage["label"], 0))
        if stage_featured < stage_target:
            cost += (stage_target - stage_featured) * 12
            violations.append(f"{stage['label']}精选不足: {stage_featured}/{stage_target}")
        stage_summaries.append(
            {
                "stage": stage["name"],
                "label": stage["label"],
                "avgScore": avg_score,
                "difficulty": dict(Counter(str(item["difficultyTier"]) for item in rows)),
                "featuredCount": stage_featured,
                "featuredTarget": stage_target,
                "topCategories": [{"category": cat, "count": count} for cat, count in categories],
                "restLevels": [int(item["levelId"]) for item in rows if item["role"] == "休息关"],
                "peakLevels": [int(item["levelId"]) for item in rows if item["role"] == "小高潮关"],
            }
        )

    risk_notes = []
    if all_easy < EASY_POOL_WARNING:
        risk_notes.append(f"全库 complexityScore<=65 的关卡只有 {all_easy} 个，前段天然偏硬。")
    if early_special < SPECIAL_RISK:
        risk_notes.append(f"前{SPECIAL_WINDOW}关强识别题材仅 {early_special} 个，仍有纹样疲劳风险。")
    if score_over_92 >= max(1, SCORE_OVER_92_LIMIT):
        risk_notes.append(f"尾段高压关占比已接近上限，score>92 的关卡共有 {score_over_92} 个。")
    if featured_count < FEATURED_TARGET_TOTAL:
        risk_notes.append(f"当前精选关仅 {featured_count} 个，低于目标 {FEATURED_TARGET_TOTAL} 个。")
    if early_color_hard > 0:
        risk_notes.append(f"前{COLOR_CLARITY_END}关仍有 {early_color_hard} 关存在明显近色组合。")

    return {
        "cost": round(cost, 2),
        "scoreOver92": score_over_92,
        "superhardCount": superhard_count,
        "featuredPool": FEATURED_POOL_COUNT,
        "featuredCount": featured_count,
        "featuredTarget": FEATURED_TARGET_TOTAL,
        "earlyColorAvgMinDistance": round(early_color_sum / max(1, min(COLOR_CLARITY_END, len(selection))), 2),
        "earlyColorSoftCount": early_color_soft,
        "earlyColorHardCount": early_color_hard,
        "violations": violations[:80],
        "stageSummaries": stage_summaries,
        "riskNotes": risk_notes,
    }


def choose_best(levels: Sequence[Dict[str, object]], tries: int) -> tuple[List[Dict[str, object]], Dict[str, object]]:
    resolve_featured_targets(levels)
    best_selection: List[Dict[str, object]] | None = None
    best_report: Dict[str, object] | None = None
    for seed in range(tries):
        selection = build_selection(levels, seed=20260424 + seed * 17)
        report = evaluate(selection, levels)
        if best_report is None or float(report["cost"]) < float(best_report["cost"]):
            best_selection = selection
            best_report = report
    assert best_selection is not None and best_report is not None
    return best_selection, best_report


def recommended_stage(score: float) -> str:
    for stage in STAGES:
        if score <= float(stage["max_score"]):
            return f"{stage['label']}补位"
    return f"{STAGES[-1]['label']}补位"


def build_alternates(selection: Sequence[Dict[str, object]], levels: Sequence[Dict[str, object]]) -> List[Dict[str, object]]:
    selected_ids = {int(item["levelId"]) for item in selection}
    unused = [dict(level) for level in levels if int(level["levelId"]) not in selected_ids]
    unused.sort(key=lambda item: (0 if is_featured(item) else 1, float(item["complexityScore"]), int(item["filled"])))

    alternates: List[Dict[str, object]] = []
    stage_limits = Counter()
    for level in unused:
        stage = recommended_stage(float(level["complexityScore"]))
        if stage_limits[stage] >= 6:
            continue
        stage_limits[stage] += 1
        alternates.append(
            {
                "levelId": int(level["levelId"]),
                "sourceLevelId": int(level["levelId"]),
                "generatedName": level["generatedName"],
                "category": level["category"],
                "complexityScore": level["complexityScore"],
                "difficultyTier": level["difficultyTier"],
                "isFeatured": is_featured(level),
                "recommendedStage": stage,
                "replacementUse": build_alternate_reason(level),
            }
        )
        if len(alternates) >= 30:
            break
    return alternates


def build_alternate_reason(level: Dict[str, object]) -> str:
    if is_featured(level):
        return "精选补位，适合优先替换非精选关"
    if is_special(level):
        return "用于补强内容感和视觉多样性"
    if float(level["complexityScore"]) <= 75:
        return "可替换前中段偏硬关卡"
    if str(level["difficultyTier"]) == "超高压":
        return "用于替换尾段高压展示关"
    return "可替换同阶段常规关"


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_markdown(path: Path, payload: Dict[str, object]) -> None:
    summary = payload["summary"]
    selection = payload["selection"]
    alternates = payload["alternates"]

    lines = [
        f"# {SELECTION_TITLE}",
        "",
        f"- 生成方式：`tools/select_launch_levels.py`",
        f"- 关卡数量：{SELECTION_COUNT}",
        f"- 综合成本：{summary['cost']}",
        f"- 精选池规模：{summary['featuredPool']}",
        f"- 精选关卡数：{summary['featuredCount']} / {summary['featuredTarget']}",
        f"- `score > 92` 关卡数：{summary['scoreOver92']}",
        f"- `超高压` 关卡数：{summary['superhardCount']}",
        f"- 前{COLOR_CLARITY_END}关平均最小色距：{summary['earlyColorAvgMinDistance']}",
        f"- 前{COLOR_CLARITY_END}关近色软告警：{summary['earlyColorSoftCount']}",
        f"- 前{COLOR_CLARITY_END}关近色硬告警：{summary['earlyColorHardCount']}",
        "",
        "## 风险提示",
        "",
    ]
    if summary["riskNotes"]:
        lines.extend(f"- {note}" for note in summary["riskNotes"])
    else:
        lines.append("- 当前候选未触发额外风险提示。")

    lines += ["", "## 分段总结", ""]
    for stage in summary["stageSummaries"]:
        lines.append(f"### {stage['label']} {stage['stage']}")
        lines.append(f"- 平均 complexityScore：{stage['avgScore']}")
        lines.append(f"- 难度分布：{json.dumps(stage['difficulty'], ensure_ascii=False)}")
        lines.append(f"- 精选占比：{stage['featuredCount']} / {stage['featuredTarget']}")
        lines.append(
            "- 主要分类："
            + " / ".join(f"{row['category']} x{row['count']}" for row in stage["topCategories"])
        )
        if stage["restLevels"]:
            lines.append("- 休息关：" + ", ".join(map(str, stage["restLevels"][:8])))
        if stage["peakLevels"]:
            lines.append("- 小高潮关：" + ", ".join(map(str, stage["peakLevels"][:8])))
        lines.append("")

    lines += [
        f"## 首发 {SELECTION_COUNT} 关表",
        "",
        "| 上线序号 | levelId | 名称 | 分类 | 分数 | 难度 | 角色 | 入选原因 |",
        "|---:|---:|---|---|---:|---|---|---|",
    ]
    for row in selection:
        lines.append(
            f"| {row['launchOrder']} | {row['levelId']} | {row['generatedName']} | "
            f"{row['category']} | {row['complexityScore']} | {row['difficultyTier']} | "
            f"{row['role']} | {row['selectionReason']} |"
        )

    lines += [
        "",
        "## 备选 30 关",
        "",
        "| levelId | 名称 | 分类 | 分数 | 难度 | 精选 | 推荐补位 | 说明 |",
        "|---:|---|---|---:|---|---|---|---|",
    ]
    for row in alternates:
        lines.append(
            f"| {row['levelId']} | {row['generatedName']} | {row['category']} | "
            f"{row['complexityScore']} | {row['difficultyTier']} | "
            f"{'是' if row['isFeatured'] else '否'} | {row['recommendedStage']} | {row['replacementUse']} |"
        )

    if summary["violations"]:
        lines += ["", "## 约束告警", ""]
        lines.extend(f"- {item}" for item in summary["violations"])

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def iter_color_values(cells: object):
    if not isinstance(cells, list):
        return
    for item in cells:
        if isinstance(item, list):
            for nested in item:
                yield nested
            continue
        yield item


def color_count_from_source(data: Dict[str, object]) -> int:
    return len({int(color) for color in iter_color_values(data.get("correctColorArr")) if int(color) != 0})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Select a launch lineup.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--count", type=int, choices=sorted(PROFILE_CONFIGS), default=300)
    parser.add_argument("--json-out")
    parser.add_argument("--md-out")
    parser.add_argument("--tries", type=int, default=240)
    return parser.parse_args()


def load_levels(path: Path) -> List[Dict[str, object]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    levels = [dict(row) for row in payload["levels"]]
    filtered: List[Dict[str, object]] = []
    for row in levels:
        level_path = ROOT / str(row["file"])
        if level_path.exists():
            data = json.loads(level_path.read_text(encoding="utf-8"))
            row["isFeatured"] = data.get("isFeatured") is True
            row["online"] = data.get("online") is True
            color_ids = sorted({int(color) for color in iter_color_values(data.get("correctColorArr")) if int(color) != 0})
            pair_distances = [color_distance(color_a, color_b) for idx, color_a in enumerate(color_ids) for color_b in color_ids[idx + 1 :]]
            row["colors"] = len(color_ids)
            row["colorIds"] = color_ids
            row["colorMinDistance"] = round(min(pair_distances), 2) if pair_distances else 999.0
            row["nearColorPairsSoft"] = sum(1 for distance in pair_distances if distance < COLOR_CLARITY_SOFT_DISTANCE)
            row["nearColorPairsHard"] = sum(1 for distance in pair_distances if distance < COLOR_CLARITY_HARD_DISTANCE)
            row["nearColorPairsCritical"] = sum(1 for distance in pair_distances if distance < COLOR_CLARITY_CRITICAL_DISTANCE)
            row["sourceLevelId"] = int(row["levelId"])
        else:
            row["isFeatured"] = False
            row["online"] = False
            row["sourceLevelId"] = int(row["levelId"])
        if int(row.get("colors", 0)) <= 1:
            continue
        filtered.append(row)
    return filtered


def main() -> None:
    args = parse_args()
    config = apply_profile(args.count)
    levels = load_levels(Path(args.input))
    selection, summary = choose_best(levels, tries=args.tries)
    alternates = build_alternates(selection, levels)

    output = {
        "profile": {"count": SELECTION_COUNT, "title": SELECTION_TITLE},
        "summary": summary,
        "selection": selection,
        "alternates": alternates,
    }

    json_out = Path(args.json_out) if args.json_out else Path(config["default_json"])
    md_out = Path(args.md_out) if args.md_out else Path(config["default_md"])
    write_json(json_out, output)
    write_markdown(md_out, output)


if __name__ == "__main__":
    main()
