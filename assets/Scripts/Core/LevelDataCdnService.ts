import type { LevelData } from './LevelConfig';
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

type LevelPackEntry = {
    id: string;
    kind?: string;
    prefix?: string;
    url: string;
    hash?: string;
    levelRange: [number, number];
    levelCount: number;
    levels?: Array<number | { levelId: number; prefix?: string }>;
    levelKeys?: string[];
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
    kind?: string;
    prefix?: string;
    dataVersion?: string;
    levelRange: [number, number];
    levels: Array<{ levelId: number; prefix?: string; data: LevelData }>;
};

type StoredLevelPackRecord = {
    key: string;
    hash: string;
    text: string;
    updatedAt: number;
};

const MAX_CACHED_LEVEL_PACKS = 1;
const MAX_PERSISTED_LEVEL_PACKS = 3;
const LIVE_MANIFEST_FAILURE_COOLDOWN_MS = 30000;
const LEVEL_PACK_STORAGE_KEY = 'pdd.cdn.levelPackCache.v1';
const DEFAULT_LEVEL_PREFIX = 'level_';
const THEME_LEVEL_PREFIX = 'zt_level_';

function runtimeLevelDataBaseUrl(): string {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const w: any = typeof window !== 'undefined' ? window : null;
    return normalizeCdnBaseUrl(g?.__PDD_LEVEL_DATA_CDN_URL__ || w?.__PDD_LEVEL_DATA_CDN_URL__);
}

function readPersistedLevelPack(cacheKey: string, hash: string): string {
    if (!hash) return '';
    const store = readCdnStorageObject(LEVEL_PACK_STORAGE_KEY);
    const record = store?.records?.[cacheKey] as StoredLevelPackRecord | undefined;
    if (!record || record.hash !== hash || typeof record.text !== 'string') return '';
    return record.text;
}

function writePersistedLevelPack(cacheKey: string, hash: string, text: string): void {
    if (!hash || !text) return;
    const store = readCdnStorageObject(LEVEL_PACK_STORAGE_KEY) || {};
    const records: Record<string, StoredLevelPackRecord> = store.records && typeof store.records === 'object'
        ? store.records
        : {};
    records[cacheKey] = {
        key: cacheKey,
        hash,
        text,
        updatedAt: Date.now(),
    };
    const sorted = Object.values(records).sort((a, b) => b.updatedAt - a.updatedAt);
    for (const stale of sorted.slice(MAX_PERSISTED_LEVEL_PACKS)) {
        delete records[stale.key];
    }
    writeCdnStorageObject(LEVEL_PACK_STORAGE_KEY, { version: 1, records });
}

function removePersistedLevelPack(cacheKey: string): void {
    const store = readCdnStorageObject(LEVEL_PACK_STORAGE_KEY);
    const records: Record<string, StoredLevelPackRecord> | null = store?.records && typeof store.records === 'object'
        ? store.records
        : null;
    if (!records || !records[cacheKey]) return;
    delete records[cacheKey];
    writeCdnStorageObject(LEVEL_PACK_STORAGE_KEY, { version: 1, records });
}

function normalizeLevelPrefix(prefix: string): string {
    if (!prefix || prefix === DEFAULT_LEVEL_PREFIX) return DEFAULT_LEVEL_PREFIX;
    if (prefix === THEME_LEVEL_PREFIX) return THEME_LEVEL_PREFIX;
    return '';
}

export class LevelDataCdnService {
    static readonly inst = new LevelDataCdnService();

    private liveTextPromise: Promise<string> | null = null;
    private liveManifest: LevelLiveManifest | null = null;
    private liveUnavailableUntil = 0;
    private liveUnavailableReason = '';
    private readonly packPromises = new Map<string, Promise<LevelPack | null>>();

