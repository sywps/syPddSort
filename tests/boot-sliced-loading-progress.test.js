'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const oldTrackUuid = '16db2ca5-83d3-4383-9fe1-8a9622042057@f9941';
const oldFillUuid = 'c6e7abcb-53ea-4f34-abe3-310d0bd7be78@f9941';
const trackUuid = '3913745c-f5b0-43d5-abd8-2acc459ed822@f9941';
const fillUuid = '9693a1f9-ca88-4c95-83de-10867850c428@f9941';

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readScene(relativePath) {
    return JSON.parse(read(relativePath));
}

function findNode(scene, name) {
    const index = scene.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
    assert.notEqual(index, -1, `missing scene node ${name}`);
    return scene[index];
}

function findComponent(scene, node, type) {
    const component = (node._components || [])
        .map((reference) => scene[reference.__id__])
        .find((entry) => entry?.__type__ === type);
    assert.ok(component, `missing ${type} on ${node._name}`);
    return component;
}

function hasComponent(scene, node, type) {
    return (node._components || [])
        .map((reference) => scene[reference.__id__])
        .some((entry) => entry?.__type__ === type);
}

function assetHash(relativePath) {
    return crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, relativePath)))
        .digest('hex');
}

const bootScene = readScene('assets/Scenes/Boot.scene');
const bootSceneText = JSON.stringify(bootScene);
const track = findNode(bootScene, 'LoadingBarTrack');
const progressArea = findNode(bootScene, 'ProgressBarArea');
const trackSpriteNode = findNode(bootScene, 'TrackSprite');
const fillNode = findNode(bootScene, 'ProgressFill');
const trackTransform = findComponent(bootScene, track, 'cc.UITransform');
const progressAreaTransform = findComponent(bootScene, progressArea, 'cc.UITransform');
const trackSpriteTransform = findComponent(bootScene, trackSpriteNode, 'cc.UITransform');
const fillTransform = findComponent(bootScene, fillNode, 'cc.UITransform');
const trackSprite = findComponent(bootScene, trackSpriteNode, 'cc.Sprite');
const fillSprite = findComponent(bootScene, fillNode, 'cc.Sprite');

assert.deepEqual(trackTransform._contentSize, {
    __type__: 'cc.Size', width: 430, height: 24,
}, 'Boot loading root must own the physical sliced-bar size');
assert.deepEqual(progressAreaTransform._contentSize, {
    __type__: 'cc.Size', width: 430, height: 24,
}, 'ProgressBarArea must match the physical sliced-bar size');
assert.equal(hasComponent(bootScene, progressArea, 'cc.ProgressBar'), false,
    'Boot loading must not retain a reachable native ProgressBar');
assert.deepEqual(trackSpriteTransform._contentSize, {
    __type__: 'cc.Size', width: 1720, height: 96,
}, 'Boot track source must retain 4x source dimensions');
assert.equal(trackSpriteNode._lscale.x, 0.25, 'Boot track must render its source at quarter scale');
assert.equal(trackSpriteNode._lscale.y, 0.25, 'Boot track must render its source at quarter scale');
assert.equal(trackSprite._type, 1, 'Boot track must use Sliced Sprite mode');
assert.equal(trackSprite._spriteFrame.__uuid__, trackUuid, 'Boot track must bind its Boot-local sliced sprite');
assert.equal(fillNode._active, false, 'Boot fill must begin hidden at zero progress');
assert.deepEqual(fillTransform._contentSize, {
    __type__: 'cc.Size', width: 0, height: 72,
}, 'Boot fill must begin as a high-resolution zero-width sprite');
assert.equal(fillTransform._anchorPoint.x, 0.5, 'Boot fill must remain center anchored for physical positioning');
assert.equal(fillNode._lscale.x, 0.25, 'Boot fill must render at quarter scale');
assert.equal(fillNode._lscale.y, 0.25, 'Boot fill must render at quarter scale');
assert.equal(fillSprite._type, 1, 'Boot fill must use Sliced Sprite mode');
assert.equal(fillSprite._spriteFrame.__uuid__, fillUuid, 'Boot fill must bind its Boot-local sliced sprite');
assert.equal(bootSceneText.includes(oldTrackUuid), false, 'Boot scene must release the old track UUID');
assert.equal(bootSceneText.includes(oldFillUuid), false, 'Boot scene must release the old fill UUID');

