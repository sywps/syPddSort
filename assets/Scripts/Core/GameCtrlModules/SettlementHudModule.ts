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
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, FIRST_LEVEL_ROUTE_EXPERIMENT_ID, FIRST_LEVEL_ROUTE_WX_TIMEOUT_MS, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, BoardViewportController
} from '../GameCtrlShared';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode, FirstLevelRouteVariant, FirstLevelRouteResolution,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';

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
                this.levelLabel.string = `第${this.getActiveLogicalLevelId()}关`;
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
            const stats = this.getBoardCompletionStats();
            const rewardCfg = ECONOMY_NUMERIC_TABLE.reward;
            const boardReward = Math.max(rewardCfg.winGoldMin, Math.ceil(stats.total * rewardCfg.winGoldPerCell));
            const levelBonus = Math.min(
                rewardCfg.levelBonusMax,
                Math.floor(Math.max(0, this.getActiveLogicalLevelId() - 1) / rewardCfg.levelBonusEvery) * rewardCfg.levelBonusStep,
            );
            const themeBonus = this._isThemeLevel ? rewardCfg.themeWinGoldBonus : 0;
            const totalReward = boardReward + levelBonus + themeBonus;
            return Math.max(1, Math.ceil(totalReward / 2));
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
            const useMainlineWin = this.shouldUseMainlineWinSettlementUI();
            const coinIcon = adBtn.getChildByName('AdBonusCoinIcon');
            const adIcon = adBtn.getChildByName('AdBonusAdIcon');
        
            adBtn.active = eligible;
            if (!eligible) return;
        
            if (this._winAdRewardClaimed) {
                if (titleLbl) titleLbl.string = useMainlineWin ? '已领取' : `已加领 ${this._pendingWinAdBonusReward} 金币`;
                if (subLbl) subLbl.string = useMainlineWin ? '' : '本局 5 倍奖励已到账';
                if (coinIcon) coinIcon.active = !useMainlineWin;
                if (adIcon) adIcon.active = !useMainlineWin;
                if (btn) btn.interactable = false;
                opacity.opacity = 178;
                return;
            }
        
            if (btn) btn.interactable = true;
            opacity.opacity = 255;
        },

        claimWinAdBonusReward() {
            if (this._isThemeLevel || this._winAdRewardClaimed || this._pendingWinAdBonusReward <= 0 || this._adShowing || this._settlementNextTransitioning) {
                return;
            }
            this._adShowing = true;
            this.showTrackedRewardedAd('win_bonus_reward', (success: boolean) => {
                this._adShowing = false;
                if (!success) {
                    this.showToast('广告未完成，未获得加领奖励');
                    return;
                }
                this._winAdRewardClaimed = true;
                this.addGold(this._pendingWinAdBonusReward);
                this.refreshWinAdBonusUI();
                this.showToast(`已额外获得 ${this._pendingWinAdBonusReward} 金币`);
            });
        },

        updateLoseProgressLabel() {
            const stats = this.getBoardCompletionStats();
            this.syncSettlementProgressWidget(this.panelLose, stats);
            this.syncSettlementProgressWidget(this.panelTimeoutContinue, stats);
        },

        showLosePanel() {
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
            this.showToast('很好，接着学会暂存槽', 1.1);
            this.scheduleOnce(() => {
                this.loadLevel(nextId);
            }, 1.0);
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

        gameWin() {
            if (this.isGameEnd) return;
            this.isGameEnd = true;
            this.clearEndgameHints(false);
            this.unschedule(this.tickTimer);
            this.trackFirstLevelFunnel('level_pass', {
                source: 'gameWin',
                success: true,
            });
            AnalyticsMgr.inst.markLevelPassed(this.getAnalyticsPage());
            const logicalLevelId = this.getActiveLogicalLevelId();
            SySDKMgr.inst.reportLevelPass(logicalLevelId);
            if (this._isThemeLevel) {
                this.setThemeCompleted(this._currentThemeLevelId || this.levelData.levelId);
            } else {
                this.saveLevelProgress(logicalLevelId + 1);
            }
            this._pendingWinGoldReward = this.calcWinGoldReward();
            this._pendingWinAdBonusReward = this._isThemeLevel
                ? 0
                : this._pendingWinGoldReward * Math.max(0, ECONOMY_NUMERIC_TABLE.adReward.winBonusMultiplier - 1);
            this._winAdRewardClaimed = false;
            this._settlementNextTransitioning = false;
            this.addGold(this._pendingWinGoldReward);
            this.ensureGameplayResultPanelsCreated?.();
            this.updateWinRewardLabel(this._pendingWinGoldReward);
        
            const bm = this.boardModel;
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
        
            // Phase 1: 棋盘缩小并移到正中间
            if (this.boardGroup) {
                tween(this.boardGroup)
                    .to(0.3, { scale: new Vec3(0.85, 0.85, 1), position: new Vec3(this.boardHomePos.x, this.boardHomePos.y, 0) }, { easing: 'sineOut' })
                    .start();
            }
        
            // Phase 2: 按斜向波次并发扫光，既有方向感，又不会因豆豆过多而线性变慢
            const lockedCells: {row: number; col: number}[] = [];
            for (let r = 0; r < bh; r++)
                for (let c = 0; c < bw; c++)
                    if (bm.locked[r][c] && bm.correctColors[r][c] > 0)
                        lockedCells.push({row: r, col: c});
        
            const totalAnimTime = this.playWinBoardGlowSweep(lockedCells, bw, bh);
        
            // Phase 3: win sound + panel + pattern preview（归位动画结束后）
            this.scheduleOnce(() => {
                AudioMgr.inst.play('winAll');
                AudioMgr.inst.vibrate(50);
                if (this.boardGroup) {
                    tween(this.boardGroup)
                        .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
                        .start();
                }
                if (!this.ensureGameplayResultPanelsCreated?.()) {
                    this._ensureGameplayResultPanelPrefabsReady?.(() => {
                        if (!this.isValid || !this.isGameEnd) return;
                        this.ensureGameplayResultPanelsCreated?.();
                        this.updateWinRewardLabel(this._pendingWinGoldReward);
                        this.drawWinPatternPreview();
                        if (this.panelWin) { this.panelWin.active = true; this.panelWin.setSiblingIndex(999); }
                    });
                    return;
                }
                this.updateWinRewardLabel(this._pendingWinGoldReward);
                this.drawWinPatternPreview();
                if (this.panelWin) { this.panelWin.active = true; this.panelWin.setSiblingIndex(999); }
            }, totalAnimTime + 0.18);
        },

        drawWinPatternPreview() {
            if (!this.panelWin) return;
            const box = this.panelWin.getChildByName('Box');
            const previewNode = box?.getChildByName('PreviewFrame')?.getChildByName('PatternPreview')
                || box?.getChildByName('PatternPreview');
            if (!previewNode) return;
        
            previewNode.removeAllChildren();
            const bm = this.boardModel;
            const previewTransform = previewNode.getComponent(UITransform);
            const maxW = Math.max(120, (previewTransform?.width || 392) - 16);
            const maxH = Math.max(120, (previewTransform?.height || 228) - 16);
            this.drawBeanPreviewGrid(
                previewNode,
                bm.correctColors,
                bm.width,
                bm.height,
                0,
                0,
                maxW,
                maxH,
                {
                    drawTargetBackground: true,
                    beanScale: PINDD_BEAN_TO_SLOT_RATIO,
                    cropToContent: true,
                    maxCellSize: Math.max(maxW, maxH),
                    lockedBeans: true,
                    cellGap: 0,
                },
            );
        },

        gameLose() {
            if (this.isGameEnd) return;
            this.isGameEnd = true;
            this.unschedule(this.tickTimer);
            this.trackFirstLevelFunnel('level_fail', {
                source: 'gameLose',
                success: false,
            });
            AnalyticsMgr.inst.markLevelFailed(this.getAnalyticsPage());
            SySDKMgr.inst.reportLevelFail(this.getAnalyticsLevelId());
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
            if (!this.costVigor()) {
                this.showNoLivesAdModal(() => {
                    if (this.costVigor()) {
                        this.doRestart();
                    }
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
            this.initGame(this.levelData);
        },

        /** 看广告后继续游戏：恢复交互，但计时器需等重新选中豆豆后再开始 */
        continueAfterLose(addSeconds: number) {
            if (this.panelTimeoutContinue) this.panelTimeoutContinue.active = false;
            if (this.panelLose) this.panelLose.active = false;
            this.timeRemain += addSeconds;
            if (this.timerLabel) {
                this.timerLabel.string = this.formatTime(this.timeRemain);
                this.timerLabel.color = this.timeRemain <= 30 ? new Color('#D73D2B') : new Color('#5A4A3A');
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
            if (!this.costVigor()) {
                this.showNoLivesAdModal(() => {
                    if (this.costVigor()) {
                        this.loadLevel(nextId);
                    } else {
                        this.endSettlementNextTransition();
                    }
                });
                return;
            }
            this.loadLevel(nextId);
        },

        // Idle hint is intentionally disabled; keep these hooks for existing callers.
        stopIdleHintTimer() {
        },

        resetIdleHintTimer() {
        },

        clearIdleHint() {
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
        // Step 0: 点击解锁按钮扩展第二排暂存槽
        // Step 1: 选中超过一排暂存槽容量的豆豆块（select 阶段，目标=暂存槽）
        // Step 2: 点击暂存槽放入（place 阶段）

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
                const overflowA = a.size > SLOTS_PER_ROW ? 1 : 0;
                const overflowB = b.size > SLOTS_PER_ROW ? 1 : 0;
                return overflowB - overflowA || b.size - a.size || a.order - b.order;
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
            if (!this.getSF('guide_hand')) {
                this._ensureSpriteFramesByName(['guide_hand'], () => this.startTutorial(mode));
                return;
            }
            this._guideMode = mode;
            this._guideStep = 0;
            this._guideTotalSteps = mode === 'level_1' ? 6 : (mode === 'level_2' ? 3 : 0);
            this._guideInputSuspended = false;
            this._guidePhase = typeof this.getTutorialPhaseForStep === 'function'
                ? this.getTutorialPhaseForStep(0)
                : 'select';
            this._lastGuideVoiceToken = '';
            this.unschedule(this.tickTimer);
            if (typeof this.clearExpandSlotGuide === 'function') {
                this.clearExpandSlotGuide();
            }
        
            // 从当前棋盘动态确定两种可操作颜色（跳过已锁定格）
            const tutorialColors = mode === 'level_2'
                ? this.collectLevel2TutorialColorIds(2)
                : this.collectTutorialColorIds(2);
            this._guideFirstColorId = tutorialColors[0] || 0;
            this._guideSecondColorId = tutorialColors[1] || this._guideFirstColorId;
            if (this._guideFirstColorId === 0) {
                this._guideMode = 'none';
                this._guideTotalSteps = 0;
                this._guideStep = -1;
                this.scheduleOnce(() => this.gameWin(), 0.1);
                return;
            }
        
            // 重置到初始适配视图，确保引导视觉准确且不丢失小棋盘放大比例
            const homeScale = Math.max(
                this.constructor.MIN_SCALE,
                Math.min(
                    this.constructor.MAX_SCALE,
                    Number(this.boardHomeScale) || Number(this.boardViewScale) || Math.abs(this.boardGroup.scale.x || 1) || 1,
                ),
            );
            this.boardGroup.setPosition(this.boardHomePos);
            this.boardGroup.setScale(homeScale, homeScale, 1);
            this.boardViewScale = homeScale;
            this.boardViewport.setScaleSnapshot(homeScale);
        
            const root = typeof this.requireCanvasUiRoot === 'function'
                ? this.requireCanvasUiRoot('OverlayRoot')
                : this.node;
            if (root.parent) {
                root.setSiblingIndex(root.parent.children.length - 1);
            }
            this._guideLayer = new Node('GuideLayer');
            root.addChild(this._guideLayer);
            this._guideLayer.addComponent(UITransform).setContentSize(720, 1280);
            this._guideLayer.layer = Layers.Enum.UI_2D;
            this._guideLayer.setSiblingIndex(Math.max(0, root.children.length - 1));
            this._guideLayer.addComponent(BlockInputEvents);
            this._guideLayer.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
                if (this._guideInputSuspended) return;
                event.propagationStopped = true;
            }, this);
            this._guideLayer.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                if (this._guideInputSuspended) return;
                if (this.isGameEnd || this._guideStep < 0) return;
                const uiPos = event.getUILocation();
                this.handleGuideTap(new Vec3(uiPos.x, uiPos.y, 0));
                event.propagationStopped = true;
            }, this);
        
            this._guideMask = new Node('GuideMask');
            this._guideLayer.addChild(this._guideMask);
            this._guideMask.addComponent(UITransform).setContentSize(720, 1280);
            this._guideMask.layer = Layers.Enum.UI_2D;
        
            const guidePrompt = root.getChildByName('TutorialGuidePrompt');
            if (!guidePrompt) {
                throw new Error('[guide] Game.scene is missing OverlayRoot/TutorialGuidePrompt');
            }
            const lbl = guidePrompt.getChildByName('PromptLabel')?.getComponent(Label);
            if (!lbl) {
                throw new Error('[guide] Game.scene is missing OverlayRoot/TutorialGuidePrompt/PromptLabel Label');
            }
            guidePrompt.active = true;
            this._guideBubble = guidePrompt;
            this._guideBubbleLbl = lbl;
        
            this._guideHand = new Node('GuideHand');
            this._guideLayer.addChild(this._guideHand);
            this._guideHand.addComponent(UITransform).setContentSize(GUIDE_HAND_BOX_SIZE, GUIDE_HAND_BOX_SIZE);
            this._guideHand.layer = Layers.Enum.UI_2D;
            const guideHandFrame = this.getSF('guide_hand');
            if (!guideHandFrame) throw new Error('[guide] missing sprite frame: guide_hand');
            this._applySpriteFrame(this._guideHand, guideHandFrame, GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_SPRITE_SIZE);

            this._guideArrow = new Node('GuideArrow');
            this._guideLayer.addChild(this._guideArrow);
            this._guideArrow.addComponent(UITransform).setContentSize(40, 60);
            this._guideArrow.layer = Layers.Enum.UI_2D;
        
            this.showGuideStep(0);
            if ((Number(this._modalFocusRefs) || 0) > 0) {
                this.suspendGuideForModal('active-modal');
            }
        },

        showGuideStep(step: number) {
            this._guideStep = step;
            if (this._guideInputSuspended) {
                this.clearGuideRuntimeVisuals?.();
                if (this._guideLayer?.isValid) {
                    this._guideLayer.active = false;
                }
                return;
            }
            if (!this._guideLayer) return;
            this._guideLayer.active = true;
            this.trackFirstLevelFunnel('tutorial_step_show', {
                stepId: step,
                stepName: `${this._guideMode}:${step}:${this._guidePhase}`,
                source: 'tutorial',
            });
        
            Tween.stopAllByTarget(this._guideHand!);
            Tween.stopAllByTarget(this._guideArrow!);
            this._guideHand!.setScale(1, 1, 1);
            this._guideHand!.active = false;
            this._guideArrow!.active = false;
            this.clearGuideHighlight();
        
            // 清理临时节点
            const toRemove: Node[] = [];
            for (const child of this._guideLayer!.children) {
                if (child.name === 'TapHint' || child.name === 'StepNum' || child.name === 'ProgressBar' || child.name === 'GuideHighlight') toRemove.push(child);
            }
            for (const n of toRemove) { Tween.stopAllByTarget(n); n.destroy(); }
        
            const mask = this._guideMask!;
            const hand = this._guideHand!;
            const arrow = this._guideArrow!;
            const bubble = this._guideBubble!;
            const lbl = this._guideBubbleLbl!;
        
            let gm = mask.getComponent(Graphics); if (!gm) gm = mask.addComponent(Graphics); gm.clear();
            const gb = bubble.getComponent(Graphics); if (gb) gb.clear();
            let gh = hand.getComponent(Graphics); if (!gh) gh = hand.addComponent(Graphics); gh.clear();
            let ga = arrow.getComponent(Graphics); if (!ga) ga = arrow.addComponent(Graphics); ga.clear();
        
            const minimalGuide = this.isMinimalTutorialGuide();
            if (!minimalGuide) {
                this._drawProgressDots(step);
            }
        
            switch (this._guideMode) {
                case 'level_1':
                    switch (step) {
                        case 0: this.guideStep0(gm, gb as Graphics, gh, lbl, bubble, hand, arrow); break;
                        case 1: this.guideStep1(gm, gb as Graphics, gh, lbl, bubble, hand, arrow); break;
                        case 2: this.guideStep2(gm, gb as Graphics, gh, lbl, bubble, hand, arrow); break;
                        case 3: this.guideStep3(gm, gb as Graphics, gh, lbl, bubble, hand, arrow); break;
                        case 4: this.guideStep4(gm, gb as Graphics, gh, lbl, bubble, hand, arrow); break;
                        case 5: this.guideStep5(gm, gb as Graphics, gh, lbl, bubble, hand, arrow); break;
                        default: this.endTutorial(); break;
                    }
                    break;
                case 'level_2':
                    switch (step) {
                        case 0: this.guideLevel2UnlockStep(gm, gb as Graphics, gh, lbl, bubble, hand, arrow); break;
                        case 1: this.guideLevel2PickBlockStep(gm, gb as Graphics, gh, lbl, bubble, hand, arrow); break;
                        case 2: this.guideLevel2PlaceBlockStep(gm, gb as Graphics, gh, lbl, bubble, hand, arrow); break;
                        default: this.endTutorial(); break;
                    }
                    break;
                default:
                    this.endTutorial();
                    break;
            }
        
            if (!minimalGuide) {
                const tapHint = new Node('TapHint');
                this._guideLayer!.addChild(tapHint);
                tapHint.addComponent(UITransform).setContentSize(300, 30);
                tapHint.layer = Layers.Enum.UI_2D;
                tapHint.setPosition(0, -560);
                const tapLbl = tapHint.addComponent(Label);
                tapLbl.string = '点击豆豆选中，再点击目标位置';
                tapLbl.fontSize = 18;
                tapLbl.color = new Color(255, 255, 255, 180);
                tapLbl.horizontalAlign = Label.HorizontalAlign.CENTER;
                tween(tapHint)
                    .repeatForever(tween(tapHint).to(0.8, { scale: new Vec3(1, 1, 1) }).to(0.8, { scale: new Vec3(0.92, 0.92, 1) }))
                    .start();
            }
        
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
            return this._guideMode === 'level_1' || this._guideMode === 'level_2';
        },

        formatLevel1GuidePrompt(primaryText: string): string {
            const step = Math.max(0, Number(this._guideStep) || 0);
            const restoredCount = Math.max(1, Math.min(2, Math.floor(step / 2) + 1));
            return `${primaryText}\n还原进度 ${restoredCount}/2`;
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
            let centerY = defaultCenterY;
            const topBarBottom = this.getGuideTopBarAvoidBottomY();
            const boardTop = this.getGuideBoardAvoidTopY();
            if (topBarBottom !== null && boardTop !== null && topBarBottom > boardTop) {
                const topLimit = topBarBottom - promptHeight / 2 - topGap;
                const bottomLimit = boardTop + promptHeight / 2 + boardGap;
                if (topLimit >= bottomLimit) {
                    return Math.max(bottomLimit, Math.min(centerY, topLimit));
                }
                return (topBarBottom + boardTop) / 2;
            }
            if (topBarBottom !== null) {
                centerY = Math.min(centerY, topBarBottom - promptHeight / 2 - topGap);
            }
            if (boardTop !== null) {
                centerY = Math.max(centerY, boardTop + promptHeight / 2 + boardGap);
            }
            return centerY;
        },

        getSceneGuidePromptBounds(): { centerY: number; height: number } | null {
            try {
                const root = typeof this.requireCanvasUiRoot === 'function'
                    ? this.requireCanvasUiRoot('OverlayRoot')
                    : null;
                const prompt = root?.getChildByName('TutorialGuidePrompt') ?? null;
                const transform = prompt?.getComponent(UITransform) ?? null;
                if (!prompt || !transform) return null;
                return { centerY: prompt.position.y, height: transform.contentSize.height };
            } catch {
                return null;
            }
        },

        styleLevel1GuidePrompt(_gb: Graphics | null, bubble: Node, lbl: Label, primaryText: string) {
            bubble.active = true;
            lbl.string = this.formatLevel1GuidePrompt(primaryText);
        },

        formatLevel2GuidePrompt(primaryText: string): string {
            const step = Math.max(0, Number(this._guideStep) || 0);
            const progressStep = this._guideMode === 'level_1'
                ? Math.floor(step / 2) + 1
                : step + 1;
            const completedCount = Math.max(1, Math.min(3, progressStep));
            return `${primaryText}\n完成进度 ${completedCount}/3`;
        },
    });
}
