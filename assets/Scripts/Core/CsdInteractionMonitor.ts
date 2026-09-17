type State = { foreground: boolean; expected: string; blockers: string[]; validActions: number };
/** Passive sampled observation; no unlocking, timeout UI, or gameplay decisions. */
export class CsdInteractionMonitor {
    private episode: { reason: string; startedAt: number; foregroundMs: number; actions: number } | null = null;
    private previousAt = 0;
    private previousForeground = false;
    constructor(private emit: (extra: Record<string, unknown>) => void) {}
    observe(state: State, now: number): void {
        if (this.episode && this.previousForeground && state.foreground) {
            // A long gap is not evidence of continuously foreground execution.
            this.episode.foregroundMs += Math.min(1000, Math.max(0, now - this.previousAt));
        }
        this.previousAt = now;
        this.previousForeground = state.foreground;
        if (!state.foreground) return;
        const reason = !state.expected ? state.blockers.slice().sort().join('|') : '';
        if (this.episode && this.episode.reason !== reason) this.finish(
            state.expected ? 'observation_interrupted' : reason ? 'reason_changed' : 'recovered', state.validActions, now);
        if (reason && !this.episode) this.episode = { reason, startedAt: now, foregroundMs: 0, actions: state.validActions };
    }
    finish(outcome: string, validActions: number, now: number): void {
        if (!this.episode) return;
        this.emit({ ...this.episode, endedAt: now, outcome,
            effectiveActionsSinceStart: Math.max(0, validActions - this.episode.actions),
            timing: 'foreground_sampled_500ms', observationComplete: outcome === 'recovered' });
        this.episode = null;
    }
}
