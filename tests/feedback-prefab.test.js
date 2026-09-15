const assert=require('node:assert/strict');
const fs=require('fs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const panel=read('assets/GameAssetsBundle/UI/Prefabs/Panels/FeedbackPanel.prefab');
const home=read('assets/HomeAssetsBundle/Scenes/Home.scene');
const find=(a,name)=>a.find(n=>n.__type__==='cc.Node'&&n._name===name);
const component=(a,n,type)=>a[n._components.find(r=>a[r.__id__].__type__===type)?.__id__];
for(const a of [panel,home]){
    const walk=v=>{if(!v||typeof v!=='object')return;if(Number.isInteger(v.__id__))assert.ok(a[v.__id__],'dangling local reference');Object.values(v).forEach(walk);};
    a.forEach(walk);
    for(let i=0;i<a.length;i++)if(a[i].__type__==='cc.Node')for(const r of a[i]._children)assert.equal(a[r.__id__]._parent.__id__,i);
}
const input=find(panel,'Input');
const edit=component(panel,input,'cc.EditBox');assert.ok(edit);assert.equal(edit._inputMode,0);assert.equal(edit._maxLength,500);
for(const name of ['Placeholder','Text']){
    const anchor=component(panel,find(panel,name),'cc.UITransform')._anchorPoint;
    assert.equal(anchor.x,0,'EditBox positions text from top left');assert.equal(anchor.y,1);
}
assert.ok(find(panel,'InputBackground'),'input needs background independent of EditBox background clearing');
assert.match(component(panel,find(panel,'Placeholder'),'cc.Label')._string,/请在这里写下您的建议/);
assert.ok(component(panel,find(panel,'Submit'),'cc.Button'));
const entry=find(home,'FeedbackButton');assert.ok(entry?._active);
const widget=component(home,entry,'cc.Widget');assert.equal(widget._alignFlags,9,'feedback is anchored top left, away from game circle');
const sf=component(home,find(home,'FeedbackIcon'),'cc.Sprite')._spriteFrame.__uuid__;
assert.equal(sf,read('assets/HomeAssetsBundle/GameUI/Atlases/HomeEntry/feedback_icon.png.meta').uuid+'@f9941');
console.log('feedback-prefab.test.js passed');
