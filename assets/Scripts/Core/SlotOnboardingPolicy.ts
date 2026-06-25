export type SlotOnboardingEntryMode = 'main' | 'theme' | 'external' | string;
export type SlotUnlockMode = 'free' | 'ad';

export type SlotPolicyConfig = {
    defaultRows?: unknown;
    freeUnlockRows?: unknown;
    adUnlockRows?: unknown;
};

export type SlotRowPolicy = {
    defaultRows: number;
    freeUnlockRows: number;
    adUnlockRows: number;
    freeUnlockUntilRows: number;
    unlockedRows: number;
    rowCount: number;
    appendLockedRowAfterUnlock: boolean;
    unlockMode: SlotUnlockMode;
    showSkillArea: boolean;
    showSlotUnlockGuide: boolean;
};

export const ONBOARDING_TEACHING_TIME_LIMIT_SECONDS = 600;
const MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MIN_LEVEL = 3;
const MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MAX_LEVEL = 10;
const MAINLINE_APPEND_LOCKED_SLOT_ROW_MIN_LEVEL = MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MAX_LEVEL + 1;

function normalizeLevelId(levelId: unknown): number {
    return Math.max(1, Math.floor(Number(levelId) || 1));
}

function normalizeMaxRows(maxRows: unknown): number {
    return Math.max(1, Math.floor(Number(maxRows) || 1));
}

function clampRows(value: number, maxRows: number): number {
    return Math.max(1, Math.min(maxRows, Math.floor(value)));
}

function normalizeConfiguredRows(configuredUnlockedRows: unknown, maxRows: number): number {
    const value = Number(configuredUnlockedRows);
    return Number.isFinite(value) ? clampRows(value, maxRows) : 1;
}

function normalizeRequiredPolicyRows(policy: SlotPolicyConfig, key: keyof SlotPolicyConfig, minValue: number): number {
    const raw = policy[key];
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        throw new Error(`[SlotPolicy] invalid ${String(key)}: ${raw}`);
    }
    const normalized = Math.floor(value);
    if (normalized < minValue) {
        throw new Error(`[SlotPolicy] ${String(key)} must be >= ${minValue}: ${raw}`);
    }
    return normalized;
}

function resolveConfiguredSlotRowPolicy(options: {
    levelId: number;
    entryMode: SlotOnboardingEntryMode;
    maxRows: number;
    configuredSlotPolicy?: SlotPolicyConfig | null;
}): SlotRowPolicy | null {
    const config = options.configuredSlotPolicy;
    if (!config || typeof config !== 'object') return null;
    const defaultRows = normalizeRequiredPolicyRows(config, 'defaultRows', 1);
    const freeUnlockRows = normalizeRequiredPolicyRows(config, 'freeUnlockRows', 0);
    const adUnlockRows = normalizeRequiredPolicyRows(config, 'adUnlockRows', 0);
    const rowCount = defaultRows + freeUnlockRows + adUnlockRows;
    if (rowCount > options.maxRows) {
        throw new Error(`[SlotPolicy] row total exceeds max rows: ${rowCount} > ${options.maxRows}`);
    }
    return {
        defaultRows,
        freeUnlockRows,
        adUnlockRows,
        freeUnlockUntilRows: defaultRows + freeUnlockRows,
        unlockedRows: defaultRows,
        rowCount,
        appendLockedRowAfterUnlock: adUnlockRows > 0,
        unlockMode: freeUnlockRows > 0 ? 'free' : 'ad',
        showSkillArea: shouldShowGameplaySkillArea(options.levelId, options.entryMode),
        showSlotUnlockGuide: options.levelId === 2 && freeUnlockRows > 0,
    };
}

export function isMainlineSlotEntry(entryMode: SlotOnboardingEntryMode = 'main'): boolean {
    return entryMode === 'main';
}

export function isMainlineEarlyExpandedSlotLevel(levelId: unknown, entryMode: SlotOnboardingEntryMode = 'main'): boolean {
    const normalizedLevelId = normalizeLevelId(levelId);
    return isMainlineSlotEntry(entryMode)
        && normalizedLevelId >= MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MIN_LEVEL
        && normalizedLevelId <= MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MAX_LEVEL;
}

export function shouldShowGameplaySkillArea(levelId: unknown, entryMode: SlotOnboardingEntryMode = 'main'): boolean {
    if (!isMainlineSlotEntry(entryMode)) return true;
    return normalizeLevelId(levelId) >= 3;
}

