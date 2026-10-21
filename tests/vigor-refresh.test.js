const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts'), 'utf8');
const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const hostSource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameRuntimeHost.ts'), 'utf8');
const ceiling = Number(hostSource.match(/VIGOR_CEILING = (\d+)/)[1]);
const restoreSeconds = Number(hostSource.match(/VIGOR_RESTORE_SECONDS = (\d+)/)[1]);
const restoreMs = restoreSeconds * 1000;

function createRuntime(vigor = ceiling, untilRestoreMs = 0, creator = false) {
    let now = 1700000000000;
    const values = new Map([
        ['pdd.vigor', String(vigor)],
        ['pdd.vigorTime', String(untilRestoreMs ? now + untilRestoreMs : 0)],
    ]);
    const reads = [], writes = [];
    class TestDate extends Date { static now() { return now; } }
    const module = { exports: {} };
    vm.runInNewContext(output, {
        module, exports: module.exports, Date: TestDate, console,
        require(id) {
            if (id === '../BrowserLevelPreview') return { getBrowserLevelPreview: () => ({ active: false }) };
            if (id === '../CreatorWeb') return { isCreatorWeb: () => creator };
            if (id === '../PreviewRewardSave') return { PreviewRewardSave: {} };
            if (id === '../RuntimeLog') return { runtimeLog() {}, runtimeWarn() {} };
            if (id === '../UserStateSyncMgr') return { PVP_ECONOMY_REVISION_KEY: 'pdd.pvpEconomyRevision' };
            assert.equal(id, '../GameCtrlShared');
            return {
                LS_GOLD: 'pdd.gold',
                sys: { localStorage: {
                    getItem(key) { reads.push(key); return values.get(key) ?? null; },
                    setItem(key, value) { writes.push(key); values.set(key, value); },
                } },
            };
        },
    });
    class Host {}
    Object.assign(Host, {
        VIGOR_CEILING: ceiling, VIGOR_RESTORE_SECONDS: restoreSeconds,
        LS_VIGOR: 'pdd.vigor', LS_VIGOR_TIME: 'pdd.vigorTime',
    });
    module.exports.installPlayerMetaStateModule(Host.prototype);
    const runtime = new Host();
    runtime._vigorTickDt = 0;
    runtime.cloudSyncRequests = 0;
    runtime.queueCloudGameStateSync = () => { runtime.cloudSyncRequests++; };
    runtime.recoverWechatGiftJournal = () => {};
    runtime.toasts = [];
    runtime.showToast = text => runtime.toasts.push(text);
    return {
        runtime, values, reads, writes, now: () => now,
        advance(ms) { now += ms; },
        clearCounts() { reads.length = 0; writes.length = 0; },
    };
}

// Exercise the installed production methods with storage isolated from the player.
for (const fps of [30, 60]) {
    for (const initial of [ceiling, ceiling - 2]) {
        const fixture = createRuntime(initial, initial === ceiling ? 0 : restoreMs);
        for (let i = 0; i < fps * 10; i++) {
            fixture.advance(1000 / fps);
            fixture.runtime.vigorTick(1 / fps);
        }
        assert.ok(fixture.reads.length >= 18 && fixture.reads.length <= 20,
            `10 seconds without vigor labels should read storage only twice per refresh: ${fixture.reads.length}`);
        assert.equal(fixture.writes.length, 0, 'no writes when recovery has not reached its deadline');
    }
}

