const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8').replace(/\r\n/g, '\n');

const boardInput = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const pchSource = read('assets/Scripts/Core/PchConveyorGameplayController.ts');

function extractMethod(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing method: ${signature}`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] !== '}') continue;
        depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated method: ${signature}`);
}

function compileHarness(className, methods, injectedNames, injectedValues) {
    const compiled = ts.transpileModule(`export class ${className} {\n${methods.join('\n')}\n}`, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const testModule = { exports: {} };
    const load = new Function('module', 'exports', 'require', ...injectedNames, compiled);
    load(testModule, testModule.exports, require, ...injectedValues);
    return testModule.exports[className];
}

class FakeVec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    set(x, y) {
        if (typeof x === 'object') {
            this.x = x.x;
            this.y = x.y;
            return this;
        }
        this.x = x;
        this.y = y;
        return this;
    }
}

class FakeVec3 extends FakeVec2 {
    constructor(x = 0, y = 0, z = 0) {
        super(x, y);
        this.z = z;
    }

    set(x, y, z = 0) {
        if (typeof x === 'object') {
            super.set(x);
            this.z = x.z || 0;
            return this;
        }
        super.set(x, y);
        this.z = z;
        return this;
    }

    static equals(left, right) {
        return left.x === right.x && left.y === right.y && left.z === right.z;
    }
}

FakeVec3.ZERO = new FakeVec3();

const RuntimeHarness = compileHarness(
    'RuntimeHarness',
    [
        extractMethod(gameplayView, 'getTouchId(touch: any, fallback: number): number {'),
        extractMethod(gameplayView, 'getTouchUiPos(touch: any): Vec2 {'),
        extractMethod(gameplayView, 'updateActiveBoardTouches(event: any, removeChanged: boolean = false): number {'),
        extractMethod(gameplayView, 'uiToViewportParent(uiPos: Vec2): Vec2 {'),
        extractMethod(gameplayView, 'beginBoardPanFromUiPos(uiPos: Vec2, immediate: boolean = false) {'),
        extractMethod(boardInput, 'transitionFromPinchToRemainingTouch(): void {'),
        extractMethod(boardInput, 'onTouchMove(event: EventTouch) {'),
        extractMethod(boardInput, 'onTouchEnd(event: EventTouch) {'),
        extractMethod(boardInput, 'resetTouchState() {'),
        extractMethod(boardInput, 'onTouchCancel(_event: EventTouch) {'),
    ],
    ['PerformanceMgr', 'Vec2', 'Vec3'],
    [{ inst: { markUserActivity() {} } }, FakeVec2, FakeVec3],
);

RuntimeHarness.DRAG_THRESHOLD = 10;
RuntimeHarness.BOARD_PAN_SENSITIVITY = 0.8;

const PchHarness = compileHarness(
    'PchHarness',
    [extractMethod(pchSource, 'private onRootTouchEnd(event: any): void {')],
    ['Vec3'],
    [FakeVec3],
);

function makeTouch(id, x, y) {
    return {
        getID: () => id,
        getUILocation: () => ({ x, y }),
    };
}

function makeTouchEvent(touch, allTouches) {
    return {
        touch,
        propagationStopped: false,
        getAllTouches: () => allTouches,
        getUILocation: () => touch.getUILocation(),
    };
}

function createRuntime() {
    const runtime = new RuntimeHarness();
    runtime.runtime = runtime;
    runtime.isGameEnd = false;
    runtime._modalFocusRefs = 0;
    runtime._guideInputSuspended = false;
    runtime._skillActive = false;
    runtime._wandMode = false;
    runtime._guideStep = -1;
    runtime._guideMode = 'none';
    runtime.activeBoardTouches = new Map();
    runtime.gestureMode = 'idle';
    runtime.suppressTap = false;
    runtime.pinchTouchIds = null;
    runtime.pinchStartDist = 0;
    runtime.pinchStartScale = 1;
    runtime.totalMoveDistance = 0;
    runtime.boardViewScale = 1.6;
    runtime.levelData = { levelId: 2 };
    runtime.boardGroup = {
        isValid: true,
        position: new FakeVec3(180, 75, 0),
        scale: new FakeVec3(1.6, 1.6, 1),
    };
    runtime.panStartPos = new FakeVec2(40, 50);
    runtime.panStartParentPos = new FakeVec2(-320, -590);
    runtime.panStartGroupPos = new FakeVec3(-210, -180, 0);
    runtime.boardViewport = {
        uiToViewportParent(uiPos) {
            return new FakeVec2(uiPos.x, uiPos.y);
        },
    };
    runtime.setGestureMode = function setGestureMode(mode) {
        this.gestureMode = mode;
    };
    runtime.setGroupPosClamped = function setGroupPosClamped(x, y) {
        this.boardGroup.position.set(x, y, 0);
    };
    runtime.beginSmartIdleHintInputActivity = () => {};
    runtime.endSmartIdleHintInputActivity = () => {};
    return runtime;
}

