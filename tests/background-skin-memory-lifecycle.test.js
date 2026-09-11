const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/SkinBackgroundModule.ts'), 'utf8');
let textureAllocations = 0;
const remoteLoads = [];
const bundleLoads = [];
const released = [];
const trace = [];

class Asset {
    constructor() { this.isValid = true; this.refCount = 0; this.name = ''; this.releaseChecks = 0; }
    addRef() { assert(this.isValid); this.refCount++; return this; }
    decRef() { assert(this.refCount > 0, 'release only an acquired ref'); this.refCount--; this.releaseChecks++; return this; }
    destroy() { this.isValid = false; }
}
class ImageAsset extends Asset {
    constructor() { super(); this.width = 1024; this.height = 1024; }
}
class Texture2D extends Asset {
    constructor() { super(); textureAllocations++; }
}
class SpriteFrame extends Asset {}
class Rect {}
const moduleRef = { exports: {} };
const shared = {
    ImageAsset, Texture2D, SpriteFrame, Rect,
    assetManager: {
        loadRemote(url, options, done) { remoteLoads.push({ url, options, done }); },
        loadBundle(name, done) { bundleLoads.push({ name, done }); },
        releaseAsset(asset) { released.push(asset); asset.destroy(); },
    },
    LEVEL_DATA_BUNDLE_NAME: 'levelData',
};
vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, {
    module: moduleRef, exports: moduleRef.exports, console, Map, Set,
    require(id) {
        if (id === '../GameCtrlShared') return shared;
        if (id === '../SkinResourceCdnService') return { SkinResourceCdnService: { inst: { getAssetUrl: asset => asset.url } } };
        if (id === '../DebugPerfTrace') return { debugPerfTrace: (event, data) => trace.push({ event, data }) };
        if (id === '../RuntimeLog') return { runtimeLog() {}, runtimeWarn() {} };
        if (id === '../RemoteDataCdnClient') return { isLocalBrowserPreview: () => false };
        if (id === '../HomeIconIdleWiggle') return {};
        if (id === '../WorkbenchPreviewService') return { isWorkbenchPreviewRequested: () => false };
        throw new Error(`unexpected import: ${id}`);
    },
}, { filename: 'SkinBackgroundModule.ts' });

function runtime() {
    const value = {
        isValid: true, node: { isValid: true },
        _backgroundSkinResourcesReleased: false,
        _skinBundleCache: new Map(), _skinBundleLoadingCallbacks: new Map(),
        _skinSpriteFrameLoadingCallbacks: new Map(),
        _backgroundSkinFrameCache: new Map(), _backgroundSkinIconCache: new Map(),
        _backgroundSkinFrameCacheMeta: new Map(), _backgroundSkinIconCacheMeta: new Map(),
        _backgroundSkinIconLoadQueue: [], _backgroundSkinIconLoadSeq: 0,
        _isRuntimeAliveForAsyncCallback() { return this.isValid && this.node.isValid; },
    };
    moduleRef.exports.installSkinBackgroundModule(value);
    value.getEquippedBackgroundSkinId = () => 1002;
    return value;
}
const skin = { id: 1002, backgroundAsset: { url: 'https://example.test/bg.png', format: 'png' } };

// Reproduce a download completing after scene teardown, before Cocos invalidates the node.
const outgoing = runtime();
let staleCallbacks = 0;
outgoing.loadBackgroundSkinSpriteFrame(skin, () => staleCallbacks++);
outgoing.releaseBackgroundSkinCachedSpriteFrames('runtime-destroy:Game');
const beforeLateDownload = textureAllocations;
const orphanImage = new ImageAsset();
remoteLoads.shift().done(null, orphanImage);
assert.equal(textureAllocations, beforeLateDownload, 'late image must not allocate a texture after teardown');
assert.equal(staleCallbacks, 0, 'canceled callbacks must not restart old gameplay');
assert.equal(outgoing._backgroundSkinFrameCache.size, 0, 'destroyed runtime cache stays empty');
assert.equal(outgoing._backgroundSkinFrameCacheMeta.size, 0);
assert.equal(outgoing._skinSpriteFrameLoadingCallbacks.size, 0);
assert.equal(orphanImage.refCount, 0);
assert.equal(orphanImage.releaseChecks, 1, 'schedule the unused image for reference-checked release');
assert.equal(released.length, 0, 'do not force-release loader assets shared with other scenes');

