const assert=require('assert'),fs=require('fs'),vm=require('vm');
const {transition}=require('../cloudfunctions/updateUserProfileAssets/profile-customization');
const m={exports:{}};vm.runInNewContext(fs.readFileSync('cloudfunctions/syncUserState/index.js','utf8')+'\nmodule.exports.merge=buildGameStatePatch;', {module:m,exports:m.exports,console,Date,require:()=>({init(){},database:()=>({})})});
for(const avatarOnly of [false,true]) {
 const initial={gold:100,brushCount:0,magnetCount:0,freezeCount:0,stateUpdatedAt:1000,savedLevel:avatarOnly?19:5,chapterRewardClaims:avatarOnly?['v1:1:4','v1:1:9','v1:2:4']:[],wechatGiftProtocol:1,wechatGiftTotals:{},backgroundSkinResetVersion:1,ownedBackgroundSkinIds:[1005],ownedBeanSkinIds:[1001]};
 const queued={...initial,gold:120,stateUpdatedAt:1100};
 const gift=transition(initial,{action:'profileChapterClaim'},null,1200);
 const current={...initial,...gift.patch};
 const merged={...current,...m.exports.merge(queued,current)};
 console.log(avatarOnly?'avatar':'coins',merged.gold);
 assert.equal(merged.gold,avatarOnly?120:170);
 assert.equal(current.stateUpdatedAt,1000);
 assert.equal(merged.stateUpdatedAt,1100);
 const duplicate=transition(merged,{action:'profileChapterClaim'},null,1300);
 assert.equal(duplicate.chapterRewards.granted.length,0);
 const saveFirst={...initial,...m.exports.merge(queued,initial)};
 assert.equal(({...saveFirst,...transition(saveFirst,{action:'profileChapterClaim'},null,1200).patch}).gold,avatarOnly?120:170);
 const stale=m.exports.merge({...queued,gold:1,stateUpdatedAt:900},merged);
 assert.equal(stale.gold,merged.gold);
}
for (const chapter of [1, 4]) {
 const claims=[];
 for(let c=1;c<=chapter;c++){ claims.push(`v1:${c}:4`); if(c<chapter) claims.push(`v1:${c}:9`); }
 const initial={gold:100,brushCount:0,magnetCount:2,freezeCount:0,stateUpdatedAt:1000,savedLevel:chapter*9+1,chapterRewardClaims:claims,wechatGiftProtocol:1,wechatGiftTotals:{},pvpEconomyRevision:0,backgroundSkinResetVersion:1,ownedBackgroundSkinIds:[1005],ownedBeanSkinIds:[2000],themeUnlockedIds:[],themeCompletedIds:[]};
 const queued={...initial,gold:120,brushCount:1,magnetCount:1,stateUpdatedAt:1100};
 const gift=transition(initial,{action:'profileChapterClaim'},null,1200);
 const current={...initial,...gift.patch};
 const merged={...current,...m.exports.merge(queued,current)};
 assert.equal(merged.gold,120,`chapter ${chapter}: concurrent income retained`);
 assert.equal(merged.brushCount,1);
 assert.equal(merged.magnetCount,1,'consumed tools must not be restored');
 assert.equal(merged.stateUpdatedAt,1100);
 const skinField=chapter===1?'ownedBeanSkinIds':'ownedBackgroundSkinIds';
 const skinId=chapter===1?2001:1002;
 assert(merged[skinField].includes(skinId));
 // Saving before the grant must converge to the same inventory as granting first.
 const saveFirst={...initial,...m.exports.merge(queued,initial)};
 const grantLast={...saveFirst,...transition(saveFirst,{action:'profileChapterClaim'},null,1200).patch};
 for(const key of ['gold','brushCount','magnetCount']) assert.equal(merged[key],grantLast[key]);
 assert.equal(JSON.stringify([...merged[skinField]].sort()),JSON.stringify([...grantLast[skinField]].sort()));
 assert.equal(transition(merged,{action:'profileChapterClaim'},null,1300).chapterRewards.granted.length,0);
 for(const stale of [{stateUpdatedAt:900},{pvpEconomyRevision:1},{savedLevel:initial.savedLevel-1}]) {
  const rejected=m.exports.merge({...queued,...stale,gold:999,brushCount:9},current);
  assert.equal(rejected.gold,100);
  assert.equal(rejected.brushCount,0);
  assert(rejected[skinField].includes(skinId));
 }
}
console.log('Chapter grant/save ordering, skin ownership, duplicate claims and stale saves passed');
