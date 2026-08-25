const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

class Button {}
Button.EventType = { CLICK: 'click' };

class UITransform {}

class Vec2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class Node {}
Node.EventType = { TOUCH_END: 'touch-end' };

function loadController() {
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
                    AudioMgr: { inst: {} },
                    BlockInputEvents: class {},
                    Button,
                    Bundle: class {},
                    Color: class {},
                    Graphics: class {},
                    Label: class {},
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
                return { ensurePchConveyorGameplayController: () => ({}) };
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

console.log('result-panel-scaled-fallback.test.js passed');
