import type { LevelData } from './LevelConfig';
import { AnalyticsMgr } from './AnalyticsMgr';

let requestSequence = 0;
const requests = new WeakMap<object, { key: string; promise: Promise<LevelData> }>();

export class LevelPreparationError extends Error {}

export function reportWeChatEntry(runtime: any, eventName: string, success: boolean, error?: unknown, errorCode = ''): void {
    try {
        AnalyticsMgr.inst.trackFunnelEvent({ eventName, success, source: 'level_preparation',
            levelId: runtime._weChatPreparingLevel || 0, errorCode: errorCode || (success ? '' : eventName),
            errorMessage: error ? String(error) : '',
            extra: { requestId: runtime._weChatPreparationId || '', recovered: !!runtime._weChatPreparationHadFailure } });
    } catch (reportError) { console.warn('[LevelPreparation] telemetry failed:', reportError); }
}

/** Shared by WeChat and Douyin: prepare the original level before discarding the previous playable/settlement UI.
 * The underlying loaders retain their validated same-source/version caches.
 * A late callback may warm a cache, but cannot start a level or complete a new request.
 */
export function prepareWeChatMainlineLevel(runtime: any, levelId: number): Promise<LevelData> {
    const key = `level_${levelId}`;
    const active = requests.get(runtime);
    if (active) return active.key === key ? active.promise
        : Promise.reject(new LevelPreparationError('another level is being prepared'));
    runtime._weChatPreparingLevel = levelId;
    runtime._weChatPreparationId = `${Date.now()}-${++requestSequence}`;
    runtime._weChatPreparationHadFailure = false;
    const requestId = runtime._weChatPreparationId;
    const deadline = Date.now() + 30000;
    let aborted = false;
    const current = () => !aborted && runtime.isValid && !runtime._weChatEntryRecoveryPending
        && runtime._weChatPreparationId === requestId;
    const stage = async <T>(name: string, start: (done: (error: Error | null, value?: T) => void) => void): Promise<T> => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt++) {
            if (!current()) throw new LevelPreparationError('level preparation cancelled');
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            try {
                return await new Promise<T>((resolve, reject) => {
                    let finished = false;
                    const timer = setTimeout(() => done(new Error(`${name} timed out`)), Math.min(12000, remaining));
                    const done = (error: Error | null, value?: T) => {
                        if (finished) return;
                        finished = true;
                        clearTimeout(timer);
                        if (!current()) reject(new LevelPreparationError('level preparation cancelled'));
                        else if (error) reject(error);
                        else resolve(value as T);
                    };
                    try { start(done); } catch (error) { done(error instanceof Error ? error : new Error(String(error))); }
                });
            } catch (error) {
                if (!current()) throw error;
                lastError = error;
                runtime._weChatPreparationHadFailure = true;
                reportWeChatEntry(runtime, 'level_preparation_failed', false, `${name}, attempt ${attempt + 1}: ${String(error)}`, `${name}_failed`);
                if (attempt === 0 && Date.now() < deadline) reportWeChatEntry(runtime, 'level_recovery_started', false, error);
            }
        }
        throw new LevelPreparationError(`${name}: ${String(lastError || 'preparation deadline exceeded')}`);
    };
    const promise = (async () => {
        const data = await stage<LevelData>('level_data', done => {
            const accept = (value: LevelData | null, _source?: string, error?: Error | null) => {
                if (!value || value.levelId !== levelId) done(error || new Error(`original ${key} unavailable`));
                else done(null, value);
            };
            if (runtime.shouldUseLocalBootstrapBundle(levelId, 'level_')) runtime._loadLocalLevelDataImpl(levelId, accept, 'level_', true);
            else runtime._loadLevelDataFromConfiguredSource(levelId, 'level_', accept);
        });
        // Independent required resources load concurrently within one total budget.
        await Promise.all([
            stage<void>('bean_frames', done => runtime._prepareBeanFramesForLevelData(data, () =>
                done(runtime.needsBeanFramesForLevelData(data) ? new Error('required bean frames unavailable') : null))),
            stage<void>('critical_ui', done => runtime.prepareWeChatMainlineUi(data, (missing: string[]) => {
                done(missing.length ? new Error(`required UI textures unavailable: ${missing.join(', ')}`) : null);
            })),
            stage<void>('board_textures', done => runtime.prepareRequiredBoardEffectTextures((result: any) =>
                done(result.ok ? null : new Error(result.errorMessage || result.errorCode || 'required board textures unavailable')))),
        ]);
        if (!current()) throw new LevelPreparationError('level preparation cancelled');
        reportWeChatEntry(runtime, 'level_resources_prepared', true);
        return data;
    })().catch(error => {
        aborted = true;
        reportWeChatEntry(runtime, 'level_recovery_exhausted', false, error);
        throw error;
    }).finally(() => {
        if (requests.get(runtime)?.promise === promise) requests.delete(runtime);
    });
    requests.set(runtime, { key, promise });
    return promise;
}
