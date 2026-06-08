#!/usr/bin/env python3
"""Generate zt_level_*.json (theme challenge levels) under assets/RemoteBundle/LevelData/.
Each pattern is described as ASCII art:
  '.' = empty (color 0)
  digits/letters map to production color IDs / bNNN texture IDs (see COLOR_MAP).
"""

import json
import os
import random
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "RemoteBundle" / "LevelData"

COLOR_MAP = {
    '.': 0,
    'R': 1,    # rose
    'O': 2,    # cyan
    'Y': 3,    # gold
    'G': 4,    # orange
    'B': 5,    # peach
    'P': 6,    # cream
    'I': 7,    # indigo
    'V': 8,    # violet
    'L': 9,    # light green
    'D': 10,   # red
    'E': 11,   # emerald green
    'F': 12,   # forest dark green
    'C': 13,   # cyan/teal
    'K': 14,   # pink
    'N': 15,   # lavender
    'U': 16,   # brown
    'M': 17,   # maroon
    'A': 18,   # navy
    'X': 19,   # near-black
    'W': 20,   # warm white
}

LEVELS = []

# ============ 主题 1：动物 (1001-1004) ============

# 1001 — 小狗
LEVELS.append({
    "levelId": 1001,
    "theme": "动物",
    "name": "小狗",
    "art": [
        "..U..U..",
        ".UUUUUU.",
        "UUWWWWUU",
        "UWXWWXWU",
        "WWWWWWWW",
        "WWWRRWWW",
        ".WWWWWW.",
        "..WWWW..",
    ],
    "timeLimit": 90,
})

# 1002 — 小猫
LEVELS.append({
    "levelId": 1002,
    "theme": "动物",
    "name": "小猫",
    "art": [
        "Y......Y",
        "YY....YY",
        "YYYYYYYY",
        "YXYYYYXY",
        "YYYDYYYY",
        "YYYYYYYY",
        ".YYYYYY.",
        "..YYYY..",
    ],
    "timeLimit": 90,
})

# 1003 — 兔子
LEVELS.append({
    "levelId": 1003,
    "theme": "动物",
    "name": "兔子",
    "art": [
        "W..W....",
        "WW.WW...",
        "WWWWW...",
        "WWWWWW..",
        "WXWWXW..",
        "WWWKWW..",
        ".WWWW...",
        "..WW....",
    ],
    "timeLimit": 90,
})

# 1004 — 熊
LEVELS.append({
    "levelId": 1004,
    "theme": "动物",
    "name": "熊",
    "art": [
        "UU....UU",
        "UUU..UUU",
        "UUUUUUUU",
        "UXUUUUXU",
        "UUUWUUUU",
        "UUWWWWUU",
        ".UUWWUU.",
        "..UUUU..",
    ],
    "timeLimit": 90,
})

# ============ 主题 2：美食 (1101-1104) ============

# 1101 — 苹果
LEVELS.append({
    "levelId": 1101,
    "theme": "美食",
    "name": "苹果",
    "art": [
        "...F....",
        "..FF....",
        ".DDDDDD.",
        "DDDDDDDD",
        "DDDWWDDD",
        "DDDDDDDD",
        "DDDDDDDD",
        ".DDDDDD.",
    ],
    "timeLimit": 90,
})

# 1102 — 蛋糕
LEVELS.append({
    "levelId": 1102,
    "theme": "美食",
    "name": "蛋糕",
    "art": [
        "...R....",
        "..RRR...",
        ".KKKKKK.",
        "KKKKKKKK",
        "WWWWWWWW",
        "UUUUUUUU",
        "UWWUWWUU",
        "UUUUUUUU",
    ],
    "timeLimit": 90,
})

# 1103 — 西瓜
LEVELS.append({
    "levelId": 1103,
    "theme": "美食",
    "name": "西瓜",
    "art": [
        "..FFFF..",
        ".FFFFFF.",
        "FFRRRRFF",
        "FRRXRRRF",
        "FRRRRXRF",
        "FRXRRRRF",
        ".RRRRRR.",
        "..RRRR..",
    ],
    "timeLimit": 90,
})

# 1104 — 冰淇淋
LEVELS.append({
    "levelId": 1104,
    "theme": "美食",
    "name": "冰淇淋",
    "art": [
        "..KKKK..",
        ".KKKKKK.",
        "KKKKKKKK",
        ".WWWWWW.",
        ".UWWWWU.",
        "..UWWU..",
        "..UWWU..",
        "...UU...",
    ],
    "timeLimit": 90,
})

# ============ 主题 3：节日 (1201-1204) ============

# 1201 — 圣诞树
LEVELS.append({
    "levelId": 1201,
    "theme": "节日",
    "name": "圣诞树",
    "art": [
        "...K....",
        "...F....",
        "..FFF...",
        ".FFFFF..",
        "FFFFFFF.",
        ".FFFFF..",
        "FFFFFFF.",
        "...UU...",
    ],
    "timeLimit": 90,
})

# 1202 — 红心
LEVELS.append({
    "levelId": 1202,
    "theme": "节日",
    "name": "红心",
    "art": [
        ".DD..DD.",
        "DDDDDDDD",
        "DDDDDDDD",
        "DDDDDDDD",
        ".DDDDDD.",
        "..DDDD..",
        "...DD...",
        "........",
    ],
    "timeLimit": 90,
})

