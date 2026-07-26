import { BlockInputEvents, director, game, Node, UITransform } from 'cc';
import {
    getMiniGameBuildMode,
    getMiniGameBuildPlatform,
    getWeChatMiniGameRuntime,
} from './MiniGamePlatform';

const PERF_TRACE_TAG = '[PDD_PERF_TRACE]';
let perfTraceStartedAt = 0;
let perfTraceSeq = 0;
let lastFrameGapTraceAt = 0;
let suppressedFrameGapCount = 0;
let suppressedFrameGapMaxMs = 0;

const FRAME_GAP_TRACE_THRESHOLD_MS = 50;
const FRAME_GAP_TRACE_INTERVAL_MS = 1000;

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

function countFilledBoardCells(runtime: any): number {
    const correctColors = runtime?.boardModel?.correctColors;
    if (!Array.isArray(correctColors)) return 0;
    let count = 0;
    for (const row of correctColors) {
        if (!Array.isArray(row)) continue;
        for (const colorId of row) {
            if ((Number(colorId) || 0) > 0) count++;
        }
    }
    return count;
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

export function collectActiveBlockInputEvents(): PlainRecord[] {
    const scene = director.getScene();
    if (!scene?.isValid) return [];
    const result: PlainRecord[] = [];
    const visit = (node: Node, path: string): void => {
        if (result.length >= 20 || !node?.isValid || !node.activeInHierarchy) return;
        const blocker = node.getComponent(BlockInputEvents);
        if (blocker?.enabled) {
            const ui = node.getComponent(UITransform);
            result.push({
                path,
                width: Math.max(0, Number(ui?.contentSize.width) || 0),
                height: Math.max(0, Number(ui?.contentSize.height) || 0),
            });
        }
        for (const child of node.children) {
            visit(child, `${path}/${child.name}`);
        }
    };
    visit(scene, scene.name || 'Scene');
    return result;
}

export function collectDebugPerfRuntimeSnapshot(runtime: any): PlainRecord {
    if (!runtime) return {};
    let runtimeSceneName = '';
    try {
        runtimeSceneName = String(runtime.getRuntimeSceneName?.('') || '');
    } catch (_) {
        runtimeSceneName = '';
    }
    const now = Date.now();
    const isPaused = (game as any).isPaused;
    let runtimeOwners: any[] = [];
    try {
        runtimeOwners = Array.isArray(runtime.getRuntimeOwnerDiagnostics?.())
            ? runtime.getRuntimeOwnerDiagnostics()
            : [];
    } catch (_) {
        runtimeOwners = [];
    }
    const placementWatchdogs = runtime._placementOperationWatchdogs instanceof Map
        ? Array.from(runtime._placementOperationWatchdogs.values()).map((watchdog: any) => ({
            token: String(watchdog?.token || ''),
            owner: String(watchdog?.owner || ''),
            generation: Math.max(0, Number(watchdog?.generation) || 0),
            ageMs: Math.max(0, now - (Number(watchdog?.startedAt) || now)),
            deadlineRemainingMs: (Number(watchdog?.deadlineAt) || 0) - now,
        }))
        : [];
    const skillWatchdogMeta = runtime._skillUsageWatchdogMeta;
    const rewardTransaction = runtime._rewardedGrantTransaction;
    return {
        runtimeSceneName,
        enginePaused: typeof isPaused === 'function' ? !!isPaused.call(game) : false,
        activeBlockInputEvents: collectActiveBlockInputEvents(),
        adShowing: !!runtime._adShowing,
        skillActive: !!runtime._skillActive,
        levelId: Math.max(0, Number(runtime._activeLogicalLevelId || runtime.levelData?.levelId) || 0),
        boardWidth: Math.max(0, Number(runtime.boardModel?.width || runtime.levelData?.boardWidth) || 0),
        boardHeight: Math.max(0, Number(runtime.boardModel?.height || runtime.levelData?.boardHeight) || 0),
        boardFilledCellCount: countFilledBoardCells(runtime),
        activeBoardTouchCount: getMapLikeSize(runtime.activeBoardTouches),
        placementVisualRefs: Math.max(0, Number(runtime._placementVisualRefs) || 0),
        placementInputRefs: Math.max(0, Number(runtime._placementInputLockRefs) || 0),
        placementInputLocked: !!runtime._placementInputLocked,
        placementWatchdogs,
        activeFlyBeanCount: getMapLikeSize(runtime._activeFlyBeanNodes),
        timerPauseRefs: Math.max(0, Number(runtime._timerPauseRefs) || 0),
        timerLockedForProp: !!runtime._timerLockedForProp,
        guideInputSuspended: !!runtime._guideInputSuspended,
        skillAnimOnly: !!runtime._skillAnimOnly,
        activeSkillUsageGeneration: Math.max(0, Number(runtime._activeSkillUsageGeneration) || 0),
        skillWatchdog: skillWatchdogMeta ? {
            owner: String(skillWatchdogMeta.owner || ''),
            generation: Math.max(0, Number(skillWatchdogMeta.generation) || 0),
            ageMs: Math.max(0, now - (Number(skillWatchdogMeta.startedAt) || now)),
            deadlineRemainingMs: (Number(skillWatchdogMeta.deadlineAt) || 0) - now,
        } : null,
        lastSkillWatchdogRecovery: makeJsonSafe(runtime._lastSkillWatchdogRecovery, 1),
        rewardedGrantTransaction: rewardTransaction ? {
            id: Math.max(0, Number(rewardTransaction.id) || 0),
            claimKey: String(rewardTransaction.claimKey || ''),
            page: String(rewardTransaction.page || ''),
            phase: String(rewardTransaction.phase || ''),
            grantStage: String(rewardTransaction.grantStage || ''),
            ageMs: Math.max(0, now - (Number(rewardTransaction.startedAt) || now)),
            deadlineRemainingMs: (Number(rewardTransaction.deadlineAt) || 0) > 0
                ? Number(rewardTransaction.deadlineAt) - now
                : 0,
        } : null,
        rewardedGrantTimedOutClaims: makeJsonSafe(runtime._rewardedGrantTimedOutClaims, 1),
        runtimeOwnerCount: runtimeOwners.length,
        runtimeOwners: makeJsonSafe(runtimeOwners, 2),
        activePinddSpineFxCount: Math.max(0, Number(runtime._pinddSpineFxActiveCount) || 0),
        reservedPinddSpineFxCount: Math.max(0, Number(runtime._pinddSpineFxReservedCount) || 0),
        pinddSpineFxPoolSize: getPoolSize(runtime, runtime._pinddSpineFxPool),
        postPlayableWarmupRunning: !!runtime._postPlayableWarmupRunning,
        postPlayableWarmupTask: String(runtime._postPlayableWarmupRunningTaskName || ''),
        postPlayableWarmupQueueSize: Array.isArray(runtime._postPlayableWarmupQueue)
            ? runtime._postPlayableWarmupQueue.length
            : 0,
        modalFocusRefs: Math.max(0, Number(runtime._modalFocusRefs) || 0),
        noLivesModalActive: !!runtime._noLivesModal?.isValid,
        recoverVigorBusy: !!runtime._recoverVigorBusy,
        recoverVigorTransaction: makeJsonSafe(runtime._recoverVigorTransaction, 1),
        recoverVigorValue: Math.max(0, Number(runtime.getVigor?.()) || 0),
        recoverVigorHudText: String(runtime._vigorCountLbl?.string || ''),
        recoverVigorPopupText: String(runtime._recoverVigorStatusLbl?.string || ''),
        loadingOverlayActive: !!runtime._loadingOverlay?.isValid && runtime._loadingOverlay.active !== false,
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

export function debugPerfFrameStep(runtime: any, dtSeconds: number): void {
    if (!isDebugPerfTraceEnabled()) return;
    const dtMs = Math.max(0, Number(dtSeconds) || 0) * 1000;
    if (dtMs < FRAME_GAP_TRACE_THRESHOLD_MS) return;
    const now = Date.now();
    if (lastFrameGapTraceAt > 0 && now - lastFrameGapTraceAt < FRAME_GAP_TRACE_INTERVAL_MS) {
        suppressedFrameGapCount++;
        suppressedFrameGapMaxMs = Math.max(suppressedFrameGapMaxMs, dtMs);
        return;
    }
    const suppressedCount = suppressedFrameGapCount;
    const maxSuppressedMs = suppressedFrameGapMaxMs;
    suppressedFrameGapCount = 0;
    suppressedFrameGapMaxMs = 0;
    lastFrameGapTraceAt = now;
    debugPerfSnapshot('frame.gap', runtime, {
        dtMs: Math.round(dtMs * 10) / 10,
        severity: dtMs >= 100 ? 'severe' : 'jank',
        suppressedCount,
        maxSuppressedMs: Math.round(maxSuppressedMs * 10) / 10,
    });
}
