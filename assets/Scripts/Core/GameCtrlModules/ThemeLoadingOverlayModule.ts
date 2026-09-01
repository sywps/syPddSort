import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, ProgressBar, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
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
import { AppRoot } from '../AppRoot';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { openCollectionShellOverlay } from '../Panels/CollectionShellOverlay';
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
            imageUrl: '',
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
    const node = parent.getChildByName(name);
    const label = node?.getComponent(Label) || null;
    if (!node?.isValid || !label) {
        throw new Error(`[theme-ui] missing prefab Label: ${parent.name}/${name}`);
    }
    node.setPosition(x, y, 0);
    const ui = node.getComponent(UITransform);
    if (!ui) {
        throw new Error(`[theme-ui] missing prefab UITransform: ${parent.name}/${name}`);
    }
    ui.setContentSize(width, height);
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

type ThemeCardState = 'completed' | 'unlocked' | 'canUnlock' | 'locked';

const THEME_CARD_STATE_NODE_NAMES: Record<ThemeCardState, string[]> = {
    completed: ['CompletedState', 'ThemeCompletedState', 'ThemeCardCompletedState', 'ThemeBtnCompletedState'],
    unlocked: ['UnlockedState', 'ThemeUnlockedState', 'ThemeCardUnlockedState', 'ThemeBtnUnlockedState'],
    canUnlock: ['CanUnlockState', 'UnlockableState', 'ThemeCanUnlockState', 'ThemeCardCanUnlockState', 'ThemeBtnCanUnlockState'],
    locked: ['LockedState', 'ThemeLockedState', 'ThemeCardLockedState', 'ThemeBtnLockedState'],
};

const ALL_THEME_CARD_STATE_NODE_NAMES = [
    ...THEME_CARD_STATE_NODE_NAMES.completed,
    ...THEME_CARD_STATE_NODE_NAMES.unlocked,
    ...THEME_CARD_STATE_NODE_NAMES.canUnlock,
    ...THEME_CARD_STATE_NODE_NAMES.locked,
];