# 1203 — 灯笼
LEVELS.append({
    "levelId": 1203,
    "theme": "节日",
    "name": "灯笼",
    "art": [
        "...Y....",
        "..XXX...",
        ".DDDDDD.",
        "DDDYDDDD",
        "DYDDDDYD",
        "DDDDYDDD",
        ".DDDDDD.",
        "..XXXX..",
    ],
    "timeLimit": 90,
})

# 1204 — 礼物
LEVELS.append({
    "levelId": 1204,
    "theme": "节日",
    "name": "礼物",
    "art": [
        "..R..R..",
        ".RRRRRR.",
        "..RRRR..",
        "DDDDDDDD",
        "DDDYDDDD",
        "DDDYDDDD",
        "DDDYDDDD",
        "DDDDDDDD",
    ],
    "timeLimit": 90,
})

# ============ 主题 4：植物 (1301-1304) ============

# 1301 — 花
LEVELS.append({
    "levelId": 1301,
    "theme": "植物",
    "name": "小花",
    "art": [
        "..R..R..",
        ".RRRRRR.",
        "RRRYRRRR",
        ".RRRRRR.",
        "..RRRR..",
        "...F....",
        "..FFF...",
        "...F....",
    ],
    "timeLimit": 90,
})

# 1302 — 树
LEVELS.append({
    "levelId": 1302,
    "theme": "植物",
    "name": "小树",
    "art": [
        "...F....",
        "..FFF...",
        ".FFFFF..",
        "FFFFFFF.",
        ".FFFFF..",
        "..FFF...",
        "...U....",
        "...U....",
    ],
    "timeLimit": 90,
})

# 1303 — 仙人掌
LEVELS.append({
    "levelId": 1303,
    "theme": "植物",
    "name": "仙人掌",
    "art": [
        "...F....",
        ".F.FF...",
        ".FFFF.F.",
        ".FFFFFF.",
        "..FFFF..",
        "..FFFF..",
        "..UUUU..",
        ".UUUUUU.",
    ],
    "timeLimit": 90,
})

# 1304 — 蘑菇
LEVELS.append({
    "levelId": 1304,
    "theme": "植物",
    "name": "蘑菇",
    "art": [
        "..DDDD..",
        ".DDDDDD.",
        "DDWDDDWD",
        "DDDDWDDD",
        "DWDDDDDD",
        ".WWWWWW.",
        "..WWWW..",
        "..WWWW..",
    ],
    "timeLimit": 90,
})


def art_to_correct(art):
    rows = len(art)
    cols = len(art[0])
    grid = []
    for r in range(rows):
        row = []
        for c in range(cols):
            ch = art[r][c]
            if ch not in COLOR_MAP:
                raise ValueError(f"unknown color char {ch!r}")
            row.append(COLOR_MAP[ch])
        grid.append(row)
    return grid


def shuffle_within_shape(correct, seed):
    """Permute non-zero cells in-place so the visible layout is shuffled."""
    rng = random.Random(seed)
    flat_positions = []
    flat_values = []
    for r, row in enumerate(correct):
        for c, v in enumerate(row):
            if v != 0:
                flat_positions.append((r, c))
                flat_values.append(v)
    rng.shuffle(flat_values)
    init = [[0] * len(correct[0]) for _ in range(len(correct))]
    for (r, c), v in zip(flat_positions, flat_values):
        init[r][c] = v
    # ensure shuffled differs from correct (best-effort)
    if init == correct and len(flat_values) > 1:
        flat_values[0], flat_values[1] = flat_values[1], flat_values[0]
        init = [[0] * len(correct[0]) for _ in range(len(correct))]
        for (r, c), v in zip(flat_positions, flat_values):
            init[r][c] = v
    return init


def write_meta(json_path: Path):
    meta_path = Path(str(json_path) + ".meta")
    meta = {
        "ver": "2.0.1",
        "importer": "json",
        "imported": True,
        "uuid": str(uuid.uuid4()),
        "files": [".json"],
        "subMetas": {},
        "userData": {}
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for spec in LEVELS:
        correct = art_to_correct(spec["art"])
        rows = len(correct)
        cols = len(correct[0])
        filled_count = sum(1 for row in correct for v in row if v != 0)
        color_stats = {}
        for row in correct:
            for v in row:
                if v != 0:
                    color_stats[str(v)] = color_stats.get(str(v), 0) + 1
        init = shuffle_within_shape(correct, spec["levelId"])

        data = {
            "levelId": spec["levelId"],
            "theme": spec["theme"],
            "levelName": spec["name"],
            "boardWidth": cols,
            "boardHeight": rows,
            "timeLimit": spec["timeLimit"],
            "slotTotalCount": filled_count,
            "correctColorArr": correct,
            "initRandomColorArr": init,
            "filledCellCount": filled_count,
            "colorCount": len(color_stats),
            "colorStats": color_stats,
            "displacementRatio": 1,
            "initShuffleMaxGroupsPerColor": 4,
            "online": False,
            "isFeatured": False,
            "levelCategory": "theme"
        }

        out_json = OUT_DIR / f"zt_level_{spec['levelId']}.json"
        out_json.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        write_meta(out_json)
        print(f"wrote {out_json.name} ({cols}x{rows}, {filled_count} cells, {len(color_stats)} colors)")


if __name__ == "__main__":
    main()
