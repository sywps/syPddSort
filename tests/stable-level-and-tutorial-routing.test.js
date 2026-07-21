const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

function slotPolicy(relPath) {
    return readJson(relPath).slotPolicy;
}

function readTutorialGuide(relPath) {
    return readJson(relPath).tutorialGuide;
}

function colorCounts(relPath, key) {
    const data = readJson(relPath);
    const counts = new Map();
    for (const row of data[key] || []) {
        for (const colorId of row) {
            if (!colorId) continue;
            counts.set(colorId, (counts.get(colorId) || 0) + 1);
        }
    }
    return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
}

function unplacedComponentSummary(relPath) {
    const data = readJson(relPath);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const visited = Array.from({ length: data.boardHeight }, () => Array(data.boardWidth).fill(false));
    const summary = [];
    for (let r = 0; r < data.boardHeight; r++) {
        for (let c = 0; c < data.boardWidth; c++) {
            const color = data.initRandomColorArr[r]?.[c] || 0;
            const target = data.correctColorArr[r]?.[c] || 0;
            if (!color || color === target || visited[r][c]) continue;
            const cells = [];
            const stack = [[r, c]];
            visited[r][c] = true;
            while (stack.length > 0) {
                const [cr, cc] = stack.pop();
                cells.push([cr, cc]);
                for (const [dr, dc] of dirs) {
                    const nr = cr + dr;
                    const nc = cc + dc;
                    if (nr < 0 || nr >= data.boardHeight || nc < 0 || nc >= data.boardWidth) continue;
                    if (visited[nr][nc]) continue;
                    const nextColor = data.initRandomColorArr[nr]?.[nc] || 0;
                    const nextTarget = data.correctColorArr[nr]?.[nc] || 0;
                    if (nextColor !== color || nextColor === nextTarget) continue;
                    visited[nr][nc] = true;
                    stack.push([nr, nc]);
                }
            }
            summary.push([color, cells.length]);
        }
    }
    return summary.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
}

