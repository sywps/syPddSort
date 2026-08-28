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
for (const [layoutName, expectedY] of [['NormalLayout', -81.66], ['CompactLayout', -117.66]]) {
    const badge = paths.get(`PchConveyorRoot/${layoutName}/PchCapacityBadge`);
    const progressTrack = child(badge, 'ProgressTrack');
    const background = child(progressTrack, 'Background');
    const bar = child(progressTrack, 'Bar');
    const count = child(badge, 'CapacityCount');
    const progress = component(progressTrack, 'cc.ProgressBar');
    const mask = component(progressTrack, 'cc.Mask');
    const barSprite = component(bar, 'cc.Sprite');
    const countLabel = component(count, 'cc.Label');

    assert.ok(badge && badge._lpos.x === 0 && badge._lpos.y === expectedY, `${layoutName} badge must be centered without changing Y`);
    assert.deepStrictEqual(children(badge).map((node) => node._name), ['ProgressTrack', 'CapacityCount'], `${layoutName} label must render above the track`);
    assert.ok(
        component(progressTrack, 'cc.UITransform')?._contentSize.width === 180
            && component(progressTrack, 'cc.UITransform')?._contentSize.height === 22
            && component(progressTrack, 'cc.Sprite')?._spriteFrame?.__uuid__ === stencilFrame
            && mask?._type === 3
            && mask?._alphaThreshold === 0.1,
        `${layoutName} must use the serialized rounded SpriteStencil track`,
    );
    assert.ok(
        component(background, 'cc.Sprite')?._spriteFrame?.__uuid__ === solidFrame
            && component(background, 'cc.Sprite')?._color.r === 62
            && component(background, 'cc.Sprite')?._color.g === 62
            && component(background, 'cc.Sprite')?._color.b === 62,
        `${layoutName} must use the neutral dark background`,
    );
    assert.ok(
        barSprite?._spriteFrame?.__uuid__ === fillFrame
            && progress?._mode === 0
            && progress?._totalLength === 180
            && progress?._progress === 0
            && refId(progress?._barSprite) === scene.indexOf(barSprite),
        `${layoutName} must wire the Cocos horizontal ProgressBar to the green Bar Sprite`,
    );
    assert.ok(
        countLabel?._string === '0/60'
            && countLabel?._fontSize === 18
            && countLabel?._isBold === true
            && countLabel?._color.r === 43
            && countLabel?._outlineColor.r === 255
            && countLabel?._outlineColor.g === 221,
        `${layoutName} must keep a readable centered count above the progress bar`,
    );
}

assert.ok(controller.includes('capacityProgress: ProgressBar;'), 'layout bindings must expose the serialized ProgressBar');
assert.ok(controller.includes('this.capacityProgress = activeLayout.capacityProgress;'), 'runtime must select the active layout ProgressBar');
assert.ok(controller.includes('this.capacityProgress = null;'), 'stop lifecycle must release the ProgressBar reference');
assert.ok(
    controller.includes('const capacityRatio = this.rules.bufferCapacity > 0')
        && controller.includes('this.rules.bufferCount / this.rules.bufferCapacity')
        && controller.includes('this.capacityProgress.progress = Math.min(1, Math.max(0, capacityRatio));'),
    'runtime must update clamped progress from the same capacity values as the label',
);
assert.ok(
    controller.includes('capacityMask.type !== Mask.Type.SPRITE_STENCIL')
        && controller.includes('capacityProgress.mode !== ProgressBar.Mode.HORIZONTAL')
        && controller.includes('capacityProgress.barSprite !== progressBarNode.getComponent(Sprite)'),
    'runtime must fail fast when the serialized Cocos progress structure is invalid',
);
assert.ok(controller.includes('this.countLabel.string = `${this.rules.bufferCount}/${this.rules.bufferCapacity}`;'), 'existing numeric capacity semantics must remain');
assert.ok(controller.includes('const PCH_EXPAND_CAPACITY = 12;'), 'existing +12 expansion behavior must remain');

console.log('conveyor-capacity-progress.test.js passed');
