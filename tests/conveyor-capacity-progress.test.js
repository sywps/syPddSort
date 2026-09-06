const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const scene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));
const controller = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const refId = (value) => value && Number.isInteger(value.__id__) ? value.__id__ : null;
const recordAt = (reference) => scene[refId(reference)];
const children = (node) => (node?._children || []).map(recordAt);
const child = (node, name) => children(node).find((entry) => entry?._name === name);
const component = (node, type) => (node?._components || [])
    .map(recordAt)
    .find((entry) => entry?.__type__ === type);

const paths = new Map();
const visit = (node, currentPath) => {
    paths.set(currentPath, node);
    children(node).forEach((entry) => visit(entry, `${currentPath}/${entry._name}`));
};
const conveyorRoot = scene.find((record) => record?.__type__ === 'cc.Node' && record._name === 'PchConveyorRoot');
visit(conveyorRoot, 'PchConveyorRoot');

const validateReferences = (value, location, issues) => {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => validateReferences(entry, `${location}[${index}]`, issues));
        return;
    }
    if (!value || typeof value !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(value, '__id__')) {
        if (!Number.isInteger(value.__id__) || value.__id__ < 0 || value.__id__ >= scene.length) {
            issues.push(`${location}:${value.__id__}`);
        }
    }
    Object.entries(value).forEach(([key, entry]) => {
        if (key !== '__id__') validateReferences(entry, `${location}.${key}`, issues);
    });
};
const referenceIssues = [];
scene.forEach((record, index) => validateReferences(record, `scene[${index}]`, referenceIssues));
assert.deepStrictEqual(referenceIssues, [], 'capacity progress scene must retain valid references');

const stencilFrame = '3853c743-2a02-4e48-8cf3-2ba355ca1913@f9941';
const solidFrame = '52e94005-3ca2-a20b-d083-d9c4e3836418@f9941';
const fillFrame = 'ea05efae-8b08-40e3-a18d-2ee055a7922f@f9941';
const normalTrackFrame = '80cbaca8-c40a-4d18-ae3e-78081d8f0fb4@f9941';
const normalFillFrame = 'ac9bde61-ac0a-4324-a6e1-cf84c2ddce90@f9941';
const assertCountLabel = (badge, layoutName) => {
    const countLabel = component(child(badge, 'CapacityCount'), 'cc.Label');
    assert.ok(
        countLabel?._string === '0/60'
            && countLabel?._fontSize === 18
            && countLabel?._isBold === true
            && countLabel?._color.r === 43
            && countLabel?._outlineColor.r === 255
            && countLabel?._outlineColor.g === 221,
        `${layoutName} must keep a readable centered count above the capacity track`,
    );
};

const normalBadge = paths.get('PchConveyorRoot/NormalLayout/PchCapacityBadge');
const normalTrack = child(normalBadge, 'PchCapacityTrack');
assert.ok(normalBadge && normalBadge._lpos.x === 0, 'NormalLayout capacity badge must remain horizontally centered');
assert.deepStrictEqual(children(normalBadge).map((node) => node._name), ['PchCapacityTrack', 'CapacityCount'], 'NormalLayout label must render above the scene-owned track');
assert.deepStrictEqual(
    (normalTrack?._components || []).map(recordAt).map((entry) => entry?.__type__),
    ['cc.UITransform'],
    'NormalLayout must retain the parent transform without legacy Graphics, SpriteStencil, or ProgressBar components',
);
assert.ok(
    component(normalTrack, 'cc.UITransform')?._contentSize.width === 180
        && component(normalTrack, 'cc.UITransform')?._contentSize.height === 24,
    'NormalLayout PchCapacityTrack must expose its Inspector-owned width and height',
);
const normalTrackSprite = child(normalTrack, 'TrackSprite');
const normalFillSprite = child(normalTrack, 'FillSprite');
assert.deepStrictEqual(
    children(normalTrack).map((node) => node?._name),
    ['Background', 'Bar', 'TrackSprite', 'FillSprite'],
    'NormalLayout must keep legacy inactive records below two direct sliced renderer children',
);
assert.ok(
    component(normalTrack, 'cc.UITransform')?._enabled === true
        && child(normalTrack, 'Background')?._active === false
        && child(normalTrack, 'Bar')?._active === false
        && normalTrackSprite?._active === true
        && normalFillSprite?._active === false,
    'NormalLayout must start with only its high-resolution track visible at zero capacity',
);
assert.ok(
    component(normalTrackSprite, 'cc.UITransform')?._contentSize.width === 720
        && component(normalTrackSprite, 'cc.UITransform')?._contentSize.height === 96
        && normalTrackSprite?._lscale.x === 0.25
        && normalTrackSprite?._lscale.y === 0.25
        && component(normalTrackSprite, 'cc.Sprite')?._spriteFrame?.__uuid__ === normalTrackFrame
        && component(normalTrackSprite, 'cc.Sprite')?._type === 1,
    'NormalLayout must bind a 4x high-resolution sliced dark capacity track',
);
assert.ok(
    component(normalFillSprite, 'cc.UITransform')?._contentSize.width === 0
        && component(normalFillSprite, 'cc.UITransform')?._contentSize.height === 72
        && normalFillSprite?._lscale.x === 0.25
        && normalFillSprite?._lscale.y === 0.25
        && component(normalFillSprite, 'cc.Sprite')?._spriteFrame?.__uuid__ === normalFillFrame
        && component(normalFillSprite, 'cc.Sprite')?._type === 1,
    'NormalLayout must bind a hidden 4x high-resolution sliced green fill',
);
assertCountLabel(normalBadge, 'NormalLayout');

