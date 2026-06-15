import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Prefab, instantiate, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
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
import { ensureHomeIconIdleWiggle } from '../HomeIconIdleWiggle';
import { ensureHomeIconSparkleFx } from '../HomeIconSparkleFx';
import { ensureCommercePanelController } from '../Panels/CommercePanelController';

export function installHomeCommerceModule(target: any): void {
    Object.assign(target, {
        requirePanelChild(parent: Node, name: string): Node {
            const child = parent.getChildByName(name);
            if (!child) {
                throw new Error(`[panel-prefab] missing node: ${name}`);
            }
            return child;
        },

        bindPanelButton(node: Node, handler: () => void) {
            if (!node.getComponent(UITransform)) {
                node.addComponent(UITransform);
            }
            let button = node.getComponent(Button);
            if (!button) {
                button = node.addComponent(Button);
            }
            node.targetOff(this);
            node.on(Button.EventType.CLICK, handler, this);
        },

        playPopupOpenAnim(overlay: Node, box?: Node | null) {
            if (!overlay?.isValid) return;
            const target = box?.isValid ? box : (overlay.getChildByName('Box') || overlay);
            if (!target?.isValid) return;

            const baseScale = target.scale.clone();
            const targetOpacity = target.getComponent(UIOpacity) || target.addComponent(UIOpacity);
            Tween.stopAllByTarget(target);
            Tween.stopAllByTarget(targetOpacity);
            target.setScale(baseScale.x * 0.86, baseScale.y * 0.86, baseScale.z);
            targetOpacity.opacity = 0;

            const shade = overlay.getChildByName('Shade');
            if (shade?.isValid) {
                const shadeOpacity = shade.getComponent(UIOpacity) || shade.addComponent(UIOpacity);
                const finalOpacity = Math.max(0, Math.min(255, shadeOpacity.opacity || 255));
                Tween.stopAllByTarget(shadeOpacity);
                shadeOpacity.opacity = 0;
                tween(shadeOpacity)
                    .to(0.155, { opacity: finalOpacity }, { easing: 'linear' })
                    .start();
            }

            tween(targetOpacity)
                .to(0.08, { opacity: 255 }, { easing: 'sineOut' })
                .start();
            tween(target)
                .to(0.24, { scale: new Vec3(baseScale.x * 1.045, baseScale.y * 1.045, baseScale.z) }, { easing: 'sineOut' })
                .to(0.16, { scale: new Vec3(baseScale.x, baseScale.y, baseScale.z) }, { easing: 'sineOut' })
                .start();
        },

        fillPanelAnchorLabel(
            anchor: Node,
            name: string,
            text: string,
            size: number,
            color: Color,
            width: number,
            height: number,
            align: number = Label.HorizontalAlign.CENTER,
            overflow: number = Label.Overflow.SHRINK,
        ): Label {
            const existingLabel = anchor.getComponent(Label) || anchor.getChildByName(name)?.getComponent(Label);
            if (existingLabel) {
                existingLabel.string = text;
                existingLabel.enableWrapText = false;
                return existingLabel;
            }

            anchor.removeAllChildren();
            const node = new Node(name);
            anchor.addChild(node);
            node.layer = anchor.layer;
            node.setPosition(0, 0, 0);
            const ui = node.addComponent(UITransform);
            ui.setContentSize(width, height);
            const label = node.addComponent(Label);
            label.string = text;
            label.fontSize = size;
            label.lineHeight = Math.max(size + 4, height);
            label.color = color;
            label.horizontalAlign = align;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.overflow = overflow;
            label.enableWrapText = false;
            return label;
        },

        openGoldShop() {
            return ensureCommercePanelController(this).openGoldShop();
        },

        openGoldAcquirePanel() {
            return ensureCommercePanelController(this).openGoldAcquirePanel();
        },

        openToolAcquirePanel(kind: InventoryPropKind, options?: { resumeTimerOnClose?: boolean; onInventoryChanged?: () => void }) {
            if (kind === 'expand') return false;
            return ensureCommercePanelController(this).openToolAcquirePanel(kind, options);
        },

        openDailySignInPanel() {
            return ensureCommercePanelController(this).openDailySignInPanel();
        },

        drawStartButton(parent: Node, level: number) {
            const btn = this.requireUiChild(parent, 'StartBtn', 'PrimaryActionLayer/StartBtn');
            this.requireSceneSpriteFrame(btn, 'PrimaryActionLayer/StartBtn');
            const btnSubNode = this.requireUiChild(btn, 'BtnSub', 'StartBtn/BtnSub');
            const btnSubLabel = btnSubNode.getComponent(Label);
            if (!btnSubLabel) throw new Error('[HomeScene] Home.scene is missing Label component on StartBtn/BtnSub');
            btnSubLabel.string = `第${level}关`;

            btn.targetOff(this);
            btn.getComponent(Button) || btn.addComponent(Button);
            const enterSelectedLevel = () => {
                if (this.getRuntimeSceneName('Game') === 'Home') {
                    void this.requestGameplaySceneTransition(level, 'level_', false);
                    return;
                }
                this.deactivateMainMenuNode();
                this.loadLevel(level);
            };
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                if (!this.costVigor()) {
                    // 体力不足，弹出广告弹窗
                    this.showNoLivesAdModal(() => {
                        if (this.costVigor()) {
                            enterSelectedLevel();
                        }
                    });
                    return;
                }
                enterSelectedLevel();
            }, this);
        
            // 呼吸动画
            this.startHomeSceneScalePulse(btn, 1.03, 0.9);
        },

        /** 主题挑战按钮（黄色胶囊，开始游戏按钮下方） */
        drawThemeChallengeButton(parent: Node) {
            const mainLevel = this.getSavedLevel();
            const isOpen = this.canOpenThemePanel(mainLevel);
            const unlockQuota = this.getThemeUnlockQuota(mainLevel);
            const btn = this.requireUiChild(parent, 'ThemeBtn', 'PrimaryActionLayer/ThemeBtn');
            this.requireSceneSpriteFrame(btn, 'PrimaryActionLayer/ThemeBtn');
            const titleNode = this.requireUiChild(btn, 'ThemeTitle', 'ThemeBtn/ThemeTitle');
            const titleLabel = titleNode.getComponent(Label);
            if (!titleLabel) throw new Error('[HomeScene] Home.scene is missing Label component on ThemeBtn/ThemeTitle');
            const subText = isOpen
                ? `当前进度可解锁前 ${unlockQuota} 关`
                : `主线第${this.getThemePanelOpenRequirementLevel()}关解锁第1关`;
            const subNode = this.requireUiChild(btn, 'ThemeSub', 'ThemeBtn/ThemeSub');
            const subLabel = subNode.getComponent(Label);
            if (!subLabel) throw new Error('[HomeScene] Home.scene is missing Label component on ThemeBtn/ThemeSub');
            subLabel.string = subText;
            subLabel.color = isOpen ? new Color('#EAF7E6') : new Color('#F6EEE5');

            btn.targetOff(this);
            btn.getComponent(Button) || btn.addComponent(Button);
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('uiPanel');
                this.openThemePanel();
            }, this);
        
            // 呼吸动画
            this.startHomeSceneScalePulse(btn, 1.02, 1.1);
        },

        // ==================== 图鉴入口 ====================
        
        drawDailySignInButton(parent: Node) {
            const signInStatus = this.getDailySignInStatus();
            const btn = this.requireUiChild(parent, 'DailySignInBtn', 'EntryLayer/DailySignInBtn');
            const iconNode = this.requireUiChild(btn, 'DailySignInIcon', 'DailySignInBtn/DailySignInIcon');
            this.requireSceneSpriteFrame(iconNode, 'DailySignInBtn/DailySignInIcon');
        
            btn.getChildByName('DailySignInDot')?.destroy();
            const badgeAnchor = this.requireUiChild(btn, 'BadgeAnchor', 'DailySignInBtn/BadgeAnchor');
            badgeAnchor.removeAllChildren();
            badgeAnchor.active = true;
            if (signInStatus.canClaim) {
                const dot = new Node('DailySignInDot');
                badgeAnchor.addChild(dot);
                dot.layer = btn.layer;
                dot.setPosition(0, 0, 0);
                dot.addComponent(UITransform).setContentSize(22, 22);
                const dg = dot.getComponent(Graphics) || dot.addComponent(Graphics);
                dg.clear();
                dg.fillColor = new Color('#F05A5A');
                dg.circle(0, 0, 11);
                dg.fill();
                const dotLabelNode = new Node('DailySignInDotLbl');
                dot.addChild(dotLabelNode);
                dotLabelNode.layer = dot.layer;
                dotLabelNode.setPosition(0, 0, 0);
                dotLabelNode.addComponent(UITransform).setContentSize(18, 18);
                const dotLabel = dotLabelNode.addComponent(Label);
                dotLabel.string = '领';
                dotLabel.fontSize = 12;
                dotLabel.lineHeight = 14;
                dotLabel.color = Color.WHITE;
                dotLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
                dotLabel.verticalAlign = Label.VerticalAlign.CENTER;
                dotLabel.overflow = Label.Overflow.SHRINK;
                dotLabel.enableWrapText = false;
            }
        
            btn.targetOff(this);
            btn.getComponent(Button) || btn.addComponent(Button);
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                this.openDailySignInPanel();
            }, this);
        
            ensureHomeIconIdleWiggle(iconNode);
            ensureHomeIconSparkleFx(iconNode);
        },
    });
}
