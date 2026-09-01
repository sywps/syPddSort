import { _decorator } from 'cc';
import { getMiniGameBuildMode } from './MiniGamePlatform';
import { PlatformCloudMgr } from './PlatformCloudMgr';
import { runtimeLog, runtimeWarn } from './RuntimeLog';

const { ccclass } = _decorator;

const CLOUD_FUNCTION_NAME = 'syncUserState';
const SAVE_DEBOUNCE_MS = 600;
const SAVE_RETRY_MS = 3000;
const SAVE_RETRY_LIMIT = 3;
const USER_STATE_SCHEMA_VERSION = 2;
const SKIN_STATE_SCHEMA_VERSION = 1;

export type CloudUserProfile = {
    version: number;
    uuid: string;
    displayName: string;
    avatarUrl: string;
    isGuest: boolean;
    createdAt: number;
    lastActiveAt: number;
    loginCount: number;
    lastLevelId: number;
};

export type CloudGameState = {
    savedLevel: number;
    vigor: number;
    vigorTime: number;
    gold: number;
    expandSlotCount: number;
    magicWandCount: number;
    freezeCount: number;
    brushCount: number;
    magnetCount: number;
    themeUnlockedIds: number[];
    themeCompletedIds: number[];
    backgroundSkinOwnedIds?: number[];
    ownedBackgroundSkinIds: number[];
    backgroundSkinAdProgress: Record<string, number>;
    equippedBackgroundSkinId: number;
    equippedBackgroundSkinUpdatedAt: number;
    backgroundSkinResetVersion: number;
    stateUpdatedAt: number;
};

export type CloudUserState = {
    profile?: Partial<CloudUserProfile> | null;
    gameState?: Partial<CloudGameState> | null;
};

type CloudFunctionResult = {
    ok?: boolean;
    errorMessage?: string;
    userStateSchemaVersion?: number;
    skinStateSchemaVersion?: number;
    profile?: Partial<CloudUserProfile> | null;
    gameState?: Partial<CloudGameState> | null;
};

type CloudSyncDiagnosticTarget = {
    __PDD_CLOUD_SYNC_LAST?: unknown;
};

declare const wx: CloudSyncDiagnosticTarget | undefined;
declare const tt: CloudSyncDiagnosticTarget | undefined;
declare const GameGlobal: CloudSyncDiagnosticTarget | undefined;

function getDirectWxDiagnosticTarget(): CloudSyncDiagnosticTarget | null {
    try {
        return typeof wx !== 'undefined' ? wx : null;
    } catch (_) {
        return null;
    }
}

function getGameGlobalDiagnosticTarget(): CloudSyncDiagnosticTarget | null {
    try {
        return typeof GameGlobal !== 'undefined' ? GameGlobal : null;
    } catch (_) {
        return null;
    }
}

function getDirectTtDiagnosticTarget(): CloudSyncDiagnosticTarget | null {
    try {
        return typeof tt !== 'undefined' ? tt : null;
    } catch (_) {
        return null;
    }
}

function isCloudSyncWarnEnabled(): boolean {
    const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const windowScope: any = typeof window !== 'undefined' ? window : null;
    const mode = getMiniGameBuildMode();
    return mode === 'debug' || !!globalScope?.__PDD_CLOUD_SYNC_DEBUG__ || !!windowScope?.__PDD_CLOUD_SYNC_DEBUG__;
}

function shouldEmitCloudSyncDiagnosticLog(): boolean {
    const mode = getMiniGameBuildMode();
    if (mode === 'release') {
        return false;
    }
    return true;
}

function emitCloudSyncDiagnostic(phase: string, detail: Record<string, unknown> = {}): void {
    const payload = {
        phase,
        ts: Date.now(),
        ...detail,
    };
    const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const windowScope: any = typeof window !== 'undefined' ? window : null;
    const targets = [
        globalScope,
        windowScope,
        getDirectWxDiagnosticTarget(),
        getDirectTtDiagnosticTarget(),
        getGameGlobalDiagnosticTarget(),
    ];
    for (const target of targets) {
        if (target) {
            target.__PDD_CLOUD_SYNC_LAST = payload;
        }
    }
    if (!shouldEmitCloudSyncDiagnosticLog()) {
        return;
    }
    const logger = isCloudSyncWarnEnabled() ? runtimeWarn : runtimeLog;
    logger('[CloudSync]', phase, payload);
}

