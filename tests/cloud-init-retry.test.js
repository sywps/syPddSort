const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cc = { _decorator: { ccclass: () => type => type } };
function load(name, dependencies) {
    const exports = {};
    const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core', name + '.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
    } }).outputText;
    new Function('exports', 'require', 'console', js)(exports, id => {
        assert.ok(id in dependencies, 'unmocked dependency: ' + id);
        return dependencies[id];
    }, { warn() {} });
    return exports[name];
}
function cloudHarness() {
    let failure = true, available = true, initializations = 0, requests = 0;
    const runtime = { cloud: {
        init() { initializations++; if (failure) throw Error('initialization failed'); },
        async callFunction() { requests++; return { result: { ok: true } }; },
    } };
    const Cloud = load('WxCloudMgr', { cc, './WeChatDeviceInfo': {}, './MiniGamePlatform': {
        isWeChatMiniGameRuntime: () => available, getWeChatMiniGameRuntime: () => runtime,
    } });
    return { cloud: Cloud.inst, recover() { failure = false; }, available(value) { available = value; },
        counts: () => ({ initializations, requests }) };
}

test('failed initialization can retry; business requests are neither run during failure nor replayed', async () => {
    const h = cloudHarness();
    await assert.rejects(h.cloud.callFunction('syncUserState'), /not ready/);
    assert.deepEqual(h.counts(), { initializations: 1, requests: 0 });
    h.recover(); assert.deepEqual(await h.cloud.callFunction('syncUserState'), { ok: true });
    assert.deepEqual(h.counts(), { initializations: 2, requests: 1 });
    assert.equal(await h.cloud.init(), true);
    assert.deepEqual(h.counts(), { initializations: 2, requests: 1 });
});

test('concurrent failed and successful initialization batches each share one attempt', async () => {
    const h = cloudHarness();
    assert.deepEqual(await Promise.all([h.cloud.init(), h.cloud.init(), h.cloud.init()]), [false, false, false]);
    assert.equal(h.counts().initializations, 1);
    h.recover();
    assert.deepEqual(await Promise.all([h.cloud.init(), h.cloud.init(), h.cloud.init()]), [true, true, true]);
    assert.equal(h.counts().initializations, 2);
});

test('unavailable platform does not poison subsequent cloud initialization', async () => {
    const h = cloudHarness(); h.available(false);
    assert.equal(await h.cloud.init(), false); assert.equal(h.counts().initializations, 0);
    h.available(true); h.recover(); assert.equal(await h.cloud.init(), true);
});

for (const failure of ['false', 'reject', 'throw']) {
    test(`leaderboard retries ${failure} initialization and shares/cache successful initialization`, async () => {
        let calls = 0, recovered = false, finish;
        const Leaderboard = load('LeaderboardMgr', {
            cc, './WeChatDeviceInfo': {}, './MiniGamePlatform': {}, './ProfileCustomizationMgr': {}, './RuntimeLog': {},
            '../Platform/Douyin/DouyinLeaderboardService': {}, './PlatformCloudMgr': { PlatformCloudMgr: { inst: {
                init() {
                    calls++;
                    if (recovered) return new Promise(resolve => { finish = resolve; });
                    if (failure === 'throw') throw Error('initialization failed');
                    return failure === 'reject' ? Promise.reject(Error('initialization failed')) : Promise.resolve(false);
                },
            } } },
        });
        const rank = Leaderboard.inst;
        assert.deepEqual(await Promise.all([rank.init(), rank.init()]), [false, false]);
        assert.equal(calls, 1);
        recovered = true;
        rank.enableCloudInit(); const pending = rank.init();
        await Promise.resolve(); assert.equal(calls, 2); finish(true);
        assert.equal(await pending, true); assert.equal(await rank.init(), true);
        rank.enableCloudInit(); await Promise.resolve(); assert.equal(calls, 2);
    });
}
