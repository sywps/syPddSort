'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), ts = require('typescript');

function load(name, dependencies) {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync('assets/Scripts/Core/' + name + '.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true,
    });
    assert.equal(code.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    new Function('require', 'module', 'exports', code.outputText)(key => {
        assert(key in dependencies, key); return dependencies[key];
    }, module, module.exports);
    return module.exports;
}
function harness() {
    const requests = [], textures = [], canvases = [], frames = [], errors = [];
    let running = 0, peak = 0, noContext = false;
    class ImageAsset {
        constructor(data) { this.data = data; this.width = data.width; this.height = data.height; }
        destroy() { this.destroyed = true; }
    }
    class Texture2D { constructor() { textures.push(this); } destroy() { this.destroyed = true; } }
    class SpriteFrame { constructor() { frames.push(this); } destroy() { this.destroyed = true; } }
    class Sprite { static SizeMode = { CUSTOM: 0 }; }
    class Rect { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
    class Node {
        static EventType = { NODE_DESTROYED: 'destroy' };
        constructor() { this.isValid = true; this.sprite = new Sprite(); this.handlers = []; }
        getComponent() { return this.sprite; }
        once(event, fn) { this.handlers.push(fn); }
        destroy() { this.isValid = false; for (const fn of this.handlers) fn(); }
    }
    const cc = { ImageAsset, Texture2D, SpriteFrame, Sprite, Rect, Node,
        assetManager: { loadRemote(url, options, callback) {
            running++; peak = Math.max(peak, running);
            requests.push({ url, options, finish(error, width = 2048, height = 1024) {
                const image = new ImageAsset({ width, height });
                running--; callback(error, error ? null : image); return image;
            } });
        } } };
    const platform = { getWeChatMiniGameRuntime: () => ({ createOffscreenCanvas() {
        const canvas = { width: 0, height: 0, getContext: () => noContext ? null : { drawImage(...args) { canvas.draw = args; } } };
        canvases.push(canvas); return canvas;
    } }) };
    const api = load('LeaderboardAvatarImage', { cc, './MiniGamePlatform': platform });
    const profile = load('ProfileAvatarView', { cc, './LeaderboardAvatarImage': api,
        './ProfileResourceService': { ProfileResourceService: { load: async () => ({}), loadDefault: async () => ({}) } },
        './ProfileDiagnostics': { reportProfileFailure: (...args) => errors.push(args) },
        './ProfileCustomizationConfig': { RETIRED_PROFILE_ITEMS: [] } });
    return { api, profile, cc, Node, ImageAsset, requests, textures, canvases, frames, errors,
        peak: () => peak, noContext: () => noContext = true };
}

test('100 framed remote portraits are bounded, queued and disposed on node destruction', async () => {
    const h = harness(), nodes = [], pending = [], sources = [];
    for (let i = 0; i < 100; i++) {
        const avatar = new h.Node(), frame = new h.Node(); nodes.push(avatar);
        pending.push(h.profile.renderProfileAvatar(avatar, frame, { frameId: 2001, avatarUrl: 'portrait-' + i }, true));
    }
    assert.equal(h.requests.length, 2, 'only two native loads launch immediately');
    for (let i = 0; i < 100; i++) sources.push(h.requests[i].finish(null));
    await Promise.all(pending);
    assert.equal(h.peak(), 2);
    assert(sources.every(image => image.destroyed), 'uncached full-size sources are disposed after rasterization');
    assert(h.requests.every(r => r.options.cacheAsset === false && r.options.reloadAsset === true));
    assert(h.textures.every(t => t.image.width === 256 && t.image.height === 128));
    assert.equal(h.textures.reduce((sum, t) => sum + t.image.width * t.image.height * 4, 0), 100 * 256 * 128 * 4);
    for (const node of nodes) node.destroy();
    assert(h.textures.every(t => t.destroyed)); assert(h.frames.every(f => f.destroyed));
    assert(h.canvases.every(c => c.width === 0 && c.height === 0));
});

test('closing during a batch skips queued decodes and never creates stale textures', async () => {
    const h = harness(), nodes = [], pending = [];
    for (let i = 0; i < 100; i++) {
        const avatar = new h.Node(), frame = new h.Node(); nodes.push(avatar);
        pending.push(h.profile.renderProfileAvatar(avatar, frame, { frameId: 2001, avatarUrl: 'portrait-' + i }, true));
    }
    for (const node of nodes) node.destroy();
    h.requests[0].finish(null); h.requests[1].finish(null);
    await Promise.all(pending);
    assert.equal(h.requests.length, 2); assert.equal(h.textures.length, 0);
    assert.equal(h.errors.length, 0, 'discarding a stale request does not report a current-view load failure');
});

test('duplicate URLs share a pending decode while each node owns its rendered frame', async () => {
    const h = harness();
    const a = h.api.loadLeaderboardAvatarFrame('same', () => true), b = h.api.loadLeaderboardAvatarFrame('same', () => true);
    assert.equal(h.requests.length, 1);
    h.requests[0].finish(null, 132, 132);
    const [fa, fb] = await Promise.all([a, b]);
    assert.notEqual(fa, fb); assert.equal(fa.rect.width, 132, 'small portraits are not enlarged');
    h.api.retireLeaderboardAvatarFrame(fa); assert.equal(fb.destroyed, undefined);
    h.api.retireLeaderboardAvatarFrame(fb);
});

test('cache eviction defers destruction until the last visible binding releases', () => {
    const h = harness(), frame = h.api.createLeaderboardAvatarFrame(new h.ImageAsset({ width: 1024, height: 1024 }));
    const a = new h.Node(), b = new h.Node();
    h.api.bindLeaderboardAvatarFrame(a, frame); h.api.bindLeaderboardAvatarFrame(b, frame);
    h.api.retireLeaderboardAvatarFrame(frame);
    assert.equal(frame.destroyed, undefined);
    a.destroy(); assert.equal(frame.destroyed, undefined);
    b.destroy(); assert.equal(frame.destroyed, true);
    assert.equal(frame.texture.destroyed, true);
});

test('current download/render failure remains observable and releases the queue slot', async () => {
    const h = harness();
    const a = assert.rejects(h.api.loadLeaderboardAvatarFrame('bad', () => true), /network/);
    const b = h.api.loadLeaderboardAvatarFrame('ok', () => true);
    const c = h.api.loadLeaderboardAvatarFrame('next', () => true);
    h.requests[0].finish(Error('network'));
    assert.equal(h.requests.length, 3);
    h.requests[1].finish(null); h.requests[2].finish(null);
    await a; h.api.retireLeaderboardAvatarFrame(await b); h.api.retireLeaderboardAvatarFrame(await c);
    const d = assert.rejects(h.api.loadLeaderboardAvatarFrame('no-context', () => true), /context unavailable/);
    h.noContext(); const raw = h.requests[3].finish(null); await d;
    assert.equal(raw.destroyed, true);
});

test('real row avatar binding uses the bounded loader for both branches and protects displayed cache entries', async () => {
    const h = harness();
    class UITransform {
        constructor() { this.contentSize = { width: 52, height: 52 }; }
        setContentSize(width, height) { this.contentSize = { width, height }; }
    }
    class Mask {
        static Type = { GRAPHICS_RECT: 0, SPRITE_STENCIL: 3 };
        set type(value) {
            this._type = value;
            if (value === Mask.Type.SPRITE_STENCIL && !this.node.getComponent(h.cc.Sprite)) {
                this.node.components.push(new h.cc.Sprite());
            }
        }
        get type() { return this._type; }
    }
    class ViewNode extends h.Node {
        constructor(name, children = [], components = []) {
            super(); this.name = name; this.children = children; this.components = components;
            for (const component of components) component.node = this;
        }
        getChildByName(name) { return this.children.find(n => n.name === name); }
        getComponent(type) { return this.components.find(c => c instanceof type); }
        setPosition() {}
        destroy() { super.destroy(); for (const child of this.children) child.destroy(); }
    }
    function avatar() {
        const sprite = new h.cc.Sprite(), border = Object.assign(new h.cc.Sprite(), { spriteFrame: {} });
        const image = new ViewNode('AvatarSpriteNode', [], [sprite, new UITransform()]);
        const fallback = new ViewNode('AvatarDefault', [], [Object.assign(new h.cc.Sprite(), { spriteFrame: {} })]);
        const mask = new ViewNode('AvatarMask', [image, fallback], [new Mask(), new UITransform()]);
        return { node: new ViewNode('Avatar', [mask, new ViewNode('AvatarFrame', [], [border])]), image, sprite };
    }
    const cache = new Map(), pending = new Map();
    let finished = 0, maskFrames = 0;
    const maskFrame = { isValid: true, addRef() {} };
    const shared = { ...h.cc, UITransform, Mask, MAX_LEADERBOARD_AVATAR_FRAMES: 1,
        Color: { WHITE: {} }, createSingleColorSpriteFrame() { maskFrames++; return maskFrame; },
        leaderboardAvatarFrameCache: cache, leaderboardAvatarPendingLoads: pending,
        enqueueLeaderboardAvatarLoad(url, fn) { fn(); }, finishLeaderboardAvatarLoad() { finished++; } };
    const runtime = {};
    load('GameCtrlModules/CollectionAvatarModule', {
        '../GameCtrlShared': shared, '../LeaderboardAvatarImage': h.api, '../ProfileAvatarView': h.profile,
        '../BrowserLevelPreview': {}, '../Panels/CollectionPanelController': {}, '../CompletedPatternPreview': {}, '../CreatorWeb': {},
    }).installCollectionAvatarModule(runtime);
    const a = avatar(), b = avatar(), custom = avatar();
    runtime.loadAvatarToNode('one', a.node);
    runtime.loadAvatarToNode('two', b.node);
    runtime.loadAvatarToNode('three', custom.node, { frameId: 2001 });
    const aMask = a.node.getChildByName('AvatarMask'), bMask = b.node.getChildByName('AvatarMask');
    assert.equal(aMask.getComponent(Mask).type, Mask.Type.SPRITE_STENCIL);
    assert.equal(aMask.getComponent(h.cc.Sprite).spriteFrame, bMask.getComponent(h.cc.Sprite).spriteFrame);
    assert.equal(maskFrames, 1, 'all legacy rows share one opaque stencil image');
    assert.deepEqual(aMask.getComponent(UITransform).contentSize, { width: 52, height: 52 });
    assert.equal(custom.node.getChildByName('AvatarMask').getComponent(Mask).enabled, false);
    h.requests[0].finish(null); h.requests[1].finish(null); h.requests[2].finish(null);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(finished, 2); assert.equal(h.peak(), 2);
    assert.equal(a.sprite.spriteFrame.rect.width, 256); assert.equal(b.sprite.spriteFrame.rect.width, 256);
    assert.equal(custom.sprite.spriteFrame.rect.width, 256);
    assert.equal(cache.size, 1);
    const evicted = a.sprite.spriteFrame;
    assert.equal(evicted.destroyed, undefined, 'evicting the first entry must keep its visible sprite valid');
    const previousCustom = custom.sprite.spriteFrame;
    runtime.loadAvatarToNode('three', custom.node, { frameId: 2001 });
    assert.equal(custom.sprite.spriteFrame, previousCustom, 're-rendering the same identity must not blank the portrait');
    a.node.destroy(); b.node.destroy(); custom.node.destroy();
    assert.equal(evicted.destroyed, true);
    assert.equal(previousCustom.destroyed, true);
    assert.equal(h.textures.filter(t => !t.destroyed).length, 1, 'only the bounded one-entry plain-avatar cache remains');
});