const runtime = createRuntime();
const firstTouch = makeTouch(1, 120, 220);
const remainingTouch = makeTouch(2, 300, 320);
runtime.activeBoardTouches.set(1, new FakeVec2(120, 220));
runtime.activeBoardTouches.set(2, new FakeVec2(300, 320));
runtime.gestureMode = 'pinching';
runtime.suppressTap = true;
runtime.pinchTouchIds = [1, 2];
runtime.pinchStartDist = 205;
runtime.pinchStartScale = 1.2;

const pch = new PchHarness();
pch.rules = { cells: [] };
pch.inputLocked = false;
pch.runtime = runtime;

const beforeRelease = {
    x: runtime.boardGroup.position.x,
    y: runtime.boardGroup.position.y,
    scale: runtime.boardViewScale,
};
const releaseEvent = makeTouchEvent(firstTouch, [remainingTouch]);
pch.onRootTouchEnd(releaseEvent);

assert.strictEqual(releaseEvent.propagationStopped, true, 'pinch release must remain consumed by PCH');
assert.deepStrictEqual(
    {
        x: runtime.boardGroup.position.x,
        y: runtime.boardGroup.position.y,
        scale: runtime.boardViewScale,
    },
    beforeRelease,
    'lifting one finger must not change the post-pinch board transform',
);
assert.strictEqual(runtime.activeBoardTouches.size, 1, 'the remaining physical touch must stay tracked');
assert.strictEqual(runtime.activeBoardTouches.has(2), true, 'the remaining touch id must be preserved');
assert.strictEqual(runtime.gestureMode, 'panning', 'pinch release must transition to remaining-touch pan');
assert.deepStrictEqual(
    { x: runtime.panStartGroupPos.x, y: runtime.panStartGroupPos.y },
    { x: beforeRelease.x, y: beforeRelease.y },
    'remaining-touch pan must rebase from the current post-pinch board position',
);
assert.deepStrictEqual(
    { x: runtime.panStartPos.x, y: runtime.panStartPos.y },
    { x: 300, y: 320 },
    'remaining-touch pan must rebase from the remaining touch coordinate',
);

const movedRemainingTouch = makeTouch(2, 304, 322);
runtime.onTouchMove(makeTouchEvent(movedRemainingTouch, [movedRemainingTouch]));
assert.ok(Math.abs(runtime.boardGroup.position.x - 183.2) < 1e-9, 'first one-finger move must continue from the post-pinch X position');
assert.ok(Math.abs(runtime.boardGroup.position.y - 76.6) < 1e-9, 'first one-finger move must continue from the post-pinch Y position');

const tapPch = new PchHarness();
let tapCancelCalls = 0;
let tapEndCalls = 0;
tapPch.rules = { cells: [] };
tapPch.inputLocked = false;
tapPch.runtime = {
    isGameEnd: false,
    gestureMode: 'idle',
    suppressTap: false,
    onTouchCancel() { tapCancelCalls += 1; },
    onTouchEnd() { tapEndCalls += 1; },
};
tapPch.hasDirectButtonTarget = () => true;
tapPch.onRootTouchEnd(makeTouchEvent(makeTouch(9, 50, 60), []));
assert.strictEqual(tapCancelCalls, 1, 'ordinary PCH taps must retain the reset-only route');
assert.strictEqual(tapEndCalls, 0, 'ordinary PCH taps must not enter generic gameplay touch-end selection');

console.log('pch-pinch-release-transition.test.js passed');
