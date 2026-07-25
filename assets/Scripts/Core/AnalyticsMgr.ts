import { _decorator, Game, game, sys } from 'cc';
import { PlatformCloudMgr } from './PlatformCloudMgr';
import { runtimeLog } from './RuntimeLog';

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
    logicalLevelId?: string | number;
    physicalLevelId?: string | number;
    abId?: string;
    abBucket?: string;
    smartHintShownCount?: number;
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

type AnalyticsLevelContext = Partial<Pick<ReportDataOptions, 'logicalLevelId' | 'physicalLevelId' | 'abId' | 'abBucket'>>;

type SmartHintShowOptions = {
    levelId?: string | number;
    page?: string;
    step?: string;
    colorId?: string | number;
    source?: string;
};

export type UpdateUserProfileAssetsOptions = {
    openid?: string;
    gold?: number;
    goldDelta?: number;
    expandSlotCount?: number;
    expandSlotCountDelta?: number;
    magicWandCount?: number;
    magicWandCountDelta?: number;
    freezeCount?: number;
    freezeCountDelta?: number;
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
    smartHintShownCount: number;
};

type LevelRecordEndReason = 'pass' | 'fail' | 'abandon';

function normalizePositiveLevelId(value: string | number | undefined): number {
    const num = Math.floor(Number(value) || 0);
    return num > 0 ? num : 0;
}

