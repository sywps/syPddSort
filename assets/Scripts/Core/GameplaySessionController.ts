import {
    AnalyticsMgr,
    AudioMgr,
    BoardModel,
    SySDKMgr,
} from './GameCtrlShared';
import type { LevelData, TutorialMode } from './GameCtrlShared';
import { AppRoot } from './AppRoot';
import { collectActiveBlockInputEvents } from './DebugPerfTrace';
import { ensureHardLevelIntroController } from './HardLevelIntroController';
import { validateConveyorCapacity, validateHard } from './LevelConfig';
import { getFrontLevelExperimentAnalyticsContext } from './LevelExperimentService';
import { ensurePchConveyorGameplayController } from './PchConveyorGameplayController';
import { PCH_GAMEPLAY_MODE, PCH_GAMEPLAY_SCHEMA_VERSION } from './AnalyticsMgr';
import { flushStartupTrace, markStartupTrace } from './StartupTrace';

export class GameplaySessionController {
    constructor(private readonly runtime: any) {}

    initGame(data: LevelData, activeLevelId?: number) {
        const runtime = this.runtime;
        let initStage = 'runtime_reset';
        let resolvedLevelId = Math.max(1, Math.floor(Number(activeLevelId || data?.levelId) || 1));
        let activeLogicalLevelId = resolvedLevelId;
        let gameplayPrefix = 'level_';
        let gameplayEntryMode: 'main' | 'theme' | 'external' = 'main';
        let tutorialMode: TutorialMode = 'none';
        try {
            ensureHardLevelIntroController(runtime).stop();
            ensurePchConveyorGameplayController(runtime).stop();
            runtime.cancelRewardedGrantInteraction?.('gameplay-init');
            for (const scope of ['modal', 'timer', 'placement', 'placement-input', 'guide', 'ad']) {
                runtime.clearRuntimeOwners?.(scope);
            }
            runtime._modalFocusRefs = 0;
            runtime._gameplayInitSeq = (Number(runtime._gameplayInitSeq) || 0) + 1;
            runtime.resetFirstLevelReleaseDiagnostics?.();
            runtime._gameplayResultPanelPrefabLoadSeq = (Number(runtime._gameplayResultPanelPrefabLoadSeq) || 0) + 1;
            runtime._gameplayResultPanelPrefabLoadCallbacks = null;
            this.clearTutorialRuntimeState(runtime);
            initStage = 'audio_init';
            AudioMgr.inst.init(runtime.node);
            AudioMgr.inst.preload('button');
            const bootstrapOnlyGameplayStartup = !!runtime._bootstrapOnlyGameplayStartup;
            if (!bootstrapOnlyGameplayStartup) {
                AudioMgr.inst.preload('place');
                AudioMgr.inst.preload('settle');
            }
            runtime.levelData = data;
            initStage = 'route_context';
            resolvedLevelId = runtime._isThemeLevel
                ? Math.max(1, Math.floor(Number(runtime._currentThemeLevelId || data.levelId) || 1))
                : Math.max(1, Math.floor(Number(activeLevelId || data.levelId) || 1));
            gameplayPrefix = runtime._currentExternalLevelFilePath
                ? runtime._currentExternalLevelPrefix
                : (runtime._isThemeLevel ? 'zt_level_' : 'level_');
            gameplayEntryMode = runtime._currentExternalLevelFilePath
                ? 'external'
                : (runtime._isThemeLevel ? 'theme' : 'main');
            AppRoot.tryGet()?.markGameActive(resolvedLevelId, gameplayPrefix, gameplayEntryMode, 'Game');
            runtime._activePhysicalLevelId = resolvedLevelId;
            runtime._activeLogicalLevelId = resolvedLevelId;
            runtime._activeGameplayEntryMode = gameplayEntryMode;
            activeLogicalLevelId = gameplayEntryMode === 'main'
                ? runtime.getActiveLogicalLevelId()
                : resolvedLevelId;
            if (gameplayEntryMode === 'main' && activeLogicalLevelId === 1) {
                runtime.beginFirstLevelReleaseDiagnostics?.();
            }
            runtime._activeGameplayGuideLayoutMode = tutorialMode;
            runtime._firstLevelAnyTouchSent = false;
            runtime._firstLevelLastTouchAt = 0;
            runtime._firstLevelLastTouchIntervalMs = 0;
            runtime._firstLevelGuideStepFirstTouchSent = {};
            runtime._firstLevelGuideLayerTouchCounts = {};
            runtime._interactionTouchAttemptCount = 0;
            initStage = 'hard_level_flag';
            const hard = validateHard(data.Hard, `level ${resolvedLevelId}`);
            initStage = 'conveyor_capacity';
            validateConveyorCapacity(data.conveyorCapacity, `level ${resolvedLevelId}`);
            initStage = 'model_build';
            runtime.boardModel = new BoardModel(data);
            runtime.slotModel = null;
            runtime._activeSlotRowPolicy = null;
            initStage = 'time_policy';
            const resolvedTimeLimit = Math.max(0, Math.floor(Number(data.timeLimit) || 0));
            const resolvedDynamicTimeLimit = typeof runtime.resolveDynamicCountdownTimeLimit === 'function'
                ? runtime.resolveDynamicCountdownTimeLimit({
                    levelId: activeLogicalLevelId,
                    entryMode: gameplayEntryMode,
                    baseTimeLimit: resolvedTimeLimit,
                })
                : resolvedTimeLimit;
            const dynamicTimeLimit = gameplayEntryMode === 'main' && activeLogicalLevelId === 1 ? 0 : resolvedDynamicTimeLimit;
            initStage = 'state_reset';
            runtime._currentLevelUnlimitedTime = dynamicTimeLimit <= 0;
            runtime.timeRemain = dynamicTimeLimit;
            runtime._countdownWarningTickSecondsPlayed = new Set<number>();
            runtime.isGameEnd = false;
            runtime._activeLoseReason = null;
            runtime.isSelected = false;
            runtime.currentBlock = null;
            runtime._selectedSlotIndices = [];
            runtime._wandMode = false;
            runtime._wandRectNode = null;
            runtime._wandDragStart = null;
            runtime.clearSkillUsageWatchdog?.('gameplay-init');
            runtime.resumeSkillTimerPause?.();
            runtime.clearRuntimeOwners?.('timer');
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
            runtime._smartIdleHintShownCount = 0;
            runtime._smartIdleHintEpisodeCycle = 0;
            runtime._smartIdleHintInputActive = false;
            runtime._gameplayInvalidTapFeedbackToken = (Number(runtime._gameplayInvalidTapFeedbackToken) || 0) + 1;
            runtime.clearPatternCompleteMatchFx?.();
            runtime.clearFreezeSpineFx?.();
            initStage = 'runtime_cleanup';
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

            initStage = 'ui_build';
            runtime.reportFirstLevelReleaseState?.('before_ui_build');
            runtime.buildUI();
            initStage = 'board_render';
            runtime.renderBoard();
            runtime.resetAdRewardHintState?.(dynamicTimeLimit);
            initStage = 'pch_core_gameplay';
            const pchController = ensurePchConveyorGameplayController(runtime);
            pchController.start();
            AnalyticsMgr.inst.setLevelContext({
                logicalLevelId: activeLogicalLevelId,
                physicalLevelId: resolvedLevelId,
                gameplayMode: PCH_GAMEPLAY_MODE,
                gameplaySchemaVersion: PCH_GAMEPLAY_SCHEMA_VERSION,
            });
            initStage = 'visual_readiness';
            runtime.assertGameplayVisualReadiness();
            initStage = 'loading_release';
            runtime.reportFirstLevelReleaseState?.('before_loading_hide');
            runtime.hideLoadingOverlayAfterGameplayReady?.();
            const initSeq = Math.max(0, Number(runtime._gameplayInitSeq) || 0);
            let continuationSynchronous = true;
            const continueAfterHardIntro = () => {
                if (initSeq !== Math.max(0, Number(runtime._gameplayInitSeq) || 0) || runtime.isGameEnd) return;
                try {
                    initStage = 'opening_pattern_transition';
                    pchController.playOpeningPatternShuffle();
                    runtime.reportFirstLevelReleaseState?.('after_loading_hide');
                    AudioMgr.inst.playGameBgm();
                    const urlLevel = typeof runtime.getUrlLevel === 'function' ? runtime.getUrlLevel() : 0;
                    if (gameplayEntryMode === 'main' && urlLevel <= 0 && typeof runtime.recordMainlineLevelEntry === 'function') {
                        runtime.recordMainlineLevelEntry(activeLogicalLevelId);
                    }
                    this.clearGameplayReadyRouteCover();
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
                    initStage = 'startup_services';
                    runtime.scheduleRewardedAdPreload?.('gameplay-ready-fallback', 0);
                    runtime.onGameplayUiReadyForStartupServices?.();
                    runtime.startPostPlayableWarmup?.('gameplay-ready');

                    runtime.unschedule(runtime.tickTimer);
                    runtime._timerStarted = false;
                    runtime._adTimerSuspended = false;

                    const analyticsLevelId = runtime.getAnalyticsLevelId();
                    const analyticsPhysicalLevelId = runtime.getActivePhysicalLevelId();
                    initStage = 'level_analytics';
                    const experimentAnalyticsContext = gameplayEntryMode === 'main'
                        ? getFrontLevelExperimentAnalyticsContext(analyticsLevelId, 'level_')
                        : null;
                    AnalyticsMgr.inst.beginLevel(analyticsLevelId, runtime.getAnalyticsPage(), {
                        logicalLevelId: analyticsLevelId,
                        physicalLevelId: analyticsPhysicalLevelId,
                        abId: experimentAnalyticsContext?.abId,
                        abBucket: experimentAnalyticsContext?.abBucket,
                        gameplayMode: PCH_GAMEPLAY_MODE,
                        gameplaySchemaVersion: PCH_GAMEPLAY_SCHEMA_VERSION,
                    }, pchController.getAnalyticsSnapshot());
                    SySDKMgr.inst.reportLevelEnter(analyticsLevelId);
                    initStage = 'interaction_ready';
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
                    if (continuationSynchronous) throw error;
                    this.failGameplayInitialization(runtime, {
                        error,
                        initStage,
                        resolvedLevelId,
                        activeLogicalLevelId,
                        gameplayPrefix,
                        gameplayEntryMode,
                        tutorialMode,
                    });
                    throw error;
                }
            };
            const failHardIntro = (error: Error) => {
                if (initSeq !== Math.max(0, Number(runtime._gameplayInitSeq) || 0)) return;
                initStage = 'hard_level_intro';
                if (continuationSynchronous) throw error;
                this.failGameplayInitialization(runtime, {
                    error,
                    initStage,
                    resolvedLevelId,
                    activeLogicalLevelId,
                    gameplayPrefix,
                    gameplayEntryMode,
                    tutorialMode,
                });
                throw error;
            };
            initStage = 'hard_level_intro';
            ensureHardLevelIntroController(runtime).play(hard, continueAfterHardIntro, failHardIntro);
            continuationSynchronous = false;
        } catch (error) {
            this.failGameplayInitialization(runtime, {
                error,
                initStage,
                resolvedLevelId,
                activeLogicalLevelId,
                gameplayPrefix,
                gameplayEntryMode,
                tutorialMode,
            });
            throw error;
        }
    }

