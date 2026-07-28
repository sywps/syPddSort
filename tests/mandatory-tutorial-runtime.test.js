const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTutorialInstaller() {
    const source = fs.readFileSync(
        path.join(root, 'assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts'),
        'utf8',
    );
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const shared = new Proxy({
        SLOTS_PER_ROW: 12,
        TUTORIAL_ZOOM_SCALE_DELTA: 0.03,
        Tween: { stopAllByTarget() {} },
    }, {
        get(target, key) {
            if (key in target) return target[key];
            return class RuntimeStub {};
        },
    });
    const sandbox = {
        exports: {},
        module: { exports: {} },
        require(request) {
            if (request === '../GameCtrlShared') return shared;
            return {};
        },
        console,
    };
    sandbox.exports = sandbox.module.exports;
    vm.runInNewContext(output, sandbox, { filename: 'TutorialGuideModule.ts' });
    return sandbox.module.exports.installTutorialGuideModule;
}

const installTutorialGuideModule = loadTutorialInstaller();

function loadSettlementInstaller() {
    const source = fs.readFileSync(
        path.join(root, 'assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts'),
        'utf8',
    );
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    class SettlementVec3Stub {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }
    const tweenStub = (target) => {
        const actions = [];
        const chain = {
            call(handler) {
                actions.push({ type: 'call', handler });
                return chain;
            },
            delay() {
                actions.push({ type: 'delay' });
                return chain;
            },
            to(_seconds, properties) {
                actions.push({ type: 'to', properties });
                return chain;
            },
            start() {
                for (const action of actions) {
                    if (Object.prototype.hasOwnProperty.call(target, 'active') && target.active === false) {
                        break;
                    }
                    if (action.type === 'call') action.handler();
                    if (action.type === 'to') Object.assign(target, action.properties);
                }
                return chain;
            },
        };
        return chain;
    };
    const shared = new Proxy({
        Tween: { stopAllByTarget() {} },
        UIOpacity: class UIOpacityStub {},
        Vec3: SettlementVec3Stub,
        tween: tweenStub,
    }, {
        get(target, key) {
            if (key in target) return target[key];
            return class RuntimeStub {};
        },
    });
    const sandbox = {
        exports: {},
        module: { exports: {} },
        require(request) {
            if (request === '../GameCtrlShared') return shared;
            if (request === '../RuntimeLog') return { runtimeWarn() {} };
            if (request === '../PixelPosterPreviewRenderer') return { renderPixelPosterPreview() {} };
            return {};
        },
        console,
    };
    sandbox.exports = sandbox.module.exports;
    vm.runInNewContext(output, sandbox, { filename: 'SettlementHudModule.ts' });
    return sandbox.module.exports.installSettlementHudModule;
}

const installSettlementHudModule = loadSettlementInstaller();

function createTapRuntime(overrides = {}) {
    const runtime = {
        _guideInputSuspended: false,
        _guideMode: 'level_1',
        _guideStep: 0,
        _guideTotalSteps: 6,
        _guidePhase: 'select',
        _guideFirstColorId: 10,
        _guideSecondColorId: 13,
        currentBlock: null,
    };
    installTutorialGuideModule(runtime);
    Object.assign(runtime, {
        tryHandleGuideSystemModalTap: () => false,
        trySelectHighlightedGuideBoardBlock: () => false,
        trySelectBoard: () => false,
        showGuideWrongTargetHint() {
            this.wrongHints = (this.wrongHints || 0) + 1;
        },
        reportTutorialTapResult() {},
        getTutorialMissHitResult: () => 'miss_empty',
        advanceTutorial() {
            this.advanceCount = (this.advanceCount || 0) + 1;
        },
        endTutorial() {
            this.endCount = (this.endCount || 0) + 1;
            this._guideStep = -1;
            this._guideMode = 'none';
            this._guideStatus = 'done';
        },
        ...overrides,
    });
    return runtime;
}

function createAutoCorrectRuntime(overrides = {}) {
    return createTapRuntime({
        _guideStatus: 'awaiting_action',
        findBlockOnBoard(colorId) {
            const cellCount = this._guideMode === 'level_2' && colorId === this._guideFirstColorId ? 48 : 1;
            return {
                colorId,
                source: 'board',
                cells: Array.from({ length: cellCount }, (_, index) => ({ row: colorId, col: index })),
            };
        },
        getLevel2GuideBoardTargetCell(step) {
            const colorId = step === 3 || step === 4 ? this._guideSecondColorId : this._guideFirstColorId;
            return { row: colorId, col: step };
        },
        getGuideEmptyTargetCellsForPrompt(colorId) {
            return [{ row: colorId, col: 99 }];
        },
        getBoardCellWorldPosition(row, col) {
            return { x: row, y: col, z: 0 };
        },
        trySelectBoard(worldPos) {
            const block = this.findBlockOnBoard(worldPos.x);
            if (!block) return false;
            this.currentBlock = block;
            return true;
        },
        slotModel: {
            getAll: () => [{ colorId: 10, source: 'slot', cells: [{ row: 0, col: 0 }] }],
            getBlock: (index) => index === 0
                ? { colorId: 10, source: 'slot', cells: [{ row: 0, col: 0 }] }
                : null,
        },
        slotNodes: [{
            isValid: true,
            getComponent: () => ({
                convertToWorldSpaceAR: () => ({ x: 10, y: 0, z: 0 }),
            }),
        }],
        trySelectSlot(worldPos) {
            this.currentBlock = {
                colorId: worldPos.x,
                source: 'slot',
                cells: [{ row: 0, col: 0 }],
            };
            return true;
        },
        isWorldPosNearGuideCells: () => false,
        isGuidePlaceTargetHit: () => false,
        isSlotUnlockTargetHit: () => false,
        resolveSlotTapIntent: () => ({ kind: 'miss', candidate: null }),
        classifyFirstLevelTouchTarget: () => 'empty',
        showGuideTapFeedback(worldPos, state) {
            this.tapFeedbacks = this.tapFeedbacks || [];
            this.tapFeedbacks.push({ worldPos, state });
        },
        showGuideTargetFeedback() {
            this.targetReinforces = (this.targetReinforces || 0) + 1;
        },
        reportTutorialTapResult(worldPos, result, success, inputLayer, extra) {
            this.tapResults = this.tapResults || [];
            this.tapResults.push({ worldPos, result, success, inputLayer, extra });
        },
        executeGuideSlotUnlock() {
            this.unlockCount = (this.unlockCount || 0) + 1;
        },
        executeGuidePlacement(...args) {
            this.placements = this.placements || [];
            this.placements.push(args);
        },
        ...overrides,
    });
}

