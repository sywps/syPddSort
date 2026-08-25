import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, ProgressBar, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, UIOpacity,
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
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, BoardViewportController
} from '../GameCtrlShared';
import { Widget } from 'cc';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { runtimeWarn } from '../RuntimeLog';
import { renderPixelPosterPreview } from '../PixelPosterPreviewRenderer';
import { getFrontLevelExperimentAnalyticsContext } from '../LevelExperimentService';

const PATTERN_COMPLETE_BOARD_SHRINK_DELAY = 0;
const PATTERN_COMPLETE_BOARD_SHRINK_DURATION = 0.3;
const PATTERN_COMPLETE_BOARD_SHRINK_SCALE = 0.8;
const PATTERN_COMPLETE_SETTLEMENT_HOLD = 0.2;
const WIN_BONUS_REWARD_GATE_PAGE = 'win_bonus_reward';
const LEVEL_3_IDLE_HINT_LEVEL_ID = 3;
const LEVEL_3_IDLE_HINT_FAST_DELAY_SECONDS = 4;
const LEVEL_3_IDLE_HINT_FAST_SHOW_LIMIT = 5;
const SMART_IDLE_HINT_SLOW_DELAY_SECONDS = 5;
const SMART_IDLE_HINT_MAX_LEVEL_ID = 10;
const LATER_LEVEL_IDLE_HINT_SHOW_LIMIT = 1;
const EXP_SMART_IDLE_HINT_MIN_LEVEL_ID = 2;
const EXP_SMART_IDLE_HINT_MAX_LEVEL_ID = 9;
const EXP_SMART_IDLE_HINT_DELAY_SECONDS = 10;
const EXP_EARLY_SMART_IDLE_HINT_DELAY_SECONDS = 3;
const EXP_EARLY_SMART_IDLE_HINT_MAX_LEVEL_ID = 3;
const SMART_IDLE_HINT_FOLLOWUP_DELAY_SECONDS = 1.2;
const SMART_IDLE_HINT_REPEAT_DELAY_SECONDS = 4;
const SMART_IDLE_HINT_MAX_CYCLES_PER_EPISODE = 2;
const SMART_IDLE_HINT_FINAL_HOLD_SECONDS = 1;
const SMART_IDLE_HINT_FINGERTIP_OFFSET_X = -31;
const SMART_IDLE_HINT_FINGERTIP_OFFSET_Y = 43;
const SMART_IDLE_HINT_TAP_SCALE = 0.88;
const SMART_IDLE_HINT_BUTTON_GAP = 10;

type SmartIdleHintStep = 'board_to_slot' | 'board_to_board' | 'slot_to_board';
type SmartIdleHintPlan = {
    step: SmartIdleHintStep;
    colorId: number;
    block?: BeanBlockInfo;
    targetCells?: { row: number; col: number }[];
    slotIndices?: number[];
    destinationOnly?: boolean;
};
type SmartIdleHintEndpoints = {
    from: Vec3 | null;
    to: Vec3;
    sourceHandVisible?: boolean;
};

const GOLD_TEXTURE_NAME = '\u91d1\u5e01';

function ensureUi(node: Node, width: number, height: number): UITransform {
    const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
    ui.setContentSize(width, height);
    return ui;
}

function stretchRuntimeUiNodeToParent(node: Node): void {
    const widget = node.getComponent(Widget) || node.addComponent(Widget);
    const raw = widget as any;
    raw.isAlignLeft = true;
    raw.isAlignRight = true;
    raw.isAlignTop = true;
    raw.isAlignBottom = true;
    raw.left = 0;
    raw.right = 0;
    raw.top = 0;
    raw.bottom = 0;
    raw.alignMode = 2;
    widget.updateAlignment?.();
}

function getNodeCenterInRoot(root: Node, node: Node): Vec3 {
    const rootUi = root.getComponent(UITransform);
    const nodeUi = node.getComponent(UITransform);
    if (!rootUi || !nodeUi) {
        return new Vec3(node.position.x, node.position.y, node.position.z);
    }
    const world = nodeUi.convertToWorldSpaceAR(new Vec3(0, 0, 0));
    return rootUi.convertToNodeSpaceAR(world);
}

function getSpriteFrameFromNode(node?: Node | null): SpriteFrame | null {
    if (!node?.isValid) return null;
    const direct = node.getComponent(Sprite)?.spriteFrame || null;
    if (direct) return direct;
    for (const child of node.children) {
        const childFrame = child.getComponent(Sprite)?.spriteFrame || null;
        if (childFrame) return childFrame;
    }
    return null;
}

const SKILL_USAGE_TIMEOUT_MS = 10000;
const WAND_SELECTION_TIMEOUT_MS = 30000;

