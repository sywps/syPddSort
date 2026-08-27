'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('../tools/shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'assets', 'LevelData');
const outputDir = path.join(root, 'tools', 'latest-minigame-selected-300');
const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'selection_manifest.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'shuffle_report.json'), 'utf8'));
const sourceFiles = fs.readdirSync(sourceDir).filter(name => /^level_\d+\.json$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]));
const outputFiles = fs.readdirSync(outputDir).filter(name => /^level_\d+\.json$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]));
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const inventory = grid => {
    const counts = new Map();
    for (const row of grid) for (const color of row) if (color > 0) counts.set(color, (counts.get(color) || 0) + 1);
    return [...counts].sort((left, right) => left[0] - right[0]);
};

assert.equal(sourceFiles.length, 1643);
assert.equal(outputFiles.length, 300);
assert.deepEqual(outputFiles, Array.from({ length: 300 }, (_value, index) => `level_${index + 1}.json`));
assert.equal(manifest.levels.length, 300);
assert.equal(new Set(manifest.levels.map(row => `${row.sourceKind || 'mainline'}:${row.sourceId}`)).size, 300);
assert.equal(new Set(manifest.levels.map(row => row.metrics.patternHash)).size, 300);
assert.ok(fs.statSync(path.join(outputDir, 'selection_report.md')).size > 1000);

const sourceDigest = crypto.createHash('sha256');
for (const filename of sourceFiles) {
    sourceDigest.update(filename);
    sourceDigest.update(hash(fs.readFileSync(path.join(sourceDir, filename))));
}
assert.equal(sourceDigest.digest('hex'), manifest.summary.sourceCorpusDigest, 'source corpus must remain unchanged');

const required = ['levelId', 'boardWidth', 'boardHeight', 'timeLimit', 'slotTotalCount',
    'conveyorCapacity', 'correctColorArr', 'initRandomColorArr'];
const references = Array.from({ length: 182 }, (_value, index) =>
    JSON.parse(fs.readFileSync(path.join(root, 'tools', 'dbt', `level_${index + 1}.json`), 'utf8')));
const profile = shuffle.learnProfile(references);
let displacementTotal = 0;
for (const row of manifest.levels) {
    const isDbtReference = row.sourceKind === 'dbt_reference';
    const isDbtSelectedReference = row.sourceKind === 'dbt_selected_reference';
    const isExternalReference = isDbtReference || isDbtSelectedReference;
    const sourcePath = isExternalReference ? path.join(root, row.sourceFile) : path.join(sourceDir, row.sourceFile);
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const outputBuffer = fs.readFileSync(path.join(outputDir, row.outputFile));
    const output = JSON.parse(outputBuffer.toString('utf8'));
    for (const key of required) assert.ok(Object.hasOwn(output, key), `${row.outputFile} missing ${key}`);
    assert.equal(output.levelId, row.order);
    assert.equal(hash(outputBuffer), row.outputSha256);
    assert.ok(Number.isInteger(output.conveyorCapacity) && output.conveyorCapacity > 0);
    assert.equal(output.correctColorArr.length, output.boardHeight);
    assert.equal(output.initRandomColorArr.length, output.boardHeight);
    assert.ok(output.correctColorArr.every(line => line.length === output.boardWidth));
    assert.ok(output.initRandomColorArr.every(line => line.length === output.boardWidth));
    assert.deepEqual(inventory(output.initRandomColorArr), inventory(output.correctColorArr));
    shuffle.assertOutline(output.correctColorArr, output.initRandomColorArr);
    if (isDbtReference) {
        assert.equal(row.order, 2);
        assert.equal(row.shuffle.algorithm, 'DBT.reference-exact-copy');
        assert.equal(row.shuffle.preservedReferenceInit, true);
        assert.deepEqual(output, source, `${row.outputFile} exact DBT reference replica`);
    } else if (isDbtSelectedReference) {
        assert.equal(row.order, 4);
        assert.equal(row.sourceId, 10);
        assert.equal(row.shuffle.algorithm, 'DBTSelected.reference-copy-with-levelId-normalization');
        assert.deepEqual(row.shuffle.normalizedFields, ['levelId']);
        assert.deepEqual(output, { ...source, levelId: 4 }, `${row.outputFile} normalized DBT-selected replica`);
    } else {
        const regenerated = shuffle.generate(output.correctColorArr, {
            levelId: row.order,
            profile,
            outlineGrid: source.initRandomColorArr,
        });
        assert.deepEqual(regenerated, output.initRandomColorArr, `${row.outputFile} deterministic shuffle`);
        const normalizedSource = { ...source, levelId: row.order, initRandomColorArr: output.initRandomColorArr };
        assert.deepEqual(output, normalizedSource, `${row.outputFile} field preservation`);
    }
    const metrics = shuffle.metrics(output.correctColorArr, output.initRandomColorArr);
    assert.equal(metrics.outlineRetention, 1);
    displacementTotal += metrics.displacement;
}
assert.ok(displacementTotal / 300 >= 0.85);

const categoryRanges = {
    引导小局: [3, 5], 轻量恢复: [28, 34], 稀疏轮廓: [34, 42], 标准图案: [108, 120],
    碎片调度: [34, 42], 多色辨识: [14, 20], 巨幅满盘: [48, 58], 巨幅图案: [5, 9],
};
const tierRanges = { 舒缓: [72, 82], 稳定: [126, 138], 高压: [56, 66], 尖峰: [26, 34] };
for (const [name, [low, high]] of Object.entries(categoryRanges)) {
    assert.ok(manifest.summary.categoryCounts[name] >= low && manifest.summary.categoryCounts[name] <= high, name);
}
for (const [name, [low, high]] of Object.entries(tierRanges)) {
    assert.ok(manifest.summary.tierCounts[name] >= low && manifest.summary.tierCounts[name] <= high, name);
}
assert.equal(Object.values(manifest.summary.categoryCounts).reduce((sum, value) => sum + value, 0), 300);
assert.equal(Object.values(manifest.summary.tierCounts).reduce((sum, value) => sum + value, 0), 300);

for (let index = 0; index < manifest.levels.length; index += 1) {
    const current = manifest.levels[index];
    assert.ok(!manifest.levels.slice(index, index + 3).every(row => row.pressureTier === '尖峰'));
    if (current.pressureTier !== '尖峰') continue;
    const next = manifest.levels[index + 1];
    assert.ok(next && ['舒缓', '稳定'].includes(next.pressureTier), `peak ${current.order} relief tier`);
    assert.ok(next.metrics.filled < current.metrics.filled * 0.9
        || next.metrics.colors < current.metrics.colors
        || next.metrics.beansPerSecond < current.metrics.beansPerSecond * 0.9,
    `peak ${current.order} must materially release one pressure dimension`);
}
assert.ok(manifest.levels.slice(0, 10)
    .filter(row => row.sourceKind !== 'dbt_selected_reference')
    .every(row => row.metrics.colors <= 5));
assert.equal(manifest.levels[3].metrics.colors, 7, 'user-selected formal level 4 preserves its 7-color design');
const stages = manifest.summary.stages;
assert.ok(stages.at(-1).meanFilled > stages[0].meanFilled * 2);
assert.ok(stages.at(-1).meanColors > stages[0].meanColors);
assert.equal(report.count, 300);
assert.equal(report.referenceCount, 182);
assert.equal(report.after.outlineRetention, 1);

console.log('Latest mini-game 300-level acceptance tests passed');
