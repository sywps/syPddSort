'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'tools', 'online-levels-2026-08-01-zt-selected-200');
const sourceDir = path.join(root, 'tools', 'online-levels-2026-08-01');
const onlineDir = path.join(root, 'assets', 'LevelData');
const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'selection_manifest.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'selection_report.json'), 'utf8'));
const rawHash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const lfHash = (buffer) => crypto.createHash('sha256')
    .update(Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'))
    .digest('hex');
const matchesManifestHash = (buffer, expected) => rawHash(buffer) === expected || lfHash(buffer) === expected;

const inventory = (grid) => {
    const counts = new Map();
    for (const row of grid) for (const color of row) if (color > 0) counts.set(color, (counts.get(color) || 0) + 1);
    return [...counts].sort((left, right) => left[0] - right[0]);
};

const crop = (grid) => {
    const cells = [];
    for (let row = 0; row < grid.length; row += 1) {
        for (let col = 0; col < grid[row].length; col += 1) if (grid[row][col] > 0) cells.push([row, col]);
    }
    const rows = cells.map(([row]) => row);
    const cols = cells.map(([, col]) => col);
    const rowMin = Math.min(...rows);
    const rowMax = Math.max(...rows);
    const colMin = Math.min(...cols);
    const colMax = Math.max(...cols);
    return grid.slice(rowMin, rowMax + 1).map((row) => row.slice(colMin, colMax + 1));
};

const transforms = (grid) => [
    grid,
    grid.map((row) => [...row].reverse()),
    [...grid].reverse(),
    [...grid].reverse().map((row) => [...row].reverse()),
];

const canonical = (grid) => {
    const colorMap = new Map();
    let nextColor = 1;
    return JSON.stringify(grid.map((row) => row.map((color) => {
        if (color <= 0) return 0;
        if (!colorMap.has(color)) colorMap.set(color, nextColor++);
        return colorMap.get(color);
    })));
};

const patternKey = (grid) => transforms(crop(grid)).map(canonical).sort()[0];
const outputFiles = fs.readdirSync(outputDir).filter((name) => /^zt_level_\d+\.json$/.test(name));

assert.equal(manifest.version, 1);
assert.equal(manifest.selectionPolicy, 'placementFirst');
assert.deepEqual(manifest.outputRange, [6, 205]);
assert.equal(manifest.levels.length, 200);
assert.equal(report.generatedLevelCount, 200);
assert.equal(outputFiles.length, 205);
assert.deepEqual(
    outputFiles.sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0])),
    Array.from({ length: 205 }, (_value, index) => `zt_level_${index + 1}.json`),
);

const onlinePatterns = new Set();
for (const filename of fs.readdirSync(onlineDir).filter((name) => {
    if (/^level_\d+\.json$/.test(name)) return true;
    const match = /^zt_level_(\d+)\.json$/.exec(name);
    return Boolean(match && Number(match[1]) <= 5);
})) {
    const level = JSON.parse(fs.readFileSync(path.join(onlineDir, filename), 'utf8'));
    onlinePatterns.add(patternKey(level.correctColorArr));
}

