const ID = 'third_level_abc_v1';
const day = t => Number(t) > 0 ? new Date(Number(t) + 28800000).toISOString().slice(0, 10) : '';
const fields = r => ({ ...r.extra, ...Object.fromEntries(Object.entries(r).filter(([k]) => /^(thirdLevel|firstLevel)/.test(k))) });
const rate = (n, d) => d ? n / d : null;
function buildThirdLevelExperimentReport({ date, funnelRecords, behaviorRecords, levelRecords }) {
  if (![funnelRecords, behaviorRecords, levelRecords].every(Array.isArray)) return { id: ID, status: 'unavailable', reason: '缺少第三关实验原始记录。' };
  const all = [...funnelRecords, ...behaviorRecords, ...levelRecords];
  const users = new Map(), invalid = new Set(), rounds = new Map();
  for (const r of all) {
    const f = fields(r);
    if (!r.openid || f.thirdLevelExperimentId !== ID) continue;
    if (f.thirdLevelExperimentStatus !== 'enrolled') { invalid.add(r.openid); continue; }
    if (!['A','B','C'].includes(f.thirdLevelExperimentBucket) || day(f.thirdLevelEnrolledAt) !== date) continue;
    const a = { bucket: f.thirdLevelExperimentBucket, at: Number(f.thirdLevelEnrolledAt),
      first: ['A','B','C'].includes(f.firstLevelExperimentBucket) ? f.firstLevelExperimentBucket : 'unknown' };
    const old = users.get(r.openid);
    if (old && (old.bucket !== a.bucket || old.at !== a.at || (old.first !== 'unknown' && a.first !== 'unknown' && old.first !== a.first))) invalid.add(r.openid);
    if (old && a.first === 'unknown') a.first = old.first;
    users.set(r.openid, a);
  }
  const valid = r => {
    const a = users.get(r.openid), f = fields(r), t = Number(r.timestamp || r.endTime || 0);
    return a && !invalid.has(r.openid) && r.roundId && t >= a.at && day(t) === date
      && (r.gameplayEntryMode || r.extra?.gameplayEntryMode) === 'main'
      && f.thirdLevelExperimentId === ID && f.thirdLevelExperimentStatus === 'enrolled' && f.thirdLevelExperimentBucket === a.bucket;
  };
  for (const r of all) {
    if (!valid(r) || r.eventName !== 'enter_level' || ![3,4].includes(Number(r.logicalLevelId || r.levelId))) continue;
    const key = `${r.openid}:${r.roundId}`, level = Number(r.logicalLevelId || r.levelId);
    const old = rounds.get(key);
    if (old && old.level !== level) { invalid.add(r.openid); continue; }
    if (!old) rounds.set(key, { user: r.openid, level, at: Number(r.timestamp), pass: false, terminal: false, fail: false, guide: false });
  }
  for (const r of all) {
    if (!valid(r)) continue;
    const round = rounds.get(`${r.openid}:${r.roundId}`), t = Number(r.timestamp || r.endTime);
    if (!round || round.level !== Number(r.logicalLevelId || r.levelId) || t < round.at) continue;
    if (r.eventName === 'level_pass' || r.passStatus === true || r.passStatus === 1) { round.pass = true; round.terminal = true; }
    if (r.eventName === 'level_fail') { round.fail = true; round.terminal = true; }
    if (r.endTime) round.terminal = true;
    if (r.eventName === 'pch_guide_step_done' && (r.guideId || r.extra?.guideId) === 'pch_level_3_capacity_v1') round.guide = true;
  }
  function group(bucket, first) {
    const eligible = new Set([...users].filter(([uid,a]) => !invalid.has(uid) && a.bucket === bucket && (!first || a.first === first)).map(([uid]) => uid));
    const active = [...rounds.values()].filter(r => eligible.has(r.user));
    const third = active.filter(r => r.level === 3), uv = rows => new Set(rows.map(r => r.user)).size;
    return { bucket, ...(first ? { firstLevelContent: first } : {}), enrolled: eligible.size,
      entered3: uv(third), passed3: uv(third.filter(r=>r.pass)), entered4: uv(active.filter(r=>r.level===4)),
      rounds3: third.length, failedRounds: third.filter(r=>r.fail).length, unresolvedRounds: third.filter(r=>!r.terminal).length,
      guideDone: uv(third.filter(r=>r.guide)), pass3Rate: rate(uv(third.filter(r=>r.pass)), uv(third)),
      reach4Rate: rate(uv(active.filter(r=>r.level===4)), eligible.size) };
  }
  return { id: ID, status: 'ready', date, groups: ['A','B','C'].map(b=>group(b)),
    byFirstLevelContent: ['A','B','C','unknown'].flatMap(f=>['A','B','C'].map(b=>group(b,f))),
    quality: { excludedOrConflictedUsers: invalid.size },
    note: '仅统计当日入组、当日结果，非完整24小时效果；通过必须匹配同用户同关同roundId的进入。缺终局不算失败；按首关分层，零样本不判胜负。' };
}
function aggregateThirdLevelExperimentReports(reports) {
  if (!reports.length || reports.some(r=>r?.id!==ID || r.status!=='ready')) return {id:ID,status:'unavailable',reason:'请重建范围内各日第三关实验统计。'};
  const sum = rows => {
    const counts = Object.fromEntries(['enrolled','entered3','passed3','entered4','rounds3','failedRounds','unresolvedRounds','guideDone'].map(k=>[k,rows.reduce((n,r)=>n+r[k],0)]));
    return {bucket:rows[0].bucket,firstLevelContent:rows[0].firstLevelContent,...counts,pass3Rate:rate(counts.passed3,counts.entered3),reach4Rate:rate(counts.entered4,counts.enrolled)};
  };
  return {id:ID,status:'ready',groups:['A','B','C'].map(b=>sum(reports.map(r=>r.groups.find(g=>g.bucket===b)))),
    byFirstLevelContent:['A','B','C','unknown'].flatMap(f=>['A','B','C'].map(b=>sum(reports.map(r=>r.byFirstLevelContent.find(g=>g.bucket===b&&g.firstLevelContent===f))))),
    note:'按互斥入组日期汇总各自当日表现，不是跨日累计通关率；未对观察时长做调整。'};
}
module.exports = { buildThirdLevelExperimentReport, aggregateThirdLevelExperimentReports };
