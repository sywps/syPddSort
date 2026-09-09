import { Director, director, Input, input, Game, game } from 'cc';
import type { EventTouch } from 'cc';
import { AudioMgr } from '../GameCtrlShared';
import type { SfxName } from '../AudioManifest';
import type { ResultPanelKind } from '../GameplayResultPanelController';
import { runtimeWarn } from '../RuntimeLog';
import { debugPerfTrace } from '../DebugPerfTrace';

type WarmupTask = {
    name: string;
    isReady: () => boolean;
    run: (done: (error?: Error) => void) => void;
};

const POST_PLAYABLE_WARMUP_TASK_GAP_SECONDS = 0.25;
const POST_PLAYABLE_WARMUP_IDLE_SECONDS = 0.5;

function isWarmupStillCurrent(runtime: any, seq: number, initSeq: number): boolean {
    return !!runtime?.isValid && runtime._postPlayableWarmupSeq === seq && runtime._gameplayInitSeq === initSeq;
}

function shouldPauseWarmupTask(runtime: any): boolean {
    if (runtime._gameForeground === false || runtime._loadingOverlay?.activeInHierarchy) return true;
    if (Number(runtime._modalFocusRefs) > 0 || runtime._rewardedGrantTransaction) return true;
    if (!runtime._pchConveyorGameplayController?.isPostPlayableWarmupIdle()) return true;
    if (runtime._adShowing || runtime._skillActive || runtime._settlementNextTransitioning) return true;
    if (runtime._placementInputLocked || runtime.isSelected) return true;
    if (runtime.activeBoardTouches instanceof Map && runtime.activeBoardTouches.size > 0) return true;
    if ((Number(runtime._placementVisualRefs) || 0) > 0) return true;
    if (runtime._panelOpenInFlight instanceof Set && runtime._panelOpenInFlight.size > 0) return true;
    if ((Number(runtime._spriteFrameLoadInFlight) || 0) > 0) return true;
    if (runtime._spriteFrameLoadQueue?.length > 0) return true;
    if (runtime._spriteFrameApplyPending instanceof Map && runtime._spriteFrameApplyPending.size > 0) return true;
    return false;
}

function createWarmupTasks(runtime: any): WarmupTask[] {
    const panel = (kind: ResultPanelKind): WarmupTask => ({
        name: `result-panel:${kind}`,
        isReady: () => runtime._hasGameplayResultPanelPrefabsReady([kind]),
        run: (done) => runtime._ensureGameplayResultPanelPrefabsReady(() => done(), done, [kind]),
    });
    const audio = (name: SfxName): WarmupTask => ({
        name: `gameplay-audio:${name}`,
        isReady: () => AudioMgr.inst.isSfxReady(name),
        run: (done) => AudioMgr.inst.preload(name, done),
    });
    return [
        panel('win'), audio('winSettlement'), audio('winColor'),
        panel('bufferFullRevive'), panel('revive'), panel('lose'),
        audio('lose'), audio('tick'),
    ];
}

