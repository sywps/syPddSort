/**
 * 广告适配：抖音 + 微信小游戏
 */

import { _decorator, Component } from 'cc';
import { getRewardedAdProvider, type RewardedAdHooks } from './RewardedAdProvider';
import { getMiniGameBuildMode, getMiniGameBuildPlatform, getWeChatMiniGameRuntime } from '../Core/MiniGamePlatform';
const { ccclass } = _decorator;

type RewardedAdMode = 'native' | 'mock-success' | 'mock-fail';

@ccclass('AdConfig')
export class AdConfig extends Component {
    public static readonly DOUYIN_AD_ID: string = 'so89260s57143ahcbc';
    private static readonly WECHAT_AD_ID: string = 'adunit-6a581caa226250fd';

    public static notifyGameResumed() {
        // 已移除兜底成功逻辑 — 不再按游戏恢复事件判定广告成功。
        // 保留此方法以免外部调用报错。
    }

    public static canAutoPreloadRewardedAd(): boolean {
        if (AdConfig.getRewardedAdMode() !== 'native') return false;
        const provider = AdConfig.getProvider();
        return provider.hasNativeAdWindow();
    }

    public static preloadRewardedAd(reason: string = 'manual'): boolean {
        const provider = AdConfig.getProvider();
        if (!AdConfig.canAutoPreloadRewardedAd()) {
            console.log(`[AdConfig] skip rewarded ad auto preload: ${reason}`);
            return false;
        }
        provider.preload(reason);
        return true;
    }

    public static hasRewardedAdWindow(): boolean {
        if (AdConfig.getRewardedAdMode() !== 'native') return false;
        return AdConfig.getProvider().hasNativeAdWindow();
    }

    public static showRewardedAd(
        callback: (success: boolean) => void,
        hooks: RewardedAdHooks = {}
    ) {
        const mode = AdConfig.getRewardedAdMode();
        if (mode === 'mock-success') {
            console.warn('[AdConfig] mock wechat rewarded ad success; native ad not created');
            hooks.onShow?.();
            hooks.onClose?.();
            callback(true);
            return;
        }
        if (mode === 'mock-fail') {
            console.warn('[AdConfig] mock wechat rewarded ad failure; native ad not created');
            callback(false);
            return;
        }
        AdConfig.getProvider().show(callback, hooks);
    }

    public static getRewardedAdMode(): RewardedAdMode {
        if (getMiniGameBuildPlatform() !== 'wechat') return 'native';
        const mockOverride = AdConfig.getRewardedAdMockOverride();
        if (mockOverride && AdConfig.canUseRewardedAdMockOverride()) return mockOverride;
        if (AdConfig.isWeChatDevtoolsLike()) return 'mock-fail';
        return 'native';
    }

    private static getProvider() {
        return getRewardedAdProvider({
            douyin: AdConfig.DOUYIN_AD_ID,
            wechat: AdConfig.WECHAT_AD_ID,
        });
    }

    private static getRewardedAdMockOverride(): RewardedAdMode | null {
        const value = AdConfig.getLaunchQueryValue('adMock') || AdConfig.getLaunchQueryValue('rewardedAdMock');
        if (!value) return null;
        const normalized = value.toLowerCase();
        if (normalized === 'success' || normalized === 'true' || normalized === '1') return 'mock-success';
        if (normalized === 'fail' || normalized === 'failure' || normalized === 'false' || normalized === '0') return 'mock-fail';
        return null;
    }

    private static canUseRewardedAdMockOverride(): boolean {
        return AdConfig.isWeChatDevtoolsLike() || getMiniGameBuildMode() !== 'release';
    }

    private static getLaunchQueryValue(name: string): string {
        const api = getWeChatMiniGameRuntime();
        try {
            const query = api?.getLaunchOptionsSync?.()?.query || {};
            const value = query[name];
            if (value !== undefined && value !== null) return String(value);
        } catch {
            // Ignore launch-query lookup failures and fall through to location.
        }
        try {
            const scope = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
            const location = scope?.location || scope?.window?.location;
            const search = String(location?.search || '');
            const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
            return params.get(name) || '';
        } catch {
            return '';
        }
    }

    private static isWeChatDevtoolsLike(): boolean {
        const api = getWeChatMiniGameRuntime();
        try {
            const deviceInfo = api?.getDeviceInfo?.() || {};
            const systemInfo = api?.getSystemInfoSync?.() || {};
            const markers = [
                deviceInfo.platform,
                deviceInfo.environment,
                deviceInfo.appName,
                deviceInfo.system,
                deviceInfo.model,
                systemInfo.platform,
                systemInfo.environment,
                systemInfo.appName,
                systemInfo.system,
                systemInfo.model,
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
