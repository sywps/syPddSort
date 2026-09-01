'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const levelDir = path.join(root, 'assets', 'LevelData');
const manifest = JSON.parse(fs.readFileSync(path.join(levelDir, 'level-manifest.json'), 'utf8'));
const manifestById = new Map(manifest.entries.map(entry => [entry.levelId, entry]));
const expectedTime = filled => Math.min(150, Math.ceil(filled / 200) * 30);
const authoredTimeOverrides = new Map([
    [3, 150], [4, 150], [5, 120], [6, 120], [9, 120], [10, 120], [14, 150], [15, 120],
]);
const dbtLevels = [];

assert.equal(manifest.levelCount, 300);

for (let levelId = 1; levelId <= 300; levelId += 1) {
    const level = JSON.parse(fs.readFileSync(path.join(levelDir, `level_${levelId}.json`), 'utf8'));
    assert.equal(level.levelId, levelId);
    assert.equal(manifestById.get(levelId)?.timeLimit, level.timeLimit, `level ${levelId} manifest time`);
    if (levelId >= 5) dbtLevels.push(level);
    if (authoredTimeOverrides.has(levelId)) {
        assert.equal(level.timeLimit, authoredTimeOverrides.get(levelId), `level ${levelId} authored timer override`);
    } else if (levelId >= 5) {
        assert.equal(level.timeLimit, expectedTime(level.slotTotalCount), `level ${levelId} DBT time rule`);
    }
}

assert.equal(dbtLevels.length, 296);
assert.deepEqual(
    dbtLevels.filter(level => level.timeLimit < 90).map(level => level.levelId),
    [29, 38, 47],
    'DBT levels below the verified 90-second production floor',
);

assert.deepEqual(
    [1, 2, 3, 4].map(levelId => JSON.parse(fs.readFileSync(path.join(levelDir, `level_${levelId}.json`), 'utf8')).timeLimit),
    [600, 300, 150, 150],
    'levels 1-4 must preserve their authored onboarding times',
);

console.log('dbt-mainline-time-rule.test.js passed');
