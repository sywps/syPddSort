type MiniGameApiName = 'wx' | 'tt';
export type MiniGameBuildPlatform = 'wechat' | 'douyin' | 'web';

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
