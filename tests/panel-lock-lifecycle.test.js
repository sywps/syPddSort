const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/Panels/SettingsPanelController.ts'),
    'utf8',
);
const output = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;

class UITransform {
    constructor() {
        this.contentSize = { width: 100, height: 100 };
    }

    convertToNodeSpaceAR(value) {
        return value;
    }
}

class BlockInputEvents {
    constructor() {
        this.enabled = true;
    }
}

class Button {}
Button.EventType = { CLICK: 'click' };

class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

class FakeNode {
    constructor(name) {
        this.name = name;
        this.active = true;
        this.isValid = true;
        this.children = [];
        this.components = new Map();
        this.handlers = new Map();
    }

    addChild(child) {
        this.children.push(child);
        child.parent = this;
    }

    getChildByName(name) {
        return this.children.find((child) => child.name === name && child.isValid) || null;
    }

    getComponent(Type) {
        return this.components.get(Type) || null;
    }

    addComponent(Type) {
        const component = new Type();
        component.node = this;
        this.components.set(Type, component);
        return component;
    }

    setSiblingIndex() {}

    targetOff(target) {
        for (const [event, entries] of this.handlers.entries()) {
            this.handlers.set(event, entries.filter((entry) => entry.target !== target));
        }
    }

    on(event, handler, target) {
        const entries = this.handlers.get(event) || [];
        entries.push({ handler, target });
        this.handlers.set(event, entries);
    }

    emit(event, payload) {
        for (const entry of this.handlers.get(event) || []) {
            entry.handler(payload);
        }
    }
}
FakeNode.EventType = { TOUCH_END: 'touch-end' };

class Prefab {
    constructor(factory) {
        this.factory = factory;
        this.isValid = true;
    }
}

class Bundle {}

function createSettingsOverlay() {
    const overlay = new FakeNode('PrefabSettingsOverlay');
    const box = new FakeNode('Box');
    box.addComponent(UITransform);
    overlay.addChild(box);
    for (const name of ['XBtn', 'Home', 'Close']) {
        box.addChild(new FakeNode(name));
    }
    for (let index = 0; index < 3; index += 1) {
        const row = new FakeNode(`SettingsRow${index}`);
        const toggle = new FakeNode('ToggleWrap');
        toggle.addChild(new FakeNode('ToggleOnState'));
        toggle.addChild(new FakeNode('ToggleOffState'));
        row.addChild(toggle);
        box.addChild(row);
    }
    return overlay;
}

const fakeTimers = [];
const audio = {
    inst: {
        play() {},
        isSfxEnabled: () => true,
        setSfxEnabled() {},
        isVibrateEnabled: () => true,
        setVibrateEnabled() {},
        isBgmEnabled: () => true,
        setBgmEnabled() {},
    },
};
const moduleRef = { exports: {} };
vm.runInNewContext(output, {
    module: moduleRef,
    exports: moduleRef.exports,
    require(id) {
        if (id === '../GameCtrlShared') {
            return {
                AudioMgr: audio,
                BlockInputEvents,
                Button,
                Bundle,
                Node: FakeNode,
                Prefab,
                SETTINGS_PANEL_TEXTURE_NAMES: ['settings-texture'],
                UITransform,
                Vec3,
                instantiate(prefab) {
                    return prefab.factory();
                },
            };
        }
        if (id === '../AppRoot') {
            return {
                AppRoot: {
                    tryGet: () => null,
                    ensure() {},
                    inst: { requestHomeRoute: async () => {} },
                },
            };
        }
        throw new Error(`unexpected require: ${id}`);
    },
    console,
    setTimeout(callback, delay) {
        const timer = { callback, delay, cleared: false };
        fakeTimers.push(timer);
        return timer;
    },
    clearTimeout(timer) {
        if (timer) timer.cleared = true;
    },
    Map,
    Set,
}, { filename: 'SettingsPanelController.ts' });

const { SettingsPanelController } = moduleRef.exports;

