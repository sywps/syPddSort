const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function transpile(relPath) {
    const source = fs.readFileSync(path.join(root, relPath), 'utf8');
    return ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
}

function loadInstaller(timerApi = {}, adApi = {}) {
    const module = { exports: {} };
    const defaultRewardedAdState = {
        status: 'idle',
        previousStatus: 'idle',
        reason: 'test-idle',
        requestId: 0,
        generation: 0,
        changedAt: Date.now(),
        durationMs: 0,
    };
    const analyticsInst = {
        trackAdClick() {},
        trackAdShow() {},
        trackAdFinish() {},
        markAdRevive() {},
        trackReviveSuccess() {},
        ...(adApi.AnalyticsMgr?.inst || {}),
    };
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../GameCtrlShared') {
                return {
                    AdConfig: {
                        cancelRewardedAdInteraction: adApi.cancelRewardedAdInteraction || (() => false),
                        endRewardedAdWait: adApi.endRewardedAdWait || (() => false),
                        showRewardedAd: adApi.showRewardedAd || (() => {
                            throw new Error('showRewardedAd must be stubbed when showTrackedRewardedAd is executed');
                        }),
                        canAutoPreloadRewardedAd: adApi.canAutoPreloadRewardedAd || (() => false),
                        preloadRewardedAd: adApi.preloadRewardedAd || (() => false),
                        setRewardedAdKeepReady: adApi.setRewardedAdKeepReady || (() => {}),
                        getRewardedAdState: adApi.getRewardedAdState || (() => defaultRewardedAdState),
                        subscribeRewardedAdState: adApi.subscribeRewardedAdState || ((listener) => {
                            listener(defaultRewardedAdState);
                            return () => {};
                        }),
                    },
                    AnalyticsMgr: { inst: analyticsInst },
                    AudioMgr: adApi.AudioMgr || { inst: { beginExternalInterruption() {}, endExternalInterruptionWithBgmRestart() {} } },
                    PerformanceMgr: { inst: { markUserActivity() {} } },
                    SySDKMgr: { inst: { reportAdClick() {}, reportAdShow() {}, reportAdFinish() {} } },
                };
            }
            if (id === '../AppRoot') return { AppRoot: {} };
            if (id === '../GameplayResultPanelController') {
                return { ensureGameplayResultPanelController: () => ({}) };
            }
            if (id === '../PixelPosterPreviewRenderer') {
                return { releasePixelPosterPreviewTree() {} };
            }
            if (id === '../RuntimeLog') return { runtimeLog() {} };
            if (id === '../../Platform/WeChatShareReturnService') {
                return { weChatShareReturnService: { start: () => ({ started: false, reason: 'unavailable' }) } };
            }
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        setTimeout: timerApi.setTimeout || setTimeout,
        clearTimeout: timerApi.clearTimeout || clearTimeout,
    };
    vm.runInNewContext(transpile('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts'), sandbox, {
        filename: 'HomeAdFlowModule.ts',
    });
    return module.exports.installHomeAdFlowModule;
}

async function flushMicrotasks(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) {
        await Promise.resolve();
    }
}

function adOutcome(status, attemptId = 1, detail = {}) {
    return { attemptId, status, ...detail };
}

