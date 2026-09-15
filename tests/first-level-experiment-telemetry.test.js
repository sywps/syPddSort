const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const metadata = { firstLevelExperimentId: 'first_level_abc_v1', firstLevelExperimentStatus: 'enrolled',
  beanSelectionExperimentId: 'bean_selection_ab_v1', beanSelectionExperimentStatus: 'enrolled',
  beanSelectionExperimentBucket: 'B', beanSelectionEnrolledAt: 1789434000000, beanSelectionExperimentReason: 'new_user',
  firstLevelExperimentBucket: 'C', firstLevelContentVersion: 'C_v1', firstLevelEnrolledAt: 1789434000000, firstLevelExperimentReason: 'new_user' };
async function check(name, event, collectionName, nested = false) {
  const rows = [];
  const collection = name => ({
    add: async ({ data }) => { rows.push({ name, data }); return { _id: 'event-id' }; },
    where: () => ({ limit: () => ({ get: async () => ({ data: [{ _id: 'profile-id', openid: 'verified-user' }] }) }) }),
    doc: () => ({ update: async () => {} }),
  });
  const cloud = { init() {}, DYNAMIC_CURRENT_ENV: 'test', getWXContext: () => ({ OPENID: 'verified-user' }), database: () => ({ collection, command: { inc: x => x } }) };
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', name, 'index.js'), 'utf8'))(mod, mod.exports, id => {
    assert.equal(id, 'wx-server-sdk'); return cloud;
  });
  const result = await mod.exports.main(event);
  assert.equal(result.ok, true, result.errorMessage);
  const row = rows.find(r => r.name === collectionName).data;
  assert.equal(row.openid, 'verified-user');
  for (const [key, value] of Object.entries(metadata)) assert.equal((nested ? row.extra : row)[key], value, `${name}: ${key}`);
  if (nested) assert.equal(row.extra.originalLastField, 'preserved', 'new metadata must not evict original event fields');
}
Promise.all([
  check('addBehaviorData', { ...metadata, eventName: 'enter_level', levelId: 2, gameplayEntryMode: 'main' }, 'user_behavior'),
  check('saveLevelRecord', { ...metadata, levelId: 1, startTime: 1789434000000, endTime: 1789434005000, passStatus: true, gameplayEntryMode: 'main' }, 'level_record'),
  check('addFunnelEvents', { events: [{ eventName: 'first_level_experiment_assignment',
    extra: { ...metadata, ...Object.fromEntries(Array.from({ length: 23 }, (_, i) => ['existing' + i, i])), originalLastField: 'preserved' },
    timestamp: 1789434000000 }] }, 'first_level_funnel', true),
]).then(() => console.log('first-level-experiment-telemetry.test.js passed: all three cloud event transports preserve experiment identity'), error => { console.error(error); process.exitCode = 1; });
