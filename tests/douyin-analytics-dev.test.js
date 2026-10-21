'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions-douyin/cloudAnalyticsTest.js'), 'utf8');
const event = { schemaVersion: 1, eventName: 'analytics_dev_probe', eventId: 'probe-20261010_test_0001',
    clientTimestamp: 1791604800000, platform: 'ios', cdnSlot: 'A' };
const context = { trigger: 'online', headers: { 'x-tt-source': 'APP', 'x-tt-appid': 'ttf45082ed6a36c15802',
    'x-tt-envid': 'env-nvk6FNcrq5', 'x-tt-openid': 'PRIVATE_ACCOUNT_A' } };
const copy = value => JSON.parse(JSON.stringify(value));
function setup(options = {}) {
    const rows = new Map(), logs = [], stats = { connections: 0, writes: 0, closed: 0 };
    let failures = options.connectFailures || 0;
    const collection = {
        async updateOne(filter, update, config) {
            stats.writes++;
            assert.strictEqual(config.upsert, true);
            assert.strictEqual(config.writeConcern.w, 'majority');
            if (options.writeError) throw Object.assign(Error('PRIVATE_PASSWORD'), { code: 91 });
            if (options.unacknowledged) return { acknowledged: false };
            if (rows.has(filter._id)) return { acknowledged: true, matchedCount: 1, upsertedCount: 0 };
            rows.set(filter._id, copy(update.$setOnInsert));
            if (options.race) throw Object.assign(Error('PRIVATE_ACCOUNT_A'), { code: 11000 });
            return { acknowledged: true, matchedCount: 0, upsertedCount: 1 };
        },
        async findOne(filter) {
            if (options.noReadBack) return null;
            const row = copy(rows.get(filter._id));
            if (options.corruptRead) row.clientTimestamp++;
            return row;
        }
    };
    class MongoClient {
        constructor(uri, config) { assert.strictEqual(uri, 'PRIVATE_URI'); assert.strictEqual(config.maxPoolSize, 5); }
        async connect() {
            stats.connections++;
            if (failures-- > 0) throw Object.assign(Error('PRIVATE_URI PRIVATE_PASSWORD'), { code: 18 });
        }
        db(name) { assert.strictEqual(name, 'test_db'); return { collection: name => {
            assert.strictEqual(name, 'analytics_events_dev'); return collection;
        } }; }
        async close() { stats.closed++; }
    }
    const sandbox = { module: { exports: {} }, process: { env: {
        CLOUD_ENV: 'DEV', MONGODB_URI: 'PRIVATE_URI', MONGODB_DB: 'test_db', ...options.env
    } }, console: { error: (...items) => logs.push(items) }, require: name => {
        if (name === 'crypto') return crypto;
        assert.strictEqual(name, 'mongodb'); return { MongoClient };
    } };
    vm.runInNewContext(source, sandbox);
    return { run: sandbox.module.exports, rows, stats, logs };
}
(async () => {
    for (const [payload, ctx, env, reason] of [
        [event, context, { CLOUD_ENV: 'PROD' }, 'DEV_ONLY'],
        [event, context, { CLOUD_ENV: '' }, 'DEV_ONLY'],
        [event, null, {}, 'APP_GATEWAY_REQUIRED'],
        [event, { ...context, trigger: 'debug' }, {}, 'APP_GATEWAY_REQUIRED'],
        [event, { ...context, headers: { ...context.headers, 'x-tt-source': 'HTTP' } }, {}, 'APP_GATEWAY_REQUIRED'],
        [event, { ...context, headers: { ...context.headers, 'x-tt-openid': '' } }, {}, 'OPENID_MISSING'],
        [event, { ...context, headers: { ...context.headers, 'x-tt-appid': 'wrong' } }, {}, 'APP_MISMATCH'],
        [event, { ...context, headers: { ...context.headers, 'x-tt-envid': 'prod' } }, {}, 'ENV_MISMATCH'],
        [{ ...event, openid: 'fake' }, context, {}, 'INVALID_EVENT'],
        [{ ...event, replay: [] }, context, {}, 'INVALID_EVENT'],
        [{ ...event, eventName: 'coop_complete' }, context, {}, 'INVALID_EVENT'],
        [{ ...event, eventName: 'pvp_result' }, context, {}, 'INVALID_EVENT'],
        [{ ...event, platform: 'devtools' }, context, {}, 'INVALID_EVENT'],
        [{ ...event, clientTimestamp: Infinity }, context, {}, 'INVALID_EVENT'],
        [{ ...event, eventId: { $ne: null } }, context, {}, 'INVALID_EVENT'],
        [{ ...event, cdnSlot: 'B' }, context, {}, 'INVALID_EVENT'],
        [null, context, {}, 'INVALID_EVENT'],
        [event, context, { MONGODB_DB: '' }, 'DATABASE_CONFIG_MISSING']
    ]) {
        const x = setup({ env });
        const result = await x.run(payload, ctx);
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.reason, reason);
        assert.strictEqual(x.stats.connections, 0, 'rejection must precede database connection');
        assert.strictEqual(x.rows.size, 0);
    }
    const x = setup();
    const first = await x.run(event, context);
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.duplicate, false);
    const original = JSON.stringify([...x.rows.values()]);
    const second = await x.run(copy(event), context);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.duplicate, true);
    assert.strictEqual(x.rows.size, 1);
    assert.strictEqual(JSON.stringify([...x.rows.values()]), original, 'retry overwrote original');
    assert.strictEqual((await x.run({ ...event, clientTimestamp: event.clientTimestamp + 1 }, context)).reason, 'EVENT_ID_CONFLICT');
    assert.strictEqual(JSON.stringify([...x.rows.values()]), original);
    assert.strictEqual((await x.run(event, { ...context, headers: { ...context.headers,
        'x-tt-openid': 'PRIVATE_ACCOUNT_B' } })).duplicate, false);
    assert.strictEqual(x.rows.size, 2, 'different accounts must not deduplicate together');
    assert.strictEqual(x.stats.connections, 1, 'warm invocations should reuse connection');
    assert(!JSON.stringify([first, second, x.logs, [...x.rows.values()]]).includes('PRIVATE_'));
    for (const [option, reason] of [
        ['unacknowledged', 'WRITE_NOT_ACKNOWLEDGED'], ['writeError', 'DATABASE_FAILED'],
        ['noReadBack', 'READ_BACK_FAILED'], ['corruptRead', 'EVENT_ID_CONFLICT']
    ]) {
        const y = setup({ [option]: true });
        const result = await y.run(event, context);
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.reason, reason);
        assert(!JSON.stringify([result, y.logs]).includes('PRIVATE_'));
    }
    const race = setup({ race: true });
    assert.strictEqual((await race.run(event, context)).duplicate, true);
    const raceMissing = setup({ race: true, noReadBack: true });
    assert.strictEqual((await raceMissing.run(event, context)).ok, false);
    const reconnect = setup({ connectFailures: 1 });
    const failed = await reconnect.run(event, context);
    assert.strictEqual(failed.reason, 'DATABASE_FAILED');
    assert.strictEqual(failed.errorCode, 18);
    assert(!JSON.stringify([failed, reconnect.logs]).includes('PRIVATE_'));
    assert.strictEqual((await reconnect.run(event, context)).ok, true);
    assert.strictEqual(reconnect.stats.closed, 1);
    assert.strictEqual(reconnect.stats.connections, 2);
    const concurrent = setup();
    const results = await Promise.all(Array.from({ length: 12 }, () => concurrent.run(event, context)));
    assert(results.every(result => result.ok));
    assert.strictEqual(results.filter(result => !result.duplicate).length, 1);
    assert.strictEqual(concurrent.rows.size, 1);
    console.log('PASS: dev/gateway guards, validation, replay exclusion, account isolation, idempotence, conflicts, read-back, failures and redaction (mock MongoDB)');
})().catch(error => { console.error(error); process.exitCode = 1; });
