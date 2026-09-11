const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/PostPlayableWarmupModule.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function emitter() {
    const events = new Map();
    return {
        on(name, cb) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(cb); },
        off(name, cb) { events.get(name)?.delete(cb); },
        emit(name, value) { for (const cb of [...(events.get(name) || [])]) cb(value); },
        count() { return [...events.values()].reduce((sum, set) => sum + set.size, 0); },
    };
}

function harness() {
    let now = 0;
    const director = emitter(), input = emitter(), game = emitter();
    const requests = [], traces = [], audioReady = new Set(), panelReady = new Set();
    const audio = {
        isSfxReady: name => audioReady.has(name),
        preload(name, done) { requests.push({ type: 'audio', name, finish(error) { if (!error) audioReady.add(name); done(error); } }); },
    };
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module, exports: module.exports, Map, Set, Date: { now: () => now }, Error,
        require(id) {
            if (id === 'cc') return { director, input, game, Director: { EVENT_AFTER_DRAW: 'draw' }, Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' }, Input: { EventType: { TOUCH_START: 'start', TOUCH_MOVE: 'move', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' } } };
            if (id === '../GameCtrlShared') return { AudioMgr: { inst: audio } };
            if (id === '../RuntimeLog') return { runtimeWarn() {} };
            if (id === '../DebugPerfTrace') return { debugPerfTrace: (event, data) => traces.push({ event, data }) };
            throw new Error(id);
        },
    });
    const runtime = {
        isValid: true, isGameEnd: false, _gameplayInitSeq: 1,
        _postPlayableWarmupInitSeq: 0, _postPlayableWarmupSeq: 0,
        _gameForeground: true, activeBoardTouches: new Map(),
        _pchConveyorGameplayController: { idle: false, isPostPlayableWarmupIdle() { return this.idle; } },
        _hasGameplayResultPanelPrefabsReady: kinds => kinds.every(kind => panelReady.has(kind)),
        _ensureGameplayResultPanelPrefabsReady(done, fail, kinds) {
            assert.equal(kinds.length, 1);
            const name = kinds[0];
            requests.push({ type: 'panel', name, finish(error) { if (error) fail(error); else { panelReady.add(name); done(); } } });
        },
    };
    module.exports.installPostPlayableWarmupModule(runtime);
    return {
        runtime, requests, traces, director, input, game, panelReady, audioReady,
        frame(ms = 16) { now += ms; director.emit('draw'); },
        frames(ms) { for (let elapsed = 0; elapsed < ms; elapsed += 10) { now += 10; director.emit('draw'); } },
        touch(type, id = 1) { input.emit(type, { type, getID: () => id }); },
    };
}

{
    const h = harness();
    h.runtime.startPostPlayableWarmup();
    h.frames(1500);
    assert.equal(h.requests.length, 0, 'opening animation must not dispatch preloads');
    assert.equal(h.runtime._postPlayableWarmupQueue.length, 0, 'no speculative queue before playable draw');
    assert.equal(h.runtime._postPlayableWarmupRunning, false);
    h.runtime._pchConveyorGameplayController.idle = true;
    h.frames(500);
    assert.equal(h.requests.length, 0);
    h.frames(20);
    assert.equal(h.requests[0].name, 'win');
    h.frames(1500);
    assert.equal(h.requests.length, 1, 'dispatch is not load completion');
    h.requests[0].finish();
    h.frames(240);
    assert.equal(h.requests.length, 1);
    h.frames(20);
    assert.equal(h.requests[1].name, 'winSettlement');
    h.requests[1].finish(new Error('audio failed'));
    assert.equal(h.runtime._postPlayableWarmupRunning, false);
    assert.ok(h.traces.some(t => t.event.endsWith('failed')));
    h.frames(260);
    assert.equal(h.requests[2].name, 'winColor');
    h.runtime.stopPostPlayableWarmup();
    assert.equal(h.director.count() + h.input.count() + h.game.count(), 0);
}

for (const busy of ['_adShowing', '_skillActive', '_placementInputLocked', 'isSelected', '_settlementNextTransitioning', '_rewardedGrantTransaction', '_modalFocusRefs', '_spriteFrameLoadInFlight', '_placementVisualRefs']) {
    const h = harness();
    h.runtime._pchConveyorGameplayController.idle = true;
    h.runtime[busy] = 1;
    h.runtime.startPostPlayableWarmup();
    h.frames(1000);
    assert.equal(h.requests.length, 0, busy);
    h.runtime[busy] = 0;
    h.frames(520);
    assert.equal(h.requests.length, 1, busy);
    h.runtime.stopPostPlayableWarmup();
}

