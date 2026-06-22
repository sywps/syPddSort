import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, DAILY_SIGNIN_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, POPUP_UI_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, RESOURCE_ACQUIRE_RELEASE_TEXTURE_NAMES,
    RESOURCE_ACQUIRE_TEXTURE_NAMES, RESULT_PANEL_TEXTURE_NAMES, REWARD_RESULT_RELEASE_TEXTURE_NAMES, REWARD_RESULT_TEXTURE_NAMES, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_TEXTURE_SEARCH_DIRS, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, THEME_PANEL_RELEASE_TEXTURE_NAMES, THEME_PANEL_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY, MAINLINE_SLOT_LOCK_DASH_ALPHA,
    MAINLINE_SLOT_LOCK_ROW_WIDTH, MAINLINE_SLOT_LOCK_ROW_HEIGHT, MAINLINE_SLOT_PANEL_TEXTURE, MAINLINE_SLOT_GROOVE_TEXTURE, MAINLINE_SLOT_TEXTURE_NAMES, SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, GAME_ASSETS_BUNDLE_NAME, LEVEL_DATA_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_DAILY_SIGNIN_COUNT, LS_DAILY_SIGNIN_LAST_DATE_KEY, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, FIRST_LEVEL_ROUTE_EXPERIMENT_ID, FIRST_LEVEL_ROUTE_WX_TIMEOUT_MS, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
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
import { ensureGameplaySkillUiController } from '../GameplaySkillUiController';
import { LevelDataCdnService } from '../LevelDataCdnService';
import { applyLateCloudUserStateToRuntime, deferCloudGameStateSyncDuringStartup, deferLeaderboardProgressDuringStartup, resolveStartupCloudRestorePending } from './StartupCloudRestoreHelper';
import { debugPerfSnapshot, debugPerfTrace } from '../DebugPerfTrace';
import { AppRoot } from '../AppRoot';

const SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP = 'startup-bootstrap';
const SPRITE_FRAME_SCOPE_SCENE_HOME = 'scene-home';
const SPRITE_FRAME_SCOPE_SCENE_GAME = 'scene-game';
const SPRITE_FRAME_SCOPE_SHARED_UI = 'shared-ui';
const SPRITE_FRAME_SCOPE_DYNAMIC = 'dynamic';
const MAX_CONCURRENT_SPRITE_FRAME_LOADS = 4;

const SCENE_HOME_SPRITE_FRAME_NAMES = new Set<string>(HOME_MENU_TEXTURE_NAMES);
const SCENE_GAME_SPRITE_FRAME_NAMES = new Set<string>([
    ...GAMEPLAY_SLOT_TEXTURE_NAMES,
    ...SKILL_BUTTON_TEXTURE_NAMES,
]);
const SHARED_UI_SPRITE_FRAME_NAMES = new Set<string>([
    ...POPUP_UI_TEXTURE_NAMES,
    ...GOLD_SHOP_TEXTURE_NAMES,
    ...RESOURCE_ACQUIRE_TEXTURE_NAMES,
    ...DAILY_SIGNIN_TEXTURE_NAMES,
    ...RECOVER_VIGOR_TEXTURE_NAMES,
    ...REWARD_RESULT_TEXTURE_NAMES,
    ...RESULT_PANEL_TEXTURE_NAMES,
    ...SETTINGS_PANEL_TEXTURE_NAMES,
    ...LEADERBOARD_TEXTURE_NAMES,
    ...COLLECTION_TEXTURE_NAMES,
    ...THEME_PANEL_TEXTURE_NAMES,
]);

