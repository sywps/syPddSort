const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/StartupCloudRestoreHelper.ts'),
    'utf8',
);

function loadHelper(appRoot) {
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(output, {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../GameCtrlShared') {
                return {
                    LeaderboardMgr: { inst: { submitProgress() {} } },
                    UserMgr: { inst: { getProfile() { return {}; } } },
                };
            }
            if (id === '../AppRoot') return { AppRoot: { tryGet: () => appRoot } };
            if (id === '../RuntimeLog') return { runtimeWarn() {} };
            throw new Error(`unexpected require: ${id}`);
        },
        console,
    }, { filename: 'StartupCloudRestoreHelper.ts' });
    return module.exports;
}

{
    const calls = [];
    let savedLevel = 1;
    const appRoot = {
        session: {
            pendingGameplayRequest: null,
            activeGameplayContext: { entryMode: 'main', activeLevelId: 1 },
            requestedSceneName: 'Game',
        },
        router: { isTransitioning: false },
    };
    const { applyLateCloudUserStateToRuntime, flushPendingStartupCloudGameplayRestore } = loadHelper(appRoot);
    const runtime = {
        isValid: true,
        getSavedLevel: () => savedLevel,
        getActiveLogicalLevelId: () => 1,
        isExternalLevelPreviewActive: () => false,
        getUrlLevel: () => 0,
        applyCloudUserState(state) {
            savedLevel = state.gameState.savedLevel;
            calls.push(['applyCloudUserState', savedLevel]);
            return 'cloud_progress_gt_1';
        },
        getRuntimeSceneName: () => 'Game',
        loadLevel(levelId) {
            calls.push(['loadLevel', levelId]);
        },
        showToast(text) {
            calls.push(['showToast', text]);
        },
        _startupBackgroundServicesUiReady: false,
    };

    const status = applyLateCloudUserStateToRuntime(
        runtime,
        { gameState: { savedLevel: 9 }, profile: { lastLevelId: 9 } },
        false,
    );
    assert.strictEqual(status, 'cloud_progress_gt_1');
    assert.deepStrictEqual(
        calls.filter((call) => call[0] === 'loadLevel'),
        [],
        'late C-class cloud restore must wait until provisional level UI is ready',
    );
    runtime._startupBackgroundServicesUiReady = true;
    assert.strictEqual(
        flushPendingStartupCloudGameplayRestore(runtime, 'unit-test'),
        true,
        'pending late C-class cloud restore must flush after Game UI is ready',
    );
    assert.deepStrictEqual(
        calls.filter((call) => call[0] === 'loadLevel'),
        [['loadLevel', 9]],
        'late C-class cloud restore must reload Game to cloud savedLevel N',
    );
}

{
    const calls = [];
    let savedLevel = 1;
    const appRoot = {
        session: {
            pendingGameplayRequest: null,
            activeGameplayContext: { entryMode: 'main', activeLevelId: 1 },
            requestedSceneName: 'Game',
        },
        router: { isTransitioning: false },
    };
    const { applyLateCloudUserStateToRuntime } = loadHelper(appRoot);
    const runtime = {
        isValid: true,
        getSavedLevel: () => savedLevel,
        getActiveLogicalLevelId: () => 1,
        isExternalLevelPreviewActive: () => false,
        getUrlLevel: () => 0,
        applyCloudUserState(state) {
            savedLevel = state.gameState.savedLevel;
            calls.push(['applyCloudUserState', savedLevel]);
            return 'cloud_progress_gt_1';
        },
        getRuntimeSceneName: () => 'Game',
        loadLevel(levelId) {
            calls.push(['loadLevel', levelId]);
        },
        showToast(text) {
            calls.push(['showToast', text]);
        },
        _startupBackgroundServicesUiReady: true,
    };

    const status = applyLateCloudUserStateToRuntime(
        runtime,
        { gameState: { savedLevel: 6 }, profile: { lastLevelId: 6 } },
        false,
    );
    assert.strictEqual(status, 'cloud_progress_gt_1');
    assert.deepStrictEqual(
        calls.filter((call) => call[0] === 'loadLevel'),
        [['loadLevel', 6]],
        'late C-class cloud restore must immediately reload when Game UI is already ready',
    );
}

console.log('startup-cloud-restore-helper.test.js passed');
