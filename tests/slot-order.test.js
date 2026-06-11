const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const BEIGE = 6;
const WHITE = 9;

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

class SlotModelHarness {
    constructor(count) {
        this.slots = new Array(count).fill(null);
    }

    store(block) {
        let firstEmpty = -1;
        let lastSameColor = -1;
        for (let i = 0; i < this.slots.length; i++) {
            if (this.slots[i] && this.slots[i].colorId === block.colorId) lastSameColor = i;
            if (this.slots[i] === null && firstEmpty === -1) firstEmpty = i;
        }
        if (firstEmpty === -1) return -1;

        let insertAt = firstEmpty;
        if (lastSameColor >= 0) {
            insertAt = lastSameColor + 1;
            let lastOccupied = -1;
            for (let i = this.slots.length - 1; i >= 0; i--) {
                if (this.slots[i] !== null) {
                    lastOccupied = i;
                    break;
                }
            }
            if (lastOccupied >= this.slots.length - 1 && this.slots[this.slots.length - 1] !== null) return -1;
            for (let i = Math.min(lastOccupied + 1, this.slots.length - 1); i > insertAt; i--) {
                this.slots[i] = this.slots[i - 1];
                if (this.slots[i]) this.slots[i].slotIndex = i;
            }
        }

        block.source = 'slot';
        block.slotIndex = insertAt;
        this.slots[insertAt] = block;
        return insertAt;
    }

    take(index) {
        const block = this.slots[index];
        this.slots[index] = null;
        return block;
    }

    putAt(index, block) {
        if (this.slots[index] !== null) return false;
        block.source = 'slot';
        block.slotIndex = index;
        this.slots[index] = block;
        return true;
    }

    compact() {
        const kept = this.slots.filter(Boolean);
        this.slots = this.slots.map((_, index) => {
            const block = kept[index] || null;
            if (block) block.slotIndex = index;
            return block;
        });
    }
}

function bean(colorId, id) {
    return {
        colorId,
        cells: [{ row: id, col: 0 }],
        isLocked: false,
        source: 'slot',
    };
}

function setupSlots() {
    const model = new SlotModelHarness(4);
    assert.strictEqual(model.putAt(0, bean(BEIGE, 0)), true);
    assert.strictEqual(model.putAt(1, bean(BEIGE, 1)), true);
    assert.strictEqual(model.putAt(2, bean(WHITE, 2)), true);
    assert.strictEqual(model.putAt(3, bean(WHITE, 3)), true);
    return model;
}

function colors(model) {
    return model.slots.map((block) => block?.colorId ?? null);
}

function snapshotSelected(model, indices) {
    return indices.map((slotIndex) => {
        const block = model.slots[slotIndex];
        assert.ok(block, `slot ${slotIndex} should have a block before selection`);
        return {
            slotIndex,
            colorId: block.colorId,
            cells: block.cells.map((cell) => ({ row: cell.row, col: cell.col })),
        };
    });
}

function restoreTailToOriginalSlots(model, block, remainingCount, selectedSnapshot) {
    const consumedCount = block.cells.length - remainingCount;
    let cursor = 0;
    let restoredCount = 0;

    for (const snapshot of selectedSnapshot) {
        const start = cursor;
        const end = start + snapshot.cells.length;
        cursor = end;
        if (end <= consumedCount) continue;

        const keepStart = Math.max(consumedCount - start, 0);
        const keptCells = snapshot.cells.slice(keepStart);
        if (keptCells.length === 0) continue;

        assert.strictEqual(model.putAt(snapshot.slotIndex, {
            colorId: snapshot.colorId,
            cells: keptCells.map((cell) => ({ row: cell.row, col: cell.col })),
            isLocked: false,
            source: 'slot',
        }), true);
        restoredCount += keptCells.length;
    }

    assert.strictEqual(restoredCount, remainingCount);
}

