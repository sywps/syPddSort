const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), ts = require('typescript');
const server = require('../cloudfunctions/getOpenid/third-level-experiment');
const first = require('../cloudfunctions/getOpenid/first-level-experiment');
const root = path.resolve(__dirname, '..');
function compile(file, deps = {}, globals = {}) {
  const out = {}; const js = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), { compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020} }).outputText;
  new Function('exports','require',...Object.keys(globals),js)(out,id=>{assert.ok(id in deps,id);return deps[id]},...Object.values(globals)); return out;
}
const deps = {'cc/env':{PREVIEW:true},'./MiniGamePlatform':{isMiniGameRuntime:()=>false}};
const retiredSelection=compile('assets/Scripts/Core/BeanSelectionPreview.ts',{}, {window:{location:{search:'?pick=B'}}});
assert.equal(retiredSelection.getBeanSelectionPreview('main',3),'A');
const retiredEncouragement=compile('assets/Scripts/Core/EncouragementFeedbackPolicy.ts',{}, {window:{location:{search:'?encourage=B'}}});
assert.equal(retiredEncouragement.isEncouragementEnabled({}),true);
for(const [file,key]of [['bean-selection','beanSelectionExperiment'],['encouragement','encouragementExperiment']]){
 const old=require('../cloudfunctions/getOpenid/'+file+'-experiment');
 const historical={id:old.ID,status:'enrolled',content:'B',enrolledAt:10,reason:'new_user'};
 assert.equal(old.resolveAssignment('u',{[key]:historical},{id:old.ID,exclusionReason:'timeout'},20),historical);
 assert.equal(old.resolveAssignment('u',null,{id:old.ID,eligible:true},20).reason,'experiment_closed');
}
const mod = compile('assets/Scripts/Core/ThirdLevelExperiment.ts',deps,{window:{location:{search:'?level=3=C'}}});
assert.equal(mod.getThirdLevelPreview(),'C');
const data={},store={getItem:k=>data[k]??null,setItem:(k,v)=>data[k]=v};
const s=new mod.ThirdLevelExperimentState();s.initialize(store,true,null);
assert.throws(()=>s.content(),/尚未/);
const request={id:server.ID,enteringLevel:3,progress:3};
assert.equal(server.resolveAssignment('u',{},undefined,100),null);
assert.equal(server.resolveAssignment('u',{}, {...request,enteringLevel:2},100),null);
const receipt=server.resolveAssignment('u',{},request,100);
s.accept('u',receipt);assert.equal(s.content(),receipt.content);
const restored=new mod.ThirdLevelExperimentState();restored.initialize(store,true,null);restored.accept('u',receipt);assert.equal(restored.content(),receipt.content);
assert.throws(()=>restored.accept('other',receipt),/发生变化/);
assert.deepEqual(server.resolveAssignment('u',{thirdLevelExperiment:receipt,savedLevel:8},request,200),receipt);
assert.equal(server.resolveAssignment('old',{savedLevel:4},request,100).status,'excluded');
assert.equal(server.resolveAssignment('old',{lastLevelId:5},request,100).status,'excluded');
const broken=new mod.ThirdLevelExperimentState();broken.initialize({getItem:()=>null,setItem:()=>{throw Error('disk full')}},true,null);
assert.throws(()=>broken.accept('u',receipt),/disk full/);assert.equal(broken.decision,null);
const counts={A:[0,0,0],B:[0,0,0],C:[0,0,0]};
for(let i=0;i<30000;i++)counts[first.bucket('u'+i)][['A','B','C'].indexOf(server.bucket('u'+i))]++;
for(const row of Object.values(counts))for(const n of row)assert.ok(n/row.reduce((a,b)=>a+b,0)>.30&&n/row.reduce((a,b)=>a+b,0)<.37);
const preview = compile('assets/Scripts/Core/BrowserLevelPreview.ts',deps);
for(const b of ['A','B','C']){const p=new preview.BrowserLevelPreviewState(true,'?level=3='+b);assert.equal(p.getLevel(),3);p.setLevel(4);assert.equal(p.getLevel(),4)}
// Data conversion preserves geometry and color counts. Board totals are not conveyor capacity.
const base=JSON.parse(fs.readFileSync(path.join(root,'assets/LevelData/level_3.json')));
for(const [b,n]of [['B',464],['C',495]]){
 const d=JSON.parse(fs.readFileSync(path.join(root,`assets/LevelData/level_3_${b}.json`)));
 assert.equal(d.levelId,3);assert.equal(d.timeLimit,300);assert.equal(d.conveyorCapacity,base.conveyorCapacity);assert.equal(d.Hard,base.Hard);
 assert.equal(d.correctColorArr.flat().filter(Boolean).length,n);assert.equal(d.slotTotalCount,n);
 const tally=g=>g.flat().filter(Boolean).sort((a,b)=>a-b);
 assert.deepEqual(tally(d.correctColorArr),tally(d.initRandomColorArr));
 for(let y=0;y<d.boardHeight;y++)for(let x=0;x<d.boardWidth;x++){assert.equal(!!d.correctColorArr[y][x],!!d.initRandomColorArr[y][x]);assert.ok(d.correctColorArr[y][x]<=20)}
}
async function cloud(){
 let profile={_id:'p',savedLevel:3,firstLevelExperiment:{id:first.ID,status:'enrolled',content:'B',enrolledAt:10}};
 const doc={get:async()=>({data:profile}),update:async({data})=>Object.assign(profile,data)};
 const collection={where:()=>({limit:()=>({get:async()=>({data:[profile]})})}),doc:()=>doc};
 const db={collection:()=>collection,runTransaction:async fn=>fn({collection:()=>collection})};
 const sdk={init(){},getWXContext:()=>({OPENID:'u'}),database:()=>db}; const m={exports:{}};
 new Function('module','exports','require',fs.readFileSync(path.join(root,'cloudfunctions/getOpenid/index.js'),'utf8'))(m,m.exports,id=>id==='wx-server-sdk'?sdk:require(path.join(root,'cloudfunctions/getOpenid',id)));
 const one=await m.exports.main({thirdLevelExperiment:request});assert.equal(one.ok,true);assert.equal(one.thirdLevelExperiment.status,'enrolled');
 const two=await m.exports.main({thirdLevelExperiment:request});assert.deepEqual(two.thirdLevelExperiment,one.thirdLevelExperiment);assert.equal(profile.firstLevelExperiment.content,'B');
 const normal=await m.exports.main({});assert.equal(normal.thirdLevelExperiment,undefined);assert.deepEqual(profile.thirdLevelExperiment,one.thirdLevelExperiment);
}
cloud().then(()=>console.log('third-level experiment: entry, persistence, cloud transaction, preview, independent buckets and data passed'),e=>{console.error(e);process.exitCode=1});
