const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

class Vec2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
class Vec3 extends Vec2 { constructor(x = 0, y = 0, z = 0) { super(x, y); this.z = z; } }
class UITransform {}
const CoopServiceMgr = { inst: { active: null } };
function harness(file, names, bindings = {}) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ts.ScriptTarget.Latest, true);
    const methods = [];
    function visit(node) {
        if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(source))) methods.push(node.getText(source));
        ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(methods.length, names.length);
    const code = ts.transpileModule(`class Harness { ${methods.join('\n')} }`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const values = { Vec2, Vec3, UITransform, CoopServiceMgr, ...bindings };
    return new (new Function(...Object.keys(values), `${code}; return Harness;`)(...Object.values(values)))();
}
const controllerFile = 'assets/Scripts/Core/PchConveyorGameplayController.ts';
const coopFile = 'assets/Scripts/Core/GameCtrlModules/CoopModeModule.ts';
const methods = ['playOpeningPatternShuffle', 'updateCoopOpening', 'update', 'isCoopOpening',
    'cancelOpeningPatternShuffle', 'isStartupInteractionReady', 'onRootTouchStart', 'onRootTouchMove',
    'onRootMouseWheel', 'onRootTouchEnd', 'isSkillBusy', 'setExternalInputBlocked', 'isPresentationPaused'];
for (const role of ['creator', 'collaborator']) {
    const runtime = harness(coopFile, ['restoreCoopBoard', 'getCoopBoardContentBounds', 'updateCoopClock']);
    const rules = { board: { isAllLocked: () => false } };
    const replay = { rules, board: {}, pendingReady: [200], lastTime: 0, firstTap: -1 };
    const active = { full: { boardWidth: 64, boardHeight: 56 }, half: { boardWidth: 32, boardHeight: 56 },
        run: { role }, replay, elapsedMs: 0, error: '' };
    CoopServiceMgr.inst.active = active;
    runtime.isCoopMode = () => true;
    runtime.restoreCoopBoard();
    assert.equal(runtime.boardModel, replay.board);
    assert(runtime.getCoopBoardContentBounds().minCol === (role === 'creator' ? 0 : -32));
    const scheduled = [];
    const full = { scale: 0.9, offset: new Vec2(role === 'creator' ? -150 : 150, 10) };
    const own = { scale: 1.2, offset: new Vec2(0, 10) };
    let home = full;
    runtime.boardGroup = { isValid: true };
    runtime.boardViewport = { scale: full.scale, offset: full.offset,
        getHomeTransform: () => home,
        setViewTransformClamped(scale, offset) { this.scale = scale; this.offset = offset; } };
    runtime.refitBoardViewportToSafeRect = () => {
        assert.equal(runtime.getCoopBoardContentBounds().minCol, 0);
        assert.equal(runtime.getCoopBoardContentBounds().maxCol, 31);
        home = own;
    };
    runtime.scheduleOnce = (fn, delay) => scheduled.push([fn, delay]);
    runtime.syncSkillButtonRuntimeStates = () => {};
    runtime.restrictCoopBoardViewport = () => { runtime._coopViewportRestricted = true; };
    let leaked = 0;
    runtime.onTouchStart = runtime.onTouchMove = runtime.onMouseWheel = () => leaked++;
    const controller = harness(controllerFile, methods);
    Object.assign(controller, { runtime, rules, root: { isValid: true, activeInHierarchy: true },
        openingPatternState: 'ready', openingPatternGeneration: 0, openingPatternVisuals: [],
        activeFlyBeans: new Set(), activeReturnAnimations: 0, inputLocked: true,
        updateCapacityHint() {}, isActive: () => true, isSettingsPaused() { return this.settingsPaused; },
        pauseForSettings() { this.settingsPaused = true; }, resumeAfterSettings() { this.settingsPaused = false; },
        restoreOpeningPatternVisuals() {} });
    runtime._pchConveyorGameplayController = controller;
    controller.playOpeningPatternShuffle();
    assert.equal(scheduled.length, 0, 'rule callbacks must wait until the camera settles');
    assert.equal(controller.isSkillBusy(), true);
    for (const name of ['onRootTouchStart', 'onRootTouchMove', 'onRootMouseWheel', 'onRootTouchEnd']) {
        const event = {};
        controller[name](event);
        assert.equal(event.propagationStopped, true);
    }
    assert.equal(leaked, 0);
    const step = dt => { runtime.updateCoopClock(dt); controller.update(dt); };
    step(0.5);
    assert.equal(runtime.boardViewport.scale, full.scale, 'full picture remains for half a second');
    assert.equal(active.elapsedMs, 0);
    assert.equal(controller.settingsPaused, undefined, 'opening input lock must not pause its own animation');
    runtime._gameForeground = false;
    step(5);
    assert.equal(controller.coopOpening.elapsed, 0.5, 'background time does not advance the camera');
    runtime._gameForeground = true;
    step(0.25);
    assert(Math.abs(runtime.boardViewport.scale - 1.05) < 1e-9);
    assert.equal(runtime.boardViewport.offset.x, full.offset.x / 2);
    controller.settingsPaused = true;
    step(5);
    assert.equal(controller.coopOpening.elapsed, 0.75);
    controller.settingsPaused = false;
    step(0.25);
    assert.equal(runtime.boardViewport.scale, own.scale);
    assert.equal(runtime.boardViewport.offset.x, own.offset.x);
    assert.equal(runtime.boardViewScale, own.scale, 'viewport and runtime snapshots remain synchronized');
    assert.equal(controller.isStartupInteractionReady(), true);
    assert.equal(controller.inputLocked, false);
    assert.equal(controller.externalInputBlocked, false);
    assert.equal(active.elapsedMs, 0);
    assert.equal(scheduled.length, 2, 'pending arrivals and replay completion checks resume once');
    assert.equal(runtime._coopReplayResumeState, replay);
    assert.equal(controller.rules, rules, 'camera animation cannot recreate game rules');
    runtime.updateCoopClock(0.1);
    assert.equal(active.elapsedMs, 100);
    controller.openingPatternState = 'ready';
    home = full;
    controller.playOpeningPatternShuffle();
    controller.cancelOpeningPatternShuffle(false);
    assert.equal(controller.coopOpening, null, 'stop/restart cancels the camera without a late callback');
    assert.equal(scheduled.length, 2);
}
const pvp = harness(controllerFile, ['playOpeningPatternShuffle']);
const callbacks = [];
pvp.runtime = { isCoopMode: () => false, _pvpReplayResumeState: { pendingReady: [] }, scheduleOnce: fn => callbacks.push(fn) };
pvp.openingPatternState = 'ready';
pvp.playOpeningPatternShuffle();
assert.equal(pvp.openingPatternState, 'done', 'PVP retains its existing replay startup');
assert.equal(callbacks.length, 1);
console.log('COOP_OPENING_TESTS_PASSED: both roles, input, time, pause, replay and cancellation');
