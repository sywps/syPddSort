import { _decorator, sys } from 'cc';
import { UserStateSyncMgr, type CloudUserProfile } from './UserStateSyncMgr';

const { ccclass } = _decorator;

const LS_USER_PROFILE = 'pdd.user.profile.v1';
const USER_PROFILE_VERSION = 1;

export type UserProfile = {
    version: number;
    uuid: string;
    displayName: string;
    avatarUrl: string;       // 微信头像 URL
    isGuest: boolean;
    createdAt: number;
    lastActiveAt: number;
    loginCount: number;
    lastLevelId: number;
};

@ccclass('UserMgr')
export class UserMgr {
    private static _inst: UserMgr | null = null;
    static get inst(): UserMgr {
        if (!UserMgr._inst) UserMgr._inst = new UserMgr();
        return UserMgr._inst;
    }

    private profile: UserProfile;
    private sessionTouched = false;

    private constructor() {
        this.profile = this.loadProfile();
    }

    getProfile(): UserProfile {
        return this.profile;
    }

    getCloudProfile(): CloudUserProfile {
        return {
            version: this.profile.version,
            uuid: this.profile.uuid,
            displayName: this.profile.displayName,
            avatarUrl: this.profile.avatarUrl,
            isGuest: this.profile.isGuest,
            createdAt: this.profile.createdAt,
            lastActiveAt: this.profile.lastActiveAt,
            loginCount: this.profile.loginCount,
            lastLevelId: this.profile.lastLevelId,
        };
    }

    getUuid(): string {
        return this.profile.uuid;
    }

    touchSession(syncCloud: boolean = true) {
        const now = Date.now();
        this.profile.lastActiveAt = now;
        if (!this.sessionTouched) {
            this.sessionTouched = true;
            this.profile.loginCount += 1;
        }
        this.persist(this.profile, syncCloud);
    }

    markLevelProgress(levelId: number, allowRegression: boolean = false) {
        const normalized = Math.max(1, Math.floor(levelId || 1));
        const currentLevel = Math.max(1, Math.floor(Number(this.profile.lastLevelId) || 1));
        this.profile.lastLevelId = allowRegression ? normalized : Math.max(currentLevel, normalized);
        this.profile.lastActiveAt = Date.now();
        this.persist();
    }

    applyCloudProfile(source: Partial<CloudUserProfile> | null | undefined): void {
        if (!source) {
            return;
        }

        const cloud = this.normalizeProfile(source);
        const local = this.profile;
        const preferCloudIdentity =
            (!cloud.isGuest && local.isGuest) ||
            cloud.lastLevelId > local.lastLevelId ||
            cloud.loginCount > local.loginCount ||
            cloud.lastActiveAt > local.lastActiveAt;

        const merged: UserProfile = {
            version: Math.max(local.version, cloud.version),
            uuid: preferCloudIdentity && cloud.uuid ? cloud.uuid : (local.uuid || cloud.uuid),
            displayName: preferCloudIdentity
                ? (cloud.displayName || local.displayName)
                : (local.displayName || cloud.displayName),
            avatarUrl: preferCloudIdentity
                ? (cloud.avatarUrl || local.avatarUrl)
                : (local.avatarUrl || cloud.avatarUrl),
            isGuest: local.isGuest && cloud.isGuest,
            createdAt: Math.min(local.createdAt || cloud.createdAt, cloud.createdAt || local.createdAt),
            lastActiveAt: Math.max(local.lastActiveAt, cloud.lastActiveAt),
            loginCount: Math.max(local.loginCount, cloud.loginCount),
            lastLevelId: Math.max(local.lastLevelId, cloud.lastLevelId),
        };

        this.profile = merged;
        this.persist(merged, false);
    }

    /** 微信登录（静默），获取 code 建立会话 */
    async loginWeChat(): Promise<boolean> {
        try {
            const w: any = typeof window !== 'undefined' ? window : null;
            if (!w?.wx?.login) {
                console.log('[UserMgr] wx.login not available, skipping');
                return false;
            }

            const res = await new Promise<any>((resolve, reject) => {
                w.wx.login({ success: resolve, fail: reject });
            });

            if (res?.code) {
                console.log('[UserMgr] wx.login success, code:', res.code.substring(0, 10) + '...');
                return true;
            }
        } catch (e: any) {
            console.warn('[UserMgr] wx.login failed:', e?.errMsg || e);
        }
        return false;
    }

    /** 检查是否已完成微信授权 */
    get isWeChatAuthorized(): boolean {
        return !this.profile.isGuest;
    }

