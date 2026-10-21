const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

function load(relPath, imports = {}) {
    const module = { exports: {} };
    const source = fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
    vm.runInNewContext(compiled, {
        module, exports: module.exports, require: id => imports[id] || {},
        console, setTimeout, clearTimeout,
    }, { filename: relPath });
    return module.exports;
}

const serviceExports = load('assets/Scripts/Platform/Douyin/DouyinShareService.ts');
const { DouyinShareService, isDouyinShareCancelled } = serviceExports;

function fixture() {
    let clock = 0;
    let payload;
    const timers = new Map();
    const results = [];
    let nextTimer = 0;
    const service = new DouyinShareService({
        now: () => clock,
        setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
        clearTimeout: id => timers.delete(id),
    });
    const request = {
        runtime: { shareAppMessage(options) { payload = options; } },
        payload: { title: '邀请好友', query: 'level=6', imageUrl: 'wechat-only', imageUrlId: 'wechat-only' },
        onComplete: result => results.push(result),
    };
    return { service, request, timers, results, getPayload: () => payload, setClock: value => { clock = value; } };
}

for (const scenario of ['success', 'cancel-code', 'cancel-message', 'failure', 'timeout', 'scene-cancel']) {
    const f = fixture();
    const start = f.service.start(f.request);
    assert.strictEqual(start.started, true);
    assert.strictEqual(start.handle.isActive(), true);
    assert.strictEqual(f.results.length, 0, 'dispatch alone must not qualify');
    const payload = f.getPayload();
    assert.strictEqual(payload.channel, 'invite');
    assert.strictEqual(payload.title, '邀请好友');
    assert.strictEqual(payload.query, 'level=6');
    assert.strictEqual(payload.imageUrl, undefined);
    assert.strictEqual(payload.imageUrlId, undefined);
    assert.strictEqual(payload.templateId, undefined, 'use configured Douyin material, never invent a template ID');
    assert.strictEqual(f.service.start(f.request).reason, 'busy');
    f.setClock(2000);
    if (scenario === 'success') payload.success();
    if (scenario === 'cancel-code') payload.fail({ errNo: 10502 });
    if (scenario === 'cancel-message') payload.fail({ errMsg: 'shareAppMessage:fail cancel' });
    if (scenario === 'failure') payload.fail({ errNo: 10103, errMsg: 'network unavailable' });
    if (scenario === 'timeout') {
        f.setClock(30000);
        const timer = [...f.timers.values()][0];
        assert.strictEqual(timer.delay, 30000);
        timer.callback();
    }
    if (scenario === 'scene-cancel') assert.strictEqual(start.handle.cancel('scene-destroy:gameplay'), true);
    const expected = { success: 'qualified', 'cancel-code': 'cancelled', 'cancel-message': 'cancelled',
        failure: 'failed', timeout: 'timeout', 'scene-cancel': 'cancelled' }[scenario];
    assert.strictEqual(f.results[0].status, expected);
    assert.strictEqual(f.results[0].elapsedMs, scenario === 'timeout' ? 30000 : 2000);
    assert.strictEqual(start.handle.isActive(), false);
    assert.strictEqual(f.timers.size, 0);
    assert.strictEqual(start.handle.cancel(), false);
    const next = f.service.start(f.request);
    assert.strictEqual(next.started, true, 'completion must release the next request');
    payload.success();
    payload.fail({ errMsg: 'late failure' });
    assert.strictEqual(f.results.length, 1, 'old callbacks cannot settle the next request');
    assert.strictEqual(next.handle.isActive(), true);
    next.handle.cancel();
}

{
    const f = fixture();
    assert.strictEqual(f.service.start({ ...f.request, runtime: {} }).reason, 'unavailable');
    const failed = f.service.start({ ...f.request, runtime: { shareAppMessage() { throw new Error('dispatch failed'); } } });
    assert.strictEqual(failed.reason, 'dispatch_failed');
    assert.strictEqual(f.results.length, 0);
    assert.strictEqual(f.timers.size, 0);
    const sync = f.service.start({ ...f.request, runtime: { shareAppMessage(options) { options.success(); } } });
    assert.strictEqual(sync.started, true);
    assert.strictEqual(sync.handle.isActive(), false);
    assert.strictEqual(f.results[0].status, 'qualified');
    assert.strictEqual(f.timers.size, 0);
}
assert.strictEqual(isDouyinShareCancelled({ errMsg: 'permission denied' }), false);

// Both main-level and theme-level ordinary share buttons must open a friend card.
for (const moduleName of ['GameplayShareLoadingModule', 'ThemeLoadingOverlayModule']) {
    const events = [];
    let payload;
    const exports = load(`assets/Scripts/Core/GameCtrlModules/${moduleName}.ts`, {
        '../GameCtrlShared': { AnalyticsMgr: { inst: {
            trackShareClick: () => events.push('click'), trackShareSuccess: () => events.push('success'),
        } } },
        '../MiniGamePlatform': { getDouyinMiniGameRuntime: () => ({ shareAppMessage: options => { payload = options; } }) },
        '../../Platform/Douyin/DouyinShareService': serviceExports,
    });
    const runtime = { getWeChatRuntime: () => null, getActiveLogicalLevelId: () => 6, showToast: text => events.push(text) };
    exports[`install${moduleName}`](runtime);
    runtime.shareCurrentWinLevel();
    assert.strictEqual(payload.channel, 'invite');
    assert.strictEqual(payload.query, 'level=6');
    assert.deepStrictEqual(events, ['click']);
    payload.success();
    assert.deepStrictEqual(events.slice(-2), ['success', '分享成功']);
    runtime.shareCurrentWinLevel();
    payload.fail({ errNo: 10502 });
    assert.strictEqual(events.at(-1), '分享已取消');
    runtime.shareCurrentWinLevel();
    payload.fail({ errNo: 10103, errMsg: 'network unavailable' });
    assert.strictEqual(events.at(-1), '分享失败');
}
console.log('douyin-share-service.test.js passed');
