import { AudioMgr } from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';
import { runtimeWarn } from '../RuntimeLog';
import { getMiniGameBuildMode, getMiniGameBuildPlatform, isMiniGameRuntime } from '../MiniGamePlatform';

type WarmupTask = {
    name: string;
    delaySeconds: number;
    releaseMiniGame?: 'run' | 'skip';
    run: () => void;
};

const RELEASE_REWARDED_AD_WARMUP_DELAY_SECONDS = 2.0;

function shouldUseConservativePostPlayableWarmup(): boolean {
    if (getMiniGameBuildMode() !== 'release') return false;
    const platform = getMiniGameBuildPlatform();
    return platform === 'wechat' || platform === 'douyin' || isMiniGameRuntime();
}

function normalizeWarmupTaskForPolicy(task: WarmupTask, conservativeRelease: boolean): WarmupTask | null {
    if (!conservativeRelease) return task;
    if (task.releaseMiniGame === 'skip') return null;
    if (task.name === 'rewarded-ad') {
        return {
            ...task,
            delaySeconds: Math.max(task.delaySeconds, RELEASE_REWARDED_AD_WARMUP_DELAY_SECONDS),
        };
    }
    return task;
}

function runWarmupTask(runtime: any, seq: number, initSeq: number, task: WarmupTask): void {
    const run = () => {
        if (!runtime?.isValid || runtime._postPlayableWarmupSeq !== seq || runtime._gameplayInitSeq !== initSeq) {
            return;
        }
        try {
            task.run();
        } catch (error) {
            runtimeWarn(`[PostPlayableWarmup] ${task.name} failed:`, error);
        }
    };
    const delaySeconds = Math.max(0, Number(task.delaySeconds) || 0);
    if (typeof runtime.scheduleOnce === 'function') {
        runtime.scheduleOnce(run, delaySeconds);
        return;
    }
    setTimeout(run, delaySeconds * 1000);
}

export function installPostPlayableWarmupModule(target: any): void {
    Object.assign(target, {
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
                    delaySeconds: 0,
                    run: () => {
                        AudioMgr.inst.preloadGameplayAudioSet();
                        AudioMgr.inst.playGameBgm();
                    },
                },
                {
                    name: 'result-panels',
                    delaySeconds: 0.02,
                    releaseMiniGame: 'skip',
                    run: () => {
                        this._ensureGameplayResultPanelPrefabsReady?.(() => {
                            if (!this.isValid || this._postPlayableWarmupSeq !== seq || this._gameplayInitSeq !== initSeq) return;
                            this.ensureGameplayResultPanelsCreated?.();
                        });
                    },
                },
                {
                    name: 'gameAssets-bundle',
                    delaySeconds: 0.04,
                    releaseMiniGame: 'skip',
                    run: () => {
                        this._withGameAssetsBundle?.(() => {});
                    },
                },
                {
                    name: 'rewarded-ad',
                    delaySeconds: 0.08,
                    run: () => {
                        this.scheduleRewardedAdPreload?.(`post-playable-warmup:${reason}`, 0);
                    },
                },
                {
                    name: 'settings-panel',
                    delaySeconds: 0.16,
                    releaseMiniGame: 'skip',
                    run: () => {
                        this.preloadSettingsPanel?.();
                    },
                },
                {
                    name: 'acquire-resource-panel',
                    delaySeconds: 0.22,
                    releaseMiniGame: 'skip',
                    run: () => {
                        this.preloadAcquireResourcePanel?.();
                    },
                },
                {
                    name: 'home-scene',
                    delaySeconds: 0.32,
                    releaseMiniGame: 'skip',
                    run: () => {
                        AppRoot.tryGet()?.router.preloadHomeScene(`post-playable-warmup:${reason}`).catch((error: unknown) => {
                            runtimeWarn('[PostPlayableWarmup] Home.scene preload failed:', error);
                        });
                    },
                },
                {
                    name: 'skin-panel',
                    delaySeconds: 0.5,
                    releaseMiniGame: 'skip',
                    run: () => {
                        this.preloadBackgroundSkinPanel?.();
                    },
                },
                {
                    name: 'freeze-spine',
                    delaySeconds: 0.7,
                    releaseMiniGame: 'skip',
                    run: () => {
                        this.ensureFreezeSpineFxSkeletonData?.(() => {});
                    },
                },
                {
                    name: 'pindd-spine',
                    delaySeconds: 0.8,
                    releaseMiniGame: 'skip',
                    run: () => {
                        this.ensurePinddSpineFxSkeletonData?.(() => {});
                    },
                },
            ];

            const conservativeRelease = shouldUseConservativePostPlayableWarmup();
            for (const task of tasks) {
                const policyTask = normalizeWarmupTaskForPolicy(task, conservativeRelease);
                if (!policyTask) continue;
                runWarmupTask(this, seq, initSeq, policyTask);
            }
        },
    });
}
