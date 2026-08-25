const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts'),
    'utf8',
);
const output = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
const timers = [];
class TestColor {
    constructor(value) {
        this.value = value;
    }
}
class TestTween {
    static stopAllByTarget() {}
}
const sandbox = {
    exports: {},
    module: { exports: {} },
    require(request) {
        if (request === './GameplayColorCompleteFxModule') {
            return { installGameplayColorCompleteFxMethods() {} };
        }
        if (request === './GameplaySlotCompactionModule') {
            return { installGameplaySlotCompactionMethods() {} };
        }
        if (request === '../RuntimeLog') {
            return { runtimeLog() {} };
        }
        if (request === '../GameCtrlShared') {
            return new Proxy({}, {
                get(_target, key) {
                    if (key === 'Color') return TestColor;
                    if (key === 'Tween') return TestTween;
                    return class RuntimeStub {};
                },
            });
        }
        return {};
    },
    console,
    setTimeout(callback, delay) {
        const timer = { callback, delay, cleared: false };
        timers.push(timer);
        return timer;
    },
    clearTimeout(timer) {
        if (timer) timer.cleared = true;
    },
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(output, sandbox, { filename: 'GameplayPlacementFxModule.ts' });

const { getBeanFlyStaggerDelay } = sandbox.module.exports;
assert.strictEqual(getBeanFlyStaggerDelay(0), 0, 'empty transfers must not stagger');
assert.strictEqual(getBeanFlyStaggerDelay(1), 0, 'single-bean transfers must start immediately');
assert.strictEqual(getBeanFlyStaggerDelay(12), 0.028, 'the existing 12-bean L1 animation cadence must stay unchanged');
assert.strictEqual(getBeanFlyStaggerDelay(48), 0.028, '48-bean transfers must keep the fixed reference stagger');
assert.strictEqual(getBeanFlyStaggerDelay(96), 0.028, 'larger transfers must not compress the reference stagger');
const fortyEightTotalDuration = getBeanFlyStaggerDelay(48) * 47 + 0.2;
assert.ok(Math.abs(fortyEightTotalDuration - 1.516) < 1e-9, '48 beans must finish in the reference 1.516-second cadence');

const runtimeOwners = new Map();
let ownerSeq = 0;
const runtime = {
    _placementInputLockRefs: 0,
    _placementInputLocked: false,
    _placementVisualRefs: 0,
    _placementAnimationGeneration: 7,
    _placementOperationWatchdogs: new Map(),
    acquireRuntimeOwner(scope, owner) {
        const token = `${scope}:${++ownerSeq}:${owner}`;
        runtimeOwners.set(token, { scope, owner });
        return token;
    },
    releaseRuntimeOwner(token) {
        return runtimeOwners.delete(token);
    },
    releaseRuntimeOwnerByName(scope, owner) {
        const entry = [...runtimeOwners.entries()].find(([, value]) => value.scope === scope && value.owner === owner);
        return entry ? runtimeOwners.delete(entry[0]) : false;
    },
    getRuntimeOwnerCount(scope) {
        return [...runtimeOwners.values()].filter((value) => value.scope === scope).length;
    },
    clearRuntimeOwners(scope) {
        for (const [token, value] of runtimeOwners.entries()) {
            if (!scope || value.scope === scope) runtimeOwners.delete(token);
        }
    },
    _flyingTargetRefs: new Map(),
    _hiddenSlotIndexRefs: new Map(),
    _flyingTargets: new Set(),
    _hiddenSlotIndices: new Set(),
};
sandbox.module.exports.installGameplayPlacementFxModule(runtime);
const placementToken = runtime.beginPlacementVisual('test-operation');
runtime.armPlacementOperationWatchdog(placementToken, 7, 'test-operation', () => {
    runtime.endPlacementVisual(placementToken);
});
const placementDeadline = timers.find((timer) => timer.delay === 3000 && !timer.cleared);
assert.ok(placementDeadline, 'placement operation must own a three-second watchdog');
placementDeadline.callback();
placementDeadline.cleared = true;
assert.strictEqual(runtime._placementVisualRefs, 0, 'watchdog recovery must release the exact placement owner');
assert.strictEqual(runtimeOwners.size, 0);
assert.strictEqual(runtime._placementOperationWatchdogs.size, 0);

const staleToken = runtime.beginPlacementVisual('stale-operation');
runtime.armPlacementOperationWatchdog(staleToken, 7, 'stale-operation', () => {
    throw new Error('a cleared watchdog must not run');
});
const staleDeadline = timers.filter((timer) => timer.delay === 3000 && !timer.cleared).at(-1);
runtime.clearPlacementVisualState();
assert.strictEqual(staleDeadline.cleared, true, 'scene/reset cleanup must cancel placement watchdog timers');
assert.strictEqual(runtime._placementVisualRefs, 0);

runtime.formatTime = (seconds) => `04:${String(seconds % 60).padStart(2, '0')}`;
runtime.timeRemain = 240;
runtime._currentLevelUnlimitedTime = false;
runtime._freezeTimeLeft = 2;
runtime._freezeTimeTotal = 2;
runtime.timerLabel = {
    string: '04:00',
    color: null,
    node: { setScale() {} },
};
runtime.refreshFreezeTimerLabel();
assert.strictEqual(runtime.timerLabel.string, '\u2744 04:00', 'active freeze must show a snowflake in the timer bar');
assert.strictEqual(runtime.timerLabel.color.value, '#2E8EEA', 'active freeze must use the frozen timer color');
assert.strictEqual(runtime.tickFreezeTimer(), true);
assert.strictEqual(runtime.timerLabel.string, '\u2744 04:00', 'the freeze marker must remain while frozen time remains');
assert.strictEqual(runtime.tickFreezeTimer(), true);
assert.strictEqual(runtime.timerLabel.string, '04:00', 'the timer bar must restore its normal text when freeze ends');
assert.strictEqual(runtime.timerLabel.color.value, '#2E241A', 'the timer bar must restore its normal color when freeze ends');

console.log('placement-fx-stagger.test.js passed');
