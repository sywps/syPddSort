'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { palette, LEVEL_DIR, MANIFEST } = require('./generate-coop-levels');
const shuffle = require('./shuffle-comparison');
const { controllerReplay } = require('../tests/pvp-human-replay-fixture');
const OUT = path.join(__dirname, 'generated_levels/coop-variety-10');
const W = 64, H = 56;
const specs = [
    ['双球冰淇淋', [60,65,475,302], [19,20,6,16,4,3,14,1,9,12], 'top-bottom'],
    ['花心与花冠', [560,80,985,305], [19,20,6,3,16,14,1,11,12], 'center-ring'],
    ['抱紧大胡萝卜', [80,344,482,598], [19,20,6,5,14,16,4,3,11,12], 'character-object'],
    ['午睡搭子', [550,354,975,594], [19,20,6,5,16,4,14], 'two-characters'],
    ['双味糖霜圈', [97,643,460,884], [19,20,6,16,4,3,14,1,12], 'interlock'],
    ['双枝迎春', [545,640,975,893], [19,20,6,16,3,14,1,11,12], 'crossed-branches'],
    ['莓果庆祝蛋糕', [83,924,468,1167], [19,20,6,16,4,14,10,12,7,18], 'topping-base'],
    ['夏日柠檬冰茶', [550,925,980,1167], [19,20,6,13,2,18,3,4,12], 'vessel-content'],
    ['月下雪山河谷', [75,1220,475,1480], [19,20,6,3,16,12,11,13,7,18], 'foreground-background'],
    ['星环双鱼', [560,1215,980,1480], [19,20,6,4,3,16,13,7,18], 'curved-interlock'],
];
const colors = palette();
const rgb = id => colors[id].slice(1).match(/../g).map(v => parseInt(v,16));
const empty = () => Array.from({length:H},()=>Array(W).fill(0));
function write(file, data) {
    const text = JSON.stringify(data,null,2).replace(/\[\n(?:\s+\d+,?\n)+\s+\]/g,row=>JSON.stringify(JSON.parse(row)))+'\n';
    const lines=text.match(/[^\n]*\n/g);
    fs.writeFileSync(file,lines.slice(0,300).join(''));
    for(let i=300;i<lines.length;i+=300) fs.appendFileSync(file,lines.slice(i,i+300).join(''));
}
function extract(png, box, ids) {
    const [x0,y0,x1,y1]=box;
    const sample=(x,y)=>Array.from(png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+3));
    const background=([r,g,b])=>b>r+4 && b>g+9 && r>145 && g>125 && r-g<48;
    let minX=x1,maxX=x0,minY=y1,maxY=y0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(!background(sample(x,y))) {
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    const scale=Math.min(60/(maxX-minX+1),52/(maxY-minY+1));
    const width=Math.round((maxX-minX+1)*scale),height=Math.round((maxY-minY+1)*scale);
    const ox=Math.floor((W-width)/2),oy=Math.floor((H-height)/2),g=empty();
    const pal=ids.map(id=>[id,rgb(id)]);
    for(let r=0;r<height;r++)for(let c=0;c<width;c++) {
        const pixels=[];
        for(const dy of [.2,.5,.8])for(const dx of [.2,.5,.8]) {
            const p=sample(Math.min(maxX,Math.floor(minX+(c+dx)/scale)),Math.min(maxY,Math.floor(minY+(r+dy)/scale)));
            if(!background(p))pixels.push(p);
        }
        if(pixels.length<5)continue;
        const p=[0,1,2].map(k=>pixels.reduce((s,v)=>s+v[k],0)/pixels.length);
        const distance=q=>p.reduce((sum,v,k)=>sum+(v-q[k])**2,0);
        g[r+oy][c+ox]=pal.reduce((best,v)=>distance(v[1])<distance(best[1])?v:best)[0];
    }
    return {grid:g, bounds:{ox,oy,width,height}};
}
function owner(index,x,y,color) {
    switch(index) {
    case 0: return y < .48 && !([20,6].includes(color) && y>.35) ? 1:2;
    case 1: return ((x-.5)/.255)**2+((y-.49)/.34)**2<1
        || ([20,6,3,16].includes(color) && ((x-.5)/.34)**2+((y-.49)/.46)**2<1) ? 1:2;
    case 2: return [4,3,11,12].includes(color) ? 2:1;
    case 3: return x < .52+.075*Math.sin(y*6) ? 1:2;
    case 4: return x < .52+.105*Math.sin(y*9) ? 1:2;
    case 5: return y>.73 || x < .56-.12*y ? 1:2;
    case 6: return y < .39 || (y<.65 && [20,6].includes(color)) || (y<.48 && [10,12,7,18].includes(color)) ? 1:2;
    case 7: return ((x-.58)/.18)**2+((y-.69)/.25)**2<1 || [13,2,18,19].includes(color)
        || (color===20 && (x<.15 || x>.79 || y>.89 || (y>.16 && y<.29 && x<.65))) ? 1:2;
    case 8: return y < .50 && !([11,12].includes(color)) ? 1:2;
    case 9: return [4,3,16,6].includes(color) || (color===19 && x<.55) ? 1:2;
    default: throw new Error('unknown partition');
    }
}
function components(grid,predicate) {
    const seen=new Set(),result=[];
    for(let r=0;r<H;r++)for(let c=0;c<W;c++) {
        const key=r*W+c;
        if(seen.has(key)||!predicate(r,c))continue;
        const cells=[[r,c]];seen.add(key);
        for(let i=0;i<cells.length;i++) {
            const [y,x]=cells[i];
            for(const [yy,xx] of [[y-1,x],[y+1,x],[y,x-1],[y,x+1]]) {
                const k=yy*W+xx;
                if(yy>=0&&yy<H&&xx>=0&&xx<W&&!seen.has(k)&&predicate(yy,xx)){seen.add(k);cells.push([yy,xx]);}
            }
        }
        result.push(cells);
    }
    return result;
}
function render(grid,scale=7) {
    const png=new PNG({width:W*scale,height:H*scale});
    for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++) {
        const id=grid[Math.floor(y/scale)][Math.floor(x/scale)];
        png.data.set(id?[...rgb(id),255]:[239,236,247,255],(y*png.width+x)*4);
    }
    return PNG.sync.write(png);
}
function main() {
    const source=PNG.sync.read(fs.readFileSync(path.join(OUT,'concept.png')));
    const refs=Array.from({length:182},(_,i)=>JSON.parse(fs.readFileSync(path.join(__dirname,'dbt',`level_${i+1}.json`))));
    const profile=shuffle.learnProfile(refs);
    const manifest=JSON.parse(fs.readFileSync(MANIFEST));
    const entries=[];
    for(let i=0;i<specs.length;i++) {
        const [name,box,ids,split]=specs[i], {grid,bounds:b}=extract(source,box,ids);
        for(const cells of components(grid,(r,c)=>grid[r][c]>0))if(cells.length<6)for(const [r,c]of cells)grid[r][c]=0;
        const regions=grid.map((row,r)=>row.map((v,c)=>v?owner(i,(c-b.ox+.5)/b.width,(r-b.oy+.5)/b.height,v):0));
        if(i===2)for(let r=0;r<H;r++)for(let c=0;c<W;c++)if([19,16].includes(grid[r][c])) {
            let nearest=Infinity,assigned=1;
            for(let y=Math.max(0,r-4);y<Math.min(H,r+5);y++)for(let x=Math.max(0,c-4);x<Math.min(W,c+5);x++) {
                if(!grid[y][x]||[19,16].includes(grid[y][x]))continue;
                const distance=(r-y)**2+(c-x)**2;
                if(distance<nearest){nearest=distance;assigned=regions[y][x];}
            }
            regions[r][c]=assigned;
        }
        for(const n of [1,2])for(const cells of components(grid,(r,c)=>regions[r][c]===n)) {
            if(cells.length<10)for(const [r,c]of cells)regions[r][c]=3-n;
        }
        const parts=[1,2].map(n=>grid.map((row,r)=>row.map((v,c)=>regions[r][c]===n?v:0)));
        const counts=parts.map(p=>p.flat().filter(Boolean).length);
        assert(counts[0]+counts[1]>1000,`${name}: too few beans ${counts}`);
        assert(Math.min(...counts)>300,`${name}: tiny player region ${counts}`);
        const levelId=2+i;
        const collectionId=`coop_variety_${String(i+1).padStart(2,'0')}`;
        const previous=manifest.levels.find(entry=>entry.collectionId===collectionId);
        const seeds=i===6||i===7||!previous ? [2026091200+i*100,2026091250+i*100] : previous.seeds.slice();
        const initial=parts.map((part,n)=>{
            for(let attempt=0;attempt<40;attempt++) {
                const seed=seeds[n]+attempt;
                const candidate=shuffle.generate(part,{profile,seed,strictMismatch:true,outlineGrid:part});
                const run=controllerReplay({levelId,Hard:0,boardWidth:W,boardHeight:H,timeLimit:600,slotTotalCount:12,
                    conveyorCapacity:60,autoConveyorFinishSpeed:false,correctColorArr:part,initRandomColorArr:candidate});
                const replayBudget=Math.max(90000,counts[n]*(i===4?420:230));
                if(run.terminalType==='PASS' && run.envelope.events.at(-1)[0] <= replayBudget) {seeds[n]=seed;return candidate;}
            }
            throw new Error(`${name}/${n}: no verified layout in 40 candidates`);
        });
        const level={levelId,Hard:0,boardWidth:W,boardHeight:H,timeLimit:600,slotTotalCount:12,conveyorCapacity:60,
            correctColorArr:grid,initRandomColorArr:initial[0].map((row,r)=>row.map((v,c)=>v||initial[1][r][c])),coopRegions:regions};
        const file=`coop_level_${levelId}.json`;
        write(path.join(LEVEL_DIR,file),level);
        for(const [suffix,g] of [['full',grid],['A',parts[0]],['B',parts[1]]])fs.writeFileSync(path.join(OUT,`${levelId}-${suffix}.png`),render(g));
        entries.push({levelId,name,file,beanCount:counts[0]+counts[1],creatorBeanCount:counts[0],collaboratorBeanCount:counts[1],
            split:{type:split,field:'coopRegions'},seeds,collectionId,
            sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(LEVEL_DIR,file))).digest('hex')});
        console.log(`${levelId} ${name}: ${counts.join(' + ')}; colors ${new Set(grid.flat().filter(Boolean)).size}`);
    }
    manifest.levels=[...manifest.levels.filter(e=>e.collectionId==='coop_original_02'),...entries,
        ...manifest.levels.filter(e=>e.collectionId.startsWith('coop_wonder_')).sort((a,b)=>a.levelId-b.levelId)];
    write(MANIFEST,manifest);
    write(path.join(OUT,'manifest.json'),{levels:entries});
}
if(require.main===module)main();
module.exports={OUT,specs,render};
