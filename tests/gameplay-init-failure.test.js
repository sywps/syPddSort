const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadControllerHarness(activeBlockers = []) {
    const source = fs.readFileSync(
        path.join(root, 'assets/Scripts/Core/GameplaySessionController.ts'),
        'utf8',
    );
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;

    const analyticsEvents = [];
    const routeCoverClears = [];
    const appRoot = {
        markGameActive() {},
        clearRouteCover(source) {
            routeCoverClears.push(source);
        },
    };
    const analytics = {
        trackFunnelEvent(event) {
            analyticsEvents.push(event);
        },
        flushFunnelEvents() {},
        markFirstLevelReady() {},
        beginLevel() {},
    };
    class BoardModel {
        constructor(data) {
            if (data.failAt === 'model') {
                throw new Error('board model construction failed');
            }
        }
    }
    class SlotModel {
        constructor() {
            this.unlockedCount = 0;
        }
    }
    const shared = {
        AnalyticsMgr: { inst: analytics },
        AudioMgr: {
            inst: {
                init() {},
                preload() {},
                playGameBgm() {},
            },
        },
        BoardModel,
        SLOTS_PER_ROW: 12,
        SlotModel,
        SySDKMgr: {
            inst: {
                reportLevelEnter() {},
                reportTutorialStart() {},
            },
        },
    };
    const sandbox = {
        exports: {},
        module: { exports: {} },
        require(request) {
            if (request === './GameCtrlShared') return shared;
            if (request === './AppRoot') {
                return { AppRoot: { tryGet: () => appRoot } };
            }
            if (request === './DebugPerfTrace') {
                return { collectActiveBlockInputEvents: () => activeBlockers };
            }
            if (request === './LevelExperimentService') {
                return { getFrontLevelExperimentAnalyticsContext: () => null };
            }
            if (request === './SlotOnboardingPolicy') {
                return {
                    resolveSlotOnboardingTimeLimit: ({ configuredTimeLimit }) => Number(configuredTimeLimit) || 0,
                    resolveSlotRowPolicy: () => ({
                        rowCount: 2,
                        unlockedRows: 1,
                        showSlotUnlockGuide: false,
                    }),
                };
            }
            if (request === './StartupTrace') {
                return {
                    flushStartupTrace() {},
                    markStartupTrace() {},
                };
            }
            return {};
        },
        console: {
            error() {},
            warn() {},
            log() {},
        },
    };
    sandbox.exports = sandbox.module.exports;
    vm.runInNewContext(output, sandbox, { filename: 'GameplaySessionController.ts' });
    return {
        GameplaySessionController: sandbox.module.exports.GameplaySessionController,
        analyticsEvents,
        routeCoverClears,
    };
}

function createRuntime(levelId, failAt) {
    const calls = {
        fatal: [],
        hideLoading: 0,
        showGameplayRoot: 0,
        scheduled: 0,
        tutorialCleanup: 0,
        inputCleanup: 0,
        placementCleanup: 0,
        callbackCleanup: 0,
    };
    const runtime = {
        node: {},
        _isThemeLevel: false,
        _currentExternalLevelFilePath: '',
        _bootstrapOnlyGameplayStartup: false,
        _gameplayInitSeq: 0,
        _modalFocusRefs: 0,
        _guideLayer: null,
        _guideBubble: null,
        _guidePulseTweens: [],
        activeBoardTouches: new Map(),
        gestureMode: 'idle',
        cancelRewardedGrantInteraction() {},
        resetFirstLevelReleaseDiagnostics() {},
        clearGuideReminderTimer() {},
        hideGuideReminderVisuals() {},
        clearGuideHighlight() {},
        clearPatternCompleteMatchFx() {},
        clearFreezeSpineFx() {},
        stopPulseTweens() {},
        clearDragNodes() {},
        clearForcedSkillHiddenState() {},
        clearSelectionOverlay() {},
        clearIdleHint() {},
        clearEndgameHints() {},
        unscheduleAllCallbacks() {
            calls.callbackCleanup += 1;
        },
        clearPlacementVisualState() {
            calls.placementCleanup += 1;
        },
        detachGameplayInputHandlers() {
            calls.inputCleanup += 1;
        },
        getActiveLogicalLevelId: () => levelId,
        getActivePhysicalLevelId: () => levelId,
        getAnalyticsLevelId: () => levelId,
        getAnalyticsPage: () => 'level_game',
        getMaxSlotRows: () => 4,
        getUrlLevel: () => 0,
        getRuntimeRemoteHash: () => 'test-data-version',
        getLevelDataPath: (id, prefix) => `LevelData/${prefix}${id}`,
        isExternalLevelPreviewActive: () => false,
        isFirstLevelFunnelActive: () => levelId === 1,
        shouldUseLocalBootstrapBundle: () => levelId === 1,
        beginFirstLevelReleaseDiagnostics() {},
        reportFirstLevelReleaseState() {},
        resolveDynamicCountdownTimeLimit: ({ baseTimeLimit }) => baseTimeLimit,
        buildUI() {},
        renderBoard() {},
        renderSlots() {},
        resetAdRewardHintState() {},
        assertGameplayVisualReadiness() {},
        hideLoadingOverlayAfterGameplayReady() {
            calls.hideLoading += 1;
        },
        recordMainlineLevelEntry() {},
        refreshEndgameHints() {},
        onGameplayUiReadyForStartupServices() {},
        startPostPlayableWarmup() {},
        needsBeanReRender: () => false,
        scheduleOnce() {
            calls.scheduled += 1;
        },
        unschedule() {},
        resetIdleHintTimer() {},
        startTutorial() {
            if (failAt !== 'tutorial') return;
            this._guideLayer = {
                isValid: true,
                destroy() {
                    this.isValid = false;
                    calls.tutorialCleanup += 1;
                },
            };
            this._guideBubble = { isValid: true, active: true };
            throw new Error('tutorial construction failed');
        },
        scheduleFirstLevelReleaseDiagnostics() {},
        setGameplayStartupRootVisible(visible) {
            if (visible) calls.showGameplayRoot += 1;
        },
        hideLoadingOverlay() {
            calls.hideLoading += 1;
        },
        stopLevelDataLoadWithFatalError(
            fatalLevelId,
            levelPath,
            eventName,
            errorCode,
            errorMessage,
            extra,
        ) {
            calls.fatal.push({
                fatalLevelId,
                levelPath,
                eventName,
                errorCode,
                errorMessage,
                extra,
            });
            this._levelDataLoadStopped = true;
            this._remoteLoadErrorOverlay = { isValid: true };
        },
    };
    return { runtime, calls };
}

