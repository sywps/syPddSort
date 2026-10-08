'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Q = require('../scripts/daily-report-quality');
const View = require('../tools/cloudbase-report-dashboard');
const { buildReportContext } = require('../scripts/daily-report-context');
const { buildAnalyticsV2Report } = require('../scripts/analytics-v2-report');
const { buildCsdDetails } = require('../scripts/csd-report');

assert.equal(Q.measure(0, 0).status, 'no_sample');
assert.equal(Q.measure(undefined, 0).status, 'missing');
assert.equal(Q.measure(null, 10).rate, null);
assert.equal(Q.measure(0, 30).rate, 0);
assert.equal(Q.measure(11, 10).status, 'unpaired');
assert.equal(View.rate(0, 0), '无样本');
assert.equal(View.count(null), '未采集');
assert.match(View.rate(0, 1), /0.0%.*小样本/);
const makeDiagnosis = n => ({ coreMetrics: { l1EnterUv: n, l1PassUv: 0, enterLevelUsers: n, adShowPv: n, adFinishPv: 0 },
    firstLevelFunnel: [{ eventName: 'pch_first_store_success', sessions: n }, { eventName: 'pch_first_return_success', sessions: 0 }],
    adPerformance: { overall: { showNum: n, finishNum: 0 } }, first20Levels: [{ levelId: 1, enterUv: n, passUv: 0, enterPv: n, passPv: 0 }],
    recommendations: [{ priority: 'P0', finding: 'stale-zero-warning' }] });
for (const n of [0, 1, 19]) assert.equal(Q.normalizeDiagnosis(makeDiagnosis(n)).recommendations.length, 0);
assert.equal(Q.normalizeDiagnosis(makeDiagnosis(20)).recommendations.length, 3);
const d = makeDiagnosis(0), before = JSON.stringify(d);
const normalized = Q.normalizeDiagnosis(d);
assert.equal(normalized.coreMetrics.l1UvPassRate, null);
assert.equal(normalized.coreMetrics.adFinishRate, null);
assert.equal(normalized.first20Levels[0].uvPassRate, null);
assert.equal(JSON.stringify(d), before, 'display normalization must not mutate saved legacy evidence');
assert.deepEqual(Q.normalizeDiagnosis(normalized), normalized, 'normalization is idempotent');

const base = { openid: 'fixture', levelId: 20, roundId: 'round', gameplayEntryMode: 'main', csdVersion: 3, analyticsEnvironment: 'wechat_release' };
const e = (name, timestamp, extra = {}) => ({ ...base, eventName: name, timestamp, extra, success: true });
const request = (id, timestamp = 10, page = 'freeze_rescue_60s') => ({ ...e('rewarded_ad_request', timestamp,
    { adTransactionId: id, adProvider: 'native', providerStatus: 'loading' }), page });
const ads = buildCsdDetails([request('show'), e('rewarded_ad_show', 40, { adTransactionId: 'show' }),
    e('rewarded_ad_show', 30, { adTransactionId: 'show' }), request('fail'),
    e('rewarded_ad_outcome', 50, { adTransactionId: 'fail', outcomeStatus: 'technical_error' }), request('unknown'),
    request('ambiguous'), request('ambiguous', 11)]);
assert.deepEqual(ads.ads.loadingOutcomes, { shown: 1, failedWithoutShow: 1, unknownWithoutShow: 1 });
assert.equal(ads.ads.clickToShow.p50Ms, 20, 'earliest valid show, not file order');
assert.equal(ads.ads.nativeRequestUsers, 1);
assert.equal(ads.ads.final.ambiguous, 1);
assert.equal(ads.placements[0].page, 'freeze_rescue_60s');
assert.equal(ads.placements[0].ads.final.shown, 1, 'join show without page to its request placement');
const placed = buildCsdDetails([{ ...e('ad_entry_exposure', 1, { mode: 'ad', placement: 'pch_conveyor_expand' }), page: 'level_game' }, request('p', 2, 'pch_conveyor_expand')]);
assert.equal(placed.placements.length, 1, 'entry placement field must take precedence over generic game page');
assert.equal(placed.placements[0].exposure.adEntry.count, 1);
assert.equal(placed.placements[0].ads.nativeRequests, 1);
const unknownFreeze = buildCsdDetails([{ ...e('csd_freeze_effect_result', 1), success: undefined }]);
assert.equal(unknownFreeze.freeze.rejected.count, 0);
assert.equal(unknownFreeze.freeze.unknown.count, 1);
const ambiguousPlacements = buildCsdDetails([request('collision', 1, 'one'), request('collision', 2, 'two')]);
assert.equal(ambiguousPlacements.ads.nativeRequests, 0);
assert.equal(ambiguousPlacements.placements.length, 1);
assert.equal(ambiguousPlacements.placements[0].ads.nativeRequests, 0, 'splitting placements must not make conflicting transactions valid');
assert.equal(ambiguousPlacements.placements[0].ads.final.ambiguous, 1);

const inputs = { behaviorRecords: [e('enter_level', 1), e('level_pass', 20), { ...e('enter_level', 30), levelId: 21 },
    { ...e('enter_level', 10), levelId: 21, openid: 'other' }], funnelRecords: [],
    levelRecords: [{ ...base, _id: 'a', endReason: 'pass', timestamp: 20 }, { ...base, _id: 'b', endReason: 'pass', timestamp: 21 }] };
