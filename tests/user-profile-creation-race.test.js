const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function setup({ initial = [], participants = 1, failure = null, invisibleWinner = false } = {}) {
  const rows = structuredClone(initial);
  let reads = 0, adds = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const collection = {
    where({ openid }) { return { limit(n) { return { async get() {
      const data = structuredClone(rows.filter(r => r.openid === openid).slice(0, n));
      if (++reads <= participants) { if (reads === participants) release(); await barrier; }
      return { data };
    } }; } }; },
    async add({ data }) {
      adds++;
      if (failure) throw failure;
      if (invisibleWinner || rows.some(r => r.openid === data.openid)) throw new Error('E11000 duplicate key error');
      const _id = `random-${rows.length}`;
      rows.push({ _id, ...structuredClone(data) });
      return { _id };
    },
    doc(id) { return {
      async get() { return { data: structuredClone(rows.find(r => r._id === id)) }; },
      async update({ data }) {
        const row = rows.find(r => r._id === id);
        assert(row, 'must preserve existing document ID');
        for (const [key, value] of Object.entries(data)) {
          row[key] = value && value.__inc !== undefined ? (row[key] || 0) + value.__inc : structuredClone(value);
        }
      },
    }; },
  };
  let txTail = Promise.resolve();
  const db = {
    command: { inc: n => ({ __inc: n }) },
    collection: name => name === 'user_profile' ? collection : { async add() { return { _id: 'event' }; } },
    runTransaction(fn) { const next = txTail.then(() => fn(db)); txTail = next.catch(() => {}); return next; },
  };
  function load(name) {
    const filename = path.resolve(__dirname, `../cloudfunctions/${name}/index.js`);
    const localRequire = createRequire(filename), exports = {};
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      exports, console, require: id => id === 'wx-server-sdk' ? {
        init() {}, database: () => db, getWXContext: () => ({ OPENID: 'player' }),
      } : localRequire(id),
    }, { filename });
    return exports.main;
  }
  return { rows, load, adds: () => adds, db };
}
const calls = [
  ['getOpenid', {}],
  ['syncUserState', { action: 'save' }],
  ['updateUserProfileAssets', { goldDelta: 7 }],
  ['addBehaviorData', { eventName: 'game_start' }],
];
(async () => {
  // Each creator takes its turn winning, including the legacy analytics entry.
  for (let winner = 0; winner < calls.length; winner++) {
    const env = setup({ participants: 4 });
    const ordered = calls.slice(winner).concat(calls.slice(0, winner));
    const results = await Promise.all(ordered.map(([name, event]) => env.load(name)(event)));
    assert(results.every(r => r.ok), JSON.stringify(results));
    assert.equal(env.rows.length, 1);
    assert.equal(env.rows[0].gold, 7);
    assert.equal(env.rows[0].totalPlayTimes, 1);
    const { createEconomyService } = require('../cloudfunctions/pvpService/economy');
    assert.equal((await createEconomyService({ db: env.db }).findInventory('player'))._id, env.rows[0]._id);
  }
  const fresh = setup({ participants: 8 });
  const logins = await Promise.all(Array.from({ length: 8 }, () => fresh.load('getOpenid')({
    firstLevelExperiment: { id: 'first_level_abc_v1', eligible: true },
  })));
  assert(logins.every(r => r.ok));
  assert.equal(logins.filter(r => r.isNewUser).length, 1);
  assert.equal(fresh.rows.length, 1);
  assert.equal(fresh.rows[0].freezeCount, 3, 'starter inventory must not accumulate');
  assert.equal(fresh.rows[0].firstLevelExperiment.status, 'enrolled');
  for (const result of logins) {
    assert.equal(JSON.stringify(result.firstLevelExperiment), JSON.stringify(fresh.rows[0].firstLevelExperiment));
  }
  for (const [name, event] of calls) {
    const old = setup({ initial: [{ _id: 'legacy-random-id', openid: 'player', gold: 100, freezeCount: 9 }] });
    assert.equal((await old.load(name)(event)).ok, true, name);
    assert.equal(old.adds(), 0);
    assert.equal(old.rows[0]._id, 'legacy-random-id');
    assert.equal(old.rows[0].freezeCount, 9);
    const broken = setup({ failure: new Error('network unavailable') });
    const result = await broken.load(name)(event);
    assert.equal(result.ok, false);
    assert.match(result.errorMessage, /network unavailable/);
    assert.equal(broken.adds(), 1);
    const missing = setup({ invisibleWinner: true });
    assert.equal((await missing.load(name)(event)).ok, false, 'conflict without readable winner must fail');
    assert.equal(missing.adds(), 1, 'must not retry creating indefinitely');
    const duplicate = setup({ initial: [{ _id: 'a', openid: 'player' }, { _id: 'b', openid: 'player' }] });
    assert.equal((await duplicate.load(name)(event)).ok, false, 'historical duplicates must not be chosen arbitrarily');
  }
  console.log('user-profile-creation-race.test.js passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
