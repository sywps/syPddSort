const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readScene(relPath) {
    return JSON.parse(read(relPath));
}

function findNode(scene, name) {
    const index = scene.findIndex((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === name);
    assert.notStrictEqual(index, -1, `missing scene node: ${name}`);
    return { index, node: scene[index] };
}

function findComponent(scene, node, type) {
    const component = (node._components || [])
        .map((ref) => scene[ref.__id__])
        .find((entry) => entry?.__type__ === type);
    assert.ok(component, `missing ${type} on node ${node._name}`);
    return component;
}

const startupRoute = read('assets/Scripts/Core/StartupRouteService.ts');
const bootSceneCtrl = read('assets/Scripts/Core/BootSceneCtrl.ts');
const bootScene = readScene('assets/Scenes/Boot.scene');
const gameSceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const firstLevelRoute = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
const cocosSpec = read('docs/cocos-ai-code-ai-collaboration-spec-v1.md');

assert.ok(
    cocosSpec.includes('三类用户启动后的第一个业务场景都必须是 `Game.scene`'),
    'project v1 spec must keep A/B/C first business scene on Game.scene',
);
assert.ok(
    cocosSpec.includes('B 注入 `pdd.level = N` 且 `N >= 2` 验证进入 `Game.scene` 第 N 关'),
    'project v1 spec must keep B startup as local pdd.level=N direct Game level N',
);

assert.ok(
    startupRoute.includes("const LS_LEVEL = 'pdd.level'"),
    'startup route must read the raw pdd.level key',
);
assert.ok(
    startupRoute.includes('const raw = sys.localStorage.getItem(LS_LEVEL)'),
    'startup route must use raw localStorage instead of default-only saved-level helpers',
);
assert.ok(
    startupRoute.includes('if (localLevel >= 2)'),
    'B-class local progress must be detected from local pdd.level >= 2',
);
assert.ok(
    startupRoute.includes("reason: 'local_progress_gt_1'"),
    'B-class route decision must retain a local-progress reason for diagnostics',
);

assert.ok(
    bootSceneCtrl.includes('appRoot.markGameRequested(routeDecision.levelId, routeDecision.prefix,'),
    'Boot must convert B-class route decisions into pending gameplay requests before Game.scene starts',
);
assert.ok(
    bootSceneCtrl.includes('void appRoot.router.toGame()'),
    'Boot must route every startup class into Game.scene',
);
assert.ok(
    bootSceneCtrl.includes('this.showBootLoadingUi();'),
    'Boot must show the deer technical loading shell instead of exposing the Cocos default splash',
);
assert.ok(
    !bootSceneCtrl.includes('hideBootLoadingUi'),
    'Boot must not hide the deer technical loading shell before Game.scene is ready',
);
assert.strictEqual(
    findNode(bootScene, 'StartupLoadingUI').node._active,
    true,
    'Boot.scene StartupLoadingUI must be active by default so Cocos default splash does not leak',
);
assert.strictEqual(
    findNode(bootScene, 'LoadingCover').node._active,
    true,
    'Boot.scene LoadingCover must be active by default',
);
assert.strictEqual(
    findComponent(bootScene, findNode(bootScene, 'LoadingCover').node, 'cc.Sprite')._spriteFrame?.__uuid__,
    '68c7d0e7-b854-4fd7-903e-6176fb9aebbb@f9941',
    'Boot.scene LoadingCover must use the deer loading image',
);
assert.ok(
    gameSceneRuntime.includes('this.primePendingGameplayShell(pendingGameplayRequest)'),
    'Game.scene must prime the visible shell from pending B-class target before loading finishes',
);
assert.ok(
    gameSceneRuntime.includes('label.string = `第${levelId}关`;'),
    'pending B startup must not expose the Game prefab default level-1 title while resources load',
);
assert.ok(
    gameSceneRuntime.includes('blocker.enabled = showOverlay;'),
    'Game.scene startup loading overlay must block input while target level resources load',
);
assert.ok(
    !gameSceneRuntime.includes('if (showOverlay && typeof this.runtime.showLoadingOverlay'),
    'Game.scene startup must not reuse the Boot full loading builder because Game.scene owns a lighter StartupLoadingUI',
);
assert.ok(
    gameSceneRuntime.includes('promoteLoadingOverlayToFront'),
    'Game.scene loading cover must be promoted above gameplay HUD during startup',
);

assert.ok(
    firstLevelRoute.includes('const pendingMainGameplayRequest = !urlLevelFile'),
    'Game startup must classify pending main gameplay requests before choosing the fast path',
);
assert.ok(
    firstLevelRoute.includes('const pendingStartupLevelId = pendingMainGameplayRequest'),
    'Game startup must derive the fast startup level from the pending request',
);
assert.ok(
    firstLevelRoute.includes('const startupLevelId = urlLevelFile ? 0 : (urlLevel > 0 ? urlLevel : (pendingStartupLevelId || defaultEntryLevel))'),
    'pending B startup level must take priority over default level after cloud restore begins',
);
assert.ok(
    firstLevelRoute.includes('&& (!pendingSceneGameplayRequest || !!pendingMainGameplayRequest)'),
    'pending main gameplay must be allowed into the startup fast path',
);
assert.ok(
    !firstLevelRoute.includes('if (!pendingSceneGameplayRequest && startupLevelId > 0'),
    'pending B users must not be forced into preloadAllAssets by the old no-pending guard',
);
assert.ok(
    firstLevelRoute.includes('this.startGameAssetsLevelFast(startupLevelId, fastPrefix, startupLevelId)'),
    'pending B target levels beyond bootstrap must start through the direct Game fast path',
);

console.log('startup-route-abc.test.js passed');
