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

function createHarness(signatures) {
    const methods = signatures.map(extractMethod).join('\n');
    const compiled = ts.transpileModule(`export class Harness {\n${methods}\n}`, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const testModule = { exports: {} };
    const load = new Function('module', 'exports', 'require', 'AudioMgr', 'Vec3', compiled);
    load(testModule, testModule.exports, require, fakeAudioMgr, class FakeVec3 {});
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
const lockedMissEvent = { propagationStopped: false };
touchEnd.onRootTouchEnd(lockedMissEvent);
assert.strictEqual(guideTapCount, 1, 'locked touch-end must still attempt the active guide target');
assert.strictEqual(lockedMissEvent.propagationStopped, true, 'a locked guide miss must not reach unrelated controls');

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

function routeGuide(levelId, entryMode) {
    const guide = createHarness(['private showOpeningFeatureGuide(parent: Node): void']);
    const calls = [];
    guide.runtime = {
        _activeGameplayEntryMode: entryMode,
        getActiveLogicalLevelId() { return levelId; },
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
assert.ok(
    source.includes("? '点击一组棋子，将它们放到传送带上'")
        && source.includes(": '再点击另一组棋子，空出对应颜色的位置';"),
    'level 1 must use the original package Guide_table1 and Guide_table2 copy',
);
assert.ok(!source.includes('点击红色豆豆') && !source.includes('再点蓝色豆豆'));
const levelTwoRoute = routeGuide(2, 'main');
assert.strictEqual(levelTwoRoute.length, 1);
assert.strictEqual(levelTwoRoute[0][3], 'PchLevelTwoSpeedGuide');
assert.strictEqual(levelTwoRoute[0][4], '点击开启两倍速');

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
