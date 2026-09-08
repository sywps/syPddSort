import { BoardModel } from './BoardModel';
import { PchConveyorRules } from './PchConveyorRules';
import type { LevelData, BeanBlockInfo } from './LevelConfig';

export const PVP_BOT_POLICY_VERSION = 'pch-legal-v3';
export type PvpBotProfile = { rating?: number; gamesPlayed?: number; lossStreak?: number };
type Cell = { row: number; col: number; colorId: number };
export type PvpBotRun = {
    replayId: string; policyVersion: string; levelHash: string; rating: number;
    terminalType: 'PASS' | 'DEAD_TIMEOUT' | 'DEAD_CONVEYOR_FULL';
    terminalTimeMs: number; progress: number;
    progressTimeline: Array<{ elapsedMs: number; progress: number }>;
    boardTimeline: Array<{ elapsedMs: number; addedCells: Cell[] }>;
    actions: Array<{ seq: number; elapsedMs: number; row: number; col: number; colorId: number; moved: number }>;
};

function hash(value: string): number {
    let result = 2166136261;
    for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    return result >>> 0;
}

export function pixelLevelHash(level: LevelData): string {
    const autoFinishSpeedHashSuffix = level.autoConveyorFinishSpeed === false ? '-no-auto-finish-speed' : '';
    return `pixel-${hash(JSON.stringify([level.boardWidth, level.boardHeight, level.correctColorArr,
        level.initRandomColorArr, level.conveyorCapacity, level.singleSelectionLimit || 12, level.timeLimit]))}${autoFinishSpeedHashSuffix}`;
}

export function botMatchRating(profile: PvpBotProfile): number {
    const rating = Number.isFinite(profile.rating) ? Number(profile.rating) : 1200;
    const novice = (profile.gamesPlayed || 0) < 5 ? 250 : 0;
    const protection = Math.min(3, Math.max(0, profile.lossStreak || 0)) * 100;
    return Math.max(700, Math.min(3000, rating - novice - protection));
}

function validateLevel(level: LevelData): void {
    if (!level || !Number.isInteger(level.boardWidth) || !Number.isInteger(level.boardHeight)
        || level.boardWidth < 1 || level.boardHeight < 1 || level.boardWidth * level.boardHeight > 65536
        || !Number.isFinite(level.timeLimit) || level.timeLimit <= 0 || level.timeLimit > 600) {
        throw new Error('机器人像素关卡参数无效');
    }
    const balance = new Map<number, number>();
    let cells = 0;
    for (let row = 0; row < level.boardHeight; row++) {
        if (level.correctColorArr?.[row]?.length !== level.boardWidth || level.initRandomColorArr?.[row]?.length !== level.boardWidth) {
            throw new Error('机器人棋盘尺寸不匹配');
        }
        for (let col = 0; col < level.boardWidth; col++) {
            const correct = level.correctColorArr[row][col];
            const current = level.initRandomColorArr[row][col];
            if (!Number.isInteger(correct) || !Number.isInteger(current) || correct < 0 || current < 0 || (!correct && current)) {
                throw new Error('机器人棋盘颜色无效');
            }
            if (correct) { cells++; balance.set(correct, (balance.get(correct) || 0) + 1); }
            if (current) balance.set(current, (balance.get(current) || 0) - 1);
        }
    }
    if (!cells || cells > 4096 || Array.from(balance.values()).some(value => value !== 0)) throw new Error('机器人棋盘颜色数量不守恒');
}

