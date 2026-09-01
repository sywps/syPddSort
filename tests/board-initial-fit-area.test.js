const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const scene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));
const boardInput = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const gameCtrlShared = read('assets/Scripts/Core/GameCtrlShared.ts');

const findNode = (name) => scene.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
const child = (parent, name) => (parent?._children || [])
    .map((ref) => scene[ref.__id__])
    .find((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
const component = (node, type) => (node?._components || [])
    .map((ref) => scene[ref.__id__])
    .find((entry) => entry?.__type__ === type);

const fixedRoot = findNode('GameplayFixedRoot');
const initialFitArea = child(fixedRoot, 'BoardInitialFitArea');
const initialFitTransform = component(initialFitArea, 'cc.UITransform');
const initialFitWidget = component(initialFitArea, 'cc.Widget');

assert.ok(fixedRoot, 'Game.scene must contain GameplayFixedRoot');
assert.ok(initialFitArea?._active, 'Game.scene must contain an active BoardInitialFitArea');
assert.strictEqual(initialFitArea?._parent?.__id__, scene.indexOf(fixedRoot));
assert.strictEqual(initialFitTransform?._contentSize?.width, 720);
assert.strictEqual(initialFitTransform?._contentSize?.height, 1280);
assert.strictEqual(initialFitWidget?._enabled, true);
assert.strictEqual(initialFitWidget?._alignFlags, 45);
assert.strictEqual(component(initialFitArea, 'cc.Mask'), undefined, 'initial fit area must not crop the board');

const initialFitMethodStart = boardInput.indexOf('getBoardInitialFitRect():');
const initialFitMethodEnd = boardInput.indexOf('setViewTransformClamped(scale: number, offset: Vec2):', initialFitMethodStart);
const initialFitMethod = boardInput.slice(initialFitMethodStart, initialFitMethodEnd);
assert.ok(initialFitMethodStart >= 0 && initialFitMethodEnd > initialFitMethodStart);
assert.ok(initialFitMethod.includes("this.getGameplayFixedGroup?.('BoardInitialFitArea')"));
assert.ok(initialFitMethod.includes('this.getGameplayNodeBoundsInFixedRoot(area)'));
assert.ok(initialFitMethod.includes('const left = Math.max(sceneRect.left, safeRect.left);'));
assert.ok(initialFitMethod.includes('const right = Math.min(sceneRect.right, safeRect.right);'));
assert.ok(initialFitMethod.includes('const bottom = Math.max(sceneRect.bottom, safeRect.bottom);'));
assert.ok(initialFitMethod.includes('const top = Math.min(sceneRect.top, safeRect.top);'));
assert.ok(initialFitMethod.includes('does not intersect the board safe viewport'));

const fitMethodStart = gameplayView.indexOf('private fitBoardViewportToSafeRect(');
const fitMethodEnd = gameplayView.indexOf('refitBoardViewportToSafeRect(): void', fitMethodStart);
const fitMethod = gameplayView.slice(fitMethodStart, fitMethodEnd);
assert.ok(fitMethod.includes('const initialFitRect = runtime.getBoardInitialFitRect();'));
assert.ok(fitMethod.includes('const viewportCenterX = (initialFitRect.left + initialFitRect.right) / 2;'));
assert.ok(fitMethod.includes('const viewportCenterY = (initialFitRect.bottom + initialFitRect.top) / 2;'));
assert.ok(!fitMethod.includes('starterBoardLift'), 'initial board fit must not lift level 1 or 2');
assert.ok(!fitMethod.includes('getBoardSafeViewportRect()'), 'initial fit must not bypass the scene-owned area');

const clampStart = gameCtrlShared.indexOf('private clampOffset(x: number, y: number, scale: number): Vec2');
const clampEnd = gameCtrlShared.indexOf('\n}\n\nexport {', clampStart);
const clampMethod = gameCtrlShared.slice(clampStart, clampEnd);
assert.ok(clampMethod.includes('const rect = this.options.getSafeViewportRect();'));

console.log('board-initial-fit-area.test.js passed');
