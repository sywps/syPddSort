const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildFirstLevelExperimentReport: build, aggregateFirstLevelExperimentReports: aggregate } = require('../scripts/first-level-experiment-report');
const root = path.resolve(__dirname, '..');
const date = '2026-09-14', t = new Date(`${date}T09:00:00+08:00`).getTime();
const meta = (bucket = 'A', status = 'enrolled') => ({ firstLevelExperimentId: 'first_level_abc_v1', firstLevelExperimentStatus: status,
  firstLevelExperimentBucket: status === 'enrolled' ? bucket : '', firstLevelContentVersion: `${bucket}_v1`, firstLevelEnrolledAt: t,
  firstLevelExperimentReason: status === 'excluded' ? 'identity_timeout' : '' });
const event = (uid, name, bucket = 'A', extra = {}) => ({ openid: uid, eventName: name, timestamp: t + 100,
  levelId: 1, gameplayEntryMode: 'main', ...meta(bucket), ...extra });
const assignment = (uid, bucket = 'A') => event(uid, 'first_level_experiment_assignment', bucket);
const funnel = [assignment('a1'), assignment('a1'), assignment('a2'), assignment('b1', 'B'), assignment('c1', 'C'),
  event('a1', 'first_level_experiment_exposure', 'A', { success: true, extra: { contentPath: 'LevelData/level_1' } }),
  event('b1', 'first_level_content_load', 'B', { success: false }),
  event('a1', 'pch_guide_step_shown', 'A', { stepId: 1 }), event('a1', 'pch_guide_step_done', 'A', { stepId: 1 }),
  event('excluded', 'first_level_experiment_assignment', 'A', meta('A', 'excluded')),
  event('test', 'first_level_experiment_assignment', 'B', meta('B', 'test')),
  assignment('conflict'), assignment('conflict', 'B'), assignment('previewed'), event('previewed', 'app_hide', 'C', meta('C', 'test')),
  // Unknown users with a bucket must not become cohorts by inferred hashing or incidental events.
  event('not-enrolled', 'enter_level', 'A', { levelId: 2 }),
];
const behavior = [event('a1', 'enter_level', 'A', { levelId: 2 }), event('a1', 'enter_level', 'A', { levelId: 2 }),
  event('a1', 'level_pass'), event('a1', 'level_pass', 'A', { levelId: 3 }),
  event('a2', 'enter_level', 'A', { levelId: 2, gameplayEntryMode: 'theme' }),
  event('a2', 'enter_level', 'A', { levelId: 2, timestamp: t + 86400000 }),
];
const levels = [event('a1', '', 'A', { passStatus: true, startTime: t, endTime: t + 30000 }),
  event('a1', '', 'A', { passStatus: true, startTime: t + 40000, endTime: t + 45000 })];
const next = [event('a1', 'game_start', 'A', { timestamp: t + 86400000 }), event('a2', 'game_start', 'C', { timestamp: t + 86400000, ...meta('C', 'test') })];
const input = { date, funnelRecords: funnel, behaviorRecords: behavior, levelRecords: levels, nextDayRecords: next };
const report = build(input), a = report.groups[0];
assert.equal(a.enrolled, 2); assert.equal(a.entered2, 1); assert.equal(a.enter2Rate, 0.5);
assert.equal(a.passed1, 1); assert.equal(a.passed3, 1); assert.equal(a.retained1, 1); assert.equal(a.retention1Rate, 0.5);
assert.equal(a.firstPassMedianSeconds, 30); assert.equal(a.guide1CompletionRate, 1);
assert.equal(report.groups[1].loadFailed, 1); assert.equal(report.quality.conflictedUsers, 1); assert.equal(report.quality.testUsers, 2);
assert.equal(report.quality.excludedUsers, 1);
const pending = build({ ...input, nextDayRecords: null }); assert.equal(pending.groups[0].retention1Rate, null);
assert.equal(build({ ...input, funnelRecords: null }).status, 'unavailable');
const empty = build({ date, funnelRecords: [], behaviorRecords: [], levelRecords: [] }); assert.equal(empty.groups[0].enter2Rate, null);
const total = aggregate([report, pending]); assert.equal(total.groups[0].enrolled, 4); assert.equal(total.groups[0].retentionDenominator, 2); assert.equal(total.groups[0].retention1Rate, 0.5);
assert.equal(aggregate([report, undefined]).status, 'unavailable');

// Exercise the real daily-report entry point with explicitly synthetic, local-only fixtures.
const output = path.join(root, 'temp', 'first-level-experiment-report-test');
fs.mkdirSync(output, { recursive: true });
const collections = { first_level_funnel: funnel, user_behavior: behavior, level_record: levels, ad_stat: [], daily_stat: [] };
const combined = { date, envId: 'unit-test-only', collections: {} };
for (const [collection, records] of Object.entries(collections)) {
  const directory = path.join(output, collection); fs.mkdirSync(directory, { recursive: true });
  const localPath = path.join(directory, `database_export-test-${collection}-${date}.json`);
  fs.writeFileSync(localPath, records.map(r => JSON.stringify(r)).join('\n'));
  combined.collections[collection] = { exportInfo: { localPath } };
}
fs.writeFileSync(path.join(output, 'combined_summary.json'), JSON.stringify(combined));
const run = spawnSync(process.execPath, ['scripts/user-behavior-daily-job.js', '--date', date, '--reuse-existing', '--out-dir', output], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
assert.equal(run.status, 0, run.stderr || run.stdout.slice(-1200));
const generated = JSON.parse(fs.readFileSync(path.join(output, 'combined_summary.json'), 'utf8'));
assert.equal(generated.firstLevelExperiment.groups[0].enter2Rate, 0.5);
assert.equal(generated.beanSelectionExperiment.status, 'ready');
assert.equal(generated.beanSelectionExperiment.groups[0].pass2Rate, null, 'old data cannot become fake selection samples');
// The report UI must render both real groups and explicit unavailability.
const html = fs.readFileSync(path.join(root, 'tools/cloudbase-report.html'), 'utf8');
const from = html.indexOf('function renderFirstLevelExperiment('), to = html.indexOf('\nfunction renderDiagnosisFunnelTable', from);
const render = new Function('escapeHtml', `${html.slice(from, to)}; return renderFirstLevelExperiment;`)(String);
assert(render(report).includes('50.0%')); assert(render(pending).includes('未就绪'));
assert(render({ status: 'unavailable', reason: 'missing export' }).includes('missing export'));
console.log('first-level-experiment-report.test.js passed: admission-only cohorts, exclusions, outcomes, retention readiness, aggregation, daily CLI and report UI');
