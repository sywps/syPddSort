const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../assets/Scripts/Core');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function compile(source, deps = {}, globals = {}) {
    const exports = {};
    const js = ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    } }).outputText;
    new Function('exports', 'require', ...Object.keys(globals), js)(exports, id => {
        assert.ok(id in deps, `unexpected dependency ${id}`); return deps[id];
    }, ...Object.values(globals));
    return exports;
}
function method(file, name) {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    let found;
    function visit(node) {
        if (ts.isMethodDeclaration(node) && node.name?.getText(ast) === name) found = node.getText(ast);
        ts.forEachChild(node, visit);
    }
    visit(ast); assert.ok(found, name); return found;
}
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
function spineHarness(wechat = true) {
    const scope = {}, timers = new Map(), downloads = [], events = [];
    const wasm = deferred();
    let wasmCalls = 0, id = 0;
    const sp = { spine: {}, loadWasmModuleSpine() { wasmCalls++; return wasm.promise; } };
    const quiet = { warn() {}, error() {} };
    const api = compile(read('WeChatSceneSpine.ts'), {
        cc: { sp }, './MiniGamePlatform': { isWeChatMiniGameRuntime: () => wechat,
            getWeChatMiniGameRuntime: () => ({ loadSubpackage: options => downloads.push(options) }) },
        './AnalyticsMgr': { AnalyticsMgr: { inst: { trackFunnelEvent: event => events.push(event) } } },
    }, { globalThis: scope, console: quiet,
        setTimeout: callback => { timers.set(++id, callback); return id; }, clearTimeout: key => timers.delete(key) });
    const { Router } = compile(`export class Router { ${method('SceneRouter.ts', 'toGame')} }`, {}, {
        ensureWeChatSceneSpineReady: api.ensureWeChatSceneSpineReady,
        LOCAL_BOOTSTRAP_BUNDLE_NAME: 'bootstrap', LOGICAL_GAME_ENTRY_BUNDLE_NAME: 'gameEntry',
    });
    const router = new Router(); let loads = 0;
    router.gameSceneName = 'Game';
    router.loadBundledScene = async name => {
        if (wechat) assert.equal(typeof sp.spine.SkeletonInstance, 'function', 'scene deserialization needs initialized Spine');
        assert.equal(name, 'Game'); loads++;
    };
    return { ...api, scope, timers, downloads, events, sp, wasm, router,
        get wasmCalls() { return wasmCalls; }, get loads() { return loads; } };
}
function homeHarness(level = 14) {
    const events = [], entry = deferred(); let routes = 0, modal, failGrant = false;
    const session = { currentSceneName: 'Home', pendingGameplayRequest: null, activeGameplayContext: null,
        clearPendingGameplayRequest() { this.pendingGameplayRequest = null; } };
    const app = { session, router: { isTransitioning: false, requestHomeScene() {} }, isAppTransitionTargeting: () => false };
    const { Home } = compile(`export class Home {
        ${method('GameCtrlModules/HomeCommerceModule.ts', 'startWeChatHomeLevel')}
        ${method('GameCtrlModules/PlayerMetaStateModule.ts', 'grantVigorByAmount')}
    }`, {}, { AppRoot: { tryGet: () => app }, AudioMgr: { inst: { play() {} } },
        AnalyticsMgr: { inst: { trackFunnelEvent: event => events.push(event) } }, console: { error() {}, warn() {} } });
    Home.VIGOR_CEILING = 10; Home.VIGOR_RESTORE_SECONDS = 300;
    const home = new Home();
    Object.assign(home, { isValid: true, vigor: 9, vigorTime: 1234, toasts: [],
        getRuntimeSceneName: () => session.currentSceneName,
        isTutorialVigorFreeLevel: id => id <= 2,
        costVigorForLevel(id) { if (id <= 2) return true; if (this.vigor <= 0) return false; this.vigor--; return true; },
        requestGameplayRoute(id) { routes++; session.pendingGameplayRequest = { levelId: id, prefix: 'level_' }; return entry.promise; },
        showNoLivesAdModal(options) { modal = options; },
        updateVigor() { return this.vigor; }, setVigor(n) { if (failGrant) throw Error('storage failed'); this.vigor = n; },
        getVigorTime() { return this.vigorTime; }, setVigorTime(n) { this.vigorTime = n; }, refreshVigorUI() {},
        showToast(text) { this.toasts.push(text); },
    });
    return { home, session, events, entry, get routes() { return routes; }, get modal() { return modal; },
        set failGrant(value) { failGrant = value; }, start: () => home.startWeChatHomeLevel(level) };
}
async function run() {
    const cold = spineHarness();
    const route = cold.router.toGame();
    const shared = cold.ensureWeChatSceneSpineReady();
    assert.equal(cold.ensureWeChatSceneSpineReady(), shared);
    assert.equal(cold.downloads.length, 1); assert.equal(cold.loads, 0);
    cold.downloads[0].success(); await tick();
    assert.equal(cold.wasmCalls, 1); assert.equal(cold.loads, 0);
    cold.sp.spine.SkeletonInstance = class {}; cold.wasm.resolve(); await route;
    assert.equal(cold.loads, 1); assert.equal(cold.timers.size, 0);
    await cold.router.toGame(); assert.equal(cold.wasmCalls, 1);

    const failed = spineHarness();
    let request = failed.ensureWeChatSceneSpineReady();
    failed.downloads[0].fail({ errMsg: 'network failure' });
    await assert.rejects(request, /network failure/);
    assert.equal(failed.events[0].eventName, 'scene_spine_init_failed'); assert.equal(failed.events[0].success, false);
    assert.equal(failed.scope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__, undefined);
    request = failed.ensureWeChatSceneSpineReady(); assert.equal(failed.downloads.length, 2);
    failed.downloads[1].success(); await tick(); failed.wasm.resolve();
    await assert.rejects(request, /unavailable after initialization/, 'fulfilled loader is insufficient without constructor');

    const timeout = spineHarness(); request = timeout.router.toGame();
    [...timeout.timers.values()][0](); await assert.rejects(request, /timed out/);
    timeout.downloads[0].success(); await tick();
    assert.equal(timeout.wasmCalls, 0); assert.equal(timeout.loads, 0, 'late completion cannot enter the game');

    const slowWasm = spineHarness(); request = slowWasm.router.toGame();
    slowWasm.downloads[0].success(); await tick();
    [...slowWasm.timers.values()][0](); await assert.rejects(request, /wasm readiness timed out/);
    slowWasm.sp.spine.SkeletonInstance = class {}; slowWasm.wasm.resolve(); await tick();
    assert.equal(slowWasm.loads, 0, 'a timed-out request must not enter after late wasm initialization');
    await slowWasm.router.toGame(); assert.equal(slowWasm.loads, 1, 'a fresh request can use the actually initialized runtime');

    const existingDownload = spineHarness(); const preloaded = deferred();
    existingDownload.scope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__ = preloaded.promise;
    request = existingDownload.ensureWeChatSceneSpineReady(); assert.equal(existingDownload.downloads.length, 0);
    preloaded.resolve(); await tick(); existingDownload.wasm.reject(Error('wasm rejected'));
    await assert.rejects(request, /wasm rejected/);
    assert.equal(existingDownload.events[0].errorCode, 'spine_wasm_failed');

    const other = spineHarness(false); await other.router.toGame();
    assert.equal(other.downloads.length, 0); assert.equal(other.wasmCalls, 0);

    const paid = homeHarness(); const entry = paid.start(); await paid.start();
    assert.equal(paid.routes, 1); assert.equal(paid.home.vigor, 8);
    paid.entry.reject(Error('scene failure')); await entry;
    assert.equal(paid.home.vigor, 9); assert.equal(paid.home.vigorTime, 1234);
    assert.equal(paid.session.pendingGameplayRequest, null); assert.equal(paid.home._weChatHomeEntryPending, false);
    assert.equal(paid.events[0].extra.refunded, 1); assert.equal(paid.home.toasts.length, 1);

    const concurrentReward = homeHarness(); const rewardEntry = concurrentReward.start();
    concurrentReward.home.vigor = 9; concurrentReward.entry.reject(Error('scene failure')); await rewardEntry;
    assert.equal(concurrentReward.home.vigor, 10, 'refund adds to current balance instead of overwriting concurrent reward');
    assert.equal(concurrentReward.home.vigorTime, 0);

    const free = homeHarness(1); const freeEntry = free.start(); free.entry.reject(Error('scene failure')); await freeEntry;
    assert.equal(free.home.vigor, 9); assert.equal(free.events[0].extra.refunded, 0);
    const entered = homeHarness(); const enteredPromise = entered.start();
    entered.session.currentSceneName = 'Game'; entered.session.activeGameplayContext = {}; entered.home.isValid = false;
    entered.entry.reject(Error('later gameplay failure')); await enteredPromise;
    assert.equal(entered.home.vigor, 8); assert.equal(entered.events[0].extra.refunded, 0);
    const success = homeHarness(); const successEntry = success.start(); success.entry.resolve(); await successEntry;
    assert.equal(success.home.vigor, 8); assert.equal(success.events.length, 0);

    const refundFailure = homeHarness(); const refundEntry = refundFailure.start(); refundFailure.failGrant = true;
    refundFailure.entry.reject(Error('scene failure')); await refundEntry;
    assert.match(refundFailure.events[0].extra.refundError, /storage failed/);
    assert.equal(refundFailure.home._weChatHomeEntryPending, false);
    const noLives = homeHarness(); noLives.home.vigor = 0; await noLives.start();
    assert.equal(noLives.routes, 0); noLives.home.vigor = 2;
    noLives.modal.onResult({ status: 'granted' }); noLives.modal.onResult({ status: 'granted' }); await tick();
    assert.equal(noLives.routes, 1); assert.equal(noLives.home.vigor, 1); noLives.entry.resolve(); await tick();
    console.log('PASS WeChat cold Spine scene ordering, shared initialization, failure/timeout, platform isolation, entry/refund guards');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
