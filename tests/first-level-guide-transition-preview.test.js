const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function loadInstaller(relPath, exportName) {
    const output = ts.transpileModule(read(relPath), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const shared = new Proxy({
        AudioMgr: { inst: { play() {}, vibratePlace() {} } },
        SLOTS_PER_ROW: 12,
        SySDKMgr: { inst: { reportTutorialFinish() {} } },
        TUTORIAL_ZOOM_SCALE_DELTA: 0.03,
        Tween: { stopAllByTarget() {} },
    }, {
        get(target, key) {
            if (key in target) return target[key];
            return class RuntimeStub {};
        },
    });
    const moduleRef = { exports: {} };
    const sandbox = {
        exports: moduleRef.exports,
        module: moduleRef,
        require(request) {
            if (request === '../GameCtrlShared') return shared;
            if (request === '../RuntimeLog') return { runtimeWarn() {}, runtimeLog() {} };
            if (request === '../PixelPosterPreviewRenderer') return { renderPixelPosterPreview() {} };
            if (request === '../MiniGamePlatform') return { getWeChatMiniGameRuntime: () => null };
            if (request === '../ToastService') return { ToastService: class ToastService {} };
            if (request === '../DebugPerfTrace') return { debugPerfTrace() {} };
            if (request === '../Panels/LeaderboardPanelController') {
                return { ensureLeaderboardPanelController: () => null };
            }
            return {};
        },
        console,
    };
    vm.runInNewContext(output, sandbox, { filename: relPath });
    return moduleRef.exports[exportName];
}

const installSettlementHudModule = loadInstaller(
    'assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts',
    'installSettlementHudModule',
);
const installTutorialGuideModule = loadInstaller(
    'assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts',
    'installTutorialGuideModule',
);
const installGuideLeaderboardModule = loadInstaller(
    'assets/Scripts/Core/GameCtrlModules/GuideLeaderboardModule.ts',
    'installGuideLeaderboardModule',
);

{
    const hand = {
        isValid: true,
        active: false,
        setScale() {},
    };
    const bubble = {
        isValid: true,
        active: false,
        getComponent: () => null,
    };
    const maskGraphics = { clear() {} };
    const mask = {
        isValid: true,
        active: false,
        getComponent: () => maskGraphics,
        addComponent: () => maskGraphics,
    };
    const shown = [];
    const interactive = [];
    const tapResults = [];
    const funnel = [];
    const targetFeedback = [];
    const runtime = {
        _guideMode: 'level_1',
        _guideStep: 1,
        _guideTotalSteps: 6,
        _guidePhase: 'place',
        _guideStatus: 'transitioning',
        _guidePreviewStep: -1,
        _guideRenderStep: -1,
        _guideInputSuspended: false,
        _guideReminderVisible: false,
        _guideLayer: { isValid: true, active: true, children: [] },
        _guideHand: hand,
        _guideMask: mask,
        _guideBubble: bubble,
        _guideBubbleLbl: {},
    };
    installSettlementHudModule(runtime);
    installTutorialGuideModule(runtime);
    installGuideLeaderboardModule(runtime);
    Object.assign(runtime, {
        clearGuideReminderTimer() {},
        hideGuideReminderVisuals() {
            this.hideCalls = (this.hideCalls || 0) + 1;
            this._guideReminderVisible = false;
            hand.active = false;
        },
        clearGuideHighlight() {},
        guideStep2() {
            this.previewRenderCount = (this.previewRenderCount || 0) + 1;
            this.renderedVisualStep = this.getGuideVisualStep();
            hand.active = true;
            bubble.active = true;
        },
        markTutorialStepShownForFunnel(step, phase) {
            shown.push({ step, phase });
        },
        markTutorialStepInteractiveReadyForFunnel(step) {
            interactive.push(step);
        },
        trackFirstLevelFunnel(eventName, payload) {
            funnel.push({ eventName, payload });
        },
        armGuideReminder() {
            this.reminderArmed = true;
            this._guideStatus = 'awaiting_action';
        },
        showGuideTargetFeedback(state) {
            targetFeedback.push(state);
            this._guideDimMaskNode = { isValid: true };
            return true;
        },
        showGuideDimMask() {
            return true;
        },
        clearGuideFeedbackVisuals() {
            this._guideDimMaskNode = null;
            this._guidePreviewVisible = false;
        },
        showGuideTapFeedback() {},
        showToast() {},
        tryHandleGuideSystemModalTap: () => false,
        reportTutorialTapResult(_worldPos, result) {
            tapResults.push(result);
        },
    });

    assert.strictEqual(runtime.showGuideStep(2, { previewOnly: true }), true);
    assert.strictEqual(runtime._guideStep, 1, 'visual preview must not advance the authoritative tutorial step');
    assert.strictEqual(runtime._guidePhase, 'place', 'visual preview must not change the active placement phase');
    assert.strictEqual(runtime._guidePreviewStep, 2);
    assert.strictEqual(runtime._guidePreviewVisible, true);
    assert.strictEqual(runtime._guideStatus, 'transitioning', 'preview must remain non-interactive');
    assert.strictEqual(runtime.previewRenderCount || 0, 0, 'preview must not render an actionable hand or bubble');
    assert.deepStrictEqual(targetFeedback, ['preview']);
    assert.deepStrictEqual(shown, [], 'preview must not be counted as an actionable step show');
    assert.deepStrictEqual(interactive, [], 'preview must not emit interactive-ready');
    assert.strictEqual(runtime.reminderArmed || false, false, 'preview must not arm an action reminder');
    assert.strictEqual(hand.active, false, 'the normal hand must stay hidden until the next action is enabled');
    assert.strictEqual(bubble.active, false, 'the actionable copy must stay hidden during transition preview');

    runtime.handleGuideTap({ x: 0, y: 0, z: 0 });
    assert.deepStrictEqual(tapResults, ['ignored_transitioning'], 'early hand must not accept a premature tap');

    const hideCallsBeforeCommit = runtime.hideCalls;
    runtime.advanceTutorial();
    assert.strictEqual(runtime._guideStep, 2, 'all-landing commit must advance exactly once');
    assert.strictEqual(runtime._guidePhase, 'select');
    assert.strictEqual(runtime._guidePreviewStep, -1);
    assert.strictEqual(runtime._guideStatus, 'awaiting_action');
    assert.strictEqual(runtime.previewRenderCount, 1, 'commit must perform exactly one full actionable render');
    assert.ok(runtime.hideCalls >= hideCallsBeforeCommit, 'commit may replace the preview cue while rendering the actionable state');
    assert.strictEqual(hand.active, true);
    assert.strictEqual(bubble.active, true);
    assert.deepStrictEqual(shown, [{ step: 2, phase: 'select' }]);
    assert.deepStrictEqual(interactive, [2]);
    assert.strictEqual(runtime.reminderArmed, true);
    assert.strictEqual(runtime.voiceStep, 2, 'voice remains tied to actual interaction readiness');
    assert.ok(
        funnel.some((entry) => entry.eventName === 'tutorial_step_done' && entry.payload.stepId === 1),
        'the completed placement step must still be reported only at commit',
    );
}

{
    let firstArrivalCallback = null;
    const previewCalls = [];
    const runtime = {
        _guideMode: 'level_1',
        _guideStep: 1,
        _guideTotalSteps: 6,
        _guidePhase: 'place',
        _guideStatus: 'awaiting_action',
        _guidePreviewStep: -1,
        _guideRenderStep: -1,
        _guideInputSuspended: false,
        _guideReminderPausedForLifecycle: false,
        _guideFirstColorId: 10,
        currentBlock: {
            colorId: 10,
            source: 'board',
            cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        },
    };
    installTutorialGuideModule(runtime);
    Object.assign(runtime, {
        collectSourceWorldPositions: () => [],
        isFirstLevelFunnelActive: () => false,
        boardModel: { removeBlock() {} },
        slotModel: {
            next: 0,
            store() {
                return this.next++;
            },
        },
        clearGuideRuntimeVisuals() {},
        startFlyToSlots(...args) {
            firstArrivalCallback = args[5];
        },
        showGuideStep(step, options) {
            previewCalls.push({ step, options });
            this._guidePreviewStep = step;
            return true;
        },
    });

    runtime.executeGuidePlacement();
    assert.strictEqual(runtime._guideStatus, 'transitioning');
    assert.strictEqual(typeof firstArrivalCallback, 'function', 'tutorial placement must pass the first-arrival hook');
    assert.deepStrictEqual(previewCalls, [], 'next hand must wait for a real first target arrival');
    firstArrivalCallback();
    assert.strictEqual(previewCalls.length, 1);
    assert.strictEqual(previewCalls[0].step, 2);
    assert.strictEqual(previewCalls[0].options.previewOnly, true);

    runtime._guideStep = 5;
    runtime._guidePreviewStep = -1;
    assert.strictEqual(runtime.previewNextGuideStepDuringPlacement(), false, 'final placement must not preview a nonexistent step');

    runtime._guideMode = 'level_2';
    runtime._guideStep = 2;
    runtime._guideTotalSteps = 7;
    runtime._guideStatus = 'transitioning';
    runtime._guidePreviewStep = -1;
    assert.strictEqual(runtime.previewNextGuideStepDuringPlacement(), true, 'level 2 slot placement must preview its next selection step');
    assert.strictEqual(previewCalls.at(-1).step, 3);

    runtime._guideStep = 4;
    runtime._guidePreviewStep = -1;
    assert.strictEqual(runtime.previewNextGuideStepDuringPlacement(), true, 'level 2 board placement must preview its next slot-selection step');
    assert.strictEqual(previewCalls.at(-1).step, 5);

    runtime._guideStep = 6;
    runtime._guidePreviewStep = -1;
    assert.strictEqual(runtime.previewNextGuideStepDuringPlacement(), false, 'level 2 final placement must retain completion timing');

    runtime._guideMode = 'zoom';
    runtime._guideStep = 0;
    runtime._guideTotalSteps = 1;
    assert.strictEqual(runtime.previewNextGuideStepDuringPlacement(), false, 'the level 3 zoom guide must remain unchanged');
}

{
    const scheduledDelays = [];
    const runtime = {
        _guideMode: 'level_1',
        _guideStep: 1,
        _guideTotalSteps: 6,
        _guidePhase: 'place',
        _guideStatus: 'transitioning',
        _guidePreviewStep: 2,
        _guideInputSuspended: false,
        _guideFirstColorId: 10,
        slotModel: { getAll: () => [{ colorId: 10 }] },
    };
    installTutorialGuideModule(runtime);
    Object.assign(runtime, {
        scheduleOnce(_handler, delay) {
            scheduledDelays.push(delay);
        },
        endTutorial() {
            this.endCount = (this.endCount || 0) + 1;
            this._guideStep = -1;
            this._guideMode = 'none';
            this._guideStatus = 'done';
        },
        playPatternCompleteThenWin() {},
    });
    assert.strictEqual(runtime.checkGuideStepComplete(), true);
    assert.strictEqual(scheduledDelays.pop(), 0, 'visible preview must become interactive without another 0.2-second pause');

    runtime._guideStep = 5;
    runtime._guideMode = 'level_1';
    runtime._guideStatus = 'transitioning';
    runtime._guidePreviewStep = -1;
    runtime.boardModel = { isAllLocked: () => true };
    assert.strictEqual(runtime.checkGuideStepComplete(), true);
    assert.strictEqual(runtime.endCount, 1, 'final completion must release the guide synchronously');
    assert.strictEqual(runtime._guideStatus, 'done', 'final completion must commit a non-transitioning state before Win');
    assert.strictEqual(scheduledDelays.pop(), 0.3, 'final completion must retain only the delayed Win fallback');
}

{
    const scheduledDelays = [];
    const runtime = {
        _guideMode: 'level_2',
        _guideStep: 2,
        _guideTotalSteps: 7,
        _guidePhase: 'place',
        _guideStatus: 'transitioning',
        _guidePreviewStep: 3,
        _guideInputSuspended: false,
        _guideLevel2SlotPlacementSucceeded: true,
    };
    installTutorialGuideModule(runtime);
    Object.assign(runtime, {
        scheduleOnce(_handler, delay) {
            scheduledDelays.push(delay);
        },
        endTutorial() {
            this.endCount = (this.endCount || 0) + 1;
            this._guideStep = -1;
            this._guideMode = 'none';
            this._guideStatus = 'done';
        },
        playPatternCompleteThenWin() {},
    });
    assert.strictEqual(runtime.checkGuideStepComplete(), true);
    assert.strictEqual(scheduledDelays.pop(), 0, 'level 2 preview must become interactive without another 0.2-second pause');

    runtime._guideStep = 6;
    runtime._guideMode = 'level_2';
    runtime._guideStatus = 'transitioning';
    runtime._guidePreviewStep = -1;
    runtime.boardModel = { isAllLocked: () => true };
    assert.strictEqual(runtime.checkGuideStepComplete(), true);
    assert.strictEqual(runtime.endCount, 1, 'level 2 final completion must release the guide synchronously');
    assert.strictEqual(runtime._guideStatus, 'done');
    assert.strictEqual(scheduledDelays.pop(), 0.3, 'level 2 final completion must retain only the delayed Win fallback');
}

const placementSource = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
assert.ok(
    placementSource.indexOf('notifyFirstTargetArrived();') < placementSource.indexOf('this.playLandEffect(t.row, t.col, completeArrival);'),
    'board placement must preview after the first bean arrives but before its settle effect completes',
);
assert.ok(
    placementSource.includes('const awaitLandEffect = visualOptions?.awaitLandEffect !== false'),
    'normal placement must keep awaiting the landing decoration by default',
);
assert.ok(
    placementSource.includes('this.playLandEffect(t.row, t.col);') && placementSource.includes('completeArrival();'),
    'tutorial placement must be able to continue while the landing decoration finishes',
);
assert.match(
    placementSource,
    /this\.renderSlotIndices\(\[slotIdx\]\);\s*notifyFirstTargetArrived\(\);\s*completeOne\(\)/,
    'slot placement must preview as soon as the first slot bean becomes visible',
);

const diagnosticsSource = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
assert.ok(
    diagnosticsSource.includes("this._guideStatus !== 'transitioning'"),
    'intentional transition visuals must not be reported as guide_visual_missing',
);

console.log('first-level-guide-transition-preview.test.js passed');
