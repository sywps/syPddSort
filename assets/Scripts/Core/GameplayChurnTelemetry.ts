import { AnalyticsMgr } from './AnalyticsMgr';

let sequence = 0;
export type ChurnTransition = { id: string; fromAttemptId: string; targetLevel: number; mode: string; startedAt: number };

/** Diagnostic-only events: never change gameplay or expose raw errors/user identifiers. */
export function trackGameplayChurn(runtime: any, stage: string, reason = '', transition?: ChurnTransition): void {
    try {
        if (runtime.isCoopMode?.() || runtime.isRankedPvpMode?.()) return;
        const levelId = runtime.getActiveLogicalLevelId?.() || runtime.levelData?.levelId || 0;
        const active = transition || runtime._churnTransition;
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName: 'gameplay_flow',
            page: runtime.getAnalyticsPage?.() || 'level_game',
            levelId,
            logicalLevelId: levelId,
            physicalLevelId: runtime.getActivePhysicalLevelId?.() || levelId,
            source: 'churn_diagnostic_v1',
            stepName: stage,
            success: !reason,
            errorCode: reason,
            duration: active ? Math.max(0, Date.now() - active.startedAt) : 0,
            extra: {
                attemptId: runtime._churnAttemptId || '',
                transitionId: active?.id || '',
                fromAttemptId: active?.fromAttemptId || '',
                targetLevel: active?.targetLevel || 0,
                entryMode: runtime._activeGameplayEntryMode || (runtime._isThemeLevel ? 'theme' : 'main'),
                initSeq: Number(runtime._gameplayInitSeq) || 0,
                dataVersion: runtime.getRuntimeRemoteHash?.() || '',
                guideStep: Number(runtime._guideStep ?? -1),
                timeRemain: Number(runtime.timeRemain) || 0,
                isGameEnd: runtime.isGameEnd === true,
                touchAttempts: Number(runtime._interactionTouchAttemptCount) || 0,
            },
        });
    } catch (_) {
        // Telemetry failure must not block gameplay or recursively emit diagnostics.
    }
}

export function beginChurnAttempt(runtime: any): void {
    runtime._churnAttemptId = `a${Date.now().toString(36)}-${++sequence}`;
    trackGameplayChurn(runtime, 'initializing');
}

export function beginChurnTransition(runtime: any): void {
    runtime._churnTransition = { id: `t${Date.now().toString(36)}-${++sequence}`,
        fromAttemptId: runtime._churnAttemptId || '', targetLevel: 0,
        mode: runtime._isThemeLevel ? 'theme' : 'main', startedAt: Date.now() };
    trackGameplayChurn(runtime, 'next_accepted');
}

export function requestChurnLevel(runtime: any, targetLevel: number, transition?: ChurnTransition): void {
    const active = transition || runtime._churnTransition;
    if (active) active.targetLevel = targetLevel;
    trackGameplayChurn(runtime, 'next_route_requested', '', active);
}

export function finishChurnReady(runtime: any, levelId: number, mode: string): void {
    const active: ChurnTransition | undefined = runtime._churnTransition;
    if (active && (active.targetLevel !== levelId || active.mode !== mode)) {
        trackGameplayChurn(runtime, 'next_interrupted', 'route_changed', active);
        runtime._churnTransition = null;
    }
    trackGameplayChurn(runtime, 'ready');
    if (runtime._churnTransition) {
        trackGameplayChurn(runtime, 'next_ready');
        runtime._churnTransition = null;
    }
}