export function installAssetBootstrapModule(target: any): void {
    Object.assign(target, {
        _cacheSpriteFrame(
            sf: SpriteFrame | null,
            fallbackName?: string,
            options: { releaseMode?: 'asset' | 'dynamic'; imageAsset?: ImageAsset | null; texture?: Texture2D | null; scope?: string } = {},
        ) {
            if (!sf) return;
            const fileName = sf.name || fallbackName;
            if (!fileName) return;
            this.sfCache.set(fileName, sf);
            const prevMeta = this._spriteFrameCacheMeta.get(fileName) || null;
            const taggedMode = (sf as any).__pddReleaseMode;
            const releaseMode = options.releaseMode || (taggedMode === 'dynamic' ? 'dynamic' : 'asset');
            const taggedImageAsset = (sf as any).__pddSourceImageAsset;
            const taggedTexture = (sf as any).__pddOwnedTexture;
            const owners = prevMeta?.owners instanceof Set ? prevMeta.owners : new Set<string>();
            const retainCount = Number.isFinite(prevMeta?.retainCount) ? Number(prevMeta.retainCount) : owners.size;
            this._spriteFrameCacheMeta.set(fileName, {
                releaseMode,
                imageAsset: options.imageAsset ?? taggedImageAsset ?? null,
                texture: options.texture ?? taggedTexture ?? null,
                scope: this._inferSpriteFrameScope(fileName, options.scope || prevMeta?.scope),
                owners,
                retainCount,
            });
        },

        _inferSpriteFrameScope(name: string, explicitScope?: string): string {
            if (explicitScope) return explicitScope;
            if (LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES.has(name) || LOCAL_BOOTSTRAP_TEXTURE_NAMES.has(name)) {
                return SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP;
            }
            if (SCENE_GAME_SPRITE_FRAME_NAMES.has(name)) {
                return SPRITE_FRAME_SCOPE_SCENE_GAME;
            }
            if (SCENE_HOME_SPRITE_FRAME_NAMES.has(name)) {
                return SPRITE_FRAME_SCOPE_SCENE_HOME;
            }
            if (SHARED_UI_SPRITE_FRAME_NAMES.has(name)) {
                return SPRITE_FRAME_SCOPE_SHARED_UI;
            }
            return SPRITE_FRAME_SCOPE_DYNAMIC;
        },

        _getSpriteFrameCacheMetaEntry(name: string, createIfMissing: boolean = false, explicitScope?: string) {
            let meta = this._spriteFrameCacheMeta.get(name) || null;
            if (!meta && createIfMissing) {
                meta = {
                    releaseMode: 'asset',
                    imageAsset: null,
                    texture: null,
                    scope: this._inferSpriteFrameScope(name, explicitScope),
                    owners: new Set<string>(),
                    retainCount: 0,
                };
                this._spriteFrameCacheMeta.set(name, meta);
            } else if (meta && explicitScope && meta.scope !== explicitScope) {
                meta.scope = explicitScope;
            }
            if (meta && !(meta.owners instanceof Set)) {
                meta.owners = new Set<string>();
            }
            if (meta && !Number.isFinite(meta.retainCount)) {
                meta.retainCount = meta.owners.size;
            }
            return meta;
        },

        _getPanelTextureOwnerKey(panelKey: string): string {
            return `panel:${panelKey}`;
        },

        _retainPanelTextureOwner(panelKey: string, names: string[], scope: string = SPRITE_FRAME_SCOPE_SHARED_UI) {
            const owner = this._getPanelTextureOwnerKey(panelKey);
            const uniqueNames = Array.from(new Set(names));
            let retainedNames = 0;
            for (const name of uniqueNames) {
                if (!this.getSF(name)) continue;
                retainedNames += 1;
                const meta = this._getSpriteFrameCacheMetaEntry(name, true, scope);
                if (!meta.owners.has(owner)) {
                    meta.owners.add(owner);
                    meta.retainCount = (Number(meta.retainCount) || 0) + 1;
                }
            }
            debugPerfSnapshot('panel.texture.retain', this, {
                panelKey,
                owner,
                requestedNames: uniqueNames.length,
                retainedNames,
                scope,
            });
        },

        _releaseSpriteFrameOwner(owner: string, reason: string) {
            if (!owner) return;
            let released = 0;
            for (const [name, meta] of this._spriteFrameCacheMeta.entries()) {
                if (!(meta?.owners instanceof Set) || !meta.owners.has(owner)) continue;
                meta.owners.delete(owner);
                meta.retainCount = Math.max(0, (Number(meta.retainCount) || 0) - 1);
                if (meta.retainCount === 0 && this._canAutoReleaseSpriteFrameScope(meta.scope, reason)) {
                    if (this._releaseSpriteFrameCacheEntry(name, reason)) {
                        released += 1;
                    }
                }
            }
            if (released > 0) {
                console.log(`[Memory] released ${released} owner-held SpriteFrames: ${reason}`);
            }
        },

        _releasePanelTextureOwner(panelKey: string, reason: string) {
            const owner = this._getPanelTextureOwnerKey(panelKey);
            debugPerfSnapshot('panel.texture.release.before', this, {
                panelKey,
                owner,
                reason,
            });
            this._releaseSpriteFrameOwner(owner, reason);
            debugPerfSnapshot('panel.texture.release.after', this, {
                panelKey,
                owner,
                reason,
            });
        },

        _isRuntimeAliveForAsyncCallback(): boolean {
            return !!this?.isValid && !!this.node?.isValid;
        },

        _canAutoReleaseSpriteFrameScope(scope: string, reason: string): boolean {
            if (scope === SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP) {
                return reason.includes('runtime-destroy');
            }
            if (scope === SPRITE_FRAME_SCOPE_SHARED_UI) {
                return reason.includes('runtime-destroy');
            }
            if (scope === SPRITE_FRAME_SCOPE_SCENE_HOME || scope === SPRITE_FRAME_SCOPE_SCENE_GAME) {
                return reason.includes('scene-destroy') || reason.includes('runtime-destroy');
            }
            return true;
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

        _getRoutedBundle(bundleName: string): Bundle | null {
            try {
                return AppRoot.tryGet()?.session.getRoutedBundle(bundleName) || null;
            } catch (_) {
                return null;
            }
        },

        _preloadGameAssetsTextureSet(bundle: Bundle, onDone?: () => void, paths: string[] = GAME_ASSETS_PRELOAD_TEXTURE_PATHS) {
            if (paths.length === 0) {
                if (onDone) onDone();
                return;
            }
            let remaining = paths.length;
            let loaded = 0;
            const finishOne = () => {
                remaining -= 1;
                if (remaining > 0) return;
                console.log(`[gameAssets] preloaded ${loaded}/${paths.length} startup SpriteFrames`);
                if (onDone) onDone();
            };
            for (const path of paths) {
                const fallbackName = path.slice(path.lastIndexOf('/') + 1);
                this._loadSpriteFrameWithCandidates(
                    (candidate, done) => bundle.load(candidate, SpriteFrame, done),
                    this._getSpriteFrameLoadCandidates(path),
                    (sf) => {
                        if (!sf) {
                            console.warn(`[gameAssets] startup texture load failed: ${path}`, 'SpriteFrame not found');
                        } else {
                            this._cacheSpriteFrame(sf, fallbackName);
                            loaded += 1;
                        }
                        finishOne();
                    },
                );
            }
        },

        _getGameAssetsTextureCandidatePaths(imgName: string): string[] {
            return GAME_ASSETS_TEXTURE_SEARCH_DIRS.flatMap((dir) => this._getSpriteFrameLoadCandidates(`${dir}/${imgName}`));
        },

        _getGameAssetsImageAssetCandidatePaths(imgName: string): string[] {
            return GAME_ASSETS_TEXTURE_SEARCH_DIRS.map((dir) => `${dir}/${imgName}`);
        },

        _getBootstrapTextureBaseCandidates(imgName: string): string[] {
            const dirs = LOCAL_BOOTSTRAP_TEXTURE_NAMES.has(imgName)
                ? ['GameUI', LOCAL_BOOTSTRAP_TEXTURE_DIR]
                : [LOCAL_BOOTSTRAP_TEXTURE_DIR, 'GameUI'];
            return Array.from(new Set(dirs)).map((dir) => `${dir}/${imgName}`);
        },

        _getBootstrapTextureCandidatePaths(imgName: string): string[] {
            return this._getBootstrapTextureBaseCandidates(imgName)
                .flatMap((basePath) => this._getSpriteFrameLoadCandidates(basePath));
        },

        _getBootstrapImageAssetCandidatePaths(imgName: string): string[] {
            return this._getBootstrapTextureBaseCandidates(imgName);
        },

        _createSpriteFrameFromImageAsset(imgName: string, imgAsset: ImageAsset): SpriteFrame | null {
            const width = imgAsset.width || (imgAsset as any)?.image?.width || 0;
            const height = imgAsset.height || (imgAsset as any)?.image?.height || 0;
            if (!width || !height) {
                return null;
            }
            const texture = new Texture2D();
            texture.image = imgAsset;
            const sf = new SpriteFrame();
            sf.texture = texture;
            sf.rect = new Rect(0, 0, width, height);
            sf.name = imgName;
            (sf as any).__pddReleaseMode = 'dynamic';
            (sf as any).__pddOwnedTexture = texture;
            (sf as any).__pddSourceImageAsset = imgAsset;
            return sf;
        },

        _loadBootstrapImageSpriteFrame(bundle: Bundle, imgName: string, callback: (sf: SpriteFrame | null) => void) {
            const candidates = this._getBootstrapImageAssetCandidatePaths(imgName);
            const tryLoad = (index: number) => {
                if (index >= candidates.length) {
                    callback(null);
                    return;
                }
                bundle.load(candidates[index], ImageAsset, (err, imgAsset) => {
                    if (!err && imgAsset) {
                        const sf = this._createSpriteFrameFromImageAsset(imgName, imgAsset);
                        if (sf) {
                            callback(sf);
                            return;
                        }
                    }
                    tryLoad(index + 1);
                });
            };
            tryLoad(0);
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
                    (sf) => {
                        if (sf) {
                            callback(sf);
                            return;
                        }
                        this._loadBootstrapImageSpriteFrame(bundle, imgName, callback);
                    },
                );
            });
        },

        _loadSpriteFrameFromBootstrapThenRemote(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            this._loadSpriteFrameFromBootstrapBundle(imgName, (sf) => {
                if (sf) {
                    callback(sf);
                    return;
                }
                this._loadSpriteFrameFromGameAssetsBundle(imgName, callback);
            });
        },

        _withBootstrapBundle(callback: (bundle: Bundle | null) => void) {
            if (this.bootstrapBundle) {
                debugPerfSnapshot('bundle.bootstrap.reuse', this, {
                    bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                });
                callback(this.bootstrapBundle);
                return;
            }
            const routedBundle = this._getRoutedBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME);
            if (routedBundle) {
                this.bootstrapBundle = routedBundle;
                debugPerfSnapshot('bundle.bootstrap.seedFromRoute', this, {
                    bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                });
                callback(routedBundle);
                return;
            }
            if (this._bootstrapBundleLoadingCallbacks) {
                this._bootstrapBundleLoadingCallbacks.push(callback);
                debugPerfTrace('bundle.bootstrap.queue', {
                    bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                    waitingCallbacks: this._bootstrapBundleLoadingCallbacks.length,
                });
                return;
            }
            this._bootstrapBundleLoadingCallbacks = [callback];
            console.log('[bootstrap] loadBundle start');
            const startedAt = Date.now();
            debugPerfSnapshot('bundle.bootstrap.load.start', this, {
                bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
            });
            assetManager.loadBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME, (err, bundle) => {
                if (err || !bundle) {
                    console.warn('[bootstrap] loadBundle failed:', err?.message || 'no bundle');
                    debugPerfSnapshot('bundle.bootstrap.load.error', this, {
                        bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                        durationMs: Date.now() - startedAt,
                        error: err || new Error('no bundle'),
                    });
                } else {
                    console.log('[bootstrap] loadBundle success');
                    this.bootstrapBundle = bundle;
                    debugPerfSnapshot('bundle.bootstrap.load.success', this, {
                        bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                        durationMs: Date.now() - startedAt,
                    });
                }
                const callbacks = this._bootstrapBundleLoadingCallbacks || [];
                this._bootstrapBundleLoadingCallbacks = null;
                for (const done of callbacks) {
                    done(bundle || null);
                }
            });
        },

        prefetchLocalBootstrapStartupAssets(levelId: number, callback?: (ready: boolean) => void) {
            if (!this.shouldUseLocalBootstrapBundle(levelId, LOCAL_BOOTSTRAP_LEVEL_PREFIX)) {
                callback?.(false);
                return;
            }
            const bootstrapTextureNames = Array.from(LOCAL_BOOTSTRAP_TEXTURE_NAMES);
            const hasBootstrapTextures = bootstrapTextureNames.every((name) => this.sfCache.has(name));
            const alreadyReady =
                this._startupBootstrapPrefetchState === 'ready'
                && this._startupBootstrapPrefetchLevelId === levelId
                && this._bootstrapBeanAtlasReady
                && hasBootstrapTextures;
            if (alreadyReady) {
                callback?.(true);
                return;
            }
            if (
                this._startupBootstrapPrefetchState === 'loading'
                && this._startupBootstrapPrefetchLevelId === levelId
            ) {
                if (callback) {
                    const callbacks = this._startupBootstrapPrefetchCallbacks || [];
                    callbacks.push(callback);
                    this._startupBootstrapPrefetchCallbacks = callbacks;
                }
                return;
            }

            this._startupBootstrapPrefetchState = 'loading';
            this._startupBootstrapPrefetchLevelId = levelId;
            this._startupBootstrapPrefetchCallbacks = callback ? [callback] : [];

            let levelReady = false;
            let beanReady = false;
            let uiReady = false;
            let resolved = false;
            const finish = (ready: boolean) => {
                if (resolved) return;
                resolved = true;
                this._startupBootstrapPrefetchState = ready ? 'ready' : 'failed';
                const callbacks = this._startupBootstrapPrefetchCallbacks || [];
                this._startupBootstrapPrefetchCallbacks = null;
                for (const done of callbacks) {
                    done(ready);
                }
            };
            const tryFinish = () => {
                if (levelReady && beanReady && uiReady) {
                    finish(true);
                }
            };

            this._loadLocalLevelDataImpl(levelId, (data) => {
                if (!data) {
                    console.warn(`[bootstrap] startup prefetch level data missing: ${LOCAL_BOOTSTRAP_LEVEL_PREFIX}${levelId}`);
                    finish(false);
                    return;
                }
                levelReady = true;
                tryFinish();
            }, LOCAL_BOOTSTRAP_LEVEL_PREFIX);

            this._ensureBootstrapBeanAtlasLoaded(() => {
                beanReady = !!this._bootstrapBeanAtlasReady;
                if (!beanReady) {
                    console.warn('[bootstrap] startup prefetch bean atlas unavailable');
                    finish(false);
                    return;
                }
                tryFinish();
            });

            this._preloadBootstrapTextureSetStrict(bootstrapTextureNames, () => {
                uiReady = bootstrapTextureNames.every((name) => this.sfCache.has(name));
                if (!uiReady) {
                    const missingTextureNames = bootstrapTextureNames.filter((name) => !this.sfCache.has(name));
                    console.warn('[bootstrap] startup prefetch ui textures missing:', missingTextureNames);
                    finish(false);
                    return;
                }
                tryFinish();
            });
        },

        releaseStartupBootstrapPrefetchIfUnused(reason: string) {
            const releaseNow = () => {
                this._startupBootstrapPrefetchState = 'released';
                this._startupBootstrapPrefetchLevelId = 0;
                this._startupBootstrapPrefetchReleaseQueued = false;
            };

            if (this._startupBootstrapPrefetchState === 'loading') {
                if (!this._startupBootstrapPrefetchReleaseQueued) {
                    const callbacks = this._startupBootstrapPrefetchCallbacks || [];
                    callbacks.push((ready) => {
                        if (!this.node?.isValid) return;
                        if (ready) {
                            releaseNow();
                        } else {
                            this._startupBootstrapPrefetchState = 'failed';
                            this._startupBootstrapPrefetchLevelId = 0;
                            this._startupBootstrapPrefetchReleaseQueued = false;
                        }
                    });
                    this._startupBootstrapPrefetchCallbacks = callbacks;
                    this._startupBootstrapPrefetchReleaseQueued = true;
                }
                return;
            }
            if (this._startupBootstrapPrefetchState !== 'ready') {
                this._startupBootstrapPrefetchLevelId = 0;
                this._startupBootstrapPrefetchReleaseQueued = false;
                return;
            }
            releaseNow();
        },

        _flushGameAssetsBundleLoadingCallbacks(bundle: Bundle | null) {
            const callbacks = this._gameAssetsBundleLoadingCallbacks || [];
            this._gameAssetsBundleLoadingCallbacks = null;
            for (const done of callbacks) {
                done(bundle);
            }
        },

        _withGameAssetsBundle(callback: (bundle: Bundle | null) => void) {
            if (this.gameAssetsBundle) {
                if (!this._isRuntimeAliveForAsyncCallback()) return;
                debugPerfSnapshot('bundle.gameAssets.reuse', this, {
                    bundleName: GAME_ASSETS_BUNDLE_NAME,
                });
                callback(this.gameAssetsBundle);
                return;
            }
            if (this._gameAssetsBundleLoadingCallbacks) {
                this._gameAssetsBundleLoadingCallbacks.push(callback);
                debugPerfTrace('bundle.gameAssets.queue', {
                    bundleName: GAME_ASSETS_BUNDLE_NAME,
                    waitingCallbacks: this._gameAssetsBundleLoadingCallbacks.length,
                    preloadingGameAssetsBundle: !!this._preloadingBundle,
                });
                return;
            }
            if (this._preloadingBundle) {
                this._gameAssetsBundleLoadingCallbacks = [callback];
                debugPerfTrace('bundle.gameAssets.waitExisting', {
                    bundleName: GAME_ASSETS_BUNDLE_NAME,
                    waitingCallbacks: this._gameAssetsBundleLoadingCallbacks.length,
                });
                const check = () => {
                    if (!this._isRuntimeAliveForAsyncCallback()) {
                        this.unschedule(check);
                        this._gameAssetsBundleLoadingCallbacks = null;
                        debugPerfTrace('bundle.gameAssets.wait.abort.runtimeDead', {
                            bundleName: GAME_ASSETS_BUNDLE_NAME,
                        });
                        return;
                    }
                    if (this.gameAssetsBundle) {
                        this.unschedule(check);
                        debugPerfSnapshot('bundle.gameAssets.wait.success', this, {
                            bundleName: GAME_ASSETS_BUNDLE_NAME,
                        });
                        this._flushGameAssetsBundleLoadingCallbacks(this.gameAssetsBundle);
                        return;
                    }
                    if (!this._preloadingBundle) {
                        this.unschedule(check);
                        debugPerfSnapshot('bundle.gameAssets.wait.missing', this, {
                            bundleName: GAME_ASSETS_BUNDLE_NAME,
                        });
                        this._flushGameAssetsBundleLoadingCallbacks(null);
                    }
                };
                this.schedule(check, 0.05);
                return;
            }
            this._preloadingBundle = true;
            this._gameAssetsBundleLoadingCallbacks = [callback];
            const startedAt = Date.now();
            debugPerfSnapshot('bundle.gameAssets.load.start', this, {
                bundleName: GAME_ASSETS_BUNDLE_NAME,
            });
            assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                this._preloadingBundle = false;
                if (!this._isRuntimeAliveForAsyncCallback()) {
                    this._gameAssetsBundleLoadingCallbacks = null;
                    debugPerfTrace('bundle.gameAssets.load.abort.runtimeDead', {
                        bundleName: GAME_ASSETS_BUNDLE_NAME,
                        durationMs: Date.now() - startedAt,
                    });
                    return;
                }
                if (err || !bundle) {
                    console.warn('loadBundle gameAssets failed:', err?.message);
                    debugPerfSnapshot('bundle.gameAssets.load.error', this, {
                        bundleName: GAME_ASSETS_BUNDLE_NAME,
                        durationMs: Date.now() - startedAt,
                        error: err || new Error('no bundle'),
                    });
                    this._flushGameAssetsBundleLoadingCallbacks(null);
                    return;
                }
                this.gameAssetsBundle = bundle;
                debugPerfSnapshot('bundle.gameAssets.load.success', this, {
                    bundleName: GAME_ASSETS_BUNDLE_NAME,
                    durationMs: Date.now() - startedAt,
                });
                this._flushGameAssetsBundleLoadingCallbacks(bundle);
            });
        },

        _getWechatBuildMode(): string {
            const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
            const w: any = typeof window !== 'undefined' ? window : null;
            return String(g?.__PDD_WECHAT_BUILD_MODE__ || w?.__PDD_WECHAT_BUILD_MODE__ || '');
        },

        _isReleaseLevelDataCdnOnly(): boolean {
            return this._getWechatBuildMode() === 'release';
        },

        _withLevelDataBundle(callback: (bundle: Bundle | null) => void) {
            if (this.levelDataBundle) {
                callback(this.levelDataBundle);
                return;
            }
            if (this._levelDataBundleLoadingCallbacks) {
                this._levelDataBundleLoadingCallbacks.push(callback);
                return;
            }
            this._levelDataBundleLoadingCallbacks = [callback];
            assetManager.loadBundle(LEVEL_DATA_BUNDLE_NAME, (err, bundle) => {
                if (err || !bundle) {
                    console.warn('[LevelDataLoad] loadBundle levelData failed:', err?.message || 'no bundle');
                } else {
                    this.levelDataBundle = bundle;
                }
                const callbacks = this._levelDataBundleLoadingCallbacks || [];
                this._levelDataBundleLoadingCallbacks = null;
                for (const done of callbacks) {
                    done(bundle || null);
                }
            });
        },

        _loadLevelDataFromLocalBundle(levelId: number, prefix: string, callback: (data: LevelData | null, source: string, err?: Error | null) => void) {
            const levelPath = this.getLevelDataPath(levelId, prefix);
            const bundlePath = `${prefix}${levelId}`;
            this._withLevelDataBundle((bundle) => {
                if (!bundle) {
                    callback(null, 'level_data_bundle', new Error('levelData bundle unavailable'));
                    return;
                }
                bundle.load(bundlePath, JsonAsset, (err, jsonAsset) => {
                    if (err || !jsonAsset) {
                        callback(null, 'level_data_bundle', err || new Error('missing json asset'));
                        return;
                    }
                    callback(jsonAsset.json as LevelData, 'level_data_bundle', null);
                });
            });
        },

        _loadLevelDataFromCdnOrLocal(levelId: number, prefix: string, callback: (data: LevelData | null, source: string, err?: Error | null) => void) {
            LevelDataCdnService.inst.loadLevel(levelId, prefix).then((cdnLevelData) => {
                if (cdnLevelData) {
                    callback(cdnLevelData, 'level_data_cdn', null);
                    return;
                }
                if (this._isReleaseLevelDataCdnOnly()) {
                    callback(null, 'level_data_cdn', new Error('release level data CDN unavailable'));
                    return;
                }
                this._loadLevelDataFromLocalBundle(levelId, prefix, callback);
            }).catch((err) => {
                if (this._isReleaseLevelDataCdnOnly()) {
                    callback(null, 'level_data_cdn', err instanceof Error ? err : new Error(String(err)));
                    return;
                }
                this._loadLevelDataFromLocalBundle(levelId, prefix, callback);
            });
        },

        _loadSpriteFrameFromGameAssetsBundle(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            this._withGameAssetsBundle((bundle) => {
                if (!bundle) {
                    callback(null);
                    return;
                }
                const candidates = this._getGameAssetsTextureCandidatePaths(imgName);
                this._loadSpriteFrameWithCandidates(
                    (candidate, done) => bundle.load(candidate, SpriteFrame, done),
                    candidates,
                    (sf) => {
                        if (sf) {
                            callback(sf);
                            return;
                        }
                        this._loadGameAssetsImageSpriteFrame(bundle, imgName, (imageSf) => {
                            if (!imageSf) {
                                console.warn(`[gameAssets] SpriteFrame not found: ${imgName}`);
                            }
                            callback(imageSf);
                        });
                    },
                );
            });
        },

        _loadGameAssetsImageSpriteFrame(bundle: Bundle, imgName: string, callback: (sf: SpriteFrame | null) => void) {
            const candidates = this._getGameAssetsImageAssetCandidatePaths(imgName);
            const tryLoad = (index: number) => {
                if (index >= candidates.length) {
                    callback(null);
                    return;
                }
                bundle.load(candidates[index], ImageAsset, (err, imgAsset) => {
                    if (!err && imgAsset) {
                        const sf = this._createSpriteFrameFromImageAsset(imgName, imgAsset);
                        if (sf) {
                            callback(sf);
                            return;
                        }
                    }
                    tryLoad(index + 1);
                });
            };
            tryLoad(0);
        },

        _getSpriteFrameLoadConcurrencyLimit(): number {
            return MAX_CONCURRENT_SPRITE_FRAME_LOADS;
        },

        _enqueueSpriteFrameLoadTask(imgName: string, task: (done: () => void) => void) {
            if (!this._isRuntimeAliveForAsyncCallback()) return;
            if (!Array.isArray(this._spriteFrameLoadQueue)) {
                this._spriteFrameLoadQueue = [];
            }
            this._spriteFrameLoadQueue.push({ imgName, task });
            debugPerfSnapshot('spriteFrame.load.queue.push', this, {
                imgName,
                queueSize: this._spriteFrameLoadQueue.length,
                concurrencyLimit: this._getSpriteFrameLoadConcurrencyLimit(),
            });
            this._drainSpriteFrameLoadQueue();
        },

        _drainSpriteFrameLoadQueue() {
            if (!this._isRuntimeAliveForAsyncCallback()) {
                this._spriteFrameLoadQueue = [];
                this._spriteFrameLoadInFlight = 0;
                return;
            }
            if (!Array.isArray(this._spriteFrameLoadQueue)) {
                this._spriteFrameLoadQueue = [];
            }
            const limit = this._getSpriteFrameLoadConcurrencyLimit();
            while (this._spriteFrameLoadInFlight < limit && this._spriteFrameLoadQueue.length > 0) {
                const entry = this._spriteFrameLoadQueue.shift();
                if (!entry || typeof entry.task !== 'function') continue;
                const taskImgName = String(entry.imgName || '');
                this._spriteFrameLoadInFlight = Math.max(0, Number(this._spriteFrameLoadInFlight) || 0) + 1;
                const startedAt = Date.now();
                debugPerfTrace('spriteFrame.load.start', {
                    imgName: taskImgName,
                    inFlight: this._spriteFrameLoadInFlight,
                    queueSize: this._spriteFrameLoadQueue.length,
                    concurrencyLimit: limit,
                });
                let finished = false;
                const done = () => {
                    if (finished) return;
                    finished = true;
                    this._spriteFrameLoadInFlight = Math.max(0, (Number(this._spriteFrameLoadInFlight) || 0) - 1);
                    debugPerfTrace('spriteFrame.load.finish', {
                        imgName: taskImgName,
                        durationMs: Date.now() - startedAt,
                        inFlight: this._spriteFrameLoadInFlight,
                        queueSize: Array.isArray(this._spriteFrameLoadQueue) ? this._spriteFrameLoadQueue.length : 0,
                        concurrencyLimit: limit,
                    });
                    this._drainSpriteFrameLoadQueue();
                };
                try {
                    entry.task(done);
                } catch (error) {
                    debugPerfTrace('spriteFrame.load.error', {
                        imgName: taskImgName,
                        error,
                    });
                    done();
                }
            }
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
            const startedAt = Date.now();
            const resolve = (sf: SpriteFrame | null) => {
                if (sf) {
                    this._cacheSpriteFrame(sf, imgName);
                }
                const callbacks = this._pendingSpriteFrameLoads.get(imgName) || [];
                this._pendingSpriteFrameLoads.delete(imgName);
                debugPerfTrace('spriteFrame.load.resolve', {
                    imgName,
                    success: !!sf,
                    durationMs: Date.now() - startedAt,
                    waiterCount: callbacks.length,
                });
                for (const done of callbacks) {
                    done(sf);
                }
            };
            this._enqueueSpriteFrameLoadTask(imgName, (done) => {
                const finish = (sf: SpriteFrame | null) => {
                    try {
                        resolve(sf);
                    } finally {
                        done();
                    }
                };
                if (!this._isRuntimeAliveForAsyncCallback()) {
                    finish(null);
                    return;
                }
                if (this.shouldUseLocalBootstrapTexture(imgName)) {
                    this._loadSpriteFrameFromBootstrapThenRemote(imgName, finish);
                    return;
                }
                this._loadSpriteFrameFromGameAssetsBundle(imgName, finish);
            });
        },

        _ensureSpriteFramesByName(names: string[], callback: () => void) {
            if (!this._isRuntimeAliveForAsyncCallback()) return;
            const uniqueNames = Array.from(new Set(names));
            const missingNames = uniqueNames.filter((name) => !this.getSF(name));
            if (missingNames.length === 0) {
                callback();
                return;
            }
            let remaining = missingNames.length;
            const finishOne = () => {
                if (!this._isRuntimeAliveForAsyncCallback()) return;
                remaining -= 1;
                if (remaining > 0) return;
                const stillMissing = uniqueNames.filter((name) => !this.getSF(name));
                if (stillMissing.length > 0) {
                    throw new Error(`[assets] missing required SpriteFrames: ${stillMissing.join(', ')}`);
                }
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
            if (!this._isRuntimeAliveForAsyncCallback()) return;
            if (isAlreadyOpen() || this._panelOpenInFlight.has(panelKey)) return;
            this._panelOpenInFlight.add(panelKey);
            const uniqueNames = Array.from(new Set(textureNames));
            const missingNames = uniqueNames.filter((name) => !this.getSF(name));
            debugPerfSnapshot('panel.texture.ensure.start', this, {
                panelKey,
                requestedNames: uniqueNames.length,
                missingNames: missingNames.length,
                missingNameSample: missingNames.slice(0, 8),
            });
            this._ensureSpriteFramesByName(textureNames, () => {
                if (!this._isRuntimeAliveForAsyncCallback()) return;
                this._panelOpenInFlight.delete(panelKey);
                if (isAlreadyOpen()) return;
                debugPerfSnapshot('panel.texture.ensure.ready', this, {
                    panelKey,
                    requestedNames: uniqueNames.length,
                    missingNames: uniqueNames.filter((name) => !this.getSF(name)).length,
                });
                open();
            });
        },

        _collectSpriteComponentsForRuntimeScan(root: any, context: string): { sprites: Sprite[]; failed: boolean } {
            const sprites: Sprite[] = [];
            let failed = false;
            if (!root?.isValid) return { sprites, failed };

            const children = Array.isArray(root.children)
                ? root.children
                : Array.isArray(root._children)
                    ? root._children
                    : null;
            const isSceneRoot = root === this.node?.scene;
            const scanRoots = isSceneRoot && children ? children : [root];

            for (const scanRoot of scanRoots) {
                if (!scanRoot?.isValid || typeof scanRoot.getComponentsInChildren !== 'function') continue;
                try {
                    sprites.push(...scanRoot.getComponentsInChildren(Sprite));
                } catch (error) {
                    failed = true;
                    console.warn(`[Memory] Sprite component scan failed during ${context}`, error);
                }
            }
            return { sprites, failed };
        },

        _isSpriteFrameStillInUse(target: SpriteFrame | null): boolean {
            if (!target?.isValid) return false;
            const scene = this.node?.scene;
            if (!scene?.isValid) return false;
            const scan = this._collectSpriteComponentsForRuntimeScan(scene, `usage-check:${target.name || 'unknown'}`);
            if (scan.failed) return true;
            for (const sprite of scan.sprites) {
                if (sprite?.isValid && sprite.spriteFrame === target) {
                    return true;
                }
            }
            return false;
        },

        _releaseDynamicSpriteFrame(
            name: string,
            sf: SpriteFrame,
            meta: { imageAsset?: ImageAsset | null; texture?: Texture2D | null } | null,
            reason: string,
        ) {
            const ownedTexture = meta?.texture as Texture2D | null;
            const sourceImageAsset = meta?.imageAsset as ImageAsset | null;
            try {
                if (sourceImageAsset?.isValid) {
                    assetManager.releaseAsset(sourceImageAsset);
                }
            } catch (error) {
                console.warn(`[Memory] release ImageAsset failed: ${name} (${reason})`, error);
            }
            try {
                if (sf.isValid) {
                    sf.texture = null;
                    sf.destroy();
                }
            } catch (error) {
                console.warn(`[Memory] destroy dynamic SpriteFrame failed: ${name} (${reason})`, error);
            }
            try {
                if (ownedTexture?.isValid) {
                    ownedTexture.destroy();
                }
            } catch (error) {
                console.warn(`[Memory] destroy Texture2D failed: ${name} (${reason})`, error);
            }
        },

        _releaseBootstrapBeanAtlas(reason: string, options: { force?: boolean } = {}): boolean {
            const atlasEntries = Array.from(this._bootstrapAtlasFrameCache.entries()) as Array<[string, SpriteFrame]>;
            const sharedTexture = this._bootstrapBeanAtlasTexture as Texture2D | null;
            const sourceImageAsset = this._bootstrapBeanAtlasImageAsset as ImageAsset | null;
            if (atlasEntries.length === 0 && !sharedTexture && !sourceImageAsset) {
                this._bootstrapBeanAtlasReady = false;
                this._bootstrapBeanAtlasTextureReleaseMode = 'asset';
                return false;
            }
            for (const [, sf] of atlasEntries) {
                if (!options.force && this._isSpriteFrameStillInUse(sf)) {
                    return false;
                }
            }
            for (const [name, sf] of atlasEntries) {
                this.sfCache.delete(name);
                this._spriteFrameCacheMeta.delete(name);
                try {
                    if (sf?.isValid) {
                        sf.texture = null;
                        sf.destroy();
                    }
                } catch (error) {
                    console.warn(`[Memory] destroy bootstrap bean SpriteFrame failed: ${name} (${reason})`, error);
                }
            }
            this._bootstrapAtlasFrameCache.clear();
            this._bootstrapBeanAtlasReady = false;
            this._bootstrapBeanAtlasTexture = null;
            this._bootstrapBeanAtlasImageAsset = null;
            const releaseMode = this._bootstrapBeanAtlasTextureReleaseMode === 'dynamic' ? 'dynamic' : 'asset';
            this._bootstrapBeanAtlasTextureReleaseMode = 'asset';
            try {
                if (releaseMode === 'dynamic') {
                    if (sourceImageAsset?.isValid) {
                        assetManager.releaseAsset(sourceImageAsset);
                    }
                    if (sharedTexture?.isValid) {
                        sharedTexture.destroy();
                    }
                } else if (sharedTexture?.isValid) {
                    assetManager.releaseAsset(sharedTexture);
                }
            } catch (error) {
                console.warn(`[Memory] release bootstrap bean atlas texture failed (${reason})`, error);
            }
            if (atlasEntries.length > 0) {
                console.log(`[Memory] released bootstrap bean atlas frames: ${atlasEntries.length} (${reason})`);
            }
            return atlasEntries.length > 0 || !!sharedTexture || !!sourceImageAsset;
        },

        _releaseManagedSpriteFrame(name: string, sf: SpriteFrame, reason: string) {
            try {
                assetManager.releaseAsset(sf);
            } catch (error) {
                console.warn(`[Memory] release SpriteFrame failed: ${name} (${reason})`, error);
            }
        },

        _releaseSpriteFrameCacheEntry(name: string, reason: string, options: { force?: boolean; ignoreOwners?: boolean; ignoreUsage?: boolean; ignoreScope?: boolean } = {}): boolean {
            const sf = this.sfCache.get(name);
            if (!sf) return false;
            const meta = this._spriteFrameCacheMeta.get(name) || null;
            if (!options.force && !options.ignoreOwners && Number(meta?.retainCount) > 0) {
                return false;
            }
            const scope = String(meta?.scope || this._inferSpriteFrameScope(name));
            if (!options.force && !options.ignoreScope && !this._canAutoReleaseSpriteFrameScope(scope, reason)) {
                return false;
            }
            if (!options.force && !options.ignoreUsage && this._isSpriteFrameStillInUse(sf)) {
                return false;
            }
            this.sfCache.delete(name);
            this._spriteFrameCacheMeta.delete(name);
            if (meta?.releaseMode === 'dynamic') {
                this._releaseDynamicSpriteFrame(name, sf, meta, reason);
            } else {
                this._releaseManagedSpriteFrame(name, sf, reason);
            }
            return true;
        },

        _releaseCachedSpriteFrames(names: string[], reason: string, options: { force?: boolean; ignoreOwners?: boolean; ignoreUsage?: boolean; ignoreScope?: boolean } = {}) {
            const uniqueNames = Array.from(new Set(names));
            let evicted = 0;
            for (const name of uniqueNames) {
                if (this._releaseSpriteFrameCacheEntry(name, reason, options)) {
                    evicted += 1;
                }
            }
            if (evicted > 0) {
                console.log(`[Memory] released ${evicted} panel SpriteFrames: ${reason}`);
            }
        },

        _scheduleRouteSafeCleanup(callback: () => void, delaySeconds: number = 0, requireRuntimeValid: boolean = false) {
            const run = () => {
                if (requireRuntimeValid && !this.node?.isValid) return;
                callback();
            };
            const setTimer = (globalThis as any).setTimeout;
            if (typeof setTimer === 'function') {
                setTimer(run, Math.max(0, Math.round(delaySeconds * 1000)));
                return;
            }
            this.scheduleOnce(run, delaySeconds);
        },

        _releasePanelTexturesNextFrame(names: string[], reason: string) {
            this._scheduleRouteSafeCleanup(() => this._releaseCachedSpriteFrames(names, reason), 0.05, true);
        },

        _clearSpriteFramesBeforeDestroy(root: Node) {
            if (!root?.isValid) return;
            root.active = false;
            const scan = this._collectSpriteComponentsForRuntimeScan(root, `panel-destroy:${root.name || 'unknown'}`);
            for (const sp of scan.sprites) {
                if (!sp?.isValid) continue;
                sp.enabled = false;
            }
            if (root.parent?.isValid) {
                root.removeFromParent();
            }
        },

        _destroyDetachedNodeNextFrame(node: Node) {
            if (!node?.isValid) return;
            // Let Cocos flush disabled UIRenderers before destroying detached panel nodes.
            this._scheduleRouteSafeCleanup(() => {
                if (node?.isValid) {
                    node.destroy();
                }
            }, 0.05);
        },

        _destroyPanelAndReleaseTextures(panel: Node, names: string[], reason: string) {
            if (!panel?.isValid) return;
            this._clearSpriteFramesBeforeDestroy(panel);
            this._destroyDetachedNodeNextFrame(panel);
        },

        _closePanelWithTextureOwner(panel: Node | null, panelKey: string, reason: string) {
            if (panel?.isValid) {
                this._clearSpriteFramesBeforeDestroy(panel);
                this._destroyDetachedNodeNextFrame(panel);
            }
            this._scheduleRouteSafeCleanup(() => this._releasePanelTextureOwner(panelKey, reason), 0.05, true);
        },

        releaseSceneScopedSpriteFrames(sceneName: string, reason: string = 'scene-destroy') {
            const scopes = new Set<string>([SPRITE_FRAME_SCOPE_DYNAMIC]);
            if (reason.includes('runtime-destroy')) {
                scopes.add(SPRITE_FRAME_SCOPE_SHARED_UI);
            }
            if (sceneName === 'Home') {
                scopes.add(SPRITE_FRAME_SCOPE_SCENE_HOME);
            }
            if (sceneName === 'Game' || sceneName === 'Boot') {
                scopes.add(SPRITE_FRAME_SCOPE_SCENE_GAME);
                if (reason.includes('runtime-destroy')) {
                    scopes.add(SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP);
                }
            }
            const names = Array.from(this._spriteFrameCacheMeta.entries())
                .filter(([, meta]) => scopes.has(String(meta?.scope || '')))
                .map(([name]) => name);
            debugPerfSnapshot('spriteFrame.sceneScope.release.before', this, {
                sceneName,
                reason,
                scopes: Array.from(scopes),
                candidateNames: names.length,
            });
            if (names.length > 0) {
                this._releaseCachedSpriteFrames(names, `${reason}:${sceneName}`, {
                    force: true,
                    ignoreOwners: true,
                    ignoreUsage: true,
                    ignoreScope: true,
                });
            }
            if ((sceneName === 'Game' || sceneName === 'Boot') && reason.includes('runtime-destroy')) {
                this._releaseBootstrapBeanAtlas(`${reason}:${sceneName}`, { force: true });
            }
            debugPerfSnapshot('spriteFrame.sceneScope.release.after', this, {
                sceneName,
                reason,
            });
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
            return this.shouldUseMainlineSlotUI() ? 38 : SLOT_SIZE;
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
            PerformanceMgr.inst.markUserActivity();
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
            debugPerfSnapshot('effectPools.clear.before', this);
            this._flyBeanPool.clear();
            this._frameFxPool.clear();
            this._brightFlashPool.clear();
            this._effectFrameCache.clear();
            this._activeFrameFxCount = 0;
            this._activeBrightFlashCount = 0;
            debugPerfSnapshot('effectPools.clear.after', this);
        },

        clearBoardVisualPools() {
            debugPerfSnapshot('boardVisualPools.clear.before', this);
            this._boardCellPool.clear();
            this._boardSlotBgPool.clear();
            debugPerfSnapshot('boardVisualPools.clear.after', this);
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

        getRawSavedLevelForStartup(): string | null {
            return sys.localStorage.getItem(LS_LEVEL);
        },

        getParsedSavedLevelForStartup(): number | null {
            const raw = this.getRawSavedLevelForStartup();
            if (raw === null) return null;
            const parsed = parseInt(raw, 10);
            if (!Number.isFinite(parsed)) return null;
            const normalized = Math.floor(parsed);
            return normalized >= 1 ? normalized : null;
        },

        getStartupLocalProgressState(): 'rawLevelMissing' | 'rawLevelInvalid' | 'local_progress_1' | 'local_progress_gt_1' {
            const raw = this.getRawSavedLevelForStartup();
            if (raw === null) return 'rawLevelMissing';
            const parsed = this.getParsedSavedLevelForStartup();
            if (parsed === null) return 'rawLevelInvalid';
            return parsed > 1 ? 'local_progress_gt_1' : 'local_progress_1';
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

        hasPlayedBefore(): boolean { return sys.localStorage.getItem(LS_LEVEL) !== null; },

        hasLocalUserState(): boolean { return this.hasPlayedBefore() || this.getLocalUserStateUpdatedAt() > 0; },

        hasReliableLocalUserStateForStartup(): boolean { return this.getStartupLocalProgressState() === 'local_progress_gt_1'; },

        recordMainlineLevelEntry(levelId: number): void {
            const normalizedLevel = Math.max(1, Math.floor(Number(levelId) || 1));
            const currentLevel = this.getParsedSavedLevelForStartup();
            const nextLevel = Math.max(currentLevel || 0, normalizedLevel);
            if (nextLevel <= 0) return;
            if (currentLevel !== nextLevel || this.getRawSavedLevelForStartup() === null) {
                sys.localStorage.setItem(LS_LEVEL, String(nextLevel));
            }
            UserMgr.inst.markLevelProgress(nextLevel, false, false);
        },

        saveLevelProgress(levelId: number) {
            const normalizedLevel = Math.max(1, Math.floor(Number(levelId) || 1));
            const currentLevel = this.getSavedLevel();
            const nextLevel = Math.max(currentLevel, normalizedLevel);
            if (nextLevel > normalizedLevel) {
                console.warn('[GameCtrl] keep higher cloud savedLevel, skip lower local progress save', { currentLevel, requestedLevel: normalizedLevel, nextLevel });
            }
            sys.localStorage.setItem(LS_LEVEL, '' + nextLevel);
            UserMgr.inst.markLevelProgress(nextLevel, false, !this._startupCloudRestorePending && !this._startupCloudSaveBlockedForSession);
            this.queueCloudGameStateSync();
            if (deferLeaderboardProgressDuringStartup(this, nextLevel)) return;
            void LeaderboardMgr.inst.submitProgress(nextLevel, UserMgr.inst.getProfile());
        },

        captureCloudGameState(): CloudGameState {
            const backgroundSkinState = typeof this.captureBackgroundSkinCloudState === 'function'
                ? this.captureBackgroundSkinCloudState()
                : {
                    backgroundSkinOwnedIds: [0],
                    backgroundSkinAdProgress: {},
                    equippedBackgroundSkinId: 0,
                };
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
                themeUnlockedIds: Array.from(this.getThemeUnlockedSet() as Set<number>).sort((a, b) => a - b),
                themeCompletedIds: Array.from(this.getThemeCompletedSet() as Set<number>).sort((a, b) => a - b),
                backgroundSkinOwnedIds: Array.isArray(backgroundSkinState.backgroundSkinOwnedIds) ? backgroundSkinState.backgroundSkinOwnedIds as number[] : [0],
                backgroundSkinAdProgress: backgroundSkinState.backgroundSkinAdProgress && typeof backgroundSkinState.backgroundSkinAdProgress === 'object' ? backgroundSkinState.backgroundSkinAdProgress as Record<string, number> : {},
                equippedBackgroundSkinId: Math.max(0, Math.floor(Number(backgroundSkinState.equippedBackgroundSkinId) || 0)),
                stateUpdatedAt: this.getLocalUserStateUpdatedAt(),
            };
        },

        queueCloudGameStateSync(): void {
            if (deferCloudGameStateSyncDuringStartup(this)) return;
            const timestamp = Date.now();
            this.setLocalUserStateUpdatedAt(timestamp);
            const state = this.captureCloudGameState();
            state.stateUpdatedAt = timestamp;
            UserStateSyncMgr.inst.queueSave({ profile: UserMgr.inst.getCloudProfile(), gameState: state });
        },

        async loadRestorableUserStateFromCloud(): Promise<CloudUserState | null> { return UserStateSyncMgr.inst.loadState(); },

        getStartupCloudRestoreStatus(): UserStateRestoreStatus | '' {
            return (this._startupCloudRestoreStatus || '') as UserStateRestoreStatus | '';
        },

        _shouldHoldStartupCloudHomeRouteForBoot(): boolean {
            const appRoot = AppRoot.tryGet();
            const sceneName = String(this.node?.scene?.name || '');
            return sceneName === 'Boot' || appRoot?.session.currentSceneName === 'Boot';
        },

        beginStartupCloudRestore(hadLocalUserState: boolean): Promise<UserStateRestoreStatus> {
            const existingStatus = this.getStartupCloudRestoreStatus();
            if (existingStatus && existingStatus !== 'cloud_restore_pending') {
                return Promise.resolve(existingStatus);
            }
            if (this._startupCloudRestorePromise) {
                return this._startupCloudRestorePromise;
            }
            const canUseCloudState = UserStateSyncMgr.inst.canUseCloud();
            if (!canUseCloudState) {
                if (!hadLocalUserState) this._startupCloudSaveBlockedForSession = true;
                const status: UserStateRestoreStatus = hadLocalUserState ? 'local_progress_gt_1' : 'cloud_unavailable_unresolved';
                this._startupCloudRestoreStatus = status;
                return Promise.resolve(status);
            }

            this._startupCloudRestorePending = true;
            this._startupCloudSaveBlockedForSession = false;
            this._startupCloudRestoreHadLocalUserState = hadLocalUserState;
            this._startupCloudRestoreStatus = 'cloud_restore_pending';
            debugPerfTrace('startup.cloudRestore.begin', {
                hadLocalUserState,
                sceneName: String(this.node?.scene?.name || ''),
            });
            this._startupCloudRestorePromise = this.loadRestorableUserStateFromCloud().then((lateState) => {
                let status: UserStateRestoreStatus;
                if (!lateState) {
                    status = UserStateSyncMgr.inst.canUseCloud() ? 'cloud_failed_unresolved' : 'cloud_unavailable_unresolved';
                } else if (this._shouldHoldStartupCloudHomeRouteForBoot()) {
                    status = this.applyCloudUserState(lateState);
                } else {
                    status = applyLateCloudUserStateToRuntime(this, lateState, hadLocalUserState) || 'cloud_failed_unresolved';
                }
                this._startupCloudRestoreStatus = status;
                resolveStartupCloudRestorePending(this, status);
                debugPerfTrace('startup.cloudRestore.done', {
                    status,
                    hadLocalUserState,
                    sceneName: String(this.node?.scene?.name || ''),
                    savedLevel: typeof this.getSavedLevel === 'function' ? this.getSavedLevel() : 0,
                });
                return status;
            }).catch((error) => {
                const status: UserStateRestoreStatus = 'cloud_failed_unresolved';
                this._startupCloudRestoreStatus = status;
                resolveStartupCloudRestorePending(this, status);
                console.warn('[GameCtrl] background cloud user state restore failed:', error);
                return status;
            });
            return this._startupCloudRestorePromise;
        },

        async restoreUserStateFromCloud(hadLocalUserState: boolean): Promise<UserStateRestoreStatus> {
            void this.beginStartupCloudRestore(hadLocalUserState);
            if (hadLocalUserState) {
                return 'local_progress_gt_1';
            }
            const status = this.getStartupCloudRestoreStatus();
            return status && status !== 'cloud_restore_pending' ? status : 'cloud_restore_pending';
        },

        applyLateCloudUserState(state: CloudUserState | null, hadLocalUserState: boolean): void {
            applyLateCloudUserStateToRuntime(this, state, hadLocalUserState);
        },

        applyCloudUserState(restoreResult: CloudUserState): UserStateRestoreStatus {
            const { profile, gameState } = restoreResult;
            if (!profile && !gameState) {
                return 'cloud_confirmed_empty';
            }
        
            if (profile) {
                UserMgr.inst.applyCloudProfile(profile);
            }
        
            if (!gameState) {
                return 'cloud_confirmed_empty';
            }
        
            const cloudSavedLevel = typeof gameState.savedLevel === 'number'
                ? Math.max(0, Math.floor(Number(gameState.savedLevel) || 0))
                : 0;
            const cloudUpdatedAt = Math.max(0, Math.floor(Number(gameState.stateUpdatedAt) || 0));
            const localUpdatedAt = this.getLocalUserStateUpdatedAt();
            const localSavedLevel = this.getSavedLevel();
            const shouldSkipVolatileRestore = cloudUpdatedAt > 0 && localUpdatedAt > cloudUpdatedAt && cloudSavedLevel <= localSavedLevel;
            if (shouldSkipVolatileRestore) {
                console.warn('[GameCtrl] local user state is newer than cloud, skip restore', { localUpdatedAt, cloudUpdatedAt, localSavedLevel, cloudSavedLevel });
            }
            if (typeof this.applyBackgroundSkinCloudState === 'function') {
                this.applyBackgroundSkinCloudState(gameState as any, !shouldSkipVolatileRestore);
            }
        
            const effectiveLevel = Math.max(localSavedLevel, cloudSavedLevel);
            if (effectiveLevel > 0 && (cloudSavedLevel > 0 || this.getRawSavedLevelForStartup() !== null)) {
                sys.localStorage.setItem(LS_LEVEL, String(effectiveLevel));
                UserMgr.inst.markLevelProgress(effectiveLevel, false, false);
            }
            if (shouldSkipVolatileRestore) {
                this.refreshGoldUI();
                if (effectiveLevel > cloudSavedLevel && effectiveLevel > 1) return 'local_progress_gt_1';
                return cloudSavedLevel > 1 ? 'cloud_progress_gt_1' : 'cloud_confirmed_empty';
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
            if (cloudSavedLevel > localSavedLevel && cloudSavedLevel > 1) return 'cloud_progress_gt_1';
            if (effectiveLevel > cloudSavedLevel && effectiveLevel > 1) return 'local_progress_gt_1';
            return cloudSavedLevel > 1 ? 'local_progress_gt_1' : 'cloud_confirmed_empty';
        },

        applyAuthoritativeCloudUserStateFromSave(state: CloudUserState | null): void {
            const cloudSavedLevel = Math.floor(Number(state?.gameState?.savedLevel) || 0);
            if (cloudSavedLevel <= this.getSavedLevel()) {
                return;
            }
            applyLateCloudUserStateToRuntime(this, state, true);
        },

        bindUserStateLifecycle(): void {
            if (this._userStateLifecycleBound) {
                return;
            }
            this._userStateLifecycleBound = true;
            UserStateSyncMgr.inst.setAuthoritativeStateHandler((state) => {
                if (!this.isValid) return;
                this.applyAuthoritativeCloudUserStateFromSave(state);
            });
            game.on(Game.EVENT_HIDE, this.handleGameHideFlushUserState, this);
            game.on(Game.EVENT_SHOW, this.handleGameShowLifecycle, this);
        },

        unbindUserStateLifecycle(): void {
            if (!this._userStateLifecycleBound) {
                return;
            }
            this._userStateLifecycleBound = false;
            UserStateSyncMgr.inst.setAuthoritativeStateHandler(null);
            game.off(Game.EVENT_HIDE, this.handleGameHideFlushUserState, this);
            game.off(Game.EVENT_SHOW, this.handleGameShowLifecycle, this);
            this._pendingPostAdSkillAction = null;
            this.cancelRewardedAdPreload?.();
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
