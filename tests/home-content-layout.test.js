const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
class Component{} class UITransform{}
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/HomeContentLayout.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,{exports:exportsObject,require:()=>({_decorator:{ccclass:()=>c=>c},Component,UITransform})});
const areaSize={width:720,height:1300},contentSize={width:660,height:960};const action={position:{x:0,y:-294},setPosition(x,y){this.position={x,y}}};const content={getComponent:()=>contentSize,getChildByName:()=>action,setScale(x){this.scale=x}};const layout=new exportsObject.HomeContentLayout();layout.node={getComponent:()=>areaSize,getChildByName:()=>content};layout.lateUpdate();assert.equal(content.scale,1);assert.equal(action.position.y,-294);
areaSize.height=950;layout.lateUpdate();assert.equal(action.position.y,-284);assert.equal(content.scale,1);
areaSize.height=694;layout.lateUpdate();assert.equal(action.position.y,-278);assert.ok(content.scale<1);assert.ok(content.scale*944<=694);layout.lateUpdate();assert.equal(action.position.y,-278);
areaSize.height=1300;layout.lateUpdate();assert.equal(action.position.y,-294);assert.equal(content.scale,1);
console.log('home-content-layout.test.js passed');
