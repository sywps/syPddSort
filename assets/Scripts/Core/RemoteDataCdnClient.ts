import {
    getDouyinMiniGameRuntime,
    getMiniGameBuildPlatform,
    getWeChatMiniGameRuntime,
    isMiniGameRuntime,
} from './MiniGamePlatform';

export function normalizeCdnBaseUrl(value: unknown): string {
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? text.replace(/\/?$/, '/') : '';
}

export function isLocalBrowserPreview(): boolean {
    const candidates: string[] = [];
    const w: any = typeof window !== 'undefined' ? window : null;
    const d: any = typeof document !== 'undefined' ? document : null;
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    try { candidates.push(String(w?.location?.hostname || '')); } catch (_) {}
    try { candidates.push(String(g?.location?.hostname || '')); } catch (_) {}
    try { candidates.push(String(w?.parent?.location?.hostname || '')); } catch (_) {}
    try { candidates.push(String(d?.referrer || '')); } catch (_) {}
    try { if (String(g?.location?.protocol || w?.location?.protocol || '') === 'about:') return true; } catch (_) {}
    return candidates.some((value) => /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::|\/|$)/i.test(value));
}

export function isLocalBrowserCdnOptIn(): boolean {
    if (!isLocalBrowserPreview()) return false;
    const w: any = typeof window !== 'undefined' ? window : null;
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const search = String(w?.location?.search || g?.location?.search || '');
    if (!search) return false;
    try {
        const params = new URLSearchParams(search);
        const value = String(params.get('use_cdn') || params.get('useCdn') || '').trim().toLowerCase();
        return value === 'true' || value === '1' || value === 'yes';
    } catch (_) {
        return false;
    }
}

export function isPlainBrowserRuntime(): boolean {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    return typeof g?.fetch === 'function' && !isMiniGameRuntime();
}

export function getCdnPlatformObject(): any {
    const buildPlatform = getMiniGameBuildPlatform();
    if (buildPlatform === 'douyin') return getDouyinMiniGameRuntime();
    if (buildPlatform === 'wechat') return getWeChatMiniGameRuntime();
    return getWeChatMiniGameRuntime() || getDouyinMiniGameRuntime();
}

export function getCdnPlatformRequester(): unknown {
    return getCdnPlatformObject()?.request;
}

export function isBrowserBackedRequester(requester: unknown): boolean {
    if (typeof requester !== 'function') return false;
    try {
        const text = Function.prototype.toString.call(requester);
        return /\bfetch\b|XMLHttpRequest/i.test(text);
    } catch (_) {
        return false;
    }
}

export function getCdnUnavailableReason(baseUrl: string): string {
    if (!baseUrl) return 'cdn_url_missing';
    const externalHttp = /^https?:\/\//i.test(baseUrl);
    const requester = getCdnPlatformRequester();
    const miniGameRuntime = isMiniGameRuntime();
    if ((isLocalBrowserPreview() || isPlainBrowserRuntime()) && externalHttp && !miniGameRuntime && !isLocalBrowserCdnOptIn()) return 'local_browser_external_cdn_disabled';
    if (externalHttp && miniGameRuntime && typeof requester !== 'function') return 'platform_request_unavailable';
    if (externalHttp && isBrowserBackedRequester(requester) && !miniGameRuntime && !isLocalBrowserCdnOptIn()) return 'browser_backed_requester';
    return '';
}

export function canUseCdn(baseUrl: string): boolean {
    return !getCdnUnavailableReason(baseUrl);
}

export function joinCdnUrl(baseUrl: string, filePath: string): string {
    return normalizeCdnBaseUrl(baseUrl) + String(filePath || '').replace(/^\/+/, '');
}

export function withCdnQuery(url: string, key: string, value: string): string {
    const joiner = url.indexOf('?') === -1 ? '?' : '&';
    return url + joiner + encodeURIComponent(key) + '=' + encodeURIComponent(value);
}

export function parseJsonText<T>(text: string, label: string): T {
    try {
        return JSON.parse(text) as T;
    } catch (err) {
        throw new Error(label + ' JSON parse failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}

export function readCdnStorageObject(key: string): any {
    const platform = getCdnPlatformObject();
    try {
        if (platform && typeof platform.getStorageSync === 'function') {
            const raw = platform.getStorageSync(key);
            if (!raw) return null;
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        }
    } catch (_) {}
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    try {
        const raw = g?.localStorage?.getItem?.(key);
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

export function writeCdnStorageObject(key: string, value: unknown): void {
    const text = JSON.stringify(value);
    const platform = getCdnPlatformObject();
    try {
        if (platform && typeof platform.setStorageSync === 'function') {
            platform.setStorageSync(key, text);
            return;
        }
    } catch (_) {}
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    try {
        g?.localStorage?.setItem?.(key, text);
    } catch (_) {}
}

export function requestCdnText(url: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
        const requester = getCdnPlatformRequester();
        if (typeof requester === 'function') {
            requester({
                url,
                method: 'GET',
                timeout: timeoutMs,
                success: (res: any) => {
                    const statusCode = Number(res?.statusCode || 0);
                    if (statusCode && (statusCode < 200 || statusCode >= 300)) {
                        reject(new Error('HTTP ' + statusCode));
                        return;
                    }
                    const data = res?.data;
                    resolve(typeof data === 'string' ? data : JSON.stringify(data));
                },
                fail: (error: any) => reject(error instanceof Error ? error : new Error(error?.errMsg || 'request failed')),
            });
            return;
        }
        const fetcher = g?.fetch;
        if (typeof fetcher === 'function') {
            fetcher(url, { cache: 'no-store' })
                .then((response: any) => {
                    if (!response || !response.ok) {
                        throw new Error('HTTP ' + (response ? response.status : 0));
                    }
                    return response.text();
                })
                .then(resolve)
                .catch(reject);
            return;
        }
        reject(new Error('No request API'));
    });
}
