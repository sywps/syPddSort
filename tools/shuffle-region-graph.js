'use strict';

const VERSION = 'region-adjacency-v7-v5-guarded';
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const CONNECTED_DIRS = [...DIRS,[1,1],[1,-1],[-1,1],[-1,-1]];
const DEFAULT_OPTIONS=Object.freeze({minChunk:9,maxExtraMatchRatio:.01,roleCapFactor:1.75,fragmentedRoleRatio:.2,layoutAttempts:24});

function generate(target, options = {}) {
    validateGrid(target);
    for(const [name,min,max,integer]of [['minChunk',2,Number.MAX_SAFE_INTEGER,true],['layoutAttempts',8,256,true],
        ['roleCapFactor',1,Number.MAX_SAFE_INTEGER,false],['fragmentedRoleRatio',.05,.4,false]]){
        const v=options[name];if(v!==undefined&&(!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v))))
            throw new Error(`${name} is outside its supported range`);
    }
    const height=target.length,width=target[0].length;
    const minChunk=Math.max(2,options.minChunk ?? DEFAULT_OPTIONS.minChunk);
    const maxExtraMatchRatio=options.maxExtraMatchRatio ?? DEFAULT_OPTIONS.maxExtraMatchRatio;
    for(const [name,limit] of [['maxExtraMatchRatio',maxExtraMatchRatio],['maxMatchRatio',options.maxMatchRatio]])
        if(limit!==undefined&&(!Number.isFinite(limit)||limit<0||limit>1))throw new Error(`${name} must be between 0 and 1`);
    const roleCapFactor=Math.max(1,options.roleCapFactor ?? DEFAULT_OPTIONS.roleCapFactor);
    const fragmentedRoleRatio=Math.max(.05,Math.min(.4,options.fragmentedRoleRatio ?? DEFAULT_OPTIONS.fragmentedRoleRatio));
    const layoutAttempts=Math.max(8,options.layoutAttempts ?? DEFAULT_OPTIONS.layoutAttempts);
    const cells=[],inventory=new Map();
    const value=(grid,p)=>grid[Math.floor(p/width)][p%width];
    const neighborCache=new Map();
    const neighbors=p=>{if(neighborCache.has(p))return neighborCache.get(p);
        const y=Math.floor(p/width),x=p%width;const list=DIRS
        .map(([dy,dx])=>[y+dy,x+dx]).filter(([r,c])=>r>=0&&r<height&&c>=0&&c<width)
        .map(([r,c])=>r*width+c);neighborCache.set(p,list);return list;};
    for(let p=0;p<width*height;p++)if(value(target,p)>0){cells.push(p);inventory.set(value(target,p),(inventory.get(value(target,p))||0)+1);}
    const colors=[...inventory.keys()].sort((a,b)=>a-b),total=cells.length;
    const minimumMatches=Math.max(0,2*Math.max(0,...inventory.values())-total);
    const maxMatches=options.maxMatchRatio===undefined
        ?Math.min(total,minimumMatches+Math.floor(total*maxExtraMatchRatio))
        :Math.floor(total*options.maxMatchRatio);
    if(maxMatches<minimumMatches)throw new Error(`Match limit ${maxMatches} is below inventory minimum ${minimumMatches}/${total}`);
    if(colors.length<2)return {grid:target.map(r=>r.slice()),version:VERSION,displacement:0,metrics:trivialMetrics(target,minChunk)};
    const rgb=new Map(colors.map(c=>{
        const hex=options.palette?.[c];
        if(!/^#[0-9a-f]{6}$/i.test(hex||''))throw new Error('Missing palette colour '+c);
        return [c,[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)];
    }));
    const distance=(a,b)=>Math.sqrt(rgb.get(a).reduce((s,v,i)=>s+(v-rgb.get(b)[i])**2,0)/3);
    const background=options.backgroundColor??'#faf8f2';
    if(!/^#[0-9a-f]{6}$/i.test(background))throw new Error('Invalid backgroundColor');
    const backgroundRgb=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16)/255);
    const backgroundContrast=c=>Math.sqrt(rgb.get(c).reduce((s,v,i)=>s+(v-backgroundRgb[i])**2,0)/3);
    // Logical colour connectivity includes corners; shared geometric edges do not.
    const connectedCache=new Map();
    const connected=p=>{if(!connectedCache.has(p)){const y=Math.floor(p/width),x=p%width;
        connectedCache.set(p,CONNECTED_DIRS.map(([dy,dx])=>[y+dy,x+dx])
            .filter(([r,c])=>r>=0&&r<height&&c>=0&&c<width).map(([r,c])=>r*width+c));}
        return connectedCache.get(p);};
    const sourceRegions=buildRegions(target,cells,connected,value);
    const regions=[...sourceRegions.values()].flat();
    regions.forEach((region,id)=>{region.id=id;});
    const roleCap=new Map(colors.map(color=>{const largest=Math.max(...sourceRegions.get(color).map(region=>region.cells.length));
        return [color,Math.max(minChunk,Math.ceil(largest*roleCapFactor))];}));
    const sourceComponentStats=componentStats(target,minChunk);
    const regionByCell=new Map();
    for(const region of regions)for(const p of region.cells)regionByCell.set(p,region);
    const sourceEdges=[];
    for(const p of cells)for(const q of neighbors(p))if(q>p&&value(target,q)>0){
        sourceEdges.push({p,q,different:value(target,p)!==value(target,q),weight:
            value(target,p)!==value(target,q)&&(regionByCell.get(p).cells.length<=24||regionByCell.get(q).cells.length<=24)?3:1});
    }
    const profileKey=cohortKey(total,Math.max(...inventory.values())/total,
        sourceEdges.filter(edge=>edge.different).length/Math.max(1,sourceEdges.length));
    if(options.profile&&(options.profile.version!==2||!options.profile.overall||!options.profile.cohorts))
        throw new Error('Invalid structure reference profile');
    const reference=options.profile&&(options.profile.cohorts[profileKey]||options.profile.overall);
    // Visual anchors are small enclosed shapes (eyes, mouths, emblems, etc.).
    // Their surrounding zone is protected from newly introduced cut boundaries.
    const saliency=new Map(cells.map(p=>[p,0])),featureRegions=[];
    for(const list of sourceRegions.values())for(const region of list){
        if(region.cells.length>24)continue;
        const regionSet=new Set(region.cells),ring=new Set(),touchesEmpty=region.cells.some(p=>neighbors(p).some(q=>value(target,q)<=0));
        for(const p of region.cells)for(const q of neighbors(p))if(value(target,q)>0&&!regionSet.has(q))ring.add(q);
        const surrounding=new Set([...ring].map(p=>value(target,p)));
        if(touchesEmpty||!ring.size||surrounding.size>2)continue;
        featureRegions.push(region);
        const visitedZone=new Map(region.cells.map(p=>[p,0])),queue=region.cells.slice();
        for(let i=0;i<queue.length;i++){const p=queue[i],depth=visitedZone.get(p);if(depth>=4)continue;
            for(const q of neighbors(p))if(value(target,q)>0&&!visitedZone.has(q)){visitedZone.set(q,depth+1);queue.push(q);}}
        for(const [p,depth]of visitedZone)saliency.set(p,saliency.get(p)+(5-depth)**2);
    }
    let state=(options.seed??20260914)>>>0;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const shuffle=input=>{const a=input.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
    for(const region of regions)region.saliency=region.cells.reduce((sum,p)=>sum+(saliency.get(p)||0),0)/region.cells.length;
    const adjacency=new Map(regions.map(region=>[region.id,new Map()]));
    for(const edge of sourceEdges)if(edge.different){const a=regionByCell.get(edge.p).id,b=regionByCell.get(edge.q).id;
        adjacency.get(a).set(b,(adjacency.get(a).get(b)||0)+edge.weight);
        adjacency.get(b).set(a,(adjacency.get(b).get(a)||0)+edge.weight);
    }
    const failures=new Map();
    const reject=reason=>{failures.set(reason,(failures.get(reason)||0)+1);return null;};
    let best=null,evaluated=0;
    const finalists=[];
    const subjectFinalists=[];
    let rankSubject=false;
    // These are the existing experiment's compound visual acceptance bounds.
    // Prefer candidates satisfying all of them over a lower weighted sum with
    // one severe defect; do not trade an oversized dark mass for fewer cuts.
    const qualityDistance=m=>Math.max(0,.65-m.edgeRecall)+Math.max(0,.88-m.edgePrecision)
        +Math.max(0,m.featureBoundaryLoss-.25)+Math.max(0,m.roleOverflowRatio-.10)
        +Math.max(0,Math.floor(m.sourceSmallPieces*.45)-m.outputSmallPieces)/Math.max(1,m.sourceSmallPieces);
    const compareCandidates=(a,b)=>Number(qualityDistance(a.metrics)>1e-12)-Number(qualityDistance(b.metrics)>1e-12)||a.score-b.score;
    const candidateScore=(metrics,matches)=>
        (1-metrics.boundaryRecall)*18+(1-metrics.boundaryPrecision)*12
        +metrics.interiorSplit*5+(1-metrics.wholeRegionArea)*2+(1-metrics.regionPurity)*6
        +metrics.lowContrastBoundaryRatio*4+metrics.featureBoundaryLoss*32+metrics.roleOverflowRatio*28
        +(rankSubject?metrics.subjectBackgroundLoss*1000+metrics.subjectFragmentation*40+metrics.subjectContrastCuts*80:0)
        +Math.max(0,.45-metrics.outputSmallPieces/Math.max(1,metrics.sourceSmallPieces))*18
        +Math.max(0,metrics.roleOverflowRatio-.10)*200+Math.max(0,metrics.featureBoundaryLoss-.25)*80
        +(matches-minimumMatches)/total*12+referencePenalty(metrics,reference);
    const consider=candidate=>{
        if(!candidate)return;
        if(candidate.matches>maxMatches){reject('match-limit');return;}
        if(candidate.matches===total){reject('unchanged');return;}
        const metrics=measure(target,candidate.grid,minChunk);
        if(metrics.newSmallPieces>0||metrics.outputSmallPieces>metrics.sourceSmallPieces
            ||metrics.outputSingletons>metrics.sourceSingletons){reject('small-pieces');return;}
        evaluated++;
        const score=candidateScore(metrics,candidate.matches);
        const result={grid:candidate.grid,score,metrics,displacement:candidate.displacement,strategy:candidate.strategy||'direct-regions'};
        finalists.push(result);finalists.sort(compareCandidates);if(finalists.length>4)finalists.pop();
        rankSubject=true;
        subjectFinalists.push({...result,score:candidateScore(metrics,candidate.matches)});
        subjectFinalists.sort(compareCandidates);if(subjectFinalists.length>64)subjectFinalists.pop();
        rankSubject=false;
        best=finalists[0];
    };
    // An interval rotation produces a sparse, exact transport plan before any
    // cell is painted. Rotating by the largest quota attains the inventory
    // minimum of unchanged cells, including colours occupying over half a board.
    const planKeys=new Set(),directState=state;
    for(let attempt=0;attempt<layoutAttempts*8;attempt++){
        const order=shuffle(colors),dest=order.flatMap(c=>Array(inventory.get(c)).fill(c));
        let cursor=Math.max(...inventory.values()),matches=0;
        const flow=new Map();
        for(const c of order){const row=new Map();for(let i=0;i<inventory.get(c);i++){
            const out=dest[cursor++%total];row.set(out,(row.get(out)||0)+1);matches+=Number(out===c);}
            flow.set(c,row);}
        const key=colors.map(c=>[...flow.get(c)].sort((a,b)=>a[0]-b[0]).join(':')).join('|');
        if(planKeys.has(key))continue;planKeys.add(key);
        const grid=target.map(row=>row.map(c=>c>0?0:c));let placed=true;
        for(const c of colors)if(!paintSourceRegions(sourceRegions.get(c),[...flow.get(c)],grid,width,connected,minChunk,attempt,saliency,neighbors)){
            placed=false;break;}
        if(placed)consider({grid,matches,cuts:colors.reduce((sum,c)=>sum+flow.get(c).size-1,0),displacement:1-matches/total,strategy:'sparse-quota-flow'});
        else reject('flow-placement');
    }
    // Retain a bounded alternative quota allocation order as well as the
    // conservative placement. Full structure checks rank both; one greedy
    // choice must not eliminate a globally better inventory allocation.
    for(const exploratory of [false,true]){
        state=directState;
        const directStart=evaluated;
        for(let attempt=0;attempt<layoutAttempts*8&&evaluated-directStart<layoutAttempts;attempt++){
            consider(paintDirectRegions(attempt,exploratory));
        }
    }
    if(!best)throw new Error(`No layout preserves regions without adding small fragments: ${JSON.stringify(Object.fromEntries(failures))}`);
    best=finalists.map(repairFeatureRegions).map(result=>({...result,score:candidateScore(result.metrics,Math.round(total*(1-result.displacement)))}))
        .sort(compareCandidates)[0];
    // Only repair a measured background-contrast defect; preserve established
    // connectivity choices when there is no subject/background failure.
    const baseline=best;
    let subjectAdjustment='v5-kept-no-background-defect';
    if(best.metrics.subjectBackgroundLoss>.005){
        subjectAdjustment='v5-kept-no-qualified-candidate';
        const thinRegions=regions.filter(region=>region.cells.length>=minChunk
            &&region.cells.filter(p=>neighbors(p).filter(q=>value(target,q)===region.color).length>=3).length<region.cells.length*.35);
        const protectedLinks=thinRegions
            .flatMap(region=>region.cells.flatMap(p=>connected(p).filter(q=>q>p&&value(target,q)===region.color
                &&value(best.grid,p)===value(best.grid,q)).map(q=>[p,q])));
        rankSubject=true;
        const visible=(grid,region)=>region.cells.reduce((sum,p)=>sum+Math.min(.25,backgroundContrast(value(grid,p))),0);
        const regionCuts=(grid,region)=>region.cells.reduce((sum,p)=>sum+neighbors(p)
            .filter(q=>q>p&&value(target,q)===region.color&&value(grid,q)!==value(grid,p)).length,0);
        const majorRegions=regions.filter(region=>region.cells.length>=Math.max(25,total*.04));
        const thinVisibility=thinRegions.map(region=>visible(baseline.grid,region));
        const majorCuts=majorRegions.map(region=>regionCuts(baseline.grid,region));
        const qualifies=result=>result.metrics.subjectBackgroundLoss<baseline.metrics.subjectBackgroundLoss
                &&result.metrics.newSplitEdges<=baseline.metrics.newSplitEdges
                &&result.metrics.subjectContrastCuts<=baseline.metrics.subjectContrastCuts+1e-12
                &&result.metrics.subjectFragmentation<=baseline.metrics.subjectFragmentation+1e-12
                &&result.metrics.outputSingletons<=baseline.metrics.outputSingletons
                &&result.metrics.outputSmallPieces<=baseline.metrics.outputSmallPieces
                &&thinRegions.every((region,i)=>visible(result.grid,region)>=thinVisibility[i]-1e-12)
                &&majorRegions.every((region,i)=>regionCuts(result.grid,region)<=majorCuts[i])
                &&protectedLinks.every(([p,q])=>value(result.grid,p)===value(result.grid,q))
                &&qualityDistance(result.metrics)<=qualityDistance(baseline.metrics)+1e-12;
        // Filter before truncation: a high contrast score cannot crowd out a
        // candidate that actually preserves the v5 body and branch structure.
        const alternatives=subjectFinalists.filter(qualifies).slice(0,4).map(repairFeatureRegions).map(result=>({...result,
            score:candidateScore(result.metrics,Math.round(total*(1-result.displacement)))}))
            .filter(qualifies);
        if(alternatives.length){best=alternatives.sort(compareCandidates)[0];subjectAdjustment='qualified-improvement';}
    }
    const actual=countColors(best.grid);
    for(const [c,n]of inventory)if(actual.get(c)!==n)throw new Error('Inventory invariant failed');
    const flow=Object.fromEntries(colors.map(c=>[c,{}]));
    for(const p of cells){const row=flow[value(target,p)],c=value(best.grid,p);row[c]=(row[c]||0)+1;}
    return {...best,version:VERSION,evaluated,minimumMatches,maxMatches,subjectAdjustment,
        structureAccepted:qualityDistance(best.metrics)<=1e-12,profileKey:reference?profileKey:null,
        flow,
        excessMatches:Math.round(total*(1-best.displacement))-minimumMatches};

    function repairFeatureRegions(input){
        const grid=input.grid.map(row=>row.slice());
        const visualScore=metrics=>candidateScore(metrics,minimumMatches);
        let metrics=measure(target,grid,minChunk),score=visualScore(metrics),swaps=0;
        const regionLoss=region=>{const set=new Set(region.cells);let boundary=0,visible=0;
            for(const p of region.cells)for(const q of neighbors(p))if(value(target,q)>0&&!set.has(q)){
                boundary++;visible+=Number(value(grid,p)!==value(grid,q)&&distance(value(grid,p),value(grid,q))>=.12);}
            return 1-visible/Math.max(1,boundary);};
        for(let pass=0;pass<10;pass++){
            const uniform=regions.filter(region=>new Set(region.cells.map(p=>value(grid,p))).size===1);
            const damaged=featureRegions.filter(region=>regionLoss(region)>0).sort((a,b)=>regionLoss(b)-regionLoss(a));
            let choice=null;
            for(const a of damaged.slice(0,16)){
                const colorA=value(grid,a.cells[0]);
                for(const colorB of colors){if(colorA===colorB)continue;
                    const pool=uniform.filter(region=>region!==a&&region.cells.length<=a.cells.length&&value(grid,region.cells[0])===colorB);
                    const groups=[];
                    for(let variant=0;variant<3;variant++){
                        const ordered=pool.slice().sort((x,y)=>((x.id+variant*37)%regions.length)-((y.id+variant*37)%regions.length));
                        const paths=new Array(a.cells.length+1);paths[0]=[];
                        for(const region of ordered)for(let sum=a.cells.length;sum>=region.cells.length;sum--)
                            if(!paths[sum]&&paths[sum-region.cells.length])paths[sum]=paths[sum-region.cells.length].concat(region);
                        if(paths[a.cells.length]&&!groups.some(group=>group.map(r=>r.id).join(',')===paths[a.cells.length].map(r=>r.id).join(',')))groups.push(paths[a.cells.length]);
                    }
                    for(const group of groups){
                    for(const p of a.cells)grid[Math.floor(p/width)][p%width]=colorB;
                    for(const b of group)for(const p of b.cells)grid[Math.floor(p/width)][p%width]=colorA;
                    let matchCount=0;for(const p of cells)matchCount+=Number(value(grid,p)===value(target,p));
                    const next=matchCount<=maxMatches?measure(target,grid,minChunk):null;
                    if(next&&next.newSmallPieces===0&&next.outputSmallPieces<=next.sourceSmallPieces
                        &&next.outputSingletons<=next.sourceSingletons
                        &&next.roleOverflowRatio<=metrics.roleOverflowRatio+1e-12){const nextScore=visualScore(next);
                        if(nextScore<score-1e-9&&(!choice||nextScore<choice.score))choice={a,group,colorA,colorB,metrics:next,score:nextScore,matchCount};}
                    for(const p of a.cells)grid[Math.floor(p/width)][p%width]=colorA;
                    for(const b of group)for(const p of b.cells)grid[Math.floor(p/width)][p%width]=colorB;
                    }
                }
            }
            if(!choice)break;
            for(const p of choice.a.cells)grid[Math.floor(p/width)][p%width]=choice.colorB;
            for(const b of choice.group)for(const p of b.cells)grid[Math.floor(p/width)][p%width]=choice.colorA;
            metrics=choice.metrics;score=choice.score;swaps++;
        }
        let matchCount=0;for(const p of cells)matchCount+=Number(value(grid,p)===value(target,p));
        return {...input,grid,metrics,displacement:1-matchCount/total,featureSwaps:swaps};
    }

    function paintDirectRegions(attempt,exploratory=false){
        let localState=((options.seed??20260914)+Math.imul(attempt+1,2654435761))>>>0;
        const localRandom=()=>{localState=(Math.imul(localState,1664525)+1013904223)>>>0;return localState/4294967296;};
        const grid=target.map(row=>row.map(c=>c>0?0:c)),remaining=new Map(inventory),sourceRemaining=new Map(inventory),assigned=new Map();
        let matches=0,cuts=0,unpainted=total;
        const eligible=regions.filter(region=>region.cells.length>24&&region.cells.length>=minChunk*2).map(region=>({region,
            key:region.cells.length/(1+region.saliency*.08)*(0.9+localRandom()*.2)})).sort((a,b)=>b.key-a.key);
        const reserveTarget=total*(.28+(attempt%4)*.055),reservoirs=new Set();let reserveSize=0;
        for(const {region}of eligible){if(reserveSize>=reserveTarget&&reservoirs.size>=2)break;reservoirs.add(region.id);reserveSize+=region.cells.length;}
        const forcedMatchesAfter=(sourceColor,color,size)=>{const future=unpainted-size;let forced=0;
            for(const c of colors){const outputLeft=remaining.get(c)-(c===color?size:0),sourceLeft=sourceRemaining.get(c)-(c===sourceColor?size:0);
                forced=Math.max(forced,outputLeft+sourceLeft-future);}
            return matches+(sourceColor===color?size:0)+Math.max(0,forced);
        };
        const canPlace=(sourceColor,color,size)=>remaining.get(color)>=size&&forcedMatchesAfter(sourceColor,color,size)<=maxMatches;
        const commit=(points,sourceColor,color)=>{for(const p of points)grid[Math.floor(p/width)][p%width]=color;
            const size=points.length;remaining.set(color,remaining.get(color)-size);sourceRemaining.set(sourceColor,sourceRemaining.get(sourceColor)-size);
            unpainted-=size;if(color===sourceColor)matches+=size;};
        const writeWhole=(region,color,allowSmallRest=false)=>{if(assigned.has(region.id)||!canPlace(region.color,color,region.cells.length))return false;
            const rest=remaining.get(color)-region.cells.length;if(reservoirs.size&&!allowSmallRest&&rest>0&&rest<minChunk)return false;
            commit(region.cells,region.color,color);assigned.set(region.id,color);return true;};
        const fragmentedColors=colors.filter(color=>inventory.get(color)>=minChunk
            &&Math.max(...sourceRegions.get(color).map(region=>region.cells.length))/inventory.get(color)<fragmentedRoleRatio)
            .sort((a,b)=>inventory.get(b)-inventory.get(a));
        if(attempt%5!==0)for(const color of fragmentedColors){
            const available=regions.filter(region=>!reservoirs.has(region.id)&&!assigned.has(region.id)
                &&region.cells.length<=roleCap.get(color));
            const subset=findRoleSubset(available,remaining.get(color),color,localRandom);
            if(!subset)continue;
            let valid=true;for(const region of subset)if(!writeWhole(region,color,true)){valid=false;break;}
            if(!valid||remaining.get(color)!==0)return reject('fragmented-role');
        }
        const tinyColors=shuffle(colors.filter(color=>inventory.get(color)<minChunk)).sort((a,b)=>inventory.get(a)-inventory.get(b));
        for(const color of tinyColors){
            const available=regions.filter(region=>!reservoirs.has(region.id)&&!assigned.has(region.id)&&region.cells.length<=remaining.get(color));
            const subset=findWholeSubset(available,remaining.get(color),color,localRandom);
            if(!subset)return reject('tiny-subset');
            for(const region of subset)if(!writeWhole(region,color,true))return reject('tiny-write');
            if(remaining.get(color)!==0)return reject('tiny-remainder');
        }
        const pending=regions.filter(region=>!reservoirs.has(region.id)&&!assigned.has(region.id));
        while(pending.length){
            const assessed=pending.map(region=>{const choices=[];let assignedBoundary=0;
                for(const [other,boundary]of adjacency.get(region.id))if(assigned.has(other))assignedBoundary+=boundary;
                for(const color of colors){const available=remaining.get(color),rest=available-region.cells.length;
                    if(rest<0||(reservoirs.size&&rest>0&&rest<minChunk)||region.cells.length>roleCap.get(color)
                        ||!canPlace(region.color,color,region.cells.length))continue;
                    let cost=(color===region.color?region.cells.length*24:0)+(rest===0?-10:Math.abs(rest-region.cells.length)*.002);
                    cost+=roleMergeOverflow(region.cells,color,grid)*24;
                    for(const [other,boundary]of adjacency.get(region.id)){const otherColor=assigned.get(other);if(otherColor===undefined)continue;
                        const targetDistance=distance(region.color,regions[other].color),outputDistance=distance(color,otherColor);
                        const feature=region.cells.length<=24||regions[other].cells.length<=24;
                        cost+=boundary*(color===otherColor?(feature?180:18)
                            :Math.max(0,Math.min(.35,targetDistance)-outputDistance)*(feature?80:7));
                    }
                    cost+=localRandom()*.8;choices.push({color,cost});
                }
                choices.sort((a,b)=>a.cost-b.cost);
                return {region,choices,assignedBoundary,key:localRandom()};
            }).sort((a,b)=>Number(a.choices.length>0)-Number(b.choices.length>0)
                ||b.assignedBoundary-a.assignedBoundary||a.choices.length-b.choices.length
                ||b.region.cells.length-a.region.cells.length||a.key-b.key);
            const current=assessed[0];
            if(!current.choices.length)return reject('whole-allocation');
            // Randomise equivalent choices, not a visibly worse second choice
            // that can erase a feature boundary merely because it ranked second.
            const comparable=exploratory?current.choices:current.choices.filter(choice=>choice.cost<=current.choices[0].cost+2);
            const choice=comparable[Math.floor(localRandom()*Math.min(2,comparable.length))];
            if(!writeWhole(current.region,choice.color))return reject('whole-allocation');
            pending.splice(pending.findIndex(region=>region.id===current.region.id),1);
        }
        const blocks=[...reservoirs].map(id=>({cells:regions[id].cells.slice(),region:regions[id]}));
        while(blocks.length){
            blocks.sort((a,b)=>b.cells.length-a.cells.length);const block=blocks.shift(),size=block.cells.length,choices=[];
            for(const color of colors){const available=remaining.get(color);if(!available)continue;
                const leftover=available-size;
                if(available>=size&&size<=roleCap.get(color)&&(leftover===0||leftover>=minChunk)&&canPlace(block.region.color,color,size)){
                    choices.push({type:'whole',color,cost:blockCost(block.cells,block.region,color,grid)
                        +roleMergeOverflow(block.cells,color,grid)*24+(leftover===0?-12:0)});
                }else if(available>=minChunk&&size>=minChunk*2){
                    let chunk=Math.min(available,roleCap.get(color),size-minChunk);
                    if(available-chunk>0&&available-chunk<minChunk)chunk=available-minChunk;
                    if(chunk<minChunk||!canPlace(block.region.color,color,chunk))continue;
                    const split=carve(block.cells,chunk,connected,minChunk,attempt+cuts,saliency,()=>true,neighbors);
                    if(split)
                        choices.push({type:'split',color,split,cost:blockCost(split.piece,block.region,color,grid)
                            +roleMergeOverflow(split.piece,color,grid)*24+split.score*.18+18});
                }
            }
            choices.sort((a,b)=>a.cost-b.cost);
            const comparable=exploratory?choices:choices.filter(choice=>choice.cost<=choices[0].cost+2);
            const choice=comparable[Math.floor(localRandom()*Math.min(2,comparable.length))];
            if(!choice)return reject('reservoir-allocation');
            if(choice.type==='whole'){
                commit(block.cells,block.region.color,choice.color);
            }else{
                commit(choice.split.piece,block.region.color,choice.color);
                blocks.push(...choice.split.rest.map(cells=>({cells,region:block.region})));cuts++;
            }
        }
        if(unpainted!==0||[...remaining.values()].some(Boolean)||[...sourceRemaining.values()].some(Boolean))return reject('remaining-quota');
        return {grid,matches,cuts,displacement:1-matches/total,strategy:exploratory?'alternative-region-order':'direct-regions'};
    }

    function findWholeSubset(candidates,required,color,localRandom){
        const ordered=candidates.map(region=>({region,key:(region.color===color?1000:0)-region.saliency+localRandom()}))
            .sort((a,b)=>a.key-b.key).map(entry=>entry.region),paths=new Array(required+1);paths[0]=[];
        for(const region of ordered)for(let sum=required;sum>=region.cells.length;sum--)
            if(!paths[sum]&&paths[sum-region.cells.length])paths[sum]=paths[sum-region.cells.length].concat(region);
        return paths[required]||null;
    }

    function findRoleSubset(candidates,required,color,localRandom){
        let best=null;
        for(let variant=0;variant<8;variant++){
            const ordered=candidates.map(region=>({region,key:region.cells.length*(.75+localRandom()*.5)
                +(region.color===color?required*4:0)})).sort((a,b)=>a.key-b.key).map(entry=>entry.region);
            const paths=new Array(required+1);paths[0]=[];
            for(const region of ordered)for(let sum=required;sum>=region.cells.length;sum--)
                if(!paths[sum]&&paths[sum-region.cells.length])paths[sum]=paths[sum-region.cells.length].concat(region);
            const subset=paths[required];if(!subset)continue;const ids=new Set(subset.map(region=>region.id));
            let mergeEdges=0,matchCells=0,sizePenalty=0;
            for(const region of subset){matchCells+=region.color===color?region.cells.length:0;sizePenalty+=region.cells.length**2;
                for(const [other,boundary]of adjacency.get(region.id))if(ids.has(other)&&other>region.id)mergeEdges+=boundary;}
            const score=mergeEdges*required*20+matchCells*required+sizePenalty;
            if(!best||score<best.score)best={subset,score};
        }
        return best?.subset||null;
    }

    function blockCost(points,region,color,grid){
        const set=new Set(points);let cost=color===region.color?points.length*24:0;
        for(const p of points)for(const q of neighbors(p))if(!set.has(q)){
            const out=value(grid,q);if(out<=0)continue;
            const targetDistance=distance(region.color,value(target,q)),outputDistance=distance(color,out);
            const other=regionByCell.get(q),feature=region.cells.length<=24||other.cells.length<=24;
            cost+=color===out?(feature?180:18)
                :Math.max(0,Math.min(.35,targetDistance)-outputDistance)*(feature?80:7);
        }
        return cost;
    }

    function roleMergeOverflow(points,color,grid){
        const incoming=new Set(points),seen=new Set();let combined=points.length;
        for(const p of points)for(const q of connected(p))if(!incoming.has(q)&&!seen.has(q)&&value(grid,q)===color){
            const queue=[q];seen.add(q);
            for(let i=0;i<queue.length;i++)for(const next of connected(queue[i]))if(!incoming.has(next)&&!seen.has(next)&&value(grid,next)===color){seen.add(next);queue.push(next);}
            combined+=queue.length;
        }
        return Math.max(0,combined-roleCap.get(color));
    }


    function measure(a,b,threshold){
        let retained=0,sourceBoundary=0,extra=0,interior=0,lowContrast=0,plainBoundary=0,plainRetained=0;
        for(const edge of sourceEdges){const outA=value(b,edge.p),outB=value(b,edge.q),outDiff=outA!==outB;
            if(edge.different){sourceBoundary+=edge.weight;plainBoundary++;if(outDiff){retained+=edge.weight;plainRetained++;}
                if(!outDiff||distance(outA,outB)<.12)lowContrast+=edge.weight;
            }else{interior++;if(outDiff)extra++;}}
        const sourceStats=sourceComponentStats,outputStats=componentStats(b,threshold);
        let wholeCells=0,mainCells=0,newSmallPieces=0;
        for(const region of regions){const counts=new Map();for(const p of region.cells){const c=value(b,p);counts.set(c,(counts.get(c)||0)+1);}
            if(counts.size===1)wholeCells+=region.cells.length;
            else {const remaining=new Set(region.cells);while(remaining.size){const first=remaining.values().next().value,piece=[first];remaining.delete(first);
                for(let i=0;i<piece.length;i++)for(const q of connected(piece[i]))if(remaining.has(q)&&value(b,q)===value(b,first)){remaining.delete(q);piece.push(q);}
                if(piece.length<threshold)newSmallPieces++;}}
            mainCells+=Math.max(...counts.values());}
        // Large, locally thick regions approximate subject masses without naming objects.
        let subjectArea=0,backgroundLoss=0,fragmentation=0,contrastCuts=0,subjectEdges=0;
        for(const region of regions){
            if(region.cells.length<Math.max(25,total*.04))continue;
            const thick=region.cells.filter(p=>neighbors(p).filter(q=>value(a,q)===region.color).length>=3);
            if(thick.length<region.cells.length*.35)continue;
            subjectArea+=region.cells.length;
            const counts=new Map();
            for(const p of region.cells){const c=value(b,p);counts.set(c,(counts.get(c)||0)+1);
                backgroundLoss+=Math.max(0,Math.min(.25,backgroundContrast(region.color))-backgroundContrast(c));
                for(const q of neighbors(p))if(q>p&&value(a,q)===region.color){subjectEdges++;
                    if(c!==value(b,q))contrastCuts+=distance(c,value(b,q));}}
            fragmentation+=region.cells.length-Math.max(...counts.values());
        }
        return {subjectBackgroundLoss:backgroundLoss/Math.max(1,subjectArea),
            subjectFragmentation:fragmentation/Math.max(1,subjectArea),subjectContrastCuts:contrastCuts/Math.max(1,subjectEdges),
            edgeRecall:sourceBoundary?retained/sourceBoundary:1,edgePrecision:retained+extra?retained/(retained+extra):1,
            boundaryRecall:plainBoundary?plainRetained/plainBoundary:1,
            boundaryPrecision:plainRetained+extra?plainRetained/(plainRetained+extra):1,
            interiorSplit:interior?extra/interior:0,
            wholeRegionArea:wholeCells/total,regionPurity:mainCells/total,
            newSplitEdges:extra,sourceInteriorEdges:interior,lowContrastBoundaryRatio:lowContrast/Math.max(1,sourceBoundary),
            featureBoundaryLoss:featureRegions.length?featureRegions.reduce((sum,region)=>{
                const set=new Set(region.cells);let boundary=0,visible=0;
                for(const p of region.cells)for(const q of neighbors(p))if(value(target,q)>0&&!set.has(q)){boundary++;visible+=Number(value(b,p)!==value(b,q)&&distance(value(b,p),value(b,q))>=.12);}
                return sum+(1-visible/Math.max(1,boundary));
            },0)/featureRegions.length:0,featureRegions:featureRegions.length,roleOverflowRatio:outputStats.roleOverflow/Math.max(1,total),
            sourceComponents:sourceStats.components,outputComponents:outputStats.components,
            sourceSingletons:sourceStats.singletons,outputSingletons:outputStats.singletons,
            sourceSmallCells:sourceStats.smallCells,outputSmallCells:outputStats.smallCells,
            singletonRatio:outputStats.singletons/total,smallCellRatio:outputStats.smallCells/total,
            sourceSmallPieces:sourceStats.smallPieces,outputSmallPieces:outputStats.smallPieces,
            newSmallPieces,smallPieceIncrease:Math.max(0,outputStats.smallPieces-sourceStats.smallPieces)};
    }
    function componentStats(grid,threshold){const active=cells.filter(p=>value(grid,p)>0),seen=new Set();let components=0,smallPieces=0,roleOverflow=0,singletons=0,smallCells=0;
        for(const p of active){if(seen.has(p))continue;const q=[p];seen.add(p);for(let i=0;i<q.length;i++)for(const v of connected(q[i]))
            if(value(grid,v)>0&&!seen.has(v)&&value(grid,v)===value(grid,p)){seen.add(v);q.push(v);}
            components++;if(q.length===1)singletons++;if(q.length<threshold){smallPieces++;smallCells+=q.length;}roleOverflow+=Math.max(0,q.length-roleCap.get(value(grid,p)));}
        return {components,smallPieces,roleOverflow,singletons,smallCells};}
}

