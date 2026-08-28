'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

const clipPath = 'assets/BootstrapBundle/Animations/PchCapacityFullWarning.anim';
const clipMetaPath = `${clipPath}.meta`;
const clip = readJson(clipPath);
const clipMeta = readJson(clipMetaPath);
const folderMeta = readJson('assets/BootstrapBundle/Animations.meta');
const scene = readJson('assets/BootstrapBundle/Scenes/Game.scene');
const controllerSourcePath = path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts');
const controllerSource = fs.readFileSync(controllerSourcePath, 'utf8');

const expectedTimes = [0, 29 / 60, 30 / 60, 90 / 60, 91 / 60, 120 / 60];
const expectedFillColors = [
    [255, 255, 1, 255],
    [255, 255, 1, 255],
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [255, 255, 1, 255],
    [255, 255, 1, 255],
];
const expectedOutlineColors = [
    [0, 0, 0, 255],
    [0, 0, 0, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255],
];

assert.equal(folderMeta.importer, 'directory');
assert.equal(folderMeta.ver, '1.2.0');
assert.equal(clipMeta.importer, 'animation-clip');
assert.equal(clipMeta.ver, '2.0.4');
assert.equal(clipMeta.userData.name, 'PchCapacityFullWarning');
assert.equal(clip.__type__, 'cc.AnimationClip');
assert.equal(clip._name, 'PchCapacityFullWarning');
assert.equal(clip.sample, 60);
assert.equal(clip.speed, 1);
assert.equal(clip.wrapMode, 2);
assert.equal(clip._duration, 2);
assert.equal(clip._tracks.length, 2);
assert.deepEqual(clip._events, []);
assert.deepEqual(clip._embeddedPlayers, []);

const trackColors = (track) => expectedTimes.map((_time, keyIndex) => (
    track._channels.map((channel) => channel._curve._values[keyIndex].value)
));
for (const [track, propertyName, expectedColors] of [
    [clip._tracks[0], 'color', expectedFillColors],
    [clip._tracks[1], 'outlineColor', expectedOutlineColors],
]) {
    assert.equal(track.__type__, 'cc.animation.ColorTrack');
    assert.equal(track._binding.path._paths.length, 2);
    assert.equal(track._binding.path._paths[0].__type__, 'cc.animation.ComponentPath');
    assert.equal(track._binding.path._paths[0].component, 'cc.Label');
    assert.equal(track._binding.path._paths[1], propertyName);
    assert.equal(track._binding.proxy, null);
    assert.equal(track._channels.length, 4);
    for (const channel of track._channels) {
        assert.deepEqual(channel._curve._times, expectedTimes);
        assert.equal(channel._curve._values.length, expectedTimes.length);
        assert.ok(
            channel._curve._values.every((value) => value.interpolationMode === 1),
            `${propertyName} must use constant interpolation for one-frame color changes`,
        );
    }
    assert.deepEqual(trackColors(track), expectedColors);
}

const refId = (value) => value && Number.isInteger(value.__id__) ? value.__id__ : null;
const recordAt = (reference) => scene[refId(reference)];
const children = (node) => (node?._children || []).map(recordAt);
const child = (node, name) => children(node).find((entry) => entry?._name === name);
const component = (node, type) => (node?._components || []).map(recordAt)
    .find((entry) => entry?.__type__ === type);
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
assert.deepEqual(referenceIssues, []);

const conveyorRoot = scene.find((record) => record?.__type__ === 'cc.Node' && record._name === 'PchConveyorRoot');
const normalLayout = child(conveyorRoot, 'NormalLayout');
const compactLayout = child(conveyorRoot, 'CompactLayout');
const normalBadge = child(normalLayout, 'PchCapacityBadge');
const compactBadge = child(compactLayout, 'PchCapacityBadge');
const normalCount = child(normalBadge, 'CapacityCount');
const compactCount = child(compactBadge, 'CapacityCount');
const normalAnimation = component(normalCount, 'cc.Animation');

assert.equal(normalBadge._lpos.x, 0);
assert.equal(normalBadge._lpos.y, 0);
assert.equal(compactBadge._lpos.x, 0);
assert.equal(compactBadge._lpos.y, -117.66);
assert.ok(normalAnimation, 'Normal CapacityCount must own the warning Animation');
assert.equal(component(compactCount, 'cc.Animation'), undefined, 'Compact must remain animation-free');
assert.equal(normalAnimation.node.__id__, scene.indexOf(normalCount));
assert.equal(normalAnimation.playOnLoad, false);
assert.equal(normalAnimation._clips.length, 1);
assert.equal(normalAnimation._clips[0].__uuid__, clipMeta.uuid);
assert.equal(normalAnimation._clips[0].__expectedType__, 'cc.AnimationClip');
assert.equal(normalAnimation._defaultClip.__uuid__, clipMeta.uuid);
assert.equal(normalAnimation._defaultClip.__expectedType__, 'cc.AnimationClip');

const controllerCompiled = ts.transpileModule(controllerSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
    },
    fileName: controllerSourcePath,
    reportDiagnostics: true,
});
assert.equal(
    (controllerCompiled.diagnostics || []).length,
    0,
    (controllerCompiled.diagnostics || []).map((item) => item.messageText).join('\n'),
);

class FakeColor {
    constructor(r = 0, g = 0, b = 0, a = 255) {
        Object.assign(this, { r, g, b, a });
    }
}
class FakeVec2 {}
class FakeVec3 {
    clone() { return new FakeVec3(); }
    static distance() { return 0; }
}
class FakeNodePool {
    clear() {}
}
class RuntimeStub {}

