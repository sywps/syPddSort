import { _decorator, Game, game, sys } from 'cc';
import { PlatformCloudMgr } from './PlatformCloudMgr';
import { getWeChatMiniGameRuntime } from './MiniGamePlatform';
import { runtimeLog } from './RuntimeLog';
import {
    subscribeRewardedAdLoadEvents,
    type RewardedAdLoadEvent,
} from '../Platform/RewardedAdProvider';

const { ccclass } = _decorator;

const LS_ANALYTICS_OPENID = 'pdd.analytics.openid.v1';
const LS_RUNTIME_CHECKPOINT = 'pdd.analytics.runtime_checkpoint.v1';
const RUNTIME_CHECKPOINT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RUNTIME_DIAGNOSTICS_PER_SESSION = 8;
const MAX_RUNTIME_DIAGNOSTIC_MESSAGE_LENGTH = 240;

export const PCH_GAMEPLAY_MODE = 'pch_conveyor' as const;
export const PCH_GAMEPLAY_SCHEMA_VERSION = 1;

export type PchFailureReason = '' | 'timeout' | 'buffer_full';

export type PchGameplayAnalyticsSnapshot = {
    magnetUses: number;
    brushUses: number;
    freezeUses: number;
};

export type LevelSessionAnalyticsUpdate = {
    gameplayStats?: PchGameplayAnalyticsSnapshot | null;
    failureReason?: PchFailureReason;
};

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
    gameplayMode?: string;
    gameplaySchemaVersion?: number;
    failureReason?: PchFailureReason;
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
    gameplayMode?: string;
    gameplaySchemaVersion?: number;
    extra?: Record<string, unknown>;
};

type AnalyticsLevelContext = Partial<Pick<ReportDataOptions,
    'logicalLevelId' | 'physicalLevelId' | 'abId' | 'abBucket' | 'gameplayMode' | 'gameplaySchemaVersion'
>>;

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
    gameplayMode: string;
    gameplaySchemaVersion: number;
    failureReason: PchFailureReason;
    gameplayStats: PchGameplayAnalyticsSnapshot | null;
};

type LevelRecordEndReason = 'pass' | 'fail' | 'abandon';

type RuntimeCheckpointState = {
    sessionId: string;
    checkpoint: string;
    timestamp: number;
    active: boolean;
    page: string;
    levelId: number;
    clientBuildId: string;
};

function normalizePositiveLevelId(value: string | number | undefined): number {
    const num = Math.floor(Number(value) || 0);
    return num > 0 ? num : 0;
}

const PCH_GAMEPLAY_INTEGER_FIELDS: ReadonlyArray<keyof PchGameplayAnalyticsSnapshot> = [
    'magnetUses',
    'brushUses',
    'freezeUses',
];

function normalizeGameplayMode(value: unknown): string {
    return value === PCH_GAMEPLAY_MODE ? PCH_GAMEPLAY_MODE : '';
}

function normalizeGameplaySchemaVersion(value: unknown, gameplayMode: string): number {
    if (gameplayMode !== PCH_GAMEPLAY_MODE) return 0;
    return Math.floor(Number(value) || 0) === PCH_GAMEPLAY_SCHEMA_VERSION
        ? PCH_GAMEPLAY_SCHEMA_VERSION
        : 0;
}

function normalizeFailureReason(value: unknown): PchFailureReason {
    return value === 'timeout' || value === 'buffer_full' ? value : '';
}

function normalizePchGameplayStats(value: unknown): PchGameplayAnalyticsSnapshot | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as Record<string, unknown>;
    const normalized = {} as PchGameplayAnalyticsSnapshot;
    for (const field of PCH_GAMEPLAY_INTEGER_FIELDS) {
        normalized[field] = Math.min(1_000_000_000, Math.max(0, Math.floor(Number(source[field]) || 0)));
    }
    return normalized;
}

function resolveClientBuildIdentity(): { id: string; source: string } {
    const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const injectedId = String(globalScope?.__PDD_CLIENT_BUILD_ID__ || '').trim();
    if (injectedId) {
        return { id: injectedId.slice(0, 80), source: 'wechat_build_marker' };
    }
    return { id: 'browser-dev', source: 'browser_dev' };
}

