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
assert.equal((compiled.diagnostics || []).length, 0, 'PCH selection rules must transpile');

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

const CONNECT_DIRS = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
];

class Board {
    constructor(correctColors, currentColors) {
        this.height = correctColors.length;
        this.width = correctColors[0].length;
        this.correctColors = correctColors;
        this.currentColors = currentColors;
        this.locked = currentColors.map((row) => row.map(() => false));
        this.lastPreferredCorrectColor = 0;
        this.lastBroadBlockSize = 0;
    }

    getConnectedBlock(row, col, preferredCorrectColor) {
        this.lastPreferredCorrectColor = preferredCorrectColor;
        const colorId = this.currentColors[row]?.[col] || 0;
        if (colorId <= 0 || this.locked[row]?.[col]) return null;
        const cells = [];
        const queue = [{ row, col }];
        const visited = new Set([row * this.width + col]);
        for (let head = 0; head < queue.length; head += 1) {
            const cell = queue[head];
            cells.push(cell);
            for (const [dr, dc] of CONNECT_DIRS) {
                const nextRow = cell.row + dr;
                const nextCol = cell.col + dc;
                if (nextRow < 0 || nextRow >= this.height || nextCol < 0 || nextCol >= this.width) continue;
                const key = nextRow * this.width + nextCol;
                if (visited.has(key)
                    || this.currentColors[nextRow][nextCol] !== colorId
                    || this.locked[nextRow][nextCol]) continue;
                visited.add(key);
                queue.push({ row: nextRow, col: nextCol });
            }
        }
        this.lastBroadBlockSize = cells.length;
        return { colorId, cells, isLocked: false, source: 'board' };
    }

    setLocked(row, col, value) { this.locked[row][col] = value; }
    isAllLocked() { return false; }
}

const bridgeBoard = new Board(
    [
        [0, 0, 4],
        [0, 2, 0],
        [4, 4, 0],
    ],
    [
        [0, 0, 1],
        [0, 1, 0],
        [1, 1, 0],
    ],
);
const bridgeRules = new PchConveyorRules(bridgeBoard, 60);
const bridgeSelection = bridgeRules.selectBoard(2, 0);
assert.ok(bridgeSelection);
assert.equal(bridgeBoard.lastPreferredCorrectColor, 4, 'the clicked target color must remain authoritative');
assert.equal(bridgeBoard.lastBroadBlockSize, 4, 'the broad same-bean-color block must include the remote bean through its other-target bridge');
assert.deepEqual(
    bridgeSelection.cells,
    [{ row: 2, col: 0 }, { row: 2, col: 1 }],
    'a different-target bean must not bridge a remote same-target bean into the final selection',
);

const diagonalBoard = new Board(
    [[0, 4], [4, 0]],
    [[0, 1], [1, 0]],
);
const diagonalSelection = new PchConveyorRules(diagonalBoard, 60).selectBoard(1, 0);
assert.deepEqual(
    diagonalSelection?.cells,
    [{ row: 1, col: 0 }, { row: 0, col: 1 }],
    'same-target diagonal beans must remain connected under the existing eight-direction rule',
);

const limitedBoard = new Board(
    [[4, 4, 4, 4]],
    [[1, 1, 1, 1]],
);
const limitedSelection = new PchConveyorRules(limitedBoard, 60, 2).selectBoard(0, 0);
assert.deepEqual(
    limitedSelection?.cells,
    [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    'the selection limit must keep a connected BFS prefix',
);

console.log('pch-connected-target-selection.test.js passed');
