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

const levelExpSourceDir = 'level_exp_data/level_exp';
const bootstrapLevel1Path = 'assets/BootstrapBundle/LevelData/level_1.json';

const experimentUrlParam = read('assets/Scripts/Core/ExperimentUrlParam.ts');
const cocosSpec = read('docs/cocos-ai-code-ai-collaboration-spec-v1.md');
assert.ok(experimentUrlParam.includes("params.get('ab')"), 'experiment overrides must use the combined ab parameter');
assert.ok(experimentUrlParam.includes("split(';')"), 'combined ab parameter must support multiple experiments');
assert.ok(experimentUrlParam.includes("entry.split(',')"), 'combined ab parameter entries must use experimentId,bucket');
assert.ok(!cocosSpec.includes('level_exp'), 'temporary level_exp details must not live in v1 spec');
assert.ok(!cocosSpec.includes('tutorial_exp'), 'temporary tutorial_exp details must not live in v1 spec');

const analytics = read('assets/Scripts/Core/AnalyticsMgr.ts');
assert.ok(analytics.includes("TUTORIAL_EXPERIMENT_ID = 'tutorial_exp'"), 'tutorial experiment id must be tutorial_exp');
assert.ok(analytics.includes("type TutorialExperimentBucket = 'A' | 'B' | 'C' | 'D' | 'NULL'"), 'tutorial experiment must keep A/B/C/D buckets plus NULL before openid');
assert.ok(analytics.includes("hashBucket < 25 ? 'A'"), 'tutorial experiment must allocate bucket A');
assert.ok(analytics.includes("hashBucket < 50 ? 'B'"), 'tutorial experiment must allocate bucket B');
assert.ok(analytics.includes("hashBucket < 75 ? 'C'"), 'tutorial experiment must allocate bucket C');
assert.ok(analytics.includes('shouldShowTutorialSkipGuidePrompt'), 'tutorial experiment C/D gate must only name the skip-guide prompt behavior');
assert.ok(analytics.includes("this.tutorialExperiment.bucket === 'C' || this.tutorialExperiment.bucket === 'D'"), 'tutorial skip-guide prompt treatment must be C/D');
assert.ok(analytics.includes('onTutorialExperimentAssignmentChanged'), 'tutorial bucket changes must be observable after async openid resolution');
assert.ok(analytics.includes('notifyTutorialExperimentAssignmentChanged'), 'tutorial bucket changes must notify prompt sync listeners');

const tutorialGuide = read('assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts');
assert.ok(!tutorialGuide.includes('AnalyticsMgr.inst.isTutorialExperimentTreatment()'), 'starter guide auto-correct must not be gated by tutorial buckets after full rollout');
assert.ok(!tutorialGuide.includes('handleTutorialRelaxedTap'), 'old treatment-only relaxed tap handler must be removed');
assert.ok(!tutorialGuide.includes("label.string = '跳过引导'"), 'skip-guide prompt copy must stay scene-owned');
assert.ok(tutorialGuide.includes('handleStarterTutorialAutoCorrectTap'), 'starter guide auto-correct must be the default handler');
assert.ok(tutorialGuide.includes('AnalyticsMgr.inst.shouldShowTutorialSkipGuidePrompt()'), 'tutorial buckets must only gate skip-guide prompt');

const gameScene = readJson('assets/BootstrapBundle/Scenes/Game.scene');
const skipPrompt = gameScene.find((entry) => entry && entry._name === 'TutorialSkipGuidePrompt');
assert.ok(skipPrompt, 'Game.scene must contain Cocos-owned TutorialSkipGuidePrompt');
assert.strictEqual(skipPrompt._active, false, 'TutorialSkipGuidePrompt must be inactive by default');
assert.ok(gameScene.some((entry) => entry && entry._string === '跳过引导'), 'TutorialSkipGuidePrompt label must be scene-owned');

