const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const modulePath = 'assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts';
const prefabPath = 'assets/GameAssetsBundle/UI/Prefabs/Panels/RecoverVigorPanel.prefab';

class TestColor {
    constructor(r = 0, g = 0, b = 0, a = 255) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}

class TestLabel {}
class TestSprite {}
class TestButton {}
class TestUIOpacity {}
class TestNode {}
TestNode.EventType = { TOUCH_END: 'touch-end' };

function transpile(relativePath) {
    return ts.transpileModule(fs.readFileSync(path.join(root, relativePath), 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
}

function loadPlayerMetaStateInstaller() {
    const module = { exports: {} };
    vm.runInNewContext(transpile(modulePath), {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../GameCtrlShared') {
                return {
                    Color: TestColor,
                    Label: TestLabel,
                    Sprite: TestSprite,
                    Button: TestButton,
                    UIOpacity: TestUIOpacity,
                    Node: TestNode,
                    RECOVER_VIGOR_RELEASE_TEXTURE_NAMES: [],
                    RECOVER_VIGOR_TEXTURE_NAMES: [],
                };
            }
            if (id === '../RuntimeLog') {
                return { runtimeLog() {}, runtimeWarn() {} };
            }
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        Date,
        JSON,
        Math,
        Map,
        Promise,
        Set,
        URL,
        URLSearchParams,
        clearTimeout,
        setTimeout,
    }, { filename: 'PlayerMetaStateModule.ts' });
    return module.exports.installPlayerMetaStateModule;
}

function findUniqueNode(records, name) {
    const matches = records
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => record?.__type__ === 'cc.Node' && record._name === name);
    assert.strictEqual(matches.length, 1, `expected one prefab node named ${name}`);
    return matches[0];
}

function directChildren(records, node) {
    return (node._children || []).map((reference) => records[reference.__id__]);
}

function componentTypes(records, node) {
    return (node._components || []).map((reference) => records[reference.__id__]?.__type__);
}

function testPrefabCardSchemas() {
    const records = JSON.parse(fs.readFileSync(path.join(root, prefabPath), 'utf8'));
    const box = findUniqueNode(records, 'Box');
    const videoCard = findUniqueNode(records, 'RecoverVigorVideoCard');
    const shareCard = findUniqueNode(records, 'RecoverVigorShareCard');
    const videoChildren = directChildren(records, videoCard.record);
    const shareChildren = directChildren(records, shareCard.record);
    const requiredBaseChildren = ['VigorIcon', 'AmountLabel', 'ActionButton'];
    const videoChildNames = videoChildren.map((node) => node._name);
    const shareChildNames = shareChildren.map((node) => node._name);

    assert.strictEqual(videoCard.record._parent?.__id__, box.index);
    assert.strictEqual(shareCard.record._parent?.__id__, box.index);
    requiredBaseChildren.forEach((name) => {
        assert.ok(videoChildNames.includes(name), `video card must contain ${name}`);
        assert.ok(shareChildNames.includes(name), `share card must contain ${name}`);
    });
    assert.ok(!videoChildNames.includes('LimitLabel'), 'video card must not serialize an unused LimitLabel');
    assert.ok(shareChildNames.includes('LimitLabel'), 'share card must retain its limit label contract');

    const shareLimit = shareChildren.find((node) => node._name === 'LimitLabel');
    assert.ok(shareLimit, 'share card must own LimitLabel directly');
    assert.strictEqual(shareLimit._parent?.__id__, shareCard.index);
    const shareLimitComponentTypes = componentTypes(records, shareLimit);
    assert.ok(shareLimitComponentTypes.includes('cc.UITransform'), 'share LimitLabel must retain UITransform');
    assert.ok(shareLimitComponentTypes.includes('cc.Label'), 'share LimitLabel must retain Label');
}

function createCardRuntime(options = {}) {
    const runtime = {};
    loadPlayerMetaStateInstaller()(runtime);
    const accesses = [];
    const cards = new Map();

    runtime.ensureRecoverVigorUiNode = (parent, name) => {
        accesses.push(`${parent.name}/${name}`);
        if (parent.name === 'Box') {
            if (!cards.has(name)) cards.set(name, { name, isValid: true, active: true });
            return cards.get(name);
        }
        if (name === 'LimitLabel' && options.missingShareLimit) {
            throw new Error(`[recover-vigor-prefab] missing node: ${parent.name}/${name}`);
        }
        return { name, isValid: true, active: true };
    };
    runtime.syncRecoverVigorRoundedBg = () => {};
    runtime.syncRecoverVigorSprite = () => {};
    runtime.syncRecoverVigorButton = () => {};
    runtime.syncRecoverVigorLabel = (node, text) => ({ node, string: text });
    return { runtime, accesses };
}

