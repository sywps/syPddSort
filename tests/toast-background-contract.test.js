const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

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
assert.strictEqual(toastBubbleTransform._contentSize.width, 610);
assert.strictEqual(toastBubbleTransform._contentSize.height, 67);
assert.strictEqual(toastBubbleSprite._type, 1, 'ToastBubble background must use Sliced mode');
assert.strictEqual(
    toastBubbleSprite._spriteFrame.__uuid__,
    'd49c1df2-c7c8-45a3-8465-d2571508f9d7@f9941',
    'ToastBubble must reference the supplied background image sprite frame',
);
assert.strictEqual(toastBubbleOpacity._opacity, 245);
assert.strictEqual(toastLabelTransform._contentSize.width, 538);
assert.strictEqual(toastLabelTransform._contentSize.height, 44);
assert.strictEqual(toastLabel._horizontalAlign, 1);
assert.strictEqual(toastLabel._verticalAlign, 1);
assert.strictEqual(toastLabel._enableWrapText, false);
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
assert.match(toastSource, /const TOAST_MAX_WIDTH = 610;/);
assert.match(toastSource, /state\.label\.overflow = Label\.Overflow\.NONE;/);
assert.match(toastSource, /state\.label\.updateRenderData\(true\);/);
assert.match(toastSource, /bubbleTransform\.setContentSize\(bubbleWidth, TOAST_HEIGHT\);/);
assert.match(toastSource, /state\.label\.overflow = Label\.Overflow\.CLAMP;/);

console.log('toast-background-contract.test.js passed');