function buildRegions(target,cells,neighbors,value){
    const byColor=new Map(),seen=new Set();
    for(const p of cells){if(seen.has(p))continue;const color=value(target,p),q=[p];seen.add(p);
        for(let i=0;i<q.length;i++)for(const v of neighbors(q[i]))if(value(target,v)===color&&!seen.has(v)){seen.add(v);q.push(v);}
        const region={color,cells:q};if(!byColor.has(color))byColor.set(color,[]);byColor.get(color).push(region);}
    return byColor;
}

function paintSourceRegions(regions,quotas,grid,width,neighbors,minChunk,variant,saliency,edgeNeighbors=neighbors){
    let available=regions.map(r=>r.cells.slice());
    for(const [color,quota]of quotas.slice().sort((a,b)=>a[1]-b[1])){
        // Fill a quota from whole source components first. Only the remaining
        // difference may be carved as a connected piece of a larger component.
        const paths=new Array(quota+1);paths[0]=[];
        const order=available.map((cells,i)=>({cells,i})).sort((a,b)=>
            ((a.cells[0]+variant*17)%grid.length)-((b.cells[0]+variant*17)%grid.length));
        for(const {cells,i}of order)for(let n=quota;n>=cells.length;n--)
            if(!paths[n]&&paths[n-cells.length])paths[n]=paths[n-cells.length].concat(i);
        let selected=null;
        for(let n=quota;n>=0&&!selected;n--){
            if(!paths[n])continue;
            const indices=new Set(paths[n]),needed=quota-n;
            if(needed===0){selected={indices,donor:-1,piece:[],rest:[]};break;}
            if(needed<minChunk)continue;
            for(const {cells,i}of order){if(indices.has(i)||cells.length<needed+minChunk)continue;
                const split=carve(cells,needed,neighbors,minChunk,variant,saliency,()=>true,edgeNeighbors);
                if(split){selected={indices,donor:i,...split};break;}}
        }
        if(!selected)return false;
        const points=available.filter((_,i)=>selected.indices.has(i)).flat().concat(selected.piece);
        for(const p of points)grid[Math.floor(p/width)][p%width]=color;
        available=available.filter((_,i)=>!selected.indices.has(i)&&i!==selected.donor).concat(selected.rest);
    }
    return available.length===0;
}

