'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'assets/Scripts/Core/GameplaySkillUiController.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
});
assert.equal(
    (compiled.diagnostics || []).length,
    0,
    (compiled.diagnostics || []).map((item) => item.messageText).join('\n'),
);

class FakeButton {}
FakeButton.EventType = { CLICK: 'click' };
class FakeUIOpacity {}
class FakeWidget {}

const audioEvents = [];
const loadedModule = { exports: {} };
const load = new Function('module', 'exports', 'require', compiled.outputText);
load(loadedModule, loadedModule.exports, (request) => {
    if (request === './SlotOnboardingPolicy') {
        return {
            isGameplaySkillUnlocked: () => true,
            shouldShowGameplaySkillArea: () => true,
        };
    }
    if (request === './GameCtrlShared') {
        return new Proxy({
            AudioMgr: { inst: { play: (name) => audioEvents.push(name) } },
            Button: FakeButton,
            UIOpacity: FakeUIOpacity,
            Widget: FakeWidget,
            SKILL_UNLOCK_MAGNET: 1,
            SKILL_UNLOCK_BROOM: 1,
            SKILL_UNLOCK_FREEZE: 1,
            LS_SKILL_MAGNET_USED: 'magnet-used',
            LS_SKILL_BROOM_USED: 'brush-used',
            LS_SKILL_FREEZE_USED: 'freeze-used',
        }, {
            get(target, key) {
                if (key in target) return target[key];
                return class RuntimeStub {};
            },
        });
    }
    throw new Error(`unexpected skill UI dependency: ${request}`);
});

function createSkillShell(name) {
    const button = { enabled: false };
    const opacity = { opacity: 255 };
    const widget = {};
    const listeners = new Map();
    return {
        name,
        isValid: true,
        active: true,
        button,
        getComponent(type) {
            if (type === FakeButton) return button;
            if (type === FakeUIOpacity) return opacity;
            if (type === FakeWidget) return widget;
            return null;
        },
        addComponent(type) {
            if (type === FakeButton) return button;
            if (type === FakeUIOpacity) return opacity;
            return null;
        },
        targetOff() {
            listeners.clear();
        },
        on(eventName, handler, target) {
            listeners.set(eventName, () => handler.call(target));
        },
        emit(eventName) {
            const handler = listeners.get(eventName);
            assert.ok(handler, `${name} must register ${eventName}`);
            handler();
        },
    };
}

const shells = new Map([
    ['SkillMagnet', createSkillShell('SkillMagnet')],
    ['SkillBrush', createSkillShell('SkillBrush')],
    ['SkillFreeze', createSkillShell('SkillFreeze')],
]);
const root = {
    getChildByName(name) { return shells.get(name) || null; },
};
const inventory = new Map([
    ['magnet', 0],
    ['brush', 0],
    ['freeze', 0],
]);
const acquireOptions = new Map();
const freezeCalls = [];
let assistedCount = 0;
const runtime = {
    levelData: {},
    isGameEnd: false,
    _guideStep: -1,
    _skillActive: false,
    _adShowing: false,
    _rewardedGrantTransaction: null,
    _activeGameplayEntryMode: 'main',
    _pchConveyorGameplayController: {
        isActive: () => true,
        isSkillBusy: () => true,
    },
    getActiveLogicalLevelId: () => 12,
    getPropCount: (kind) => inventory.get(kind) || 0,
    addPropCount(kind, count) {
        inventory.set(kind, this.getPropCount(kind) + count);
    },
    requireUiChild: (parent, name) => parent.getChildByName(name),
    slotHasBeans: () => false,
    pauseTimerForProp: () => 'resource-acquire:test',
    resumeTimerForProp() {},
    showToast() {},
    tryUseAdRewardFreezeRescue: () => false,
    markAdRewardFreezeEntryClicked() {},
    markDynamicCountdownAssisted() { assistedCount += 1; },
    openToolAcquirePanel(kind, options) {
        acquireOptions.set(kind, options);
        return true;
    },
    useSkillClearColor() {
        assert.fail('zero-inventory magnet must not activate before its acquired inventory is clicked');
    },
    useSkillClearSlot() {
        assert.fail('zero-inventory brush must not activate before its acquired inventory is clicked');
    },
    useSkillFreeze(timerAlreadyPaused) {
        freezeCalls.push(timerAlreadyPaused);
        this._skillActive = true;
    },
};

const controller = new loadedModule.exports.GameplaySkillUiController(runtime);
controller.configureSkillShell = () => {};
controller.updateCountBadge = () => {};
controller.applySkillRuntimeAvailability = (shell, available) => {
    shell.button.enabled = available;
};
controller.buildSkillButtons(root);

for (const shell of shells.values()) {
    assert.equal(shell.button.enabled, true, `${shell.name} zero-inventory acquire entry must remain clickable during opening busy state`);
}

shells.get('SkillMagnet').emit(FakeButton.EventType.CLICK);
shells.get('SkillBrush').emit(FakeButton.EventType.CLICK);
shells.get('SkillFreeze').emit(FakeButton.EventType.CLICK);
assert.equal(typeof acquireOptions.get('magnet').onAdGrant, 'undefined', 'magnet ad must use the default inventory grant');
assert.equal(typeof acquireOptions.get('brush').onAdGrant, 'undefined', 'brush ad must use the default inventory grant even when the conveyor is empty');
assert.equal(typeof acquireOptions.get('freeze').onAdGrant, 'function', 'freeze ad must provide an immediate-use grant');

function completeRewardedAd(kind) {
    const options = acquireOptions.get(kind);
    if (options.onAdGrant) return options.onAdGrant();
    runtime.addPropCount(kind, 1);
    return true;
}

assert.equal(completeRewardedAd('magnet'), true);
assert.equal(completeRewardedAd('brush'), true);
assert.equal(inventory.get('magnet'), 1, 'magnet ad must add one item to inventory');
assert.equal(inventory.get('brush'), 1, 'brush ad must add one item to inventory');
assert.equal(completeRewardedAd('freeze'), true, 'freeze ad must report success after immediate activation');
assert.equal(inventory.get('freeze'), 0, 'freeze ad must not add an item that requires a second click');
assert.deepEqual(freezeCalls, [true], 'freeze ad must activate immediately with the acquire timer already paused');
assert.equal(assistedCount, 1, 'immediate rewarded freeze must mark the run as assisted');
assert.equal(audioEvents.length, 3, 'each acquire entry click must keep the normal button feedback');

console.log('gameplay-skill-prestart-acquire.test.js passed');
