'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const levelDir = path.join(root, 'assets', 'LevelData');
const manifest = JSON.parse(fs.readFileSync(path.join(levelDir, 'level-manifest.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'generated_levels', 'dbt_time_rule_level_5_300_report.json'), 'utf8'));
const manifestById = new Map(manifest.entries.map(entry => [entry.levelId, entry]));
const expectedTime = filled => Math.min(150, Math.ceil(filled / 200) * 30);

assert.equal(manifest.levelCount, 300);
assert.deepEqual(report.range, [5, 300]);
assert.equal(report.formula, 'min(150, ceil(slotTotalCount / 200) * 30)');
assert.deepEqual(report.authoredOverrides, { 5: 120 });
assert.equal(report.count, 296);
assert.deepEqual(report.belowVerifiedProductionRange.map(row => row.levelId), [29, 38, 47]);

for (let levelId = 1; levelId <= 300; levelId += 1) {
    const level = JSON.parse(fs.readFileSync(path.join(levelDir, `level_${levelId}.json`), 'utf8'));
    assert.equal(level.levelId, levelId);
    assert.equal(manifestById.get(levelId)?.timeLimit, level.timeLimit, `level ${levelId} manifest time`);
    if (levelId === 5) {
        assert.equal(level.timeLimit, 120, 'level 5 authored timer override');
    } else if (levelId >= 6) {
        assert.equal(level.timeLimit, expectedTime(level.slotTotalCount), `level ${levelId} DBT time rule`);
    }
}

assert.deepEqual(
    [1, 2, 3, 4].map(levelId => JSON.parse(fs.readFileSync(path.join(levelDir, `level_${levelId}.json`), 'utf8')).timeLimit),
    [600, 300, 120, 120],
    'levels 1-4 must preserve their authored onboarding times',
);

console.log('dbt-mainline-time-rule.test.js passed');
