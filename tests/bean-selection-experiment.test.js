const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const server = require('../cloudfunctions/getOpenid/bean-selection-experiment');
const first = require('../cloudfunctions/getOpenid/first-level-experiment');
function compile(source, globals = {}) {
  const exports = {};
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('exports', ...Object.keys(globals), js)(exports, ...Object.values(globals));
  return exports;
}
const { BeanSelectionExperimentState: State, BEAN_SELECTION_EXPERIMENT_STORAGE: KEY } = compile(fs.readFileSync(path.join(root, 'assets/Scripts/Core/BeanSelectionExperiment.ts'), 'utf8'));
const storage = (initial = {}) => ({ getItem: k => initial[k] ?? null, setItem: (k, v) => { initial[k] = v; } });
const receipt = (content = 'B') => ({ id: server.ID, status: 'enrolled', content, enrolledAt: 1000, reason: 'new_user' });
const store = storage(); let state = new State(); state.initialize(store, true, false);
assert.equal(state.request().eligible, true);
state.accept('uid', receipt()); assert.equal(state.content(), 'A', 'not active before startup gate');
state.freeze(); assert.equal(state.content(), 'A'); state.accept('uid', receipt('A')); assert.equal(state.content(), 'A');
state = new State(); state.initialize(store, true, false); state.accept('uid', receipt()); state.freeze(); assert.equal(state.content(), 'A');
state = new State(); state.initialize(store, true, false); state.freeze(); assert.equal(state.content(), 'A');
assert.equal(state.decision.reason, 'identity_unavailable_or_timeout');
state.accept('uid', receipt()); assert.equal(state.content(), 'A', 'late reply cannot switch');
state = new State(); state.initialize(storage({ [KEY]: JSON.stringify({ ...receipt(), openid: 'old' }) }), true, false);
state.accept('new', receipt()); state.freeze(); assert.equal(state.decision.reason, 'identity_changed');
state = new State(); state.initialize(storage(), true, true); state.freeze(); assert.equal(state.decision.status, 'test'); assert.equal(state.request().eligible, false);
state = new State(); state.initialize(storage({ 'pdd.level': '10' }), true, false); assert.equal(state.request().eligible, false);
state.accept('uid', undefined); state.freeze(); assert.equal(state.decision.reason, 'assignment_protocol_unavailable');
state = new State(); state.initialize({ getItem: () => null, setItem: () => { throw Error('disk full'); } }, true, false);
state.accept('uid', receipt()); state.freeze(); assert.equal(state.content(), 'A'); assert.equal(state.decision.reason, 'assignment_storage_unavailable');
for (const current of [{}, { savedLevel: 1 }]) assert.equal(server.resolveAssignment('uid', current, { id: server.ID, eligible: true }, 1000).status, 'excluded');
assert.equal(server.resolveAssignment('uid', null, { id: server.ID, eligible: true, test: true }, 1000).status, 'excluded');
assert.deepEqual(server.resolveAssignment('uid', { beanSelectionExperiment: receipt() }, { id: server.ID }, 2000), receipt());
const allocations = { A: [0, 0], B: [0, 0], C: [0, 0] };
for (let i = 0; i < 10000; i++) allocations[first.bucket('u' + i)][server.bucket('u' + i) === 'A' ? 0 : 1]++;
for (const row of Object.values(allocations)) assert.ok(row[0] / (row[0] + row[1]) > .45 && row[0] / (row[0] + row[1]) < .55, 'independent split inside each first-level bucket');

function method(file, name) {
  const ast = ts.createSourceFile(file, fs.readFileSync(path.join(root, 'assets/Scripts/Core', file), 'utf8'), ts.ScriptTarget.Latest, true);
  let found;
  function visit(n) { if (ts.isMethodDeclaration(n) && n.name.getText(ast) === name) found = n.getText(ast); ts.forEachChild(n, visit); }
  visit(ast); assert.ok(found, name); return found;
}
async function gate() {
  const state = new State(); state.initialize(storage(), true, false);
  let timeout, events = 0;
  const { Gate } = compile(`export class Gate { ${method('AnalyticsMgr.ts', 'prepareBeanSelectionExperiment')} }`, {
    beanSelectionExperiment: state, setTimeout: cb => { timeout = cb; return 1; }, clearTimeout() {},
  });
  const g = new Gate(); g.ensureReady = () => new Promise(() => {}); g.trackFunnelEvent = () => events++;
  const pending = g.prepareBeanSelectionExperiment();
  await pending; assert.equal(timeout, undefined); state.accept('late', receipt()); assert.equal(state.content(), 'A'); assert.equal(events, 0);
  const { Controller } = compile(`export class Controller { ${method('PchConveyorGameplayController.ts', 'getBeanSelectionBucket')} }`, { getBeanSelectionPreview: () => 'B' });
  const c = new Controller(); c.runtime = { _activeGameplayEntryMode: 'main', getActiveLogicalLevelId: () => 2 };
  assert.equal(c.getBeanSelectionBucket(), 'B'); c.runtime.isRankedPvpMode = () => true; assert.equal(c.getBeanSelectionBucket(), 'A');
  c.runtime.isRankedPvpMode = () => false; c.runtime.isCoopMode = () => true; assert.equal(c.getBeanSelectionBucket(), 'A');
}
async function cloudEntry() {
  let profile;
  const collection = { where: () => ({ limit: () => ({ get: async () => ({ data: profile ? [profile] : [] }) }) }),
    add: async ({ data }) => { profile = { ...data, _id: 'p' }; }, doc: () => ({ update: async ({ data }) => Object.assign(profile, data) }) };
  const cloud = { init() {}, getWXContext: () => ({ OPENID: 'uid' }), database: () => ({ collection: () => collection }) };
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', fs.readFileSync(path.join(root, 'cloudfunctions/getOpenid/index.js'), 'utf8'))(mod, mod.exports,
    id => id === './third-level-experiment' ? require('../cloudfunctions/getOpenid/third-level-experiment') : id === 'wx-server-sdk' ? cloud : id === './encouragement-experiment' ? require('../cloudfunctions/getOpenid/encouragement-experiment') : id === './first-level-experiment' ? first : server);
  const event = { firstLevelExperiment: { id: first.ID, eligible: true }, beanSelectionExperiment: { id: server.ID, eligible: true } };
  const one = await mod.exports.main(event); assert.equal(one.ok, true); assert.equal(one.beanSelectionExperiment.status, 'excluded');
  assert.deepEqual(profile.beanSelectionExperiment, one.beanSelectionExperiment);
  const originalFirst = profile.firstLevelExperiment;
  const two = await mod.exports.main(event); assert.deepEqual(two.beanSelectionExperiment, one.beanSelectionExperiment);
  await mod.exports.main({ beanSelectionExperiment: { id: server.ID, exclusionReason: 'identity_timeout' } });
  assert.equal(profile.beanSelectionExperiment.status, 'excluded'); assert.deepEqual(profile.firstLevelExperiment, originalFirst);
  profile = { _id: 'old' }; const old = await mod.exports.main(event); assert.equal(old.beanSelectionExperiment.status, 'excluded');
}
Promise.all([gate(), cloudEntry()]).then(() => console.log('bean selection assignment, independent split, identity gate, persistence and mode exclusions passed'), error => { console.error(error); process.exitCode = 1; });
