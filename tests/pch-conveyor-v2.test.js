const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const scene = JSON.parse(fs.readFileSync(path.join(root, 'assets/BootstrapBundle/Scenes/Game.scene')));
const original=scene.find(n=>n._name==='NormalLayout'), v2=scene.find(n=>n._name==='NormalLayoutV2');
assert.equal(original,undefined,'legacy layout must be removed');assert.ok(v2);
assert.equal(v2._active,true);
const child=(n,name)=>scene[n._children.find(r=>scene[r.__id__]._name===name).__id__];
const comp=(n,type)=>scene[n._components.find(r=>scene[r.__id__].__type__===type).__id__];
const seen=new Set();
function check(n){assert.ok(!seen.has(n._id));seen.add(n._id);for(const r of n._components||[])assert.equal(scene[r.__id__].node.__id__,scene.indexOf(n));for(const r of n._children||[]){assert.equal(scene[r.__id__]._parent.__id__,scene.indexOf(n));check(scene[r.__id__]);}}
check(v2);
assert.equal(child(v2,'PchMovingTrack')._active,false);
assert.equal(child(v2,'PchMovingTrack')._children.length,0,'guide bounds retain no legacy artwork');
const skin=child(v2,'TrackSkinV2');
const skinSize=comp(skin,'cc.UITransform')._contentSize;
const artDir=path.join(root,'assets/BootstrapBundle/GameUI/Atlases/Conveyor');
for(const name of ['track','expand','arrow','capacity-gradient']){
 const meta=JSON.parse(fs.readFileSync(path.join(artDir,name+'.png.meta')));
 const png=PNG.sync.read(fs.readFileSync(path.join(artDir,name+'.png')));
 assert.equal(png.width,meta.subMetas.f9941.userData.width);assert.equal(png.height,meta.subMetas.f9941.userData.height);
}
const badge=child(v2,'PchCapacityBadge'),bar=child(badge,'PchCapacityTrack');
assert.equal(child(badge,'CapacityCount')._lpos.x,0,'capacity number stays at full slot centre');
assert.ok(!bar._children.some(r=>scene[r.__id__]._name==='TrackSprite'));
assert.ok(comp(bar,'cc.UITransform')._contentSize.width>400);
const btn=child(v2,'PchCapacityAdButton');assert.ok(btn._lpos.x>150);assert.ok(comp(btn,'cc.Button'));
const fill=child(bar,'FillSprite'), authoredFill=comp(fill,'cc.Sprite');
assert.equal(authoredFill._type,3);assert.equal(authoredFill._fillType,0);assert.equal(authoredFill._fillStart,0);
assert.equal(fill._lscale.x,1);assert.equal(fill._lscale.y,1);
assert.deepEqual(comp(fill,'cc.UITransform')._contentSize,{__type__:'cc.Size',width:436,height:78});
const order=v2._children.map(r=>scene[r.__id__]._name);
assert.ok(order.indexOf('PchCapacityBadge')<order.indexOf('TrackSkinV2'),'original rim overlays fill');
assert.ok(order.indexOf('TrackSkinV2')<order.indexOf('CarrierLayer'),'beans remain above rim');
assert.ok(!bar._components.some(r=>['cc.Mask','cc.Graphics'].includes(scene[r.__id__].__type__)));
const geoSource=fs.readFileSync(path.join(root,'assets/Scripts/Core/PchConveyorGeometry.ts'),'utf8');
const mod={exports:{}};new Function('exports','module',ts.transpileModule(geoSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports,mod);
const geom=mod.exports, belt=geom.createRoundedConveyorPath(2,.6);
const png=PNG.sync.read(fs.readFileSync(path.join(artDir,'track.png')));
assert.equal(png.data[(Math.floor(png.height/2)*png.width+Math.floor(png.width/2))*4+3],0,'new track centre must reveal scene background');
const gradient=PNG.sync.read(fs.readFileSync(path.join(artDir,'capacity-gradient.png')));
const oldFill=PNG.sync.read(fs.readFileSync(path.join(root,'assets/PreviewBundle/ArtCandidates/ConveyorLegacy/pch_capacity_fill_sliced.png')));
assert.equal(gradient.width,oldFill.width);assert.equal(gradient.height,oldFill.height);
for(let i=3;i<gradient.data.length;i+=4)assert.equal(gradient.data[i],oldFill.data[i],'fill alpha/rounded shape must remain unchanged');
const rgb=x=>Array.from(gradient.data.subarray((36*gradient.width+x)*4,(36*gradient.width+x)*4+3));
assert.deepEqual(rgb(0),[155,232,123]);assert.deepEqual(rgb(gradient.width-1),[251,165,113]);
// Flood the actual transparent opening, not an assumed rounded rectangle.
// Every opening pixel must have opaque gradient behind it at full progress.
const centre=Math.floor(png.height/2)*png.width+Math.floor(png.width/2);
const visited=new Set([centre]),queue=[centre],fillSize=comp(fill,'cc.UITransform')._contentSize;
for(let head=0;head<queue.length;head++){
 const index=queue[head],x=index%png.width,y=Math.floor(index/png.width);
 assert.ok(x>0&&x<png.width-1&&y>0&&y<png.height-1,'opening must not connect to outer background');
 const worldX=skin._lpos.x+((x+.5)/png.width-.5)*skinSize.width;
 const worldY=skin._lpos.y+(.5-(y+.5)/png.height)*skinSize.height;
 const u=(worldX-badge._lpos.x-fill._lpos.x)/fillSize.width+.5;
 const v=.5-(worldY-badge._lpos.y-fill._lpos.y)/fillSize.height;
 assert.ok(u>=0&&u<1&&v>=0&&v<1,'fixed colour field covers opening bounds');
 const alpha=gradient.data[(Math.floor(v*gradient.height)*gradient.width+Math.floor(u*gradient.width))*4+3];
 assert.ok(alpha>=250,`uncovered opening pixel ${x},${y}: alpha ${alpha}`);
 for(const next of [index-1,index+1,index-png.width,index+png.width]){
  if(!visited.has(next)&&png.data[next*4+3]<8){visited.add(next);queue.push(next);}
 }
}
assert.ok(queue.length>20000,'validated the entire inner opening');
let bad=0; const p={x:0,y:0};
for(let i=0;i<1000;i++){
 geom.sampleRoundedConveyorPath(belt,i/1000,p);
 const x=Math.round((p.x-skin._lpos.x+skinSize.width/2)/skinSize.width*(png.width-1));
 const y=Math.round((skinSize.height/2-(p.y-skin._lpos.y))/skinSize.height*(png.height-1));
 const k=(y*png.width+x)*4;
 if(png.data[k]>165 || png.data[k+3]<220)bad++;
}
assert.equal(bad,0,'all sampled carrier centres must lie on the purple track, not its white borders');
const controller=fs.readFileSync(path.join(root,'assets/Scripts/Core/PchConveyorGameplayController.ts'),'utf8');
assert.ok(controller.includes("= 'NormalLayoutV2'"));assert.ok(controller.includes('direction.active = stack.length === 0'));
const parsed=ts.createSourceFile('controller.ts',controller,ts.ScriptTarget.Latest,true);
const render=parsed.statements.filter(ts.isClassDeclaration).flatMap(c=>c.members).find(m=>m.name?.getText(parsed)==='renderNormalCapacityTrack');
const renderCode=ts.transpileModule('class Harness {'+render.getText(parsed)+'}',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
class UITransform{} class Sprite{} class Graphics{} class Mask{static Type={GRAPHICS_STENCIL:2};}
const H=new Function('UITransform','Sprite','Mask','Graphics','PCH_CAPACITY_PROGRESS_INSET','PCH_CAPACITY_SLICED_RENDER_SCALE',renderCode+';return Harness;')(UITransform,Sprite,Mask,Graphics,3,.25);
function spriteNode(){const ui={contentSize:{},setContentSize(width,height){this.contentSize={width,height};}};const sprite={spriteFrame:{originalSize:{height:72}}};return {getComponent(t){return t===UITransform?ui:sprite;},setPosition(x,y){this.position={x,y};},setScale(x,y){this.scale={x,y};}};}
const trackNode=spriteNode(),fillNode=spriteNode();
const stencil={clear(){this.rect=null;},roundRect(...args){this.rect=args;},fill(){}};
let mask=null;
const capacity={isValid:true,parent:{parent:{name:'NormalLayoutV2'}},getComponent(t){return t===Mask?mask:t===Graphics?stencil:{contentSize:{width:412,height:62}};},addComponent(t){assert.equal(t,Mask);return mask={};},getChildByName(name){return name==='TrackSprite'?trackNode:fillNode;}};
for(const ratio of [0,.01,.25,.4,.5,.6,1,0,-1,2,NaN]){
 new H().renderNormalCapacityTrack(capacity,ratio);
 const expected=Math.min(1,Math.max(0,Number(ratio)||0));
 assert.equal(fillNode.active,expected>0);
 assert.equal(fillNode.getComponent(Sprite).fillRange,expected);
 assert.equal(mask,null,'V2 never creates a mask');
 assert.deepEqual(fillNode.getComponent(UITransform).contentSize,{},'runtime preserves authored size');
 assert.equal(fillNode.position,undefined,'runtime preserves authored position');
 assert.equal(fillNode.scale,undefined,'runtime preserves authored scale');
}
capacity.parent.parent.name='NormalLayout';
new H().renderNormalCapacityTrack(capacity,.25);
assert.equal(fillNode.getComponent(UITransform).contentSize.width*fillNode.scale.x,406*.25,'legacy layout retains its fill behaviour');
for(const asset of ['track','expand','arrow','capacity-gradient']){
 const resource='GameUI/Atlases/Conveyor/'+asset;
 assert.ok(fs.readFileSync(path.join(root,'assets/Scripts/Core/UiManifest.ts'),'utf8').includes(resource));
 assert.ok(fs.readFileSync(path.join(root,'scripts/patch-bootstrap-dynamic-assets.js'),'utf8').includes(resource));
}
console.log('pch-conveyor-v2: PASS (1000 path samples)');
