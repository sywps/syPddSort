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
class Color { static WHITE = new Color(); }
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
const { GameplayResultPanelController: ResultController } = compile(source('GameplayResultPanelController.ts'));
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
for (const failure of ['create', 'callback', 'missing-callback', 'normal']) {
    animations.length = 0;
    const h = skillHarness();
    if (failure === 'create') h.controller.resolveSkillSourceVisual = () => { throw new Error('missing visual'); };
    if (failure === 'callback') h.controller.playSkillTargetPulse = () => { throw new Error('effect'); };
    assert.equal(h.controller.runConveyorSkill('magnet', false, h.execute), true);
    const late = animations.flatMap(a => a.callbacks);
    if (failure === 'missing-callback') assert.equal(h.controller.recoverActiveSkillVisuals(), true);
    else for (const callback of late) callback();
    for (const callback of late) callback();
    assert.equal(h.executions(), 1, 'visual recovery must not execute or charge the skill again');
    assert.equal(h.rules.board.currentColors[0][0], 1);
    assert.equal(h.controller.inputLocked, false);
    assert.equal(h.runtime._skillActive, false);
    assert.equal(h.controller.isSkillBusy(), false);
    assert.equal(h.releases(), 1);
    assert.equal(h.runtime._flyingTargets.size, 0);
}
{
    const h = skillHarness();
    const before = JSON.stringify(h.rules.board.currentColors);
    const applied = h.controller.runConveyorSkill('brush', false, () => { h.execute(); throw new Error('rule'); });
    assert.equal(applied, false, 'caller must receive false and refund its consumed prop');
    assert.equal(JSON.stringify(h.rules.board.currentColors), before);
    assert.equal(h.controller.inputLocked, false);
    assert.equal(h.runtime._skillActive, false);
}

// A missing decoration must not defer the guide, and failed construction must release the root gate.
{
    const Guide = methods('PchConveyorGameplayController.ts', ['showOpeningFeatureGuide', 'dismissOpeningGuide', 'clearOpeningGuideNodes']);
    for (const level of [1, 2, 3]) {
        const guide = new Guide();
        guide.runtime = { _activeGameplayEntryMode: 'main', getActiveLogicalLevelId: () => level, getSF: () => null };
        guide.speedButton = guide.adButton = new Node();
        let shown = 0;
        guide.showLevelOneBoardGuide = guide.showOpeningTargetGuide = () => { shown++; };
        guide.showOpeningFeatureGuide(new Node());
        assert.equal(shown, 1);
        guide.showLevelOneBoardGuide = guide.showOpeningTargetGuide = () => {
            guide.inputLocked = true;
            guide.openingGuide = new Node();
            throw new Error('layout');
        };
        guide.showOpeningFeatureGuide(new Node());
        assert.equal(guide.inputLocked, false);
        assert.equal(guide.openingGuide, null);
    }
}

// The actual text-only guide still has a visible prompt and a working target without the hand sprite.
{
    const h = skillHarness();
    const parent = new Node(); parent.addComponent(UITransform).anchorPoint = { x: 0.5, y: 0.5 };
    h.controller.makeNode = (name, parentNode, width, height) => {
        const node = new Node(name); node.addComponent(UITransform).setContentSize(width, height); parentNode.addChild(node); return node;
    };
    const copies = [];
    h.controller.makeLabel = (_parent, copy) => { copies.push(copy); return new Label(); };
    h.controller.trackOpeningGuideEvent = h.controller.reportOpeningGuideTutorialStart = () => {};
    h.controller.createOpeningGuideFocusMask = () => {};
    h.controller.createOpeningGuideCapacityFocusMask = () => {};
    h.runtime.getSF = () => null;
    for (const name of ['PchLevelOneGuideStep0', 'PchLevelTwoSpeedGuide', 'PchLevelThreeCapacityGuide']) {
        let taps = 0;
        h.controller.showOpeningTargetGuideAt(parent, new Vec3(), 60, 60, name, '操作提示', () => { taps++; }, true);
        assert.ok(h.controller.openingGuide.getChildByName('OpeningGuidePrompt').getComponent(Graphics));
        h.controller.openingGuideTarget.events.get(Node.EventType.TOUCH_END)();
        assert.equal(taps, 1);
        h.controller.dismissOpeningGuide();
        assert.equal(h.controller.inputLocked, false);
    }
    assert.deepEqual(copies, ['操作提示', '操作提示', '操作提示']);
}

