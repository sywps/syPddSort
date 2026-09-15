'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { summarizeCoop, summarizePvp } = require('../scripts/social-analytics');
const { readCollection, parseArgs } = require('../scripts/social-report-job');
const ui = require('../tools/cloudbase-social-report');

async function main() {
    const posts = [{ _id: 'p', id: 'p', creator: 'secret-owner', levelId: 11, createdAt: 110, published: true, creatorDone: true, completedCount: 9 }];
    const runs = [
        { _id: 'r1', postId: 'p', owner: 'secret-owner', role: 'creator', status: 'complete', createdAt: 110, completedAt: 120 },
        { _id: 'r2', postId: 'p', owner: 'secret-helper', role: 'collaborator', status: 'complete', createdAt: 130, completedAt: 220 },
        { _id: 'r3', postId: 'p', owner: 'secret-helper-2', role: 'collaborator', status: 'playing', createdAt: 150 },
    ];
    const coop = summarizeCoop({ posts, runs }, 100, 200);
    assert.equal(coop.posts, 1); assert.equal(coop.newRunUV, 3); assert.equal(coop.joinedPosts, 1);
    assert.equal(coop.pairedPosts, 0); assert.equal(coop.completionsInPeriod, 1);
    assert.equal(coop.roles[1].completionRate, 0);
    const later = summarizeCoop({ posts, runs }, 200, 300);
    assert.equal(later.posts, 0); assert.equal(later.pairRate, null); assert.equal(later.completionsInPeriod, 1);
    assert.equal(summarizeCoop({ posts, runs }, 100, 300).pairedPosts, 1);
    assert.throws(() => summarizeCoop({ posts: [], runs }, 100, 300), /关联/);
    assert.throws(() => summarizeCoop({ posts, runs: [...runs, runs[0]] }, 100, 300), /重复/);

    const matches = [
        { _id: 'm1', createdAt: 110, playerAOpenid: 'secret-a', playerBOpenid: '', matchType: 'human_replay', levelId: 8, expiresAt: 180, opponentRun: { ownerOpenid: 'historical-only' } },
        { _id: 'm2', createdAt: 115, playerAOpenid: 'secret-b', playerBOpenid: 'secret-c', matchType: 'friend', levelId: 8, expiresAt: 250 },
        { _id: 'm3', createdAt: 150, playerAOpenid: 'secret-a', playerBOpenid: '', matchType: 'bot', levelId: 9, expiresAt: 180 },
    ];
    const settlements = [
        { _id: 's1', matchId: 'm1', openid: 'secret-a', outcome: 'win', settledAt: 190 },
        { _id: 's2', matchId: 'm2', openid: 'secret-b', outcome: 'lose', settledAt: 210 },
        { _id: 's3', matchId: 'm2', openid: 'secret-c', outcome: 'win', settledAt: 210 },
    ];
    const pvp = summarizePvp({ matches, settlements }, 100, 200);
    assert.equal(pvp.matches, 3); assert.equal(pvp.initiatorUV, 2); assert.equal(pvp.settledMatches, 1);
    assert.equal(pvp.humanSettlements, 1); assert.equal(pvp.expiredUnsettled, 1);
    const pvpLater = summarizePvp({ matches, settlements }, 200, 300);
    assert.equal(pvpLater.matches, 0); assert.equal(pvpLater.settlementsInPeriod, 2);
    const friend = summarizePvp({ matches, settlements }, 100, 300).types.find(t => t.type === 'friend');
    assert.equal(friend.settledMatches, 1); assert.equal(friend.humanSettlements, 2); assert.equal(friend.humanWinRate, 0.5);
    const incomplete = summarizePvp({ matches, settlements: settlements.slice(0, 2) }, 100, 300);
    assert.equal(incomplete.partialSettlementMatches, 1); assert.equal(incomplete.settledMatches, 1);
    assert.throws(() => summarizePvp({ matches, settlements: [...settlements, { ...settlements[0], _id: 'duplicate-natural-key' }] }, 100, 300), /重复/);
    assert.ok(!JSON.stringify({ coop, pvp }).includes('secret-'));
    assert.ok(!JSON.stringify(pvp).includes('historical-only'));
    assert.equal(summarizePvp({ matches: [], settlements: [] }, 100, 200).humanWinRate, null);

    const bundle = { baseUrl: 'https://fixture.invalid', apiKey: 'not-real' };
    const fakeRows = Array.from({ length: 1001 }, (_, i) => ({ _id: String(i), createdAt: i }));
    const result = await readCollection(bundle, 'test', 'createdAt', 2000, async url => {
        const filter = JSON.parse(new URL(url).searchParams.get('query'));
        const list = filter.$or ? [] : fakeRows.filter(r => r.createdAt >= filter.createdAt.$gte && r.createdAt < filter.createdAt.$lt).slice(0, 1000);
        return { ok: true, status: 200, json: async () => ({ list }) };
    });
    assert.equal(result.rows.length, 1001); assert.ok(result.coverage.slices.length > 1);
    await assert.rejects(readCollection(bundle, 'test', 'createdAt', 2000, async () => ({ ok: false, status: 403 })), /403/);
    await assert.rejects(readCollection(bundle, 'test', 'createdAt', 2000, async () => ({ ok: true, json: async () => ({}) })), /list/);
    assert.throws(() => parseArgs(['--date', '2026-02-30']), /日期/);

    const html = fs.readFileSync(path.join(__dirname, '../tools/cloudbase-report.html'), 'utf8');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
    new vm.Script(inline);
    const context = vm.createContext({ Intl, document: {}, window: {}, console });
    vm.runInContext(inline.replace(/init\(\)\.catch\([\s\S]*$/, ''), context);
    const helpers = { escapeHtml: context.escapeHtml, renderMetricCard: context.renderMetricCard, renderTable: context.renderTable, renderBulletList: context.renderBulletList };
    const report = { schemaVersion: 1, date: '2026-09-14', partial: true, observationEnd: '2026-09-14T06:00:00Z', coop, pvp };
    const output = ui.render(report, helpers);
    assert.ok(output.includes('合作玩法分析') && output.includes('PvP 玩法分析') && output.includes('今天尚未完整'));
    assert.ok(!output.includes('secret-')); assert.ok(output.includes('11'));
    assert.ok(ui.render({ message: '<script>bad</script>' }, helpers).includes('&lt;script&gt;'));
    const empty = ui.render({ ...report, coop: summarizeCoop({ posts: [], runs: [] }, 100, 200), pvp: summarizePvp({ matches: [], settlements: [] }, 100, 200) }, helpers);
    assert.ok(empty.includes('数据不可得')); assert.ok(!empty.includes('NaN') && !empty.includes('Infinity'));
    const missing = await ui.load('/fixture', report.date, async () => ({ status: 404 })); assert.ok(missing.message.includes('尚未生成'));
    const wrong = await ui.load('/fixture', report.date, async () => ({ ok: true, status: 200, json: async () => ({ ...report, date: '2026-09-13' }) })); assert.ok(wrong.message.includes('格式错误'));
    assert.equal((await ui.load('/fixture', report.date, async () => ({ ok: true, status: 200, json: async () => report }))).coop.posts, 1);
    console.log('PASS: social cohort/event dates, async completion, human-only settlements, privacy, partition integrity, failure states, legacy HTML syntax and render');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