function mismatchPairSummary(relPath) {
    const data = readJson(relPath);
    const counts = new Map();
    for (let row = 0; row < data.boardHeight; row++) {
        for (let col = 0; col < data.boardWidth; col++) {
            const source = data.initRandomColorArr[row]?.[col] || 0;
            const target = data.correctColorArr[row]?.[col] || 0;
            if (!source || source === target) continue;
            const key = `${source}->${target}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        }
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

const bootstrapLevel1Path = 'assets/BootstrapBundle/LevelData/level_1.json';

const cocosSpec = read('docs/cocos-ai-code-ai-collaboration-spec-v1.md');
assert.ok(!fs.existsSync(path.join(root, 'assets/Scripts/Core/ExperimentUrlParam.ts')), 'retired experiment URL parser must be deleted');
assert.ok(!cocosSpec.includes('实验 bucket'), 'runtime collaboration spec must not describe a retired experiment bucket');

const analytics = read('assets/Scripts/Core/AnalyticsMgr.ts');
assert.ok(!analytics.toLowerCase().includes('experiment'), 'tutorial experiment assignment must be removed');
assert.ok(!analytics.includes('abId'), 'new behavior and funnel events must not emit an experiment id');
assert.ok(!analytics.includes('abBucket'), 'new behavior and funnel events must not emit an experiment bucket');
assert.ok(analytics.includes('setLevelContext'), 'analytics must retain logical and physical level context without experiment metadata');
assert.ok(!analytics.includes('shouldShowTutorialSkipGuidePrompt'), 'retired tutorial prompt gate must be removed');
assert.ok(analytics.includes('launchChannelAtEvent: this.resolveChannel()'), 'each funnel event must retain its event-time launch channel');
const wxCloudMgr = read('assets/Scripts/Core/WxCloudMgr.ts');
assert.ok(wxCloudMgr.includes('getEnterOptionsSync?.() || wx?.getLaunchOptionsSync?.()'), 'event-time scene attribution must prefer the current enter options');

const tutorialGuide = read('assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts');
assert.ok(!tutorialGuide.toLowerCase().includes('experiment'), 'starter guide must not be gated by experiment assignment');
assert.ok(!tutorialGuide.includes('handleTutorialRelaxedTap'), 'old treatment-only relaxed tap handler must be removed');
assert.ok(!tutorialGuide.includes('handleStarterTutorialAutoCorrectTap'), 'starter guide must not auto-correct arbitrary taps into the prescribed action');
assert.ok(!tutorialGuide.includes('isStarterTutorialAutoCorrectMode'), 'starter guide must not retain an auto-correct mode gate');
assert.ok(!tutorialGuide.includes('TutorialSkipGuidePrompt'), 'retired tutorial skip prompt runtime code must be removed');
assert.ok(!tutorialGuide.includes('tutorial_skip_prompt'), 'retired tutorial skip prompt tracking must be removed');
assert.ok(!tutorialGuide.includes('tutorial_skip_guide'), 'retired tutorial skip prompt click tracking must be removed');

const gameScene = readJson('assets/BootstrapBundle/Scenes/Game.scene');
const skipPrompt = gameScene.find((entry) => entry && entry._name === 'TutorialSkipGuidePrompt');
assert.ok(!skipPrompt, 'Game.scene must not contain retired TutorialSkipGuidePrompt');
assert.ok(!gameScene.some((entry) => entry && entry._string === '跳过引导'), 'retired TutorialSkipGuidePrompt label must be removed from Game.scene');

const levelCdn = read('assets/Scripts/Core/LevelDataCdnService.ts');
assert.ok(!levelCdn.toLowerCase().includes('experiment'), 'level experiment assignment and routing must be removed');
assert.ok(levelCdn.includes('return this.loadLevelFromContext(context, normalizedLevelId, normalizedPrefix, true);'), 'foreground loadLevel must use the single stable CDN path');
assert.ok(levelCdn.includes('const manifest = await this.getLiveManifest(context, foregroundLoad);'), 'foreground CDN load path must pass retry intent into manifest loading');
assert.ok(levelCdn.includes('if (this.isLiveManifestCoolingDown(state) && !foregroundLoad) return null;'), 'only background prefetch should honor manifest failure cooldown');
assert.ok(levelCdn.includes("namespace: 'stable'"), 'all level loads must use the stable CDN namespace');
assert.ok(!levelCdn.includes('degrade'), 'stable CDN failures must not retry through an experiment-to-stable degrade path');

const session = read('assets/Scripts/Core/GameplaySessionController.ts');
const sceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const boardInput = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const slotOnboardingPolicy = read('assets/Scripts/Core/SlotOnboardingPolicy.ts');
const themePanelFlow = read('assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts');
const settlementHud = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const slotUi = read('assets/Scripts/Core/GameplaySlotUiController.ts');
const tutorialGuideModule = read('assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts');
const firstLevelRoute = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
assert.ok(!session.toLowerCase().includes('experiment'), 'guide behavior and analytics must not branch on experiment assignment');
assert.ok(session.includes('this.resolveTutorialMode(data)'), 'tutorial routing must be driven by the loaded level data');
assert.ok(session.includes("case 'level_1_red_blue': return 'level_1'"), 'level 1 data must resolve to the mandatory core tutorial');
assert.ok(session.includes("case 'slot_expand_all': return 'level_2'"), 'slot expansion data must resolve to the mandatory seven-step level 2 tutorial');
assert.ok(session.includes("case 'zoom': return 'zoom'"), 'zoom data must resolve to the optional zoom hint');
assert.ok(!session.includes('applyGuideSlotPolicy'), 'client code must not rewrite the validated slotPolicy by level number');
assert.ok(session.includes('slotPolicy.unlockedRows < slotPolicy.rowCount ? 1 : 0'), 'every progressive row policy must render only the next locked preview row');
assert.ok(session.includes("eventName: 'level_interaction_ready'"), 'early levels must emit readiness after tutorial and blocker setup');
assert.ok(firstLevelRoute.includes("trackFirstLevelFunnel('interaction_touch_attempt'"), 'the first five L1/L2 attempts must capture delivery and blocker state');
assert.ok(tutorialGuide.includes("source !== 'zoom_button'"), 'visible plus/minus zoom buttons must be accepted by the zoom hint');
assert.ok(tutorialGuide.includes('this._guideZoomAccumulatedScaleDelta <= TUTORIAL_ZOOM_SCALE_DELTA'), 'zoom hint must require a real accumulated scale change');
assert.ok(tutorialGuide.includes("this.dismissZoomHint?.('timeout')"), 'optional zoom hint must auto-dismiss after five seconds');
assert.ok(boardInput.includes("this.completeZoomTutorialIfThresholdReached?.('pinch')"), 'real board pinch movement must report actual scale changes to the tutorial state machine');
assert.ok(boardInput.includes("this.dismissZoomHint?.('board_tap')"), 'the first normal board tap must dismiss the zoom hint without being consumed');
const boardZoomControl = read('assets/Scripts/Core/GameCtrlModules/BoardZoomControlModule.ts');
assert.ok(boardZoomControl.includes("'zoom_progress' | 'zoom_button'"), 'zoom control must distinguish the progress track from plus/minus buttons');
assert.ok(boardZoomControl.includes("'zoom_progress'"), 'zoom progress interaction must be eligible for tutorial completion');
assert.ok(boardZoomControl.includes("'zoom_button'"), 'zoom plus/minus buttons must report their source to the optional hint');
assert.ok(!settlementHud.includes('guideZoomPickBlockStep'), 'zoom must not add a second mandatory highlighted-bean step');
assert.ok(tutorialGuide.includes('this.scheduleOnce(handler, 5);'), 'every tutorial step must arm the five-second reminder');
assert.ok(tutorialGuide.includes('startGuidePinchReminderAnimation'), 'zoom hint must render the two-hand gesture immediately');
assert.ok(themePanelFlow.includes('if (this.isGameEnd) return;'), 'an async guide asset callback must not recreate the pinch guide after gameplay ends');
assert.ok((settlementHud.match(/this\.closePinchGuide\?\.\(\);/g) || []).length >= 2, 'win completion and settlement reveal must both force-close stale pinch guide UI');
assert.ok(gameplayView.includes('ZOOM_HINT_SCALE_HEADROOM = 0.06'), 'the configured zoom-hint level must start with room to shrink as well as enlarge');
assert.ok(gameplayView.includes("runtime._activeGameplayGuideLayoutMode === 'zoom'"), 'zoom headroom must follow data-driven guide mode instead of level number');
assert.ok(slotOnboardingPolicy.includes('unlockAllRowsAtOnce'), 'slot policy must support one-click all-row unlocks for level 2');
assert.ok(slotUi.includes('getAllRowsUnlockTargetRowCount'), 'slot UI must preserve unlock-all target row count separately from the current visible row count');
assert.ok(slotUi.includes('hasPendingAllRowsUnlock'), 'slot UI must keep the add button active when unlock-all rows are pending');
assert.ok(slotUi.includes('runtime.slotModel.expand(SLOTS_PER_ROW * rowsToAdd)'), 'slot UI must expand all pending rows in one action');
assert.ok(slotUi.includes('row >= runtime.slotUnlockedRows'), 'slot UI must visually lock every row above the unlocked row count');
assert.ok(slotUi.includes('LOCKED_SLOT_PREVIEW_OPACITY'), 'locked slot preview grooves must remain visible in the intro slot panel');
assert.ok(tutorialGuideModule.includes('guideLevel2UnlockStep') && tutorialGuideModule.includes('guideLevel2PlaceBufferedStep'), 'level 2 must guide the full unlock/buffer/swap/return path');
assert.ok(!tutorialGuideModule.includes("'hit_reselect'"), 'level 2 slot placement must retain the prescribed block instead of silently changing the seven-tap solution');
assert.ok(tutorialGuideModule.includes('this._guideLevel2SlotPlacementSucceeded = true'), 'a real slot store must explicitly arm level 2 guide completion');
assert.ok(tutorialGuideModule.includes('done = this._guideLevel2SlotPlacementSucceeded === true'), 'level 2 must continue only after a real slot placement lands');
assert.ok(tutorialGuideModule.includes('done = this.isColorFullyLocked(this._guideSecondColorId)'), 'level 2 must verify the counterpart board placement');
assert.ok(tutorialGuideModule.includes('done = this.boardModel.isAllLocked()'), 'level 2 must finish only after the buffered color locks the whole board');
assert.ok(tutorialGuideModule.includes('const ZOOM_HINT_HAND_TARGET_Y_OFFSET = -180;'), 'level 3 pinch hands must be shifted visibly below the board center');
assert.ok(tutorialGuideModule.includes("this.getConfiguredGuideCopy(1, '点击高亮豆子')"), 'level 2 must describe the exact first block used by the seven-tap path');
assert.ok(tutorialGuideModule.includes('step === 1 || step === 3 || step === 5'), 'level 2 must expose all three deterministic selection steps');
assert.ok(!tutorialGuideModule.includes("new Node('PromptLabel"), 'level 3 slot intro must not create static labels at runtime');
const secondaryEmphasisNode = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'PromptLabelSecondaryEmphasis');
assert.ok(secondaryEmphasisNode, 'Game.scene must own the level 3 secondary emphasis node');
assert.strictEqual(secondaryEmphasisNode._active, false, 'level 3 inline emphasis copy must default inactive outside the slot-intro guide');
const secondaryEmphasisLabel = gameScene.find((entry) => entry && entry.__type__ === 'cc.Label' && entry.node?.__id__ === gameScene.indexOf(secondaryEmphasisNode));
assert.ok(secondaryEmphasisLabel && secondaryEmphasisLabel._fontSize === 34, 'Game.scene must own the level 3 secondary emphasis style');
assert.ok(gameplayView.includes('const currentTouch = event?.touch || event;'), 'board touch tracking must update only the touch delivered to the board listener');
assert.ok(gameplayView.includes('globallyActiveIds') && !gameplayView.includes('runtime.activeBoardTouches.set(id, this.getTouchUiPos(touch));'), 'global touches may only prune stale board touches, never add unrelated UI touches');
assert.ok(boardInput.includes('transitionFromPinchToRemainingTouch'), 'pinch state must reconcile immediately when only one board-owned touch remains');
assert.ok(gameplayView.includes('Node.EventType.TOUCH_CANCEL, runtime.onTouchCancel'), 'touch cancellation must use the reset-only handler');
const guideHandsRoot = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'TutorialGuideHands');
const guideHandSingle = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'GuideHandSingle');
const guideHandPinchLeft = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'GuideHandPinchLeft');
const guideHandPinchRight = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'GuideHandPinchRight');
assert.ok(guideHandsRoot && guideHandsRoot._active === false, 'Game.scene must own the inactive tutorial hand variants root');
assert.ok(guideHandSingle && guideHandPinchLeft && guideHandPinchRight, 'Game.scene must own single-hand and left/right pinch-hand variants');
assert.ok(!settlementHud.includes("new Node('GuideHand')"), 'runtime tutorial code must bind scene-owned hand nodes instead of recreating them');
assert.ok(tutorialGuideModule.includes('if (this.slotUnlockedRows > beforeRows)'), 'level 2 must advance only after the real unlocked-row count increases');
assert.ok(!sceneRuntime.toLowerCase().includes('experiment'), 'retired tutorial experiment sync must not run in game runtime');
assert.ok(!sceneRuntime.includes('syncTutorialSkipGuidePrompt'), 'retired tutorial prompt sync call must be removed');

const level1GuideCopies = [
    '点击【红色豆豆】',
    '放进【暂存区】，腾出空位',
    '点击【蓝色豆豆】',
    '放进【刚腾出的空位】',
    '点击暂存区的【红色豆豆】',
    '放进【红色空位】',
];
const level2GuideCopies = [
    '点击【解锁按钮】',
    '点击【高亮豆子】',
    '放到【下方插槽】',
    '点击【另一组豆子】',
    '放回【对应空位】',
    '点击【槽内豆子】',
    '放回【最后空位】',
];
const level3ZoomCopies = [
    '双指【缩放图案】',
];
const level2Data = readJson('assets/LevelData/level_2.json');
const level3Data = readJson('assets/LevelData/level_3.json');
const levelManifest = readJson('assets/LevelData/level-manifest.json');
const manifestByLevel = new Map(levelManifest.entries.map((entry) => [entry.levelId, entry]));

assert.deepStrictEqual(slotPolicy('assets/LevelData/level_1.json'), {
    defaultRows: 1,
    freeUnlockRows: 0,
    adUnlockRows: 0,
}, 'stable level 1 guide level must keep 1/0/0 slot policy');
assert.deepStrictEqual(colorCounts('assets/LevelData/level_1.json', 'correctColorArr'), [[10, 12], [13, 12]], 'stable level 1 correct colors must be red/blue for A/B/default rollout');
assert.deepStrictEqual(colorCounts('assets/LevelData/level_1.json', 'initRandomColorArr'), [[10, 12], [13, 12]], 'stable level 1 init colors must be red/blue for A/B/default rollout');
assert.strictEqual(readTutorialGuide('assets/LevelData/level_1.json').mode, 'level_1_red_blue', 'stable level 1 must declare red/blue guide copy mode');
assert.deepStrictEqual(readTutorialGuide('assets/LevelData/level_1.json').guideCopies, level1GuideCopies, 'stable level 1 must use the six approved marked guide copies');
assert.deepStrictEqual(colorCounts(bootstrapLevel1Path, 'correctColorArr'), [[10, 12], [13, 12]], 'bootstrap level 1 correct colors must stay aligned with stable red/blue data');
assert.deepStrictEqual(colorCounts(bootstrapLevel1Path, 'initRandomColorArr'), [[10, 12], [13, 12]], 'bootstrap level 1 init colors must stay aligned with stable red/blue data');
assert.strictEqual(readTutorialGuide(bootstrapLevel1Path).mode, 'level_1_red_blue', 'bootstrap level 1 must declare red/blue guide copy mode');
assert.deepStrictEqual(readTutorialGuide(bootstrapLevel1Path).guideCopies, level1GuideCopies, 'bootstrap level 1 guide copy must stay aligned with stable data');

assert.deepStrictEqual(slotPolicy('assets/LevelData/level_2.json'), {
    defaultRows: 1,
    freeUnlockRows: 3,
    adUnlockRows: 0,
    unlockAllRowsAtOnce: true,
}, 'stable level 2 must unlock the remaining three rows with one free action');
assert.strictEqual(readTutorialGuide('assets/LevelData/level_2.json').mode, 'slot_expand_all', 'stable level 2 must declare mandatory all-row expansion');
assert.deepStrictEqual(readTutorialGuide('assets/LevelData/level_2.json').guideCopies, level2GuideCopies, 'stable level 2 must guide all seven accepted actions');
assert.deepStrictEqual(
    [level2Data.levelId, level2Data.boardWidth, level2Data.boardHeight, level2Data.timeLimit, level2Data.slotTotalCount],
    [2, 29, 23, 300, 440],
    'logical level 2 must own the complete former level 3 gameplay and settlement payload',
);
assert.deepStrictEqual(colorCounts('assets/LevelData/level_2.json', 'correctColorArr'), [[9, 96], [10, 106], [15, 136], [20, 102]], 'stable level 2 correct data must use exactly four approved colors');
assert.deepStrictEqual(colorCounts('assets/LevelData/level_2.json', 'initRandomColorArr'), [[9, 96], [10, 106], [15, 136], [20, 102]], 'stable level 2 initial data must use the same four-color population');
assert.deepStrictEqual(unplacedComponentSummary('assets/LevelData/level_2.json'), [[15, 48], [20, 48]], 'stable level 2 must contain exactly one 48-bean swap pair');
assert.deepStrictEqual(mismatchPairSummary('assets/LevelData/level_2.json'), [['15->20', 48], ['20->15', 48]], 'stable level 2 must reduce to three block transfers and seven normal taps including unlock');

assert.deepStrictEqual(slotPolicy('assets/LevelData/level_3.json'), {
    defaultRows: 2,
    freeUnlockRows: 0,
    adUnlockRows: 2,
}, 'stable level 3 must start with two rows and expose two progressive rewarded unlock rows');
assert.strictEqual(readTutorialGuide('assets/LevelData/level_3.json').mode, 'zoom', 'stable level 3 must declare the optional zoom hint');
assert.strictEqual(readTutorialGuide('assets/LevelData/level_3.json').subtitle, '也可以直接开始游戏', 'level 3 zoom copy must explicitly permit direct play');
assert.deepStrictEqual(readTutorialGuide('assets/LevelData/level_3.json').guideCopies, level3ZoomCopies, 'stable level 3 zoom hint must remain one-step and non-blocking');
assert.deepStrictEqual(
    [level3Data.levelId, level3Data.boardWidth, level3Data.boardHeight, level3Data.timeLimit, level3Data.slotTotalCount],
    [3, 12, 12, 300, 0],
    'logical level 3 must own the complete former level 2 gameplay and settlement payload',
);
assert.deepStrictEqual(
    [manifestByLevel.get(2)?.boardWidth, manifestByLevel.get(2)?.boardHeight, manifestByLevel.get(2)?.timeLimit, manifestByLevel.get(2)?.slotTotalCount],
    [29, 23, 300, 440],
    'generated level 2 manifest metadata must follow the swapped settlement payload',
);
assert.deepStrictEqual(
    [manifestByLevel.get(3)?.boardWidth, manifestByLevel.get(3)?.boardHeight, manifestByLevel.get(3)?.timeLimit, manifestByLevel.get(3)?.slotTotalCount],
    [12, 12, 300, 0],
    'generated level 3 manifest metadata must follow the swapped settlement payload',
);

for (const levelId of [2, 3, 4, 5]) {
    assert.strictEqual(readJson(`assets/LevelData/level_${levelId}.json`).timeLimit, 300, `level ${levelId} must use the five-minute early-level floor`);
    assert.strictEqual(manifestByLevel.get(levelId)?.timeLimit, 300, `level ${levelId} manifest must retain the same five-minute floor`);
}

const packageJson = read('package.json');
const postbuild = read('scripts/postbuild-wechat-minigame.js');
const retiredCdnToken = ['level', 'exp'].join('_');
assert.ok(!packageJson.toLowerCase().includes(retiredCdnToken), 'package scripts must not expose experiment CDN publishing');
assert.ok(!postbuild.toLowerCase().includes(retiredCdnToken), 'WeChat postbuild must not inject an experiment CDN URL');

console.log('stable-level-and-tutorial-routing.test.js passed');
