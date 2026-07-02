const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const installModules = read('assets/Scripts/Core/installGameCtrlModules.ts');
const warmup = read('assets/Scripts/Core/GameCtrlModules/PostPlayableWarmupModule.ts');
const session = read('assets/Scripts/Core/GameplaySessionController.ts');
const audioMgr = read('assets/Scripts/Core/AudioMgr.ts');
const audioManifest = read('assets/Scripts/Core/AudioManifest.ts');
const resultPanels = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const colorFx = read('assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts');
const commerce = read('assets/Scripts/Core/GameCtrlModules/HomeCommerceModule.ts');
const commerceController = read('assets/Scripts/Core/Panels/CommercePanelController.ts');
const skin = read('assets/Scripts/Core/GameCtrlModules/SkinBackgroundModule.ts');
const extractBootstrap = read('scripts/extract-bootstrap-bundle.js');
const patchBootstrap = read('scripts/patch-bootstrap-dynamic-assets.js');
const postbuildBundles = read('scripts/postbuild-minigame-bundles.js');
const postbuildWechat = read('scripts/postbuild-wechat-minigame.js');

assert.ok(installModules.includes('installPostPlayableWarmupModule'), 'post-playable warmup module must be installed with GameCtrl modules');
assert.ok(session.includes('runtime.startPostPlayableWarmup?.('), 'Game must start the warmup queue after UI ready');
assert.ok(!session.includes('runtime.preloadSettingsPanel?.();'), 'settings preload must not remain as a one-off Session side effect');
assert.ok(!session.includes("router.preloadHomeScene('gameplay-ready')"), 'Home preload must be owned by post-playable warmup');

for (const method of [
    'preloadGameplayAudioSet',
    '_ensureGameplayResultPanelPrefabsReady',
    '_withGameAssetsBundle',
    'scheduleRewardedAdPreload',
    'preloadSettingsPanel',
    'preloadAcquireResourcePanel',
    'preloadBackgroundSkinPanel',
    'ensureFreezeSpineFxSkeletonData',
    'ensurePinddSpineFxSkeletonData',
    'preloadHomeScene',
]) {
    assert.ok(warmup.includes(method), `warmup queue must cover ${method}`);
}

assert.ok(audioMgr.includes('preloadGameplayAudioSet(): void'), 'AudioMgr must expose a gameplay audio warmup method');
assert.ok(audioMgr.includes('this._loadFromBootstrapBundleAuto((bundle)'), 'BGM must try bootstrap before gameAssets');
assert.ok(audioMgr.includes('this._loadBgm(bundle, resourcePath, this.bgmAutoplayRequested, loadToken, loadFromGameAssets)'), 'bootstrap BGM must fall back to gameAssets in dev');
assert.ok(audioManifest.includes("'win',"), 'win SFX must be part of bootstrap-capable SFX');
assert.ok(audioManifest.includes("'winSettlement',"), 'settlement SFX must be part of bootstrap-capable SFX');

assert.ok(resultPanels.includes('shouldRequireBootstrapResultPanels'), 'result panels must have a release strictness gate');
assert.ok(resultPanels.includes('LOCAL_BOOTSTRAP_BUNDLE_NAME'), 'result panels must load from bootstrap first');
assert.ok(resultPanels.includes('loadPrefabsFromGameAssets'), 'result panels may fall back to gameAssets outside strict release');

for (const bootstrapPath of [
    'UI/Prefabs/Panels/WinPanel',
    'UI/Prefabs/Panels/RevivePanel',
    'UI/Prefabs/Panels/LosePanel',
    'Audio/bgm',
    'Audio/pindd/select',
    'Audio/win',
    'Audio/winSettlement',
    'Audio/lose',
]) {
    assert.ok(extractBootstrap.includes(bootstrapPath), `bootstrap extraction must include ${bootstrapPath}`);
    assert.ok(patchBootstrap.includes(bootstrapPath), `runtime bootstrap patch must include ${bootstrapPath}`);
}
assert.ok(patchBootstrap.includes('criticalGameAssetsPathMap'), 'bootstrap runtime patch must merge critical gameAssets entries');
assert.ok(patchBootstrap.includes("typeof value === 'string'"), 'critical dependency scan must handle Cocos compressed string UUID references');
assert.ok(patchBootstrap.includes('copyGameAssetImportArtifacts'), 'critical import assets must copy versioned import artifacts, not just plain uuid.json');
assert.ok(patchBootstrap.includes('copyGameAssetNativeArtifacts'), 'critical native assets must copy generated native artifacts without duplicating plain names');
assert.ok(patchBootstrap.includes('appendVersionHash'), 'critical copied assets must patch bootstrap import/native version maps');
assert.ok(patchBootstrap.includes('criticalNativeVersions'), 'bootstrap patch output must report critical native version map changes');
assert.ok(patchBootstrap.includes('findNativeArtifactForVersion'), 'critical native version maps must be verified against copied files');
assert.ok(
    postbuildBundles.indexOf("patch-home-assets-bundle.js', [runtimeRoot, 'gameAssets']") < postbuildBundles.indexOf('patch-bootstrap-dynamic-assets.js'),
    'gameAssets artifacts must be patched before bootstrap copies critical entries',
);
assert.ok(postbuildWechat.includes("SPINE_WASM_SUBPACKAGE_NAME = 'spineWasm'"), 'WeChat postbuild must declare the dedicated Spine wasm subpackage');
assert.ok(postbuildWechat.includes('ensureSpineWasmWechatSubpackage'), 'WeChat postbuild must move Spine wasm out of the hard main package');
assert.ok(postbuildWechat.includes('patchSpineWasmVirtualChunk'), 'WeChat postbuild must patch dynamic Spine wasm import paths after moving files');

assert.ok(colorFx.includes('PINDD_SPINE_PATTERN_COMPLETE_ROOT_NAME'), 'pattern-complete Spine FX must render from a dedicated FX root');
assert.ok(colorFx.includes('playPinddSpineFxAtWorldPosition'), 'pattern-complete Spine FX must play from captured world positions');
assert.ok(colorFx.includes('beanWorldPositions.length > PINDD_SPINE_FX_ACTIVE_LIMIT'), 'pattern-complete Spine FX must fail fast if all-board playback exceeds the active limit');
assert.ok(!colorFx.includes('PINDD_SPINE_PATTERN_COMPLETE_MAX_NODES'), 'pattern-complete Spine FX must not sample a partial board');
assert.ok(!colorFx.includes('PINDD_SPINE_PATTERN_COMPLETE_MAX_WAIT_SECONDS'), 'pattern-complete Spine FX must not use a fixed settlement timeout');
assert.ok(!colorFx.includes('waitForAll: false'), 'settlement must wait for the full-board c1 callbacks');

assert.ok(commerce.includes('preloadAcquireResourcePanel'), 'commerce module must expose acquire panel preload');
assert.ok(commerceController.includes('preloadAcquireResourcePanel(): void'), 'commerce controller must preload acquire panel prefab');
assert.ok(skin.includes('preloadBackgroundSkinPanel(): void'), 'skin module must expose background skin panel preload');

console.log('post-playable-warmup.test.js passed');
