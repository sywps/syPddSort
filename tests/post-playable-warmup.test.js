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
const sceneHomeEntry = read('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts');
const audioMgr = read('assets/Scripts/Core/AudioMgr.ts');
const audioManifest = read('assets/Scripts/Core/AudioManifest.ts');
const resultPanels = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const homeAdFlow = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const colorFx = read('assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts');
const freezeFx = read('assets/Scripts/Core/GameCtrlModules/GameplayFreezeEffectModule.ts');
const commerce = read('assets/Scripts/Core/GameCtrlModules/HomeCommerceModule.ts');
const commerceController = read('assets/Scripts/Core/Panels/CommercePanelController.ts');
const settingsPanel = read('assets/Scripts/Core/Panels/SettingsPanelController.ts');
const skin = read('assets/Scripts/Core/GameCtrlModules/SkinBackgroundModule.ts');
const skinCdn = read('assets/Scripts/Core/SkinResourceCdnService.ts');
const topHud = read('assets/Scripts/Core/GameCtrlModules/TopHudModule.ts');
const adRewardHint = read('assets/Scripts/Core/GameCtrlModules/GameplayAdRewardHintModule.ts');
const gameScene = read('assets/BootstrapBundle/Scenes/Game.scene');
const extractBootstrap = read('scripts/extract-bootstrap-bundle.js');
const patchBootstrap = read('scripts/patch-bootstrap-dynamic-assets.js');
const postbuildBundles = read('scripts/postbuild-minigame-bundles.js');
const postbuildWechat = read('scripts/postbuild-wechat-minigame.js');
const buildWechat = read('scripts/build-wechat.js');
const patchHomeAssetsBundle = read('scripts/patch-home-assets-bundle.js');
const writeWechatBuildConfig = read('scripts/write-wechat-build-config.js');
const writeSkinCdn = read('scripts/write-skin-data-cdn.js');

assert.ok(installModules.includes('installPostPlayableWarmupModule'), 'post-playable warmup module must be installed with GameCtrl modules');
assert.ok(session.includes('runtime.startPostPlayableWarmup?.('), 'Game must start the warmup queue after UI ready');
assert.ok(
    session.includes("runtime.scheduleRewardedAdPreload?.('gameplay-ready-fallback', 0);"),
    'Game must retain an idempotent first-playable fallback for uncommon level-entry paths',
);
assert.ok(!session.includes('runtime.preloadSettingsPanel?.();'), 'settings preload must not remain as a one-off Session side effect');
assert.ok(!session.includes("router.preloadHomeScene('gameplay-ready')"), 'Home preload must not be an unconditional Session side effect');

for (const reason of [
    'late-loading:local-assets-dispatched',
    'late-loading:fast-game-assets-dispatched',
    'late-loading:fast-bootstrap-assets-dispatched',
    'late-loading:game-assets-dispatched',
]) {
    assert.ok(
        sceneHomeEntry.includes(`scheduleRewardedAdPreload?.('${reason}', 0)`),
        `normal level route must request a non-gating rewarded ad after required asset dispatch: ${reason}`,
    );
}
assert.ok(
    (sceneHomeEntry.match(/let requiredAssetRequestsDispatched = false;/g) || []).length >= 4,
    'all normal route seams must latch synchronous asset callbacks until the ad request has been dispatched',
);
assert.ok(
    (sceneHomeEntry.match(/if \(!requiredAssetRequestsDispatched\) return;/g) || []).length >= 4,
    'cached assets must not complete gameplay initialization before the late-Loading ad request',
);