const loadedModule = { exports: {} };
const loadController = new Function('module', 'exports', 'require', controllerCompiled.outputText);
loadController(loadedModule, loadedModule.exports, (request) => {
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
            NodePool: FakeNodePool,
            Tween: { stopAllByTarget() {}, pauseAllByTarget() {}, resumeAllByTarget() {} },
            Vec2: FakeVec2,
            Vec3: FakeVec3,
            tween() { return { delay() { return this; }, to() { return this; }, call() { return this; }, start() { return this; } }; },
        }, {
            get(target, key) {
                return key in target ? target[key] : RuntimeStub;
            },
        });
    }
    throw new Error(`unexpected controller dependency: ${request}`);
});

const { PchConveyorGameplayController } = loadedModule.exports;
let completionRefreshCount = 0;
let skillRefreshCount = 0;
let clearEndgameHintsCount = 0;
let playWinCount = 0;
const controller = new PchConveyorGameplayController({
    refreshCompletionProgressLabel() { completionRefreshCount += 1; },
    syncSkillButtonRuntimeStates() { skillRefreshCount += 1; },
    clearEndgameHints() { clearEndgameHintsCount += 1; },
    playPatternCompleteThenWin() { playWinCount += 1; },
});
const animation = {
    playCalls: [],
    stopCalls: 0,
    play(name) { this.playCalls.push(name); },
    stop() { this.stopCalls += 1; },
};
const countLabel = { isValid: true, string: '', color: null, outlineColor: null };
const progressBar = { progress: -1 };
controller.rules = { bufferCount: 59, bufferCapacity: 60, entryCount: 0, carrierCount: 20 };
controller.countLabel = countLabel;
controller.capacityProgress = progressBar;
controller.capacityWarningAnimation = animation;

controller.refreshStatus();
assert.equal(countLabel.string, '59/60');
assert.equal(progressBar.progress, 59 / 60);
assert.deepEqual(animation.playCalls, []);

controller.rules.bufferCount = 60;
controller.refreshStatus();
controller.refreshStatus();
assert.equal(countLabel.string, '60/60');
assert.equal(progressBar.progress, 1);
assert.deepEqual(animation.playCalls, ['PchCapacityFullWarning'], 'full refresh must start only once');

controller.rules.bufferCount = 59;
controller.refreshStatus();
assert.equal(animation.stopCalls, 0, 'leaving full capacity must keep the warning latched');
assert.deepEqual(animation.playCalls, ['PchCapacityFullWarning']);
assert.equal(controller.capacityWarningActive, true);
assert.equal(countLabel.color, null);
assert.equal(countLabel.outlineColor, null);
assert.equal(completionRefreshCount, 4);
assert.equal(skillRefreshCount, 4);

controller.root = { isValid: true };
controller.pauseForSettlement();
assert.equal(animation.stopCalls, 1, 'settlement must stop the latched warning');
assert.deepEqual(countLabel.color, new FakeColor(43, 43, 43, 255));
assert.deepEqual(countLabel.outlineColor, new FakeColor(255, 221, 35, 255));
assert.equal(controller.capacityWarningActive, false);

controller.resumeAfterSettlement();
controller.rules.bufferCount = 60;
controller.refreshStatus();
assert.deepEqual(
    animation.playCalls,
    ['PchCapacityFullWarning', 'PchCapacityFullWarning'],
    'a new full-capacity event after settlement resume must start a new latched warning',
);

controller.commitFinish();
assert.equal(animation.stopCalls, 2, 'PCH win commit must stop the latched warning');
assert.equal(controller.capacityWarningActive, false);
assert.equal(clearEndgameHintsCount, 1);
assert.equal(playWinCount, 1);

const stopStart = controllerSource.indexOf('    stop(): void {');
const updateStart = controllerSource.indexOf('    update(deltaTime: number): void {', stopStart);
const stopSource = controllerSource.slice(stopStart, updateStart);
assert.ok(stopStart >= 0 && updateStart > stopStart);
assert.ok(stopSource.includes('this.resetCapacityWarning();'));
assert.ok(
    stopSource.indexOf('this.resetCapacityWarning();') < stopSource.indexOf('this.capacityWarningAnimation = null;'),
    'stop must reset the warning before releasing its scene references',
);

const syncStart = controllerSource.indexOf('    private syncCapacityWarning(isFull: boolean): void {');
const resetStart = controllerSource.indexOf('    private resetCapacityWarning(): void {', syncStart);
const syncSource = controllerSource.slice(syncStart, resetStart);
assert.ok(syncStart >= 0 && resetStart > syncStart);
assert.ok(syncSource.includes('if (!isFull || this.capacityWarningActive) return;'));
assert.doesNotMatch(syncSource, /resetCapacityWarning/);
assert.doesNotMatch(syncSource, /AudioMgr|vibrate|tween|NodePool|isBufferDeadlocked/);

const pauseStart = controllerSource.indexOf('    pauseForSettlement(): void {');
const resumeStart = controllerSource.indexOf('    resumeAfterSettlement(): void {', pauseStart);
const pauseSource = controllerSource.slice(pauseStart, resumeStart);
assert.ok(pauseStart >= 0 && resumeStart > pauseStart);
assert.ok(pauseSource.includes('this.resetCapacityWarning();'));

const commitStart = controllerSource.indexOf('    private commitFinish(): void {');
const createFlyBeanStart = controllerSource.indexOf('    private createFlyBean(', commitStart);
const commitSource = controllerSource.slice(commitStart, createFlyBeanStart);
assert.ok(commitStart >= 0 && createFlyBeanStart > commitStart);
assert.ok(
    commitSource.indexOf('this.resetCapacityWarning();')
        < commitSource.indexOf('this.runtime.playPatternCompleteThenWin?.();'),
    'win commit must reset the warning before starting settlement',
);

console.log('conveyor-capacity-full-warning.test.js passed');
