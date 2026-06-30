import { AudioMgr } from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';
import { runtimeWarn } from '../RuntimeLog';

type WarmupTask = {
    name: string;
    delaySeconds: number;
    run: () => void;
};

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
                    run: () => {
                        this.preloadSettingsPanel?.();
                    },
                },
                {
                    name: 'acquire-resource-panel',
                    delaySeconds: 0.22,
                    run: () => {
                        this.preloadAcquireResourcePanel?.();
                    },
                },
                {
                    name: 'home-scene',
                    delaySeconds: 0.32,
                    run: () => {
                        AppRoot.tryGet()?.router.preloadHomeScene(`post-playable-warmup:${reason}`).catch((error: unknown) => {
                            runtimeWarn('[PostPlayableWarmup] Home.scene preload failed:', error);
                        });
                    },
                },
                {
                    name: 'skin-panel',
                    delaySeconds: 0.5,
                    run: () => {
                        this.preloadBackgroundSkinPanel?.();
                    },
                },
                {
                    name: 'freeze-spine',
                    delaySeconds: 0.7,
                    run: () => {
                        this.ensureFreezeSpineFxSkeletonData?.(() => {});
                    },
                },
                {
                    name: 'pindd-spine',
                    delaySeconds: 0.8,
                    run: () => {
                        this.ensurePinddSpineFxSkeletonData?.(() => {});
                    },
                },
            ];

            for (const task of tasks) {
                runWarmupTask(this, seq, initSeq, task);
            }
        },
    });
}
