const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');

test('profile shade closes through the normal cleanup and panel content blocks click-through', async () => {
  class Node {
    constructor(name) { this.name=name; this.children=[]; this.components=new Map(); this.events={}; this.isValid=true; this.active=true; this.position={}; }
    getChildByName(name) { return this.children.find(n=>n.name===name); }
    getComponent(type) { return this.components.get(type); }
    addComponent(type) { const c=new type(); c.node=this; this.components.set(type,c); return c; }
    addChild(node) { this.children.push(node); }
    on(event,fn) { this.events[event]=fn; }
  }
  Node.EventType={TOUCH_END:'touch-end'};
  class Button {} Button.EventType={CLICK:'click'};
  class BlockInputEvents {} class ProfilePanelView {} class Mask {} class ScrollView {}
  class Vec3 { set() {} }
  const prefab=JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/ProfilePanel.prefab'));
  const read=id=>{ const raw=prefab[id],node=new Node(raw._name); node.children=raw._children.map(r=>read(r.__id__)); return node; };
  const overlay=read(prefab[0].data.__id__),box=overlay.getChildByName('Box'),shade=overlay.getChildByName('Shade');
  box.addComponent(ProfilePanelView);
  box.getChildByName('Viewport').addComponent(Mask); box.getChildByName('Viewport').addComponent(ScrollView);
  let releases=0,unsubscribes=0,focusEnds=0;
  const sounds=[];
  const runtime={node:{isValid:true},_retainPanelTextureOwner(){},requireCanvasUiRoot:()=>new Node('PopupRoot'),beginModalFocus:()=> 'profile',
    endModalFocus(){focusEnds++;},_closePanelWithTextureOwner(){releases++;},showToast(message){throw Error(message);} };
  const source=fs.readFileSync('assets/Scripts/Core/Panels/ProfilePanelController.ts','utf8')+'\nexport { ProfilePanelController };';
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>{
    if(name==='../AudioMgr')return {AudioMgr:{inst:{play:name=>sounds.push(name)}}};
    if(name==='cc')return {Node,Button,BlockInputEvents,Mask,ScrollView,Vec3,instantiate:()=>overlay};
    if(name==='./ProfilePanelView')return {ProfilePanelView};
    if(name==='../ProfileCustomizationMgr')return {ProfileCustomizationMgr:{inst:{subscribe:()=>()=>unsubscribes++,refreshProgressUnlocks(){}}}};
    if(name==='../MiniGamePlatform')return {isMiniGameRuntime:()=>false};
    return {};
  },module,module.exports);
  const controller=new module.exports.ProfilePanelController(runtime);
  controller.prefab=async()=>({}); controller.status=()=>{}; controller.tab=()=>{};
  await controller.open();
  await controller.open();
  assert.deepEqual(sounds,['button'], 'opening an already open panel stays silent');
  box.getChildByName('AvatarTab').events.click();
  assert.equal(sounds.length,1, 'selected tab stays silent');
  controller.busy=true;
  box.getChildByName('FrameTab').events.click();
  box.getChildByName('Action').events.click();
  assert.equal(sounds.length,1, 'busy interactions stay silent');
  controller.busy=false;
  box.getChildByName('FrameTab').events.click();
  assert.equal(sounds.length,2, 'accepted tab switch sounds once');
  assert(box.getComponent(BlockInputEvents), 'blank panel areas must intercept touches before the shade');
  assert(shade.getComponent(BlockInputEvents), 'shade must not pass the closing tap into the home screen');
  assert.equal(box.events['touch-end'],undefined, 'content does not bind a dismiss handler');
  shade.events['touch-end']();
  shade.events['touch-end']();
  assert.deepEqual(sounds,['button','button','button'], 'dismiss sounds only once');
  assert.equal(overlay.active,false); assert.equal(controller.overlay,null);
  assert.equal(releases,1); assert.equal(focusEnds,1); assert.equal(unsubscribes,1);
});
test('prefab grid settings drive editor and runtime layout without modifying player data', () => {
  class UITransform {}
  const property = (...args) => args.length > 1 ? undefined : () => {};
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('assets/Scripts/Core/Panels/ProfilePanelView.ts', 'utf8'), { compilerOptions: { experimentalDecorators: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'cc/env') return { EDITOR: false };
    assert.equal(name, 'cc');
    return { _decorator: { ccclass: () => x => x, property, executeInEditMode: x => x }, Component: class {}, UITransform };
  }, module, module.exports);
  const node = (w, h) => ({ children: [], ui: { contentSize: { width: w, height: h }, setContentSize(width, height) { this.contentSize = { width, height }; } }, getComponent() { return this.ui; }, getChildByName(n) { return this.children.find(x => x.name === n); }, setPosition(x,y) { this.position = { x,y }; } });
  const viewport = node(510,510), content = node(510,510), template = node(155,155);
  viewport.name = 'Viewport'; content.name = 'Content'; template.name = 'ItemTemplate'; viewport.children.push(content); content.children.push(template);
  const view = new module.exports.ProfilePanelView(); view.node = node(580,1000); view.node.children.push(viewport);
  const cells = Array.from({ length: 9 }, () => node(155,155));
  view.layout(cells); assert.equal(content.ui.contentSize.height,543); assert.equal(cells[0].position.x,-170);
  view.columns=2; view.gapX=30; view.gapY=10; view.paddingTop=20; view.paddingBottom=30;
  view.layout(cells);
  assert.equal(content.ui.contentSize.height,865); assert.equal(cells[0].position.x,-92.5); assert.equal(cells[1].position.x,92.5);
  assert.equal(cells[0].position.y-cells[2].position.y,165);
});
test('prefab preview states and script identity are serialized, portrait geometry matches runtime', () => {
  const a=JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/ProfilePanel.prefab'));
  const find=n=>a.find(x=>x.__type__==='cc.Node'&&x._name===n);
  const comp=(n,t)=>n._components.map(r=>a[r.__id__]).find(x=>x.__type__===t);
  assert.equal(a.filter(x=>x.__type__==='cc.Node'&&x._name.startsWith('PreviewItem')).length,9);
  const view=find('Box')._components.map(r=>a[r.__id__]).find(x=>x.columns===3);
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let decoded=view.__type__.slice(0,5);
  for(let i=5;i<view.__type__.length;i+=2)decoded+=(alphabet.indexOf(view.__type__[i])*64+alphabet.indexOf(view.__type__[i+1])).toString(16).padStart(3,'0');
  assert.equal(decoded,JSON.parse(fs.readFileSync('assets/Scripts/Core/Panels/ProfilePanelView.ts.meta')).uuid.replace(/-/g,''));
  const frame=comp(find('Frame'),'cc.UITransform')._contentSize, avatar=comp(find('Avatar'),'cc.UITransform')._contentSize;
  assert.equal(frame.width,frame.height); assert.equal(avatar.width,frame.width*158/256);
  assert(comp(find('FloatingStatus'),'cc.UIOpacity')); assert(find('GoldCaption')); assert(!find('FloatingStatus')._active);
});
