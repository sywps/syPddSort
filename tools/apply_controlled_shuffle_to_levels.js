'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('./shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const referenceDir = path.join(root, 'tools', 'dbt');
const defaultTargetDir = path.join(root, 'tools', 'dbt-selected-300');
const ALGORITHM_VERSION = 'ControlledShuffle.learned-paired-cohesion-v3';

function parseArgs(argv) {
    const options = { targetDir: defaultTargetDir, count: 300 };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--target-dir') options.targetDir = path.resolve(argv[++index]);
        else if (arg === '--count') options.count = Number(argv[++index]);
        else throw new Error(`unknown argument: ${arg}`);
    }
    if (!Number.isInteger(options.count) || options.count <= 0) throw new Error('--count must be a positive integer');
    return options;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function inventoryObject(grid) {
    return Object.fromEntries([...shuffle.colorInventory(grid)].sort((left, right) => left[0] - right[0]));
}

function average(items, key) {
    return items.reduce((sum, item) => sum + item[key], 0) / Math.max(1, items.length);
}

function metricSummary(items) {
    return {
        displacement: average(items, 'displacement'),
        outlineRetention: average(items, 'outlineRetention'),
        similarCountSwapRatio: average(items, 'similarCountSwapRatio'),
        sameNeighborRatio: average(items, 'sameNeighborRatio'),
        singletonRatio: average(items, 'singletonRatio'),
        componentsPerColor: average(items, 'componentsPerColor'),
        largestCluster: average(items, 'largestCluster'),
    };
}

function loadReferenceLevels() {
    return Array.from({ length: 182 }, (_value, index) => {
        const levelId = index + 1;
        return readJson(path.join(referenceDir, `level_${levelId}.json`));
    });
}

function validateLevel(level, filename, expectedId) {
    if (level.levelId !== expectedId) throw new Error(`${filename} levelId must be ${expectedId}`);
    if (!Array.isArray(level.correctColorArr) || !Array.isArray(level.initRandomColorArr)) {
        throw new Error(`${filename} is missing board grids`);
    }
    if (level.correctColorArr.length !== level.boardHeight || level.initRandomColorArr.length !== level.boardHeight) {
        throw new Error(`${filename} board height mismatch`);
    }
    if (level.correctColorArr.some(row => row.length !== level.boardWidth)
        || level.initRandomColorArr.some(row => row.length !== level.boardWidth)) {
        throw new Error(`${filename} board width mismatch`);
    }
}

function applyShuffle(options) {
    const manifestPath = path.join(options.targetDir, 'selection_manifest.json');
    const manifest = readJson(manifestPath);
    if (!Array.isArray(manifest.levels) || manifest.levels.length !== options.count) {
        throw new Error(`manifest must contain ${options.count} levels`);
    }
    const referenceLevels = loadReferenceLevels();
    const profile = shuffle.learnProfile(referenceLevels);
    if (profile.count !== 182) throw new Error(`expected 182 reference levels, got ${profile.count}`);

    const beforeMetrics = [];
    const afterMetrics = [];
    const reportLevels = [];
    for (let levelId = 1; levelId <= options.count; levelId += 1) {
        const filename = `level_${levelId}.json`;
        const file = path.join(options.targetDir, filename);
        const level = readJson(file);
        validateLevel(level, filename, levelId);
        const before = shuffle.metrics(level.correctColorArr, level.initRandomColorArr);
        const generated = shuffle.generate(level.correctColorArr, {
            levelId,
            profile,
            outlineGrid: level.initRandomColorArr,
        });
        const repeated = shuffle.generate(level.correctColorArr, {
            levelId,
            profile,
            outlineGrid: level.initRandomColorArr,
        });
        if (JSON.stringify(generated) !== JSON.stringify(repeated)) {
            throw new Error(`${filename} generated shuffle is not deterministic`);
        }
        if (JSON.stringify(inventoryObject(generated)) !== JSON.stringify(inventoryObject(level.correctColorArr))) {
            throw new Error(`${filename} generated color inventory differs from target`);
        }
        shuffle.assertOutline(level.initRandomColorArr, generated);
        level.initRandomColorArr = generated;
        const output = Buffer.from(JSON.stringify(level));
        fs.writeFileSync(file, output);
        const after = shuffle.metrics(level.correctColorArr, generated);
        beforeMetrics.push(before);
        afterMetrics.push(after);
        reportLevels.push({
            levelId,
            seed: 20260827 + levelId * 7919,
            before,
            after,
            outputSha256: hashBuffer(output),
        });
    }

    for (const row of manifest.levels) {
        const report = reportLevels[row.order - 1];
        if (!report || row.outputFile !== `level_${row.order}.json`) {
            throw new Error(`manifest output mapping is invalid at order ${row.order}`);
        }
        row.outputSha256 = report.outputSha256;
        row.shuffle = {
            algorithm: ALGORITHM_VERSION,
            seed: report.seed,
            before: report.before,
            after: report.after,
        };
    }
    manifest.shuffle = {
        algorithm: ALGORITHM_VERSION,
        implementation: 'tools/shuffle-comparison.js',
        reference: 'tools/dbt/level_1.json..level_182.json',
        referenceCount: profile.count,
        seedFormula: '20260827 + levelId * 7919',
        before: metricSummary(beforeMetrics),
        after: metricSummary(afterMetrics),
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const report = {
        methodVersion: 3,
        ...manifest.shuffle,
        count: options.count,
        cohorts: profile.cohorts,
        levels: reportLevels,
    };
    fs.writeFileSync(path.join(options.targetDir, 'shuffle_report.json'), JSON.stringify(report));
    console.log(JSON.stringify({ count: options.count, profile: profile.cohorts, before: report.before, after: report.after }, null, 2));
}

applyShuffle(parseArgs(process.argv.slice(2)));
