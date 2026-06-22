import { _decorator, sys } from 'cc';
import { getWeChatMiniGameRuntime } from './MiniGamePlatform';
import { PlatformCloudMgr } from './PlatformCloudMgr';
import { runtimeLog, runtimeWarn } from './RuntimeLog';
import type { UserProfile } from './UserMgr';

const { ccclass } = _decorator;

const LS_LOCAL_LEADERBOARD = 'pdd.leaderboard.local.v1';
const CLOUD_FUNCTION_NAME = 'leaderboard';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const LEADERBOARD_CLOUD_CALL_TIMEOUT_MS = 6000;

type LeaderboardSource = 'wechat-cloud' | 'douyin-cloud' | 'wechat-friend' | 'local-preview';

type LeaderboardRawEntry = {
    uuid: string;
    displayName: string;
    avatarUrl: string;
    progressLevel: number;
    updatedAt: number;
};

export type LeaderboardEntry = LeaderboardRawEntry & {
    rank: number;
};

export type LeaderboardResult = {
    source: LeaderboardSource;
    modeLabel: string;
    entries: LeaderboardEntry[];
    self: LeaderboardEntry | null;
};

@ccclass('LeaderboardMgr')
export class LeaderboardMgr {
    private static _inst: LeaderboardMgr | null = null;
    static get inst(): LeaderboardMgr {
        if (!LeaderboardMgr._inst) LeaderboardMgr._inst = new LeaderboardMgr();
        return LeaderboardMgr._inst;
    }

    private cloudInitPromise: Promise<boolean> | null = null;
    private cloudReady = false;
    private sessionFriendSyncedProgress = 0;
    private sessionCloudSyncedProgress = 0;
    private sessionCloudProfileFingerprint = '';
    private cloudInitDeferred = false; // 游戏启动时立即初始化云开发（原为 true 导致提交进度时云函数从未被调用）
    private friendCloudStorageUnavailableWarned = false;

    /** 启用云开发初始化（打开排行榜时调用） */
    enableCloudInit() {
        this.cloudInitDeferred = false;
        void this.init();
    }

    async init(): Promise<boolean> {
        if (this.cloudInitDeferred) return false;
        if (this.cloudInitPromise) return this.cloudInitPromise;

        this.cloudInitPromise = PlatformCloudMgr.inst.init().then((ready) => {
            this.cloudReady = ready;
            return ready;
        }).catch((error) => {
            this.cloudReady = false;
            console.warn('[LeaderboardMgr] platform cloud init failed:', error);
            return false;
        });

        return this.cloudInitPromise;
    }

    async submitProgress(progressLevel: number, profile: UserProfile): Promise<void> {
        const normalized = this.normalizeProgress(progressLevel);
        if (normalized <= 1) return;

        let cloudSubmitted = false;
        const profileFingerprint = this.buildProfileFingerprint(profile);

        // 1. 微信好友排行：通过 setUserCloudStorage 提交
        if (this.canUseFriendCloudStorage() && normalized > this.sessionFriendSyncedProgress) {
            const friendSubmitted = await this.submitWeChatScore(normalized);
            if (friendSubmitted) {
                this.sessionFriendSyncedProgress = Math.max(this.sessionFriendSyncedProgress, normalized);
            }
        }

        // 2. 全国排行：云函数提交（PC/微信通用）
        const canUseCloud = await this.init();
        const shouldSubmitCloud = canUseCloud && (
            normalized > this.sessionCloudSyncedProgress ||
            profileFingerprint !== this.sessionCloudProfileFingerprint
        );
        if (shouldSubmitCloud) {
            try {
                const result = await this.callLeaderboardCloudFunction<any>('submitProgress', {
                    action: 'submitProgress',
                    uuid: profile.uuid,
                    displayName: profile.displayName,
                    avatarUrl: profile.avatarUrl,
                    progressLevel: normalized,
                });
                if (result?.ok === false) {
                    throw new Error(result.errorMessage || 'submit leaderboard failed');
                }
                cloudSubmitted = true;
                this.sessionCloudSyncedProgress = Math.max(this.sessionCloudSyncedProgress, normalized);
                this.sessionCloudProfileFingerprint = profileFingerprint;
            } catch (error) {
                console.warn('[LeaderboardMgr] submit cloud progress failed:', error);
            }
        }

        // 云函数失败时，本地兜底存储
        if (!cloudSubmitted) {
            this.upsertLocalEntry(profile, normalized);
        }
    }

