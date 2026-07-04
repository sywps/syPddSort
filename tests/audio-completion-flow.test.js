const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const manifest = read('assets/Scripts/Core/AudioManifest.ts');
assert.ok(manifest.includes("winAll: 'Audio/winColor'"), 'level-complete winAll must reuse the single-color completion audio');
assert.ok(manifest.includes("winSettlement: 'Audio/winSettlement'"), 'win settlement must have a dedicated audio key');
assert.ok(manifest.includes('winSettlement: 0.62'), 'win settlement volume must be configured');

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const levelCompleteIndex = settlement.indexOf("AudioMgr.inst.play('winAll');");
const settlementIndex = settlement.indexOf("AudioMgr.inst.play('winSettlement');");
assert.ok(levelCompleteIndex >= 0, 'gameWin must play the level-complete cue');
assert.ok(settlementIndex >= 0, 'gameWin must play the settlement cue');
const playPatternFxIndex = settlement.indexOf('const playPatternCompleteFx = () =>');
const playBoardShrinkIndex = settlement.indexOf('const playBoardCompleteShrink = () =>');
const revealSettlementIndex = settlement.indexOf('const revealSettlement = () =>');
const showSettlementIndex = settlement.indexOf('const showSettlement = () =>');
assert.ok(levelCompleteIndex > playPatternFxIndex && levelCompleteIndex < playBoardShrinkIndex, 'level-complete cue must play when full-board c1 starts');
assert.ok(settlementIndex > revealSettlementIndex && settlementIndex < showSettlementIndex, 'settlement cue must play only when settlement is revealed');

