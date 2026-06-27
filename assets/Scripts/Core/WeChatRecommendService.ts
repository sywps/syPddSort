import { Game, game, sys } from 'cc';
import { AnalyticsMgr } from './AnalyticsMgr';
import { getWeChatMiniGameRuntime } from './MiniGamePlatform';
import { UserStateSyncMgr } from './UserStateSyncMgr';
import type { CloudGameState } from './UserStateSyncMgr';

export type WeChatRecommendAutoContext = {
    logicalLevelId: number;
    physicalLevelId?: number;
    page?: string;
    source?: string;
    isThemeLevel?: boolean;
};

type RecommendResultStatus = 'recommended' | 'not_recommended';

type RecommendOpenResult = {
    ok: true;
    status: RecommendResultStatus;
    isRecommended: boolean;
    callbackSupported: true;
    shown: boolean;
};

type EligibilityResult = {
    ok: boolean;
    reason?: string;
};

type OpenCallbacks = {
    onReady?: () => void;
    onPageShow?: () => void;
    onShowCalled?: () => void;
};

type RecommendationSuccessState = {
    recommended: boolean;
    recommendedAt: number;
    firstSuccessAt: number;
};

const FIRST_AUTO_LEVEL = 15;
const AUTO_LEVEL_INTERVAL = 5;
const COMPONENT_RESULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_SOURCE = 'win_panel_auto';
const OFFICIAL_RECOMMEND_OPENLINK = 'TWFRCqV5WeM2AkMXhKwJ03MhfPOieJfAsvXKUbWvQFQtLyyA5etMPabBehga950uzfZcH3Vi3QeEh41xRGEVFw';

const LS_RECOMMENDED = 'pdd.wechat_recommend.recommended';
const LS_RECOMMENDED_AT = 'pdd.wechat_recommend.recommendedAt';
const LS_FIRST_SUCCESS_AT = 'pdd.wechat_recommend.firstSuccessAt';
const LS_LAST_SHOWN_AT = 'pdd.wechat_recommend.lastShownAt';
const LS_LAST_SHOWN_LEVEL = 'pdd.wechat_recommend.lastShownLevel';
const LS_LAST_SHOWN_DATE = 'pdd.wechat_recommend.lastShownDate';

function readGlobalString(name: string): string {
    const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const windowScope: any = typeof window !== 'undefined' ? window : null;
    return String(globalScope?.[name] || windowScope?.[name] || '').trim();
}

function getConfiguredRecommendOpenlink(): string {
    return readGlobalString('__PDD_WECHAT_RECOMMEND_OPENLINK__')
        || readGlobalString('__PDD_WECHAT_RECOMMEND_OPEN_LINK__')
        || OFFICIAL_RECOMMEND_OPENLINK;
}

function normalizeLevel(value: unknown): number {
    return Math.max(1, Math.floor(Number(value) || 1));
}

function parseStoredNumber(key: string): number {
    try {
        const raw = sys.localStorage.getItem(key);
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    } catch (_) {
        return 0;
    }
}

function writeStoredNumber(key: string, value: number): void {
    try {
        sys.localStorage.setItem(key, String(Math.max(0, Math.floor(Number(value) || 0))));
    } catch (_) {}
}

function readStoredFlag(key: string): boolean {
    try {
        return sys.localStorage.getItem(key) === '1';
    } catch (_) {
        return false;
    }
}

function writeStoredFlag(key: string, value: boolean): void {
    try {
        sys.localStorage.setItem(key, value ? '1' : '0');
    } catch (_) {}
}

function earliestPositiveTimestamp(...values: number[]): number {
    const normalized = values
        .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
        .filter((value) => value > 0);
    if (normalized.length === 0) return 0;
    return Math.min(...normalized);
}

function getLocalDateKey(now: number): string {
    const date = new Date(now);
    const year = date.getFullYear();
    const monthValue = date.getMonth() + 1;
    const dayValue = date.getDate();
    const month = monthValue < 10 ? `0${monthValue}` : `${monthValue}`;
    const day = dayValue < 10 ? `0${dayValue}` : `${dayValue}`;
    return `${year}${month}${day}`;
}

