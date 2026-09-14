'use strict';
const assert=require('node:assert/strict');
const {coopHalfLevel,coopLevelHash}=require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const {BoardModel}=require('../cloudfunctions/coopService/runtime/BoardModel');
const {PchConveyorRules}=require('../cloudfunctions/coopService/runtime/PchConveyorRules');
for(let id=2;id<=20;id++) {
    const full=require(`../assets/LevelData/coop_level_${id}.json`);
    const original=JSON.stringify(full),a=coopHalfLevel(full,'creator'),b=coopHalfLevel(full,'collaborator');
    const rulesA=new PchConveyorRules(new BoardModel(a),60),rulesB=new PchConveyorRules(new BoardModel(b),60);
    for(let r=0;r<56;r++)for(let c=0;c<64;c++) {
        assert.equal(a.correctColorArr[r][c]+b.correctColorArr[r][c],full.correctColorArr[r][c]);
        assert(!(a.correctColorArr[r][c] && b.correctColorArr[r][c]));
        if(full.coopRegions[r][c]!==1)assert.equal(rulesA.selectBoard(r,c),null,'A cannot select partner or empty cells');
        if(full.coopRegions[r][c]!==2)assert.equal(rulesB.selectBoard(r,c),null,'B cannot select partner or empty cells');
    }
    const changed=JSON.parse(original);
    const r=changed.coopRegions.findIndex(row=>row.includes(1)),c=changed.coopRegions[r].indexOf(1);
    changed.coopRegions[r][c]=2;
    assert.notEqual(coopLevelHash(changed),coopLevelHash(full),'partition changes invalidate the session hash');
    changed.coopRegions[r][c]=0;
    assert.throws(()=>coopHalfLevel(changed,'creator'),/归属/);
    changed.coopRegions[r][c]=3;
    assert.throws(()=>coopHalfLevel(changed,'creator'),/归属/);
    changed.coopRegions.pop();
    assert.throws(()=>coopHalfLevel(changed,'creator'),/高度/);
    assert.equal(JSON.stringify(full),original);
}
console.log('COOP_REGIONS_PASSED: 19 boards, exhaustive disjoint coverage and partner input rejection');
