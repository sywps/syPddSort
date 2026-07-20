import {
    getDouyinMiniGameRuntime,
    getMiniGameBuildPlatform,
    getMiniGameBuildMode,
    getWeChatMiniGameRuntime,
    type MiniGameBuildPlatform,
} from '../Core/MiniGamePlatform';

export type RewardedAdHooks = {
    onShow?: () => void;
    onClose?: () => void;
    minFallbackWatchMs?: number;
};

type RewardedAdCallback = (success: boolean) => void;
type RewardedAdStatus = 'idle' | 'loading' | 'ready' | 'showing';
const WECHAT_CLOSE_WATCHDOG_MS = 60 * 1000;
const FOREGROUND_RECOVERY_GRACE_MS = 1500;

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
}

abstract class NativeRewardedAdProvider implements RewardedAdProvider {
    public abstract readonly platform: MiniGameBuildPlatform;

    private ad: any = null;
    private status: RewardedAdStatus = 'idle';
    private loadPromise: Promise<boolean> | null = null;
    private currentCallback: RewardedAdCallback | null = null;
    private currentHooks: RewardedAdHooks | null = null;
    private currentRequestId = 0;
    private loadWaitTimer: any = null;
    private showSafetyTimer: any = null;
    private foregroundRecoveryTimer: any = null;
    private shownAt = 0;

    constructor(private readonly adUnitId: string) {}

    preload(reason: string = 'manual'): void {
        if (!this.hasNativeAdWindow()) return;
        void this.startLoad(reason);
    }

