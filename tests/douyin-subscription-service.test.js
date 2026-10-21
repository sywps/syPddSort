'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert'), ts = require('typescript');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('assets/Scripts/Platform/Douyin/DouyinSubscriptionService.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
vm.runInNewContext(code, { module: mod, exports: mod.exports, setTimeout, clearTimeout });
const { DouyinSubscriptionService, canUseDouyinSubscription } = mod.exports;
function harness() {
    const timers = new Map(), results = [], calls = [];
    const service = new DouyinSubscriptionService({
        setTimeout: fn => { const id = {}; timers.set(id, fn); return id; },
        clearTimeout: id => timers.delete(id),
    });
    const runtime = { getSystemInfoSync: () => ({ appName: 'Douyin', platform: 'ios' }),
        canIUse: () => true, requestSubscribeMessage: options => calls.push(options) };
    const start = (templateId = 'MSG_test_fixture') => service.start({ runtime, templateId, onComplete: r => results.push(r) });
    return { timers, results, calls, runtime, start };
}
for (const [value, expected] of [['accept', 'accepted'], ['reject', 'declined'], ['ban', 'blocked'], ['fail', 'failed'], [undefined, 'failed']]) {
    const h = harness();
    assert.equal(h.start().started, true);
    assert.equal(h.calls.length, 1, 'native request must run synchronously before returning');
    assert.equal(h.calls[0].tmplIds.length, 1);
    assert.equal(h.start().reason, 'busy');
    h.calls[0].success({ MSG_test_fixture: value });
    h.calls[0].fail({ errNo: 21103 });
    h.calls[0].success({ MSG_test_fixture: 'accept' });
    assert.equal(h.results.length, 1, 'duplicate native callbacks must settle once');
    assert.equal(h.results[0].status, expected);
    assert.equal(h.timers.size, 0);
}
for (const change of [
    h => h.runtime.getSystemInfoSync = () => ({ appName: 'Douyin', platform: 'openHarmony' }),
    h => h.runtime.getSystemInfoSync = () => ({ appName: 'douyin_lite', platform: 'android' }),
    h => h.runtime.getSystemInfoSync = () => { throw Error('device query failed'); },
    h => h.runtime.canIUse = () => false,
    h => delete h.runtime.requestSubscribeMessage,
]) {
    const h = harness(); change(h);
    assert.equal(canUseDouyinSubscription(h.runtime), false);
    assert.equal(h.start().reason, 'unsupported');
    assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
}
for (const id of ['', '13715', 'MSG', ' MSG_test_fixture', undefined]) {
    const h = harness();
    const result = id === undefined ? h.start(null) : h.start(id);
    assert.equal(result.reason, 'unconfigured'); assert.equal(h.calls.length, 0);
}
for (const [error, status] of [[{ errNo: 21105 }, 'declined'], [{ errCode: 3001 }, 'declined'],
    [{ errNo: 21108 }, 'blocked'], [{ errNo: 21110 }, 'blocked'], [{ errNo: 10302 }, 'failed'],
    [{ errNo: 21103 }, 'failed'], [{ errNo: 21101 }, 'failed']]) {
    const h = harness(); h.start(); h.calls[0].fail(error);
    assert.equal(h.results[0].status, status);
}
{
    const h = harness(); h.start(); [...h.timers.values()][0]();
    assert.equal(h.results[0].status, 'timeout');
    h.start(); h.calls[0].success({ MSG_test_fixture: 'accept' });
    assert.equal(h.results.length, 1, 'late success must not change a new request');
    h.calls[1].success({ MSG_test_fixture: 'accept' });
    assert.equal(h.results[1].status, 'accepted'); assert.equal(h.timers.size, 0);
}
{
    const h = harness(); h.runtime.requestSubscribeMessage = () => { throw Error('native throw'); };
    h.start(); assert.equal(h.results[0].status, 'failed'); assert.equal(h.timers.size, 0);
}
console.log('PASS Douyin subscription service (native API mocks; no real template or delivery verified)');