const levelCdn = read('assets/Scripts/Core/LevelDataCdnService.ts');
assert.ok(levelCdn.includes("export type LevelExperimentBucket = 'A' | 'B' | 'C' | 'D' | 'NULL'"), 'level experiment must expose A/B/C/D buckets plus NULL before openid');
assert.ok(levelCdn.includes("LS_ANALYTICS_OPENID = 'pdd.analytics.openid.v1'"), 'level experiment must share the cached openid seed with analytics');
assert.ok(levelCdn.includes("return this.buildLevelExperimentAssignment('NULL', 'missing_identity')"), 'level experiment must keep missing identity in NULL');
assert.ok(!levelCdn.includes('installId'), 'level experiment must not bucket users by local installId');
assert.ok(levelCdn.includes('const primaryLevel = await this.loadLevelFromContext(context, normalizedLevelId, normalizedPrefix, true);'), 'foreground loadLevel must use the foreground CDN load path');
assert.ok(levelCdn.includes('const manifest = await this.getLiveManifest(context, foregroundLoad);'), 'foreground CDN load path must pass retry intent into manifest loading');
assert.ok(levelCdn.includes('if (this.isLiveManifestCoolingDown(state) && !foregroundLoad) return null;'), 'only background prefetch should honor manifest failure cooldown');
assert.ok(!levelCdn.includes('LEVEL_EXPERIMENT_BUCKET_C_RANGE'), 'level experiment bucket C must not hard-code a client-side level range');
assert.ok(!levelCdn.includes('LEVEL_EXPERIMENT_BUCKET_D_RANGE'), 'level experiment bucket D must not hard-code a client-side level range');
assert.ok(!levelCdn.includes('getLevelExperimentActiveRange'), 'level experiment range must be owned by the manifest/pack index, not client code');
assert.ok(levelCdn.includes("bucket === 'C' || bucket === 'D' ? 'treatment' : 'baseline'"), 'level experiment NULL/A/B must remain stable and C/D treatment');
assert.ok(levelCdn.includes("activeRange: assignment.group === 'treatment' ? 'manifest' : null"), 'level experiment diagnostics must show that C/D range is manifest-owned');
assert.ok(levelCdn.includes("return assignment.group === 'treatment';"), 'level experiment C/D buckets must use experiment CDN for mainline levels');

