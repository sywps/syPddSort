import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Layers, view, ResolutionPolicy, sys, UIOpacity,
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
import { ensureHomeIconIdleWiggle } from '../HomeIconIdleWiggle';
import { ensureHomeIconSparkleFx } from '../HomeIconSparkleFx';
import { LevelDataCdnService } from '../LevelDataCdnService';

export function installSceneHomeEntryModule(target: any): void {
    Object.assign(target, {
        getGameplayEntryMode(prefix: string = 'level_', external: boolean = false): 'main' | 'theme' | 'external' {
            if (external) return 'external';
            return prefix === 'zt_level_' ? 'theme' : 'main';
        },

        syncAppSessionForGameplayRequest(levelId: number, prefix: string = 'level_', external: boolean = false): void {
            const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
            AppRoot.tryGet()?.markGameRequested(
                normalizedLevelId,
                prefix,
                this.getGameplayEntryMode(prefix, external),
            );
        },

        async requestGameplaySceneTransition(levelId: number, prefix: string = 'level_', external: boolean = false): Promise<void> {
            const appRoot = AppRoot.tryGet();
            if (!appRoot) {
                throw new Error('[SceneSplit] AppRoot is not ready for gameplay scene transition');
            }
            const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
            appRoot.markGameRequested(
                normalizedLevelId,
                prefix,
                this.getGameplayEntryMode(prefix, external),
            );
            await appRoot.beginSceneTransition('gameplay');
            try {
                await appRoot.router.toGame();
            } catch (error) {
                await appRoot.finishSceneTransition('gameplay-error');
                throw error;
            }
        },

        async requestHomeSceneTransition(): Promise<void> {
            const appRoot = AppRoot.tryGet();
            if (!appRoot) {
                throw new Error('[SceneSplit] AppRoot is not ready for home scene transition');
            }
            await appRoot.requestHomeSceneTransition('runtime');
        },

        drawLeaderboardButton(parent: Node) {
            const btn = this.requireUiChild(parent, 'LeaderboardBtn', 'EntryLayer/LeaderboardBtn');
        
            btn.targetOff(this);
            btn.getComponent(Button) || btn.addComponent(Button);
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('uiPanel');
                void this.openLeaderboard();
            }, this);
            const iconNode = this.requireUiChild(btn, 'LeaderboardIcon', 'LeaderboardBtn/LeaderboardIcon');
            this.requireSceneSpriteFrame(iconNode, 'LeaderboardBtn/LeaderboardIcon');
        
            ensureHomeIconIdleWiggle(iconNode);
            ensureHomeIconSparkleFx(iconNode);
        },

        drawCollectionButton(parent: Node) {
            const btn = this.requireUiChild(parent, 'CollectionBtn', 'EntryLayer/CollectionBtn');
        
            btn.targetOff(this);
            btn.getComponent(Button) || btn.addComponent(Button);
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('uiPanel');
                this.openCollection();
            }, this);
            const iconNode = this.requireUiChild(btn, 'CollectionIcon', 'CollectionBtn/CollectionIcon');
            this.requireSceneSpriteFrame(iconNode, 'CollectionBtn/CollectionIcon');
        
            ensureHomeIconIdleWiggle(iconNode);
            ensureHomeIconSparkleFx(iconNode);
        },

        loadLevel(levelId: number, prefix: string = 'level_', _mapMainLevel: boolean = true) {
            if (this.shouldUseCurrentExternalLevelFile(levelId, prefix)) {
                this.loadExternalLevelFile(this._currentExternalLevelFilePath, prefix);
                return;
            }
            const resolvedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
            this.syncAppSessionForGameplayRequest(resolvedLevelId, prefix, false);
            this.clearCurrentExternalLevelFile();
            if (this.shouldUseLocalBootstrapBundle(resolvedLevelId, prefix)) {
                this.loadLocalLevel(resolvedLevelId, prefix, resolvedLevelId);
                return;
            }
            this.loadGameAssetsLevel(resolvedLevelId, prefix, resolvedLevelId);
        },

        /** 加载主题关卡（zt_level_*.json） */
        loadThemeLevel(levelId: number) {
            this._isThemeLevel = true;
            this._currentThemeLevelId = levelId;
            this.loadLevel(levelId, 'zt_level_', false);
        },

        normalizeExternalLevelFilePath(rawPath: string): string {
            const normalized = String(rawPath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
            if (!normalized) return '';
            return normalized;
        },

        isThemeLevelFile(filePath: string): boolean {
            return /(^|\/)zt_level_\d+\.json$/i.test(filePath);
        },

        parseExternalLevelId(filePath: string): number {
            const match = /(?:^|\/)(?:zt_)?level_(\d+)\.json$/i.exec(filePath);
            if (!match) return 0;
            const levelId = parseInt(match[1], 10);
            return Number.isFinite(levelId) && levelId > 0 ? levelId : 0;
        },

        clearCurrentExternalLevelFile() {
            this._currentExternalLevelFilePath = '';
            this._currentExternalLevelId = 0;
            this._currentExternalLevelPrefix = 'level_';
        },

        shouldUseCurrentExternalLevelFile(levelId: number, prefix: string): boolean {
            return !!this._currentExternalLevelFilePath
                && this._currentExternalLevelId > 0
                && this._currentExternalLevelId === levelId
                && this._currentExternalLevelPrefix === prefix;
        },

        isExternalLevelPreviewActive(): boolean {
            return !!this._currentExternalLevelFilePath || !!this.getUrlLevelFile();
        },

        getExternalLevelApiBases(): string[] {
            const protocol = typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)
                ? window.location.protocol
                : 'http:';
            const hostnames: string[] = [];
            const currentHost = typeof window !== 'undefined' ? (window.location.hostname || '').trim() : '';
            if (currentHost) hostnames.push(currentHost);
            hostnames.push('localhost', '127.0.0.1');
            return [...new Set(hostnames.filter(Boolean))].map((host) => `${protocol}//${host}:8080`);
        },

        parseExternalLevelServerResult(status: number, result: any): LevelData {
            if (status < 200 || status >= 300 || !result?.ok || !result?.levelData) {
                throw new Error(result?.error || `HTTP ${status}`);
            }
            return result.levelData as LevelData;
        },

        requestExternalLevelFileWithXhr(url: string): Promise<LevelData> {
            return new Promise((resolve, reject) => {
                if (typeof XMLHttpRequest === 'undefined') {
                    reject(new Error('XMLHttpRequest is unavailable'));
                    return;
                }
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 5000;
                xhr.onload = () => {
                    let result: any = {};
                    try {
                        result = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                    } catch (error) {
                        reject(error);
                        return;
                    }
                    try {
                        resolve(this.parseExternalLevelServerResult(xhr.status, result));
                    } catch (error) {
                        reject(error);
                    }
                };
                xhr.onerror = () => reject(new Error('XHR network failure'));
                xhr.ontimeout = () => reject(new Error('XHR timeout'));
                xhr.send();
            });
        },

        requestExternalLevelFileWithJsonp(url: string): Promise<LevelData> {
            return new Promise((resolve, reject) => {
                if (typeof document === 'undefined' || !document.head) {
                    reject(new Error('JSONP is unavailable'));
                    return;
                }
        
                const callbackName = `__pddLevelJsonp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
                const script = document.createElement('script');
                const requestUrl = new URL(url);
                requestUrl.pathname = '/api/load-level-file.js';
                requestUrl.searchParams.set('callback', callbackName);
        
                let finished = false;
                const cleanup = () => {
                    if (finished) return;
                    finished = true;
                    script.onerror = null;
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                    try {
                        delete (globalThis as any)[callbackName];
                    } catch (error) {
                        (globalThis as any)[callbackName] = undefined;
                    }
                };
        
                const timer = setTimeout(() => {
                    cleanup();
                    reject(new Error('JSONP timeout'));
                }, 8000);
        
                (globalThis as any)[callbackName] = (payload: any) => {
                    clearTimeout(timer);
                    cleanup();
                    try {
                        resolve(this.parseExternalLevelServerResult(200, payload));
                    } catch (error) {
                        reject(error);
                    }
                };
        
                script.async = true;
                script.src = requestUrl.toString();
                script.onerror = () => {
                    clearTimeout(timer);
                    cleanup();
                    reject(new Error('JSONP script load failed'));
                };
                document.head.appendChild(script);
            });
        },

        requestExternalLevelFile(url: string): Promise<LevelData> {
            const fetchFn = typeof globalThis !== 'undefined' && typeof (globalThis as any).fetch === 'function'
                ? ((globalThis as any).fetch as (input: string, init?: any) => Promise<any>).bind(globalThis)
                : null;
            if (!fetchFn) {
                return this.requestExternalLevelFileWithXhr(url);
            }
            return fetchFn(url, { cache: 'no-store' })
                .then(async (resp) => {
                    const result = await resp.json().catch(() => ({}));
                    return this.parseExternalLevelServerResult(resp.status, result);
                })
                .catch((fetchError) => this.requestExternalLevelFileWithXhr(url)
                    .catch((xhrError) => {
                        throw xhrError || fetchError;
                    }));
        },

        loadExternalLevelFileData(filePath: string): Promise<LevelData> {
            const bases = this.getExternalLevelApiBases();
            let lastError: unknown = null;
            const tryBase = (index: number): Promise<LevelData> => {
                if (index >= bases.length) {
                    return Promise.reject(lastError || new Error('External level tool server unavailable'));
                }
                const requestUrl = new URL('/api/load-level-file', `${bases[index]}/`);
                requestUrl.searchParams.set('path', filePath);
                requestUrl.searchParams.set('_', `${Date.now()}_${index}`);
                return this.requestExternalLevelFile(requestUrl.toString()).catch((error) => {
                    lastError = error;
                    return tryBase(index + 1);
                });
            };
            return tryBase(0);
        },

        loadExternalLevelFile(filePath: string, prefix: string = 'level_', onInitialized?: () => void) {
            const normalizedPath = this.normalizeExternalLevelFilePath(filePath);
            if (!normalizedPath) {
                this.clearCurrentExternalLevelFile();
                this._stopGameplayEntryWithFatalError(
                    String(filePath || '(empty)').trim() || '(empty)',
                    'external_level_path_invalid',
                    'external level file path is empty',
                );
                return;
            }
            this.syncAppSessionForGameplayRequest(this.parseExternalLevelId(normalizedPath) || 1, prefix, true);
        
            this.loadExternalLevelFileData(normalizedPath)
                .then((data) => {
                    const inferredLevelId = this.parseExternalLevelId(normalizedPath);
                    const normalizedLevelId = Number.isFinite(data.levelId) && data.levelId > 0
                        ? data.levelId
                        : (inferredLevelId > 0 ? inferredLevelId : 1);
                    data.levelId = normalizedLevelId;
                    const isThemeLevel = prefix === 'zt_level_' || this.isThemeLevelFile(normalizedPath);
                    this._isThemeLevel = isThemeLevel;
                    this._currentThemeLevelId = isThemeLevel ? normalizedLevelId : 0;
                    this._currentExternalLevelFilePath = normalizedPath;
                    this._currentExternalLevelId = normalizedLevelId;
                    this._currentExternalLevelPrefix = isThemeLevel ? 'zt_level_' : 'level_';
                    this.openLocalLevelWithAssets(data, onInitialized);
                })
                .catch((err) => {
                    console.warn('[GameCtrl] loadExternalLevelFile failed:', normalizedPath, err);
                    this.clearCurrentExternalLevelFile();
                    this._stopGameplayEntryWithFatalError(
                        normalizedPath,
                        'external_level_load_failed',
                        err instanceof Error ? err.message : String(err || 'unknown external level load error'),
                    );
                });
        },

        /** 从 bootstrap/remote 加载关卡 */
        loadLocalLevel(levelId: number, prefix: string = 'level_', activeLevelId: number = levelId) {
            this._loadLocalLevelDataImpl(levelId, (data) => {
                if (!data) {
                    console.warn(`[loadLocalLevel] ${prefix}${levelId} not found`);
                    this.trackFirstLevelFunnelForLevel(activeLevelId, 'local_level_json_failed', {
                        source: prefix === LOCAL_BOOTSTRAP_LEVEL_PREFIX ? 'bootstrap' : 'local',
                        errorCode: 'local_level_json_missing',
                        success: false,
                    });
                    this._stopGameplayEntryWithFatalError(
                        `${prefix}${levelId}`,
                        'local_level_json_missing',
                        `local level data missing: ${prefix}${levelId}`,
                    );
                    return;
                }
                this.openLocalLevelWithAssets(data, undefined, activeLevelId);
            }, prefix);
        },

        openLocalLevelWithAssets(data: LevelData, onInitialized?: () => void, activeLevelId?: number) {
            const onReady = () => {
                this.initGame(data, activeLevelId);
                if (onInitialized) onInitialized();
            };
            let beanReady = false;
            let uiReady = false;
            const tryReady = () => {
                if (!beanReady || !uiReady) return;
                onReady();
            };
            this._prepareBeanFramesForLevelData(data, () => {
                if (this.needsBeanFramesForLevelData(data)) {
                    this._stopGameplayEntryWithFatalError(
                        `level_${activeLevelId || data.levelId || 0}`,
                        'local_bean_assets_missing',
                        'local bean atlas/spriteFrame unavailable',
                    );
                    return;
                }
                beanReady = true;
                tryReady();
            });
            this.prepareCriticalUiTexturesForLevel(data, () => {
                const missingTextureNames = this.getMissingCriticalGameplayShellTextureNamesForLevel(data);
                if (missingTextureNames.length > 0) {
                    this._stopGameplayEntryWithFatalError(
                        `level_${activeLevelId || data.levelId || 0}`,
                        'local_ui_textures_missing',
                        `missing critical ui textures: ${missingTextureNames.join(', ')}`,
                    );
                    return;
                }
                uiReady = true;
                tryReady();
            });
            this._preloadEffectsFrames();
        },

        _preloadEffectsFrames(callback?: () => void) {
            if (this._effectsAtlasReady) {
                if (callback) callback();
                return;
            }
            this.ensureEffectsAtlasLoadedForNextUse();
            if (callback) callback();
        },

        loadGameAssetsLevel(levelId: number, prefix: string = 'level_', activeLevelId: number = levelId) {
            if (this.shouldUseLocalBootstrapBundle(levelId, prefix)) {
                this.loadLocalLevel(levelId, prefix, activeLevelId);
                return;
            }
            if (this._levelDataLoadStopped) return;
            const levelPath = this.getLevelDataPath(levelId, prefix);
            this.reportLevelDataLoadDiagnostic(activeLevelId, 'level_data_load_start', true, levelPath);
            const loadLevelData = (bundle: Bundle) => {
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
                    this.openLevelWithGameAssets(bundle, levelData, activeLevelId);
                });
            };
            if (this.gameAssetsBundle) {
                loadLevelData(this.gameAssetsBundle);
            } else if (this._preloadingBundle) {
                // preloadAllAssets is already loading the bundle, wait for it to finish
                this.waitForGameAssetsBundleReady(levelId, prefix, activeLevelId);
            } else {
                assetManager.loadBundle('gameAssets', (err, bundle) => {
                    if (err || !bundle) {
                        this.stopLevelDataLoadWithFatalError(
                            activeLevelId,
                            levelPath,
                            'gameAssets_config_failed',
                            'loadBundle_gameAssets_failed',
                            err?.message || 'missing gameAssets bundle',
                        );
                        return;
                    }
                    this.gameAssetsBundle = bundle;
                    this.reportLevelDataLoadDiagnostic(activeLevelId, 'gameAssets_config_loaded', true, levelPath);
                    loadLevelData(bundle);
                });
            }
        },

        /**
         * 首次直进关卡时走更短的启动路径：
         * 只等待 gameAssets bundle、关卡 JSON、豆豆图集；
         * 非关键 UI 贴图与特效图集进入关卡后再后台补齐。
         */
        startGameAssetsLevelFast(levelId: number, prefix: string = 'level_', activeLevelId: number = levelId) {
            if (this._levelDataLoadStopped) return;
            this.syncAppSessionForGameplayRequest(activeLevelId, prefix, false);
            const levelPath = this.getLevelDataPath(levelId, prefix);
            this.reportLevelDataLoadDiagnostic(activeLevelId, 'gameAssets_config_start', true, levelPath);
            let finished = false;
            const finish = (data: LevelData) => {
                if (finished) return;
                finished = true;
                this.initGame(data, activeLevelId);
            };
            const failMissingBeans = () => {
                this.stopLevelDataLoadWithFatalError(
                    activeLevelId,
                    levelPath,
                    'gameAssets_bean_assets_failed',
                    'gameAssets_bean_assets_missing',
                    'bootstrap bean atlas/spriteFrame unavailable',
                );
            };
        
            this._preloadingBundle = true;
            assetManager.loadBundle('gameAssets', (err, bundle) => {
                this._preloadingBundle = false;
                if (err || !bundle) {
                    this.stopLevelDataLoadWithFatalError(
                        activeLevelId,
                        levelPath,
                        'gameAssets_config_failed',
                        'loadBundle_gameAssets_failed',
                        err?.message || 'missing gameAssets bundle',
                    );
                    return;
                }
                this.gameAssetsBundle = bundle;
                this.reportLevelDataLoadDiagnostic(activeLevelId, 'gameAssets_config_loaded', true, levelPath);
        
                let levelDone = false;
                let beanAssetsDone = false;
                let criticalUiDone = false;
                let levelData: LevelData | null = null;
                const tryFinish = () => {
                    if (levelDone && beanAssetsDone && criticalUiDone && levelData) {
                        finish(levelData);
                    }
                };
                const handleLevelData = (data: LevelData | null, source: string, levelErr?: Error | null) => {
                    levelData = data;
                    if (!levelData) {
                        this.stopLevelDataLoadWithFatalError(
                            activeLevelId,
                            levelPath,
                            'first_level_json_failed',
                            'level_json_failed',
                            levelErr?.message || 'missing json asset',
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
                    levelDone = true;
                    this.prepareCriticalUiTexturesForLevel(levelData, () => {
                        const missingTextureNames = this.getMissingCriticalGameplayShellTextureNamesForLevel(levelData);
                        if (missingTextureNames.length > 0) {
                            this.stopLevelDataLoadWithFatalError(
                                activeLevelId,
                                levelPath,
                                'gameAssets_ui_textures_failed',
                                'gameAssets_ui_textures_missing',
                                `missing critical ui textures: ${missingTextureNames.join(', ')}`,
                                { missingTextureNames },
                            );
                            return;
                        }
                        criticalUiDone = true;
                        tryFinish();
                    });
                    if (!this.needsBeanFramesForLevelData(levelData)) {
                        beanAssetsDone = true;
                        tryFinish();
                        return;
                    }
                    this._prepareBeanFramesForLevelData(levelData, () => {
                        if (this.needsBeanFramesForLevelData(levelData)) {
                            failMissingBeans();
                            return;
                        }
                        beanAssetsDone = true;
                        tryFinish();
                    });
                    tryFinish();
                };
                this._loadLevelDataFromCdnOrLocal(levelId, prefix, handleLevelData);
        
                this.scheduleGameAssetsEffectsWarmup(bundle);
            });
        },

        startLocalBootstrapLevelFast(levelId: number, prefix: string = LOCAL_BOOTSTRAP_LEVEL_PREFIX, activeLevelId: number = levelId) {
            this.syncAppSessionForGameplayRequest(activeLevelId, prefix, false);
            this.trackFirstLevelFunnelForLevel(activeLevelId, 'bootstrap_level_start', {
                source: 'bootstrap',
            });
            this._loadLocalLevelDataImpl(levelId, (data) => {
                if (!data) {
                    this.trackFirstLevelFunnelForLevel(activeLevelId, 'first_level_json_failed', {
                        source: 'bootstrap',
                        errorCode: 'bootstrap_level_json_missing',
                        success: false,
                    });
                    this._stopGameplayEntryWithFatalError(
                        `${prefix}${levelId}`,
                        'bootstrap_level_json_missing',
                        `bootstrap level data missing: ${prefix}${levelId}`,
                    );
                    return;
                }
                this.trackFirstLevelFunnelForLevel(activeLevelId, 'first_level_json_loaded', {
                    source: 'bootstrap',
                    success: true,
                });
                let beanDone = false;
                let uiDone = false;
                const tryInit = () => {
                    if (!beanDone || !uiDone) return;
                    this.initGame(data, activeLevelId);
                    this.scheduleOnce(() => {
                        if (this._preloadingBundle) return;
                        if (this.gameAssetsBundle && this._effectsAtlasReady) return;
                        this.prewarmGameAssetsBundleAfterBootstrap();
                    }, LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY);
                };
                this._prepareBeanFramesForLevelData(data, () => {
                    if (this.needsBeanFramesForLevelData(data)) {
                        this.trackFirstLevelFunnelForLevel(activeLevelId, 'bootstrap_bean_assets_failed', {
                            source: 'bootstrap',
                            errorCode: 'bootstrap_bean_assets_missing',
                            success: false,
                        });
                        this._stopGameplayEntryWithFatalError(
                            `${prefix}${levelId}`,
                            'bootstrap_bean_assets_missing',
                            'bootstrap bean atlas/spriteFrame unavailable',
                        );
                        return;
                    }
                    beanDone = true;
                    tryInit();
                });
                const bootstrapTextureNames = Array.from(LOCAL_BOOTSTRAP_TEXTURE_NAMES);
                this._preloadBootstrapTextureSet(bootstrapTextureNames, () => {
                    const allLoaded = bootstrapTextureNames.every((name) => this.sfCache.has(name));
                    if (allLoaded) {
                        uiDone = true;
                        tryInit();
                    } else {
                        const missingTextureNames = bootstrapTextureNames.filter((name) => !this.sfCache.has(name));
                        this.trackFirstLevelFunnelForLevel(activeLevelId, 'bootstrap_ui_textures_failed', {
                            source: 'bootstrap',
                            errorCode: 'bootstrap_ui_textures_missing',
                            success: false,
                            extra: { missingTextureNames },
                        });
                        this._stopGameplayEntryWithFatalError(
                            `${prefix}${levelId}`,
                            'bootstrap_ui_textures_missing',
                            `missing bootstrap ui textures: ${missingTextureNames.join(', ')}`,
                        );
                    }
                });
            }, prefix);
        },

        prewarmGameAssetsBundleAfterBootstrap() {
            if (GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS.length === 0) {
                return;
            }
            const warm = (bundle: Bundle) => {
                this._preloadGameAssetsTextureSet(bundle, undefined, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS);
            };
            if (this.gameAssetsBundle) {
                warm(this.gameAssetsBundle);
                return;
            }
            this._preloadingBundle = true;
            assetManager.loadBundle('gameAssets', (err, bundle) => {
                this._preloadingBundle = false;
                if (err || !bundle) {
                    console.warn('loadBundle gameAssets failed:', err?.message);
                    return;
                }
                this.gameAssetsBundle = bundle;
                warm(bundle);
            });
        },

        openLevelWithGameAssets(bundle: Bundle, data: LevelData, activeLevelId?: number) {
            let beanReady = false;
            let uiReady = false;
            const tryReady = () => {
                if (!beanReady || !uiReady) return;
                this.initGame(data, activeLevelId);
            };
            this._prepareBeanFramesForLevelData(data, () => {
                if (this.needsBeanFramesForLevelData(data)) {
                    const levelId = data.levelId || activeLevelId || 0;
                    const levelPath = this.getLevelDataPath(levelId);
                    this.stopLevelDataLoadWithFatalError(
                        activeLevelId || levelId,
                        levelPath,
                        'gameAssets_bean_assets_failed',
                        'gameAssets_bean_assets_missing',
                        'bootstrap bean atlas/spriteFrame unavailable',
                    );
                    return;
                }
                beanReady = true;
                tryReady();
            });
            this.prepareCriticalUiTexturesForLevel(data, () => {
                const missingTextureNames = this.getMissingCriticalGameplayShellTextureNamesForLevel(data);
                if (missingTextureNames.length > 0) {
                    const levelId = data.levelId || activeLevelId || 0;
                    const levelPath = this.getLevelDataPath(levelId);
                    this.stopLevelDataLoadWithFatalError(
                        activeLevelId || levelId,
                        levelPath,
                        'gameAssets_ui_textures_failed',
                        'gameAssets_ui_textures_missing',
                        `missing critical ui textures: ${missingTextureNames.join(', ')}`,
                        { missingTextureNames },
                    );
                    return;
                }
                uiReady = true;
                tryReady();
            });
            this.scheduleGameAssetsEffectsWarmup(bundle);
        },

        _stopGameplayEntryWithFatalError(levelPath: string, errorCode: string, errorMessage: string): void {
            if (this._levelDataLoadStopped) return;
            this._levelDataLoadStopped = true;
            this._preloadingBundle = false;
            AppRoot.tryGet()?.forceHideSceneTransition('level-data-error');
            this.showLevelDataLoadFatalError(levelPath, errorCode, errorMessage);
        },
    });
}
