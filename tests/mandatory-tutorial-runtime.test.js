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
        shouldGuideSelectFromSlot: () => false,
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
        },
        ...overrides,
    });
    return runtime;
}

{
    const runtime = createTapRuntime();
    runtime.handleGuideTap({ x: 0, y: 0, z: 0 });
    assert.strictEqual(runtime.advanceCount || 0, 0, 'a wrong level 1 tap must not advance');
    assert.strictEqual(runtime.currentBlock, null, 'a wrong level 1 tap must not mutate selection');
    assert.strictEqual(runtime.wrongHints, 1, 'a wrong level 1 tap should keep the step and show guidance');
}

{
    const runtime = createTapRuntime({
        trySelectHighlightedGuideBoardBlock() {
            this.currentBlock = { colorId: 10, source: 'board', cells: [{ row: 0, col: 0 }] };
            return true;
        },
    });
    runtime.handleGuideTap({ x: 10, y: 20, z: 0 });
    assert.strictEqual(runtime.advanceCount, 1, 'the prescribed level 1 block tap must advance');
    assert.strictEqual(runtime.currentBlock.colorId, 10, 'the correct selected block must remain selected for placement');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 1,
        _guideTotalSteps: 3,
        _guidePhase: 'select',
        _guideFirstColorId: 20,
        trySelectBoard() {
            this.currentBlock = {
                colorId: 6,
                source: 'board',
                cells: Array.from({ length: 7 }, (_, col) => ({ row: 0, col })),
            };
            return true;
        },
    });
    runtime.handleGuideTap({ x: 10, y: 20, z: 0 });
    assert.strictEqual(runtime.advanceCount, 1, 'any playable level 2 board block must advance to placement');
    assert.strictEqual(runtime.currentBlock.colorId, 6, 'level 2 must not require the internally suggested color');
    assert.strictEqual(runtime.currentBlock.cells.length, 7, 'level 2 must not require a block larger than one slot row');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 2,
        _guideTotalSteps: 3,
        _guidePhase: 'place',
        currentBlock: { colorId: 3, source: 'board', cells: [{ row: 0, col: 0 }] },
        trySelectBoard() {
            this.currentBlock = { colorId: 9, source: 'board', cells: [{ row: 1, col: 1 }] };
            return true;
        },
        showGuideStep(step) {
            this.lastShownStep = step;
        },
        executeGuidePlacement() {
            this.placeAttempts = (this.placeAttempts || 0) + 1;
        },
    });
    runtime.handleGuideTap({ x: 30, y: 40, z: 0 });
    assert.strictEqual(runtime.currentBlock.colorId, 9, 'a board tap during the placement prompt must replace the current selection');
    assert.strictEqual(runtime.lastShownStep, 2, 'reselection must keep and refresh the placement prompt');
    assert.strictEqual(runtime._guidePhase, 'place', 'reselection must remain in the placement phase');
    assert.strictEqual(runtime.placeAttempts || 0, 0, 'reselection must not be mistaken for a slot placement');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 2,
        _guideTotalSteps: 3,
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
    assert.strictEqual(runtime.endCount, 1, 'the guide must end after a confirmed real slot placement');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 2,
        _guideTotalSteps: 3,
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
    });
    runtime.executeGuidePlacement();
    assert.strictEqual(runtime._guideLevel2SlotPlacementSucceeded, true, 'a real slot store must arm tutorial completion');
    assert.strictEqual(runtime.flyToSlotsStarted, true, 'successful tutorial placement must continue through the normal fly-to-slot path');
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
    const runtime = createTapRuntime({
        _guideReminderToken: 0,
        _guideReminderHandler: null,
        _guideReminderPausedForLifecycle: false,
        isGameEnd: false,
        scheduleOnce(handler, seconds) {
            scheduled.push({ handler, seconds });
        },
        unschedule() {},
        hideGuideReminderVisuals() {},
        showGuideReminderForCurrentStep() {
            this.reminderShows = (this.reminderShows || 0) + 1;
        },
    });
    runtime.armGuideReminder();
    runtime.armGuideReminder();
    assert.strictEqual(scheduled[0].seconds, 5, 'the reminder must be armed for exactly five seconds');
    scheduled[0].handler();
    assert.strictEqual(runtime.reminderShows || 0, 0, 'a stale reminder callback must be ignored');
    scheduled[1].handler();
    assert.strictEqual(runtime.reminderShows, 1, 'only the current step token may show the reminder');
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
    });
    runtime.armGuideReminder();
    assert.strictEqual(runtime.pinchReminderShows, 1, 'the optional zoom hint must show its gesture immediately');
    assert.strictEqual(runtime.zoomControlActive, true, 'the optional zoom hint must expose plus/minus controls immediately');
    assert.strictEqual(scheduled[0].seconds, 5, 'the optional zoom hint must fail open after five seconds');
    scheduled[0].handler();
    assert.strictEqual(runtime.endCount, 1, 'the zoom timeout must dismiss the hint instead of repeating it');
    assert.strictEqual(runtime.lastTrackedEvent.eventName, 'zoom_hint_dismiss', 'the timeout must retain a dismiss diagnostic');
    assert.strictEqual(runtime.lastTrackedEvent.payload.source, 'timeout', 'the timeout diagnostic must identify its source');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideStep: 0,
        _guideTotalSteps: 3,
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