{
    const hand = {
        isValid: true,
        active: false,
        setScale() {},
    };
    const runtime = {
        _guideMode: 'level_1',
        _guideStep: 0,
        _guideTotalSteps: 6,
        _guidePhase: 'select',
        _guideInputSuspended: false,
        _guideReminderVisible: false,
        _guideLayer: { isValid: true, active: false, children: [] },
        _guideHand: hand,
        _guideMask: { getComponent: () => ({ clear() {} }) },
        _guideBubble: { isValid: true, active: false, getComponent: () => null },
        _guideBubbleLbl: {},
        clearGuideReminderTimer() {},
        hideGuideReminderVisuals() {
            this._guideReminderVisible = false;
            hand.active = false;
        },
        markTutorialStepShownForFunnel() {},
        trackFirstLevelFunnel() {},
        clearGuideHighlight() {},
        guideStep0() {
            this.visibleWhenInitialGestureStarts = this._guideReminderVisible;
            hand.active = this._guideReminderVisible;
            this._guideBubble.active = true;
        },
        markTutorialStepInteractiveReadyForFunnel() {},
        armGuideReminder() {
            this.reminderArmed = true;
        },
        isMainlineMainLevel: () => true,
    };
    installSettlementHudModule(runtime);
    runtime.showGuideStep(0);
    assert.strictEqual(runtime.visibleWhenInitialGestureStarts, true, 'the first hand gesture must start visible in the same showGuideStep call as the bubble');
    assert.strictEqual(hand.active, true, 'the first hand must not wait for the reminder callback');
    assert.strictEqual(runtime.reminderArmed, true, 'the staged reminder must still be armed after the immediate render');
}

{
    const cases = [
        { name: 'L1 first board select', mode: 'level_1', total: 6, step: 0, phase: 'select', action: 'select', colorId: 10, source: 'board' },
        { name: 'L1 slot placement', mode: 'level_1', total: 6, step: 1, phase: 'place', action: 'place-slot', colorId: 10, source: 'board' },
        { name: 'L1 second board select', mode: 'level_1', total: 6, step: 2, phase: 'select', action: 'select', colorId: 13, source: 'board' },
        { name: 'L1 second board placement', mode: 'level_1', total: 6, step: 3, phase: 'place', action: 'place-board', colorId: 13, source: 'board' },
        { name: 'L1 buffered slot select', mode: 'level_1', total: 6, step: 4, phase: 'select', action: 'select', colorId: 10, source: 'slot' },
        { name: 'L1 buffered board placement', mode: 'level_1', total: 6, step: 5, phase: 'place', action: 'place-board', colorId: 10, source: 'slot' },
        { name: 'L2 slot unlock', mode: 'level_2', total: 7, step: 0, phase: 'unlock', action: 'unlock' },
        { name: 'L2 first board select', mode: 'level_2', total: 7, step: 1, phase: 'select', action: 'select', colorId: 10, source: 'board' },
        { name: 'L2 slot placement', mode: 'level_2', total: 7, step: 2, phase: 'place', action: 'place-slot', colorId: 10, source: 'board' },
        { name: 'L2 second board select', mode: 'level_2', total: 7, step: 3, phase: 'select', action: 'select', colorId: 20, source: 'board' },
        { name: 'L2 second board placement', mode: 'level_2', total: 7, step: 4, phase: 'place', action: 'place-board', colorId: 20, source: 'board' },
        { name: 'L2 buffered slot select', mode: 'level_2', total: 7, step: 5, phase: 'select', action: 'select', colorId: 10, source: 'slot' },
        { name: 'L2 buffered board placement', mode: 'level_2', total: 7, step: 6, phase: 'place', action: 'place-board', colorId: 10, source: 'slot' },
    ];
    for (const testCase of cases) {
        const currentBlock = testCase.phase === 'place'
            ? { colorId: testCase.colorId, source: testCase.source, cells: [{ row: 0, col: 0 }] }
            : null;
        const runtime = createAutoCorrectRuntime({
            _guideMode: testCase.mode,
            _guideTotalSteps: testCase.total,
            _guideStep: testCase.step,
            _guidePhase: testCase.phase,
            _guideSecondColorId: testCase.mode === 'level_2' ? 20 : 13,
            currentBlock,
        });
        runtime.handleGuideTap({ x: -999, y: -999, z: 0 });
        assert.strictEqual(runtime.tapResults.length, 1, `${testCase.name} must report one tap result`);
        assert.strictEqual(runtime.tapResults[0].result, 'auto_correct_success', `${testCase.name} must report auto-correction`);
        assert.strictEqual(runtime.tapResults[0].success, true, `${testCase.name} must be successful`);
        assert.strictEqual(runtime.tapResults[0].extra.rawHitResult, 'miss_empty', `${testCase.name} must preserve the raw miss`);
        assert.strictEqual(runtime.tapResults[0].extra.autoCorrected, true, `${testCase.name} must identify the off-target correction`);
        assert.strictEqual(runtime.tapResults[0].extra.rawTargetHit, false, `${testCase.name} must preserve that the raw target missed`);
        assert.strictEqual(runtime.tapFeedbacks[0].state, 'wrong', `${testCase.name} must visibly acknowledge the wrong raw touch`);
        assert.strictEqual(runtime.targetReinforces, 1, `${testCase.name} must visibly reinforce the corrected target`);
        if (testCase.action === 'unlock') {
            assert.strictEqual(runtime.unlockCount, 1, `${testCase.name} must execute the real unlock action`);
        } else if (testCase.action === 'select') {
            assert.strictEqual(runtime.advanceCount, 1, `${testCase.name} must advance exactly one guide step`);
            assert.strictEqual(runtime.currentBlock.colorId, testCase.colorId, `${testCase.name} must select the prescribed color`);
            assert.strictEqual(runtime.currentBlock.source, testCase.source, `${testCase.name} must select from the prescribed source`);
            if (testCase.mode === 'level_2' && testCase.step === 1) {
                assert.strictEqual(runtime.currentBlock.cells.length, 48, 'L2 first select must retain the complete 48-cell block');
            }
        } else {
            assert.strictEqual(runtime.placements.length, 1, `${testCase.name} must execute the real placement action`);
            if (testCase.action === 'place-slot') {
                assert.deepStrictEqual(runtime.placements[0], [], `${testCase.name} must use the slot placement path`);
            } else {
                assert.strictEqual(runtime.placements[0][0], testCase.colorId, `${testCase.name} must use a correct-color board target`);
            }
        }
    }
}

