const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');

test('authored artwork arrows page once, retain mirrored scale and never create Button components', () => {
 const prefab=JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/ArtworkPreview.prefab'));
 class Button { static EventType={CLICK:'click'}; }
 class Label {}
 class Node {
  constructor(name){this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.events={};}
  getComponent(type){return this.components.get(type);}
  addComponent(type){const c=new type();this.components.set(type,c);return c;}
  addChild(n){n.parent=this;this.children.push(n);}
  removeFromParent(){this.parent.children=this.parent.children.filter(n=>n!==this);}
  destroy(){this.isValid=false;}
  targetOff(){this.events={};}
  on(event,fn){this.events[event]=fn;}
 }
 const arrow=name=>{
  const row=prefab.find(n=>n.__type__==='cc.Node'&&n._name===name);
  const raw=row._components.map(r=>prefab[r.__id__]).find(c=>c.__type__==='cc.Button');
  assert(raw);assert.equal(raw._transition,3);assert.equal(raw._zoomScale,0.95);
  assert.equal(prefab[raw._target.__id__],row);
  const node=new Node(name);node.scale={...row._lscale};node.components.set(Button,new Button());return node;
 };
 const left=arrow('ArrowLeft'),right=arrow('ArrowRight'),content=new Node('Content');
 const loads=[],sounds=[];let options;
 const exports={};
 const code=ts.transpileModule(fs.readFileSync('assets/Scripts/Core/HomeArtworkPreview.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function('exports','require',code)(exports,id=>{
  if(id==='cc')return {Button,Node,Label,Color:class{}};
  if(id.endsWith('CollectionShellOverlay'))return {openCollectionShellOverlay:(_runtime,value)=>options=value};
  if(id.endsWith('LevelRouteService'))return {getPhysicalMainLevelId:id=>id};
  if(id.endsWith('AudioMgr'))return {AudioMgr:{inst:{play:s=>sounds.push(s)}}};
  return {releaseCompletedPatternPreviewTree(){}};
 });
 const runtime={loadLevelData:id=>loads.push(id),bindPanelButton(){throw Error('must use authored buttons');}};
 exports.openHomeArtworkPreview(runtime,[1,2,3],2);
 options.onReady({overlay:new Node('Preview'),content,leftArrow:left,rightArrow:right});
 assert(left.active&&right.active);
 right.events.click();assert.equal(right.active,false);right.events.click();
 left.events.click();left.events.click();assert.equal(left.active,false);left.events.click();
 assert.deepEqual(loads,[2,3,2,1]);assert.equal(sounds.length,3);
 assert.equal(right.scale.x,-1);assert.equal(left.scale.x,1);
});
