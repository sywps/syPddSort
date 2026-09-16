import type { BoardModel } from './BoardModel';
import type { BeanBlockInfo } from './LevelConfig';

// Original j126924 Vector2Int order, converted from (column, row).
const ORIGINAL_DIRS = [
    [1, -1], [1, 0], [1, 1], [0, -1], [0, 1],
    [-1, -1], [-1, 0], [-1, 1],
] as const;

/** Original package Do9AreaType=1: stable SelectDepth order, no target-color priority. */
export function selectOriginalBeans(board: BoardModel, row: number, col: number, limit: number): BeanBlockInfo | null {
    if (!board.isValidCell(row, col) || board.locked[row][col]) return null;
    const colorId = board.currentColors[row][col];
    if (!colorId) return null;
    const cells = [{ row, col }];
    const visited = new Set<number>([row * board.width + col]);
    // j38218 discovers each layer before the next; OrderBy(SelectDepth) is stable.
    for (let head = 0; head < cells.length && cells.length < limit; head++) {
        const cell = cells[head];
        for (const [dr, dc] of ORIGINAL_DIRS) {
            const r = cell.row + dr;
            const c = cell.col + dc;
            if (!board.isValidCell(r, c) || board.locked[r][c]
                || board.currentColors[r][c] !== colorId) continue;
            const key = r * board.width + c;
            if (visited.has(key)) continue;
            visited.add(key);
            cells.push({ row: r, col: c });
            if (cells.length >= limit) break;
        }
    }
    return { colorId, cells, isLocked: false, source: 'board' };
}