const colorFx = read('assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts');
const freezeFx = read('assets/Scripts/Core/GameCtrlModules/GameplayFreezeEffectModule.ts');
const engineSettings = JSON.parse(read('settings/v2/packages/engine.json'));
const wechatBuildConfig = read('scripts/write-wechat-build-config.js');
assert.ok(colorFx.includes('playColorCompleteEffect(colorId: number, playSound: boolean = true)'), 'color-complete effect must allow sound suppression');
assert.ok(colorFx.includes("if (playSound) AudioMgr.inst.play('winColor');"), 'color-complete audio must be conditional');
assert.ok(colorFx.includes('playPatternCompleteMatchFx(onDone?: () => void): void'), 'pattern-complete FX must expose a completion callback');
assert.ok(colorFx.includes("PINDD_SPINE_FX_PATH = 'Spine/PinddFx/zhuanshi'"), 'completion FX must use the authorized Pindd Spine resource');
assert.ok(!colorFx.includes('PINDD_SPINE_FX_UUID'), 'Pindd Spine FX must not use a UUID fallback');
assert.ok(!colorFx.includes('assetManager.loadAny'), 'Pindd Spine FX must not use a loadAny fallback when the bundle path is wrong');
assert.ok(colorFx.includes('throw createPinddSpineFxError'), 'Pindd Spine FX critical failures must throw');
assert.ok(colorFx.includes('ensurePinddSpineWasmReady'), 'Pindd Spine FX must explicitly load Spine wasm before SkeletonData');
assert.ok(colorFx.includes('loadWasmModuleSpine'), 'Pindd Spine FX must use Cocos manual Spine wasm loader');
assert.ok(colorFx.includes("SPINE_WASM_SUBPACKAGE_NAME = 'spineWasm'"), 'Pindd Spine FX must load the WeChat spineWasm subpackage before wasm import');
assert.ok(colorFx.includes('wxApi.loadSubpackage'), 'Pindd Spine FX must explicitly load the WeChat wasm subpackage');
assert.ok(freezeFx.includes('ensureFreezeSpineWasmReady'), 'Freeze Spine FX must explicitly load Spine wasm before SkeletonData');
assert.ok(freezeFx.includes('loadWasmModuleSpine'), 'Freeze Spine FX must use Cocos manual Spine wasm loader');
assert.ok(freezeFx.includes("SPINE_WASM_SUBPACKAGE_NAME = 'spineWasm'"), 'Freeze Spine FX must load the WeChat spineWasm subpackage before wasm import');
assert.ok(freezeFx.includes('wxApi.loadSubpackage'), 'Freeze Spine FX must explicitly load the WeChat wasm subpackage');
assert.ok(colorFx.includes("settle: 'a1_1'"), 'bean settle FX must map to the Pindd a1_1 Spine animation');
assert.ok(colorFx.includes("colorComplete: 'b1_1'"), 'single-color completion FX must map to the Pindd b1_1 Spine animation');
assert.ok(colorFx.includes("patternComplete: 'c1_1'"), 'whole-pattern completion FX must map to the Pindd c1_1 Spine animation');
assert.ok(colorFx.includes('playPinddSpineFxOnBeansSameFrame'), 'single-color completion FX must have a same-frame playback path');
assert.ok(colorFx.includes('this.playPinddSpineFxOnBeansSameFrame(beanNodes, PINDD_SPINE_FX_ANIMATION.colorComplete);'), 'single-color completion FX must start all same-color beans together');
assert.ok(!colorFx.includes('this.playPinddSpineFxOnBeans(beanNodes, PINDD_SPINE_FX_ANIMATION.colorComplete);'), 'single-color completion FX must not use the batched queue');
assert.ok(colorFx.includes('PINDD_SPINE_FX_SCALE_BY_ANIMATION'), 'Pindd Spine FX must keep per-animation scale tuning');
assert.ok(colorFx.includes('PINDD_SPINE_FX_OPACITY_BY_ANIMATION'), 'Pindd Spine FX must keep per-animation opacity tuning');
assert.ok(colorFx.includes('PINDD_SPINE_FX_BATCH_CONCURRENCY'), 'Pindd Spine FX batch playback must limit concurrent active nodes');
assert.ok(colorFx.includes('PINDD_SPINE_FX_BATCH_RETRY_SECONDS'), 'Pindd Spine FX batch playback must retry when all active slots are occupied');
assert.ok(colorFx.includes('_pinddSpineFxBatchSeq'), 'Pindd Spine FX batch playback must be cancellable when effects are cleared');
assert.ok(colorFx.includes('_pinddSpineFxReservedCount'), 'Pindd Spine FX batch playback must reserve capacity while skeleton data callbacks are pending');
assert.ok(colorFx.includes('const seq = (Number(this._pinddSpineFxBatchSeq) || 0) + 1;'), 'each Pindd Spine FX batch must own a fresh cancellation sequence');
assert.ok(colorFx.includes('this._pinddSpineFxBatchSeq = seq;'), 'new Pindd Spine FX batches must publish their active sequence before scheduling retries');
assert.ok(colorFx.includes('this._pinddSpineFxReservedCount = 0;'), 'new Pindd Spine FX batches must clear stale reserved capacity');
assert.ok(colorFx.includes('availableByActiveLimit'), 'Pindd Spine FX batch playback must respect the active effect limit instead of throwing during large batches');
assert.ok(colorFx.includes('PINDD_SPINE_FX_BATCH_ACTIVE_LIMIT_RETRY_SECONDS'), 'Pindd Spine FX batch playback must retry when the active limit is temporarily full');
assert.ok(colorFx.includes('retryOnActiveLimit: true'), 'batched Pindd Spine FX must wait for active capacity instead of surfacing an error overlay');
assert.ok(colorFx.includes('if (retryOnActiveLimit) {'), 'single-bean Pindd Spine FX must treat the active limit as backpressure only for batched playback');
assert.ok(colorFx.includes('a1_1: 1,'), 'bean settle FX must not be reduced below the target-cell size baseline');
assert.ok(colorFx.includes('getBoardSlotVisualSize'), 'Pindd Spine FX scale must prefer target slot/cell size over bean face size');
assert.ok(!colorFx.includes('warnPinddSpineFx'), 'Pindd Spine FX failures must not be downgraded to warnings');
assert.ok(!colorFx.includes('ColorCompleteBeanMatchFx'), 'old color-complete prefab runtime path must stay removed');
assert.ok(!colorFx.includes('ensureColorCompleteMatchFrames'), 'old block_match-animation runtime loader must stay removed from completion FX');
assert.ok(!colorFx.includes('BEAN_SETTLE_MATCH_FRAME_START'), 'old per-bean Sprite ticker FX must stay removed');
assert.ok(engineSettings.modules.configs.defaultConfig.cache.spine._value, 'Spine module must be enabled for Pindd Spine FX');
assert.ok(engineSettings.modules.configs.defaultConfig.cache['spine-3.8']._value, 'Spine 3.8 runtime must be enabled for Pindd Spine FX');
assert.ok(engineSettings.modules.configs.defaultConfig.cache['spine-3.8']._flags.LOAD_SPINE_MANUALLY, 'Spine wasm must be manually loaded instead of startup-injected');
assert.ok(engineSettings.modules.configs.defaultConfig.includeModules.includes('spine-3.8'), 'engine modules must include spine-3.8');
assert.ok(engineSettings.modules.configs.defaultConfig.flags.WASM_SUBPACKAGE, 'WeChat wasm artifacts must be allowed to move into minigame subpackages');
assert.ok(engineSettings.modules.configs.defaultConfig.flags.LOAD_SPINE_MANUALLY, 'engine flags must keep Spine out of the startup auto-load path');
assert.ok(wechatBuildConfig.includes("'spine-3.8'"), 'WeChat build config must include spine-3.8 so sp.Skeleton is available in DevTools');
assert.ok(wechatBuildConfig.includes('WASM_SUBPACKAGE: WECHAT_WASM_SUBPACKAGE'), 'WeChat build config must enable wasm subpackages');
assert.ok(wechatBuildConfig.includes('LOAD_SPINE_MANUALLY: WECHAT_LOAD_SPINE_MANUALLY'), 'WeChat build config must enable manual Spine wasm loading');

