'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('../tools/shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const levelDir = path.join(root, 'assets', 'LevelData');
const referenceDir = path.join(root, 'tools', 'dbt');
const LEVEL_COUNT = 48;

function parseLevelRange(args) {
    let firstLevelId = 1;
    let lastLevelId = LEVEL_COUNT;
    for (const arg of args) {
        const match = /^--(from|to)=(\d+)$/.exec(arg);
        assert.ok(match, `unsupported argument: ${arg}`);
        const levelId = Number(match[2]);
        assert.ok(Number.isInteger(levelId) && levelId >= 1 && levelId <= LEVEL_COUNT, `level range must stay within 1-${LEVEL_COUNT}`);
        if (match[1] === 'from') firstLevelId = levelId;
        if (match[1] === 'to') lastLevelId = levelId;
    }
    assert.ok(firstLevelId <= lastLevelId, '--from must not exceed --to');
    return { firstLevelId, lastLevelId };
}
const referenceLevels = Array.from({ length: 182 }, (_value, index) => (
    JSON.parse(fs.readFileSync(path.join(referenceDir, `level_${index + 1}.json`), 'utf8'))
));
const profile = shuffle.learnProfile(referenceLevels);
const { firstLevelId, lastLevelId } = parseLevelRange(process.argv.slice(2));
const levelFiles = fs.readdirSync(levelDir)
    .filter(name => {
        const match = /^zt_level_(\d+)\.json$/.exec(name);
        if (!match) return false;
        const levelId = Number(match[1]);
        return levelId >= firstLevelId && levelId <= lastLevelId;
    })
    .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]));

assert.equal(levelFiles.length, lastLevelId - firstLevelId + 1, 'theme shuffle range must be continuous');
const metrics = [];
const fragmentRatios = [];
for (const filename of levelFiles) {
    const levelId = Number(filename.match(/\d+/)[0]);
    const level = JSON.parse(fs.readFileSync(path.join(levelDir, filename), 'utf8'));
    const expected = shuffle.generate(level.correctColorArr, {
        levelId,
        profile,
        outlineGrid: level.correctColorArr,
        strictMismatch: true,
    });
    assert.deepEqual(level.initRandomColorArr, expected, `${filename} deterministic connected shuffle`);
    assert.doesNotThrow(() => shuffle.assertOutline(level.correctColorArr, level.initRandomColorArr), `${filename} outline`);
    assert.deepEqual(
        [...shuffle.colorInventory(level.initRandomColorArr)].sort(),
        [...shuffle.colorInventory(level.correctColorArr)].sort(),
        `${filename} color inventory`,
    );
    assert.equal(
        shuffle.matchingCellCount(level.correctColorArr, level.initRandomColorArr),
        shuffle.minimumMatchCount(level.correctColorArr),
        `${filename} minimum possible target-color matches`,
    );
    metrics.push(shuffle.metrics(level.correctColorArr, level.initRandomColorArr));
    const activeCellCount = level.correctColorArr.flat().filter(color => color > 0).length;
    fragmentRatios.push(shuffle.fragmentScore(level.correctColorArr, level.initRandomColorArr).smallCells / activeCellCount);
}

const average = key => metrics.reduce((sum, metric) => sum + metric[key], 0) / metrics.length;
const averageFragmentRatio = fragmentRatios.reduce((sum, ratio) => sum + ratio, 0) / fragmentRatios.length;
assert.ok(average('sameNeighborRatio') >= 0.79, 'theme shuffle must retain strong same-color connectivity');
assert.ok(average('singletonRatio') <= 0.01, 'theme shuffle must avoid scattered singleton beans');
assert.ok(average('componentsPerColor') <= 6.1, 'theme shuffle must consolidate split color groups');
assert.ok(averageFragmentRatio <= 0.03, 'theme shuffle must avoid small fragmented color groups');
assert.ok(Math.max(...fragmentRatios) <= 0.18, 'no theme level may retain an excessively fragmented layout');
console.log(JSON.stringify({
    firstLevelId,
    lastLevelId,
    count: levelFiles.length,
    sameNeighborRatio: average('sameNeighborRatio'),
    singletonRatio: average('singletonRatio'),
    componentsPerColor: average('componentsPerColor'),
    fragmentRatio: averageFragmentRatio,
    worstFragmentRatio: Math.max(...fragmentRatios),
}, null, 2));
