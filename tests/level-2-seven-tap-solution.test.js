const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const moduleCache = new Map();

function loadTsModule(filePath) {
    const absolutePath = path.resolve(filePath.endsWith('.ts') ? filePath : `${filePath}.ts`);
    if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
    const module = { exports: {} };
    moduleCache.set(absolutePath, module);
    const output = ts.transpileModule(fs.readFileSync(absolutePath, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const sandbox = {
        exports: module.exports,
        module,
        require(request) {
            if (request.startsWith('.')) {
                return loadTsModule(path.resolve(path.dirname(absolutePath), request));
            }
            return require(request);
        },
        console,
    };
    vm.runInNewContext(output, sandbox, { filename: absolutePath });
    return module.exports;
}

function findMovableBlock(boardModel, colorId) {
    for (let row = 0; row < boardModel.height; row++) {
        for (let col = 0; col < boardModel.width; col++) {
            if (boardModel.currentColors[row][col] !== colorId || boardModel.locked[row][col]) continue;
            const block = boardModel.getConnectedBlock(row, col);
            if (block) return block;
        }
    }
    return null;
}

const { BoardModel } = loadTsModule(path.join(root, 'assets/Scripts/Core/BoardModel.ts'));
const { SlotModel } = loadTsModule(path.join(root, 'assets/Scripts/UI/SlotCtrl.ts'));
const level2 = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData/level_2.json'), 'utf8'));
const boardModel = new BoardModel(level2);
const slotModel = new SlotModel(48);

assert.strictEqual(level2.correctColorArr.flat().filter(Boolean).length, 440, 'the accepted silhouette must retain all 440 occupied cells');
assert.strictEqual(new Set(level2.correctColorArr.flat().filter(Boolean)).size, 4, 'the accepted silhouette must use exactly four colors');

const firstBlock = findMovableBlock(boardModel, 10);
assert.ok(firstBlock, 'the buffered red block must be present');
assert.strictEqual(firstBlock.cells.length, 48, 'the buffered block must exactly fit the unlocked slots');
boardModel.removeBlock(firstBlock);
for (const cell of firstBlock.cells) {
    assert.notStrictEqual(slotModel.store({ colorId: 10, cells: [cell], isLocked: false, source: 'slot' }), -1, 'all 48 buffered red beans must fit');
}

const counterpart = findMovableBlock(boardModel, 20);
assert.ok(counterpart, 'the off-white counterpart block must remain selectable');
assert.strictEqual(counterpart.cells.length, 48, 'the counterpart block must contain 48 beans');
boardModel.removeBlock(counterpart);
const counterpartResult = boardModel.placeBlockMaximize(counterpart, 19, 15);
assert.deepStrictEqual(
    [counterpartResult.placed.length, counterpartResult.remaining],
    [48, 0],
    'the counterpart must lock into the first empty region in one normal placement',
);

const bufferedBlock = slotModel.takeAllSameColor(0);
assert.ok(bufferedBlock, 'the buffered red block must be selectable from the slots');
assert.strictEqual(bufferedBlock.cells.length, 48, 'slot selection must merge all 48 same-color beans');
const bufferedResult = boardModel.placeBlockMaximize(bufferedBlock, 21, 14);
assert.deepStrictEqual(
    [bufferedResult.placed.length, bufferedResult.remaining],
    [48, 0],
    'the buffered block must lock into the final empty region in one normal placement',
);

assert.strictEqual(slotModel.getAll().filter(Boolean).length, 0, 'the slot buffer must be empty after the seventh tap');
assert.strictEqual(boardModel.isAllLocked(), true, 'the real BoardModel win predicate must pass after seven normal taps');

console.log('level-2-seven-tap-solution.test.js passed');
