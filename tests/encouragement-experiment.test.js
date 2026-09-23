const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const base = `${__dirname}/../assets/Scripts/Core/`;
const server = require('../cloudfunctions/getOpenid/encouragement-experiment');
const first = require('../cloudfunctions/getOpenid/first-level-experiment');
const bean = require('../cloudfunctions/getOpenid/bean-selection-experiment');
function compile(file, deps = {}, globals = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(base + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('exports', 'require', ...Object.keys(globals), js)(exports, id => { assert.ok(id in deps, id); return deps[id]; }, ...Object.values(globals));
  return exports;
}
const mod = compile('EncouragementExperiment.ts'), State = mod.EncouragementExperimentState;
const data = {}; const storage = { getItem: k => data[k] ?? null, setItem: (k,v) => { data[k] = v; } };
const receipt = { id: server.ID, status: 'enrolled', content: 'B', enrolledAt: 1000, reason: 'new_user' };
const state = new State(); state.initialize(storage, true, false); state.accept('uid', receipt); state.freeze();
assert.equal(state.content(), 'A'); state.accept('uid', { ...receipt, content: 'A' }); assert.equal(state.content(), 'A');
const restore = new State(); restore.initialize(storage, true, false); restore.accept('uid', receipt); restore.freeze(); assert.equal(restore.content(), 'A');
const timeout = new State(); timeout.initialize(storage, true, false); timeout.freeze(); timeout.accept('uid', receipt);
assert.equal(timeout.content(), 'A'); assert.equal(timeout.decision.reason, 'identity_unavailable_or_timeout');
const test = new State(); test.initialize(storage, true, true); test.freeze(); assert.equal(test.decision.status, 'test');
const policy = compile('EncouragementFeedbackPolicy.ts', { 'cc/env': { PREVIEW: false }, './MiniGamePlatform': { isMiniGameRuntime: () => true }, './EncouragementExperiment': { encouragementExperiment: state } });
const resolve = policy.resolveEncouragementBucket;
assert.equal(resolve('main', 2, false, 'B', false, ''), 'B');
for (const mode of ['theme','external','']) assert.equal(resolve(mode, 2, false, 'B', false, ''), 'A');
assert.equal(resolve('main', 1, false, 'B', false, ''), 'A');
assert.equal(resolve('main', 2, true, 'B', false, ''), 'A');
assert.equal(resolve('main', 2, false, 'A', true, '?encourage=B'), 'B');
assert.equal(resolve('main', 2, false, 'B', true, '?encourage=A'), 'A');
assert.throws(() => resolve('main', 2, false, 'A', true, '?encourage=C'), /无效/);
const counts = {};
for (let i = 0; i < 60000; i++) {
  const uid = 'encouragement-test-' + i, key = first.bucket(uid) + bean.bucket(uid);
  counts[key] ||= [0,0]; counts[key][server.bucket(uid) === 'A' ? 0 : 1]++;
}
assert.equal(Object.keys(counts).length, 6);
for (const [a,b] of Object.values(counts)) assert.ok(a/(a+b) > .47 && a/(a+b) < .53);
async function cloudTest() {
  let profile;
  const collection = { where: () => ({ limit: () => ({ get: async () => ({ data: profile ? [profile] : [] }) }) }),
    add: async ({data}) => { profile = {...data, _id:'p'}; }, doc: () => ({ update: async ({data}) => Object.assign(profile,data) }) };
  const cloud = { init() {}, getWXContext: () => ({OPENID:'uid'}), database: () => ({collection: () => collection}) };
  const m = { exports: {} };
  new Function('module','exports','require',fs.readFileSync(`${__dirname}/../cloudfunctions/getOpenid/index.js`,'utf8'))(m,m.exports,
    id => id === './third-level-experiment' ? require('../cloudfunctions/getOpenid/third-level-experiment') : id === 'wx-server-sdk' ? cloud : id === './first-level-experiment' ? first : id === './bean-selection-experiment' ? bean : server);
  const event = { encouragementExperiment: { id:server.ID, eligible:true }, firstLevelExperiment: { id:first.ID, eligible:true }, beanSelectionExperiment: { id:bean.ID, eligible:true } };
  const one = await m.exports.main(event); assert.equal(one.ok,true); assert.equal(one.encouragementExperiment.status,'excluded');
  const original = JSON.stringify([profile.firstLevelExperiment, profile.beanSelectionExperiment]);
  const two = await m.exports.main(event); assert.deepEqual(two.encouragementExperiment,one.encouragementExperiment);
  await m.exports.main({encouragementExperiment:{id:server.ID,exclusionReason:'identity_timeout'}});
  assert.equal(profile.encouragementExperiment.status,'excluded'); assert.equal(JSON.stringify([profile.firstLevelExperiment,profile.beanSelectionExperiment]),original);
  profile = {_id:'old'}; assert.equal((await m.exports.main(event)).encouragementExperiment.status,'excluded');
}
const analytics = fs.readFileSync(base+'AnalyticsMgr.ts','utf8');
assert.ok(analytics.includes('...encouragementExperiment.fields()'));
assert.ok(!analytics.includes('encouragement_experiment_exposure'));
cloudTest().then(() => console.log('encouragement experiment: fixed state, timeout, scope, preview, independent 12 cells and cloud persistence passed'), e => { console.error(e); process.exitCode=1; });
