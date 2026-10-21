import type { FunnelEventOptions } from './AnalyticsMgr';

export type SettlementTarget = { logicalLevelId: number; gameplayEntryMode: string };
type SettlementContext = Omit<FunnelEventOptions, 'eventName'>;
type Settlement = {
    id: string; context: SettlementContext; target: SettlementTarget | null;
    startedAt: number; shown: boolean; attempts: number;
};
type Attempt = {
    id: string; settlement: Settlement; action: string; target: SettlementTarget | null;
    startedAt: number; phase: 'selected' | 'loading' | 'entered';
    targetRoundId?: string; targetPhysicalLevelId?: string | number; gates: Set<string>;
};

/** Keeps the source round after pass finalization and across scene/level changes. */
export class SettlementAnalytics {
    private current: Settlement | null = null;
    private pending: Attempt | null = null;

    constructor(private emit: (event: FunnelEventOptions) => void, private allowed: () => boolean) {}

    /** Copy before starting an async action; a later levelStarted must not reassign its source. */
    captureWinContext(): SettlementContext | null {
        const state = this.current;
        if (!this.allowed() || !state || state.context.extra?.settlementOutcome !== 'win') return null;
        return { ...state.context, extra: { ...state.context.extra } };
    }

    begin(context: SettlementContext, outcome: string, target: SettlementTarget | null): string {
        if (!this.allowed()) return '';
        if (!context.roundId) {
            console.error('[SettlementAnalytics] source round is unavailable');
            return '';
        }
        const id = `${context.roundId}:settlement:${outcome}`;
        if (this.current?.id === id) return id;
        this.current = { id, context: { ...context, extra: { ...context.extra, settlementOutcome: outcome } },
            target, startedAt: Date.now(), shown: false, attempts: 0 };
        this.record(this.current, 'settlement_started', { hasNextLevel: target !== null });
        return id;
    }

    shown(id: string, presentation: string): void {
        const state = this.current;
        if (!this.allowed() || !state || state.id !== id || state.shown) return;
        state.shown = true;
        this.record(state, 'settlement_shown', { presentation, hasNextLevel: state.target !== null,
            elapsedMsFromSettlement: Date.now() - state.startedAt });
    }

    displayFailed(id: string, reason: string, message: string): void {
        const state = this.current;
        if (this.allowed() && state?.id === id) this.record(state, 'settlement_display_failed', { reason }, false, message);
    }

    action(id: string, action: 'next' | 'home' | 'replay', target?: SettlementTarget | null): string {
        const state = this.current;
        if (!this.allowed() || !state || state.id !== id) return '';
        if (this.pending?.settlement === state) {
            if (this.pending.action === action) return this.pending.id;
            this.finish(this.pending.id, 'cancelled', 'another_settlement_action');
        }
        const attempt: Attempt = { id: `${id}:attempt:${++state.attempts}`, settlement: state,
            action, target: target === undefined ? state.target : target,
            startedAt: Date.now(), phase: 'selected', gates: new Set() };
        this.pending = attempt;
        this.record(state, 'settlement_action', { ...this.fields(attempt),
            elapsedMsFromSettlement: Date.now() - state.startedAt });
        return attempt.id;
    }

    gate(id: string, result: 'passed' | 'blocked' | 'exempt' | 'cancelled' | 'failed', reason: string, retryable = false): void {
        const attempt = this.find(id);
        if (!attempt || attempt.gates.has(`${result}:${reason}:${retryable}`)) return;
        attempt.gates.add(`${result}:${reason}:${retryable}`);
        this.record(attempt.settlement, 'settlement_gate_result', { ...this.fields(attempt), result, reason, retryable },
            result === 'passed' || result === 'exempt');
        if (result === 'cancelled' || (result === 'failed' && !retryable)) this.finish(id, result, reason);
    }

