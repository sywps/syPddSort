const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'assets/Scripts/Core/GameCtrlModules/BeanSkinModule.ts');
const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['_ensureBeanSkinAtlasLoaded', '_createBeanSkinAtlasOwner', '_releaseBeanSkinAtlasOwner',
    '_replaceActiveBeanSkinAtlasOwner', '_hasCompleteBeanSkinFrameMap', 'releaseBeanSkinRuntimeResources'];
const methods = [];
function visit(node) {
    if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast))) methods.push(node.getText(ast));
    ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(methods.length, names.length);
const atlas = JSON.parse(fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/BeanSkins/skin_02/bean-atlas-data.json'), 'utf8'));
let frameAllocations = 0;
class Asset {
    constructor() { this.isValid = true; this.refCount = 0; this.checks = 0; this.width = 1024; this.height = 1024; }
    addRef() { assert(this.isValid); this.refCount++; return this; }
    decRef() { assert(this.refCount > 0); this.refCount--; this.checks++; return this; }
    destroy() { this.isValid = false; }
}
class Frame extends Asset { constructor() { super(); frameAllocations++; } }
const sandbox = {
    SpriteFrame: Frame, Rect: class Rect {}, Sprite: class Sprite {},
    DEFAULT_BEAN_SKIN_ID: 2000, EXPECTED_BEAN_FRAME_COUNT: 60,
    EXPECTED_BEAN_FRAME_NAMES: Object.keys(atlas.frames), normalizeBeanSkinId: id => [2000, 2001, 2002].includes(id) ? id : 0,
    runtimeLog() {}, runtimeWarn() {},
    assetManager: { releaseAsset() { assert.fail('must not force-release a shared atlas'); } },
};
vm.runInNewContext(ts.transpileModule(`globalThis.methods = {${methods.join(',\n')}}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, sandbox);
function runtime() {
    const textureLoads = [];
    const value = Object.assign({
        isValid: true, _beanSkinAtlasLoadsCancelled: false,
        _beanSkinIconCache: new Map(), _beanSkinIconLoadingCallbacks: new Map(), _beanSkinPanelCards: [],
        _isRuntimeAliveForAsyncCallback() { return this.isValid; },
        _loadBeanSkinConfig(done) { done({ byId: new Map([[2001, { resourceMode: 'game_assets_atlas', atlasDataKey: 'data', atlasTextureKey: 'texture' }]]) }); },
        _withGameAssetsBundle(done) { done({}); },
        _loadAtlasDataFromBundle(bundle, key, label, done) { done(null, atlas); },
        _loadAtlasTextureFromBundle(bundle, key, label, done) { textureLoads.push(done); },
        disposeBeanSkinPanel() {}, textureLoads,
    }, sandbox.methods);
    return value;
}

// A texture arriving after scene teardown must not allocate 60 frames or install an old owner.
for (const mode of ['asset', 'dynamic']) {
    const old = runtime(), texture = new Asset(), image = new Asset();
    old._ensureBeanSkinAtlasLoaded(2001, () => assert.fail('late gameplay start'));
    old.releaseBeanSkinRuntimeResources();
    const before = frameAllocations;
    old.textureLoads.shift()(null, texture, { releaseMode: mode, imageAsset: image });
    assert.equal(frameAllocations, before, 'late atlas must not create frame objects');
    assert.equal(old._activeBeanSkinAtlasOwner, null);
    assert.equal(texture.refCount, 0);
    assert.equal(image.refCount, 0);
    assert.equal(texture.checks, 1);
    assert.equal(image.checks, 1);
}

// Ownership is per runtime even when Cocos supplies the same texture/image to both scenes.
for (let cycle = 0; cycle < 10; cycle++) {
    const a = runtime(), b = runtime(), texture = new Asset(), image = new Asset();
    let callbacks = 0;
    for (const owner of [a, b]) {
        for (let n = 0; n < 2; n++) owner._ensureBeanSkinAtlasLoaded(2001, (ok, err) => { assert(ok); assert.equal(err, null); callbacks++; });
        assert.equal(owner.textureLoads.length, 1);
        owner.textureLoads.shift()(null, texture, { releaseMode: 'asset', imageAsset: image });
        assert.equal(owner._activeBeanSkinAtlasOwner.frames.size, 60);
        owner._ensureBeanSkinAtlasLoaded(2001, ok => assert(ok));
        assert.equal(owner.textureLoads.length, 0);
    }
    assert.equal(callbacks, 4);
    assert.equal(texture.refCount, 2);
    assert.equal(image.refCount, 2);
    const oldOwner = a._activeBeanSkinAtlasOwner;
    a.releaseBeanSkinRuntimeResources();
    a._releaseBeanSkinAtlasOwner(oldOwner, 'repeat');
    assert.equal(texture.refCount, 1);
    assert(b._hasCompleteBeanSkinFrameMap(b._activeBeanSkinAtlasOwner.frames));
    b.releaseBeanSkinRuntimeResources();
    assert.equal(texture.refCount, 0);
    assert.equal(image.refCount, 0);
}

// A canceled load and the next scene may receive the shared texture in either order.
for (const oldFirst of [true, false]) {
    const old = runtime(), next = runtime(), texture = new Asset(), image = new Asset();
    old._ensureBeanSkinAtlasLoaded(2001, () => assert.fail('old callback'));
    next._ensureBeanSkinAtlasLoaded(2001, ok => assert(ok));
    old.releaseBeanSkinRuntimeResources();
    const before = frameAllocations;
    for (const value of oldFirst ? [old, next] : [next, old]) {
        value.textureLoads.shift()(null, texture, { releaseMode: 'asset', imageAsset: image });
    }
    assert.equal(frameAllocations - before, 60, 'only the incoming runtime creates atlas frames');
    assert.equal(texture.refCount, 1);
    assert.equal(image.refCount, 1);
    assert(next._hasCompleteBeanSkinFrameMap(next._activeBeanSkinAtlasOwner.frames));
    next.releaseBeanSkinRuntimeResources();
    assert.equal(texture.refCount, 0);
}

// Each async stage must stop before starting the next resource after teardown.
for (const stage of ['config', 'bundle', 'data']) {
    const value = runtime();
    let resume;
    if (stage === 'config') value._loadBeanSkinConfig = done => { resume = () => done({ byId: new Map([[2001, { resourceMode: 'game_assets_atlas' }]]) }); };
    if (stage === 'bundle') value._withGameAssetsBundle = done => { resume = () => done({}); };
    if (stage === 'data') value._loadAtlasDataFromBundle = (b, k, l, done) => { resume = () => done(null, atlas); };
    value._ensureBeanSkinAtlasLoaded(2001, () => assert.fail('canceled stage callback'));
    value.releaseBeanSkinRuntimeResources();
    resume();
    value._ensureBeanSkinAtlasLoaded(2001, () => assert.fail('new request after destroy'));
    assert.equal(value.textureLoads.length, 0);
}

const failing = runtime();
let failures = 0;
failing._ensureBeanSkinAtlasLoaded(2001, (ok, err) => { assert.equal(ok, false); assert(err); failures++; });
failing.textureLoads.shift()(new Error('texture missing'), null);
assert.equal(failures, 1);
failing._ensureBeanSkinAtlasLoaded(2001, ok => assert(ok));
failing.textureLoads.shift()(null, new Asset(), { releaseMode: 'dynamic', imageAsset: new Asset() });
assert.equal(failing._activeBeanSkinAtlasOwner.frames.size, 60);

const reentrant = runtime();
reentrant._ensureBeanSkinAtlasLoaded(2001, () => reentrant.releaseBeanSkinRuntimeResources());
reentrant._ensureBeanSkinAtlasLoaded(2001, () => assert.fail('callback after reentrant disposal'));
reentrant.textureLoads.shift()(null, new Asset(), { releaseMode: 'asset', imageAsset: new Asset() });
assert.equal(reentrant._activeBeanSkinAtlasOwner, null);
console.log('bean-skin-atlas-lifecycle.test.js passed (late atlas, shared refs, 10 scene loops; device memory unmeasured)');
