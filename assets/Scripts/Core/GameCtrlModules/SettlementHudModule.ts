import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, ProgressBar, EventTouch,
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
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, BoardViewportController
} from '../GameCtrlShared';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { runtimeWarn } from '../RuntimeLog';
import { renderPixelPosterPreview } from '../PixelPosterPreviewRenderer';

const PATTERN_COMPLETE_BOARD_SHRINK_DELAY = 0;
const PATTERN_COMPLETE_BOARD_SHRINK_DURATION = 0.3;
const PATTERN_COMPLETE_BOARD_SHRINK_SCALE = 0.8;
const PATTERN_COMPLETE_SETTLEMENT_HOLD = 0.5;
const WIN_BONUS_REWARD_GATE_PAGE = 'win_bonus_reward';
const WIN_BONUS_SHARE_ICON_TEXTURE = 'popup_share_icon';
const WIN_BONUS_SHARE_RATE = 0.2;
const WIN_BONUS_SHARE_DAILY_LIMIT = 2;
const WIN_BONUS_SHARE_MIN_LEVEL_GAP = 5;
const WIN_BONUS_SHARE_MIN_INTERVAL_MS = 10 * 60 * 1000;
const WIN_BONUS_SHARE_GATE_STATE_KEY = 'pdd.winBonusShareGate.v1';
const PRE10_IDLE_HINT_DELAY_SECONDS = 10;
const PRE10_IDLE_HINT_FOLLOWUP_DELAY_SECONDS = 1.2;
const PRE10_IDLE_HINT_MAX_LEVEL_ID = 10;
const SMART_IDLE_HINT_FINGERTIP_OFFSET_X = -31;
const SMART_IDLE_HINT_FINGERTIP_OFFSET_Y = 43;
const SMART_IDLE_HINT_TAP_SCALE = 0.88;
const SMART_IDLE_HINT_HAND_TIME_SCALE = 1.25;

type WinBonusRewardGateMode = 'ad' | 'share';
type WinBonusShareGateState = {
    dateKey: string;
    appearCount: number;
    lastLevelId: number;
    lastAtMs: number;
};
type SmartIdleHintStep = 'board_to_slot' | 'board_to_board' | 'slot_to_board';
type SmartIdleHintPlan = {
    step: SmartIdleHintStep;
    colorId: number;
    block?: BeanBlockInfo;
    targetCells?: { row: number; col: number }[];
    slotIndices?: number[];
};

const GOLD_TEXTURE_NAME = '\u91d1\u5e01';

