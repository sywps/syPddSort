import { sys } from '../GameCtrlShared';

export type DynamicCountdownDdaState = {
    cleanWinStreak: number;
    hardLevel: number;
    failLevel: number;
    failCount: number;
};

export const DYNAMIC_COUNTDOWN_DDA_STORAGE_KEY = 'pdd.dynamicCountdownDda.v1';
export const DYNAMIC_COUNTDOWN_DDA_MIN_LEVEL = 11;
export const DYNAMIC_COUNTDOWN_CLEAN_WIN_STREAK_TRIGGER = 3;
export const DYNAMIC_COUNTDOWN_CLEAN_WIN_REMAIN_RATIO = 0.15;
export const DYNAMIC_COUNTDOWN_HARD_TIME_FACTOR = 0.8;
export const DYNAMIC_COUNTDOWN_SECOND_FAIL_FACTOR = 1.15;
export const DYNAMIC_COUNTDOWN_THIRD_FAIL_FACTOR = 1.3;

const DEFAULT_DDA_STATE: DynamicCountdownDdaState = {
    cleanWinStreak: 0,
    hardLevel: 0,
    failLevel: 0,
    failCount: 0,
};

function normalizePositiveInt(value: unknown): number {
    return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeLevelId(value: unknown): number {
    return Math.max(1, Math.floor(Number(value) || 1));
}

function normalizeTimeLimit(value: unknown): number {
    return Math.max(0, Math.floor(Number(value) || 0));
}

function cloneDefaultState(): DynamicCountdownDdaState {
    return { ...DEFAULT_DDA_STATE };
}

export function normalizeDynamicCountdownDdaState(value: any): DynamicCountdownDdaState {
    if (!value || typeof value !== 'object') {
        return cloneDefaultState();
    }
    return {
        cleanWinStreak: normalizePositiveInt(value.cleanWinStreak),
        hardLevel: normalizePositiveInt(value.hardLevel),
        failLevel: normalizePositiveInt(value.failLevel),
        failCount: normalizePositiveInt(value.failCount),
    };
}

export function getDynamicCountdownFailureFactor(failCount: number): number {
    const count = normalizePositiveInt(failCount);
    if (count < 2) return 1;
    return count === 2 ? DYNAMIC_COUNTDOWN_SECOND_FAIL_FACTOR : DYNAMIC_COUNTDOWN_THIRD_FAIL_FACTOR;
}

export function isDynamicCountdownDdaLevel(levelId: unknown, entryMode: unknown, baseTimeLimit: unknown): boolean {
    return entryMode === 'main'
        && normalizeLevelId(levelId) >= DYNAMIC_COUNTDOWN_DDA_MIN_LEVEL
        && normalizeTimeLimit(baseTimeLimit) > 0;
}

export function resolveDynamicCountdownTime(baseTimeLimit: unknown, levelId: unknown, entryMode: unknown, stateValue: any) {
    const baseTime = normalizeTimeLimit(baseTimeLimit);
    const level = normalizeLevelId(levelId);
    const enabled = isDynamicCountdownDdaLevel(level, entryMode, baseTime);
    const state = normalizeDynamicCountdownDdaState(stateValue);
    let factor = 1;
    let reason: 'disabled' | 'base' | 'fail_compensation' | 'clean_streak_compression' = enabled ? 'base' : 'disabled';

    if (enabled) {
        const failCount = state.failLevel === level ? state.failCount : 0;
        if (failCount >= 2) {
            factor = getDynamicCountdownFailureFactor(failCount);
            reason = 'fail_compensation';
        } else if (state.hardLevel === level) {
            factor = DYNAMIC_COUNTDOWN_HARD_TIME_FACTOR;
            reason = 'clean_streak_compression';
        }
    }

    const dynamicTime = factor < 1
        ? Math.max(1, Math.floor(baseTime * factor))
        : Math.max(0, Math.ceil(baseTime * factor));

    return {
        enabled,
        baseTime,
        dynamicTime,
        factor,
        reason,
    };
}

export function installDynamicCountdownDdaModule(target: any): void {
    Object.assign(target, {
        readDynamicCountdownDdaState(): DynamicCountdownDdaState {
            const raw = sys.localStorage.getItem(DYNAMIC_COUNTDOWN_DDA_STORAGE_KEY);
            if (!raw) {
                return cloneDefaultState();
            }
            try {
                return normalizeDynamicCountdownDdaState(JSON.parse(raw));
            } catch (_error) {
                return cloneDefaultState();
            }
        },

        writeDynamicCountdownDdaState(state: DynamicCountdownDdaState): void {
            sys.localStorage.setItem(
                DYNAMIC_COUNTDOWN_DDA_STORAGE_KEY,
                JSON.stringify(normalizeDynamicCountdownDdaState(state)),
            );
        },

        getDynamicCountdownLevelId(): number {
            if (typeof this.getActiveLogicalLevelId === 'function') {
                return normalizeLevelId(this.getActiveLogicalLevelId());
            }
            return normalizeLevelId(this._activeLogicalLevelId || this.levelData?.levelId);
        },

        getDynamicCountdownEntryMode(): string {
            return this._activeGameplayEntryMode || 'main';
        },

        resolveDynamicCountdownTimeLimit(options: {
            levelId?: unknown;
            entryMode?: unknown;
            baseTimeLimit?: unknown;
        }): number {
            const levelId = normalizeLevelId(options?.levelId ?? this.getDynamicCountdownLevelId());
            const entryMode = options?.entryMode ?? this.getDynamicCountdownEntryMode();
            const baseTimeLimit = normalizeTimeLimit(options?.baseTimeLimit ?? this.levelData?.timeLimit);
            const state = this.readDynamicCountdownDdaState();
            const result = resolveDynamicCountdownTime(baseTimeLimit, levelId, entryMode, state);

            this._dynamicCountdownLevelId = levelId;
            this._dynamicCountdownEntryMode = String(entryMode || '');
            this._dynamicCountdownBaseTimeLimit = result.baseTime;
            this._dynamicCountdownTimeLimit = result.dynamicTime;
            this._dynamicCountdownFactor = result.factor;
            this._dynamicCountdownReason = result.reason;
            this._dynamicCountdownEnabled = result.enabled;
            this._dynamicCountdownAssisted = false;
            this._dynamicCountdownFinalFailureRecorded = false;
            this._dynamicCountdownFinalFailureLevel = 0;

            return result.dynamicTime;
        },

        markDynamicCountdownAssisted(): void {
            if (!this._dynamicCountdownEnabled) return;
            this._dynamicCountdownAssisted = true;
        },

        isDynamicCountdownCleanWin(): boolean {
            if (!this._dynamicCountdownEnabled || this._dynamicCountdownAssisted) return false;
            const total = Math.max(1, normalizeTimeLimit(this._dynamicCountdownTimeLimit));
            const remain = Math.max(0, Number(this.timeRemain) || 0);
            return remain / total > DYNAMIC_COUNTDOWN_CLEAN_WIN_REMAIN_RATIO;
        },

        recordDynamicCountdownWin(): void {
            if (!this._dynamicCountdownEnabled) return;
            const levelId = normalizeLevelId(this._dynamicCountdownLevelId || this.getDynamicCountdownLevelId());
            const state = this.readDynamicCountdownDdaState();
            if (state.failLevel === levelId) {
                state.failLevel = 0;
                state.failCount = 0;
            }
            if (state.hardLevel === levelId) {
                state.hardLevel = 0;
            }

            if (this.isDynamicCountdownCleanWin()) {
                state.cleanWinStreak += 1;
                if (state.cleanWinStreak >= DYNAMIC_COUNTDOWN_CLEAN_WIN_STREAK_TRIGGER) {
                    state.hardLevel = levelId + 1;
                }
            } else {
                state.cleanWinStreak = 0;
            }

            this.writeDynamicCountdownDdaState(state);
            this._dynamicCountdownFinalFailureRecorded = false;
            this._dynamicCountdownFinalFailureLevel = 0;
        },

        recordDynamicCountdownFinalFailure(): void {
            if (!this._dynamicCountdownEnabled || this._dynamicCountdownFinalFailureRecorded) return;
            const levelId = normalizeLevelId(this._dynamicCountdownLevelId || this.getDynamicCountdownLevelId());
            const state = this.readDynamicCountdownDdaState();
            if (state.failLevel === levelId) {
                state.failCount += 1;
            } else {
                state.failLevel = levelId;
                state.failCount = 1;
            }
            state.cleanWinStreak = 0;
            if (state.hardLevel === levelId) {
                state.hardLevel = 0;
            }
            this.writeDynamicCountdownDdaState(state);
            this._dynamicCountdownFinalFailureRecorded = true;
            this._dynamicCountdownFinalFailureLevel = levelId;
        },

        revokeDynamicCountdownFinalFailure(): void {
            if (!this._dynamicCountdownFinalFailureRecorded) return;
            const levelId = normalizeLevelId(this._dynamicCountdownFinalFailureLevel || this._dynamicCountdownLevelId);
            const state = this.readDynamicCountdownDdaState();
            if (state.failLevel === levelId) {
                state.failCount = Math.max(0, state.failCount - 1);
                if (state.failCount <= 0) {
                    state.failLevel = 0;
                    state.failCount = 0;
                }
                this.writeDynamicCountdownDdaState(state);
            }
            this._dynamicCountdownFinalFailureRecorded = false;
            this._dynamicCountdownFinalFailureLevel = 0;
        },
    });
}
