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

function loadAssetMethods(names, globals) {
    const relativePath = 'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts';
    const assetSource = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const ast = ts.createSourceFile(relativePath, assetSource, ts.ScriptTarget.Latest, true);
    const methods = [];
    const visit = node => {
        if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast))) methods.push(node.getText(ast));
        ts.forEachChild(node, visit);
    };
    visit(ast);
    assert.strictEqual(methods.length, names.length, 'exercise the actual asset-bootstrap recovery methods');
    const output = ts.transpileModule(`globalThis.methods = {${methods.join(',\n')}}`, {
        compilerOptions: { target: ts.ScriptTarget.ES2019 },
    }).outputText;
    const sandbox = { ...globals, console };
    vm.runInNewContext(output, sandbox);
    return sandbox.methods;
}

function loadHelper(appRoot, leaderboardCalls = [], userStateSyncMgr = null, userManager = null) {
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
                    LeaderboardMgr: {
                        inst: {
                            submitProgress(levelId, profile) {
                                leaderboardCalls.push([levelId, profile]);
                            },
                        },
                    },
                    UserMgr: { inst: userManager || {
                        getProfile() { return { nickName: 'tester' }; },
                        applyCloudProfile() {},
                    } },
                    UserStateSyncMgr: { inst: userStateSyncMgr },
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

{
    const leaderboardCalls = [];
    const { resolveStartupCloudRestorePending } = loadHelper(null, leaderboardCalls);
    const runtime = {
        _startupCloudRestorePending: true,
        _startupCloudRestoreStatus: 'cloud_restore_pending',
        _startupCloudSaveBlockedForSession: false,
        _deferredCloudGameStateSync: true,
        _deferredLeaderboardProgress: 7,
        getSavedLevel: () => 9,
    };

    resolveStartupCloudRestorePending(runtime, 'cloud_progress_gt_1');
    assert.deepStrictEqual(
        leaderboardCalls,
        [],
        'restoring a cold-start cloud snapshot must not initialize or submit the leaderboard',
    );
    assert.strictEqual(runtime._deferredCloudGameStateSync, false);
    assert.strictEqual(runtime._deferredLeaderboardProgress, 0);
}

{
    const leaderboardCalls = [];
    const cloudSyncCalls = [];
    const { resolveStartupCloudRestorePending } = loadHelper(null, leaderboardCalls);
    const runtime = {
        _startupCloudRestorePending: true,
        _startupCloudRestoreStatus: 'cloud_restore_pending',
        _startupCloudSaveBlockedForSession: false,
        _deferredCloudGameStateSync: true,
        _deferredLeaderboardProgress: 4,
        queueCloudGameStateSync() {
            cloudSyncCalls.push('sync');
        },
    };

    resolveStartupCloudRestorePending(runtime, 'local_progress_gt_1');
    assert.deepStrictEqual(cloudSyncCalls, ['sync'], 'deferred cloud state changes must still flush after restore');
    assert.deepStrictEqual(
        leaderboardCalls,
        [[4, { nickName: 'tester' }]],
        'an actual progress change deferred during restore must still submit to the leaderboard',
    );
}

async function runRecoveryTests() {
    {
        let localTimestamp = 100;
        let captureCalls = 0;
        let queueCalls = 0;
        const methods = loadAssetMethods(['queueCloudGameStateSync'], {
            Date: { now: () => 200 },
            UserStateSyncMgr: { inst: {
                queueSave() {
                    queueCalls++;
                    return false;
                },
            } },
            UserMgr: { inst: { getCloudProfile: () => ({ displayName: 'local-player' }) } },
            deferCloudGameStateSyncDuringStartup: () => false,
        });
        const runtime = {
            setLocalUserStateUpdatedAt(timestamp) { localTimestamp = timestamp; },
            captureCloudGameState() {
                captureCalls++;
                return { savedLevel: 2, vigor: 5, stateUpdatedAt: localTimestamp };
            },
        };
        assert.strictEqual(methods.queueCloudGameStateSync.call(runtime), false);
        assert.strictEqual(captureCalls, 1, 'a non-deferred sync must capture the current local asset snapshot');
        assert.strictEqual(queueCalls, 1, 'a non-deferred sync must attempt to enqueue exactly once');
        assert.strictEqual(localTimestamp, 100, 'a rejected queue must not advance the persisted local state timestamp');
    }

    {
        let localTimestamp = 0;
        let captureCalls = 0;
        const methods = loadAssetMethods(['queueCloudGameStateSync', 'beginStartupCloudRestore'], {
            UserStateSyncMgr: { inst: { canUseCloud: () => false } },
            deferCloudGameStateSyncDuringStartup: () => true,
            captureCloudGameStateRecoveryFingerprint: () => 'startup-baseline',
            debugPerfTrace() {},
        });
        const runtime = {
            _startupCloudSaveBlockedForSession: false,
            getStartupCloudRestoreStatus: () => '',
            setLocalUserStateUpdatedAt(timestamp) { localTimestamp = timestamp; },
            captureCloudGameState() { captureCalls++; return {}; },
        };
        assert.strictEqual(methods.queueCloudGameStateSync.call(runtime), false);
        assert.strictEqual(localTimestamp, 0, 'a deferred autosave must not masquerade as a newer local asset mutation');
        assert.strictEqual(captureCalls, 0, 'a deferred autosave must not capture a sendable snapshot');
        assert.strictEqual(await methods.beginStartupCloudRestore.call(runtime, true), 'local_progress_gt_1');
        assert.strictEqual(runtime._startupCloudSaveBlockedForSession, true, 'saved-progress startup must remain blocked when no authoritative GET was possible');
        assert.strictEqual(runtime._startupCloudRestoreBaselineFingerprint, 'startup-baseline');
    }

    {
        const queuedGameStates = [];
        const appliedCloudVigors = [];
        let flushCalls = 0;
        let localVigor = 10;
        let localUpdatedAt = 100;
        let resolveStartupGet;
        const startupGet = new Promise(resolve => { resolveStartupGet = resolve; });
        const syncManager = {
            canUseCloud: () => true,
            queueSave(patch) {
                queuedGameStates.push({ ...patch.gameState });
                return true;
            },
            async flushPendingSave() {
                flushCalls++;
                return true;
            },
        };
        const {
            captureCloudGameStateRecoveryFingerprint,
            deferCloudGameStateSyncDuringStartup,
            resolveStartupCloudRestorePending,
        } = loadHelper(null, [], syncManager);
        const methods = loadAssetMethods(['queueCloudGameStateSync', 'beginStartupCloudRestore'], {
            UserStateSyncMgr: { inst: syncManager },
            UserMgr: { inst: { getCloudProfile: () => ({ displayName: 'local-player' }) } },
            captureCloudGameStateRecoveryFingerprint,
            deferCloudGameStateSyncDuringStartup,
            resolveStartupCloudRestorePending,
            debugPerfTrace() {},
            runtimeWarn() {},
        });
        const runtime = {
            _startupCloudRestorePending: false,
            _startupCloudSaveBlockedForSession: false,
            _startupCloudRestorePromise: null,
            _startupCloudRestoreStatus: '',
            _deferredCloudGameStateSync: false,
            _deferredLeaderboardProgress: 0,
            getStartupCloudRestoreStatus() { return this._startupCloudRestoreStatus; },
            loadRestorableUserStateFromCloud: () => startupGet,
            _shouldHoldStartupCloudRestoreForBoot: () => true,
            captureCloudGameState: () => ({ savedLevel: 2, vigor: localVigor, stateUpdatedAt: localUpdatedAt }),
            setLocalUserStateUpdatedAt(value) { localUpdatedAt = value; },
            getLocalUserStateUpdatedAt: () => localUpdatedAt,
            getSavedLevel: () => 2,
            applyCloudUserState(state) {
                appliedCloudVigors.push(state.gameState.vigor);
                localVigor = state.gameState.vigor;
                return 'local_progress_gt_1';
            },
            queueCloudGameStateSync() { return methods.queueCloudGameStateSync.call(this); },
        };

        const restore = methods.beginStartupCloudRestore.call(runtime, true);
        assert.strictEqual(runtime._startupCloudRestorePending, true);
        localVigor = 5;
        assert.strictEqual(runtime.queueCloudGameStateSync(), false, 'a real asset mutation must be deferred while startup GET is pending');
        assert.strictEqual(localUpdatedAt, 100, 'the regression requires cloud and local state to retain the same timestamp');
        resolveStartupGet({
            profile: null,
            gameState: { savedLevel: 2, vigor: 10, stateUpdatedAt: 100 },
        });
        await restore;

        assert.strictEqual(localVigor, 5, 'a late startup GET with the same stateUpdatedAt must not overwrite a real local asset mutation');
        assert(!appliedCloudVigors.includes(10), 'the stale startup GET must not be applied before reconciling the deferred local snapshot');
        assert(!queuedGameStates.some(state => state.vigor === 10), 'the stale cloud asset value must never be queued back as if it were local');
        const localSaveAcknowledged = queuedGameStates.some(state => state.vigor === 5) && flushCalls > 0;
        assert(
            localSaveAcknowledged || runtime._startupCloudSaveBlockedForSession,
            'startup restore must either save and acknowledge the local asset snapshot or keep cloud writes blocked',
        );
        if (runtime._startupCloudSaveBlockedForSession) {
            assert.strictEqual(runtime._deferredCloudGameStateSync, true, 'blocked recovery must retain the dirty local snapshot for a later authoritative retry');
        }
    }

    {
        const { deferCloudGameStateSyncDuringStartup, deferLeaderboardProgressDuringStartup } = loadHelper(null);
        const runtime = {
            _startupCloudRestorePending: false,
            _startupCloudSaveBlockedForSession: true,
            _deferredCloudGameStateSync: false,
            _deferredLeaderboardProgress: 3,
        };
        assert.strictEqual(deferCloudGameStateSyncDuringStartup(runtime), true);
        assert.strictEqual(runtime._deferredCloudGameStateSync, true, 'blocked asset mutations must remain marked dirty for later full-snapshot recovery');
        assert.strictEqual(deferLeaderboardProgressDuringStartup(runtime, 8), true);
        assert.strictEqual(runtime._deferredLeaderboardProgress, 8, 'blocked leaderboard progress must remain queued for acknowledged recovery');
    }

    {
        const { resolveStartupCloudRestorePending } = loadHelper(null);
        const runtime = {
            _startupCloudRestorePending: true,
            _startupCloudSaveBlockedForSession: false,
            _deferredCloudGameStateSync: true,
            _deferredLeaderboardProgress: 8,
            _startupCloudRestoreBaselineFingerprint: 'baseline',
        };
        resolveStartupCloudRestorePending(runtime, 'cloud_failed_unresolved');
        assert.strictEqual(runtime._startupCloudSaveBlockedForSession, true);
        assert.strictEqual(runtime._deferredCloudGameStateSync, true, 'failed startup restore must retain pending asset changes');
        assert.strictEqual(runtime._deferredLeaderboardProgress, 8, 'failed startup restore must retain pending leaderboard progress');
        assert.strictEqual(runtime._startupCloudRestoreBaselineFingerprint, 'baseline');
    }

    {
        const calls = [];
        const syncManager = {
            canUseCloud: () => true,
            flushPendingSave: async () => { calls.push('flush'); return true; },
            recoverState: async () => { throw new Error('ready runtime must not recover'); },
        };
        const { ensureCloudGameStateSyncReadyForPvp } = loadHelper(null, [], syncManager);
        assert.strictEqual(await ensureCloudGameStateSyncReadyForPvp({
            _startupCloudRestorePending: false,
            _startupCloudSaveBlockedForSession: false,
            queueCloudGameStateSync() { calls.push('queue'); return true; },
        }), true);
        assert.deepStrictEqual(calls, ['queue', 'flush']);
    }

    {
        const calls = [];
        const leaderboardCalls = [];
        let flushCount = 0;
        const syncManager = {
            canUseCloud: () => true,
            async flushPendingSave() { calls.push(`flush:${++flushCount}`); return true; },
            async recoverState() {
                calls.push('recover');
                return { state: { profile: null, gameState: null }, generation: 7 };
            },
            validateRecoveredState(generation) {
                calls.push(`validate:${generation}`);
                return generation === 7;
            },
        };
        const { captureCloudGameStateRecoveryFingerprint, ensureCloudGameStateSyncReadyForPvp } = loadHelper(null, leaderboardCalls, syncManager);
        const runtime = {
            _startupCloudRestorePending: true,
            _startupCloudRestorePromise: new Promise(() => {}),
            _startupCloudSaveBlockedForSession: true,
            _startupCloudRestoreStatus: 'cloud_failed_unresolved',
            _deferredCloudGameStateSync: true,
            _deferredLeaderboardProgress: 9,
            captureCloudGameState: () => ({ savedLevel: 1, vigor: 10, stateUpdatedAt: 100 }),
            applyCloudUserState(state) {
                calls.push(`apply:${state.profile}`);
                return 'cloud_confirmed_empty';
            },
            queueCloudGameStateSync() {
                calls.push('queue');
                return true;
            },
        };
        runtime._startupCloudRestoreBaselineFingerprint = captureCloudGameStateRecoveryFingerprint(runtime);
        assert.deepStrictEqual(await Promise.all([
            ensureCloudGameStateSyncReadyForPvp(runtime),
            ensureCloudGameStateSyncReadyForPvp(runtime),
        ]), [true, true]);
        assert.deepStrictEqual(calls, ['flush:1', 'recover', 'validate:7', 'apply:null', 'queue', 'flush:2']);
        assert.strictEqual(runtime._startupCloudRestorePending, false, 'PVP recovery must not wait forever for the original startup request');
        assert.strictEqual(runtime._startupCloudSaveBlockedForSession, false);
        assert.strictEqual(runtime._startupCloudRestoreStatus, 'cloud_confirmed_empty');
        assert.strictEqual(runtime._deferredCloudGameStateSync, false);
        assert.strictEqual(runtime._deferredLeaderboardProgress, 0);
        assert.deepStrictEqual(leaderboardCalls, [[9, { nickName: 'tester' }]], 'leaderboard progress must flush only after the asset save is acknowledged');
    }

    {
        const profileCalls = [];
        let flushCount = 0;
        const syncManager = {
            canUseCloud: () => true,
            flushPendingSave: async () => { flushCount++; return true; },
            recoverState: async () => ({
                state: {
                    profile: { displayName: 'cloud-player' },
                    gameState: { savedLevel: 3, vigor: 10, stateUpdatedAt: 100 },
                },
                generation: 17,
            }),
            validateRecoveredState: generation => generation === 17,
        };
        const userManager = {
            applyCloudProfile(profile) { profileCalls.push(profile.displayName); },
            getProfile: () => ({ nickName: 'cloud-player' }),
        };
        const { captureCloudGameStateRecoveryFingerprint, ensureCloudGameStateSyncReadyForPvp } = loadHelper(null, [], syncManager, userManager);
        let vigor = 5;
        const runtime = {
            _startupCloudRestorePending: false,
            _startupCloudSaveBlockedForSession: true,
            _deferredCloudGameStateSync: true,
            captureCloudGameState: () => ({ savedLevel: 2, vigor, stateUpdatedAt: 200 }),
            getSavedLevel: () => 2,
            applyCloudUserState() { throw new Error('dirty local game state must be merged by SAVE before authoritative apply'); },
            queueCloudGameStateSync() {
                assert.strictEqual(vigor, 5, 'older GET assets must not overwrite the dirty local snapshot before server merge');
                return true;
            },
        };
        runtime._startupCloudRestoreBaselineFingerprint = captureCloudGameStateRecoveryFingerprint({
            captureCloudGameState: () => ({ savedLevel: 2, vigor: 10, stateUpdatedAt: 100 }),
        });
        assert.strictEqual(await ensureCloudGameStateSyncReadyForPvp(runtime), true);
        assert.strictEqual(flushCount, 2);
        assert.deepStrictEqual(profileCalls, ['cloud-player']);
        assert.strictEqual(runtime._startupCloudSaveBlockedForSession, false);
    }

    {
        let applyCalls = 0;
        let vigor = 5;
        let runtime;
        const syncManager = {
            canUseCloud: () => true,
            flushPendingSave: async () => true,
            async recoverState() {
                vigor = 4;
                return { state: { profile: null, gameState: null }, generation: 3 };
            },
            validateRecoveredState: () => true,
        };
        const { captureCloudGameStateRecoveryFingerprint, ensureCloudGameStateSyncReadyForPvp } = loadHelper(null, [], syncManager);
        runtime = {
            _startupCloudRestorePending: true,
            _startupCloudSaveBlockedForSession: true,
            captureCloudGameState: () => ({ savedLevel: 2, vigor, stateUpdatedAt: 200 }),
            applyCloudUserState() { applyCalls++; return 'cloud_confirmed_empty'; },
            queueCloudGameStateSync() { throw new Error('stale recovery must not queue'); },
        };
        runtime._startupCloudRestoreBaselineFingerprint = captureCloudGameStateRecoveryFingerprint(runtime);
        assert.strictEqual(await ensureCloudGameStateSyncReadyForPvp(runtime), false);
        assert.strictEqual(applyCalls, 0, 'a local game-state mutation during GET must be checked before applying cloud state');
        assert.strictEqual(runtime._startupCloudSaveBlockedForSession, true);
    }

    {
        let applyCalls = 0;
        const syncManager = {
            canUseCloud: () => true,
            flushPendingSave: async () => true,
            recoverState: async () => ({ state: { profile: null, gameState: null }, generation: 11 }),
            validateRecoveredState: () => false,
        };
        const { captureCloudGameStateRecoveryFingerprint, ensureCloudGameStateSyncReadyForPvp } = loadHelper(null, [], syncManager);
        const runtime = {
            _startupCloudRestorePending: true,
            _startupCloudSaveBlockedForSession: true,
            captureCloudGameState: () => ({ savedLevel: 1, vigor: 10, stateUpdatedAt: 100 }),
            applyCloudUserState() { applyCalls++; return 'cloud_confirmed_empty'; },
        };
        runtime._startupCloudRestoreBaselineFingerprint = captureCloudGameStateRecoveryFingerprint(runtime);
        assert.strictEqual(await ensureCloudGameStateSyncReadyForPvp(runtime), false);
        assert.strictEqual(applyCalls, 0, 'a stale manager generation must be rejected before runtime mutation');
        assert.strictEqual(runtime._startupCloudSaveBlockedForSession, true);
    }

    {
        const leaderboardCalls = [];
        let flushCount = 0;
        const syncManager = {
            canUseCloud: () => true,
            flushPendingSave: async () => ++flushCount === 1,
            recoverState: async () => ({ state: { profile: null, gameState: null }, generation: 13 }),
            validateRecoveredState: generation => generation === 13,
        };
        const { captureCloudGameStateRecoveryFingerprint, ensureCloudGameStateSyncReadyForPvp } = loadHelper(null, leaderboardCalls, syncManager);
        const runtime = {
            _startupCloudRestorePending: true,
            _startupCloudSaveBlockedForSession: true,
            _deferredLeaderboardProgress: 6,
            captureCloudGameState: () => ({ savedLevel: 1, vigor: 10, stateUpdatedAt: 100 }),
            applyCloudUserState: () => 'cloud_confirmed_empty',
            queueCloudGameStateSync: () => true,
        };
        runtime._startupCloudRestoreBaselineFingerprint = captureCloudGameStateRecoveryFingerprint(runtime);
        assert.strictEqual(await ensureCloudGameStateSyncReadyForPvp(runtime), false);
        assert.strictEqual(runtime._startupCloudSaveBlockedForSession, true, 'a failed snapshot acknowledgement must re-block PVP');
        assert.strictEqual(runtime._deferredLeaderboardProgress, 6, 'leaderboard progress must remain pending until asset save succeeds');
        assert.deepStrictEqual(leaderboardCalls, []);
    }

    {
        let recoverCalls = 0;
        const syncManager = {
            canUseCloud: () => false,
            recoverState: async () => { recoverCalls++; return null; },
        };
        const { ensureCloudGameStateSyncReadyForPvp } = loadHelper(null, [], syncManager);
        assert.strictEqual(await ensureCloudGameStateSyncReadyForPvp({
            _startupCloudRestorePending: false,
            _startupCloudSaveBlockedForSession: true,
        }), false);
        assert.strictEqual(recoverCalls, 0, 'a permanent session disable must not be reprobed by PVP refresh');
    }
}

runRecoveryTests()
    .then(() => console.log('startup-cloud-restore-helper.test.js passed'))
    .catch((error) => { console.error(error); process.exitCode = 1; });
