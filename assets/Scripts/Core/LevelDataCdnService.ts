import type { LevelData } from './LevelConfig';
import { getFrontLevelExperimentDiagnostics, resolveFrontLevelExperimentContext } from './LevelExperimentService';
import { getMiniGameBuildPlatform, isDouyinMiniGameRuntime, isMiniGameRuntime, isWeChatMiniGameRuntime } from './MiniGamePlatform';
import {
    canUseCdn,
    getCdnPlatformRequester,
    getCdnUnavailableReason,
    isBrowserBackedRequester,
    isLocalBrowserCdnOptIn,
    joinCdnUrl,
    normalizeCdnBaseUrl,
    parseJsonText,
    readCdnStorageObject,
    requestCdnText,
    withCdnQuery,
    writeCdnStorageObject,
} from './RemoteDataCdnClient';
import { runtimeWarn } from './RuntimeLog';
import { LEVEL_DATA_SLOT_POLICY_MAX_ROWS, validateSlotPolicyConfig } from './SlotOnboardingPolicy';

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

export type LevelCollectionEntry = {
    levelId: number;
    prefix: string;
    unlockLevel: number;
};

type LevelLiveManifest = {
    manifestVersion: number;
    dataVersion: string;
    schemaVersion: number;
    minClientBuild: number;
    levelCount: number;
    collectionCatalogVersion?: number;
    collectionEntries?: unknown;
    packs: LevelPackEntry[];
};

type LevelPack = {
    id: string;
    kind?: string;
    prefix?: string;
    dataVersion?: string;
    schemaVersion: number;
    levelRange: [number, number];
    levels: Array<{ levelId: number; prefix?: string; data: LevelData }>;
};

type StoredLevelPackRecord = {
    key: string;
    hash: string;
    text: string;
    updatedAt: number;
};

type LevelDataManifestState = {
    textPromise: Promise<string> | null;
    manifest: LevelLiveManifest | null;
    unavailableUntil: number;
    unavailableReason: string;
};

type LevelDataCdnContext = {
    baseUrl: string;
    namespace: string;
};

type LevelDataLastFailure = {
    at: number;
    namespace: string;
    stage: string;
    reason: string;
    levelId: number;
    prefix: string;
};

const MAX_CACHED_LEVEL_PACKS = 1;
const MAX_PERSISTED_LEVEL_PACKS = 3;
const LIVE_MANIFEST_FAILURE_COOLDOWN_MS = 30000;
const LEVEL_DATA_CLIENT_BUILD = 2;
const LEVEL_DATA_SCHEMA_VERSION = 2;
const LEVEL_DATA_COMPAT_SCHEMA_VERSION = 1;
const COLLECTION_CATALOG_VERSION = 1;
const LEGACY_COLLECTION_CATALOG_MAIN_LEVEL_COUNT = 300;
const FOREGROUND_CDN_REQUEST_ATTEMPTS = 2;
const FOREGROUND_CDN_RETRY_DELAY_MS = 300;
const LEVEL_PACK_STORAGE_KEY = 'pdd.cdn.levelPackCache.v1';
const DEFAULT_LEVEL_PREFIX = 'level_';
const THEME_LEVEL_PREFIX = 'zt_level_';
const DEFAULT_WECHAT_LEVEL_DATA_CDN_URL = 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/';

