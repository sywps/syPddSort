'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const controllerPath = path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');
const compiled = ts.transpileModule(controllerSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
    },
    fileName: controllerPath,
    reportDiagnostics: true,
});
assert.equal(
    (compiled.diagnostics || []).length,
    0,
    (compiled.diagnostics || []).map((item) => item.messageText).join('\n'),
);

class FakeColor {
    constructor(r = 0, g = 0, b = 0, a = 255) {
        Object.assign(this, { r, g, b, a });
    }
}

class FakeGraphics {
    constructor() {
        this.fillColor = null;
        this.roundRects = [];
        this.clearCalls = 0;
        this.fillCalls = 0;
    }

    clear() {
        this.clearCalls += 1;
        this.roundRects = [];
    }

    roundRect(x, y, width, height, radius) {
        this.roundRects.push({
            x,
            y,
            width,
            height,
            radius,
            color: this.fillColor ? [this.fillColor.r, this.fillColor.g, this.fillColor.b, this.fillColor.a] : null,
        });
    }

    fill() {
        this.fillCalls += 1;
    }
}

class FakeUITransform {
    constructor(width = 0, height = 0, anchorX = 0.5, anchorY = 0.5) {
        this.contentSize = { width, height };
        this.anchorPoint = { x: anchorX, y: anchorY };
    }

    setAnchorPoint(x, y) {
        this.anchorPoint = { x, y };
    }

    setContentSize(width, height) {
        this.contentSize = { width, height };
    }
}

class FakeSprite {
    constructor() {
        this.enabled = true;
    }
}

class FakeMask {
    constructor() {
        this.enabled = true;
    }
}

class FakeNode {
    constructor(componentsOrName = new Map(), name = '') {
        const hasName = typeof componentsOrName === 'string';
        this.name = hasName ? componentsOrName : name;
        this.isValid = true;
        this.components = hasName ? new Map() : componentsOrName;
        this.children = [];
        this.parent = null;
        this.layer = 0;
        this.active = true;
        this.position = { x: 0, y: 0, z: 0 };
        this.scale = { x: 1, y: 1, z: 1 };
        this.angle = 0;
    }

    getComponent(type) {
        return this.components.get(type) || null;
    }

    addComponent(type) {
        const component = new type();
        this.components.set(type, component);
        return component;
    }

    addChild(child) {
        if (child.parent) {
            const oldIndex = child.parent.children.indexOf(child);
            if (oldIndex >= 0) child.parent.children.splice(oldIndex, 1);
        }
        child.parent = this;
        this.children.push(child);
    }

    getChildByName(name) {
        return this.children.find((child) => child.name === name) || null;
    }

    setPosition(positionOrX, y = 0, z = 0) {
        this.position = typeof positionOrX === 'object'
            ? { ...positionOrX }
            : { x: positionOrX, y, z };
    }

    setScale(scaleOrX, y = 1, z = 1) {
        this.scale = typeof scaleOrX === 'object'
            ? { ...scaleOrX }
            : { x: scaleOrX, y, z };
    }

    setSiblingIndex(index) {
        if (!this.parent) return;
        const siblings = this.parent.children;
        const currentIndex = siblings.indexOf(this);
        if (currentIndex >= 0) siblings.splice(currentIndex, 1);
        siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, this);
    }
}

class FakeNodePool {
    clear() {}
}

class FakeVec2 {}

class FakeVec3 {
    clone() { return new FakeVec3(); }
    static distance() { return 0; }
}

class RuntimeStub {}

const loadedModule = { exports: {} };
const load = new Function('module', 'exports', 'require', compiled.outputText);
load(loadedModule, loadedModule.exports, (request) => {
    if (request === './PchConveyorRules') return { PchConveyorRules: RuntimeStub };
    if (request === './PchConveyorGeometry') return require('../cloudfunctions/pvpService/bot-runtime/PchConveyorGeometry');
    if (request === './AppRoot') return { AppRoot: { tryGet() { return null; } } };
    if (request === './OpeningPatternTransition') {
        return { buildOpeningPatternMoves() { return []; }, getOpeningPatternStaggerDelay() { return 0; } };
    }
    if (request === './AnalyticsMgr') {
        return {
            AnalyticsMgr: { inst: { trackFunnelEvent() {} } },
            PCH_GAMEPLAY_MODE: 'pch_conveyor',
            PCH_GAMEPLAY_SCHEMA_VERSION: 1,
        };
    }
    if (request === './GameCtrlShared') {
        return new Proxy({
            AudioMgr: { inst: { play() {}, vibratePlace() {} } },
            Color: FakeColor,
            Graphics: FakeGraphics,
            Mask: FakeMask,
            Node: FakeNode,
            NodePool: FakeNodePool,
            Sprite: FakeSprite,
            Tween: { stopAllByTarget() {}, pauseAllByTarget() {}, resumeAllByTarget() {} },
            UITransform: FakeUITransform,
            Vec2: FakeVec2,
            Vec3: FakeVec3,
            tween() { return { delay() { return this; }, to() { return this; }, call() { return this; }, start() { return this; } }; },
        }, {
            get(target, key) {
                return key in target ? target[key] : RuntimeStub;
            },
        });
    }
    throw new Error(`unexpected dependency: ${request}`);
});

