const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const scenePath = path.join(root, 'assets/BootstrapBundle/Scenes/Game.scene');
const toastSourcePath = path.join(root, 'assets/Scripts/Core/ToastService.ts');
const imagePath = path.join(root, 'assets/BootstrapBundle/GameUI/toast_bubble_background.png');
const imageMetaPath = `${imagePath}.meta`;
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const toastSource = fs.readFileSync(toastSourcePath, 'utf8').replace(/\r\n/g, '\n');
const bootstrapPatch = fs.readFileSync(
    path.join(root, 'scripts/patch-bootstrap-dynamic-assets.js'),
    'utf8',
);
const imageMeta = JSON.parse(fs.readFileSync(imageMetaPath, 'utf8'));
const transpileResult = ts.transpileModule(toastSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
    fileName: toastSourcePath,
    reportDiagnostics: true,
});
const transpileErrors = (transpileResult.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);

function findNodeIndex(name, parentIndex) {
    const index = scene.findIndex((entry) => (
        entry?.__type__ === 'cc.Node'
        && entry._name === name
        && (parentIndex === undefined || entry._parent?.__id__ === parentIndex)
    ));
    assert.ok(index >= 0, `missing scene node: ${name}`);
    return index;
}

function getNodeComponent(nodeIndex, type) {
    const node = scene[nodeIndex];
    const component = node._components
        .map((reference) => scene[reference.__id__])
        .find((entry) => entry?.__type__ === type);
    assert.ok(component, `missing ${type} on ${node._name}`);
    return component;
}

const overlayRootIndex = findNodeIndex('OverlayRoot');
const toastHostIndex = findNodeIndex('ToastHost', overlayRootIndex);
const toastBubbleIndex = findNodeIndex('ToastBubble', toastHostIndex);
const toastLabelIndex = findNodeIndex('ToastLbl', toastBubbleIndex);
const toastHost = scene[toastHostIndex];
const toastBubbleTransform = getNodeComponent(toastBubbleIndex, 'cc.UITransform');
const toastBubbleSprite = getNodeComponent(toastBubbleIndex, 'cc.Sprite');
const toastBubbleOpacity = getNodeComponent(toastBubbleIndex, 'cc.UIOpacity');
const toastLabelTransform = getNodeComponent(toastLabelIndex, 'cc.UITransform');
const toastLabel = getNodeComponent(toastLabelIndex, 'cc.Label');

assert.strictEqual(toastHost._active, false, 'ToastHost must start hidden');
assert.strictEqual(toastBubbleTransform._contentSize.width, 630);
assert.strictEqual(toastBubbleTransform._contentSize.height, 67);
assert.strictEqual(toastBubbleSprite._type, 1, 'ToastBubble background must use Sliced mode');
assert.strictEqual(
    toastBubbleSprite._spriteFrame.__uuid__,
    'd49c1df2-c7c8-45a3-8465-d2571508f9d7@f9941',
    'ToastBubble must reference the supplied background image sprite frame',
);
assert.strictEqual(toastBubbleOpacity._opacity, 255, 'business Toast must start fully opaque');
assert.strictEqual(toastLabelTransform._contentSize.width, 538);
assert.strictEqual(toastLabelTransform._contentSize.height, 44);
assert.strictEqual(toastLabel._horizontalAlign, 1);
assert.strictEqual(toastLabel._verticalAlign, 1);
assert.strictEqual(toastLabel._enableWrapText, false);
assert.deepStrictEqual(toastLabel._color, {
    __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255,
}, 'business Toast text must be opaque white');
assert.strictEqual(toastLabel._actualFontSize, 32);
assert.strictEqual(toastLabel._fontSize, 32);
assert.strictEqual(toastLabel._lineHeight, 42);
assert.strictEqual(toastLabel._enableOutline, true, 'business Toast text must enable its outline');
assert.deepStrictEqual(toastLabel._outlineColor, {
    __type__: 'cc.Color', r: 184, g: 159, b: 255, a: 255,
}, 'business Toast outline must be light purple and fully opaque');
assert.strictEqual(toastLabel._outlineWidth, 3);
assert.deepStrictEqual(transpileErrors, [], 'ToastService.ts must transpile without TypeScript syntax errors');

