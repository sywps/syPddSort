import { sys } from 'cc';
import { getMiniGameBuildPlatform, getWeChatMiniGameRuntime, isWeChatMiniGameRuntime } from './MiniGamePlatform';
import { isLocalBrowserPreview, normalizeCdnBaseUrl } from './RemoteDataCdnClient';

export type FrontLevelExperimentVariant = 'control' | 'treatment';

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

export const FRONT_LEVEL_EXPERIMENT_ID = 'front10_v1';
export const FRONT_LEVEL_EXPERIMENT_MIN_LEVEL = 2;
export const FRONT_LEVEL_EXPERIMENT_MAX_LEVEL = 9;
export const FRONT_LEVEL_TREATMENT_CDN_BASE_URL =
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat_b/0722_levels/front10_v1/treatment/';

const DEFAULT_LEVEL_PREFIX = 'level_';
const ANALYTICS_OPENID_STORAGE_KEY = 'pdd.analytics.openid.v1';
const EXPERIMENT_INSTALL_ID_STORAGE_KEY = `pdd.exp.${FRONT_LEVEL_EXPERIMENT_ID}.installId`;
const EXPERIMENT_ASSIGNMENT_STORAGE_KEY = `pdd.exp.${FRONT_LEVEL_EXPERIMENT_ID}.assignment`;
const EXPERIMENT_NAMESPACE_PREFIX = 'wechat-front10';
const TREATMENT_PERCENT = 50;

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

function writeStorageString(key: string, value: string): void {
    try {
        sys.localStorage.setItem(key, value);
    } catch (_) {
        // Storage can be unavailable in restricted preview contexts; bucketing still works for this session.
    }
}

function createInstallId(): string {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${randomPart}`;
}

function getStableBucketKey(): string {
    const cachedOpenid = readStorageString(ANALYTICS_OPENID_STORAGE_KEY);
    if (cachedOpenid) return `openid:${cachedOpenid}`;
    const cachedInstallId = readStorageString(EXPERIMENT_INSTALL_ID_STORAGE_KEY);
    if (cachedInstallId) return `install:${cachedInstallId}`;
    const installId = createInstallId();
    writeStorageString(EXPERIMENT_INSTALL_ID_STORAGE_KEY, installId);
    return `install:${installId}`;
}

function hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function readPersistedAssignment(): { variant: FrontLevelExperimentVariant; bucketIndex: number } | null {
    try {
        const raw = readStorageString(EXPERIMENT_ASSIGNMENT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const variant = normalizeForcedVariant(parsed?.variant);
        const bucketIndex = Math.max(0, Math.min(99, Math.floor(Number(parsed?.bucketIndex) || 0)));
        if (variant === 'control' || variant === 'treatment') {
            return { variant, bucketIndex };
        }
    } catch (_) {
        // Ignore corrupt assignment and recalculate below.
    }
    return null;
}

function writePersistedAssignment(assignment: { variant: FrontLevelExperimentVariant; bucketIndex: number }, bucketKey: string): void {
    try {
        writeStorageString(EXPERIMENT_ASSIGNMENT_STORAGE_KEY, JSON.stringify({
            id: FRONT_LEVEL_EXPERIMENT_ID,
            variant: assignment.variant,
            bucketIndex: assignment.bucketIndex,
            bucketKey,
        }));
    } catch (_) {
        // Storage can be unavailable; session-level assignment still works.
    }
}

function normalizeForcedVariant(value: unknown): FrontLevelExperimentVariant | 'off' | '' {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'control' || normalized === 'a' || normalized === 'old' || normalized === 'original' || normalized === 'stable') {
        return 'control';
    }
    if (normalized === 'treatment' || normalized === 'b' || normalized === 'new') {
        return 'treatment';
    }
    if (normalized === 'off' || normalized === 'none' || normalized === 'disabled') {
        return 'off';
    }
    return '';
}

function readQueryForcedVariant(): FrontLevelExperimentVariant | 'off' | '' {
    try {
        const windowScope = getWindowScope();
        const search = String(windowScope?.location?.search || '');
        if (!search) return '';
        const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
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
        return normalizeForcedVariant((query as Record<string, unknown>).front10Variant || (query as Record<string, unknown>).pddFront10Variant);
    } catch (_) {
        return '';
    }
}

function getForcedVariant(): FrontLevelExperimentVariant | 'off' | '' {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    return normalizeForcedVariant(
        globalScope?.__PDD_FRONT10_LEVEL_EXPERIMENT_VARIANT__
        || windowScope?.__PDD_FRONT10_LEVEL_EXPERIMENT_VARIANT__,
    ) || readQueryForcedVariant() || readWeChatLaunchForcedVariant();
}

function isWechatExperimentRuntime(): boolean {
    return getMiniGameBuildPlatform() === 'wechat' || isWeChatMiniGameRuntime();
}

function assignVariant(): { variant: FrontLevelExperimentVariant; bucketIndex: number } {
    const persisted = readPersistedAssignment();
    if (persisted) return persisted;
    const bucketKey = getStableBucketKey();
    const bucketIndex = hashString(`${FRONT_LEVEL_EXPERIMENT_ID}:${bucketKey}`) % 100;
    const assignment = {
        bucketIndex,
        variant: bucketIndex < TREATMENT_PERCENT ? 'control' : 'treatment',
    };
    writePersistedAssignment(assignment, bucketKey);
    return assignment;
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

    const assigned = forced ? { variant: forced, bucketIndex: forced === 'control' ? 0 : TREATMENT_PERCENT } : assignVariant();
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
        ? { variant: forced, bucketIndex: forced === 'control' ? 0 : TREATMENT_PERCENT }
        : (enabledForPlatform ? assignVariant() : null);
    return {
        id: FRONT_LEVEL_EXPERIMENT_ID,
        levelRange: [FRONT_LEVEL_EXPERIMENT_MIN_LEVEL, FRONT_LEVEL_EXPERIMENT_MAX_LEVEL],
        enabledForPlatform,
        forcedVariant: forced || '',
        assignedVariant: assignment?.variant || '',
        bucketIndex: assignment?.bucketIndex ?? -1,
        localBrowserTreatmentBaseUrl: readLocalBrowserTreatmentBaseUrl(),
        treatmentBaseUrl: FRONT_LEVEL_TREATMENT_CDN_BASE_URL,
    };
}