{
    const f = createRuntime(ceiling - 2, restoreMs);
    f.runtime._vigorCountLbl = { string: '' };
    f.runtime._vigorTimeLbl = { string: '' };
    f.runtime.refreshVigorUI();
    assert.equal(f.runtime._vigorCountLbl.string, `${ceiling - 2}`);
    assert.equal(f.runtime._vigorTimeLbl.string, '05:00', 'count down to the next point rather than full vigor');
    assert.equal(f.reads.length, 3, 'visible timer reuses the recovered count');
    f.advance(1000);
    f.runtime.vigorTick(1);
    assert.equal(f.runtime._vigorTimeLbl.string, '04:59');
    f.advance(restoreMs - 2000);
    f.runtime.refreshVigorUI();
    assert.equal(f.runtime._vigorCountLbl.string, `${ceiling - 2}`);
    assert.equal(f.runtime._vigorTimeLbl.string, '00:01');
    f.advance(1000);
    f.runtime.refreshVigorUI();
    assert.equal(f.runtime._vigorCountLbl.string, `${ceiling - 1}`, 'one interval restores exactly one point');
    assert.equal(f.runtime._vigorTimeLbl.string, '05:00', 'restart the countdown after restoring one point');
    f.advance(restoreMs * 3);
    f.runtime.refreshVigorUI();
    assert.equal(f.runtime._vigorCountLbl.string, `${ceiling}`);
    assert.equal(f.runtime._vigorTimeLbl.string, '体力已满', 'full vigor must not show a recovery countdown');
    assert.equal(f.values.get('pdd.vigorTime'), '0');
}

{
    const f = createRuntime(2, restoreMs);
    const firstDeadline = f.now() + restoreMs;
    f.advance(restoreMs * 2 + 1000);
    assert.equal(f.runtime.updateVigor(), 4, 'recover all elapsed intervals in one refresh');
    assert.equal(Number(f.values.get('pdd.vigorTime')), firstDeadline + restoreMs * 2);
    assert.equal(f.runtime.getVigorCountdownSec(), restoreSeconds - 1,
        'offline recovery preserves the remaining time to the next point');
    const writes = f.writes.length;
    assert.equal(f.runtime.updateVigor(), 4);
    assert.equal(f.writes.length, writes, 're-reading the same instant cannot recover twice');
}

{
    const f = createRuntime(0, 500);
    f.runtime.vigorTick(0.2);
    f.advance(500);
    assert.equal(f.runtime.costVigor(), true, 'consume a newly recovered point before the next periodic refresh');
    assert.equal(f.values.get('pdd.vigor'), '0');
    assert.equal(Number(f.values.get('pdd.vigorTime')), f.now() + restoreMs);
    assert.equal(f.runtime.costVigor(), false, 'cannot spend a second point from the same recovery interval');
}

{
    const f = createRuntime(ceiling - 3, 500);
    f.advance(500);
    assert.equal(f.runtime.grantVigorByAmount(4), 2, 'account for natural recovery before calculating the reward');
    assert.equal(f.values.get('pdd.vigor'), String(ceiling));
    assert.equal(f.values.get('pdd.vigorTime'), '0');
    assert.equal(f.runtime.grantVigorByAmount(4), 0, 'full vigor receives no further reward');
}

{
    const f = createRuntime(3, 0);
    assert.equal(f.runtime.grantVigorByAmount(2), 2);
    assert.equal(f.values.get('pdd.vigor'), '5');
    assert.equal(Number(f.values.get('pdd.vigorTime')), f.now() + restoreMs);
    assert.equal(f.runtime.grantVigorByAmount(-1), 0);
}

{
    const f = createRuntime(ceiling + 2, 1000);
    assert.equal(f.runtime.updateVigor(), ceiling, 'existing over-cap normalization is preserved');
    assert.equal(f.values.get('pdd.vigor'), String(ceiling));
    assert.equal(f.values.get('pdd.vigorTime'), '0');
}

{
    const f = createRuntime(0, 1000);
    assert.equal(f.runtime.costVigorForLevel(1, 'main'), true);
    assert.equal(f.runtime.costVigorForLevel(2, 'main'), true);
    assert.equal(f.reads.length, 0, 'tutorial free-entry policy remains independent of vigor');
    assert.equal(f.runtime.costVigorForLevel(3, 'main'), false);
}

