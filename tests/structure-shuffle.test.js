'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('../tools/shuffle-comparison');
const root = path.resolve(__dirname, '..');
const ids = [50, 52, 55, 57];
const read = id => fs.readFileSync(path.join(root, `assets/LevelData/level_${id}.json`), 'utf8');
const sources = ids.map(read);
const levels = sources.map(JSON.parse);
const references = fs.readdirSync(path.join(root, 'tools/competitors/拼成彩虹-新版1478关/levels/main'))
    .filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(root, 'tools/competitors/拼成彩虹-新版1478关/levels/main', f), 'utf8')));
const profile = s.learnProfile(references);
const inventory = grid => [...s.colorInventory(grid)].sort((a,b)=>a[0]-b[0]);
const reports = levels.map(d => {
    const snapshot = JSON.stringify(d);
    const options = { levelId:d.levelId, profile, outlineGrid:d.initRandomColorArr, preserveStructure:true };
    const next = s.generate(d.correctColorArr, options);
    const legacy = s.generate(d.correctColorArr, {...options,preserveStructure:false});
    assert.deepEqual(next,s.generate(d.correctColorArr,options));
    assert.deepEqual(inventory(next),inventory(d.correctColorArr));
    s.assertOutline(d.initRandomColorArr,next);
    assert.equal(JSON.stringify(d),snapshot);
    assert.ok(s.matchingCellCount(d.correctColorArr,next)<[...s.colorInventory(d.correctColorArr).values()].reduce((a,b)=>a+b,0));
    assert.deepEqual(s.generate(d.correctColorArr,{...options,preserveStructure:undefined}),legacy,'default remains legacy');
    const before=s.structureMetrics(d.correctColorArr,legacy),after=s.structureMetrics(d.correctColorArr,next);
    assert.ok(after.boundaryRetention>before.boundaryRetention,`level ${d.levelId} boundary`);
    assert.ok(after.interiorSplit<before.interiorSplit,`level ${d.levelId} splitting`);
    return {id:d.levelId,before,after,displacement:s.metrics(d.correctColorArr,next).displacement,target:d.correctColorArr,original:d.initRandomColorArr,legacy,next};
});
assert.deepEqual(ids.map(read),sources,'formal files unchanged');
assert.deepEqual(s.generate([[0,0]],{preserveStructure:true}),[[0,0]]);
assert.deepEqual(s.generate([[1,1]],{preserveStructure:true}),[[1,1]]);
assert.throws(()=>s.generate([[1,2]],{preserveStructure:true,outlineGrid:[[0,2]]}),/outline/);
console.log(JSON.stringify(reports.map(({target,original,legacy,next,...r})=>r),null,2));
if(process.argv.includes('--report')){
    const dest=path.join(root,'.planning/structure-shuffle-20260914');
    const html=fs.readFileSync(path.join(root,'tools/guanka-preview.html'),'utf8');
    const paletteMatch=html.match(/const COLOR_HEX\s*=\s*(\{[\s\S]*?\});/);
    assert.ok(paletteMatch,'preview palette');
    const palette=require('node:vm').runInNewContext('('+paletteMatch[1]+')');
    const svg=g=>`<svg viewBox="0 0 ${g[0].length} ${g.length}" shape-rendering="crispEdges">${g.flatMap((row,y)=>row.map((v,x)=>v>0?`<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[v]}"/>`:'')).join('')}</svg>`;
    const body=reports.map(r=>`<section><h2>正式第 ${r.id} 关</h2><p>内部边界保留 ${(r.before.boundaryRetention*100).toFixed(1)}% → ${(r.after.boundaryRetention*100).toFixed(1)}% · 错位率 ${(r.displacement*100).toFixed(1)}%</p><div class="row">${[['目标','target'],['已保存原乱序','original'],['旧算法','legacy'],['结构保护新算法','next']].map(([label,key])=>`<figure><figcaption>${label}</figcaption>${svg(r[key])}</figure>`).join('')}</div></section>`).join('');
    fs.writeFileSync(path.join(dest,'comparison.html'),`<!doctype html><meta charset="utf-8"><title>正式关卡结构乱序对比</title><style>body{font:16px system-ui;background:#f6f3ed;color:#302b24;margin:28px}section{background:white;padding:20px;margin:20px 0;border-radius:12px}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}figure{margin:0;text-align:center}svg{width:100%;height:260px;background:#faf8f4}h2{margin:0}p{color:#666}</style><h1>50 / 52 / 55 / 57 整块换色实验 V2</h1><p>预览默认已恢复旧算法。此页只生成对照，未覆盖正式关卡。第二版优先保护形状，允许保留原色；尤其50关错位率较低，尚非最终乱序方案。</p>${body}`);
    fs.writeFileSync(path.join(dest,'comparison.json'),JSON.stringify(reports,null,2));
}
