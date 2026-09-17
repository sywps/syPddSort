type Event = Record<string, any>;
type Guide = { base: Event; key: string; shownAt: number; hitCount: number; missCount: number; actionFailureCount: number; completed: boolean; lastMissAt: number; firstMissAt: number; lastResult: string;
    consecutiveMisses?: number; maxConsecutiveMisses?: number; missReasons?: Record<string, number> };
const KEY = 'pdd.analytics.measurements.release.v3';

/** Exact cumulative counters; reports select the latest snapshot, never sum snapshots. */
export class AnalyticsMeasurements {
    private guides = new Map<string, Guide>();
    private normalStates = new Map<string, string>();
    private touchCount = 0;
    private restored = false;
    constructor(private storage: { getItem(k: string): string | null; setItem(k: string, v: string): void },
        private emit: (event: Event) => boolean | void,
        private allowed: () => boolean = () => false) { this.restore(); }

    private restore(): void {
        if (this.restored || !this.allowed()) return;
        this.restored = true;
        try {
            const saved = JSON.parse(this.storage.getItem(KEY) || '[]');
            for (const g of saved) if (g?.key && g.base) this.guides.set(g.key, g);
        } catch (error) { console.error('[AnalyticsMeasurements] restore failed', error); }
    }
    private persist(): void {
        if (!this.allowed()) return;
        try { this.storage.setItem(KEY, JSON.stringify([...this.guides.values()])); }
        catch (error) { console.error('[AnalyticsMeasurements] counters not persisted', error); }
    }
    accept(event: Event): boolean {
        if (!this.allowed()) return false;
        this.restore();
        const name = event.eventName;
        const diagnostic = (globalThis as any).__PDD_ANALYTICS_DIAGNOSTIC__ === true;
        if (name === 'interaction_touch_attempt') return ++this.touchCount <= 3 || event.success === false || diagnostic;
        if (name === 'l1_release_state') {
            const key = `${event.roundId || event.sessionId}:${event.stepName === 'interaction_ready_emitted' ? 'ready' : 'state'}`;
            const state = event.errorCode || 'normal';
            if (this.normalStates.get(key) === state) return diagnostic;
            this.normalStates.set(key, state);
            if (this.normalStates.size > 20) this.normalStates.delete(this.normalStates.keys().next().value!);
        }
        if (!['pch_guide_step_shown', 'pch_guide_tap_result', 'pch_guide_step_done'].includes(name)) return true;
        const key = `${event.sessionId}:${event.roundId}:${event.extra?.guideId}:${event.stepId}`;
        let g = this.guides.get(key);
        if (!g) {
            g = { key, base: { ...event }, shownAt: name === 'pch_guide_step_shown' ? event.timestamp : 0,
                hitCount: 0, missCount: 0, actionFailureCount: 0, completed: false, firstMissAt: 0, lastMissAt: 0, lastResult: '' };
            this.guides.set(key, g);
        }
        if (name === 'pch_guide_tap_result') {
            if (event.success) { g.hitCount++; g.consecutiveMisses = 0; }
            else if (/^miss/.test(event.extra?.result || event.errorCode || '')) {
                g.missCount++; g.firstMissAt ||= event.timestamp; g.lastMissAt = event.timestamp;
                g.consecutiveMisses = (g.consecutiveMisses || 0) + 1;
                g.maxConsecutiveMisses = Math.max(g.maxConsecutiveMisses || 0, g.consecutiveMisses);
                const reason = String(event.extra?.missReason || 'unspecified').slice(0, 64);
                g.missReasons ||= {};
                g.missReasons[reason] = (g.missReasons[reason] || 0) + 1;
                if (event.extra) event.extra.sampledMissOrdinal = g.missCount; }
            else g.actionFailureCount = (g.actionFailureCount || 0) + 1;
            g.lastResult = event.extra?.result || event.errorCode || '';
        }
        if (name === 'pch_guide_step_done') g.completed = true;
        this.persist();
        if (name === 'pch_guide_step_done' || (g.hitCount + g.missCount + (g.actionFailureCount || 0)) % 5 === 0) this.summary(g, name);
        return diagnostic || name !== 'pch_guide_tap_result' || (!event.success &&
            (/^miss/.test(event.extra?.result || event.errorCode || '') ? g.missCount <= 3 : g.actionFailureCount <= 1));
    }
    private summary(g: Guide, reason: string): boolean {
        return this.emit({ ...g.base, eventName: 'guide_step_summary', timestamp: g.shownAt || g.base.timestamp, success: g.completed,
            extra: { guideId: g.base.extra?.guideId || '', guideInstanceId: g.key, shownAt: g.shownAt,
                hitCount: g.hitCount, missCount: g.missCount, completed: g.completed,
                actionFailureCount: g.actionFailureCount || 0,
                maxConsecutiveMisses: g.maxConsecutiveMisses || 0,
                missReasons: g.missReasons || {},
                snapshotAt: Date.now(),
                firstMissAt: g.firstMissAt, lastMissAt: g.lastMissAt, lastResult: g.lastResult,
                reason, snapshotSeq: g.hitCount + g.missCount + (g.actionFailureCount || 0) + (g.completed ? 1 : 0) } }) !== false;
    }
    flush(reason: string): void {
        if (!this.allowed()) return;
        this.restore();
        for (const g of this.guides.values()) {
            if (this.summary(g, reason) && (reason === 'level_end' || reason === 'recovered')) this.guides.delete(g.key);
        }
        if (reason === 'level_end') this.touchCount = 0;
        this.persist();
    }
}
