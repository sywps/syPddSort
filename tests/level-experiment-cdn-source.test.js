const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { validateConveyorCapacity } = require('../scripts/conveyor-capacity-contract');

const root = path.resolve(__dirname, '..');
const experimentId = 'ly_0224';
const treatmentRelDir = `experiments/${experimentId}/treatment`;
const treatmentDir = path.join(root, treatmentRelDir);
const stableRelDir = 'assets/LevelData';
const stableDir = path.join(root, stableRelDir);
const expectedOverrideLevelIds = [2, 3, 4, 5, 6, 7, 8, 9];
const expectedTutorialContracts = {};
const expectedCdnUrl =
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat_b/0722_levels/front10_v1/treatment/';
const expectedOssPath =
    'syGame/pdd_v2/remote_wechat_b/0722_levels/front10_v1/treatment/';

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

function parseLevelFileName(name) {
    const match = /^(level_|zt_level_)(\d+)\.json$/.exec(name);
    if (!match) return null;
    return {
        name,
        prefix: match[1],
        levelId: Number(match[2]),
        key: `${match[1]}${Number(match[2])}`,
    };
}

function stableLevelFiles() {
    return fs.readdirSync(stableDir)
        .map(parseLevelFileName)
        .filter(Boolean)
        .sort((left, right) => {
            const prefixOrder = left.prefix === right.prefix ? 0 : (left.prefix === 'level_' ? -1 : 1);
            return prefixOrder || left.levelId - right.levelId;
        });
}

function stableSourceDigest() {
    const hash = crypto.createHash('sha256');
    for (const entry of stableLevelFiles()) {
        hash.update(entry.name);
        hash.update(fs.readFileSync(path.join(stableDir, entry.name)));
    }
    return hash.digest('hex');
}

const config = readJson(`${treatmentRelDir}/config.json`);
assert.deepStrictEqual(config, {
    schemaVersion: 1,
    experimentId,
    bucket: 'exp',
    levelPrefix: 'level_',
    runtimeMinimumLevelId: 2,
    levelDataContract: 'v3',
    packSize: 100,
    tutorialContracts: expectedTutorialContracts,
    stableSourceDir: stableRelDir,
    sourceMode: 'stable_full_plus_overrides',
    outputDir: 'build/level-experiment-cdn/ly_0224/treatment',
    overrideLevelIds: expectedOverrideLevelIds,
    cdnBaseUrl: expectedCdnUrl,
    ossPath: expectedOssPath,
});

const treatmentLevelFiles = fs.readdirSync(treatmentDir)
    .filter((name) => /^level_\d+\.json$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]));
assert.deepStrictEqual(
    treatmentLevelFiles,
    expectedOverrideLevelIds.map((levelId) => `level_${levelId}.json`),
    'the treatment override source must contain exactly mainline levels 2-9',
);

for (const levelId of expectedOverrideLevelIds) {
    const level = readJson(`${treatmentRelDir}/level_${levelId}.json`);
    assert.strictEqual(level.levelId, levelId, `treatment level_${levelId}.json must retain its physical level id`);
    assert.strictEqual(validateConveyorCapacity(level, `${treatmentRelDir}/level_${levelId}.json`), 60);
    assert.strictEqual(Object.hasOwn(level, 'slotPolicy'), false);
}

const stableLevel2 = readJson('assets/LevelData/level_2.json');
const treatmentLevel2 = readJson(`${treatmentRelDir}/level_2.json`);
assert.deepStrictEqual(
    [stableLevel2.boardWidth, stableLevel2.boardHeight, stableLevel2.slotTotalCount, stableLevel2.tutorialGuide],
    [12, 12, 96, undefined],
    'canonical level 2 must remain the main-lineage stable no-guide payload',
);
assert.strictEqual(stableLevel2.conveyorCapacity, 60, 'canonical stable level 2 must use the new conveyor');
assert.strictEqual(Object.hasOwn(stableLevel2, 'slotPolicy'), false, 'stable level 2 must not retain row data');
assert.deepStrictEqual(
    [
        treatmentLevel2.boardWidth,
        treatmentLevel2.boardHeight,
        treatmentLevel2.slotTotalCount,
        treatmentLevel2.conveyorCapacity,
        treatmentLevel2.tutorialGuide,
    ],
    [14, 13, 112, 60, undefined],
    'experiment level 2 must keep its isolated layout on the new conveyor without the retired slot guide',
);
assert.notDeepStrictEqual(
    stableLevel2.correctColorArr,
    treatmentLevel2.correctColorArr,
    'stable and treatment level 2 must not share one mutable source payload',
);
const treatmentLevel3 = readJson(`${treatmentRelDir}/level_3.json`);
assert.deepStrictEqual(
    treatmentLevel3.tutorialGuide,
    {
        mode: 'zoom',
        title: '试试放大或缩小',
        subtitle: '',
        guideCopies: ['试试放大或缩小'],
    },
    'experiment level 3 may retain its non-slot zoom metadata',
);

