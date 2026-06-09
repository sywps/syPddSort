import {
    AnalyticsMgr,
    AudioMgr,
    BlockInputEvents,
    Bundle,
    Label,
    Node,
    POPUP_UI_TEXTURE_NAMES,
    Prefab,
    ProgressBar,
    UIOpacity,
    instantiate,
} from './GameCtrlShared';

const RESULT_PANEL_PREFAB_PATHS = {
    win: 'UI/Prefabs/Panels/WinPanel',
    revive: 'UI/Prefabs/Panels/RevivePanel',
    lose: 'UI/Prefabs/Panels/LosePanel',
} as const;

type ResultPanelKind = keyof typeof RESULT_PANEL_PREFAB_PATHS;
const RESULT_PANEL_KINDS: ResultPanelKind[] = ['win', 'revive', 'lose'];

export class GameplayResultPanelController {
    constructor(private readonly runtime: any) {}

    hasPrefabsReady() {
        return RESULT_PANEL_KINDS.every((kind) => !!this.runtime._gameplayResultPanelPrefabCache.get(kind));
    }

    ensurePrefabsReady(onDone: () => void) {
        const runtime = this.runtime;
        if (this.hasPrefabsReady()) {
            onDone();
            return;
        }
        if (runtime._gameplayResultPanelPrefabLoadCallbacks) {
            runtime._gameplayResultPanelPrefabLoadCallbacks.push(onDone);
            return;
        }
        runtime._gameplayResultPanelPrefabLoadCallbacks = [onDone];
        const loadPrefabs = () => {
            runtime._withGameAssetsBundle((bundle: Bundle | null) => {
                if (!bundle) {
                    runtime._gameplayResultPanelPrefabLoadCallbacks = null;
                    throw new Error('[result-panel] failed to load gameAssets bundle');
                }
                const missingKinds = RESULT_PANEL_KINDS.filter((kind) => !runtime._gameplayResultPanelPrefabCache.get(kind));
                let remaining = missingKinds.length;
                let failed = false;
                const flushCallbacks = () => {
                    const callbacks = runtime._gameplayResultPanelPrefabLoadCallbacks || [];
                    runtime._gameplayResultPanelPrefabLoadCallbacks = null;
                    for (const callback of callbacks) {
                        callback();
                    }
                };
                if (remaining === 0) {
                    flushCallbacks();
                    return;
                }
                for (const kind of missingKinds) {
                    bundle.load(RESULT_PANEL_PREFAB_PATHS[kind], Prefab, (err: Error | null, prefab: Prefab | null) => {
                        if (failed) return;
                        if (err || !prefab) {
                            failed = true;
                            runtime._gameplayResultPanelPrefabLoadCallbacks = null;
                            throw new Error(`[result-panel] failed to load remote prefab "${kind}" from ${RESULT_PANEL_PREFAB_PATHS[kind]}: ${err?.message || 'missing prefab'}`);
                        }
                        runtime._gameplayResultPanelPrefabCache.set(kind, prefab);
                        remaining -= 1;
                        if (remaining === 0) {
                            flushCallbacks();
                        }
                    });
                }
            });
        };
        runtime._ensureSpriteFramesByName(POPUP_UI_TEXTURE_NAMES, loadPrefabs);
    }

    instantiateGameplayOverlay(kind: ResultPanelKind, name: string): Node {
        const runtime = this.runtime;
        const prefab = runtime._gameplayResultPanelPrefabCache.get(kind) as Prefab | null;
        if (!prefab) {
            throw new Error(`[result-panel] prefab "${kind}" is not ready`);
        }
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        popupRoot.getChildByName(name)?.destroy();
        const overlay = instantiate(prefab);
        overlay.name = name;
        popupRoot.addChild(overlay);
        overlay.setSiblingIndex(999);
        overlay.active = false;
        if (!overlay.getComponent(BlockInputEvents)) {
            overlay.addComponent(BlockInputEvents);
        }
        return overlay;
    }

    private syncResultProgressWidget(panel: Node, ratio: number = 0): void {
        const runtime = this.runtime;
        const progressRoot = runtime.requirePanelChild(runtime.requirePanelChild(panel, 'Box'), '\u8fdb\u5ea6\u6761');
        const progressArea = runtime.requirePanelChild(progressRoot, 'ProgressBarArea');
        const progressLabel = progressRoot.getChildByName('Label')?.getComponent(Label);
        if (progressLabel) {
            progressLabel.string = '\u5df2\u5b8c\u6210 0%';
        }
        const progressBar = progressArea.getComponent(ProgressBar);
        if (!progressBar) {
            throw new Error('[result-panel] ProgressBarArea is missing cc.ProgressBar');
        }
        if (!progressBar.barSprite) {
            throw new Error('[result-panel] cc.ProgressBar is missing barSprite');
        }
        progressBar.progress = Math.max(0, Math.min(1, Number(ratio) || 0));
    }