const { PchConveyorGameplayController } = loadedModule.exports;
const controller = new PchConveyorGameplayController({});

const transform = new FakeUITransform(180, 24);
const trackTransform = new FakeUITransform(720, 96);
const fillTransform = new FakeUITransform(0, 72);
const trackSpriteNode = new FakeNode(new Map([
    [FakeUITransform, trackTransform],
    [FakeSprite, new FakeSprite()],
]), 'TrackSprite');
const fillSpriteNode = new FakeNode(new Map([
    [FakeUITransform, fillTransform],
    [FakeSprite, new FakeSprite()],
]), 'FillSprite');
fillSpriteNode.active = false;
const capacityTrack = new FakeNode(new Map([
    [FakeUITransform, transform],
]), 'PchCapacityTrack');
capacityTrack.addChild(trackSpriteNode);
capacityTrack.addChild(fillSpriteNode);

controller.renderNormalCapacityTrack(capacityTrack, 0);
assert.deepEqual(trackTransform.contentSize, { width: 720, height: 96 }, 'zero capacity must retain the 4x sliced track source size');
assert.deepEqual(trackSpriteNode.position, { x: 0, y: 0, z: 0 }, 'the sliced track must remain centered under the capacity label');
assert.deepEqual(trackSpriteNode.scale, { x: 0.25, y: 0.25, z: 1 }, 'the sliced track must render at a uniform 4x-to-1x scale');
assert.equal(fillSpriteNode.active, false, 'zero capacity must hide the green fill child instead of leaving a zero-width sprite visible');

controller.renderNormalCapacityTrack(capacityTrack, 0.5);
assert.equal(fillSpriteNode.active, true, 'positive capacity must reveal the green sliced fill child');
assert.deepEqual(fillTransform.contentSize, { width: 348, height: 72 }, 'half capacity must resize the high-resolution fill to exactly half of the inset capacity width');
assert.deepEqual(fillSpriteNode.position, { x: -43.5, y: 0, z: 0 }, 'half capacity must keep the fill pinned to the left inset');
assert.deepEqual(fillSpriteNode.scale, { x: 0.25, y: 0.25, z: 1 }, 'fill corners must use the same uniform high-resolution scale as the track');

controller.renderNormalCapacityTrack(capacityTrack, 2);
assert.deepEqual(fillTransform.contentSize, { width: 696, height: 72 }, 'over-capacity input must clamp to the full inset capacity width');
assert.deepEqual(fillSpriteNode.position, { x: 0, y: 0, z: 0 }, 'a full fill must be centered after covering the complete inset width');

transform.setContentSize(240, 30);
transform.setAnchorPoint(0.25, 0.75);
controller.renderNormalCapacityTrack(capacityTrack, 0.5);
assert.deepEqual(trackTransform.contentSize, { width: 960, height: 120 }, 'later Inspector width and height changes must preserve the 4x track source scale');
assert.deepEqual(fillTransform.contentSize, { width: 468, height: 96 }, 'later Inspector size changes must resize fill width and height from the parent track');
assert.deepEqual(fillSpriteNode.position, { x: -58.5, y: 0, z: 0 }, 'later Inspector width changes must keep the fill left-aligned to the inset');

const scene = JSON.parse(fs.readFileSync(path.join(root, 'assets/BootstrapBundle/Scenes/Game.scene'), 'utf8'));
const normalTrackIndex = scene.findIndex((record) => record?._name === 'PchCapacityTrack'
    && record?._parent?.__id__ === 292);
