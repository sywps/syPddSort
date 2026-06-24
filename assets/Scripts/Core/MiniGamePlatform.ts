type MiniGameApiName = 'wx' | 'tt';
export type MiniGameBuildPlatform = 'wechat' | 'douyin' | 'web';
export type WeChatGameCircleOpenResult = {
    ok: boolean;
    message?: string;
    errorCode?: number;
    rawError?: unknown;
};

declare const wx: any;

function getScopeValue(scope: any, name: string): any {
    return scope && Object.prototype.hasOwnProperty.call(scope, name) ? scope[name] : null;
}

function getGlobalScope(): any {
    return typeof globalThis !== 'undefined' ? globalThis : null;
}

function getWindowScope(): any {
    return typeof window !== 'undefined' ? window : null;
}

function getDirectWxRuntime(): any {
    try {
        return typeof wx !== 'undefined' ? wx : null;
    } catch (_) {
        return null;
    }
}

export function getMiniGameApi(name: MiniGameApiName): any {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    return getScopeValue(globalScope, name) || getScopeValue(windowScope, name) || null;
}

export function hasDouyinBuildMarker(): boolean {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    return !!(
        globalScope?.__PDD_DOUYIN_BUILD__
        || windowScope?.__PDD_DOUYIN_BUILD__
        || globalScope?.__PDD_BUILD_PLATFORM__ === 'douyin'
        || windowScope?.__PDD_BUILD_PLATFORM__ === 'douyin'
    );
}

export function hasWeChatBuildMarker(): boolean {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    return !!(
        globalScope?.__PDD_WECHAT_BUILD__
        || windowScope?.__PDD_WECHAT_BUILD__
        || globalScope?.__PDD_BUILD_PLATFORM__ === 'wechat'
        || windowScope?.__PDD_BUILD_PLATFORM__ === 'wechat'
    );
}

export function getMiniGameBuildPlatform(): MiniGameBuildPlatform {
    if (hasDouyinBuildMarker()) return 'douyin';
    if (hasWeChatBuildMarker()) return 'wechat';
    return 'web';
}

export function isDouyinMiniGameRuntime(): boolean {
    const buildPlatform = getMiniGameBuildPlatform();
    if (buildPlatform === 'wechat') return false;
    if (buildPlatform === 'douyin') return true;
    return !!getMiniGameApi('tt');
}

export function isWeChatMiniGameRuntime(): boolean {
    const buildPlatform = getMiniGameBuildPlatform();
    if (buildPlatform === 'douyin') return false;
    if (buildPlatform === 'wechat') return true;
    const wxRuntime = getWeChatRuntimeCandidate();
    return !!(wxRuntime?.getSystemInfoSync || wxRuntime?.getDeviceInfo || wxRuntime?.cloud);
}

export function getMiniGameBuildMode(): string {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    return String(
        globalScope?.__PDD_WECHAT_BUILD_MODE__
        || windowScope?.__PDD_WECHAT_BUILD_MODE__
        || globalScope?.__PDD_DOUYIN_BUILD_MODE__
        || windowScope?.__PDD_DOUYIN_BUILD_MODE__
        || ''
    );
}

export function isMiniGameRuntime(): boolean {
    return isWeChatMiniGameRuntime() || isDouyinMiniGameRuntime();
}

function getWeChatRuntimeCandidate(): any {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    return globalScope?.__rawWx
        || getDirectWxRuntime()
        || windowScope?.wx
        || globalScope?.wx
        || null;
}

export function getWeChatMiniGameRuntime(): any {
    return isWeChatMiniGameRuntime() ? getWeChatRuntimeCandidate() : null;
}

export function getDouyinMiniGameRuntime(): any {
    return getMiniGameApi('tt');
}

function getWeChatOpenPageErrorCode(error: any): number | undefined {
    const direct = Number(error?.errCode ?? error?.code ?? error?.errno);
    if (Number.isFinite(direct)) return direct;
    const message = String(error?.errMsg || error?.message || error?.errInfo || error || '');
    const match = /(?:^|[^\d-])(-\d+)(?:[^\d]|$)/.exec(message);
    if (!match) return undefined;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function getWeChatGameCircleErrorMessage(errorCode?: number): string {
    switch (errorCode) {
        case -1: return '游戏圈链接无效，请检查配置';
        case -2: return '当前微信版本暂不支持游戏圈跳转';
        case -3: return '当前设备暂不支持游戏圈';
        case -6: return '网络异常，请稍后重试';
        case -7: return '操作过于频繁，请稍后再试';
        case -8: return '游戏圈链接与当前小游戏版本不匹配';
        default: return '游戏圈打开失败，请稍后重试';
    }
}

export async function openWeChatGameCircle(openlink: string): Promise<WeChatGameCircleOpenResult> {
    const target = String(openlink || '').trim();
    if (!target) {
        return { ok: false, message: '游戏圈链接为空' };
    }
    const wxRuntime = getWeChatMiniGameRuntime();
    if (!wxRuntime) {
        return { ok: false, message: '请在微信内打开游戏圈' };
    }
    if (typeof wxRuntime.createPageManager !== 'function') {
        return { ok: false, message: '当前微信版本暂不支持游戏圈跳转' };
    }
    try {
        const pageManager = wxRuntime.createPageManager();
        if (!pageManager || typeof pageManager.load !== 'function' || typeof pageManager.show !== 'function') {
            return { ok: false, message: '当前微信版本暂不支持游戏圈跳转' };
        }
        await Promise.resolve(pageManager.load({ openlink: target }));
        pageManager.show();
        return { ok: true };
    } catch (error) {
        const errorCode = getWeChatOpenPageErrorCode(error);
        return {
            ok: false,
            errorCode,
            message: getWeChatGameCircleErrorMessage(errorCode),
            rawError: error,
        };
    }
}