    private clearGameplayReadyRouteCover(): void {
        const appRoot = AppRoot.tryGet();
        if (!appRoot) return;
        appRoot.clearRouteCover('gameplay-ready');
    }

    private failGameplayInitialization(
        runtime: any,
        context: {
            error: unknown;
            initStage: string;
            resolvedLevelId: number;
            activeLogicalLevelId: number;
            gameplayPrefix: string;
            gameplayEntryMode: string;
            tutorialMode: TutorialMode;
        },
    ): void {
        const errorMessage = context.error instanceof Error
            ? context.error.message
            : String(context.error || 'unknown gameplay initialization error');
        const safeStage = String(context.initStage || 'unknown').replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
        const errorCode = `gameplay_init_${safeStage}_failed`;
        const levelId = Math.max(1, Math.floor(Number(context.activeLogicalLevelId || context.resolvedLevelId) || 1));
        const levelPath = runtime._currentExternalLevelFilePath
            || (typeof runtime.getLevelDataPath === 'function'
                ? runtime.getLevelDataPath(context.resolvedLevelId, context.gameplayPrefix)
                : `${context.gameplayPrefix}${context.resolvedLevelId}`);
        const cleanupErrors: string[] = [];
        const runCleanup = (label: string, callback: () => void) => {
            try {
                callback();
            } catch (cleanupError) {
                const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError || 'unknown');
                cleanupErrors.push(`${label}:${message}`.slice(0, 180));
            }
        };

