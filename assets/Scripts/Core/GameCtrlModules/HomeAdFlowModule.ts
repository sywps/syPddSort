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
import { ensureGameplayResultPanelController } from '../GameplayResultPanelController';

export function installHomeAdFlowModule(target: any): void {
    Object.assign(target, {
        runAfterAdWindowClosed(onReady: () => void): void {
            let settled = false;
            const run = () => {
                if (settled || !this.isValid) return;
                settled = true;
                this._pendingPostAdSkillAction = null;
                this.scheduleOnce(() => {
                    if (!this.isValid) return;
                    onReady();
                }, 0.08);
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

        getAnalyticsPage(): string {
            return this._isThemeLevel ? 'theme_level' : 'level_game';
        },

        getAnalyticsLevelId(): number {
            return this._isThemeLevel
                ? (this._currentThemeLevelId || this.levelData?.levelId || 0)
                : this.getActivePhysicalLevelId();
        },

        getRewardedAdMinFallbackWatchMs(page: string): number {
            return page === 'level_revive' ? 5000 : 3000;
        },

        showTrackedRewardedAd(
            page: string,
            onComplete: (success: boolean) => void,
            options: { levelId?: number; markLevelRevive?: boolean; waitForCloseBeforeComplete?: boolean } = {},
        ) {
            const adType = `rewardedVideo:${page}`;
            const levelId = options.levelId ?? this.getAnalyticsLevelId();
            let adClosed = false;
            let pendingAfterCloseFinalize: (() => void) | null = null;
            AnalyticsMgr.inst.trackAdClick(adType, page, levelId);
            SySDKMgr.inst.reportAdClick(page);
            this.suspendTimerForAd();
            AdConfig.showRewardedAd((success: boolean) => {
                const finalize = () => {
                    this.resumeTimerAfterAd();
                    if (success) {
                        AnalyticsMgr.inst.trackAdFinish(adType, page, levelId);
                        SySDKMgr.inst.reportAdFinish(page);
                        if (options.markLevelRevive) {
                            AnalyticsMgr.inst.markAdRevive();
                        }
                    }
                    onComplete(success);
                };
                if (options.waitForCloseBeforeComplete && adClosed) {
                    this.runAfterAdWindowClosed(finalize);
                    return;
                }
                if (options.waitForCloseBeforeComplete && success) {
                    // 闂堢偛绠嶉崨濠勫箚婢у喛绱欓弮?tt/wx SDK閿涘绗夋导姘承曢崣?onClose閿涘瞼娲块幒銉ョ暚閹?
                    const tt = (window as any).tt;
                    const wx = (window as any).wx || (typeof globalThis !== 'undefined' ? (globalThis as any).wx : null);
                    if (!tt?.createRewardedVideoAd && !wx?.createRewardedVideoAd) {
                        finalize();
                    } else {
                        pendingAfterCloseFinalize = finalize;
                    }
                    return;
                }
                finalize();
            }, {
                onShow: () => {
                    AnalyticsMgr.inst.trackAdShow(adType, page, levelId);
                    SySDKMgr.inst.reportAdShow(page);
                },
                onClose: () => {
                    adClosed = true;
                    if (!pendingAfterCloseFinalize) return;
                    const finalize = pendingAfterCloseFinalize;
                    pendingAfterCloseFinalize = null;
                    this.runAfterAdWindowClosed(finalize);
                },
                minFallbackWatchMs: this.getRewardedAdMinFallbackWatchMs(page),
            });
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
            const host = this.getCanvasUiHost();
            const preservedRootNames = host === this.node
                ? new Set(['BootRoot', 'ScreenRoot', 'PopupRoot', 'OverlayRoot', 'FxRoot'])
                : null;
            const runtimeChildren = this.node.children.slice();
            for (const child of runtimeChildren) {
                if (preservedRootNames?.has(child.name)) {
                    continue;
                }
                child.destroy();
            }

            this.boardModel = null!;
            this.slotModel = null!;
            this.levelData = null!;
            this.boardNode = null!;
            this.boardSlotsNode = null!;
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
            this.destroyGameplayResultOverlays();
            this._loadingProgressLabelTween?.stop?.();
            this._loadingShineTween?.stop?.();
            this._loadingOverlayVersion = (this._loadingOverlayVersion || 0) + 1;
            this._loadingOverlay = null;
            this._loadingProgressFill = null;
            this._loadingProgressLabel = null;
            this._loadingProgressLabelShadow = null;
            this._loadingProgressLabelTween = null;
            this._loadingShine = null;
            this._loadingShineTween = null;
            this._remoteLoadErrorOverlay = null;
            this._noLivesModal = null;
            this._collectionOverlay = null;
            this._collectionContentNode = null;
            this._collectionScrollContentNode = null;
            this._collectionScrollSuppressClickUntil = 0;
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
            Tween.stopAll();
            this.unscheduleAllCallbacks();
            this.deactivateWeChatFriendRank('cleanup-for-main-menu');
            this.detachGameplayInputHandlers();
            this.clearDragNodes();
            this.stopPulseTweens();
            this.clearSelectionOverlay();
        
            this.clearIdleHint();
            this.clearForcedSkillHiddenState();
            this._flyingTargets.clear();
            this._skillActive = false;
            this._skillAnimOnly = false;
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
            if (this._pinchGuideLayer) this._pinchGuideLayer.destroy();
            this._pinchGuideLayer = null;
            if (this._guideBubble?.isValid) this._guideBubble.active = false;
            if (this._guideLayer) this._guideLayer.destroy();
            this._guideLayer = null;
            this._guideMask = null;
            this._guideHand = null;
            this._guideBubble = null;
            this._guideBubbleLbl = null;
            this._guideArrow = null;
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
            const vigorGroup = this.requireUiChild(topBarGroup, 'VigorGroup', 'TopBarGroup/VigorGroup');
            const goldGroup = this.requireUiChild(topBarGroup, 'GoldGroup', 'TopBarGroup/GoldGroup');

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

            this.drawLivesBanner(vigorGroup);
            this.drawGoldBanner(goldGroup);
            this.drawTopRightBtns(topBarGroup);
            this.drawStartButton(primaryActionLayer, curLevel);
            this.drawThemeChallengeButton(primaryActionLayer);
            this.drawDailySignInButton(entryLayer);
            this.drawLeaderboardButton(entryLayer);
            this.drawCollectionButton(entryLayer);
            this.drawSidebarEntry(entryLayer);
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
                void this.requestHomeSceneTransition();
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
        drawCoinGlyph(parent: Node, x: number, y: number, radius: number = 14): Node {
            const coin = new Node('CoinGlyph');
            parent.addChild(coin);
            coin.addComponent(UITransform).setContentSize(radius * 2 + 4, radius * 2 + 4);
            coin.layer = Layers.Enum.UI_2D;
            coin.setPosition(x, y);
            const cg = coin.addComponent(Graphics);
            cg.fillColor = new Color('#F2C94C');
            cg.circle(0, 0, radius);
            cg.fill();
            cg.fillColor = new Color('#FFE18A');
            cg.circle(-radius * 0.16, radius * 0.16, radius * 0.58);
            cg.fill();
            cg.strokeColor = new Color('#C28A13');
            cg.lineWidth = 2;
            cg.circle(0, 0, radius);
            cg.stroke();
            cg.fillColor = new Color('#B8740A');
            cg.circle(0, 0, Math.max(3.2, radius * 0.25));
            cg.fill();
            return coin;
        },

        drawAdVideoGlyph(parent: Node, x: number, y: number, w: number = 32, h: number = 24): Node {
            const icon = new Node('AdVideoGlyph');
            parent.addChild(icon);
            icon.addComponent(UITransform).setContentSize(w, h);
            icon.layer = Layers.Enum.UI_2D;
            icon.setPosition(x, y);
            const g = icon.addComponent(Graphics);
            g.fillColor = new Color(255, 255, 255, 235);
            g.roundRect(-w / 2, -h / 2, w, h, 6);
            g.fill();
            g.strokeColor = new Color('#B8740A');
            g.lineWidth = 2;
            g.roundRect(-w / 2, -h / 2, w, h, 6);
            g.stroke();
            g.fillColor = new Color('#F0A33C');
            g.moveTo(-4, -7);
            g.lineTo(-4, 7);
            g.lineTo(8, 0);
            g.close();
            g.fill();
            return icon;
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

        destroyGameplayResultOverlays() {
            for (const panel of [this.panelWin, this.panelLose, this.panelTimeoutContinue]) {
                if (panel?.isValid) {
                    panel.destroy();
                }
            }
            this.panelWin = null!;
            this.panelLose = null!;
            this.panelTimeoutContinue = null!;
        },

        /** 鐏炴洜銇氶崶鐐攳閿涙氨鏁ょ挒鍡氱湸缂佸嫭鍨氱亸蹇曞敽閼撮潻绱欓崣鍌濃偓?main.jpg閿?*/
        drawShowcaseBean(parent: Node, cx: number, cy: number) {
            const node = new Node('Showcase');
            parent.addChild(node);
            node.addComponent(UITransform).setContentSize(440, 400);
            node.layer = Layers.Enum.UI_2D;
            node.setPosition(cx, cy);
            const g = node.addComponent(Graphics);
        
            // 鐏忓繒鍞洪惃鍕湸鐠炲棛鐓╅梼?(14鑴?4)
            // 0=缁?1=濞ｈ鲸顥?#6B3A2A) 2=濞村懐鑳?#F0E0CC) 3=濮楁瑨鍙?#D4944A)
            const pattern = [
                [0,0,0,1,1,0,0,0,0,1,1,0,0,0],
                [0,0,1,1,1,1,0,0,1,1,1,1,0,0],
                [0,0,1,1,1,1,0,0,1,1,1,1,0,0],
                [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
                [0,1,1,2,2,1,1,1,1,2,2,1,1,0],
                [1,1,2,2,2,2,1,1,2,2,2,2,1,1],
                [1,1,2,2,1,2,2,2,2,1,2,2,1,1],
                [1,1,2,2,2,3,2,2,3,2,2,2,1,1],
                [1,1,2,2,2,2,1,1,2,2,2,2,1,1],
                [0,1,1,2,2,2,2,2,2,2,2,1,1,0],
                [0,1,1,1,2,2,2,2,2,2,1,1,1,0],
                [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
                [1,1,1,1,2,2,2,2,2,2,1,1,1,1],
                [1,1,1,1,2,2,2,2,2,2,1,1,1,1],
            ];
        
            const colorMap: Record<number, Color> = {
                1: new Color('#6B3A2A'),
                2: new Color('#F0E0CC'),
                3: new Color('#EF9137'),
            };
        
            const beanR = 13;
            const gap = beanR * 2 + 2.5;
            const rows = pattern.length;
            const cols = pattern[0].length;
            const ox = -(cols - 1) * gap / 2;
            const oy = (rows - 1) * gap / 2;
        
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const v = pattern[r][c];
                    if (v === 0) continue;
                    const bx = ox + c * gap;
                    const by = oy - r * gap;
                    const base = colorMap[v];
                    // 濞ｈ精澹婃惔鏇炴箑
                    const dark = new Color(
                        Math.max(0, Math.floor(base.r * 0.6)),
                        Math.max(0, Math.floor(base.g * 0.6)),
                        Math.max(0, Math.floor(base.b * 0.6)),
                        255,
                    );
                    const rr = 3;
                    // 濞ｈ精澹婃惔鏇燁攱
                    g.fillColor = dark;
                    g.roundRect(bx - beanR, by - beanR, beanR * 2, beanR * 2, rr);
                    g.fill();
                    // 娑撹缍嬮懝?
                    g.fillColor = base;
                    g.roundRect(bx - beanR + 1.5, by - beanR + 1.5, (beanR - 1.5) * 2, (beanR - 1.5) * 2, rr - 1);
                    g.fill();
                    // X閸掑洭娼版妯哄帨
                    const m = beanR - 2.5;
                    g.fillColor = new Color(255, 255, 255, 50);
                    g.moveTo(bx - m, by + m); g.lineTo(bx + m, by + m); g.lineTo(bx, by); g.close(); g.fill();
                    g.fillColor = new Color(255, 255, 255, 30);
                    g.moveTo(bx - m, by + m); g.lineTo(bx - m, by - m); g.lineTo(bx, by); g.close(); g.fill();
                    g.fillColor = new Color(0, 0, 0, 25);
                    g.moveTo(bx + m, by - m); g.lineTo(bx - m, by - m); g.lineTo(bx, by); g.close(); g.fill();
                }
            }
        
            // 姒ц鐡?
            g.fillColor = new Color('#5A3020');
            const noseY = oy - 6.5 * gap;
            g.ellipse(0, noseY + 3, 8, 5);
            g.fill();
        
            // 閻偐娼?
            const eyeY = oy - 5.5 * gap;
            g.fillColor = new Color('#2A1810');
            g.circle(-2.5 * gap, eyeY, 5);
            g.fill();
            g.circle(2.5 * gap, eyeY, 5);
            g.fill();
            // 閻偐娼ф妯哄帨
            g.fillColor = new Color(255, 255, 255, 200);
            g.circle(-2.5 * gap + 2, eyeY + 2, 2);
            g.fill();
            g.circle(2.5 * gap + 2, eyeY + 2, 2);
            g.fill();
        
            // 鎼存洟鍎撮梼鏉戝
            g.fillColor = new Color(0, 0, 0, 20);
            g.ellipse(0, oy - rows * gap + 10, 180, 18);
            g.fill();
        },

        drawHomeLevelPixelPreview(parent: Node, levelId: number, x: number, y: number) {
            const frameSize = 324;
            parent.getChildByName('HeroCardHint')?.destroy();
            const previewAnchor = this.requireUiChild(parent, 'PreviewAnchor', 'HeroCard/PreviewAnchor');
            previewAnchor.getChildByName('PixelPreview')?.destroy();
            this.drawCollectionPixelPreviewOnCard(previewAnchor, levelId, x, y, frameSize, frameSize);
        },

        drawLivesBanner(parent: Node) {
            const bannerNode = this.requireUiChild(parent, 'LivesBanner', 'VigorGroup/LivesBanner');
            this.requireSceneSpriteFrame(bannerNode, 'VigorGroup/LivesBanner');
            // 閻愮懓鍤担鎾冲閸栧搫鐓欓敍灞炬弓濠娾剝妞傚鐟板毉閻绠嶉崨?
            // Bind to the group so the banner, count, and timer share one hitbox.
            parent.targetOff(this);
            parent.getComponent(Button) || parent.addComponent(Button);
            parent.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                this.showNoLivesAdModal(() => {});
                return;
                if (this.getVigor() < (this.constructor as any).VIGOR_CEILING) {
                    this.showNoLivesAdModal(() => {
                        // 婵″倹鐏夊鎻掔磻婵鐖堕幋蹇撳灟娑撳秹顤傛径鏍ь槱閻?
                    });
                } else {
                    this.showToast('娴ｆ挸濮忓鑼病濠娾€茬啊');
                }
            }, this);
            // 娴ｆ挸濮忛弫鏉跨摟 (banner 娑擃參妫?
            const countLbl = this.requireUiChild(parent, 'VigorCount', 'VigorGroup/VigorCount');
            const vigorLabel = countLbl.getComponent(Label);
            if (!vigorLabel) throw new Error('[HomeScene] Home.scene is missing Label component on VigorGroup/VigorCount');
            vigorLabel.string = `${this.getVigor()}/${(this.constructor as any).VIGOR_CEILING}`;
            this._vigorCountLbl = vigorLabel;
            // 閸婃帟顓搁弮鎯板剹閺?(缁毖冨櫨閸栧懓锛欓弬鍥х摟)
            this.requireUiChild(parent, 'TimeBg', 'VigorGroup/TimeBg');
            // 閸婃帟顓搁弮鑸垫瀮鐎?(鏉堝啫鐨€涙ぞ缍?
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
                this.openGoldShop();
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

        instantiateResultOverlay(name: string): Node {
            throw new Error(`[result-panel] legacy generic overlay "${name}" is disabled; use prefab-backed result panels`);
        },

        createWinSettlementPanel(): Node {
            return ensureGameplayResultPanelController(this).createWinSettlementPanel();
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