{
    const f = createRuntime(4, restoreMs);
    f.runtime._recoverVigorStatusLbl = { node: { isValid: true }, string: '' };
    f.runtime._recoverVigorCountLbl = { node: { isValid: true }, string: '' };
    f.runtime.refreshVigorUI();
    assert.equal(f.runtime._recoverVigorStatusLbl.string, '05:00 后恢复1体力');
    assert.equal(f.runtime._recoverVigorCountLbl.string, '4');
    assert.equal(f.reads.filter(key => key === 'pdd.vigor').length, 1,
        'recover modal receives the same count rather than re-reading it');
    f.values.set('pdd.vigor', '6');
    f.runtime.refreshRecoverVigorModalUI();
    assert.equal(f.runtime._recoverVigorCountLbl.string, '6',
        'standalone modal refresh still reads current storage');
    f.values.set('pdd.vigor', String(ceiling));
    f.runtime.refreshRecoverVigorModalUI();
    assert.equal(f.runtime._recoverVigorStatusLbl.string, '体力已满');
    assert.equal(f.runtime._recoverVigorCountLbl.string, String(ceiling));
    f.runtime.clearRecoverVigorModalRuntimeState();
    assert.equal(f.runtime._recoverVigorCountLbl, null, 'closing must release the added heart count label');
}

for (const reward of [3, 5]) {
    const f = createRuntime(2, restoreMs);
    assert.equal(f.runtime.grantVigorByAmount(reward), reward);
    assert.equal(f.values.get('pdd.vigor'), String(2 + reward));
    f.values.set('pdd.vigor', String(ceiling - 1));
    assert.equal(f.runtime.grantVigorByAmount(reward), 1, 'share/video rewards stop at the existing cap');
    assert.equal(f.runtime.grantVigorByAmount(reward), 0, 'full vigor cannot receive another reward');
}

{
    const f = createRuntime(4, restoreMs);
    f.runtime._vigorCountLbl = { string: '' };
    f.runtime.refreshVigorUI();
    f.values.set('pdd.vigor', '7');
    f.values.set('pdd.vigorTime', String(f.now() + restoreMs));
    f.runtime.refreshVigorUI();
    assert.equal(f.runtime._vigorCountLbl.string, '7',
        'an event refresh immediately observes a cloud-restored value, without stale long-lived caching');
}