function syncCard(runtime, cardName, variant) {
    return runtime.syncRecoverVigorRewardCard(
        { name: 'Box' },
        cardName,
        0,
        4,
        new TestColor(),
        new TestColor(),
        true,
        variant,
    );
}

function testVideoCardNeverRequestsLimitLabel() {
    const { runtime, accesses } = createCardRuntime();
    const result = syncCard(runtime, 'RecoverVigorVideoCard', { kind: 'video' });
    assert.strictEqual(result.limitLabel, null);
    assert.ok(
        !accesses.includes('RecoverVigorVideoCard/LimitLabel'),
        'video initialization must never access LimitLabel',
    );
}

function testShareCardRequiresLimitLabel() {
    const valid = createCardRuntime();
    const result = syncCard(valid.runtime, 'RecoverVigorShareCard', {
        kind: 'share',
        limitText: '今日剩余 3/3',
    });
    assert.ok(valid.accesses.includes('RecoverVigorShareCard/LimitLabel'));
    assert.strictEqual(result.limitLabel.string, '今日剩余 3/3');

    const missing = createCardRuntime({ missingShareLimit: true });
    assert.throws(
        () => syncCard(missing.runtime, 'RecoverVigorShareCard', {
            kind: 'share',
            limitText: '今日剩余 3/3',
        }),
        /\[recover-vigor-prefab\] missing node: RecoverVigorShareCard\/LimitLabel/,
        'share initialization must fail fast when LimitLabel is absent',
    );
}

function testActionTextStaysPrefabOwned() {
    const runtime = {};
    loadPlayerMetaStateInstaller()(runtime);
    const label = { string: '免费', color: null };
    const buttonComponent = {};
    const opacityComponent = {};
    const sprite = {};
    const actionLabel = {
        name: 'ActionLabel',
        getComponent(type) { return type === TestLabel ? label : null; },
    };
    const actionIcon = { name: 'ActionIcon' };
    const components = new Map([
        [TestSprite, sprite],
        [TestButton, buttonComponent],
        [TestUIOpacity, opacityComponent],
    ]);
    const button = {
        name: 'ActionButton',
        getComponent(type) { return components.get(type) || null; },
        addComponent(type) {
            const component = {};
            components.set(type, component);
            return component;
        },
    };
    runtime.syncRecoverVigorRoundedBg = () => {};
    runtime.ensureRecoverVigorUiNode = (_parent, name) => name === 'ActionLabel' ? actionLabel : actionIcon;

    runtime.syncRecoverVigorButton(button, new TestColor(), new TestColor(), true);

    assert.strictEqual(label.string, '免费', 'action text must remain the prefab-authored value');
    assert.strictEqual(buttonComponent.interactable, true, 'button behavior must remain runtime-controlled');
    assert.strictEqual(opacityComponent.opacity, 255, 'button visual enabled state must remain runtime-controlled');
}

function testOpenFailureReportsOnceAndStillThrows() {
    const runtime = {};
    loadPlayerMetaStateInstaller()(runtime);
    const results = [];
    let bundleCallback = null;
    let clearCount = 0;

    Object.assign(runtime, {
        isValid: true,
        _noLivesModal: null,
        _panelOpenInFlight: new Set(),
        _openPanelAfterTextures(_panelKey, _textures, _isOpen, open) { open(); },
        requireCanvasUiRoot() { return { isValid: true }; },
        _retainPanelTextureOwner() {},
        _releasePanelTextureOwner() {},
        clearRecoverVigorModalRuntimeState() { clearCount += 1; },
        _withGameAssetsBundle(callback) { bundleCallback = callback; },
        getVigor() { return 2; },
    });

    runtime.openRecoverVigorPrefabModal({
        source: 'collection_replay',
        onResult(result) { results.push(result); },
    });
    assert.strictEqual(typeof bundleCallback, 'function');
    assert.throws(
        () => bundleCallback(null),
        /\[recover-vigor-prefab\] gameAssets bundle unavailable/,
    );
    assert.throws(
        () => bundleCallback(null),
        /\[recover-vigor-prefab\] gameAssets bundle unavailable/,
    );
    assert.strictEqual(clearCount, 2, 'each failed callback must still clean internal modal state');
    assert.strictEqual(results.length, 1, 'an open failure must report failed exactly once');
    assert.strictEqual(results[0].source, 'collection_replay');
    assert.strictEqual(results[0].status, 'failed');
    assert.strictEqual(results[0].granted, 0);
    assert.strictEqual(results[0].vigorAfter, 2);
    assert.strictEqual(results[0].transactionId, 0);
}

testPrefabCardSchemas();
testVideoCardNeverRequestsLimitLabel();
testShareCardRequiresLimitLabel();
testActionTextStaysPrefabOwned();
testOpenFailureReportsOnceAndStillThrows();
console.log('recover-vigor-card-contract.test.js passed');
