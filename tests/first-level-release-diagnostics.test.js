const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts'),
    'utf8',
);
const diagnosticSourceStart = source.indexOf('isFirstLevelReleaseDiagnosticsActive(): boolean');
const diagnosticSourceEnd = source.indexOf('getFirstLevelGuideStepKey(', diagnosticSourceStart);
assert.ok(diagnosticSourceStart >= 0 && diagnosticSourceEnd > diagnosticSourceStart, 'the L1 Release diagnostic block must be locatable');
const diagnosticSource = source.slice(diagnosticSourceStart, diagnosticSourceEnd);
for (const [forbiddenMutation, pattern] of [
    ['startTutorial', /\bstartTutorial\s*\(/],
    ['showGuideStep', /\bshowGuideStep\s*\(/],
    ['hideLoadingOverlay', /\bhideLoadingOverlay\b/],
    ['loadLevel', /\bloadLevel\s*\(/],
    ['_guideInputSuspended assignment', /\b_guideInputSuspended\s*=(?!=)/],
    ['propagationStopped assignment', /\bpropagationStopped\s*=(?!=)/],
]) {
    assert.ok(
        !pattern.test(diagnosticSource),
        `Release diagnostics must not contain recovery or input mutation: ${forbiddenMutation}`,
    );
}

const NodeToken = { EventType: { TOUCH_START: 'touch-start' } };
const UITransformToken = Symbol('UITransform');
const SpriteToken = Symbol('Sprite');
const BlockInputEventsToken = Symbol('BlockInputEvents');
const funnelEvents = [];
let activeBlockers = [];
let blockerReadError = false;
let afterDrawHandler = null;

const AnalyticsMgr = {
    inst: {
        trackFunnelEvent(event) {
            funnelEvents.push(event);
        },
        flushFunnelEvents() {},
    },
};

const gameCtrlShared = new Proxy({
    AnalyticsMgr,
    Node: NodeToken,
    UITransform: UITransformToken,
    Sprite: SpriteToken,
    BlockInputEvents: BlockInputEventsToken,
}, {
    get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'LOCAL_BOOTSTRAP_LEVEL_PREFIX') return 'level_';
        if (prop === 'assetManager') return {};
        if (prop === 'sys') return { isNative: false };
        return 0;
    },
});

const output = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
}).outputText;
const moduleRef = { exports: {} };
const sandbox = {
    module: moduleRef,
    exports: moduleRef.exports,
    require(id) {
        if (id === 'cc') {
            return {
                director: {
                    once(_eventName, handler) {
                        afterDrawHandler = () => {
                            afterDrawHandler = null;
                            handler();
                        };
                    },
                    off(_eventName, handler) {
                        if (afterDrawHandler === handler) afterDrawHandler = null;
                    },
                    getTotalFrames: () => 77,
                },
                Director: { EVENT_AFTER_DRAW: 'after-draw' },
            };
        }
        if (id === '../GameCtrlShared') return gameCtrlShared;
        if (id === '../AppRoot') return { AppRoot: { tryGet: () => null } };
        if (id === '../LevelDataCdnService') {
            return {
                LevelDataCdnService: {
                    inst: {
                        getAvailabilityDiagnostics: () => ({}),
                        getDataVersion: () => '',
                    },
                },
            };
        }
        if (id === '../MiniGamePlatform') {
            return {
                isDouyinMiniGameRuntime: () => false,
                isMiniGameRuntime: () => false,
                isWeChatMiniGameRuntime: () => false,
            };
        }
        if (id === '../DebugPerfTrace') {
            return {
                collectActiveBlockInputEvents: () => {
                    if (blockerReadError) throw new Error('diagnostic blocker scan failed');
                    return activeBlockers;
                },
                debugPerfSnapshot() {},
                debugPerfTrace() {},
            };
        }
        if (id === '../RuntimeLog') return { runtimeLog() {}, runtimeWarn() {} };
        if (id === '../StartupTrace') return { markStartupTrace() {} };
        if (id === './StartupCloudRestoreHelper') return { flushPendingStartupCloudGameplayRestore: () => false };
        throw new Error(`unexpected require: ${id}`);
    },
    console,
    setTimeout: () => ({ timer: true }),
    clearTimeout() {},
};
vm.runInNewContext(output, sandbox, { filename: 'FirstLevelRouteModule.ts' });

function createNode(name, parent = null) {
    const components = new Map();
    const node = {
        name,
        parent,
        children: [],
        isValid: true,
        activeInHierarchy: true,
        getChildByName(childName) {
            return this.children.find((child) => child.name === childName) || null;
        },
        getComponent(token) {
            return components.get(token) || null;
        },
        setComponent(token, value) {
            components.set(token, value);
        },
        getSiblingIndex() {
            return this.parent ? this.parent.children.indexOf(this) : 0;
        },
        on(_eventName, handler) {
            this.captureHandler = handler;
        },
        off(_eventName, handler) {
            if (this.captureHandler === handler) this.captureHandler = null;
        },
    };
    if (parent) parent.children.push(node);
    return node;
}

