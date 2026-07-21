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
    const shared = new Proxy({
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
        },
        ...overrides,
    });
    return runtime;
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
        _guideBubble: { getComponent: () => null },
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
    assert.strictEqual(hand.active, true, 'the first hand must not wait for the five-second reminder callback');
    assert.strictEqual(runtime.reminderArmed, true, 'the five-second reminder must still be armed after the immediate render');
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
        _guideTotalSteps: 7,
        _guidePhase: 'select',
        _guideFirstColorId: 15,
        _guideSecondColorId: 20,
        trySelectHighlightedGuideBoardBlock() {
            this.currentBlock = {
                colorId: 15,
                source: 'board',
                cells: Array.from({ length: 48 }, (_, index) => ({ row: Math.floor(index / 12), col: index % 12 })),
            };
            return true;
        },
    });
    runtime.handleGuideTap({ x: 10, y: 20, z: 0 });
    assert.strictEqual(runtime.advanceCount, 1, 'the highlighted first level 2 block must advance to slot placement');
    assert.strictEqual(runtime.currentBlock.colorId, 15, 'level 2 must retain the prescribed buffered color');
    assert.strictEqual(runtime.currentBlock.cells.length, 48, 'the prescribed level 2 block must exactly fill the unlocked slot buffer');
}

{
    const runtime = createTapRuntime({
        _guideMode: 'level_2',
        _guideTotalSteps: 7,
        _guideFirstColorId: 15,
        _guideSecondColorId: 20,
    });
    assert.deepStrictEqual(
        Array.from({ length: 7 }, (_, step) => runtime.isGuideSelectStep(step)),
        [false, true, false, true, false, true, false],
        'level 2 must alternate through the accepted unlock/select/place/select/place/select/place path',
    );
    assert.strictEqual(runtime.shouldGuideSelectFromSlot(5), true, 'step 5 must select the buffered first color from slots');
    assert.strictEqual(runtime.getGuidePlaceTargetColor(4), 20, 'step 4 must place the counterpart color');
    assert.strictEqual(runtime.getGuidePlaceTargetColor(6), 15, 'step 6 must return the buffered color');
    assert.strictEqual(runtime.isCorrectBlockForStep(1, { colorId: 15, source: 'board' }), true, 'step 1 must accept the prescribed first board color');
    assert.strictEqual(runtime.isCorrectBlockForStep(1, { colorId: 20, source: 'board' }), false, 'step 1 must reject the counterpart color');
    assert.strictEqual(runtime.isCorrectBlockForStep(3, { colorId: 20, source: 'board' }), true, 'step 3 must accept the counterpart board color');
    assert.strictEqual(runtime.isCorrectBlockForStep(5, { colorId: 15, source: 'slot' }), true, 'step 5 must accept the buffered first slot color');
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
    runtime.checkGuideStepComplete();
    assert.strictEqual(runtime.endCount, 1, 'the seventh accepted action must end the guide');
    assert.strictEqual(runtime.winStarts, 1, 'the seventh accepted action must enter the normal win flow');
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
    assert.strictEqual(scheduled[0].seconds, 5, 'the reminder must be armed for exactly five seconds');
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
    assert.strictEqual(runtime.handPulseStarts, 1, 'foreground resume must restart the current hand gesture');
    assert.strictEqual(scheduled[0].seconds, 5, 'foreground resume must still rearm the five-second reminder');
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
    });
    runtime._guideReminderVisible = true;
    runtime.guideZoomGestureStep({}, {}, {}, {}, {});
    assert.strictEqual(runtime.pinchReminderShows, 1, 'both pinch hands must start in the same guide-step render as the bubble');
    assert.strictEqual(runtime.zoomControlActive, true, 'the optional zoom controls must be visible with the initial bubble');
    runtime.armGuideReminder();
    assert.strictEqual(runtime.pinchReminderShows, 1, 'arming the timeout must not be responsible for first rendering the pinch hands');
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
