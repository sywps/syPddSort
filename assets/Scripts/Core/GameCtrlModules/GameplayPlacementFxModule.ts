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
import { installGameplayColorCompleteFxMethods } from './GameplayColorCompleteFxModule';
import { installGameplaySlotCompactionMethods } from './GameplaySlotCompactionModule';
import { runtimeLog } from '../RuntimeLog';

type FlyPlaceVisualOptions = {
    sourceBeanSize?: number;
    targetBeanSize?: number;
    awaitLandEffect?: boolean;
};

type PendingRemainingSelection =
    | { source: 'board'; colorId: number; cells: { row: number; col: number }[] }
    | { source: 'slot'; colorId: number };

type FlyBeanFollowOptions = {
    bean: Node;
    sourceLocal: Vec3;
    initialTargetLocal: Vec3;
    sourceScale: number;
    initialTargetBeanSize: number;
    targetRow: number;
    targetCol: number;
    delay?: number;
    duration: number;
    easing?: string;
    generation?: number;
    onComplete?: () => void;
};

const DEFAULT_BEAN_FLY_STAGGER_SECONDS = 0.028;
const MAX_BEAN_FLY_STAGGER_WINDOW_SECONDS = 0.35;
const PLACEMENT_OPERATION_TIMEOUT_MS = 3000;

export function getBeanFlyStaggerDelay(beanCount: number): number {
    const normalizedCount = Math.max(0, Math.floor(Number(beanCount) || 0));
    if (normalizedCount <= 1) return 0;
    return Math.min(
        DEFAULT_BEAN_FLY_STAGGER_SECONDS,
        MAX_BEAN_FLY_STAGGER_WINDOW_SECONDS / (normalizedCount - 1),
    );
}