{
    const runtime = createAutoCorrectRuntime({
        isWorldPosNearGuideCells: () => true,
    });
    runtime.handleGuideTap({ x: 10, y: 0, z: 0 });
    assert.strictEqual(runtime.tapResults[0].extra.autoCorrected, false, 'a raw target hit must not be mislabeled as corrected');
    assert.strictEqual(runtime.tapResults[0].extra.rawTargetHit, true, 'a raw target hit must be preserved in analytics');
    assert.strictEqual(runtime.tapResults[0].extra.rawHitResult, 'hit_target');
    assert.strictEqual(runtime.tapFeedbacks[0].state, 'tap', 'a correct raw touch must use the normal tap acknowledgement');
    assert.strictEqual(runtime.targetReinforces || 0, 0, 'a correct raw touch needs no second correction target');
}

{
    const suspended = createAutoCorrectRuntime({ _guideInputSuspended: true });
    suspended.handleGuideTap({ x: -999, y: -999, z: 0 });
    assert.strictEqual(suspended.tapResults[0].result, 'ignored_suspended', 'suspended input must not auto-correct');
    assert.strictEqual(suspended.advanceCount || 0, 0, 'suspended input must not advance');

    const modal = createAutoCorrectRuntime({ tryHandleGuideSystemModalTap: () => true });
    modal.handleGuideTap({ x: -999, y: -999, z: 0 });
    assert.strictEqual(modal.tapResults[0].result, 'modal_consumed', 'system modal input must not auto-correct');
    assert.strictEqual(modal.advanceCount || 0, 0, 'system modal input must not advance');
}

{
    const level2 = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData/level_2.json'), 'utf8'));
    const redCells = [];
    for (let row = 0; row < level2.boardHeight; row++) {
        for (let col = 0; col < level2.boardWidth; col++) {
            if (level2.initRandomColorArr[row][col] === 10
                && level2.correctColorArr[row][col] !== 10) {
                redCells.push({ row, col });
            }
        }
    }
    const hand = { active: false };
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideFirstColorId: 10,
        findBlockOnBoard: () => ({ colorId: 10, source: 'board', cells: redCells }),
        autoHighlightBlock() {},
        getGuideCellsLayerBounds(cells) {
            this.pointedGuideCells = cells;
            return { centerX: cells[0].col * 10, centerY: cells[0].row * 10 };
        },
        setGuideHandTarget(_hand, x, y) {
            this.guideHandTarget = { x, y };
        },
        startGuideHandPulse() {
            this.guideHandPulseStarted = true;
        },
        getConfiguredGuideCopy: () => '点击【高亮豆子】',
        styleLevel2GuidePrompt() {},
    });
    runtime.guideLevel2PickBlockStep(null, null, null, null, hand);
    const pointedCell = runtime.pointedGuideCells[0];
    assert.strictEqual(pointedCell.row, 19, 'the level 2 first pointer must use the red bean nearest the dense 48-cell block center');
    assert.strictEqual(pointedCell.col, 15, 'the level 2 first pointer must use the documented central red target');
    assert.strictEqual(level2.initRandomColorArr[pointedCell.row][pointedCell.col], 10, 'the fingertip target must be a real red bean');
    assert.strictEqual(level2.correctColorArr[pointedCell.row][pointedCell.col], 20, 'the selected red bean must belong to the swapped white target');
    assert.deepStrictEqual(
        runtime.guideHandTarget,
        { x: 150, y: 154 },
        'the hand must compensate the 36-unit artwork-tip offset below the selected red cell center',
    );
    assert.strictEqual(hand.active, true, 'the corrected red-cell hand must be visible');
    assert.strictEqual(runtime.guideHandPulseStarted, true, 'the corrected hand must retain the existing tap animation');

    runtime._guideStep = 1;
    runtime.getGuidePromptCellsBounds = (cells) => {
        runtime.promptTargetCells = cells;
        return { bottom: 0, top: 10, centerY: 5 };
    };
    const promptTarget = runtime.getGuidePromptTargetBoundsForCurrentStep({});
    assert.strictEqual(runtime.promptTargetCells.length, redCells.length, 'the first-pick bright region must cover the full red group');
    assert.deepStrictEqual(
        runtime.promptTargetCells.map((cell) => `${cell.row},${cell.col}`).sort(),
        redCells.map((cell) => `${cell.row},${cell.col}`).sort(),
        'the first-pick bright region must use every cell in the selected red block',
    );
    assert.strictEqual(promptTarget.kind, 'board', 'the first-pick bubble must remain a board-target prompt');
}

