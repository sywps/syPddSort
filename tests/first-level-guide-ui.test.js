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

console.log('first-level-guide-ui.test.js passed');
