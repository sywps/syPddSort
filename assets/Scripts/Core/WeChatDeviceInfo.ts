type DeviceRuntime = {
    getDeviceInfo?: () => Record<string, unknown>;
    getSystemInfoSync?: () => Record<string, unknown>;
};

const deviceInfoCache = new WeakMap<DeviceRuntime, Readonly<Record<string, unknown>>>();
const DEVICE_FIELDS = ['platform', 'model', 'system', 'brand', 'environment', 'appName'] as const;

/** Session-stable fields only; window size, safe area and authorization state must stay live. */
export function getCachedWeChatDeviceInfo(api: DeviceRuntime | null | undefined): Readonly<Record<string, unknown>> {
    if (!api) throw new Error('[wechat-device-info] runtime unavailable');
    const cached = deviceInfoCache.get(api);
    if (cached) return cached;
    const read = typeof api.getDeviceInfo === 'function' ? api.getDeviceInfo : api.getSystemInfoSync;
    if (typeof read !== 'function') throw new Error('[wechat-device-info] device API unavailable');
    const raw = read.call(api);
    if (!raw || typeof raw !== 'object' || typeof raw.platform !== 'string' || !raw.platform) {
        throw new Error('[wechat-device-info] invalid device response');
    }
    const info: Record<string, unknown> = {};
    for (const key of DEVICE_FIELDS) {
        if (typeof raw[key] === 'string') info[key] = raw[key];
    }
    const snapshot = Object.freeze(info);
    deviceInfoCache.set(api, snapshot);
    return snapshot;
}