const session = read('assets/Scripts/Core/GameplaySessionController.ts');
const sceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const boardInput = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const slotOnboardingPolicy = read('assets/Scripts/Core/SlotOnboardingPolicy.ts');
const themePanelFlow = read('assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts');
const slotUi = read('assets/Scripts/Core/GameplaySlotUiController.ts');
const tutorialGuideModule = read('assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts');
assert.ok(!session.includes('LevelDataCdnService.inst.getLevelExperimentAssignment()'), 'guide behavior must not branch on level experiment assignment');
assert.ok(!session.includes('tutorialGateLevelId === 2 && !isLevelExperimentTreatment'), 'level 2 old slot guide must not be tied to level experiment baseline');
assert.ok(!session.includes('tutorialGateLevelId === 3 && isLevelExperimentTreatment'), 'level 3 slot intro must not be limited to level experiment treatment buckets');
assert.ok(!session.includes("'level_2'"), 'GameplaySessionController must not start the old level 2 tutorial');
assert.ok(session.includes('tutorialGateLevelId === 3 && useMainlineSlotGuideFlow'), 'all mainline level experiment buckets must use the level 3 slot intro guide flow');
assert.ok(session.includes('applyLevelExperimentGuideSlotPolicy'), 'level experiment guide flow must decouple guide slot policy from CDN routing');
assert.ok(session.includes('levelId === 2') && session.includes('showSlotUnlockGuide: false'), 'level 2 must suppress the old slot unlock guide for all buckets');
assert.ok(session.includes("unlockMode: 'free'"), 'level 3 slot intro must force a free unlock row even for stable CDN buckets');
assert.ok(session.includes('slotPolicy.unlockAllRowsAtOnce'), 'unlock-all row policy must start from the current unlocked rows instead of rendering all target rows immediately');
assert.ok(session.includes('Math.min(slotPolicy.rowCount, Math.max(1, slotPolicy.unlockedRows) + 1)'), 'unlock-all row policy must render the default unlocked row plus one locked preview row');
assert.ok(session.includes('const shouldStartZoomGuide'), 'level 2 zoom guide must use an explicit startup gate');
assert.ok(session.includes("tutorialGuideMode === 'zoom'") && session.includes('tutorialGateLevelId === 2 && useMainlineSlotGuideFlow'), 'mainline level 2 must start the zoom guide even if imported JSON is stale');
assert.ok(session.includes("title: '双指拖动可放大缩小图案'"), 'level 2 zoom guide must use the final single-line prompt copy');
assert.ok(session.includes("subtitle: ''"), 'level 2 zoom guide must not render the old second prompt line');
assert.ok(session.includes('autoCloseSeconds: 0'), 'level 2 zoom guide must not auto-close before the player actually zooms');
assert.ok(boardInput.includes('Math.abs(this.boardViewport.scale - prevScale) > 0.01'), 'pinch guide must close after the board scale actually changes');
assert.ok(slotOnboardingPolicy.includes('unlockAllRowsAtOnce'), 'slot policy must support one-click all-row unlocks for experiment level 3');
assert.ok(slotUi.includes('getAllRowsUnlockTargetRowCount'), 'slot UI must preserve unlock-all target row count separately from the current visible row count');
assert.ok(slotUi.includes('hasPendingAllRowsUnlock'), 'slot UI must keep the add button active when unlock-all rows are pending');
assert.ok(slotUi.includes('runtime.slotModel.expand(SLOTS_PER_ROW * rowsToAdd)'), 'slot UI must expand all pending rows in one action');
assert.ok(slotUi.includes('row >= runtime.slotUnlockedRows'), 'slot UI must visually lock every row above the unlocked row count');
assert.ok(slotUi.includes('LOCKED_SLOT_PREVIEW_OPACITY'), 'locked slot preview grooves must remain visible in the intro slot panel');
assert.ok(tutorialGuideModule.includes('styleLevelExpSlotIntroGuidePrompt'), 'level 3 slot intro must use a dedicated two-line prompt style');
assert.ok(tutorialGuideModule.includes("new Color('#FF4D5A')"), 'level 3 slot intro must render the free unlock line in red');
assert.ok(tutorialGuideModule.includes('PromptLabelEmphasis'), 'level 3 slot intro must render the red emphasis line as a separate label');
assert.ok(tutorialGuideModule.includes('const bubbleHeight = 158'), 'level 3 slot intro bubble must keep both lines above the tail');
assert.ok(tutorialGuideModule.includes('lbl.node.setPosition(0, 36, 0)'), 'level 3 slot intro primary copy must sit inside the bubble body');
assert.ok(tutorialGuideModule.includes('emphasisNode.setPosition(0, -8, 0)'), 'level 3 slot intro red copy must sit above the bubble tail');
assert.ok(themePanelFlow.includes("this.requireCanvasUiRoot('OverlayRoot')"), 'pinch guide must attach to OverlayRoot so it appears above gameplay');
assert.ok(themePanelFlow.includes('layer.addComponent(BlockInputEvents)'), 'level 2 pinch guide must consume the first tap so any tap can dismiss the guide');
assert.ok(themePanelFlow.includes('this.closePinchGuide();'), 'level 2 pinch guide must close on tap');
assert.ok(themePanelFlow.includes("const requiredFrames = ['guide_hand', 'guide_bubble_frame']"), 'pinch guide must use the shared hand art and guide bubble frame');
assert.ok(themePanelFlow.includes('const bubbleY = Math.min(visibleHalfH - 150, 430)'), 'pinch guide prompt must sit higher like the reference layout');
assert.ok(themePanelFlow.includes('bubbleText.length * 40 + 120'), 'single-line pinch guide bubble must fit the full final prompt copy inside the frame');
assert.ok(themePanelFlow.includes('const bubbleHeight = hasSubtitle ? 132 : 128'), 'single-line pinch guide bubble must leave room for the bubble tail without pushing text outside');
assert.ok(themePanelFlow.includes('bubbleWidth - 112'), 'single-line pinch guide text must keep enough horizontal padding inside the frame');
assert.ok(themePanelFlow.includes('hasSubtitle ? 18 : 22'), 'single-line pinch guide text must sit inside the bubble body above the tail');
assert.ok(themePanelFlow.includes("new Color('#7162A2')"), 'level 2 pinch guide text must use the same light purple as the level 3 prompt');
assert.ok(themePanelFlow.includes('const gestureCenterY = bubble.position.y - 480'), 'pinch guide hands must sit in the lower board area like the reference layout');
assert.ok(themePanelFlow.includes('const farGap = 250'), 'pinch guide hands must spread wider like the reference layout');
assert.ok(themePanelFlow.includes("createPinchHand('PinchGuideLeftHand', true"), 'pinch guide must render a mirrored left hand');
assert.ok(themePanelFlow.includes("createPinchHand('PinchGuideRightHand', false"), 'pinch guide must render the normal right hand');
assert.ok(!themePanelFlow.includes("new Node('PinchHand')"), 'pinch guide must not fall back to the old graphics-only circle gesture');
assert.ok(session.includes('LevelDataCdnService.inst.getLevelExperimentEventContext'), 'analytics context must prefer active level experiment bucket');
assert.ok(sceneRuntime.includes('ensureTutorialExperimentPromptSync'), 'game runtime must subscribe to tutorial bucket changes');
assert.ok(sceneRuntime.includes('this.runtime.syncTutorialSkipGuidePrompt?.()'), 'tutorial bucket changes must resync the skip-guide prompt');

