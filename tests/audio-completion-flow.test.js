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
assert.ok(colorFx.includes('playColorCompleteEffect(colorId: number, playSound: boolean = true)'), 'color-complete effect must allow sound suppression');
assert.ok(colorFx.includes("if (playSound) AudioMgr.inst.play('winColor');"), 'color-complete audio must be conditional');
assert.ok(colorFx.includes('playPatternCompleteMatchFx(onDone?: () => void): void'), 'pattern-complete FX must expose a completion callback');
assert.ok(colorFx.includes("PINDD_SPINE_FX_PATH = 'Spine/PinddFx/zhuanshi'"), 'completion FX must use the authorized Pindd Spine resource');
assert.ok(colorFx.includes("PINDD_SPINE_FX_UUID = 'ebc7075d-a1ec-459b-a209-1b510525f23c'"), 'Pindd Spine FX must keep a UUID load fallback');
assert.ok(colorFx.includes('assetManager.loadAny'), 'Pindd Spine FX must be able to load by UUID when bundle path indexing is stale');
assert.ok(colorFx.includes("settle: 'a1_1'"), 'bean settle FX must map to the Pindd a1_1 Spine animation');
assert.ok(colorFx.includes("colorComplete: 'b1_1'"), 'single-color completion FX must map to the Pindd b1_1 Spine animation');
assert.ok(colorFx.includes("patternComplete: 'c1_1'"), 'whole-pattern completion FX must map to the Pindd c1_1 Spine animation');
assert.ok(colorFx.includes('PINDD_SPINE_FX_SCALE_BY_ANIMATION'), 'Pindd Spine FX must keep per-animation scale tuning');
assert.ok(colorFx.includes('PINDD_SPINE_FX_OPACITY_BY_ANIMATION'), 'Pindd Spine FX must keep per-animation opacity tuning');
assert.ok(colorFx.includes('warnPinddSpineFxPlayFailure'), 'Pindd Spine FX playback failures must not crash gameplay');
assert.ok(!colorFx.includes('ColorCompleteBeanMatchFx'), 'old color-complete prefab runtime path must stay removed');
assert.ok(!colorFx.includes('ensureColorCompleteMatchFrames'), 'old block_match-animation runtime loader must stay removed from completion FX');
assert.ok(!colorFx.includes('BEAN_SETTLE_MATCH_FRAME_START'), 'old per-bean Sprite ticker FX must stay removed');
assert.ok(engineSettings.modules.configs.defaultConfig.cache.spine._value, 'Spine module must be enabled for Pindd Spine FX');
assert.ok(engineSettings.modules.configs.defaultConfig.cache['spine-3.8']._value, 'Spine 3.8 runtime must be enabled for Pindd Spine FX');
assert.ok(engineSettings.modules.configs.defaultConfig.includeModules.includes('spine-3.8'), 'engine modules must include spine-3.8');

const placement = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
const firstLevelRoute = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
assert.ok(placement.includes('const skipColorCompleteAudio = bm.isAllLocked();'), 'final board completion must suppress ordinary color-complete audio');
assert.ok(placement.includes('if (skipColorCompleteAudio) continue;'), 'final board completion must suppress the last ordinary color-complete visual');
assert.ok(placement.includes('this.enqueueColorCompleteEffect(cid, true);'), 'non-final color-complete effect must queue ordinary local visuals');
assert.ok(placement.includes('playLandEffect(row: number, col: number, frameBudget: number = this.getPlaceGlowFrameBudget(1), onComplete?: () => void)'), 'bean landing effect must expose a completion callback');
assert.ok(placement.includes('this.playLandingEffectsThen(targets, landFrameBudget'), 'color-complete effect must wait for landing effects to finish');
assert.ok(!placement.includes('COLOR_COMPLETE_VISUAL_SETTLE_DELAY'), 'color-complete timing must not rely on a fixed visual settle delay');

assert.ok(settlement.includes('playPatternCompleteThenWin(delaySeconds: number = 0)'), 'final completion must route through a pattern-complete win wrapper');
assert.ok(settlement.includes('this.playPatternCompleteMatchFx(showSettlement);'), 'settlement must wait for pattern-complete FX callback');

assert.ok(firstLevelRoute.includes('ensureLevelDataLoadFatalLayer'), 'level-data fatal overlay must have a runtime fallback layer');
assert.ok(firstLevelRoute.includes('createLevelDataLoadFatalSpriteNode'), 'missing fatal overlay visuals must be generated instead of crashing');
assert.ok(!firstLevelRoute.includes("const overlayTemplates = this.requireUiChild(overlayRoot, 'OverlayTemplates'"), 'fatal overlay display must not require an authored OverlayTemplates node');

assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Audio/winSettlement.mp3')), 'winSettlement.mp3 must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Audio/winSettlement.mp3.meta')), 'winSettlement.mp3.meta must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Spine/PinddFx/zhuanshi.json')), 'Pindd Spine skeleton JSON must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Spine/PinddFx/zhuanshi.atlas.txt')), 'Pindd Spine atlas text must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Spine/PinddFx/zhuanshi.png')), 'Pindd Spine texture must exist');

console.log('audio-completion-flow.test.js passed');
