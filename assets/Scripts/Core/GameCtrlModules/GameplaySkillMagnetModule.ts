import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
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
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, createSingleColorSpriteFrame, BoardViewportController
} from '../GameCtrlShared';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';

export function installGameplaySkillMagnetModule(target: any): void {
    Object.assign(target, {
        /** 磁铁：随机选择一种未归位颜色，将该颜色所有豆豆快速全部归位。 */
        useSkillClearColor(timerAlreadyPaused: boolean = false, viewportAlreadyReset: boolean = false) {
            const pchController = this._pchConveyorGameplayController;
            if (pchController?.isActive?.()) {
                return pchController.useClearColorSkill(timerAlreadyPaused) === true;
            }
            if (this._skillActive && !viewportAlreadyReset) return;
            let skillGeneration = Math.max(0, Number(this._activeSkillUsageGeneration) || 0);
            if (!viewportAlreadyReset) {
                this._skillActive = true;
                skillGeneration = this.armSkillUsageWatchdog?.('magnet') || skillGeneration;
            } else if (!this._skillUsageWatchdog) {
                skillGeneration = this.armSkillUsageWatchdog?.('magnet') || skillGeneration;
            }
            if (!timerAlreadyPaused) this.pauseTimerForFinalSecondProp();
            PerformanceMgr.inst.markUserActivity(8000);
            if (!viewportAlreadyReset && typeof this.resetBoardViewportToHomeForSkill === 'function') {
                this.resetBoardViewportToHomeForSkill(() => this.useSkillClearColor(true, true));
                return;
            }
            if (this.normalizeSlotBlocksForProps()) this.renderSlots();
            this.prepareSkillMoveAnimation();
            const groups = this.collectUnmatchedTargetsByColor();
            if (groups.length === 0) {
                this.showToast('关卡已完成');
                this.finishSkillUsage(skillGeneration);
                return;
            }
            const pickGroup = groups[Math.floor(Math.random() * groups.length)];
            const boardSources = this.collectCurrentBoardSkillSources(pickGroup.colorId, pickGroup.targets.length);
            const slotSources = this.collectCurrentSlotSkillSources(pickGroup.colorId);
            const plan = this.buildForcedSkillPlan(
                pickGroup.colorId,
                boardSources,
                slotSources,
                pickGroup.targets,
            );
            this.resetIdleHintTimer();
            this.runForcedSkillPlansSequential([plan], 0, undefined, skillGeneration);
        },

        buildSkillSourceGroups(
            boardSources: { row: number; col: number; colorId: number }[],
            slotSources: { slotIdx: number; colorId: number }[],
        ): SkillSourceGroup[] {
            const groups = new Map<number, { boardSources: { row: number; col: number }[]; slotSources: number[] }>();
            for (const source of boardSources) {
                if (!groups.has(source.colorId)) groups.set(source.colorId, { boardSources: [], slotSources: [] });
                groups.get(source.colorId)!.boardSources.push({ row: source.row, col: source.col });
            }
            for (const source of slotSources) {
                if (!groups.has(source.colorId)) groups.set(source.colorId, { boardSources: [], slotSources: [] });
                groups.get(source.colorId)!.slotSources.push(source.slotIdx);
            }
            return Array.from(groups.entries()).map(([colorId, group]) => ({
                colorId,
                boardSources: group.boardSources,
                slotSources: group.slotSources,
            }));
        },

        collectCurrentBoardSkillSources(
            colorId: number,
            limit: number,
        ): { row: number; col: number }[] {
            const sources: { row: number; col: number }[] = [];
            if (limit <= 0) return sources;
            for (let r = 0; r < this.boardModel.height; r++) {
                for (let c = 0; c < this.boardModel.width; c++) {
                    if (
                        this.boardModel.currentColors[r][c] === colorId
                        && !this.boardModel.locked[r][c]
                        && this.boardModel.currentColors[r][c] !== this.boardModel.correctColors[r][c]
                    ) {
                        sources.push({ row: r, col: c });
                        if (sources.length >= limit) return sources;
                    }
                }
            }
            return sources;
        },

        buildForcedSkillBatch(
            colorId: number,
            boardSourcesInput: { row: number; col: number }[],
            slotSourcesInput: number[],
        ): ForcedSkillBatch {
            const boardMoves: ForcedSkillBoardMove[] = [];
            const slotMoves: ForcedSkillSlotMove[] = [];
            const lockTargets: { row: number; col: number }[] = [];
            const boardSources = boardSourcesInput.map((source) => ({ row: source.row, col: source.col }));
            const slotSources = [...slotSourcesInput];
        
            const removeBoardSourceAt = (row: number, col: number) => {
                const idx = boardSources.findIndex((source) => source.row === row && source.col === col);
                if (idx >= 0) boardSources.splice(idx, 1);
            };
        
            const takeNextValidBoardSource = (): { row: number; col: number } | null => {
                while (boardSources.length > 0) {
                    const source = boardSources.shift()!;
                    if (
                        this.boardModel.currentColors[source.row][source.col] === colorId
                        && !this.boardModel.locked[source.row][source.col]
                        && this.boardModel.currentColors[source.row][source.col] !== this.boardModel.correctColors[source.row][source.col]
                    ) {
                        return source;
                    }
                }
                return null;
            };
        
            for (let r = 0; r < this.boardModel.height; r++) {
                for (let c = 0; c < this.boardModel.width; c++) {
                    if (this.boardModel.correctColors[r][c] !== colorId) continue;
                    if (this.boardModel.locked[r][c]) continue;
                    if (this.boardModel.currentColors[r][c] !== colorId) continue;
                    this.boardModel.setLocked(r, c, true);
                    lockTargets.push({ row: r, col: c });
                    removeBoardSourceAt(r, c);
                }
            }
        
            const targets: { row: number; col: number }[] = [];
            for (let r = 0; r < this.boardModel.height; r++) {
                for (let c = 0; c < this.boardModel.width; c++) {
                    if (this.boardModel.correctColors[r][c] !== colorId) continue;
                    if (this.boardModel.locked[r][c]) continue;
                    targets.push({ row: r, col: c });
                }
            }
        
            for (const target of targets) {
                if (boardSources.length === 0 && slotSources.length === 0) break;
        
                const occupiedColor = this.boardModel.currentColors[target.row][target.col];
                const useSlotSource = occupiedColor === 0
                    ? slotSources.length > 0
                    : boardSources.length === 0 && slotSources.length > 0;
        
                if (useSlotSource) {
                    const slotIdx = slotSources.shift()!;
                    const sourceWorld = this.slotNodes[slotIdx].getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                    const sourceBlock = this.slotModel.take(slotIdx);
                    if (!sourceBlock) continue;
        
                    if (occupiedColor !== 0) {
                        const occupiedWorld = this.cellNodes[target.row][target.col].getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                        const swapped = this.slotModel.putAt(slotIdx, {
                            colorId: occupiedColor,
                            cells: [{ row: target.row, col: target.col }],
                            isLocked: false,
                            source: 'slot',
                            slotIndex: slotIdx,
                        });
                        if (!swapped) {
                            this.slotModel.putAt(slotIdx, sourceBlock);
                            continue;
                        }
                        slotMoves.push({ colorId: occupiedColor, srcWorld: occupiedWorld, slotIdx });
                    }
        
                    this.boardModel.currentColors[target.row][target.col] = colorId;
                    this.boardModel.setLocked(target.row, target.col, true);
                    boardMoves.push({ colorId, srcWorld: sourceWorld, target, lock: true });
                    lockTargets.push(target);
                    continue;
                }
        
                const source = takeNextValidBoardSource();
                if (!source) continue;
                const sourceWorld = this.cellNodes[source.row][source.col].getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                this.boardModel.currentColors[source.row][source.col] = 0;
                this.boardModel.setLocked(source.row, source.col, false);
        
                if (occupiedColor !== 0) {
                    const occupiedWorld = this.cellNodes[target.row][target.col].getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                    this.boardModel.currentColors[source.row][source.col] = occupiedColor;
                    const swappedLocks = this.boardModel.correctColors[source.row][source.col] === occupiedColor;
                    this.boardModel.setLocked(source.row, source.col, swappedLocks);
                    boardMoves.push({
                        colorId: occupiedColor,
                        srcWorld: occupiedWorld,
                        target: { row: source.row, col: source.col },
                        lock: swappedLocks,
                    });
                    if (swappedLocks) lockTargets.push({ row: source.row, col: source.col });
                }
        
                this.boardModel.currentColors[target.row][target.col] = colorId;
                this.boardModel.setLocked(target.row, target.col, true);
                boardMoves.push({ colorId, srcWorld: sourceWorld, target, lock: true });
                lockTargets.push(target);
            }
        
            return { boardMoves, slotMoves, lockTargets };
        },

        getSkillUsableSlotCount(slotLength: number): number {
            const rawTotalCount = Math.floor(Number(this.slotModel?.totalCount) || slotLength);
            const totalCount = Math.max(0, Math.min(rawTotalCount, slotLength));
            const rawUnlockedCount = Math.floor(Number(this.slotModel?.unlockedCount ?? totalCount) || totalCount);
            return Math.max(0, Math.min(rawUnlockedCount, totalCount));
        },

        insertSlotColorByStoreRuleForPlan(colors: number[], colorId: number, pendingSlotSources: number[]): number {
            const usableCount = this.getSkillUsableSlotCount(colors.length);
            const pendingSet = new Set(pendingSlotSources);
            const entries: Array<{ colorId: number; oldIndex: number; pending: boolean }> = [];
            let firstEmptyEntryIndex = -1;
            for (let i = 0; i < usableCount; i++) {
                const entryColor = colors[i];
                if (entryColor !== 0) {
                    entries.push({ colorId: entryColor, oldIndex: i, pending: pendingSet.has(i) });
                } else if (firstEmptyEntryIndex < 0) {
                    firstEmptyEntryIndex = entries.length;
                }
            }
            if (entries.length >= usableCount) return -1;

            let insertAt = firstEmptyEntryIndex >= 0 ? firstEmptyEntryIndex : entries.length;
            for (let i = 0; i < entries.length; i++) {
                if (entries[i].colorId === colorId) insertAt = i + 1;
            }
            entries.splice(insertAt, 0, { colorId, oldIndex: -1, pending: false });

            for (let i = 0; i < usableCount; i++) {
                colors[i] = entries[i]?.colorId ?? 0;
            }
            for (let i = usableCount; i < colors.length; i++) {
                colors[i] = 0;
            }

            const nextIndexByOldIndex = new Map<number, number>();
            for (let i = 0; i < entries.length; i++) {
                if (entries[i].pending) nextIndexByOldIndex.set(entries[i].oldIndex, i);
            }
            for (let i = pendingSlotSources.length - 1; i >= 0; i--) {
                const nextIndex = nextIndexByOldIndex.get(pendingSlotSources[i]);
                if (typeof nextIndex === 'number') {
                    pendingSlotSources[i] = nextIndex;
                } else {
                    pendingSlotSources.splice(i, 1);
                }
            }

            return insertAt;
        },

        insertSlotBlockByStoreRule(block: BeanBlockInfo, plannedSlotIdx: number): boolean {
            const slots = this.slotModel.getAll();
            const usableCount = this.getSkillUsableSlotCount(slots.length);
            const entries: BeanBlockInfo[] = [];
            let firstEmptyEntryIndex = -1;
            for (let i = 0; i < usableCount; i++) {
                const slotBlock = slots[i];
                if (slotBlock) {
                    entries.push(slotBlock);
                } else if (firstEmptyEntryIndex < 0) {
                    firstEmptyEntryIndex = entries.length;
                }
            }
            if (entries.length >= usableCount) return false;

            let insertAt = firstEmptyEntryIndex >= 0 ? firstEmptyEntryIndex : entries.length;
            for (let i = 0; i < entries.length; i++) {
                if (entries[i].colorId === block.colorId) insertAt = i + 1;
            }
            if (insertAt !== plannedSlotIdx) {
                throw new Error(`[GameplaySkill] displaced slot target mismatch: planned ${plannedSlotIdx}, actual ${insertAt}`);
            }

            block.source = 'slot';
            block.slotIndex = insertAt;
            entries.splice(insertAt, 0, block);

            for (let i = 0; i < usableCount; i++) {
                const slotBlock = entries[i] || null;
                slots[i] = slotBlock;
                if (slotBlock) {
                    slotBlock.source = 'slot';
                    slotBlock.slotIndex = i;
                }
            }
            for (let i = usableCount; i < slots.length; i++) {
                slots[i] = null;
            }

            return true;
        },

        buildForcedSkillPlan(
            colorId: number,
            boardSourcesInput: { row: number; col: number }[],
            slotSourcesInput: number[],
            areaTargetsOverride?: { row: number; col: number }[],
        ): ForcedSkillPlan {
            const immediateLockTargets: { row: number; col: number }[] = [];
            const steps: ForcedSkillStep[] = [];
            const currentColors = this.boardModel.currentColors.map((row) => [...row]);
            const locked = this.boardModel.locked.map((row) => [...row]);
            const slotColors = this.slotModel.getAll().map((block) => block?.colorId ?? 0);
            const boardSources = boardSourcesInput.map((source) => ({ row: source.row, col: source.col }));
            const slotSources = [...slotSourcesInput];
        
            const removeBoardSourceAt = (row: number, col: number) => {
                const idx = boardSources.findIndex((source) => source.row === row && source.col === col);
                if (idx >= 0) boardSources.splice(idx, 1);
            };
        
            const candidateCells: { row: number; col: number }[] = areaTargetsOverride || [];
            if (!areaTargetsOverride) {
                for (let r = 0; r < this.boardModel.height; r++) {
                    for (let c = 0; c < this.boardModel.width; c++) {
                        candidateCells.push({ row: r, col: c });
                    }
                }
            }
            for (const { row: r, col: c } of candidateCells) {
                if (this.boardModel.correctColors[r][c] !== colorId) continue;
                if (locked[r][c]) continue;
                if (currentColors[r][c] !== colorId) continue;
                locked[r][c] = true;
                immediateLockTargets.push({ row: r, col: c });
                removeBoardSourceAt(r, c);
            }
        
            const targets: { row: number; col: number }[] = [];
            for (const { row: r, col: c } of candidateCells) {
                if (this.boardModel.correctColors[r][c] !== colorId) continue;
                if (locked[r][c]) continue;
                targets.push({ row: r, col: c });
            }
        
            for (const target of targets) {
                if (boardSources.length === 0 && slotSources.length === 0) break;
        
                const occupiedColor = currentColors[target.row][target.col];
                const useSlotSource = boardSources.length === 0 && slotSources.length > 0;
        
                if (useSlotSource) {
                    const slotIdx = slotSources.shift()!;
                    if (slotColors[slotIdx] !== colorId) continue;
                    slotColors[slotIdx] = 0;
        
                    const step: ForcedSkillStep = {
                        colorId,
                        sourceSlotIdx: slotIdx,
                        target,
                        lockTargets: [target],
                        hiddenBoardCells: [target],
                        hiddenSlotIdxs: [],
                    };
        
                    if (occupiedColor !== 0) {
                        const displSlotIdx = this.insertSlotColorByStoreRuleForPlan(slotColors, occupiedColor, slotSources);
                        if (displSlotIdx < 0) {
                            slotColors[slotIdx] = colorId;
                            continue;
                        }
                        step.displacedSlot = { colorId: occupiedColor, slotIdx: displSlotIdx };
                        step.displacedSlotInsertMode = 'grouped';
                        step.hiddenSlotIdxs.push(displSlotIdx);
                    }
        
                    currentColors[target.row][target.col] = colorId;
                    locked[target.row][target.col] = true;
                    steps.push(step);
                    continue;
                }
        
                if (boardSources.length === 0) continue;
                const source = boardSources.shift()!;
                currentColors[source.row][source.col] = 0;
                locked[source.row][source.col] = false;
        
                const step: ForcedSkillStep = {
                    colorId,
                    sourceBoard: source,
                    target,
                    lockTargets: [target],
                    hiddenBoardCells: [target],
                    hiddenSlotIdxs: [],
                };
        
                if (occupiedColor !== 0) {
                    currentColors[source.row][source.col] = occupiedColor;
                    const swappedLocks = this.boardModel.correctColors[source.row][source.col] === occupiedColor;
                    locked[source.row][source.col] = swappedLocks;
                    step.displacedBoard = {
                        colorId: occupiedColor,
                        target: { row: source.row, col: source.col },
                        lock: swappedLocks,
                    };
                    step.hiddenBoardCells.push({ row: source.row, col: source.col });
                    if (swappedLocks) step.lockTargets.push({ row: source.row, col: source.col });
                }
        
                currentColors[target.row][target.col] = colorId;
                locked[target.row][target.col] = true;
                steps.push(step);
            }
        
            return { immediateLockTargets, steps };
        },

        clearForcedSkillHiddenState() {
            this._hiddenBoardCells.clear();
            this._hiddenSlotIndices.clear();
        },

        setForcedSkillHiddenState(boardCells: { row: number; col: number }[], slotIdxs: number[]) {
            this.clearForcedSkillHiddenState();
            for (const cell of boardCells) this._hiddenBoardCells.add(`${cell.row},${cell.col}`);
            for (const idx of slotIdxs) this._hiddenSlotIndices.add(idx);
        },

        prepareSkillMoveAnimation() {
            this.clearDragNodes();
            this.stopPulseTweens();
            this.clearSelectionOverlay();
            this.resetCellPositions();
            this.resetSlotPositions();
            this.isSelected = false;
            this.currentBlock = null;
            this._selectedSlotIndices = [];
            this._flyingTargets.clear();
            this.clearForcedSkillHiddenState();
        },

        playForcedSkillPlanNearParallel(
            plan: ForcedSkillPlan,
            onDone: () => void,
        ) {
            this.prepareSkillMoveAnimation();
            for (const target of plan.immediateLockTargets) {
                this.boardModel.setLocked(target.row, target.col, true);
            }
            if (plan.steps.length === 0) {
                if (plan.immediateLockTargets.length > 0) {
                    this.onFlyDone(plan.immediateLockTargets, onDone);
                } else {
                    onDone();
                }
                return;
            }

            const SKILL_FLY_DUR = 0.2;
            const SKILL_MOVE_STAGGER = 0.028;
            const SKILL_OVERLAP = 0.014;
            const SKILL_DONE_DELAY = 0.02;
            const nodeWorldPos = (node: Node): Vec3 => node.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            type MoveVisualHide = {
                hideBoardCells?: { row: number; col: number }[];
                hideSlotIdxs?: number[];
            };
            type TimedBoardMove = ForcedSkillBoardMove & { delay: number; feedbackIndex: number } & MoveVisualHide;
            type TimedSlotMove = ForcedSkillSlotMove & { delay: number; feedbackIndex: number } & MoveVisualHide;
            const boardMoves: TimedBoardMove[] = [];
            const slotMoves: TimedSlotMove[] = [];
            const lockTargets: { row: number; col: number }[] = [];
            const seenLockTargets = new Set<string>();
            let moveIndex = 0;

            const nextDelay = (extraDelay: number = 0): { delay: number; feedbackIndex: number } => {
                const feedbackIndex = moveIndex;
                const delay = moveIndex * SKILL_MOVE_STAGGER + extraDelay;
                moveIndex++;
                return { delay, feedbackIndex };
            };
            const pushLockTarget = (target: { row: number; col: number }) => {
                const key = `${target.row},${target.col}`;
                if (seenLockTargets.has(key)) return;
                seenLockTargets.add(key);
                lockTargets.push({ row: target.row, col: target.col });
            };

            for (const step of plan.steps) {
                if (!step.sourceBoard) continue;
                this.boardModel.currentColors[step.sourceBoard.row][step.sourceBoard.col] = 0;
                this.boardModel.setLocked(step.sourceBoard.row, step.sourceBoard.col, false);
            }

            for (const step of plan.steps) {
                const targetNode = this.cellNodes[step.target.row]?.[step.target.col];
                const sourceNode = step.sourceBoard
                    ? this.cellNodes[step.sourceBoard.row]?.[step.sourceBoard.col]
                    : this.slotNodes[step.sourceSlotIdx!];
                if (!targetNode || !sourceNode) continue;

                const targetWorld = nodeWorldPos(targetNode);
                const primarySrcWorld = nodeWorldPos(sourceNode);
                const targetLock = step.targetLock ?? true;
                for (const target of step.lockTargets) pushLockTarget(target);

                if (step.sourceBoard) {
                    const pairedTiming = step.pairedFlight && step.displacedBoard ? nextDelay() : null;
                    if (step.displacedBoard) {
                        boardMoves.push({
                            colorId: step.displacedBoard.colorId,
                            srcWorld: targetWorld,
                            target: step.displacedBoard.target,
                            lock: step.displacedBoard.lock,
                            hideBoardCells: [{ row: step.target.row, col: step.target.col }],
                            ...(pairedTiming ?? nextDelay()),
                        });
                        this.boardModel.currentColors[step.displacedBoard.target.row][step.displacedBoard.target.col] = step.displacedBoard.colorId;
                        this.boardModel.setLocked(step.displacedBoard.target.row, step.displacedBoard.target.col, step.displacedBoard.lock);
                    }
                    boardMoves.push({
                        colorId: step.colorId,
                        srcWorld: primarySrcWorld,
                        target: step.target,
                        lock: targetLock,
                        hideBoardCells: [{ row: step.sourceBoard.row, col: step.sourceBoard.col }],
                        ...(pairedTiming ?? nextDelay(step.displacedBoard ? SKILL_OVERLAP : 0)),
                    });
                    this.boardModel.currentColors[step.target.row][step.target.col] = step.colorId;
                    this.boardModel.setLocked(step.target.row, step.target.col, targetLock);
                    continue;
                }

                const sourceSlotIdx = step.sourceSlotIdx!;
                const sourceBlock = this.slotModel.take(sourceSlotIdx);
                if (!sourceBlock || sourceBlock.colorId !== step.colorId) continue;
                const pairedTiming = step.pairedFlight && (step.displacedBoard || step.displacedSlot) ? nextDelay() : null;

                boardMoves.push({
                    colorId: step.colorId,
                    srcWorld: primarySrcWorld,
                    target: step.target,
                    lock: targetLock,
                    hideSlotIdxs: [sourceSlotIdx],
                    ...(pairedTiming ?? nextDelay()),
                });
                if (step.displacedBoard) {
                    boardMoves.push({
                        colorId: step.displacedBoard.colorId,
                        srcWorld: targetWorld,
                        target: step.displacedBoard.target,
                        lock: step.displacedBoard.lock,
                        hideBoardCells: [{ row: step.target.row, col: step.target.col }],
                        ...(pairedTiming ?? nextDelay(SKILL_OVERLAP)),
                    });
                    this.boardModel.currentColors[step.displacedBoard.target.row][step.displacedBoard.target.col] = step.displacedBoard.colorId;
                    this.boardModel.setLocked(step.displacedBoard.target.row, step.displacedBoard.target.col, step.displacedBoard.lock);
                } else if (step.displacedSlot) {
                    const displacedBlock: BeanBlockInfo = {
                        colorId: step.displacedSlot.colorId,
                        cells: [{ row: step.target.row, col: step.target.col }],
                        isLocked: false,
                        source: 'slot',
                        slotIndex: step.displacedSlot.slotIdx,
                    };
                    const swapped = step.displacedSlotInsertMode === 'grouped'
                        ? this.insertSlotBlockByStoreRule(displacedBlock, step.displacedSlot.slotIdx)
                        : this.slotModel.putAt(step.displacedSlot.slotIdx, displacedBlock);
                    if (!swapped) {
                        this.slotModel.putAt(sourceSlotIdx, sourceBlock);
                        continue;
                    }
                    slotMoves.push({
                        colorId: step.displacedSlot.colorId,
                        srcWorld: targetWorld,
                        slotIdx: step.displacedSlot.slotIdx,
                        hideBoardCells: [{ row: step.target.row, col: step.target.col }],
                        hideSlotIdxs: [step.displacedSlot.slotIdx],
                        ...(pairedTiming ?? nextDelay(SKILL_OVERLAP)),
                    });
                }
                this.boardModel.currentColors[step.target.row][step.target.col] = step.colorId;
                this.boardModel.setLocked(step.target.row, step.target.col, targetLock);
            }

            if (plan.immediateLockTargets.length > 0) this.renderBoardCells(plan.immediateLockTargets);
            this._skillAnimOnly = true;

            const totalMoves = boardMoves.length + slotMoves.length;
            if (totalMoves === 0) {
                if (lockTargets.length > 0) this.onFlyDone(lockTargets, onDone);
                else onDone();
                return;
            }
            const allMoves = [...boardMoves, ...slotMoves];
            if (plan.maxStartDelay !== undefined && plan.maxStartDelay >= 0 && allMoves.length > 1) {
                let maxDelay = 0;
                for (const move of allMoves) {
                    if (move.delay > maxDelay) maxDelay = move.delay;
                }
                if (maxDelay > plan.maxStartDelay) {
                    const delayScale = plan.maxStartDelay / maxDelay;
                    for (const move of allMoves) move.delay *= delayScale;
                }
            }

            const getFinishTargets = (): { row: number; col: number }[] => {
                const targets = lockTargets.map((target) => ({ row: target.row, col: target.col }));
                const seen = new Set<string>();
                for (const target of targets) seen.add(`${target.row},${target.col}`);
                for (const move of boardMoves) {
                    const key = `${move.target.row},${move.target.col}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    targets.push({ row: move.target.row, col: move.target.col });
                }
                return targets;
            };

            let remaining = totalMoves;
            const finish = () => {
                remaining--;
                if (remaining <= 0) {
                    const finishTargets = getFinishTargets();
                    const lockTargetKeys = new Set(lockTargets.map((target) => `${target.row},${target.col}`));
                    const extraRenderTargets = finishTargets.filter((target) => !lockTargetKeys.has(`${target.row},${target.col}`));
                    const finishAfterLocks = () => {
                        if (extraRenderTargets.length > 0) this.renderBoardCells(extraRenderTargets);
                        closeForcedSkillFeedbackAudio();
                        this.scheduleOnce(onDone, SKILL_DONE_DELAY);
                    };
                    this.onFlyDone(lockTargets, finishAfterLocks);
                }
            };
            const playedFeedbackIndices = new Set<number>();
            const queuedFeedbackCallbacks = new Set<() => void>();
            let forcedSkillFeedbackAudioOpen = true;
            let nextForcedSkillFeedbackSoundAtMs = 0;
            const closeForcedSkillFeedbackAudio = () => {
                if (!forcedSkillFeedbackAudioOpen) return;
                forcedSkillFeedbackAudioOpen = false;
                for (const callback of queuedFeedbackCallbacks) {
                    this.unschedule(callback);
                }
                queuedFeedbackCallbacks.clear();
                AudioMgr.inst.stopSfx();
            };
            const playFeedbackSoundNow = (sfx: SfxName) => {
                if (!forcedSkillFeedbackAudioOpen) return;
                if (sfx === 'place' && typeof this.playBoardTargetSettleSound === 'function') {
                    this.playBoardTargetSettleSound();
                } else {
                    AudioMgr.inst.play(sfx);
                }
            };
            const scheduleForcedSkillFeedbackSound = (sfx: SfxName) => {
                const nowMs = Date.now();
                const playAtMs = Math.max(nowMs, nextForcedSkillFeedbackSoundAtMs);
                nextForcedSkillFeedbackSoundAtMs = playAtMs + SKILL_MOVE_STAGGER * 1000;
                const delaySeconds = Math.max(0, (playAtMs - nowMs) / 1000);
                if (delaySeconds <= 0.001) {
                    playFeedbackSoundNow(sfx);
                    return;
                }
                const callback = () => {
                    queuedFeedbackCallbacks.delete(callback);
                    playFeedbackSoundNow(sfx);
                };
                queuedFeedbackCallbacks.add(callback);
                this.scheduleOnce(callback, delaySeconds);
            };
            const playFeedback = (sfx: SfxName, feedbackIndex: number) => {
                if (playedFeedbackIndices.has(feedbackIndex)) return;
                playedFeedbackIndices.add(feedbackIndex);
                if (feedbackIndex < 3 || feedbackIndex % 4 === 0) {
                    scheduleForcedSkillFeedbackSound(sfx);
                }
            };
            const applyMoveVisualHide = (move: MoveVisualHide) => {
                if (move.hideBoardCells) {
                    for (const cell of move.hideBoardCells) {
                        const key = `${cell.row},${cell.col}`;
                        if (this._hiddenBoardCells.has(key)) continue;
                        this._hiddenBoardCells.add(key);
                        this.renderBoardCell(cell.row, cell.col);
                    }
                }
                if (move.hideSlotIdxs) {
                    for (const idx of move.hideSlotIdxs) {
                        if (this._hiddenSlotIndices.has(idx)) continue;
                        this._hiddenSlotIndices.add(idx);
                        this.renderSlotIndices([idx]);
                    }
                }
            };
            const revealBoardCell = (cell: { row: number; col: number }) => {
                this._hiddenBoardCells.delete(`${cell.row},${cell.col}`);
                this.renderBoardCell(cell.row, cell.col);
            };
            const revealSlotIdx = (slotIdx: number) => {
                this._hiddenSlotIndices.delete(slotIdx);
                this.renderSlotIndices([slotIdx]);
            };

            for (const move of boardMoves) {
                const targetNode = this.cellNodes[move.target.row]?.[move.target.col];
                if (!targetNode) {
                    finish();
                    continue;
                }
                const targetWorldPos = nodeWorldPos(targetNode);
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorldPos);
                const sourceLocal = layerUT.convertToNodeSpaceAR(move.srcWorld);
                const bean = this.acquireFlyBeanNode(
                    'SkillStepBoard',
                    this.getBoardBeanVisualSize(),
                    this.getBeanSpriteFrame(move.colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(sourceLocal.x, sourceLocal.y, 0);
                bean.setScale(0, 0, 1);
                tween(bean)
                    .delay(move.delay)
                    .call(() => {
                        applyMoveVisualHide(move);
                        bean.setScale(1, 1, 1);
                    })
                    .to(SKILL_FLY_DUR, { position: new Vec3(targetLocal.x, targetLocal.y, 0), scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                    .call(() => {
                        playFeedback('place', move.feedbackIndex);
                        this.recycleFlyBeanNode(bean);
                        revealBoardCell(move.target);
                        finish();
                    })
                    .start();
            }

            for (const move of slotMoves) {
                const slotNode = this.slotNodes[move.slotIdx];
                if (!slotNode) {
                    finish();
                    continue;
                }
                const targetWorldPos = nodeWorldPos(slotNode);
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorldPos);
                const sourceLocal = layerUT.convertToNodeSpaceAR(move.srcWorld);
                const bean = this.acquireFlyBeanNode(
                    'SkillStepSlot',
                    this.getSlotBeanVisualSize(),
                    this.getBeanSpriteFrame(move.colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(sourceLocal.x, sourceLocal.y, 0);
                bean.setScale(0, 0, 1);
                tween(bean)
                    .delay(move.delay)
                    .call(() => {
                        applyMoveVisualHide(move);
                        bean.setScale(1, 1, 1);
                    })
                    .to(SKILL_FLY_DUR, { position: new Vec3(targetLocal.x, targetLocal.y, 0), scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                    .call(() => {
                        this.recycleFlyBeanNode(bean);
                        revealSlotIdx(move.slotIdx);
                        finish();
                    })
                    .start();
            }
        },

        playForcedSkillPlan(
            plan: ForcedSkillPlan,
            onDone: () => void,
            stepIndex: number = 0,
        ) {
            if (stepIndex === 0) {
                this.prepareSkillMoveAnimation();
                for (const target of plan.immediateLockTargets) {
                    this.boardModel.setLocked(target.row, target.col, true);
                }
                if (plan.steps.length === 0) {
                    if (plan.immediateLockTargets.length === 0) {
                        onDone();
                        return;
                    }
                    this.onFlyDone(plan.immediateLockTargets, onDone);
                    return;
                }
            }
        
            if (stepIndex >= plan.steps.length) {
                onDone();
                return;
            }
        
            const SKILL_FLY_DUR = 0.12;
            const SKILL_STEP_GAP = 0.005;
            const SKILL_OVERLAP = 0.01;
        
            const step = plan.steps[stepIndex];
            const nodeWorldPos = (node: Node): Vec3 => node.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            const targetWorld = nodeWorldPos(this.cellNodes[step.target.row][step.target.col]);
            const primarySrcWorld = step.sourceBoard
                ? nodeWorldPos(this.cellNodes[step.sourceBoard.row][step.sourceBoard.col])
                : nodeWorldPos(this.slotNodes[step.sourceSlotIdx!]);
        
            const boardMoves: (ForcedSkillBoardMove & { delay: number })[] = [];
            const slotMoves: (ForcedSkillSlotMove & { delay: number })[] = [];
        
            if (step.sourceBoard) {
                this.boardModel.currentColors[step.sourceBoard.row][step.sourceBoard.col] = 0;
                this.boardModel.setLocked(step.sourceBoard.row, step.sourceBoard.col, false);
                if (step.displacedBoard) {
                    boardMoves.push({
                        colorId: step.displacedBoard.colorId,
                        srcWorld: targetWorld,
                        target: step.displacedBoard.target,
                        lock: step.displacedBoard.lock,
                        delay: 0,
                    });
                    this.boardModel.currentColors[step.displacedBoard.target.row][step.displacedBoard.target.col] = step.displacedBoard.colorId;
                    this.boardModel.setLocked(step.displacedBoard.target.row, step.displacedBoard.target.col, step.displacedBoard.lock);
                }
                boardMoves.push({
                    colorId: step.colorId,
                    srcWorld: primarySrcWorld,
                    target: step.target,
                    lock: true,
                    delay: step.displacedBoard ? SKILL_OVERLAP : 0,
                });
                this.boardModel.currentColors[step.target.row][step.target.col] = step.colorId;
                this.boardModel.setLocked(step.target.row, step.target.col, true);
            } else {
                const sourceSlotIdx = step.sourceSlotIdx!;
                const sourceBlock = this.slotModel.take(sourceSlotIdx);
                if (!sourceBlock || sourceBlock.colorId !== step.colorId) {
                    this.scheduleOnce(() => this.playForcedSkillPlan(plan, onDone, stepIndex + 1), 0);
                    return;
                }
        
                boardMoves.push({
                    colorId: step.colorId,
                    srcWorld: primarySrcWorld,
                    target: step.target,
                    lock: true,
                    delay: 0,
                });
                if (step.displacedBoard) {
                    boardMoves.push({
                        colorId: step.displacedBoard.colorId,
                        srcWorld: targetWorld,
                        target: step.displacedBoard.target,
                        lock: step.displacedBoard.lock,
                        delay: 0,
                    });
                    this.boardModel.currentColors[step.displacedBoard.target.row][step.displacedBoard.target.col] = step.displacedBoard.colorId;
                    this.boardModel.setLocked(step.displacedBoard.target.row, step.displacedBoard.target.col, step.displacedBoard.lock);
                } else if (step.displacedSlot) {
                    const displacedBlock: BeanBlockInfo = {
                        colorId: step.displacedSlot.colorId,
                        cells: [{ row: step.target.row, col: step.target.col }],
                        isLocked: false,
                        source: 'slot',
                        slotIndex: step.displacedSlot.slotIdx,
                    };
                    const swapped = step.displacedSlotInsertMode === 'grouped'
                        ? this.insertSlotBlockByStoreRule(displacedBlock, step.displacedSlot.slotIdx)
                        : this.slotModel.putAt(step.displacedSlot.slotIdx, displacedBlock);
                    if (!swapped) {
                        // 回滚：目标位恢复为空、锁定取消，豆豆放回源槽
                        this.boardModel.currentColors[step.target.row][step.target.col] = 0;
                        this.boardModel.setLocked(step.target.row, step.target.col, false);
                        this.slotModel.putAt(sourceSlotIdx, sourceBlock);
                        this.scheduleOnce(() => this.playForcedSkillPlan(plan, onDone, stepIndex + 1), 0);
                        return;
                    }
                    slotMoves.push({
                        colorId: step.displacedSlot.colorId,
                        srcWorld: targetWorld,
                        slotIdx: step.displacedSlot.slotIdx,
                        delay: SKILL_OVERLAP,
                    });
                }
                this.boardModel.currentColors[step.target.row][step.target.col] = step.colorId;
                this.boardModel.setLocked(step.target.row, step.target.col, true);
            }
        
            this.setForcedSkillHiddenState(step.hiddenBoardCells, step.hiddenSlotIdxs);
            this.renderBoard();
            this.renderSlots();
        
            // 数据已提交，切换到仅动画模式，允许用户触摸交互
            if (stepIndex === 0) {
                this._skillAnimOnly = true;
            }
        
            const totalMoves = boardMoves.length + slotMoves.length;
            let remaining = totalMoves;
            const finish = () => {
                remaining--;
                if (remaining <= 0) {
                    this.onFlyDone(step.lockTargets, () => {
                        this.scheduleOnce(() => this.playForcedSkillPlan(plan, onDone, stepIndex + 1), SKILL_STEP_GAP);
                    });
                }
            };
            if (totalMoves > 0 && typeof this.playBeanFlySound === 'function') {
                this.playBeanFlySound();
            }
        
            for (const move of boardMoves) {
                const targetWorldPos = nodeWorldPos(this.cellNodes[move.target.row][move.target.col]);
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorldPos);
                const sourceLocal = layerUT.convertToNodeSpaceAR(move.srcWorld);
        
                const bean = this.acquireFlyBeanNode(
                    'SkillStepBoard',
                    this.getBoardBeanVisualSize(),
                    this.getBeanSpriteFrame(move.colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(sourceLocal.x, sourceLocal.y, 0);
        
                tween(bean)
                    .delay(move.delay)
                    .to(SKILL_FLY_DUR, { position: new Vec3(targetLocal.x, targetLocal.y, 0), scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                    .call(() => {
                        if (typeof this.playBoardTargetSettleSound === 'function') {
                            this.playBoardTargetSettleSound();
                        } else {
                            AudioMgr.inst.play('place');
                        }
                        this.recycleFlyBeanNode(bean);
                        finish();
                    })
                    .start();
            }
        
            for (const move of slotMoves) {
                const slotNode = this.slotNodes[move.slotIdx];
                if (!slotNode) {
                    finish();
                    continue;
                }
                const targetWorldPos = nodeWorldPos(slotNode);
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorldPos);
                const sourceLocal = layerUT.convertToNodeSpaceAR(move.srcWorld);
        
                const bean = this.acquireFlyBeanNode(
                    'SkillStepSlot',
                    this.getSlotBeanVisualSize(),
                    this.getBeanSpriteFrame(move.colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(sourceLocal.x, sourceLocal.y, 0);
        
                tween(bean)
                    .delay(move.delay)
                    .to(SKILL_FLY_DUR, { position: new Vec3(targetLocal.x, targetLocal.y, 0), scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                    .call(() => {
                        this.recycleFlyBeanNode(bean);
                        finish();
                    })
                    .start();
            }
        },

        playForcedSkillBatch(
            batch: ForcedSkillBatch,
            onDone: () => void,
        ) {
            const { boardMoves, slotMoves, lockTargets } = batch;
            if (boardMoves.length === 0 && slotMoves.length === 0) {
                if (lockTargets.length === 0) {
                    onDone();
                    return;
                }
                this.onFlyDone(lockTargets, onDone);
                return;
            }
        
            this.prepareSkillMoveAnimation();
            for (const move of boardMoves) {
                this._flyingTargets.add(`${move.target.row},${move.target.col}`);
            }
        
            const hiddenSlots = new Set<number>(slotMoves.map((move) => move.slotIdx));
            this.renderBoard();
            if (hiddenSlots.size > 0) this.renderSlotsWithHidden(hiddenSlots);
            else this.renderSlots();
        
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            const totalMoves = boardMoves.length + slotMoves.length;
            let remaining = totalMoves;
            const finish = () => {
                remaining--;
                if (remaining <= 0) {
                    this.onFlyDone(lockTargets, onDone);
                }
            };
            if (totalMoves > 0 && typeof this.playBeanFlySound === 'function') {
                this.playBeanFlySound();
            }
        
            for (let i = 0; i < boardMoves.length; i++) {
                const move = boardMoves[i];
                const targetWorld = this.cellNodes[move.target.row][move.target.col].getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
                const sourceLocal = layerUT.convertToNodeSpaceAR(move.srcWorld);
        
                const bean = this.acquireFlyBeanNode(
                    'SkillFlyBoard',
                    this.getBoardBeanVisualSize(),
                    this.getBeanSpriteFrame(move.colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(sourceLocal.x, sourceLocal.y, 0);
        
                tween(bean)
                    .delay(i * 0.028)
                    .to(0.1, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                    .to(0.1, { position: new Vec3(targetLocal.x, targetLocal.y, 0), scale: new Vec3(1, 1, 1) }, { easing: 'circOut' })
                    .call(() => {
                        if (typeof this.playBoardTargetSettleSound === 'function') {
                            this.playBoardTargetSettleSound();
                        } else {
                            AudioMgr.inst.play('place');
                        }
                        this.recycleFlyBeanNode(bean);
                        finish();
                    })
                    .start();
            }
        
            for (let i = 0; i < slotMoves.length; i++) {
                const move = slotMoves[i];
                const slotNode = this.slotNodes[move.slotIdx];
                if (!slotNode) {
                    finish();
                    continue;
                }
                const targetWorld = slotNode.getComponent(UITransform)!.convertToWorldSpaceAR(Vec3.ZERO);
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
                const sourceLocal = layerUT.convertToNodeSpaceAR(move.srcWorld);
        
                const bean = this.acquireFlyBeanNode(
                    'SkillFlySlot',
                    this.getSlotBeanVisualSize(),
                    this.getBeanSpriteFrame(move.colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(sourceLocal.x, sourceLocal.y, 0);
        
                tween(bean)
                    .delay((boardMoves.length + i) * 0.028)
                    .to(0.1, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                    .to(0.1, { position: new Vec3(targetLocal.x, targetLocal.y, 0), scale: new Vec3(1, 1, 1) }, { easing: 'circOut' })
                    .call(() => {
                        this.recycleFlyBeanNode(bean);
                        finish();
                    })
                    .start();
            }
        },

        runForcedSkillBatches(
            groups: SkillSourceGroup[],
            index: number = 0,
        ) {
            if (index >= groups.length) return;
            const group = groups[index];
            const batch = this.buildForcedSkillBatch(group.colorId, group.boardSources, group.slotSources);
            this.playForcedSkillBatch(batch, () => this.runForcedSkillBatches(groups, index + 1));
        },

        runForcedSkillBoardCounts(
            groups: { colorId: number; count: number }[],
            index: number = 0,
        ) {
            if (index >= groups.length) return;
            const group = groups[index];
            const batch = this.buildForcedSkillBatch(
                group.colorId,
                this.collectCurrentBoardSkillSources(group.colorId, group.count),
                [],
            );
            this.playForcedSkillBatch(batch, () => this.runForcedSkillBoardCounts(groups, index + 1));
        },

        runForcedSkillPlansSequential(
            plans: ForcedSkillPlan[],
            index: number = 0,
            onComplete?: () => void,
            skillGeneration: number = Math.max(0, Number(this._activeSkillUsageGeneration) || 0),
        ) {
            if (index >= plans.length) {
                this.clearForcedSkillHiddenState();
                this.renderBoard();
                this.compactSlotsAfterPropConsume(() => {
                    this.finishSkillUsage(skillGeneration);
                    onComplete?.();
                });
                return;
            }
            this.playForcedSkillPlanNearParallel(plans[index], () => {
                this.runForcedSkillPlansSequential(plans, index + 1, onComplete, skillGeneration);
            });
        },
    });
}
