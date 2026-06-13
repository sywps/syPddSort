import { _decorator } from 'cc';
import { getWeChatMiniGameRuntime, isWeChatMiniGameRuntime } from './MiniGamePlatform';

const { ccclass } = _decorator;

export const WECHAT_CLOUD_ENV_ID = 'cloud1-d5gzq8ia0c404ee3e';

type WeChatRuntime = {
    cloud?: {
        init?: (options?: Record<string, unknown>) => void;
        callFunction?: (options: Record<string, unknown>) => Promise<any>;
    };
    getDeviceInfo?: () => Record<string, unknown>;
    getSystemInfoSync?: () => Record<string, unknown>;
    getLaunchOptionsSync?: () => Record<string, unknown>;
};

@ccclass('WxCloudMgr')
export class WxCloudMgr {
    private static _inst: WxCloudMgr | null = null;

    static get inst(): WxCloudMgr {
        if (!WxCloudMgr._inst) {
            WxCloudMgr._inst = new WxCloudMgr();
        }
        return WxCloudMgr._inst;
    }

    private cloudInitPromise: Promise<boolean> | null = null;
    private cloudReady = false;

    private constructor() {}

    canUseCloud(): boolean {
        if (!isWeChatMiniGameRuntime()) return false;
        const wx = this.getWx(false);
        return !!wx?.cloud?.init && !!wx?.cloud?.callFunction;
    }

    getDiagnostics(): Record<string, unknown> {
        const wx = this.getWx(false) as any;
        return {
            platform: 'wechat',
            env: WECHAT_CLOUD_ENV_ID,
            hasWx: !!wx,
            hasCloud: !!wx?.cloud,
            hasInit: typeof wx?.cloud?.init === 'function',
            hasCallFunction: typeof wx?.cloud?.callFunction === 'function',
            cloudReady: this.cloudReady,
        };
    }

    getWx(throwOnMissing: boolean = true): WeChatRuntime | null {
        const wxRuntime = getWeChatMiniGameRuntime();
        if (!wxRuntime && throwOnMissing) {
            throw new Error('wx runtime is unavailable');
        }
        return wxRuntime as WeChatRuntime | null;
    }

    async init(): Promise<boolean> {
        if (!this.canUseCloud()) {
            return false;
        }
        if (this.cloudInitPromise) {
            return this.cloudInitPromise;
        }

        this.cloudInitPromise = Promise.resolve().then(() => {
            try {
                const wx = this.getWx();
                const initOptions: Record<string, unknown> = { traceUser: true };
                if (WECHAT_CLOUD_ENV_ID) {
                    initOptions.env = WECHAT_CLOUD_ENV_ID;
                }
                wx?.cloud?.init?.(initOptions);
                this.cloudReady = true;
                return true;
            } catch (error) {
                this.cloudReady = false;
                console.warn('[WxCloudMgr] wx.cloud.init failed:', error);
                return false;
            }
        });

        return this.cloudInitPromise;
    }

    async callFunction<T = any>(name: string, data: Record<string, unknown> = {}): Promise<T> {
        if (!(await this.init())) {
            throw new Error('wx.cloud is not ready');
        }

        const wx = this.getWx();
        const callOptions: Record<string, unknown> = {
            name,
            data,
        };

        if (WECHAT_CLOUD_ENV_ID) {
            callOptions.config = { env: WECHAT_CLOUD_ENV_ID };
        }

        const result = await wx?.cloud?.callFunction?.(callOptions);
        return (result?.result ?? {}) as T;
    }

    getSystemInfo(): { device: string; system: string } {
        try {
            const wx = this.getWx(false);
            // 优先使用新 API（HarmonyOS 兼容），回退到旧 API
            let device = '';
            let system = '';
            if (wx?.getDeviceInfo) {
                const info = wx.getDeviceInfo();
                device = typeof info.model === 'string' ? info.model : '';
                system = typeof info.system === 'string' ? info.system : '';
            } else if (wx?.getSystemInfoSync) {
                const info = wx.getSystemInfoSync();
                device = typeof info.model === 'string' ? info.model : '';
                system = typeof info.system === 'string' ? info.system : '';
            }
            return { device, system };
        } catch (_) {
            return { device: '', system: '' };
        }
    }

    getLaunchChannel(): string {
        try {
            const launch = this.getWx(false)?.getLaunchOptionsSync?.() || {};
            const query = (launch.query && typeof launch.query === 'object') ? launch.query as Record<string, unknown> : {};
            const channel = query.channel ?? query.from ?? launch.scene ?? '';
            return typeof channel === 'string' || typeof channel === 'number' ? String(channel) : '';
        } catch (_) {
            return '';
        }
    }

    getPlatform(): string {
        try {
            const wx = this.getWx(false);
            const info = wx?.getSystemInfoSync?.() || {};
            const platform = info.platform;
            return typeof platform === 'string' ? platform.toLowerCase() : '';
        } catch (_) {
            return '';
        }
    }

    isDevtools(): boolean {
        return this.getPlatform() === 'devtools';
    }

    get isCloudReady(): boolean {
        return this.cloudReady;
    }
}
