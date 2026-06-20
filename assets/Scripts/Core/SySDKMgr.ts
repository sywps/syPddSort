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
    private _adCount = 0;
    private _levelEnded = true;  // 初始为true，防止未进入关卡时误报exit

    private shouldSkipExternalSdk(): boolean {
        const g = globalThis as any;
        const loc = g.location || g.window?.location;
        const hostname = String(loc?.hostname || '');
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
        const wxRef = g.wx;
        try {
            const system = wxRef?.getSystemInfoSync?.();
            if (String(system?.platform || '').toLowerCase() === 'devtools') return true;
            if (system?.host && !system.host.appId) return true;
        } catch (_) { /* ignore */ }
        try {
            const account = wxRef?.getAccountInfoSync?.();
            if (account?.miniProgram && !account.miniProgram.appId) return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    init() {
        const sdk = getSygame();
        sySdkDebug('[SySDK] init() called, _inited=', this._inited, 'Sygame=', typeof sdk);
        if (this._inited) return;
        if (this.shouldSkipExternalSdk()) {
            this._inited = true;
            this._disabledForPreview = true;
            this._levelEnded = true;
            sySdkDebug('[SySDK] skipped external SDK in local preview/devtools');
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

    async login() {
        const sdk = getSygame();
        sySdkDebug('[SySDK] login() called, Sygame=', typeof sdk);
        if (this._disabledForPreview) return;
        if (!sdk?.syLogin) return;
        try {
            await sdk.syLogin();
            sySdkDebug('[SySDK] login done');
        } catch(e) { console.warn('[SySDK] login error:', e); }
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
    reportAdShow(pos: string)    { if (this._disabledForPreview) return; const s=getSygame(); if (!s?.syIaaAdTrack) return; try { s.syIaaAdTrack(1, {position: pos}); } catch(e) { console.warn('[SySDK] reportAdShow:', e); } }
    reportAdClick(pos: string)   { if (this._disabledForPreview) return; const s=getSygame(); if (!s?.syIaaAdTrack) return; try { s.syIaaAdTrack(2, {position: pos}); } catch(e) { console.warn('[SySDK] reportAdClick:', e); } }
    reportAdFinish(pos: string)  { if (this._disabledForPreview) return; const s=getSygame(); if (!s?.syIaaAdTrack) return; this._adCount++; try { s.syIaaAdTrack(3, {position: pos}); } catch(e) { console.warn('[SySDK] reportAdFinish:', e); } }
}

export default SySDKMgr;
