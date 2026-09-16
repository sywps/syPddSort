'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const generator=require('../tools/shuffle-baseline'),legacy=require('../tools/shuffle-comparison');
const root=path.resolve(__dirname,'..');
const preview=fs.readFileSync(path.join(root,'tools/guanka-preview.html'),'utf8');
const palette=require('node:vm').runInNewContext('('+preview.match(/const COLOR_HEX\s*=\s*(\{[\s\S]*?\});/)[1]+')');
const rows=[];
for(const id of [50,52,55,57]){
 const file=path.join(root,`assets/LevelData/level_${id}.json`),raw=fs.readFileSync(file,'utf8'),d=JSON.parse(raw);
 const snapshot=JSON.stringify(d),options={seed:id,palette};
 const result=generator.generate(d.correctColorArr,options);
 assert.deepEqual(result,generator.generate(d.correctColorArr,options),'repeatable');
 assert.equal(JSON.stringify(d),snapshot);assert.equal(fs.readFileSync(file,'utf8'),raw);
 assert.deepEqual([...legacy.colorInventory(result.grid)].sort(),[...legacy.colorInventory(d.correctColorArr)].sort());
 legacy.assertOutline(d.correctColorArr,result.grid);
 const fragments=generator.auditFragments(d.correctColorArr,result.grid);
 assert.equal(fragments.newSmallPieces,0,'no new small fragments from source regions');
 assert.equal(fragments.newSmallCells,0,'no newly fragmented cells');
 assert.ok(fragments.outputSmallCells<=fragments.sourceSmallCells,'output small-cell count must not increase');
 assert.ok(fragments.outputSmallPieces<=fragments.sourceSmallPieces,'output small-piece count must not increase');
 const count=d.correctColorArr.flat().filter(c=>c>0).length;
 assert.ok(legacy.matchingCellCount(d.correctColorArr,result.grid)<=Math.max(legacy.minimumMatchCount(d.correctColorArr),Math.floor(count*.12)));
 if(id===50){
  // At >=88% displacement, at least90 grey beans must occupy original peach cells.
  const greyOnPeach=d.correctColorArr.reduce((sum,row,y)=>sum+row.filter((c,x)=>c===5&&result.grid[y][x]===19).length,0);
  const minimumGreyOnPeach=121+2*323-count-Math.floor(count*.12);
  assert.ok(greyOnPeach>=minimumGreyOnPeach);
 }
 const metrics={...legacy.structureMetrics(d.correctColorArr,result.grid),...legacy.metrics(d.correctColorArr,result.grid),...fragments};
 rows.push({id,target:d.correctColorArr,original:d.initRandomColorArr,next:result.grid,metrics,result:{...result,grid:undefined}});
 console.log(JSON.stringify({id,...metrics}));
}
assert.throws(()=>generator.generate([[1],[2,3]],{palette}),/rectangular/);
assert.throws(()=>generator.generate([[1,2]],{}),/palette/);
assert.equal(generator.auditFragments([[1,1,1,1,1,1,1,1,1]],[[2,3,3,3,3,3,3,3,3]]).newSmallPieces,2);
assert.equal(generator.auditFragments([[1,1,0,2,2]],[[3,3,0,4,4]]).newSmallPieces,0,'existing small blocks may recolour intact');
assert.equal(generator.auditFragments([Array(18).fill(1)],[[...Array(9).fill(2),...Array(9).fill(3)]]).newSmallPieces,0,'large connected splits allowed');
assert.equal(generator.auditFragments([[1,1,1,1]],[[2,2,3,3]]).newSmallPieces,2,'do not split an existing small block');
assert.throws(()=>generator.generate([[1,1,1,2]],{palette,seed:1}),/zero new small fragments/,'incompatible constraints must fail explicitly');
for(const target of [[[0,0]],[[1,1]],[[1,2]],[[1,0,2],[2,0,1]]]){
 const r=generator.generate(target,{palette,seed:1});legacy.assertOutline(target,r.grid);
 assert.deepEqual([...legacy.colorInventory(target)].sort(),[...legacy.colorInventory(r.grid)].sort());
}
if(process.argv.includes('--report')){
 const folder=path.join(root,'.planning/structure-shuffle-20260914');
 const approved=JSON.parse(fs.readFileSync(path.join(folder,'shape-comparison.json'),'utf8')).find(r=>r.id===52).next;
 rows.find(r=>r.id===52).approved=approved;
 const svg=g=>`<svg viewBox="0 0 ${g[0].length} ${g.length}">${g.flatMap((row,y)=>row.map((c,x)=>c>0?`<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[c]}"/>`:'')).join('')}</svg>`;
 fs.writeFileSync(path.join(folder,'baseline-comparison.json'),JSON.stringify(rows));
 fs.writeFileSync(path.join(folder,'baseline-comparison.html'),`<!doctype html><meta charset="utf-8"><title>基准乱序候选</title><style>body{font:16px system-ui;background:#f6f3ed;color:#302b24}section{background:white;margin:20px;padding:20px}.row{display:flex;gap:20px}figure{margin:0;flex:1}svg{width:100%;height:320px;background:#faf8f4;shape-rendering:crispEdges}</style><h1>全局数量分配＋原色块布局 · 基准候选</h1><p>硬性检查：不从原区域切出新增1～8颗碎块；原有小块允许保留。正式关卡未改。52关已认可结果另外保留；“基准生成”列是真实算法结果，不用旧结果冒充。</p>${rows.map(r=>`<section><h2>正式 ${r.id}</h2><p>错位 ${(r.metrics.displacement*100).toFixed(1)}% · 内部边界 ${(r.metrics.boundaryRetention*100).toFixed(1)}% · 新增1～8颗碎块 ${r.metrics.newSmallPieces} · 小块数量 ${r.metrics.sourceSmallPieces} → ${r.metrics.outputSmallPieces}</p><div class="row">${[['目标','target'],['原乱序','original'],['基准生成','next'],...(r.approved?[['52已认可参照','approved']]:[])].map(([label,key])=>`<figure>${label}${svg(r[key])}</figure>`).join('')}</div></section>`).join('')}`);
}
