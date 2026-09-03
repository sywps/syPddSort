const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const prefabPath = path.join(root, 'assets', 'GameAssetsBundle', 'UI', 'Prefabs', 'Panels', 'SettingsPanel.prefab');
const controllerPath = path.join(root, 'assets', 'Scripts', 'Core', 'Panels', 'SettingsPanelController.ts');

function childIndex(prefab, parentIndex, name) {
  const childId = (prefab[parentIndex]?._children || [])
    .map((reference) => reference?.__id__)
    .find((id) => prefab[id]?._name === name);
  assert.ok(Number.isInteger(childId), `missing ${name} under ${prefab[parentIndex]?._name || parentIndex}`);
  return childId;
}

function component(prefab, nodeIndex, type) {
  const componentId = (prefab[nodeIndex]?._components || [])
    .map((reference) => reference?.__id__)
    .find((id) => prefab[id]?.__type__ === type);
  assert.ok(Number.isInteger(componentId), `missing ${type} on ${prefab[nodeIndex]?._name || nodeIndex}`);
  return prefab[componentId];
}

function optionalComponent(prefab, nodeIndex, type) {
  const componentId = (prefab[nodeIndex]?._components || [])
    .map((reference) => reference?.__id__)
    .find((id) => prefab[id]?.__type__ === type);
  return Number.isInteger(componentId) ? prefab[componentId] : null;
}

function assertColor(actual, expected) {
  assert.deepStrictEqual(actual, {
    __type__: 'cc.Color',
    r: expected[0],
    g: expected[1],
    b: expected[2],
    a: expected[3],
  });
}

function assertUidLabel(prefab, nodeIndex, text, align, expectedColor) {
  const label = component(prefab, nodeIndex, 'cc.Label');
  assert.strictEqual(label._string, text);
  assert.strictEqual(label._fontFamily, 'Arial');
  assert.strictEqual(label._actualFontSize, 22);
  assert.strictEqual(label._fontSize, 22);
  assert.strictEqual(label._lineHeight, 32);
  assert.strictEqual(label._horizontalAlign, align);
  assert.strictEqual(label._verticalAlign, 1);
  assert.strictEqual(label._enableWrapText, false);
  assert.strictEqual(label._enableOutline, false);
  assertColor(label._color, expectedColor);
}

function validateReferences(value, prefabLength, location = 'root') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateReferences(item, prefabLength, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '__id__') {
    assert.ok(Number.isInteger(value.__id__) && value.__id__ >= 0 && value.__id__ < prefabLength,
      `out-of-range reference at ${location}: ${value.__id__}`);
    return;
  }
  Object.entries(value).forEach(([key, item]) => validateReferences(item, prefabLength, `${location}.${key}`));
}

function main() {
  const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
  validateReferences(prefab, prefab.length);

  const rootIndex = prefab.findIndex((item) => item?.__type__ === 'cc.Node' && item._parent === null);
  assert.ok(rootIndex >= 0, 'missing SettingsPanel root');
  const boxIndex = childIndex(prefab, rootIndex, 'Box');
  const rowIndex = childIndex(prefab, boxIndex, 'PlayerUidRow');
  const row = prefab[rowIndex];
  assert.deepStrictEqual(row._lpos, { __type__: 'cc.Vec3', x: 0, y: -294, z: 0 });
  assert.deepStrictEqual((row._children || []).map((reference) => prefab[reference.__id__]?._name), [
    'PlayerUidTitle',
    'PlayerUidValue',
    'PlayerUidCopy',
  ]);
  const rowTransform = component(prefab, rowIndex, 'cc.UITransform');
  assert.deepStrictEqual(rowTransform._contentSize, { __type__: 'cc.Size', width: 340, height: 36 });
  const rowButton = component(prefab, rowIndex, 'cc.Button');
  assert.strictEqual(rowButton._target.__id__, rowIndex);
  assert.strictEqual(rowButton._transition, 0);
  assert.strictEqual(rowButton._normalSprite, null);
  assert.strictEqual(rowButton._hoverSprite, null);
  assert.strictEqual(rowButton._pressedSprite, null);
  assert.strictEqual(rowButton._disabledSprite, null);
  assert.strictEqual(optionalComponent(prefab, rowIndex, 'cc.Sprite'), null);
  assert.strictEqual(optionalComponent(prefab, rowIndex, 'cc.Graphics'), null);

  const titleIndex = childIndex(prefab, rowIndex, 'PlayerUidTitle');
  const valueIndex = childIndex(prefab, rowIndex, 'PlayerUidValue');
  const copyIndex = childIndex(prefab, rowIndex, 'PlayerUidCopy');
  assertUidLabel(prefab, titleIndex, '玩家ID：', 2, [107, 74, 42, 255]);
  assertUidLabel(prefab, valueIndex, '--', 0, [107, 74, 42, 160]);
  assertUidLabel(prefab, copyIndex, '复制', 0, [107, 74, 42, 255]);
  [titleIndex, valueIndex, copyIndex].forEach((nodeIndex) => {
    assert.strictEqual(optionalComponent(prefab, nodeIndex, 'cc.Sprite'), null);
    assert.strictEqual(optionalComponent(prefab, nodeIndex, 'cc.Graphics'), null);
  });

  const controllerSource = fs.readFileSync(controllerPath, 'utf8');
  assert.match(controllerSource, /function requirePlayerUidRow/);
  assert.doesNotMatch(controllerSource, /new Node\(PLAYER_UID_ROW_NAME\)/);
  assert.match(controllerSource, /getMiniGameApi\('wx'\)/);
  assert.match(controllerSource, /getMiniGameApi\('tt'\)/);
  const syncStart = controllerSource.indexOf('function syncPlayerUidRow');
  const syncEnd = controllerSource.indexOf('\nexport class SettingsPanelController', syncStart);
  assert.ok(syncStart >= 0 && syncEnd > syncStart, 'missing PlayerUid sync helper');
  const syncSource = controllerSource.slice(syncStart, syncEnd);
  assert.match(syncSource, /row\.on\(Button\.EventType\.CLICK/);
  assert.doesNotMatch(syncSource, /addComponent\(/);
  assert.match(syncSource, /if \(!copied \|\| !row\.isValid\) return;\s*runtime\.showToast\?\.\('复制成功', 1\.2\);/);
  assert.match(controllerSource, /syncPlayerUidRow\(box, runtime\)/);
}

main();
console.log('player-uid-settings-prefab.test.js passed');
