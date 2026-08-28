import type { BoardModel } from './BoardModel';
import {
    CONVEYOR_STACK_DEPTH,
    validateConveyorCapacity,
    validatePchSingleSelectionLimit,
    type BeanBlockInfo,
} from './LevelConfig';

export type PchCarrierMove = {
    moved: number;
    boardCells: Array<{ row: number; col: number }>;
    carrierIndices: number[];
};

export type PchBoardCell = {
    row: number;
    col: number;
    target: number;
    current: number;
    locked: boolean;
};

export type PchEntryTransfer = {
    moved: number;
    carrierIndex: number;
    colorIds: number[];
};

export type PchCarrierReturnBatch = PchCarrierMove & {
    colorIds: number[];
};

export type PchSkillBeanSource = {
    kind: 'board';
    row: number;
    col: number;
    colorId: number;
} | {
    kind: 'entry';
    index: number;
    colorId: number;
} | {
    kind: 'carrier';
    carrierIndex: number;
    layerIndex: number;
    colorId: number;
};

export type PchSkillMove = {
    source: PchSkillBeanSource;
    target: { row: number; col: number };
};

export type PchSkillResult = {
    moved: number;
    colorId: number;
    moves: PchSkillMove[];
    boardCells: Array<{ row: number; col: number }>;
};

export class PchConveyorRules {
    public readonly moveLimit: number;
    public readonly initialCarrierCount: number;
    public readonly stackDepth = CONVEYOR_STACK_DEPTH;
    public readonly carriers: number[][];
    private readonly queuedColorIds: number[] = [];
    private readyQueuedCount = 0;

    constructor(
        public readonly board: BoardModel,
        conveyorCapacity: unknown,
        singleSelectionLimit?: unknown,
    ) {
        const capacity = validateConveyorCapacity(conveyorCapacity, 'PchConveyorRules');
        this.moveLimit = validatePchSingleSelectionLimit(singleSelectionLimit, 'PchConveyorRules');
        this.initialCarrierCount = capacity / this.stackDepth;
        this.carriers = Array.from({ length: this.initialCarrierCount }, () => []);
    }

    selectBoard(row: number, col: number): BeanBlockInfo | null {
        const preferredCorrectColor = this.board.correctColors[row]?.[col];
        const block = this.board.getConnectedBlock(row, col, preferredCorrectColor);
        if (!block) return null;
        return {
            ...block,
            cells: block.cells.slice(0, this.moveLimit),
        };
    }

    storeBlock(block: BeanBlockInfo, entryCarrierIndex: number): PchCarrierMove {
        const movedCells = block.cells.slice(0, Math.max(0, this.bufferCapacity - this.bufferCount));
        if (movedCells.length === 0) return this.emptyResult();

        for (const cell of movedCells) {
            this.board.currentColors[cell.row][cell.col] = 0;
            this.board.setLocked(cell.row, cell.col, false);
            this.queuedColorIds.push(block.colorId);
        }

        return {
            moved: movedCells.length,
            boardCells: movedCells,
            carrierIndices: movedCells.map(() => this.normalizeCarrierIndex(entryCarrierIndex)),
        };
    }

    markQueuedBeansReady(count: number): number {
        const nextReadyCount = Math.min(
            this.queuedColorIds.length,
            this.readyQueuedCount + Math.max(0, Math.floor(count)),
        );
        const added = nextReadyCount - this.readyQueuedCount;
        this.readyQueuedCount = nextReadyCount;
        return added;
    }

    transferReadyBeansToCarrier(carrierIndex: number): PchEntryTransfer {
        const normalizedIndex = this.normalizeCarrierIndex(carrierIndex);
        const stack = this.carriers[normalizedIndex];
        const colorIds: number[] = [];
        while (stack.length < this.stackDepth && this.readyQueuedCount > 0 && this.queuedColorIds.length > 0) {
            const colorId = this.queuedColorIds.shift()!;
            stack.push(colorId);
            colorIds.push(colorId);
            this.readyQueuedCount -= 1;
        }
        return { moved: colorIds.length, carrierIndex: normalizedIndex, colorIds };
    }

