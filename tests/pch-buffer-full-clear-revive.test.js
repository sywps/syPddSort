'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const timers = new Map();
let timerId = 0;
const setTimer = (fn) => { timers.set(++timerId, fn); return timerId; };
const clearTimer = (id) => timers.delete(id);
function fireTimers() {
    const pending = [...timers.entries()];
    for (const [id, fn] of pending) if (timers.delete(id)) fn();
}
const logs = [];
const logger = { log() {}, warn(...args) { logs.push(args); }, error(...args) { logs.push(args); } };
class Vec3 {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    clone() { return new Vec3(this.x, this.y, this.z); }
}
class UITransform {
    constructor() { this.contentSize = { width: 720, height: 1280 }; }
    setContentSize(width, height) { this.contentSize = { width, height }; }
    convertToNodeSpaceAR(value) { return value; }
}
class Label { static HorizontalAlign = { CENTER: 1 }; static VerticalAlign = { CENTER: 1 }; }
class Button { static EventType = { CLICK: 'click' }; static Transition = { SCALE: 1 }; }
class Color { static WHITE = new Color(); clone() { return new Color(); } }
class Sprite { static Type = { SLICED: 1 }; }
class Graphics { rect() {} roundRect() {} fill() {} }
class BlockInputEvents {}
class UIOpacity {}
class Node {
    static EventType = { TOUCH_END: 'end' };
    constructor(name = '') {
        Object.assign(this, { name, children: [], isValid: true, active: true, layer: 1, components: new Map(), events: new Map() });
    }
    get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    addChild(node) { this.children.push(node); node.parent = this; }
    getChildByName(name) { return this.children.find(n => n.name === name) || null; }
    addComponent(Type) { const c = new Type(); c.node = this; this.components.set(Type, c); return c; }
    getComponent(Type) { return this.components.get(Type) || null; }
    getComponentsInChildren() { return []; }
    setPosition() {} setScale() {} setSiblingIndex() {}
    on(event, callback) { this.events.set(event, callback); }
    removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
    destroy() { this.isValid = false; this.removeFromParent(); }
}
const animations = [];
const tween = (node) => {
    const state = { node, callbacks: [], stopped: false };
    const chain = new Proxy({}, { get(_, name) {
        if (name === 'call') return (callback) => { state.callbacks.push(callback); return chain; };
        if (name === 'start') return () => { animations.push(state); return chain; };
        return () => chain;
    } });
    return chain;
};
const cc = {
    Node, UITransform, Label, Button, Color, Sprite, Graphics, BlockInputEvents, UIOpacity, Vec3, Vec2: Vec3,
    NodePool: class {}, Layers: { Enum: { UI_2D: 1 } },
    Tween: { stopAllByTarget(node) { for (const a of animations) if (a.node === node) a.stopped = true; } },
    AudioMgr: { inst: { play() {}, vibratePlace() {} } },
    AnalyticsMgr: { inst: {} }, SySDKMgr: { inst: {} }, PerformanceMgr: { inst: { markUserActivity() {} } },
    tween,
};
const shared = new Proxy(cc, { get(target, name) { return name in target ? target[name] : class {}; } });
function compile(code, dependencies = {}) {
    const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', 'setTimeout', 'clearTimeout', 'console', ...Object.keys(dependencies), output)(
        loaded, loaded.exports, (request) => {
            if (request === './GameCtrlShared') return shared;
            if (request === './PchConveyorRules') return { PchConveyorRules: Rules };
            if (request === './PchConveyorGameplayController') return { ensurePchConveyorGameplayController: r => r._pchConveyorGameplayController };
            if (request === './MiniGamePlatform') return { isMiniGameRuntime: () => true };
            if (request === './LevelConfig') return {
                CONVEYOR_STACK_DEPTH: 3,
                validateConveyorCapacity: value => value,
                validatePchSingleSelectionLimit: value => value || 12,
                validateAutoConveyorFinishSpeed: value => value !== false,
            };
            return shared;
        }, setTimer, clearTimer, logger, ...Object.values(dependencies),
    );
    return loaded.exports;
}
const source = name => fs.readFileSync(path.join(root, 'assets/Scripts/Core', name), 'utf8');
function methods(file, names, dependencies = {}) {
    const code = source(file);
    const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    const bodies = [];
    function visit(node) {
        if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast))) bodies.push(node.getText(ast));
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(bodies.length, names.length);
    return compile(`export class Harness { ${bodies.join('\n')} }`, { ...cc, ...dependencies }).Harness;
}
const { BoardModel } = compile(source('BoardModel.ts'));
const { PchConveyorRules: Rules } = compile(source('PchConveyorRules.ts'));
const { PchConveyorGameplayController: Controller } = compile(source('PchConveyorGameplayController.ts'));
function makeRules() {
    return new Rules(new BoardModel({ boardWidth: 2, boardHeight: 1, correctColorArr: [[1, 2]], initRandomColorArr: [[2, 1]] }), 6);
}

