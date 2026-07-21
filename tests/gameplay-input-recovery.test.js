const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const performanceMgr = read('assets/Scripts/Core/PerformanceMgr.ts');
const debugPerfTrace = read('assets/Scripts/Core/DebugPerfTrace.ts');
const userMgr = read('assets/Scripts/Core/UserMgr.ts');
const sceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const gameplaySession = read('assets/Scripts/Core/GameplaySessionController.ts');
const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const boardInput = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const homeAdFlow = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const adConfig = read('assets/Scripts/Platform/AdConfig.ts');
const rewardedAdProvider = read('assets/Scripts/Platform/RewardedAdProvider.ts');

assert.ok(!performanceMgr.includes('game.pause();'), 'EVENT_HIDE must not manually pause the global Cocos engine');
assert.ok(performanceMgr.includes('if (game.isPaused())'), 'EVENT_SHOW must still recover an already-paused engine');
assert.ok(performanceMgr.includes('game.resume();'), 'EVENT_SHOW must resume a stale paused engine');

assert.ok(!debugPerfTrace.includes('enginePaused: !!(game as any).isPaused'), 'engine pause diagnostics must not treat the isPaused method object as true');
assert.ok(debugPerfTrace.includes("typeof isPaused === 'function' ? !!isPaused.call(game) : false"), 'engine pause diagnostics must invoke game.isPaused()');
assert.ok(debugPerfTrace.includes('activeBlockInputEvents: collectActiveBlockInputEvents()'), 'debug snapshots must list active BlockInputEvents nodes');

assert.ok(userMgr.includes('activeUserInfoButtonCleanups'), 'native user-info buttons must be tracked by an owner cleanup set');
assert.ok(userMgr.includes('destroyUserInfoButtons(): void'), 'native user-info buttons must expose scene teardown cleanup');
assert.ok(sceneRuntime.includes('this.runtime.clearExpandSlotGuide?.();'), 'scene teardown must remove the full-screen slot guide input target');

assert.ok(adConfig.includes('AdConfig.getProvider().notifyGameResumed();'), 'foreground lifecycle must reach the active rewarded-ad provider');
assert.ok(rewardedAdProvider.includes('WECHAT_CLOSE_WATCHDOG_MS = 5 * 60 * 1000'), 'missing native close must retain a bounded five-minute terminal watchdog');
assert.ok(!rewardedAdProvider.includes('FOREGROUND_RECOVERY_GRACE_MS'), 'foreground resume must not arm a provider failure timer');
assert.ok(!rewardedAdProvider.includes("cancelPending('foreground-close-missing')"), 'foreground resume must not cancel a pending rewarded request');
assert.ok(homeAdFlow.includes("this.cancelRewardedGrantInteraction?.('home-transition');"), 'home transition must cancel an orphan rewarded transaction');
assert.ok(gameplaySession.includes("runtime.cancelRewardedGrantInteraction?.('gameplay-init');"), 'new gameplay init must cancel an orphan rewarded transaction');
assert.ok(sceneRuntime.includes('this.runtime.cancelRewardedGrantInteraction?.(`scene-destroy:${sceneName}`);'), 'scene teardown must cancel an orphan rewarded transaction');
assert.ok(!assetBootstrap.includes('scheduleRewardedGrantForegroundRecovery'), 'foreground lifecycle must not cancel a transaction before native ad completion');
assert.ok(!homeAdFlow.includes('REWARDED_GRANT_FOREGROUND_RECOVERY_MS'), 'business reward flow must not retain a duplicate foreground cancellation timer');
assert.ok((assetBootstrap.match(/this\.resetTouchState\?\.\(\);/g) || []).length >= 2, 'hide and show must both clear stale board gesture state');
assert.ok(boardInput.includes('onTouchCancel(_event: EventTouch)') && boardInput.includes('this.resetTouchState();'), 'touch cancel must be a reset-only action path');
assert.ok(!gameplayView.includes('Node.EventType.TOUCH_CANCEL, runtime.onTouchEnd'), 'touch cancel must never execute normal touch-end gameplay');
assert.ok(gameplayView.includes('Node.EventType.TOUCH_CANCEL, runtime.onTouchCancel'), 'input root must bind the reset-only touch-cancel handler');

console.log('gameplay-input-recovery.test.js passed');
