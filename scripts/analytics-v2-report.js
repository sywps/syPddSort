'use strict';
const fs = require('fs');
const path = require('path');
const { buildCsdDetails } = require('./csd-report');

function unique(records, collection) {
  const seen = new Set();
  return records.filter(x => {
    const id = x.eventId || x.dedupeKey || x._id || (collection === 'level_record' && x.roundId ? x.roundId : '');
    if (!id) return true;
    const key = `${x.openid}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
const uv = rows => new Set(rows.map(x => x.openid).filter(Boolean)).size;
const level = x => Number(x.logicalLevelId || x.levelId);
const roundKey = x => x.roundId ? `${x.openid}:${x.roundId}` : '';
const isMiss = x => !x.success && /^miss/.test(x.extra?.result || x.errorCode || '');

function latestGuideSummaries(records) {
  const latest = new Map();
  for (const x of records.filter(x => x.eventName === 'guide_step_summary')) {
    const key = `${x.openid}:${x.extra?.guideInstanceId}`;
    if (!x.extra?.guideInstanceId) continue;
    const old = latest.get(key);
    if (!old || Number(x.extra.snapshotSeq) > Number(old.extra.snapshotSeq)
      || (Number(x.extra.snapshotSeq) === Number(old.extra.snapshotSeq)
        && Number(x.extra.snapshotAt || x.timestamp) > Number(old.extra.snapshotAt || old.timestamp))) latest.set(key, x);
  }
  return [...latest.values()];
}

function compatibleFunnelRecords(records) {
  const summaries = latestGuideSummaries(records);
  const result = records.filter(x => !(x.eventName === 'pch_guide_tap_result' && Number(x.analyticsSchemaVersion) >= 2));
  for (const x of summaries) for (const [field, success, label] of [['missCount', false, 'miss'], ['hitCount', true, 'success'], ['actionFailureCount', false, 'action_failed']]) {
    if (Number(x.extra[field]) <= 0) continue;
    result.push({ ...x, eventName: 'pch_guide_tap_result', success, measurementCount: Number(x.extra[field]),
      timestamp: x.extra.shownAt || x.timestamp, extra: { ...x.extra, result: label, derivedFromSummary: true } });
  }
  for (const x of records) {
    if (x.eventName === 'level_progress' && level(x) === 3) result.push({ ...x, eventName: `pch_level3_progress_${x.extra?.progressPercent}` });
    if (x.eventName === 'level_pause_snapshot' && level(x) === 3) result.push({ ...x, eventName: `pch_level3_${x.source}_snapshot` });
  }
  return result;
}

function buildAnalyticsV2Report({ behaviorRecords, funnelRecords, levelRecords, asOf = Date.now(), clientBuildId, experimentBucket }) {
  if (![behaviorRecords, funnelRecords, levelRecords].every(Array.isArray)) return { available: false, reason: 'missing_raw_collection' };
  const allRecords = [...behaviorRecords, ...funnelRecords, ...levelRecords];
  const official = allRecords.some(x => x.analyticsEnvironment === 'wechat_release' && Number(x.csdVersion) >= 3);
  const environmentSelected = x => official ? x.analyticsEnvironment === 'wechat_release' && Number(x.csdVersion) >= 3 : Number(x.csdVersion || 0) < 3;
  const modeByRound = new Map(), modeBySession = new Map();
  const explicitMode = x => x.gameplayEntryMode || x.extra?.gameplayEntryMode || x.extra?.entryMode || '';
  for (const x of [...behaviorRecords, ...levelRecords]) {
    const mode = explicitMode(x);
    if (!mode) continue;
    for (const [map, key] of [[modeByRound, roundKey(x)], [modeBySession, `${x.openid}:${x.sessionId}:${level(x)}`]]) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(mode);
    }
  }
  const single = set => set?.size === 1 ? [...set][0] : '';
  const resolveMode = x => explicitMode(x) || single(modeByRound.get(roundKey(x)))
    || single(modeBySession.get(`${x.openid}:${x.sessionId}:${level(x)}`));
  const selected = x => environmentSelected(x) && resolveMode(x) === 'main'
    && !['gold_acquire_reward', 'vigor_recover', 'bean_skin_unlock', 'background_skin_unlock', 'game_circle'].includes(x.page)
    && (!clientBuildId || (x.clientBuildId || x.extra?.clientBuildId) === clientBuildId)
    && (!experimentBucket || (x.experimentBucket || x.abBucket) === experimentBucket);
  const b = unique(behaviorRecords, 'user_behavior').filter(selected), f = unique(funnelRecords, 'first_level_funnel').filter(selected), r = unique(levelRecords, 'level_record').filter(selected);
  const levels = [];
  for (let id = 1; id <= 10; id++) {
    const bs = b.filter(x => level(x) === id), fs = f.filter(x => level(x) === id), rs = r.filter(x => level(x) === id);
    const event = name => bs.filter(x => x.eventName === name);
    const signal = name => fs.filter(x => x.eventName === name);
    const entered = event('enter_level'); const cohort = new Set(entered.map(roundKey).filter(Boolean));
    const cohortRecords = rs.filter(x => cohort.has(roundKey(x)));
    const ended = new Set(cohortRecords.map(roundKey));
    const latest = latestGuideSummaries(fs);
    const sampleMiss = fs.filter(x => x.eventName === 'pch_guide_tap_result' && Number(x.analyticsSchemaVersion) >= 2 && isMiss(x));
    const summaryCounts = new Map(latest.map(x => [x.extra.guideInstanceId, Number(x.extra.missCount || 0)]));
    const missingLatestSummary = sampleMiss.some(x => {
      const key = `${x.sessionId}:${x.roundId}:${x.extra?.guideId}:${x.stepId}`;
      return !summaryCounts.has(key) || Number(x.extra?.sampledMissOrdinal || 1) > summaryCounts.get(key);
    });
    const legacyMiss = fs.filter(x => x.eventName === 'pch_guide_tap_result' && Number(x.analyticsSchemaVersion || 0) < 2 && isMiss(x));
    const guides = signal('pch_guide_step_shown');
    const completed = signal('guide_complete');
    // Legacy overall completion can be derived only with the required distinct steps.
    const legacyDone = new Map();
    for (const x of fs.filter(x => x.eventName === 'pch_guide_step_done' && Number(x.analyticsSchemaVersion || 0) < 2 && x.roundId)) {
      const key = roundKey(x); if (!legacyDone.has(key)) legacyDone.set(key, { row: x, steps: new Set() }); legacyDone.get(key).steps.add(String(x.stepId));
    }
    const legacyCompleted = id === 1 ? [...legacyDone.values()].filter(x => x.steps.size >= 2).map(x => x.row)
      : fs.filter(x => x.eventName === 'pch_guide_step_done' && Number(x.analyticsSchemaVersion || 0) < 2);
    const missingGuideRounds = fs.filter(x => x.eventName === 'pch_guide_step_done' && !x.roundId).length;
    const metric = name => ({ users: uv(event(name)), count: event(name).length });
    const terminal = reason => cohortRecords.filter(x => x.endReason === reason).length;
    const failureReasons = {};
    for (const x of event('level_fail')) { const reason = x.failureReason || 'unknown'; failureReasons[reason] = (failureReasons[reason] || 0) + 1; }
    const pauses = signal('level_pause_snapshot'); const lastState = new Map();
    for (const x of fs.filter(x => ['level_pause_snapshot', 'level_resume'].includes(x.eventName))) {
      const key = roundKey(x); if (key && (!lastState.has(key) || lastState.get(key).timestamp < x.timestamp)) lastState.set(key, x);
    }
    const unresolved = [...cohort].filter(k => !ended.has(k));
    const inferred = unresolved.filter(k => { const x = lastState.get(k); return x?.eventName === 'level_pause_snapshot' && asOf - Number(x.timestamp) >= 1800000; });
    levels.push({ levelId: id, entered: { users: uv(entered), count: entered.length, identifiedRounds: cohort.size },
      ready: { users: uv(signal('level_interaction_ready')), count: signal('level_interaction_ready').length },
      guide: { applicable: id <= 4, eligibleUsers: uv(signal('level_measurement_start').filter(x => x.extra?.guideApplicable)),
        shownUsers: id === 4 && !guides.length && !signal('level_measurement_start').length ? null : uv(guides),
        completedUsers: (id === 1 && missingGuideRounds > 0) || (id === 4 && !signal('level_measurement_start').length)
          ? null : uv([...completed, ...legacyCompleted]),
        knownCompletedUsers: uv([...completed, ...legacyCompleted]),
        missUsers: uv([...legacyMiss, ...sampleMiss, ...latest.filter(x => x.extra.missCount > 0)]),
        missCount: missingLatestSummary ? null : legacyMiss.length + latest.reduce((n, x) => n + Number(x.extra.missCount || 0), 0),
        missingLatestSummary,
        actionFailureCount: latest.reduce((n, x) => n + Number(x.extra.actionFailureCount || 0), 0),
        incompleteStepInstances: latest.filter(x => !x.extra.completed).length,
        legacyMissingRoundRows: missingGuideRounds },
      pass: metric('level_pass'), failureEncounters: metric('level_fail'), failureReasons,
      revived: { users: uv([...event('revive_success'), ...event('share_revive_success')]), count: event('revive_success').length + event('share_revive_success').length },
      terminal: { pass: terminal('pass'), fail: terminal('fail'), abandon: terminal('abandon'),
        explicitExit: cohortRecords.filter(x => x.endReason === 'abandon' && ['settings', 'restart', 'lose_panel_home'].includes(x.exitReason)).length,
        unknownAbandonReason: cohortRecords.filter(x => x.endReason === 'abandon' && !x.exitReason).length,
        inferredUnreturned: inferred.length, unresolved: unresolved.length, unknownRoundRecords: rs.filter(x => !x.roundId).length },
      backgroundUsers: uv(pauses.filter(x => x.source === 'background')),
      exitIntentUsers: uv(signal('level_exit_intent')),
      reviveDeclinedUsers: uv(signal('revive_declined')),
      csd: { ...buildCsdDetails(fs),
        guideCounters: { maxConsecutiveMisses: latest.length ? Math.max(...latest.map(x => Number(x.extra?.maxConsecutiveMisses || 0))) : null,
          missReasons: latest.reduce((out, x) => {
            for (const [reason, count] of Object.entries(x.extra?.missReasons || {})) out[reason] = (out[reason] || 0) + Number(count || 0);
            return out;
          }, {}) } },
      ads: { exposedUsers: uv(signal('ad_entry_exposure').filter(x => Number(x.csdVersion) >= 3 && x.extra?.mode === 'ad')),
        legacyUnknownExposedUsers: uv(signal('ad_entry_exposure').filter(x => Number(x.csdVersion || 0) < 3)), click: metric('ad_click'), show: metric('ad_show'),
        finish: metric('ad_finish'), reward: metric('ad_reward_success'),
        exposureScope: 'pch_conveyor_expand only; do not divide all-placement clicks by this denominator' },
      capacity: { freeGrants: signal('capacity_grant').filter(x => x.success && x.extra?.mode === 'free').length,
        adGrants: signal('capacity_grant').filter(x => x.success && x.extra?.mode === 'ad').length },
    });
  }
  return { available: true, schemaVersion: 2, asOf, levels,
    environmentScope: official ? 'wechat_release' : 'historical_environment_unknown',
    appDiagnostics: buildCsdDetails(unique(funnelRecords, 'first_level_funnel').filter(x => environmentSelected(x) && Number(x.logicalLevelId || x.levelId || 0) === 0)),
    filters: { clientBuildId: clientBuildId || null, experimentBucket: experimentBucket || null, mode: 'main (explicit or unambiguous linked attribution)' },
    quality: { duplicateRows: behaviorRecords.length + funnelRecords.length + levelRecords.length
        - unique(behaviorRecords, 'user_behavior').length - unique(funnelRecords, 'first_level_funnel').length - unique(levelRecords, 'level_record').length,
      missingBehaviorRound: b.filter(x => ['enter_level', 'level_pass', 'level_fail'].includes(x.eventName) && !x.roundId).length,
      excludedEnvironmentRows: allRecords.filter(x => !environmentSelected(x)).length,
      unknownGameplayModeRows: allRecords.filter(x => level(x) > 0 && !resolveMode(x)).length,
      missingFunnelBuild: f.filter(x => !x.clientBuildId && !x.extra?.clientBuildId).length,
      extraDroppedKeys: f.reduce((n, x) => n + Number(x.extraDroppedKeyCount || 0), 0) },
    notes: ['UVs overlap across outcomes; only identified entry-cohort rounds have mutually exclusive terminal states.',
      'inferredUnreturned is a subset of unresolved, not confirmed abandonment/crash; late returns revise it.',
      'Missing historical round IDs remain unknown. Guide snapshots use maximum cumulative sequence, never sums.'] };
}

function readCollection(dir, name) {
  const folder = path.join(dir, name);
  if (!fs.existsSync(folder)) return null;
  const file = fs.readdirSync(folder).find(x => x.startsWith('database_export'));
  if (!file) return null;
  return fs.readFileSync(path.join(folder, file), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
}
function buildAnalyticsV2FromSummaries(summaries) {
  const load = name => {
    const rows = [];
    for (const summary of summaries) {
      const file = summary.collections?.[name]?.exportInfo?.localPath || summary.collections?.[name]?.summary?.inputPath;
      if (!file || !fs.existsSync(file)) return null;
      rows.push(...fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse));
    }
    return rows;
  };
  return buildAnalyticsV2Report({ behaviorRecords: load('user_behavior'), funnelRecords: load('first_level_funnel'), levelRecords: load('level_record') });
}
function renderAnalyticsV2(report) {
  if (!report.available) return '# CSD 检查\n\n原始数据缺失，无法生成。\n';
  return '# 前十关 CSD 检查\n\n采集范围：' + (report.environmentScope === 'wechat_release' ? '已确认微信正式版本' : '历史环境未知，不能视为已验证正式数据')
    + '。人数跨结果可重叠；终局仅统计有局标识且在进入队列中的记录。缺失结局不等于失败。\n\n|关卡|进入人数|引导展示|引导完成|未命中人数/次数|通关人数|失败人数|复活人数|主动放弃局|未决局|\n|---|---:|---:|---:|---|---:|---:|---:|---:|---:|\n'
    + report.levels.map(x => `|${x.levelId}|${x.entered.users}|${x.guide.applicable ? x.guide.shownUsers ?? '未知' : '不适用'}|${x.guide.applicable ? x.guide.completedUsers ?? '未知' : '不适用'}|${x.guide.missUsers}/${x.guide.missCount ?? '未知'}|${x.pass.users}|${x.failureEncounters.users}|${x.revived.users}|${x.terminal.explicitExit}（另有${x.terminal.unknownAbandonReason}局中断原因未知）|${x.terminal.unresolved}|`).join('\n')
    + '\n\n质量统计：' + JSON.stringify(report.quality) + '\n';
}
if (require.main === module) {
  const dir = process.argv[2]; if (!dir) throw new Error('Usage: node scripts/analytics-v2-report.js <daily-export-directory>');
  const report = buildAnalyticsV2Report({ behaviorRecords: readCollection(dir, 'user_behavior'), funnelRecords: readCollection(dir, 'first_level_funnel'), levelRecords: readCollection(dir, 'level_record') });
  fs.writeFileSync(path.join(dir, 'analytics_v2.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, 'analytics_v2.md'), renderAnalyticsV2(report));
  console.log('Analytics v2 report written; available=' + report.available);
}
module.exports = { buildAnalyticsV2Report, latestGuideSummaries, renderAnalyticsV2, compatibleFunnelRecords, buildAnalyticsV2FromSummaries };
