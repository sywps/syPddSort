const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');

const events = new EventEmitter();
const director = {
    once: (event, callback) => events.once(event, callback),
    off: (event, callback) => events.off(event, callback),
};
const cc = {
    _decorator: { ccclass: () => type => type }, Component: class {},
    Director: { EVENT_AFTER_DRAW: 'draw' }, director,
    view: { off() {} },
};
function load(file, imports) {
    const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, experimentalDecorators: true },
    });
    const module = { exports: {} };
    vm.runInNewContext(result.outputText, { module, exports: module.exports, require: id => {
        assert(id in imports, 'unmocked import ' + id);
        return imports[id];
    }, console });
    return module.exports;
}
const { StartupLoadingController } = load('assets/Scripts/Core/StartupLoadingController.ts', {
    cc, './SlicedLoadingProgressAdapter': {},
});
function makeLoading() {
    const loading = new StartupLoadingController();
    loading.node = { active: true };
    loading.label = { string: '' };
    loading.percentage = { string: '' };
    loading.progress = { fillNode: { active: true } };
    loading.restartButton = { active: false };
    loading.track = { active: true };
    return loading;
}
const loading = makeLoading();
loading.show('资源');
loading.noteMilestone('scene-ready');
assert.equal(loading.percentage.string, '20%');
loading.noteMilestone('scene-ready');
loading.noteMilestone('critical-ui-ready');
assert.equal(loading.progress.progress, 0.35, 'parallel completions add once');
loading.setStage('存档');
assert.equal(loading.percentage.string, '35%', 'stage text cannot simulate progress');
assert.equal(loading.update, undefined, 'elapsed time alone must not advance progress');
for (const milestone of ['route-ready', 'first_level_json_loaded', 'local-level-json-loaded',
    'external-level-json-loaded', 'bean-atlas-not-required', 'bean-atlas-ready', 'board-effects-ready', 'unrelated']) {
    loading.noteMilestone(milestone);
}
assert.equal(loading.percentage.string, '95%', 'aliases dedupe and completion cannot reach 100 before draw');
assert.equal(loading.progress.progress, 0.95);
assert.equal(loading.label.string, '存档');
let restarts = 0;
loading.showSlowLoading(() => restarts++);
assert.equal(loading.label.string, '加载较慢，请稍候');
assert.equal(loading.restartButton.active, true);
assert.equal(loading.track.active, false, 'restart action replaces the bar without adding a lower overlapping row');
loading.restartAction();
assert.equal(restarts, 1);
loading.setStage('关卡');
assert.equal(loading.label.string, '加载较慢，请稍候');
loading.clearSlowLoading();
assert.equal(loading.label.string, '关卡');
assert.equal(loading.restartButton.active, false);
assert.equal(loading.track.active, true);
loading.showSlowLoading(() => restarts++);
let released = 0;
loading.finishAfterDraw(() => released++);
loading.finishAfterDraw(() => released++);
assert.equal(loading.node.active, true, 'cover must survive until gameplay has drawn');
assert.equal(released, 0);
events.emit('draw');
assert.equal(loading.percentage.string, '100%');
assert.equal(released, 0, '100 percent must render before exit');
events.emit('draw');
assert.equal(released, 1, 'duplicate readiness calls must release once');
assert.equal(loading.node.active, false);
assert.equal(loading.restartButton.active, false, 'a slow load must still finish and remove its recovery action');
assert.equal(loading.restartAction, null);
loading.show('资源');
assert.equal(loading.percentage.string, '0%', 'new startup resets progress');
loading.finishAfterDraw(() => released++);
loading.fail('下载失败');
events.emit('draw');
assert.equal(released, 1, 'failure cancels an already queued success');
assert.equal(loading.node.active, true);
assert.equal(loading.progress.fillNode.active, false);
loading.setStage('错误之后的迟到回调');
loading.noteMilestone('scene-ready');
assert.equal(loading.percentage.string, '99%', 'failed load freezes reported progress');
assert(loading.label.string.includes('下载失败'), 'late progress cannot hide a failure');
loading.finishAfterDraw(() => released++);
events.emit('draw');
assert.equal(released, 1, 'failure cannot become success without a new show');
loading.show('重新开始');
loading.finishAfterDraw(() => released++);
loading.hide();
events.emit('draw');
assert.equal(released, 1, 'route-away cancels pending ready callbacks');
loading.show('最后一次');
loading.finishAfterDraw(() => released++);
events.emit('draw');
loading.onDestroy();
assert.equal(events.listenerCount('draw'), 0, 'destroy must remove draw listeners');

