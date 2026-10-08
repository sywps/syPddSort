const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const draws = [];
let voiceHomeShown = 0;
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/GameSceneRuntimeController.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsObject, console: { error() {} }, require: id => id === 'cc'
    ? { Director: { EVENT_AFTER_DRAW: 'draw' }, director: { once: (_, fn) => draws.push(fn) } }
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
    await Promise.resolve();
    assert.equal(signals.length, 0);
    // A restore replaces the first pending chapter.
    let resolveNew;
    runtime._homeChapterReady = new Promise(resolve => { resolveNew = resolve; });
    resolveBatch(new Error('superseded'));
    await Promise.resolve();
    assert.equal(signals.length, 0);
    resolveNew(null); await task;
    assert.equal(signals.length, 1); assert.equal(signals[0][1], null);
    assert.equal(hidden, 0, 'startup cover remains until draw');
    draws.shift()(); assert.equal(hidden, 1);
    scheduled.shift()(); assert.equal(revealed, 0, 'wait until transition finishes');
    assert.equal(voiceHomeShown, 0, 'voice idle timer must wait for the transition too');
    covered = false; scheduled.shift()(); assert.equal(revealed, 1);
    assert.equal(voiceHomeShown, 1, 'start voice timer only after homepage is visible');
    runtime._homeChapterReady = Promise.resolve(new Error('failed'));
    await controller.finishHomePresentation(app);
    assert.equal(errors.length, 1); assert.equal(signals[1][1].message, 'failed');
    draws.shift()(); scheduled.shift()(); assert.equal(revealed, 1, 'failure never plays completion');
    assert.equal(voiceHomeShown, 1, 'failed home load must not start a reminder');
    runtime.node.isValid = false;
    await controller.finishHomePresentation(app);
    assert.equal(signals.length, 2, 'destroyed scene never completes a later transition');
    console.log('home presentation readiness passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
