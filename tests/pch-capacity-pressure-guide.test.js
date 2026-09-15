const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../assets/Scripts/Core/PchConveyorGameplayController.ts'),'utf8');
const ast=ts.createSourceFile('controller.ts',source,ts.ScriptTarget.Latest,true);
const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='PchConveyorGameplayController');
const names=['showOpeningFeatureGuide','maybeShowCapacityPressureGuide','updateCapacityHint','clearCapacityHint'];
const methods=names.map(name=>cls.members.find(n=>n.name?.getText(ast)===name).getText(ast)).join('\n');
const code=ts.transpileModule('export class Harness {'+methods+'}',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};
class Vec3 {constructor(x,y,z){Object.assign(this,{x,y,z});}}
class Graphics {roundRect(){} fill(){} moveTo(){} lineTo(){} close(){}}
class Sprite {}
const fakeTween=()=>({repeatForever(){return this;},to(){return this;},start(){return this;}});
const instantiate=()=>({setPosition(x,y,z){this.position={x,y,z};},setScale(x,y,z){this.scale={x,y,z};}});
new Function('module','exports','Vec3','UITransform','Graphics','Color','Sprite','instantiate','tween','OPENING_GUIDE_PROMPT_WIDTH','OPENING_GUIDE_PROMPT_HEIGHT',code)(mod,mod.exports,Vec3,class {},Graphics,class {},Object.assign(Sprite,{Type:{SLICED:1}}),instantiate,fakeTween,520,140);
function make(level=3,mode='main'){
 const h=new mod.exports.Harness();h.openingGuideRingNodes=[];h.openingGuideRingLoadVersion=0;
 h.rules={bufferCount:53,bufferCapacity:72,cells:[{locked:false,current:4}]};h.firstStoreEventSent=true;
 const sourceHand={getComponent:()=>({})};
 h.runtime={_activeGameplayEntryMode:mode,getActiveLogicalLevelId:()=>level,getGameplayFixedRoot:()=>({getComponent:()=>({contentSize:{width:720},convertToNodeSpaceAR:v=>v})}),requireCanvasUiRoot:()=>({getChildByName:()=>({getChildByName:()=>sourceHand})}),pauseTimerForProp:()=>{throw Error('soft hint must not pause');},showToast(){}};
 h.adButton={isValid:true,activeInHierarchy:true,getComponent:()=>({getBoundingBoxToWorld:()=>({center:{x:220},yMax:-400})})};h.shows=0;h.grants=0;h.inputLocked=false;h.labels=[];
 h.nodes=[];h.makeNode=(name,parent,width,height,x,y)=>{const node={name,parent,width,height,x,y,isValid:true,children:[],addComponent:()=>new Graphics(),addChild(child){this.children.push(child);},destroy(){this.isValid=false;}};h.nodes.push(node);return node;};
 h.makeLabel=(_,text)=>{h.labels.push(text);return {};};
 h.runtime.getSF=()=>({});h.runtime._applySpriteFrame=()=>{h.framed=true;};
 h.getOpeningGuidePromptCenterYAboveConveyor=()=>-250;
 h.applyOpeningGuidePromptLabelStyle=()=>{h.styled=(h.styled||0)+1;};
 h.showOpeningTargetGuide=()=>{h.shows++;h.inputLocked=true;h.openingGuide={name:'PchLevelThreeCapacityGuide',isValid:true,destroy(){this.isValid=false;}};};
 h.trackOpeningGuideEvent=()=>{};h.reportOpeningGuideTutorialFinish=()=>{};h.expandCapacity=()=>{h.grants++;h.rules.bufferCapacity+=12;return true;};
 h.showOpeningFeatureGuide({});return h;
}
let h=make(3);assert.equal(h.shows,1,'L3 retains opening guide');assert.equal(h.capacityGuideArmed,false);
h=make(4);h.rules.bufferCapacity=84;h.rules.bufferCount=72;h.runtime.getSF=()=>null;
assert.doesNotThrow(()=>h.maybeShowCapacityPressureGuide(),'an optional hint resource must not break gameplay update');
assert(!h.capacityHint);assert.equal(h.capacityGuideArmed,true,'the hint waits for its asynchronously preloaded frame');
h.runtime.getSF=()=>({});h.maybeShowCapacityPressureGuide();assert(h.capacityHint?.isValid,'the deferred hint appears once its frame is ready');
for(const [level,capacity,threshold] of [[4,84,72],[5,96,84]]){
 h=make(level);assert.equal(h.shows,0);h.rules.bufferCapacity=capacity;h.rules.bufferCount=threshold-1;
 h.maybeShowCapacityPressureGuide();assert(!h.capacityHint);
 h.rules.bufferCount=threshold;h.maybeShowCapacityPressureGuide();assert(h.capacityHint?.isValid);assert.equal(h.inputLocked,false);
 assert.deepEqual(h.labels,['传送带快满了','可扩容增加12格']);assert.equal(h.grants,0);
 assert(h.framed);assert.equal(h.styled,2,'both labels reuse opening guide styling');
 assert.equal(h.capacityHint.x,0,'bubble must be horizontally centered');
 assert.equal(h.capacityHint.y,-286,'bubble must move 36 px closer to the conveyor');
 assert.equal(h.capacityHint.children.at(-1).name,'CapacityHintHand');
 const hint=h.capacityHint;h.updateCapacityHint(4);assert(hint.isValid);h.updateCapacityHint(1);assert(!hint.isValid);
 h.maybeShowCapacityPressureGuide();assert.equal(h.capacityHint,null,'once per play session');
 h.showOpeningFeatureGuide({});h.maybeShowCapacityPressureGuide();assert(h.capacityHint?.isValid,'new session rearms');
 h.runtime._adShowing=true;h.updateCapacityHint(0);assert.equal(h.capacityHint,null);
}
for(const mode of ['external','theme']){h=make(4,mode);h.rules.bufferCount=70;h.maybeShowCapacityPressureGuide();assert(!h.capacityHint);}
h=make(6);h.rules.bufferCount=70;h.maybeShowCapacityPressureGuide();assert(!h.capacityHint);
for(const flag of ['settingsPaused','settlementPaused','skillMovementPaused','externalInputBlocked','inputLocked']){h=make(4);h[flag]=true;h.rules.bufferCount=70;h.maybeShowCapacityPressureGuide();assert(!h.capacityHint,flag);}
for(const flag of ['isGameEnd','_adShowing','_rewardedGrantTransaction']){h=make(4);h.runtime[flag]=true;h.rules.bufferCount=70;h.maybeShowCapacityPressureGuide();assert(!h.capacityHint,flag);}
h=make(4);h.rules.bufferCount=70;h.rules.cells=[];h.maybeShowCapacityPressureGuide();assert(!h.capacityHint);
h=make(4);h.rules.bufferCount=70;h.firstStoreEventSent=false;h.maybeShowCapacityPressureGuide();assert(!h.capacityHint);
assert(source.includes('if (this.checkBufferDeadlock()) return;'),'soft hint must not suppress game rules');
assert(source.includes('this.runtime.getActiveLogicalLevelId?.() <= 5'),'levels 4-5 must preload the shared guide bubble before pressure can trigger');
console.log('pch-capacity-pressure-guide.test.js passed');