    addBufferSlots(beanSlots: number): number {
        if (!Number.isInteger(beanSlots) || beanSlots <= 0 || beanSlots % this.stackDepth !== 0) {
            throw new Error(`beanSlots must be a positive multiple of ${this.stackDepth}`);
        }
        const addedCarrierCount = beanSlots / this.stackDepth;
        for (let i = 0; i < addedCarrierCount; i += 1) this.carriers.push([]);
        return addedCarrierCount * this.stackDepth;
    }

    autoPlaceTop(carrierIndex: number): PchCarrierMove {
        const stack = this.carriers[carrierIndex];
        const colorId = stack?.[stack.length - 1] || 0;
        if (colorId <= 0) return this.emptyResult();

        for (let row = 0; row < this.board.height; row += 1) {
            for (let col = 0; col < this.board.width; col += 1) {
                if (this.board.currentColors[row][col] !== 0
                    || this.board.locked[row][col]
                    || this.board.correctColors[row][col] !== colorId) continue;
                stack.pop();
                this.board.currentColors[row][col] = colorId;
                this.board.setLocked(row, col, true);
                return {
                    moved: 1,
                    boardCells: [{ row, col }],
                    carrierIndices: [carrierIndex],
                };
            }
        }
        return this.emptyResult();
    }

    autoPlaceAvailableTop(carrierIndex: number): PchCarrierReturnBatch {
        const boardCells: Array<{ row: number; col: number }> = [];
        const carrierIndices: number[] = [];
        const colorIds: number[] = [];
        while (true) {
            const colorId = this.topColor(carrierIndex);
            if (colorId <= 0) break;
            const result = this.autoPlaceTop(carrierIndex);
            if (result.moved <= 0) break;
            boardCells.push(...result.boardCells);
            carrierIndices.push(...result.carrierIndices);
            colorIds.push(colorId);
        }
        return {
            moved: boardCells.length,
            boardCells,
            carrierIndices,
            colorIds,
        };
    }

