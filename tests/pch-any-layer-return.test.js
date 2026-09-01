'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const rulesPath = path.join(projectRoot, 'assets/Scripts/Core/PchConveyorRules.ts');
const compiled = ts.transpileModule(fs.readFileSync(rulesPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: rulesPath,
    reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).length, 0, 'conveyor return rules must transpile');

const moduleUnderTest = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(
    moduleUnderTest,
    moduleUnderTest.exports,
    (request) => {
        if (request !== './LevelConfig') throw new Error(`unexpected dependency: ${request}`);
        return {
            CONVEYOR_STACK_DEPTH: 3,
            validateConveyorCapacity(value) {
                if (!Number.isInteger(value) || value <= 0 || value % 3 !== 0) throw new Error('invalid capacity');
                return value;
            },
            validatePchSingleSelectionLimit(value) { return value ?? 12; },
        };
    },
);
const { PchConveyorRules } = moduleUnderTest.exports;

class Board {
    constructor(correctColors) {
        this.height = correctColors.length;
        this.width = correctColors[0].length;
        this.correctColors = correctColors;
        this.currentColors = correctColors.map((row) => row.map(() => 0));
        this.locked = correctColors.map((row) => row.map(() => false));
    }

    getConnectedBlock() { return null; }
    setLocked(row, col, value) { this.locked[row][col] = value; }
    isAllLocked() { return false; }
}

const lowerLayerBoard = new Board([[1]]);
const lowerLayerRules = new PchConveyorRules(lowerLayerBoard, 3);
lowerLayerRules.carriers[0].push(1, 2);
const lowerLayerResult = lowerLayerRules.autoPlaceAvailableLayers(0);
assert.equal(lowerLayerResult.moved, 1, 'a matching lower layer must return');
assert.deepEqual(lowerLayerResult.colorIds, [1]);
assert.deepEqual(lowerLayerResult.sourceLayerIndices, [0]);
assert.deepEqual(lowerLayerRules.carriers[0], [2], 'the unmatched upper bean must remain stored');
assert.deepEqual(lowerLayerBoard.currentColors, [[1]]);
assert.deepEqual(lowerLayerBoard.locked, [[true]]);

const stackedBoard = new Board([[2, 1]]);
const stackedRules = new PchConveyorRules(stackedBoard, 3);
stackedRules.carriers[0].push(1, 2);
const stackedResult = stackedRules.autoPlaceAvailableLayers(0);
assert.deepEqual(stackedResult.colorIds, [2, 1], 'matching layers must still return from top to bottom');
assert.deepEqual(stackedResult.sourceLayerIndices, [1, 0], 'each animation must retain its pre-removal source layer');
assert.deepEqual(stackedRules.carriers[0], []);

const fullBoard = new Board([[1]]);
const fullRules = new PchConveyorRules(fullBoard, 3);
fullRules.carriers[0].push(1, 2, 2);
assert.equal(fullRules.isBufferDeadlocked(), false, 'a lower matching layer must prevent a false full-buffer loss');

const controllerSource = fs.readFileSync(
    path.join(projectRoot, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);
assert.match(controllerSource, /autoPlaceAvailableLayers\(carrierIndex\)/);
assert.match(controllerSource, /sourceLayers\[result\.sourceLayerIndices\[index\]\]/);

console.log('pch-any-layer-return.test.js passed');
