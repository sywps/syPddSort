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
const gameCtrlState = read('assets/Scripts/Core/GameCtrlState.ts');
const gameplaySession = read('assets/Scripts/Core/GameplaySessionController.ts');
const pchConveyor = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const losePrefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/LosePanel.prefab');
const adIconMeta = readJson('assets/BootstrapBundle/GameUI/popup_ad_play_icon.png.meta');

const gameLose = extractMethod(settlement, "gameLose(reason: 'timeout' | 'buffer-full' = 'timeout')");
assert.ok(
    gameCtrlState.includes("_activeLoseReason: null as 'timeout' | 'buffer-full' | null"),
    'runtime state must initialize the active loss reason explicitly',
);
assert.ok(
    gameplaySession.includes('runtime._activeLoseReason = null;'),
    'each gameplay initialization must clear the previous loss reason',
);
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
assert.match(
    gameLose,
    /reason === 'timeout' && this\.panelTimeoutContinue/,
    'ordinary timeout must route through its dedicated rewarded revive panel',
);
assert.ok(gameLose.includes('this.showLosePanel();'), 'missing revive panels must retain the final failure fallback');

const gameLoseBodyStart = gameLose.indexOf('{');
const revivePanelEvents = [];
const runGameLose = new Function(
    'AnalyticsMgr',
    'SySDKMgr',
    'PerformanceMgr',
    'AudioMgr',
    `return function(reason = 'timeout') {${gameLose.slice(gameLoseBodyStart + 1, -1)}};`,
)(
    {
        inst: {
            markLevelFailed() {},
            trackRevivePanelShow(page, levelId) { revivePanelEvents.push({ page, levelId }); },
        },
    },
    { inst: { reportLevelFail() {} } },
    { inst: { markUserActivity() {} } },
    { inst: { play() {} } },
);
const createLoseRouteRuntime = () => {
    const createPanel = () => ({
        active: false,
        siblingIndex: -1,
        setSiblingIndex(value) { this.siblingIndex = value; },
    });
    return {
        isGameEnd: false,
        _pchConveyorGameplayController: {
            pauseForSettlement() {},
            getAnalyticsSnapshot: () => null,
        },
        panelTimeoutContinue: createPanel(),
        panelBufferFullContinue: createPanel(),
        panelLose: createPanel(),
        showLosePanelCalls: 0,
        isBoardCompletionCommittedForSettlement: () => false,
        isBoardCompletionPendingForSettlement: () => false,
        clearIdleHint() {},
        unschedule() {},
        tickTimer() {},
        trackFirstLevelFunnel() {},
        getAnalyticsLevelId: () => 1,
        getAnalyticsPage: () => 'game',
        updateLoseProgressLabel() {},
        ensureGameplayResultPanelsCreated: () => true,
        showLosePanel() { this.showLosePanelCalls += 1; },
    };
};

const timeoutLoseRuntime = createLoseRouteRuntime();
timeoutLoseRuntime.panelBufferFullContinue.active = true;
timeoutLoseRuntime.panelLose.active = true;
runGameLose.call(timeoutLoseRuntime, 'timeout');
assert.equal(timeoutLoseRuntime._activeLoseReason, 'timeout', 'timeout must preserve its reason for the final failure page');
assert.equal(timeoutLoseRuntime.panelTimeoutContinue.active, true, 'timeout must display its revive panel');
assert.equal(timeoutLoseRuntime.panelTimeoutContinue.siblingIndex, 999, 'timeout revive panel must be brought to front');
assert.equal(timeoutLoseRuntime.panelBufferFullContinue.active, false, 'timeout must hide the buffer-full revive panel');
assert.equal(timeoutLoseRuntime.panelLose.active, false, 'timeout must not display the final failure panel');
assert.equal(timeoutLoseRuntime.showLosePanelCalls, 0, 'timeout must not enter final failure before give-up');
assert.deepStrictEqual(
    revivePanelEvents,
    [{ page: 'level_revive', levelId: 1 }],
    'timeout exposure must be recorded only after its revive panel becomes visible',
);

