const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function method(file, name, globals) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let found;
    function visit(node) {
        if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) found = node;
        ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(found, name);
    const sandbox = { result: null, ...globals };
    vm.runInNewContext(ts.transpileModule(`result = ({${found.getText(source)}})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, sandbox);
    return sandbox.result[name];
}
const core = 'assets/Scripts/Core/';
{
    class UITransform {}
    const bounds = { ReturnLobby: new UITransform(), SelfResultPlate: new UITransform() };
    const content = { getChildByName: name => ({ getComponent: () => bounds[name] }) };
    const panel = {};
    const play = method(core + 'GameplayResultPanelController.ts', 'playPvpWinSettlementFx', { UITransform });
    let args;
    play.call({ playWinConfettiFx: (...values) => args = values }, panel, content);
    assert.deepEqual(args, [panel, bounds.ReturnLobby, bounds.SelfResultPlate], 'reuse confetti with actual PVP layout bounds');
}
const sounds = [], errors = [];
const audio = { inst: { play: key => sounds.push(key) } };
const logger = { error: (...args) => errors.push(args) };
const presentation = method(core + 'GameCtrlModules/SettlementHudModule.ts', 'playCompletedPatternPresentation', {
    AudioMgr: audio, console: logger, PerformanceMgr: { inst: { markUserActivity() {} } },
    PATTERN_COMPLETE_BOARD_SHRINK_DELAY: 0, PATTERN_COMPLETE_BOARD_SHRINK_DURATION: 0.3,
    PATTERN_COMPLETE_SETTLEMENT_HOLD: 0.25,
    Tween: { stopAllByTarget() {} }, Vec3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
    tween: () => { const t = { to: () => t, call: fn => { t.callback = fn; return t; }, start: () => t.callback() }; return t; },
});
function presenter() {
    const jobs = new Map(), trace = [];
    const r = {
        boardGroup: { isValid: true },
        boardViewport: { getHomeTransform: () => ({ scale: 1, offset: { x: 0, y: 0 } }) },
        resetBoardViewportToHome: () => trace.push('home'),
        scheduleOnce: (fn, delay) => jobs.set(fn, delay), unschedule: fn => jobs.delete(fn),
        flushPendingColorCompleteEffectsSequentially: fn => { r.colorsDone = fn; },
        getPatternCompleteMatchFxDuration: () => 2,
        playPatternCompleteMatchFx: fn => { trace.push('sweep'); r.sweepDone = fn; },
    };
    return { r, jobs, trace };
}
{
    const { r, jobs, trace } = presenter(); let done = 0;
    presentation.call(r, () => done++, () => true);
    assert.equal(sounds.length, 0); assert.equal(done, 0);
    r.colorsDone();
    assert.deepEqual(trace, ['home', 'sweep']); assert.deepEqual(sounds.splice(0), ['winAll']);
    assert.equal(done, 0, 'wait for sweep callback');
    r.sweepDone();
    [...jobs].find(([, delay]) => delay === 0.25)[0]();
    r.sweepDone();
    assert.equal(done, 1); assert.equal(jobs.size, 0, 'cancel watchdog after success');
}
{
    const { r, jobs } = presenter(); let done = 0;
    presentation.call(r, () => done++, () => true);
    [...jobs.keys()][0](); r.colorsDone();
    assert.equal(done, 1); assert.equal(sounds.length, 0, 'late callbacks cannot replay after timeout');
    assert.ok(errors.length, 'visual timeout is logged');
}
{
    const { r } = presenter(); let current = true, done = 0;
    presentation.call(r, () => done++, () => current);
    current = false; r.colorsDone();
    assert.equal(done, 0); assert.equal(sounds.length, 0, 'abandoned scene must not play effects');
}

class Node {
    constructor(name) { this.name = name; this.children = []; this.isValid = true; }
    addChild(n) { n.parent = this; this.children.push(n); }
    addComponent() { return {}; }
    setPosition() {}
    destroy() { this.isValid = false; }
}
class Color {}
const COLORS = new Proxy({}, { get: () => new Color() });
const label = (root, name, text) => { const n = new Node(name); root.addChild(n); n.string = text; return n; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function battle(terminal = 'PASS') {
    const context = { self: { displayName: 'Self' }, opponent: { displayName: 'Other' },
        opponentTerminalType: 'PASS', opponentTargetMs: 2000, replayProtocol: 'p', levelHash: 'hash' };
    let current = context, effectCount = 0, clears = 0;
    const server = deferred(), fx = deferred(), submits = [], buttons = {};
    const root = new Node('OverlayRoot');
    const service = { submitResult: async (_ctx, payload) => { submits.push(payload); return server.promise; }, clearPersistedBattle: () => clears++ };
    const r = {
        isValid: true, _pvpBattleHudContext: context,
        unschedule() {}, clearIdleHint() {}, clearEndgameHints() {},
        playCompletedPatternPresentation: done => { effectCount++; fx.promise.then(done); },
        requireCanvasUiRoot: () => root,
    };
    r.finishPvpBattle = method(core + 'GameCtrlModules/PvpModeModule.ts', 'finishPvpBattle', {
        console: logger, getPvpContext: () => current,
        PvpServiceMgr: { inst: service }, appendPvpBoardDelta() {}, computeBoardProgress: () => terminal === 'PASS' ? 1 : 0.4,
        resolvePvpOutcome: () => 'win',
        AnalyticsMgr: { inst: { beginSettlement() {}, finishMultiplayerAnalytics() {}, settlement: { shown() {} } } },
        Node, Color, COLORS, Layers: { Enum: { UI_2D: 1 } }, BlockInputEvents: class {},
        ensureTransform() {}, drawPanel() {}, drawPixelPanel() {}, addAvatar() {}, addLabel: label,
        addButton: (parent, name, _text, _x, _y, _w, _h, _color, fn) => { buttons[name] = fn; const n = new Node(name); parent.addChild(n); return n; },
        adaptPvpScreenOverlay: node => node, AudioMgr: audio,
        ensureGameplayResultPanelController: () => ({ playPvpWinSettlementFx: () => r.victoryFx = (r.victoryFx || 0) + 1 }),
    });
    return { r, server, fx, submits, buttons, root, service,
        start: () => r.finishPvpBattle(terminal, 1234, 'done'),
        result: () => root.children.find(n => n.name === 'PvpResultOverlay'),
        effects: () => effectCount, clears: () => clears, abandon: () => { current = {}; },
    };
}
(async () => {
    for (const serverFirst of [true, false]) {
        const b = battle(); const pending = b.start();
        assert.equal(b.r.isGameEnd, true); assert.equal(b.submits[0].terminalTimeMs, 1234);
        if (serverFirst) b.server.resolve({ settlement: { outcome: 'win', rankStarDelta: 1, rankAfter: { displayName: 'rank' } } });
        else b.fx.resolve();
        await tick(); assert.equal(b.result(), undefined, 'both animation and submission must finish');
        if (serverFirst) b.fx.resolve();
        else b.server.resolve({ settlement: { outcome: 'win', rankStarDelta: 1, rankAfter: { displayName: 'rank' } } });
        await pending;
        assert.ok(b.result()); assert.equal(b.effects(), 1); assert.equal(b.r.victoryFx, 1);
        assert.deepEqual(sounds.splice(0), ['winSettlement']);
        await b.start(); assert.equal(b.submits.length, 1, 'duplicate terminal ignored');
    }
    {
        const b = battle(); const pending = b.start();
        b.server.reject(new Error('offline')); await tick();
        assert.equal(b.root.children.length, 0, 'failure must not cover ongoing completion');
        b.fx.resolve(); await pending;
        assert.ok(b.buttons.Retry); assert.equal(b.result(), undefined); assert.equal(sounds.length, 0);
        b.service.submitResult = async (_ctx, payload) => { b.submits.push(payload); return { settlement: { outcome: 'win', rankStarDelta: 1, rankAfter: { displayName: 'rank' } } }; };
        b.buttons.Retry(); await tick();
        assert.ok(b.result()); assert.equal(b.effects(), 1, 'retry must reuse completed presentation');
        assert.equal(b.submits[1].terminalTimeMs, 1234); assert.deepEqual(sounds.splice(0), ['winSettlement']);
    }
    for (const outcome of ['win', 'lose', 'draw', 'waiting']) {
        const b = battle('SURVIVED_OPPONENT_DEATH'); const pending = b.start();
        b.server.resolve(outcome === 'waiting' ? { status: 'WAITING_RESULT' } : { settlement: { outcome, rankStarDelta: 0, rankAfter: { displayName: 'rank' } } });
        await pending;
        assert.equal(b.effects(), 0, 'unfinished board must not play full-pattern completion');
        assert.ok(b.result()); assert.equal(b.r.victoryFx || 0, outcome === 'win' ? 1 : 0);
        assert.deepEqual(sounds.splice(0), outcome === 'win' ? ['winSettlement'] : []);
    }
    {
        const b = battle(); const pending = b.start(); b.abandon();
        b.fx.resolve(); b.server.resolve({ status: 'WAITING_RESULT' }); await pending;
        assert.equal(b.result(), undefined); assert.equal(b.clears(), 0, 'stale result must not clear another battle');
    }
    console.log('PVP completion passed: shared sequence, timeout/cancel, async ordering, frozen time, retry, outcome gating.');
})().catch(error => { console.error(error); process.exitCode = 1; });
