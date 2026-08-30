export const WECHAT_SHARE_RETURN_MIN_ELAPSED_MS = 1500;
export const WECHAT_SHARE_RETURN_TIMEOUT_MS = 30000;

export type WeChatSharePayload = {
    title: string;
    query?: string;
    imageUrl?: string;
};

export type WeChatShareReturnStatus =
    | 'qualified'
    | 'too_short'
    | 'timeout'
    | 'cancelled'
    | 'cleanup_failed';

export type WeChatShareReturnResult = {
    status: WeChatShareReturnStatus;
    elapsedMs: number;
    reason?: string;
};

export type WeChatShareReturnStartFailure = 'busy' | 'unavailable' | 'dispatch_failed' | 'cleanup_failed';

export type WeChatShareReturnHandle = {
    cancel: (reason?: string) => boolean;
    isActive: () => boolean;
};

export type WeChatShareReturnStartResult =
    | { started: true; handle: WeChatShareReturnHandle }
    | { started: false; reason: WeChatShareReturnStartFailure };

export type WeChatShareReturnRequest = {
    runtime: any;
    payload: WeChatSharePayload;
    onComplete: (result: WeChatShareReturnResult) => void;
    minElapsedMs?: number;
    timeoutMs?: number;
};

export type WeChatShareReturnServiceOptions = {
    now?: () => number;
    setTimeout?: (callback: () => void, delayMs: number) => any;
    clearTimeout?: (handle: any) => void;
};

type ActiveShareReturn = {
    runtime: any;
    listener: () => void;
    onComplete: (result: WeChatShareReturnResult) => void;
    startedAt: number;
    minElapsedMs: number;
    timeoutHandle: any;
    listenerAttached: boolean;
    settled: boolean;
};

function resolvePositiveMs(value: number | undefined, fallback: number): number {
    const normalized = Math.floor(Number(value));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

/**
 * 微信奖励分享没有可用的“分享成功”回调。这里用官方的主动分享 + 回到前台事件，
 * 严格以离开时长大于门槛作为奖励资格。
 */
export class WeChatShareReturnService {
    private active: ActiveShareReturn | null = null;
    private readonly now: () => number;
    private readonly scheduleTimeout: (callback: () => void, delayMs: number) => any;
    private readonly clearScheduledTimeout: (handle: any) => void;

    constructor(options: WeChatShareReturnServiceOptions = {}) {
        this.now = options.now || (() => Date.now());
        this.scheduleTimeout = options.setTimeout || ((callback, delayMs) => setTimeout(callback, delayMs));
        this.clearScheduledTimeout = options.clearTimeout || ((handle) => clearTimeout(handle));
    }

    start(request: WeChatShareReturnRequest): WeChatShareReturnStartResult {
        if (this.active) {
            return { started: false, reason: 'busy' };
        }
        const runtime = request.runtime;
        if (!runtime
            || typeof runtime.shareAppMessage !== 'function'
            || typeof runtime.onShow !== 'function'
            || typeof runtime.offShow !== 'function') {
            return { started: false, reason: 'unavailable' };
        }

        const minElapsedMs = resolvePositiveMs(request.minElapsedMs, WECHAT_SHARE_RETURN_MIN_ELAPSED_MS);
        const timeoutMs = resolvePositiveMs(request.timeoutMs, WECHAT_SHARE_RETURN_TIMEOUT_MS);
        let active: ActiveShareReturn;
        const listener = () => {
            const elapsedMs = Math.max(0, this.now() - active.startedAt);
            this.settle(active, elapsedMs > active.minElapsedMs ? 'qualified' : 'too_short', elapsedMs);
        };
        active = {
            runtime,
            listener,
            onComplete: request.onComplete,
            startedAt: this.now(),
            minElapsedMs,
            timeoutHandle: null,
            listenerAttached: false,
            settled: false,
        };
        this.active = active;

        try {
            runtime.onShow(listener);
            active.listenerAttached = true;
        } catch (error) {
            console.warn('[wechat-share-return] wx.onShow registration failed:', error);
            this.active = null;
            return { started: false, reason: 'unavailable' };
        }

        try {
            runtime.shareAppMessage(request.payload);
        } catch (error) {
            console.warn('[wechat-share-return] wx.shareAppMessage dispatch failed:', error);
            const cleaned = this.cleanup(active);
            if (this.active === active) this.active = null;
            return { started: false, reason: cleaned ? 'dispatch_failed' : 'cleanup_failed' };
        }

        if (this.active === active && !active.settled) {
            active.timeoutHandle = this.scheduleTimeout(() => {
                this.settle(active, 'timeout', Math.max(0, this.now() - active.startedAt));
            }, timeoutMs);
        }

        const handle: WeChatShareReturnHandle = {
            cancel: (reason: string = 'manual') => this.cancel(active, reason),
            isActive: () => this.active === active && !active.settled,
        };
        return { started: true, handle };
    }

    cancelActive(reason: string = 'manual'): boolean {
        const active = this.active;
        return active ? this.cancel(active, reason) : false;
    }

    private cancel(active: ActiveShareReturn, reason: string): boolean {
        if (this.active !== active || active.settled) return false;
        this.settle(active, 'cancelled', Math.max(0, this.now() - active.startedAt), reason);
        return true;
    }

    private settle(
        active: ActiveShareReturn,
        status: Exclude<WeChatShareReturnStatus, 'cleanup_failed'>,
        elapsedMs: number,
        reason: string = '',
    ): void {
        if (this.active !== active || active.settled) return;
        active.settled = true;
        const cleaned = this.cleanup(active);
        if (this.active === active) this.active = null;
        const result: WeChatShareReturnResult = {
            status: cleaned ? status : 'cleanup_failed',
            elapsedMs,
            reason: cleaned ? reason || undefined : 'off-show-failed',
        };
        try {
            active.onComplete(result);
        } catch (error) {
            console.warn('[wechat-share-return] completion callback failed:', error);
        }
    }

    private cleanup(active: ActiveShareReturn): boolean {
        let cleaned = true;
        if (active.timeoutHandle) {
            try {
                this.clearScheduledTimeout(active.timeoutHandle);
            } catch (error) {
                cleaned = false;
                console.warn('[wechat-share-return] timeout cleanup failed:', error);
            }
            active.timeoutHandle = null;
        }
        if (active.listenerAttached) {
            try {
                active.runtime.offShow(active.listener);
            } catch (error) {
                cleaned = false;
                console.warn('[wechat-share-return] wx.offShow cleanup failed:', error);
            }
            active.listenerAttached = false;
        }
        return cleaned;
    }
}

export const weChatShareReturnService = new WeChatShareReturnService();
