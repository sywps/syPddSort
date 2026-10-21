'use strict';
// Read saved console exports; dev and prod must never share a report.
const fs = require('fs');
const path = require('path');
const { buildAnalyticsV2Report, renderAnalyticsV2 } = require('./analytics-v2-report');
const NAMES = ['user_behavior', 'first_level_funnel', 'level_record'];
function collect(pages) {
    if (!pages.length) throw Error('No export pages');
    const { date, capturedAt, clientBuildId, since, analyticsEnvironment } = pages[0];
    const envId = { douyin_dev: 'env-nvk6FNcrq5', douyin_release: 'env-XzE6JatzwX' }[analyticsEnvironment];
    if (!envId) throw Error('Invalid export environment');
    const start = Date.parse(date + 'T00:00:00+08:00');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isSafeInteger(capturedAt) || !Number.isFinite(start) || capturedAt < start) throw Error('Invalid export metadata');
    if (clientBuildId !== undefined && (typeof clientBuildId !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(clientBuildId))) throw Error('Invalid export build filter');
    if (since !== undefined && (!Number.isSafeInteger(since) || since < start || since >= Math.min(start + 86400000, capturedAt))) throw Error('Invalid export time filter');
    const result = {};
    for (const page of pages) {
        if (page.ok !== true || page.analyticsEnvironment !== analyticsEnvironment || page.date !== date || page.capturedAt !== capturedAt ||
            page.clientBuildId !== clientBuildId || page.since !== since ||
            !NAMES.includes(page.collection) || !Array.isArray(page.records) || !Number.isSafeInteger(page.totalRecords) || page.totalRecords < 0) throw Error('Mixed or invalid export pages');
    }
    for (const name of NAMES) {
        const chunks = pages.filter(page => page.collection === name);
        if (!chunks.length) throw Error('Missing collection: ' + name);
        const byCursor = new Map();
        for (const chunk of chunks) {
            if (byCursor.has(chunk.after)) throw Error('Duplicate export cursor');
            byCursor.set(chunk.after, chunk);
        }
        let cursor = '', visited = new Set();
        const rows = [], ids = new Set();
        for (;;) {
            if (visited.has(cursor)) throw Error('Cyclic export cursor');
            visited.add(cursor);
            const chunk = byCursor.get(cursor);
            if (!chunk || chunk.totalRecords !== chunks[0].totalRecords || typeof chunk.hasMore !== 'boolean') throw Error('Missing or inconsistent export page');
            for (const row of chunk.records) {
                if (!/^[a-f0-9]{64}$/.test(row._id || '') || ids.has(row._id) ||
                    row.analyticsEnvironment !== analyticsEnvironment || row.appId !== 'ttf45082ed6a36c15802' || row.envId !== envId ||
                    !/^[a-f0-9]{64}$/.test(row.openid || '') || row.timestamp < (since === undefined ? start : since) || row.timestamp >= Math.min(start + 86400000, capturedAt) ||
                    (clientBuildId !== undefined && row.clientBuildId !== clientBuildId) ||
                    !Number.isFinite(row.timestamp) || !Number.isFinite(row.receivedAt) || row.receivedAt > capturedAt) throw Error('Invalid, mixed or duplicate record');
                ids.add(row._id); rows.push(row);
            }
            if (!chunk.hasMore) { if (chunk.nextCursor) throw Error('Unexpected terminal cursor'); break; }
            if (!chunk.records.length || chunk.nextCursor !== chunk.records[chunk.records.length - 1]._id) throw Error('Invalid next cursor');
            cursor = chunk.nextCursor;
        }
        if (visited.size !== chunks.length || rows.length !== chunks[0].totalRecords) throw Error('Incomplete export: ' + name);
        result[name] = rows;
    }
    return { date, capturedAt, analyticsEnvironment, ...(clientBuildId === undefined ? {} : { clientBuildId }),
        ...(since === undefined ? {} : { since }), records: result };
}
function summarize(pages) {
    const data = collect(pages);
    // Do not let the shared report infer a missing source round from session + level hints.
    // These rows remain in raw exports and event counts for delivery auditing.
    const roundEligible = row => row.extra?.roundAttribution !== 'legacy_missing'
        && !['profile_avatar_unlock', 'profile_frame_unlock'].includes(row.page);
    const analyticsV2 = buildAnalyticsV2Report({ behaviorRecords: data.records.user_behavior.filter(roundEligible),
        funnelRecords: data.records.first_level_funnel.filter(roundEligible), levelRecords: data.records.level_record,
        analyticsEnvironment: data.analyticsEnvironment, asOf: data.capturedAt });
    const counts = {};
    for (const name of NAMES) {
        counts[name] = {};
        for (const row of data.records[name]) {
            const key = row.eventName || row.endReason;
            counts[name][key] = (counts[name][key] || 0) + 1;
        }
    }
    const multiplayer = {};
    const roundKey = row => row.roundId ? JSON.stringify([row.openid, row.sessionId, row.roundId]) : '';
    for (const mode of ['coop', 'pvp']) {
        const behavior = data.records.user_behavior.filter(row => row.gameplayEntryMode === mode);
        const funnel = data.records.first_level_funnel.filter(row => row.gameplayEntryMode === mode);
        const terminals = data.records.level_record.filter(row => row.gameplayEntryMode === mode);
        const entries = new Set(behavior.filter(row => row.eventName === 'enter_level').map(roundKey).filter(Boolean));
        const ended = new Set([...terminals, ...funnel.filter(row => row.eventName === 'multiplayer_round_end')].map(roundKey).filter(Boolean));
        const localOutcomes = {}, seen = new Set();
        for (const row of funnel.filter(row => row.eventName === 'multiplayer_round_end')) {
            const key = roundKey(row);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const outcome = row.extra?.outcome || 'unknown';
            localOutcomes[outcome] = (localOutcomes[outcome] || 0) + 1;
        }
        multiplayer[mode] = {
            lobbyOpens: funnel.filter(row => row.eventName === 'multiplayer_lobby_open').length,
            serviceFailures: funnel.filter(row => row.eventName === 'multiplayer_service_result' && row.success === false).length,
            enteredRounds: entries.size, observedEndedRounds: [...entries].filter(key => ended.has(key)).length,
            unresolvedRounds: [...entries].filter(key => !ended.has(key)).length, localOutcomes,
            note: '本地结果不代表云端结算或奖励到账；只有入口/服务失败不能算开局；未决不等于流失。',
        };
    }
    return { ...data, analyticsV2, counts, multiplayer };
}
function main(argv) {
    if (argv.length !== 1) throw Error('Usage: node scripts/douyin-analytics-report.js <directory of saved export JSON pages>');
    const input = path.resolve(argv[0]);
    const pages = fs.readdirSync(input).filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(input, name), 'utf8')));
    const report = summarize(pages);
    const output = path.resolve('artifacts/douyin-daily-report', report.analyticsEnvironment, report.date, String(report.capturedAt));
    if (fs.existsSync(output)) throw Error('Report snapshot already exists; refusing to overwrite');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'analytics_v2.json'), JSON.stringify(report.analyticsV2, null, 2));
    fs.writeFileSync(path.join(output, 'analytics_v2.md'), renderAnalyticsV2(report.analyticsV2));
    fs.writeFileSync(path.join(output, 'event_counts.json'), JSON.stringify(report.counts, null, 2));
    fs.writeFileSync(path.join(output, 'multiplayer.json'), JSON.stringify(report.multiplayer, null, 2));
    const scope = { date: report.date, capturedAt: report.capturedAt, analyticsEnvironment: report.analyticsEnvironment, clientBuildId: report.clientBuildId, since: report.since };
    fs.writeFileSync(path.join(output, 'export_scope.json'), JSON.stringify(scope, null, 2));
    const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const rows = report.analyticsV2.levels.map(row => `<tr><td>${row.levelId}</td><td>${row.entered.users}</td><td>${row.pass.users}</td><td>${row.failureEncounters.users}</td><td>${row.terminal.pass}</td><td>${row.terminal.unresolved}</td></tr>`).join('');
    const environmentTitle = report.analyticsEnvironment === 'douyin_dev' ? 'dev' : 'prod';
    fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>抖音 ${environmentTitle} 埋点核对</title><style>body{font:16px system-ui;max-width:1080px;margin:40px auto;padding:20px;color:#182c3c}table{border-collapse:collapse;width:100%}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}pre{white-space:pre-wrap;background:#f4f6f8;padding:20px}</style>` +
        `<h1>抖音 ${environmentTitle} 埋点核对 · ${escape(report.date)}</h1><p>${environmentTitle === 'dev' ? '非正式运营数据。' : '生产环境导出数据。'}数据截止 ${escape(new Date(report.capturedAt).toISOString())}（UTC）。未决局不等于流失；失败人数可与通过人数重叠。</p>` +
        `<p>版本筛选：${escape(report.clientBuildId === undefined ? '全部版本' : report.clientBuildId)}；开始时间：${escape(report.since === undefined ? '当日零点（北京时间）' : new Date(report.since).toISOString() + '（UTC）')}。筛选后的结果仅代表该范围。</p>` +
        '<table><thead><tr><th>关卡</th><th>进入人数</th><th>通过人数</th><th>失败遭遇人数</th><th>通过局数</th><th>未决局数</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<h2>合作与 PVP（与主线分开）</h2><pre>' + escape(JSON.stringify(report.multiplayer, null, 2)) + '</pre>' +
        '<h2>主线完整核对明细</h2><pre>' + escape(renderAnalyticsV2(report.analyticsV2)) + '</pre><h2>事件数量（各表分别计数）</h2><pre>' + escape(JSON.stringify(report.counts, null, 2)) + '</pre></html>');
    console.log('Verified all export pages; report:', path.join(output, 'index.html'));
}
module.exports = { collect, summarize, main };
if (require.main === module) { try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