{
    const level2 = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData/level_2.json'), 'utf8'));
    const currentColors = level2.initRandomColorArr.map((row) => [...row]);
    const locked = currentColors.map((row, rowIndex) => row.map((colorId, colIndex) => (
        colorId !== 0 && colorId === level2.correctColorArr[rowIndex][colIndex]
    )));
    const movableCells = (colorId) => {
        const cells = [];
        for (let row = 0; row < level2.boardHeight; row++) {
            for (let col = 0; col < level2.boardWidth; col++) {
                if (currentColors[row][col] === colorId && !locked[row][col]) cells.push({ row, col });
            }
        }
        return cells;
    };
    const redCells = movableCells(10);
    const whiteCells = movableCells(20);
    const assertCell = (actual, expected, message) => {
        assert.deepStrictEqual([actual?.row, actual?.col], [expected.row, expected.col], message);
    };
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideFirstColorId: 10,
        _guideSecondColorId: 20,
        levelData: level2,
        boardModel: {
            currentColors,
            correctColors: level2.correctColorArr,
            locked,
        },
        findBlockOnBoard(colorId) {
            const cells = movableCells(colorId);
            return cells.length ? { colorId, source: 'board', cells } : null;
        },
        autoHighlightBlock() {},
        highlightEmptyTarget() {},
        styleLevel2GuidePrompt() {},
        getConfiguredGuideCopy: () => '',
    });

    assertCell(runtime.getLevel2GuideBoardTargetCell(1), { row: 19, col: 15 }, 'step 1 must point to a real central red bean');
    assertCell(runtime.getLevel2GuideBoardTargetCell(3), { row: 21, col: 14 }, 'step 3 must point to the central white counterpart');
    runtime.getGuidePromptCellsBounds = (cells) => {
        runtime.promptTargetCells = [...cells];
        return { bottom: 0, top: 10, centerX: 0, centerY: 0 };
    };
    runtime.startHandGestureOnBoardCell = (cell) => {
        runtime.handTargetCell = cell;
    };
    const cellKeys = (cells) => cells.map((cell) => `${cell.row},${cell.col}`).sort();
    const assertSelectionVisualTarget = (step, expected, expectedCells, renderStep) => {
        runtime._guideStep = step;
        runtime.promptTargetCells = [];
        runtime.handTargetCell = null;
        runtime.getGuidePromptTargetBoundsForCurrentStep({});
        renderStep();
        assert.deepStrictEqual(
            cellKeys(runtime.promptTargetCells),
            cellKeys(expectedCells),
            `step ${step} bright region must cover the entire selected bean group`,
        );
        assertCell(runtime.handTargetCell, expected, `step ${step} hand must use the same concrete board target`);
    };
    for (const [step, expected, expectedCells] of [
        [1, { row: 19, col: 15 }, redCells],
        [3, { row: 21, col: 14 }, whiteCells],
    ]) {
        assertSelectionVisualTarget(step, expected, expectedCells, () => {
            if (step === 1) runtime.guideLevel2PickBlockStep(null, null, null, null, {});
            else runtime.guideLevel2PickCounterpartStep(null, null, null, null, {});
        });
    }

    for (const cell of redCells) currentColors[cell.row][cell.col] = 0;
    assertCell(runtime.getLevel2GuideBoardTargetCell(4), { row: 19, col: 15 }, 'step 4 hand must point back to a real red-vacated white target');
    runtime._guideStep = 4;
    runtime.promptTargetCells = [];
    runtime.handTargetCell = null;
    runtime.getGuidePromptTargetBoundsForCurrentStep({});
    runtime.guideLevel2PlaceCounterpartStep(null, null, null, null, {});
    assert.deepStrictEqual(
        cellKeys(runtime.promptTargetCells),
        cellKeys(redCells),
        'step 4 bright region must cover every red-vacated white target cell',
    );
    assertCell(runtime.handTargetCell, { row: 19, col: 15 }, 'step 4 hand must still point to one real target cell');

    for (const cell of redCells) {
        currentColors[cell.row][cell.col] = 20;
        locked[cell.row][cell.col] = true;
    }
    for (const cell of whiteCells) currentColors[cell.row][cell.col] = 0;
    assertCell(runtime.getLevel2GuideBoardTargetCell(6), { row: 21, col: 14 }, 'step 6 hand must point back to a real white-vacated red target');
    runtime._guideStep = 6;
    runtime.promptTargetCells = [];
    runtime.handTargetCell = null;
    runtime.getGuidePromptTargetBoundsForCurrentStep({});
    runtime.guideLevel2PlaceBufferedStep(null, null, null, null, {});
    assert.deepStrictEqual(
        cellKeys(runtime.promptTargetCells),
        cellKeys(whiteCells),
        'step 6 bright region must cover every white-vacated red target cell',
    );
    assertCell(runtime.handTargetCell, { row: 21, col: 14 }, 'step 6 hand must still point to one real target cell');

    runtime.isWorldPosNearGuideCells = () => true;
    runtime._guideStep = 6;
    assertCell(
        runtime.getFirstLevelGuideBoardPlaceTarget({}, 10),
        { row: 21, col: 14 },
        'level 2 placement must forward the same displayed target instead of the first empty cell',
    );
}

{
    const bubbleBackground = {
        getComponent: () => ({ contentSize: { width: 320 } }),
    };
    const promptVariant = {
        getChildByName: (name) => name === 'BubbleBg' ? bubbleBackground : null,
        getComponent: () => ({ contentSize: { width: 700 } }),
    };
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        getGuidePromptVariantNode: () => promptVariant,
    });
    assert.strictEqual(
        runtime.getGuidePromptVisualWidth({}),
        320,
        'horizontal prompt clamping must use the fitted visible background instead of the 700-unit max layout container',
    );
}

{
    const bubble = {
        position: { x: 4, y: 0, z: 6 },
        getComponent: () => ({ contentSize: { height: 80 } }),
        setPosition(x, y, z) {
            this.position = { x, y, z };
        },
    };
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 2,
        getGuidePromptTargetBoundsForCurrentStep: () => ({
            bottom: 60,
            top: 100,
            centerX: 90,
            centerY: 80,
            kind: 'slot',
        }),
        getGuidePromptVisualHeight: () => 80,
        clampGuidePromptCenterX: (_bubble, centerX) => centerX,
        clampGuidePromptCenterY: (_bubble, centerY) => centerY,
    });
    runtime.adjustStarterGuidePromptForCurrentStep(bubble);
    assert.strictEqual(bubble.position.x, 90, 'the level 2 prompt tail must follow the target X position');
    assert.strictEqual(
        bubble.position.y,
        160,
        'the first level 2 slot-placement prompt must use the reduced 20-unit gap',
    );

    runtime._guideStep = 5;
    runtime.adjustStarterGuidePromptForCurrentStep(bubble);
    assert.strictEqual(
        bubble.position.y,
        184,
        'the later slot-selection prompt must retain the shared 44-unit gap',
    );
}

