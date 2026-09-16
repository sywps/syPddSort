const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8');
const file = ts.createSourceFile('guide.ts', source, ts.ScriptTarget.Latest, true);
const controller = file.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'PchConveyorGameplayController');
const names = ['loadOpeningGuideBeanRing', 'showOpeningGuideBeanRings', 'clearOpeningGuideNodes', 'clearCapacityHint', 'handleLevelOneOpeningGuideRootTap', 'showLevelOneBoardGuideStep'];
const methods = names.map(name => controller.members.find(n => n.name?.getText(file) === name).getText(file)).join('\n');
class Vec3 { constructor(x,y,z) { Object.assign(this,{x,y,z}); } }
class Skeleton { static AnimationCacheMode = {SHARED_CACHE:1}; setAnimationCacheMode() {} findAnimation() { return true; } setAnimation(...args) { this.animation=args; } clearTracks() { this.cleared=true; } }
const compiled=ts.transpileModule('export class Harness {'+methods+'}',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};
new Function('module','exports','sp','UITransform','Vec3',compiled)(mod,mod.exports,{Skeleton,SkeletonData:class{}},class{},Vec3);
function harness(){const h=new mod.exports.Harness();h.openingGuideRingLoadVersion=0;h.openingGuideRingNodes=[];h.rules={};h.runtime={isGameEnd:false};return h;}
for(const cancellation of ['clear','rules','end','parent']) {
    const h=harness(),parent={isValid:true};let callback,ready=0;
    h.runtime._withBootstrapBundle=cb=>cb({load:(p,t,done)=>{callback=done;}});
    h.loadOpeningGuideBeanRing(parent,()=>ready++);
    assert.equal(h.inputLocked,true);
    if(cancellation==='clear')h.clearOpeningGuideNodes();
    if(cancellation==='rules')h.rules={};
    if(cancellation==='end')h.runtime.isGameEnd=true;
    if(cancellation==='parent')parent.isValid=false;
    callback(null,{});assert.equal(ready,0,'stale load must not resurrect guide: '+cancellation);
}
for(const failure of ['bundle','asset','render']) {
    const h=harness();let fatal=0;
    h.runtime._stopGameplayEntryWithFatalError=()=>fatal++;
    h.runtime._withBootstrapBundle=cb=>failure==='bundle'?cb(null,new Error('missing')):cb({load:(p,t,done)=>done(failure==='asset'?new Error('missing'):null,{})});
    h.loadOpeningGuideBeanRing({isValid:true},()=>{throw Error('invalid animation');});
    assert.equal(fatal,1,'must surface '+failure+' failure');
}
const h=harness();h.openingGuideRingData={};h.openingGuideLevelOneStep=0;h.openingGuideLevelOneCells=[{row:0,col:0}];
const cells=[{row:0,col:0,current:20,locked:false},{row:0,col:1,current:20,locked:false},{row:0,col:2,current:20,locked:true},{row:0,col:3,current:13,locked:false}];
h.rules={cells,board:{currentColors:[[20,20,20,13]]}};
const makeBean=x=>({isValid:true,getComponent:()=>({contentSize:{width:20,height:20},getBoundingBoxToWorld:()=>({xMin:x-10,xMax:x+10,yMin:-10,yMax:10,center:{x,y:0},contains:p=>Math.abs(p.x-x)<=10&&Math.abs(p.y)<=10})})});
h.runtime.cellNodes=[[makeBean(0),makeBean(80),makeBean(40),makeBean(120)]];
h.makeNode=(name,parent)=>({name,parent,isValid:true,setScale(){},addComponent(){this.skeleton=new Skeleton();return this.skeleton;},getComponent(){return this.skeleton;},destroy(){this.isValid=false;}});
let args;
h.showOpeningTargetGuideAt=(...value)=>args=value;
h.showLevelOneBoardGuideStep({getComponent:()=>({convertToNodeSpaceAR:p=>p})});
assert.equal(args[1].x,40,'group center is not a playable bean');
assert.equal(args[9].x,0,'hand must point to an actual playable bean');
assert.equal(h.openingGuideRingNodes.length,2,'only unlocked target color beans glow');
assert.deepEqual(h.openingGuideRingNodes.map(n=>n.parent),h.runtime.cellNodes[0].slice(0,2));
let taps=0;h.onOpeningGuideLevelOneTap=()=>taps++;
for(const x of [25,40,120])assert.equal(h.handleLevelOneOpeningGuideRootTap({getUILocation:()=>({x,y:0})}),false);
assert.equal(taps,0,'blank, locked, other color must not advance');
assert.equal(h.handleLevelOneOpeningGuideRootTap({getUILocation:()=>({x:80,y:0})}),true);
assert.equal(taps,1);
const rings=h.openingGuideRingNodes.slice();h.clearOpeningGuideNodes();
assert.equal(h.openingGuideRingNodes.length,0);assert(rings.every(n=>!n.isValid&&n.skeleton.cleared));
console.log('pch-opening-guide-ring.test.js passed');
