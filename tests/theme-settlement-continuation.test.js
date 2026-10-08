const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

function load(file, dependencies = () => ({})) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, require: dependencies, console, Date, Set });
    return exports;
}
const { SettlementAnalytics } = load('assets/Scripts/Core/SettlementAnalytics.ts');

function fixture(enabled, basic = false) {
    const events = [], callbacks = [], button = { interactable: true };
    const tracker = new SettlementAnalytics(event => events.push(event), () => enabled);
    const id = tracker.begin({ roundId: 'theme-source', logicalLevelId: 1003, gameplayEntryMode: 'theme' },
        'win', { logicalLevelId: 1017, gameplayEntryMode: 'theme' });
    const shared = { AnalyticsMgr: { inst: { settlement: tracker } }, Button: class {} };
    const dependencies = name => name.endsWith('GameCtrlShared') ? shared : {};
    const runtime = {};
    load('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts', dependencies).installSettlementHudModule(runtime);
    load('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts', dependencies).installThemeLoadingOverlayModule(runtime);
    const state = { vigor: 0, spent: 0, transitions: 0, scene: 'Game', modalThrows: false, homeRoutes: 0 };
    const actions = { getChildByName: name => name === 'PrimaryBtn' ? { getComponent: () => button } : null };
    const box = basic ? actions : { getChildByName: name => name === 'BottomGroup' ? actions : null };
    Object.assign(runtime, {
        _settlementAnalyticsId: id, _isThemeLevel: true, _currentThemeLevelId: 1003,
        _gameplayInitSeq: 1, isValid: true, isGameEnd: true, levelData: { levelId: 1003 },
        panelWin: { __basicSettlement: basic, getChildByName: name => name === 'Box' ? box : null },
        getNextThemeLevelId: () => 1017, getRuntimeSceneName: () => state.scene,
        unschedule() {}, refreshWinAdBonusUI() {}, deactivateMainMenuNode() {}, showToast() {},
        showMainMenu() { state.homeRoutes++; },
        costVigorForLevel(level, mode) {
            assert.equal(level, 1017); assert.equal(mode, 'theme');
            if (state.vigor <= 0) return false;
            state.vigor--; state.spent++; return true;
        },
        showNoLivesAdModal(options) {
            if (state.modalThrows) throw Error('modal unavailable');
            const modal = { isValid: true };
            runtime._noLivesModal = modal;
            callbacks.push((status, modalRemains = status === 'failed') => {
                if (!modalRemains && runtime._noLivesModal === modal) runtime._noLivesModal = null;
                options.onResult({ status });
            });
        },
        loadThemeLevel(level) { assert.equal(level, 1017); },
        requestGameplayTransition(key, run) {
            assert.equal(key, 'theme:1017'); state.transitions++; run(); return Promise.resolve(true);
        },
        requestGameplayRoute() { state.homeRoutes++; return Promise.resolve(true); },
    });
    return { runtime, state, callbacks, button, events };
}

for (const enabled of [true, false]) for (const basic of [true, false]) {
    const f = fixture(enabled, basic);
    f.runtime.handleWinSettlementPrimaryAction();
    f.runtime.handleWinSettlementPrimaryAction();
    assert.equal(f.callbacks.length, 1, 'repeated click must not reopen the recovery dialog');
    assert.equal(f.button.interactable, false);
    f.callbacks[0]('cancelled');
    assert.equal(f.runtime._settlementNextTransitioning, false, 'cancel must release the continuation lock');
    assert.equal(f.button.interactable, true, 'cancel must restore the actual normal/basic primary button');
    f.runtime.handleWinSettlementPrimaryAction();
    assert.equal(f.callbacks.length, 2, 'a new click after cancellation must be accepted');
    f.state.vigor = 1;
    f.callbacks[0]('granted');
    assert.equal(f.state.spent, 0, 'late success from the cancelled attempt must not charge vigor');
    assert.equal(f.button.interactable, false, 'late callback must not unlock the new attempt');
    f.callbacks[1]('granted');
    f.callbacks[1]('granted');
    assert.equal(f.state.spent, 1); assert.equal(f.state.transitions, 1);
    assert.equal(f.runtime._settlementNextTransitioning, true, 'keep the lock until target initialization');
    if (enabled) assert.equal(f.events.filter(e => e.eventName === 'settlement_action').length, 2);
    else assert.equal(f.events.length, 0, 'the business fix must work with collection disabled');
}

