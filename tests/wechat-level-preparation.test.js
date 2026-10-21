const recoveryPlatform = require('./helpers/recovery-platform');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../assets/Scripts/Core');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function compile(source, deps = {}, globals = {}) {
    const exports = {};
    new Function('exports', 'require', ...Object.keys(globals), ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText)(exports, id => {
        assert.ok(id in deps, `missing dependency ${id}`);
        return deps[id];
    }, ...Object.values(globals));
    return exports;
}
function methods(file, names, globals) {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    const found = new Map();
    function visit(n) {
        if (ts.isMethodDeclaration(n) && names.includes(n.name?.getText(ast))) found.set(n.name.getText(ast), n.getText(ast));
        ts.forEachChild(n, visit);
    }
    visit(ast);
    names.forEach(n => assert.ok(found.has(n), n));
    return new (compile(`export class Harness { ${names.map(n => found.get(n)).join('\n')} }`, {}, globals).Harness)();
}
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
async function run() {
    const scope = methods('GameCtrlModules/SceneHomeEntryModule.ts', ['shouldPrepareWeChatMainline'], {
        isMiniGameRuntime: recoveryPlatform.isMiniGameRuntime, isWorkbenchPreviewRequested: () => false,
    });
    assert.equal(scope.shouldPrepareWeChatMainline('level_'), true, 'actual mini-game platform selects shared mainline preparation');
    assert.equal(scope.shouldPrepareWeChatMainline('zt_level_'), false);
    scope.isCoopMode = () => true; assert.equal(scope.shouldPrepareWeChatMainline('level_'), false);
    scope.isCoopMode = () => false; scope.isRankedPvpMode = () => true;
    assert.equal(scope.shouldPrepareWeChatMainline('level_'), false);
    const originalLoader = methods('GameCtrlModules/AssetBootstrapModule.ts', ['_loadLevelDataFromConfiguredSource'], {
        isMiniGameRuntime: recoveryPlatform.isMiniGameRuntime,
        AnalyticsMgr: { inst: { prepareThirdLevelExperiment() { throw Error('mini-games must not depend on experiment cloud'); } } },
    });
    originalLoader._loadPreparedLevelDataFromConfiguredSource = (id, prefix, done, variant) => done({ id, variant });
    assert.deepEqual(await new Promise(resolve => originalLoader._loadLevelDataFromConfiguredSource(3, 'level_', resolve)), { id: 3, variant: 'A' });
    let now = 0, id = 0, throwTelemetry = false;
    const timers = new Map(), events = [];
    const api = compile(read('WeChatLevelPreparation.ts'), {
        './AnalyticsMgr': { AnalyticsMgr: { inst: { trackFunnelEvent(e) { if (throwTelemetry) throw Error('offline'); events.push(e); } } } },
    }, {
        Date: { now: () => now },
        setTimeout: (fn, ms) => { const key = ++id; timers.set(key, { fn, at: now + ms }); return key; },
        clearTimeout: key => timers.delete(key), console: { warn() {} },
    });
    async function advance(ms) {
        now += ms;
        for (const [key, t] of [...timers]) if (t.at <= now) { timers.delete(key); t.fn(); }
        await flush();
    }
    const data = { levelId: 3, original: true };
    function runtime(overrides = {}) {
        return { isValid: true, shouldUseLocalBootstrapBundle: () => false,
            _loadLevelDataFromConfiguredSource: (id, prefix, cb) => { assert.equal(id, 3); assert.equal(prefix, 'level_'); cb(data); },
            _prepareBeanFramesForLevelData: (d, cb) => cb(), needsBeanFramesForLevelData: () => false,
            prepareCriticalUiTexturesForLevel: (d, cb) => cb(), getMissingCriticalGameplayShellTextureNamesForLevel: () => [],
            prepareWeChatMainlineUi(d, done) { this.prepareCriticalUiTexturesForLevel(d, () => done(this.getMissingCriticalGameplayShellTextureNamesForLevel(d))); },
            prepareRequiredBoardEffectTextures: cb => cb({ ok: true }), ...overrides };
    }
    let beanCalls = 0;
    const retry = runtime({ _prepareBeanFramesForLevelData(d, cb) { beanCalls++; cb(); cb(); }, needsBeanFramesForLevelData: () => beanCalls === 1 });
    const a = api.prepareWeChatMainlineLevel(retry, 3);
    assert.equal(a, api.prepareWeChatMainlineLevel(retry, 3), 'duplicate entry shares preparation');
    assert.equal(await a, data, 'retry must preserve exact original data object');
    assert.equal(beanCalls, 2);
    assert.ok(events.some(e => e.eventName === 'level_preparation_failed'));
    assert.ok(!events.some(e => e.eventName === 'level_recovery_playable'), 'resource readiness is not playability');
    let late;
    const slow = runtime({ _loadLevelDataFromConfiguredSource(id, prefix, cb) { late = cb; } });
    let done = false;
    const slowPromise = api.prepareWeChatMainlineLevel(slow, 3).then(() => { done = true; });
    const stale = late;
    await advance(12000);
    stale({ levelId: 3, stale: true }); await flush();
    assert.equal(done, false, 'late callback from first timed-out attempt cannot finish retry');
    late(data); await slowPromise;
    const hung = runtime({ _loadLevelDataFromConfiguredSource() {} });
    const failure = assert.rejects(api.prepareWeChatMainlineLevel(hung, 3), /timed out/);
    await advance(12000); await advance(12000); await failure;
    hung._loadLevelDataFromConfiguredSource = runtime()._loadLevelDataFromConfiguredSource;
    assert.equal(await api.prepareWeChatMainlineLevel(hung, 3), data, 'failed request must not poison next user attempt');
    const wrong = runtime({ _loadLevelDataFromConfiguredSource(id, prefix, cb) { cb({ levelId: 2 }); } });
    await assert.rejects(api.prepareWeChatMainlineLevel(wrong, 3), /original level_3 unavailable/);
    let pending;
    const dead = runtime({ _loadLevelDataFromConfiguredSource(id, prefix, cb) { pending = cb; } });
    const cancelled = assert.rejects(api.prepareWeChatMainlineLevel(dead, 3), /cancelled/);
    dead.isValid = false; pending(data); await cancelled;
    throwTelemetry = true;
    assert.equal(await api.prepareWeChatMainlineLevel(runtime(), 3), data, 'telemetry must never gate loading');
    throwTelemetry = false;
    assert.equal(timers.size, 0);

    let preparedResolve, executed = 0, cleaned = 0, toasted = 0, refund = 0, fatal = 0;
    const session = { weChatEntryVigorCharged: true };
    const app = { session, runGameplayTransition: async (key, action) => action() };
    const h = methods('GameCtrlModules/SceneHomeEntryModule.ts', ['requestGameplayTransition', 'refundWeChatEntryVigor'], {
        AppRoot: { inst: app, tryGet: () => app }, isMiniGameRuntime: () => recoveryPlatform.isMiniGameRuntime(),
        AnalyticsMgr: { inst: { settlement: { failTransition() { throw Error('telemetry unavailable'); } } } }, reportWeChatEntry() {}, console: { error() {} },
    });
    Object.assign(h, { isValid: true, getRuntimeSceneName: () => 'Game', unschedule() { cleaned++; },
        unscheduleAllCallbacks() {}, stopPulseTweens() {}, clearDragNodes() {},
        endSettlementNextTransition() {}, showToast() { toasted++; }, grantVigorByAmount() { refund++; return 1; },
        _stopGameplayEntryWithFatalError() { fatal++; } });
    const preparing = h.requestGameplayTransition('next', () => { executed++; }, () => new Promise(resolve => { preparedResolve = resolve; }));
    assert.equal(h.requestGameplayTransition('next', () => { executed++; }), preparing);
    await flush(); assert.equal(cleaned, 0); assert.equal(executed, 0);
    preparedResolve(); assert.equal(await preparing, true); assert.equal(executed, 1);
    cleaned = 0;
    assert.equal(await h.requestGameplayTransition('next', () => { executed++; }, async () => { throw Error('offline'); }), false);
    assert.equal(cleaned, 0, 'failed preparation must preserve existing scene/settlement');
    assert.equal(executed, 1); assert.equal(fatal, 0); assert.equal(toasted, 1); assert.equal(refund, 1);
    h.refundWeChatEntryVigor(); assert.equal(refund, 1, 'compensation exactly once');
    assert.equal(h._gameplayTransitionPromise, null, 'manual retry remains available');

    const ui = methods('GameCtrlModules/SceneHomeEntryModule.ts', ['prepareWeChatMainlineUi'], {
        LOCAL_BOOTSTRAP_TEXTURE_NAMES: new Set(['hud', 'tutorial-hand']),
    });
    Object.assign(ui, { shouldUseLocalBootstrapBundle: () => true, sfCache: new Map([['hud', {}]]),
        _preloadBootstrapTextureSet: (names, done) => { assert.deepEqual(names, ['hud', 'tutorial-hand']); done(); } });
    ui.prepareWeChatMainlineUi({ levelId: 1 }, missing => assert.deepEqual(missing, ['tutorial-hand'], 'first-level tutorial resources must remain required'));

    // The successful data callback cannot reveal the transition: the original
    // PCH input readiness and a rendered frame are both required, independent
    // of analytics collection being enabled.
    let inputReady = false, readySignals = 0, rendered, readyTimer, hidden = 0, recovered = 0;
    const readyApp = { session: { weChatEntryVigorCharged: true }, completeAppTransitionAfterDraw() { readySignals++; } };
    const readyRuntime = methods('GameCtrlModules/GameplayShareLoadingModule.ts', ['hideLoadingOverlayAfterGameplayReady'], {
        AppRoot: { tryGet: () => readyApp }, isMiniGameRuntime: () => recoveryPlatform.isMiniGameRuntime(),
        director: { once: (_event, cb) => { rendered = cb; } }, Director: { EVENT_AFTER_DRAW: 'draw' },
        Date: { now: () => now }, setTimeout: cb => { readyTimer = cb; return 1; }, clearTimeout() {}, reportWeChatEntry() {},
    });
    Object.assign(readyRuntime, { isValid: true, _weChatPreparationId: 'original-3', _gameplayInitSeq: 1,
        _pchConveyorGameplayController: { isStartupInteractionReady: () => inputReady },
        clearLoadingStageTimers() {}, hideLoadingOverlay() { hidden++; }, reportWeChatRecoveryPlayable() { recovered++; } });
    readyRuntime.hideLoadingOverlayAfterGameplayReady();
    assert.equal(readySignals, 0); assert.equal(hidden, 0);
    assert.equal(readyApp.session.weChatEntryVigorCharged, true);
    inputReady = true; readyTimer();
    assert.equal(readySignals, 1); assert.equal(readyApp.session.weChatEntryVigorCharged, true);
    rendered(); assert.equal(readyApp.session.weChatEntryVigorCharged, false); assert.equal(recovered, 1);
    readyRuntime._weChatEntryRecoveryPending = true;
    readyRuntime.hideLoadingOverlayAfterGameplayReady(); assert.equal(readySignals, 1, 'failed round must reject delayed ready');

    let homeRequests = 0, retargets = 0, recoveryEvents = [];
    const homeApp = { session: { setPendingHomeToast() {} }, redirectFailedGameplayTransitionToHome() { retargets++; },
        requestHomeRoute: async () => { homeRequests++; } };
    let wechat = true;
    const recovery = methods('GameCtrlModules/SceneHomeEntryModule.ts', ['recoverWeChatFailedEntry'], {
        isMiniGameRuntime: () => wechat && recoveryPlatform.isMiniGameRuntime(), isWorkbenchPreviewRequested: () => false,
        AppRoot: { tryGet: () => homeApp }, reportWeChatEntry: (...args) => recoveryEvents.push(args),
    });
    Object.assign(recovery, { isValid: true, getRuntimeSceneName: () => 'Game', unschedule() {}, refundWeChatEntryVigor() {} });
    assert.equal(recovery.recoverWeChatFailedEntry('model_failed', 'invalid original model'), true);
    assert.equal(recovery.recoverWeChatFailedEntry('model_failed', 'duplicate callback'), true);
    assert.equal(homeRequests, 1); assert.equal(retargets, 1);
    assert.equal(recoveryEvents[0][1], 'gameplay_entry_recovery_failed');
    wechat = false;
    assert.equal(recovery.recoverWeChatFailedEntry('model_failed', 'other platform'), false);
    wechat = true; recovery.getRuntimeSceneName = () => 'Home';
    assert.equal(recovery.recoverWeChatFailedEntry('home_failed', 'must not reload home recursively'), false);
    console.log('PASS WeChat preparation: same-level retries, timeout/late callbacks, cache retry, cancellation, telemetry isolation, settlement preservation and compensation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