function carve(component,size,neighbors,minChunk,variant,saliency,acceptPiece=()=>true,edgeNeighbors=neighbors){
    const set=new Set(component);
    const seeds=component.filter(p=>neighbors(p).some(q=>!set.has(q)));
    const candidates=[];
    for(let attempt=0;attempt<Math.min(16,seeds.length);attempt++){
        const root=seeds[(attempt*7+variant*11)%seeds.length],selected=new Set([root]),frontier=new Set(neighbors(root).filter(q=>set.has(q)));
        while(selected.size<size&&frontier.size){let best=null,bestScore=-Infinity;
            for(const p of frontier){const same=neighbors(p).filter(q=>selected.has(q)).length,degree=neighbors(p).filter(q=>set.has(q)).length;
                const shared=edgeNeighbors(p).filter(q=>selected.has(q)).length;
                const score=shared*12+same-degree+(((p^(variant*2654435761))>>>0)/4294967296);
                if(score>bestScore){bestScore=score;best=p;}}
            frontier.delete(best);selected.add(best);for(const q of neighbors(best))if(set.has(q)&&!selected.has(q))frontier.add(q);
        }
        if(selected.size!==size)continue;
        const rest=components(component.filter(p=>!selected.has(p)),neighbors);
        if(rest.some(q=>q.length<minChunk)||!acceptPiece([...selected]))continue;
        let cut=0,visualCut=0;for(const p of selected)for(const q of edgeNeighbors(p))if(set.has(q)&&!selected.has(q)){
            cut++;visualCut+=(saliency.get(p)||0)+(saliency.get(q)||0);}
        candidates.push({piece:[...selected],rest,score:cut+rest.length*4+visualCut*3});
    }
    return candidates.sort((a,b)=>a.score-b.score)[0]||null;
}

