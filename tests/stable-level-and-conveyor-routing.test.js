'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

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

const expectedFirst20 = [
    [1, 14, 12, 600, 24],
    [2, 12, 12, 600, 96],
    [3, 23, 32, 210, 501],
    [4, 20, 27, 150, 401],
    [5, 26, 30, 120, 503],
    [6, 21, 30, 120, 245],
    [7, 27, 27, 120, 343],
    [8, 32, 34, 150, 629],
    [9, 22, 25, 120, 347],
    [10, 35, 32, 120, 701],
    [11, 37, 32, 150, 850],
    [12, 33, 35, 120, 857],
    [13, 30, 39, 150, 821],
    [14, 35, 35, 120, 755],
    [15, 29, 29, 150, 841],
    [16, 34, 40, 150, 888],
    [17, 35, 40, 150, 945],
    [18, 30, 37, 150, 808],
    [19, 37, 40, 150, 960],
    [20, 29, 30, 150, 870],
];

const manifest = readJson('assets/LevelData/level-manifest.json');
const manifestByLevel = new Map(manifest.entries.map((entry) => [entry.levelId, entry]));
for (const [levelId, width, height, timeLimit, beanCount] of expectedFirst20) {
    const level = readJson(`assets/LevelData/level_${levelId}.json`);
    assert.deepEqual(
        [level.levelId, level.boardWidth, level.boardHeight, level.timeLimit, level.slotTotalCount, level.conveyorCapacity],
        [levelId, width, height, timeLimit, beanCount, 60],
        `level ${levelId} must use the approved adjusted payload and new conveyor`,
    );
    assert.equal(level.correctColorArr.length, height, `level ${levelId} correct height`);
    assert.equal(level.initRandomColorArr.length, height, `level ${levelId} initial height`);
    assert.equal(level.correctColorArr.every((row) => row.length === width), true, `level ${levelId} correct width`);
    assert.equal(level.initRandomColorArr.every((row) => row.length === width), true, `level ${levelId} initial width`);
    assert.deepEqual(countColors(level.correctColorArr), countColors(level.initRandomColorArr), `level ${levelId} color population`);
    assert.equal(countColors(level.correctColorArr).reduce((sum, entry) => sum + entry[1], 0), beanCount);
    assert.equal(Object.hasOwn(level, 'slotPolicy'), false, `level ${levelId} must not retain row policy`);
    const entry = manifestByLevel.get(levelId);
    assert.deepEqual(
        [entry?.boardWidth, entry?.boardHeight, entry?.timeLimit, entry?.slotTotalCount, entry?.conveyorCapacity],
        [width, height, timeLimit, beanCount, 60],
        `level ${levelId} manifest metadata`,
    );
}
assert.equal(Object.hasOwn(readJson('assets/LevelData/level_7.json'), 'initShuffleSeed'), false, 'level 7 must drop the stale seed after layout replacement');

assert.deepEqual(
    readJson('assets/BootstrapBundle/LevelData/level_1.json'),
    readJson('assets/LevelData/level_1.json'),
    'bootstrap level 1 must mirror formal level data',
);

const session = read('assets/Scripts/Core/GameplaySessionController.ts');
assert.match(session, /validateConveyorCapacity\(data\.conveyorCapacity/);
assert.match(session, /ensurePchConveyorGameplayController\(runtime\)\.start\(\)/);
assert.doesNotMatch(session, /usePchCoreGameplay|resolveSlotRowPolicy|new SlotModel|runtime\.renderSlots\(\)/);

const view = read('assets/Scripts/Core/GameplayViewController.ts');
assert.match(view, /const conveyorRoot = this\.getGameplayFixedGroup\('PchConveyorRoot'\);/);
assert.match(view, /conveyorRoot\.active = false;/);
assert.doesNotMatch(view, /SlotAreaGroup|runtime\.buildSlotArea\(/);
assert.match(view, /PCH conveyor missing after gameplay start/);

const controller = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
assert.match(controller, /this\.runtime\.levelData\?\.conveyorCapacity/);
assert.match(controller, /const PCH_EXPAND_CAPACITY = 12;/);

const rules = read('assets/Scripts/Core/PchConveyorRules.ts');
assert.match(rules, /this\.initialCarrierCount = capacity \/ this\.stackDepth;/);
assert.doesNotMatch(rules, /initialCarrierCount\s*=\s*20/);

const experimentService = read('assets/Scripts/Core/LevelExperimentService.ts');
assert.match(experimentService, /FRONT_LEVEL_EXPERIMENT_TREATMENT_ENABLED = false/);

const packageJson = readJson('package.json');
assert.equal(packageJson.scripts['sync:cdn:wechat:level_data:v1'], undefined);
assert.equal(packageJson.scripts['sync:cdn:wechat:level_data:v1:dry'], undefined);

console.log('stable-level-and-conveyor-routing.test.js passed');
