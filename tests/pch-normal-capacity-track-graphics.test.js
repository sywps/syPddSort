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
const graphics = new FakeGraphics();
const capacityTrack = new FakeNode(new Map([
    [FakeUITransform, transform],
    [FakeGraphics, graphics],
]), 'PchCapacityTrack');

controller.renderNormalCapacityTrack(capacityTrack, 0);
assert.deepEqual(graphics.roundRects, [
    { x: -90, y: -12, width: 180, height: 24, radius: 12, color: [45, 45, 45, 255] },
    { x: -89, y: -11, width: 178, height: 22, radius: 11, color: [68, 68, 68, 255] },
], 'zero capacity must draw only the smooth dark outer rim and gray inner track');

controller.renderNormalCapacityTrack(capacityTrack, 0.5);
assert.deepEqual(graphics.roundRects[2], {
    x: -87,
    y: -9,
    width: 87,
    height: 18,
    radius: 9,
    color: [119, 239, 67, 255],
}, 'half capacity must draw an inset rounded green fill without exposing a square end');

controller.renderNormalCapacityTrack(capacityTrack, 2);
assert.deepEqual(graphics.roundRects[2], {
    x: -87,
    y: -9,
    width: 174,
    height: 18,
    radius: 9,
    color: [119, 239, 67, 255],
}, 'over-capacity input must clamp to the full inset width');

transform.setContentSize(240, 30);
transform.setAnchorPoint(0.25, 0.75);
controller.renderNormalCapacityTrack(capacityTrack, 0.5);
assert.deepEqual(graphics.roundRects[2], {
    x: -117,
    y: -12,
    width: 117,
    height: 24,
    radius: 12,
    color: [119, 239, 67, 255],
}, 'later Inspector size changes must be used directly by the scene-owned Graphics node');

const scene = JSON.parse(fs.readFileSync(path.join(root, 'assets/BootstrapBundle/Scenes/Game.scene'), 'utf8'));
const normalTrackIndex = scene.findIndex((record) => record?._name === 'PchCapacityTrack'
    && record?._parent?.__id__ === 292);
assert.ok(normalTrackIndex >= 0, 'NormalLayout must serialize PchCapacityTrack directly under PchCapacityBadge');
const normalTrack = scene[normalTrackIndex];
const normalComponentTypes = normalTrack._components.map((reference) => scene[reference.__id__]?.__type__);
assert.deepEqual(normalComponentTypes, ['cc.UITransform', 'cc.Graphics'], 'NormalLayout track must own only its transform and Graphics renderer');
assert.equal(
    scene.some((record) => record?._name === 'ProgressTrack' && record?._parent?.__id__ === 292),
    false,
    'NormalLayout must not retain the legacy ProgressTrack node name',
);
for (const childIndex of normalTrack._children.map((reference) => reference.__id__)) {
    assert.equal(scene[childIndex]?._active, false, 'legacy Normal-only sprite children must remain inactive');
}

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
assert.deepEqual(graphics.roundRects[2], {
    x: -117,
    y: -12,
    width: 117,
    height: 24,
    radius: 12,
    color: [119, 239, 67, 255],
}, 'NormalLayout must render the direct scene track without a ProgressBar state component');

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
    'only the active NormalLayout may bind the scene-owned Graphics capacity track',
);
assert.match(
    controllerSource,
    /this\.capacityProgress\.progress = clampedCapacityRatio;\s*}\s*this\.renderNormalCapacityTrack\(this\.capacityTrack, clampedCapacityRatio\);/,
    'the same clamped ratio must update Compact ProgressBar state and render the direct Normal scene node',
);
assert.match(
    controllerSource,
    /if \(!graphics \|\| !transform\) \{\s*throw new Error\('\[pch-core\] NormalLayout PchCapacityTrack must provide Graphics and UITransform'\);/,
    'the formal scene node must fail fast when its required renderer components are absent',
);

console.log('pch-normal-capacity-track-graphics.test.js passed');
