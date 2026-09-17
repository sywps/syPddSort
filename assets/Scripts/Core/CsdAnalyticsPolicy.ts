/** Runtime version, not build flags, determines production analytics eligibility. */
export function isOfficialAnalyticsRuntime(wx: any): boolean {
    try {
        if (!wx || wx.getAccountInfoSync?.()?.miniProgram?.envVersion !== 'release') return false;
        const info = wx.getDeviceInfo?.() || wx.getSystemInfoSync?.();
        const platform = String(info?.platform || '').toLowerCase();
        return ['android', 'ios', 'windows', 'mac'].includes(platform);
    } catch (_) { return false; }
}

export const CSD_MEASUREMENT_VERSION = 3;
