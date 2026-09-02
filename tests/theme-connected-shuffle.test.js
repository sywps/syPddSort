'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('../tools/shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const levelDir = path.join(root, 'assets', 'LevelData');
const referenceDir = path.join(root, 'tools', 'dbt');
const referenceLevels = Array.from({ length: 182 }, (_value, index) => (
    JSON.parse(fs.readFileSync(path.join(referenceDir, `level_${index + 1}.json`), 'utf8'))
));
const profile = shuffle.learnProfile(referenceLevels);
const levelFiles = fs.readdirSync(levelDir)
    .filter(name => /^zt_level_\d+\.json$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]));

assert.equal(levelFiles.length, 48, 'pixel puzzle must retain 48 levels');
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
    count: levelFiles.length,
    sameNeighborRatio: average('sameNeighborRatio'),
    singletonRatio: average('singletonRatio'),
    componentsPerColor: average('componentsPerColor'),
    fragmentRatio: averageFragmentRatio,
    worstFragmentRatio: Math.max(...fragmentRatios),
}, null, 2));
