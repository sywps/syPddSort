const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const controllerPath = path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts');
const source = fs.readFileSync(controllerPath, 'utf8').replace(/\r\n/g, '\n');

function extractMethod(signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing method: ${signature}`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated method: ${signature}`);
}

const playedAudio = [];
const fakeAudioMgr = { inst: { play(name) { playedAudio.push(name); } } };
const OPENING_GUIDE_WRONG_TAP_TOAST_COOLDOWN_MS = 1500;

function createHarness(signatures) {
    const methods = signatures.map(extractMethod).join('\n');
    const compiled = ts.transpileModule(`export class Harness {\n${methods}\n}`, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const testModule = { exports: {} };
    const load = new Function('module', 'exports', 'require', 'AudioMgr', 'Vec3', 'UITransform', 'OPENING_GUIDE_WRONG_TAP_TOAST_COOLDOWN_MS', compiled);
    load(testModule, testModule.exports, require, fakeAudioMgr, class FakeVec3 {}, class FakeUITransform {}, OPENING_GUIDE_WRONG_TAP_TOAST_COOLDOWN_MS);
    return new testModule.exports.Harness();
}

const inputMethods = [
    ['private onRootTouchStart(event: any): void', 'onRootTouchStart', 'onTouchStart'],
    ['private onRootTouchMove(event: any): void', 'onRootTouchMove', 'onTouchMove'],
    ['private onRootTouchCancel(event: any): void', 'onRootTouchCancel', 'onTouchCancel'],
    ['private onRootMouseWheel(event: any): void', 'onRootMouseWheel', 'onMouseWheel'],
];

for (const [signature, methodName, runtimeMethod] of inputMethods) {
    const lockedCalls = [];
    const locked = createHarness([signature]);
    locked.inputLocked = true;
    locked.runtime = { [runtimeMethod](event) { lockedCalls.push(event); } };
    const lockedEvent = { propagationStopped: false };
    locked[methodName](lockedEvent);
    assert.strictEqual(lockedEvent.propagationStopped, true, `${methodName} must consume locked input`);
    assert.deepStrictEqual(lockedCalls, [], `${methodName} must not leak locked input into the viewport`);

    const unlockedCalls = [];
    const unlocked = createHarness([signature]);
    unlocked.inputLocked = false;
    unlocked.runtime = { [runtimeMethod](event) { unlockedCalls.push(event); } };
    const unlockedEvent = { propagationStopped: false };
    unlocked[methodName](unlockedEvent);
    assert.strictEqual(unlockedEvent.propagationStopped, false, `${methodName} must preserve normal propagation`);
    assert.deepStrictEqual(unlockedCalls, [unlockedEvent], `${methodName} must resume after the guide unlocks`);
}

const touchEnd = createHarness(['private onRootTouchEnd(event: any): void']);
let guideTapCount = 0;
touchEnd.rules = { cells: [] };
touchEnd.runtime = { isGameEnd: false };
touchEnd.inputLocked = true;
touchEnd.handleOpeningGuideRootTap = () => {
    guideTapCount += 1;
    return false;
};
touchEnd.isOpeningGuideTargetEvent = () => true;
const lockedGuideTargetEvent = { propagationStopped: false };
touchEnd.onRootTouchEnd(lockedGuideTargetEvent);
assert.strictEqual(guideTapCount, 0, 'the current guide target must own its touch-end instead of using the root fallback');
assert.strictEqual(lockedGuideTargetEvent.propagationStopped, false, 'capture must not stop the current guide target touch-end');

touchEnd.isOpeningGuideTargetEvent = () => false;
const lockedMissEvent = { propagationStopped: false };
touchEnd.onRootTouchEnd(lockedMissEvent);
assert.strictEqual(guideTapCount, 1, 'locked touch-end must still attempt the active guide target');
assert.strictEqual(lockedMissEvent.propagationStopped, true, 'a locked guide miss must not reach unrelated controls');

const targetOwnership = createHarness(['private isOpeningGuideTargetEvent(event: any): boolean']);
const inputRoot = { isValid: true, parent: null };
const openingGuideTarget = { isValid: true, parent: inputRoot };
const openingGuideTargetChild = { isValid: true, parent: openingGuideTarget };
const unrelatedTarget = { isValid: true, parent: inputRoot };
targetOwnership.inputRoot = inputRoot;
targetOwnership.openingGuideTarget = openingGuideTarget;
assert.strictEqual(targetOwnership.isOpeningGuideTargetEvent({ target: openingGuideTarget }), true);
assert.strictEqual(targetOwnership.isOpeningGuideTargetEvent({ target: openingGuideTargetChild }), true);
assert.strictEqual(targetOwnership.isOpeningGuideTargetEvent({ target: unrelatedTarget }), false);
assert.strictEqual(targetOwnership.isOpeningGuideTargetEvent({ target: null }), false);
openingGuideTarget.isValid = false;
assert.strictEqual(targetOwnership.isOpeningGuideTargetEvent({ target: openingGuideTarget }), false);

{
    const guide = createHarness([
        'private maybeShowOpeningGuideWrongTapToast(): void',
        'private handleOpeningGuideRootTap(event: any): boolean',
    ]);
    const toasts = [];
    const tapResults = [];
    let now = 10000;
    const originalDateNow = Date.now;
    guide.runtime = {
        showToast(text) {
            toasts.push(text);
        },
    };
    guide.openingGuide = { name: 'PchLevelOneGuideStep1' };
    guide.handleLevelOneOpeningGuideRootTap = () => false;
    guide.trackOpeningGuideEvent = (...args) => tapResults.push(args);
    const missEvent = {
        propagationStopped: false,
        getUILocation: () => ({ x: 10, y: 20 }),
    };
    try {
        Date.now = () => now;
        guide.handleOpeningGuideRootTap(missEvent);
        assert.deepStrictEqual(toasts, ['请跟随指示完成引导'], 'the first wrong opening-guide tap must show the requested reminder');
        now += 1499;
        guide.handleOpeningGuideRootTap(missEvent);
        assert.strictEqual(toasts.length, 1, 'wrong opening-guide taps inside the 1.5-second cooldown must not repeat the toast');
        now += 1;
        guide.handleOpeningGuideRootTap(missEvent);
        assert.strictEqual(toasts.length, 2, 'the reminder must be eligible again at the 1.5-second cooldown boundary');

        guide.openingGuide.name = 'PchLevelTwoSpeedGuide';
        guide.speedButton = {
            getComponent() {
                return { getBoundingBoxToWorld: () => ({ contains: () => false }) };
            },
        };
        now += 1500;
        guide.handleOpeningGuideRootTap(missEvent);
        assert.strictEqual(toasts.length, 3, 'a wrong level-2 speed-guide tap must use the shared reminder');

        guide.openingGuide.name = 'PchLevelThreeCapacityGuide';
        guide.adButton = {
            getComponent() {
                return { getBoundingBoxToWorld: () => ({ contains: () => false }) };
            },
        };
        now += 1500;
        guide.handleOpeningGuideRootTap(missEvent);
        assert.strictEqual(toasts.length, 4, 'a wrong level-3 capacity-guide tap must use the shared reminder');

        let speedGuideRuns = 0;
        guide.openingGuide.name = 'PchLevelTwoSpeedGuide';
        guide.speedButton = {
            getComponent() {
                return { getBoundingBoxToWorld: () => ({ contains: () => true }) };
            },
        };
        guide.onOpeningGuideDoubleSpeed = () => { speedGuideRuns += 1; };
        assert.strictEqual(guide.handleOpeningGuideRootTap(missEvent), true, 'a correct guide target must retain its original success route');
        assert.strictEqual(speedGuideRuns, 1, 'a correct level-2 guide target must still execute exactly once');
        assert.strictEqual(toasts.length, 4, 'a correct guide target must not show the wrong-tap reminder');
    } finally {
        Date.now = originalDateNow;
    }
    assert.strictEqual(tapResults.length, 5, 'each wrong guide tap must retain its existing analytics result');
}

function runLevelOneOutcome(outcome, step) {
    const guide = createHarness(['private onOpeningGuideLevelOneTap(event: any): void']);
    const calls = { analytics: [], clear: 0, show: 0, dismiss: 0 };
    guide.openingGuideLevelOneCells = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    guide.openingGuideLevelOneStep = step;
    guide.rules = {};
    guide.runtime = {
        isGameEnd: false,
        getGameplayFixedRoot() { return 'fixed-root'; },
    };
    guide.handleBoardTap = () => outcome;
    guide.trackOpeningGuideEvent = (...args) => calls.analytics.push(args);
    guide.clearOpeningGuideNodes = () => { calls.clear += 1; };
    guide.showLevelOneBoardGuideStep = (parent) => {
        assert.strictEqual(parent, 'fixed-root');
        calls.show += 1;
    };
    guide.dismissOpeningGuide = () => { calls.dismiss += 1; };
    const event = { propagationStopped: false };
    guide.onOpeningGuideLevelOneTap(event);
    return { guide, calls, event };
}

for (const outcome of ['invalid', 'capacity_blocked']) {
    const result = runLevelOneOutcome(outcome, 0);
    assert.strictEqual(result.event.propagationStopped, true);
    assert.strictEqual(result.guide.openingGuideLevelOneStep, 0, `${outcome} must not advance level-1 guide state`);
    assert.strictEqual(result.calls.clear, 0, `${outcome} must retain the current guide visuals`);
    assert.strictEqual(result.calls.show, 0, `${outcome} must not show the second guide step`);
    assert.strictEqual(result.calls.dismiss, 0, `${outcome} must not dismiss the guide`);
    assert.deepStrictEqual(result.calls.analytics, [['pch_guide_tap_result', false, outcome]]);
}

const firstSuccess = runLevelOneOutcome('stored', 0);
assert.strictEqual(firstSuccess.guide.openingGuideLevelOneStep, 1, 'the first stored color must advance to step 2');
assert.strictEqual(firstSuccess.calls.clear, 1);
assert.strictEqual(firstSuccess.calls.show, 1);
assert.strictEqual(firstSuccess.calls.dismiss, 0);
assert.deepStrictEqual(firstSuccess.calls.analytics, [
    ['pch_guide_tap_result', true, 'stored'],
    ['pch_guide_step_done', true, 'completed'],
]);

const secondSuccess = runLevelOneOutcome('partial', 1);
assert.strictEqual(secondSuccess.calls.clear, 0);
assert.strictEqual(secondSuccess.calls.show, 0);
assert.strictEqual(secondSuccess.calls.dismiss, 1, 'the second accepted color must finish the level-1 guide');
assert.deepStrictEqual(secondSuccess.calls.analytics, [
    ['pch_guide_tap_result', true, 'partial'],
    ['pch_guide_step_done', true, 'completed'],
]);

playedAudio.length = 0;
const levelTwo = createHarness(['private onOpeningGuideDoubleSpeed(event: any): void']);
const multipliers = [];
const levelTwoAnalytics = [];
let levelTwoRefreshes = 0;
let levelTwoDismisses = 0;
levelTwo.rules = {};
levelTwo.runtime = { isGameEnd: false };
levelTwo.statusLabel = { string: '' };
levelTwo.setManualSpeedMultiplier = (value) => multipliers.push(value);
levelTwo.trackOpeningGuideEvent = (...args) => levelTwoAnalytics.push(args);
levelTwo.refreshSpeedButtonState = () => { levelTwoRefreshes += 1; };
levelTwo.dismissOpeningGuide = () => { levelTwoDismisses += 1; };
const speedEvent = { propagationStopped: false };
levelTwo.onOpeningGuideDoubleSpeed(speedEvent);
assert.deepStrictEqual(multipliers, [2], 'level 2 must deterministically enable 2x, independent of saved speed');
assert.strictEqual(speedEvent.propagationStopped, true);
assert.strictEqual(levelTwoRefreshes, 1);
assert.strictEqual(levelTwoDismisses, 1);
assert.strictEqual(levelTwo.statusLabel.string, '2 倍速度已开启');
assert.deepStrictEqual(levelTwoAnalytics, [
    ['pch_guide_tap_result', true, 'enabled_2x'],
    ['pch_guide_step_done', true, 'completed'],
]);
assert.deepStrictEqual(playedAudio, ['button']);

playedAudio.length = 0;
const levelThree = createHarness(['private onOpeningGuideFreeCapacity(event: any): void']);
const levelThreeAnalytics = [];
const levelThreeCalls = [];
const levelThreeToasts = [];
levelThree.rules = {};
levelThree.runtime = {
    isGameEnd: false,
    markDynamicCountdownAssisted() { levelThreeCalls.push('assist'); },
    showToast(text) {
        levelThreeCalls.push('toast');
        levelThreeToasts.push(text);
    },
};
levelThree.expandCapacity = () => {
    levelThreeCalls.push('expand');
    return true;
};
levelThree.trackOpeningGuideEvent = (...args) => levelThreeAnalytics.push(args);
levelThree.dismissOpeningGuide = () => { levelThreeCalls.push('dismiss'); };
const capacityEvent = { propagationStopped: false };
levelThree.onOpeningGuideFreeCapacity(capacityEvent);
assert.strictEqual(capacityEvent.propagationStopped, true);
assert.deepStrictEqual(levelThreeAnalytics, [
    ['pch_guide_tap_result', true, 'capacity_expanded'],
    ['pch_guide_step_done', true, 'completed'],
]);
assert.deepStrictEqual(levelThreeCalls, ['expand', 'assist', 'dismiss', 'toast']);
assert.deepStrictEqual(levelThreeToasts, ['传送带已扩容 +12']);
assert.deepStrictEqual(playedAudio, ['button']);

playedAudio.length = 0;
const failedLevelThree = createHarness(['private onOpeningGuideFreeCapacity(event: any): void']);
const failedLevelThreeAnalytics = [];
const failedLevelThreeToasts = [];
let failedLevelThreeDismisses = 0;
let failedLevelThreeAssists = 0;
failedLevelThree.rules = {};
failedLevelThree.runtime = {
    isGameEnd: false,
    markDynamicCountdownAssisted() { failedLevelThreeAssists += 1; },
    showToast(text) { failedLevelThreeToasts.push(text); },
};
failedLevelThree.expandCapacity = () => false;
failedLevelThree.trackOpeningGuideEvent = (...args) => failedLevelThreeAnalytics.push(args);
failedLevelThree.dismissOpeningGuide = () => { failedLevelThreeDismisses += 1; };
failedLevelThree.onOpeningGuideFreeCapacity({ propagationStopped: false });
assert.deepStrictEqual(failedLevelThreeAnalytics, [
    ['pch_guide_tap_result', false, 'capacity_expand_failed'],
]);
assert.strictEqual(failedLevelThreeAssists, 0, 'failed capacity expansion must not mark countdown assistance');
assert.strictEqual(failedLevelThreeDismisses, 0, 'failed capacity expansion must retain the guide');
assert.deepStrictEqual(failedLevelThreeToasts, [], 'failed capacity expansion must not show the success Toast');
assert.deepStrictEqual(playedAudio, ['button']);

function routeGuide(levelId, entryMode) {
    const guide = createHarness(['private showOpeningFeatureGuide(parent: Node): void']);
    const calls = [];
    guide.runtime = {
        _activeGameplayEntryMode: entryMode,
        getActiveLogicalLevelId() { return levelId; },
        getSF(name) { return name === 'guide_bubble_frame' ? {} : null; },
    };
    guide.speedButton = { isValid: true };
    guide.adButton = { isValid: true };
    guide.onOpeningGuideDoubleSpeed = () => {};
    guide.onOpeningGuideFreeCapacity = () => {};
    guide.showLevelOneBoardGuide = (parent) => calls.push(['level1', parent]);
    guide.showOpeningTargetGuide = (...args) => calls.push(['target', ...args]);
    guide.showOpeningFeatureGuide('fixed-root');
    return calls;
}

assert.deepStrictEqual(routeGuide(1, 'theme'), [], 'non-mainline level 1 must not show the opening guide');
assert.deepStrictEqual(routeGuide(1, 'main'), [['level1', 'fixed-root']]);
const deferredLevelOne = createHarness(['private showOpeningFeatureGuide(parent: Node): void']);
let guideBubbleLoaded = false;
let ensureGuideBubble = null;
let deferredLevelOneShows = 0;
deferredLevelOne.rules = {};
deferredLevelOne.runtime = {
    _activeGameplayEntryMode: 'main',
    isGameEnd: false,
    getActiveLogicalLevelId() { return 1; },
    getSF(name) { return name === 'guide_bubble_frame' && guideBubbleLoaded ? {} : null; },
    _ensureSpriteFramesByName(names, callback) {
        assert.deepStrictEqual(names, ['guide_bubble_frame']);
        ensureGuideBubble = callback;
    },
};
deferredLevelOne.showLevelOneBoardGuide = () => { deferredLevelOneShows += 1; };
const deferredGuideParent = { isValid: true };
deferredLevelOne.showOpeningFeatureGuide(deferredGuideParent);
assert.strictEqual(deferredLevelOne.inputLocked, true, 'level 1 input must stay locked while its bubble frame loads');
assert.strictEqual(deferredLevelOneShows, 0, 'level 1 guide must wait for the selected bubble frame');
assert.strictEqual(typeof ensureGuideBubble, 'function');
guideBubbleLoaded = true;
ensureGuideBubble();
assert.strictEqual(deferredLevelOneShows, 1, 'level 1 guide must resume after its bubble frame is ready');

for (const levelId of [1, 2, 3]) {
    const missingBubbleLoader = createHarness(['private showOpeningFeatureGuide(parent: Node): void']);
    missingBubbleLoader.speedButton = { isValid: true };
    missingBubbleLoader.adButton = { isValid: true };
    missingBubbleLoader.runtime = {
        _activeGameplayEntryMode: 'main',
        getActiveLogicalLevelId() { return levelId; },
        getSF() { return null; },
    };
    assert.throws(
        () => missingBubbleLoader.showOpeningFeatureGuide({ isValid: true }),
        /opening guide bubble frame loader is unavailable/,
        `level ${levelId} must fail fast instead of falling back to the old purple prompt`,
    );
}
assert.ok(
    source.includes("? '点击白色豆豆'")
        && source.includes(": '再点击蓝色豆豆';"),
    'level 1 must use the approved two-step opening-guide copy',
);
assert.ok(
    !source.includes('点击一组棋子\\n将它们放到下方传送带')
        && !source.includes('再点击另一组棋子\\n空出对应颜色的位置'),
    'level 1 must not retain the old long opening-guide copy',
);
const levelOneGuideStepSource = extractMethod('private showLevelOneBoardGuideStep(parent: Node): void');
const sharedTargetGuideSource = extractMethod('private showOpeningTargetGuide(');
const sharedTargetGuideAtSource = extractMethod('private showOpeningTargetGuideAt(');
assert.ok(
    levelOneGuideStepSource.includes('this.onOpeningGuideLevelOneTap,\n            true,\n        );'),
    'level 1 must request the selected frame without a vertical override',
);
assert.ok(
    sharedTargetGuideAtSource.includes('useGuideBubbleFrame = false')
        && sharedTargetGuideAtSource.includes("getSF?.('guide_bubble_frame')")
        && sharedTargetGuideAtSource.includes('Sprite.Type.SLICED')
        && sharedTargetGuideAtSource.includes("guideName.startsWith('PchLevelOneGuideStep')")
        && sharedTargetGuideAtSource.includes('const isStarterOpeningGuide = isLevelOneBoardGuide || isLevelTwoSpeedGuide || isLevelThreeCapacityGuide;')
        && !sharedTargetGuideAtSource.includes('createOpeningGuideFocusMask(')
        && sharedTargetGuideAtSource.includes('const promptWidth = isLevelOneBoardGuide ? 340')
        && sharedTargetGuideAtSource.includes('const promptHeight = isLevelOneBoardGuide ? 216')
        && sharedTargetGuideAtSource.includes("guideName === 'PchLevelOneGuideStep1'")
        && sharedTargetGuideAtSource.includes("bubbleBackground.setScale(1, isLevelTwoSpeedGuide ? -bubbleScaleY : bubbleScaleY, 1);")
        && sharedTargetGuideAtSource.includes("copy.split('\\n', 2)")
        && sharedTargetGuideAtSource.includes("this.makeLabel(prompt, copy, 38, new Color('#3C285D'), 0, 28, promptWidth - 48)")
        && sharedTargetGuideAtSource.includes("this.makeLabel(prompt, copy, 32, new Color('#3C285D'), 0, -16, promptWidth - 48)")
        && sharedTargetGuideAtSource.includes("title, 32, new Color('#3C285D'), 0, 48, promptWidth - 48")
        && sharedTargetGuideAtSource.includes("detail || title, 28, new Color('#3C285D'), 0, 4, promptWidth - 56")
        && sharedTargetGuideAtSource.includes('const handRestOffsetY = isLevelTwoSpeedGuide ? -52 : -76;')
        && sharedTargetGuideAtSource.includes('const handPressOffsetY = isLevelTwoSpeedGuide ? -36 : -60;')
        && sharedTargetGuideAtSource.includes("new Color('#7162A2')")
        && sharedTargetGuideAtSource.includes('copy, 28,')
        && sharedTargetGuideAtSource.includes('0, 22, promptWidth - 48')
        && sharedTargetGuideAtSource.includes('.isBold = true')
        && sharedTargetGuideAtSource.includes('const promptXLimit = isLevelThreeCapacityGuide ? 130 : (useGuideBubbleFrame ? 80 : 100);')
        && sharedTargetGuideAtSource.includes('const promptX = isLevelTwoSpeedGuide')
        && sharedTargetGuideAtSource.includes('? targetLocal.x')
        && sharedTargetGuideAtSource.includes(': Math.max(-promptXLimit, Math.min(promptXLimit, targetLocal.x));'),
    'all first-three-level guides must use compact bubble bodies, center text outside the tail, and anchor the level-2 tail to its speed button',
);
assert.ok(
    !source.includes('createOpeningGuideFocusMask(')
        && !source.includes('PchOpeningGuideDimMask')
        && !source.includes("setPanel('GuideDimTop'")
        && !source.includes("setPanel('GuideDimBottom'")
        && !source.includes("setPanel('GuideDimLeft'")
        && !source.includes("setPanel('GuideDimRight'"),
    'all first-three-level guides must not create a dim mask',
);
assert.ok(
    sharedTargetGuideSource.includes('promptYOverride?: number')
        && sharedTargetGuideSource.includes('const targetBounds = targetTransform.getBoundingBoxToWorld();')
        && sharedTargetGuideSource.includes('new Vec3(targetBounds.xMin, targetBounds.yMin, 0)')
        && sharedTargetGuideSource.includes('new Vec3(targetBounds.xMax, targetBounds.yMax, 0)')
        && sharedTargetGuideSource.includes('this.showOpeningTargetGuideAt(parent, targetLocal, targetWidth, targetHeight, guideName, copy, onTargetTap, true, promptYOverride);'),
    'level 2 and level 3 must use their real target bounds when requesting the selected guide bubble frame',
);
const levelTwoRoute = routeGuide(2, 'main');
assert.strictEqual(levelTwoRoute.length, 1);
assert.strictEqual(levelTwoRoute[0][3], 'PchLevelTwoSpeedGuide');
assert.strictEqual(levelTwoRoute[0][4], '点击开启两倍速');
assert.strictEqual(levelTwoRoute[0][6], undefined, 'level 2 must retain its existing vertical placement');
const levelThreeRoute = routeGuide(3, 'main');
assert.strictEqual(levelThreeRoute.length, 1);
assert.strictEqual(levelThreeRoute[0][3], 'PchLevelThreeCapacityGuide');
assert.strictEqual(levelThreeRoute[0][4], '点击扩容按钮\n增加12个位置');
assert.strictEqual(levelThreeRoute[0][6], undefined, 'level 3 prompt must calculate above its actual expansion target');
assert.ok(
    sharedTargetGuideAtSource.includes('promptYOverride?: number')
        && sharedTargetGuideAtSource.includes('const promptY = isLevelOneBoardGuide')
        && sharedTargetGuideAtSource.includes('const sharedPromptY = promptYOverride ?? Math.max(-520,')
        && sharedTargetGuideAtSource.includes('Math.min(isLevelOneFirstStep ? 520 : 500,')
        && sharedTargetGuideAtSource.includes('isLevelOneFirstStep ? 76 : 44')
        && sharedTargetGuideAtSource.includes('targetHeight / 2 - promptHeight / 2 - 24')
        && sharedTargetGuideAtSource.includes('targetLocal.y + targetHeight / 2 + promptHeight / 2 + 24')
        && !source.includes("'点击扩容按钮\\n增加12个位置', this.onOpeningGuideFreeCapacity, -365"),
    'the first-three-level prompts must use their approved target-relative positions',
);
assert.deepStrictEqual(routeGuide(4, 'main'), []);

const levelDir = path.join(root, 'assets/LevelData');
const levelOneData = JSON.parse(fs.readFileSync(path.join(levelDir, 'level_1.json'), 'utf8'));
const levelTwoData = JSON.parse(fs.readFileSync(path.join(levelDir, 'level_2.json'), 'utf8'));
assert.strictEqual(levelOneData.singleSelectionLimit, undefined, 'level 1 must retain the default selection limit');
assert.strictEqual(levelTwoData.singleSelectionLimit, 18, 'only level 2 receives the confirmed 18-bean override');
const eighteenBeanLevels = fs.readdirSync(levelDir)
    .filter((name) => /^level_\d+\.json$/.test(name))
    .filter((name) => JSON.parse(fs.readFileSync(path.join(levelDir, name), 'utf8')).singleSelectionLimit === 18);
assert.deepStrictEqual(eighteenBeanLevels, ['level_2.json']);
const levelConfig = fs.readFileSync(path.join(root, 'assets/Scripts/Core/LevelConfig.ts'), 'utf8');
assert.ok(levelConfig.includes('export const DEFAULT_PCH_SINGLE_SELECTION_LIMIT = 12;'));

const boardTap = extractMethod('private handleBoardTap(row: number, col: number): PchBoardTapOutcome');
assert.strictEqual((source.match(/ensureTimerStarted\?\.\(\)/g) || []).length, 1);
assert.ok(boardTap.indexOf('if (result.moved <= 0)') < boardTap.indexOf('this.runtime.ensureTimerStarted?.();'));
const guideSection = source.slice(
    source.indexOf('    private showOpeningFeatureGuide('),
    source.indexOf('    private onSpeedButtonTap('),
);
assert.ok(!/localStorage|\.setItem\(|\.getItem\(|setGuideComplete/i.test(guideSection), 'opening-guide completion must not be persisted');

console.log('pch-level1-level2-opening-guide.test.js passed');