assert.ok(normalTrackIndex >= 0, 'NormalLayout must serialize PchCapacityTrack directly under PchCapacityBadge');
const normalTrack = scene[normalTrackIndex];
const normalComponentTypes = normalTrack._components.map((reference) => scene[reference.__id__]?.__type__);
assert.deepEqual(normalComponentTypes, ['cc.UITransform'], 'NormalLayout track must retain only its Inspector-owned transform');
assert.equal(
    scene.some((record) => record?._name === 'ProgressTrack' && record?._parent?.__id__ === 292),
    false,
    'NormalLayout must not retain the legacy ProgressTrack node name',
);
assert.deepEqual(
    normalTrack._children.map((reference) => scene[reference.__id__]?._name),
    ['Background', 'TrackSprite', 'FillSprite'],
    'NormalLayout must not retain the obsolete Bar before the active sliced renderer children',
);
assert.equal(scene[normalTrack._children[0].__id__]?._active, false, 'legacy Normal background record must remain inactive');
assert.equal(
    scene.some((record) => record?._name === 'Bar' && record?._parent?.__id__ === normalTrackIndex),
    false,
    'obsolete Normal fill node must be physically removed',
);
const serializedTrackSprite = scene[normalTrack._children[1].__id__];
const serializedFillSprite = scene[normalTrack._children[2].__id__];
const serializedTrackTransform = scene[serializedTrackSprite._components[0].__id__];
const serializedFillTransform = scene[serializedFillSprite._components[0].__id__];
const serializedTrackRenderer = scene[serializedTrackSprite._components[1].__id__];
const serializedFillRenderer = scene[serializedFillSprite._components[1].__id__];
assert.equal(serializedTrackSprite._active, true, 'sliced dark track must be active in the scene');
assert.equal(serializedFillSprite._active, false, 'sliced fill must start hidden at zero capacity');
assert.deepEqual(serializedTrackTransform._contentSize, { __type__: 'cc.Size', width: 720, height: 96 }, 'track scene child must keep the authored 4x source dimensions');
assert.deepEqual(serializedFillTransform._contentSize, { __type__: 'cc.Size', width: 0, height: 72 }, 'fill scene child must begin at zero logical width with 4x source height');
assert.equal(serializedTrackRenderer._type, 1, 'track must use Cocos Sprite.Type.SLICED');
assert.equal(serializedFillRenderer._type, 1, 'fill must use Cocos Sprite.Type.SLICED');
assert.equal(serializedTrackRenderer._spriteFrame.__uuid__, '80cbaca8-c40a-4d18-ae3e-78081d8f0fb4@f9941', 'track must bind the dedicated high-resolution frame');
assert.equal(serializedFillRenderer._spriteFrame.__uuid__, 'ac9bde61-ac0a-4324-a6e1-cf84c2ddce90@f9941', 'fill must bind the dedicated high-resolution frame');

controller.rules = {
    bufferCount: 30,
    bufferCapacity: 60,
    entryCount: 0,
    carrierCount: 20,
    shouldShowRedWarning() { return false; },
};
controller.capacityProgress = null;
controller.capacityTrack = capacityTrack;
controller.syncCapacityWarning = () => {};
controller.refreshStatus();
assert.deepEqual(fillTransform.contentSize, { width: 468, height: 96 }, 'NormalLayout must resize the direct sliced fill without a ProgressBar state component');
assert.deepEqual(fillSpriteNode.position, { x: -58.5, y: 0, z: 0 }, 'NormalLayout direct rendering must retain the left-inset fill geometry');

const legacyProgressStub = { progress: -1 };
controller.capacityTrack = null;
controller.capacityProgress = legacyProgressStub;
controller.refreshStatus();
assert.equal(
    legacyProgressStub.progress,
    0.5,
    'CompactLayout ProgressBar-only test stubs must retain their capacity update when no scene track node is active',
);

assert.match(
    controllerSource,
    /if \(name === 'NormalLayout'\) \{\s*capacityTrack = this\.requireConveyorNode\(\s*capacityBadge,\s*'PchCapacityTrack'/,
    'only the active NormalLayout may bind the scene-owned sliced capacity track',
);
assert.match(
    controllerSource,
    /this\.capacityProgress\.progress = clampedCapacityRatio;\s*}\s*this\.renderNormalCapacityTrack\(this\.capacityTrack, clampedCapacityRatio\);/,
    'the same clamped ratio must update Compact ProgressBar state and render the direct Normal scene node',
);
assert.match(
    controllerSource,
    /'TrackSprite'[\s\S]*'FillSprite'[\s\S]*Sprite\.Type\.SLICED/,
    'the formal scene node must fail fast unless both direct children use Cocos sliced Sprites',
);
assert.match(
    controllerSource,
    /const PCH_CAPACITY_SLICED_RENDER_SCALE = 0\.25;[\s\S]*trackTransform\.setContentSize\(width \/ highResolutionScale, height \/ highResolutionScale\);[\s\S]*fillTransform\.setContentSize\(fillWidth \/ highResolutionScale, fillHeight \/ highResolutionScale\);/,
    'the Normal renderer must preserve a 4x high-resolution track and fill as the Inspector-owned parent changes size',
);

console.log('pch-normal-capacity-track-graphics.test.js passed');
