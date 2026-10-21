export type DouyinShareResult = {
    status: 'qualified' | 'cancelled' | 'failed' | 'timeout';
    elapsedMs: number;
    reason?: string;
};

type ShareHandle = { cancel: (reason?: string) => boolean; isActive: () => boolean };
type ShareStartResult =
    | { started: true; handle: ShareHandle }
    | { started: false; reason: 'busy' | 'unavailable' | 'dispatch_failed' };

export function isDouyinShareCancelled(error: any): boolean {
    return Number(error?.errNo) === 10502 || /\bcancel(?:led)?\b/i.test(String(error?.errMsg || ''));
}

/** 好友卡片素材使用抖音后台分享配置，不传微信 imageUrlId。 */
export class DouyinShareService {
    private active: ShareHandle | null = null;
    private readonly now: () => number;
    private readonly schedule: (callback: () => void, delay: number) => any;
    private readonly unschedule: (timer: any) => void;

    constructor(options: {
        now?: () => number;
        setTimeout?: (callback: () => void, delay: number) => any;
        clearTimeout?: (timer: any) => void;
    } = {}) {
        this.now = options.now || (() => Date.now());
        this.schedule = options.setTimeout || ((callback, delay) => setTimeout(callback, delay));
        this.unschedule = options.clearTimeout || ((timer) => clearTimeout(timer));
    }

    start(request: {
        runtime: any;
        payload: { title?: string; query?: string };
        onComplete: (result: DouyinShareResult) => void;
    }): ShareStartResult {
        if (this.active) return { started: false, reason: 'busy' };
        if (typeof request.runtime?.shareAppMessage !== 'function') {
            return { started: false, reason: 'unavailable' };
        }
        const startedAt = this.now();
        let settled = false;
        let timer: any = null;
        const release = () => {
            settled = true;
            if (timer !== null) this.unschedule(timer);
            timer = null;
            if (this.active === handle) this.active = null;
        };
        const finish = (status: DouyinShareResult['status'], reason?: string): boolean => {
            if (settled) return false;
            release();
            request.onComplete({ status, elapsedMs: Math.max(0, this.now() - startedAt), reason });
            return true;
        };
        const handle: ShareHandle = {
            cancel: (reason) => finish('cancelled', reason),
            isActive: () => !settled,
        };
        this.active = handle;
        timer = this.schedule(() => finish('timeout', 'share_callback_timeout'), 30000);
        try {
            // 必须在用户点击调用栈中拉起；回前台/打开面板均不代表分享成功。
            request.runtime.shareAppMessage({
                channel: 'invite',
                title: request.payload.title,
                query: request.payload.query,
                success: () => finish('qualified'),
                fail: (error: any) => finish(
                    isDouyinShareCancelled(error) ? 'cancelled' : 'failed',
                    String(error?.errMsg || error?.errNo || 'share_failed'),
                ),
            });
        } catch (error) {
            console.warn('[douyin-share] shareAppMessage failed:', error);
            if (!settled) {
                release();
                return { started: false, reason: 'dispatch_failed' };
            }
        }
        return { started: true, handle };
    }
}

export const douyinShareService = new DouyinShareService();
