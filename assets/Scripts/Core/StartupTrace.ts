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
const RUNTIME_ENTRY_AT_KEY = '__PDD_RUNTIME_ENTRY_AT__';
const MAX_STARTUP_TRACE_EVENTS = 40;
let weChatStartupPlayableReported = false;
let playableAttempts = 0;
let playableRetryAt = 0;
let playableTerminal = false;
let diagnosticRequestId = 0;

// Local diagnostic switch only: no analytics upload and no engine object retention.
export function recordStartupDiagnostic(event: string, extra: Record<string, string | number | boolean | null> = {}): void {
    const host = getTraceHost();
    if (host.__PDD_STARTUP_DIAGNOSTIC__ !== true) return;
    const events = host.__PDD_STARTUP_DIAGNOSTIC_EVENTS__ ||= [];
    if (events.length >= 240) return;
    const timestamp = Date.now();
    events.push({ event, timestamp, elapsedMs: timestamp - getTraceState().startedAt, ...extra });
}

export function beginStartupRequestDiagnostic(resource: string): number {
    const id = ++diagnosticRequestId;
    recordStartupDiagnostic('cdn_request_start', { id, resource: resource.split('?')[0], cacheHit: null, transferBytes: null });
    return id;
}

export type StartupPlayableReportResult = 'reported' | 'already-reported' | 'retry' | 'unavailable' | 'failed';

export function reportWeChatStartupPlayable(wxRuntime: { reportScene?: (options: { sceneId: number }) => void } | null): StartupPlayableReportResult {
    if (weChatStartupPlayableReported) return 'already-reported';
    if (playableTerminal) return 'failed';
    if (!wxRuntime || typeof wxRuntime.reportScene !== 'function') {
        playableTerminal = true;
        recordStartupDiagnostic('playable_report_unavailable');
        console.warn('[StartupTrace] wx.reportScene unavailable; startup playable was not reported');
        return 'unavailable';
    }
    if (Date.now() < playableRetryAt) return 'retry';
    playableAttempts++;
    recordStartupDiagnostic('playable_report_attempt', { attempt: playableAttempts, sceneId: 7 });
    try {
        wxRuntime.reportScene({ sceneId: 7 });
        weChatStartupPlayableReported = true;
        recordStartupDiagnostic('playable_report_returned', { attempt: playableAttempts });
        return 'reported';
    } catch (error) {
        console.error('[StartupTrace] startup playable report failed:', error);
        playableTerminal = playableAttempts >= 3;
        playableRetryAt = Date.now() + (playableAttempts === 1 ? 500 : 1000);
        recordStartupDiagnostic('playable_report_error', { attempt: playableAttempts, terminal: playableTerminal, message: String(error).slice(0, 200) });
        return playableTerminal ? 'failed' : 'retry';
    }
}

function getTraceHost(): any {
    if (typeof globalThis !== 'undefined') return globalThis as any;
    if (typeof window !== 'undefined') return window as any;
    return {};
}

function readRuntimeEntryAt(host: any): number {
    const timestamp = Number(host?.[RUNTIME_ENTRY_AT_KEY] || 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > Date.now()) return 0;
    return timestamp;
}

function getTraceState(): StartupTraceState {
    const host = getTraceHost();
    const existing = host[STARTUP_TRACE_KEY] as StartupTraceState | undefined;
    if (existing && Array.isArray(existing.events) && existing.startedAt > 0) {
        return existing;
    }
    const state: StartupTraceState = {
        startedAt: readRuntimeEntryAt(host) || Date.now(),
        events: [],
        flushed: false,
    };
    host[STARTUP_TRACE_KEY] = state;
    return state;
}

export function markStartupTrace(eventName: string, extra: StartupTraceExtra = {}): void {
    const name = String(eventName || '').trim();
    if (!name) return;
    recordStartupDiagnostic(name);
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
    const elapsed: Record<string, number> = {};
    for (const event of events) elapsed[event.eventName] = event.elapsedMs;
    track({ eventName: 'startup_summary', page: 'startup', source: 'startup_trace',
        success: events.some(e => e.eventName === 'startup_first_playable_ready'),
        duration: events[events.length - 1]?.elapsedMs || 0, ...context,
        extra: { startupStartedAt: state.startedAt, stages: JSON.stringify(elapsed), stageCount: events.length } });
    for (const event of events) {
        if (!['app_launch', 'startup_runtime_entry', 'startup_first_playable_ready'].includes(event.eventName)
            && !/failed|error/.test(event.eventName)
            && !(getTraceHost().__PDD_ANALYTICS_DIAGNOSTIC__ === true)) continue;
        track({
            eventName: event.eventName,
            page: 'startup',
            source: 'startup_trace',
            success: !/failed|error/.test(event.eventName),
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
