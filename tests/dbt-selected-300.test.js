'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'tools', 'dbt-selected-300');
const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'selection_manifest.json'), 'utf8'));
const shuffleReport = JSON.parse(fs.readFileSync(path.join(outputDir, 'shuffle_report.json'), 'utf8'));
const levelFiles = fs.readdirSync(outputDir).filter((name) => /^level_\d+\.json$/.test(name));
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const inventory = (grid) => {
    const counts = new Map();
    for (const row of grid) for (const color of row) if (color > 0) counts.set(color, (counts.get(color) || 0) + 1);
    return [...counts].sort((left, right) => left[0] - right[0]);
};

assert.equal(manifest.methodVersion, 2);
assert.equal(manifest.summary.count, 300);
assert.equal(manifest.levels.length, 300);
assert.equal(levelFiles.length, 300);
assert.equal(new Set(manifest.levels.map((level) => level.sourceId)).size, 300);
assert.equal(new Set(manifest.levels.map((level) => level.metrics.patternHash)).size, 300);
assert.deepEqual(
    manifest.levels.map((level) => level.order),
    Array.from({ length: 300 }, (_value, index) => index + 1),
);

for (const selected of manifest.levels) {
    assert.equal(selected.sourceFile, `level_${selected.sourceId}.json`);
    assert.equal(selected.outputFile, `level_${selected.order}.json`);
    const outputBuffer = fs.readFileSync(path.join(outputDir, selected.outputFile));
    assert.match(selected.sourceSha256, /^[0-9a-f]{64}$/, `${selected.sourceFile} source provenance hash`);
    assert.equal(hash(outputBuffer), selected.outputSha256, `${selected.outputFile} output checksum`);
    const level = JSON.parse(outputBuffer.toString('utf8'));
    assert.equal(level.levelId, selected.order, `${selected.outputFile} continuous internal ID`);
    assert.equal(selected.shuffle.algorithm, 'ControlledShuffle.learned-paired-cohesion-v3');
    assert.equal(selected.shuffle.seed, 20260827 + selected.order * 7919);
    assert.equal(selected.shuffle.after.outlineRetention, 1);
    assert.ok(Number.isInteger(level.conveyorCapacity) && level.conveyorCapacity > 0);
    assert.equal(level.correctColorArr.length, level.boardHeight);
    assert.equal(level.initRandomColorArr.length, level.boardHeight);
    assert.deepEqual(inventory(level.initRandomColorArr), inventory(level.correctColorArr));
}

assert.deepEqual(
    levelFiles.sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0])),
    Array.from({ length: 300 }, (_value, index) => `level_${index + 1}.json`),
);

const categoryTotal = Object.values(manifest.summary.matchedDbtCategoryCounts)
    .reduce((sum, value) => sum + value, 0);
const tierTotal = Object.values(manifest.summary.matchedDbtTierCounts)
    .reduce((sum, value) => sum + value, 0);
assert.equal(categoryTotal, 300);
assert.equal(tierTotal, 300);
assert.equal(shuffleReport.count, 300);
assert.equal(shuffleReport.methodVersion, 3);
assert.equal(shuffleReport.referenceCount, 182);
assert.equal(shuffleReport.after.outlineRetention, 1);
assert.ok(shuffleReport.after.displacement >= 0.85);
assert.ok(shuffleReport.after.similarCountSwapRatio >= 0.3);

console.log('DBT-like 300-level selection tests passed');
