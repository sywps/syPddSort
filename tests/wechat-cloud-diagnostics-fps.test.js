const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const performanceMgr = read('assets/Scripts/Core/PerformanceMgr.ts');
const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const firstLevelRoute = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
const boardSlotBatchRenderer = read('assets/Scripts/Core/BoardSlotBatchRenderer.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const sceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const postbuildWechat = read('scripts/postbuild-wechat-minigame.js');

assert.ok(performanceMgr.includes('const IDLE_FPS = 30;'), 'idle runtime FPS must be 30');
assert.ok(performanceMgr.includes('const ACTIVE_FPS = 45;'), 'active runtime FPS must be 45');
assert.ok(performanceMgr.includes('const BACKGROUND_FPS = 15;'), 'background runtime FPS must stay 15');
assert.ok(!performanceMgr.includes('const ACTIVE_FPS = 60;'), 'runtime must not globally raise active FPS to 60');

assert.ok(
    postbuildWechat.includes('cc.game.frameRate = 30; cc.game.setFrameRate(30);'),
    'WeChat generated package startup FPS must be patched to 30',
);
assert.ok(!postbuildWechat.includes('cc.game.frameRate = 45; cc.game.setFrameRate(45);'), 'WeChat startup patch must not force 45 FPS');

assert.ok(assetBootstrap.includes('isDebugPerfTraceEnabled'), 'render diagnostics must be gated by debug perf trace mode');
assert.ok(assetBootstrap.includes('render.spriteFrame.health'), 'debug package must emit render SpriteFrame health traces');
assert.ok(assetBootstrap.includes('_collectRenderFrameOwnersForRuntimeScan'), 'render diagnostics must scan non-Sprite UIRenderer SpriteFrame owners');
assert.ok(assetBootstrap.includes('getComponents(UIRenderer)'), 'render diagnostics must include UIRenderer components');
assert.ok(assetBootstrap.includes('rendererCount'), 'render health traces must expose non-Sprite renderer coverage');
assert.ok(assetBootstrap.includes('spriteFrame.cache.release.request'), 'debug package must trace SpriteFrame release requests');
assert.ok(assetBootstrap.includes('const MAX_CONCURRENT_SPRITE_FRAME_LOADS = 2;'), 'SpriteFrame loads must be throttled to avoid render-time texture bursts');
assert.ok(assetBootstrap.includes('const POST_PLAYABLE_MAX_CONCURRENT_SPRITE_FRAME_LOADS = 1;'), 'post-playable SpriteFrame loads must be limited to one in-flight load');
assert.ok(assetBootstrap.includes('scheduleSpriteFrameApply'), 'async SpriteFrame assignment must go through a render-safe apply barrier');
assert.ok(assetBootstrap.includes('spriteFrame.apply.queue'), 'SpriteFrame apply barrier must trace queued assignments in debug');
assert.ok(assetBootstrap.includes('spriteFrame.apply.coalesce'), 'SpriteFrame apply barrier must coalesce repeated assignments on the same Sprite');
assert.ok(assetBootstrap.includes('spriteFrame.apply.skipSame'), 'SpriteFrame apply barrier must skip no-op same-frame assignments');
assert.ok(assetBootstrap.includes('spriteFrame.apply.forceReassign'), 'SpriteFrame apply barrier must support forced same-frame rebinding for fragile render paths');
assert.ok(assetBootstrap.includes('spriteFrame.apply.notReady'), 'SpriteFrame apply barrier must diagnose non-ready render resources');
assert.ok(assetBootstrap.includes('Director'), 'SpriteFrame apply barrier must wait for the Cocos after-draw phase');
assert.ok(assetBootstrap.includes('_flushSpriteFrameApplyQueue'), 'SpriteFrame assignments must be flushed through one coalesced queue');
assert.ok(assetBootstrap.includes('_spriteFrameApplyPending'), 'runtime must track pending SpriteFrame apply operations');
assert.ok(assetBootstrap.includes('_getSpriteFrameInternalTextureForDiagnostics'), 'render-ready checks must inspect the internal SpriteFrame texture used by Cocos getHash');
assert.ok(assetBootstrap.includes('_retainSpriteFrameCacheResource'), 'SpriteFrame cache must retain render assets while cached');
assert.ok(assetBootstrap.includes("'cache-replace'"), 'SpriteFrame cache replacement must release the old retained asset refs');
assert.ok(assetBootstrap.includes('asset.addRef();'), 'SpriteFrame cache retain must use Cocos addRef');
assert.ok(assetBootstrap.includes('asset.decRef();'), 'SpriteFrame cache release must use Cocos decRef');
assert.ok(assetBootstrap.includes('cacheResourceRetained'), 'SpriteFrame diagnostics must expose cache-owned resource retention');
assert.ok(assetBootstrap.includes('installSpriteFrameGetHashProbe'), 'debug diagnostics must install a one-shot SpriteFrame.getHash owner probe');
assert.ok(assetBootstrap.includes('spriteFrame.getHash.invalidTexture'), 'getHash probe must emit first invalid texture owner details');
assert.ok(assetBootstrap.includes('spriteFrame.getHash.throw'), 'getHash probe must emit the exact throwing SpriteFrame receiver details');
assert.ok(assetBootstrap.includes('const maxThrowReports = 8;'), 'getHash throw diagnostics must sample repeated failures without flooding indefinitely');
assert.ok(assetBootstrap.includes('receiverOwnKeys'), 'getHash throw diagnostics must expose receiver fields');
assert.ok(assetBootstrap.includes('receiverHasOwnTexture'), 'getHash throw diagnostics must expose whether _texture exists on the receiver');
assert.ok(assetBootstrap.includes('ownerPaths'), 'getHash diagnostics must flatten owner node paths for readable WeChat logs');
assert.ok(assetBootstrap.includes('ownerSummaries'), 'getHash diagnostics must include owner type plus node path summaries');
assert.ok(assetBootstrap.includes('_quarantineSpriteFrameGetHashThrow'), 'getHash throw diagnostics must quarantine bad render owners');
assert.ok(assetBootstrap.includes('spriteFrame.getHash.quarantine'), 'getHash quarantine must emit a bounded owner-clearing trace');
assert.ok(assetBootstrap.includes('clearedOwnerPaths'), 'getHash quarantine logs must flatten cleared owner paths');
assert.ok(assetBootstrap.includes('clearedOwnerSummaries'), 'getHash quarantine logs must include cleared owner summaries');
assert.ok(assetBootstrap.includes('const fallbackHashes = new WeakMap<object, number>();'), 'getHash throw diagnostics must return stable fallback hashes after logging');
assert.ok(assetBootstrap.includes('return fallbackHash;'), 'getHash throw diagnostics must stop RAF error storms after logging the bad receiver');
assert.ok(assetBootstrap.includes('sprite.enabled = false;'), 'getHash quarantine must disable Sprite owners holding the bad frame');
assert.ok(assetBootstrap.includes('renderer.enabled = false;'), 'getHash quarantine must disable custom UIRenderer owners holding the bad frame');
assert.ok(assetBootstrap.includes('requireRenderReadySpriteFrame'), 'core render paths must have a required SpriteFrame render-ready assertion');
assert.ok(assetBootstrap.includes('spriteFrame.require.notReady'), 'required SpriteFrame failures must be diagnosed before Cocos getHash throws');
assert.ok(assetBootstrap.includes('sp.spriteFrame = null;'), 'destroy cleanup must detach SpriteFrame before node removal');
assert.ok(assetBootstrap.includes('renderer.clear();'), 'destroy cleanup must clear custom UIRenderer SpriteFrame owners');
assert.ok(!assetBootstrap.includes('Sprite component scan failed during'), 'diagnostic sprite scans must not print TypeError stacks into WeTest console');

assert.ok(firstLevelRoute.includes('this._cacheSpriteFrame(sf, name'), 'bootstrap bean atlas frames must use the unified SpriteFrame cache owner path');
assert.ok(firstLevelRoute.includes("scope: 'startup-bootstrap'"), 'bootstrap bean atlas frames must be retained as startup-bootstrap resources');
assert.ok(firstLevelRoute.includes('texture,'), 'bootstrap bean atlas cache metadata must include the shared Texture2D');
assert.ok(firstLevelRoute.includes('imageAsset,'), 'bootstrap bean atlas cache metadata must include the source ImageAsset when present');
assert.ok(assetBootstrap.includes('_releaseSpriteFrameCacheResource?.(name, sf, meta, reason)'), 'bootstrap atlas release must decRef cache-retained resources before destroy');

assert.ok(gameplayView.includes('runtime.requireRenderReadySpriteFrame'), 'board SpriteFrame assignment must fail fast before Cocos getHash');
assert.ok(gameplayView.includes('board-slot-batch'), 'batched board slot frames must be render-ready checked at configure source');

assert.ok(boardSlotBatchRenderer.includes('getRenderableTexture'), 'BoardSlotBatchRenderer must validate SpriteFrame internal texture before render');
assert.ok(boardSlotBatchRenderer.includes('isTextureFrameRenderable'), 'BoardSlotBatchRenderer must expose render-ready texture checks');
assert.ok(boardSlotBatchRenderer.includes("typeof texture.getHash !== 'function'"), 'BoardSlotBatchRenderer must not send hashless textures into Cocos render data');

assert.ok(sceneRuntime.includes("startRenderResourceDiagnostics?.('boot-start')"), 'Boot runtime must start render diagnostics in debug');
assert.ok(sceneRuntime.includes("startRenderResourceDiagnostics?.('home-start')"), 'Home runtime must start render diagnostics in debug');
assert.ok(sceneRuntime.includes("startRenderResourceDiagnostics?.('game-start')"), 'Game runtime must start render diagnostics in debug');
assert.ok(sceneRuntime.includes('stopRenderResourceDiagnostics?.(`runtime-destroy:${sceneName}`)'), 'runtime destroy must stop render diagnostics');
assert.ok(sceneRuntime.includes('releaseBackgroundSkinCachedSpriteFrames?.(`runtime-destroy:${sceneName}`)'), 'runtime destroy must release retained background skin SpriteFrames');

console.log('wechat-cloud-diagnostics-fps.test.js passed');
