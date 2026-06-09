import { _decorator, Game, game, sys } from 'cc';
import { WxCloudMgr } from './WxCloudMgr';

const { ccclass } = _decorator;

const LS_ANALYTICS_OPENID = 'pdd.analytics.openid.v1';

type CloudResult = {
    ok?: boolean;
    errorMessage?: string;
    openid?: string;
    isNewUser?: boolean;
};

export type ReportDataOptions = {
    eventName: string;
    levelId?: string | number;
    page?: string;
    actionType?: number;
    shareType?: string;
    adType?: string;
    duration?: number;
    abId?: string;
    abBucket?: string;
    logicalLevelId?: string | number;
    physicalLevelId?: string | number;
};

export type FunnelEventOptions = {
    eventName: string;
    levelId?: string | number;
    page?: string;
    stepId?: string | number;
    stepName?: string;
    touchTarget?: string;
    source?: string;
    success?: boolean;
    errorCode?: string;
    errorMessage?: string;
    duration?: number;
    logicalLevelId?: string | number;
    physicalLevelId?: string | number;
    abId?: string;
    abBucket?: string;
    extra?: Record<string, unknown>;
};

export type UpdateUserProfileAssetsOptions = {
    openid?: string;
    gold?: number;
    goldDelta?: number;
    expandSlotCount?: number;
    expandSlotCountDelta?: number;
    magicWandCount?: number;
    magicWandCountDelta?: number;
    brushCount?: number;
    brushCountDelta?: number;
    magnetCount?: number;
    magnetCountDelta?: number;
    addTimeCount?: number;
    addTimeCountDelta?: number;
};

type LevelSessionState = {
    levelId: number;
    page: string;
    startTime: number;
    tryCount: number;
    useAdRevive: boolean;
    useShareRevive: boolean;
    pendingFailure: boolean;
    finalized: boolean;
};

@ccclass('AnalyticsMgr')
export class AnalyticsMgr {
    private static _inst: AnalyticsMgr | null = null;

    static get inst(): AnalyticsMgr {
        if (!AnalyticsMgr._inst) {
            AnalyticsMgr._inst = new AnalyticsMgr();
        }
        return AnalyticsMgr._inst;
    }

    private readyPromise: Promise<boolean> | null = null;
    private openid = '';
    private bootstrapped = false;
    private lifecycleBound = false;
    private exitReported = false;
    private gameSessionStartTime = Date.now();
    private levelSession: LevelSessionState | null = null;
    private unavailableWarned = false;
    private experimentContext: Partial<Pick<ReportDataOptions, 'abId' | 'abBucket' | 'logicalLevelId' | 'physicalLevelId'>> = {};
    private readonly funnelSessionId = this.createSessionId();
    private readonly appLaunchTime = Date.now();
    private funnelEventSeq = 0;
    private firstLevelReadyTime = 0;
    private funnelQueue: Record<string, unknown>[] = [];
    private funnelFlushTimer: any = null;
    private funnelInFlight = false;
    private funnelUploadDisabled = false;
    private funnelUploadDisableWarned = false;
    private firstLevelAliveTimers: any[] = [];

    private constructor() {
        this.openid = this.readCachedOpenid();
    }

    async bootstrap(): Promise<boolean> {
        this.bindGlobalReporter();
        this.bindLifecycle();
        if (this.bootstrapped) {
            return this.ensureReady();
        }
        this.bootstrapped = true;
        this.gameSessionStartTime = Date.now();
        this.exitReported = false;
        const ready = await this.ensureReady();
        if (ready) {
            void this.wxReportData({
                eventName: 'game_start',
                page: 'app',
                actionType: 1,
            });
        }
        return ready;
    }

