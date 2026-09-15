'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { coopHalfLevel } = require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const shuffle = require('../tools/shuffle-comparison');

const root = path.resolve(__dirname, '..');
const manifest = require('../assets/GameAssetsBundle/coop-manifest.json');
const entries = manifest.levels.filter(entry => entry.levelId >= 12);
assert.deepEqual(manifest.levels.map(entry => entry.levelId), Array.from({ length: 20 }, (_, index) => index + 1));
assert.equal(entries.length, 9);
assert.deepEqual(entries.map(entry => entry.collectionId), Array.from({ length: 9 }, (_, index) => `coop_wonder_${String(index + 1).padStart(2, '0')}`));
assert(entries.every((entry, index) => !index || entry.difficultyScore > entries[index - 1].difficultyScore), 'difficulty score must rise through 12-20');
assert.equal(new Set(entries.map(entry => entry.split.type)).size, 9, 'every new level needs a distinct cooperation reveal');
assert.equal(new Set(entries.map(entry => entry.name)).size, 9, 'every new level needs a distinct theme');

for (const entry of entries) {
    const file = path.join(root, 'assets/LevelData', entry.file);
    const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), entry.sha256);
    const level = JSON.parse(raw);
    assert.equal(level.levelId, entry.levelId);
    assert.equal(level.slotTotalCount, entry.beanCount);
    assert(entry.beanCount > 3000, `${entry.name} should deliver a large-format finale picture`);
    assert(entry.creatorBeanCount >= 1000 && entry.collaboratorBeanCount >= 1000);
    assert(entry.creatorBeanCount + entry.collaboratorBeanCount === entry.beanCount);
    assert(typeof entry.cooperationReveal === 'string' && entry.cooperationReveal.length >= 15);
    const parts = ['creator', 'collaborator'].map(role => coopHalfLevel(level, role));
    for (const part of parts) {
        shuffle.assertOutline(part.correctColorArr, part.initRandomColorArr);
        assert.equal(shuffle.matchingCellCount(part.correctColorArr, part.initRandomColorArr), shuffle.minimumMatchCount(part.correctColorArr));
        const inventory = grid => [...shuffle.colorInventory(grid)].sort((a, b) => a[0] - b[0]);
        assert.deepEqual(inventory(part.correctColorArr), inventory(part.initRandomColorArr));
    }
}

console.log('COOP_FINALE_LEVELS_PASSED: nine themes, rising score, balanced inventories and deterministic shuffle contracts');
