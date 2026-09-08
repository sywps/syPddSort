const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
}

function readScene(relPath) {
    return JSON.parse(read(relPath));
}

function findNode(scene, name) {
    const index = scene.findIndex((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === name);
    assert.notStrictEqual(index, -1, `missing scene node: ${name}`);
    return { index, node: scene[index] };
}

function componentTypes(scene, node) {
    return (node._components || []).map((ref) => scene[ref.__id__]?.__type__);
}

const gameScene = readScene('assets/BootstrapBundle/Scenes/Game.scene');
const gameSceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const loadingOverlayModule = read('assets/Scripts/Core/GameCtrlModules/GameplayShareLoadingModule.ts');
const firstLevelRouteModule = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');

const bootScene = readScene('assets/Scenes/Boot.scene');
const controller = read('assets/Scripts/Core/StartupLoadingController.ts');
assert.ok(!gameScene.some(entry => entry?._name === 'StartupLoadingUI'), 'Game must not keep a second Loading tree');
assert.ok(!JSON.stringify(gameScene).includes('80bbb160-be96-455a-80ef-bcf00793ddae'), 'Game must not reference the removed Bootstrap cover');
assert.ok(!JSON.stringify(gameScene).includes('68c7d0e7-b854-4fd7-903e-6176fb9aebbb'), 'Game must not add a static dependency on main');
assert.ok(JSON.stringify(bootScene).includes('68c7d0e7-b854-4fd7-903e-6176fb9aebbb'), 'main Boot must retain the single cover');
assert.ok(gameSceneRuntime.includes('await appRoot.ensureStartupLoading()'), 'Game must reuse the main-owned UI');
assert.ok(controller.includes('camera.visibility = STARTUP_LAYER'), 'persistent UI must have an isolated camera layer');
assert.ok(controller.includes('camera.priority = 100'), 'Loading camera must draw above Game');

assert.ok(
    gameSceneRuntime.includes('this.runtime.setGameplayStartupRootVisible?.(false)'),
    'Game startup must hide GameplayRoot while the target B-class level is still loading',
);
assert.ok(
    loadingOverlayModule.includes('setGameplayStartupRootVisible(visible: boolean)'),
    'loading overlay module must expose a deterministic way to hide/show GameplayRoot during startup',
);
assert.ok(
    loadingOverlayModule.includes('this.setGameplayStartupRootVisible?.(true);'),
    'loading overlay must restore GameplayRoot before hiding the cover after initGame renders the target level',
);
assert.ok(loadingOverlayModule.includes('loading.finishAfterDraw('), 'ready must wait for the rendered gameplay frame');
assert.ok(loadingOverlayModule.includes('startupLoading?.hide()'), 'fatal cleanup must close the persistent cover');
assert.ok(controller.includes('this.label.string = stage'), 'stage labels must replace synthetic percentages');
assert.ok(controller.includes('this.cancelFinish()'), 'new requests and errors must cancel pending close callbacks');
assert.ok(
    !loadingOverlayModule.includes('_setLoadingProgress(0.5')
    && !loadingOverlayModule.includes('_setLoadingProgress(0.8'),
    'startup loading must not manufacture the old 50% and 80% milestones',
);
assert.ok(
    read('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts').includes(`this.setGameplayStartupRootVisible?.(true);
            this.hideLoadingOverlay?.();
            this.showRemoteLoadFatalError`),
    'target-level fail-fast errors must hide the loading cover before showing the fatal error panel',
);

console.log('game-startup-loading-shell.test.js passed');
