const MAIN_LEVEL_MAX_ID = 300;

export function normalizeMainLevelId(levelId: unknown): number {
    return Math.max(1, Math.floor(Number(levelId) || 1));
}

export function getMainLevelId(levelId: unknown): number {
    return normalizeMainLevelId(levelId);
}

export function getPhysicalMainLevelId(levelId: unknown): number {
    return Math.min(MAIN_LEVEL_MAX_ID, getMainLevelId(levelId));
}

export function getLogicalMainLevelId(levelId: unknown): number {
    return getMainLevelId(levelId);
}

export function shouldUseMainLevelUnlimitedTime(_levelId: unknown): boolean {
    return false;
}

export function getMainLevelTimeLimitSeconds(_levelId: unknown): number | null {
    return null;
}
