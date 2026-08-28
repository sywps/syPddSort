const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
).replace(/\r\n/g, '\n');
const openingGuideStart = source.indexOf('private showOpeningTargetGuideAt(');
const openingGuideEnd = source.indexOf('private clearOpeningGuideNodes()', openingGuideStart);
const openingGuideSource = source.slice(openingGuideStart, openingGuideEnd);
const openingPatternStart = source.indexOf('private prepareOpeningPatternShuffle()');
const openingPatternEnd = source.indexOf('private cancelOpeningPatternShuffle(', openingPatternStart);
const openingPatternSource = source.slice(openingPatternStart, openingPatternEnd);

assert.ok(
    source.includes('if (logicalLevelId === 1)')
        && source.includes("const copy = this.openingGuideLevelOneStep === 0 ? '点击红色豆豆' : '再点蓝色豆豆';")
        && source.includes('this.openingGuideLevelOneCells.length >= 2'),
    'mainline level 1 must restore a two-step red-then-blue board gesture guide',
);
assert.ok(
    source.includes('this.handleBoardTap(cell.row, cell.col);')
        && source.includes('this.openingGuideLevelOneStep += 1;')
        && source.includes('this.showLevelOneBoardGuideStep(parent);'),
    'the first accepted board tap must advance to the second gesture before dismissing the guide',
);
assert.ok(
    source.includes('const targetCells = this.rules?.cells.filter((item) => !item.locked && item.current === targetColor)')
        && source.includes('minX = Math.min(minX, bounds.xMin);')
        && source.includes('maxX = Math.max(maxX, bounds.xMax);')
        && source.includes('targetWidth,')
        && source.includes('targetHeight,'),
    'each level-1 guide frame must enclose every bean of the active red or blue color',
);
assert.ok(
    source.includes('if (this.inputLocked) {')
        && source.includes('this.handleOpeningGuideRootTap(event);')
        && source.includes('cell.current !== targetColor')
        && source.includes('this.onOpeningGuideLevelOneTap(event);'),
    'real board touches on any highlighted same-color bean must pass through the opening guide gate',
);
assert.ok(
    source.includes("guideName === 'PchLevelTwoSpeedGuide'")
        && source.includes('? this.speedButton')
        && source.includes('this.onOpeningGuideDoubleSpeed(event);')
        && source.includes("guideName === 'PchLevelThreeCapacityGuide' ? this.adButton : null")
        && source.includes('this.runtime.normalizeGameplayUiPosition(rawPos)')
        && source.includes('hitPositions.some((position) => bounds.contains(position))'),
    'locked opening-guide touches must route through the real 2X and AD +12 target bounds',
);
assert.ok(
    source.includes("logicalLevelId === 2 && this.speedButton?.isValid")
        && source.includes("'PchLevelTwoSpeedGuide'")
        && source.includes("'点击开启两倍速'"),
    'mainline level 2 must guide the 2x-speed button instead of capacity expansion',
);
assert.ok(
    source.includes('this.setManualSpeedMultiplier(2);')
        && source.includes('this.refreshSpeedButtonState();')
        && source.includes('this.dismissOpeningGuide();'),
    'the level-2 target tap must deterministically enable 2x speed before gameplay starts',
);
assert.ok(
    source.includes("logicalLevelId === 3 && this.adButton?.isValid")
        && source.includes("'PchLevelThreeCapacityGuide'")
        && source.includes("'点击广告按钮增加 12 个空位'"),
    'mainline level 3 must guide the capacity ad button before gameplay starts',
);
assert.ok(
    source.includes("const expanded = this.expandCapacity('guide_free');")
        && source.includes('if (!expanded) return;')
        && !source.includes('onOpeningGuideWatchAd'),
    'the guided level-3 capacity grant must expand directly without requesting an ad',
);
assert.ok(
    source.includes("this.makeNode('OpeningGuideTapTarget', parent")
        && source.includes("getChildByName('GuideHandSingle')")
        && source.includes('const hand = instantiate(sourceHand);')
        && source.includes('this.openingGuideTarget.on(Node.EventType.TOUCH_START, onTargetTap, this)')
        && !source.includes('this.openingGuide.on(Node.EventType.TOUCH_END, this.handleOpeningGuideRootTap, this)')
        && !source.includes('this.openingGuideTarget.addComponent(Button)'),
    'the highlighted target must accept WeChat touch-start directly without turning the full guide surface into an input blocker',
);
assert.ok(
    source.includes("if (this.openingGuide?.name === 'PchLevelTwoSpeedGuide')")
        && source.includes("if (this.openingGuide?.name === 'PchLevelThreeCapacityGuide')"),
    'the real speed and capacity buttons must retain a direct route through their active opening guides',
);
assert.ok(
    openingGuideStart >= 0
        && openingGuideEnd > openingGuideStart
        && openingPatternStart >= 0
        && openingPatternEnd > openingPatternStart
        && !openingGuideSource.includes('this.inputLocked = true;')
        && !openingGuideSource.includes('this.inputLocked = false;')
        && !openingPatternSource.includes('this.inputLocked = true;')
        && !openingPatternSource.includes('this.inputLocked = false;'),
    'opening-pattern and feature guides must not own the global gameplay input lock',
);
assert.ok(
    source.includes('private onRootTouchStart(event: any): void {\n        if (this.inputLocked) return;')
        && source.includes('private onRootTouchMove(event: any): void {\n        if (this.inputLocked) return;')
        && source.includes('private onRootTouchCancel(event: any): void {\n        if (this.inputLocked) return;'),
    'locked opening guides must not leak touch lifecycle events into board gesture state',
);
assert.ok(
    source.includes('if (!this.rules || this.runtime.isGameEnd || this.openingGuide?.isValid) return;'),
    'the conveyor must remain paused until the required opening guide tap succeeds',
);
assert.ok(
    source.includes("this.runtime.runRewardedGrant('pch_conveyor_expand'"),
    'normal capacity-button taps after the guide must retain the existing rewarded-ad path',
);

console.log('pch-level2-capacity-guide.test.js passed');
