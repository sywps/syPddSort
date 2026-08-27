const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

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
const gameRuntimeHost = read('assets/Scripts/Core/GameRuntimeHost.ts');
const homeAdFlow = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const gameplaySkillUi = read('assets/Scripts/Core/GameplaySkillUiController.ts');
const gameplaySkillWand = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillWandModule.ts');
const settlementHud = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const gameplayPlacementFx = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
const adConfig = read('assets/Scripts/Platform/AdConfig.ts');
const rewardedAdProvider = read('assets/Scripts/Platform/RewardedAdProvider.ts');

assert.ok(!performanceMgr.includes('game.pause();'), 'EVENT_HIDE must not manually pause the global Cocos engine');
assert.ok(performanceMgr.includes('if (game.isPaused())'), 'EVENT_SHOW must still recover an already-paused engine');
assert.ok(performanceMgr.includes('game.resume();'), 'EVENT_SHOW must resume a stale paused engine');

assert.ok(!debugPerfTrace.includes('enginePaused: !!(game as any).isPaused'), 'engine pause diagnostics must not treat the isPaused method object as true');
assert.ok(debugPerfTrace.includes("typeof isPaused === 'function' ? !!isPaused.call(game) : false"), 'engine pause diagnostics must invoke game.isPaused()');
assert.ok(debugPerfTrace.includes('activeBlockInputEvents: collectActiveBlockInputEvents()'), 'debug snapshots must list active BlockInputEvents nodes');
for (const diagnosticField of [
    'timerPauseRefs',
    'guideInputSuspended',
    'placementInputRefs',
    'placementWatchdogs',
    'skillWatchdog',
    'rewardedGrantTransaction',
    'runtimeOwners',
]) {
    assert.ok(
        debugPerfTrace.includes(`${diagnosticField}:`) || debugPerfTrace.includes(`${diagnosticField},`),
        `debug snapshots must expose ${diagnosticField}`,
    );
}

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
assert.ok(
    boardInput.includes('normalizeGameplayUiPosition(uiPos: { x: number; y: number }): Vec2 {')
        && boardInput.includes('if (isMiniGameRuntime()) return new Vec2(rawX, rawY);')
        && boardInput.includes('return new Vec2(rawX * scaleX, rawY * scaleY);'),
    'mini-game input must keep native Cocos UI coordinates while scaled web previews map once into visible space',
);
assert.ok(
    boardInput.includes('if (!boardResolution?.candidate && this.activeBoardTouches.size === 0)')
        && boardInput.includes('this.resetTouchState();'),
    'a blank root touch must not start a board pan gesture',
);
assert.ok(gameRuntimeHost.includes('protected static readonly DRAG_THRESHOLD = 18;'), 'rapid taps must retain an 18-unit movement slop before board panning');

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
const finishSkillMethod = extractObjectMethod(
    settlementHud,
    'finishSkillUsage(expectedGeneration: number = 0) {',
).replace('expectedGeneration: number = 0', 'expectedGeneration = 0');
const skillMethods = vm.runInNewContext(`({${freezeMethod},${finishSkillMethod}})`, {
    AudioMgr: { inst: { play() {} } },
    FREEZE_PROP_SECONDS: 90,
    PerformanceMgr: { inst: { markUserActivity() {} } },
});

const pauseTimerForProp = extractObjectMethod(
    gameplayPlacementFx,
    "pauseTimerForProp(owner: string = 'prop'): string {",
)
    .replace("owner: string = 'prop'", "owner = 'prop'")
    .replace('): string {', ') {');
const resumeTimerForProp = extractObjectMethod(
    gameplayPlacementFx,
    "resumeTimerForProp(tokenOrOwner: string = 'prop') {",
).replace("tokenOrOwner: string = 'prop'", "tokenOrOwner = 'prop'");
const timerLockMethods = vm.runInNewContext(`({${pauseTimerForProp},${resumeTimerForProp}})`, {
    runtimeLog() {},
});