{
    const f = createRuntime(2, restoreMs);
    const file = 'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts';
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    let method;
    function visit(node) {
        if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'handleGameShowLifecycle') method = node;
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(method);
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule('export class Lifecycle {' + method.getText(ast) + '}', {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { module, exports: module.exports });
    f.runtime._vigorCountLbl = { string: '' };
    f.advance(restoreMs * 2);
    module.exports.Lifecycle.prototype.handleGameShowLifecycle.call(f.runtime);
    assert.equal(f.runtime._vigorCountLbl.string, '4', 'foreground return recovers immediately without waiting for a tick');
    assert.equal(f.runtime._gameForeground, true);
}

{
    const f = createRuntime();
    f.runtime.vigorTick(3.4);
    assert.equal(f.reads.length, 2, 'a long frame refreshes the current state once rather than replaying every elapsed tick');
    f.runtime.vigorTick(0.7);
    assert.equal(f.reads.length, 4, 'fractional elapsed time is preserved for the next refresh');
}

{
    const f = createRuntime();
    assert.equal(f.runtime.getRecoverVigorShareRemaining(), 3);
    for (let remaining = 2; remaining >= 0; remaining--) {
        f.runtime.recordRecoverVigorShareGrant();
        assert.equal(f.runtime.getRecoverVigorShareRemaining(), remaining);
    }
    f.runtime.recordRecoverVigorShareGrant();
    assert.equal(f.runtime.canRecoverVigorByShare(), false, 'daily limit remains three successful claims');
    f.advance(24 * 60 * 60 * 1000);
    assert.equal(f.runtime.getRecoverVigorShareRemaining(), 3, 'share quota resets on the next day');
}

function purchaseFixture(vigor, gold, shares = 3) {
    const f = createRuntime(vigor, vigor < ceiling ? restoreMs : 0);
    f.values.set('pdd.gold', String(gold));
    for (let i = 0; i < shares; i++) f.runtime.recordRecoverVigorShareGrant();
    f.clearCounts();
    return f;
}

{
    const f = purchaseFixture(2, 900);
    assert.equal(f.runtime.buyRecoverVigorWithGold(), 3);
    assert.equal(f.runtime.getGold(), 600);
    assert.equal(f.runtime.getVigor(), 5);
    assert.equal(f.runtime.getRecoverVigorShareRemaining(), 0, 'buying cannot replenish daily shares');
    f.advance(24 * 60 * 60 * 1000);
    const balance = f.runtime.getGold();
    assert.equal(f.runtime.canRecoverVigorByShare(), true);
    assert.equal(f.runtime.buyRecoverVigorWithGold(), 0, 'next day must restore share mode');
    assert.equal(f.runtime.getGold(), balance);
}
{
    const f = purchaseFixture(9, 300);
    assert.equal(f.runtime.buyRecoverVigorWithGold(), 1, 'purchase honors the existing vigor cap');
    assert.equal(f.runtime.getVigor(), 10);
    assert.equal(f.runtime.getGold(), 0, 'fixed displayed price is charged once');
    assert.equal(f.runtime.getVigorTime(), 0);
}
for (const [vigor, gold, shares, toast] of [[2, 299, 3, '金币不足'], [10, 600, 3, '体力已经满了'], [2, 600, 2, undefined]]) {
    const f = purchaseFixture(vigor, gold, shares);
    assert.equal(f.runtime.buyRecoverVigorWithGold(), 0);
    assert.equal(f.runtime.getGold(), gold);
    assert.equal(f.runtime.getVigor(), vigor);
    assert.equal(f.runtime.toasts.at(-1), toast);
    assert.equal(f.writes.length, 0, 'rejected purchase must not spend gold or alter vigor');
}
for (const failure of ['no-grant', 'partial-error']) {
    const f = purchaseFixture(2, 600);
    const deadline = f.runtime.getVigorTime();
    f.runtime.grantVigorByAmount = () => {
        if (failure === 'partial-error') { f.runtime.setVigor(5); throw new Error('injected grant failure'); }
        return 0;
    };
    assert.throws(() => f.runtime.buyRecoverVigorWithGold(), /grant/);
    assert.equal(f.runtime.getGold(), 600, 'failed grant refunds the deduction');
    assert.equal(f.runtime.getVigor(), 2, 'failed grant restores vigor even after a partial write');
    assert.equal(f.runtime.getVigorTime(), deadline);
    assert.equal(f.runtime.toasts.at(-1), '体力购买失败，请重试');
}

for (const initial of [0, 4, ceiling]) {
    const f = createRuntime(initial, restoreMs, true);
    for (const mode of ['main', 'theme', 'collection_replay']) {
        for (const level of [1, 25, 600]) {
            assert.equal(f.runtime.isTutorialVigorFreeLevel(level, mode), true);
            assert.equal(f.runtime.costVigorForLevel(level, mode), true);
        }
    }
    assert.equal(f.runtime.costVigor(), true);
    assert.equal(f.writes.length, 0, 'creator entry never spends or fabricates stored vigor');
    assert.equal(f.runtime.getVigor(), initial);
    f.runtime._vigorCountLbl = { string: '' };
    f.runtime._vigorTimeLbl = { string: '' };
    f.runtime.refreshVigorUI();
    assert.equal(f.runtime._vigorCountLbl.string, String(initial));
    assert.equal(f.runtime._vigorTimeLbl.string, initial >= ceiling ? '体力已满' : '05:00');
    let opened = 0;
    f.runtime.openRecoverVigorPrefabModal = () => opened++;
    f.runtime.showNoLivesAdModal({ source: 'home_hud' });
    assert.equal(opened, 1, 'the original stamina panel remains accessible');
    assert.equal(f.runtime.toasts.length, 0, 'no creator-only unlimited-stamina message');
}

console.log('vigor-refresh.test.js passed');
