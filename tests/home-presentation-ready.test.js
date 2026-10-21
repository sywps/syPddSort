const recoveryPlatform = require('./helpers/recovery-platform');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const draws = [];
let voiceHomeShown = 0;
let isWeChat = false;
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/GameSceneRuntimeController.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsObject,
    console: { error() {} }, require: id => id === 'cc'
    ? { Director: { EVENT_AFTER_DRAW: 'draw' }, director: { once: (_, fn) => draws.push(fn) } }
    : id === './MiniGamePlatform' ? { isMiniGameRuntime: () => isWeChat && recoveryPlatform.isMiniGameRuntime() }
    : id === './GameplayVoiceController'
        ? { ensureGameplayVoiceController: () => ({ homeShown: () => voiceHomeShown++ }) } : {} });
async function run() {
    const scheduled = [], errors = [], signals = [];
    let resolveBatch, covered = true, hidden = 0, revealed = 0;
    const runtime = { node: { isValid: true }, _homeChapterEntryPending: true,
        _homeChapterReady: new Promise(resolve => { resolveBatch = resolve; }),
        scheduleOnce: fn => scheduled.push(fn), _revealHomeChapter: () => revealed++,
        showRemoteLoadFatalError: (...args) => errors.push(args) };
    const controller = new exportsObject.GameSceneRuntimeController(runtime);
    controller.observeStartupPlayable = () => {};
    const app = { startupLoading: { hide: () => hidden++ },
        completeAppTransitionAfterDraw: (...args) => signals.push(args), isAppTransitionTargeting: () => covered };
    const task = controller.finishHomePresentation(app);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signals.length, 0);
    // A restore replaces the first pending chapter.
    let resolveNew;
    runtime._homeChapterReady = new Promise(resolve => { resolveNew = resolve; });
    resolveBatch(new Error('superseded'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signals.length, 0);
    draws.shift()(); await new Promise(resolve => setImmediate(resolve));
    resolveNew(null); await new Promise(resolve => setImmediate(resolve));
    assert.equal(hidden, 0, 'startup cover remains until draw');
    draws.shift()(); await task;
    assert.equal(signals.length, 1); assert.equal(signals[0][1], null);
    assert.equal(hidden, 1);
    scheduled.shift()(); assert.equal(revealed, 0, 'wait until transition finishes');
    assert.equal(voiceHomeShown, 0, 'voice idle timer must wait for the transition too');
    covered = false; scheduled.shift()(); assert.equal(revealed, 1);
    assert.equal(voiceHomeShown, 1, 'start voice timer only after homepage is visible');
    runtime._homeChapterReady = Promise.resolve(new Error('failed'));
    const failed = controller.finishHomePresentation(app);
    await new Promise(resolve => setImmediate(resolve)); draws.shift()(); await failed;
    assert.equal(errors.length, 1); assert.equal(signals[1][1].message, 'failed');
    scheduled.shift()(); assert.equal(revealed, 1, 'failure never plays completion');
    assert.equal(voiceHomeShown, 1, 'failed home load must not start a reminder');
    runtime.node.isValid = false;
    await controller.finishHomePresentation(app);
    assert.equal(signals.length, 2, 'destroyed scene never completes a later transition');

    // Cold start: cached local artwork finishes before cloud restore returns.
    runtime.node.isValid = true;
    runtime._homeChapterReady = Promise.resolve(null);
    runtime._startupCloudRestorePromise = new Promise(() => {});
    const local = controller.finishHomePresentation(app);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(draws.length, 1, 'local artwork can draw while cloud restore is pending');
    assert.equal(signals.length, 2);
    draws.shift()(); await local;
    assert.equal(signals.length, 3, 'cloud restore must not block the cover');
    scheduled.shift()();
    const cold = controller.finishHomePresentation(app);
    await new Promise(resolve => setImmediate(resolve));
    // Another replacement after readiness but before the actual draw.
    let newest;
    runtime._homeChapterReady = new Promise(resolve => { newest = resolve; });
    draws.shift()(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(signals.length, 3, 'stale draw cannot release the transition');
    newest(null); await new Promise(resolve => setImmediate(resolve)); draws.shift()(); await cold;
    assert.equal(signals.length, 4);
    assert.equal(hidden, 4);
    scheduled.shift()();
    isWeChat = true;
    let finishLoading;
    app.startupLoading.node = { active: true };
    app.startupLoading.finishAfterDraw = callback => { finishLoading = callback; };
    const wechat = controller.finishHomePresentation(app);
    await new Promise(resolve => setImmediate(resolve)); draws.shift()(); await wechat;
    assert.equal(hidden, 4, 'successful WeChat startup does not bypass progress completion');
    assert.equal(typeof finishLoading, 'function');
    const beforeReveal = revealed;
    scheduled.shift()();
    assert.equal(revealed, beforeReveal, 'Home reveal waits for animated loading cover');
    app.startupLoading.node.active = false;
    finishLoading(); scheduled.shift()();
    assert.equal(revealed, beforeReveal + 1);
    console.log('home presentation readiness passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
