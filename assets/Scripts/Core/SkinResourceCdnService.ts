import { getMiniGameBuildPlatform, isDouyinMiniGameRuntime, isMiniGameRuntime, isWeChatMiniGameRuntime } from './MiniGamePlatform';
import {
    canUseCdn,
    getCdnPlatformRequester,
    getCdnUnavailableReason,
    isBrowserBackedRequester,
    joinCdnUrl,
    normalizeCdnBaseUrl,
    parseJsonText,
    readCdnStorageObject,
    requestCdnText,
    withCdnQuery,
    writeCdnStorageObject,
} from './RemoteDataCdnClient';
import { runtimeWarn } from './RuntimeLog';

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
    unlockValue?: number;
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
const LIVE_MANIFEST_REFRESH_TTL_MS = 5 * 60 * 1000;
const SKIN_LIVE_MANIFEST_STORAGE_KEY = 'pdd.cdn.skinLiveManifest.v1';

function deriveSkinDataBaseUrl(levelDataBaseUrl: string): string {
    const normalized = normalizeCdnBaseUrl(levelDataBaseUrl);
    if (!normalized) return '';
    if (/\/levels\/$/i.test(normalized)) return normalized.replace(/\/levels\/$/i, '/skin/');
    return normalizeCdnBaseUrl(normalized + 'skin/');
}

function runtimeSkinDataBaseUrl(): string {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const w: any = typeof window !== 'undefined' ? window : null;
    const explicit = normalizeCdnBaseUrl(g?.__PDD_SKIN_DATA_CDN_URL__ || w?.__PDD_SKIN_DATA_CDN_URL__);
    if (explicit) return explicit;
    return deriveSkinDataBaseUrl(normalizeCdnBaseUrl(g?.__PDD_LEVEL_DATA_CDN_URL__ || w?.__PDD_LEVEL_DATA_CDN_URL__));
}

export class SkinResourceCdnService {
    static readonly inst = new SkinResourceCdnService();

    private liveTextPromise: Promise<string> | null = null;
    private liveManifest: SkinLiveManifest | null = null;
    private liveManifestBaseUrl = '';
    private liveManifestUpdatedAt = 0;
    private liveUnavailableUntil = 0;
    private liveUnavailableReason = '';

    prefetchLive(options: { force?: boolean } = {}): void {
        const baseUrl = runtimeSkinDataBaseUrl();
        if (!canUseCdn(baseUrl) || this.liveTextPromise || this.isLiveManifestCoolingDown()) return;
        if (!options.force && this.isLiveManifestFresh(baseUrl)) return;
        const promise = this.requestLiveText();
        this.liveTextPromise = promise;
        promise.then((text) => {
            if (this.liveTextPromise === promise) this.liveTextPromise = null;
            try {
                const manifest = this.validateLiveManifest(parseJsonText<SkinLiveManifest>(text, 'skin_live.json'));
                this.liveManifest = manifest;
                this.liveManifestBaseUrl = baseUrl;
                this.liveManifestUpdatedAt = Date.now();
                this.writePersistedLiveManifest(baseUrl, manifest);
                this.clearLiveManifestUnavailable();
            } catch (err) {
                this.markLiveManifestUnavailable('skin_live.json prefetch parse failed', err);
            }
        }).catch((err) => {
            if (this.liveTextPromise === promise) this.liveTextPromise = null;
            this.markLiveManifestUnavailable('skin_live.json prefetch failed', err);
        });
    }

