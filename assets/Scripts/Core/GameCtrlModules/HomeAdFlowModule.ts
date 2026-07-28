import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size,
    instantiate,
    NodePool, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, DAILY_SIGNIN_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_TEXTURE_SEARCH_DIRS, RESULT_PANEL_TEXTURE_NAMES, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY, MAINLINE_SLOT_LOCK_DASH_ALPHA,
    MAINLINE_SLOT_LOCK_ROW_WIDTH, MAINLINE_SLOT_LOCK_ROW_HEIGHT, MAINLINE_SLOT_PANEL_TEXTURE, MAINLINE_SLOT_GROOVE_TEXTURE, MAINLINE_SLOT_TEXTURE_NAMES, SKILL_BUTTON_Y, SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_DAILY_SIGNIN_COUNT, LS_DAILY_SIGNIN_LAST_DATE_KEY, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, createSingleColorSpriteFrame, BoardViewportController
} from '../GameCtrlShared';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';
import { ensureGameplayResultPanelController } from '../GameplayResultPanelController';
import { releasePixelPosterPreviewTree } from '../PixelPosterPreviewRenderer';
import { runtimeLog } from '../RuntimeLog';
import type { RewardedAdOutcome, RewardedAdStateSnapshot } from '../../Platform/RewardedAdProvider';

type RewardedGrantToast = string | (() => string);
type RewardedGrantResult = boolean | void | Promise<boolean | void>;
const DEFAULT_GRANT_TIMEOUT_MS = 10000;
const DEFAULT_AFTER_GRANT_TIMEOUT_MS = 15000;
const GRANT_TIMEOUT_TOAST = '奖励处理超时，请稍后查看到账结果';