function sanitizeRuntimeDiagnosticText(value: unknown): string {
    return String(value || '')
        .replace(/https?:\/\/[^\s]+/gi, '[url]')
        .replace(/\b(?:openid|token|session)=[^\s&]+/gi, '[credential]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/\b1[3-9]\d{9}\b/g, '[phone]')
        .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[token]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_RUNTIME_DIAGNOSTIC_MESSAGE_LENGTH);
}

function resolveRuntimeDiagnosticMessage(payload: unknown): string {
    if (typeof payload === 'string') {
        return sanitizeRuntimeDiagnosticText(payload);
    }
    if (!payload || typeof payload !== 'object') {
        return '';
    }
    const value: any = payload;
    const reason = value.reason;
    const error = value.error;
    return sanitizeRuntimeDiagnosticText(
        value.message
        || (reason && typeof reason === 'object' ? reason.message : reason)
        || (error && typeof error === 'object' ? error.message : error)
        || '',
    );
}

function resolveRuntimeDiagnosticCode(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const value: any = payload;
    const reason = value.reason && typeof value.reason === 'object' ? value.reason : null;
    const error = value.error && typeof value.error === 'object' ? value.error : null;
    const code = value.errCode ?? value.errno ?? value.code
        ?? reason?.errCode ?? reason?.errno ?? reason?.code
        ?? error?.errCode ?? error?.errno ?? error?.code;
    return code === undefined || code === null
        ? ''
        : sanitizeRuntimeDiagnosticText(code).slice(0, 64);
}

