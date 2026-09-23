const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function method(file,name){const ast=ts.createSourceFile(file,fs.readFileSync(path.join(root,'assets/Scripts/Core',file),'utf8'),ts.ScriptTarget.Latest,true);let found;function walk(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)===name)found=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);assert.ok(found,name);return found;}
function harness(methods,globals){const out={};const js=ts.transpileModule(`export class Harness { ${methods} }`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('exports',...Object.keys(globals),js)(out,...Object.values(globals));return new out.Harness();}
const get=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
async function run(){
 const a=get('assets/LevelData/level_3.json'),b=get('assets/LevelData/level_3_B.json'),c=get('assets/LevelData/level_3_C.json');
 const entry={levelId:3,prefix:'level_',data:a,variants:{B:b,C:c}};let failure='';
 const service=harness(method('LevelDataCdnService.ts','loadLevelFromContext'),{DEFAULT_LEVEL_PREFIX:'level_',validateConveyorCapacity:n=>assert.equal(n,90),validateHard:n=>assert.equal(n,0)});
 Object.assign(service,{getLiveManifest:async()=>({}),findPack:()=>({}),loadPack:async()=>({levels:[entry]}),getPackPrefix:r=>r.prefix,levelAnalyticsMetadata:new WeakMap(),recordLoadFailure:(_c,_l,_p,stage)=>failure=stage});
 for(const [bucket,expected]of [['A',a],['B',b],['C',c]])assert.equal(await service.loadLevelFromContext({namespace:'stable'},3,'level_',true,bucket),expected);
 delete entry.variants.B;assert.equal(await service.loadLevelFromContext({},3,'level_',true,'B'),null);assert.equal(failure,'experiment_variant_missing');
 let prepares=0,loaded='',reject=false;
 const runtime=harness(method('GameCtrlModules/AssetBootstrapModule.ts','_loadLevelDataFromConfiguredSource'),{
  AnalyticsMgr:{inst:{prepareThirdLevelExperiment:async()=>{prepares++;if(reject)throw Error('offline')}}},thirdLevelExperiment:{content:()=> 'C'},isWorkbenchPreviewRequested:()=>false});
 runtime._loadPreparedLevelDataFromConfiguredSource=(_id,_p,cb,bucket)=>{loaded=bucket;cb({bucket})};
 const load=(id=3,prefix='level_',entering=true)=>new Promise(resolve=>runtime._loadLevelDataFromConfiguredSource(id,prefix,(data,source,error)=>resolve({data,source,error}),entering));
 assert.equal((await load(3,'level_',false)).data.bucket,'A');assert.equal(prepares,0,'thumbnail/warmup must not enrol');
 assert.equal((await load()).data.bucket,'C');assert.equal(prepares,1);
 for(const flag of ['_isThemeLevel','_currentExternalLevelFilePath']){runtime[flag]=true;assert.equal((await load()).data.bucket,'A');runtime[flag]=false}
 runtime.isRankedPvpMode=()=>true;assert.equal((await load()).data.bucket,'A');runtime.isRankedPvpMode=()=>false;
 runtime.isCoopMode=()=>true;assert.equal((await load()).data.bucket,'A');runtime.isCoopMode=()=>false;
 assert.equal((await load(4)).data.bucket,'A');assert.equal((await load(3,'zt_level_')).data.bucket,'A');assert.equal(prepares,1);
 reject=true;loaded='';const bad=await load();assert.equal(bad.data,null);assert.match(bad.error.message,/offline/);assert.equal(loaded,'');
 let timeout,late,accepts=0;
 const gate=harness(method('AnalyticsMgr.ts','prepareThirdLevelExperiment'),{thirdLevelExperiment:{assertStorageReady(){},decision:null,accept(){accepts++}},
  THIRD_LEVEL_EXPERIMENT_ID:'third_level_abc_v1',PlatformCloudMgr:{inst:{callFunction:()=>new Promise(resolve=>late=resolve)}},sys:{localStorage:{getItem:()=>3}},setTimeout:cb=>{timeout=cb;return 1},clearTimeout(){}});
 gate.ensureReady=async()=>true;gate.trackFunnelEvent=()=>{};
 const pending=gate.prepareThirdLevelExperiment();await Promise.resolve();timeout();await assert.rejects(pending,/超时/);
 late({ok:true,openid:'u',thirdLevelExperiment:{}});await Promise.resolve();await Promise.resolve();assert.equal(accepts,0,'late receipt cannot switch current gameplay');
 console.log('third-level runtime: CDN variants, missing variant, scope, failed gate and late receipt passed');
}
run().catch(e=>{console.error(e);process.exitCode=1});