// Return and color effects may fail or never call back; the rule result still settles exactly once.
{
    const h = skillHarness();
    let finished = 0;
    h.runtime.isGameEnd = true; // isolate presentation bookkeeping from belt movement
    h.controller.updateSphereFlyEffects = h.controller.updateExitArrowAnimation = () => {};
    h.controller.finishReturnAnimation = () => { h.controller.activeReturnAnimations--; finished++; };
    h.controller.createFlyBean = () => { throw new Error('return visual'); };
    h.controller.animateBeanReturn(1, new Vec3(), 31, { row: 0, col: 0 }, 0, {});
    assert.equal(finished, 1);
    assert.equal(h.controller.activeReturnAnimations, 0);
    h.controller.createFlyBean = () => new Node();
    h.controller.attachSphereFlyEffect = () => {};
    h.controller.animateBeanReturn(1, new Vec3(), 31, { row: 0, col: 0 }, 0, {});
    h.controller.settingsPaused = true;
    h.controller.update(10);
    assert.equal(finished, 1, 'settings pause must not consume presentation timeout');
    h.controller.settingsPaused = false;
    h.controller.update(2);
    assert.equal(finished, 2);
    let colorDone;
    h.runtime.playColorCompleteEffect = (_color, _sound, done) => { colorDone = done; };
    let commits = 0;
    h.controller.tryCommitFinishAfterPchColorCompleteEffects = () => { commits++; };
    h.controller.playPchColorCompleteEffect({ colorId: 1 });
    h.controller.update(4);
    colorDone(); colorDone();
    assert.equal(h.controller.activePchColorCompleteEffects, 0);
    assert.equal(commits, 1);
}

// Real loader: retry once, notify every waiter once, and reject stale asynchronous completions.
for (const outcome of ['retry-success', 'failure', 'timeout']) {
    timers.clear();
    const runtime = { isValid: true, _gameplayResultPanelPrefabCache: new Map() };
    const controller = new ResultController(runtime);
    const loads = [];
    controller.withBootstrapBundle = done => done({});
    controller.loadPrefabsFromBundle = (_bundle, _name, seq, done, fail) => loads.push({ seq, done, fail });
    let succeeded = 0, failed = 0;
    controller.ensurePrefabsReady(() => { succeeded++; }, () => { failed++; });
    controller.ensurePrefabsReady(() => { succeeded++; }, () => { failed++; });
    if (outcome === 'timeout') fireTimers();
    else loads[0].fail(new Error('first load'));
    assert.equal(loads.length, 2);
    loads[0].done();
    assert.equal(succeeded, 0, 'late first attempt must not complete the retry');
    if (outcome === 'retry-success') loads[1].done();
    else if (outcome === 'failure') loads[1].fail(new Error('second load'));
    else fireTimers();
    loads[1].done(); loads[1].fail(new Error('late error'));
    assert.equal(succeeded, outcome === 'retry-success' ? 2 : 0);
    assert.equal(failed, outcome === 'retry-success' ? 0 : 2);
    assert.equal(runtime._gameplayResultPanelPrefabLoadCallbacks, null);
    assert.equal(controller.isCurrentPrefabLoad(loads[1].seq), false);
    assert.equal(timers.size, 0);
}