function runFailureCase(levelId, failAt, expectedStage, expectedMessage) {
    const harness = loadControllerHarness();
    const { runtime, calls } = createRuntime(levelId, failAt);
    const controller = new harness.GameplaySessionController(runtime);
    const data = {
        levelId,
        boardWidth: 2,
        boardHeight: 2,
        timeLimit: 60,
        failAt,
        tutorialGuide: {
            mode: levelId === 1 ? 'level_1_red_blue' : 'slot_expand_all',
        },
    };

    assert.throws(
        () => controller.initGame(data, levelId),
        new RegExp(expectedMessage),
        'the controller must abort the direct caller after rendering the terminal state',
    );
    assert.strictEqual(calls.fatal.length, 1, 'the initialization failure must produce one terminal failure request');
    const fatal = calls.fatal[0];
    assert.strictEqual(fatal.fatalLevelId, levelId, 'the terminal failure must retain the actual level');
    assert.strictEqual(fatal.eventName, 'gameplay_init_failed');
    assert.strictEqual(fatal.extra.initStage, expectedStage);
    assert.strictEqual(fatal.errorCode, `gameplay_init_${expectedStage}_failed`);
    assert.strictEqual(fatal.extra.logicalLevelId, levelId);
    assert.strictEqual(fatal.extra.physicalLevelId, levelId);
    assert.strictEqual(runtime._levelDataLoadStopped, true, 'failure must stop later load callbacks');
    assert.strictEqual(runtime._remoteLoadErrorOverlay.isValid, true, 'the authored terminal surface must become active');
    assert.strictEqual(runtime.isGameEnd, true, 'partially initialized gameplay must become non-interactive');
    assert.ok(calls.showGameplayRoot >= 1, 'failure must restore the Game root behind the terminal surface');
    assert.ok(calls.hideLoading >= 1, 'failure must release StartupLoadingUI and its blocker');
    assert.ok(calls.inputCleanup >= 1, 'failure must detach partial gameplay input');
    assert.ok(calls.placementCleanup >= 1, 'failure must clear partial placement state');
    assert.ok(calls.callbackCleanup >= 1, 'failure must cancel scheduled gameplay callbacks');
    assert.ok(harness.routeCoverClears.includes('gameplay-init-error'));
    return { runtime, calls };
}

runFailureCase(1, 'model', 'model_build', 'board model construction failed');
const laterLevelFailure = runFailureCase(2, 'tutorial', 'tutorial_start', 'tutorial construction failed');
assert.strictEqual(
    laterLevelFailure.calls.tutorialCleanup,
    1,
    'a non-L1 tutorial exception must destroy its partial full-screen GuideLayer',
);
assert.strictEqual(laterLevelFailure.runtime._guideLayer, null);
assert.strictEqual(laterLevelFailure.runtime._guideBubble, null);

{
    const harness = loadControllerHarness([
        { path: 'Game/Canvas/ScreenRoot/OverlayRoot/GuideLayer', width: 720, height: 1280 },
    ]);
    const runtime = {
        _modalFocusRefs: 0,
        _guideMode: 'slot_intro',
        _guideStep: 0,
        _guidePhase: 'unlock',
        activeBoardTouches: new Map(),
        gestureMode: 'idle',
        slotUnlockedRows: 1,
        slotRowCount: 2,
        getAnalyticsPage: () => 'level_game',
        getRuntimeRemoteHash: () => 'test-data-version',
        isExpectedModalBlockerPath: () => false,
    };
    const controller = new harness.GameplaySessionController(runtime);
    controller.reportLevelInteractionReady(runtime, 2, 2, 'main', 'slot_intro');
    const readiness = harness.analyticsEvents.at(-1);
    assert.strictEqual(readiness.eventName, 'level_interaction_ready');
    assert.strictEqual(readiness.success, true, 'slot_intro GuideLayer must be treated as an expected tutorial blocker');
    assert.strictEqual(readiness.errorCode, '', 'slot_intro must not emit unexpected_input_blocker');
    assert.strictEqual(readiness.extra.unexpectedBlockers, '');
}

console.log('gameplay-init-failure.test.js passed');
