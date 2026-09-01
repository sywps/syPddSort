export type SlotOnboardingEntryMode = 'main' | 'external' | string;
export type SlotUnlockMode = 'free' | 'ad';

export type SlotPolicyConfig = {
    defaultRows?: unknown;
    freeUnlockRows?: unknown;
    adUnlockRows?: unknown;
    unlockAllRowsAtOnce?: unknown;
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
    unlockAllRowsAtOnce: boolean;
};

export const LEVEL_DATA_SLOT_POLICY_MAX_ROWS = 4;
const MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MIN_LEVEL = 3;
const MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MAX_LEVEL = 10;
const MAINLINE_APPEND_LOCKED_SLOT_ROW_MIN_LEVEL = MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MAX_LEVEL + 1;

function normalizeLevelId(levelId: unknown): number {
    return Math.max(1, Math.floor(Number(levelId) || 1));
}

function normalizeMaxRows(maxRows: unknown): number {
    return Math.max(1, Math.floor(Number(maxRows) || 1));
}

function normalizeRequiredPolicyRows(policy: SlotPolicyConfig, key: keyof SlotPolicyConfig, minValue: number): number {
    const raw = policy[key];
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
        throw new Error(`[SlotPolicy] invalid ${String(key)}: ${raw}`);
    }
    const normalized = raw as number;
    if (normalized < minValue) {
        throw new Error(`[SlotPolicy] ${String(key)} must be >= ${minValue}: ${raw}`);
    }
    return normalized;
}

export function validateSlotPolicyConfig(config: SlotPolicyConfig | null | undefined, maxRows: unknown = LEVEL_DATA_SLOT_POLICY_MAX_ROWS): {
    defaultRows: number;
    freeUnlockRows: number;
    adUnlockRows: number;
    unlockAllRowsAtOnce: boolean;
} {
    if (!config || typeof config !== 'object') {
        throw new Error('[SlotPolicy] missing required slotPolicy');
    }
    const normalizedMaxRows = normalizeMaxRows(maxRows);
    const defaultRows = normalizeRequiredPolicyRows(config, 'defaultRows', 1);
    const freeUnlockRows = normalizeRequiredPolicyRows(config, 'freeUnlockRows', 0);
    const adUnlockRows = normalizeRequiredPolicyRows(config, 'adUnlockRows', 0);
    const rowCount = defaultRows + freeUnlockRows + adUnlockRows;
    if (rowCount > normalizedMaxRows) {
        throw new Error(`[SlotPolicy] row total exceeds max rows: ${rowCount} > ${normalizedMaxRows}`);
    }
    if (config.unlockAllRowsAtOnce !== undefined && typeof config.unlockAllRowsAtOnce !== 'boolean') {
        throw new Error('[SlotPolicy] unlockAllRowsAtOnce must be boolean when present');
    }
    return {
        defaultRows,
        freeUnlockRows,
        adUnlockRows,
        unlockAllRowsAtOnce: config.unlockAllRowsAtOnce === true,
    };
}

function resolveConfiguredSlotRowPolicy(options: {
    levelId: number;
    entryMode: SlotOnboardingEntryMode;
    maxRows: number;
    configuredSlotPolicy?: SlotPolicyConfig | null;
}): SlotRowPolicy {
    const config = validateSlotPolicyConfig(options.configuredSlotPolicy, options.maxRows);
    const { defaultRows, freeUnlockRows, adUnlockRows } = config;
    const rowCount = defaultRows + freeUnlockRows + adUnlockRows;
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
        unlockAllRowsAtOnce: config.unlockAllRowsAtOnce,
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

export function isGameplaySkillUnlocked(
    levelId: unknown,
    entryMode: SlotOnboardingEntryMode = 'main',
    unlockLevel: unknown = 3,
): boolean {
    if (!isMainlineSlotEntry(entryMode)) return true;
    return normalizeLevelId(levelId) >= normalizeLevelId(unlockLevel);
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
    return Math.max(0, Math.floor(Number(options.configuredTimeLimit) || 0));
}

export function resolveSlotRowPolicy(options: {
    levelId: unknown;
    entryMode?: SlotOnboardingEntryMode;
    maxRows: unknown;
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
    return configuredPolicy;
}