// Basic result UI uses real settlement actions, rewards, and transition gates without failed prefabs.
const Settlement = methods('GameCtrlModules/SettlementHudModule.ts', [
    'handleWinSettlementPrimaryAction', 'beginSettlementNextTransition', 'setWinPrimaryButtonInteractable',
    'refreshWinAdBonusUI', 'updateWinRewardLabel', 'claimWinAdBonusReward',
    'syncSettlementCompletionSummary', 'syncSettlementProgressWidget', 'showLosePanel',
    'requestWinSettlementReveal', 'failWinSettlementReveal',
], { WIN_BONUS_REWARD_GATE_PAGE: 'win_bonus_reward' });
function resultHarness() {
    const rootNode = new Node('PopupRoot'); rootNode.addComponent(UITransform);
    const runtime = new Settlement();
    let next = 0, grants = 0, gold = 0, home = 0, restarted = 0;
    Object.assign(runtime, {
        isValid: true, isGameEnd: true, _gameplayInitSeq: 1, _settlementRevealToken: 1,
        _pendingWinGoldReward: 10, _pendingWinAdBonusReward: 20,
        _gameplayResultPanelPrefabCache: new Map(),
        requireCanvasUiRoot: () => rootNode,
        bindPanelButton: (node, handler) => node.on('click', handler),
        getBoardCompletionStats: () => ({ completePercent: 63 }),
        shouldChainTutorialLevelsOnWin: () => false,
        shouldUseMainlineWinSettlementUI: () => true,
        goNextLevel() { next++; }, addGold(value) { gold += value; },
        runRewardedGrant(_page, grant) { grants++; grant(); },
        showMainMenu() { home++; }, restart() { restarted++; },
        getActiveLogicalLevelId: () => 5,
        updateLoseProgressLabel() { throw new Error('unrelated partial prefab must not be inspected'); },
    });
    const controller = new ResultController(runtime);
    controller.canUseReviveShare = () => false;
    runtime.showBasicSettlement = kind => controller.showBasicSettlement(kind);
    const click = (panel, name) => {
        const button = panel.getChildByName('Box').getChildByName(name);
        assert.ok(button?.activeInHierarchy, `${name} must be accessible`);
        button.events.get('click')();
    };
    return { runtime, controller, click, counts: () => ({ next, grants, gold, home, restarted }) };
}
{
    const h = resultHarness();
    const panel = h.controller.showBasicSettlement('win');
    h.click(panel, 'AdBonusBtn'); h.click(panel, 'AdBonusBtn');
    assert.deepEqual(h.counts(), { next: 0, grants: 1, gold: 20, home: 0, restarted: 0 });
    const restored = h.controller.showBasicSettlement('win');
    assert.equal(panel.isValid, false);
    assert.equal(restored.getChildByName('Box').getChildByName('RewardGoldLbl').getComponent(Label).string, '+30 金币');
    h.click(restored, 'AdBonusBtn');
    assert.equal(h.counts().gold, 20, 'rebuilding controls must never regrant the base or bonus reward');
    h.click(restored, 'PrimaryBtn'); h.click(restored, 'PrimaryBtn');
    assert.equal(h.counts().next, 1);
    h.runtime._gameplayInitSeq++;
    restored.getChildByName('Box').getChildByName('PrimaryBtn').events.get('click')();
    assert.equal(h.counts().next, 1, 'old panel callbacks cannot enter another level');
}
for (const kind of ['timeout', 'buffer-full']) {
    const h = resultHarness();
    const calls = [];
    h.controller.runLevelReviveAction = panel => calls.push(['timeout', panel]);
    h.controller.runBufferFullReviveAction = panel => calls.push(['buffer-full', panel]);
    h.controller.runReviveShareAction = (reason, panel) => calls.push([`share-${reason}`, panel]);
    h.controller.closeReviveFailureSession = (_kind, panel) => { panel.active = false; h.runtime.showLosePanel(); };
    const panel = h.controller.showBasicSettlement(kind);
    assert.equal(panel.getChildByName('Box').getChildByName('Label').getChildByName('Label').getComponent(Label).string, '63%');
    h.click(panel, 'ContinueBtn');
    assert.deepEqual(calls[0], [kind, panel]);
    h.controller.canUseReviveShare = () => true;
    h.controller.refreshReviveShareButtons();
    h.click(panel, 'ShareBtn');
    assert.deepEqual(calls[1], [`share-${kind}`, panel]);
    h.click(panel, 'GiveUpBtn');
    assert.ok(h.runtime.panelLose.activeInHierarchy);
    h.click(h.runtime.panelLose, 'ReplayBtn');
    assert.equal(h.counts().restarted, 1);
    h.runtime.showLosePanel();
    cc.AnalyticsMgr.inst.finalizePendingFailedLevel = () => {};
    h.click(h.runtime.panelLose, 'HomeBtn');
    assert.equal(h.counts().home, 1);
}

// A result callback from a preceding game cannot reveal a stale panel.
{
    const h = resultHarness();
    let ready, fail;
    h.runtime.revealWinSettlementPanel = () => false;
    h.runtime._ensureGameplayResultPanelPrefabsReady = (onDone, onError) => { ready = onDone; fail = onError; };
    h.runtime.requestWinSettlementReveal(5, 1);
    h.runtime._settlementRevealToken = 2;
    fail(new Error('old load')); ready();
    assert.equal(h.runtime.panelWin, undefined);
    h.runtime.requestWinSettlementReveal(5, 2);
    fail(new Error('current load'));
    assert.ok(h.runtime.panelWin.activeInHierarchy);
    assert.equal(h.runtime._settlementRevealState, 'shown');
    assert.equal(h.counts().gold, 0);
}

