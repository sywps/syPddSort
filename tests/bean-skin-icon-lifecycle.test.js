const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const file = path.resolve(__dirname, '../assets/Scripts/Core/GameCtrlModules/BeanSkinModule.ts');
const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['loadBeanSkinIconSpriteFrame', 'releaseBeanSkinRuntimeResources'];
const methods = [];
function visit(node) {
    if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast))) methods.push(node.getText(ast));
    ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(methods.length, 2);
class Frame {
    constructor() { this.isValid = true; this.refCount = 0; this.releaseChecks = 0; }
    addRef() { assert(this.isValid); this.refCount++; return this; }
    decRef() { assert(this.refCount > 0); this.refCount--; this.releaseChecks++; return this; }
}
const forced = [];
const sandbox = {
    SpriteFrame: Frame, Sprite: class Sprite {}, runtimeWarn() {},
    assetManager: { releaseAsset(frame) { forced.push(frame); frame.isValid = false; } },
};
vm.runInNewContext(ts.transpileModule(`globalThis.methods = {${methods.join(',\n')}}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, sandbox);
const skin = { id: 2001, iconKey: 'BeanSkins/icons/bean_skin_02' };
function runtime() {
    const loads = [];
    const result = Object.assign({
        isValid: true, _beanSkinIconLoadsCancelled: false,
        _beanSkinIconCache: new Map(), _beanSkinIconLoadingCallbacks: new Map(),
        _beanSkinPanelCards: [],
        _isRuntimeAliveForAsyncCallback() { return this.isValid; },
        _withGameAssetsBundle(done) { done({ load: (key, type, callback) => loads.push({ key, type, callback }) }); },
        disposeBeanSkinPanel() {}, _releaseBeanSkinAtlasOwner() {}, loads,
    }, sandbox.methods);
    return result;
}

const old = runtime();
old.loadBeanSkinIconSpriteFrame(skin, () => assert.fail('destroyed runtime callback'));
old.releaseBeanSkinRuntimeResources();
const lateFrame = new Frame();
old.loads.shift().callback(null, lateFrame);
assert.equal(old._beanSkinIconCache.size, 0, 'late icon must not repopulate destroyed cache');
assert.equal(lateFrame.refCount, 0);
assert.equal(lateFrame.releaseChecks, 1, 'unused loader frame enters reference-checked release');

// Two runtimes share the same loaded frame; destroying either returns only its cache ownership.
for (let cycle = 0; cycle < 10; cycle++) {
    const a = runtime(), b = runtime(), shared = new Frame();
    let delivered = 0;
    for (const owner of [a, b]) {
        owner.loadBeanSkinIconSpriteFrame(skin, frame => { assert.equal(frame, shared); delivered++; });
        owner.loadBeanSkinIconSpriteFrame(skin, frame => { assert.equal(frame, shared); delivered++; });
        assert.equal(owner.loads.length, 1, 'coalesce live duplicate requests');
        owner.loads.shift().callback(null, shared);
        owner.loadBeanSkinIconSpriteFrame(skin, frame => assert.equal(frame, shared));
        assert.equal(owner.loads.length, 0, 'reuse cached image');
    }
    assert.equal(delivered, 4);
    assert.equal(shared.refCount, 2);
    a.releaseBeanSkinRuntimeResources();
    assert.equal(shared.refCount, 1);
    assert(shared.isValid, 'incoming UI must keep its shared texture');
    a.releaseBeanSkinRuntimeResources();
    assert.equal(shared.refCount, 1, 'teardown is idempotent');
    b.releaseBeanSkinRuntimeResources();
    assert.equal(shared.refCount, 0);
}
assert.equal(forced.length, 0, 'icon cleanup must not force release a shared frame');

// A delayed bundle callback after teardown cannot start another asset request.
const bundleLate = runtime();
let deliverBundle;
bundleLate._withGameAssetsBundle = done => { deliverBundle = done; };
bundleLate.loadBeanSkinIconSpriteFrame(skin, () => assert.fail('late bundle caller'));
bundleLate.releaseBeanSkinRuntimeResources();
deliverBundle({ load() { assert.fail('loading after disposal'); } });
bundleLate.loadBeanSkinIconSpriteFrame(skin, () => assert.fail('new call after disposal'));
assert.equal(bundleLate._beanSkinIconLoadingCallbacks.size, 0);

// A failed in-flight candidate must not launch the next candidate on an invalid runtime.
const invalid = runtime();
invalid.loadBeanSkinIconSpriteFrame(skin, () => assert.fail('invalid runtime callback'));
invalid.isValid = false;
invalid.loads.shift().callback(new Error('missing'), null);
assert.equal(invalid.loads.length, 0);
assert.equal(invalid._beanSkinIconLoadingCallbacks.size, 0);

// Live error handling still reports missing resources, and a later retry can succeed.
const active = runtime();
let errors = 0;
active.loadBeanSkinIconSpriteFrame(skin, (frame, err) => { assert.equal(frame, null); assert(err); errors++; });
active.loads.shift().callback(new Error('missing'), null);
active.loads.shift().callback(new Error('missing'), null);
assert.equal(errors, 1);
assert.equal(active._beanSkinIconLoadingCallbacks.size, 0);
active.loadBeanSkinIconSpriteFrame(skin, frame => assert(frame));
active.loads.shift().callback(null, new Frame());
assert.equal(active._beanSkinIconCache.size, 1);

// The first callback may destroy the runtime; do not deliver an unowned frame afterward.
const reentrant = runtime();
reentrant.loadBeanSkinIconSpriteFrame(skin, () => reentrant.releaseBeanSkinRuntimeResources());
reentrant.loadBeanSkinIconSpriteFrame(skin, () => assert.fail('callback after teardown'));
reentrant.loads.shift().callback(null, new Frame());
assert.equal(reentrant._beanSkinIconCache.size, 0);
console.log('bean-skin-icon-lifecycle.test.js passed (late loads, shared ownership, errors; device memory unmeasured)');