for (const method of [
    'preloadGameplayAudioSet',
    '_ensureGameplayResultPanelPrefabsReady',
]) {
    assert.ok(warmup.includes(method), `warmup queue must cover ${method}`);
}
assert.ok(!warmup.includes('scheduleRewardedAdPreload'), 'rewarded-ad preload must not wait in the serial optional-resource queue');
assert.ok(!warmup.includes("name: 'rewarded-ad'"), 'rewarded-ad must not remain a busy-paused warmup task');
const firstPlayableIndex = session.indexOf("markStartupTrace('startup_first_playable_ready'");
const rewardedAdPreloadIndex = session.indexOf("runtime.scheduleRewardedAdPreload?.('gameplay-ready-fallback', 0);");
const startupServicesIndex = session.indexOf('runtime.onGameplayUiReadyForStartupServices?.();');
const warmupStartIndex = session.indexOf("runtime.startPostPlayableWarmup?.('gameplay-ready');");
assert.ok(
    firstPlayableIndex >= 0 && rewardedAdPreloadIndex > firstPlayableIndex,
    'the fallback must remain post-first-playable even though normal routes request inventory earlier',
);
assert.ok(startupServicesIndex > rewardedAdPreloadIndex, 'the idempotent fallback must precede optional startup services');
assert.ok(warmupStartIndex > rewardedAdPreloadIndex, 'optional audio/prefab warmup must not own rewarded-ad preload');
assert.ok(homeAdFlow.includes('const safeDelay = Math.max(0, Number(delaySeconds) || 0);'), 'zero-delay rewarded-ad preload must not be forced to wait one second');
assert.ok(homeAdFlow.includes('if (safeDelay <= 0)'), 'zero-delay rewarded-ad preload must dispatch inline');
assert.ok(homeAdFlow.includes('REWARDED_AD_PRELOAD_RETRY_SECONDS = [2, 5, 15, 30]'), 'failed warm-slot loads must use the bounded retry schedule');
assert.ok(homeAdFlow.includes('this.scheduleRewardedAdPreload(replenishReason, 0);'), 'post-outcome replenishment must have no fixed delay');
assert.ok(!homeAdFlow.includes('this.scheduleRewardedAdPreload(replenishReason, 1.5);'), 'the old post-outcome inventory gap must be removed');
assert.ok(!homeAdFlow.includes('广告准备中'), 'pre-ad loading must not add a custom preparation prompt');
for (const optionalTask of ['gameAssets-bundle', 'home-scene', 'top-hud-prefab', 'settings-panel', 'acquire-resource-panel', 'skin-panel']) {
    assert.ok(!warmup.includes(`name: '${optionalTask}'`), `post-playable warmup must not retain optional route resource: ${optionalTask}`);
}

assert.ok(!warmup.includes('getMiniGameBuildMode'), 'post-playable warmup must not branch on debug/release');
assert.ok(!warmup.includes('shouldUseConservativePostPlayableWarmup'), 'post-playable warmup must use the same policy for debug and release');
assert.ok(!warmup.includes('releaseMiniGame'), 'post-playable warmup must not skip resources only in release');
assert.ok(warmup.includes('_runNextPostPlayableWarmupTask'), 'post-playable warmup must run through a central queue');
assert.ok(warmup.includes('POST_PLAYABLE_WARMUP_TASK_GAP_SECONDS'), 'post-playable warmup must leave a frame gap between resource tasks');
assert.ok(warmup.includes('POST_PLAYABLE_WARMUP_BUSY_RETRY_SECONDS'), 'post-playable warmup must pause optional work while gameplay is busy');
assert.ok(warmup.includes('_spriteFrameLoadInFlight'), 'post-playable warmup must wait for active SpriteFrame loads before starting more optional work');
assert.ok(warmup.includes('_spriteFrameApplyPending'), 'post-playable warmup must wait for pending SpriteFrame applies before starting more optional work');
assert.ok(!warmup.includes('for (const task of tasks)'), 'post-playable warmup tasks must not all be scheduled independently');
assert.ok(!warmup.includes('ensureGameplayResultPanelsCreated?.()'), 'post-playable warmup must preload result prefabs without instantiating hidden panels');
const gameplayAudioTaskIndex = warmup.indexOf("name: 'gameplay-audio'");
const resultPanelsTaskIndex = warmup.indexOf("name: 'result-panels'");
assert.ok(gameplayAudioTaskIndex >= 0, 'gameplay audio warmup task must exist');
assert.ok(resultPanelsTaskIndex >= 0, 'result panel warmup task must exist');
assert.ok(
    warmup.slice(gameplayAudioTaskIndex, resultPanelsTaskIndex).includes('pauseWhenBusy: true'),
    'gameplay audio warmup must pause while placement/input/resource work is active',
);
const nextResultPanelsTaskIndex = warmup.indexOf('name: ', resultPanelsTaskIndex + 1);
assert.ok(
    nextResultPanelsTaskIndex < 0,
    'result panels must be the final task in the optional-resource warmup queue',
);
assert.ok(
    warmup.slice(resultPanelsTaskIndex, nextResultPanelsTaskIndex).includes('pauseWhenBusy: true'),
    'result-panel warmup must pause while placement/input/resource work is active',
);
assert.ok(warmup.includes('runtime.activeBoardTouches instanceof Map'), 'warmup busy detection must include active board touches');
assert.ok(!warmup.includes('REWARDED_AD_WARMUP_DELAY_SECONDS'), 'the removed rewarded-ad warmup delay must not remain');
assert.ok(!warmup.includes("name: 'freeze-spine'"), 'freeze Spine must not run as a fixed post-playable warmup task');
assert.ok(!warmup.includes("name: 'pindd-spine'"), 'pindd Spine must not run as a fixed post-playable warmup task');
assert.ok(freezeFx.includes('ensureFreezeSpineFxSkeletonData'), 'freeze Spine must remain available for first-use loading');
assert.ok(colorFx.includes('ensurePinddSpineFxSkeletonData'), 'pindd Spine must remain available for first-use loading');
assert.ok(!settingsPanel.includes('ensureSpriteFramesReady'), 'settings preload must not batch-load all settings SpriteFrames during Game rendering');
assert.ok(!settingsPanel.includes('runtime._loadSpriteFrameByName(name'), 'settings preload must rely on prefab ownership instead of SpriteFrame burst loads');
assert.ok(settingsPanel.includes('loadPrefab();'), 'settings preload must still load the prefab itself');
assert.ok(!settingsPanel.includes("preloadHomeScene('settings-home-intent')"), 'opening Settings must not create a competing speculative Home scene load');