    prefetchLive(): void {
        if (this.liveManifest) return;
        if (!canUseCdn(runtimeLevelDataBaseUrl()) || this.liveTextPromise || this.isLiveManifestCoolingDown()) return;
        const promise = this.requestLiveText();
        this.liveTextPromise = promise;
        promise.then((text) => {
            if (this.liveTextPromise === promise) this.liveTextPromise = null;
            try {
                this.liveManifest = this.validateLiveManifest(parseJsonText<LevelLiveManifest>(text, 'level_live.json'));
                this.clearLiveManifestUnavailable();
            } catch (err) {
                this.markLiveManifestUnavailable('level_live.json prefetch parse failed', err);
            }
        }).catch((err) => {
            if (this.liveTextPromise === promise) this.liveTextPromise = null;
            this.markLiveManifestUnavailable('level_live.json prefetch failed', err);
        });
    }

    async loadLevel(levelId: number, prefix: string = 'level_'): Promise<LevelData | null> {
        const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
        const normalizedPrefix = normalizeLevelPrefix(prefix);
        if (!normalizedPrefix) return null;
        const manifest = await this.getLiveManifest();
        if (!manifest) return null;
        const packEntry = this.findPack(manifest, normalizedLevelId, normalizedPrefix);
        if (!packEntry) return null;
        const pack = await this.loadPack(packEntry);
        if (!pack) return null;
        const level = pack.levels.find((entry) => {
            if (entry.levelId !== normalizedLevelId) return false;
            return this.getPackPrefix(entry.prefix ? { prefix: entry.prefix } : pack) === normalizedPrefix;
        });
        return level ? level.data : null;
    }

    getDataVersion(): string {
        return this.liveManifest?.dataVersion || '';
    }

    getAvailabilityDiagnostics(): Record<string, unknown> {
        const baseUrl = runtimeLevelDataBaseUrl();
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

    private async getLiveManifest(): Promise<LevelLiveManifest | null> {
        const baseUrl = runtimeLevelDataBaseUrl();
        if (!canUseCdn(baseUrl)) return null;
        if (this.liveManifest) return this.liveManifest;
        if (this.isLiveManifestCoolingDown()) return null;
        if (!this.liveTextPromise) {
            this.liveTextPromise = this.requestLiveText();
        }
        try {
            const text = await this.liveTextPromise;
            this.liveManifest = this.validateLiveManifest(parseJsonText<LevelLiveManifest>(text, 'level_live.json'));
            this.clearLiveManifestUnavailable();
            return this.liveManifest;
        } catch (err) {
            this.liveTextPromise = null;
            this.markLiveManifestUnavailable('level_live.json unavailable', err);
            return null;
        }
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
            runtimeWarn(`[LevelDataCDN] ${label}:`, reason);
        }
    }

    private clearLiveManifestUnavailable(): void {
        this.liveUnavailableReason = '';
        this.liveUnavailableUntil = 0;
    }

