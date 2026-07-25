const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

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
const sceneRouter = read('assets/Scripts/Core/SceneRouter.ts');
const cocosSpec = read('docs/cocos-ai-code-ai-collaboration-spec-v1.md');

function normalizeStartupLocalLevel(raw) {
    if (raw === null || raw === undefined) return null;
    const parsed = Math.floor(Number.parseInt(String(raw), 10));
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

function resolveStartupLocalProgressFromRaw(rawLevel) {
    const parsedLevel = normalizeStartupLocalLevel(rawLevel);
    const level = parsedLevel || 1;
    return {
        level,
        rawLevel: rawLevel === null || rawLevel === undefined ? null : String(rawLevel),
    };
}

function loadStartupRouteModule(localValue = null, miniGameQuery = {}, windowSearch = '') {
    const storage = typeof localValue === 'object' && localValue !== null
        ? localValue
        : { 'pdd.level': localValue };
    const output = ts.transpileModule(startupRoute, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === './StartupLocalProgress') {
                return {
                    normalizeStartupLocalLevel,
                    resolveStartupLocalProgressFromRaw,
                    readStartupLocalProgress() {
                        return resolveStartupLocalProgressFromRaw(
                            Object.prototype.hasOwnProperty.call(storage, 'pdd.level') ? storage['pdd.level'] : null,
                        );
                    },
                };
            }
            throw new Error(`unexpected require: ${id}`);
        },
        URLSearchParams,
        globalThis: {
            wx: {
                getLaunchOptionsSync() {
                    return { query: miniGameQuery };
                },
            },
        },
        window: {
            location: { search: windowSearch },
        },
    };
    vm.runInNewContext(output, sandbox, { filename: 'StartupRouteService.ts' });
    return module.exports;
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

assert.ok(
    cocosSpec.includes('所有状态的第一个业务场景都是 `Game.scene`'),
    'project v1 spec must keep every semantic startup state on Game.scene',
);
assert.ok(
    cocosSpec.includes('`local_snapshot`（注入 `pdd.level = N` 且 `N >= 2`，直进 `Game.scene` 第 N 关'),
    'project v1 spec must keep local_snapshot startup as local pdd.level=N direct Game level N',
);

assert.ok(
    startupRoute.includes('readStartupLocalProgress'),
    'startup route must use the shared local startup progress reader',
);
assert.ok(
    startupRoute.includes('resolveStartupLocalProgressFromRaw(rawLocalLevel).level'),
    'startup route must derive validLocalLevel from pdd.level only',
);
assert.ok(
    startupRoute.includes('if (localLevel >= 2)'),
    'B-class local progress must be detected from effective local progress >= 2',
);
assert.ok(
    startupRoute.includes("reason: 'local_progress_gt_1'"),
    'B-class route decision must retain a local-progress reason for diagnostics',
);

