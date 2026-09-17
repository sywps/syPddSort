type Payload = Record<string, any>;
type Pending = { id: string; name: string; data: Payload; owner: string };
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
// Deliberately do not import legacy queues whose runtime origin is unknown.
const KEY = 'pdd.analytics.delivery.release.v3';
const FUNCTIONS = new Set(['addFunnelEvents', 'addBehaviorData', 'saveLevelRecord']);

/** Acknowledged, bounded outbox. A retry always retains the original identity and timestamp. */
export class AnalyticsDelivery {
    private pending: Pending[] = [];
    private restored = false;
    private running = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private retryMs = 1200;
    private sequence = 0;
    private readonly instance = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    readonly quality = { rejected: 0, storageFailures: 0, uploadFailures: 0 };

    constructor(private storage: Storage, private ready: () => Promise<string>,
        private send: (name: string, data: Payload) => Promise<any>,
        private allowed: () => boolean = () => false) { this.restore(); }

    private restore(): void {
        if (this.restored || !this.allowed()) return;
        this.restored = true;
        try {
            const saved = JSON.parse(this.storage.getItem(KEY) || '[]');
            if (!Array.isArray(saved) || saved.length > 1000 || saved.some(x => typeof x.id !== 'string'
                || !FUNCTIONS.has(x.name) || !x.data || typeof x.data !== 'object' || Array.isArray(x.data)
                || typeof x.owner !== 'string')) throw new Error('invalid analytics outbox');
            this.pending = saved.filter(x => x.data.analyticsEnvironment === 'wechat_release' && x.data.csdVersion >= 3);
            this.quality.rejected += saved.length - this.pending.length;
        } catch (error) { this.quality.storageFailures++; console.error('[AnalyticsDelivery] restore failed', error); }
    }

    enqueue(name: string, data: Payload, owner = ''): boolean {
        if (!this.allowed()) return false;
        this.restore();
        if (!FUNCTIONS.has(name)) throw new Error('unsupported analytics endpoint');
        const diagnostic = name === 'addFunnelEvents' && /^(l1_release_state|interaction_touch_attempt|startup_|rewarded_ad_load_|rewarded_ad_preload)/.test(data.eventName || '');
        if (this.pending.length >= (diagnostic ? 800 : 1000)) {
            this.quality.rejected++;
            console.error('[AnalyticsDelivery] outbox full; event rejected', name, data.eventName || 'level_record');
            return false;
        }
        const id = data.eventId || `${this.instance}:${++this.sequence}`;
        this.pending.push({ id, name, owner, data: { ...data, eventId: id, analyticsSchemaVersion: 2,
            csdVersion: 3, analyticsEnvironment: 'wechat_release',
            timestamp: data.timestamp || Date.now() } });
        this.persist();
        this.schedule();
        return true;
    }

    get size(): number { return this.pending.length; }
    private persist(): void {
        if (!this.allowed()) return;
        try { this.storage.setItem(KEY, JSON.stringify(this.pending)); }
        catch (error) { this.quality.storageFailures++; console.error('[AnalyticsDelivery] persistence failed; memory only', error); }
    }
    private schedule(): void {
        if (!this.allowed()) return;
        if (this.timer || !this.pending.length) return;
        this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.retryMs);
    }
    private async bounded<T>(work: Promise<T>): Promise<T> {
        let timeout: ReturnType<typeof setTimeout>;
        try { return await Promise.race([work, new Promise<T>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('analytics acknowledgement timeout')), 15000);
        })]); } finally { clearTimeout(timeout!); }
    }
    async flush(): Promise<void> {
        if (!this.allowed()) return;
        this.restore();
        if (this.running || !this.pending.length) return;
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        this.running = true;
        try {
            const owner = await this.bounded(this.ready());
            if (!this.allowed()) return;
            if (!owner) throw new Error('analytics identity unavailable');
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
            const result = await this.bounded(this.send(first.name, payload));
            if (result?.ok !== true) throw new Error(result?.errorMessage || 'analytics write not acknowledged');
            if (first.name === 'addFunnelEvents' && typeof result.count === 'number' && result.count !== batch.length) {
                throw new Error('analytics batch acknowledgement count mismatch');
            }
            const acknowledged = new Set(batch.map(x => x.id));
            this.pending = this.pending.filter(x => !acknowledged.has(x.id));
            this.persist();
            this.retryMs = 1200;
        } catch (error) {
            this.quality.uploadFailures++;
            this.retryMs = Math.min(60000, this.retryMs * 2);
            console.warn('[AnalyticsDelivery] retained for retry', error);
        } finally { this.running = false; this.schedule(); }
    }
}
