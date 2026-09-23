const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');
const { claimChapterRewards } = require('../cloudfunctions/updateUserProfileAssets/chapter-rewards');
const { transition } = require('../cloudfunctions/updateUserProfileAssets/profile-customization');
const catalog = require('../cloudfunctions/updateUserProfileAssets/profile-catalog.json');
const moduleBox = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/ChapterRewardPolicy.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {module:moduleBox,exports:moduleBox.exports});
const policy=moduleBox.exports;
for(let cleared=0;cleared<=160;cleared++){
    const cloud=claimChapterRewards({savedLevel:cleared+1},catalog,1);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(policy.eligibleChapterRewards(cleared,[]))),cloud.granted);
    const repeated=claimChapterRewards({savedLevel:cleared+1,...cloud.patch},catalog,2);
    assert.equal(repeated.granted.length,0);
    assert.deepStrictEqual(repeated.patch,{});
}
assert.equal(claimChapterRewards({savedLevel:4},catalog,1).granted.length,0);
let first=transition({savedLevel:5,gold:8,brushCount:2},{action:'profileChapterClaim'},null,1);
assert.equal(first.patch.gold,58);assert.equal(first.patch.brushCount,2);
assert.equal(first.patch.wechatGiftTotals.gold,50);
assert.equal(first.state.equippedAvatarId,1001);
const ninth=transition({savedLevel:10,chapterRewardClaims:['v1:1:4']},{action:'profileChapterClaim'},null,1);
assert(ninth.patch.ownedBeanSkinIds.includes(2001));assert.equal(ninth.state.equippedAvatarId,1001);
assert.equal(ninth.chapterRewards.granted[0].beanSkinId,2001);
const late=claimChapterRewards({savedLevel:154,chapterRewardClaims:policy.eligibleChapterRewards(152,[]).map(r=>r.key)},catalog,1);
assert.deepStrictEqual(late.granted.map(r=>[r.gold,r.brushCount,r.magnetCount,r.avatarId]),[[100,1,1,0]]);
for(const [chapter,field,id] of [[1,'beanSkinId',2001],[2,'avatarId',1009],[3,'frameId',2006],[4,'backgroundSkinId',1002],[5,'beanSkinId',2002],[16,'backgroundSkinId',1006]]) assert.equal(policy.chapterReward(chapter,9)[field],id);
const prefab=JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel.prefab'));
for(const object of prefab)JSON.stringify(object,(key,value)=>{if(key==='__id__')assert(value>=0&&value<prefab.length);return value;});
const node=name=>prefab.find(n=>n.__type__==='cc.Node'&&n._name===name);
assert(node('ChapterRewards'));assert(node('ChapterRewardMount'));assert(!node('ChapterRewardOverlay'));
assert.equal(node('ChapterRewardMount')._children.length,0);
const rewardPrefab=JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/ChapterRewardPanel.prefab'));
assert.equal(rewardPrefab[rewardPrefab[0].data.__id__]._name,'ChapterRewardPanel');
for(const object of rewardPrefab)JSON.stringify(object,(key,value)=>{if(key==='__id__')assert(value>=0&&value<rewardPrefab.length);return value;});
for(const milestone of [4,9]) {
    const gift=node('Milestone'+milestone);
    assert(gift._children.some(ref=>prefab[ref.__id__]._name==='Preview'));
    const label=node('Reward'+milestone+'Label')._components.map(ref=>prefab[ref.__id__]).find(c=>c.__type__==='cc.Label');
    assert.equal(label._string,'完成'+milestone+'关');
}
assert(node('ShareBonusBtn')._lpos.y<node('ChapterRewards')._lpos.y);
assert.equal(node('ShareBonusBtn')._lpos.y,node('PrimaryBtn')._lpos.y);
assert(node('Milestone4'));assert(node('Milestone9'));
console.log('chapter-rewards.test.js passed: 101 progress states, repeat claims, rewards, ownership, stale rules and prefab references');
