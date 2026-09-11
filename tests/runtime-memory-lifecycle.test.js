const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loadMethods(relativePath, names, globals) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const ast = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
    const methods = [];
    const visit = node => {
        if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast))) methods.push(node.getText(ast));
        ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.equal(methods.length, names.length, 'exercise the actual production methods');
    const compiled = ts.transpileModule(`globalThis.methods = {${methods.join(',\n')}}`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    });
    const sandbox = { ...globals, Map, Set, console };
    vm.runInNewContext(compiled.outputText, sandbox);
    return sandbox.methods;
}

const assetMethods = loadMethods('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts', [
    '_cacheSpriteFrame', '_addCacheRef', '_decCacheRef', '_retainSpriteFrameCacheResource',
    '_releaseSpriteFrameCacheResource', 'releaseSceneScopedSpriteFrames',
], {
    SPRITE_FRAME_SCOPE_DYNAMIC: 'dynamic', SPRITE_FRAME_SCOPE_SHARED_UI: 'shared-ui',
    SPRITE_FRAME_SCOPE_SCENE_HOME: 'scene-home', SPRITE_FRAME_SCOPE_SCENE_GAME: 'scene-game',
    SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP: 'startup-bootstrap', debugPerfSnapshot() {},
});

class Asset {
    constructor(name, texture) { this.name = name; this.texture = texture; this.refCount = 0; this.isValid = true; }
    addRef() { assert(this.isValid); this.refCount++; }
    decRef() { assert(this.refCount > 0, `unbalanced release: ${this.name}`); this.refCount--; }
    destroy() { assert.fail('runtime teardown must not force-destroy shared assets'); }
}
function runtime() {
    return Object.assign({
        sfCache: new Map(), _spriteFrameCacheMeta: new Map(), _bootstrapAtlasFrameCache: new Map(),
        _inferSpriteFrameScope: (_, scope) => scope,
        _getSpriteFrameTextureForDiagnostics: frame => frame?.texture,
        _releaseBootstrapBeanAtlas() { assert.fail('must not force-release the incoming scene atlas'); },
    }, assetMethods);
}
const image = new Asset('image');
const texture = new Asset('texture');
const shared = new Asset('shared-ui', texture);
for (let cycle = 0; cycle < 10; cycle++) {
    const outgoing = runtime();
    const incoming = runtime();
    for (const owner of [outgoing, incoming]) {
        owner._cacheSpriteFrame(shared, shared.name, { scope: 'shared-ui', texture, imageAsset: image });
        // Repeated cache hits must not acquire another owner reference.
        owner._cacheSpriteFrame(shared, shared.name, { scope: 'shared-ui', texture, imageAsset: image });
        const atlasFrame = new Asset('bean', texture);
        owner._cacheSpriteFrame(atlasFrame, 'bean', { scope: 'startup-bootstrap', texture, imageAsset: image });
        owner._bootstrapAtlasFrameCache.set('bean', atlasFrame);
        owner._bootstrapBeanAtlasTexture = texture;
        owner._bootstrapBeanAtlasImageAsset = image;
        owner._cacheSpriteFrame(new Asset('other-scope', texture), 'other-scope', { scope: 'future-scope', texture });
    }
    outgoing.releaseSceneScopedSpriteFrames(cycle % 2 ? 'Home' : 'Game', 'runtime-destroy');
    assert.equal(shared.refCount, 1, 'incoming shared UI remains retained');
    assert.equal(texture.refCount, 3, 'only incoming texture refs survive');
    assert.equal(image.refCount, 2);
    for (const cache of [outgoing.sfCache, outgoing._spriteFrameCacheMeta, outgoing._bootstrapAtlasFrameCache]) assert.equal(cache.size, 0);
    assert.equal(outgoing._bootstrapBeanAtlasTexture, null);
    assert.equal(outgoing._bootstrapBeanAtlasImageAsset, null);
    outgoing.releaseSceneScopedSpriteFrames('Game', 'runtime-destroy');
    assert.equal(texture.refCount, 3, 'repeated teardown cannot decrement the next owner');
    incoming.releaseSceneScopedSpriteFrames('Boot', 'runtime-destroy');
    assert.equal(shared.refCount, 0);
    assert.equal(texture.refCount, 0, 'scene loops must not accumulate cached texture refs');
    assert.equal(image.refCount, 0);
}
const routeOnly = runtime();
routeOnly._cacheSpriteFrame(shared, shared.name, { scope: 'shared-ui', texture });
routeOnly.releaseSceneScopedSpriteFrames('Home', 'scene-destroy');
assert.equal(shared.refCount, 1, 'a scene-only release still preserves a live runtime shared cache');
routeOnly.releaseSceneScopedSpriteFrames('Home', 'runtime-destroy');
assert.equal(shared.refCount, 0);
const destroySource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameSceneRuntimeController.ts'), 'utf8');
assert(destroySource.includes("releaseSceneScopedSpriteFrames?.(sceneName, 'runtime-destroy')"), 'actual destruction must release the runtime owner');

