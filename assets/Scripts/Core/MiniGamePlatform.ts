type MiniGameApiName = 'wx' | 'tt';
export type MiniGameBuildPlatform = 'wechat' | 'douyin' | 'web';
export type WeChatGameClubButtonStyle = {
    left: number;
    top: number;
    width: number;
    height: number;
};

export type WeChatGameClubButtonHandle = {
    destroy?: () => void;
    hide?: () => void;
    show?: () => void;
    onTap?: (callback: (res?: any) => void) => void;
    offTap?: (callback?: (res?: any) => void) => void;
};

export type WeChatGameCircleButtonResult = {
    ok: boolean;
    message?: string;
    button?: WeChatGameClubButtonHandle;
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

function normalizeNativeButtonStyle(style: WeChatGameClubButtonStyle): WeChatGameClubButtonStyle | null {
    const left = Number(style?.left);
    const top = Number(style?.top);
    const width = Number(style?.width);
    const height = Number(style?.height);
    if (![left, top, width, height].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0) return null;
    return { left, top, width, height };
}

export function getWeChatMiniGameWindowSize(): { width: number; height: number } | null {
    const wxRuntime = getWeChatMiniGameRuntime();
    if (!wxRuntime) return null;
    try {
        const info = typeof wxRuntime.getWindowInfo === 'function'
            ? wxRuntime.getWindowInfo()
            : wxRuntime.getSystemInfoSync?.();
        const width = Number(info?.windowWidth || info?.screenWidth);
        const height = Number(info?.windowHeight || info?.screenHeight);
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            return { width, height };
        }
    } catch (error) {
        console.warn('[GameCircle] get window size failed:', error);
    }
    return null;
}

export function createWeChatGameCircleButton(
    openlink: string,
    style: WeChatGameClubButtonStyle,
    onTap?: (res?: any) => void,
): WeChatGameCircleButtonResult {
    const target = String(openlink || '').trim();
    if (!target) {
        return { ok: false, message: '游戏圈链接为空' };
    }
    const wxRuntime = getWeChatMiniGameRuntime();
    if (!wxRuntime) {
        return { ok: false, message: '请在微信内打开游戏圈' };
    }
    if (typeof wxRuntime.createGameClubButton !== 'function') {
        return { ok: false, message: '当前微信版本暂不支持游戏圈按钮' };
    }
    const nativeStyle = normalizeNativeButtonStyle(style);
    if (!nativeStyle) {
        return { ok: false, message: '游戏圈按钮位置无效' };
    }
    try {
        const button = wxRuntime.createGameClubButton({
            type: 'text',
            text: '',
            icon: 'green',
            style: {
                left: nativeStyle.left,
                top: nativeStyle.top,
                width: nativeStyle.width,
                height: nativeStyle.height,
                backgroundColor: 'rgba(0,0,0,0)',
                borderColor: 'rgba(0,0,0,0)',
                borderWidth: 0,
                borderRadius: Math.round(nativeStyle.height / 2),
                color: 'rgba(0,0,0,0)',
                textAlign: 'center',
                fontSize: 1,
                lineHeight: Math.round(nativeStyle.height),
            },
            openlink: target,
            hasRedDot: false,
        });
        if (!button) {
            return { ok: false, message: '游戏圈按钮创建失败' };
        }
        if (typeof onTap === 'function' && typeof button.onTap === 'function') {
            button.onTap(onTap);
        }
        button.show?.();
        return { ok: true, button };
    } catch (error) {
        return {
            ok: false,
            message: '游戏圈按钮创建失败，请稍后重试',
            rawError: error,
        };
    }
}

export function destroyWeChatGameCircleButton(button: WeChatGameClubButtonHandle | null | undefined): void {
    if (!button) return;
    try {
        button.hide?.();
    } catch (_) {}
    try {
        button.destroy?.();
    } catch (error) {
        console.warn('[GameCircle] destroy native button failed:', error);
    }
}
