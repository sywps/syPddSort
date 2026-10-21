export type DouyinSubscriptionResult = {
    status: 'accepted' | 'declined' | 'blocked' | 'failed' | 'timeout';
    templateId: string;
    reason?: string;
};

type SubscriptionStart =
    | { started: true }
    | { started: false; reason: 'busy' | 'unconfigured' | 'unsupported' };

/** Subscription permission is separate from rewards and from sending a message. */
export function canUseDouyinSubscription(runtime: any): boolean {
    if (typeof runtime?.requestSubscribeMessage !== 'function'
        || typeof runtime?.getSystemInfoSync !== 'function') return false;
    try {
        const info = runtime.getSystemInfoSync();
        if (info?.appName !== 'Douyin' || String(info?.platform || '').toLowerCase() === 'openharmony') return false;
        return typeof runtime.canIUse !== 'function' || runtime.canIUse('requestSubscribeMessage') === true;
    } catch (_) {
        return false;
    }
}

export class DouyinSubscriptionService {
    private pending = false;
    private readonly schedule: (callback: () => void, delay: number) => any;
    private readonly unschedule: (timer: any) => void;

    constructor(options: {
        setTimeout?: (callback: () => void, delay: number) => any;
        clearTimeout?: (timer: any) => void;
    } = {}) {
        this.schedule = options.setTimeout || ((callback, delay) => setTimeout(callback, delay));
        this.unschedule = options.clearTimeout || (timer => clearTimeout(timer));
    }

    // Call directly within the player's native touch callback, without awaiting login/network first.
    start(request: {
        runtime: any;
        templateId: string;
        onComplete: (result: DouyinSubscriptionResult) => void;
    }): SubscriptionStart {
        if (this.pending) return { started: false, reason: 'busy' };
        const templateId = request.templateId;
        if (typeof templateId !== 'string' || !/^MSG[A-Za-z0-9_-]+$/.test(templateId)) {
            return { started: false, reason: 'unconfigured' };
        }
        if (!canUseDouyinSubscription(request.runtime)) return { started: false, reason: 'unsupported' };
        this.pending = true;
        let settled = false;
        let timer: any = null;
        const finish = (status: DouyinSubscriptionResult['status'], reason?: string) => {
            if (settled) return;
            settled = true;
            this.pending = false;
            if (timer !== null) this.unschedule(timer);
            request.onComplete({ status, templateId, reason });
        };
        timer = this.schedule(() => finish('timeout', 'subscription_result_unknown'), 60000);
        try {
            const tt = request.runtime;
            tt.requestSubscribeMessage({
                // A single template also prevents mixing version reminders with other types.
                tmplIds: [templateId],
                success: (result: any) => {
                    switch (result?.[templateId]) {
                        case 'accept': finish('accepted'); break;
                        case 'reject': finish('declined'); break;
                        case 'ban': finish('blocked', 'template_banned'); break;
                        case 'fail': finish('failed', 'template_authorization_failed'); break;
                        default: finish('failed', 'invalid_subscription_result'); break;
                    }
                },
                fail: (error: any) => {
                    const errNo = Number(error?.errNo), errCode = Number(error?.errCode);
                    if (errNo === 21105 || errCode === 3001) finish('declined');
                    else if ([21108, 21109, 21110].includes(errNo) || [4002, 4003, 4004].includes(errCode)) {
                        finish('blocked', 'subscription_disabled');
                    } else if (errNo === 10302) finish('failed', 'platform_unsupported');
                    else finish('failed', 'subscription_request_failed');
                },
            });
        } catch (error) {
            if (settled) throw error;
            finish('failed', 'subscription_request_threw');
        }
        return { started: true };
    }
}

export const douyinSubscriptionService = new DouyinSubscriptionService();
