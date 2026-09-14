const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const helper = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('assets/Scripts/Core/RuntimeAssetRelease.ts', 'utf8')), { exports: helper.exports });
// Match Cocos 3.8 ReleaseManager's UUID-keyed next-tick queue and ref-count check.
const queue = new Map();
class Asset {
    constructor(uuid = '') { this._uuid = uuid; this.refCount = 0; this.isValid = true; this.destroyCount = 0; }
    addRef() { assert(this.isValid); this.refCount++; return this; }
    decRef() { assert(this.refCount > 0); this.refCount--; queue.set(this._uuid, this); return this; }
    destroy() { assert.equal(this.refCount, 0); assert(this.isValid); this.isValid = false; this.destroyCount++; }
}
const flush = () => { const assets = [...queue.values()]; queue.clear(); for (const a of assets) if (a.isValid && a.refCount === 0) a.destroy(); };
const source = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts', 'utf8');
const ast = ts.createSourceFile('module.ts', source, ts.ScriptTarget.Latest, true);
const names = ['_cacheSpriteFrame', '_addCacheRef', '_decCacheRef', '_retainSpriteFrameCacheResource', '_releaseSpriteFrameCacheResource', '_releaseDynamicSpriteFrame', '_releaseBootstrapBeanAtlas', 'releaseSceneScopedSpriteFrames'];
const methods = [];
function visit(n) { if (ts.isMethodDeclaration(n) && names.includes(n.name.getText(ast))) methods.push(n.getText(ast)); ts.forEachChild(n, visit); }
visit(ast);
assert.equal(methods.length, names.length);
const sandbox = { ...helper.exports, Map, Set, console, isDebugPerfTraceEnabled: () => false, runtimeLog() {}, debugPerfSnapshot() {}, SPRITE_FRAME_SCOPE_DYNAMIC: 'dynamic', SPRITE_FRAME_SCOPE_SHARED_UI: 'shared-ui', SPRITE_FRAME_SCOPE_SCENE_HOME: 'scene-home', SPRITE_FRAME_SCOPE_SCENE_GAME: 'scene-game', SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP: 'startup-bootstrap' };
vm.runInNewContext(compile(`globalThis.methods={${methods.join(',\n')}}`), sandbox);
function runtime() { return Object.assign({ sfCache: new Map(), _spriteFrameCacheMeta: new Map(), _bootstrapAtlasFrameCache: new Map(), _inferSpriteFrameScope: (_, s) => s, _getSpriteFrameTextureForDiagnostics: sf => sf.texture, _isSpriteFrameStillInUse: () => false }, sandbox.methods); }
function atlas(owner, texture, image) {
    const frames = Array.from({ length: 60 }, (_, i) => Object.assign(new Asset(), { name: `b${i}`, texture }));
    for (const f of frames) { owner._cacheSpriteFrame(f, f.name, { releaseMode: 'dynamic', texture, imageAsset: image, scope: 'startup-bootstrap' }); owner._bootstrapAtlasFrameCache.set(f.name, f); }
    owner._bootstrapBeanAtlasTexture = texture; owner._bootstrapBeanAtlasImageAsset = image; owner._bootstrapBeanAtlasTextureReleaseMode = 'dynamic';
    return frames;
}
for (let i = 0; i < 10; i++) {
    const owner = runtime(), texture = new Asset(), image = new Asset(`imported-image-${i}`);
    const frames = atlas(owner, texture, image);
    owner.releaseSceneScopedSpriteFrames('Game', 'runtime-destroy');
    owner.releaseSceneScopedSpriteFrames('Game', 'runtime-destroy');
    flush();
    for (const a of [texture, image, ...frames]) assert.equal(a.destroyCount, 1);
    assert.equal(image._uuid, `imported-image-${i}`);
}
// Incoming scene and asynchronous preview keep their references through outgoing cleanup.
const outgoing = runtime(), incoming = runtime(), texture = new Asset(), image = new Asset('shared-import');
const frames = atlas(outgoing, texture, image);
atlas(incoming, texture, image);
frames[0].addRef(); texture.addRef();
outgoing._releaseBootstrapBeanAtlas('equip-non-default');
flush();
assert(texture.isValid && image.isValid && frames[0].isValid);
incoming.releaseSceneScopedSpriteFrames('Home', 'runtime-destroy');
flush();
assert(texture.isValid && frames[0].isValid);
frames[0].decRef(); texture.decRef(); flush();
assert.equal(texture.destroyCount, 1); assert.equal(frames[0].destroyCount, 1);
// Evicting one member must not destroy a texture shared by the remaining atlas members.
const owner = runtime(), t = new Asset(), img = new Asset('member-image'), members = atlas(owner, t, img);
owner._releaseDynamicSpriteFrame(members[0].name, members[0], owner._spriteFrameCacheMeta.get(members[0].name), 'eviction'); flush();
assert(t.isValid); assert.equal(members[0].destroyCount, 1);
owner.releaseSceneScopedSpriteFrames('Game', 'runtime-destroy'); flush(); assert.equal(t.destroyCount, 1);
console.log('runtime-atlas-release.test.js passed: ten cycles, delayed preview, shared scenes, individual eviction');