function resolveClientBuildIdentity(): { id: string; source: string } {
    const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const injectedId = String(globalScope?.__PDD_CLIENT_BUILD_ID__ || '').trim();
    if (injectedId) {
        return { id: injectedId.slice(0, 80), source: 'wechat_build_marker' };
    }
    return { id: 'browser-dev', source: 'browser_dev' };
}

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
    private levelContext: AnalyticsLevelContext = {};
    private readonly funnelSessionId = this.createSessionId();
    private readonly appLaunchTime = Date.now();
    private funnelEventSeq = 0;
    private firstLevelReadyTime = 0;
    private funnelQueue: Record<string, unknown>[] = [];
    private funnelFlushTimer: any = null;
    private funnelInFlight = false;
    private funnelUploadDisabled = false;
    private funnelUploadDisableWarned = false;
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
            if (!PlatformCloudMgr.inst.canUseCloud()) {
                this.warnUnavailableOnce();
                return false;
            }
            if (PlatformCloudMgr.inst.isDevtools()) {
                return false;
            }

            const { device, system } = PlatformCloudMgr.inst.getSystemInfo();
            const channel = this.resolveChannel();
            const result = await PlatformCloudMgr.inst.callFunction<CloudResult>('getOpenid', {
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
            return await PlatformCloudMgr.inst.callFunction<CloudResult>('addBehaviorData', {
                openid: this.openid,
                eventName: opt.eventName,
                levelId: opt.levelId ?? 0,
                page: opt.page || '',
                actionType: opt.actionType ?? 1,
                shareType: opt.shareType || '',
                adType: opt.adType || '',
                duration: opt.duration ?? 0,
                logicalLevelId: opt.logicalLevelId ?? this.levelContext.logicalLevelId ?? opt.levelId ?? 0,
                physicalLevelId: opt.physicalLevelId ?? this.levelContext.physicalLevelId ?? opt.levelId ?? 0,
                abId: opt.abId ?? this.levelContext.abId ?? '',
                abBucket: opt.abBucket ?? this.levelContext.abBucket ?? '',
                smartHintShownCount: opt.smartHintShownCount ?? 0,
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

        const logicalLevelId = opt.logicalLevelId ?? this.levelContext.logicalLevelId ?? opt.levelId ?? 0;
        const physicalLevelId = opt.physicalLevelId ?? this.levelContext.physicalLevelId ?? opt.levelId ?? 0;
        const abId = opt.abId ?? this.levelContext.abId ?? '';
        const abBucket = opt.abBucket ?? this.levelContext.abBucket ?? '';
        const clientBuild = resolveClientBuildIdentity();
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
            logicalLevelId,
            physicalLevelId,
            abId,
            abBucket,
            elapsedMsFromLaunch: Math.max(0, now - this.appLaunchTime),
            elapsedMsFromLevelReady: this.firstLevelReadyTime > 0 ? Math.max(0, now - this.firstLevelReadyTime) : 0,
            timestamp: now,
        };
        event.extra = {
            clientBuildId: clientBuild.id,
            clientBuildIdSource: clientBuild.source,
            launchChannelAtEvent: this.resolveChannel(),
            ...(opt.extra && typeof opt.extra === 'object' ? opt.extra : {}),
        };

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

    markFirstLevelReady(context?: Partial<Pick<FunnelEventOptions, 'levelId' | 'logicalLevelId' | 'physicalLevelId' | 'abId' | 'abBucket' | 'page' | 'source'>>): void {
        this.firstLevelReadyTime = Date.now();
        this.trackFunnelEvent({
            eventName: 'first_level_ui_ready',
            page: context?.page || 'game',
            levelId: context?.levelId,
            logicalLevelId: context?.logicalLevelId,
            physicalLevelId: context?.physicalLevelId,
            abId: context?.abId,
            abBucket: context?.abBucket,
            source: context?.source || 'initGame',
        });
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
        if (!PlatformCloudMgr.inst.canUseCloud()) {
            return;
        }

        const batch = this.funnelQueue.splice(0, 20);
        this.funnelInFlight = true;
        const finishFlush = () => {
            this.funnelInFlight = false;
            if (!this.funnelUploadDisabled && this.funnelQueue.length > 0) {
                this.scheduleFunnelFlush();
            }
        };
        void PlatformCloudMgr.inst.callFunction<CloudResult>('addFunnelEvents', {
            sessionId: this.funnelSessionId,
            events: batch,
        }).then(() => {
            finishFlush();
        }, (error) => {
            if (this.isPermanentFunnelUploadFailure(error)) {
                this.disableFunnelUpload('addFunnelEvents unavailable');
            } else {
                console.warn('[AnalyticsMgr] addFunnelEvents failed:', error);
                this.funnelQueue = batch.concat(this.funnelQueue).slice(0, 200);
            }
            finishFlush();
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

    setLevelContext(context: AnalyticsLevelContext): void {
        this.levelContext = {
            ...this.levelContext,
            ...context,
        };
    }

    beginLevel(levelId: number, page: string, context?: AnalyticsLevelContext): void {
        const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
        const normalizedPage = page || 'game';
        const now = Date.now();
        if (context) {
            this.setLevelContext(context);
        }

        if (this.levelSession && !this.levelSession.finalized && this.levelSession.levelId !== normalizedLevelId) {
            void this.finalizeActiveLevel(false, 'abandon');
        }

        if (this.levelSession && !this.levelSession.finalized && this.levelSession.levelId === normalizedLevelId) {
            this.levelSession.tryCount += 1;
            this.levelSession.pendingFailure = false;
            this.levelSession.page = normalizedPage;
            this.levelSession.startTime = now;
            this.levelSession.smartHintShownCount = 0;
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
                smartHintShownCount: 0,
            };
        }

        void this.wxReportData({
            eventName: 'enter_level',
            levelId: normalizedLevelId,
            page: normalizedPage,
            actionType: 1,
        });
    }

    getSmartHintShownCount(): number {
        return Math.max(0, Math.floor(Number(this.levelSession?.smartHintShownCount) || 0));
    }

    trackSmartHintShow(opt?: SmartHintShowOptions): void {
        const options = opt || {};
        const session = this.levelSession;
        if (session && !session.finalized) {
            session.smartHintShownCount += 1;
        }
        const smartHintShownCount = this.getSmartHintShownCount();
        const levelId = options.levelId ?? session?.levelId ?? 0;
        const page = options.page || session?.page || 'game';
        const stepName = typeof options.step === 'string' ? options.step : '';
        const colorId = normalizePositiveLevelId(options.colorId);

        void this.wxReportData({
            eventName: 'smart_hint_show',
            levelId,
            page,
            actionType: 1,
            smartHintShownCount,
        });
        this.trackFunnelEvent({
            eventName: 'smart_hint_show',
            levelId,
            page,
            stepName,
            source: options.source || 'smart_idle_hint',
            success: true,
            extra: {
                hintStep: stepName,
                colorId,
                smartHintShownCount,
            },
        });
    }

    markLevelFailed(page?: string, levelIdFallback?: number): void {
        const session = this.levelSession;
        const levelId = session?.levelId ?? normalizePositiveLevelId(levelIdFallback);
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

    markLevelPassed(page?: string, levelIdFallback?: number): void {
        const session = this.levelSession;
        const levelId = session?.levelId ?? normalizePositiveLevelId(levelIdFallback);
        const currentPage = page || session?.page || 'game';
        const smartHintShownCount = this.getSmartHintShownCount();
        void this.wxReportData({
            eventName: 'level_pass',
            levelId,
            page: currentPage,
            actionType: 3,
            smartHintShownCount,
        });
        void this.finalizeActiveLevel(true, 'pass');
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
        void this.finalizeActiveLevel(false, 'abandon');
    }

    finalizePendingFailedLevel(): void {
        const session = this.levelSession;
        if (!session || session.finalized || !session.pendingFailure) {
            return;
        }
        void this.finalizeActiveLevel(false, 'fail');
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
        return PlatformCloudMgr.inst.callFunction('calcLevelRate', {
            levelId: Math.max(1, Math.floor(Number(levelId) || 1)),
        });
    }

    async fetchDashboardData(opt: { startDate?: string; endDate?: string; days?: number; topLimit?: number } = {}): Promise<Record<string, unknown>> {
        return PlatformCloudMgr.inst.callFunction('getAllDashboardData', opt);
    }

    async updateUserProfileAssets(opt: UpdateUserProfileAssetsOptions): Promise<Record<string, unknown> | { ok: false; skipped: true }> {
        const ready = await this.ensureReady();
        if (!ready) {
            return { ok: false, skipped: true };
        }

        try {
            return await PlatformCloudMgr.inst.callFunction('updateUserProfileAssets', {
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

    private async finalizeActiveLevel(passStatus: boolean, endReason: LevelRecordEndReason): Promise<void> {
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
            await PlatformCloudMgr.inst.callFunction('saveLevelRecord', {
                openid: this.openid,
                levelId: session.levelId,
                tryCount: Math.max(1, Math.floor(session.tryCount || 1)),
                passStatus,
                endReason,
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
        this.trackFunnelEvent({
            eventName: 'app_show',
            page: 'app',
        });
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

    private createSessionId(): string {
        const random = Math.random().toString(36).slice(2, 10);
        return `${Date.now().toString(36)}-${random}`;
    }

    private resolveChannel(): string {
        const launchChannel = PlatformCloudMgr.inst.getLaunchChannel();
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
        runtimeLog('[AnalyticsMgr] analytics cloud unavailable, reporting is skipped.');
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
            message.includes('douyin cloud') ||
            message.includes('platform cloud') ||
            message.includes('collection') && message.includes('not exist')
        );
    }
}
