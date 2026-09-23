'use strict';
// First four chapters use existing avatars; later chapter ends grant two tools and gold.
const AVATARS = [1009, 1010, 1011, 1012];
const { eligibleChapterRewards } = require('./chapter-reward-policy');
function claimChapterRewards(doc, rows, now) {
    const savedLevel = Number(doc.savedLevel || 1);
    if (!Number.isSafeInteger(savedLevel) || savedLevel < 1 || savedLevel > 1000000) throw Error('章节通关进度错误');
    const cleared = savedLevel - 1;
    const claimed = new Set(doc.chapterRewardClaims || []);
    const granted = eligibleChapterRewards(cleared, [...claimed]);
    let gold = 0, brushCount = 0, magnetCount = 0;
    for (const reward of granted) {
        claimed.add(reward.key);
        gold += reward.gold; brushCount += reward.brushCount; magnetCount += reward.magnetCount;
    }
    if (!granted.length) return { patch: {}, granted, claimed: [...claimed] };
    // Reuse the existing cumulative grant watermark so stale saves cannot erase rewards.
    const totals = { ...(doc.wechatGiftTotals || {}) };
    totals.gold = (totals.gold || 0) + gold;
    totals.brushCount = (totals.brushCount || 0) + brushCount;
    totals.magnetCount = (totals.magnetCount || 0) + magnetCount;
    return { granted, claimed: [...claimed], patch: {
        ownedBeanSkinIds: [...new Set([...(doc.ownedBeanSkinIds || [2000]), ...granted.map(r => r.beanSkinId).filter(Boolean)])],
        ownedBackgroundSkinIds: [...new Set([...(doc.ownedBackgroundSkinIds || [1005]), ...granted.map(r => r.backgroundSkinId).filter(Boolean)])],
        chapterRewardClaims: [...claimed], gold: (doc.gold || 0) + gold,
        brushCount: (doc.brushCount || 0) + brushCount,
        magnetCount: (doc.magnetCount || 0) + magnetCount,
        // Cumulative gifts are rebased by syncUserState onto queued client balances.
        // Advancing stateUpdatedAt here would reject those balances before rebasing,
        // including avatar-only claims whose gift totals have not changed.
        wechatGiftProtocol: 1, wechatGiftTotals: totals,
    } };
}
module.exports = { AVATARS, claimChapterRewards };