assert.deepStrictEqual(slotPolicy('assets/LevelData/level_1.json'), {
    defaultRows: 1,
    freeUnlockRows: 0,
    adUnlockRows: 0,
}, 'stable level 1 guide level must keep 1/0/0 slot policy');
assert.deepStrictEqual(colorCounts('assets/LevelData/level_1.json', 'correctColorArr'), [[10, 12], [13, 12]], 'stable level 1 correct colors must be red/blue for A/B/default rollout');
assert.deepStrictEqual(colorCounts('assets/LevelData/level_1.json', 'initRandomColorArr'), [[10, 12], [13, 12]], 'stable level 1 init colors must be red/blue for A/B/default rollout');
assert.strictEqual(readTutorialGuide('assets/LevelData/level_1.json').mode, 'level_1_red_blue', 'stable level 1 must declare red/blue guide copy mode');
assert.deepStrictEqual(colorCounts(bootstrapLevel1Path, 'correctColorArr'), [[10, 12], [13, 12]], 'bootstrap level 1 correct colors must stay aligned with stable red/blue data');
assert.deepStrictEqual(colorCounts(bootstrapLevel1Path, 'initRandomColorArr'), [[10, 12], [13, 12]], 'bootstrap level 1 init colors must stay aligned with stable red/blue data');
assert.strictEqual(readTutorialGuide(bootstrapLevel1Path).mode, 'level_1_red_blue', 'bootstrap level 1 must declare red/blue guide copy mode');

const level3SlotIntroCopies = [
    '\u8bd5\u8bd5\u589e\u52a0\u653e\u7f6e\u533a\u7a7a\u95f4\uff0c\u5b58\u653e\u66f4\u591a\u7684\u94bb\u77f3',
    '\u672c\u6b21\u76f4\u63a5\u514d\u8d39\u5168\u90e8\u89e3\u9501',
];

assert.deepStrictEqual(slotPolicy('assets/LevelData/level_2.json'), {
    defaultRows: 2,
    freeUnlockRows: 0,
    adUnlockRows: 0,
}, 'stable level 2 must use zoom-guide slot policy for A/B/default rollout');
assert.strictEqual(readTutorialGuide('assets/LevelData/level_2.json').mode, 'zoom', 'stable level 2 must declare zoom tutorial mode');
assert.strictEqual(readTutorialGuide('assets/LevelData/level_2.json').title, '双指拖动可放大缩小图案', 'stable level 2 zoom guide copy must use the final single-line prompt');
assert.strictEqual(readTutorialGuide('assets/LevelData/level_2.json').subtitle, '', 'stable level 2 zoom guide subtitle must be empty');