// The real watchdog must delegate to the PCH cleanup and leave settings pause alone.
{
    timers.clear();
    const Watchdog = methods('GameCtrlModules/SettlementHudModule.ts', ['armSkillUsageWatchdog', 'clearSkillUsageWatchdog'], {
        SKILL_USAGE_TIMEOUT_MS: 10000,
    });
    const h = skillHarness();
    for (const name of ['armSkillUsageWatchdog', 'clearSkillUsageWatchdog']) h.runtime[name] = Watchdog.prototype[name];
    h.runtime._pchConveyorGameplayController = h.controller;
    assert.equal(h.controller.runConveyorSkill('brush', false, h.execute), true);
    h.controller.settingsPaused = true;
    fireTimers();
    assert.equal(h.controller.inputLocked, true);
    assert.equal(h.runtime._skillActive, true);
    h.controller.settingsPaused = false;
    fireTimers();
    assert.equal(h.controller.inputLocked, false);
    assert.equal(h.runtime._skillActive, false);
    assert.equal(h.releases(), 1);
    assert.equal(timers.size, 0);
}

// Missing carrier art and unrelated UI errors must not strand a committed final return.
{
    const h = skillHarness();
    h.rules.board.currentColors[0] = [0, 0];
    h.rules.carriers[0].push(1, 2);
    h.controller.firstReturnEventSent = true;
    h.controller.renderConveyorCarrier = () => { throw new Error('carrier render'); };
    h.runtime.syncSkillButtonRuntimeStates = () => { throw new Error('button visual'); };
    h.runtime.markColorCompleteIfNeeded = () => true;
    h.runtime.playColorCompleteEffect = () => { throw new Error('color visual'); };
    let committed = 0;
    h.controller.commitFinish = () => { committed++; };
    assert.equal(h.controller.handleCarrierAtExit(0), true);
    assert.equal(h.rules.board.isAllLocked(), true);
    assert.equal(h.controller.activeReturnAnimations, 0);
    assert.equal(committed, 0, 'all registered returns must settle before finish');
    for (const callback of [...h.scheduled]) callback();
    assert.equal(committed, 1);
    assert.equal(h.controller.pendingPchReturnColorSettles.size, 0);
    assert.equal(h.controller.activePchColorCompleteEffects, 0);
}

// Win presentation deadlines cannot delay normal reveal or replay rewards after a late callback.
{
    const Win = methods('GameCtrlModules/SettlementHudModule.ts', ['gameWin'], {
        ECONOMY_NUMERIC_TABLE: { adReward: { winTotalMultiplier: 3 } },
        PATTERN_COMPLETE_SETTLEMENT_HOLD: 0.25,
        PATTERN_COMPLETE_BOARD_SHRINK_DELAY: 0,
        PATTERN_COMPLETE_BOARD_SHRINK_DURATION: 0.3,
        PATTERN_COMPLETE_BOARD_SHRINK_SCALE: 0.8,
    });
    cc.AnalyticsMgr.inst.getSmartHintShownCount = () => 0;
    cc.AnalyticsMgr.inst.markLevelPassed = () => {};
    cc.SySDKMgr.inst.reportLevelPass = () => {};
    for (const mode of ['normal', 'missing-callback', 'throw']) {
        const h = resultHarness();
        const scheduled = new Map();
        let colorDone, sweepDone, rewards = 0, reveals = 0;
        Object.assign(h.runtime, {
            isGameEnd: false,
            clearIdleHint() {}, clearEndgameHints() {}, trackFirstLevelFunnel() {},
            getAnalyticsPage: () => 'game', saveLevelProgress() {}, calcWinGoldReward: () => 10,
            ensureGameplayResultPanelsCreated() { throw new Error('broken prefab'); },
            scheduleOnce: (fn, seconds) => scheduled.set(fn, seconds), unschedule: fn => scheduled.delete(fn),
            addGold: amount => { rewards += amount; },
            requestWinSettlementReveal: () => { reveals++; },
            flushPendingColorCompleteEffectsSequentially: done => {
                colorDone = done;
                if (mode === 'throw') throw new Error('color');
                if (mode === 'normal') done();
            },
            playPatternCompleteMatchFx: done => {
                sweepDone = done;
                if (mode === 'throw') throw new Error('sweep');
                if (mode === 'normal') done();
            },
        });
        Win.prototype.gameWin.call(h.runtime);
        Win.prototype.gameWin.call(h.runtime);
        assert.equal(rewards, 10);
        const fast = [...scheduled].find(([, seconds]) => seconds === 0.25);
        const deadline = [...scheduled].find(([, seconds]) => seconds >= 5);
        assert.ok(deadline, 'presentation must always have a recovery deadline');
        if (mode !== 'missing-callback') {
            assert.ok(fast);
            assert.notEqual(fast[0], deadline[0], 'Cocos scheduler needs distinct normal and timeout callbacks');
            fast[0]();
        } else deadline[0]();
        assert.equal(reveals, 1);
        assert.equal(scheduled.size, 0);
        colorDone(); sweepDone?.(); deadline[0]();
        assert.equal(reveals, 1);
        assert.equal(scheduled.size, 0, 'late effects cannot restart a settled presentation');
        assert.equal(rewards, 10);
    }
}

