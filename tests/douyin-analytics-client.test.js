'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const runtimeFile = process.argv[2] ? path.resolve(process.argv[2], 'cloud-analytics-test.js') :
    path.join(root, 'scripts/runtime/douyin-cloud-analytics-test.js');
const source = fs.readFileSync(runtimeFile, 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function setup(options = {}) {
    const requests = [], timers = new Map(), modals = [], logs = [];
    let next = 0;
    const scope = { __PDD_CDN_SLOT__: options.slot || 'A', __PDD_DOUYIN_CLOUD_ENV__: options.business || '' };
    const tt = { getSystemInfoSync: () => ({ platform: options.platform || 'ios' }),
        showModal: data => modals.push(data), createCloud: target => {
            assert.strictEqual(target.envID, 'env-nvk6FNcrq5');
            assert.strictEqual(target.serviceID, '1m0ub3f29wtv7');
            return { callContainer(request) {
                requests.push(request);
                assert.strictEqual(request.path, '/cloudAnalyticsTest');
                const payload = request.init.body;
                assert.deepStrictEqual(Object.keys(payload).sort(), ['schemaVersion', 'eventName', 'eventId', 'clientTimestamp', 'platform', 'cdnSlot'].sort());
                assert(/^probe-[a-zA-Z0-9_-]{16,96}$/.test(payload.eventId));
                if (options.hang) return;
                if (options.fail) return request.fail({ errNo: 21102, errMsg: '13010 PRIVATE_SECRET' });
                if (options.throw) throw Error('PRIVATE_SECRET');
                const good = { ok: true, reason: 'EVENT_STORED', eventId: payload.eventId,
                    writeAcknowledged: true, readBack: true, duplicate: requests.length > 1,
                    collection: 'analytics_events_dev', analyticsEnvironment: 'douyin_dev_test',
                    openid: 'PRIVATE_SECRET' };
                const data = options.response ? options.response(good, requests.length) : good;
                request.success({ statusCode: options.status || 200, data: options.invalidJson ? 'PRIVATE_SECRET' : JSON.stringify(data) });
            } };
        } };
    if (options.noApi) delete tt.createCloud;
    const sandbox = { ...scope, tt, module: { exports: {} }, console: {
        log: value => logs.push(value), error: value => logs.push(value)
    }, setTimeout(fn, delay) { const id = ++next; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); } };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    if (process.argv[2]) {
        const entry = fs.readFileSync(path.join(process.argv[2], 'game.js'), 'utf8');
        const marker = '// PDD_DOUYIN_ANALYTICS_TEST_BEGIN';
        assert.strictEqual(entry.split(marker).length, 2);
        assert(!entry.includes('PDD_DOUYIN_IDENTITY_TEST'));
        sandbox.require = id => { assert.strictEqual(id, './cloud-analytics-test'); return sandbox.module.exports; };
        vm.runInContext(entry.slice(entry.indexOf(marker)), sandbox);
    } else sandbox.module.exports(sandbox, tt);
    return { scope: sandbox, requests, timers, modals, logs };
}
(async () => {
    const good = setup();
    const auto = [...good.timers.values()].find(timer => timer.delay === 2500);
    assert(auto); auto.fn();
    const result = await good.scope.__PDD_RUN_CLOUD_ANALYTICS_TEST__();
    assert.strictEqual(result.reason, 'ANALYTICS_TEST_OK');
    assert.strictEqual(result.firstDuplicate, false);
    assert.strictEqual(result.deduplicated, true);
    assert.strictEqual(good.requests.length, 2);
    assert.deepStrictEqual(copy(good.requests[0].init.body), copy(good.requests[1].init.body));
    assert.strictEqual(good.modals.length, 1);
    assert.strictEqual(good.scope.__PDD_DOUYIN_CLOUD_ENV__, '');
    assert(!JSON.stringify([result, good.modals, good.logs]).includes('PRIVATE_'));
    const rerun = await good.scope.__PDD_RUN_CLOUD_ANALYTICS_TEST__();
    assert.strictEqual(rerun.firstDuplicate, true);
    assert.deepStrictEqual(copy(good.requests[0].init.body), copy(good.requests[3].init.body), 'manual retry changed payload');
    for (const [options, reason, count] of [
        [{ platform: 'devtools' }, 'REAL_DEVICE_REQUIRED', 0],
        [{ business: 'prod' }, 'BUSINESS_CLOUD_MUST_BE_DISABLED', 0],
        [{ slot: 'B' }, 'A_SLOT_REQUIRED', 0],
        [{ noApi: true }, 'CREATE_CLOUD_UNAVAILABLE', 0],
        [{ fail: true }, 'ACCESS_DENIED_13010', 1],
        [{ throw: true }, 'REQUEST_THREW', 1],
        [{ status: 403 }, 'HTTP_FAILED', 1],
        [{ invalidJson: true }, 'RESPONSE_NOT_JSON', 1],
        [{ response: data => ({ ...data, readBack: false }) }, 'RESPONSE_SCHEMA_INVALID', 1],
        [{ response: data => ({ ...data, eventId: 'PRIVATE_SECRET' }) }, 'RESPONSE_SCHEMA_INVALID', 1],
        [{ response: data => ({ ...data, analyticsEnvironment: 'prod' }) }, 'RESPONSE_SCHEMA_INVALID', 1],
        [{ response: () => ({ ok: false, reason: 'DATABASE_FAILED', stage: 'connect', errorCode: 18, error: 'PRIVATE_SECRET' }) }, 'DATABASE_FAILED', 1],
        [{ response: () => ({ ok: false, reason: 'PRIVATE_SECRET' }) }, 'SERVER_REJECTED', 1],
        [{ response: data => ({ ...data, duplicate: false }) }, 'DEDUPE_NOT_CONFIRMED', 2],
        [{ response: (data, n) => n === 2 ? ({ ok: false, reason: 'EVENT_ID_CONFLICT' }) : data }, 'EVENT_ID_CONFLICT', 2]
    ]) {
        const x = setup(options);
        const res = await x.scope.__PDD_RUN_CLOUD_ANALYTICS_TEST__();
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.reason, reason);
        assert.strictEqual(x.requests.length, count);
        assert(!JSON.stringify([res, x.modals, x.logs]).includes('PRIVATE_'));
    }
    const slow = setup({ hang: true });
    const pending = slow.scope.__PDD_RUN_CLOUD_ANALYTICS_TEST__();
    assert.strictEqual(pending, slow.scope.__PDD_RUN_CLOUD_ANALYTICS_TEST__());
    [...slow.timers.values()].find(timer => timer.delay === 16000).fn();
    assert.strictEqual((await pending).reason, 'REQUEST_TIMEOUT');
    slow.requests[0].fail({ errMsg: 'PRIVATE_SECRET' });
    assert.strictEqual(slow.modals.length, 1);
    assert.strictEqual(slow.requests.length, 1, 'failure must not submit the repeat request');
    console.log('PASS: actual diagnostic entry, two identical requests, repeat/retry preservation, response validation, devtools gate, failures, timeout, single flight and redaction (network mocked)');
})().catch(error => { console.error(error); process.exitCode = 1; });
