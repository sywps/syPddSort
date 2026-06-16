export type SlotOnboardingEntryMode = 'main' | 'theme' | 'external' | string;
export type SlotUnlockMode = 'free' | 'ad';

export type SlotRowPolicy = {
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

export function isMainlineSlotEntry(entryMode: SlotOnboardingEntryMode = 'main'): boolean {
    return entryMode === 'main';
}

export function shouldShowGameplaySkillArea(levelId: unknown, entryMode: SlotOnboardingEntryMode = 'main'): boolean {
    if (!isMainlineSlotEntry(entryMode)) return true;
    return normalizeLevelId(levelId) >= 2;
}

export function getSlotUnlockMode(levelId: unknown, entryMode: SlotOnboardingEntryMode = 'main'): SlotUnlockMode {
    if (!isMainlineSlotEntry(entryMode)) return 'ad';
    return normalizeLevelId(levelId) === 2 ? 'free' : 'ad';
}

export function shouldAppendLockedSlotRowAfterUnlock(levelId: unknown, entryMode: SlotOnboardingEntryMode = 'main'): boolean {
    if (!isMainlineSlotEntry(entryMode)) return true;
    return normalizeLevelId(levelId) >= MAINLINE_APPEND_LOCKED_SLOT_ROW_MIN_LEVEL;
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
}): SlotRowPolicy {
    const levelId = normalizeLevelId(options.levelId);
    const maxRows = normalizeMaxRows(options.maxRows);
    const entryMode = options.entryMode || 'main';

    if (!isMainlineSlotEntry(entryMode)) {
        const unlockedRows = normalizeConfiguredRows(options.configuredUnlockedRows, maxRows);
        const rowCount = unlockedRows >= maxRows ? maxRows : unlockedRows + 1;
        return {
            unlockedRows,
            rowCount,
            appendLockedRowAfterUnlock: true,
            unlockMode: 'ad',
            showSkillArea: true,
            showSlotUnlockGuide: false,
        };
    }

    let unlockedRows = 1;
    let rowCount = 2;
    if (levelId === 1) {
        rowCount = 1;
    } else if (levelId >= MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MIN_LEVEL && levelId <= MAINLINE_TWO_UNLOCKED_SLOT_ROWS_MAX_LEVEL) {
        unlockedRows = 2;
        rowCount = 3;
    }

    unlockedRows = clampRows(unlockedRows, maxRows);
    rowCount = Math.max(unlockedRows, clampRows(rowCount, maxRows));
    return {
        unlockedRows,
        rowCount,
        appendLockedRowAfterUnlock: shouldAppendLockedSlotRowAfterUnlock(levelId, entryMode),
        unlockMode: getSlotUnlockMode(levelId, entryMode),
        showSkillArea: shouldShowGameplaySkillArea(levelId, entryMode),
        showSlotUnlockGuide: levelId === 2,
    };
}
