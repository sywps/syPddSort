import type { LevelData } from './LevelConfig';

type LevelPackEntry = {
    id: string;
    url: string;
    hash?: string;
    levelRange: [number, number];
    levelCount: number;
    levels?: number[];
};

type LevelLiveManifest = {
    manifestVersion: number;
    dataVersion: string;
    schemaVersion: number;
    minClientBuild: number;
    levelCount: number;
    packs: LevelPackEntry[];
};

type LevelPack = {
    id: string;
    dataVersion?: string;
    levelRange: [number, number];
    levels: Array<{ levelId: number; data: LevelData }>;
};

function normalizeBaseUrl(value: unknown): string {
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? text.replace(/\/?$/, '/') : '';
}

function runtimeLevelDataBaseUrl(): string {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const w: any = typeof window !== 'undefined' ? window : null;
    return normalizeBaseUrl(g?.__PDD_LEVEL_DATA_CDN_URL__ || w?.__PDD_LEVEL_DATA_CDN_URL__);
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
    const n: any = typeof navigator !== 'undefined' ? navigator : null;
    const ua = String(n?.userAgent || '');
    return typeof g?.fetch === 'function' && !/MicroMessenger/i.test(ua);
}

function getPlatformRequester(): unknown {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const w: any = typeof window !== 'undefined' ? window : null;
    return g?.__rawWx?.request || g?.wx?.request || g?.tt?.request
        || w?.__rawWx?.request || w?.wx?.request || w?.tt?.request;
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

function canUseLevelDataCdn(baseUrl: string): boolean {
    if (!baseUrl) return false;
    const externalHttp = /^https?:\/\//i.test(baseUrl);
    const requester = getPlatformRequester();
    if (externalHttp && typeof requester !== 'function') return false;
    if (externalHttp && isBrowserBackedRequester(requester)) return false;
    return !((isLocalBrowserPreview() || isPlainBrowserRuntime()) && externalHttp);
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

export class RemoteLevelDataService {
    static readonly inst = new RemoteLevelDataService();

    private liveTextPromise: Promise<string> | null = null;
    private liveManifest: LevelLiveManifest | null = null;
    private readonly packPromises = new Map<string, Promise<LevelPack | null>>();

    prefetchLive(): void {
        if (!canUseLevelDataCdn(runtimeLevelDataBaseUrl()) || this.liveTextPromise) return;
        const promise = this.requestLiveText();
        this.liveTextPromise = promise;
        promise.catch((err) => {
            if (this.liveTextPromise === promise) this.liveTextPromise = null;
            console.warn('[LevelDataCDN] level_live.json prefetch failed:', err instanceof Error ? err.message : err);
        });
    }

    async loadLevel(levelId: number, prefix: string = 'level_'): Promise<LevelData | null> {
        const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
        if (prefix !== 'level_') return null;
        const manifest = await this.getLiveManifest();
        if (!manifest) return null;
        const packEntry = this.findPack(manifest, normalizedLevelId);
        if (!packEntry) return null;
        const pack = await this.loadPack(packEntry);
        if (!pack) return null;
        const level = pack.levels.find((entry) => entry.levelId === normalizedLevelId);
        return level ? level.data : null;
    }

    getDataVersion(): string {
        return this.liveManifest?.dataVersion || '';
    }

    private async getLiveManifest(): Promise<LevelLiveManifest | null> {
        const baseUrl = runtimeLevelDataBaseUrl();
        if (!canUseLevelDataCdn(baseUrl)) return null;
        if (!this.liveTextPromise) {
            this.liveTextPromise = this.requestLiveText();
        }
        try {
            if (!this.liveManifest) {
                const text = await this.liveTextPromise;
                this.liveManifest = this.validateLiveManifest(parseJsonText<LevelLiveManifest>(text, 'level_live.json'));
            }
            return this.liveManifest;
        } catch (err) {
            this.liveTextPromise = null;
            console.warn('[LevelDataCDN] level_live.json unavailable:', err instanceof Error ? err.message : err);
            return null;
        }
    }

    private requestLiveText(): Promise<string> {
        return requestText(withQuery(joinUrl(runtimeLevelDataBaseUrl(), 'level_live.json'), 't', String(Date.now())), 8000);
    }

    private validateLiveManifest(manifest: LevelLiveManifest): LevelLiveManifest {
        if (!manifest || !Array.isArray(manifest.packs)) {
            throw new Error('level_live.json packs missing');
        }
        if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== 1) {
            throw new Error('level_live.json schema unsupported');
        }
        return manifest;
    }

    private findPack(manifest: LevelLiveManifest, levelId: number): LevelPackEntry | null {
        for (const pack of manifest.packs) {
            const range = pack.levelRange;
            if (!Array.isArray(range) || range.length !== 2) continue;
            if (levelId >= Number(range[0]) && levelId <= Number(range[1])) {
                if (Array.isArray(pack.levels) && pack.levels.indexOf(levelId) === -1) continue;
                return pack;
            }
        }
        return null;
    }

    private async loadPack(packEntry: LevelPackEntry): Promise<LevelPack | null> {
        const baseUrl = runtimeLevelDataBaseUrl();
        if (!canUseLevelDataCdn(baseUrl)) return null;
        const cacheKey = packEntry.hash || packEntry.url;
        let promise = this.packPromises.get(cacheKey);
        if (!promise) {
            const url = packEntry.hash
                ? withQuery(joinUrl(baseUrl, packEntry.url), 'v', packEntry.hash.slice(0, 16))
                : joinUrl(baseUrl, packEntry.url);
            promise = requestText(url, 10000)
                .then((text) => this.validatePack(parseJsonText<LevelPack>(text, packEntry.url), packEntry))
                .catch((err) => {
                    this.packPromises.delete(cacheKey);
                    console.warn('[LevelDataCDN] pack unavailable:', packEntry.url, err instanceof Error ? err.message : err);
                    return null;
                });
            this.packPromises.set(cacheKey, promise);
        }
        return promise;
    }

    private validatePack(pack: LevelPack, packEntry: LevelPackEntry): LevelPack {
        if (!pack || !Array.isArray(pack.levels)) {
            throw new Error('pack levels missing');
        }
        if (pack.id !== packEntry.id) {
            throw new Error('pack id mismatch: ' + pack.id + ' != ' + packEntry.id);
        }
        return pack;
    }
}
