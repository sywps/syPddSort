from __future__ import annotations

import argparse
import json
import math
import shutil
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Sequence, Tuple


ROOT = Path(__file__).resolve().parents[1]
LEVEL_DIR = ROOT / "assets" / "LevelData"
REPORT_DIR = ROOT / "temp"
DIRS_8 = [
    (-1, -1), (-1, 0), (-1, 1),
    (0, -1),           (0, 1),
    (1, -1),  (1, 0),  (1, 1),
]
PROFILE_CONFIGS = {
    "strong": {
        "penaltyBySize": {
            1: 120,
            2: 84,
            3: 54,
            4: 30,
            5: 12,
            6: 5,
        },
        "focusMaxSize": 4,
        "backupPrefix": "backup_mainline_strong_fragment_rewrite",
        "reportPrefix": "formal_level_fragmentation_rewrite",
    },
    "strong-weak": {
        "penaltyBySize": {
            1: 140,
            2: 98,
            3: 68,
            4: 42,
            5: 24,
            6: 16,
        },
        "focusMaxSize": 6,
        "backupPrefix": "backup_mainline_strong_weak_fragment_rewrite",
        "reportPrefix": "formal_level_fragmentation_rewrite_strong_weak",
    },
}
MAX_DEST_CANDIDATES = 18
MAX_SRC_CANDIDATES = 3
MAX_FALLBACK_RING = 12
MAX_FALLBACK_DONORS = 8


@dataclass(frozen=True)
class Component:
    comp_id: int
    color: int
    cells: Tuple[int, ...]
    size: int
    centroid_row: float
    centroid_col: float


@dataclass(frozen=True)
class Analysis:
    components: Tuple[Component, ...]
    comp_of: Tuple[int, ...]
    penalty: int
    strong_count: int
    strong_cells: int
    weak_count: int
    small_count_1_6: int
    metrics: Tuple[int, int, int, int, int]


def parse_level_ids(spec: str) -> List[int]:
    result: List[int] = []
    for chunk in spec.split(","):
        part = chunk.strip()
        if not part:
            continue
        if "-" in part:
            start_s, end_s = part.split("-", 1)
            start = int(start_s)
            end = int(end_s)
            if end < start:
                start, end = end, start
            result.extend(range(start, end + 1))
        else:
            result.append(int(part))
    return sorted(set(result))


def level_path(level_id: int) -> Path:
    return LEVEL_DIR / f"level_{level_id}.json"


def count_color(counter_like: Sequence[int]) -> Dict[int, int]:
    counter = Counter(counter_like)
    if 0 in counter:
        del counter[0]
    return dict(sorted(counter.items()))


