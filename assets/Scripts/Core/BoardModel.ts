/**
 * 棋盘数据模型 - 管理棋盘状态、连通块计算
 */

import { BeanBlockInfo, LevelData } from './LevelConfig';

const CONNECT_DIRS = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
];

export class BoardModel {
    /** 当前棋盘颜色 [row][col]，0表示空 */
    public currentColors: number[][];
    /** 正确颜色 [row][col] */
    public correctColors: number[][];
    /** 锁定状态 [row][col] */
    public locked: boolean[][];
    public width: number;
    public height: number;
    private visitMarks: number[][];
    private visitToken = 1;
    private queueRows: number[];
    private queueCols: number[];
    private validCellCount = 0;
    private lockedCellCount = 0;
    private remainingByColor: Map<number, number> = new Map();
    private colorIds: number[] = [];
    private lockStatsDirty = false;

    constructor(levelData: LevelData) {
        this.width = levelData.boardWidth;
        this.height = levelData.boardHeight;
        this.correctColors = levelData.correctColorArr.map(row => [...row]);
        this.currentColors = levelData.initRandomColorArr.map(row => [...row]);
        this.locked = [];
        this.visitMarks = [];
        for (let r = 0; r < this.height; r++) {
            this.locked[r] = [];
            this.visitMarks[r] = new Array(this.width).fill(0);
            for (let c = 0; c < this.width; c++) {
                this.locked[r][c] = this.currentColors[r][c] !== 0
                    && this.currentColors[r][c] === this.correctColors[r][c];
            }
        }
        this.queueRows = new Array(Math.max(1, this.width * this.height));
        this.queueCols = new Array(Math.max(1, this.width * this.height));
        this.rebuildLockStats();
    }

    /** 是否为棋盘上的有效格（correctColor !== 0） */
    isValidCell(row: number, col: number): boolean {
        if (row < 0 || row >= this.height || col < 0 || col >= this.width) return false;
        return this.correctColors[row][col] !== 0;
    }

    /** BFS获取相邻同色连通块（排除已锁定） */
    getConnectedBlock(row: number, col: number, preferredCorrectColor?: number): BeanBlockInfo | null {
        if (row < 0 || row >= this.height || col < 0 || col >= this.width) return null;
        const colorId = this.currentColors[row][col];
        if (colorId === 0 || this.locked[row][col]) return null;

        const cells: { row: number; col: number }[] = [];
        const token = this.nextVisitToken();
        let head = 0;
        let tail = 0;
        this.queueRows[tail] = row;
        this.queueCols[tail] = col;
        tail += 1;
        this.visitMarks[row][col] = token;

        while (head < tail) {
            const curRow = this.queueRows[head];
            const curCol = this.queueCols[head];
            head += 1;
            cells.push({ row: curRow, col: curCol });
            for (const [dr, dc] of CONNECT_DIRS) {
                const nr = curRow + dr;
                const nc = curCol + dc;
                if (nr >= 0 && nr < this.height && nc >= 0 && nc < this.width
                    && this.visitMarks[nr][nc] !== token
                    && this.currentColors[nr][nc] === colorId
                    && !this.locked[nr][nc]) {
                    this.visitMarks[nr][nc] = token;
                    this.queueRows[tail] = nr;
                    this.queueCols[tail] = nc;
                    tail += 1;
                }
            }
        }

        this.prioritizeConnectedBlockCells(cells, preferredCorrectColor);

        return {
            colorId,
            cells,
            isLocked: false,
            source: 'board',
        };
    }

    private prioritizeConnectedBlockCells(cells: { row: number; col: number }[], preferredCorrectColor?: number): void {
        if (!preferredCorrectColor || cells.length <= 1) return;
        const ordered = cells.map((cell, index) => ({ cell, index }));
        ordered.sort((a, b) => {
            const aPriority = this.correctColors[a.cell.row][a.cell.col] === preferredCorrectColor ? 0 : 1;
            const bPriority = this.correctColors[b.cell.row][b.cell.col] === preferredCorrectColor ? 0 : 1;
            if (aPriority !== bPriority) return aPriority - bPriority;
            return a.index - b.index;
        });
        for (let i = 0; i < ordered.length; i++) {
            cells[i] = ordered[i].cell;
        }
    }

    /**
     * 当点击已归位格子时：若相邻未归位格子只有一种颜色且连成一块，返回该块
     */
    getConnectedBlockOrAdjacent(row: number, col: number, preferredCorrectColor?: number): BeanBlockInfo | null {
        // 优先尝试正常连通块
        const normal = this.getConnectedBlock(row, col, preferredCorrectColor);
        if (normal) return normal;

        // 格子已锁定或为空，检查 8 方向相邻的未锁定格子
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
        const adjCells: { row: number; col: number }[] = [];

        for (const [dr, dc] of dirs) {
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < this.height && nc >= 0 && nc < this.width
                && !this.locked[nr][nc]
                && this.currentColors[nr][nc] > 0) {
                adjCells.push({ row: nr, col: nc });
            }
        }

        if (adjCells.length === 0) return null;

        // 检查是否只有一种颜色
        const firstColor = this.currentColors[adjCells[0].row][adjCells[0].col];
        for (const cell of adjCells) {
            if (this.currentColors[cell.row][cell.col] !== firstColor) return null;
        }

