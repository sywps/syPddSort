'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const {OUT,render}=require('./generate-coop-variety-levels');
const {coopHalfLevel,coopRegionGrid,coopLevelHash,COOP_MAX_ELAPSED_MS}=require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const {PvpHumanReplay}=require('../cloudfunctions/coopService/runtime/PvpHumanReplay');
const {controllerReplay}=require('../tests/pvp-human-replay-fixture');
const shuffle=require('./shuffle-comparison');
const manifest=JSON.parse(fs.readFileSync(path.join(OUT,'manifest.json')));
const reports=[];
for(let page=0;page<2;page++) {
    const sheet=new PNG({width:64*4*3,height:56*4*5});
    sheet.data.fill(255);
    for(let row=0;row<5;row++) {
        const id=2+page*5+row;
        const full=require(`../assets/LevelData/coop_level_${id}.json`);
        [full.correctColorArr,coopRegionGrid(full,'creator'),coopRegionGrid(full,'collaborator')].forEach((grid,col)=>{
            const p=PNG.sync.read(render(grid,4));
            PNG.bitblt(p,sheet,0,0,p.width,p.height,col*p.width,row*p.height);
        });
    }
    fs.writeFileSync(path.join(OUT,`partitions-${page+1}.png`),PNG.sync.write(sheet));
}
if(process.argv.includes('--render-only'))process.exit(0);
assert.equal(manifest.levels.length,10);
assert(new Set(manifest.levels.map(e=>e.split.type)).size>=5);
for(const entry of manifest.levels) {
    const raw=fs.readFileSync(path.join(__dirname,'../assets/LevelData',entry.file));
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),entry.sha256);
    const full=JSON.parse(raw),parts=[];
    const before=JSON.stringify(full);
    assert(full.correctColorArr.flat().filter(Boolean).length>1000);
    for(const role of ['creator','collaborator']) {
        const part=coopHalfLevel(full,role);
        shuffle.assertOutline(part.correctColorArr,part.initRandomColorArr);
        const initialMatches=shuffle.matchingCellCount(part.correctColorArr,part.initRandomColorArr);
        assert.equal(initialMatches,shuffle.minimumMatchCount(part.correctColorArr), 'initial matches must be the inventory-theoretical minimum');
        const fixture=controllerReplay({...part,timeLimit:600});
        assert.equal(fixture.terminalType,'PASS',`${entry.name} ${role} must solve using actual controller`);
        const replay=new PvpHumanReplay(part,COOP_MAX_ELAPSED_MS,true);
        let peak=0;
        for(const event of fixture.envelope.events){replay.apply(event);peak=Math.max(peak,replay.rules.bufferCount);}
        assert(replay.board.isAllLocked(),`${entry.name} ${role} server replay incomplete`);
        assert.equal(replay.rules.bufferCount,0);
        const beans=part.correctColorArr.flat().filter(Boolean).length;
        assert.equal(beans,role==='creator'?entry.creatorBeanCount:entry.collaboratorBeanCount);
        parts.push({role,beans,initialMatches,peak,elapsedMs:replay.completedAt,events:fixture.envelope.events.length});
        fs.writeFileSync(path.join(OUT,`solution-${entry.levelId}-${role}.json`),JSON.stringify(fixture.envelope.events));
    }
    assert.equal(parts.reduce((n,p)=>n+p.beans,0),entry.beanCount);
    assert.equal(JSON.stringify(full),before);
    reports.push({levelId:entry.levelId,name:entry.name,beanCount:entry.beanCount,hash:coopLevelHash(full),parts});
    console.log('PASS',entry.name,JSON.stringify(parts));
}
fs.writeFileSync(path.join(OUT,'validation.json'),JSON.stringify({passed:true,scope:'data + actual controller and server replay; no device proof',levels:reports},null,2));
