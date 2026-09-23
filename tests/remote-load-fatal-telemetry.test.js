const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, requireMock = () => ({}), consoleMock = console) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, require: requireMock, console: consoleMock });
    return exports;
}
const { isOfficialAnalyticsRuntime } = load('assets/Scripts/Core/CsdAnalyticsPolicy.ts');

function harness({ version = 'release', platform = 'ios', pending = { levelId: 23, entryMode: 'main' }, active = null,
    preview = false, failTelemetry = false } = {}) {
    const events = [], logs = [], nodes = new Map();
    let flushes = 0;
    class UITransform {}
    class Label {}
    class BlockInputEvents {}
    class Button { static EventType = { CLICK: 'click' }; }
    function node(name) {
        if (nodes.has(name)) return nodes.get(name);
        const components = new Map([
            [UITransform, { setContentSize() {} }], [Label, { string: name === 'RemoteLoadFatalErrorTitle' ? '版本更新请重启游戏' : '重启游戏' }],
            [Button, { interactable: false }], [BlockInputEvents, { enabled: false }],
        ]);
        const result = { isValid: true, active: false, children: [], components, setSiblingIndex() {}, targetOff() {},
            on(_event, handler) { this.handler = handler; }, getComponent: type => components.get(type) };
        nodes.set(name, result);
        return result;
    }
    const analytics = {
        isCollectionEnabled: () => !preview && isOfficialAnalyticsRuntime({
            getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }), getDeviceInfo: () => ({ platform }),
        }),
        trackFunnelEvent(event) { if (failTelemetry) throw Error('queue unavailable'); events.push(event); },
        flushFunnelEvents() { flushes++; },
    };
    const app = { session: { pendingGameplayRequest: pending, activeGameplayContext: active },
        clearRouteCover() {}, completeAppTransitionAfterDraw() {} };
    const requires = id => {
        if (id === '../GameCtrlShared') return { UITransform, Label, BlockInputEvents, Button, AnalyticsMgr: { inst: analytics } };
        if (id === '../AppRoot') return { AppRoot: { tryGet: () => app } };
        if (id === '../BrowserLevelPreview') return { getBrowserLevelPreview: () => ({ active: preview, currentLevel: 23 }) };
        if (id === '../RuntimeLog') return { runtimeWarn() {} };
        if (id === '../WorkbenchPreviewService') return { isWorkbenchPreviewRequested: () => false };
        return {};
    };
    const logger = { error: (...args) => logs.push(args) };
    const runtime = {};
    load('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts', requires, logger).installFirstLevelRouteModule(runtime);
    load('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts', requires, logger).installSceneHomeEntryModule(runtime);
    Object.assign(runtime, {
        node: { scene: { name: 'Game' } },
        _getLoadingVisibleSize: () => ({ width: 720, height: 1280 }),
        requireCanvasUiRoot: node, requireUiChild: (_parent, name) => node(name),
        getLogicalMainLevelId: physical => physical - 2,
        getLevelDataLoadDiagnostics: (levelId, levelPath, extra) => ({ remoteHash: 'test-version', levelId, levelPath, ...extra }),
        reportLevelDataLoadDiagnostic() {}, setGameplayStartupRootVisible() {}, hideLoadingOverlay() {},
    });
    return { runtime, events, logs, nodes, Label, Button, flushes: () => flushes };
}

