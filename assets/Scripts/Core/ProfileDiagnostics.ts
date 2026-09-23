import { AnalyticsMgr } from './AnalyticsMgr';

const reported = new Map<string, number>();
/** Quiet player-facing failures, with bounded diagnostics through the release outbox. */
export function reportProfileFailure(stage: string, error: unknown, itemId = 0, attempts = 1): void {
    const message = (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/\S+/g, '[resource]');
    const key = `${stage}:${itemId}:${message.slice(0,120)}`;
    const now = Date.now();
    if (now - (reported.get(key) || 0) < 60000) return;
    if (reported.size >= 128) reported.delete(reported.keys().next().value!);
    reported.set(key, now);
    console.warn('[Profile]', stage, itemId, message);
    AnalyticsMgr.inst.trackFunnelEvent({ eventName: 'profile_failed', page: 'app', source: stage,
        success: false, errorCode: stage, errorMessage: message.slice(0,300), extra: { itemId, attempts } });
}
