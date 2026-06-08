#!/usr/bin/env python3
"""Compute min-step counts for guanka levels with one slot row unlocked by default."""

from __future__ import annotations

import argparse
import heapq
import json
import math
import signal
from collections import Counter, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


ROOT = Path(__file__).resolve().parents[1]
GUANKA_DIR = ROOT / "guanka"
SUMMARY_PATH = ROOT / "tools" / "generated_levels" / "guanka_min_steps_summary.json"

DIRS8 = (-1, 0, 1)
SLOTS_PER_ROW = 12
DEFAULT_UNLOCKED_EXTRA_ROWS = 1
DEFAULT_SLOT_CAPACITY = SLOTS_PER_ROW * (1 + DEFAULT_UNLOCKED_EXTRA_ROWS)
COLOR_ID_MAX = 20
DEFAULT_REFERENCE_DIR = ROOT / "guanka.0427"
DEFAULT_REFERENCE_SUMMARY = ROOT / "tools" / "generated_levels" / "guanka_min_steps_summary.json"


@dataclass(frozen=True)
class SearchState:
    board: bytes
    slots: Tuple[int, ...]


@dataclass
class ComponentInfo:
    color_id: int
    cells: Tuple[int, ...]
    size: int
    freed_targets_prefix: Tuple[int, ...]


@dataclass
class ActionInfo:
    action_type: str
    color_id: int
    bean_count: int
    placed_count: int


@dataclass
class SolveResult:
    min_steps: int
    solver: str
    states: int
    filled: int
    components: int
    complete: bool
    step_size_histogram: Dict[int, int]
    small_step_histogram: Dict[int, int]
    place_size_histogram: Dict[int, int]
    small_place_histogram: Dict[int, int]
    actions: List[ActionInfo]


class SolveTimeoutError(Exception):
    pass