    async ensureReady(): Promise<boolean> {
        if (this.readyPromise) {
            return this.readyPromise;
        }

        this.readyPromise = Promise.resolve().then(async () => {
            if (!WxCloudMgr.inst.canUseCloud()) {
                this.warnUnavailableOnce();
                return false;
            }
            if (WxCloudMgr.inst.isDevtools()) {
                return false;
            }

            const { device, system } = WxCloudMgr.inst.getSystemInfo();
            const channel = this.resolveChannel();
            const result = await WxCloudMgr.inst.callFunction<CloudResult>('getOpenid', {
                channel,
                device,
                system,
            });

            if (result?.ok === false) {
                throw new Error(result.errorMessage || 'getOpenid failed');
            }

            if (typeof result?.openid === 'string' && result.openid) {
                this.openid = result.openid;
                this.cacheOpenid(result.openid);
            }

            return !!this.openid;
        }).catch((error) => {
            if (this.isExpectedCloudBootstrapFailure(error)) {
                this.warnUnavailableOnce();
                return false;
            }
            console.warn('[AnalyticsMgr] ensureReady failed:', error);
            return false;
        });

        return this.readyPromise;
    }

    async wxReportData(opt: ReportDataOptions): Promise<CloudResult | { ok: false; skipped: true }> {
        const ready = await this.ensureReady();
        if (!ready) {
            return { ok: false, skipped: true };
        }

        try {
            return await WxCloudMgr.inst.callFunction<CloudResult>('addBehaviorData', {
                openid: this.openid,
                eventName: opt.eventName,
                levelId: opt.levelId ?? 0,
                page: opt.page || '',
                actionType: opt.actionType ?? 1,
                shareType: opt.shareType || '',
                adType: opt.adType || '',
                duration: opt.duration ?? 0,
                abId: opt.abId || this.experimentContext.abId || '',
                abBucket: opt.abBucket || this.experimentContext.abBucket || '',
                logicalLevelId: opt.logicalLevelId ?? this.experimentContext.logicalLevelId ?? opt.levelId ?? 0,
                physicalLevelId: opt.physicalLevelId ?? this.experimentContext.physicalLevelId ?? opt.levelId ?? 0,
            });
        } catch (error) {
            console.warn('[AnalyticsMgr] addBehaviorData failed:', error);
            return { ok: false, skipped: true };
        }
    }

    trackFunnelEvent(opt: FunnelEventOptions): void {
        if (this.funnelUploadDisabled) return;
        const eventName = typeof opt.eventName === 'string' ? opt.eventName.trim() : '';
        if (!eventName) return;

        const now = Date.now();
        if (eventName === 'first_level_ui_ready' && this.firstLevelReadyTime <= 0) {
            this.firstLevelReadyTime = now;
        }

        const logicalLevelId = opt.logicalLevelId ?? this.experimentContext.logicalLevelId ?? opt.levelId ?? 0;
        const physicalLevelId = opt.physicalLevelId ?? this.experimentContext.physicalLevelId ?? opt.levelId ?? 0;
        const event: Record<string, unknown> = {
            sessionId: this.funnelSessionId,
            eventSeq: ++this.funnelEventSeq,
            eventName,
            levelId: opt.levelId ?? logicalLevelId ?? 0,
            page: opt.page || '',
            stepId: opt.stepId ?? '',
            stepName: opt.stepName || '',
            touchTarget: opt.touchTarget || '',
            source: opt.source || '',
            success: opt.success === true,
            errorCode: opt.errorCode || '',
            errorMessage: opt.errorMessage || '',
            duration: opt.duration ?? 0,
            abId: opt.abId || this.experimentContext.abId || '',
            abBucket: opt.abBucket || this.experimentContext.abBucket || '',
            logicalLevelId,
            physicalLevelId,
            elapsedMsFromLaunch: Math.max(0, now - this.appLaunchTime),
            elapsedMsFromLevelReady: this.firstLevelReadyTime > 0 ? Math.max(0, now - this.firstLevelReadyTime) : 0,
            timestamp: now,
        };
        if (opt.extra && typeof opt.extra === 'object') {
            event.extra = opt.extra;
        }

        this.funnelQueue.push(event);
        if (this.funnelQueue.length > 200) {
            this.funnelQueue.splice(0, this.funnelQueue.length - 200);
        }
        if (this.funnelQueue.length >= 5 || eventName === 'game_exit' || eventName === 'level_exit' || eventName === 'app_hide') {
            this.flushFunnelEvents();
        } else {
            this.scheduleFunnelFlush();
        }
    }

