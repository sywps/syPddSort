const assert=require('assert'),fs=require('fs');const {transition}=require('../cloudfunctions/updateUserProfileAssets/profile-customization');const policy=require('../cloudfunctions/updateUserProfileAssets/chapter-reward-policy');const beans=require('../assets/GameAssetsBundle/BeanSkins/bean-skins.json').skins;const backgrounds=require('../assets/GameAssetsBundle/Skins/skins.json').skins;const profiles=require('../cloudfunctions/updateUserProfileAssets/profile-catalog.json');
for(let chapter=1;chapter<=16;chapter++){
 const level=chapter*9,reward=policy.chapterReward(chapter,9),prior=policy.eligibleChapterRewards(level-1,[]).map(r=>r.key);
 const doc={savedLevel:level+1,chapterRewardClaims:prior,ownedBeanSkinIds:[2000,2004],ownedBackgroundSkinIds:[1005,1021],equippedBeanSkinId:2000,equippedBackgroundSkinId:1005};
 const r=transition(doc,{action:'profileChapterClaim'},null,123);
 assert.equal(r.chapterRewards.granted.length,1);
 assert(r.patch.ownedBeanSkinIds.includes(2004));assert(r.patch.ownedBackgroundSkinIds.includes(1021));
 assert.equal(r.patch.equippedBeanSkinId,undefined);assert.equal(r.patch.equippedBackgroundSkinId,undefined);
 if(reward.beanSkinId){assert(r.patch.ownedBeanSkinIds.includes(reward.beanSkinId));const row=beans.find(x=>x.id===reward.beanSkinId);assert.equal(row.unlockType,'chapter');assert.equal(row.unlockValue,level);assert(fs.existsSync('assets/GameAssetsBundle/'+row.iconKey+'.png'));}
 if(reward.backgroundSkinId){assert(r.patch.ownedBackgroundSkinIds.includes(reward.backgroundSkinId));const row=backgrounds.find(x=>x.id===reward.backgroundSkinId);assert.equal(row.unlockType,'chapter');assert.equal(row.unlockValue,level);assert(fs.existsSync('assets/GameAssetsBundle/'+row.iconKey+'.png'));}
 if(reward.avatarId||reward.frameId){const id=reward.avatarId||reward.frameId,row=profiles.find(x=>x.id===id);assert.equal(row.value,level);assert((reward.avatarId?r.state.ownedAvatarIds:r.state.ownedFrameIds).includes(id));}
 assert.equal(policy.chapterReward(chapter,4).gold,50);assert.equal(policy.chapterReward(chapter,4).brushCount,0);
}
console.log('16 chapter decoration grants, source rules, icons, ownership preservation and no auto-equip verified');