    /** 通过微信 setUserCloudStorage 提交分数 */
    private async submitWeChatScore(progressLevel: number): Promise<boolean> {
        const wx = this.getWx(false);
        if (!wx?.setUserCloudStorage) {
            this.warnFriendCloudStorageUnavailableOnce('wx.setUserCloudStorage not available');
            return false;
        }
        if (this.isDevtoolsEnv()) {
            this.warnFriendCloudStorageUnavailableOnce('DevTools does not support friend cloud storage');
            return false;
        }

        try {
            if (progressLevel <= 1) {
                runtimeLog('[LeaderboardMgr] skip wx cloud score reset for starter level');
                return false;
            }

            const kvData = {
                key: 'score',
                value: JSON.stringify({
                    wxgame: {
                        score: progressLevel,
                        update_time: Date.now(),
                    },
                }),
            };
            runtimeLog('[LeaderboardMgr] Calling wx.setUserCloudStorage, level:', progressLevel);
            await new Promise<void>((resolve, reject) => {
                wx.setUserCloudStorage({
                    KVDataList: [kvData],
                    success: () => {
                        runtimeLog('[LeaderboardMgr] setUserCloudStorage SUCCESS, level:', progressLevel);
                        resolve();
                    },
                    fail: (err: any) => {
                        reject(err);
                    },
                });
            });
            return true;
        } catch (error: any) {
            const errCode = error?.errCode ?? error?.err_code ?? error?.errno ?? 0;
            // 如果是隐私协议未签署（errno 1026），跳过提交
            const errMsg = error?.errMsg || error?.errCode || '';
            if (error?.errno === 1026 || (errMsg as string).includes('privacy')) {
                runtimeWarn('[LeaderboardMgr] Privacy not configured, skipping cloud storage submission');
                return false;
            }
            if (errCode === -80002 || String(errMsg).toLowerCase().includes('setusercloudstorage:fail')) {
                this.warnFriendCloudStorageUnavailableOnce(`setUserCloudStorage unsupported (${errCode || 'fail'})`);
                return false;
            }
            // 如果是未登录导致的失败，尝试重新登录后再提交
            if (errMsg.includes('login') || errMsg.includes('session') || errMsg.includes('auth') || errMsg.includes('not exist')) {
                runtimeLog('[LeaderboardMgr] Retrying after wx.login...');
                try {
                    const loginOk = await this.loginWeChat();
                    if (loginOk) {
                        runtimeLog('[LeaderboardMgr] wx.login retry success, resubmitting score');
                        const kvData = {
                            key: 'score',
                            value: JSON.stringify({
                                wxgame: {
                                    score: progressLevel,
                                    update_time: Date.now(),
                                },
                            }),
                        };
                        await new Promise<void>((resolve, reject) => {
                            wx.setUserCloudStorage({
                                KVDataList: [kvData],
                                success: () => resolve(),
                                fail: (e: any) => reject(e),
                            });
                        });
                        runtimeLog('[LeaderboardMgr] setUserCloudStorage retry SUCCESS');
                        return true;
                    }
                } catch (retryError) {
                    console.warn('[LeaderboardMgr] setUserCloudStorage retry also failed:', retryError);
                }
            }
            console.warn('[LeaderboardMgr] setUserCloudStorage failed:', error);
        }
        return false;
    }

    /** 调用 wx.login 建立微信会话 */
    private async loginWeChat(): Promise<boolean> {
        try {
            const wx = this.getWx(false);
            if (!wx?.login) return false;
            const res: any = await new Promise((resolve, reject) => {
                wx.login({ success: resolve, fail: reject });
            });
            if (res?.code) {
                runtimeLog('[LeaderboardMgr] wx.login success');
                return true;
            }
        } catch (e) {
            console.warn('[LeaderboardMgr] wx.login failed:', e);
        }
        return false;
    }

    private canUseFriendCloudStorage(): boolean {
        const wx = this.getWx(false);
        return !!wx?.setUserCloudStorage && !this.isDevtoolsEnv();
    }

