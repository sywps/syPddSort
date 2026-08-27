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
const collectionButtonMatches = findNodes('CollectionBtn');
const collectionIconMatches = findNodes('CollectionIcon');
assert.strictEqual(topHudMatches.length, 1, 'WinPanel must have exactly one SettlementTopHud');
assert.strictEqual(collectionButtonMatches.length, 1, 'WinPanel must have exactly one CollectionBtn');
assert.strictEqual(collectionIconMatches.length, 1, 'WinPanel must have exactly one CollectionIcon');

const topHud = topHudMatches[0];
const collectionButton = collectionButtonMatches[0];
const collectionIcon = collectionIconMatches[0];
assert.strictEqual(refId(collectionButton.entry._parent), topHud.index, 'CollectionBtn must be owned by SettlementTopHud');
assert.ok(childIds(topHud.entry).includes(collectionButton.index), 'SettlementTopHud must serialize CollectionBtn in its children');
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
assert.strictEqual(buttonWidget?._alignFlags, 33, 'CollectionBtn must be anchored to top + right');
assert.strictEqual(buttonWidget?._right, 26.284, 'CollectionBtn must mirror the settings-button safe inset');
assert.strictEqual(buttonWidget?._top, 25.936, 'CollectionBtn must mirror the settings-button top inset');
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
assert.ok(createWinMethod.includes("runtime.requirePanelChild(overlay, 'SettlementTopHud')"), 'win factory must resolve the fixed HUD layer');
assert.ok(createWinMethod.includes("runtime.requirePanelChild(settlementTopHud, 'CollectionBtn')"), 'win factory must resolve the fixed collection node');
assert.ok(createWinMethod.includes('this.bindPanelButtonWithScaledFallback(collectionBtn, overlay'), 'collection entry must use scaled-touch fallback binding');
assert.ok(createWinMethod.includes("AudioMgr.inst.play('uiPanel')"), 'collection entry must use the existing panel-open sound');
assert.ok(createWinMethod.includes('runtime.openCollection();'), 'collection entry must reuse the existing collection opening method');

console.log('win collection entry contract tests passed');
