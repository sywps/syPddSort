type Payload = Record<string, any>;
type Pending = { id: string; name: string; data: Payload; owner: string; origin?: string };
export type DeliveryDiagnosticResult = { outcome: 'identity_ready' | 'validated' | 'acknowledged' | 'failed';
    error?: unknown; rejectedIds?: string[]; retryDelayMs?: number };
export type DeliveryDiagnostics = { begin(endpoint: string, events: { id: string; eventName: string }[]):
    (result: DeliveryDiagnosticResult) => void };
type DeliveryOptions = { key?: string; environment?: string; strictOwner?: boolean;
    diagnostics?: DeliveryDiagnostics;
    accept?: (name: string, data: Payload) => boolean; prepare?: (name: string, data: Payload) => Payload };
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
// Deliberately do not import legacy queues whose runtime origin is unknown.
const KEY = 'pdd.analytics.delivery.release.v3';
const FUNCTIONS = new Set(['addFunnelEvents', 'addBehaviorData', 'saveLevelRecord']);

/** Acknowledged, bounded outbox. A retry always retains the original identity and timestamp. */
export class AnalyticsDelivery {
    private pending: Pending[] = [];
    private restored = false;
    private running = false;
    private paused = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private retryMs = 1200;
    private sequence = 0;
    private readonly instance = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    readonly quality = { rejected: 0, storageFailures: 0, uploadFailures: 0 };

    constructor(private storage: Storage, private ready: () => Promise<string>,
        private send: (name: string, data: Payload) => Promise<any>,
        private allowed: () => boolean = () => false, private options: DeliveryOptions = {}) { this.restore(); }

    private get key(): string { return this.options.key || KEY; }
    private get environment(): string { return this.options.environment || 'wechat_release'; }
    private quarantine(items: Pending[], reason: string): void {
        if (!items.length) return;
        this.quality.rejected += items.length;
        console.error('[AnalyticsDelivery] retained in quarantine', reason, items.length);
        // Bounded explicit quarantine; never reports rejected events as acknowledged.
        const key = this.key + '.quarantine';
        const previous = JSON.parse(this.storage.getItem(key) || '[]');
        if (!Array.isArray(previous) || previous.length + items.length > 1000) throw new Error('analytics quarantine full or invalid');
        this.storage.setItem(key, JSON.stringify([...previous, ...items.map(item => ({ ...item, reason }))]));
    }

    private restore(): void {
        if (this.restored || !this.allowed()) return;
        this.restored = true;
        try {
            const saved = JSON.parse(this.storage.getItem(this.key) || '[]');
            if (!Array.isArray(saved) || saved.length > 1000 || saved.some(x => typeof x.id !== 'string'
                || !FUNCTIONS.has(x.name) || !x.data || typeof x.data !== 'object' || Array.isArray(x.data)
                || typeof x.owner !== 'string')) throw new Error('invalid analytics outbox');
            this.pending = saved.filter(x => x.data.analyticsEnvironment === this.environment && x.data.csdVersion >= 3);
            this.quality.rejected += saved.length - this.pending.length;
            if (this.options.strictOwner) {
                const unowned = this.pending.filter(x => !x.owner);
                this.quarantine(unowned, 'restored_without_confirmed_owner');
                this.pending = this.pending.filter(x => !!x.owner);
                this.persist();
            }
        } catch (error) { this.quality.storageFailures++; console.error('[AnalyticsDelivery] restore failed', error); }
    }

    enqueue(name: string, data: Payload, owner = ''): boolean {
        if (!this.allowed()) return false;
        this.restore();
        if (!FUNCTIONS.has(name)) throw new Error('unsupported analytics endpoint');
        if (this.options.prepare) data = this.options.prepare(name, data);
        if (this.options.accept && !this.options.accept(name, data)) return false;
        const diagnostic = name === 'addFunnelEvents' && /^(l1_release_state|interaction_touch_attempt|startup_|rewarded_ad_load_|rewarded_ad_preload)/.test(data.eventName || '');
        if (this.pending.length >= (diagnostic ? 800 : 1000)) {
            this.quality.rejected++;
            console.error('[AnalyticsDelivery] outbox full; event rejected', name, data.eventName || 'level_record');
            return false;
        }
        const id = data.eventId || `${this.instance}:${++this.sequence}`;
        this.pending.push({ id, name, owner, origin: this.instance, data: { ...data, eventId: id, analyticsSchemaVersion: 2,
            csdVersion: 3, analyticsEnvironment: this.environment,
            timestamp: data.timestamp || Date.now() } });
        this.persist();
        this.schedule();
        return true;
    }

