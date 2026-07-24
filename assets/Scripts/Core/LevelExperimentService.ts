import { sys } from 'cc';
import { getMiniGameBuildPlatform, getWeChatMiniGameRuntime, isWeChatMiniGameRuntime } from './MiniGamePlatform';
import { isLocalBrowserPreview, normalizeCdnBaseUrl } from './RemoteDataCdnClient';

export type ExperimentBucket = 'base' | 'exp' | null;
export type FrontLevelExperimentVariant = Exclude<ExperimentBucket, null>;

export type FrontLevelExperimentContext = {
    id: string;
    variant: FrontLevelExperimentVariant;
    baseUrl: string;
    namespace: string;
    bucketIndex: number;
    forced: boolean;
};

export type FrontLevelExperimentAnalyticsContext = {
    abId: string;
    abBucket: FrontLevelExperimentVariant;
};

export const FRONT_LEVEL_EXPERIMENT_ID = 'ly_0224';
export const FRONT_LEVEL_EXPERIMENT_MIN_LEVEL = 2;
export const FRONT_LEVEL_EXPERIMENT_MAX_LEVEL = 9;
export const FRONT_LEVEL_TREATMENT_CDN_BASE_URL =
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat_b/0722_levels/front10_v1/treatment/';

const DEFAULT_LEVEL_PREFIX = 'level_';
const ANALYTICS_OPENID_STORAGE_KEY = 'pdd.analytics.openid.v1';
const EXPERIMENT_NAMESPACE_PREFIX = 'wechat-front10';
const EXPERIMENT_SPLIT_PERCENT = 50;

function getGlobalScope(): any {
    return typeof globalThis !== 'undefined' ? globalThis : null;
}

function getWindowScope(): any {
    return typeof window !== 'undefined' ? window : null;
}

function readStorageString(key: string): string {
    try {
        return String(sys.localStorage.getItem(key) || '').trim();
    } catch (_) {
        return '';
    }
}

export function normalizeExperimentName(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function normalizeExperimentUid(value: unknown): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    if (/^(?:install|session|device|local|random|anonymous):/i.test(text)) return '';
    return text;
}

function appendUtf8Bytes(bytes: number[], codePoint: number): void {
    if (codePoint <= 0x7f) {
        bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
        bytes.push(0xc0 | (codePoint >> 6));
        bytes.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
        bytes.push(0xe0 | (codePoint >> 12));
        bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
        bytes.push(0x80 | (codePoint & 0x3f));
    } else {
        bytes.push(0xf0 | (codePoint >> 18));
        bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
        bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
        bytes.push(0x80 | (codePoint & 0x3f));
    }
}

function utf8Bytes(value: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < value.length; i += 1) {
        const first = value.charCodeAt(i);
        if (first >= 0xd800 && first <= 0xdbff && i + 1 < value.length) {
            const second = value.charCodeAt(i + 1);
            if (second >= 0xdc00 && second <= 0xdfff) {
                appendUtf8Bytes(bytes, 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00));
                i += 1;
                continue;
            }
        }
        appendUtf8Bytes(bytes, first);
    }
    return bytes;
}

const CRC32_TABLE = (() => {
    const table: number[] = [];
    for (let i = 0; i < 256; i += 1) {
        let crc = i;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
        }
        table[i] = crc >>> 0;
    }
    return table;
})();

export function crc32Utf8(value: string): number {
    const bytes = utf8Bytes(value);
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export function assignExperimentBucket(rawUid: unknown, rawExperimentName: unknown): { bucket: ExperimentBucket; bucketNumber: number | null } {
    const uid = normalizeExperimentUid(rawUid);
    const experimentName = normalizeExperimentName(rawExperimentName);
    if (!uid || !experimentName) {
        return { bucket: null, bucketNumber: null };
    }
    const unsignedCRC32 = crc32Utf8(`${uid}:${experimentName}`);
    const bucketNumber = unsignedCRC32 % 100;
    return { bucket: bucketNumber < 50 ? 'base' : 'exp', bucketNumber };
}

function normalizeForcedVariant(value: unknown): FrontLevelExperimentVariant | 'off' | '' {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'base' || normalized === 'control' || normalized === 'a' || normalized === 'b' || normalized === 'old' || normalized === 'original' || normalized === 'stable') {
        return 'base';
    }
    if (normalized === 'exp' || normalized === 'treatment' || normalized === 'c' || normalized === 'd' || normalized === 'new') {
        return 'exp';
    }
    if (normalized === 'off' || normalized === 'none' || normalized === 'null' || normalized === 'disabled') {
        return 'off';
    }
    return '';
}

