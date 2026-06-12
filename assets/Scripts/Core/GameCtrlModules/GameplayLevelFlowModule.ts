import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, DAILY_SIGNIN_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_TEXTURE_SEARCH_DIRS, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY, MAINLINE_SLOT_LOCK_DASH_ALPHA,
    MAINLINE_SLOT_LOCK_ROW_WIDTH, MAINLINE_SLOT_LOCK_ROW_HEIGHT, MAINLINE_SLOT_PANEL_TEXTURE, MAINLINE_SLOT_GROOVE_TEXTURE, MAINLINE_SLOT_TEXTURE_NAMES, SKILL_BUTTON_Y, SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_DAILY_SIGNIN_COUNT, LS_DAILY_SIGNIN_LAST_DATE_KEY, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, FIRST_LEVEL_ROUTE_EXPERIMENT_ID, FIRST_LEVEL_ROUTE_WX_TIMEOUT_MS, CLOUD_STATE_RESTORE_TIMEOUT_MS, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, createSingleColorSpriteFrame, BoardViewportController
} from '../GameCtrlShared';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode, FirstLevelRouteVariant, FirstLevelRouteResolution,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';
import { ensureGameplaySessionController } from '../GameplaySessionController';
import { ensureGameplayViewController } from '../GameplayViewController';
import { LevelDataCdnService } from '../LevelDataCdnService';

const WIN_SETTLEMENT_TEXTURE_NAMES = [
    'popup_frame_soft',
    'popup_title_badge_blank',
    'popup_close_button',
    'popup_reward_card',
    'popup_primary_button',
    'popup_secondary_button',
    'popup_result_time_icon',
    'popup_result_preview_plate',
    'popup_progress_bar_bg',
    'popup_progress_bar_fill',
    '金币',
    '进度条',
    'progress_fill',
];

