'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const read = p => fs.readFileSync(p, 'utf8');
const prefab = JSON.parse(read('assets/GameAssetsBundle/UI/Prefabs/Panels/ArtworkPreview.prefab'));
class Vec3 { constructor(x=0,y=0,z=1) { Object.assign(this,{x,y,z}); } clone(){ return new Vec3(this.x,this.y,this.z); } }
class UITransform {
    setContentSize(size) { this.contentSize = {...size}; this.width=size.width; this.height=size.height; }
    convertToNodeSpaceAR(p) { return p; }
}
class Label {}
class UIOpacity { constructor(){ this.opacity=255; } }
class BlockInputEvents {}
class Node {
    static EventType={TOUCH_END:'end'};
    constructor(name) { this.name=name;this.children=[];this.components=new Map();this.isValid=true;this.active=true;this.scale=new Vec3(1,1,1);this.events={}; }
    addChild(n){ n.parent=this;this.children.push(n); }
    getChildByName(name){return this.children.find(n=>n.name===name);}
    addComponent(Type){const c=new Type();this.components.set(Type,c);return c;}
    getComponent(Type){return this.components.get(Type);}
    setScale(v){this.scale=v.clone();}
    setSiblingIndex(){}
    targetOff(){this.events={};}
    on(event,handler){this.events[event]=handler;}
    removeFromParent(){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
    destroy(){this.isValid=false;}
}
function build(id){
    const record=prefab[id],n=new Node(record._name);n.active=record._active;n.layer=record._layer;
    for(const ref of record._components){const c=prefab[ref.__id__];
        if(c.__type__==='cc.UITransform')n.addComponent(UITransform).setContentSize(c._contentSize);
        if(c.__type__==='cc.Label')n.addComponent(Label).string=c._string;
    }
    for(const child of record._children)n.addChild(build(child.__id__));return n;
}

const popup=new Node('PopupRoot'); let load,loads=0,released=0,context,closed=0;
const shared={Node,UITransform,Label,BlockInputEvents,Vec3,Prefab:class{},instantiate:()=>build(prefab[0].data.__id__),AudioMgr:{inst:{play(){}}}};
const output=ts.transpileModule(read('assets/Scripts/Core/Panels/CollectionShellOverlay.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exp={};new Function('exports','require',output)(exp,id=>id==='../GameCtrlShared'?shared:{releaseCompletedPatternPreviewTree:()=>released++});
const runtime={isValid:true,requireCanvasUiRoot:()=>popup,requirePanelChild:(p,n)=>p.getChildByName(n),bindPanelButton:(n,fn)=>n.click=fn,
_withGameAssetsBundle:cb=>cb({load:(path,type,cb)=>{assert.equal(path,'UI/Prefabs/Panels/ArtworkPreview');loads++;load=cb;}}),
_clearSpriteFramesBeforeDestroy(){},_destroyDetachedNodeNextFrame(n){n.removeFromParent();n.destroy();}};
const open=()=>exp.openCollectionShellOverlay(runtime,{overlayName:'HomeArtworkPreview',hidePager:false,onReady:c=>context=c,onClose:()=>closed++});
open();open();assert.equal(loads,1,'rapid clicks share pending load');load(null,{});assert.equal(popup.children.length,1);open();assert.equal(loads,1);
assert.equal(context.box.getChildByName('PopupTitleBadge').active,false);assert.equal(context.box.getChildByName('XBtn').active,false);
assert(context.leftArrow&&context.rightArrow);assert(context.box.getChildByName('CollectionReplayButton'));
const event={getUILocation:()=>({x:9999,y:9999})};context.overlay.events.end(event);assert(event.propagationStopped);assert.equal(closed,1);assert.equal(released,1);assert.equal(popup.children.length,0);context.close();assert.equal(closed,1);
open();load(new Error('test'),null);open();assert.equal(loads,3,'load failure permits retry');
console.log('shared artwork preview lifecycle passed');
