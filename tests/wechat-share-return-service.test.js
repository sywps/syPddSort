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
    const { WeChatShareReturnService, WECHAT_SHARE_TITLE_POOL, WECHAT_SHARE_IMAGE_POOL } = loadService();
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
        assert.strictEqual(events[1][1].title, WECHAT_SHARE_TITLE_POOL[0]);
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

function testLocalMaterialPoolsAndIndependentPickers() {
    const {
        WECHAT_SHARE_TITLE_POOL,
        WECHAT_SHARE_IMAGE_POOL,
        pickWeChatShareTitle,
        pickWeChatShareImage,
        applyLocalWeChatShareMaterial,
    } = loadService();
    const expectedTitles = [
        '对不起，今天满脑子都是豆豆',
        '别光看我玩呀，你也来两把？',
        '这把不算，再来两把！',
        '说好只玩两把，怎么天都黑了',
        '不回消息的时候，我可能在忙豆豆',
        '手说不玩了，脑子说再来两把',
    ];
    const expectedPairs = [
        'https://mmocgame.qpic.cn/wechatgame/wELKBxWdz8CtmibGyBj2CJk0l3gwsnWl1NUuTK3XdAwA57IrzejXB3yhzcibqEFTeT/0|NuDqI6jVSoGSXTZzRYHbrg==',
        'https://mmocgame.qpic.cn/wechatgame/mWbPTdBTvtuHGNq9k9xibdM0X5kdCX2MOp873uiaUhJKWTHoia5yedib2sdBLDDhibCAc/0|V3SpXulmSgeGKnSZbMUX3w==',
        'https://mmocgame.qpic.cn/wechatgame/wxDBm0PIt6IjW4So7BNEpC1xoBONIXRd0JelsHscuVNxmt7r4d8BtEpBDdoBBp1y/0|MjinQT5XRCKzFJCiQFDKYA==',
        'https://mmocgame.qpic.cn/wechatgame/ulot0Xibmy1DeMia3hGZSuWXiczibZkrHibGDicdqm2JPM8TvvV44ZVlicpDL2utxnDNIdf/0|3lARMWJKQEuOE+qhOzv/9Q==',
        'https://mmocgame.qpic.cn/wechatgame/CRCCaFDqI0VlxpcGUm8bKYiaiaasRX3lL4q4IgNnwLh7xOvJ1Ff2aegE12bRtOvv4Y/0|TbOmJ43yQb6ner1wR0TrFw==',
    ];
    assert.deepStrictEqual(Array.from(WECHAT_SHARE_TITLE_POOL), expectedTitles);
    assert.deepStrictEqual(
        Array.from(WECHAT_SHARE_IMAGE_POOL, (item) => `${item.imageUrl}|${item.imageUrlId}`),
        expectedPairs,
        'the local pool must preserve every approved URL/ID pair exactly',
    );
    for (let index = 0; index < expectedTitles.length; index += 1) {
        assert.strictEqual(
            pickWeChatShareTitle(() => (index + 0.5) / expectedTitles.length),
            expectedTitles[index],
        );
    }
    for (let index = 0; index < expectedPairs.length; index += 1) {
        const selected = pickWeChatShareImage(() => (index + 0.5) / expectedPairs.length);
        assert.strictEqual(`${selected.imageUrl}|${selected.imageUrlId}`, expectedPairs[index]);
    }
    assert.throws(() => pickWeChatShareTitle(() => 1), /invalid random sample/);
    assert.throws(() => pickWeChatShareImage(() => 1), /invalid random sample/);

    const samples = [0.7, 0.1];
    let sampleIndex = 0;
    const payload = applyLocalWeChatShareMaterial(
        { title: '场景标题', query: 'level=8' },
        () => samples[sampleIndex++],
    );
    assert.strictEqual(sampleIndex, 2, 'title and image must consume separate random samples');
    assert.strictEqual(payload.title, expectedTitles[4]);
    assert.strictEqual(payload.query, 'level=8');
    assert.strictEqual(`${payload.imageUrl}|${payload.imageUrlId}`, expectedPairs[0]);
}

function testLocalPassiveShareOwnsOneMenuListener() {
    const { installLocalWeChatPassiveShare, WECHAT_SHARE_TITLE_POOL, WECHAT_SHARE_IMAGE_POOL } = loadService();
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
    assert.ok(WECHAT_SHARE_TITLE_POOL.includes(payload.title));
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

testLocalMaterialPoolsAndIndependentPickers();
testLocalPassiveShareOwnsOneMenuListener();
testStrictElapsedGate();
testTimeoutCancelAndStaleListenerIsolation();
testStartFailuresAndCleanupFailure();
console.log('wechat-share-return-service.test.js passed');
