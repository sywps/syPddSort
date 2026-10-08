const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8');
const file = ts.createSourceFile('guide.ts', source, ts.ScriptTarget.Latest, true);
const controller = file.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'PchConveyorGameplayController');
const names = ['start', 'stop', 'clearOpeningGuideNodes', 'dismissOpeningGuide', 'onOpeningGuideLevelOneTap'];
const methods = names.map(name => controller.members.find(node => node.name?.getText(file) === name).getText(file)).join('\n');
const code = ts.transpileModule(`export class Harness { ${methods} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;

class Node {
    static EventType = {};
    isValid = true;
    children = new Map();
    on() {} off() {}
    getChildByName(name) { return this.children.get(name) || null; }
    getComponent() { return null; }
}

function harness({ mode = 'main', level = 1, content = 'A', ranked = false, guide } = {}) {
    const events = [];
    const audio = {
        prepareGuideVoices() { events.push('prepare'); return new Promise(() => {}); },
        releasePreparedGuideVoices() { events.push('release'); },
        stopGuideVoice() { events.push('stop-current'); },
    };
    const module = { exports: {} };
    new Function('module', 'exports', 'AppRoot', 'AudioMgr', 'getFirstLevelContent', 'PchConveyorRules',
        'AnalyticsMgr', 'Node', 'Label', 'PCH_SCENE_CARRIER_COUNT', 'PCH_CONVEYOR_LAYOUT',
        'PCH_LEVEL_THREE_MAX_CAPACITY', 'sp', 'Tween', code)(
        module, module.exports, { tryGet: () => null }, { inst: audio }, () => content,
        class { bufferCapacity = 36; }, { inst: { getCurrentRoundId: () => '' } }, Node, class {},
        8, {}, 72, { Skeleton: class {} }, { stopAllByTarget() {} },
    );
    const h = new module.exports.Harness();
    for (const name of ['activeReturnBeans', 'activeFlyBeans', 'activeSphereFlyEffects', 'activePulseNodes']) h[name] = new Set();
    for (const name of ['pendingReturnCompletions', 'lastEntranceAudioVisitByCarrier']) h[name] = new Map();
    for (const name of ['sphereFlyEffectPool', 'sphereFlyStarPool']) h[name] = { clear() {} };
    for (const name of [
        'flushCsdObservations', 'reportLevelThreeLeave', 'resetCapacityAdGesture', 'cancelOpeningPatternShuffle',
        'releaseActiveSkillPause', 'resetTableEntryDoorAnimation', 'resetExitArrowAnimation', 'resetCapacityWarning',
        'clearPchColorCompleteSequence', 'recycleAllSphereFlyEffects', 'clearLevelTwoSoftHand', 'clearCapacityHint',
        'resetAnalyticsStats', 'bindWarningOverlay', 'clearConveyorLayoutRuntime', 'prepareBeltPath',
        'startExitArrowAnimation', 'renderGame', 'bindSpeedButton', 'trackOpeningGuideEvent', 'reportOpeningGuideTutorialFinish',
    ]) h[name] = () => {};
    const fixedRoot = new Node(), topBar = new Node();
    topBar.children.set('Settings', new Node()); topBar.children.set('GameplayHelpButton', new Node());
    h.requireConveyorNode = () => new Node();
    h.bindConveyorLayout = () => ({
        node: new Node(), adButton: new Node(), countLabel: { color: { clone() {} }, outlineColor: { clone() {} } },
    });
    h.isLevelThreeFreeCapacity = () => false;
    h.prepareOpeningPatternShuffle = () => events.push('opening-animation-prepared');
    h.showLevelOneBoardGuideStep = () => events.push(`show-step-${h.openingGuideLevelOneStep}`);
    h.handleBoardTap = () => 'stored';
    h.openingGuideRingNodes = []; h.openingGuideRingLoadVersion = 0;
    h.runtime = {
        boardModel: {}, levelData: { levelId: level, tutorialGuide: guide }, _activeGameplayEntryMode: mode,
        getActiveLogicalLevelId: () => level, isRankedPvpMode: () => ranked,
        getGameplayFixedRoot: () => fixedRoot, getGameplayFixedGroup: () => topBar,
        syncSkillButtonRuntimeStates: () => events.push('input-synced'),
    };
    for (const name of ['renderBoard', 'renderBoardCells', 'getBeanSpriteFrame', 'requireRenderReadySpriteFrame',
        'requireSphereFlyStarSpriteFrame', 'requireSphereFlyTrailSpriteFrame', 'requireWarningMaskSpriteFrame',
        'renderBoardCell', 'getBoardCellWorldPosition', 'acquireFlyBeanNode', 'recycleFlyBeanNode',
        'markColorCompleteIfNeeded', 'playColorCompleteEffect', 'gameLose']) h.runtime[name] = () => {};
    return { h, events };
}

// Run the real start method, including its initial stop: only the default A first-level guide prepares speech.
for (const [options, shouldPrepare] of [
    [{}, true], [{ content: 'B' }, false], [{ content: 'C' }, false], [{ level: 2 }, false],
    [{ mode: 'theme' }, false], [{ mode: 'external' }, false], [{ ranked: true }, false],
    [{ guide: { openingColors: [1, 2], guideCopies: ['one', 'two'] } }, false],
]) {
    const { h, events } = harness(options);
    assert.equal(h.start(), undefined, 'starting the level must not wait for audio preparation');
    assert.equal(events.filter(event => event === 'prepare').length, shouldPrepare ? 1 : 0, JSON.stringify(options));
    if (shouldPrepare) assert(events.indexOf('release') < events.indexOf('prepare'), 'initial stop must run before preparation');
    assert(events.includes('opening-animation-prepared'), 'pending audio must not block visual startup');
    events.length = 0; h.stop();
    assert.deepEqual(events, ['stop-current', 'release'], 'leaving the controller releases unused players');
}

// Successful taps advance the real guide immediately; changing a step retains preparation, finishing releases it.
{
    const { h, events } = harness(); h.start(); events.length = 0;
    h.openingGuideLevelOneCells = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    h.openingGuideLevelOneStep = 0; h.inputLocked = true;
    h.onOpeningGuideLevelOneTap({});
    assert.equal(h.openingGuideLevelOneStep, 1);
    assert.deepEqual(events, ['stop-current', 'show-step-1']);
    events.length = 0; h.onOpeningGuideLevelOneTap({});
    assert.equal(h.openingGuideLevelOneStep, -1); assert.equal(h.inputLocked, false);
    assert.deepEqual(events, ['stop-current', 'release', 'input-synced']);
}

console.log('guide-a-preparation.test.js passed: first-level routing, startup ordering, input and cleanup');
