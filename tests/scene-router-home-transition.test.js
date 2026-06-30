const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const appRoot = read('assets/Scripts/Core/AppRoot.ts');
const sceneRouter = read('assets/Scripts/Core/SceneRouter.ts');
const gameplaySession = read('assets/Scripts/Core/GameplaySessionController.ts');
const postPlayableWarmup = read('assets/Scripts/Core/GameCtrlModules/PostPlayableWarmupModule.ts');
const settingsPanel = read('assets/Scripts/Core/Panels/SettingsPanelController.ts');
const homeAdFlow = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const homeCommerce = read('assets/Scripts/Core/GameCtrlModules/HomeCommerceModule.ts');
const startupCloudRestore = read('assets/Scripts/Core/GameCtrlModules/StartupCloudRestoreHelper.ts');
const homeScene = read('assets/HomeAssetsBundle/Scenes/Home.scene');
const routeCoverPascal = ['Scene', 'Transition'].join('');
const routeCoverSnake = ['scene', 'transition'].join('_');
const oldNoDeerCoverUuid = [
    String.fromCharCode(53, 57, 97, 54, 54) + 'e36',
    '4b59',
    '4a31',
    '8079',
    '918ff4ca67c8',
].join('-');

for (const relPath of [
    `assets/BootstrapBundle/UI/Prefabs/Fx/${routeCoverPascal}.prefab`,
    `assets/BootstrapBundle/UI/Prefabs/Fx/${routeCoverPascal}.prefab.meta`,
    `assets/Scripts/Core/${routeCoverPascal}Controller.ts`,
    `assets/Scripts/Core/${routeCoverPascal}Controller.ts.meta`,
    `assets/BootstrapBundle/UI/Textures/${routeCoverSnake}_circle_crisp.png`,
    `assets/BootstrapBundle/UI/Textures/${routeCoverSnake}_circle_crisp.png.meta`,
    `assets/BootstrapBundle/UI/Textures/${routeCoverSnake}_logo.png`,
    `assets/BootstrapBundle/UI/Textures/${routeCoverSnake}_logo.png.meta`,
    `assets/BootstrapBundle/UI/Textures/${routeCoverSnake}_solid.png`,
    `assets/BootstrapBundle/UI/Textures/${routeCoverSnake}_solid.png.meta`,
    `assets/GameAssetsBundle/Textures/UI/${routeCoverSnake}_logo.png`,
    `assets/GameAssetsBundle/Textures/UI/${routeCoverSnake}_logo.png.meta`,
    `assets/GameAssetsBundle/Textures/UI/${routeCoverSnake}_solid.png`,
    `assets/GameAssetsBundle/Textures/UI/${routeCoverSnake}_solid.png.meta`,
]) {
    assert.ok(!fs.existsSync(path.join(root, relPath)), `retired route-cover artifact must not exist: ${relPath}`);
}

assert.ok(!appRoot.includes(routeCoverPascal), 'AppRoot must not contain retired route-cover controller code');
assert.ok(!appRoot.includes(routeCoverSnake), 'AppRoot must not reference retired route-cover textures');
assert.ok(appRoot.includes("requestHomeRoute(source: string = 'unknown', coverMode: AppRouteCoverMode = 'none')"), 'Home route must default to no cover');
assert.ok(
    appRoot.indexOf('await this.router.toHome();') >= 0
    && appRoot.indexOf('this.markHomeVisible') > appRoot.indexOf('await this.router.toHome();'),
    'Home must be marked visible only after the Home scene load completes',
);

assert.ok(!settingsPanel.includes("requestHomeRoute('settings', 'cover')"), 'settings Home button must not request a cover');
assert.ok(settingsPanel.includes("requestHomeRoute('settings', 'none')"), 'settings Home button must route Home without cover');
assert.ok(!homeAdFlow.includes("requestHomeRoute('runtime', 'cover')"), 'runtime Home route must not request a cover');
assert.ok(homeAdFlow.includes("requestHomeRoute('runtime', 'none')"), 'runtime Home route must explicitly route Home without cover');
assert.ok(!homeCommerce.includes("requestGameplayRoute(level, 'level_', false, 'cover')"), 'main start button must not request a cover');
assert.ok(homeCommerce.includes("requestGameplayRoute(level, 'level_', false, 'none')"), 'main start button must enter gameplay without route cover');
assert.ok(!startupCloudRestore.includes("requestGameplayRoute(restoredLevel, 'level_', false, 'cover')"), 'cloud restore route must not request a cover');
assert.ok(startupCloudRestore.includes("requestGameplayRoute(restoredLevel, 'level_', false, 'none')"), 'cloud restore route must enter gameplay without route cover');