{
    const slots = Array(48).fill(null);
    const slotNodes = Array.from({ length: 48 }, (_, index) => {
        const position = { x: (index % 12) * 10, y: -Math.floor(index / 12) * 10, z: 0 };
        return {
            isValid: true,
            position,
            getComponent: () => ({
                contentSize: { width: 8, height: 8 },
                convertToWorldSpaceAR: () => position,
            }),
            getWorldScale: () => ({ x: 1, y: 1 }),
        };
    });
    const hand = { active: false };
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 2,
        _guideFirstColorId: 10,
        currentBlock: {
            colorId: 10,
            source: 'board',
            cells: Array.from({ length: 48 }, (_, index) => ({ row: Math.floor(index / 12), col: index % 12 })),
        },
        slotModel: {
            unlockedCount: 48,
            getAll: () => slots,
        },
        slotNodes,
        _guideLayer: {
            getComponent: () => ({ convertToNodeSpaceAR: (position) => position }),
            getWorldScale: () => ({ x: 1, y: 1 }),
        },
        getGuidePromptSlotIndicesBounds(indices) {
            this.promptTargetSlotIndices = [...indices];
            return { bottom: -38, top: 8, centerX: 55, centerY: -15, width: 118, height: 46 };
        },
        setGuideHandTarget(_hand, x, y) {
            this.slotHandTarget = { x, y };
        },
        startGuideHandPulse() {},
        highlightSlotAreaForGuide() {},
        autoHighlightSlotBeans() {},
        findSlotBlock: () => ({ colorId: 10, source: 'slot', cells: [{ row: 0, col: 0 }] }),
        getConfiguredGuideCopy: () => '',
        styleLevel2GuidePrompt() {},
    });

    assert.deepStrictEqual(
        Array.from(runtime.getLevel2GuideSlotTargetIndices(2)),
        Array.from({ length: 48 }, (_, index) => index),
        'step 2 must derive the exact 48 destination slots',
    );
    assert.strictEqual(runtime.getLevel2GuideSlotTargetIndex(2), 17, 'step 2 must choose a real center-nearest groove, not the between-slot midpoint');
    runtime.getGuidePromptTargetBoundsForCurrentStep({});
    runtime.guideLevel2PlaceBlockStep(null, null, null, null, hand);
    assert.deepStrictEqual(
        runtime.promptTargetSlotIndices,
        Array.from({ length: 48 }, (_, index) => index),
        'step 2 bright region must cover all 48 empty destination grooves',
    );
    assert.deepStrictEqual(runtime.slotHandTarget, { x: 50, y: -46 }, 'step 2 fingertip must target that groove with the lowered artwork compensation');

    for (let index = 0; index < 48; index++) slots[index] = { colorId: 10, source: 'slot', cells: [{ row: Math.floor(index / 12), col: index % 12 }] };
    runtime._guideStep = 5;
    runtime.currentBlock = null;
    runtime.promptTargetSlotIndices = [];
    runtime.slotHandTarget = null;
    assert.strictEqual(runtime.getLevel2GuideSlotTargetIndex(5), 17, 'step 5 must choose a real occupied red slot');
    runtime.getGuidePromptTargetBoundsForCurrentStep({});
    runtime.guideLevel2PickBufferedStep(null, null, null, null, hand);
    assert.deepStrictEqual(
        runtime.promptTargetSlotIndices,
        Array.from({ length: 48 }, (_, index) => index),
        'step 5 bright region must cover all 48 occupied red grooves',
    );
    assert.deepStrictEqual(runtime.slotHandTarget, { x: 50, y: -46 }, 'step 5 fingertip must target the occupied groove instead of a panel midpoint');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideTotalSteps: 7,
        _guideFirstColorId: 10,
        _guideSecondColorId: 20,
    });
    assert.deepStrictEqual(
        Array.from({ length: 7 }, (_, step) => runtime.isGuideSelectStep(step)),
        [false, true, false, true, false, true, false],
        'level 2 must alternate through the accepted unlock/select/place/select/place/select/place path',
    );
    assert.strictEqual(runtime.shouldGuideSelectFromSlot(5), true, 'step 5 must select the buffered first color from slots');
    assert.strictEqual(runtime.getGuidePlaceTargetColor(4), 20, 'step 4 must place the counterpart color');
    assert.strictEqual(runtime.getGuidePlaceTargetColor(6), 10, 'step 6 must return the buffered color');
    assert.strictEqual(runtime.isCorrectBlockForStep(1, { colorId: 10, source: 'board' }), true, 'step 1 must accept the prescribed first board color');
    assert.strictEqual(runtime.isCorrectBlockForStep(1, { colorId: 20, source: 'board' }), false, 'step 1 must reject the counterpart color');
    assert.strictEqual(runtime.isCorrectBlockForStep(3, { colorId: 20, source: 'board' }), true, 'step 3 must accept the counterpart board color');
    assert.strictEqual(runtime.isCorrectBlockForStep(5, { colorId: 10, source: 'slot' }), true, 'step 5 must accept the buffered first slot color');
}

