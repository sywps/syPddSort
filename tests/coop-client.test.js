'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const { pixelLevelHash } = require('../cloudfunctions/coopService/runtime/PvpBotReplay');
const replay = require('../cloudfunctions/coopService/runtime/PvpHumanReplay');
const config = require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const local = new Map();
const sys = { localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value), removeItem: key => local.delete(key) } };
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/CoopServiceMgr.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
let localPreview = false;
let miniGame = false;
let cloudPlatform = 'none';
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, function resolveDependency(name) {
    if (name.endsWith('/CoopBrowserRuntime') || name.endsWith('/CoopBrowserStore')) {
        const module = { exports: {} };
        const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core', name.split('/').pop() + '.ts'), 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText;
        new Function('module', 'exports', 'require', code)(module, module.exports, resolveDependency);
        return module.exports;
    }
    if (name === 'cc') return { JsonAsset: class {}, sys };
    if (name.endsWith('/CoopModeConfig')) return config;
    if (name.endsWith('/PvpHumanReplay')) return replay;
    if (name.endsWith('/PvpBotReplay')) return { pixelLevelHash };
    if (name.endsWith('/PlatformCloudMgr')) return { PlatformCloudMgr: { inst: { getPlatform: () => cloudPlatform } } };
    if (name.endsWith('/MiniGamePlatform')) return { getWeChatMiniGameRuntime: () => null, isMiniGameRuntime: () => miniGame };
    if (name.endsWith('/RemoteDataCdnClient')) return { isLocalBrowserPreview: () => localPreview };
    if (name.endsWith('/WeChatShareReturnService')) return {};
    if (name.endsWith('/UserMgr')) return {};
    throw new Error(`Unexpected client dependency ${name}`);
});
const full = require('../cloudfunctions/coopService/levels/coop_level_7.json');
const post = { id: 'a'.repeat(24), levelId: 7, levelHash: config.coopLevelHash(full), creatorDone: false };
const run = { id: 'b'.repeat(40), postId: post.id, role: 'creator', version: 0, status: 'playing', elapsedMs: 0, checkpoint: null };

