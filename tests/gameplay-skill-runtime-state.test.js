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
class FakeLabel {}
class FakeSprite {}
class FakeUIOpacity {}
class FakeColor {
    constructor(r = 255, g = 255, b = 255, a = 255) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}

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
            Button: FakeButton,
            Color: FakeColor,
            Label: FakeLabel,
            Sprite: FakeSprite,
            UIOpacity: FakeUIOpacity,
            SKILL_UNLOCK_MAGNET: 1,
            SKILL_UNLOCK_BROOM: 1,
            SKILL_UNLOCK_FREEZE: 1,
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
    const button = { enabled: true };
    const opacity = { opacity: 255 };
    const sprite = { color: new FakeColor(210, 180, 150, 255), grayscale: false };
    return {
        name,
        isValid: true,
        active: true,
        children: [],
        button,
        getChildByName() { return null; },
        getComponent(type) {
            if (type === FakeButton) return button;
            if (type === FakeUIOpacity) return opacity;
            if (type === FakeSprite) return sprite;
            return null;
        },
        addComponent(type) {
            if (type === FakeUIOpacity) return opacity;
            return null;
        },
    };
}

const shells = new Map([
    ['SkillMagnet', createSkillShell('SkillMagnet')],
    ['SkillBrush', createSkillShell('SkillBrush')],
    ['SkillFreeze', createSkillShell('SkillFreeze')],
]);
const root = {
    isValid: true,
    getChildByName(name) { return shells.get(name) || null; },
};
let skillBusy = true;
let bufferHasBeans = true;
let inventoryCount = 1;
let assistedCount = 0;
const freezeCalls = [];
const runtime = {
    levelData: {},
    isGameEnd: false,
    _guideStep: -1,
    _skillActive: false,
    _activeGameplayEntryMode: 'main',
    _pchConveyorGameplayController: {
        isActive: () => true,
        isSkillBusy: () => skillBusy,
    },
    getGameplayBottomHudChild: () => root,
    getActiveLogicalLevelId: () => 12,
    getPropCount: () => inventoryCount,
    slotHasBeans: () => bufferHasBeans,
    isPlacementVisualBusy: () => false,
    pauseTimerForFinalSecondProp: () => false,
    markDynamicCountdownAssisted() { assistedCount += 1; },
    useSkillFreeze(timerAlreadyPaused) {
        freezeCalls.push(timerAlreadyPaused);
        this._skillActive = true;
    },
};
const controller = new loadedModule.exports.GameplaySkillUiController(runtime);

controller.syncSkillButtonRuntimeStates();
for (const shell of shells.values()) {
    assert.equal(shell.button.enabled, false, `${shell.name} must be disabled while a skill is applying`);
    assert.deepEqual(
        shell.getComponent(FakeSprite).color,
        new FakeColor(210, 180, 150, 255),
        `${shell.name} must keep its normal color while beans are flying`,
    );
}

skillBusy = false;
controller.syncSkillButtonRuntimeStates();
for (const shell of shells.values()) {
    assert.equal(shell.button.enabled, true, `${shell.name} must be restored after the skill lock is released`);
}

bufferHasBeans = false;
controller.syncSkillButtonRuntimeStates();
assert.equal(shells.get('SkillMagnet').button.enabled, true, 'clear-color must remain available without buffered beans');
assert.equal(shells.get('SkillFreeze').button.enabled, true, 'freeze must remain available without buffered beans');
assert.equal(shells.get('SkillBrush').button.enabled, false, 'clear-buffer must disable only when the conveyor is empty');
assert.deepEqual(
    shells.get('SkillBrush').getComponent(FakeSprite).color,
    new FakeColor(143, 122, 102, 255),
    'clear-buffer may still dim when its own empty-buffer precondition fails',
);

inventoryCount = 0;
skillBusy = true;
controller.syncSkillButtonRuntimeStates();
for (const shell of shells.values()) {
    assert.equal(shell.button.enabled, true, `${shell.name} acquire entry must stay enabled during opening busy state`);
}
assert.deepEqual(
    shells.get('SkillBrush').getComponent(FakeSprite).color,
    new FakeColor(210, 180, 150, 255),
    'zero-inventory brush acquire entry must not inherit the empty-conveyor disabled visual',
);

runtime._skillActive = false;
const freezeGrant = controller.useFreezeFromAdGrant();
assert.equal(freezeGrant, true, 'rewarded freeze must report success after activating immediately');
assert.deepEqual(freezeCalls, [true], 'rewarded freeze must start with the acquire-panel timer already paused');
assert.equal(assistedCount, 1, 'rewarded freeze must mark the run as assisted');
assert.equal(controller.useFreezeFromAdGrant(), false, 'rewarded freeze must reject a duplicate activation');
assert.deepEqual(freezeCalls, [true], 'duplicate rewarded freeze must not invoke the skill twice');

console.log('gameplay-skill-runtime-state.test.js passed');