{
    const tapResults = [];
    const runtime = createTapRuntime({
        _guideStep: 1,
        _guidePhase: 'place',
        _guideStatus: 'transitioning',
        currentBlock: null,
        reportTutorialTapResult(_worldPos, result, success, _inputLayer, extra) {
            tapResults.push({ result, success, extra });
        },
    });
    runtime.handleGuideTap({ x: 10, y: 20, z: 0 });
    assert.strictEqual(tapResults.length, 1);
    assert.strictEqual(tapResults[0].result, 'ignored_transitioning');
    assert.strictEqual(tapResults[0].success, false);
    assert.strictEqual(
        tapResults[0].extra.ignoreReason,
        'placement_committed',
        'a rapid tap during committed placement must be classified as transition feedback, not missing selection state',
    );
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 2,
        _guideTotalSteps: 7,
        _guidePhase: 'place',
        _guideLevel2SlotPlacementSucceeded: false,
        scheduleOnce(handler) {
            handler();
        },
        showGuideStep(step) {
            this.lastShownStep = step;
        },
    });
    runtime.checkGuideStepComplete();
    assert.strictEqual(runtime.endCount || 0, 0, 'the placement prompt must remain before a real slot placement succeeds');
    assert.strictEqual(runtime.lastShownStep, 2, 'an incomplete placement must keep the same prompt visible');
    runtime._guideLevel2SlotPlacementSucceeded = true;
    runtime.checkGuideStepComplete();
    assert.strictEqual(runtime.advanceCount, 1, 'the guide must continue after a confirmed real slot placement');
    assert.strictEqual(runtime.endCount || 0, 0, 'the guide must not end while four accepted actions remain');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 4,
        _guideTotalSteps: 7,
        _guidePhase: 'place',
        _guideSecondColorId: 20,
        isColorFullyLocked: (colorId) => colorId === 20,
        scheduleOnce(handler) {
            handler();
        },
    });
    runtime.checkGuideStepComplete();
    assert.strictEqual(runtime.advanceCount, 1, 'locking the counterpart color must continue to the slot-return steps');
    assert.strictEqual(runtime.endCount || 0, 0, 'counterpart placement must not end the guide early');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 6,
        _guideTotalSteps: 7,
        _guidePhase: 'place',
        boardModel: { isAllLocked: () => true },
        scheduleOnce(handler) {
            handler();
        },
        playPatternCompleteThenWin() {
            this.winStarts = (this.winStarts || 0) + 1;
        },
    });
    assert.strictEqual(runtime.checkGuideStepComplete(), true);
    assert.strictEqual(runtime.endCount, 1, 'the seventh accepted action must end the guide');
    assert.strictEqual(runtime.winStarts, 1, 'the seventh accepted action must enter the normal win flow');
    assert.strictEqual(runtime.checkGuideStepComplete(), false, 'a finalized guide must ignore duplicate completion checks');
    assert.strictEqual(runtime.endCount, 1, 'duplicate completion checks must not duplicate tutorial completion');
    assert.strictEqual(runtime.winStarts, 1, 'duplicate completion checks must not duplicate Win');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 2,
        _guideTotalSteps: 7,
        _guidePhase: 'place',
        _guideLevel2SlotPlacementSucceeded: false,
        currentBlock: { colorId: 14, source: 'board', cells: [{ row: 2, col: 3 }] },
        collectSourceWorldPositions: () => [],
        isFirstLevelFunnelActive: () => false,
        boardModel: {
            removeBlock() {},
        },
        slotModel: {
            store: () => 0,
        },
        startFlyToSlots() {
            this.flyToSlotsStarted = true;
        },
        hideGuideReminderVisuals() {
            this.hiddenCommittedStepControls = true;
        },
    });
    runtime.executeGuidePlacement();
    assert.strictEqual(runtime._guideLevel2SlotPlacementSucceeded, true, 'a real slot store must arm tutorial completion');
    assert.strictEqual(runtime.flyToSlotsStarted, true, 'successful tutorial placement must continue through the normal fly-to-slot path');
    assert.strictEqual(runtime._guideStatus, 'transitioning', 'a committed placement must enter the explicit transition state');
    assert.strictEqual(runtime.hiddenCommittedStepControls, true, 'the obsolete actionable controls must disappear as soon as placement is committed');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'zoom',
        _guideStep: 0,
        _guideTotalSteps: 1,
        _guidePhase: 'zoom',
        _guideZoomStartScale: 1,
        _guideZoomLastScale: 1,
        _guideZoomAccumulatedScaleDelta: 0,
        boardViewport: { scale: 1.02 },
        boardViewScale: 1.02,
    });
    assert.strictEqual(runtime.completeZoomTutorialIfThresholdReached('zoom_button'), false, 'a real but sub-threshold plus/minus change must accumulate');
    runtime.boardViewport.scale = 1.04;
    assert.strictEqual(runtime.completeZoomTutorialIfThresholdReached('zoom_button'), true, 'plus/minus zoom must dismiss the optional hint after a meaningful change');
    assert.strictEqual(runtime.endCount, 1, 'zoom completion must end the one-step hint exactly once');
}

{
    const scheduled = [];
    const hand = { isValid: true, active: true };
    const runtime = createTapRuntime({
        _guideReminderToken: 0,
        _guideReminderHandler: null,
        _guideReminderPausedForLifecycle: false,
        _guideHand: hand,
        isGameEnd: false,
        scheduleOnce(handler, seconds) {
            scheduled.push({ handler, seconds });
        },
        unschedule() {},
        showGuideReminderForCurrentStep() {
            this.reminderShows = (this.reminderShows || 0) + 1;
        },
    });
    runtime.armGuideReminder();
    assert.strictEqual(hand.active, true, 'arming the reminder must not hide the hand already rendered for the current step');
    runtime.armGuideReminder();
    assert.strictEqual(scheduled[0].seconds, 2, 'the first reminder escalation must be armed for two seconds');
    scheduled[0].handler();
    assert.strictEqual(runtime.reminderShows || 0, 0, 'a stale reminder callback must be ignored');
    scheduled[1].handler();
    assert.strictEqual(runtime.reminderShows, 1, 'only the current step token may show the reminder');
}

{
    const scheduled = [];
    const hand = { isValid: true, active: false };
    const runtime = createTapRuntime({
        _guideReminderToken: 0,
        _guideReminderHandler: null,
        _guideReminderPausedForLifecycle: true,
        _guideHand: hand,
        _modalFocusRefs: 0,
        isGameEnd: false,
        scheduleOnce(handler, seconds) {
            scheduled.push({ handler, seconds });
        },
        unschedule() {},
        startGuideHandPulse() {
            this.handPulseStarts = (this.handPulseStarts || 0) + 1;
        },
    });
    runtime.resumeGuideReminderForLifecycle();
    assert.strictEqual(hand.active, true, 'foreground resume must restore the hidden guide hand immediately');
    assert.strictEqual(runtime.handPulseStarts || 0, 0, 'foreground resume must not replay a gesture before its remaining reminder deadline');
    assert.strictEqual(scheduled[0].seconds, 2, 'foreground resume must rearm the first staged reminder');
}