{
    const model = setupSlots();
    const selectedIndices = [0, 1];
    const selectedSnapshot = snapshotSelected(model, selectedIndices);
    const selectedBlock = {
        colorId: BEIGE,
        cells: selectedSnapshot.flatMap((entry) => entry.cells),
        isLocked: false,
        source: 'slot',
    };

    for (const index of selectedIndices) model.take(index);
    restoreTailToOriginalSlots(model, selectedBlock, 1, selectedSnapshot);
    model.compact();

    assert.deepStrictEqual(colors(model), [BEIGE, WHITE, WHITE, null]);
    assert.strictEqual(model.store(bean(BEIGE, 4)), 1);
    assert.deepStrictEqual(colors(model), [BEIGE, BEIGE, WHITE, WHITE]);
}

{
    const model = setupSlots();
    model.take(0);
    model.take(1);
    model.compact();
    model.store(bean(BEIGE, 1));

    assert.deepStrictEqual(colors(model), [WHITE, WHITE, BEIGE, null]);
}

{
    const model = setupSlots();
    model.take(0);
    model.take(1);
    model.compact();

    assert.deepStrictEqual(colors(model), [WHITE, WHITE, null, null]);
}

const placementFx = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
const slotCompaction = read('assets/Scripts/Core/GameCtrlModules/GameplaySlotCompactionModule.ts');
const boardInput = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const tutorialGuide = read('assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts');
const boardModel = read('assets/Scripts/Core/BoardModel.ts');

for (const required of [
    'captureSelectedSlotSnapshot()',
    'removeBlockFromSlotsKeepingGaps()',
    'restoreSlotTailToOriginalSlots(block: BeanBlockInfo, remainingCount: number, selectedSlotSnapshot: SlotSnapshotEntry[])',
    'restoreBlockToSlots(selectedSlotSnapshot: SlotSnapshotEntry[])',
]) {
    assert.ok(slotCompaction.includes(required), `GameplaySlotCompactionModule must include ${required}`);
}

for (const source of [boardInput, tutorialGuide]) {
    assert.ok(source.includes('const selectedSlotSnapshot = block.source === \'slot\''), 'slot placement must snapshot original slot indices');
    assert.ok(source.includes('this.removeBlockFromSlotsKeepingGaps()'), 'slot placement must preserve gaps until placement result is known');
    assert.ok(source.includes('this.restoreSlotTailToOriginalSlots(block, result.remaining, selectedSlotSnapshot)'), 'partial leftovers must restore by original slot index');
    assert.ok(source.includes('if (block.source === \'slot\')'), 'successful slot placement must compact after result handling');
    assert.ok(
        source.includes('this.compactSlotsAfterSelectionConsume()')
            || source.includes('this.compactSlotsAfterSelectionConsume(done)'),
        'successful slot placement must compact after stable restore',
    );
    assert.ok(source.includes('this.restoreBlockToSlots(selectedSlotSnapshot)'), 'failed slot placement must restore by original slot index');
}

