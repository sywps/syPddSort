const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

class Button {}
Button.EventType = { CLICK: 'click' };

class UITransform {}

class BlockInputEvents {}

class Label {}
Label.Overflow = { SHRINK: 'shrink' };

class Vec2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class Node {}
Node.EventType = { TOUCH_END: 'touch-end' };

function loadController(pchController = {}) {
    const source = fs.readFileSync(
        path.join(root, 'assets/Scripts/Core/GameplayResultPanelController.ts'),
        'utf8',
    );
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module,
        exports: module.exports,
        require(id) {
            if (id === './GameCtrlShared') {
                return {
                    AnalyticsMgr: { inst: {} },
                    AudioMgr: { inst: { play() {} } },
                    BlockInputEvents,
                    Button,
                    Bundle: class {},
                    Color: class {},
                    Graphics: class {},
                    Label,
                    Node,
                    PerformanceMgr: { inst: {} },
                    Prefab: class {},
                    ProgressBar: class {},
                    Sprite: class {},
                    Tween: class {},
                    UIOpacity: class {},
                    UITransform,
                    Vec2,
                    Vec3: class {},
                    assetManager: {},
                    GAME_ASSETS_BUNDLE_NAME: 'gameAssets',
                    LOCAL_BOOTSTRAP_BUNDLE_NAME: 'bootstrap',
                    instantiate() {},
                    tween() {},
                };
            }
            if (id === './AppRoot') return { AppRoot: {} };
            if (id === './MiniGamePlatform') return { isMiniGameRuntime: () => false };
            if (id === './PchConveyorGameplayController') {
                return { ensurePchConveyorGameplayController: () => pchController };
            }
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        Map,
        Set,
        WeakMap,
    }, { filename: 'GameplayResultPanelController.ts' });
    return module.exports.GameplayResultPanelController;
}

function createFixture() {
    const listeners = [];
    const nativeHandlers = new Map();
    const triggerNode = {};
    const overlay = {
        on(type, listener) {
            assert.strictEqual(type, Node.EventType.TOUCH_END);
            listeners.push(listener);
        },
    };
    const runtime = {
        bindCalls: 0,
        bindPanelButton(node, handler) {
            this.bindCalls += 1;
            nativeHandlers.set(node, handler);
        },
    };
    return { runtime, triggerNode, overlay, listeners, nativeHandlers };
}

const Controller = loadController();

const textSummary = {
    getComponent(type) {
        return type === Label ? new Label() : null;
    },
};
const textProgressBox = {
    getChildByName(name) {
        return name === 'Label' ? textSummary : null;
    },
};
const textProgressPanel = {
    getChildByName(name) {
        return name === 'Box' ? textProgressBox : null;
    },
};
const textProgressController = new Controller({
    requirePanelChild(parent, name) {
        const child = parent.getChildByName(name);
        assert.ok(child, `text-progress fixture is missing ${name}`);
        return child;
    },
});
assert.doesNotThrow(
    () => textProgressController.syncResultProgressWidget(textProgressPanel, 0, true),
    'an explicitly enabled static prompt must be a valid revive-panel progress layout',
);
assert.throws(
    () => textProgressController.syncResultProgressWidget(textProgressPanel),
    /text completion summary/,
    'a generic result panel must not silently accept a missing progress bar',
);

const missingProgressPanel = {
    getChildByName(name) {
        return name === 'Box' ? { getChildByName() { return null; } } : null;
    },
};
assert.throws(
    () => textProgressController.syncResultProgressWidget(missingProgressPanel),
    /text completion summary/,
    'a revive panel with neither supported progress layout must still fail explicitly',
);

const fixture = createFixture();
const controller = new Controller(fixture.runtime);
let firstCalls = 0;
let latestCalls = 0;

controller.bindPanelButton(fixture.triggerNode, () => {
    firstCalls += 1;
});
controller.bindPanelButton(fixture.triggerNode, () => {
    latestCalls += 1;
});

assert.strictEqual(fixture.runtime.bindCalls, 2, 'normal Button binding must refresh on each bind');
assert.strictEqual(fixture.listeners.length, 0, 'direct Button binding must not install an overlay touch fallback');
fixture.nativeHandlers.get(fixture.triggerNode)();
assert.strictEqual(firstCalls, 0, 'a refreshed binding must not dispatch its stale handler');
assert.strictEqual(latestCalls, 1, 'the real Cocos Button must dispatch the latest handler');

const nativeHandlers = new Map();
const continueNode = {};
const closeNode = {};
const crossRuntime = {
    bindPanelButton(node, handler) {
        nativeHandlers.set(node, handler);
    },
};
const crossController = new Controller(crossRuntime);
let rewardedAdStarts = 0;
let failurePanelShows = 0;
crossController.bindPanelButton(continueNode, () => {
    rewardedAdStarts += 1;
});
crossController.bindPanelButton(closeNode, () => {
    failurePanelShows += 1;
});