// Both authored and basic failure panels must remain usable until a restart actually builds the next round.
{
    const Restart = methods('GameCtrlModules/SettlementHudModule.ts', ['restart', 'doRestart']);
    for (const panelKind of ['authored', 'basic']) {
        for (const outcome of ['cancelled', 'failed', 'granted', 'has-vigor']) {
            const h = resultHarness();
            let vigor = outcome === 'has-vigor' ? 2 : 0;
            let initCount = 0, modalCount = 0, onResult, startAfterPrewarm;
            Object.assign(h.runtime, {
                levelData: { levelId: 5 }, _activeGameplayEntryMode: 'main',
                restart: Restart.prototype.restart, doRestart: Restart.prototype.doRestart,
                getRuntimeSceneName: () => 'Game',
                costVigorForLevel: () => vigor > 0 ? (--vigor, true) : false,
                showNoLivesAdModal: options => { modalCount++; onResult = options.onResult; },
                unschedule() {}, unscheduleAllCallbacks() {}, stopPulseTweens() {}, clearDragNodes() {},
                startGameplayWithBackgroundSkinReady: (_data, _level, init) => { startAfterPrewarm = init; },
                initGame() { initCount++; this.isGameEnd = false; panel.destroy(); },
            });
            let panel;
            if (panelKind === 'authored') {
                panel = new Node('LoseSettlementOverlay');
                const box = new Node('Box'); panel.addChild(box);
                for (const name of ['复活窗组件3', 'HomeBtn', '绿色按键底框-001']) box.addChild(new Node(name));
                h.controller.instantiateGameplayOverlay = () => panel;
                h.controller.syncResultProgressWidget = () => {};
                h.runtime.requirePanelChild = (parent, name) => {
                    const child = parent.getChildByName(name); assert.ok(child, name); return child;
                };
                h.controller.createLoseSettlementPanel();
            } else panel = h.controller.showBasicSettlement('lose');
            const buttonName = panelKind === 'authored' ? '绿色按键底框-001' : 'ReplayBtn';
            h.click(panel, buttonName);
            assert.equal(panel.activeInHierarchy, true, `${panelKind}: retain result controls until initialization`);
            const vigorAfterFirstClick = vigor;
            h.click(panel, buttonName);
            assert.equal(vigor, vigorAfterFirstClick, 'double tap must not charge vigor again');
            assert.equal(modalCount, outcome === 'has-vigor' ? 0 : 1);
            if (outcome !== 'has-vigor') {
                assert.equal(initCount, 0);
                if (outcome === 'granted') vigor = 1;
                onResult({ status: outcome });
            }
            if (outcome === 'cancelled' || outcome === 'failed') {
                assert.equal(panel.activeInHierarchy, true, `${outcome}: player can still revive, retry, or return home`);
                assert.equal(startAfterPrewarm, undefined);
                h.click(panel, buttonName);
                assert.equal(modalCount, 2, 'cancellation/failure must allow another explicit restart attempt');
                h.runtime._gameplayInitSeq++;
                vigor = 1;
                onResult({ status: 'granted' });
                assert.equal(vigor, 1, 'old round result cannot charge the new round');
                assert.equal(startAfterPrewarm, undefined);
            } else {
                assert.equal(panel.activeInHierarchy, true, 'asynchronous prewarm cannot leave a bare ended board');
                startAfterPrewarm();
                assert.equal(initCount, 1);
                assert.equal(panel.isValid, false, 'new game UI owns old result panel disposal');
            }
        }
    }
}

console.log('PCH operation recovery: skill, guide, return, loader, result actions, watchdog, win flow, and restart passed');
