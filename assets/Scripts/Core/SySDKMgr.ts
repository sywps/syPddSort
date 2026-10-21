import { runtimeLog } from './RuntimeLog';
import { installLocalWeChatPassiveShare } from '../Platform/WeChatShareReturnService';
import { isDouyinMiniGameRuntime, getDouyinMiniGameRuntime } from './MiniGamePlatform';
import { DouyinCloudMgr } from './DouyinCloudMgr';

// 不在模块顶层捕获，延迟到每次调用时从 globalThis 读取，防止时序问题
function getSygame() {
    return (globalThis as any).Sygame;
}

function loadSygame() {
    const g = globalThis as any;
    if (g.Sygame) return g.Sygame;
    const loader = g.__PDD_LOAD_SYSDK__;
    if (typeof loader !== 'function') {
        console.error('[SySDK] deferred SDK loader is unavailable');
        return null;
    }
    try {
        return loader();
    } catch (error) {
        console.error('[SySDK] deferred SDK load failed:', error);
        return null;
    }
}

function isSySdkDebugEnabled(): boolean {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
    if (g?.__PDD_DEBUG_LOGS__ || g?.__PDD_SYSDK_DEBUG__) return true;
    const loc = g?.location || g?.window?.location;
    const search = String(loc?.search || '');
    return /(?:^|[?&])(?:debug|pddDebug|sySdkDebug)=1(?:&|$)/.test(search);
}

function sySdkDebug(...args: unknown[]): void {
    if (!isSySdkDebugEnabled()) return;
    runtimeLog(...args);
}

sySdkDebug('[SySDK] module eval');

class SySDKMgr {
    static inst = new SySDKMgr();
    private _inited = false;
    private _disabledForPreview = false;
    private _loginPromise: Promise<boolean> | null = null;
    private _loginSucceeded = false;
    private _adCount = 0;
    private _levelEnded = true;  // 初始为true，防止未进入关卡时误报exit
    private _rewardSequence = 0;
    private _rewardSessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    private readonly _douyinRoleIdentity = () => DouyinCloudMgr.inst.getSdkRoleId();

    private getDouyinSdk(): any {
        if (!isDouyinMiniGameRuntime() || !getDouyinMiniGameRuntime()) return null;
        const g = globalThis as any;
        try {
            const sdk = g.__PDD_DOUYIN_SYSDK__ || g.__PDD_LOAD_DOUYIN_SYSDK__?.();
            if (!sdk) throw new Error('Douyin SDK loader unavailable');
            sdk.setRoleIdentityProvider(this._douyinRoleIdentity);
            return sdk;
        } catch (error) {
            console.error('[DouyinSySDK] load failed:', error);
            return null;
        }
    }

    getDouyinSidebarState(): { canShow: boolean; eligibleToday: boolean; error?: string } {
        return this.getDouyinSdk()?.getSidebarState() || { canShow: false, eligibleToday: false, error: 'sdk_unavailable' };
    }

    subscribeDouyinSidebar(listener: (state: { canShow: boolean; eligibleToday: boolean }) => void): () => void {
        const sdk = this.getDouyinSdk();
        if (!sdk) {
            listener({ canShow: false, eligibleToday: false });
            return () => {};
        }
        return sdk.subscribeSidebar(listener);
    }

    refreshDouyinSidebar(): void {
        const sdk = this.getDouyinSdk();
        // The adapter logs an explicit failure and clears visibility on error.
        if (sdk) void sdk.refreshSidebar().catch(() => {});
    }

    openDouyinSidebar(): Promise<boolean> {
        const sdk = this.getDouyinSdk();
        return sdk ? sdk.sySidebarGuide() : Promise.reject(new Error('[DouyinSySDK] SDK unavailable'));
    }

    createRewardTransactionId(analyticsTransactionId: string): string {
        return isDouyinMiniGameRuntime()
            ? this._rewardSessionId + '-' + (++this._rewardSequence)
            : analyticsTransactionId;
    }

