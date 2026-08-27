'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('./shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'tools', 'latest-minigame-selected-300');
const referencePath = path.join(root, 'tools', 'dbt', 'level_2.json');
const manifestPath = path.join(outputDir, 'selection_manifest.json');
const shuffleReportPath = path.join(outputDir, 'shuffle_report.json');
const outputPath = path.join(outputDir, 'level_2.json');
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const round = (value, digits) => Number(value.toFixed(digits));

function groups(grid) {
    const visited = new Set();
    let count = 0;
    for (let row = 0; row < grid.length; row += 1) for (let col = 0; col < grid[row].length; col += 1) {
        if (grid[row][col] <= 0 || visited.has(`${row}:${col}`)) continue;
        count += 1;
        const color = grid[row][col];
        const queue = [[row, col]];
        visited.add(`${row}:${col}`);
        while (queue.length) {
            const [currentRow, currentCol] = queue.shift();
            for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
                if (dr === 0 && dc === 0) continue;
                const nextRow = currentRow + dr;
                const nextCol = currentCol + dc;
                const key = `${nextRow}:${nextCol}`;
                if (nextRow < 0 || nextRow >= grid.length || nextCol < 0 || nextCol >= grid[nextRow].length
                    || visited.has(key) || grid[nextRow][nextCol] !== color) continue;
                visited.add(key);
                queue.push([nextRow, nextCol]);
            }
        }
    }
    return count;
}

function designMetrics(level) {
    const target = level.correctColorArr;
    const initial = level.initRandomColorArr;
    const colors = new Set(target.flat().filter(value => value > 0));
    const filled = level.slotTotalCount;
    let locked = 0;
    for (let row = 0; row < target.length; row += 1) for (let col = 0; col < target[row].length; col += 1) {
        if (target[row][col] > 0 && target[row][col] === initial[row][col]) locked += 1;
    }
    const canonical = new Map();
    let nextColor = 1;
    const canonicalGrid = target.map(row => row.map(color => {
        if (color <= 0) return 0;
        if (!canonical.has(color)) canonical.set(color, nextColor++);
        return canonical.get(color);
    }));
    const shapeBody = target.map(row => row.map(color => color > 0 ? '1' : '0').join('')).join('/');
    return {
        width: level.boardWidth,
        height: level.boardHeight,
        filled,
        colors: colors.size,
        time: level.timeLimit,
        density: round(filled / (level.boardWidth * level.boardHeight), 4),
        mismatch: round(1 - locked / Math.max(1, filled), 4),
        fragmentation: round(groups(initial) / Math.max(1, colors.size), 4),
        beansPerSecond: round(filled / Math.max(1, level.timeLimit), 4),
        shapeHash: crypto.createHash('sha1').update(shapeBody).digest('hex').slice(0, 12),
        patternHash: crypto.createHash('sha1').update(JSON.stringify(canonicalGrid)).digest('hex').slice(0, 12),
    };
}

function averageMetrics(levels, field) {
    const keys = Object.keys(levels[0][field]).filter(key => typeof levels[0][field][key] === 'number');
    return Object.fromEntries(keys.map(key => [key,
        levels.reduce((sum, level) => sum + level[field][key], 0) / levels.length]));
}

function refreshStages(manifest) {
    for (const stage of manifest.summary.stages) {
        const [start, end] = stage.range.split('-').map(Number);
        const rows = manifest.levels.slice(start - 1, end);
        stage.meanFilled = round(rows.reduce((sum, row) => sum + row.metrics.filled, 0) / rows.length, 1);
        stage.meanColors = round(rows.reduce((sum, row) => sum + row.metrics.colors, 0) / rows.length, 2);
        stage.meanMismatch = round(rows.reduce((sum, row) => sum + row.metrics.mismatch, 0) / rows.length, 4);
        stage.meanBeansPerSecond = round(rows.reduce((sum, row) => sum + row.metrics.beansPerSecond, 0) / rows.length, 4);
    }
}