{
    const scheduled = [];
    const runtime = createTapRuntime({
        _guideMode: 'zoom',
        _guideStep: 0,
        _guideTotalSteps: 1,
        _guidePhase: 'zoom',
        _guideReminderToken: 0,
        _guideReminderHandler: null,
        _guideReminderPausedForLifecycle: false,
        isGameEnd: false,
        scheduleOnce(handler, seconds) {
            scheduled.push({ handler, seconds });
        },
        unschedule() {},
        hideGuideReminderVisuals() {},
        startGuidePinchReminderAnimation() {
            this.pinchReminderShows = (this.pinchReminderShows || 0) + 1;
        },
        setBoardZoomControlActive(active) {
            this.zoomControlActive = active;
        },
        trackFirstLevelFunnel(eventName, payload) {
            this.lastTrackedEvent = { eventName, payload };
        },
        styleLevel2GuidePrompt() {},
        levelData: { tutorialGuide: {} },
        _guideLabel: { string: '双指缩放棋盘' },
        showGuideTargetFeedback() {
            this.targetReinforces = (this.targetReinforces || 0) + 1;
        },
        showGuideDimMask(opacity) {
            this.lastDimOpacity = opacity;
        },
    });
    runtime._guideReminderVisible = true;
    runtime.guideZoomGestureStep({}, {}, {}, {}, {});
    assert.strictEqual(runtime.pinchReminderShows, 1, 'both pinch hands must start in the same guide-step render as the bubble');
    assert.strictEqual(runtime.zoomControlActive, true, 'the optional zoom controls must be visible with the initial bubble');
    runtime.armGuideReminder();
    assert.strictEqual(runtime.pinchReminderShows, 1, 'arming the reminder must not be responsible for first rendering the pinch hands');
    assert.strictEqual(scheduled[0].seconds, 2, 'the zoom hint must use the same first staged reminder');
    scheduled[0].handler();
    assert.strictEqual(runtime.endCount || 0, 0, 'waiting must not dismiss the zoom hint');
    assert.strictEqual(runtime.pinchReminderShows, 2, 'the first reminder must reinforce the two-hand gesture');
    assert.strictEqual(runtime.lastTrackedEvent.eventName, 'tutorial_reminder_shown', 'the reminder must retain an explicit diagnostic');
    assert.strictEqual(runtime.lastTrackedEvent.payload.extra.reminderStage, 1);
    assert.strictEqual(runtime.targetReinforces || 0, 0, 'the zoom reminder must not create a board bright region');
    assert.strictEqual(scheduled[1].seconds, 2, 'the second reminder must land at cumulative four seconds');
    scheduled[1].handler();
    assert.strictEqual(runtime.lastDimOpacity, undefined, 'the four-second zoom reminder must not dim the board');
    assert.strictEqual(scheduled.length, 2, 'the four-second reminder must be the final scheduled reminder');
    assert.strictEqual(runtime._guideLabel.string, '双指缩放棋盘', 'idle reminders must never replace the current step copy');
}

{
    const scheduled = [];
    const runtime = {
        _smartIdleHintTimerHandler: null,
        _smartIdleHintToken: 0,
        _smartIdleHintShownCount: 0,
        isGameEnd: false,
        getActiveLogicalLevelId: () => 3,
        unschedule() {},
        scheduleOnce(handler, seconds) {
            scheduled.push({ handler, seconds });
        },
    };
    installSettlementHudModule(runtime);
    runtime.clearSmartIdleHintVisuals = () => {};
    runtime.canArmSmartIdleHint = () => true;
    runtime.resetIdleHintTimer();
    assert.strictEqual(scheduled.length, 1, 'resetting gameplay inactivity must arm one smart hint timer');
    assert.strictEqual(scheduled[0].seconds, 4, 'the first five level-3 smart hints must appear after four idle seconds');
    runtime._smartIdleHintShownCount = 4;
    runtime.resetIdleHintTimer();
    assert.strictEqual(scheduled[1].seconds, 4, 'the fifth level-3 smart hint must still use the four-second delay');
    runtime._smartIdleHintShownCount = 5;
    runtime.resetIdleHintTimer();
    assert.strictEqual(scheduled[2].seconds, 5, 'later level-3 smart hints must wait five idle seconds');
}

{
    const scheduled = [];
    const runtime = {
        _smartIdleHintTimerHandler: null,
        _smartIdleHintToken: 0,
        _smartIdleHintShownCount: 0,
        _smartIdleHintEpisodeCycle: 0,
        _smartIdleHintInputActive: false,
        isGameEnd: false,
        getActiveLogicalLevelId: () => 3,
        unschedule() {},
        scheduleOnce(handler, seconds) {
            scheduled.push({ handler, seconds });
        },
    };
    installSettlementHudModule(runtime);
    runtime.clearSmartIdleHintVisuals = () => {
        runtime.visualClearCount = (runtime.visualClearCount || 0) + 1;
    };
    runtime.canArmSmartIdleHint = () => true;

    runtime.beginSmartIdleHintInputActivity();
    assert.strictEqual(runtime._smartIdleHintInputActive, true, 'touch start must enter the smart-hint input state');
    assert.strictEqual(runtime._smartIdleHintEpisodeCycle, 0, 'touch start must reset the idle episode');
    runtime.resetIdleHintTimer();
    assert.strictEqual(scheduled.length, 0, 'an active gesture must not rearm a hint timer');
    runtime.endSmartIdleHintInputActivity();
    assert.strictEqual(runtime._smartIdleHintInputActive, false, 'the last touch end must leave the input state');
    assert.strictEqual(scheduled[0].seconds, 4, 'gesture end must rearm a full four-second idle window');

    runtime._smartIdleHintEpisodeCycle = 1;
    runtime.completeSmartIdleHintCycle(runtime._smartIdleHintToken);
    assert.strictEqual(scheduled[1].seconds, 4, 'the second and final cycle must wait through a hidden four-second gap');
    runtime._smartIdleHintEpisodeCycle = 2;
    runtime.completeSmartIdleHintCycle(runtime._smartIdleHintToken);
    assert.strictEqual(scheduled.length, 2, 'one idle episode must stop after two visible cycles');
}

{
    const runtime = {};
    installSettlementHudModule(runtime);
    Object.assign(runtime, {
        isSelected: true,
        currentBlock: { colorId: 10, source: 'board', cells: [{ row: 1, col: 1 }] },
        _selectedSlotIndices: [],
        getEmptyTargetCellsForIdleHint: () => [{ row: 2, col: 2 }],
        slotModel: { hasEmptySlot: () => true },
        isMismatchedBoardBlockForIdleHint: () => true,
    });
    const plan = runtime.resolveSelectedSmartIdleHintPlan();
    assert.strictEqual(plan.step, 'board_to_board');
    assert.strictEqual(plan.destinationOnly, true, 'a selected smart hint must never replay the source tap');
}