    reportRewardGranted(position: string, transactionId: string): void {
        if (!isDouyinMiniGameRuntime()) return;
        const sdk = this.getDouyinSdk();
        if (!sdk) {
            console.error('[DouyinSySDK] reward granted but SDK report unavailable');
            return;
        }
        // Reporting is independent from the completed reward transaction. Never regrant or retry it here.
        try {
            void sdk.reportRewardGranted(position, transactionId).catch(() => {});
        } catch (error) {
            console.error('[DouyinSySDK] reward granted but report dispatch failed:', error);
        }
    }

    private shouldSkipExternalSdk(): boolean {
        const g = globalThis as any;
        const loc = g.location || g.window?.location;
        const hostname = String(loc?.hostname || '');
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
        const wxRef = g.wx;
        return !wxRef || typeof wxRef.getLaunchOptionsSync !== 'function';
    }

    init() {
        if (this._inited) return;
        if (isDouyinMiniGameRuntime()) {
            const sdk = this.getDouyinSdk();
            if (sdk) this._inited = sdk.getDiagnostics().initialized === true;
            return;
        }
        if (this.shouldSkipExternalSdk()) {
            this._inited = true;
            this._disabledForPreview = true;
            this._levelEnded = true;
            sySdkDebug('[SySDK] skipped external SDK outside a real WeChat runtime');
            return;
        }
        const sdk = loadSygame();
        sySdkDebug('[SySDK] init() called, _inited=', this._inited, 'Sygame=', typeof sdk);
        this._inited = true;
        this._adCount = 0;
        this._levelEnded = true;
        const wxRef = (globalThis as any).wx;
        try {
            sySdkDebug('[SySDK] init, wx=', typeof wxRef);
            if (wxRef && sdk?.init) {
                const launchOptions = wxRef.getLaunchOptionsSync();
                sySdkDebug('[SySDK] init, calling Sygame.init with:', launchOptions);
                sdk.init({
                    query: launchOptions.query,
                    scene: launchOptions.scene,
                    enablePassiveShare: false,
                });
                sySdkDebug('[SySDK] init done');
            }
        } catch(e) { console.warn('[SySDK] init error:', e); }
        if (!installLocalWeChatPassiveShare(wxRef)) {
            console.warn('[SySDK] local passive share setup unavailable');
        }
    }