let timerOwnerSeq = 0;
const nestedTimerLockRuntime = {
    ...timerLockMethods,
    _timerPauseRefs: 0,
    _timerLockedForProp: false,
    _timerOwners: new Map(),
    acquireRuntimeOwner(_scope, owner) {
        const token = `timer:${++timerOwnerSeq}:${owner}`;
        this._timerOwners.set(token, owner);
        return token;
    },
    releaseRuntimeOwner(token) {
        return this._timerOwners.delete(token);
    },
    releaseRuntimeOwnerByName(_scope, owner) {
        const entry = [...this._timerOwners.entries()].reverse().find(([, value]) => value === owner);
        return entry ? this._timerOwners.delete(entry[0]) : false;
    },
    getRuntimeOwnerCount() {
        return this._timerOwners.size;
    },
};
const firstTimerToken = nestedTimerLockRuntime.pauseTimerForProp();
const secondTimerToken = nestedTimerLockRuntime.pauseTimerForProp();
assert.strictEqual(nestedTimerLockRuntime._timerPauseRefs, 2);
assert.strictEqual(nestedTimerLockRuntime._timerLockedForProp, true);
nestedTimerLockRuntime.resumeTimerForProp(firstTimerToken);
assert.strictEqual(nestedTimerLockRuntime._timerPauseRefs, 1);
assert.strictEqual(nestedTimerLockRuntime._timerLockedForProp, true, 'releasing one exact token must preserve the other timer owner');
nestedTimerLockRuntime.resumeTimerForProp(secondTimerToken);
assert.strictEqual(nestedTimerLockRuntime._timerPauseRefs, 0);
assert.strictEqual(nestedTimerLockRuntime._timerLockedForProp, false, 'the final owner release must clear the stale lock flag');
nestedTimerLockRuntime.resumeTimerForProp();
assert.strictEqual(nestedTimerLockRuntime._timerPauseRefs, 0, 'an extra release must remain clamped at zero');
assert.strictEqual(nestedTimerLockRuntime._timerLockedForProp, false, 'an extra release must not recreate the lock');

