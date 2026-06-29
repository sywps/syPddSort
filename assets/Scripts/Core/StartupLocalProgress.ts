import { sys } from 'cc';

export const STARTUP_LS_LEVEL = 'pdd.level';

export type StartupLocalProgressState =
    | 'rawLevelMissing'
    | 'rawLevelInvalid'
    | 'local_progress_1'
    | 'local_progress_gt_1';

export type StartupLocalProgressSource = 'pdd.level' | 'default';

export interface StartupLocalProgressSnapshot {
    level: number;
    state: StartupLocalProgressState;
    source: StartupLocalProgressSource;
    rawLevel: string | null;
    hasStoredProgress: boolean;
}

export function normalizeStartupLocalLevel(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    const parsed = Math.floor(Number.parseInt(String(raw), 10));
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

export function resolveStartupLocalProgressFromRaw(
    rawLevel: unknown,
    _rawProfile: unknown = null,
): StartupLocalProgressSnapshot {
    const parsedLevel = normalizeStartupLocalLevel(rawLevel);
    const hasRawLevel = rawLevel !== null && rawLevel !== undefined;
    const hasValidLevel = parsedLevel !== null;
    const effectiveLevel = parsedLevel || 1;
    const source: StartupLocalProgressSource = hasValidLevel ? 'pdd.level' : 'default';
    let state: StartupLocalProgressState;
    if (effectiveLevel > 1) {
        state = 'local_progress_gt_1';
    } else if (!hasRawLevel) {
        state = 'rawLevelMissing';
    } else if (parsedLevel === null) {
        state = 'rawLevelInvalid';
    } else {
        state = 'local_progress_1';
    }
    return {
        level: effectiveLevel,
        state,
        source,
        rawLevel: hasRawLevel ? String(rawLevel ?? '') : null,
        hasStoredProgress: hasValidLevel,
    };
}

function readLocalStorageItem(key: string): string | null {
    try {
        return sys.localStorage.getItem(key);
    } catch (_) {
        return null;
    }
}

export function readStartupLocalProgress(): StartupLocalProgressSnapshot {
    return resolveStartupLocalProgressFromRaw(readLocalStorageItem(STARTUP_LS_LEVEL));
}
