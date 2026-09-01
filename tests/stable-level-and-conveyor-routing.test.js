'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const candidateDir = path.join(root, 'tools/latest-minigame-selected-300');
const authoredTimeOverrides = new Map([
    [3, 150], [4, 150], [5, 120], [6, 120], [9, 120], [10, 120], [14, 150], [15, 120],
]);
const formalCandidateLevelIds = new Map([[16, 17], [17, 16]]);

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

function countColors(grid) {
    const counts = new Map();
    for (const row of grid) {
        for (const colorId of row) {
            if (colorId > 0) counts.set(colorId, (counts.get(colorId) || 0) + 1);
        }
    }
    return [...counts.entries()].sort((left, right) => left[0] - right[0]);
}

const manifest = readJson('assets/LevelData/level-manifest.json');
assert.equal(manifest.levelCount, 300);
assert.equal(manifest.entries.length, 300);
const manifestByLevel = new Map(manifest.entries.map((entry) => [entry.levelId, entry]));
for (let levelId = 1; levelId <= 300; levelId += 1) {
    const candidateLevelId = formalCandidateLevelIds.get(levelId) || levelId;
    const formalBuffer = fs.readFileSync(path.join(root, `assets/LevelData/level_${levelId}.json`));
    const candidateBuffer = fs.readFileSync(path.join(candidateDir, `level_${candidateLevelId}.json`));
    const formalPayload = JSON.parse(formalBuffer.toString('utf8'));
    const candidatePayload = JSON.parse(candidateBuffer.toString('utf8'));
    const comparableCandidatePayload = candidateLevelId === levelId
        ? candidatePayload
        : { ...candidatePayload, levelId };
    const comparableFormalPayload = { ...formalPayload };
    delete comparableFormalPayload.Hard;
    if (levelId === 2) delete comparableFormalPayload.singleSelectionLimit;
    if (levelId >= 5 || authoredTimeOverrides.has(levelId)) comparableFormalPayload.timeLimit = comparableCandidatePayload.timeLimit;
    assert.deepEqual(
        comparableFormalPayload,
        comparableCandidatePayload,
        `formal level ${levelId} may differ only by approved metadata, timer policy, and L16/L17 order`,
    );
    if (authoredTimeOverrides.has(levelId)) {
        assert.equal(formalPayload.timeLimit, authoredTimeOverrides.get(levelId), `level ${levelId} authored timer override`);
    } else if (levelId >= 5) {
        const expectedTime = Math.min(150, Math.ceil(formalPayload.slotTotalCount / 200) * 30);
        assert.equal(formalPayload.timeLimit, expectedTime);
    }
    const level = readJson(`assets/LevelData/level_${levelId}.json`);
    assert.equal(
        level.singleSelectionLimit,
        levelId === 2 ? 18 : undefined,
        `only formal level 2 may override the single-selection limit`,
    );
    assert.equal(level.Hard, levelId === 3 ? 1 : 0, `level ${levelId} Hard flag`);
    assert.deepEqual(
        [level.levelId, level.conveyorCapacity],
        [levelId, 60],
        `level ${levelId} must keep a continuous ID and the formal conveyor capacity`,
    );
    assert.equal(level.correctColorArr.length, level.boardHeight, `level ${levelId} correct height`);
    assert.equal(level.initRandomColorArr.length, level.boardHeight, `level ${levelId} initial height`);
    assert.equal(level.correctColorArr.every((row) => row.length === level.boardWidth), true, `level ${levelId} correct width`);
    assert.equal(level.initRandomColorArr.every((row) => row.length === level.boardWidth), true, `level ${levelId} initial width`);
    assert.deepEqual(countColors(level.correctColorArr), countColors(level.initRandomColorArr), `level ${levelId} color population`);
    assert.equal(countColors(level.correctColorArr).reduce((sum, entry) => sum + entry[1], 0), level.slotTotalCount);
    assert.equal(Object.hasOwn(level, 'slotPolicy'), false, `level ${levelId} must not retain row policy`);
    const entry = manifestByLevel.get(levelId);
    assert.deepEqual(
        [entry?.Hard, entry?.boardWidth, entry?.boardHeight, entry?.timeLimit, entry?.slotTotalCount, entry?.conveyorCapacity],
        [level.Hard, level.boardWidth, level.boardHeight, level.timeLimit, level.slotTotalCount, 60],
        `level ${levelId} manifest metadata`,
    );
}

assert.deepEqual(
    readJson('assets/BootstrapBundle/LevelData/level_1.json'),
    readJson('assets/LevelData/level_1.json'),
    'bootstrap level 1 must mirror formal level data',
);

const session = read('assets/Scripts/Core/GameplaySessionController.ts');
assert.match(session, /validateConveyorCapacity\(data\.conveyorCapacity/);
assert.match(session, /const pchController = ensurePchConveyorGameplayController\(runtime\);/);
assert.match(session, /pchController\.start\(\);/);
assert.doesNotMatch(session, /usePchCoreGameplay|resolveSlotRowPolicy|new SlotModel|runtime\.renderSlots\(\)/);

const view = read('assets/Scripts/Core/GameplayViewController.ts');
assert.match(view, /const conveyorRoot = this\.getGameplayFixedGroup\('PchConveyorRoot'\);/);
assert.match(view, /conveyorRoot\.active = false;/);
assert.doesNotMatch(view, /SlotAreaGroup|runtime\.buildSlotArea\(/);
assert.match(view, /PCH conveyor missing after gameplay start/);

const controller = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
assert.match(controller, /this\.runtime\.levelData\?\.conveyorCapacity/);
assert.match(controller, /const PCH_EXPAND_CAPACITY = 12;/);
assert.match(controller, /normalLayout\.node\.active = true;/);
assert.match(controller, /compactLayout\.node\.active = false;/);
assert.match(controller, /const activeLayout = normalLayout;/);
assert.match(controller, /this\.prepareBeltPath\(2\);/);
assert.doesNotMatch(controller, /useCompactLayout/);

const rules = read('assets/Scripts/Core/PchConveyorRules.ts');
assert.match(rules, /this\.initialCarrierCount = capacity \/ this\.stackDepth;/);
assert.doesNotMatch(rules, /initialCarrierCount\s*=\s*20/);

const experimentService = read('assets/Scripts/Core/LevelExperimentService.ts');
assert.match(experimentService, /FRONT_LEVEL_EXPERIMENT_TREATMENT_ENABLED = false/);

const packageJson = readJson('package.json');
assert.equal(packageJson.scripts['sync:cdn:wechat:level_data:v1'], undefined);
assert.equal(packageJson.scripts['sync:cdn:wechat:level_data:v1:dry'], undefined);

console.log('stable-level-and-conveyor-routing.test.js passed');
