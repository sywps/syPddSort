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

function loadWechatProvider() {
    const timers = [];
    const onCloseCallbacks = [];
    const onErrorCallbacks = [];
    const adCalls = [];
    const ad = {
        onClose(callback) {
            onCloseCallbacks.push(callback);
        },
        onError(callback) {
            onErrorCallbacks.push(callback);
        },
        load() {
            adCalls.push('load');
            return Promise.resolve();
        },
        show() {
            adCalls.push('show');
            return Promise.resolve();
        },
    };
    const wxRuntime = {
        createRewardedVideoAd() {
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
        activeTimers(delay) {
            return timers.filter((timer) => !timer.cleared && !timer.fired && timer.delay === delay);
        },
        fireTimers(delay) {
            const pending = this.activeTimers(delay);
            assert.ok(pending.length > 0, `expected an active ${delay}ms timer`);
            for (const timer of pending) {
                timer.fired = true;
                timer.callback();
            }
        },
        triggerClose(result) {
            assert.ok(onCloseCallbacks.length > 0, 'provider must register onClose');
            for (const callback of onCloseCallbacks) callback(result);
        },
        triggerError(error) {
            assert.ok(onErrorCallbacks.length > 0, 'provider must register onError');
            for (const callback of onErrorCallbacks) callback(error);
        },
    };
}

async function flushMicrotasks(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) {
        await Promise.resolve();
    }
}

async function testCompletedAdUsesOneMinuteWatchdog() {
    const harness = loadWechatProvider();
    const events = [];
    harness.provider.show(
        (success) => events.push(`result:${success}`),
        {
            onShow: () => events.push('show'),
            onClose: () => events.push('close'),
        },
    );
    await flushMicrotasks();

    assert.deepStrictEqual(harness.adCalls, ['load', 'show']);
    assert.deepStrictEqual(events, ['show'], 'reward must wait for the native close callback');
    assert.strictEqual(harness.activeTimers(60000).length, 1, 'WeChat ads must retain a bounded one-minute close watchdog');

    harness.triggerClose({ isEnded: true });
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(events, ['show', 'close', 'result:true'], 'completed native close must settle exactly once');
    assert.strictEqual(harness.activeTimers(60000).length, 0, 'native close must clear the watchdog');
}

async function testEarlyCloseStillFails() {
    const harness = loadWechatProvider();
    const results = [];
    harness.provider.show((success) => results.push(success));
    await flushMicrotasks();
    harness.triggerClose({ isEnded: false });
    assert.deepStrictEqual(results, [false], 'explicit early close must not grant a reward');
}

async function testMissingCloseFailsClosedAfterOneMinute() {
    const harness = loadWechatProvider();
    const results = [];
    harness.provider.show((success) => results.push(success));
    await flushMicrotasks();

    harness.fireTimers(60000);
    assert.deepStrictEqual(results, [false], 'missing native close must fail closed after one minute');
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(results, [false], 'a late close must not change the timed-out result');
}

async function testForegroundRecoveryFailsClosedAndIgnoresLateClose() {
    const harness = loadWechatProvider();
    const events = [];
    harness.provider.show(
        (success) => events.push(`result:${success}`),
        {
            onShow: () => events.push('show'),
            onClose: () => events.push('close'),
        },
    );
    await flushMicrotasks();

    harness.provider.notifyGameResumed();
    assert.strictEqual(harness.activeTimers(1500).length, 1, 'foreground recovery must use a short grace window');
    harness.fireTimers(1500);
    assert.deepStrictEqual(events, ['show', 'close', 'result:false'], 'missing close after foreground must fail closed and release the caller');
    assert.strictEqual(harness.activeTimers(60000).length, 0, 'foreground recovery must clear the long watchdog');

    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(events, ['show', 'close', 'result:false'], 'late native close must not grant after recovery');
}

async function testExplicitCancelDuringLoadSettlesOnce() {
    const harness = loadWechatProvider();
    const events = [];
    harness.provider.show(
        (success) => events.push(`result:${success}`),
        { onClose: () => events.push('close') },
    );
    assert.strictEqual(harness.provider.cancelPending('scene-destroy'), true);
    await flushMicrotasks();

    assert.deepStrictEqual(events, ['close', 'result:false'], 'scene cancellation must settle an in-flight load exactly once');
    assert.deepStrictEqual(harness.adCalls, ['load'], 'a cancelled load must never continue into ad.show');
    assert.strictEqual(harness.provider.cancelPending('duplicate'), false, 'duplicate cancellation must be idempotent');
}

async function testStaleCloseCannotSettleNextLoadingRequest() {
    const harness = loadWechatProvider();
    const results = [];
    harness.provider.show((success) => results.push(`first:${success}`));
    harness.provider.cancelPending('foreground-close-missing');

    harness.provider.show((success) => results.push(`second:${success}`));
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(results, ['first:false'], 'an old close arriving while the next request loads must be ignored');

    await flushMicrotasks();
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(results, ['first:false', 'second:true'], 'the next request must settle only from its own shown-ad close');
}

async function testThrowingCallerCannotLeaveProviderBusy() {
    const harness = loadWechatProvider();
    harness.provider.show(() => {
        throw new Error('caller failed');
    });
    await flushMicrotasks();
    harness.triggerClose({ isEnded: true });

    const results = [];
    harness.provider.show((success) => results.push(success));
    await flushMicrotasks();
    harness.triggerClose({ isEnded: true });
    assert.deepStrictEqual(results, [true], 'provider cleanup must survive an exception thrown by the previous caller');
}

async function main() {
    await testCompletedAdUsesOneMinuteWatchdog();
    await testEarlyCloseStillFails();
    await testMissingCloseFailsClosedAfterOneMinute();
    await testForegroundRecoveryFailsClosedAndIgnoresLateClose();
    await testExplicitCancelDuringLoadSettlesOnce();
    await testStaleCloseCannotSettleNextLoadingRequest();
    await testThrowingCallerCannotLeaveProviderBusy();
    console.log('rewarded-ad-runtime.test.js passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
