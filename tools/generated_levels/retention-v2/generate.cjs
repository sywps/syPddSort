'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {load,patchOfColor}=require('../retention-v1/generate.cjs');
const {createPixelBotReplay}=load('PvpBotReplay');
const root=path.resolve(__dirname,'../../..');
const specs=[
 {id:3,name:'小柴犬',source:'assets/LevelData/level_29.json',capacity:72,time:150,mode:'face',reason:'保留黑色轮廓、眼鼻和粉色舌头，橙白两大片交错，先看懂再操作'},
 {id:4,name:'向日葵',source:'tools/competitors/拼豆解解压/levels/main/lv_003.json',capacity:84,time:150,mode:'authored',reason:'沿用图库已有的局部乱序，圆形花盘与叶片清晰，增加处理量和第三种颜色'},
 {id:5,name:'爱心',source:'tools/competitors/拼豆解解压/levels/main/lv_004.json',capacity:96,time:120,mode:'bands',reason:'保留白色心形分隔线，三条彩色色带轮换，练习腾出下一种颜色的位置'}
];
function write(file,data){fs.writeFileSync(path.join(__dirname,file),JSON.stringify(data)+'\n');}
function swap(grid,left,right){assert.equal(left.length,right.length);left.forEach(([r,c],i)=>{const [rr,cc]=right[i];[grid[r][c],grid[rr][cc]]=[grid[rr][cc],grid[r][c]];});}
const results=[];
for(const spec of specs){
 const original=JSON.parse(fs.readFileSync(path.join(root,'assets/LevelData/level_'+spec.id+'.json'),'utf8'));
 const sourceText=fs.readFileSync(path.join(root,spec.source),'utf8'),src=JSON.parse(sourceText);
 const correct=src.correctColorArr.map(row=>row.slice());
 const level={Hard:0,levelId:spec.id,boardWidth:src.boardWidth,boardHeight:src.boardHeight,timeLimit:spec.time,conveyorCapacity:spec.capacity,singleSelectionLimit:12,slotTotalCount:correct.flat().filter(x=>x>0).length,correctColorArr:correct,initRandomColorArr:correct.map(row=>row.slice())};
 const available=new Set();correct.forEach((row,r)=>row.forEach((c,col)=>{if(c)available.add(r+','+col);}));
 const edits=[];
 if(spec.mode==='face'){
   const a=patchOfColor(correct,available,4,48),b=patchOfColor(correct,available,20,48);assert(a&&b,'柴犬需要足够的橙白连通区');swap(level.initRandomColorArr,a,b);edits.push({colors:[4,20],cells:[a,b]});
 }else if(spec.mode==='authored'){
   level.initRandomColorArr=src.initRandomColorArr.map(row=>row.slice());
 }else{
   const groups=[1,8,17].map(color=>patchOfColor(correct,available,color,36));
   assert(groups.every(Boolean),'爱心色带连通区不足');
   groups.forEach((group,i)=>group.forEach(([r,c])=>{level.initRandomColorArr[r][c]=[1,8,17][(i+1)%3];available.delete(r+','+c);}));
   edits.push({cycle:[1,8,17],cells:groups});
   const a=patchOfColor(correct,available,1,36),b=patchOfColor(correct,available,17,36);assert(a&&b,'外层色带不足');swap(level.initRandomColorArr,a,b);edits.push({colors:[1,17],cells:[a,b]});
 }
 const flat=level.initRandomColorArr.flat(),target=correct.flat();
 assert.deepEqual(flat.slice().sort((a,b)=>a-b),target.slice().sort((a,b)=>a-b));
 assert.equal(correct.length,level.boardHeight);correct.forEach(row=>assert.equal(row.length,level.boardWidth));
 assert(flat.every((x,i)=>Number.isInteger(x)&&x>=0&&x<=20&&((x===0)===(target[i]===0))));
 const displaced=flat.filter((x,i)=>x!==target[i]).length;
 const runs=Array.from({length:10},(_,i)=>createPixelBotReplay(level,'retention-v2-'+spec.id+'-'+i,{rating:i<5?2000:900,gamesPlayed:10}));
 const passed=runs.filter(r=>r.terminalType==='PASS');assert(passed.length,'候选无合法路径');
 results.push({...spec,filled:level.slotTotalCount,displaced,activeColors:new Set(flat.filter((x,i)=>x!==target[i])).size,mainlineCapacity:spec.id===3?84:spec.capacity,sourceSha256:crypto.createHash('sha256').update(sourceText).digest('hex'),passes:passed.length,attempts:runs.length,runs:runs.map(r=>({terminal:r.terminalType,seconds:r.terminalTimeMs/1000,taps:r.actions.length,rating:r.rating}))});
 write('level_'+spec.id+'.json',level);write('original_'+spec.id+'.json',original);
 write('solution_'+spec.id+'.json',{scope:'legal rule simulation; not human performance; default bot carrier count differs from mainline 20',actions:passed[0].actions,seconds:passed[0].terminalTimeMs/1000,edits});
 if(spec.id===3)write('level_3_expanded.json',{...level,conveyorCapacity:84});
}
write('manifest.json',{levels:results});console.log(JSON.stringify(results));