    createWinSettlementPanel(): Node {
        const runtime = this.runtime;
        const overlay = this.instantiateGameplayOverlay('win', 'WinSettlementOverlay');
        const box = runtime.requirePanelChild(overlay, 'Box');
        if (!box.getComponent(BlockInputEvents)) {
            box.addComponent(BlockInputEvents);
        }
        const previewFrame = runtime.requirePanelChild(box, 'PreviewFrame');
        runtime.requirePanelChild(previewFrame, 'PatternPreview');
        const adBonusBtn = runtime.requirePanelChild(box, 'AdBonusBtn');
        adBonusBtn.getComponent(UIOpacity) || adBonusBtn.addComponent(UIOpacity);
        runtime.bindPanelButton(adBonusBtn, () => {
            AudioMgr.inst.play('button');
            runtime.claimWinAdBonusReward();
        });
        runtime.bindPanelButton(runtime.requirePanelChild(box, 'PrimaryBtn'), () => {
            AudioMgr.inst.play('button');
            runtime.handleWinSettlementPrimaryAction();
        });
        return overlay;
    }

    createReviveSettlementPanel(): Node {
        const runtime = this.runtime;
        const overlay = this.instantiateGameplayOverlay('revive', 'ReviveSettlementOverlay');
        const box = runtime.requirePanelChild(overlay, 'Box');
        if (!box.getComponent(BlockInputEvents)) {
            box.addComponent(BlockInputEvents);
        }
        this.syncResultProgressWidget(overlay, 0);
        const continueBtn = box.getChildByName('ContinueBtn');
        if (!continueBtn) {
            throw new Error('[result-panel] RevivePanel is missing ContinueBtn');
        }
        const rewardedSeconds = runtime.constructor.REWARDED_CONTINUE_SECONDS;
        const giveUp = () => {
            overlay.active = false;
            runtime.showLosePanel();
        };
        this.bindReviveContinueAction(continueBtn, overlay, rewardedSeconds);
        const giveUpNodes = [box.getChildByName('GiveUpBtn'), box.getChildByName('CloseBtn')].filter((node): node is Node => !!node);
        if (!giveUpNodes.length) {
            throw new Error('[result-panel] RevivePanel is missing any close/give-up action node');
        }
        for (const node of giveUpNodes) {
            runtime.bindPanelButton(node, () => {
                AudioMgr.inst.play('button');
                giveUp();
            });
        }
        return overlay;
    }

    bindReviveContinueAction(triggerNode: Node, overlay: Node, rewardedSeconds?: number) {
        const runtime = this.runtime;
        const continueSeconds = rewardedSeconds ?? runtime.constructor.REWARDED_CONTINUE_SECONDS;
        runtime.bindPanelButton(triggerNode, () => {
            if (runtime._adShowing) return;
            AudioMgr.inst.play('button');
            runtime._adShowing = true;
            runtime.showTrackedRewardedAd('level_revive', (success: boolean) => {
                runtime._adShowing = false;
                if (!success) return;
                overlay.active = false;
                AudioMgr.inst.play('revivePop');
                runtime.continueAfterLose(continueSeconds);
            }, { markLevelRevive: true });
        });
    }

    createLoseSettlementPanel(): Node {
        const runtime = this.runtime;
        const overlay = this.instantiateGameplayOverlay('lose', 'LoseSettlementOverlay');
        const box = runtime.requirePanelChild(overlay, 'Box');
        if (!box.getComponent(BlockInputEvents)) {
            box.addComponent(BlockInputEvents);
        }
        this.syncResultProgressWidget(overlay, 0);
        const reviveBtn = runtime.requirePanelChild(box, '\u590d\u6d3b\u7a97\u7ec4\u4ef63');
        const homeBtn = runtime.requirePanelChild(box, '\u7eff\u8272\u6309\u952e\u5e95\u6846');
        const replayBtn = runtime.requirePanelChild(box, '\u7eff\u8272\u6309\u952e\u5e95\u6846-001');
        this.bindReviveContinueAction(reviveBtn, overlay);
        runtime.bindPanelButton(homeBtn, () => {
            AudioMgr.inst.play('button');
            AnalyticsMgr.inst.finalizePendingFailedLevel();
            overlay.active = false;
            runtime.showMainMenu();
        });
        runtime.bindPanelButton(replayBtn, () => {
            AudioMgr.inst.play('button');
            overlay.active = false;
            runtime.restart();
        });
        return overlay;
    }
}

export function ensureGameplayResultPanelController(runtime: any): GameplayResultPanelController {
    if (!runtime._gameplayResultPanelController) {
        runtime._gameplayResultPanelController = new GameplayResultPanelController(runtime);
    }
    return runtime._gameplayResultPanelController as GameplayResultPanelController;
}
