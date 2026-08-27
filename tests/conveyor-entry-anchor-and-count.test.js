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
const gameScene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));
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
const bindLayout = section(pch, '    private bindConveyorLayout(', '    private getOrderedConveyorCarriers(');

assert.ok(bindings.includes('entryFlyAnchor: Node;'), 'each serialized layout must expose its white-building entry anchor');
assert.ok(
    bindLayout.includes("const entryFlyAnchor = tableEntryImage.getChildByName('EntranceFlyAnchor');")
        && bindLayout.includes('if (!entryFlyAnchor?.isValid)')
        && bindLayout.includes('Game.scene must provide Node on ${basePath}/TableEntryItem/Pieces/Img/EntranceFlyAnchor')
        && !bindLayout.includes('/TableEntryItem/Root/SphereNode')
        && bindLayout.includes('entryFlyAnchor,'),
    'both layouts must fail fast on a missing visual anchor without requiring a UI component',
);
assert.ok(start.includes('this.entryFlyAnchor = activeLayout.entryFlyAnchor;'), 'runtime must select the active layout anchor');
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
    renderEntranceQueue.includes('const queueOrigin = entranceTransform.convertToNodeSpaceAR(')
        && renderEntranceQueue.includes('this.entryFlyAnchor.getWorldPosition(new Vec3())')
        && renderEntranceQueue.includes('queueOrigin.x,')
        && renderEntranceQueue.includes('queueOrigin.y + layer * 7,')
        && !renderEntranceQueue.includes('6 + layer * 7'),
    'settled entry beans must continue from the authored fly anchor and stack upward',
);
assert.ok(
    renderEntranceQueue.includes('layer === 0 ? 255 : 190')
        && renderEntranceQueue.includes('bean.setSiblingIndex(Math.max(1, labelIndex));'),
    'the bean nearest the entrance must remain the opaque front layer',
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

assert.ok(
    pch.includes('this.countLabel.string = `${this.rules.bufferCount}/${this.rules.bufferCapacity}`;')
        && pch.includes('this.entryCountLabel.string = this.rules.entryCount > 0 ? `${this.rules.entryCount}` : \'\';')
        && pch.includes('const PCH_EXPAND_CAPACITY = 12;'),
    'central capacity, entry queue count, and +12 capacity behavior must remain intact',
);

console.log('conveyor-entry-anchor-and-count.test.js passed');
