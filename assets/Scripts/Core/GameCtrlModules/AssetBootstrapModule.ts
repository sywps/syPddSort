import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, DAILY_SIGNIN_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, REMOTE_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, REMOTE_PRELOAD_TEXTURE_PATHS,
    REMOTE_TEXTURE_SEARCH_DIRS, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY, MAINLINE_SLOT_LOCK_DASH_ALPHA,
    MAINLINE_SLOT_LOCK_ROW_WIDTH, MAINLINE_SLOT_LOCK_ROW_HEIGHT, MAINLINE_SLOT_PANEL_TEXTURE, MAINLINE_SLOT_GROOVE_TEXTURE, MAINLINE_SLOT_TEXTURE_NAMES, SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_REMOTE_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_DAILY_SIGNIN_COUNT, LS_DAILY_SIGNIN_LAST_DATE_KEY, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, FIRST_LEVEL_ROUTE_EXPERIMENT_ID, FIRST_LEVEL_ROUTE_WX_TIMEOUT_MS, CLOUD_STATE_RESTORE_TIMEOUT_MS, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, REMOTE_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
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
import { ensureGameplaySkillUiController } from '../GameplaySkillUiController';

function applyLateCloudUserStateToRuntime(runtime: any, state: CloudUserState | null, hadLocalUserState: boolean): void {
    if (!runtime.isValid || !state) {
        return;
    }
    const beforeLevel = runtime.getSavedLevel();
    const status = runtime.applyCloudUserState(state);
    if (status !== 'restored') {
        return;
    }
    const restoredLevel = runtime.getSavedLevel();
    if (
        !hadLocalUserState &&
        !runtime.isExternalLevelPreviewActive() &&
        runtime.getUrlLevel() <= 0 &&
        beforeLevel <= 1 &&
        restoredLevel > 1
    ) {
        if (runtime.getActiveLogicalLevelId() === 1 && !runtime._timerStarted && !runtime.isGameEnd) {
            console.log('[GameCtrl] late cloud progress restored, switching startup route to Home');
            runtime.showMainMenu();
        } else if (runtime.mainMenuNode?.isValid) {
            runtime.showMainMenu();
        }
    }
}