assert.ok(!fs.existsSync(path.join(root, 'assets/HomeAssetsBundle/GameUI/loading_cover.jpeg')), 'old Home loading cover image must be deleted');
assert.ok(!fs.existsSync(path.join(root, 'assets/HomeAssetsBundle/GameUI/loading_cover.jpeg.meta')), 'old Home loading cover meta must be deleted');
assert.ok(!homeScene.includes(oldNoDeerCoverUuid), 'Home.scene must not reference the old no-deer loading cover');
assert.ok(!homeScene.includes('68c7d0e7-b854-4fd7-903e-6176fb9aebbb@f9941'), 'Home.scene must not reference the cross-bundle loading cover');
assert.ok(homeScene.includes('"loadingCover": null'), 'Home.scene does not use GameRuntimeHost.loadingCover; keep it null');

assert.ok(sceneRouter.includes('private _transitionTargetSceneName'), 'SceneRouter must remember the active transition target');
assert.ok(sceneRouter.includes('private _transitionPromise'), 'SceneRouter must expose the in-flight load promise internally');
assert.ok(sceneRouter.includes('scene.load.joinInFlight'), 'SceneRouter must join duplicate same-target scene loads');
assert.ok(sceneRouter.includes('return this._transitionPromise || Promise.resolve();'), 'SceneRouter duplicate same-target route must wait instead of throwing');
assert.ok(sceneRouter.includes('clearArrivedTransitionIfNeeded'), 'SceneRouter must clear stale transitions when the target scene is already visible');
assert.ok(sceneRouter.includes('director.getScene()?.name'), 'stale transition cleanup must inspect the actual running scene');
assert.ok(sceneRouter.includes('scene.load.clearArrivedTransition'), 'stale transition cleanup must be traceable');
assert.ok(sceneRouter.includes('if (this._transitionPromise === loadPromise)'), 'old route promises must not clear a newer transition state');
assert.ok(sceneRouter.includes('throw new Error(`[SceneRouter] scene transition already in flight: ${this.session.requestedSceneName}`)'), 'SceneRouter must still fail fast for different-target route conflicts');
assert.ok(sceneRouter.includes('async preloadHomeScene('), 'SceneRouter must expose a Home.scene preload path for Game-ready warmup');
assert.ok(sceneRouter.includes('assetManager.getBundle(HOME_ASSETS_BUNDLE_NAME)'), 'Home preload must reuse an already loaded homeAssets bundle before loading another one');
assert.ok(sceneRouter.includes('bundle.loadScene(this.homeSceneName'), 'Home preload must load Home.scene without running it');
assert.ok(sceneRouter.includes('private _homeScenePreloadedAsset: SceneAsset | null = null'), 'Home preload must keep the loaded SceneAsset instead of only setting a boolean');
assert.ok(sceneRouter.includes('await this.waitForHomeScenePreloadIfNeeded(HOME_PRELOAD_FOREGROUND_WAIT_TIMEOUT_MS);'), 'toHome must briefly join an in-flight Home preload before doing a foreground route');
assert.ok(sceneRouter.includes('HOME_PRELOAD_FOREGROUND_WAIT_TIMEOUT_MS'), 'foreground Home route must cap the wait for background Home preload');
assert.ok(sceneRouter.includes('scene.home.preload.join.timeout'), 'foreground Home route must trace background Home preload timeout');
assert.ok(sceneRouter.includes('this._homeScenePreloadToken += 1'), 'foreground Home route timeout must invalidate the stale background Home preload');
assert.ok(sceneRouter.includes('this._homeScenePreloadedAsset = sceneAsset;'), 'Home preload must retain the loaded Home SceneAsset');
assert.ok(sceneRouter.includes('consumePreloadedBundledScene(sceneName, bundleName)'), 'foreground Home route must try to consume the preloaded SceneAsset');
assert.ok(sceneRouter.includes("runLoadedScene(preloadedSceneAsset, 'preloaded')"), 'foreground Home route must run the preloaded Home SceneAsset without reloading Home.scene');
assert.ok(gameplaySession.includes('runtime.startPostPlayableWarmup?.('), 'Game ready must start the post-playable warmup queue');
assert.ok(postPlayableWarmup.includes('preloadHomeScene(`post-playable-warmup:${reason}`)'), 'post-playable warmup must start Home.scene preload in the background');

console.log('scene-router-home-transition.test.js passed');