function isFrontLevelExperimentKey(value: unknown): boolean {
    const normalizedKey = String(value || '').trim().toLowerCase();
    return normalizedKey === FRONT_LEVEL_EXPERIMENT_ID;
}

function readAbParamForcedVariant(value: unknown): FrontLevelExperimentVariant | 'off' | '' {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const segments = raw.split(';');
    for (let i = 0; i < segments.length; i += 1) {
        const parts = segments[i].split(',');
        if (parts.length < 2) continue;
        if (!isFrontLevelExperimentKey(parts[0])) continue;
        return normalizeForcedVariant(parts[1]);
    }
    return '';
}

function readQueryForcedVariant(): FrontLevelExperimentVariant | 'off' | '' {
    try {
        const windowScope = getWindowScope();
        const search = String(windowScope?.location?.search || '');
        if (!search) return '';
        const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
        const abOverride = readAbParamForcedVariant(params.get('ab') || params.get('pddAb'));
        if (abOverride) return abOverride;
        return normalizeForcedVariant(params.get('front10Variant') || params.get('pddFront10Variant'));
    } catch (_) {
        return '';
    }
}

function readLocalBrowserTreatmentBaseUrl(): string {
    try {
        if (!isLocalBrowserPreview()) return '';
        const windowScope = getWindowScope();
        const search = String(windowScope?.location?.search || '');
        if (!search) return '';
        const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
        const baseUrl = normalizeCdnBaseUrl(params.get('front10BaseUrl') || params.get('pddFront10BaseUrl'));
        if (!/^https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?\//i.test(baseUrl)) return '';
        return baseUrl;
    } catch (_) {
        return '';
    }
}

function readWeChatLaunchForcedVariant(): FrontLevelExperimentVariant | 'off' | '' {
    try {
        const wxRuntime = getWeChatMiniGameRuntime();
        const query = wxRuntime?.getLaunchOptionsSync?.()?.query;
        if (!query || typeof query !== 'object') return '';
        const launchQuery = query as Record<string, unknown>;
        const abOverride = readAbParamForcedVariant(launchQuery.ab || launchQuery.pddAb);
        if (abOverride) return abOverride;
        return normalizeForcedVariant(launchQuery.front10Variant || launchQuery.pddFront10Variant);
    } catch (_) {
        return '';
    }
}

function getForcedVariant(): FrontLevelExperimentVariant | 'off' | '' {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    return normalizeForcedVariant(
        globalScope?.__PDD_LEVEL_EXPERIMENT_BUCKET__
        || windowScope?.__PDD_LEVEL_EXPERIMENT_BUCKET__
        || globalScope?.__PDD_FRONT10_LEVEL_EXPERIMENT_VARIANT__
        || windowScope?.__PDD_FRONT10_LEVEL_EXPERIMENT_VARIANT__,
    ) || readQueryForcedVariant() || readWeChatLaunchForcedVariant();
}

function isWechatExperimentRuntime(): boolean {
    return getMiniGameBuildPlatform() === 'wechat' || isWeChatMiniGameRuntime();
}

function assignVariant(): { variant: FrontLevelExperimentVariant; bucketIndex: number } | null {
    const assigned = assignExperimentBucket(readStorageString(ANALYTICS_OPENID_STORAGE_KEY), FRONT_LEVEL_EXPERIMENT_ID);
    if (!assigned.bucket || assigned.bucketNumber === null) return null;
    return {
        variant: assigned.bucket,
        bucketIndex: assigned.bucketNumber,
    };
}

export function isFrontLevelExperimentTarget(levelId: unknown, prefix: string = DEFAULT_LEVEL_PREFIX): boolean {
    const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
    return prefix === DEFAULT_LEVEL_PREFIX
        && normalizedLevelId >= FRONT_LEVEL_EXPERIMENT_MIN_LEVEL
        && normalizedLevelId <= FRONT_LEVEL_EXPERIMENT_MAX_LEVEL;
}

function isFrontLevelExperimentAnalyticsTarget(levelId: unknown, prefix: string = DEFAULT_LEVEL_PREFIX): boolean {
    const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
    return prefix === DEFAULT_LEVEL_PREFIX && normalizedLevelId >= FRONT_LEVEL_EXPERIMENT_MIN_LEVEL;
}

function getFrontLevelExperimentAssignment(): { variant: FrontLevelExperimentVariant; bucketIndex: number; forced: boolean } | null {
    const forced = getForcedVariant();
    if (forced === 'off') return null;
    if (!forced && !isWechatExperimentRuntime()) return null;

    const assigned = forced ? { variant: forced, bucketIndex: forced === 'base' ? 0 : EXPERIMENT_SPLIT_PERCENT } : assignVariant();
    if (!assigned) return null;
    return {
        ...assigned,
        forced: !!forced,
    };
}

export function resolveFrontLevelExperimentContext(levelId: unknown, prefix: string = DEFAULT_LEVEL_PREFIX): FrontLevelExperimentContext | null {
    if (!isFrontLevelExperimentTarget(levelId, prefix)) return null;
    const assigned = getFrontLevelExperimentAssignment();
    if (!assigned) return null;
    return {
        id: FRONT_LEVEL_EXPERIMENT_ID,
        variant: assigned.variant,
        baseUrl: readLocalBrowserTreatmentBaseUrl() || FRONT_LEVEL_TREATMENT_CDN_BASE_URL,
        namespace: `${EXPERIMENT_NAMESPACE_PREFIX}:${FRONT_LEVEL_EXPERIMENT_ID}:${assigned.variant}`,
        bucketIndex: assigned.bucketIndex,
        forced: assigned.forced,
    };
}

export function getFrontLevelExperimentAnalyticsContext(levelId: unknown, prefix: string = DEFAULT_LEVEL_PREFIX): FrontLevelExperimentAnalyticsContext | null {
    if (!isFrontLevelExperimentAnalyticsTarget(levelId, prefix)) return null;
    const assigned = getFrontLevelExperimentAssignment();
    if (!assigned) return null;
    return {
        abId: FRONT_LEVEL_EXPERIMENT_ID,
        abBucket: assigned.variant,
    };
}

export function getFrontLevelExperimentDiagnostics(): Record<string, unknown> {
    const forced = getForcedVariant();
    const enabledForPlatform = isWechatExperimentRuntime();
    const assignment = forced && forced !== 'off'
        ? { variant: forced, bucketIndex: forced === 'base' ? 0 : EXPERIMENT_SPLIT_PERCENT }
        : (enabledForPlatform ? assignVariant() : null);
    return {
        id: FRONT_LEVEL_EXPERIMENT_ID,
        levelRange: [FRONT_LEVEL_EXPERIMENT_MIN_LEVEL, FRONT_LEVEL_EXPERIMENT_MAX_LEVEL],
        enabledForPlatform,
        forcedVariant: forced || '',
        assignedVariant: assignment?.variant || '',
        bucketIndex: assignment?.bucketIndex ?? null,
        cachedOpenidAvailable: !!normalizeExperimentUid(readStorageString(ANALYTICS_OPENID_STORAGE_KEY)),
        localBrowserTreatmentBaseUrl: readLocalBrowserTreatmentBaseUrl(),
        treatmentBaseUrl: FRONT_LEVEL_TREATMENT_CDN_BASE_URL,
    };
}
