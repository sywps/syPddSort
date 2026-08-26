'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateConveyorCapacity } = require('../scripts/conveyor-capacity-contract');

const root = path.resolve(__dirname, '..');
const dbtDir = path.join(root, 'tools', 'dbt');
const aggregate = JSON.parse(fs.readFileSync(path.join(dbtDir, 'levels_original_1_182_gameplay_v2.json'), 'utf8'));
const expectedKeys = [
    'levelId',
    'boardWidth',
    'boardHeight',
    'timeLimit',
    'slotTotalCount',
    'conveyorCapacity',
    'correctColorArr',
    'initRandomColorArr',
];

assert.equal(aggregate.level_count, 182);
const sourceById = new Map(aggregate.levels.map((level) => [level.level_id, level]));
for (let levelId = 1; levelId <= aggregate.level_count; levelId += 1) {
    const filename = `level_${levelId}.json`;
    const level = JSON.parse(fs.readFileSync(path.join(dbtDir, filename), 'utf8'));
    assert.deepEqual(Object.keys(level), expectedKeys, `${filename} online keys`);
    assert.equal(level.levelId, levelId, `${filename} internal ID`);
    assert.equal(validateConveyorCapacity(level, filename), 60, `${filename} conveyor capacity`);
    assert.equal(level.correctColorArr.length, level.boardHeight, `${filename} target height`);
    assert.equal(level.initRandomColorArr.length, level.boardHeight, `${filename} initial height`);
    const source = sourceById.get(levelId);
    const sourceRowStart = source.map.bounds.row_start;
    const sourceOccupiedByRow = Array.from({ length: level.boardHeight }, () => 0);
    for (const cell of source.map.cells) sourceOccupiedByRow[cell.row - sourceRowStart] += 1;
    const outputOccupiedByRow = level.correctColorArr.map((row) => row.filter((color) => color > 0).length);
    assert.deepEqual(
        outputOccupiedByRow,
        sourceOccupiedByRow.reverse(),
        `${filename} vertically flipped orientation`,
    );

    const countColors = (grid) => {
        const counts = new Map();
        for (const row of grid) {
            assert.equal(row.length, level.boardWidth, `${filename} row width`);
            for (const color of row) {
                assert.ok(Number.isInteger(color) && color >= 0 && color <= 20, `${filename} online color ${color}`);
                if (color > 0) counts.set(color, (counts.get(color) || 0) + 1);
            }
        }
        return [...counts.entries()].sort((left, right) => left[0] - right[0]);
    };

    const targetInventory = countColors(level.correctColorArr);
    const initialInventory = countColors(level.initRandomColorArr);
    assert.deepEqual(initialInventory, targetInventory, `${filename} color inventory`);
    assert.equal(
        targetInventory.reduce((total, entry) => total + entry[1], 0),
        level.slotTotalCount,
        `${filename} filled cells`,
    );
}

const serverSource = fs.readFileSync(path.join(root, 'tools', 'server.py'), 'utf8');
assert.match(serverSource, /ONLINE_LEVEL_KEYS\s*=\s*\([\s\S]*?'conveyorCapacity'/);

console.log('DBT online level contract tests passed');