{
    const compactStart = slotCompaction.indexOf('compactSlotsAfterSelectionConsume(onComplete?: () => void)');
    assert.ok(compactStart >= 0, 'slot compact helper must exist');
    const compactAnimationStart = slotCompaction.indexOf('const SLOT_COMPACT_MOVE_DUR', compactStart);
    assert.ok(compactAnimationStart > compactStart, 'slot compact helper must define the compact move animation');
    const beforeCompactAnimation = slotCompaction.slice(compactStart, compactAnimationStart);
    const compactSnapshotStart = beforeCompactAnimation.indexOf('const rawTotalCount');
    const finishStart = beforeCompactAnimation.indexOf('const finish = () => {');
    const callbackPathCompact = beforeCompactAnimation.indexOf('this.slotModel[\'compact\']();', compactSnapshotStart);
    assert.ok(compactSnapshotStart >= 0, 'slot compact animation must compute a local compact snapshot');
    assert.ok(beforeCompactAnimation.includes('const afterSlots: Array<BeanBlockInfo | null>'), 'slot compact animation must not use committed slotModel state as the animation target');
    assert.ok(finishStart > compactSnapshotStart, 'slot compact animation must define a finish commit after computing moves');
    assert.ok(callbackPathCompact > finishStart, 'slot compact animation must delay committing slotModel compact until finish');
    assert.ok(beforeCompactAnimation.includes('hideCompactSourceSlot'), 'slot compact animation must hide source real beans before overlay movement');
    assert.ok(!beforeCompactAnimation.includes('this.renderSlots();\r\n\r\n            const layerUT'), 'slot compact animation must not render final compact state before overlay movement');
    assert.ok(!beforeCompactAnimation.includes('this.renderSlots();\n\n            const layerUT'), 'slot compact animation must not render final compact state before overlay movement');
    const compactEnd = slotCompaction.indexOf('restoreSlotTailToOriginalSlots(block: BeanBlockInfo, remainingCount: number, selectedSlotSnapshot: SlotSnapshotEntry[])', compactStart);
    assert.ok(compactEnd > compactStart, 'slot compact helper must end before restore helper');
    const compactHelper = slotCompaction.slice(compactStart, compactEnd);
    assert.ok(compactHelper.includes('const landedCompactBeans'), 'slot compact animation must keep landed overlay beans for render handoff');
    assert.ok(compactHelper.includes('const SLOT_COMPACT_HANDOFF_DUR = 0.08'), 'slot compact handoff must have a visible fade duration');
    assert.ok(compactHelper.includes('tween(realOpacity)'), 'slot compact handoff must fade in final real slot beans');
    assert.ok(compactHelper.includes('tween(beanOpacity)'), 'slot compact handoff must fade out temporary overlay beans');
    assert.ok(compactHelper.includes('landedCompactBeans.push({ bean, to: move.to })'), 'slot compact movement must retain overlay beans at their targets until handoff');
    assert.ok(!compactHelper.includes('this.recycleFlyBeanNode(bean);\r\n                        markMoveDone();'), 'slot compact movement must not recycle overlay beans before final render handoff');
    assert.ok(!compactHelper.includes('this.recycleFlyBeanNode(bean);\n                        markMoveDone();'), 'slot compact movement must not recycle overlay beans before final render handoff');
}

function prioritizeCellsLikeBoardModel(cells, correctColors, preferredCorrectColor) {
    const ordered = cells.map((cell, index) => ({ cell, index }));
    ordered.sort((a, b) => {
        const aPriority = correctColors[a.cell.row][a.cell.col] === preferredCorrectColor ? 0 : 1;
        const bPriority = correctColors[b.cell.row][b.cell.col] === preferredCorrectColor ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.index - b.index;
    });
    return ordered.map((entry) => entry.cell);
}

{
    const PURPLE = 4;
    const GREEN = 2;
    const ORANGE = 3;
    const cells = [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
    ];
    const correctColors = [
        [ORANGE, GREEN],
        [GREEN, PURPLE],
    ];
    const ordered = prioritizeCellsLikeBoardModel(cells, correctColors, GREEN);
    assert.deepStrictEqual(ordered, [
        { row: 0, col: 1 },
        { row: 1, col: 0 },
        { row: 0, col: 0 },
        { row: 1, col: 1 },
    ], 'selected board cells should prioritize beans occupying the tapped target color');
}

for (const required of [
    'getConnectedBlock(row: number, col: number, preferredCorrectColor?: number)',
    'prioritizeConnectedBlockCells(cells, preferredCorrectColor)',
    'this.correctColors[a.cell.row][a.cell.col] === preferredCorrectColor ? 0 : 1',
    'return a.index - b.index',
]) {
    assert.ok(boardModel.includes(required), `BoardModel must include target-color priority wiring: ${required}`);
}

for (const required of [
    'const preferredCorrectColor = this.boardModel.correctColors[candidate.row][candidate.col];',
    'this.boardModel.getConnectedBlock(candidate.row, candidate.col, preferredCorrectColor)',
    'allowAdjacentFallback: boolean = false',
    'if (!block && allowAdjacentFallback)',
    'this.boardModel.getConnectedBlockOrAdjacent(candidate.row, candidate.col, preferredCorrectColor)',
]) {
    assert.ok(boardInput.includes(required), `board selection must pass tapped target color: ${required}`);
}

console.log('slot order checks passed');
