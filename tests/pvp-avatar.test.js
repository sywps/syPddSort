const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const path = require('path');
const root = path.resolve(__dirname, '..');
class UITransform {
    constructor() { this.contentSize = { width: 56, height: 56 }; }
    setContentSize(width, height) { this.contentSize = { width, height }; }
}
class Sprite { static SizeMode = { CUSTOM: 0 }; }
class Mask {}
class Color {}
class Graphics {
    clear() {} rect() {} fill() {} moveTo() {} lineTo() {} close() {}
}
class Label { static HorizontalAlign = { CENTER: 0 }; static VerticalAlign = { CENTER: 0 }; }
class Node {
    static EventType = { NODE_DESTROYED: 'destroy' };
    constructor(name) { this.name = name; this.children = []; this.components = []; this.isValid = true; this.active = true; }
    getChildByName(name) { return this.children.find(child => child.name === name); }
    getChildByPath(path) { return path.split('/').reduce((node, name) => node?.getChildByName(name), this); }
    addChild(child) { this.children.push(child); }
    getComponent(type) { return this.components.find(c => c instanceof type); }
    addComponent(type) { const c = new type(); c.node = this; this.components.push(c); return c; }
    setPosition(...p) { this.position = p; }
    setScale(...s) { this.scale = s; }
    once(event, fn) { this.onDestroy = fn; }
    destroy() { this.isValid = false; this.children.forEach(c => c.destroy()); this.onDestroy?.(); }
}
const records = JSON.parse(fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/UI/Prefabs/Panels/LeaderboardPanel.prefab')));
function deserialize(index) {
    const data = records[index];
    const node = new Node(data._name);
    for (const ref of data._components) {
        const c = records[ref.__id__];
        if (c.__type__ === 'cc.UITransform') Object.assign(node.addComponent(UITransform), { contentSize: c._contentSize });
        if (c.__type__ === 'cc.Sprite') node.addComponent(Sprite).spriteFrame = c._spriteFrame;
        if (c.__type__ === 'cc.Mask') node.addComponent(Mask);
    }
    data._children.forEach(ref => node.addChild(deserialize(ref.__id__)));
    node.recordIndex = index;
    return node;
}
let refs = 0;
const prefab = { data: deserialize(records[0].data.__id__), addRef() { refs++; }, decRef() { refs--; } };
const pending = new Map();
const cache = new Map();
const warnings = [];
const shared = { Node, UITransform, Sprite, Mask, Color, Graphics, Label, BlockInputEvents: class {},
    Layers: { Enum: { UI_2D: 1 } }, Prefab: class {}, instantiate: node => deserialize(node.recordIndex),
    leaderboardAvatarPendingLoads: pending, leaderboardAvatarFrameCache: cache };
function load(file, imports) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Scripts/Core', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, require: id => imports[id] || {}, console: { warn: (...args) => warnings.push(args) } });
    return exports;
}
const bundle = { get: () => prefab };
const runtime = { isValid: true, _withGameAssetsBundle: cb => cb(bundle) };
load('GameCtrlModules/CollectionAvatarModule.ts', { '../GameCtrlShared': shared }).installCollectionAvatarModule(runtime);
let scheduled;
let routed = false;
load('GameCtrlModules/PvpModeModule.ts', {
    '../GameCtrlShared': shared,
    '../PvpModeConfig': { isPixelPvpMatch: () => true },
    '../AppRoot': { AppRoot: { tryGet: () => ({ markGameRequested() {}, router: { toGame() { routed = true; return Promise.resolve(); } } }) } },
}).installPvpModeModule(runtime);
runtime.scheduleOnce = (fn, delay) => { assert.strictEqual(delay, 1.5); scheduled = fn; };
const parent = new Node('Overlay');
pending.set('slow', []);
runtime.showPvpOpponentReveal(parent, { self: { displayName: 'Self', avatarUrl: '' }, opponent: { displayName: 'Opponent', avatarUrl: 'slow' } });
const reveal = parent.getChildByName('PvpOpponentReveal');
assert.ok(reveal.getChildByName('Ready'), 'reveal must finish constructing with a pending portrait');
assert.strictEqual(refs, 2);
const portrait = reveal.getChildByPath('OpponentAvatar/LeaderboardAvatar');
assert.strictEqual(portrait.scale[0], 58 / 56);
assert.ok(portrait.getChildByPath('AvatarMask/AvatarDefault').getComponent(Sprite).spriteFrame);
pending.get('slow')[0](null);
assert.strictEqual(portrait.getChildByPath('AvatarMask/AvatarDefault').active, true);
assert.strictEqual(portrait.getChildByPath('AvatarMask/AvatarSpriteNode').active, false);
scheduled();
assert.strictEqual(routed, true, 'avatar failure must not block gameplay routing');
parent.destroy();
assert.strictEqual(refs, 0, 'release prefab references with the host');
pending.get('slow')[0]({ rect: { width: 100, height: 100 } });
assert.strictEqual(portrait.getChildByPath('AvatarMask/AvatarSpriteNode').active, false, 'late image must not update destroyed nodes');
const host = new Node('HudAvatar');
cache.set('wide', { rect: { width: 200, height: 100 } });
runtime.mountLeaderboardAvatar('wide', host, 86);
assert.strictEqual(host.children[0].scale[0], 86 / 56);
assert.strictEqual(host.getChildByPath('LeaderboardAvatar/AvatarMask/AvatarDefault').active, false);
host.destroy();
let finish;
bundle.get = () => null;
bundle.load = (_path, _type, cb) => { finish = cb; };
const gone = new Node('Gone');
runtime.mountLeaderboardAvatar('', gone, 58);
gone.destroy();
finish(null, prefab);
assert.strictEqual(gone.children.length, 0, 'late prefab must not mount after navigation');
assert.strictEqual(refs, 0);
assert.strictEqual(warnings.length, 0);
console.log('pvp-avatar.test.js passed');
