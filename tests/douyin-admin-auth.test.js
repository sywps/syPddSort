'use strict';
const assert = require('assert'), crypto = require('crypto'), fs = require('fs'), vm = require('vm');
const authorize = require('../cloudfunctions-douyin/adminAuth');
const { backend } = require('./douyin-business-cloud.test');
const token = crypto.randomBytes(32).toString('hex');
const env = { CLOUD_ENV: 'PROD', DOUYIN_ADMIN_TOKEN: token, BUSINESS_ENVIRONMENT: 'douyin_release',
    ANALYTICS_ENVIRONMENT: 'douyin_release', MONGODB_URI: 'test-only', MONGODB_DB: 'pdd_douyin_prod' };
const context = headers => ({ trigger: 'online', headers: { 'x-tt-source': 'APP', ...headers } });
const good = context({ 'X-Pdd-Admin-Token': token });
const invalid = [null, {}, { trigger: 'test' }, { trigger: 'console', admin: true }, context({}),
    context({ 'x-pdd-admin-token': crypto.randomBytes(32).toString('hex') }),
    context({ 'x-pdd-admin-token': token + ' ' }), context({ 'x-pdd-admin-token': [token] }),
    context({ 'x-pdd-admin-token': token + ',' + token }),
    context({ 'x-pdd-admin-token': token, 'X-Pdd-Admin-Token': token }),
    context({ 'x-pdd-admin-token': { toString: () => token } }),
];
async function main() {
    assert.equal(authorize(good, env), true);
    for (const c of invalid) assert.equal(authorize(c, env), false);
    for (const secret of [undefined, '', 'password', token + ' ', [token]]) {
        assert.equal(authorize(good, { ...env, DOUYIN_ADMIN_TOKEN: secret }), false);
    }
    assert.equal(authorize(good, { ...env, CLOUD_ENV: 'UNKNOWN' }), false);
    assert.equal(authorize({ trigger: 'test' }, { CLOUD_ENV: 'DEV' }), true);
    assert.equal(authorize(good, { ...env, CLOUD_ENV: 'DEV' }), false);

    const b = backend({ env, envId: 'env-XzE6JatzwX' });
    assert.equal((await b.call('businessIdentity', {})).errorCode, 'SETUP_REQUIRED', 'login must never initialize the database');
    assert.deepEqual(b.store().douyin_business_meta || {}, {}, 'no initialization marker created by login');
    const missingToken = backend({ env: { ...env, DOUYIN_ADMIN_TOKEN: '' }, envId: 'env-XzE6JatzwX' });
    const missingResult = await missingToken.setup({}, good);
    assert.equal(missingResult.adminReason, 'ADMIN_TOKEN_NOT_CONFIGURED');
    assert.equal(missingResult.manualSetupRevision, 'manual-prod-20261011');
    assert(!JSON.stringify(missingResult).includes(token));
    assert.deepEqual(missingToken.store(), {});
    assert.equal((await b.setup({}, context({}))).adminReason, 'ADMIN_HEADER_REQUIRED');
    assert.equal((await b.setup({}, context({ 'x-pdd-admin-token': token + ' ' }))).adminReason, 'ADMIN_HEADER_INVALID');
    assert.equal((await b.setup({}, context({ 'x-pdd-admin-token': 'f'.repeat(64) }))).adminReason, 'ADMIN_TOKEN_MISMATCH');
    for (const c of invalid) {
        assert.equal((await b.setup({ adminToken: token, admin: true }, c)).errorCode, 'ADMIN_CONSOLE_REQUIRED');
        assert.equal(Object.values(b.store()).some(rows => Object.keys(rows).length > 0), false, 'unauthorized setup must not create data');
    }
    const setupResult = await b.setup({}, good);
    assert.equal(setupResult.transactionsVerified, true);
    assert.equal(setupResult.manualSetupRevision, 'manual-prod-20261011');
    assert.equal((await b.setup({}, good)).ok, true, 'authorized setup remains repeatable');
    assert(!JSON.stringify(b.store()).includes(token), 'administrator secret must never enter database');
    // An admin credential does not substitute for gameplay identity.
    assert.equal((await b.call('businessIdentity', {}, good)).errorCode, 'IDENTITY_REQUIRED');

    let databaseConnections = 0;
    const db = { collection: () => ({
        createIndex: async () => {}, aggregate: () => ({ toArray: async () => [] }),
        countDocuments: async () => 0,
        find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }),
    }) };
    let common;
    function load(name) {
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync('cloudfunctions-douyin/' + name + '.js', 'utf8'), {
            module, Buffer, Date, console: { error() {} }, process: { env },
            require(id) {
                if (id === './analyticsCommon') return common;
                if (id === './adminAuth') return authorize;
                if (id === 'mongodb') return { MongoClient: class {
                    async connect() { databaseConnections++; } async close() {} db() { return db; }
                } };
                return require(id);
            },
        });
        return module.exports;
    }
    common = load('analyticsCommon');
    const date = new Date(Date.now() + 28800000).toISOString().slice(0, 10);
    const handlers = [load('analyticsSetup'), load('analyticsReport'), load('analyticsExport')];
    const params = [{}, { date }, { date, collection: 'first_level_funnel' }];
    for (let i = 0; i < handlers.length; i++) {
        for (const c of invalid) {
            const result = await handlers[i]({ ...params[i], adminToken: token }, c);
            assert.equal(result.errorCode, 'ADMIN_CONSOLE_REQUIRED');
            assert.equal(result.manualSetupRevision, 'manual-prod-20261011');
            assert.equal(typeof result.errorMessage, 'string');
            assert(!JSON.stringify(result).includes(token));
        }
    }
    assert.equal(databaseConnections, 0, 'all rejected management requests stop before database access');
    const configuredLabel = env.ANALYTICS_ENVIRONMENT;
    env.ANALYTICS_ENVIRONMENT = 'douyin_dev';
    for (let i = 0; i < handlers.length; i++) {
        assert.equal((await handlers[i](params[i], good)).errorCode, 'CONFIG_NOT_READY', 'valid administrator must see config failure, not auth failure');
        assert.equal((await handlers[i](params[i], context({}))).adminReason, 'ADMIN_HEADER_REQUIRED', 'configuration is not inspected before authorization');
    }
    assert.equal(databaseConnections, 0);
    env.ANALYTICS_ENVIRONMENT = configuredLabel;
    for (let i = 0; i < handlers.length; i++) {
        const result = await handlers[i](params[i], good);
        assert.equal(result.ok, true);
        assert.equal(result.analyticsEnvironment, 'douyin_release');
        assert(!JSON.stringify(result).includes(token));
    }
    assert.equal(databaseConnections, 1);
    const oldToken = env.DOUYIN_ADMIN_TOKEN;
    env.DOUYIN_ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');
    assert.equal((await handlers[0]({}, good)).errorCode, 'ADMIN_CONSOLE_REQUIRED', 'rotated credential revokes old access');
    assert.equal((await handlers[0]({}, context({ 'x-pdd-admin-token': env.DOUYIN_ADMIN_TOKEN }))).ok, true);
    env.DOUYIN_ADMIN_TOKEN = oldToken;
    console.log('PASS real setup/report/export authorization: PROD token required even for console triggers; malformed/duplicate/body credentials blocked before database; correct token, rotation, DEV compatibility, no secret echo (Mongo mocked)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
