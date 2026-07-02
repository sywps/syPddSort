import {
    AnalyticsMgr,
    AudioMgr,
    BoardModel,
    LS_PINCH_GUIDE,
    SLOTS_PER_ROW,
    SlotModel,
    SySDKMgr,
    sys,
} from './GameCtrlShared';
import type { LevelData } from './GameCtrlShared';
import { AppRoot } from './AppRoot';
import { LevelDataCdnService } from './LevelDataCdnService';
import { resolveSlotOnboardingTimeLimit, resolveSlotRowPolicy } from './SlotOnboardingPolicy';
import type { SlotRowPolicy } from './SlotOnboardingPolicy';
import { flushStartupTrace, markStartupTrace } from './StartupTrace';

export class GameplaySessionController {
    constructor(private readonly runtime: any) {}

    initGame(data: LevelData, activeLevelId?: number) {
        const runtime = this.runtime;
        try {
            runtime._gameplayInitSeq = (Number(runtime._gameplayInitSeq) || 0) + 1;
            runtime._gameplayResultPanelPrefabLoadSeq = (Number(runtime._gameplayResultPanelPrefabLoadSeq) || 0) + 1;
            runtime._gameplayResultPanelPrefabLoadCallbacks = null;
            this.clearTutorialRuntimeState(runtime);
            AudioMgr.inst.init(runtime.node);
            const bootstrapOnlyGameplayStartup = !!runtime._bootstrapOnlyGameplayStartup;
            if (!bootstrapOnlyGameplayStartup) {
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
            const useMainlineSlotGuideFlow = gameplayEntryMode === 'main'
                && gameplayPrefix === 'level_';
            AppRoot.tryGet()?.markGameActive(resolvedLevelId, gameplayPrefix, gameplayEntryMode, 'Game');
            runtime._activePhysicalLevelId = resolvedLevelId;
            runtime._activeLogicalLevelId = resolvedLevelId;
            runtime._activeGameplayEntryMode = gameplayEntryMode;
            const activeLogicalLevelId = gameplayEntryMode === 'main'
                ? runtime.getActiveLogicalLevelId()
                : resolvedLevelId;
            runtime._firstFunnelTouchSent = false;
            runtime._firstLevelAnyTouchSent = false;
            runtime._firstFunnelSelectSent = false;
            runtime._firstFunnelPlaceAttemptSent = false;
            runtime._firstFunnelPlaceSuccessSent = false;
            runtime._firstLevelLastTouchAt = 0;
            runtime._firstLevelLastTouchIntervalMs = 0;
            runtime._firstLevelGuideStepShowAt = {};
            runtime._firstLevelGuideStepReadyAt = {};
            runtime._firstLevelGuideStepFirstTouchSent = {};
            runtime._firstLevelGuideLayerTouchCounts = {};
            runtime.boardModel = new BoardModel(data);
            const maxSlotRows = runtime.getMaxSlotRows();
            let slotPolicy = resolveSlotRowPolicy({
                levelId: activeLogicalLevelId,
                entryMode: gameplayEntryMode,
                maxRows: maxSlotRows,
                configuredUnlockedRows: (data as any).initialSlotUnlockedRows,
                configuredSlotPolicy: data.slotPolicy,
            });
            slotPolicy = this.applyLevelExperimentGuideSlotPolicy(
                slotPolicy,
                activeLogicalLevelId,
                gameplayEntryMode,
                maxSlotRows,
            );
            runtime._activeSlotRowPolicy = slotPolicy;
            runtime.slotUnlockedRows = slotPolicy.unlockedRows;
            runtime.slotRowCount = slotPolicy.rowCount;
            runtime.initialSlotRowCount = runtime.slotRowCount;
            runtime.slotModel = new SlotModel(SLOTS_PER_ROW * runtime.slotRowCount);
            runtime.slotModel.unlockedCount = SLOTS_PER_ROW * runtime.slotUnlockedRows;
            const resolvedTimeLimit = resolveSlotOnboardingTimeLimit({
                levelId: activeLogicalLevelId,
                entryMode: gameplayEntryMode,
                configuredTimeLimit: data.timeLimit,
            });
            const resolvedDynamicTimeLimit = typeof runtime.resolveDynamicCountdownTimeLimit === 'function'
                ? runtime.resolveDynamicCountdownTimeLimit({
                    levelId: activeLogicalLevelId,
                    entryMode: gameplayEntryMode,
                    baseTimeLimit: resolvedTimeLimit,
                })
                : resolvedTimeLimit;
            const dynamicTimeLimit = gameplayEntryMode === 'main' && activeLogicalLevelId === 1 ? 0 : resolvedDynamicTimeLimit;
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
            runtime._freezeTimeLeft = 0;
            runtime._freezeTimeTotal = 0;
            runtime._adTimerSuspended = false;
            runtime._pendingWinGoldReward = 0;
            runtime._pendingWinAdBonusReward = 0;
            runtime._winAdRewardClaimed = false;
            runtime._settlementNextTransitioning = false;
            runtime._completedColors = new Set();
            runtime._pendingColorCompleteEffects = new Map();
            runtime._patternCompleteWinPending = false;
            runtime.clearPatternCompleteMatchFx?.();
            runtime.clearFreezeSpineFx?.();
            runtime._guidePulseTweens = [];
            runtime._pulseTweens = [];
            runtime.stopPulseTweens();
            runtime.clearDragNodes();
            runtime.clearForcedSkillHiddenState();
            runtime.clearSelectionOverlay();
            runtime.clearIdleHint();
            runtime.clearEndgameHints(true);
            runtime.unscheduleAllCallbacks();
            runtime.clearPlacementVisualState?.();
            runtime.detachGameplayInputHandlers();

            runtime.buildUI();
            runtime.renderBoard();
            runtime.renderSlots();
            runtime.resetAdRewardHintState?.(dynamicTimeLimit);
            runtime.assertGameplayVisualReadiness();
            runtime.hideLoadingOverlayAfterGameplayReady?.();
            AudioMgr.inst.playGameBgm();
            const urlLevel = typeof runtime.getUrlLevel === 'function' ? runtime.getUrlLevel() : 0;
            if (gameplayEntryMode === 'main' && urlLevel <= 0 && typeof runtime.recordMainlineLevelEntry === 'function') {
                runtime.recordMainlineLevelEntry(activeLogicalLevelId);
            }
            this.clearGameplayReadyRouteCover();
            runtime.refreshEndgameHints('init-game');
            const startupTracePhysicalLevel = runtime.getActivePhysicalLevelId();
            const startupTraceLogicalLevel = runtime.getActiveLogicalLevelId();
            if (runtime.isFirstLevelFunnelActive()) {
                AnalyticsMgr.inst.markFirstLevelReady({
                    page: runtime.getAnalyticsPage(),
                    levelId: startupTraceLogicalLevel,
                    logicalLevelId: startupTraceLogicalLevel,
                    physicalLevelId: startupTracePhysicalLevel,
                    source: runtime.shouldUseLocalBootstrapBundle(startupTracePhysicalLevel) ? 'bootstrap' : 'remote',
                });
            }
            markStartupTrace('startup_first_playable_ready', {
                levelId: startupTraceLogicalLevel,
                physicalLevelId: startupTracePhysicalLevel,
                entryMode: gameplayEntryMode,
            });
            flushStartupTrace((event) => AnalyticsMgr.inst.trackFunnelEvent(event), {
                levelId: startupTraceLogicalLevel,
                logicalLevelId: startupTraceLogicalLevel,
                physicalLevelId: startupTracePhysicalLevel,
            });
            AnalyticsMgr.inst.flushFunnelEvents();
            runtime.onGameplayUiReadyForStartupServices?.();
            runtime.startPostPlayableWarmup?.('gameplay-ready');

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
            const levelExperimentContext = LevelDataCdnService.inst.getLevelExperimentEventContext(
                activeLogicalLevelId,
                gameplayPrefix,
            );
            AnalyticsMgr.inst.beginLevel(analyticsLevelId, runtime.getAnalyticsPage(), {
                ...(levelExperimentContext || AnalyticsMgr.inst.getTutorialExperimentEventContext()),
                logicalLevelId: analyticsLevelId,
                physicalLevelId: analyticsPhysicalLevelId,
            });
            SySDKMgr.inst.reportLevelEnter(analyticsLevelId);
            const tutorialGateLevelId = gameplayEntryMode === 'main' ? activeLogicalLevelId : 0;
            if (gameplayEntryMode === 'main' && !runtime.isExternalLevelPreviewActive()) {
                const tutorialMode = tutorialGateLevelId === 1
                    ? 'level_1'
                    : (tutorialGateLevelId === 3 && useMainlineSlotGuideFlow
                        ? 'level_exp_slot_intro'
                        : 'none');
                if (tutorialMode !== 'none') {
                    SySDKMgr.inst.reportTutorialStart();
                    runtime.startTutorial(tutorialMode);
                } else if (slotPolicy.showSlotUnlockGuide) {
                    runtime.hideTutorialSkipGuidePrompt?.();
                    runtime.scheduleOnce(() => runtime.showExpandSlotGuide(), 0.15);
                } else {
                    runtime.hideTutorialSkipGuidePrompt?.();
                }
                if (tutorialMode === 'none' && tutorialGateLevelId === 3 && (runtime.getUrlForceGuide() || sys.localStorage.getItem(LS_PINCH_GUIDE) !== '1')) {
                    runtime.startPinchGuide();
                }
            }
        } catch (error) {
            AppRoot.tryGet()?.clearRouteCover('gameplay-init-error');
            throw error;
        }
    }

    private clearGameplayReadyRouteCover(): void {
        const appRoot = AppRoot.tryGet();
        if (!appRoot) return;
        appRoot.clearRouteCover('gameplay-ready');
    }

    private applyLevelExperimentGuideSlotPolicy(
        policy: SlotRowPolicy,
        levelId: number,
        entryMode: string,
        maxRows: number,
    ): SlotRowPolicy {
        if (entryMode !== 'main') return policy;
        if (levelId === 2) {
            return {
                ...policy,
                showSlotUnlockGuide: false,
            };
        }
        if (levelId !== 3) return policy;

        const defaultRows = Math.min(Math.max(2, policy.defaultRows), maxRows);
        const rowCount = Math.min(maxRows, Math.max(defaultRows + 1, policy.rowCount));
        if (rowCount <= defaultRows) {
            return policy;
        }
        return {
            ...policy,
            defaultRows,
            freeUnlockRows: 1,
            adUnlockRows: 0,
            freeUnlockUntilRows: defaultRows + 1,
            unlockedRows: defaultRows,
            rowCount,
            appendLockedRowAfterUnlock: false,
            unlockMode: 'free',
            showSkillArea: true,
            showSlotUnlockGuide: false,
        };
    }

    private clearTutorialRuntimeState(runtime: any): void {
        if (runtime._guideLayer?.isValid && typeof runtime.clearGuideHighlight === 'function') {
            runtime.clearGuideHighlight();
        }
        if (runtime._guideBubble?.isValid) {
            runtime._guideBubble.active = false;
        }
        if (runtime._guideLayer?.isValid) {
            runtime._guideLayer.destroy();
        }
        if (Array.isArray(runtime._guidePulseTweens)) {
            for (const tween of runtime._guidePulseTweens) {
                tween?.stop?.();
            }
            runtime._guidePulseTweens.length = 0;
        } else {
            runtime._guidePulseTweens = [];
        }
        runtime._guideLayer = null;
        runtime._guideMask = null;
        runtime._guideHand = null;
        runtime._guideBubble = null;
        runtime._guideBubbleLbl = null;
        runtime._guidePromptDefaultLabelColor = null;
        runtime._guidePromptDefaultCenterY = null;
        runtime.hideTutorialSkipGuidePrompt?.();
        runtime._tutorialSkipGuidePromptShownTracked = false;
        runtime._guideHighlightCells = [];
        runtime._guideInputSuspended = false;
        runtime._guideStep = -1;
        runtime._guideMode = 'none';
        runtime._guideTotalSteps = 0;
        runtime._guidePhase = 'select';
        runtime._lastGuideVoiceToken = '';
    }

}

export function ensureGameplaySessionController(runtime: any): GameplaySessionController {
    if (!runtime._gameplaySessionController) {
        runtime._gameplaySessionController = new GameplaySessionController(runtime);
    }
    return runtime._gameplaySessionController as GameplaySessionController;
}
