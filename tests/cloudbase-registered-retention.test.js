'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../tools/cloudbase-registered-retention');
const snapshot = require('../artifacts/cloudbase-retention-report/registered-cohorts.json');
const helpers = { escapeHtml: String, renderMetricCard: (...args) => args.join(' '), renderTable: (headers, rows) => JSON.stringify([headers, rows]) };

async function main() {
    api.validate(snapshot);
    for (const [day, users, base] of [['D1', 436, 22835], ['D2', 427, 22691], ['D3', 140, 22454], ['D7', 47, 16772]]) {
        const total = api.summarize(snapshot.cohorts, day);
        assert.equal(total.users, users);
        assert.equal(total.base, base);
    }
    const html = api.render(snapshot, '2026-09-15', helpers);
    for (const expected of ['1.91%', '1.88%', '0.62%', '0.28%', '未成熟', '当日未结束', '非实时', '非单关留存']) assert.ok(html.includes(expected), expected);
    const earlier = api.render(snapshot, '2026-08-31', helpers);
    assert.ok(earlier.includes('673'));
    assert.ok(!earlier.includes('2026-09-14'));
    assert.ok(api.render(snapshot, '2026-09-16', helpers).includes('数据不可得'));
    const absent = structuredClone(snapshot);
    delete absent.cohorts[0].retention.D2;
    assert.ok(api.render(absent, '2026-09-15', helpers).includes('存在缺失指标'));
    const invalid = structuredClone(snapshot);
    invalid.cohorts[0].retention.D1.users = 99999;
    assert.throws(() => api.validate(invalid));
    const zero = { date: '2026-08-31', registered: 0, status: 'complete', retention: { D1: { date: '2026-09-01', base: 0, users: 0, status: 'complete' } } };
    assert.ok(api.render({ ...snapshot, cohorts: [zero] }, '2026-08-31', helpers).includes('数据不可得（0/0）'));
    assert.ok((await api.load('missing', async () => ({ ok: false }))).message.includes('数据不可得'));
    assert.ok((await api.load('invalid', async () => ({ ok: true, json: async () => invalid }))).message.includes('数据不可得'));
    assert.deepEqual(await api.load('valid', async () => ({ ok: true, json: async () => snapshot })), snapshot);
    assert.deepEqual(api.toPublicSnapshot({ ...snapshot, openid: 'never-export' }), snapshot);
    const page = fs.readFileSync(path.join(__dirname, '../tools/cloudbase-report.html'), 'utf8');
    assert.ok(page.includes('const [base, social, retention] = await Promise.all'));
    assert.ok(page.includes('if (version !== state.loadVersion) return;\n    state.social = social;\n    state.retention = retention;'));
    assert.equal((page.match(/\$\{renderRegisteredRetention\(\)\}/g) || []).length, 2);
    console.log('Registered retention: snapshot totals, maturity, missing/invalid data, zero denominator, date range, privacy and integration passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
