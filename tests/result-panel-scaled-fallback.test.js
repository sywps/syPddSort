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
    const button = { enabled: true, interactable: true };
    const triggerNode = {
        getComponent(type) {
            if (type === UITransform) {
                return {
                    getBoundingBoxToWorld: () => ({ contains: (point) => point.x === 100 && point.y === 200 }),
                };
            }
            if (type === Button) return button;
            return null;
        },
    };
    const overlay = {
        isValid: true,
        activeInHierarchy: true,
        on(type, listener) {
            assert.strictEqual(type, Node.EventType.TOUCH_END);
            listeners.push(listener);
        },
    };
    const runtime = {
        bindCalls: 0,
        bindPanelButton() {
            this.bindCalls += 1;
        },
        normalizeGameplayUiPosition: () => ({ x: 100, y: 200 }),
        scheduleOnce(callback) {
            callback();
        },
    };
    return { runtime, triggerNode, overlay, listeners, button };
}

const Controller = loadController();
const fixture = createFixture();
const controller = new Controller(fixture.runtime);
let firstCalls = 0;
let latestCalls = 0;

controller.bindPanelButtonWithScaledFallback(fixture.triggerNode, fixture.overlay, () => {
    firstCalls += 1;
});
controller.bindPanelButtonWithScaledFallback(fixture.triggerNode, fixture.overlay, () => {
    latestCalls += 1;
});

assert.strictEqual(fixture.runtime.bindCalls, 2, 'normal Button binding must refresh on each bind');
assert.strictEqual(fixture.listeners.length, 1, 'scaled overlay fallback must not accumulate listeners');

const event = {
    propagationStopped: false,
    getUILocation: () => ({ x: 10, y: 20 }),
};
fixture.listeners[0](event);
assert.strictEqual(event.propagationStopped, true, 'scaled fallback must consume a matched touch');
assert.strictEqual(firstCalls, 0, 'a refreshed binding must not dispatch its stale handler');
assert.strictEqual(latestCalls, 1, 'scaled fallback must dispatch the latest handler');

fixture.button.interactable = false;
fixture.listeners[0]({
    propagationStopped: false,
    getUILocation: () => ({ x: 10, y: 20 }),
});
assert.strictEqual(latestCalls, 1, 'disabled result buttons must not dispatch through the fallback');

fixture.button.interactable = true;
fixture.runtime.normalizeGameplayUiPosition = (raw) => raw;
fixture.listeners[0]({
    propagationStopped: false,
    getUILocation: () => ({ x: 100, y: 200 }),
});
assert.strictEqual(latestCalls, 1, 'native-size coordinates must stay on the normal Button path');

const crossListeners = [];
const nativeHandlers = new Map();
const crossOverlay = {
    isValid: true,
    activeInHierarchy: true,
    on(type, listener) {
        assert.strictEqual(type, Node.EventType.TOUCH_END);
        crossListeners.push(listener);
    },
};
function makeCrossButtonNode(contains) {
    const buttonState = { enabled: true, interactable: true };
    return {
        isValid: true,
        parent: crossOverlay,
        getComponent(type) {
            if (type === UITransform) {
                return { getBoundingBoxToWorld: () => ({ contains }) };
            }
            if (type === Button) return buttonState;
            return null;
        },
    };
}
const continueNode = makeCrossButtonNode(() => false);
const closeNode = makeCrossButtonNode((point) => point.x === 900 && point.y === 900);
const crossRuntime = {
    bindPanelButton(node, handler) {
        nativeHandlers.set(node, handler);
    },
    normalizeGameplayUiPosition: () => ({ x: 900, y: 900 }),
    scheduleOnce(callback) {
        callback();
    },
};
const crossController = new Controller(crossRuntime);
let rewardedAdStarts = 0;
let failurePanelShows = 0;
crossController.bindPanelButtonWithScaledFallback(continueNode, crossOverlay, () => {
    rewardedAdStarts += 1;
});
crossController.bindPanelButtonWithScaledFallback(closeNode, crossOverlay, () => {
    failurePanelShows += 1;
});

const reviveTouch = {
    propagationStopped: false,
    target: continueNode,
    getUILocation: () => ({ x: 10, y: 20 }),
};
for (const listener of crossListeners) listener(reviveTouch);
if (!reviveTouch.propagationStopped) nativeHandlers.get(continueNode)();
assert.strictEqual(rewardedAdStarts, 1, 'a native ContinueBtn touch must start the rewarded ad exactly once');
assert.strictEqual(failurePanelShows, 0, 'the close fallback must not steal a native ContinueBtn touch');

const scaledCloseTouch = {
    propagationStopped: false,
    target: crossOverlay,
    getUILocation: () => ({ x: 10, y: 20 }),
};
for (const listener of crossListeners) listener(scaledCloseTouch);
assert.strictEqual(scaledCloseTouch.propagationStopped, true, 'a scaled miss without a native button target must still be consumed');
assert.strictEqual(failurePanelShows, 1, 'the scaled close fallback must remain available when native hit testing misses');

let bufferCapacity = 60;
let continueAfterBufferFullCalls = 0;
const pchController = {
    getBufferCapacity: () => bufferCapacity,
    continueAfterBufferFull() {
        continueAfterBufferFullCalls += 1;
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
const makeLabel = () => ({
    string: '',
    fontSize: 0,
    lineHeight: 0,
    enableWrapText: false,
    overflow: null,
    node: {
        active: true,
        getComponent(type) {
            return type === UITransform ? { setContentSize() {} } : null;
        },
    },
});
const labels = new Map([
    ['快完成啦', makeLabel()],
    ['加时继续游戏', makeLabel()],
    ['120秒', makeLabel()],
    ['+120秒', makeLabel()],
]);
const bufferHandlers = new Map();
const rewardedAttempts = [];
const pendingGrants = [];
let losePanelCalls = 0;
const bufferRuntime = {
    _adShowing: false,
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
};
const bufferController = new BufferController(bufferRuntime);
bufferController.instantiateGameplayOverlay = () => bufferOverlay;
bufferController.syncResultProgressWidget = () => {};
bufferController.requireLabelWithText = (_root, expectedText) => labels.get(expectedText);
bufferController.drawBufferFullConveyorIllustration = () => {};
bufferController.bindPanelButtonWithScaledFallback = (node, _overlay, handler) => {
    bufferHandlers.set(node, handler);
};

assert.strictEqual(bufferController.createBufferFullSettlementPanel(), bufferOverlay);
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
runBufferClose();
assert.strictEqual(bufferOverlay.active, false, 'the explicit close action must close the revive panel');
assert.strictEqual(losePanelCalls, 1, 'only the explicit close action may enter the final failure panel');

console.log('result-panel-scaled-fallback.test.js passed');
