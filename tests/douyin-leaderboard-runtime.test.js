const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

function load(file, dependencies, globals = {}) {
    const exports = {};
    const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5,
            experimentalDecorators: true, downlevelIteration: false, ignoreDeprecations: '6.0' }, reportDiagnostics: true,
    });
    assert.deepStrictEqual(result.diagnostics, []);
    vm.runInNewContext(result.outputText, { exports, console, setTimeout, clearTimeout,
        require: id => dependencies[id] || {}, ...globals });
    return exports;
}

function harness(mode = 'release') {
    const calls = [], timers = new Map(), controls = {};
    let timerId = 0;
    const tt = {};
    for (const method of ['login', 'setImRankData', 'getImRankList']) {
        tt[method] = options => {
            calls.push({ method, options });
            if (controls[method]) controls[method](options);
            else options.success({ errMsg: method + ':ok' });
        };
    }
    const { DouyinLeaderboardService } = load('assets/Scripts/Platform/Douyin/DouyinLeaderboardService.ts', {
        '../../Core/MiniGamePlatform': { getDouyinMiniGameRuntime: () => tt, getMiniGameBuildMode: () => mode },
    }, { setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) });
    return { service: new DouyinLeaderboardService(), calls, tt, controls, timers };
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

async function main() {
    let h = harness();
    await h.service.open(11);
    assert.deepStrictEqual(h.calls.map(x => x.method), ['login', 'setImRankData', 'getImRankList']);
    assert.strictEqual(h.calls[1].options.value, '10', 'rank uses cleared count, not next level');
    const options = h.calls[2].options;
    assert.deepStrictEqual([options.rankType, options.relationType, options.dataType, options.suffix, options.zoneId],
        ['all', 'default', 0, '关', 'default']);
    await h.service.open(11);
    assert.strictEqual(h.calls.filter(x => x.method === 'setImRankData').length, 1, 'same score preserves tie-break time');
    assert.strictEqual(h.timers.size, 0);

    h = harness('debug');
    await h.service.open(1);
    assert.deepStrictEqual(h.calls.map(x => x.method), ['login', 'getImRankList'], 'starter must not reset platform record');
    assert.strictEqual(h.calls[1].options.zoneId, 'test');
    await h.service.submitProgress(3);
    assert.strictEqual(h.calls.at(-1).options.zoneId, 'test');
    for (const progress of [0, -2, NaN, 2.5, 2147483648]) {
        await assert.rejects(h.service.submitProgress(progress), /invalid mainline progress/);
    }

    h = harness();
    let login;
    h.controls.login = options => { login = options; };
    const first = h.service.open(4);
    assert.strictEqual(h.service.open(4), first, 'repeated clicks share one request');
    await flush();
    assert.deepStrictEqual(h.calls.map(x => x.method), ['login']);
    login.success({}); await first;
    delete h.controls.login;
    await Promise.all([h.service.submitProgress(9), h.service.submitProgress(6), h.service.submitProgress(12)]);
    assert.deepStrictEqual(h.calls.filter(x => x.method === 'setImRankData').map(x => x.options.value), ['3', '8', '11']);

    for (const failedMethod of ['login', 'setImRankData', 'getImRankList']) {
        h = harness();
        h.controls[failedMethod] = options => options.fail({ errMsg: 'test rejection' });
        await assert.rejects(h.service.open(6), /test rejection/);
        assert.strictEqual(h.calls.at(-1).method, failedMethod, 'failure stops subsequent stages');
        delete h.controls[failedMethod];
        await h.service.open(6);
        assert.strictEqual(h.calls.at(-1).method, 'getImRankList', 'explicit retry works after failure');
    }

    h = harness();
    h.controls.login = options => { login = options; };
    const timedOut = h.service.open(8);
    const rejected = assert.rejects(timedOut, /timed out/);
    await flush();
    Array.from(h.timers.values())[0]();
    await rejected;
    login.success({}); await flush();
    assert.deepStrictEqual(h.calls.map(x => x.method), ['login'], 'late login cannot upload or open a timed-out attempt');
    h = harness(); delete h.tt.getImRankList;
    await assert.rejects(h.service.open(8), /unavailable/);
    assert.strictEqual(h.calls.length, 0);

    // Exercise actual home click routing and manager upload routing with platform mocks.
    let platform = 'douyin', opened = 0, legacy = 0, uploaded = 0, cloud = 0, event;
    const native = { inst: { open: async level => { assert.strictEqual(level, 17); opened++; },
        submitProgress: async level => { assert.strictEqual(level, 17); uploaded++; } } };
    const button = { active: false, targetOff() {}, getComponent() { return {}; }, on(type, fn) { event = fn; } };
    const { installSceneHomeEntryModule } = load('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts', {
        '../MiniGamePlatform': { getMiniGameBuildPlatform: () => platform },
        '../../Platform/Douyin/DouyinLeaderboardService': { DouyinLeaderboardService: native },
        '../GameCtrlShared': { Button: { EventType: { CLICK: 'click' } }, AudioMgr: { inst: { play() {} } } },
    });
    const runtime = { requireUiChild: () => button, requireSceneSpriteFrame() {}, getSavedLevel: () => 17,
        openLeaderboard: () => legacy++, mainMenuNode: { isValid: true }, showToast() {} };
    installSceneHomeEntryModule(runtime);
    runtime.drawLeaderboardButton({});
    assert.strictEqual(button.active, true); event(); await flush();
    assert.strictEqual(opened, 1); assert.strictEqual(legacy, 0);
    platform = 'wechat'; runtime.drawLeaderboardButton({}); event(); await flush();
    assert.strictEqual(legacy, 1); assert.strictEqual(opened, 1);

    const { LeaderboardMgr } = load('assets/Scripts/Core/LeaderboardMgr.ts', {
        cc: { _decorator: { ccclass: () => type => type } },
        './MiniGamePlatform': { isDouyinMiniGameRuntime: () => platform === 'douyin' },
        '../Platform/Douyin/DouyinLeaderboardService': { DouyinLeaderboardService: native },
        './ProfileCustomizationMgr': { ProfileCustomizationMgr: { inst: { display: p => p } } },
    });
    const manager = new LeaderboardMgr();
    manager.init = async () => { cloud++; return false; };
    manager.canUseFriendCloudStorage = () => false;
    manager.upsertLocalEntry = () => {};
    manager.buildProfileFingerprint = () => 'profile';
    platform = 'douyin'; await manager.submitProgress(17, {});
    assert.strictEqual(uploaded, 1); assert.strictEqual(cloud, 0);
    platform = 'wechat'; await manager.submitProgress(17, {});
    assert.strictEqual(uploaded, 1); assert.strictEqual(cloud, 1);
    console.log('douyin-leaderboard-runtime.test.js passed (native API mocks; no real platform requests)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