const compactBadge = paths.get('PchConveyorRoot/CompactLayout/PchCapacityBadge');
const compactTrack = child(compactBadge, 'ProgressTrack');
const compactBackground = child(compactTrack, 'Background');
const compactBar = child(compactTrack, 'Bar');
const compactProgress = component(compactTrack, 'cc.ProgressBar');
const compactMask = component(compactTrack, 'cc.Mask');
const compactBarSprite = component(compactBar, 'cc.Sprite');
assert.ok(compactBadge && compactBadge._lpos.x === 0, 'CompactLayout capacity badge must remain horizontally centered');
assert.deepStrictEqual(children(compactBadge).map((node) => node._name), ['ProgressTrack', 'CapacityCount'], 'CompactLayout must retain its original track hierarchy');
assert.ok(
    component(compactTrack, 'cc.UITransform')?._contentSize.width === 180
        && component(compactTrack, 'cc.UITransform')?._contentSize.height === 22
        && component(compactTrack, 'cc.Sprite')?._spriteFrame?.__uuid__ === stencilFrame
        && compactMask?._type === 3
        && compactMask?._alphaThreshold === 0.1,
    'CompactLayout must retain the serialized rounded SpriteStencil track',
);
assert.ok(
    component(compactBackground, 'cc.Sprite')?._spriteFrame?.__uuid__ === solidFrame
        && component(compactBackground, 'cc.Sprite')?._color.r === 62
        && component(compactBackground, 'cc.Sprite')?._color.g === 62
        && component(compactBackground, 'cc.Sprite')?._color.b === 62,
    'CompactLayout must retain the neutral dark background',
);
assert.ok(
    compactBarSprite?._spriteFrame?.__uuid__ === fillFrame
        && compactProgress?._mode === 0
        && compactProgress?._totalLength === 180
        && compactProgress?._progress === 0
        && refId(compactProgress?._barSprite) === scene.indexOf(compactBarSprite),
    'CompactLayout must retain its horizontal ProgressBar and green Bar Sprite',
);
assertCountLabel(compactBadge, 'CompactLayout');

assert.ok(controller.includes('capacityProgress: ProgressBar | null;'), 'layout bindings must expose the optional Compact ProgressBar');
assert.ok(controller.includes('capacityTrack: Node | null;'), 'layout bindings must expose the Normal scene-owned sliced capacity node');
assert.ok(
    controller.includes('this.capacityProgress = activeLayout.capacityProgress;')
        && controller.includes('this.capacityTrack = activeLayout.capacityTrack;'),
    'runtime must select both layout-specific capacity render bindings',
);
assert.ok(
    controller.includes('this.capacityProgress = null;')
        && controller.includes('this.capacityTrack = null;'),
    'stop lifecycle must release both capacity render bindings',
);
assert.ok(
    controller.includes('const capacityRatio = this.rules.bufferCapacity > 0')
        && controller.includes('this.rules.bufferCount / this.rules.bufferCapacity')
        && controller.includes('const clampedCapacityRatio = Math.min(1, Math.max(0, capacityRatio));')
        && controller.includes('this.capacityProgress.progress = clampedCapacityRatio;')
        && controller.includes('this.renderNormalCapacityTrack(this.capacityTrack, clampedCapacityRatio);'),
    'runtime must render the direct Normal node from the same clamped capacity ratio as the optional Compact ProgressBar',
);
assert.ok(
    controller.includes("if (name === 'NormalLayout') {")
        && controller.includes("'PchCapacityTrack'")
        && controller.includes('Game.scene must provide Sliced TrackSprite and FillSprite with UITransform on ${basePath}/PchCapacityBadge/PchCapacityTrack'),
    'NormalLayout must bind its real serialized sliced track directly',
);
assert.ok(
    controller.includes('private renderNormalCapacityTrack(')
        && controller.includes('const transform = capacityTrack.getComponent(UITransform);')
        && controller.includes("capacityTrack.getChildByName('TrackSprite')")
        && controller.includes("capacityTrack.getChildByName('FillSprite')")
        && controller.includes('const PCH_CAPACITY_SLICED_RENDER_SCALE = 0.25;')
        && controller.includes('trackTransform.setContentSize(width / highResolutionScale, height / highResolutionScale);')
        && controller.includes('fillTransform.setContentSize(fillWidth / highResolutionScale, fillHeight / highResolutionScale);')
        && controller.includes('const clampedCapacityRatio = Math.min(1, Math.max(0, capacityRatio));')
        && controller.includes('this.renderNormalCapacityTrack(this.capacityTrack, clampedCapacityRatio);'),
    'NormalLayout must synchronize a smooth sliced track and inset sliced fill from the unchanged capacity ratio',
);
assert.ok(
    controller.includes('capacityMask.type !== Mask.Type.SPRITE_STENCIL')
        && controller.includes('capacityProgress.mode !== ProgressBar.Mode.HORIZONTAL')
        && controller.includes('capacityProgress.barSprite !== progressBarNode.getComponent(Sprite)'),
    'runtime must retain CompactLayout serialized ProgressBar validation',
);
assert.ok(controller.includes('this.countLabel.string = `${this.rules.bufferCount}/${this.rules.bufferCapacity}`;'), 'existing numeric capacity semantics must remain');
assert.ok(controller.includes('const PCH_EXPAND_CAPACITY = 12;'), 'existing +12 expansion behavior must remain');

console.log('conveyor-capacity-progress.test.js passed');