const experimentService = read('assets/Scripts/Core/LevelExperimentService.ts');
assert.ok(experimentService.includes(`FRONT_LEVEL_EXPERIMENT_ID = '${experimentId}'`));
assert.ok(experimentService.includes('FRONT_LEVEL_EXPERIMENT_MIN_LEVEL = 2'));
assert.ok(!experimentService.includes('FRONT_LEVEL_EXPERIMENT_MAX_LEVEL'));
assert.ok(experimentService.includes(expectedCdnUrl));

const syncScript = read('scripts/sync-level-data-cdn-wechat.js');
assert.ok(syncScript.includes("if (levelExperimentTarget)"));
assert.ok(!syncScript.includes("generatorArgs.push('--prefix'"), 'EXP generation must keep the complete stable key set');
assert.ok(!syncScript.includes("generatorArgs.push('--min-level'"), 'EXP generation must not exclude Level 1 or theme levels');
assert.ok(syncScript.includes("generatorArgs.push('--overlay-source', levelExperimentTarget.overrideDir)"));
assert.ok(syncScript.includes("generatorEnv.PDD_WECHAT_CDN_SLOT = ''"));
assert.ok(syncScript.includes('assertLevelExperimentManifest'));
assert.ok(syncScript.includes('assertExperimentTutorialContracts'));
assert.ok(!syncScript.includes('assertExperimentTutorialRuntimeSupport'));
assert.ok(syncScript.includes('runOssutil(['), 'treatment publishing must reuse the shared pack-first uploader');
const generator = read('scripts/write-level-data-cdn.js');
assert.ok(generator.includes("'--overlay-source'"), 'shared generator must support explicit source overlays');
assert.ok(!generator.includes("'--min-level'"), 'the shared generator must not expose a partial-key EXP filter');

const packageJson = readJson('package.json');
assert.strictEqual(
    packageJson.scripts['sync:cdn:wechat:level_data:exp'],
    'node scripts/sync-level-data-cdn-wechat.js --cdn-slot=EXP',
);
assert.strictEqual(
    packageJson.scripts['sync:cdn:wechat:level_data:exp:dry'],
    'node scripts/sync-level-data-cdn-wechat.js --cdn-slot=EXP --dry-run',
);
assert.strictEqual(packageJson.scripts['sync:cdn:wechat:level_data:ly_0224'], undefined);
assert.strictEqual(packageJson.scripts['sync:cdn:wechat:level_data:ly_0224:dry'], undefined);

const expectedStableEntries = stableLevelFiles();
const expectedLevelKeys = expectedStableEntries.map((entry) => entry.key);
const expectedLevelCounts = expectedStableEntries.reduce((counts, entry) => {
    counts[entry.prefix] = (counts[entry.prefix] || 0) + 1;
    return counts;
}, {});
const expectedPackCount = Object.values(expectedLevelCounts)
    .reduce((total, count) => total + Math.ceil(count / config.packSize), 0);