function createDiagnosticFingerprint(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `00000000${(hash >>> 0).toString(16)}`.slice(-8);
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
    private runtimeDiagnosticsBound = false;
    private rewardedAdLoadTelemetryBound = false;
    private runtimeDiagnosticCount = 0;
    private readonly runtimeDiagnosticFingerprints = new Set<string>();
    private lastRuntimeCheckpoint = 'analytics_created';
    private lastRuntimeCheckpointAt = this.appLaunchTime;
    private constructor() {
        this.openid = this.readCachedOpenid();
        this.recoverPreviousRuntimeCheckpoint();
        this.markRuntimeCheckpoint('analytics_created', true, 'app', 0);
        this.bindRuntimeDiagnostics();
        this.bindRewardedAdLoadTelemetry();
        this.bindLifecycle();
    }

    async bootstrap(): Promise<boolean> {
        this.bindGlobalReporter();
        this.bindLifecycle();
        this.bindRuntimeDiagnostics();
        this.markRuntimeCheckpoint('analytics_bootstrap', true, 'app', 0);
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
                gameplayMode: normalizeGameplayMode(opt.gameplayMode ?? this.levelContext.gameplayMode),
                gameplaySchemaVersion: normalizeGameplaySchemaVersion(
                    opt.gameplaySchemaVersion ?? this.levelContext.gameplaySchemaVersion,
                    normalizeGameplayMode(opt.gameplayMode ?? this.levelContext.gameplayMode),
                ),
                failureReason: normalizeFailureReason(opt.failureReason),
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
        const gameplayMode = normalizeGameplayMode(opt.gameplayMode ?? this.levelContext.gameplayMode);
        const gameplaySchemaVersion = normalizeGameplaySchemaVersion(
            opt.gameplaySchemaVersion ?? this.levelContext.gameplaySchemaVersion,
            gameplayMode,
        );
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
            ...(gameplayMode ? { gameplayMode, gameplaySchemaVersion } : {}),
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
        this.markRuntimeCheckpoint(
            'first_level_ui_ready',
            true,
            context?.page || 'game',
            normalizePositiveLevelId(context?.logicalLevelId ?? context?.levelId),
        );
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
        const gameplayMode = context.gameplayMode === undefined
            ? this.levelContext.gameplayMode
            : normalizeGameplayMode(context.gameplayMode);
        this.levelContext = {
            ...this.levelContext,
            ...context,
            gameplayMode,
            gameplaySchemaVersion: context.gameplaySchemaVersion === undefined
                ? this.levelContext.gameplaySchemaVersion
                : normalizeGameplaySchemaVersion(context.gameplaySchemaVersion, gameplayMode || ''),
        };
    }

    beginLevel(
        levelId: number,
        page: string,
        context?: AnalyticsLevelContext,
        gameplayStats?: PchGameplayAnalyticsSnapshot | null,
    ): void {
        const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
        const normalizedPage = page || 'game';
        const now = Date.now();
        if (context) {
            this.setLevelContext(context);
        }
        const gameplayMode = normalizeGameplayMode(this.levelContext.gameplayMode);
        const gameplaySchemaVersion = normalizeGameplaySchemaVersion(
            this.levelContext.gameplaySchemaVersion,
            gameplayMode,
        );
        const normalizedGameplayStats = normalizePchGameplayStats(gameplayStats);

        if (this.levelSession && !this.levelSession.finalized && this.levelSession.levelId !== normalizedLevelId) {
            void this.finalizeActiveLevel(false, 'abandon');
        }

        if (this.levelSession && !this.levelSession.finalized && this.levelSession.levelId === normalizedLevelId) {
            this.levelSession.tryCount += 1;
            this.levelSession.pendingFailure = false;
            this.levelSession.page = normalizedPage;
            this.levelSession.startTime = now;
            this.levelSession.smartHintShownCount = 0;
            this.levelSession.gameplayMode = gameplayMode;
            this.levelSession.gameplaySchemaVersion = gameplaySchemaVersion;
            this.levelSession.failureReason = '';
            this.levelSession.gameplayStats = normalizedGameplayStats;
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
                gameplayMode,
                gameplaySchemaVersion,
                failureReason: '',
                gameplayStats: normalizedGameplayStats,
            };
        }

        this.markRuntimeCheckpoint('level_begin', true, normalizedPage, normalizedLevelId);
        void this.wxReportData({
            eventName: 'enter_level',
            levelId: normalizedLevelId,
            page: normalizedPage,
            actionType: 1,
            gameplayMode,
            gameplaySchemaVersion,
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

    markLevelFailed(page?: string, levelIdFallback?: number, update?: LevelSessionAnalyticsUpdate): void {
        const session = this.levelSession;
        this.updateLevelSessionAnalytics(session, update);
        const levelId = session?.levelId ?? normalizePositiveLevelId(levelIdFallback);
        const currentPage = page || session?.page || 'game';
        if (session && !session.finalized) {
            session.pendingFailure = true;
        }
        this.markRuntimeCheckpoint('level_fail', true, currentPage, levelId);
        void this.wxReportData({
            eventName: 'level_fail',
            levelId,
            page: currentPage,
            actionType: 4,
            gameplayMode: session?.gameplayMode,
            gameplaySchemaVersion: session?.gameplaySchemaVersion,
            failureReason: session?.failureReason || normalizeFailureReason(update?.failureReason),
        });
    }

    markLevelPassed(page?: string, levelIdFallback?: number, update?: LevelSessionAnalyticsUpdate): void {
        const session = this.levelSession;
        this.updateLevelSessionAnalytics(session, update);
        const levelId = session?.levelId ?? normalizePositiveLevelId(levelIdFallback);
        const currentPage = page || session?.page || 'game';
        const smartHintShownCount = this.getSmartHintShownCount();
        this.markRuntimeCheckpoint('level_pass', true, currentPage, levelId);
        void this.wxReportData({
            eventName: 'level_pass',
            levelId,
            page: currentPage,
            actionType: 3,
            smartHintShownCount,
            gameplayMode: session?.gameplayMode,
            gameplaySchemaVersion: session?.gameplaySchemaVersion,
            failureReason: session?.failureReason,
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

    abandonActiveLevel(update?: LevelSessionAnalyticsUpdate): void {
        this.updateLevelSessionAnalytics(this.levelSession, update);
        void this.finalizeActiveLevel(false, 'abandon');
    }

    finalizePendingFailedLevel(update?: LevelSessionAnalyticsUpdate): void {
        const session = this.levelSession;
        if (!session || session.finalized || !session.pendingFailure) {
            return;
        }
        this.updateLevelSessionAnalytics(session, update);
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

    trackRevivePanelShow(page: string, levelId?: number): void {
        void this.wxReportData({
            eventName: 'revive_panel_show',
            levelId: levelId ?? this.levelSession?.levelId ?? 0,
            page,
            actionType: 1,
        });
    }

    trackReviveSuccess(page: string, levelId?: number): void {
        void this.wxReportData({
            eventName: 'revive_success',
            levelId: levelId ?? this.levelSession?.levelId ?? 0,
            page,
            actionType: 3,
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

    private bindRuntimeDiagnostics(): void {
        if (this.runtimeDiagnosticsBound) return;
        const api = getWeChatMiniGameRuntime();
        if (!api) return;
        this.runtimeDiagnosticsBound = true;
        const bind = (name: string, listener: (payload: unknown) => void) => {
            try {
                const register = api[name];
                if (typeof register === 'function') {
                    register.call(api, listener);
                }
            } catch (error) {
                console.warn(`[AnalyticsMgr] ${name} binding failed:`, error);
            }
        };
        bind('onError', (payload) => {
            this.reportRuntimeDiagnostic('runtime_error', payload);
        });
        bind('onUnhandledRejection', (payload) => {
            this.reportRuntimeDiagnostic('runtime_unhandled_rejection', payload);
        });
        bind('onMemoryWarning', (payload) => {
            this.reportRuntimeDiagnostic('runtime_memory_warning', payload);
        });
    }

    private bindRewardedAdLoadTelemetry(): void {
        if (this.rewardedAdLoadTelemetryBound) return;
        this.rewardedAdLoadTelemetryBound = true;
        subscribeRewardedAdLoadEvents((event: RewardedAdLoadEvent) => {
            const eventName = event.stage === 'start'
                ? 'rewarded_ad_load_start'
                : event.stage === 'success'
                    ? 'rewarded_ad_load_success'
                    : 'rewarded_ad_load_fail';
            const levelId = this.levelSession?.levelId
                ?? normalizePositiveLevelId(this.levelContext.logicalLevelId);
            this.trackFunnelEvent({
                eventName,
                page: this.levelSession?.page || 'app',
                levelId,
                source: 'rewarded_ad_native_load',
                success: event.stage !== 'fail',
                errorCode: event.stage === 'fail' ? event.errorCode : '',
                duration: event.durationMs,
                extra: {
                    platform: event.platform,
                    loadId: event.loadId,
                    attemptId: event.requestId,
                    generation: event.generation,
                    loadReason: event.reason,
                    durationMs: event.durationMs,
                },
            });
            if (event.stage !== 'start') {
                this.flushFunnelEvents();
            }
        });
    }

    private reportRuntimeDiagnostic(
        eventName: 'runtime_error' | 'runtime_unhandled_rejection' | 'runtime_memory_warning',
        payload: unknown,
    ): void {
        if (this.runtimeDiagnosticCount >= MAX_RUNTIME_DIAGNOSTICS_PER_SESSION) return;
        const message = resolveRuntimeDiagnosticMessage(payload);
        const errorCode = resolveRuntimeDiagnosticCode(payload);
        const memoryWarningLevel = eventName === 'runtime_memory_warning'
            ? Math.max(0, Math.floor(Number((payload as any)?.level) || 0))
            : 0;
        const fingerprint = createDiagnosticFingerprint(
            `${eventName}|${errorCode}|${message}|${memoryWarningLevel}`,
        );
        if (this.runtimeDiagnosticFingerprints.has(fingerprint)) return;
        this.runtimeDiagnosticFingerprints.add(fingerprint);
        this.runtimeDiagnosticCount += 1;

        const levelId = this.levelSession?.levelId
            ?? normalizePositiveLevelId(this.levelContext.logicalLevelId);
        try {
            this.trackFunnelEvent({
                eventName,
                page: this.levelSession?.page || (levelId > 0 ? 'level_game' : 'app'),
                levelId,
                source: 'wechat_runtime',
                success: false,
                errorCode: errorCode || eventName,
                errorMessage: message,
                extra: {
                    diagnosticFingerprint: fingerprint,
                    checkpoint: this.lastRuntimeCheckpoint,
                    checkpointAgeMs: Math.max(0, Date.now() - this.lastRuntimeCheckpointAt),
                    memoryWarningLevel,
                    diagnosticIndex: this.runtimeDiagnosticCount,
                },
            });
            this.flushFunnelEvents();
        } catch (error) {
            console.warn('[AnalyticsMgr] runtime diagnostic reporting failed:', error);
        }
    }

    private recoverPreviousRuntimeCheckpoint(): void {
        const previous = this.readRuntimeCheckpoint();
        if (!previous || !previous.active || previous.sessionId === this.funnelSessionId) return;
        const ageMs = Date.now() - previous.timestamp;
        if (ageMs < 0 || ageMs > RUNTIME_CHECKPOINT_MAX_AGE_MS) return;
        try {
            this.trackFunnelEvent({
                eventName: 'previous_session_unclean_exit',
                page: previous.page || 'app',
                levelId: previous.levelId,
                source: 'runtime_checkpoint',
                success: false,
                errorCode: 'foreground_session_not_closed',
                errorMessage: 'Previous foreground session ended without app_hide',
                extra: {
                    checkpoint: previous.checkpoint,
                    checkpointAgeMs: ageMs,
                    previousClientBuildId: previous.clientBuildId,
                },
            });
        } catch (error) {
            console.warn('[AnalyticsMgr] previous runtime checkpoint reporting failed:', error);
        }
    }

    private markRuntimeCheckpoint(
        checkpoint: string,
        active: boolean,
        page?: string,
        levelId?: number,
    ): void {
        const now = Date.now();
        const normalizedCheckpoint = String(checkpoint || 'unknown').trim().slice(0, 80) || 'unknown';
        const normalizedLevelId = Math.max(
            0,
            Math.floor(Number(levelId ?? this.levelSession?.levelId ?? this.levelContext.logicalLevelId) || 0),
        );
        const normalizedPage = String(page || this.levelSession?.page || 'app').trim().slice(0, 64) || 'app';
        const clientBuild = resolveClientBuildIdentity();
        this.lastRuntimeCheckpoint = normalizedCheckpoint;
        this.lastRuntimeCheckpointAt = now;
        const state: RuntimeCheckpointState = {
            sessionId: this.funnelSessionId,
            checkpoint: normalizedCheckpoint,
            timestamp: now,
            active,
            page: normalizedPage,
            levelId: normalizedLevelId,
            clientBuildId: clientBuild.id,
        };
        try {
            sys.localStorage.setItem(LS_RUNTIME_CHECKPOINT, JSON.stringify(state));
        } catch (_) {
            // Runtime reporting must not change game behavior when storage is unavailable.
        }
    }

    private readRuntimeCheckpoint(): RuntimeCheckpointState | null {
        try {
            const raw = sys.localStorage.getItem(LS_RUNTIME_CHECKPOINT);
            if (!raw) return null;
            const value = JSON.parse(raw);
            const timestamp = Math.floor(Number(value?.timestamp) || 0);
            const sessionId = String(value?.sessionId || '').trim().slice(0, 96);
            const checkpoint = String(value?.checkpoint || '').trim().slice(0, 80);
            if (!sessionId || !checkpoint || timestamp <= 0) return null;
            return {
                sessionId,
                checkpoint,
                timestamp,
                active: value?.active === true,
                page: String(value?.page || 'app').trim().slice(0, 64) || 'app',
                levelId: Math.max(0, Math.floor(Number(value?.levelId) || 0)),
                clientBuildId: String(value?.clientBuildId || '').trim().slice(0, 80),
            };
        } catch (_) {
            return null;
        }
    }

    private updateLevelSessionAnalytics(
        session: LevelSessionState | null,
        update?: LevelSessionAnalyticsUpdate,
    ): void {
        if (!session || session.finalized || !update) return;
        if (update.gameplayStats !== undefined) {
            session.gameplayStats = normalizePchGameplayStats(update.gameplayStats);
        }
        if (update.failureReason !== undefined) {
            session.failureReason = normalizeFailureReason(update.failureReason);
        }
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
                gameplayMode: session.gameplayMode,
                gameplaySchemaVersion: session.gameplaySchemaVersion,
                failureReason: session.failureReason,
                gameplayStats: session.gameplayStats || undefined,
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
        this.markRuntimeCheckpoint(
            'app_hide',
            false,
            this.levelSession?.page || 'app',
            this.levelSession?.levelId || 0,
        );
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
        this.markRuntimeCheckpoint(
            'app_show',
            true,
            this.levelSession?.page || 'app',
            this.levelSession?.levelId || 0,
        );
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