export function installPostPlayableWarmupModule(target: any): void {
    Object.assign(target, {
        _runNextPostPlayableWarmupTask(seq: number, initSeq: number): void {
            if (!isWarmupStillCurrent(this, seq, initSeq)) return;
            if (this._postPlayableWarmupRunning) return;
            let task = this._postPlayableWarmupQueue.shift() as WarmupTask | undefined;
            while (task?.isReady()) task = this._postPlayableWarmupQueue.shift();
            if (!task) return;
            this._postPlayableWarmupRunning = true;
            this._postPlayableWarmupRunningTaskName = task.name;
            const startedAt = Date.now();
            let doneCalled = false;
            const done = (error?: Error) => {
                if (doneCalled || !isWarmupStillCurrent(this, seq, initSeq)) return;
                doneCalled = true;
                this._postPlayableWarmupRunning = false;
                this._postPlayableWarmupRunningTaskName = '';
                this._postPlayableWarmupNextAt = Date.now() + POST_PLAYABLE_WARMUP_TASK_GAP_SECONDS * 1000;
                if (error) runtimeWarn(`[PostPlayableWarmup] ${task.name} failed:`, error);
                debugPerfTrace(error ? 'postPlayableWarmup.task.failed' : 'postPlayableWarmup.task.finish', {
                    name: task.name,
                    durationMs: Date.now() - startedAt,
                    queueSize: this._postPlayableWarmupQueue.length,
                });
            };
            debugPerfTrace('postPlayableWarmup.task.start', { name: task.name });
            try {
                task.run(done);
            } catch (error) {
                done(error instanceof Error ? error : new Error(String(error)));
            }
        },

        stopPostPlayableWarmup(): void {
            this._postPlayableWarmupCleanup?.();
            this._postPlayableWarmupCleanup = null;
            this._postPlayableWarmupSeq = (Number(this._postPlayableWarmupSeq) || 0) + 1;
            this._postPlayableWarmupQueue = [];
            this._postPlayableWarmupRunning = false;
            this._postPlayableWarmupRunningTaskName = '';
        },

        startPostPlayableWarmup(reason: string = 'gameplay-ready'): void {
            if (!this.isValid) return;
            const initSeq = Number(this._gameplayInitSeq) || 0;
            if (this._postPlayableWarmupInitSeq === initSeq) {
                return;
            }
            this.stopPostPlayableWarmup();
            this._postPlayableWarmupInitSeq = initSeq;
            const seq = this._postPlayableWarmupSeq;
            let prepared = false;
            let idleSince: number | null = null;
            let lastFrameAt: number | null = null;
            const touches = new Set<number>();
            const onInput = (event: EventTouch) => {
                idleSince = null;
                if (event.type === Input.EventType.TOUCH_START || event.type === Input.EventType.TOUCH_MOVE) touches.add(event.getID());
                else touches.delete(event.getID());
            };
            const resetIdle = () => { idleSince = null; touches.clear(); };
            this._postPlayableWarmupNextAt = 0;
            const afterDraw = () => {
                if (!isWarmupStillCurrent(this, seq, initSeq)) {
                    cleanup();
                    return;
                }
                if (prepared && !this._postPlayableWarmupRunning && !this._postPlayableWarmupQueue.length) {
                    this.stopPostPlayableWarmup();
                    return;
                }
                if (this.isGameEnd) {
                    idleSince = null;
                    return;
                }
                const now = Date.now();
                // A background pause or long frame is not an observed idle window.
                if (lastFrameAt !== null && now - lastFrameAt > 250) idleSince = null;
                lastFrameAt = now;
                if (touches.size > 0 || shouldPauseWarmupTask(this)) {
                    idleSince = null;
                    return;
                }
                if (!prepared) {
                    this._postPlayableWarmupQueue = createWarmupTasks(this);
                    prepared = true;
                    debugPerfTrace('postPlayableWarmup.ready', { reason });
                }
                if (idleSince === null) idleSince = now;
                if (now - idleSince < POST_PLAYABLE_WARMUP_IDLE_SECONDS * 1000 || now < this._postPlayableWarmupNextAt) return;
                this._runNextPostPlayableWarmupTask(seq, initSeq);
            };
            const cleanup = () => {
                director.off(Director.EVENT_AFTER_DRAW, afterDraw);
                for (const event of [Input.EventType.TOUCH_START, Input.EventType.TOUCH_MOVE, Input.EventType.TOUCH_END, Input.EventType.TOUCH_CANCEL] as const) {
                    input.off(event, onInput);
                }
                game.off(Game.EVENT_HIDE, resetIdle);
                game.off(Game.EVENT_SHOW, resetIdle);
            };
            this._postPlayableWarmupCleanup = cleanup;
            for (const event of [Input.EventType.TOUCH_START, Input.EventType.TOUCH_MOVE, Input.EventType.TOUCH_END, Input.EventType.TOUCH_CANCEL] as const) {
                input.on(event, onInput);
            }
            game.on(Game.EVENT_HIDE, resetIdle);
            game.on(Game.EVENT_SHOW, resetIdle);
            director.on(Director.EVENT_AFTER_DRAW, afterDraw);
        },
    });
}
