const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const state = read('assets/Scripts/Core/GameCtrlState.ts');
const input = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const placement = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
const skillUi = read('assets/Scripts/Core/GameplaySkillUiController.ts');
const slotUi = read('assets/Scripts/Core/GameplaySlotUiController.ts');
const cleanup = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const tutorial = read('assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts');

assert.ok(state.includes('_placementInputLocked: false'), 'runtime state must track placement input lock');
assert.ok(state.includes('_placementInputLockRefs: 0'), 'runtime state must track placement input lock ref count');
assert.ok(state.includes('_placementVisualRefs: 0'), 'runtime state must track placement visual refs separately');
assert.ok(state.includes('_flyingTargetRefs: new Map<string, number>()'), 'runtime state must track flying targets by ref count');
assert.ok(state.includes('_hiddenSlotIndexRefs: new Map<number, number>()'), 'runtime state must track hidden slot indices by ref count');
assert.ok(cleanup.includes('this._placementInputLocked = false'), 'cleanup must clear placement input lock');
assert.ok(cleanup.includes('this._placementInputLockRefs = 0'), 'cleanup must clear placement lock refs');
assert.ok(cleanup.includes('this.clearPlacementVisualState?.()'), 'cleanup must clear placement visual state');

assert.ok(!input.includes('if (this.isPlacementInputLocked?.()) { this.resetTouchState(); return; }'), 'board touch input must not be globally swallowed by placement visuals');
assert.ok(!input.includes('if (this.isPlacementInputLocked?.()) return;'), 'board wheel input must not be globally swallowed by placement visuals');
assert.ok(input.includes('if (this.isPlacementVisualBusy?.()) return true;'), 'slot unlock input must still avoid placement visual overlap');
assert.ok(skillUi.includes('if (runtime.isPlacementVisualBusy?.()) return;'), 'skill buttons must be blocked during placement visuals');
assert.ok(slotUi.includes('if (runtime.isPlacementVisualBusy?.()) return false;'), 'slot unlock UI must be blocked during placement visuals');

assert.ok(input.includes('applyBoardSelection(block: BeanBlockInfo, options: { playFeedback?: boolean; preserveVisual?: boolean } = {})'), 'board selection must support silent visual-preserving reselect');
assert.ok(input.includes('selectSlotBlockByIndex(slotIndex: number, options: { playFeedback?: boolean } = {})'), 'slot selection must support silent reselect');
assert.ok(input.includes('if (!fromSlot)'), 'selected board block must handle slot taps explicitly');
assert.ok(input.includes('this.cancelSelection();\n                            this.selectSlotBlockByIndex(slotIntent.candidate.slotIndex);\n                            return true;'), 'board-to-occupied-slot tap must reselect the slot bean');
assert.ok(input.includes('options.preserveVisual === true'), 'remaining board selection must be able to preserve its raised visual state');

assert.ok(placement.includes('type PendingRemainingSelection'), 'placement must model pending remaining selection');
assert.ok(placement.includes('isPlacementVisualBusy(): boolean'), 'placement must separate visual busy state from board touch input');
assert.ok(placement.includes('retainFlyingTarget(row: number, col: number)'), 'placement must retain flying board targets by operation');
assert.ok(placement.includes('retainHiddenSlotIndex(index: number)'), 'placement must retain hidden slot targets by operation');
assert.ok(placement.includes('startBoardTargetFollowTween(options: FlyBeanFollowOptions)'), 'board-bound fly beans must follow moving board targets');
assert.ok(placement.includes('createBoardRemainingSelection(block: BeanBlockInfo, remainingCount: number)'), 'board partial placement must create remaining selection');
assert.ok(placement.includes('createSlotRemainingSelection(block: BeanBlockInfo, remainingCount: number)'), 'slot partial placement must create remaining selection');
assert.ok(placement.includes('applyRemainingSelectionAfterPlacement(selection: PendingRemainingSelection | null)'), 'placement must rebuild remaining selection after animation');
assert.ok(placement.includes('resetCellPositionsExcept(excludedCells'), 'remaining board cells must not be reset flat during placement');
assert.ok(placement.includes('this._selectedSlotIndices = [];'), 'consumed selection indices must be cleared before async placement continues');
assert.ok(placement.includes('this.applyRemainingSelectionAfterPlacement(remainingSelection);'), 'remaining selection must be applied before placement visuals finish');
assert.ok(placement.includes('{ playFeedback: false, preserveVisual: true }'), 'remaining board selection must not animate upward twice');
assert.ok(placement.indexOf('this.applyRemainingSelectionAfterPlacement(remainingSelection);') < placement.indexOf('const layerUT = this.dragLayer.getComponent(UITransform)!;'), 'remaining selection must be restored before fly animation starts');

assert.ok(input.includes('const remainingSelection = result.remaining > 0'), 'board placement path must preserve partial remainder');
assert.ok(input.includes('flyVisualOptions, remainingSelection'), 'board placement must pass remaining selection into fly placement');
assert.ok(input.includes('this.compactSlotsAfterSelectionConsume();'), 'slot model must compact immediately after selected slot placement commit');
assert.ok(input.includes('this._hiddenSlotIndices?.has(slotIndex)'), 'hidden in-flight slot targets must not be selectable');
assert.ok(placement.includes('this.startFlyToSlots(block.colorId, sources.slice(0, storedSlotIdxs.length), storedSlotIdxs, block.cells, remainingSelection);'), 'board-to-slot partial placement must preserve remaining board selection');
assert.ok(tutorial.includes('const remainingSelection = result.remaining > 0'), 'tutorial placement path must use the same remaining selection model');
assert.ok(tutorial.includes('this.startFlyToSlots(block.colorId, sources.slice(0, storedIdxs.length), storedIdxs, block.cells, remainingSelection);'), 'tutorial board-to-slot partial placement must preserve remaining board selection');
assert.ok(tutorial.includes('undefined, undefined, remainingSelection'), 'tutorial fly placement must pass remaining selection');

console.log('selection-continuation-flow.test.js passed');
