export const FIRST_LEVEL_EXPERIMENT_ID = 'first_level_abc_v1';
export const FIRST_LEVEL_EXPERIMENT_STORAGE = 'pdd.first_level_abc_v1.decision';
export type FirstLevelExperimentDecision = {
    id: string;
    status: 'enrolled' | 'excluded' | 'test';
    content: 'A' | 'B' | 'C';
    enrolledAt: number;
    reason: string;
    openid?: string;
};
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** One immutable decision per app run; late identity replies cannot switch content. */
export class FirstLevelExperimentState {
    decision: FirstLevelExperimentDecision | null = null;
    private storage: Storage | null = null;
    private initialized = false;
    private eligible = false;
    private locked = false;

    freeze(): void { this.locked = true; }

    initialize(storage: Storage, isWechat: boolean, preview: 'A' | 'B' | 'C' | null): void {
        if (this.initialized) return;
        this.initialized = true;
        this.storage = storage;
        if (preview || !isWechat) {
            this.decision = { id: FIRST_LEVEL_EXPERIMENT_ID, status: 'test', content: preview || 'A', enrolledAt: 0, reason: 'preview' };
            return;
        }
        try {
            const raw = storage.getItem(FIRST_LEVEL_EXPERIMENT_STORAGE);
            if (raw) {
                const saved = JSON.parse(raw);
                if (saved.id !== FIRST_LEVEL_EXPERIMENT_ID || !['enrolled', 'excluded'].includes(saved.status)
                    || !['A', 'B', 'C'].includes(saved.content)
                    || (saved.status === 'enrolled' && (!(saved.enrolledAt > 0) || !saved.openid))) {
                    throw new Error('invalid saved assignment');
                }
                this.decision = saved;
                return;
            }
            this.eligible = !(Number(storage.getItem('pdd.level')) > 1);
        } catch (error) {
            this.exclude('assignment_storage_unavailable');
        }
    }

    request(): Record<string, unknown> {
        return { id: FIRST_LEVEL_EXPERIMENT_ID, eligible: !this.decision && this.eligible,
            test: this.decision?.status === 'test',
            exclusionReason: this.decision?.status === 'excluded' ? this.decision.reason : '' };
    }

    accept(openid: string, receipt: any): void {
        if (this.locked) return;
        if (this.decision?.status === 'enrolled' && this.decision.openid !== openid) {
            this.save({ id: FIRST_LEVEL_EXPERIMENT_ID, status: 'excluded', content: 'A', enrolledAt: 0, reason: 'identity_changed' });
            return;
        }
        if (this.decision) return;
        if (!openid || !receipt || receipt.id !== FIRST_LEVEL_EXPERIMENT_ID) {
            this.exclude('assignment_protocol_unavailable');
            return;
        }
        if (receipt.status !== 'enrolled') {
            this.exclude(receipt.reason || 'existing_user');
            return;
        }
        if (!['A', 'B', 'C'].includes(receipt.content) || !(receipt.enrolledAt > 0)) {
            this.exclude('assignment_invalid');
            return;
        }
        this.save({ id: FIRST_LEVEL_EXPERIMENT_ID, status: 'enrolled', content: receipt.content,
            enrolledAt: receipt.enrolledAt, openid, reason: 'new_user' });
    }

    exclude(reason: string): void {
        if (this.decision) return;
        this.save({ id: FIRST_LEVEL_EXPERIMENT_ID, status: 'excluded', content: 'A', enrolledAt: 0, reason });
    }

    private save(decision: FirstLevelExperimentDecision): void {
        try {
            if (!this.storage) throw new Error('assignment storage is not initialized');
            this.storage.setItem(FIRST_LEVEL_EXPERIMENT_STORAGE, JSON.stringify(decision));
            this.decision = decision;
        } catch (error) {
            console.error('[FirstLevelExperiment] cannot persist decision:', error);
            this.decision = { id: FIRST_LEVEL_EXPERIMENT_ID, status: 'excluded', content: 'A', enrolledAt: 0,
                reason: 'assignment_storage_unavailable' };
        }
    }

    fields(): Record<string, string | number> {
        const d = this.decision;
        return d ? {
            firstLevelExperimentId: d.id,
            firstLevelExperimentStatus: d.status,
            firstLevelExperimentBucket: d.status === 'enrolled' ? d.content : '',
            firstLevelContentVersion: `${d.content}_v1`,
            firstLevelEnrolledAt: d.enrolledAt,
            firstLevelExperimentReason: d.reason,
        } : {};
    }
}

export const firstLevelExperiment = new FirstLevelExperimentState();
