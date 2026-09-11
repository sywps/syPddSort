'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const modules = new Map();
function load(name) {
    if (modules.has(name)) return modules.get(name);
    const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core', name + '.ts'), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true });
    assert.equal(compiled.diagnostics.length, 0);
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', compiled.outputText)(mod, mod.exports, request => {
        assert(request.startsWith('./'));
        return load(request.slice(2));
    });
    modules.set(name, mod.exports);
    return mod.exports;
}
const { createPixelBotReplay } = load('PvpBotReplay');
const directions = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
function patchOfColor(board, available, color, size) {
    const seen = new Set();
    let best = [];
    for (const key of available) {
        const [r,c] = key.split(',').map(Number);
        if (board[r][c] !== color || seen.has(key)) continue;
        const queue = [[r,c]];
        seen.add(key);
        for (let i=0;i<queue.length;i++) {
            const [row,col] = queue[i];
            for (const [dr,dc] of directions) {
                const nr=row+dr,nc=col+dc,k=`${nr},${nc}`;
                if (!available.has(k) || seen.has(k) || board[nr]?.[nc] !== color) continue;
                seen.add(k);queue.push([nr,nc]);
            }
        }
        if (queue.length > best.length) best=queue;
    }
    return best.length >= size ? best.slice(0,size) : null;
}
module.exports = { load, patchOfColor };
if (require.main === module) {
const stats = [];
for (const [id,target,colorLimit] of [[3,108,3],[4,144,4],[5,180,4]]) {
    const file = path.join(root, 'assets/LevelData', `level_${id}.json`);
    const originalText = fs.readFileSync(file, 'utf8');
    const original = JSON.parse(originalText);
    const candidate = structuredClone(original);
    const correct = candidate.correctColorArr;
    candidate.initRandomColorArr = correct.map(row=>row.slice());
    const available = new Set(), counts = new Map();
    for (let r=0;r<candidate.boardHeight;r++) for(let c=0;c<candidate.boardWidth;c++) {
        const color=correct[r][c];
        if(color>0){available.add(`${r},${c}`);counts.set(color,(counts.get(color)||0)+1);}
    }
    const colors=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,colorLimit).map(x=>x[0]);
    const swaps=[];
    for(let n=0;n<target/12;n++) {
        let pair=null;
        for(let offset=0;offset<colors.length&&!pair;offset++) {
            const a=colors[(n+offset)%colors.length];
            const left=patchOfColor(correct,available,a,6);
            if(!left)continue;
            for(let j=1;j<colors.length;j++) {
                const b=colors[(n+offset+j)%colors.length];
                const right=patchOfColor(correct,available,b,6);
                if(right){pair={a,b,left,right};break;}
            }
        }
        assert(pair,`L${id}: insufficient connected color patches`);
        for(const [r,c] of pair.left){candidate.initRandomColorArr[r][c]=pair.b;available.delete(`${r},${c}`);}
        for(const [r,c] of pair.right){candidate.initRandomColorArr[r][c]=pair.a;available.delete(`${r},${c}`);}
        swaps.push(pair);
    }
    const before=original.initRandomColorArr.flat(),after=candidate.initRandomColorArr.flat(),targetFlat=correct.flat();
    const displaced=after.filter((c,i)=>c!==targetFlat[i]).length;
    assert.equal(displaced,target);
    assert.deepEqual([...after].sort((a,b)=>a-b),[...targetFlat].sort((a,b)=>a-b));
    for(const key of Object.keys(original)) if(key!=='initRandomColorArr'&&key!=='displacementRatio')assert.deepEqual(candidate[key],original[key]);
    if('displacementRatio' in candidate)candidate.displacementRatio=displaced/targetFlat.filter(x=>x>0).length;
    const runs=Array.from({length:5},(_,seed)=>createPixelBotReplay(candidate,`retention-v1-${id}-${seed}`,{rating:2000,gamesPlayed:10}));
    const passed=runs.filter(run=>run.terminalType==='PASS').sort((a,b)=>a.terminalTimeMs-b.terminalTimeMs);
    assert(passed.length,`L${id}: no legal unassisted replay before time limit`);
    fs.writeFileSync(path.join(__dirname,`level_${id}.json`),JSON.stringify(candidate)+'\n');
    fs.writeFileSync(path.join(__dirname,`original_${id}.json`),originalText);
    fs.writeFileSync(path.join(__dirname,`solution_${id}.json`),JSON.stringify({levelId:id,assistance:false,transport:'existing PvpBotReplay conservative 1x schedule; no mainline guide or free expansion',policy:passed[0].policyVersion,timeMs:passed[0].terminalTimeMs,actions:passed[0].actions,swaps},null,2)+'\n');
    stats.push({levelId:id,originalSha256:crypto.createHash('sha256').update(originalText).digest('hex'),originalDisplaced:before.filter((c,i)=>c!==targetFlat[i]).length,displaced,activeColors:new Set(after.filter((c,i)=>c!==targetFlat[i])).size,filled:targetFlat.filter(x=>x>0).length,timeLimit:candidate.timeLimit,capacity:candidate.conveyorCapacity,legalReplayPasses:passed.length,replayAttempts:5,fastestReplaySeconds:passed[0].terminalTimeMs/1000,taps:passed[0].actions.length});
}
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify({scope:'independent candidates; formal source preserved; simulator is not human acceptance',levels:stats},null,2)+'\n');
console.log(JSON.stringify(stats));
}