async function main() {
    const loader = new loaded.exports.CoopServiceMgr();
    const runtime = {
        _withGameAssetsBundle(callback) { callback({ load(name, _type, done) {
            assert.equal(name, 'coop-manifest');
            done(null, { json: require('../assets/GameAssetsBundle/coop-manifest.json') });
        } }); },
        _loadLevelDataFromConfiguredSource(id, prefix, callback) {
            assert.equal(prefix, 'coop_level_');
            callback(require(`../assets/LevelData/coop_level_${id}.json`), 'level_data_bundle');
        },
    };
    const actual = await loader.fullLevel(runtime, 7);
    assert.equal(config.coopLevelHash(actual), post.levelHash, 'client and cloud use the same cooperation hash');
    runtime._loadLevelDataFromConfiguredSource = (_id, _prefix, callback) => callback(null, 'level_data_cdn', new Error('CDN missing'));
    await assert.rejects(loader.fullLevel(runtime, 8), /CDN missing/, 'missing shared source must fail explicitly');
    cloudPlatform = 'wechat';
    const cloudLoader = new loaded.exports.CoopServiceMgr();
    cloudLoader.call = async (action, data) => {
        assert.equal(action, 'level'); assert.equal(data.levelId, 7);
        return { level: full, levelHash: config.coopLevelHash(full) };
    };
    assert.deepEqual(await cloudLoader.fullLevel(runtime, 7), full, 'WeChat loads the authoritative cloud level even when CDN is stale');
    const invalidLoader = new loaded.exports.CoopServiceMgr();
    invalidLoader.call = async () => ({ level: full, levelHash: 'incorrect' });
    await assert.rejects(invalidLoader.fullLevel(runtime, 7), /校验失败/);
    const failedLoader = new loaded.exports.CoopServiceMgr();
    failedLoader.call = async () => { throw new Error('cloud unavailable'); };
    await assert.rejects(failedLoader.fullLevel(runtime, 7), /cloud unavailable/, 'cloud errors never fall back to stale CDN data');
    cloudPlatform = 'none';
    const mgr = new loaded.exports.CoopServiceMgr();
    await assert.rejects(mgr.overview(), /需要微信云服务/, 'no fake offline rewards');
    mgr.isLocalSimulation = () => true;
    mgr.fullLevel = async () => full;
    await assert.rejects(mgr.prepare({}, { ...post, levelHash: 'bad' }, run), /版本不一致/);
    await mgr.prepare({}, post, run);
    assert.deepEqual(mgr.active.events, [[0, 0, 1]]);
    mgr.active.elapsedMs = 50; mgr.record(1, [0.2]);
    assert.equal(local.size, 0, 'gameplay never writes local storage');
    await assert.rejects(mgr.flushAll(), /只有完成/);
    const oldCheckpoint = mgr.active.replay.checkpoint();
    local.set(`coop-pending:${run.id}`, JSON.stringify({ version: 0, events: mgr.active.events }));
    await mgr.prepare({}, post, { ...run, checkpoint: oldCheckpoint, elapsedMs: 50 });
    assert.equal(mgr.active.elapsedMs, 0);
    assert.deepEqual(mgr.active.events, [[0, 0, 1]], 're-entry starts over instead of replaying old progress');
    assert.equal(local.size, 0, 'legacy local progress removed');
    const serverReplay = new replay.PvpHumanReplay(config.coopHalfLevel(full, 'creator'), config.COOP_MAX_ELAPSED_MS, true);
    mgr.active.events.forEach(event => serverReplay.apply(event));
    for (let i = 0; !serverReplay.board.isAllLocked() && i < 20; i++) {
        mgr.active.elapsedMs = i + 1; mgr.record(5, [0]); serverReplay.apply([i + 1, 5, 0]);
    }
    mgr.active.completed = true;
    let saved, first = true, calls = [];
    mgr.call = async (action, payload) => {
        assert.equal(action, 'complete'); calls.push(structuredClone(payload));
        if (!saved) {
            saved = { ...run, status: 'complete', version: 1, checkpoint: null, lastRequestId: payload.requestId };
        }
        if (first) { first = false; throw new Error('response lost'); }
        return { post, run: saved };
    };
    await assert.rejects(mgr.flush(), /response lost/);
    assert(mgr.active.error);
    await mgr.flush();
    assert.equal(calls[0].requestId, calls[1].requestId);
    assert.deepEqual(calls[0].events, calls[1].events);
    assert.equal(mgr.active.events.length, 0);
    assert.equal(mgr.active.error, '');
    await mgr.flushAll();
    assert.equal(calls.length, 2, 'confirmed completion does not resubmit');
    assert.equal(local.size, 0, 'completion retries also do not persist gameplay');
    await assert.rejects(mgr.prepare({}, post, saved), /已经完成/);
    const originalFetch = global.fetch;
    localPreview = true;
    try {
        const simulator = new loaded.exports.CoopServiceMgr();
        global.fetch = async () => { throw new Error('Network must not be used by browser cooperation'); };
        const lockDescriptor = Object.getOwnPropertyDescriptor(global.navigator, 'locks');
        Object.defineProperty(global.navigator, 'locks', { configurable: true, value: { request: async (_key, callback) => callback() } });
        try {
            runtime._loadLevelDataFromConfiguredSource = (id, _prefix, callback) => callback(require(`../assets/LevelData/coop_level_${id}.json`));
            await Promise.all([simulator.catalog(runtime), simulator.overview()]);
            for (let id = 1; id <= 10; id++) {
                assert.deepEqual(await simulator.fullLevel(runtime, 1000 + id),
                    require(`../cloudfunctions/coopService/legacy-levels/coop_level_${id}.json`),
                    'browser resolves preserved legacy patterns without network or Node require');
            }
            const created = await simulator.call('create', { levelId: 7 });
            simulator.switchLocalPlayer();
            assert.equal((await simulator.overview()).overview.activeCreated, null);
            await assert.rejects(simulator.call('join', { postId: created.post.id }), /还未完成/);
            simulator.localPlayer = 'A';
            for (const role of ['creator', 'collaborator']) {
                const current = role === 'creator' ? created : await simulator.call('join', { postId: created.post.id });
                const testReplay = new replay.PvpHumanReplay(config.coopHalfLevel(full, role), config.COOP_MAX_ELAPSED_MS, true);
                const events = [[0, 0, 1]]; testReplay.apply(events[0]);
                for (let i = 1; !testReplay.board.isAllLocked() && i < 100; i++) {
                    const event = [i, 5, 0]; events.push(event); testReplay.apply(event);
                }
                assert(testReplay.board.isAllLocked());
                const result = await simulator.call('complete', { postId: created.post.id, version: current.run.version, requestId: '1234567890abcdef', events });
                assert.equal(result.run.status, 'complete');
                if (role === 'creator') {
                    await simulator.call('publish', { postId: created.post.id, published: true });
                    simulator.switchLocalPlayer();
                    assert.equal((await simulator.call('square')).posts[0].id, created.post.id);
                }
            }
            const reloaded = new loaded.exports.CoopServiceMgr();
            await reloaded.catalog(runtime);
            const restored = (await reloaded.overview()).overview;
            assert.equal(restored.activeCreated, null);
            assert(Object.keys(restored.unlocked).length > 0, 'creator collection survives reload');
            reloaded.switchLocalPlayer();
            assert(Object.keys((await reloaded.overview()).overview.unlocked).length > 0, 'collaborator collection persists separately');
        } finally {
            if (lockDescriptor) Object.defineProperty(global.navigator, 'locks', lockDescriptor);
            else delete global.navigator.locks;
        }
        simulator.share({ ...post, creatorDone: true });
        assert.equal(simulator.localInvitation(), post.id);
        simulator.active = {}; assert.throws(() => simulator.switchLocalPlayer(), /退出/); simulator.active = null;
        miniGame = true;
        assert.equal(simulator.isLocalSimulation(), false, 'mini-game builds never route to simulator');
        await assert.rejects(simulator.overview(), /微信云服务/);
    } finally { global.fetch = originalFetch; localPreview = false; miniGame = false; }
    console.log('COOP_CLIENT_TESTS_PASSED: no progress writes, fresh re-entry, completion retry and version checks');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