function components(points,neighbors){const left=new Set(points),result=[];while(left.size){const p=left.values().next().value,q=[p];left.delete(p);
    for(let i=0;i<q.length;i++)for(const v of neighbors(q[i]))if(left.has(v)){left.delete(v);q.push(v);}result.push(q);}return result;}
function countColors(grid){const result=new Map();for(const row of grid)for(const c of row)if(c>0)result.set(c,(result.get(c)||0)+1);return result;}
function trivialMetrics(grid,minChunk){let componentsCount=0,smallPieces=0;const h=grid.length,w=grid[0].length,seen=new Set();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*w+x,c=grid[y][x];if(c<=0||seen.has(p))continue;const q=[p];seen.add(p);
        for(let i=0;i<q.length;i++){const r=Math.floor(q[i]/w),k=q[i]%w;for(const [dy,dx]of CONNECTED_DIRS){const nr=r+dy,nc=k+dx,np=nr*w+nc;
            if(nr>=0&&nr<h&&nc>=0&&nc<w&&!seen.has(np)&&grid[nr][nc]===c){seen.add(np);q.push(np);}}}
        componentsCount++;if(q.length<minChunk)smallPieces++;}
    return {edgeRecall:1,edgePrecision:1,boundaryRecall:1,boundaryPrecision:1,interiorSplit:0,wholeRegionArea:1,regionPurity:1,
        newSplitEdges:0,sourceInteriorEdges:0,lowContrastBoundaryRatio:0,
        featureBoundaryLoss:0,featureRegions:0,roleOverflowRatio:0,
        sourceComponents:componentsCount,outputComponents:componentsCount,sourceSmallPieces:smallPieces,outputSmallPieces:smallPieces,newSmallPieces:0,smallPieceIncrease:0};}