export function installAssetBootstrapModule(target: any): void {
    Object.assign(target, {
        _cacheSpriteFrame(sf: SpriteFrame | null, fallbackName?: string) {
            if (!sf) return;
            const fileName = sf.name || fallbackName;
            if (!fileName) return;
            this.sfCache.set(fileName, sf);
        },

        _getSpriteFrameLoadCandidates(assetPath: string): string[] {
            if (assetPath.endsWith('/spriteFrame')) {
                return [assetPath];
            }
            return [`${assetPath}/spriteFrame`, assetPath];
        },

        _loadSpriteFrameWithCandidates(
            load: (path: string, done: (err: Error | null, sf: SpriteFrame | null) => void) => void,
            candidates: string[],
            callback: (sf: SpriteFrame | null) => void,
        ) {
            const tryLoad = (index: number) => {
                if (index >= candidates.length) {
                    callback(null);
                    return;
                }
                load(candidates[index], (err, sf) => {
                    if (!err && sf) {
                        callback(sf);
                        return;
                    }
                    tryLoad(index + 1);
                });
            };
            tryLoad(0);
        },

        _preloadRemoteTextureSet(bundle: Bundle, onDone?: () => void, paths: string[] = REMOTE_PRELOAD_TEXTURE_PATHS) {
            if (paths.length === 0) {
                if (onDone) onDone();
                return;
            }
            let remaining = paths.length;
            let loaded = 0;
            const finishOne = () => {
                remaining -= 1;
                if (remaining > 0) return;
                console.log(`[remote] preloaded ${loaded}/${paths.length} startup SpriteFrames`);
                if (onDone) onDone();
            };
            for (const path of paths) {
                const fallbackName = path.slice(path.lastIndexOf('/') + 1);
                this._loadSpriteFrameWithCandidates(
                    (candidate, done) => bundle.load(candidate, SpriteFrame, done),
                    this._getSpriteFrameLoadCandidates(path),
                    (sf) => {
                        if (!sf) {
                            console.warn(`[remote] startup texture load failed: ${path}`, 'SpriteFrame not found');
                        } else {
                            this._cacheSpriteFrame(sf, fallbackName);
                            loaded += 1;
                        }
                        finishOne();
                    },
                );
            }
        },

        _getRemoteTextureCandidatePaths(imgName: string): string[] {
            return REMOTE_TEXTURE_SEARCH_DIRS.flatMap((dir) => this._getSpriteFrameLoadCandidates(`${dir}/${imgName}`));
        },

        _getBootstrapTextureCandidatePaths(imgName: string): string[] {
            return this._getSpriteFrameLoadCandidates(`${LOCAL_BOOTSTRAP_TEXTURE_DIR}/${imgName}`);
        },

        _loadSpriteFrameFromBootstrapBundle(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            this._withBootstrapBundle((bundle) => {
                if (!bundle) {
                    callback(null);
                    return;
                }
                const candidates = this._getBootstrapTextureCandidatePaths(imgName);
                this._loadSpriteFrameWithCandidates(
                    (candidate, done) => bundle.load(candidate, SpriteFrame, done),
                    candidates,
                    callback,
                );
            });
        },

        _loadSpriteFrameFromBootstrapThenRemote(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            this._loadSpriteFrameFromBootstrapBundle(imgName, (sf) => {
                if (sf) {
                    callback(sf);
                    return;
                }
                this._loadSpriteFrameFromRemoteBundle(imgName, callback);
            });
        },

        _withBootstrapBundle(callback: (bundle: Bundle | null) => void) {
            if (this.bootstrapBundle) {
                callback(this.bootstrapBundle);
                return;
            }
            if (this._bootstrapBundleLoadingCallbacks) {
                this._bootstrapBundleLoadingCallbacks.push(callback);
                return;
            }
            this._bootstrapBundleLoadingCallbacks = [callback];
            console.log('[bootstrap] loadBundle start');
            assetManager.loadBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME, (err, bundle) => {
                if (err || !bundle) {
                    console.warn('[bootstrap] loadBundle failed:', err?.message || 'no bundle');
                } else {
                    console.log('[bootstrap] loadBundle success');
                    this.bootstrapBundle = bundle;
                }
                const callbacks = this._bootstrapBundleLoadingCallbacks || [];
                this._bootstrapBundleLoadingCallbacks = null;
                for (const done of callbacks) {
                    done(bundle || null);
                }
            });
        },

        _withRemoteBundle(callback: (bundle: Bundle | null) => void) {
            if (this.remoteBundle) {
                callback(this.remoteBundle);
                return;
            }
            if (this._preloadingBundle) {
                const check = () => {
                    if (this.remoteBundle) {
                        this.unschedule(check);
                        callback(this.remoteBundle);
                        return;
                    }
                    if (!this._preloadingBundle) {
                        this.unschedule(check);
                        callback(null);
                    }
                };
                this.schedule(check, 0.05);
                return;
            }
            this._preloadingBundle = true;
            assetManager.loadBundle('remote', (err, bundle) => {
                this._preloadingBundle = false;
                if (err || !bundle) {
                    console.warn('loadBundle remote failed:', err?.message);
                    callback(null);
                    return;
                }
                this.remoteBundle = bundle;
                callback(bundle);
            });
        },

        _loadSpriteFrameFromRemoteBundle(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            this._withRemoteBundle((bundle) => {
                if (!bundle) {
                    callback(null);
                    return;
                }
                const candidates = this._getRemoteTextureCandidatePaths(imgName);
                this._loadSpriteFrameWithCandidates(
                    (candidate, done) => bundle.load(candidate, SpriteFrame, done),
                    candidates,
                    (sf) => {
                        if (!sf) {
                            console.warn(`[remote] SpriteFrame not found: ${imgName}`);
                        }
                        callback(sf);
                    },
                );
            });
        },

        _loadSpriteFrameByName(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            const cached = this.getSF(imgName);
            if (cached) {
                callback(cached);
                return;
            }
            const waiters = this._pendingSpriteFrameLoads.get(imgName);
            if (waiters) {
                waiters.push(callback);
                return;
            }
            this._pendingSpriteFrameLoads.set(imgName, [callback]);
            const resolve = (sf: SpriteFrame | null) => {
                if (sf) {
                    this._cacheSpriteFrame(sf, imgName);
                }
                const callbacks = this._pendingSpriteFrameLoads.get(imgName) || [];
                this._pendingSpriteFrameLoads.delete(imgName);
                for (const done of callbacks) {
                    done(sf);
                }
            };
            if (this.shouldUseLocalBootstrapTexture(imgName)) {
                this._loadSpriteFrameFromBootstrapThenRemote(imgName, resolve);
                return;
            }
            this._loadSpriteFrameFromRemoteBundle(imgName, resolve);
        },

        _ensureSpriteFramesByName(names: string[], callback: () => void) {
            const missingNames = names.filter((name) => !this.getSF(name));
            if (missingNames.length === 0) {
                callback();
                return;
            }
            let remaining = missingNames.length;
            const finishOne = () => {
                remaining -= 1;
                if (remaining > 0) return;
                callback();
            };
            for (const name of missingNames) {
                this._loadSpriteFrameByName(name, () => {
                    finishOne();
                });
            }
        },

        _openPanelAfterTextures(
            panelKey: string,
            textureNames: string[],
            isAlreadyOpen: () => boolean,
            open: () => void,
        ) {
            if (isAlreadyOpen() || this._panelOpenInFlight.has(panelKey)) return;
            this._panelOpenInFlight.add(panelKey);
            this._ensureSpriteFramesByName(textureNames, () => {
                this._panelOpenInFlight.delete(panelKey);
                if (isAlreadyOpen()) return;
                open();
            });
        },

        _releaseCachedSpriteFrames(names: string[], reason: string) {
            const uniqueNames = Array.from(new Set(names));
            let evicted = 0;
            for (const name of uniqueNames) {
                const sf = this.sfCache.get(name);
                if (!sf) continue;
                this.sfCache.delete(name);
                evicted += 1;
            }
            if (evicted > 0) {
                console.log(`[Memory] evicted ${evicted} panel SpriteFrames from local cache: ${reason}`);
            }
        },

        _releasePanelTexturesNextFrame(names: string[], reason: string) {
            this.scheduleOnce(() => this._releaseCachedSpriteFrames(names, reason), 0);
        },

        _clearSpriteFramesBeforeDestroy(root: Node) {
            if (!root?.isValid) return;
            const sprites = root.getComponentsInChildren(Sprite);
            for (const sp of sprites) {
                sp.spriteFrame = null;
            }
        },

        _destroyPanelAndReleaseTextures(panel: Node, names: string[], reason: string) {
            if (!panel?.isValid) return;
            this._clearSpriteFramesBeforeDestroy(panel);
            panel.destroy();
            this.scheduleOnce(() => this._releasePanelTexturesNextFrame(names, reason), 0.05);
        },

        /** 检查豆豆 SpriteFrame 是否已加载 */
        needsBeanReRender(): boolean {
            return this.needsBeanFramesForLevelData(this.levelData);
        },

        normalizeBeanColorId(colorId: number): number | null {
            if (!Number.isFinite(colorId)) return null;
            const normalized = Math.floor(colorId);
            return normalized > 0 ? normalized : null;
        },

        getPinddColorKey(colorId: number): string | null {
            const safeColorId = this.normalizeBeanColorId(colorId);
            if (safeColorId === null) return null;
            const normalized = ((safeColorId - 1) % 21) + 1;
            const n = normalized < 10 ? `00${normalized}` : normalized < 100 ? `0${normalized}` : `${normalized}`;
            return `b${n}`;
        },

        getPinddBeanFrame(colorId: number, variant: 1 | 2 | 4): SpriteFrame | null {
            const key = this.getPinddColorKey(colorId);
            if (!key) return null;
            const cacheKey = `${key}_${variant}`;
            const cached = this.getSF(cacheKey) || null;
            if (cached) return cached;
            const atlasFrame = this._bootstrapAtlasFrameCache.get(cacheKey) || null;
            if (atlasFrame) return atlasFrame;
            console.error('[bean] required bean SpriteFrame missing:', cacheKey);
            return null;
        },

        getBoardSlotVisualSize(): number {
            return this.cellSize;
        },

        getBoardBeanVisualSize(): number {
            const slotSize = this.getBoardSlotVisualSize();
            const targetSize = Math.max(6, Math.round(slotSize * PINDD_BEAN_TO_SLOT_RATIO));
            // 主题挑战大图案会把 cell 压得很小；这里必须保证豆豆永远不大于格子，避免彼此重叠。
            const maxSafeSize = slotSize <= 10 ? Math.max(4, slotSize - 1) : slotSize;
            return Math.max(4, Math.min(targetSize, maxSafeSize));
        },

        getMaxSlotRows(): number {
            if (this._isThemeLevel) return DEFAULT_MAX_SLOT_ROWS;
            return this.shouldUseMainlineSlotUI() ? MAINLINE_MAX_SLOT_ROWS : DEFAULT_MAX_SLOT_ROWS;
        },

        getSlotRowSpacing(): number {
            if (this.shouldUseMainlineSlotUI()) {
                const sceneRowSpacing = Number(this._slotAreaSceneRowSpacing);
                return Number.isFinite(sceneRowSpacing) && sceneRowSpacing > 0 ? sceneRowSpacing : MAINLINE_SLOT_ROW_SPACING;
            }
            return SLOT_ROW_SPACING;
        },

        getSlotRowBgHeight(): number {
            return this.shouldUseMainlineSlotUI() ? MAINLINE_SLOT_ROW_BG_HEIGHT : SLOT_ROW_BG_HEIGHT;
        },

        getSlotCenterSpacing(): number {
            return this.shouldUseMainlineSlotUI() ? MAINLINE_SLOT_CENTER_SPACING : (SLOT_SIZE + SLOT_GAP);
        },

        getSlotBeanVisualSize(): number {
            return this.shouldUseMainlineSlotUI() ? 36 : SLOT_SIZE;
        },

        getSlotAreaScale(): number {
            return this.shouldUseMainlineSlotUI() ? 0.9 : SLOT_AREA_SCALE;
        },

        getSlotAreaVisualHeight(): number {
            const slotController = this._gameplaySlotUiController;
            if (slotController?.getSlotAreaVisualHeight) {
                return slotController.getSlotAreaVisualHeight();
            }
            const panelHeight = (this.slotRowCount - 1) * this.getSlotRowSpacing() + this.getSlotRowBgHeight();
            const panelExtraHeight = this.shouldUseMainlineSlotUI() ? MAINLINE_SLOT_PANEL_EXTRA_HEIGHT : 14;
            return (panelHeight + panelExtraHeight) * this.getSlotAreaScale();
        },

        getSkillAreaTopY(): number {
            return ensureGameplaySkillUiController(this).getSkillAreaTopY();
        },

        getSlotRowY(rowIndex: number, rowCount: number = this.slotRowCount): number {
            const rowSpacing = this.getSlotRowSpacing();
            return (rowCount - 1) / 2 * rowSpacing - rowIndex * rowSpacing;
        },

        getSlotLocalPosition(index: number, rowCount: number = this.slotRowCount): Vec3 {
            const slotController = this._gameplaySlotUiController;
            if (slotController?.getSlotLocalPosition) {
                return slotController.getSlotLocalPosition(index, rowCount);
            }
            const row = Math.floor(index / SLOTS_PER_ROW);
            const col = index % SLOTS_PER_ROW;
            const x = (col - SLOTS_PER_ROW / 2 + 0.5) * this.getSlotCenterSpacing();
            return new Vec3(x, this.getSlotRowY(row, rowCount), 0);
        },

        setNodeSquareSize(node: Node, size: number) {
            node.getComponent(UITransform)?.setContentSize(size, size);
        },

        /** 通过颜色 ID 获取豆豆精灵图（pindd 可移动态） */
        getBeanSpriteFrame(colorId: number, locked: boolean): SpriteFrame | null {
            return this.getPinddBeanFrame(colorId, locked ? 1 : 2);
        },

        /** 通过颜色 ID 获取棋盘底槽精灵图 */
        getSlotSpriteFrame(colorId: number): SpriteFrame | null {
            return this.getPinddBeanFrame(colorId, 4);
        },

        getBrightSpriteFrame(): SpriteFrame | null {
            return this.getSF('block_bright_pindd');
        },

        shouldUseLocalBootstrapBundle(levelId: number, prefix: string = LOCAL_BOOTSTRAP_LEVEL_PREFIX): boolean {
            return LOCAL_BOOTSTRAP_LEVEL_IDS.has(levelId) && prefix === LOCAL_BOOTSTRAP_LEVEL_PREFIX;
        },

        shouldUseLocalBootstrapTexture(imgName: string, levelId: number = this.levelData?.levelId || 0): boolean {
            if (LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES.has(imgName)) {
                return true;
            }
            return this.shouldUseLocalBootstrapBundle(levelId) && LOCAL_BOOTSTRAP_TEXTURE_NAMES.has(imgName);
        },

        attachBrightOverlay(parent: Node, size: number, opacity: number, scale: number = 1.08): Node | null {
            const bright = this.getBrightSpriteFrame();
            if (!bright) return null;
        
            const glow = new Node('BrightOverlay');
            parent.addChild(glow);
            glow.addComponent(UITransform).setContentSize(size, size);
            glow.layer = Layers.Enum.UI_2D;
            glow.setPosition(0, 0, 0);
            glow.setScale(scale, scale, 1);
        
            const sp = glow.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = bright;
        
            const uo = glow.addComponent(UIOpacity);
            uo.opacity = opacity;
            return glow;
        },

        acquireFlyBeanNode(name: string, size: number, spriteFrame: SpriteFrame | null): Node {
            const bean = this._flyBeanPool.get() ?? new Node('PooledFlyBean');
            bean.name = name;
            bean.layer = Layers.Enum.UI_2D;
            let transform = bean.getComponent(UITransform);
            if (!transform) transform = bean.addComponent(UITransform);
            transform.setContentSize(size, size);
        
            let sprite = bean.getComponent(Sprite);
            if (!sprite) sprite = bean.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = spriteFrame;
            sprite.enabled = true;
        
            const glowSize = size + Math.max(10, Math.round(size * 0.18));
            let glow = bean.getChildByName('BrightOverlay');
            if (!glow) {
                glow = this.attachBrightOverlay(bean, glowSize, 150, 1.04);
            } else {
                glow.layer = Layers.Enum.UI_2D;
                glow.getComponent(UITransform)?.setContentSize(glowSize, glowSize);
                glow.setPosition(0, 0, 0);
                glow.setScale(1.04, 1.04, 1);
                const glowOpacity = glow.getComponent(UIOpacity);
                if (glowOpacity) glowOpacity.opacity = 150;
                const glowSprite = glow.getComponent(Sprite);
                if (glowSprite) {
                    glowSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    glowSprite.spriteFrame = this.getBrightSpriteFrame();
                }
            }
            if (glow) {
                glow.active = !!this.getBrightSpriteFrame();
                glow.setSiblingIndex(0);
            }
        
            bean.active = true;
            bean.setScale(1, 1, 1);
            return bean;
        },

        recycleFlyBeanNode(bean: Node) {
            Tween.stopAllByTarget(bean);
            const sprite = bean.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = null;
            bean.active = false;
            if (this.getNodePoolSize(this._flyBeanPool) >= MAX_FLY_BEAN_POOL_SIZE) {
                bean.destroy();
                return;
            }
            this._flyBeanPool.put(bean);
        },

        acquireEffectNode(pool: NodePool, name: string, size: number): { node: Node; sprite: Sprite; opacity: UIOpacity } {
            const fx = pool.get() ?? new Node('PooledEffect');
            fx.name = name;
            fx.layer = Layers.Enum.UI_2D;
            let transform = fx.getComponent(UITransform);
            if (!transform) transform = fx.addComponent(UITransform);
            transform.setContentSize(size, size);
        
            let sprite = fx.getComponent(Sprite);
            if (!sprite) sprite = fx.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = null;
            sprite.enabled = true;
        
            let opacity = fx.getComponent(UIOpacity);
            if (!opacity) opacity = fx.addComponent(UIOpacity);
            opacity.opacity = 255;
        
            fx.active = true;
            fx.angle = 0;
            fx.setScale(1, 1, 1);
            return { node: fx, sprite, opacity };
        },

        recycleEffectNode(pool: NodePool, fx: Node) {
            Tween.stopAllByTarget(fx);
            const opacity = fx.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            const sprite = fx.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = null;
            fx.active = false;
            if (this.getNodePoolSize(pool) >= this.getEffectPoolLimit(pool)) {
                fx.destroy();
                return;
            }
            pool.put(fx);
        },

        clearEffectPools() {
            this._flyBeanPool.clear();
            this._frameFxPool.clear();
            this._brightFlashPool.clear();
            this._effectFrameCache.clear();
            this._activeFrameFxCount = 0;
        },

        getNodePoolSize(pool: NodePool): number {
            const size = (pool as any).size;
            return typeof size === 'function' ? Math.max(0, Number(size.call(pool)) || 0) : 0;
        },

        getEffectPoolLimit(pool: NodePool): number {
            if (pool === this._frameFxPool) return MAX_FRAME_FX_POOL_SIZE;
            if (pool === this._brightFlashPool) return MAX_BRIGHT_FLASH_POOL_SIZE;
            return MAX_FRAME_FX_POOL_SIZE;
        },

        getEffectFrames(prefix: string, frameCount: number): SpriteFrame[] {
            const key = `${prefix}${frameCount}`;
            const cached = this._effectFrameCache.get(key);
            if (cached) return cached;
            const frames: SpriteFrame[] = [];
            for (let i = 1; i <= frameCount; i++) {
                const frameNo = i < 10 ? `0${i}` : `${i}`;
                const sf = this.getSF(`${prefix}${frameNo}`);
                if (sf) frames.push(sf);
            }
            if (frames.length > 0) {
                this._effectFrameCache.set(key, frames);
            } else {
                this.ensureEffectsAtlasLoadedForNextUse();
            }
            return frames;
        },

        getSavedLevel(): number {
            const s = sys.localStorage.getItem(LS_LEVEL);
            return s ? Math.max(1, parseInt(s) || 1) : 1;
        },

        getLocalUserStateUpdatedAt(): number {
            const raw = sys.localStorage.getItem(LS_USER_STATE_UPDATED_AT);
            const value = raw ? parseInt(raw) : 0;
            return Number.isFinite(value) && value > 0 ? value : 0;
        },

        setLocalUserStateUpdatedAt(timestamp: number): void {
            const normalized = Math.max(0, Math.floor(Number(timestamp) || 0));
            sys.localStorage.setItem(LS_USER_STATE_UPDATED_AT, normalized.toString());
        },

        hasPlayedBefore(): boolean {
            return sys.localStorage.getItem(LS_LEVEL) !== null;
        },

        hasLocalUserState(): boolean {
            return this.hasPlayedBefore() || this.getLocalUserStateUpdatedAt() > 0;
        },

        saveLevelProgress(levelId: number) {
            sys.localStorage.setItem(LS_LEVEL, '' + levelId);
            UserMgr.inst.markLevelProgress(levelId);
            this.queueCloudGameStateSync();
            void LeaderboardMgr.inst.submitProgress(levelId, UserMgr.inst.getProfile());
        },

        captureCloudGameState(): CloudGameState {
            return {
                savedLevel: this.getSavedLevel(),
                vigor: this.getVigor(),
                vigorTime: this.getVigorTime(),
                gold: this.getGold(),
                expandSlotCount: this.getPropCount('expand'),
                magicWandCount: this.getPropCount('wand'),
                brushCount: this.getPropCount('brush'),
                magnetCount: this.getPropCount('magnet'),
                dailySignInClaimedCount: this.getDailySignInClaimedCount(),
                dailySignInLastClaimDateKey: this.getDailySignInLastClaimDateKey(),
                themeUnlockedIds: Array.from(this.getThemeUnlockedSet()).sort((a, b) => a - b),
                themeCompletedIds: Array.from(this.getThemeCompletedSet()).sort((a, b) => a - b),
                stateUpdatedAt: this.getLocalUserStateUpdatedAt(),
            };
        },

        queueCloudGameStateSync(): void {
            const timestamp = Date.now();
            this.setLocalUserStateUpdatedAt(timestamp);
            const state = this.captureCloudGameState();
            state.stateUpdatedAt = timestamp;
            UserStateSyncMgr.inst.queueSave({
                profile: UserMgr.inst.getCloudProfile(),
                gameState: state,
            });
        },

        async restoreUserStateFromCloud(hadLocalUserState: boolean): Promise<UserStateRestoreStatus> {
            if (!UserStateSyncMgr.inst.canUseCloud()) {
                return 'skipped';
            }
        
            const timeoutMs = hadLocalUserState
                ? CLOUD_STATE_RESTORE_TIMEOUT_MS
                : CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS;
            const timeoutTag = Symbol('restore-timeout');
            const loadPromise = UserStateSyncMgr.inst.loadState();
            const restoreResult = await Promise.race([
                loadPromise,
                new Promise<typeof timeoutTag>((resolve) => {
                    this.scheduleOnce(() => resolve(timeoutTag), timeoutMs / 1000);
                }),
            ]);
        
            if (restoreResult === timeoutTag) {
                console.warn('[GameCtrl] restoreUserStateFromCloud timed out after', timeoutMs, 'ms');
                void loadPromise.then((lateState) => {
                    applyLateCloudUserStateToRuntime(this, lateState, hadLocalUserState);
                }).catch((error) => {
                    console.warn('[GameCtrl] late cloud user state restore failed:', error);
                });
                return 'timeout';
            }
            if (!restoreResult) {
                return 'failed';
            }
        
            return this.applyCloudUserState(restoreResult);
        },

        applyLateCloudUserState(state: CloudUserState | null, hadLocalUserState: boolean): void {
            applyLateCloudUserStateToRuntime(this, state, hadLocalUserState);
        },

        applyCloudUserState(restoreResult: CloudUserState): UserStateRestoreStatus {
            const { profile, gameState } = restoreResult;
            if (!profile && !gameState) {
                return 'empty';
            }
        
            if (profile) {
                UserMgr.inst.applyCloudProfile(profile);
            }
        
            if (!gameState) {
                return 'restored';
            }
        
            const cloudSavedLevel = Math.floor(Number(gameState.savedLevel) || 0);
            const forceCloudLevelReset = typeof gameState.savedLevel === 'number' && cloudSavedLevel <= 0;
            const cloudUpdatedAt = Math.max(0, Math.floor(Number(gameState.stateUpdatedAt) || 0));
            const localUpdatedAt = this.getLocalUserStateUpdatedAt();
            if (!forceCloudLevelReset && cloudUpdatedAt > 0 && localUpdatedAt > cloudUpdatedAt) {
                console.log('[GameCtrl] local user state is newer than cloud, skip restore');
                return 'restored';
            }
        
            if (forceCloudLevelReset) {
                sys.localStorage.setItem(LS_LEVEL, '1');
                UserMgr.inst.markLevelProgress(1);
            } else if (typeof gameState.savedLevel === 'number' && gameState.savedLevel > 0) {
                sys.localStorage.setItem(LS_LEVEL, String(Math.floor(gameState.savedLevel)));
            }
            if (typeof gameState.vigor === 'number') {
                sys.localStorage.setItem((this.constructor as any).LS_VIGOR, String(Math.max(0, Math.floor(gameState.vigor))));
            }
            if (typeof gameState.vigorTime === 'number') {
                sys.localStorage.setItem((this.constructor as any).LS_VIGOR_TIME, String(Math.max(0, Math.floor(gameState.vigorTime))));
            }
            if (typeof gameState.gold === 'number') {
                sys.localStorage.setItem(LS_GOLD, String(Math.max(0, Math.floor(gameState.gold))));
            }
            if (typeof gameState.expandSlotCount === 'number') {
                sys.localStorage.setItem(LS_PROP_EXPAND, String(Math.max(0, Math.floor(gameState.expandSlotCount))));
            }
            if (typeof gameState.magicWandCount === 'number') {
                sys.localStorage.setItem(LS_PROP_WAND, String(Math.max(0, Math.floor(gameState.magicWandCount))));
            }
            if (typeof gameState.brushCount === 'number') {
                sys.localStorage.setItem(LS_PROP_BRUSH, String(Math.max(0, Math.floor(gameState.brushCount))));
            }
            if (typeof gameState.magnetCount === 'number') {
                sys.localStorage.setItem(LS_PROP_MAGNET, String(Math.max(0, Math.floor(gameState.magnetCount))));
            }
            if (typeof gameState.dailySignInClaimedCount === 'number') {
                sys.localStorage.setItem(LS_DAILY_SIGNIN_COUNT, String(Math.max(0, Math.floor(gameState.dailySignInClaimedCount))));
            }
            if (typeof gameState.dailySignInLastClaimDateKey === 'number') {
                sys.localStorage.setItem(LS_DAILY_SIGNIN_LAST_DATE_KEY, String(Math.max(0, Math.floor(gameState.dailySignInLastClaimDateKey))));
            }
            if (Array.isArray(gameState.themeUnlockedIds)) {
                const ids = gameState.themeUnlockedIds
                    .map((value) => Math.floor(Number(value) || 0))
                    .filter((value) => value > 0);
                sys.localStorage.setItem(this.getThemeUnlockKey(), JSON.stringify(Array.from(new Set(ids))));
            }
            if (Array.isArray(gameState.themeCompletedIds)) {
                const ids = gameState.themeCompletedIds
                    .map((value) => Math.floor(Number(value) || 0))
                    .filter((value) => value > 0);
                sys.localStorage.setItem(LS_THEME_COMPLETED, JSON.stringify(Array.from(new Set(ids))));
            }
            if (cloudUpdatedAt > 0) {
                this.setLocalUserStateUpdatedAt(cloudUpdatedAt);
            }
            this.refreshGoldUI();
            return 'restored';
        },

        bindUserStateLifecycle(): void {
            if (this._userStateLifecycleBound) {
                return;
            }
            this._userStateLifecycleBound = true;
            game.on(Game.EVENT_HIDE, this.handleGameHideFlushUserState, this);
            game.on(Game.EVENT_SHOW, this.handleGameShowLifecycle, this);
        },

        unbindUserStateLifecycle(): void {
            if (!this._userStateLifecycleBound) {
                return;
            }
            this._userStateLifecycleBound = false;
            game.off(Game.EVENT_HIDE, this.handleGameHideFlushUserState, this);
            game.off(Game.EVENT_SHOW, this.handleGameShowLifecycle, this);
            this._pendingPostAdSkillAction = null;
        },

        handleGameHideFlushUserState(): void {
            this._gameForeground = false;
            void UserStateSyncMgr.inst.flushPendingSave();
        },

        handleGameShowLifecycle(): void {
            this._gameForeground = true;
            const pendingAction = this._pendingPostAdSkillAction;
            if (!pendingAction) {
                return;
            }
            this._pendingPostAdSkillAction = null;
            this.scheduleOnce(() => {
                if (!this.isValid) return;
                pendingAction();
            }, 0.08);
        },
    });
}
