const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel.prefab'), 'utf8'));
const settlement = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts'), 'utf8');

function refId(ref) {
    return ref && typeof ref.__id__ === 'number' ? ref.__id__ : null;
}

function childIds(node) {
    return (node._children || []).map(refId).filter((id) => id !== null);
}

function componentIds(node) {
    return (node._components || []).map(refId).filter((id) => id !== null);
}

function findComponent(node, type) {
    return componentIds(node).map((id) => prefab[id]).find((component) => component?.__type__ === type);
}

const previewFrames = prefab
    .map((obj, index) => ({ obj, index }))
    .filter(({ obj }) => obj?._name === 'PreviewFrame');

assert.strictEqual(previewFrames.length, 1, 'WinPanel must have one PreviewFrame');

const previewFrame = previewFrames[0].obj;
const patternPreviewId = childIds(previewFrame).find((id) => prefab[id]?._name === 'PatternPreview');
assert.notStrictEqual(patternPreviewId, undefined, 'PreviewFrame must contain PatternPreview');

const patternPreview = prefab[patternPreviewId];
const patternUi = findComponent(patternPreview, 'cc.UITransform');
assert.ok(patternUi, 'PatternPreview must keep UITransform');
assert.strictEqual(patternUi._contentSize.width, 475, 'PatternPreview width should remain the win pattern limit');
assert.strictEqual(patternUi._contentSize.height, 475, 'PatternPreview height should remain the win pattern limit');
assert.deepStrictEqual(childIds(patternPreview).map((id) => prefab[id]?._name), [], 'PatternPreview should stay an empty prefab container');

assert.ok(settlement.includes("name: 'PixelPosterPreview'"), 'settlement preview must generate PixelPosterPreview inside PatternPreview');
assert.ok(!settlement.includes('previewNode.removeAllChildren();'), 'settlement preview must not clear the PatternPreview container wholesale');

console.log('win-pattern-preview.test.js passed');