async function main() {
    const installHomeAdFlowModule = loadInstaller();

    const directHandoffEvents = [];
    let directHandoffComplete = null;
    let directHandoffRecoverable = null;
    const directHandoffRuntime = { _skillActive: false };
    installHomeAdFlowModule(directHandoffRuntime);
    directHandoffRuntime.showRewardedAdPendingStrip = (text, mode) => {
        directHandoffEvents.push(`strip:${mode}:${text}`);
    };
    directHandoffRuntime.showTrackedRewardedAd = (_page, onComplete, options) => {
        directHandoffEvents.push('native-show');
        directHandoffComplete = onComplete;
        directHandoffRecoverable = options.onRecoverable;
    };
    assert.strictEqual(directHandoffRuntime.runRewardedGrant('unlock_slot_row', () => true, {
        busyFlag: '_skillActive',
        onInteractionStarted: () => directHandoffEvents.push('interaction-start'),
    }), true);
    assert.deepStrictEqual(
        directHandoffEvents,
        ['interaction-start', 'native-show'],
        'an accepted ad request must hand off directly without a custom preparation strip',
    );
    directHandoffRecoverable();
    assert.deepStrictEqual(
        directHandoffEvents,
        ['interaction-start', 'native-show', 'strip:wait:正在确认广告结果…'],
        'the strip must remain reserved for post-ad result recovery',
    );
    directHandoffComplete(adOutcome('verified_complete'));
    await flushMicrotasks();

    const failureEvents = [];
    const failureRuntime = {
        _skillActive: false,
        showToast: (text) => failureEvents.push(`toast:${text}`),
    };
    installHomeAdFlowModule(failureRuntime);
    failureRuntime.showTrackedRewardedAd = (_page, onComplete) => onComplete(adOutcome('verified_incomplete'));
    assert.strictEqual(failureRuntime.runRewardedGrant('unlock_slot_row', () => {
        failureEvents.push('grant');
        return true;
    }, {
        busyFlag: '_skillActive',
        adFailToast: '广告未完成',
        onAdFail: () => failureEvents.push('ad-fail'),
        onFinally: () => failureEvents.push('finally'),
    }), true);
    assert.deepStrictEqual(
        failureEvents,
        ['toast:广告未完成', 'ad-fail', 'finally'],
        'a failed or early-closed ad must never invoke the slot grant',
    );
    assert.strictEqual(failureRuntime._skillActive, false, 'failure must release the busy flag');

    const noopEvents = [];
    const noopRuntime = {
        _skillActive: false,
        showToast: (text) => noopEvents.push(`toast:${text}`),
    };
    installHomeAdFlowModule(noopRuntime);
    noopRuntime.showTrackedRewardedAd = (_page, onComplete) => onComplete(adOutcome('verified_complete'));
    assert.strictEqual(noopRuntime.runRewardedGrant('unlock_slot_row', () => {
        noopEvents.push('grant');
        return false;
    }, {
        busyFlag: '_skillActive',
        grantFailToast: '暂存槽增加失败，请重试',
        onFinally: () => noopEvents.push('finally'),
    }), true);
    await flushMicrotasks();
    assert.deepStrictEqual(
        noopEvents,
        ['grant', 'toast:暂存槽增加失败，请重试', 'finally'],
        'an ad success followed by a no-op grant must be reported as grant failure',
    );
    assert.strictEqual(noopRuntime._skillActive, false, 'no-op grant finalization must release the busy flag');

    const reviveEvents = [];
    const installReviveFlow = loadInstaller({}, {
        AnalyticsMgr: {
            inst: {
                markAdRevive() { reviveEvents.push('mark'); },
                trackReviveSuccess(page, levelId) { reviveEvents.push(`success:${page}:${levelId}`); },
            },
        },
    });
    const reviveRuntime = { _adShowing: false };
    installReviveFlow(reviveRuntime);
    reviveRuntime.showRewardedAdPendingStrip = () => {};
    reviveRuntime.showTrackedRewardedAd = (_page, onComplete) => onComplete(adOutcome('verified_complete'));
    reviveRuntime.runRewardedGrant('level_revive', () => false, {
        claimKey: 'level_revive:3:false',
        levelId: 3,
        busyFlag: '_adShowing',
        markLevelRevive: true,
    });
    await flushMicrotasks();
    assert.deepStrictEqual(reviveEvents, [], 'completed video plus failed gameplay grant must not count as a revive');

    reviveRuntime.runRewardedGrant('level_revive', () => Promise.resolve(true), {
        claimKey: 'level_revive:3:true',
        levelId: 3,
        busyFlag: '_adShowing',
        markLevelRevive: true,
    });
    assert.deepStrictEqual(reviveEvents, [], 'revive analytics must wait for the gameplay grant promise');
    await flushMicrotasks();
    assert.deepStrictEqual(
        reviveEvents,
        ['mark', 'success:level_revive:3'],
        'resolved gameplay grant must mark and report one successful revive',
    );

    const cancelledEvents = [];
    let delayedAdComplete = null;
    const cancelledRuntime = {
        _skillActive: false,
    };
    installHomeAdFlowModule(cancelledRuntime);
    cancelledRuntime.showTrackedRewardedAd = (_page, onComplete) => {
        delayedAdComplete = onComplete;
    };
    assert.strictEqual(cancelledRuntime.runRewardedGrant('unlock_slot_row', () => {
        cancelledEvents.push('grant');
        return true;
    }, {
        busyFlag: '_skillActive',
        onFinally: () => cancelledEvents.push('finally'),
    }), true);
    assert.strictEqual(cancelledRuntime._skillActive, true, 'pending ad must hold the busy flag');
    assert.strictEqual(cancelledRuntime.cancelRewardedGrantInteraction('gameplay-init'), true);
    assert.strictEqual(cancelledRuntime._skillActive, false, 'scene or gameplay reset must release the busy flag');
    assert.deepStrictEqual(cancelledEvents, ['finally']);

    delayedAdComplete(adOutcome('verified_complete'));
    await flushMicrotasks();
    assert.deepStrictEqual(
        cancelledEvents,
        ['finally'],
        'a late successful callback must neither grant nor finalize twice after cancellation',
    );

    const providerCancelEvents = [];
    let providerCancelComplete = null;
    const installWithSynchronousProviderCancel = loadInstaller({}, {
        cancelRewardedAdInteraction(reason) {
            providerCancelEvents.push(`provider-cancel:${reason}`);
            providerCancelComplete(adOutcome('unknown', 1, { reason: `cancelled:${reason}` }));
            return true;
        },
    });
    const providerCancelRuntime = {
        _skillActive: false,
        showToast: (text) => providerCancelEvents.push(`toast:${text}`),
    };
    installWithSynchronousProviderCancel(providerCancelRuntime);
    providerCancelRuntime.showTrackedRewardedAd = (_page, onComplete) => {
        providerCancelComplete = onComplete;
    };
    providerCancelRuntime.runRewardedGrant('unlock_slot_row', () => {
        providerCancelEvents.push('grant');
        return true;
    }, {
        busyFlag: '_skillActive',
        adFailToast: '广告未完成',
        onAdFail: () => providerCancelEvents.push('ad-fail'),
        onFinally: () => providerCancelEvents.push('finally'),
    });
    assert.strictEqual(providerCancelRuntime.cancelRewardedGrantInteraction('scene-destroy'), true);
    assert.deepStrictEqual(
        providerCancelEvents,
        ['finally', 'provider-cancel:scene-destroy'],
        'runtime cancellation must finalize before a synchronous provider failure callback and suppress teardown-time failure UI',
    );
    assert.strictEqual(providerCancelRuntime._skillActive, false, 'provider cancellation must leave the busy flag released');

    const foregroundEvents = [];
    let foregroundLateComplete = null;
    let foregroundRecoverable = null;
    const foregroundRuntime = { _skillActive: false };
    installHomeAdFlowModule(foregroundRuntime);
    foregroundRuntime.showTrackedRewardedAd = (_page, onComplete, options) => {
        foregroundLateComplete = onComplete;
        foregroundRecoverable = options.onRecoverable;
    };
    foregroundRuntime.runRewardedGrant('unlock_slot_row', () => {
        foregroundEvents.push('grant');
        return true;
    }, {
        busyFlag: '_skillActive',
        onRecoverable: () => foregroundEvents.push('recoverable'),
        onFinally: () => foregroundEvents.push('finally'),
    });
    assert.strictEqual(foregroundRuntime._skillActive, true, 'the transaction must remain pending until native ad completion');
    foregroundRecoverable();
    assert.strictEqual(foregroundRuntime._skillActive, false, 'foreground recovery must release the gameplay busy lease');
    assert.strictEqual(foregroundRuntime._rewardedGrantTransaction.phase, 'recoverable');
    assert.deepStrictEqual(foregroundEvents, ['recoverable'], 'recoverable is not a terminal finally/failure');
    foregroundLateComplete(adOutcome('verified_complete'));
    await flushMicrotasks();
    assert.deepStrictEqual(foregroundEvents, ['recoverable', 'grant', 'finally'], 'a verified success after foreground must still execute and finalize the grant');
    assert.strictEqual(foregroundRuntime._skillActive, false, 'successful completion must release the gameplay busy flag');

    const recoverableTimers = [];
    const recoverableEndEvents = [];
    const installRecoverableEndFlow = loadInstaller({
        setTimeout(callback, delay) {
            const timer = { callback, delay, cleared: false };
            recoverableTimers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cleared = true;
        },
    }, {
        endRewardedAdWait(reason) {
            recoverableEndEvents.push(`provider-end:${reason}`);
            return true;
        },
    });
    let recoverableEndHook = null;
    const recoverableEndRuntime = {
        _skillActive: false,
        showToast: (text) => recoverableEndEvents.push(`toast:${text}`),
    };
    installRecoverableEndFlow(recoverableEndRuntime);
    recoverableEndRuntime.showTrackedRewardedAd = (_page, _onComplete, options) => {
        recoverableEndHook = options.onRecoverable;
    };
    recoverableEndRuntime.runRewardedGrant('unlock_slot_row', () => {
        recoverableEndEvents.push('grant');
        return true;
    }, {
        claimKey: 'unlock_slot_row:10:recoverable-end',
        busyFlag: '_skillActive',
        suppressPendingStrip: true,
        onRecoverable: () => recoverableEndEvents.push('recoverable'),
        onRecoverableEndable: () => recoverableEndEvents.push('endable'),
        onFinally: () => recoverableEndEvents.push('finally'),
    });
    recoverableEndHook();
    const endableTimer = recoverableTimers.find((timer) => timer.delay === 5000 && !timer.cleared);
    assert.ok(endableTimer, 'recoverable result confirmation must wait five seconds before offering an exit');
    endableTimer.callback();
    assert.strictEqual(recoverableEndRuntime._rewardedGrantTransaction.phase, 'recoverable_endable');
    assert.deepStrictEqual(recoverableEndEvents, [
        'recoverable',
        'toast:广告结果仍未返回，可点击“结束等待”',
        'endable',
    ]);
    assert.strictEqual(
        recoverableEndRuntime.cancelRewardedGrantInteraction('recoverable-user-end'),
        true,
        'the explicit end action must release a recoverable transaction',
    );
    assert.deepStrictEqual(recoverableEndEvents, [
        'recoverable',
        'toast:广告结果仍未返回，可点击“结束等待”',
        'endable',
        'finally',
        'provider-end:recoverable-user-end',
    ]);
    assert.strictEqual(recoverableEndRuntime._rewardedGrantTransaction, null);
    assert.strictEqual(recoverableEndRuntime._skillActive, false);

    const pendingEvents = [];
    const pendingCallbacks = [];
    const pendingRecoveries = [];
    const pendingRuntime = {
        _skillActive: false,
        showToast: (text) => pendingEvents.push(`toast:${text}`),
    };
    installHomeAdFlowModule(pendingRuntime);
    pendingRuntime.showTrackedRewardedAd = (_page, onComplete, options) => {
        pendingCallbacks.push(onComplete);
        pendingRecoveries.push(options.onRecoverable);
    };
    let pendingGrantCount = 0;
    assert.strictEqual(pendingRuntime.runRewardedGrant('unlock_slot_row', () => {
        pendingGrantCount += 1;
        return true;
    }, {
        claimKey: 'unlock_slot_row:10:2',
        busyFlag: '_skillActive',
        onInteractionReleased: () => pendingEvents.push('release:1'),
        onFinally: () => pendingEvents.push('finally:1'),
    }), true);
    const stableClaimId = pendingRuntime._rewardedGrantTransaction.id;
    pendingRecoveries[0]();
    assert.strictEqual(pendingRuntime._rewardedGrantTransaction.id, stableClaimId);
    assert.strictEqual(pendingRuntime._rewardedGrantTransaction.phase, 'recoverable');
    assert.deepStrictEqual(pendingEvents, ['release:1']);

    assert.strictEqual(pendingRuntime.runRewardedGrant('unlock_slot_row', () => {
        pendingGrantCount += 1;
        return true;
    }, {
        claimKey: 'unlock_slot_row:10:2',
        busyFlag: '_skillActive',
        onInteractionReleased: () => pendingEvents.push('release:2'),
        onFinally: () => pendingEvents.push('finally:2'),
    }), false, 'a recoverable claim must preserve the first native close instead of replacing it');
    assert.strictEqual(pendingRuntime._rewardedGrantTransaction.id, stableClaimId, 'the original claim must remain active');
    assert.strictEqual(pendingCallbacks.length, 1, 'repeat taps must not open a second rewarded ad');
    assert.deepStrictEqual(pendingEvents, ['release:1', 'toast:奖励确认中，请稍后']);

    pendingCallbacks[0](adOutcome('verified_complete', 1));
    pendingCallbacks[0](adOutcome('verified_complete', 1));
    await flushMicrotasks();
    assert.strictEqual(pendingGrantCount, 1, 'the delayed authoritative close must grant the original claim exactly once');
    assert.deepStrictEqual(pendingEvents, ['release:1', 'toast:奖励确认中，请稍后', 'finally:1']);
    assert.strictEqual(pendingRuntime._rewardedGrantTransaction, null);

    const unknownEvents = [];
    const unknownRuntime = {
        _skillActive: false,
        showToast: (text) => unknownEvents.push(`toast:${text}`),
    };
    installHomeAdFlowModule(unknownRuntime);
    unknownRuntime.showTrackedRewardedAd = (_page, onComplete) => onComplete(adOutcome('unknown'));
    assert.strictEqual(unknownRuntime.runRewardedGrant('unlock_slot_row', () => {
        unknownEvents.push('grant');
        return true;
    }, {
        busyFlag: '_skillActive',
        adFailToast: '广告结果未确认',
        onFinally: () => unknownEvents.push('finally'),
    }), true);
    assert.deepStrictEqual(unknownEvents, ['toast:广告结果未确认', 'finally']);
    assert.strictEqual(unknownRuntime._rewardedGrantTransaction, null, 'a terminal unknown result must allow a clean later attempt');

    const deadlineTimers = [];
    const installDeadlineFlow = loadInstaller({
        setTimeout(callback, delay) {
            const timer = { callback, delay, cleared: false };
            deadlineTimers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cleared = true;
        },
    });
    const deadlineEvents = [];
    let resolveTimedOutGrant;
    let deadlineAdRequests = 0;
    const deadlineRuntime = {
        _skillActive: false,
        showToast: (text) => deadlineEvents.push(`toast:${text}`),
    };
    installDeadlineFlow(deadlineRuntime);
    deadlineRuntime.showTrackedRewardedAd = (_page, onComplete) => {
        deadlineAdRequests += 1;
        onComplete(adOutcome('verified_complete'));
    };
    assert.strictEqual(deadlineRuntime.runRewardedGrant('gold_acquire_reward', () => (
        new Promise((resolve) => {
            resolveTimedOutGrant = resolve;
        })
    ), {
        claimKey: 'gold-acquire:timeout',
        busyFlag: '_skillActive',
        grantTimeoutMs: 25,
        onFinally: () => deadlineEvents.push('finally'),
    }), true);
    assert.strictEqual(deadlineRuntime._rewardedGrantTransaction.phase, 'grant');
    const grantDeadline = deadlineTimers.find((timer) => timer.delay === 25 && !timer.cleared);
    assert.ok(grantDeadline, 'grant stage must own a concrete deadline');
    grantDeadline.callback();
    assert.strictEqual(deadlineRuntime._rewardedGrantTransaction, null, 'grant timeout must release the global transaction');
    assert.deepStrictEqual(deadlineEvents, ['toast:奖励处理超时，请稍后查看到账结果', 'finally']);
    assert.ok(deadlineRuntime._rewardedGrantTimedOutClaims.has('gold-acquire:timeout'));
    assert.strictEqual(deadlineRuntime.runRewardedGrant('gold_acquire_reward', () => true, {
        claimKey: 'gold-acquire:timeout',
    }), false, 'the same logical claim must stay quarantined while the timed-out grant is unresolved');
    assert.strictEqual(deadlineAdRequests, 1, 'quarantined retry must not open another rewarded ad');
    resolveTimedOutGrant(true);
    await flushMicrotasks();
    assert.ok(!deadlineRuntime._rewardedGrantTimedOutClaims.has('gold-acquire:timeout'));
    assert.strictEqual(
        deadlineEvents.filter((event) => event === 'finally').length,
        1,
        'late grant settlement must not finalize twice',
    );

    const afterGrantTimers = [];
    const installAfterGrantDeadlineFlow = loadInstaller({
        setTimeout(callback, delay) {
            const timer = { callback, delay, cleared: false };
            afterGrantTimers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cleared = true;
        },
    });
    let resolveTimedOutAfterGrant;
    let afterGrantFinallyCount = 0;
    const afterGrantRuntime = { _skillActive: false };
    installAfterGrantDeadlineFlow(afterGrantRuntime);
    afterGrantRuntime.showTrackedRewardedAd = (_page, onComplete) => onComplete(adOutcome('verified_complete'));
    assert.strictEqual(afterGrantRuntime.runRewardedGrant('win_bonus_reward', () => true, {
        claimKey: 'win-bonus:after-timeout',
        afterGrantTimeoutMs: 35,
        afterGrant: () => new Promise((resolve) => {
            resolveTimedOutAfterGrant = resolve;
        }),
        onFinally: () => {
            afterGrantFinallyCount += 1;
        },
    }), true);
    await flushMicrotasks();
    assert.strictEqual(afterGrantRuntime._rewardedGrantTransaction.phase, 'after_grant');
    const afterGrantDeadline = afterGrantTimers.find((timer) => timer.delay === 35 && !timer.cleared);
    assert.ok(afterGrantDeadline, 'afterGrant stage must own an independent deadline');
    afterGrantDeadline.callback();
    assert.strictEqual(afterGrantRuntime._rewardedGrantTransaction, null);
    assert.strictEqual(afterGrantFinallyCount, 1);
    assert.ok(afterGrantRuntime._rewardedGrantTimedOutClaims.has('win-bonus:after-timeout'));
    resolveTimedOutAfterGrant(true);
    await flushMicrotasks();
    assert.ok(!afterGrantRuntime._rewardedGrantTimedOutClaims.has('win-bonus:after-timeout'));
    assert.strictEqual(afterGrantFinallyCount, 1, 'late afterGrant settlement must remain inert');

    const inventorySchedules = [];
    const inventoryPreloads = [];
    const inventoryKeepReady = [];
    const inventoryFunnel = [];
    const inventoryOutcomes = [];
    let inventoryListener = null;
    let inventoryShowAttempt = null;
    let inventoryGeneration = 0;
    let inventoryState = {
        status: 'idle',
        previousStatus: 'idle',
        reason: 'test-idle',
        requestId: 0,
        generation: 0,
        changedAt: Date.now(),
        durationMs: 0,
    };
    const transitionInventory = (status, reason, generation = inventoryState.generation) => {
        inventoryState = {
            ...inventoryState,
            previousStatus: inventoryState.status,
            status,
            reason,
            generation,
            changedAt: Date.now(),
            durationMs: 0,
        };
        inventoryListener?.(inventoryState);
    };
    const installInventoryFlow = loadInstaller({}, {
        canAutoPreloadRewardedAd: () => true,
        setRewardedAdKeepReady(keepReady) {
            inventoryKeepReady.push(keepReady);
        },
        getRewardedAdState: () => inventoryState,
        subscribeRewardedAdState(listener) {
            inventoryListener = listener;
            listener(inventoryState);
            return () => {
                if (inventoryListener === listener) inventoryListener = null;
            };
        },
        preloadRewardedAd(reason) {
            inventoryPreloads.push(reason);
            inventoryGeneration += 1;
            transitionInventory('loading', reason, inventoryGeneration);
            return true;
        },
        showRewardedAd(callback, hooks) {
            inventoryShowAttempt = { callback, hooks };
            transitionInventory('visible', 'show-resolved');
            hooks.onShow?.();
        },
        AnalyticsMgr: {
            inst: {
                trackFunnelEvent(event) {
                    inventoryFunnel.push(event);
                },
            },
        },
    });
    const inventoryRuntime = {
        _pendingRewardedAdPreload: null,
        _rewardedAdWarmSlotDesired: false,
        _rewardedAdWarmSlotReason: '',
        _rewardedAdWarmSlotRetryCount: 0,
        _rewardedAdWarmSlotBlockedReason: '',
        _rewardedAdWarmSlotLastEnsureAt: 0,
        _rewardedAdStateUnsubscribe: null,
        _rewardedAdTelemetryPage: '',
        _rewardedAdTelemetryLevelId: 0,
        _adTimerSuspended: false,
        _timerStarted: false,
        _skillActive: false,
        _gameForeground: false,
        _isThemeLevel: false,
        isGameEnd: false,
        isValid: true,
        getRuntimeSceneName: () => 'Game',
        getActiveLogicalLevelId: () => 165,
        scheduleOnce(callback, delay) {
            inventorySchedules.push({ callback, delay, cancelled: false });
        },
        unschedule(callback) {
            const scheduled = inventorySchedules.find((entry) => entry.callback === callback);
            if (scheduled) scheduled.cancelled = true;
        },
    };
    installInventoryFlow(inventoryRuntime);

    inventoryRuntime.scheduleRewardedAdPreload('late-loading:test', 0);
    assert.strictEqual(inventoryRuntime._rewardedAdWarmSlotDesired, true);
    assert.deepStrictEqual(inventoryPreloads, [], 'background dispatch must preserve demand without starting a native load');
    assert.ok(
        inventoryFunnel.some((event) => (
            event.eventName === 'rewarded_ad_preload_deferred'
            && event.extra?.blockedReason === 'background'
        )),
        'the first blocked reason must remain observable',
    );

    inventoryRuntime._gameForeground = true;
    assert.strictEqual(inventoryRuntime.ensureRewardedAdWarmSlot('app-foreground'), true);
    assert.strictEqual(inventoryRuntime.ensureRewardedAdWarmSlot('duplicate-ensure'), true);
    assert.deepStrictEqual(
        inventoryPreloads,
        ['app-foreground'],
        'foreground restoration and repeated ensure calls must share one in-flight native load',
    );

    transitionInventory('idle', 'load-failed:app-foreground');
    const firstRetry = inventorySchedules.find((entry) => entry.delay === 2 && !entry.cancelled);
    assert.ok(firstRetry, 'a failed warm-slot load must schedule the first bounded retry');
    inventoryRuntime._gameForeground = false;
    firstRetry.callback();
    assert.deepStrictEqual(
        inventoryPreloads,
        ['app-foreground'],
        'a retry firing in the background must keep demand without creating an ad',
    );
    inventoryRuntime._gameForeground = true;
    assert.strictEqual(inventoryRuntime.ensureRewardedAdWarmSlot('app-foreground-after-retry'), true);
    assert.deepStrictEqual(inventoryPreloads, ['app-foreground', 'app-foreground-after-retry']);
    transitionInventory('ready', 'app-foreground-after-retry');
    assert.strictEqual(inventoryRuntime._rewardedAdWarmSlotRetryCount, 0, 'ready inventory must reset retry backoff');

    inventoryRuntime.showTrackedRewardedAd(
        'unlock_slot_row',
        (outcome) => inventoryOutcomes.push(outcome.status),
        { levelId: 165 },
    );
    assert.ok(inventoryShowAttempt, 'ready inventory must hand off to the existing provider immediately');
    assert.ok(
        inventoryFunnel.some((event) => (
            event.eventName === 'rewarded_ad_inventory_at_click'
            && event.success === true
            && event.extra?.providerStatus === 'ready'
        )),
        'the click must record whether it hit ready inventory',
    );
    transitionInventory('idle', 'outcome:verified_complete:');
    inventoryShowAttempt.callback(adOutcome('verified_complete', 9));
    assert.deepStrictEqual(inventoryOutcomes, ['verified_complete']);
    assert.deepStrictEqual(
        inventoryPreloads,
        [
            'app-foreground',
            'app-foreground-after-retry',
            'after-ad-verified_complete:attempt-9',
        ],
        'provider settlement must request the next generation immediately without a 1.5-second gap',
    );
    assert.strictEqual(inventoryState.status, 'loading');
    assert.ok(inventoryKeepReady.includes(true), 'eligible Game inventory must hold the ready-retention lease');
    assert.ok(
        inventoryFunnel.some((event) => event.eventName === 'rewarded_ad_replenish_requested'),
        'post-outcome inventory replenishment must remain observable',
    );

    const trackedCallbacks = [];
    let trackedAudioRefs = 0;
    const installTrackedFlow = loadInstaller({}, {
        showRewardedAd(callback, hooks) {
            trackedCallbacks.push({ callback, hooks });
        },
        AudioMgr: {
            inst: {
                beginExternalInterruption() { trackedAudioRefs += 1; },
                endExternalInterruptionWithBgmRestart() {
                    if (trackedAudioRefs > 0) trackedAudioRefs -= 1;
                },
            },
        },
    });
    let trackedGrantCount = 0;
    const trackedRuntime = {
        _adShowing: false,
        _adTimerSuspended: false,
        _timerStarted: false,
        _skillActive: false,
        _gameForeground: true,
        isValid: true,
        getActiveLogicalLevelId: () => 165,
        scheduleOnce() {
            throw new Error('verified reward must not depend on a later Cocos schedule');
        },
        unschedule() {},
    };
    installTrackedFlow(trackedRuntime);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
        assert.strictEqual(trackedRuntime.runRewardedGrant('unlock_slot_row', () => {
            trackedGrantCount += 1;
            return true;
        }, {
            claimKey: `unlock_slot_row:165:${attempt}`,
            busyFlag: '_adShowing',
        }), true);
        assert.strictEqual(trackedRuntime._adShowing, true);
        const trackedAttempt = trackedCallbacks.shift();
        assert.ok(trackedAttempt, 'shared provider callback must be registered');
        trackedAttempt.callback(adOutcome('verified_complete', attempt, { closeResult: { isEnded: true } }));
        assert.strictEqual(trackedGrantCount, attempt, 'verified close must invoke the concrete grant in the same turn');
        assert.strictEqual(trackedAudioRefs, 0, 'verified close must release shared audio before later lifecycle work');
        assert.strictEqual(trackedRuntime._adShowing, false);
        await flushMicrotasks();
        assert.strictEqual(trackedRuntime._rewardedGrantTransaction, null);
    }

    assert.strictEqual(trackedRuntime.cancelRewardedGrantInteraction('scene-destroy'), false, 'later teardown must not find a completed claim to cancel');
    assert.strictEqual(trackedGrantCount, 2, 'two independent completed ads must each grant exactly once');

    console.log('rewarded-grant-transaction.test.js passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
