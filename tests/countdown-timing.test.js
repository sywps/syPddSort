const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function method(file,name){const ast=ts.createSourceFile(file,fs.readFileSync(path.join(root,'assets/Scripts/Core',file),'utf8'),ts.ScriptTarget.Latest,true);let result;function walk(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)===name)result=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);assert.ok(result,name);return result;}
function make(code,globals={}){const out={};const js=ts.transpileModule(`export class Harness {${code}}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('exports',...Object.keys(globals),js)(out,...Object.values(globals));return new out.Harness();}
const analytics=make(['recordCountdownConsumption','recordSuccessfulRevive'].map(n=>method('AnalyticsMgr.ts',n)).join('\n'));
const fresh=()=>({effectiveTimeLimit:300,finalized:false,countdownConsumedSeconds:0,reviveCount:0,addedTimeSeconds:0});
analytics.levelSession=fresh();
const timer=make(method('GameCtrlModules/GameplayPlacementFxModule.ts','tickTimer'),{AnalyticsMgr:{inst:analytics},COUNTDOWN_WARNING_TICK_SECONDS:new Set(),AudioMgr:{inst:{play(){}}}});
Object.assign(timer,{timeRemain:300,tickFreezeTimer:()=>false,isBoardCompletionCommittedForSettlement:()=>false,gameLose(){this.isGameEnd=true}});
timer.tickTimer();assert.equal(analytics.levelSession.countdownConsumedSeconds,1);
for(const [key,value]of [['isGameEnd',true],['_currentLevelUnlimitedTime',true],['_timerPauseRefs',1],['_gameForeground',false],['_adTimerSuspended',true]]){const old=timer[key];timer[key]=value;timer.tickTimer();timer[key]=old;assert.equal(analytics.levelSession.countdownConsumedSeconds,1,key)}
timer.tickFreezeTimer=()=>true;timer.tickTimer();assert.equal(analytics.levelSession.countdownConsumedSeconds,1);timer.tickFreezeTimer=()=>false;
const continuation=make(method('GameCtrlModules/SettlementHudModule.ts','continueAfterLose'),{AnalyticsMgr:{inst:analytics}});
Object.assign(continuation,{timeRemain:0,_guideStep:-1,resetTouchState(){},unschedule(){},resetIdleHintTimer(){}});
continuation.continueAfterLose(60);continuation.continueAfterLose(0);timer.tickTimer();
assert.deepEqual([analytics.levelSession.countdownConsumedSeconds,analytics.levelSession.reviveCount,analytics.levelSession.addedTimeSeconds],[2,2,60]);
timer.timeRemain=.5;timer.tickTimer();assert.equal(analytics.levelSession.countdownConsumedSeconds,2.5,'only positive remaining time consumed');
analytics.levelSession.finalized=true;analytics.recordCountdownConsumption(1);analytics.recordSuccessfulRevive(30);assert.equal(analytics.levelSession.addedTimeSeconds,60);
analytics.levelSession=fresh();assert.equal(analytics.levelSession.countdownConsumedSeconds,0);analytics.levelSession.effectiveTimeLimit=0;analytics.recordCountdownConsumption(1);assert.equal(analytics.levelSession.countdownConsumedSeconds,0);
assert.throws(()=>analytics.recordSuccessfulRevive(-1),/Invalid/);
async function cloudTest(){
 const queued=[];const experiment={fields:()=>({})};
 const client=make(method('AnalyticsMgr.ts','finalizeActiveLevel'),{firstLevelExperiment:experiment,beanSelectionExperiment:experiment,encouragementExperiment:experiment,thirdLevelExperiment:experiment,sys:{localStorage:{setItem(){}}},LS_ACTIVE_ROUND:'test'});
 Object.assign(client,{isCollectionEnabled:()=>true,flushMeasurementSummaries(){},delivery:{enqueue:(name,data)=>{queued.push(data);return true}}});
 for(const reason of ['pass','fail','abandon']){client.levelSession={...fresh(),countdownConsumedSeconds:7,reviveCount:1,addedTimeSeconds:60};await client.finalizeActiveLevel(reason==='pass',reason);assert.equal(queued.at(-1).countdownConsumedSeconds,7);assert.equal(queued.at(-1).reviveCount,1);assert.equal(queued.at(-1).addedTimeSeconds,60);assert.equal(client.levelSession,null)}
 const rows=[];const collection={doc:()=>({set:async({data})=>rows.push(data)}),add:async({data})=>{rows.push(data);return{_id:'r'}}};
 const cloud={init(){},getWXContext:()=>({OPENID:'u'}),database:()=>({collection:()=>collection})};const m={exports:{}};
 new Function('module','exports','require',fs.readFileSync(path.join(root,'cloudfunctions/saveLevelRecord/index.js'),'utf8'))(m,m.exports,id=>id==='wx-server-sdk'?cloud:require(id));
 const base={levelId:3,startTime:1000,endTime:9000,passStatus:true,gameplayMode:'pch_conveyor',gameplayEntryMode:'main',gameplaySchemaVersion:1};
 const timing={countdownTimingVersion:1,countdownTimingApplicable:true,countdownConsumedSeconds:2.5,reviveCount:2,addedTimeSeconds:60};
 for(const endReason of ['pass','fail','abandon']){const result=await m.exports.main({...base,...timing,endReason,passStatus:endReason==='pass'});assert.equal(result.ok,true,result.errorMessage);for(const[k,v]of Object.entries(timing))assert.equal(rows.at(-1)[k],v)}
 await m.exports.main(base);assert.equal(Object.hasOwn(rows.at(-1),'countdownConsumedSeconds'),false,'legacy missing is not zero');
 for(const patch of [{countdownConsumedSeconds:-1},{reviveCount:.5},{countdownTimingVersion:2},{countdownTimingApplicable:false}]){const n=rows.length;assert.equal((await m.exports.main({...base,...timing,...patch})).ok,false);assert.equal(rows.length,n)}
 console.log('countdown timing: pause/ad/background/freeze guards, revive accumulation, legacy and result transport passed');
}
cloudTest().catch(e=>{console.error(e);process.exitCode=1});
