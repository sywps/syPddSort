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

function loadWechatProvider(behavior = {}) {
    const timers = [];
    const adCalls = [];
    const adInstances = [];
    const wxRuntime = {
        createRewardedVideoAd(adOptions) {
            const id = adInstances.length + 1;
            const closeCallbacks = [];
            const allCloseCallbacks = [];
            const errorCallbacks = [];
            const allErrorCallbacks = [];
            const ad = {
                id,
                options: adOptions,
                destroyed: false,
                onClose(callback) {
                    closeCallbacks.push(callback);
                    allCloseCallbacks.push(callback);
                },
                offClose(callback) {
                    const index = closeCallbacks.indexOf(callback);
                    if (index >= 0) closeCallbacks.splice(index, 1);
                },
                onError(callback) {
                    errorCallbacks.push(callback);
                    allErrorCallbacks.push(callback);
                },
                offError(callback) {
                    const index = errorCallbacks.indexOf(callback);
                    if (index >= 0) errorCallbacks.splice(index, 1);
                },
                load() {
                    adCalls.push(`${id}:load`);
                    return Promise.resolve();
                },
                show() {
                    adCalls.push(`${id}:show`);
                    return typeof behavior.show === 'function'
                        ? behavior.show(ad)
                        : Promise.resolve();
                },
                destroy() {
                    this.destroyed = true;
                    adCalls.push(`${id}:destroy`);
                },
                triggerClose(result) {
                    for (const callback of [...closeCallbacks]) callback(result);
                },
                forceStaleClose(result) {
                    for (const callback of [...allCloseCallbacks]) callback(result);
                },
                triggerError(error) {
                    for (const callback of [...errorCallbacks]) callback(error);
                },
                forceStaleError(error) {
                    for (const callback of [...allErrorCallbacks]) callback(error);
                },
            };
            adInstances.push(ad);
            return ad;
        },
        getDeviceInfo() {
            return { platform: 'ios' };
        },
        getSystemInfoSync() {
            return {};
        },
    };
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../Core/MiniGamePlatform') {
                return {
                    getDouyinMiniGameRuntime: () => null,
                    getMiniGameBuildMode: () => 'release',
                    getMiniGameBuildPlatform: () => 'wechat',
                    getWeChatMiniGameRuntime: () => wxRuntime,
                };
            }
            throw new Error(`unexpected require: ${id}`);
        },
        console: {
            log() {},
            warn() {},
            error() {},
        },
        setTimeout(callback, delay) {
            const timer = { callback, delay, cleared: false, fired: false };
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cleared = true;
        },
    };
    vm.runInNewContext(transpile('assets/Scripts/Platform/RewardedAdProvider.ts'), sandbox, {
        filename: 'RewardedAdProvider.ts',
    });
    return {
        provider: module.exports.getRewardedAdProvider({
            douyin: 'douyin-test-ad',
            wechat: 'wechat-test-ad',
        }),
        adCalls,
        adInstances,
        currentAd() {
            assert.ok(adInstances.length > 0, 'provider must create an ad instance');
            return adInstances[adInstances.length - 1];
        },
        activeTimers(delay) {
            return timers.filter((timer) => !timer.cleared && !timer.fired && timer.delay === delay);
        },
        fireTimer(delay) {
            const timer = this.activeTimers(delay)[0];
            assert.ok(timer, `expected active timer: ${delay}`);
            timer.fired = true;
            timer.callback();
        },
        triggerClose(result) {
            this.currentAd().triggerClose(result);
        },
        triggerError(error) {
            this.currentAd().triggerError(error);
        },
    };
}

async function flushMicrotasks(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) {
        await Promise.resolve();
    }
}