const retry = fixture(true);
retry.runtime.handleWinSettlementPrimaryAction();
retry.callbacks[0]('failed');
assert.equal(retry.runtime._settlementNextTransitioning, true, 'retryable reward failure keeps this continuation active');
retry.runtime.handleWinSettlementPrimaryAction();
assert.equal(retry.callbacks.length, 1);
retry.state.vigor = 1;
retry.callbacks[0]('granted');
assert.equal(retry.state.spent, 1); assert.equal(retry.state.transitions, 1);

for (const closeAfterFailure of [true, false]) {
    const f = fixture(false);
    f.runtime.handleWinSettlementPrimaryAction();
    f.callbacks[0]('failed', closeAfterFailure);
    if (closeAfterFailure) f.callbacks[0]('cancelled');
    assert.equal(f.button.interactable, true, 'closed/failed dialog must leave the settlement usable');
    f.runtime.handleWinSettlementPrimaryAction();
    assert.equal(f.callbacks.length, 2);
}

for (const leave of ['new_round', 'home', 'destroyed']) {
    const f = fixture(true);
    f.runtime.handleWinSettlementPrimaryAction();
    if (leave === 'new_round') f.runtime._gameplayInitSeq++;
    if (leave === 'home') f.state.scene = 'Home';
    if (leave === 'destroyed') f.runtime.isValid = false;
    f.state.vigor = 1;
    f.callbacks[0]('granted');
    assert.equal(f.state.spent, 0, `${leave}: old reward callback must not charge`);
    assert.equal(f.state.transitions, 0);
}

const throws = fixture(false);
throws.state.modalThrows = true;
assert.throws(() => throws.runtime.handleWinSettlementPrimaryAction(), /modal unavailable/);
assert.equal(throws.runtime._settlementNextTransitioning, false, 'synchronous modal failure must release the lock');
assert.equal(throws.button.interactable, true);

const home = fixture(false);
home.state.scene = 'Home'; home.runtime.isGameEnd = false;
home.runtime.startThemeLevel(1017);
home.callbacks[0]('cancelled');
assert.equal(home.state.transitions, 0); assert.equal(home.state.homeRoutes, 0);
home.state.vigor = 1;
home.runtime.startThemeLevel(1017);
assert.equal(home.state.homeRoutes, 1, 'home entry keeps its existing route');
assert.equal(home.state.spent, 1);
async function verifyTransitionFailures() {
    for (const stale of [false, true]) {
        const f = fixture(false);
        f.state.vigor = 1;
        let reject;
        f.runtime.requestGameplayTransition = () => new Promise((resolve, fail) => { reject = fail; });
        f.runtime.beginSettlementNextTransition();
        const pending = f.runtime.startThemeLevel(1017, { fromSettlement: true });
        if (stale) f.runtime._gameplayInitSeq++;
        reject(Error('expected transition failure'));
        assert.equal(await pending, false);
        assert.equal(f.state.spent, 1, 'preserve the original vigor charging rule on transition failure');
        assert.equal(f.button.interactable, !stale, 'only the current failed continuation can unlock its button');
        assert.equal(f.state.homeRoutes, stale ? 0 : 1, 'a stale failure cannot navigate away from a new round');
    }
}
verifyTransitionFailures().then(() => {
    console.log('PASS theme continuation: normal/basic panels, disabled analytics, cancel/retry, stale/duplicate callbacks, single charge, home entry, transition failures');
}).catch(error => { console.error(error); process.exitCode = 1; });
