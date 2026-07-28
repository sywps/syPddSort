import {
    getDouyinMiniGameRuntime,
    getMiniGameBuildPlatform,
    getMiniGameBuildMode,
    getWeChatMiniGameRuntime,
    type MiniGameBuildPlatform,
} from '../Core/MiniGamePlatform';

const REWARDED_AD_UNUSED_READY_TTL_MS = 45000;

export type RewardedAdHooks = {
    onShow?: (attemptId: number) => void;
    onClose?: (result: unknown, attemptId: number) => void;
    onRecoverable?: (attemptId: number, reason: 'foreground') => void;
    minFallbackWatchMs?: number;
};

export type RewardedAdOutcomeStatus =
    | 'verified_complete'
    | 'verified_incomplete'
    | 'technical_error'
    | 'unknown';

export type RewardedAdOutcome = {
    attemptId: number;
    status: RewardedAdOutcomeStatus;
    reason?: string;
    closeResult?: unknown;
    error?: unknown;
};

type RewardedAdCallback = (outcome: RewardedAdOutcome) => void;
export type RewardedAdStatus = 'idle' | 'loading' | 'ready' | 'establishing' | 'visible' | 'recoverable';
export type RewardedAdStateSnapshot = {
    status: RewardedAdStatus;
    previousStatus: RewardedAdStatus;
    reason: string;
    requestId: number;
    generation: number;
    changedAt: number;
    durationMs: number;
};
type RewardedAdStateListener = (snapshot: RewardedAdStateSnapshot) => void;

export type RewardedAdLoadStage = 'start' | 'success' | 'fail';
export type RewardedAdLoadEvent = {
    stage: RewardedAdLoadStage;
    platform: MiniGameBuildPlatform;
    loadId: number;
    requestId: number;
    generation: number;
    reason: string;
    durationMs: number;
    errorCode: string;
};
type RewardedAdLoadListener = (event: RewardedAdLoadEvent) => void;

const rewardedAdLoadListeners = new Set<RewardedAdLoadListener>();

export function subscribeRewardedAdLoadEvents(listener: RewardedAdLoadListener): () => void {
    rewardedAdLoadListeners.add(listener);
    return () => rewardedAdLoadListeners.delete(listener);
}

function emitRewardedAdLoadEvent(event: RewardedAdLoadEvent): void {
    for (const listener of [...rewardedAdLoadListeners]) {
        try {
            listener(event);
        } catch (error) {
            console.warn('[AdConfig] rewarded ad load listener failed:', error);
        }
    }
}

function resolveRewardedAdErrorCode(error: unknown): string {
    if (error && typeof error === 'object') {
        const candidate = (error as any).errCode ?? (error as any).errno ?? (error as any).code;
        if (candidate !== undefined && candidate !== null && candidate !== '') {
            return String(candidate).slice(0, 80);
        }
    }
    return '';
}

export type RewardedAdUnitIds = {
    douyin: string;
    wechat: string;
};

export interface RewardedAdProvider {
    readonly platform: MiniGameBuildPlatform;
    preload(reason?: string): void;
    show(callback: RewardedAdCallback, hooks?: RewardedAdHooks): void;
    hasNativeAdWindow(): boolean;
    notifyGameResumed(): void;
    cancelPending(reason?: string): boolean;
    endRecoverableWait(reason?: string): boolean;
    getState(): RewardedAdStateSnapshot;
    subscribe(listener: RewardedAdStateListener): () => void;
}

abstract class NativeRewardedAdProvider implements RewardedAdProvider {
    public abstract readonly platform: MiniGameBuildPlatform;

    private ad: any = null;
    private status: RewardedAdStatus = 'idle';
    private loadPromise: Promise<boolean> | null = null;
    private currentCallback: RewardedAdCallback | null = null;
    private currentHooks: RewardedAdHooks | null = null;
    private requestSeq = 0;
    private currentRequestId = 0;
    private currentAdGeneration = 0;
    private adGenerationSeq = 0;
    private currentRecoverableNotified = false;
    private adCloseListener: ((result: unknown) => void) | null = null;
    private adErrorListener: ((error: unknown) => void) | null = null;
    private loadWaitTimer: any = null;
    private showEstablishTimer: any = null;
    private readyExpiryTimer: any = null;
    private stateChangedAt = Date.now();
    private stateReason = 'init';
    private loadSeq = 0;
    private activeLoadId = 0;
    private activeLoadRequestId = 0;
    private activeLoadStartedAt = 0;
    private readonly stateListeners = new Set<RewardedAdStateListener>();

