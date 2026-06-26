type StartupTraceExtra = Record<string, unknown>;

type StartupTraceEvent = {
    eventName: string;
    timestamp: number;
    elapsedMs: number;
    extra: StartupTraceExtra;
};

type StartupTraceState = {
    startedAt: number;
    events: StartupTraceEvent[];
    flushed: boolean;
};

type StartupTraceFunnelEvent = {
    eventName: string;
    page: string;
    source: string;
    success: boolean;
    duration: number;
    levelId?: string | number;
    logicalLevelId?: string | number;
    physicalLevelId?: string | number;
    extra: StartupTraceExtra;
};

const STARTUP_TRACE_KEY = '__PDD_STARTUP_TRACE__';
const MAX_STARTUP_TRACE_EVENTS = 40;

function getTraceHost(): any {
    if (typeof globalThis !== 'undefined') return globalThis as any;
    if (typeof window !== 'undefined') return window as any;
    return {};
}

function getTraceState(): StartupTraceState {
    const host = getTraceHost();
    const existing = host[STARTUP_TRACE_KEY] as StartupTraceState | undefined;
    if (existing && Array.isArray(existing.events) && existing.startedAt > 0) {
        return existing;
    }
    const state: StartupTraceState = {
        startedAt: Date.now(),
        events: [],
        flushed: false,
    };
    host[STARTUP_TRACE_KEY] = state;
    return state;
}

export function markStartupTrace(eventName: string, extra: StartupTraceExtra = {}): void {
    const name = String(eventName || '').trim();
    if (!name) return;
    const state = getTraceState();
    if (state.flushed) return;
    const now = Date.now();
    state.events.push({
        eventName: name,
        timestamp: now,
        elapsedMs: Math.max(0, now - state.startedAt),
        extra: { ...extra },
    });
    if (state.events.length > MAX_STARTUP_TRACE_EVENTS) {
        state.events.splice(0, state.events.length - MAX_STARTUP_TRACE_EVENTS);
    }
}

export function flushStartupTrace(
    track: (event: StartupTraceFunnelEvent) => void,
    context: Partial<Pick<StartupTraceFunnelEvent, 'levelId' | 'logicalLevelId' | 'physicalLevelId'>> = {},
): void {
    const state = getTraceState();
    if (state.flushed) return;
    state.flushed = true;
    const events = state.events.slice();
    for (const event of events) {
        track({
            eventName: event.eventName,
            page: 'startup',
            source: 'startup_trace',
            success: true,
            duration: event.elapsedMs,
            ...context,
            extra: {
                ...event.extra,
                startupStartedAt: state.startedAt,
                startupEventAt: event.timestamp,
                startupElapsedMs: event.elapsedMs,
            },
        });
    }
}