function getOpenPageErrorCode(error: any): string {
    const directRaw = error?.errCode ?? error?.code ?? error?.errno;
    if (typeof directRaw === 'string' && directRaw.trim()) return directRaw.trim().slice(0, 80);
    const direct = Number(directRaw);
    if (Number.isFinite(direct)) return String(direct);
    const message = String(error?.errMsg || error?.message || error?.errInfo || error || '');
    const match = /(?:^|[^\d-])(-?\d+)(?:[^\d]|$)/.exec(message);
    return match ? match[1] : '';
}

function getOpenPageErrorMessage(error: any): string {
    return String(error?.errMsg || error?.message || error?.errInfo || error || '').slice(0, 240);
}

function createRecommendOpenError(errorCode: string, errorMessage: string, rawError?: unknown): Error {
    const code = String(errorCode || 'open_failed').trim() || 'open_failed';
    const message = String(errorMessage || 'WeChat recommendation page failed.').trim() || 'WeChat recommendation page failed.';
    const error: any = new Error(`[wechat-recommend] ${code}: ${message}`);
    error.code = code;
    error.rawError = rawError;
    return error;
}

export class WeChatRecommendService {
    private static _inst: WeChatRecommendService | null = null;

    static get inst(): WeChatRecommendService {
        if (!WeChatRecommendService._inst) {
            WeChatRecommendService._inst = new WeChatRecommendService();
        }
        return WeChatRecommendService._inst;
    }

    private shownThisSession = false;
    private opening = false;
    private lifecycleBound = false;
    private suppressedKeysThisSession = new Set<string>();
    private recommendedInMemory = false;
    private recommendedAtInMemory = 0;
    private firstSuccessAtInMemory = 0;

    private constructor() {
        this.refreshRecommendationStateFromLocal();
        this.bindLifecycle();
    }

    getCloudGameStatePatch(): Partial<CloudGameState> {
        const state = this.getRecommendationSuccessState();
        if (!state.recommended) return {};
        const timestamp = state.recommendedAt || state.firstSuccessAt || Date.now();
        return {
            wechatRecommendRecommended: true,
            wechatRecommendRecommendedAt: timestamp,
            wechatRecommendFirstSuccessAt: state.firstSuccessAt || timestamp,
        };
    }

    applyCloudGameState(gameState?: Partial<CloudGameState> | null): void {
        const cloudRecommended = gameState?.wechatRecommendRecommended === true;
        if (cloudRecommended) {
            const recommendedAt = Math.max(0, Math.floor(Number(gameState?.wechatRecommendRecommendedAt) || 0));
            const firstSuccessAt = Math.max(0, Math.floor(Number(gameState?.wechatRecommendFirstSuccessAt) || 0));
            this.applyRecommendationSuccessState({
                recommended: true,
                recommendedAt: Math.max(recommendedAt, firstSuccessAt),
                firstSuccessAt: firstSuccessAt || recommendedAt,
            }, false);
            return;
        }

        if (this.hasRecommendedState()) {
            this.queueRecommendationCloudSave();
        }
    }

    attemptAutoShowAfterWin(context: WeChatRecommendAutoContext): boolean {
        this.bindLifecycle();
        const normalizedContext = this.normalizeContext(context);
        const eligibility = this.getAutoEligibility(normalizedContext);
        if (!eligibility.ok) {
            this.trackSuppressed(normalizedContext, eligibility.reason || 'unknown');
            return false;
        }

        void this.openAuto(normalizedContext);
        return true;
    }

    private bindLifecycle(): void {
        if (this.lifecycleBound) return;
        this.lifecycleBound = true;
        game.on(Game.EVENT_SHOW, this.handleGameShow, this);
    }

    private handleGameShow(): void {
        this.refreshRecommendationStateFromLocal();
        this.shownThisSession = false;
        this.suppressedKeysThisSession.clear();
    }

