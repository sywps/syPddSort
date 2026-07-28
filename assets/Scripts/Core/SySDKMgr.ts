import { runtimeLog } from './RuntimeLog';

// 不在模块顶层捕获，延迟到每次调用时从 globalThis 读取，防止时序问题
function getSygame() {
    return (globalThis as any).Sygame;
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

    private shouldSkipExternalSdk(): boolean {
        const g = globalThis as any;
        const loc = g.location || g.window?.location;
        const hostname = String(loc?.hostname || '');
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
        const wxRef = g.wx;
        return !wxRef || typeof wxRef.getLaunchOptionsSync !== 'function';
    }

    init() {
        const sdk = getSygame();
        sySdkDebug('[SySDK] init() called, _inited=', this._inited, 'Sygame=', typeof sdk);
        if (this._inited) return;
        if (this.shouldSkipExternalSdk()) {
            this._inited = true;
            this._disabledForPreview = true;
            this._levelEnded = true;
            sySdkDebug('[SySDK] skipped external SDK outside a real WeChat runtime');
            return;
        }
        this._inited = true;
        this._adCount = 0;
        this._levelEnded = true;
        try {
            const wxRef = (globalThis as any).wx;
            sySdkDebug('[SySDK] init, wx=', typeof wxRef);
            if (wxRef && sdk?.init) {
                const launchOptions = wxRef.getLaunchOptionsSync();
                sySdkDebug('[SySDK] init, calling Sygame.init with:', launchOptions);
                sdk.init({ query: launchOptions.query, scene: launchOptions.scene });
                sySdkDebug('[SySDK] init done');
            }
        } catch(e) { console.warn('[SySDK] init error:', e); }
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

    reportLoadFinish()      { if (this._disabledForPreview) return; const s=getSygame(); if (!s?.syIaaLoadFinish) return; try { s.syIaaLoadFinish(); } catch(e) { console.warn('[SySDK] reportLoadFinish:', e); } }
    reportTutorialStart()   { if (this._disabledForPreview) return; const s=getSygame(); if (!s?.syIaaTutorialTrack) return; try { s.syIaaTutorialTrack(1); } catch(e) { console.warn('[SySDK] reportTutorialStart:', e); } }
    reportTutorialFinish()  { if (this._disabledForPreview) return; const s=getSygame(); if (!s?.syIaaTutorialTrack) return; try { s.syIaaTutorialTrack(2); } catch(e) { console.warn('[SySDK] reportTutorialFinish:', e); } }
    reportLevelEnter(id: number) {
        if (this._disabledForPreview) return;
        if (!this._levelEnded) return;
        this._levelEnded = false;
        const s=getSygame(); if (!s?.syIaaLevelTrack) return; try { s.syIaaLevelTrack(1, {level_id: id}); } catch(e) { console.warn('[SySDK] reportLevelEnter:', e); }
    }
    reportLevelExit(id: number) {
        if (this._disabledForPreview) return;
        if (this._levelEnded) return;
        const s=getSygame(); if (!s?.syIaaLevelTrack) return; try { s.syIaaLevelTrack(2, {level_id: id, ad_cnt: this._adCount}); } catch(e) { console.warn('[SySDK] reportLevelExit:', e); }
    }
    reportLevelFail(id: number) {
        if (this._disabledForPreview) return;
        if (this._levelEnded) return;
        this._levelEnded = true;
        const s=getSygame(); if (!s?.syIaaLevelTrack) return; try { s.syIaaLevelTrack(3, {level_id: id, ad_cnt: this._adCount}); } catch(e) { console.warn('[SySDK] reportLevelFail:', e); }
    }
    reportLevelPass(id: number) {
        if (this._disabledForPreview) return;
        if (this._levelEnded) return;
        this._levelEnded = true;
        const s=getSygame(); if (!s?.syIaaLevelTrack) return; try { s.syIaaLevelTrack(4, {level_id: id, ad_cnt: this._adCount}); } catch(e) { console.warn('[SySDK] reportLevelPass:', e); }
    }
    reportAdShow(pos: string)    { if (this._disabledForPreview) return; const s=getSygame(); if (!s?.syIaaAdTrack) return; try { s.syIaaAdTrack(4, {position: pos}); } catch(e) { console.warn('[SySDK] reportAdShow:', e); } }
    reportAdFinish(pos: string)  { if (this._disabledForPreview) return; const s=getSygame(); if (!s?.syIaaAdTrack) return; this._adCount++; try { s.syIaaAdTrack(3, {position: pos}); } catch(e) { console.warn('[SySDK] reportAdFinish:', e); } }
}

export default SySDKMgr;
