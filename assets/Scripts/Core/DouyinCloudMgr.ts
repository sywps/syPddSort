import { _decorator } from 'cc';
import { getDouyinMiniGameRuntime, isDouyinMiniGameRuntime } from './MiniGamePlatform';
const { ccclass } = _decorator;
const OWNER_KEY = 'pdd.business.owner.douyin_dev.v1';
const ENDPOINTS = new Set(['syncUserState', 'updateUserProfileAssets', 'coopService', 'pvpService']);
function config(): any {
    const scope: any = globalThis, value = scope.__PDD_DOUYIN_BUSINESS__;
    if (!isDouyinMiniGameRuntime() || value?.mode !== 'dev' || value.envID !== 'env-nvk6FNcrq5' ||
        value.serviceID !== '1m0ub3f29wtv7' || scope.__PDD_DOUYIN_CLOUD_ENV__ !== value.envID) return null;
    return value;
}
@ccclass('DouyinCloudMgr')
export class DouyinCloudMgr {
    private static _inst: DouyinCloudMgr | null = null;
    static get inst(): DouyinCloudMgr {
        if (!this._inst) this._inst = new DouyinCloudMgr();
        return this._inst;
    }
    private cloudInitPromise: Promise<boolean> | null = null;
    private cloudReady = false;
    private owner = '';
    private sdkRoleId = '';
    private lastError = '';
    private constructor() {}
    canUseCloud(): boolean { return !!config() && typeof getDouyinMiniGameRuntime()?.createCloud === 'function'; }
    getDiagnostics(): Record<string, unknown> {
        return { platform: 'douyin', businessMode: config()?.mode || 'off', cloudEnv: config()?.envID || '',
            serviceID: config()?.serviceID || '', hasCreateCloud: typeof getDouyinMiniGameRuntime()?.createCloud === 'function',
            cloudReady: this.cloudReady, identityVerified: !!this.owner, sdkRoleIdentityReady: !!this.sdkRoleId, lastError: this.lastError,
            configurationError: config() ? '' : 'douyin_business_dev_not_configured' };
    }
    get isCloudReady(): boolean { return this.cloudReady; }
    async getSdkRoleId(): Promise<string> {
        if (!await this.init()) throw Error(this.lastError || '业务云身份不可用');
        if (!this.sdkRoleId) throw Error('业务云缺少 SDK 角色编号，请先发布新版 businessCommon.js');
        return this.sdkRoleId;
    }
    async init(): Promise<boolean> {
        if (!this.canUseCloud()) return false;
        if (this.cloudReady) return true;
        if (this.cloudInitPromise) return this.cloudInitPromise;
        const attempt = (async () => {
            try {
                const result = await this.request('businessIdentity', {});
                if (!result.ok || !/^[a-f0-9]{64}$/.test(result.subjectId || '')) throw Error(result.errorMessage || '业务云身份校验失败');
                const tt = getDouyinMiniGameRuntime();
                // Never upload shared local state after switching to a different account.
                const storedOwner = tt.getStorageSync(OWNER_KEY);
                if (storedOwner && storedOwner !== result.subjectId) throw Error('业务云账号已变化，本机存档暂不上传，请先处理账号切换');
                tt.setStorageSync(OWNER_KEY, result.subjectId);
                if (tt.getStorageSync(OWNER_KEY) !== result.subjectId) throw Error('业务云账号绑定保存失败');
                this.owner = result.subjectId; this.cloudReady = true; this.lastError = '';
                this.sdkRoleId = result.sdkRoleIdVersion === 1 && /^[a-f0-9]{32}$/.test(result.sdkRoleId || '') ? result.sdkRoleId : '';
                return true;
            } catch (error) {
                this.cloudReady = false;
                this.sdkRoleId = '';
                this.lastError = String((error as Error)?.message || '业务云初始化失败');
                console.warn('[DouyinCloudMgr]', this.lastError);
                return false;
            }
        })();
        this.cloudInitPromise = attempt;
        try { return await attempt; } finally { if (this.cloudInitPromise === attempt) this.cloudInitPromise = null; }
    }
    async callFunction<T = any>(name: string, data: Record<string, unknown> = {}): Promise<T> {
        if (!ENDPOINTS.has(name)) throw Error('抖音业务云暂未接入接口：' + name);
        if (!await this.init()) throw Error(this.lastError || '抖音业务云未配置或不可用');
        const result = await this.request(name, { ...data, expectedOwner: this.owner });
        if (result.errorCode === 'OWNER_MISMATCH') {
            this.sdkRoleId = '';
            this.cloudReady = false; this.lastError = '登录账号已变化，本机存档暂不上传';
            throw Error(this.lastError);
        }
        if (result.ok && result.ownerKey !== this.owner) throw Error('业务云返回的账号不匹配');
        return result as T;
    }
    private async request(name: string, data: Record<string, unknown>): Promise<any> {
        const settings = config();
        if (!settings) throw Error('抖音业务云未配置');
        const client = getDouyinMiniGameRuntime().createCloud({ envID: settings.envID, serviceID: settings.serviceID });
        return new Promise((resolve, reject) => {
            let done = false;
            const finish = (error: Error | null, result?: any) => {
                if (done) return;
                done = true; clearTimeout(timer);
                if (error) reject(error); else resolve(result);
            };
            const timer = setTimeout(() => finish(Error('业务云请求超时，请稍后重试')), 16000);
            try {
                const request = client.callContainer({ path: '/' + name,
                    init: { method: 'POST', header: { 'content-type': 'application/json' }, body: data, timeout: 15000 },
                    success(res: any) {
                        if (res?.statusCode !== 200) return finish(Error('业务云 HTTP 请求失败'));
                        let result;
                        try { result = typeof res.data === 'string' ? JSON.parse(res.data) : res.data; }
                        catch (_) { return finish(Error('业务云返回格式错误')); }
                        if (!result || typeof result.ok !== 'boolean' || result.businessEnvironment !== 'douyin_dev' || result.businessSchemaVersion !== 1) return finish(Error('业务云返回版本或环境不匹配'));
                        finish(null, result);
                    }, fail() { finish(Error('业务云网络请求失败，请稍后重试')); }
                });
                if (request?.catch) request.catch(() => finish(Error('业务云请求失败')));
            } catch (_) { finish(Error('业务云调用失败')); }
        });
    }
}
