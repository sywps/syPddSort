const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
const gameplaySkillUi = read('assets/Scripts/Core/GameplaySkillUiController.ts');
const gameplaySkillWand = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillWandModule.ts');
const settlementHud = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
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
assert.ok(!rewardedAdProvider.includes('WECHAT_CLOSE_WATCHDOG_MS'), 'reward completion must not depend on a fixed watchdog');
assert.ok(!rewardedAdProvider.includes('getShowSafetyMs'), 'shown ads must not acquire any time-based completion verdict');
assert.ok(rewardedAdProvider.includes("...(this.platform === 'wechat' ? { multiton: true } : {})"), 'WeChat attempts must use isolated multiton instances');
assert.ok(rewardedAdProvider.includes('ad.offClose?.(closeListener);'), 'settled attempts must detach close listeners');
assert.ok(rewardedAdProvider.includes('ad.destroy?.();'), 'settled attempts must destroy their native instance');
assert.ok(rewardedAdProvider.includes("onRecoverable?: (attemptId: number, reason: 'foreground') => void;"), 'foreground must expose a non-terminal recoverable state');
assert.ok(!rewardedAdProvider.includes('FOREGROUND_RECOVERY_GRACE_MS'), 'foreground resume must not arm a provider failure timer');
assert.ok(!rewardedAdProvider.includes("cancelPending('foreground-close-missing')"), 'foreground resume must not cancel a pending rewarded request');
assert.ok(rewardedAdProvider.includes("'establishing' | 'visible'"), 'native show establishment and visible close wait must be distinct states');
assert.ok(rewardedAdProvider.includes("reason: 'show-establish-timeout'"), 'an unresolved native show operation must have a bounded technical-error exit');
assert.ok(homeAdFlow.includes("this.cancelRewardedGrantInteraction?.('home-transition');"), 'home transition must cancel an orphan rewarded transaction');
assert.ok(gameplaySession.includes("runtime.cancelRewardedGrantInteraction?.('gameplay-init');"), 'new gameplay init must cancel an orphan rewarded transaction');
assert.ok(sceneRuntime.includes('this.runtime.cancelRewardedGrantInteraction?.(`scene-destroy:${sceneName}`);'), 'scene teardown must cancel an orphan rewarded transaction');
assert.ok(!assetBootstrap.includes('scheduleRewardedGrantForegroundRecovery'), 'foreground lifecycle must not cancel a transaction before native ad completion');
assert.ok(!homeAdFlow.includes('REWARDED_GRANT_FOREGROUND_RECOVERY_MS'), 'business reward flow must not retain a duplicate foreground cancellation timer');
assert.ok(!homeAdFlow.includes('waitForCloseBeforeComplete'), 'verified reward delivery must not depend on a cancellable post-close Cocos schedule');
assert.ok(homeAdFlow.includes('grantResult = claimGrant();'), 'verified completion must invoke the concrete grant before a later lifecycle cancellation can run');
assert.ok(gameplaySkillUi.includes("if (inventoryCount <= 0 && (runtime._adShowing || runtime._rewardedGrantTransaction))"), 'pending reward interaction must not fall through into a second acquire modal');
assert.ok((assetBootstrap.match(/this\.resetTouchState\?\.\(\);/g) || []).length >= 2, 'hide and show must both clear stale board gesture state');
assert.ok(boardInput.includes('onTouchCancel(_event: EventTouch)') && boardInput.includes('this.resetTouchState();'), 'touch cancel must be a reset-only action path');
assert.ok(boardInput.includes('this.scheduleOnce(fallback, 0.6);'), 'skill viewport reset must have a bounded fallback when its tween callback is interrupted');
assert.ok(boardInput.includes('.call(complete)'), 'skill viewport tween and fallback must converge on one idempotent completion path');
assert.ok(!gameplayView.includes('Node.EventType.TOUCH_CANCEL, runtime.onTouchEnd'), 'touch cancel must never execute normal touch-end gameplay');
assert.ok(gameplayView.includes('Node.EventType.TOUCH_CANCEL, runtime.onTouchCancel'), 'input root must bind the reset-only touch-cancel handler');

function extractObjectMethod(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing method signature: ${signature}`);
    const openBrace = source.indexOf('{', start);
    let depth = 0;
    for (let index = openBrace; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] !== '}') continue;
        depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated method: ${signature}`);
}

const freezeMethod = extractObjectMethod(
    gameplaySkillWand,
    'useSkillFreeze(timerAlreadyPaused: boolean = false)',
).replace('timerAlreadyPaused: boolean', 'timerAlreadyPaused');
const finishSkillMethod = extractObjectMethod(settlementHud, 'finishSkillUsage()');
const skillMethods = vm.runInNewContext(`({${freezeMethod},${finishSkillMethod}})`, {
    AudioMgr: { inst: { play() {} } },
    FREEZE_PROP_SECONDS: 180,
    PerformanceMgr: { inst: { markUserActivity() {} } },
});

function createFreezeRuntime(playFreezeSpineFx) {
    const scheduled = [];
    let resumeCount = 0;
    const runtime = {
        ...skillMethods,
        _skillActive: false,
        _skillAnimOnly: false,
        _timerLockedForProp: true,
        pauseTimerForFinalSecondProp() {},
        resetIdleHintTimer() {},
        refreshFreezeTimerLabel() {},
        playFreezeSpineFx,
        resumeTimerForProp() { resumeCount += 1; },
        scheduleOnce(callback) { scheduled.push(callback); },
        unschedule(callback) {
            const index = scheduled.indexOf(callback);
            if (index >= 0) scheduled.splice(index, 1);
        },
    };
    return { runtime, scheduled, getResumeCount: () => resumeCount };
}

const failedFreeze = createFreezeRuntime(() => {
    throw new Error('[freeze-spine-fx] cached playback failed');
});
assert.throws(() => failedFreeze.runtime.useSkillFreeze(true), /cached playback failed/);
assert.strictEqual(failedFreeze.scheduled.length, 0, 'failed freeze activation must remove its pending unlock callback');
assert.strictEqual(failedFreeze.runtime._skillActive, false, 'failed freeze activation must restore board input');
assert.strictEqual(failedFreeze.runtime._skillAnimOnly, false, 'failed freeze activation must clear animation-only state');
assert.strictEqual(failedFreeze.runtime._timerLockedForProp, false, 'failed freeze activation must release the prop timer lock');
assert.strictEqual(failedFreeze.getResumeCount(), 1, 'failed freeze activation must release the timer exactly once');

const completedFreeze = createFreezeRuntime(() => {});
completedFreeze.runtime.useSkillFreeze(true);
assert.strictEqual(completedFreeze.scheduled.length, 1);
completedFreeze.scheduled[0]();
assert.strictEqual(completedFreeze.runtime._skillActive, false);
assert.strictEqual(completedFreeze.getResumeCount(), 1, 'normal freeze activation must release the timer exactly once');

console.log('gameplay-input-recovery.test.js passed');
