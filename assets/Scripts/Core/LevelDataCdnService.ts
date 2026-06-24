import type { LevelData } from './LevelConfig';
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

type LevelDataManifestState = {
    textPromise: Promise<string> | null;
    manifest: LevelLiveManifest | null;
    unavailableUntil: number;
    unavailableReason: string;
};

export type LevelExperimentBucket = 'A' | 'B' | 'C' | 'D';

export type LevelExperimentAssignment = {
    experimentId: string;
    experimentSalt: string;
    bucket: LevelExperimentBucket;
    group: 'baseline' | 'treatment';
    source: 'url' | 'local';
};

type LevelDataCdnContext = {
    baseUrl: string;
    namespace: string;
    assignment: LevelExperimentAssignment;
    experimentActive: boolean;
};

const MAX_CACHED_LEVEL_PACKS = 1;
const MAX_PERSISTED_LEVEL_PACKS = 3;
const LIVE_MANIFEST_FAILURE_COOLDOWN_MS = 30000;
const LEVEL_PACK_STORAGE_KEY = 'pdd.cdn.levelPackCache.v1';
const LEVEL_EXP_ASSIGNMENT_STORAGE_KEY = 'pdd.levelExp.assignment.v1';
const LEVEL_EXP_INSTALL_ID_STORAGE_KEY = 'pdd.levelExp.installId.v1';
const DEFAULT_LEVEL_PREFIX = 'level_';
const THEME_LEVEL_PREFIX = 'zt_level_';
const LEVEL_EXPERIMENT_ID = 'level_exp';
const LEVEL_EXPERIMENT_SALT = 'level_exp_0623';
const DEFAULT_WECHAT_LEVEL_DATA_CDN_URL = 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/';

function runtimeLevelDataBaseUrl(): string {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const w: any = typeof window !== 'undefined' ? window : null;
    const injected = normalizeCdnBaseUrl(g?.__PDD_LEVEL_DATA_CDN_URL__ || w?.__PDD_LEVEL_DATA_CDN_URL__);
    if (injected) return injected;
    return isLocalBrowserCdnOptIn() ? DEFAULT_WECHAT_LEVEL_DATA_CDN_URL : '';
}

