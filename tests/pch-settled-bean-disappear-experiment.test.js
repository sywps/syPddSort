const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
assert.ok(
    !/shouldRenderSettledPixelBlock\(row: number, col: number\): boolean \{[\s\S]*?_activeGameplayEntryMode === 'main'/.test(conveyor),
    'mainline gameplay must not opt into settled pixel blocks',
);
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
    rules.includes('this.board.currentColors[row][col] = colorId;')
        && rules.includes('this.board.setLocked(row, col, true);'),
    'settled beans must still commit their color and lock state for completion',
);

console.log('pch-settled-bean-disappear-experiment.test.js passed');
