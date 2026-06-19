import { LeaderboardMgr, UserMgr } from '../GameCtrlShared';
import type { CloudUserState } from '../GameCtrlShared';
import type { UserStateRestoreStatus } from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';

function normalizePositiveLevel(value: unknown): number {
    const level = Math.floor(Number(value) || 0);
    return Number.isFinite(level) && level > 0 ? level : 0;
}

function getRuntimeActiveMainLevel(runtime: any): number {
    if (runtime?._isThemeLevel) return 0;
    try {
        return normalizePositiveLevel(runtime?.getActiveLogicalLevelId?.());
    } catch (_) {
        return 0;
    }
}

function shouldSkipLateCloudGameRestore(runtime: any, restoredLevel: number): boolean {
    const appRoot = AppRoot.tryGet();
    const session = appRoot?.session;
    const pending = session?.pendingGameplayRequest;
    if (pending?.entryMode === 'main' && pending.levelId >= restoredLevel) {
        return true;
    }
    const active = session?.activeGameplayContext;
    if (active?.entryMode === 'main' && active.activeLevelId >= restoredLevel) {
        return true;
    }
    if (getRuntimeActiveMainLevel(runtime) >= restoredLevel) {
        return true;
    }
    const savedLevel = normalizePositiveLevel(runtime?.getSavedLevel?.());
    return !!appRoot?.router.isTransitioning
        && session?.requestedSceneName === 'Game'
        && savedLevel >= restoredLevel;
}

function warnCloudRestoreGameRouteFailed(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[GameCtrl] late cloud progress game restore failed:', message);
}

export function applyLateCloudUserStateToRuntime(runtime: any, state: CloudUserState | null, hadLocalUserState: boolean): UserStateRestoreStatus | null {
    if (!runtime.isValid || !state) return null;
    const beforeLevel = runtime.getSavedLevel();
    const status = runtime.applyCloudUserState(state);
    if (status !== 'cloud_progress_gt_1') return status;
    const restoredLevel = runtime.getSavedLevel();
    const activeLevel = Math.max(1, Math.floor(Number(runtime.getActiveLogicalLevelId?.() || 1) || 1));
    if (!runtime.isExternalLevelPreviewActive() && runtime.getUrlLevel() <= 0 && restoredLevel > Math.max(beforeLevel, activeLevel)) {
        console.warn('[GameCtrl] late cloud progress restored', {
            beforeLevel, activeLevel, restoredLevel, hadLocalUserState,
        });
        const toastText = `已恢复进度到第${restoredLevel}关`;
        const runRouteGame = () => {
            if (!runtime.isValid) return;
            if (shouldSkipLateCloudGameRestore(runtime, restoredLevel)) {
                if (typeof runtime.showToast === 'function') {
                    runtime.showToast(toastText, 2.5);
                }
                console.warn('[GameCtrl] late cloud progress restored, keep current gameplay route', {
                    beforeLevel, activeLevel: getRuntimeActiveMainLevel(runtime), restoredLevel, hadLocalUserState,
                });
                return;
            }
            console.warn('[GameCtrl] late cloud progress restored, reloading gameplay level', {
                beforeLevel, activeLevel: getRuntimeActiveMainLevel(runtime), restoredLevel, hadLocalUserState,
            });
            const sceneName = typeof runtime.getRuntimeSceneName === 'function'
                ? runtime.getRuntimeSceneName('Game')
                : 'Game';
            if (sceneName === 'Game' && typeof runtime.loadLevel === 'function') {
                runtime.loadLevel(restoredLevel);
                if (typeof runtime.showToast === 'function') {
                    runtime.showToast(toastText, 2.5);
                }
                return;
            }
            if (typeof runtime.requestGameplaySceneTransition === 'function') {
                const result = runtime.requestGameplaySceneTransition(restoredLevel, 'level_', false, 'cover');
                void Promise.resolve(result).catch(warnCloudRestoreGameRouteFailed);
                return;
            }
            throw new Error('[GameCtrl] missing gameplay route API for late cloud restore');
        };
        if (typeof runtime.scheduleOnce === 'function') {
            runtime.scheduleOnce(runRouteGame, 0.2);
        } else {
            runRouteGame();
        }
    }
    return status;
}

export function deferLeaderboardProgressDuringStartup(runtime: any, nextLevel: number): boolean {
    if (runtime._startupCloudRestorePending) {
        runtime._deferredLeaderboardProgress = Math.max(Math.floor(Number(runtime._deferredLeaderboardProgress) || 0), nextLevel);
        console.warn('[GameCtrl] defer leaderboard progress submit until startup cloud restore is resolved');
        return true;
    }
    if (runtime._startupCloudSaveBlockedForSession) {
        console.warn('[GameCtrl] skip leaderboard progress submit because startup cloud restore is unresolved');
        return true;
    }
    return false;
}

export function deferCloudGameStateSyncDuringStartup(runtime: any): boolean {
    if (runtime._startupCloudRestorePending) {
        runtime._deferredCloudGameStateSync = true;
        console.warn('[GameCtrl] defer cloud state sync until startup cloud restore is resolved');
        return true;
    }
    if (runtime._startupCloudSaveBlockedForSession) {
        console.warn('[GameCtrl] skip cloud state sync because startup cloud restore is unresolved for this session');
        return true;
    }
    return false;
}

export function resolveStartupCloudRestorePending(runtime: any, status: UserStateRestoreStatus): void {
    runtime._startupCloudRestorePending = false;
    runtime._startupCloudRestoreStatus = status;
    if (status === 'cloud_confirmed_empty') {
        if (!runtime._startupCloudRestoreHadLocalUserState && typeof runtime.grantStarterPropsForNewUser === 'function') {
            runtime.grantStarterPropsForNewUser();
        }
        flushDeferredStartupCloudSync(runtime);
        return;
    }
    if (status === 'local_progress_gt_1') {
        flushDeferredStartupCloudSync(runtime);
        return;
    }
    if (status === 'cloud_progress_gt_1') {
        runtime._deferredCloudGameStateSync = false;
        runtime._deferredLeaderboardProgress = 0;
        const restoredLevel = typeof runtime.getSavedLevel === 'function' ? runtime.getSavedLevel() : 0;
        if (restoredLevel > 1 && !runtime._startupCloudSaveBlockedForSession) {
            void LeaderboardMgr.inst.submitProgress(restoredLevel, UserMgr.inst.getProfile());
        }
        return;
    }
    runtime._deferredCloudGameStateSync = false;
    runtime._deferredLeaderboardProgress = 0;
    if (status === 'cloud_failed_unresolved' || status === 'cloud_timeout_unresolved' || status === 'cloud_unavailable_unresolved') {
        runtime._startupCloudSaveBlockedForSession = true;
    }
}

function flushDeferredStartupCloudSync(runtime: any): void {
    const shouldSyncState = !!runtime._deferredCloudGameStateSync;
    const leaderboardProgress = Math.max(0, Math.floor(Number(runtime._deferredLeaderboardProgress) || 0));
    runtime._deferredCloudGameStateSync = false;
    runtime._deferredLeaderboardProgress = 0;
    if (shouldSyncState) {
        runtime.queueCloudGameStateSync();
    }
    if (leaderboardProgress > 0 && !runtime._startupCloudSaveBlockedForSession) {
        void LeaderboardMgr.inst.submitProgress(leaderboardProgress, UserMgr.inst.getProfile());
    }
}