    async fetchLeaderboard(limit: number = DEFAULT_LIMIT, profile?: UserProfile, source?: 'friend' | 'global'): Promise<LeaderboardResult> {
        const normalizedLimit = this.clampLimit(limit);

        // 好友排行（开放数据域）
        if (source === 'friend') {
            return this.fetchFriendLeaderboard(normalizedLimit, profile);
        }

        // 全服排行：小游戏平台必须走真实云函数；只有非小游戏本地预览才读 localStorage。
        const platform = PlatformCloudMgr.inst.getPlatform();
        if (platform === 'wechat' || platform === 'douyin') {
            if (!(await this.init())) {
                throw new Error(`${platform} cloud is unavailable for leaderboard`);
            }
            try {
                const result = await this.callLeaderboardCloudFunction<any>('getLeaderboard', {
                    action: 'getLeaderboard',
                    limit: normalizedLimit,
                });
                if (result?.ok !== true) {
                    throw new Error(result?.errorMessage || 'fetch leaderboard failed');
                }
                return {
                    source: platform === 'douyin' ? 'douyin-cloud' : 'wechat-cloud',
                    modeLabel: platform === 'douyin' ? '抖音云' : '微信云开发',
                    entries: this.normalizeRankedEntries(result.entries),
                    self: this.normalizeRankedEntry(result.self),
                };
            } catch (error) {
                console.warn('[LeaderboardMgr] fetch cloud leaderboard failed:', error);
                throw error;
            }
        }

        return this.fetchLocalLeaderboard(normalizedLimit, profile);
    }

    /** 好友排行：通过开放数据域 Canvas 渲染，主域不直接渲染列表 */
    private fetchFriendLeaderboard(limit: number, profile?: UserProfile): LeaderboardResult {
        // 开放数据域在独立 Worker 中渲染 Canvas，主域只显示纹理
        // 此处返回空 entries，由 GameCtrl 直接显示 sharedCanvas
        return {
            source: 'wechat-friend',
            modeLabel: '微信好友排行',
            entries: [],
            self: null,
        };
    }

    private fetchLocalLeaderboard(limit: number, profile?: UserProfile): LeaderboardResult {
        const entries = this.readLocalEntries();
        let self: LeaderboardEntry | null = null;
        const ranked = entries.map((entry, index) => {
            const rankedEntry: LeaderboardEntry = {
                rank: index + 1,
                uuid: entry.uuid,
                displayName: entry.displayName,
                avatarUrl: entry.avatarUrl,
                progressLevel: this.normalizeProgress(entry.progressLevel),
                updatedAt: this.normalizeTimestamp(entry.updatedAt),
            };
            if (profile && entry.uuid === profile.uuid) self = rankedEntry;
            return rankedEntry;
        });

        return {
            source: 'local-preview',
            modeLabel: '本地预览数据',
            entries: ranked.slice(0, limit),
            self,
        };
    }

    private upsertLocalEntry(profile: UserProfile, progressLevel: number) {
        const entries = this.readLocalEntries();
        const now = Date.now();
        const idx = entries.findIndex((entry) => entry.uuid === profile.uuid);
        if (idx >= 0) {
            const current = entries[idx];
            const nextProgress = Math.max(this.normalizeProgress(current.progressLevel), progressLevel);
            entries[idx] = {
                uuid: profile.uuid,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
                progressLevel: nextProgress,
                updatedAt: nextProgress > this.normalizeProgress(current.progressLevel)
                    ? now
                    : this.normalizeTimestamp(current.updatedAt),
            };
        } else {
            entries.push({
                uuid: profile.uuid,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
                progressLevel,
                updatedAt: now,
            });
        }

        this.sortEntries(entries);
        sys.localStorage.setItem(LS_LOCAL_LEADERBOARD, JSON.stringify(entries.slice(0, 200)));
    }

