'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { collect, summarize } = require('../scripts/douyin-analytics-report');
const install = require('../scripts/install-douyin-analytics');
const names = ['user_behavior', 'first_level_funnel', 'level_record'];
const date = '2026-10-10', timestamp = Date.parse(date + 'T12:00:00+08:00'), capturedAt = timestamp + 1000;
const envelope = { analyticsEnvironment: 'douyin_dev', analyticsSchemaVersion: 2, csdVersion: 3,
    appId: 'ttf45082ed6a36c15802', envId: 'env-nvk6FNcrq5', openid: 'a'.repeat(64),
    timestamp, receivedAt: timestamp, sessionId: 's', roundId: 'r', gameplayEntryMode: 'main', levelId: 1, logicalLevelId: 1 };
const rows = [
    [{ ...envelope, _id: 'b'.repeat(64), eventId: 'enter', eventName: 'enter_level' }],
    [{ ...envelope, _id: 'c'.repeat(64), eventId: 'pass', eventName: 'level_pass' }],
    [{ ...envelope, _id: 'd'.repeat(64), eventId: 'terminal', endReason: 'pass', passStatus: true }],
];
const pages = names.map((collection, i) => ({ ok: true, analyticsEnvironment: 'douyin_dev', date, capturedAt,
    collection, after: '', nextCursor: '', hasMore: false, totalRecords: rows[i].length, records: rows[i] }));
const report = summarize(pages);
assert.equal(report.analyticsV2.environmentScope, 'douyin_dev');
assert.equal(report.analyticsV2.levels[0].entered.users, 1);
assert.equal(report.analyticsV2.levels[0].terminal.pass, 1);
const mpRows = ['coop', 'pvp'].flatMap((mode, i) => [
    { ...envelope, _id: String(i * 3 + 1).repeat(64), eventId: mode + ':lobby', gameplayEntryMode: mode,
        eventName: 'multiplayer_lobby_open', roundId: '', levelId: 0, logicalLevelId: 0 },
    { ...envelope, _id: String(i * 3 + 2).repeat(64), eventId: mode + ':failure', gameplayEntryMode: mode,
        eventName: 'multiplayer_service_result', success: false, roundId: '', levelId: 0, logicalLevelId: 0 },
    { ...envelope, _id: String(i * 3 + 3).repeat(64), eventId: mode + ':end', gameplayEntryMode: mode,
        eventName: 'multiplayer_round_end', roundId: mode + ':round', extra: { outcome: mode === 'coop' ? 'completed' : 'lose' } },
]);
const mpEntries = ['coop', 'pvp'].map((mode, i) => ({ ...envelope, _id: String(i + 7).repeat(64),
    eventId: mode + ':entry', gameplayEntryMode: mode, eventName: 'enter_level', roundId: mode + ':round' }));
const mixedReport = summarize([
    { ...pages[0], records: [...rows[0], ...mpEntries], totalRecords: 3 },
    { ...pages[1], records: [...rows[1], ...mpRows], totalRecords: 7 }, pages[2],
]);
assert.deepStrictEqual(mixedReport.analyticsV2.levels, report.analyticsV2.levels, 'multiplayer must not enter mainline level statistics');
for (const mode of ['coop', 'pvp']) {
    assert.equal(mixedReport.multiplayer[mode].lobbyOpens, 1);
    assert.equal(mixedReport.multiplayer[mode].serviceFailures, 1);
    assert.equal(mixedReport.multiplayer[mode].enteredRounds, 1);
    assert.equal(mixedReport.multiplayer[mode].observedEndedRounds, 1);
    assert.equal(mixedReport.multiplayer[mode].unresolvedRounds, 0);
}
assert.equal(mixedReport.multiplayer.pvp.localOutcomes.lose, 1);
const legacyRows = [
    { ...envelope, _id: 'e'.repeat(64), eventId: 'legacy-share', eventName: 'share_success', page: 'win_bonus_reward',
        roundId: '', gameplayEntryMode: '', extra: { roundAttribution: 'legacy_missing' } },
    { ...envelope, _id: 'f'.repeat(64), eventId: 'legacy-profile', eventName: 'ad_finish', page: 'profile_frame_unlock' },
];
const legacyReport = summarize([{ ...pages[0], records: [...rows[0], ...legacyRows], totalRecords: 3 }, ...pages.slice(1)]);
assert.deepStrictEqual(legacyReport.analyticsV2, report.analyticsV2, 'legacy missing rounds and profile ads cannot alter round metrics');
assert.equal(legacyReport.counts.user_behavior.share_success, 1, 'keep delivery event counts');
assert.throws(() => collect(pages.slice(1)), /Missing collection/);
assert.throws(() => collect([{ ...pages[0], hasMore: true, nextCursor: rows[0][0]._id }, ...pages.slice(1)]), /Missing or inconsistent/);
assert.throws(() => collect([{ ...pages[0], capturedAt: capturedAt + 1 }, ...pages.slice(1)]), /Mixed/);
assert.throws(() => collect([{ ...pages[0], totalRecords: 2 }, ...pages.slice(1)]), /Incomplete/);
assert.throws(() => collect([{ ...pages[0], records: [{ ...rows[0][0], analyticsEnvironment: 'wechat_release' }] }, ...pages.slice(1)]), /Invalid, mixed/);
const tmpRoot = path.resolve('.planning/douyin-analytics-implementation-20261010');
fs.mkdirSync(tmpRoot, { recursive: true });
const tmp = fs.mkdtempSync(path.join(tmpRoot, 'installer-test-'));
try {
    const game = path.join(tmp, 'game.js');
    fs.writeFileSync(game, 'globalThis.__PDD_DOUYIN_CLOUD_ENV__="";\nrequire("entry");\n');
    const original = fs.readFileSync(game, 'utf8');
    assert.equal(install(tmp, {}), 'off'); assert.equal(fs.readFileSync(game, 'utf8'), original);
    assert.throws(() => install(tmp, { PDD_DOUYIN_ANALYTICS_MODE: 'release' }), /disabled/);
    assert.throws(() => install(tmp, { PDD_DOUYIN_ANALYTICS_MODE: 'dev' }), /build ID/);
    const env = { PDD_DOUYIN_ANALYTICS_MODE: 'dev', PDD_DOUYIN_ANALYTICS_BUILD_ID: 'test' };
    assert.throws(() => install(tmp, { ...env, PDD_DOUYIN_CLOUD_ENV: 'anything' }), /business cloud/);
    install(tmp, env); install(tmp, env);
    assert.equal((fs.readFileSync(game, 'utf8').match(/__PDD_DOUYIN_ANALYTICS__/g) || []).length, 1);
    install(tmp, {}); assert.equal(fs.readFileSync(game, 'utf8'), original);
} finally {
    fs.unlinkSync(path.join(tmp, 'game.js')); fs.rmdirSync(tmp);
}
console.log('PASS Douyin complete export chain, environment isolation, report counters, dev build guards');
