// Generated from assets/Scripts/Core/ChapterRewardPolicy.ts
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAPTER_BACKGROUND_IDS = exports.CHAPTER_BEAN_IDS = exports.CHAPTER_FRAME_IDS = exports.CHAPTER_AVATAR_IDS = void 0;
exports.mergeChapterRewardDisplay = mergeChapterRewardDisplay;
exports.chapterReward = chapterReward;
exports.eligibleChapterRewards = eligibleChapterRewards;
exports.CHAPTER_AVATAR_IDS = [1009, 1010, 1011, 1012];
exports.CHAPTER_FRAME_IDS = [2006, 2007, 2008, 2009];
exports.CHAPTER_BEAN_IDS = [2004, 2002, 2003, 2001];
exports.CHAPTER_BACKGROUND_IDS = [1002, 1003, 1004, 1006];
// Presentation only: receipts and grant amounts remain owned by the claim flow.
function mergeChapterRewardDisplay(rewards) {
    if (!rewards.length)
        return [];
    const totals = { ...rewards[0], gold: 0, brushCount: 0, magnetCount: 0, avatarId: 0, frameId: 0, beanSkinId: 0, backgroundSkinId: 0 };
    const decorations = [];
    const seen = new Set();
    for (const reward of rewards) {
        totals.gold += reward.gold;
        totals.brushCount += reward.brushCount;
        totals.magnetCount += reward.magnetCount;
        for (const field of ['avatarId', 'frameId', 'beanSkinId', 'backgroundSkinId']) {
            const key = `${field}:${reward[field]}`;
            if (!reward[field] || seen.has(key))
                continue;
            seen.add(key);
            decorations.push({ ...totals, gold: 0, brushCount: 0, magnetCount: 0, [field]: reward[field] });
        }
    }
    return [totals, ...decorations];
}
function chapterReward(chapter, milestone) {
    if (!Number.isSafeInteger(chapter) || chapter < 1)
        throw Error('章节编号错误');
    const cycle = Math.floor((chapter - 1) / 4), kind = (chapter - 1) % 4;
    const decoration = milestone === 9 && cycle < 4;
    const late = milestone === 9 && !decoration;
    return { key: `v1:${chapter}:${milestone}`, chapter, milestone,
        gold: milestone === 4 ? 50 : late ? 100 : 0,
        brushCount: late ? 1 : 0, magnetCount: late ? 1 : 0,
        avatarId: decoration && kind === 1 ? exports.CHAPTER_AVATAR_IDS[cycle] : 0,
        frameId: decoration && kind === 2 ? exports.CHAPTER_FRAME_IDS[cycle] : 0,
        beanSkinId: decoration && kind === 0 ? exports.CHAPTER_BEAN_IDS[cycle] : 0,
        backgroundSkinId: decoration && kind === 3 ? exports.CHAPTER_BACKGROUND_IDS[cycle] : 0 };
}
function eligibleChapterRewards(cleared, claimed) {
    if (!Number.isSafeInteger(cleared) || cleared < 0)
        throw Error('章节通关进度错误');
    const known = new Set(claimed), result = [];
    for (let chapter = 1; chapter <= Math.ceil(cleared / 9); chapter++) {
        for (const milestone of [4, 9]) {
            const reward = chapterReward(chapter, milestone);
            if (cleared >= (chapter - 1) * 9 + milestone && !known.has(reward.key))
                result.push(reward);
        }
    }
    return result;
}
