const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function compile(source, dependencies = {}, globals = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('module', 'exports', 'require', ...Object.keys(globals), js)(mod, mod.exports, id => {
    assert(id in dependencies, `unexpected import: ${id}`); return dependencies[id];
  }, ...Object.values(globals));
  return mod.exports;
}
const stateSource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/FirstLevelExperiment.ts'), 'utf8');
const { FirstLevelExperimentState: State, FIRST_LEVEL_EXPERIMENT_ID: ID, FIRST_LEVEL_EXPERIMENT_STORAGE: KEY } = compile(stateSource);
function storage(seed = {}) { return { data: { ...seed }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } }; }
const server = require('../cloudfunctions/getOpenid/first-level-experiment');
const receipt = (content = 'B') => ({ id: ID, status: 'enrolled', content, enrolledAt: 1000, reason: 'new_user' });
const s = new State(), store = storage(); s.initialize(store, true, null);
assert.equal(s.request().eligible, true);
s.accept('user', receipt()); assert.equal(s.decision.content, 'B');
s.freeze(); s.accept('other-user', receipt('C')); assert.equal(s.decision.content, 'B', 'late identity must not switch playable content');
const resumed = new State(); resumed.initialize(store, true, null); resumed.accept('user', receipt('C'));
assert.equal(resumed.decision.content, 'B', 'persisted choice survives relaunch');
const switched = new State(); switched.initialize(store, true, null); switched.accept('other-user', receipt('C'));
assert.equal(switched.decision.reason, 'identity_changed');
const restored = new State(); restored.initialize(storage(), true, null); restored.accept('user', receipt('C'));
assert.equal(restored.decision.content, 'C', 'server receipt restores assignment on a clean device');
const timeout = new State(), timeoutStore = storage(); timeout.initialize(timeoutStore, true, null); timeout.exclude('identity_timeout'); timeout.accept('user', receipt());
assert.equal(timeout.decision.status, 'excluded'); assert.equal(timeout.decision.content, 'A');
const retry = new State(); retry.initialize(timeoutStore, true, null); retry.accept('user', receipt()); assert.equal(retry.decision.status, 'excluded');
const preview = new State(); preview.initialize(storage(), true, 'C'); preview.accept('user', receipt());
assert.equal(preview.decision.status, 'test'); assert.equal(preview.request().eligible, false); assert.equal(preview.fields().firstLevelExperimentBucket, '');
const old = new State(); old.initialize(storage({ 'pdd.level': '5' }), true, null); assert.equal(old.request().eligible, false);
const missing = new State(); missing.initialize(storage(), true, null); missing.accept('user', undefined); assert.equal(missing.decision.reason, 'assignment_protocol_unavailable');
const corrupt = new State(); corrupt.initialize(storage({ [KEY]: '{' }), true, null); assert.equal(corrupt.decision.status, 'excluded');
for (const current of [{}, { savedLevel: 1 }, { totalPlayTimes: 0 }]) {
  assert.equal(server.resolveAssignment('uid', current, { id: ID, eligible: true }, 1000).status, 'excluded');
}
assert.equal(server.resolveAssignment('uid', null, { id: ID, eligible: false }, 1000).status, 'excluded');
assert.equal(server.resolveAssignment('uid', null, { id: ID, eligible: true, test: true }, 1000).status, 'excluded');
assert.deepEqual(server.resolveAssignment('uid', { firstLevelExperiment: receipt('C') }, { id: ID }, 2000), receipt('C'));
assert.equal(server.resolveAssignment('uid', { firstLevelExperiment: receipt('B') }, { id: ID, exclusionReason: 'identity_timeout' }, 2000).status, 'excluded');
const crcSource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/LevelExperimentService.ts'), 'utf8');
const { crc32Utf8 } = compile(crcSource, { cc: {}, './MiniGamePlatform': {}, './RemoteDataCdnClient': {} });
assert.equal(crc32Utf8('123456789'), 0xcbf43926);
const buckets = new Set();
for (let i = 0; i < 1000; i++) {
  const uid = `user-${i}`, slot = crc32Utf8(`${uid}:${ID}`) % 100;
  const expected = slot < 34 ? 'A' : slot < 67 ? 'B' : 'C';
  assert.equal(server.bucket(uid), expected); buckets.add(expected);
}
assert.equal(buckets.size, 3);

async function testGate() {
  const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/AnalyticsMgr.ts'), 'utf8');
  const ast = ts.createSourceFile('analytics.ts', source, ts.ScriptTarget.Latest, true);
  const cls = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'AnalyticsMgr');
  const method = cls.members.find(n => n.name?.getText(ast) === 'prepareFirstLevelExperiment').getText(ast);
  const state = new State(); state.initialize(storage(), true, null);
  let deadline, reported = 0;
  const { Gate } = compile(`export class Gate { ${method} }`, {}, { firstLevelExperiment: state,
    setTimeout: cb => { deadline = cb; return 1; }, clearTimeout() {} });
  const gate = new Gate(); gate.ensureReady = () => new Promise(() => {}); gate.reportFirstLevelAssignment = () => reported++;
  const pending = gate.prepareFirstLevelExperiment(); deadline(); await pending;
  assert.equal(state.decision.status, 'excluded'); assert.equal(reported, 1);
  state.accept('late-user', receipt()); assert.equal(state.decision.content, 'A');
}
async function testCloudEntry() {
  let profile, nowUser = 'new-user';
  const collection = { where: () => ({ limit: () => ({ get: async () => ({ data: profile ? [profile] : [] }) }) }),
    add: async ({ data }) => { profile = { ...data, _id: 'profile-id' }; }, doc: () => ({ update: async ({ data }) => Object.assign(profile, data) }) };
  const cloud = { init() {}, DYNAMIC_CURRENT_ENV: 'test', database: () => ({ collection: () => collection }), getWXContext: () => ({ OPENID: nowUser }) };
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', fs.readFileSync(path.join(root, 'cloudfunctions/getOpenid/index.js'), 'utf8'))(mod, mod.exports,
    id => id === './third-level-experiment' ? require('../cloudfunctions/getOpenid/third-level-experiment') : id === 'wx-server-sdk' ? cloud : id === './encouragement-experiment' ? require('../cloudfunctions/getOpenid/encouragement-experiment') : id === './bean-selection-experiment' ? require('../cloudfunctions/getOpenid/bean-selection-experiment') : server);
  const first = await mod.exports.main({ firstLevelExperiment: { id: ID, eligible: true } });
  assert.equal(first.ok, true); assert.equal(first.firstLevelExperiment.status, 'enrolled');
  assert.deepEqual(profile.firstLevelExperiment, first.firstLevelExperiment);
  const second = await mod.exports.main({ firstLevelExperiment: { id: ID, eligible: false } });
  assert.equal(second.isNewUser, false); assert.deepEqual(second.firstLevelExperiment, first.firstLevelExperiment);
  await mod.exports.main({ firstLevelExperiment: { id: ID, exclusionReason: 'identity_timeout' } });
  assert.equal(profile.firstLevelExperiment.status, 'excluded', 'late allocation is cancelled on the server');
  profile = { _id: 'old', openid: nowUser, savedLevel: 1 };
  const existing = await mod.exports.main({ firstLevelExperiment: { id: ID, eligible: true } });
  assert.equal(existing.firstLevelExperiment.status, 'excluded');
}
Promise.all([testGate(), testCloudEntry()]).then(() => console.log('first-level-experiment.test.js passed: admission, CRC, persistence, preview isolation, late identity and cloud entry'), error => { console.error(error); process.exitCode = 1; });
