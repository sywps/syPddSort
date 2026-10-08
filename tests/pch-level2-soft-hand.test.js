const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const ast = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const controller = ast.statements.find(node => ts.isClassDeclaration(node));
const methodNames = ['showLevelTwoSoftHand', 'updateLevelTwoSoftHand', 'clearLevelTwoSoftHand',
    'handleBoardTap', 'onOpeningGuideTripleSpeed', 'stop'];
const methods = controller.members.filter(node => methodNames.includes(node.name?.getText(ast))
    || ts.isPropertyDeclaration(node) && node.name.getText(ast).startsWith('levelTwoSoftHand'))
    .map(node => node.getText(ast)).join('\n');
const visualMethods = methodNames.slice(0, 3).map(name =>
    controller.members.find(node => node.name?.getText(ast) === name).getText(ast)).join('\n');
assert.ok(!visualMethods.includes('inputLocked ='));
assert.ok(!visualMethods.includes('.on('));
assert.ok(!visualMethods.includes('addComponent(Button)'));

function load(file, dependencies = () => ({})) {
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText)(mod, mod.exports, dependencies);
    return mod.exports;
}
const config = load('assets/Scripts/Core/LevelConfig.ts');
const { BoardModel } = load('assets/Scripts/Core/BoardModel.ts', () => config);
const { PchConveyorRules } = load('assets/Scripts/Core/PchConveyorRules.ts', () => config);
const { selectOriginalBeans } = load('assets/Scripts/Core/OriginalBeanSelection.ts');
class UITransform {}
class Sprite { static SizeMode = { CUSTOM: 'custom' }; }
class Vec3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
const tween = () => ({ repeatForever() { return this; }, to() { return this; }, start() {} });
const compiled = ts.transpileModule(`class Harness { ${methods} }; module.exports = Harness;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'UITransform', 'Sprite', 'Vec3', 'Tween', 'tween', 'selectOriginalBeans', 'AudioMgr', compiled)(
    mod, UITransform, Sprite, Vec3, { stopAllByTarget() {} }, tween, selectOriginalBeans,
    { inst: { play() {}, releasePreparedGuideVoices() {} } });

function fixture(bucket = 'A') {
    const h = new mod.exports();
    const made = [];
    const parent = { children: [], getComponent: () => ({ convertToNodeSpaceAR: p => p }) };
    const handSource = { getComponent: type => type === Sprite ? { spriteFrame: 'existing-art' }
        : { width: 200, height: 300, anchorPoint: { x: 0.5, y: 0.5 } } };
    h.runtime = {
        _activeGameplayEntryMode: 'main', getActiveLogicalLevelId: () => 2,
        getGameplayFixedRoot: () => parent,
        requireCanvasUiRoot: () => ({ getChildByName: () => ({ getChildByName: () => handSource }) }),
        cellNodes: [Array.from({ length: 6 }, () => ({ activeInHierarchy: true }))],
        renderBoardCells() {},
    };
    const board = new BoardModel({ boardWidth: 6, boardHeight: 1,
        correctColorArr: [[1, 1, 1, 1, 1, 1]], initRandomColorArr: [[9, 3, 4, 5, 6, 8]] });
    h.rules = new PchConveyorRules(board, 60, 18);
    h.getBeanSelectionBucket = () => bucket;
    h.getBoardCellWorldPosition = (row, col) => ({ x: col, y: row });
    h.getEntranceCarrierIndex = () => 0;
    h.isLevelThreeMeasurementActive = () => false;
    h.trackPchFunnelEvent = () => {};
    h.trackOpeningGuideEvent = () => {};
    h.reportOpeningGuideTutorialFinish = () => {};
    h.refreshSpeedButtonState = () => {};
    h.setManualSpeedMultiplier = value => { h.speed = value; };
    h.dismissOpeningGuide = () => { h.clearLevelTwoSoftHand(); h.openingGuide = null; h.inputLocked = false; };
    h.renderEntranceQueue = () => {};
    h.refreshStatus = () => {};
    h.animateBeanIntoConveyor = () => {};
    h.maybeShowCapacityBlockedToast = () => {};
    h.analyticsStats = null; // The new behavior must not require analytics collection.
    h.makeNode = (name, owner, width, height) => {
        const transform = { width, height, setAnchorPoint(point) { this.anchorPoint = point; } };
        const node = { name, parent: owner, children: [], isValid: true, active: true,
            getComponent: () => transform,
            addComponent() { this.sprite = {}; return this.sprite; },
            setPosition(position) { this.position = position; }, setScale() {},
            destroy() { this.isValid = false; },
        };
        made.push(node); owner.children.push(node); return node;
    };
    function finishGuide() {
        h.inputLocked = true; h.openingGuide = { isValid: true };
        h.onOpeningGuideTripleSpeed({ propagationStopped: false });
        assert.equal(h.speed, 3);
        assert.equal(h.inputLocked, false);
    }
    function tick(seconds) {
        const frames = Math.round(seconds * 20);
        for (let frame = 0; frame < frames; frame++) h.updateLevelTwoSoftHand(0.05);
    }
    return { h, made, finishGuide, tick };
}

for (const bucket of ['A', 'B']) {
    const { h, made, finishGuide, tick } = fixture(bucket);
    tick(10);
    assert.equal(h.levelTwoSoftHand, null, 'no reminder before the strong guide completes');
    finishGuide();
    assert.equal(h.levelTwoSoftHandTarget.col, 1, 'prefer yellow over green');
    const art = made.find(node => node.name === 'LevelTwoSoftHand');
    assert.equal(art.getComponent().width, 110);
    assert.equal(art.getComponent().height, 165);
    assert.equal(art.sprite.sizeMode, Sprite.SizeMode.CUSTOM);
    assert.equal(art.sprite.spriteFrame, 'existing-art');
    tick(10);
    assert.equal(made.filter(node => node.name === 'LevelTwoSoftHand').length, 1, 'initial hint is not an extra reminder');
    assert.equal(h.handleBoardTap(0, 0), 'stored');
    assert.equal(h.levelTwoSoftHand, null, 'successful action clears the hand immediately');
    tick(4.9);
    assert.equal(h.levelTwoSoftHand, null, 'not before five actionable seconds');
    assert.equal(h.handleBoardTap(0, 0), 'invalid');
    tick(0.15);
    assert.ok(h.levelTwoSoftHand?.isValid, 'an invalid tap does not reset the successful-action idle timer');
    assert.equal(h.levelTwoSoftHandTarget.col, 1);
    assert.equal(h.handleBoardTap(0, 1), 'stored');
    tick(20);
    assert.equal(h.levelTwoSoftHand, null, 'only one additional reminder per round');
    assert.equal(made.filter(node => node.name === 'LevelTwoSoftHand').length, 2);
}

const pausedStates = [
    ['settingsPaused', true], ['settlementPaused', true], ['skillMovementPaused', true],
    ['externalInputBlocked', true], ['inputLocked', true], ['openingGuide', { isValid: true }],
    ['_gameForeground', false, true], ['_adShowing', true, true], ['_rewardedGrantTransaction', {}, true],
    ['_modalFocusRefs', 1, true], ['_skillActive', true, true], ['gestureMode', 'panning', true],
    ['gestureMode', 'pinching', true], ['suppressTap', true, true],
];
for (const [key, value, runtime] of pausedStates) {
    const { h, finishGuide, tick } = fixture();
    finishGuide();
    const owner = runtime ? h.runtime : h, original = owner[key];
    owner[key] = value; tick(10);
    assert.equal(h.levelTwoSoftHand.active, false, `${key}: hide the visible hint`);
    owner[key] = original;
    tick(0.05);
    assert.equal(h.levelTwoSoftHand.active, true, `${key}: restore the visible hint`);
    h.handleBoardTap(0, 0); tick(2);
    owner[key] = value; tick(10);
    assert.equal(h.levelTwoSoftHand, null, `${key}: pause the reminder timer`);
    owner[key] = original; tick(2.9);
    assert.equal(h.levelTwoSoftHand, null, `${key}: excluded time must not cause an immediate hint`);
    tick(0.15);
    assert.ok(h.levelTwoSoftHand?.isValid, `${key}: resume the remaining actionable time`);
}

for (const actions of [1, 2, 3, 4]) {
    const { h, finishGuide, tick } = fixture();
    finishGuide();
    for (let col = 0; col < actions; col++) {
        assert.equal(h.handleBoardTap(0, col), 'stored');
        tick(4.9);
        assert.equal(h.levelTwoSoftHand, null, 'each successful action starts a new idle interval');
    }
    tick(0.15);
    assert.equal(!!h.levelTwoSoftHand, actions <= 3, 'only pauses after actions 1 through 3 are eligible');
}

{
    const { h, finishGuide, tick } = fixture();
    finishGuide();
    h.rules.board.setLocked(0, 1, true); tick(0.05);
    assert.equal(h.levelTwoSoftHandTarget.col, 0, 'retarget after yellow becomes locked');
    h.rules.board.setLocked(0, 1, false);
    h.handleBoardTap(0, 0); tick(2);
    h.rules.restoreTransportState({ carriers: h.rules.carriers.map(() => []), queued: Array(60).fill(9), ready: 0 });
    const boardBefore = JSON.stringify(h.rules.board.currentColors);
    tick(10);
    assert.equal(h.levelTwoSoftHand, null, 'queued beans also fill capacity and pause the reminder');
    assert.equal(h.handleBoardTap(0, 1), 'capacity_blocked');
    assert.equal(JSON.stringify(h.rules.board.currentColors), boardBefore);
    h.rules.restoreTransportState({ carriers: h.rules.carriers.map(() => []), queued: Array(59).fill(9), ready: 0 });
    tick(3.05);
    assert.ok(h.levelTwoSoftHand?.isValid, 'one free place is enough for a valid partial action');
    assert.equal(JSON.stringify(h.rules.board.currentColors), boardBefore, 'finding a hint must never store beans');
    h.rules.board.currentColors[0][2] = 3;
    assert.equal(h.handleBoardTap(0, 1), 'partial');
    assert.equal(h.levelTwoSoftHand, null, 'partial storage is a successful action and clears the hint');
}

{
    const { h, finishGuide, tick } = fixture();
    finishGuide(); h.handleBoardTap(0, 0);
    h.runtime.cellNodes[0].forEach(node => { node.activeInHierarchy = false; });
    tick(10);
    assert.equal(h.levelTwoSoftHand, null, 'no visible selectable bean means no reminder');
    h.runtime.cellNodes[0][1].activeInHierarchy = true;
    const select = h.rules.selectBoard.bind(h.rules);
    h.rules.selectBoard = () => null; tick(10);
    assert.equal(h.levelTwoSoftHand, null, 'a rendered bean rejected by the selection rule is not actionable');
    h.rules.selectBoard = select;
    h.updateLevelTwoSoftHand(30);
    assert.equal(h.levelTwoSoftHand, null, 'a suspended/long frame cannot count as foreground idle time');
    tick(5.05);
    assert.ok(h.levelTwoSoftHand?.isValid);
    h.runtime.isGameEnd = true; tick(0.05);
    assert.equal(h.levelTwoSoftHand, null);
    assert.equal(h.levelTwoSoftHandReminderArmed, false);
}

for (const mode of ['theme', 'pvp', 'coop', 'level3']) {
    const { h, finishGuide, tick } = fixture();
    if (mode === 'theme') h.runtime._activeGameplayEntryMode = 'theme';
    if (mode === 'pvp') h.runtime.isRankedPvpMode = () => true;
    if (mode === 'coop') h.runtime.isCoopMode = () => true;
    if (mode === 'level3') h.runtime.getActiveLogicalLevelId = () => 3;
    finishGuide(); h.handleBoardTap(0, 0); tick(10);
    assert.equal(h.levelTwoSoftHand, null, `${mode}: do not introduce the level 2 hint`);
}

{
    const { h, finishGuide, tick } = fixture();
    finishGuide(); h.handleBoardTap(0, 0); tick(5.05);
    const oldRules = h.rules, oldHand = h.levelTwoSoftHand;
    for (const name of ['flushCsdObservations', 'reportLevelThreeLeave', 'resetCapacityAdGesture',
        'cancelOpeningPatternShuffle', 'releaseActiveSkillPause', 'resetTableEntryDoorAnimation',
        'resetExitArrowAnimation', 'resetCapacityWarning', 'clearPchColorCompleteSequence', 'recycleAllSphereFlyEffects']) h[name] = () => {};
    for (const name of ['activeFlyBeans', 'activePulseNodes', 'activeReturnBeans', 'activeSphereFlyEffects']) h[name] = new Set();
    for (const name of ['pendingReturnCompletions', 'lastEntranceAudioVisitByCarrier', 'sphereFlyEffectPool', 'sphereFlyStarPool']) h[name] = new Map();
    h.clearOpeningGuideNodes = () => h.clearLevelTwoSoftHand();
    h.stop();
    assert.equal(oldHand.isValid, false);
    assert.equal(h.levelTwoSoftHandReminderArmed, false);
    assert.equal(h.levelTwoSoftHandReminderUsed, false);
    assert.equal(h.levelTwoSoftHandActionCount, 0);
    assert.equal(h.levelTwoSoftHandIdleSeconds, 0);
    h.rules = oldRules; finishGuide(); h.handleBoardTap(0, 1); tick(5.05);
    assert.ok(h.levelTwoSoftHand?.isValid, 'the next round has its own one-time reminder');
}
assert.ok(/this\.updateLevelTwoSoftHand\(deltaTime\)/.test(source), 'the gameplay frame must supply elapsed time');
console.log('pch-level2-soft-hand.test.js passed: real A/B rules, action window, pauses, capacity, once per round, analytics off, nonblocking artwork');
