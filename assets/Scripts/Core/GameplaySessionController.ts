import {
    AnalyticsMgr,
    AudioMgr,
    BoardModel,
    SLOTS_PER_ROW,
    SlotModel,
    SySDKMgr,
} from './GameCtrlShared';
import type { LevelData, TutorialMode } from './GameCtrlShared';
import { AppRoot } from './AppRoot';
import { collectActiveBlockInputEvents } from './DebugPerfTrace';
import { getFrontLevelExperimentAnalyticsContext } from './LevelExperimentService';
import { resolveSlotOnboardingTimeLimit, resolveSlotRowPolicy } from './SlotOnboardingPolicy';
import { flushStartupTrace, markStartupTrace } from './StartupTrace';

export class GameplaySessionController {
    constructor(private readonly runtime: any) {}

    initGame(data: LevelData, activeLevelId?: number) {
        const runtime = this.runtime;
        try {
            runtime.cancelRewardedGrantInteraction?.('gameplay-init');
            runtime._gameplayInitSeq = (Number(runtime._gameplayInitSeq) || 0) + 1;
            runtime.resetFirstLevelReleaseDiagnostics?.();
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
            AppRoot.tryGet()?.markGameActive(resolvedLevelId, gameplayPrefix, gameplayEntryMode, 'Game');
            runtime._activePhysicalLevelId = resolvedLevelId;
            runtime._activeLogicalLevelId = resolvedLevelId;
            runtime._activeGameplayEntryMode = gameplayEntryMode;
            const activeLogicalLevelId = gameplayEntryMode === 'main'
                ? runtime.getActiveLogicalLevelId()
                : resolvedLevelId;
            const tutorialMode = gameplayEntryMode === 'main' && !runtime.isExternalLevelPreviewActive()
                ? this.resolveTutorialMode(data)
                : 'none';
            if (gameplayEntryMode === 'main' && activeLogicalLevelId === 1) {
                runtime.beginFirstLevelReleaseDiagnostics?.();
            }
            runtime._activeGameplayGuideLayoutMode = tutorialMode;
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
            runtime._interactionTouchAttemptCount = 0;
            runtime.boardModel = new BoardModel(data);
            const maxSlotRows = runtime.getMaxSlotRows();
            const slotPolicy = resolveSlotRowPolicy({
                levelId: activeLogicalLevelId,
                entryMode: gameplayEntryMode,
                maxRows: maxSlotRows,
                configuredSlotPolicy: data.slotPolicy,
            });
            runtime._activeSlotRowPolicy = slotPolicy;
            runtime.slotUnlockedRows = slotPolicy.unlockedRows;
            const initialVisibleSlotRows = Math.min(
                slotPolicy.rowCount,
                Math.max(1, slotPolicy.unlockedRows) + (slotPolicy.unlockedRows < slotPolicy.rowCount ? 1 : 0),
            );
            runtime.slotRowCount = initialVisibleSlotRows;
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
            runtime._settlementRevealState = 'idle';
            runtime._settlementRevealToken = (Number(runtime._settlementRevealToken) || 0) + 1;
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

            runtime.reportFirstLevelReleaseState?.('before_ui_build');
            runtime.buildUI();
            runtime.renderBoard();
            runtime.renderSlots();
            runtime.resetAdRewardHintState?.(dynamicTimeLimit);
            runtime.assertGameplayVisualReadiness();
            runtime.reportFirstLevelReleaseState?.('before_loading_hide');
            runtime.hideLoadingOverlayAfterGameplayReady?.();
            runtime.reportFirstLevelReleaseState?.('after_loading_hide');
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
                runtime.reportFirstLevelReleaseState?.('ui_ready_emitted');
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
            const experimentAnalyticsContext = gameplayEntryMode === 'main'
                ? getFrontLevelExperimentAnalyticsContext(analyticsLevelId, 'level_')
                : null;
            AnalyticsMgr.inst.beginLevel(analyticsLevelId, runtime.getAnalyticsPage(), {
                logicalLevelId: analyticsLevelId,
                physicalLevelId: analyticsPhysicalLevelId,
                abId: experimentAnalyticsContext?.abId,
                abBucket: experimentAnalyticsContext?.abBucket,
            });
            SySDKMgr.inst.reportLevelEnter(analyticsLevelId);
            if (gameplayEntryMode === 'main' && !runtime.isExternalLevelPreviewActive()) {
                if (tutorialMode !== 'none') {
                    SySDKMgr.inst.reportTutorialStart();
                    runtime.reportFirstLevelReleaseState?.('before_tutorial');
                    runtime.startTutorial(tutorialMode);
                    runtime.reportFirstLevelReleaseState?.('after_tutorial');
                } else if (slotPolicy.showSlotUnlockGuide) {
                    runtime.scheduleOnce(() => runtime.showExpandSlotGuide(), 0.15);
                } else if (activeLogicalLevelId === 1) {
                    runtime.reportFirstLevelReleaseState?.('tutorial_missing');
                }
            }
            this.reportLevelInteractionReady(
                runtime,
                analyticsLevelId,
                analyticsPhysicalLevelId,
                gameplayEntryMode,
                tutorialMode,
            );
            runtime.reportFirstLevelReleaseState?.('interaction_ready_emitted');
            runtime.scheduleFirstLevelReleaseDiagnostics?.();
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

    private resolveTutorialMode(data?: LevelData): TutorialMode {
        switch (this.getLevelTutorialGuideMode(data)) {
            case 'level_1_red_blue': return 'level_1';
            case 'slot_expand_all': return 'level_2';
            case 'zoom': return 'zoom';
            default: return 'none';
        }
    }

    private getLevelTutorialGuideMode(data?: LevelData): string {
        const mode = data?.tutorialGuide?.mode;
        return typeof mode === 'string' ? mode : '';
    }

    private reportLevelInteractionReady(
        runtime: any,
        logicalLevelId: number,
        physicalLevelId: number,
        entryMode: string,
        tutorialMode: TutorialMode,
    ): void {
        if (entryMode !== 'main' || logicalLevelId < 1 || logicalLevelId > 3) return;
        const blockers = collectActiveBlockInputEvents();
        const expectedGuideBlocker = tutorialMode === 'level_1' || tutorialMode === 'level_2';
        const unexpectedBlockers = blockers.filter((entry) => {
            const path = String(entry.path || '');
            return !(expectedGuideBlocker && path.includes('/GuideLayer'));
        });
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName: 'level_interaction_ready',
            page: runtime.getAnalyticsPage(),
            levelId: logicalLevelId,
            logicalLevelId,
            physicalLevelId,
            source: 'gameplay_session',
            success: unexpectedBlockers.length === 0 && (Number(runtime._modalFocusRefs) || 0) === 0,
            errorCode: unexpectedBlockers.length > 0 ? 'unexpected_input_blocker' : '',
            extra: {
                tutorialMode,
                guideMode: runtime._guideMode || 'none',
                guideStep: Math.max(-1, Math.floor(Number(runtime._guideStep) || 0)),
                guidePhase: runtime._guidePhase || '',
                modalFocusRefs: Math.max(0, Number(runtime._modalFocusRefs) || 0),
                activeTouchCount: Math.max(0, Number(runtime.activeBoardTouches?.size) || 0),
                gestureMode: runtime.gestureMode || 'idle',
                slotUnlockedRows: Math.max(0, Number(runtime.slotUnlockedRows) || 0),
                slotRowCount: Math.max(0, Number(runtime.slotRowCount) || 0),
                dataVersion: runtime.getRuntimeRemoteHash?.() || '',
                activeBlockers: blockers.map((entry) => String(entry.path || '')).join('|'),
                unexpectedBlockers: unexpectedBlockers.map((entry) => String(entry.path || '')).join('|'),
            },
        });
    }

