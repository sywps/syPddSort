'use strict';
const assert = require('assert');
const load = require('./helpers/local-chapter-runtime');
const { backend } = require('./douyin-business-cloud.test');
const rules = require('../cloudfunctions-douyin/businessRules');
const sync = require('../cloudfunctions-douyin/chapterRewardSync');
const policy = require('../cloudfunctions/updateUserProfileAssets/chapter-reward-policy');
const clone = value => JSON.parse(JSON.stringify(value));
function device() {
    const storage = new Map(), owned = new Set();
    let api = load(storage), totals = {}, wallet = { gold: 100, brushCount: 0, magnetCount: 0, freezeCount: 0 }, fail = false, updatedAt = 0;
    const runtime = { readWechatGiftTotals: () => clone(totals), setLocalUserStateUpdatedAt: value => { updatedAt = value; }, applyWechatGiftState(state, replace, markUpdated = true) {
        if (fail) { fail = false; throw Error('interrupted asset write'); }
        for (const field of Object.keys(wallet)) { const delta = (state.wechatGiftTotals[field] || 0) - (totals[field] || 0); assert(delta >= 0); wallet[field] += delta; }
        totals = clone(state.wechatGiftTotals);
        if (markUpdated) updatedAt = Date.now();
    }, grantBeanSkin: id => owned.add(id), grantBackgroundSkin: id => owned.add(id) };
    return { storage, runtime, owned, get updatedAt() { return updatedAt; }, get ledger() { return api.LocalChapterRewards; }, restart() { api = load(storage); }, fail() { fail = true; }, wallet,
        snapshot(level, time = 1000) { return { ...wallet, savedLevel: level, stateUpdatedAt: time, wechatGiftProtocol: 1, wechatGiftTotals: clone(totals), chapterRewardProtocol: 1, chapterRewardReceipts: this.ledger.receipts(), pvpEconomyRevision: 0, backgroundSkinResetVersion: 1, ownedBeanSkinIds: [2000, ...owned], ownedBackgroundSkinIds: [1005], themeUnlockedIds: [], themeCompletedIds: [] }; } };
}
function merge(current, source) { const p = sync.prepare(source, current, rules.profile); return { ...current, ...p.patch, ...rules.sync.buildGameStatePatch(source, p.current) }; }
(async () => {
    const d = device();
    assert.equal(d.ledger.claim(d.runtime, 3).granted.length, 0);
    d.fail(); assert.throws(() => d.ledger.claim(d.runtime, 4), /interrupted/);
    d.restart(); d.ledger.recover(d.runtime);
    assert.deepEqual(d.wallet, { gold: 150, brushCount: 1, magnetCount: 0, freezeCount: 0 });
    d.wallet.brushCount--; d.restart(); assert.equal(d.ledger.claim(d.runtime, 4).granted.length, 0); assert.equal(d.wallet.brushCount, 0);
    d.ledger.claim(d.runtime, 9); assert(d.owned.has(2004)); assert.equal(d.wallet.magnetCount, 1);
    const source = d.snapshot(10), cloud = merge({}, source);
    assert.equal(cloud.gold, 150); assert.equal(cloud.brushCount, 0); assert.equal(cloud.magnetCount, 1);
    assert.equal(merge(cloud, source).gold, 150);
    const restored = device(); restored.ledger.mergeCloud(restored.runtime, sync.expose(cloud, rules.sync.extractGameState(cloud)));
    assert.equal(restored.ledger.claim(restored.runtime, 9).granted.length, 0);
    assert(restored.owned.has(2004));
    assert.equal(restored.updatedAt, 0, 'cloud receipt import must not make the local wallet newer than the cloud restore');
    // Two devices independently receive the same node: upload is idempotent.
    const a = device(), b = device(); a.ledger.claim(a.runtime, 4); b.ledger.claim(b.runtime, 4);
    const first = merge({}, a.snapshot(5)); const duplicate = merge(first, b.snapshot(5, 1001));
    assert.equal(duplicate.gold, 150); assert.equal(duplicate.brushCount, 1); assert.equal(duplicate.chapterRewardReceipts.length, 1);
    // An old response arrives after local reward+consumption: keep pending receipt and consumption.
    a.ledger.claim(a.runtime, 9); a.wallet.magnetCount--;
    a.ledger.mergeCloud(a.runtime, sync.expose(first, rules.sync.extractGameState(first)));
    assert.equal(a.wallet.magnetCount, 0); assert.equal(a.ledger.receipts().length, 2);
    const after = merge(first, a.snapshot(10, 1002)); assert.equal(after.magnetCount, 0);
    // A lower-timestamp upload adds only unseen grants, not stale gameplay balances.
    const current = { ...first, gold: 130, stateUpdatedAt: 2000 };
    const older = merge(current, d.snapshot(10, 1000)); assert.equal(older.gold, 130); assert.equal(older.magnetCount, 1);
    const conflicting = clone(source); conflicting.chapterRewardReceipts[0].gold++;
    assert.throws(() => merge(cloud, conflicting), /冲突/);
    const invalid = clone(source); invalid.savedLevel = 4; assert.throws(() => merge({}, invalid), /进度/);
    const broken = device(); broken.storage.set('pdd.chapter.rewards.local.v1', '{}'); assert.throws(() => broken.ledger.claim(broken.runtime, 4), /版本/);
    // Actual Douyin transaction adapter persists both records and inventory together.
    const server = backend(); await server.setup({}, { trigger: 'test' });
    const owner = (await server.call('businessIdentity', {})).subjectId;
    const call = state => server.call('syncUserState', { action: 'save', expectedOwner: owner, gameState: state });
    const result = await call(source); assert.equal(result.ok, true); assert.equal(result.gameState.chapterRewardReceipts.length, 2);
    assert.equal((await call(source)).gameState.gold, 150);
    const next = device(); next.ledger.claim(next.runtime, 18);
    server.failNext('douyin_user_profile'); const before = server.store();
    assert.equal((await call(next.snapshot(19, 3000))).ok, false); assert.deepEqual(server.store(), before);
    const success = await call(next.snapshot(19, 3000)); assert.equal(success.ok, true);
    assert(success.gameState.customization.ownedAvatarIds.includes(1009));
    assert.equal((await server.call('updateUserProfileAssets', { action: 'profileChapterClaim', requestId: 'legacy_claim_123', expectedOwner: owner })).errorCode, 'CLIENT_UPDATE_REQUIRED');
    console.log('PASS local offline grants, interrupted writes, consumption/restart, receipt restore, duplicate devices, late responses, stale saves, conflicts, native transaction rollback and avatar sync');
})().catch(error => { console.error(error); process.exitCode = 1; });
