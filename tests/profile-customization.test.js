'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, transition } = require('../cloudfunctions/updateUserProfileAssets/profile-customization');
const catalog = require('../cloudfunctions/updateUserProfileAssets/profile-catalog.json');
const apply = (doc, result) => ({ ...doc, ...result.patch });
test('mainline uses saved progress minus one, never last entered level', () => {
  for (const row of catalog.filter(r => r.unlock === 'mainline')) {
    const owns = s => [...s.ownedAvatarIds, ...s.ownedFrameIds].includes(row.id);
    assert.equal(owns(normalize({ savedLevel: row.value, lastLevelId: 9999 })), false);
    assert.equal(owns(normalize({ savedLevel: row.value + 1 })), true);
  }
});

test('retired items retain ownership but cannot be newly selected or charged', () => {
  const doc = { gold: 1000, customization: { ownedAvatarIds: [1001, 1036], equippedAvatarId: 1036 } };
  const state = normalize(doc);
  assert(state.ownedAvatarIds.includes(1036));
  assert.equal(state.equippedAvatarId, 1001);
  for (const action of ['profileSelect', 'profileBuy']) assert.throws(() => transition(doc, { action, itemId: 1036, revision: 0 }, null, 0), /已停用/);
});
test('gold purchase is atomic and replay does not charge twice', () => {
  const row = catalog.find(r => r.unlock === 'gold');
  const doc = { gold: row.value + 12, pvpEconomyRevision: 7 };
  const event = { action: 'profileBuy', itemId: row.id, pvpEconomyRevision: 7 };
  const first = transition(doc, event, null, 100);
  assert.equal(first.patch.gold, 12);
  assert.equal(first.patch.pvpEconomyRevision, 8);
  const after = apply(doc, first);
  assert.deepEqual(transition(after, event, first.record, 101).patch, {});
  assert.equal(transition(after, { ...event, pvpEconomyRevision: 8 }, null, 102).patch.gold, undefined);
  assert.throws(() => transition({ ...doc, gold: row.value - 1 }, event, null, 100), /金币数量不足/);
  assert.throws(() => transition(doc, { ...event, pvpEconomyRevision: 6 }, null, 100), /资产已更新/);
});
test('ad begin grants nothing; claim is idempotent, expires and never auto-equips', () => {
  const row = catalog.find(r => r.unlock === 'ad');
  let doc = {};
  const begin = transition(doc, { action: 'profileAdBegin', itemId: row.id }, null, 100);
  assert.equal(begin.state.adWatchCounts[row.id], undefined);
  doc = apply(doc, begin);
  const event = { action: 'profileAdClaim', itemId: row.id };
  assert.throws(() => transition(doc, event, null, 101), /不存在/);
  assert.throws(() => transition(doc, event, begin.record, begin.record.expiresAt + 1), /已过期/);
  const claim = transition(doc, event, begin.record, 101);
  assert.equal(claim.state.adWatchCounts[row.id], 1);
  assert.equal(claim.state.equippedAvatarId, 1001);
  assert.deepEqual(transition(apply(doc, claim), event, claim.record, 102).patch, {});
});
test('activity items cannot be purchased, watched or equipped', () => {
  for (const row of catalog.filter(r => r.unlock === 'activity')) {
    for (const action of ['profileBuy', 'profileAdBegin', 'profileSelect']) {
      assert.throws(() => transition({}, { action, itemId: row.id, revision: 0 }, null, 0));
    }
  }
  assert.throws(() => transition({}, { action: 'profileActivityClaim', itemId: 1006 }, null, 0), /不支持/);
});
test('selection rejects stale revision and preserves WeChat identity', () => {
  const doc = { avatarUrl: 'https://example.com/wechat.png', displayName: '微信名' };
  assert.throws(() => transition(doc, { action: 'profileSelect', customNickname: '豆豆', revision: 0 }, null, 1), /不支持修改昵称/);
  const result = transition(doc, { action: 'profileSelect', itemId: 1001, revision: 0 }, null, 1);
  assert.equal(result.state.avatarSource, 'catalog');
  assert.equal(result.patch.avatarUrl, undefined);
  assert.equal(result.patch.displayName, undefined);
  assert.throws(() => transition(apply(doc, result), { action: 'profileSelect', revision: 0 }, null, 2), /资料已更新/);
});
test('transaction adapter retries concurrent purchase without double charge and rejects storage failures', async () => {
  const { execute } = require('../cloudfunctions/updateUserProfileAssets/profile-customization');
  const row = catalog.find(r => r.unlock === 'gold');
  let records = new Map([['user_profile/player', { openid: 'owner', gold: row.value + 20, pvpEconomyRevision: 0 }]]);
  let gate = Promise.resolve(), failRequestRead = false;
  const db = { runTransaction(fn) {
    const run = gate.then(async () => {
      const staged = new Map([...records].map(([key, value]) => [key, JSON.parse(JSON.stringify(value))]));
      const result = await fn({ collection(name) { return { doc(id) {
        const key = name + '/' + id;
        return {
          async get() { if (failRequestRead && name === 'profile_customization_requests') throw Error('permission denied'); return { data: staged.get(key) || null }; },
          async set({ data }) { staged.set(key, data); },
          async update({ data }) { staged.set(key, { ...staged.get(key), ...data }); },
        };
      } }; } });
      records = staged; return result;
    });
    gate = run.catch(() => {}); return run;
  } };
  const event = { action: 'profileBuy', itemId: row.id, requestId: 'purchase_12345', pvpEconomyRevision: 0 };
  const [a, b] = await Promise.all([execute(db, 'owner', 'player', event), execute(db, 'owner', 'player', event)]);
  assert.equal(a.inventory.gold, 20); assert.equal(b.inventory.gold, 20); assert.equal(b.replay, true);
  assert.equal(records.get('user_profile/player').pvpEconomyRevision, 1);
  failRequestRead = true;
  await assert.rejects(execute(db, 'owner', 'player', { ...event, requestId: 'new_request' }), /permission denied/);
  assert.equal(records.get('user_profile/player').gold, 20);
  await assert.rejects(execute(db, 'other', 'player', event), /账号不匹配/);
});

