const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const core = `${__dirname}/../assets/Scripts/Core/`;
const cache = {};
function load(name) {
    if (cache[name]) return cache[name];
    const exports = {};
    const js = ts.transpileModule(fs.readFileSync(core + name + '.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function('exports', 'require', js)(exports, key => {
        if (key === 'cc/env') return { PREVIEW: true };
        if (key === './MiniGamePlatform') return { isMiniGameRuntime: () => false };
        return load(key.replace('./', ''));
    });
    return cache[name] = exports;
}
const { BoardModel } = load('BoardModel');
const { PchConveyorRules } = load('PchConveyorRules');
const { selectOriginalBeans } = load('OriginalBeanSelection');
const { resolveBeanSelectionPreview: preview } = load('BeanSelectionPreview');
const board = (targets, beans) => new BoardModel({
    boardWidth: targets[0].length, boardHeight: targets.length,
    correctColorArr: targets, initRandomColorArr: beans,
});
const grid = (size, color) => Array.from({ length: size }, () => Array(size).fill(color));
const coords = block => block.cells.map(c => [c.row, c.col]);

// Golden order decoded from original j126924 + stable SelectDepth sort.
let b = board(grid(3, 2), grid(3, 1));
assert.deepEqual(coords(selectOriginalBeans(b, 1, 1, 12)),
    [[1, 1], [2, 0], [2, 1], [2, 2], [1, 0], [1, 2], [0, 0], [0, 1], [0, 2]]);
assert.deepEqual(coords(selectOriginalBeans(b, 1, 1, 3)), [[1, 1], [2, 0], [2, 1]]);
assert.deepEqual(coords(selectOriginalBeans(b, 1, 1, 1)), [[1, 1]]);
assert.deepEqual(coords(selectOriginalBeans(b, 0, 0, 4)), [[0, 0], [1, 0], [1, 1], [0, 1]]);

// Same current colors, competing target colors: A prefers top; original B prefers its first layer order.
const targets = grid(3, 3); targets[1][1] = 2; targets[0][1] = 2;
b = board(targets, grid(3, 1));
assert.deepEqual(coords(new PchConveyorRules(b, 60, 2).selectBoard(1, 1)), [[1, 1], [0, 1]]);
assert.deepEqual(coords(selectOriginalBeans(b, 1, 1, 2)), [[1, 1], [2, 0]]);
assert.deepEqual(b.currentColors, grid(3, 1), 'selection does not mutate the board');

// Locked/empty/absent cells cannot bridge to an isolated same-color region.
b = board([[2, 1, 2], [0, 0, 0], [2, 2, 2]], [[1, 1, 1], [0, 0, 0], [1, 1, 1]]);
assert.deepEqual(coords(selectOriginalBeans(b, 0, 0, 12)), [[0, 0]]);
for (const [r, c] of [[0, 1], [1, 1], [-1, 0], [3, 0]]) assert.equal(selectOriginalBeans(b, r, c, 12), null);
b = board([[2, 0], [0, 2]], [[1, 0], [0, 1]]);
assert.equal(selectOriginalBeans(b, 0, 0, 12).cells.length, 2, 'diagonal connectivity');

// Both paths feed the same capacity limiter; no extra beans disappear when only 2 slots remain.
b = board(grid(5, 2), grid(5, 1));
const rules = new PchConveyorRules(b, 12, 12);
rules.storeBlock(selectOriginalBeans(b, 2, 2, 10), 0);
const move = rules.storeBlock(selectOriginalBeans(b, 0, 0, 12), 0);
assert.equal(move.moved, 2);
assert.equal(b.currentColors.flat().filter(Boolean).length, 13);
assert.equal(rules.bufferCount, 12);

assert.equal(preview(true, '?level=2&pick=B', 'main', 2), 'B');
assert.equal(preview(true, '?level=2&pick=A', 'main', 2), 'A');
assert.equal(preview(true, '?level=2', 'main', 2), 'A');
assert.equal(preview(false, '?pick=B', 'main', 2), 'A', 'release excluded');
assert.equal(preview(true, '?pick=B', 'main', 1), 'A', 'first level excluded');
for (const mode of ['pvp', 'coop', 'theme', '']) assert.equal(preview(true, '?pick=B', mode, 2), 'A', mode);
assert.throws(() => preview(true, '?pick=C', 'main', 2), /参数无效/);
console.log('original bean selection: order, priority, boundaries, capacity, preview gates passed');
