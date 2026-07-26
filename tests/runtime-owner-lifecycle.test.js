const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/GuideLeaderboardModule.ts'),
    'utf8',
);
const output = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;

const BlockInputEvents = Symbol('BlockInputEvents');
const traceEvents = [];
const moduleRef = { exports: {} };
vm.runInNewContext(output, {
    module: moduleRef,
    exports: moduleRef.exports,
    require(id) {
        if (id === '../GameCtrlShared') {
            return new Proxy({
                BlockInputEvents,
            }, {
                get(target, key) {
                    if (key in target) return target[key];
                    return class RuntimeStub {};
                },
            });
        }
        if (id === '../Panels/LeaderboardPanelController') {
            return { ensureLeaderboardPanelController: () => ({}) };
        }
        if (id === '../MiniGamePlatform') {
            return { getWeChatMiniGameRuntime: () => null };
        }
        if (id === '../ToastService') {
            return {
                ToastService: class ToastService {
                    static show(_runtime, text) {
                        recoveryEvents.push(`toast:${text}`);
                    }
                },
            };
        }
        if (id === '../DebugPerfTrace') {
            return { debugPerfTrace: (event, data) => traceEvents.push({ event, data }) };
        }
        throw new Error(`unexpected require: ${id}`);
    },
    console,
    Date,
    Map,
    Set,
}, { filename: 'GuideLeaderboardModule.ts' });

const popupRoot = { children: [] };
const screenRoot = {
    getChildByName(name) {
        return name === 'PopupRoot' ? popupRoot : null;
    },
};
const canvas = {
    getChildByName(name) {
        if (name === 'ScreenRoot') return screenRoot;
        if (name === 'PopupRoot') return popupRoot;
        return null;
    },
};
const recoveryEvents = [];
const runtime = {
    node: {
        scene: {
            getChildByName(name) {
                return name === 'Canvas' ? canvas : null;
            },
        },
    },
    _runtimeOwnerSeq: 0,
    _runtimeOwners: new Map(),
    _runtimeOwnerMeta: new Map(),
    _modalFocusRefs: 0,
    _placementVisualRefs: 1,
    _placementOperationWatchdogs: new Map(),
    _flyingTargets: new Set(),
    _hiddenSlotIndices: new Set(),
    _timerPauseRefs: 2,
    _timerLockedForProp: true,
    _skillActive: false,
    _skillTimerPauseToken: '',
    recoverExpiredPlacementOperationsAfterForeground() {
        recoveryEvents.push('placement-watchdog-audit');
    },
    recoverSkillUsageAfterForeground() {
        recoveryEvents.push('skill-watchdog-audit');
    },
    showToast(text) {
        recoveryEvents.push(`toast:${text}`);
    },
};
moduleRef.exports.installGuideLeaderboardModule(runtime);

const settingsTimer = runtime.acquireRuntimeOwner('timer', 'settings');
const skillTimer = runtime.acquireRuntimeOwner('timer', 'skill-prop');
runtime._skillTimerPauseToken = skillTimer;
runtime.acquireRuntimeOwner('placement', 'fly-place');
const diagnostics = runtime.getRuntimeOwnerDiagnostics();
assert.strictEqual(diagnostics.length, 3);
assert.ok(diagnostics.every((entry) => entry.token && entry.startedAt > 0 && entry.ageMs >= 0));

let rewardCancelReason = '';
runtime._rewardedGrantTransaction = {
    phase: 'grant',
    deadlineAt: Date.now() - 1,
    cancel(reason) {
        rewardCancelReason = reason;
    },
};
runtime.auditRuntimeOwnersAfterForeground();

assert.deepStrictEqual(recoveryEvents, [
    'placement-watchdog-audit',
    'skill-watchdog-audit',
    'toast:奖励处理超时，请稍后查看到账结果',
]);
assert.strictEqual(rewardCancelReason, 'foreground-stage-timeout');
assert.strictEqual(runtime.getRuntimeOwnerCount('placement'), 0);
assert.strictEqual(runtime._placementVisualRefs, 0);
assert.strictEqual(runtime.getRuntimeOwnerCount('timer'), 0);
assert.strictEqual(runtime._timerPauseRefs, 0);
assert.strictEqual(runtime._timerLockedForProp, false);
assert.strictEqual(runtime._skillTimerPauseToken, '');
assert.strictEqual(runtime._runtimeOwnerMeta.size, 0);
assert.ok(
    traceEvents.some((entry) => entry.event === 'timer.owner.foreground.recovered'
        && (entry.data.token === settingsTimer || entry.data.token === skillTimer)),
);

const modalToken = runtime.acquireRuntimeOwner('modal', 'settings');
assert.strictEqual(runtime.releaseRuntimeOwner(modalToken), true);
assert.strictEqual(runtime._runtimeOwnerMeta.has(modalToken), false);

console.log('runtime-owner-lifecycle.test.js passed');
