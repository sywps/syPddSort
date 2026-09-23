// Generated from assets/Scripts/Core/ChapterRewardPolicy.ts
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAPTER_BACKGROUND_IDS = exports.CHAPTER_BEAN_IDS = exports.CHAPTER_FRAME_IDS = exports.CHAPTER_AVATAR_IDS = void 0;
exports.chapterReward = chapterReward;
exports.eligibleChapterRewards = eligibleChapterRewards;
exports.CHAPTER_AVATAR_IDS = [1009, 1010, 1011, 1012];
exports.CHAPTER_FRAME_IDS = [2006, 2007, 2008, 2009];
exports.CHAPTER_BEAN_IDS = [2001, 2002, 2003, 2004];
exports.CHAPTER_BACKGROUND_IDS = [1002, 1003, 1004, 1006];
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
