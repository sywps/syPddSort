'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const prefab = read('assets/GameAssetsBundle/UI/Prefabs/Panels/PixelPuzzleLobby.prefab');
const artDir = 'assets/GameAssetsBundle/UI/Atlases/PixelPuzzleLobby';
const frames = new Map();
let totalBytes = 0;
for (const file of fs.readdirSync(path.join(root, artDir)).filter(name => name.endsWith('.png'))) {
    const buffer = fs.readFileSync(path.join(root, artDir, file));
    const png = PNG.sync.read(buffer), meta = read(`${artDir}/${file}.meta`);
    const sf = meta.subMetas.f9941;
    assert.equal(sf.userData.width, png.width);
    assert.equal(sf.userData.height, png.height);
    assert.equal(sf.userData.rawWidth, png.width);
    assert.equal(sf.userData.rawHeight, png.height);
    assert.equal(sf.userData.trimType, 'none', 'padding must survive import');
    assert(!frames.has(sf.uuid), 'sprite UUIDs must be unique');
    frames.set(sf.uuid, png); totalBytes += buffer.length;
}
const localImageCount = frames.size;
const backgroundPath = 'assets/GameAssetsBundle/Textures/UI/app_transition_loading_background.png';
const sharedBackground = read(backgroundPath + '.meta').subMetas.f9941.uuid;
frames.set(sharedBackground, PNG.sync.read(fs.readFileSync(path.join(root, backgroundPath))));
function validate(value) {
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) assert(prefab[value.__id__], `dangling reference ${value.__id__}`);
    if (value.__expectedType__ === 'cc.SpriteFrame') assert(frames.has(value.__uuid__), `missing image ${value.__uuid__}`);
    Object.values(value).forEach(validate);
}
prefab.forEach(validate);
const nodeAt = ref => prefab[ref.__id__];
function find(parent, nodePath) {
    return nodePath.split('/').reduce((node, name) => node?._children.map(nodeAt).find(child => child._name === name), parent);
}
const rootNode = nodeAt(prefab[0].data);
const component = (node, type) => node._components.map(nodeAt).find(c => c.__type__ === type);
for (let i = 0; i < prefab.length; i++) {
    const node = prefab[i];
    if (node.__type__ !== 'cc.Node') continue;
    for (const child of node._children) assert.equal(nodeAt(child)._parent.__id__, i);
    assert(!component(node, 'cc.Graphics'), `${node._name} must be editor-visible without runtime drawing`);
}
assert(component(rootNode, 'cc.BlockInputEvents'));
assert.equal(component(rootNode, 'cc.Widget')._alignFlags, 45, 'full-screen shield must fit tall screens');
assert.equal(component(rootNode, 'cc.Sprite')._spriteFrame.__uuid__, sharedBackground, 'reuse the transition background without copying or packing it again');
assert(!prefab.some(n => n.__type__ === 'cc.Node' && n._name === 'LobbyBackdropDecor'));
const transition = read('assets/GameAssetsBundle/UI/Prefabs/Panels/AppTransition.prefab');
assert(transition.some(c => c.__type__ === 'cc.Sprite' && c._spriteFrame?.__uuid__ === sharedBackground));
const header = component(find(rootNode, 'Content/Header'), 'cc.Widget');
const body = component(find(rootNode, 'Content/ModeArea'), 'cc.Widget');
const footer = component(find(rootNode, 'Content/Footer'), 'cc.Widget');
assert.equal(header._alignFlags, 41);
assert.equal(footer._alignFlags, 41);
assert.equal(footer._top, 1146);
assert.equal(body._alignFlags, 41);
assert.equal(component(find(rootNode, 'Content/ModeArea'), 'cc.UITransform')._contentSize.height, 761);
assert.equal(body._top, 370); assert.equal(body._bottom, 149);
assert.equal(component(find(rootNode, 'Content/ModeArea/ChapterCard'), 'cc.Widget')._alignFlags, 41);
assert.equal(component(find(rootNode, 'Content/ModeArea/CoopCard'), 'cc.Widget')._alignFlags, 42);
assert.equal(component(find(rootNode, 'Content/ModeArea/RankedCard'), 'cc.Widget')._alignFlags, 44);
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts'), 'utf8');
for (const match of source.matchAll(/(?:lobbyLabel|lobbyNode|bindLobbyButton)\(overlay, '([^']+)'/g)) {
    const node = find(rootNode, match[1]);
    assert(node, `missing binding ${match[1]}`);
    if (match[0].startsWith('lobbyLabel')) assert(component(node, 'cc.Label'));
    if (match[0].startsWith('bindLobbyButton')) assert(component(node, 'cc.Button'));
}
for (const [button, expected] of [['ChapterCard/StartChapter', [77,139,239,255]], ['RankedCard/StartMatch', [102,87,200,255]]]) {
    const node = find(rootNode, `Content/ModeArea/${button}/Background`);
    assert.equal(component(node, 'cc.Sprite')._type, 1, 'button artwork must use nine-slice resizing');
    const png = frames.get(component(node, 'cc.Sprite')._spriteFrame.__uuid__);
    const offset = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
    assert.deepEqual([...png.data.subarray(offset, offset + 4)], expected, 'button base colors must survive transparent art conversion');
    assert.equal(png.data[3], 0, 'background padding must be transparent');
}
for (const card of ['ChapterCard', 'CoopCard', 'RankedCard']) {
    assert(find(rootNode, `Content/ModeArea/${card}/${card}Shadow`), 'moving a card must carry its shadow');
}
assert.equal(find(rootNode, 'Content/Header/LobbySettings')._active, false);
assert.equal(component(find(rootNode, 'Content/ModeArea/ChapterCard/StartChapter'), 'cc.Button')._interactable, false, 'chapter cannot start before data loads');
const atlas = read(`${artDir}/pixel_lobby.pac.meta`).userData;
assert.equal(atlas.allowRotation, false);
assert.equal(atlas.padding, 4);
for (const field of ['removeTextureInBundle', 'removeImageInBundle', 'removeSpriteAtlasInBundle']) assert.equal(atlas[field], true);
console.log(`PIXEL_LOBBY_PREFAB_PASSED (${localImageCount} local images, ${totalBytes} bytes, shared transition background)`);
