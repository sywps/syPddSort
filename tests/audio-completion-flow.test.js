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
assert.ok(levelCompleteIndex < settlementIndex, 'level-complete cue must play before settlement cue');

const colorFx = read('assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts');
const engineSettings = JSON.parse(read('settings/v2/packages/engine.json'));
const wechatBuildConfig = read('scripts/write-wechat-build-config.js');
assert.ok(colorFx.includes('playColorCompleteEffect(colorId: number, playSound: boolean = true)'), 'color-complete effect must allow sound suppression');
assert.ok(colorFx.includes("if (playSound) AudioMgr.inst.play('winColor');"), 'color-complete audio must be conditional');
assert.ok(colorFx.includes('playPatternCompleteMatchFx(onDone?: () => void): void'), 'pattern-complete FX must expose a completion callback');
assert.ok(colorFx.includes("PINDD_SPINE_FX_PATH = 'Spine/PinddFx/zhuanshi'"), 'completion FX must use the authorized Pindd Spine resource');
assert.ok(!colorFx.includes('PINDD_SPINE_FX_UUID'), 'Pindd Spine FX must not use a UUID fallback');
assert.ok(!colorFx.includes('assetManager.loadAny'), 'Pindd Spine FX must not use a loadAny fallback when the bundle path is wrong');
assert.ok(colorFx.includes('throw createPinddSpineFxError'), 'Pindd Spine FX critical failures must throw');
assert.ok(colorFx.includes("settle: 'a1_1'"), 'bean settle FX must map to the Pindd a1_1 Spine animation');
assert.ok(colorFx.includes("colorComplete: 'b1_1'"), 'single-color completion FX must map to the Pindd b1_1 Spine animation');
assert.ok(colorFx.includes("patternComplete: 'c1_1'"), 'whole-pattern completion FX must map to the Pindd c1_1 Spine animation');
assert.ok(colorFx.includes('PINDD_SPINE_FX_SCALE_BY_ANIMATION'), 'Pindd Spine FX must keep per-animation scale tuning');
assert.ok(colorFx.includes('PINDD_SPINE_FX_OPACITY_BY_ANIMATION'), 'Pindd Spine FX must keep per-animation opacity tuning');
assert.ok(colorFx.includes('PINDD_SPINE_FX_BATCH_CONCURRENCY'), 'Pindd Spine FX batch playback must limit concurrent active nodes');
assert.ok(colorFx.includes('PINDD_SPINE_FX_BATCH_RETRY_SECONDS'), 'Pindd Spine FX batch playback must retry when all active slots are occupied');
assert.ok(colorFx.includes('_pinddSpineFxBatchSeq'), 'Pindd Spine FX batch playback must be cancellable when effects are cleared');
assert.ok(colorFx.includes('_pinddSpineFxReservedCount'), 'Pindd Spine FX batch playback must reserve capacity while skeleton data callbacks are pending');
assert.ok(colorFx.includes('availableByActiveLimit'), 'Pindd Spine FX batch playback must respect the active effect limit instead of throwing during large batches');
assert.ok(colorFx.includes('a1_1: 1,'), 'bean settle FX must not be reduced below the target-cell size baseline');
assert.ok(colorFx.includes('getBoardSlotVisualSize'), 'Pindd Spine FX scale must prefer target slot/cell size over bean face size');
assert.ok(!colorFx.includes('warnPinddSpineFx'), 'Pindd Spine FX failures must not be downgraded to warnings');
assert.ok(!colorFx.includes('ColorCompleteBeanMatchFx'), 'old color-complete prefab runtime path must stay removed');
assert.ok(!colorFx.includes('ensureColorCompleteMatchFrames'), 'old block_match-animation runtime loader must stay removed from completion FX');
assert.ok(!colorFx.includes('BEAN_SETTLE_MATCH_FRAME_START'), 'old per-bean Sprite ticker FX must stay removed');
assert.ok(engineSettings.modules.configs.defaultConfig.cache.spine._value, 'Spine module must be enabled for Pindd Spine FX');
assert.ok(engineSettings.modules.configs.defaultConfig.cache['spine-3.8']._value, 'Spine 3.8 runtime must be enabled for Pindd Spine FX');
assert.ok(engineSettings.modules.configs.defaultConfig.includeModules.includes('spine-3.8'), 'engine modules must include spine-3.8');
assert.ok(wechatBuildConfig.includes("'spine-3.8'"), 'WeChat build config must include spine-3.8 so sp.Skeleton is available in DevTools');