class LevelOptimizer:
    def __init__(self, level_id: int, correct: List[List[int]], init_colors: List[List[int]], profile_name: str) -> None:
        self.level_id = level_id
        self.correct = correct
        self.init = init_colors
        self.profile_name = profile_name
        self.profile = PROFILE_CONFIGS[profile_name]
        self.penalty_by_size: Dict[int, int] = self.profile["penaltyBySize"]
        self.focus_max_size: int = int(self.profile["focusMaxSize"])
        self.height = len(correct)
        self.width = len(correct[0]) if correct else 0
        self.positions: List[Tuple[int, int]] = []
        self.targets: List[int] = []
        self.original_colors: List[int] = []
        self.index_of: Dict[Tuple[int, int], int] = {}
        for row in range(self.height):
            correct_row = correct[row]
            init_row = init_colors[row]
            for col in range(self.width):
                color = init_row[col]
                if color > 0 and color != correct_row[col]:
                    idx = len(self.positions)
                    self.positions.append((row, col))
                    self.targets.append(correct_row[col])
                    self.original_colors.append(color)
                    self.index_of[(row, col)] = idx
        self.neighbors: List[Tuple[int, ...]] = []
        for row, col in self.positions:
            linked: List[int] = []
            for dr, dc in DIRS_8:
                key = (row + dr, col + dc)
                idx = self.index_of.get(key)
                if idx is not None:
                    linked.append(idx)
            self.neighbors.append(tuple(linked))
        self.original_counts = count_color(self.original_colors)

    def analyze(self, colors: Sequence[int]) -> Analysis:
        total = len(colors)
        visited = [False] * total
        comp_of = [-1] * total
        components: List[Component] = []
        penalty = 0
        strong_count = 0
        strong_cells = 0
        weak_count = 0
        small_count_1_6 = 0
        for start in range(total):
            if visited[start]:
                continue
            color = colors[start]
            stack = [start]
            visited[start] = True
            cells: List[int] = []
            row_sum = 0
            col_sum = 0
            while stack:
                idx = stack.pop()
                cells.append(idx)
                row, col = self.positions[idx]
                row_sum += row
                col_sum += col
                for nb in self.neighbors[idx]:
                    if visited[nb] or colors[nb] != color:
                        continue
                    visited[nb] = True
                    stack.append(nb)
            size = len(cells)
            comp_id = len(components)
            for idx in cells:
                comp_of[idx] = comp_id
            if size <= 4:
                strong_count += 1
                strong_cells += size
            if size <= 6:
                small_count_1_6 += 1
            if size == 5 or size == 6:
                weak_count += 1
            penalty += self.penalty_by_size.get(size, 0)
            components.append(Component(
                comp_id=comp_id,
                color=color,
                cells=tuple(cells),
                size=size,
                centroid_row=row_sum / size,
                centroid_col=col_sum / size,
            ))
        metrics = (penalty, strong_count, strong_cells, weak_count, len(components))
        return Analysis(
            components=tuple(components),
            comp_of=tuple(comp_of),
            penalty=penalty,
            strong_count=strong_count,
            strong_cells=strong_cells,
            weak_count=weak_count,
            small_count_1_6=small_count_1_6,
            metrics=metrics,
        )

    def allowed_color(self, idx: int, color: int) -> bool:
        return color != self.targets[idx]

    def color_neighbor_count(self, colors: Sequence[int], idx: int, color: int) -> int:
        total = 0
        for nb in self.neighbors[idx]:
            if colors[nb] == color:
                total += 1
        return total

    def component_size(self, analysis: Analysis, idx: int) -> int:
        return analysis.components[analysis.comp_of[idx]].size

    def evaluate_swap(self, colors: Sequence[int], left: int, right: int) -> Tuple[Analysis, List[int]] | None:
        if left == right:
            return None
        left_color = colors[left]
        right_color = colors[right]
        if left_color == right_color:
            return None
        if not self.allowed_color(left, right_color):
            return None
        if not self.allowed_color(right, left_color):
            return None
        swapped = list(colors)
        swapped[left], swapped[right] = swapped[right], swapped[left]
        analysis = self.analyze(swapped)
        return analysis, swapped

    def is_better(self, current: Analysis, candidate: Analysis) -> bool:
        if self.focus_max_size >= 6:
            if candidate.strong_count > current.strong_count:
                return False
            if candidate.strong_count == current.strong_count and candidate.strong_cells > current.strong_cells:
                return False
        return candidate.metrics < current.metrics

    def find_best_move(self, colors: Sequence[int], analysis: Analysis, component: Component) -> Tuple[int, int, Analysis, List[int]] | None:
        move = self.find_relocation_move(colors, analysis, component)
        if move is not None:
            return move
        return self.find_expansion_move(colors, analysis, component)

    def find_relocation_move(self, colors: Sequence[int], analysis: Analysis, component: Component) -> Tuple[int, int, Analysis, List[int]] | None:
        fragment_set = set(component.cells)
        color_a = component.color
        destinations: List[Tuple[float, int]] = []
        for idx, color_b in enumerate(colors):
            if idx in fragment_set or color_b == color_a or not self.allowed_color(idx, color_a):
                continue
            anchor_ids = set()
            neighbor_hits = 0
            for nb in self.neighbors[idx]:
                if colors[nb] != color_a:
                    continue
                nb_comp = analysis.comp_of[nb]
                if nb_comp == component.comp_id:
                    continue
                neighbor_hits += 1
                anchor_ids.add(nb_comp)
            if not anchor_ids:
                continue
            best_anchor = max(analysis.components[comp_id].size for comp_id in anchor_ids)
            row, col = self.positions[idx]
            distance = abs(row - component.centroid_row) + abs(col - component.centroid_col)
            score = neighbor_hits * 100 + min(best_anchor, 12) * 6 - distance * 2
            if best_anchor <= 4:
                score += 18
            destinations.append((score, idx))
        destinations.sort(reverse=True)
        best_move: Tuple[int, int, Analysis, List[int]] | None = None
        best_analysis: Analysis | None = None
        for _, dest_idx in destinations[:MAX_DEST_CANDIDATES]:
            incoming_color = colors[dest_idx]
            sources: List[Tuple[float, int]] = []
            for src_idx in component.cells:
                if not self.allowed_color(src_idx, incoming_color):
                    continue
                fit = self.color_neighbor_count(colors, src_idx, incoming_color)
                same_touch = self.color_neighbor_count(colors, src_idx, color_a)
                sources.append((fit * 20 - same_touch * 3, src_idx))
            sources.sort(reverse=True)
            for _, src_idx in sources[:MAX_SRC_CANDIDATES]:
                evaluated = self.evaluate_swap(colors, src_idx, dest_idx)
                if evaluated is None:
                    continue
                new_analysis, new_colors = evaluated
                baseline = analysis if best_analysis is None else best_analysis
                if self.is_better(baseline, new_analysis):
                    best_analysis = new_analysis
                    best_move = (src_idx, dest_idx, new_analysis, new_colors)
        return best_move

    def find_expansion_move(self, colors: Sequence[int], analysis: Analysis, component: Component) -> Tuple[int, int, Analysis, List[int]] | None:
        fragment_set = set(component.cells)
        color_a = component.color
        ring: List[Tuple[float, int]] = []
        for cell_idx in component.cells:
            for nb in self.neighbors[cell_idx]:
                if nb in fragment_set or colors[nb] == color_a or not self.allowed_color(nb, color_a):
                    continue
                hits = self.color_neighbor_count(colors, nb, color_a)
                ring.append((hits * 30, nb))
        dedup: List[int] = []
        seen = set()
        for _, idx in sorted(ring, reverse=True):
            if idx in seen:
                continue
            seen.add(idx)
            dedup.append(idx)
        best_move: Tuple[int, int, Analysis, List[int]] | None = None
        best_analysis: Analysis | None = None
        for dest_idx in dedup[:MAX_FALLBACK_RING]:
            color_b = colors[dest_idx]
            donors: List[Tuple[float, int]] = []
            for donor_idx, donor_color in enumerate(colors):
                if donor_color != color_a or donor_idx in fragment_set or not self.allowed_color(donor_idx, color_b):
                    continue
                donor_comp = analysis.components[analysis.comp_of[donor_idx]]
                if donor_comp.size <= 4:
                    continue
                fit = self.color_neighbor_count(colors, donor_idx, color_b)
                same_touch = self.color_neighbor_count(colors, donor_idx, color_a)
                donors.append((fit * 18 + min(donor_comp.size, 20) - same_touch * 3, donor_idx))
            donors.sort(reverse=True)
            for _, donor_idx in donors[:MAX_FALLBACK_DONORS]:
                evaluated = self.evaluate_swap(colors, donor_idx, dest_idx)
                if evaluated is None:
                    continue
                new_analysis, new_colors = evaluated
                baseline = analysis if best_analysis is None else best_analysis
                if self.is_better(baseline, new_analysis):
                    best_analysis = new_analysis
                    best_move = (donor_idx, dest_idx, new_analysis, new_colors)
        return best_move

    def optimize(self) -> Dict[str, object]:
        if not self.positions:
            return {
                "levelId": self.level_id,
                "changed": False,
                "moveCount": 0,
                "before": self.metrics_dict(self.analyze(self.original_colors)),
                "after": self.metrics_dict(self.analyze(self.original_colors)),
                "colors": list(self.original_colors),
            }
        colors = list(self.original_colors)
        analysis = self.analyze(colors)
        before = self.metrics_dict(analysis)
        if self.focus_max_size <= 4 and analysis.strong_count == 0:
            return {
                "levelId": self.level_id,
                "changed": False,
                "moveCount": 0,
                "before": before,
                "after": before,
                "colors": colors,
            }
        if self.focus_max_size >= 6 and analysis.small_count_1_6 == 0:
            return {
                "levelId": self.level_id,
                "changed": False,
                "moveCount": 0,
                "before": before,
                "after": before,
                "colors": colors,
            }
        move_count = 0
        target_count = analysis.strong_count if self.focus_max_size <= 4 else analysis.small_count_1_6
        max_moves = min(420, max(72, target_count * 8 + 18))
        while move_count < max_moves:
            focus_components = [comp for comp in analysis.components if comp.size <= self.focus_max_size]
            focus_components.sort(key=lambda comp: (comp.size, comp.centroid_row, comp.centroid_col))
            improved = False
            for component in focus_components:
                chosen = self.find_best_move(colors, analysis, component)
                if chosen is None:
                    continue
                _, _, new_analysis, new_colors = chosen
                if not self.is_better(analysis, new_analysis):
                    continue
                colors = new_colors
                analysis = new_analysis
                move_count += 1
                improved = True
                break
            if not improved:
                break
        self.validate(colors)
        return {
            "levelId": self.level_id,
            "changed": colors != self.original_colors,
            "moveCount": move_count,
            "before": before,
            "after": self.metrics_dict(analysis),
            "colors": colors,
        }

    def validate(self, colors: Sequence[int]) -> None:
        if count_color(colors) != self.original_counts:
            raise ValueError(f"level {self.level_id}: movable color counts changed")
        for idx, color in enumerate(colors):
            if color == self.targets[idx]:
                row, col = self.positions[idx]
                raise ValueError(f"level {self.level_id}: movable cell became target-colored at ({row},{col})")

    def build_grid(self, colors: Sequence[int]) -> List[List[int]]:
        rebuilt = [list(row) for row in self.init]
        for idx, color in enumerate(colors):
            row, col = self.positions[idx]
            rebuilt[row][col] = color
        return rebuilt

    @staticmethod
    def metrics_dict(analysis: Analysis) -> Dict[str, int]:
        return {
            "penalty": analysis.penalty,
            "strongCount": analysis.strong_count,
            "strongCells": analysis.strong_cells,
            "weakCount": analysis.weak_count,
            "smallCount1_6": analysis.small_count_1_6,
            "componentCount": len(analysis.components),
        }


