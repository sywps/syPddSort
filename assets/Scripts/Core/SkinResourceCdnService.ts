import {
    getDouyinMiniGameRuntime,
    getMiniGameBuildPlatform,
    getWeChatMiniGameRuntime,
    isDouyinMiniGameRuntime,
    isMiniGameRuntime,
    isWeChatMiniGameRuntime,
} from './MiniGamePlatform';

export type SkinRemoteAsset = {
    skinId: number;
    kind: 'background' | 'icon' | string;
    url: string;
    hash: string;
    bytes?: number;
    width?: number;
    height?: number;
    format?: string;
};

export type SkinLiveRow = {
    id: number;
    shortId?: number;
    type: 'background' | string;
    code: string;
    name?: string;
    isDefault?: boolean;
    unlockType?: string;
    price?: number;
    sort?: number;
    enabled?: boolean;
    assetBundle?: string;
    assetKey?: string;
    iconBundle?: string;
    iconKey?: string;
    assets?: {
        background?: SkinRemoteAsset;
        icon?: SkinRemoteAsset;
        [key: string]: SkinRemoteAsset | undefined;
    };
};

export type SkinLiveManifest = {
    manifestVersion: number;
    skinDataVersion: string;
    schemaVersion: number;
    minClientBuild: number;
    defaultEquipped?: number;
    skinCount?: number;
    assetCount?: number;
    skins: SkinLiveRow[];
};

const LIVE_MANIFEST_FAILURE_COOLDOWN_MS = 30000;

function normalizeBaseUrl(value: unknown): string {
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? text.replace(/\/?$/, '/') : '';
}

function deriveSkinDataBaseUrl(levelDataBaseUrl: string): string {
    const normalized = normalizeBaseUrl(levelDataBaseUrl);
    if (!normalized) return '';
    if (/\/levels\/$/i.test(normalized)) return normalized.replace(/\/levels\/$/i, '/skin/');
    return normalizeBaseUrl(normalized + 'skin/');
}

function runtimeSkinDataBaseUrl(): string {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const w: any = typeof window !== 'undefined' ? window : null;
    const explicit = normalizeBaseUrl(g?.__PDD_SKIN_DATA_CDN_URL__ || w?.__PDD_SKIN_DATA_CDN_URL__);
    if (explicit) return explicit;
    return deriveSkinDataBaseUrl(normalizeBaseUrl(g?.__PDD_LEVEL_DATA_CDN_URL__ || w?.__PDD_LEVEL_DATA_CDN_URL__));
}

function isLocalBrowserPreview(): boolean {
    const candidates: string[] = [];
    const w: any = typeof window !== 'undefined' ? window : null;
    const d: any = typeof document !== 'undefined' ? document : null;
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    try { candidates.push(String(w?.location?.hostname || '')); } catch (err) {}
    try { candidates.push(String(g?.location?.hostname || '')); } catch (err) {}
    try { candidates.push(String(w?.parent?.location?.hostname || '')); } catch (err) {}
    try { candidates.push(String(d?.referrer || '')); } catch (err) {}
    try { if (String(g?.location?.protocol || w?.location?.protocol || '') === 'about:') return true; } catch (err) {}
    return candidates.some((value) => /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::|\/|$)/i.test(value));
}

function isPlainBrowserRuntime(): boolean {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    return typeof g?.fetch === 'function' && !isMiniGameRuntime();
}

function getPlatformObject(): any {
    const buildPlatform = getMiniGameBuildPlatform();
    if (buildPlatform === 'douyin') return getDouyinMiniGameRuntime();
    if (buildPlatform === 'wechat') return getWeChatMiniGameRuntime();
    return getWeChatMiniGameRuntime() || getDouyinMiniGameRuntime();
}

function getPlatformRequester(): unknown {
    return getPlatformObject()?.request;
}

function isBrowserBackedRequester(requester: unknown): boolean {
    if (typeof requester !== 'function') return false;
    try {
        const text = Function.prototype.toString.call(requester);
        return /\bfetch\b|XMLHttpRequest/i.test(text);
    } catch (err) {
        return false;
    }
}

function getSkinDataCdnUnavailableReason(baseUrl: string): string {
    if (!baseUrl) return 'cdn_url_missing';
    const externalHttp = /^https?:\/\//i.test(baseUrl);
    const requester = getPlatformRequester();
    const miniGameRuntime = isMiniGameRuntime();
    if ((isLocalBrowserPreview() || isPlainBrowserRuntime()) && externalHttp && !miniGameRuntime) return 'local_browser_external_cdn_disabled';
    if (externalHttp && miniGameRuntime && typeof requester !== 'function') return 'platform_request_unavailable';
    if (externalHttp && isBrowserBackedRequester(requester) && !miniGameRuntime) return 'browser_backed_requester';
    return '';
}

function canUseSkinDataCdn(baseUrl: string): boolean {
    return !getSkinDataCdnUnavailableReason(baseUrl);
}