function setOptionalThemeStateNodes(root: Node, state: ThemeCardState): void {
    const allStateNames = new Set<string>(ALL_THEME_CARD_STATE_NODE_NAMES);
    const activeNames = new Set<string>(THEME_CARD_STATE_NODE_NAMES[state]);
    for (const child of root.children) {
        if (allStateNames.has(child.name)) {
            child.active = activeNames.has(child.name);
        }
    }
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
            options: { deferPreview?: boolean } = {},
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
            card.layer = parent.layer || Layers.Enum.UI_2D;
            card.setPosition(cx, cy);
            const cardUi = card.getComponent(UITransform);
            if (!cardUi) {
                throw new Error('[theme-card] ThemeCardTemplate must provide UITransform');
            }
            const cardState: ThemeCardState = isUnlocked ? (isCompleted ? 'completed' : 'unlocked') : (canUnlock ? 'canUnlock' : 'locked');
            setOptionalThemeStateNodes(card, cardState);

            const clipNode = card.getChildByName('CardClip');
            if (!clipNode) {
                throw new Error('[theme-card] missing CardClip template node');
            }
            clipNode.layer = card.layer;
            if (!clipNode.getComponent(Mask)) {
                throw new Error('[theme-card] CardClip template must provide Mask');
            }

            const nameNode = clipNode.getChildByName('ThemeLvName');
            const nameLabel = nameNode?.getComponent(Label);
            if (levelName) {
                if (!nameNode || !nameLabel) {
                    throw new Error('[theme-card] ThemeCardTemplate is missing ThemeLvName label');
                }
                nameLabel.string = levelName;
            } else if (nameLabel) {
                nameLabel.string = '';
            }

            const previewContainer = clipNode.getChildByName('PreviewContainer');
            if (!previewContainer) {
                throw new Error('[theme-card] missing PreviewContainer template node');
            }
            previewContainer.layer = clipNode.layer;
            const previewUi = previewContainer.getComponent(UITransform);
            if (!previewUi) {
                throw new Error('[theme-card] PreviewContainer template must provide UITransform');
            }
            for (const child of previewContainer.children.slice()) {
                child.destroy();
            }

            const btn = card.getChildByName('ThemeCardBtn');
            if (!btn) {
                throw new Error('[theme-card] missing ThemeCardBtn template node');
            }
            btn.layer = card.layer;
            setOptionalThemeStateNodes(btn, cardState);
            let buttonText = '';
            if (isUnlocked) {
                buttonText = isCompleted ? '已通关' : '开始';
            } else if (canUnlock) {
                buttonText = '看广告解锁';
            } else {
                buttonText = `${unlockRequirementLevel}关开放`;
            }
            const btnLabelNode = btn.getChildByName('ThemeBtnLbl');
            const btnLabel = btnLabelNode?.getComponent(Label);
            if (!btnLabelNode || !btnLabel) {
                throw new Error('[theme-card] ThemeCardBtn is missing ThemeBtnLbl label');
            }
            btnLabel.string = buttonText;

            if (!btn.getComponent(Button)) {
                throw new Error('[theme-card] ThemeCardBtn template must provide Button');
            }
            btn.targetOff(this);
            btn.on(Button.EventType.CLICK, () => {
                if (this._themeOverlay && this._themeScrollSuppressClick) {
                    this._themeScrollSuppressClick = false;
                    return;
                }
                AudioMgr.inst.play('button');
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

            if (!options.deferPreview) {
                this.drawThemePixelPreview(previewContainer, levelId, 0, 0, previewUi.width, previewUi.height);
            }
            return {
                card,
                previewContainer,
                previewW: previewUi.width,
                previewH: previewUi.height,
            };
        },

        /** 在主题卡片上绘制像素图预览（基于 zt_level_xxx.json 的 correctColorArr） */
        drawThemePixelPreview(parent: Node, levelId: number, offsetX: number, offsetY: number, maxW: number, maxH: number) {
            this.drawCollectionPixelPreviewOnCard(parent, levelId, offsetX, offsetY, maxW, maxH, 'zt_level_', {
                maxCellSize: Math.max(maxW, maxH),
                padding: 0,
            });
        },

        startThemeLevel(levelId: number, options: { suppressFailureToast?: boolean } = {}): boolean | Promise<boolean> {
            const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
            const onFail = (error: unknown): false => {
                console.error('[theme_unlock] start theme level failed:', { levelId: normalizedLevelId, error });
                if (!options.suppressFailureToast) {
                    this.showToast('像素关启动失败，请重试');
                }
                this.scheduleOnce(() => {
                    if (!this.isValid) return;
                    this.openThemePanel();
                }, 0.05);
                return false;
            };
            this.closeThemePanel();
            if (this.getRuntimeSceneName('Game') === 'Home') {
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

        closeThemeImageModal() {
            if (this._themeImageModal) {
                this._themeImageModal.destroy();
            }
            this._themeImageModal = null;
        },

        openThemeImageModal(levelId: number, levelName: string = '') {
            this.closeThemeImageModal();
            const title = levelName || this.findThemeLevelName(levelId) || `像素关 ${levelId}`;
            openCollectionShellOverlay(this, {
                overlayName: 'ThemeImageModal',
                prefabPath: 'UI/Prefabs/Panels/ThemePanel',
                title,
                siblingIndex: 1001,
                requireActionNodes: false,
                onClose: () => {
                    this._themeImageModal = null;
                },
                onReady: ({ overlay, content, pageIndicator, leftArrow, rightArrow, close }) => {
                    this._themeImageModal = overlay;
                    content.removeAllChildren();
                    if (pageIndicator) {
                        pageIndicator.active = true;
                        pageIndicator.setPosition(0, 408, 0);
                        syncThemeTextNode(pageIndicator, 'ThemePixelTitle', title, 22, new Color('#5A4A3A'), 320, 36, 0, 0);
                    }
                    this.drawCollectionPatternOnCard(content, levelId, 0, 10, 548, 760, 'zt_level_');

                    if (leftArrow) leftArrow.active = false;
                    if (rightArrow) {
                        rightArrow.active = true;
                        rightArrow.setPosition(0, -404, 0);
                        const rightArrowUi = rightArrow.getComponent(UITransform) || rightArrow.addComponent(UITransform);
                        rightArrowUi.setContentSize(220, 56);
                        applyThemeSpriteFrame(this, rightArrow, 'popup_primary_button', 220, 56, new Color('#3AA8E0'));
                        syncThemeTextNode(rightArrow, 'ThemePixelStartLbl', '再玩一次', 24, Color.WHITE, 180, 32, 0, 0);
                        this.bindPanelButton(rightArrow, () => {
                            AudioMgr.inst.play('button');
                            close();
                            this.startThemeLevel(levelId);
                        });
                    }
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
            this.runRewardedGrant('theme_unlock', () => {
                const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
                if (!this.setThemeUnlocked(normalizedLevelId)) {
                    return false;
                }
                const unlocked = this.getThemeUnlockedSet();
                const verified = unlocked.has(normalizedLevelId);
                if (!verified) {
                    console.error('[theme_unlock] unlocked level missing after grant:', {
                        levelId: normalizedLevelId,
                        unlocked: Array.from(unlocked),
                    });
                }
                return verified;
            }, {
                busyFlag: '_adShowing',
                levelId,
                adFailToast: '广告未完成，未解锁',
                grantFailToast: '解锁保存失败，请重试',
                successToast: '解锁成功',
                afterGrantFailToast: '像素关启动失败，请重试',
                afterGrant: () => this.startThemeLevel(levelId, { suppressFailureToast: true }),
            });
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
        },

        /**
         * 像素拼图关卡通关后分享：
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
            const wx: any = this.getWeChatRuntime();
            const tt: any = (typeof globalThis !== 'undefined' ? (globalThis as any).tt : null)
                || (typeof window !== 'undefined' ? (window as any).tt : null);

            const onShared = () => {
                this.returnToThemePanel();
            };

            if (wx && typeof wx.shareAppMessage === 'function') {
                startWeChatDisplayShare(this, {
                    shareType: 'theme_level',
                    page: 'theme_share',
                    levelId,
                    title,
                    query: `level=${levelId}&theme=1`,
                    onQualified: () => {
                        this.showToast('分享成功');
                        onShared();
                    },
                    onRejected: (reason) => {
                        this.showToast(getWeChatShareReturnToast(reason));
                        onShared();
                    },
                });
                return;
            }

            if (tt && typeof tt.shareAppMessage === 'function') {
                AnalyticsMgr.inst.trackShareClick('theme_level', 'theme_share', levelId);
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
            if (this._loadingOwnerToken) {
                this.releaseRuntimeOwner?.(this._loadingOwnerToken);
            }
            this._loadingOwnerToken = this.acquireRuntimeOwner?.('loading', `overlay-${overlayVersion}`) || '';
            const visibleSize = this._getLoadingVisibleSize();
            const overlayParent = this.requireCanvasUiRoot('BootRoot');
            const layer = this.requireUiChild(overlayParent, 'StartupLoadingUI', 'BootRoot/StartupLoadingUI');
            const layerUT = layer.getComponent(UITransform);
            if (!layerUT) throw new Error('[BootScene] Boot.scene is missing UITransform on BootRoot/StartupLoadingUI');
            layerUT.setContentSize(visibleSize.width, visibleSize.height);
            layer.setPosition(0, 0, 0);
            layer.layer = Layers.Enum.UI_2D;
            layer.active = true;
            const blocker = layer.getComponent(BlockInputEvents) || layer.addComponent(BlockInputEvents);
            blocker.enabled = true;
            this._loadingOverlay = layer;
            this._loadingClosing = false;
            this._buildLoadingCover(layer, visibleSize);
            this._startLoadingProgressIntro(overlayVersion);
        },

        setGameplayStartupRootVisible(visible: boolean): void {
            const canvas = this.node?.scene?.getChildByName('Canvas') || null;
            const screenRoot = canvas?.getChildByName('ScreenRoot') || null;
            const gameplayRoot = screenRoot?.getChildByName('GameplayRoot') || null;
            if (gameplayRoot?.isValid) {
                gameplayRoot.active = visible;
            }
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

            this._buildLoadingProgressBar(layer);
        },

        _buildLoadingProgressBar(layer: Node) {
            const group = this.requireUiChild(layer, 'LoadingProgressGroup', 'StartupLoadingUI/LoadingProgressGroup');
            const groupUI = group.getComponent(UITransform);
            if (!groupUI) throw new Error('[BootScene] Boot.scene is missing UITransform on StartupLoadingUI/LoadingProgressGroup');
            this._loadingProgressGroup = group;

            const labelNode = this.requireUiChild(group, 'Label', 'LoadingProgressGroup/Label');
            const label = labelNode.getComponent(Label);
            if (!label) throw new Error('[BootScene] Boot.scene is missing Label component on LoadingProgressGroup/Label');
            label.enableWrapText = false;
            this._loadingProgressLabel = label;

            const track = this.requireUiChild(group, 'LoadingBarTrack', 'LoadingProgressGroup/LoadingBarTrack');
            const trackUI = track.getComponent(UITransform);
            if (!trackUI) throw new Error('[BootScene] Boot.scene is missing UITransform on LoadingProgressGroup/LoadingBarTrack');

            const progressArea = this.requireUiChild(track, 'ProgressBarArea', 'LoadingBarTrack/ProgressBarArea');
            const progressBar = progressArea.getComponent(ProgressBar);
            if (!progressBar) throw new Error('[BootScene] Boot.scene is missing ProgressBar component on LoadingBarTrack/ProgressBarArea');

            const fill = this.requireUiChild(progressArea, 'ProgressFill', 'ProgressBarArea/ProgressFill');
            const fillSprite = fill.getComponent(Sprite);
            if (!fillSprite) throw new Error('[BootScene] Boot.scene is missing Sprite component on ProgressBarArea/ProgressFill');
            if (!progressBar.barSprite) {
                progressBar.barSprite = fillSprite;
            }

            this._loadingProgressFill = progressBar;
            this._loadingProgressLabelShadow = null;
            this._loadingShine = null;
            this._setLoadingStatusText('正在准备关卡…');
        },

        _startLoadingProgressIntro(overlayVersion: number) {
            this._stopLoadingShine();
            this._loadingProgress = 0;
            this._loadingProgressPercent = 0;
            this._setLoadingStatusText('正在准备关卡…');
            if (this._loadingProgressGroup?.isValid) {
                this._loadingProgressGroup.active = false;
            }
            if (this._loadingSlowActions?.isValid) {
                this._loadingSlowActions.active = false;
            }
            const showProgress = () => {
                this._loadingProgressIntroHandler = null;
                if (this._loadingOverlayVersion !== overlayVersion || this._loadingClosing || !this._loadingOverlay) return;
                if (this._loadingProgressGroup?.isValid) {
                    this._loadingProgressGroup.active = true;
                }
                this._startLoadingIndeterminate(overlayVersion);
            };
            const showSlowActions = () => {
                this._loadingSlowActionHandler = null;
                if (this._loadingOverlayVersion !== overlayVersion || this._loadingClosing || !this._loadingOverlay) return;
                this._setLoadingStatusText('仍在准备关卡…');
                if (this._loadingSlowActions?.isValid) {
                    this._loadingSlowActions.active = true;
                }
                AnalyticsMgr.inst.trackFunnelEvent({
                    eventName: 'loading_wait_slow',
                    page: this.getAnalyticsPage?.() || 'level_game',
                    levelId: this.getAnalyticsLevelId?.() || 0,
                    source: 'startup_loading',
                    success: true,
                    extra: { thresholdMs: 3000 },
                });
            };
            this._loadingProgressIntroHandler = showProgress;
            this._loadingSlowActionHandler = showSlowActions;
            this.scheduleOnce(showProgress, 0.3);
            this.scheduleOnce(showSlowActions, 3);
        },

        _setLoadingStatusText(text: string) {
            const status = String(text || '正在准备关卡…');
            if (this._loadingProgressLabel) {
                this._loadingProgressLabel.string = status;
            }
            if (this._loadingProgressLabelShadow) {
                this._loadingProgressLabelShadow.string = status;
            }
        },

        _startLoadingIndeterminate(overlayVersion: number) {
            if (this._loadingOverlayVersion !== overlayVersion || this._loadingClosing || !this._loadingOverlay) return;
            this._stopLoadingShine();
            const fillNode = this._loadingProgressFillNode as Node | null;
            const fillTransform = fillNode?.getComponent(UITransform) || null;
            if (fillNode?.isValid && fillTransform) {
                const trackWidth = Math.max(120, Number(this._loadingProgressTrackWidth) || 520);
                const segmentWidth = Math.min(120, trackWidth);
                const segmentHeight = Math.max(1, Number(this._loadingProgressFullHeight) || 8);
                const startX = -trackWidth / 2 + segmentWidth / 2;
                const endX = trackWidth / 2 - segmentWidth / 2;
                fillTransform.setContentSize(segmentWidth, segmentHeight);
                const highlight = fillNode.getChildByName('LoadingBarFillHighlight') || null;
                const highlightTransform = highlight?.getComponent(UITransform) || null;
                if (highlightTransform) {
                    highlightTransform.setContentSize(segmentWidth, highlightTransform.height);
                }
                if (highlight?.isValid) {
                    highlight.setPosition(segmentWidth / 2, highlight.position.y, highlight.position.z);
                }
                const shine = fillNode.getChildByName('LoadingBarShine') || null;
                if (shine?.isValid) {
                    shine.active = true;
                    shine.setPosition(segmentWidth / 2, shine.position.y, shine.position.z);
                }
                const y = fillNode.position.y;
                const z = fillNode.position.z;
                fillNode.setPosition(startX, y, z);
                const sweep = tween(fillNode)
                    .to(1.2, { position: new Vec3(endX, y, z) }, { easing: 'sineInOut' })
                    .call(() => fillNode.setPosition(startX, y, z));
                this._loadingShineTween = tween(fillNode).repeatForever(sweep).start();
                return;
            }
            const progressBar = this._loadingProgressFill as ProgressBar | null;
            if (!progressBar) return;
            progressBar.progress = 0.18;
            this._loadingShineTween = tween(progressBar)
                .to(0.6, { progress: 0.72 }, { easing: 'sineInOut' })
                .to(0.6, { progress: 0.18 }, { easing: 'sineInOut' })
                .union()
                .repeatForever()
                .start();
        },

        _setLoadingProgress(progress: number, duration = 0.2, overlayVersion: number = this._loadingOverlayVersion || 0) {
            const progressBar = this._loadingProgressFill as ProgressBar | null;
            const prev = this._loadingProgress;
            const next = Math.max(this._loadingProgress, Math.max(0, Math.min(1, progress)));
            this._loadingProgress = next;
            this._animateLoadingProgressPercent(prev, next, duration, overlayVersion);
            if (!progressBar) return;
            Tween.stopAllByTarget(progressBar);
            if (duration <= 0) {
                progressBar.progress = next;
                return;
            }
            tween(progressBar).to(duration, { progress: next }, { easing: 'sineOut' }).start();
        },

        _setLoadingProgressPercentText(percent: number) {
            const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
            this._loadingProgressPercent = safePercent;
            this._setLoadingStatusText(
                this._loadingHasMeasuredProgress ? `正在准备关卡 ${safePercent}%` : '正在准备关卡…',
            );
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
                this._setLoadingStatusText(
                    this._loadingHasMeasuredProgress ? `正在准备关卡 ${safePercent}%` : '正在准备关卡…',
                );
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

        _stopLoadingShine() {
            if (this._loadingProgressLabelTween) {
                this._loadingProgressLabelTween.stop();
                this._loadingProgressLabelTween = null;
            }
            if (this._loadingShineTween) {
                this._loadingShineTween.stop();
                this._loadingShineTween = null;
            }
            if (this._loadingProgressFillNode?.isValid) {
                Tween.stopAllByTarget(this._loadingProgressFillNode);
            }
        },

        clearLoadingStageTimers() {
            for (const key of ['_loadingProgressIntroHandler', '_loadingSlowActionHandler', '_loadingWatchdogHandler']) {
                const handler = this[key];
                if (handler && typeof this.unschedule === 'function') {
                    this.unschedule(handler);
                }
                this[key] = null;
            }
        },

        beginGameplayLoadingWatchdog(
            levelId: number,
            levelPath: string,
            source: 'local' | 'remote' = 'remote',
        ) {
            if (this._loadingWatchdogHandler && typeof this.unschedule === 'function') {
                this.unschedule(this._loadingWatchdogHandler);
            }
            const timeoutMs = source === 'local' ? 5000 : 10000;
            const requestVersion = (Number(this._gameplayLoadRequestVersion) || 0) + 1;
            this._gameplayLoadRequestVersion = requestVersion;
            this._levelDataLoadStopped = false;
            const handler = () => {
                this._loadingWatchdogHandler = null;
                if (requestVersion !== (Number(this._gameplayLoadRequestVersion) || 0)) return;
                if (this._levelDataLoadStopped || !this.isValid) return;
                this.stopLevelDataLoadWithFatalError?.(
                    Math.max(1, Math.floor(Number(levelId) || 1)),
                    String(levelPath || `level_${levelId}`),
                    'level_data_load_timeout',
                    source === 'local' ? 'local_load_timeout' : 'remote_load_timeout',
                    `${source} gameplay startup exceeded ${timeoutMs}ms`,
                    { timeoutMs, loadSource: source },
                );
            };
            this._loadingWatchdogHandler = handler;
            this.scheduleOnce(handler, timeoutMs / 1000);
        },

        setLoadingActionButtonsInteractable(interactable: boolean) {
            const roots = [
                this._loadingSlowActions,
                this._remoteLoadErrorOverlay?.getChildByName('RemoteLoadFatalErrorCard') || null,
            ];
            for (const root of roots) {
                if (!root?.isValid) continue;
                for (const name of [
                    'LoadingRetryButton',
                    'LoadingBackButton',
                    'RemoteLoadFatalErrorRetry',
                    'RemoteLoadFatalErrorBack',
                ]) {
                    const button = root.getChildByName(name)?.getComponent(Button) || null;
                    if (button) button.interactable = interactable;
                }
            }
        },

        retryGameplayLoading(source: string = 'loading') {
            if (this._loadingRouteActionInFlight) return;
            const appRoot = AppRoot.tryGet();
            if (!appRoot) {
                this._setLoadingStatusText('重新加载失败，请返回首页');
                return;
            }
            const pending = appRoot.session.pendingGameplayRequest;
            const active = appRoot.session.activeGameplayContext;
            const request = pending || active;
            const levelId = Math.max(
                1,
                Math.floor(Number(request?.levelId || this._activePhysicalLevelId || this._currentThemeLevelId) || 1),
            );
            const entryMode = request?.entryMode
                || (this._currentExternalLevelFilePath ? 'external' : (this._isThemeLevel ? 'theme' : 'main'));
            const prefix = String(request?.prefix || (entryMode === 'theme' ? 'zt_level_' : 'level_'));
            this._loadingRouteActionInFlight = true;
            this._levelDataLoadStopped = true;
            this._gameplayLoadRequestVersion = (Number(this._gameplayLoadRequestVersion) || 0) + 1;
            this.clearLoadingStageTimers();
            this._stopLoadingShine();
            this._setLoadingStatusText('正在重新加载…');
            this.setLoadingActionButtonsInteractable(false);
            AnalyticsMgr.inst.trackFunnelEvent({
                eventName: 'loading_retry_clicked',
                page: this.getAnalyticsPage?.() || 'level_game',
                levelId,
                source,
                success: true,
            });
            AnalyticsMgr.inst.flushFunnelEvents();
            appRoot.markGameRequested(levelId, prefix, entryMode, 'cover', 'loading-retry');
            appRoot.router.toGame().catch((error) => {
                if (!this.isValid) return;
                this._loadingRouteActionInFlight = false;
                this._levelDataLoadStopped = false;
                this._setLoadingStatusText('重新加载失败，请返回首页');
                this.setLoadingActionButtonsInteractable(true);
                console.error('[LoadingOverlay] retry route failed:', error);
            });
        },

        exitGameplayLoading(source: string = 'loading') {
            if (this._loadingRouteActionInFlight) return;
            const appRoot = AppRoot.tryGet();
            if (!appRoot) return;
            this._loadingRouteActionInFlight = true;
            this._levelDataLoadStopped = true;
            this._gameplayLoadRequestVersion = (Number(this._gameplayLoadRequestVersion) || 0) + 1;
            this.clearLoadingStageTimers();
            this._stopLoadingShine();
            this.setLoadingActionButtonsInteractable(false);
            AnalyticsMgr.inst.trackFunnelEvent({
                eventName: 'loading_back_clicked',
                page: this.getAnalyticsPage?.() || 'level_game',
                levelId: this.getAnalyticsLevelId?.() || 0,
                source,
                success: true,
            });
            AnalyticsMgr.inst.flushFunnelEvents();
            appRoot.requestHomeRoute('loading-back', 'cover').catch((error) => {
                if (!this.isValid) return;
                this._loadingRouteActionInFlight = false;
                this._levelDataLoadStopped = false;
                this.setLoadingActionButtonsInteractable(true);
                console.error('[LoadingOverlay] home route failed:', error);
            });
        },

        hideLoadingOverlayAfterGameplayReady() {
            this.setGameplayStartupRootVisible?.(true);
            this.hideLoadingOverlay();
        },

        /** 隐藏并销毁加载封面 */
        hideLoadingOverlay() {
            if (this._loadingClosing) return;
            this.clearLoadingStageTimers();
            this._gameplayLoadRequestVersion = (Number(this._gameplayLoadRequestVersion) || 0) + 1;
            const canvas = this.node?.scene?.getChildByName('Canvas') || null;
            const bootRoot = canvas?.getChildByName('BootRoot')
                || canvas?.getChildByName('ScreenRoot')?.getChildByName('BootRoot')
                || null;
            const authoredOverlay = bootRoot?.getChildByName('StartupLoadingUI') || null;
            const overlay = this._loadingOverlay?.isValid
                ? this._loadingOverlay
                : (authoredOverlay?.isValid ? authoredOverlay : null);
            if (this._loadingOwnerToken) {
                this.releaseRuntimeOwner?.(this._loadingOwnerToken);
                this._loadingOwnerToken = '';
            }
            this.clearRuntimeOwners?.('loading');
            if (!overlay) return;
            this._loadingClosing = true;
            const overlayVersion = this._loadingOverlayVersion || 0;
            this._stopLoadingShine();
            this._loadingOverlayVersion = overlayVersion + 1;
            const blocker = overlay.getComponent(BlockInputEvents);
            if (blocker) blocker.enabled = false;
            if ((overlay as any).__uiCreatedByRuntime) {
                overlay.destroy();
            } else {
                overlay.active = false;
            }
            this._loadingOverlay = null;
            this._loadingProgressFill = null;
            this._loadingProgressFillNode = null;
            this._loadingProgressGroup = null;
            this._loadingSlowActions = null;
            this._loadingProgressLabel = null;
            this._loadingProgressLabelShadow = null;
            this._loadingShine = null;
            this._loadingProgress = 0;
            this._loadingProgressPercent = 0;
            this._loadingRouteActionInFlight = false;
            this._loadingClosing = false;
        },
    });
}
