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
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, name => {
    if (name === 'cc') return { JsonAsset: class {}, sys };
    if (name.endsWith('/CoopModeConfig')) return config;
    if (name.endsWith('/PvpHumanReplay')) return replay;
    if (name.endsWith('/PvpBotReplay')) return { pixelLevelHash };
    if (name.endsWith('/PlatformCloudMgr')) return { PlatformCloudMgr: { inst: { getPlatform: () => 'none' } } };
    if (name.endsWith('/MiniGamePlatform')) return { getWeChatMiniGameRuntime: () => null, isMiniGameRuntime: () => miniGame };
    if (name.endsWith('/RemoteDataCdnClient')) return { isLocalBrowserPreview: () => localPreview };
    if (name.endsWith('/WeChatShareReturnService')) return {};
    if (name.endsWith('/UserMgr')) return {};
    throw new Error(`Unexpected client dependency ${name}`);
});
const full = require('../cloudfunctions/coopService/levels/coop_level_7.json');
const post = { id: 'a'.repeat(24), levelId: 7, levelHash: pixelLevelHash(full), creatorDone: false };
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
    assert.equal(pixelLevelHash(actual), post.levelHash, 'moved level preserves active cloud sessions');
    runtime._loadLevelDataFromConfiguredSource = (_id, _prefix, callback) => callback(null, 'level_data_cdn', new Error('CDN missing'));
    await assert.rejects(loader.fullLevel(runtime, 8), /CDN missing/, 'missing shared source must fail explicitly');
    const mgr = new loaded.exports.CoopServiceMgr();
    await assert.rejects(mgr.overview(), /需要微信云服务/, 'no fake offline rewards');
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
        let request;
        global.fetch = async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ ok: true, overview: {} }) }; };
        await simulator.overview();
        assert.equal(request.body.player, 'A');
        simulator.switchLocalPlayer(); await simulator.overview();
        assert.equal(request.body.player, 'B');
        simulator.share({ ...post, creatorDone: true });
        assert.equal(simulator.localInvitation(), post.id);
        simulator.active = {}; assert.throws(() => simulator.switchLocalPlayer(), /退出/); simulator.active = null;
        global.fetch = async () => { throw new Error('offline'); };
        await assert.rejects(simulator.overview(), /npm run coop:local/);
        miniGame = true;
        assert.equal(simulator.isLocalSimulation(), false, 'mini-game builds never route to simulator');
        await assert.rejects(simulator.overview(), /微信云服务/);
    } finally { global.fetch = originalFetch; localPreview = false; miniGame = false; }
    console.log('COOP_CLIENT_TESTS_PASSED: no progress writes, fresh re-entry, completion retry and version checks');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
