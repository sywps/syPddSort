const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'assets/Scripts/Core', file), 'utf8');
function compile(source, deps = {}, globals = {}) {
    const exports = {};
    const js = ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    } }).outputText;
    new Function('exports', 'require', ...Object.keys(globals), js)(exports, id => {
        assert.ok(id in deps, `unexpected dependency ${id}`);
        return deps[id];
    }, ...Object.values(globals));
    return exports;
}
function declaration(file, name) {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    let result;
    function visit(node) {
        if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText(ast) === name) result = node.getText(ast);
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(result, name);
    return result;
}
function harness(file, names, globals) {
    const { Harness } = compile(`export class Harness { ${names.map(n => declaration(file, n)).join('\n')} }`, {}, globals);
    return new Harness();
}
async function run() {
    let wechat = true;
    const platform = { isWeChatMiniGameRuntime: () => wechat, isMiniGameRuntime: () => true };
    const { ThirdLevelExperimentState } = compile(read('ThirdLevelExperiment.ts'), {
        './MiniGamePlatform': platform, 'cc/env': { PREVIEW: false },
    });
    const state = new ThirdLevelExperimentState();
    const forbiddenStorage = { getItem() { throw Error('must not read retired experiment'); }, setItem() { throw Error('must not overwrite historical assignment'); } };
    state.initialize(forbiddenStorage, true, null);
    state.accept('old-account', { content: 'C' });
    assert.equal(state.content(), 'A');
    assert.equal(state.fields().thirdLevelExperimentStatus, 'excluded');
    assert.equal(state.fields().thirdLevelExperimentBucket, '');
    assert.equal(state.fields().thirdLevelExperimentReason, 'experiment_retired');
    const gate = harness('AnalyticsMgr.ts', ['prepareThirdLevelExperiment'], {
        isWeChatMiniGameRuntime: () => wechat, isMiniGameRuntime: () => wechat,
        thirdLevelExperiment: { assertStorageReady() { throw Error('must not gate WeChat entry'); } },
    });
    await gate.prepareThirdLevelExperiment();
    const loader = harness('GameCtrlModules/AssetBootstrapModule.ts', ['_loadLevelDataFromConfiguredSource'], {
        isWeChatMiniGameRuntime: () => wechat, isMiniGameRuntime: () => wechat,
        isWorkbenchPreviewRequested: () => false,
        AnalyticsMgr: { inst: { prepareThirdLevelExperiment() { throw Error('retired request'); } } },
    });
    loader._loadPreparedLevelDataFromConfiguredSource = (id, prefix, cb, variant) => cb({ id, prefix, variant });
    assert.deepEqual(await new Promise(resolve => loader._loadLevelDataFromConfiguredSource(3, 'level_', resolve)), { id: 3, prefix: 'level_', variant: 'A' });
    wechat = false;
    const receipt = { id: 'third_level_abc_v1', status: 'enrolled', content: 'C', enrolledAt: 12, reason: '', openid: 'other-platform' };
    state.initialize({ getItem: () => JSON.stringify(receipt), setItem() {} }, true, null);
    assert.equal(state.content(), 'C', 'other platform experiment unchanged');

    wechat = true;
    let ready, failed, modals = 0, restarts = 0, bindingThrows = false;
    const updateEvents = [];
    const wx = { getUpdateManager() {
        if (bindingThrows) throw Error('getUpdateManager failed');
        return { onUpdateReady(fn) { ready = fn; }, onUpdateFailed(fn) { failed = fn; }, applyUpdate() { restarts++; } };
    }, showModal() { modals++; } };
    function bindUpdate() {
        return compile(`let weChatUpdateManagerBound=false; export ${declaration('GameSceneRuntimeController.ts', 'bindWeChatUpdateManagerOnce')}`, {}, {
            isWeChatMiniGameRuntime: () => wechat, getWeChatMiniGameRuntime: () => wx,
            AnalyticsMgr: { inst: { trackFunnelEvent: event => updateEvents.push(event) } },
            console: { error() {}, warn() {} },
        }).bindWeChatUpdateManagerOnce;
    }
    const bind = bindUpdate(); bind(); ready(); failed();
    assert.equal(modals, 0); assert.equal(restarts, 0);
    assert.ok(updateEvents.some(e => e.eventName === 'wechat_update_failed' && !e.success));
    bindingThrows = true; assert.doesNotThrow(() => bindUpdate()());
    assert.ok(updateEvents.some(e => e.eventName === 'wechat_update_bind_failed'));

    let timer, prefabCallback, routeCalls = 0, instantiated = 0;
    const transitionEvents = [];
    const app = harness('AppRoot.ts', ['ensureAppTransition', 'runAppTransition', 'isAppTransitionTargeting', 'completeAppTransitionAfterDraw'], {
        isWeChatMiniGameRuntime: () => wechat, isMiniGameRuntime: () => wechat,
        setTimeout: cb => { timer = cb; return 1; }, clearTimeout() {},
        APP_TRANSITION_BUNDLE_NAME: 'gameAssets', APP_TRANSITION_PREFAB_PATH: 'transition', Prefab: class {},
        assetManager: { getBundle: () => ({ load(_path, _type, cb) { prefabCallback = cb; } }) },
        instantiate() { instantiated++; throw Error('late resource must not instantiate'); },
        AnalyticsMgr: { inst: { trackFunnelEvent: e => transitionEvents.push(e) } },
        console: { warn() {} },
    });
    const route = async () => { routeCalls++; };
    const transition = app.runAppTransition('same', 'Game', 'forward', route);
    assert.equal(app.runAppTransition('same', 'Game', 'forward', route), transition, 'duplicate requests share one original route');
    await assert.rejects(app.runAppTransition('other', 'Home', 'reverse', route), /in flight/);
    timer();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(routeCalls, 1);
    assert.equal(app.isAppTransitionTargeting('Game'), true);
    assert.equal(app.completeAppTransitionAfterDraw('Home'), false, 'wrong scene cannot release the route');
    assert.equal(app.runAppTransition('same', 'Game', 'forward', route), transition, 'entry stays coalesced until actual gameplay readiness');
    assert.equal(app.completeAppTransitionAfterDraw('Game'), true);
    await transition;
    prefabCallback(null, {});
    assert.equal(instantiated, 0, 'late animation cannot cover playable game');
    assert.equal(routeCalls, 1);
    assert.ok(transitionEvents.some(e => e.eventName === 'app_transition_asset_failed' && !e.success));
    app.ensureAppTransition = async () => ({ run: async (_key, _scene, _dir, task) => task() });
    const brokenRoute = async () => { routeCalls++; throw Error('original route failed'); };
    await assert.rejects(app.runAppTransition('broken', 'Game', 'forward', brokenRoute), /original route failed/);
    assert.equal(routeCalls, 2, 'a route error is never retried as if only the animation had failed');
    wechat = false;
    app.ensureAppTransition = async () => { throw Error('other platform asset failure'); };
    await assert.rejects(app.runAppTransition('other-platform', 'Game', 'forward', route), /other platform asset failure/);
    assert.equal(routeCalls, 2, 'other platform retains original transition behavior');
    wechat = true;

    let baseUrl = 'https://cdn.example/wechat-a/';
    let online = true, remoteText = null, writesFail = false, telemetryThrows = false;
    const disk = new Map(), events = [], requests = [];
    const level = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData/level_3.json'), 'utf8'));
    const manifest = { manifestVersion: 1, dataVersion: 'test-v1', schemaVersion: 3, minClientBuild: 3, levelCount: 1,
        packs: [{ id: 'main', prefix: 'level_', url: 'main.json', hash: 'hash-v1', levelRange: [3, 3], levelCount: 1 }] };
    const pack = { id: 'main', prefix: 'level_', schemaVersion: 3, levelRange: [3, 3], levels: [{ levelId: 3, data: level }] };
    const cdn = {
        canUseCdn: () => true, normalizeCdnBaseUrl: value => value,
        isLocalBrowserCdnOptIn: () => false, getCdnUnavailableReason: () => '',
        getCdnPlatformRequester: () => function request() {}, isBrowserBackedRequester: () => false,
        joinCdnUrl: (base, file) => base + file, withCdnQuery: (url, key, value) => `${url}?${key}=${value}`,
        parseJsonText: text => JSON.parse(text),
        readCdnStorageObject: key => disk.has(key) ? JSON.parse(disk.get(key)) : null,
        writeCdnStorageObject: (key, value) => { if (!writesFail) disk.set(key, JSON.stringify(value)); },
        requestCdnText: async url => {
            requests.push(url); if (!online) throw Error('network unavailable');
            return url.includes('level_live.json') ? (remoteText ?? JSON.stringify(manifest)) : JSON.stringify(pack);
        },
    };
    const { LevelDataCdnService } = compile(read('LevelDataCdnService.ts'), {
        './LevelConfig': compile(read('LevelConfig.ts')),
        './LevelExperimentService': { resolveFrontLevelExperimentContext: () => null, getFrontLevelExperimentDiagnostics: () => ({}) },
        './MiniGamePlatform': { ...platform, getMiniGameBuildPlatform: () => wechat ? 'wechat' : 'douyin', isDouyinMiniGameRuntime: () => !wechat },
        './RemoteDataCdnClient': cdn, './RuntimeLog': { runtimeWarn() {} }, './StartupTrace': { recordStartupDiagnostic() {} },
        './AnalyticsMgr': { AnalyticsMgr: { inst: { trackFunnelEvent: e => { if (telemetryThrows) throw Error('analytics unavailable'); events.push(e); } } } },
    }, { globalThis: { get __PDD_LEVEL_DATA_CDN_URL__() { return baseUrl; } }, setTimeout: fn => { fn(); return 1; } });
    const first = new LevelDataCdnService();
    assert.deepEqual(await first.loadLevel(3), level);
    online = false; requests.length = 0;
    const restarted = new LevelDataCdnService();
    assert.deepEqual(await restarted.loadLevel(3), level, 'cold-start outage loads the exact previously validated original level');
    assert.equal(requests.length, 1, 'cached pack needs no second download');
    assert.ok(events.some(e => e.eventName === 'level_manifest_request_failed' && !e.success));
    assert.ok(events.some(e => e.eventName === 'level_manifest_cache_restored' && e.success));
    baseUrl = 'https://cdn.example/wechat-b/';
    assert.equal(await new LevelDataCdnService().loadLevel(3), null, 'never borrow another CDN slot manifest');
    baseUrl = 'https://cdn.example/wechat-a/';
    wechat = false;
    assert.equal(await new LevelDataCdnService().loadLevel(3), null, 'Douyin does not use WeChat manifest recovery');
    online = true;
    assert.deepEqual(await new LevelDataCdnService().loadLevel(3), level);
    online = false;
    assert.deepEqual(await new LevelDataCdnService().loadLevel(3), level, 'Douyin restores its own validated original level after restart');
    wechat = true;
    const key = [...disk.keys()].find(k => k.includes('levelManifestCache'));
    disk.set(key, JSON.stringify({ text: '{bad json' }));
    assert.equal(await new LevelDataCdnService().loadLevel(3), null, 'corrupt manifest must not become success');
    assert.ok(events.some(e => e.eventName === 'level_manifest_cache_invalid' && !e.success));
    disk.set(key, JSON.stringify({ text: JSON.stringify({ ...manifest, minClientBuild: 999 }) }));
    assert.equal(await new LevelDataCdnService().loadLevel(3), null, 'incompatible cache must remain rejected');
    online = true; remoteText = null;
    assert.deepEqual(await new LevelDataCdnService().loadLevel(3), level, 'network recovery replaces bad cache');
    const packKey = [...disk.keys()].find(k => k.includes('levelPackCache'));
    const storedPacks = JSON.parse(disk.get(packKey));
    for (const record of Object.values(storedPacks.records)) record.text = '{invalid pack';
    disk.set(packKey, JSON.stringify(storedPacks));
    assert.deepEqual(await new LevelDataCdnService().loadLevel(3), level, 'invalid cached pack is refetched before play');
    assert.ok(events.some(e => e.eventName === 'level_pack_cache_invalid' && !e.success));
    disk.delete(key); writesFail = true;
    assert.deepEqual(await new LevelDataCdnService().loadLevel(3), level, 'cache write failure does not discard valid original network data');
    assert.ok(events.some(e => e.eventName === 'level_manifest_cache_write_failed' && !e.success));
    writesFail = false;
    await new LevelDataCdnService().loadLevel(3);
    online = false; telemetryThrows = true;
    assert.deepEqual(await new LevelDataCdnService().loadLevel(3), level, 'analytics failure must not break original-level cache recovery');
    console.log('WeChat original game: retired third-level gate, original content, update safety, transition timeout/late callbacks, exact-level cache recovery, isolation and telemetry passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
