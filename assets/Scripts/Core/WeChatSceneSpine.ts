import { sp } from 'cc';
import { getWeChatMiniGameRuntime, isWeChatMiniGameRuntime } from './MiniGamePlatform';
import { AnalyticsMgr } from './AnalyticsMgr';

const SPINE_READY_TIMEOUT_MS = 12000;
let readyPromise: Promise<void> | null = null;

// Game.scene contains an authored Skeleton. Its constructor runs during
// deserialization, before any GameCtrl prewarm/onLoad callback can run.
export function ensureWeChatSceneSpineReady(): Promise<void> {
    if (!isWeChatMiniGameRuntime()) return Promise.resolve();
    if (typeof (sp as any)?.spine?.SkeletonInstance === 'function') return Promise.resolve();
    if (readyPromise) return readyPromise;
    const scope = globalThis as any;
    let stage = 'subpackage';
    let finished = false;
    let timer: ReturnType<typeof setTimeout>;
    let subpackagePromise: Promise<void>;
    const pending = new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Spine ${stage} readiness timed out`)), SPINE_READY_TIMEOUT_MS);
        subpackagePromise = scope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__;
        if (!subpackagePromise) {
            subpackagePromise = new Promise<void>((loaded, failed) => {
                const wx = getWeChatMiniGameRuntime();
                if (typeof wx?.loadSubpackage !== 'function') {
                    failed(new Error('Spine subpackage loader unavailable'));
                    return;
                }
                wx.loadSubpackage({ name: 'spineWasm', success: () => loaded(),
                    fail: (error: any) => failed(new Error(`Spine subpackage load failed: ${String(error?.errMsg || error?.message || error)}`)) });
            });
            scope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__ = subpackagePromise;
        }
        subpackagePromise.then(async () => {
            if (finished) return;
            stage = 'wasm';
            const load = (sp as any)?.loadWasmModuleSpine;
            if (typeof load !== 'function') throw new Error('Spine wasm loader unavailable');
            await load.call(sp);
            if (finished) return;
            if (typeof (sp as any)?.spine?.SkeletonInstance !== 'function') {
                throw new Error('Spine SkeletonInstance unavailable after initialization');
            }
            resolve();
        }).catch(reject);
    });
    const request = pending.catch((error) => {
        // Do not cache a failed download forever. Late callbacks cannot start a scene.
        if (stage === 'subpackage' && scope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__ === subpackagePromise) {
            delete scope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__;
        }
        console.error('[WeChatSceneSpine] initialization failed:', error);
        try {
            AnalyticsMgr.inst.trackFunnelEvent({ eventName: 'scene_spine_init_failed', success: false,
                source: 'game_scene_entry', errorCode: `spine_${stage}_failed`, errorMessage: String(error),
                extra: { targetScene: 'Game', stage } });
        } catch (reportError) { console.warn('[WeChatSceneSpine] telemetry failed:', reportError); }
        throw error;
    }).finally(() => {
        finished = true;
        clearTimeout(timer);
        if (readyPromise === request) readyPromise = null;
    });
    readyPromise = request;
    return request;
}
