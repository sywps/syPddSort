import { director } from 'cc';
import {
    getMiniGameBuildMode,
    getMiniGameBuildPlatform,
    getWeChatMiniGameRuntime,
} from './MiniGamePlatform';

const PERF_TRACE_TAG = '[PDD_PERF_TRACE]';
let perfTraceStartedAt = 0;
let perfTraceSeq = 0;

type PlainRecord = Record<string, unknown>;

export function isDebugPerfTraceEnabled(): boolean {
    return getMiniGameBuildPlatform() === 'wechat' && getMiniGameBuildMode() === 'debug';
}

function getMapLikeSize(value: any): number {
    if (!value) return 0;
    const size = value.size;
    if (typeof size === 'number') return Math.max(0, size);
    if (typeof size === 'function') {
        try {
            return Math.max(0, Number(size.call(value)) || 0);
        } catch (_) {
            return 0;
        }
    }
    return 0;
}

function getPoolSize(runtime: any, pool: any): number {
    if (!runtime || !pool) return 0;
    try {
        return Math.max(0, Number(runtime.getNodePoolSize?.(pool)) || 0);
    } catch (_) {
        return 0;
    }
}

function readEarlyTraceStartedAt(): number {
    try {
        const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
        const windowScope: any = typeof window !== 'undefined' ? window : null;
        const value = Number(
            globalScope?.__PDD_PERF_TRACE_STARTED_AT__
            || windowScope?.__PDD_PERF_TRACE_STARTED_AT__
            || 0,
        );
        return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (_) {
        return 0;
    }
}

function makeJsonSafe(value: unknown, depth: number = 2): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Error) return { message: value.message, name: value.name };
    if (depth <= 0) return String(value);
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => makeJsonSafe(item, depth - 1));
    if (value instanceof Set) return { size: value.size, values: Array.from(value).slice(0, 20).map((item) => makeJsonSafe(item, depth - 1)) };
    if (value instanceof Map) return { size: value.size };
    if (typeof value === 'object') {
        const input = value as Record<string, unknown>;
        const output: PlainRecord = {};
        for (const key of Object.keys(input).slice(0, 40)) {
            output[key] = makeJsonSafe(input[key], depth - 1);
        }
        return output;
    }
    return String(value);
}

function readMemorySnapshot(): PlainRecord | null {
    try {
        const wx = getWeChatMiniGameRuntime();
        const performance = wx?.getPerformance?.();
        const memory = performance?.memory || null;
        if (!memory || typeof memory !== 'object') return null;
        const snapshot: PlainRecord = {};
        for (const key of ['usedJSHeapSize', 'totalJSHeapSize', 'jsHeapSizeLimit']) {
            const value = Number(memory[key]);
            if (Number.isFinite(value)) snapshot[key] = value;
        }
        return Object.keys(snapshot).length > 0 ? snapshot : null;
    } catch (_) {
        return null;
    }
}

export function collectDebugPerfRuntimeSnapshot(runtime: any): PlainRecord {
    if (!runtime) return {};
    let runtimeSceneName = '';
    try {
        runtimeSceneName = String(runtime.getRuntimeSceneName?.('') || '');
    } catch (_) {
        runtimeSceneName = '';
    }
    return {
        runtimeSceneName,
        sfCacheSize: getMapLikeSize(runtime.sfCache),
        spriteFrameMetaSize: getMapLikeSize(runtime._spriteFrameCacheMeta),
        pendingSpriteFrameLoads: getMapLikeSize(runtime._pendingSpriteFrameLoads),
        spriteFrameLoadQueueSize: Array.isArray(runtime._spriteFrameLoadQueue) ? runtime._spriteFrameLoadQueue.length : 0,
        spriteFrameLoadInFlight: Math.max(0, Number(runtime._spriteFrameLoadInFlight) || 0),
        panelOpenInFlight: getMapLikeSize(runtime._panelOpenInFlight),
        gameAssetsBundleReady: !!runtime.gameAssetsBundle,
        bootstrapBundleReady: !!runtime.bootstrapBundle,
        preloadingGameAssetsBundle: !!runtime._preloadingBundle,
        activeBrightFlashCount: Math.max(0, Number(runtime._activeBrightFlashCount) || 0),
        flyBeanPoolSize: getPoolSize(runtime, runtime._flyBeanPool),
        brightFlashPoolSize: getPoolSize(runtime, runtime._brightFlashPool),
        boardCellPoolSize: getPoolSize(runtime, runtime._boardCellPool),
        boardSlotBgPoolSize: getPoolSize(runtime, runtime._boardSlotBgPool),
    };
}

export function debugPerfTrace(eventName: string, data: PlainRecord = {}): void {
    if (!isDebugPerfTraceEnabled()) return;
    const now = Date.now();
    if (!perfTraceStartedAt) perfTraceStartedAt = readEarlyTraceStartedAt() || now;
    const memory = readMemorySnapshot();
    const safeData = makeJsonSafe(data) as PlainRecord;
    const payload: PlainRecord = {
        seq: ++perfTraceSeq,
        t: now - perfTraceStartedAt,
        at: now,
        event: eventName,
        scene: director.getScene()?.name || '',
        mode: getMiniGameBuildMode(),
        ...safeData,
    };
    if (memory) payload.memory = memory;
    try {
        console.warn(PERF_TRACE_TAG, JSON.stringify(payload));
    } catch (_) {
        console.warn(PERF_TRACE_TAG, payload);
    }
}

export function debugPerfSnapshot(eventName: string, runtime: any, data: PlainRecord = {}): void {
    if (!isDebugPerfTraceEnabled()) return;
    debugPerfTrace(eventName, {
        ...collectDebugPerfRuntimeSnapshot(runtime),
        ...data,
    });
}
