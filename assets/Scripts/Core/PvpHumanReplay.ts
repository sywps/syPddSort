import { BoardModel } from './BoardModel';
import { PchConveyorRules } from './PchConveyorRules';
import { conveyorExitProgress } from './PchConveyorGeometry';
import { pixelLevelHash } from './PvpBotReplay';
import type { LevelData } from './LevelConfig';

export const HUMAN_REPLAY_PROTOCOL = 'pch-events-v1';
export const HUMAN_REPLAY_VERIFICATION = 'replay-verified-v1';
// [elapsedMs, kind, ...args]: init(speed), frame(absoluteTravel),
// tap(row,col,color,moved), ready(), speed(multiplier).
export type PvpRuleEvent = [number, number, ...number[]];
export type PvpReplayEnvelope = { protocol: string; levelHash: string; events: PvpRuleEvent[] };
type Cell = { row: number; col: number; colorId: number };

export class PvpHumanReplay {
    readonly board: BoardModel;
    readonly rules: PchConveyorRules;
    readonly boardTimeline: Array<{ elapsedMs: number; addedCells: Cell[] }> = [];
    readonly actions: Array<{ seq: number; elapsedMs: number; row: number; col: number; colorId: number; moved: number }> = [];
    readonly pendingReady: number[] = [];
    travel = 0;
    speed = 1;
    lastTime = 0;
    firstTap = -1;
    completedAt = -1;
    deadlockedAt = -1;
    simulatedMs = 0;
    private initialized = false;
    private autoSpeed = false;
    private readonly exit = conveyorExitProgress();
    private readonly total: number;
    private locked = 0;

    constructor(readonly level: LevelData) {
        this.board = new BoardModel(level);
        this.rules = new PchConveyorRules(this.board, level.conveyorCapacity, level.singleSelectionLimit, undefined, level.autoConveyorFinishSpeed);
        const cells: Cell[] = [];
        let total = 0;
        for (let row = 0; row < this.board.height; row++) for (let col = 0; col < this.board.width; col++) {
            if (this.board.correctColors[row][col]) total++;
            if (this.board.locked[row][col]) cells.push({ row, col, colorId: this.board.correctColors[row][col] });
        }
        if (!total || total > 4096) throw new Error('invalid replay level');
        this.total = total;
        this.addCells(0, cells);
    }

    get progress(): number { return this.locked / this.total; }

    private addCells(time: number, cells: Cell[]): void {
        if (!cells.length) return;
        this.locked += cells.length;
        const previous = this.boardTimeline[this.boardTimeline.length - 1];
        if (previous && previous.elapsedMs > 0 && Math.floor(previous.elapsedMs / 2000) === Math.floor(time / 2000)) {
            previous.elapsedMs = time;
            previous.addedCells.push(...cells);
        } else this.boardTimeline.push({ elapsedMs: time, addedCells: cells });
        if (this.locked === this.total && this.completedAt < 0) this.completedAt = time;
    }

    apply(event: PvpRuleEvent): void {
        if (!Array.isArray(event) || event.some(value => !Number.isFinite(value))) throw new Error('invalid replay event');
        const [time, kind, a, b, c, d] = event;
        if (!Number.isInteger(time) || time < this.lastTime || time > 600000) throw new Error('invalid replay time');
        const arity = [3, 3, 6, 2, 3][kind];
        if (event.length !== arity) throw new Error('unknown replay command');
        this.lastTime = time;
        if (!this.initialized && kind !== 0) throw new Error('missing replay initialization');
        if (kind === 0 || kind === 4) {
            if ([1, 2, 3].indexOf(a) < 0 || (kind === 0 && this.initialized)) throw new Error('invalid replay speed');
            this.initialized = true;
            this.speed = a;
        } else if (kind === 2) {
            if (this.completedAt >= 0 || this.rules.isBufferDeadlocked()) throw new Error('action after terminal');
            if (this.firstTap >= 0 && time > this.firstTap + this.level.timeLimit * 1000 + 1000) throw new Error('action after timeout');
            if (![a, b, c, d].every(Number.isInteger)) throw new Error('invalid replay tap');
            const block = this.rules.selectBoard(a, b);
            if (!block || block.colorId !== c) throw new Error('illegal replay selection');
            const moved = this.rules.storeBlock(block, 0).moved;
            if (!moved || moved !== d) throw new Error('illegal replay move count');
            if (this.firstTap < 0) this.firstTap = time;
            for (let index = 0; index < moved; index++) this.pendingReady.push(time + 160 + index * 12);
            this.pendingReady.sort((x, y) => x - y);
            this.actions.push({ seq: this.actions.length + 1, elapsedMs: time, row: a, col: b, colorId: c, moved: d });
        } else if (kind === 3) {
            // Animation callbacks may be one frame early relative to rounded wall time.
            if (!this.pendingReady.length || time + 34 < this.pendingReady[0]) throw new Error('premature replay arrival');
            this.pendingReady.shift();
            if (this.rules.markQueuedBeansReady(1) !== 1) throw new Error('invalid replay arrival');
            let nearest = 0;
            let distance = Infinity;
            for (let index = 0; index < this.rules.carrierCount; index++) {
                const progress = ((index + this.travel) / this.rules.carrierCount) % 1;
                const delta = Math.min(progress, 1 - progress);
                if (delta < distance) { nearest = index; distance = delta; }
            }
            if (distance <= 0.032) this.rules.transferReadyBeansToCarrier(nearest);
        } else if (kind === 1) {
            if (a < this.travel) throw new Error('reversed replay belt');
            if (this.rules.conveyorSpeedMultiplier === 5) this.autoSpeed = true;
            this.simulatedMs += (a - this.travel) * 250 / (this.autoSpeed ? 5 : this.speed);
            if (this.simulatedMs > time + 250) throw new Error('accelerated replay clock');
            const before = this.travel;
            this.travel = a;
            const count = this.rules.carrierCount;
            const crossed = (index: number, fraction: number) => Math.floor((index + a) / count - fraction)
                > Math.floor((index + before) / count - fraction);
            const cells: Cell[] = [];
            for (let index = 0; index < count; index++) {
                if (crossed(index, 1 - 0.2 / count) || crossed(index, 0)) this.rules.transferReadyBeansToCarrier(index);
                if (crossed(index, this.exit)) {
                    const placed = this.rules.autoPlaceAvailableLayers(index);
                    placed.boardCells.forEach((cell, n) => cells.push({ ...cell, colorId: placed.colorIds[n] }));
                }
            }
            this.addCells(time, cells);
            if (this.rules.isBufferDeadlocked() && this.deadlockedAt < 0) this.deadlockedAt = time;
        }
    }

