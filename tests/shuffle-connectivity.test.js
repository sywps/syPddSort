'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const generator=require('../tools/shuffle-region-graph');
const {simulate}=require('./shuffle-playability-fixture');
// Independent flood fill: do not reuse the generator's neighbourhood helper.
function components(grid){
 const h=grid.length,w=grid[0].length,seen=new Set(),sizes=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(grid[y][x]<=0||seen.has(y*w+x))continue;
  const queue=[[y,x]];seen.add(y*w+x);
  for(const [r,c]of queue)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const a=r+dy,b=c+dx,p=a*w+b;
   if(a>=0&&a<h&&b>=0&&b<w&&!seen.has(p)&&grid[a][b]===grid[y][x]){seen.add(p);queue.push([a,b]);}
  }
  sizes.push(queue.length);
 }
 return sizes;
}
const directory=path.join(__dirname,'../tools/competitors/拼成彩虹-新版1478关/levels/main');
const references=fs.readdirSync(directory).filter(f=>/^lv_\d+\.json$/.test(f)).map(f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8')));
const profile=generator.learnProfile(references),reports=[];
assert.equal(profile.version,2);
for(const id of [3,4,5,6]){
 const level=JSON.parse(fs.readFileSync(path.join(directory,`lv_${String(id).padStart(4,'0')}.json`),'utf8'));
 const target=level.correctColorArr,result=generator.generate(target,{palette:level.palette,seed:id,profile});
 const sizes=components(result.grid),source=components(target);
 assert.equal(sizes.filter(n=>n===1).length,0,`level ${id}: no isolated beans`);
 assert.ok(sizes.filter(n=>n<9).length<=source.filter(n=>n<9).length);
 assert.equal(result.metrics.outputComponents,sizes.length);
 assert.equal(result.metrics.outputSingletons,0);
 assert.deepEqual(result.grid.flat().slice().sort((a,b)=>a-b),target.flat().slice().sort((a,b)=>a-b));
 assert.deepEqual(result.grid.map(r=>r.map(c=>c>0)),target.map(r=>r.map(c=>c>0)));
 assert.ok(result.structureAccepted);
 assert.ok(target.flat().filter((c,p)=>c>0&&c===result.grid.flat()[p]).length<=result.maxMatches);
 if(id===3){
  // The top two staircase edges must retain one colour through diagonal steps.
  const top=[];for(let y=0;y<8;y++)for(let x=0;x<target[0].length;x++)if(target[y][x]===target[0].find(c=>c>0))top.push(result.grid[y][x]);
  assert.ok(top.length>5);assert.equal(new Set(top).size,1,'star top outline stays one colour');
 }
 const play=simulate({...level,boardWidth:target[0].length,boardHeight:target.length,initRandomColorArr:result.grid,conveyorCapacity:60,singleSelectionLimit:12});
 assert.ok(play.completed);
 reports.push({id,components:sizes.length,singletons:0,smallPieces:sizes.filter(n=>n<9).length,displacement:result.displacement,peakBuffer:play.peakBuffer});
}
const palette={1:'#ff0000',2:'#00ff00'};
const diagonal=[[1,0,0,2],[0,1,2,0],[0,2,1,0],[2,0,0,1]];
const result=generator.generate(diagonal,{palette,seed:17});
assert.deepEqual(components(result.grid).sort(),[4,4]);
assert.equal(result.metrics.sourceComponents,2);
assert.equal(result.metrics.newSplitEdges,0,'corner contact is not a shared geometric edge');
assert.equal(result.metrics.sourceInteriorEdges,0);
assert.deepEqual(result,generator.generate(diagonal,{palette,seed:17}));
assert.throws(()=>generator.generate(diagonal,{palette,profile:{...profile,version:1}}),/reference profile/);
const decoration=[[1,1,0,2,2],[1,1,0,2,2],[0,0,0,0,0],[1,0,0,0,2]];
const decorated=generator.generate(decoration,{palette,seed:17,minChunk:2});
assert.equal(components(decorated.grid).filter(n=>n===1).length,2,'intentional isolated decorations remain');
assert.equal(decorated.displacement,1);
const ring=[[1,1,1,1,1],[1,2,2,2,1],[1,2,0,2,1],[1,2,2,2,1],[1,1,1,1,1]];
const ringResult=generator.generate(ring,{palette,seed:17,minChunk:2});
assert.equal(ringResult.grid[2][2],0,'ring hole remains empty');
assert.deepEqual(components(ringResult.grid).sort((a,b)=>a-b),[8,16]);
assert.equal(ringResult.minimumMatches,8,'majority-colour inventory lower bound');
assert.equal(ringResult.structureAccepted,false,'connectivity alone must not pass damaged geometry');
console.log(JSON.stringify(reports));
console.log('SHUFFLE_CONNECTIVITY_TESTS_PASSED');
