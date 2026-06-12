import { LeaderboardMgr } from '../GameCtrlShared';
import type { CloudUserState } from '../GameCtrlShared';

export function applyLateCloudUserStateToRuntime(runtime: any, state: CloudUserState | null, hadLocalUserState: boolean): void {
    if (!runtime.isValid || !state) return;
    const beforeLevel = runtime.getSavedLevel();
    const status = runtime.applyCloudUserState(state);
    if (status !== 'cloud_progress_gt_1') return;
    const restoredLevel = runtime.getSavedLevel();
    const activeLevel = Math.max(1, Math.floor(Number(runtime.getActiveLogicalLevelId?.() || 1) || 1));
    if (!runtime.isExternalLevelPreviewActive() && runtime.getUrlLevel() <= 0 && restoredLevel > Math.max(beforeLevel, activeLevel)) {
        console.warn('[GameCtrl] late cloud progress restored, switching startup route to Home', {
            beforeLevel, activeLevel, restoredLevel, hadLocalUserState,
        });
        const routeHome = runtime.requestHomeSceneTransition || runtime.showMainMenu;
        if (typeof routeHome === 'function') void routeHome.call(runtime);
    }
}

export async function mergeWeChatSelfProgressFallback(state: CloudUserState | null): Promise<CloudUserState | null> {
    const rawSavedLevel = state?.gameState?.savedLevel;
    const savedLevel = Math.floor(Number(rawSavedLevel) || 0);
    if ((typeof rawSavedLevel === 'number' && savedLevel <= 0) || savedLevel > 1) {
        return state;
    }
    const selfProgress = await LeaderboardMgr.inst.loadWeChatSelfProgress();
    if (!selfProgress || selfProgress <= Math.max(1, savedLevel)) {
        return state;
    }
    return {
        ...(state || {}),
        gameState: {
            ...(state?.gameState || {}),
            savedLevel: selfProgress,
            stateUpdatedAt: Math.max(Math.floor(Number(state?.gameState?.stateUpdatedAt) || 0), Date.now()),
        },
    };
}