nativeHandlers.get(continueNode)();
assert.strictEqual(rewardedAdStarts, 1, 'a native ContinueBtn touch must start the rewarded ad exactly once');
assert.strictEqual(failurePanelShows, 0, 'a ContinueBtn touch must not dispatch the separate close Button');

let bufferCapacity = 60;
let continueAfterBufferFullCalls = 0;
let grantReviveCapacityCalls = 0;
const pchController = {
    getBufferCapacity: () => bufferCapacity,
    continueAfterBufferFull() {
        continueAfterBufferFullCalls += 1;
        bufferCapacity += 12;
        return true;
    },
    grantReviveCapacity() {
        grantReviveCapacityCalls += 1;
        bufferCapacity += 12;
        return true;
    },
};
const BufferController = loadController(pchController);
const continueButton = {};
const closeButton = {};
const infoArt = {};
const boxChildren = new Map([
    ['ContinueBtn', continueButton],
    ['CloseBtn', closeButton],
    ['InfoArt', infoArt],
]);
const box = {
    getComponent(type) {
        return type === BlockInputEvents ? {} : null;
    },
    addComponent() {
        assert.fail('buffer-full Box must already block input in this fixture');
    },
    getChildByName(name) {
        return boxChildren.get(name) || null;
    },
};
const bufferOverlay = {
    active: true,
    activeInHierarchy: true,
    isValid: true,
    getChildByName(name) {
        return name === 'Box' ? box : null;
    },
};
const bufferHandlers = new Map();
const rewardedAttempts = [];
const pendingGrants = [];
let losePanelCalls = 0;
let bufferPrefabKind = null;
let bufferOverlayName = null;
const reviveCancelReasons = [];
const bufferRuntime = {
    constructor: { REWARDED_CONTINUE_SECONDS: 120 },
    _adShowing: false,
    _shareShowing: false,
    _activeLoseReason: 'buffer-full',
    requirePanelChild(parent, name) {
        const child = parent.getChildByName(name);
        assert.ok(child, `buffer-full fixture is missing ${name}`);
        return child;
    },
    getActiveLogicalLevelId: () => 5,
    runRewardedGrant(page, grant, options) {
        rewardedAttempts.push({ page, options });
        pendingGrants.push(grant);
        this._adShowing = true;
        return true;
    },
    showLosePanel() {
        losePanelCalls += 1;
    },
    cancelRewardedGrantInteraction(reason) {
        reviveCancelReasons.push(`ad:${reason}`);
        this._adShowing = false;
        return true;
    },
    cancelPendingShareReturn(reason) {
        reviveCancelReasons.push(`share:${reason}`);
        return true;
    },
};
const continuedFromLoseSeconds = [];
bufferRuntime.continueAfterLose = (seconds) => {
    continuedFromLoseSeconds.push(seconds);
};
const bufferController = new BufferController(bufferRuntime);
bufferController.instantiateGameplayOverlay = (kind, name) => {
    bufferPrefabKind = kind;
    bufferOverlayName = name;
    return bufferOverlay;
};
bufferController.syncResultProgressWidget = () => {};
bufferController.bindReviveShareButton = () => {};
bufferController.syncReviveSharePanel = () => {};
bufferController.bindPanelButton = (node, handler) => {
    bufferHandlers.set(node, handler);
};

assert.strictEqual(bufferController.createBufferFullSettlementPanel(), bufferOverlay);
assert.strictEqual(bufferPrefabKind, 'bufferFullRevive', 'buffer-full flow must instantiate its dedicated prefab');
assert.strictEqual(bufferOverlayName, 'BufferFullSettlementOverlay');
const runBufferContinue = bufferHandlers.get(continueButton);
const runBufferClose = bufferHandlers.get(closeButton);
assert.strictEqual(typeof runBufferContinue, 'function');
assert.strictEqual(typeof runBufferClose, 'function');

runBufferContinue();
runBufferContinue();
assert.strictEqual(rewardedAttempts.length, 1, 'a busy buffer-full revive must start only one rewarded ad');
assert.strictEqual(rewardedAttempts[0].page, 'pch_buffer_full_revive');
assert.strictEqual(rewardedAttempts[0].options.busyFlag, '_adShowing');
assert.strictEqual(rewardedAttempts[0].options.markLevelRevive, true);
assert.strictEqual(rewardedAttempts[0].options.adFailToast, '广告未完成，未增加位置');
assert.strictEqual(rewardedAttempts[0].options.successToast, '已增加12个位置');
assert.strictEqual(bufferCapacity, 60, 'starting or cancelling the ad must not add capacity');
assert.strictEqual(bufferOverlay.active, true, 'the revive panel must stay open while the ad is pending');
assert.strictEqual(losePanelCalls, 0, 'the revive action must not enter the failure panel');

