const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function createSession() {
    const bundles = new Map();
    return {
        currentSceneName: 'Game',
        requestedSceneName: 'Game',
        visualState: 'game',
        pendingGameplayRequest: null,
        activeGameplayContext: { activeLevelId: 6 },
        startupCloudGameRestoreRequest: null,
        setCurrentSceneName(sceneName) {
            this.currentSceneName = sceneName;
        },
        requestScene(sceneName) {
            this.requestedSceneName = sceneName;
        },
        rememberRoutedBundle(name, bundle) {
            bundles.set(name, bundle);
        },
        getRoutedBundle(name) {
            return bundles.get(name) || null;
        },
        consumeStartupCloudGameRestoreForGameEntry() {
            return null;
        },
        markPendingGameplayRequest() {},
    };
}

function loadSceneRouterModule(activeSceneName = 'Game') {
    const output = ts.transpileModule(read('assets/Scripts/Core/SceneRouter.ts'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    const calls = {
        loadBundle: [],
        loadScene: [],
        runScene: [],
        traces: [],
    };
    let currentSceneName = activeSceneName;
    const homeSceneAsset = { name: 'Home', isValid: true };
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === 'cc') {
                return {
                    assetManager: {
                        getBundle() {
                            return null;
                        },
                        loadBundle(name, callback) {
                            calls.loadBundle.push(name);
                            callback(null, {
                                loadScene(sceneName, sceneCallback) {
                                    calls.loadScene.push(sceneName);
                                    sceneCallback(null, homeSceneAsset);
                                },
                            });
                        },
                    },
                    director: {
                        getScene() {
                            return { name: currentSceneName };
                        },
                        loadScene(sceneName, callback) {
                            calls.loadScene.push(sceneName);
                            currentSceneName = sceneName;
                            callback();
                        },
                        runScene(sceneAsset, _transition, callback) {
                            calls.runScene.push(sceneAsset.name);
                            currentSceneName = sceneAsset.name;
                            callback();
                        },
                    },
                };
            }
            if (id === './PackageNames') {
                return {
                    HOME_ASSETS_BUNDLE_NAME: 'homeAssets',
                    LOCAL_BOOTSTRAP_BUNDLE_NAME: 'bootstrap',
                    LOGICAL_GAME_ENTRY_BUNDLE_NAME: 'gameEntry',
                    LOGICAL_HOME_BUNDLE_NAME: 'home',
                };
            }
            if (id === './DebugPerfTrace') {
                return {
                    debugPerfTrace(label, payload) {
                        calls.traces.push({ label, payload });
                    },
                };
            }
            if (id === './RuntimeLog') {
                return {
                    runtimeLog() {},
                };
            }
            if (id === './StartupTrace') {
                return {
                    markStartupTrace() {},
                };
            }
            if (id === './AppSession') {
                return {};
            }
            throw new Error(`unexpected require: ${id}`);
        },
        URLSearchParams,
        window: { location: { search: '' } },
        globalThis: {},
        setTimeout,
        clearTimeout,
    };
    vm.runInNewContext(output, sandbox, { filename: 'SceneRouter.ts' });
    return { SceneRouter: module.exports.SceneRouter, calls };
}

async function assertStaleVisibleGameTransitionCanRouteHome() {
    const session = createSession();
    const { SceneRouter, calls } = loadSceneRouterModule('Game');
    const router = new SceneRouter(session);
    router._transitioning = true;
    router._transitionTargetSceneName = 'Game';
    router._transitionPromise = new Promise(() => {});

    await router.toHome();

    assert.strictEqual(session.currentSceneName, 'Home', 'foreground Home route should arrive at Home');
    assert.deepStrictEqual(calls.loadBundle, ['homeAssets'], 'foreground Home route should load homeAssets');
    assert.deepStrictEqual(calls.runScene, ['Home'], 'foreground Home route should run Home.scene');
    assert.ok(
        calls.traces.some((entry) => entry.label === 'scene.load.clearArrivedTransition'),
        'stale visible Game transition should be cleared before Home route',
    );
}

async function assertActiveDifferentTransitionStillFailsFast() {
    const session = createSession();
    const { SceneRouter } = loadSceneRouterModule('Boot');
    const router = new SceneRouter(session);
    router._transitioning = true;
    router._transitionTargetSceneName = 'Game';
    router._transitionPromise = new Promise(() => {});

    await assert.rejects(
        () => router.toHome(),
        /scene transition already in flight/,
        'different-target transition should still fail fast when target scene is not visible',
    );
}

(async () => {
    await assertStaleVisibleGameTransitionCanRouteHome();
    await assertActiveDifferentTransitionStillFailsFast();
    console.log('scene-router-stale-transition-behavior.test.js passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
