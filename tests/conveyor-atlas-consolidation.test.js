const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const active='assets/BootstrapBundle/GameUI/Atlases/Conveyor';
const archived='assets/PreviewBundle/ArtCandidates/ConveyorLegacy';
const current=['arrow','capacity-gradient','conveyor_7a','conveyor_7b','exit_1','exit_1_2','exit_1_3','exit_1_4','exit_2','expand','track'];
const retired=['conveyor_0','conveyor_1','conveyor_2','conveyor_3','conveyor_4','conveyor_5','gameProp_2007','wf_base_14','pch_capacity_fill_sliced','pch_capacity_track_sliced'];
assert.deepEqual(fs.readdirSync(path.join(root,active)).filter(f=>f.endsWith('.png')).map(f=>f.slice(0,-4)).sort(),current.sort());
assert.equal(fs.existsSync(path.join(root,'assets/BootstrapBundle/GameUI/RainbowConveyor')),false);
const scene=JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));
function refs(o){if(!o||typeof o!=='object')return;if(Object.hasOwn(o,'__id__'))assert.ok(Number.isInteger(o.__id__)&&scene[o.__id__],'valid serialized reference');else Object.values(o).forEach(refs);}
scene.forEach(refs);
assert.equal(scene.filter(n=>n._name==='NormalLayoutV2').length,1);
assert.equal(scene.filter(n=>n._name==='NormalLayout'||n._name==='CompactLayout').length,0);
const text=JSON.stringify(scene);
for(const name of retired){const meta=JSON.parse(read(`${archived}/${name}.png.meta`));assert.ok(!text.includes(meta.uuid),'retired texture must not stay in scene: '+name);}
const pac=JSON.parse(read(active+'/conveyor.pac.meta')).userData;
assert.equal(pac.allowRotation,false);assert.equal(pac.padding,4);
assert.equal(pac.removeImageInBundle,true);assert.equal(pac.removeTextureInBundle,true);
for(const name of current){
 const meta=JSON.parse(read(`${active}/${name}.png.meta`));
 const sf=meta.subMetas.f9941.userData;
 assert.equal(sf.packable,true,name+' must actually participate in atlas');
 assert.ok(text.includes(meta.uuid),name+' should have a current scene consumer');
 const png=PNG.sync.read(fs.readFileSync(path.join(root,active,name+'.png')));
 assert.equal(png.width,sf.rawWidth);assert.equal(png.height,sf.rawHeight);
 assert.ok(png.width+8<=pac.maxWidth&&png.height+8<=pac.maxHeight,name+' fits page');
}
for(const p of ['assets/Scripts/Core/UiManifest.ts','scripts/patch-bootstrap-dynamic-assets.js'])assert.ok(!read(p).includes('GameUI/RainbowConveyor/'),'stale route in '+p);
require('../scripts/check-preview-asset-references').checkPreviewAssetReferences(root);
console.log('conveyor-atlas-consolidation: PASS');