const canvas = createNode('Canvas');
const screenRoot = createNode('ScreenRoot', canvas);
const gameplayRoot = createNode('GameplayRoot', screenRoot);
const bootRoot = createNode('BootRoot', canvas);
const loading = createNode('StartupLoadingUI', bootRoot);
loading.activeInHierarchy = false;
loading.setComponent(BlockInputEventsToken, { enabled: false });
const overlayRoot = createNode('OverlayRoot', screenRoot);
const guideLayer = createNode('GuideLayer', overlayRoot);
guideLayer.setComponent(BlockInputEventsToken, { enabled: true });
guideLayer.setComponent(UITransformToken, { contentSize: { width: 720, height: 1280 } });
const guideHand = createNode('GuideHandSingle', overlayRoot);
guideHand.setComponent(SpriteToken, { spriteFrame: { isValid: true } });
const guideBubble = createNode('TutorialGuidePrompt', overlayRoot);
const scene = {
    getChildByName(name) {
        return name === 'Canvas' ? canvas : null;
    },
};

const scheduledHandlers = [];
const runtime = {
    node: { scene },
    _activeGameplayEntryMode: 'main',
    _isThemeLevel: false,
    _gameForeground: true,
    _guideMode: 'level_1',
    _guideStep: 0,
    _guidePhase: 'select',
    _guideStatus: 'awaiting_action',
    _guideInputSuspended: false,
    _guideLayer: guideLayer,
    _guideHand: guideHand,
    _guideBubble: guideBubble,
    _loadingOverlay: null,
    _modalFocusRefs: 0,
    _adShowing: false,
    _skillActive: false,
    _timerLockedForProp: false,
    _placementVisualRefs: 0,
    activeBoardTouches: new Map(),
    gestureMode: 'idle',
    getActiveLogicalLevelId: () => 1,
    getActivePhysicalLevelId: () => 1,
    getAnalyticsPage: () => 'level_game',
    getRuntimeRemoteHash: () => 'release-data-version',
    isFirstLevelFunnelActive: () => true,
    scheduleOnce(handler) { scheduledHandlers.push(handler); },
    unschedule() {},
};

const { installFirstLevelRouteModule } = moduleRef.exports;
installFirstLevelRouteModule(runtime);
runtime.bindFirstLevelReleaseTouchObserver();

const earlyEvent = {
    target: loading,
    propagationStopped: false,
    getUILocation: () => ({ x: 12, y: 34 }),
};
canvas.captureHandler(earlyEvent);
assert.strictEqual(earlyEvent.propagationStopped, false, 'the observer must not consume an early touch');

runtime.beginFirstLevelReleaseDiagnostics();
const diagnosticStart = funnelEvents.find((event) => event.stepName === 'diagnostic_start');
assert.ok(diagnosticStart, 'L1 startup must emit a Release diagnostic start event');
assert.strictEqual(diagnosticStart.stepId, 0, 'guide step zero must remain zero in Release diagnostics');
assert.ok(String(diagnosticStart.extra.earlyTouchWindow).startsWith('1|'), 'pre-init Canvas touches must be retained for L1 correlation');

activeBlockers = [{ path: 'Game/Canvas/ScreenRoot/OverlayRoot/GuideLayer' }];
const routedEvent = {
    target: guideLayer,
    propagationStopped: false,
    getUILocation: () => ({ x: 123, y: 456 }),
};
canvas.captureHandler(routedEvent);
assert.strictEqual(routedEvent.propagationStopped, false, 'the Canvas capture logger must never stop propagation');
const captureLog = funnelEvents.find((event) => event.stepName === 'canvas_touch_capture');
assert.ok(captureLog, 'a Canvas touch must be logged before GuideLayer delivery');
assert.ok(String(captureLog.extra.canvasTouch).includes('GuideLayer'), 'the capture log must retain the target path');
assert.strictEqual(captureLog.success, true, 'the expected GuideLayer blocker must not be labeled as an error');

blockerReadError = true;
assert.doesNotThrow(
    () => runtime.reportFirstLevelReleaseState('after_tutorial'),
    'a diagnostic collector failure must never escape into gameplay',
);
blockerReadError = false;
assert.ok(
    funnelEvents.some((event) => event.errorCode === 'diagnostic_exception'),
    'collector failures must remain observable through the Release funnel',
);

runtime.scheduleFirstLevelReleaseDiagnostics();
assert.strictEqual(typeof afterDrawHandler, 'function', 'the diagnostic must wait for a real after-draw signal');
afterDrawHandler();
assert.ok(funnelEvents.some((event) => event.stepName === 'after_draw_confirmed'), 'the rendered frame must be confirmed in Release telemetry');
for (const handler of scheduledHandlers) handler();
assert.ok(funnelEvents.some((event) => event.stepName === 'no_guide_touch_500ms'), 'no-touch state must be sampled without invoking recovery');

for (let index = 0; index < 30; index += 1) {
    runtime.reportFirstLevelReleaseState(`cap_probe_${index}`);
}
const releaseEvents = funnelEvents.filter((event) => event.eventName === 'l1_release_state');
assert.strictEqual(releaseEvents.length, 18, 'Release diagnostics must be capped per L1 initialization');
for (const event of releaseEvents) {
    assert.ok(Object.keys(event.extra || {}).length <= 29, 'diagnostic extras must leave room for launchChannelAtEvent in the cloud contract');
}
assert.strictEqual(gameplayRoot.activeInHierarchy, true, 'diagnostics must not mutate gameplay visibility');
assert.strictEqual(guideLayer.activeInHierarchy, true, 'diagnostics must not rebuild or hide the guide');
runtime.resetFirstLevelReleaseDiagnostics();
runtime.unbindFirstLevelReleaseTouchObserver();
assert.strictEqual(afterDrawHandler, null, 'after-draw observers must be detached during cleanup');
assert.strictEqual(canvas.captureHandler, null, 'Canvas capture observers must be detached during cleanup');

console.log('first-level-release-diagnostics.test.js passed');