    show(callback: RewardedAdCallback, hooks: RewardedAdHooks = {}): void {
        if (!this.hasNativeAdWindow()) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad API unavailable`);
            callback(false);
            return;
        }
        if (this.currentCallback) {
            console.warn(`[AdConfig] ${this.platform} rewarded ad already showing`);
            callback(false);
            return;
        }
        const requestId = ++this.currentRequestId;
        this.currentCallback = callback;
        this.currentHooks = hooks;
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
                this.currentHooks?.onShow?.();
                this.invokeCurrentCloseHook();
            }
            this.resolveCurrent(devtoolsSuccess);
        }, waitMs);

        loadPromise.then((ready) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.clearLoadWaitTimer();
            if (!ready) {
                this.resolveCurrent(false);
                return;
            }
            this.showLoadedAd(requestId);
        }).catch((err) => {
            if (!this.isCurrentRequest(requestId)) return;
            this.clearLoadWaitTimer();
            console.warn(`[AdConfig] ${this.platform} rewarded ad load failed:`, err);
            this.resolveCurrent(false);
        });
    }

    hasNativeAdWindow(): boolean {
        const api = this.getRuntimeApi();
        return !!(api && typeof api.createRewardedVideoAd === 'function' && this.adUnitId);
    }

    notifyGameResumed(): void {
        if (!this.currentCallback) return;
        this.clearForegroundRecoveryTimer();
        const requestId = this.currentRequestId;
        this.foregroundRecoveryTimer = setTimeout(() => {
            this.foregroundRecoveryTimer = null;
            if (!this.isCurrentRequest(requestId)) return;
            this.cancelPending('foreground-close-missing');
        }, FOREGROUND_RECOVERY_GRACE_MS);
    }

    cancelPending(reason: string = 'manual'): boolean {
        if (!this.currentCallback) return false;
        console.error(`[AdConfig] ${this.platform} rewarded ad recovered from pending state: ${reason}`);
        this.invokeCurrentCloseHook();
        this.resolveCurrent(false);
        return true;
    }

    protected abstract getRuntimeApi(): any;
    protected abstract getSystemInfo(api: any): any;

    private ensureAd(): any {
        if (this.ad) return this.ad;
        const api = this.getRuntimeApi();
        if (!api || typeof api.createRewardedVideoAd !== 'function' || !this.adUnitId) return null;
        this.ad = api.createRewardedVideoAd({ adUnitId: this.adUnitId });
        this.ad.onClose?.((res: any) => {
            if (!this.currentCallback || this.status !== 'showing' || this.shownAt <= 0) {
                console.warn(`[AdConfig] ${this.platform} stale rewarded ad close ignored`);
                return;
            }
            this.invokeCurrentCloseHook();
            this.resolveCurrent(this.resolveCloseSuccess(res));
        });
        this.ad.onError?.((err: any) => {
            console.warn(`[AdConfig] ${this.platform} rewarded ad error:`, err);
            if (this.currentCallback) {
                this.resolveCurrent(false);
            } else {
                this.status = 'idle';
                this.loadPromise = null;
            }
        });
        return this.ad;
    }

    private startLoad(reason: string): Promise<boolean> {
        if (this.status === 'ready') return Promise.resolve(true);
        if (this.status === 'showing') return Promise.resolve(false);
        if (this.status === 'loading' && this.loadPromise) return this.loadPromise;

        const ad = this.ensureAd();
        if (!ad || typeof ad.load !== 'function') return Promise.resolve(false);
        this.status = 'loading';
        const loadPromise = Promise.resolve()
            .then(() => ad.load())
            .then(() => {
                if (this.status === 'loading') {
                    this.status = 'ready';
                    console.log(`[AdConfig] ${this.platform} rewarded ad preloaded:`, reason);
                }
                return true;
            })
            .catch((err) => {
                console.warn(`[AdConfig] ${this.platform} rewarded ad preload failed:`, err);
                this.status = 'idle';
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
            this.resolveCurrent(false);
            return;
        }
        this.status = 'showing';
        this.shownAt = 0;
        this.showSafetyTimer = setTimeout(() => {
            this.showSafetyTimer = null;
            if (!this.isCurrentRequest(requestId)) return;
            const success = this.shouldSimulateDevtoolsCompletion();
            console.warn(`[AdConfig] ${this.platform} rewarded ad close timeout, success=${success}`);
            if (success) {
                this.invokeCurrentCloseHook();
            }
            this.resolveCurrent(success);
        }, this.getShowSafetyMs(this.currentHooks || {}));

        Promise.resolve()
            .then(() => ad.show())
            .then(() => {
                if (!this.isCurrentRequest(requestId)) return;
                this.shownAt = Date.now();
                this.currentHooks?.onShow?.();
                console.log(`[AdConfig] ${this.platform} rewarded ad show resolved`);
            })
            .catch((err) => {
                if (!this.isCurrentRequest(requestId)) return;
                console.warn(`[AdConfig] ${this.platform} rewarded ad show failed:`, err);
                this.resolveCurrent(false);
            });
    }

    private resolveCurrent(success: boolean): void {
        if (!this.currentCallback) return;
        this.clearLoadWaitTimer();
        this.clearShowSafetyTimer();
        this.clearForegroundRecoveryTimer();
        const callback = this.currentCallback;
        this.currentCallback = null;
        this.currentHooks = null;
        this.status = 'idle';
        this.shownAt = 0;
        try {
            callback(success);
        } catch (error) {
            console.error(`[AdConfig] ${this.platform} rewarded ad callback failed:`, error);
        } finally {
            this.preloadAfterInteraction('after-show');
        }
    }

    private invokeCurrentCloseHook(): void {
        try {
            this.currentHooks?.onClose?.();
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

    private clearShowSafetyTimer(): void {
        if (!this.showSafetyTimer) return;
        clearTimeout(this.showSafetyTimer);
        this.showSafetyTimer = null;
    }

    private clearForegroundRecoveryTimer(): void {
        if (!this.foregroundRecoveryTimer) return;
        clearTimeout(this.foregroundRecoveryTimer);
        this.foregroundRecoveryTimer = null;
    }

    private preloadAfterInteraction(reason: string): void {
        if (this.platform === 'wechat') return;
        this.preload(reason);
    }

    private resolveCloseSuccess(res: any): boolean {
        if (typeof res?.isEnded === 'boolean') {
            return res.isEnded === true;
        }
        if (this.shouldSimulateDevtoolsCompletion()) {
            return true;
        }
        return false;
    }

    private getClickLoadWaitMs(hooks: RewardedAdHooks): number {
        if (this.platform === 'wechat') {
            return 10000;
        }
        if (this.isDevtoolsLike()) {
            return Math.max(1200, Math.min(3000, hooks.minFallbackWatchMs || 2000));
        }
        return 5000;
    }

    private getShowSafetyMs(hooks: RewardedAdHooks): number {
        if (this.platform === 'wechat') {
            return WECHAT_CLOSE_WATCHDOG_MS;
        }
        if (this.isDevtoolsLike()) {
            return Math.max(1500, Math.min(6000, hooks.minFallbackWatchMs || 3000));
        }
        return 30000;
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

    preload(_reason: string = 'manual'): void {}

    show(callback: RewardedAdCallback, hooks: RewardedAdHooks = {}): void {
        console.log('[AdConfig] web/preview rewarded ad simulated success');
        hooks.onShow?.();
        callback(true);
    }

    hasNativeAdWindow(): boolean {
        return false;
    }

    notifyGameResumed(): void {}

    cancelPending(_reason: string = 'manual'): boolean {
        return false;
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
