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
    kind: 'background' | 'thumbnail' | 'icon' | string;
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
        thumbnail?: SkinRemoteAsset;
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
        if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== 1) {
            throw new Error('skin_live.json schema unsupported');
        }
        if (!manifest.skinDataVersion || typeof manifest.skinDataVersion !== 'string') {
            throw new Error('skin_live.json skinDataVersion missing');
        }
        if (!Number.isFinite(Number(manifest.minClientBuild)) || Number(manifest.minClientBuild) < 1) {
            throw new Error('skin_live.json minClientBuild invalid');
        }
        if (!Array.isArray(manifest.skins) || manifest.skins.length === 0) {
            throw new Error('skin_live.json skins missing');
        }
        if (manifest.skinCount !== manifest.skins.length) {
            throw new Error('skin_live.json skinCount mismatch');
        }
        const seenIds = new Set<number>();
        const seenUrls = new Set<string>();
        let assetCount = 0;
        const validateAssetBase = (skinId: number, asset: SkinRemoteAsset | undefined, label: string): SkinRemoteAsset => {
            if (!asset) throw new Error(`skin_live.json missing ${label} asset: ${skinId}`);
            if (Number(asset.skinId) !== skinId) throw new Error(`skin_live.json asset skinId mismatch: ${skinId}/${label}`);
            if (typeof asset.url !== 'string' || !asset.url.startsWith('assets/')) throw new Error(`skin_live.json asset url invalid: ${skinId}/${label}`);
            if (seenUrls.has(asset.url)) throw new Error(`skin_live.json asset url duplicated: ${asset.url}`);
            seenUrls.add(asset.url);
            if (!asset.hash || typeof asset.hash !== 'string') throw new Error(`skin_live.json asset hash missing: ${asset.url}`);
            if (!Number.isFinite(Number(asset.bytes)) || Number(asset.bytes) <= 0) throw new Error(`skin_live.json asset bytes invalid: ${asset.url}`);
            if (!Number.isFinite(Number(asset.width)) || Number(asset.width) <= 0) throw new Error(`skin_live.json asset width invalid: ${asset.url}`);
            if (!Number.isFinite(Number(asset.height)) || Number(asset.height) <= 0) throw new Error(`skin_live.json asset height invalid: ${asset.url}`);
            if (asset.format && !/^(png|jpe?g)$/i.test(String(asset.format))) throw new Error(`skin_live.json asset format unsupported: ${asset.url}`);
            assetCount += 1;
            return asset;
        };
        const validateBackgroundAsset = (skinId: number, asset: SkinRemoteAsset | undefined): void => {
            const validated = validateAssetBase(skinId, asset, 'background');
            if (validated.kind !== 'background') throw new Error(`skin_live.json asset kind mismatch: ${skinId}/background`);
        };
        const validatePreviewAsset = (skinId: number, asset: SkinRemoteAsset | undefined): void => {
            const validated = validateAssetBase(skinId, asset, 'thumbnail');
            if (validated.kind !== 'thumbnail' && validated.kind !== 'icon') {
                throw new Error(`skin_live.json asset kind mismatch: ${skinId}/thumbnail`);
            }
        };
        for (const skin of manifest.skins) {
            const id = Math.floor(Number(skin?.id) || 0);
            if (id <= 0) throw new Error('skin_live.json skin.id invalid');
            if (seenIds.has(id)) throw new Error(`skin_live.json skin.id duplicated: ${id}`);
            seenIds.add(id);
            if (skin.type !== 'background') throw new Error(`skin_live.json skin.type unsupported: ${id}`);
            if (!skin.code || typeof skin.code !== 'string') throw new Error(`skin_live.json skin.code missing: ${id}`);
            if (skin.enabled === false) throw new Error(`skin_live.json disabled skin row is not publishable: ${id}`);
            validateBackgroundAsset(id, skin.assets?.background);
            validatePreviewAsset(id, skin.assets?.thumbnail || skin.assets?.icon);
        }
        if (manifest.assetCount !== assetCount) {
            throw new Error(`skin_live.json assetCount mismatch: ${manifest.assetCount} != ${assetCount}`);
        }
        if (manifest.defaultEquipped !== undefined && !seenIds.has(Math.floor(Number(manifest.defaultEquipped) || 0))) {
            throw new Error('skin_live.json defaultEquipped missing from skins');
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