{
    const runtime = {};
    installSettlementHudModule(runtime);
    const sourcePoint = { x: 10, y: 20, z: 0 };
    const destinationPoint = { x: 30, y: 40, z: 0 };
    Object.assign(runtime, {
        getSmartIdleHintSafeBoardSelectPoint: () => sourcePoint,
        getSmartIdleHintSafeBoardPlacePoint: () => destinationPoint,
    });
    const unselected = runtime.resolveSmartIdleHintEndpoints({
        step: 'board_to_board',
        colorId: 10,
        block: { colorId: 10, cells: [{ row: 1, col: 1 }] },
        targetCells: [{ row: 2, col: 2 }],
    });
    assert.strictEqual(unselected.from, sourcePoint, 'an unselected hint must include one source tap');
    assert.strictEqual(unselected.to, destinationPoint, 'an unselected hint must include one destination tap');

    runtime.getSmartIdleHintSafeBoardSelectPoint = () => {
        throw new Error('destination-only plans must not resolve or replay the source');
    };
    const selected = runtime.resolveSmartIdleHintEndpoints({
        step: 'board_to_board',
        colorId: 10,
        block: { colorId: 10, cells: [{ row: 1, col: 1 }] },
        targetCells: [{ row: 2, col: 2 }],
        destinationOnly: true,
    });
    assert.strictEqual(selected.from, null, 'a selected hint must start directly at the destination');
    assert.strictEqual(selected.to, destinationPoint);
}

{
    const runtime = {};
    installSettlementHudModule(runtime);
    const sourcePoint = { x: 10, y: 20, z: 0 };
    const destinationPoint = { x: 30, y: 40, z: 0 };
    Object.assign(runtime, {
        getSmartIdleHintSafeBoardSelectPoint(_block, requireHandClear) {
            return requireHandClear ? null : sourcePoint;
        },
        getSmartIdleHintSafeBoardPlacePoint: () => destinationPoint,
    });
    const endpoints = runtime.resolveSmartIdleHintEndpoints({
        step: 'board_to_board',
        colorId: 10,
        block: { colorId: 10, cells: [{ row: 1, col: 1 }] },
        targetCells: [{ row: 2, col: 2 }],
    });
    assert.strictEqual(endpoints.from, sourcePoint, 'a HUD-adjacent source must fall back to its visible point-safe cell');
    assert.strictEqual(endpoints.to, destinationPoint);
    assert.strictEqual(endpoints.sourceHandVisible, false, 'the fallback source must use only a tap ring instead of covering HUD with the hand');
}

{
    const runtime = {};
    installSettlementHudModule(runtime);
    const opacity = { opacity: 255 };
    const visitedPositions = [];
    const ripples = [];
    let completed = false;
    const hand = {
        active: false,
        isValid: true,
        position: { x: 0, y: 0, z: 0 },
        getComponent() {
            return opacity;
        },
        addComponent() {
            return opacity;
        },
        setScale() {},
        setPosition(position) {
            this.position = { x: position.x, y: position.y, z: position.z || 0 };
            visitedPositions.push(this.position);
        },
    };
    runtime.playSmartIdleHintTapRipple = (point, holdSeconds = 0) => {
        ripples.push({ point, holdSeconds });
    };
    runtime.startSmartIdleHintTapSequence(
        hand,
        { x: 10, y: 20, z: 0 },
        { x: 30, y: 40, z: 0 },
        () => {
            completed = true;
        },
    );
    assert.strictEqual(completed, true, 'an initially inactive authored hand must still run the whole smart-hint tween');
    assert.strictEqual(ripples.length, 2, 'an unselected smart hint must render one source tap and one destination tap');
    assert.ok(visitedPositions.length >= 3, 'the hand must visit the source, move while transparent, and visit the destination');
    assert.strictEqual(hand.active, false, 'the hand may become inactive only after the sequence has completed');
    assert.strictEqual(opacity.opacity, 0, 'the completed hand must remain visually hidden');
}

{
    const runtime = {
        isGameEnd: false,
        boardModel: {},
        slotModel: {},
        levelData: { levelId: 3 },
        getActiveGameplayEntryMode: () => 'main',
        isExternalLevelPreviewActive: () => false,
        getActiveLogicalLevelId() {
            return this.levelData.levelId;
        },
    };
    installSettlementHudModule(runtime);
    assert.strictEqual(runtime.canArmSmartIdleHint(), true, 'the normal smart hint must be enabled for level 3');
    runtime.levelData.levelId = 2;
    assert.strictEqual(runtime.canArmSmartIdleHint(), false, 'level 2 must rely on its mandatory tutorial instead');
    runtime.levelData.levelId = 4;
    assert.strictEqual(runtime.canArmSmartIdleHint(), true, 'levels 4 through 10 must arm one five-second smart hint');
    assert.strictEqual(runtime.getSmartIdleHintDelaySeconds(), 5, 'level 4 must wait five idle seconds');
    runtime._smartIdleHintShownCount = 1;
    assert.strictEqual(runtime.canArmSmartIdleHint(), false, 'level 4 must stop after its first shown hint');
    runtime._smartIdleHintShownCount = 0;
    runtime.levelData.levelId = 10;
    assert.strictEqual(runtime.canArmSmartIdleHint(), true, 'level 10 must retain the one-shot smart hint');
    runtime.levelData.levelId = 11;
    assert.strictEqual(runtime.canArmSmartIdleHint(), false, 'level 11 and later must not arm the smart hint');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 0,
        _guideTotalSteps: 7,
        _guidePhase: 'unlock',
        slotUnlockedRows: 1,
        slotRowCount: 4,
        tryUnlockSlotRow() {},
    });
    runtime.executeGuideSlotUnlock();
    assert.strictEqual(runtime.advanceCount || 0, 0, 'level 2 must not advance when the unlocked row count is unchanged');
    runtime.tryUnlockSlotRow = function tryUnlockSlotRow() {
        this.slotUnlockedRows = 4;
    };
    runtime.executeGuideSlotUnlock();
    assert.strictEqual(runtime.advanceCount, 1, 'level 2 must advance only after the real all-row unlock succeeds');
}

console.log('mandatory-tutorial-runtime.test.js passed');
