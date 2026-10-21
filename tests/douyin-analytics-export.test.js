'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { collect } = require('../scripts/douyin-analytics-report');
const date = '2026-10-10';
const start = Date.parse(date + 'T00:00:00+08:00');
const since = start + 1000, capturedAt = since + 1000;
const build = 'douyin-a-business-dev-20261010-r3';
const base = { analyticsEnvironment: 'douyin_dev', appId: 'ttf45082ed6a36c15802', envId: 'env-nvk6FNcrq5',
    openid: 'a'.repeat(64), timestamp: since, receivedAt: capturedAt, clientBuildId: build };
const rows = Array.from({ length: 61 }, (_, i) => ({ ...base, _id: i.toString(16).padStart(64, '0') }));
const add = value => rows.push({ ...base, _id: rows.length.toString(16).padStart(64, '0'), ...value });
add({ clientBuildId: 'other', extra: { clientBuildId: build } });
add({ timestamp: since - 1 });
add({ timestamp: capturedAt });
add({ receivedAt: capturedAt + 1 });
add({ analyticsEnvironment: 'other' });
add({ appId: 'other' });
add({ envId: 'other' });
add({ timestamp: start - 1 });
add({ timestamp: start + 86400000 });
function matches(row, query) {
    return Object.entries(query).every(([key, value]) => {
        if (typeof value !== 'object') return row[key] === value;
        return Object.entries(value).every(([op, target]) => {
            if (op === '$gte') return row[key] >= target;
            if (op === '$gt') return row[key] > target;
            if (op === '$lt') return row[key] < target;
            if (op === '$lte') return row[key] <= target;
            throw Error('Unsupported operator: ' + op);
        });
    });
}
let reads = 0;
const common = { LABEL: base.analyticsEnvironment, APP: base.appId, ENV: base.envId,
    adminAllowed: context => context === 'admin', adminFailure: () => ({ ok: false, errorCode: 'ADMIN_CONSOLE_REQUIRED' }),
    fail: errorCode => ({ ok: false, errorCode }),
    reply: value => ({ ...value, analyticsEnvironment: base.analyticsEnvironment }), safeError: error => { throw error; },
    database: async () => { reads++; return { collection: () => ({
        find: query => ({ sort: () => ({ limit: limit => ({ toArray: async () => rows.filter(row => matches(row, query)).sort((a, b) => a._id.localeCompare(b._id)).slice(0, limit) }) }) }),
        countDocuments: async query => rows.filter(row => matches(row, query)).length,
    }) }; },
};
const mod = { exports: {} };
class TestDate extends Date { static now() { return start + 2 * 86400000; } }
vm.runInNewContext(fs.readFileSync('cloudfunctions-douyin/analyticsExport.js', 'utf8'), {
    module: mod, require: name => { assert.equal(name, './analyticsCommon'); return common; }, Buffer, Date: TestDate,
});
const request = { date, collection: 'first_level_funnel', capturedAt, clientBuildId: build, since, after: '' };
const call = params => mod.exports(params, 'admin');
async function main() {
    const first = await call(request);
    assert.equal(first.totalRecords, 61); assert.equal(first.records.length, 50); assert.equal(first.hasMore, true);
    assert.equal(first.clientBuildId, build); assert.equal(first.since, since);
    const second = await call({ ...request, after: first.nextCursor });
    assert.equal(second.totalRecords, 61); assert.equal(second.records.length, 11); assert.equal(second.hasMore, false);
    assert.equal(second.nextCursor, '');
    assert.equal(new Set([...first.records, ...second.records].map(row => row._id)).size, 61);
    for (const collection of ['user_behavior', 'level_record']) assert.equal((await call({ ...request, collection })).totalRecords, 61);
    const legacy = { date, collection: request.collection, capturedAt };
    const full = await call(legacy);
    assert.equal(full.totalRecords, 63); assert.equal('clientBuildId' in full, false); assert.equal('since' in full, false);
    assert.equal((await call({ ...legacy, clientBuildId: build })).totalRecords, 62);
    assert.equal((await call({ ...legacy, since })).totalRecords, 62);
    assert.equal((await call({ ...request, clientBuildId: 'no-matches' })).totalRecords, 0);
    const beforeInvalid = reads;
    for (const clientBuildId of ['', null, {}, ['x'], 5, 'x'.repeat(81), 'x.*']) {
        assert.equal((await call({ ...request, clientBuildId })).errorCode, 'INVALID_BUILD_ID');
    }
    for (const invalidSince of [null, String(since), since + 0.5, start - 1, capturedAt, capturedAt + 1, {}]) {
        assert.equal((await call({ ...request, since: invalidSince })).errorCode, 'INVALID_SINCE');
    }
    assert.equal((await call({ ...request, capturedAt: start + 86400000 + 1000, since: start + 86400000 })).errorCode, 'INVALID_SINCE');
    assert.equal((await mod.exports(request, 'app')).errorCode, 'ADMIN_CONSOLE_REQUIRED');
    assert.equal(reads, beforeInvalid, 'bad inputs and unauthorized calls never access database');
    const pages = [];
    for (const collection of ['user_behavior', 'first_level_funnel', 'level_record']) {
        pages.push({ ...first, collection }, { ...second, collection });
    }
    const collected = collect(pages);
    assert.equal(collected.clientBuildId, build); assert.equal(collected.since, since);
    assert.equal(collected.records.first_level_funnel.length, 61);
    for (const changed of [{ clientBuildId: 'other' }, { clientBuildId: undefined }, { since: since + 1 }, { since: undefined }]) {
        assert.throws(() => collect([{ ...pages[0], ...changed }, ...pages.slice(1)]), /Mixed/);
    }
    for (const changed of [{ timestamp: since - 1 }, { clientBuildId: 'other' }]) {
        assert.throws(() => collect([{ ...pages[0], records: [{ ...pages[0].records[0], ...changed }, ...pages[0].records.slice(1)] }, ...pages.slice(1)]), /Invalid, mixed/);
    }
    console.log('PASS export exact build/time filters, pagination, boundaries, legacy requests, authorization and report scope');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
