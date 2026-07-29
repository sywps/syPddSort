const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts'),
    'utf8',
);
const gameSceneRuntimeSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameSceneRuntimeController.ts'),
    'utf8',
);
const startupCloudRestoreSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/StartupCloudRestoreHelper.ts'),
    'utf8',
);
const assetBootstrapSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts'),
    'utf8',
);

for (const startupOwner of [source, gameSceneRuntimeSource]) {
    assert.ok(startupOwner.includes('SySDKMgr.inst.init();'), 'SyGame core initialization must remain in the post-playable background wave');
    assert.ok(startupOwner.includes('AnalyticsMgr.inst.bootstrap()'), 'Analytics bootstrap must remain in the post-playable background wave');
    assert.ok(!startupOwner.includes('UserMgr.inst.loginWeChat()'), 'the redundant standalone WeChat login must not run at startup');
    assert.ok(!startupOwner.includes('setupShareMenu()'), 'passive share-menu setup must not run at startup');
    assert.ok(!startupOwner.includes('LeaderboardMgr.inst.submitProgress'), 'a cold-start snapshot must not initialize or submit the leaderboard');
}
const cloudRestoreSnapshotStart = startupCloudRestoreSource.indexOf("if (status === 'cloud_progress_gt_1')");
const cloudRestoreSnapshotEnd = startupCloudRestoreSource.indexOf(
    '\n    runtime._deferredCloudGameStateSync = false;',
    cloudRestoreSnapshotStart + 1,
);
assert.ok(cloudRestoreSnapshotStart >= 0 && cloudRestoreSnapshotEnd > cloudRestoreSnapshotStart, 'cloud snapshot restore branch must remain inspectable');
assert.ok(
    !startupCloudRestoreSource.slice(cloudRestoreSnapshotStart, cloudRestoreSnapshotEnd).includes('submitProgress'),
    'restoring an existing cloud snapshot must not submit leaderboard progress',
);
assert.ok(
    startupCloudRestoreSource.includes('LeaderboardMgr.inst.submitProgress(leaderboardProgress'),
    'a real progress change deferred during cloud restore must still submit after restore resolves',
);
assert.ok(
    assetBootstrapSource.includes('LeaderboardMgr.inst.submitProgress(nextLevel'),
    'normal level progression must still submit leaderboard progress',
);

function loadFirstLevelRouteModule(appRoot, traceEvents) {
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    const gameCtrlShared = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'LOCAL_BOOTSTRAP_LEVEL_PREFIX') return 'level_';
            if (prop === 'AnalyticsMgr') return { inst: { flushFunnelEvents() {} } };
            if (prop === 'assetManager') return {};
            if (prop === 'sys') return { isNative: false };
            return 0;
        },
    });
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === 'cc') {
                return {
                    director: { once() {}, off() {}, getTotalFrames: () => 0 },
                    Director: { EVENT_AFTER_DRAW: 'after-draw' },
                };
            }
            if (id === '../GameCtrlShared') return gameCtrlShared;
            if (id === '../AppRoot') return { AppRoot: { tryGet: () => appRoot } };
            if (id === '../LevelDataCdnService') {
                return {
                    LevelDataCdnService: {
                        inst: {
                            getAvailabilityDiagnostics() {
                                return { baseUrl: '', canUse: false, reason: 'unit-test' };
                            },
                            getDataVersion() {
                                return '';
                            },
                            prefetchLive() {},
                        },
                    },
                };
            }
            if (id === '../MiniGamePlatform') {
                return {
                    isDouyinMiniGameRuntime: () => false,
                    isMiniGameRuntime: () => false,
                    isWeChatMiniGameRuntime: () => false,
                };
            }
            if (id === '../DebugPerfTrace') return { debugPerfSnapshot() {}, debugPerfTrace() {} };
            if (id === '../RuntimeLog') return { runtimeLog() {}, runtimeWarn() {} };
            if (id === '../StartupTrace') {
                return {
                    markStartupTrace(name, payload) {
                        traceEvents.push({ name, payload });
                    },
                };
            }
            if (id === './StartupCloudRestoreHelper') {
                return {
                    flushPendingStartupCloudGameplayRestore(runtime, source) {
                        traceEvents.push({ name: 'flushPendingStartupCloudGameplayRestore', payload: { source, hasRuntime: !!runtime } });
                        return false;
                    },
                };
            }
            throw new Error(`unexpected require: ${id}`);
        },
        console,
    };
    vm.runInNewContext(output, sandbox, { filename: 'FirstLevelRouteModule.ts' });
    return module.exports;
}