    markFirstLevelReady(context?: Partial<Pick<FunnelEventOptions, 'levelId' | 'logicalLevelId' | 'physicalLevelId' | 'page' | 'source'>>): void {
        this.clearFirstLevelAliveTimers();
        this.firstLevelReadyTime = Date.now();
        this.trackFunnelEvent({
            eventName: 'first_level_ui_ready',
            page: context?.page || 'game',
            levelId: context?.levelId,
            logicalLevelId: context?.logicalLevelId,
            physicalLevelId: context?.physicalLevelId,
            source: context?.source || 'initGame',
        });
        for (const ms of [1000, 2000, 3000, 5000, 10000, 20000, 30000, 60000]) {
            const timer = setTimeout(() => {
                this.trackFunnelEvent({
                    eventName: `alive_${Math.floor(ms / 1000)}s_after_ui_ready`,
                    page: context?.page || 'game',
                    levelId: context?.levelId,
                    logicalLevelId: context?.logicalLevelId,
                    physicalLevelId: context?.physicalLevelId,
                    source: 'level_ready_alive',
                });
            }, ms);
            this.firstLevelAliveTimers.push(timer);
        }
    }

    flushFunnelEvents(): void {
        if (this.funnelFlushTimer) {
            clearTimeout(this.funnelFlushTimer);
            this.funnelFlushTimer = null;
        }
        if (this.funnelUploadDisabled) {
            this.funnelQueue = [];
            return;
        }
        if (this.funnelInFlight || this.funnelQueue.length === 0) {
            return;
        }
        if (!WxCloudMgr.inst.canUseCloud()) {
            return;
        }

        const batch = this.funnelQueue.splice(0, 20);
        this.funnelInFlight = true;
        void WxCloudMgr.inst.callFunction<CloudResult>('addFunnelEvents', {
            sessionId: this.funnelSessionId,
            events: batch,
        }).catch((error) => {
            if (this.isPermanentFunnelUploadFailure(error)) {
                this.disableFunnelUpload('addFunnelEvents unavailable');
                return;
            }
            console.warn('[AnalyticsMgr] addFunnelEvents failed:', error);
            this.funnelQueue = batch.concat(this.funnelQueue).slice(0, 200);
        }).finally(() => {
            this.funnelInFlight = false;
            if (!this.funnelUploadDisabled && this.funnelQueue.length > 0) {
                this.scheduleFunnelFlush();
            }
        });
    }

    private disableFunnelUpload(reason: string, error?: unknown): void {
        this.funnelUploadDisabled = true;
        this.funnelQueue = [];
        if (!this.funnelUploadDisableWarned) {
            this.funnelUploadDisableWarned = true;
            if (typeof error === 'undefined') {
                console.warn('[AnalyticsMgr] funnel upload disabled:', reason);
            } else {
                console.warn('[AnalyticsMgr] funnel upload disabled:', reason, error);
            }
        }
    }

    private isPermanentFunnelUploadFailure(error: unknown): boolean {
        const message = String((error as any)?.message || error || '').toLowerCase();
        return message.includes('function_not_found') ||
            message.includes('functionname parameter could not be found') ||
            message.includes('errcode: -501000');
    }

    setExperimentContext(context: Partial<Pick<ReportDataOptions, 'abId' | 'abBucket' | 'logicalLevelId' | 'physicalLevelId'>>): void {
        this.experimentContext = {
            ...this.experimentContext,
            ...context,
        };
    }

    beginLevel(levelId: number, page: string, context?: Partial<Pick<ReportDataOptions, 'abId' | 'abBucket' | 'logicalLevelId' | 'physicalLevelId'>>): void {
        const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
        const normalizedPage = page || 'game';
        const now = Date.now();
        if (context) {
            this.setExperimentContext(context);
        }

        if (this.levelSession && !this.levelSession.finalized && this.levelSession.levelId !== normalizedLevelId) {
            void this.finalizeActiveLevel(false);
        }

        if (this.levelSession && !this.levelSession.finalized && this.levelSession.levelId === normalizedLevelId) {
            this.levelSession.tryCount += 1;
            this.levelSession.pendingFailure = false;
            this.levelSession.page = normalizedPage;
            this.levelSession.startTime = now;
        } else {
            this.levelSession = {
                levelId: normalizedLevelId,
                page: normalizedPage,
                startTime: now,
                tryCount: 1,
                useAdRevive: false,
                useShareRevive: false,
                pendingFailure: false,
                finalized: false,
            };
        }

        void this.wxReportData({
            eventName: 'enter_level',
            levelId: normalizedLevelId,
            page: normalizedPage,
            actionType: 1,
        });
    }

