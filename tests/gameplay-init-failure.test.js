const recoveryPlatform = require('./helpers/recovery-platform');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadControllerHarness(activeBlockers = [], audioFailure = '', wechat = false) {
    const audioAction = stage => { if (audioFailure === stage) throw Error(`injected ${stage}`); };
    const levelConfig = {};
    new Function('exports', ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Scripts/Core/LevelConfig.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText)(levelConfig);
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
        completeAppTransitionAfterDraw() {},
        markGameActive() {},
        clearRouteCover(source) {
            routeCoverClears.push(source);
        },
    };
    const analytics = {
        settlement: { failTransition() {} },
        setGameplayTelemetryScope() {},
        trackFunnelEvent(event) {
            analyticsEvents.push(event);
        },
        flushFunnelEvents() {},
        markFirstLevelReady() {},
        beginLevel() {},
        setLevelContext() {},
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
                init() { audioAction('audio_init'); },
                preload() { audioAction('audio_preload'); },
                playGameBgm() { audioAction('bgm_play'); },
                stopVoice() { audioAction('voice_stop'); },
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
            if (request === './MiniGamePlatform') return { isMiniGameRuntime: () => wechat && recoveryPlatform.isMiniGameRuntime() };
            if (request === './GameplayVoiceController') return { ensureGameplayVoiceController: () => ({ stopVoice() {}, beginLevel() { audioAction('voice_begin'); } }) };
            if (request === './BrowserLevelPreview') return { getBrowserLevelPreview: () => ({ active: false }) };
            if (request === './LevelDataCdnService') return { LevelDataCdnService: { inst: { getLevelAnalyticsMetadata: () => null } } };
            if (request === './GameCtrlModules/GameplayJudgmentFeedbackModule') return { GAMEPLAY_JUDGMENT_PRELOAD_SFX_NAMES: [] };
            if (request === './LevelConfig') return levelConfig;
            if (request === './WorkbenchPreviewService') return { isWorkbenchPreviewRequested: () => false };
            if (request === './GameCtrlShared') return shared;
            if (request === './AppRoot') {
                return { AppRoot: { tryGet: () => appRoot } };
            }
            if (request === './DebugPerfTrace') {
                return { collectActiveBlockInputEvents: () => activeBlockers, debugPerfSnapshot() {} };
            }
            if (request === './HardLevelIntroController') {
                return {
                    ensureHardLevelIntroController() {
                        return {
                            stop() {},
                            play(_hard, onComplete) { onComplete(); },
                        };
                    },
                };
            }
            if (request === './LevelExperimentService') {
                return { getFrontLevelExperimentAnalyticsContext: () => null };
            }
            if (request === './PchConveyorGameplayController') {
                return {
                    ensurePchConveyorGameplayController(runtime) {
                        return {
                            stop() {
                                runtime._testCalls.pchStops += 1;
                            },
                            start() {
                                if (runtime._testFailAt === 'pch') throw new Error('PCH conveyor start failed');
                            },
                            playOpeningPatternShuffle() {},
                        };
                    },
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
        pchStops: 0,
    };
    const runtime = {
        node: {},
        _testCalls: calls,
        _testFailAt: failAt,
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
        Hard: 0,
        boardWidth: 2,
        boardHeight: 2,
        timeLimit: 60,
        conveyorCapacity: 60,
        failAt,
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
const pchFailure = runFailureCase(2, 'pch', 'pch_core_gameplay', 'PCH conveyor start failed');
assert.ok(pchFailure.calls.pchStops >= 2, 'PCH cleanup must run before initialization and after a start failure');

for (const stage of ['voice_stop', 'audio_init', 'audio_preload', 'voice_begin', 'bgm_play']) {
    const harness = loadControllerHarness([], stage, true);
    const { runtime, calls } = createRuntime(2, '');
    const controller = new harness.GameplaySessionController(runtime);
    const data = { levelId: 2, Hard: 0, boardWidth: 2, boardHeight: 2, timeLimit: 60, conveyorCapacity: 60 };
    controller.initGame(data, 2);
    assert.strictEqual(runtime.levelData, data, 'audio recovery must initialize the original data');
    assert.strictEqual(runtime.isGameEnd, false);
    assert.strictEqual(calls.fatal.length, 0);
    assert.strictEqual(typeof runtime._csdOnInteractionReady, 'function', 'audio failure must reach original interaction readiness');
    assert.ok(harness.analyticsEvents.some(event => event.eventName === 'gameplay_audio_failed' && event.success === false));
}
{
    const harness = loadControllerHarness([], 'audio_init', false);
    const { runtime, calls } = createRuntime(2, '');
    assert.throws(() => new harness.GameplaySessionController(runtime).initGame({ levelId: 2 }, 2), /injected audio_init/);
    assert.strictEqual(calls.fatal[0].extra.initStage, 'audio_init', 'other platforms retain original audio failure behavior');
}

{
    const harness = loadControllerHarness([
        { path: 'Game/Canvas/ScreenRoot/OverlayRoot/GuideLayer', width: 720, height: 1280 },
    ]);
    const runtime = {
        _modalFocusRefs: 0,
        _guideMode: 'none',
        _guideStep: -1,
        _guidePhase: '',
        activeBoardTouches: new Map(),
        gestureMode: 'idle',
        levelData: { conveyorCapacity: 60 },
        getAnalyticsPage: () => 'level_game',
        getRuntimeRemoteHash: () => 'test-data-version',
        isExpectedModalBlockerPath: () => false,
    };
    const controller = new harness.GameplaySessionController(runtime);
    controller.reportLevelInteractionReady(runtime, 2, 2, 'main', 'none');
    const readiness = harness.analyticsEvents.at(-1);
    assert.strictEqual(readiness.eventName, 'level_interaction_ready');
    assert.strictEqual(readiness.success, false, 'new-only gameplay must reject a stale GuideLayer blocker');
    assert.strictEqual(readiness.errorCode, 'unexpected_input_blocker');
    assert.match(readiness.extra.unexpectedBlockers, /GuideLayer/);
    assert.strictEqual(readiness.extra.conveyorCapacity, 60);
}

console.log('gameplay-init-failure.test.js passed');
