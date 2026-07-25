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
const guideLeaderboard = read('assets/Scripts/Core/GameCtrlModules/GuideLeaderboardModule.ts');
const settlementHud = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const gameScene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));
const singleLinePrompt = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'SingleLinePrompt');
const slotIntroPrompt = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'SlotIntroPrompt');
const inlineEmphasisNames = [
    'PromptLabelInlineEmphasis',
    'PromptLabelInlineEmphasisBlue',
    'PromptLabelInlineEmphasisAction',
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
const expectedEmphasisColors = new Map([
    ['PromptLabelInlineEmphasis', '255,77,90'],
    ['PromptLabelInlineEmphasisBlue', '74,125,255'],
    ['PromptLabelInlineEmphasisAction', '217,130,0'],
    ['PromptLabelPrimaryEmphasis', '255,77,90'],
    ['PromptLabelSecondaryEmphasis', '255,77,90'],
]);
for (const node of inlineEmphasisNodes) {
    const index = gameScene.indexOf(node);
    const label = findSceneComponent(index, 'cc.Label');
    assert.strictEqual(
        label && `${label._color.r},${label._color.g},${label._color.b}`,
        expectedEmphasisColors.get(node._name),
        `${node._name} must use its scene-owned semantic emphasis color`,
    );
    assert.strictEqual(label._overflow, 0, `${node._name} must measure its marked copy with Overflow.NONE`);
}
const promptLabelComponents = [singleLinePrompt, slotIntroPrompt]
    .flatMap((variant) => variant._children.map((ref) => findSceneComponent(ref.__id__, 'cc.Label')))
    .filter(Boolean);
const allowedPromptColors = new Set(['113,98,162', '255,77,90', '74,125,255', '217,130,0']);
assert.ok(
    promptLabelComponents.every((label) => allowedPromptColors.has(`${label._color.r},${label._color.g},${label._color.b}`)),
    'all L1-L3 prompt labels must use only the scene-owned base or semantic emphasis colors',
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
    tutorialGuide.includes('const defaultTargetGap = target.kind === \'slot\' ? 44 : 16;')
        && tutorialGuide.includes('const LEVEL_2_FIRST_SLOT_PLACE_PROMPT_GAP = 20;'),
    'slot and board guide prompts must keep separate target gaps',
);
assert.ok(
    tutorialGuide.includes('this.clampGuidePromptCenterY(bubble, desiredY)'),
    'target guide prompts must be positioned directly from the target bounds',
);
assert.ok(
    tutorialGuide.includes('const GUIDE_PROMPT_TOP_HUD_SAFE_INSET = 72;')
        && tutorialGuide.includes('const maxCenterY = visibleHalfH - bubbleHeight / 2 - GUIDE_PROMPT_TOP_HUD_SAFE_INSET;'),
    'guide prompts must reserve the authored top HUD band on tablet and short-aspect layouts',
);
assert.ok(
    tutorialGuide.includes("if (target.kind === 'board' && clampedAboveY < desiredY - 0.5)")
        && tutorialGuide.includes('const boardBounds = this.getGuidePromptBoardVisualBounds(bubble);')
        && tutorialGuide.includes('const belowBoardY = boardBounds.bottom - defaultTargetGap - bubbleHeight / 2;'),
    'board prompts that cannot fit above the target without entering the HUD must move below the board',
);
assert.ok(
    !tutorialGuide.includes('this.getGuidePromptCenterY(desiredY, bubbleHeight)'),
    'slot-target guide prompts must not be pulled back to the bottom default by generic avoidance',
);
assert.ok(
    !tutorialGuide.includes('Math.min(currentY, desiredY)'),
    'starter guide prompt must not stay at the bottom default for board targets',
);
assert.ok(
    guideLeaderboard.includes('const overlapsTarget =')
        && guideLeaderboard.includes('const bubbleTopWorld = bubbleUT.convertToWorldSpaceAR(')
        && guideLeaderboard.includes('desiredY = bubbleTop.y + assistHalfH + 12;'),
    'the 12-second demo control must move above the bubble when its preferred position would cover the active target',
);
assert.ok(
    guideLeaderboard.includes("const dimOpacity = state === 'preview' ? 112 : (state === 'reinforce' ? 172 : 132);")
        && guideLeaderboard.includes('showGuideDimMask(alphaValue: number = 132')
        && guideLeaderboard.includes('Math.min(196, Math.round(alphaValue))')
        && settlementHud.includes('? 184 : 132')
        && settlementHud.includes("if (this._guideMode !== 'zoom')"),
    'target emphasis must use a strong cutout dim mask instead of a decorative outer ring',
);
assert.ok(
    !tutorialGuide.includes("this.showGuideTapFeedback?.(worldPos, 'wrong')")
        && tutorialGuide.includes('this.startGuideWrongTargetHandPulse?.(this._guideHand);')
        && guideLeaderboard.includes('startGuideWrongTargetHandPulse(hand: Node'),
    'wrong taps must redirect attention through a faster correct-hand pulse, not a ripple at the wrong coordinate',
);
assert.ok(
    settlementHud.includes('function stretchRuntimeUiNodeToParent(node: Node): void')
        && (settlementHud.match(/stretchRuntimeUiNodeToParent\(this\._guideLayer\);/g) || []).length >= 2
        && (settlementHud.match(/stretchRuntimeUiNodeToParent\(this\._guideMask\);/g) || []).length >= 2,
    'runtime guide layers must stay stretched to OverlayRoot after browser or device-preview resizing',
);
assert.ok(
    settlementHud.includes('layer.on(Node.EventType.SIZE_CHANGED, this.refreshGuideLayerViewportLayout, this);')
        && settlementHud.includes('this.showGuideDimMask?.(Math.max(0, Number(opacity?.opacity) || 132), false);'),
    'viewport resizing must recompute all four dim-mask panels instead of leaving stale bright strips',
);
assert.ok(
    !guideLeaderboard.includes('new Color(255, 205, 74'),
    'the tutorial target must not render the rejected yellow outer ring',
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