    finish(terminalType: string, time: number): { progress: number; boardTimeline: Array<{ elapsedMs: number; addedCells: Cell[] }>;
        progressTimeline: Array<{ elapsedMs: number; progress: number }>; completeRun: boolean } {
        if (!Number.isInteger(time) || time < this.lastTime || time > 600000) throw new Error('invalid terminal time');
        if (terminalType === 'PASS' && (this.completedAt < 0 || time - this.completedAt > 10000)) throw new Error('unverified pass');
        if (terminalType === 'PASS' && this.firstTap >= 0 && this.completedAt > this.firstTap + this.level.timeLimit * 1000 + 1000) throw new Error('pass after timeout');
        if (terminalType === 'SURVIVED_OPPONENT_DEATH' && this.firstTap >= 0 && time > this.firstTap + this.level.timeLimit * 1000 + 1000) throw new Error('survival after timeout');
        if (terminalType === 'DEAD_CONVEYOR_FULL' && (!this.rules.isBufferDeadlocked() || this.deadlockedAt < 0
            || time - this.deadlockedAt > 1000)) throw new Error('unverified deadlock');
        if (terminalType === 'DEAD_TIMEOUT' && (this.firstTap < 0 || time < this.firstTap + this.level.timeLimit * 1000 - 1000
            || this.completedAt >= 0)) throw new Error('unverified timeout');
        if (['PASS', 'DEAD_CONVEYOR_FULL', 'DEAD_TIMEOUT', 'FORFEIT', 'SURVIVED_OPPONENT_DEATH'].indexOf(terminalType) < 0) throw new Error('invalid terminal');
        let locked = 0;
        const progressTimeline = this.boardTimeline.map(point => {
            locked += point.addedCells.length;
            return { elapsedMs: point.elapsedMs, progress: locked / this.total };
        });
        if (!progressTimeline.length || progressTimeline[0].elapsedMs > 0) progressTimeline.unshift({ elapsedMs: 0, progress: 0 });
        if (progressTimeline[progressTimeline.length - 1].elapsedMs !== time) progressTimeline.push({ elapsedMs: time, progress: this.progress });
        return { progress: this.progress, boardTimeline: this.boardTimeline, progressTimeline,
            completeRun: ['PASS', 'DEAD_CONVEYOR_FULL', 'DEAD_TIMEOUT'].indexOf(terminalType) >= 0 };
    }
}

export function replayHumanEvents(level: LevelData, envelope: PvpReplayEnvelope): PvpHumanReplay {
    if (envelope?.protocol !== HUMAN_REPLAY_PROTOCOL || envelope.levelHash !== pixelLevelHash(level)) throw new Error('replay version mismatch');
    if (!Array.isArray(envelope.events) || !envelope.events.length || envelope.events.length > 75000
        || JSON.stringify(envelope).length > 2500000) throw new Error('invalid replay envelope');
    const replay = new PvpHumanReplay(level);
    for (const event of envelope.events) replay.apply(event);
    return replay;
}
