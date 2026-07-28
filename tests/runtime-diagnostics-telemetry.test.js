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
            experimentalDecorators: true,
        },
    }).outputText;
}

function createHarness() {
    const storage = new Map();
    const lifecycleHandlers = new Map();
    const runtimeHandlers = {};
    const cloudCalls = [];
    const timers = [];
    let rewardedAdLoadListener = null;
    storage.set('pdd.analytics.runtime_checkpoint.v1', JSON.stringify({
        sessionId: 'previous-session',
        checkpoint: 'level_begin',
        timestamp: Date.now() - 1000,
        active: true,
        page: 'level_game',
        levelId: 2,
        clientBuildId: 'previous-build',
    }));

    const platformCloud = {
        canUseCloud: () => true,
        isDevtools: () => false,
        getSystemInfo: () => ({ device: 'phone', system: 'wechat' }),
        getLaunchChannel: () => '1095',
        callFunction(name, data) {
            cloudCalls.push({ name, data });
            if (name === 'addFunnelEvents') {
                return new Promise(() => {});
            }
            if (name === 'getOpenid') {
                return Promise.resolve({ ok: true, openid: 'test-openid' });
            }
            return Promise.resolve({ ok: true });
        },
    };
    const wxRuntime = {
        onError(listener) {
            runtimeHandlers.error = listener;
        },
        onUnhandledRejection(listener) {
            runtimeHandlers.rejection = listener;
        },
        onMemoryWarning(listener) {
            runtimeHandlers.memory = listener;
        },
    };
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === 'cc') {
                return {
                    _decorator: {
                        ccclass: () => (target) => target,
                    },
                    Game: {
                        EVENT_HIDE: 'hide',
                        EVENT_SHOW: 'show',
                    },
                    game: {
                        on(eventName, listener, target) {
                            lifecycleHandlers.set(eventName, () => listener.call(target));
                        },
                    },
                    sys: {
                        localStorage: {
                            getItem(key) {
                                return storage.has(key) ? storage.get(key) : null;
                            },
                            setItem(key, value) {
                                storage.set(key, String(value));
                            },
                        },
                    },
                };
            }
            if (id === './PlatformCloudMgr') {
                return { PlatformCloudMgr: { inst: platformCloud } };
            }
            if (id === './MiniGamePlatform') {
                return { getWeChatMiniGameRuntime: () => wxRuntime };
            }
            if (id === './RuntimeLog') {
                return { runtimeLog() {} };
            }
            if (id === '../Platform/RewardedAdProvider') {
                return {
                    subscribeRewardedAdLoadEvents(listener) {
                        rewardedAdLoadListener = listener;
                        return () => {
                            rewardedAdLoadListener = null;
                        };
                    },
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
            const timer = { callback, delay, cleared: false };
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cleared = true;
        },
    };
    vm.runInNewContext(transpile('assets/Scripts/Core/AnalyticsMgr.ts'), sandbox, {
        filename: 'AnalyticsMgr.ts',
    });
    const manager = module.exports.AnalyticsMgr.inst;
    return {
        manager,
        storage,
        lifecycleHandlers,
        runtimeHandlers,
        cloudCalls,
        emitRewardedAdLoad(event) {
            assert.strictEqual(typeof rewardedAdLoadListener, 'function');
            rewardedAdLoadListener(event);
        },
        allFunnelEvents() {
            const uploaded = cloudCalls
                .filter((call) => call.name === 'addFunnelEvents')
                .flatMap((call) => call.data.events);
            return uploaded.concat(manager.funnelQueue);
        },
    };
}

const harness = createHarness();
const initialEvents = harness.allFunnelEvents();
const unclean = initialEvents.find((event) => event.eventName === 'previous_session_unclean_exit');
assert.ok(unclean, 'an active checkpoint from the previous session must be recovered');
assert.strictEqual(unclean.extra.checkpoint, 'level_begin');
assert.strictEqual(unclean.extra.previousClientBuildId, 'previous-build');
assert.strictEqual(typeof harness.runtimeHandlers.error, 'function');
assert.strictEqual(typeof harness.runtimeHandlers.rejection, 'function');
assert.strictEqual(typeof harness.runtimeHandlers.memory, 'function');
assert.strictEqual(typeof harness.lifecycleHandlers.get('hide'), 'function');

harness.manager.beginLevel(2, 'level_game');
harness.runtimeHandlers.error({
    message: 'Boom https://secret.example/path ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
    stack: 'sensitive stack must never be uploaded',
});
harness.runtimeHandlers.error({
    message: 'Boom https://secret.example/path ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
});
harness.runtimeHandlers.rejection({
    reason: {
        message: 'Promise failed safely',
        code: 'E_PROMISE',
        stack: 'another sensitive stack',
    },
});
harness.runtimeHandlers.memory({ level: 15 });

harness.emitRewardedAdLoad({
    stage: 'start',
    platform: 'wechat',
    loadId: 7,
    requestId: 3,
    generation: 2,
    reason: 'show',
    durationMs: 0,
    errorCode: '',
});
harness.emitRewardedAdLoad({
    stage: 'success',
    platform: 'wechat',
    loadId: 7,
    requestId: 3,
    generation: 2,
    reason: 'show',
    durationMs: 321,
    errorCode: '',
});

const events = harness.allFunnelEvents();
const runtimeErrors = events.filter((event) => event.eventName === 'runtime_error');
assert.strictEqual(runtimeErrors.length, 1, 'identical runtime errors must be deduplicated');
assert.ok(!runtimeErrors[0].errorMessage.includes('https://'));
assert.ok(!runtimeErrors[0].errorMessage.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'));
assert.ok(!runtimeErrors[0].errorMessage.includes('sensitive stack'));
assert.strictEqual(runtimeErrors[0].extra.checkpoint, 'level_begin');
assert.strictEqual(runtimeErrors[0].levelId, 2);

const rejection = events.find((event) => event.eventName === 'runtime_unhandled_rejection');
assert.ok(rejection);
assert.strictEqual(rejection.errorCode, 'E_PROMISE');
assert.ok(!rejection.errorMessage.includes('stack'));

const memory = events.find((event) => event.eventName === 'runtime_memory_warning');
assert.ok(memory);
assert.strictEqual(memory.extra.memoryWarningLevel, 15);

const loadStart = events.find((event) => event.eventName === 'rewarded_ad_load_start');
const loadSuccess = events.find((event) => event.eventName === 'rewarded_ad_load_success');
assert.ok(loadStart);
assert.ok(loadSuccess);
assert.strictEqual(loadStart.extra.loadId, 7);
assert.strictEqual(loadSuccess.duration, 321);
assert.strictEqual(loadSuccess.extra.durationMs, 321);
assert.strictEqual(loadSuccess.source, 'rewarded_ad_native_load');

harness.lifecycleHandlers.get('hide')();
const checkpoint = JSON.parse(harness.storage.get('pdd.analytics.runtime_checkpoint.v1'));
assert.strictEqual(checkpoint.active, false, 'a normal app hide must close the foreground checkpoint');
assert.strictEqual(checkpoint.checkpoint, 'app_hide');
assert.strictEqual(checkpoint.levelId, 2);

console.log('runtime-diagnostics-telemetry.test.js passed');
