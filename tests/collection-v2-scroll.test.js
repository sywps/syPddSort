'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const read = p => fs.readFileSync(p, 'utf8');
const prefab = JSON.parse(read('assets/GameAssetsBundle/UI/Prefabs/Panels/CollectionPanelV2.prefab'));
const node = name => prefab.find(o => o.__type__ === 'cc.Node' && o._name === name);
const children = n => n._children.map(r => prefab[r.__id__]);
const component = (n, type) => n._components.map(r => prefab[r.__id__]).find(c => c.__type__ === type);
const box = node('Box'), viewport = node('CollContent');
assert(children(box).includes(viewport));
for (const name of ['Title', 'CollectionTabs', 'CollectionProgress', 'XBtn']) assert(children(box).includes(node(name)), `${name} stays outside scrolling content`);
assert(!node('Pagination') && !node('PreviousPage') && !node('NextPage'));
assert.equal(component(viewport, 'cc.Mask')._type, 0);
const slots = children(viewport);
assert.equal(slots.length, 6);
assert.equal(new Set(slots.map(s => s._lpos.x)).size, 2);
assert.equal(new Set(slots.map(s => s._lpos.y)).size, 3);
const h = component(viewport, 'cc.UITransform')._contentSize.height;
for (const slot of slots) {
    const card = children(slot).find(n => n._name === 'Card');
    assert(card && component(card, 'cc.Sprite')._spriteFrame);
    const preview = children(card).find(n => n._name === 'PixelPreview');
    assert(!component(preview, 'cc.Sprite'), 'production cards must not retain static sample images');
    assert(slot._lpos.y + 129.5 <= h / 2, 'first row fits the viewport');
    assert(slot._lpos.y - 149.624 >= -h / 2, 'last-row nameplate fits the viewport');
}
function checkRefs(value) {
    if (!value || typeof value !== 'object') return;
    if ('__id__' in value) assert(prefab[value.__id__], `invalid reference ${value.__id__}`);
    for (const item of Object.values(value)) checkRefs(item);
}
checkRefs(prefab);
for (const n of prefab.filter(o => o.__type__ === 'cc.Node')) {
    assert(n._prefab, 'editor identity must exist');
    for (const c of children(n)) assert.equal(prefab[c._parent.__id__], n);
}
class Label {}
class Sprite {}
class UITransform {}
class Button { static EventType = { CLICK: 'click' }; }
class Node {
    constructor(record) {
        this.name = record._name; this.active = record._active; this.isValid = true; this.layer = record._layer;
        this.children = children(record).map(n => new Node(n)); this.components = new Map(); this.events = {};
        for (const [type, Type] of [['cc.Label', Label], ['cc.Sprite', Sprite], ['cc.UITransform', UITransform]]) {
            const c = component(record, type); if (!c) continue;
            const instance = new Type();
            Object.assign(instance, { spriteFrame: c._spriteFrame, string: c._string, width: c._contentSize?.width, height: c._contentSize?.height });
            this.components.set(Type, instance);
        }
    }
    getChildByName(name) { return this.children.find(n => n.name === name); }
    getComponent(Type) { return this.components.get(Type); }
    addComponent(Type) { const c = new Type(); this.components.set(Type, c); return c; }
    targetOff() { this.events = {}; }
    on(event, fn) { this.events[event] = fn; }
}
const source = read('assets/Scripts/Core/GameCtrlModules/CollectionGuideModule.ts');
const ast = ts.createSourceFile('guide.ts', source, ts.ScriptTarget.Latest, true);
let method;
function visit(n) { if (ts.isMethodDeclaration(n) && n.name.getText(ast) === 'drawCollectionCard') method = n.getText(ast); ts.forEachChild(n, visit); }
visit(ast); assert(method);
const code = ts.transpileModule(`const methods = { ${method} };`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const draw = new Function('Sprite', 'Label', 'UITransform', 'Button', 'Color', 'Layers', 'AudioMgr', code + ';return methods.drawCollectionCard;')(
    Sprite, Label, UITransform, Button, { WHITE: {} }, { Enum: { UI_2D: 1 } }, { inst: { play() {} } });
const parent = new Node(slots[0]); const details = [];
const runtime = { _collectionOverlay: {}, _collectionScrollSuppressClick: false,
    getThemeLevelDisplayNumber: id => id + 10, openCollectionImageModal: (...args) => details.push(args) };
const bind = (id, unlocked, prefix = 'level_') => draw.call(runtime, parent, id, 0, 0, 0, 0, unlocked, 4, { deferPreview: true, prefix });
const card = bind(1, true).card, plate = card.getChildByName('NamePlate');
assert.equal(plate.getChildByName('Name').getComponent(Label).string, '第 1 关');
card.events.click({}); assert.deepEqual(details, [[1, 'level_']]);
runtime._collectionScrollSuppressClick = true; card.events.click({}); assert.equal(details.length, 1, 'drag must not open detail');
bind(400, false);
assert.equal(plate.getChildByName('Unlocked').active, false);
assert.equal(plate.getChildByName('Locked').active, true);
assert.equal(card.getChildByName('LockedQuestion').active, true);
assert.equal(card.events.click, undefined, 'recycled locked card must lose its previous click handler');
bind(7, true, 'zt_level_');
assert.equal(plate.getChildByName('Name').getComponent(Label).string, '第 17 关');
assert.equal(card.getChildByName('LockedQuestion').active, false);
assert.equal(plate.getChildByName('Locked').active, false);
card.events.click({}); assert.deepEqual(details[1], [7, 'zt_level_']);
console.log('collection-v2-scroll.test.js passed');