export function installGameplayPlacementFxModule(target: any): void {
    installGameplayColorCompleteFxMethods(target);
    installGameplaySlotCompactionMethods(target);
    Object.assign(target, {
        isPlacementInputLocked(): boolean {
            return (Number(this._placementInputLockRefs) || 0) > 0 || this._placementInputLocked === true;
        },

        isPlacementVisualBusy(): boolean {
            return (Number(this._placementVisualRefs) || 0) > 0 || this.isPlacementInputLocked();
        },

        beginPlacementInputLock(owner: string = 'placement-input'): string {
            const token = this.acquireRuntimeOwner?.('placement-input', owner)
                || `placement-input:legacy:${Date.now()}:${owner}`;
            this._placementInputLockRefs = typeof this.getRuntimeOwnerCount === 'function'
                ? this.getRuntimeOwnerCount('placement-input')
                : Math.max(0, Math.floor(Number(this._placementInputLockRefs) || 0)) + 1;
            this._placementInputLocked = this._placementInputLockRefs > 0;
            return token;
        },

        endPlacementInputLock(tokenOrOwner: string = 'placement-input'): void {
            if (String(tokenOrOwner || '').startsWith('placement-input:')) {
                this.releaseRuntimeOwner?.(tokenOrOwner);
            } else {
                this.releaseRuntimeOwnerByName?.('placement-input', tokenOrOwner);
            }
            this._placementInputLockRefs = typeof this.getRuntimeOwnerCount === 'function'
                ? this.getRuntimeOwnerCount('placement-input')
                : Math.max(0, Math.floor(Number(this._placementInputLockRefs) || 0) - 1);
            this._placementInputLocked = this._placementInputLockRefs > 0;
        },

        beginPlacementVisual(owner: string = 'placement'): string {
            const token = this.acquireRuntimeOwner?.('placement', owner)
                || `placement:legacy:${Date.now()}:${owner}`;
            this._placementVisualRefs = typeof this.getRuntimeOwnerCount === 'function'
                ? this.getRuntimeOwnerCount('placement')
                : Math.max(0, Math.floor(Number(this._placementVisualRefs) || 0)) + 1;
            return token;
        },

        endPlacementVisual(tokenOrOwner: string = 'placement'): void {
            if (String(tokenOrOwner || '').startsWith('placement:')) {
                this.releaseRuntimeOwner?.(tokenOrOwner);
            } else {
                this.releaseRuntimeOwnerByName?.('placement', tokenOrOwner);
            }
            this._placementVisualRefs = typeof this.getRuntimeOwnerCount === 'function'
                ? this.getRuntimeOwnerCount('placement')
                : Math.max(0, Math.floor(Number(this._placementVisualRefs) || 0) - 1);
        },

        clearPlacementOperationWatchdog(token: string): void {
            if (!token) return;
            const watchdogs: Map<string, any> = this._placementOperationWatchdogs
                || (this._placementOperationWatchdogs = new Map<string, any>());
            const watchdog = watchdogs.get(token);
            if (!watchdog) return;
            clearTimeout(watchdog.timer);
            watchdogs.delete(token);
        },

        clearPlacementOperationWatchdogs(): void {
            const watchdogs: Map<string, any> = this._placementOperationWatchdogs
                || (this._placementOperationWatchdogs = new Map<string, any>());
            for (const watchdog of watchdogs.values()) {
                clearTimeout(watchdog.timer);
            }
            watchdogs.clear();
        },

        recoverExpiredPlacementOperationsAfterForeground(): number {
            const watchdogs: Map<string, any> = this._placementOperationWatchdogs
                || (this._placementOperationWatchdogs = new Map<string, any>());
            const now = Date.now();
            let recovered = 0;
            for (const watchdog of Array.from(watchdogs.values())) {
                if (Number(watchdog?.deadlineAt) > now || typeof watchdog?.recover !== 'function') continue;
                if (watchdog.recover('foreground')) recovered++;
            }
            return recovered;
        },

        armPlacementOperationWatchdog(
            token: string,
            generation: number,
            owner: string,
            onTimeout: () => void,
        ): void {
            this.clearPlacementOperationWatchdog(token);
            const watchdogs: Map<string, any> = this._placementOperationWatchdogs
                || (this._placementOperationWatchdogs = new Map<string, any>());
            const startedAt = Date.now();
            const watchdog = {
                token,
                generation,
                owner,
                startedAt,
                deadlineAt: startedAt + PLACEMENT_OPERATION_TIMEOUT_MS,
                timer: null as any,
                recover: null as any,
            };
            watchdog.recover = (source: string = 'timeout') => {
                if (watchdogs.get(token) !== watchdog) return;
                clearTimeout(watchdog.timer);
                watchdogs.delete(token);
                const activeGeneration = Math.max(
                    0,
                    Math.floor(Number(this._placementAnimationGeneration) || 0),
                );
                if (generation !== activeGeneration) return false;
                console.error(`[Placement] ${owner} recovered after ${PLACEMENT_OPERATION_TIMEOUT_MS}ms: ${source}`);
                try {
                    onTimeout();
                } catch (error) {
                    console.error(`[Placement] ${owner} timeout recovery failed`, error);
                    try {
                        this.endPlacementVisual(token);
                    } catch (releaseError) {
                        console.error(`[Placement] ${owner} owner release failed`, releaseError);
                    }
                }
                return true;
            };
            watchdog.timer = setTimeout(() => {
                watchdog.recover('timeout');
            }, PLACEMENT_OPERATION_TIMEOUT_MS);
            watchdogs.set(token, watchdog);
        },

        retainFlyingTarget(row: number, col: number): string {
            const key = `${row},${col}`;
            const refs: Map<string, number> = this._flyingTargetRefs || (this._flyingTargetRefs = new Map<string, number>());
            refs.set(key, (refs.get(key) || 0) + 1);
            this._flyingTargets.add(key);
            return key;
        },

        releaseFlyingTargetKey(key: string): void {
            const refs: Map<string, number> = this._flyingTargetRefs || (this._flyingTargetRefs = new Map<string, number>());
            const next = Math.max(0, (refs.get(key) || 0) - 1);
            if (next > 0) {
                refs.set(key, next);
                return;
            }
            refs.delete(key);
            this._flyingTargets.delete(key);
        },

        retainHiddenSlotIndex(index: number): void {
            const refs: Map<number, number> = this._hiddenSlotIndexRefs || (this._hiddenSlotIndexRefs = new Map<number, number>());
            refs.set(index, (refs.get(index) || 0) + 1);
            this._hiddenSlotIndices.add(index);
        },

        releaseHiddenSlotIndex(index: number): void {
            const refs: Map<number, number> = this._hiddenSlotIndexRefs || (this._hiddenSlotIndexRefs = new Map<number, number>());
            const next = Math.max(0, (refs.get(index) || 0) - 1);
            if (next > 0) {
                refs.set(index, next);
                return;
            }
            refs.delete(index);
            this._hiddenSlotIndices.delete(index);
        },

        clearPlacementVisualState(): void {
            this.clearPlacementOperationWatchdogs?.();
            this._placementAnimationGeneration = Math.max(
                0,
                Math.floor(Number(this._placementAnimationGeneration) || 0),
            ) + 1;
            this.clearActiveFlyBeanNodes?.('placement-state-clear');
            this.clearRuntimeOwners?.('placement');
            this.clearRuntimeOwners?.('placement-input');
            this._placementVisualRefs = 0;
            this._placementInputLockRefs = 0;
            this._placementInputLocked = false;
            this._flyingTargetRefs?.clear?.();
            this._hiddenSlotIndexRefs?.clear?.();
            this._flyingTargets.clear();
            this._hiddenSlotIndices.clear();
        },

        playBoardTargetSettleSound(): void {
            AudioMgr.inst.play('place');
        },

        playBeanFlySound(): void {
            AudioMgr.inst.play('fly');
        },

        createBoardRemainingSelection(block: BeanBlockInfo, remainingCount: number): PendingRemainingSelection | null {
            const count = Math.max(0, Math.min(block.cells.length, Math.floor(Number(remainingCount) || 0)));
            if (count <= 0) return null;
            const cells = block.cells
                .slice(block.cells.length - count)
                .map((cell) => ({ row: cell.row, col: cell.col }));
            if (cells.length === 0) return null;
            return { source: 'board', colorId: block.colorId, cells };
        },

        createSlotRemainingSelection(block: BeanBlockInfo, remainingCount: number): PendingRemainingSelection | null {
            const count = Math.max(0, Math.min(block.cells.length, Math.floor(Number(remainingCount) || 0)));
            if (count <= 0) return null;
            return { source: 'slot', colorId: block.colorId };
        },

        applyRemainingSelectionAfterPlacement(selection: PendingRemainingSelection | null): boolean {
            if (!selection || this.isGameEnd) return false;
            if (selection.source === 'board') {
                const cells = selection.cells.filter((cell) =>
                    this.boardModel.currentColors[cell.row]?.[cell.col] === selection.colorId
                    && !this.boardModel.locked[cell.row]?.[cell.col]
                );
                if (cells.length === 0) return false;
                this.applyBoardSelection({
                    colorId: selection.colorId,
                    cells,
                    isLocked: false,
                    source: 'board',
                }, { playFeedback: false, preserveVisual: true });
                return true;
            }

            const slots = this.slotModel.getAll();
            for (let i = 0; i < slots.length; i++) {
                if (slots[i]?.colorId === selection.colorId) {
                    return this.selectSlotBlockByIndex(i, { playFeedback: false });
                }
            }
            return false;
        },

        /** 第二次点击：放置选中的豆豆块（暂存槽优先） */
        handlePlace(worldPos: Vec3) {
            const block = this.currentBlock!;
        
            // 暂存槽优先：尝试放到暂存槽
            if (this.isSlotAreaInteractive()) {
                const slotIntent = typeof this.resolveSlotTapIntent === 'function'
                    ? this.resolveSlotTapIntent(worldPos, block.source === 'slot' ? 'slotSelected' : 'boardSelected')
                    : null;
                if (slotIntent && slotIntent.kind !== 'miss') {
                    if (slotIntent.kind === 'unlockButton') {
                        if (typeof this.triggerSlotUnlockFromInput === 'function') {
                            this.triggerSlotUnlockFromInput();
                        } else {
                            this.tryUnlockSlotRow?.();
                        }
                        return;
                    }
                    // 如果豆豆来自暂存槽且放回暂存区，直接取消
                    if (block.source === 'slot') {
                        this.playReturnFeedback();
                        if (this._guideStep >= 0) return; // 引导期间不取消选中
                        this.cancelSelection();
                        return;
                    }
                    // 先捕获源世界坐标
                    const sources = this.collectSourceWorldPositions(block);
                    if (this.isFirstLevelFunnelActive() && !this._firstFunnelPlaceAttemptSent) {
                        this._firstFunnelPlaceAttemptSent = true;
                        this.trackFirstLevelFunnel('first_place_attempt', {
                            touchTarget: 'slot',
                            source: this._guideStep >= 0 ? 'tutorial' : 'free_play',
                            extra: { colorId: block.colorId, sourceBlock: block.source },
                        });
                    }
        
                    // 从棋盘移除
                    this.boardModel.removeBlock(block);
        
                    const storedSlotIdxs: number[] = [];
                    for (const cell of block.cells) {
                        const idx = this.slotModel.store({
                            colorId: block.colorId, cells: [cell],
                            isLocked: false, source: 'slot',
                        });
                        if (idx === -1) break;
                        storedSlotIdxs.push(idx);
                    }
                    const remainingSelection = storedSlotIdxs.length < block.cells.length
                        ? this.createBoardRemainingSelection(block, block.cells.length - storedSlotIdxs.length)
                        : null;
                    if (storedSlotIdxs.length < block.cells.length) {
                        const remaining: BeanBlockInfo = {
                            colorId: block.colorId,
                            cells: block.cells.slice(storedSlotIdxs.length),
                            isLocked: false, source: 'board',
                        };
                        this.boardModel.restoreBlock(remaining);
                    }
                    if (storedSlotIdxs.length > 0) {
                        if (this.isFirstLevelFunnelActive() && !this._firstFunnelPlaceSuccessSent) {
                            this._firstFunnelPlaceSuccessSent = true;
                            this.trackFirstLevelFunnel('first_place_success', {
                                touchTarget: 'slot',
                                source: this._guideStep >= 0 ? 'tutorial' : 'free_play',
                                success: true,
                                extra: { colorId: block.colorId, placedCount: storedSlotIdxs.length, sourceBlock: block.source },
                            });
                        }
                        this.checkSlotAddReminderAfterSlotChanged?.('first-full');
                        this.startFlyToSlots(block.colorId, sources.slice(0, storedSlotIdxs.length), storedSlotIdxs, block.cells, remainingSelection);
                    } else {
                        this.playReturnFeedback();
                        if (this.slotModel && !this.slotModel.hasEmptySlot?.()) {
                            this.triggerSlotAddReminder?.('full-place-attempt');
                        }
                    }
                    return;
                }
            }
        
            // 尝试放到棋盘
            const target = this.getBoardPlaceTargetFromWorldPos(worldPos, block.colorId);
            if (target) {
                this.placeCurrentBlockOnBoard(target);
                return;
            }
        
            // 点了其他地方：保持选中状态，播放提示音
            this.playReturnFeedback();
        },

        /** 取得选中块的各豆源世界坐标（用于飞行起点） */
        collectSourceWorldPositions(block: BeanBlockInfo): Vec3[] {
            const sources: Vec3[] = [];
            if (block.source === 'slot') {
                // 豆豆还在暂存槽里
                for (const idx of this._selectedSlotIndices) {
                    const slotNode = this.slotNodes[idx];
                    if (slotNode) {
                        const beanNode = slotNode.getChildByName('Bean');
                        const ut = beanNode?.getComponent(UITransform) || slotNode.getComponent(UITransform);
                        if (ut) sources.push(ut.convertToWorldSpaceAR(new Vec3(0, 0, 0)));
                    }
                }
            } else {
                // 豆豆还在棋盘上
                for (const cell of block.cells) {
                    const cellNode = this.cellNodes[cell.row]?.[cell.col];
                    if (!cellNode) continue;
                    const ut = cellNode.getComponent(UITransform)!;
                    sources.push(ut.convertToWorldSpaceAR(new Vec3(0, 0, 0)));
                }
            }
            return sources;
        },

        /** 启动"一颗颗飞向目标位置"特效 */
        getNodeScaleInLayer(node: Node | null | undefined, layer: Node | null | undefined): number {
            if (!node?.isValid || !layer?.isValid) return 1;
            const nodeScale = node.getWorldScale(new Vec3());
            const layerScale = layer.getWorldScale(new Vec3());
            const nodeVisualScale = Math.max(Math.abs(nodeScale.x || 0), Math.abs(nodeScale.y || 0), 0.0001);
            const layerVisualScale = Math.max(Math.abs(layerScale.x || 0), Math.abs(layerScale.y || 0), 0.0001);
            return nodeVisualScale / layerVisualScale;
        },

        getBoardFlyBeanSizeInLayer(layer: Node): number {
            const boardNode = this.boardNode?.isValid ? this.boardNode : this.boardGroup;
            return Math.max(1, this.getBoardBeanVisualSize() * this.getNodeScaleInLayer(boardNode, layer));
        },

        getSlotFlyBeanSizeInLayer(slotNode: Node | null | undefined, layer: Node): number {
            const beanNode = slotNode?.getChildByName('Bean');
            const sourceNode = beanNode?.isValid ? beanNode : (slotNode?.isValid ? slotNode : this.slotAreaNode);
            return Math.max(1, this.getSlotBeanVisualSize() * this.getNodeScaleInLayer(sourceNode, layer));
        },

        getSelectedSlotFlyBeanSizeInLayer(layer: Node): number {
            for (const idx of this._selectedSlotIndices || []) {
                const slotNode = this.slotNodes?.[idx] || null;
                if (slotNode?.isValid) {
                    return this.getSlotFlyBeanSizeInLayer(slotNode, layer);
                }
            }
            return this.getSlotFlyBeanSizeInLayer(null, layer);
        },

        createFlyPlaceVisualOptions(block: BeanBlockInfo): FlyPlaceVisualOptions {
            const targetBeanSize = this.getBoardFlyBeanSizeInLayer(this.dragLayer);
            const sourceBeanSize = block.source === 'slot'
                ? this.getSelectedSlotFlyBeanSizeInLayer(this.dragLayer)
                : targetBeanSize;
            return { sourceBeanSize, targetBeanSize };
        },

        startBoardTargetFollowTween(options: FlyBeanFollowOptions): void {
            const state = { t: 0 };
            const generation = Math.max(0, Math.floor(Number(options.generation) || 0));
            const isCurrentGeneration = () => !generation
                || generation === Math.max(0, Math.floor(Number(this._placementAnimationGeneration) || 0));
            const initialTargetBeanSize = Math.max(1, Number(options.initialTargetBeanSize) || 1);
            const updateBean = () => {
                if (!isCurrentGeneration()) return;
                if (!options.bean?.isValid || !this.dragLayer?.isValid) return;
                const layerUT = this.dragLayer.getComponent(UITransform);
                const targetWorld = this.getBoardCellWorldPosition?.(options.targetRow, options.targetCol) || null;
                const targetLocal = targetWorld && layerUT
                    ? layerUT.convertToNodeSpaceAR(targetWorld)
                    : options.initialTargetLocal;
                const t = Math.max(0, Math.min(1, Number(state.t) || 0));
                options.bean.setPosition(
                    options.sourceLocal.x + (targetLocal.x - options.sourceLocal.x) * t,
                    options.sourceLocal.y + (targetLocal.y - options.sourceLocal.y) * t,
                    options.sourceLocal.z + (targetLocal.z - options.sourceLocal.z) * t,
                );
                const currentTargetBeanSize = Math.max(1, this.getBoardFlyBeanSizeInLayer?.(this.dragLayer) || initialTargetBeanSize);
                const targetScale = currentTargetBeanSize / initialTargetBeanSize;
                const currentScale = options.sourceScale + (targetScale - options.sourceScale) * t;
                options.bean.setScale(currentScale, currentScale, 1);
            };
            updateBean();
            tween(state)
                .delay(Math.max(0, Number(options.delay) || 0))
                .to(options.duration, { t: 1 }, {
                    easing: (options.easing || 'sineOut') as any,
                    onUpdate: updateBean,
                })
                .call(() => {
                    if (!isCurrentGeneration()) return;
                    state.t = 1;
                    updateBean();
                    options.onComplete?.();
                })
                .start();
        },

        startFlyPlace(
            colorId: number,
            sourcesWorld: Vec3[],
            targets: { row: number; col: number }[],
            dirtyBoardCells: { row: number; col: number }[] = [],
            dirtySlotIndices: number[] = [],
            afterAllLanded?: (onComplete: () => void) => void,
            visualOptions?: FlyPlaceVisualOptions,
            remainingSelection: PendingRemainingSelection | null = null,
            onFirstTargetArrived?: () => void,
        ) {
            const placementGeneration = Math.max(
                0,
                Math.floor(Number(this._placementAnimationGeneration) || 0),
            ) + 1;
            this._placementAnimationGeneration = placementGeneration;
            const placementOwnerToken = this.beginPlacementVisual('fly-place');
            const activeFlyBeans = new Set<Node>();
            let placementFinished = false;
            const finishPlacementOwner = () => {
                if (placementFinished) return false;
                placementFinished = true;
                this.clearPlacementOperationWatchdog?.(placementOwnerToken);
                this.endPlacementVisual(placementOwnerToken);
                return true;
            };
            const recoverTimedOutPlacement = () => {
                if (placementFinished) return;
                this._placementAnimationGeneration = placementGeneration + 1;
                for (const bean of Array.from(activeFlyBeans)) {
                    activeFlyBeans.delete(bean);
                    try {
                        if (bean?.isValid) {
                            this.recycleFlyBeanNode(bean);
                        }
                    } catch (error) {
                        console.error('[Placement] fly-place bean recovery failed', error);
                    }
                }
                try {
                    this.onFlyAllLanded(targets);
                } finally {
                    finishPlacementOwner();
                }
            };
            this.armPlacementOperationWatchdog?.(
                placementOwnerToken,
                placementGeneration,
                'fly-place',
                recoverTimedOutPlacement,
            );
            // 清除浮起节点 + 恢复格子位置
            this.clearDragNodes();
            this.stopPulseTweens();
            this.clearSelectionOverlay();
            this.clearIdleHint();
            const preserveBoardCells = remainingSelection?.source === 'board' ? remainingSelection.cells : [];
            this.resetCellPositionsExcept(preserveBoardCells);
            this.resetSlotPositions();
            this.isSelected = false;
            this.currentBlock = null;
            this._selectedSlotIndices = [];
        
            // 标记目标格为飞行中（渲染时不画豆）
            for (const t of targets) this.retainFlyingTarget(t.row, t.col);
            this.renderBoardCells([...dirtyBoardCells, ...targets]);
            this.renderSlotIndices(dirtySlotIndices);
            if (remainingSelection) {
                this.applyRemainingSelectionAfterPlacement(remainingSelection);
            }
        
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            const flyDelay = getBeanFlyStaggerDelay(targets.length);
            const FLY_GROW_DUR = 0.09;
            const FLY_MOVE_DUR = 0.11;
            const FLY_TOTAL_DUR = FLY_GROW_DUR + FLY_MOVE_DUR;
            const defaultTargetBeanSize = this.getBoardFlyBeanSizeInLayer(this.dragLayer);
            const targetBeanSize = Math.max(1, visualOptions?.targetBeanSize ?? defaultTargetBeanSize);
            const sourceBeanSize = Math.max(1, visualOptions?.sourceBeanSize ?? targetBeanSize);
            const sourceScale = sourceBeanSize / targetBeanSize;
            const awaitLandEffect = visualOptions?.awaitLandEffect !== false;
            let remaining = targets.length;
            let firstTargetArrived = false;
            const notifyFirstTargetArrived = () => {
                if (firstTargetArrived) return;
                firstTargetArrived = true;
                onFirstTargetArrived?.();
            };
            const finishAfterAllLanded = () => {
                if (placementFinished) return;
                try {
                    this.onFlyAllLanded(targets);
                } finally {
                    finishPlacementOwner();
                }
            };
            if (remaining === 0) {
                finishAfterAllLanded();
                return;
            }
            this.playBeanFlySound();
        
            for (let i = 0; i < targets.length; i++) {
                const t = targets[i];
                const targetKey = `${t.row},${t.col}`;
                const targetWorld = this.getBoardCellWorldPosition?.(t.row, t.col)
                    || this.cellNodes[t.row]?.[t.col]?.getComponent(UITransform)?.convertToWorldSpaceAR(new Vec3(0, 0, 0))
                    || null;
                if (!targetWorld) {
                    this.releaseFlyingTargetKey(targetKey);
                    this.renderBoardCell(t.row, t.col);
                    notifyFirstTargetArrived();
                    remaining--;
                    if (remaining <= 0) finishAfterAllLanded();
                    continue;
                }
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
                const srcWorld = sourcesWorld[i] || sourcesWorld[sourcesWorld.length - 1] || targetWorld;
                const srcLocal = layerUT.convertToNodeSpaceAR(srcWorld);
        
                const bean = this.acquireFlyBeanNode(
                    'FlyBean',
                    targetBeanSize,
                    this.getBeanSpriteFrame(colorId, false),
                );
                activeFlyBeans.add(bean);
                this.dragLayer.addChild(bean);
                bean.setPosition(srcLocal.x, srcLocal.y, 0);
                bean.setScale(sourceScale, sourceScale, 1);

                this.startBoardTargetFollowTween({
                    bean,
                    sourceLocal: new Vec3(srcLocal.x, srcLocal.y, srcLocal.z),
                    initialTargetLocal: new Vec3(targetLocal.x, targetLocal.y, targetLocal.z),
                    sourceScale,
                    initialTargetBeanSize: targetBeanSize,
                    targetRow: t.row,
                    targetCol: t.col,
                    generation: placementGeneration,
                    delay: i * flyDelay,
                    duration: FLY_TOTAL_DUR,
                    easing: 'sineOut',
                    onComplete: () => {
                        this.playBoardTargetSettleSound();
                        AudioMgr.inst.vibratePlace();
                        activeFlyBeans.delete(bean);
                        this.recycleFlyBeanNode(bean);
                        this.releaseFlyingTargetKey(targetKey);
                        this.renderBoardCell(t.row, t.col);
                        notifyFirstTargetArrived();
                        const completeArrival = () => {
                            remaining--;
                            if (remaining <= 0) {
                                finishAfterAllLanded();
                            }
                        };
                        if (awaitLandEffect) {
                            this.playLandEffect(t.row, t.col, completeArrival);
                        } else {
                            this.playLandEffect(t.row, t.col);
                            completeArrival();
                        }
                    },
                });
            }
        },

        /** 飞向暂存槽：源→slot 位置；动画期间对应 slot 隐藏占位 */
        startFlyToSlots(
            colorId: number,
            sourcesWorld: Vec3[],
            slotIdxs: number[],
            dirtyBoardCells: { row: number; col: number }[] = [],
            remainingSelection: PendingRemainingSelection | null = null,
            onFirstTargetArrived?: () => void,
        ) {
            const placementGeneration = Math.max(
                0,
                Math.floor(Number(this._placementAnimationGeneration) || 0),
            ) + 1;
            this._placementAnimationGeneration = placementGeneration;
            const placementOwnerToken = this.beginPlacementVisual('fly-to-slots');
            const activeFlyBeans = new Set<Node>();
            const pendingSlotIndices = new Set<number>();
            let placementFinished = false;
            const finishPlacementOwner = () => {
                if (placementFinished) return false;
                placementFinished = true;
                this.clearPlacementOperationWatchdog?.(placementOwnerToken);
                this.endPlacementVisual(placementOwnerToken);
                return true;
            };
            const finishSlotLanding = () => {
                if (placementFinished) return;
                try {
                    this.renderBoardCells(dirtyBoardCells);
                    this.checkGuideStepComplete();
                    this.resetIdleHintTimer();
                    if (this.boardModel.isAllLocked()) {
                        this.clearEndgameHints(false);
                        this.playPatternCompleteThenWin();
                    } else {
                        this.refreshEndgameHints('slot-landed');
                    }
                } finally {
                    finishPlacementOwner();
                }
            };
            const recoverTimedOutPlacement = () => {
                if (placementFinished) return;
                this._placementAnimationGeneration = placementGeneration + 1;
                for (const bean of Array.from(activeFlyBeans)) {
                    activeFlyBeans.delete(bean);
                    try {
                        if (bean?.isValid) {
                            this.recycleFlyBeanNode(bean);
                        }
                    } catch (error) {
                        console.error('[Placement] fly-to-slots bean recovery failed', error);
                    }
                }
                for (const slotIdx of Array.from(pendingSlotIndices)) {
                    pendingSlotIndices.delete(slotIdx);
                    try {
                        this.releaseHiddenSlotIndex(slotIdx);
                    } catch (error) {
                        console.error('[Placement] hidden slot recovery failed', error);
                    }
                }
                try {
                    this.renderSlots();
                    finishSlotLanding();
                } finally {
                    finishPlacementOwner();
                }
            };
            this.armPlacementOperationWatchdog?.(
                placementOwnerToken,
                placementGeneration,
                'fly-to-slots',
                recoverTimedOutPlacement,
            );
            const preserveBoardCells = remainingSelection?.source === 'board' ? remainingSelection.cells : [];
            this.clearDragNodes();
            this.stopPulseTweens();
            this.clearSelectionOverlay();
            this.clearIdleHint();
            this.resetCellPositionsExcept(preserveBoardCells);
            this.resetSlotPositions();
            this.isSelected = false;
            this.currentBlock = null;
            this._selectedSlotIndices = [];
            this.clearForcedSkillHiddenState();
            this._lastPlacedCells = null;
        
            for (const idx of slotIdxs) {
                this.retainHiddenSlotIndex(idx);
                pendingSlotIndices.add(idx);
            }
            this.renderBoardCells(dirtyBoardCells);
            // 同色插入会把后续已占用槽整体右移；这里必须先全量重绘一遍槽区，
            // 否则被挪动的豆子要等到下一次交互触发刷新才会重新出现。
            this.renderSlots();
            if (remainingSelection) {
                this.applyRemainingSelectionAfterPlacement(remainingSelection);
            }
        
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            const flyDelay = getBeanFlyStaggerDelay(slotIdxs.length);
            const FLY_GROW_DUR = 0.09;
            const FLY_MOVE_DUR = 0.11;
            const FLY_TOTAL_DUR = FLY_GROW_DUR + FLY_MOVE_DUR;
            const sourceBeanSize = this.getBoardFlyBeanSizeInLayer(this.dragLayer);
            let remaining = slotIdxs.length;
            let firstTargetArrived = false;
            const notifyFirstTargetArrived = () => {
                if (firstTargetArrived) return;
                firstTargetArrived = true;
                onFirstTargetArrived?.();
            };
            if (remaining === 0) {
                this.finishPlace();
                finishPlacementOwner();
                return;
            }
            this.playBeanFlySound();
            const completeOne = () => {
                remaining--;
                if (remaining <= 0) {
                    finishSlotLanding();
                }
            };
        
            for (let i = 0; i < slotIdxs.length; i++) {
                const slotIdx = slotIdxs[i];
                const slotNode = this.slotNodes[slotIdx];
                if (!slotNode) {
                    pendingSlotIndices.delete(slotIdx);
                    this.releaseHiddenSlotIndex(slotIdx);
                    completeOne();
                    continue;
                }
                const targetWorld = slotNode.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
                const srcWorld = sourcesWorld[i] || sourcesWorld[sourcesWorld.length - 1] || targetWorld;
                const srcLocal = layerUT.convertToNodeSpaceAR(srcWorld);
                const targetBeanSize = this.getSlotFlyBeanSizeInLayer(slotNode, this.dragLayer);
                const sourceScale = sourceBeanSize / targetBeanSize;
                const shouldTweenScale = Math.abs(sourceScale - 1) > 0.01;
        
                const bean = this.acquireFlyBeanNode(
                    'FlyBean',
                    // 从棋盘飞入暂存槽的临时豆豆按棋盘尺寸；槽内最终尺寸由 SlotShell/Bean 单独控制。
                    targetBeanSize,
                    this.getBeanSpriteFrame(colorId, false),
                );
                activeFlyBeans.add(bean);
                this.dragLayer.addChild(bean);
                bean.setPosition(srcLocal.x, srcLocal.y, 0);
                bean.setScale(sourceScale, sourceScale, 1);
                const flyProps: { position: Vec3; scale?: Vec3 } = {
                    position: new Vec3(targetLocal.x, targetLocal.y, 0),
                };
                if (shouldTweenScale) {
                    flyProps.scale = new Vec3(1, 1, 1);
                }
        
                tween(bean)
                    .delay(i * flyDelay)
                    .to(FLY_TOTAL_DUR, flyProps, { easing: 'sineOut' })
                    .call(() => {
                        if (placementGeneration !== Math.max(
                            0,
                            Math.floor(Number(this._placementAnimationGeneration) || 0),
                        )) return;
                        AudioMgr.inst.play('slot');
                        AudioMgr.inst.vibratePlace();
                        activeFlyBeans.delete(bean);
                        this.recycleFlyBeanNode(bean);
                        pendingSlotIndices.delete(slotIdx);
                        this.releaseHiddenSlotIndex(slotIdx);
                        this.renderSlotIndices([slotIdx]);
                        notifyFirstTargetArrived();
                        completeOne();
                    })
                    .start();
            }
        },

        onFlyDone(targets: { row: number; col: number }[], afterLanding?: () => void) {
            const dirtySlotIndices = Array.from(this._hiddenSlotIndices);
            for (const t of targets || []) {
                this.releaseFlyingTargetKey(`${t.row},${t.col}`);
            }
            this.clearForcedSkillHiddenState();
            this._lastPlacedCells = null;
            this.renderBoardCells(targets);
            if (dirtySlotIndices.length > 0) this.renderSlotIndices(dirtySlotIndices);
            else this.renderSlots();
            this.playLandingEffectsThen(targets, () => {
                this.runPostLockLandingFlow(targets, 'fly-done', { grantLargePlacementBonus: true });
                afterLanding?.();
            });
        },

        playBrightFlashAt(worldPos: Vec3, size: number, peakOpacity: number = 210) {
            const bright = this.getBrightSpriteFrame();
            if (!bright) throw new Error('[placement-fx] missing required SpriteFrame: block_bright_pindd');
            if (this._activeBrightFlashCount >= MAX_CONCURRENT_FRAME_EFFECTS) return;
            PerformanceMgr.inst.markUserActivity();
            this._activeBrightFlashCount += 1;
        
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            const localPos = layerUT.convertToNodeSpaceAR(worldPos);
            const { node: glow, sprite: sp, opacity: uo } = this.acquireEffectNode(this._brightFlashPool, 'BrightFlash', size);
            this.dragLayer.addChild(glow);
            glow.setPosition(localPos.x, localPos.y, 0);
            glow.setScale(0.84, 0.84, 1);
        
            sp.spriteFrame = bright;
            uo.opacity = 0;
        
            tween(glow)
                .to(0.08, { scale: new Vec3(1.02, 1.02, 1) }, { easing: 'sineOut' })
                .to(0.12, { scale: new Vec3(1.24, 1.24, 1) }, { easing: 'quadOut' })
                .call(() => {
                    this._activeBrightFlashCount = Math.max(0, this._activeBrightFlashCount - 1);
                    this.recycleEffectNode(this._brightFlashPool, glow);
                })
                .start();
        
            tween(uo)
                .to(0.05, { opacity: peakOpacity }, { easing: 'sineOut' })
                .to(0.15, { opacity: 0 }, { easing: 'quadIn' })
                .start();
        },

        playLandingLightAtCell(row: number, col: number): void {
            const cellNode = this.cellNodes[row]?.[col];
            if (!cellNode?.isValid) return;
            const worldPos = this.getBoardCellWorldPosition?.(row, col)
                || cellNode.getComponent(UITransform)?.convertToWorldSpaceAR(new Vec3(0, 0, 0))
                || null;
            if (!worldPos) return;
            const slotSize = Math.max(1, Number(this.getBoardSlotVisualSize?.() || this.cellSize || 1));
            this.playBrightFlashAt(worldPos, slotSize * 1.55, 135);
        },

        playLandEffect(row: number, col: number, onComplete?: () => void) {
            const cn = this.cellNodes[row]?.[col];
            if (!cn) {
                onComplete?.();
                return;
            }
            Tween.stopAllByTarget(cn);
            cn.setScale(1.1, 1.1, 1);
            tween(cn)
                .to(0.12, { scale: new Vec3(0.97, 0.97, 1) }, { easing: 'sineInOut' })
                .to(0.08, { scale: new Vec3(1.035, 1.035, 1) }, { easing: 'sineOut' })
                .call(() => {
                    this.playBeanSettleMatchFxOnCell?.(row, col);
                })
                .to(0.08, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
                .call(() => {
                    onComplete?.();
                })
                .start();
        },

        playLandingEffectsThen(
            targets: { row: number; col: number }[],
            onComplete?: () => void,
        ) {
            const uniqueTargets: { row: number; col: number }[] = [];
            const seen = new Set<string>();
            for (const t of targets || []) {
                const key = `${t.row},${t.col}`;
                if (seen.has(key)) continue;
                seen.add(key);
                uniqueTargets.push(t);
            }
            let remaining = uniqueTargets.length;
            if (remaining === 0) {
                onComplete?.();
                return;
            }
            const finishOne = () => {
                remaining--;
                if (remaining <= 0) onComplete?.();
            };
            for (const t of uniqueTargets) {
                this.playLandEffect(t.row, t.col, finishOne);
            }
        },

        runPostLockLandingFlow(
            targets: { row: number; col: number }[],
            hintReason: string,
            options: { grantLargePlacementBonus?: boolean; resetIdleHint?: boolean } = {},
        ) {
            if (options.grantLargePlacementBonus) {
                this.tryGrantLargePlacementBonus(targets.length);
            }
            this.checkColorCompletion();
            const boardComplete = this.boardModel.isAllLocked();
            if (!boardComplete) {
                this.flushPendingColorCompleteEffects();
            }
            this.checkGuideStepComplete();
            if (options.resetIdleHint) {
                this.resetIdleHintTimer();
            }
            if (boardComplete) {
                this.clearEndgameHints(false);
                this.playPatternCompleteThenWin();
            } else {
                this.refreshEndgameHints(hintReason);
            }
        },

        onFlyAllLanded(targets: { row: number; col: number }[]) {
            for (const t of targets || []) {
                this.releaseFlyingTargetKey(`${t.row},${t.col}`);
            }
            this.clearForcedSkillHiddenState();
            this._lastPlacedCells = null;
            this.renderBoardCells(targets);
            this.runPostLockLandingFlow(targets, 'fly-all-landed', { grantLargePlacementBonus: true, resetIdleHint: true });
        },

        tryGrantLargePlacementBonus(beanCount: number) {
            const bonusCfg = ECONOMY_NUMERIC_TABLE.reward;
            if (beanCount < bonusCfg.largePlacementBeanThreshold || bonusCfg.largePlacementGoldBonus <= 0) {
                return;
            }
            this.addGold(bonusCfg.largePlacementGoldBonus);
        },

        /** 放置完成后的清理 + 渲染 + 动画 */
        finishPlace() {
            this.isSelected = false;
            this.currentBlock = null;
            this._selectedSlotIndices = [];
            this.clearDragNodes();
            this.stopPulseTweens();
            this.clearSelectionOverlay();
            this.clearIdleHint();
        
            // 恢复格子位置（浮起的要复原）
            this.resetCellPositions();
            this.resetSlotPositions();
        
            this.renderBoard();
            this.renderSlots();
            this.resetIdleHintTimer();

            const finishAfterLanding = () => {
                this.checkColorCompletion();
                const boardComplete = this.boardModel.isAllLocked();
                if (!boardComplete) {
                    this.flushPendingColorCompleteEffects();
                }
                this.checkGuideStepComplete();
                if (boardComplete) {
                    this.clearEndgameHints(false);
                    this.playPatternCompleteThenWin();
                } else {
                    this.refreshEndgameHints('finish-place');
                }
            };
        
            // 沉下去动画
            if (this._lastPlacedCells && this._lastPlacedCells.length > 0) {
                const placedCells = this._lastPlacedCells.slice();
                let remainingLandEffects = placedCells.length;
                const finishOneLandEffect = () => {
                    remainingLandEffects--;
                    if (remainingLandEffects <= 0) finishAfterLanding();
                };
                for (const cell of placedCells) {
                    this.playLandEffect(cell.row, cell.col, finishOneLandEffect);
                }
                this._lastPlacedCells = null;
                return;
            }

            finishAfterLanding();
        },

        stopPulseTweens() {
            for (const t of this._pulseTweens) t.stop();
            this._pulseTweens.length = 0;
        },

        checkColorCompletion() {
            const bm = this.boardModel;
            const skipColorCompleteAudio = bm.isAllLocked();
            for (const cid of bm.getColorIds()) {
                if (this._completedColors.has(cid)) continue;
                if (bm.isColorComplete(cid)) {
                    this._completedColors.add(cid);
                    this.enqueueColorCompleteEffect(cid, !skipColorCompleteAudio);
                }
            }
        },

        resetCellPositionsExcept(excludedCells: { row: number; col: number }[] = []) {
            const excluded = new Set((excludedCells || []).map((cell) => `${cell.row},${cell.col}`));
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
            for (let r = 0; r < bh; r++) {
                for (let c = 0; c < bw; c++) {
                    if (excluded.has(`${r},${c}`)) continue;
                    const cellNode = this.cellNodes[r]?.[c];
                    if (!cellNode) continue;
                    Tween.stopAllByTarget(cellNode);
                    const origX = (c - bw / 2 + 0.5) * (this.cellSize + this.cellGap);
                    const origY = ((bh / 2 - 0.5) - r) * (this.cellSize + this.cellGap);
                    cellNode.setPosition(origX, origY);
                    cellNode.setScale(1, 1, 1);
                }
            }
        },

        /** 恢复所有格子到原始位置和缩放 */
        resetCellPositions() {
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
            for (let r = 0; r < bh; r++) {
                for (let c = 0; c < bw; c++) {
                    const cellNode = this.cellNodes[r]?.[c];
                    if (!cellNode) continue;
                    Tween.stopAllByTarget(cellNode);
                    const origX = (c - bw / 2 + 0.5) * (this.cellSize + this.cellGap);
                    const origY = ((bh / 2 - 0.5) - r) * (this.cellSize + this.cellGap);
                    cellNode.setPosition(origX, origY);
                    cellNode.setScale(1, 1, 1);
                }
            }
        },

        resetSlotPositions() {
            for (let i = 0; i < this.slotNodes.length; i++) {
                const slotNode = this.slotNodes[i];
                if (!slotNode) continue;
                Tween.stopAllByTarget(slotNode);
                const slotPos = this.getSlotLocalPosition(i);
                slotNode.setPosition(slotPos.x, slotPos.y, slotPos.z);
                slotNode.setScale(1, 1, 1);
                const beanNode = slotNode.getChildByName('Bean');
                if (beanNode) {
                    Tween.stopAllByTarget(beanNode);
                    beanNode.setPosition(0, 0, 0);
                    beanNode.setScale(1, 1, 1);
                }
            }
        },

        clearDragNodes() {
            for (const n of this.dragNodes) {
                Tween.stopAllByTarget(n);
                n.destroy();
            }
            this.dragNodes = [];
        },

        /** 取消选中：清除高亮，带动画恢复格子状态 */
        cancelSelection() {
            this.clearDragNodes();
        
            // 先保存浮起的格子/槽位索引（clearSelectionOverlay 会清空它们）
            const floatingCells = [...this._floatingCells];
            const floatingSlots = [...this._floatingSlots];
        
            this.stopPulseTweens();
            this.clearSelectionOverlay();
            this.clearIdleHint();
        
            // 带动画归位浮起的棋盘格子
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
            for (const cell of floatingCells) {
                const cellNode = this.cellNodes[cell.row]?.[cell.col];
                if (!cellNode) continue;
                Tween.stopAllByTarget(cellNode);
                const origX = (cell.col - bw / 2 + 0.5) * (this.cellSize + this.cellGap);
                const origY = ((bh / 2 - 0.5) - cell.row) * (this.cellSize + this.cellGap);
                tween(cellNode)
                    .to(0.18, {
                        position: new Vec3(origX, origY, 0),
                        scale: new Vec3(1, 1, 1)
                    }, { easing: 'backOut' })
                    .start();
            }
        
            // 带动画归位浮起的暂存槽
            for (const idx of floatingSlots) {
                const slotNode = this.slotNodes[idx];
                if (!slotNode) continue;
                Tween.stopAllByTarget(slotNode);
                const slotPos = this.getSlotLocalPosition(idx);
                slotNode.setPosition(slotPos.x, slotPos.y, slotPos.z);
                slotNode.setScale(1, 1, 1);
                const beanNode = slotNode.getChildByName('Bean');
                if (!beanNode) continue;
                Tween.stopAllByTarget(beanNode);
                tween(beanNode)
                    .to(0.18, {
                        position: new Vec3(0, 0, 0),
                        scale: new Vec3(1, 1, 1)
                    }, { easing: 'backOut' })
                    .start();
            }
        
            this.isSelected = false;
            this.currentBlock = null;
            this._selectedSlotIndices = [];
            this.renderBoard();
            this.renderSlots();
            this.resetIdleHintTimer();
            this.refreshEndgameHints('cancel-selection');
        },

        /** 清理选中叠加层 */
        clearSelectionOverlay() {
            for (const node of this._selectionOverlayNodes) {
                if (node && node.isValid) {
                    Tween.stopAllByTarget(node);
                    node.destroy();
                }
            }
            this._selectionOverlayNodes = [];
            this._floatingCells = [];
            this._floatingSlots = [];
        },

        // ==================== 倒计时 / 胜负 ====================

        refreshFreezeTimerLabel() {
            if (!this.timerLabel || this._currentLevelUnlimitedTime) return;
            this.timerLabel.string = this.formatTime(this.timeRemain);
            this.timerLabel.color = new Color('#2E8EEA');
            const ln = this.timerLabel.node;
            Tween.stopAllByTarget(ln);
            ln.setScale(1, 1, 1);
        },

        tickFreezeTimer(): boolean {
            const freezeLeft = Math.max(0, Math.floor(Number(this._freezeTimeLeft) || 0));
            if (freezeLeft <= 0) return false;
            this._freezeTimeLeft = Math.max(0, freezeLeft - 1);
            if (this._freezeTimeLeft <= 0) {
                this._freezeTimeTotal = 0;
                this.stopFreezeSpineFx?.(true);
            } else {
                this.refreshFreezeTimerLabel();
            }
            return true;
        },
        
        tickTimer() {
            if (this.isGameEnd) return;
            if (this._currentLevelUnlimitedTime) return;
            if (this._timerPauseRefs > 0) return;
            if (this.tickFreezeTimer()) return;
            this.timeRemain--;
            if (this.timerLabel) {
                this.timerLabel.string = this.formatTime(this.timeRemain);
                if (this.timeRemain <= 30) {
                    this.timerLabel.color = new Color('#D73D2B');
                } else {
                    this.timerLabel.color = new Color('#2E241A');
                }
                if (this.timeRemain <= 10 && this.timeRemain > 0) {
                    const ln = this.timerLabel.node;
                    Tween.stopAllByTarget(ln);
                    ln.setScale(1, 1, 1);
                    tween(ln)
                        .to(0.08, { scale: new Vec3(1.18, 1.18, 1) })
                        .to(0.1, { scale: new Vec3(1, 1, 1) })
                        .start();
                }
            }
            this.checkAdRewardTimedHints?.();
            if (this.timeRemain > 0 && this.timeRemain <= 5) AudioMgr.inst.play('tick');
            if (this.timeRemain <= 0) {
                if (this.boardModel?.isAllLocked?.()) {
                    this.playPatternCompleteThenWin();
                    return;
                }
                this.gameLose();
            }
        },

        /** 首次选中豆豆时启动倒计时；重选时也检查并恢复暂停的计时器 */
        ensureTimerStarted() {
            if (!this._timerStarted) {
                this._timerStarted = true;
                if (!this._currentLevelUnlimitedTime) {
                    this.trackFirstLevelFunnel('timer_started', {
                        source: this._guideStep >= 0 ? 'tutorial' : 'free_play',
                    });
                    if (!this._adTimerSuspended) {
                        this.schedule(this.tickTimer, 1);
                    }
                    this.checkAdRewardTimedHints?.();
                }
            }
            if (!this._timerLockedForProp && this._timerPauseRefs > 0) {
                this.clearRuntimeOwners?.('timer');
                this._timerPauseRefs = 0;
                runtimeLog('[Timer] resumed via bean reselection');
            }
        },

        shouldPauseTimerForFinalSecondProp() {
            if (this.isGameEnd || this._currentLevelUnlimitedTime) return false;
            const remaining = Number(this.timeRemain) || 0;
            return remaining > 0 && remaining <= 1;
        },

        pauseTimerForFinalSecondProp() {
            if (!this.shouldPauseTimerForFinalSecondProp()) return false;
            if (this._skillTimerPauseToken) return true;
            this._skillTimerPauseToken = this.pauseTimerForProp('skill-prop');
            return true;
        },

        resumeSkillTimerPause(): void {
            const token = String(this._skillTimerPauseToken || '');
            this._skillTimerPauseToken = '';
            if (!token) return;
            this.resumeTimerForProp(token);
        },

        pauseTimerForProp(owner: string = 'prop'): string {
            const token = this.acquireRuntimeOwner?.('timer', owner) || `timer:legacy:${Date.now()}:${owner}`;
            this._timerPauseRefs = typeof this.getRuntimeOwnerCount === 'function'
                ? this.getRuntimeOwnerCount('timer')
                : Math.max(0, Number(this._timerPauseRefs) || 0) + 1;
            this._timerLockedForProp = this._timerPauseRefs > 0;
            runtimeLog('[Timer] pauseTimerForProp, refs:', this._timerPauseRefs, 'owner:', owner);
            return token;
        },

        resumeTimerForProp(tokenOrOwner: string = 'prop') {
            if (String(tokenOrOwner || '').startsWith('timer:')) {
                this.releaseRuntimeOwner?.(tokenOrOwner);
            } else {
                this.releaseRuntimeOwnerByName?.('timer', tokenOrOwner);
            }
            this._timerPauseRefs = typeof this.getRuntimeOwnerCount === 'function'
                ? this.getRuntimeOwnerCount('timer')
                : Math.max(0, Math.floor(Number(this._timerPauseRefs) || 0) - 1);
            this._timerLockedForProp = this._timerPauseRefs > 0;
            runtimeLog('[Timer] resumeTimerForProp, refs:', this._timerPauseRefs, 'owner:', tokenOrOwner);
        },
    });
}
