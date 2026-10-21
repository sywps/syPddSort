/** Runtime version, not build flags, determines production analytics eligibility. */
export function isOfficialAnalyticsRuntime(wx: any): boolean {
    try {
        if (!wx || wx.getAccountInfoSync?.()?.miniProgram?.envVersion !== 'release') return false;
        const info = wx.getDeviceInfo?.() || wx.getSystemInfoSync?.();
        const platform = String(info?.platform || '').toLowerCase();
        // WeChat uses ohos for HarmonyOS phones and ohos_pc for HarmonyOS PCs.
        return ['android', 'ios', 'ohos', 'ohos_pc', 'windows', 'mac'].includes(platform);
    } catch (_) { return false; }
}

export const CSD_MEASUREMENT_VERSION = 3;