export function getSlotUnlockMode(levelId: unknown, entryMode: SlotOnboardingEntryMode = 'main'): SlotUnlockMode {
    if (!isMainlineSlotEntry(entryMode)) return 'ad';
    return normalizeLevelId(levelId) === 2 ? 'free' : 'ad';
}

export function getSlotUnlockModeForPolicy(policy: SlotRowPolicy | null | undefined, unlockedRows: unknown): SlotUnlockMode | null {
    if (!policy) return null;
    const currentUnlockedRows = Math.max(1, Math.floor(Number(unlockedRows) || 1));
    if (currentUnlockedRows < policy.freeUnlockUntilRows) return 'free';
    if (currentUnlockedRows < policy.rowCount) return 'ad';
    return policy.unlockMode;
}

export function shouldAppendLockedSlotRowAfterUnlock(levelId: unknown, entryMode: SlotOnboardingEntryMode = 'main'): boolean {
    if (!isMainlineSlotEntry(entryMode)) return true;
    return isMainlineEarlyExpandedSlotLevel(levelId, entryMode)
        || normalizeLevelId(levelId) >= MAINLINE_APPEND_LOCKED_SLOT_ROW_MIN_LEVEL;
}

export function resolveSlotOnboardingTimeLimit(options: {
    levelId: unknown;
    entryMode?: SlotOnboardingEntryMode;
    configuredTimeLimit?: unknown;
}): number {
    const configuredTimeLimit = Math.max(0, Math.floor(Number(options.configuredTimeLimit) || 0));
    if (isMainlineSlotEntry(options.entryMode || 'main') && normalizeLevelId(options.levelId) <= 2) {
        return ONBOARDING_TEACHING_TIME_LIMIT_SECONDS;
    }
    return configuredTimeLimit;
}

export function resolveSlotRowPolicy(options: {
    levelId: unknown;
    entryMode?: SlotOnboardingEntryMode;
    maxRows: unknown;
    configuredUnlockedRows?: unknown;
    configuredSlotPolicy?: SlotPolicyConfig | null;
}): SlotRowPolicy {
    const levelId = normalizeLevelId(options.levelId);
    const maxRows = normalizeMaxRows(options.maxRows);
    const entryMode = options.entryMode || 'main';

    const configuredPolicy = resolveConfiguredSlotRowPolicy({
        levelId,
        entryMode,
        maxRows,
        configuredSlotPolicy: options.configuredSlotPolicy,
    });
    if (configuredPolicy) return configuredPolicy;

    if (!isMainlineSlotEntry(entryMode)) {
        const unlockedRows = normalizeConfiguredRows(options.configuredUnlockedRows, maxRows);
        const rowCount = unlockedRows >= maxRows ? maxRows : unlockedRows + 1;
        return {
            defaultRows: unlockedRows,
            freeUnlockRows: 0,
            adUnlockRows: rowCount > unlockedRows ? 1 : 0,
            freeUnlockUntilRows: unlockedRows,
            unlockedRows,
            rowCount,
            appendLockedRowAfterUnlock: true,
            unlockMode: 'ad',
            showSkillArea: true,
            showSlotUnlockGuide: false,
        };
    }

    let defaultRows = 1;
    let freeUnlockRows = 0;
    let adUnlockRows = 1;
    if (levelId === 1) {
        adUnlockRows = 0;
    } else if (levelId === 2) {
        freeUnlockRows = 1;
        adUnlockRows = 0;
    } else if (levelId >= MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MIN_LEVEL && levelId <= MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MAX_LEVEL) {
        defaultRows = 2;
    }

    defaultRows = clampRows(defaultRows, maxRows);
    const rowCount = Math.max(defaultRows, clampRows(defaultRows + freeUnlockRows + adUnlockRows, maxRows));
    const clampedExtraRows = Math.max(0, rowCount - defaultRows);
    if (freeUnlockRows > clampedExtraRows) {
        freeUnlockRows = clampedExtraRows;
        adUnlockRows = 0;
    } else {
        adUnlockRows = Math.min(adUnlockRows, clampedExtraRows - freeUnlockRows);
    }
    return {
        defaultRows,
        freeUnlockRows,
        adUnlockRows,
        freeUnlockUntilRows: defaultRows + freeUnlockRows,
        unlockedRows: defaultRows,
        rowCount,
        appendLockedRowAfterUnlock: adUnlockRows > 0 && shouldAppendLockedSlotRowAfterUnlock(levelId, entryMode),
        unlockMode: freeUnlockRows > 0 ? 'free' : 'ad',
        showSkillArea: shouldShowGameplaySkillArea(levelId, entryMode),
        showSlotUnlockGuide: levelId === 2 && freeUnlockRows > 0,
    };
}
