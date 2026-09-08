const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function loadService() {
    const source = fs.readFileSync(path.join(root, 'assets/Scripts/Platform/WeChatShareReturnService.ts'), 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(output, {
        module,
        exports: module.exports,
        console,
        Date,
        setTimeout,
        clearTimeout,
    }, { filename: 'WeChatShareReturnService.ts' });
    return module.exports;
}

function createTimerApi() {
    const timers = [];
    return {
        timers,
        setTimeout(callback, delay) {
            const timer = { callback, delay, cleared: false };
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cleared = true;
        },
    };
}

function createRuntime(events) {
    const listeners = [];
    return {
        listeners,
        shareAppMessage(payload) {
            events.push(['share', payload]);
        },
        onShow(listener) {
            events.push(['onShow']);
            listeners.push(listener);
        },
        offShow(listener) {
            events.push(['offShow']);
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
        },
        triggerShow() {
            for (const listener of listeners.slice()) listener();
        },
    };
}

function begin(service, runtime, results) {
    return service.start({
        runtime,
        payload: { title: 'test', query: 'level=4' },
        onComplete: (result) => results.push(result),
    });
}

function testStrictElapsedGate() {
    const { WeChatShareReturnService, WECHAT_SHARE_IMAGE_POOL } = loadService();
    for (const [elapsedMs, expected] of [[1499, 'too_short'], [1500, 'too_short'], [1501, 'qualified']]) {
        const clock = { now: 0 };
        const timerApi = createTimerApi();
        const events = [];
        const runtime = createRuntime(events);
        const results = [];
        const service = new WeChatShareReturnService({
            now: () => clock.now,
            setTimeout: timerApi.setTimeout,
            clearTimeout: timerApi.clearTimeout,
            random: () => 0,
        });
        const started = begin(service, runtime, results);
        assert.strictEqual(started.started, true);
        assert.deepStrictEqual(events.slice(0, 2).map((event) => event[0]), ['onShow', 'share']);
        assert.strictEqual(events[1][1].title, 'test');
        assert.strictEqual(events[1][1].query, 'level=4');
        assert.strictEqual(events[1][1].imageUrl, WECHAT_SHARE_IMAGE_POOL[0].imageUrl);
        assert.strictEqual(events[1][1].imageUrlId, WECHAT_SHARE_IMAGE_POOL[0].imageUrlId);
        assert.strictEqual(results.length, 0, 'must not complete before wx.onShow');
        clock.now = elapsedMs;
        runtime.triggerShow();
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].status, expected, `elapsed=${elapsedMs}`);
        assert.strictEqual(results[0].elapsedMs, elapsedMs);
        assert.strictEqual(runtime.listeners.length, 0, 'wx.offShow must remove the listener');
        assert.strictEqual(timerApi.timers[0].cleared, true, 'completion must cancel its timeout');
    }
}

function testLocalImagePoolAndUniformPicker() {
    const {
        WECHAT_SHARE_IMAGE_POOL,
        pickWeChatShareImage,
        applyLocalWeChatShareImage,
    } = loadService();
    const expectedPairs = [
        'https://mmocgame.qpic.cn/wechatgame/QljrpgIYibCsRIebaicr4ibE7iamMMmq5L7oPFgK0KJJAfDthibGUr3a8EOIa5gQ5JHX6/0|vovDzpuaRYOAEvt6YSApSQ==',
        'https://mmocgame.qpic.cn/wechatgame/QljrpgIYibCtLiarKOPGnUibvRmPtdIfJMVy0K6ej597zUlmHSia06OYEv8Oy6BEKyrd/0|VQAihD6+SnSbV6X4Q5FVXw==',
        'https://mmocgame.qpic.cn/wechatgame/QljrpgIYibCvpB0wueLsrAPnj4ZYMCf2oYJeXEQcMEs4V8k4Afk5BiaGftHZvRzDXK/0|BuDsvtluTWC77Yqc+vT0JA==',
        'https://mmocgame.qpic.cn/wechatgame/QljrpgIYibCsBP3Kym6YIZMhVm1nic2RkALzTiaXDuVMTib59ZvbLvpdsy2TxzicvLAF3/0|gdEeipd5REakrW2eDJRIMA==',
        'https://mmocgame.qpic.cn/wechatgame/QljrpgIYibCtia6XicAvZmVXHovOgtrgVCJ8FEahFgicGJ9TUCuicZzAGZXzicHkE5jAJV/0|/+Loyr7uTT6rQPHuNxvqBA==',
        'https://mmocgame.qpic.cn/wechatgame/QljrpgIYibCsiaBgRBNpqaVpiaXAYRkUp4DBStIyXWzFbV3u6V1E4SmVuuTGujDq2HE/0|QSLQ93GWTkKq+40i1QrNNA==',
    ];
    assert.deepStrictEqual(
        Array.from(WECHAT_SHARE_IMAGE_POOL, (item) => `${item.imageUrl}|${item.imageUrlId}`),
        expectedPairs,
        'the local pool must preserve every approved URL/ID pair exactly',
    );
    for (let index = 0; index < expectedPairs.length; index += 1) {
        const selected = pickWeChatShareImage(() => (index + 0.5) / expectedPairs.length);
        assert.strictEqual(`${selected.imageUrl}|${selected.imageUrlId}`, expectedPairs[index]);
    }
    assert.throws(() => pickWeChatShareImage(() => 1), /invalid random sample/);

    const payload = applyLocalWeChatShareImage({ title: '场景标题', query: 'level=8' }, () => 0.5);
    assert.strictEqual(payload.title, '场景标题');
    assert.strictEqual(payload.query, 'level=8');
    assert.strictEqual(`${payload.imageUrl}|${payload.imageUrlId}`, expectedPairs[3]);
}

