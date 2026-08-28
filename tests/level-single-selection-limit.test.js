'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

const levelDir = path.join(root, 'assets', 'LevelData');
const levelFiles = fs.readdirSync(levelDir).filter((name) => /^level_\d+\.json$/.test(name));
const level2 = readJson('assets/LevelData/level_2.json');
assert.equal(level2.singleSelectionLimit, 18, 'formal level 2 must select at most 18 beans per tap');
for (const name of levelFiles) {
    if (name === 'level_2.json') continue;
    const level = JSON.parse(fs.readFileSync(path.join(levelDir, name), 'utf8'));
    assert.equal(
        Object.hasOwn(level, 'singleSelectionLimit'),
        false,
        `${name} must retain the shared default instead of receiving a level override`,
    );
}

const levelConfig = read('assets/Scripts/Core/LevelConfig.ts');
assert.match(levelConfig, /DEFAULT_PCH_SINGLE_SELECTION_LIMIT\s*=\s*12/);
assert.match(levelConfig, /singleSelectionLimit\?:\s*number;/);
assert.match(levelConfig, /validatePchSingleSelectionLimit\(/);

const rules = read('assets/Scripts/Core/PchConveyorRules.ts');
assert.match(rules, /validatePchSingleSelectionLimit/);
assert.match(rules, /public readonly moveLimit:\s*number;/);
assert.match(rules, /this\.moveLimit\s*=\s*validatePchSingleSelectionLimit\(/);

const controller = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
assert.match(controller, /this\.runtime\.levelData\?\.singleSelectionLimit/);
assert.match(controller, /const PCH_EXPAND_CAPACITY = 12;/, 'the unrelated +12 capacity grant must remain unchanged');

console.log('level-single-selection-limit.test.js passed');