def detect_newline(text: str) -> str:
    return "\r\n" if "\r\n" in text else "\n"


def format_matrix_after_key(matrix: Sequence[Sequence[int]], key_indent: str) -> str:
    row_indent = key_indent + "    "
    value_indent = row_indent + "    "
    lines = ["["]
    for row_index, row in enumerate(matrix):
        lines.append(f"{row_indent}[")
        for col_index, value in enumerate(row):
            comma = "," if col_index < len(row) - 1 else ""
            lines.append(f"{value_indent}{value}{comma}")
        tail = "," if row_index < len(matrix) - 1 else ""
        lines.append(f"{row_indent}]{tail}")
    lines.append(f"{key_indent}]")
    return "\n".join(lines)


def replace_init_random_color_arr(text: str, new_matrix: Sequence[Sequence[int]]) -> str:
    key = '"initRandomColorArr"'
    key_pos = text.find(key)
    if key_pos < 0:
        raise ValueError("initRandomColorArr key not found")
    line_start = text.rfind("\n", 0, key_pos)
    if line_start < 0:
        line_start = 0
    else:
        line_start += 1
    key_indent = text[line_start:key_pos]
    array_start = text.find("[", key_pos)
    if array_start < 0:
        raise ValueError("initRandomColorArr array start not found")
    depth = 0
    array_end = -1
    for idx in range(array_start, len(text)):
        ch = text[idx]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                array_end = idx
                break
    if array_end < 0:
        raise ValueError("initRandomColorArr array end not found")
    replacement = format_matrix_after_key(new_matrix, key_indent)
    return text[:array_start] + replacement + text[array_end + 1:]


