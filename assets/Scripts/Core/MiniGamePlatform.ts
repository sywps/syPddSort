type MiniGameApiName = 'wx' | 'tt';
export type MiniGameBuildPlatform = 'wechat' | 'douyin' | 'web';
export type WeChatGameClubButtonStyle = {
    left: number;
    top: number;
    width: number;
    height: number;
};

export type WeChatMiniGameWindowInfo = {
    width: number;
    height: number;
    pixelRatio?: number;
    sdkVersion?: string;
    platform?: string;
    safeArea?: {
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
        width?: number;
        height?: number;
    };
};

export type WeChatGameClubButtonHandle = {
    destroy?: () => void;
    hide?: () => void;
    show?: () => void;
    onTap?: (callback: (res?: any) => void) => void;
    offTap?: (callback?: (res?: any) => void) => void;
};

export type WeChatGameCircleButtonResult = {
    button: WeChatGameClubButtonHandle;
    style: WeChatGameClubButtonStyle;
    sdkVersion?: string;
    platform?: string;
    openlink?: string;
};

declare const wx: any;
declare const tt: any;

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

function getDirectDouyinRuntime(): any {
    try {
        return typeof tt !== 'undefined' ? tt : null;
    } catch (_) {
        return null;
    }
}

export function getMiniGameApi(name: MiniGameApiName): any {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    const scoped = getScopeValue(globalScope, name) || getScopeValue(windowScope, name);
    if (scoped) return scoped;
    if (name === 'tt') return getDirectDouyinRuntime();
    if (name === 'wx') return getDirectWxRuntime();
    return null;
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

function normalizeMiniGamePlatform(value: unknown): MiniGameBuildPlatform | '' {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'wechat' || normalized === 'weixin' || normalized === 'wx') return 'wechat';
    if (normalized === 'douyin' || normalized === 'tt' || normalized === 'bytedance') return 'douyin';
    if (normalized === 'web' || normalized === 'browser') return 'web';
    return '';
}

function getBrowserPreviewPlatformParam(): MiniGameBuildPlatform | '' {
    try {
        const windowScope = getWindowScope();
        const search = String(windowScope?.location?.search || '');
        if (!search) return '';
        const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
        return normalizeMiniGamePlatform(params.get('platform'));
    } catch (_) {
        return '';
    }
}

