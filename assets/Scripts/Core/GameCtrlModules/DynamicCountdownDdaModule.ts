import { sys } from '../GameCtrlShared';

const DYNAMIC_COUNTDOWN_ENABLE_LEVEL = 11;
const DYNAMIC_COUNTDOWN_CLEAN_WIN_TRIGGER = 3;
const DYNAMIC_COUNTDOWN_CLEAN_REMAIN_RATIO = 0.15;
const DYNAMIC_COUNTDOWN_COMPRESS_FACTOR = 0.8;
const DYNAMIC_COUNTDOWN_FAIL_FACTOR_2 = 1.15;
const DYNAMIC_COUNTDOWN_FAIL_FACTOR_3_PLUS = 1.3;

const LS_DYNAMIC_FAIL_LEVEL = 'pdd.dynamicCountdown.failLevel';
const LS_DYNAMIC_FAIL_COUNT = 'pdd.dynamicCountdown.failCount';
const LS_DYNAMIC_WIN_STREAK = 'pdd.dynamicCountdown.winStreak';
const LS_DYNAMIC_COMPRESSED_LEVEL = 'pdd.dynamicCountdown.compressedLevel';

function normalizeLevelId(levelId: unknown): number {
    return Math.max(1, Math.floor(Number(levelId) || 1));
}

