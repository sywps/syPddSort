const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p));
const prefab = JSON.parse(read('assets/GameAssetsBundle/UI/Prefabs/Panels/AppTransition.prefab'));
const component = (name, type) => {
    const node = prefab.find(e => e.__type__ === 'cc.Node' && e._name === name);
    return node._components.map(r => prefab[r.__id__]).find(e => e.__type__ === type);
};
for (let i = 0; i < prefab.length; i++) {
    const n = prefab[i];
    if (n.__type__ !== 'cc.Node') continue;
    for (const c of n._children) assert.equal(prefab[c.__id__]._parent.__id__, i);
    for (const c of n._components) assert.equal(prefab[c.__id__].node.__id__, i);
}
const image = PNG.sync.read(read('assets/GameAssetsBundle/Textures/UI/app_transition_star_tile.png'));
assert.equal(image.width, 256); assert.equal(image.height, 256);
const meta = JSON.parse(read('assets/GameAssetsBundle/Textures/UI/app_transition_star_tile.png.meta'));
assert.equal(component('Pattern', 'cc.Sprite')._spriteFrame.__uuid__, meta.uuid + '@f9941');
assert.equal(component('Pattern', 'cc.Sprite')._type, 2);
assert.equal(meta.subMetas.f9941.userData.packable, false);
assert.equal(meta.subMetas.f9941.userData.trimType, 'none');
assert.deepEqual(component('Background', 'cc.Sprite')._color, { __type__: 'cc.Color', r: 101, g: 183, b: 255, a: 255 });
const white = PNG.sync.read(read('assets/GameAssetsBundle/UI/Images/skin_solid_white.png'));
for (let i = 0; i < white.data.length; i++) assert.equal(white.data[i], 255, 'solid base must be fully opaque white before tint');
const size = component('Illustration', 'cc.UITransform')._contentSize;
assert.equal(size.width / size.height, 640 / 452);
assert.equal(component('Illustration', 'cc.Sprite')._isTrimmedMode, false);
const text = component('Tip', 'cc.Label');
assert.equal(text._fontSize, 33.23); assert.equal(text._isBold, true);
assert.equal(text._enableOutline, false); assert.equal(text._enableShadow, false);
assert.deepEqual(text._color, { __type__: 'cc.Color', r: 23, g: 57, b: 87, a: 255 });
console.log('app-transition-visual.test.js passed');