test('ad transaction excludes database metadata and duplicate claims grant once', async () => {
 const { execute } = require('../cloudfunctions/updateUserProfileAssets/profile-customization');
 const row = catalog.find(r => r.kind === 'frame' && r.unlock === 'ad');
 const records = new Map([['user_profile/p', { openid: 'owner' }]]);
 const db = { async runTransaction(fn) {
  const staged = new Map(Array.from(records, ([k,v]) => [k, structuredClone(v)]));
  const result = await fn({ collection(name) { return { doc(id) {
   const key = name + '/' + id;
   return {
    async get() { assert(['user_profile', 'profile_customization_requests'].includes(name), 'no configuration collection is required'); const data = staged.get(key); return { data: data ? { ...data, _id: id } : null }; },
    async set({data}) { assert(!Object.hasOwn(data, '_id'), 'cannot update _id'); staged.set(key, data); },
    async update({data}) { staged.set(key, { ...staged.get(key), ...data }); }
   };
  }}; }});
  records.clear(); for (const [k,v] of staged) records.set(k,v); return result;
 }};
 const event = { itemId: row.id, requestId: 'ad_metadata_regression' };
 await execute(db,'owner','p',{...event,action:'profileAdBegin'});
 const first = await execute(db,'owner','p',{...event,action:'profileAdClaim'});
 const replay = await execute(db,'owner','p',{...event,action:'profileAdClaim'});
 assert.equal(first.customization.adWatchCounts[row.id],1);
 assert.equal(replay.customization.adWatchCounts[row.id],1); assert.equal(replay.replay,true);
});