assert.ok(audioMgr.includes('preloadGameplayAudioSet(): void'), 'AudioMgr must expose a gameplay audio warmup method');
assert.ok(audioMgr.includes('this._loadFromBootstrapBundleAuto((bundle)'), 'BGM must try bootstrap before gameAssets');
assert.ok(audioMgr.includes('this._loadBgm(bundle, resourcePath, this.bgmAutoplayRequested, loadToken, loadFromGameAssets)'), 'bootstrap BGM must fall back to gameAssets in dev');
assert.ok(audioManifest.includes("'win',"), 'win SFX must be part of bootstrap-capable SFX');
assert.ok(audioManifest.includes("'winSettlement',"), 'settlement SFX must be part of bootstrap-capable SFX');

assert.ok(!resultPanels.includes('getMiniGameBuildMode'), 'result panel resource loading must not branch on debug/release');
assert.ok(!resultPanels.includes('shouldRequireBootstrapResultPanels'), 'result panels must be bootstrap-strict in every build');
assert.ok(resultPanels.includes('LOCAL_BOOTSTRAP_BUNDLE_NAME'), 'result panels must load from bootstrap first');
assert.ok(resultPanels.includes('isMiniGameRuntime'), 'result panel preview source path must be gated by runtime, not debug/release');
assert.ok(resultPanels.includes('GAME_ASSETS_BUNDLE_NAME'), 'Browser preview may load source prefabs from the gameAssets bundle');
assert.ok(resultPanels.includes('if (isMiniGameRuntime())'), 'minigame result panels must remain bootstrap-strict');
assert.ok(resultPanels.includes('preview-source'), 'browser preview source load errors must be clearly labeled');
assert.ok(resultPanels.includes('const loadNext = (index: number): void =>'), 'missing result prefabs must load through one sequential owner');
assert.ok(resultPanels.includes('loadNext(index + 1);'), 'result-prefab loading must advance only after the previous prefab completes');
assert.ok(!resultPanels.includes('for (const kind of missingKinds)'), 'result prefabs must not allocate/parse in a three-request burst');
assert.ok(resultPanels.includes('previous.removeFromParent();'), 'replacing a result overlay must synchronously detach the old blocker before deferred destruction');
assert.ok(!gameplayView.includes('runtime.ensureGameplayResultPanelsCreated?.();'), 'level UI rebuild must not eagerly instantiate all hidden result panels');
const ensureResultPanelsStart = homeAdFlow.indexOf('ensureGameplayResultPanelsCreated(');
const ensureResultPanelsEnd = homeAdFlow.indexOf('instantiateResultOverlay(', ensureResultPanelsStart);
const ensureResultPanelsSource = homeAdFlow.slice(ensureResultPanelsStart, ensureResultPanelsEnd);
assert.ok(ensureResultPanelsStart >= 0 && ensureResultPanelsEnd > ensureResultPanelsStart, 'result panel creation method must remain inspectable');
assert.ok(ensureResultPanelsSource.includes("const needsWin = target === 'win' || target === 'all';"), 'result panel creation must support win-only instances');
assert.ok(ensureResultPanelsSource.includes("const needsRevive = target === 'revive' || target === 'lose-flow' || target === 'all';"), 'loss flow must create its revive instance on demand');
assert.ok(ensureResultPanelsSource.includes("const needsLose = target === 'lose' || target === 'lose-flow' || target === 'all';"), 'loss flow must create its final lose instance on demand');
assert.ok(!ensureResultPanelsSource.includes('this.destroyGameplayResultOverlays();'), 'creating one result kind must not destroy unrelated valid result instances');
assert.ok(settlement.includes("ensureGameplayResultPanelsCreated?.('win')"), 'win settlement must request only its own panel instance');
assert.ok(settlement.includes("ensureGameplayResultPanelsCreated?.('lose-flow')"), 'loss settlement must request only revive and final-lose instances');

