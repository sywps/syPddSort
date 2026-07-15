import { AudioMgr } from '../GameCtrlShared';
import { runtimeWarn } from '../RuntimeLog';
import { debugPerfTrace } from '../DebugPerfTrace';

type WarmupTask = {
    name: string;
    minDelaySeconds: number;
    pauseWhenBusy?: boolean;
    run: (done: () => void) => void | Promise<void>;
};

type QueuedWarmupTask = WarmupTask & {
    notBeforeMs: number;
};

const REWARDED_AD_WARMUP_DELAY_SECONDS = 2.0;
const POST_PLAYABLE_WARMUP_TASK_GAP_SECONDS = 0.25;
const POST_PLAYABLE_WARMUP_BUSY_RETRY_SECONDS = 0.5;

function isWarmupStillCurrent(runtime: any, seq: number, initSeq: number): boolean {
    return !!runtime?.isValid && runtime._postPlayableWarmupSeq === seq && runtime._gameplayInitSeq === initSeq;
}

function scheduleWarmup(runtime: any, callback: () => void, delaySeconds: number): void {
    const delay = Math.max(0, Number(delaySeconds) || 0);
    if (typeof runtime.scheduleOnce === 'function') {
        runtime.scheduleOnce(callback, delay);
        return;
    }
    setTimeout(callback, delay * 1000);
}

function shouldPauseWarmupTask(runtime: any, task: QueuedWarmupTask): boolean {
    if (!task.pauseWhenBusy) return false;
    if (runtime._adShowing || runtime._skillActive || runtime._settlementNextTransitioning) return true;
    if ((Number(runtime._placementVisualRefs) || 0) > 0) return true;
    if (runtime._panelOpenInFlight instanceof Set && runtime._panelOpenInFlight.size > 0) return true;
    if ((Number(runtime._spriteFrameLoadInFlight) || 0) > 0) return true;
    if (runtime._spriteFrameApplyPending instanceof Map && runtime._spriteFrameApplyPending.size > 0) return true;
    return false;
}

function scheduleNextWarmupTask(runtime: any, seq: number, initSeq: number, delaySeconds: number = 0): void {
    scheduleWarmup(runtime, () => {
        runtime._runNextPostPlayableWarmupTask?.(seq, initSeq);
    }, delaySeconds);
}

export function installPostPlayableWarmupModule(target: any): void {
    Object.assign(target, {
        _runNextPostPlayableWarmupTask(seq: number, initSeq: number): void {
            if (!isWarmupStillCurrent(this, seq, initSeq)) return;
            if (this._postPlayableWarmupRunning) return;
            if (!Array.isArray(this._postPlayableWarmupQueue) || this._postPlayableWarmupQueue.length <= 0) {
                return;
            }
            const task = this._postPlayableWarmupQueue.shift() as QueuedWarmupTask | undefined;
            if (!task) return;
            const delaySeconds = Math.max(0, (task.notBeforeMs - Date.now()) / 1000);
            this._postPlayableWarmupRunning = true;
            this._postPlayableWarmupRunningTaskName = task.name;

            scheduleWarmup(this, () => {
                if (!isWarmupStillCurrent(this, seq, initSeq)) {
                    this._postPlayableWarmupRunning = false;
                    this._postPlayableWarmupRunningTaskName = '';
                    return;
                }
                if (shouldPauseWarmupTask(this, task)) {
                    task.notBeforeMs = Date.now() + POST_PLAYABLE_WARMUP_BUSY_RETRY_SECONDS * 1000;
                    this._postPlayableWarmupQueue.unshift(task);
                    this._postPlayableWarmupRunning = false;
                    this._postPlayableWarmupRunningTaskName = '';
                    debugPerfTrace('postPlayableWarmup.task.pause', { name: task.name });
                    scheduleNextWarmupTask(this, seq, initSeq, POST_PLAYABLE_WARMUP_BUSY_RETRY_SECONDS);
                    return;
                }

                const startedAt = Date.now();
                let doneCalled = false;
                const done = () => {
                    if (doneCalled) return;
                    doneCalled = true;
                    this._postPlayableWarmupRunning = false;
                    this._postPlayableWarmupRunningTaskName = '';
                    debugPerfTrace('postPlayableWarmup.task.finish', {
                        name: task.name,
                        durationMs: Date.now() - startedAt,
                        queueSize: Array.isArray(this._postPlayableWarmupQueue) ? this._postPlayableWarmupQueue.length : 0,
                    });
                    scheduleNextWarmupTask(this, seq, initSeq, POST_PLAYABLE_WARMUP_TASK_GAP_SECONDS);
                };

                debugPerfTrace('postPlayableWarmup.task.start', { name: task.name });
                try {
                    const result = task.run(done);
                    if (result && typeof (result as Promise<void>).then === 'function') {
                        (result as Promise<void>).then(done).catch((error: unknown) => {
                            runtimeWarn(`[PostPlayableWarmup] ${task.name} failed:`, error);
                            done();
                        });
                    }
                } catch (error) {
                    runtimeWarn(`[PostPlayableWarmup] ${task.name} failed:`, error);
                    done();
                }
            }, delaySeconds);
        },

        startPostPlayableWarmup(reason: string = 'gameplay-ready'): void {
            if (!this.isValid) return;
            const initSeq = Number(this._gameplayInitSeq) || 0;
            if (this._postPlayableWarmupInitSeq === initSeq) {
                return;
            }
            this._postPlayableWarmupInitSeq = initSeq;
            const seq = (Number(this._postPlayableWarmupSeq) || 0) + 1;
            this._postPlayableWarmupSeq = seq;

            const tasks: WarmupTask[] = [
                {
                    name: 'gameplay-audio',
                    minDelaySeconds: 0,
                    run: (done) => {
                        AudioMgr.inst.preloadGameplayAudioSet();
                        AudioMgr.inst.playGameBgm();
                        done();
                    },
                },
                {
                    name: 'result-panels',
                    minDelaySeconds: 0.08,
                    run: (done) => {
                        this._ensureGameplayResultPanelPrefabsReady?.(() => {
                            if (!isWarmupStillCurrent(this, seq, initSeq)) return;
                            done();
                        });
                        if (typeof this._ensureGameplayResultPanelPrefabsReady !== 'function') done();
                    },
                },
                {
                    name: 'rewarded-ad',
                    minDelaySeconds: REWARDED_AD_WARMUP_DELAY_SECONDS,
                    pauseWhenBusy: true,
                    run: (done) => {
                        this.scheduleRewardedAdPreload?.(`post-playable-warmup:${reason}`, 0);
                        done();
                    },
                },
            ];

            const now = Date.now();
            this._postPlayableWarmupQueue = tasks.map((task) => ({
                ...task,
                notBeforeMs: now + Math.max(0, Number(task.minDelaySeconds) || 0) * 1000,
            }));
            this._postPlayableWarmupRunning = false;
            this._postPlayableWarmupRunningTaskName = '';
            this._runNextPostPlayableWarmupTask?.(seq, initSeq);
        },
    });
}
