export const ENCOURAGEMENT_EXPERIMENT_ID = 'encouragement_ab_v1';
export const ENCOURAGEMENT_EXPERIMENT_STORAGE = 'pdd.encouragement_ab_v1.decision';
type Decision = {
    id: string; status: 'enrolled' | 'excluded' | 'test'; content: 'A' | 'B';
    enrolledAt: number; reason: string; openid?: string;
};
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export class EncouragementExperimentState {
    decision: Decision | null = null;
    private storage: Storage | null = null;
    private initialized = false;
    private eligible = false;
    private locked = false;
    private verified = false;

    initialize(storage: Storage, isWechat: boolean, preview: boolean): void {
        if (this.initialized) return;
        this.initialized = true;
        this.storage = storage;
        if (preview || !isWechat) {
            this.decision = { id: ENCOURAGEMENT_EXPERIMENT_ID, status: 'test', content: 'A', enrolledAt: 0, reason: 'preview' };
            return;
        }
        try {
            const raw = storage.getItem(ENCOURAGEMENT_EXPERIMENT_STORAGE);
            if (raw) {
                const saved = JSON.parse(raw);
                if (saved.id !== ENCOURAGEMENT_EXPERIMENT_ID || !['enrolled', 'excluded'].includes(saved.status)
                    || !['A', 'B'].includes(saved.content)
                    || (saved.status === 'enrolled' && (!(saved.enrolledAt > 0) || !saved.openid))) throw new Error('invalid saved assignment');
                this.decision = saved;
            } else this.eligible = !(Number(storage.getItem('pdd.level')) > 1);
        } catch (error) {
            console.error('[EncouragementExperiment] invalid storage:', error);
            this.exclude('assignment_storage_unavailable');
        }
    }

    request(): Record<string, unknown> {
        return { id: ENCOURAGEMENT_EXPERIMENT_ID, eligible: !this.decision && this.eligible,
            test: this.decision?.status === 'test',
            exclusionReason: this.decision?.status === 'excluded' ? this.decision.reason : '' };
    }

    accept(openid: string, receipt: any): void {
        if (this.locked || this.decision?.status === 'test' || this.decision?.status === 'excluded') return;
        if (this.decision?.openid && this.decision.openid !== openid) { this.exclude('identity_changed'); return; }
        if (!openid || receipt?.id !== ENCOURAGEMENT_EXPERIMENT_ID) { this.exclude('assignment_protocol_unavailable'); return; }
        if (receipt.status !== 'enrolled') { this.exclude(receipt.reason || 'existing_user'); return; }
        if (!['A', 'B'].includes(receipt.content) || !(receipt.enrolledAt > 0)) { this.exclude('assignment_invalid'); return; }
        if (this.decision && (this.decision.content !== receipt.content || this.decision.enrolledAt !== receipt.enrolledAt)) {
            this.exclude('assignment_changed'); return;
        }
        this.verified = true;
        this.save({ id: ENCOURAGEMENT_EXPERIMENT_ID, status: 'enrolled', content: receipt.content,
            enrolledAt: receipt.enrolledAt, reason: 'new_user', openid });
    }

    exclude(reason: string): void {
        if (this.locked || this.decision?.status === 'test' || this.decision?.status === 'excluded') return;
        this.save({ id: ENCOURAGEMENT_EXPERIMENT_ID, status: 'excluded', content: 'A', enrolledAt: 0, reason });
    }

    freeze(): void {
        if (this.locked) return;
        if (!this.verified) this.exclude('identity_unavailable_or_timeout');
        this.locked = true;
    }

    content(): 'A' | 'B' {
        return 'A'; // Experiment retired; keep persisted historical assignment unchanged.
    }

    private save(decision: Decision): void {
        try {
            if (!this.storage) throw new Error('storage not initialized');
            this.storage.setItem(ENCOURAGEMENT_EXPERIMENT_STORAGE, JSON.stringify(decision));
            this.decision = decision;
        } catch (error) {
            console.error('[EncouragementExperiment] cannot persist decision:', error);
            this.decision = { id: ENCOURAGEMENT_EXPERIMENT_ID, status: 'excluded', content: 'A', enrolledAt: 0, reason: 'assignment_storage_unavailable' };
        }
    }

    fields(): Record<string, string | number> {
        const d = this.decision;
        return d ? { encouragementExperimentId: d.id, encouragementExperimentStatus: 'retired',
            encouragementExperimentBucket: d.status === 'enrolled' ? d.content : '',
            encouragementEnrolledAt: d.enrolledAt, encouragementExperimentReason: 'experiment_closed' } : {};
    }
}
export const encouragementExperiment = new EncouragementExperimentState();
