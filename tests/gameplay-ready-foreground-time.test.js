const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function method(file, name) {
    const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core', file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    let found;
    function visit(node) {
        if (ts.isMethodDeclaration(node) && node.name?.getText(ast) === name) found = node.getText(ast);
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(found, name);
    return found;
}
const source = 'const methods = {' + [
    method('GameCtrlModules/GameplayShareLoadingModule.ts', 'hideLoadingOverlayAfterGameplayReady'),
    method('GameCtrlModules/AssetBootstrapModule.ts', 'handleGameHideFlushUserState'),
    method('GameCtrlModules/AssetBootstrapModule.ts', 'handleGameShowLifecycle'),
].join(',') + '};';
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

function harness(foreground = true) {
    let now = 1000, timer, ready = false, afterDraw, hidden = 0;
    const failures = [];
    const app = { session: { weChatEntryVigorCharged: true }, completeAppTransitionAfterDraw() {} };
    const globals = {
        Date: { now: () => now }, isMiniGameRuntime: () => true,
        setTimeout: callback => { timer = callback; return 1; }, clearTimeout() { timer = null; },
        AnalyticsMgr: { inst: { flushFunnelEvents() {} } },
        UserStateSyncMgr: { inst: { flushPendingSave: async () => {} } },
        AppRoot: { tryGet: () => app }, reportWeChatEntry() {},
        director: { once: (_event, callback) => { afterDraw = callback; } }, Director: { EVENT_AFTER_DRAW: 'draw' },
    };
    const methods = new Function(...Object.keys(globals), code + '\nreturn methods;')(...Object.values(globals));
    const runtime = Object.assign({
        isValid: true, _gameForeground: foreground, _gameplayInitSeq: 1, _weChatPreparationId: 'original-level',
        _pchConveyorGameplayController: { isStartupInteractionReady: () => ready },
        recoverWeChatFailedEntry(code) { failures.push(code); this._weChatEntryRecoveryPending = true; },
        clearLoadingStageTimers() {}, hideLoadingOverlay() { hidden++; },
    }, methods);
    return {
        runtime, failures, app, start: () => runtime.hideLoadingOverlayAfterGameplayReady(),
        advance(ms) { now += ms; }, hide: () => runtime.handleGameHideFlushUserState(),
        show: () => runtime.handleGameShowLifecycle(),
        poll(ms = 0) { now += ms; const callback = timer; timer = null; assert.ok(callback); callback(); },
        ready() { ready = true; }, draw() { assert.ok(afterDraw); afterDraw(); }, hidden: () => hidden,
    };
}

test('suspended background time is excluded while previous foreground time is preserved', () => {
    const h = harness(); h.start(); h.advance(3000); h.hide();
    h.advance(60000); h.show(); h.poll();
    assert.deepEqual(h.failures, []);
    assert.equal(h.runtime._weChatInteractionWait.elapsed, 3000);
    h.poll(11999); assert.deepEqual(h.failures, []);
    h.poll(1); assert.deepEqual(h.failures, ['gameplay_interaction_not_ready']);
});

test('repeated lifecycle events and multiple background trips never reset or double count the budget', () => {
    const h = harness(); h.start(); h.advance(3000); h.hide();
    h.advance(10000); h.hide(); h.poll(10000); h.show();
    h.advance(2000); h.show(); h.poll();
    assert.equal(h.runtime._weChatInteractionWait.elapsed, 5000);
    h.advance(1000); h.hide(); h.advance(30000); h.show(); h.poll();
    assert.equal(h.runtime._weChatInteractionWait.elapsed, 6000);
    h.poll(8999); assert.deepEqual(h.failures, []);
    h.poll(1); assert.equal(h.failures.length, 1);
});

test('a readiness wait created in background starts counting only after show', () => {
    const h = harness(false); h.start(); h.advance(60000); h.show(); h.poll();
    assert.equal(h.runtime._weChatInteractionWait.elapsed, 0);
    assert.deepEqual(h.failures, []);
    h.poll(15000); assert.equal(h.failures.length, 1);
});

test('a foreground timeout reached at hide is acted on after returning to foreground', () => {
    const h = harness(); h.start(); h.advance(15000); h.hide(); h.poll(60000);
    assert.deepEqual(h.failures, []);
    h.show(); h.poll(); assert.equal(h.failures.length, 1);
});

test('after returning, actual input readiness still completes entry after a rendered frame', () => {
    const h = harness(); h.start(); h.advance(3000); h.hide(); h.advance(60000); h.show();
    h.ready(); h.poll();
    assert.deepEqual(h.failures, []); assert.equal(h.hidden(), 1);
    assert.equal(h.app.session.weChatEntryVigorCharged, true);
    h.draw(); assert.equal(h.app.session.weChatEntryVigorCharged, false);
});

test('lifecycle events and late polls cannot resume an old level wait', () => {
    const h = harness(); h.start(); const previous = { ...h.runtime._weChatInteractionWait };
    h.runtime._gameplayInitSeq++; h.advance(3000); h.hide(); h.advance(60000); h.show(); h.poll();
    assert.deepEqual(h.runtime._weChatInteractionWait, { ...previous, timer: null });
    assert.deepEqual(h.failures, []);
    h.start(); assert.equal(h.runtime._weChatInteractionWait.elapsed, 0);
    assert.equal(h.runtime._weChatInteractionWait.generation, 2);
});

test('Home lifecycle remains safe before any gameplay wait or generation exists', () => {
    const h = harness(); delete h.runtime._gameplayInitSeq;
    h.hide(); h.advance(60000); h.show();
    assert.equal(h.runtime._gameForeground, true);
    assert.equal(h.runtime._weChatInteractionWait, undefined);
    assert.deepEqual(h.failures, []);
});