const textures = [], createdFrames = [];
class Texture extends Asset {
    constructor() { super(); textures.push(this); }
    set image(value) { if (value.failReset) throw Error('injected texture upload failure'); this.sourceImage = value; }
}
class Frame extends Asset {
    constructor() { super(); createdFrames.push(this); }
    set rect(value) { if (value.w < 0) throw Error('injected frame setup failure'); }
}
class Image extends Asset {}
const routeSource = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts', 'utf8');
const routeAst = ts.createSourceFile('route.ts', routeSource, ts.ScriptTarget.Latest, true);
const routeMethods = [];
function routeVisit(n) { if (ts.isMethodDeclaration(n) && ['_loadBeanAtlasFromBundle', '_loadAtlasTextureFromBundle'].includes(n.name.getText(routeAst))) routeMethods.push(n.getText(routeAst)); ts.forEachChild(n, routeVisit); }
routeVisit(routeAst);
const routeSandbox = { ...helper.exports, SpriteFrame: Frame, Texture2D: Texture, ImageAsset: Image, Rect: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }, getRenderReadyAtlasImageAsset: t => t?.sourceImage || null, console: { error() {} }, runtimeLog() {}, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH: 'data', LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH: 'texture' };
vm.runInNewContext(compile(`globalThis.methods={${routeMethods.join(',\n')}}`), routeSandbox);
function loadAtlas(frames, options = {}) {
    const r = Object.assign(runtime(), routeSandbox.methods, { isValid: !options.canceled });
    const image = Object.assign(new Image('source-image'), { failReset: options.failReset });
    r._loadAtlasDataFromBundle = (_, __, ___, done) => done(null, { frames });
    const bundle = { load(_, type, done) { type === Image ? done(null, image) : done(Error('try next asset type'), null); } };
    let finished = 0;
    r._loadBeanAtlasFromBundle(bundle, () => finished++);
    assert.equal(finished, 1);
    return r;
}
const rect = { x: 0, y: 0, w: 10, h: 10 };
for (const options of [{ failReset: true }, { canceled: true }]) {
    const r = loadAtlas({ bean: rect }, options); flush();
    assert.equal(textures.at(-1).destroyCount, 1); assert.equal(r.sfCache.size, 0);
}
const failed = loadAtlas({ good: rect, bad: { ...rect, w: -1 } }); flush();
assert.equal(failed.sfCache.size, 0); assert.equal(textures.at(-1).destroyCount, 1);
assert.equal(createdFrames.at(-1).destroyCount, 1); assert.equal(createdFrames.at(-2).destroyCount, 1);
const retry = loadAtlas({ good: rect }); assert.equal(retry._bootstrapBeanAtlasReady, true);
retry.releaseSceneScopedSpriteFrames('Game', 'runtime-destroy'); flush(); assert.equal(textures.at(-1).destroyCount, 1);
console.log('runtime-atlas-release.test.js passed: failed upload, canceled load, partial frame failure and successful retry');
