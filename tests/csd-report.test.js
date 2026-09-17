const assert = require('node:assert/strict');
const { buildCsdDetails } = require('../scripts/csd-report');
const { buildAnalyticsV2Report } = require('../scripts/analytics-v2-report');
const base = { openid: 'fixture', roundId: 'r', levelId: 3, gameplayEntryMode: 'main', csdVersion: 3, analyticsEnvironment: 'wechat_release' };
const e = (eventName, timestamp, extra = {}, success = true) => ({ ...base, eventName, timestamp, success, extra });
const rows = [e('ad_entry_exposure', 1, { mode: 'ad' }), e('csd_free_capacity_entry_exposure', 2),
  e('rewarded_ad_request', 10, { adTransactionId: 'a', adProvider: 'native', providerStatus: 'loading', loadOrigin: 'replenishment' }),
  e('rewarded_ad_show', 3010, { adTransactionId: 'a' }),
  e('rewarded_ad_close', 6010, { adTransactionId: 'a', isEnded: true }),
  e('rewarded_ad_reward_success', 6020, { adTransactionId: 'different' }),
  e('csd_freeze_effect_result', 6100, { adTransactionId: 'a' }),
  e('csd_input_block_summary', 7000, { outcome: 'recovered', observationComplete: true, foregroundMs: 1000 })];
const r = buildCsdDetails(rows);
assert.equal(r.ads.waiting.count, 1); assert.equal(r.ads.clickToShow.p50Ms, 3000);
assert.equal(r.ads.final.completed, 1); assert.equal(r.ads.final.rewarded, 0); assert.equal(r.ads.final.unknown, 1);
assert.equal(r.exposure.adEntry.count, 1); assert.equal(r.exposure.freeEntry.count, 1); assert.equal(r.input.recovered, 1);
const legacy = { ...e('enter_level', 1), csdVersion: 0, analyticsEnvironment: '' };
const report = buildAnalyticsV2Report({ behaviorRecords: [e('enter_level', 2), legacy], funnelRecords: rows, levelRecords: [] });
assert.equal(report.environmentScope, 'wechat_release'); assert.equal(report.levels[2].entered.count, 1);
assert.equal(report.quality.excludedEnvironmentRows, 1);
const old = buildAnalyticsV2Report({ behaviorRecords: [legacy], funnelRecords: [], levelRecords: [] });
assert.equal(old.environmentScope, 'historical_environment_unknown');
console.log('PASS CSD report: free/ad separation, exact transaction joins, unknown reward, official/legacy isolation');