const placement = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
const skillMagnet = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillMagnetModule.ts');
const skillWand = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillWandModule.ts');
const firstLevelRoute = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
const previewController = read('assets/Scripts/Core/PreviewController.ts');
const uiManifest = read('assets/Scripts/Core/UiManifest.ts');
const shared = read('assets/Scripts/Core/GameCtrlShared.ts');
const levelFlow = read('assets/Scripts/Core/GameCtrlModules/GameplayLevelFlowModule.ts');
const sceneHome = read('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts');
const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const patchBootstrapDynamicAssets = read('scripts/patch-bootstrap-dynamic-assets.js');
const gameScene = read('assets/BootstrapBundle/Scenes/Game.scene');
const homeScene = read('assets/HomeAssetsBundle/Scenes/Home.scene');
const uiPreviewScene = read('assets/Scenes/UIPreview.scene');
assert.ok(placement.includes('const skipColorCompleteAudio = bm.isAllLocked();'), 'final board completion must suppress ordinary color-complete audio');
assert.ok(!placement.includes('if (skipColorCompleteAudio) continue;'), 'final board completion must not suppress the last ordinary color-complete visual');
assert.ok(placement.includes('this.enqueueColorCompleteEffect(cid, !skipColorCompleteAudio);'), 'final color-complete effect must queue visuals while suppressing duplicate audio');
assert.ok(placement.includes('playLandEffect(row: number, col: number, onComplete?: () => void)'), 'bean landing effect must expose a completion callback');
assert.ok(placement.includes('playLandingLightAtCell(row: number, col: number): void'), 'bean landing effect must restore a subtle placement light');
assert.ok(placement.includes('playBoardTargetSettleSound(): void'), 'board target settle sound must have a shared helper');
assert.ok(placement.includes('this.playBoardTargetSettleSound();\n                        AudioMgr.inst.vibratePlace();'), 'normal board placement must use the shared board settle sound before placement vibration');
assert.ok(skillMagnet.includes('nextForcedSkillFeedbackSoundAtMs = playAtMs + SKILL_MOVE_STAGGER * 1000'), 'color-clear prop feedback audio must keep the ordinary multi-target rhythm even when visual starts are compressed');
assert.ok(skillMagnet.includes('scheduleForcedSkillFeedbackSound(sfx);'), 'forced skill feedback must enqueue prop sounds instead of playing dense one-shots immediately');
assert.ok(skillMagnet.includes("if (sfx === 'place' && typeof this.playBoardTargetSettleSound === 'function')"), 'forced skill feedback must route board target settle audio through the shared helper');
assert.ok(skillMagnet.includes('const queuedFeedbackCallbacks = new Set<() => void>();'), 'forced skill queued feedback callbacks must be tracked for cancellation');
assert.ok(skillMagnet.includes('const closeForcedSkillFeedbackAudio = () =>'), 'forced skill feedback audio must have an explicit close point');
assert.ok(skillMagnet.includes('this.unschedule(callback);'), 'forced skill queued feedback sounds must be unscheduled when the visual flow completes');
assert.ok(skillMagnet.includes('AudioMgr.inst.stopSfx();'), 'forced skill active one-shot SFX must stop when the visual flow completes');
assert.ok(/playFeedback\('place', move\.feedbackIndex\);[\s\S]*?revealBoardCell\(move\.target\);/.test(skillMagnet), 'forced skill board moves must play board target settle audio');
assert.ok(/playFeedback\('slot', move\.feedbackIndex\);[\s\S]*?revealSlotIdx\(move\.slotIdx\);/.test(skillMagnet), 'forced skill slot moves must keep slot landing audio');
assert.ok(/playForcedSkillPlan\([\s\S]*?for \(const move of boardMoves\)[\s\S]*?this\.playBoardTargetSettleSound\(\);[\s\S]*?this\.recycleFlyBeanNode\(bean\);[\s\S]*?finish\(\);[\s\S]*?for \(const move of slotMoves\)/.test(skillMagnet), 'sequential forced skill board moves must use board target settle audio');
assert.ok(skillWand.includes('nextDumpBoardSettleSoundAtMs = playAtMs + STAGGER * 1000'), 'clear-slot prop board settle audio must keep the ordinary multi-target rhythm');
assert.ok(skillWand.includes('scheduleDumpBoardSettleSound();'), 'clear-slot dump must enqueue board settle sounds instead of playing dense one-shots immediately');
assert.ok(/dumpRemainingSlotBeans\(\)[\s\S]*?this\.playBoardTargetSettleSound\(\);[\s\S]*?this\._flyingTargets\.delete/.test(skillWand), 'clear-slot dump fallback must keep board target settle audio');
assert.ok(placement.includes('this.playBrightFlashAt(worldPos, slotSize * 1.55, 135);'), 'placement light must use the pooled authored bright texture');
assert.ok(placement.includes("throw new Error('[placement-fx] missing required SpriteFrame: block_bright_pindd')"), 'placement light must fail fast when the bright texture is missing');
assert.ok(placement.includes('this.playLandingEffectsThen(targets, () =>'), 'color-complete effect must wait for landing effects to finish');
assert.ok(!placement.includes('COLOR_COMPLETE_VISUAL_SETTLE_DELAY'), 'color-complete timing must not rely on a fixed visual settle delay');
assert.ok(uiManifest.includes('BOARD_EFFECT_TEXTURE_NAMES'), 'board effect textures must be declared in the UI manifest');
assert.ok(uiManifest.includes('BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS'), 'board effect textures must be declared as bootstrap-owned paths');
assert.ok(uiManifest.includes("'block_bright_pindd'"), 'landing light texture must be part of board effect textures');
assert.ok(uiManifest.includes('GameUI/${name}'), 'board effect textures must load from bootstrap GameUI');
assert.ok(uiManifest.includes('GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS: string[] = []'), 'board effect textures must not be prewarmed from gameAssets');
assert.ok(shared.includes('BOARD_EFFECT_TEXTURE_NAMES'), 'board effect textures must be exported through GameCtrlShared');
assert.ok(shared.includes('BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS'), 'bootstrap board effect paths must be exported through GameCtrlShared');
assert.ok(/LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES[\s\S]*?\.\.\.BOARD_EFFECT_TEXTURE_NAMES/.test(shared), 'board effect textures must be retained as bootstrap-owned startup resources');
assert.ok(/LOCAL_BOOTSTRAP_TEXTURE_NAMES[\s\S]*?\.\.\.BOARD_EFFECT_TEXTURE_NAMES/.test(shared), 'board effect textures must be loadable from bootstrap texture set');
assert.ok(!levelFlow.includes("...GAMEPLAY_SLOT_TEXTURE_NAMES, ...BOARD_EFFECT_TEXTURE_NAMES"), 'board effect textures must not be classified as generic critical gameplay UI textures');
assert.ok(assetBootstrap.includes('prepareRequiredBoardEffectTextures'), 'board effect textures must have a dedicated readiness check');
assert.ok(!/SCENE_GAME_SPRITE_FRAME_NAMES[\s\S]*?\.\.\.BOARD_EFFECT_TEXTURE_NAMES[\s\S]*?\]\);/.test(assetBootstrap), 'board effect textures must not be released with Game scene-scoped textures');
assert.ok(assetBootstrap.includes('this._preloadBootstrapTexturePathsStrict(BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS, verifyLoaded, targetBundle);'), 'board effect textures must load strictly from bootstrap-owned paths');
assert.ok(assetBootstrap.includes('scope: SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP'), 'board effect textures must be cached as startup bootstrap scope');
assert.ok(assetBootstrap.includes('...this.getRequiredBoardEffectTextureNames(),'), 'startup bootstrap prefetch must include board effect textures');
assert.ok(!assetBootstrap.includes('this._withGameAssetsBundle(loadFromBundle);'), 'board effect textures must not load the full gameAssets bundle');
assert.ok(patchBootstrapDynamicAssets.includes('ensureStableBootstrapPackImportFiles'), 'bootstrap postbuild must stabilize pack import filenames');
assert.ok(patchBootstrapDynamicAssets.includes("removeVersionHashByIndex(config, 'import', packIndex)"), 'bootstrap pack imports must not depend on changing md5 version entries');
assert.ok(sceneHome.includes('let gameAssetsDone = true;'), 'bootstrap gameplay must not block first playable UI on gameAssets effect textures');
assert.ok(sceneHome.includes('let boardEffectDone = false;'), 'bootstrap fast path must wait for board effect textures before initGame');
assert.ok(sceneHome.includes('!boardEffectDone'), 'bootstrap fast path init gate must include board effect readiness');
assert.ok(sceneHome.includes("this.trackFirstLevelFunnelForLevel(activeLevelId, 'bootstrap_board_effect_textures_failed'"), 'bootstrap fast path must report missing board effect textures before gameplay starts');
assert.ok(sceneHome.includes('Bootstrap levels must not block first playable UI on gameAssets.'), 'bootstrap gameAssets prewarm must stay non-blocking');
assert.ok(!sceneHome.includes('let gameAssetsDone = GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS.length === 0;'), 'bootstrap gameplay must not restore the old blocking gameAssets gate');
assert.ok(assetBootstrap.includes('requireBrightSpriteFrame(): SpriteFrame'), 'landing light texture must have a fail-fast accessor');
assert.ok(fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/block_bright_pindd.png')), 'landing light texture must live in BootstrapBundle GameUI');
assert.ok(fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/block_bright_pindd.png.meta')), 'landing light texture meta must live in BootstrapBundle GameUI');
assert.ok(!fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI/block_bright_pindd.png')), 'landing light texture must not live in GameAssetsBundle');
assert.ok(!fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI/block_bright_pindd.png.meta')), 'landing light texture meta must not live in GameAssetsBundle');

assert.ok(settlement.includes('playPatternCompleteThenWin(delaySeconds: number = 0)'), 'final completion must route through a pattern-complete win wrapper');
assert.ok(settlement.includes('this._pendingColorCompleteEffects.clear();'), 'final pattern win must drop the queued final color-complete FX');
assert.ok(!settlement.includes('FINAL_COLOR_COMPLETE_FX_HOLD'), 'final pattern win must not wait for a separate final-color FX');
assert.ok(!settlement.includes('this.flushPendingColorCompleteEffects?.();'), 'final pattern win must not flush queued final-color FX before c1');
assert.ok(settlement.includes('this.playPatternCompleteMatchFx(showSettlement);'), 'settlement must wait for pattern-complete FX callback');
assert.ok(settlement.includes('PATTERN_COMPLETE_BOARD_SHRINK_DELAY = 0'), 'pattern-complete shrink must start without an extra pre-FX wait');
assert.ok(settlement.includes('PATTERN_COMPLETE_BOARD_SHRINK_SCALE = 0.8'), 'pattern-complete shrink must match the Happy Pindou board scale');
assert.ok(settlement.includes('.call(playPatternCompleteFx)'), 'pattern-complete c1 must start after the shrink tween finishes');
assert.ok(!settlement.includes('PATTERN_COMPLETE_FX_START_DELAY'), 'pattern-complete c1 must not use a separate fixed start delay');
assert.ok(settlement.includes('PATTERN_COMPLETE_SETTLEMENT_HOLD'), 'settlement must not appear immediately after c1 completes');

assert.ok(firstLevelRoute.includes("this.requireUiChild(overlayTemplates, 'RemoteLoadFatalError'"), 'level-data fatal overlay must use the authored RemoteLoadFatalError template');
assert.ok(!firstLevelRoute.includes('ensureLevelDataLoadFatalLayer'), 'level-data fatal overlay must not create a runtime layer fallback');
assert.ok(!firstLevelRoute.includes('createLevelDataLoadFatalSpriteNode'), 'missing fatal overlay visuals must fail fast instead of being generated');
assert.ok(firstLevelRoute.includes("const overlayTemplates = this.requireUiChild(overlayRoot, 'OverlayTemplates'"), 'fatal overlay display must require an authored OverlayTemplates node');
assert.ok(firstLevelRoute.includes('hideRemoteLoadFatalDiagnosticLabel'), 'fatal overlay must hide internal diagnostic labels from users');
assert.ok(!firstLevelRoute.includes('pathLabel.string = levelPath'), 'fatal overlay must not expose level paths to users');
assert.ok(!firstLevelRoute.includes('detailLabel.string'), 'fatal overlay must not expose error codes or resource names to users');
for (const [sceneName, sceneContent] of [
    ['Game.scene', gameScene],
    ['Home.scene', homeScene],
    ['UIPreview.scene', uiPreviewScene],
]) {
    assert.ok(sceneContent.includes('"请重启小游戏"'), `${sceneName} fatal overlay title copy must live in the Cocos scene template`);
    assert.ok(sceneContent.includes('"资源更新中"'), `${sceneName} fatal overlay hint copy must live in the Cocos scene template`);
    assert.ok(!sceneContent.includes('"请检查资源与配置后重新进入游戏"'), `${sceneName} fatal overlay template must not retain old implementation-facing copy`);
    assert.ok(!sceneContent.includes('"LevelData/level_1"'), `${sceneName} fatal overlay template must not retain technical level-path text`);
    assert.ok(!sceneContent.includes('"remote_load_error"'), `${sceneName} fatal overlay template must not retain technical error-code text`);
    assert.ok(!sceneContent.includes('"已停止进入默认关卡，避免关卡数据错乱"'), `${sceneName} fatal overlay template must not retain internal data-protection copy`);
}
assert.ok(previewController.includes("'RemoteLoadFatalError'"), 'preview runtime must hide the authored fatal overlay template name');
assert.ok(!previewController.includes('LevelDataLoadFatalError'), 'preview runtime must not reference the retired fatal overlay fallback name');

assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Audio/winSettlement.mp3')), 'winSettlement.mp3 must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Audio/winSettlement.mp3.meta')), 'winSettlement.mp3.meta must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Spine/PinddFx/zhuanshi.json')), 'Pindd Spine skeleton JSON must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Spine/PinddFx/zhuanshi.atlas.txt')), 'Pindd Spine atlas text must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Spine/PinddFx/zhuanshi.png')), 'Pindd Spine texture must exist');

console.log('audio-completion-flow.test.js passed');