    transition(id: string): void {
        const attempt = this.find(id);
        if (!attempt || attempt.phase !== 'selected') return;
        attempt.phase = 'loading';
        this.record(attempt.settlement, 'settlement_transition_start', this.fields(attempt));
    }

    levelStarted(context: SettlementContext): void {
        if (!this.allowed()) return;
        const attempt = this.pending;
        this.current = null;
        if (!attempt) return;
        if (attempt.phase !== 'loading' || !attempt.target
            || Number(context.logicalLevelId) !== attempt.target.logicalLevelId
            || context.gameplayEntryMode !== attempt.target.gameplayEntryMode) {
            this.finish(attempt.id, 'superseded', 'different_level_entry');
            return;
        }
        attempt.targetRoundId = context.roundId;
        attempt.targetPhysicalLevelId = context.physicalLevelId;
        attempt.phase = 'entered';
        this.record(attempt.settlement, 'settlement_transition_result', {
            ...this.fields(attempt), result: 'entered', elapsedMsFromAction: Date.now() - attempt.startedAt,
        });
    }

    ready(context: SettlementContext): Record<string, unknown> {
        const attempt = this.pending;
        if (!this.allowed() || !attempt || attempt.phase !== 'entered'
            || !context.roundId || attempt.targetRoundId !== context.roundId) return {};
        const fields = { settlementId: attempt.settlement.id, transitionAttemptId: attempt.id,
            fromRoundId: attempt.settlement.context.roundId };
        this.finish(attempt.id, context.success === true ? 'playable' : 'failed',
            context.success === true ? 'interaction_ready' : context.errorCode || 'interaction_not_ready');
        return fields;
    }

    failTransition(reason: string, message = ''): void {
        if (this.pending && this.pending.phase !== 'selected') this.finish(this.pending.id, 'failed', reason, message);
    }

    finish(id: string, result: 'playable' | 'failed' | 'cancelled' | 'completed' | 'returned_home' | 'superseded',
        reason: string, message = ''): void {
        const attempt = this.find(id);
        if (!attempt) return;
        this.record(attempt.settlement, 'settlement_transition_result', { ...this.fields(attempt), result, reason,
            elapsedMsFromAction: Date.now() - attempt.startedAt },
            result === 'playable' || result === 'completed' || result === 'returned_home', message);
        this.pending = null;
        if (['returned_home', 'completed', 'superseded'].includes(result) && this.current === attempt.settlement) this.current = null;
    }

    background(): void {
        if (!this.allowed()) return;
        const state = this.pending?.settlement || this.current;
        if (state) this.record(state, 'settlement_background', this.pending ? this.fields(this.pending) : {});
    }

    private find(id: string): Attempt | null {
        return this.allowed() && id && this.pending?.id === id ? this.pending : null;
    }

    private fields(attempt: Attempt): Record<string, unknown> {
        return { settlementId: attempt.settlement.id, transitionAttemptId: attempt.id, action: attempt.action,
            fromRoundId: attempt.settlement.context.roundId,
            fromLogicalLevelId: attempt.settlement.context.logicalLevelId,
            fromPhysicalLevelId: attempt.settlement.context.physicalLevelId,
            fromGameplayEntryMode: attempt.settlement.context.gameplayEntryMode,
            ...(attempt.target ? { toLogicalLevelId: attempt.target.logicalLevelId,
                toGameplayEntryMode: attempt.target.gameplayEntryMode } : {}),
            ...(attempt.targetRoundId ? { toRoundId: attempt.targetRoundId,
                toPhysicalLevelId: attempt.targetPhysicalLevelId } : {}) };
    }

    private record(state: Settlement, eventName: string, extra: Record<string, unknown>, success = true, errorMessage = ''): void {
        this.emit({ ...state.context, eventName, source: 'settlement', success,
            errorCode: success ? '' : String(extra.reason || extra.result || ''), errorMessage,
            extra: { settlementId: state.id, settlementSchemaVersion: 1, ...extra, ...state.context.extra } });
    }
}