    /** 创建微信授权按钮（支持自定义位置） */
    createUserInfoButton(x: number, y: number, width: number, height: number): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            try {
                const w: any = typeof window !== 'undefined' ? window : null;
                const wxRuntime = w?.wx;
                if (!wxRuntime) {
                    console.warn('[UserMgr] wx runtime not available');
                    resolve(false);
                    return;
                }

                if (typeof wxRuntime.getUserProfile === 'function') {
                    wxRuntime.getUserProfile({
                        desc: '用于显示微信头像和昵称',
                        success: (res: any) => {
                            if (this._applyWeChatUserInfo(res?.userInfo)) {
                                resolve(true);
                                return;
                            }
                            resolve(false);
                        },
                        fail: (err: any) => {
                            console.warn('[UserMgr] wx.getUserProfile failed:', err?.errMsg || err);
                            resolve(false);
                        },
                    });
                    return;
                }

                if (!wxRuntime.createUserInfoButton) {
                    console.warn('[UserMgr] wx.createUserInfoButton not available');
                    resolve(false);
                    return;
                }

                const scaledFontSize = Math.max(12, Math.round(height * 0.36));
                const button = wxRuntime.createUserInfoButton({
                    type: 'text',
                    text: '授权微信头像和昵称',
                    style: {
                        left: x,
                        top: y,
                        width: width,
                        height: height,
                        backgroundColor: '#4CAF50',
                        color: '#FFFFFF',
                        textAlign: 'center',
                        fontSize: scaledFontSize,
                        borderRadius: 8,
                        lineHeight: Math.round(height),
                    }
                });

                button.onTap((res: any) => {
                    const ok = this._applyWeChatUserInfo(res?.userInfo);
                    button.destroy();
                    resolve(ok);
                });
            } catch (e: any) {
                console.warn('[UserMgr] createUserInfoButton failed:', e);
                resolve(false);
            }
        });
    }

    private _applyWeChatUserInfo(info: any): boolean {
        if (!info) {
            console.log('[UserMgr] 用户取消授权');
            return false;
        }
        this.profile.displayName = info.nickName || this.profile.displayName;
        this.profile.avatarUrl = info.avatarUrl || this.profile.avatarUrl;
        this.profile.isGuest = false;
        this.persist();
        console.log('[UserMgr] 微信授权成功:', this.profile.displayName);
        return true;
    }

    /** 微信授权登录（旧 API 兼容，已废弃，保留仅用于向后兼容） */
    async authorizeWeChat(): Promise<boolean> {
        // 已废弃，请使用 createUserInfoButtonWithPosition
        console.warn('[UserMgr] authorizeWeChat 已废弃，请使用 createUserInfoButtonWithPosition');
        return this.createUserInfoButton(0, 0, 300, 60);
    }

    async copyUuid(): Promise<boolean> {
        const text = this.profile.uuid;
        try {
            const w: any = typeof window !== 'undefined' ? window : null;
            if (w?.tt?.setClipboardData) {
                return await new Promise<boolean>((resolve) => {
                    w.tt.setClipboardData({
                        data: text,
                        success: () => resolve(true),
                        fail: () => resolve(false),
                    });
                });
            }

            const nav: any = typeof navigator !== 'undefined' ? navigator : null;
            if (nav?.clipboard?.writeText) {
                await nav.clipboard.writeText(text);
                return true;
            }

            const doc: any = typeof document !== 'undefined' ? document : null;
            if (doc?.createElement && doc?.body) {
                const textarea = doc.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', 'readonly');
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                doc.body.appendChild(textarea);
                textarea.select();
                textarea.setSelectionRange(0, text.length);
                const ok = typeof doc.execCommand === 'function' ? !!doc.execCommand('copy') : false;
                doc.body.removeChild(textarea);
                return ok;
            }
        } catch (_) {
            return false;
        }
        return false;
    }

    private loadProfile(): UserProfile {
        const raw = sys.localStorage.getItem(LS_USER_PROFILE);
        if (!raw) {
            const created = this.createProfile();
            this.persist(created, false);
            return created;
        }

        try {
            const parsed = JSON.parse(raw) as Partial<UserProfile>;
            const normalized = this.normalizeProfile(parsed);
            this.persist(normalized, false);
            return normalized;
        } catch (_) {
            const created = this.createProfile();
            this.persist(created, false);
            return created;
        }
    }

    private normalizeProfile(source: Partial<UserProfile>): UserProfile {
        const fallbackUuid = typeof source.uuid === 'string' && source.uuid ? source.uuid : this.generateUuid();
        const createdAt = this.normalizeTimestamp(source.createdAt);
        const lastActiveAt = this.normalizeTimestamp(source.lastActiveAt) || createdAt;
        const loginCount = Math.max(0, Math.floor(Number(source.loginCount) || 0));
        const lastLevelId = Math.max(1, Math.floor(Number(source.lastLevelId) || 1));
        const displayNameRaw = typeof source.displayName === 'string' ? source.displayName.trim() : '';

        return {
            version: USER_PROFILE_VERSION,
            uuid: fallbackUuid,
            displayName: displayNameRaw || `游客${fallbackUuid.slice(0, 8).toUpperCase()}`,
            avatarUrl: typeof source.avatarUrl === 'string' ? source.avatarUrl : '',
            isGuest: source.isGuest !== false,
            createdAt,
            lastActiveAt,
            loginCount,
            lastLevelId,
        };
    }

    private createProfile(): UserProfile {
        const uuid = this.generateUuid();
        const now = Date.now();
        return {
            version: USER_PROFILE_VERSION,
            uuid,
            displayName: `游客${uuid.slice(0, 8).toUpperCase()}`,
            avatarUrl: '',
            isGuest: true,
            createdAt: now,
            lastActiveAt: now,
            loginCount: 0,
            lastLevelId: 1,
        };
    }

    private normalizeTimestamp(value: unknown): number {
        const num = Math.floor(Number(value) || 0);
        return num > 0 ? num : Date.now();
    }

    private persist(profile: UserProfile = this.profile, syncCloud: boolean = true) {
        sys.localStorage.setItem(LS_USER_PROFILE, JSON.stringify(profile));
        if (syncCloud) {
            UserStateSyncMgr.inst.queueSave({
                profile: this.getCloudProfile(),
            });
        }
    }

    private generateUuid(): string {
        const w: any = typeof window !== 'undefined' ? window : null;
        if (w?.crypto?.randomUUID) {
            return w.crypto.randomUUID();
        }

        const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
        return template.replace(/[xy]/g, (char) => {
            const rand = Math.floor(Math.random() * 16);
            const value = char === 'x' ? rand : ((rand & 0x3) | 0x8);
            return value.toString(16);
        });
    }
}
