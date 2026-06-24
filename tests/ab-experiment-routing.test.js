const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

function slotPolicy(relPath) {
    return readJson(relPath).slotPolicy;
}

const experimentUrlParam = read('assets/Scripts/Core/ExperimentUrlParam.ts');
assert.ok(experimentUrlParam.includes("params.get('ab')"), 'experiment overrides must use the combined ab parameter');
assert.ok(experimentUrlParam.includes("split(';')"), 'combined ab parameter must support multiple experiments');
assert.ok(experimentUrlParam.includes("entry.split(',')"), 'combined ab parameter entries must use experimentId,bucket');

const analytics = read('assets/Scripts/Core/AnalyticsMgr.ts');
assert.ok(analytics.includes("TUTORIAL_EXPERIMENT_ID = 'tutorial_exp'"), 'tutorial experiment id must be tutorial_exp');
assert.ok(analytics.includes("type TutorialExperimentBucket = 'A' | 'B' | 'C' | 'D' | 'NULL'"), 'tutorial experiment must keep A/B/C/D buckets plus NULL before openid');
assert.ok(analytics.includes("hashBucket < 25 ? 'A'"), 'tutorial experiment must allocate bucket A');
assert.ok(analytics.includes("hashBucket < 50 ? 'B'"), 'tutorial experiment must allocate bucket B');
assert.ok(analytics.includes("hashBucket < 75 ? 'C'"), 'tutorial experiment must allocate bucket C');
assert.ok(analytics.includes("this.tutorialExperiment.bucket === 'C' || this.tutorialExperiment.bucket === 'D'"), 'tutorial treatment must be C/D');

const tutorialGuide = read('assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts');
assert.ok(tutorialGuide.includes('AnalyticsMgr.inst.isTutorialExperimentTreatment()'), 'tutorial experiment must affect guide runtime behavior');
assert.ok(tutorialGuide.includes('handleTutorialRelaxedTap'), 'tutorial treatment must enable relaxed guide tap handling');

const levelCdn = read('assets/Scripts/Core/LevelDataCdnService.ts');
assert.ok(levelCdn.includes("export type LevelExperimentBucket = 'A' | 'B' | 'C' | 'D'"), 'level experiment must expose A/B/C/D buckets');
assert.ok(levelCdn.includes("LEVEL_EXPERIMENT_BUCKET_C_RANGE: [number, number] = [2, 10]"), 'level experiment bucket C must cover levels 2-10');
assert.ok(levelCdn.includes("LEVEL_EXPERIMENT_BUCKET_D_RANGE: [number, number] = [2, 20]"), 'level experiment bucket D must cover levels 2-20');
assert.ok(levelCdn.includes("bucket === 'A' || bucket === 'B' ? 'baseline' : 'treatment'"), 'level experiment A/B must remain baseline and C/D treatment');
assert.ok(levelCdn.includes('this.shouldUseLevelExperiment(levelId, prefix, assignment)'), 'level experiment event context must use the resolved bucket range');
assert.ok(levelCdn.includes('normalizedLevelId >= range[0] && normalizedLevelId <= range[1]'), 'level experiment must gate CDN use by active bucket range');

const session = read('assets/Scripts/Core/GameplaySessionController.ts');
assert.ok(session.includes('LevelDataCdnService.inst.getLevelExperimentAssignment()'), 'gameplay must read level experiment assignment');
assert.ok(session.includes('tutorialGateLevelId === 2 && !isLevelExperimentTreatment'), 'level 2 guide must stay on baseline level experiment only');
assert.ok(session.includes('tutorialGateLevelId === 3 && isLevelExperimentTreatment'), 'level experiment treatment must move slot intro to level 3');
assert.ok(session.includes('LevelDataCdnService.inst.getLevelExperimentEventContext'), 'analytics context must prefer active level experiment bucket');

assert.deepStrictEqual(slotPolicy('assets/LevelData/level_1.json'), {
    defaultRows: 1,
    freeUnlockRows: 0,
    adUnlockRows: 0,
}, 'stable level 1 guide level must keep 1/0/0 slot policy');
assert.deepStrictEqual(slotPolicy('assets/LevelData/level_2.json'), {
    defaultRows: 1,
    freeUnlockRows: 1,
    adUnlockRows: 0,
}, 'stable level 2 guide level must keep free slot unlock policy');
for (let level = 3; level <= 10; level++) {
    assert.deepStrictEqual(slotPolicy(`assets/LevelData/level_${level}.json`), {
        defaultRows: 2,
        freeUnlockRows: 0,
        adUnlockRows: 1,
    }, `stable level ${level} must keep 2/0/1 slot policy`);
}
for (let level = 11; level <= 20; level++) {
    assert.deepStrictEqual(slotPolicy(`assets/LevelData/level_${level}.json`), {
        defaultRows: 1,
        freeUnlockRows: 0,
        adUnlockRows: 1,
    }, `stable level ${level} must keep 1/0/1 slot policy`);
}

assert.deepStrictEqual(slotPolicy('temp/levels_exp/level_1.json'), {
    defaultRows: 1,
    freeUnlockRows: 0,
    adUnlockRows: 0,
}, 'experiment level 1 must keep first-level guide slot policy');
assert.deepStrictEqual(slotPolicy('temp/levels_exp/level_2.json'), {
    defaultRows: 1,
    freeUnlockRows: 0,
    adUnlockRows: 1,
}, 'experiment level 2 must use the level-exp slot policy and not trigger the old free guide');
assert.deepStrictEqual(slotPolicy('temp/levels_exp/level_3.json'), {
    defaultRows: 2,
    freeUnlockRows: 1,
    adUnlockRows: 0,
}, 'experiment level 3 must trigger the free slot intro policy');
for (let level = 2; level <= 20; level++) {
    assert.ok(fs.existsSync(path.join(root, `temp/levels_exp/level_${level}.json`)), `experiment level ${level} data must exist`);
    const policy = slotPolicy(`temp/levels_exp/level_${level}.json`);
    assert.ok(policy && typeof policy === 'object', `experiment level ${level} must declare slotPolicy`);
}

console.log('ab-experiment-routing.test.js passed');