    private normalizeContext(context: WeChatRecommendAutoContext): Required<WeChatRecommendAutoContext> {
        const logicalLevelId = normalizeLevel(context.logicalLevelId);
        return {
            logicalLevelId,
            physicalLevelId: normalizeLevel(context.physicalLevelId || logicalLevelId),
            page: context.page || 'game',
            source: context.source || DEFAULT_SOURCE,
            isThemeLevel: context.isThemeLevel === true,
        };
    }

    private getAutoEligibility(context: Required<WeChatRecommendAutoContext>): EligibilityResult {
        if (context.isThemeLevel) return { ok: false, reason: 'theme_level' };
        if (context.logicalLevelId < FIRST_AUTO_LEVEL) return { ok: false, reason: 'before_first_level' };
        if (this.hasRecommendedState()) return { ok: false, reason: 'already_recommended' };
        if (this.opening) return { ok: false, reason: 'opening' };
        if (this.shownThisSession) return { ok: false, reason: 'session_cap' };

        const openlink = getConfiguredRecommendOpenlink();
        if (!openlink) return { ok: false, reason: 'missing_openlink' };

        const now = Date.now();
        const today = getLocalDateKey(now);
        try {
            if (sys.localStorage.getItem(LS_LAST_SHOWN_DATE) === today) {
                return { ok: false, reason: 'daily_cap' };
            }
        } catch (_) {}

        const lastShownLevel = parseStoredNumber(LS_LAST_SHOWN_LEVEL);
        if (lastShownLevel > 0 && context.logicalLevelId - lastShownLevel < AUTO_LEVEL_INTERVAL) {
            return { ok: false, reason: 'level_interval' };
        }

        return { ok: true };
    }

    private async openAuto(context: Required<WeChatRecommendAutoContext>): Promise<void> {
        if (this.opening) return;
        this.opening = true;
        const openlink = getConfiguredRecommendOpenlink();
        this.track(context, 'wechat_recommend_auto_attempt');

        try {
            const result = await this.openOfficialRecommendComponent(openlink, {
                onReady: () => this.track(context, 'wechat_recommend_ready'),
                onPageShow: () => this.track(context, 'wechat_recommend_component_show'),
                onShowCalled: () => this.markShown(context),
            });
            this.applyOpenResult(context, result);
        } catch (error) {
            this.track(context, 'wechat_recommend_error', false, {}, getOpenPageErrorCode(error), getOpenPageErrorMessage(error));
            throw error;
        } finally {
            this.opening = false;
        }
    }

    private markShown(context: Required<WeChatRecommendAutoContext>): void {
        const now = Date.now();
        this.shownThisSession = true;
        writeStoredNumber(LS_LAST_SHOWN_AT, now);
        writeStoredNumber(LS_LAST_SHOWN_LEVEL, context.logicalLevelId);
        try {
            sys.localStorage.setItem(LS_LAST_SHOWN_DATE, getLocalDateKey(now));
        } catch (_) {}
    }

    private applyOpenResult(context: Required<WeChatRecommendAutoContext>, result: RecommendOpenResult): void {
        this.track(context, 'wechat_recommend_component_destroy', result.status === 'recommended', {
            callbackSupported: result.callbackSupported,
            isRecommended: result.isRecommended,
            status: result.status,
        });

        if (result.status === 'recommended') {
            const now = Date.now();
            const firstSuccess = this.markRecommended(now);
            if (firstSuccess) {
                this.track(context, 'wechat_recommend_first_success', true, {
                    callbackSupported: result.callbackSupported,
                });
            }
            return;
        }

        if (result.status === 'not_recommended') {
            this.track(context, 'wechat_recommend_not_recommended', false, {
                callbackSupported: result.callbackSupported,
            });
            return;
        }

    }

    private hasRecommendedState(): boolean {
        return this.getRecommendationSuccessState().recommended;
    }