class LevelMinStepSolver:
    def __init__(self, payload: Dict[str, object], slot_capacity: int, min_action_size: int = 1) -> None:
        self.payload = payload
        self.width = int(payload["boardWidth"])
        self.height = int(payload["boardHeight"])
        self.size = self.width * self.height
        self.correct = self.flatten_grid(payload["correctColorArr"])
        self.initial = self.flatten_grid(payload["initRandomColorArr"])
        self.valid_indices = tuple(index for index, color in enumerate(self.correct) if color != 0)
        self.target_indices_by_color = {
            color_id: tuple(index for index in self.valid_indices if self.correct[index] == color_id)
            for color_id in range(1, COLOR_ID_MAX + 1)
        }
        self.neighbors = self.build_neighbors()
        self.slot_capacity = slot_capacity
        self.min_action_size = max(1, int(min_action_size))
        self.filled = len(self.valid_indices)
        self.initial_components = len(self.collect_components(bytes(self.initial)))

    def feature_vector(self) -> Tuple[float, ...]:
        color_count = len({color for color in self.correct if color != 0})
        return (
            float(self.filled),
            float(self.initial_components),
            float(color_count),
            float(self.unresolved_count(bytes(self.initial))),
            float(self.width),
            float(self.height),
        )

    @staticmethod
    def histogram(actions: Sequence[ActionInfo], place_only: bool = False) -> Dict[int, int]:
        counter: Counter = Counter()
        for action in actions:
            if place_only and action.placed_count <= 0:
                continue
            size = action.placed_count if place_only else action.bean_count
            counter[int(size)] += 1
        return dict(sorted(counter.items()))

    @staticmethod
    def small_histogram(histogram: Dict[int, int]) -> Dict[int, int]:
        return {size: int(histogram.get(size, 0)) for size in (1, 2, 3)}

    @staticmethod
    def serialize_actions(actions: Sequence[ActionInfo]) -> List[Dict[str, object]]:
        return [
            {
                "type": action.action_type,
                "colorId": int(action.color_id),
                "beanCount": int(action.bean_count),
                "placedCount": int(action.placed_count),
            }
            for action in actions
        ]

    def make_result(self, min_steps: int, solver: str, states: int, actions: Sequence[ActionInfo], complete: bool = True) -> SolveResult:
        action_list = list(actions)
        step_hist = self.histogram(action_list)
        place_hist = self.histogram(action_list, place_only=True)
        return SolveResult(
            min_steps=min_steps,
            solver=solver,
            states=states,
            filled=self.filled,
            components=self.initial_components,
            complete=complete,
            step_size_histogram=step_hist,
            small_step_histogram=self.small_histogram(step_hist),
            place_size_histogram=place_hist,
            small_place_histogram=self.small_histogram(place_hist),
            actions=action_list,
        )

    @staticmethod
    def flatten_grid(grid: object) -> List[int]:
        if not isinstance(grid, list):
            raise ValueError("grid must be a list")
        flat: List[int] = []
        for row in grid:
            if not isinstance(row, list):
                raise ValueError("grid row must be a list")
            flat.extend(int(value) for value in row)
        return flat

    def build_neighbors(self) -> List[Tuple[int, ...]]:
        neighbors: List[Tuple[int, ...]] = []
        for index in range(self.size):
            row = index // self.width
            col = index % self.width
            items: List[int] = []
            for dr in DIRS8:
                for dc in DIRS8:
                    if dr == 0 and dc == 0:
                        continue
                    nr = row + dr
                    nc = col + dc
                    if 0 <= nr < self.height and 0 <= nc < self.width:
                        items.append(nr * self.width + nc)
            neighbors.append(tuple(items))
        return neighbors

    def unresolved_count(self, board: bytes) -> int:
        total = 0
        for index in self.valid_indices:
            if board[index] != self.correct[index]:
                total += 1
        return total

    def empty_target_counts(self, board: bytes) -> Counter:
        counts: Counter = Counter()
        for index in self.valid_indices:
            if board[index] == 0:
                counts[self.correct[index]] += 1
        return counts

    def board_supply_counts(self, board: bytes) -> Counter:
        counts: Counter = Counter()
        for index in self.valid_indices:
            color = board[index]
            if color != 0 and color != self.correct[index]:
                counts[color] += 1
        return counts

    def collect_components(self, board: bytes) -> List[ComponentInfo]:
        visited = bytearray(self.size)
        components: List[ComponentInfo] = []
        for start in self.valid_indices:
            color = board[start]
            if color == 0 or color == self.correct[start] or visited[start]:
                continue
            queue = deque([start])
            visited[start] = 1
            cells: List[int] = []
            freed_prefix: List[int] = []
            while queue:
                index = queue.popleft()
                cells.append(index)
                freed_prefix.append(self.correct[index])
                for neighbor in self.neighbors[index]:
                    if visited[neighbor]:
                        continue
                    if board[neighbor] != color:
                        continue
                    if board[neighbor] == self.correct[neighbor]:
                        continue
                    visited[neighbor] = 1
                    queue.append(neighbor)
            components.append(
                ComponentInfo(
                    color_id=color,
                    cells=tuple(cells),
                    size=len(cells),
                    freed_targets_prefix=tuple(freed_prefix),
                )
            )
        return components

    def lower_bound(self, state: SearchState) -> int:
        unresolved = self.unresolved_count(state.board)
        if unresolved == 0 and sum(state.slots) == 0:
            return 0
        bound = math.ceil(unresolved / max(self.slot_capacity, 1))
        if unresolved > 0 and sum(state.slots) == 0:
            bound += 1
        slot_color_count = sum(1 for count in state.slots if count > 0)
        if slot_color_count > 0:
            bound = max(bound, slot_color_count)
        return bound

    def score_action(
        self,
        action_type: str,
        locked_now: int,
        moved_count: int,
        freed_targets: Sequence[int],
        board_after: bytes,
        slots_after: Tuple[int, ...],
        board_supply_before: Counter,
    ) -> float:
        freed_counter = Counter(color for color in freed_targets if color > 0)
        follow_potential = 0
        for color_id, freed_count in freed_counter.items():
            follow_potential += min(
                freed_count,
                board_supply_before.get(color_id, 0) + slots_after[color_id],
            )
        slot_used_after = sum(slots_after)
        empty_color_count_after = len(self.empty_target_counts(board_after))
        score = float(locked_now * 1000 + moved_count * 20 + follow_potential * 80)
        if action_type == "b2s":
            score += moved_count * 15
            if slot_used_after == moved_count:
                score += 90
        elif action_type == "s2b":
            score += locked_now * 60
        else:
            score += locked_now * 35
        if moved_count <= 3:
            score -= 100000
        elif moved_count <= 5:
            score -= 2200
        elif moved_count <= 7:
            score -= 280
        score -= slot_used_after * 1.4
        score -= empty_color_count_after * 0.6
        return score

    def board_to_slot(
        self,
        state: SearchState,
        component: ComponentInfo,
    ) -> Tuple[SearchState, int, Tuple[int, ...]] | None:
        slot_used = sum(state.slots)
        free_slots = self.slot_capacity - slot_used
        if free_slots <= 0:
            return None
        move_count = min(free_slots, component.size)
        board_after = list(state.board)
        for index in component.cells:
            board_after[index] = 0
        if move_count < component.size:
            for index in component.cells[move_count:]:
                board_after[index] = component.color_id
        slots_after = list(state.slots)
        slots_after[component.color_id] += move_count
        return (
            SearchState(bytes(board_after), tuple(slots_after)),
            move_count,
            component.freed_targets_prefix[:move_count],
        )

    def place_to_board(
        self,
        board_after: List[int],
        color_id: int,
        count: int,
    ) -> int:
        placed = 0
        for index in self.target_indices_by_color[color_id]:
            if board_after[index] != 0:
                continue
            board_after[index] = color_id
            placed += 1
            if placed >= count:
                break
        return placed

    def target_distance_key(self, index: int, anchor: int) -> Tuple[int, int, int]:
        row = index // self.width
        col = index % self.width
        anchor_row = anchor // self.width
        anchor_col = anchor % self.width
        return (
            max(abs(row - anchor_row), abs(col - anchor_col)),
            abs(row - anchor_row) + abs(col - anchor_col),
            index,
        )

    def empty_target_components_for_color(self, board_after: Sequence[int], color_id: int) -> List[Tuple[int, ...]]:
        valid_empty = {
            index
            for index in self.target_indices_by_color[color_id]
            if board_after[index] == 0
        }
        visited: set[int] = set()
        components: List[Tuple[int, ...]] = []
        for start in sorted(valid_empty):
            if start in visited:
                continue
            queue = deque([start])
            visited.add(start)
            cells: List[int] = []
            while queue:
                index = queue.popleft()
                cells.append(index)
                for neighbor in self.neighbors[index]:
                    if neighbor not in valid_empty or neighbor in visited:
                        continue
                    visited.add(neighbor)
                    queue.append(neighbor)
            components.append(tuple(sorted(cells)))
        components.sort(key=lambda cells: (-len(cells), cells[0]))
        return components

    def choose_component_anchor(self, cells: Sequence[int]) -> int:
        avg_row = sum(index // self.width for index in cells) / max(1, len(cells))
        avg_col = sum(index % self.width for index in cells) / max(1, len(cells))
        return min(
            cells,
            key=lambda index: (
                abs(index // self.width - avg_row) + abs(index % self.width - avg_col),
                index,
            ),
        )

    def place_to_board_variants(
        self,
        board_after: List[int],
        color_id: int,
        count: int,
        max_variants: int = 6,
    ) -> List[Tuple[List[int], int]]:
        matching_empty = [
            index
            for index in self.target_indices_by_color[color_id]
            if board_after[index] == 0
        ]
        if not matching_empty:
            return []

        place_count = min(count, len(matching_empty))
        anchors: List[int] = [matching_empty[0]]
        for component in self.empty_target_components_for_color(board_after, color_id):
            anchors.append(self.choose_component_anchor(component))
            anchors.append(component[0])
            if len(anchors) >= max_variants * 2:
                break

        variants: List[Tuple[List[int], int]] = []
        seen: set[Tuple[int, ...]] = set()
        for anchor in anchors:
            placed = sorted(matching_empty, key=lambda index: self.target_distance_key(index, anchor))[:place_count]
            key = tuple(sorted(placed))
            if key in seen:
                continue
            seen.add(key)
            variant_board = list(board_after)
            for index in placed:
                variant_board[index] = color_id
            variants.append((variant_board, place_count))
            if len(variants) >= max_variants:
                break
        return variants

    def board_to_board(
        self,
        state: SearchState,
        component: ComponentInfo,
    ) -> Tuple[SearchState, int, Tuple[int, ...]] | None:
        board_after = list(state.board)
        for index in component.cells:
            board_after[index] = 0
        locked_now = self.place_to_board(board_after, component.color_id, component.size)
        if locked_now <= 0:
            return None
        remain = component.size - locked_now
        if remain > 0:
            for index in component.cells[-remain:]:
                board_after[index] = component.color_id
        return (
            SearchState(bytes(board_after), state.slots),
            locked_now,
            component.freed_targets_prefix[:locked_now],
        )

    def board_to_board_variants(
        self,
        state: SearchState,
        component: ComponentInfo,
    ) -> List[Tuple[SearchState, int, Tuple[int, ...]]]:
        board_after = list(state.board)
        for index in component.cells:
            board_after[index] = 0
        variants: List[Tuple[SearchState, int, Tuple[int, ...]]] = []
        for placed_board, locked_now in self.place_to_board_variants(board_after, component.color_id, component.size):
            if locked_now <= 0:
                continue
            remain = component.size - locked_now
            if remain > 0:
                for index in component.cells[-remain:]:
                    placed_board[index] = component.color_id
            variants.append((
                SearchState(bytes(placed_board), state.slots),
                locked_now,
                component.freed_targets_prefix[:locked_now],
            ))
        return variants

    def slot_to_board(
        self,
        state: SearchState,
        color_id: int,
    ) -> Tuple[SearchState, int] | None:
        slot_count = state.slots[color_id]
        if slot_count <= 0:
            return None
        board_after = list(state.board)
        locked_now = self.place_to_board(board_after, color_id, slot_count)
        if locked_now <= 0:
            return None
        slots_after = list(state.slots)
        slots_after[color_id] -= locked_now
        return SearchState(bytes(board_after), tuple(slots_after)), locked_now

    def slot_to_board_variants(
        self,
        state: SearchState,
        color_id: int,
    ) -> List[Tuple[SearchState, int]]:
        slot_count = state.slots[color_id]
        if slot_count <= 0:
            return []
        board_after = list(state.board)
        variants: List[Tuple[SearchState, int]] = []
        for placed_board, locked_now in self.place_to_board_variants(board_after, color_id, slot_count):
            if locked_now <= 0:
                continue
            slots_after = list(state.slots)
            slots_after[color_id] -= locked_now
            variants.append((SearchState(bytes(placed_board), tuple(slots_after)), locked_now))
        return variants

    def generate_actions(
        self,
        state: SearchState,
        prune: bool,
    ) -> List[Tuple[float, SearchState, ActionInfo]]:
        board_supply_before = self.board_supply_counts(state.board)
        candidates: List[Tuple[float, SearchState, ActionInfo]] = []
        per_color_b2s: Dict[int, List[Tuple[float, SearchState, ActionInfo]]] = {}
        per_color_b2b: Dict[int, List[Tuple[float, SearchState, ActionInfo]]] = {}

        for component in self.collect_components(state.board):
            slot_move = self.board_to_slot(state, component)
            if slot_move is not None:
                next_state, moved_count, freed_targets = slot_move
                score = self.score_action(
                    "b2s",
                    locked_now=0,
                    moved_count=moved_count,
                    freed_targets=freed_targets,
                    board_after=next_state.board,
                    slots_after=next_state.slots,
                    board_supply_before=board_supply_before,
                )
                per_color_b2s.setdefault(component.color_id, []).append((
                    score,
                    next_state,
                    ActionInfo("board_to_slot", component.color_id, moved_count, 0),
                ))

            for board_move in self.board_to_board_variants(state, component):
                next_state, locked_now, freed_targets = board_move
                score = self.score_action(
                    "b2b",
                    locked_now=locked_now,
                    moved_count=locked_now,
                    freed_targets=freed_targets,
                    board_after=next_state.board,
                    slots_after=next_state.slots,
                    board_supply_before=board_supply_before,
                )
                per_color_b2b.setdefault(component.color_id, []).append((
                    score,
                    next_state,
                    ActionInfo("board_to_board", component.color_id, locked_now, locked_now),
                ))

        for color_id in range(1, COLOR_ID_MAX + 1):
            if color_id in per_color_b2s:
                per_color_b2s[color_id].sort(key=lambda row: row[0], reverse=True)
                candidates.extend(per_color_b2s[color_id][: (2 if prune else len(per_color_b2s[color_id]))])
            if color_id in per_color_b2b:
                per_color_b2b[color_id].sort(key=lambda row: row[0], reverse=True)
                candidates.extend(per_color_b2b[color_id][: (2 if prune else len(per_color_b2b[color_id]))])
            if state.slots[color_id] > 0:
                for slot_move in self.slot_to_board_variants(state, color_id):
                    next_state, locked_now = slot_move
                    score = self.score_action(
                        "s2b",
                        locked_now=locked_now,
                        moved_count=locked_now,
                        freed_targets=(),
                        board_after=next_state.board,
                        slots_after=next_state.slots,
                        board_supply_before=board_supply_before,
                    )
                    candidates.append((
                        score,
                        next_state,
                        ActionInfo("slot_to_board", color_id, locked_now, locked_now),
                    ))

        if self.min_action_size > 1:
            candidates = [
                row for row in candidates
                if row[2].bean_count >= self.min_action_size
                and (row[2].placed_count <= 0 or row[2].placed_count >= self.min_action_size)
            ]
        candidates.sort(key=lambda row: row[0], reverse=True)
        if prune:
            candidates = candidates[:12]
        return candidates

    def exact_solve(self) -> SolveResult | None:
        start = SearchState(bytes(self.initial), tuple([0] * (COLOR_ID_MAX + 1)))
        initial_components = self.initial_components
        if self.filled > 96 or initial_components > 6:
            return None

        counter = 0
        heap: List[Tuple[int, int, int, SearchState]] = [(self.lower_bound(start), 0, counter, start)]
        best_steps: Dict[SearchState, int] = {start: 0}
        parent: Dict[SearchState, Tuple[SearchState, ActionInfo]] = {}
        visited = 0

        while heap:
            estimate, steps, _, state = heapq.heappop(heap)
            if best_steps.get(state) != steps:
                continue
            visited += 1
            if visited > 12000:
                return None
            if self.unresolved_count(state.board) == 0 and sum(state.slots) == 0:
                actions: List[ActionInfo] = []
                cursor = state
                while cursor in parent:
                    prev_state, action = parent[cursor]
                    actions.append(action)
                    cursor = prev_state
                actions.reverse()
                return self.make_result(steps, "astar", visited, actions)
            for _, next_state, action in self.generate_actions(state, prune=False):
                next_steps = steps + 1
                if next_steps >= best_steps.get(next_state, 10**9):
                    continue
                best_steps[next_state] = next_steps
                parent[next_state] = (state, action)
                counter += 1
                heapq.heappush(
                    heap,
                    (next_steps + self.lower_bound(next_state), next_steps, counter, next_state),
                )
        return None

    def beam_solve(self) -> SolveResult:
        start = SearchState(bytes(self.initial), tuple([0] * (COLOR_ID_MAX + 1)))
        initial_components = self.initial_components
        beam: List[Tuple[int, SearchState, List[ActionInfo]]] = [(0, start, [])]
        best_seen: Dict[SearchState, int] = {start: 0}
        visited = 0
        max_steps = max(12, math.ceil(self.filled / max(self.slot_capacity, 1)) * 4 + 8)
        best_partial_steps = 0
        best_partial_state = start
        best_partial_unresolved = self.unresolved_count(start.board)
        best_partial_actions: List[ActionInfo] = []

        for _ in range(max_steps):
            ranked: List[Tuple[float, int, SearchState, List[ActionInfo]]] = []
            for steps, state, actions in beam:
                visited += 1
                unresolved = self.unresolved_count(state.board)
                if unresolved < best_partial_unresolved or (
                    unresolved == best_partial_unresolved and steps < best_partial_steps
                ):
                    best_partial_unresolved = unresolved
                    best_partial_steps = steps
                    best_partial_state = state
                    best_partial_actions = list(actions)
                if unresolved == 0 and sum(state.slots) == 0:
                    return self.make_result(steps, "beam", visited, actions)
                for score, next_state, action in self.generate_actions(state, prune=True):
                    next_steps = steps + 1
                    if next_steps >= best_seen.get(next_state, 10**9):
                        continue
                    best_seen[next_state] = next_steps
                    next_actions = actions + [action]
                    rank = (
                        next_steps
                        + self.lower_bound(next_state)
                        + self.unresolved_count(next_state.board) / max(self.slot_capacity * 100.0, 1.0)
                        + sum(next_state.slots) / max(self.slot_capacity * 10.0, 1.0)
                        - score / 2000.0
                    )
                    ranked.append((rank, next_steps, next_state, next_actions))
            if not ranked:
                break
            ranked.sort(key=lambda row: row[0])
            next_beam: List[Tuple[int, SearchState, List[ActionInfo]]] = []
            seen_keys: set[SearchState] = set()
            for _, next_steps, next_state, next_actions in ranked:
                if next_state in seen_keys:
                    continue
                seen_keys.add(next_state)
                next_beam.append((next_steps, next_state, next_actions))
                if len(next_beam) >= 24:
                    break
            beam = next_beam

        finish_steps, finish_actions, complete = self.greedy_finish(best_partial_state)
        return self.make_result(
            best_partial_steps + finish_steps,
            "beam_fallback",
            visited,
            best_partial_actions + finish_actions,
            complete=complete,
        )

    def greedy_finish(self, state: SearchState) -> Tuple[int, List[ActionInfo], bool]:
        current = state
        steps = 0
        actions_taken: List[ActionInfo] = []
        max_steps = max(32, math.ceil(self.filled / max(self.slot_capacity, 1)) * 6 + 24)
        seen: set[SearchState] = set()
        while steps < max_steps:
            if self.unresolved_count(current.board) == 0 and sum(current.slots) == 0:
                return steps, actions_taken, True
            if current in seen:
                break
            seen.add(current)
            actions = self.generate_actions(current, prune=True)
            if not actions:
                break
            current = actions[0][1]
            actions_taken.append(actions[0][2])
            steps += 1
        return steps, actions_taken, False

    def greedy_solve(self) -> SolveResult:
        start = SearchState(bytes(self.initial), tuple([0] * (COLOR_ID_MAX + 1)))
        initial_components = self.initial_components
        current = start
        steps = 0
        visited = 0
        actions_taken: List[ActionInfo] = []
        seen: set[SearchState] = set()
        max_steps = max(32, math.ceil(self.filled / max(self.slot_capacity, 1)) * 6 + 24)

        while steps < max_steps:
            visited += 1
            if self.unresolved_count(current.board) == 0 and sum(current.slots) == 0:
                return self.make_result(steps, "greedy", visited, actions_taken)
            seen.add(current)
            actions = self.generate_actions(current, prune=True)
            if not actions:
                break
            chosen = None
            chosen_action = actions[0][2] if actions else None
            for _, next_state, action in actions:
                if next_state not in seen:
                    chosen = next_state
                    chosen_action = action
                    break
            if chosen is None:
                chosen = actions[0][1]
                chosen_action = actions[0][2]
            current = chosen
            if chosen_action is not None:
                actions_taken.append(chosen_action)
            steps += 1

        finish_steps, finish_actions, complete = self.greedy_finish(current)
        return self.make_result(
            steps + finish_steps,
            "greedy_fallback",
            visited,
            actions_taken + finish_actions,
            complete=complete,
        )

    def solve(self, mode: str = "auto") -> SolveResult:
        if mode == "greedy":
            return self.greedy_solve()
        exact = self.exact_solve()
        if exact is not None:
            return exact
        return self.beam_solve()


def iter_level_paths(level_dir: Path) -> Iterable[Path]:
    def level_sort_key(path: Path) -> Tuple[int, str]:
        stem = path.stem
        try:
            return int(stem.split("_")[1]), stem
        except Exception:
            return 10**9, stem

    yield from sorted(level_dir.glob("level_*.json"), key=level_sort_key)


def get_color_count(payload: Dict[str, object]) -> int:
    grid = payload["correctColorArr"]
    if not isinstance(grid, list):
        return 0
    colors = {int(value) for row in grid if isinstance(row, list) for value in row if int(value) != 0}
    return len(colors)


def resolve_slot_capacity(payload: Dict[str, object], override: Optional[int] = None) -> int:
    if override is not None and override > 0:
        return int(override)
    rows_raw = payload.get("initialSlotUnlockedRows", DEFAULT_UNLOCKED_EXTRA_ROWS)
    try:
        rows = int(math.floor(float(rows_raw)))
    except Exception:
        rows = DEFAULT_UNLOCKED_EXTRA_ROWS
    rows = max(1, rows)
    return rows * SLOTS_PER_ROW


def rhythm_rule_for(filled: int) -> Dict[str, object]:
    if filled <= 35:
        return {
            "beanRange": [4, 8],
            "mainRange": [5, 7],
            "minUniqueStepSizes": 2,
            "minMainRatio": 0.35,
            "maxFullSlotRatio": 0.20,
        }
    if filled <= 60:
        return {
            "beanRange": [5, 10],
            "mainRange": [7, 9],
            "minUniqueStepSizes": 2,
            "minMainRatio": 0.40,
            "maxFullSlotRatio": 0.20,
        }
    if filled <= 120:
        return {
            "beanRange": [6, 12],
            "mainRange": [8, 10],
            "minUniqueStepSizes": 3,
            "minMainRatio": 0.45,
            "maxFullSlotRatio": 0.15,
        }
    if filled <= 240:
        return {
            "beanRange": [6, 16],
            "mainRange": [8, 12],
            "minUniqueStepSizes": 4,
            "minMainRatio": 0.45,
            "maxFullSlotRatio": 0.12,
        }
    if filled <= 420:
        return {
            "beanRange": [7, 20],
            "mainRange": [9, 13],
            "minUniqueStepSizes": 4,
            "minMainRatio": 0.45,
            "maxFullSlotRatio": 0.10,
        }
    return {
        "beanRange": [8, 24],
        "mainRange": [10, 14],
        "minUniqueStepSizes": 5,
        "minMainRatio": 0.45,
        "maxFullSlotRatio": 0.10,
    }


def count_hist_range(histogram: Dict[int, int], low: int, high: int) -> int:
    return sum(count for size, count in histogram.items() if low <= int(size) <= high)


def max_same_size_run(actions: Sequence[ActionInfo]) -> int:
    best = 0
    current_size: Optional[int] = None
    current_run = 0
    for action in actions:
        size = int(action.bean_count)
        if size == current_size:
            current_run += 1
        else:
            current_size = size
            current_run = 1
        best = max(best, current_run)
    return best


def evaluate_rhythm(result: SolveResult, slot_capacity: int) -> Dict[str, object]:
    rule = rhythm_rule_for(result.filled)
    bean_low, bean_high = [int(value) for value in rule["beanRange"]]
    main_low, main_high = [int(value) for value in rule["mainRange"]]
    total_actions = sum(result.step_size_histogram.values())
    total_place_actions = sum(result.place_size_histogram.values())
    main_total = count_hist_range(result.step_size_histogram, main_low, main_high)
    out_of_range_total = sum(
        count
        for size, count in result.step_size_histogram.items()
        if int(size) < bean_low or int(size) > bean_high
    )
    full_slot_total = int(result.step_size_histogram.get(int(slot_capacity), 0))
    unique_step_sizes = len(result.step_size_histogram)
    main_ratio = main_total / max(1, total_actions)
    full_slot_ratio = full_slot_total / max(1, total_actions)
    reasons: List[str] = []
    warnings: List[str] = []

    small_action_total = sum(count for size, count in result.step_size_histogram.items() if int(size) <= 3)
    small_place_total = sum(count for size, count in result.place_size_histogram.items() if int(size) <= 3)
    if small_action_total > 0:
        reasons.append("has_1_to_3_action_steps")
    if small_place_total > 0:
        reasons.append("has_1_to_3_place_steps")
    if not result.complete:
        reasons.append("incomplete_solve_path")
    if unique_step_sizes < int(rule["minUniqueStepSizes"]):
        reasons.append("too_few_step_size_types")
    if main_ratio < float(rule["minMainRatio"]):
        reasons.append("main_step_ratio_too_low")
    if full_slot_ratio > float(rule["maxFullSlotRatio"]):
        reasons.append("too_many_full_slot_steps")
    if out_of_range_total > max(1, math.floor(total_actions * 0.15)):
        reasons.append("too_many_out_of_range_steps")

    run = max_same_size_run(result.actions)
    if run >= 6:
        warnings.append("same_step_size_run_too_long")

    return {
        "pass": len(reasons) == 0,
        "reasons": reasons,
        "warnings": warnings,
        "rule": rule,
        "totalActions": int(total_actions),
        "totalPlaceActions": int(total_place_actions),
        "uniqueStepSizes": int(unique_step_sizes),
        "mainStepTotal": int(main_total),
        "mainStepRatio": round(main_ratio, 4),
        "outOfRangeTotal": int(out_of_range_total),
        "fullSlotSize": int(slot_capacity),
        "fullSlotTotal": int(full_slot_total),
        "fullSlotRatio": round(full_slot_ratio, 4),
        "maxSameSizeRun": int(run),
    }


def make_summary_row(
    path: Path,
    payload: Dict[str, object],
    result: SolveResult,
    slot_capacity: int,
    include_actions: bool,
) -> Dict[str, object]:
    try:
        file_name = str(path.relative_to(ROOT))
    except ValueError:
        file_name = str(path)
    row: Dict[str, object] = {
        "file": file_name,
        "levelId": int(payload.get("levelId", 0) or 0),
        "minStepCount": result.min_steps,
        "solver": result.solver,
        "complete": bool(result.complete),
        "filled": result.filled,
        "components": result.components,
        "states": result.states,
        "slotCapacity": int(slot_capacity),
        "stepSizeHistogram": result.step_size_histogram,
        "smallStepHistogram": result.small_step_histogram,
        "smallStepTotal": sum(result.small_step_histogram.values()),
        "placeSizeHistogram": result.place_size_histogram,
        "smallPlaceHistogram": result.small_place_histogram,
        "smallPlaceTotal": sum(result.small_place_histogram.values()),
        "rhythmCheck": evaluate_rhythm(result, slot_capacity),
    }
    if include_actions:
        row["actions"] = LevelMinStepSolver.serialize_actions(result.actions)
    return row


def has_complete_result(payload: Dict[str, object], slot_capacity: int) -> bool:
    solver = payload.get("minStepSolver")
    return (
        payload.get("minStepCount") is not None
        and payload.get("minStepSlotCapacity") == slot_capacity
        and payload.get("defaultUnlockedSlotRows") == DEFAULT_UNLOCKED_EXTRA_ROWS
        and isinstance(solver, str)
        and bool(solver)
    )


def write_existing_metadata(path: Path, slot_capacity: int) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("minStepCount") is None:
        raise ValueError(f"cannot backfill metadata without minStepCount: {path}")
    if not payload.get("minStepSolver"):
        payload["minStepSolver"] = "existing"
    payload["minStepSlotCapacity"] = int(slot_capacity)
    payload["defaultUnlockedSlotRows"] = int(DEFAULT_UNLOCKED_EXTRA_ROWS)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")


def update_level_json(path: Path, result: SolveResult, slot_capacity: int) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["minStepCount"] = int(result.min_steps)
    payload["minStepSolver"] = result.solver
    payload["minStepSlotCapacity"] = int(slot_capacity)
    payload["defaultUnlockedSlotRows"] = int(DEFAULT_UNLOCKED_EXTRA_ROWS)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")


def write_summary(path: Path, summary: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def predict_knn(
    feature: Tuple[float, ...],
    training: Sequence[Tuple[Tuple[float, ...], int]],
    k: int = 7,
) -> int:
    scales = (120.0, 6.0, 4.0, 120.0, 12.0, 12.0)
    ranked: List[Tuple[float, int]] = []
    for train_feature, train_value in training:
        distance = 0.0
        for idx, value in enumerate(feature):
            scale = scales[idx] if idx < len(scales) else 1.0
            distance += ((value - train_feature[idx]) / scale) ** 2
        ranked.append((distance, train_value))
    ranked.sort(key=lambda row: row[0])
    top = ranked[: max(1, min(k, len(ranked)))]
    weighted = 0.0
    weight_sum = 0.0
    for distance, value in top:
        weight = 1.0 / max(distance, 1e-6)
        weighted += value * weight
        weight_sum += weight
    return max(1, int(round(weighted / max(weight_sum, 1e-6))))


def load_reference_training(
    reference_dir: Path,
    reference_summary: Path,
    slot_capacity: int,
) -> List[Tuple[Tuple[float, ...], int]]:
    if not reference_dir.exists() or not reference_summary.exists():
        return []

    summary = json.loads(reference_summary.read_text(encoding="utf-8"))
    rows = summary.get("levels")
    if not isinstance(rows, list):
        return []

    by_name = {Path(str(row.get("file", ""))).name: row for row in rows}
    training: List[Tuple[Tuple[float, ...], int]] = []
    for path in iter_level_paths(reference_dir):
        row = by_name.get(path.name)
        if not isinstance(row, dict):
            continue
        min_step = row.get("minStepCount")
        if min_step is None:
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        solver = LevelMinStepSolver(payload, slot_capacity=slot_capacity)
        if row.get("filled") not in (None, solver.filled):
            continue
        row_colors = row.get("colors")
        if row_colors is not None and int(row_colors) != get_color_count(payload):
            continue
        training.append((solver.feature_vector(), int(min_step)))
    return training


def load_current_training(
    level_paths: Sequence[Path],
    slot_capacity: int,
) -> List[Tuple[Tuple[float, ...], int]]:
    training: List[Tuple[Tuple[float, ...], int]] = []
    for path in level_paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not has_complete_result(payload, slot_capacity):
            continue
        solver = LevelMinStepSolver(payload, slot_capacity=slot_capacity)
        training.append((solver.feature_vector(), int(payload["minStepCount"])))
    return training


def timed_solve(
    solver: LevelMinStepSolver,
    mode: str,
    timeout_sec: float,
) -> SolveResult | None:
    if timeout_sec <= 0:
        return solver.solve(mode=mode)

    previous_handler = signal.getsignal(signal.SIGALRM)

    def on_alarm(signum: int, frame: object) -> None:
        raise SolveTimeoutError()

    signal.signal(signal.SIGALRM, on_alarm)
    signal.setitimer(signal.ITIMER_REAL, timeout_sec)
    try:
        return solver.solve(mode=mode)
    except SolveTimeoutError:
        return None
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compute guanka min-step counts.")
    parser.add_argument("--dir", default=str(GUANKA_DIR))
    parser.add_argument("--summary-out", default=str(SUMMARY_PATH))
    parser.add_argument("--limit", type=int)
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--mode", choices=("auto", "greedy", "knn", "hybrid"), default="auto")
    parser.add_argument("--reference-dir", default=str(DEFAULT_REFERENCE_DIR))
    parser.add_argument("--reference-summary", default=str(DEFAULT_REFERENCE_SUMMARY))
    parser.add_argument("--auto-filled-threshold", type=int, default=400)
    parser.add_argument("--auto-timeout-sec", type=float, default=3.0)
    parser.add_argument("--slot-capacity", type=int, help="Override usable slot capacity. Defaults to initialSlotUnlockedRows * 12 per level.")
    parser.add_argument("--min-action-size", type=int, default=1, help="Filter solve actions smaller than this size. Use 4 to search for no-fragment play paths.")
    parser.add_argument("--read-only", action="store_true", help="Write only the summary; do not modify level JSON files.")
    parser.add_argument("--include-actions", action="store_true", help="Include solved action traces in the summary rows.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    level_dir = Path(args.dir)
    summary_path = Path(args.summary_out)

    processed = 0
    skipped_existing = 0
    backfilled_existing = 0
    solver_counts: Counter = Counter()
    rows: List[Dict[str, object]] = []
    level_paths = list(iter_level_paths(level_dir))

    if args.mode == "knn":
        training: List[Tuple[Tuple[float, ...], int]] = []
        for path in level_paths:
            payload = json.loads(path.read_text(encoding="utf-8"))
            value = payload.get("minStepCount")
            if value is None:
                continue
            slot_capacity = resolve_slot_capacity(payload, args.slot_capacity)
            solver = LevelMinStepSolver(payload, slot_capacity=slot_capacity, min_action_size=args.min_action_size)
            training.append((solver.feature_vector(), int(value)))
        if not training:
            raise ValueError("knn mode requires existing minStepCount values as training data")
        for path in level_paths:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if args.skip_existing and payload.get("minStepCount") is not None:
                continue
            slot_capacity = resolve_slot_capacity(payload, args.slot_capacity)
            solver = LevelMinStepSolver(payload, slot_capacity=slot_capacity, min_action_size=args.min_action_size)
            value = predict_knn(solver.feature_vector(), training)
            result = SolveResult(
                min_steps=value,
                solver="knn",
                states=0,
                filled=solver.filled,
                components=solver.initial_components,
                complete=False,
                step_size_histogram={},
                small_step_histogram={1: 0, 2: 0, 3: 0},
                place_size_histogram={},
                small_place_histogram={1: 0, 2: 0, 3: 0},
                actions=[],
            )
            if not args.read_only:
                update_level_json(path, result, slot_capacity)
            processed += 1
            solver_counts[result.solver] += 1
            rows.append(make_summary_row(path, payload, result, slot_capacity, args.include_actions))
            if args.limit and processed >= args.limit:
                break
        write_summary(
            summary_path,
            {
                "slotCapacity": args.slot_capacity or "per-level",
                "minActionSize": int(args.min_action_size),
                "defaultUnlockedSlotRows": DEFAULT_UNLOCKED_EXTRA_ROWS,
                "readOnly": bool(args.read_only),
                "processed": processed,
                "solverCounts": dict(solver_counts),
                "levels": rows,
            },
        )
        print(f"{'processed' if args.read_only else 'updated'} {processed} levels")
        print(f"summary written to {summary_path}")
        return

    if args.mode == "hybrid":
        training = load_reference_training(
            reference_dir=Path(args.reference_dir),
            reference_summary=Path(args.reference_summary),
            slot_capacity=DEFAULT_SLOT_CAPACITY,
        )
        training.extend(load_current_training(level_paths, slot_capacity=DEFAULT_SLOT_CAPACITY))
        if not training:
            raise ValueError("hybrid mode requires reference or current training data")

        for path in level_paths:
            payload = json.loads(path.read_text(encoding="utf-8"))
            slot_capacity = resolve_slot_capacity(payload, args.slot_capacity)
            has_min_step = payload.get("minStepCount") is not None
            if has_complete_result(payload, slot_capacity):
                if args.skip_existing:
                    skipped_existing += 1
                    continue
            elif has_min_step and payload.get("minStepSlotCapacity") in (None, slot_capacity) and payload.get("defaultUnlockedSlotRows") in (None, DEFAULT_UNLOCKED_EXTRA_ROWS):
                if not args.read_only:
                    write_existing_metadata(path, slot_capacity)
                backfilled_existing += 1
                solver_name = str(payload.get("minStepSolver") or "existing")
                solver_counts[solver_name] += 1
                processed += 1
                rows.append(make_summary_row(
                    path,
                    payload,
                    SolveResult(
                        min_steps=int(payload["minStepCount"]),
                        solver=solver_name,
                        states=0,
                        filled=int(payload.get("filledCellCount", 0) or 0),
                        components=0,
                        complete=True,
                        step_size_histogram={},
                        small_step_histogram={1: 0, 2: 0, 3: 0},
                        place_size_histogram={},
                        small_place_histogram={1: 0, 2: 0, 3: 0},
                        actions=[],
                    ),
                    slot_capacity,
                    args.include_actions,
                    )
                )
                if args.limit and processed >= args.limit:
                    break
                continue

            solver = LevelMinStepSolver(payload, slot_capacity=slot_capacity, min_action_size=args.min_action_size)
            result: SolveResult | None = None
            if solver.filled <= args.auto_filled_threshold:
                result = timed_solve(solver, mode="auto", timeout_sec=args.auto_timeout_sec)
            if result is None:
                value = predict_knn(solver.feature_vector(), training)
                result = SolveResult(
                    min_steps=value,
                    solver="knn",
                    states=0,
                    filled=solver.filled,
                    components=solver.initial_components,
                    complete=False,
                    step_size_histogram={},
                    small_step_histogram={1: 0, 2: 0, 3: 0},
                    place_size_histogram={},
                    small_place_histogram={1: 0, 2: 0, 3: 0},
                    actions=[],
                )
            if not args.read_only:
                update_level_json(path, result, slot_capacity)
            processed += 1
            solver_counts[result.solver] += 1
            rows.append(make_summary_row(path, payload, result, slot_capacity, args.include_actions))
            if result.solver != "knn":
                training.append((solver.feature_vector(), int(result.min_steps)))
            if args.limit and processed >= args.limit:
                break
            if processed % 100 == 0:
                print(
                    f"processed {processed} | skipped_existing {skipped_existing} | "
                    f"backfilled_existing {backfilled_existing} | solver_counts {dict(solver_counts)}"
                )

        write_summary(
            summary_path,
            {
                "slotCapacity": args.slot_capacity or "per-level",
                "minActionSize": int(args.min_action_size),
                "defaultUnlockedSlotRows": DEFAULT_UNLOCKED_EXTRA_ROWS,
                "readOnly": bool(args.read_only),
                "processed": processed,
                "skippedExisting": skipped_existing,
                "backfilledExisting": backfilled_existing,
                "referenceTraining": len(training),
                "solverCounts": dict(solver_counts),
                "levels": rows,
            },
        )
        print(f"{'processed' if args.read_only else 'updated'} {processed} levels")
        print(f"skipped existing {skipped_existing}")
        print(f"backfilled existing {backfilled_existing}")
        print(f"summary written to {summary_path}")
        return

    for path in level_paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if args.skip_existing and payload.get("minStepCount") is not None:
            continue
        slot_capacity = resolve_slot_capacity(payload, args.slot_capacity)
        result = LevelMinStepSolver(payload, slot_capacity=slot_capacity, min_action_size=args.min_action_size).solve(mode=args.mode)
        if not args.read_only:
            update_level_json(path, result, slot_capacity)
        processed += 1
        solver_counts[result.solver] += 1
        rows.append(make_summary_row(path, payload, result, slot_capacity, args.include_actions))
        if args.limit and processed >= args.limit:
            break
        if processed % 100 == 0:
            print(f"processed {processed}")

    write_summary(
        summary_path,
        {
            "slotCapacity": args.slot_capacity or "per-level",
            "minActionSize": int(args.min_action_size),
            "defaultUnlockedSlotRows": DEFAULT_UNLOCKED_EXTRA_ROWS,
            "readOnly": bool(args.read_only),
            "processed": processed,
            "skippedExisting": skipped_existing,
            "backfilledExisting": backfilled_existing,
            "solverCounts": dict(solver_counts),
            "levels": rows,
        },
    )
    print(f"{'processed' if args.read_only else 'updated'} {processed} levels")
    print(f"summary written to {summary_path}")


if __name__ == "__main__":
    main()
