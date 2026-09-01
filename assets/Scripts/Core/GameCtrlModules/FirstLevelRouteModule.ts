import {
    _decorator, Component, Node, UITransform, Sprite, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, BlockInputEvents, Mask,
    NodePool, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_TEXTURE_SEARCH_DIRS, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY,
    SKILL_BUTTON_Y, SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, GAME_ASSETS_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, BoardViewportController
} from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';
import { LevelDataCdnService } from '../LevelDataCdnService';
import { isDouyinMiniGameRuntime, isMiniGameRuntime, isWeChatMiniGameRuntime } from '../MiniGamePlatform';
import { collectActiveBlockInputEvents, debugPerfSnapshot, debugPerfTrace } from '../DebugPerfTrace';
import { runtimeLog, runtimeWarn } from '../RuntimeLog';
import { markStartupTrace } from '../StartupTrace';
import { flushPendingStartupCloudGameplayRestore } from './StartupCloudRestoreHelper';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { director, Director } from 'cc';

const FIRST_LEVEL_RELEASE_DIAGNOSTIC_EVENT_LIMIT = 18;
const FIRST_LEVEL_RELEASE_CAPTURE_EVENT_LIMIT = 3;

export function installFirstLevelRouteModule(target: any): void {
    Object.assign(target, {
        isExpectedModalBlockerPath(path: string): boolean {
            const normalized = String(path || '');
            return normalized.includes('/PopupRoot/')
                && !normalized.includes('/PopupRoot/OverlayTemplates/');
        },

        trackFirstLevelFunnel(eventName: string, opt: Record<string, unknown> = {}, force: boolean = false): void {
            if (!force && !this.isFirstLevelFunnelActive()) return;
            const activePhysicalLevelId = this.getActivePhysicalLevelId();
            const activeLogicalLevelId = this.getActiveLogicalLevelId?.() || activePhysicalLevelId;
            AnalyticsMgr.inst.trackFunnelEvent({
                eventName,
                page: this.getAnalyticsPage(),
                levelId: activeLogicalLevelId,
                logicalLevelId: activeLogicalLevelId,
                physicalLevelId: activePhysicalLevelId,
                ...opt,
            });
        },

        trackFirstLevelFunnelForLevel(
            levelId: number,
            eventName: string,
            opt: Record<string, unknown> = {},
            force: boolean = false,
        ): void {
            const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
            if (!force && normalizedLevelId !== 1 && normalizedLevelId !== 2) return;
            AnalyticsMgr.inst.trackFunnelEvent({
                eventName,
                page: 'level_game',
                levelId: normalizedLevelId,
                logicalLevelId: normalizedLevelId,
                physicalLevelId: normalizedLevelId,
                ...opt,
            });
        },

        isFirstLevelReleaseDiagnosticsActive(): boolean {
            if ((Number(this._firstLevelReleaseDiagStartedAt) || 0) <= 0) return false;
            if (this._activeGameplayEntryMode !== 'main') return false;
            return Math.max(1, Math.floor(Number(this.getActiveLogicalLevelId?.()) || 1)) === 1;
        },

        getFirstLevelReleaseNodePath(node: Node | null): string {
            if (!node?.isValid) return '';
            if (typeof this._getNodePathForDiagnostics === 'function') {
                try {
                    return String(this._getNodePathForDiagnostics(node) || '').slice(0, 220);
                } catch (_) {
                    // Release diagnostics must never interfere with touch delivery.
                }
            }
            const names: string[] = [];
            let current: Node | null = node;
            let guard = 0;
            while (current?.isValid && guard < 12) {
                names.unshift(current.name || '(unnamed)');
                current = current.parent || null;
                guard += 1;
            }
            return names.join('/').slice(0, 220);
        },

        markFirstLevelTouchTraceLayer(layer: 'native' | 'canvas' | 'guide' | 'result', forceNew: boolean = false): {
            touchTraceId: string;
            touchTraceStages: string;
            touchTraceAgeMs: number;
        } {
            const now = Date.now();
            const lastUpdatedAt = Number(this._firstLevelTouchTraceUpdatedAt) || 0;
            if (forceNew || !this._firstLevelTouchTraceId || now - lastUpdatedAt > 1500) {
                const seq = Math.max(0, Number(this._firstLevelTouchTraceSeq) || 0) + 1;
                this._firstLevelTouchTraceSeq = seq;
                this._firstLevelTouchTraceId = [
                    'l1t',
                    Math.max(0, Number(this._firstLevelReleaseDiagToken) || 0),
                    seq,
                ].join('-');
                this._firstLevelTouchTraceStartedAt = now;
                this._firstLevelTouchTraceStages = [];
            }
            const stages = Array.isArray(this._firstLevelTouchTraceStages)
                ? this._firstLevelTouchTraceStages
                : (this._firstLevelTouchTraceStages = []);
            if (!stages.includes(layer)) stages.push(layer);
            this._firstLevelTouchTraceUpdatedAt = now;
            return {
                touchTraceId: String(this._firstLevelTouchTraceId || ''),
                touchTraceStages: stages.join('>'),
                touchTraceAgeMs: Math.max(0, now - (Number(this._firstLevelTouchTraceStartedAt) || now)),
            };
        },

        resetFirstLevelReleaseDiagnostics(): void {
            const afterDrawEvent = (Director as any)?.EVENT_AFTER_DRAW;
            const afterDrawHandler = this._firstLevelReleaseAfterDrawHandler;
            if (afterDrawEvent && afterDrawHandler && typeof director?.off === 'function') {
                try {
                    director.off(afterDrawEvent, afterDrawHandler, this);
                } catch (_) {
                    // Best-effort cleanup for observer-only diagnostics.
                }
            }
            if (this._firstLevelReleaseAfterDrawFallbackTimer) {
                try {
                    clearTimeout(this._firstLevelReleaseAfterDrawFallbackTimer);
                } catch (_) {
                    // Best-effort cleanup for observer-only diagnostics.
                }
            }
            if (Array.isArray(this._firstLevelReleaseDelayedHandlers) && typeof this.unschedule === 'function') {
                for (const handler of this._firstLevelReleaseDelayedHandlers) {
                    try {
                        this.unschedule(handler);
                    } catch (_) {
                        // Best-effort cleanup for observer-only diagnostics.
                    }
                }
            }
            this._firstLevelReleaseDiagToken = (Number(this._firstLevelReleaseDiagToken) || 0) + 1;
            this._firstLevelReleaseDiagStartedAt = 0;
            this._firstLevelReleaseDiagEventCount = 0;
            this._firstLevelReleaseCanvasTouchCount = 0;
            this._firstLevelReleaseNativeTouchCount = 0;
            this._firstLevelTouchTraceSeq = 0;
            this._firstLevelTouchTraceId = '';
            this._firstLevelTouchTraceStartedAt = 0;
            this._firstLevelTouchTraceUpdatedAt = 0;
            this._firstLevelTouchTraceStages = [];
            this._firstLevelReleaseAfterDrawHandler = null;
            this._firstLevelReleaseAfterDrawFallbackTimer = null;
            this._firstLevelReleaseAfterDrawSeen = false;
            this._firstLevelReleaseDelayedHandlers = [];
        },

        beginFirstLevelReleaseDiagnostics(): void {
            if (this._activeGameplayEntryMode !== 'main') return;
            if (Math.max(1, Math.floor(Number(this.getActiveLogicalLevelId?.()) || 1)) !== 1) return;
            this.bindFirstLevelReleaseTouchObserver?.();
            this._firstLevelReleaseDiagStartedAt = Date.now();
            this._firstLevelReleaseDiagEventCount = 0;
            this._firstLevelReleaseCanvasTouchCount = 0;
            this._firstLevelReleaseNativeTouchCount = 0;
            this._firstLevelTouchTraceSeq = 0;
            this._firstLevelTouchTraceId = '';
            this._firstLevelTouchTraceStartedAt = 0;
            this._firstLevelTouchTraceUpdatedAt = 0;
            this._firstLevelTouchTraceStages = [];
            const observerBoundAt = Number(this._firstLevelReleaseObserverBoundAt) || 0;
            const earlyFirstAt = Number(this._firstLevelReleaseEarlyFirstTouchAt) || 0;
            const earlyLastAt = Number(this._firstLevelReleaseEarlyLastTouchAt) || 0;
            const earlyTouchWindow = [
                Math.max(0, Number(this._firstLevelReleaseEarlyTouchCount) || 0),
                observerBoundAt > 0 && earlyFirstAt >= observerBoundAt ? earlyFirstAt - observerBoundAt : 0,
                observerBoundAt > 0 && earlyLastAt >= observerBoundAt ? earlyLastAt - observerBoundAt : 0,
            ].join('|');
            this.reportFirstLevelReleaseState?.('diagnostic_start', { earlyTouchWindow });
        },

        bindFirstLevelReleaseTouchObserver(): void {
            const scene = this.node?.scene || null;
            const canvas = scene?.getChildByName('Canvas') || null;
            if (this._firstLevelReleaseObserverNode === canvas && this._firstLevelReleaseObserverHandler) {
                this.bindFirstLevelReleaseNativeTouchObserver?.();
                return;
            }
            this.unbindFirstLevelReleaseTouchObserver?.(false);
            this.bindFirstLevelReleaseNativeTouchObserver?.();
            if (!canvas?.isValid) return;
            this._firstLevelReleaseObserverNode = canvas;
            this._firstLevelReleaseObserverBoundAt = Date.now();
            this._firstLevelReleaseEarlyTouchCount = 0;
            this._firstLevelReleaseEarlyFirstTouchAt = 0;
            this._firstLevelReleaseEarlyLastTouchAt = 0;
            const handler = (event: EventTouch): void => {
                try {
                    const now = Date.now();
                    if (!this.isFirstLevelReleaseDiagnosticsActive?.()) {
                        this._firstLevelReleaseEarlyTouchCount = Math.min(
                            999,
                            Math.max(0, Number(this._firstLevelReleaseEarlyTouchCount) || 0) + 1,
                        );
                        if ((Number(this._firstLevelReleaseEarlyFirstTouchAt) || 0) <= 0) {
                            this._firstLevelReleaseEarlyFirstTouchAt = now;
                        }
                        this._firstLevelReleaseEarlyLastTouchAt = now;
                        return;
                    }
                    const touchSeq = Math.max(0, Number(this._firstLevelReleaseCanvasTouchCount) || 0) + 1;
                    this._firstLevelReleaseCanvasTouchCount = touchSeq;
                    if (touchSeq > FIRST_LEVEL_RELEASE_CAPTURE_EVENT_LIMIT) return;
                    const uiPos = event?.getUILocation?.();
                    const targetPath = this.getFirstLevelReleaseNodePath?.((event as any)?.target || null) || '';
                    const canvasTouch = [
                        touchSeq,
                        targetPath,
                        `${Math.round(Number(uiPos?.x) || 0)},${Math.round(Number(uiPos?.y) || 0)}`,
                    ].join('|');
                    const touchTrace = this.markFirstLevelTouchTraceLayer?.('canvas') || {};
                    this.reportFirstLevelReleaseState?.('canvas_touch_capture', { canvasTouch, ...touchTrace });
                } catch (_) {
                    // Never change propagation or gameplay state when diagnostic collection fails.
                }
            };
            this._firstLevelReleaseObserverHandler = handler;
            try {
                canvas.on(Node.EventType.TOUCH_START, handler, this, true);
            } catch (_) {
                this._firstLevelReleaseObserverNode = null;
                this._firstLevelReleaseObserverHandler = null;
            }
        },

        bindFirstLevelReleaseNativeTouchObserver(): void {
            const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
            const rawWx = globalScope?.__rawWx || null;
            if (this._firstLevelReleaseNativeTouchApi === rawWx && this._firstLevelReleaseNativeTouchHandler) return;
            this.unbindFirstLevelReleaseNativeTouchObserver?.();
            if (!rawWx || typeof rawWx.onTouchStart !== 'function' || typeof rawWx.offTouchStart !== 'function') {
                this._firstLevelReleaseNativeTouchObserverState = 'unavailable';
                return;
            }
            this._firstLevelReleaseNativeTouchObserverState = 'binding';
            this._firstLevelReleaseNativeTouchBoundAt = Date.now();
            this._firstLevelReleaseNativeEarlyTouchCount = 0;
            this._firstLevelReleaseNativeEarlyFirstTouchAt = 0;
            this._firstLevelReleaseNativeEarlyLastTouchAt = 0;
            const handler = (event: any): void => {
                try {
                    const now = Date.now();
                    if (!this.isFirstLevelReleaseDiagnosticsActive?.()) {
                        this._firstLevelReleaseNativeEarlyTouchCount = Math.min(
                            999,
                            Math.max(0, Number(this._firstLevelReleaseNativeEarlyTouchCount) || 0) + 1,
                        );
                        if ((Number(this._firstLevelReleaseNativeEarlyFirstTouchAt) || 0) <= 0) {
                            this._firstLevelReleaseNativeEarlyFirstTouchAt = now;
                        }
                        this._firstLevelReleaseNativeEarlyLastTouchAt = now;
                        return;
                    }
                    const touchSeq = Math.max(0, Number(this._firstLevelReleaseNativeTouchCount) || 0) + 1;
                    this._firstLevelReleaseNativeTouchCount = touchSeq;
                    if (touchSeq > FIRST_LEVEL_RELEASE_CAPTURE_EVENT_LIMIT) return;
                    const touches = Array.isArray(event?.touches)
                        ? event.touches
                        : (Array.isArray(event?.changedTouches) ? event.changedTouches : []);
                    const touch = touches[0] || null;
                    const nativeTouch = [
                        touchSeq,
                        touches.length,
                        `${Math.round(Number(touch?.clientX ?? touch?.pageX) || 0)},${Math.round(Number(touch?.clientY ?? touch?.pageY) || 0)}`,
                    ].join('|');
                    const touchTrace = this.markFirstLevelTouchTraceLayer?.('native', true) || {};
                    this.reportFirstLevelReleaseState?.('native_touch_capture', { nativeTouch, ...touchTrace });
                } catch (_) {
                    // Read-only native diagnostics must never affect platform touch delivery.
                }
            };
            try {
                rawWx.onTouchStart(handler);
                this._firstLevelReleaseNativeTouchApi = rawWx;
                this._firstLevelReleaseNativeTouchHandler = handler;
                this._firstLevelReleaseNativeTouchObserverState = 'bound';
            } catch (_) {
                this._firstLevelReleaseNativeTouchApi = null;
                this._firstLevelReleaseNativeTouchHandler = null;
                this._firstLevelReleaseNativeTouchObserverState = 'bind_failed';
            }
        },

        unbindFirstLevelReleaseNativeTouchObserver(): void {
            const rawWx = this._firstLevelReleaseNativeTouchApi;
            const handler = this._firstLevelReleaseNativeTouchHandler;
            if (rawWx && handler && typeof rawWx.offTouchStart === 'function') {
                try {
                    rawWx.offTouchStart(handler);
                } catch (_) {
                    // Best-effort cleanup for observer-only diagnostics.
                }
            }
            this._firstLevelReleaseNativeTouchApi = null;
            this._firstLevelReleaseNativeTouchHandler = null;
            this._firstLevelReleaseNativeTouchObserverState = 'unbound';
            this._firstLevelReleaseNativeTouchBoundAt = 0;
            this._firstLevelReleaseNativeTouchCount = 0;
            this._firstLevelReleaseNativeEarlyTouchCount = 0;
            this._firstLevelReleaseNativeEarlyFirstTouchAt = 0;
            this._firstLevelReleaseNativeEarlyLastTouchAt = 0;
        },

        unbindFirstLevelReleaseTouchObserver(unbindNative: boolean = true): void {
            const node = this._firstLevelReleaseObserverNode;
            const handler = this._firstLevelReleaseObserverHandler;
            if (node?.isValid && handler) {
                try {
                    (node as any).off(Node.EventType.TOUCH_START, handler, this, true);
                } catch (_) {
                    // Best-effort cleanup for observer-only diagnostics.
                }
            }
            this._firstLevelReleaseObserverNode = null;
            this._firstLevelReleaseObserverHandler = null;
            this._firstLevelReleaseObserverBoundAt = 0;
            this._firstLevelReleaseEarlyTouchCount = 0;
            this._firstLevelReleaseEarlyFirstTouchAt = 0;
            this._firstLevelReleaseEarlyLastTouchAt = 0;
            if (unbindNative) this.unbindFirstLevelReleaseNativeTouchObserver?.();
        },

        reportFirstLevelReleaseState(phase: string, phaseExtra: Record<string, unknown> = {}): void {
            if (!this.isFirstLevelReleaseDiagnosticsActive?.()) return;
            const nextSeq = Math.max(0, Number(this._firstLevelReleaseDiagEventCount) || 0) + 1;
            if (nextSeq > FIRST_LEVEL_RELEASE_DIAGNOSTIC_EVENT_LIMIT) return;
            this._firstLevelReleaseDiagEventCount = nextSeq;
            try {
            const scene = this.node?.scene || null;
            const canvas = scene?.getChildByName('Canvas') || null;
            const screenRoot = canvas?.getChildByName('ScreenRoot') || null;
            const gameplayRoot = screenRoot?.getChildByName('GameplayRoot') || null;
            const bootRoot = canvas?.getChildByName('BootRoot') || screenRoot?.getChildByName('BootRoot') || null;
            const authoredLoading = bootRoot?.getChildByName('StartupLoadingUI') || null;
            const loading = this._loadingOverlay?.isValid ? this._loadingOverlay : authoredLoading;
            const loadingBlocker = loading?.getComponent(BlockInputEvents) || null;
            const guideLayer = this._guideLayer?.isValid ? this._guideLayer : null;
            const guideLayerUi = guideLayer?.getComponent(UITransform) || null;
            const guideBlocker = guideLayer?.getComponent(BlockInputEvents) || null;
            const guideHand = this._guideHand?.isValid ? this._guideHand : null;
            const guideHandSprite = guideHand?.getComponent(Sprite) || null;
            const guideBubble = this._guideBubble?.isValid ? this._guideBubble : null;
            const guideGeometry = guideLayer && guideLayerUi
                ? `${Math.round(guideLayerUi.contentSize.width)}x${Math.round(guideLayerUi.contentSize.height)}@${guideLayer.getSiblingIndex()}/${guideLayer.parent?.children.length || 0}`
                : '';
            const loadingActive = !!loading?.isValid && loading.activeInHierarchy;
            const guideLayerActive = !!guideLayer?.isValid && guideLayer.activeInHierarchy;
            const guideHandActive = !!guideHand?.isValid && guideHand.activeInHierarchy;
            const guideBubbleActive = !!guideBubble?.isValid && guideBubble.activeInHierarchy;
            const shouldScanBlockers = phase === 'before_loading_hide'
                || phase === 'after_tutorial'
                || phase === 'after_draw_confirmed'
                || phase === 'after_draw_missing'
                || phase === 'canvas_touch_capture'
                || phase === 'app_hide'
                || phase === 'app_show'
                || phase === 'tutorial_done_before_cleanup'
                || phase === 'native_touch_capture'
                || phase.indexOf('no_guide_touch_') === 0;
            const blockers = shouldScanBlockers ? collectActiveBlockInputEvents() : [];
            const loadingAllowed = phase === 'diagnostic_start'
                || phase === 'before_ui_build'
                || phase === 'before_loading_hide';
            const modalFocusActive = (Number(this._modalFocusRefs) || 0) > 0;
            const expectedModalBlockers = modalFocusActive
                ? blockers.filter((entry) => this.isExpectedModalBlockerPath?.(String(entry.path || '')))
                : [];
            const unexpectedBlockers = blockers.filter((entry) => {
                const path = String(entry.path || '');
                if (path.includes('/GuideLayer')) return false;
                if (loadingAllowed && path.includes('/StartupLoadingUI')) return false;
                if (modalFocusActive && this.isExpectedModalBlockerPath?.(path)) return false;
                return true;
            });
            const activeBlockersText = blockers
                .slice(0, 6)
                .map((entry) => String(entry.path || ''))
                .join('|')
                .slice(0, 240);
            const unexpectedBlockersText = unexpectedBlockers
                .slice(0, 6)
                .map((entry) => String(entry.path || ''))
                .join('|')
                .slice(0, 240);
            const expectedModalBlockersText = expectedModalBlockers
                .slice(0, 6)
                .map((entry) => String(entry.path || ''))
                .join('|')
                .slice(0, 240);
            const rawGuideStep = Number(this._guideStep);
            const guideStep = Number.isFinite(rawGuideStep) ? Math.floor(rawGuideStep) : -1;
            const guideExpected = this._guideMode === 'level_1' && guideStep >= 0;
            const foreground = this._gameForeground !== false;
            const guideActionEnabled = this._guideStatus === 'awaiting_action'
                && (Number(this._guideActionEnabledAt) || 0) > 0;
            const nativeTouchCount = Math.max(0, Number(this._firstLevelReleaseNativeTouchCount) || 0);
            const canvasTouchCount = Math.max(0, Number(this._firstLevelReleaseCanvasTouchCount) || 0);
            let errorCode = phase === 'after_draw_missing' || phase === 'tutorial_missing' ? phase : '';
            if (!errorCode && foreground && !loadingAllowed && loadingActive) errorCode = 'loading_overlay_active';
            if (!errorCode && foreground && unexpectedBlockers.length > 0) errorCode = 'unexpected_input_blocker';
            if (!errorCode && foreground && guideExpected && !modalFocusActive && !guideLayerActive) {
                errorCode = 'guide_layer_inactive';
            }
            if (!errorCode && foreground && guideExpected && !modalFocusActive && !guideBlocker?.enabled) {
                errorCode = 'guide_blocker_disabled';
            }
            if (!errorCode && foreground && guideExpected && this._guideInputSuspended === true && !modalFocusActive) {
                errorCode = 'guide_input_suspended';
            }
            if (!errorCode && foreground && guideExpected && modalFocusActive && expectedModalBlockers.length === 0) {
                errorCode = 'modal_focus_without_expected_blocker';
            }
            if (!errorCode && foreground && guideExpected && !modalFocusActive && this._adShowing === true) errorCode = 'ad_showing';
            if (!errorCode && foreground && guideExpected && !modalFocusActive && this._skillActive === true) errorCode = 'skill_active';
            if (!errorCode && foreground && guideExpected && !modalFocusActive && this._timerLockedForProp === true) {
                errorCode = 'timer_locked_for_prop';
            }
            if (!errorCode && foreground && guideExpected && !modalFocusActive && (Number(this._placementVisualRefs) || 0) > 0) {
                errorCode = 'placement_visual_active';
            }
            if (!errorCode && foreground && guideExpected && !modalFocusActive
                && this._guideStatus === 'awaiting_action' && !guideActionEnabled) {
                errorCode = 'guide_action_not_ready';
            }
            if (!errorCode && foreground && phase.indexOf('no_guide_touch_') === 0
                && nativeTouchCount > canvasTouchCount) {
                errorCode = 'native_touch_not_delivered_to_canvas';
            }
            if (!errorCode && foreground && guideExpected && !modalFocusActive && this._guideStatus !== 'transitioning'
                && (!guideHandActive || !guideHandSprite?.spriteFrame || !guideBubbleActive)) {
                errorCode = 'guide_visual_missing';
            }
            const boundedPhaseExtra: Record<string, unknown> = {};
            for (const key of Object.keys(phaseExtra).slice(0, 3)) {
                boundedPhaseExtra[key] = phaseExtra[key];
            }
            this.trackFirstLevelFunnel('l1_release_state', {
                stepId: guideStep,
                stepName: String(phase || 'unknown').slice(0, 96),
                source: 'l1_release_diagnostics',
                success: !errorCode,
                errorCode,
                extra: {
                    diagSeq: nextSeq,
                    msFromDiagStart: Math.max(0, Date.now() - (Number(this._firstLevelReleaseDiagStartedAt) || Date.now())),
                    gameForeground: foreground,
                    inputTrace: [
                        this._firstLevelReleaseNativeTouchObserverState || 'unavailable',
                        nativeTouchCount,
                        canvasTouchCount,
                        Math.max(0, Number(this._firstLevelReleaseNativeEarlyTouchCount) || 0),
                    ].join('|'),
                    guideFeedbackState: [
                        this._guideMode || 'none',
                        this._guidePhase || '',
                        this._guideStatus || '',
                        this._guidePreviewVisible === true ? 1 : 0,
                        guideActionEnabled ? 1 : 0,
                        this._guideDimMaskNode?.isValid ? 1 : 0,
                    ].join('|'),
                    gameplayRootActive: !!gameplayRoot?.isValid && gameplayRoot.activeInHierarchy,
                    loadingActive,
                    loadingBlockerEnabled: !!loadingBlocker?.enabled,
                    guideLayerActive,
                    guideBlockerEnabled: !!guideBlocker?.enabled,
                    guideGeometry,
                    guideInputSuspended: this._guideInputSuspended === true,
                    guideHandActive,
                    guideHandSpriteReady: !!guideHandSprite?.spriteFrame,
                    guideBubbleActive,
                    runtimeLocks: [
                        Math.max(0, Number(this._modalFocusRefs) || 0),
                        this._adShowing === true ? 1 : 0,
                        this._skillActive === true ? 1 : 0,
                        this._timerLockedForProp === true ? 1 : 0,
                        Math.max(0, Number(this._placementVisualRefs) || 0),
                    ].join('|'),
                    activeTouchCount: Math.max(0, Number(this.activeBoardTouches?.size) || 0),
                    gestureMode: this.gestureMode || 'idle',
                    canvasTouchCount,
                    activeBlockers: activeBlockersText,
                    blockerClassification: expectedModalBlockers.length > 0 ? 'expected_modal' : 'normal',
                    expectedModalBlockers: expectedModalBlockersText,
                    unexpectedBlockers: unexpectedBlockersText,
                    dataVersion: this.getRuntimeRemoteHash?.() || '',
                    ...boundedPhaseExtra,
                },
            });
            } catch (error) {
                try {
                    this.trackFirstLevelFunnel('l1_release_state', {
                        stepId: -1,
                        stepName: `${String(phase || 'unknown').slice(0, 70)}_logger_error`,
                        source: 'l1_release_diagnostics',
                        success: false,
                        errorCode: 'diagnostic_exception',
                        errorMessage: String((error as any)?.message || error || 'diagnostic failed').slice(0, 200),
                        extra: { diagSeq: nextSeq },
                    });
                } catch (_) {
                    // A diagnostic failure must never break L1 startup or touch handling.
                }
            }
        },

        scheduleFirstLevelReleaseDiagnostics(): void {
            if (!this.isFirstLevelReleaseDiagnosticsActive?.()) return;
            const token = Number(this._firstLevelReleaseDiagToken) || 0;
            const afterDrawEvent = (Director as any)?.EVENT_AFTER_DRAW;
            const reportAfterDraw = (): void => {
                if (token !== (Number(this._firstLevelReleaseDiagToken) || 0)) return;
                if (this._firstLevelReleaseAfterDrawSeen) return;
                this._firstLevelReleaseAfterDrawSeen = true;
                this._firstLevelReleaseAfterDrawHandler = null;
                if (this._firstLevelReleaseAfterDrawFallbackTimer) {
                    clearTimeout(this._firstLevelReleaseAfterDrawFallbackTimer);
                    this._firstLevelReleaseAfterDrawFallbackTimer = null;
                }
                const renderFrame = Math.max(0, Number((director as any)?.getTotalFrames?.()) || 0);
                this.reportFirstLevelReleaseState?.('after_draw_confirmed', { renderFrame });
            };
            this._firstLevelReleaseAfterDrawSeen = false;
            if (afterDrawEvent && typeof director?.once === 'function') {
                try {
                    this._firstLevelReleaseAfterDrawHandler = reportAfterDraw;
                    director.once(afterDrawEvent, reportAfterDraw, this);
                    this._firstLevelReleaseAfterDrawFallbackTimer = setTimeout(() => {
                        if (token !== (Number(this._firstLevelReleaseDiagToken) || 0)) return;
                        if (this._firstLevelReleaseAfterDrawSeen) return;
                        if (this._firstLevelReleaseAfterDrawHandler) {
                            try {
                                director.off(afterDrawEvent, this._firstLevelReleaseAfterDrawHandler, this);
                            } catch (_) {
                                // Best-effort cleanup for observer-only diagnostics.
                            }
                        }
                        this._firstLevelReleaseAfterDrawHandler = null;
                        this._firstLevelReleaseAfterDrawFallbackTimer = null;
                        this.reportFirstLevelReleaseState?.('after_draw_missing');
                    }, 1000);
                } catch (_) {
                    this._firstLevelReleaseAfterDrawHandler = null;
                    this._firstLevelReleaseAfterDrawFallbackTimer = null;
                    this.reportFirstLevelReleaseState?.('after_draw_missing');
                }
            } else {
                this.reportFirstLevelReleaseState?.('after_draw_missing');
            }

            const delayedHandlers: Array<() => void> = [];
            for (const [delaySeconds, phase] of [[0.5, 'no_guide_touch_500ms'], [2, 'no_guide_touch_2000ms'], [5, 'no_guide_touch_5000ms']] as Array<[number, string]>) {
                const handler = (): void => {
                    if (token !== (Number(this._firstLevelReleaseDiagToken) || 0)) return;
                    if (this._firstLevelAnyTouchSent) return;
                    this.reportFirstLevelReleaseState?.(phase);
                };
                delayedHandlers.push(handler);
                try {
                    this.scheduleOnce?.(handler, delaySeconds);
                } catch (_) {
                    // Sampling is optional and must not affect gameplay scheduling.
                }
            }
            this._firstLevelReleaseDelayedHandlers = delayedHandlers;
        },

        getFirstLevelGuideStepKey(step: number = this._guideStep, phase: string = this._guidePhase): string {
            return `${this._guideMode || 'none'}:${Math.max(-1, Math.floor(Number(step) || 0))}:${phase || ''}`;
        },

        markFirstLevelTouchTiming(now: number = Date.now()): void {
            const lastTouchAt = Number(this._firstLevelLastTouchAt) || 0;
            this._firstLevelLastTouchIntervalMs = lastTouchAt > 0 ? Math.max(0, now - lastTouchAt) : 0;
            this._firstLevelLastTouchAt = now;
        },

        buildFirstLevelGuideExtra(inputLayer: string, hitResult: string = '', extra: Record<string, unknown> = {}): Record<string, unknown> {
            return {
                guideMode: this._guideMode || 'none',
                guideStep: Math.max(-1, Math.floor(Number(this._guideStep) || 0)),
                guidePhase: this._guidePhase || '',
                inputLayer,
                hitResult,
                msSincePrevTouch: Math.max(0, Number(this._firstLevelLastTouchIntervalMs) || 0),
                touchTraceId: String(this._firstLevelTouchTraceId || ''),
                touchTraceStages: Array.isArray(this._firstLevelTouchTraceStages)
                    ? this._firstLevelTouchTraceStages.join('>')
                    : '',
                ...extra,
            };
        },

        buildFirstLevelTouchPositionExtra(worldPos?: Vec3): Record<string, unknown> {
            if (!worldPos) return {};
            const round = (value: number, digits: number = 1): number => {
                const factor = Math.pow(10, digits);
                return Math.round((Number(value) || 0) * factor) / factor;
            };
            const visible = view.getVisibleSize();
            const uiW = Math.max(1, Number(visible.width) || 0);
            const uiH = Math.max(1, Number(visible.height) || 0);
            const payload: Record<string, unknown> = {
                uiX: round(worldPos.x),
                uiY: round(worldPos.y),
                uiW: round(uiW),
                uiH: round(uiH),
                normX: round(worldPos.x / uiW, 4),
                normY: round(worldPos.y / uiH, 4),
            };

            const boardLocal = typeof this.worldToBoardLocal === 'function'
                ? this.worldToBoardLocal(worldPos)
                : null;
            if (boardLocal) {
                payload.boardLocalX = round(boardLocal.x);
                payload.boardLocalY = round(boardLocal.y);
                const cell = typeof this.getBoardCellFromWorldPos === 'function'
                    ? this.getBoardCellFromWorldPos(worldPos)
                    : null;
                if (cell) {
                    payload.boardRow = cell.row;
                    payload.boardCol = cell.col;
                }
                const candidates = typeof this.getBoardTapCandidates === 'function'
                    ? this.getBoardTapCandidates(worldPos)
                    : [];
                const candidate = candidates?.[0];
                if (candidate) {
                    payload.boardHitRow = candidate.row;
                    payload.boardHitCol = candidate.col;
                    payload.boardHitDist = round(Math.sqrt(Math.max(0, Number(candidate.distSq) || 0)));
                    payload.boardCenterDist = round(Math.sqrt(Math.max(0, Number(candidate.centerDistSq) || 0)));
                    payload.boardVisualCoreHit = candidate.visualCoreHit === true;
                }
            }

            const slotUT = this.slotAreaNode?.getComponent(UITransform) || null;
            if (slotUT) {
                const slotLocal = slotUT.convertToNodeSpaceAR(worldPos);
                payload.slotLocalX = round(slotLocal.x);
                payload.slotLocalY = round(slotLocal.y);
                const inSlotArea = Math.abs(slotLocal.x) <= slotUT.contentSize.width / 2
                    && Math.abs(slotLocal.y) <= slotUT.contentSize.height / 2;
                payload.inSlotArea = inSlotArea;
                if (Array.isArray(this.slotNodes) && this.slotNodes.length > 0) {
                    let bestIndex = -1;
                    let bestDistSq = Number.POSITIVE_INFINITY;
                    for (let i = 0; i < this.slotNodes.length; i++) {
                        const slotNode = this.slotNodes[i];
                        if (!slotNode?.isValid) continue;
                        const dx = slotLocal.x - slotNode.position.x;
                        const dy = slotLocal.y - slotNode.position.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < bestDistSq) {
                            bestDistSq = distSq;
                            bestIndex = i;
                        }
                    }
                    if (bestIndex >= 0) {
                        payload.slotIndex = bestIndex;
                        payload.slotDistance = round(Math.sqrt(bestDistSq));
                    }
                }
            }

            return payload;
        },

        reportFirstLevelAnyTouch(worldPos: Vec3, inputLayer: string, source: string = 'tutorial'): void {
            if (!this.isFirstLevelFunnelActive?.()) return;
            if (this._firstLevelAnyTouchSent) return;
            const touchTrace = this.markFirstLevelTouchTraceLayer?.('guide') || {};
            this._firstLevelAnyTouchSent = true;
            this.reportFirstLevelReleaseState?.('guide_layer_touch', touchTrace);
            const touchTarget = worldPos ? this.classifyFirstLevelTouchTarget(worldPos) : '';
            this.trackFirstLevelFunnel('first_level_any_touch', {
                touchTarget,
                source,
                success: true,
                extra: this.buildFirstLevelGuideExtra(inputLayer, 'touch_start', this.buildFirstLevelTouchPositionExtra(worldPos)),
            });
        },

        reportInteractionTouchAttempt(worldPos: Vec3, inputLayer: string, deliveryState: string): void {
            if (!this.isFirstLevelFunnelActive?.()) return;
            const attempt = Math.max(0, Number(this._interactionTouchAttemptCount) || 0) + 1;
            this._interactionTouchAttemptCount = attempt;
            if (attempt > 5) return;
            const blockers = collectActiveBlockInputEvents();
            const touchTarget = worldPos ? this.classifyFirstLevelTouchTarget(worldPos) : '';
            this.trackFirstLevelFunnel('interaction_touch_attempt', {
                stepId: attempt,
                stepName: this.getFirstLevelGuideStepKey(),
                touchTarget,
                source: inputLayer,
                success: deliveryState === 'delivered' || deliveryState === 'guide_gate',
                errorCode: deliveryState === 'delivered' || deliveryState === 'guide_gate' ? '' : deliveryState,
                extra: this.buildFirstLevelGuideExtra(inputLayer, deliveryState, {
                    ...this.buildFirstLevelTouchPositionExtra(worldPos),
                    deliveryState,
                    modalFocusRefs: Math.max(0, Number(this._modalFocusRefs) || 0),
                    guideInputSuspended: this._guideInputSuspended === true,
                    gestureMode: this.gestureMode || 'idle',
                    activeTouchCount: Math.max(0, Number(this.activeBoardTouches?.size) || 0),
                    activeBlockers: blockers.map((entry) => String(entry.path || '')).join('|'),
                }),
            });
        },

        reportTutorialLayerTouchStart(worldPos: Vec3): void {
            this.markFirstLevelTouchTraceLayer?.('guide');
            this.reportInteractionTouchAttempt?.(worldPos, 'guide_layer', 'guide_gate');
        },

        reportTutorialStepFirstTouch(_worldPos: Vec3, _inputLayer: string): void {
        },

        getTutorialMissHitResult(worldPos?: Vec3): string {
            if (!worldPos) return 'miss_unknown';
            const target = this.classifyFirstLevelTouchTarget(worldPos);
            if (target === 'empty') return 'miss_empty';
            if (target === 'board') return 'miss_wrong_block';
            if (target === 'slot') return 'miss_wrong_slot';
            return 'miss_wrong_target';
        },

        getTutorialSelectHitResult(worldPos: Vec3, step: number): string {
            if (this._guideMode === 'level_1' && !this.shouldGuideSelectFromSlot?.(step)) {
                return this.classifyFirstLevelTouchTarget(worldPos) === 'board' ? 'hit_target' : 'hit_tolerant_area';
            }
            return 'hit_target';
        },

        getLevelDataPath(levelId: number, prefix: string = 'level_'): string {
            return `LevelData/${prefix}${levelId}`;
        },

        readRuntimeSettings(): any {
            const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
            const w: any = typeof window !== 'undefined' ? window : null;
            return g?.__ccSettings || g?.ccSettings || g?._CCSettings || w?.__ccSettings || w?.ccSettings || w?._CCSettings || null;
        },

        getRuntimeRemoteHash(): string {
            const dataVersion = LevelDataCdnService.inst.getDataVersion();
            if (dataVersion) return dataVersion;
            const settings = this.readRuntimeSettings();
            const fromSettings = settings?.assets?.bundleVers?.gameAssets;
            if (typeof fromSettings === 'string' && fromSettings) return fromSettings;
            const downloader: any = (assetManager as any).downloader;
            const candidates = [
                downloader?.bundleVers?.gameAssets,
                downloader?._bundleVers?.gameAssets,
                downloader?.bundleVers?.get?.('remote'),
                downloader?._bundleVers?.get?.('remote'),
            ];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate) return candidate;
            }
            return '';
        },

        getRuntimeRemoteServer(): string {
            const settings = this.readRuntimeSettings();
            const fromSettings = settings?.assets?.server;
            if (typeof fromSettings === 'string' && fromSettings) return fromSettings;
            const downloader: any = (assetManager as any).downloader;
            const candidates = [
                downloader?.remoteServerAddress,
                downloader?._remoteServerAddress,
                downloader?.remoteServerRoot,
                downloader?._remoteServerRoot,
            ];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate) return candidate;
            }
            return '';
        },

		getLevelDataLoadDiagnostics(
            levelId: number,
            levelPath: string,
            extra: Record<string, unknown> = {},
        ): Record<string, unknown> {
            const levelDataCdn = LevelDataCdnService.inst.getAvailabilityDiagnostics();
            const levelDataCdnLastFailure = levelDataCdn.lastFailure && typeof levelDataCdn.lastFailure === 'object'
                ? levelDataCdn.lastFailure as Record<string, unknown>
                : {};
            const diagnostics: Record<string, unknown> = {
                remoteHash: this.getRuntimeRemoteHash(),
                remoteServer: this.getRuntimeRemoteServer(),
                levelDataCdn,
                levelDataCdnBaseUrl: levelDataCdn.baseUrl,
                levelDataCdnCanUse: levelDataCdn.canUse,
                levelDataCdnReason: levelDataCdn.reason,
                levelDataCdnLiveUnavailableReason: levelDataCdn.liveUnavailableReason,
                levelDataCdnLastFailureStage: levelDataCdnLastFailure.stage || '',
                levelDataCdnLastFailureNamespace: levelDataCdnLastFailure.namespace || '',
                levelDataCdnLastFailureReason: levelDataCdnLastFailure.reason || '',
                levelId,
                levelPath,
                ...extra,
            };
            return diagnostics;
        },

        reportLevelDataLoadDiagnostic(
            levelId: number,
            eventName: string,
            success: boolean,
            levelPath: string,
            opt: {
                errorCode?: string;
                errorMessage?: string;
                extra?: Record<string, unknown>;
                flush?: boolean;
            } = {},
        ): void {
            const diagnostics = this.getLevelDataLoadDiagnostics(levelId, levelPath, opt.extra || {});
            if (eventName === 'level_data_load_start') {
                markStartupTrace('startup_level_data_start', {
                    levelId,
                    levelPath,
                    sourceEvent: eventName,
                });
            } else if (eventName === 'first_level_json_loaded') {
                markStartupTrace('startup_level_data_ready', {
                    levelId,
                    levelPath,
                    sourceEvent: eventName,
                });
            }
            const logArgs = [`[LevelDataLoad] ${eventName}`, diagnostics];
            if (success) runtimeLog(...logArgs);
            else console.error(...logArgs);
            this.trackFirstLevelFunnelForLevel(levelId, eventName, {
                source: 'level_data',
                success,
                errorCode: opt.errorCode || '',
                errorMessage: opt.errorMessage || '',
                extra: diagnostics,
            }, true);
            if (opt.flush || !success) {
                AnalyticsMgr.inst.flushFunnelEvents();
            }
        },

        stopLevelDataLoadWithFatalError(
            levelId: number,
            levelPath: string,
            eventName: string,
            errorCode: string,
            errorMessage: string,
            extra: Record<string, unknown> = {},
        ): void {
            if (this._levelDataLoadStopped) return;
            this._levelDataLoadStopped = true;
            this._preloadingBundle = false;
            AppRoot.tryGet()?.clearRouteCover('level-data-error');
            this.reportLevelDataLoadDiagnostic(levelId, eventName, false, levelPath, {
                errorCode,
                errorMessage,
                extra,
                flush: true,
            });
            this.setGameplayStartupRootVisible?.(true);
            this.hideLoadingOverlay?.();
            this.showRemoteLoadFatalError(levelPath, errorCode, errorMessage);
        },

        requireRemoteLoadFatalLayer(overlayRoot: Node): Node {
            const overlayTemplates = this.requireUiChild(overlayRoot, 'OverlayTemplates', 'OverlayRoot/OverlayTemplates');
            const layer = this.requireUiChild(overlayTemplates, 'RemoteLoadFatalError', 'OverlayTemplates/RemoteLoadFatalError');
            return layer;
        },

        showRemoteLoadFatalError(levelPath: string, errorCode: string, errorMessage: string): void {
            if (this._remoteLoadErrorOverlay?.isValid) return;
            runtimeWarn('[LevelDataLoad] fatal error surfaced with non-technical recovery actions', {
                levelPath,
                errorCode,
                errorMessage,
            });
            const visibleSize = this._getLoadingVisibleSize();
            const overlayRoot = this.requireCanvasUiRoot('OverlayRoot');
            const overlayTemplates = this.requireUiChild(overlayRoot, 'OverlayTemplates', 'OverlayRoot/OverlayTemplates');
            const layer = this.requireRemoteLoadFatalLayer(overlayRoot);
            this._remoteLoadErrorOverlay = layer;

            const layerTransform = layer.getComponent(UITransform);
            if (!layerTransform) throw new Error('[SceneUI] RemoteLoadFatalError is missing UITransform');
            layerTransform.setContentSize(visibleSize.width, visibleSize.height);
            const blocker = layer.getComponent(BlockInputEvents) || layer.addComponent(BlockInputEvents);
            blocker.enabled = true;
            layer.active = true;
            overlayTemplates.setSiblingIndex(overlayRoot.children.length - 1);
            layer.setSiblingIndex(overlayTemplates.children.length - 1);

            const mask = this.requireUiChild(layer, 'RemoteLoadFatalErrorMask', 'RemoteLoadFatalError/RemoteLoadFatalErrorMask');
            const maskTransform = mask.getComponent(UITransform);
            if (!maskTransform) throw new Error('[SceneUI] RemoteLoadFatalErrorMask is missing UITransform');
            maskTransform.setContentSize(visibleSize.width, visibleSize.height);
            mask.active = true;

            const card = this.requireUiChild(layer, 'RemoteLoadFatalErrorCard', 'RemoteLoadFatalError/RemoteLoadFatalErrorCard');
            card.active = true;

            this.setRemoteLoadFatalChildActive(card, 'RemoteLoadFatalErrorTitle', true);
            this.setRemoteLoadFatalChildActive(card, 'RemoteLoadFatalErrorHint', true);
            this.setRemoteLoadFatalChildActive(card, 'RemoteLoadFatalErrorPath', false);
            this.setRemoteLoadFatalChildActive(card, 'RemoteLoadFatalErrorDetail', false);
            this.setRemoteLoadFatalChildActive(card, 'RemoteLoadFatalErrorRetry', true);
            this.setRemoteLoadFatalChildActive(card, 'RemoteLoadFatalErrorBack', true);
            const retryNode = this.requireUiChild(
                card,
                'RemoteLoadFatalErrorRetry',
                'RemoteLoadFatalErrorCard/RemoteLoadFatalErrorRetry',
            );
            const backNode = this.requireUiChild(
                card,
                'RemoteLoadFatalErrorBack',
                'RemoteLoadFatalErrorCard/RemoteLoadFatalErrorBack',
            );
            const retryButton = retryNode.getComponent(Button);
            const backButton = backNode.getComponent(Button);
            if (!retryButton || !backButton) {
                throw new Error('[SceneUI] RemoteLoadFatalError recovery actions are missing Button components');
            }
            retryButton.interactable = true;
            backButton.interactable = true;
            retryNode.targetOff(this);
            retryNode.on(Button.EventType.CLICK, () => this.retryGameplayLoading?.('fatal-error'), this);
            backNode.targetOff(this);
            backNode.on(Button.EventType.CLICK, () => this.exitGameplayLoading?.('fatal-error'), this);
        },

        setRemoteLoadFatalChildActive(parent: Node, name: string, active: boolean): void {
            const node = this.requireUiChild(parent, name, `RemoteLoadFatalErrorCard/${name}`);
            const label = node.getComponent(Label);
            if (!label) {
                throw new Error(`[SceneUI] RemoteLoadFatalErrorCard/${name} is missing Label`);
            }
            node.active = active;
        },

        hideRemoteLoadFatalDiagnosticLabel(parent: Node, name: string): void {
            this.setRemoteLoadFatalChildActive(parent, name, false);
        },

        classifyFirstLevelTouchTarget(worldPos: Vec3): string {
            if (this.isSlotAreaInteractive() && this.slotAreaNode) {
                const slotUT = this.slotAreaNode.getComponent(UITransform);
                if (slotUT) {
                    const localPos = slotUT.convertToNodeSpaceAR(worldPos);
                    if (Math.abs(localPos.x) <= slotUT.contentSize.width / 2 && Math.abs(localPos.y) <= slotUT.contentSize.height / 2) {
                        return 'slot';
                    }
                }
            }
            if (this.getBoardTapCandidates(worldPos).length > 0) {
                return 'board';
            }
            return 'empty';
        },

        installRuntimeLogGate() {
        },

        logRuntimeTrace(...args: unknown[]) {
            if (!this.getUrlDebug()) return;
            runtimeLog(...args);
        },

        _startDeferredStartupBackgroundServices(
            canAutoSaveGameStateOnStartup: boolean,
            restoreStatus: UserStateRestoreStatus,
            deferDelaySec: number,
        ) {
            if (this._startupBackgroundServicesStarted) return;
            this._startupBackgroundServicesStarted = true;

            UserMgr.inst.touchSession(canAutoSaveGameStateOnStartup);
            if (restoreStatus === 'cloud_confirmed_empty') {
                this.grantStarterPropsForNewUser();
            }
            if (canAutoSaveGameStateOnStartup) {
                this.queueCloudGameStateSync();
            } else if (this._isWeChat() && restoreStatus !== 'cloud_restore_pending') {
                runtimeWarn('[GameCtrl] skip startup cloud state sync because fresh-install restore is unresolved:', restoreStatus);
            }

            this._pendingStartupBackgroundServices = {
                deferDelaySec: Math.max(0, Number(deferDelaySec) || 0),
            };
            this.runPendingStartupBackgroundServicesIfReady();
        },

        onGameplayUiReadyForStartupServices() {
            this._startupBackgroundServicesUiReady = true;
            flushPendingStartupCloudGameplayRestore(this, 'gameplay-ui-ready');
            this.runPendingStartupBackgroundServicesIfReady();
        },

        runPendingStartupBackgroundServicesIfReady() {
            const pending = this._pendingStartupBackgroundServices;
            if (!pending || this._startupBackgroundServicesRunStarted || !this._startupBackgroundServicesUiReady) {
                return;
            }
            this._startupBackgroundServicesRunStarted = true;
            this._pendingStartupBackgroundServices = null;
            const run = () => {
                if (!this.node?.isValid) return;
                SySDKMgr.inst.init();
                void SySDKMgr.inst.login().then((ready) => {
                    if (ready) SySDKMgr.inst.reportLoadFinish();
                });
                AudioMgr.inst.init(this.node);
                void AnalyticsMgr.inst.bootstrap();
            };

            if (pending.deferDelaySec > 0) {
                this.scheduleOnce(run, pending.deferDelaySec);
            } else {
                this.scheduleOnce(run, 0);
            }
        },

        async continueStartup() {
            markStartupTrace('startup_continue_decision_start');
            const urlLevel = this.getUrlLevel();
            const urlLevelFile = this.getUrlLevelFile();
            const startupLocalProgressState = this.getStartupLocalProgressState();
            const hadLocalUserState = startupLocalProgressState === 'local_progress_gt_1';
            const initialDefaultEntryLevel = this.getDefaultEntryLevel();
            const pendingSceneGameplayRequest = AppRoot.tryGet()?.session.pendingGameplayRequest;
            const pendingMainGameplayRequest = !urlLevelFile
                && urlLevel <= 0
                && pendingSceneGameplayRequest?.entryMode === 'main'
                ? pendingSceneGameplayRequest
                : null;
            const pendingStartupLevelId = pendingMainGameplayRequest
                ? Math.max(1, Math.floor(Number(pendingMainGameplayRequest.levelId) || 1))
                : 0;
            const pendingStartupPrefix = pendingMainGameplayRequest
                ? String(pendingMainGameplayRequest.prefix || 'level_')
                : '';
            const pendingStartupRouteReason = pendingMainGameplayRequest
                ? String(pendingMainGameplayRequest.routeReason || '')
                : '';
            const pendingLocalDirectStartup = pendingStartupLevelId >= 2
                && (pendingStartupRouteReason === 'local_progress_gt_1' || hadLocalUserState);
            if (pendingLocalDirectStartup) {
                const startupLevelPrefix = pendingStartupPrefix || LOCAL_BOOTSTRAP_LEVEL_PREFIX;
                markStartupTrace('startup_pending_local_direct', {
                    levelId: pendingStartupLevelId,
                    prefix: startupLevelPrefix,
                    startupLocalProgressState,
                    pendingStartupRouteReason,
                });
                this.reportLevelDataLoadDiagnostic(
                    pendingStartupLevelId,
                    'level_data_startup_diagnostics',
                    true,
                    this.getLevelDataPath(pendingStartupLevelId, startupLevelPrefix),
                    {
                        extra: {
                            routeMode: 'pending_local_direct',
                            initialDefaultEntryLevel,
                            pendingStartupLevelId,
                            pendingStartupPrefix,
                            pendingStartupRouteReason,
                            savedLevel: this.getSavedLevel(),
                        },
                    },
                );
                void this.beginStartupCloudRestore(true);
                const useLocalBootstrapStartup =
                    startupLevelPrefix === LOCAL_BOOTSTRAP_LEVEL_PREFIX
                    && this.shouldUseLocalBootstrapBundle(pendingStartupLevelId, startupLevelPrefix);
                if (useLocalBootstrapStartup) {
                    this.startLocalBootstrapLevelFast(pendingStartupLevelId, LOCAL_BOOTSTRAP_LEVEL_PREFIX, pendingStartupLevelId);
                } else {
                    this.startGameAssetsLevelFast(pendingStartupLevelId, startupLevelPrefix, pendingStartupLevelId);
                }
                this._startDeferredStartupBackgroundServices(
                    true,
                    'local_progress_gt_1',
                    useLocalBootstrapStartup ? 0.35 : 0,
                );
                return;
            }
            const speculativeStartupLevelId = urlLevelFile ? 0 : (urlLevel > 0 ? urlLevel : (pendingStartupLevelId || initialDefaultEntryLevel));
            const shouldSpeculativeFirstPlayPrefetch =
                !urlLevelFile
                && urlLevel <= 0
                && !pendingSceneGameplayRequest
                && initialDefaultEntryLevel <= 1
                && !hadLocalUserState
                && this.shouldUseLocalBootstrapBundle(speculativeStartupLevelId);
            if (shouldSpeculativeFirstPlayPrefetch) {
                this.prefetchLocalBootstrapStartupAssets(speculativeStartupLevelId);
            }
            // 只有 raw pdd.level > 1 才不阻塞启动；raw pdd.level 为 null 时不能写入默认第 1 关。
            // - 纯新用户：云端返回空数据，继续进第一关
            // - 删小程序的老用户：云端有存档，恢复到上次进度
            const restoreStatus = await this.restoreUserStateFromCloud(hadLocalUserState);
            const defaultEntryLevel = urlLevel > 0 || urlLevelFile
                ? initialDefaultEntryLevel
                : this.getDefaultEntryLevel();
            const startupLevelId = urlLevelFile ? 0 : (urlLevel > 0 ? urlLevel : (pendingStartupLevelId || defaultEntryLevel));
        
            let started = false;
            const startupLevelPrefix = pendingStartupPrefix || 'level_';
            if (!urlLevelFile && startupLevelId > 0) {
                this.reportLevelDataLoadDiagnostic(
                    startupLevelId,
                    'level_data_startup_diagnostics',
                    true,
                    this.getLevelDataPath(startupLevelId, startupLevelPrefix),
                    {
                        extra: {
                            initialDefaultEntryLevel,
                            defaultEntryLevel,
                            urlLevel,
                            restoreStatus,
                            startupLocalProgressState,
                            pendingStartupLevelId,
                            pendingStartupPrefix,
                            savedLevel: this.getSavedLevel(),
                        },
                    },
                );
            }
            const onReady = () => {
                if (started) return;
                started = true;
                if (urlLevelFile) {
                    this.loadExternalLevelFile(urlLevelFile);
                } else if (urlLevel > 0) {
                    this.loadLevel(urlLevel, 'level_', false);
                } else if (pendingSceneGameplayRequest) {
                    this.loadLevel(
                        pendingSceneGameplayRequest.levelId,
                        pendingSceneGameplayRequest.prefix,
                        pendingSceneGameplayRequest.entryMode === 'external',
                    );
                } else if (defaultEntryLevel <= 1) {
                    // 纯新用户默认从第一关进入
                    this.loadLevel(1);
                } else {
                    this.loadLevel(defaultEntryLevel);
                }
            };
        
            let deferredStartupDelaySec = 0;
            const canUseStartupFastPath = startupLevelId > 0
                && (sys.isNative || this._isMiniGame() || this._isUrlLevelPreview())
                && (!pendingSceneGameplayRequest || !!pendingMainGameplayRequest);
            if (canUseStartupFastPath) {
                const useLocalBootstrapStartup =
                    urlLevel <= 0
                    && startupLevelPrefix === LOCAL_BOOTSTRAP_LEVEL_PREFIX
                    && this.shouldUseLocalBootstrapBundle(startupLevelId, startupLevelPrefix);
                deferredStartupDelaySec = useLocalBootstrapStartup ? 0.35 : 0;
                if (useLocalBootstrapStartup) {
                    this.startLocalBootstrapLevelFast(startupLevelId, LOCAL_BOOTSTRAP_LEVEL_PREFIX, startupLevelId);
                } else {
                    const fastPrefix = startupLevelPrefix;
                    this.startGameAssetsLevelFast(startupLevelId, fastPrefix, startupLevelId);
                }
            } else {
                this.preloadAllAssets(onReady);
                // 超时兜底：15秒（给远程 bundle 足够的加载时间）
                this.scheduleOnce(onReady, 15);
            }

            const canAutoSaveGameStateOnStartup =
                restoreStatus === 'local_progress_gt_1' ||
                restoreStatus === 'cloud_progress_gt_1' ||
                restoreStatus === 'cloud_confirmed_empty';
            this._startDeferredStartupBackgroundServices(
                canAutoSaveGameStateOnStartup,
                restoreStatus,
                deferredStartupDelaySec,
            );
        },

        // ==================== 资源加载 ====================
        
        preloadAllAssets(onDone?: () => void) {
            LevelDataCdnService.inst.prefetchLive();
            const finish = () => {
                if (onDone) onDone();
                else this.showMainMenu();
            };
            this.scheduleOnce(finish, 0);
        },

        _isWeChat(): boolean {
            return isWeChatMiniGameRuntime();
        },

        _isDouyin(): boolean {
            return isDouyinMiniGameRuntime();
        },

        _isMiniGame(): boolean {
            return isMiniGameRuntime();
        },

        _isUrlLevelPreview(): boolean {
            try {
                return new URLSearchParams(window.location.search).get('remote') === '1';
            } catch (_) { return false; }
        },

        _loadFromGameAssetsBundle(onDone?: () => void) {
            if (this.gameAssetsBundle) {
                this._preloadGameAssetsTextureSet(this.gameAssetsBundle, () => {
                    if (onDone) onDone(); else this.showMainMenu();
                });
                return;
            }
            this._preloadingBundle = true;
            assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                this._preloadingBundle = false;
                if (err) {
                    console.warn('loadBundle gameAssets failed:', err.message);
                    if (onDone) onDone(); else this.showMainMenu();
                    return;
                }
                this.gameAssetsBundle = bundle;
                this._preloadGameAssetsTextureSet(bundle, () => {
                    if (onDone) onDone(); else this.showMainMenu();
                });
            });
        },

        /** 从图集加载豆豆 SpriteFrame（统一缓存成 b010_1 / b010_2 / b010_4 这类 key） */
        _loadBeanAtlasFromBundle(
            bundle: Bundle,
            onDone?: () => void,
            atlasPath: string = LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH,
            imagePath: string = LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH,
            label: string = 'bootstrap bean-atlas',
        ) {
            if (this._bootstrapBeanAtlasReady) {
                if (onDone) onDone();
                return;
            }
            if (this._bootstrapBeanAtlasLoadingCallbacks) {
                if (onDone) this._bootstrapBeanAtlasLoadingCallbacks.push(onDone);
                return;
            }
            this._bootstrapBeanAtlasLoadingCallbacks = onDone ? [onDone] : [];
            const finish = (ready: boolean) => {
                this._bootstrapBeanAtlasReady = this._bootstrapBeanAtlasReady || ready;
                const callbacks = this._bootstrapBeanAtlasLoadingCallbacks || [];
                this._bootstrapBeanAtlasLoadingCallbacks = null;
                for (const callback of callbacks) callback();
            };
            this._loadAtlasDataFromBundle(bundle, atlasPath, label, (err, atlasData) => {
                if (err || !atlasData) {
                    console.error('[图集] 未找到 bean-atlas-data.json:', err?.message);
                    finish(false);
                    return;
                }
                const frames = atlasData.frames;
                if (!frames) {
                    console.error('[图集] bean-atlas 数据不完整');
                    finish(false);
                    return;
                }
                this._loadAtlasTextureFromBundle(bundle, imagePath, label, (imgErr, texture, textureMeta) => {
                    if (imgErr || !texture) {
                        console.error('[图集] bean-atlas 纹理加载失败:', imgErr?.message);
                        finish(false);
                        return;
                    }
                    this._bootstrapBeanAtlasTexture = texture;
                    this._bootstrapBeanAtlasImageAsset = textureMeta?.imageAsset ?? null;
                    this._bootstrapBeanAtlasTextureReleaseMode = textureMeta?.releaseMode === 'dynamic' ? 'dynamic' : 'asset';
                    const releaseMode = textureMeta?.releaseMode === 'dynamic' ? 'dynamic' : 'asset';
                    const imageAsset = textureMeta?.imageAsset ?? null;
                    let count = 0;
                    for (const name in frames) {
                        const f = frames[name];
                        const sf = new SpriteFrame();
                        sf.texture = texture;
                        sf.rect = new Rect(f.x, f.y, f.w, f.h);
                        sf.name = name;
                        (sf as any).__pddReleaseMode = releaseMode;
                        (sf as any).__pddOwnedTexture = releaseMode === 'dynamic' ? texture : null;
                        (sf as any).__pddSourceImageAsset = imageAsset;
                        if (typeof this._cacheSpriteFrame === 'function') {
                            this._cacheSpriteFrame(sf, name, {
                                releaseMode,
                                texture,
                                imageAsset,
                                scope: 'startup-bootstrap',
                            });
                        } else {
                            this.sfCache.set(name, sf);
                        }
                        this._bootstrapAtlasFrameCache.set(name, sf);
                        count++;
                    }
                    runtimeLog(`[图集] 豆豆图集已加载: ${count} 个 SpriteFrame`);
                    finish(count > 0);
                });
            });
        },

        _prepareBeanFramesForLevelData(data: LevelData, onDone: () => void) {
            if (!this.needsBeanFramesForLevelData(data)) {
                onDone();
                return;
            }
            this._ensureBeanAtlasLoadedForLevelData(data, () => {
                if (!this._hasBeanAtlasReadyForLevelData(data)) {
                    console.error('[bean] required bean SpriteFrames unavailable for level:', data.levelId);
                }
                onDone();
            });
        },

        _hasBeanAtlasReadyForLevelData(data: LevelData): boolean {
            return this._hasBootstrapAtlasFramesForLevelData(data);
        },

        _ensureBeanAtlasLoadedForLevelData(data: LevelData, onDone?: () => void) {
            this._ensureBootstrapBeanAtlasLoaded(onDone);
        },

        _ensureBootstrapBeanAtlasLoaded(onDone?: () => void) {
            if (this._bootstrapBeanAtlasReady) {
                if (onDone) onDone();
                return;
            }
            this._withBootstrapBundle((bundle) => {
                if (!bundle) {
                    console.error('[bootstrap] bean-atlas bundle unavailable');
                    if (onDone) onDone();
                    return;
                }
                this._loadBeanAtlasFromBundle(
                    bundle,
                    onDone,
                    LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH,
                    LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH,
                    'bootstrap bean-atlas',
                );
            });
        },

        _loadAtlasJsonFromBundle(
            bundle: Bundle,
            atlasPath: string,
            label: string,
            callback: (err: Error | null, jsonAsset: JsonAsset | null) => void,
        ) {
            bundle.load(atlasPath, JsonAsset, (err, jsonAsset) => {
                if (!err && jsonAsset) {
                    callback(null, jsonAsset);
                    return;
                }
                const message = err?.message || 'unknown error';
                runtimeWarn(`[图集] ${label}.json 路径加载失败: ${message}`);
                callback(err || new Error(message), null);
            });
        },

        _loadAtlasDataFromBundle(
            bundle: Bundle,
            atlasPath: string,
            label: string,
            callback: (err: Error | null, atlasData: any | null) => void,
        ) {
            bundle.load(atlasPath, TextAsset, (textErr, textAsset) => {
                if (!textErr && textAsset?.text) {
                    try {
                        callback(null, JSON.parse(textAsset.text));
                        return;
                    } catch (parseErr) {
                        const message = parseErr instanceof Error ? parseErr.message : 'atlas parse failed';
                        runtimeWarn(`[图集] ${label}.json 文本解析失败: ${message}`);
                        callback(parseErr instanceof Error ? parseErr : new Error(message), null);
                        return;
                    }
                }
                this._loadAtlasJsonFromBundle(bundle, atlasPath, label, (err, jsonAsset) => {
                    if (!err && jsonAsset?.json) {
                        callback(null, jsonAsset.json as any);
                        return;
                    }
                    const message = textErr?.message || err?.message || 'unknown error';
                    runtimeWarn(`[图集] ${label}.json 加载失败: ${message}`);
                    callback(textErr || err || new Error(message), null);
                });
            });
        },

        _loadAtlasTextureFromBundle(
            bundle: Bundle,
            imagePath: string,
            label: string,
            callback: (
                err: Error | null,
                texture: Texture2D | null,
                meta?: { releaseMode: 'asset' | 'dynamic'; imageAsset?: ImageAsset | null },
            ) => void,
        ) {
            const spriteFrameCandidates = [`${imagePath}/spriteFrame`, imagePath];
            const trySpriteFrame = (index: number) => {
                if (index >= spriteFrameCandidates.length) {
                    tryTexture(0);
                    return;
                }
                bundle.load(spriteFrameCandidates[index], SpriteFrame, (err, spriteFrame) => {
                    const texture = spriteFrame?.texture as Texture2D | null;
                    if (!err && texture) {
                        callback(null, texture, { releaseMode: 'asset', imageAsset: null });
                        return;
                    }
                    trySpriteFrame(index + 1);
                });
            };
            const textureCandidates = [`${imagePath}/texture`, imagePath];
            const tryTexture = (index: number) => {
                if (index >= textureCandidates.length) {
                    tryImageAsset(0);
                    return;
                }
                bundle.load(textureCandidates[index], Texture2D, (err, texture) => {
                    if (!err && texture) {
                        callback(null, texture, { releaseMode: 'asset', imageAsset: null });
                        return;
                    }
                    tryTexture(index + 1);
                });
            };
            const imageCandidates = [imagePath, `${imagePath}/texture`];
            const tryImageAsset = (index: number) => {
                if (index >= imageCandidates.length) {
                    callback(new Error(`[图集] ${label} texture unavailable`), null);
                    return;
                }
                bundle.load(imageCandidates[index], ImageAsset, (err, imgAsset) => {
                    if (!err && imgAsset) {
                        const texture = new Texture2D();
                        texture.image = imgAsset;
                        callback(null, texture, { releaseMode: 'dynamic', imageAsset: imgAsset });
                        return;
                    }
                    tryImageAsset(index + 1);
                });
            };
            trySpriteFrame(0);
        },

        getSF(name: string): SpriteFrame | null {
            return this.sfCache.get(name) || null;
        },
    });
}