function joinUrl(baseUrl: string, filePath: string): string {
    return normalizeBaseUrl(baseUrl) + String(filePath || '').replace(/^\/+/, '');
}

function withQuery(url: string, key: string, value: string): string {
    const joiner = url.indexOf('?') === -1 ? '?' : '&';
    return url + joiner + encodeURIComponent(key) + '=' + encodeURIComponent(value);
}

function parseJsonText<T>(text: string, label: string): T {
    try {
        return JSON.parse(text) as T;
    } catch (err) {
        throw new Error(label + ' JSON parse failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}

function requestText(url: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
        const requester = getPlatformRequester();
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

export class SkinResourceCdnService {
    static readonly inst = new SkinResourceCdnService();

    private liveTextPromise: Promise<string> | null = null;
    private liveManifest: SkinLiveManifest | null = null;
    private liveUnavailableUntil = 0;
    private liveUnavailableReason = '';

    prefetchLive(): void {
        if (!canUseSkinDataCdn(runtimeSkinDataBaseUrl()) || this.liveTextPromise || this.isLiveManifestCoolingDown()) return;
        const promise = this.requestLiveText();
        this.liveTextPromise = promise;
        promise.catch((err) => {
            if (this.liveTextPromise === promise) this.liveTextPromise = null;
            this.markLiveManifestUnavailable('skin_live.json prefetch failed', err);
        });
    }

    async loadManifest(): Promise<SkinLiveManifest | null> {
        const baseUrl = runtimeSkinDataBaseUrl();
        if (!canUseSkinDataCdn(baseUrl)) return null;
        if (this.liveManifest) return this.liveManifest;
        if (this.isLiveManifestCoolingDown()) return null;
        if (!this.liveTextPromise) {
            this.liveTextPromise = this.requestLiveText();
        }
        try {
            const text = await this.liveTextPromise;
            this.liveManifest = this.validateLiveManifest(parseJsonText<SkinLiveManifest>(text, 'skin_live.json'));
            this.clearLiveManifestUnavailable();
            return this.liveManifest;
        } catch (err) {
            this.liveTextPromise = null;
            this.markLiveManifestUnavailable('skin_live.json unavailable', err);
            return null;
        }
    }

    getAssetUrl(asset: SkinRemoteAsset | null | undefined): string {
        const baseUrl = runtimeSkinDataBaseUrl();
        if (!baseUrl || !asset?.url) return '';
        const url = joinUrl(baseUrl, asset.url);
        return asset.hash ? withQuery(url, 'v', asset.hash.slice(0, 16)) : url;
    }

    getDataVersion(): string {
        return this.liveManifest?.skinDataVersion || '';
    }

    getAvailabilityDiagnostics(): Record<string, unknown> {
        const baseUrl = runtimeSkinDataBaseUrl();
        const requester = getPlatformRequester();
        const reason = getSkinDataCdnUnavailableReason(baseUrl);
        return {
            baseUrl,
            canUse: !reason,
            reason,
            platform: getMiniGameBuildPlatform(),
            wechatRuntime: isWeChatMiniGameRuntime(),
            douyinRuntime: isDouyinMiniGameRuntime(),
            miniGameRuntime: isMiniGameRuntime(),
            browserBackedRequester: isBrowserBackedRequester(requester),
            hasRequester: typeof requester === 'function',
            liveUnavailableCooldownMs: Math.max(0, this.liveUnavailableUntil - Date.now()),
            liveUnavailableReason: this.liveUnavailableReason,
        };
    }

    private requestLiveText(): Promise<string> {
        return requestText(withQuery(joinUrl(runtimeSkinDataBaseUrl(), 'skin_live.json'), 't', String(Date.now())), 8000);
    }

    private validateLiveManifest(manifest: SkinLiveManifest): SkinLiveManifest {
        if (!manifest || !Array.isArray(manifest.skins)) {
            throw new Error('skin_live.json skins missing');
        }
        if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== 1) {
            throw new Error('skin_live.json schema unsupported');
        }
        if (!manifest.skinDataVersion) {
            throw new Error('skin_live.json skinDataVersion missing');
        }
        return manifest;
    }

    private isLiveManifestCoolingDown(): boolean {
        return Date.now() < this.liveUnavailableUntil;
    }

    private markLiveManifestUnavailable(label: string, err: unknown): void {
        const reason = err instanceof Error ? err.message : String(err || 'unknown error');
        const now = Date.now();
        const shouldWarn = now >= this.liveUnavailableUntil || this.liveUnavailableReason !== reason;
        this.liveUnavailableReason = reason;
        this.liveUnavailableUntil = now + LIVE_MANIFEST_FAILURE_COOLDOWN_MS;
        if (shouldWarn) {
            console.warn(`[SkinCDN] ${label}:`, reason);
        }
    }

    private clearLiveManifestUnavailable(): void {
        this.liveUnavailableReason = '';
        this.liveUnavailableUntil = 0;
    }
}