def write_level_file(path: Path, new_grid: Sequence[Sequence[int]]) -> None:
    original_text = path.read_text(encoding="utf-8")
    newline = detect_newline(original_text)
    replaced = replace_init_random_color_arr(original_text, new_grid)
    if newline == "\r\n":
        replaced = replaced.replace("\n", "\r\n")
    path.write_text(replaced, encoding="utf-8")


def summarize(results: List[Dict[str, object]]) -> Dict[str, object]:
    changed = [item for item in results if item["changed"]]
    improved = [item for item in results if item["after"]["strongCount"] < item["before"]["strongCount"]]
    improved_small = [item for item in results if item["after"]["smallCount1_6"] < item["before"]["smallCount1_6"]]
    totals = {
        "beforeStrong": sum(item["before"]["strongCount"] for item in results),
        "afterStrong": sum(item["after"]["strongCount"] for item in results),
        "beforeWeak": sum(item["before"]["weakCount"] for item in results),
        "afterWeak": sum(item["after"]["weakCount"] for item in results),
        "beforeSmall1_6": sum(item["before"]["smallCount1_6"] for item in results),
        "afterSmall1_6": sum(item["after"]["smallCount1_6"] for item in results),
        "beforePenalty": sum(item["before"]["penalty"] for item in results),
        "afterPenalty": sum(item["after"]["penalty"] for item in results),
    }
    residual = sorted(
        results,
        key=lambda item: (
            -item["after"]["strongCount"],
            -item["after"]["smallCount1_6"],
            -item["after"]["penalty"],
            item["levelId"],
        ),
    )[:20]
    return {
        "changedLevelCount": len(changed),
        "improvedStrongCountLevels": len(improved),
        "improvedSmall1_6Levels": len(improved_small),
        "totals": totals,
        "topResidual": residual,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--levels", default="3-100")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--report-name", default="")
    parser.add_argument("--profile", choices=sorted(PROFILE_CONFIGS.keys()), default="strong")
    args = parser.parse_args()

    profile = PROFILE_CONFIGS[args.profile]
    level_ids = parse_level_ids(args.levels)
    results: List[Dict[str, object]] = []
    written: List[int] = []
    backup_dir: Path | None = None
    for level_id in level_ids:
        path = level_path(level_id)
        payload = json.loads(path.read_text(encoding="utf-8"))
        optimizer = LevelOptimizer(level_id, payload["correctColorArr"], payload["initRandomColorArr"], args.profile)
        result = optimizer.optimize()
        new_grid = optimizer.build_grid(result["colors"])
        result["changedCellCount"] = sum(
            1
            for row_idx, row in enumerate(payload["initRandomColorArr"])
            for col_idx, value in enumerate(row)
            if new_grid[row_idx][col_idx] != value
        )
        del result["colors"]
        results.append(result)
        if args.write and result["changed"]:
            if backup_dir is None:
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                backup_dir = REPORT_DIR / f"{profile['backupPrefix']}_{stamp}"
                backup_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup_dir / path.name)
            write_level_file(path, new_grid)
            written.append(level_id)
    report_name = args.report_name.strip()
    if not report_name:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_name = f"{profile['reportPrefix']}_{level_ids[0]}_{level_ids[-1]}_{stamp}.json"
    report_path = REPORT_DIR / report_name
    report_payload = {
        "generatedAt": datetime.now().isoformat(),
        "profile": args.profile,
        "levels": level_ids,
        "writeMode": bool(args.write),
        "backupDir": str(backup_dir) if backup_dir else None,
        "writtenLevels": written,
        "summary": summarize(results),
        "results": results,
    }
    report_path.write_text(json.dumps(report_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "report": str(report_path),
        "backupDir": str(backup_dir) if backup_dir else None,
        "writtenLevels": written,
        "summary": report_payload["summary"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