    private readLocalRecommendationSuccessState(): RecommendationSuccessState {
        const storedRecommended = readStoredFlag(LS_RECOMMENDED);
        const recommendedAt = parseStoredNumber(LS_RECOMMENDED_AT);
        const firstSuccessAt = parseStoredNumber(LS_FIRST_SUCCESS_AT);
        const recommended = storedRecommended || recommendedAt > 0 || firstSuccessAt > 0;
        const latestRecommendedAt = Math.max(recommendedAt, firstSuccessAt);
        return {
            recommended,
            recommendedAt: latestRecommendedAt,
            firstSuccessAt: earliestPositiveTimestamp(firstSuccessAt, recommendedAt),
        };
    }

    private refreshRecommendationStateFromLocal(): void {
        const localState = this.readLocalRecommendationSuccessState();
        if (!localState.recommended && !this.recommendedInMemory) return;
        this.recommendedInMemory = this.recommendedInMemory || localState.recommended;
        this.recommendedAtInMemory = Math.max(this.recommendedAtInMemory, localState.recommendedAt);
        this.firstSuccessAtInMemory = earliestPositiveTimestamp(this.firstSuccessAtInMemory, localState.firstSuccessAt);
    }

    private getRecommendationSuccessState(): RecommendationSuccessState {
        this.refreshRecommendationStateFromLocal();
        const recommendedAt = Math.max(this.recommendedAtInMemory, this.firstSuccessAtInMemory);
        return {
            recommended: this.recommendedInMemory || recommendedAt > 0,
            recommendedAt,
            firstSuccessAt: earliestPositiveTimestamp(this.firstSuccessAtInMemory, recommendedAt),
        };
    }

    private applyRecommendationSuccessState(state: RecommendationSuccessState, syncCloud: boolean): boolean {
        const before = this.getRecommendationSuccessState();
        if (!state.recommended) return false;

        const knownTimestamp = Math.max(state.recommendedAt, state.firstSuccessAt, before.recommendedAt, before.firstSuccessAt);
        const fallbackTimestamp = knownTimestamp > 0 ? 0 : Date.now();
        const recommendedAt = Math.max(state.recommendedAt, state.firstSuccessAt, before.recommendedAt, fallbackTimestamp);
        const firstSuccessAt = earliestPositiveTimestamp(before.firstSuccessAt, state.firstSuccessAt, state.recommendedAt, recommendedAt) || recommendedAt;
        this.recommendedInMemory = true;
        this.recommendedAtInMemory = recommendedAt;
        this.firstSuccessAtInMemory = firstSuccessAt;
        writeStoredFlag(LS_RECOMMENDED, true);
        writeStoredNumber(LS_RECOMMENDED_AT, recommendedAt);
        writeStoredNumber(LS_FIRST_SUCCESS_AT, firstSuccessAt);

        if (syncCloud) {
            this.queueRecommendationCloudSave();
        }
        return !before.recommended;
    }

    private markRecommended(now: number): boolean {
        return this.applyRecommendationSuccessState({
            recommended: true,
            recommendedAt: now,
            firstSuccessAt: now,
        }, true);
    }

    private queueRecommendationCloudSave(): void {
        const gameState = this.getCloudGameStatePatch();
        if (gameState.wechatRecommendRecommended !== true) return;
        UserStateSyncMgr.inst.queueSave({ gameState });
    }

