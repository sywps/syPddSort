'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { installDouyinIdentityTest } = require('../scripts/install-douyin-identity-test');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/runtime/douyin-cloud-identity-test.js'), 'utf8');
const good = { message: 'douyin-cloud-identity', appId: 'ttf45082ed6a36c15802', envId: 'env-nvk6FNcrq5',
    source: 'APP', trigger: 'online', hasOpenId: true, hasAnonymousOpenId: true, hasUnionId: true,
    openid: 'SECRET_ID', session_key: 'SECRET_KEY' };
function setup(options = {}) {
    const timers = new Map(), logs = [], modals = [], requests = [], targets = [];
    let next = 0;
    const scope = { __PDD_DOUYIN_CLOUD_ENV__: options.businessEnv || '' };
    const tt = { getSystemInfoSync: () => ({ platform: options.platform || 'ios' }), showModal: x => modals.push(x),
        createCloud: x => {
            targets.push(x);
            return { callContainer: request => {
                requests.push(request);
                if (options.hang) return;
                if (options.fail) return request.fail(options.fail);
                if (options.throw) throw Error('SECRET_KEY');
                request.success({ statusCode: options.status || 200, data: options.data === undefined ? good : options.data });
            } };
        } };
    if (options.noApi) delete tt.createCloud;
    const context = { module: { exports: {} }, console: { log: x => logs.push(x), error: x => logs.push(x) },
        setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; },
        clearTimeout: id => timers.delete(id) };
    vm.runInNewContext(source, context);
    context.module.exports(scope, tt);
    const auto = Array.from(timers.entries()).find(([, t]) => t.delay === 2500);
    assert(auto); timers.delete(auto[0]);
    return { scope, tt, timers, logs, modals, requests, targets, auto: auto[1].fn, install: context.module.exports };
}
(async () => {
    for (const [options, reason] of [
        [{}, 'IDENTITY_FIELDS_OK'],
        [{ data: JSON.stringify(good), platform: 'devtools' }, 'IDENTITY_FIELDS_OK'],
        [{ data: { ...good, hasOpenId: false } }, 'OPENID_MISSING'],
        [{ data: { ...good, appId: 'wrong' } }, 'APP_MISMATCH'],
        [{ data: { ...good, envId: 'wrong' } }, 'ENV_MISMATCH'],
        [{ data: { ...good, source: 'SECRET_ID' } }, 'CALL_SOURCE_UNCONFIRMED'],
        [{ data: { ...good, trigger: 'debug' } }, 'CALL_SOURCE_UNCONFIRMED'],
        [{ data: { ...good, hasOpenId: 'true' } }, 'RESPONSE_SCHEMA_INVALID'],
        [{ data: 'SECRET_KEY' }, 'RESPONSE_NOT_JSON'],
        [{ status: 403 }, 'HTTP_FAILED'],
        [{ fail: { errNo: 21102, errMsg: '13010 SECRET_KEY' } }, 'ACCESS_DENIED_13010'],
        [{ throw: true }, 'REQUEST_THREW'],
        [{ noApi: true }, 'CREATE_CLOUD_UNAVAILABLE'],
        [{ businessEnv: 'unexpected' }, 'BUSINESS_CLOUD_MUST_BE_DISABLED']
    ]) {
        const x = setup(options);
        const result = await x.scope.__PDD_RUN_CLOUD_IDENTITY_TEST__();
        assert.strictEqual(result.reason, reason);
        assert.strictEqual(result.ok, reason === 'IDENTITY_FIELDS_OK');
        assert.strictEqual(x.modals.length, 1);
        const exposed = JSON.stringify([result, x.logs, x.modals]);
        assert(!exposed.includes('SECRET_'), 'response/error secrets leaked');
        assert.strictEqual(x.scope.__PDD_DOUYIN_CLOUD_ENV__, options.businessEnv || '');
        if (x.requests.length) {
            assert.strictEqual(x.requests[0].path, '/cloudIdentity');
            assert.deepStrictEqual(JSON.parse(JSON.stringify(x.requests[0].init)), {
                method: 'POST', header: { 'content-type': 'application/json' }, body: {}, timeout: 15000 });
            assert.deepStrictEqual(JSON.parse(JSON.stringify(x.targets[0])), { envID: 'env-nvk6FNcrq5', serviceID: '1m0ub3f29wtv7' });
        }
    }
    const x = setup({ hang: true });
    x.install(x.scope, x.tt); // Reinstall must not create a second automatic request.
    x.auto();
    const p = x.scope.__PDD_RUN_CLOUD_IDENTITY_TEST__();
    assert.strictEqual(x.scope.__PDD_RUN_CLOUD_IDENTITY_TEST__(), p);
    assert.strictEqual(x.requests.length, 1);
    Array.from(x.timers.values()).find(t => t.delay === 16000).fn();
    assert.strictEqual((await p).reason, 'REQUEST_TIMEOUT');
    x.requests[0].success({ statusCode: 200, data: good });
    assert.strictEqual(x.modals.length, 1, 'late callback must not replace timed-out result');

    const fixture = fs.mkdtempSync(path.join(root, '.planning/douyin-identity-fixture-'));
    const entry = path.join(fixture, 'game.js');
    const base = 'globalThis.__PDD_CDN_SLOT__="A";\nglobalThis.__PDD_DOUYIN_CLOUD_ENV__="";\n';
    fs.writeFileSync(entry, base);
    assert.strictEqual(installDouyinIdentityTest(fixture, {}), false);
    assert(!fs.existsSync(path.join(fixture, 'cloud-identity-test.js')));
    installDouyinIdentityTest(fixture, { PDD_DOUYIN_IDENTITY_TEST: '1' });
    installDouyinIdentityTest(fixture, { PDD_DOUYIN_IDENTITY_TEST: '1' });
    assert.strictEqual(fs.readFileSync(entry, 'utf8').split('// PDD_DOUYIN_IDENTITY_TEST_BEGIN').length, 2);
    assert.strictEqual(fs.readFileSync(path.join(fixture, 'cloud-identity-test.js'), 'utf8'), source);
    installDouyinIdentityTest(fixture, {});
    assert(!fs.readFileSync(entry, 'utf8').includes('PDD_DOUYIN_IDENTITY_TEST_BEGIN'));
    assert(!fs.existsSync(path.join(fixture, 'cloud-identity-test.js')));
    fs.writeFileSync(entry, base.replace('"A"', '"B"'));
    assert.throws(() => installDouyinIdentityTest(fixture, { PDD_DOUYIN_IDENTITY_TEST: '1' }), /A slot/);
    fs.writeFileSync(entry, base.replace('ENV__=""', 'ENV__="prod"'));
    assert.throws(() => installDouyinIdentityTest(fixture, { PDD_DOUYIN_IDENTITY_TEST: '1' }), /business cloud/);
    console.log('PASS: identity callbacks, isolation, redaction, timeout, single flight, modal, default-off and installer guards');
})().catch(error => { console.error(error); process.exitCode = 1; });