export function installGameplayLevelFlowModule(target: any): void {
    Object.assign(target, {
        scheduleGameAssetsEffectsWarmup(bundle: Bundle, delaySec: number = 1.5) {
            if (!GAME_ASSETS_EFFECTS_IDLE_WARMUP) return;
            if (this._effectsAtlasReady || this._effectsAtlasLoadingCallbacks) return;
            this.scheduleOnce(() => {
                if (this._effectsAtlasReady || this._effectsAtlasLoadingCallbacks) return;
                this._loadEffectsAtlasFromBundle(bundle);
            }, delaySec);
        },

        ensureEffectsAtlasLoadedForNextUse() {
            if (this._effectsAtlasReady || this._effectsAtlasLoadingCallbacks) return;
            const load = (bundle: Bundle | null) => {
                if (!bundle) return;
                this._loadEffectsAtlasFromBundle(bundle);
            };
            if (this.gameAssetsBundle) {
                load(this.gameAssetsBundle);
                return;
            }
            this._withGameAssetsBundle(load);
        },

        /** 等待 preloadAllAssets 完成后再加载关卡 */
        waitForGameAssetsBundleReady(levelId: number, prefix: string = 'level_', activeLevelId: number = levelId) {
            const levelPath = this.getLevelDataPath(levelId, prefix);
            const check = () => {
                if (this._levelDataLoadStopped) {
                    this.unschedule(check);
                    return;
                }
                if (this.gameAssetsBundle) {
                    this.unschedule(check);
                    this._loadLevelDataFromCdnOrLocal(levelId, prefix, (levelData, source, err) => {
                        if (!levelData) {
                            this.stopLevelDataLoadWithFatalError(
                                activeLevelId,
                                levelPath,
                                'first_level_json_failed',
                                source === 'level_data_cdn' ? 'level_data_cdn_unavailable' : 'level_data_json_failed',
                                err?.message || 'missing json asset',
                            );
                            return;
                        }
                        this.reportLevelDataLoadDiagnostic(activeLevelId, 'first_level_json_loaded', true, levelPath, {
                            extra: {
                                source,
                                dataVersion: source === 'level_data_cdn' ? LevelDataCdnService.inst.getDataVersion() : '',
                                actualLevelId: levelData.levelId,
                                jsonKeys: Object.keys(levelData || {}).slice(0, 12),
                            },
                        });
                        this.openLevelWithGameAssets(this.gameAssetsBundle!, levelData, activeLevelId);
                    });
                    return;
                }
                if (!this._preloadingBundle) {
                    this.unschedule(check);
                    this.stopLevelDataLoadWithFatalError(
                        activeLevelId,
                        levelPath,
                        'gameAssets_config_failed',
                        'gameAssets_bundle_missing_after_preload',
                        'preload finished without gameAssets bundle',
                    );
                }
            };
            this.schedule(check, 0.1, 0, 0);
        },

        /** 通用加载关卡数据（用于图鉴等场景） */
        loadLevelData(levelId: number, callback: (data: LevelData | null) => void, prefix: string = 'level_') {
            if (this.shouldUseLocalBootstrapBundle(levelId, prefix)) {
                this._loadLocalLevelDataImpl(levelId, callback, prefix);
                return;
            }
            if (sys.isNative || this._isWeChat() || this._isUrlLevelPreview()) {
                this._loadLevelDataImpl(levelId, callback, prefix);
            } else {
                this._loadLocalLevelDataImpl(levelId, callback, prefix);
            }
        },

        _loadLevelDataImpl(levelId: number, callback: (data: LevelData | null) => void, prefix: string = 'level_') {
            if (this.shouldUseLocalBootstrapBundle(levelId, prefix)) {
                this._loadLocalLevelDataImpl(levelId, callback, prefix);
                return;
            }
            const path = this.getLevelDataPath(levelId, prefix);
            this._loadLevelDataFromCdnOrLocal(levelId, prefix, (levelData, source, err) => {
                if (levelData) {
                    console.log('[LevelDataLoad] OK level data', this.getLevelDataLoadDiagnostics(levelId, path, {
                        source,
                        dataVersion: source === 'level_data_cdn' ? LevelDataCdnService.inst.getDataVersion() : '',
                        actualLevelId: levelData.levelId,
                        jsonKeys: Object.keys(levelData || {}).slice(0, 12),
                    }));
                    callback(levelData);
                    return;
                }
                console.error('[LevelDataLoad] FAILED level data', this.getLevelDataLoadDiagnostics(levelId, path, {
                    source,
                    errorMessage: err?.message || 'missing json asset',
                }));
                callback(null);
            });
            return;
        },

        _loadLocalLevelDataImpl(levelId: number, callback: (data: LevelData | null) => void, prefix: string = 'level_') {
            if (this.shouldUseLocalBootstrapBundle(levelId, prefix)) {
                this._withBootstrapBundle((bundle) => {
                    if (!bundle) {
                        console.error(`[bootstrap] loadBundle failed for LevelData/${prefix}${levelId}`);
                        callback(null);
                        return;
                    }
                    bundle.load(`${LOCAL_BOOTSTRAP_LEVEL_DIR}/${prefix}${levelId}`, JsonAsset, (err, jsonAsset) => {
                        if (!err && jsonAsset) {
                            callback(jsonAsset.json as LevelData);
                            return;
                        }
                        console.error(`[bootstrap] failed to load LevelData/${prefix}${levelId}:`, err?.message || 'missing json asset');
                        callback(null);
                    });
                });
                return;
            }
            this._loadLevelDataImpl(levelId, callback, prefix);
        },

        getLevelColorIds(data: LevelData | null): number[] {
            const colors = new Set<number>();
            const pushGrid = (grid?: number[][]) => {
                if (!grid) return;
                for (const row of grid) {
                    for (const colorId of row || []) {
                        const normalizedColorId = this.normalizeBeanColorId(colorId);
                        if (normalizedColorId !== null) colors.add(normalizedColorId);
                    }
                }
            };
            pushGrid(data?.correctColorArr);
            pushGrid(data?.initRandomColorArr);
            return [...colors].sort((a, b) => a - b);
        },

        _hasBootstrapAtlasFramesForLevelData(data: LevelData | null): boolean {
            if (!this._bootstrapBeanAtlasReady) return false;
            const colorIds = this.getLevelColorIds(data);
            if (colorIds.length === 0) {
                return this._bootstrapAtlasFrameCache.size > 0;
            }
            for (const colorId of colorIds) {
                const key = this.getPinddColorKey(colorId);
                if (!key) continue;
                for (const variant of PINDD_BEAN_VARIANTS) {
                    if (!this._bootstrapAtlasFrameCache.has(`${key}_${variant}`)) {
                        return false;
                    }
                }
            }
            return true;
        },

        needsBeanFramesForLevelData(data: LevelData | null): boolean {
            return !this._hasBootstrapAtlasFramesForLevelData(data);
        },

        getCriticalUiTextureNamesForLevel(data: LevelData | null): string[] {
            if (!data) return [];
            const names: string[] = ['设置', ...GAMEPLAY_SLOT_TEXTURE_NAMES];
            if (this.shouldUseMainlineSlotUI()) {
                names.push(...MAINLINE_SLOT_TEXTURE_NAMES);
            }
            if (this.shouldUseMainlineWinSettlementUI()) {
                names.push(...WIN_SETTLEMENT_TEXTURE_NAMES);
            }
            if (data.levelId >= 2) {
                names.push(...SKILL_BUTTON_TEXTURE_NAMES);
            }
            return Array.from(new Set(names));
        },

        getCriticalGameplayShellTextureNamesForLevel(data: LevelData | null): string[] {
            if (!data) return [];
            const names: string[] = ['设置', ...GAMEPLAY_SLOT_TEXTURE_NAMES];
            if (this.shouldUseMainlineSlotUI()) {
                names.push(...MAINLINE_SLOT_TEXTURE_NAMES);
            }
            if (this.shouldUseMainlineWinSettlementUI()) {
                names.push(...WIN_SETTLEMENT_TEXTURE_NAMES);
            }
            if (data.levelId >= 2) {
                names.push(...SKILL_BUTTON_TEXTURE_NAMES);
            }
            return Array.from(new Set(names));
        },

        getMissingCriticalGameplayShellTextureNamesForLevel(data: LevelData | null): string[] {
            return this.getCriticalGameplayShellTextureNamesForLevel(data).filter((name) => !this.sfCache.has(name));
        },

        prepareCriticalUiTexturesForLevel(data: LevelData | null, callback: () => void) {
            const textureNames = this.getCriticalUiTextureNamesForLevel(data);
            if (textureNames.length === 0) {
                callback();
                return;
            }
            const levelId = data?.levelId || 0;
            const bootstrapTextureNames = textureNames.filter((name) => this.shouldUseLocalBootstrapTexture(name, levelId));
            const gameAssetsTextureNames = textureNames.filter((name) => !this.shouldUseLocalBootstrapTexture(name, levelId));
            const tasks: Array<(done: () => void) => void> = [];
            if (bootstrapTextureNames.length > 0) {
                tasks.push((done) => this._preloadBootstrapTextureSet(bootstrapTextureNames, done));
            }
            if (gameAssetsTextureNames.length > 0) {
                tasks.push((done) => this._ensureSpriteFramesByName(gameAssetsTextureNames, done));
            }
            if (tasks.length === 0) {
                callback();
                return;
            }
            let pending = tasks.length;
            const finishOne = () => {
                pending -= 1;
                if (pending <= 0) callback();
            };
            for (const task of tasks) {
                task(finishOne);
            }
        },

        _preloadBootstrapTextureSet(imgNames: string[], callback: () => void) {
            if (imgNames.length === 0) {
                callback();
                return;
            }
            let remaining = imgNames.length;
            const finishOne = () => {
                remaining -= 1;
                if (remaining > 0) return;
                callback();
            };
            for (const imgName of imgNames) {
                this._loadSpriteFrameFromBootstrapThenRemote(imgName, (sf) => {
                    if (sf) {
                        this._cacheSpriteFrame(sf, imgName);
                    } else {
                        console.warn('[bootstrap] startup UI texture load failed:', imgName);
                    }
                    finishOne();
                });
            }
        },

        initGame(data: LevelData, activeLevelId?: number) {
            ensureGameplaySessionController(this).initGame(data, activeLevelId);
        },

        // ==================== UI 构建 ====================
        
        getGameplayScreenRoot() {
            return ensureGameplayViewController(this).getGameplayScreenRoot();
        },

        getGameplayFixedRoot() {
            return ensureGameplayViewController(this).getGameplayFixedRoot();
        },

        getGameplayRuntimeRoot() {
            return ensureGameplayViewController(this).getGameplayRuntimeRoot();
        },

        getGameplayRuntimeGroup(name: string) {
            return ensureGameplayViewController(this).getGameplayRuntimeGroup(name);
        },

        getGameplayFixedGroup(name: string) {
            return ensureGameplayViewController(this).getGameplayFixedGroup(name);
        },

        getGameplayBottomHudGroup() {
            return ensureGameplayViewController(this).getGameplayBottomHudGroup();
        },

        getGameplayBottomHudChild(name: string) {
            return ensureGameplayViewController(this).getGameplayBottomHudChild(name);
        },

        applyGameplayBottomHudPosition(root?: Node) {
            return ensureGameplayViewController(this).applyGameplayBottomHudPosition(root);
        },

        assertGameplayVisualReadiness() {
            ensureGameplayViewController(this).assertGameplayVisualReadiness();
        },

        detachGameplayInputHandlers() {
            ensureGameplayViewController(this).detachGameplayInputHandlers();
        },

        requireGameplayBackgroundShell() {
            return ensureGameplayViewController(this).requireGameplayBackgroundShell();
        },

        buildUI() {
            ensureGameplayViewController(this).buildUI();
        },

        buildTopBar(root: Node) {
            ensureGameplayViewController(this).buildTopBar(root);
        },

        shouldUseLightweightTopBar(): boolean {
            return this.levelData.levelId === LOCAL_BOOTSTRAP_LEVEL_ID;
        },

        shouldHideTopBar(): boolean {
            return false;
        },

        shouldShowSlotArea(): boolean {
            return true;
        },

        isSlotAreaInteractive(): boolean {
            return this.shouldShowSlotArea() && !!this.slotAreaNode?.active;
        },

        getTopBarY(): number {
            const visibleH = view.getVisibleSize().height;
            const designH = (this.constructor as any).VIEWPORT_HEIGHT;
            const topEdge = Math.max(designH, visibleH) / 2;
            return topEdge - 30;
        },

        buildLightweightTopBar(root: Node) {
            ensureGameplayViewController(this).buildLightweightTopBar(root);
        },

        drawLevelTitleLabel(parent: Node) {
            ensureGameplayViewController(this).drawLevelTitleLabel(parent);
        },

        renderBoardSlots() {
            ensureGameplayViewController(this).renderBoardSlots();
        },

        renderBoard() {
            ensureGameplayViewController(this).renderBoard();
        },

        renderBoardCell(row: number, col: number) {
            ensureGameplayViewController(this).renderBoardCell(row, col);
        },

        renderBoardCells(cells: Array<{ row: number; col: number }>) {
            ensureGameplayViewController(this).renderBoardCells(cells);
        },

        renderBoardSlotCell(row: number, col: number) {
            ensureGameplayViewController(this).renderBoardSlotCell(row, col);
        },

        renderCell(row: number, col: number) {
            ensureGameplayViewController(this).renderCell(row, col);
        },

        renderSlots() {
            this.renderSlotsWithHidden(this._hiddenSlotIndices);
        },

        getTouchId(touch: any, fallback: number): number {
            return ensureGameplayViewController(this).getTouchId(touch, fallback);
        },

        getTouchUiPos(touch: any) {
            return ensureGameplayViewController(this).getTouchUiPos(touch);
        },

        updateActiveBoardTouches(event: any, removeChanged: boolean = false): number {
            return ensureGameplayViewController(this).updateActiveBoardTouches(event, removeChanged);
        },

        uiToViewportParent(uiPos: Vec2) {
            return ensureGameplayViewController(this).uiToViewportParent(uiPos);
        },

        beginBoardPanFromUiPos(uiPos: Vec2, immediate: boolean = false) {
            ensureGameplayViewController(this).beginBoardPanFromUiPos(uiPos, immediate);
        },

        worldToBoardLocal(worldPos: Vec3) {
            return ensureGameplayViewController(this).worldToBoardLocal(worldPos);
        },

        uiToBoardLocal(uiPos: Vec2) {
            return ensureGameplayViewController(this).uiToBoardLocal(uiPos);
        },

        boardLocalToGrid(localPos: Vec2, margin: number = 0) {
            return ensureGameplayViewController(this).boardLocalToGrid(localPos, margin);
        },

        getDistanceToBoardCellRect(localPos: Vec2, row: number, col: number): number {
            return ensureGameplayViewController(this).getDistanceToBoardCellRect(localPos, row, col);
        },

        getBoardHitToleranceLocalByConfig(minUi: number, ratio: number): number {
            return ensureGameplayViewController(this).getBoardHitToleranceLocalByConfig(minUi, ratio);
        },

        getBoardHitToleranceLocal(kind: 'select' | 'place'): number {
            return ensureGameplayViewController(this).getBoardHitToleranceLocal(kind);
        },

        getSlotBoardPlaceToleranceLocal(): number {
            return ensureGameplayViewController(this).getSlotBoardPlaceToleranceLocal();
        },

        getBoardCandidateRadius(tolerance: number): number {
            return ensureGameplayViewController(this).getBoardCandidateRadius(tolerance);
        },

        buildBoard(root: Node) {
            ensureGameplayViewController(this).buildBoard(root);
        },
    });
}
