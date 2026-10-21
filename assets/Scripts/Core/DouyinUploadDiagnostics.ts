import type { DeliveryDiagnostics, DeliveryDiagnosticResult } from './AnalyticsDelivery';

type State = 'unknown' | 'foreground' | 'background';
type EventRef = { id: string; eventName: string };
type Entry = { attemptId: number; endpoint: string; startedAt: number; endedAt: number; elapsedMs: number;
    stateAtStart: State; stateAtEnd: State; lifecycleChanges: number; outcome: string; errorCode: string;
    events: EventRef[]; retryOf: number[]; recoveredEventIds: string[]; rejectedIds: string[]; retryDelayMs: number;
    retryResults: { attemptId: number; outcome: string; endedAt: number; recoveredEventIds: string[]; rejectedIds: string[] }[] };
const ENDPOINTS = new Set(['analyticsIdentity', 'queue_validation', 'addBehaviorData', 'addFunnelEvents', 'saveLevelRecord']);
const ERROR_CODES: Record<string, string> = {
    'analytics identity timeout': 'IDENTITY_TIMEOUT',
    'analytics acknowledgement timeout': 'ACK_TIMEOUT',
    'douyin analytics request timeout': 'REQUEST_TIMEOUT',
    'douyin analytics network request failed': 'NETWORK_FAILED',
    'douyin analytics HTTP request failed': 'HTTP_FAILED',
    'douyin analytics request rejected': 'REQUEST_REJECTED',
    'douyin analytics request failed': 'REQUEST_FAILED',
    'douyin analytics rejected request': 'SERVER_REJECTED',
    'douyin analytics invalid JSON response': 'INVALID_JSON',
    'douyin analytics invalid acknowledgement': 'INVALID_ACK',
    'douyin analytics identity unavailable': 'IDENTITY_UNAVAILABLE',
    'analytics identity unavailable': 'IDENTITY_UNAVAILABLE',
    'analytics event acknowledgement mismatch': 'ACK_MISMATCH',
    'analytics batch acknowledgement count mismatch': 'ACK_MISMATCH',
};
const safe = (value: string, max: number) => typeof value === 'string' && value.length <= max && /^[a-zA-Z0-9_.:-]+$/.test(value) ? value : '[omitted]';

/** Runtime-only observer. Never enters the upload queue or records identities/payloads. */
export class DouyinUploadDiagnostics implements DeliveryDiagnostics {
    private state: State = 'unknown';
    private transitions = 0;
    private sequence = 0;
    private recent: Entry[] = [];
    private failures: Entry[] = [];
    private retryLinks = new Map<string, number>();
    private droppedRetryLinks = 0;
    private readonly runtimeStartedAt = Date.now();
    constructor(private readonly buildId: string) {}

    setState(state: State): void {
        if (this.state !== state) { this.state = state; this.transitions++; }
    }
    begin(endpoint: string, input: EventRef[]): (result: DeliveryDiagnosticResult) => void {
        if (!ENDPOINTS.has(endpoint)) throw Error('Unsupported diagnostic endpoint');
        const startedAt = Date.now(), stateAtStart = this.state, transitions = this.transitions;
        const attemptId = ++this.sequence;
        const events = input.slice(0, 20).map(x => ({ id: safe(x.id, 160), eventName: safe(x.eventName, 80) }));
        const keys = events.length ? events.map(x => endpoint + ':' + x.id) : [endpoint];
        // Cocos assumes array spread operands are arrays; explicitly consume this Set.
        const retryOf = Array.from(new Set(keys.map(key => this.retryLinks.get(key)).filter((id): id is number => id !== undefined)));
        let ended = false;
        return result => {
            if (ended) return;
            ended = true;
            const endedAt = Date.now();
            const rejectedIds = events.filter(x => result.rejectedIds?.includes(x.id)).map(x => x.id);
            const recoveredEventIds = result.outcome === 'acknowledged'
                ? events.filter(x => this.retryLinks.has(endpoint + ':' + x.id)).map(x => x.id) : [];
            const entry: Entry = { attemptId, endpoint, startedAt, endedAt, elapsedMs: Math.max(0, endedAt - startedAt),
                stateAtStart, stateAtEnd: this.state, lifecycleChanges: this.transitions - transitions,
                outcome: result.outcome, errorCode: result.outcome === 'failed'
                    ? ERROR_CODES[(result.error as Error)?.message] || 'OTHER_FAILURE' : '',
                events, retryOf, recoveredEventIds, rejectedIds, retryDelayMs: result.retryDelayMs || 0, retryResults: [] };
            for (const previous of this.failures) if (retryOf.includes(previous.attemptId)) {
                previous.retryResults.push({ attemptId, outcome: result.outcome, endedAt, recoveredEventIds, rejectedIds });
                if (previous.retryResults.length > 20) previous.retryResults.shift();
            }
            // An unrelated successful request must never clear a failed event's retry association.
            for (const key of keys) {
                if (result.outcome === 'failed' && !rejectedIds.some(id => key === endpoint + ':' + id)) this.retryLinks.set(key, attemptId);
                else this.retryLinks.delete(key);
            }
            while (this.retryLinks.size > 1000) { this.retryLinks.delete(this.retryLinks.keys().next().value!); this.droppedRetryLinks++; }
            this.recent.push(entry);
            if (this.recent.length > 100) this.recent.shift();
            if (result.outcome === 'failed') {
                this.failures.push(entry);
                if (this.failures.length > 20) this.failures.shift();
                console.warn('[DouyinUploadDiagnostics]', JSON.stringify(entry));
            } else if (retryOf.length) console.info('[DouyinUploadDiagnostics] retry result', JSON.stringify(entry));
        };
    }
    getSnapshot(): Record<string, unknown> {
        // Clone so console callers cannot mutate observer state. Failed entries stay visible after successes.
        return JSON.parse(JSON.stringify({ diagnosticVersion: 1, buildId: this.buildId, runtimeStartedAt: this.runtimeStartedAt,
            capturedAt: Date.now(), state: this.state, runtimeOnly: true, droppedRetryLinks: this.droppedRetryLinks,
            recent: this.recent, failures: this.failures, unresolvedRetryLinks: this.retryLinks.size }));
    }
}