    private readLocalEntries(): LeaderboardRawEntry[] {
        const raw = sys.localStorage.getItem(LS_LOCAL_LEADERBOARD);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            const normalized = parsed
                .map((entry) => this.normalizeRawEntry(entry))
                .filter((entry): entry is LeaderboardRawEntry => !!entry);
            this.sortEntries(normalized);
            return normalized;
        } catch (_) {
            return [];
        }
    }

    private normalizeRawEntry(input: any): LeaderboardRawEntry | null {
        const uuid = typeof input?.uuid === 'string' ? input.uuid : '';
        const displayName = typeof input?.displayName === 'string' ? input.displayName.trim() : '';
        if (!uuid || !displayName) return null;
        return {
            uuid,
            displayName,
            avatarUrl: typeof input?.avatarUrl === 'string' ? input.avatarUrl : '',
            progressLevel: this.normalizeProgress(input.progressLevel),
            updatedAt: this.normalizeTimestamp(input.updatedAt),
        };
    }

    private sortEntries(entries: LeaderboardRawEntry[]) {
        entries.sort((a, b) => {
            if (b.progressLevel !== a.progressLevel) return b.progressLevel - a.progressLevel;
            return a.updatedAt - b.updatedAt;
        });
    }

    private normalizeRankedEntries(input: any): LeaderboardEntry[] {
        if (!Array.isArray(input)) return [];
        return input
            .map((entry) => this.normalizeRankedEntry(entry))
            .filter((entry): entry is LeaderboardEntry => !!entry);
    }

    private normalizeRankedEntry(input: any): LeaderboardEntry | null {
        if (!input) return null;
        const uuid = typeof input.uuid === 'string' ? input.uuid : '';
        const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
        if (!displayName) return null;
        return {
            rank: Math.max(0, Math.floor(Number(input.rank) || 0)),
            uuid,
            displayName,
            avatarUrl: typeof input.avatarUrl === 'string' ? input.avatarUrl : '',
            progressLevel: this.normalizeProgress(input.progressLevel),
            updatedAt: this.normalizeTimestamp(input.updatedAt),
        };
    }

    private canUseWeChatCloud(): boolean {
        return PlatformCloudMgr.inst.getPlatform() === 'wechat' && PlatformCloudMgr.inst.canUseCloud();
    }

    private getWx(throwsOnMissing: boolean = true): any {
        const wxRuntime = getWeChatMiniGameRuntime();
        if (!wxRuntime && throwsOnMissing) {
            throw new Error('wx runtime is unavailable');
        }
        return wxRuntime;
    }

    private isDevtoolsEnv(): boolean {
        try {
            const wx = this.getWx(false);
            const info = wx?.getSystemInfoSync?.() || {};
            return typeof info.platform === 'string' && info.platform.toLowerCase() === 'devtools';
        } catch (_) {
            return false;
        }
    }

    private clampLimit(limit: number): number {
        const value = Math.floor(Number(limit) || DEFAULT_LIMIT);
        return Math.max(1, Math.min(MAX_LIMIT, value));
    }

    private normalizeProgress(value: unknown): number {
        return Math.max(1, Math.floor(Number(value) || 1));
    }

    private normalizeTimestamp(value: unknown): number {
        const timestamp = Math.floor(Number(value) || 0);
        return timestamp > 0 ? timestamp : Date.now();
    }

    private buildProfileFingerprint(profile: UserProfile): string {
        return [
            profile.uuid || '',
            profile.displayName || '',
            profile.avatarUrl || '',
            profile.isGuest ? 'guest' : 'wx',
        ].join('|');
    }

    private warnFriendCloudStorageUnavailableOnce(reason: string): void {
        if (this.friendCloudStorageUnavailableWarned) {
            return;
        }
        this.friendCloudStorageUnavailableWarned = true;
        runtimeLog(`[LeaderboardMgr] friend cloud storage skipped: ${reason}`);
    }

    private callLeaderboardCloudFunction<T>(action: string, data: Record<string, unknown>): Promise<T> {
        return this.withTimeout(
            PlatformCloudMgr.inst.callFunction<T>(CLOUD_FUNCTION_NAME, data),
            LEADERBOARD_CLOUD_CALL_TIMEOUT_MS,
            `[LeaderboardMgr] ${action} timeout after ${LEADERBOARD_CLOUD_CALL_TIMEOUT_MS}ms`,
        );
    }

    private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
                if (settled) return;
                settled = true;
                timeoutId = null;
                reject(new Error(message));
            }, timeoutMs);

            const finish = (ok: boolean, payload: T | unknown) => {
                if (settled) return;
                settled = true;
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                ok ? resolve(payload as T) : reject(payload);
            };

            promise.then((value) => finish(true, value), (error) => finish(false, error));
        });
    }
}
