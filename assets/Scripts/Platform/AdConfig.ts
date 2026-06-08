/**
 * 广告适配：抖音 + 微信小游戏
 */

import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('AdConfig')
export class AdConfig extends Component {
    public static readonly DOUYIN_AD_ID: string = 'so89260s57143ahcbc';
    private static readonly WECHAT_AD_ID: string = 'adunit-6a581caa226250fd';

    private static wxAd: any = null;
    private static wxAdCallback: ((success: boolean) => void) | null = null;
    private static wxAdOnCloseHook: (() => void) | null = null;
    private static wxAdSafetyTimer: any = null;
    private static wxAdDevtoolsFallbackTimer: any = null;
    private static wxAdShowing: boolean = false;
    private static wxOnShowRegistered: boolean = false;
    private static wxAdShownAt: number = 0;
    private static wxAdMinFallbackWatchMs: number = 0;

    private static isDouyinSimulator(tt: any): boolean {
        if (!tt) return false;
        try {
            const info = tt.getSystemInfoSync?.() || {};
            return info?.platform === 'devtools' || info?.environment === 'Simulator';
        } catch {
            return false;
        }
    }

    private static isWeChatDevtoolsRuntime(wx: any): boolean {
        if (!wx) return false;
        try {
            const info = wx.getDeviceInfo?.() || wx.getSystemInfoSync?.() || {};
            return info?.platform === 'devtools';
        } catch {
            return false;
        }
    }

    private static resolveWxAd(success: boolean) {
        if (!AdConfig.wxAdShowing) return;
        if (AdConfig.wxAdSafetyTimer) {
            clearTimeout(AdConfig.wxAdSafetyTimer);
            AdConfig.wxAdSafetyTimer = null;
        }
        if (AdConfig.wxAdDevtoolsFallbackTimer) {
            clearTimeout(AdConfig.wxAdDevtoolsFallbackTimer);
            AdConfig.wxAdDevtoolsFallbackTimer = null;
        }
        AdConfig.wxAdShowing = false;
        AdConfig.wxAdShownAt = 0;
        AdConfig.wxAdMinFallbackWatchMs = 0;
        const cb = AdConfig.wxAdCallback;
        AdConfig.wxAdCallback = null;
        if (cb) {
            console.log('[AdConfig] resolveWxAd, success:', success);
            cb(success);
        }
    }

    public static notifyGameResumed() {
        // 已移除兜底成功逻辑 — 不再按游戏恢复事件判定广告成功。
        // 保留此方法以免外部调用报错。
    }

    public static showRewardedAd(
        callback: (success: boolean) => void,
        hooks: { onShow?: () => void; onClose?: () => void; minFallbackWatchMs?: number } = {}
    ) {
        const tt = (window as any).tt;
        const wx = (window as any).wx || (typeof globalThis !== 'undefined' ? (globalThis as any).wx : null);

        if (tt?.createRewardedVideoAd) {
            const ad = tt.createRewardedVideoAd({ adUnitId: AdConfig.DOUYIN_AD_ID });
            let handled = false;
            let safetyTimer: any = null;
            const isSimulator = AdConfig.isDouyinSimulator(tt);
            const once = (result: boolean) => {
                if (handled) return;
                handled = true;
                if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
                callback(result);
            };
            ad.onClose((res: any) => {
                hooks.onClose?.();
                // 真机：isEnded === true 才算完整播放；提前关闭为 false
                // 模拟器：isEnded 可能为 undefined，onClose 即视为成功
                const success = isSimulator ? true : (res?.isEnded === true);
                once(success);
            });
            ad.onError((err: any) => {
                console.warn('[AdConfig] 抖音广告错误:', err);
                once(false);
            });
            safetyTimer = setTimeout(() => { once(false); }, 30000);
            ad.load().then(() => ad.show()).then(() => {
                hooks.onShow?.();
            }).catch((err: any) => {
                console.warn('[AdConfig] 抖音广告 load/show 失败:', err);
                once(false);
            });
            return;
        }

        if (wx?.createRewardedVideoAd) {
            console.log('[AdConfig] 微信广告 showRewardedAd');
            const isDevtools = AdConfig.isWeChatDevtoolsRuntime(wx);

            // 注册全局 onShow 监听：仅用于日志，不再触发兜底成功
            if (!AdConfig.wxOnShowRegistered && typeof wx.onShow === 'function') {
                AdConfig.wxOnShowRegistered = true;
                wx.onShow(() => {
                    if (!AdConfig.wxAdShowing) return;
                    console.log('[AdConfig] wx.onShow 触发, 广告正在展示中 — 等待 onClose 回调');
                });
            }

            if (!AdConfig.wxAd) {
                AdConfig.wxAd = wx.createRewardedVideoAd({ adUnitId: AdConfig.WECHAT_AD_ID });
                AdConfig.wxAd.onClose((res: any) => {
                    console.log('[AdConfig] onClose res:', JSON.stringify(res));
                    AdConfig.wxAdOnCloseHook?.();
                    AdConfig.wxAdOnCloseHook = null;
                    if (!AdConfig.wxAdShowing) return;
                    const hasEndedFlag = typeof res?.isEnded === 'boolean';
                    let success = false;
                    if (hasEndedFlag) {
                        // 真机和 devtools 只要给了明确结果，都严格按 isEnded 判定。
                        success = res.isEnded === true;
                    } else if (isDevtools) {
                        // devtools 某些版本不给 isEnded，这里退回到最短观看时长判定，尽量模拟真机。
                        const elapsedMs = AdConfig.wxAdShownAt > 0 ? Date.now() - AdConfig.wxAdShownAt : 0;
                        success = elapsedMs >= AdConfig.wxAdMinFallbackWatchMs;
                        console.log('[AdConfig] devtools onClose without isEnded, elapsedMs:', elapsedMs, 'minWatchMs:', AdConfig.wxAdMinFallbackWatchMs, 'success:', success);
                    }
                    AdConfig.resolveWxAd(success);
                });
                AdConfig.wxAd.onError((err: any) => {
                    console.warn('[AdConfig] onError:', JSON.stringify(err));
                    if (!AdConfig.wxAdShowing) return;
                    AdConfig.resolveWxAd(false);
                });
            }

            AdConfig.wxAdCallback = callback;
            AdConfig.wxAdOnCloseHook = hooks.onClose || null;
            AdConfig.wxAdShowing = true;
            AdConfig.wxAdShownAt = 0;
            AdConfig.wxAdMinFallbackWatchMs = Math.max(0, hooks.minFallbackWatchMs || 0);

            AdConfig.wxAdSafetyTimer = setTimeout(() => {
                console.warn('[AdConfig] 30s 超时，按成功兜底处理');
                AdConfig.resolveWxAd(true);
            }, 30000);

            const ad = AdConfig.wxAd;
            ad.load().then(() => {
                console.log('[AdConfig] load 成功, show');
                return ad.show();
            }).then(() => {
                AdConfig.wxAdShownAt = Date.now();
                hooks.onShow?.();
                console.log('[AdConfig] show() resolved，等待 onClose 回调');
                // 已移除真机的 post-show 兜底计时 — 不再在 show 后自动判定成功
            }).catch((err: any) => {
                console.warn('[AdConfig] load/show 失败:', JSON.stringify(err));
                AdConfig.resolveWxAd(false);
            });
            return;
        }

        console.log('[AdConfig] 非广告环境，直接成功');
        hooks.onShow?.();
        callback(true);
    }
}