    markLevelFailed(page?: string): void {
        const session = this.levelSession;
        const levelId = session?.levelId ?? 0;
        const currentPage = page || session?.page || 'game';
        if (session && !session.finalized) {
            session.pendingFailure = true;
        }
        void this.wxReportData({
            eventName: 'level_fail',
            levelId,
            page: currentPage,
            actionType: 4,
        });
    }

    markLevelPassed(page?: string): void {
        const session = this.levelSession;
        const levelId = session?.levelId ?? 0;
        const currentPage = page || session?.page || 'game';
        void this.wxReportData({
            eventName: 'level_pass',
            levelId,
            page: currentPage,
            actionType: 3,
        });
        void this.finalizeActiveLevel(true);
    }

    markAdRevive(): void {
        if (!this.levelSession || this.levelSession.finalized) {
            return;
        }
        this.levelSession.useAdRevive = true;
        this.levelSession.pendingFailure = false;
        this.levelSession.tryCount += 1;
    }

    markShareRevive(): void {
        if (!this.levelSession || this.levelSession.finalized) {
            return;
        }
        this.levelSession.useShareRevive = true;
        this.levelSession.pendingFailure = false;
        this.levelSession.tryCount += 1;
    }

    abandonActiveLevel(): void {
        void this.finalizeActiveLevel(false);
    }

    finalizePendingFailedLevel(): void {
        const session = this.levelSession;
        if (!session || session.finalized || !session.pendingFailure) {
            return;
        }
        void this.finalizeActiveLevel(false);
    }

    trackAdClick(adType: string, page: string, levelId?: number): void {
        void this.wxReportData({
            eventName: 'ad_click',
            levelId: levelId ?? this.levelSession?.levelId ?? 0,
            page,
            actionType: 2,
            adType,
        });
    }

    trackAdShow(adType: string, page: string, levelId?: number): void {
        void this.wxReportData({
            eventName: 'ad_show',
            levelId: levelId ?? this.levelSession?.levelId ?? 0,
            page,
            actionType: 1,
            adType,
        });
    }

    trackAdFinish(adType: string, page: string, levelId?: number): void {
        void this.wxReportData({
            eventName: 'ad_finish',
            levelId: levelId ?? this.levelSession?.levelId ?? 0,
            page,
            actionType: 3,
            adType,
        });
    }

    trackShareClick(shareType: string, page: string, levelId?: number): void {
        void this.wxReportData({
            eventName: 'share_click',
            levelId: levelId ?? this.levelSession?.levelId ?? 0,
            page,
            actionType: 2,
            shareType,
        });
    }

    trackShareSuccess(shareType: string, page: string, levelId?: number): void {
        void this.wxReportData({
            eventName: 'share_success',
            levelId: levelId ?? this.levelSession?.levelId ?? 0,
            page,
            actionType: 3,
            shareType,
        });
    }

    async fetchLevelRate(levelId: number): Promise<Record<string, unknown>> {
        return WxCloudMgr.inst.callFunction('calcLevelRate', {
            levelId: Math.max(1, Math.floor(Number(levelId) || 1)),
        });
    }

    async fetchDashboardData(opt: { startDate?: string; endDate?: string; days?: number; topLimit?: number } = {}): Promise<Record<string, unknown>> {
        return WxCloudMgr.inst.callFunction('getAllDashboardData', opt);
    }

    async updateUserProfileAssets(opt: UpdateUserProfileAssetsOptions): Promise<Record<string, unknown> | { ok: false; skipped: true }> {
        const ready = await this.ensureReady();
        if (!ready) {
            return { ok: false, skipped: true };
        }

        try {
            return await WxCloudMgr.inst.callFunction('updateUserProfileAssets', {
                ...opt,
                openid: opt.openid || this.openid,
            });
        } catch (error) {
            console.warn('[AnalyticsMgr] updateUserProfileAssets failed:', error);
            return { ok: false, skipped: true };
        }
    }

