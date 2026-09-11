const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function clock() {
    let now = 0, id = 0;
    const timers = new Map();
    return {
        setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        advance(ms) {
            const end = now + ms;
            for (;;) {
                const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
                if (!next || next[1].at > end) break;
                now = next[1].at; timers.delete(next[0]); next[1].fn();
            }
            now = end;
        },
        count: () => timers.size,
    };
}

const controllerCode = transpile(read('assets/Scripts/Core/GameplayResultPanelController.ts'));
function harness(minigame = true) {
    const time = clock(), loads = [], bundles = [];
    const runtime = { isValid: true, isGameEnd: true, _gameplayInitSeq: 1, _gameplayResultPanelPrefabLoadSeq: 1, _gameplayResultPanelPrefabCache: new Map() };
    const makeBundle = source => ({ load(file, type, callback) { loads.push({ source, file, finish(error, prefab = { file }) { callback(error, error ? null : prefab); } }); } });
    runtime._withBootstrapBundle = cb => { bundles.push('bootstrap'); cb(makeBundle('bootstrap')); };
    runtime._withGameAssetsBundle = cb => { bundles.push('gameAssets'); cb(makeBundle('gameAssets')); };
    const module = { exports: {} };
    vm.runInNewContext(controllerCode, {
        module, exports: module.exports, Map, Set, console, Error, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
        require(id) {
            if (id === './GameCtrlShared') return { ccclass: () => target => target, Component: class {}, Prefab: class {}, GAME_ASSETS_BUNDLE_NAME: 'gameAssets', LOCAL_BOOTSTRAP_BUNDLE_NAME: 'bootstrap' };
            if (id === './MiniGamePlatform') return { isMiniGameRuntime: () => minigame };
            if (id === './PchConveyorGameplayController') return {};
            throw new Error(id);
        },
    });
    const controller = new module.exports.GameplayResultPanelController(runtime);
    return { controller, runtime, loads, bundles, time };
}

function attachMethods(runtime, file, names, globals = {}) {
    const source = read(file), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const methods = [];
    function visit(node) {
        if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast))) methods.push(node.getText(ast));
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(methods.length, names.length);
    const module = { exports: {} };
    vm.runInNewContext(transpile('export class Methods {' + methods.join('\n') + '}'), { module, exports: module.exports, console, Error, ...globals });
    for (const name of names) runtime[name] = module.exports.Methods.prototype[name];
}

{
    const h = harness(); let won = 0, revived = 0;
    h.controller.ensurePrefabsReady(() => revived++, assert.fail, ['revive']);
    h.controller.ensurePrefabsReady(() => won++, assert.fail, ['win']);
    h.controller.ensurePrefabsReady(() => won++, assert.fail, ['win']);
    assert.equal(h.loads.length, 2, 'demand joins only the same kind, bypasses unrelated in-flight preload');
    assert.ok(h.loads[1].file.endsWith('/WinPanel'));
    h.loads[1].finish();
    assert.equal(won, 2);
    assert.equal(revived, 0, 'win does not wait for revive');
    assert.equal(h.controller.hasPrefabsReady(['win']), true);
    assert.equal(h.controller.hasPrefabsReady(), false);
    h.controller.ensurePrefabsReady(() => won++, assert.fail, ['win']);
    assert.equal(h.loads.length, 2, 'cache reuse');
    h.loads[0].finish();
    assert.equal(h.time.count(), 0);
}

{
    const h = harness(); let done = 0;
    h.controller.ensurePrefabsReady(() => done++, assert.fail);
    for (let i = 0; i < 4; i++) { assert.equal(h.loads.length, i + 1); h.loads[i].finish(); }
    assert.equal(done, 1, 'legacy all request stays sequential');
}

{
    const h = harness(); let done = 0, failed = 0;
    h.controller.ensurePrefabsReady(() => done++, () => failed++, ['win']);
    h.controller.ensurePrefabsReady(() => done++, () => failed++, ['win']);
    h.time.advance(5000);
    assert.equal(h.loads.length, 2, 'one bounded timeout retry');
    h.loads[0].finish();
    assert.equal(h.controller.hasPrefabsReady(['win']), false, 'late timed-out callback cannot populate cache');
    h.time.advance(5000);
    assert.equal(failed, 2);
    assert.equal(done, 0);
    h.loads[1].finish();
    assert.equal(done, 0);
    assert.equal(h.controller.hasPrefabsReady(['win']), false);
    assert.ok(h.bundles.every(b => b === 'bootstrap'), 'minigame never loads result source from another bundle');
    h.controller.ensurePrefabsReady(() => done++, assert.fail, ['win']);
    h.loads[2].finish();
    assert.equal(done, 1, 'failure does not strand future demand');
}

