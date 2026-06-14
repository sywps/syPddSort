import { LeaderboardMgr, UserMgr } from '../GameCtrlShared';
import type { CloudUserState } from '../GameCtrlShared';
import type { UserStateRestoreStatus } from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';

export function applyLateCloudUserStateToRuntime(runtime: any, state: CloudUserState | null, hadLocalUserState: boolean): UserStateRestoreStatus | null {
    if (!runtime.isValid || !state) return null;
    const beforeLevel = runtime.getSavedLevel();
    const status = runtime.applyCloudUserState(state);
    if (status !== 'cloud_progress_gt_1') return status;
    const restoredLevel = runtime.getSavedLevel();
    const activeLevel = Math.max(1, Math.floor(Number(runtime.getActiveLogicalLevelId?.() || 1) || 1));
    if (!runtime.isExternalLevelPreviewActive() && runtime.getUrlLevel() <= 0 && restoredLevel > Math.max(beforeLevel, activeLevel)) {
        console.warn('[GameCtrl] late cloud progress restored, switching startup route to Home', {
            beforeLevel, activeLevel, restoredLevel, hadLocalUserState,
        });
        const toastText = `已恢复进度到第${restoredLevel}关`;
        AppRoot.tryGet()?.session.setPendingHomeToast(toastText, 2.5);
        const routeHome = runtime.requestHomeSceneTransition || runtime.showMainMenu;
        if (typeof routeHome === 'function') {
            const runRouteHome = () => {
                if (!runtime.isValid) return;
                const result = typeof runtime.requestHomeSceneTransition === 'function'
                    ? runtime.requestHomeSceneTransition('cloud-restore', 'cover')
                    : routeHome.call(runtime);
                if (!AppRoot.tryGet() && typeof runtime.showToast === 'function') {
                    runtime.showToast(toastText, 2.5);
                }
                void Promise.resolve(result).catch((error) => {
                    console.warn('[GameCtrl] late cloud progress home route failed:', error);
                });
            };
            if (typeof runtime.scheduleOnce === 'function') {
                runtime.scheduleOnce(runRouteHome, 0.2);
            } else {
                runRouteHome();
            }
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