export function installSettlementHudModule(target: any): void {
    Object.assign(target, {
        clearSkillUsageWatchdog(_reason: string = 'clear'): void {
            if (this._skillUsageWatchdog) {
                clearTimeout(this._skillUsageWatchdog);
                this._skillUsageWatchdog = null;
            }
            this._skillUsageWatchdogMeta = null;
            this._skillUsageWatchdogRecovery = null;
            this._activeSkillUsageGeneration = 0;
            this._skillUsageGeneration = Math.max(
                0,
                Math.floor(Number(this._skillUsageGeneration) || 0),
            ) + 1;
        },

        armSkillUsageWatchdog(
            owner: string,
            timeoutMs: number = SKILL_USAGE_TIMEOUT_MS,
        ): number {
            this.clearSkillUsageWatchdog?.('rearm');
            const generation = Math.max(
                0,
                Math.floor(Number(this._skillUsageGeneration) || 0),
            ) + 1;
            this._skillUsageGeneration = generation;
            this._activeSkillUsageGeneration = generation;
            const normalizedTimeout = Math.max(1000, Math.floor(Number(timeoutMs) || SKILL_USAGE_TIMEOUT_MS));
            const startedAt = Date.now();
            this._skillUsageWatchdogMeta = {
                owner: String(owner || 'skill'),
                generation,
                startedAt,
                deadlineAt: startedAt + normalizedTimeout,
            };
            let watchdog: any = null;
            const recoverWatchdog = (source: string = 'timeout') => {
                if (this._skillUsageWatchdog !== watchdog
                    || generation !== Math.max(0, Math.floor(Number(this._skillUsageGeneration) || 0))
                    || !this._skillActive) return false;
                clearTimeout(watchdog);
                this._skillUsageWatchdog = null;
                this._skillUsageWatchdogMeta = null;
                this._skillUsageWatchdogRecovery = null;
                if (owner === 'wand-selection' && this._wandMode && this._wandRectNode?.isValid) {
                    console.warn('[Skill] wand selection remains interactive; extending watchdog');
                    this.armWandSelectionWatchdog?.();
                    return true;
                }
                this._lastSkillWatchdogRecovery = {
                    owner: String(owner || 'skill'),
                    recoveredAt: Date.now(),
                    source,
                };
                console.error(`[Skill] ${owner} recovered after ${normalizedTimeout}ms: ${source}`);
                const recover = (label: string, callback: () => void) => {
                    try {
                        callback();
                    } catch (error) {
                        console.error(`[Skill] ${owner} recovery step failed: ${label}`, error);
                    }
                };
                recover('wand', () => this.cleanupWandMode?.());
                recover('fly-beans', () => this.clearActiveFlyBeanNodes?.(`skill-timeout:${owner}`));
                recover('hidden-state', () => this.clearForcedSkillHiddenState?.());
                recover('targets', () => {
                    this._flyingTargetRefs?.clear?.();
                    this._hiddenSlotIndexRefs?.clear?.();
                    this._flyingTargets?.clear?.();
                    this._hiddenSlotIndices?.clear?.();
                });
                this.finishSkillUsage(generation);
                recover('board-render', () => this.renderBoard?.());
                recover('slot-render', () => this.renderSlots?.());
                recover('completion', () => {
                    this.checkColorCompletion?.();
                    const boardComplete = !!this.boardModel?.isAllLocked?.();
                    if (!boardComplete) {
                        this.flushPendingColorCompleteEffects?.();
                    }
                    this.checkGuideStepComplete?.();
                    if (boardComplete) {
                        this.playPatternCompleteThenWin?.();
                    } else {
                        this.refreshEndgameHints?.('skill-watchdog-recovery');
                    }
                });
                return true;
            };
            watchdog = setTimeout(() => {
                recoverWatchdog('timeout');
            }, normalizedTimeout);
            this._skillUsageWatchdog = watchdog;
            this._skillUsageWatchdogRecovery = recoverWatchdog;
            return generation;
        },

        recoverSkillUsageAfterForeground(): boolean {
            const deadlineAt = Number(this._skillUsageWatchdogMeta?.deadlineAt) || 0;
            if (!this._skillActive || deadlineAt <= 0 || deadlineAt > Date.now()) return false;
            return this._skillUsageWatchdogRecovery?.('foreground') === true;
        },

        armWandSelectionWatchdog(): number {
            return this.armSkillUsageWatchdog('wand-selection', WAND_SELECTION_TIMEOUT_MS);
        },

        finishSkillUsage(expectedGeneration: number = 0) {
            const normalizedExpectedGeneration = Math.max(0, Math.floor(Number(expectedGeneration) || 0));
            const activeGeneration = Math.max(0, Math.floor(Number(this._activeSkillUsageGeneration) || 0));
            if (normalizedExpectedGeneration > 0 && normalizedExpectedGeneration !== activeGeneration) {
                return false;
            }
            const shouldFinish = !!this._skillActive
                || !!this._skillAnimOnly
                || !!this._skillUsageWatchdog
                || !!this._skillTimerPauseToken;
            this.clearSkillUsageWatchdog?.('finish');
            if (!shouldFinish) return false;
            this._skillActive = false;
            this._skillAnimOnly = false;
            this._activeSkillUsageGeneration = 0;
            try {
                this._pchConveyorGameplayController?.releaseActiveSkillPause?.();
            } catch (error) {
                console.error('[Skill] conveyor release failed', error);
            }
            try {
                if (typeof this.resumeSkillTimerPause === 'function') {
                    this.resumeSkillTimerPause();
                } else {
                    this.resumeTimerForProp();
                }
            } catch (error) {
                console.error('[Skill] timer release failed', error);
            }
            this._timerLockedForProp = (Number(this._timerPauseRefs) || 0) > 0;
            try {
                this.resetIdleHintTimer();
            } catch (error) {
                console.error('[Skill] idle hint reset failed', error);
            }
            this.syncSkillButtonRuntimeStates?.();
            this.ensureRewardedAdWarmSlot?.('skill-finished');
            return true;
        },

        formatTime(sec: number): string {
            const s = Math.max(0, sec);
            const mm = Math.floor(s / 60);
            const ss = s % 60;
            const mmText = mm < 10 ? `0${mm}` : `${mm}`;
            const ssText = ss < 10 ? `0${ss}` : `${ss}`;
            return `${mmText}:${ssText}`;
        },

        formatCurrentTimerText(): string {
            return this._currentLevelUnlimitedTime ? '不限时' : this.formatTime(this.timeRemain);
        },

        getBoardCompletionStats(): { total: number; locked: number; remainPercent: number; completePercent: number } {
            let total = 0;
            let locked = 0;
            for (let r = 0; r < this.boardModel.height; r++) {
                for (let c = 0; c < this.boardModel.width; c++) {
                    if (this.boardModel.correctColors[r][c] <= 0) continue;
                    total++;
                    if (this.boardModel.locked[r][c]) {
                        locked++;
                    }
                }
            }
            const completePercent = total > 0 ? Math.floor((locked / total) * 100) : 0;
            const remainPercent = total > 0 ? Math.max(0, Math.ceil(((total - locked) / total) * 100)) : 0;
            return { total, locked, remainPercent, completePercent };
        },

        refreshCompletionProgressLabel() {
            if (this.levelLabel) {
                const activeLevel = this.getActiveLogicalLevelId();
                this.levelLabel.string = `第${activeLevel}关`;
            }
            if (!this.completionLabel || !this.boardModel) return;
            const stats = this.getBoardCompletionStats();
            this.completionLabel.string = `完成${stats.completePercent}%`;
        },

        syncSettlementCompletionSummary(panel: Node | null | undefined, percent: number) {
            const box = panel?.getChildByName('Box');
            if (!box) return;
            for (const child of box.children) {
                if (child.name !== 'Label') continue;
                const percentLabel = child.getComponent(Label);
                const captionLabel = child.getChildByName('Label-001')?.getComponent(Label) ?? null;
                if (percentLabel && captionLabel) {
                    percentLabel.string = `${percent}%`;
                    return;
                }
                const nestedPercentLabel = child.getChildByName('Label')?.getComponent(Label) ?? null;
                if (percentLabel && nestedPercentLabel) {
                    nestedPercentLabel.string = `${percent}%`;
                    return;
                }
            }
        },

        syncSettlementProgressWidget(panel: Node | null | undefined, stats?: { completePercent: number }) {
            if (!panel) return;
            const progressRoot = panel
                .getChildByName('Box')
                ?.getChildByName('\u8fdb\u5ea6\u6761');
            if (!progressRoot) {
                throw new Error('[settlement-progress] result panel is missing Box/进度条');
            }
            const resolvedStats = stats || this.getBoardCompletionStats();
            const percent = Math.max(0, Math.min(100, Math.floor(Number(resolvedStats.completePercent) || 0)));
            this.syncSettlementCompletionSummary(panel, percent);
            const progressLabel = progressRoot.getChildByName('Label')?.getComponent(Label);
            if (progressLabel) {
                progressLabel.string = `\u5df2\u5b8c\u6210 ${percent}%`;
            }
            this.applySettlementProgressFill(progressRoot, percent / 100);
        },

        applySettlementProgressFill(progressRoot: Node, ratio: number) {
            const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
            const progressArea = progressRoot.getChildByName('ProgressBarArea');
            if (!progressArea) {
                throw new Error('[settlement-progress] progress root is missing ProgressBarArea');
            }
            const progressBar = progressArea.getComponent(ProgressBar);
            if (!progressBar) {
                throw new Error('[settlement-progress] ProgressBarArea is missing cc.ProgressBar');
            }
            if (!progressBar.barSprite) {
                throw new Error('[settlement-progress] cc.ProgressBar is missing barSprite');
            }
            progressBar.progress = safeRatio;
        },

        calcWinGoldReward(): number {
            const rewardCfg = ECONOMY_NUMERIC_TABLE.reward;
            return Math.max(1, Math.floor(Number(rewardCfg.winGoldMin) || 10));
        },

        updateWinRewardLabel(rewardGold: number) {
            const box = this.panelWin?.getChildByName('Box');
            const rewardLbl = box?.getChildByName('RewardGoldIcon')?.getChildByName('RewardGoldLbl')?.getComponent(Label)
                || box?.getChildByName('RewardGoldLbl')?.getComponent(Label);
            if (rewardLbl) {
                rewardLbl.string = this.shouldUseMainlineWinSettlementUI()
                    ? `+${rewardGold} 金币`
                    : `+${rewardGold} 金币到手`;
            }
            this.refreshWinAdBonusUI();
        },

        syncWinSettlementGoldBox() {
            const label = this._settlementGoldCountLbl as Label | null;
            if (label?.isValid) {
                label.string = `${this.getGold()}`;
            }
        },

        applySettlementSpriteFrame(sprite: Sprite, names: string[], fallback?: SpriteFrame | null): void {
            const applyFrame = (frame: SpriteFrame | null, reason: string) => {
                if (typeof this.scheduleSpriteFrameApply === 'function') {
                    this.scheduleSpriteFrameApply(sprite, frame, reason);
                    return;
                }
                if (frame) {
                    sprite.spriteFrame = frame;
                }
            };
            const cached = names.map((name) => this.getSF?.(name) || null).find((frame) => !!frame) || null;
            if (cached) {
                applyFrame(cached, `settlement:${names.join('|')}:cache`);
                return;
            }
            if (fallback) {
                applyFrame(fallback, `settlement:${names.join('|')}:fallback`);
                return;
            }
            if (typeof this._loadSpriteFrameByName !== 'function') return;
            const tryLoad = (index: number) => {
                if (!sprite?.isValid) return;
                const name = names[index];
                if (!name) return;
                this._loadSpriteFrameByName(name, (sf: SpriteFrame | null) => {
                    if (!sprite?.isValid) return;
                    if (sf) {
                        applyFrame(sf, `settlement:${name}:load`);
                        return;
                    }
                    tryLoad(index + 1);
                });
            };
            tryLoad(0);
        },

        ensureWinSettlementTopWidgets() {
            const panel = this.panelWin as Node | null;
            if (!panel?.isValid) return null;
            const root = panel.getChildByName('SettlementTopHud');
            const settingsBtn = root?.getChildByName('SettingsButton') || null;
            const settingsIcon = settingsBtn?.getChildByName('SettingsIcon') || null;
            const goldBox = root?.getChildByName('GoldGroup') || null;
            const goldBanner = goldBox?.getChildByName('GoldBanner') || null;
            const goldCount = goldBox?.getChildByName('GoldCount') || null;
            const settingsSprite = settingsIcon?.getComponent(Sprite) || null;
            const goldBannerSprite = goldBanner?.getComponent(Sprite) || null;
            const goldLabel = goldCount?.getComponent(Label) || null;
            if (!root?.isValid || !settingsBtn?.isValid || !settingsSprite?.spriteFrame
                || !goldBox?.isValid || !goldBannerSprite?.spriteFrame || !goldLabel) {
                throw new Error('[WinPanel] missing route-owned SettlementTopHud widgets');
            }

            root.active = true;
            root.setSiblingIndex(Math.max(0, panel.children.length - 1));
            this.bindResultPanelButtonWithScaledFallback(settingsBtn, panel, () => {
                AudioMgr.inst.play('uiPanel');
                this.openSettingsPanel?.();
            });
            goldLabel.string = `${this.getGold?.() ?? 0}`;
            this._settlementGoldCountLbl = goldLabel;
            return { settingsBtn, goldBox, coinIcon: goldBox };
        },

        resolveWinSettlementCoinFrame(sourceNode?: Node | null): SpriteFrame | null {
            const fromSource = getSpriteFrameFromNode(sourceNode);
            if (fromSource) return fromSource;
            const box = (this.panelWin as Node | null)?.getChildByName('Box') || null;
            const rewardIcon = box?.getChildByName('RewardGoldIcon') || null;
            const fromRewardIcon = getSpriteFrameFromNode(rewardIcon);
            if (fromRewardIcon) return fromRewardIcon;
            return this.getSF?.(GOLD_TEXTURE_NAME) || null;
        },

        playWinSettlementGoldFlyReward(amount: number, sourceNode?: Node | null): boolean {
            const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
            if (safeAmount <= 0) return false;
            const panel = this.panelWin as Node | null;
            if (!panel?.isValid || !panel.activeInHierarchy) return false;
            const widgets = this.ensureWinSettlementTopWidgets?.();
            const goldBox = widgets?.goldBox as Node | null;
            const coinTarget = widgets?.coinIcon as Node | null;
            if (!goldBox?.isValid) return false;
            const box = panel.getChildByName('Box');
            const source = sourceNode?.isValid
                ? sourceNode
                : (box?.getChildByName('RewardGoldIcon') || goldBox);
            const targetNode = coinTarget?.isValid ? coinTarget : goldBox;
            const start = getNodeCenterInRoot(panel, source);
            const end = getNodeCenterInRoot(panel, targetNode);
            const coinFrame = this.resolveWinSettlementCoinFrame?.(source) || null;
            if (!coinFrame) {
                runtimeWarn('[WinSettlementGoldFly] optional coin SpriteFrame missing:', GOLD_TEXTURE_NAME);
                return false;
            }
            const coinCount = Math.min(12, Math.max(8, Math.ceil(Math.sqrt(safeAmount)) + 4));
            let lastLandingSoundAt = -1;
            for (let i = 0; i < coinCount; i++) {
                const coin = new Node('WinSettlementFlyingCoin');
                panel.addChild(coin);
                coin.layer = Layers.Enum.UI_2D;
                coin.setSiblingIndex(Math.max(0, panel.children.length - 1));
                ensureUi(coin, 20, 20);
                const sprite = coin.addComponent(Sprite);
                sprite.spriteFrame = coinFrame;
                const opacity = coin.addComponent(UIOpacity);
                opacity.opacity = 255;
                const startPos = new Vec3(start.x, start.y, 0);
                coin.setPosition(startPos);
                coin.setScale(0.28, 0.28, 1);
                const arcOffsetX = (Math.random() - 0.5) * 44;
                const mid = new Vec3(
                    (startPos.x + end.x) / 2 + arcOffsetX,
                    Math.max(startPos.y, end.y) + 50 + Math.random() * 46,
                    0,
                );
                const launchDelay = i * 0.045;
                const firstLegDuration = 0.24 + Math.random() * 0.04;
                const secondLegDuration = 0.26 + Math.random() * 0.05;
                const landingSoundAt = launchDelay + firstLegDuration + secondLegDuration;
                const shouldPlayLandingSound = lastLandingSoundAt < 0 || landingSoundAt - lastLandingSoundAt >= 0.045;
                if (shouldPlayLandingSound) {
                    lastLandingSoundAt = landingSoundAt;
                }
                tween(coin)
                    .delay(launchDelay)
                    .to(firstLegDuration, { position: mid, scale: new Vec3(0.72, 0.72, 1) }, { easing: 'sineOut' })
                    .to(secondLegDuration, { position: new Vec3(end.x, end.y, 0), scale: new Vec3(0.18, 0.18, 1) }, { easing: 'sineIn' })
                    .call(() => {
                        if (shouldPlayLandingSound) {
                            AudioMgr.inst.play('place');
                        }
                        coin.removeFromParent();
                        coin.destroy();
                    })
                    .start();
            }
            const landDelay = (coinCount - 1) * 0.045 + 0.24 + 0.04 + 0.26 + 0.05;
            this.scheduleOnce?.(() => {
                if (!goldBox?.isValid) return;
                this.syncWinSettlementGoldBox?.();
                Tween.stopAllByTarget(goldBox);
                goldBox.setScale(1, 1, 1);
                tween(goldBox)
                    .to(0.08, { scale: new Vec3(1.08, 1.08, 1) })
                    .to(0.12, { scale: new Vec3(1, 1, 1) })
                    .start();
            }, landDelay);
            return true;
        },

        playWinBaseGoldRewardFx(): boolean {
            if (this._winBaseGoldFlyPlayed) return false;
            const amount = Math.max(0, Math.floor(Number(this._pendingWinGoldReward) || 0));
            if (amount <= 0) return false;
            this._winBaseGoldFlyPlayed = true;
            const source = this.panelWin
                ?.getChildByName('Box')
                ?.getChildByName('RewardGoldIcon') || null;
            this.scheduleOnce?.(() => {
                this.playWinSettlementGoldFlyReward?.(amount, source);
            }, 0.18);
            return true;
        },

        refreshWinAdBonusUI() {
            const box = this.panelWin?.getChildByName('Box');
            const adBtn = box?.getChildByName('AdBonusBtn');
            if (!adBtn) return;
        
            const titleLbl = adBtn.getChildByName('AdBonusBtnLbl')?.getComponent(Label)
                || adBtn.getChildByName('ContinueBtnLblAnchor')?.getChildByName('AdBonusBtnLbl')?.getComponent(Label);
            const subLbl = adBtn.getChildByName('AdBonusSubLbl')?.getComponent(Label)
                || adBtn.getChildByName('ContinueBtnSubLblAnchor')?.getChildByName('AdBonusSubLbl')?.getComponent(Label);
            const btn = adBtn.getComponent(Button);
            const opacity = adBtn.getComponent(UIOpacity) ?? adBtn.addComponent(UIOpacity);
            const eligible = !this._isThemeLevel && this._pendingWinAdBonusReward > 0 && !this._settlementNextTransitioning;
            const coinIcon = adBtn.getChildByName('AdBonusCoinIcon');
            const adIcon = adBtn.getChildByName('AdBonusAdIcon') || coinIcon;
            const claimedLbl = adBtn.getChildByName('AdBonusClaimedLbl');
        
            adBtn.active = eligible;
            if (!eligible) return;
        
            if (this._winAdRewardClaimed) {
                if (titleLbl) titleLbl.node.active = false;
                if (subLbl) subLbl.string = '';
                if (coinIcon) coinIcon.active = false;
                if (adIcon) adIcon.active = false;
                if (claimedLbl) claimedLbl.active = true;
                if (btn) {
                    btn.interactable = true;
                    btn.enabled = false;
                }
                opacity.opacity = 255;
                for (const sprite of adBtn.getComponentsInChildren(Sprite)) {
                    sprite.grayscale = false;
                    sprite.color = Color.WHITE;
                }
                return;
            }
        
            if (titleLbl) titleLbl.node.active = true;
            if (subLbl) subLbl.string = '';
            if (claimedLbl) claimedLbl.active = false;
            if (coinIcon) coinIcon.active = false;
            if (adIcon) {
                adIcon.active = true;
            }
            if (btn) {
                btn.enabled = true;
                btn.interactable = true;
            }
            opacity.opacity = 255;
            for (const sprite of adBtn.getComponentsInChildren(Sprite)) {
                sprite.grayscale = false;
                sprite.color = Color.WHITE;
            }
        },

        claimWinAdBonusReward() {
            if (this._isThemeLevel || this._winAdRewardClaimed || this._pendingWinAdBonusReward <= 0 || this._adShowing || this._settlementNextTransitioning) {
                return;
            }
            const grantWinBonusReward = () => {
                const rewardAmount = Math.max(0, Math.floor(Number(this._pendingWinAdBonusReward) || 0));
                const baseAmount = Math.max(0, Math.floor(Number(this._pendingWinGoldReward) || 0));
                const box = this.panelWin?.getChildByName('Box');
                const source = box?.getChildByName('RewardGoldIcon') || box?.getChildByName('RewardGoldLbl') || null;
                this.addGold(rewardAmount);
                this._winAdRewardClaimed = true;
                this.updateWinRewardLabel(baseAmount + rewardAmount);
                this.playWinSettlementGoldFlyReward?.(rewardAmount, source);
            };
            this.runRewardedGrant(WIN_BONUS_REWARD_GATE_PAGE, grantWinBonusReward, {
                busyFlag: '_adShowing',
                adFailToast: '广告未完成，未获得加领奖励',
                grantFailToast: '加领奖励发放失败，请重试',
            });
        },

        updateLoseProgressLabel() {
            const stats = this.getBoardCompletionStats();
            const failStats = {
                ...stats,
                completePercent: Math.min(98, Math.max(0, Math.floor(Number(stats.completePercent) || 0))),
            };
            this.syncSettlementProgressWidget(this.panelLose, failStats);
            this.syncSettlementProgressWidget(this.panelTimeoutContinue, failStats);
            this.syncSettlementProgressWidget(this.panelBufferFullContinue, failStats);
        },

        showLosePanel() {
            this.recordDynamicCountdownFinalFailure?.();
            if (this.panelTimeoutContinue) this.panelTimeoutContinue.active = false;
            if (this.panelBufferFullContinue) this.panelBufferFullContinue.active = false;
            this.updateLoseProgressLabel();
            if (this.panelLose) {
                this.panelLose.active = true;
                this.panelLose.setSiblingIndex(999);
            }
        },

        handleWinSettlementPrimaryAction() {
            if (!this.beginSettlementNextTransition()) return;
            if (this.shouldChainTutorialLevelsOnWin()) {
                this.continueTutorialToSlotIntro(this.levelData.levelId + 1);
                return;
            }
            this.goNextLevel();
        },

        beginSettlementNextTransition(): boolean {
            if (this._settlementNextTransitioning) return false;
            this._settlementNextTransitioning = true;
            this.setWinPrimaryButtonInteractable(false);
            this.refreshWinAdBonusUI();
            return true;
        },

        endSettlementNextTransition(): void {
            this._settlementNextTransitioning = false;
            this.setWinPrimaryButtonInteractable(true);
            this.refreshWinAdBonusUI();
        },

        setWinPrimaryButtonInteractable(interactable: boolean): void {
            const primaryBtn = this.panelWin
                ?.getChildByName('Box')
                ?.getChildByName('PrimaryBtn')
                ?.getComponent(Button);
            if (primaryBtn) primaryBtn.interactable = interactable;
        },

        shouldChainTutorialLevelsOnWin() {
            return !this._isThemeLevel && this.levelData?.levelId === 1;
        },

        continueTutorialToSlotIntro(nextId: number) {
            this.scheduleOnce(() => {
                this.loadLevel(nextId);
            }, 0.08);
        },

        getFirstThemeLevelId(): number {
            return this.getThemeLevelOrder()[0] || 0;
        },

        shouldPromptFirstThemeUnlockOnWin(): boolean {
            if (this._isThemeLevel || this.getActiveLogicalLevelId() !== this.getThemePanelOpenRequirementLevel()) {
                return false;
            }
            const firstThemeLevelId = this.getFirstThemeLevelId();
            if (firstThemeLevelId <= 0) {
                return false;
            }
            const unlocked = this.getThemeUnlockedSet();
            const completed = this.getThemeCompletedSet();
            return !unlocked.has(firstThemeLevelId) && !completed.has(firstThemeLevelId);
        },

        continueToFirstThemeUnlockPrompt() {
            this.showToast('已解锁主题挑战第一关资格，快去看看', 1.8);
            this.scheduleOnce(() => {
                this.showMainMenu();
                this.scheduleOnce(() => this.openThemePanel(), 0.08);
            }, 0.95);
        },

        failWinSettlementReveal(error: unknown, revealToken: number): void {
            if (revealToken !== this._settlementRevealToken || this._settlementRevealState === 'failed') return;
            this._settlementRevealState = 'failed';
            const message = error instanceof Error ? error.message : String(error || 'unknown error');
            console.error('[settlement] failed to reveal win panel:', error);
            try {
                this.showRemoteLoadFatalError?.('UI/Prefabs/Panels/WinPanel', 'win_settlement_reveal_failed', message);
            } catch (fatalUiError) {
                console.error('[settlement] failed to show terminal error UI:', fatalUiError);
            }
        },

        revealWinSettlementPanel(logicalLevelId: number, revealToken: number): boolean {
            if (!this.isValid || !this.isGameEnd || revealToken !== this._settlementRevealToken) return false;
            if (this._settlementRevealState === 'shown' || this._settlementRevealState === 'revealing' || this._settlementRevealState === 'failed') {
                return false;
            }
            this.closePinchGuide?.();
            if (!this.ensureGameplayResultPanelsCreated?.('win')) return false;
            this._settlementRevealState = 'revealing';
            try {
                const panel = this.panelWin as Node | null;
                if (!panel?.isValid) {
                    throw new Error('[WinPanel] result prefab was ready but panel instance is missing');
                }
                this.updateWinRewardLabel(this._pendingWinGoldReward);
                this.drawWinPatternPreview();
                this.ensureWinSettlementTopWidgets?.();
                PerformanceMgr.inst.markUserActivity(8000);
                AudioMgr.inst.play('winSettlement');
                if (this.boardGroup) {
                    tween(this.boardGroup)
                        .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
                        .start();
                }
                panel.active = true;
                panel.setSiblingIndex(999);
                this.playWinSettlementBannerFx?.();
                this.playWinBaseGoldRewardFx?.();
                this._settlementRevealState = 'shown';
                return true;
            } catch (error) {
                this.failWinSettlementReveal?.(error, revealToken);
                return false;
            }
        },

        requestWinSettlementReveal(logicalLevelId: number, revealToken: number): void {
            if (!this.isValid || !this.isGameEnd || revealToken !== this._settlementRevealToken) return;
            if (this._settlementRevealState === 'shown' || this._settlementRevealState === 'revealing' || this._settlementRevealState === 'failed') return;
            if (this.revealWinSettlementPanel?.(logicalLevelId, revealToken)) return;
            this._settlementRevealState = 'waiting';
            if (typeof this._ensureGameplayResultPanelPrefabsReady !== 'function') {
                this.failWinSettlementReveal?.(new Error('[WinPanel] result prefab readiness API is missing'), revealToken);
                return;
            }
            this._ensureGameplayResultPanelPrefabsReady(() => {
                if (!this.isValid || !this.isGameEnd || revealToken !== this._settlementRevealToken) return;
                this.revealWinSettlementPanel?.(logicalLevelId, revealToken);
            });
        },

        playPatternCompleteThenWin(delaySeconds: number = 0) {
            if (this.isGameEnd || this._patternCompleteWinPending) return;
            this._patternCompleteWinPending = true;
            if (this._pendingColorCompleteEffects instanceof Map) {
                this._pendingColorCompleteEffects.clear();
            }
            this.clearIdleHint();
            this.clearEndgameHints(false);
            this.unschedule(this.tickTimer);
            const runWin = () => {
                if (!this.isValid) return;
                this._patternCompleteWinPending = false;
                if (this.isGameEnd) return;
                this.gameWin();
            };
            const delay = Math.max(0, Number(delaySeconds) || 0);
            if (delay > 0 && typeof this.scheduleOnce === 'function') {
                this.scheduleOnce(runWin, delay);
            } else {
                runWin();
            }
        },

        gameWin() {
            if (this.isGameEnd) return;
            this.isGameEnd = true;
            this.closePinchGuide?.();
            this._patternCompleteWinPending = false;
            this.clearIdleHint();
            this.clearAdRewardHintVisuals?.();
            this.clearEndgameHints(false);
            this.unschedule(this.tickTimer);
            const logicalLevelId = this.getActiveLogicalLevelId();
            const smartHintShownCount = AnalyticsMgr.inst.getSmartHintShownCount();
            this.trackFirstLevelFunnel('level_pass', {
                source: 'gameWin',
                success: true,
                extra: {
                    smartHintShownCount,
                },
            });
            AnalyticsMgr.inst.markLevelPassed(this.getAnalyticsPage(), logicalLevelId);
            SySDKMgr.inst.reportLevelPass(logicalLevelId);
            this.recordDynamicCountdownWin?.();
            if (this._isThemeLevel) {
                this.setThemeCompleted(this._currentThemeLevelId || this.levelData.levelId);
            } else {
                this.saveLevelProgress(logicalLevelId + 1);
            }
            this._pendingWinGoldReward = this.calcWinGoldReward();
            this._pendingWinAdBonusReward = this._isThemeLevel
                ? 0
                : Math.max(0, this._pendingWinGoldReward * (ECONOMY_NUMERIC_TABLE.adReward.winTotalMultiplier - 1));
            this._winAdRewardClaimed = false;
            this._winBaseGoldFlyPlayed = false;
            this._settlementNextTransitioning = false;
            const revealToken = (Number(this._settlementRevealToken) || 0) + 1;
            this._settlementRevealToken = revealToken;
            this._settlementRevealState = 'waiting';
            this.addGold(this._pendingWinGoldReward);
            this.ensureGameplayResultPanelsCreated?.('win');
            this.updateWinRewardLabel(this._pendingWinGoldReward);

            const revealSettlement = () => {
                if (!this.isValid || !this.isGameEnd) return;
                this.requestWinSettlementReveal?.(logicalLevelId, revealToken);
            };

            const showSettlement = () => {
                if (!this.isValid || !this.isGameEnd) return;
                if (PATTERN_COMPLETE_SETTLEMENT_HOLD > 0 && typeof this.scheduleOnce === 'function') {
                    this.scheduleOnce(revealSettlement, PATTERN_COMPLETE_SETTLEMENT_HOLD);
                } else {
                    revealSettlement();
                }
            };

            const playPatternCompleteFx = () => {
                if (!this.isValid || !this.isGameEnd) return;
                PerformanceMgr.inst.markUserActivity(8000);
                AudioMgr.inst.play('winAll');
                this.playPatternCompleteMatchFx();
                showSettlement();
            };

            const playBoardCompleteShrink = () => {
                if (!this.isValid || !this.isGameEnd) return;
                if (!this.boardGroup) {
                    playPatternCompleteFx();
                    return;
                }
                tween(this.boardGroup)
                    .to(
                        PATTERN_COMPLETE_BOARD_SHRINK_DURATION,
                        {
                            scale: new Vec3(PATTERN_COMPLETE_BOARD_SHRINK_SCALE, PATTERN_COMPLETE_BOARD_SHRINK_SCALE, 1),
                            position: new Vec3(this.boardHomePos.x, this.boardHomePos.y, 0),
                        },
                        { easing: 'sineOut' },
                    )
                    .call(playPatternCompleteFx)
                    .start();
            };

            if (this.boardGroup && PATTERN_COMPLETE_BOARD_SHRINK_DELAY > 0 && typeof this.scheduleOnce === 'function') {
                this.scheduleOnce(playBoardCompleteShrink, PATTERN_COMPLETE_BOARD_SHRINK_DELAY);
            } else {
                playBoardCompleteShrink();
            }
        },

        drawWinPatternPreview() {
            if (!this.panelWin) return;
            const box = this.panelWin.getChildByName('Box');
            const previewNode = box?.getChildByName('PreviewFrame')?.getChildByName('PatternPreview')
                || box?.getChildByName('PatternPreview');
            if (!previewNode) return;

            previewNode.getChildByName('Preview')?.destroy();
            const bm = this.boardModel;
            const previewTransform = previewNode.getComponent(UITransform);
            const maxW = Math.max(120, previewTransform?.width || 392);
            const maxH = Math.max(120, previewTransform?.height || 228);
            renderPixelPosterPreview(
                previewNode,
                bm.correctColors,
                {
                    name: 'PixelPosterPreview',
                    offsetX: 0,
                    offsetY: 0,
                    maxW,
                    maxH,
                    mode: 'win',
                    cropToContent: true,
                    maxCellSize: Math.max(maxW, maxH),
                    cellGap: 0,
                    padding: 6,
                },
            );
        },

        gameLose(reason: 'timeout' | 'buffer-full' = 'timeout') {
            if (this.isGameEnd) return;
            if (this.boardModel?.isAllLocked?.()) {
                this.playPatternCompleteThenWin();
                return;
            }
            this.isGameEnd = true;
            this.clearIdleHint();
            this.clearAdRewardHintVisuals?.();
            this.unschedule(this.tickTimer);
            this.trackFirstLevelFunnel('level_fail', {
                source: reason === 'buffer-full' ? 'buffer_full' : 'gameLose',
                success: false,
            });
            const logicalLevelId = this.getAnalyticsLevelId();
            AnalyticsMgr.inst.markLevelFailed(this.getAnalyticsPage(), logicalLevelId);
            SySDKMgr.inst.reportLevelFail(logicalLevelId);
            PerformanceMgr.inst.markUserActivity(6000);
            AudioMgr.inst.play('lose');
            const showLoseResult = () => {
                this.updateLoseProgressLabel();
                if (reason === 'buffer-full' && this.panelBufferFullContinue) {
                    this.panelBufferFullContinue.active = true;
                    this.panelBufferFullContinue.setSiblingIndex(999);
                    if (this.panelTimeoutContinue) this.panelTimeoutContinue.active = false;
                    if (this.panelLose) this.panelLose.active = false;
                    return;
                }
                if (this.panelTimeoutContinue) {
                    this.panelTimeoutContinue.active = true;
                    this.panelTimeoutContinue.setSiblingIndex(999);
                    if (this.panelBufferFullContinue) this.panelBufferFullContinue.active = false;
                    if (this.panelLose) this.panelLose.active = false;
                    return;
                }
                this.showLosePanel();
            };
            if (!this.ensureGameplayResultPanelsCreated?.('lose-flow')) {
                this._ensureGameplayResultPanelPrefabsReady?.(() => {
                    if (!this.isValid || !this.isGameEnd) return;
                    this.ensureGameplayResultPanelsCreated?.('lose-flow');
                    showLoseResult();
                });
                return;
            }
            showLoseResult();
        },

        restart() {
            const entryMode = this._activeGameplayEntryMode || (this._isThemeLevel ? 'theme' : 'main');
            const activeLevel = this.getActiveLogicalLevelId();
            if (!this.costVigorForLevel(activeLevel, entryMode)) {
                this.showNoLivesAdModal({
                    source: 'restart',
                    onResult: (result: any) => {
                        if (result?.status !== 'granted' || !this.isValid) return;
                        if (this.getRuntimeSceneName('Game') !== 'Game') return;
                        if (this.getActiveLogicalLevelId() !== activeLevel) return;
                        if (!this.costVigorForLevel(activeLevel, entryMode)) return;
                        this.doRestart();
                    },
                });
                return;
            }
            this.doRestart();
        },

        doRestart() {
            AnalyticsMgr.inst.finalizePendingFailedLevel();
            this.isGameEnd = true;
            this.unschedule(this.tickTimer);
            this.unscheduleAllCallbacks();
            this.stopPulseTweens();
            this.clearDragNodes();
            if (this.startGameplayWithBackgroundSkinReady) {
                this.startGameplayWithBackgroundSkinReady(this.levelData, undefined, () => this.initGame(this.levelData));
            } else {
                this.initGame(this.levelData);
            }
        },

        /** 看广告后继续游戏；超时复活等待重新选豆，满槽复活立即恢复原倒计时。 */
        continueAfterLose(addSeconds: number, resumeTimerImmediately: boolean = false) {
            const timerWasStarted = !!this._timerStarted;
            this.revokeDynamicCountdownFinalFailure?.();
            this.markDynamicCountdownAssisted?.();
            if (this.panelTimeoutContinue) this.panelTimeoutContinue.active = false;
            if (this.panelBufferFullContinue) this.panelBufferFullContinue.active = false;
            if (this.panelLose) this.panelLose.active = false;
            this.timeRemain += addSeconds;
            if (this.timerLabel) {
                this.timerLabel.string = this.formatTime(this.timeRemain);
                this.timerLabel.color = this.timeRemain <= 30 ? new Color('#D73D2B') : new Color('#2E241A');
                const ln = this.timerLabel.node;
                Tween.stopAllByTarget(ln);
                ln.setScale(1, 1, 1);
            }
            this.resetTouchState();
        
            if (this.isSelected || this.currentBlock) {
                this.cancelSelection();
            }
            if (this._guideStep >= 0 && this._guidePhase === 'place') {
                this._guidePhase = 'select';
                this.showGuideStep(Math.max(0, this._guideStep - 1));
            }
        
            this._timerStarted = false;
            this._timerPauseRefs = 0;
            this._timerLockedForProp = false;
            this._freezeTimeLeft = 0;
            this._freezeTimeTotal = 0;
            this.clearFreezeSpineFx?.();
            this._adTimerSuspended = false;
            this.isGameEnd = false;
            this.unschedule(this.tickTimer);
            if (resumeTimerImmediately && timerWasStarted && !this._currentLevelUnlimitedTime) {
                this._timerStarted = true;
                this.schedule(this.tickTimer, 1);
            }
            this.resetIdleHintTimer();
        },

        goNextLevel() {
            this.isGameEnd = true;
            this.unschedule(this.tickTimer);
            this.unscheduleAllCallbacks();
            this.stopPulseTweens();
            this.clearDragNodes();
            // 主题关卡通关 → 回主菜单并打开主题面板
            if (this._isThemeLevel) {
                this.returnToThemePanel();
                return;
            }
            const nextId = this.getActiveLogicalLevelId() + 1;
            this.saveLevelProgress(nextId);
            // 下一关消耗体力
            if (!this.costVigorForLevel(nextId, 'main')) {
                this.showNoLivesAdModal({
                    source: 'next_level',
                    onResult: (result: any) => {
                        if (result?.status === 'cancelled') {
                            this.endSettlementNextTransition();
                            return;
                        }
                        if (result?.status !== 'granted' || !this.isValid) return;
                        if (this.getRuntimeSceneName('Game') !== 'Game') return;
                        if (!this.costVigorForLevel(nextId, 'main')) {
                            this.endSettlementNextTransition();
                            return;
                        }
                        this.loadLevel(nextId);
                    },
                });
                return;
            }
            this.loadLevel(nextId);
        },

        stopIdleHintTimer() {
            const handler = this._smartIdleHintTimerHandler as (() => void) | null;
            if (handler) {
                this.unschedule(handler);
            }
            this._smartIdleHintTimerHandler = null;
            this._smartIdleHintToken = (Number(this._smartIdleHintToken) || 0) + 1;
        },

        resetIdleHintTimer() {
            this.stopIdleHintTimer();
            this.clearSmartIdleHintVisuals?.();
            this._smartIdleHintEpisodeCycle = 0;
            if (this._smartIdleHintInputActive) return;
            if (!this.canArmSmartIdleHint?.()) return;
            this.armSmartIdleHintTimer?.(this.getSmartIdleHintDelaySeconds?.() ?? LEVEL_3_IDLE_HINT_FAST_DELAY_SECONDS);
        },

        clearIdleHint() {
            this.stopIdleHintTimer();
            this.clearSmartIdleHintVisuals?.();
            this._smartIdleHintEpisodeCycle = 0;
            this._smartIdleHintInputActive = false;
        },

        beginSmartIdleHintInputActivity() {
            this._smartIdleHintInputActive = true;
            this._smartIdleHintEpisodeCycle = 0;
            this.stopIdleHintTimer();
            this.clearSmartIdleHintVisuals?.();
        },

        endSmartIdleHintInputActivity() {
            if (!this._smartIdleHintInputActive) return;
            this._smartIdleHintInputActive = false;
            this.resetIdleHintTimer?.();
        },

        armSmartIdleHintTimer(delaySeconds: number) {
            if (this._smartIdleHintInputActive) return;
            const existingHandler = this._smartIdleHintTimerHandler as (() => void) | null;
            if (existingHandler) {
                this.unschedule(existingHandler);
            }
            const token = Number(this._smartIdleHintToken) || 0;
            const handler = () => this.showSmartIdleHintIfReady?.(token);
            this._smartIdleHintTimerHandler = handler;
            this.scheduleOnce(handler, Math.max(0, Number(delaySeconds) || 0));
        },

        getSmartIdleHintDelaySeconds(): number {
            const shownCount = Math.max(0, Math.floor(Number(this._smartIdleHintShownCount) || 0));
            const logicalLevelId = typeof this.getActiveLogicalLevelId === 'function'
                ? Math.floor(Number(this.getActiveLogicalLevelId()) || 0)
                : Math.floor(Number(this.levelData?.levelId) || 0);
            if (this.isExpSmartIdleHintEnabled(logicalLevelId)) {
                return logicalLevelId <= EXP_EARLY_SMART_IDLE_HINT_MAX_LEVEL_ID
                    ? EXP_EARLY_SMART_IDLE_HINT_DELAY_SECONDS
                    : EXP_SMART_IDLE_HINT_DELAY_SECONDS;
            }
            return logicalLevelId === LEVEL_3_IDLE_HINT_LEVEL_ID
                && shownCount < LEVEL_3_IDLE_HINT_FAST_SHOW_LIMIT
                ? LEVEL_3_IDLE_HINT_FAST_DELAY_SECONDS
                : SMART_IDLE_HINT_SLOW_DELAY_SECONDS;
        },

        isExpSmartIdleHintEnabled(logicalLevelId: number): boolean {
            if (logicalLevelId < EXP_SMART_IDLE_HINT_MIN_LEVEL_ID
                || logicalLevelId > EXP_SMART_IDLE_HINT_MAX_LEVEL_ID) {
                return false;
            }
            return getFrontLevelExperimentAnalyticsContext(logicalLevelId, 'level_')?.abBucket === 'exp';
        },

        canArmSmartIdleHint(): boolean {
            if (this.isGameEnd) return false;
            if (!this.boardModel || !this.slotModel || !this.levelData) return false;
            const entryMode = typeof this.getActiveGameplayEntryMode === 'function'
                ? this.getActiveGameplayEntryMode()
                : (this._activeGameplayEntryMode || 'main');
            if (entryMode !== 'main') return false;
            if (typeof this.isExternalLevelPreviewActive === 'function' && this.isExternalLevelPreviewActive()) return false;
            const logicalLevelId = typeof this.getActiveLogicalLevelId === 'function'
                ? Math.floor(Number(this.getActiveLogicalLevelId()) || 0)
                : Math.floor(Number(this.levelData?.levelId) || 0);
            if (this.isExpSmartIdleHintEnabled(logicalLevelId)) return true;
            if (logicalLevelId < LEVEL_3_IDLE_HINT_LEVEL_ID || logicalLevelId > SMART_IDLE_HINT_MAX_LEVEL_ID) {
                return false;
            }
            if (logicalLevelId === LEVEL_3_IDLE_HINT_LEVEL_ID) return true;
            return Math.max(0, Math.floor(Number(this._smartIdleHintShownCount) || 0))
                < LATER_LEVEL_IDLE_HINT_SHOW_LIMIT;
        },

        canShowSmartIdleHint(): boolean {
            if (!this.canArmSmartIdleHint?.()) return false;
            const guideStep = Number.isFinite(Number(this._guideStep))
                ? Math.floor(Number(this._guideStep))
                : -1;
            if (guideStep >= 0) return false;
            if ((this._guideMode || 'none') !== 'none') return false;
            if ((this._activeGameplayGuideLayoutMode || 'none') !== 'none') return false;
            if ((Number(this._modalFocusRefs) || 0) > 0) return false;
            if (this._guideInputSuspended) return false;
            if (this._skillActive) return false;
            if (this._smartIdleHintInputActive) return false;
            if (this.isPlacementVisualActive?.()) return false;
            return true;
        },

        showSmartIdleHintIfReady(token: number) {
            if (token !== (Number(this._smartIdleHintToken) || 0)) return;
            this._smartIdleHintTimerHandler = null;
            if (!this.canShowSmartIdleHint?.()) {
                if (this.canArmSmartIdleHint?.()) {
                    this.armSmartIdleHintTimer?.(SMART_IDLE_HINT_FOLLOWUP_DELAY_SECONDS);
                }
                return;
            }

            const plan = this.resolveSmartIdleHintPlan?.() as SmartIdleHintPlan | null;
            if (!plan) {
                if (this.canArmSmartIdleHint?.()) {
                    this.armSmartIdleHintTimer?.(this.getSmartIdleHintDelaySeconds?.() ?? LEVEL_3_IDLE_HINT_FAST_DELAY_SECONDS);
                }
                return;
            }
            this.clearSmartIdleHintVisuals?.();
            if (!this.ensureSmartIdleHintLayer?.()) return;
            const endpoints = this.resolveSmartIdleHintEndpoints?.(plan) as SmartIdleHintEndpoints | null;
            if (!endpoints) {
                this._smartIdleHintActive = true;
                this._smartIdleHintPlan = plan;
                this.clearSmartIdleHintVisuals?.();
                if (this.canArmSmartIdleHint?.()) {
                    this.armSmartIdleHintTimer?.(SMART_IDLE_HINT_FOLLOWUP_DELAY_SECONDS);
                }
                return;
            }
            this._smartIdleHintActive = true;
            this._smartIdleHintPlan = plan;
            this._guideReminderVisible = true;
            this._guideLayer!.active = true;

            const hand = this._guideHand as Node | null;
            if (!hand?.isValid) {
                this.clearSmartIdleHintVisuals?.();
                return;
            }

            const cycleToken = Number(this._smartIdleHintToken) || 0;
            this._smartIdleHintEpisodeCycle = Math.max(
                0,
                Math.floor(Number(this._smartIdleHintEpisodeCycle) || 0),
            ) + 1;
            this.startSmartIdleHintTapSequence?.(
                hand,
                endpoints.from,
                endpoints.to,
                () => this.completeSmartIdleHintCycle?.(cycleToken),
                endpoints.sourceHandVisible !== false,
            );
            this.trackSmartIdleHintShown?.(plan);
        },

        completeSmartIdleHintCycle(token: number) {
            if (token !== (Number(this._smartIdleHintToken) || 0)) return;
            this.clearSmartIdleHintVisuals?.();
            if (this._smartIdleHintInputActive || !this.canArmSmartIdleHint?.()) return;
            const logicalLevelId = typeof this.getActiveLogicalLevelId === 'function'
                ? Math.floor(Number(this.getActiveLogicalLevelId()) || 0)
                : Math.floor(Number(this.levelData?.levelId) || 0);
            const episodeCycle = Math.max(0, Math.floor(Number(this._smartIdleHintEpisodeCycle) || 0));
            if (logicalLevelId === LEVEL_3_IDLE_HINT_LEVEL_ID
                && episodeCycle < SMART_IDLE_HINT_MAX_CYCLES_PER_EPISODE) {
                this.armSmartIdleHintTimer?.(SMART_IDLE_HINT_REPEAT_DELAY_SECONDS);
            }
        },

        trackSmartIdleHintShown(plan: SmartIdleHintPlan) {
            this._smartIdleHintShownCount = Math.max(
                0,
                Math.floor(Number(this._smartIdleHintShownCount) || 0),
            ) + 1;
            const logicalLevelId = typeof this.getActiveLogicalLevelId === 'function'
                ? this.getActiveLogicalLevelId()
                : this.getAnalyticsLevelId?.();
            AnalyticsMgr.inst.trackSmartHintShow({
                levelId: logicalLevelId,
                page: this.getAnalyticsPage?.() || 'game',
                step: plan.step,
                colorId: plan.colorId,
                source: 'smart_idle_hint',
            });
        },

        clearSmartIdleHintVisuals() {
            const hadSmartIdleHint = !!this._smartIdleHintActive || !!this._smartIdleHintPlan;
            this._smartIdleHintActive = false;
            this._smartIdleHintPlan = null;
            if (!hadSmartIdleHint) return;

            this._guideReminderVisible = false;
            if (this._guideHand?.isValid) {
                Tween.stopAllByTarget(this._guideHand);
                const handOpacity = this._guideHand.getComponent(UIOpacity);
                if (handOpacity) {
                    Tween.stopAllByTarget(handOpacity);
                    handOpacity.opacity = 255;
                }
                this._guideHand.setScale(1, 1, 1);
                this._guideHand.active = false;
            }
            this.clearGuideHighlight?.();
            const guideStep = Number.isFinite(Number(this._guideStep))
                ? Math.floor(Number(this._guideStep))
                : -1;
            if (guideStep < 0) {
                if (this._guideBubble?.isValid) this._guideBubble.active = false;
                if (this._guideLayer?.isValid) this._guideLayer.active = false;
            }
        },

        resolveSmartIdleHintPlan(): SmartIdleHintPlan | null {
            const selectedPlan = this.resolveSelectedSmartIdleHintPlan?.() as SmartIdleHintPlan | null;
            if (selectedPlan) return selectedPlan;

            const slotEntries = this.getUsableSlotEntriesForIdleHint?.() || [];
            const occupiedSlots = slotEntries.filter((entry: { block: BeanBlockInfo | null }) => !!entry.block);
            if (occupiedSlots.length > 0) {
                const boardToBoard = this.findBoardToBoardIdleHint?.(occupiedSlots) as SmartIdleHintPlan | null;
                if (boardToBoard) return boardToBoard;

                const slotToBoard = this.findSlotToBoardIdleHint?.(occupiedSlots) as SmartIdleHintPlan | null;
                if (slotToBoard) return slotToBoard;
            }

            if (this.slotModel?.hasEmptySlot?.()) {
                const block = this.findBestMismatchedBoardBlockForIdleHint?.() as BeanBlockInfo | null;
                if (block) {
                    return {
                        step: 'board_to_slot',
                        colorId: block.colorId,
                        block,
                    };
                }
            }
            return null;
        },

        resolveSelectedSmartIdleHintPlan(): SmartIdleHintPlan | null {
            if (!this.isSelected || !this.currentBlock) return null;
            const block = this.currentBlock as BeanBlockInfo;
            const colorId = Math.floor(Number(block.colorId) || 0);
            if (colorId <= 0) return null;
            const targetCells = this.getEmptyTargetCellsForIdleHint?.(colorId) || [];

            if (block.source === 'slot' || (Array.isArray(this._selectedSlotIndices) && this._selectedSlotIndices.length > 0)) {
                if (targetCells.length <= 0) return null;
                if ((block.cells?.length || 0) > targetCells.length) return null;
                return {
                    step: 'slot_to_board',
                    colorId,
                    targetCells,
                    slotIndices: Array.isArray(this._selectedSlotIndices) ? [...this._selectedSlotIndices] : [],
                    destinationOnly: true,
                };
            }

            if (targetCells.length > 0) {
                return {
                    step: 'board_to_board',
                    colorId,
                    block,
                    targetCells,
                    destinationOnly: true,
                };
            }

            if (this.slotModel?.hasEmptySlot?.() && this.isMismatchedBoardBlockForIdleHint?.(block)) {
                return {
                    step: 'board_to_slot',
                    colorId,
                    block,
                    destinationOnly: true,
                };
            }
            return null;
        },

        getUsableSlotEntriesForIdleHint(): { index: number; block: BeanBlockInfo | null }[] {
            const all = this.slotModel?.getAll?.() || [];
            const totalCount = Math.max(0, Math.floor(Number(this.slotModel?.totalCount) || all.length));
            const unlockedCount = Math.max(0, Math.floor(Number(this.slotModel?.unlockedCount) || totalCount));
            const usableCount = Math.min(all.length, totalCount, unlockedCount);
            const entries: { index: number; block: BeanBlockInfo | null }[] = [];
            for (let i = 0; i < usableCount; i++) {
                if (this._hiddenSlotIndices?.has?.(i)) continue;
                entries.push({ index: i, block: all[i] || null });
            }
            return entries;
        },

        getEmptyTargetCellsForIdleHint(colorId: number): { row: number; col: number }[] {
            const bm = this.boardModel;
            const cells: { row: number; col: number }[] = [];
            if (!bm || colorId <= 0) return cells;
            for (let r = 0; r < bm.height; r++) {
                for (let c = 0; c < bm.width; c++) {
                    if (bm.currentColors[r][c] === 0
                        && !bm.locked[r][c]
                        && bm.correctColors[r][c] === colorId) {
                        cells.push({ row: r, col: c });
                    }
                }
            }
            return cells;
        },

        collectBoardBlocksForIdleHint(): BeanBlockInfo[] {
            const bm = this.boardModel;
            const blocks: BeanBlockInfo[] = [];
            if (!bm) return blocks;
            const visited = Array.from({ length: bm.height }, () => Array(bm.width).fill(false));
            for (let r = 0; r < bm.height; r++) {
                for (let c = 0; c < bm.width; c++) {
                    if (visited[r][c]) continue;
                    const colorId = bm.currentColors[r]?.[c] || 0;
                    if (colorId <= 0 || bm.locked[r]?.[c]) {
                        visited[r][c] = true;
                        continue;
                    }
                    const block = bm.getConnectedBlock(r, c);
                    if (!block) {
                        visited[r][c] = true;
                        continue;
                    }
                    for (const cell of block.cells) {
                        if (visited[cell.row]) visited[cell.row][cell.col] = true;
                    }
                    blocks.push(block);
                }
            }
            return blocks;
        },

        isMismatchedBoardBlockForIdleHint(block: BeanBlockInfo): boolean {
            const bm = this.boardModel;
            if (!bm || !block?.cells?.length) return false;
            return block.cells.some((cell) => bm.correctColors[cell.row]?.[cell.col] !== block.colorId);
        },

        findBestMismatchedBoardBlockForIdleHint(): BeanBlockInfo | null {
            const blocks = this.collectBoardBlocksForIdleHint?.() || [];
            let best: BeanBlockInfo | null = null;
            for (const block of blocks) {
                if (!this.isMismatchedBoardBlockForIdleHint?.(block)) continue;
                if (!best || block.cells.length > best.cells.length) {
                    best = block;
                }
            }
            return best;
        },

        findBoardToBoardIdleHint(
            occupiedSlots: { index: number; block: BeanBlockInfo | null }[],
        ): SmartIdleHintPlan | null {
            if (occupiedSlots.length === 0) return null;

            const blocks = this.collectBoardBlocksForIdleHint?.() || [];
            let best: SmartIdleHintPlan | null = null;
            let bestScore = -1;
            for (const block of blocks) {
                if (!this.isMismatchedBoardBlockForIdleHint?.(block)) continue;
                const targetCells = this.getEmptyTargetCellsForIdleHint?.(block.colorId) || [];
                if (targetCells.length <= 0) continue;
                const score = Math.min(block.cells.length, targetCells.length);
                if (score > bestScore) {
                    bestScore = score;
                    best = {
                        step: 'board_to_board',
                        colorId: block.colorId,
                        block,
                        targetCells,
                    };
                }
            }
            return best;
        },

        findSlotToBoardIdleHint(
            occupiedSlots: { index: number; block: BeanBlockInfo | null }[],
        ): SmartIdleHintPlan | null {
            const byColor = new Map<number, { slotIndices: number[]; cellCount: number }>();
            for (const entry of occupiedSlots) {
                const block = entry.block;
                if (!block) continue;
                const colorId = Math.floor(Number(block.colorId) || 0);
                if (colorId <= 0) continue;
                const group = byColor.get(colorId) || { slotIndices: [], cellCount: 0 };
                group.slotIndices.push(entry.index);
                group.cellCount += block.cells?.length || 0;
                byColor.set(colorId, group);
            }

            let best: SmartIdleHintPlan | null = null;
            let bestScore = -1;
            for (const [colorId, group] of byColor) {
                const targetCells = this.getEmptyTargetCellsForIdleHint?.(colorId) || [];
                if (targetCells.length <= 0) continue;
                if (group.cellCount > targetCells.length) continue;
                const score = group.cellCount;
                if (score > bestScore) {
                    bestScore = score;
                    best = {
                        step: 'slot_to_board',
                        colorId,
                        targetCells,
                        slotIndices: group.slotIndices,
                    };
                }
            }
            return best;
        },

        bindGuideLayerViewportSync(): void {
            const layer = this._guideLayer as Node | null;
            if (!layer?.isValid) return;
            layer.off(Node.EventType.SIZE_CHANGED, this.refreshGuideLayerViewportLayout, this);
            layer.on(Node.EventType.SIZE_CHANGED, this.refreshGuideLayerViewportLayout, this);
        },

        refreshGuideLayerViewportLayout(): void {
            if (!this._guideLayer?.isValid || !this._guideLayer.activeInHierarchy) return;
            const dimMask = this._guideDimMaskNode as Node | null;
            if (dimMask?.isValid && dimMask.activeInHierarchy) {
                const opacity = dimMask.getComponent(UIOpacity);
                this.showGuideDimMask?.(Math.max(0, Number(opacity?.opacity) || 132), false);
            }
            const bubble = this._guideBubble as Node | null;
            if (!bubble?.isValid || !bubble.activeInHierarchy) return;
            if (this._guideMode === 'slot_intro') {
                this.refreshSlotIntroGuideLayout?.();
            } else {
                this.adjustStarterGuidePromptForCurrentStep?.(bubble);
            }
        },

        ensureSmartIdleHintLayer(): boolean {
            const root = typeof this.requireCanvasUiRoot === 'function'
                ? this.requireCanvasUiRoot('OverlayRoot')
                : this.node;
            if (!root?.isValid) return false;
            if (root.parent) {
                root.setSiblingIndex(root.parent.children.length - 1);
            }
            const rootTransform = root.getComponent(UITransform);
            const guideLayerWidth = rootTransform?.contentSize.width || 720;
            const guideLayerHeight = rootTransform?.contentSize.height || 1280;
            if (!this._guideLayer?.isValid) {
                this._guideLayer = new Node('GuideLayer');
                root.addChild(this._guideLayer);
                this._guideLayer.addComponent(UITransform).setContentSize(guideLayerWidth, guideLayerHeight);
                this._guideLayer.layer = Layers.Enum.UI_2D;
            }
            stretchRuntimeUiNodeToParent(this._guideLayer);
            this.bindGuideLayerViewportSync?.();
            this._guideLayer.active = true;
            this._guideLayer.setSiblingIndex(Math.max(0, root.children.length - 1));
            const blocker = this._guideLayer.getComponent(BlockInputEvents);
            if (blocker) blocker.enabled = false;

            if (!this._guideMask?.isValid) {
                this._guideMask = new Node('GuideMask');
                this._guideLayer.addChild(this._guideMask);
                this._guideMask.addComponent(UITransform).setContentSize(guideLayerWidth, guideLayerHeight);
                this._guideMask.layer = Layers.Enum.UI_2D;
            }
            stretchRuntimeUiNodeToParent(this._guideMask);

            const guidePrompt = root.getChildByName('TutorialGuidePrompt');
            if (guidePrompt?.isValid) {
                guidePrompt.active = false;
                this._guideBubble = guidePrompt;
                this._guideBubbleLbl = guidePrompt
                    .getChildByName('SingleLinePrompt')
                    ?.getChildByName('PromptLabel')
                    ?.getComponent(Label) || null;
            }

            const handsRoot = root.getChildByName('TutorialGuideHands');
            const singleHand = handsRoot?.getChildByName('GuideHandSingle') || null;
            if (!handsRoot?.isValid || !singleHand?.getComponent(Sprite)) {
                runtimeWarn('[SmartIdleHint] missing guide hand node');
                return false;
            }
            handsRoot.active = true;
            handsRoot.setSiblingIndex(root.children.length - 1);
            singleHand.active = false;
            this._guideHandsRoot = handsRoot;
            this._guideHand = singleHand;
            return true;
        },

        getSmartIdleHintCellsCenter(cells: { row: number; col: number }[]): Vec3 | null {
            if (!cells?.length || !this._guideLayer?.isValid) return null;
            const bounds = this.getGuideCellsLayerBounds?.(cells);
            if (!bounds) return null;
            return new Vec3(bounds.centerX, bounds.centerY, 0);
        },

        orderSmartIdleHintCells(cells: { row: number; col: number }[]): { row: number; col: number }[] {
            if (!cells?.length) return [];
            const center = cells.reduce(
                (sum, cell) => ({ row: sum.row + cell.row, col: sum.col + cell.col }),
                { row: 0, col: 0 },
            );
            const centerRow = center.row / cells.length;
            const centerCol = center.col / cells.length;
            return [...cells].sort((left, right) => {
                const leftRow = left.row - centerRow;
                const leftCol = left.col - centerCol;
                const rightRow = right.row - centerRow;
                const rightCol = right.col - centerCol;
                return leftRow * leftRow + leftCol * leftCol
                    - (rightRow * rightRow + rightCol * rightCol);
            });
        },

        getSmartIdleHintPointWorld(target: Vec3): Vec3 | null {
            const layerUT = this._guideLayer?.getComponent(UITransform) || null;
            return layerUT ? layerUT.convertToWorldSpaceAR(new Vec3(target.x, target.y, 0)) : null;
        },

        getSmartIdleHintHandCorners(target: Vec3): Vec3[] {
            const handCenter = this.getSmartIdleHintHandPositionForTarget?.(target) || null;
            if (!handCenter) return [];
            const halfHand = GUIDE_HAND_BOX_SIZE / 2;
            return [
                new Vec3(handCenter.x - halfHand, handCenter.y - halfHand, 0),
                new Vec3(handCenter.x - halfHand, handCenter.y + halfHand, 0),
                new Vec3(handCenter.x + halfHand, handCenter.y - halfHand, 0),
                new Vec3(handCenter.x + halfHand, handCenter.y + halfHand, 0),
            ];
        },

        getSmartIdleHintHandBoundsInFixedRoot(
            target: Vec3,
        ): { left: number; right: number; bottom: number; top: number } | null {
            const fixedRoot = this.getGameplayFixedRoot?.() || null;
            const fixedUi = fixedRoot?.getComponent(UITransform) || null;
            const handCorners = this.getSmartIdleHintHandCorners?.(target) || [];
            if (!fixedUi || handCorners.length !== 4) return null;
            const fixedCorners = handCorners.map((corner) => {
                const world = this.getSmartIdleHintPointWorld?.(corner) || null;
                return world ? fixedUi.convertToNodeSpaceAR(world) : null;
            });
            if (fixedCorners.some((corner) => !corner)) return null;
            const corners = fixedCorners as Vec3[];
            return {
                left: Math.min(...corners.map((corner) => corner.x)),
                right: Math.max(...corners.map((corner) => corner.x)),
                bottom: Math.min(...corners.map((corner) => corner.y)),
                top: Math.max(...corners.map((corner) => corner.y)),
            };
        },

        doesSmartIdleHintHandOverlapFixedNode(target: Vec3, node: Node | null): boolean {
            const handBounds = this.getSmartIdleHintHandBoundsInFixedRoot?.(target) || null;
            const nodeBounds = this.getGameplayNodeBoundsInFixedRoot?.(node) || null;
            if (!handBounds) return true;
            if (!nodeBounds) return false;
            return handBounds.right >= nodeBounds.left - SMART_IDLE_HINT_BUTTON_GAP
                && handBounds.left <= nodeBounds.right + SMART_IDLE_HINT_BUTTON_GAP
                && handBounds.top >= nodeBounds.bottom - SMART_IDLE_HINT_BUTTON_GAP
                && handBounds.bottom <= nodeBounds.top + SMART_IDLE_HINT_BUTTON_GAP;
        },

        getSmartIdleHintHudBlockerNodes(): Node[] {
            const fixedRoot = this.getGameplayFixedRoot?.() || null;
            const buttonNodes = (fixedRoot?.getComponentsInChildren?.(Button) || [])
                .filter((button: Button) => (
                    button?.enabled
                    && button.interactable !== false
                    && button.node?.isValid
                    && button.node.activeInHierarchy
                ))
                .map((button: Button) => button.node);
            const topBar = this.getGameplayFixedGroup?.('TopBarGroup') || null;
            const skillRoot = this.getGameplayBottomHudChild?.('SkillArea') || null;
            const topBarBlockers = (topBar?.children || []).flatMap((child: Node) => (
                child.name === 'TopHud' ? child.children : [child]
            ));
            const blockers = [
                ...buttonNodes,
                ...topBarBlockers,
                ...(skillRoot?.children || []),
            ];
            return blockers.filter((node: Node, index: number) => (
                blockers.indexOf(node) === index
                && node?.isValid
                && node.activeInHierarchy
            ));
        },

        isSmartIdleHintPointVisible(target: Vec3, margin: number = 48): boolean {
            const layerUT = this._guideLayer?.getComponent(UITransform) || null;
            if (!layerUT) return false;
            const anchor = layerUT.anchorPoint || new Vec2(0.5, 0.5);
            const left = -layerUT.contentSize.width * anchor.x + margin;
            const right = layerUT.contentSize.width * (1 - anchor.x) - margin;
            const bottom = -layerUT.contentSize.height * anchor.y + margin;
            const top = layerUT.contentSize.height * (1 - anchor.y) - margin;
            return target.x >= left && target.x <= right && target.y >= bottom && target.y <= top;
        },

        isSmartIdleHintPointBlockedByButton(target: Vec3): boolean {
            const world = this.getSmartIdleHintPointWorld?.(target);
            if (!world) return true;
            try {
                return (this.getSmartIdleHintHudBlockerNodes?.() || []).some((node: Node) => (
                    this.doesSmartIdleHintHandOverlapFixedNode?.(target, node) !== false
                ));
            } catch {
                return true;
            }
        },

        isSmartIdleHintPointCoveredByHud(target: Vec3): boolean {
            const world = this.getSmartIdleHintPointWorld?.(target);
            const fixedRoot = this.getGameplayFixedRoot?.() || null;
            const fixedUi = fixedRoot?.getComponent(UITransform) || null;
            if (!world || !fixedUi) return true;
            const local = fixedUi.convertToNodeSpaceAR(world);
            try {
                return (this.getSmartIdleHintHudBlockerNodes?.() || []).some((node: Node) => {
                    const bounds = this.getGameplayNodeBoundsInFixedRoot?.(node) || null;
                    if (!bounds) return false;
                    return local.x >= bounds.left - SMART_IDLE_HINT_BUTTON_GAP
                        && local.x <= bounds.right + SMART_IDLE_HINT_BUTTON_GAP
                        && local.y >= bounds.bottom - SMART_IDLE_HINT_BUTTON_GAP
                        && local.y <= bounds.top + SMART_IDLE_HINT_BUTTON_GAP;
                });
            } catch {
                return true;
            }
        },

        isSmartIdleHintBoardPointSafe(target: Vec3, requireHandClear: boolean = true): boolean {
            const hudBlocked = requireHandClear
                ? this.isSmartIdleHintPointBlockedByButton?.(target)
                : this.isSmartIdleHintPointCoveredByHud?.(target);
            if (!this.isSmartIdleHintPointVisible?.(target) || hudBlocked) {
                return false;
            }
            const world = this.getSmartIdleHintPointWorld?.(target);
            if (!world) return false;
            try {
                const fixedRoot = this.getGameplayFixedRoot?.() || null;
                const fixedUT = fixedRoot?.getComponent(UITransform) || null;
                const safeRect = this.getBoardSafeViewportRect?.() || null;
                if (!fixedUT || !safeRect) return false;
                const margin = 8;
                const local = fixedUT.convertToNodeSpaceAR(world);
                return local.x >= safeRect.left + margin
                    && local.x <= safeRect.right - margin
                    && local.y >= safeRect.bottom + margin
                    && local.y <= safeRect.top - margin;
            } catch {
                return false;
            }
        },

        doesSmartIdleHintBlockMatch(actual: BeanBlockInfo | null, expected: BeanBlockInfo): boolean {
            if (!actual || !expected) return false;
            if (actual === expected) return true;
            if (actual.colorId !== expected.colorId) return false;
            const expectedCells = new Set((expected.cells || []).map((cell) => `${cell.row}:${cell.col}`));
            return (actual.cells || []).some((cell) => expectedCells.has(`${cell.row}:${cell.col}`));
        },

        isSmartIdleHintBoardSelectPointSafe(
            target: Vec3,
            block: BeanBlockInfo,
            requireHandClear: boolean = true,
        ): boolean {
            if (!this.isSmartIdleHintBoardPointSafe?.(target, requireHandClear)) return false;
            const world = this.getSmartIdleHintPointWorld?.(target);
            if (!world) return false;
            const slotIntent = this.resolveSlotTapIntent?.(world, 'none');
            if (slotIntent && slotIntent.kind !== 'miss') return false;
            const resolution = this.resolveBoardTapBlock?.(world, false);
            return this.doesSmartIdleHintBlockMatch?.(resolution?.block || null, block) === true;
        },

        isSmartIdleHintBoardPlacePointSafe(
            target: Vec3,
            colorId: number,
            fromSlot: boolean,
        ): boolean {
            if (!this.isSmartIdleHintBoardPointSafe?.(target)) return false;
            const world = this.getSmartIdleHintPointWorld?.(target);
            if (!world) return false;
            const flow = fromSlot ? 'slotSelected' : 'boardSelected';
            const slotIntent = this.resolveSlotTapIntent?.(world, flow);
            if (slotIntent && slotIntent.kind !== 'miss') return false;
            return this.getBoardPlaceTargetFromWorldPos?.(world, colorId, fromSlot) != null;
        },

        getSmartIdleHintSlotIndexCenter(slotIndex: number): Vec3 | null {
            if (!Number.isFinite(Number(slotIndex)) || !this._guideLayer?.isValid) return null;
            const index = Math.floor(Number(slotIndex));
            const bounds = this.getGuideSlotIndicesLayerBounds?.([index]);
            return bounds ? new Vec3(bounds.centerX, bounds.centerY, 0) : null;
        },

        isSmartIdleHintSlotPointSafe(
            target: Vec3,
            slotIndex: number,
            expectedKind: 'occupiedSlot' | 'emptyUnlockedSlot',
            colorId: number = 0,
        ): boolean {
            if (!this.isSmartIdleHintPointVisible?.(target, 36)
                || this.isSmartIdleHintPointBlockedByButton?.(target)) return false;
            const world = this.getSmartIdleHintPointWorld?.(target);
            if (!world) return false;
            const flow = expectedKind === 'emptyUnlockedSlot' ? 'boardSelected' : 'none';
            const intent = this.resolveSlotTapIntent?.(world, flow);
            if (!intent || intent.kind !== expectedKind || intent.candidate?.slotIndex !== slotIndex) return false;
            if (expectedKind === 'occupiedSlot' && colorId > 0) {
                return this.slotModel?.getBlock?.(slotIndex)?.colorId === colorId;
            }
            return true;
        },

        getSmartIdleHintSafeBoardSelectPoint(
            block: BeanBlockInfo,
            requireHandClear: boolean = true,
        ): Vec3 | null {
            for (const cell of this.orderSmartIdleHintCells?.(block?.cells || []) || []) {
                const point = this.getSmartIdleHintCellsCenter?.([cell]) || null;
                if (point && this.isSmartIdleHintBoardSelectPointSafe?.(point, block, requireHandClear)) {
                    return point;
                }
            }
            return null;
        },

        getSmartIdleHintSafeBoardPlacePoint(
            cells: { row: number; col: number }[],
            colorId: number,
            fromSlot: boolean,
        ): Vec3 | null {
            for (const cell of this.orderSmartIdleHintCells?.(cells || []) || []) {
                const point = this.getSmartIdleHintCellsCenter?.([cell]) || null;
                if (point && this.isSmartIdleHintBoardPlacePointSafe?.(point, colorId, fromSlot)) return point;
            }
            return null;
        },

        getSmartIdleHintSafeSlotSourcePoint(slotIndices: number[], colorId: number): Vec3 | null {
            for (const slotIndex of slotIndices || []) {
                const center = this.getSmartIdleHintSlotIndexCenter?.(slotIndex);
                if (center && this.isSmartIdleHintSlotPointSafe?.(center, slotIndex, 'occupiedSlot', colorId)) {
                    return center;
                }
            }
            return null;
        },

        getSmartIdleHintSafeEmptySlotPoint(): Vec3 | null {
            const entries = this.getUsableSlotEntriesForIdleHint?.() || [];
            for (const entry of entries as { index: number; block: BeanBlockInfo | null }[]) {
                if (entry.block) continue;
                const center = this.getSmartIdleHintSlotIndexCenter?.(entry.index) || null;
                if (center && this.isSmartIdleHintSlotPointSafe?.(center, entry.index, 'emptyUnlockedSlot')) {
                    return center;
                }
            }
            return null;
        },

        resolveSmartIdleHintEndpoints(plan: SmartIdleHintPlan): SmartIdleHintEndpoints | null {
            const destinationOnly = plan.destinationOnly === true;
            if (plan.step === 'board_to_slot' && plan.block) {
                const to = this.getSmartIdleHintSafeEmptySlotPoint?.() || null;
                let from = destinationOnly
                    ? null
                    : this.getSmartIdleHintSafeBoardSelectPoint?.(plan.block, true) || null;
                let sourceHandVisible = true;
                if (!destinationOnly && !from) {
                    from = this.getSmartIdleHintSafeBoardSelectPoint?.(plan.block, false) || null;
                    sourceHandVisible = false;
                }
                return to && (destinationOnly || from) ? { from, to, sourceHandVisible } : null;
            }
            if (plan.step === 'board_to_board' && plan.block && plan.targetCells?.length) {
                const to = this.getSmartIdleHintSafeBoardPlacePoint?.(plan.targetCells, plan.colorId, false) || null;
                let from = destinationOnly
                    ? null
                    : this.getSmartIdleHintSafeBoardSelectPoint?.(plan.block, true) || null;
                let sourceHandVisible = true;
                if (!destinationOnly && !from) {
                    from = this.getSmartIdleHintSafeBoardSelectPoint?.(plan.block, false) || null;
                    sourceHandVisible = false;
                }
                return to && (destinationOnly || from) ? { from, to, sourceHandVisible } : null;
            }
            if (plan.step === 'slot_to_board' && plan.targetCells?.length) {
                const to = this.getSmartIdleHintSafeBoardPlacePoint?.(plan.targetCells, plan.colorId, true) || null;
                const from = destinationOnly
                    ? null
                    : this.getSmartIdleHintSafeSlotSourcePoint?.(plan.slotIndices || [], plan.colorId) || null;
                return to && (destinationOnly || from) ? { from, to } : null;
            }
            return null;
        },

        getSmartIdleHintHandPositionForTarget(target: Vec3): Vec3 {
            return new Vec3(
                target.x - SMART_IDLE_HINT_FINGERTIP_OFFSET_X,
                target.y - SMART_IDLE_HINT_FINGERTIP_OFFSET_Y,
                0,
            );
        },

        startSmartIdleHintTapSequence(
            hand: Node,
            from: Vec3 | null,
            to: Vec3,
            onComplete?: () => void,
            showSourceHand: boolean = true,
        ) {
            Tween.stopAllByTarget(hand);
            const handOpacity = hand.getComponent(UIOpacity) || hand.addComponent(UIOpacity);
            Tween.stopAllByTarget(handOpacity);
            hand.active = true;
            handOpacity.opacity = 0;
            hand.setScale(1, 1, 1);
            const start = from
                ? this.getSmartIdleHintHandPositionForTarget?.(from) || new Vec3(from.x, from.y, 0)
                : null;
            const end = this.getSmartIdleHintHandPositionForTarget?.(to) || new Vec3(to.x, to.y, 0);
            const showAt = (position: Vec3) => {
                if (!hand.isValid) return;
                hand.setPosition(position);
                hand.setScale(1, 1, 1);
                handOpacity.opacity = 255;
                hand.active = true;
            };
            const hideWhileRunning = () => {
                if (!hand.isValid) return;
                handOpacity.opacity = 0;
                hand.setPosition(end);
                hand.setScale(1, 1, 1);
            };
            const finishHidden = () => {
                if (!hand.isValid) return;
                handOpacity.opacity = 0;
                hand.active = false;
                hand.setPosition(end);
                hand.setScale(1, 1, 1);
            };

            let sequence = tween(hand);
            if (from && start && showSourceHand) {
                sequence = sequence
                    .call(() => showAt(start))
                    .delay(0.10)
                    .to(0.12, { scale: new Vec3(SMART_IDLE_HINT_TAP_SCALE, SMART_IDLE_HINT_TAP_SCALE, 1) }, { easing: 'quadOut' })
                    .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
                    .delay(0.22)
                    .call(hideWhileRunning)
                    .delay(0.32);
            }
            sequence
                .call(() => showAt(end))
                .delay(0.10)
                .to(0.12, { scale: new Vec3(SMART_IDLE_HINT_TAP_SCALE, SMART_IDLE_HINT_TAP_SCALE, 1) }, { easing: 'quadOut' })
                .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
                .delay(SMART_IDLE_HINT_FINAL_HOLD_SECONDS)
                .call(() => {
                    Tween.stopAllByTarget(handOpacity);
                    tween(handOpacity).to(0.18, { opacity: 0 }, { easing: 'quadIn' }).start();
                })
                .delay(0.18)
                .call(() => {
                    finishHidden();
                    onComplete?.();
                })
                .start();
        },

        showGameplayInvalidTapFeedback(_worldPos: Vec3): void {
            if (this.isGameEnd || this._guideStep >= 0) return;
            if (!this.ensureSmartIdleHintLayer?.()) return;
            this._guideLayer!.active = true;

            const feedbackToken = Math.max(
                0,
                Math.floor(Number(this._gameplayInvalidTapFeedbackToken) || 0),
            ) + 1;
            this._gameplayInvalidTapFeedbackToken = feedbackToken;
            this.scheduleOnce?.(() => {
                if (feedbackToken !== (Number(this._gameplayInvalidTapFeedbackToken) || 0)) return;
                if (this._guideStep >= 0 || this._smartIdleHintActive) return;
                if (this._guideLayer?.isValid) this._guideLayer.active = false;
            }, 0.5);
        },

        // ==================== 新手引导 ====================
        // level_1:
        // Step 0: 选中 firstColorId 豆豆块（select 阶段，目标=暂存槽）
        // Step 1: 点击暂存槽放入（place 阶段）
        // Step 2: 选中 secondColorId 豆豆块（select 阶段，目标=棋盘）
        // Step 3: 点击棋盘目标位置放置（place 阶段）
        // Step 4: 从暂存槽选中 firstColorId（select 阶段，目标=棋盘）
        // Step 5: 点击棋盘目标位置放置 → 通关（place 阶段）
        //
        // level_2:
        // Step 0: 点击解锁按钮解锁全部剩余暂存槽
        // Step 1: 选中 firstColorId 豆豆块（select 阶段，目标=暂存槽）
        // Step 2: 点击暂存槽放入（place 阶段）
        // Step 3: 选中 secondColorId 豆豆块（select 阶段，目标=棋盘）
        // Step 4: 点击棋盘目标位置放置（place 阶段）
        // Step 5: 从暂存槽选中 firstColorId（select 阶段，目标=棋盘）
        // Step 6: 点击棋盘目标位置放置 → 通关（place 阶段）

        collectLevel2TutorialColorIds(limit: number = 2): number[] {
            const bm = this.boardModel;
            const visited = Array.from({ length: bm.height }, () => Array(bm.width).fill(false));
            const blocks: { colorId: number; size: number; order: number }[] = [];
            let order = 0;
            for (let r = 0; r < bm.height; r++) {
                for (let c = 0; c < bm.width; c++) {
                    const colorId = bm.currentColors[r]?.[c] || 0;
                    if (colorId === 0 || bm.locked[r]?.[c] || visited[r][c]) {
                        continue;
                    }
                    const block = bm.getConnectedBlock(r, c);
                    if (!block) {
                        visited[r][c] = true;
                        continue;
                    }
                    for (const cell of block.cells) {
                        if (visited[cell.row]) visited[cell.row][cell.col] = true;
                    }
                    blocks.push({ colorId: block.colorId, size: block.cells.length, order: order++ });
                }
            }
            blocks.sort((a, b) => {
                return b.size - a.size || a.order - b.order;
            });
            const colors: number[] = [];
            const seen = new Set<number>();
            for (const block of blocks) {
                if (seen.has(block.colorId)) continue;
                seen.add(block.colorId);
                colors.push(block.colorId);
                if (colors.length >= limit) break;
            }
            return colors;
        },

        collectZoomTutorialColorIds(limit: number = 2): number[] {
            const colors = this.collectLevel2TutorialColorIds(limit);
            return colors.sort((colorA: number, colorB: number) => {
                const blockA = this.findBlockOnBoard?.(colorA);
                const blockB = this.findBlockOnBoard?.(colorB);
                const averageRow = (block: BeanBlockInfo | null | undefined) => {
                    if (!block?.cells?.length) return -1;
                    return block.cells.reduce((sum: number, cell: { row: number }) => sum + cell.row, 0) / block.cells.length;
                };
                return averageRow(blockB) - averageRow(blockA);
            });
        },
        
        collectTutorialColorIds(limit: number = 2): number[] {
            const colors: number[] = [];
            const seen = new Set<number>();
            const bm = this.boardModel;
            for (let r = 0; r < bm.height; r++) {
                for (let c = 0; c < bm.width; c++) {
                    const colorId = bm.currentColors[r][c];
                    if (colorId === 0 || bm.locked[r][c] || seen.has(colorId)) {
                        continue;
                    }
                    seen.add(colorId);
                    colors.push(colorId);
                    if (colors.length >= limit) {
                        return colors;
                    }
                }
            }
            return colors;
        },

        startTutorial(mode: TutorialMode) {
            PerformanceMgr.inst.markUserActivity(8000);
            this._guideMode = mode;
            this._guideStep = 0;
            this._guideTotalSteps = mode === 'level_1' ? 6 : (mode === 'level_2' ? 7 : ((mode === 'zoom' || mode === 'slot_intro') ? 1 : 0));
            this._guideInputSuspended = false;
            this._guideLevel2SlotPlacementSucceeded = false;
            this._guideStatus = 'awaiting_action';
            this._guidePreviewVisible = false;
            this._guideTargetFeedbackNode = null;
            this._guideTransientFeedbackNodes = [];
            this._guideVisualShownAt = 0;
            this._guideActionEnabledAt = 0;
            this._guideTransitionStartedAt = 0;
            this._guideWrongAttemptCount = 0;
            this._guideReminderStage = 0;
            this._guidePhase = typeof this.getTutorialPhaseForStep === 'function'
                ? this.getTutorialPhaseForStep(0)
                : 'select';
            this._lastGuideVoiceToken = '';
            this.unschedule(this.tickTimer);
            if (typeof this.clearExpandSlotGuide === 'function') {
                this.clearExpandSlotGuide();
            }
        
            // 从当前棋盘动态确定两种可操作颜色（跳过已锁定格）
            if (mode === 'slot_intro' || mode === 'zoom') {
                this._guideFirstColorId = 0;
                this._guideSecondColorId = 0;
            } else {
                const tutorialColors = mode === 'level_2'
                    ? this.collectLevel2TutorialColorIds(2)
                    : this.collectTutorialColorIds(2);
                this._guideFirstColorId = tutorialColors[0] || 0;
                this._guideSecondColorId = tutorialColors[1] || this._guideFirstColorId;
                if (this._guideFirstColorId === 0) {
                    if (mode === 'level_2') {
                        throw new Error('[guide] level_2 requires a playable board block');
                    }
                    this._guideMode = 'none';
                    this._guideTotalSteps = 0;
                    this._guideStep = -1;
                    this.scheduleOnce(() => this.playPatternCompleteThenWin(), 0.1);
                    return;
                }
            }
        
            // 重置到初始适配视图，确保引导视觉准确且不丢失小棋盘放大比例
            if (typeof this.resetBoardViewportToHome === 'function') {
                this.resetBoardViewportToHome();
            } else if (this.boardViewport) {
                this.boardViewport.resetToHome();
                this.boardViewScale = this.boardViewport.scale;
            }
            this._guideZoomStartScale = Number(this.boardViewport?.scale || this.boardViewScale || 1);
            this._guideZoomLastScale = this._guideZoomStartScale;
            this._guideZoomAccumulatedScaleDelta = 0;
            this._guideZoomLastSource = '';
        
            const root = typeof this.requireCanvasUiRoot === 'function'
                ? this.requireCanvasUiRoot('OverlayRoot')
                : this.node;
            if (root.parent) {
                root.setSiblingIndex(root.parent.children.length - 1);
            }
            const rootTransform = root.getComponent(UITransform);
            const guideLayerWidth = rootTransform?.contentSize.width || 720;
            const guideLayerHeight = rootTransform?.contentSize.height || 1280;
            this._guideLayer = new Node('GuideLayer');
            root.addChild(this._guideLayer);
            this._guideLayer.addComponent(UITransform).setContentSize(guideLayerWidth, guideLayerHeight);
            this._guideLayer.layer = Layers.Enum.UI_2D;
            stretchRuntimeUiNodeToParent(this._guideLayer);
            this.bindGuideLayerViewportSync?.();
            this._guideLayer.setSiblingIndex(Math.max(0, root.children.length - 1));
            if (mode !== 'zoom') {
                this._guideLayer.addComponent(BlockInputEvents);
                this._guideLayer.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
                    if (this.isGuideDemoTouchTarget?.(event.target as Node)) {
                        event.propagationStopped = true;
                        return;
                    }
                    const uiPos = event.getUILocation();
                    const worldPos = new Vec3(uiPos.x, uiPos.y, 0);
                    this.markFirstLevelTouchTiming?.();
                    if (this._guideInputSuspended) {
                        this.reportTutorialTapResult?.(worldPos, 'ignored_suspended', false, 'guide_layer');
                        return;
                    }
                    this.reportFirstLevelAnyTouch?.(worldPos, 'guide_layer', 'tutorial');
                    this.reportTutorialLayerTouchStart?.(worldPos);
                    event.propagationStopped = true;
                }, this);
                this._guideLayer.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                    if (this.isGuideDemoTouchTarget?.(event.target as Node)) {
                        event.propagationStopped = true;
                        return;
                    }
                    const uiPos = event.getUILocation();
                    const worldPos = new Vec3(uiPos.x, uiPos.y, 0);
                    if (this._guideInputSuspended) {
                        this.reportTutorialTapResult?.(worldPos, 'ignored_suspended', false, 'guide_layer');
                        return;
                    }
                    if (this.isGameEnd || this._guideStep < 0) {
                        this.reportTutorialTapResult?.(worldPos, 'ignored_invalid_step', false, 'guide_layer');
                        return;
                    }
                    this.handleGuideTap(worldPos);
                    event.propagationStopped = true;
                }, this);
            }
        
            this._guideMask = new Node('GuideMask');
            this._guideLayer.addChild(this._guideMask);
            this._guideMask.addComponent(UITransform).setContentSize(guideLayerWidth, guideLayerHeight);
            this._guideMask.layer = Layers.Enum.UI_2D;
            stretchRuntimeUiNodeToParent(this._guideMask);
        
            const guidePrompt = root.getChildByName('TutorialGuidePrompt');
            if (!guidePrompt) {
                throw new Error('[guide] Game.scene is missing OverlayRoot/TutorialGuidePrompt');
            }
            const promptVariant = this._guideMode === 'slot_intro'
                ? 'SlotIntroPrompt'
                : 'SingleLinePrompt';
            const lbl = this.activateGuidePromptVariant?.(guidePrompt, promptVariant) || null;
            if (!lbl) {
                throw new Error(`[guide] Game.scene is missing ${promptVariant}/PromptLabel Label`);
            }
            guidePrompt.active = true;
            this._guideBubble = guidePrompt;
            this._guideBubbleLbl = lbl;
            this._guidePromptDefaultLabelColor = new Color(lbl.color.r, lbl.color.g, lbl.color.b, lbl.color.a);
            this._guidePromptDefaultCenterY = guidePrompt.position.y;
        
            const handsRoot = root.getChildByName('TutorialGuideHands');
            const singleHand = handsRoot?.getChildByName('GuideHandSingle') || null;
            const pinchLeftHand = handsRoot?.getChildByName('GuideHandPinchLeft') || null;
            const pinchRightHand = handsRoot?.getChildByName('GuideHandPinchRight') || null;
            if (!handsRoot?.isValid || !singleHand?.getComponent(Sprite)
                || !pinchLeftHand?.getComponent(Sprite) || !pinchRightHand?.getComponent(Sprite)) {
                throw new Error('[guide] Game.scene is missing OverlayRoot/TutorialGuideHands hand variants');
            }
            handsRoot.active = true;
            handsRoot.setSiblingIndex(root.children.length - 1);
            singleHand.active = false;
            pinchLeftHand.active = false;
            pinchRightHand.active = false;
            this._guideHandsRoot = handsRoot;
            this._guideHand = singleHand;
            this._guidePinchLeftHand = pinchLeftHand;
            this._guidePinchRightHand = pinchRightHand;
            guidePrompt.setSiblingIndex(root.children.length - 1);
        
            this.showGuideStep(0);
            if ((Number(this._modalFocusRefs) || 0) > 0) {
                this.suspendGuideForModal('active-modal');
            }
        },

        showGuideStep(step: number, options: { previewOnly?: boolean; resumeOnly?: boolean } = {}): boolean {
            const previewOnly = options.previewOnly === true;
            const resumeOnly = !previewOnly && options.resumeOnly === true;
            const renderPhase = previewOnly
                ? (this.getTutorialPhaseForStep?.(step) || this._guidePhase)
                : this._guidePhase;
            if (previewOnly && (
                (this._guideMode !== 'level_1' && this._guideMode !== 'level_2')
                || this._guideStatus !== 'transitioning'
                || step !== this._guideStep + 1
            )) {
                return false;
            }
            this.clearGuideRuntimeVisuals?.(resumeOnly);
            if (!previewOnly && !resumeOnly) {
                this._guideStep = step;
                this._guidePreviewStep = -1;
                this._guideRenderStep = -1;
                this._guidePreviewVisible = false;
                this._guideWrongAttemptCount = 0;
                this._guideReminderStage = 0;
                this._guideReminderDueAt = 0;
                this._guideReminderRemainingMs = 0;
                this._guideReminderVoicePlayed = false;
                this._guideStatus = 'awaiting_action';
            }
            if (this._guideInputSuspended) {
                this.clearGuideRuntimeVisuals?.();
                if (this._guideLayer?.isValid) {
                    this._guideLayer.active = false;
                }
                return false;
            }
            if (!this._guideLayer) return false;
            this._guideLayer.active = true;
            if (this._guideMask?.isValid) {
                this._guideMask.active = true;
            }
            this._guideReminderVisible = !previewOnly;
        
            Tween.stopAllByTarget(this._guideHand!);
            this._guideHand!.setScale(1, 1, 1);
            this._guideHand!.active = false;
            this.clearGuideHighlight();
        
            // 清理临时节点
            const toRemove: Node[] = [];
            for (const child of this._guideLayer!.children) {
                if (child.name === 'GuideHighlight') toRemove.push(child);
            }
            for (const n of toRemove) { Tween.stopAllByTarget(n); n.destroy(); }
        
            const mask = this._guideMask!;
            const hand = this._guideHand!;
            const bubble = this._guideBubble!;
            const lbl = this._guideBubbleLbl!;
        
            let gm = mask.getComponent(Graphics); if (!gm) gm = mask.addComponent(Graphics); gm.clear();
            const gb = bubble.getComponent(Graphics); if (gb) gb.clear();
            if (previewOnly) {
                bubble.active = false;
                hand.active = false;
                const previousRenderStep = this._guideRenderStep;
                this._guideRenderStep = step;
                const previewShown = this.showGuideTargetFeedback?.('preview') === true;
                this._guideRenderStep = previousRenderStep;
                if (!previewShown) return false;
                this._guidePreviewStep = step;
                this._guidePreviewVisible = true;
                this._guideVisualShownAt = Date.now();
                this._guideStatus = 'transitioning';
                this.trackFirstLevelFunnel('tutorial_transition_feedback_shown', {
                    stepId: step,
                    stepName: `${this._guideMode}:${step}:${renderPhase}`,
                    source: 'tutorial_preview',
                    success: true,
                    extra: {
                        previewOnly: true,
                        actionEnabled: false,
                        transitionElapsedMs: Math.max(0, Date.now() - (Number(this._guideTransitionStartedAt) || Date.now())),
                    },
                });
                return true;
            }
            const previousRenderStep = this._guideRenderStep;
            this._guideRenderStep = step;
            this._guideSuppressInitialHandPulse = resumeOnly;
            try {
                switch (this._guideMode) {
                    case 'level_1':
                        switch (step) {
                            case 0: this.guideStep0(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 1: this.guideStep1(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 2: this.guideStep2(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 3: this.guideStep3(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 4: this.guideStep4(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 5: this.guideStep5(gm, gb as Graphics, lbl, bubble, hand); break;
                            default: this.endTutorial(); break;
                        }
                        break;
                    case 'level_2':
                        switch (step) {
                            case 0: this.guideLevel2UnlockStep(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 1: this.guideLevel2PickBlockStep(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 2: this.guideLevel2PlaceBlockStep(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 3: this.guideLevel2PickCounterpartStep(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 4: this.guideLevel2PlaceCounterpartStep(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 5: this.guideLevel2PickBufferedStep(gm, gb as Graphics, lbl, bubble, hand); break;
                            case 6: this.guideLevel2PlaceBufferedStep(gm, gb as Graphics, lbl, bubble, hand); break;
                            default: this.endTutorial(); break;
                        }
                        break;
                    case 'zoom':
                        switch (step) {
                            case 0: this.guideZoomGestureStep(gm, gb as Graphics, lbl, bubble, hand); break;
                            default: this.endTutorial(); break;
                        }
                        break;
                    case 'slot_intro':
                        switch (step) {
                            case 0: this.guideSlotIntroStep(gm, gb as Graphics, lbl, bubble, hand); break;
                            default: this.endTutorial(); break;
                        }
                        break;
                    default:
                        this.endTutorial();
                        break;
                }
            } finally {
                this._guideRenderStep = previousRenderStep;
                this._guideSuppressInitialHandPulse = false;
            }
            if (this._guideMode !== 'zoom') {
                this.showGuideTargetFeedback?.('actionable');
                this.showGuideDimMask?.(
                    resumeOnly && (Number(this._guideReminderStage) || 0) >= 2 ? 184 : 132,
                    false,
                );
            }
            const actionableNow = resumeOnly && (Number(this._guideActionEnabledAt) || 0) > 0
                ? Number(this._guideActionEnabledAt)
                : Date.now();
            if (!resumeOnly) {
                this._guideVisualShownAt = actionableNow;
                this._guideActionEnabledAt = actionableNow;
            }
            if ((this._guideMode === 'level_1' || this._guideMode === 'level_2')
                && (!bubble.active || !hand.active)) {
                throw new Error(`[guide] actionable step is missing visible bubble/hand: ${this._guideMode}:${step}:${renderPhase}`);
            }
            if (!resumeOnly) {
                this.markTutorialStepShownForFunnel?.(step, renderPhase);
                this.trackFirstLevelFunnel('tutorial_step_show', {
                    stepId: step,
                    stepName: `${this._guideMode}:${step}:${renderPhase}`,
                    source: 'tutorial',
                    success: true,
                    extra: {
                        actionEnabled: true,
                        visualToActionMs: 0,
                    },
                });
                this.markTutorialStepInteractiveReadyForFunnel?.(step);
            }
            this.armGuideReminder?.();
            if (!resumeOnly && this.shouldPlayInitialGuidePathForStep?.(step)) {
                this.playGuidePathHint?.(1, 'step_enter');
            }
        
            if (!resumeOnly) this.playGuideVoiceForCurrentStep(step);
            return true;
        },

        getGuideVoiceCueForStep(step: number): SfxName | null {
            const cueByStep: Partial<Record<number, SfxName>> = {
                0: 'guideLevel1Pick1',
                1: 'guideLevel1Place1',
                2: 'guideLevel1Pick2',
                3: 'guideLevel1Place2',
            };
            return cueByStep[step] || null;
        },

        playGuideVoiceForCurrentStep(step: number) {
            if (this._guideMode !== 'level_1') return;
            if (this.isMainlineMainLevel()) return;
            const cue = this.getGuideVoiceCueForStep?.(step) || null;
            if (!cue) return;
        
            const token = `${this._guideMode}:${step}`;
            if (this._lastGuideVoiceToken === token) return;
            this._lastGuideVoiceToken = token;
        
            this.scheduleOnce(() => {
                if (this._guideMode === 'level_1' && this._guideStep === step) {
                    AudioMgr.inst.play(cue);
                }
            }, 0.05);
        },

        playGuideReminderVoiceForCurrentStep(step: number): void {
            if (this._guideMode !== 'level_1' || this.isMainlineMainLevel()) return;
            if (this._guideReminderVoicePlayed) return;
            const cue = this.getGuideVoiceCueForStep?.(step) || null;
            if (!cue) return;
            this._guideReminderVoicePlayed = true;
            AudioMgr.inst.play(cue);
        },

        isMinimalTutorialGuide(): boolean {
            return this._guideMode === 'level_1' || this._guideMode === 'level_2' || this._guideMode === 'zoom' || this._guideMode === 'slot_intro';
        },

        formatLevel1GuidePrompt(primaryText: string): string {
            return primaryText;
        },

        getGuideNodeVerticalBoundsInLayer(node: Node | null, targetLayer: Node | null): { bottom: number; top: number } | null {
            const nodeUi = node?.getComponent(UITransform);
            const targetUi = targetLayer?.getComponent(UITransform);
            if (!node?.isValid || !node.active || !nodeUi || !targetUi) return null;
            const width = nodeUi.contentSize.width;
            const height = nodeUi.contentSize.height;
            const anchor = nodeUi.anchorPoint;
            const left = -width * anchor.x;
            const right = width * (1 - anchor.x);
            const bottom = -height * anchor.y;
            const top = height * (1 - anchor.y);
            const corners = [
                new Vec3(left, bottom, 0),
                new Vec3(left, top, 0),
                new Vec3(right, bottom, 0),
                new Vec3(right, top, 0),
            ];
            let minY = Number.POSITIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;
            for (const corner of corners) {
                const world = nodeUi.convertToWorldSpaceAR(corner);
                const local = targetUi.convertToNodeSpaceAR(world);
                minY = Math.min(minY, local.y);
                maxY = Math.max(maxY, local.y);
            }
            if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
            return { bottom: minY, top: maxY };
        },

        getGuideTopBarAvoidBottomY(): number | null {
            const targetLayer = this._guideLayer as Node | null;
            let bottomY: number | null = null;
            try {
                const topBar = this.getGameplayFixedGroup?.('TopBarGroup') || null;
                for (const child of topBar?.children || []) {
                    const bounds = this.getGuideNodeVerticalBoundsInLayer(child, targetLayer);
                    if (!bounds) continue;
                    bottomY = bottomY === null ? bounds.bottom : Math.min(bottomY, bounds.bottom);
                }
            } catch {}
            return bottomY;
        },

        getGuideBoardAvoidTopY(): number | null {
            const targetLayer = this._guideLayer as Node | null;
            try {
                if (Array.isArray(this._guideHighlightCells) && this._guideHighlightCells.length > 0 && typeof this.getGuideCellsLayerBounds === 'function') {
                    const bounds = this.getGuideCellsLayerBounds(this._guideHighlightCells);
                    if (Number.isFinite(bounds?.centerY) && Number.isFinite(bounds?.height)) {
                        return bounds.centerY + bounds.height / 2;
                    }
                }
            } catch {}
            const boardBounds = this.getGuideNodeVerticalBoundsInLayer(this.boardNode || null, targetLayer);
            return Number.isFinite(boardBounds?.top) ? boardBounds!.top : null;
        },

        getGuidePromptCenterY(defaultCenterY: number, promptHeight: number): number {
            const topGap = 12;
            const boardGap = 12;
            const rootTransform = (typeof this.requireCanvasUiRoot === 'function'
                ? this.requireCanvasUiRoot('OverlayRoot')
                : this.node)?.getComponent(UITransform);
            const visibleHalfH = rootTransform ? rootTransform.contentSize.height / 2 : 640;
            const visibleTop = visibleHalfH - promptHeight / 2 - topGap;
            const visibleBottom = -visibleHalfH + promptHeight / 2 + boardGap;
            const clampToVisible = (value: number) => Math.max(visibleBottom, Math.min(value, visibleTop));
            let centerY = defaultCenterY;
            const topBarBottom = this.getGuideTopBarAvoidBottomY();
            let boardTop = this.getGuideBoardAvoidTopY();
            if (topBarBottom !== null && boardTop !== null && boardTop >= topBarBottom) {
                boardTop = null;
            }
            if (topBarBottom !== null && boardTop !== null && topBarBottom > boardTop) {
                const topLimit = topBarBottom - promptHeight / 2 - topGap;
                const bottomLimit = boardTop + promptHeight / 2 + boardGap;
                if (topLimit >= bottomLimit) {
                    return clampToVisible(Math.max(bottomLimit, Math.min(centerY, topLimit)));
                }
                return clampToVisible((topBarBottom + boardTop) / 2);
            }
            if (topBarBottom !== null) {
                centerY = Math.min(centerY, topBarBottom - promptHeight / 2 - topGap);
            }
            if (boardTop !== null) {
                centerY = Math.max(centerY, boardTop + promptHeight / 2 + boardGap);
            }
            return clampToVisible(centerY);
        },

        styleLevel1GuidePrompt(_gb: Graphics | null, bubble: Node, lbl: Label, primaryText: string) {
            this.styleStarterGuidePrompt(_gb, bubble, lbl, primaryText);
        },

        formatLevel2GuidePrompt(primaryText: string): string {
            return primaryText;
        },
    });
}
