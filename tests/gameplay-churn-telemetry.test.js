const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const events = [];
let failUpload = false;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(transpile(read('assets/Scripts/Core/GameplayChurnTelemetry.ts')), {
    module: moduleUnderTest, exports: moduleUnderTest.exports,
    require(id) {
        assert.equal(id, './AnalyticsMgr');
        return { AnalyticsMgr: { inst: { trackFunnelEvent(event) { if (failUpload) throw Error('offline'); events.push(event); } } } };
    },
});
const telemetry = moduleUnderTest.exports;
const coopEvents = events.length;
telemetry.trackGameplayChurn({ isCoopMode: () => true }, 'ready');
telemetry.trackGameplayChurn({ isRankedPvpMode: () => true }, 'ready');
assert.equal(events.length, coopEvents, 'social gameplay must not contaminate ordinary mode flow');
function runtime() {
    return { _activeLogicalLevelId: 1, _activeGameplayEntryMode: 'main', _gameplayInitSeq: 1,
        getActiveLogicalLevelId() { return this._activeLogicalLevelId; }, getActivePhysicalLevelId() { return this._activeLogicalLevelId; },
        getAnalyticsPage() { return 'level_game'; }, timeRemain: 60, isGameEnd: true,
        beginSettlementNextTransition() { if (this.busy) return false; this.busy = true; return true; },
        shouldChainTutorialLevelsOnWin() { return false; } };
}
const r = runtime();
telemetry.beginChurnAttempt(r);
const first = r._churnAttemptId;
telemetry.beginChurnTransition(r);
const transition = r._churnTransition.id;
telemetry.requestChurnLevel(r, 2);
r._activeLogicalLevelId = 2;
telemetry.beginChurnAttempt(r);
telemetry.finishChurnReady(r, 2, 'main');
assert.notEqual(first, r._churnAttemptId);
const ready = events.find(event => event.stepName === 'next_ready');
assert.equal(ready.extra.transitionId, transition);
assert.equal(ready.extra.fromAttemptId, first);
assert.equal(ready.extra.attemptId, r._churnAttemptId);
assert.equal(r._churnTransition, null);
telemetry.finishChurnReady(r, 2, 'main');
assert.equal(events.filter(event => event.stepName === 'next_ready').length, 1);
telemetry.beginChurnTransition(r);
telemetry.requestChurnLevel(r, 3);
telemetry.finishChurnReady(r, 1, 'theme');
assert.equal(events.at(-2).errorCode, 'route_changed');
assert.equal(events.filter(event => event.stepName === 'next_ready').length, 1);
failUpload = true;
assert.doesNotThrow(() => telemetry.trackGameplayChurn(r, 'home_click'));
failUpload = false;

function attach(target, names) {
    const source = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
    const ast = ts.createSourceFile('settlement.ts', source, ts.ScriptTarget.Latest, true);
    const methods = [];
    function visit(node) { if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast))) methods.push(node.getText(ast)); ts.forEachChild(node, visit); }
    visit(ast);
    assert.equal(methods.length, names.length);
    const mod = { exports: {} };
    vm.runInNewContext(transpile('export class Methods {' + methods.join('\n') + '}'), { module: mod, exports: mod.exports, ...telemetry });
    for (const name of names) target[name] = mod.exports.Methods.prototype[name];
}
const click = runtime(); let loads = 0;
click.goNextLevel = () => { loads++; };
attach(click, ['handleWinSettlementPrimaryAction']);
click.handleWinSettlementPrimaryAction();
click.handleWinSettlementPrimaryAction();
assert.equal(loads, 1, 'duplicate clicks must not cause another load');
assert.equal(events.at(-1).errorCode, 'transition_busy');
click.busy = false;
const original = Error('original route failure');
click.goNextLevel = () => { throw original; };
assert.throws(() => click.handleWinSettlementPrimaryAction(), error => error === original);
assert.equal(events.at(-1).errorCode, 'transition_exception');

const blocked = runtime();
Object.assign(blocked, { unschedule() {}, unscheduleAllCallbacks() {}, stopPulseTweens() {}, clearDragNodes() {},
    saveLevelProgress() {}, costVigorForLevel() { return false; }, showNoLivesAdModal(options) { this.modal = options; },
    endSettlementNextTransition() {}, loadLevel() { throw Error('must not load'); } });
telemetry.beginChurnTransition(blocked);
attach(blocked, ['goNextLevel']);
blocked.goNextLevel();
assert.equal(events.at(-1).errorCode, 'vigor_required');
blocked.modal.onResult({ status: 'cancelled' });
assert.equal(events.at(-1).errorCode, 'not_granted');
assert.equal(events.at(-1).extra.transitionId, blocked._churnTransition.id);
const oldTransition = blocked._churnTransition;
telemetry.beginChurnTransition(blocked);
telemetry.requestChurnLevel(blocked, 2, oldTransition);
assert.equal(events.at(-1).extra.transitionId, oldTransition.id);
assert.equal(blocked._churnTransition.targetLevel, 0, 'old callback must not relabel the new transition');
const session = read('assets/Scripts/Core/GameplaySessionController.ts');
assert.ok(session.includes('finishChurnReady(runtime, analyticsLevelId, gameplayEntryMode)'));
assert.ok(session.includes("trackGameplayChurn(runtime, 'init_failed', errorCode)"));
assert.ok(events.every(event => Object.keys(event.extra).length < 26));
const cloudSandbox = { exports: {}, require() { return { init() {}, database: () => ({}) }; } };
vm.runInNewContext(read('cloudfunctions/addFunnelEvents/index.js'), cloudSandbox);
const stored = cloudSandbox.normalizeEvent({ ...ready, sessionId: 'test-session', eventSeq: 7 }, 'test-user', '', Date.now());
assert.equal(stored.extra.transitionId, transition);
assert.equal(stored.extra.attemptId, ready.extra.attemptId);
assert.equal(stored.extra.fromAttemptId, first);
assert.equal(stored.stepName, 'next_ready');
for (const file of ['AnalyticsMgr.ts', 'GameplayChurnTelemetry.ts', 'GameplaySessionController.ts', 'GameplayResultPanelController.ts', 'GameCtrlState.ts', 'GameCtrlModules/SettlementHudModule.ts', 'GameCtrlModules/ThemeLoadingOverlayModule.ts']) {
    const result = ts.transpileModule(read('assets/Scripts/Core/' + file), { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2020, experimentalDecorators: true } });
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
}
console.log('PASS: churn attempt/transition correlation, route mismatch, duplicate click, vigor blocking, exception preservation and telemetry isolation');