assert.deepStrictEqual(slotPolicy('assets/LevelData/level_3.json'), {
    defaultRows: 1,
    freeUnlockRows: 3,
    adUnlockRows: 0,
    unlockAllRowsAtOnce: true,
}, 'stable level 3 must start with one row and unlock the remaining three rows with one free action');
assert.strictEqual(readTutorialGuide('assets/LevelData/level_3.json').mode, 'slot_expand_all', 'stable level 3 must declare all-row slot intro mode');
assert.deepStrictEqual(readTutorialGuide('assets/LevelData/level_3.json').guideCopies, level3SlotIntroCopies, 'stable level 3 must use the two-line competitor-style slot intro copy');
assert.deepStrictEqual(unplacedComponentSummary('assets/LevelData/level_3.json'), [[3, 48], [6, 48], [9, 48], [10, 48], [14, 48], [15, 48], [20, 48]], 'stable level 3 must keep only seven 48-bean main disorder blocks');

assert.deepStrictEqual(slotPolicy(`${levelExpSourceDir}/level_1.json`), {
    defaultRows: 1,
    freeUnlockRows: 0,
    adUnlockRows: 0,
}, 'experiment level 1 must keep first-level guide slot policy');
assert.deepStrictEqual(colorCounts(`${levelExpSourceDir}/level_1.json`, 'correctColorArr'), [[10, 12], [13, 12]], 'experiment level 1 correct colors must be red/blue');
assert.deepStrictEqual(colorCounts(`${levelExpSourceDir}/level_1.json`, 'initRandomColorArr'), [[10, 12], [13, 12]], 'experiment level 1 init colors must be red/blue');
assert.strictEqual(readTutorialGuide(`${levelExpSourceDir}/level_1.json`).mode, 'level_1_red_blue', 'experiment level 1 must declare red/blue guide copy mode');

assert.deepStrictEqual(slotPolicy(`${levelExpSourceDir}/level_2.json`), {
    defaultRows: 2,
    freeUnlockRows: 0,
    adUnlockRows: 0,
}, 'experiment level 2 must open two slot rows and avoid old unlock-slot teaching');
assert.strictEqual(readTutorialGuide(`${levelExpSourceDir}/level_2.json`).mode, 'zoom', 'experiment level 2 must declare zoom tutorial mode');
assert.strictEqual(readTutorialGuide(`${levelExpSourceDir}/level_2.json`).title, '双指拖动可放大缩小图案', 'experiment level 2 zoom guide copy must use the final single-line prompt');
assert.strictEqual(readTutorialGuide(`${levelExpSourceDir}/level_2.json`).subtitle, '', 'experiment level 2 zoom guide subtitle must be empty');

assert.deepStrictEqual(slotPolicy(`${levelExpSourceDir}/level_3.json`), {
    defaultRows: 1,
    freeUnlockRows: 3,
    adUnlockRows: 0,
    unlockAllRowsAtOnce: true,
}, 'experiment level 3 must start with one row and unlock the remaining three rows with one free action');
assert.strictEqual(readTutorialGuide(`${levelExpSourceDir}/level_3.json`).mode, 'slot_expand_all', 'experiment level 3 must declare all-row slot intro mode');
assert.deepStrictEqual(readTutorialGuide(`${levelExpSourceDir}/level_3.json`).guideCopies, level3SlotIntroCopies, 'experiment level 3 must use the two-line competitor-style slot intro copy');
assert.deepStrictEqual(unplacedComponentSummary(`${levelExpSourceDir}/level_3.json`), [[3, 48], [6, 48], [9, 48], [10, 48], [14, 48], [15, 48], [20, 48]], 'experiment level 3 must keep only seven 48-bean main disorder blocks');

for (let level = 1; level <= 3; level++) {
    assert.ok(fs.existsSync(path.join(root, `${levelExpSourceDir}/level_${level}.json`)), `experiment level ${level} data must exist`);
    const policy = slotPolicy(`${levelExpSourceDir}/level_${level}.json`);
    assert.ok(policy && typeof policy === 'object', `experiment level ${level} must declare slotPolicy`);
}

console.log('ab-experiment-routing.test.js passed');
