const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const boardZoom = read('assets/Scripts/Core/GameCtrlModules/BoardZoomControlModule.ts');
assert.ok(
    boardZoom.includes('shouldHideBoardZoomControlForCurrentLevel()'),
    'board zoom control must have a level-specific visibility gate',
);
assert.ok(
    boardZoom.includes('this.getActiveLogicalLevelId()'),
    'board zoom control visibility must use the active logical level',
);
assert.ok(
    boardZoom.includes('return Math.max(1, Math.floor(Number(logicalLevelId) || 1)) === 1;'),
    'board zoom control must be hidden on logical level 1',
);
assert.ok(
    boardZoom.includes('if (!this.syncBoardZoomControlVisibility()) return;'),
    'board zoom control refresh/activity must honor the visibility gate',
);

const tutorialGuide = read('assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts');
const settlementHud = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const gameScene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));
const singleLinePrompt = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'SingleLinePrompt');
const slotIntroPrompt = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'SlotIntroPrompt');
const emphasisNode = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'PromptLabelEmphasis');
assert.ok(singleLinePrompt && singleLinePrompt._active === false, 'single-line prompt variant must default inactive in Game.scene');
assert.ok(slotIntroPrompt && slotIntroPrompt._active === false, 'slot-intro prompt variant must default inactive in Game.scene');
assert.ok(emphasisNode && emphasisNode._active === false, 'experiment-only emphasis copy must default inactive in Game.scene');
assert.ok(
    tutorialGuide.includes("this.activateGuidePromptVariant(bubble, 'SingleLinePrompt')"),
    'ordinary starter guide must activate the scene-owned single-line variant',
);
assert.ok(
    !settlementHud.includes('lbl.fontSize = isLevel1Prompt')
        && !settlementHud.includes('bubbleUT.setContentSize(bubbleWidth, bubbleHeight)'),
    'settlement code must not rewrite scene-owned guide typography or bubble geometry',
);
assert.ok(
    tutorialGuide.includes('if (step === 0 || step === 2)'),
    'level 1 guide prompt must target the first and second board-pick steps',
);
assert.ok(
    tutorialGuide.includes('const colorId = step === 0 ? this._guideFirstColorId : this._guideSecondColorId;'),
    'level 1 step 0 prompt must follow the first-color board block',
);
assert.ok(
    tutorialGuide.includes('const targetGap = target.kind === \'slot\' ? 44 : 16;'),
    'slot and board guide prompts must keep separate target gaps',
);
assert.ok(
    tutorialGuide.includes('this.clampGuidePromptCenterY(bubble, desiredY)'),
    'target guide prompts must be positioned directly from the target bounds',
);
assert.ok(
    !tutorialGuide.includes('this.getGuidePromptCenterY(desiredY, bubbleHeight)'),
    'slot-target guide prompts must not be pulled back to the bottom default by generic avoidance',
);
assert.ok(
    !tutorialGuide.includes('Math.min(currentY, desiredY)'),
    'starter guide prompt must not stay at the bottom default for board targets',
);
const singleLineLabelNodeIndex = singleLinePrompt._children
    .map((ref) => ref.__id__)
    .find((index) => gameScene[index]?._name === 'PromptLabel');
const singleLineLabelNode = gameScene[singleLineLabelNodeIndex];
const singleLineLabel = gameScene.find((entry) => entry && entry.__type__ === 'cc.Label' && entry.node?.__id__ === singleLineLabelNodeIndex);
assert.ok(singleLineLabelNode && singleLineLabelNode._lpos.y === 18, 'single-line label must use the scene-owned visual center above the bubble tail');
assert.ok(singleLineLabel && singleLineLabel._fontSize === 44 && singleLineLabel._lineHeight === 54, 'single-line typography must be scene-owned');
assert.ok(
    gameplayView.includes('levelId === 1 ? 0.86'),
    'level 1 board should start slightly smaller than the default fit scale',
);

console.log('first-level-guide-ui.test.js passed');
