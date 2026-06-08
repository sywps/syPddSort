import { _decorator } from 'cc';
import { WxCloudMgr } from './WxCloudMgr';

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

    private constructor() {}

    canUseCloud(): boolean {
        return !this.cloudDisabledForSession && WxCloudMgr.inst.canUseCloud();
    }

    async loadState(): Promise<CloudUserState | null> {
        if (!this.canUseCloud()) {
            return null;
        }

        try {
            const result = await WxCloudMgr.inst.callFunction<CloudFunctionResult>(CLOUD_FUNCTION_NAME, {
                action: 'get',
            });
            if (result?.ok === false) {
                throw new Error(result.errorMessage || 'load user state failed');
            }
            return {
                profile: result?.profile || null,
                gameState: result?.gameState || null,
            };
        } catch (error) {
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
            return;
        }

        this.pendingPatch = this.mergeState(this.pendingPatch, patch);
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

        this.inflightSave = this.saveNow(patch);
        try {
            return await this.inflightSave;
        } finally {
            this.inflightSave = null;
        }
    }

    private async saveNow(patch: CloudUserState): Promise<boolean> {
        try {
            const result = await WxCloudMgr.inst.callFunction<CloudFunctionResult>(CLOUD_FUNCTION_NAME, {
                action: 'save',
                profile: patch.profile || undefined,
                gameState: patch.gameState || undefined,
            });
            if (result?.ok === false) {
                throw new Error(result.errorMessage || 'save user state failed');
            }
            return true;
        } catch (error) {
            if (this.isExpectedCloudFailure(error)) {
                this.disableCloudForSession('saveNow', error);
            } else {
                console.warn('[UserStateSyncMgr] saveNow failed:', error);
            }
            this.pendingPatch = this.mergeState(patch, this.pendingPatch);
            return false;
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
