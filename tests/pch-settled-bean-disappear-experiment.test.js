const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const conveyor = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const view = read('assets/Scripts/Core/GameplayViewController.ts');
const rules = read('assets/Scripts/Core/PchConveyorRules.ts');

assert.ok(
    conveyor.includes('const PCH_SETTLED_PIXEL_BLOCK_EXPERIMENT = true;'),
    'the settled-pixel-block experiment must be explicitly enabled in one place',
);
assert.match(
    conveyor,
    /shouldRenderSettledPixelBlock\(row: number, col: number\): boolean \{[\s\S]*?this\.runtime\._activeGameplayEntryMode === 'theme'[\s\S]*?this\.rules\?\.board\.locked\?\.\[row\]\?\.\[col\] === true;/,
    'the experiment must use the authoritative locked board state',
);
// Execute the production rendering methods together: locked beans become pixels,
// while unlocked beans and external previews retain their existing appearance.
function loadMethod(source, className, methodName, dependencies = {}) {
    const file = ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true);
    const declaration = file.statements.find(node => ts.isClassDeclaration(node) && node.name.text === className);
    const method = declaration.members.find(node => node.name?.getText(file) === methodName);
    assert.ok(method, `missing ${className}.${methodName}`);
    const script = ts.transpileModule(`class Subject { ${method.getText(file)} }`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return new Function(...Object.keys(dependencies), `${script}; return Subject.prototype.${methodName};`)(...Object.values(dependencies));
}
const shouldRenderPixel = loadMethod(conveyor, 'PchConveyorGameplayController', 'shouldRenderSettledPixelBlock', {
    PCH_SETTLED_PIXEL_BLOCK_EXPERIMENT: true,
});
class Sprite {}
const syncPixel = loadMethod(view, 'GameplayViewController', 'syncSettledPixelBlock');
const renderCell = loadMethod(view, 'GameplayViewController', 'renderCell', { Sprite });
const renderBoardCell = loadMethod(view, 'GameplayViewController', 'renderBoardCell');
for (const mode of ['main', 'theme', 'external']) {
    const board = { correctColors: [[2]], currentColors: [[2]], locked: [[false]] };
    const sprite = { enabled: true };
    const runtime = {
        _activeGameplayEntryMode: mode,
        boardModel: board,
        cellNodes: [[{ getComponent: () => sprite }]],
        _flyingTargets: new Set(), _hiddenBoardCells: new Set(),
        setNodeSquareSize() {}, getBoardBeanVisualSize: () => 20,
        getBeanSpriteFrame: () => 'bean', requireRenderReadySpriteFrame: frame => frame,
    };
    let active = true;
    const controller = { runtime, rules: { board }, isActive: () => active };
    controller.shouldRenderSettledPixelBlock = shouldRenderPixel;
    runtime._pchConveyorGameplayController = controller;
    let settled = false;
    const renderer = { setCellSettled: (_row, _col, value) => { settled = value; } };
    const context = {
        runtime, getBoardSlotBatchRenderers: () => [renderer],
        markBoardSlotBatchRenderersForUpdate: () => true,
        syncSettledPixelBlock: syncPixel, renderCell,
    };
    for (const locked of [false, true, false]) {
        board.locked[0][0] = locked;
        renderBoardCell.call(context, 0, 0);
        const expectedPixel = locked && mode !== 'external';
        assert.strictEqual(settled, expectedPixel, `${mode}: pixel tracks lock state`);
        assert.strictEqual(sprite.enabled, !expectedPixel, `${mode}: bean and pixel never overlap`);
        assert.strictEqual(board.currentColors[0][0], 2, 'rendering must preserve gameplay color');
        assert.strictEqual(runtime._activeGameplayEntryMode, mode, 'rendering must preserve progress/analytics mode');
    }
    board.locked[0][0] = true;
    runtime._flyingTargets.add('0,0');
    renderBoardCell.call(context, 0, 0);
    assert.strictEqual(settled, false, `${mode}: flying target must not become a pixel before arrival`);
    assert.strictEqual(sprite.enabled, false, `${mode}: flying target must not show a stationary bean`);
    runtime._flyingTargets.delete('0,0');
    renderBoardCell.call(context, 0, 0);
    assert.strictEqual(settled, mode !== 'external', `${mode}: arrival reveals the settled pixel`);
    active = false;
    assert.strictEqual(shouldRenderPixel.call(controller, 0, 0), false, 'inactive gameplay must not render settled pixels');
    active = true;
    assert.strictEqual(shouldRenderPixel.call(controller, 9, 9), false, 'missing cells must not render settled pixels');
}
assert.ok(
    view.includes('runtime._pchConveyorGameplayController?.shouldRenderSettledPixelBlock?.(row, col) === true'),
    'the shared board renderer must hide settled beans for automatic and prop returns',
);
assert.ok(
    view.includes('this.syncSettledPixelBlock(row, col);')
        && view.includes('this.syncAllSettledPixelBlocks();'),
    'settled target colors must remain rendered while the batched slot recess changes',
);
assert.ok(
    view.includes("throw new Error('[pch-settled-pixel] board slot batch renderer is unavailable')"),
    'a settled cell must fail explicitly instead of falling back to a visible recess',
);
const batchRenderer = read('assets/Scripts/Core/BoardSlotBatchRenderer.ts');
assert.ok(
    batchRenderer.includes('setCellSettled(row: number, col: number, settled: boolean)')
        && batchRenderer.includes('const half = cell.size / 2;')
        && batchRenderer.includes('cell.settled ? settledSampleU : cell.uv[uvIndex]'),
    'settled slot quads must keep their pixel size and sample only the target color outside the recess',
);
assert.ok(
    view.includes('const colorId = shouldHideBean ? 0 : colorIdRaw;'),
    'the experiment must suppress only the bean sprite while preserving board data',
);
assert.ok(
    rules.includes('this.board.currentColors[target.row][target.col] = colorId;')
        && rules.includes('this.board.setLocked(target.row, target.col, true);'),
    'settled beans must still commit their color and lock state for completion',
);

console.log('pch-settled-bean-disappear-experiment.test.js passed');
