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
const officialPlatforms = ['ios', 'android', 'ohos', 'ohos_pc', 'windows', 'mac'];
for (const platform of officialPlatforms) {
  assert.equal(allowed(runtime('release', platform)), true, `release ${platform} must collect`);
  for (const version of ['develop', 'trial', '', undefined]) assert.equal(allowed(runtime(version, platform)), false);
}
for (const platform of ['devtools', 'unknown', 'harmony', 'harmonyos', '', undefined]) assert.equal(allowed(runtime('release', platform)), false);
for (const platform of ['ohos', 'ohos_pc']) {
  assert.equal(allowed({ getAccountInfoSync: runtime('release', platform).getAccountInfoSync,
    getSystemInfoSync: () => ({ platform }) }), true, 'legacy device API must also admit official Harmony runtimes');
}
assert.equal(allowed({ ...runtime('release', 'devtools'), getSystemInfoSync: () => ({ platform: 'ohos' }) }), false);
assert.equal(allowed(null), false);
assert.equal(allowed({ getAccountInfoSync() { throw Error('unknown'); } }), false);
const { AnalyticsDelivery } = load('AnalyticsDelivery');
const { AnalyticsMeasurements } = load('AnalyticsMeasurements');
async function main() {
  for (const platform of ['ohos', 'ohos_pc']) for (const version of ['release', 'trial', 'develop', '']) {
    const saved = new Map(), sent = [];
    const enabled = () => allowed(runtime(version, platform));
    const delivery = new AnalyticsDelivery({ getItem: k => saved.get(k), setItem: (k, value) => saved.set(k, value) },
      async () => 'harmony-user', async (name, payload) => {
        sent.push({ name, payload });
        const items = name === 'addFunnelEvents' ? payload.events : [payload];
        return { ok: true, count: items.length, acknowledgedIds: items.map(x => x.eventId) };
      }, enabled, { strictOwner: true });
    for (const [name, data] of [
      ['addBehaviorData', { eventName: 'enter_level', levelId: 15 }],
      ['addFunnelEvents', { eventName: 'runtime_error', levelId: 15, errorCode: 'test_runtime_error' }],
      ['saveLevelRecord', { levelId: 15, passStatus: true, endReason: 'pass' }],
    ]) assert.equal(delivery.enqueue(name, data, 'harmony-user'), version === 'release');
    for (let index = 0; index < 3; index++) await delivery.flush();
    assert.equal(delivery.size, 0);
    assert.equal(sent.length, version === 'release' ? 3 : 0);
    if (version !== 'release') assert.equal(saved.size, 0, 'nonofficial Harmony must not persist events');
    for (const { name, payload } of sent) {
      const event = name === 'addFunnelEvents' ? payload.events[0] : payload;
      assert.equal(event.analyticsEnvironment, 'wechat_release');
      assert.equal(event.csdVersion, 3);
      if (name === 'addFunnelEvents') assert.equal(event.eventName, 'runtime_error');
    }
  }
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