const referenceBuffer = fs.readFileSync(referencePath);
const reference = JSON.parse(referenceBuffer.toString('utf8'));
if (reference.levelId !== 2) throw new Error('DBT reference must be level 2');
shuffle.assertOutline(reference.correctColorArr, reference.initRandomColorArr);
const outputBuffer = referenceBuffer;
fs.writeFileSync(outputPath, outputBuffer);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const row = manifest.levels.find(level => level.order === 2);
if (!row) throw new Error('formal sequence level 2 is missing');
const oldCategory = row.category;
const metrics = designMetrics(reference);
Object.assign(row, {
    sourceKind: 'dbt_reference',
    sourceId: 2,
    sourceFile: 'tools/dbt/level_2.json',
    matchedReferenceLevelId: 2,
    category: '引导小局',
    pressureTier: '舒缓',
    dominantPressure: '引导',
    selectionScore: 0,
    selectionReasons: ['用户指定精确复刻 DBT 第 2 关', '引导小局', '舒缓', '极低门槛教学段'],
    visualScore: 0,
    metrics,
    sourceSha256: sha256(referenceBuffer),
    outputSha256: sha256(outputBuffer),
    shuffle: {
        algorithm: 'DBT.reference-exact-copy',
        seed: null,
        before: shuffle.metrics(reference.correctColorArr, reference.initRandomColorArr),
        after: shuffle.metrics(reference.correctColorArr, reference.initRandomColorArr),
        preservedReferenceInit: true,
    },
});
manifest.summary.categoryCounts[oldCategory] -= 1;
manifest.summary.categoryCounts[row.category] += 1;
refreshStages(manifest);
manifest.shuffle.exceptions = [{ levelId: 2, algorithm: row.shuffle.algorithm, source: row.sourceFile }];
manifest.shuffle.before = averageMetrics(manifest.levels.map(level => level.shuffle), 'before');
manifest.shuffle.after = averageMetrics(manifest.levels.map(level => level.shuffle), 'after');
if (new Set(manifest.levels.map(level => level.metrics.patternHash)).size !== 300) {
    throw new Error('DBT level 2 duplicates an existing selected pattern');
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const report = JSON.parse(fs.readFileSync(shuffleReportPath, 'utf8'));
const reportRow = report.levels.find(level => level.levelId === 2);
Object.assign(reportRow, {
    seed: null,
    algorithm: row.shuffle.algorithm,
    before: row.shuffle.before,
    after: row.shuffle.after,
    outputSha256: row.outputSha256,
});
report.exceptions = manifest.shuffle.exceptions;
report.before = averageMetrics(report.levels, 'before');
report.after = averageMetrics(report.levels, 'after');
fs.writeFileSync(shuffleReportPath, `${JSON.stringify(report, null, 2)}\n`);

const selectedReferencePath = path.join(root, 'tools', 'dbt-selected-300', 'level_10.json');
const selectedReferenceBuffer = fs.readFileSync(selectedReferencePath);
const selectedReference = JSON.parse(selectedReferenceBuffer.toString('utf8'));
if (selectedReference.levelId !== 10) throw new Error('DBT-selected reference must be level 10');
shuffle.assertOutline(selectedReference.correctColorArr, selectedReference.initRandomColorArr);
const normalizedSelectedReference = { ...selectedReference, levelId: 4 };
const selectedOutputBuffer = Buffer.from(`${JSON.stringify(normalizedSelectedReference)}\n`);
const selectedOutputPath = path.join(outputDir, 'level_4.json');
fs.writeFileSync(selectedOutputPath, selectedOutputBuffer);

const refreshedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const selectedRow = refreshedManifest.levels.find(level => level.order === 4);
if (!selectedRow) throw new Error('formal sequence level 4 is missing');
const selectedOldCategory = selectedRow.category;
const selectedMetrics = designMetrics(normalizedSelectedReference);
Object.assign(selectedRow, {
    sourceKind: 'dbt_selected_reference',
    sourceId: 10,
    sourceFile: 'tools/dbt-selected-300/level_10.json',
    matchedReferenceLevelId: 6,
    category: '轻量恢复',
    pressureTier: '舒缓',
    dominantPressure: '引导',
    selectionScore: 0,
    selectionReasons: ['用户指定复刻 DBT 入选集第 10 关', '轻量恢复', '舒缓', '极低门槛教学段'],
    visualScore: 0,
    metrics: selectedMetrics,
    sourceSha256: sha256(selectedReferenceBuffer),
    outputSha256: sha256(selectedOutputBuffer),
    shuffle: {
        algorithm: 'DBTSelected.reference-copy-with-levelId-normalization',
        seed: null,
        before: shuffle.metrics(normalizedSelectedReference.correctColorArr, normalizedSelectedReference.initRandomColorArr),
        after: shuffle.metrics(normalizedSelectedReference.correctColorArr, normalizedSelectedReference.initRandomColorArr),
        preservedReferenceInit: true,
        normalizedFields: ['levelId'],
    },
});
refreshedManifest.summary.categoryCounts[selectedOldCategory] -= 1;
refreshedManifest.summary.categoryCounts[selectedRow.category] += 1;
refreshStages(refreshedManifest);
refreshedManifest.shuffle.exceptions = [
    { levelId: 2, algorithm: 'DBT.reference-exact-copy', source: 'tools/dbt/level_2.json' },
    { levelId: 4, algorithm: selectedRow.shuffle.algorithm, source: selectedRow.sourceFile },
];
refreshedManifest.shuffle.before = averageMetrics(refreshedManifest.levels.map(level => level.shuffle), 'before');
refreshedManifest.shuffle.after = averageMetrics(refreshedManifest.levels.map(level => level.shuffle), 'after');
if (new Set(refreshedManifest.levels.map(level => level.metrics.patternHash)).size !== 300) {
    throw new Error('DBT-selected level 10 duplicates an existing selected pattern');
}
fs.writeFileSync(manifestPath, `${JSON.stringify(refreshedManifest, null, 2)}\n`);

const refreshedReport = JSON.parse(fs.readFileSync(shuffleReportPath, 'utf8'));
const selectedReportRow = refreshedReport.levels.find(level => level.levelId === 4);
Object.assign(selectedReportRow, {
    seed: null,
    algorithm: selectedRow.shuffle.algorithm,
    before: selectedRow.shuffle.before,
    after: selectedRow.shuffle.after,
    outputSha256: selectedRow.outputSha256,
});
refreshedReport.exceptions = refreshedManifest.shuffle.exceptions;
refreshedReport.before = averageMetrics(refreshedReport.levels, 'before');
refreshedReport.after = averageMetrics(refreshedReport.levels, 'after');
fs.writeFileSync(shuffleReportPath, `${JSON.stringify(refreshedReport, null, 2)}\n`);

console.log(`Replicated DBT level 2 and DBT-selected level 10 at formal levels 2 and 4`);
