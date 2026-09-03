'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function extractMethod(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing method signature: ${signature}`);
    const open = source.indexOf('{', start);
    assert.ok(open >= 0, `missing method body: ${signature}`);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated method body: ${signature}`);
}

function compileMethod(source, signature, dependencies = {}) {
    const method = extractMethod(source, signature);
    const open = method.indexOf('{');
    const transpiled = ts.transpileModule(
        `function extractedMethod() ${method.slice(open)}`,
        {
            compilerOptions: {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.CommonJS,
            },
        },
    ).outputText;
    const names = Object.keys(dependencies);
    const values = names.map((name) => dependencies[name]);
    return new Function(...names, `${transpiled}; return extractedMethod;`)(...values);
}

const settlementSource = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const conveyorSource = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const timerSource = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');

const isFinishPending = compileMethod(conveyorSource, 'isFinishPending(): boolean');
assert.equal(
    isFinishPending.call({ rules: { board: { isAllLocked: () => true } }, finishCommitted: false }),
    true,
    'a fully locked PCH board must report the short final-effect window as finish-pending',
);
assert.equal(
    isFinishPending.call({ rules: { board: { isAllLocked: () => true } }, finishCommitted: true }),
    false,
    'a committed PCH finish must not stay pending',
);
assert.equal(
    isFinishPending.call({ rules: { board: { isAllLocked: () => false } }, finishCommitted: false }),
    false,
    'an unfinished board must not suppress a legitimate timeout',
);

const isBoardCompletionPending = compileMethod(
    settlementSource,
    'isBoardCompletionPendingForSettlement(): boolean',
);
assert.equal(
    isBoardCompletionPending.call({
        _pchConveyorGameplayController: { isActive: () => true, isFinishPending: () => true },
    }),
    true,
    'Settlement must recognize the active PCH final-effect window as pending completion',
);
assert.equal(
    isBoardCompletionPending.call({
        _pchConveyorGameplayController: { isActive: () => true, isFinishPending: () => false },
    }),
    false,
    'Settlement must not suppress timeout after PCH says no completion is pending',
);

const runGameLose = compileMethod(
    settlementSource,
    "gameLose(reason: 'timeout' | 'buffer-full' = 'timeout')",
    {
        AnalyticsMgr: { inst: { markLevelFailed() {}, trackRevivePanelShow() {} } },
        SySDKMgr: { inst: { reportLevelFail() {} } },
        PerformanceMgr: { inst: { markUserActivity() {} } },
        AudioMgr: { inst: { play() {} } },
    },
);
const runTickTimer = compileMethod(
    timerSource,
    'tickTimer()',
    {
        Color: class Color {},
        Tween: { stopAllByTarget() {} },
        Vec3: class Vec3 {},
        AudioMgr: { inst: { play() {} } },
        COUNTDOWN_WARNING_TICK_SECONDS: new Set(),
    },
);

let pauseForSettlementCalls = 0;
let timeoutFailureCalls = 0;
const unscheduled = [];
const finalSecondRuntime = {
    isGameEnd: false,
    _currentLevelUnlimitedTime: false,
    _timerPauseRefs: 0,
    timeRemain: 1,
    timerLabel: null,
    _countdownWarningTickSecondsPlayed: new Set(),
    tickTimer() {},
    tickFreezeTimer() { return false; },
    checkAdRewardTimedHints() {},
    isBoardCompletionCommittedForSettlement() { return false; },
    isBoardCompletionPendingForSettlement() {
        return isBoardCompletionPending.call(this);
    },
    _pchConveyorGameplayController: {
        isActive: () => true,
        isFinishPending: () => true,
        pauseForSettlement() { pauseForSettlementCalls += 1; },
    },
    unschedule(callback) { unscheduled.push(callback); },
    gameLose(reason) {
        timeoutFailureCalls += 1;
        return runGameLose.call(this, reason);
    },
};
runTickTimer.call(finalSecondRuntime);
assert.equal(finalSecondRuntime.timeRemain, 0, 'the timer may reach zero after the last bean is placed');
assert.equal(timeoutFailureCalls, 1, 'the normal timer path must still invoke the settlement guard');
assert.equal(finalSecondRuntime.isGameEnd, false, 'a pending completed PCH board must not enter failure state');
assert.equal(pauseForSettlementCalls, 0, 'a pending completed PCH board must not pause and consume its final effects');
assert.ok(unscheduled.includes(finalSecondRuntime.tickTimer), 'the expired timer must stop while the final PCH effects commit victory');

const runPauseForSettlement = compileMethod(
    conveyorSource,
    'pauseForSettlement(): void',
    { Tween: { pauseAllByTarget() {} } },
);
const runResumeAfterSettlement = compileMethod(
    conveyorSource,
    'resumeAfterSettlement(): void',
    {
        Tween: { resumeAllByTarget() {} },
        PCH_RETURN_COMPLETE_DELAY_SECONDS: 0.2,
        PCH_RETURN_COLOR_COMPLETE_DELAY_SECONDS: 0.12,
    },
);
const colorSettle = () => {};
const pausedCallbacks = [];
const rescheduledCallbacks = [];
let commitRetryCalls = 0;
const pausedController = {
    settlementPaused: false,
    activeReturnBeans: new Set(),
    pendingReturnCompletions: new Map([[{}, () => {}]]),
    pendingPchReturnColorSettles: new Set([colorSettle]),
    runtime: {
        unschedule(callback) { pausedCallbacks.push(callback); },
        scheduleOnce(callback, delay) { rescheduledCallbacks.push({ callback, delay }); },
    },
    isActive() { return true; },
    dismissOpeningGuide() {},
    resetCapacityWarning() {},
    tryCommitFinishAfterPchColorCompleteEffects() { commitRetryCalls += 1; },
};
runPauseForSettlement.call(pausedController);
assert.ok(pausedCallbacks.includes(colorSettle), 'settlement pause must preserve pending final color-settle callbacks');
runResumeAfterSettlement.call(pausedController);
assert.ok(
    rescheduledCallbacks.some((entry) => entry.callback === colorSettle && entry.delay === 0.12),
    'settlement resume must requeue each preserved final color-settle callback',
);
assert.equal(commitRetryCalls, 1, 'resume must retry the finish commit when an already-running color effect completed during settlement');

console.log('final-second-completion-guard.test.js passed');
