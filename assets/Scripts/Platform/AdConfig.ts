/**
 * 广告适配：抖音 + 微信小游戏
 */

import { _decorator, Component } from 'cc';
import { getRewardedAdProvider, type RewardedAdHooks } from './RewardedAdProvider';
const { ccclass } = _decorator;

@ccclass('AdConfig')
export class AdConfig extends Component {
    public static readonly DOUYIN_AD_ID: string = 'so89260s57143ahcbc';
    private static readonly WECHAT_AD_ID: string = 'adunit-6a581caa226250fd';

    public static notifyGameResumed() {
        // 已移除兜底成功逻辑 — 不再按游戏恢复事件判定广告成功。
        // 保留此方法以免外部调用报错。
    }

    public static preloadRewardedAd(reason: string = 'manual') {
        AdConfig.getProvider().preload(reason);
    }

    public static hasRewardedAdWindow(): boolean {
        return AdConfig.getProvider().hasNativeAdWindow();
    }

    public static showRewardedAd(
        callback: (success: boolean) => void,
        hooks: RewardedAdHooks = {}
    ) {
        AdConfig.getProvider().show(callback, hooks);
    }

    private static getProvider() {
        return getRewardedAdProvider({
            douyin: AdConfig.DOUYIN_AD_ID,
            wechat: AdConfig.WECHAT_AD_ID,
        });
    }
}
