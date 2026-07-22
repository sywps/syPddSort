const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function transpile(relPath) {
    const source = fs.readFileSync(path.join(root, relPath), 'utf8');
    return ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
}

function loadHomeAdFlowInstaller(analyticsEvents) {
    const module = { exports: {} };
    vm.runInNewContext(transpile('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts'), {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../GameCtrlShared') {
                return {
                    AdConfig: {},
                    AnalyticsMgr: {
                        inst: {
                            trackShareClick: (...args) => analyticsEvents.push(['click', ...args]),
                            trackShareSuccess: (...args) => analyticsEvents.push(['success', ...args]),
                        },
                    },
                    PerformanceMgr: { inst: { markUserActivity() {} } },
                };
            }
            if (id === '../AppRoot') return { AppRoot: {} };
            if (id === '../GameplayResultPanelController') return { ensureGameplayResultPanelController: () => ({}) };
            if (id === '../PixelPosterPreviewRenderer') return { releasePixelPosterPreviewTree() {} };
            if (id === '../RuntimeLog') return { runtimeLog() {} };
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        Promise,
        setTimeout,
        clearTimeout,
    }, { filename: 'HomeAdFlowModule.ts' });
    return module.exports.installHomeAdFlowModule;
}

function loadSettlementInstaller() {
    const module = { exports: {} };
    vm.runInNewContext(transpile('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts'), {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../GameCtrlShared') return {};
            if (id === '../RuntimeLog') return { runtimeWarn() {} };
            if (id === '../PixelPosterPreviewRenderer') return { renderPixelPosterPreview() {} };
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        Promise,
        setTimeout,
        clearTimeout,
    }, { filename: 'SettlementHudModule.ts' });
    return module.exports.installSettlementHudModule;
}

async function flushMicrotasks(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

async function testSettlementShareDispatchGrantsGoldExactlyOnce() {
    const analyticsEvents = [];
    const shareCalls = [];
    const events = [];
    const runtime = {
        _isThemeLevel: false,
        _winAdRewardClaimed: false,
        _pendingWinAdBonusReward: 80,
        _pendingWinGoldReward: 20,
        _adShowing: false,
        _settlementNextTransitioning: false,
        _winBonusRewardGateMode: 'share',
        panelWin: null,
        gold: 20,
        getActiveLogicalLevelId: () => 12,
        getWeChatRuntime: () => ({
            shareAppMessage(options) {
                shareCalls.push(options);
            },
        }),
        addGold(amount) {
            this.gold += amount;
            events.push(`gold:${amount}`);
        },
        updateWinRewardLabel(amount) {
            events.push(`label:${amount}`);
        },
        playWinSettlementGoldFlyReward(amount) {
            events.push(`fly:${amount}`);
        },
        showToast(text) {
            events.push(`toast:${text}`);
        },
    };
    loadHomeAdFlowInstaller(analyticsEvents)(runtime);
    loadSettlementInstaller()(runtime);
    runtime.updateWinRewardLabel = (amount) => events.push(`label:${amount}`);
    runtime.playWinSettlementGoldFlyReward = (amount) => events.push(`fly:${amount}`);

    runtime.claimWinAdBonusReward();
    runtime.claimWinAdBonusReward();
    assert.strictEqual(runtime._adShowing, true, 'share claim must stay busy until its grant finishes');
    assert.strictEqual(shareCalls.length, 1, 'a double tap must dispatch only one settlement share');
    assert.strictEqual(shareCalls[0].title.includes('第12关'), true);
    assert.strictEqual(shareCalls[0].query, 'level=12');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(shareCalls[0], 'success'), false, 'share must not wait for an unsupported success callback');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(shareCalls[0], 'fail'), false, 'share must not wait for an unsupported fail callback');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(shareCalls[0], 'complete'), false, 'share must not wait for an unsupported complete callback');

    await flushMicrotasks();
    assert.strictEqual(runtime.gold, 100, 'the dispatched settlement share must add the 80 bonus gold');
    assert.strictEqual(runtime._winAdRewardClaimed, true);
    assert.strictEqual(runtime._adShowing, false);
    assert.deepStrictEqual(events, ['gold:80', 'label:100', 'fly:80']);
    assert.deepStrictEqual(analyticsEvents.map((entry) => entry[0]), ['click', 'success']);

    runtime.claimWinAdBonusReward();
    await flushMicrotasks();
    assert.strictEqual(runtime.gold, 100, 'a settled claim must remain idempotent');
    assert.strictEqual(shareCalls.length, 1);
}

async function testSynchronousShareFailureDoesNotGrant() {
    const runtime = {
        _shareShowing: false,
        getActiveLogicalLevelId: () => 1,
        getWeChatRuntime: () => ({
            shareAppMessage() {
                throw new Error('share unavailable');
            },
        }),
    };
    loadHomeAdFlowInstaller([])(runtime);
    let grants = 0;
    assert.strictEqual(runtime.runShareGrant('test', () => {
        grants += 1;
    }, { busyFlag: '_shareShowing' }), false);
    await flushMicrotasks();
    assert.strictEqual(grants, 0);
    assert.strictEqual(runtime._shareShowing, false);
}

(async () => {
    await testSettlementShareDispatchGrantsGoldExactlyOnce();
    await testSynchronousShareFailureDoesNotGrant();
    console.log('reward-share-flow.test.js passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
