'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const rulesPath = path.join(root, 'assets/Scripts/Core/PchConveyorRules.ts');
const compiled = ts.transpileModule(fs.readFileSync(rulesPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: rulesPath,
    reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).length, 0, 'PCH rules must transpile');

const moduleUnderTest = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(
    moduleUnderTest,
    moduleUnderTest.exports,
    (request) => {
        if (request !== './LevelConfig') throw new Error(`unexpected dependency: ${request}`);
        return {
            CONVEYOR_STACK_DEPTH: 3,
            validateConveyorCapacity(value) {
                if (!Number.isInteger(value) || value <= 0) throw new Error('invalid capacity');
                return value;
            },
            validatePchSingleSelectionLimit(value) { return value ?? 12; },
        };
    },
);
const { PchConveyorRules } = moduleUnderTest.exports;

class Board {
    constructor() {
        this.width = 1;
        this.height = 1;
        this.correctColors = [[1]];
        this.currentColors = [[0]];
        this.locked = [[false]];
    }

    getConnectedBlock() { return null; }
    setLocked(row, col, value) { this.locked[row][col] = value; }
    isAllLocked() { return false; }
}

const rules = new PchConveyorRules(new Board(), 80, undefined, 20);
assert.equal(rules.initialCarrierCount, 20, 'scene-authored carrier count must override the initial capacity-derived count');
assert.equal(rules.carrierCount, 20, '80 initial capacity must not create additional carriers');
assert.deepEqual(
    Array.from({ length: rules.carrierCount }, (_, index) => rules.getCarrierCapacity(index)),
    Array(20).fill(4),
    '80 initial capacity must provide four layers on each existing carrier',
);
assert.throws(
    () => rules.addBufferSlots(1),
    /positive multiple of 3/,
    'runtime expansion must keep the three-bean increment contract',
);
assert.equal(rules.addBufferSlots(12), 12);
assert.equal(rules.carrierCount, 20, 'the existing +12 grant must keep the same carriers');
assert.deepEqual(
    Array.from({ length: rules.carrierCount }, (_, index) => rules.getCarrierCapacity(index)),
    [...Array(12).fill(5), ...Array(8).fill(4)],
    'opening and runtime capacity use the same distribution rule',
);
assert.throws(
    () => new PchConveyorRules(new Board(), 80, undefined, 0),
    /initialCarrierCount must be a positive integer/,
    'invalid authored carrier count must fail fast',
);
const genericRules = new PchConveyorRules(new Board(), 80);
assert.equal(genericRules.initialCarrierCount, 27, 'generic rules must round uneven capacity up to a whole carrier count');
assert.equal(genericRules.getCarrierCapacity(0), 3);
assert.equal(genericRules.getCarrierCapacity(26), 2);

const controller = fs.readFileSync(path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8');
const controllerCompiled = ts.transpileModule(controller, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
});
assert.equal((controllerCompiled.diagnostics || []).length, 0, 'PCH controller must transpile');
assert.match(controller, /const PCH_SCENE_CARRIER_COUNT = 20;/);
assert.match(
    controller,
    /new PchConveyorRules\(\s*this\.runtime\.boardModel,\s*this\.runtime\.levelData\?\.conveyorCapacity,\s*this\.runtime\.levelData\?\.singleSelectionLimit,\s*PCH_SCENE_CARRIER_COUNT,\s*\)/,
);

console.log('pch-initial-capacity-fixed-carriers.test.js passed');
