const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const compile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
}).outputText;
const manifestModule = { exports: {} };
vm.runInNewContext(compile('assets/Scripts/Core/AudioManifest.ts'), { module: manifestModule, exports: manifestModule.exports });
const code = compile('assets/Scripts/Core/AudioMgr.ts');

function harness() {
    const loads = [], played = [], timers = new Map();
    let timerId = 0;
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, exports: module.exports, Map, Set, Error, console,
        setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
        require(id) {
            if (id === 'cc') return {
                _decorator: { ccclass: () => cls => cls }, AudioClip: class {}, AudioSource: class {}, Node: class {},
                director: { getScene: () => ({ name: 'Game' }) }, assetManager: {}, sys: { localStorage: { getItem: () => null } }, isValid: () => true,
            };
            if (id === './AudioManifest') return manifestModule.exports;
            if (id === './PackageNames') return { LOCAL_BOOTSTRAP_BUNDLE_NAME: 'bootstrap', GAME_ASSETS_BUNDLE_NAME: 'gameAssets' };
            if (id === './RuntimeLog') return { runtimeLog() {} };
            throw new Error(id);
        },
    });
    const audio = new module.exports.AudioMgr();
    audio.bootstrapBundle = { load(file, type, cb) { loads.push({ file, finish(error, clip = { file }) { cb(error, error ? null : clip); } }); } };
    audio.bootstrapBundleState = 'ready';
    audio.sfxSources = [{}]; audio.sfxEnabled = true;
    audio._playLoadedClip = (name, clip) => played.push({ name, clip });
    return { audio, loads, played, timers, expire() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } } };
}

{
    const h = harness(); let completed = 0;
    h.audio.preload('winColor', err => { assert.ifError(err); completed++; });
    h.audio.preload('winAll', err => { assert.ifError(err); completed++; });
    h.audio.play('winAll');
    assert.equal(h.loads.length, 1, 'aliases and actual playback share one load');
    assert.equal(completed, 0, 'preload completes after callback, not dispatch');
    h.loads[0].finish();
    assert.equal(completed, 2, 'all joined callbacks must finish even when they remove themselves');
    assert.equal(h.played.length, 1); assert.equal(h.played[0].name, 'winAll');
    assert.equal(h.audio.isSfxReady('winColor'), true); assert.equal(h.audio.isSfxReady('winAll'), true);
    assert.equal(h.audio.sfxClips.get('winColor'), h.audio.sfxClips.get('winAll'));
    assert.equal(h.timers.size, 0);
    h.audio.preload('winAll', err => { assert.ifError(err); completed++; });
    assert.equal(completed, 3); assert.equal(h.loads.length, 1);
}

{
    const h = harness();
    h.audio.preload('button'); h.audio.preload('revivePop');
    assert.equal(h.loads.length, 1);
    h.loads[0].finish();
    assert.equal(h.audio.isSfxReady('revivePop'), true);
    h.audio.play('select'); h.audio.play('fly');
    assert.equal(h.loads.length, 1, 'Game-disallowed playback must not dispatch extra loads');
}

{
    const h = harness(); let errors = 0, completed = 0;
    h.audio._loadFromGameAssetsBundleAuto = cb => cb(null);
    h.audio.preload('lose', error => { assert.ok(error); errors++; });
    h.loads[0].finish(new Error('missing audio'));
    assert.equal(errors, 1); assert.equal(h.timers.size, 0);
    h.audio.preload('lose', error => { assert.ifError(error); completed++; });
    assert.equal(h.loads.length, 2);
    h.loads[1].finish(); assert.equal(completed, 1);
}

{
    const h = harness(); let errors = 0, joined = 0;
    h.audio.preload('tick', error => { assert.ok(error); errors++; });
    h.expire(); assert.equal(errors, 1); assert.equal(h.audio.sfxLoadCallbacks.size, 0);
    h.audio.preload('tick', error => { assert.ifError(error); joined++; });
    assert.equal(h.loads.length, 1, 'timed-out waiter does not duplicate an uncancelled engine request');
    h.loads[0].finish();
    assert.equal(errors, 1); assert.equal(joined, 1); assert.equal(h.timers.size, 0);
}

{
    const h = harness(); let loaded = 0;
    const readyBundle = h.audio.bootstrapBundle;
    let bootstrapDone;
    h.audio.bootstrapBundle = null; h.audio.bootstrapBundleState = 'idle'; h.audio.preferRemoteAudio = true;
    h.audio._loadFromBootstrapBundleAuto = () => { h.audio.bootstrapBundleState = 'loading'; bootstrapDone = () => { h.audio.bootstrapBundle = readyBundle; h.audio._flushDeferredBootstrapSfxLoads(); }; };
    h.audio.preload('winAll', error => { assert.ifError(error); loaded++; });
    assert.equal(h.loads.length, 0);
    bootstrapDone(); assert.equal(h.loads.length, 1);
    h.loads[0].finish(); assert.equal(loaded, 1);
}

console.log('audio-preload-completion.test.js passed');
