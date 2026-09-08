import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, instantiate, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_TEXTURE_SEARCH_DIRS, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY,
    SKILL_BUTTON_Y, SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
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
    InventoryPropKind, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { weChatShareReturnService } from '../../Platform/WeChatShareReturnService';
import type { WeChatShareReturnHandle } from '../../Platform/WeChatShareReturnService';

type WeChatDisplayShareOptions = {
    shareType: string;
    page: string;
    levelId: number;
    title: string;
    query: string;
    onQualified: () => void;
    onRejected: (reason: string) => void;
};

function getWeChatShareReturnToast(reason: string): string {
    if (reason === 'too_short' || reason === 'timeout' || reason === 'cleanup_failed') {
        return '分享未完成，请停留1.5秒后再返回';
    }
    return reason === 'cancelled' ? '分享已取消' : '分享失败';
}

function startWeChatDisplayShare(runtime: any, options: WeChatDisplayShareOptions): boolean {
    if (runtime._shareShowing) return false;
    const wx: any = typeof runtime.getWeChatRuntime === 'function' ? runtime.getWeChatRuntime() : null;
    if (!wx) {
        options.onRejected('unavailable');
        return false;
    }
    runtime._shareShowing = true;
    let pendingHandle: WeChatShareReturnHandle | null = null;
    const onComplete = (result: { status: string; reason?: string }) => {
        if (runtime._pendingShareReturn === pendingHandle) {
            runtime._pendingShareReturn = null;
        }
        runtime._shareShowing = false;
        if (result.status === 'qualified') {
            AnalyticsMgr.inst.trackShareSuccess(options.shareType, options.page, options.levelId);
            options.onQualified();
            return;
        }
        if (result.status === 'cancelled' && String(result.reason || '').startsWith('scene-destroy:')) {
            return;
        }
        options.onRejected(result.status);
    };
    AnalyticsMgr.inst.trackShareClick(options.shareType, options.page, options.levelId);
    const startResult = weChatShareReturnService.start({
        runtime: wx,
        payload: {
            title: options.title,
            query: options.query,
        },
        onComplete,
    });
    if (startResult.started === false) {
        runtime._shareShowing = false;
        options.onRejected(startResult.reason);
        return false;
    }
    pendingHandle = startResult.handle;
    if (pendingHandle.isActive()) {
        runtime._pendingShareReturn = pendingHandle;
    }
    return true;
}

export function installThemeLoadingOverlayModule(target: any): void {
    Object.assign(target, {
        startThemeLevel(levelId: number, options: { suppressFailureToast?: boolean } = {}): boolean | Promise<boolean> {
            const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
            const startedFromHome = this.getRuntimeSceneName('Game') === 'Home';
            const onFail = (error: unknown): false => {
                console.error('[theme_unlock] start theme level failed:', { levelId: normalizedLevelId, error });
                if (!options.suppressFailureToast) {
                    this.showToast('像素关启动失败，请重试');
                }
                if (!startedFromHome) this.showMainMenu();
                return false;
            };
            if (!this.costVigorForLevel(normalizedLevelId, 'theme')) {
                this.showNoLivesAdModal({
                    source: 'theme_start',
                    levelId: normalizedLevelId,
                    gameplayEntryMode: 'theme',
                    onResult: (result: any) => {
                        if (result?.status !== 'granted' || !this.isValid) return;
                        this.startThemeLevel(normalizedLevelId, options);
                    },
                });
                return false;
            }
            if (startedFromHome) {
                return this.requestGameplayRoute(normalizedLevelId, 'zt_level_', false)
                    .then(() => true)
                    .catch(onFail);
            }
            try {
                this.deactivateMainMenuNode();
                this.loadThemeLevel(normalizedLevelId);
                return true;
            } catch (error) {
                return onFail(error);
            }
        },

        shareCurrentWinLevel() {
            const levelId = this.getActiveLogicalLevelId();
            const title = `我在拼豆豆通关了第${levelId}关，快来一起挑战！`;

            const wx: any = this.getWeChatRuntime();
            const tt: any = (typeof globalThis !== 'undefined' ? (globalThis as any).tt : null)
                || (typeof window !== 'undefined' ? (window as any).tt : null);

            if (wx && typeof wx.shareAppMessage === 'function') {
                startWeChatDisplayShare(this, {
                    shareType: 'level_win',
                    page: 'win_share',
                    levelId,
                    title,
                    query: `level=${levelId}`,
                    onQualified: () => this.showToast('分享成功'),
                    onRejected: (reason) => this.showToast(getWeChatShareReturnToast(reason)),
                });
                return;
            }

            if (tt && typeof tt.shareAppMessage === 'function') {
                AnalyticsMgr.inst.trackShareClick('level_win', 'win_share', levelId);
                try {
                    tt.shareAppMessage({
                        channel: 'video',
                        title,
                        desc: title,
                        query: `level=${levelId}`,
                        success: () => {
                            AnalyticsMgr.inst.trackShareSuccess('level_win', 'win_share', levelId);
                            this.showToast('分享成功');
                        },
                        fail: () => {
                            this.showToast('分享已取消');
                        },
                    });
                } catch (e) {
                    console.warn('[shareCurrentWinLevel] tt.shareAppMessage error:', e);
                    this.showToast('分享失败');
                }
                return;
            }

            this.showToast('请在微信/抖音中分享');
        },

    });
}