function validateGrid(grid){if(!Array.isArray(grid)||!grid.length||!Array.isArray(grid[0])||!grid[0].length
    ||grid.some(row=>!Array.isArray(row)||row.length!==grid[0].length||row.some(c=>!Number.isInteger(c)||c<0)))throw new Error('Expected a rectangular nonnegative integer grid');}

function cohortKey(total,dominant,boundaryDensity){
    return `${total<400?'small':total<1000?'medium':'large'}:${dominant>.5?'majority':'balanced'}:${boundaryDensity>.4?'detailed':'solid'}`;
}

// Learn ranges of geometry, not just colour count or raw component totals.
// The optional profile is provided by the caller; no source dataset is loaded
// or written implicitly by the generator.
function learnProfile(levels){
    if(!Array.isArray(levels)||!levels.length)throw new Error('Reference levels are required');
    const cohorts=new Map(),all=[];
    for(const level of levels){
        const target=level.correctColorArr,grid=level.initRandomColorArr;
        validateGrid(target);validateGrid(grid);
        const h=target.length,w=target[0].length;
        if(grid.length!==h||grid[0].length!==w)throw new Error('Reference dimensions differ');
        const cells=[],inventory=countColors(target),actual=countColors(grid);
        if(inventory.size!==actual.size||[...inventory].some(([c,n])=>actual.get(c)!==n))throw new Error('Reference inventory differs');
        const value=(g,p)=>g[Math.floor(p/w)][p%w];
        const neighbors=p=>{const y=Math.floor(p/w),x=p%w;return DIRS.map(([dy,dx])=>[y+dy,x+dx])
            .filter(([r,c])=>r>=0&&r<h&&c>=0&&c<w).map(([r,c])=>r*w+c);};
        for(let p=0;p<h*w;p++){if((value(target,p)>0)!==(value(grid,p)>0))throw new Error('Reference outline differs');if(value(target,p)>0)cells.push(p);}
        if(!cells.length)throw new Error('Reference board is empty');
        let boundaries=0,retained=0,interiors=0,split=0,whole=0,pure=0;
        for(const p of cells)for(const q of neighbors(p))if(q>p&&value(target,q)>0){
            const different=value(grid,p)!==value(grid,q);
            if(value(target,p)!==value(target,q)){boundaries++;retained+=Number(different);}else{interiors++;split+=Number(different);}}
        const connected=p=>{const y=Math.floor(p/w),x=p%w;return CONNECTED_DIRS.map(([dy,dx])=>[y+dy,x+dx])
            .filter(([r,c])=>r>=0&&r<h&&c>=0&&c<w).map(([r,c])=>r*w+c);};
        for(const regions of buildRegions(target,cells,connected,value).values())for(const region of regions){
            const colors=new Map();for(const p of region.cells){const c=value(grid,p);colors.set(c,(colors.get(c)||0)+1);}
            if(colors.size===1)whole+=region.cells.length;pure+=Math.max(...colors.values());}
        const outputRegions=[...buildRegions(grid,cells,connected,value).values()].flat();
        const observation={boundaryRecall:boundaries?retained/boundaries:1,boundaryPrecision:retained+split?retained/(retained+split):1,
            singletonRatio:outputRegions.filter(r=>r.cells.length===1).length/cells.length,
            smallCellRatio:outputRegions.filter(r=>r.cells.length<DEFAULT_OPTIONS.minChunk).reduce((sum,r)=>sum+r.cells.length,0)/cells.length,
            interiorSplit:interiors?split/interiors:0,wholeRegionArea:whole/cells.length,regionPurity:pure/cells.length};
        const key=cohortKey(cells.length,Math.max(...inventory.values())/cells.length,boundaries/Math.max(1,boundaries+interiors));
        if(!cohorts.has(key))cohorts.set(key,[]);cohorts.get(key).push(observation);all.push(observation);
    }
    const summarize=rows=>({count:rows.length,ranges:Object.fromEntries(Object.keys(rows[0]).map(key=>{
        const values=rows.map(row=>row[key]).sort((a,b)=>a-b);
        return [key,{low:values[Math.floor((values.length-1)*.1)],high:values[Math.floor((values.length-1)*.9)]}];}))});
    return {version:2,count:all.length,overall:summarize(all),cohorts:Object.fromEntries([...cohorts]
        .filter(([,rows])=>rows.length>=5).map(([key,rows])=>[key,summarize(rows)]))};
}
function referencePenalty(metrics,reference){
    if(!reference)return 0;
    let penalty=0;
    for(const [key,range]of Object.entries(reference.ranges)){
        if(!Number.isFinite(range.low)||!Number.isFinite(range.high)||!Number.isFinite(metrics[key]))throw new Error('Invalid structure reference range');
        penalty+=['interiorSplit','singletonRatio','smallCellRatio'].includes(key)?Math.max(0,metrics[key]-range.high):Math.max(0,range.low-metrics[key]);
    }
    return penalty*6;
}
module.exports={generate,learnProfile,VERSION,DEFAULT_OPTIONS};