assert.ok(fs.statSync(imagePath).size > 0, 'Toast background image must be present');
assert.strictEqual(imageMeta.uuid, 'd49c1df2-c7c8-45a3-8465-d2571508f9d7');
const spriteFrameMeta = imageMeta.subMetas.f9941.userData;
assert.strictEqual(spriteFrameMeta.width, 610);
assert.strictEqual(spriteFrameMeta.height, 67);
assert.strictEqual(spriteFrameMeta.borderLeft, 24);
assert.strictEqual(spriteFrameMeta.borderRight, 24);
assert.ok(
    bootstrapPatch.includes("'GameUI/toast_bubble_background'"),
    'toast background must remain in the Bootstrap image allowlist',
);

assert.doesNotMatch(
    toastSource,
    /showWeChatNativeToast|showDouyinNativeToast|wx\.showToast|ttRuntime\.showToast/,
    'platform-native Toast must not bypass the scene background image',
);
assert.match(toastSource, /const TOAST_HEIGHT = 67;/);
assert.match(toastSource, /const TOAST_MIN_WIDTH = 630;/);
assert.match(toastSource, /const TOAST_MAX_WIDTH = 630;/);
assert.match(toastSource, /state\.label\.overflow = Label\.Overflow\.NONE;/);
assert.match(toastSource, /state\.label\.updateRenderData\(true\);/);
assert.match(toastSource, /bubbleTransform\.setContentSize\(bubbleWidth, TOAST_HEIGHT\);/);
assert.match(toastSource, /state\.label\.overflow = Label\.Overflow\.CLAMP;/);
assert.match(toastSource, /const TOAST_DEFAULT_HOLD_SECONDS = 1;/);
assert.match(toastSource, /const TOAST_EXIT_RISE_SECONDS = 1;/);
assert.match(toastSource, /const TOAST_EXIT_RISE_DISTANCE = 100;/);
assert.match(toastSource, /const TOAST_MIDDLE_UPPER_Y_RATIO = 0\.237;/);
assert.match(toastSource, /const TOAST_VISIBLE_OPACITY = 255;/);
assert.match(toastSource, /function getMiddleUpperToastPosition\(overlayHost: Node\): Vec3/);
assert.doesNotMatch(
    toastSource,
    /getSlotAreaToastPosition|hasGameplaySlotArea|slotAreaNode/,
    'default business Toast must not follow the conveyor or timer position',
);
assert.match(
    toastSource,
    /\.delay\(holdSeconds\)\s*\.by\(\s*TOAST_EXIT_RISE_SECONDS,\s*\{ position: new Vec3\(0, TOAST_EXIT_RISE_DISTANCE, 0\) \},\s*\{ easing: 'linear' \},\s*\)\s*\.call\(hideToast\)/,
    'Toast must hold, rise for one second, then disappear directly',
);
assert.doesNotMatch(
    toastSource,
    /tween\(bubbleOpacity\)|opacity: 0|scale: new Vec3\(0\.5|scale: new Vec3\(0\.8/,
    'business Toast must not fade, shrink, or pop in',
);
assert.match(
    toastSource,
    /static show\(runtime: any, text: string, duration: number = TOAST_DEFAULT_HOLD_SECONDS\)/,
);
assert.match(
    toastSource,
    /static showBelowTimer\(runtime: any, text: string, duration: number = TOAST_DEFAULT_HOLD_SECONDS\)/,
);

class MockVec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

class MockUITransform {
    constructor(width = 0, height = 0) {
        this.contentSize = { width, height };
    }

    setContentSize(width, height) {
        this.contentSize = { width, height };
    }
}

class MockUIOpacity {
    constructor(opacity = 255) {
        this.opacity = opacity;
    }
}

class MockLabel {
    static Overflow = { NONE: 0, CLAMP: 1 };

    constructor() {
        this.string = '';
        this.overflow = MockLabel.Overflow.CLAMP;
    }

    updateRenderData() {}
}

class MockNode {
    constructor(name) {
        this.name = name;
        this.children = [];
        this.active = false;
        this.isValid = true;
        this.position = new MockVec3();
        this.scale = new MockVec3(1, 1, 1);
        this.components = new Map();
    }

    addChild(child) {
        this.children.push(child);
    }

    getChildByName(name) {
        return this.children.find((child) => child.name === name) || null;
    }

    getComponent(type) {
        return this.components.get(type) || null;
    }

    setPosition(x, y, z) {
        this.position = x instanceof MockVec3 ? new MockVec3(x.x, x.y, x.z) : new MockVec3(x, y, z);
    }

    setScale(x, y, z) {
        this.scale = new MockVec3(x, y, z);
    }

    setSiblingIndex(index) {
        this.siblingIndex = index;
    }
}

const tweenRecords = [];
const MockTween = {
    stopAllByTarget() {},
};
function mockTween(target) {
    const record = { target, steps: [], started: false };
    tweenRecords.push(record);
    return {
        delay(seconds) {
            record.steps.push({ type: 'delay', seconds });
            return this;
        },
        by(seconds, properties, options) {
            record.steps.push({ type: 'by', seconds, properties, options });
            return this;
        },
        call(callback) {
            record.steps.push({ type: 'call', callback });
            return this;
        },
        start() {
            record.started = true;
            return this;
        },
    };
}

const toastModule = { exports: {} };
vm.runInNewContext(transpileResult.outputText, {
    module: toastModule,
    exports: toastModule.exports,
    require(request) {
        assert.strictEqual(request, './GameCtrlShared');
        return {
            Label: MockLabel,
            Node: MockNode,
            Tween: MockTween,
            UIOpacity: MockUIOpacity,
            UITransform: MockUITransform,
            Vec3: MockVec3,
            tween: mockTween,
        };
    },
    console,
    Math,
    Number,
    String,
    Set,
});

function createToastRuntime() {
    const overlay = new MockNode('OverlayRoot');
    overlay.components.set(MockUITransform, new MockUITransform(720, 1280));
    const host = new MockNode('ToastHost');
    host.components.set(MockUITransform, new MockUITransform(720, 1280));
    const bubble = new MockNode('ToastBubble');
    bubble.components.set(MockUITransform, new MockUITransform(630, 67));
    const opacity = new MockUIOpacity(12);
    bubble.components.set(MockUIOpacity, opacity);
    const labelNode = new MockNode('ToastLbl');
    labelNode.components.set(MockUITransform, new MockUITransform(538, 44));
    labelNode.components.set(MockLabel, new MockLabel());
    overlay.addChild(host);
    host.addChild(bubble);
    bubble.addChild(labelNode);
    return {
        runtime: {
            node: overlay,
            requireCanvasUiRoot: (name) => {
                assert.strictEqual(name, 'OverlayRoot');
                return overlay;
            },
        },
        host,
        bubble,
        opacity,
    };
}

const { ToastService } = toastModule.exports;
const normalToast = createToastRuntime();
tweenRecords.length = 0;
ToastService.show(normalToast.runtime, '体力已满');
assert.strictEqual(normalToast.host.active, true);
assert.strictEqual(normalToast.bubble.active, true);
assert.strictEqual(normalToast.opacity.opacity, 255, 'runtime Toast must reset to full opacity');
assert.strictEqual(normalToast.bubble.position.x, 0);
assert.strictEqual(normalToast.bubble.position.y, 303.36, 'default Toast must start in the middle-upper area');
assert.strictEqual(
    normalToast.bubble.getComponent(MockUITransform).contentSize.width,
    630,
    'short business Toast text must retain the user-selected 630-pixel background width',
);
const normalTween = tweenRecords.find((record) => record.target === normalToast.bubble);
assert.ok(normalTween?.started, 'Toast must start a lifecycle tween');
assert.strictEqual(normalTween.steps[0].seconds, 1, 'default Toast must hold for one second');
assert.strictEqual(normalTween.steps[1].type, 'by');
assert.strictEqual(normalTween.steps[1].seconds, 1, 'Toast exit must rise for one second');
assert.strictEqual(normalTween.steps[1].properties.position.y, 100, 'Toast exit must rise by 100 pixels');
assert.strictEqual(normalTween.steps[1].options.easing, 'linear');
assert.ok(!tweenRecords.some((record) => record.target === normalToast.opacity), 'Toast lifecycle must not fade opacity');

const timerToast = createToastRuntime();
tweenRecords.length = 0;
ToastService.showBelowTimer(timerToast.runtime, '分享成功');
assert.strictEqual(timerToast.bubble.position.y, 303.36, 'timer-named Toast must use the same middle-upper position');

const explicitToast = createToastRuntime();
tweenRecords.length = 0;
ToastService.showAt(explicitToast.runtime, '指定位置', 2.5, 18, 24);
const explicitTween = tweenRecords.find((record) => record.target === explicitToast.bubble);
assert.strictEqual(explicitToast.bubble.position.x, 18, 'showAt must retain its explicit x coordinate');
assert.strictEqual(explicitToast.bubble.position.y, 24, 'showAt must retain its explicit y coordinate');
assert.strictEqual(explicitTween.steps[0].seconds, 2.5, 'explicit longer holds must remain available');

console.log('toast-background-contract.test.js passed');