function createBaseRuntime(events) {
    const popupRoot = new FakeNode('PopupRoot');
    return {
        isValid: true,
        popupRoot,
        _panelOpenInFlight: new Set(),
        requireCanvasUiRoot: () => popupRoot,
        _isRuntimeAliveForAsyncCallback: () => true,
        _retainPanelTextureOwner(key) {
            events.push(`retain:${key}`);
        },
        _releasePanelTextureOwner(key, reason) {
            events.push(`release-texture:${key}:${reason}`);
        },
        pauseTimerForProp(owner) {
            events.push(`pause:${owner}`);
            return `timer:1:${owner}`;
        },
        resumeTimerForProp(token) {
            events.push(`resume:${token}`);
        },
        beginModalFocus(owner) {
            events.push(`begin-modal:${owner}`);
            return `modal:1:${owner}`;
        },
        endModalFocus(token) {
            events.push(`end-modal:${token}`);
        },
        getRuntimeSceneName: () => 'Game',
        playPopupOpenAnim() {},
        _clearSpriteFramesBeforeDestroy() {
            events.push('visual-fallback-clear');
        },
        _destroyDetachedNodeNextFrame(node) {
            events.push('visual-fallback-destroy');
            node.isValid = false;
        },
    };
}

const pendingEvents = [];
let pendingPrefabCallback = null;
const pendingRuntime = createBaseRuntime(pendingEvents);
pendingRuntime._withGameAssetsBundle = (onReady) => {
    onReady({
        load(_path, _type, callback) {
            pendingPrefabCallback = callback;
        },
    });
};
const pendingController = new SettingsPanelController(pendingRuntime);
pendingController.open();
assert.strictEqual(pendingRuntime._panelOpenInFlight.has('settings-prefab'), true);
pendingController.dispose();
pendingController.dispose();
assert.strictEqual(pendingRuntime._panelOpenInFlight.has('settings-prefab'), false);
assert.strictEqual(pendingEvents.filter((event) => event.startsWith('resume:')).length, 1);
assert.ok(pendingEvents.includes('resume:timer:1:settings'));
assert.strictEqual(pendingEvents.filter((event) => event.startsWith('release-texture:')).length, 1);
pendingPrefabCallback(null, new Prefab(createSettingsOverlay));
assert.strictEqual(pendingRuntime.popupRoot.getChildByName('SettingsOverlay'), null);

const closeEvents = [];
const closeRuntime = createBaseRuntime(closeEvents);
closeRuntime._withGameAssetsBundle = (onReady) => {
    onReady({
        load(_path, _type, callback) {
            callback(null, new Prefab(createSettingsOverlay));
        },
    });
};
closeRuntime._closePanelWithTextureOwner = () => {
    closeEvents.push('visual-close');
    throw new Error('simulated visual teardown interruption');
};
const closeController = new SettingsPanelController(closeRuntime);
closeController.open();
const overlay = closeRuntime.popupRoot.getChildByName('SettingsOverlay');
assert.ok(overlay);
const xButton = overlay.getChildByName('Box').getChildByName('XBtn');
xButton.emit(Button.EventType.CLICK);
xButton.emit(Button.EventType.CLICK);
closeController.dispose();

const resumeIndex = closeEvents.indexOf('resume:timer:1:settings');
const modalIndex = closeEvents.indexOf('end-modal:modal:1:settings');
const visualIndex = closeEvents.indexOf('visual-close');
assert.ok(resumeIndex >= 0 && modalIndex >= 0 && visualIndex >= 0);
assert.ok(resumeIndex < visualIndex, 'timer owner must release before fallible visual teardown');
assert.ok(modalIndex < visualIndex, 'modal owner must release before fallible visual teardown');
assert.strictEqual(closeEvents.filter((event) => event.startsWith('resume:')).length, 1);
assert.strictEqual(closeEvents.filter((event) => event.startsWith('end-modal:')).length, 1);
assert.strictEqual(closeEvents.filter((event) => event === 'visual-close').length, 1);
assert.strictEqual(closeRuntime._panelOpenInFlight.size, 0);
assert.strictEqual(overlay.active, false);
assert.strictEqual(overlay.getComponent(BlockInputEvents).enabled, false);

console.log('panel-lock-lifecycle.test.js passed');
