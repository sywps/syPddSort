'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const { backend } = require('./douyin-business-cloud.test');
const { summarize } = require('../scripts/douyin-analytics-report');
const PROD = 'env-XzE6JatzwX', DEV = 'env-nvk6FNcrq5', APP = 'ttf45082ed6a36c15802';
const adminToken = crypto.randomBytes(32).toString('hex'); // Ephemeral test-only credential, never logged.
const adminContext = { trigger: 'online', headers: { 'x-tt-source': 'APP', 'x-pdd-admin-token': adminToken } };
const env = { CLOUD_ENV: 'PROD', BUSINESS_ENVIRONMENT: 'douyin_release', ANALYTICS_ENVIRONMENT: 'douyin_release',
    MONGODB_URI: 'test-only', MONGODB_DB: 'pdd_douyin_prod', DOUYIN_ADMIN_TOKEN: adminToken };
const clone = value => JSON.parse(JSON.stringify(value));
function analytics(settings = env) {
    const tables = new Map(), selectedDatabases = [];
    const db = { collection(name) {
        if (!tables.has(name)) tables.set(name, new Map());
        const rows = tables.get(name);
        return {
            async createIndex() {},
            async updateOne(query, update) {
                if (!rows.has(query._id)) rows.set(query._id, clone(update.$setOnInsert || {}));
                return { acknowledged: true };
            },
            async findOne(query) { return rows.get(query._id); },
            aggregate(pipeline) {
                assert.equal(pipeline[0].$match.analyticsEnvironment, 'douyin_release');
                assert.equal(pipeline[0].$match.envId, PROD);
                return { toArray: async () => [] };
            },
            async countDocuments(query) { assert.equal(query.analyticsEnvironment, 'douyin_release'); return 0; },
        };
    } };
    function load(name, common) {
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync('cloudfunctions-douyin/' + name + '.js', 'utf8'), {
            module, Buffer, Date, process: { env: settings }, console: { error() {} },
            require(id) {
                if (id === './analyticsCommon') return common;
                if (id === './adminAuth') return require('../cloudfunctions-douyin/adminAuth');
                if (id === 'mongodb') return { MongoClient: class {
                    async connect() {} async close() {}
                    db(name) { selectedDatabases.push(name); return db; }
                } };
                return require(id);
            },
        });
        return module.exports;
    }
    const common = load('analyticsCommon');
    return { common, tables, selectedDatabases, setup: load('analyticsSetup', common), report: load('analyticsReport', common) };
}
async function main() {
    const b = backend({ env, envId: PROD });
    assert.equal((await b.call('businessIdentity', {})).errorCode, 'SETUP_REQUIRED');
    assert.equal((await b.setup({}, { trigger: 'test' })).errorCode, 'ADMIN_CONSOLE_REQUIRED');
    const ready = await b.setup({}, adminContext);
    assert.equal(ready.businessEnvironment, 'douyin_release');
    assert.equal(ready.transactionsVerified, true);
    const identity = await b.call('businessIdentity', {});
    const expected = crypto.createHash('sha256').update(JSON.stringify([PROD, APP, 'phone-user-1'])).digest('hex');
    assert.equal(identity.subjectId, expected);
    const dev = backend(); await dev.setup({}, { trigger: 'test' });
    assert.notEqual((await dev.call('businessIdentity', {})).subjectId, identity.subjectId);
    const oldContext = clone(b.context); oldContext.headers['x-tt-envid'] = DEV;
    assert.equal((await b.call('businessIdentity', {}, oldContext)).errorCode, 'IDENTITY_REQUIRED');
    const sync = data => b.call('syncUserState', { ...data, expectedOwner: expected });
    assert.equal((await sync({ action: 'get' })).gameState, null);
    assert.equal((await sync({ action: 'save', gameState: { savedLevel: 5, gold: 100, stateUpdatedAt: Date.now() } })).ok, true);
    assert.equal((await sync({ action: 'get' })).gameState.savedLevel, 5);
    const claim = () => b.call('updateUserProfileAssets', { action: 'profileChapterClaim', requestId: 'prod_claim_001', expectedOwner: expected });
    const granted = await claim(); assert.equal(granted.ok, true);
    assert.deepEqual((await claim()).inventory, granted.inventory, 'production repeat does not duplicate chapter reward');
    assert.equal(Object.keys(dev.store().douyin_user_profile || {}).length, 0, 'dev data untouched');
    for (const changes of [{ BUSINESS_ENVIRONMENT: 'douyin_dev' }, { MONGODB_DB: 'test-only' }, { CLOUD_ENV: 'unknown' }]) {
        const invalid = backend({ env: { ...env, ...changes }, envId: PROD });
        assert.equal((await invalid.call('businessIdentity', {})).errorCode, 'CONFIG_NOT_READY');
    }
    const devWithProdDb = backend({ env: { MONGODB_DB: env.MONGODB_DB } });
    assert.equal((await devWithProdDb.call('businessIdentity', {})).errorCode, 'CONFIG_NOT_READY');

    const a = analytics();
    assert.equal((await a.setup({}, { trigger: 'test' })).errorCode, 'ADMIN_CONSOLE_REQUIRED');
    assert.equal((await a.setup({}, adminContext)).ok, true);
    const ai = await a.common.receive('analyticsIdentity', {}, b.context);
    assert.equal(ai.subjectId, expected, 'business and analytics share trusted production identity');
    assert.equal((await a.common.receive('analyticsIdentity', {}, oldContext)).errorCode, 'IDENTITY_REQUIRED');
    assert.equal((await a.setup({}, b.context)).errorCode, 'ADMIN_CONSOLE_REQUIRED');
    const timestamp = Date.now();
    const row = { eventId: 'prod:test:1', eventName: 'app_launch', timestamp, sessionId: 'test-session',
        clientBuildId: 'test-production', analyticsEnvironment: 'douyin_release', analyticsSchemaVersion: 2,
        csdVersion: 3, platform: 'douyin', cdnSlot: 'A', page: 'app', source: 'startup', gameplayEntryMode: '', roundId: '' };
    const send = event => a.common.receive('addFunnelEvents', { events: [event], expectedOwner: expected }, b.context);
    assert.equal((await send(row)).ok, true);
    assert.equal((await send(row)).ok, true);
    assert.equal(a.tables.get('first_level_funnel').size, 1, 'retry is deduplicated');
    assert.equal((await send({ ...row, eventId: 'prod:test:2', analyticsEnvironment: 'douyin_dev' })).errorCode, 'INVALID_EVENT');
    assert.equal((await send({ ...row, extra: { replay: {} } })).errorCode, 'INVALID_EVENT');
    assert(a.selectedDatabases.every(name => name === 'pdd_douyin_prod'));
    for (const changes of [{ ANALYTICS_ENVIRONMENT: 'douyin_dev' }, { MONGODB_DB: 'test-only' }, { CLOUD_ENV: 'unknown' }]) {
        assert.equal((await analytics({ ...env, ...changes }).common.receive('analyticsIdentity', {}, b.context)).errorCode, 'CONFIG_NOT_READY');
    }
    const date = new Date(timestamp + 28800000).toISOString().slice(0, 10);
    const summary = await a.report({ date }, adminContext);
    assert.equal(summary.ok, true); assert(summary.note.startsWith('PROD'));
    const pages = ['user_behavior', 'first_level_funnel', 'level_record'].map(collection => ({
        ok: true, analyticsEnvironment: 'douyin_release', date, capturedAt: timestamp + 1,
        collection, after: '', nextCursor: '', hasMore: false, totalRecords: 0, records: [],
    }));
    const report = summarize(pages);
    assert.equal(report.analyticsV2.environmentScope, 'douyin_release');
    assert.throws(() => summarize([{ ...pages[0], analyticsEnvironment: 'douyin_dev' }, ...pages.slice(1)]), /Mixed/);
    console.log('PASS prod cloud: same artifact promotion, dev/prod config and identity isolation, transactions/setup, save/claim dedup, analytics ack/dedup/replay rejection, report scope (Mongo mocked)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
