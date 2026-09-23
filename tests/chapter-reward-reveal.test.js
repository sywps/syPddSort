const assert=require('assert'),fs=require('fs'),ts=require('typescript'),vm=require('vm');
const source=fs.readFileSync('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts','utf8');
const start=source.indexOf('        revealWinSettlementPanel('),end=source.indexOf('\n        },',start)+11;
let renders=0;const context={renderChapterRewards(runtime){assert.equal(runtime.panelWin.active,true);assert.equal(runtime._settlementRevealState,'shown');renders++;},PerformanceMgr:{inst:{markUserActivity(){}}},AudioMgr:{inst:{play(){}}}};
vm.runInNewContext(ts.transpileModule('const methods = {'+source.slice(start,end)+'}; globalThis.methods=methods;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
const runtime={isValid:true,isGameEnd:true,_settlementRevealToken:1,_settlementRevealState:'waiting',panelWin:{isValid:true,active:false,setSiblingIndex(){}},ensureGameplayResultPanelsCreated:()=>true,updateWinRewardLabel(){},drawWinPatternPreview(){},failWinSettlementReveal(error){throw error;}};
assert.equal(context.methods.revealWinSettlementPanel.call(runtime,4,1),true);assert.equal(renders,1);
assert.equal(context.methods.revealWinSettlementPanel.call(runtime,4,1),false);assert.equal(renders,1);
const view=fs.readFileSync('assets/Scripts/Core/ChapterRewardView.ts','utf8');const expr=view.match(/const cleared = ([^;]+);/)[1];for(const [isPreview,level,saved,want] of [[true,4,1,4],[false,4,5,4],[true,13,1,13]]){const cleared=vm.runInNewContext(expr,{preview:()=>isPreview,session:{level},runtime:{getSavedLevel:()=>saved}});assert.equal(cleared,want);}
console.log('Normal panel reveal refreshes once; level4 preview and saved progress both resolve to4.');