function runtimeLevelDataBaseUrl(): string {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const w: any = typeof window !== 'undefined' ? window : null;
    const injected = normalizeCdnBaseUrl(g?.__PDD_LEVEL_DATA_CDN_URL__ || w?.__PDD_LEVEL_DATA_CDN_URL__);
    if (injected) return injected;
    return isLocalBrowserCdnOptIn() ? DEFAULT_WECHAT_LEVEL_DATA_CDN_URL : '';
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
    const sorted = Object.keys(records).map((key) => records[key]).sort((a, b) => b.updatedAt - a.updatedAt);
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

export function normalizeLevelCollectionEntries(value: unknown, label: string = 'collectionEntries'): LevelCollectionEntry[] {
    if (!Array.isArray(value) || value.length < 1) {
        throw new Error(label + ' missing');
    }
    const entries: LevelCollectionEntry[] = [];
    const seenKeys = new Set<string>();
    for (let index = 0; index < value.length; index++) {
        const raw = value[index] as Record<string, unknown> | null;
        const levelId = Number(raw?.levelId);
        const rawPrefix = String(raw?.prefix || '');
        const prefix = rawPrefix ? normalizeLevelPrefix(rawPrefix) : '';
        const unlockLevel = Number(raw?.unlockLevel);
        if (!Number.isInteger(levelId) || levelId < 1) {
            throw new Error(`${label}[${index}].levelId invalid`);
        }
        if (!prefix) {
            throw new Error(`${label}[${index}].prefix invalid`);
        }
        if (!Number.isInteger(unlockLevel) || unlockLevel < 1) {
            throw new Error(`${label}[${index}].unlockLevel invalid`);
        }
        const key = prefix + levelId;
        if (seenKeys.has(key)) {
            throw new Error(label + ' duplicate level key: ' + key);
        }
        seenKeys.add(key);
        entries.push({ levelId, prefix, unlockLevel });
    }
    return entries;
}

function hasCollectionCatalogField(manifest: LevelLiveManifest, key: 'collectionCatalogVersion' | 'collectionEntries'): boolean {
    return Object.prototype.hasOwnProperty.call(manifest, key);
}

export function resolveLevelCollectionEntries(manifest: LevelLiveManifest): LevelCollectionEntry[] {
    const hasVersion = hasCollectionCatalogField(manifest, 'collectionCatalogVersion');
    const hasEntries = hasCollectionCatalogField(manifest, 'collectionEntries');
    if (!hasVersion && !hasEntries) {
        return Array.from({ length: LEGACY_COLLECTION_CATALOG_MAIN_LEVEL_COUNT }, (_, index) => ({
            levelId: index + 1,
            prefix: DEFAULT_LEVEL_PREFIX,
            unlockLevel: index + 1,
        }));
    }
    if (!hasVersion || !hasEntries) {
        throw new Error('level_live.json collection catalog incomplete');
    }
    if (Number(manifest.collectionCatalogVersion) !== COLLECTION_CATALOG_VERSION) {
        throw new Error('level_live.json collectionCatalogVersion unsupported');
    }
    return normalizeLevelCollectionEntries(
        manifest.collectionEntries,
        'level_live.json collectionEntries',
    );
}

export class LevelDataCdnService {
    static readonly inst = new LevelDataCdnService();

    private readonly manifestStates = new Map<string, LevelDataManifestState>();
    private readonly packPromises = new Map<string, Promise<LevelPack | null>>();
    private readonly packUnavailableReasons = new Map<string, string>();
    private lastFailure: LevelDataLastFailure | null = null;

    prefetchLive(): void {
        const context = this.resolveCdnContext(0, DEFAULT_LEVEL_PREFIX);
        const state = this.getManifestState(context.namespace);
        if (state.manifest) return;
        if (!canUseCdn(context.baseUrl) || state.textPromise || this.isLiveManifestCoolingDown(state)) return;
        const promise = this.requestLiveText(context.baseUrl);
        state.textPromise = promise;
        promise.then((text) => {
            if (state.textPromise === promise) state.textPromise = null;
            try {
                state.manifest = this.validateLiveManifest(parseJsonText<LevelLiveManifest>(text, 'level_live.json'));
                this.clearLiveManifestUnavailable(state);
            } catch (err) {
                this.markLiveManifestUnavailable(state, 'level_live.json prefetch parse failed', err);
            }
        }).catch((err) => {
            if (state.textPromise === promise) state.textPromise = null;
            this.markLiveManifestUnavailable(state, 'level_live.json prefetch failed', err);
        });
    }

    async loadLevel(levelId: number, prefix: string = 'level_'): Promise<LevelData | null> {
        const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
        const normalizedPrefix = normalizeLevelPrefix(prefix);
        if (!normalizedPrefix) return null;
        const context = this.resolveCdnContext(normalizedLevelId, normalizedPrefix);
        this.lastFailure = null;
        return this.loadLevelFromContext(context, normalizedLevelId, normalizedPrefix, true);
    }

    async loadCollectionEntries(): Promise<LevelCollectionEntry[]> {
        const context: LevelDataCdnContext = {
            baseUrl: runtimeLevelDataBaseUrl(),
            namespace: 'stable',
        };
        this.lastFailure = null;
        const manifest = await this.getLiveManifest(context, true);
        if (!manifest) {
            const reason = this.describeManifestUnavailable(context);
            this.recordLoadFailure(context, 0, DEFAULT_LEVEL_PREFIX, 'collection_manifest', reason);
            throw new Error('collection catalog unavailable: ' + reason);
        }
        try {
            const usesLegacyCatalog = !hasCollectionCatalogField(manifest, 'collectionCatalogVersion')
                && !hasCollectionCatalogField(manifest, 'collectionEntries');
            const entries = resolveLevelCollectionEntries(manifest);
            if (usesLegacyCatalog) {
                runtimeWarn('[collection-catalog] legacy level_live.json detected; using v0 mainline compatibility catalog');
            }
            for (const entry of entries) {
                if (!this.findPack(manifest, entry.levelId, entry.prefix)) {
                    throw new Error('level_live.json collection entry missing pack: ' + entry.prefix + entry.levelId);
                }
            }
            return entries;
        } catch (error) {
            const reason = this.formatErrorReason(error);
            this.recordLoadFailure(context, 0, DEFAULT_LEVEL_PREFIX, 'collection_manifest', reason);
            throw error;
        }
    }

    private async loadLevelFromContext(
        context: LevelDataCdnContext,
        levelId: number,
        prefix: string,
        foregroundLoad: boolean,
    ): Promise<LevelData | null> {
        const manifest = await this.getLiveManifest(context, foregroundLoad);
        if (!manifest) {
            this.recordLoadFailure(context, levelId, prefix, 'manifest', this.describeManifestUnavailable(context));
            return null;
        }
        const packEntry = this.findPack(manifest, levelId, prefix);
        if (!packEntry) {
            this.recordLoadFailure(context, levelId, prefix, 'manifest_pack_missing', 'level pack index missing target level');
            return null;
        }
        const pack = await this.loadPack(context, packEntry, foregroundLoad);
        if (!pack) {
            const cacheKey = this.getPackCacheKey(context, packEntry);
            this.recordLoadFailure(context, levelId, prefix, 'pack', this.packUnavailableReasons.get(cacheKey) || 'level pack unavailable');
            return null;
        }
        const level = pack.levels.find((entry) => {
            if (entry.levelId !== levelId) return false;
            return this.getPackPrefix(entry.prefix ? { prefix: entry.prefix } : pack) === prefix;
        });
        if (level) return level.data;
        this.recordLoadFailure(context, levelId, prefix, 'pack_level_missing', 'target level missing from loaded pack');
        return null;
    }

    getDataVersion(): string {
        return this.manifestStates.get('stable')?.manifest?.dataVersion || '';
    }

    getAvailabilityDiagnostics(): Record<string, unknown> {
        const baseUrl = runtimeLevelDataBaseUrl();
        const stableState = this.getManifestState('stable');
        const requester = getCdnPlatformRequester();
        const reason = getCdnUnavailableReason(baseUrl);
        return {
            baseUrl,
            lastFailure: this.lastFailure,
            canUse: !reason,
            reason,
            localBrowserCdnOptIn: isLocalBrowserCdnOptIn(),
            platform: getMiniGameBuildPlatform(),
            wechatRuntime: isWeChatMiniGameRuntime(),
            douyinRuntime: isDouyinMiniGameRuntime(),
            miniGameRuntime: isMiniGameRuntime(),
            browserBackedRequester: isBrowserBackedRequester(requester),
            hasRequester: typeof requester === 'function',
            liveUnavailableCooldownMs: Math.max(0, stableState.unavailableUntil - Date.now()),
            liveUnavailableReason: stableState.unavailableReason,
            front10Experiment: getFrontLevelExperimentDiagnostics(),
        };
    }

    private async getLiveManifest(context: LevelDataCdnContext, foregroundLoad: boolean = false): Promise<LevelLiveManifest | null> {
        if (!canUseCdn(context.baseUrl)) return null;
        const state = this.getManifestState(context.namespace);
        if (state.manifest) return state.manifest;
        if (this.isLiveManifestCoolingDown(state) && !foregroundLoad) return null;
        const attempts = foregroundLoad ? FOREGROUND_CDN_REQUEST_ATTEMPTS : 1;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < attempts; attempt++) {
            if (!state.textPromise) {
                state.textPromise = this.requestLiveText(context.baseUrl);
            }
            const promise = state.textPromise;
            try {
                const text = await promise;
                if (state.textPromise === promise) state.textPromise = null;
                state.manifest = this.validateLiveManifest(parseJsonText<LevelLiveManifest>(text, 'level_live.json'));
                this.clearLiveManifestUnavailable(state);
                return state.manifest;
            } catch (err) {
                lastError = err;
                if (state.textPromise === promise) state.textPromise = null;
                if (attempt + 1 < attempts) {
                    await this.delay(FOREGROUND_CDN_RETRY_DELAY_MS);
                }
            }
        }
        this.markLiveManifestUnavailable(state, 'level_live.json unavailable', lastError);
        return null;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
    }

    private describeManifestUnavailable(context: LevelDataCdnContext): string {
        const reason = getCdnUnavailableReason(context.baseUrl);
        if (reason) return reason;
        const state = this.getManifestState(context.namespace);
        return state.unavailableReason || 'level_live.json unavailable';
    }

    private recordLoadFailure(
        context: LevelDataCdnContext,
        levelId: number,
        prefix: string,
        stage: string,
        reason: string,
    ): void {
        this.lastFailure = {
            at: Date.now(),
            namespace: context.namespace,
            stage,
            reason: reason || 'unknown level data CDN error',
            levelId,
            prefix,
        };
    }

    private formatErrorReason(err: unknown): string {
        return err instanceof Error ? err.message : String(err || 'unknown error');
    }

    private isLiveManifestCoolingDown(state: LevelDataManifestState): boolean {
        return Date.now() < state.unavailableUntil;
    }

    private markLiveManifestUnavailable(state: LevelDataManifestState, label: string, err: unknown): void {
        const reason = this.formatErrorReason(err);
        const now = Date.now();
        const shouldWarn = now >= state.unavailableUntil || state.unavailableReason !== reason;
        state.unavailableReason = reason;
        state.unavailableUntil = now + LIVE_MANIFEST_FAILURE_COOLDOWN_MS;
        if (shouldWarn) {
            runtimeWarn(`[LevelDataCDN] ${label}:`, reason);
        }
    }

    private clearLiveManifestUnavailable(state: LevelDataManifestState): void {
        state.unavailableReason = '';
        state.unavailableUntil = 0;
    }

    private requestLiveText(baseUrl: string): Promise<string> {
        return requestCdnText(withCdnQuery(joinCdnUrl(baseUrl, 'level_live.json'), 't', String(Date.now())), 8000);
    }

    private validateLiveManifest(manifest: LevelLiveManifest): LevelLiveManifest {
        if (!manifest || !Array.isArray(manifest.packs)) {
            throw new Error('level_live.json packs missing');
        }
        if (manifest.manifestVersion !== 1
            || (manifest.schemaVersion !== LEVEL_DATA_SCHEMA_VERSION && manifest.schemaVersion !== LEVEL_DATA_COMPAT_SCHEMA_VERSION)) {
            throw new Error('level_live.json schema unsupported');
        }
        if (!manifest.dataVersion || typeof manifest.dataVersion !== 'string') {
            throw new Error('level_live.json dataVersion missing');
        }
        if (!Number.isFinite(Number(manifest.minClientBuild)) || Number(manifest.minClientBuild) < 1) {
            throw new Error('level_live.json minClientBuild invalid');
        }
        if (Number(manifest.minClientBuild) > LEVEL_DATA_CLIENT_BUILD) {
            throw new Error('level_live.json minClientBuild unsupported: ' + manifest.minClientBuild);
        }
        if (!Number.isFinite(Number(manifest.levelCount)) || Number(manifest.levelCount) <= 0) {
            throw new Error('level_live.json levelCount invalid');
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

    private async loadPack(context: LevelDataCdnContext, packEntry: LevelPackEntry, foregroundLoad: boolean = false): Promise<LevelPack | null> {
        const baseUrl = context.baseUrl;
        if (!canUseCdn(baseUrl)) return null;
        const cacheKey = this.getPackCacheKey(context, packEntry);
        let promise = this.packPromises.get(cacheKey);
        if (!promise) {
            const url = packEntry.hash
                ? withCdnQuery(joinCdnUrl(baseUrl, packEntry.url), 'v', packEntry.hash.slice(0, 16))
                : joinCdnUrl(baseUrl, packEntry.url);
            const cachedText = readPersistedLevelPack(cacheKey, packEntry.hash || '');
            const parsePackText = (text: string): LevelPack => this.validatePack(parseJsonText<LevelPack>(text, packEntry.url), packEntry);
            const loadRemotePack = async (): Promise<LevelPack> => {
                const attempts = foregroundLoad ? FOREGROUND_CDN_REQUEST_ATTEMPTS : 1;
                let lastError: unknown = null;
                for (let attempt = 0; attempt < attempts; attempt++) {
                    try {
                        const text = await requestCdnText(url, 10000);
                        const pack = parsePackText(text);
                        writePersistedLevelPack(cacheKey, packEntry.hash || '', text);
                        this.packUnavailableReasons.delete(cacheKey);
                        return pack;
                    } catch (err) {
                        lastError = err;
                        if (attempt + 1 < attempts) {
                            await this.delay(FOREGROUND_CDN_RETRY_DELAY_MS);
                        }
                    }
                }
                throw lastError;
            };
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
                    this.packUnavailableReasons.delete(cacheKey);
                    this.trimPackCache(cacheKey);
                    return pack;
                })
                .catch((err) => {
                    this.packPromises.delete(cacheKey);
                    const reason = this.formatErrorReason(err);
                    this.packUnavailableReasons.set(cacheKey, reason);
                    runtimeWarn('[LevelDataCDN] pack unavailable:', packEntry.url, reason);
                    return null;
                });
            this.packPromises.set(cacheKey, promise);
        }
        return promise;
    }

    private getPackCacheKey(context: LevelDataCdnContext, packEntry: LevelPackEntry): string {
        return context.namespace + ':' + packEntry.id + ':' + this.getPackPrefix(packEntry) + ':' + (packEntry.hash || packEntry.url);
    }

    private getManifestState(namespace: string): LevelDataManifestState {
        const key = namespace || 'stable';
        let state = this.manifestStates.get(key);
        if (!state) {
            state = {
                textPromise: null,
                manifest: null,
                unavailableUntil: 0,
                unavailableReason: '',
            };
            this.manifestStates.set(key, state);
        }
        return state;
    }

    private resolveCdnContext(levelId: number, prefix: string): LevelDataCdnContext {
        const experiment = resolveFrontLevelExperimentContext(levelId, prefix);
        if (experiment?.variant === 'exp') {
            return {
                baseUrl: experiment.baseUrl,
                namespace: experiment.namespace,
            };
        }
        return {
            baseUrl: runtimeLevelDataBaseUrl(),
            namespace: 'stable',
        };
    }

    private validatePack(pack: LevelPack, packEntry: LevelPackEntry): LevelPack {
        if (!pack || !Array.isArray(pack.levels)) {
            throw new Error('pack levels missing');
        }
        if (pack.id !== packEntry.id) {
            throw new Error('pack id mismatch: ' + pack.id + ' != ' + packEntry.id);
        }
        if (pack.schemaVersion !== LEVEL_DATA_SCHEMA_VERSION && pack.schemaVersion !== LEVEL_DATA_COMPAT_SCHEMA_VERSION) {
            throw new Error('pack schema unsupported: ' + pack.schemaVersion);
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
            if (!entry?.data || typeof entry.data !== 'object') {
                throw new Error('pack level data missing: ' + key);
            }
            if (Math.max(1, Math.floor(Number(entry.data.levelId) || 1)) !== entryLevelId) {
                throw new Error('pack level data id mismatch: ' + key);
            }
            validateSlotPolicyConfig(entry.data.slotPolicy, LEVEL_DATA_SLOT_POLICY_MAX_ROWS);
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
