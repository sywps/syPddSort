const ID = 'first_level_abc_v1';
const day = ts => new Date(Number(ts) + 8 * 3600000).toISOString().slice(0, 10);
const fields = record => ({ ...record.extra, ...Object.fromEntries(Object.entries(record).filter(([key]) => key.startsWith('firstLevel'))) });
const rate = (n, d) => d ? n / d : null;

/** Cohorts come only from recorded admission events, never reconstructed hashes. */
function buildFirstLevelExperimentReport({ date, funnelRecords, behaviorRecords, levelRecords, nextDayRecords = null }) {
  if (![funnelRecords, behaviorRecords, levelRecords].every(Array.isArray)) {
    return { id: ID, status: 'unavailable', reason: '缺少 first_level_funnel / user_behavior / level_record 导出，不能计算实验结果。' };
  }
  const all = [...funnelRecords, ...behaviorRecords, ...levelRecords];
  const assignment = new Map(), conflicted = new Set(), tested = new Set(), excluded = new Set();
  const exclusionReasons = {};
  let orphanedContextRecords = 0;
  for (const r of all) {
    const f = fields(r);
    if (f.firstLevelExperimentId !== ID || !r.openid) continue;
    if (f.firstLevelExperimentStatus === 'test') tested.add(r.openid);
    if (f.firstLevelExperimentStatus === 'excluded') excluded.add(r.openid);
    if (r.eventName !== 'first_level_experiment_assignment') continue;
    if (f.firstLevelExperimentStatus === 'excluded') {
      const reason = f.firstLevelExperimentReason || 'unknown';
      (exclusionReasons[reason] ||= new Set()).add(r.openid);
    }
    if (f.firstLevelExperimentStatus !== 'enrolled' || !['A', 'B', 'C'].includes(f.firstLevelExperimentBucket)
        || !(f.firstLevelEnrolledAt > 0) || day(f.firstLevelEnrolledAt) !== date) continue;
    const existing = assignment.get(r.openid);
    if (existing && (existing.bucket !== f.firstLevelExperimentBucket || existing.enrolledAt !== f.firstLevelEnrolledAt)) conflicted.add(r.openid);
    assignment.set(r.openid, { bucket: f.firstLevelExperimentBucket, enrolledAt: f.firstLevelEnrolledAt });
  }
  // A user who entered a manual preview or incompatible content cannot be a clean experiment sample.
  for (const r of all) {
    const a = assignment.get(r.openid);
    if (!a) continue;
    const f = fields(r);
    if (f.firstLevelExperimentStatus === 'enrolled' && (f.firstLevelExperimentBucket !== a.bucket
        || f.firstLevelContentVersion !== `${a.bucket}_v1`)) conflicted.add(r.openid);
    if (r.eventName === 'first_level_experiment_exposure') {
      const expected = a.bucket === 'A' ? 'LevelData/level_1' : `LevelData/${a.bucket}`;
      if (r.extra?.contentPath !== expected) conflicted.add(r.openid);
    }
  }
  const groups = ['A', 'B', 'C'].map(bucket => {
    const users = new Set([...assignment].filter(([uid, a]) => a.bucket === bucket && !tested.has(uid) && !conflicted.has(uid) && !excluded.has(uid)).map(([uid]) => uid));
    const sets = Object.fromEntries(['loaded', 'exposed', 'passed1', 'entered2', 'passed3', 'loadFailed', 'errors', 'guide1Shown', 'guide1Done', 'guide2Shown', 'guide2Done'].map(k => [k, new Set()]));
    const passDurations = new Map();
    for (const r of all) {
      if (!users.has(r.openid)) continue;
      const f = fields(r), ts = Number(r.timestamp || r.endTime || 0), a = assignment.get(r.openid);
      if (ts < a.enrolledAt || !ts || day(ts) !== date) continue;
      if (f.firstLevelExperimentId !== ID || f.firstLevelExperimentStatus !== 'enrolled' || f.firstLevelExperimentBucket !== bucket) {
        orphanedContextRecords++; continue;
      }
      const add = key => sets[key].add(r.openid);
      const level = Number(r.logicalLevelId || r.levelId);
      const isMain = (r.gameplayEntryMode || r.extra?.gameplayEntryMode) === 'main';
      if (r.eventName === 'first_level_content_load') add(r.success === true ? 'loaded' : 'loadFailed');
      if (r.eventName === 'first_level_experiment_exposure' && r.success === true) add('exposed');
      if (isMain && r.eventName === 'enter_level' && level === 2) add('entered2');
      const passed = r.eventName === 'level_pass' || r.passStatus === true || r.passStatus === 1;
      if (isMain && passed && level === 1) add('passed1');
      if (isMain && passed && level === 3) add('passed3');
      if (level === 1 && ['pch_guide_step_shown', 'pch_guide_step_done'].includes(r.eventName) && [1, 2].includes(Number(r.stepId))) {
        add(`guide${r.stepId}${r.eventName.endsWith('shown') ? 'Shown' : 'Done'}`);
      }
      if (!['level_fail', 'pch_guide_tap_result'].includes(r.eventName)
          && /runtime_unhandled|fatal|error|failed|unavailable|missing|opening_guide_invalid/.test(`${r.eventName} ${r.errorCode || ''}`)) add('errors');
      if (isMain && level === 1 && (r.passStatus === true || r.passStatus === 1) && Number(r.endTime) >= Number(r.startTime) && Number(r.startTime) > 0) {
        const old = passDurations.get(r.openid);
        if (!old || r.endTime < old.endTime) passDurations.set(r.openid, { endTime: r.endTime, seconds: (r.endTime - r.startTime) / 1000 });
      }
    }
    const nextDate = day(new Date(`${date}T00:00:00+08:00`).getTime() + 86400000);
    const retained = nextDayRecords === null ? null : new Set(nextDayRecords.filter(r => users.has(r.openid)
      && Number(r.timestamp) > 0 && day(r.timestamp) === nextDate && fields(r).firstLevelExperimentStatus !== 'test').map(r => r.openid));
    const durations = [...passDurations.values()].map(x => x.seconds).sort((a, b) => a - b);
    return { bucket, enrolled: users.size, ...Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size])),
      enter2Rate: rate(sets.entered2.size, users.size), pass1Rate: rate(sets.passed1.size, users.size),
      pass3Rate: rate(sets.passed3.size, users.size), retained1: retained?.size ?? null, retention1Rate: retained ? rate(retained.size, users.size) : null,
      guide1CompletionRate: rate(sets.guide1Done.size, sets.guide1Shown.size), guide2CompletionRate: rate(sets.guide2Done.size, sets.guide2Shown.size),
      firstPassDurationSamples: durations.length, firstPassMedianSeconds: durations.length ? (durations[Math.floor((durations.length - 1) / 2)] + durations[Math.floor(durations.length / 2)]) / 2 : null };
  });
  return { id: ID, date, status: 'ready', primaryMetric: '当日进入第二关 UV / 当日实际入组新用户 UV',
    expectedAllocation: { A: 0.34, B: 0.33, C: 0.33 }, groups,
    comparisons: groups.slice(1).map(g => ({ bucket: g.bucket, vs: 'A', enter2RateDifference: g.enter2Rate === null || groups[0].enter2Rate === null ? null : g.enter2Rate - groups[0].enter2Rate })),
    quality: { testUsers: tested.size, excludedUsers: excluded.size, conflictedUsers: conflicted.size, orphanedContextRecords,
      exclusionReasons: Object.fromEntries(Object.entries(exclusionReasons).map(([k, v]) => [k, v.size])), nextDayAvailable: nextDayRecords !== null },
    note: '按实际入组记录去重；测试或冲突用户剔除。次日数据缺失显示未就绪。差值仅为描述，不自动判定胜负。' };
}
function aggregateFirstLevelExperimentReports(reports) {
  if (!reports.length || reports.some(r => r?.status !== 'ready' || r.id !== ID)) {
    return { id: ID, status: 'unavailable', reason: '范围内部分日报缺少新版实验统计，请重建各日日报后再汇总。' };
  }
  const counts = ['enrolled', 'loaded', 'exposed', 'passed1', 'entered2', 'passed3', 'loadFailed', 'errors', 'guide1Shown', 'guide1Done', 'guide2Shown', 'guide2Done', 'firstPassDurationSamples'];
  const groups = ['A', 'B', 'C'].map(bucket => {
    const rows = reports.map(r => r.groups.find(g => g.bucket === bucket));
    const totals = Object.fromEntries(counts.map(k => [k, rows.reduce((sum, r) => sum + r[k], 0)]));
    const matured = rows.filter(r => r.retained1 !== null);
    const retained1 = matured.length ? matured.reduce((sum, r) => sum + r.retained1, 0) : null;
    const retentionDenominator = matured.reduce((sum, r) => sum + r.enrolled, 0);
    return { bucket, ...totals, retained1, retentionDenominator,
      enter2Rate: rate(totals.entered2, totals.enrolled), pass1Rate: rate(totals.passed1, totals.enrolled), pass3Rate: rate(totals.passed3, totals.enrolled),
      retention1Rate: retained1 === null ? null : rate(retained1, retentionDenominator),
      guide1CompletionRate: rate(totals.guide1Done, totals.guide1Shown), guide2CompletionRate: rate(totals.guide2Done, totals.guide2Shown), firstPassMedianSeconds: null };
  });
  return { id: ID, status: 'ready', groups, quality: {
    ...Object.fromEntries(['testUsers', 'excludedUsers', 'conflictedUsers', 'orphanedContextRecords'].map(k => [k, reports.reduce((s, r) => s + r.quality[k], 0)])),
    exclusionReasons: {}, nextDayAvailable: reports.every(r => r.quality.nextDayAvailable),
  }, note: '入组日期构成互斥用户队列。范围次留只计算已取得完整次日数据的队列；质量计数为各日之和。通关中位耗时请看单日日报。不自动判定胜负。' };
}
module.exports = { buildFirstLevelExperimentReport, aggregateFirstLevelExperimentReports };