function testLocalPassiveShareOwnsOneMenuListener() {
    const { installLocalWeChatPassiveShare, WECHAT_SHARE_IMAGE_POOL } = loadService();
    const listeners = [];
    const shown = [];
    const runtime = {
        onShareAppMessage(listener) {
            listeners.push(listener);
        },
        offShareAppMessage(listener) {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
        },
        showShareMenu(options) {
            shown.push(options);
        },
    };
    assert.strictEqual(installLocalWeChatPassiveShare(runtime), true);
    assert.strictEqual(installLocalWeChatPassiveShare(runtime), true);
    assert.strictEqual(listeners.length, 1, 'repeated startup must not register duplicate menu listeners');
    assert.strictEqual(JSON.stringify(shown), JSON.stringify([{ menus: ['shareAppMessage'] }]));
    const payload = listeners[0]();
    assert.strictEqual(payload.title, '轻松拼豆');
    assert.ok(
        WECHAT_SHARE_IMAGE_POOL.some((item) => item.imageUrl === payload.imageUrl && item.imageUrlId === payload.imageUrlId),
        'passive menu payload must use one complete local pool pair',
    );
}

function testTimeoutCancelAndStaleListenerIsolation() {
    const { WeChatShareReturnService } = loadService();
    const clock = { now: 0 };
    const timerApi = createTimerApi();
    const service = new WeChatShareReturnService({
        now: () => clock.now,
        setTimeout: timerApi.setTimeout,
        clearTimeout: timerApi.clearTimeout,
    });
    const firstEvents = [];
    const firstRuntime = createRuntime(firstEvents);
    const firstResults = [];
    const first = begin(service, firstRuntime, firstResults);
    assert.strictEqual(first.started, true);
    const staleListener = firstRuntime.listeners[0];
    first.handle.cancel('scene-destroy:Game');
    assert.deepStrictEqual(firstResults.map((result) => result.status), ['cancelled']);

    const secondEvents = [];
    const secondRuntime = createRuntime(secondEvents);
    const secondResults = [];
    const second = begin(service, secondRuntime, secondResults);
    assert.strictEqual(second.started, true, 'a cancelled request must release the global slot');
    staleListener();
    assert.strictEqual(secondResults.length, 0, 'an old listener must not settle a new request');

    const timeout = timerApi.timers.find((timer) => timer.delay === 30000 && !timer.cleared);
    assert.ok(timeout, 'a pending share must own a timeout');
    clock.now = 30000;
    timeout.callback();
    assert.deepStrictEqual(secondResults.map((result) => result.status), ['timeout']);
}

function testStartFailuresAndCleanupFailure() {
    const { WeChatShareReturnService } = loadService();
    const clock = { now: 0 };
    const timerApi = createTimerApi();
    const service = new WeChatShareReturnService({
        now: () => clock.now,
        setTimeout: timerApi.setTimeout,
        clearTimeout: timerApi.clearTimeout,
    });

    const brokenRuntime = createRuntime([]);
    brokenRuntime.shareAppMessage = () => { throw new Error('dispatch'); };
    const failed = begin(service, brokenRuntime, []);
    assert.strictEqual(failed.started, false);
    assert.strictEqual(failed.reason, 'dispatch_failed');
    assert.strictEqual(brokenRuntime.listeners.length, 0, 'dispatch failure must remove wx.onShow');

    const firstRuntime = createRuntime([]);
    const first = begin(service, firstRuntime, []);
    assert.strictEqual(first.started, true);
    const busy = begin(service, createRuntime([]), []);
    assert.strictEqual(busy.started, false);
    assert.strictEqual(busy.reason, 'busy');
    first.handle.cancel();

    const cleanupRuntime = createRuntime([]);
    cleanupRuntime.offShow = () => { throw new Error('offShow'); };
    const cleanupResults = [];
    const cleanup = begin(service, cleanupRuntime, cleanupResults);
    assert.strictEqual(cleanup.started, true);
    clock.now = 1501;
    cleanupRuntime.triggerShow();
    assert.deepStrictEqual(cleanupResults.map((result) => result.status), ['cleanup_failed']);
}

testLocalImagePoolAndUniformPicker();
testLocalPassiveShareOwnsOneMenuListener();
testStrictElapsedGate();
testTimeoutCancelAndStaleListenerIsolation();
testStartFailuresAndCleanupFailure();
console.log('wechat-share-return-service.test.js passed');