function ensureUi(node: Node, width: number, height: number): UITransform {
    const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
    ui.setContentSize(width, height);
    return ui;
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

export function installSettlementHudModule(target: any): void {
    Object.assign(target, {
        finishSkillUsage() {
            this._skillActive = false;
            this._skillAnimOnly = false;
            this._timerLockedForProp = false;
            this.resumeTimerForProp();
            this.resetIdleHintTimer();
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
            settingsBtn.targetOff(this);
            const settingsButton = settingsBtn.getComponent(Button) || settingsBtn.addComponent(Button);
            settingsButton.node.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('uiPanel');
                this.openSettingsPanel?.();
            }, this);
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

        getWinBonusShareGateDateKey(nowMs: number = Date.now()): string {
            const date = new Date(nowMs);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const monthText = month < 10 ? `0${month}` : `${month}`;
            const dayText = day < 10 ? `0${day}` : `${day}`;
            return `${year}-${monthText}-${dayText}`;
        },

        readWinBonusShareGateState(nowMs: number = Date.now()): WinBonusShareGateState {
            const dateKey = this.getWinBonusShareGateDateKey(nowMs);
            const fallback: WinBonusShareGateState = {
                dateKey,
                appearCount: 0,
                lastLevelId: 0,
                lastAtMs: 0,
            };
            try {
                const raw = sys.localStorage?.getItem(WIN_BONUS_SHARE_GATE_STATE_KEY);
                if (!raw) return fallback;
                const parsed = JSON.parse(raw);
                if (!parsed || parsed.dateKey !== dateKey) return fallback;
                return {
                    dateKey,
                    appearCount: Math.max(0, Math.floor(Number(parsed.appearCount) || 0)),
                    lastLevelId: Math.max(0, Math.floor(Number(parsed.lastLevelId) || 0)),
                    lastAtMs: Math.max(0, Number(parsed.lastAtMs) || 0),
                };
            } catch (error) {
                console.warn('[winBonusShareGate] read state failed:', error);
                return fallback;
            }
        },

        writeWinBonusShareGateState(state: WinBonusShareGateState): void {
            try {
                sys.localStorage?.setItem(WIN_BONUS_SHARE_GATE_STATE_KEY, JSON.stringify(state));
            } catch (error) {
                console.warn('[winBonusShareGate] write state failed:', error);
            }
        },

        canUseWinBonusShareGate(levelId: number, nowMs: number = Date.now()): boolean {
            const wx: any = typeof this.getWeChatRuntime === 'function' ? this.getWeChatRuntime() : null;
            if (!wx || typeof wx.shareAppMessage !== 'function') return false;
            const state = this.readWinBonusShareGateState(nowMs);
            if (state.appearCount >= WIN_BONUS_SHARE_DAILY_LIMIT) return false;
            if (state.lastAtMs > 0 && nowMs - state.lastAtMs < WIN_BONUS_SHARE_MIN_INTERVAL_MS) return false;
            if (state.lastLevelId > 0 && levelId > 0 && Math.abs(levelId - state.lastLevelId) < WIN_BONUS_SHARE_MIN_LEVEL_GAP) return false;
            return true;
        },

        recordWinBonusShareGateAppearance(levelId: number, nowMs: number = Date.now()): void {
            const state = this.readWinBonusShareGateState(nowMs);
            this.writeWinBonusShareGateState({
                dateKey: state.dateKey,
                appearCount: state.appearCount + 1,
                lastLevelId: Math.max(0, Math.floor(Number(levelId) || 0)),
                lastAtMs: nowMs,
            });
        },

        resolveWinBonusRewardGateMode(): WinBonusRewardGateMode {
            if (this._winBonusRewardGateMode === 'ad' || this._winBonusRewardGateMode === 'share') {
                return this._winBonusRewardGateMode;
            }
            const levelId = this.getActiveLogicalLevelId?.() || this.levelData?.levelId || 0;
            let mode: WinBonusRewardGateMode = 'ad';
            if (this.canUseWinBonusShareGate(levelId) && Math.random() < WIN_BONUS_SHARE_RATE) {
                mode = 'share';
                this.recordWinBonusShareGateAppearance(levelId);
            }
            this._winBonusRewardGateMode = mode;
            return mode;
        },

        ensureWinBonusShareIcon(adBtn: Node): Node {
            let icon = adBtn.getChildByName('AdBonusShareIcon');
            const anchor = adBtn.getChildByName('AdBonusAdIcon') || adBtn.getChildByName('AdBonusCoinIcon');
            if (!icon) {
                icon = new Node('AdBonusShareIcon');
                icon.layer = adBtn.layer;
                adBtn.addChild(icon);
                icon.setSiblingIndex(0);
                icon.addComponent(UITransform).setContentSize(42, 42);
                icon.addComponent(Sprite);
            }
            const transform = icon.getComponent(UITransform) ?? icon.addComponent(UITransform);
            transform.setContentSize(42, 42);
            if (anchor) {
                icon.setPosition(anchor.position.x, anchor.position.y, anchor.position.z);
            } else {
                icon.setPosition(-66, 5, 0);
            }
            const sprite = icon.getComponent(Sprite) ?? icon.addComponent(Sprite);
            const cached = this.getSF?.(WIN_BONUS_SHARE_ICON_TEXTURE) || null;
            const applyShareIcon = (targetSprite: Sprite | null, frame: SpriteFrame | null, reason: string) => {
                if (!targetSprite || !frame) return;
                if (typeof this.scheduleSpriteFrameApply === 'function') {
                    this.scheduleSpriteFrameApply(targetSprite, frame, reason);
                    return;
                }
                targetSprite.spriteFrame = frame;
            };
            if (cached) {
                applyShareIcon(sprite, cached, `${WIN_BONUS_SHARE_ICON_TEXTURE}:cache`);
            } else if (typeof this._loadSpriteFrameByName === 'function') {
                this._loadSpriteFrameByName(WIN_BONUS_SHARE_ICON_TEXTURE, (sf: SpriteFrame | null) => {
                    if (!icon?.isValid || !sf) return;
                    const currentSprite = icon.getComponent(Sprite);
                    applyShareIcon(currentSprite, sf, `${WIN_BONUS_SHARE_ICON_TEXTURE}:load`);
                });
            }
            return icon;
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
            const existingShareIcon = adBtn.getChildByName('AdBonusShareIcon');
            const claimedLbl = adBtn.getChildByName('AdBonusClaimedLbl');
        
            adBtn.active = eligible;
            if (!eligible) return;
        
            if (this._winAdRewardClaimed) {
                if (titleLbl) titleLbl.node.active = false;
                if (subLbl) subLbl.string = '';
                if (coinIcon) coinIcon.active = false;
                if (adIcon) adIcon.active = false;
                if (existingShareIcon) existingShareIcon.active = false;
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
        
            const gateMode = this.resolveWinBonusRewardGateMode();
            const shareIcon = gateMode === 'share'
                ? this.ensureWinBonusShareIcon(adBtn)
                : existingShareIcon;
            if (titleLbl) titleLbl.node.active = true;
            if (subLbl) subLbl.string = '';
            if (claimedLbl) claimedLbl.active = false;
            if (coinIcon) coinIcon.active = false;
            if (adIcon) {
                adIcon.active = gateMode !== 'share';
            }
            if (shareIcon) {
                shareIcon.active = gateMode === 'share';
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
            if (this.resolveWinBonusRewardGateMode() === 'share') {
                this.runShareGrant(WIN_BONUS_REWARD_GATE_PAGE, grantWinBonusReward, {
                    busyFlag: '_adShowing',
                    shareType: WIN_BONUS_REWARD_GATE_PAGE,
                    title: () => `我在拼豆豆通关了第${this.getActiveLogicalLevelId?.() || this.levelData?.levelId || 0}关，快来一起挑战！`,
                    query: () => `level=${this.getActiveLogicalLevelId?.() || this.levelData?.levelId || 0}`,
                    shareFailToast: '分享未完成，未获得加领奖励',
                    grantFailToast: '加领奖励发放失败，请重试',
                });
                return;
            }
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
        },

        showLosePanel() {
            this.recordDynamicCountdownFinalFailure?.();
            if (this.panelTimeoutContinue) this.panelTimeoutContinue.active = false;
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
            if (!this.ensureGameplayResultPanelsCreated?.()) return false;
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
            this.trackFirstLevelFunnel('level_pass', {
                source: 'gameWin',
                success: true,
            });
            const logicalLevelId = this.getActiveLogicalLevelId();
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
                : Math.max(0, ECONOMY_NUMERIC_TABLE.adReward.winBonusGold);
            this._winAdRewardClaimed = false;
            this._winBonusRewardGateMode = null;
            this._winBaseGoldFlyPlayed = false;
            this._settlementNextTransitioning = false;
            const revealToken = (Number(this._settlementRevealToken) || 0) + 1;
            this._settlementRevealToken = revealToken;
            this._settlementRevealState = 'waiting';
            this.addGold(this._pendingWinGoldReward);
            this.ensureGameplayResultPanelsCreated?.();
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
                this.playPatternCompleteMatchFx(showSettlement);
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

        gameLose() {
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
                source: 'gameLose',
                success: false,
            });
            const logicalLevelId = this.getAnalyticsLevelId();
            AnalyticsMgr.inst.markLevelFailed(this.getAnalyticsPage(), logicalLevelId);
            SySDKMgr.inst.reportLevelFail(logicalLevelId);
            PerformanceMgr.inst.markUserActivity(6000);
            AudioMgr.inst.play('lose');
            const showLoseResult = () => {
                this.updateLoseProgressLabel();
                if (this.panelTimeoutContinue) {
                    this.panelTimeoutContinue.active = true;
                    this.panelTimeoutContinue.setSiblingIndex(999);
                    if (this.panelLose) this.panelLose.active = false;
                    return;
                }
                this.showLosePanel();
            };
            if (!this.ensureGameplayResultPanelsCreated?.()) {
                this._ensureGameplayResultPanelPrefabsReady?.(() => {
                    if (!this.isValid || !this.isGameEnd) return;
                    this.ensureGameplayResultPanelsCreated?.();
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

        /** 看广告后继续游戏：恢复交互，但计时器需等重新选中豆豆后再开始 */
        continueAfterLose(addSeconds: number) {
            this.revokeDynamicCountdownFinalFailure?.();
            this.markDynamicCountdownAssisted?.();
            if (this.panelTimeoutContinue) this.panelTimeoutContinue.active = false;
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
            if (!this.canArmSmartIdleHint?.()) return;
            this.armSmartIdleHintTimer?.(PRE10_IDLE_HINT_DELAY_SECONDS);
        },

        clearIdleHint() {
            this.stopIdleHintTimer();
            this.clearSmartIdleHintVisuals?.();
        },

        armSmartIdleHintTimer(delaySeconds: number) {
            const existingHandler = this._smartIdleHintTimerHandler as (() => void) | null;
            if (existingHandler) {
                this.unschedule(existingHandler);
            }
            const token = Number(this._smartIdleHintToken) || 0;
            const handler = () => this.showSmartIdleHintIfReady?.(token);
            this._smartIdleHintTimerHandler = handler;
            this.scheduleOnce(handler, Math.max(0, Number(delaySeconds) || 0));
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
            return logicalLevelId >= 1 && logicalLevelId <= PRE10_IDLE_HINT_MAX_LEVEL_ID;
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
            if (this.isPlacementVisualActive?.()) return false;
            return true;
        },

        showSmartIdleHintIfReady(token: number) {
            if (token !== (Number(this._smartIdleHintToken) || 0)) return;
            this._smartIdleHintTimerHandler = null;
            if (!this.canShowSmartIdleHint?.()) {
                if (this.canArmSmartIdleHint?.()) {
                    this.armSmartIdleHintTimer?.(PRE10_IDLE_HINT_FOLLOWUP_DELAY_SECONDS);
                }
                return;
            }

            const plan = this.resolveSmartIdleHintPlan?.() as SmartIdleHintPlan | null;
            if (!plan) {
                if (this.canArmSmartIdleHint?.()) {
                    this.armSmartIdleHintTimer?.(PRE10_IDLE_HINT_DELAY_SECONDS);
                }
                return;
            }
            this.clearSmartIdleHintVisuals?.();
            if (!this.ensureSmartIdleHintLayer?.()) return;
            this._smartIdleHintActive = true;
            this._smartIdleHintPlan = plan;
            this._guideReminderVisible = true;
            this._guideLayer!.active = true;

            const hand = this._guideHand as Node | null;
            if (!hand?.isValid) return;

            if (plan.step === 'board_to_slot' && plan.block) {
                const from = this.getSmartIdleHintBlockTapPoint?.(plan.block);
                const to = this.getSmartIdleHintFirstEmptySlotCenter?.();
                if (from && to) {
                    this.startSmartIdleHintHandPath?.(hand, from, to);
                    this.armSmartIdleHintTimer?.(PRE10_IDLE_HINT_DELAY_SECONDS);
                } else if (this.canArmSmartIdleHint?.()) {
                    this.armSmartIdleHintTimer?.(PRE10_IDLE_HINT_FOLLOWUP_DELAY_SECONDS);
                }
                return;
            }

            if (plan.step === 'board_to_board' && plan.block && plan.targetCells?.length) {
                const from = this.getSmartIdleHintBlockTapPoint?.(plan.block);
                const to = this.getSmartIdleHintCellsTapPoint?.(plan.targetCells);
                if (from && to) {
                    this.startSmartIdleHintHandPath?.(hand, from, to);
                    this.armSmartIdleHintTimer?.(PRE10_IDLE_HINT_DELAY_SECONDS);
                } else if (this.canArmSmartIdleHint?.()) {
                    this.armSmartIdleHintTimer?.(PRE10_IDLE_HINT_FOLLOWUP_DELAY_SECONDS);
                }
                return;
            }

            if (plan.step === 'slot_to_board' && plan.targetCells?.length) {
                const from = this.getSmartIdleHintFirstSlotIndexCenter?.(plan.slotIndices || []);
                const to = this.getSmartIdleHintCellsTapPoint?.(plan.targetCells);
                if (from && to) {
                    this.startSmartIdleHintHandPath?.(hand, from, to);
                    this.armSmartIdleHintTimer?.(PRE10_IDLE_HINT_DELAY_SECONDS);
                } else if (this.canArmSmartIdleHint?.()) {
                    this.armSmartIdleHintTimer?.(PRE10_IDLE_HINT_FOLLOWUP_DELAY_SECONDS);
                }
            }
        },

        clearSmartIdleHintVisuals() {
            const hadSmartIdleHint = !!this._smartIdleHintActive || !!this._smartIdleHintPlan;
            this._smartIdleHintActive = false;
            this._smartIdleHintPlan = null;
            if (!hadSmartIdleHint) return;

            this._guideReminderVisible = false;
            if (this._guideHand?.isValid) {
                Tween.stopAllByTarget(this._guideHand);
                this._guideHand.setScale(1, 1, 1);
                this._guideHand.active = false;
            }
            this.clearSmartIdleHintTapRipples?.();
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
                };
            }

            if (targetCells.length > 0) {
                return {
                    step: 'board_to_board',
                    colorId,
                    block,
                    targetCells,
                };
            }

            if (this.slotModel?.hasEmptySlot?.() && this.isMismatchedBoardBlockForIdleHint?.(block)) {
                return {
                    step: 'board_to_slot',
                    colorId,
                    block,
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

        pickSmartIdleHintCell(cells: { row: number; col: number }[]): { row: number; col: number } | null {
            if (!cells?.length) return null;
            const center = cells.reduce(
                (sum, cell) => ({ row: sum.row + cell.row, col: sum.col + cell.col }),
                { row: 0, col: 0 },
            );
            const centerRow = center.row / cells.length;
            const centerCol = center.col / cells.length;
            let best = cells[0];
            let bestDist = Infinity;
            for (const cell of cells) {
                const rowDelta = cell.row - centerRow;
                const colDelta = cell.col - centerCol;
                const dist = rowDelta * rowDelta + colDelta * colDelta;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = cell;
                }
            }
            return best;
        },

        getSmartIdleHintCellsTapPoint(cells: { row: number; col: number }[]): Vec3 | null {
            const cell = this.pickSmartIdleHintCell?.(cells);
            return cell ? this.getSmartIdleHintCellsCenter?.([cell]) || null : null;
        },

        getSmartIdleHintBlockTapPoint(block: BeanBlockInfo): Vec3 | null {
            return this.getSmartIdleHintCellsTapPoint?.(block?.cells || []) || null;
        },

        getSmartIdleHintSlotIndexCenter(slotIndex: number): Vec3 | null {
            if (!Number.isFinite(Number(slotIndex)) || !this._guideLayer?.isValid) return null;
            const index = Math.floor(Number(slotIndex));
            const bounds = this.getGuideSlotIndicesLayerBounds?.([index]);
            return bounds ? new Vec3(bounds.centerX, bounds.centerY, 0) : null;
        },

        getSmartIdleHintFirstSlotIndexCenter(slotIndices: number[]): Vec3 | null {
            for (const slotIndex of slotIndices || []) {
                const center = this.getSmartIdleHintSlotIndexCenter?.(slotIndex);
                if (center) return center;
            }
            return null;
        },

        getSmartIdleHintFirstEmptySlotCenter(): Vec3 | null {
            const entries = this.getUsableSlotEntriesForIdleHint?.() || [];
            const empty = entries.find((entry: { index: number; block: BeanBlockInfo | null }) => !entry.block);
            return empty ? this.getSmartIdleHintSlotIndexCenter?.(empty.index) || null : null;
        },

        getSmartIdleHintHandPositionForTarget(target: Vec3): Vec3 {
            return new Vec3(
                target.x - SMART_IDLE_HINT_FINGERTIP_OFFSET_X,
                target.y - SMART_IDLE_HINT_FINGERTIP_OFFSET_Y,
                0,
            );
        },

        playSmartIdleHintTapRipple(target: Vec3) {
            const layer = this._guideLayer as Node | null;
            if (!layer?.isValid) return;

            const ring = new Node('GuideTapRing');
            layer.addChild(ring);
            ring.layer = layer.layer;
            ring.addComponent(UITransform).setContentSize(112, 112);
            ring.setPosition(target.x, target.y, 0);
            ring.setScale(0.68, 0.68, 1);

            const opacity = ring.addComponent(UIOpacity);
            opacity.opacity = 220;
            const g = ring.addComponent(Graphics);
            g.fillColor = new Color(94, 148, 255, 42);
            g.circle(0, 0, 30);
            g.fill();
            g.strokeColor = new Color(86, 142, 255, 210);
            g.lineWidth = 6;
            g.circle(0, 0, 30);
            g.stroke();
            g.strokeColor = new Color(255, 255, 255, 190);
            g.lineWidth = 3;
            g.circle(0, 0, 18);
            g.stroke();

            tween(ring)
                .to(0.42, { scale: new Vec3(1.7, 1.7, 1) }, { easing: 'sineOut' })
                .call(() => {
                    if (ring.isValid) ring.destroy();
                })
                .start();
            tween(opacity)
                .to(0.42, { opacity: 0 }, { easing: 'quadIn' })
                .start();
        },

        clearSmartIdleHintTapRipples() {
            const layer = this._guideLayer as Node | null;
            if (!layer?.isValid) return;
            const toRemove = layer.children.filter((child: Node) => child.name === 'GuideTapRing');
            for (const child of toRemove) {
                Tween.stopAllByTarget(child);
                child.destroy();
            }
        },

        startSmartIdleHintHandPath(hand: Node, from: Vec3, to: Vec3) {
            Tween.stopAllByTarget(hand);
            hand.active = true;
            hand.setScale(1, 1, 1);
            const s = SMART_IDLE_HINT_HAND_TIME_SCALE;
            const start = this.getSmartIdleHintHandPositionForTarget?.(from) || new Vec3(from.x, from.y, 0);
            const end = this.getSmartIdleHintHandPositionForTarget?.(to) || new Vec3(to.x, to.y, 0);
            hand.setPosition(start);
            tween(hand)
                .repeatForever(
                    tween(hand)
                        .call(() => {
                            hand.setPosition(start);
                            hand.setScale(1, 1, 1);
                        })
                        .delay(0.08 * s)
                        .to(0.10 * s, { scale: new Vec3(SMART_IDLE_HINT_TAP_SCALE, SMART_IDLE_HINT_TAP_SCALE, 1) }, { easing: 'quadOut' })
                        .call(() => this.playSmartIdleHintTapRipple?.(from))
                        .to(0.12 * s, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
                        .delay(0.16 * s)
                        .to(0.55 * s, { position: end }, { easing: 'sineInOut' })
                        .delay(0.08 * s)
                        .to(0.10 * s, { scale: new Vec3(SMART_IDLE_HINT_TAP_SCALE, SMART_IDLE_HINT_TAP_SCALE, 1) }, { easing: 'quadOut' })
                        .call(() => this.playSmartIdleHintTapRipple?.(to))
                        .to(0.12 * s, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
                        .delay(0.45 * s)
                )
                .start();
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
            this._guideLayer.setSiblingIndex(Math.max(0, root.children.length - 1));
            if (mode !== 'zoom') {
                this._guideLayer.addComponent(BlockInputEvents);
                this._guideLayer.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
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

        showGuideStep(step: number) {
            this.clearGuideReminderTimer?.();
            this.hideGuideReminderVisuals?.();
            this._guideStep = step;
            this._guideStatus = 'awaiting_action';
            if (this._guideInputSuspended) {
                this.clearGuideRuntimeVisuals?.();
                if (this._guideLayer?.isValid) {
                    this._guideLayer.active = false;
                }
                return;
            }
            if (!this._guideLayer) return;
            this._guideLayer.active = true;
            // 首次展示与 5 秒未操作提醒是两件事。步骤创建当帧就允许手势可见；
            // armGuideReminder() 只负责后续重复提醒，不能再作为首次显示门控。
            this._guideReminderVisible = true;
            this.markTutorialStepShownForFunnel?.(step);
            this.trackFirstLevelFunnel('tutorial_step_show', {
                stepId: step,
                stepName: `${this._guideMode}:${step}:${this._guidePhase}`,
                source: 'tutorial',
            });
        
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
            this.markTutorialStepInteractiveReadyForFunnel?.(step);
            this.armGuideReminder?.();
        
            this.playGuideVoiceForCurrentStep(step);
        },

        playGuideVoiceForCurrentStep(step: number) {
            if (this._guideMode !== 'level_1') return;
            if (this.isMainlineMainLevel()) return;
            const cueByStep: Partial<Record<number, SfxName>> = {
                0: 'guideLevel1Pick1',
                1: 'guideLevel1Place1',
                2: 'guideLevel1Pick2',
                3: 'guideLevel1Place2',
            };
            const cue = cueByStep[step];
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