    forceCompleteColor(preferredColorId: number = 0): PchSkillResult {
        const targetCounts = new Map<number, number>();
        for (let row = 0; row < this.board.height; row += 1) {
            for (let col = 0; col < this.board.width; col += 1) {
                const colorId = this.board.correctColors[row][col];
                if (colorId <= 0 || this.board.locked[row][col]) continue;
                targetCounts.set(colorId, (targetCounts.get(colorId) || 0) + 1);
            }
        }
        const bufferCounts = new Map<number, number>();
        for (const source of this.collectBufferSources()) {
            bufferCounts.set(source.colorId, (bufferCounts.get(source.colorId) || 0) + 1);
        }
        const candidates = Array.from(targetCounts.keys()).sort((left, right) => {
            const storedDiff = (bufferCounts.get(right) || 0) - (bufferCounts.get(left) || 0);
            if (storedDiff !== 0) return storedDiff;
            const targetDiff = (targetCounts.get(left) || 0) - (targetCounts.get(right) || 0);
            return targetDiff !== 0 ? targetDiff : left - right;
        });
        const colorId = preferredColorId > 0 && targetCounts.has(preferredColorId)
            ? preferredColorId
            : (candidates[0] || 0);
        if (colorId <= 0) return this.emptySkillResult();

        const changed = new Map<string, { row: number; col: number }>();
        const targets: Array<{ row: number; col: number }> = [];
        const boardSources: Array<Extract<PchSkillBeanSource, { kind: 'board' }>> = [];
        for (let row = 0; row < this.board.height; row += 1) {
            for (let col = 0; col < this.board.width; col += 1) {
                if (this.board.locked[row][col]) continue;
                const current = this.board.currentColors[row][col];
                const correct = this.board.correctColors[row][col];
                if (current === colorId && correct === colorId) {
                    this.board.setLocked(row, col, true);
                    changed.set(`${row},${col}`, { row, col });
                    continue;
                }
                if (correct === colorId) targets.push({ row, col });
                if (current === colorId) boardSources.push({ kind: 'board', row, col, colorId });
            }
        }
        const bufferSources = this.collectBufferSources(colorId);
        const sources = [...bufferSources, ...boardSources];
        if (sources.length !== targets.length) {
            throw new Error(`[pch-skill] clear-color source/target mismatch for ${colorId}: ${sources.length}/${targets.length}`);
        }
        targets.sort((left, right) => {
            const leftEmpty = this.board.currentColors[left.row][left.col] === 0 ? 0 : 1;
            const rightEmpty = this.board.currentColors[right.row][right.col] === 0 ? 0 : 1;
            return leftEmpty - rightEmpty;
        });
        const moves: PchSkillMove[] = sources.map((source, index) => ({ source, target: targets[index] }));
        const displacedColors: number[] = [];
        for (const source of boardSources) {
            this.board.currentColors[source.row][source.col] = 0;
            this.board.setLocked(source.row, source.col, false);
            changed.set(`${source.row},${source.col}`, { row: source.row, col: source.col });
        }
        for (const target of targets) {
            const displaced = this.board.currentColors[target.row][target.col];
            if (displaced > 0 && displaced !== colorId) displacedColors.push(displaced);
            this.board.currentColors[target.row][target.col] = colorId;
            this.board.setLocked(target.row, target.col, true);
            changed.set(`${target.row},${target.col}`, target);
        }
        const emptyCells = this.collectEmptyBoardCells();
        if (emptyCells.length < displacedColors.length) {
            throw new Error(`[pch-skill] clear-color has ${displacedColors.length} displaced beans but only ${emptyCells.length} empty cells`);
        }
        displacedColors.forEach((displacedColor, index) => {
            const destination = emptyCells[index];
            this.board.currentColors[destination.row][destination.col] = displacedColor;
            this.board.setLocked(
                destination.row,
                destination.col,
                this.board.correctColors[destination.row][destination.col] === displacedColor,
            );
            changed.set(`${destination.row},${destination.col}`, destination);
        });
        this.removeBufferColor(colorId);
        return {
            moved: moves.length,
            colorId,
            moves,
            boardCells: Array.from(changed.values()),
        };
    }

    forceCompleteRandomColor(randomSource: () => number = Math.random): PchSkillResult {
        const candidates = new Set<number>();
        for (let row = 0; row < this.board.height; row += 1) {
            for (let col = 0; col < this.board.width; col += 1) {
                const colorId = this.board.correctColors[row][col];
                if (colorId > 0 && !this.board.locked[row][col]) candidates.add(colorId);
            }
        }
        const colorIds = Array.from(candidates).sort((left, right) => left - right);
        if (colorIds.length === 0) return this.emptySkillResult();
        const randomValue = Number(randomSource());
        const normalized = Number.isFinite(randomValue)
            ? Math.min(0.999999, Math.max(0, randomValue))
            : 0;
        return this.forceCompleteColor(colorIds[Math.floor(normalized * colorIds.length)]);
    }

