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
const { getSlotUnlockModeForPolicy, resolveSlotRowPolicy } = loadTsModule(path.join(root, 'assets/Scripts/Core/SlotOnboardingPolicy.ts'));
const level2 = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData/level_2.json'), 'utf8'));
const boardModel = new BoardModel(level2);
const slotModel = new SlotModel(12);

assert.strictEqual(level2.correctColorArr.flat().filter(Boolean).length, 96, 'the historical silhouette must retain all 96 occupied cells');
assert.strictEqual(new Set(level2.correctColorArr.flat().filter(Boolean)).size, 6, 'the historical silhouette must retain its six colors');
assert.strictEqual(level2.timeLimit, 600, 'the guide-free historical level must use the configured ten-minute limit');
assert.strictEqual(level2.tutorialGuide, undefined, 'stable level 2 must not declare a tutorial');
assert.deepStrictEqual(level2.slotPolicy, {
    defaultRows: 1,
    freeUnlockRows: 0,
    adUnlockRows: 1,
}, 'stable level 2 must start with one ready row plus one optional rewarded unlock row');
const slotRowPolicy = resolveSlotRowPolicy({
    levelId: level2.levelId,
    entryMode: 'main',
    maxRows: 4,
    configuredSlotPolicy: level2.slotPolicy,
});
assert.deepStrictEqual(
    [slotRowPolicy.unlockedRows, slotRowPolicy.rowCount, getSlotUnlockModeForPolicy(slotRowPolicy, slotRowPolicy.unlockedRows)],
    [1, 2, 'ad'],
    'stable level 2 must start with one usable row and route the second-row button through rewarded ads',
);

const firstBlock = findMovableBlock(boardModel, 13);
assert.ok(firstBlock, 'the buffered blue block must be present');
assert.strictEqual(firstBlock.cells.length, 12, 'the buffered block must fit one slot row');
boardModel.removeBlock(firstBlock);
for (const cell of firstBlock.cells) {
    assert.notStrictEqual(slotModel.store({ colorId: 13, cells: [cell], isLocked: false, source: 'slot' }), -1, 'all 12 buffered beans must fit');
}

const counterpart = findMovableBlock(boardModel, 20);
assert.ok(counterpart, 'the off-white counterpart block must be selectable');
assert.strictEqual(counterpart.cells.length, 12, 'the counterpart block must contain 12 beans');
boardModel.removeBlock(counterpart);
const counterpartResult = boardModel.placeBlockMaximize(counterpart);
assert.deepStrictEqual(
    [counterpartResult.placed.length, counterpartResult.remaining],
    [12, 0],
    'the counterpart must lock into the first empty region in one normal placement',
);

const bufferedBlock = slotModel.takeAllSameColor(0);
assert.ok(bufferedBlock, 'the buffered blue block must be selectable from the slots');
assert.strictEqual(bufferedBlock.cells.length, 12, 'slot selection must merge all 12 same-color beans');
const bufferedResult = boardModel.placeBlockMaximize(bufferedBlock);
assert.deepStrictEqual(
    [bufferedResult.placed.length, bufferedResult.remaining],
    [12, 0],
    'the buffered block must lock into the final empty region in one normal placement',
);

assert.strictEqual(slotModel.getAll().filter(Boolean).length, 0, 'the slot buffer must be empty after the six-action swap');
assert.strictEqual(boardModel.isAllLocked(), true, 'the real BoardModel win predicate must pass without a guide');

console.log('level-2-no-guide-solution.test.js passed');