assert.ok(
    bootSceneCtrl.includes("appRoot.markGameRequested(routeDecision.levelId, routeDecision.prefix, 'main', 'auto', routeDecision.reason)"),
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
    gameSceneRuntime.includes("import { resolveStartupRouteDecision } from './StartupRouteService';"),
    'GameSceneRuntimeController Boot path must use the same startup route decision as BootSceneCtrl',
);
assert.ok(
    gameSceneRuntime.includes("source: 'GameSceneRuntimeController.startBoot'"),
    'GameSceneRuntimeController Boot route must leave startup trace evidence for route decisions',
);
assert.ok(
    gameSceneRuntime.includes("appRoot.markGameRequested(routeDecision.levelId, routeDecision.prefix, 'main', 'auto', routeDecision.reason)"),
    'GameSceneRuntimeController Boot fallback must preserve route decision reason on pending gameplay requests',
);
assert.ok(
    !gameSceneRuntime.includes('bootLoadingUi.active = false'),
    'GameSceneRuntimeController Boot fallback must not hide the Cocos-owned startup loading UI',
);
assert.ok(
    !gameSceneRuntime.includes('getBootStartupGameplayLevel'),
    'GameSceneRuntimeController must not keep a second Boot startup route implementation',
);
assert.ok(
    !gameSceneRuntime.includes('this.startBootCloudRestoreProbe();'),
    'Boot fallback must not start cloud restore before Game.scene because C-class users must first see level 1 in Game',
);
assert.ok(
    !gameSceneRuntime.includes("this.applyResolvedStartupCloudGameplayRequest(appRoot, 'startup-cloud-restore-before-game')"),
    'Game.scene startup must not convert cloud restore into a pending route before continueStartup',
);
assert.ok(
    gameSceneRuntime.includes('label.string = `第${levelId}关`;'),
    'pending B startup must not expose the Game prefab default level-1 title while resources load',
);
assert.strictEqual(
    findNode(readScene('assets/BootstrapBundle/Scenes/Game.scene'), 'LevelTitle').node._active,
    false,
    'Game.scene must not expose the default normal level title before startup picks A/B/C target level',
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
    firstLevelRoute.includes('const pendingStartupRouteReason = pendingMainGameplayRequest'),
    'Game startup must read the pending route reason produced by Boot',
);
assert.ok(
    firstLevelRoute.includes("pendingStartupRouteReason === 'local_progress_gt_1'"),
    'B-class local-progress startup must trust Boot-classified local progress pending requests',
);
assert.ok(
    firstLevelRoute.includes('if (pendingLocalDirectStartup)'),
    'B-class local-progress startup must use a hard direct route before cloud restore decisions',
);
assert.ok(
    firstLevelRoute.indexOf('if (pendingLocalDirectStartup)') <
    firstLevelRoute.indexOf('const restoreStatus = await this.restoreUserStateFromCloud(hadLocalUserState)'),
    'B-class local-progress startup must not await cloud restore before loading target level',
);
assert.ok(
    firstLevelRoute.includes('void this.beginStartupCloudRestore(true);'),
    'B-class direct startup should still run cloud restore in the background',
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
    !sceneRouter.includes('consumeStartupCloudGameRestoreForGameEntry()'),
    'SceneRouter must not convert startup cloud restore into a pending gameplay request before Game.scene runs',
);
assert.ok(
    !sceneRouter.includes('scene.bundle.gameRestore.beforeRun'),
    'C-class cloud restore must happen inside Game runtime, not before director.runScene',
);
assert.ok(
    firstLevelRoute.includes('this.startGameAssetsLevelFast(startupLevelId, fastPrefix, startupLevelId)'),
    'pending B target levels beyond bootstrap must start through the direct Game fast path',
);

{
    const route = plain(loadStartupRouteModule(null).resolveStartupRouteDecision());
    assert.deepStrictEqual(route, {
        shouldMarkPendingGameplay: false,
        levelId: 1,
        prefix: 'level_',
        reason: 'default_level_1',
    }, 'A-class startup should default to Game level 1 without pending gameplay');
}

{
    const route = plain(loadStartupRouteModule('6').resolveStartupRouteDecision());
    assert.deepStrictEqual(route, {
        shouldMarkPendingGameplay: true,
        levelId: 6,
        prefix: 'level_',
        reason: 'local_progress_gt_1',
    }, 'B-class startup must mark local pdd.level=N as pending Game level N');
}

{
    const route = plain(loadStartupRouteModule({
        'pdd.user.profile.v1': JSON.stringify({ lastLevelId: 6 }),
    }).resolveStartupRouteDecision());
    assert.deepStrictEqual(route, {
        shouldMarkPendingGameplay: false,
        levelId: 1,
        prefix: 'level_',
        reason: 'default_level_1',
    }, 'profile-only lastLevelId must not become B-class local startup progress');
}

{
    const route = plain(loadStartupRouteModule('6', { level: '3' }).resolveStartupRouteDecision());
    assert.deepStrictEqual(route, {
        shouldMarkPendingGameplay: false,
        levelId: 1,
        prefix: 'level_',
        reason: 'explicit_launch',
    }, 'explicit launch level must not be overridden by local B-class progress');
}

{
    const route = loadStartupRouteModule('abc').resolveStartupRouteDecision();
    assert.strictEqual(route.reason, 'default_level_1', 'invalid local pdd.level must not become B-class');
    assert.strictEqual(route.levelId, 1, 'invalid local pdd.level must normalize to level 1');
}

console.log('startup-route-abc.test.js passed');
