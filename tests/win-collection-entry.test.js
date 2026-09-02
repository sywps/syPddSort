const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));
const prefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel.prefab');

function refId(ref) {
    return ref && typeof ref.__id__ === 'number' ? ref.__id__ : null;
}

function childIds(node) {
    return Array.isArray(node?._children)
        ? node._children.map(refId).filter((id) => id !== null)
        : [];
}

function componentByType(node, type) {
    for (const ref of node?._components || []) {
        const component = prefab[refId(ref)];
        if (component?.__type__ === type) return component;
    }
    return null;
}

function findNodes(name) {
    return prefab
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry?.__type__ === 'cc.Node' && entry._name === name);
}

const topHudMatches = findNodes('SettlementTopHud');
const boxMatches = findNodes('Box');
const collectionButtonMatches = findNodes('CollectionBtn');
const collectionIconMatches = findNodes('CollectionIcon');
assert.strictEqual(topHudMatches.length, 1, 'WinPanel must have exactly one SettlementTopHud');
assert.strictEqual(boxMatches.length, 1, 'WinPanel must have exactly one Box');
assert.strictEqual(collectionButtonMatches.length, 1, 'WinPanel must have exactly one CollectionBtn');
assert.strictEqual(collectionIconMatches.length, 1, 'WinPanel must have exactly one CollectionIcon');

const box = boxMatches[0];
const collectionButton = collectionButtonMatches[0];
const collectionIcon = collectionIconMatches[0];
assert.strictEqual(refId(collectionButton.entry._parent), box.index, 'CollectionBtn must be owned by Box');
assert.ok(childIds(box.entry).includes(collectionButton.index), 'Box must serialize CollectionBtn in its children');
assert.strictEqual(refId(collectionIcon.entry._parent), collectionButton.index, 'CollectionIcon must be a direct child of CollectionBtn');
assert.ok(childIds(collectionButton.entry).includes(collectionIcon.index), 'CollectionBtn must serialize CollectionIcon in its children');

const buttonTransform = componentByType(collectionButton.entry, 'cc.UITransform');
const buttonWidget = componentByType(collectionButton.entry, 'cc.Widget');
const iconTransform = componentByType(collectionIcon.entry, 'cc.UITransform');
const iconSprite = componentByType(collectionIcon.entry, 'cc.Sprite');
assert.deepStrictEqual(
    { width: buttonTransform?._contentSize?.width, height: buttonTransform?._contentSize?.height },
    { width: 85, height: 85 },
    'CollectionBtn must keep the fixed top-HUD hit target',
);
assert.strictEqual(buttonWidget?._alignFlags, 33, 'CollectionBtn must retain its serialized top + right widget anchors');
assert.strictEqual(buttonWidget?._right, 51.68350000000004, 'CollectionBtn must keep the approved Box-relative horizontal placement');
assert.strictEqual(buttonWidget?._top, 788.6679999999999, 'CollectionBtn must keep the approved Box-relative vertical placement');
assert.deepStrictEqual(
    { x: collectionButton.entry._lpos?.x, y: collectionButton.entry._lpos?.y },
    { x: 205.414, y: -433.9069999999999 },
    'adding the title must not move the collection entry',
);
assert.deepStrictEqual(
    { width: iconTransform?._contentSize?.width, height: iconTransform?._contentSize?.height },
    { width: 82, height: 82 },
    'CollectionIcon must fit inside the fixed hit target',
);

const routeIconMeta = readJson('assets/GameAssetsBundle/Textures/UI/collection_entry_icon.png.meta');
const homeIconMeta = readJson('assets/HomeAssetsBundle/GameUI/图鉴1.png.meta');
assert.notStrictEqual(routeIconMeta.uuid, homeIconMeta.uuid, 'WinPanel icon must not reuse the HomeAssetsBundle UUID');
assert.strictEqual(
    iconSprite?._spriteFrame?.__uuid__,
    `${routeIconMeta.uuid}@f9941`,
    'CollectionIcon must bind the route-owned GameAssetsBundle SpriteFrame',
);
assert.ok(
    fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI/collection_entry_icon.png'))
        .equals(fs.readFileSync(path.join(root, 'assets/HomeAssetsBundle/GameUI/图鉴1.png'))),
    'route-owned win icon must preserve the approved home collection art bytes',
);
const controller = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const methodStart = controller.indexOf('createWinSettlementPanel(): Node');
const methodEnd = controller.indexOf('createReviveSettlementPanel(): Node', methodStart);
assert.ok(methodStart >= 0 && methodEnd > methodStart, 'win settlement factory must remain identifiable');
const createWinMethod = controller.slice(methodStart, methodEnd);
assert.ok(createWinMethod.includes("runtime.requirePanelChild(box, 'CollectionBtn')"), 'win factory must resolve the collection node from Box');
assert.ok(createWinMethod.includes('this.bindPanelButton(collectionBtn,'), 'collection entry must use the direct Cocos Button binding');
assert.ok(createWinMethod.includes("AudioMgr.inst.play('button')"), 'collection entry must use the unified button sound');
assert.ok(createWinMethod.includes('runtime.openCollection();'), 'collection entry must reuse the existing collection opening method');

console.log('win collection entry contract tests passed');
