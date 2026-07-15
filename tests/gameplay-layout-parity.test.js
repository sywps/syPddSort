const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

const slotUi = read('assets/Scripts/Core/GameplaySlotUiController.ts');
const session = read('assets/Scripts/Core/GameplaySessionController.ts');
const cloudRestore = read('assets/Scripts/Core/GameCtrlModules/StartupCloudRestoreHelper.ts');
const boardInput = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const gameScene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));

assert.ok(slotUi.includes('const MAINLINE_SCENE_BASE_ROW_COUNT = 2'), 'mainline scene baseline must be independent of the first active level');
assert.ok(!slotUi.includes('_slotAreaSceneBaseRowCount = Math.max(1, Math.floor(Number(runtime.slotRowCount) || 1))'), 'scene baseline must not be sampled from runtime slotRowCount');
assert.ok(slotUi.includes('return Math.max(MAINLINE_SCENE_BASE_ROW_COUNT, sceneRows)'), 'scene baseline resolution must preserve the two-row Cocos layout');
assert.ok(slotUi.includes('slotAreaWidget.updateAlignment?.()'), 'slot area height changes must be realigned by the scene-owned Widget');
assert.ok(cloudRestore.includes('runtime.loadLevel(restoredLevel)'), 'regression scenario must cover same-runtime late cloud level restore');

const slotArea = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'SlotArea');
const slotAreaIndex = gameScene.indexOf(slotArea);
const slotAreaWidget = gameScene.find((entry) => entry && entry.__type__ === 'cc.Widget' && entry.node?.__id__ === slotAreaIndex);
assert.ok(slotAreaWidget && (slotAreaWidget._alignFlags & 4) !== 0, 'SlotArea must keep its Cocos-owned bottom Widget anchor');

assert.ok(session.indexOf('runtime._activeGameplayGuideLayoutMode = tutorialMode') < session.indexOf('runtime.buildUI()'), 'guide layout mode must be resolved before board fitting');
assert.ok(boardInput.includes('getLevelExpSlotIntroGuideBand'), 'level 3 must reserve a top guide band');
assert.ok(gameplayView.includes('this.fitBoardViewportToSafeRect(bw, bh, padding)'), 'initial board fit must consume the guide-aware safe viewport');

console.log('gameplay-layout-parity.test.js passed');