let modern = buildAnalyticsV2Report(inputs);
assert.equal(modern.levels.length, 20);
assert.equal(modern.levels[19].terminal.pass, 1, 'do not double count duplicate terminal documents');
assert.equal(modern.levels[19].nextLevel.enteredAfterPassUsers, 1, 'same user after pass, not next-level daily totals');
modern = buildAnalyticsV2Report({ ...inputs, levelRecords: [...inputs.levelRecords, { ...base, endReason: 'fail' }] });
assert.equal(modern.levels[19].terminal.pass, 0);
assert.equal(modern.levels[19].terminal.unresolved, 1);
assert.equal(modern.levels[19].terminal.conflictingRounds, 1);
modern = buildAnalyticsV2Report({ ...inputs, levelRecords: [{ ...base, endReason: 'unsupported' }] });
assert.equal(modern.levels[19].terminal.unresolved, 1, 'unknown terminal states are not resolved');

const unknownContext = buildReportContext({ date: '2026-10-08', collections: {} });
assert.equal(unknownContext.windowStatus, 'unknown');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-context-test-'));
try {
    const collections = {};
    for (const name of ['user_behavior', 'first_level_funnel', 'level_record']) {
        const file = path.join(temp, name);
        fs.writeFileSync(file, '');
        const stamp = new Date('2026-10-08T10:48:56+08:00');
        fs.utimesSync(file, stamp, stamp);
        collections[name] = { exportInfo: { localPath: file } };
    }
    assert.equal(buildReportContext({ date: '2026-10-08', collections }).windowStatus, 'partial');
    assert.equal(buildReportContext({ date: '2026-10-07', collections }).windowStatus, 'complete');
    assert.equal(buildReportContext({ date: '2026-09-04-after-101921', collections }).windowStatus, 'unknown');
    const earlier = new Date('2026-10-07T12:00:00+08:00');
    fs.utimesSync(collections.level_record.exportInfo.localPath, earlier, earlier);
    assert.equal(buildReportContext({ date: '2026-10-07', collections }).windowStatus, 'partial', 'one stale collection prevents a complete-day claim');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
const today = { date: '2026-10-08', envId: 'fixture', reportMode: 'main', modeSchemaVersion: 1,
    dailyDiagnosis: d, collections: {}, analyticsV2: { available: true, environmentScope: 'wechat_release', levels: [] },
    reportContext: { capturedAt: Date.parse('2026-10-08T10:48:56+08:00'), dataCutoff: Date.parse('2026-10-08T10:48:56+08:00'), windowStatus: 'partial', builds: [{ id: 'a' }] } };
const whole = { ...today, reportContext: { ...today.reportContext, windowStatus: 'complete' } };
assert.equal(Q.comparable(today, whole), false);
assert.equal(Q.comparable(whole, whole), true);
assert.equal(Q.comparable(whole, { ...whole, envId: 'other' }), false);
assert.equal(Q.comparable(whole, { ...whole, reportMode: 'theme' }), false);
assert.equal(Q.comparable(whole, { ...whole, reportContext: { ...whole.reportContext, builds: [{ id: 'b' }] } }), false);
assert.equal(Q.comparable(whole, { ...whole, reportContext: { ...whole.reportContext, builds: [{ id: 'unknown' }] } }), false);

const html = fs.readFileSync(path.join(__dirname, '../tools/cloudbase-report.html'), 'utf8');
assert.match(html, /<title>拼豆豆 - 数据日报看板<\/title>/);
assert.match(html, /<h1>拼豆豆数据日报看板<\/h1>/);
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(code);
const sandbox = vm.createContext({ DailyReportQuality: Q, CloudbaseReportDashboard: View, URLSearchParams, console,
    Intl, Date, document: {}, window: { location: { search: '' } } });
vm.runInContext(code.slice(0, code.lastIndexOf('init().catch(')), sandbox);
sandbox.fixture = today;
const rendered = vm.runInContext('CloudbaseReportDashboard.render(fixture, [fixture], dashboardUi(fixture), null)', sandbox);
assert.ok(rendered.indexOf('id="report-overview"') < rendered.indexOf('id="report-checks"'));
assert.equal((rendered.match(/data-report-level="\d+"/g) || []).length, 20);
assert.match(rendered, /首关没有进入样本/);
assert.doesNotMatch(rendered, /stale-zero-warning|P0/);
assert.match(rendered, /<details id="report-checks"/);
assert.match(rendered, /历史实验快照/);
assert.equal((rendered.match(/experiment-report-20260918/g) || []).length, 1, 'historical link only in archive');
assert.match(rendered, /全模式覆盖索引不可得/);
assert.match(rendered, /当日部分快照/);
const detail = vm.runInContext('CloudbaseReportDashboard.renderLevel(fixture, 20, dashboardUi(fixture))', sandbox);
assert.match(detail, /新版 CSD 未覆盖/);
assert.match(detail, /无结局样本/);
assert.match(detail, /新版失败原因未采集/);
const funnel = vm.runInContext("renderDiagnosisFunnelTable([{users:0,sessions:0,records:0},{users:0,sessions:0,records:0}])", sandbox);
assert.doesNotMatch(funnel, />0\.0%</);
assert.match(funnel, /无样本/);
console.log('PASS daily report: zero/missing/low samples, legacy guards, time/version comparability, 20-level drilldown, transaction outcomes, preserved title.');
