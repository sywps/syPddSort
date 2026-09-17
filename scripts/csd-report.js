'use strict';
const countUsers = rows => new Set(rows.map(x => x.openid).filter(Boolean)).size;
const metric = rows => ({ count: rows.length, users: countUsers(rows) });
const transactionKey = x => {
  const id = x.adTransactionId || x.extra?.adTransactionId;
  return id ? `${x.openid}:${id}` : '';
};
function latency(values) {
  const xs = values.filter(x => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  const at = p => xs.length ? xs[Math.max(0, Math.ceil(xs.length * p) - 1)] : null;
  return { samples: xs.length, p50Ms: at(.5), p90Ms: at(.9), p95Ms: at(.95) };
}
function buildCsdDetails(rows) {
  const events = name => rows.filter(x => x.eventName === name);
  const ads = new Map();
  for (const x of rows) {
    const key = transactionKey(x);
    if (!key) continue;
    if (!ads.has(key)) ads.set(key, []);
    ads.get(key).push(x);
  }
  const waits = [], all = [], origin = {}, final = { shown: 0, completed: 0, rewarded: 0, failed: 0, incomplete: 0, unknown: 0, ambiguous: 0 };
  let nativeRequests = 0;
  for (const list of ads.values()) {
    const requests = list.filter(x => x.eventName === 'rewarded_ad_request');
    if (!requests.length) continue;
    if (requests.length !== 1) { final.ambiguous++; continue; }
    const request = requests[0];
    if (request.extra?.adProvider !== 'native') continue;
    nativeRequests++;
    const subsequent = list.filter(x => Number(x.timestamp) >= Number(request.timestamp));
    const show = subsequent.find(x => x.eventName === 'rewarded_ad_show');
    const complete = subsequent.some(x => x.eventName === 'rewarded_ad_close' && x.extra?.isEnded === true);
    const reward = subsequent.some(x => x.eventName === 'rewarded_ad_reward_success' && x.success === true);
    const failed = subsequent.some(x => x.eventName === 'rewarded_ad_outcome' && x.extra?.outcomeStatus === 'technical_error');
    const incomplete = subsequent.some(x => x.eventName === 'rewarded_ad_outcome' && x.extra?.outcomeStatus === 'verified_incomplete');
    if (show) { final.shown++; all.push(Number(show.timestamp) - Number(request.timestamp)); }
    if (complete) final.completed++;
    if (reward) final.rewarded++;
    if (failed) final.failed++;
    if (incomplete) final.incomplete++;
    if (!reward && !failed && !incomplete) final.unknown++;
    if (request.extra?.providerStatus === 'loading') {
      waits.push(request);
      const source = request.extra?.loadOrigin || 'unknown';
      origin[source] = (origin[source] || 0) + 1;
    }
  }
  const blocks = events('csd_input_block_summary');
  const effects = events('csd_freeze_effect_result');
  const freezeRewards = events('rewarded_ad_reward_success').filter(x => x.success
    && ['skill_freeze_acquire', 'freeze_rescue_60s'].includes(x.page || x.extra?.page));
  const appliedKeys = new Set(effects.filter(x => x.success).map(transactionKey).filter(Boolean));
  const rejectedKeys = new Set(effects.filter(x => !x.success).map(transactionKey).filter(Boolean));
  const knownExposure = events('ad_entry_exposure').filter(x => Number(x.csdVersion) >= 3 && x.extra?.mode === 'ad');
  const freeExposure = events('csd_free_capacity_entry_exposure');
  const guideReasons = {};
  for (const x of events('pch_guide_tap_result').filter(x => !x.success)) {
    const reason = x.extra?.missReason || x.extra?.result || x.errorCode || 'unknown';
    guideReasons[reason] = (guideReasons[reason] || 0) + 1;
  }
  const technical = rows.filter(x => ['runtime_error', 'runtime_unhandled_rejection', 'csd_game_circle_native_error'].includes(x.eventName));
  return {
    exposure: { adEntry: metric(knownExposure), freeEntry: metric(freeExposure),
      historicalUnknown: metric(events('ad_entry_exposure').filter(x => Number(x.csdVersion || 0) < 3)) },
    ads: { nativeRequests, waiting: metric(waits), waitOrigin: origin, clickToShow: latency(all), final,
      definition: '客户端原生展示信号，不是平台结算曝光；最终结果可重叠，未知不是失败' },
    input: { episodes: metric(blocks), recovered: blocks.filter(x => x.extra?.outcome === 'recovered').length,
      foregroundDuration: latency(blocks.map(x => x.extra?.foregroundMs)),
      unfinished: blocks.filter(x => x.extra?.observationComplete !== true).length,
      definition: '非预期阻挡候选片段；前台采样时长，不代表无法游玩人数' },
    guideSampleReasons: guideReasons,
    freeze: { applied: metric(effects.filter(x => x.success)), rejected: metric(effects.filter(x => !x.success)),
      withAdTransaction: effects.filter(transactionKey).length,
      rewardedButEffectRejected: freezeRewards.filter(x => rejectedKeys.has(transactionKey(x)) && !appliedKeys.has(transactionKey(x))).length,
      rewardedWithoutEffectEvidence: freezeRewards.filter(x => !appliedKeys.has(transactionKey(x)) && !rejectedKeys.has(transactionKey(x))).length },
    technical: metric(technical), gameCircleErrors: metric(events('csd_game_circle_native_error')),
    memoryWarnings: metric(events('runtime_memory_warning')),
    boardResults: events('csd_board_action_summary').reduce((out, x) => {
      for (const k of ['no_pattern_hit', 'invalid', 'capacity_blocked', 'stored', 'partial', 'inactive']) out[k] = (out[k] || 0) + Number(x.extra?.[k] || 0);
      return out;
    }, {}),
  };
}
module.exports = { buildCsdDetails, latency };
