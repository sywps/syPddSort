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
const collectionTitleMatches = findNodes('标题底板');
const collectionTitleLabelMatches = findNodes('Label');
assert.strictEqual(topHudMatches.length, 1, 'WinPanel must have exactly one SettlementTopHud');
assert.strictEqual(boxMatches.length, 1, 'WinPanel must have exactly one Box');
assert.strictEqual(collectionButtonMatches.length, 1, 'WinPanel must have exactly one CollectionBtn');
assert.strictEqual(collectionIconMatches.length, 1, 'WinPanel must have exactly one CollectionIcon');
assert.strictEqual(collectionTitleMatches.length, 1, 'WinPanel must have exactly one collection title plate');
assert.strictEqual(collectionTitleLabelMatches.length, 1, 'WinPanel must have exactly one collection title label');

const box = boxMatches[0];
const collectionButton = collectionButtonMatches[0];
const collectionIcon = collectionIconMatches[0];
const collectionTitle = collectionTitleMatches[0];
const collectionTitleLabel = collectionTitleLabelMatches[0];
assert.strictEqual(refId(collectionButton.entry._parent), box.index, 'CollectionBtn must be owned by Box');
assert.ok(childIds(box.entry).includes(collectionButton.index), 'Box must serialize CollectionBtn in its children');
assert.strictEqual(refId(collectionIcon.entry._parent), collectionButton.index, 'CollectionIcon must be a direct child of CollectionBtn');
assert.ok(childIds(collectionButton.entry).includes(collectionIcon.index), 'CollectionBtn must serialize CollectionIcon in its children');
assert.strictEqual(refId(collectionTitle.entry._parent), collectionButton.index, 'collection title plate must be a direct child of CollectionBtn');
assert.ok(childIds(collectionButton.entry).includes(collectionTitle.index), 'CollectionBtn must serialize its title plate');
assert.strictEqual(refId(collectionTitleLabel.entry._parent), collectionTitle.index, 'collection title label must be owned by the title plate');
assert.ok(childIds(collectionTitle.entry).includes(collectionTitleLabel.index), 'title plate must serialize its label');

const buttonTransform = componentByType(collectionButton.entry, 'cc.UITransform');
const buttonWidget = componentByType(collectionButton.entry, 'cc.Widget');
const iconTransform = componentByType(collectionIcon.entry, 'cc.UITransform');
const iconSprite = componentByType(collectionIcon.entry, 'cc.Sprite');
const titleTransform = componentByType(collectionTitle.entry, 'cc.UITransform');
const titleSprite = componentByType(collectionTitle.entry, 'cc.Sprite');
const titleLabelTransform = componentByType(collectionTitleLabel.entry, 'cc.UITransform');
const titleLabel = componentByType(collectionTitleLabel.entry, 'cc.Label');
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
assert.deepStrictEqual(
    { x: collectionTitle.entry._lpos?.x, y: collectionTitle.entry._lpos?.y, scale: collectionTitle.entry._lscale?.x },
    { x: 0, y: -53.767, scale: 0.315 },
    'collection title plate must reuse the Home entry offset and scale',
);
assert.deepStrictEqual(
    { width: titleTransform?._contentSize?.width, height: titleTransform?._contentSize?.height },
    { width: 310, height: 140 },
    'collection title plate must reuse the Home entry geometry',
);
assert.deepStrictEqual(
    { x: collectionTitleLabel.entry._lpos?.x, y: collectionTitleLabel.entry._lpos?.y, scale: collectionTitleLabel.entry._lscale?.x },
    { x: 0, y: 6.854, scale: 3.174603174603175 },
    'collection title label must reuse the Home entry transform',
);
assert.deepStrictEqual(
    { width: titleLabelTransform?._contentSize?.width, height: titleLabelTransform?._contentSize?.height },
    { width: 56.94580078125, height: 50.4 },
    'collection title label must reuse the Home entry content size',
);
assert.strictEqual(titleLabel?._string, '图 鉴', 'collection title must reuse the Home entry copy');
assert.strictEqual(titleLabel?._fontSize, 25, 'collection title must reuse the Home entry font size');
assert.strictEqual(titleLabel?._isBold, true, 'collection title must reuse the Home entry bold style');
assert.strictEqual(titleLabel?._overflow, 2, 'collection title must keep SHRINK overflow');
assert.deepStrictEqual(titleLabel?._color, { __type__: 'cc.Color', r: 107, g: 74, b: 42, a: 255 }, 'collection title must reuse the Home text color');
assert.strictEqual(titleLabel?._enableOutline, true, 'collection title must keep the Home outline');
assert.deepStrictEqual(titleLabel?._outlineColor, { __type__: 'cc.Color', r: 255, g: 242, b: 210, a: 255 }, 'collection title must reuse the Home outline color');
assert.strictEqual(titleLabel?._outlineWidth, 1, 'collection title must reuse the Home outline width');

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
const routeTitleMeta = readJson('assets/GameAssetsBundle/Textures/UI/collection_entry_title_plate.png.meta');
const homeTitleMeta = readJson('assets/HomeAssetsBundle/GameUI/home_icon_title_plate.png.meta');
assert.notStrictEqual(routeTitleMeta.uuid, homeTitleMeta.uuid, 'WinPanel title plate must not reuse the HomeAssetsBundle UUID');
assert.strictEqual(
    titleSprite?._spriteFrame?.__uuid__,
    `${routeTitleMeta.uuid}@f9941`,
    'collection title plate must bind the route-owned GameAssetsBundle SpriteFrame',
);
assert.ok(
    fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI/collection_entry_title_plate.png'))
        .equals(fs.readFileSync(path.join(root, 'assets/HomeAssetsBundle/GameUI/home_icon_title_plate.png'))),
    'route-owned title plate must preserve the approved Home art bytes',
);

const controller = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const methodStart = controller.indexOf('createWinSettlementPanel(): Node');
const methodEnd = controller.indexOf('createReviveSettlementPanel(): Node', methodStart);
assert.ok(methodStart >= 0 && methodEnd > methodStart, 'win settlement factory must remain identifiable');
const createWinMethod = controller.slice(methodStart, methodEnd);
assert.ok(createWinMethod.includes("runtime.requirePanelChild(box, 'CollectionBtn')"), 'win factory must resolve the collection node from Box');
assert.ok(createWinMethod.includes("runtime.requirePanelChild(collectionBtn, '标题底板')"), 'win factory must require the collection title plate');
assert.ok(createWinMethod.includes("runtime.requirePanelChild(collectionTitlePlate, 'Label')"), 'win factory must require the collection title label');
assert.ok(createWinMethod.includes('collectionTitleLabel.getComponent(Label)'), 'win factory must fail fast when the title Label component is missing');
assert.ok(createWinMethod.includes('this.bindPanelButtonWithScaledFallback(collectionBtn, overlay'), 'collection entry must use scaled-touch fallback binding');
assert.ok(createWinMethod.includes("AudioMgr.inst.play('uiPanel')"), 'collection entry must use the existing panel-open sound');
assert.ok(createWinMethod.includes('runtime.openCollection();'), 'collection entry must reuse the existing collection opening method');

console.log('win collection entry contract tests passed');
