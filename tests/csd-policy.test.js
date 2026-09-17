const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(name) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`assets/Scripts/Core/${name}.ts`, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
  { exports, console, Date, setTimeout: () => 1, clearTimeout() {} });
  return exports;
}
const { isOfficialAnalyticsRuntime: allowed } = load('CsdAnalyticsPolicy');
const runtime = (envVersion, platform) => ({ getAccountInfoSync: () => ({ miniProgram: { envVersion } }), getDeviceInfo: () => ({ platform }) });
for (const version of ['develop', 'trial', '', undefined]) assert.equal(allowed(runtime(version, 'ios')), false);
for (const platform of ['devtools', '', undefined]) assert.equal(allowed(runtime('release', platform)), false);
for (const platform of ['ios', 'android', 'windows', 'mac']) assert.equal(allowed(runtime('release', platform)), true);
assert.equal(allowed(null), false);
assert.equal(allowed({ getAccountInfoSync() { throw Error('unknown'); } }), false);
const { AnalyticsDelivery } = load('AnalyticsDelivery');
const { AnalyticsMeasurements } = load('AnalyticsMeasurements');
async function main() {
  let sends = 0, writes = 0, enabled = false;
  const data = new Map([['pdd.analytics.delivery.v2', JSON.stringify([{ id: 'old', owner: '', name: 'addBehaviorData', data: { eventName: 'ad_show' } }])]]);
  const storage = { getItem: k => data.get(k), setItem(k, value) { writes++; data.set(k, value); } };
  const d = new AnalyticsDelivery(storage, async () => 'user', async () => { sends++; return { ok: true }; }, () => enabled);
  const m = new AnalyticsMeasurements(storage, () => assert.fail('nonofficial measurement emitted'), () => enabled);
  assert.equal(d.enqueue('addBehaviorData', {}), false); await d.flush();
  assert.equal(m.accept({ eventName: 'pch_guide_step_shown' }), false); m.flush('background');
  assert.equal(writes, 0); assert.equal(sends, 0); assert.equal(d.size, 0);
  enabled = true;
  assert.equal(d.enqueue('addBehaviorData', { eventName: 'enter_level' }), true);
  enabled = false; await d.flush(); assert.equal(sends, 0);
  enabled = true; await d.flush(); assert.equal(sends, 1);
  assert.ok(data.has('pdd.analytics.delivery.v2'), 'retain but never import legacy queue');
  const rows = [];
  const { CsdInteractionMonitor } = load('CsdInteractionMonitor');
  const monitor = new CsdInteractionMonitor(x => rows.push(x));
  const state = { foreground: true, expected: '', blockers: ['stale_mask'], validActions: 0 };
  monitor.observe({ ...state, expected: 'opening_animation' }, 1000); assert.equal(rows.length, 0);
  monitor.observe(state, 1500); monitor.observe(state, 2000);
  monitor.observe({ ...state, foreground: false }, 2100);
  monitor.observe(state, 20000); monitor.observe({ ...state, blockers: [], validActions: 1 }, 20500);
  assert.equal(rows.length, 1); assert.equal(rows[0].foregroundMs, 1000);
  assert.equal(rows[0].outcome, 'recovered'); assert.equal(rows[0].effectiveActionsSinceStart, 1);
  monitor.observe(state, 21000); monitor.finish('level_leave', 0, 22000);
  assert.equal(rows[1].observationComplete, false);
  console.log('PASS CSD release-only gate, zero nonofficial persistence/upload, legacy isolation, passive blocker episodes');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
