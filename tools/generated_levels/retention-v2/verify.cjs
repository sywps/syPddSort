const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript');
const {load}=require('../retention-v1/generate.cjs');
const root=path.resolve(__dirname,'../../..');
const original=fs.readFileSync(path.join(root,'assets/Scripts/Core/PvpBotReplay.ts'),'utf8');
const needle='level.singleSelectionLimit, undefined, level.autoConveyorFinishSpeed';
assert.equal(original.split(needle).length,2,'机器人构造接口已改变，需重新核查');
const source=original.replace(needle,'level.singleSelectionLimit, 20, level.autoConveyorFinishSpeed');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};new Function('module','exports','require',output)(mod,mod.exports,name=>load(name.slice(2)));
const evidence=[];
for(const id of [3,4,5]){
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'assets/LevelData/level_'+id+'.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(__dirname,'original_'+id+'.json'),'utf8')),'正式关卡不应被候选替换');
 const level=JSON.parse(fs.readFileSync(path.join(__dirname,'level_'+id+'.json'),'utf8'));
 const runs=[];
 for(const capacity of [...new Set([60,level.conveyorCapacity,...(id===3?[84]:[])])]){
  const trials=Array.from({length:10},(_,seed)=>mod.exports.createPixelBotReplay({...level,conveyorCapacity:capacity},'mainline-'+id+'-'+seed,{rating:seed<5?2000:900,gamesPlayed:10}));
  const pass=trials.filter(r=>r.terminalType==='PASS');
  if(capacity===level.conveyorCapacity)assert.equal(pass.length,10,'候选实际20个载体配置需要全部通过');
  runs.push({capacity,passes:pass.length,attempts:10,seconds:trials.map(r=>r.terminalTimeMs/1000),terminals:trials.map(r=>r.terminalType)});
  if(capacity===level.conveyorCapacity)fs.writeFileSync(path.join(__dirname,'mainline_solution_'+id+'.json'),JSON.stringify({carrierCount:20,capacity,seconds:pass[0].terminalTimeMs/1000,actions:pass[0].actions})+'\n');
 }
 evidence.push({id,runs});
}
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify({method:'Existing legal bot policy with constructor override matching mainline 20 carriers; conservative 1x timing, no guide/DDA/ad assistance. Not human retention evidence.',levels:evidence},null,2)+'\n');
console.log(JSON.stringify(evidence));
