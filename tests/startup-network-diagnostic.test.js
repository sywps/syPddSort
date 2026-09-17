const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const host = { __PDD_STARTUP_DIAGNOSTIC__: true };
let now = 1000, calls = 0, behavior;
function load(file, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/' + file + '.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { module, exports: module.exports, globalThis: host, Date: { now: () => now }, console,
        require(id) { assert(id in dependencies, id); return dependencies[id]; } });
    return module.exports;
}
const trace = load('StartupTrace');
const api = { request(options) { calls++; return behavior(options); } };
const client = load('RemoteDataCdnClient', { './StartupTrace': trace, './MiniGamePlatform': {
    getWeChatMiniGameRuntime: () => api, getDouyinMiniGameRuntime: () => null,
    getMiniGameBuildPlatform: () => 'wechat', isMiniGameRuntime: () => true,
} });
(async () => {
    behavior = o => { now += 75; o.success({ statusCode: 200, data: '{"ok":true}' }); };
    assert.equal(await client.requestCdnText('https://example.test/pack.json?private=value', 1000), '{"ok":true}');
    assert.equal(calls, 1, 'diagnosis does not issue extra downloads');
    const events = host.__PDD_STARTUP_DIAGNOSTIC_EVENTS__;
    assert.equal(events[0].resource, 'https://example.test/pack.json');
    assert.equal(events[1].durationMs, 75);
    assert.equal(events[1].transferBytes, null, 'text length is not network transfer size');
    behavior = o => o.success({ statusCode: 503 });
    await assert.rejects(client.requestCdnText('https://example.test/error', 1000), /HTTP 503/);
    assert.equal(events.at(-1).event, 'cdn_request_failed');
    behavior = () => { throw Error('sync request failure'); };
    await assert.rejects(client.requestCdnText('https://example.test/error', 1000), /sync request failure/);
    assert.equal(calls, 3, 'recording does not retry requests');
    host.__PDD_STARTUP_DIAGNOSTIC__ = false;
    const count = events.length;
    behavior = o => o.success({ statusCode: 200, data: 'cached-or-network' });
    await client.requestCdnText('https://example.test/pack', 1000);
    assert.equal(events.length, count, 'normal package records no diagnostics');
    console.log('startup-network-diagnostic.test.js passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
