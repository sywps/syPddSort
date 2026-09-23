'use strict';
const crypto = require('crypto');
const catalog = require('./profile-catalog.json');
const retired = require('./profile-retired.json');
const { claimChapterRewards } = require('./chapter-rewards');
const int = x => Number.isFinite(Number(x)) ? Math.max(0, Math.floor(Number(x))) : 0;
const clone = x => JSON.parse(JSON.stringify(x));
const item = id => { const r = catalog.find(x => x.id === Number(id)); if (!r) throw Error(retired.some(x => x.id === Number(id)) ? '该装扮已停用' : '无效装扮'); return r; };
function normalize(doc, catalogRows = catalog) {
    const s = doc.customization || {};
    const owned = new Set([1001, 2001, ...(s.ownedAvatarIds || []), ...(s.ownedFrameIds || [])]);
    const cleared = Math.max(0, int(doc.savedLevel) - 1);
    for (const r of catalogRows) if ((r.unlock === 'mainline' && cleared >= r.value)
        || (r.unlock === 'ad' && int(s.adWatchCounts?.[r.id]) >= r.value)) owned.add(r.id);
    return { version: 1, revision: int(s.revision),
        ownedAvatarIds: [...catalog, ...retired].filter(x => x.kind === 'avatar' && owned.has(x.id)).map(x => x.id),
        ownedFrameIds: [...catalog, ...retired].filter(x => x.kind === 'frame' && owned.has(x.id)).map(x => x.id),
        equippedAvatarId: catalog.some(r => r.id === s.equippedAvatarId && r.kind === 'avatar') && owned.has(s.equippedAvatarId) ? s.equippedAvatarId : 1001,
        equippedFrameId: catalog.some(r => r.id === s.equippedFrameId && r.kind === 'frame') && owned.has(s.equippedFrameId) ? s.equippedFrameId : 2001,
        avatarSource: s.avatarSource === 'catalog' ? 'catalog' : (doc.avatarUrl ? 'wechat' : 'catalog'),
        customNickname: typeof s.customNickname === 'string' ? s.customNickname.slice(0, 24) : '',
        adWatchCounts: { ...(s.adWatchCounts || {}) }, seenItemIds: [...new Set(s.seenItemIds || [])].filter(x => owned.has(x)) };
}
function inventory(doc) {
    const result = {};
    for (const key of ['gold', 'vigor', 'vigorTime', 'expandSlotCount', 'magicWandCount', 'freezeCount', 'brushCount', 'magnetCount', 'pvpEconomyRevision', 'stateUpdatedAt']) result[key] = int(doc[key]);
    result.wechatGiftProtocol = 1;
    result.wechatGiftTotals = doc.wechatGiftTotals || {};
    result.ownedBeanSkinIds = doc.ownedBeanSkinIds || [2000];
    result.ownedBackgroundSkinIds = doc.ownedBackgroundSkinIds || [1005];
    return result;
}
// Pure transition used by the transactional adapter and behavioral tests.
function transition(doc, event, previous, now) {
    const rows = catalog;
    const state = normalize(doc, rows), action = event.action;
    const signature = JSON.stringify([action, Number(event.itemId || 0), event.avatarSource ?? null, event.customNickname ?? null]);
    if (previous && action !== 'profileGet' && action !== 'profileAdClaim') {
        if (previous.action !== action || previous.itemId !== Number(event.itemId || 0) || previous.signature !== signature) throw Error('请求编号冲突');
        return { state, patch: {}, record: null, replay: true };
    }
    const patch = {}, record = { action, itemId: Number(event.itemId || 0), signature, createdAt: now };
    if (action === 'profileChapterClaim') {
        const result = claimChapterRewards(doc, rows, now);
        for (const reward of result.granted) {
            if (reward.avatarId && !state.ownedAvatarIds.includes(reward.avatarId)) state.ownedAvatarIds.push(reward.avatarId);
            if (reward.frameId && !state.ownedFrameIds.includes(reward.frameId)) state.ownedFrameIds.push(reward.frameId);
        }
        return { state, patch: { ...result.patch, customization: state }, record: null,
            chapterRewards: { version: 2, granted: result.granted, claimed: result.claimed } };
    }
    if (action === 'profileGet') {
        const owned = new Set([...state.ownedAvatarIds, ...state.ownedFrameIds]);
        if (Array.isArray(event.seenItemIds)) state.seenItemIds = [...new Set([...state.seenItemIds, ...event.seenItemIds.filter(id => owned.has(id))])];
        return { state, patch: { customization: state }, record: null };
    }
    if (action === 'profileSelect') {
        if (int(event.revision) !== state.revision) throw Error('资料已更新，请刷新后重试');
        const ownedIds = new Set([...state.ownedAvatarIds, ...state.ownedFrameIds]);
        if (Array.isArray(event.seenItemIds)) state.seenItemIds = [...new Set([...state.seenItemIds, ...event.seenItemIds.filter(id => ownedIds.has(id))])];
        if (event.avatarSource !== undefined) {
            if (!['wechat', 'catalog'].includes(event.avatarSource) || (event.avatarSource === 'wechat' && !doc.avatarUrl)) throw Error('微信头像不可用');
            state.avatarSource = event.avatarSource;
        }
        if (event.itemId) {
            const r = item(event.itemId), owned = r.kind === 'avatar' ? state.ownedAvatarIds : state.ownedFrameIds;
            if (!owned.includes(r.id)) throw Error('装扮尚未解锁');
            if (r.kind === 'avatar') { state.equippedAvatarId = r.id; state.avatarSource = 'catalog'; }
            else state.equippedFrameId = r.id;
        }
        if (event.customNickname !== undefined) {
            throw Error('不支持修改昵称');
        }
    } else if (action === 'profileSeen') {
        const r = item(event.itemId);
        if (![...state.ownedAvatarIds, ...state.ownedFrameIds].includes(r.id)) throw Error('装扮尚未解锁');
        state.seenItemIds = [...new Set([...state.seenItemIds, r.id])];
    } else if (action === 'profileBuy') {
        const r = item(event.itemId), owned = r.kind === 'avatar' ? state.ownedAvatarIds : state.ownedFrameIds;
        if (r.unlock !== 'gold') throw Error('该装扮不能使用金币购买');
        if (!owned.includes(r.id)) {
            if (int(event.pvpEconomyRevision) !== int(doc.pvpEconomyRevision)) throw Error('资产已更新，请刷新后重试');
            if (int(doc.gold) < r.value) throw Error('金币数量不足');
            patch.gold = int(doc.gold) - r.value;
            patch.pvpEconomyRevision = int(doc.pvpEconomyRevision) + 1;
            patch.stateUpdatedAt = now;
            owned.push(r.id);
        }
    } else if (action === 'profileAdBegin') {
        const r = item(event.itemId);
        if (r.unlock !== 'ad' || [...state.ownedAvatarIds, ...state.ownedFrameIds].includes(r.id)) throw Error('该装扮不需要广告解锁');
        record.expiresAt = now + 24 * 60 * 60 * 1000;
        record.claimed = false;
        record.adTarget = r.value;
    } else if (action === 'profileAdClaim') {
        if (!previous || previous.action !== 'profileAdBegin' || previous.itemId !== Number(event.itemId)) throw Error('广告奖励请求不存在');
        if (previous.claimed) return { state, patch: {}, record: null, replay: true };
        if (previous.expiresAt < now) throw Error('广告奖励请求已过期');
        const r = item(event.itemId);
        if (r.unlock !== 'ad') throw Error('无效广告奖励');
        const target = Number.isSafeInteger(previous.adTarget) && previous.adTarget > 0 ? previous.adTarget : r.value;
        const count = int(state.adWatchCounts[r.id]) + 1;
        state.adWatchCounts[r.id] = count;
        const owned = r.kind === 'avatar' ? state.ownedAvatarIds : state.ownedFrameIds;
        if (count >= target && !owned.includes(r.id)) owned.push(r.id);
        // Database reads include immutable metadata (_id); persist business fields only.
        Object.assign(record, { action: previous.action, itemId: previous.itemId,
            signature: previous.signature, createdAt: previous.createdAt,
            expiresAt: previous.expiresAt, adTarget: target, claimed: true, claimedAt: now });
    } else throw Error('不支持的装扮操作');
    state.revision++;
    patch.customization = state;
    return { state, patch, record };
}
async function execute(db, openid, profileId, event) {
    if (!openid) throw Error('未登录');
    const key = String(event.requestId || '');
    if (event.action !== 'profileGet' && !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) throw Error('无效请求编号');
    const requestId = crypto.createHash('sha256').update(openid + ':' + key).digest('hex');
    return db.runTransaction(async tx => {
        const ref = tx.collection('user_profile').doc(profileId);
        const doc = (await ref.get()).data;
        if (!doc || doc.openid !== openid) throw Error('账号不匹配');
        const request = tx.collection('profile_customization_requests').doc(requestId);
        let previous = null;
        if (event.action !== 'profileGet') {
            try { previous = (await request.get()).data || null; }
            catch (e) { if (!/document.*(not exist|not found)|DATABASE_DOCUMENT_NOT_EXIST/i.test(String(e.errCode || '') + ' ' + String(e.message || e.errMsg || ''))) throw e; }
        }
        const result = transition(doc, event, previous, Date.now());
        if (result.record) await request.set({ data: { ...result.record, openid } });
        if (Object.keys(result.patch).length) await ref.update({ data: result.patch });
        return { ok: true, customizationSchemaVersion: 1, customization: result.state,
            ownerKey: crypto.createHash('sha256').update(openid).digest('hex'),
            inventory: inventory({ ...doc, ...result.patch }), chapterRewards: result.chapterRewards, replay: !!result.replay };
    });
}
module.exports = { normalize, transition, inventory, execute };