function resolveGrantTimeoutMs(value: number | undefined, fallback: number): number {
    const normalized = Math.floor(Number(value));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

type RewardedGrantOptions = {
    levelId?: number;
    claimKey?: string;
    markLevelRevive?: boolean;
    busyFlag?: string;
    adFailToast?: RewardedGrantToast;
    grantFailToast?: RewardedGrantToast;
    afterGrantFailToast?: RewardedGrantToast;
    successToast?: RewardedGrantToast;
    onAdComplete?: (success: boolean, outcome?: RewardedAdOutcome) => void;
    onAdFail?: () => void;
    onAdShown?: () => void;
    onRecoverable?: () => void;
    onRecoverableEndable?: () => void;
    suppressPendingStrip?: boolean;
    onInteractionStarted?: () => void;
    onInteractionReleased?: () => void;
    afterGrant?: () => RewardedGrantResult;
    grantTimeoutMs?: number;
    afterGrantTimeoutMs?: number;
    onFinally?: () => void;
};
type RewardedGrantRuntimeTransaction = {
    id: number;
    claimKey: string;
    page: string;
    phase: 'ad' | 'recoverable' | 'recoverable_endable' | 'grant' | 'after_grant';
    grantStage?: 'grant' | 'afterGrant';
    deadlineAt?: number;
    startedAt: number;
    cancel: (reason: string) => void;
};
type ShareGrantOptions = {
    levelId?: number;
    claimKey?: string;
    shareType?: string;
    busyFlag?: string;
    title?: RewardedGrantToast;
    query?: RewardedGrantToast;
    imageUrl?: RewardedGrantToast;
    shareFailToast?: RewardedGrantToast;
    grantFailToast?: RewardedGrantToast;
    afterGrantFailToast?: RewardedGrantToast;
    successToast?: RewardedGrantToast;
    onShareComplete?: (success: boolean) => void;
    afterGrant?: () => RewardedGrantResult;
    grantTimeoutMs?: number;
    afterGrantTimeoutMs?: number;
    onFinally?: () => void;
};

function resolveRewardedGrantToast(toast?: RewardedGrantToast): string {
    if (!toast) return '';
    try {
        return String(typeof toast === 'function' ? toast() : toast).trim();
    } catch (error) {
        console.warn('[RewardedGrant] toast resolver failed:', error);
        return '';
    }
}

function showRewardedGrantToast(runtime: any, toast?: RewardedGrantToast): void {
    const text = resolveRewardedGrantToast(toast);
    if (text && typeof runtime.showToast === 'function') {
        runtime.showToast(text);
    }
}

function getTimedOutGrantClaims(runtime: any): Set<string> {
    if (!(runtime._rewardedGrantTimedOutClaims instanceof Set)) {
        runtime._rewardedGrantTimedOutClaims = new Set<string>();
    }
    return runtime._rewardedGrantTimedOutClaims;
}

export function installHomeAdFlowModule(target: any): void {
    Object.assign(target, {
        cancelRewardedGrantInteraction(reason: string = 'manual'): boolean {
            const transaction = this._rewardedGrantTransaction as RewardedGrantRuntimeTransaction | null;
            const wasRecoverable = transaction?.phase === 'recoverable'
                || transaction?.phase === 'recoverable_endable';
            if (transaction) {
                transaction.cancel(reason);
            }
            let providerCancelled = false;
            try {
                providerCancelled = wasRecoverable
                    ? AdConfig.endRewardedAdWait(reason)
                    : AdConfig.cancelRewardedAdInteraction(reason);
            } catch (error) {
                console.error(`[RewardedGrant] provider cancellation failed: ${reason}`, error);
            }
            if (providerCancelled) {
                AnalyticsMgr.inst.trackFunnelEvent?.({
                    eventName: wasRecoverable ? 'rewarded_ad_wait_cancel' : 'rewarded_ad_load_cancel',
                    page: transaction?.page || this.getAnalyticsPage?.() || 'level_game',
                    levelId: this.getAnalyticsLevelId?.() || 0,
                    source: reason,
                    success: true,
                });
                AnalyticsMgr.inst.flushFunnelEvents?.();
            }
            return providerCancelled || !!transaction;
        },

        runAfterAdWindowClosed(onReady: () => void): void {
            let settled = false;
            const run = () => {
                if (settled || !this.isValid) return;
                settled = true;
                this._pendingPostAdSkillAction = null;
                this.scheduleOnce(() => {
                    if (!this.isValid) return;
                    onReady();
                }, 0.2);
            };
            const waitForForeground = (remainingPolls: number) => {
                if (settled || !this.isValid) return;
                if (this._gameForeground || remainingPolls <= 0) {
                    run();
                    return;
                }
                this.scheduleOnce(() => {
                    waitForForeground(remainingPolls - 1);
                }, 0.05);
            };
            this._pendingPostAdSkillAction = run;
            waitForForeground(20);
        },

        cancelRewardedAdPreload(): void {
            const pending = this._pendingRewardedAdPreload;
            if (pending) {
                this.unschedule(pending);
                this._pendingRewardedAdPreload = null;
            }
        },

        clearRewardedAdPendingStrip(): void {
            const strip = this._rewardedAdPendingStrip as Node | null;
            if (strip?.isValid) {
                strip.targetOff(this);
                strip.destroy();
            }
            this._rewardedAdPendingStrip = null;
        },

        showRewardedAdPendingStrip(
            text: string,
            cancelMode: 'wait' | 'end' = 'wait',
        ): void {
            const sceneName = this.getRuntimeSceneName?.('Game') || 'Game';
            if (sceneName !== 'Game' && sceneName !== 'Home') return;
            let strip = this._rewardedAdPendingStrip as Node | null;
            if (!strip?.isValid) {
                const overlayRoot = this.requireCanvasUiRoot?.('OverlayRoot') as Node | null;
                const template = overlayRoot
                    ?.getChildByName('OverlayTemplates')
                    ?.getChildByName('AdPendingStripTemplate') || null;
                if (!overlayRoot?.isValid || !template?.isValid) {
                    console.error(`[rewarded-ad] ${sceneName}.scene is missing OverlayTemplates/AdPendingStripTemplate`);
                    return;
                }
                strip = instantiate(template);
                strip.name = 'AdPendingStrip';
                strip.active = true;
                overlayRoot.addChild(strip);
                strip.setSiblingIndex(Math.max(0, overlayRoot.children.length - 1));
                this.setGuideNodeLayerRecursively?.(strip, overlayRoot.layer);
                this._rewardedAdPendingStrip = strip;
                const cancelButton = strip.getChildByName('AdPendingCancelButton');
                if (cancelButton) {
                    this.bindPanelButton?.(cancelButton, () => {
                        const transaction = this._rewardedGrantTransaction as RewardedGrantRuntimeTransaction | null;
                        if (transaction?.phase === 'recoverable') {
                            showRewardedGrantToast(this, '奖励确认中，请稍后');
                            return;
                        }
                        if (transaction?.phase === 'recoverable_endable') {
                            this.cancelRewardedGrantInteraction?.('pending-strip-end-wait');
                        }
                    });
                }
            }
            strip.active = true;
            const statusLabel = strip.getChildByName('AdPendingStatusLabel')?.getComponent(Label);
            if (statusLabel) statusLabel.string = text;
            const cancelButton = strip.getChildByName('AdPendingCancelButton');
            if (cancelButton) {
                cancelButton.active = cancelMode !== 'wait';
                const cancelLabel = cancelButton
                    .getChildByName('AdPendingCancelLabel')
                    ?.getComponent(Label);
                if (cancelLabel) {
                    cancelLabel.string = '结束等待';
                }
            }
        },

        ensureRewardedAdStateTelemetry(): void {
            if (this._rewardedAdStateUnsubscribe
                || typeof AdConfig.subscribeRewardedAdState !== 'function') return;
            this._rewardedAdStateUnsubscribe = AdConfig.subscribeRewardedAdState(
                (snapshot: RewardedAdStateSnapshot) => {
                    if (snapshot.previousStatus === snapshot.status) return;
                    let eventName = '';
                    let success = true;
                    if (snapshot.status === 'establishing') {
                        eventName = 'rewarded_ad_show_start';
                    } else if (snapshot.status === 'visible') {
                        eventName = 'rewarded_ad_show_success';
                    } else if (snapshot.status === 'recoverable') {
                        eventName = 'rewarded_ad_wait_shown';
                    } else if (snapshot.status === 'idle' && snapshot.previousStatus === 'establishing') {
                        eventName = 'rewarded_ad_show_fail';
                        success = false;
                    }
                    if (!eventName) return;
                    AnalyticsMgr.inst.trackFunnelEvent?.({
                        eventName,
                        page: this._rewardedAdTelemetryPage || this.getAnalyticsPage?.() || 'level_game',
                        levelId: Number(this._rewardedAdTelemetryLevelId)
                            || this.getAnalyticsLevelId?.()
                            || 0,
                        source: 'rewarded_ad_provider',
                        success,
                        errorCode: success ? '' : String(snapshot.reason || snapshot.status),
                        extra: {
                            attemptId: snapshot.requestId,
                            generation: snapshot.generation,
                            previousStatus: snapshot.previousStatus,
                            providerStatus: snapshot.status,
                            durationMs: snapshot.durationMs,
                            reason: snapshot.reason,
                        },
                    });
                },
            );
        },

        scheduleRewardedAdPreload(reason: string = 'idle', delaySeconds: number = 1): void {
            if (!this.isValid) return;
            this.cancelRewardedAdPreload();
            if (!AdConfig.canAutoPreloadRewardedAd()) {
                runtimeLog(`[AdConfig] skip rewarded ad preload schedule: ${reason}`);
                return;
            }
            const safeDelay = Math.max(1, Number(delaySeconds) || 0);
            const preload = () => {
                if (!this.isValid) return;
                this._pendingRewardedAdPreload = null;
                if (!AdConfig.canAutoPreloadRewardedAd()) return;
                if (!this._gameForeground || this._adTimerSuspended || this._skillActive) return;
                const sceneName = typeof this.getRuntimeSceneName === 'function'
                    ? this.getRuntimeSceneName('Game')
                    : 'Game';
                if (sceneName === 'Game' && this.isGameEnd) return;
                this.ensureRewardedAdStateTelemetry();
                this._rewardedAdTelemetryPage = sceneName === 'Home'
                    ? 'home'
                    : (this.getAnalyticsPage?.() || 'level_game');
                this._rewardedAdTelemetryLevelId = this.getAnalyticsLevelId?.() || 0;
                AdConfig.preloadRewardedAd(reason);
            };
            this._pendingRewardedAdPreload = preload;
            this.scheduleOnce(preload, safeDelay);
        },

        getAnalyticsPage(): string {
            return this._isThemeLevel ? 'theme_level' : 'level_game';
        },

        getAnalyticsLevelId(): number {
            return this._isThemeLevel
                ? (this._currentThemeLevelId || this.levelData?.levelId || 0)
                : this.getActiveLogicalLevelId();
        },

        getRewardedAdMinFallbackWatchMs(page: string): number {
            return page === 'level_revive' ? 5000 : 3000;
        },

        showTrackedRewardedAd(
            page: string,
            onComplete: (outcome: RewardedAdOutcome) => void,
            options: {
                levelId?: number;
                markLevelRevive?: boolean;
                onShow?: () => void;
                onRecoverable?: () => void;
            } = {},
        ) {
            const adType = `rewardedVideo:${page}`;
            const levelId = options.levelId ?? this.getAnalyticsLevelId();
            let interactionReleased = false;
            const adAudioReason = `rewarded:${page}`;
            this.ensureRewardedAdStateTelemetry();
            this._rewardedAdTelemetryPage = page;
            this._rewardedAdTelemetryLevelId = levelId;
            const releaseInteraction = (reason: string) => {
                if (interactionReleased) return;
                interactionReleased = true;
                AudioMgr.inst.endExternalInterruptionWithBgmRestart(`${adAudioReason}:${reason}`);
                this.resumeTimerAfterAd();
            };
            AnalyticsMgr.inst.trackAdClick(adType, page, levelId);
            this.suspendTimerForAd();
            AudioMgr.inst.beginExternalInterruption(adAudioReason);
            try {
                AdConfig.showRewardedAd((outcome: RewardedAdOutcome) => {
                    const success = outcome.status === 'verified_complete';
                    releaseInteraction(`complete-${outcome.status}`);
                    if (success) {
                        AnalyticsMgr.inst.trackAdFinish(adType, page, levelId);
                        SySDKMgr.inst.reportAdFinish(page);
                        if (options.markLevelRevive) {
                            AnalyticsMgr.inst.markAdRevive();
                        }
                    }
                    try {
                        onComplete(outcome);
                    } finally {
                        if (this._rewardedAdTelemetryPage === page) {
                            this._rewardedAdTelemetryPage = '';
                            this._rewardedAdTelemetryLevelId = 0;
                        }
                        this.scheduleRewardedAdPreload(`after-ad-${outcome.status}`, 1.5);
                    }
                }, {
                    onShow: () => {
                        AnalyticsMgr.inst.trackAdShow(adType, page, levelId);
                        SySDKMgr.inst.reportAdShow(page);
                        options.onShow?.();
                    },
                    onRecoverable: () => {
                        releaseInteraction('recoverable');
                        options.onRecoverable?.();
                    },
                    minFallbackWatchMs: this.getRewardedAdMinFallbackWatchMs(page),
                });
            } catch (error) {
                releaseInteraction('throw');
                throw error;
            }
        },

        runShareGrant(
            page: string,
            grant: () => RewardedGrantResult,
            options: ShareGrantOptions = {},
        ): boolean {
            const busyFlag = options.busyFlag || '';
            const claimKey = `share:${String(options.claimKey || `${page}:${options.levelId ?? ''}`)}`;
            const timedOutClaims = getTimedOutGrantClaims(this);
            if (timedOutClaims.has(claimKey)) {
                showRewardedGrantToast(this, '该奖励仍在后台确认，请勿重复领取');
                return false;
            }
            if (busyFlag && this[busyFlag]) {
                return false;
            }
            if (busyFlag) {
                this[busyFlag] = true;
            }

            const clearBusy = () => {
                if (busyFlag) {
                    this[busyFlag] = false;
                }
            };
            let finalized = false;
            let grantStageTimer: any = null;
            let grantStagePromise: Promise<boolean | void> | null = null;
            let grantStagePending = false;
            let quarantinedStagePromise: Promise<boolean | void> | null = null;
            const clearGrantStage = (expected?: Promise<boolean | void>) => {
                if (expected && grantStagePromise !== expected) return;
                if (grantStageTimer) {
                    clearTimeout(grantStageTimer);
                    grantStageTimer = null;
                }
                grantStagePromise = null;
                grantStagePending = false;
            };
            const quarantineGrantStage = () => {
                const promise = grantStagePromise;
                if (!grantStagePending || !promise) return;
                timedOutClaims.add(claimKey);
                if (quarantinedStagePromise === promise) return;
                quarantinedStagePromise = promise;
                const releaseQuarantine = () => {
                    if (quarantinedStagePromise === promise) {
                        quarantinedStagePromise = null;
                    }
                    timedOutClaims.delete(claimKey);
                };
                promise.then(releaseQuarantine, releaseQuarantine);
            };
            const runFinally = () => {
                if (finalized) return;
                finalized = true;
                clearGrantStage();
                clearBusy();
                try {
                    options.onFinally?.();
                } catch (error) {
                    console.warn(`[ShareGrant] ${page} finally failed:`, error);
                }
            };
            const armGrantStage = (
                promise: Promise<boolean | void>,
                timeoutMs: number,
                stage: 'grant' | 'afterGrant',
            ) => {
                clearGrantStage();
                grantStagePromise = promise;
                grantStagePending = true;
                grantStageTimer = setTimeout(() => {
                    if (finalized || !grantStagePending || grantStagePromise !== promise) return;
                    quarantineGrantStage();
                    console.error(`[ShareGrant] ${page} ${stage} timed out after ${timeoutMs}ms`);
                    showRewardedGrantToast(
                        this,
                        stage === 'afterGrant'
                            ? options.afterGrantFailToast || options.grantFailToast || GRANT_TIMEOUT_TOAST
                            : options.grantFailToast || GRANT_TIMEOUT_TOAST,
                    );
                    runFinally();
                }, timeoutMs);
            };
            const isGrantStageActive = (promise: Promise<boolean | void>) => (
                !finalized && grantStagePending && grantStagePromise === promise
            );
            const runShareFail = () => {
                showRewardedGrantToast(this, options.shareFailToast);
                try {
                    options.onShareComplete?.(false);
                } catch (error) {
                    console.warn(`[ShareGrant] ${page} share-fail handler failed:`, error);
                }
                runFinally();
            };

            const wx: any = typeof this.getWeChatRuntime === 'function' ? this.getWeChatRuntime() : null;
            if (!wx || typeof wx.shareAppMessage !== 'function') {
                console.warn(`[ShareGrant] ${page} wx.shareAppMessage unavailable`);
                runShareFail();
                return false;
            }

            const levelId = options.levelId ?? this.getAnalyticsLevelId();
            const shareType = options.shareType || `rewardShare:${page}`;
            const title = resolveRewardedGrantToast(options.title) || `我在拼豆豆通关了第${levelId}关，快来一起挑战！`;
            const query = resolveRewardedGrantToast(options.query) || `level=${levelId}`;
            const imageUrl = resolveRewardedGrantToast(options.imageUrl);

            const runGrant = () => {
                const grantPromise = Promise.resolve().then(() => grant());
                armGrantStage(
                    grantPromise,
                    resolveGrantTimeoutMs(options.grantTimeoutMs, DEFAULT_GRANT_TIMEOUT_MS),
                    'grant',
                );
                grantPromise
                    .then(async (grantResult) => {
                        if (!isGrantStageActive(grantPromise)) return;
                        clearGrantStage(grantPromise);
                        if (grantResult === false) {
                            console.warn(`[ShareGrant] ${page} grant returned false`);
                            showRewardedGrantToast(this, options.grantFailToast);
                            return;
                        }
                        showRewardedGrantToast(this, options.successToast);
                        if (!options.afterGrant) {
                            return;
                        }
                        const afterGrantPromise = Promise.resolve().then(() => options.afterGrant!());
                        armGrantStage(
                            afterGrantPromise,
                            resolveGrantTimeoutMs(options.afterGrantTimeoutMs, DEFAULT_AFTER_GRANT_TIMEOUT_MS),
                            'afterGrant',
                        );
                        try {
                            const afterResult = await afterGrantPromise;
                            if (!isGrantStageActive(afterGrantPromise)) return;
                            clearGrantStage(afterGrantPromise);
                            if (afterResult === false) {
                                console.warn(`[ShareGrant] ${page} afterGrant returned false`);
                                showRewardedGrantToast(this, options.afterGrantFailToast || options.grantFailToast);
                            }
                        } catch (error) {
                            if (!isGrantStageActive(afterGrantPromise)) return;
                            clearGrantStage(afterGrantPromise);
                            console.error(`[ShareGrant] ${page} afterGrant failed:`, error);
                            showRewardedGrantToast(this, options.afterGrantFailToast || options.grantFailToast);
                        }
                    })
                    .catch((error) => {
                        if (!isGrantStageActive(grantPromise)) return;
                        clearGrantStage(grantPromise);
                        console.error(`[ShareGrant] ${page} grant failed:`, error);
                        showRewardedGrantToast(this, options.grantFailToast);
                    })
                    .then(runFinally, runFinally);
            };

            AnalyticsMgr.inst.trackShareClick(shareType, page, levelId);
            try {
                wx.shareAppMessage({
                    title,
                    query,
                    imageUrl,
                });
                try {
                    options.onShareComplete?.(true);
                } catch (error) {
                    console.warn(`[ShareGrant] ${page} share-dispatch handler failed:`, error);
                }
                AnalyticsMgr.inst.trackShareSuccess(shareType, page, levelId);
                runGrant();
            } catch (error) {
                console.error(`[ShareGrant] ${page} share request failed:`, error);
                runShareFail();
                return false;
            }
            return true;
        },

        runRewardedGrant(
            page: string,
            grant: () => RewardedGrantResult,
            options: RewardedGrantOptions = {},
        ): boolean {
            const busyFlag = options.busyFlag || '';
            const claimKey = String(options.claimKey || `${page}:${options.levelId ?? ''}`);
            const timedOutClaims = getTimedOutGrantClaims(this);
            const activeTransaction = this._rewardedGrantTransaction as RewardedGrantRuntimeTransaction | null;
            if (activeTransaction) {
                if (activeTransaction.phase === 'recoverable') {
                    showRewardedGrantToast(this, '奖励确认中，请稍后');
                } else if (activeTransaction.phase === 'recoverable_endable') {
                    if (activeTransaction.claimKey === claimKey) {
                        this.cancelRewardedGrantInteraction?.('recoverable-user-end');
                    } else {
                        showRewardedGrantToast(this, '请先结束当前广告等待');
                    }
                }
                return false;
            }
            if (timedOutClaims.has(claimKey)) {
                showRewardedGrantToast(this, '该奖励仍在后台确认，请勿重复领取');
                return false;
            }
            if (busyFlag && this[busyFlag]) return false;

            const transactionId = (Number(this._rewardedGrantTransactionSeq) || 0) + 1;
            this._rewardedGrantTransactionSeq = transactionId;
            const claimGrant = grant;
            const claimOptions = options;
            const clearBusy = () => {
                if (busyFlag) {
                    this[busyFlag] = false;
                }
            };
            let finalized = false;
            let cancelled = false;
            let grantStarted = false;
            let attemptGeneration = 0;
            let releaseCurrentAttemptInteraction: (() => void) | null = null;
            let recoverableEndTimer: any = null;
            let grantStageTimer: any = null;
            let grantStagePromise: Promise<boolean | void> | null = null;
            let grantStagePending = false;
            let quarantinedStagePromise: Promise<boolean | void> | null = null;
            const adOwnerToken = this.acquireRuntimeOwner?.(
                'ad',
                `rewarded:${page}:${transactionId}`,
            ) || '';
            const clearRecoverableEndTimer = () => {
                if (!recoverableEndTimer) return;
                clearTimeout(recoverableEndTimer);
                recoverableEndTimer = null;
            };
            const clearGrantStage = (expected?: Promise<boolean | void>) => {
                if (expected && grantStagePromise !== expected) return;
                if (grantStageTimer) {
                    clearTimeout(grantStageTimer);
                    grantStageTimer = null;
                }
                grantStagePromise = null;
                grantStagePending = false;
            };
            const quarantineGrantStage = () => {
                const promise = grantStagePromise;
                if (!grantStagePending || !promise) return;
                timedOutClaims.add(claimKey);
                if (quarantinedStagePromise === promise) return;
                quarantinedStagePromise = promise;
                const releaseQuarantine = () => {
                    if (quarantinedStagePromise === promise) {
                        quarantinedStagePromise = null;
                    }
                    timedOutClaims.delete(claimKey);
                };
                promise.then(releaseQuarantine, releaseQuarantine);
            };
            const isActive = () => {
                const active = this._rewardedGrantTransaction as RewardedGrantRuntimeTransaction | null;
                return !cancelled && !!active && active.id === transactionId;
            };
            const runFinally = () => {
                if (finalized) return;
                finalized = true;
                clearRecoverableEndTimer();
                clearGrantStage();
                const active = this._rewardedGrantTransaction as RewardedGrantRuntimeTransaction | null;
                if (active?.id === transactionId) {
                    this._rewardedGrantTransaction = null;
                }
                if (!claimOptions.suppressPendingStrip) {
                    try {
                        this.clearRewardedAdPendingStrip?.();
                    } catch (error) {
                        console.warn(`[RewardedGrant] ${page} pending-strip cleanup failed:`, error);
                    }
                }
                if (adOwnerToken) {
                    try {
                        this.releaseRuntimeOwner?.(adOwnerToken);
                    } catch (error) {
                        console.error(`[RewardedGrant] ${page} owner release failed:`, error);
                    }
                }
                clearBusy();
                try {
                    claimOptions.onFinally?.();
                } catch (error) {
                    console.warn(`[RewardedGrant] ${page} finally failed:`, error);
                }
            };
            const cancelTransaction = (reason: string) => {
                if (finalized) return;
                quarantineGrantStage();
                cancelled = true;
                attemptGeneration++;
                console.error(`[RewardedGrant] ${page} transaction cancelled: ${reason}`);
                try {
                    releaseCurrentAttemptInteraction?.();
                    releaseCurrentAttemptInteraction = null;
                    this.resumeTimerAfterAd?.();
                } catch (error) {
                    console.error(`[RewardedGrant] ${page} cancellation cleanup failed:`, error);
                } finally {
                    runFinally();
                }
            };
            const transaction: RewardedGrantRuntimeTransaction = {
                id: transactionId,
                claimKey,
                page,
                phase: 'ad',
                deadlineAt: 0,
                startedAt: Date.now(),
                cancel: cancelTransaction,
            };
            this._rewardedGrantTransaction = transaction;
            const armGrantStage = (
                promise: Promise<boolean | void>,
                timeoutMs: number,
                stage: 'grant' | 'afterGrant',
            ) => {
                clearGrantStage();
                grantStagePromise = promise;
                grantStagePending = true;
                transaction.grantStage = stage;
                transaction.deadlineAt = Date.now() + timeoutMs;
                grantStageTimer = setTimeout(() => {
                    if (!isActive() || !grantStagePending || grantStagePromise !== promise) return;
                    console.error(`[RewardedGrant] ${page} ${stage} timed out after ${timeoutMs}ms`);
                    showRewardedGrantToast(
                        this,
                        stage === 'afterGrant'
                            ? claimOptions.afterGrantFailToast || claimOptions.grantFailToast || GRANT_TIMEOUT_TOAST
                            : claimOptions.grantFailToast || GRANT_TIMEOUT_TOAST,
                    );
                    cancelTransaction(`${stage}-timeout`);
                }, timeoutMs);
            };
            const isGrantStageActive = (promise: Promise<boolean | void>) => (
                isActive() && grantStagePending && grantStagePromise === promise
            );
            const runAdFail = () => {
                if (!isActive()) return;
                showRewardedGrantToast(this, claimOptions.adFailToast);
                try {
                    claimOptions.onAdFail?.();
                } catch (error) {
                    console.warn(`[RewardedGrant] ${page} ad-fail handler failed:`, error);
                }
                runFinally();
            };
            const beginGrant = () => {
                if (!isActive() || grantStarted) return;
                grantStarted = true;
                clearRecoverableEndTimer();
                transaction.phase = 'grant';
                PerformanceMgr.inst.markUserActivity(6000);

                let grantResult: RewardedGrantResult;
                try {
                    grantResult = claimGrant();
                } catch (error) {
                    console.error(`[RewardedGrant] ${page} grant failed:`, error);
                    showRewardedGrantToast(this, claimOptions.grantFailToast);
                    runFinally();
                    return;
                }

                const grantPromise = Promise.resolve(grantResult);
                armGrantStage(
                    grantPromise,
                    resolveGrantTimeoutMs(claimOptions.grantTimeoutMs, DEFAULT_GRANT_TIMEOUT_MS),
                    'grant',
                );
                grantPromise
                    .then(async (resolvedGrantResult) => {
                        if (!isGrantStageActive(grantPromise)) return;
                        clearGrantStage(grantPromise);
                        if (resolvedGrantResult === false) {
                            console.warn(`[RewardedGrant] ${page} grant returned false`);
                            showRewardedGrantToast(this, claimOptions.grantFailToast);
                            return;
                        }
                        showRewardedGrantToast(this, claimOptions.successToast);
                        if (!claimOptions.afterGrant) return;
                        transaction.phase = 'after_grant';
                        const afterGrantPromise = Promise.resolve().then(() => claimOptions.afterGrant!());
                        armGrantStage(
                            afterGrantPromise,
                            resolveGrantTimeoutMs(claimOptions.afterGrantTimeoutMs, DEFAULT_AFTER_GRANT_TIMEOUT_MS),
                            'afterGrant',
                        );
                        try {
                            const afterResult = await afterGrantPromise;
                            if (!isGrantStageActive(afterGrantPromise)) return;
                            clearGrantStage(afterGrantPromise);
                            if (afterResult === false) {
                                console.warn(`[RewardedGrant] ${page} afterGrant returned false`);
                                showRewardedGrantToast(this, claimOptions.afterGrantFailToast || claimOptions.grantFailToast);
                            }
                        } catch (error) {
                            if (!isGrantStageActive(afterGrantPromise)) return;
                            clearGrantStage(afterGrantPromise);
                            console.error(`[RewardedGrant] ${page} afterGrant failed:`, error);
                            showRewardedGrantToast(this, claimOptions.afterGrantFailToast || claimOptions.grantFailToast);
                        }
                    })
                    .catch((error) => {
                        if (!isGrantStageActive(grantPromise)) return;
                        clearGrantStage(grantPromise);
                        console.error(`[RewardedGrant] ${page} grant failed:`, error);
                        showRewardedGrantToast(this, claimOptions.grantFailToast);
                    })
                    .then(runFinally, runFinally);
            };

            const startAttempt = (): boolean => {
                if (!isActive() || grantStarted) return false;
                const generation = ++attemptGeneration;
                transaction.phase = 'ad';
                if (busyFlag) this[busyFlag] = true;
                let outcomeHandled = false;
                let recoverableHandled = false;
                let interactionReleased = false;
                const isCurrentAttempt = () => isActive() && generation === attemptGeneration;
                const releaseAttemptInteraction = () => {
                    if (interactionReleased) return;
                    interactionReleased = true;
                    if (releaseCurrentAttemptInteraction === releaseAttemptInteraction) {
                        releaseCurrentAttemptInteraction = null;
                    }
                    clearBusy();
                    try {
                        claimOptions.onInteractionReleased?.();
                    } catch (error) {
                        console.warn(`[RewardedGrant] ${page} interaction-release handler failed:`, error);
                    }
                };
                const markRecoverable = () => {
                    if (!isCurrentAttempt() || recoverableHandled || grantStarted) return;
                    recoverableHandled = true;
                    transaction.phase = 'recoverable';
                    releaseAttemptInteraction();
                    try {
                        claimOptions.onRecoverable?.();
                    } catch (error) {
                        console.warn(`[RewardedGrant] ${page} recoverable handler failed:`, error);
                    }
                    if (!claimOptions.suppressPendingStrip) {
                        this.showRewardedAdPendingStrip?.('正在确认广告结果…', 'wait');
                    }
                    clearRecoverableEndTimer();
                    recoverableEndTimer = setTimeout(() => {
                        recoverableEndTimer = null;
                        if (!isCurrentAttempt()
                            || transaction.phase !== 'recoverable'
                            || grantStarted) return;
                        transaction.phase = 'recoverable_endable';
                        showRewardedGrantToast(this, '广告结果仍未返回，可点击“结束等待”');
                        try {
                            claimOptions.onRecoverableEndable?.();
                        } catch (error) {
                            console.warn(`[RewardedGrant] ${page} recoverable-endable handler failed:`, error);
                        }
                        if (!claimOptions.suppressPendingStrip) {
                            this.showRewardedAdPendingStrip?.('广告结果仍未返回', 'end');
                        }
                    }, 5000);
                };
                releaseCurrentAttemptInteraction = releaseAttemptInteraction;

                try {
                    claimOptions.onInteractionStarted?.();
                } catch (error) {
                    console.error(`[RewardedGrant] ${page} interaction-start handler failed:`, error);
                    releaseAttemptInteraction();
                    runAdFail();
                    return false;
                }

                try {
                    this.showTrackedRewardedAd(page, (outcome: RewardedAdOutcome) => {
                        if (!isCurrentAttempt()) {
                            console.warn(`[RewardedGrant] ${page} stale attempt ${outcome.attemptId} ignored`);
                            return;
                        }
                        if (outcomeHandled) {
                            console.warn(`[RewardedGrant] ${page} duplicate attempt ${outcome.attemptId} ignored`);
                            return;
                        }
                        outcomeHandled = true;
                        releaseAttemptInteraction();
                        const success = outcome.status === 'verified_complete';
                        if (!claimOptions.suppressPendingStrip) {
                            this.clearRewardedAdPendingStrip?.();
                        }
                        try {
                            claimOptions.onAdComplete?.(success, outcome);
                        } catch (error) {
                            console.warn(`[RewardedGrant] ${page} ad-complete handler failed:`, error);
                        }
                        if (outcome.status === 'unknown') {
                            runAdFail();
                            return;
                        }
                        if (!success) {
                            runAdFail();
                            return;
                        }
                        beginGrant();
                    }, {
                        levelId: claimOptions.levelId,
                        markLevelRevive: claimOptions.markLevelRevive,
                        onShow: () => {
                            if (!claimOptions.suppressPendingStrip) {
                                this.clearRewardedAdPendingStrip?.();
                            }
                            claimOptions.onAdShown?.();
                        },
                        onRecoverable: markRecoverable,
                    });
                } catch (error) {
                    console.error(`[RewardedGrant] ${page} ad request failed:`, error);
                    releaseAttemptInteraction();
                    this.resumeTimerAfterAd?.();
                    if (isActive()) runAdFail();
                    else runFinally();
                    return false;
                }
                return true;
            };

            return startAttempt();
        },

        suspendTimerForAd() {
            if (this._adTimerSuspended) return;
            this._adTimerSuspended = true;
            if (this._timerStarted) {
                this.unschedule(this.tickTimer);
            }
        },

        resumeTimerAfterAd() {
            if (!this._adTimerSuspended) return;
            this._adTimerSuspended = false;
            if (this._timerStarted) {
                this.schedule(this.tickTimer, 1);
            }
        },

        getSafeInsets(): SafeInsets {
            const design = view.getDesignResolutionSize();
            const safe = sys.getSafeAreaRect ? sys.getSafeAreaRect() : null;
            if (!safe) return { top: 0, right: 0, bottom: 0, left: 0 };
            const designW = design.width || 720;
            const designH = design.height || 1280;
            return {
                top: Math.max(0, designH - (safe.y || 0) - (safe.height || 0)),
                right: Math.max(0, designW - (safe.x || 0) - (safe.width || 0)),
                bottom: Math.max(0, safe.y || 0),
                left: Math.max(0, safe.x || 0),
            };
        },

        destroyGameplayRuntimeView() {
            this.clearAdRewardHintVisuals?.();
            const host = this.getCanvasUiHost();
            const preservedRootNames = host === this.node
                ? new Set(['ScreenRoot', 'PopupRoot', 'OverlayRoot', 'FxRoot'])
                : null;
            const runtimeChildren = this.node.children.slice();
            for (const child of runtimeChildren) {
                if (preservedRootNames?.has(child.name)) {
                    continue;
                }
                child.destroy();
            }
            if (this.boardSlotsNode?.isValid) this.clearChildrenExcept(this.boardSlotsNode, []);
            if (this.boardNode?.isValid) this.clearChildrenExcept(this.boardNode, ['BoardOutlineLayer', 'BoardOutlineTopLayer', 'BoardSlots']);
            this.clearBoardVisualPools?.();

            this.boardModel = null!;
            this.slotModel = null!;
            this.levelData = null!;
            this.boardNode = null!;
            this.boardSlotsNode = null!;
            this._boardSlotBatchRenderer = null;
            this._boardSlotBatchRenderers = [];
            this.boardSlotBgNodes = [];
            this.boardGroup = null!;
            this.cellNodes = [];
            this.slotNodes = [];
            this.slotMarkerNodes = [];
            this.slotAreaNode = null!;
            this.timerLabel = null!;
            this.completionLabel = null;
            this.levelLabel = null!;
            this.dragLayer = null!;
            this.dragNodes = [];
            this.destroyGameplayResultOverlays(true);
            this.clearLoadingStageTimers?.();
            this._loadingProgressLabelTween?.stop?.();
            this._loadingShineTween?.stop?.();
            this._loadingOverlayVersion = (this._loadingOverlayVersion || 0) + 1;
            this._loadingOverlay = null;
            this._loadingProgressFill = null;
            this._loadingProgressFillNode = null;
            this._loadingProgressGroup = null;
            this._loadingSlowActions = null;
            this._loadingProgressLabel = null;
            this._loadingProgressLabelShadow = null;
            this._loadingProgressLabelTween = null;
            this._loadingShine = null;
            this._loadingShineTween = null;
            this._loadingRouteActionInFlight = false;
            this._gameplayLoadRequestVersion = (Number(this._gameplayLoadRequestVersion) || 0) + 1;
            this._remoteLoadErrorOverlay = null;
            this._noLivesModal = null;
            this.clearRecoverVigorModalRuntimeState?.();
            this._collectionOverlay = null;
            this._collectionContentNode = null;
            this._collectionScrollContentNode = null;
            this._collectionPreviewItems = [];
            this._collectionPreviewRowPitch = 0;
            this._collectionPageIndicator = null;
            this._collectionImageModal = null;
            this._themeOverlay = null;
            this._themeImageModal = null;
            this._vigorCountLbl = null;
            this._vigorTimeLbl = null;
            this._goldCountLbl = null;
            this._shopGoldLbl = null;
        },

        cleanupGameplayForHomeTransition() {
            this.clearToastNodes?.();
            Tween.stopAll();
            this.cancelRewardedGrantInteraction?.('home-transition');
            this.cancelRewardedAdPreload?.();
            this.clearRewardedAdPendingStrip?.();
            this.clearSkillUsageWatchdog?.('home-transition');
            this.clearRuntimeOwners?.();
            this._modalFocusRefs = 0;
            this.unscheduleAllCallbacks();
            this.deactivateWeChatFriendRank('cleanup-for-main-menu');
            this.detachGameplayInputHandlers();
            this.clearDragNodes();
            this.stopPulseTweens();
            this.clearSelectionOverlay();
        
            this.clearIdleHint();
            this.clearForcedSkillHiddenState();
            this.clearPlacementVisualState?.();
            this.clearActiveFlyBeanNodes?.('home-transition');
            this._placementInputLocked = false;
            this._placementInputLockRefs = 0;
            this._placementVisualRefs = 0;
            this._skillActive = false;
            this._skillAnimOnly = false;
            this._skillTimerPauseToken = '';
            this._timerStarted = false;
            this._timerPauseRefs = 0;
            this._timerLockedForProp = false;
            this._adTimerSuspended = false;
            this._wandMode = false;
            this._wandDragStart = null;
            this._wandRectNode = null;
            this.currentBlock = null;
            this.isSelected = false;
            this._selectedSlotIndices = [];
            this.resetTouchState();
            this.closeCollection();
            this.closeThemePanel();
            this._isThemeLevel = false;
            this._currentThemeLevelId = 0;
            if (this._pinchGuideAutoCloseHandler) {
                this.unschedule(this._pinchGuideAutoCloseHandler);
                this._pinchGuideAutoCloseHandler = null;
            }
            if (this._pinchGuideLayer) this._pinchGuideLayer.destroy();
            this._pinchGuideLayer = null;
            if (this._guideBubble?.isValid) this._guideBubble.active = false;
            if (this._guideLayer) this._guideLayer.destroy();
            this._guideLayer = null;
            this._guideMask = null;
            this._guideHand = null;
            this._guideBubble = null;
            this._guideBubbleLbl = null;
            this._guidePromptDefaultLabelColor = null;
            this._guidePromptDefaultCenterY = null;
            for (const t of this._guidePulseTweens) t.stop();
            this._guidePulseTweens.length = 0;
            this._guideHighlightCells = [];
            this._guideStep = -1;
            this._guideMode = 'none';
            this._guideTotalSteps = 0;
            this._guidePhase = 'select';
            this._lastGuideVoiceToken = '';
            this.destroyGameplayRuntimeView();
        },

        cleanupForMainMenu() {
            this.cleanupGameplayForHomeTransition();
            this.mainMenuNode = null;
        },

        findMainMenuRoot(parent?: Node): Node | null {
            const host = parent || this.getCanvasUiHost().getChildByName('ScreenRoot');
            return host?.getChildByName('MainMenuRoot') || null;
        },

        requireMainMenuRoot(parent?: Node): Node {
            const host = parent || this.requireCanvasUiRoot('ScreenRoot');
            const menuRoot = this.requireUiChild(host, 'MainMenuRoot', 'ScreenRoot/MainMenuRoot');
            menuRoot.active = true;
            return menuRoot;
        },

        mountMainMenuFixedRoot(menuRoot: Node): Node {
            const fixedRoot = this.requireUiChild(menuRoot, 'MainMenuFixedRoot', 'MainMenuRoot/MainMenuFixedRoot');
            const runtimeRoot = this.requireUiChild(menuRoot, 'MainMenuRuntimeRoot', 'MainMenuRoot/MainMenuRuntimeRoot');
            fixedRoot.active = true;
            runtimeRoot.active = true;
            this.mainMenuNode = fixedRoot;
            return fixedRoot;
        },

        renderMainMenuFixedRoot(menu: Node) {
            const bgLayer = this.requireUiChild(menu, 'BackgroundLayer', 'MainMenuFixedRoot/BackgroundLayer');
            const topBarGroup = this.requireUiChild(menu, 'TopBarGroup', 'MainMenuFixedRoot/TopBarGroup');
            const heroLayer = this.requireUiChild(menu, 'HeroLayer', 'MainMenuFixedRoot/HeroLayer');
            const primaryActionLayer = this.requireUiChild(menu, 'PrimaryActionLayer', 'MainMenuFixedRoot/PrimaryActionLayer');
            const entryLayer = this.requireUiChild(menu, 'EntryLayer', 'MainMenuFixedRoot/EntryLayer');

            const bgNode = this.requireUiChild(bgLayer, 'BG', 'BackgroundLayer/BG');
            const bgFrame = this.requireSceneSpriteFrame(bgNode, 'BackgroundLayer/BG');
            const visibleSize = this._getLoadingVisibleSize();
            const sourceSize = this._getLoadingCoverSourceSize(bgFrame);
            const targetW = visibleSize.width + (this.constructor as any).LOADING_COVER_BLEED * 2;
            const targetH = visibleSize.height + (this.constructor as any).LOADING_COVER_BLEED * 2;
            const coverScale = Math.max(
                targetW / sourceSize.width,
                targetH / sourceSize.height,
            );
            this._applySpriteFrame(
                bgNode,
                bgFrame,
                sourceSize.width * coverScale,
                sourceSize.height * coverScale,
            );

            const curLevel = this.getDefaultEntryLevel();
            const heroCard = this.requireUiChild(heroLayer, 'HeroCard', 'HeroLayer/HeroCard');
            const heroCardFrame = this.requireUiChild(heroCard, 'HeroCardFrame', 'HeroCard/HeroCardFrame');
            this.requireSceneSpriteFrame(heroCardFrame, 'HeroCard/HeroCardFrame');
            this.drawHomeLevelPixelPreview(heroCard, curLevel, 0, 0);

            if (typeof this.syncTopHud !== 'function') {
                throw new Error('[TopHud] runtime missing syncTopHud() for Home scene');
            }
            const topHudWidgets = this.syncTopHud(topBarGroup, 'home');
            if (!topHudWidgets) {
                this.drawTopRightBtns(topBarGroup);
                const goldGroup = this.requireUiChild(topBarGroup, 'GoldGroup', 'TopBarGroup/GoldGroup');
                const vigorGroup = this.requireUiChild(topBarGroup, 'VigorGroup', 'TopBarGroup/VigorGroup');
                this.drawGoldBanner(goldGroup);
                this.drawLivesBanner(vigorGroup);
            }
            this.drawStartButton(primaryActionLayer, curLevel);
            this.drawThemeChallengeButton(primaryActionLayer);
            this.drawDailySignInButton(entryLayer);
            this.drawLeaderboardButton(entryLayer);
            this.drawCollectionButton(entryLayer);
            this.drawSkinButton?.(entryLayer);
            this.drawGameCircleButton?.(entryLayer);
            if (typeof this.drawSidebarEntry === 'function') {
                this.drawSidebarEntry(entryLayer);
            }
        },
        showMainMenu() {
            const runtimeSceneName = this.getRuntimeSceneName('Game');
            if (runtimeSceneName !== 'Home') {
                this.logRuntimeTrace(
                    '[SceneSplitTrace] showMainMenu:routeHome',
                    JSON.stringify({
                        runtimeSceneName,
                        hasMainMenuNode: !!this.mainMenuNode,
                    }),
                );
                void this.requestHomeRoute('runtime', 'none');
                return;
            }
            const sceneName = 'Home';
            this.logRuntimeTrace(
                '[SceneSplitTrace] showMainMenu:start',
                JSON.stringify({
                    sceneName,
                    hasMainMenuNode: !!this.mainMenuNode,
                }),
            );
            this.mainMenuNode = null;
            AudioMgr.inst.playHomeBgm();
            const menuRoot = this.requireMainMenuRoot();
            const fixedRoot = this.mountMainMenuFixedRoot(menuRoot);
            AppRoot.tryGet()?.markHomeVisible(sceneName);
            this.renderMainMenuFixedRoot(fixedRoot);
            const pendingHomeToast = AppRoot.tryGet()?.session.consumePendingHomeToast();
            if (pendingHomeToast) {
                this.scheduleOnce(() => {
                    if (!this.isValid) return;
                    this.showToast(pendingHomeToast.text, pendingHomeToast.duration);
                }, 0.05);
            }
            this.scheduleHomeGameplayEntryWarmup?.(this.getSavedLevel(), 'level_');
            this.scheduleRewardedAdPreload('home:visible', 1.2);
            this.scheduleHomeSharedUiTextureWarmup?.();
            this.logRuntimeTrace(
                '[SceneSplitTrace] showMainMenu:finish',
                JSON.stringify({
                    sceneName,
                    hasMainMenuNode: !!this.mainMenuNode,
                    menuRootActive: !!menuRoot?.active,
                    fixedRootActive: !!fixedRoot?.active,
                }),
            );
        },
        applyShellSprite(node: Node, frameName: string, width: number, height: number, color: Color = Color.WHITE) {
            const existingSprite = node.getComponent(Sprite);
            if (this.getRuntimeSceneName('Game') === 'Home' && frameName !== 'collection_card_unlocked' && HOME_MENU_TEXTURE_NAMES.indexOf(frameName) >= 0) {
                let cursor: Node | null = node;
                let isHomeMainMenuNode = false;
                while (cursor) {
                    if (cursor === this.mainMenuNode || cursor.name === 'MainMenuFixedRoot') {
                        isHomeMainMenuNode = true;
                        break;
                    }
                    cursor = cursor.parent;
                }
                if (isHomeMainMenuNode) {
                    // Home main-menu sprites are scene-authored; runtime must not resize or replace them.
                    return;
                }
            }
            const spriteFrame = existingSprite?.spriteFrame || this.getSF(frameName);
            if (!spriteFrame) {
                throw new Error(`[SceneUI] missing sprite frame: ${frameName}`);
            }
            this._applySpriteFrame(node, spriteFrame, width, height);
            const sprite = node.getComponent(Sprite);
            if (sprite) {
                sprite.color = color;
            }
        },

        requireSceneSpriteFrame(node: Node, path: string): SpriteFrame {
            const sprite = node.getComponent(Sprite);
            if (!sprite?.spriteFrame) {
                throw new Error(`[HomeScene] Home.scene is missing SpriteFrame on ${path}`);
            }
            return sprite.spriteFrame;
        },

        startHomeSceneScalePulse(node: Node, peakMultiplier: number, duration: number) {
            const runtimeNode = node as any;
            const cachedScale = runtimeNode.__homeSceneBaseScale as Vec3 | undefined;
            const sourceScale = cachedScale || node.scale;
            const baseScale = new Vec3(sourceScale.x, sourceScale.y, sourceScale.z);
            runtimeNode.__homeSceneBaseScale = baseScale;
            Tween.stopAllByTarget(node);
            node.setScale(baseScale.x, baseScale.y, baseScale.z);
            tween(node)
                .repeatForever(
                    tween(node)
                        .to(duration, { scale: new Vec3(baseScale.x * peakMultiplier, baseScale.y * peakMultiplier, baseScale.z) }, { easing: 'sineInOut' })
                        .to(duration, { scale: new Vec3(baseScale.x, baseScale.y, baseScale.z) }, { easing: 'sineInOut' })
                )
                .start();
        },

        destroyGameplayResultOverlays(releaseResources: boolean = false) {
            for (const panel of [this.panelWin, this.panelLose, this.panelTimeoutContinue]) {
                if (panel?.isValid) {
                    if (releaseResources) {
                        this._clearSpriteFramesBeforeDestroy(panel);
                        this._destroyDetachedNodeNextFrame(panel);
                    } else {
                        panel.removeFromParent();
                        panel.destroy();
                    }
                }
            }
            if (releaseResources) {
                this._releasePanelTexturesNextFrame(RESULT_PANEL_TEXTURE_NAMES, 'gameplay-result-overlays');
            }
            this._settlementGoldCountLbl = null;
            this._winBaseGoldFlyPlayed = false;
            this.panelWin = null!;
            this.panelLose = null!;
            this.panelTimeoutContinue = null!;
        },

        drawHomeLevelPixelPreview(parent: Node, levelId: number, x: number, y: number) {
            const frameSize = 324;
            parent.getChildByName('HeroCardHint')?.destroy();
            const previewAnchor = this.requireUiChild(parent, 'PreviewAnchor', 'HeroCard/PreviewAnchor');
            const oldPreview = previewAnchor.getChildByName('PixelPreview');
            releasePixelPosterPreviewTree(oldPreview || null);
            oldPreview?.destroy();
            this.drawCollectionPixelPreviewOnCard(previewAnchor, levelId, x, y, frameSize, frameSize);
        },

        drawLivesBanner(parent: Node) {
            const bannerNode = this.requireUiChild(parent, 'LivesBanner', 'VigorGroup/LivesBanner');
            this.requireSceneSpriteFrame(bannerNode, 'VigorGroup/LivesBanner');
            // Bind to the group so the banner, count, and timer share one hitbox.
            parent.targetOff(this);
            parent.getComponent(Button) || parent.addComponent(Button);
            parent.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                this.showNoLivesAdModal({ source: 'home_hud' });
            }, this);
            const countLbl = this.requireUiChild(parent, 'VigorCount', 'VigorGroup/VigorCount');
            const vigorLabel = countLbl.getComponent(Label);
            if (!vigorLabel) throw new Error('[HomeScene] Home.scene is missing Label component on VigorGroup/VigorCount');
            vigorLabel.string = `${this.getVigor()}/${(this.constructor as any).VIGOR_CEILING}`;
            this._vigorCountLbl = vigorLabel;
            this.requireUiChild(parent, 'TimeBg', 'VigorGroup/TimeBg');
            const timeLbl = this.requireUiChild(parent, 'VigorTime', 'VigorGroup/VigorTime');
            const timeLabel = timeLbl.getComponent(Label);
            if (!timeLabel) throw new Error('[HomeScene] Home.scene is missing Label component on VigorGroup/VigorTime');
            timeLabel.string = '';
            this._vigorTimeLbl = timeLabel;
        },

        drawGoldBanner(parent: Node) {
            const banner = this.requireUiChild(parent, 'GoldBanner', 'GoldGroup/GoldBanner');
            this.requireSceneSpriteFrame(banner, 'GoldGroup/GoldBanner');
            const goldLbl = this.requireUiChild(parent, 'GoldCount', 'GoldGroup/GoldCount');
            const goldLabel = goldLbl.getComponent(Label);
            if (!goldLabel) throw new Error('[HomeScene] Home.scene is missing Label component on GoldGroup/GoldCount');
            goldLabel.string = `${this.getGold()}`;
            this._goldCountLbl = goldLabel;
        
            parent.targetOff(this);
            parent.getComponent(Button) || parent.addComponent(Button);
            parent.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                this.openGoldAcquirePanel();
            }, this);
            this.refreshGoldUI();
        },

        drawTopRightBtns(parent: Node) {
            const gear = this.requireUiChild(parent, 'SettingsButton', 'TopBarGroup/SettingsButton');
            const iconNode = this.requireUiChild(gear, 'HomeSettingsIcon', 'SettingsButton/HomeSettingsIcon');
            this.requireSceneSpriteFrame(iconNode, 'SettingsButton/HomeSettingsIcon');
            gear.targetOff(this);
            gear.getComponent(Button) || gear.addComponent(Button);
            gear.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('uiPanel');
                this.openSettingsPanel();
            }, this);
        },
    }, {
        _hasGameplayResultPanelPrefabsReady() {
            return ensureGameplayResultPanelController(this).hasPrefabsReady();
        },

        _ensureGameplayResultPanelPrefabsReady(onDone: () => void) {
            ensureGameplayResultPanelController(this).ensurePrefabsReady(onDone);
        },

        ensureGameplayResultPanelsCreated(
            target: 'win' | 'revive' | 'lose' | 'lose-flow' | 'all' = 'all',
        ): boolean {
            if (!this._hasGameplayResultPanelPrefabsReady()) {
                return false;
            }
            const needsWin = target === 'win' || target === 'all';
            const needsRevive = target === 'revive' || target === 'lose-flow' || target === 'all';
            const needsLose = target === 'lose' || target === 'lose-flow' || target === 'all';
            if (needsWin && !this.panelWin?.isValid) {
                this.panelWin = this.createWinSettlementPanel();
            }
            if (needsLose && !this.panelLose?.isValid) {
                this.panelLose = this.createLoseSettlementPanel();
            }
            if (needsRevive && !this.panelTimeoutContinue?.isValid) {
                this.panelTimeoutContinue = this.createReviveSettlementPanel();
            }
            return (!needsWin || !!this.panelWin?.isValid)
                && (!needsLose || !!this.panelLose?.isValid)
                && (!needsRevive || !!this.panelTimeoutContinue?.isValid);
        },

        instantiateResultOverlay(name: string): Node {
            throw new Error(`[result-panel] legacy generic overlay "${name}" is disabled; use prefab-backed result panels`);
        },

        createWinSettlementPanel(): Node {
            return ensureGameplayResultPanelController(this).createWinSettlementPanel();
        },

        playWinSettlementBannerFx() {
            ensureGameplayResultPanelController(this).playWinSettlementBannerFx(this.panelWin);
        },

        createReviveSettlementPanel(): Node {
            return ensureGameplayResultPanelController(this).createReviveSettlementPanel();
        },

        bindReviveContinueAction(triggerNode: Node, overlay: Node, rewardedSeconds?: number) {
            ensureGameplayResultPanelController(this).bindReviveContinueAction(triggerNode, overlay, rewardedSeconds);
        },

        createLoseSettlementPanel(): Node {
            return ensureGameplayResultPanelController(this).createLoseSettlementPanel();
        },
    });
}
