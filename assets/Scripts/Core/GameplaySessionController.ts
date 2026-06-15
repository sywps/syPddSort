import {
    AnalyticsMgr,
    AudioMgr,
    BoardModel,
    FIRST_LEVEL_ROUTE_EXPERIMENT_ID,
    LS_PINCH_GUIDE,
    SLOTS_PER_ROW,
    SlotModel,
    SySDKMgr,
    sys,
} from './GameCtrlShared';
import type { LevelData } from './GameCtrlShared';
import { AppRoot } from './AppRoot';
import { resolveSlotOnboardingTimeLimit, resolveSlotRowPolicy } from './SlotOnboardingPolicy';

export class GameplaySessionController {
    constructor(private readonly runtime: any) {}

    initGame(data: LevelData, activeLevelId?: number) {
        const runtime = this.runtime;
        try {
            runtime._gameplayInitSeq = (Number(runtime._gameplayInitSeq) || 0) + 1;
            runtime._gameplayResultPanelPrefabLoadSeq = (Number(runtime._gameplayResultPanelPrefabLoadSeq) || 0) + 1;
            runtime._gameplayResultPanelPrefabLoadCallbacks = null;
            AudioMgr.inst.init(runtime.node);
            if (!runtime._bootstrapOnlyGameplayStartup) {
                AudioMgr.inst.preload('place');
                AudioMgr.inst.playGameBgm();
            }
            runtime.levelData = data;
            const resolvedLevelId = runtime._isThemeLevel
                ? Math.max(1, Math.floor(Number(runtime._currentThemeLevelId || data.levelId) || 1))
                : Math.max(1, Math.floor(Number(activeLevelId || data.levelId) || 1));
            const gameplayPrefix = runtime._currentExternalLevelFilePath
                ? runtime._currentExternalLevelPrefix
                : (runtime._isThemeLevel ? 'zt_level_' : 'level_');
            const gameplayEntryMode = runtime._currentExternalLevelFilePath
                ? 'external'
                : (runtime._isThemeLevel ? 'theme' : 'main');
            AppRoot.tryGet()?.markGameActive(resolvedLevelId, gameplayPrefix, gameplayEntryMode, 'Game');
            runtime._activePhysicalLevelId = resolvedLevelId;
            runtime._activeLogicalLevelId = resolvedLevelId;
            runtime._activeGameplayEntryMode = gameplayEntryMode;
            runtime._firstFunnelTouchSent = false;
            runtime._firstFunnelSelectSent = false;
            runtime._firstFunnelPlaceAttemptSent = false;
            runtime._firstFunnelPlaceSuccessSent = false;
            runtime.boardModel = new BoardModel(data);
            const maxSlotRows = runtime.getMaxSlotRows();
            const slotPolicy = resolveSlotRowPolicy({
                levelId: resolvedLevelId,
                entryMode: gameplayEntryMode,
                maxRows: maxSlotRows,
                configuredUnlockedRows: (data as any).initialSlotUnlockedRows,
            });
            runtime._activeSlotRowPolicy = slotPolicy;
            runtime.slotUnlockedRows = slotPolicy.unlockedRows;
            runtime.slotRowCount = slotPolicy.rowCount;
            runtime.initialSlotRowCount = runtime.slotRowCount;
            runtime.slotModel = new SlotModel(SLOTS_PER_ROW * runtime.slotRowCount);
            runtime.slotModel.unlockedCount = SLOTS_PER_ROW * runtime.slotUnlockedRows;
            const resolvedTimeLimit = resolveSlotOnboardingTimeLimit({
                levelId: resolvedLevelId,
                entryMode: gameplayEntryMode,
                configuredTimeLimit: data.timeLimit,
            });
            const dynamicTimeLimit = typeof runtime.resolveDynamicCountdownTimeLimit === 'function'
                ? runtime.resolveDynamicCountdownTimeLimit({
                    levelId: resolvedLevelId,
                    entryMode: gameplayEntryMode,
                    baseTimeLimit: resolvedTimeLimit,
                })
                : resolvedTimeLimit;
            runtime._currentLevelUnlimitedTime = dynamicTimeLimit <= 0;
            runtime.timeRemain = dynamicTimeLimit;
            runtime.isGameEnd = false;
            runtime.isSelected = false;
            runtime.currentBlock = null;
            runtime._selectedSlotIndices = [];
            runtime._wandMode = false;
            runtime._wandRectNode = null;
            runtime._wandDragStart = null;
            runtime._skillActive = false;
            runtime._skillAnimOnly = false;
            runtime._timerStarted = false;
            runtime._timerPauseRefs = 0;
            runtime._timerLockedForProp = false;
            runtime._adTimerSuspended = false;
            runtime._pendingWinGoldReward = 0;
            runtime._pendingWinAdBonusReward = 0;
            runtime._winAdRewardClaimed = false;
            runtime._settlementNextTransitioning = false;
            runtime._completedColors = new Set();
            runtime._guidePulseTweens = [];
            runtime._pulseTweens = [];
            runtime.stopPulseTweens();
            runtime.clearDragNodes();
            runtime.clearForcedSkillHiddenState();
            runtime.clearSelectionOverlay();
            runtime.clearIdleHint();
            runtime.clearEndgameHints(true);
            runtime.unscheduleAllCallbacks();
            runtime._flyingTargets.clear();
            runtime.detachGameplayInputHandlers();

            runtime.buildUI();
            runtime.renderBoard();
            runtime.renderSlots();
            runtime.assertGameplayVisualReadiness();
            runtime.hideLoadingOverlayAfterGameplayReady?.();
            const urlLevel = typeof runtime.getUrlLevel === 'function' ? runtime.getUrlLevel() : 0;
            if (gameplayEntryMode === 'main' && urlLevel <= 0 && typeof runtime.recordMainlineLevelEntry === 'function') {
                runtime.recordMainlineLevelEntry(resolvedLevelId);
            }
            this.finishGameplayReadyTransition();
            runtime.refreshEndgameHints('init-game');
            runtime.scheduleRewardedAdPreload?.('gameplay-ready', 0.8);
            if (runtime.isFirstLevelFunnelActive()) {
                const activePhysicalLevel = runtime.getActivePhysicalLevelId();
                const activeLogicalLevel = runtime.getActiveLogicalLevelId();
                AnalyticsMgr.inst.markFirstLevelReady({
                    page: runtime.getAnalyticsPage(),
                    levelId: activeLogicalLevel,
                    logicalLevelId: activeLogicalLevel,
                    physicalLevelId: activePhysicalLevel,
                    source: runtime.shouldUseLocalBootstrapBundle(activePhysicalLevel) ? 'bootstrap' : 'remote',
                });
            }

            if (runtime.needsBeanReRender()) {
                runtime.scheduleOnce(() => {
                    runtime.renderBoard();
                }, 0.5);
            }
            runtime.unschedule(runtime.tickTimer);
            runtime._timerStarted = false;
            runtime._adTimerSuspended = false;

            runtime.resetIdleHintTimer();
            const analyticsLevelId = runtime.getAnalyticsLevelId();
            const analyticsPhysicalLevelId = runtime.getActivePhysicalLevelId();
            AnalyticsMgr.inst.beginLevel(analyticsLevelId, runtime.getAnalyticsPage(), {
                abId: FIRST_LEVEL_ROUTE_EXPERIMENT_ID,
                abBucket: runtime._firstLevelRouteBucket,
                logicalLevelId: analyticsLevelId,
                physicalLevelId: analyticsPhysicalLevelId,
            });
            SySDKMgr.inst.reportLevelEnter(analyticsLevelId);
            if (!runtime.isExternalLevelPreviewActive()) {
                if (resolvedLevelId <= 3) SySDKMgr.inst.reportTutorialStart();
                if (resolvedLevelId === 1) {
                    runtime.startTutorial('level_1');
                } else if (resolvedLevelId === 2) {
                    runtime.startTutorial('level_2');
                } else if (slotPolicy.showSlotUnlockGuide) {
                    runtime.scheduleOnce(() => runtime.showExpandSlotGuide(), 0.15);
                }
                if (resolvedLevelId === 3 && (runtime.getUrlForceGuide() || sys.localStorage.getItem(LS_PINCH_GUIDE) !== '1')) {
                    runtime.startPinchGuide();
                }
            }
        } catch (error) {
            AppRoot.tryGet()?.forceHideSceneTransition('gameplay-init-error');
            throw error;
        }
    }

    private finishGameplayReadyTransition(): void {
        const appRoot = AppRoot.tryGet();
        if (!appRoot) return;
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const clearFallback = () => {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };
        const forceHideOnce = (source: string) => {
            if (settled) return;
            settled = true;
            clearFallback();
            appRoot.forceHideSceneTransition(source);
        };
        timeoutId = setTimeout(() => {
            forceHideOnce('gameplay-ready-timeout');
        }, 1800);
        void appRoot.finishSceneTransition('gameplay-ready').then(() => {
            forceHideOnce('gameplay-ready-complete');
        }).catch((error: unknown) => {
            console.warn('[SceneTransition] finish after gameplay ready failed:', error);
            forceHideOnce('gameplay-ready-fallback');
        });
    }

}

export function ensureGameplaySessionController(runtime: any): GameplaySessionController {
    if (!runtime._gameplaySessionController) {
        runtime._gameplaySessionController = new GameplaySessionController(runtime);
    }
    return runtime._gameplaySessionController as GameplaySessionController;
}