    clearBufferToBoard(): PchSkillResult {
        const sources = this.collectBufferSources();
        if (sources.length === 0) return this.emptySkillResult();
        const changed = new Map<string, { row: number; col: number }>();
        for (let row = 0; row < this.board.height; row += 1) {
            for (let col = 0; col < this.board.width; col += 1) {
                if (this.board.locked[row][col]) continue;
                const current = this.board.currentColors[row][col];
                if (current > 0 && current === this.board.correctColors[row][col]) {
                    this.board.setLocked(row, col, true);
                    changed.set(`${row},${col}`, { row, col });
                }
            }
        }

        const claimed = new Set<string>();
        const moves: PchSkillMove[] = [];
        for (const source of sources) {
            const candidates: Array<{ row: number; col: number }> = [];
            for (let row = 0; row < this.board.height; row += 1) {
                for (let col = 0; col < this.board.width; col += 1) {
                    const key = `${row},${col}`;
                    if (this.board.locked[row][col]
                        || claimed.has(key)
                        || this.board.correctColors[row][col] !== source.colorId) continue;
                    candidates.push({ row, col });
                }
            }
            candidates.sort((left, right) => {
                const leftEmpty = this.board.currentColors[left.row][left.col] === 0 ? 0 : 1;
                const rightEmpty = this.board.currentColors[right.row][right.col] === 0 ? 0 : 1;
                return leftEmpty - rightEmpty;
            });
            const target = candidates[0];
            if (!target) {
                throw new Error(`[pch-skill] clear-buffer has no target for color ${source.colorId}`);
            }
            claimed.add(`${target.row},${target.col}`);
            moves.push({ source, target });
        }

        const displacedColors: number[] = [];
        for (const move of moves) {
            const target = move.target;
            const displaced = this.board.currentColors[target.row][target.col];
            if (displaced > 0) displacedColors.push(displaced);
            this.board.currentColors[target.row][target.col] = move.source.colorId;
            this.board.setLocked(target.row, target.col, true);
            changed.set(`${target.row},${target.col}`, target);
        }
        const emptyCells = this.collectEmptyBoardCells();
        if (emptyCells.length !== displacedColors.length) {
            throw new Error(`[pch-skill] clear-buffer displacement mismatch: ${displacedColors.length}/${emptyCells.length}`);
        }
        displacedColors.forEach((colorId, index) => {
            const destination = emptyCells[index];
            this.board.currentColors[destination.row][destination.col] = colorId;
            this.board.setLocked(
                destination.row,
                destination.col,
                this.board.correctColors[destination.row][destination.col] === colorId,
            );
            changed.set(`${destination.row},${destination.col}`, destination);
        });
        this.queuedColorIds.length = 0;
        this.readyQueuedCount = 0;
        for (const stack of this.carriers) stack.length = 0;
        return {
            moved: moves.length,
            colorId: 0,
            moves,
            boardCells: Array.from(changed.values()),
        };
    }

    topColor(carrierIndex: number): number {
        const stack = this.carriers[carrierIndex];
        return stack?.[stack.length - 1] || 0;
    }

    get carrierCount(): number {
        return this.carriers.length;
    }

    get bufferCount(): number {
        return this.entryCount + this.carriers.reduce((count, stack) => count + stack.length, 0);
    }

    get bufferCapacity(): number {
        return this.carrierCount * this.stackDepth;
    }

    get entryCount(): number {
        return this.queuedColorIds.length;
    }

    get readyEntryCount(): number {
        return this.readyQueuedCount;
    }

    get entryColors(): readonly number[] {
        return this.queuedColorIds;
    }

    get conveyorSpeedMultiplier(): 1 | 5 {
        if (this.entryCount > 0) return 1;
        const pendingTargetCounts = new Map<number, number>();
        for (let row = 0; row < this.board.height; row += 1) {
            for (let col = 0; col < this.board.width; col += 1) {
                if (this.board.locked[row][col]) continue;
                if (this.board.currentColors[row][col] > 0) return 1;
                const colorId = this.board.correctColors[row][col];
                if (colorId > 0) {
                    pendingTargetCounts.set(colorId, (pendingTargetCounts.get(colorId) || 0) + 1);
                }
            }
        }
        if (pendingTargetCounts.size === 0) return 1;

        const storedCounts = new Map<number, number>();
        const returnableTopColors = new Set<number>();
        for (const stack of this.carriers) {
            for (const colorId of stack) {
                if (colorId > 0) storedCounts.set(colorId, (storedCounts.get(colorId) || 0) + 1);
            }
            const topColorId = stack[stack.length - 1] || 0;
            if (topColorId > 0) returnableTopColors.add(topColorId);
        }
        if (storedCounts.size !== pendingTargetCounts.size) return 1;
        for (const [colorId, pendingCount] of pendingTargetCounts) {
            if (storedCounts.get(colorId) !== pendingCount) return 1;
        }
        for (const colorId of returnableTopColors) {
            if (pendingTargetCounts.has(colorId)) return 5;
        }
        return 1;
    }