async function runBClassDirectStartupCase() {
    const calls = [];
    const traceEvents = [];
    const appRoot = {
        session: {
            pendingGameplayRequest: {
                entryMode: 'main',
                levelId: 6,
                prefix: 'level_',
                routeReason: 'local_progress_gt_1',
            },
        },
    };
    const { installFirstLevelRouteModule } = loadFirstLevelRouteModule(appRoot, traceEvents);
    const runtime = {
        getUrlLevel: () => 0,
        getUrlLevelFile: () => '',
        getUrlTheme: () => false,
        getStartupLocalProgressState: () => 'rawLevelMissing',
        getDefaultEntryLevel: () => 1,
        getSavedLevel: () => 6,
        beginStartupCloudRestore(hadLocalUserState) {
            calls.push(['beginCloudRestore', hadLocalUserState]);
            return Promise.resolve('local_progress_gt_1');
        },
        restoreUserStateFromCloud() {
            calls.push(['restoreUserStateFromCloud']);
            throw new Error('B-class direct startup must not await cloud restore');
        },
        shouldUseLocalBootstrapBundle: () => false,
        startLocalBootstrapLevelFast(levelId, prefix, logicalLevelId) {
            calls.push(['startLocalBootstrapLevelFast', levelId, prefix, logicalLevelId]);
        },
        startGameAssetsLevelFast(levelId, prefix, logicalLevelId) {
            calls.push(['startGameAssetsLevelFast', levelId, prefix, logicalLevelId]);
        },
        preloadAllAssets() {
            calls.push(['preloadAllAssets']);
        },
        showMainMenu() {
            calls.push(['showMainMenu']);
        },
    };
    installFirstLevelRouteModule(runtime);
    runtime.getLevelDataPath = (levelId, prefix = 'level_') => `LevelData/${prefix}${levelId}`;
    runtime.reportLevelDataLoadDiagnostic = (levelId, eventName) => {
        calls.push(['diagnostic', levelId, eventName]);
    };
    runtime._startDeferredStartupBackgroundServices = (canAutoSave, status, delaySec) => {
        calls.push(['backgroundServices', canAutoSave, status, delaySec]);
    };
    await runtime.continueStartup();

    assert.deepStrictEqual(
        calls.filter((call) => call[0] === 'startGameAssetsLevelFast'),
        [['startGameAssetsLevelFast', 6, 'level_', 6]],
        'B-class local progress must directly start pending level N through Game fast path',
    );
    assert.deepStrictEqual(
        calls.filter((call) => call[0] === 'beginCloudRestore'),
        [['beginCloudRestore', true]],
        'B-class startup should run cloud restore only in the background',
    );
    assert.strictEqual(
        calls.some((call) => call[0] === 'restoreUserStateFromCloud'),
        false,
        'B-class startup must not await cloud restore before entering level N',
    );
    assert.strictEqual(
        calls.some((call) => call[0] === 'preloadAllAssets' || call[0] === 'showMainMenu'),
        false,
        'B-class startup must not route through Home/preloadAllAssets fallback',
    );
    assert.ok(
        traceEvents.some((entry) => entry.name === 'startup_pending_local_direct' && entry.payload?.levelId === 6),
        'B-class direct startup must leave startup trace evidence',
    );
}

async function runCClassProvisionalStartupCase() {
    const calls = [];
    const traceEvents = [];
    const appRoot = {
        session: {
            pendingGameplayRequest: null,
        },
    };
    const { installFirstLevelRouteModule } = loadFirstLevelRouteModule(appRoot, traceEvents);
    const runtime = {
        getUrlLevel: () => 0,
        getUrlLevelFile: () => '',
        getUrlTheme: () => false,
        getStartupLocalProgressState: () => 'rawLevelMissing',
        getDefaultEntryLevel: () => 1,
        getSavedLevel: () => 1,
        restoreUserStateFromCloud(hadLocalUserState) {
            calls.push(['restoreUserStateFromCloud', hadLocalUserState]);
            return Promise.resolve('cloud_restore_pending');
        },
        beginStartupCloudRestore() {
            calls.push(['beginStartupCloudRestore']);
            throw new Error('C-class non-local startup should use restoreUserStateFromCloud path');
        },
        shouldUseLocalBootstrapBundle: () => true,
        startLocalBootstrapLevelFast(levelId, prefix, logicalLevelId) {
            calls.push(['startLocalBootstrapLevelFast', levelId, prefix, logicalLevelId]);
        },
        startGameAssetsLevelFast(levelId, prefix, logicalLevelId) {
            calls.push(['startGameAssetsLevelFast', levelId, prefix, logicalLevelId]);
        },
        preloadAllAssets() {
            calls.push(['preloadAllAssets']);
        },
        scheduleOnce(fn) {
            calls.push(['scheduleOnce']);
            if (typeof fn === 'function') fn();
        },
        loadLevel(levelId) {
            calls.push(['loadLevel', levelId]);
        },
        _isMiniGame: () => true,
        _isUrlLevelPreview: () => false,
    };
    installFirstLevelRouteModule(runtime);
    runtime.getLevelDataPath = (levelId, prefix = 'level_') => `LevelData/${prefix}${levelId}`;
    runtime.reportLevelDataLoadDiagnostic = (levelId, eventName) => {
        calls.push(['diagnostic', levelId, eventName]);
    };
    runtime.prefetchLocalBootstrapStartupAssets = (levelId) => {
        calls.push(['prefetchLocalBootstrapStartupAssets', levelId]);
    };
    runtime._startDeferredStartupBackgroundServices = (canAutoSave, status, delaySec) => {
        calls.push(['backgroundServices', canAutoSave, status, delaySec]);
    };
    await runtime.continueStartup();

    assert.deepStrictEqual(
        calls.filter((call) => call[0] === 'restoreUserStateFromCloud'),
        [['restoreUserStateFromCloud', false]],
        'C-class startup must begin cloud restore but treat local state as missing',
    );
    assert.deepStrictEqual(
        calls.filter((call) => call[0] === 'loadLevel'),
        [['loadLevel', 1]],
        'C-class startup must enter Game level 1 provisional state before cloud returns',
    );
    assert.deepStrictEqual(
        calls.filter((call) => call[0] === 'backgroundServices'),
        [['backgroundServices', false, 'cloud_restore_pending', 0]],
        'C-class startup must not auto-save level 1 to cloud while restore is pending',
    );
}

runBClassDirectStartupCase()
    .then(runCClassProvisionalStartupCase)
    .then(() => console.log('startup-route-runtime-behavior.test.js passed'))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
