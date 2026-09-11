const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
}

const appRoot = read('assets/Scripts/Core/AppRoot.ts');
const sceneRouter = read('assets/Scripts/Core/SceneRouter.ts');
const gameplaySession = read('assets/Scripts/Core/GameplaySessionController.ts');
const postPlayableWarmup = read('assets/Scripts/Core/GameCtrlModules/PostPlayableWarmupModule.ts');
const settingsPanel = read('assets/Scripts/Core/Panels/SettingsPanelController.ts');
const homeAdFlow = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const homeCommerce = read('assets/Scripts/Core/GameCtrlModules/HomeCommerceModule.ts');
const themeLoading = read('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts');
const sceneHomeEntry = read('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts');
const startupCloudRestore = read('assets/Scripts/Core/GameCtrlModules/StartupCloudRestoreHelper.ts');
const gameSceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const gameplayLoading = read('assets/Scripts/Core/GameCtrlModules/GameplayShareLoadingModule.ts');
const appTransition = read('assets/Scripts/Core/AppTransitionController.ts');
const appTransitionPrefab = read('assets/GameAssetsBundle/UI/Prefabs/Panels/AppTransition.prefab');
const appTransitionPrefabJson = JSON.parse(appTransitionPrefab);
const appTransitionPrefabMeta = JSON.parse(read('assets/GameAssetsBundle/UI/Prefabs/Panels/AppTransition.prefab.meta'));
const appTransitionBackgroundMeta = JSON.parse(read('assets/GameAssetsBundle/Textures/UI/app_transition_loading_background.png.meta'));
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
assert.ok(appRoot.includes("const APP_TRANSITION_BUNDLE_NAME = 'gameAssets'"), 'AppRoot must keep the transition in gameAssets');
assert.ok(appRoot.includes("const APP_TRANSITION_PREFAB_PATH = 'UI/Prefabs/Panels/AppTransition'"), 'AppRoot must load the panel-owned transition prefab');
assert.ok(appRoot.includes('assetManager.getBundle(APP_TRANSITION_BUNDLE_NAME)'), 'AppRoot must reuse an already loaded gameAssets bundle');
assert.ok(appRoot.includes('assetManager.loadBundle(APP_TRANSITION_BUNDLE_NAME'), 'AppRoot must explicitly load gameAssets when it is not cached');
assert.ok(!fs.existsSync(path.join(root, 'assets/resources/UI/Prefabs/AppTransition.prefab')), 'the old resources transition prefab must be removed after migration');
assert.equal(appTransitionPrefabMeta.uuid, '124871a8-8107-4658-98e3-ff7315c12537', 'prefab migration must preserve its asset UUID');
assert.equal(appTransitionBackgroundMeta.uuid, '8e8f0bea-1f21-4ca8-bc0f-e2ba4cd62432', 'the themed background must keep its authored UUID');
assert.equal(appTransitionBackgroundMeta.subMetas.f9941.userData.rawWidth, 960, 'the imported background must keep its optimized width');
assert.equal(appTransitionBackgroundMeta.subMetas.f9941.userData.rawHeight, 1280, 'the imported background must keep its optimized height');
for (const [entryIndex, entry] of appTransitionPrefabJson.entries()) {
    for (const match of JSON.stringify(entry).matchAll(/"__id__":(\d+)/g)) {
        assert.ok(Number(match[1]) < appTransitionPrefabJson.length, `prefab object ${entryIndex} must not reference a missing object id`);
    }
}
assert.ok(appRoot.includes("transition.run('route:Home', 'Home', 'reverse', route)"), 'Home route must be wrapped by the reverse transition');
assert.ok(appRoot.includes("transition.run(`route:Game:${prefix}${levelId}`, 'Game', 'forward', route)"), 'Game route must be wrapped by the forward transition');
assert.ok(appRoot.includes("requestHomeRoute(source: string = 'unknown', coverMode: AppRouteCoverMode = 'none')"), 'Home route must default to no cover');
assert.ok(
    appRoot.indexOf('await this.router.toHome();') >= 0
    && appRoot.indexOf('this.markHomeVisible') > appRoot.indexOf('await this.router.toHome();'),
    'Home must be marked visible only after the Home scene load completes',
);