const bufferFullLoseRuntime = createLoseRouteRuntime();
bufferFullLoseRuntime.panelTimeoutContinue.active = true;
bufferFullLoseRuntime.panelLose.active = true;
runGameLose.call(bufferFullLoseRuntime, 'buffer-full');
assert.equal(bufferFullLoseRuntime._activeLoseReason, 'buffer-full', 'buffer-full must preserve its reason for the final failure page');
assert.equal(bufferFullLoseRuntime.panelBufferFullContinue.active, true, 'buffer-full must display its expansion revive panel');
assert.equal(bufferFullLoseRuntime.panelBufferFullContinue.siblingIndex, 999, 'buffer-full revive panel must be brought to front');
assert.equal(bufferFullLoseRuntime.panelTimeoutContinue.active, false, 'buffer-full must hide the timeout revive panel');
assert.equal(bufferFullLoseRuntime.panelLose.active, false, 'buffer-full must not display the final failure panel');
assert.equal(bufferFullLoseRuntime.showLosePanelCalls, 0, 'buffer-full must not enter final failure before give-up');
assert.deepStrictEqual(
    revivePanelEvents,
    [
        { page: 'level_revive', levelId: 1 },
        { page: 'pch_buffer_full_revive', levelId: 1 },
    ],
    'buffer-full exposure must use its distinct revive placement',
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
    _activeLoseReason: 'timeout',
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
assert.equal(continueRuntime._activeLoseReason, null, 'successful revive must clear the completed loss reason');
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

const runCompletionSummary = compileExtractedMethod(
    settlement,
    'syncSettlementCompletionSummary(panel: Node | null | undefined, percent: number): boolean',
    ['panel', 'percent', 'Label'],
);
const completionRootLabel = { string: '关卡已完成' };
const completionPercentLabel = { string: '%' };
const completionPercentNode = {
    getComponent() { return completionPercentLabel; },
};
const runtimeCompletionSummaryNode = {
    name: 'Label',
    getComponent() { return completionRootLabel; },
    getChildByName(name) { return name === 'Label' ? completionPercentNode : null; },
};
const completionBox = {
    children: [runtimeCompletionSummaryNode],
    getChildByName() { return null; },
};
const completionPanel = {
    name: 'LosePanel',
    getChildByName(name) { return name === 'Box' ? completionBox : null; },
};
assert.equal(
    runCompletionSummary.call({}, completionPanel, 87, function Label() {}),
    true,
    'LosePanel must keep the existing dynamic completion-summary contract',
);
assert.equal(completionPercentLabel.string, '87%', 'LosePanel must render the runtime completion percentage inside the new summary');

const runContinueAfterBufferFull = compileExtractedMethod(
    pchConveyor,
    'continueAfterBufferFull(): boolean',
);
let expandedBufferCount = 0;
let bufferContinueArgs = null;
const bufferContinueRuntime = {
    rules: {},
    inputLocked: true,
    runtime: {
        isGameEnd: true,
        continueAfterLose(...args) { bufferContinueArgs = args; },
    },
    expandCapacity() {
        expandedBufferCount += 1;
        return true;
    },
};
assert.equal(runContinueAfterBufferFull.call(bufferContinueRuntime), true, 'valid buffer-full recovery must succeed');
assert.equal(expandedBufferCount, 1, 'buffer-full recovery must expand capacity exactly once');
assert.equal(bufferContinueRuntime.inputLocked, false, 'buffer-full recovery must unlock conveyor input');
assert.deepStrictEqual(bufferContinueArgs, [0, true], 'buffer-full recovery must resume the same game immediately without time-only reward');

const createLosePanel = extractMethod(resultPanel, 'createLoseSettlementPanel(): Node');
assert.ok(
    createLosePanel.includes('this.bindLoseReviveContinueAction(reviveBtn, overlay);'),
    'failure Continue Game must choose its reward from the active loss reason at click time',
);
assert.ok(
    createLosePanel.includes('this.syncResultProgressWidget(overlay, 0, true);'),
    'failure panel must explicitly use the text completion summary when its legacy progress widget is absent',
);
assert.ok(
    createLosePanel.includes("runtime.requirePanelChild(box, 'HomeBtn')"),
    'failure panel must bind its dedicated text-style HomeBtn node',
);
assert.ok(
    createLosePanel.includes('this.leaveFailureToHome(overlay);'),
    'failure HomeBtn must invalidate pending revive activity before routing home',
);
const createRevivePanel = extractMethod(resultPanel, 'createReviveSettlementPanel(): Node');
assert.ok(
    createRevivePanel.includes('this.bindReviveContinueAction(continueBtn, overlay, rewardedSeconds);'),
    'timeout revive panel must use the configured rewarded continuation action',
);
assert.match(
    createRevivePanel,
    /const giveUp = \(\) => \{[\s\S]*?this\.closeReviveFailureSession\('timeout', overlay\);/,
    'closing the timeout revive panel must delegate to the guarded final-failure route',
);
const closeReviveFailureSession = extractMethod(
    resultPanel,
    'closeReviveFailureSession(kind: ReviveSharePanelKind, overlay: Node): void',
);
assert.match(
    closeReviveFailureSession,
    /cancelRewardedGrantInteraction\?\.\('revive-panel-close'\)[\s\S]*?cancelPendingShareReturn\?\.\('revive-panel-close'\)[\s\S]*?showLosePanel\(\)/,
    'closing the timeout revive panel must cancel pending activity before entering final failure',
);
const bindRevive = extractMethod(resultPanel, 'bindReviveContinueAction(triggerNode: Node, overlay: Node, rewardedSeconds?: number)');
const runLevelRevive = extractMethod(resultPanel, 'runLevelReviveAction(overlay: Node, continueSeconds: number)');
assert.match(
    runLevelRevive,
    /runtime\.runRewardedGrant\('level_revive',[\s\S]*?runtime\.continueAfterLose\(continueSeconds\);/,
    'completed rewarded video must directly continue gameplay',
);
assert.ok(
    bindRevive.includes('this.runLevelReviveAction(overlay, continueSeconds)'),
    'timeout revive binding must delegate to the guarded level-revive action',
);
const bindLoseRevive = extractMethod(resultPanel, 'bindLoseReviveContinueAction(triggerNode: Node, overlay: Node)');
assert.match(
    bindLoseRevive,
    /this\.resolveFinalFailureReviveKind\(\) === 'buffer-full'[\s\S]*?this\.runBufferFullReviveAction\(overlay\);[\s\S]*?this\.runLevelReviveAction\(overlay, continueSeconds\);/,
    'the final failure page must reuse buffer expansion only for a buffer-full loss',
);
const resolveFinalFailureReviveKind = extractMethod(resultPanel, 'resolveFinalFailureReviveKind(): ReviveSharePanelKind');
assert.match(
    resolveFinalFailureReviveKind,
    /runtime\._activeLoseReason === 'buffer-full' \? 'buffer-full' : 'timeout'/,
    'the final failure page must retain its buffer-full fallback when no session context remains',
);
const runBindRevive = compileExtractedMethod(
    resultPanel,
    'bindReviveContinueAction(triggerNode: Node, overlay: Node, rewardedSeconds?: number)',
    ['triggerNode', 'overlay', 'rewardedSeconds', 'AudioMgr'],
);
const runLevelReviveAction = compileExtractedMethod(
    resultPanel,
    'runLevelReviveAction(overlay: Node, continueSeconds: number)',
    ['overlay', 'continueSeconds', 'AudioMgr', 'ensurePchConveyorGameplayController'],
);
const timeoutOverlay = { active: true };
const timeoutTrigger = {};
let timeoutReviveAction = null;
let timeoutRewardedAttempts = 0;
let pendingTimeoutGrant = null;
let continuedSeconds = null;
const timeoutResultController = {
    runtime: {
        constructor: { REWARDED_CONTINUE_SECONDS: 120 },
        _adShowing: false,
        _pchConveyorGameplayController: {
            grantReviveCapacity: () => true,
        },
        runRewardedGrant(page, grant) {
            assert.equal(page, 'level_revive', 'timeout revive must request the level-revive rewarded placement');
            timeoutRewardedAttempts += 1;
            if (timeoutRewardedAttempts === 2) pendingTimeoutGrant = grant;
            return true;
        },
        continueAfterLose(seconds) { continuedSeconds = seconds; },
    },
    bindPanelButton(triggerNode, action) {
        assert.strictEqual(triggerNode, timeoutTrigger);
        timeoutReviveAction = action;
    },
    beginReviveFailureSession(kind) {
        return { kind, active: true };
    },
    isReviveFailureSessionActive(session) {
        return session.active;
    },
    completeReviveFailureSession(session) {
        session.active = false;
    },
    runLevelReviveAction(overlay, seconds) {
        return runLevelReviveAction.call(
            this,
            overlay,
            seconds,
            { inst: { play() {} } },
            (runtime) => runtime._pchConveyorGameplayController,
        );
    },
};
runBindRevive.call(
    timeoutResultController,
    timeoutTrigger,
    timeoutOverlay,
    undefined,
    { inst: { play() {} } },
);
assert.equal(typeof timeoutReviveAction, 'function', 'timeout revive button must bind an action');
timeoutReviveAction();
assert.equal(timeoutOverlay.active, true, 'cancelled or incomplete video must keep the timeout revive panel visible');
assert.equal(continuedSeconds, null, 'cancelled or incomplete video must not continue gameplay');
timeoutReviveAction();
assert.equal(typeof pendingTimeoutGrant, 'function', 'a completed ad attempt must expose its guarded grant');
pendingTimeoutGrant();
assert.equal(timeoutOverlay.active, false, 'completed video must close the timeout revive panel');
assert.equal(continuedSeconds, 120, 'completed video must add 120 seconds before continuing gameplay');

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
assert.strictEqual(label?.['_string'], '继续游戏', 'failure action label must present the rewarded Continue Game action');
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
assert.strictEqual(continueButton._lpos.x, 150, 'green rewarded Continue Game must render on the right');

const homeButtonIndex = losePrefab.findIndex(
    (entry) => entry?.__type__ === 'cc.Node' && entry._name === 'HomeBtn',
);
assert.ok(homeButtonIndex >= 0, 'LosePanel must expose a dedicated HomeBtn node');
const homeButton = losePrefab[homeButtonIndex];
const homeLabelNode = childNodes(losePrefab, homeButton).find((node) => node?._name === 'HomeLabel');
assert.ok(homeLabelNode, 'HomeBtn must retain its text label');
assert.strictEqual(findComponent(losePrefab, homeLabelNode, 'cc.Label')?.['_string'], '返回主页');
assert.strictEqual(
    findComponent(losePrefab, homeButton, 'cc.Sprite')?._enabled,
    false,
    'HomeBtn must remain a low-priority text action without a visible button background',
);

const loseBoxIndex = losePrefab.findIndex(
    (entry) => entry?.__type__ === 'cc.Node' && entry._name === 'Box',
);
assert.ok(loseBoxIndex >= 0, 'LosePanel must retain its Box root');
const loseBoxChildren = childNodes(losePrefab, losePrefab[loseBoxIndex]);
const infoArtNode = loseBoxChildren.find((node) => node?._name === 'InfoArt');
const titleRibbonNode = loseBoxChildren.find((node) => node?._name === 'TitleRibbon');
const completionSummaryNode = loseBoxChildren.find((node) => node?._name === 'Label');
const legacyProgressNode = loseBoxChildren.find((node) => node?._name === '进度条');
assert.ok(infoArtNode, 'LosePanel must reuse the timeout failure illustration as InfoArt');
assert.strictEqual(
    findComponent(losePrefab, infoArtNode, 'cc.Sprite')?._spriteFrame?.__uuid__,
    '123c4ced-f82b-4826-9499-1d90c53d8478@f9941',
    'LosePanel InfoArt must reference the existing timeout revive illustration',
);
assert.ok(titleRibbonNode, 'LosePanel must retain a title ribbon');
const titleLabelNode = childNodes(losePrefab, titleRibbonNode).find((node) => node?._name === 'TitleLabel');
assert.strictEqual(
    findComponent(losePrefab, titleLabelNode, 'cc.Label')?._string,
    '关卡失败',
    'LosePanel title must match the confirmed failure state',
);
assert.ok(completionSummaryNode, 'LosePanel must retain the dynamic completion-summary root');
assert.strictEqual(findComponent(losePrefab, completionSummaryNode, 'cc.Label')?._string, '关卡已完成');
const serializedCompletionPercentNode = childNodes(losePrefab, completionSummaryNode).find((node) => node?._name === 'Label');
const serializedCompletionTailNode = childNodes(losePrefab, completionSummaryNode).find((node) => node?._name === 'ProgressTail');
assert.ok(
    serializedCompletionPercentNode,
    'completion summary must retain its dynamic percentage Label child',
);
assert.strictEqual(
    findComponent(losePrefab, serializedCompletionTailNode, 'cc.Label')?._string,
    '，就差一点点了！',
    'completion summary must retain its encouragement suffix',
);
assert.strictEqual(legacyProgressNode, undefined, 'LosePanel must physically remove the legacy progress node');
assert.ok(
    !losePrefab.some((entry) => entry?.__type__ === 'cc.Node' && entry._name === '进度条'),
    'LosePanel must not retain an unreachable legacy progress node record',
);
const replayButtonNode = loseBoxChildren.find((node) => node?._name === '绿色按键底框-001');
assert.ok(replayButtonNode, 'LosePanel must retain its Restart button');
assert.strictEqual(replayButtonNode._lpos.x, -150, 'blue Restart must render on the left');
const replayLabelNode = childNodes(losePrefab, replayButtonNode).find((node) => node?._name === 'Label');
for (const styledLabelNode of [
    titleLabelNode,
    completionSummaryNode,
    serializedCompletionPercentNode,
    serializedCompletionTailNode,
    labelNode,
    homeLabelNode,
    replayLabelNode,
]) {
    const styledLabel = findComponent(losePrefab, styledLabelNode, 'cc.Label');
    assert.strictEqual(styledLabel?._outlineColor?.__type__, 'cc.Color', 'LosePanel label outline must use a serialized cc.Color');
    assert.strictEqual(styledLabel?._outlineColor?._color, undefined, 'LosePanel label outline must not contain an invalid nested color');
}

const leaveFailureToHome = extractMethod(resultPanel, 'leaveFailureToHome(overlay: Node): void');
assert.match(
    leaveFailureToHome,
    /cancelRewardedGrantInteraction\?\.\('lose-panel-home'\)[\s\S]*?cancelPendingShareReturn\?\.\('lose-panel-home'\)[\s\S]*?showMainMenu\(\)/,
    'HomeBtn must cancel pending rewarded and share activity before routing home',
);
const runLeaveFailureToHome = compileExtractedMethod(
    resultPanel,
    'leaveFailureToHome(overlay: Node): void',
    ['overlay', 'AnalyticsMgr'],
);
const pendingSession = { active: true };
const homeExitOverlay = { active: true };
const homeExitCalls = [];
const homeExitController = {
    activeReviveFailureSession: pendingSession,
    finalFailureReviveContext: { kind: 'timeout', logicalLevelId: 4 },
    runtime: {
        cancelRewardedGrantInteraction(reason) { homeExitCalls.push(`cancel-ad:${reason}`); },
        cancelPendingShareReturn(reason) { homeExitCalls.push(`cancel-share:${reason}`); },
        _pchConveyorGameplayController: { getAnalyticsSnapshot: () => ({ slots: 3 }) },
        showMainMenu() { homeExitCalls.push('home'); },
    },
};
runLeaveFailureToHome.call(homeExitController, homeExitOverlay, {
    inst: {
        finalizePendingFailedLevel(payload) {
            assert.deepStrictEqual(payload, { gameplayStats: { slots: 3 } });
            homeExitCalls.push('finalize');
        },
    },
});
assert.equal(pendingSession.active, false, 'HomeBtn must invalidate the in-flight revive session');
assert.equal(homeExitController.activeReviveFailureSession, null, 'HomeBtn must clear the active revive session handle');
assert.equal(homeExitController.finalFailureReviveContext, null, 'HomeBtn must clear final failure revive context');
assert.equal(homeExitOverlay.active, false, 'HomeBtn must hide the failure overlay before routing home');
assert.deepStrictEqual(
    homeExitCalls,
    ['cancel-ad:lose-panel-home', 'cancel-share:lose-panel-home', 'finalize', 'home'],
    'HomeBtn must complete cancellation and analytics before the home route',
);

console.log('lose-settlement-rewarded-continue.test.js passed');
