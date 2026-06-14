import { _decorator } from 'cc';
import { DouyinCloudMgr } from './DouyinCloudMgr';
import { getDouyinMiniGameRuntime, getMiniGameBuildPlatform } from './MiniGamePlatform';
import { WxCloudMgr } from './WxCloudMgr';

const { ccclass } = _decorator;

type PlatformCloudKind = 'wechat' | 'douyin' | 'none';

@ccclass('PlatformCloudMgr')
export class PlatformCloudMgr {
    private static _inst: PlatformCloudMgr | null = null;

    static get inst(): PlatformCloudMgr {
        if (!PlatformCloudMgr._inst) {
            PlatformCloudMgr._inst = new PlatformCloudMgr();
        }
        return PlatformCloudMgr._inst;
    }

    private constructor() {}

    getPlatform(): PlatformCloudKind {
        const platform = getMiniGameBuildPlatform();
        if (platform === 'wechat') return 'wechat';
        if (platform === 'douyin') return 'douyin';
        return 'none';
    }

    canUseCloud(): boolean {
        const platform = this.getPlatform();
        if (platform === 'wechat') return WxCloudMgr.inst.canUseCloud();
        if (platform === 'douyin') return DouyinCloudMgr.inst.canUseCloud();
        return false;
    }

    async init(): Promise<boolean> {
        const platform = this.getPlatform();
        if (platform === 'wechat') return WxCloudMgr.inst.init();
        if (platform === 'douyin') return DouyinCloudMgr.inst.init();
        return false;
    }

    async callFunction<T = any>(name: string, data: Record<string, unknown> = {}): Promise<T> {
        const platform = this.getPlatform();
        if (platform === 'wechat') return WxCloudMgr.inst.callFunction<T>(name, data);
        if (platform === 'douyin') return DouyinCloudMgr.inst.callFunction<T>(name, data);
        throw new Error('platform cloud is unavailable');
    }

    getDiagnostics(): Record<string, unknown> {
        const platform = this.getPlatform();
        if (platform === 'wechat') return WxCloudMgr.inst.getDiagnostics();
        if (platform === 'douyin') return DouyinCloudMgr.inst.getDiagnostics();
        return {
            platform: 'none',
            cloudReady: false,
        };
    }

    getSystemInfo(): { device: string; system: string } {
        const platform = this.getPlatform();
        if (platform === 'wechat') return WxCloudMgr.inst.getSystemInfo();
        if (platform === 'douyin') return this.getDouyinSystemInfo();
        return { device: '', system: '' };
    }

    getLaunchChannel(): string {
        const platform = this.getPlatform();
        if (platform === 'wechat') return WxCloudMgr.inst.getLaunchChannel();
        if (platform === 'douyin') return this.getDouyinLaunchChannel();
        return '';
    }

    isDevtools(): boolean {
        const platform = this.getPlatform();
        if (platform === 'wechat') return WxCloudMgr.inst.isDevtools();
        if (platform === 'douyin') {
            try {
                const tt = getDouyinMiniGameRuntime();
                const info = tt?.getSystemInfoSync?.() || {};
                return String(info.platform || '').toLowerCase() === 'devtools';
            } catch (_) {
                return false;
            }
        }
        return false;
    }

    private getDouyinSystemInfo(): { device: string; system: string } {
        try {
            const tt = getDouyinMiniGameRuntime();
            const info = tt?.getDeviceInfo?.() || tt?.getSystemInfoSync?.() || {};
            const device = typeof info.model === 'string' ? info.model : '';
            const system = typeof info.system === 'string' ? info.system : '';
            return { device, system };
        } catch (_) {
            return { device: '', system: '' };
        }
    }

    private getDouyinLaunchChannel(): string {
        try {
            const launch = getDouyinMiniGameRuntime()?.getLaunchOptionsSync?.() || {};
            const query = (launch.query && typeof launch.query === 'object') ? launch.query as Record<string, unknown> : {};
            const channel = query.channel ?? query.from ?? launch.scene ?? '';
            return typeof channel === 'string' || typeof channel === 'number' ? String(channel) : '';
        } catch (_) {
            return '';
        }
    }
}
