'use strict';

// Baseline candidate generator. No file writes, level IDs, or special-case palettes.
// Global quotas are decided before spatial placement; no scattered inventory repair.
const VERSION = 'transport-regions-v2-no-new-small-fragments';
const SMALL_FRAGMENT_LIMIT = 8;

// Compare at the same source positions: existing small regions are permitted,
// but splitting any source region into a new 1..8-cell piece is prohibited.
function auditFragments(target, grid) {
    const w=target[0].length,h=target.length,seen=new Set();let newSmallPieces=0,newSmallCells=0,sourceSmallPieces=0,sourceSmallCells=0;
    const neighbors=p=>{const y=Math.floor(p/w),x=p%w;return [[y-1,x],[y+1,x],[y,x-1],[y,x+1]]
        .filter(([r,c])=>r>=0&&r<h&&c>=0&&c<w).map(([r,c])=>r*w+c);};
    const value=(g,p)=>g[Math.floor(p/w)][p%w];
    for(let p=0;p<w*h;p++){
        if(value(target,p)<=0||seen.has(p))continue;
        const region=[p];seen.add(p);
        for(let i=0;i<region.length;i++)for(const q of neighbors(region[i]))
            if(!seen.has(q)&&value(target,q)===value(target,p)){seen.add(q);region.push(q);}
        if(region.length<=SMALL_FRAGMENT_LIMIT){sourceSmallPieces++;sourceSmallCells+=region.length;}
        const remaining=new Set(region);
        while(remaining.size){const first=remaining.values().next().value,piece=[first];remaining.delete(first);
            for(let i=0;i<piece.length;i++)for(const q of neighbors(piece[i]))
                if(remaining.has(q)&&value(grid,q)===value(grid,first)){remaining.delete(q);piece.push(q);}
            if(piece.length<region.length&&piece.length<=SMALL_FRAGMENT_LIMIT){newSmallPieces++;newSmallCells+=piece.length;}
        }
    }
    const outputSeen=new Set();let outputSmallPieces=0,outputSmallCells=0;
    for(let p=0;p<w*h;p++){
        if(value(target,p)<=0||outputSeen.has(p))continue;
        const q=[p];outputSeen.add(p);
        for(let i=0;i<q.length;i++)for(const v of neighbors(q[i]))
            if(value(target,v)>0&&!outputSeen.has(v)&&value(grid,v)===value(grid,p)){outputSeen.add(v);q.push(v);}
        if(q.length<=SMALL_FRAGMENT_LIMIT){outputSmallPieces++;outputSmallCells+=q.length;}
    }
    return {limit:SMALL_FRAGMENT_LIMIT,newSmallPieces,newSmallCells,sourceSmallPieces,sourceSmallCells,outputSmallPieces,outputSmallCells};
}
function generate(target, options = {}) {
    if (!Array.isArray(target) || !target.length || !Array.isArray(target[0]) || !target[0].length
        || target.some(row => row.length !== target[0].length || row.some(c => !Number.isInteger(c)))) {
        throw new Error('Expected a rectangular integer grid');
    }
    const h = target.length, w = target[0].length, cells = [], counts = new Map();
    const at = p => target[Math.floor(p / w)][p % w];
    for (let p = 0; p < w * h; p++) if (at(p) > 0) {
        cells.push(p); counts.set(at(p), (counts.get(at(p)) || 0) + 1);
    }
    const n = cells.length, colors = [...counts.keys()].sort((a,b) => a-b);
    if (colors.length < 2) return { grid: target.map(row => row.slice()), version: VERSION, displacement: 0, candidates: 1 };
    const rgb = new Map(colors.map(c => {
        const hex = options.palette?.[c];
        if (!/^#[0-9a-f]{6}$/i.test(hex || '')) throw new Error('Missing palette colour ' + c);
        return [c, [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)];
    }));
    const distance = (a,b) => Math.sqrt(rgb.get(a).reduce((s,v,i) => s+(v-rgb.get(b)[i])**2,0)/3);
    const neighbors = p => {
        const y=Math.floor(p/w),x=p%w;
        return [[y-1,x],[y+1,x],[y,x-1],[y,x+1]]
            .filter(([r,c]) => r>=0 && r<h && c>=0 && c<w && target[r][c]>0).map(([r,c]) => r*w+c);
    };
    const near=new Map(cells.map(p=>[p,neighbors(p)])), visited=new Set(), regions=new Map(colors.map(c=>[c,[]]));
    for(const p of cells) {
        if(visited.has(p)) continue;
        const q=[p];visited.add(p);
        for(let i=0;i<q.length;i++)for(const v of near.get(q[i]))if(at(v)===at(p)&&!visited.has(v)){visited.add(v);q.push(v);}
        regions.get(at(p)).push(q);
    }
    const edges=[];
    for(const p of cells)for(const q of near.get(p))if(q>p)edges.push([p,q,at(p)!==at(q)]);
    const adjacency=new Map();
    for(const [p,q,diff] of edges)if(diff){const key=[at(p),at(q)].sort((a,b)=>a-b).join(',');adjacency.set(key,(adjacency.get(key)||0)+1);}
    const luminance=c=>rgb.get(c).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const features=[];
    for(const c of colors)for(const q of regions.get(c)){
        if(q.length>24 || luminance(c)>.45 || q.some(p=>near.get(p).length<4))continue;
        const ring=[...new Set(q.flatMap(p=>near.get(p)).filter(p=>at(p)!==c))];
        if(ring.length && ring.reduce((s,p)=>s+distance(c,at(p)),0)/ring.length>.25)features.push({q,ring});
    }
    let state=(options.seed ?? 20260914)>>>0;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
    const unavoidable=Math.max(0,2*Math.max(...counts.values())-n);
    const maxMatches=Math.max(unavoidable,Math.floor(n*.12));
    const plans=[], signatures=new Set();
    // Tiny quotas cannot be carved out of large regions. Keep existing tiny
    // colour populations intact instead of manufacturing new dots elsewhere.
    const frozen=colors.some(c=>counts.get(c)>SMALL_FRAGMENT_LIMIT)
        ?colors.filter(c=>counts.get(c)<=SMALL_FRAGMENT_LIMIT):[];
    const moving=colors.filter(c=>!frozen.includes(c));
    const fixedCount=frozen.reduce((sum,c)=>sum+counts.get(c),0),movingCount=n-fixedCount;
    for(let attempt=0;attempt<6000;attempt++) {
        const source=shuffle(moving),destination=attempt%2?shuffle(moving):source;
        const start=Math.floor(random()*movingCount),dest=[];
        for(const c of destination)for(let i=0;i<counts.get(c);i++)dest.push(c);
        const flow=new Map(frozen.map(c=>[c,new Map([[c,counts.get(c)]])]));let cursor=start,matches=fixedCount;
        for(const c of source){const row=new Map();for(let i=0;i<counts.get(c);i++){const out=dest[cursor++%movingCount];row.set(out,(row.get(out)||0)+1);if(out===c)matches++;}flow.set(c,row);}
        if(matches>maxMatches)continue;
        const key=colors.map(c=>[...flow.get(c)].sort((a,b)=>a[0]-b[0]).join(':')).join('|');
        if(signatures.has(key))continue;signatures.add(key);
        let score=0;
        for(const [key,weight]of adjacency){const [a,b]=key.split(',').map(Number);let loss=0;
            for(const [x,xc]of flow.get(a))for(const [y,yc]of flow.get(b)){
                const contrast=distance(x,y),need=Math.min(.3,distance(a,b));
                loss+=xc/counts.get(a)*yc/counts.get(b)*(Number(x===y)*3+Math.max(0,need-contrast)*2);
            }
            score+=weight*loss/n;
        }
        for(const c of colors){const row=flow.get(c),purity=Math.max(...row.values())/counts.get(c);
            score+=(1-purity)*Math.sqrt(regions.get(c).length)/colors.length*.3;
        }
        for(const f of features){const c=at(f.q[0]);let bestContrast=0;
            for(const [out,count]of flow.get(c))if(count>=f.q.length){let contrast=0;
                for(const p of f.ring)for(const [other,k]of flow.get(at(p)))contrast+=distance(out,other)*k/counts.get(at(p))/f.ring.length;
                bestContrast=Math.max(bestContrast,contrast);
            }
            score+=Math.max(0,.35-bestContrast)*2/Math.max(1,features.length);
        }
        plans.push({flow,score,matches});
    }
    if(!plans.length)throw new Error('No high-displacement colour allocation found');
    function piecesOf(points){
        const remaining=new Set(points),parts=[];
        while(remaining.size){const p=remaining.values().next().value,q=[p];remaining.delete(p);
            for(let i=0;i<q.length;i++)for(const v of near.get(q[i]))if(remaining.has(v)){remaining.delete(v);q.push(v);}
            parts.push(q);
        }
        return parts;
    }
    function placeQuota(sourceRegions, quotas, grid, direction){
        let pending=sourceRegions.slice();
        const position=p=>direction<2?Math.floor(p/w)*w+p%w:(p%w)*h+Math.floor(p/w);
        const sign=direction%2?-1:1;
        const buckets=[...quotas].filter(([,count])=>count>0).sort((a,b)=>a[1]-b[1]);
        for(const [out,quota]of buckets){
            // Exact subset sum of WHOLE regions, before considering any cuts.
            const dp=new Map([[0,[]]]);
            const order=pending.map((q,i)=>({q,i,key:q.reduce((s,p)=>s+position(p),0)/q.length}))
                .sort((a,b)=>sign*(a.key-b.key));
            for(const {q,i}of order){
                for(const [sum,indices]of [...dp])if(sum+q.length<=quota&&!dp.has(sum+q.length))dp.set(sum+q.length,[...indices,i]);
                if(dp.has(quota))break;
            }
            let selection=null;
            for(const sum of [...dp.keys()].sort((a,b)=>b-a)){
                const indices=new Set(dp.get(sum)),need=quota-sum;
                if(need===0){selection={indices,cut:[],rest:[],donor:-1};break;}
                if(need<=SMALL_FRAGMENT_LIMIT)continue;
                for(const {q,i}of order){
                    if(indices.has(i)||q.length-need<=SMALL_FRAGMENT_LIMIT)continue;
                    const sorted=q.slice().sort((a,b)=>sign*(position(a)-position(b)));
                    const cut=sorted.slice(0,need),rest=sorted.slice(need);
                    // Both sides must remain large connected pieces. No pixel repair.
                    const cutParts=piecesOf(cut),restParts=piecesOf(rest);
                    if([...cutParts,...restParts].some(part=>part.length<=SMALL_FRAGMENT_LIMIT))continue;
                    selection={indices,cut,rest:restParts,donor:i};break;
                }
                if(selection)break;
            }
            if(!selection)return false;
            const assigned=pending.filter((q,i)=>selection.indices.has(i)).flat().concat(selection.cut);
            for(const p of assigned)grid[Math.floor(p/w)][p%w]=out;
            pending=pending.filter((q,i)=>!selection.indices.has(i)&&i!==selection.donor).concat(selection.rest);
        }
        return pending.length===0;
    }
    plans.sort((a,b)=>a.score-b.score);let best=null,candidates=0,rejectedFragments=0;
    search: for(const plan of plans)for(let direction=0;direction<4;direction++){
        const grid=target.map(row=>row.map(c=>c>0?0:c));
        let placed=true;
        for(const c of colors){
            if(!placeQuota(regions.get(c),plan.flow.get(c),grid,direction)){placed=false;break;}
        }
        if(!placed){rejectedFragments++;continue;}
        const fragments=auditFragments(target,grid);
        if(fragments.newSmallPieces){rejectedFragments++;continue;}
        let lost=0,split=0,contrastLoss=0,tiny=0;const seen=new Set();
        for(const [p,q,diff]of edges){const a=grid[Math.floor(p/w)][p%w],b=grid[Math.floor(q/w)][q%w];
            if(diff){lost+=Number(a===b);contrastLoss+=Math.max(0,Math.min(.3,distance(at(p),at(q)))-distance(a,b));}
            else split+=Number(a!==b);
        }
        for(const p of cells){if(seen.has(p))continue;const q=[p],c=grid[Math.floor(p/w)][p%w];seen.add(p);
            for(let i=0;i<q.length;i++)for(const v of near.get(q[i]))if(!seen.has(v)&&grid[Math.floor(v/w)][v%w]===c){seen.add(v);q.push(v);}
            if(q.length<=3)tiny+=q.length;
        }
        let featureLoss=0;
        for(const {q,ring}of features){let contrast=0;
            for(const p of q)for(const v of near.get(p))if(at(v)!==at(p))contrast+=distance(grid[Math.floor(p/w)][p%w],grid[Math.floor(v/w)][v%w]);
            const boundary=q.reduce((s,p)=>s+near.get(p).filter(v=>at(v)!==at(p)).length,0);
            featureLoss+=Math.max(0,.4-contrast/Math.max(1,boundary));
        }
        const score=(lost*6+split*2+contrastLoss*8+tiny*1.5)/n+featureLoss/Math.max(1,features.length)*5;
        candidates++;
        if(!best||score<best.score)best={grid,score,displacement:1-plan.matches/n,tinyCells:tiny,fragments};
        if(candidates>=64)break search;
    }
    if(!best)throw new Error('No candidate satisfies exact inventory, displacement and zero new small fragments; constraints were not relaxed');
    const actual=new Map();for(const p of cells){const c=best.grid[Math.floor(p/w)][p%w];actual.set(c,(actual.get(c)||0)+1);}
    for(const [c,count]of counts)if(actual.get(c)!==count)throw new Error('Inventory invariant failed');
    return {...best,version:VERSION,candidates,rejectedFragments};
}
module.exports={generate,VERSION,auditFragments,SMALL_FRAGMENT_LIMIT};