function createFreezeRuntime(playFreezeSpineFx) {
    const scheduled = [];
    let resumeCount = 0;
    let skillButtonSyncCount = 0;
    const runtime = {
        ...skillMethods,
        _skillActive: false,
        _skillAnimOnly: false,
        _skillTimerPauseToken: '',
        _timerLockedForProp: true,
        pauseTimerForProp() { return 'timer:skill-freeze'; },
        pauseTimerForFinalSecondProp() {},
        resetIdleHintTimer() {},
        refreshFreezeTimerLabel() {},
        playFreezeSpineFx,
        syncSkillButtonRuntimeStates() { skillButtonSyncCount += 1; },
        resumeSkillTimerPause() {
            this._skillTimerPauseToken = '';
            resumeCount += 1;
        },
        scheduleOnce(callback) { scheduled.push(callback); },
        unschedule(callback) {
            const index = scheduled.indexOf(callback);
            if (index >= 0) scheduled.splice(index, 1);
        },
    };
    return {
        runtime,
        scheduled,
        getResumeCount: () => resumeCount,
        getSkillButtonSyncCount: () => skillButtonSyncCount,
    };
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
assert.strictEqual(completedFreeze.getSkillButtonSyncCount(), 1, 'freeze activation completion must restore the other prop buttons');

const skillTimers = [];
const settlementModule = { exports: {} };
const settlementOutput = ts.transpileModule(settlementHud, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
vm.runInNewContext(settlementOutput, {
    module: settlementModule,
    exports: settlementModule.exports,
    require(id) {
        if (id === '../GameCtrlShared') {
            return new Proxy({}, {
                get() {
                    return class RuntimeStub {};
                },
            });
        }
        if (id === 'cc') return { Widget: class Widget {} };
        if (id === '../RuntimeLog') return { runtimeWarn() {} };
        if (id === '../PixelPosterPreviewRenderer') return { renderPixelPosterPreview() {} };
        if (id === '../LevelExperimentService') return {
            getFrontLevelExperimentAnalyticsContext() {
                return { abId: '', abBucket: 'base' };
            },
        };
        throw new Error(`unexpected require: ${id}`);
    },
    console,
    setTimeout(callback, delay) {
        const timer = { callback, delay, cleared: false };
        skillTimers.push(timer);
        return timer;
    },
    clearTimeout(timer) {
        if (timer) timer.cleared = true;
    },
}, { filename: 'SettlementHudModule.ts' });

const skillRecoveryEvents = [];
let skillTimerReleaseCount = 0;
const skillWatchdogRuntime = {
    _skillActive: true,
    _skillAnimOnly: false,
    _skillUsageGeneration: 0,
    _skillUsageWatchdog: null,
    _skillUsageWatchdogMeta: null,
    _skillTimerPauseToken: 'timer:skill:1',
    _timerPauseRefs: 1,
    _timerLockedForProp: true,
    _flyingTargetRefs: new Map([['0,0', 1]]),
    _hiddenSlotIndexRefs: new Map([[0, 1]]),
    _flyingTargets: new Set(['0,0']),
    _hiddenSlotIndices: new Set([0]),
    boardModel: { isAllLocked: () => false },
    cleanupWandMode: () => skillRecoveryEvents.push('cleanup-wand'),
    clearActiveFlyBeanNodes: () => skillRecoveryEvents.push('clear-fly'),
    clearForcedSkillHiddenState: () => skillRecoveryEvents.push('clear-hidden'),
    resumeSkillTimerPause() {
        skillTimerReleaseCount += 1;
        this._skillTimerPauseToken = '';
        this._timerPauseRefs = 0;
    },
    resetIdleHintTimer: () => skillRecoveryEvents.push('idle-reset'),
    renderBoard: () => skillRecoveryEvents.push('render-board'),
    renderSlots: () => skillRecoveryEvents.push('render-slots'),
    checkColorCompletion: () => skillRecoveryEvents.push('check-color'),
    flushPendingColorCompleteEffects: () => skillRecoveryEvents.push('flush-color'),
    checkGuideStepComplete: () => skillRecoveryEvents.push('check-guide'),
    refreshEndgameHints: () => skillRecoveryEvents.push('refresh-hints'),
};
settlementModule.exports.installSettlementHudModule(skillWatchdogRuntime);
const recoveredSkillGeneration = skillWatchdogRuntime.armSkillUsageWatchdog('brush', 1000);
const skillDeadline = skillTimers.find((timer) => timer.delay === 1000 && !timer.cleared);
assert.ok(skillDeadline, 'skill usage must own a bounded watchdog');
skillDeadline.callback();
assert.strictEqual(skillWatchdogRuntime._skillActive, false, 'skill timeout must restore board input');
assert.strictEqual(skillWatchdogRuntime._timerLockedForProp, false, 'skill timeout must release only its timer lease');
assert.strictEqual(skillTimerReleaseCount, 1);
assert.deepStrictEqual(skillRecoveryEvents, [
    'cleanup-wand',
    'clear-fly',
    'clear-hidden',
    'render-board',
    'render-slots',
    'check-color',
    'flush-color',
    'check-guide',
    'refresh-hints',
]);
assert.strictEqual(
    skillWatchdogRuntime.finishSkillUsage(recoveredSkillGeneration),
    false,
    'late skill completion must be idempotent',
);
assert.strictEqual(skillTimerReleaseCount, 1, 'late completion must not release a newer timer owner');

skillWatchdogRuntime._skillActive = true;
skillWatchdogRuntime._skillTimerPauseToken = 'timer:skill:2';
skillWatchdogRuntime._timerPauseRefs = 1;
const newerSkillGeneration = skillWatchdogRuntime.armSkillUsageWatchdog('magnet', 1000);
assert.strictEqual(
    skillWatchdogRuntime.finishSkillUsage(recoveredSkillGeneration),
    false,
    'an older completion must not finish a newer active skill',
);
assert.strictEqual(skillWatchdogRuntime._skillActive, true);
assert.strictEqual(skillTimerReleaseCount, 1);
assert.strictEqual(skillWatchdogRuntime.finishSkillUsage(newerSkillGeneration), true);
assert.strictEqual(skillWatchdogRuntime._skillActive, false);
assert.strictEqual(skillTimerReleaseCount, 2);

console.log('gameplay-input-recovery.test.js passed');