async function testCompletedAdHasNoCompletionWatchdog() {
    const harness = loadWechatProvider();
    const events = [];
    harness.provider.show(
        (outcome) => events.push(`result:${outcome.status}:${outcome.attemptId}`),
        {
            onShow: () => events.push('show'),
            onClose: () => events.push('close'),
        },
    );
    await flushMicrotasks();

    assert.deepStrictEqual(harness.adCalls, ['1:load', '1:show']);
    assert.strictEqual(harness.adInstances[0].options.adUnitId, 'wechat-test-ad');
    assert.strictEqual(harness.adInstances[0].options.multiton, true, 'each WeChat attempt must use an independently destroyable multiton instance');
    assert.deepStrictEqual(events, ['show'], 'reward must wait for the native close callback');
    assert.strictEqual(harness.activeTimers(60000).length, 0, 'a long WeChat ad must not fail at one minute');
    assert.strictEqual(harness.activeTimers(300000).length, 0, 'there must be no five-minute completion verdict');
    assert.strictEqual(harness.activeTimers(1800000).length, 0, 'there must be no thirty-minute completion verdict either');
    assert.strictEqual(harness.activeTimers(10000).length, 0, 'show-establishment timer must clear once the ad is visible');

    harness.triggerClose({ isEnded: true });
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(events, ['show', 'close', 'result:verified_complete:1'], 'completed native close must settle exactly once');
    assert.strictEqual(harness.adInstances[0].destroyed, true, 'a settled attempt must release its native instance');
}

async function testUnresolvedShowEstablishmentRecoversWithoutReward() {
    let resolveShow = null;
    const harness = loadWechatProvider({
        show() {
            return new Promise((resolve) => {
                resolveShow = resolve;
            });
        },
    });
    const results = [];
    harness.provider.show((outcome) => results.push(`${outcome.status}:${outcome.reason}`));
    await flushMicrotasks();

    assert.deepStrictEqual(harness.adCalls, ['1:load', '1:show']);
    assert.strictEqual(harness.activeTimers(10000).length, 1, 'an unresolved native show operation must have a bounded establishment timer');
    harness.fireTimer(10000);
    assert.deepStrictEqual(results, ['technical_error:show-establish-timeout']);
    assert.strictEqual(harness.adInstances[0].destroyed, true, 'establishment timeout must destroy the stuck native instance');

    resolveShow();
    await flushMicrotasks();
    assert.deepStrictEqual(results, ['technical_error:show-establish-timeout'], 'late show resolution after recovery must be stale');
}

async function testCloseBeforeShowPromiseResolutionStillGrantsOnce() {
    let resolveShow = null;
    const harness = loadWechatProvider({
        show() {
            return new Promise((resolve) => {
                resolveShow = resolve;
            });
        },
    });
    const results = [];
    harness.provider.show((outcome) => results.push(outcome.status));
    await flushMicrotasks();

    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(results, ['verified_complete'], 'native completed close must remain authoritative during establishment');
    resolveShow();
    await flushMicrotasks();
    assert.deepStrictEqual(results, ['verified_complete'], 'late show resolution must not duplicate the completed result');
}

async function testEarlyCloseStillFails() {
    const harness = loadWechatProvider();
    const results = [];
    harness.provider.show((outcome) => results.push(outcome.status));
    await flushMicrotasks();
    harness.triggerClose({ isEnded: false });
    assert.deepStrictEqual(results, ['verified_incomplete'], 'explicit early close must not grant a reward');
}

async function testForegroundOnlyMakesAttemptRecoverable() {
    const harness = loadWechatProvider();
    const events = [];
    harness.provider.show(
        (outcome) => events.push(`result:${outcome.status}`),
        { onRecoverable: (_attemptId, reason) => events.push(`recoverable:${reason}`) },
    );
    await flushMicrotasks();

    harness.provider.notifyGameResumed();
    harness.provider.notifyGameResumed();
    assert.deepStrictEqual(events, ['recoverable:foreground'], 'foreground may release UI once but must not settle reward');
    assert.strictEqual(harness.currentAd().destroyed, false, 'recoverable attempt must keep listening for a delayed close');
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(events, ['recoverable:foreground', 'result:verified_complete'], 'arbitrarily delayed verified close must still grant');
}

async function testMissingIsEndedBecomesUnknownAndCanRetry() {
    const harness = loadWechatProvider();
    const results = [];
    harness.provider.show((outcome) => results.push(`first:${outcome.status}`));
    await flushMicrotasks();
    const oldAd = harness.currentAd();
    harness.triggerClose({});
    assert.deepStrictEqual(results, ['first:unknown'], 'missing protocol proof must not be treated as success or failure');
    assert.strictEqual(oldAd.destroyed, true);

    harness.provider.show((outcome) => results.push(`second:${outcome.status}`));
    await flushMicrotasks();
    oldAd.forceStaleClose({ isEnded: true });
    assert.deepStrictEqual(results, ['first:unknown'], 'a destroyed old instance must not settle the retry');
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(results, ['first:unknown', 'second:verified_complete']);
}