    private async openOfficialRecommendComponent(openlink: string, callbacks: OpenCallbacks): Promise<RecommendOpenResult> {
        const target = String(openlink || '').trim();
        if (!target) {
            throw createRecommendOpenError('missing_openlink', 'WeChat recommendation openlink is empty.');
        }

        const wxRuntime = getWeChatMiniGameRuntime();
        if (!wxRuntime) {
            throw createRecommendOpenError('not_wechat_runtime', 'WeChat runtime is unavailable.');
        }
        if (typeof wxRuntime.createPageManager !== 'function') {
            throw createRecommendOpenError('page_manager_unavailable', 'wx.createPageManager is unavailable.');
        }

        let pageManager: any = null;
        try {
            pageManager = wxRuntime.createPageManager();
        } catch (error) {
            throw createRecommendOpenError(getOpenPageErrorCode(error), getOpenPageErrorMessage(error), error);
        }
        if (!pageManager || typeof pageManager.load !== 'function' || typeof pageManager.show !== 'function' || typeof pageManager.on !== 'function') {
            throw createRecommendOpenError('page_manager_invalid', 'PageManager load/show/on is unavailable.');
        }

        let resolveResult: ((result: RecommendOpenResult) => void) | null = null;
        let rejectResult: ((error: unknown) => void) | null = null;
        let resultPromise: Promise<RecommendOpenResult>;
        let timeoutId: any = null;
        let shown = false;

        resultPromise = new Promise<RecommendOpenResult>((resolve, reject) => {
            let settled = false;
            const settle = (result: RecommendOpenResult) => {
                if (settled) return;
                settled = true;
                if (timeoutId !== null) clearTimeout(timeoutId);
                resolve(result);
            };
            const rejectOpen = (error: unknown) => {
                if (settled) return;
                settled = true;
                if (timeoutId !== null) clearTimeout(timeoutId);
                reject(error);
            };
            resolveResult = settle;
            rejectResult = rejectOpen;
            timeoutId = setTimeout(() => {
                rejectOpen(createRecommendOpenError('destroy_timeout', 'PageManager destroy callback timeout.'));
            }, COMPONENT_RESULT_TIMEOUT_MS);

            try {
                pageManager.on('ready', () => callbacks.onReady?.());
                pageManager.on('show', () => callbacks.onPageShow?.());
                pageManager.on('destroy', (res: any) => {
                    if (typeof res?.isRecommended !== 'boolean') {
                        rejectOpen(createRecommendOpenError('missing_recommend_status', 'PageManager destroy result missing isRecommended.', res));
                        return;
                    }
                    settle({
                        ok: true,
                        status: res.isRecommended ? 'recommended' : 'not_recommended',
                        isRecommended: res.isRecommended,
                        callbackSupported: true,
                        shown,
                    });
                });
                pageManager.on('error', (error: any) => {
                    rejectOpen(createRecommendOpenError(getOpenPageErrorCode(error), getOpenPageErrorMessage(error), error));
                });
            } catch (error) {
                rejectOpen(createRecommendOpenError(getOpenPageErrorCode(error), getOpenPageErrorMessage(error), error));
            }
        });
        resultPromise.catch(() => undefined);

        if (!resolveResult || !rejectResult) {
            throw createRecommendOpenError('page_manager_listener_failed', 'PageManager listener setup failed.');
        }

        try {
            await Promise.resolve(pageManager.load({ openlink: target }));
            await Promise.resolve(pageManager.show());
            shown = true;
            callbacks.onShowCalled?.();
        } catch (error) {
            const openError = createRecommendOpenError(getOpenPageErrorCode(error), getOpenPageErrorMessage(error), error);
            rejectResult(openError);
            throw openError;
        }

        return resultPromise;
    }

    private trackSuppressed(context: Required<WeChatRecommendAutoContext>, reason: string): void {
        if (reason === 'before_first_level' || reason === 'theme_level') return;
        const key = reason === 'level_interval'
            ? `${reason}:${context.logicalLevelId}`
            : reason;
        if (this.suppressedKeysThisSession.has(key)) return;
        this.suppressedKeysThisSession.add(key);
        this.track(context, 'wechat_recommend_auto_suppressed', false, { reason });
    }

    private track(
        context: Required<WeChatRecommendAutoContext>,
        eventName: string,
        success: boolean = false,
        extra: Record<string, unknown> = {},
        errorCode: string = '',
        errorMessage: string = '',
    ): void {
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName,
            page: context.page,
            levelId: context.logicalLevelId,
            logicalLevelId: context.logicalLevelId,
            physicalLevelId: context.physicalLevelId,
            source: context.source,
            success,
            errorCode,
            errorMessage,
            extra: {
                trigger: DEFAULT_SOURCE,
                firstAutoLevel: FIRST_AUTO_LEVEL,
                levelInterval: AUTO_LEVEL_INTERVAL,
                ...extra,
            },
        });
    }
}
