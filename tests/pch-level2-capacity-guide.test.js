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
        && source.includes("? '点击一组棋子，将它们放到传送带上'")
        && source.includes(": '再点击另一组棋子，空出对应颜色的位置';")
        && source.includes('this.openingGuideLevelOneCells.length >= 2'),
    'mainline level 1 must use the original package Guide_table1 and Guide_table2 copy',
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
        && source.includes('this.openingGuideTarget.addComponent(Button)')
        && source.includes('this.openingGuideTarget.on(Node.EventType.TOUCH_END, onTargetTap, this)')
        && !source.includes('this.openingGuideTarget.on(Node.EventType.TOUCH_START, onTargetTap, this)'),
    'all opening guides must clone the original authored hand and accept touch-end input on the highlighted Button target',
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