// Failed rule application must restore board, conveyor, queue, and cached completion statistics.
{
    const rules = makeRules();
    rules.carriers[0].push(1);
    rules.queuedColorIds.push(2);
    rules.readyQueuedCount = 1;
    const before = JSON.stringify({ colors: rules.board.currentColors, locked: rules.board.locked, carriers: rules.carriers, queue: rules.entryColors });
    assert.throws(() => rules.executeSkillAtomically(() => {
        rules.board.currentColors[0][0] = 1;
        rules.board.setLocked(0, 0, true);
        rules.carriers[0].length = 0;
        rules.queuedColorIds.length = 0;
        rules.readyQueuedCount = 0;
        throw new Error('mid-rule');
    }), /mid-rule/);
    assert.equal(JSON.stringify({ colors: rules.board.currentColors, locked: rules.board.locked, carriers: rules.carriers, queue: rules.entryColors }), before);
    assert.equal(rules.readyEntryCount, 1);
    assert.equal(rules.board.isColorComplete(1), false);
    assert.equal(rules.board.isAllLocked(), false);
}

function skillHarness() {
    const rules = makeRules();
    let releases = 0;
    const scheduled = new Set();
    const runtime = {
        isGameEnd: false, _skillActive: false, _flyingTargets: new Set(),
        pauseTimerForProp: () => 'timer', resumeTimerForProp() { releases++; },
        armSkillUsageWatchdog: () => 1,
        scheduleOnce(fn) { scheduled.add(fn); }, unschedule(fn) { scheduled.delete(fn); },
        renderBoardCells() {}, renderBoardCell() {}, checkColorCompletion() {}, checkGuideStepComplete() {},
        refreshEndgameHints() {}, flushPendingColorCompleteEffects() {},
        getBoardFlyBeanSizeInLayer: () => 31,
        finishSkillUsage() { runtime._skillActive = false; controller.releaseActiveSkillPause(); },
    };
    const controller = new Controller(runtime);
    controller.rules = rules;
    controller.root = new Node(); controller.root.addComponent(UITransform);
    controller.renderConveyor = () => {};
    controller.renderEntranceQueue = () => {};
    controller.refreshStatus = () => {};
    controller.resolveSkillSourceVisual = () => ({ world: new Vec3(), size: 31 });
    controller.getBoardCellWorldPosition = () => new Vec3();
    controller.createFlyBean = () => { const node = new Node(); controller.activeFlyBeans.add(node); return node; };
    controller.destroyFlyBean = node => { cc.Tween.stopAllByTarget(node); controller.activeFlyBeans.delete(node); node.destroy(); };
    controller.playSkillTargetPulse = () => {};
    let executions = 0;
    const execute = () => {
        executions++;
        rules.board.currentColors[0][0] = 1;
        rules.board.setLocked(0, 0, true);
        return { moved: 1, colorId: 1, boardCells: [{ row: 0, col: 0 }], moves: [{ source: { kind: 'board', row: 0, col: 1, colorId: 1 }, target: { row: 0, col: 0 } }] };
    };
    return { controller, runtime, rules, execute, scheduled, executions: () => executions, releases: () => releases };
}
// Revive uses the real clear transaction, including queue, without capacity or prop rewards.
for (const fail of [false, true]) {
    animations.length = 0;
    const h = skillHarness();
    h.rules = new Rules(new BoardModel({ boardWidth: 6, boardHeight: 1, correctColorArr: [[1, 2, 1, 2, 1, 2]], initRandomColorArr: [[0, 0, 0, 0, 0, 0]] }), 6);
    h.controller.rules = h.rules;
    h.rules.carriers[0].push(1, 2, 1);
    h.rules.carriers[1].push(2, 1);
    h.rules.queuedColorIds.push(2);
    h.rules.readyQueuedCount = 1;
    h.runtime.isGameEnd = true;
    h.controller.inputLocked = true;
    h.controller.analyticsStats = { brushUses: 0, magnetUses: 0 };
    let resumed = 0, wins = 0;
    h.controller.commitFinish = () => { wins++; };
    h.runtime.continueAfterLose = (seconds, immediate) => {
        assert.equal(seconds, 0); assert.equal(immediate, true);
        assert.equal(h.rules.bufferCount, 0);
        h.runtime.isGameEnd = false;
        h.controller.tryCommitFinishAfterPchColorCompleteEffects();
        assert.equal(wins, 0, 'win must wait for return animation');
        resumed++;
    };
    h.runtime.pauseTimerForProp = () => { assert.equal(resumed, 1); return 'timer'; };
    if (fail) h.rules.clearBufferToBoard = () => { h.rules.carriers[0].length = 0; throw new Error('clear failed'); };
    assert.equal(h.controller.continueAfterBufferFull(), !fail);
    assert.equal(h.rules.bufferCapacity, 6);
    assert.equal(h.controller.analyticsStats.brushUses, 0);
    assert.equal(resumed, fail ? 0 : 1);
    if (fail) {
        assert.equal(h.rules.bufferCount, 6);
        assert.equal(h.runtime.isGameEnd, true);
        assert.equal(h.controller.inputLocked, true);
    } else {
        assert.equal(h.rules.bufferCount, 0);
        assert.equal(h.controller.continueAfterBufferFull(), false, 'duplicate callback cannot revive twice');
        assert.equal(h.controller.inputLocked, true);
        for (const callback of animations.flatMap(a => a.callbacks)) callback();
        assert.equal(h.controller.inputLocked, false);
        assert.equal(h.releases(), 1);
        assert.equal(wins, 1);
        assert.equal(h.rules.board.isAllLocked(), true);
    }
}
console.log('Full conveyor clear revive: atomic rollback, all beans, timer order, animation, duplicate and win passed');
