const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

class Button { static EventType = { CLICK: 'click' }; interactable = true; }
class EditBox { static EventType = { TEXT_CHANGED: 'text' }; string = ''; enabled = true; }
class Label { string = ''; }
class Node {
    constructor(name) { this.name=name; this.isValid=true; this.active=true; this.children=[]; this.components=new Map(); this.events={}; }
    addChild(n) { this.children.push(n); n.parent=this; }
    getChildByName(name) { return this.children.find(n=>n.name===name); }
    addComponent(Type) { const c=new Type(); c.node=this; this.components.set(Type,c);return c; }
    getComponent(Type) { return this.components.get(Type); }
    on(event, fn) { this.events[event]=fn; }
}
const child=(parent,name,Type)=>{const n=new Node(name);parent.addChild(n);if(Type)n.addComponent(Type);return n;};
function makePanel(){const root=new Node('FeedbackPanel');const box=child(root,'Box');child(box,'Input',EditBox);child(box,'XBtn',Button);const submit=child(box,'Submit',Button);child(submit,'SubmitLabel',Label).getComponent(Label).string='提交';child(submit,'ConfirmLabel',Label).active=false;const badge=child(box,'PopupTitleBadge');child(badge,'PopupTitleLabel',Label);child(badge,'SuccessTitle',Label).active=false;child(box,'SuccessMessage',Label).active=false;child(box,'Status',Label);return root;}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function main(){
    const source=fs.readFileSync('assets/Scripts/Core/Panels/FeedbackPanelController.ts','utf8');
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    let call, calls=0, payloads=[], timers=[];
    const cloud={getPlatform:()=> 'wechat',getSystemInfo:()=>({device:'test',system:'test'}),callFunction:(_,data)=>{calls++;payloads.push(data);return call();}};
    const api={};vm.runInNewContext(js,{exports:api,require:path=>path==='cc'?{Button,EditBox,Label,Node,Prefab:class{},BlockInputEvents:class{},instantiate:makePanel}:path.includes('PlatformCloudMgr')?{PlatformCloudMgr:{inst:cloud}}:path.includes('AudioMgr')?{AudioMgr:{inst:{play(){}}}}:{SETTINGS_PANEL_TEXTURE_NAMES:[]},setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimeout:t=>{timers=timers.filter(x=>x!==t);},console:{error(){}}});
    let retains=0,focus=0;const toasts=[];const popup=new Node('PopupRoot');
    const runtime={node:new Node('Home'),_retainPanelTextureOwner(){retains++;},_releasePanelTextureOwner(){retains--;},_withGameAssetsBundle(fn){fn({load:(_,Type,done)=>done(null,{})});},requireCanvasUiRoot:()=>popup,beginModalFocus:()=>{focus++;return 'focus';},endModalFocus:()=>{focus--;},_closePanelWithTextureOwner(n){n.isValid=false;retains--;},showToast:text=>toasts.push(text),getAnalyticsLevelId:()=>12};
    api.openFeedbackPanel(runtime);api.openFeedbackPanel(runtime);await flush();assert.equal(popup.children.length,1);
    const box=popup.children[0].getChildByName('Box');const input=box.getChildByName('Input').getComponent(EditBox);const button=box.getChildByName('Submit');const status=box.getChildByName('Status').getComponent(Label);
    await button.events.click();assert.equal(calls,0);assert.match(status.string,/请先填写/);
    input.string='测试反馈';call=()=>Promise.reject(new Error('offline'));await button.events.click();assert.equal(input.string,'测试反馈');assert.equal(toasts.length,0);assert.equal(button.getComponent(Button).interactable,true);
    let complete;call=()=>new Promise(resolve=>{complete=resolve;});const pending=button.events.click();await flush();assert.equal(button.getComponent(Button).interactable,false);await button.events.click();assert.equal(calls,2,'double click must not submit again');complete({ok:true,feedbackId:'saved'});await pending;assert.equal(payloads[0].requestId,payloads[1].requestId,'retry must keep same identity');assert.equal(toasts.length,0);
    assert.equal(popup.children[0].isValid,true,'success stays open until confirmed');assert.equal(focus,1);assert.equal(retains,1);
    assert.equal(box.getChildByName('SuccessMessage').active,true);assert.equal(box.getChildByName('PopupTitleBadge').getChildByName('SuccessTitle').active,true);
    assert.equal(input.node.active,false);assert.equal(input.enabled,false);assert.equal(input.string,'');assert.equal(button.getChildByName('ConfirmLabel').active,true);assert.equal(button.getChildByName('SubmitLabel').active,false);
    await button.events.click();assert.equal(calls,2,'confirm must not send another feedback');assert.equal(focus,0);assert.equal(retains,0);
    api.openFeedbackPanel(runtime);await flush();const box2=popup.children[1].getChildByName('Box');const input2=box2.getChildByName('Input').getComponent(EditBox);assert.equal(input2.string,'');input2.string='超时内容';call=()=>new Promise(()=>{});const timeout=box2.getChildByName('Submit').events.click();await flush();timers.find(t=>t.ms===15000).fn();await timeout;assert.equal(input2.string,'超时内容');assert.equal(toasts.length,0);assert.equal(box2.getChildByName('SuccessMessage').active,false);assert.match(box2.getChildByName('Status').getComponent(Label).string,/重试/);
    cloud.getPlatform=()=> 'none';await box2.getChildByName('Submit').events.click();assert.match(box2.getChildByName('Status').getComponent(Label).string,/微信/);
    api.disposeFeedbackPanel(runtime);assert.equal(retains,0);assert.equal(focus,0);assert.equal(timers.length,0);
    console.log('feedback-panel.test.js passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