function getDiagnosticEquippedBackgroundSkinId(gameState?: Partial<CloudGameState> | null): number | null {
    const id = Math.max(0, Math.floor(Number(gameState?.equippedBackgroundSkinId) || 0));
    return id > 0 ? id : null;
}

function getDiagnosticEquippedBackgroundSkinUpdatedAt(gameState?: Partial<CloudGameState> | null): number | null {
    const value = Math.max(0, Math.floor(Number(gameState?.equippedBackgroundSkinUpdatedAt) || 0));
    return value > 0 ? value : null;
}

function getEquippedBackgroundSkinPair(gameState?: Partial<CloudGameState> | null): { id: number; updatedAt: number } | null {
    const id = Math.max(0, Math.floor(Number(gameState?.equippedBackgroundSkinId) || 0));
    const updatedAt = Math.max(0, Math.floor(Number(gameState?.equippedBackgroundSkinUpdatedAt) || 0));
    return id > 0 && updatedAt > 0 ? { id, updatedAt } : null;
}

function normalizePositiveInt(value: unknown): number {
    const num = Math.floor(Number(value) || 0);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

function normalizeIdArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    const ids = value
        .map((item) => normalizePositiveInt(item))
        .filter((item) => item > 0);
    return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function includesAllIds(returnedValue: unknown, expectedValue: unknown): boolean {
    const expected = normalizeIdArray(expectedValue);
    if (expected.length === 0) return true;
    const returned = new Set(normalizeIdArray(returnedValue));
    return expected.every((id) => returned.has(id));
}

@ccclass('UserStateSyncMgr')
export class UserStateSyncMgr {
    private static _inst: UserStateSyncMgr | null = null;

    static get inst(): UserStateSyncMgr {
        if (!UserStateSyncMgr._inst) {
            UserStateSyncMgr._inst = new UserStateSyncMgr();
        }
        return UserStateSyncMgr._inst;
    }

    private pendingPatch: CloudUserState | null = null;
    private saveTimer: any = null;
    private inflightSave: Promise<boolean> | null = null;
    private consecutiveSaveFailures = 0;
    private cloudUnavailableWarned = false;
    private cloudDisabledForSession = false;
    private authoritativeStateHandler: ((state: CloudUserState) => void) | null = null;

    private constructor() {}

    setAuthoritativeStateHandler(handler: ((state: CloudUserState) => void) | null): void {
        this.authoritativeStateHandler = handler;
    }

    canUseCloud(): boolean {
        return !this.cloudDisabledForSession && PlatformCloudMgr.inst.canUseCloud();
    }

    async loadState(): Promise<CloudUserState | null> {
        if (!this.canUseCloud()) {
            emitCloudSyncDiagnostic('load:skip', {
                reason: 'cloud_unavailable',
                diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
            });
            return null;
        }

        try {
            emitCloudSyncDiagnostic('load:start', {
                diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
            });
            const result = await PlatformCloudMgr.inst.callFunction<CloudFunctionResult>(CLOUD_FUNCTION_NAME, {
                action: 'get',
            });
            if (result?.ok === false) {
                throw new Error(result.errorMessage || 'load user state failed');
            }
            emitCloudSyncDiagnostic('load:success', {
                userStateSchemaVersion: result?.userStateSchemaVersion ?? null,
                skinStateSchemaVersion: result?.skinStateSchemaVersion ?? null,
                hasProfile: !!result?.profile,
                savedLevel: result?.gameState?.savedLevel ?? null,
                equippedBackgroundSkinId: getDiagnosticEquippedBackgroundSkinId(result?.gameState),
                equippedBackgroundSkinUpdatedAt: getDiagnosticEquippedBackgroundSkinUpdatedAt(result?.gameState),
            });
            if ((result?.skinStateSchemaVersion || 0) < SKIN_STATE_SCHEMA_VERSION && !getEquippedBackgroundSkinPair(result?.gameState)) {
                emitCloudSyncDiagnostic('load:skin-schema-unknown', {
                    skinStateSchemaVersion: result?.skinStateSchemaVersion ?? null,
                    savedLevel: result?.gameState?.savedLevel ?? null,
                    diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
                });
            }
            if ((result?.userStateSchemaVersion || 0) < USER_STATE_SCHEMA_VERSION) {
                emitCloudSyncDiagnostic('load:user-state-schema-unknown', {
                    userStateSchemaVersion: result?.userStateSchemaVersion ?? null,
                    savedLevel: result?.gameState?.savedLevel ?? null,
                    diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
                });
            }
            return {
                profile: result?.profile || null,
                gameState: result?.gameState || null,
            };
        } catch (error) {
            emitCloudSyncDiagnostic('load:fail', {
                message: String((error as any)?.message || error || 'unknown error'),
                diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
            });
            if (this.isExpectedCloudFailure(error)) {
                this.disableCloudForSession('loadState', error);
                return null;
            }
            runtimeWarn('[UserStateSyncMgr] loadState failed:', error);
            return null;
        }
    }

    queueSave(patch: CloudUserState): void {
        if (!this.canUseCloud()) {
            emitCloudSyncDiagnostic('save:queue-skip', {
                reason: 'cloud_unavailable',
                savedLevel: patch.gameState?.savedLevel ?? null,
                equippedBackgroundSkinId: getDiagnosticEquippedBackgroundSkinId(patch.gameState),
                equippedBackgroundSkinUpdatedAt: getDiagnosticEquippedBackgroundSkinUpdatedAt(patch.gameState),
                diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
            });
            return;
        }

        this.pendingPatch = this.mergeState(this.pendingPatch, patch);
        emitCloudSyncDiagnostic('save:queued', {
            savedLevel: patch.gameState?.savedLevel ?? null,
            equippedBackgroundSkinId: getDiagnosticEquippedBackgroundSkinId(patch.gameState),
            equippedBackgroundSkinUpdatedAt: getDiagnosticEquippedBackgroundSkinUpdatedAt(patch.gameState),
            hasProfile: !!patch.profile,
            hasGameState: !!patch.gameState,
        });
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.flushPendingSave();
        }, SAVE_DEBOUNCE_MS);
    }

    async flushPendingSave(): Promise<boolean> {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        if (!this.pendingPatch) {
            return false;
        }

        if (this.inflightSave) {
            await this.inflightSave.catch(() => undefined);
            if (!this.pendingPatch) {
                return false;
            }
        }

        const patch = this.pendingPatch;
        this.pendingPatch = null;

        emitCloudSyncDiagnostic('save:flush', {
            savedLevel: patch.gameState?.savedLevel ?? null,
            equippedBackgroundSkinId: getDiagnosticEquippedBackgroundSkinId(patch.gameState),
            equippedBackgroundSkinUpdatedAt: getDiagnosticEquippedBackgroundSkinUpdatedAt(patch.gameState),
            hasProfile: !!patch.profile,
            hasGameState: !!patch.gameState,
        });
        this.inflightSave = this.saveNow(patch);
        try {
            return await this.inflightSave;
        } finally {
            this.inflightSave = null;
        }
    }

    private async saveNow(patch: CloudUserState): Promise<boolean> {
        try {
            emitCloudSyncDiagnostic('save:start', {
                savedLevel: patch.gameState?.savedLevel ?? null,
                equippedBackgroundSkinId: getDiagnosticEquippedBackgroundSkinId(patch.gameState),
                equippedBackgroundSkinUpdatedAt: getDiagnosticEquippedBackgroundSkinUpdatedAt(patch.gameState),
                diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
            });
            const result = await PlatformCloudMgr.inst.callFunction<CloudFunctionResult>(CLOUD_FUNCTION_NAME, {
                action: 'save',
                profile: patch.profile || undefined,
                gameState: patch.gameState || undefined,
            });
            if (result?.ok === false) {
                throw new Error(result.errorMessage || 'save user state failed');
            }
            this.assertUserStateAcknowledged(patch, result);
            this.consecutiveSaveFailures = 0;
            emitCloudSyncDiagnostic('save:success', {
                userStateSchemaVersion: result?.userStateSchemaVersion ?? null,
                skinStateSchemaVersion: result?.skinStateSchemaVersion ?? null,
                savedLevel: result?.gameState?.savedLevel ?? patch.gameState?.savedLevel ?? null,
                equippedBackgroundSkinId: getDiagnosticEquippedBackgroundSkinId(result?.gameState || patch.gameState),
                equippedBackgroundSkinUpdatedAt: getDiagnosticEquippedBackgroundSkinUpdatedAt(result?.gameState || patch.gameState),
                hasProfile: !!result?.profile,
                hasGameState: !!result?.gameState,
            });
            if (result?.profile || result?.gameState) {
                this.emitAuthoritativeState({
                    profile: result.profile || null,
                    gameState: result.gameState || null,
                });
            }
            return true;
        } catch (error) {
            emitCloudSyncDiagnostic('save:fail', {
                savedLevel: patch.gameState?.savedLevel ?? null,
                equippedBackgroundSkinId: getDiagnosticEquippedBackgroundSkinId(patch.gameState),
                equippedBackgroundSkinUpdatedAt: getDiagnosticEquippedBackgroundSkinUpdatedAt(patch.gameState),
                message: String((error as any)?.message || error || 'unknown error'),
                diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
            });
            const expectedFailure = this.isExpectedCloudFailure(error);
            if (expectedFailure) {
                this.disableCloudForSession('saveNow', error);
            } else {
                runtimeWarn('[UserStateSyncMgr] saveNow failed:', error);
            }
            this.pendingPatch = this.mergeState(patch, this.pendingPatch);
            if (!expectedFailure) {
                this.schedulePendingSaveRetry();
            }
            return false;
        }
    }

    private assertUserStateAcknowledged(patch: CloudUserState, result: CloudFunctionResult | null | undefined): void {
        const problems: Record<string, unknown> = {};
        const patchGameState = patch.gameState || null;
        const returnedGameState = result?.gameState || null;
        const patchProfile = patch.profile || null;
        const returnedProfile = result?.profile || null;
        const expectedSavedLevel = normalizePositiveInt(patchGameState?.savedLevel);
        const returnedSavedLevel = normalizePositiveInt(returnedGameState?.savedLevel);
        if (expectedSavedLevel > 0 && returnedSavedLevel < expectedSavedLevel) {
            problems.savedLevel = { expectedAtLeast: expectedSavedLevel, returned: returnedSavedLevel || null };
        }
        const expectedProfileLevel = normalizePositiveInt(patchProfile?.lastLevelId);
        const expectedProgress = Math.max(expectedSavedLevel, expectedProfileLevel);
        const returnedProfileLevel = normalizePositiveInt(returnedProfile?.lastLevelId);
        if (expectedProgress > 0) {
            if (returnedSavedLevel < expectedProgress) {
                problems.savedLevelMirror = { expectedAtLeast: expectedProgress, returned: returnedSavedLevel || null };
            }
            if (returnedProfileLevel < expectedProgress) {
                problems.lastLevelIdMirror = { expectedAtLeast: expectedProgress, returned: returnedProfileLevel || null };
            }
        }
        this.collectArrayAcknowledgementProblem(problems, 'themeUnlockedIds', patchGameState?.themeUnlockedIds, returnedGameState?.themeUnlockedIds);
        this.collectArrayAcknowledgementProblem(problems, 'themeCompletedIds', patchGameState?.themeCompletedIds, returnedGameState?.themeCompletedIds);
        this.collectArrayAcknowledgementProblem(problems, 'ownedBackgroundSkinIds', patchGameState?.ownedBackgroundSkinIds, returnedGameState?.ownedBackgroundSkinIds);

        const expected = getEquippedBackgroundSkinPair(patch.gameState);
        const returned = getEquippedBackgroundSkinPair(result?.gameState);
        if (expected) {
            const acknowledged = !!returned
                && returned.id === expected.id
                && returned.updatedAt >= expected.updatedAt;
            if (!acknowledged) {
                problems.equippedBackgroundSkin = {
                    expectedId: expected.id,
                    expectedUpdatedAt: expected.updatedAt,
                    returnedId: returned?.id ?? null,
                    returnedUpdatedAt: returned?.updatedAt ?? null,
                };
            }
        }

        if (Object.keys(problems).length === 0) {
            return;
        }
        emitCloudSyncDiagnostic('save:user-state-not-acknowledged', {
            problems,
            userStateSchemaVersion: result?.userStateSchemaVersion ?? null,
            skinStateSchemaVersion: result?.skinStateSchemaVersion ?? null,
            hasGameState: !!result?.gameState,
            diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
        });
        throw new Error('syncUserState did not acknowledge critical user state');
    }

    private collectArrayAcknowledgementProblem(
        problems: Record<string, unknown>,
        key: 'themeUnlockedIds' | 'themeCompletedIds' | 'ownedBackgroundSkinIds',
        expectedValue: unknown,
        returnedValue: unknown,
    ): void {
        if (includesAllIds(returnedValue, expectedValue)) {
            return;
        }
        problems[key] = {
            expectedIncluded: normalizeIdArray(expectedValue),
            returned: normalizeIdArray(returnedValue),
        };
    }

    private schedulePendingSaveRetry(): void {
        if (!this.pendingPatch || this.saveTimer || this.cloudDisabledForSession) {
            return;
        }
        this.consecutiveSaveFailures += 1;
        if (this.consecutiveSaveFailures > SAVE_RETRY_LIMIT) {
            emitCloudSyncDiagnostic('save:retry-stop', {
                failures: this.consecutiveSaveFailures,
                reason: 'retry_limit',
                equippedBackgroundSkinId: getDiagnosticEquippedBackgroundSkinId(this.pendingPatch.gameState),
                equippedBackgroundSkinUpdatedAt: getDiagnosticEquippedBackgroundSkinUpdatedAt(this.pendingPatch.gameState),
            });
            return;
        }
        emitCloudSyncDiagnostic('save:retry-scheduled', {
            delayMs: SAVE_RETRY_MS,
            failures: this.consecutiveSaveFailures,
            equippedBackgroundSkinId: getDiagnosticEquippedBackgroundSkinId(this.pendingPatch.gameState),
            equippedBackgroundSkinUpdatedAt: getDiagnosticEquippedBackgroundSkinUpdatedAt(this.pendingPatch.gameState),
        });
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.flushPendingSave();
        }, SAVE_RETRY_MS);
    }

    private emitAuthoritativeState(state: CloudUserState): void {
        if (!this.authoritativeStateHandler) {
            return;
        }
        try {
            this.authoritativeStateHandler(state);
        } catch (error) {
            runtimeWarn('[UserStateSyncMgr] authoritative state handler failed:', error);
        }
    }

    private mergeState(base: CloudUserState | null, next: CloudUserState | null): CloudUserState | null {
        if (!base && !next) return null;
        if (!base) return next;
        if (!next) return base;

        const merged: CloudUserState = {};
        if (base.profile || next.profile) {
            merged.profile = {
                ...(base.profile || {}),
                ...(next.profile || {}),
            };
        }
        if (base.gameState || next.gameState) {
            const baseGameState = base.gameState || {};
            const nextGameState = next.gameState || {};
            const mergedGameState: Partial<CloudGameState> = {
                ...baseGameState,
                ...nextGameState,
            };
            merged.gameState = mergedGameState;
        }
        return merged;
    }

    private isExpectedCloudFailure(error: unknown): boolean {
        const message = String((error as any)?.message || error || '').toLowerCase();
        if (!message) {
            return false;
        }
        return (
            message.includes('cloud.callfunction:fail') ||
            message.includes('douyin cloud') ||
            message.includes('system error') ||
            message.includes('environment not found') ||
            message.includes('function not found') ||
            message.includes('collection') && message.includes('not exist')
        );
    }

    private disableCloudForSession(phase: 'loadState' | 'saveNow', error: unknown): void {
        this.cloudDisabledForSession = true;
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (this.cloudUnavailableWarned) {
            return;
        }
        this.cloudUnavailableWarned = true;
        const message = String((error as any)?.message || error || 'unknown error');
        if (shouldEmitCloudSyncDiagnosticLog()) {
            runtimeLog(`[UserStateSyncMgr] cloud sync skipped for this session during ${phase}: ${message}`);
        }
    }
}
