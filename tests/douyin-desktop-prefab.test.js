const fs=require('fs'),path=require('path'),assert=require('assert');
const read=p=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',p),'utf8'));
const panel=read('assets/GameAssetsBundle/UI/Prefabs/Panels/DouyinDesktopGuidePanel.prefab');
const n=name=>panel.find(x=>x.__type__==='cc.Node'&&x._name===name);
const comp=(node,type)=>node._components.map(r=>panel[r.__id__]).find(c=>c.__type__===type);
for(const name of ['Box','CollContent','XBtn','EnterBtn'])assert.ok(n(name));
for(const name of ['DesktopStatusLabel','IntroLabel','PreviewHint'])assert.ok(!n(name));
for(const [name,text] of [['PopupTitleLabel','添加桌面'],['EnterLabel','添加桌面'],['RewardLabel','随机道具 ×1'],['Step3Title','3. 返回游戏，点击领取奖励']])assert.strictEqual(comp(n(name),'cc.Label')._string,text);
for(const [node,file]of [['DesktopMenuDemo','desktop_step_menu'],['DesktopAddDemo','desktop_step_add']]){
 const m=read(`assets/GameAssetsBundle/Textures/UI/${file}.png.meta`),d=m.subMetas.f9941.userData;
 assert.strictEqual(comp(n(node),'cc.Sprite')._spriteFrame.__uuid__,m.uuid+'@f9941');
 const size=comp(n(node),'cc.UITransform')._contentSize;
 assert.ok(Math.abs(size.width/size.height-d.width/d.height)<0.001);
}
assert.strictEqual(n('RewardCard')._active,false);
const entry=read('assets/HomeAssetsBundle/UI/Prefabs/Buttons/DouyinDesktopTaskButton.prefab');
const sidebar=read('assets/HomeAssetsBundle/UI/Prefabs/Buttons/DouyinSidebarTaskButton.prefab');
assert.strictEqual(entry[1]._lpos.y,sidebar[1]._lpos.y);
assert.ok(entry[1]._lpos.x>sidebar[1]._lpos.x+90,'desktop entry should sit to the right without overlapping');
const name=entry.find(x=>x._name==='DesktopTaskLbl');
assert.strictEqual(name._components.map(r=>entry[r.__id__]).find(c=>c.__type__==='cc.Label')._string,'添加桌面');
for(const p of [panel,entry]){
 function verify(o){if(!o||typeof o!=='object')return;if('__id__'in o)assert.ok(p[o.__id__]);else Object.values(o).forEach(verify);}
 p.forEach(verify);
 const ids=p.filter(x=>x.fileId).map(x=>x.fileId);assert.strictEqual(new Set(ids).size,ids.length);
}
console.log('douyin-desktop-prefab.test.js passed');
