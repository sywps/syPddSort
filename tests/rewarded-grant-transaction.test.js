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

function loadInstaller(timerApi = {}, adApi = {}) {
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../GameCtrlShared') {
                return {
                    AdConfig: {
                        cancelRewardedAdInteraction: adApi.cancelRewardedAdInteraction || (() => false),
                    },
                    PerformanceMgr: { inst: { markUserActivity() {} } },
                };
            }
            if (id === '../AppRoot') return { AppRoot: {} };
            if (id === '../GameplayResultPanelController') {
                return { ensureGameplayResultPanelController: () => ({}) };
            }
            if (id === '../PixelPosterPreviewRenderer') {
                return { releasePixelPosterPreviewTree() {} };
            }
            if (id === '../RuntimeLog') return { runtimeLog() {} };
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        setTimeout: timerApi.setTimeout || setTimeout,
        clearTimeout: timerApi.clearTimeout || clearTimeout,
    };
    vm.runInNewContext(transpile('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts'), sandbox, {
        filename: 'HomeAdFlowModule.ts',
    });
    return module.exports.installHomeAdFlowModule;
}

async function flushMicrotasks(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) {
        await Promise.resolve();
    }
}

async function main() {
    const installHomeAdFlowModule = loadInstaller();

    const failureEvents = [];
    const failureRuntime = {
        _skillActive: false,
        showToast: (text) => failureEvents.push(`toast:${text}`),
    };
    installHomeAdFlowModule(failureRuntime);
    failureRuntime.showTrackedRewardedAd = (_page, onComplete) => onComplete(false);
    assert.strictEqual(failureRuntime.runRewardedGrant('unlock_slot_row', () => {
        failureEvents.push('grant');
        return true;
    }, {
        busyFlag: '_skillActive',
        adFailToast: '广告未完成',
        onAdFail: () => failureEvents.push('ad-fail'),
        onFinally: () => failureEvents.push('finally'),
    }), true);
    assert.deepStrictEqual(
        failureEvents,
        ['toast:广告未完成', 'ad-fail', 'finally'],
        'a failed or early-closed ad must never invoke the slot grant',
    );
    assert.strictEqual(failureRuntime._skillActive, false, 'failure must release the busy flag');

    const noopEvents = [];
    const noopRuntime = {
        _skillActive: false,
        showToast: (text) => noopEvents.push(`toast:${text}`),
    };
    installHomeAdFlowModule(noopRuntime);
    noopRuntime.showTrackedRewardedAd = (_page, onComplete) => onComplete(true);
    assert.strictEqual(noopRuntime.runRewardedGrant('unlock_slot_row', () => {
        noopEvents.push('grant');
        return false;
    }, {
        busyFlag: '_skillActive',
        grantFailToast: '暂存槽增加失败，请重试',
        onFinally: () => noopEvents.push('finally'),
    }), true);
    await flushMicrotasks();
    assert.deepStrictEqual(
        noopEvents,
        ['grant', 'toast:暂存槽增加失败，请重试', 'finally'],
        'an ad success followed by a no-op grant must be reported as grant failure',
    );
    assert.strictEqual(noopRuntime._skillActive, false, 'no-op grant finalization must release the busy flag');

    const cancelledEvents = [];
    let delayedAdComplete = null;
    const cancelledRuntime = {
        _skillActive: false,
    };
    installHomeAdFlowModule(cancelledRuntime);
    cancelledRuntime.showTrackedRewardedAd = (_page, onComplete) => {
        delayedAdComplete = onComplete;
    };
    assert.strictEqual(cancelledRuntime.runRewardedGrant('unlock_slot_row', () => {
        cancelledEvents.push('grant');
        return true;
    }, {
        busyFlag: '_skillActive',
        onFinally: () => cancelledEvents.push('finally'),
    }), true);
    assert.strictEqual(cancelledRuntime._skillActive, true, 'pending ad must hold the busy flag');
    assert.strictEqual(cancelledRuntime.cancelRewardedGrantInteraction('gameplay-init'), true);
    assert.strictEqual(cancelledRuntime._skillActive, false, 'scene or gameplay reset must release the busy flag');
    assert.deepStrictEqual(cancelledEvents, ['finally']);

    delayedAdComplete(true);
    await flushMicrotasks();
    assert.deepStrictEqual(
        cancelledEvents,
        ['finally'],
        'a late successful callback must neither grant nor finalize twice after cancellation',
    );

    const providerCancelEvents = [];
    let providerCancelComplete = null;
    const installWithSynchronousProviderCancel = loadInstaller({}, {
        cancelRewardedAdInteraction(reason) {
            providerCancelEvents.push(`provider-cancel:${reason}`);
            providerCancelComplete(false);
            return true;
        },
    });
    const providerCancelRuntime = {
        _skillActive: false,
        showToast: (text) => providerCancelEvents.push(`toast:${text}`),
    };
    installWithSynchronousProviderCancel(providerCancelRuntime);
    providerCancelRuntime.showTrackedRewardedAd = (_page, onComplete) => {
        providerCancelComplete = onComplete;
    };
    providerCancelRuntime.runRewardedGrant('unlock_slot_row', () => {
        providerCancelEvents.push('grant');
        return true;
    }, {
        busyFlag: '_skillActive',
        adFailToast: '广告未完成',
        onAdFail: () => providerCancelEvents.push('ad-fail'),
        onFinally: () => providerCancelEvents.push('finally'),
    });
    assert.strictEqual(providerCancelRuntime.cancelRewardedGrantInteraction('scene-destroy'), true);
    assert.deepStrictEqual(
        providerCancelEvents,
        ['finally', 'provider-cancel:scene-destroy'],
        'runtime cancellation must finalize before a synchronous provider failure callback and suppress teardown-time failure UI',
    );
    assert.strictEqual(providerCancelRuntime._skillActive, false, 'provider cancellation must leave the busy flag released');

    const foregroundTimers = [];
    const installWithFakeTimers = loadInstaller({
        setTimeout(callback, delay) {
            const timer = { callback, delay, cleared: false };
            foregroundTimers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            timer.cleared = true;
        },
    });
    const foregroundEvents = [];
    let foregroundLateComplete = null;
    const foregroundRuntime = { _skillActive: false };
    installWithFakeTimers(foregroundRuntime);
    foregroundRuntime.showTrackedRewardedAd = (_page, onComplete) => {
        foregroundLateComplete = onComplete;
    };
    foregroundRuntime.runRewardedGrant('unlock_slot_row', () => {
        foregroundEvents.push('grant');
        return true;
    }, {
        busyFlag: '_skillActive',
        onFinally: () => foregroundEvents.push('finally'),
    });
    foregroundRuntime.scheduleRewardedGrantForegroundRecovery('foreground');
    const recoveryTimer = foregroundTimers.find((timer) => timer.delay === 2500 && !timer.cleared);
    assert.ok(recoveryTimer, 'foreground audit must create a bounded runtime recovery timer');
    recoveryTimer.callback();
    assert.strictEqual(foregroundRuntime._skillActive, false, 'foreground recovery must release the gameplay busy flag');
    assert.deepStrictEqual(foregroundEvents, ['finally']);

    foregroundLateComplete(true);
    await flushMicrotasks();
    assert.deepStrictEqual(foregroundEvents, ['finally'], 'foreground recovery must ignore a late verified-success callback');

    console.log('rewarded-grant-transaction.test.js passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
