/* Shared by the daily generator and the HTML reader, including saved legacy reports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DailyReportQuality = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const minimumSamples = 20; // Screening only, not statistical significance.
  const numeric = value => value === null || value === undefined || value === ''
    || !Number.isFinite(Number(value)) ? null : Number(value);
  function measure(numerator, denominator) {
    const n = numeric(numerator), d = numeric(denominator);
    const status = n === null || d === null ? 'missing'
      : n < 0 || d < 0 || n > d ? 'unpaired' : d === 0 ? 'no_sample' : 'ok';
    return { numerator: n, denominator: d, status, rate: status === 'ok' ? n / d : null,
      lowSample: status === 'ok' && d < minimumSamples };
  }
  function recommendations({ coreMetrics = {}, funnelRows = [], highRetryLevels = [], adPerformance = {} }) {
    const out = [];
    const add = (topic, m, limit, action) => {
      if (m.status !== 'ok' || m.lowSample || m.rate >= limit) return;
      out.push({ priority: 'P1', topic,
        finding: `${m.numerator} / ${m.denominator}，比值 ${(m.rate * 100).toFixed(1)}%，低于筛查参考线 ${limit * 100}%。`,
        action, evidence: m });
    };
    add('首关进入与通过', measure(coreMetrics.l1PassUv, coreMetrics.l1EnterUv), .3,
      '先核对同批进入、版本和结局覆盖，再看失败、未决及操作检查；低比值不能直接归因为关卡太难。');
    const store = funnelRows.find(x => x.eventName === 'pch_first_store_success');
    const returned = funnelRows.find(x => x.eventName === 'pch_first_return_success');
    add('前三关首次归位', measure(returned?.sessions, store?.sessions), .6,
      '核对首次操作与归位证据、事件顺序及覆盖；汇总会话比值不是逐局配对转化。');
    const ad = adPerformance.overall || {};
    add('广告客户端完成信号', measure(ad.finishNum, ad.showNum), .4,
      '分广告位查看原生事务、技术失败、未看完和未知结局；此比值不是平台验证完播率。');
    const retry = highRetryLevels.find(x => numeric(x.recordCount) >= minimumSamples && numeric(x.avgTryCount) >= 1.2);
    if (retry) out.push({ priority: 'P1', topic: '重试观察',
      finding: `第 ${retry.levelId} 关 ${retry.recordCount} 条结局记录，平均尝试 ${retry.avgTryCount} 次。`,
      action: '结合失败原因和操作检查判断，不把缺少结局的局当作失败。' });
    return out;
  }
  function normalizeDiagnosis(diagnosis) {
    if (!diagnosis) return null;
    const core = { ...diagnosis.coreMetrics };
    const rows = diagnosis.firstLevelFunnel || [];
    const store = rows.find(x => x.eventName === 'pch_first_store_success');
    const returned = rows.find(x => x.eventName === 'pch_first_return_success');
    const l1 = measure(core.l1PassUv, core.l1EnterUv);
    const firstReturn = measure(returned?.sessions, store?.sessions);
    const ad = measure(core.adFinishPv, core.adShowPv);
    core.l1UvPassRate = l1.rate;
    core.l1LevelEnterPassRate = measure(core.l1LevelPassUv, core.l1LevelEnterUv).rate;
    core.pchFirstStoreToReturnRate = firstReturn.rate;
    core.adFinishRate = ad.rate;
    return { ...diagnosis, coreMetrics: core, displayPolicyVersion: 1,
      metricEvidence: { l1, firstReturn, ad },
      first20Levels: (diagnosis.first20Levels || []).map(row => ({ ...row,
        uvPassRate: measure(row.passUv, row.enterUv).rate,
        pvPassRate: measure(row.passPv, row.enterPv).rate,
        diagnosis: numeric(row.enterUv) === 0 ? '无进入样本，暂不评价'
          : numeric(row.enterUv) < minimumSamples ? '小样本，仅观察' : '结合失败原因、未决局与操作检查判断' })),
      recommendations: recommendations({ ...diagnosis, coreMetrics: core, funnelRows: rows }) };
  }
  function windowInfo(summary) {
    const context = summary.reportContext;
    if (!context || !numeric(context.capturedAt)) return { status: 'unknown', label: '抓取截止未保存', cutoff: null };
    return { status: context.windowStatus, cutoff: context.dataCutoff,
      label: context.windowStatus === 'complete' ? '完整日查询窗口'
        : context.windowStatus === 'partial' ? '当日部分快照' : '统计窗口未知' };
  }
  function comparable(a, b) {
    if (!a || !b) return false;
    if (a.envId !== b.envId || a.reportMode !== b.reportMode || a.modeSchemaVersion !== b.modeSchemaVersion) return false;
    if (windowInfo(a).status !== 'complete' || windowInfo(b).status !== 'complete') return false;
    const key = s => (s.reportContext?.builds || []).map(x => x.id).sort().join('|');
    return !!key(a) && key(a) === key(b) && !key(a).split('|').includes('unknown')
      && a.analyticsV2?.environmentScope === b.analyticsV2?.environmentScope;
  }
  return { numeric, measure, minimumSamples, recommendations, normalizeDiagnosis, windowInfo, comparable };
});
