const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/EndgameHintModule.ts'),
    'utf8',
);
const pchSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);
const output = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;

const moduleRef = { exports: {} };
vm.runInNewContext(output, {
    module: moduleRef,
    exports: moduleRef.exports,
    require(request) {
        if (request === '../GameCtrlShared') {
            return new Proxy({}, {
                get() {
                    return class RuntimeStub {};
                },
            });
        }
        throw new Error(`unexpected require: ${request}`);
    },
    console,
    Map,
    Set,
}, { filename: 'EndgameHintModule.ts' });

const node = (id) => ({ id, isValid: true });
const shown = [];
const cleared = [];
const runtime = {
    boardModel: {
        width: 4,
        height: 2,
        correctColors: [
            [1, 1, 1, 1],
            [1, 0, 1, 1],
        ],
        currentColors: [
            [2, 0, 3, 4],
            [5, 9, 6, 7],
        ],
        locked: [
            [false, false, false, true],
            [true, false, true, false],
        ],
    },
    cellNodes: [
        [node('0,0'), node('0,1'), node('0,2'), node('0,3')],
        [node('1,0'), node('1,1'), node('1,2'), node('1,3')],
    ],
    slotModel: {
        getAll() {
            throw new Error('board-only hints must not read slotModel');
        },
    },
    slotNodes: [node('slot:0')],
    cellSize: 44,
    isGameEnd: false,
    _skillActive: false,
    isSelected: false,
    _flyingTargets: new Set(),
};

moduleRef.exports.installEndgameHintModule(runtime);
Object.assign(runtime, {
    ensureEndgameHintPrefab(onDone) {
        onDone();
    },
    ensureEndgameHintStarFrames(onDone) {
        onDone([{}]);
    },
    showEndgameHints(cells, reason) {
        shown.push({
            cells: JSON.parse(JSON.stringify(cells)),
            reason,
        });
    },
    clearEndgameHints(destroy) {
        cleared.push(destroy);
    },
});

assert.strictEqual(typeof runtime.collectEndgameBoardBeans, 'function');
assert.strictEqual(runtime.collectEndgameIncompleteCells, undefined);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(runtime.collectEndgameBoardBeans())),
    [
        { row: 0, col: 0, colorId: 2 },
        { row: 0, col: 2, colorId: 3 },
        { row: 1, col: 3, colorId: 7 },
    ],
    'only physical, unlocked beans inside pattern cells must count',
);

runtime.refreshEndgameHints('three-board-beans');
assert.strictEqual(shown.length, 1, 'exactly three board beans must show hints');
assert.strictEqual(cleared.length, 0);
assert.deepStrictEqual(shown[0].cells, [
    { row: 0, col: 0, colorId: 2 },
    { row: 0, col: 2, colorId: 3 },
    { row: 1, col: 3, colorId: 7 },
]);

const targets = runtime.buildEndgameHintTargets(runtime.collectEndgameBoardBeans());
assert.deepStrictEqual(
    Array.from(targets, (target) => `${target.key}:${target.parent.id}:${target.size}`),
    [
        'board:0,0:0,0:52',
        'board:0,2:0,2:52',
        'board:1,3:1,3:52',
    ],
    'hint targets must contain board cells only',
);

runtime.boardModel.currentColors[0][1] = 8;
runtime.refreshEndgameHints('four-board-beans');
assert.strictEqual(shown.length, 1, 'four board beans must not show hints');
assert.deepStrictEqual(cleared, [false]);

runtime.boardModel.currentColors[0][0] = 0;
runtime.boardModel.currentColors[0][1] = 0;
runtime.boardModel.currentColors[0][2] = 0;
runtime.boardModel.currentColors[1][3] = 0;
runtime.refreshEndgameHints('all-beans-on-conveyor');
assert.strictEqual(shown.length, 1, 'an empty playable board must not show hints');
assert.deepStrictEqual(cleared, [false, false]);

runtime.boardModel.currentColors[1][3] = 7;
runtime.refreshEndgameHints('one-board-bean');
assert.strictEqual(shown.length, 2, 'one remaining board bean must show a hint');
assert.deepStrictEqual(shown[1].cells, [{ row: 1, col: 3, colorId: 7 }]);

const pchStoreStart = pchSource.indexOf('    private handleBoardTap(');
const pchStoreEnd = pchSource.indexOf('    private handleCarrierAtEntrance(', pchStoreStart);
assert.ok(pchStoreStart >= 0 && pchStoreEnd > pchStoreStart, 'PCH board-store section must exist');
const pchStore = pchSource.slice(pchStoreStart, pchStoreEnd);
const storeIndex = pchStore.indexOf('this.rules.storeBlock(');
const renderIndex = pchStore.indexOf('this.runtime.renderBoardCells(result.boardCells);');
const hintIndex = pchStore.indexOf("this.runtime.refreshEndgameHints?.('pch-store');");
const animateIndex = pchStore.indexOf('this.animateBeanIntoConveyor(');
assert.ok(
    storeIndex >= 0
        && storeIndex < renderIndex
        && renderIndex < hintIndex
        && hintIndex < animateIndex,
    'PCH storage must refresh board-only hints after data/render commit and before conveyor flight',
);

console.log('endgame-board-hint.test.js passed');
