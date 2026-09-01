'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const projectRoot = path.resolve(__dirname, '..');
const trackRelativePath = 'assets/BootstrapBundle/GameUI/RainbowConveyor/compact_conveyor_track.png';
const trackPath = path.join(projectRoot, trackRelativePath);
const trackBuffer = fs.readFileSync(trackPath);
const trackMeta = JSON.parse(fs.readFileSync(`${trackPath}.meta`, 'utf8'));
const scene = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'assets/BootstrapBundle/Scenes/Game.scene'),
    'utf8',
));
const controller = fs.readFileSync(
    path.join(projectRoot, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);

const TRACK_UUID = '5874aaa9-f1be-4047-a76a-bc098c25535f';
const TRACK_SPRITE_UUID = `${TRACK_UUID}@f9941`;
const TRACK_SHA256 = '21e27f12a61ceb704f3eefa8ea7681c0e19288f881e71ab08fe2b6991eff2260';
const SOURCE_WIDTH = 2172;
const SOURCE_HEIGHT = 724;
const TRACK_ROOT_WIDTH = 650;
const TRACK_ROOT_HEIGHT = TRACK_ROOT_WIDTH * SOURCE_HEIGHT / SOURCE_WIDTH;
const VISUAL_WIDTH = 800;
const VISUAL_HEIGHT = 300;
const VISUAL_Y = -71.732;
const CARRIER_LAYER_Y = -55.633;
const CENTERLINE = { left: 99.5, right: 2072, top: 136, bottom: 507.5 };
const ARC_STEPS = 2048;
const near = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;

const validateSceneReferences = (value, location) => {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => validateSceneReferences(entry, `${location}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
        if (key === '__id__') {
            assert.equal(Number.isInteger(entry), true, `${location} must use an integer scene reference`);
            assert.ok(entry >= 0 && entry < scene.length, `${location} scene reference ${entry} is out of range`);
        } else {
            validateSceneReferences(entry, `${location}.${key}`);
        }
    }
};
scene.forEach((entry, index) => validateSceneReferences(entry, `scene[${index}]`));

const image = PNG.sync.read(trackBuffer);
assert.equal(image.width, SOURCE_WIDTH, 'Compact track PNG width must remain original');
assert.equal(image.height, SOURCE_HEIGHT, 'Compact track PNG height must remain original');
assert.equal(
    crypto.createHash('sha256').update(trackBuffer).digest('hex'),
    TRACK_SHA256,
    'Compact track PNG must remain byte-identical to the approved image',
);

const alphaBounds = { left: image.width, right: -1, top: image.height, bottom: -1 };
for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
        if (image.data[(y * image.width + x) * 4 + 3] <= 16) continue;
        alphaBounds.left = Math.min(alphaBounds.left, x);
        alphaBounds.right = Math.max(alphaBounds.right, x);
        alphaBounds.top = Math.min(alphaBounds.top, y);
        alphaBounds.bottom = Math.max(alphaBounds.bottom, y);
    }
}
assert.deepEqual(
    alphaBounds,
    { left: 3, right: 2168, top: 62, bottom: 587 },
    'Compact track transparent canvas must remain intact',
);

assert.equal(trackMeta.ver, '1.0.27');
assert.equal(trackMeta.importer, 'image');
assert.equal(trackMeta.uuid, TRACK_UUID);
assert.equal(trackMeta.subMetas['6c48a'].uuid, `${TRACK_UUID}@6c48a`);
assert.equal(trackMeta.subMetas.f9941.uuid, TRACK_SPRITE_UUID);
assert.equal(trackMeta.subMetas.f9941.userData.trimType, 'none');
assert.equal(trackMeta.subMetas.f9941.userData.width, SOURCE_WIDTH);
assert.equal(trackMeta.subMetas.f9941.userData.height, SOURCE_HEIGHT);
assert.equal(trackMeta.subMetas.f9941.userData.rawWidth, SOURCE_WIDTH);
assert.equal(trackMeta.subMetas.f9941.userData.rawHeight, SOURCE_HEIGHT);

const sceneChildren = (node) => (node?._children || []).map((ref) => scene[ref.__id__]);
const sceneChild = (node, name) => sceneChildren(node).find((child) => child?._name === name);
const component = (node, type) => (node?._components || [])
    .map((ref) => scene[ref.__id__])
    .find((entry) => entry?.__type__ === type);
const descendants = (root) => {
    const result = [];
    const queue = root ? [root] : [];
    while (queue.length > 0) {
        const node = queue.shift();
        result.push(node);
        queue.push(...sceneChildren(node));
    }
    return result;
};
const nodeContract = (node) => {
    const ui = component(node, 'cc.UITransform');
    const sprite = component(node, 'cc.Sprite');
    return {
        name: node?._name,
        active: node?._active,
        position: node?._lpos,
        rotation: node?._lrot,
        scale: node?._lscale,
        euler: node?._euler,
        layer: node?._layer,
        childNames: sceneChildren(node).map((child) => child?._name),
        componentTypes: (node?._components || []).map((ref) => scene[ref.__id__]?.__type__),
        ui: ui && {
            enabled: ui._enabled,
            contentSize: ui._contentSize,
            anchorPoint: ui._anchorPoint,
        },
        sprite: sprite && {
            enabled: sprite._enabled,
            customMaterial: sprite._customMaterial,
            srcBlendFactor: sprite._srcBlendFactor,
            dstBlendFactor: sprite._dstBlendFactor,
            color: sprite._color,
            spriteFrame: sprite._spriteFrame,
            type: sprite._type,
            fillType: sprite._fillType,
            sizeMode: sprite._sizeMode,
            fillCenter: sprite._fillCenter,
            fillStart: sprite._fillStart,
            fillRange: sprite._fillRange,
            isTrimmedMode: sprite._isTrimmedMode,
            useGrayscale: sprite._useGrayscale,
            atlas: sprite._atlas,
        },
    };
};

const fixedRoot = scene.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'GameplayFixedRoot');
const conveyorRoot = sceneChild(fixedRoot, 'PchConveyorRoot');
const normalLayout = sceneChild(conveyorRoot, 'NormalLayout');
const compactLayout = sceneChild(conveyorRoot, 'CompactLayout');
const normalTrack = sceneChild(normalLayout, 'PchMovingTrack');
const compactTrack = sceneChild(compactLayout, 'PchMovingTrack');

assert.equal(normalLayout?._active, true, 'NormalLayout must remain the authored active layout');
assert.equal(compactLayout?._active, false, 'CompactLayout must remain hidden');
assert.equal(normalTrack?._lscale.x, 0.6, 'Normal track scale must remain unchanged');
assert.deepEqual(
    sceneChildren(normalTrack).map((node) => node._name),
    [
        'BottomStraight',
        'BottomLeftCorner',
        'TopLeftCorner',
        'LeftSide',
        'BottomRightCorner',
        'TopRightCorner',
        'RightSide',
        'TopStraight',
    ],
    'Normal track hierarchy must remain unchanged',
);
assert.equal(
    descendants(normalLayout).some((node) => component(node, 'cc.Sprite')?._spriteFrame?.__uuid__ === TRACK_SPRITE_UUID),
    false,
    'New Compact image must not leak into NormalLayout',
);

const compactTrackTransform = component(compactTrack, 'cc.UITransform');
const compactTrackChildren = sceneChildren(compactTrack);
const compactVisual = compactTrackChildren[0];
assert.equal(compactTrack?._lscale.x, 1);
assert.equal(compactTrack?._lscale.y, 1);
assert.ok(near(compactTrackTransform?._contentSize.width, TRACK_ROOT_WIDTH));
assert.ok(near(compactTrackTransform?._contentSize.height, TRACK_ROOT_HEIGHT));
assert.equal(compactTrackChildren.length, 14, 'Legacy records must remain to preserve scene ids');
assert.equal(compactVisual?._name, 'CompactTrackVisual');
assert.equal(compactVisual?._active, true);
assert.ok(near(compactVisual?._lpos.x, 0));
assert.ok(near(compactVisual?._lpos.y, VISUAL_Y));
assert.ok(near(component(compactVisual, 'cc.UITransform')?._contentSize.width, VISUAL_WIDTH));
assert.ok(near(component(compactVisual, 'cc.UITransform')?._contentSize.height, VISUAL_HEIGHT));
assert.equal(component(compactVisual, 'cc.Sprite')?._spriteFrame?.__uuid__, TRACK_SPRITE_UUID);
assert.equal(
    compactTrackChildren.slice(1).every((node) => node._active === false),
    true,
    'All 13 legacy Compact track pieces must remain serialized but inactive',
);

const startX = -196.2;
const carrierLayer = sceneChild(compactLayout, 'CarrierLayer');
const carriers = sceneChildren(carrierLayer).filter((node) => /^PchCarrier-\d+$/.test(node._name));
assert.equal(carrierLayer?._active, true, 'Compact carriers must be visible when the hidden layout is previewed');
assert.ok(near(carrierLayer?._lpos.x, 0));
assert.ok(near(carrierLayer?._lpos.y, CARRIER_LAYER_Y));
assert.ok(near(carrierLayer?._lscale.x, 1) && near(carrierLayer?._lscale.y, 1));
assert.ok(near(carrierLayer?._euler.z, 0));

const sourceCenterX = (CENTERLINE.left + CENTERLINE.right) / 2;
const sourceCenterY = (CENTERLINE.top + CENTERLINE.bottom) / 2;
const sourceRadius = (CENTERLINE.bottom - CENTERLINE.top) / 2;
const sourceStraightHalf = (CENTERLINE.right - CENTERLINE.left) / 2 - sourceRadius;
const leftArcCenterX = sourceCenterX - sourceStraightHalf;
const rightArcCenterX = sourceCenterX + sourceStraightHalf;
const sourceToLayout = (point) => ({
    x: (point.x / SOURCE_WIDTH - 0.5) * VISUAL_WIDTH,
    y: ((SOURCE_HEIGHT - point.y) / SOURCE_HEIGHT - 0.5) * VISUAL_HEIGHT + VISUAL_Y,
});
const startSourceX = (startX / VISUAL_WIDTH + 0.5) * SOURCE_WIDTH;
assert.ok(startSourceX >= leftArcCenterX && startSourceX <= rightArcCenterX);

const sourcePath = [
    { x: startSourceX, y: CENTERLINE.bottom },
    { x: rightArcCenterX, y: CENTERLINE.bottom },
];
for (let index = 1; index <= ARC_STEPS; index += 1) {
    const theta = Math.PI / 2 - Math.PI * index / ARC_STEPS;
    sourcePath.push({
        x: rightArcCenterX + Math.cos(theta) * sourceRadius,
        y: sourceCenterY + Math.sin(theta) * sourceRadius,
    });
}
sourcePath.push({ x: leftArcCenterX, y: CENTERLINE.top });
for (let index = 1; index <= ARC_STEPS; index += 1) {
    const theta = -Math.PI / 2 - Math.PI * index / ARC_STEPS;
    sourcePath.push({
        x: leftArcCenterX + Math.cos(theta) * sourceRadius,
        y: sourceCenterY + Math.sin(theta) * sourceRadius,
    });
}
sourcePath.push({ x: startSourceX, y: CENTERLINE.bottom });

const layoutPath = sourcePath.map(sourceToLayout);
const cumulative = [0];
for (let index = 1; index < layoutPath.length; index += 1) {
    const previous = layoutPath[index - 1];
    const current = layoutPath[index];
    cumulative.push(cumulative[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y));
}
const perimeter = cumulative.at(-1);
const sample = (distance) => {
    let low = 1;
    let high = cumulative.length - 1;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (cumulative[middle] < distance) low = middle + 1;
        else high = middle;
    }
    const endIndex = low;
    const startIndex = endIndex - 1;
    const span = cumulative[endIndex] - cumulative[startIndex];
    const ratio = span > 0 ? (distance - cumulative[startIndex]) / span : 0;
    const from = layoutPath[startIndex];
    const to = layoutPath[endIndex];
    let angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    if (Math.abs(angle) < 0.1) angle = 0;
    if (Math.abs(Math.abs(angle) - 180) < 0.1) angle = 180;
    return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio - CARRIER_LAYER_Y,
        angle,
    };
};

assert.equal(carriers.length, 20);
carriers.forEach((carrier, index) => {
    const expected = sample(perimeter * index / carriers.length);
    const direction = sceneChild(carrier, 'Direction');
    const radians = expected.angle * Math.PI / 180;
    assert.ok(near(carrier._lpos.x, expected.x), `carrier ${index} x`);
    assert.ok(near(carrier._lpos.y, expected.y), `carrier ${index} y`);
    assert.ok(near(direction._lrot.z, Math.sin(radians / 2)), `carrier ${index} direction qz`);
    assert.ok(near(direction._lrot.w, Math.cos(radians / 2)), `carrier ${index} direction qw`);
    assert.ok(near(direction._euler.z, expected.angle), `carrier ${index} direction angle`);
});

const entrance = sceneChild(compactLayout, 'PchEntrance');
const tableEntry = sceneChild(compactLayout, 'TableEntryItem');
const compactPieces = sceneChild(tableEntry, 'Pieces');
const compactLeftDoor = sceneChild(compactPieces, 'L');
const compactRightDoor = sceneChild(compactPieces, 'R');
const compactImg = sceneChild(compactPieces, 'Img');
const compactFlyAnchor = sceneChild(compactImg, 'EntranceFlyAnchor');
const compactQueueLayer = sceneChild(compactImg, 'EntranceQueueLayer');
const compactQueueTemplate = sceneChild(compactQueueLayer, 'PchEntryBeanTemplate');
const normalTableEntry = sceneChild(normalLayout, 'TableEntryItem');
const normalImg = sceneChild(sceneChild(normalTableEntry, 'Pieces'), 'Img');
const normalFlyAnchor = sceneChild(normalImg, 'EntranceFlyAnchor');
const normalQueueLayer = sceneChild(normalImg, 'EntranceQueueLayer');
const normalQueueTemplate = sceneChild(normalQueueLayer, 'PchEntryBeanTemplate');
const capacityBadge = sceneChild(compactLayout, 'PchCapacityBadge');
const capacityAdButton = sceneChild(compactLayout, 'PchCapacityAdButton');
assert.ok(near(entrance?._lpos.x, startX));
assert.ok(near(entrance?._lpos.y, -55.58816758747698));
assert.ok(near(tableEntry?._lpos.x, -231.139));
assert.ok(near(tableEntry?._lpos.y, -126.839));
assert.ok(near(compactPieces?._lpos.x, 0), 'Compact Pieces parent adjustment must be preserved');
assert.ok(near(compactPieces?._lpos.y, 48.099998474121094));
assert.ok(near(compactLeftDoor?._lpos.x, -20.791));
assert.ok(near(compactRightDoor?._lpos.x, 11.63));
assert.ok(near(capacityBadge?._lpos.x, 0) && near(capacityBadge?._lpos.y, -58.35));
assert.ok(near(capacityAdButton?._lpos.x, 179.487) && near(capacityAdButton?._lpos.y, -59.226));
assert.deepEqual(nodeContract(compactImg), nodeContract(normalImg), 'Compact Img must mirror Normal Img');
assert.deepEqual(
    nodeContract(compactFlyAnchor),
    nodeContract(normalFlyAnchor),
    'Compact EntranceFlyAnchor must mirror Normal',
);
assert.deepEqual(
    nodeContract(compactQueueLayer),
    nodeContract(normalQueueLayer),
    'Compact EntranceQueueLayer must mirror Normal',
);
assert.deepEqual(
    nodeContract(compactQueueTemplate),
    nodeContract(normalQueueTemplate),
    'Compact queue bean template must mirror Normal',
);

assert.match(controller, /const normalLayout = this\.bindConveyorLayout\(this\.root, 'NormalLayout'\);/);
assert.doesNotMatch(controller, /this\.bindConveyorLayout\(this\.root, 'CompactLayout'\)/);
assert.match(controller, /normalLayout\.node\.active = true;/);
assert.match(controller, /compactLayout\.node\.active = false;/);
assert.match(controller, /const activeLayout = normalLayout;/);
assert.match(controller, /this\.prepareBeltPath\(2\);/);

console.log('compact-conveyor-track-contract: PASS');