// Exercise each real entry path, including faults beyond the old first-two-level gate.
for (const path of ['direct', 'local', 'remote']) {
    const h = harness({ active: { activeLevelId: 4, entryMode: 'main' } });
    if (path === 'direct') h.runtime.showRemoteLoadFatalError('Effects/GuideRoundedMask', 'opening_guide_material_missing', 'missing material');
    if (path === 'local') h.runtime._stopGameplayEntryWithFatalError('Effects/GuideRoundedMask', 'opening_guide_material_missing', 'missing material');
    if (path === 'remote') h.runtime.stopLevelDataLoadWithFatalError(23, 'Effects/GuideRoundedMask', 'assets_failed', 'opening_guide_material_missing', 'missing material', { initStage: 'guide' });
    h.runtime.showRemoteLoadFatalError('another-path', 'secondary_error', 'must not replace the first cause');
    h.runtime._stopGameplayEntryWithFatalError('another-path', 'secondary_error', 'must not double count');
    assert.equal(h.events.length, 1, `${path}: one canonical popup event across duplicate callbacks`);
    const event = h.events[0];
    assert.equal(event.eventName, 'remote_load_fatal_shown');
    assert.equal(event.levelId, 21, 'target logical level, not previous level');
    assert.equal(event.physicalLevelId, 23);
    assert.equal(event.errorCode, 'opening_guide_material_missing');
    assert.equal(event.errorMessage, 'missing material');
    assert.equal(event.extra.levelPath, 'Effects/GuideRoundedMask');
    assert.equal(event.extra.remoteHash, 'test-version');
    assert.equal(event.success, false);
    assert.equal(h.flushes(), 1);
    if (path === 'remote') {
        assert.equal(event.extra.sourceEvent, 'assets_failed');
        assert.equal(event.extra.initStage, 'guide');
    }
    assert.equal(h.nodes.get('RemoteLoadFatalErrorTitle').getComponent(h.Label).string, '版本更新请重启游戏');
    assert.equal(h.nodes.get('RemoteLoadFatalErrorRestart').getComponent(h.Label).string, '重启游戏');
    assert.equal(h.nodes.get('RemoteLoadFatalErrorRestart').getComponent(h.Button).interactable, true);
    assert.equal(h.nodes.get('RemoteLoadFatalErrorDetail').active, false);
    assert.equal(h.nodes.get('RemoteLoadFatalErrorPath').active, false);
    assert.equal(typeof h.nodes.get('RemoteLoadFatalErrorRestart').handler, 'function');
    // A later surface after the old one is destroyed is a new occurrence.
    h.runtime._remoteLoadErrorOverlay.isValid = false;
    h.runtime.showRemoteLoadFatalError('new-resource', 'new_error', 'new failure');
    assert.equal(h.events.length, 2);
}

const initialization = harness();
initialization.runtime.stopLevelDataLoadWithFatalError(21, 'level_23', 'gameplay_init_failed', 'init_error', 'failed', {
    logicalLevelId: 21, physicalLevelId: 23, initStage: 'board',
});
assert.equal(initialization.events[0].logicalLevelId, 21);
assert.equal(initialization.events[0].physicalLevelId, 23);
const startup = harness({ pending: null });
startup.runtime.showRemoteLoadFatalError('startup', 'startup_failed', 'failed before a level was selected');
assert.equal(startup.events[0].levelId, 0, 'unknown level must not be fabricated as level one');
assert.equal(startup.events[0].page, 'app');
const theme = harness({ pending: { levelId: 55, entryMode: 'theme' } });
theme.runtime.showRemoteLoadFatalError('zt_level_55', 'missing', 'theme unavailable');
assert.equal(theme.events[0].logicalLevelId, 55);

for (const options of [{ version: 'develop' }, { version: 'trial' }, { platform: 'devtools' }, { version: '' }, { preview: true }]) {
    const h = harness(options);
    h.runtime.showRemoteLoadFatalError('resource', 'missing', 'unavailable');
    assert.equal(h.events.length, 0);
    assert.equal(h.flushes(), 0);
    assert.equal(h.nodes.get('RemoteLoadFatalError').active, true, 'collection policy does not change the popup');
}
const brokenTelemetry = harness({ failTelemetry: true });
brokenTelemetry.runtime.showRemoteLoadFatalError('resource', 'missing', 'unavailable');
assert.equal(brokenTelemetry.logs.length, 1, 'telemetry failure is explicit in diagnostics');
assert.equal(typeof brokenTelemetry.nodes.get('RemoteLoadFatalErrorRestart').handler, 'function', 'restart remains bound');
const brokenDiagnostics = harness();
brokenDiagnostics.runtime.getLevelDataLoadDiagnostics = () => { throw Error('resource manager unavailable'); };
brokenDiagnostics.runtime.showRemoteLoadFatalError('resource', 'missing', 'original failure');
assert.equal(brokenDiagnostics.events.length, 1, 'resource diagnostics must not prevent recording the original failure');
assert.equal(brokenDiagnostics.events[0].errorMessage, 'original failure');
assert.equal(brokenDiagnostics.events[0].extra.levelPath, 'resource');
assert.match(brokenDiagnostics.events[0].extra.diagnosticCollectionError, /resource manager unavailable/);
console.log('remote-load-fatal-telemetry.test.js passed');