function readStorageInt(key: string): number {
    const raw = sys.localStorage.getItem(key);
    const value = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function writeStorageInt(key: string, value: number): void {
    const normalized = Math.max(0, Math.floor(Number(value) || 0));
    if (normalized <= 0) {
        sys.localStorage.removeItem(key);
        return;
    }
    sys.localStorage.setItem(key, String(normalized));
}

function applyTimeFactor(baseSeconds: number, factor: number): number {
    if (factor > 1) {
        return Math.max(1, Math.ceil(baseSeconds * factor));
    }
    if (factor < 1) {
        return Math.max(1, Math.floor(baseSeconds * factor));
    }
    return baseSeconds;
}

export function installDynamicCountdownDdaModule(target: any): void {
    Object.assign(target, {
        isDynamicCountdownMainEntry(entryMode: unknown = this._activeGameplayEntryMode): boolean {
            return (entryMode || 'main') === 'main';
        },

        isDynamicCountdownEnabledFor(levelId: unknown = this.getActiveLogicalLevelId?.(), entryMode: unknown = this._activeGameplayEntryMode): boolean {
            return this.isDynamicCountdownMainEntry(entryMode) && normalizeLevelId(levelId) >= DYNAMIC_COUNTDOWN_ENABLE_LEVEL;
        },

        getDynamicCountdownFailCount(levelId: unknown = this.getActiveLogicalLevelId?.()): number {
            const normalizedLevel = normalizeLevelId(levelId);
            return readStorageInt(LS_DYNAMIC_FAIL_LEVEL) === normalizedLevel ? readStorageInt(LS_DYNAMIC_FAIL_COUNT) : 0;
        },

        setDynamicCountdownFailCount(levelId: unknown, count: number): void {
            const normalizedLevel = normalizeLevelId(levelId);
            const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
            if (normalizedCount <= 0) {
                if (readStorageInt(LS_DYNAMIC_FAIL_LEVEL) === normalizedLevel) {
                    sys.localStorage.removeItem(LS_DYNAMIC_FAIL_LEVEL);
                    sys.localStorage.removeItem(LS_DYNAMIC_FAIL_COUNT);
                }
                return;
            }
            writeStorageInt(LS_DYNAMIC_FAIL_LEVEL, normalizedLevel);
            writeStorageInt(LS_DYNAMIC_FAIL_COUNT, normalizedCount);
        },

        clearDynamicCountdownFail(levelId?: unknown): void {
            if (levelId !== undefined && readStorageInt(LS_DYNAMIC_FAIL_LEVEL) !== normalizeLevelId(levelId)) {
                return;
            }
            sys.localStorage.removeItem(LS_DYNAMIC_FAIL_LEVEL);
            sys.localStorage.removeItem(LS_DYNAMIC_FAIL_COUNT);
        },

        addDynamicCountdownFail(levelId: unknown = this.getActiveLogicalLevelId?.()): number {
            const normalizedLevel = normalizeLevelId(levelId);
            const nextCount = this.getDynamicCountdownFailCount(normalizedLevel) + 1;
            this.setDynamicCountdownFailCount(normalizedLevel, nextCount);
            return nextCount;
        },

        undoDynamicCountdownFail(levelId: unknown = this.getActiveLogicalLevelId?.()): void {
            const normalizedLevel = normalizeLevelId(levelId);
            const current = this.getDynamicCountdownFailCount(normalizedLevel);
            this.setDynamicCountdownFailCount(normalizedLevel, Math.max(0, current - 1));
        },

        getDynamicCountdownWinStreak(): number {
            return readStorageInt(LS_DYNAMIC_WIN_STREAK);
        },

        setDynamicCountdownWinStreak(value: number): void {
            writeStorageInt(LS_DYNAMIC_WIN_STREAK, value);
        },

        getDynamicCountdownCompressedLevel(): number {
            return readStorageInt(LS_DYNAMIC_COMPRESSED_LEVEL);
        },

        setDynamicCountdownCompressedLevel(levelId: unknown): void {
            writeStorageInt(LS_DYNAMIC_COMPRESSED_LEVEL, normalizeLevelId(levelId));
        },

        clearDynamicCountdownCompressedLevel(levelId?: unknown): void {
            if (levelId !== undefined && this.getDynamicCountdownCompressedLevel() !== normalizeLevelId(levelId)) {
                return;
            }
            sys.localStorage.removeItem(LS_DYNAMIC_COMPRESSED_LEVEL);
        },

        getDynamicCountdownTimeFactor(levelId: unknown = this.getActiveLogicalLevelId?.(), entryMode: unknown = this._activeGameplayEntryMode): number {
            const normalizedLevel = normalizeLevelId(levelId);
            if (!this.isDynamicCountdownEnabledFor(normalizedLevel, entryMode)) {
                return 1;
            }
            const failCount = this.getDynamicCountdownFailCount(normalizedLevel);
            if (failCount >= 3) return DYNAMIC_COUNTDOWN_FAIL_FACTOR_3_PLUS;
            if (failCount >= 2) return DYNAMIC_COUNTDOWN_FAIL_FACTOR_2;
            if (this.getDynamicCountdownCompressedLevel() === normalizedLevel) return DYNAMIC_COUNTDOWN_COMPRESS_FACTOR;
            return 1;
        },

        resolveDynamicCountdownTimeLimit(baseTimeLimit: unknown, levelId: unknown, entryMode: unknown = this._activeGameplayEntryMode): number {
            const baseSeconds = Math.max(0, Math.floor(Number(baseTimeLimit) || 0));
            const factor = baseSeconds > 0 ? this.getDynamicCountdownTimeFactor(levelId, entryMode) : 1;
            const resolvedSeconds = baseSeconds > 0 ? applyTimeFactor(baseSeconds, factor) : baseSeconds;
            this._currentLevelBaseTimeLimit = baseSeconds;
            this._currentLevelDynamicFactor = factor;
            this._currentLevelDynamicTimeLimit = resolvedSeconds;
            this._usedAssistanceThisLevel = false;
            this._ddaFailureRecordedThisLevel = false;
            return resolvedSeconds;
        },

        markDynamicCountdownAssisted(): void {
            if (this.isDynamicCountdownEnabledFor(this.getActiveLogicalLevelId?.(), this._activeGameplayEntryMode)) {
                this._usedAssistanceThisLevel = true;
            }
        },

        isDynamicCountdownCleanWin(): boolean {
            const levelId = this.getActiveLogicalLevelId?.();
            if (!this.isDynamicCountdownEnabledFor(levelId, this._activeGameplayEntryMode)) {
                return false;
            }
            const total = Math.max(0, Math.floor(Number(this._currentLevelDynamicTimeLimit) || 0));
            if (total <= 0 || this._usedAssistanceThisLevel) {
                return false;
            }
            const remainRatio = Math.max(0, Number(this.timeRemain) || 0) / total;
            return remainRatio > DYNAMIC_COUNTDOWN_CLEAN_REMAIN_RATIO;
        },

        recordDynamicCountdownWin(): void {
            const levelId = normalizeLevelId(this.getActiveLogicalLevelId?.());
            if (!this.isDynamicCountdownEnabledFor(levelId, this._activeGameplayEntryMode)) {
                return;
            }
            this.clearDynamicCountdownFail(levelId);
            this.clearDynamicCountdownCompressedLevel(levelId);
            if (!this.isDynamicCountdownCleanWin()) {
                this.setDynamicCountdownWinStreak(0);
                return;
            }
            const nextStreak = this.getDynamicCountdownWinStreak() + 1;
            this.setDynamicCountdownWinStreak(nextStreak);
            if (nextStreak >= DYNAMIC_COUNTDOWN_CLEAN_WIN_TRIGGER) {
                const nextLevel = levelId + 1;
                if (this.isDynamicCountdownEnabledFor(nextLevel, 'main')) {
                    this.setDynamicCountdownCompressedLevel(nextLevel);
                }
            }
        },

        recordDynamicCountdownFinalFail(): void {
            const levelId = normalizeLevelId(this.getActiveLogicalLevelId?.());
            if (!this.isDynamicCountdownEnabledFor(levelId, this._activeGameplayEntryMode) || this._ddaFailureRecordedThisLevel) {
                return;
            }
            this._ddaFailureRecordedThisLevel = true;
            this.addDynamicCountdownFail(levelId);
            this.setDynamicCountdownWinStreak(0);
            this.clearDynamicCountdownCompressedLevel(levelId);
        },

        undoDynamicCountdownRecordedFail(): void {
            if (!this._ddaFailureRecordedThisLevel) {
                return;
            }
            this.undoDynamicCountdownFail(this.getActiveLogicalLevelId?.());
            this._ddaFailureRecordedThisLevel = false;
        },
    });
}
