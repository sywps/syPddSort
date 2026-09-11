'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core', file), 'utf8');
class Node {
    static EventType = { TOUCH_END: 'touch' };
    constructor(name) { this.name = name; this.children = []; this.isValid = true; this.components = new Map(); this.handlers = {}; }
    addChild(node) { this.children.push(node); }
    addComponent(Type) { const value = new Type(); this.components.set(Type, value); return value; }
    getComponent(Type) { return this.components.get(Type); }
    getChildByName(name) { return this.children.find(node => node.name === name); }
    setPosition(x, y) { this.position = { x, y }; }
    on(event, callback) { this.handlers[event] = callback; }
}
class UITransform { setContentSize(width, height) { this.width = width; this.height = height; } }
class Label { static HorizontalAlign = { CENTER: 0 }; static VerticalAlign = { CENTER: 0 }; }
class Graphics { clear() {} roundRect() {} fill() {} }
class Color { constructor(value) { this.value = value; } }
const shared = { Node, UITransform, Label, Graphics, Color, Layers: { Enum: { UI_2D: 1 } }, AudioMgr: { inst: { play() {} } } };
const catalog = require('../assets/GameAssetsBundle/coop-manifest.json').levels;
const grid = [[1, 2]];
let unlocked = { [catalog[0].collectionId]: 123 };
const service = {
    catalog: async () => catalog,
    overview: async () => ({ overview: { unlocked } }),
    fullLevel: async () => ({ correctColorArr: grid }),
};
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', transpile(read('Panels/CollectionPanelController.ts') + '\nexport { createCollectionTabs };'))(loaded.exports, id => {
    if (id.endsWith('GameCtrlShared')) return shared;
    if (id.endsWith('CoopServiceMgr')) return { CoopServiceMgr: { inst: service } };
    throw new Error(id);
});
function method(file, name, dependencies) {
    const source = read(file);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    let found;
    function visit(node) {
        if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) found = node.getText(ast);
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert(found, name);
    return new Function(...Object.keys(dependencies), transpile(`const object = { ${found} };`) + `return object.${name};`)(...Object.values(dependencies));
}
const settle = () => new Promise(resolve => setImmediate(resolve));
async function main() {
    const box = new Node('Box'), renders = [], messages = [];
    const runtime = { _collectionActiveTab: 'main', _collectionContentNode: { active: true }, showToast: text => messages.push(text),
        renderCollectionScroll() { renders.push(this._collectionActiveTab); } };
    loaded.exports.createCollectionTabs(box, runtime);
    const tabs = box.getChildByName('CollectionTabs');
    assert.equal(tabs.children.filter(node => node.name.startsWith('CollectionTab_')).length, 3);
    const status = tabs.getChildByName('CollectionTabStatus');
    const click = key => tabs.getChildByName(`CollectionTab_${key}`).handlers.touch();
    click('coop'); await settle();
    assert.equal(runtime._collectionActiveTab, 'coop');
    assert.equal(runtime._collectionCoopEntries.length, 10);
    assert.equal(runtime._collectionCoopEntries.filter(entry => entry.unlocked).length, 1);
    assert.equal(runtime._collectionCoopEntries[0].grid, grid);
    unlocked = { ...unlocked, [catalog[1].collectionId]: 456 };
    click('theme'); click('coop'); await settle();
    assert.equal(runtime._collectionCoopEntries.filter(entry => entry.unlocked).length, 2, 'return refreshes cloud unlocks');
    let resolveOverview;
    service.overview = () => new Promise(resolve => { resolveOverview = resolve; });
    click('coop');
    assert.equal(runtime._collectionActiveTab, 'coop', 'click immediately selects the tab while loading');
    assert.equal(runtime._collectionContentNode.active, false, 'old mainline images are hidden while loading');
    assert.equal(status.active, true);
    click('main');
    resolveOverview({ overview: { unlocked } }); await settle();
    assert.equal(runtime._collectionActiveTab, 'main', 'late cloud response cannot switch tab back');
    service.overview = async () => { throw new Error('云服务不可用'); };
    const count = renders.length;
    click('coop'); await settle();
    assert.equal(renders.length, count, 'cloud failure must not render a false locked catalog');
    assert.equal(runtime._collectionActiveTab, 'coop');
    assert.equal(status.active, true, 'failure remains visible without a toast host');
    assert.match(status.getComponent(Label).string, /云服务不可用/);
    assert.match(status.getComponent(Label).string, /重试/);
    service.overview = async () => ({ overview: { unlocked } });
    click('coop'); await settle();
    assert.equal(status.active, false, 'retry hides the error when the service recovers');
    assert.equal(runtime._collectionContentNode.active, true);
    const afterRetry = renders.length;
    service.overview = () => new Promise(resolve => { resolveOverview = resolve; });
    click('coop'); tabs.isValid = false;
    resolveOverview({ overview: { unlocked } }); await settle();
    assert.equal(renders.length, afterRetry, 'closing panel discards pending response');

    const images = [];
    const draw = method('GameCtrlModules/CollectionAvatarModule.ts', 'drawCollectionPixelPreviewOnCard', {
        UITransform, Graphics, renderPixelPosterPreview: (...args) => images.push(args),
    });
    const card = new Node('Card');
    draw.call(runtime, card, catalog[0].levelId, 0, 0, 150, 150, 'coop_level_', { grayscale: false });
    draw.call(runtime, card, catalog[2].levelId, 0, 0, 150, 150, 'coop_level_', { grayscale: true });
    assert.equal(images[0][1], grid);
    assert.equal(images[0][2].grayscale, false);
    assert.equal(images[1][2].grayscale, true);
    draw.call(runtime, card, catalog[0].levelId, 0, 0, 150, 150, 'coop_level_', { bindingToken: 'obsolete' });
    assert.equal(images.length, 2, 'recycled card rejects old preview');
    const replay = new Node('CollectionReplayButton'); replay.active = true;
    const detail = method('GameCtrlModules/CollectionGuideModule.ts', 'openCollectionImageModal', {
        openCollectionShellOverlay: (_runtime, options) => options.onReady({
            overlay: {}, box: { getChildByName: () => replay }, content: { removeAllChildren() {} }, pageIndicator: null,
        }),
    });
    detail.call({ closeCollectionImageModal() {}, drawCollectionPatternOnCard() {},
        bindCollectionReplayButton() { throw new Error('cooperation must not replay as mainline'); } }, 1, 'coop_level_');
    assert.equal(replay.active, false);
    console.log('coop-collection-tab.test.js passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
