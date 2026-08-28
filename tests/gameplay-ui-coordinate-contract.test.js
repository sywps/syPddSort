const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8').replace(/\r\n/g, '\n');

const boardInput = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const shared = read('assets/Scripts/Core/GameCtrlShared.ts');
const pch = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const topHud = read('assets/Scripts/Core/GameCtrlModules/TopHudModule.ts');
const resultPanel = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const commercePanel = read('assets/Scripts/Core/Panels/CommercePanelController.ts');
const homeAdFlow = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const settlementHud = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');

function extractMethod(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing method: ${signature}`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] !== '}') continue;
        depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    assert.fail(`unterminated method: ${signature}`);
}

const productionCoordinateSources = [boardInput, gameplayView, pch, resultPanel, commercePanel];
for (const source of productionCoordinateSources) {
    assert.ok(!source.includes('normalizeGameplayUiPosition'), 'Cocos UI coordinates must never enter the removed normalizer');
    assert.ok(!source.includes('ScaledFallback'), 'root-level scaled hit fallbacks must remain removed');
}

assert.ok(boardInput.includes('const firstTouchUiPos = event.getUILocation();'));
assert.ok(boardInput.includes('const uiPos = event.getUILocation();'));
assert.ok(
    gameplayView.includes('const pos = touch.getUILocation();')
        && gameplayView.includes('return new Vec2(pos.x, pos.y);'),
    'multi-touch tracking must preserve the Cocos UI point unchanged',
);

assert.ok(
    boardInput.includes('this.pinchStartScale * (dist / this.pinchStartDist)')
        && boardInput.includes('this.zoomBoardViewportAround(center, this.pinchAnchorBoardLocal, nextScale);'),
    'pinch ratio and anchor logic must remain intact',
);
assert.ok(
    boardInput.includes('this.panStartGroupPos.x + dx * panSensitivity')
        && shared.includes('const local = boardUT.convertToNodeSpaceAR(worldPos);'),
    'pan and zoomed-board inverse conversion must remain intact',
);

const rootTouchEnd = extractMethod(pch, 'private onRootTouchEnd(event: any): void');
assert.ok(rootTouchEnd.includes('if (this.hasDirectButtonTarget(event)) return;'));
assert.ok(rootTouchEnd.includes('const rawPos = event?.getUILocation?.();'));
assert.ok(rootTouchEnd.includes('new Vec3(rawPos.x, rawPos.y, 0)'));
assert.strictEqual((rootTouchEnd.match(/resolveBoardTapBlock\(/g) || []).length, 1, 'PCH board routing must resolve exactly one position');
assert.ok(rootTouchEnd.includes('bounds.contains(rawPos)'));
for (const removed of ['uiPos', 'boardHitPositions', 'handleScaled']) {
    assert.ok(!rootTouchEnd.includes(removed), `PCH root touch must not retain ${removed}`);
}

const openingGuideTap = extractMethod(pch, 'private handleOpeningGuideRootTap(event: any): boolean');
const levelOneGuideTap = extractMethod(pch, 'private handleLevelOneOpeningGuideRootTap(event: any): boolean');
assert.ok(openingGuideTap.includes('bounds.contains(rawPos)'));
assert.ok(levelOneGuideTap.includes('bounds.contains(rawPos)'));
assert.ok(!openingGuideTap.includes('hitPositions') && !levelOneGuideTap.includes('hitPositions'));

assert.ok(topHud.includes('settingsButton.node.on(Button.EventType.CLICK, openSettings, this);'));
assert.ok(pch.includes('speedButton.on(Node.EventType.TOUCH_END, this.onSpeedButtonTap, this);'));
assert.ok(resultPanel.includes('this.runtime.bindPanelButton(triggerNode, handler);'));
assert.ok(commercePanel.includes('this.runtime.bindPanelButton(triggerNode, handler);'));
assert.ok(homeAdFlow.includes('bindResultPanelButton(triggerNode: Node, handler: () => void)'));
assert.ok(settlementHud.includes('this.bindResultPanelButton(settingsBtn, () => {'));

console.log('gameplay-ui-coordinate-contract.test.js passed');
