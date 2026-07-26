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

function loadHomeAdFlowInstaller(analyticsEvents, timerApi = {}) {
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
        setTimeout: timerApi.setTimeout || setTimeout,
        clearTimeout: timerApi.clearTimeout || clearTimeout,
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
            if (id === 'cc') return { Widget: class Widget {} };
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

async function testSettlementRewardedAdGrantsTrueFiveTimesTotal() {
    const adCalls = [];
    const shareCalls = [];
    const events = [];
    const runtime = {
        _isThemeLevel: false,
        _winAdRewardClaimed: false,
        _pendingWinAdBonusReward: 80,
        _pendingWinGoldReward: 20,
        _adShowing: false,
        _settlementNextTransitioning: false,
        panelWin: null,
        gold: 20,
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
        runShareGrant() {
            shareCalls.push('unexpected');
        },
        runRewardedGrant(page, grant, options) {
            adCalls.push({ page, options });
            this._adShowing = true;
            Promise.resolve().then(() => {
                grant();
                this._adShowing = false;
            });
            return true;
        },
    };
    loadSettlementInstaller()(runtime);
    runtime.updateWinRewardLabel = (amount) => events.push(`label:${amount}`);
    runtime.playWinSettlementGoldFlyReward = (amount) => events.push(`fly:${amount}`);

    runtime.claimWinAdBonusReward();
    runtime.claimWinAdBonusReward();
    assert.strictEqual(runtime._adShowing, true, 'rewarded-ad claim must stay busy until its grant finishes');
    assert.strictEqual(adCalls.length, 1, 'a double tap must dispatch only one settlement rewarded ad');
    assert.strictEqual(adCalls[0].page, 'win_bonus_reward');
    assert.strictEqual(adCalls[0].options.busyFlag, '_adShowing');
    assert.strictEqual(shareCalls.length, 0, 'settlement bonus must never dispatch a share');

    await flushMicrotasks();
    assert.strictEqual(runtime.gold, 100, '20 base gold plus the 80 ad bonus must total exactly 5x');
    assert.strictEqual(runtime._winAdRewardClaimed, true);
    assert.strictEqual(runtime._adShowing, false);
    assert.deepStrictEqual(events, ['gold:80', 'label:100', 'fly:80']);

    runtime.claimWinAdBonusReward();
    await flushMicrotasks();
    assert.strictEqual(runtime.gold, 100, 'a settled claim must remain idempotent');
    assert.strictEqual(adCalls.length, 1);
    assert.strictEqual(shareCalls.length, 0);
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

async function testShareGrantDeadlineReleasesBusyAndQuarantinesLateClaim() {
    const timers = [];
    const events = [];
    const install = loadHomeAdFlowInstaller([], {
        setTimeout(callback, delay) {
            const timer = { callback, delay, cleared: false };
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cleared = true;
        },
    });
    let resolveGrant;
    let shareRequests = 0;
    const runtime = {
        _shareShowing: false,
        getActiveLogicalLevelId: () => 9,
        getWeChatRuntime: () => ({
            shareAppMessage() {
                shareRequests += 1;
            },
        }),
        showToast(text) {
            events.push(`toast:${text}`);
        },
    };
    install(runtime);
    assert.strictEqual(runtime.runShareGrant('share_reward', () => new Promise((resolve) => {
        resolveGrant = resolve;
    }), {
        claimKey: 'share-reward:9',
        busyFlag: '_shareShowing',
        grantTimeoutMs: 20,
        onFinally: () => events.push('finally'),
    }), true);
    await flushMicrotasks();
    assert.strictEqual(runtime._shareShowing, true);
    const deadline = timers.find((timer) => timer.delay === 20 && !timer.cleared);
    assert.ok(deadline, 'share grant must own a deadline');
    deadline.callback();
    assert.strictEqual(runtime._shareShowing, false, 'share timeout must release its busy flag');
    assert.deepStrictEqual(events, ['toast:奖励处理超时，请稍后查看到账结果', 'finally']);
    assert.strictEqual(runtime.runShareGrant('share_reward', () => true, {
        claimKey: 'share-reward:9',
        busyFlag: '_shareShowing',
    }), false);
    assert.strictEqual(shareRequests, 1, 'quarantined share claim must not dispatch a duplicate share');
    resolveGrant(true);
    await flushMicrotasks();
    assert.ok(!runtime._rewardedGrantTimedOutClaims.has('share:share-reward:9'));
    assert.strictEqual(events.filter((event) => event === 'finally').length, 1);
}

(async () => {
    const settlementSource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts'), 'utf8');
    const economySource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/EconomyConfig.ts'), 'utf8');
    assert.ok(!settlementSource.includes('runShareGrant(WIN_BONUS_REWARD_GATE_PAGE'), 'settlement reward must not retain a randomized share branch');
    assert.ok(!settlementSource.includes('WIN_BONUS_SHARE_'), 'settlement reward must not retain share gate constants');
    assert.ok(economySource.includes('winTotalMultiplier: 5'), 'settlement economy must declare a true total multiplier');
    assert.ok(!economySource.includes('winBonusGold'), 'settlement economy must not retain a misleading fixed bonus');

    await testSettlementRewardedAdGrantsTrueFiveTimesTotal();
    await testSynchronousShareFailureDoesNotGrant();
    await testShareGrantDeadlineReleasesBusyAndQuarantinesLateClaim();
    console.log('reward-share-flow.test.js passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
