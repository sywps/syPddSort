import { sys } from 'cc';

export type StartupRouteDecision = {
    shouldMarkPendingGameplay: boolean;
    levelId: number;
    prefix: 'level_';
    reason: 'explicit_launch' | 'local_progress_gt_1' | 'default_level_1';
};

const LS_LEVEL = 'pdd.level';

function getGlobalScope(): any {
    return typeof globalThis !== 'undefined' ? globalThis as any : null;
}

function getWindowScope(): any {
    return typeof window !== 'undefined' ? window as any : null;
}

function readWindowQuery(): Record<string, string> {
    const result: Record<string, string> = {};
    try {
        const search = String(getWindowScope()?.location?.search || '');
        if (!search) return result;
        const params = new URLSearchParams(search);
        params.forEach((value, key) => {
            result[key.toLowerCase()] = value;
        });
    } catch (_) { /* ignore */ }
    return result;
}

function readMiniGameQuery(): Record<string, string> {
    const result: Record<string, string> = {};
    try {
        const scope = getGlobalScope();
        const wxRuntime = scope?.__rawWx || scope?.wx || getWindowScope()?.wx || null;
        const query = wxRuntime?.getLaunchOptionsSync?.()?.query || {};
        if (!query || typeof query !== 'object') return result;
        for (const key of Object.keys(query)) {
            result[key.toLowerCase()] = String(query[key] ?? '');
        }
    } catch (_) { /* ignore */ }
    return result;
}

function readLaunchQuery(): Record<string, string> {
    return {
        ...readMiniGameQuery(),
        ...readWindowQuery(),
    };
}

function hasValue(value: unknown): boolean {
    return String(value ?? '').trim().length > 0;
}

function hasExplicitGameplayLaunch(query: Record<string, string>): boolean {
    if (Math.floor(Number(query.level) || 0) > 0) return true;
    if (hasValue(query.levelfile) || hasValue(query.level_file) || hasValue(query.levelfileurl)) return true;
    if (hasValue(query.theme) && Math.floor(Number(query.level) || 0) > 0) return true;
    return false;
}

function readLocalStartupLevel(): number {
    try {
        const raw = sys.localStorage.getItem(LS_LEVEL);
        if (raw === null) return 1;
        const parsed = Math.floor(Number.parseInt(raw, 10));
        return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
    } catch (_) {
        return 1;
    }
}

export function resolveStartupRouteDecision(): StartupRouteDecision {
    const query = readLaunchQuery();
    if (hasExplicitGameplayLaunch(query)) {
        return {
            shouldMarkPendingGameplay: false,
            levelId: 1,
            prefix: 'level_',
            reason: 'explicit_launch',
        };
    }
    const localLevel = readLocalStartupLevel();
    if (localLevel >= 2) {
        return {
            shouldMarkPendingGameplay: true,
            levelId: localLevel,
            prefix: 'level_',
            reason: 'local_progress_gt_1',
        };
    }
    return {
        shouldMarkPendingGameplay: false,
        levelId: 1,
        prefix: 'level_',
        reason: 'default_level_1',
    };
}

