'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');
const { transition, inventory } = require('../cloudfunctions/updateUserProfileAssets/profile-customization');
const catalog = require('../cloudfunctions/updateUserProfileAssets/profile-catalog.json');
function harness(initialState) {
  const storage = new Map([['pdd.level', '1']]), requests = new Map();
  if (initialState) storage.set('pdd.profile.customization.v1', JSON.stringify(initialState));
  let doc = { savedLevel: 1, gold: 10000, vigor: 10, pvpEconomyRevision: 0 };
  let preview = false, loseResponse = false, miniGame = true;
  const calls = [], applied = [];
  let beforeCall = () => {}, lostSelect = false;
  const cloud = { async init() { return true; }, async callFunction(name, event) {
    calls.push({ ...event });
    await beforeCall(event, doc);
    const result = transition(doc, event, requests.get(event.requestId), 100);
    doc = { ...doc, ...result.patch };
    if (result.record) requests.set(event.requestId, result.record);
    if (loseResponse && event.action === 'profileBuy') { loseResponse = false; throw Error('network response lost'); }
    if (lostSelect && event.action === 'profileSelect') { lostSelect = false; throw Error('selection response lost'); }
    return { ok: true, customizationSchemaVersion: 1, customization: result.state, inventory: inventory(doc), ownerKey: 'a'.repeat(64) };
  } };
  const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const dependencies = {
    cc: { sys: { localStorage } },
    './ChapterRewardPolicy': { eligibleChapterRewards: (cleared, claimed) => require('../cloudfunctions/updateUserProfileAssets/chapter-rewards').claimChapterRewards({ savedLevel: cleared + 1, chapterRewardClaims: claimed }, catalog, 0).granted },
    './PlatformCloudMgr': { PlatformCloudMgr: { inst: cloud } },
    './UserStateSyncMgr': { PVP_ECONOMY_REVISION_KEY: 'economyRevision' },
    './ProfileCustomizationConfig': { PROFILE_ITEMS: catalog, RETIRED_PROFILE_ITEMS: require('../cloudfunctions/updateUserProfileAssets/profile-retired.json'), profileItem: id => { const r = catalog.find(x => x.id === id); if (!r) throw Error('invalid id'); return r; }, mainlineClearedCount: n => Math.max(0, Math.floor(n || 1) - 1) },
    './ProfileResourceService': { profileAssetUrl: id => `https://example.com/${id}.png` },
    './StartupLocalProgress': { STARTUP_LS_LEVEL: 'pdd.level' },
    './BrowserLevelPreview': { getBrowserLevelPreview: () => ({ active: preview }) },
    './PreviewRewardSave': { PreviewRewardSave: { avatars: () => [], frames: () => [] } },
    './WorkbenchPreviewService': { isWorkbenchPreviewRequested: () => false },
    './MiniGamePlatform': { isMiniGameRuntime: () => miniGame },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('assets/Scripts/Core/ProfileCustomizationMgr.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('module', 'exports', 'require', code)(module, module.exports, name => { if (!dependencies[name]) throw Error(name); return dependencies[name]; });
  const runtime = { async ensureCloudGameStateSyncReady() { doc.savedLevel = Number(storage.get('pdd.level')); return true; }, applyPvpEconomySnapshot(snapshot) { applied.push(snapshot); storage.set('economyRevision', String(snapshot.pvpEconomyRevision)); } };
  return { beforeCall: fn => { beforeCall = fn; }, loseNextSelect: () => { lostSelect = true; }, mgr: module.exports.ProfileCustomizationMgr.inst, runtime, storage, calls, applied, document: () => doc, setPreview: value => { preview = value; }, setBrowser: () => { miniGame = false; }, loseNextBuy: () => { loseResponse = true; } };
}

test('legacy cloud customization without ad counters applies and persists without mutating the response', () => {
 const h = harness();
 const legacy = { version: 1, revision: 0, ownedAvatarIds: [1001], ownedFrameIds: [2001], equippedAvatarId: 1001, equippedFrameId: 2001, avatarSource: 'catalog', customNickname: '', seenItemIds: [] };
 assert.doesNotThrow(() => h.mgr.applyCloud(legacy));
 assert.deepEqual(h.mgr.snapshot.adWatchCounts, {});
 assert.equal(h.mgr.snapshot.avatarSource, 'catalog');
 assert.equal(Object.hasOwn(legacy, 'adWatchCounts'), false);
 assert.deepEqual(JSON.parse(h.storage.get('pdd.profile.customization.v1')).adWatchCounts, {});
 const before = h.mgr.snapshot;
 assert.throws(() => h.mgr.applyCloud({ ...legacy, adWatchCounts: null }), /装扮存档格式不正确/);
 assert.throws(() => h.mgr.applyCloud({ ...legacy, revision: -1 }), /装扮存档格式不正确/);
 assert.throws(() => h.mgr.applyCloud({ ...legacy, equippedAvatarId: 9999 }), /装备未拥有的装扮/);
 assert.deepEqual(h.mgr.snapshot, before);
});

test('equipment waits for confirmation and normally uses one cloud request', async () => {
 const h = harness();
 h.document().savedLevel = 100;
 await h.mgr.refresh(h.runtime);
 const row = catalog.find(r => r.unlock === 'mainline');
 let release;
 const gate = new Promise(resolve => { release = resolve; });
 h.beforeCall(event => event.action === 'profileSelect' ? gate : undefined);
 h.calls.length = 0;
 const selecting = h.mgr.select(h.runtime, { itemId: row.id });
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(h.mgr.snapshot.equippedAvatarId, 1001);
 release(); await selecting;
 assert.deepEqual(h.calls.map(e => e.action), ['profileSelect']);
 assert.equal(h.mgr.snapshot.equippedAvatarId, row.id);
});

test('revision conflict refreshes and retries once; repeated conflict stops', async () => {
 const h = harness(); await h.mgr.refresh(h.runtime);
 h.document().customization.revision++;
 h.calls.length = 0;
 await h.mgr.select(h.runtime, { itemId: 1001 });
 assert.deepEqual(h.calls.map(e => e.action), ['profileSelect','profileGet','profileSelect']);
 h.calls.length = 0;
 h.beforeCall((e, doc) => { if(e.action === 'profileSelect') doc.customization.revision++; });
 await assert.rejects(h.mgr.select(h.runtime, { itemId: 1001 }), /资料已更新/);
 assert.deepEqual(h.calls.map(e => e.action), ['profileSelect','profileGet','profileSelect']);
 assert.equal(h.storage.has('pdd.profile.customization.selection.v1'), false);
});

test('lost selection response is retained and recovered without double mutation', async () => {
 const h = harness(); await h.mgr.refresh(h.runtime); h.calls.length = 0;
 h.loseNextSelect();
 await assert.rejects(h.mgr.select(h.runtime, { itemId: 1001 }), /response lost/);
 assert.deepEqual(h.calls.map(e => e.action), ['profileSelect']);
 assert(h.storage.has('pdd.profile.customization.selection.v1'));
 const revision = h.document().customization.revision;
 await h.mgr.refresh(h.runtime);
 assert.equal(h.document().customization.revision, revision);
 assert.equal(h.storage.has('pdd.profile.customization.selection.v1'), false);
});

test('unowned equipment does not trigger conflict retry', async () => {
 const h = harness(); await h.mgr.refresh(h.runtime); h.calls.length = 0;
 const row = catalog.find(r => r.unlock === 'gold');
 await assert.rejects(h.mgr.select(h.runtime, { itemId: row.id }), /未解锁/);
 assert.deepEqual(h.calls.map(e => e.action), ['profileSelect']);
 assert.equal(h.mgr.snapshot.equippedAvatarId, 1001);
});

test('browser ad simulation counts only successful callbacks, unlocks and equips locally without cloud', async () => {
  const h = harness(); h.setBrowser();
  h.runtime.ensureCloudGameStateSyncReady = async () => { throw Error('browser must not sync'); };
  for (const kind of ['avatar', 'frame']) {
    const row = catalog.find(r => r.kind === kind && r.unlock === 'ad' && r.value >= 2);
    await h.mgr.beginAd(h.runtime, row.id); // Cancelled/no completion callback.
    assert.equal(h.mgr.snapshot.adWatchCounts[row.id], undefined);
    for (let count = 1; count <= row.value; count++) {
      const request = await h.mgr.beginAd(h.runtime, row.id);
      await h.mgr.claimAd(h.runtime, row.id, request);
      await h.mgr.claimAd(h.runtime, row.id, request);
      assert.equal(h.mgr.snapshot.adWatchCounts[row.id], count);
      assert.equal(h.mgr.owned(row.id), count === row.value);
    }
    await h.mgr.select(h.runtime, { itemId: row.id });
    assert.equal(h.mgr.snapshot[kind === 'avatar' ? 'equippedAvatarId' : 'equippedFrameId'], row.id);
  }
  assert.equal(h.calls.length, 0);
  assert(!h.storage.has('pdd.profile.customization.pending.v1'));
});
test('Creator level preview simulates each ad completion and allows equipment without cloud sync', async () => {
  const h = harness(); h.setBrowser(); h.setPreview(true);
  h.runtime.ensureCloudGameStateSyncReady = async () => { throw Error('preview must not sync'); };
  const row = catalog.find(r => r.unlock === 'ad' && r.value === 2);
  for (let count = 1; count <= 2; count++) {
    const request = await h.mgr.beginAd(h.runtime, row.id);
    await h.mgr.claimAd(h.runtime, row.id, request);
    assert.equal(h.mgr.snapshot.adWatchCounts[row.id], count);
    assert.equal(h.mgr.owned(row.id), count === 2);
  }
  await h.mgr.select(h.runtime, { itemId: row.id });
  assert.equal(h.mgr.snapshot[row.kind === 'avatar' ? 'equippedAvatarId' : 'equippedFrameId'], row.id);
  assert.equal(h.calls.length, 0);
});
test('browser preview gold purchase spends once, persists ownership and rejects insufficient funds', async () => {
  const h = harness(); h.setBrowser(); h.setPreview(true);
  const rows = catalog.filter(r => r.unlock === 'gold');
  const row = rows[0]; let gold = row.value;
  h.runtime.spendGold = cost => { if (gold < cost) return false; gold -= cost; return true; };
  h.runtime.ensureCloudGameStateSyncReady = async () => { throw Error('must not sync'); };
  await h.mgr.buy(h.runtime, row.id);
  assert.equal(gold, 0); assert(h.mgr.owned(row.id));
  await h.mgr.buy(h.runtime, row.id); assert.equal(gold, 0);
  const reopened = harness(JSON.parse(h.storage.get('pdd.profile.customization.v1')));
  assert(reopened.mgr.owned(row.id));
  await assert.rejects(h.mgr.buy(h.runtime, rows[1].id), /金币不足/);
  assert(!h.mgr.owned(rows[1].id)); assert.equal(gold, 0);
  assert.equal(h.calls.length, 0);
});
test('lost purchase response recovers same request once, with authoritative economy', async () => {
  const h = harness(), row = catalog.find(r => r.unlock === 'gold');
  h.loseNextBuy();
  await assert.rejects(h.mgr.buy(h.runtime, row.id), /network/);
  assert.equal(h.document().gold, 10000 - row.value);
  assert.equal(h.mgr.owned(row.id), false);
  await h.mgr.refresh(h.runtime);
  assert.equal(h.mgr.owned(row.id), true);
  assert.equal(h.document().gold, 10000 - row.value);
  assert.equal(h.applied.length, 0);
  await h.mgr.buy(h.runtime, row.id);
  const buys = h.calls.filter(x => x.action === 'profileBuy');
  assert.equal(buys.length, 2); assert.equal(buys[0].requestId, buys[1].requestId);
  assert.equal(h.applied.at(-1).gold, 10000 - row.value);
});

test('viewing one new item clears only that item and the home badge clears after all are viewed', () => {
  const h = harness();
  const avatar = catalog.find(r => r.kind === 'avatar' && r.unlock === 'ad');
  const frame = catalog.find(r => r.kind === 'frame' && r.unlock === 'ad');
  const cloud = { ...h.mgr.snapshot, revision: 1, ownedAvatarIds: [1001, avatar.id], ownedFrameIds: [2001, frame.id] };
  h.mgr.applyCloud(cloud);
  let notifications = 0; h.mgr.subscribe(() => notifications++);
  assert(h.mgr.hasNewItems);
  h.mgr.markViewed(avatar.id);
  assert(!h.mgr.isNew(avatar.id)); assert(h.mgr.isNew(frame.id)); assert(h.mgr.hasNewItems);
  assert.equal(notifications, 1);
  h.mgr.applyCloud({ ...cloud, revision: 2 });
  assert(!h.mgr.isNew(avatar.id), 'stale cloud seen list cannot resurrect a badge');
  h.mgr.markViewed(frame.id);
  assert(!h.mgr.hasNewItems);
  const reopened = harness(JSON.parse(h.storage.get('pdd.profile.customization.v1')));
  assert(!reopened.mgr.hasNewItems, 'viewed state survives reopening/restart');
});
test('ad begin and reopen do not claim an unfinished ad; duplicate completion counts once', async () => {
  const h = harness(), row = catalog.find(r => r.unlock === 'ad');
  const id = await h.mgr.beginAd(h.runtime, row.id);
  await h.mgr.refresh(h.runtime);
  assert.equal(h.mgr.snapshot.adWatchCounts[row.id], undefined);
  await h.mgr.claimAd(h.runtime, row.id, id);
  await h.mgr.claimAd(h.runtime, row.id, id);
  assert.equal(h.mgr.snapshot.adWatchCounts[row.id], 1);
  assert.equal(h.mgr.snapshot.equippedAvatarId, 1001);
});
test('preview cannot grant mainline items or make customization cloud mutations', async () => {
  const h = harness(), row = catalog.find(r => r.unlock === 'mainline');
  h.storage.set('pdd.level', String(row.value + 1)); h.setPreview(true);
  h.mgr.refreshProgressUnlocks(); assert.equal(h.mgr.owned(row.id), false);
  await assert.rejects(h.mgr.select(h.runtime, { itemId: 1001 }), /预览模式/);
  assert.equal(h.calls.length, 0);
  h.setPreview(false); h.mgr.refreshProgressUnlocks(); assert.equal(h.mgr.owned(row.id), false);
  await h.runtime.ensureCloudGameStateSyncReady(); await h.mgr.refresh(h.runtime); assert.equal(h.mgr.owned(row.id), true);
});

test('authorized identity is default, explicit avatar survives refresh, legacy nickname never overrides', async () => {
  const h = harness();
  const user = { displayName: '授权名字', avatarUrl: 'https://example.com/wx.png' };
  assert.equal(h.mgr.display(user).avatarId, 0);
  assert.equal(h.mgr.display(user).displayName, user.displayName);
  await h.mgr.select(h.runtime, { itemId: 1001 });
  await h.mgr.refresh(h.runtime);
  assert.equal(h.mgr.display(user).avatarId, 1001);
  assert.equal(h.mgr.display(user).displayName, user.displayName);
  h.mgr.applyCloud({ ...h.mgr.snapshot, customNickname: '旧昵称' });
  assert.equal(h.mgr.display(user).displayName, user.displayName);
  assert.equal(h.mgr.display({ displayName: '玩家ABC', avatarUrl: '' }).avatarId, 1001);
});

test('retired ownership survives cloud recovery while equipment uses the new default', () => {
  const h = harness();
  h.mgr.applyCloud({ ...h.mgr.snapshot, revision: 4, ownedAvatarIds: [1001, 1036], equippedAvatarId: 1036, avatarSource: 'catalog' });
  assert(h.mgr.snapshot.ownedAvatarIds.includes(1036));
  assert.equal(h.mgr.snapshot.equippedAvatarId, 1001);
  assert.equal(h.mgr.display({ displayName: '玩家ABC', avatarUrl: '' }).avatarId, 1001);
});

test('old local equipment migrates without discarding revision or ownership', () => {
  const state = harness().mgr.snapshot;
  const h = harness({ ...state, revision: 7, ownedAvatarIds: [1001, 1036], equippedAvatarId: 1036, avatarSource: 'catalog' });
  assert.equal(h.mgr.snapshot.revision, 7);
  assert(h.mgr.snapshot.ownedAvatarIds.includes(1036));
  assert.equal(h.mgr.snapshot.equippedAvatarId, 1001);
});

test('previous blue-frame ownership and ad progress survive its promotion to default', () => {
  const state = harness().mgr.snapshot;
  const h = harness({ ...state, revision: 8, ownedFrameIds: [2001, 2002], equippedFrameId: 2002, adWatchCounts: { 2002: 1 } });
  assert.equal(h.mgr.snapshot.equippedFrameId, 2001);
  assert.equal(h.mgr.snapshot.revision, 8);
  assert.equal(h.mgr.snapshot.adWatchCounts[2002], 1);
});

test('full-save failure does not block profile actions or overwrite economy', async () => {
 const h = harness(); h.runtime.ensureCloudGameStateSyncReady = async () => { throw Error('sync failed'); };
 await h.mgr.refresh(h.runtime); await h.mgr.select(h.runtime, { itemId: 1001 });
 const row = catalog.find(r => r.unlock === 'ad');
 const id = await h.mgr.beginAd(h.runtime, row.id); await h.mgr.claimAd(h.runtime, row.id, id);
 assert.equal(h.mgr.snapshot.adWatchCounts[row.id], 1); assert.equal(h.applied.length, 0);
 await assert.rejects(h.mgr.buy(h.runtime, catalog.find(r => r.unlock === 'gold').id), /sync failed/);
 assert(!h.calls.some(r => r.action === 'profileBuy'));
});
test('local mainline progress cannot grant cloud equipment', async () => {
 const h = harness(), row = catalog.find(r => r.unlock === 'mainline');
 h.storage.set('pdd.level', String(row.value + 1)); await h.mgr.refresh(h.runtime);
 await assert.rejects(h.mgr.select(h.runtime, { itemId: row.id }));
 assert.notEqual(h.document()[row.kind === 'avatar' ? 'equippedAvatarId' : 'equippedFrameId'], row.id);
});
test('pending purchase survives independent ad completion', async () => {
 const h = harness(), gold = catalog.find(r => r.unlock === 'gold'); h.loseNextBuy();
 await assert.rejects(h.mgr.buy(h.runtime, gold.id), /network/);
 const pending = h.storage.get('pdd.profile.customization.pending.v1');
 h.runtime.ensureCloudGameStateSyncReady = async () => false; await h.mgr.refresh(h.runtime);
 const ad = catalog.find(r => r.unlock === 'ad');
 const id = await h.mgr.beginAd(h.runtime, ad.id); await h.mgr.claimAd(h.runtime, ad.id, id);
 assert.equal(h.storage.get('pdd.profile.customization.pending.v1'), pending); assert.equal(h.applied.length, 0);
});

test('equipping preserves all viewed badges and saves them to cloud', async () => {
 const h = harness(); h.storage.set('pdd.level', '115');
 await h.runtime.ensureCloudGameStateSyncReady(); await h.mgr.refresh(h.runtime);
 const rows = catalog.filter(r => h.mgr.owned(r.id));
 rows.forEach(r => h.mgr.markViewed(r.id));
 await h.mgr.select(h.runtime, { itemId: rows[0].id });
 for (const row of rows) {
  assert.equal(h.mgr.isNew(row.id), false);
  assert(h.document().customization.seenItemIds.includes(row.id));
 }
});

test('packaged price works without cloud rule payload or version', async () => {
 const h = harness(), row = catalog.find(r => r.unlock === 'gold');
 await h.mgr.buy(h.runtime, row.id);
 assert.equal(h.document().gold, 10000 - row.value);
 assert.equal(row.value, 300);
 assert(h.mgr.owned(row.id));
 assert(h.calls.every(event => !('rulesVersion' in event)));
});


test('chapter browser receipt recovers interrupted delivery without duplicating assets or equipping avatar', async () => {
  const h = harness(); h.setBrowser(); h.storage.set('pdd.level', '10');
  const beans = new Set();
  h.runtime.grantBeanSkin = id => beans.add(id);
  h.runtime.grantBackgroundSkin = () => { throw Error('unexpected background'); };
  let totals = {}, gold = 0, brush = 0, fail = true;
  h.runtime.readWechatGiftTotals = () => totals;
  h.runtime.applyWechatGiftState = state => {
    if (fail) { fail = false; throw Error('interrupted write'); }
    gold += (state.wechatGiftTotals.gold || 0) - (totals.gold || 0);
    brush += (state.wechatGiftTotals.brushCount || 0) - (totals.brushCount || 0);
    totals = { ...state.wechatGiftTotals };
  };
  await assert.rejects(h.mgr.claimChapterRewards(h.runtime), /interrupted/);
  const recovered = await h.mgr.claimChapterRewards(h.runtime);
  assert.equal(gold, 50); assert.equal(brush, 0); assert.equal(recovered.granted.length, 0);
  assert(!h.mgr.owned(1009)); assert.equal(h.mgr.snapshot.equippedAvatarId, 1001);
  assert(beans.has(2001));
  await h.mgr.claimChapterRewards(h.runtime);
  assert.equal(gold, 50); assert.equal(brush, 0); assert.equal(h.calls.length, 0);
});
