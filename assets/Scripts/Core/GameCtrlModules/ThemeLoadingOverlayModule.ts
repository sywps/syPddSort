import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, instantiate, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
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
import { openCollectionShellOverlay } from '../Panels/CollectionShellOverlay';

function syncThemeTextNode(
    parent: Node,
    name: string,
    text: string,
    fontSize: number,
    color: Color,
    width: number,
    height: number,
    x: number,
    y: number,
    horizontalAlign: number = Label.HorizontalAlign.CENTER,
): Label {
    let node = parent.getChildByName(name);
    if (!node) {
        node = new Node(name);
        parent.addChild(node);
        node.layer = parent.layer || Layers.Enum.UI_2D;
    }
    node.setPosition(x, y, 0);
    const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
    ui.setContentSize(width, height);
    const label = node.getComponent(Label) || node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.max(fontSize + 4, height);
    label.color = color;
    label.horizontalAlign = horizontalAlign;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
    node.active = true;
    return label;
}

function applyThemeSpriteFrame(
    runtime: any,
    node: Node,
    frameName: string,
    width: number,
    height: number,
    color?: Color,
) {
    const frame = runtime.getSF(frameName);
    if (!frame) {
        throw new Error(`[theme-ui] missing sprite frame: ${frameName}`);
    }
    runtime._applySpriteFrame(node, frame, width, height);
    const sprite = node.getComponent(Sprite);
    if (sprite) {
        sprite.color = color || Color.WHITE;
    }
}

function setExistingThemeSprite(
    runtime: any,
    node: Node,
    frameName: string,
    width: number,
    height: number,
    color: Color = Color.WHITE,
): void {
    const frame = runtime.getSF(frameName);
    const sprite = node.getComponent(Sprite);
    if (!frame || !sprite) {
        throw new Error(`[theme-ui] missing prefab sprite state: ${frameName}`);
    }
    (node.getComponent(UITransform) || node.addComponent(UITransform)).setContentSize(width, height);
    sprite.spriteFrame = frame;
    sprite.color = color;
}

