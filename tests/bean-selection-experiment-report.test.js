const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildBeanSelectionExperimentReport: build, aggregateBeanSelectionExperimentReports: aggregate } = require('../scripts/bean-selection-experiment-report');
const date = '2026-09-14', t = new Date(`${date}T12:00:00+08:00`).getTime();
const meta = (bucket = 'B', status = 'enrolled') => ({ beanSelectionExperimentId: 'bean_selection_ab_v1',
  beanSelectionExperimentStatus: status, beanSelectionExperimentBucket: bucket, beanSelectionEnrolledAt: t,
  firstLevelContentVersion: 'C_v1' });
const exposure = (uid, bucket = 'B') => ({ openid: uid, roundId: uid + '-r', levelId: 2, timestamp: t + 10,
  gameplayEntryMode: 'main', eventName: 'bean_selection_experiment_exposure', success: true,
  extra: { ...meta(bucket), appliedBucket: bucket, selectorVersion: bucket + '_v1' } });
const pass = uid => ({ openid: uid, roundId: uid + '-r', levelId: 2, startTime: t + 5, endTime: t + 30005,
  gameplayEntryMode: 'main', passStatus: true, ...meta(), gameplayStats: { validActionCount: 4 } });
const funnel = [exposure('b'), exposure('b'), exposure('a', 'A'), exposure('bad'), exposure('test'), exposure('no-pass')];
funnel.push({ ...exposure('test'), extra: meta('B', 'test') });
funnel.push({ ...exposure('bad'), extra: { ...meta(), appliedBucket: 'A', selectorVersion: 'A_v1' } });
const levels = [pass('b'), pass('b'), pass('bad'), pass('test'), { ...pass('b'), roundId: 'unexposed' }, { ...pass('no-pass'), levelId: 1 }];
const input = { date, funnelRecords: funnel, levelRecords: levels, behaviorRecords: [] };
let report = build(input); const a = report.groups[0], b = report.groups[1];
assert.equal(a.pass2Rate, 0); assert.equal(b.exposed2, 2); assert.equal(b.passed2, 1); assert.equal(b.pass2Rate, .5);
assert.equal(b.meanPass2Actions, 4); assert.equal(b.meanPass2Seconds, 30); assert.equal(b.durationSamples, 1);
assert.equal(b.retained1, null); assert.equal(report.quality.excludedOrConflictedUsers, 2);
assert.equal(report.byFirstLevelContent.find(g => g.firstLevelContent === 'C' && g.bucket === 'B').exposed2, 2);
assert.equal(build({ ...input, levelRecords: null }).status, 'unavailable');
assert.equal(build({ date, funnelRecords: [], levelRecords: [], behaviorRecords: [] }).groups[0].pass2Rate, null);
report = build({ ...input, nextDayRecords: [{ openid: 'b', timestamp: t + 86400000 }, { openid: 'b', timestamp: t + 86400000 + 1 }] });
assert.equal(report.groups[1].retained1, 1); assert.equal(report.groups[1].retention1Rate, .5);
const combined = aggregate([report, report]); assert.equal(combined.groups[1].pass2Rate, .5); assert.equal(combined.groups[1].durationSamples, 2);
assert.equal(aggregate([null]).status, 'unavailable');

const html = fs.readFileSync(`${__dirname}/../tools/cloudbase-report.html`, 'utf8');
const source = html.slice(html.indexOf('function renderBeanSelectionExperiment('), html.indexOf('function renderFirstLevelExperiment('));
const context = { escapeHtml: x => String(x ?? '').replaceAll('<', '&lt;') }; vm.createContext(context); vm.runInContext(source, context);
assert.ok(context.renderBeanSelectionExperiment(report).includes('选豆 A / B 实验'));
assert.ok(context.renderBeanSelectionExperiment(combined).includes('50.0%'));
assert.ok(context.renderBeanSelectionExperiment({ status: 'unavailable', reason: '<missing>' }).includes('&lt;missing>'));
assert.equal(context.renderBeanSelectionExperiment(undefined), '');
console.log('bean selection reporting: real-exposure join, dedupe, test/conflict exclusion, strata, missing data and rendering passed');