assert.strictEqual(expectedLevelKeys.length, 1691, 'stable A/B and EXP must share the same 1,691 level keys');
assert.deepStrictEqual(expectedLevelCounts, { level_: 1643, zt_level_: 48 });
assert.strictEqual(expectedPackCount, 18);
const stableDigestBefore = stableSourceDigest();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-ly-0224-cdn-'));
try {
    const outputDir = path.join(tempDir, 'cdn');
    const dryRun = spawnSync(process.execPath, [
        path.join(root, 'scripts/sync-level-data-cdn-wechat.js'),
        '--cdn-slot=EXP',
        '--dry-run',
    ], {
        cwd: root,
        encoding: 'utf8',
        env: {
            ...process.env,
            PDD_LEVEL_DATA_CDN_DIR: outputDir,
            PDD_LEVEL_DATA_CONTRACT: 'v3',
            PDD_WECHAT_CDN_SLOT: 'A',
        },
    });
    const dryRunOutput = dryRun.stdout + dryRun.stderr;
    assert.strictEqual(dryRun.status, 0, dryRunOutput);
    assert.match(dryRunOutput, /Dry-run 校验完成，未上传/);
    assert.ok(dryRunOutput.includes(`CDN URL: ${expectedCdnUrl}`));
    assert.ok(dryRunOutput.includes(`OSS 路径: oss://game-pdd-v2/${expectedOssPath}`));

    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'level_live.json'), 'utf8'));
    assert.strictEqual(manifest.cdnSlot, undefined, 'experiment artifacts must ignore an inherited stable A/B slot');
    assert.strictEqual(manifest.source, `${stableRelDir} + ${treatmentRelDir}`);
    assert.strictEqual(manifest.levelCount, expectedLevelKeys.length);
    assert.deepStrictEqual(manifest.levelCounts, expectedLevelCounts);
    assert.strictEqual(manifest.packs.length, expectedPackCount);
    const mainlinePacks = manifest.packs.filter((entry) => entry.prefix === 'level_');
    const themePacks = manifest.packs.filter((entry) => entry.prefix === 'zt_level_');
    assert.strictEqual(mainlinePacks[0].levelRange[0], 1);
    assert.strictEqual(mainlinePacks[mainlinePacks.length - 1].levelRange[1], 1643);
    assert.strictEqual(themePacks.length, 1);

    const actualLevelKeys = [];
    const changedFromStableKeys = [];
    for (const packEntry of manifest.packs) {
        assert.ok(packEntry.prefix === 'level_' || packEntry.prefix === 'zt_level_');
        const pack = JSON.parse(fs.readFileSync(path.join(outputDir, packEntry.url), 'utf8'));
        for (const entry of pack.levels) {
            const prefix = entry.prefix || packEntry.prefix;
            const key = `${prefix}${entry.levelId}`;
            actualLevelKeys.push(key);
            const isOverride = prefix === 'level_' && expectedOverrideLevelIds.includes(entry.levelId);
            const expectedDir = isOverride ? treatmentDir : stableDir;
            const expectedData = JSON.parse(fs.readFileSync(path.join(expectedDir, `${key}.json`), 'utf8'));
            assert.deepStrictEqual(entry.data, expectedData, `${key} must come from its declared composite source`);
            const stableData = JSON.parse(fs.readFileSync(path.join(stableDir, `${key}.json`), 'utf8'));
            if (JSON.stringify(entry.data) !== JSON.stringify(stableData)) changedFromStableKeys.push(key);
        }
    }
    assert.deepStrictEqual(actualLevelKeys, expectedLevelKeys);
    assert.ok(actualLevelKeys.includes('level_1'), 'EXP must mirror the bundled Level 1 key');
    assert.ok(actualLevelKeys.includes('zt_level_1'), 'EXP must mirror stable theme-level keys');
    assert.deepStrictEqual(
        changedFromStableKeys,
        expectedOverrideLevelIds.map((levelId) => `level_${levelId}`),
        'only the approved Level 2-9 payloads may differ from stable A/B',
    );
    assert.strictEqual(stableSourceDigest(), stableDigestBefore, 'EXP generation must not mutate the stable source');
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}

for (const args of [
    ['--cdn-slot=C', '--dry-run'],
    ['--experiment=ly_0224', '--dry-run'],
]) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/sync-level-data-cdn-wechat.js'), ...args], {
        cwd: root,
        encoding: 'utf8',
    });
    assert.notStrictEqual(result.status, 0, `unsafe arguments must fail: ${args.join(' ')}`);
}

console.log('level-experiment-cdn-source.test.js passed');