        // 获取从第一个相邻格子出发的完整连通块
        return this.getConnectedBlock(adjCells[0].row, adjCells[0].col, preferredCorrectColor);
    }

    /** 从棋盘移除一块豆豆（设为空） */
    removeBlock(block: BeanBlockInfo): void {
        for (const cell of block.cells) {
            this.currentColors[cell.row][cell.col] = 0;
        }
    }

    /** 将豆豆放回棋盘原位 */
    restoreBlock(block: BeanBlockInfo): void {
        for (const cell of block.cells) {
            this.currentColors[cell.row][cell.col] = block.colorId;
        }
    }

    /**
     * 全局最大化放置：找所有空位中correctColor匹配的位置，尽量多放
     * @param nearRow/nearCol 可选，指定后按切比雪夫距离排序，附近的优先放置
     * 返回：{ placed: 实际放置的坐标[], remaining: 未放置的数量 }
     */
    placeBlockMaximize(block: BeanBlockInfo, nearRow?: number, nearCol?: number): { placed: { row: number; col: number }[]; remaining: number } {
        const matchingEmpty: { row: number; col: number }[] = [];

        for (let r = 0; r < this.height; r++) {
            for (let c = 0; c < this.width; c++) {
                if (this.currentColors[r][c] === 0
                    && !this.locked[r][c]
                    && this.correctColors[r][c] === block.colorId) {
                    matchingEmpty.push({ row: r, col: c });
                }
            }
        }

        // 指定参考点时按切比雪夫距离排序（正负1范围内的优先）
        if (nearRow !== undefined && nearCol !== undefined) {
            matchingEmpty.sort((a, b) => {
                const da = Math.max(Math.abs(a.row - nearRow), Math.abs(a.col - nearCol));
                const db = Math.max(Math.abs(b.row - nearRow), Math.abs(b.col - nearCol));
                return da - db;
            });
        }

        const placeCount = Math.min(block.cells.length, matchingEmpty.length);
        const placed = matchingEmpty.slice(0, placeCount);

        // 放置并锁定
        for (const pos of placed) {
            this.currentColors[pos.row][pos.col] = block.colorId;
            this.setLocked(pos.row, pos.col, true);
        }

        return {
            placed,
            remaining: block.cells.length - placeCount,
        };
    }

    /** 将剩余豆豆放回原位（取block.cells末尾的n个） */
    restoreRemaining(block: BeanBlockInfo, remainingCount: number): { row: number; col: number }[] {
        const restoreCells = block.cells.slice(block.cells.length - remainingCount);
        for (const cell of restoreCells) {
            this.currentColors[cell.row][cell.col] = block.colorId;
        }
        return restoreCells;
    }

    /** 检查是否全部锁定（通关）— 忽略 correctColor=0 的无效格 */
    isAllLocked(): boolean {
        this.refreshLockStatsIfNeeded();
        return this.lockedCellCount >= this.validCellCount;
    }

    getColorIds(): number[] {
        this.refreshLockStatsIfNeeded();
        return this.colorIds;
    }

    isColorComplete(colorId: number): boolean {
        this.refreshLockStatsIfNeeded();
        return (this.remainingByColor.get(colorId) || 0) <= 0;
    }

    setLocked(row: number, col: number, locked: boolean): void {
        if (row < 0 || row >= this.height || col < 0 || col >= this.width) return;
        const prev = this.locked[row][col];
        if (prev === locked) return;
        this.locked[row][col] = locked;
        const correctId = this.correctColors[row][col];
        if (correctId === 0) return;
        if (locked) {
            this.lockedCellCount += 1;
            this.remainingByColor.set(correctId, Math.max(0, (this.remainingByColor.get(correctId) || 0) - 1));
        } else {
            this.lockedCellCount = Math.max(0, this.lockedCellCount - 1);
            this.remainingByColor.set(correctId, (this.remainingByColor.get(correctId) || 0) + 1);
        }
    }

    markLockStatsDirty(): void {
        this.lockStatsDirty = true;
    }

    private nextVisitToken(): number {
        this.visitToken += 1;
        if (this.visitToken < Number.MAX_SAFE_INTEGER) return this.visitToken;
        this.visitToken = 1;
        for (let r = 0; r < this.height; r++) {
            for (let c = 0; c < this.width; c++) {
                this.visitMarks[r][c] = 0;
            }
        }
        return this.visitToken;
    }

    private refreshLockStatsIfNeeded(): void {
        if (!this.lockStatsDirty) return;
        this.rebuildLockStats();
    }

    private rebuildLockStats(): void {
        this.validCellCount = 0;
        this.lockedCellCount = 0;
        this.remainingByColor.clear();
        const colors = new Set<number>();
        for (let r = 0; r < this.height; r++) {
            for (let c = 0; c < this.width; c++) {
                const correctId = this.correctColors[r][c];
                if (correctId === 0) continue;
                this.validCellCount += 1;
                colors.add(correctId);
                if (this.locked[r][c]) {
                    this.lockedCellCount += 1;
                } else {
                    this.remainingByColor.set(correctId, (this.remainingByColor.get(correctId) || 0) + 1);
                }
            }
        }
        for (const colorId of colors) {
            if (!this.remainingByColor.has(colorId)) this.remainingByColor.set(colorId, 0);
        }
        this.colorIds = Array.from(colors);
        this.lockStatsDirty = false;
    }
}
