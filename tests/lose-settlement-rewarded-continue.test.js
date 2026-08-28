const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const readJson = (relPath) => JSON.parse(read(relPath));

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

function compileExtractedMethod(source, signature, argumentNames = []) {
    const method = extractMethod(source, signature);
    const open = method.indexOf('{');
    return new Function(...argumentNames, method.slice(open + 1, -1));
}

function refId(ref) {
    return ref && typeof ref.__id__ === 'number' ? ref.__id__ : null;
}

function childNodes(prefab, node) {
    return (node._children || [])
        .map(refId)
        .filter((id) => id !== null)
        .map((id) => prefab[id]);
}

function findComponent(prefab, node, type) {
    return (node._components || [])
        .map(refId)
        .filter((id) => id !== null)
        .map((id) => prefab[id])
        .find((component) => component?.__type__ === type);
}

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const resultPanel = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const losePrefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/LosePanel.prefab');
const adIconMeta = readJson('assets/BootstrapBundle/GameUI/popup_ad_play_icon.png.meta');

const gameLose = extractMethod(settlement, "gameLose(reason: 'timeout' | 'buffer-full' = 'timeout')");
const isCompletionCommitted = compileExtractedMethod(
    settlement,
    'isBoardCompletionCommittedForSettlement(): boolean',
);
assert.equal(
    isCompletionCommitted.call({ boardModel: { isAllLocked: () => true }, _pchConveyorGameplayController: null }),
    true,
    'a completed non-PCH board must keep the existing win-before-timeout behavior',
);
assert.equal(
    isCompletionCommitted.call({
        boardModel: { isAllLocked: () => true },
        _pchConveyorGameplayController: { isActive: () => true, isFinishCommitted: () => false },
    }),
    false,
    'PCH locked model data must not beat timeout before the final return callback commits',
);
assert.equal(
    isCompletionCommitted.call({
        boardModel: { isAllLocked: () => true },
        _pchConveyorGameplayController: { isActive: () => true, isFinishCommitted: () => true },
    }),
    true,
    'PCH final return callback must lock the win before a later timer tick',
);
assert.ok(
    gameLose.includes('if (this.isBoardCompletionCommittedForSettlement())')
        && gameLose.indexOf('this.isGameEnd = true;') < gameLose.indexOf('this._pchConveyorGameplayController?.pauseForSettlement?.();'),
    'timeout must commit the result before pausing PCH return animation, while finish-first still wins',
);
assert.match(
    gameLose,
    /reason === 'buffer-full' && this\.panelBufferFullContinue/,
    'buffer-full failure must keep its dedicated rewarded expansion panel',
);
assert.ok(gameLose.includes('this.showLosePanel();'), 'ordinary timeout must show the failure panel');
assert.doesNotMatch(
    gameLose,
    /if \(this\.panelTimeoutContinue\) \{\s*this\.panelTimeoutContinue\.active = true/,
    'ordinary timeout must not route through the intermediate revive panel',
);
const continueAfterLose = extractMethod(settlement, 'continueAfterLose(addSeconds: number, resumeTimerImmediately: boolean = false)');
assert.ok(
    continueAfterLose.includes('const shouldResumePchTimer = conveyor?.isActive?.() === true;')
        && continueAfterLose.includes('conveyor?.resumeAfterSettlement?.();')
        && continueAfterLose.includes('(resumeTimerImmediately || shouldResumePchTimer)'),
    'PCH revive must resume registered return animation and the already-started countdown immediately',
);
const runContinueAfterLose = compileExtractedMethod(
    settlement,
    'continueAfterLose(addSeconds: number, resumeTimerImmediately: boolean = false)',
    ['addSeconds', 'resumeTimerImmediately'],
);
let resumedReturnCount = 0;
let scheduledTimerCount = 0;
const continueRuntime = {
    _timerStarted: true,
    _currentLevelUnlimitedTime: false,
    _pchConveyorGameplayController: {
        isActive: () => true,
        resumeAfterSettlement: () => { resumedReturnCount += 1; },
    },
    panelTimeoutContinue: null,
    panelBufferFullContinue: null,
    panelLose: null,
    timeRemain: 0,
    timerLabel: null,
    isSelected: false,
    currentBlock: null,
    _guideStep: -1,
    _guidePhase: '',
    _timerPauseRefs: 0,
    _timerLockedForProp: false,
    _freezeTimeLeft: 0,
    _freezeTimeTotal: 0,
    _adTimerSuspended: false,
    isGameEnd: true,
    tickTimer() {},
    revokeDynamicCountdownFinalFailure() {},
    markDynamicCountdownAssisted() {},
    resetTouchState() {},
    clearFreezeSpineFx() {},
    unschedule() {},
    schedule() { scheduledTimerCount += 1; },
    resetIdleHintTimer() {},
};
runContinueAfterLose.call(continueRuntime, 120, false);
assert.equal(continueRuntime.timeRemain, 120, 'PCH rewarded revive must add the configured time');
assert.equal(continueRuntime.isGameEnd, false, 'PCH rewarded revive must return to Running');
assert.equal(resumedReturnCount, 1, 'PCH rewarded revive must resume registered return animation once');
assert.equal(scheduledTimerCount, 1, 'PCH rewarded revive must resume the already-started timer without another board tap');
let nonPchScheduledTimerCount = 0;
const nonPchContinueRuntime = {
    ...continueRuntime,
    _pchConveyorGameplayController: null,
    _timerStarted: true,
    timeRemain: 0,
    isGameEnd: true,
    schedule() { nonPchScheduledTimerCount += 1; },
};
runContinueAfterLose.call(nonPchContinueRuntime, 120, false);
assert.equal(nonPchScheduledTimerCount, 0, 'non-PCH timeout revive must keep its existing wait-for-next-selection timer behavior');
assert.equal(nonPchContinueRuntime._timerStarted, false, 'non-PCH timeout revive must not silently broaden the PCH timer policy');

const createLosePanel = extractMethod(resultPanel, 'createLoseSettlementPanel(): Node');
assert.ok(
    createLosePanel.includes('this.bindReviveContinueAction(reviveBtn, overlay);'),
    'failure Continue Game must use the shared direct rewarded-revive action',
);
const bindRevive = extractMethod(resultPanel, 'bindReviveContinueAction(triggerNode: Node, overlay: Node, rewardedSeconds?: number)');
assert.match(
    bindRevive,
    /runtime\.runRewardedGrant\('level_revive',[\s\S]*?runtime\.continueAfterLose\(continueSeconds\);/,
    'completed rewarded video must directly continue gameplay',
);

const continueButtonIndex = losePrefab.findIndex(
    (entry) => entry?.__type__ === 'cc.Node' && entry._name === '复活窗组件3',
);
assert.ok(continueButtonIndex >= 0, 'LosePanel must contain its Continue Game button');
const continueButton = losePrefab[continueButtonIndex];
const continueChildren = childNodes(losePrefab, continueButton);
const labelNode = continueChildren.find((node) => node?._name === 'ReviveBtnLbl');
const iconNode = continueChildren.find((node) => node?._name === 'popup_ad_play_icon');
assert.ok(labelNode, 'Continue Game must retain its text label');
assert.ok(iconNode, 'Continue Game must contain the standard rewarded-ad icon');
assert.strictEqual(refId(iconNode._parent), continueButtonIndex, 'ad icon must be parented to Continue Game');

const label = findComponent(losePrefab, labelNode, 'cc.Label');
const iconUi = findComponent(losePrefab, iconNode, 'cc.UITransform');
const iconSprite = findComponent(losePrefab, iconNode, 'cc.Sprite');
assert.strictEqual(label?.['_string'], '继续游戏', 'failure action label must read Continue Game');
assert.ok(Number(iconUi?._contentSize?.width) > 0 && Number(iconUi?._contentSize?.height) > 0, 'ad icon must have visible dimensions');
assert.strictEqual(
    iconSprite?._spriteFrame?.__uuid__,
    '70f86993-4128-41e8-bc6d-f09aff9fd929@f9941',
    'Continue Game must reuse the established rewarded-ad icon sprite frame',
);
assert.strictEqual(
    adIconMeta.uuid,
    '70f86993-4128-41e8-bc6d-f09aff9fd929',
    'serialized icon reference must resolve to the existing BootstrapBundle asset',
);
assert.ok(iconNode._lpos.x < labelNode._lpos.x, 'ad icon must render to the left of the Continue Game label');

console.log('lose-settlement-rewarded-continue.test.js passed');