// A live scene still deduplicates requests, displays the texture, and retains one cache owner.
const active = runtime();
const delivered = [];
active.loadBackgroundSkinSpriteFrame(skin, (sf, err) => { assert.equal(err, null); delivered.push(sf); });
active.loadBackgroundSkinSpriteFrame(skin, sf => delivered.push(sf));
assert.equal(remoteLoads.length, 1);
const liveImage = new ImageAsset();
remoteLoads.shift().done(null, liveImage);
assert.equal(delivered.length, 2);
assert.equal(delivered[0], delivered[1]);
assert.equal(delivered[0].texture.image, liveImage);
assert.equal(delivered[0].refCount, 1);
assert.equal(liveImage.refCount, 1);
active.loadBackgroundSkinSpriteFrame(skin, sf => assert.equal(sf, delivered[0]));
assert.equal(remoteLoads.length, 0, 'cache hits do not redownload');
assert.equal(liveImage.refCount, 1, 'cache hit does not leak another owner');

// Old and new runtimes can receive the same loader ImageAsset in either callback order.
for (let cycle = 0; cycle < 10; cycle++) {
    const old = runtime();
    const next = runtime();
    const sharedImage = new ImageAsset();
    let nextFrame;
    old.loadBackgroundSkinSpriteFrame(skin, () => assert.fail('old runtime resumed'));
    next.loadBackgroundSkinSpriteFrame(skin, sf => { nextFrame = sf; });
    const oldLoad = remoteLoads.shift();
    const nextLoad = remoteLoads.shift();
    old.releaseBackgroundSkinCachedSpriteFrames('runtime-destroy:Home');
    const releaseCount = released.length;
    const allocations = textureAllocations;
    for (const load of cycle % 2 ? [oldLoad, nextLoad] : [nextLoad, oldLoad]) load.done(null, sharedImage);
    assert.equal(textureAllocations, allocations + 1, 'only the incoming runtime allocates');
    assert.equal(released.length, releaseCount, 'discard cannot force-destroy the incoming image');
    assert.equal(sharedImage.isValid, true);
    assert.equal(sharedImage.refCount, 1);
    assert.equal(nextFrame.texture.image, sharedImage);
    assert.equal(old._backgroundSkinFrameCache.size, 0);
    next.releaseBackgroundSkinCachedSpriteFrames('runtime-destroy:Game');
    next.releaseBackgroundSkinCachedSpriteFrames('runtime-destroy:Game');
    assert.equal(sharedImage.refCount, 0);
    assert.equal(nextFrame.refCount, 0);
    assert.equal(nextFrame.texture.refCount, 0);
}

// Destruction must drop queued icons and prevent a late config callback from starting more work.
const canceled = runtime();
canceled._backgroundSkinIconLoadQueue.push({ skin });
canceled._skinBundleCache.set('shared', {});
canceled.releaseBackgroundSkinCachedSpriteFrames();
const loadCount = remoteLoads.length;
canceled.loadBackgroundSkinSpriteFrame(skin, () => assert.fail('destroyed background callback'));
canceled.loadBackgroundSkinIconSpriteFrame({ id: 1002, iconAsset: skin.backgroundAsset }, () => assert.fail('destroyed icon callback'));
canceled._getSkinBundle('new-bundle', () => assert.fail('destroyed bundle callback'));
assert.equal(remoteLoads.length, loadCount);
assert.equal(bundleLoads.length, 0);
assert.equal(canceled._backgroundSkinIconLoadQueue.length, 0);
assert.equal(canceled._skinBundleCache.size, 0);

// A scene invalidated before explicit cleanup is also protected.
const invalid = runtime();
invalid.loadBackgroundSkinIconSpriteFrame({ id: 1002, iconAsset: skin.backgroundAsset }, () => assert.fail('invalid callback'));
invalid.node.isValid = false;
const invalidImage = new ImageAsset();
remoteLoads.shift().done(null, invalidImage);
assert.equal(invalid._backgroundSkinIconCache.size, 0);
assert.equal(invalidImage.releaseChecks, 1);