    private runLoginAttempt(sdk: any): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                const error: any = new Error('[SySDK] login timed out');
                error.stage = 'manager_timeout';
                reject(error);
            }, 10000);
            const complete = (callback: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                callback();
            };
            try {
                Promise.resolve(sdk.syLogin()).then(
                    () => complete(resolve),
                    (error) => complete(() => reject(error)),
                );
            } catch (error) {
                complete(() => reject(error));
            }
        });
    }

    private shouldRetryLogin(error: any): boolean {
        return [
            'backend_request_failed',
            'backend_invalid_response',
            'wx_login_failed',
            'wx_login_no_code',
        ].indexOf(String(error?.stage || '')) >= 0;
    }

    login(): Promise<boolean> {
        if (isDouyinMiniGameRuntime()) {
            const sdk = this.getDouyinSdk();
            if (!sdk) return Promise.resolve(false);
            return sdk.syLogin().then(() => {
                this.refreshDouyinSidebar();
                // Do not block startup or sidebar login on role reporting; the adapter exposes failures.
                void sdk.ensureRole().catch(() => {});
                return true;
            }, () => false);
        }
        const sdk = getSygame();
        sySdkDebug('[SySDK] login() called, Sygame=', typeof sdk);
        if (this._disabledForPreview || !sdk?.syLogin) return Promise.resolve(false);
        if (this._loginSucceeded || sdk.isOpenWxCallback === true) {
            this._loginSucceeded = true;
            return Promise.resolve(true);
        }
        if (this._loginPromise) return this._loginPromise;

        const run = async (): Promise<boolean> => {
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    await this.runLoginAttempt(sdk);
                    const current = getSygame();
                    if (current?.isOpenWxCallback === true) {
                        this._loginSucceeded = true;
                        sySdkDebug('[SySDK] login identity ready');
                        return true;
                    }
                    console.warn(`[SySDK] login attempt ${attempt} finished without DataNexus identity`);
                    return false;
                } catch (error) {
                    console.warn(`[SySDK] login attempt ${attempt} failed:`, error);
                    if (!this.shouldRetryLogin(error)) break;
                }
            }
            return false;
        };
        const pending = run().then(
            (result) => {
                if (this._loginPromise === pending) this._loginPromise = null;
                return result;
            },
            (error) => {
                if (this._loginPromise === pending) this._loginPromise = null;
                console.warn('[SySDK] login error:', error);
                return false;
            },
        );
        this._loginPromise = pending;
        return pending;
    }

    reportLoadFinish()      { if (this._disabledForPreview || isDouyinMiniGameRuntime()) return; const s=getSygame(); if (!s?.syIaaLoadFinish) return; try { s.syIaaLoadFinish(); } catch(e) { console.warn('[SySDK] reportLoadFinish:', e); } }
    reportTutorialStart()   { if (this._disabledForPreview || isDouyinMiniGameRuntime()) return; const s=getSygame(); if (!s?.syIaaTutorialTrack) return; try { s.syIaaTutorialTrack(1); } catch(e) { console.warn('[SySDK] reportTutorialStart:', e); } }
    reportTutorialFinish()  { if (this._disabledForPreview || isDouyinMiniGameRuntime()) return; const s=getSygame(); if (!s?.syIaaTutorialTrack) return; try { s.syIaaTutorialTrack(2); } catch(e) { console.warn('[SySDK] reportTutorialFinish:', e); } }
    reportLevelEnter(id: number) {
        if (this._disabledForPreview || isDouyinMiniGameRuntime()) return;
        if (!this._levelEnded) return;
        this._levelEnded = false;
        const s=getSygame(); if (!s?.syIaaLevelTrack) return; try { s.syIaaLevelTrack(1, {level_id: id}); } catch(e) { console.warn('[SySDK] reportLevelEnter:', e); }
    }
    reportLevelExit(id: number) {
        if (this._disabledForPreview || isDouyinMiniGameRuntime()) return;
        if (this._levelEnded) return;
        const s=getSygame(); if (!s?.syIaaLevelTrack) return; try { s.syIaaLevelTrack(2, {level_id: id, ad_cnt: this._adCount}); } catch(e) { console.warn('[SySDK] reportLevelExit:', e); }
    }
    reportLevelFail(id: number) {
        if (this._disabledForPreview || isDouyinMiniGameRuntime()) return;
        if (this._levelEnded) return;
        this._levelEnded = true;
        const s=getSygame(); if (!s?.syIaaLevelTrack) return; try { s.syIaaLevelTrack(3, {level_id: id, ad_cnt: this._adCount}); } catch(e) { console.warn('[SySDK] reportLevelFail:', e); }
    }
    reportLevelPass(id: number) {
        if (this._disabledForPreview || isDouyinMiniGameRuntime()) return;
        if (this._levelEnded) return;
        this._levelEnded = true;
        const s=getSygame(); if (!s?.syIaaLevelTrack) return; try { s.syIaaLevelTrack(4, {level_id: id, ad_cnt: this._adCount}); } catch(e) { console.warn('[SySDK] reportLevelPass:', e); }
    }
    reportAdShow(pos: string)    { if (this._disabledForPreview || isDouyinMiniGameRuntime()) return; const s=getSygame(); if (!s?.syIaaAdTrack) return; try { s.syIaaAdTrack(4, {position: pos}); } catch(e) { console.warn('[SySDK] reportAdShow:', e); } }
    reportAdFinish(pos: string)  { if (this._disabledForPreview || isDouyinMiniGameRuntime()) return; const s=getSygame(); if (!s?.syIaaAdTrack) return; this._adCount++; try { s.syIaaAdTrack(3, {position: pos}); } catch(e) { console.warn('[SySDK] reportAdFinish:', e); } }
}

export default SySDKMgr;