function runtimeLevelExperimentBaseUrl(stableBaseUrl: string): string {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const w: any = typeof window !== 'undefined' ? window : null;
    const forced = normalizeCdnBaseUrl(g?.__PDD_LEVEL_EXP_CDN_URL__ || w?.__PDD_LEVEL_EXP_CDN_URL__);
    if (forced) return forced;
    const stable = normalizeCdnBaseUrl(stableBaseUrl);
    if (/\/remote_wechat\/levels\/$/i.test(stable)) {
        return stable.replace(/\/remote_wechat\/levels\/$/i, '/remote_wechat/level_experiments/level_exp/levels/');
    }
    return '';
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

export class LevelDataCdnService {
    static readonly inst = new LevelDataCdnService();

    private readonly manifestStates = new Map<string, LevelDataManifestState>();
    private readonly packPromises = new Map<string, Promise<LevelPack | null>>();
    private lastManifestNamespace = 'stable';

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
        const manifest = await this.getLiveManifest(context);
        if (!manifest) return null;
        const packEntry = this.findPack(manifest, normalizedLevelId, normalizedPrefix);
        if (!packEntry) return null;
        const pack = await this.loadPack(context, packEntry);
        if (!pack) return null;
        const level = pack.levels.find((entry) => {
            if (entry.levelId !== normalizedLevelId) return false;
            return this.getPackPrefix(entry.prefix ? { prefix: entry.prefix } : pack) === normalizedPrefix;
        });
        if (level) this.lastManifestNamespace = context.namespace;
        return level ? level.data : null;
    }

    getDataVersion(): string {
        return this.manifestStates.get(this.lastManifestNamespace)?.manifest?.dataVersion || '';
    }

    getLevelExperimentAssignment(): LevelExperimentAssignment {
        return this.resolveLevelExperimentAssignment();
    }

    getLevelExperimentEventContext(levelId: number, prefix: string = DEFAULT_LEVEL_PREFIX): { abId: string; abBucket: string } | null {
        if (!this.shouldUseLevelExperiment(levelId, prefix)) return null;
        const assignment = this.resolveLevelExperimentAssignment();
        return {
            abId: assignment.experimentId,
            abBucket: assignment.bucket,
        };
    }

    getAvailabilityDiagnostics(): Record<string, unknown> {
        const baseUrl = runtimeLevelDataBaseUrl();
        const assignment = this.resolveLevelExperimentAssignment();
        const experimentBaseUrl = runtimeLevelExperimentBaseUrl(baseUrl);
        const stableState = this.getManifestState('stable');
        const experimentState = this.getManifestState('experiment:' + LEVEL_EXPERIMENT_ID + ':treatment');
        const requester = getCdnPlatformRequester();
        const reason = getCdnUnavailableReason(baseUrl);
        return {
            baseUrl,
            levelExperiment: {
                experimentId: assignment.experimentId,
                experimentSalt: assignment.experimentSalt,
                bucket: assignment.bucket,
                group: assignment.group,
                scope: 'mainline',
                baseUrl: experimentBaseUrl,
                activeForBucket: assignment.group === 'treatment',
                liveUnavailableCooldownMs: Math.max(0, experimentState.unavailableUntil - Date.now()),
                liveUnavailableReason: experimentState.unavailableReason,
            },
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
        };
    }

    private async getLiveManifest(context: LevelDataCdnContext): Promise<LevelLiveManifest | null> {
        if (!canUseCdn(context.baseUrl)) return null;
        const state = this.getManifestState(context.namespace);
        if (state.manifest) return state.manifest;
        if (this.isLiveManifestCoolingDown(state)) return null;
        if (!state.textPromise) {
            state.textPromise = this.requestLiveText(context.baseUrl);
        }
        try {
            const text = await state.textPromise;
            state.manifest = this.validateLiveManifest(parseJsonText<LevelLiveManifest>(text, 'level_live.json'));
            this.clearLiveManifestUnavailable(state);
            return state.manifest;
        } catch (err) {
            state.textPromise = null;
            this.markLiveManifestUnavailable(state, 'level_live.json unavailable', err);
            return null;
        }
    }

    private isLiveManifestCoolingDown(state: LevelDataManifestState): boolean {
        return Date.now() < state.unavailableUntil;
    }

    private markLiveManifestUnavailable(state: LevelDataManifestState, label: string, err: unknown): void {
        const reason = err instanceof Error ? err.message : String(err || 'unknown error');
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

    private async loadPack(context: LevelDataCdnContext, packEntry: LevelPackEntry): Promise<LevelPack | null> {
        const baseUrl = context.baseUrl;
        if (!canUseCdn(baseUrl)) return null;
        const cacheKey = context.namespace + ':' + packEntry.id + ':' + this.getPackPrefix(packEntry) + ':' + (packEntry.hash || packEntry.url);
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
        const stableBaseUrl = runtimeLevelDataBaseUrl();
        const assignment = this.resolveLevelExperimentAssignment();
        const experimentActive = assignment.group === 'treatment' && this.shouldUseLevelExperiment(levelId, prefix);
        if (!experimentActive) {
            return {
                baseUrl: stableBaseUrl,
                namespace: 'stable',
                assignment,
                experimentActive: false,
            };
        }
        const experimentBaseUrl = runtimeLevelExperimentBaseUrl(stableBaseUrl);
        return {
            baseUrl: experimentBaseUrl || stableBaseUrl,
            namespace: 'experiment:' + assignment.experimentId + ':treatment',
            assignment,
            experimentActive: true,
        };
    }

    private shouldUseLevelExperiment(levelId: number, prefix: string): boolean {
        const normalizedPrefix = normalizeLevelPrefix(prefix);
        return normalizedPrefix === DEFAULT_LEVEL_PREFIX;
    }

    private resolveLevelExperimentAssignment(): LevelExperimentAssignment {
        const forced = this.readLevelExperimentBucketOverride();
        if (forced) {
            return this.buildLevelExperimentAssignment(forced, 'url');
        }
        const persisted = this.readPersistedLevelExperimentAssignment();
        if (persisted) return persisted;
        const installId = this.readOrCreateLevelExperimentInstallId();
        const hashBucket = this.hashStringToBucket(`${LEVEL_EXPERIMENT_ID}:${LEVEL_EXPERIMENT_SALT}:${installId}`);
        const bucket: LevelExperimentBucket =
            hashBucket < 25 ? 'A' :
            hashBucket < 50 ? 'B' :
            hashBucket < 75 ? 'C' :
            'D';
        const assignment = this.buildLevelExperimentAssignment(bucket, 'local');
        writeCdnStorageObject(LEVEL_EXP_ASSIGNMENT_STORAGE_KEY, assignment);
        return assignment;
    }

    private buildLevelExperimentAssignment(bucket: LevelExperimentBucket, source: LevelExperimentAssignment['source']): LevelExperimentAssignment {
        return {
            experimentId: LEVEL_EXPERIMENT_ID,
            experimentSalt: LEVEL_EXPERIMENT_SALT,
            bucket,
            group: bucket === 'A' || bucket === 'B' ? 'baseline' : 'treatment',
            source,
        };
    }

    private readPersistedLevelExperimentAssignment(): LevelExperimentAssignment | null {
        const stored = readCdnStorageObject(LEVEL_EXP_ASSIGNMENT_STORAGE_KEY);
        const bucket = this.normalizeLevelExperimentBucket(stored?.bucket);
        if (!bucket) return null;
        if (stored?.experimentId !== LEVEL_EXPERIMENT_ID || stored?.experimentSalt !== LEVEL_EXPERIMENT_SALT) return null;
        return this.buildLevelExperimentAssignment(bucket, 'local');
    }

    private readLevelExperimentBucketOverride(): LevelExperimentBucket | null {
        try {
            const search = typeof window !== 'undefined' ? window.location.search : '';
            if (!search) return null;
            const params = new URLSearchParams(search);
            const ab = (params.get('ab') || params.get('experiment') || '').trim().toLowerCase();
            if (ab && ab !== LEVEL_EXPERIMENT_ID) return null;
            const rawBucket = params.get('bucket')
                || params.get('levelExpBucket')
                || params.get('level_exp_bucket')
                || '';
            if (!rawBucket) return null;
            return this.normalizeLevelExperimentBucket(rawBucket);
        } catch (_) {
            return null;
        }
    }

    private normalizeLevelExperimentBucket(value: unknown): LevelExperimentBucket | null {
        const text = String(value ?? '').trim().toUpperCase();
        if (text === 'A' || text === 'BUCKET_A') return 'A';
        if (text === 'B' || text === 'BUCKET_B') return 'B';
        if (text === 'C' || text === 'BUCKET_C') return 'C';
        if (text === 'D' || text === 'BUCKET_D') return 'D';
        return null;
    }

    private readOrCreateLevelExperimentInstallId(): string {
        const stored = readCdnStorageObject(LEVEL_EXP_INSTALL_ID_STORAGE_KEY);
        if (typeof stored?.installId === 'string' && stored.installId) return stored.installId;
        const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
        writeCdnStorageObject(LEVEL_EXP_INSTALL_ID_STORAGE_KEY, { installId: created });
        return created;
    }

    private hashStringToBucket(text: string): number {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) % 100;
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
