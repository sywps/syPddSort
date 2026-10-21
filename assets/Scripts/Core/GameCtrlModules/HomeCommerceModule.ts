import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Prefab, instantiate, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
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
import { AppRoot } from '../AppRoot';
import { ensureHomeStartButtonFx } from '../HomeStartButtonFx';
import { drawCreatorLevelJump } from '../CreatorLevelJump';
import { getBrowserLevelPreview } from '../BrowserLevelPreview';
import { isCreatorWeb } from '../CreatorWeb';
import { isMiniGameRuntime } from '../MiniGamePlatform';
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
                button.transition = Button.Transition.SCALE;
                button.zoomScale = 0.95;
                button.duration = 0.08;
            }
            node.targetOff(this);
            node.on(Button.EventType.CLICK, handler, this);
        },

        playPopupOpenAnim(overlay: Node, box?: Node | null, onComplete?: () => void) {
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
                .call(() => { if (overlay.isValid && target.isValid) onComplete?.(); })
                .start();
        },

        openGoldShop() {
            return ensureCommercePanelController(this).openGoldShop();
        },

        openGoldAcquirePanel() {
            return ensureCommercePanelController(this).openGoldAcquirePanel();
        },

        openToolAcquirePanel(
            kind: InventoryPropKind,
            options?: {
                resumeTimerOnClose?: boolean;
                timerPauseToken?: string;
                onInventoryChanged?: () => void;
                onAdGrant?: () => boolean | void | Promise<boolean | void>;
            },
        ) {
            if (kind === 'expand') return false;
            return ensureCommercePanelController(this).openToolAcquirePanel(kind, options);
        },

        preloadAcquireResourcePanel() {
            return ensureCommercePanelController(this).preloadAcquireResourcePanel();
        },

        async startWeChatHomeLevel(level: number): Promise<void> {
            const appRoot = AppRoot.tryGet();
            if (!appRoot || this._weChatHomeEntryPending || appRoot.router.isTransitioning
                || appRoot.isAppTransitionTargeting('Game') || appRoot.session.pendingGameplayRequest
                || this._gameplayTransitionPromise || (Number(this._suppressHomeStartUntil) || 0) > Date.now()) return;
            this._weChatHomeEntryPending = true;
            let charged = false;
            let refunded = 0;
            try {
                AudioMgr.inst.play('button');
                if (!this.costVigorForLevel(level, 'main')) {
                    this.showNoLivesAdModal({ source: 'home_start', onResult: (result: any) => {
                        if (result?.status === 'granted' && this.isValid && this.getRuntimeSceneName('Game') === 'Home') {
                            // The modal can invoke its callback synchronously; release this
                            // attempt before starting a separately guarded entry.
                            Promise.resolve().then(() => this.startWeChatHomeLevel(level));
                        }
                    } });
                    return;
                }
                charged = !this.isTutorialVigorFreeLevel(level, 'main');
                appRoot.session.weChatEntryVigorCharged = charged;
                await this.requestGameplayRoute(level, 'level_', false, 'auto');
            } catch (error) {
                // Only compensate a failed entry while the original Home is still
                // active. A successfully entered game must never receive a refund.
                const stillHome = this.isValid && appRoot.session.currentSceneName === 'Home'
                    && this.getRuntimeSceneName('Game') === 'Home' && !appRoot.session.activeGameplayContext;
                let refundError = '';
                if (stillHome) {
                    const pending = appRoot.session.pendingGameplayRequest;
                    if (pending?.levelId === level && pending.prefix === 'level_') {
                        appRoot.session.clearPendingGameplayRequest();
                        appRoot.router.requestHomeScene();
                    }
                    if (charged && appRoot.session.weChatEntryVigorCharged) {
                        appRoot.session.weChatEntryVigorCharged = false;
                        try { refunded = this.grantVigorByAmount(1); }
                        catch (failure) { refundError = String(failure); console.error('[HomeEntry] vigor refund failed:', failure); }
                    }
                }
                console.error('[HomeEntry] game entry failed:', error);
                try {
                    AnalyticsMgr.inst.trackFunnelEvent({ eventName: 'home_game_entry_failed', success: false,
                        source: 'home_start', levelId: level, errorCode: 'game_entry_failed', errorMessage: String(error),
                        extra: { charged, refunded, refundError, stillHome } });
                } catch (failure) { console.warn('[HomeEntry] telemetry failed:', failure); }
                if (stillHome) this.showToast('暂时未能进入关卡，请再试一次');
            } finally {
                this._weChatHomeEntryPending = false;
            }
        },

        drawStartButton(parent: Node, level: number) {
            const btn = this.requireUiChild(parent, 'StartBtn', 'PrimaryActionLayer/StartBtn');
            btn.active = true;
            const visual = this.requireUiChild(btn, 'PressVisual', 'StartBtn/PressVisual');
            this.requireSceneSpriteFrame(visual, 'StartBtn/PressVisual');
            const btnSubNode = this.requireUiChild(visual, 'BtnSub', 'StartBtn/PressVisual/BtnSub');
            const btnSubLabel = btnSubNode.getComponent(Label);
            if (!btnSubLabel) throw new Error('[HomeScene] Home.scene is missing Label component on StartBtn/BtnSub');
            btnSubLabel.string = `第${level}关`;
            this.requireUiChild(visual, 'VigorCostBadge', 'StartBtn/PressVisual/VigorCostBadge').active
                = !this.isTutorialVigorFreeLevel(level, 'main');

            btn.targetOff(this);
            if (!btn.getComponent(Button)) throw new Error('[HomeScene] StartBtn requires an authored Button');
            const enterSelectedLevel = (level: number) => {
                if (this.getRuntimeSceneName('Game') === 'Home') {
                    void this.requestGameplayRoute(level, 'level_', false, 'auto');
                    return;
                }
                void this.requestLevelTransition(level);
            };
            const startLevel = (level: number) => {
                if (isMiniGameRuntime() && this.getRuntimeSceneName('Game') === 'Home') {
                    void this.startWeChatHomeLevel(level);
                    return;
                }
                if (this._gameplayTransitionPromise) return;
                if ((Number(this._suppressHomeStartUntil) || 0) > Date.now()) return;
                AudioMgr.inst.play('button');
                if (!this.costVigorForLevel(level, 'main')) {
                    this.showNoLivesAdModal({
                        source: 'home_start',
                        onResult: (result: any) => {
                            if (result?.status !== 'granted' || !this.isValid) return;
                            if (this.getRuntimeSceneName('Game') !== 'Home') return;
                            const appRoot = AppRoot.tryGet();
                            if (!appRoot || appRoot.router.isTransitioning || appRoot.session.pendingGameplayRequest) return;
                            if (!this.costVigorForLevel(level, 'main')) return;
                            enterSelectedLevel(level);
                        },
                    });
                    return;
                }
                enterSelectedLevel(level);
            };
            const readCreatorSelection = drawCreatorLevelJump(parent, btn, level, selected => {
                getBrowserLevelPreview().setLevel(selected);
                btnSubLabel.string = `第${selected}关`;
                this.requireUiChild(visual, 'VigorCostBadge', 'StartBtn/PressVisual/VigorCostBadge').active
                    = !this.isTutorialVigorFreeLevel(selected, 'main');
            });
            btn.on(Button.EventType.CLICK, () => {
                const selected = readCreatorSelection ? readCreatorSelection() : level;
                if (selected === null) return;
                startLevel(selected);
            }, this);
        
            // 结算横幅风格动效
            ensureHomeStartButtonFx(btn);
        },

        /** PK 对战入口（开始游戏按钮下方） */
        drawThemeChallengeButton(parent: Node) {
            const btn = this.requireUiChild(parent, 'ThemeBtn', 'PrimaryActionLayer/ThemeBtn');
            btn.active = !isCreatorWeb();
            if (!btn.active) return;
            const visual = this.requireUiChild(btn, 'PressVisual', 'ThemeBtn/PressVisual');
            this.requireSceneSpriteFrame(visual, 'ThemeBtn/PressVisual');
            const titleNode = this.requireUiChild(visual, 'ThemeTitle', 'ThemeBtn/PressVisual/ThemeTitle');
            const titleLabel = titleNode.getComponent(Label);
            if (!titleLabel) throw new Error('[HomeScene] Home.scene is missing Label component on ThemeBtn/ThemeTitle');
            titleLabel.string = 'PK对战';
            const subText = '排位对战 · 双人合作';
            const subNode = this.requireUiChild(visual, 'ThemeSub', 'ThemeBtn/PressVisual/ThemeSub');
            const subLabel = subNode.getComponent(Label);
            if (!subLabel) throw new Error('[HomeScene] Home.scene is missing Label component on ThemeBtn/ThemeSub');
            subLabel.string = subText;
            subLabel.color = new Color('#EAF7E6');

            btn.targetOff(this);
            if (!btn.getComponent(Button)) throw new Error('[HomeScene] ThemeBtn requires an authored Button');
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                this.openPvpLobby();
            }, this);

            // 呼吸动画
            this.startHomeSceneScalePulse(btn, 1.02, 1.1);
        },

        // ==================== 图鉴入口 ====================
        
    });
}