const selectedPatterns = new Set();
for (const entry of manifest.levels) {
    const outputPath = path.join(outputDir, entry.outputFilename);
    const sourcePath = path.join(sourceDir, entry.sourceFilename);
    const outputBuffer = fs.readFileSync(outputPath);
    const sourceBuffer = fs.readFileSync(sourcePath);
    const output = JSON.parse(outputBuffer.toString('utf8'));
    const source = JSON.parse(sourceBuffer.toString('utf8'));
    assert.ok(matchesManifestHash(outputBuffer, entry.outputSha256), `${entry.outputFilename} output hash`);
    assert.ok(matchesManifestHash(sourceBuffer, entry.sourceSha256), `${entry.sourceFilename} source hash`);
    assert.equal(output.levelId, entry.ztLevelId, `${entry.outputFilename} internal ID`);
    assert.equal(output.Hard, 0, `${entry.outputFilename} normal theme level`);
    assert.equal(output.conveyorCapacity, 60, `${entry.outputFilename} conveyor capacity`);
    assert.equal(Object.hasOwn(output, 'slotPolicy'), false, `${entry.outputFilename} retired slot policy`);
    assert.equal(Object.hasOwn(output, 'initialSlotUnlockedRows'), false, `${entry.outputFilename} retired slot rows`);
    assert.equal(output.timeLimit, entry.timeLimit, `${entry.outputFilename} time limit`);
    assert.equal(output.timeLimit, Math.min(150, Math.ceil(entry.beanCount / 200) * 30), `${entry.outputFilename} mainline time rule`);
    assert.equal(entry.actualBeansPerSecond, Number((entry.beanCount / entry.timeLimit).toFixed(6)), `${entry.outputFilename} bean rate`);
    assert.equal(entry.Hard, 0, `${entry.outputFilename} manifest Hard`);
    assert.equal(entry.conveyorCapacity, 60, `${entry.outputFilename} manifest capacity`);
    assert.equal(output.correctColorArr.length, output.boardHeight, `${entry.outputFilename} target height`);
    assert.equal(output.initRandomColorArr.length, output.boardHeight, `${entry.outputFilename} initial height`);
    for (let row = 0; row < output.boardHeight; row += 1) {
        assert.equal(output.correctColorArr[row].length, output.boardWidth, `${entry.outputFilename} target width`);
        assert.equal(output.initRandomColorArr[row].length, output.boardWidth, `${entry.outputFilename} initial width`);
        for (let col = 0; col < output.boardWidth; col += 1) {
            assert.equal(
                output.correctColorArr[row][col] > 0,
                output.initRandomColorArr[row][col] > 0,
                `${entry.outputFilename} outline ${row},${col}`,
            );
        }
    }
    assert.deepEqual(inventory(output.initRandomColorArr), inventory(output.correctColorArr), `${entry.outputFilename} inventory`);
    const withoutId = (level) => {
        const clone = structuredClone(level);
        delete clone.levelId;
        delete clone.Hard;
        delete clone.conveyorCapacity;
        delete clone.timeLimit;
        delete clone.slotPolicy;
        delete clone.initialSlotUnlockedRows;
        return clone;
    };
    assert.deepEqual(withoutId(output), withoutId(source), `${entry.outputFilename} only levelId changed`);
    const key = patternKey(output.correctColorArr);
    assert.ok(!onlinePatterns.has(key), `${entry.outputFilename} exact transformed online duplicate`);
    assert.ok(!selectedPatterns.has(key), `${entry.outputFilename} internal duplicate`);
    selectedPatterns.add(key);
}

for (let levelId = 1; levelId <= 5; levelId += 1) {
    const filename = `zt_level_${levelId}.json`;
    assert.ok(matchesManifestHash(fs.readFileSync(path.join(onlineDir, filename)), manifest.protectedOnlineThemeHashes[filename]), `${filename} protected`);
    assert.ok(matchesManifestHash(fs.readFileSync(path.join(outputDir, filename)), manifest.protectedOnlineThemeHashes[filename]), `${filename} preserved copy`);
}

assert.equal(report.beanCount.min, 800);
assert.equal(report.preservedOnlineLevelCount, 5);
assert.equal(report.totalLevelFileCount, 205);
assert.equal(report.beanCount.ge1000, 102);
assert.ok(report.placedBeanRatio.mean < 0.05);
assert.ok(report.placedBeanRatio.below8Pct >= 160);
assert.ok(report.placedBeanRatio.max <= 0.15);
assert.equal(report.chapters.length, 20);
assert.ok(report.timeLimit.min > 0);
assert.equal(report.timeLimit.max, 150);
assert.equal(report.timeLimit.step, 30);
for (let index = 0; index < report.chapters.length; index += 1) {
    const chapter = report.chapters[index];
    assert.ok(chapter.chapterPeakDifficulty >= chapter.miniPeakDifficulty, `chapter ${chapter.chapter} final peak`);
    assert.ok(chapter.miniPeakDifficulty > chapter.reliefDifficulty, `chapter ${chapter.chapter} relief`);
    if (index > 0) assert.ok(chapter.meanDifficulty > report.chapters[index - 1].meanDifficulty, `chapter ${chapter.chapter} rising baseline`);
}

const serverSource = fs.readFileSync(path.join(root, 'tools', 'server.py'), 'utf8');
assert.match(serverSource, /ONLINE_LEVEL_KEYS\s*=\s*\([\s\S]*?'Hard'[\s\S]*?'conveyorCapacity'/);

console.log('ZT selected 200 tests passed');