assert.ok(postbuildWechat.includes('const debugLevelDataBundle = false;'), 'WeChat debug must not add a debug-only levelData bundle');
assert.ok(!postbuildWechat.includes("const debugLevelDataBundle = buildMode === 'debug';"), 'WeChat build package layout must not branch on debug/release');
assert.ok(!writeWechatBuildConfig.includes("root: 'db://assets/LevelData'"), 'WeChat debug build config must not output local LevelData bundle');
assert.ok(buildWechat.includes("assertRuntimeLocalBundleAbsent(runtimeDir, 'levelData'"), 'WeChat build must fail if local levelData remains in the runtime package');
assert.ok(buildWechat.includes("assertRuntimeBundleNoPathPrefix(runtimeInfo.gameAssetsDir, 'gameAssets', 'Skins/');"), 'WeChat debug and release must both reject local skin mirrors in gameAssets');
assert.ok(!buildWechat.includes("buildMode === 'debug' ? ['Skins/skins'"), 'WeChat debug must not require local skin mirror assets');
assert.ok(!patchHomeAssetsBundle.includes("buildMode !== 'release'"), 'skin mirror pruning must not be release-only');

for (const bootstrapPath of [
    'UI/Prefabs/Panels/WinPanel',
    'UI/Prefabs/Panels/RevivePanelV2',
    'UI/Prefabs/Panels/BufferFullRevivePanelV2',
    'UI/Prefabs/Panels/LosePanel',
    'Audio/bgm',
    'Audio/pindd/bean_pickup',
    'Audio/win',
    'Audio/winSettlement',
    'Audio/lose',
]) {
    assert.ok(extractBootstrap.includes(bootstrapPath), `bootstrap extraction must include ${bootstrapPath}`);
    assert.ok(patchBootstrap.includes(bootstrapPath), `runtime bootstrap patch must include ${bootstrapPath}`);
}
const bootstrapImageRoot = path.join(root, 'assets/BootstrapBundle');
const collectBootstrapImagePaths = (directory) => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectBootstrapImagePaths(fullPath);
        if (!/\.(png|jpe?g)$/i.test(entry.name)) return [];
        return [path.relative(bootstrapImageRoot, fullPath).replace(/\\/g, '/').replace(/\.(png|jpe?g)$/i, '')];
    });
const missingBootstrapImagePaths = collectBootstrapImagePaths(bootstrapImageRoot)
    .filter((assetPath) => !patchBootstrap.includes(`'${assetPath}'`))
    .sort();