const trackMeta = JSON.parse(read('assets/Textures/UI/loading_progress_track_sliced.png.meta'));
const fillMeta = JSON.parse(read('assets/Textures/UI/loading_progress_fill_sliced.png.meta'));
assert.equal(trackMeta.uuid, trackUuid.slice(0, 36), 'Boot track metadata must own an independent asset UUID');
assert.equal(fillMeta.uuid, fillUuid.slice(0, 36), 'Boot fill metadata must own an independent asset UUID');
assert.deepEqual(trackMeta.subMetas.f9941.userData.borderLeft, 48, 'Boot track must preserve the 4x cap border');
assert.deepEqual(fillMeta.subMetas.f9941.userData.borderLeft, 36, 'Boot fill must preserve the 4x cap border');
assert.equal(
    assetHash('assets/Textures/UI/loading_progress_track_sliced.png'),
    assetHash('assets/BootstrapBundle/GameUI/RainbowConveyor/Atlases/PchCapacity/pch_capacity_track_sliced.png'),
    'Boot track pixels must exactly match the corrected PCH visual',
);
assert.equal(
    assetHash('assets/Textures/UI/loading_progress_fill_sliced.png'),
    assetHash('assets/BootstrapBundle/GameUI/RainbowConveyor/Atlases/PchCapacity/pch_capacity_fill_sliced.png'),
    'Boot fill pixels must exactly match the corrected PCH visual',
);

for (const relativePath of [
    'assets/Textures/UI/loading_progress_track.png',
    'assets/Textures/UI/loading_progress_track.png.meta',
    'assets/Textures/UI/loading_progress_fill.png',
    'assets/Textures/UI/loading_progress_fill.png.meta',
]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, `obsolete loading resource must be removed: ${relativePath}`);
}

const adapter = read('assets/Scripts/Core/SlicedLoadingProgressAdapter.ts');
const bootController = read('assets/Scripts/Core/BootSceneCtrl.ts');
const themeModule = read('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts');
const shareModule = read('assets/Scripts/Core/GameCtrlModules/GameplayShareLoadingModule.ts');
assert.ok(adapter.includes('Object.defineProperties(adapter,'), 'shared adapter must expose a tweenable object target');
assert.ok(adapter.includes('Sprite.Type.SLICED'), 'shared adapter must fail fast if sliced scene bindings are missing');
const startupController = read('assets/Scripts/Core/StartupLoadingController.ts');
assert.ok(startupController.includes('createSlicedLoadingProgressAdapter'), 'persistent Boot UI must reuse the sliced adapter');
for (const source of [bootController, themeModule, shareModule]) {
    assert.equal(/\bProgressBar\b/.test(source), false, 'old loading callers must not depend on native ProgressBar');
}
assert.ok(startupController.includes('width / this.progress.fillRenderScale'), 'waiting sweep must preserve high-resolution rendering scale');

for (const relativePath of [
    'assets/Scripts/Core/SlicedLoadingProgressAdapter.ts',
    'assets/Scripts/Core/BootSceneCtrl.ts',
    'assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts',
    'assets/Scripts/Core/GameCtrlModules/GameplayShareLoadingModule.ts',
]) {
    const result = ts.transpileModule(read(relativePath), {
        compilerOptions: {
            experimentalDecorators: true,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: relativePath,
        reportDiagnostics: true,
    });
    const errors = (result.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${relativePath} must transpile without TypeScript syntax errors`);
}

console.log('boot-sliced-loading-progress.test.js passed');