{
    const h = harness();
    h.runtime._pchConveyorGameplayController.idle = true;
    h.runtime.startPostPlayableWarmup();
    h.frames(400);
    h.touch('start'); h.touch('end');
    h.frames(400);
    assert.equal(h.requests.length, 0, 'tap between rendered frames resets idle window');
    h.touch('start', 1); h.touch('start', 2); h.touch('end', 1);
    h.frames(1000);
    assert.equal(h.requests.length, 0, 'held second touch prevents warmup even on guide');
    h.touch('cancel', 2);
    h.frames(520);
    assert.equal(h.requests.length, 1);
    h.requests[0].finish();
    h.runtime._gameForeground = false;
    h.game.emit('hide');
    h.frames(1000);
    h.runtime._gameForeground = true;
    h.game.emit('show');
    h.frames(400);
    assert.equal(h.requests.length, 1, 'return to foreground needs a fresh idle window');
    h.frames(120);
    assert.equal(h.requests.length, 2);
    h.runtime.stopPostPlayableWarmup();
}

{
    const h = harness();
    h.runtime._pchConveyorGameplayController.idle = true;
    h.runtime.startPostPlayableWarmup();
    h.frames(400); h.frame(3000);
    assert.equal(h.requests.length, 0, 'wall-clock pause is not idle observation');
    h.frames(520);
    const old = h.requests[0];
    h.runtime._gameplayInitSeq++;
    h.runtime.startPostPlayableWarmup();
    h.frames(520);
    old.finish();
    assert.equal(h.runtime._postPlayableWarmupRunning, true, 'old callback cannot clear new running task');
    assert.equal(h.director.count(), 1);
    h.runtime.isGameEnd = true; h.frames(1000);
    assert.equal(h.requests.length, 2, 'settlement pauses additional optional requests');
    h.requests[1].finish();
    h.runtime.isGameEnd = false; h.frames(520);
    assert.equal(h.requests[2].name, 'winSettlement', 'revive resumes remaining warmup after a new idle window');
    h.runtime.stopPostPlayableWarmup();
    assert.equal(h.runtime._postPlayableWarmupQueue.length, 0);
    assert.equal(h.director.count() + h.input.count() + h.game.count(), 0);
}

{
    const h = harness();
    h.runtime._pchConveyorGameplayController.idle = true;
    h.runtime.startPostPlayableWarmup();
    for (let index = 0; index < 8; index++) {
        h.frames(520);
        assert.equal(h.requests.length, index + 1);
        h.requests[index].finish();
    }
    h.frame();
    assert.deepEqual(h.requests.filter(r => r.type === 'audio').map(r => r.name), ['winSettlement', 'winColor', 'lose', 'tick']);
    assert.equal(h.director.count() + h.input.count() + h.game.count(), 0, 'finished warmup has no listeners');
}

{
    const pch = fs.readFileSync(path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8');
    const ast = ts.createSourceFile('pch.ts', pch, ts.ScriptTarget.Latest, true);
    const cls = ast.statements.find(s => ts.isClassDeclaration(s) && s.name.text === 'PchConveyorGameplayController');
    const methods = cls.members.filter(m => ['isStartupInteractionReady', 'isPostPlayableWarmupIdle'].includes(m.name?.getText(ast)));
    const code = ts.transpileModule('export class Ready {' + methods.map(m => m.getText(ast)).join('\n') + '}', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, Button: class {} });
    const c = new module.exports.Ready();
    Object.assign(c, { openingPatternState: 'done', root: { activeInHierarchy: true }, rules: {}, runtime: {}, inputLocked: true, openingGuideTarget: { activeInHierarchy: true, getComponent: () => ({ interactable: true }) }, activeFlyBeans: new Set(), activeReturnAnimations: 0, pendingPchReturnColorSettles: new Set(), activePchColorCompleteEffects: 0 });
    assert.equal(c.isPostPlayableWarmupIdle(), true, 'clickable tutorial is valid playable state');
    for (const flag of ['externalInputBlocked', 'skillMovementPaused', 'settingsPaused']) {
        c[flag] = true; assert.equal(c.isPostPlayableWarmupIdle(), false, flag); c[flag] = false;
    }
    c.activeFlyBeans.add({}); assert.equal(c.isPostPlayableWarmupIdle(), false);
    c.activeFlyBeans.clear(); c.activeReturnAnimations = 1; assert.equal(c.isPostPlayableWarmupIdle(), false);
    c.activeReturnAnimations = 0; c.activePchColorCompleteEffects = 1; assert.equal(c.isPostPlayableWarmupIdle(), false);
}

console.log('post-playable-warmup-behavior.test.js passed');
