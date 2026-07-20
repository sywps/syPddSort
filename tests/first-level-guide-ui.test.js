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
const inlineEmphasisNames = [
    'PromptLabelInlineEmphasis',
    'PromptLabelPrimaryEmphasis',
    'PromptLabelSecondaryEmphasis',
];
const inlineEmphasisNodes = inlineEmphasisNames.map((name) => (
    gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === name)
));
const secondaryNode = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'PromptLabelSecondary');
function findSceneComponent(nodeIndex, type) {
    return gameScene.find((entry) => entry && entry.__type__ === type && entry.node?.__id__ === nodeIndex);
}
assert.ok(singleLinePrompt && singleLinePrompt._active === false, 'single-line prompt variant must default inactive in Game.scene');
assert.ok(slotIntroPrompt && slotIntroPrompt._active === false, 'slot-intro prompt variant must default inactive in Game.scene');
assert.ok(inlineEmphasisNodes.every((node) => node && node._active === false), 'inline emphasis labels must default inactive in Game.scene');
assert.ok(secondaryNode && secondaryNode._active === true, 'slot-intro secondary base label must remain active inside its inactive variant');
for (const node of inlineEmphasisNodes) {
    const index = gameScene.indexOf(node);
    const label = findSceneComponent(index, 'cc.Label');
    assert.ok(label && label._color.r === 255 && label._color.g === 77 && label._color.b === 90, `${node._name} must use the scene-owned red emphasis color`);
    assert.strictEqual(label._overflow, 0, `${node._name} must measure its marked copy with Overflow.NONE`);
}
const promptLabelComponents = [singleLinePrompt, slotIntroPrompt]
    .flatMap((variant) => variant._children.map((ref) => findSceneComponent(ref.__id__, 'cc.Label')))
    .filter(Boolean);
const allowedPromptColors = new Set(['113,98,162', '255,77,90']);
assert.ok(
    promptLabelComponents.every((label) => allowedPromptColors.has(`${label._color.r},${label._color.g},${label._color.b}`)),
    'all L1-L3 prompt labels must use only the scene-owned base purple or emphasis red',
);
assert.ok(
    tutorialGuide.includes("this.activateGuidePromptVariant(bubble, 'SingleLinePrompt')"),
    'ordinary starter guide must activate the scene-owned single-line variant',
);
assert.ok(tutorialGuide.includes('getGuideCopyParts') && tutorialGuide.includes('applyGuideCopyToLabel'), 'runtime must strip copy markers and bind scene-owned inline emphasis labels');
assert.ok(
    tutorialGuide.includes('fitSingleLineGuidePromptToText')
        && tutorialGuide.includes('const horizontalPadding = Math.max(0, promptMaxWidth - labelMaxWidth);')
        && tutorialGuide.includes('Math.ceil(renderedTextWidth + horizontalPadding)')
        && tutorialGuide.includes('bubbleBackgroundTransform.setContentSize(fittedWidth, bubbleBackgroundTransform.contentSize.height);'),
    'single-line guide background must fit rendered copy plus scene-derived padding within the scene-owned maximum',
);
assert.ok(
    tutorialGuide.includes('const renderedTextWidth = this.applyGuideCopyToLabel(lbl, emphasisLabel, copy);')
        && tutorialGuide.includes('this.fitSingleLineGuidePromptToText(singleLine, lbl, renderedTextWidth);'),
    'all L1-L3 starter copy must drive the shared content-fit background',
);
assert.ok(!tutorialGuide.includes("new Node('PromptLabel"), 'runtime must not create stable prompt labels');
assert.ok(!tutorialGuide.includes('baseLabel.actualFontSize'), 'inline emphasis sizing must not use Cocos system-font actualFontSize, which is texture-scaled in Browser');
assert.ok(!tutorialGuide.includes('shrinkScale'), 'runtime must not shrink marked copy per level or per step');
assert.ok(!tutorialGuide.includes('emphasisLabel.fontSize =') && !tutorialGuide.includes('emphasisLabel.lineHeight ='), 'runtime must not rewrite scene-owned emphasis typography');
assert.ok(tutorialGuide.includes('restoreGuideBaseLabelColor(baseLabel)'), 'normal prompt binding must restore the scene-owned base color');
assert.ok(!tutorialGuide.includes('#D45A38') && !tutorialGuide.includes('#FF4444'), 'wrong-target feedback must not introduce a third prompt color');
assert.ok(
    tutorialGuide.includes('const ZOOM_HINT_HAND_TARGET_Y_OFFSET = -180;'),
    'the L3 pinch reminder must be moved visibly below the board center',
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
const singleLineLabel = findSceneComponent(singleLineLabelNodeIndex, 'cc.Label');
const singleLineLabelTransform = findSceneComponent(singleLineLabelNodeIndex, 'cc.UITransform');
const singleLinePromptTransform = findSceneComponent(gameScene.indexOf(singleLinePrompt), 'cc.UITransform');
const singleLineBubbleNodeIndex = singleLinePrompt._children
    .map((ref) => ref.__id__)
    .find((index) => gameScene[index]?._name === 'BubbleBg');
const singleLineBubbleTransform = findSceneComponent(singleLineBubbleNodeIndex, 'cc.UITransform');
const singleLineEmphasisLabel = findSceneComponent(gameScene.indexOf(inlineEmphasisNodes[0]), 'cc.Label');
assert.ok(singleLineLabelNode && singleLineLabelNode._lpos.y === 18, 'single-line label must use the scene-owned visual center above the bubble tail');
assert.ok(singleLineLabel && singleLineLabel._fontSize === 40 && singleLineLabel._lineHeight === 50, 'single-line typography must be scene-owned');
assert.ok(singleLineLabel && singleLineLabel._overflow === 1, 'single-line base label must keep fixed typography with Overflow.CLAMP');
assert.ok(singleLineLabelTransform && singleLineLabelTransform._contentSize.width === 660, 'single-line label maximum must remain scene-owned and fit current L1-L3 copy without SHRINK');
assert.ok(singleLinePromptTransform && singleLinePromptTransform._contentSize.width === 700, 'single-line prompt maximum width must remain scene-owned');
assert.ok(singleLineBubbleTransform && singleLineBubbleTransform._contentSize.width === 700, 'single-line bubble must retain the scene-owned default/max width before dynamic copy binding');
assert.ok(
    singleLineEmphasisLabel
        && singleLineEmphasisLabel._fontFamily === singleLineLabel._fontFamily
        && singleLineEmphasisLabel._fontSize === singleLineLabel._fontSize
        && singleLineEmphasisLabel._lineHeight === singleLineLabel._lineHeight
        && singleLineEmphasisLabel._isBold === singleLineLabel._isBold,
    'base and red emphasis text must share one scene-owned font contract',
);
assert.ok(
    gameplayView.includes('levelId === 1 ? 0.86'),
    'level 1 board should start slightly smaller than the default fit scale',
);

console.log('first-level-guide-ui.test.js passed');
