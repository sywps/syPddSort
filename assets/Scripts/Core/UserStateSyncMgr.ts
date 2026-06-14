import { _decorator } from 'cc';
import { getMiniGameBuildMode } from './MiniGamePlatform';
import { PlatformCloudMgr } from './PlatformCloudMgr';

const { ccclass } = _decorator;

const CLOUD_FUNCTION_NAME = 'syncUserState';
const SAVE_DEBOUNCE_MS = 600;

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
    brushCount: number;
    magnetCount: number;
    dailySignInClaimedCount: number;
    dailySignInLastClaimDateKey: number;
    themeUnlockedIds: number[];
    themeCompletedIds: number[];
    stateUpdatedAt: number;
};

export type CloudUserState = {
    profile?: Partial<CloudUserProfile> | null;
    gameState?: Partial<CloudGameState> | null;
};

type CloudFunctionResult = {
    ok?: boolean;
    errorMessage?: string;
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
    const logger = isCloudSyncWarnEnabled() ? console.warn : console.log;
    logger('[CloudSync]', phase, payload);
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
                hasProfile: !!result?.profile,
                savedLevel: result?.gameState?.savedLevel ?? null,
            });
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
            console.warn('[UserStateSyncMgr] loadState failed:', error);
            return null;
        }
    }

    queueSave(patch: CloudUserState): void {
        if (!this.canUseCloud()) {
            emitCloudSyncDiagnostic('save:queue-skip', {
                reason: 'cloud_unavailable',
                savedLevel: patch.gameState?.savedLevel ?? null,
                diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
            });
            return;
        }

        this.pendingPatch = this.mergeState(this.pendingPatch, patch);
        emitCloudSyncDiagnostic('save:queued', {
            savedLevel: patch.gameState?.savedLevel ?? null,
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
            emitCloudSyncDiagnostic('save:success', {
                savedLevel: result?.gameState?.savedLevel ?? patch.gameState?.savedLevel ?? null,
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
                message: String((error as any)?.message || error || 'unknown error'),
                diagnostics: PlatformCloudMgr.inst.getDiagnostics(),
            });
            if (this.isExpectedCloudFailure(error)) {
                this.disableCloudForSession('saveNow', error);
            } else {
                console.warn('[UserStateSyncMgr] saveNow failed:', error);
            }
            this.pendingPatch = this.mergeState(patch, this.pendingPatch);
            return false;
        }
    }

    private emitAuthoritativeState(state: CloudUserState): void {
        if (!this.authoritativeStateHandler) {
            return;
        }
        try {
            this.authoritativeStateHandler(state);
        } catch (error) {
            console.warn('[UserStateSyncMgr] authoritative state handler failed:', error);
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
            merged.gameState = {
                ...(base.gameState || {}),
                ...(next.gameState || {}),
            };
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
        console.log(`[UserStateSyncMgr] cloud sync skipped for this session during ${phase}: ${message}`);
    }
}