const placement = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
const firstLevelRoute = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
const previewController = read('assets/Scripts/Core/PreviewController.ts');
const uiManifest = read('assets/Scripts/Core/UiManifest.ts');
const shared = read('assets/Scripts/Core/GameCtrlShared.ts');
const levelFlow = read('assets/Scripts/Core/GameCtrlModules/GameplayLevelFlowModule.ts');
const sceneHome = read('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts');
const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
assert.ok(placement.includes('const skipColorCompleteAudio = bm.isAllLocked();'), 'final board completion must suppress ordinary color-complete audio');
assert.ok(!placement.includes('if (skipColorCompleteAudio) continue;'), 'final board completion must not suppress the last ordinary color-complete visual');
assert.ok(placement.includes('this.enqueueColorCompleteEffect(cid, !skipColorCompleteAudio);'), 'final color-complete effect must queue visuals while suppressing duplicate audio');
assert.ok(placement.includes('playLandEffect(row: number, col: number, onComplete?: () => void)'), 'bean landing effect must expose a completion callback');
assert.ok(placement.includes('playLandingLightAtCell(row: number, col: number): void'), 'bean landing effect must restore a subtle placement light');
assert.ok(placement.includes('this.playBrightFlashAt(worldPos, slotSize * 1.55, 135);'), 'placement light must use the pooled authored bright texture');
assert.ok(placement.includes("throw new Error('[placement-fx] missing required SpriteFrame: block_bright_pindd')"), 'placement light must fail fast when the bright texture is missing');
assert.ok(placement.includes('this.playLandingEffectsThen(targets, () =>'), 'color-complete effect must wait for landing effects to finish');
assert.ok(!placement.includes('COLOR_COMPLETE_VISUAL_SETTLE_DELAY'), 'color-complete timing must not rely on a fixed visual settle delay');
assert.ok(uiManifest.includes('BOARD_EFFECT_TEXTURE_NAMES'), 'board effect textures must be declared in the UI manifest');
assert.ok(uiManifest.includes("'block_bright_pindd'"), 'landing light texture must be part of board effect textures');
assert.ok(uiManifest.includes('Textures/UI/${name}'), 'board effect textures must be prewarmed from gameAssets after bootstrap');
assert.ok(shared.includes('BOARD_EFFECT_TEXTURE_NAMES'), 'board effect textures must be exported through GameCtrlShared');
assert.ok(!levelFlow.includes("...GAMEPLAY_SLOT_TEXTURE_NAMES, ...BOARD_EFFECT_TEXTURE_NAMES"), 'board effect textures must not be classified as generic critical gameplay UI textures');
assert.ok(assetBootstrap.includes('prepareRequiredBoardEffectTextures'), 'board effect textures must have a dedicated gameAssets readiness check');
assert.ok(sceneHome.includes('let gameAssetsDone = GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS.length === 0;'), 'bootstrap gameplay must track required gameAssets effect texture readiness');
assert.ok(sceneHome.includes('if (!beanDone || !uiDone || !gameAssetsDone) return;'), 'bootstrap gameplay must not init before gameAssets effect textures are ready');
assert.ok(sceneHome.includes('verifyGameAssetsTextures'), 'bootstrap gameplay must verify required gameAssets effect textures after loading');
assert.ok(sceneHome.includes('GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS,'), 'bootstrap gameplay must preload the declared gameAssets effect texture paths');
assert.ok(sceneHome.includes('bootstrap_game_assets_textures_missing'), 'bootstrap gameplay must fail fast when required gameAssets effect textures are missing');
assert.ok(sceneHome.includes('bootstrap_game_assets_bundle_missing'), 'bootstrap gameplay must fail fast when the gameAssets bundle is unavailable');
assert.ok(assetBootstrap.includes('requireBrightSpriteFrame(): SpriteFrame'), 'landing light texture must have a fail-fast accessor');

assert.ok(settlement.includes('playPatternCompleteThenWin(delaySeconds: number = 0)'), 'final completion must route through a pattern-complete win wrapper');
assert.ok(settlement.includes('FINAL_COLOR_COMPLETE_FX_HOLD'), 'final pattern win must leave a visible window for the queued color-complete FX');
assert.ok(settlement.includes('this.flushPendingColorCompleteEffects?.();'), 'final pattern win must flush queued color-complete FX before settlement');
assert.ok(settlement.includes('this.playPatternCompleteMatchFx(showSettlement);'), 'settlement must wait for pattern-complete FX callback');
assert.ok(settlement.includes('PATTERN_COMPLETE_BOARD_SHRINK_DELAY = 0.5'), 'pattern-complete shrink must wait before c1 like Happy Pindou');
assert.ok(settlement.includes('PATTERN_COMPLETE_FX_START_DELAY'), 'pattern-complete c1 must start after the shrink lead-in');
assert.ok(settlement.includes('PATTERN_COMPLETE_SETTLEMENT_HOLD'), 'settlement must not appear immediately after c1 completes');

assert.ok(firstLevelRoute.includes("this.requireUiChild(overlayTemplates, 'RemoteLoadFatalError'"), 'level-data fatal overlay must use the authored RemoteLoadFatalError template');
assert.ok(!firstLevelRoute.includes('ensureLevelDataLoadFatalLayer'), 'level-data fatal overlay must not create a runtime layer fallback');
assert.ok(!firstLevelRoute.includes('createLevelDataLoadFatalSpriteNode'), 'missing fatal overlay visuals must fail fast instead of being generated');
assert.ok(firstLevelRoute.includes("const overlayTemplates = this.requireUiChild(overlayRoot, 'OverlayTemplates'"), 'fatal overlay display must require an authored OverlayTemplates node');
assert.ok(previewController.includes("'RemoteLoadFatalError'"), 'preview runtime must hide the authored fatal overlay template name');
assert.ok(!previewController.includes('LevelDataLoadFatalError'), 'preview runtime must not reference the retired fatal overlay fallback name');

assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Audio/winSettlement.mp3')), 'winSettlement.mp3 must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Audio/winSettlement.mp3.meta')), 'winSettlement.mp3.meta must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Spine/PinddFx/zhuanshi.json')), 'Pindd Spine skeleton JSON must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Spine/PinddFx/zhuanshi.atlas.txt')), 'Pindd Spine atlas text must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Spine/PinddFx/zhuanshi.png')), 'Pindd Spine texture must exist');

console.log('audio-completion-flow.test.js passed');
