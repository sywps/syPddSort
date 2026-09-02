'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('./shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const levelDir = path.join(root, 'assets', 'LevelData');
const referenceDir = path.join(root, 'tools', 'dbt');
const LEVEL_COUNT = 48;
const ALGORITHM = 'ControlledShuffle.theme-strict-connected-v2';

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

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function inventoryObject(grid) {
    return Object.fromEntries([...shuffle.colorInventory(grid)].sort((left, right) => left[0] - right[0]));
}

function average(rows, key) {
    return rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
}

function writeWithRetry(file, text) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            fs.writeFileSync(file, text);
            return;
        } catch (error) {
            lastError = error;
            if (attempt < 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        }
    }
    throw lastError;
}

const referenceLevels = Array.from({ length: 182 }, (_value, index) => (
    readJson(path.join(referenceDir, `level_${index + 1}.json`))
));
const profile = shuffle.learnProfile(referenceLevels);
assert.equal(profile.count, 182, 'expected all 182 拼成彩虹 reference levels');
const { firstLevelId, lastLevelId } = parseLevelRange(process.argv.slice(2));

const writes = [];
const metrics = [];
const constrainedLevels = [];
for (let levelId = firstLevelId; levelId <= lastLevelId; levelId += 1) {
    const filename = `zt_level_${levelId}.json`;
    const file = path.join(levelDir, filename);
    const level = readJson(file);
    assert.equal(level.levelId, levelId, `${filename} levelId`);
    const generated = shuffle.generate(level.correctColorArr, {
        levelId,
        profile,
        outlineGrid: level.correctColorArr,
        strictMismatch: true,
    });
    assert.doesNotThrow(() => shuffle.assertOutline(level.correctColorArr, generated), `${filename} outline`);
    assert.deepEqual(inventoryObject(generated), inventoryObject(level.correctColorArr), `${filename} inventory`);
    const matchCount = shuffle.matchingCellCount(level.correctColorArr, generated);
    const minimumMatches = shuffle.minimumMatchCount(level.correctColorArr);
    assert.equal(matchCount, minimumMatches, `${filename} theoretical minimum matches`);
    const nextLevel = { ...level, initRandomColorArr: generated };
    writes.push({ file, text: `${JSON.stringify(nextLevel, null, 2)}\n` });
    metrics.push(shuffle.metrics(level.correctColorArr, generated));
    if (minimumMatches > 0) constrainedLevels.push({ levelId, minimumMatches });
}

writes.forEach(({ file, text }) => writeWithRetry(file, text));
console.log(JSON.stringify({
    algorithm: ALGORITHM,
    firstLevelId,
    lastLevelId,
    levelCount: writes.length,
    constrainedLevels,
    metrics: {
        displacement: average(metrics, 'displacement'),
        outlineRetention: average(metrics, 'outlineRetention'),
        sameNeighborRatio: average(metrics, 'sameNeighborRatio'),
        singletonRatio: average(metrics, 'singletonRatio'),
        componentsPerColor: average(metrics, 'componentsPerColor'),
    },
}, null, 2));
