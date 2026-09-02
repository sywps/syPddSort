const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/UI/Prefabs/Panels/CollectionPanel.prefab'), 'utf8'));
const flow = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/CollectionGuideModule.ts'), 'utf8');
const collection = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts'), 'utf8');

const COLLECTION_CARD_UUID = 'ff32ca0c-9115-469a-8c9a-e73033dff480@f9941';

function refId(ref) {
    return ref && typeof ref.__id__ === 'number' ? ref.__id__ : null;
}

function componentIds(node) {
    return (node._components || []).map(refId).filter((id) => id !== null);
}

function childIds(node) {
    return (node._children || []).map(refId).filter((id) => id !== null);
}

function findComponent(node, type) {
    return componentIds(node).map((id) => prefab[id]).find((component) => component?.__type__ === type);
}

const slots = prefab
    .map((obj, index) => ({ obj, index }))
    .filter(({ obj }) => /^CollectionCardSlot_\d+$/.test(obj?._name || ''));

assert.strictEqual(slots.length, 6, 'collection prefab must keep six visible layout slots');
assert.ok(!prefab.some((obj) => obj?._name === 'CardFrame'), 'collection card frame should live on Card, not a child node');

for (const { obj: slot } of slots) {
    const cardId = childIds(slot).find((id) => prefab[id]?._name === 'Card');
    assert.notStrictEqual(cardId, undefined, `${slot._name} must contain a Card child`);

    const card = prefab[cardId];
    const cardUi = findComponent(card, 'cc.UITransform');
    const cardSprite = findComponent(card, 'cc.Sprite');
    assert.ok(cardUi, `${slot._name}/Card must keep UITransform`);
    assert.ok(cardSprite, `${slot._name}/Card must own the frame Sprite`);
    assert.strictEqual(cardUi._contentSize.width, 250, `${slot._name}/Card width must match the six-card layout`);
    assert.strictEqual(cardUi._contentSize.height, 250, `${slot._name}/Card height must match the six-card layout`);
    assert.strictEqual(cardSprite._spriteFrame?.__uuid__, COLLECTION_CARD_UUID, `${slot._name}/Card must use collection_card_unlocked`);

    const childNames = childIds(card).map((id) => prefab[id]?._name);
    assert.deepStrictEqual(childNames, ['PixelPreview', 'Lbl', 'TapHint'], `${slot._name}/Card should expose PixelPreview before content children`);

    const previewId = childIds(card).find((id) => prefab[id]?._name === 'PixelPreview');
    const preview = prefab[previewId];
    const previewUi = findComponent(preview, 'cc.UITransform');
    assert.ok(previewUi, `${slot._name}/Card/PixelPreview must keep UITransform`);
    assert.ok(previewUi._contentSize.width > 0, `${slot._name}/Card/PixelPreview width must be positive`);
    assert.ok(previewUi._contentSize.height > 0, `${slot._name}/Card/PixelPreview height must be positive`);
    assert.ok(previewUi._contentSize.width <= cardUi._contentSize.width, `${slot._name}/Card/PixelPreview width must fit inside Card`);
    assert.ok(previewUi._contentSize.height <= cardUi._contentSize.height, `${slot._name}/Card/PixelPreview height must fit inside Card`);
}

assert.ok(flow.includes("const frameSprite = card.getComponent(Sprite);"), 'drawCollectionCard must read the frame Sprite from Card');
assert.ok(flow.includes('if (!frameSprite?.spriteFrame)'), 'drawCollectionCard must trust the prefab-bound card SpriteFrame');
assert.ok(!flow.includes("this.getSF('collection_card_unlocked')"), 'drawCollectionCard must not require collection_card_unlocked in the runtime sprite cache');
assert.ok(!flow.includes("getChildByName('CardFrame')"), 'drawCollectionCard must not require CardFrame');
assert.ok(flow.includes("const previewNode = card.getChildByName('PixelPreview');"), 'drawCollectionCard must require the prefab PixelPreview container');
assert.ok(flow.includes('labelNode.active = false;'), 'collection cards should hide level labels');
assert.ok(flow.includes("label.string = '';"), 'collection cards should clear level label text');
assert.ok(!flow.includes('label.string = `第${levelId}关`;'), 'collection cards should not show level labels');
assert.ok(flow.includes('const previewY = 0;'), 'collection preview should draw centered inside PixelPreview');
assert.ok(flow.includes('const previewW = previewUi.width || Math.max(1, frameW - 24);'), 'collection preview width must come from PixelPreview');
assert.ok(flow.includes('const previewH = previewUi.height || Math.max(1, frameH - 74);'), 'collection preview height must come from PixelPreview');
assert.ok(collection.includes("name: usePrefabContainer ? 'PixelPosterPreview' : 'PixelPreview'"), 'card previews must draw generated content inside the prefab PixelPreview container');
assert.ok(collection.includes("!previewContainer.getComponent(Graphics)"), 'card previews must distinguish the prefab container from generated Graphics nodes');

console.log('collection-card-frame.test.js passed');