    private bindGlobalReporter(): void {
        const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
        if (!globalScope) {
            return;
        }
        if (typeof globalScope.wxReportData !== 'function') {
            globalScope.wxReportData = (opt: ReportDataOptions) => this.wxReportData(opt);
        }
        if (typeof globalScope.wxUpdateUserProfileAssets !== 'function') {
            globalScope.wxUpdateUserProfileAssets = (opt: UpdateUserProfileAssetsOptions) => this.updateUserProfileAssets(opt);
        }
    }

    private bindLifecycle(): void {
        if (this.lifecycleBound) {
            return;
        }
        this.lifecycleBound = true;
        game.on(Game.EVENT_HIDE, this.handleHide, this);
        game.on(Game.EVENT_SHOW, this.handleShow, this);
    }

    private async finalizeActiveLevel(passStatus: boolean): Promise<void> {
        const session = this.levelSession;
        if (!session || session.finalized) {
            return;
        }

        session.finalized = true;
        const ready = await this.ensureReady();
        if (!ready) {
            if (this.levelSession === session) {
                this.levelSession = null;
            }
            return;
        }

        try {
            await WxCloudMgr.inst.callFunction('saveLevelRecord', {
                openid: this.openid,
                levelId: session.levelId,
                tryCount: Math.max(1, Math.floor(session.tryCount || 1)),
                passStatus,
                useAdRevive: session.useAdRevive,
                useShareRevive: session.useShareRevive,
                startTime: session.startTime,
                endTime: Date.now(),
            });
        } catch (error) {
            console.warn('[AnalyticsMgr] saveLevelRecord failed:', error);
        } finally {
            if (this.levelSession === session) {
                this.levelSession = null;
            }
        }
    }

    private handleHide(): void {
        if (this.exitReported) {
            return;
        }
        this.exitReported = true;
        this.clearFirstLevelAliveTimers();
        this.abandonActiveLevel();
        this.trackFunnelEvent({
            eventName: 'app_hide',
            page: 'app',
            duration: Math.max(0, Date.now() - this.gameSessionStartTime),
        });
        this.flushFunnelEvents();
        void this.wxReportData({
            eventName: 'game_exit',
            page: 'app',
            actionType: 1,
            duration: Math.max(0, Date.now() - this.gameSessionStartTime),
        });
    }

    private handleShow(): void {
        if (!this.exitReported) {
            return;
        }
        this.exitReported = false;
        this.gameSessionStartTime = Date.now();
        void this.wxReportData({
            eventName: 'game_start',
            page: 'app',
            actionType: 1,
        });
    }

    private scheduleFunnelFlush(): void {
        if (this.funnelFlushTimer) return;
        this.funnelFlushTimer = setTimeout(() => {
            this.funnelFlushTimer = null;
            this.flushFunnelEvents();
        }, 1200);
    }

    private clearFirstLevelAliveTimers(): void {
        for (const timer of this.firstLevelAliveTimers) {
            clearTimeout(timer);
        }
        this.firstLevelAliveTimers = [];
    }

    private createSessionId(): string {
        const random = Math.random().toString(36).slice(2, 10);
        return `${Date.now().toString(36)}-${random}`;
    }

    private resolveChannel(): string {
        const launchChannel = WxCloudMgr.inst.getLaunchChannel();
        if (launchChannel) {
            return launchChannel;
        }

        try {
            const url = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
            const channel = url?.get('channel') || url?.get('from') || '';
            return channel;
        } catch (_) {
            return '';
        }
    }

    private readCachedOpenid(): string {
        try {
            return sys.localStorage.getItem(LS_ANALYTICS_OPENID) || '';
        } catch (_) {
            return '';
        }
    }

    private cacheOpenid(openid: string): void {
        try {
            sys.localStorage.setItem(LS_ANALYTICS_OPENID, openid);
        } catch (_) {
            // ignore storage failures
        }
    }

    private warnUnavailableOnce(): void {
        if (this.unavailableWarned) {
            return;
        }
        this.unavailableWarned = true;
        console.log('[AnalyticsMgr] analytics cloud unavailable, reporting is skipped.');
    }

    private isExpectedCloudBootstrapFailure(error: unknown): boolean {
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
}