// Delayed bundle discovery must not continue into image loading or retain the old runtime cache.
for (const useLevelBundle of [false, true]) {
    const value = runtime();
    let deliverBundle;
    if (useLevelBundle) value._withLevelDataBundle = done => { deliverBundle = done; };
    value._loadSkinSpriteFrameAsset(useLevelBundle ? 'levelData' : 'skins', 'bg', 'local-bg', () => assert.fail('late bundle callback'));
    if (!useLevelBundle) deliverBundle = bundle => bundleLoads.shift().done(null, bundle);
    value.releaseBackgroundSkinCachedSpriteFrames();
    deliverBundle({ load() { assert.fail('must not start asset loading after teardown'); } });
    assert.equal(value._skinBundleCache.size, 0);
    assert.equal(value._skinBundleLoadingCallbacks.size, 0);
    assert.equal(value._skinSpriteFrameLoadingCallbacks.size, 0);
}

// Exercise both local SpriteFrame and local ImageAsset completions after teardown.
for (const imageBranch of [false, true]) {
    const value = runtime();
    const loads = [];
    const bundle = { load(key, type, done) { loads.push({ key, type, done }); } };
    value._skinBundleCache.set('skins', bundle);
    value._loadSpriteFrameWithCandidates = (load, candidates, done) => load(candidates[0], (_err, sf) => done(sf));
    value._loadSkinSpriteFrameAsset('skins', 'bg', 'local-bg', () => assert.fail('late local asset callback'));
    if (imageBranch) loads.shift().done(null, null);
    value.releaseBackgroundSkinCachedSpriteFrames();
    const allocations = textureAllocations;
    const asset = imageBranch ? new ImageAsset() : new SpriteFrame();
    asset.addRef(); // Another runtime already uses the same local resource.
    loads.shift().done(null, asset);
    assert.equal(asset.refCount, 1);
    assert.equal(asset.releaseChecks, 1);
    assert.equal(asset.isValid, true);
    assert.equal(textureAllocations, allocations);
    assert.equal(value._skinSpriteFrameLoadingCallbacks.size, 0);
}

// Normal local SpriteFrame and ImageAsset loading still deliver usable, retained backgrounds.
for (const imageBranch of [false, true]) {
    const value = runtime();
    const loads = [];
    value._skinBundleCache.set('skins', { load(key, type, done) { loads.push({ key, type, done }); } });
    value._loadSpriteFrameWithCandidates = (load, candidates, done) => load(candidates[0], (_err, sf) => done(sf));
    let frame;
    value.loadBackgroundSkinSpriteFrame({ id: 1002, assetBundle: 'skins', assetKey: 'bg' }, (sf, err) => {
        assert.equal(err, null); frame = sf;
    });
    if (imageBranch) loads.shift().done(null, null);
    const asset = imageBranch ? new ImageAsset() : new SpriteFrame();
    loads.shift().done(null, asset);
    assert.equal(imageBranch ? frame.texture.image : frame, asset);
    assert.equal(value._backgroundSkinFrameCache.get(1002), frame);
    assert.equal(frame.refCount, 1, 'normal local background retains a cache owner');
    assert.equal(value._skinSpriteFrameLoadingCallbacks.size, 0);
}

// Teardown during callback fan-out cannot hand a released texture to the remaining callers.
const reentrant = runtime();
reentrant.loadBackgroundSkinSpriteFrame(skin, () => reentrant.releaseBackgroundSkinCachedSpriteFrames());
reentrant.loadBackgroundSkinSpriteFrame(skin, () => assert.fail('callback after reentrant teardown'));
remoteLoads.shift().done(null, new ImageAsset());
assert.equal(reentrant._backgroundSkinFrameCache.size, 0);

// Network failures remain visible for live callers and do not poison a later retry.
const failing = runtime();
const networkError = new Error('network failed');
let errorCount = 0;
for (let n = 0; n < 2; n++) {
    failing.loadBackgroundSkinSpriteFrame(skin, (sf, err) => {
        assert.equal(sf, null); assert.equal(err, networkError); errorCount++;
    });
}
remoteLoads.shift().done(networkError, null);
assert.equal(errorCount, 2);
assert.equal(failing._skinSpriteFrameLoadingCallbacks.size, 0);
assert.equal(failing._backgroundSkinFrameCache.size, 0);
failing.loadBackgroundSkinSpriteFrame(skin, sf => assert(sf));
remoteLoads.shift().done(null, new ImageAsset());
assert.equal(failing._backgroundSkinFrameCache.size, 1);
assert.equal(remoteLoads.length, 0);
assert(trace.some(event => event.event === 'backgroundSkin.load.cancel'));
assert(trace.some(event => event.event === 'backgroundSkin.load.discard'));

console.log('background-skin-memory-lifecycle.test.js passed (async teardown, shared assets, live loads, errors; device memory unmeasured)');