class Node {
    constructor(name) { this.name = name; this.isValid = true; this.components = new Map(); this.children = []; }
    getComponent(type) { return this.components.get(type); }
    addComponent(type) { const component = new type(); this.components.set(type, component); return component; }
    setPosition() {}
    setScale() {}
    addChild(node) { node.removeFromParent(); this.children.push(node); node.parent = this; }
    removeFromParent() {
        if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
        this.parent = null;
    }
    destroy() { this.isValid = false; }
}
class Skeleton {
    static AnimationCacheMode = { SHARED_CACHE: 1 };
    setAnimationCacheMode(mode) { this.mode = mode; }
    set skeletonData(value) {
        assert.equal(this.mode, Skeleton.AnimationCacheMode.SHARED_CACHE, 'select shared cache before skeleton allocation');
        this.data = value;
    }
    setCompleteListener(listener) { this.listener = listener; }
    setAnimation(track, name, loop) { this.animation = { track, name, loop }; }
    clearTracks() {}
}
class UITransform { setContentSize() {} }
class UIOpacity {}
const fxMethods = loadMethods('assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts', [
    'acquirePinddSpineFxNode', 'recyclePinddSpineFxNode', 'playPinddSpineFxOnBean',
    'playPinddSpineFxOnBeansSameFrame', 'clearPinddSpineFx',
], {
    Node, UITransform, UIOpacity, sp: { Skeleton }, Layers: { Enum: { UI_2D: 1 } },
    PINDD_SPINE_FX_ACTIVE_LIMIT: 48, PINDD_SPINE_FX_POOL_LIMIT: 80,
    PINDD_SPINE_FX_NODE_NAME: 'PinddSpineFx', PINDD_SPINE_FX_SOURCE_HEIGHT: 43.27,
    PINDD_SPINE_FX_OPACITY_BY_ANIMATION: { b1_1: 245 }, PINDD_SPINE_FX_DURATION: { b1_1: 0.8333 },
    PINDD_SPINE_FX_BATCH_ACTIVE_LIMIT_RETRY_SECONDS: 0.033,
    selectPinddSpineFxBatchNodes: nodes => nodes.filter(node => node?.isValid),
    createPinddSpineFxError: message => new Error(message), setFxLayerDeep() {}, debugPerfTrace() {}, reportRuntimeMemorySnapshot() {},
});
const pooled = [];
const timers = [];
const skeletonData = {};
const fx = Object.assign({
    _pinddSpineFxPool: { get: () => pooled.pop(), put: node => pooled.push(node), clear() { pooled.splice(0).forEach(node => node.destroy()); } },
    getNodePoolSize: () => pooled.length,
    ensurePinddSpineFxSkeletonData: done => done(skeletonData),
    getPinddSpineFxScaleForBean: () => 1,
    scheduleOnce: (callback, delay) => timers.push({ callback, delay }),
}, fxMethods);
const beans = Array.from({ length: 869 }, () => new Node('bean'));
let completed = 0;
fx.playPinddSpineFxOnBeansSameFrame(beans, 'b1_1', () => completed++, { allowActiveLimitOverride: true });
assert.equal(completed, 0);
assert.equal(fx._pinddSpineFxActiveCount, 869, 'preserve all same-frame effects without sampling or batching');
const listeners = beans.map(bean => {
    assert.equal(bean.children.length, 1);
    const skeleton = bean.children[0].getComponent(Skeleton);
    assert.equal(skeleton.data, skeletonData);
    assert.equal(skeleton.mode, 1);
    assert.deepEqual({ ...skeleton.animation }, { track: 0, name: 'b1_1', loop: false });
    return skeleton.listener;
});
listeners.slice(0, -1).forEach(done => done());
assert.equal(completed, 0, 'settlement waits for the last effect');
listeners.at(-1)();
assert.equal(completed, 1);
assert.equal(fx._pinddSpineFxActiveCount, 0);
assert.equal(pooled.length, 80, 'cache pool remains bounded');
timers.forEach(({ callback, delay }) => { assert(Math.abs(delay - 0.9533) < 1e-6); callback(); });
assert.equal(completed, 1, 'deadline callbacks cannot repeat completion');

// An old animation completion must not finish a reused node or the next game.
const bean = new Node('next-bean');
fx.playPinddSpineFxOnBean(bean, 'b1_1', () => completed++);
listeners.forEach(done => done());
assert.equal(completed, 1);
const staleDone = bean.children[0].getComponent(Skeleton).listener;
fx.clearPinddSpineFx();
staleDone();
assert.equal(completed, 1);
assert.equal(fx._pinddSpineFxActiveCount, 0);
assert.equal(pooled.length, 0);
console.log('runtime-memory-lifecycle.test.js passed (owner refs and animation lifecycle; device memory unmeasured)');