    get size(): number { return this.pending.length; }
    get isPaused(): boolean { return this.paused; }
    /** Pause network scheduling only; enqueue/persist and in-flight acknowledgements remain active. */
    setPaused(paused: boolean): void {
        this.paused = paused;
        if (paused) {
            if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        } else this.schedule();
    }
    private persist(): void {
        if (!this.allowed()) return;
        try { this.storage.setItem(this.key, JSON.stringify(this.pending)); }
        catch (error) { this.quality.storageFailures++; console.error('[AnalyticsDelivery] persistence failed; memory only', error); }
    }
    private schedule(): void {
        if (this.paused || this.running || !this.allowed()) return;
        if (this.timer || !this.pending.length) return;
        this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.retryMs);
    }
    private async bounded<T>(work: Promise<T>): Promise<T> {
        let timeout: ReturnType<typeof setTimeout>;
        try { return await Promise.race([work, new Promise<T>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('analytics acknowledgement timeout')), 15000);
        })]); } finally { clearTimeout(timeout!); }
    }
    private beginDiagnostic(endpoint: string, batch: Pending[] = []): (result: DeliveryDiagnosticResult) => void {
        try {
            const finish = this.options.diagnostics?.begin(endpoint, batch.map(x => ({ id: x.id, eventName: x.data.eventName || 'level_record' })));
            return result => {
                try { finish?.(result); }
                catch (_) { console.warn('[AnalyticsDelivery] diagnostic observer failed'); }
            };
        } catch (_) {
            console.warn('[AnalyticsDelivery] diagnostic observer failed');
            return () => {};
        }
    }
    async flush(): Promise<void> {
        if (this.paused || !this.allowed()) return;
        this.restore();
        if (this.running || !this.pending.length) return;
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        this.running = true;
        let finishDiagnostic = this.beginDiagnostic('analyticsIdentity');
        let rejectedIds: string[] = [];
        try {
            const owner = await this.bounded(this.ready());
            if (!this.allowed()) return;
            if (!owner) throw new Error('analytics identity unavailable');
            finishDiagnostic({ outcome: 'identity_ready' });
            // Local queue validation is not a network request.
            finishDiagnostic = this.beginDiagnostic('queue_validation');
            if (this.options.strictOwner) {
                const wrong = this.pending.filter(x => (x.owner && x.owner !== owner) || (!x.owner && x.origin !== this.instance));
                this.quarantine(wrong, 'account_mismatch');
                this.pending = this.pending.filter(x => !wrong.includes(x));
                this.persist();
            }
            // Never attribute a previous account's saved events to the current account.
            const first = this.pending.find(x => !x.owner || x.owner === owner);
            if (!first) throw new Error('pending analytics belongs to another account');
            const batch = first.name === 'addFunnelEvents'
                ? this.pending.filter(x => x.name === first.name && (!x.owner || x.owner === owner)).slice(0, 20)
                : [first];
            batch.forEach(x => { x.owner = owner; });
            this.persist();
            const payload = first.name === 'addFunnelEvents'
                ? { events: batch.map(x => x.data), sessionId: first.data.sessionId }
                : first.data;
            if (!this.allowed()) return;
            finishDiagnostic({ outcome: 'validated' });
            // Identity may have completed after hide. Persist confirmed ownership, but defer the next request.
            if (this.paused) return;
            finishDiagnostic = this.beginDiagnostic(first.name, batch);
            const result = await this.bounded(this.send(first.name, this.options.strictOwner ? { ...payload, expectedOwner: owner } : payload));
            if (this.options.strictOwner && result?.ok === false && Array.isArray(result.rejectedIds) && result.rejectedIds.length) {
                const rejected = batch.filter(x => result.rejectedIds.includes(x.id));
                this.quarantine(rejected, result.errorCode || 'server_rejected');
                rejectedIds = rejected.map(x => x.id);
                this.pending = this.pending.filter(x => !rejected.includes(x));
                this.persist();
            }
            if (result?.ok !== true) throw new Error(result?.errorMessage || 'analytics write not acknowledged');
            if (this.options.strictOwner && (result.count !== batch.length || !Array.isArray(result.acknowledgedIds)
                || result.acknowledgedIds.length !== batch.length || !batch.every(x => result.acknowledgedIds.includes(x.id)))) {
                throw new Error('analytics event acknowledgement mismatch');
            }
            if (first.name === 'addFunnelEvents' && typeof result.count === 'number' && result.count !== batch.length) {
                throw new Error('analytics batch acknowledgement count mismatch');
            }
            const acknowledged = new Set(batch.map(x => x.id));
            this.pending = this.pending.filter(x => !acknowledged.has(x.id));
            this.persist();
            this.retryMs = 1200;
            finishDiagnostic({ outcome: 'acknowledged' });
        } catch (error) {
            this.quality.uploadFailures++;
            this.retryMs = Math.min(60000, this.retryMs * 2);
            finishDiagnostic({ outcome: 'failed', error, rejectedIds, retryDelayMs: this.retryMs });
            console.warn('[AnalyticsDelivery] retained for retry', error);
        } finally { this.running = false; this.schedule(); }
    }
}