    private clearTutorialRuntimeState(runtime: any): void {
        runtime.clearGuideReminderTimer?.();
        runtime.hideGuideReminderVisuals?.();
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
        runtime._guideHandsRoot = null;
        runtime._guidePinchLeftHand = null;
        runtime._guidePinchRightHand = null;
        runtime._guideBubble = null;
        runtime._guideBubbleLbl = null;
        runtime._guidePromptDefaultLabelColor = null;
        runtime._guidePromptDefaultCenterY = null;
        runtime._guideHighlightCells = [];
        runtime._guideInputSuspended = false;
        runtime._guideStep = -1;
        runtime._guideMode = 'none';
        runtime._activeGameplayGuideLayoutMode = 'none';
        runtime._guideTotalSteps = 0;
        runtime._guidePhase = 'select';
        runtime._guideStatus = 'idle';
        runtime._guideReminderPausedForLifecycle = false;
        runtime._smartIdleHintTimerHandler = null;
        runtime._smartIdleHintToken = (Number(runtime._smartIdleHintToken) || 0) + 1;
        runtime._smartIdleHintActive = false;
        runtime._smartIdleHintPlan = null;
        runtime._guideZoomStartScale = 1;
        runtime._guideZoomLastScale = 1;
        runtime._guideZoomAccumulatedScaleDelta = 0;
        runtime._guideZoomLastSource = '';
        runtime._interactionTouchAttemptCount = 0;
        runtime._lastGuideVoiceToken = '';
    }

}

export function ensureGameplaySessionController(runtime: any): GameplaySessionController {
    if (!runtime._gameplaySessionController) {
        runtime._gameplaySessionController = new GameplaySessionController(runtime);
    }
    return runtime._gameplaySessionController as GameplaySessionController;
}
