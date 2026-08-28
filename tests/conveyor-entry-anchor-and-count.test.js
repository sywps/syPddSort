const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const section = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing section start: ${startMarker}`);
    assert.ok(end > start, `missing section end: ${endMarker}`);
    return source.slice(start, end);
};

const pch = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const gameScene = JSON.parse(read(process.env.PCH_GAME_SCENE || 'assets/BootstrapBundle/Scenes/Game.scene'));
const sceneRef = (reference) => gameScene[reference?.__id__];
const sceneChild = (node, name) => (node?._children || [])
    .map(sceneRef)
    .find((child) => child?._name === name);
const sceneComponent = (node, type) => (node?._components || [])
    .map(sceneRef)
    .find((component) => component?.__type__ === type);
const bindings = section(pch, 'interface ConveyorLayoutBindings {', 'interface ConveyorEntryDoorBindings {');
const start = section(pch, '    start(): void {', '    playOpeningPatternShuffle(): void {');
const inbound = section(pch, '    private animateBeanIntoConveyor(', '    private animateBeanReturn(');
const renderConveyor = section(pch, '    private renderConveyor(): void {', '    private renderEntranceQueue(): void {');
const renderEntranceQueue = section(pch, '    private renderEntranceQueue(): void {', '    private syncTableEntryDoors(');
const skillSource = section(pch, '    private resolveSkillSourceVisual(', '    private playSkillTargetPulse(');
const bindLayout = section(pch, '    private bindConveyorLayout(', '    private getOrderedConveyorCarriers(');

assert.ok(bindings.includes('entryFlyAnchor: Node;'), 'each serialized layout must expose its white-building entry anchor');
assert.ok(
    bindings.includes('entryQueueLayer: Node;')
        && bindings.includes('entryBeanTemplate: Node;')
        && bindings.includes('entrancePulseNode: Node;')
        && !bindings.includes('entranceNode: Node;')
        && !bindings.includes('entryCountLabel: Label;'),
    'the active Normal binding must own the full queue hierarchy without the obsolete count shell',
);
assert.ok(
    bindLayout.includes("const entryFlyAnchor = tableEntryImage.getChildByName('EntranceFlyAnchor');")
        && bindLayout.includes('if (!entryFlyAnchor?.isValid)')
        && bindLayout.includes('Game.scene must provide Node on ${basePath}/TableEntryItem/Pieces/Img/EntranceFlyAnchor')
        && !bindLayout.includes('/TableEntryItem/Root/SphereNode')
        && bindLayout.includes('entryFlyAnchor,'),
    'the active layout must fail fast on a missing visual anchor without requiring a UI component',
);
assert.ok(start.includes('this.entryFlyAnchor = activeLayout.entryFlyAnchor;'), 'runtime must select the active layout anchor');
assert.ok(
    start.includes("const normalLayout = this.bindConveyorLayout(this.root, 'NormalLayout');")
        && !start.includes("this.bindConveyorLayout(this.root, 'CompactLayout')")
        && start.includes('compactLayout.node.active = false;'),
    'runtime must bind only Normal while retaining the hidden Compact root',
);
assert.ok(
    inbound.includes('const entranceWorld = this.entryFlyAnchor.getWorldPosition(new Vec3());')
        && !inbound.includes('this.entryFlyAnchor.getComponent(UITransform)'),
    'Board-to-Entry beans must use the anchor Node transform without a runtime UITransform dependency',
);
assert.ok(!inbound.includes('this.beltPath[0]'), 'Board-to-Entry flight must not target an unrelated belt path point');
assert.ok(inbound.includes('this.attachSphereFlyEffect(bean, sourceBeanSize, flightDelay);'), 'entry alignment must retain the pooled Star/Trail effect');
assert.ok(inbound.includes('.delay(flightDelay)'), 'entry alignment must retain the existing stagger delay');
assert.ok(inbound.includes('.to(PCH_TRANSFER_SECONDS,'), 'entry alignment must retain the existing flight duration');
assert.ok(inbound.includes("{ easing: 'quadIn' }"), 'entry alignment must retain the existing easing');
assert.ok(inbound.includes('this.rules?.markQueuedBeansReady(1);'), 'entry readiness must still advance only after arrival');

assert.ok(!renderConveyor.includes('`×${stack.length}`'), 'carrier stacks must not render per-stack ×N numbers');
assert.ok(!renderConveyor.includes('stack.length > 1'), 'carrier stack rendering must not retain a count-label branch');
assert.ok(
    pch.includes('const PCH_STACK_BEAN_SIZE = 33;')
        && pch.includes('const PCH_STACK_LAYER_OFFSET = 8;')
        && pch.includes('const PCH_STACK_LOWER_ALPHA = 184;')
        && renderConveyor.includes('this.configureStackBean(')
        && renderEntranceQueue.includes('this.configureStackBean('),
    'carrier and entrance beans must share one stack geometry and opacity implementation',
);
assert.ok(
    renderEntranceQueue.includes('const visibleColors = this.rules.entryColors.slice(0, this.rules.readyEntryCount);')
        && !renderEntranceQueue.includes('Math.min(3')
        && renderEntranceQueue.includes('bean.setSiblingIndex(layer + 1);')
        && renderEntranceQueue.includes('existingBeans.slice(visibleColors.length)')
        && !renderEntranceQueue.includes('entryCountLabel'),
    'every arrived entry bean must render individually in bottom-to-top sibling order without a count label',
);
assert.ok(
    skillSource.includes('this.entryQueueLayer?.getChildByName(`PchEntryBean-${source.index}`)')
        && skillSource.includes('PCH_STACK_BEAN_SIZE *')
        && !skillSource.includes('entranceNode'),
    'entry-origin skill flights must start from the exact full-stack bean',
);

const conveyorRoot = gameScene.find((record) => record?.__type__ === 'cc.Node' && record._name === 'PchConveyorRoot');
for (const layoutName of ['NormalLayout', 'CompactLayout']) {
    const layout = sceneChild(conveyorRoot, layoutName);
    const tableEntry = sceneChild(layout, 'TableEntryItem');
    const image = sceneChild(sceneChild(tableEntry, 'Pieces'), 'Img');
    const anchor = sceneChild(image, 'EntranceFlyAnchor');
    const anchorTransform = sceneComponent(anchor, 'cc.UITransform');
    assert.ok(
        Number.isFinite(anchor?._lpos.x)
            && Number.isFinite(anchor?._lpos.y)
            && anchorTransform?._contentSize.width === 31
            && anchorTransform?._contentSize.height === 31,
        `${layoutName} must serialize an authored 31x31 EntranceFlyAnchor under Pieces/Img`,
    );
    assert.ok(
        !(tableEntry?._children || []).map(sceneRef).some((child) => child?._name === 'Root'),
        `${layoutName} must not retain the obsolete Root/SphereNode branch`,
    );
}

const normalLayout = sceneChild(conveyorRoot, 'NormalLayout');
const normalImage = sceneChild(sceneChild(sceneChild(normalLayout, 'TableEntryItem'), 'Pieces'), 'Img');
const queueLayer = sceneChild(normalImage, 'EntranceQueueLayer');
const queueTemplate = sceneChild(queueLayer, 'PchEntryBeanTemplate');
assert.ok(
    queueLayer?._lpos.x === 0
        && queueLayer?._lpos.y === 0
        && Math.abs(queueLayer?._lscale.x - 5 / 3) < 1e-9
        && Math.abs(queueLayer?._lscale.y - 5 / 3) < 1e-9
        && queueTemplate?._active === false
        && sceneComponent(queueTemplate, 'cc.UITransform')?._contentSize.width === 33
        && sceneComponent(queueTemplate, 'cc.UITransform')?._contentSize.height === 33
        && sceneComponent(queueTemplate, 'cc.Sprite'),
    'Normal Img must serialize the inverse-scaled full queue layer and inactive bean template',
);
assert.ok(
    !sceneChild(normalLayout, 'PchEntrance')
        && !gameScene.some((record) => record?._id === 'RainbowConveyorNormal_scene_20260826_entry_count_label'),
    'Normal must not retain the obsolete PchEntrance or EntryCount label record',
);

assert.ok(
    pch.includes('this.countLabel.string = `${this.rules.bufferCount}/${this.rules.bufferCapacity}`;')
        && !pch.includes('entryCountLabel')
        && pch.includes('const PCH_EXPAND_CAPACITY = 12;'),
    'central capacity and +12 behavior must remain intact without an entry multiplier',
);

console.log('conveyor-entry-anchor-and-count.test.js passed');