let callback;
let bundleLoads = 0;
let sceneLoads = 0;
let adopted = 0;
let detached = 0;
let destroyed = 0;
const appCc = {
    ...cc,
    assetManager: { loadBundle(name, cb) {
        assert.equal(name, 'main');
        bundleLoads++;
        callback = cb;
    } },
    instantiate: template => ({ getChildByName(name) {
        assert.equal(name, 'Boot');
        return { removeFromParent() { detached++; }, destroy() { destroyed++; } };
    } }),
};
const { AppRoot } = load('assets/Scripts/Core/AppRoot.ts', {
    cc: appCc,
    './AppTransitionController': { AppTransitionController: class {} },
    './StartupLoadingController': { StartupLoadingController },
    './AppSession': { AppSession: class {} },
    './SceneRouter': { SceneRouter: class {} },
});
(async () => {
    const root = new AppRoot();
    const shared = { isValid: true, node: { active: true } };
    root.adoptStartupLoading = () => { adopted++; root.startupLoading = shared; return shared; };
    const a = root.ensureStartupLoading();
    const b = root.ensureStartupLoading();
    assert.equal(a, b, 'concurrent direct entries must share one UI load');
    callback(null, { loadScene(name, cb) {
        assert.equal(name, 'Boot');
        sceneLoads++;
        cb(null, { scene: { getChildByName: () => ({}) } });
    } });
    assert.equal(await a, shared);
    assert.equal(await root.ensureStartupLoading(), shared);
    assert.equal(bundleLoads, 1);
    assert.equal(sceneLoads, 1);
    assert.equal(adopted, 1);
    assert.equal(detached, 1, 'cloned routing node must be detached before UI enters the active scene');
    assert.equal(destroyed, 1);
    const failedRoot = new AppRoot();
    const fail = failedRoot.ensureStartupLoading();
    callback(new Error('main unavailable'));
    await assert.rejects(fail, /main unavailable/);
    assert.equal(failedRoot.startupLoadingPromise, null, 'failed asset load must not retain a rejected promise');

    let ensured = 0;
    let hidden = 0;
    let stage = '';
    const sharedUi = { isValid: true, node: { active: true }, noteMilestone() {}, hide() { hidden++; }, show(value) { stage = value; }, setStage(value) { stage = value; } };
    const runtimeRoot = { startupLoading: sharedUi, ensureStartupLoading: async () => { ensured++; return sharedUi; } };
    const { GameSceneRuntimeController } = load('assets/Scripts/Core/GameSceneRuntimeController.ts', {
        cc,
        './BrowserLevelPreview': { getBrowserLevelPreview: () => ({ active: false }) },
        './Panels/FeedbackPanelController': { disposeFeedbackPanel() {} },
        './GameCtrlShared': {},
        './AppRoot': { AppRoot: { inst: runtimeRoot } },
        './DebugPerfTrace': {}, './RuntimeLog': {}, './StartupTrace': {},
        './StartupRouteService': {}, './MiniGamePlatform': {},
    });
    const visible = [];
    const runtime = { node: { isValid: true }, setGameplayStartupRootVisible: value => visible.push(value), acquireRuntimeOwner: () => 'owner' };
    const binding = new GameSceneRuntimeController(runtime);
    await binding.bindExistingGameLoadingOverlay(false);
    assert.equal(ensured, 0, 'Home/PVP no-cover entry must not load main or Boot UI');
    assert.equal(hidden, 1);
    assert.deepEqual(visible, [true]);
    const covered = binding.bindExistingGameLoadingOverlay(true);
    assert.deepEqual(visible, [true, false], 'gameplay must hide synchronously before the asset await');
    await covered;
    assert.equal(runtime._loadingOverlay, sharedUi.node);
    assert.equal(runtime._loadingOwnerToken, 'owner');
    assert.equal(stage, '正在准备关卡…');

    let redundantCanvasDestroyed = 0;
    let routeReparented = false;
    const scene = { getChildByName: () => ({ destroy() { redundantCanvasDestroyed++; } }) };
    const { BootSceneCtrl } = load('assets/Scripts/Core/BootSceneCtrl.ts', {
        cc: { ...cc, _decorator: { ...cc._decorator, property: () => () => {} } },
        './AppRoot': { AppRoot: { inst: runtimeRoot } },
        './DebugPerfTrace': {}, './StartupRouteService': {}, './StartupTrace': { markStartupTrace() {} },
    });
    const boot = new BootSceneCtrl();
    boot.node = { scene, setParent(parent) { routeReparented = parent === scene; } };
    boot.showBootLoadingUi();
    assert.equal(routeReparented, true, 'Boot routing component must not persist with the UI');
    assert.equal(redundantCanvasDestroyed, 1, 'returning to Boot must discard the new duplicate Canvas');
    assert.equal(runtimeRoot.startupLoading, sharedUi, 'returning to Boot must reuse the same loading instance');
    assert.equal(stage, '正在加载游戏资源…');
    console.log('startup-loading-lifecycle.test.js passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