bufferRuntime._adShowing = false;
assert.strictEqual(bufferOverlay.active, true, 'an incomplete/cancelled ad must leave the revive panel available');
runBufferContinue();
assert.strictEqual(rewardedAttempts.length, 2, 'the player must be able to retry after an incomplete ad');
assert.strictEqual(pendingGrants[1](), true, 'a verified ad must complete the buffer-full grant');
bufferRuntime._adShowing = false;
assert.strictEqual(bufferCapacity, 72, 'a verified ad must add exactly 12 capacity');
assert.strictEqual(continueAfterBufferFullCalls, 1, 'the current game must resume exactly once');
assert.strictEqual(bufferOverlay.active, false, 'the revive panel closes only after the +12 grant succeeds');
assert.strictEqual(losePanelCalls, 0, 'a successful revive must not enter the failure panel');

bufferOverlay.active = true;
bufferRuntime._adShowing = false;
runBufferContinue();
const lateBufferGrant = pendingGrants.at(-1);
assert.strictEqual(rewardedAttempts.at(-1).page, 'pch_buffer_full_revive');
runBufferClose();
assert.strictEqual(bufferOverlay.active, false, 'the explicit close action must close the revive panel');
assert.strictEqual(losePanelCalls, 1, 'only the explicit close action may enter the final failure panel');
assert.deepStrictEqual(reviveCancelReasons, ['ad:revive-panel-close', 'share:revive-panel-close']);
assert.strictEqual(lateBufferGrant(), false, 'a rewarded callback that arrives after close must not revive');
assert.strictEqual(bufferCapacity, 72, 'a late rewarded callback after close must not expand capacity');
assert.strictEqual(continueAfterBufferFullCalls, 1, 'a late rewarded callback after close must not resume the game');

const finalLoseReviveButton = {};
bufferController.bindLoseReviveContinueAction(finalLoseReviveButton, bufferOverlay);
const runFinalLoseRevive = bufferHandlers.get(finalLoseReviveButton);
assert.strictEqual(typeof runFinalLoseRevive, 'function');

const attemptsBeforeFinalBufferRevive = rewardedAttempts.length;
bufferRuntime._activeLoseReason = 'buffer-full';
bufferRuntime._adShowing = false;
bufferOverlay.active = true;
runFinalLoseRevive();
assert.strictEqual(rewardedAttempts.length, attemptsBeforeFinalBufferRevive + 1);
assert.strictEqual(rewardedAttempts.at(-1).page, 'pch_buffer_full_revive', 'a buffer-full failure page must request the expansion placement');
assert.strictEqual(bufferCapacity, 72, 'the final failure page must not expand before verified completion');
assert.strictEqual(bufferOverlay.active, true, 'the final failure page must remain visible while its ad is pending');
assert.strictEqual(pendingGrants.at(-1)(), true);
assert.strictEqual(bufferCapacity, 84, 'a verified final-page buffer revive must add exactly 12 capacity');
assert.strictEqual(continueAfterBufferFullCalls, 2, 'the final failure page must reuse the same in-game buffer recovery');
assert.deepStrictEqual(continuedFromLoseSeconds, [], 'buffer-full final revive must not use the ordinary time-only recovery');
assert.strictEqual(bufferOverlay.active, false, 'successful final-page buffer revive must close the failure page');

const attemptsBeforeFinalTimeoutRevive = rewardedAttempts.length;
bufferController.captureReviveFailure('timeout');
bufferRuntime._activeLoseReason = 'buffer-full';
bufferRuntime._adShowing = false;
bufferOverlay.active = true;
runFinalLoseRevive();
assert.strictEqual(rewardedAttempts.length, attemptsBeforeFinalTimeoutRevive + 1);
assert.strictEqual(rewardedAttempts.at(-1).page, 'level_revive', 'a frozen timeout failure page must not be rerouted by a changed global reason');
assert.strictEqual(bufferCapacity, 84, 'an incomplete timeout ad must not grant capacity');
assert.strictEqual(bufferOverlay.active, true, 'an incomplete timeout ad must keep the failure page available');
bufferRuntime._adShowing = false;
runFinalLoseRevive();
assert.strictEqual(rewardedAttempts.length, attemptsBeforeFinalTimeoutRevive + 2, 'a timeout failure page must allow a second ad attempt after cancellation');
assert.strictEqual(rewardedAttempts.at(-1).page, 'level_revive', 'a retry after cancellation must not route into buffer-full revive');
assert.strictEqual(pendingGrants.at(-1)(), true);
assert.deepStrictEqual(continuedFromLoseSeconds, [120], 'a timeout failure page must still add the configured revive time');
assert.strictEqual(bufferCapacity, 96, 'a verified timeout revive must also add exactly 12 capacity');
assert.strictEqual(grantReviveCapacityCalls, 1, 'a timeout revive must use the capacity-only grant, not the buffer-full recovery');
assert.strictEqual(continueAfterBufferFullCalls, 2, 'a timeout revive must not enter the buffer-full recovery path');
assert.strictEqual(bufferOverlay.active, false, 'successful timeout revive must close the failure page');

console.log('result-panel-scaled-fallback.test.js passed');