assert.deepStrictEqual(missingBootstrapImagePaths, [], 'every BootstrapBundle image must be explicitly allowlisted');
for (const obsoleteImageName of [
    'pch_conveyor_capacity',
    'pch_conveyor_capacity_ad',
    'pch_conveyor_carrier',
    'pch_conveyor_entrance',
    'pch_conveyor_exit',
    'pch_conveyor_track',
]) {
    const obsoleteImagePath = path.join(bootstrapImageRoot, 'GameUI', `${obsoleteImageName}.png`);
    assert.ok(!fs.existsSync(obsoleteImagePath), `${obsoleteImageName} must not be repacked after the RainbowConveyor migration`);
    assert.ok(!fs.existsSync(`${obsoleteImagePath}.meta`), `${obsoleteImageName} metadata must not remain without a live asset`);
}
assert.ok(patchBootstrap.includes('criticalGameAssetsPathMap'), 'bootstrap runtime patch must merge critical gameAssets entries');
assert.ok(patchBootstrap.includes("homeAssetsBundleName = 'homeAssets'"), 'bootstrap critical dependency scan must also inspect homeAssets references');
assert.ok(patchBootstrap.includes('readOptionalBundleSource'), 'bootstrap critical dependency scan must build per-bundle source indexes');
assert.ok(patchBootstrap.includes('entry.bundleRoot || criticalGameAssets.fallbackRoot'), 'critical copied artifacts must use the source bundle root for each dependency');
assert.ok(patchBootstrap.includes('sourceHasNativeVersionMap'), 'critical native version validation must use each dependency source bundle');
assert.ok(patchBootstrap.includes("typeof value === 'string'"), 'critical dependency scan must handle Cocos compressed string UUID references');
assert.ok(patchBootstrap.includes('copyGameAssetImportArtifacts'), 'critical import assets must copy versioned import artifacts, not just plain uuid.json');
assert.ok(patchBootstrap.includes('copyGameAssetNativeArtifacts'), 'critical native assets must copy generated native artifacts without duplicating plain names');
assert.ok(patchBootstrap.includes('buildGameAssetsUuidEntryIndex'), 'critical dependency scan must include no-path uuid entries from config.uuids');
assert.ok(patchBootstrap.includes('allEntriesByUuid'), 'critical dependency expansion must resolve no-path SpriteFrame/Texture dependencies');
assert.ok(patchBootstrap.includes('buildKnownUuidSet'), 'critical dependency scan must match decoded and compressed uuid references');
assert.ok(patchBootstrap.includes('copyLibraryImportArtifacts'), 'critical imports missing from gameAssets must fall back to Cocos library artifacts');
assert.ok(patchBootstrap.includes('copyLibraryNativeArtifacts'), 'critical native artifacts missing from gameAssets must fall back to Cocos library artifacts');
assert.ok(patchBootstrap.includes('appendVersionHash'), 'critical copied assets must patch bootstrap import/native version maps');
assert.ok(patchBootstrap.includes('criticalNativeVersions'), 'bootstrap patch output must report critical native version map changes');
assert.ok(patchBootstrap.includes('findNativeArtifactForVersion'), 'critical native version maps must be verified against copied files');
assert.ok(patchBootstrap.includes('verifyCriticalBootstrapArtifacts'), 'bootstrap patch must fail the build if copied critical artifacts are still missing');
assert.ok(patchBootstrap.includes('usesUuidPathKeys'), 'bootstrap patch must support browser bundle configs that use uuid path keys');
assert.ok(patchBootstrap.includes('bootstrap web pack 引用无法解析'), 'bootstrap patch must keep browser pack references as UUIDs');
assert.ok(patchBootstrap.includes("typeof typeIndex === 'string'"), 'bootstrap patch must support browser bundle configs that store type names directly');
assert.ok(patchBootstrap.includes('hasNativeVersionMap'), 'bootstrap patch must not require minigame native version maps in browser bundles');
assert.ok(!gameScene.includes('4fd100be-d604-4245-b8a0-286c234e5ae0@f9941'), 'Game.scene must not directly reference gameAssets ad rescue gift icon');
const legacyGiftEntry = JSON.parse(gameScene).find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'AdRewardGiftEntry');
assert.ok(!legacyGiftEntry, 'the removed 30-second gift shell must be absent from Game.scene');
assert.ok(!fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI/ad_rescue_gift_icon.png')), 'the removed gift PNG must be deleted');
assert.ok(!fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI/ad_rescue_gift_icon.png.meta')), 'the removed gift PNG metadata must be deleted');
assert.ok(!adRewardHint.includes('AdRewardGiftEntry'), 'runtime code must not find or activate the removed 30-second gift entry');
assert.ok(!adRewardHint.includes('rescue_gift_30s'), 'runtime code must not retain the removed gift rewarded-ad page');
assert.ok(!adRewardHint.includes('ad_rescue_gift_icon'), 'runtime code must not load the removed gift icon');
assert.ok(!patchBootstrap.includes('ad_rescue_gift_icon'), 'bootstrap postbuild must not promote the removed gift icon');
assert.ok(
    postbuildBundles.indexOf("patch-home-assets-bundle.js', [runtimeRoot, 'gameAssets']") < postbuildBundles.indexOf('patch-bootstrap-dynamic-assets.js'),
    'gameAssets artifacts must be patched before bootstrap copies critical entries',
);
assert.ok(postbuildWechat.includes("SPINE_WASM_SUBPACKAGE_NAME = 'spineWasm'"), 'WeChat postbuild must declare the dedicated Spine wasm subpackage');
assert.ok(postbuildWechat.includes('ensureSpineWasmWechatSubpackage'), 'WeChat postbuild must move Spine wasm out of the hard main package');
assert.ok(postbuildWechat.includes('patchSpineWasmVirtualChunk'), 'WeChat postbuild must patch dynamic Spine wasm import paths after moving files');

assert.ok(colorFx.includes('PINDD_SPINE_PATTERN_COMPLETE_ROOT_NAME'), 'pattern-complete Spine FX must render from a dedicated FX root');
assert.ok(colorFx.includes('playPinddSpineFxAtWorldPosition'), 'pattern-complete Spine FX must play from captured world positions');
assert.ok(colorFx.includes('PINDD_SPINE_PATTERN_COMPLETE_MAX_NODES = 48'), 'pattern-complete Spine FX must sample at most 48 representative beans');
assert.ok(colorFx.includes('selectPinddSpineFxBatchNodes('), 'completion Spine caps must use deterministic uniform selection');
assert.ok(!colorFx.includes('beanWorldPositions.length > PINDD_SPINE_FX_ACTIVE_LIMIT'), 'large boards must be sampled instead of throwing at settlement');
assert.ok(!colorFx.includes('PINDD_SPINE_PATTERN_COMPLETE_MAX_WAIT_SECONDS'), 'pattern-complete Spine FX must not use a fixed settlement timeout');
assert.ok(!colorFx.includes('waitForAll: false'), 'the optional pattern-complete callback must still represent all selected c1 callbacks');

assert.ok(commerce.includes('preloadAcquireResourcePanel'), 'commerce module must expose acquire panel preload');
assert.ok(commerceController.includes('preloadAcquireResourcePanel(): void'), 'commerce controller must preload acquire panel prefab');
assert.ok(skin.includes('preloadBackgroundSkinPanel(): void'), 'skin module must expose background skin panel preload');
assert.ok(skin.includes('__pddSourceImageAsset'), 'dynamic background skin SpriteFrames must keep their source ImageAsset for cache retention');
assert.ok(skin.includes('__pddOwnedTexture'), 'dynamic background skin SpriteFrames must tag their owned Texture2D');
assert.ok(skin.includes('_retainBackgroundSkinCacheResource'), 'background skin cache must retain SpriteFrame/Texture/ImageAsset refs');
assert.ok(skin.includes('_releaseBackgroundSkinCacheResource'), 'background skin cache must release retained refs on replace/clear');
assert.ok(skin.includes('_setBackgroundSkinCachedSpriteFrame'), 'background skin cache writes must go through the retaining helper');
assert.ok(skin.includes('backgroundSkin.cache.retain'), 'background skin cache retention must be traceable in debug');
assert.ok(skin.includes('releaseBackgroundSkinCachedSpriteFrames'), 'background skin cached resources must be releasable during runtime destroy');
assert.ok(skin.includes('_detachGameplayBackgroundSkinSpriteFrameForRelease'), 'background skin release must detach active BG Sprite before releasing resources');
assert.ok(skin.includes('forceReassign: true'), 'gameplay background skin must force-rebind even when the same SpriteFrame is already assigned');
assert.ok(skin.includes('BACKGROUND_SKIN_ICON_LOAD_MAX_IN_FLIGHT = 2'), 'skin panel icon loads must be limited to avoid startup/runtime spikes');
assert.ok(skin.includes('renderBackgroundSkinPanelVisibleCards'), 'skin panel must render only a visible card window');
assert.ok(skin.includes('queueBackgroundSkinIconSpriteFrame'), 'skin panel icons must be loaded through a cancellable queue');
assert.ok(skin.includes("_clearBackgroundSkinCachedSpriteFrames('icon', 'close-panel')"), 'closing skin panel must release icon cache');
assert.ok(skin.includes('raw.assets?.thumbnail || raw.assets?.icon'), 'skin panel must prefer CDN thumbnail assets over full backgrounds');
assert.ok(skinCdn.includes("kind: 'background' | 'thumbnail' | 'icon' | string"), 'skin CDN schema must distinguish thumbnail/icon from background assets');
assert.ok(skinCdn.includes('validatePreviewAsset(id, skin.assets?.thumbnail || skin.assets?.icon)'), 'skin CDN manifest must validate thumbnail/icon preview assets separately from full backgrounds');
assert.ok(writeSkinCdn.includes("path.join('assets', 'thumbnails'"), 'skin CDN output must publish thumbnail assets separately from full backgrounds');
assert.ok(writeSkinCdn.includes('const assetCount = skins.length * 2;'), 'skin CDN assetCount must count background plus thumbnail/icon classes, not compatibility aliases');
assert.ok(skin.includes('isLocalBrowserPreview()'), 'local Browser preview must use the local skin mirror instead of external CDN by default');
assert.ok(skin.includes('backgroundSkin.assetError.suppressed'), 'repeated optional skin asset failures must be deduplicated');
assert.ok(skin.includes("phase !== 'asset-error'"), 'asset-error diagnostics must not emit a duplicate warning');
assert.ok(skin.includes("runtimeLog('[background-skin]', phase, payload)"), 'successful background skin diagnostics must not be emitted as warnings');
assert.ok(!skin.includes("console.error('[background-skin] asset error'"), 'optional skin asset failures must not be emitted as console.error');
assert.ok(!skin.includes('this._backgroundSkinFrameCache.set'), 'background skin frame cache must not bypass retain helper');
assert.ok(!skin.includes('this._backgroundSkinIconCache.set'), 'background skin icon cache must not bypass retain helper');
const syncTopHudIndex = topHud.indexOf('syncTopHud(parent: Node, mode: TopHudMode)');
const ensureTopHudRootIndex = topHud.indexOf('ensureTopHudRoot(parent: Node)');
const preloadTopHudIndex = topHud.indexOf('preloadTopHudPrefab(): void');
assert.ok(syncTopHudIndex >= 0, 'TopHud module must expose syncTopHud');
assert.ok(ensureTopHudRootIndex >= 0, 'TopHud module must expose ensureTopHudRoot');
assert.ok(preloadTopHudIndex >= 0, 'TopHud module must expose explicit preloadTopHudPrefab');
assert.ok(
    syncTopHudIndex > preloadTopHudIndex && !topHud.slice(syncTopHudIndex).includes('this.preloadTopHudPrefab?.();'),
    'syncTopHud must not trigger gameAssets TopHud prefab loading on the first UI sync path',
);
assert.ok(
    ensureTopHudRootIndex > preloadTopHudIndex && !topHud.slice(ensureTopHudRootIndex, syncTopHudIndex).includes('this.preloadTopHudPrefab?.();'),
    'ensureTopHudRoot must not trigger gameAssets TopHud prefab loading before post-playable warmup',
);

console.log('post-playable-warmup.test.js passed');
