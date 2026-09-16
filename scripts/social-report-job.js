#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { shanghaiDayRange, createApiKeyBundle, parseDatabaseValue } = require('./user-behavior-daily-job');
const { summarizeCoop, summarizePvp } = require('./social-analytics');
const specs = { posts: ['coop_posts', 'createdAt'], runs: ['coop_runs', 'createdAt'], matches: ['pvp_matches', 'createdAt'], settlements: ['pvp_settlements', 'settledAt'] };

async function readCollection(bundle, collection, field, cutoff, request = fetch, startMs = 0) {
    assert.ok(Number.isFinite(startMs) && Number.isFinite(cutoff) && startMs >= 0 && cutoff > startMs, '时间区间无效');
    const rows = [], ids = new Set(), slices = []; let requests = 0;
    async function query(filter) {
        const params = new URLSearchParams({ offset: '0', limit: '1000', query: JSON.stringify(filter) });
        const url = `${bundle.baseUrl}/v1/database/instances/(default)/databases/(default)/collections/${collection}/documents?${params}`;
        let response;
        for (let attempt = 0; attempt < 3; attempt++) {
            try { response = await request(url, { headers: { Authorization: `Bearer ${bundle.apiKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }); }
            catch (_) { if (attempt === 2) throw new Error(`${collection}网络读取失败`); continue; }
            if (response.ok || (response.status < 500 && response.status !== 429) || attempt === 2) break;
            await response.arrayBuffer();
        }
        requests++;
        if (!response.ok) throw new Error(`${collection}读取失败（HTTP ${response.status}）`);
        const body = parseDatabaseValue(await response.json());
        assert.ok(Array.isArray(body.list), `${collection}响应缺少list`);
        return body.list;
    }
    async function interval(lo, hi) {
        const page = await query({ [field]: { $gte: lo, $lt: hi } });
        if (page.length >= 1000) {
            assert.ok(hi - lo > 1, `${collection}单毫秒数据超限`);
            const mid = lo + Math.floor((hi - lo) / 2); await interval(lo, mid); await interval(mid, hi); return;
        }
        for (const r of page) {
            assert.ok(r._id && !ids.has(r._id), `${collection}记录ID缺失或重复`);
            assert.ok(Number.isFinite(r[field]) && r[field] >= lo && r[field] < hi, `${collection}时间字段无效`);
            ids.add(r._id); rows.push(r);
        }
        slices.push({ start: lo, end: hi, records: page.length });
    }
    // Read all history before snapshot for parent joins, but persist aggregates only.
    await interval(startMs, cutoff);
    const invalid = await query({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: { $lt: 0 } }] });
    assert.equal(invalid.length, 0, `${collection}存在缺失或非法时间，停止汇总`);
    slices.forEach((s, i) => assert.equal(s.start, i ? slices[i - 1].end : startMs));
    assert.equal(slices.at(-1).end, cutoff);
    return { rows, coverage: { collection, field, records: rows.length, requests, slices, serverTotalAvailable: false } };
}

function parseArgs(argv) {
    const args = { outRoot: 'artifacts/cloudbase-daily-report' };
    for (let i = 0; i < argv.length; i += 2) {
        assert.ok(argv[i + 1], '参数缺少值');
        const key = { '--date': 'date', '--date-from': 'from', '--date-to': 'to', '--out-root': 'outRoot' }[argv[i]];
        assert.ok(key, '未知参数'); args[key] = argv[i + 1];
    }
    args.from = args.from || args.date; args.to = args.to || args.date || args.from;
    assert.ok(args.from && args.to, '请指定--date或--date-from/--date-to');
    for (const d of [args.from, args.to]) {
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(d), '日期无效');
        assert.equal(new Date(Date.parse(d + 'T00:00:00Z')).toISOString().slice(0, 10), d, '日期无效');
    }
    assert.ok(args.to >= args.from, '日期范围倒置'); return args;
}

async function run(args) {
    const bundle = createApiKeyBundle(), cutoff = Date.now();
    assert.equal(bundle.envId, 'cloud1-d5gzq8ia0c404ee3e', '未确认的CloudBase环境');
    const days = [], start = shanghaiDayRange(args.from).startMs, last = shanghaiDayRange(args.to).startMs;
    assert.ok(last < cutoff && last - start <= 90 * 86400000, '日期超出范围或尚未开始');
    for (let t = start; t <= last; t += 86400000) days.push(new Date(t + 8 * 3600000).toISOString().slice(0, 10));
    const data = {}, errors = {}, coverage = [];
    await Promise.all(Object.entries(specs).map(async ([key, [collection, field]]) => {
        try { const result = await readCollection(bundle, collection, field, cutoff); data[key] = result.rows; coverage.push(result.coverage); }
        catch (error) { errors[key] = error.message; }
    }));
    let failed = Object.keys(errors).length > 0;
    for (const date of days) {
        const range = shanghaiDayRange(date), end = Math.min(cutoff, range.endMs);
        const report = { schemaVersion: 1, date, environment: bundle.envId, generatedAt: new Date(cutoff).toISOString(), observationEnd: new Date(end).toISOString(), partial: cutoff < range.endMs, coverage };
        for (const [mode, keys, summarize] of [['coop', ['posts', 'runs'], summarizeCoop], ['pvp', ['matches', 'settlements'], summarizePvp]]) {
            try {
                const missing = keys.filter(k => errors[k]);
                if (missing.length) throw new Error(missing.map(k => errors[k]).join('；'));
                report[mode] = summarize(data, range.startMs, end);
            } catch (error) { failed = true; report[mode] = { status: 'unavailable', message: error.message }; }
        }
        const dir = path.resolve(args.outRoot, date); fs.mkdirSync(dir, { recursive: true });
        const target = path.join(dir, 'social_summary.json'), temp = path.join(dir, `.social_summary-${process.pid}.tmp`);
        const lines = JSON.stringify(report, null, 2).split('\n');
        for (let i = 0; i < lines.length; i += 200) {
            const chunk = lines.slice(i, i + 200).join('\n') + '\n';
            if (!i) fs.writeFileSync(temp, chunk, { flag: 'wx' }); else fs.appendFileSync(temp, chunk);
        }
        fs.renameSync(temp, target);
        console.log(JSON.stringify({ date, coop: report.coop.status, pvp: report.pvp.status, output: target }));
    }
    if (failed) throw new Error('部分玩法数据不可得，已在报表显式标记；未将读取失败当作零。');
}

module.exports = { readCollection, parseArgs, run };
if (require.main === module) run(parseArgs(process.argv.slice(2))).catch(error => { console.error(error.message); process.exitCode = 1; });