{
    const h = harness(); let oldDone = 0, newDone = 0;
    h.controller.ensurePrefabsReady(() => oldDone++, assert.fail, ['win']);
    h.runtime._gameplayInitSeq++; h.runtime._gameplayResultPanelPrefabLoadSeq++;
    h.controller.ensurePrefabsReady(() => newDone++, assert.fail, ['win']);
    h.loads[0].finish();
    assert.equal(h.controller.hasPrefabsReady(['win']), false);
    h.loads[1].finish();
    assert.equal(oldDone, 0); assert.equal(newDone, 1);
    h.time.advance(10000);
    assert.equal(h.time.count(), 0);
}

{
    const h = harness(false); let done = 0;
    h.controller.ensurePrefabsReady(() => done++, assert.fail, ['bufferFullRevive']);
    h.loads[0].finish(new Error('preview bootstrap has no source prefab'));
    assert.equal(h.loads[1].source, 'gameAssets');
    assert.ok(h.loads[1].file.endsWith('/BufferFullRevivePanel'));
    h.loads[1].finish(); assert.equal(done, 1);
}

function settlementHarness() {
    const h = harness();
    attachMethods(h.runtime, 'assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts', [
        '_hasGameplayResultPanelPrefabsReady', '_ensureGameplayResultPanelPrefabsReady', 'ensureGameplayResultPanelsCreated',
    ], { ensureGameplayResultPanelController: () => h.controller });
    const created = [];
    for (const [method, kind] of [['createWinSettlementPanel', 'win'], ['createReviveSettlementPanel', 'revive'], ['createBufferFullSettlementPanel', 'bufferFullRevive'], ['createLoseSettlementPanel', 'lose']]) {
        h.runtime[method] = () => { created.push(kind); return { isValid: true, active: false, setSiblingIndex() {} }; };
    }
    return { ...h, created };
}

{
    const h = settlementHarness();
    let shown = 0;
    Object.assign(h.runtime, {
        _settlementRevealToken: 1, _settlementRevealState: 'idle',
        revealWinSettlementPanel() { if (!this.ensureGameplayResultPanelsCreated('win')) return false; shown++; this._settlementRevealState = 'shown'; return true; },
        failWinSettlementReveal: assert.fail,
    });
    attachMethods(h.runtime, 'assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts', ['requestWinSettlementReveal']);
    h.runtime.requestWinSettlementReveal(1, 1);
    assert.equal(h.loads.length, 1); assert.ok(h.loads[0].file.endsWith('/WinPanel'));
    h.loads[0].finish();
    assert.equal(shown, 1); assert.deepEqual(h.created, ['win']);
}

{
    const h = settlementHarness();
    attachMethods(h.runtime, 'assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts', ['showLosePanel']);
    Object.assign(h.runtime, {
        recordDynamicCountdownFinalFailure() {}, syncSettlementProgressWidget() {},
        getBoardCompletionStats: () => ({ completePercent: 50 }), showBasicSettlement: assert.fail,
        panelTimeoutContinue: { active: true }, panelBufferFullContinue: { active: false },
    });
    h.runtime.showLosePanel();
    assert.equal(h.loads.length, 1); assert.ok(h.loads[0].file.endsWith('/LosePanel'));
    assert.equal(h.runtime.panelTimeoutContinue.active, false);
    h.loads[0].finish();
    assert.deepEqual(h.created, ['lose']); assert.equal(h.runtime.panelLose.active, true);
}

for (const reason of ['timeout', 'buffer-full']) {
    const h = settlementHarness();
    Object.assign(h.runtime, {
        isGameEnd: false, isBoardCompletionCommittedForSettlement: () => false, isBoardCompletionPendingForSettlement: () => false,
        clearIdleHint() {}, unschedule() {}, trackFirstLevelFunnel() {}, getAnalyticsLevelId: () => 4, getAnalyticsPage: () => 'game',
        updateLoseProgressLabel() {}, refreshReviveShareButtons() {}, showBasicSettlement: assert.fail, showLosePanel: assert.fail,
    });
    attachMethods(h.runtime, 'assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts', ['gameLose'], {
        AnalyticsMgr: { inst: { markLevelFailed() {}, trackRevivePanelShow() {} } }, SySDKMgr: { inst: { reportLevelFail() {} } },
        PerformanceMgr: { inst: { markUserActivity() {} } }, AudioMgr: { inst: { play() {} } },
    });
    h.runtime.gameLose(reason);
    assert.equal(h.loads.length, 1);
    h.loads[0].finish();
    assert.deepEqual(h.created, [reason === 'timeout' ? 'revive' : 'bufferFullRevive']);
    const panel = reason === 'timeout' ? h.runtime.panelTimeoutContinue : h.runtime.panelBufferFullContinue;
    assert.equal(panel.active, true);
}

console.log('result-panel-demand-loading.test.js passed');
