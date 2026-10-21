const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8');
const file = ts.createSourceFile('guide.ts', source, ts.ScriptTarget.Latest, true);
const controller = file.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'PchConveyorGameplayController');
const names = ['start', 'stop', 'clearOpeningGuideNodes', 'dismissOpeningGuide', 'onOpeningGuideLevelOneTap',
    'onOpeningGuideTripleSpeed', 'onOpeningGuideFreeCapacity'];
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
    destroy() { this.isValid = false; }
}

function harness({ mode = 'main', level = 1, content = 'A', ranked = false, guide } = {}) {
    const events = [];
    const prepared = [];
    const audio = {
        prepareGuideVoices(names = ['guideA1', 'guideA2']) {
            prepared.push(names); events.push('prepare'); return new Promise(() => {});
        },
        releasePreparedGuideVoices() { events.push('release'); },
        stopGuideVoice() { events.push('stop-current'); },
        play(name) { events.push(`sfx:${name}`); },
    };
    const module = { exports: {} };
    new Function('module', 'exports', 'AppRoot', 'AudioMgr', 'getFirstLevelContent', 'PchConveyorRules',
        'AnalyticsMgr', 'Node', 'Label', 'PCH_SCENE_CARRIER_COUNT', 'PCH_CONVEYOR_LAYOUT',
        'PCH_LEVEL_THREE_MAX_CAPACITY', 'sp', 'Tween', 'UITransform', code)(
        module, module.exports, { tryGet: () => null }, { inst: audio }, () => content,
        class { bufferCapacity = 36; }, { inst: { getCurrentRoundId: () => '' } }, Node, class {},
        8, {}, 72, { Skeleton: class {} }, { stopAllByTarget() {} }, class {},
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
    return { h, events, prepared };
}

// Run the real start method: prepare only the current mainline guide, before the opening animation.
for (const [options, expected] of [
    [{}, [['guideA1', 'guideA2']]], [{ content: 'B' }, []], [{ content: 'C' }, []],
    [{ level: 2 }, [['guideSpeed']]], [{ level: 3 }, [['guideCapacity']]], [{ level: 4 }, []],
    [{ mode: 'theme' }, []], [{ mode: 'external' }, []], [{ ranked: true }, []],
    [{ level: 2, mode: 'theme' }, []], [{ level: 3, mode: 'external' }, []],
    [{ level: 2, ranked: true }, []], [{ level: 3, ranked: true }, []],
    [{ guide: { openingColors: [1, 2], guideCopies: ['one', 'two'] } }, []],
]) {
    const { h, events, prepared } = harness(options);
    assert.equal(h.start(), undefined, 'starting the level must not wait for audio preparation');
    assert.deepEqual(prepared, expected, JSON.stringify(options));
    if (expected.length) {
        assert(events.indexOf('release') < events.indexOf('prepare'), 'initial stop must run before preparation');
        assert(events.indexOf('prepare') < events.indexOf('opening-animation-prepared'));
    }
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

// Actual level 2/3 tap -> dismiss -> clear chain stops speech immediately and unlocks input.
for (const level of [2, 3]) {
    const { h, events } = harness({ level }); h.start(); events.length = 0;
    h.openingGuide = new Node();
    h.openingGuide.name = level === 2 ? 'PchLevelTwoSpeedGuide' : 'PchLevelThreeCapacityGuide';
    h.inputLocked = true;
    if (level === 2) {
        h.setManualSpeedMultiplier = n => events.push(`speed:${n}`);
        h.refreshSpeedButtonState = () => {};
        h.showLevelTwoSoftHand = () => events.push('soft-hand');
        h.onOpeningGuideTripleSpeed({});
        assert.deepEqual(events, ['speed:3', 'stop-current', 'release', 'input-synced', 'soft-hand', 'sfx:button']);
    } else {
        h.expandCapacity = () => { h.rules.bufferCapacity += 30; return true; };
        h.trackPchFunnelEvent = () => {};
        h.runtime.getGameplayFixedRoot().getComponent = () => ({ convertToNodeSpaceAR: p => p });
        h.playCapacityGuideTapRings = () => {};
        h.runtime.showToast = text => events.push(text);
        h.onOpeningGuideFreeCapacity({});
        assert.deepEqual(events, ['sfx:button', 'stop-current', 'release', 'input-synced', '传送带已扩容 +30']);
    }
    assert.equal(h.inputLocked, false, 'tapping must not wait for voice completion');
    assert.equal(h.openingGuide, null);
}
console.log('guide-a-preparation.test.js passed: level 1-3 routing, startup ordering, input and cleanup');
