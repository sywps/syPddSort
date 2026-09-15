'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const generator=require('../tools/shuffle-region-graph'),shared=require('../tools/shuffle-comparison');
const root=path.resolve(__dirname,'..'),preview=fs.readFileSync(path.join(root,'tools/guanka-preview.html'),'utf8');
const palette=require('node:vm').runInNewContext('('+preview.match(/const COLOR_HEX\s*=\s*(\{[\s\S]*?\});/)[1]+')'),rows=[];
const requestedAttempts=Number.parseInt(process.env.SHUFFLE_LAYOUT_ATTEMPTS||'',10);
const requestedRoleCap=Number.parseFloat(process.env.SHUFFLE_ROLE_CAP_FACTOR||'');
const diagnosticVisual=process.env.SHUFFLE_DIAGNOSTIC_VISUAL==='1';
const referenceDir=path.join(root,'tools/competitors/拼成彩虹-新版1478关/levels/main');
const references=fs.readdirSync(referenceDir).filter(f=>/^lv_\d+\.json$/.test(f)).sort().map(f=>JSON.parse(fs.readFileSync(path.join(referenceDir,f),'utf8')));
const profile=generator.learnProfile(references);
assert.equal(profile.count,1478);
const {simulate}=require('./shuffle-playability-fixture');
for(const id of [50,52,55,57]){
 const file=path.join(root,`assets/LevelData/level_${id}.json`),raw=fs.readFileSync(file,'utf8'),level=JSON.parse(raw),options={palette,seed:id,
  ...(Number.isFinite(requestedAttempts)&&requestedAttempts>0?{layoutAttempts:requestedAttempts}:{}),
  ...(Number.isFinite(requestedRoleCap)&&requestedRoleCap>=1?{roleCapFactor:requestedRoleCap}:{})};
 options.profile=profile;
 const strict=generator.generate(level.correctColorArr,options);
 assert.ok(Math.round((1-strict.displacement)*level.correctColorArr.flat().filter(c=>c>0).length)<=strict.maxMatches,'explicit match budget');
 // Keep both review variants. This does not alter the generator's strict
 // default or silently relax constraints in a production call.
 const reviewOptions=strict.structureAccepted?options:{...options,maxMatchRatio:.15};
 const result=strict.structureAccepted?strict:generator.generate(level.correctColorArr,reviewOptions);
 assert.deepEqual(result,generator.generate(level.correctColorArr,reviewOptions),'deterministic');
 assert.equal(fs.readFileSync(file,'utf8'),raw,'formal source unchanged');
 assert.deepEqual([...shared.colorInventory(result.grid)].sort(),[...shared.colorInventory(level.correctColorArr)].sort(),'inventory');
 shared.assertOutline(level.correctColorArr,result.grid);
 assert.equal(result.metrics.newSmallPieces,0,'no additional small components');
 assert.ok(result.metrics.outputSmallPieces<=result.metrics.sourceSmallPieces,'small components do not increase');
 if(!diagnosticVisual){
  assert.ok(result.metrics.edgePrecision>=.88,'invented boundaries remain bounded');
  assert.ok(result.metrics.edgeRecall>=.65,'target component boundaries remain recognisable');
  assert.ok(result.metrics.featureBoundaryLoss<=.25,'enclosed feature boundaries remain visible');
  assert.ok(result.metrics.roleOverflowRatio<=.10,'outline/detail colours do not collapse into an oversized mass');
  assert.ok(result.metrics.outputSmallPieces>=Math.floor(result.metrics.sourceSmallPieces*.45),'target-existing small detail is not over-merged');
 }
 const play=simulate({...level,initRandomColorArr:result.grid});
 assert.equal(play.completed,true,'current-source rules can finish without props or expanded capacity');
 rows.push({id,target:level.correctColorArr,original:level.initRandomColorArr,next:result.grid,
  strict:strict.grid,strictResult:{...strict,grid:undefined},reviewOptions:{seed:id,...(reviewOptions.maxMatchRatio===undefined?{}:{maxMatchRatio:reviewOptions.maxMatchRatio})},
  play,result:{...result,grid:undefined}});
 console.log(JSON.stringify({id,displacement:result.displacement,...result.metrics}));
}
assert.throws(()=>generator.generate([[1],[2,3]],{palette}),/rectangular/);
assert.throws(()=>generator.generate([[1,2]],{}),/palette/);
assert.deepEqual(generator.generate([[0,0]],{}).grid,[[0,0]]);
assert.deepEqual(generator.generate([[1,1]],{}).grid,[[1,1]]);
assert.deepEqual(generator.generate([[1,2]],{palette}).grid,[[2,1]],'tiny layouts are actually shuffled');
assert.throws(()=>generator.generate([[1,2]],{palette,maxExtraMatchRatio:NaN}),/maxExtraMatchRatio/);
assert.throws(()=>generator.generate([[1,2]],{palette,layoutAttempts:Infinity}),/layoutAttempts/);
assert.throws(()=>generator.generate([[1,-1]],{palette}),/nonnegative/);
assert.throws(()=>generator.learnProfile([{correctColorArr:[[1,2]],initRandomColorArr:[[1,1]]}]),/inventory/);
const boundaryCases=[
 {name:'majority-70-percent',target:[Array(28).fill(1).concat(Array(12).fill(2))],minimum:16},
 {name:'thin-line',target:[Array(12).fill(1),Array(12).fill(2)],minimum:0},
 {name:'hole',target:[[1,1,2,2],[1,0,0,2],[1,0,0,2],[1,1,2,2]],minimum:0},
 {name:'diagonal-islands',target:[[1,0,2],[0,2,0],[1,0,2],[0,1,0]],minimum:0},
];
for(const test of boundaryCases){
 const result=generator.generate(test.target,{palette,seed:17,profile,maxExtraMatchRatio:0});
 assert.equal(result.minimumMatches,test.minimum,test.name);
 assert.equal(shared.matchingCellCount(test.target,result.grid),test.minimum,test.name);
 shared.assertOutline(test.target,result.grid);
 assert.deepEqual([...shared.colorInventory(result.grid)].sort(),[...shared.colorInventory(test.target)].sort());
 const level={boardWidth:test.target[0].length,boardHeight:test.target.length,correctColorArr:test.target,initRandomColorArr:result.grid,conveyorCapacity:12,singleSelectionLimit:3};
 const play=simulate(level);assert.ok(play.completed,test.name);
 rows.push({id:test.name,target:test.target,next:result.grid,play,result:{...result,grid:undefined}});
}
assert.throws(()=>generator.generate(boundaryCases[0].target,{palette,maxMatchRatio:.39}),/below inventory minimum/);
if(process.argv.includes('--report')){
 const folder=path.join(root,'.planning/20260914-rainbow-shuffle-implementation');
 const approved=JSON.parse(fs.readFileSync(path.join(root,'.planning/structure-shuffle-20260914/shape-comparison.json'),'utf8')).find(r=>r.id===52).next;
 rows.find(r=>r.id===52).approved=approved;
 fs.writeFileSync(path.join(folder,'region-graph-comparison.json'),JSON.stringify(rows));
 fs.writeFileSync(path.join(folder,'reference-profile.json'),JSON.stringify(profile,null,2));
}
console.log('SHUFFLE_REGION_GRAPH_TESTS_PASSED');