export function getMiniGameBuildPlatform(): MiniGameBuildPlatform {
    if (hasDouyinBuildMarker()) return 'douyin';
    if (hasWeChatBuildMarker()) return 'wechat';
    const previewPlatform = getBrowserPreviewPlatformParam();
    if (previewPlatform) return previewPlatform;
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
    const wxRuntime = getWeChatRuntimeCandidate();
    return typeof wxRuntime?.request === 'function'
        && !!(wxRuntime?.getSystemInfoSync || wxRuntime?.getDeviceInfo || wxRuntime?.cloud || wxRuntime?.getStorageSync);
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

function normalizeNativeButtonStyle(
    style: WeChatGameClubButtonStyle,
    windowInfo?: WeChatMiniGameWindowInfo | null,
): WeChatGameClubButtonStyle | null {
    const left = Number(style?.left);
    const top = Number(style?.top);
    const width = Number(style?.width);
    const height = Number(style?.height);
    if (![left, top, width, height].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0) return null;
    const minSize = 44;
    const normalizedWidth = Math.max(minSize, width);
    const normalizedHeight = Math.max(minSize, height);
    const maxWidth = Number(windowInfo?.width) || 0;
    const maxHeight = Number(windowInfo?.height) || 0;
    if (maxWidth > 0 && maxHeight > 0) {
        const clampedWidth = Math.min(normalizedWidth, maxWidth);
        const clampedHeight = Math.min(normalizedHeight, maxHeight);
        return {
            left: Math.max(0, Math.min(Math.round(left), Math.max(0, Math.round(maxWidth - clampedWidth)))),
            top: Math.max(0, Math.min(Math.round(top), Math.max(0, Math.round(maxHeight - clampedHeight)))),
            width: Math.max(1, Math.round(clampedWidth)),
            height: Math.max(1, Math.round(clampedHeight)),
        };
    }
    return {
        left: Math.max(0, Math.round(left)),
        top: Math.max(0, Math.round(top)),
        width: Math.round(normalizedWidth),
        height: Math.round(normalizedHeight),
    };
}

export function getWeChatMiniGameWindowInfo(): WeChatMiniGameWindowInfo {
    const wxRuntime = getWeChatMiniGameRuntime();
    if (!wxRuntime) throw new Error('[GameCircle] wx runtime is unavailable');
    if (typeof wxRuntime.getWindowInfo !== 'function') {
        throw new Error('[GameCircle] wx.getWindowInfo is unavailable');
    }
    const info = wxRuntime.getWindowInfo();
    const width = Number(info?.windowWidth);
    const height = Number(info?.windowHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error(`[GameCircle] invalid wx.getWindowInfo result: windowWidth=${String(info?.windowWidth)}, windowHeight=${String(info?.windowHeight)}`);
    }
    return {
        width,
        height,
        pixelRatio: Number(info?.pixelRatio) || undefined,
        sdkVersion: typeof info?.SDKVersion === 'string' ? info.SDKVersion : undefined,
        platform: typeof info?.platform === 'string' ? info.platform : undefined,
        safeArea: info?.safeArea,
    };
}

export function getWeChatMiniGameWindowSize(): { width: number; height: number } {
    const info = getWeChatMiniGameWindowInfo();
    return { width: info.width, height: info.height };
}

export function createWeChatGameCircleButton(
    openlink: string,
    style: WeChatGameClubButtonStyle,
    onTap?: (res?: any) => void,
): WeChatGameCircleButtonResult {
    const target = String(openlink || '').trim();
    const wxRuntime = getWeChatMiniGameRuntime();
    if (!wxRuntime) {
        throw new Error('[GameCircle] wx runtime is unavailable');
    }
    if (typeof wxRuntime.createGameClubButton !== 'function') {
        throw new Error('[GameCircle] wx.createGameClubButton is unavailable');
    }
    const windowInfo = getWeChatMiniGameWindowInfo();
    const nativeStyle = normalizeNativeButtonStyle(style, windowInfo);
    if (!nativeStyle) {
        throw new Error(`[GameCircle] invalid native button style: left=${String(style?.left)}, top=${String(style?.top)}, width=${String(style?.width)}, height=${String(style?.height)}`);
    }
    const options: any = {
        type: 'text',
        text: '进入游戏圈',
        style: {
            left: nativeStyle.left,
            top: nativeStyle.top,
            width: nativeStyle.width,
            height: nativeStyle.height,
            backgroundColor: 'rgba(0, 0, 0, 0)',
            borderColor: 'rgba(0, 0, 0, 0)',
            borderWidth: 0,
            borderRadius: 0,
            color: 'rgba(0, 0, 0, 0)',
            textAlign: 'center',
            fontSize: 1,
            lineHeight: Math.round(nativeStyle.height),
        },
        hasRedDot: false,
    };
    if (target) options.openlink = target;
    const button = wxRuntime.createGameClubButton(options);
    if (!button || typeof button.show !== 'function') {
        throw new Error('[GameCircle] wx.createGameClubButton did not return a valid button');
    }
    if (typeof onTap === 'function') {
        if (typeof button.onTap !== 'function') {
            throw new Error('[GameCircle] GameClubButton.onTap is unavailable');
        }
        button.onTap(onTap);
    }
    button.show();
    return {
        button,
        style: nativeStyle,
        sdkVersion: windowInfo.sdkVersion,
        platform: windowInfo.platform,
        openlink: target,
    };
}

export function destroyWeChatGameCircleButton(button: WeChatGameClubButtonHandle | null | undefined): void {
    if (!button) return;
    button.hide?.();
    if (typeof button.destroy !== 'function') {
        throw new Error('[GameCircle] GameClubButton.destroy is unavailable');
    }
    button.destroy();
}