async function testTwoIndependentCompletedAdsEachSucceed() {
    const harness = loadWechatProvider();
    const results = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        harness.provider.show((outcome) => results.push({ attempt, status: outcome.status }));
        await flushMicrotasks();
        harness.triggerClose({ isEnded: true });
        await flushMicrotasks();
    }
    assert.deepStrictEqual(results, [
        { attempt: 1, status: 'verified_complete' },
        { attempt: 2, status: 'verified_complete' },
    ], 'each completed ad attempt must settle its own reward successfully');
    assert.strictEqual(harness.adInstances.length, 2, 'settled attempts must never reuse a previous native instance');
}

async function testExplicitCancelDuringLoadSettlesOnce() {
    const harness = loadWechatProvider();
    const events = [];
    harness.provider.show(
        (outcome) => events.push(`result:${outcome.status}:${outcome.reason}`),
        { onClose: () => events.push('close') },
    );
    assert.strictEqual(harness.provider.cancelPending('scene-destroy'), true);
    await flushMicrotasks();

    assert.deepStrictEqual(events, ['result:unknown:cancelled:scene-destroy'], 'scene cancellation must report UNKNOWN, not an invented ad failure');
    assert.deepStrictEqual(harness.adCalls, ['1:destroy'], 'a cancelled pre-show attempt must be destroyed before it can show');
    assert.strictEqual(harness.provider.cancelPending('duplicate'), false, 'duplicate cancellation must be idempotent');
}

async function testStaleCloseCannotSettleNextLoadingRequest() {
    const harness = loadWechatProvider();
    const results = [];
    harness.provider.show((outcome) => results.push(`first:${outcome.status}`));
    const oldAd = harness.currentAd();
    harness.provider.cancelPending('scene-destroy');

    harness.provider.show((outcome) => results.push(`second:${outcome.status}`));
    oldAd.forceStaleClose({ isEnded: true });
    assert.deepStrictEqual(results, ['first:unknown'], 'an old close arriving while the next request loads must be ignored');

    await flushMicrotasks();
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(results, ['first:unknown', 'second:verified_complete'], 'the next request must settle only from its own shown-ad close');
}

async function testConcurrentShowDoesNotInvalidateActiveAttempt() {
    const harness = loadWechatProvider();
    const results = [];
    harness.provider.show((outcome) => results.push(`first:${outcome.status}`));
    await flushMicrotasks();
    harness.provider.show((outcome) => results.push(`second:${outcome.status}:${outcome.reason}`));
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(results, [
        'second:technical_error:attempt-already-active',
        'first:verified_complete',
    ], 'a rejected concurrent request must not change the active attempt identity');
}

async function testThrowingCallerCannotLeaveProviderBusy() {
    const harness = loadWechatProvider();
    harness.provider.show(() => {
        throw new Error('caller failed');
    });
    await flushMicrotasks();
    harness.triggerClose({ isEnded: true });

    const results = [];
    harness.provider.show((outcome) => results.push(outcome.status));
    await flushMicrotasks();
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(results, ['verified_complete'], 'provider cleanup must survive an exception thrown by the previous caller');
}

async function main() {
    await testCompletedAdHasNoCompletionWatchdog();
    await testUnresolvedShowEstablishmentRecoversWithoutReward();
    await testCloseBeforeShowPromiseResolutionStillGrantsOnce();
    await testEarlyCloseStillFails();
    await testForegroundOnlyMakesAttemptRecoverable();
    await testMissingIsEndedBecomesUnknownAndCanRetry();
    await testTwoIndependentCompletedAdsEachSucceed();
    await testExplicitCancelDuringLoadSettlesOnce();
    await testStaleCloseCannotSettleNextLoadingRequest();
    await testConcurrentShowDoesNotInvalidateActiveAttempt();
    await testThrowingCallerCannotLeaveProviderBusy();
    console.log('rewarded-ad-runtime.test.js passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