export function installThemeLoadingOverlayModule(target: any): void {
    Object.assign(target, {
        drawThemeCard(
            parent: Node,
            levelId: number,
            cx: number,
            cy: number,
            w: number,
            h: number,
            isUnlocked: boolean,
            isCompleted: boolean,
            canUnlock: boolean,
            unlockRequirementLevel: number,
            levelName: string = '',
        ) {
            const existing = parent.getChildByName(`ThemeCard_${levelId}`);
            const template = parent.getChildByName('ThemeCardTemplate');
            if (!template) {
                throw new Error('[theme-card] missing ThemeCardTemplate');
            }
            const card = existing || instantiate(template);
            if (!existing) {
                parent.addChild(card);
            }
            card.name = `ThemeCard_${levelId}`;
            card.active = true;
            (card.getComponent(UITransform) || card.addComponent(UITransform)).setContentSize(w, h);
            card.layer = parent.layer || Layers.Enum.UI_2D;
            card.setPosition(cx, cy);
            setExistingThemeSprite(this, card, isUnlocked ? 'popup_card_unlocked' : 'popup_card_locked', w, h);
        
            // 裁剪：确保子内容不超出卡片边界
            const clipNode = card.getChildByName('CardClip');
            if (!clipNode) {
                throw new Error('[theme-card] missing CardClip template node');
            }
            clipNode.active = true;
            (clipNode.getComponent(UITransform) || clipNode.addComponent(UITransform)).setContentSize(w - 4, h - 4);
            clipNode.layer = card.layer;
            (clipNode.getComponent(Mask) || clipNode.addComponent(Mask)).type = Mask.Type.GRAPHICS_RECT;
        
            const nameNode = clipNode.getChildByName('ThemeLvName');
            if (levelName) {
                syncThemeTextNode(clipNode, 'ThemeLvName', levelName, 20, new Color('#5A4A3A'), w - 32, 28, 0, h / 2 - 18);
            } else if (nameNode) {
                nameNode.active = false;
            }
        
            // 像素图预览容器（先创建占位节点，确保在 btn 前面）
            const previewContainer = clipNode.getChildByName('PreviewContainer');
            if (!previewContainer) {
                throw new Error('[theme-card] missing PreviewContainer template node');
            }
            previewContainer.active = true;
            (previewContainer.getComponent(UITransform) || previewContainer.addComponent(UITransform)).setContentSize(1, 1);
            previewContainer.layer = clipNode.layer;
            for (const child of previewContainer.children.slice()) {
                child.destroy();
            }
        
            // 底部按钮（开始 / 看广告解锁）— 在 preview 之后 addChild，渲染层级更高
            const btn = clipNode.getChildByName('ThemeCardBtn');
            if (!btn) {
                throw new Error('[theme-card] missing ThemeCardBtn template node');
            }
            const btnW = 138;
            const btnH = 48;
            btn.active = true;
            (btn.getComponent(UITransform) || btn.addComponent(UITransform)).setContentSize(btnW, btnH);
            btn.layer = clipNode.layer;
            btn.setPosition(0, -h / 2 + btnH / 2 + 10);
            let buttonText = '';
            if (isUnlocked) {
                setExistingThemeSprite(this, btn, isCompleted ? 'popup_secondary_button' : 'popup_primary_button', btnW, btnH);
                buttonText = isCompleted ? '已通关' : '开始';
            } else if (canUnlock) {
                setExistingThemeSprite(this, btn, 'popup_secondary_button', btnW, btnH);
                buttonText = '看广告解锁';
            } else {
                setExistingThemeSprite(this, btn, 'popup_secondary_button', btnW, btnH, new Color('#C9B8A2'));
                buttonText = `主线${unlockRequirementLevel}关开放`;
            }
            syncThemeTextNode(btn, 'ThemeBtnLbl', buttonText, isUnlocked && !isCompleted ? 22 : 18, Color.WHITE, btnW - 12, btnH - 6, 0, 0);
        
            if (!btn.getComponent(Button)) btn.addComponent(Button);
            btn.targetOff(this);
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play(isCompleted ? 'uiPanel' : 'button');
                if (isUnlocked) {
                    if (isCompleted) {
                        this.openThemeImageModal(levelId, levelName);
                    } else {
                        this.startThemeLevel(levelId);
                    }
                } else if (canUnlock) {
                    this.unlockThemeLevelByAd(levelId);
                } else {
                    this.showToast(`主线到第${unlockRequirementLevel}关后可解锁这一关`);
                }
            }, this);
        
            // 异步加载像素图 — 添加到 previewContainer 中（始终在 btn 下层）
            const nameSpace = levelName ? 30 : 0;
            const btnSpace = btnH + 16;
            const areaTop = h / 2 - nameSpace;
            const areaBot = -h / 2 + btnSpace;
            const availH = areaTop - areaBot;
            const availCenterY = (areaTop + areaBot) / 2;
            this.drawThemePixelPreview(previewContainer, levelId, 0, availCenterY, w - 24, availH);
        },

        /** 在主题卡片上绘制像素图预览（基于 zt_level_xxx.json 的 correctColorArr） */
        drawThemePixelPreview(parent: Node, levelId: number, offsetX: number, offsetY: number, maxW: number, maxH: number) {
            this.drawCollectionPixelPreviewOnCard(parent, levelId, offsetX, offsetY, maxW, maxH, 'zt_level_');
        },

        startThemeLevel(levelId: number) {
            this.closeThemePanel();
            if (this.getRuntimeSceneName('Game') === 'Home') {
                void this.requestGameplaySceneTransition(levelId, 'zt_level_', false);
                return;
            }
            this.deactivateMainMenuNode();
            this.loadThemeLevel(levelId);
        },

        closeThemeImageModal() {
            if (this._themeImageModal) {
                this._themeImageModal.destroy();
            }
            this._themeImageModal = null;
        },

        openThemeImageModal(levelId: number, levelName: string = '') {
            this.closeThemeImageModal();
            openCollectionShellOverlay(this, {
                overlayName: 'ThemeImageModal',
                siblingIndex: 1001,
                onClose: () => {
                    this._themeImageModal = null;
                },
                onReady: ({ overlay, box, content, pageIndicator, leftArrow, rightArrow, close }) => {
                    this._themeImageModal = overlay;
                    content.removeAllChildren();
                    const title = levelName || this.findThemeLevelName(levelId) || `主题关 ${levelId}`;
                    pageIndicator.active = true;
                    pageIndicator.setPosition(0, 408, 0);
                    syncThemeTextNode(pageIndicator, 'ThemePixelTitle', title, 22, new Color('#5A4A3A'), 320, 36, 0, 0);
                    this.drawCollectionPatternOnCard(content, levelId, 0, 10, 548, 760, 'zt_level_');

                    leftArrow.active = false;
                    rightArrow.active = true;
                    rightArrow.setPosition(0, -404, 0);
                    const rightArrowUi = rightArrow.getComponent(UITransform) || rightArrow.addComponent(UITransform);
                    rightArrowUi.setContentSize(220, 56);
                    applyThemeSpriteFrame(this, rightArrow, 'home_start_button', 220, 56, new Color('#3AA8E0'));
                    syncThemeTextNode(rightArrow, 'ThemePixelStartLbl', '再玩一次', 24, Color.WHITE, 180, 32, 0, 0);
                    this.bindPanelButton(rightArrow, () => {
                        AudioMgr.inst.play('uiPanel');
                        close();
                        this.startThemeLevel(levelId);
                    });
                },
            });
        },

        unlockThemeLevelByAd(levelId: number) {
            if (this._adShowing) return;
            if (!this.canUnlockThemeLevelByMainProgress(levelId)) {
                const requirementLevel = this.getThemeUnlockRequirementLevel(levelId);
                this.showToast(`主线到第${requirementLevel}关后可解锁这一关`);
                return;
            }
            this._adShowing = true;
            this.showTrackedRewardedAd('theme_unlock', (success: boolean) => {
                this._adShowing = false;
                if (success) {
                    this.setThemeUnlocked(levelId);
                    this.refreshThemePanel();
                    this.showToast('解锁成功');
                } else {
                    this.showToast('广告未完成，未解锁');
                }
            }, { levelId });
        },

        refreshThemePanel() {
            if (!this._themeOverlay) return;
            this.closeThemePanel();
            this.openThemePanel();
        },

        closeThemePanel() {
            this.closeThemeImageModal();
            if (this._themeOverlay && this._themeOverlay.isValid) {
                this._themeOverlay.destroy();
            }
            this._themeOverlay = null;
        },

        returnToThemePanel() {
            this._isThemeLevel = false;
            this._currentThemeLevelId = 0;
            this.showMainMenu();
            this.scheduleOnce(() => this.openThemePanel(), 0.05);
        },

        /**
         * 主题关卡通关后分享：
         *   - 微信小游戏：调用 wx.shareAppMessage 转发到聊天
         *   - 抖音小游戏：调用 tt.shareAppMessage 分享
         *   - 其它环境：toast 提示并回到主题面板
         */
        shareThemeLevel() {
            const levelId = this._currentThemeLevelId || (this.levelData?.levelId ?? 0);
            const themeName = this.findThemeNameByLevelId(levelId);
            const levelName = (this.levelData as any)?.levelName || '';
            const title = themeName
                ? `我在拼豆豆完成了【${themeName}-${levelName || levelId}】，快来挑战！`
                : `我在拼豆豆完成了一个图案，快来挑战！`;
            AnalyticsMgr.inst.trackShareClick('theme_level', 'theme_share', levelId);
        
            const wx: any = this.getWeChatRuntime();
            const tt: any = (typeof globalThis !== 'undefined' ? (globalThis as any).tt : null)
                || (typeof window !== 'undefined' ? (window as any).tt : null);
        
            const onShared = () => {
                this.returnToThemePanel();
            };
        
            if (wx && typeof wx.shareAppMessage === 'function') {
                try {
                    wx.shareAppMessage({
                        title,
                        query: `level=${levelId}&theme=1`,
                        imageUrl: '',
                        success: () => {
                            AnalyticsMgr.inst.trackShareSuccess('theme_level', 'theme_share', levelId);
                            this.showToast('分享成功');
                            onShared();
                        },
                        fail: () => {
                            this.showToast('分享已取消');
                            onShared();
                        },
                    });
                } catch (e) {
                    console.warn('[shareThemeLevel] wx.shareAppMessage error:', e);
                    this.showToast('分享失败');
                    onShared();
                }
                return;
            }
        
            if (tt && typeof tt.shareAppMessage === 'function') {
                try {
                    tt.shareAppMessage({
                        channel: 'video',
                        title,
                        desc: title,
                        query: `level=${levelId}&theme=1`,
                        success: () => { AnalyticsMgr.inst.trackShareSuccess('theme_level', 'theme_share', levelId); this.showToast('分享成功'); onShared(); },
                        fail: () => { this.showToast('分享已取消'); onShared(); },
                    });
                } catch (e) {
                    console.warn('[shareThemeLevel] tt.shareAppMessage error:', e);
                    this.showToast('分享失败');
                    onShared();
                }
                return;
            }
        
            // 未识别平台：直接回到主题面板
            this.showToast('请在微信/抖音中分享');
            onShared();
        },

        shareCurrentWinLevel() {
            const levelId = this.getActiveLogicalLevelId();
            const title = `我在拼豆豆通关了第${levelId}关，快来一起挑战！`;
            AnalyticsMgr.inst.trackShareClick('level_win', 'win_share', levelId);
        
            const wx: any = this.getWeChatRuntime();
            const tt: any = (typeof globalThis !== 'undefined' ? (globalThis as any).tt : null)
                || (typeof window !== 'undefined' ? (window as any).tt : null);
        
            if (wx && typeof wx.shareAppMessage === 'function') {
                try {
                    wx.shareAppMessage({
                        title,
                        query: `level=${levelId}`,
                        imageUrl: '',
                        success: () => {
                            AnalyticsMgr.inst.trackShareSuccess('level_win', 'win_share', levelId);
                            this.showToast('分享成功');
                        },
                        fail: () => {
                            this.showToast('分享已取消');
                        },
                    });
                } catch (e) {
                    console.warn('[shareCurrentWinLevel] wx.shareAppMessage error:', e);
                    this.showToast('分享失败');
                }
                return;
            }
        
            if (tt && typeof tt.shareAppMessage === 'function') {
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

        findThemeNameByLevelId(levelId: number): string {
            for (const g of this.getThemeGroups()) {
                if (g.levelIds.indexOf(levelId) >= 0) return g.name;
            }
            return '';
        },

        findThemeLevelName(levelId: number): string {
            for (const g of this.getThemeGroups()) {
                const idx = g.levelIds.indexOf(levelId);
                if (idx >= 0) {
                    return g.levelNames && g.levelNames[idx] ? g.levelNames[idx] : '';
                }
            }
            return '';
        },

        // ==================== 加载封面 ====================
        
        /** 显示全屏加载封面（资源加载期间覆盖屏幕） */
        showLoadingOverlay() {
            if (this._loadingOverlay) return;
            if (!this.loadingCover) throw new Error('[LoadingOverlay] loadingCover is not assigned');
            const overlayVersion = (this._loadingOverlayVersion || 0) + 1;
            this._loadingOverlayVersion = overlayVersion;
            const visibleSize = this._getLoadingVisibleSize();
            const overlayParent = this.requireCanvasUiRoot('BootRoot');
            const layer = this.requireUiChild(overlayParent, 'StartupLoadingUI', 'BootRoot/StartupLoadingUI');
            const layerUT = layer.getComponent(UITransform);
            if (!layerUT) throw new Error('[LoadingScene] Loading.scene is missing UITransform on BootRoot/StartupLoadingUI');
            layerUT.setContentSize(visibleSize.width, visibleSize.height);
            layer.setPosition(0, 0, 0);
            layer.layer = Layers.Enum.UI_2D;
            layer.active = true;
            if (!layer.getComponent(BlockInputEvents)) {
                layer.addComponent(BlockInputEvents);
            }
            this._loadingOverlay = layer;
            this._loadingClosing = false;
            this._buildLoadingCover(layer, visibleSize);
            this._startLoadingProgressIntro(overlayVersion);
        },

        _getLoadingVisibleSize(): Size {
            const viewSize = view.getVisibleSize();
            const frameSize = view.getFrameSize();
            let width = Math.max(viewSize.width || 0, (this.constructor as any).VIEWPORT_WIDTH);
            let height = Math.max(viewSize.height || 0, (this.constructor as any).VIEWPORT_HEIGHT);
            if (frameSize.width > 0 && frameSize.height > 0) {
                const frameAspect = frameSize.width / frameSize.height;
                height = Math.max(height, width / frameAspect);
                width = Math.max(width, height * frameAspect);
            }
            if (width > 0 && height > 0) {
                return new Size(Math.ceil(width), Math.ceil(height));
            }
            return new Size((this.constructor as any).VIEWPORT_WIDTH, (this.constructor as any).VIEWPORT_HEIGHT);
        },

        _getLoadingCoverSourceSize(sf: SpriteFrame): Size {
            const rect = sf.rect;
            const width = Math.max(rect?.width || 0, (this.constructor as any).VIEWPORT_WIDTH);
            const height = Math.max(rect?.height || 0, (this.constructor as any).VIEWPORT_HEIGHT);
            return new Size(width, height);
        },

        _buildLoadingCover(layer: Node, visibleSize: Size) {
            const cover = this.requireUiChild(layer, 'LoadingCover', 'StartupLoadingUI/LoadingCover');
            cover.setPosition(0, 0, 0);
            const currentFrame = cover.getComponent(Sprite)?.spriteFrame || this.loadingCover!;
            const sourceSize = this._getLoadingCoverSourceSize(currentFrame);
            const targetW = visibleSize.width + (this.constructor as any).LOADING_COVER_BLEED * 2;
            const targetH = visibleSize.height + (this.constructor as any).LOADING_COVER_BLEED * 2;
            const coverScale = Math.max(
                targetW / sourceSize.width,
                targetH / sourceSize.height,
            );
            this._applySpriteFrame(
                cover,
                currentFrame,
                sourceSize.width * coverScale,
                sourceSize.height * coverScale,
            );
        
            this._buildLoadingProgressBar(layer, visibleSize);
        },

        _buildLoadingProgressBar(layer: Node, visibleSize: Size) {
            const w = (this.constructor as any).LOADING_BAR_WIDTH;
            const h = (this.constructor as any).LOADING_BAR_HEIGHT;
            const y = -visibleSize.height / 2 + visibleSize.height / 3;
            const group = this.requireUiChild(layer, 'LoadingProgressGroup', 'StartupLoadingUI/LoadingProgressGroup');
            const groupUI = group.getComponent(UITransform);
            if (!groupUI) throw new Error('[LoadingScene] Loading.scene is missing UITransform on StartupLoadingUI/LoadingProgressGroup');
            groupUI.setContentSize(w + 60, 132);
            group.setPosition(0, y, 0);

            const labelShadowNode = this.requireUiChild(group, 'LoadingPercentLabelShadow', 'LoadingProgressGroup/LoadingPercentLabelShadow');
            const shadowLabel = labelShadowNode.getComponent(Label);
            if (!shadowLabel) throw new Error('[LoadingScene] Loading.scene is missing Label component on LoadingProgressGroup/LoadingPercentLabelShadow');
            shadowLabel.string = '正在加载：0%';
            shadowLabel.enableWrapText = false;
            this._loadingProgressLabelShadow = shadowLabel;

            const labelNode = this.requireUiChild(group, 'LoadingPercentLabel', 'LoadingProgressGroup/LoadingPercentLabel');
            const label = labelNode.getComponent(Label);
            if (!label) throw new Error('[LoadingScene] Loading.scene is missing Label component on LoadingProgressGroup/LoadingPercentLabel');
            label.string = '正在加载：0%';
            label.enableWrapText = false;
            this._loadingProgressLabel = label;
            this._setLoadingProgressPercentText(0);

            const glow = this.requireUiChild(group, 'LoadingBarGlow', 'LoadingProgressGroup/LoadingBarGlow');
            const glowGraphics = glow.getComponent(Graphics) || glow.addComponent(Graphics);
            glowGraphics.clear();
            const glowUI = glow.getComponent(UITransform);
            if (!glowUI) throw new Error('[LoadingScene] Loading.scene is missing UITransform on LoadingProgressGroup/LoadingBarGlow');
            glowGraphics.fillColor = new Color(255, 255, 255, 58);
            glowGraphics.roundRect(-glowUI.width / 2, -glowUI.height / 2, glowUI.width, glowUI.height, glowUI.height / 2);
            glowGraphics.fill();

            const track = this.requireUiChild(group, 'LoadingBarTrack', 'LoadingProgressGroup/LoadingBarTrack');
            const trackGraphics = track.getComponent(Graphics) || track.addComponent(Graphics);
            trackGraphics.clear();
            const trackUI = track.getComponent(UITransform);
            if (!trackUI) throw new Error('[LoadingScene] Loading.scene is missing UITransform on LoadingProgressGroup/LoadingBarTrack');
            const radius = trackUI.height / 2;
            trackGraphics.fillColor = new Color(255, 255, 255, 60);
            trackGraphics.roundRect(-trackUI.width / 2, -trackUI.height / 2, trackUI.width, trackUI.height, radius);
            trackGraphics.fill();
            trackGraphics.strokeColor = new Color(255, 255, 255, 210);
            trackGraphics.lineWidth = 3;
            trackGraphics.roundRect(-trackUI.width / 2, -trackUI.height / 2, trackUI.width, trackUI.height, radius);
            trackGraphics.stroke();

            const fillW = w - 14;
            const fillH = Math.max(6, h - 6);
            const fill = this.requireUiChild(group, 'LoadingBarFill', 'LoadingProgressGroup/LoadingBarFill');
            fill.setScale(0, 1, 1);
            const fillGraphics = fill.getComponent(Graphics) || fill.addComponent(Graphics);
            fillGraphics.clear();
            const fillUI = fill.getComponent(UITransform);
            if (!fillUI) throw new Error('[LoadingScene] Loading.scene is missing UITransform on LoadingProgressGroup/LoadingBarFill');
            fillGraphics.fillColor = new Color('#52D997');
            fillGraphics.roundRect(0, -fillUI.height / 2, fillUI.width, fillUI.height, fillUI.height / 2);
            fillGraphics.fill();
            this._loadingProgressFill = fill;

            const fillHighlight = this.requireUiChild(fill, 'LoadingBarFillHighlight', 'LoadingBarFill/LoadingBarFillHighlight');
            const highlightGraphics = fillHighlight.getComponent(Graphics) || fillHighlight.addComponent(Graphics);
            highlightGraphics.clear();
            const highlightUI = fillHighlight.getComponent(UITransform);
            if (!highlightUI) throw new Error('[LoadingScene] Loading.scene is missing UITransform on LoadingBarFill/LoadingBarFillHighlight');
            highlightGraphics.fillColor = new Color(255, 255, 255, 72);
            highlightGraphics.roundRect(-highlightUI.width / 2, -highlightUI.height / 2, highlightUI.width, highlightUI.height, highlightUI.height / 2);
            highlightGraphics.fill();
        
            const shine = this.requireUiChild(fill, 'LoadingBarShine', 'LoadingBarFill/LoadingBarShine');
            const shineGraphics = shine.getComponent(Graphics) || shine.addComponent(Graphics);
            shineGraphics.clear();
            const shineUI = shine.getComponent(UITransform);
            if (!shineUI) throw new Error('[LoadingScene] Loading.scene is missing UITransform on LoadingBarFill/LoadingBarShine');
            shineGraphics.fillColor = new Color(255, 255, 255, 108);
            shineGraphics.roundRect(-shineUI.width / 2, -shineUI.height / 2, shineUI.width, shineUI.height, shineUI.height / 2);
            shineGraphics.fill();
            this._loadingShine = shine;
            this._startLoadingShine();
        },

        _startLoadingProgressIntro(overlayVersion: number) {
            this._setLoadingProgress(0, 0, overlayVersion);
            this.scheduleOnce(() => {
                if (this._loadingOverlayVersion !== overlayVersion || this._loadingClosing || !this._loadingOverlay) return;
                this._setLoadingProgress(0.5, 0.2, overlayVersion);
            }, 0);
            this.scheduleOnce(() => {
                if (this._loadingOverlayVersion !== overlayVersion || this._loadingClosing || !this._loadingOverlay) return;
                this._setLoadingProgress(0.8, 0.4, overlayVersion);
            }, 0.22);
        },

        _setLoadingProgress(progress: number, duration = 0.2, overlayVersion: number = this._loadingOverlayVersion || 0) {
            const fill = this._loadingProgressFill;
            const prev = this._loadingProgress;
            const next = Math.max(this._loadingProgress, Math.max(0, Math.min(1, progress)));
            this._loadingProgress = next;
            this._animateLoadingProgressPercent(prev, next, duration, overlayVersion);
            if (!fill) return;
            Tween.stopAllByTarget(fill);
            if (duration <= 0) {
                fill.setScale(next, 1, 1);
                return;
            }
            tween(fill).to(duration, { scale: new Vec3(next, 1, 1) }, { easing: 'sineOut' }).start();
        },

        _setLoadingProgressPercentText(percent: number) {
            const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
            this._loadingProgressPercent = safePercent;
            if (this._loadingProgressLabel) {
                this._loadingProgressLabel.string = `正在加载：${safePercent}%`;
            }
            if (this._loadingProgressLabelShadow) {
                this._loadingProgressLabelShadow.string = `正在加载：${safePercent}%`;
            }
        },

        _animateLoadingProgressPercent(from: number, to: number, duration: number, overlayVersion: number = this._loadingOverlayVersion || 0) {
            if (this._loadingProgressLabelTween) {
                this._loadingProgressLabelTween.stop();
                this._loadingProgressLabelTween = null;
            }
            const fromPercent = this._loadingProgressPercent || Math.round(from * 100);
            const toPercent = Math.round(to * 100);
            const applyPercentText = (percent: number) => {
                if (this._loadingOverlayVersion !== overlayVersion) {
                    return;
                }
                const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
                this._loadingProgressPercent = safePercent;
                if (this._loadingProgressLabel) {
                    this._loadingProgressLabel.string = `正在加载：${safePercent}%`;
                }
                if (this._loadingProgressLabelShadow) {
                    this._loadingProgressLabelShadow.string = `正在加载：${safePercent}%`;
                }
            };
            if (duration <= 0 || fromPercent === toPercent) {
                applyPercentText(toPercent);
                return;
            }
            const state = { value: fromPercent };
            this._loadingProgressLabelTween = tween(state)
                .to(duration, { value: toPercent }, {
                    easing: 'sineOut',
                    onUpdate: (target: { value: number }) => {
                        applyPercentText(target.value);
                    },
                })
                .call(() => {
                    applyPercentText(toPercent);
                    if (this._loadingOverlayVersion === overlayVersion) {
                        this._loadingProgressLabelTween = null;
                    }
                })
                .start();
        },

        _startLoadingShine() {
            const shine = this._loadingShine;
            const fill = this._loadingProgressFill;
            if (!shine) return;
            const fillWidth = fill?.getComponent(UITransform)?.width || ((this.constructor as any).LOADING_BAR_WIDTH - 14);
            this._loadingShineTween = tween(shine)
                .set({ position: new Vec3(24, 0, 0) })
                .to(0.9, { position: new Vec3(fillWidth - 24, 0, 0) }, { easing: 'sineInOut' })
                .delay(0.2)
                .union()
                .repeatForever()
                .start();
        },

        _stopLoadingShine() {
            if (this._loadingShineTween) {
                this._loadingShineTween.stop();
                this._loadingShineTween = null;
            }
            if (this._loadingProgressLabelTween) {
                this._loadingProgressLabelTween.stop();
                this._loadingProgressLabelTween = null;
            }
        },

        hideLoadingOverlayAfterGameplayReady() {
            if (!this._loadingOverlay) return;
            this.scheduleOnce(() => this.hideLoadingOverlay(), 0);
        },

        /** 隐藏并销毁加载封面 */
        hideLoadingOverlay() {
            if (!this._loadingOverlay) return;
            if (this._loadingClosing) return;
            this._loadingClosing = true;
            const overlayVersion = this._loadingOverlayVersion || 0;
            this._setLoadingProgress(1, 0, overlayVersion);
            this._stopLoadingShine();
            this._loadingOverlayVersion = overlayVersion + 1;
            if ((this._loadingOverlay as any).__uiCreatedByRuntime) {
                this._loadingOverlay.destroy();
            } else {
                this._loadingOverlay.active = false;
            }
            this._loadingOverlay = null;
            this._loadingProgressFill = null;
            this._loadingProgressLabel = null;
            this._loadingProgressLabelShadow = null;
            this._loadingShine = null;
            this._loadingProgress = 0;
            this._loadingProgressPercent = 0;
            this._loadingClosing = false;
        },
    });
}
