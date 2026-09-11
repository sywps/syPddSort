const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/DebugPerfTrace.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
class Sprite {}
class UITransform { setContentSize(width, height) { this.width = width; this.height = height; } }
class Label { static HorizontalAlign = { RIGHT: 2 }; }
class Widget { updateAlignment() {} }
class Node {
    constructor(name) { this.name = name; this.isValid = true; this.children = []; this.components = new Map(); }
    addChild(node) { this.children.push(node); }
    getChildByName(name) { return this.children.find(node => node.name === name); }
    addComponent(type) { const component = new type(); this.components.set(type, component); return component; }
    getComponent(type) { return this.components.get(type); }
    setSiblingIndex(index) { this.siblingIndex = index; }
}
class SpriteFrame {
    constructor(texture) { this.texture = texture; this.isValid = true; }
}
class Skeleton { static AnimationCacheMode = { SHARED_CACHE: 1 }; }
const gpu = { size: 4 * 1024 * 1024 };
const texture = { isValid: true, name: 'atlas', width: 1024, height: 1024, getGFXTexture: () => gpu };
const alias = { ...texture, name: 'alias' };
const unknown = { isValid: true, name: 'https://example.test/avatar?token=private', width: 40, height: 40, getGFXTexture: () => null };
const frame = new SpriteFrame(texture);
const spine = { wasmUtil: { wasm: { HEAPU8: new Uint8Array(4 * 1024 * 1024) } } };
const skeleton = { defaultCacheMode: 1, skeletonData: { textures: [texture] } };
const child = {
    isValid: true, children: [],
    getComponent(type) { return type === Sprite ? { spriteFrame: frame } : type === Skeleton ? skeleton : null; },
};
const canvas = new Node('Canvas');
const appInfo = { enableDebug: false };
const scene = { ...child, name: 'Game', children: [child], getComponent: () => null, getChildByName: name => name === 'Canvas' ? canvas : null };
const assets = [texture, alias, frame, unknown];
const root = { device: { memoryStatus: { textureSize: 20 * 1024 * 1024, bufferSize: 1024 * 1024 } } };
const deviceInfo = { platform: 'ios', model: 'not-for-logging' };
let platform = 'wechat';
let now = 10000;
const output = [];
const moduleRecord = { exports: {} };
const sandbox = {
    module: moduleRecord, exports: moduleRecord.exports, Map, Set,
    Date: { now: () => now },
    console: { warn: (tag, json) => output.push([tag, JSON.parse(json)]) },
    require(id) {
        if (id === 'cc') return {
            assetManager: { assets: { forEach: callback => assets.forEach(callback) } },
            director: { getScene: () => scene, root }, game: {}, sp: { Skeleton, spine }, Sprite, SpriteFrame,
            dynamicAtlasManager: { enabled: true, atlasCount: 1, textureSize: 2048 },
            Node, UITransform, Label, Widget, Color: { WHITE: 'white', BLACK: 'black' },
        };
        if (id === './MiniGamePlatform') return {
            getMiniGameBuildPlatform: () => platform, getMiniGameBuildMode: () => 'release',
            getWeChatMiniGameRuntime: () => ({ getPerformance: () => ({}), getDeviceInfo: () => deviceInfo, getAppBaseInfo: () => appInfo }),
        };
        throw new Error(`unexpected dependency: ${id}`);
    },
};
vm.runInNewContext(compiled, sandbox);
// Execute the real build script's release gate, including its saved original sink.
const postbuild = fs.readFileSync(path.join(__dirname, '../scripts/postbuild-wechat-minigame.js'), 'utf8');
const gateStart = postbuild.indexOf("'(function installPddReleaseLogGate(){'");
const gateLines = postbuild.slice(gateStart, postbuild.indexOf('\n        );', gateStart));
const gate = vm.runInNewContext(`[${gateLines}]`, {
    buildMode: 'release',
    releaseLogGateMarker: 'globalThis.__PDD_RELEASE_LOG_GATE_INSTALLED__=true;',
    releaseLogGateVersionMarker: 'globalThis.__PDD_RELEASE_LOG_GATE_VERSION__=5;',
}).join('\n');
vm.runInNewContext(gate, sandbox);
sandbox.__PDD_ENABLE_RELEASE_LOG_GATE__();
sandbox.console.warn('ordinary log', '{}');
assert.equal(output.length, 0, 'ordinary release logs remain muted');
const mutedWarn = sandbox.console.warn;
vm.runInNewContext('console.warn = console.__pddOriginalWarn || console.warn;', sandbox);
sandbox.console.warn('[PDD_MEMORY]', '{}');
assert.equal(output.length, 1, 'the existing device package can temporarily restore diagnostics');
output.length = 0;
sandbox.console.warn = mutedWarn;
const { debugPerfSnapshot, reportRuntimeMemorySnapshot } = moduleRecord.exports;
const scheduled = [];
const runtime = {
    node: { isValid: true }, levelData: { levelId: 92 },
    sfCache: new Map([['bean', frame]]), _spriteFrameCacheMeta: new Map([['bean', {}]]),
    _pinddSpineFxActiveCount: 1, _pinddSpineFxPool: { size: () => 80 },
    scheduleOnce(callback, delay) { assert.equal(delay, 10); scheduled.push(callback); },
};
debugPerfSnapshot('runtime.game.firstPlayable', runtime);
assert.equal(output.length, 1, 'release mode must emit the compact diagnostic');
let snapshot = output[0][1];
assert.equal(output[0][0], '[PDD_MEMORY]');
assert.equal(snapshot.revision, 'memory-breakdown-v4');
assert.equal(canvas.children.length, 0, 'normal play must not allocate a diagnostic overlay');
assert.equal(snapshot.runtimePlatform, 'ios');
assert.equal(snapshot.gfxTextureBytes, 20 * 1024 * 1024, 'engine totals include textures outside asset traversal');
assert.equal(snapshot.gfxBufferBytes, 1024 * 1024);
assert.equal(snapshot.dynamicAtlas.count, 1);
assert(!JSON.stringify(snapshot).includes('not-for-logging'));
assert.equal(snapshot.processMemoryBytes, null, 'unavailable process memory is never fabricated as zero');
assert.equal(snapshot.jsHeap, null);
assert.equal(snapshot.spineWasmCapacityBytes, 4 * 1024 * 1024);
assert.equal(snapshot.trackedTextureBytes, gpu.size, 'deduplicate by GPU allocation across asset aliases, sprites and skeletons');
assert.equal(snapshot.unavailableTextureSizes, 1);
assert.equal(snapshot.sceneNodeCount, 2);
assert.equal(snapshot.sceneSpineCount, 1);
assert.equal(snapshot.sharedSpineCount, 1);
assert.equal(snapshot.spriteFrameCacheSize, 1);
assert(!JSON.stringify(snapshot).includes('private'), 'do not log remote texture query data');
scheduled.pop()();
assert.equal(output.at(-1)[1].event, 'runtime.game.steady');
debugPerfSnapshot('runtime.game.firstPlayable', runtime);
const count = output.length;
runtime.levelData = { levelId: 93 };
scheduled.pop()();
assert.equal(output.length, count, 'a stale delayed sample must not report the next level');
reportRuntimeMemorySnapshot('color-fx.peak', runtime);
reportRuntimeMemorySnapshot('color-fx.peak', runtime);
assert.equal(output.length, count + 1, 'dense color completions must be throttled');
now += 2000;
reportRuntimeMemorySnapshot('color-fx.peak', runtime);
assert.equal(output.length, count + 2);
deviceInfo.platform = 'devtools';
root.device.memoryStatus = { textureSize: null, bufferSize: 0 };
reportRuntimeMemorySnapshot('runtime.game.steady', runtime);
assert.equal(output.at(-1)[1].runtimePlatform, 'devtools', 'build mode release must not be mistaken for device execution');
assert.equal(output.at(-1)[1].gfxTextureBytes, null, 'unknown totals must not be coerced to zero');
assert.equal(output.at(-1)[1].gfxBufferBytes, 0, 'a measured zero remains zero');
appInfo.enableDebug = true;
reportRuntimeMemorySnapshot('runtime.game.steady', runtime);
assert.equal(canvas.children.length, 1);
const overlay = canvas.children[0];
assert(overlay.getComponent(Label).string.includes('devtools'));
assert(overlay.getComponent(Label).string.includes('GPU纹理 N/A'));
assert(overlay.getComponent(Label).string.includes('缓冲 0.0'));
assert.equal(overlay.components.size, 3, 'overlay only has transform, label and widget; no touch listener or input blocker');
reportRuntimeMemorySnapshot('runtime.game.steady', runtime);
assert.equal(canvas.children.length, 1, 'repeated snapshots reuse the same diagnostic node');
appInfo.enableDebug = false;
reportRuntimeMemorySnapshot('runtime.game.steady', runtime);
assert.equal(overlay.active, false, 'turning debug off hides the overlay');
delete spine.wasmUtil.wasm.HEAPU8;
reportRuntimeMemorySnapshot('runtime.destroy.after', runtime);
assert.equal(output.at(-1)[1].spineWasmCapacityBytes, null, 'unloaded WASM capacity must remain unavailable');
unknown.getGFXTexture = () => { throw new Error('texture inspection failed'); };
reportRuntimeMemorySnapshot('runtime.destroy.after', runtime);
assert.equal(output.at(-1)[1].unavailable, true, 'inspection failures must be explicit');
platform = 'douyin';
const previousCount = output.length;
debugPerfSnapshot('runtime.game.firstPlayable', runtime);
assert.equal(output.length, previousCount);
assert.equal(scheduled.length, 0);
console.log('runtime-memory-diagnostics.test.js passed');