    constructor(private readonly adUnitId: string) {}

    getState(): RewardedAdStateSnapshot {
        return {
            status: this.status,
            previousStatus: this.status,
            reason: this.stateReason,
            requestId: this.currentRequestId,
            generation: this.currentAdGeneration,
            changedAt: this.stateChangedAt,
            durationMs: Math.max(0, Date.now() - this.stateChangedAt),
        };
    }

    subscribe(listener: RewardedAdStateListener): () => void {
        this.stateListeners.add(listener);
        try {
            listener(this.getState());
        } catch (error) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad state listener failed:`, error);
        }
        return () => {
            this.stateListeners.delete(listener);
        };
    }

    preload(reason: string = 'manual'): void {
        if (!this.hasNativeAdWindow()) {
            this.emitSyntheticLoadFailure(reason, 'api-unavailable', 0);
            return;
        }
        void this.startLoad(reason);
    }

    show(callback: RewardedAdCallback, hooks: RewardedAdHooks = {}): void {
        const requestId = ++this.requestSeq;
        if (!this.hasNativeAdWindow()) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad API unavailable`);
            this.emitSyntheticLoadFailure('show', 'api-unavailable', requestId);
            callback({
                attemptId: requestId,
                status: 'technical_error',
                reason: 'api-unavailable',
            });
            return;
        }
        if (this.currentCallback) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad already showing`);
            callback({
                attemptId: requestId,
                status: 'technical_error',
                reason: 'attempt-already-active',
            });
            return;
        }
        this.currentRequestId = requestId;
        this.currentCallback = callback;
        this.currentHooks = hooks;
        this.currentRecoverableNotified = false;
        if (this.status === 'ready') {
            this.clearReadyExpiryTimer();
        }
        const loadPromise = this.status === 'ready'
            ? Promise.resolve(true)
            : this.startLoad('show');
        const waitMs = this.getClickLoadWaitMs(hooks);
        this.loadWaitTimer = setTimeout(() => {
            if (!this.isCurrentRequest(requestId)) return;
            this.loadWaitTimer = null;
            const devtoolsSuccess = this.shouldSimulateDevtoolsCompletion();
            console.warn(`[AdConfig] ${this.platform} rewarded ad preload/show wait timeout, success=${devtoolsSuccess}`);
            if (devtoolsSuccess) {
                this.currentHooks?.onShow?.(requestId);
            }
            this.resolveCurrent({
                status: devtoolsSuccess ? 'verified_complete' : 'technical_error',
                reason: 'load-wait-timeout',
            });
        }, waitMs);

        loadPromise.then((ready) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.clearLoadWaitTimer();
            if (!ready) {
                this.resolveCurrent({ status: 'technical_error', reason: 'load-failed' });
                return;
            }
            this.showLoadedAd(requestId);
        }).catch((err) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.clearLoadWaitTimer();
            console.warn(`[AdConfig] ${this.platform} rewarded ad load failed:`, err);
            this.resolveCurrent({ status: 'technical_error', reason: 'load-threw', error: err });
        });
    }

    hasNativeAdWindow(): boolean {
        const api = this.getRuntimeApi();
        return !!(api && typeof api.createRewardedVideoAd === 'function' && this.adUnitId);
    }

    notifyGameResumed(): void {
        if (!this.currentCallback
            || (this.status !== 'establishing' && this.status !== 'visible')
            || this.currentRecoverableNotified) return;
        this.currentRecoverableNotified = true;
        this.setStatus('recoverable', 'foreground-before-close');
        try {
            this.currentHooks?.onRecoverable?.(this.currentRequestId, 'foreground');
        } catch (error) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad recoverable hook failed:`, error);
        }
    }

    cancelPending(reason: string = 'manual'): boolean {
        if (!this.currentCallback) return false;
        if (this.status === 'visible' || this.status === 'recoverable') return false;
        console.error(`[AdConfig] ${this.platform} rewarded ad recovered from pending state: ${reason}`);
        this.resolveCurrent({ status: 'unknown', reason: `cancelled:${reason}` });
        return true;
    }

    endRecoverableWait(reason: string = 'manual'): boolean {
        if (!this.currentCallback || this.status !== 'recoverable') return false;
        console.error(`[AdConfig] ${this.platform} rewarded ad recoverable wait ended: ${reason}`);
        this.resolveCurrent({ status: 'unknown', reason: `recoverable-ended:${reason}` });
        return true;
    }

    protected abstract getRuntimeApi(): any;
    protected abstract getSystemInfo(api: any): any;

    private setStatus(status: RewardedAdStatus, reason: string, loadErrorCode: string = ''): void {
        if (status !== 'ready') {
            this.clearReadyExpiryTimer();
        }
        const previousStatus = this.status;
        const now = Date.now();
        const durationMs = Math.max(0, now - this.stateChangedAt);
        this.status = status;
        this.stateChangedAt = now;
        this.stateReason = String(reason || '');
        if (status === 'loading' && previousStatus !== 'loading') {
            this.activeLoadId = ++this.loadSeq;
            this.activeLoadRequestId = this.currentCallback ? this.currentRequestId : 0;
            this.activeLoadStartedAt = now;
            emitRewardedAdLoadEvent({
                stage: 'start',
                platform: this.platform,
                loadId: this.activeLoadId,
                requestId: this.activeLoadRequestId,
                generation: this.currentAdGeneration,
                reason: this.stateReason,
                durationMs: 0,
                errorCode: '',
            });
        } else if (previousStatus === 'loading' && status !== 'loading') {
            this.finishLoadTelemetry(
                status === 'ready' ? 'success' : 'fail',
                this.stateReason,
                Math.max(0, now - this.activeLoadStartedAt),
                loadErrorCode,
            );
        }
        const snapshot: RewardedAdStateSnapshot = {
            status,
            previousStatus,
            reason: this.stateReason,
            requestId: this.currentRequestId,
            generation: this.currentAdGeneration,
            changedAt: now,
            durationMs,
        };
        for (const listener of [...this.stateListeners]) {
            try {
                listener(snapshot);
            } catch (error) {
                console.warn(`[AdConfig] ${this.platform} rewarded ad state listener failed:`, error);
            }
        }
    }

    private ensureAd(): any {
        if (this.ad) return this.ad;
        const api = this.getRuntimeApi();
        if (!api || typeof api.createRewardedVideoAd !== 'function' || !this.adUnitId) return null;
        const ad = api.createRewardedVideoAd({
            adUnitId: this.adUnitId,
            ...(this.platform === 'wechat' ? { multiton: true } : {}),
        });
        const generation = ++this.adGenerationSeq;
        this.ad = ad;
        this.currentAdGeneration = generation;
        this.adCloseListener = (result: unknown) => {
            if (!this.currentCallback
                || (this.status !== 'establishing' && this.status !== 'visible' && this.status !== 'recoverable')
                || this.ad !== ad
                || this.currentAdGeneration !== generation) {
                console.warn(`[AdConfig] ${this.platform} stale rewarded ad close ignored`);
                return;
            }
            this.invokeCurrentCloseHook(result);
            this.resolveCurrent(this.resolveCloseOutcome(result));
        };
        this.adErrorListener = (error: unknown) => {
            if (this.ad !== ad || this.currentAdGeneration !== generation) {
                console.warn(`[AdConfig] ${this.platform} stale rewarded ad error ignored`);
                return;
            }
            console.warn(`[AdConfig] ${this.platform} rewarded ad error:`, error);
            if (this.currentCallback) {
                this.resolveCurrent({ status: 'technical_error', reason: 'native-error', error });
                return;
            }
            this.setStatus('idle', 'native-error-idle', resolveRewardedAdErrorCode(error));
            this.loadPromise = null;
            this.cleanupAd(ad);
        };
        ad.onClose?.(this.adCloseListener);
        ad.onError?.(this.adErrorListener);
        return ad;
    }

    private startLoad(reason: string): Promise<boolean> {
        if (this.status === 'ready') return Promise.resolve(true);
        if (this.status === 'establishing' || this.status === 'visible' || this.status === 'recoverable') {
            return Promise.resolve(false);
        }
        if (this.status === 'loading' && this.loadPromise) return this.loadPromise;

        let ad: any = null;
        try {
            ad = this.ensureAd();
        } catch (error) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad create failed:`, error);
            this.emitSyntheticLoadFailure(
                reason,
                resolveRewardedAdErrorCode(error) || 'create-failed',
                this.currentCallback ? this.currentRequestId : 0,
            );
            return Promise.resolve(false);
        }
        if (!ad || typeof ad.load !== 'function') {
            this.emitSyntheticLoadFailure(
                reason,
                'load-unavailable',
                this.currentCallback ? this.currentRequestId : 0,
            );
            return Promise.resolve(false);
        }
        const generation = this.currentAdGeneration;
        this.setStatus('loading', reason);
        const loadPromise = Promise.resolve()
            .then(() => {
                if (this.ad !== ad || this.currentAdGeneration !== generation) return false;
                return Promise.resolve(ad.load()).then(() => true);
            })
            .then((loaded) => {
                const isCurrentAd = loaded && this.ad === ad && this.currentAdGeneration === generation;
                if (isCurrentAd && this.status === 'loading') {
                    this.setStatus('ready', reason);
                    this.scheduleReadyExpiry(ad, generation, reason);
                    console.log(`[AdConfig] ${this.platform} rewarded ad preloaded:`, reason);
                }
                return isCurrentAd;
            })
            .catch((err) => {
                console.warn(`[AdConfig] ${this.platform} rewarded ad preload failed:`, err);
                if (this.ad === ad && this.currentAdGeneration === generation) {
                    this.setStatus('idle', `load-failed:${reason}`, resolveRewardedAdErrorCode(err));
                    this.cleanupAd(ad);
                }
                return false;
            })
            .then((ready) => {
                if (this.loadPromise === loadPromise) {
                    this.loadPromise = null;
                }
                return ready;
            });
        this.loadPromise = loadPromise;
        return loadPromise;
    }

    private showLoadedAd(requestId: number): void {
        if (!this.isCurrentRequest(requestId)) return;
        const ad = this.ensureAd();
        if (!ad || typeof ad.show !== 'function') {
            this.resolveCurrent({ status: 'technical_error', reason: 'show-unavailable' });
            return;
        }
        this.setStatus('establishing', 'show-start');
        const establishWaitMs = this.getShowEstablishWaitMs(this.currentHooks || {});
        this.showEstablishTimer = setTimeout(() => {
            if (!this.isCurrentRequest(requestId) || this.status !== 'establishing') return;
            this.showEstablishTimer = null;
            console.warn(`[AdConfig] ${this.platform} rewarded ad show establishment timeout`);
            this.resolveCurrent({ status: 'technical_error', reason: 'show-establish-timeout' });
        }, establishWaitMs);
        Promise.resolve()
            .then(() => ad.show())
            .then(() => {
                if (!this.isCurrentRequest(requestId)) return;
                this.clearShowEstablishTimer();
                this.setStatus('visible', 'show-resolved');
                this.currentHooks?.onShow?.(requestId);
                console.log(`[AdConfig] ${this.platform} rewarded ad show resolved`);
            })
            .catch((err) => {
                if (!this.isCurrentRequest(requestId)) return;
                console.warn(`[AdConfig] ${this.platform} rewarded ad show failed:`, err);
                this.resolveCurrent({ status: 'technical_error', reason: 'show-failed', error: err });
            });
    }

    private resolveCurrent(outcome: Omit<RewardedAdOutcome, 'attemptId'>): void {
        if (!this.currentCallback) return;
        this.clearLoadWaitTimer();
        this.clearShowEstablishTimer();
        const callback = this.currentCallback;
        const attemptId = this.currentRequestId;
        const ad = this.ad;
        this.currentCallback = null;
        this.currentHooks = null;
        this.currentRecoverableNotified = false;
        this.setStatus(
            'idle',
            `outcome:${outcome.status}:${outcome.reason || ''}`,
            resolveRewardedAdErrorCode(outcome.error) || String(outcome.reason || '').slice(0, 80),
        );
        this.loadPromise = null;
        this.cleanupAd(ad);
        try {
            callback({ attemptId, ...outcome });
        } catch (error) {
            console.error(`[AdConfig] ${this.platform} rewarded ad callback failed:`, error);
        } finally {
            this.preloadAfterInteraction('after-show');
        }
    }

    private invokeCurrentCloseHook(result: unknown): void {
        try {
            this.currentHooks?.onClose?.(result, this.currentRequestId);
        } catch (error) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad close hook failed:`, error);
        }
    }

    private isCurrentRequest(requestId: number): boolean {
        return !!this.currentCallback && this.currentRequestId === requestId;
    }

    private clearLoadWaitTimer(): void {
        if (!this.loadWaitTimer) return;
        clearTimeout(this.loadWaitTimer);
        this.loadWaitTimer = null;
    }

    private clearShowEstablishTimer(): void {
        if (!this.showEstablishTimer) return;
        clearTimeout(this.showEstablishTimer);
        this.showEstablishTimer = null;
    }

    private clearReadyExpiryTimer(): void {
        if (!this.readyExpiryTimer) return;
        clearTimeout(this.readyExpiryTimer);
        this.readyExpiryTimer = null;
    }

    private finishLoadTelemetry(
        stage: Exclude<RewardedAdLoadStage, 'start'>,
        reason: string,
        durationMs: number,
        errorCode: string,
    ): void {
        const loadId = this.activeLoadId;
        if (loadId <= 0) return;
        emitRewardedAdLoadEvent({
            stage,
            platform: this.platform,
            loadId,
            requestId: this.activeLoadRequestId,
            generation: this.currentAdGeneration,
            reason: String(reason || '').slice(0, 120),
            durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
            errorCode: stage === 'fail'
                ? String(errorCode || reason || 'load-failed').slice(0, 80)
                : '',
        });
        this.activeLoadId = 0;
        this.activeLoadRequestId = 0;
        this.activeLoadStartedAt = 0;
    }

    private emitSyntheticLoadFailure(reason: string, errorCode: string, requestId: number): void {
        const loadId = ++this.loadSeq;
        const normalizedReason = String(reason || 'unknown').slice(0, 120);
        emitRewardedAdLoadEvent({
            stage: 'start',
            platform: this.platform,
            loadId,
            requestId,
            generation: this.currentAdGeneration,
            reason: normalizedReason,
            durationMs: 0,
            errorCode: '',
        });
        emitRewardedAdLoadEvent({
            stage: 'fail',
            platform: this.platform,
            loadId,
            requestId,
            generation: this.currentAdGeneration,
            reason: normalizedReason,
            durationMs: 0,
            errorCode: String(errorCode || 'load-unavailable').slice(0, 80),
        });
    }

    private scheduleReadyExpiry(ad: any, generation: number, reason: string): void {
        this.clearReadyExpiryTimer();
        this.readyExpiryTimer = setTimeout(() => {
            this.readyExpiryTimer = null;
            if (this.ad !== ad
                || this.currentAdGeneration !== generation
                || this.status !== 'ready'
                || this.currentCallback) {
                return;
            }
            this.setStatus('idle', `ready-expired:${reason}`);
            this.loadPromise = null;
            this.cleanupAd(ad);
        }, REWARDED_AD_UNUSED_READY_TTL_MS);
    }

    private cleanupAd(ad: any): void {
        if (!ad || this.ad !== ad) return;
        this.clearReadyExpiryTimer();
        const closeListener = this.adCloseListener;
        const errorListener = this.adErrorListener;
        this.ad = null;
        this.adCloseListener = null;
        this.adErrorListener = null;
        this.currentAdGeneration = 0;
        try {
            if (closeListener) ad.offClose?.(closeListener);
        } catch (error) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad offClose failed:`, error);
        }
        try {
            if (errorListener) ad.offError?.(errorListener);
        } catch (error) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad offError failed:`, error);
        }
        try {
            ad.destroy?.();
        } catch (error) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad destroy failed:`, error);
        }
    }

    private preloadAfterInteraction(reason: string): void {
        if (this.platform === 'wechat') return;
        this.preload(reason);
    }

    private resolveCloseOutcome(result: any): Omit<RewardedAdOutcome, 'attemptId'> {
        if (typeof result?.isEnded === 'boolean') {
            return {
                status: result.isEnded ? 'verified_complete' : 'verified_incomplete',
                closeResult: result,
            };
        }
        if (this.shouldSimulateDevtoolsCompletion()) {
            return { status: 'verified_complete', closeResult: result };
        }
        return {
            status: 'unknown',
            reason: 'close-result-missing-isEnded',
            closeResult: result,
        };
    }

    private getClickLoadWaitMs(hooks: RewardedAdHooks): number {
        if (this.platform === 'wechat') {
            return 10000;
        }
        if (this.isDevtoolsLike()) {
            return Math.max(1200, Math.min(3000, hooks.minFallbackWatchMs || 2000));
        }
        return 10000;
    }

    private getShowEstablishWaitMs(hooks: RewardedAdHooks): number {
        if (this.platform === 'wechat') {
            return 10000;
        }
        if (this.isDevtoolsLike()) {
            return Math.max(1200, Math.min(3000, hooks.minFallbackWatchMs || 2000));
        }
        return 10000;
    }

    private shouldSimulateDevtoolsCompletion(): boolean {
        if (this.platform === 'wechat') return false;
        return this.isDevtoolsLike();
    }

    private isDevtoolsLike(): boolean {
        if (getMiniGameBuildMode() === 'debug') return true;
        const api = this.getRuntimeApi();
        try {
            const info = this.getSystemInfo(api) || {};
            const markers = [
                info.platform,
                info.environment,
                info.appName,
                info.system,
                info.model,
            ].map((value) => String(value || '').toLowerCase());
            return markers.some((value) => {
                return value === 'devtools'
                    || value === 'simulator'
                    || value === 'mac'
                    || value === 'macos'
                    || value === 'windows'
                    || value.includes('devtools')
                    || value.includes('simulator')
                    || value.includes('mac os')
                    || value.includes('windows');
            });
        } catch {
            return false;
        }
    }
}

class DouyinRewardedAdProvider extends NativeRewardedAdProvider {
    public readonly platform: MiniGameBuildPlatform = 'douyin';

    protected getRuntimeApi(): any {
        return getDouyinMiniGameRuntime();
    }

    protected getSystemInfo(api: any): any {
        return api?.getSystemInfoSync?.() || {};
    }
}

class WeChatRewardedAdProvider extends NativeRewardedAdProvider {
    public readonly platform: MiniGameBuildPlatform = 'wechat';

    protected getRuntimeApi(): any {
        return getWeChatMiniGameRuntime();
    }

    protected getSystemInfo(api: any): any {
        const deviceInfo = api?.getDeviceInfo?.() || {};
        const systemInfo = api?.getSystemInfoSync?.() || {};
        return { ...deviceInfo, ...systemInfo };
    }
}

class WebRewardedAdProvider implements RewardedAdProvider {
    public readonly platform: MiniGameBuildPlatform = 'web';
    private state: RewardedAdStateSnapshot = {
        status: 'idle',
        previousStatus: 'idle',
        reason: 'init',
        requestId: 0,
        generation: 0,
        changedAt: Date.now(),
        durationMs: 0,
    };
    private readonly listeners = new Set<RewardedAdStateListener>();

    preload(_reason: string = 'manual'): void {}

    show(callback: RewardedAdCallback, hooks: RewardedAdHooks = {}): void {
        console.log('[AdConfig] web/preview rewarded ad simulated success');
        this.updateState('visible', 'preview-show');
        hooks.onShow?.(1);
        hooks.onClose?.({ isEnded: true }, 1);
        callback({ attemptId: 1, status: 'verified_complete' });
        this.updateState('idle', 'preview-complete');
    }

    hasNativeAdWindow(): boolean {
        return false;
    }

    notifyGameResumed(): void {}

    cancelPending(_reason: string = 'manual'): boolean {
        return false;
    }

    endRecoverableWait(_reason: string = 'manual'): boolean {
        return false;
    }

    getState(): RewardedAdStateSnapshot {
        return {
            ...this.state,
            durationMs: Math.max(0, Date.now() - this.state.changedAt),
        };
    }

    subscribe(listener: RewardedAdStateListener): () => void {
        this.listeners.add(listener);
        listener(this.getState());
        return () => this.listeners.delete(listener);
    }

    private updateState(status: RewardedAdStatus, reason: string): void {
        const now = Date.now();
        this.state = {
            status,
            previousStatus: this.state.status,
            reason,
            requestId: 1,
            generation: 0,
            changedAt: now,
            durationMs: Math.max(0, now - this.state.changedAt),
        };
        for (const listener of [...this.listeners]) listener(this.state);
    }
}

let cachedProvider: RewardedAdProvider | null = null;
let cachedProviderKey = '';

export function getRewardedAdProvider(ids: RewardedAdUnitIds): RewardedAdProvider {
    const platform = getMiniGameBuildPlatform();
    const key = `${platform}:${ids.douyin}:${ids.wechat}`;
    if (cachedProvider && cachedProviderKey === key) return cachedProvider;
    cachedProviderKey = key;
    if (platform === 'douyin') {
        cachedProvider = new DouyinRewardedAdProvider(ids.douyin);
    } else if (platform === 'wechat') {
        cachedProvider = new WeChatRewardedAdProvider(ids.wechat);
    } else {
        cachedProvider = new WebRewardedAdProvider();
    }
    return cachedProvider;
}
