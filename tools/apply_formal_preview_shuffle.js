'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('./shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const levelDir = path.join(root, 'assets', 'LevelData');
const supportedLevelIds = Object.freeze([14, 17, 20, 21, 27, 36, 47]);
const args = process.argv.slice(2);
const levelArgs = args.filter((arg) => arg.startsWith('--levels='));
assert.equal(levelArgs.length, 1, '必须显式传入一个 --levels=关卡号列表');
const targetLevelIds = Object.freeze(levelArgs[0].slice('--levels='.length).split(',').map(Number));
assert.ok(targetLevelIds.length > 0 && targetLevelIds.every((levelId) => (
    Number.isInteger(levelId) && supportedLevelIds.includes(levelId)
)), '关卡号必须在允许范围内');
assert.equal(new Set(targetLevelIds).size, targetLevelIds.length, '关卡号不能重复');
const checkOnly = args.includes('--check') || args.includes('--check-cdn');
const checkCdn = args.includes('--check-cdn');

assert.ok(args.every((arg) => arg === '--check' || arg === '--check-cdn' || arg.startsWith('--levels=')), 'unsupported argument');

function readLevel(levelId) {
    const file = path.join(levelDir, `level_${levelId}.json`);
    const text = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(text);
    assert.equal(data.levelId, levelId, `${path.basename(file)} levelId`);
    return { file, text, data };
}

function activeInventory(grid) {
    return [...shuffle.colorInventory(grid)].sort((left, right) => left[0] - right[0]);
}

const formalLevels = fs.readdirSync(levelDir)
    .map((name) => {
        const match = /^level_(\d+)\.json$/.exec(name);
        return match ? Number(match[1]) : 0;
    })
    .filter(Boolean)
    .sort((left, right) => left - right)
    .map((levelId) => readLevel(levelId).data);

assert.ok(formalLevels.length > 0, 'formal level source is empty');
const profile = shuffle.learnProfile(formalLevels);
const reports = [];
const sourceLevels = [];

for (const levelId of targetLevelIds) {
    const { file, text, data } = readLevel(levelId);
    const generated = shuffle.generate(data.correctColorArr, {
        levelId,
        profile,
        outlineGrid: data.initRandomColorArr,
    });
    assert.doesNotThrow(() => shuffle.assertOutline(data.initRandomColorArr, generated), `${path.basename(file)} outline`);
    assert.deepEqual(activeInventory(generated), activeInventory(data.correctColorArr), `${path.basename(file)} inventory`);

    const next = { ...data, initRandomColorArr: generated };
    const beforeWithoutShuffle = { ...data };
    const afterWithoutShuffle = { ...next };
    delete beforeWithoutShuffle.initRandomColorArr;
    delete afterWithoutShuffle.initRandomColorArr;
    assert.deepEqual(afterWithoutShuffle, beforeWithoutShuffle, `${path.basename(file)} non-shuffle fields`);
    if (checkOnly) {
        if (args.includes('--check')) {
            assert.deepEqual(data.initRandomColorArr, generated, `${path.basename(file)} preview shuffle`);
        }
    } else {
        fs.writeFileSync(file, JSON.stringify(next) + (text.endsWith('\n') ? '\n' : ''));
    }
    sourceLevels.push({ levelId, data });
    reports.push({
        levelId,
        metrics: shuffle.metrics(data.correctColorArr, generated),
    });
}

if (checkCdn) {
    const cdnDir = path.join(root, 'build', 'level-data-cdn');
    const manifest = JSON.parse(fs.readFileSync(path.join(cdnDir, 'level_live.json'), 'utf8'));
    for (const { levelId, data } of sourceLevels) {
        const pack = manifest.packs.find((item) => Array.isArray(item.levelKeys) && item.levelKeys.includes(`level_${levelId}`));
        assert.ok(pack, `level_${levelId} missing from CDN manifest`);
        const payload = JSON.parse(fs.readFileSync(path.join(cdnDir, pack.url), 'utf8'));
        const entry = payload.levels.find((item) => item.prefix === 'level_' && item.levelId === levelId);
        assert.ok(entry, `level_${levelId} missing from CDN pack`);
        assert.deepEqual(entry.data, data, `level_${levelId} CDN data`);
    }
}

console.log(JSON.stringify({ algorithm: 'ControlledShuffle.preview-profile-v1', checkOnly, checkCdn, profileCount: profile.count, levels: reports }, null, 2));