assert.ok(settingsPanel.includes("requestHomeRoute('settings', 'auto')"), 'settings Home button must request the app transition');
assert.ok(
    !settingsPanel.includes("finalizeSettings('settings-home', true);"),
    'settings Home must leave modal teardown to the successful scene transition',
);
assert.ok(homeAdFlow.includes("requestHomeRoute('runtime', 'auto')"), 'runtime Home route must request the app transition');
assert.ok(homeCommerce.includes("requestGameplayRoute(level, 'level_', false, 'auto')"), 'main start button must request the app transition');
assert.ok(themeLoading.includes("requestGameplayRoute(normalizedLevelId, 'zt_level_', false, 'auto')"), 'theme start button must request the app transition');
assert.ok(sceneHomeEntry.includes('this.getGameplayEntryMode(prefix, external),\n                entryCoverMode,'), 'gameplay route must preserve the caller entry-cover mode');
assert.ok(!sceneHomeEntry.includes("entryCoverMode === 'none' ? 'auto'"), 'gameplay route must not silently convert no-cover entry back to auto cover');
assert.ok(!startupCloudRestore.includes("requestGameplayRoute(restoredLevel, 'level_', false, 'cover')"), 'cloud restore route must not request a cover');
assert.ok(startupCloudRestore.includes("requestGameplayRoute(restoredLevel, 'level_', false, 'none')"), 'cloud restore route must enter gameplay without route cover');
assert.ok(gameSceneRuntime.includes("appRoot.completeAppTransitionAfterDraw('Home')"), 'Home must release the transition only after its menu is built');
assert.ok(gameplayLoading.includes("completeAppTransitionAfterDraw?.('Game')"), 'Game must release the transition from the shared visual-ready hook');
assert.ok(gameSceneRuntime.includes("appRoot.isAppTransitionTargeting('Game')"), 'active app transitions must suppress the ordinary startup cover');
assert.ok(appTransition.includes("director.once(Director.EVENT_AFTER_DRAW"), 'transition readiness must wait for a rendered frame');
assert.ok(appTransition.includes('this.blocker.enabled = true'), 'transition must block input while active');
assert.ok(appTransition.includes('this.blocker.enabled = false'), 'transition must release its input blocker after reveal');
const appTransitionRoot = appTransitionPrefabJson.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'AppTransition');
assert.ok(appTransitionRoot && appTransitionRoot._active === false, 'persistent transition prefab must be hidden while idle');
const appTransitionChildNames = appTransitionRoot._children.map((ref) => appTransitionPrefabJson[ref.__id__]?._name);
assert.deepStrictEqual(appTransitionChildNames, ['Camera', 'IrisMask'], 'transition prefab must contain the camera and themed circular layer');
const irisMaskNode = appTransitionPrefabJson.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'IrisMask');
const contentNode = appTransitionPrefabJson[irisMaskNode?._children?.[0]?.__id__];
assert.equal(contentNode?._name, 'Content', 'the circular mask must own one fixed-size themed content root');
const contentChildNames = contentNode._children.map((ref) => appTransitionPrefabJson[ref.__id__]?._name);
assert.deepStrictEqual(contentChildNames, ['Background', 'Illustration', 'Tip'], 'themed content must stay fully prefab-owned');
const irisMask = irisMaskNode._components
    .map((ref) => appTransitionPrefabJson[ref.__id__])
    .find((component) => component?.__type__ === 'cc.Mask');
assert.equal(irisMask?._type, 1, 'the transition content must be clipped by an ellipse mask');
const spriteFrameFor = (nodeName) => {
    const node = appTransitionPrefabJson.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === nodeName);
    return node?._components
        .map((ref) => appTransitionPrefabJson[ref.__id__])
        .find((component) => component?.__type__ === 'cc.Sprite')?._spriteFrame?.__uuid__;
};
assert.equal(spriteFrameFor('Background'), '8e8f0bea-1f21-4ca8-bc0f-e2ba4cd62432@f9941', 'transition must use the imported bright island-blue background with broad flowing tonal bands');
assert.equal(spriteFrameFor('Illustration'), '123c4ced-f82b-4826-9499-1d90c53d8478@f9941', 'transition must reuse revive_timeout_illustration');
const illustrationNode = appTransitionPrefabJson.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'Illustration');
const illustrationSize = illustrationNode?._components
    .map((ref) => appTransitionPrefabJson[ref.__id__])
    .find((component) => component?.__type__ === 'cc.UITransform')?._contentSize;
assert.deepStrictEqual([illustrationSize?.width, illustrationSize?.height], [500, 452], 'revive illustration must preserve its trimmed sprite aspect');
const tipNode = appTransitionPrefabJson.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'Tip');
const tipLabel = tipNode?._components
    .map((ref) => appTransitionPrefabJson[ref.__id__])
    .find((component) => component?.__type__ === 'cc.Label');
assert.equal(tipLabel?._string, '时刻关注图案空格子和传送带棋子的颜色哦，在传送带满之前请填掉格子～', 'transition must keep one fixed gameplay tip in the prefab');
assert.ok(!appTransition.includes('BEAN_SPACING'), 'transition must not restore the full-screen bean grid');
assert.ok(!appTransition.includes('COVERED_MIN_DURATION'), 'transition must not add a fixed full-screen hold after the destination is ready');
assert.ok(!appTransition.includes('coveredElapsed'), 'transition must begin retracting as soon as the task and first rendered frame are ready');
assert.ok(appTransition.includes("this.state === 'covering' || this.state === 'revealing'"), 'cover and reveal must reuse the same themed circular layer');
assert.ok(appTransition.includes('this.irisMask.setContentSize(diameter, diameter)'), 'transition must drive one centered circular mask');
assert.ok(!appTransition.includes('drawOutsideCircle'), 'reveal must not expand a transparent window into the new scene');
const appTransitionCanvas = appTransitionRoot._components
    .map((ref) => appTransitionPrefabJson[ref.__id__])
    .find((component) => component?.__type__ === 'cc.Canvas');
assert.equal(appTransitionPrefabJson[appTransitionCanvas?._cameraComponent?.__id__]?.__type__, 'cc.Camera', 'transition Canvas must reference its authored camera');

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
assert.ok(!postPlayableWarmup.includes('preloadHomeScene('), 'post-playable warmup must not deserialize and retain Home.scene without user intent');
assert.ok(!settingsPanel.includes("preloadHomeScene('settings-home-intent')"), 'settings Home correctness must not depend on a speculative scene preload');

console.log('scene-router-home-transition.test.js passed');