// Only legal rule commands mutate this board. Timing is a conservative 1x transport
// schedule; presentation tweens are not a second game simulation.
export function createPixelBotReplay(level: LevelData, seed: string, profile: PvpBotProfile = {}): PvpBotRun {
    validateLevel(level);
    const rating = botMatchRating(profile);
    const levelHash = pixelLevelHash(level);
    let randomState = hash(`${seed}:${rating}:${levelHash}:${PVP_BOT_POLICY_VERSION}`) || 1;
    const random = () => {
        randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
        return (randomState >>> 0) / 4294967296;
    };
    const board = new BoardModel(level);
    const rules = new PchConveyorRules(board, level.conveyorCapacity, level.singleSelectionLimit, undefined, level.autoConveyorFinishSpeed);
    const allCells: Cell[] = [];
    const initial: Cell[] = [];
    const colors = new Set<number>();
    for (let row = 0; row < board.height; row++) for (let col = 0; col < board.width; col++) {
        const colorId = board.correctColors[row][col];
        if (!colorId) continue;
        const cell = { row, col, colorId };
        allCells.push(cell); colors.add(colorId);
        if (board.locked[row][col]) initial.push(cell);
    }
    const run: PvpBotRun = { replayId: `bot:${hash(seed)}`, policyVersion: PVP_BOT_POLICY_VERSION, levelHash, rating,
        terminalType: 'DEAD_TIMEOUT', terminalTimeMs: Math.round(level.timeLimit * 1000), progress: initial.length / allCells.length,
        actions: [], progressTimeline: [{ elapsedMs: 0, progress: initial.length / allCells.length }],
        boardTimeline: initial.length ? [{ elapsedMs: 0, addedCells: initial }] : [] };
    const skill = Math.max(0, Math.min(1, (rating - 700) / 2300));
    const complexity = 1 + Math.min(0.6, allCells.length / 2000) + colors.size * 0.012;
    const interval = (1300 - skill * 800) * complexity;
    let nextTapMs = Math.round(1800 + random() * 1600);
    let readyAtMs = Infinity;
    let locked = initial.length;
    let travel = 0;
    const tickMs = 50;
    const crossed = (carrier: number, from: number, to: number, fraction: number) =>
        Math.floor((carrier + from) / rules.carrierCount - fraction) < Math.floor((carrier + to) / rules.carrierCount - fraction);
    const chooseBlock = (): BeanBlockInfo | null => {
        const seen = new Set<number>();
        const candidates: Array<{ block: BeanBlockInfo; score: number }> = [];
        const held = new Set(rules.entryColors);
        for (const stack of rules.carriers) for (const color of stack) held.add(color);
        const free = rules.bufferCapacity - rules.bufferCount;
        for (const cell of allCells) {
            if (board.locked[cell.row][cell.col] || !board.currentColors[cell.row][cell.col] || seen.has(cell.row * board.width + cell.col)) continue;
            const block = rules.selectBoard(cell.row, cell.col);
            if (!block) continue;
            for (const item of block.cells) seen.add(item.row * board.width + item.col);
            const opensHeld = block.cells.reduce((count, item) => count + (held.has(board.correctColors[item.row][item.col]) ? 1 : 0), 0);
            candidates.push({ block, score: opensHeld * 4 + Math.min(block.cells.length, free) + random() * (18 - skill * 14) });
        }
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0]?.block || null;
    };
    for (let elapsedMs = tickMs; elapsedMs <= run.terminalTimeMs; elapsedMs += tickMs) {
        if (elapsedMs >= readyAtMs) { rules.markQueuedBeansReady(rules.entryCount); readyAtMs = Infinity; }
        const previous = travel;
        travel = elapsedMs / 250;
        const addedCells: Cell[] = [];
        for (let carrier = 0; carrier < rules.carrierCount; carrier++) {
            if (crossed(carrier, previous, travel, 0)) rules.transferReadyBeansToCarrier(carrier);
            // Wait a full half-lap before returning. No instant target fills.
            if (crossed(carrier, previous, travel, 0.5)) {
                const placed = rules.autoPlaceAvailableLayers(carrier);
                placed.boardCells.forEach((cell, index) => addedCells.push({ ...cell, colorId: placed.colorIds[index] }));
            }
        }
        if (addedCells.length) {
            locked += addedCells.length;
            run.progress = locked / allCells.length;
            const last = run.boardTimeline[run.boardTimeline.length - 1];
            if (last && last.elapsedMs > 0 && Math.floor(last.elapsedMs / 2000) === Math.floor(elapsedMs / 2000)) {
                last.elapsedMs = elapsedMs; last.addedCells.push(...addedCells);
                const point = run.progressTimeline[run.progressTimeline.length - 1];
                point.elapsedMs = elapsedMs; point.progress = run.progress;
            } else {
                run.boardTimeline.push({ elapsedMs, addedCells });
                run.progressTimeline.push({ elapsedMs, progress: run.progress });
            }
        }
        if (board.isAllLocked() || rules.isBufferDeadlocked()) {
            run.terminalType = board.isAllLocked() ? 'PASS' : 'DEAD_CONVEYOR_FULL';
            run.terminalTimeMs = elapsedMs;
            break;
        }
        if (elapsedMs < nextTapMs || rules.entryCount > rules.moveLimit) continue;
        const block = chooseBlock();
        if (block && rules.bufferCount < rules.bufferCapacity) {
            const moved = rules.storeBlock(block, 0).moved;
            if (moved) {
                run.actions.push({ seq: run.actions.length + 1, elapsedMs, row: block.cells[0].row, col: block.cells[0].col, colorId: block.colorId, moved });
                readyAtMs = Math.max(Number.isFinite(readyAtMs) ? readyAtMs : 0, elapsedMs + 160 + moved * 12);
            }
        }
        const pause = random() < 0.18 ? 1800 + random() * 2200 : 0;
        nextTapMs = elapsedMs + Math.round(interval * (0.75 + random() * 0.5) + pause);
    }
    if (run.progressTimeline[run.progressTimeline.length - 1].elapsedMs !== run.terminalTimeMs) {
        run.progressTimeline.push({ elapsedMs: run.terminalTimeMs, progress: run.progress });
    }
    return run;
}