    private requestLiveText(): Promise<string> {
        return requestCdnText(withCdnQuery(joinCdnUrl(runtimeLevelDataBaseUrl(), 'level_live.json'), 't', String(Date.now())), 8000);
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

    private findPack(manifest: LevelLiveManifest, levelId: number, prefix: string): LevelPackEntry | null {
        for (const pack of manifest.packs) {
            const packPrefix = this.getPackPrefix(pack);
            if (packPrefix !== prefix) continue;
            const range = pack.levelRange;
            if (!Array.isArray(range) || range.length !== 2) continue;
            if (levelId >= Number(range[0]) && levelId <= Number(range[1])) {
                if (Array.isArray(pack.levelKeys) && pack.levelKeys.indexOf(this.getLevelKey(levelId, prefix)) === -1) continue;
                if (Array.isArray(pack.levels) && !this.packLevelListContains(pack.levels, levelId, prefix, packPrefix)) continue;
                return pack;
            }
        }
        return null;
    }

    private async loadPack(packEntry: LevelPackEntry): Promise<LevelPack | null> {
        const baseUrl = runtimeLevelDataBaseUrl();
        if (!canUseCdn(baseUrl)) return null;
        const cacheKey = packEntry.id + ':' + this.getPackPrefix(packEntry) + ':' + (packEntry.hash || packEntry.url);
        let promise = this.packPromises.get(cacheKey);
        if (!promise) {
            const url = packEntry.hash
                ? withCdnQuery(joinCdnUrl(baseUrl, packEntry.url), 'v', packEntry.hash.slice(0, 16))
                : joinCdnUrl(baseUrl, packEntry.url);
            const cachedText = readPersistedLevelPack(cacheKey, packEntry.hash || '');
            const parsePackText = (text: string): LevelPack => this.validatePack(parseJsonText<LevelPack>(text, packEntry.url), packEntry);
            const loadRemotePack = () => requestCdnText(url, 10000).then((text) => {
                const pack = parsePackText(text);
                writePersistedLevelPack(cacheKey, packEntry.hash || '', text);
                return pack;
            });
            promise = (cachedText
                ? Promise.resolve().then(() => {
                    try {
                        return parsePackText(cachedText);
                    } catch (cacheErr) {
                        removePersistedLevelPack(cacheKey);
                        runtimeWarn('[LevelDataCDN] persisted pack invalid, refetching:', packEntry.url, cacheErr instanceof Error ? cacheErr.message : cacheErr);
                        return loadRemotePack();
                    }
                })
                : loadRemotePack())
                .then((pack) => {
                    this.trimPackCache(cacheKey);
                    return pack;
                })
                .catch((err) => {
                    this.packPromises.delete(cacheKey);
                    runtimeWarn('[LevelDataCDN] pack unavailable:', packEntry.url, err instanceof Error ? err.message : err);
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
        const expectedPrefix = this.getPackPrefix(packEntry);
        const actualPrefix = this.getPackPrefix(pack);
        if (actualPrefix !== expectedPrefix) {
            throw new Error('pack prefix mismatch: ' + actualPrefix + ' != ' + expectedPrefix);
        }
        const seenKeys = new Set<string>();
        for (const entry of pack.levels) {
            const entryLevelId = Math.max(1, Math.floor(Number(entry?.levelId) || 1));
            const entryPrefix = this.getPackPrefix(entry?.prefix ? { prefix: entry.prefix } : pack);
            if (entryPrefix !== expectedPrefix) {
                throw new Error('pack entry prefix mismatch: ' + entryPrefix + ' != ' + expectedPrefix);
            }
            const key = this.getLevelKey(entryLevelId, entryPrefix);
            if (seenKeys.has(key)) {
                throw new Error('pack duplicate level key: ' + key);
            }
            seenKeys.add(key);
        }
        return pack;
    }

    private getPackPrefix(pack: { prefix?: string } | null | undefined): string {
        return normalizeLevelPrefix(pack?.prefix || DEFAULT_LEVEL_PREFIX) || DEFAULT_LEVEL_PREFIX;
    }

    private getLevelKey(levelId: number, prefix: string): string {
        return prefix + Math.max(1, Math.floor(Number(levelId) || 1));
    }

    private packLevelListContains(
        levels: Array<number | { levelId: number; prefix?: string }>,
        levelId: number,
        prefix: string,
        packPrefix: string,
    ): boolean {
        return levels.some((entry) => {
            if (typeof entry === 'number') {
                return packPrefix === prefix && entry === levelId;
            }
            const entryLevelId = Math.max(1, Math.floor(Number(entry?.levelId) || 1));
            const entryPrefix = this.getPackPrefix(entry?.prefix ? { prefix: entry.prefix } : { prefix: packPrefix });
            return entryLevelId === levelId && entryPrefix === prefix;
        });
    }

    private trimPackCache(keepKey: string): void {
        while (this.packPromises.size > MAX_CACHED_LEVEL_PACKS) {
            const oldestKey = this.packPromises.keys().next().value;
            if (!oldestKey) return;
            if (oldestKey === keepKey) {
                const promise = this.packPromises.get(oldestKey);
                this.packPromises.delete(oldestKey);
                if (promise) this.packPromises.set(oldestKey, promise);
                continue;
            }
            this.packPromises.delete(oldestKey);
        }
    }
}
