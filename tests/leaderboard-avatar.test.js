const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts'), 'utf8');
const cache = new Map();
const pending = new Map();
class UITransform {
    constructor() { this.contentSize = { width: 52, height: 52 }; }
    setContentSize(width, height) { this.contentSize = { width, height }; }
}
class Sprite { static SizeMode = { CUSTOM: 0 }; }
class Mask { static Type = { GRAPHICS_RECT: 0 }; }
const shared = { UITransform, Sprite, Mask, leaderboardAvatarFrameCache: cache, leaderboardAvatarPendingLoads: pending };
const moduleRef = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: moduleRef, exports: moduleRef.exports,
    require(id) {
        if (id === '../GameCtrlShared') return shared;
        if (id === '../BrowserLevelPreview') return { getBrowserLevelPreview: () => ({ active: false }) };
        if (id === '../ProfileAvatarView') return { invalidateProfileAvatar() {}, renderProfileAvatar: async () => {} };
        if (['../Panels/CollectionPanelController', '../PixelPosterPreviewRenderer', '../CompletedPatternPreview'].includes(id)) return {};
        throw new Error(`unexpected dependency: ${id}`);
    }, console,
});
const runtime = {};
moduleRef.exports.installCollectionAvatarModule(runtime);
function makeNode(name, children = [], components = []) {
    return { name, children, active: true, isValid: true,
        setPosition(x, y, z) { this.position = { x, y, z }; },
        getChildByName(name) { return this.children.find(child => child.name === name); },
        getComponent(type) { return components.find(component => component instanceof type); },
    };
}
const sprite = new Sprite();
const transform = new UITransform();
const remote = makeNode('AvatarSpriteNode', [], [sprite, transform]);
const defaultSprite = Object.assign(new Sprite(), { spriteFrame: {} });
const fallback = makeNode('AvatarDefault', [], [defaultSprite]);
const mask = makeNode('AvatarMask', [fallback, remote], [new Mask(), new UITransform()]);
const frame = makeNode('AvatarFrame', [], [Object.assign(new Sprite(), { spriteFrame: {} })]);
const slot = makeNode('Avatar', [mask, frame]);

runtime.loadAvatarToNode('', slot);
assert.strictEqual(fallback.active, true);
assert.strictEqual(remote.active, false);
assert.strictEqual(frame.active, true);
assert.strictEqual(mask.getComponent(Mask).type, Mask.Type.GRAPHICS_RECT);
cache.set('square', { rect: { width: 132, height: 132 } });
cache.set('wide', { rect: { width: 200, height: 100 } });
cache.set('tall', { rect: { width: 100, height: 200 } });
for (const [url, width, height] of [['square', 52, 52], ['wide', 104, 52], ['tall', 52, 104]]) {
    runtime.loadAvatarToNode(url, slot);
    assert.deepStrictEqual(transform.contentSize, { width, height });
    assert.strictEqual(fallback.active, false);
    assert.strictEqual(remote.active, true);
    assert.strictEqual(frame.active, true);
}
pending.set('slow', []);
runtime.loadAvatarToNode('slow', slot);
const delayed = pending.get('slow')[0];
runtime.loadAvatarToNode('', slot);
delayed(cache.get('wide'));
assert.strictEqual(sprite.spriteFrame, null, 'stale download must not replace the current default avatar');
assert.strictEqual(fallback.active, true);
pending.set('failure', []);
runtime.loadAvatarToNode('failure', slot);
pending.get('failure')[0](null);
assert.strictEqual(remote.active, false);
assert.strictEqual(fallback.active, true);
assert.throws(() => runtime.loadAvatarToNode('', makeNode('broken')), /missing node/);
for (const identity of [{ avatarId: 1001, frameId: 2001 }, { avatarId: 0, frameId: 2004 }]) {
    runtime.loadAvatarToNode('authorized', slot, identity);
    assert.strictEqual(mask.getComponent(Mask).enabled, false, 'shared profile renderer must not retain a circular mask');
}

const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/UI/Prefabs/Panels/LeaderboardPanel.prefab'), 'utf8'));
let avatarMasks = 0;
for (const node of prefab.filter(n => n.__type__ === 'cc.Node' && n._name === 'AvatarMask')) {
    avatarMasks++;
    const components = node._components.map(r => prefab[r.__id__]);
    assert.strictEqual(components.find(c => c.__type__ === 'cc.Mask')._type, 0);
    const parent = prefab[node._parent.__id__];
    const border = parent._children.map(r => prefab[r.__id__]).find(n => n._name === 'AvatarFrame');
    const size = border._components.map(r => prefab[r.__id__]).find(c => c.__type__ === 'cc.UITransform')._contentSize;
    const g = require('../openDataContext/profile-frames')[2001];
    assert.strictEqual(components.find(c => c.__type__ === 'cc.UITransform')._contentSize.width,
        Math.min(g.bounds[2] - g.bounds[0], g.bounds[3] - g.bounds[1]) * size.width / g.width);
}
assert(avatarMasks >= 5, 'include ranking rows and the self-ranking avatar');
for (const [index, node] of prefab.entries()) {
    if (node.__type__ !== 'cc.Node') continue;
    for (const ref of node._children) {
        assert.strictEqual(prefab[ref.__id__]._parent.__id__, index, `${node._name} child parent must agree`);
    }
}
const draws = [];
const context = {
    save: () => draws.push(['save']), beginPath() {},
    arc: (...args) => draws.push(['arc', ...args]),
    rect: (...args) => draws.push(['rect', ...args]),
    clip: () => draws.push(['clip']),
    drawImage: (...args) => draws.push(['image', ...args]),
    restore: () => draws.push(['restore']),
};
const dog = { width: 128, height: 128 };
const ring = { width: 128, height: 128 };
const wide = { width: 200, height: 100 };
const openData = fs.readFileSync(path.join(root, 'openDataContext/index.js'), 'utf8');
const drawAvatar = openData.slice(openData.indexOf('function drawAvatarCircle('), openData.indexOf('function roundRect('));
const sandbox = { ctx: context, avatarCache: { wide }, rankingArt: { avatarDefault: dog, avatarFrame: ring }, require: name => {
    assert.strictEqual(name, './profile-frames'); return require('../openDataContext/profile-frames');
} };
vm.runInNewContext(drawAvatar, sandbox);
for (const url of ['', 'wide']) {
    draws.length = 0;
    sandbox.drawAvatarCircle(url, 100, 100, 28);
    const g = require('../openDataContext/profile-frames')[2001];
    const diameter = Math.min(g.bounds[2] - g.bounds[0], g.bounds[3] - g.bounds[1]) * 56 / g.width;
    assert.strictEqual(draws[1][0], 'rect');
    assert.strictEqual(draws[1][3], diameter, 'friend canvas clipping must fit the measured new default frame');
    assert.strictEqual(draws[2][0], 'clip');
    assert.strictEqual(draws[3][1], url ? wide : dog);
    assert.strictEqual(draws[3][4], url ? diameter * 2 : diameter, 'friend avatar must use cover scaling');
    assert.strictEqual(draws[4][0], 'restore');
    assert.strictEqual(draws[5][1], ring, 'frame must be drawn after restoring the circular clip');
}
console.log('leaderboard-avatar.test.js passed');