    async loadManifest(): Promise<SkinLiveManifest | null> {
        const baseUrl = runtimeSkinDataBaseUrl();
        if (!canUseCdn(baseUrl)) return null;
        if (this.liveManifest && normalizeCdnBaseUrl(this.liveManifestBaseUrl) === normalizeCdnBaseUrl(baseUrl) && this.isLiveManifestFresh(baseUrl)) return this.liveManifest;
        const persisted = this.readPersistedLiveManifest(baseUrl);
        if (persisted && this.isPersistedLiveManifestFresh(persisted.updatedAt)) {
            this.liveManifest = persisted.manifest;
            this.liveManifestBaseUrl = baseUrl;
            this.liveManifestUpdatedAt = persisted.updatedAt;
            return persisted.manifest;
        }
        if (this.isLiveManifestCoolingDown()) return null;
        if (!this.liveTextPromise) {
            this.liveTextPromise = this.requestLiveText();
        }
        try {
            const text = await this.liveTextPromise;
            this.liveTextPromise = null;
            this.liveManifest = this.validateLiveManifest(parseJsonText<SkinLiveManifest>(text, 'skin_live.json'));
            this.liveManifestBaseUrl = baseUrl;
            this.liveManifestUpdatedAt = Date.now();
            this.writePersistedLiveManifest(baseUrl, this.liveManifest);
            this.clearLiveManifestUnavailable();
            return this.liveManifest;
        } catch (err) {
            this.liveTextPromise = null;
            this.markLiveManifestUnavailable('skin_live.json unavailable', err);
            if (persisted) {
                this.liveManifest = persisted.manifest;
                this.liveManifestBaseUrl = baseUrl;
                this.liveManifestUpdatedAt = persisted.updatedAt;
                return persisted.manifest;
            }
            return null;
        }
    }

    getAssetUrl(asset: SkinRemoteAsset | null | undefined): string {
        const baseUrl = runtimeSkinDataBaseUrl();
        if (!baseUrl || !asset?.url) return '';
        const url = joinCdnUrl(baseUrl, asset.url);
        return asset.hash ? withCdnQuery(url, 'v', asset.hash.slice(0, 16)) : url;
    }

    getDataVersion(): string {
        return this.liveManifest?.skinDataVersion || '';
    }

    getAvailabilityDiagnostics(): Record<string, unknown> {
        const baseUrl = runtimeSkinDataBaseUrl();
        const requester = getCdnPlatformRequester();
        const reason = getCdnUnavailableReason(baseUrl);
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
        return requestCdnText(withCdnQuery(joinCdnUrl(runtimeSkinDataBaseUrl(), 'skin_live.json'), 't', String(Date.now())), 8000);
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

    private readPersistedLiveManifest(baseUrl: string): { manifest: SkinLiveManifest; updatedAt: number } | null {
        const stored = readCdnStorageObject(SKIN_LIVE_MANIFEST_STORAGE_KEY);
        if (!stored || stored.version !== 1) return null;
        if (normalizeCdnBaseUrl(stored.baseUrl) !== normalizeCdnBaseUrl(baseUrl)) return null;
        try {
            return {
                manifest: this.validateLiveManifest(stored.manifest as SkinLiveManifest),
                updatedAt: Math.max(0, Math.floor(Number(stored.updatedAt) || 0)),
            };
        } catch (err) {
            return null;
        }
    }

    private writePersistedLiveManifest(baseUrl: string, manifest: SkinLiveManifest): void {
        writeCdnStorageObject(SKIN_LIVE_MANIFEST_STORAGE_KEY, {
            version: 1,
            baseUrl: normalizeCdnBaseUrl(baseUrl),
            updatedAt: Date.now(),
            skinDataVersion: manifest.skinDataVersion || '',
            manifest,
        });
    }

    private isLiveManifestCoolingDown(): boolean {
        return Date.now() < this.liveUnavailableUntil;
    }

    private isLiveManifestFresh(baseUrl: string): boolean {
        if (!this.liveManifest) return false;
        if (normalizeCdnBaseUrl(this.liveManifestBaseUrl) !== normalizeCdnBaseUrl(baseUrl)) return false;
        return this.isPersistedLiveManifestFresh(this.liveManifestUpdatedAt);
    }

    private isPersistedLiveManifestFresh(updatedAt: number): boolean {
        return updatedAt > 0 && Date.now() - updatedAt < LIVE_MANIFEST_REFRESH_TTL_MS;
    }

    private markLiveManifestUnavailable(label: string, err: unknown): void {
        const reason = err instanceof Error ? err.message : String(err || 'unknown error');
        const now = Date.now();
        const shouldWarn = now >= this.liveUnavailableUntil || this.liveUnavailableReason !== reason;
        this.liveUnavailableReason = reason;
        this.liveUnavailableUntil = now + LIVE_MANIFEST_FAILURE_COOLDOWN_MS;
        if (shouldWarn) {
            runtimeWarn(`[SkinCDN] ${label}:`, reason);
        }
    }

    private clearLiveManifestUnavailable(): void {
        this.liveUnavailableReason = '';
        this.liveUnavailableUntil = 0;
    }
}
