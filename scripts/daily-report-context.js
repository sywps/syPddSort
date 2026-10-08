'use strict';
const fs = require('node:fs');
const REQUIRED = ['user_behavior', 'first_level_funnel', 'level_record'];

function buildReportContext(summary, records = null) {
  const snapshots = REQUIRED.map(name => {
    const file = summary.collections?.[name]?.exportInfo?.localPath;
    return { collection: name, savedAt: file && fs.existsSync(file) ? fs.statSync(file).mtimeMs : null };
  });
  const capturedAt = snapshots.every(x => x.savedAt !== null) ? Math.max(...snapshots.map(x => x.savedAt)) : null;
  const earliestSavedAt = capturedAt === null ? null : Math.min(...snapshots.map(x => x.savedAt));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(summary.date) ? Date.parse(`${summary.date}T00:00:00+08:00`) : NaN;
  const end = start + 86400000;
  const valid = capturedAt !== null && Number.isFinite(start) && capturedAt >= start;
  const builds = new Map(), environments = new Map();
  if (records) for (const name of REQUIRED) for (const row of records[name] || []) {
    const build = String(row.clientBuildId || row.extra?.clientBuildId || 'unknown');
    builds.set(build, (builds.get(build) || 0) + 1);
    const environment = String(row.analyticsEnvironment || 'unknown');
    environments.set(environment, (environments.get(environment) || 0) + 1);
  }
  return { schemaVersion: 1, timezone: 'Asia/Shanghai', capturedAt,
    capturedAtSource: 'raw_export_file_saved_time', snapshots,
    dataCutoff: valid ? Math.min(capturedAt, end) : null,
    windowStatus: valid ? earliestSavedAt >= end ? 'complete' : 'partial' : 'unknown',
    builds: records ? [...builds].map(([id, events]) => ({ id, events })) : summary.reportContext?.builds || [],
    environments: records ? [...environments].map(([name, events]) => ({ name, events })) : summary.reportContext?.environments || [],
    note: '参考截止取三类原始导出文件最晚保存时间（各表抓取不完全同步），不是重新汇总时间。完整日须三类导出均在日界后保存；不保证迟到事件已全部上报。版本/环境计数为记录数，不是人数。' };
}
module.exports = { buildReportContext };
