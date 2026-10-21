'use strict';
const fields = ['gold', 'brushCount', 'magnetCount'];
const payloadFields = ['key', 'chapter', 'milestone', ...fields, 'avatarId', 'frameId', 'beanSkinId', 'backgroundSkinId'];
function receipts(value) {
    if (!Array.isArray(value)) throw Error('章节奖励记录格式错误');
    const seen = new Set();
    for (const row of value) {
        if (!row || Object.keys(row).some(key => !payloadFields.includes(key)) ||
            !Number.isSafeInteger(row.chapter) || row.chapter < 1 || row.chapter > 111112 ||
            ![4, 9].includes(row.milestone) || row.key !== `v1:${row.chapter}:${row.milestone}` || seen.has(row.key)) throw Error('章节奖励记录编号错误');
        for (const key of payloadFields.filter(key => key !== 'key')) if (!Number.isSafeInteger(row[key]) || row[key] < 0) throw Error('章节奖励记录数值错误');
        seen.add(row.key);
    }
    return value;
}
function prepare(source, current, profileRules) {
    if (source.chapterRewardProtocol !== 1) {
        if (current.chapterRewardProtocol === 1) throw Error('请使用支持本地章节奖励的客户端');
        return { current, patch: {} };
    }
    const incoming = receipts(source.chapterRewardReceipts);
    if (!Number.isSafeInteger(source.savedLevel) || source.savedLevel < 1) throw Error('章节奖励同步缺少通关进度');
    const stored = receipts(current.chapterRewardReceipts || []);
    const known = new Map(stored.map(row => [row.key, row]));
    const additions = [];
    const localTotals = { gold: 0, brushCount: 0, magnetCount: 0 };
    for (const row of incoming) {
        const previous = known.get(row.key);
        if (previous && payloadFields.some(key => previous[key] !== row[key])) throw Error('章节奖励记录冲突');
        if (!previous) {
            if ((row.chapter - 1) * 9 + row.milestone >= source.savedLevel) throw Error('章节奖励记录超出已通关进度');
            if ((current.chapterRewardClaims || []).includes(row.key)) throw Error('检测到旧版章节领取记录，请清理测试存档或迁移后再同步');
            additions.push(row);
        }
        for (const field of fields) localTotals[field] += row[field];
    }
    for (const field of fields) if (!Number.isSafeInteger(localTotals[field]) || localTotals[field] > (source.wechatGiftTotals?.[field] || 0)) throw Error('章节奖励累计数值不匹配');
    const patch = { chapterRewardProtocol: 1, chapterRewardReceipts: [...stored, ...additions],
        chapterRewardClaims: [...new Set([...(current.chapterRewardClaims || []), ...incoming.map(row => row.key)])],
        wechatGiftProtocol: 1, wechatGiftTotals: { ...(current.wechatGiftTotals || {}) } };
    for (const field of fields) {
        const delta = additions.reduce((total, row) => total + row[field], 0);
        patch[field] = (current[field] || 0) + delta;
        patch.wechatGiftTotals[field] = (patch.wechatGiftTotals[field] || 0) + delta;
        if (!Number.isSafeInteger(patch[field]) || !Number.isSafeInteger(patch.wechatGiftTotals[field])) throw Error('章节奖励数值溢出');
    }
    for (const [field, id] of [['ownedBeanSkinIds', 'beanSkinId'], ['ownedBackgroundSkinIds', 'backgroundSkinId']]) {
        patch[field] = [...new Set([...(current[field] || []), ...incoming.map(row => row[id]).filter(Boolean)])];
    }
    const customization = profileRules.normalize(current);
    let changed = false;
    for (const row of incoming) for (const [field, id] of [['ownedAvatarIds', row.avatarId], ['ownedFrameIds', row.frameId]]) {
        if (id && !customization[field].includes(id)) { customization[field].push(id); changed = true; }
    }
    if (changed) customization.revision++;
    patch.customization = customization;
    // Keep the general timestamp: these are additive receipts, not newer gameplay snapshots.
    return { current: { ...current, ...patch }, patch };
}
function expose(doc, state) {
    if (!state) return state;
    return { ...state, chapterRewardProtocol: 1, chapterRewardReceipts: doc?.chapterRewardReceipts || [] };
}
module.exports = { prepare, expose, receipts };