        runtime.isGameEnd = true;
        runCleanup('hard-intro', () => ensureHardLevelIntroController(runtime).stop());
        runCleanup('pch-core', () => ensurePchConveyorGameplayController(runtime).stop());
        runCleanup('tutorial', () => this.clearTutorialRuntimeState(runtime));
        runCleanup('callbacks', () => runtime.unscheduleAllCallbacks?.());
        runCleanup('timer', () => runtime.unschedule?.(runtime.tickTimer));
        runCleanup('input', () => runtime.detachGameplayInputHandlers?.());
        runCleanup('placement', () => runtime.clearPlacementVisualState?.());
        runCleanup('skill-watchdog', () => runtime.clearSkillUsageWatchdog?.('gameplay-init-failed'));
        runCleanup('skill-timer', () => runtime.resumeSkillTimerPause?.());
        runtime._skillActive = false;
        runtime._skillAnimOnly = false;
        runtime._timerStarted = false;
        runtime._adTimerSuspended = false;

        AppRoot.tryGet()?.clearRouteCover('gameplay-init-error');
        runCleanup('gameplay-root', () => runtime.setGameplayStartupRootVisible?.(true));
        runCleanup('loading', () => runtime.hideLoadingOverlay?.());

        const diagnosticExtra = {
            initStage: safeStage,
            initSeq: Math.max(0, Number(runtime._gameplayInitSeq) || 0),
            entryMode: context.gameplayEntryMode,
            tutorialMode: context.tutorialMode,
            logicalLevelId: levelId,
            physicalLevelId: Math.max(1, Math.floor(Number(context.resolvedLevelId) || levelId)),
            dataVersion: runtime.getRuntimeRemoteHash?.() || '',
            cleanupErrors: cleanupErrors.join('|'),
        };
        let fatalSurfaceAttempted = false;
        if (typeof runtime.stopLevelDataLoadWithFatalError === 'function') {
            try {
                fatalSurfaceAttempted = true;
                runtime.stopLevelDataLoadWithFatalError(
                    levelId,
                    levelPath,
                    'gameplay_init_failed',
                    errorCode,
                    errorMessage.slice(0, 500),
                    diagnosticExtra,
                );
            } catch (fatalError) {
                console.error('[GameplayInit] failed to show terminal error surface:', fatalError);
            }
        }
        if (!runtime._remoteLoadErrorOverlay?.isValid && typeof runtime.showRemoteLoadFatalError === 'function') {
            try {
                fatalSurfaceAttempted = true;
                runtime.showRemoteLoadFatalError(levelPath, errorCode, errorMessage.slice(0, 500));
            } catch (fatalError) {
                console.error('[GameplayInit] terminal error surface unavailable:', fatalError);
            }
        }
        if (!fatalSurfaceAttempted) {
            AnalyticsMgr.inst.trackFunnelEvent({
                eventName: 'gameplay_init_failed',
                page: runtime.getAnalyticsPage?.() || 'level_game',
                levelId,
                logicalLevelId: levelId,
                physicalLevelId: diagnosticExtra.physicalLevelId,
                source: 'gameplay_session',
                success: false,
                errorCode,
                errorMessage: errorMessage.slice(0, 500),
                extra: diagnosticExtra,
            });
            AnalyticsMgr.inst.flushFunnelEvents();
        }
        console.error('[GameplayInit] initialization failed:', {
            levelId,
            physicalLevelId: diagnosticExtra.physicalLevelId,
            entryMode: context.gameplayEntryMode,
            tutorialMode: context.tutorialMode,
            initStage: safeStage,
            errorCode,
            errorMessage,
            cleanupErrors,
        });
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
        const modalFocusActive = (Number(runtime._modalFocusRefs) || 0) > 0;
        const expectedModalBlockers = modalFocusActive
            ? blockers.filter((entry) => runtime.isExpectedModalBlockerPath?.(String(entry.path || '')))
            : [];
        const unexpectedBlockers = blockers.filter((entry) => {
            const path = String(entry.path || '');
            if (modalFocusActive && runtime.isExpectedModalBlockerPath?.(path)) return false;
            return true;
        });
        const modalFocusMismatch = modalFocusActive && expectedModalBlockers.length === 0;
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName: 'level_interaction_ready',
            page: runtime.getAnalyticsPage(),
            levelId: logicalLevelId,
            logicalLevelId,
            physicalLevelId,
            source: 'gameplay_session',
            success: unexpectedBlockers.length === 0 && !modalFocusMismatch,
            errorCode: unexpectedBlockers.length > 0
                ? 'unexpected_input_blocker'
                : (modalFocusMismatch ? 'modal_focus_without_expected_blocker' : ''),
            extra: {
                tutorialMode,
                guideMode: runtime._guideMode || 'none',
                guideStep: Math.max(-1, Math.floor(Number(runtime._guideStep) || 0)),
                guidePhase: runtime._guidePhase || '',
                modalFocusRefs: Math.max(0, Number(runtime._modalFocusRefs) || 0),
                activeTouchCount: Math.max(0, Number(runtime.activeBoardTouches?.size) || 0),
                gestureMode: runtime.gestureMode || 'idle',
                conveyorCapacity: Math.max(0, Number(runtime.levelData?.conveyorCapacity) || 0),
                dataVersion: runtime.getRuntimeRemoteHash?.() || '',
                activeBlockers: blockers.map((entry) => String(entry.path || '')).join('|'),
                blockerClassification: expectedModalBlockers.length > 0 ? 'expected_modal' : 'normal',
                expectedModalBlockers: expectedModalBlockers.map((entry) => String(entry.path || '')).join('|'),
                unexpectedBlockers: unexpectedBlockers.map((entry) => String(entry.path || '')).join('|'),
            },
        });
    }

    private clearTutorialRuntimeState(runtime: any): void {
        runtime.clearGuideTransitionWatchdog?.();
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
        runtime._guidePreviewStep = -1;
        runtime._guideRenderStep = -1;
        runtime._guideReminderPausedForLifecycle = false;
        runtime._smartIdleHintTimerHandler = null;
        runtime._smartIdleHintToken = (Number(runtime._smartIdleHintToken) || 0) + 1;
        runtime._smartIdleHintActive = false;
        runtime._smartIdleHintPlan = null;
        runtime._smartIdleHintShownCount = 0;
        runtime._smartIdleHintEpisodeCycle = 0;
        runtime._smartIdleHintInputActive = false;
        runtime._gameplayInvalidTapFeedbackToken = (Number(runtime._gameplayInvalidTapFeedbackToken) || 0) + 1;
        runtime._guideZoomStartScale = 1;
        runtime._guideZoomLastScale = 1;
        runtime._guideZoomAccumulatedScaleDelta = 0;
        runtime._guideZoomLastSource = '';
        runtime._interactionTouchAttemptCount = 0;
    }

}

export function ensureGameplaySessionController(runtime: any): GameplaySessionController {
    if (!runtime._gameplaySessionController) {
        runtime._gameplaySessionController = new GameplaySessionController(runtime);
    }
    return runtime._gameplaySessionController as GameplaySessionController;
}