    isBufferDeadlocked(): boolean {
        if (this.bufferCount !== this.bufferCapacity || this.entryCount > 0) return false;
        const returnableTopColors = new Set<number>();
        for (const stack of this.carriers) {
            const colorId = stack[stack.length - 1] || 0;
            if (colorId > 0) returnableTopColors.add(colorId);
        }
        if (returnableTopColors.size === 0) return true;
        for (let row = 0; row < this.board.height; row += 1) {
            for (let col = 0; col < this.board.width; col += 1) {
                if (this.board.currentColors[row][col] !== 0 || this.board.locked[row][col]) continue;
                if (returnableTopColors.has(this.board.correctColors[row][col])) return false;
            }
        }
        return true;
    }

    get cells(): PchBoardCell[] {
        const cells: PchBoardCell[] = [];
        for (let row = 0; row < this.board.height; row += 1) {
            for (let col = 0; col < this.board.width; col += 1) {
                const target = this.board.correctColors[row][col];
                if (target === 0) continue;
                cells.push({
                    row,
                    col,
                    target,
                    current: this.board.currentColors[row][col],
                    locked: this.board.locked[row][col],
                });
            }
        }
        return cells;
    }

    private normalizeCarrierIndex(index: number): number {
        return ((index % this.carrierCount) + this.carrierCount) % this.carrierCount;
    }

    private collectBufferSources(colorId: number = 0): PchSkillBeanSource[] {
        const sources: PchSkillBeanSource[] = [];
        this.queuedColorIds.forEach((storedColor, index) => {
            if (colorId <= 0 || storedColor === colorId) {
                sources.push({ kind: 'entry', index, colorId: storedColor });
            }
        });
        this.carriers.forEach((stack, carrierIndex) => {
            stack.forEach((storedColor, layerIndex) => {
                if (colorId <= 0 || storedColor === colorId) {
                    sources.push({ kind: 'carrier', carrierIndex, layerIndex, colorId: storedColor });
                }
            });
        });
        return sources;
    }

    private removeBufferColor(colorId: number): void {
        const readyColors = this.queuedColorIds.slice(0, this.readyQueuedCount).filter((storedColor) => storedColor !== colorId);
        const waitingColors = this.queuedColorIds.slice(this.readyQueuedCount).filter((storedColor) => storedColor !== colorId);
        this.queuedColorIds.length = 0;
        this.queuedColorIds.push(...readyColors, ...waitingColors);
        this.readyQueuedCount = readyColors.length;
        for (const stack of this.carriers) {
            const kept = stack.filter((storedColor) => storedColor !== colorId);
            stack.length = 0;
            stack.push(...kept);
        }
    }

    private collectEmptyBoardCells(): Array<{ row: number; col: number }> {
        const cells: Array<{ row: number; col: number }> = [];
        for (let row = 0; row < this.board.height; row += 1) {
            for (let col = 0; col < this.board.width; col += 1) {
                if (this.board.correctColors[row][col] <= 0
                    || this.board.locked[row][col]
                    || this.board.currentColors[row][col] !== 0) continue;
                cells.push({ row, col });
            }
        }
        return cells;
    }

    private emptySkillResult(): PchSkillResult {
        return { moved: 0, colorId: 0, moves: [], boardCells: [] };
    }

    private emptyResult(): PchCarrierMove {
        return { moved: 0, boardCells: [], carrierIndices: [] };
    }
}
