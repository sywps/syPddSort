const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
).replace(/\r\n/g, '\n');

assert.ok(
    source.includes('if (logicalLevelId === 1)')
        && source.includes("? '点击白色豆豆'")
        && source.includes(": '再点击蓝色豆豆';")
        && source.includes('this.openingGuideLevelOneCells.length >= 2'),
    'mainline level 1 must retain the approved concise color-specific copy',
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
    'each level-1 guide target must cover every bean of the active color',
);
assert.ok(
    !source.includes('ring.strokeColor = new Color(255, 236, 82, 255)')
        && !source.includes('ring.roundRect(-(targetWidth + 20) / 2'),
    'opening guides for levels 1-3 must not draw a yellow target frame',
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
        && source.includes('bounds.contains(rawPos)')
        && !source.includes('normalizeGameplayUiPosition')
        && !source.includes('hitPositions'),
    'locked opening-guide touches must use one Cocos UI position against the real 2X and AD +12 bounds',
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
        && source.includes("'点击扩容按钮\\n增加12个位置'")
        && source.includes('const isStarterOpeningGuide = isLevelOneBoardGuide || isLevelTwoSpeedGuide || isLevelThreeCapacityGuide;')
        && !source.includes('createOpeningGuideFocusMask(')
        && !source.includes('PchOpeningGuideDimMask'),
    'mainline level 3 must guide the capacity ad button before gameplay starts',
);
assert.ok(
    source.includes('const expanded = this.expandCapacity();')
        && source.includes('if (!expanded) return;')
        && !source.includes('onOpeningGuideWatchAd'),
    'the guided level-3 capacity grant must expand directly without requesting an ad',
);
assert.ok(
    source.includes("this.makeNode('OpeningGuideTapTarget', parent")
        && source.includes("getChildByName('GuideHandSingle')")
        && source.includes('const hand = instantiate(sourceHand);')
        && source.includes('this.openingGuideTarget.addComponent(Button)')
        && source.includes('this.openingGuideTarget.on(Node.EventType.TOUCH_END, onTargetTap, this)')
        && !source.includes('this.openingGuideTarget.on(Node.EventType.TOUCH_START, onTargetTap, this)'),
    'all opening guides must clone the original authored hand and accept touch-end input on the highlighted Button target',
);
assert.ok(
    source.includes('if (!this.rules || this.runtime.isGameEnd) return;')
        && !source.includes('if (!this.rules || this.runtime.isGameEnd || this.openingGuide?.isValid) return;')
        && source.includes('if (this.inputLocked) {')
        && source.includes('this.handleOpeningGuideRootTap(event);'),
    'opening guides must keep their input gate while allowing the conveyor to continue updating',
);
assert.ok(
    source.includes("this.runtime.runRewardedGrant('pch_conveyor_expand'"),
    'normal capacity-button taps after the guide must retain the existing rewarded-ad path',
);

console.log('pch-level2-capacity-guide.test.js passed');
