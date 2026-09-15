const ID = 'bean_selection_ab_v1';
const day = value => Number.isFinite(Number(value)) && Number(value) > 0 ? new Date(Number(value) + 28800000).toISOString().slice(0, 10) : '';
const fields = r => ({ ...r.extra, ...Object.fromEntries(Object.entries(r).filter(([k]) => /^(beanSelection|firstLevel)/.test(k))) });
const rate = (n, d) => d ? n / d : null;

function buildBeanSelectionExperimentReport({ date, funnelRecords, behaviorRecords, levelRecords, nextDayRecords = null }) {
  if (![funnelRecords, behaviorRecords, levelRecords].every(Array.isArray)) return { id: ID, status: 'unavailable', reason: '缺少实验事件或关卡记录导出。' };
  const all = [...funnelRecords, ...behaviorRecords, ...levelRecords];
  const assignments = new Map(), invalid = new Set(), rounds = new Map();
  for (const r of all) {
    if (!r.openid) continue;
    const f = fields(r);
    if (f.beanSelectionExperimentId !== ID) continue;
    if (['test', 'excluded'].includes(f.beanSelectionExperimentStatus)) { invalid.add(r.openid); continue; }
    if (f.beanSelectionExperimentStatus !== 'enrolled' || !['A', 'B'].includes(f.beanSelectionExperimentBucket)) continue;
    const a = { bucket: f.beanSelectionExperimentBucket, at: Number(f.beanSelectionEnrolledAt), first: /^[ABC]_v1$/.test(f.firstLevelContentVersion) ? f.firstLevelContentVersion[0] : 'unknown' };
    if (day(a.at) !== date) continue;
    const old = assignments.get(r.openid);
    if (old && (old.bucket !== a.bucket || old.at !== a.at || (old.first !== 'unknown' && a.first !== 'unknown' && old.first !== a.first))) invalid.add(r.openid);
    if (old && a.first === 'unknown') a.first = old.first;
    assignments.set(r.openid, a);
  }
  for (const r of funnelRecords) {
    if (r.eventName !== 'bean_selection_experiment_exposure' || r.success !== true) continue;
    const a = assignments.get(r.openid), f = fields(r);
    if (!a || day(r.timestamp) !== date || Number(r.timestamp) < a.at) continue;
    if (f.beanSelectionExperimentBucket !== a.bucket || f.appliedBucket !== a.bucket || f.selectorVersion !== `${a.bucket}_v1`) {
      invalid.add(r.openid); continue;
    }
    const level = Number(r.logicalLevelId || r.levelId);
    if ((r.gameplayEntryMode || f.gameplayEntryMode) !== 'main' || level < 2 || !r.roundId) continue;
    const key = `${r.openid}:${r.roundId}`;
    const old = rounds.get(key);
    if (old && old.level !== level) invalid.add(r.openid);
    rounds.set(key, { user: r.openid, level, timestamp: Number(r.timestamp) });
  }
  function group(bucket, first) {
    const users = new Set([...assignments].filter(([uid, a]) => !invalid.has(uid) && a.bucket === bucket && (!first || first === a.first)).map(([uid]) => uid));
    const exposed = new Set(), exposed2 = new Set(), passed2 = new Set(), passed3 = new Set(), failed = new Set();
    for (const r of rounds.values()) if (users.has(r.user)) { exposed.add(r.user); if (r.level === 2) exposed2.add(r.user); }
    const seen = new Set(); let actions = 0, actionSamples = 0, seconds = 0, durationSamples = 0;
    for (const r of levelRecords) {
      const key = `${r.openid}:${r.roundId}`, round = rounds.get(key), f = fields(r);
      if (!round || !users.has(r.openid) || seen.has(key) || day(r.endTime) !== date || Number(r.endTime) < round.timestamp
          || Number(r.logicalLevelId || r.levelId) !== round.level || r.gameplayEntryMode !== 'main'
          || f.beanSelectionExperimentId !== ID || f.beanSelectionExperimentStatus !== 'enrolled' || f.beanSelectionExperimentBucket !== bucket) continue;
      seen.add(key);
      const passed = r.passStatus === true || r.passStatus === 1;
      if (passed && round.level === 2) passed2.add(r.openid);
      if (passed && round.level === 3) passed3.add(r.openid);
      if (!passed) failed.add(r.openid);
      if (round.level === 2 && passed) {
        if (Number.isFinite(r.gameplayStats?.validActionCount)) { actions += r.gameplayStats.validActionCount; actionSamples++; }
        if (Number(r.startTime) > 0 && Number(r.endTime) >= Number(r.startTime)) { seconds += (r.endTime - r.startTime) / 1000; durationSamples++; }
      }
    }
    const nextDate = day(new Date(`${date}T00:00:00+08:00`).getTime() + 86400000);
    const retained = nextDayRecords === null ? null : new Set(nextDayRecords.filter(r => exposed.has(r.openid)
      && day(r.timestamp) === nextDate && fields(r).beanSelectionExperimentStatus !== 'test').map(r => r.openid));
    return { bucket, ...(first ? { firstLevelContent: first } : {}), enrolled: users.size, exposed: exposed.size,
      exposed2: exposed2.size, passed2: passed2.size, passed3: passed3.size, failed: failed.size,
      pass2Rate: rate(passed2.size, exposed2.size), retained1: retained?.size ?? null,
      retention1Rate: retained ? rate(retained.size, exposed.size) : null,
      actions, actionSamples, meanPass2Actions: rate(actions, actionSamples), seconds, durationSamples, meanPass2Seconds: rate(seconds, durationSamples) };
  }
  return { id: ID, status: 'ready', date, expectedAllocation: { A: 0.5, B: 0.5 },
    primaryMetric: '入组当日第二关通关 UV / 实际第二关曝光 UV', groups: ['A', 'B'].map(b => group(b)),
    byFirstLevelContent: ['A', 'B', 'C', 'unknown'].flatMap(first => ['A', 'B'].map(b => group(b, first))),
    quality: { excludedOrConflictedUsers: invalid.size, nextDayAvailable: nextDayRecords !== null },
    note: '仅统计当日入组队列；关卡结果必须匹配实际规则曝光的 roundId。排除测试、排除状态和规则冲突用户；差异不自动判定胜负。' };
}
function aggregateBeanSelectionExperimentReports(reports) {
  if (!reports.length || reports.some(r => r?.id !== ID || r.status !== 'ready')) return { id: ID, status: 'unavailable', reason: '请重建范围内各日选豆实验统计。' };
  const combine = rows => {
    const counts = Object.fromEntries(['enrolled', 'exposed', 'exposed2', 'passed2', 'passed3', 'failed', 'actions', 'actionSamples', 'seconds', 'durationSamples'].map(k => [k, rows.reduce((n, r) => n + r[k], 0)]));
    const mature = rows.filter(r => r.retained1 !== null);
    const retained1 = mature.length ? mature.reduce((n, r) => n + r.retained1, 0) : null;
    return { bucket: rows[0].bucket, firstLevelContent: rows[0].firstLevelContent, ...counts, retained1,
      pass2Rate: rate(counts.passed2, counts.exposed2), retention1Rate: retained1 === null ? null : rate(retained1, mature.reduce((n, r) => n + r.exposed, 0)),
      meanPass2Actions: rate(counts.actions, counts.actionSamples), meanPass2Seconds: rate(counts.seconds, counts.durationSamples) };
  };
  return { id: ID, status: 'ready', primaryMetric: reports[0].primaryMetric, expectedAllocation: { A: 0.5, B: 0.5 },
    groups: ['A', 'B'].map(b => combine(reports.map(r => r.groups.find(g => g.bucket === b)))),
    byFirstLevelContent: ['A', 'B', 'C', 'unknown'].flatMap(first => ['A', 'B'].map(b => combine(reports.map(r => r.byFirstLevelContent.find(g => g.bucket === b && g.firstLevelContent === first))))),
    note: '按互斥入组日期队列汇总；仅计算入组当日表现，次留只计次日数据完整的队列。' };
}
module.exports = { buildBeanSelectionExperimentReport, aggregateBeanSelectionExperimentReports };
