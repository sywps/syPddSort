const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const { buildAnalyticsV2Report, compatibleFunnelRecords } = require('../scripts/analytics-v2-report');
const quiet = { log() {}, warn() {}, error() {} };
function loadTs(name) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`assets/Scripts/Core/${name}.ts`, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
  { exports, console: quiet, setTimeout: () => 1, clearTimeout() {}, Date, Map, Set });
  return exports[name];
}
function storage() { const map = new Map(); return { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) }; }
async function main() {
  const Delivery = loadTs('AnalyticsDelivery'); const store = storage(); let fail = true; const calls = [];
  const send = async (name, data) => { calls.push({ name, data }); return fail ? { ok: false, errorMessage: 'db failed' } : { ok: true }; };
  const d = new Delivery(store, async () => 'u1', send, () => true);
  d.enqueue('addFunnelEvents', { sessionId: 's1', roundId: 'r1', eventName: 'level_progress' }, 'u1');
  await d.flush(); assert.equal(d.size, 1, 'resolved ok:false must retain original event');
  const resumed = new Delivery(store, async () => 'u1', send, () => true); fail = false;
  await resumed.flush(); assert.equal(resumed.size, 0); assert.equal(calls[0].data.events[0].eventId, calls[1].data.events[0].eventId);
  assert.equal(calls[0].data.events[0].timestamp, calls[1].data.events[0].timestamp);
  resumed.enqueue('saveLevelRecord', { roundId: 'r2' }, 'u1');
  const other = new Delivery(store, async () => 'u2', send, () => true); const before = calls.length;
  await other.flush(); assert.equal(calls.length, before, 'another account must not upload saved events'); assert.equal(other.size, 1);

  const Measurements = loadTs('AnalyticsMeasurements'); const ms = storage(); const summaries = [];
  const measure = new Measurements(ms, e => summaries.push(e), () => true);
  const base = { openid: 'u', sessionId: 's', roundId: 'r', logicalLevelId: 3, gameplayEntryMode: 'main', timestamp: 100, stepId: 1, extra: { guideId: 'g' } };
  measure.accept({ ...base, eventName: 'pch_guide_step_shown', success: true });
  let details = 0;
  for (let i = 1; i <= 52; i++) if (measure.accept({ ...base, timestamp: 100 + i, eventName: 'pch_guide_tap_result', errorCode: 'miss_target', success: false })) details++;
  assert.equal(details, 3); measure.flush('background');
  const restored = new Measurements(ms, e => summaries.push(e), () => true); restored.flush('recovered');
  assert.equal(summaries[summaries.length - 1].timestamp, 100, 'recovered counters remain assigned to the original guide date');
  const report = buildAnalyticsV2Report({ behaviorRecords: [{ ...base, eventName: 'enter_level' }], funnelRecords: summaries,
    levelRecords: [{ ...base, endReason: 'pass' }] });
  assert.equal(report.levels[2].guide.missCount, 52, 'cumulative snapshots must not be summed');
  assert.equal(report.levels[2].guide.missUsers, 1); assert.equal(report.levels[2].terminal.pass, 1);
  assert.equal(report.levels[2].terminal.unresolved, 0);
  const exits = buildAnalyticsV2Report({
    behaviorRecords: ['exit', 'unknown'].map(roundId => ({ ...base, roundId, eventName: 'enter_level' })),
    funnelRecords: [],
    levelRecords: [{ ...base, roundId: 'exit', endReason: 'abandon', exitReason: 'restart' },
      { ...base, roundId: 'unknown', endReason: 'abandon' }],
  });
  assert.equal(exits.levels[2].terminal.explicitExit, 1);
  assert.equal(exits.levels[2].terminal.unknownAbandonReason, 1);
  assert.equal(exits.levels[2].terminal.unresolved, 0);
  const compatible = compatibleFunnelRecords(summaries.map(x => ({ ...x, analyticsSchemaVersion: 2 })));
  assert.equal(compatible.filter(x => x.eventName === 'pch_guide_tap_result').reduce((n, x) => n + x.measurementCount, 0), 52);
  const filtered = buildAnalyticsV2Report({ behaviorRecords: [{ ...base, eventName: 'enter_level', gameplayEntryMode: 'theme' }], funnelRecords: [], levelRecords: [] });
  assert.equal(filtered.levels[2].entered.count, 0); assert.equal(filtered.quality.duplicateRows, 0, 'filter exclusions are not duplicates');
  assert.equal(buildAnalyticsV2Report({ behaviorRecords: [], funnelRecords: null, levelRecords: [] }).available, false);

  for (const functionName of ['addFunnelEvents', 'addBehaviorData', 'saveLevelRecord']) {
    const docs = new Map(); let throwAfterWrite = true;
    const db = { command: {}, collection: name => ({
      doc: id => ({ set: async payload => { docs.set(name + ':' + id, payload.data); if (throwAfterWrite) { throwAfterWrite = false; throw new Error('response lost after write'); } } }),
      add: async () => { throw new Error('v2 must use deterministic document id'); },
    }) };
    const exports = {};
    vm.runInNewContext(fs.readFileSync(`cloudfunctions/${functionName}/index.js`, 'utf8'), { exports, console: quiet,
      require: name => name === 'wx-server-sdk' ? { init() {}, database: () => db, getWXContext: () => ({ OPENID: 'u' }) }
        : name.startsWith('./') ? require('../cloudfunctions/' + functionName + '/' + name.slice(2)) : require(name), Date });
    const event = { eventId: 'stable', eventSeq: 1, sessionId: 's', roundId: 'r', levelId: 3, eventName: 'enter_level', timestamp: 100, analyticsSchemaVersion: 2,
      csdVersion: 3, analyticsEnvironment: 'wechat_release' };
    const payload = functionName === 'addFunnelEvents' ? { events: [event, { ...event, eventId: 'second', eventSeq: 2 }] } : event;
    assert.equal((await exports.main(payload)).ok, false, functionName);
    assert.equal((await exports.main(payload)).ok, true, functionName);
    assert.equal(docs.size, functionName === 'addFunnelEvents' ? 2 : 1, `${functionName} retry after partial write must be idempotent`);
    const row = [...docs.values()][0]; assert.equal(row.roundId, 'r'); assert.equal(row.analyticsSchemaVersion, 2);
    assert.equal(row.csdVersion, 3); assert.equal(row.analyticsEnvironment, 'wechat_release');
    const invalid = { ...event, analyticsEnvironment: 'trial' };
    assert.equal((await exports.main(functionName === 'addFunnelEvents' ? { events: [invalid] } : invalid)).ok, false);
    if (functionName === 'addFunnelEvents') {
      const summary = { ...event, eventId: 'guide', eventName: 'guide_step_summary', extra: { missReasons: { outside_target: 7 }, maxConsecutiveMisses: 7 } };
      assert.equal((await exports.main({ events: [summary] })).ok, true);
      assert.equal([...docs.values()].find(x => x.eventName === 'guide_step_summary').extra.missReasons.outside_target, 7);
    }
  }
  console.log('PASS analytics v2: failed acknowledgement, restart retry, account isolation, exact miss summaries, report joins, cloud idempotency');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
