const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const controller = read('assets/Scripts/Core/Panels/ThemePanelController.ts');
const flow = read('assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts');
const loading = read('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts');

assert.ok(loading.includes('type ThemeCardState'), 'theme cards must keep explicit runtime state semantics');
assert.ok(loading.includes('setOptionalThemeStateNodes(card, cardState);'), 'theme card state visuals should be prefab state nodes');
assert.ok(loading.includes('setOptionalThemeStateNodes(btn, cardState);'), 'theme button state visuals should be prefab state nodes');
assert.ok(!loading.includes('setExistingThemeSprite'), 'theme card runtime must not replace prefab card/button SpriteFrames');
assert.ok(!loading.includes("setExistingThemeSprite(this, card"), 'theme cards must trust prefab-bound card SpriteFrames');
assert.ok(!loading.includes("setExistingThemeSprite(this, btn"), 'theme buttons must trust prefab-bound button SpriteFrames');
assert.ok(!loading.includes('btnLabelNode.active = true;'), 'theme button label visibility should stay prefab-controlled');
assert.ok(!loading.includes('nameNode.active = true;'), 'theme level-name visibility should stay prefab-controlled');
assert.ok(!loading.includes('nameNode.active = false;'), 'theme level-name visibility should stay prefab-controlled');

assert.ok(!controller.includes("child.active = child.name === 'ThemeScrollContent'"), 'theme panel must not hide arbitrary prefab content children');
assert.ok(controller.includes("child.name.startsWith('ThemeCard_') || child.name.startsWith('ThemeHeader_')"), 'theme panel cleanup should target generated nodes only');

assert.ok(flow.includes('const leftX = Number.isFinite(cardTemplate.position.x)'), 'theme card columns should use prefab template x as the layout seed');
assert.ok(flow.includes('const templateTopPad = templateContentH / 2 - (headerTemplate.position.y + headerH / 2);'), 'theme top padding should derive from prefab template placement');
assert.ok(flow.includes('const templateHeaderCardGap = (headerTemplate.position.y - headerH / 2) - (cardTemplate.position.y + cardH / 2);'), 'theme header-card gap should derive from prefab template placement');
assert.ok(flow.includes('total += headerCardGap;'), 'theme scroll height must include prefab-derived header-card gap');
assert.ok(flow.includes('deferPreview: true'), 'theme panel should defer zt_level preview rendering at open time');
assert.ok(flow.includes('renderThemePanelVisiblePreviews'), 'theme panel should render previews through a visible-window pass');
assert.ok(controller.includes('runtime.renderThemePanelVisiblePreviews?.(scrollContent, scrollH, 1);'), 'theme scroll controller must render previews as the visible window changes');

console.log('theme-panel-template-first.test.js passed');
