'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('../tools/shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const formalDir = path.join(root, 'assets', 'LevelData');
const outputDir = path.join(root, 'tools', 'latest-minigame-selected-300');
const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'selection_manifest.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'shuffle_report.json'), 'utf8'));
const formalFiles = fs.readdirSync(formalDir).filter(name => /^level_\d+\.json$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]));
const outputFiles = fs.readdirSync(outputDir).filter(name => /^level_\d+\.json$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]));
const authoredTimeOverrides = new Map([
    [3, 150], [4, 150], [6, 120], [9, 120], [10, 120], [14, 150],
]);
const formalCandidateLevelIds = new Map([[16, 17], [17, 16]]);
const inventory = grid => {
    const counts = new Map();
    for (const row of grid) for (const color of row) if (color > 0) counts.set(color, (counts.get(color) || 0) + 1);
    return [...counts].sort((left, right) => left[0] - right[0]);
};

assert.equal(formalFiles.length, 300);
assert.equal(outputFiles.length, 300);
assert.deepEqual(formalFiles, outputFiles);
assert.deepEqual(outputFiles, Array.from({ length: 300 }, (_value, index) => `level_${index + 1}.json`));
assert.equal(manifest.levels.length, 300);
assert.equal(new Set(manifest.levels.map(row => `${row.sourceKind || 'mainline'}:${row.sourceId}`)).size, 300);
assert.equal(new Set(manifest.levels.map(row => row.metrics.patternHash)).size, 300);
assert.ok(fs.statSync(path.join(outputDir, 'selection_report.md')).size > 1000);

for (const filename of outputFiles) {
    const levelId = Number(filename.match(/\d+/)[0]);
    const candidateLevelId = formalCandidateLevelIds.get(levelId) || levelId;
    const formal = JSON.parse(fs.readFileSync(path.join(formalDir, filename), 'utf8'));
    const candidate = JSON.parse(fs.readFileSync(path.join(outputDir, `level_${candidateLevelId}.json`), 'utf8'));
    const comparableCandidate = candidateLevelId === levelId ? candidate : { ...candidate, levelId };
    const comparableFormal = { ...formal };
    delete comparableFormal.Hard;
    if (levelId === 2) delete comparableFormal.singleSelectionLimit;
    if (levelId >= 5 || authoredTimeOverrides.has(levelId)) comparableFormal.timeLimit = comparableCandidate.timeLimit;
    assert.deepEqual(
        comparableFormal,
        comparableCandidate,
        `${filename} formal may differ only by approved metadata, timer policy, and L16/L17 order`,
    );
    assert.equal(formal.Hard, levelId === 3 ? 1 : 0, `${filename} Hard flag`);
    if (authoredTimeOverrides.has(levelId)) {
        assert.equal(formal.timeLimit, authoredTimeOverrides.get(levelId), `${filename} authored timer override`);
    } else if (levelId >= 5) {
        const expectedTime = levelId === 5 ? 120 : Math.min(150, Math.ceil(formal.slotTotalCount / 200) * 30);
        assert.equal(formal.timeLimit, expectedTime);
    }
}
assert.match(manifest.summary.sourceCorpusDigest, /^[0-9a-f]{64}$/, 'retired source-corpus digest must remain recorded as provenance metadata');

const required = ['levelId', 'boardWidth', 'boardHeight', 'timeLimit', 'slotTotalCount',
    'conveyorCapacity', 'correctColorArr', 'initRandomColorArr'];
let displacementTotal = 0;
for (const row of manifest.levels) {
    const isDbtReference = row.sourceKind === 'dbt_reference';
    const isDbtSelectedReference = row.sourceKind === 'dbt_selected_reference';
    const outputBuffer = fs.readFileSync(path.join(outputDir, row.outputFile));
    const output = JSON.parse(outputBuffer.toString('utf8'));
    assert.equal(row.outputFile, `level_${row.order}.json`);
    assert.match(row.sourceSha256, /^[0-9a-f]{64}$/, `${row.outputFile} source provenance hash`);
    for (const key of required) assert.ok(Object.hasOwn(output, key), `${row.outputFile} missing ${key}`);
    assert.equal(output.levelId, row.order);
    assert.match(row.outputSha256, /^[0-9a-f]{64}$/, `${row.outputFile} historical output provenance hash`);
    assert.ok(Number.isInteger(output.conveyorCapacity) && output.conveyorCapacity > 0);
    assert.equal(output.correctColorArr.length, output.boardHeight);
    assert.equal(output.initRandomColorArr.length, output.boardHeight);
    assert.ok(output.correctColorArr.every(line => line.length === output.boardWidth));
    assert.ok(output.initRandomColorArr.every(line => line.length === output.boardWidth));
    assert.deepEqual(inventory(output.initRandomColorArr), inventory(output.correctColorArr));
    shuffle.assertOutline(output.correctColorArr, output.initRandomColorArr);
    if (isDbtReference) {
        const source = JSON.parse(fs.readFileSync(path.join(root, row.sourceFile), 'utf8'));
        assert.equal(row.order, 2);
        assert.equal(row.shuffle.algorithm, 'DBT.reference-exact-copy');
        assert.equal(row.shuffle.preservedReferenceInit, true);
        assert.deepEqual(output, source, `${row.outputFile} exact DBT reference replica`);
    } else if (isDbtSelectedReference) {
        const source = JSON.parse(fs.readFileSync(path.join(root, row.sourceFile), 'utf8'));
        assert.equal(row.order, 4);
        assert.equal(row.sourceId, 10);
        assert.equal(row.shuffle.algorithm, 'DBTSelected.reference-copy-with-levelId-normalization');
        assert.deepEqual(row.shuffle.normalizedFields, ['levelId']);
        assert.deepEqual(output, { ...source, levelId: 4 }, `${row.outputFile} normalized DBT-selected replica`);
    } else {
        assert.equal(row.shuffle.algorithm, 'ControlledShuffle.learned-paired-cohesion-v3');
    }
    const metrics = shuffle.metrics(output.correctColorArr, output.initRandomColorArr);
    assert.deepEqual(metrics, row.shuffle.after, `${row.outputFile} recorded shuffle metrics`);
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
