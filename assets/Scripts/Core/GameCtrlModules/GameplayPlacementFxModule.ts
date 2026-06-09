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

type SlotSnapshotEntry = {
    slotIndex: number;
    colorId: number;
    cells: { row: number; col: number }[];
};

type FlyPlaceVisualOptions = {
    sourceBeanSize?: number;
    targetBeanSize?: number;
};

export function installGameplayPlacementFxModule(target: any): void {
    Object.assign(target, {
        /** 第二次点击：放置选中的豆豆块（暂存槽优先） */
        handlePlace(worldPos: Vec3) {
            const block = this.currentBlock!;
        
            // 暂存槽优先：尝试放到暂存槽
            if (this.isSlotAreaInteractive()) {
                const slotUT = this.slotAreaNode.getComponent(UITransform)!;
                const slotLocal = slotUT.convertToNodeSpaceAR(worldPos);
                if (Math.abs(slotLocal.x) < slotUT.contentSize.width / 2 && Math.abs(slotLocal.y) < slotUT.contentSize.height / 2) {
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
                        this.startFlyToSlots(block.colorId, sources.slice(0, storedSlotIdxs.length), storedSlotIdxs, block.cells);
                    } else {
                        this.playReturnFeedback();
                        this.finishPlace();
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
        startFlyPlace(
            colorId: number,
            sourcesWorld: Vec3[],
            targets: { row: number; col: number }[],
            dirtyBoardCells: { row: number; col: number }[] = [],
            dirtySlotIndices: number[] = [],
            afterAllLanded?: (onComplete: () => void) => void,
            visualOptions?: FlyPlaceVisualOptions,
        ) {
            // 清除浮起节点 + 恢复格子位置
            this.clearDragNodes();
            this.stopPulseTweens();
            this.clearSelectionOverlay();
            this.clearIdleHint();
            this.resetCellPositions();
            this.resetSlotPositions();
            this.isSelected = false;
            this.currentBlock = null;
        
            // 标记目标格为飞行中（渲染时不画豆）
            for (const t of targets) this._flyingTargets.add(`${t.row},${t.col}`);
            this.renderBoardCells([...dirtyBoardCells, ...targets]);
            this.renderSlotIndices(dirtySlotIndices);
        
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            const FLY_DELAY = 0.028;
            const FLY_GROW_DUR = 0.09;
            const FLY_MOVE_DUR = 0.11;
            const defaultTargetBeanSize = this.getBoardBeanVisualSize();
            const targetBeanSize = Math.max(1, visualOptions?.targetBeanSize ?? defaultTargetBeanSize);
            const sourceBeanSize = Math.max(1, visualOptions?.sourceBeanSize ?? targetBeanSize);
            const useSourceSizeTransition = !!visualOptions?.sourceBeanSize && Math.abs(sourceBeanSize - targetBeanSize) > 0.5;
            const sourceScale = sourceBeanSize / targetBeanSize;
            const landFrameBudget = this.getPlaceGlowFrameBudget(targets.length);
            let remaining = targets.length;
            const finishAfterAllLanded = () => {
                const finish = () => this.onFlyAllLanded(targets);
                if (afterAllLanded) afterAllLanded(finish);
                else finish();
            };
            if (remaining === 0) {
                finishAfterAllLanded();
                return;
            }
        
            for (let i = 0; i < targets.length; i++) {
                const t = targets[i];
                const cellNode = this.cellNodes[t.row]?.[t.col];
                if (!cellNode) {
                    this._flyingTargets.delete(`${t.row},${t.col}`);
                    this.renderBoardCell(t.row, t.col);
                    remaining--;
                    if (remaining <= 0) finishAfterAllLanded();
                    continue;
                }
                const targetWorld = cellNode.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
                const srcWorld = sourcesWorld[i] || sourcesWorld[sourcesWorld.length - 1] || targetWorld;
                const srcLocal = layerUT.convertToNodeSpaceAR(srcWorld);
        
                const bean = this.acquireFlyBeanNode(
                    'FlyBean',
                    targetBeanSize,
                    this.getBeanSpriteFrame(colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(srcLocal.x, srcLocal.y, 0);
                bean.setScale(
                    useSourceSizeTransition ? sourceScale : 0.96,
                    useSourceSizeTransition ? sourceScale : 0.96,
                    1,
                );

                let flyTween = tween(bean).delay(i * FLY_DELAY);
                if (useSourceSizeTransition) {
                    flyTween = flyTween.to(FLY_GROW_DUR + FLY_MOVE_DUR, {
                        position: new Vec3(targetLocal.x, targetLocal.y, 0),
                        scale: new Vec3(1, 1, 1),
                    }, { easing: 'circOut' });
                } else {
                    flyTween = flyTween
                        .to(FLY_GROW_DUR, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                        .to(FLY_MOVE_DUR, {
                            position: new Vec3(targetLocal.x, targetLocal.y, 0),
                            scale: new Vec3(1, 1, 1),
                        }, { easing: 'circOut' });
                }

                flyTween
                    .call(() => {
                        AudioMgr.inst.play('place');
                        AudioMgr.inst.vibrate(30);
                        this.recycleFlyBeanNode(bean);
                        this._flyingTargets.delete(`${t.row},${t.col}`);
                        this.renderBoardCell(t.row, t.col);
                        this.playLandEffect(t.row, t.col, landFrameBudget);
                        remaining--;
                        if (remaining <= 0) {
                            finishAfterAllLanded();
                        }
                    })
                    .start();
            }
        },

        /** 飞向暂存槽：源→slot 位置；动画期间对应 slot 隐藏占位 */
        startFlyToSlots(colorId: number, sourcesWorld: Vec3[], slotIdxs: number[], dirtyBoardCells: { row: number; col: number }[] = []) {
            this.prepareSkillMoveAnimation();
            this.clearSelectionOverlay();
            this._lastPlacedCells = null;
        
            const hidden = new Set<number>(slotIdxs);
            this.renderBoardCells(dirtyBoardCells);
            // 同色插入会把后续已占用槽整体右移；这里必须先全量重绘一遍槽区，
            // 否则被挪动的豆子要等到下一次交互触发刷新才会重新出现。
            this.renderSlotsWithHidden(hidden);
        
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            const FLY_DELAY = 0.028;
            const FLY_GROW_DUR = 0.09;
            const FLY_MOVE_DUR = 0.11;
            let remaining = slotIdxs.length;
            if (remaining === 0) { this.finishPlace(); return; }
        
            for (let i = 0; i < slotIdxs.length; i++) {
                const slotNode = this.slotNodes[slotIdxs[i]];
                if (!slotNode) { remaining--; continue; }
                const targetWorld = slotNode.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
                const srcWorld = sourcesWorld[i] || sourcesWorld[sourcesWorld.length - 1] || targetWorld;
                const srcLocal = layerUT.convertToNodeSpaceAR(srcWorld);
        
                const bean = this.acquireFlyBeanNode(
                    'FlyBean',
                    // 从棋盘飞入暂存槽的临时豆豆按棋盘尺寸；槽内最终尺寸由 SlotShell/Bean 单独控制。
                    this.getBoardBeanVisualSize(),
                    this.getBeanSpriteFrame(colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(srcLocal.x, srcLocal.y, 0);
                bean.setScale(0.96, 0.96, 1);
        
                tween(bean)
                    .delay(i * FLY_DELAY)
                    .to(FLY_GROW_DUR, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                    .to(FLY_MOVE_DUR, {
                        position: new Vec3(targetLocal.x, targetLocal.y, 0),
                        scale: new Vec3(1, 1, 1),
                    }, { easing: 'circOut' })
                    .call(() => {
                        AudioMgr.inst.play('slot');
                        AudioMgr.inst.vibrate(30);
                        this.recycleFlyBeanNode(bean);
                        hidden.delete(slotIdxs[i]);
                        this.renderSlotIndices([slotIdxs[i]], hidden);
                        remaining--;
                        if (remaining <= 0) {
                            this.renderBoardCells(dirtyBoardCells);
                            this.checkGuideStepComplete();
                            this.resetIdleHintTimer();
                            if (this.boardModel.isAllLocked()) {
                                this.clearEndgameHints(false);
                                this.gameWin();
                            } else {
                                this.refreshEndgameHints('slot-landed');
                            }
                        }
                    })
                    .start();
            }
        },

        onFlyDone(targets: { row: number; col: number }[]) {
            const dirtySlotIndices = Array.from(this._hiddenSlotIndices);
            this._flyingTargets.clear();
            this.clearForcedSkillHiddenState();
            this._lastPlacedCells = null;
            this.renderBoardCells(targets);
            if (dirtySlotIndices.length > 0) this.renderSlotIndices(dirtySlotIndices);
            else this.renderSlots();
            const landFrameBudget = this.getPlaceGlowFrameBudget(targets.length);
            for (const t of targets) {
                this.playLandEffect(t.row, t.col, landFrameBudget);
            }
            this.tryGrantLargePlacementBonus(targets.length);
            this.checkColorCompletion();
            this.checkGuideStepComplete();
            if (this.boardModel.isAllLocked()) {
                this.clearEndgameHints(false);
                this.gameWin();
            } else {
                this.refreshEndgameHints('fly-done');
            }
        },

        getPlaceGlowFrameBudget(affectedCells: number): number {
            const count = Math.max(1, Math.floor(Number(affectedCells) || 1));
            return count <= 1 ? 24 : count <= 4 ? 18 : count <= 12 ? 14 : count <= 24 ? 12 : 10;
        },

        sampleEffectFrames(frames: SpriteFrame[], frameBudget: number): SpriteFrame[] {
            const budget = Math.max(1, Math.floor(Number(frameBudget) || frames.length));
            if (budget >= frames.length) return frames;
            if (budget === 1) return [frames[frames.length - 1] || frames[0]];
            const sampled: SpriteFrame[] = [];
            const maxIndex = frames.length - 1;
            let lastIndex = -1;
            for (let i = 0; i < budget; i++) {
                const index = Math.min(maxIndex, Math.max(0, Math.round(i * maxIndex / (budget - 1))));
                if (index === lastIndex) continue;
                sampled.push(frames[index]);
                lastIndex = index;
            }
            return sampled;
        },

        playFrameEffectAt(worldPos: Vec3, prefix: string, frameCount: number, size: number, frameInterval: number, angle: number = 0, frameBudget: number = frameCount) {
            const sourceFrames = this.getEffectFrames(prefix, frameCount);
            const frames = this.sampleEffectFrames(sourceFrames, frameBudget);
            if (frames.length === 0 || this._activeFrameFxCount >= MAX_CONCURRENT_FRAME_EFFECTS) {
                return;
            }
            PerformanceMgr.inst.markUserActivity();
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            const localPos = layerUT.convertToNodeSpaceAR(worldPos);
            const { node: fx, sprite: sp, opacity: uo } = this.acquireEffectNode(this._frameFxPool, prefix, size);
            this._activeFrameFxCount += 1;
            this.dragLayer.addChild(fx);
            fx.setPosition(localPos.x, localPos.y, 0);
            fx.angle = angle;
            fx.setScale(0.5, 0.5, 1);
        
            // 使用 tween 链逐帧播放，比 scheduleOnce 更稳定
            const totalFrames = frames.length;
            let chain = tween(fx);
        
            // 第一帧立即显示
            chain = chain.call(() => {
                if (fx.isValid) {
                    sp.spriteFrame = frames[0];
                    fx.setScale(0.5, 0.5, 1);
                }
            });
        
            for (let i = 1; i < totalFrames; i++) {
                const frame = frames[i];
                const s = 0.5 + (i / totalFrames) * 1.0;
                chain = chain
                    .delay(frameInterval)
                    .call(() => {
                        if (fx.isValid) {
                            sp.spriteFrame = frame;
                            fx.setScale(s, s, 1);
                        }
                    });
            }
        
            // 动画结束：放大 + 淡出后销毁
            chain = chain
                .delay(frameInterval)
                .parallel(
                    tween(fx).to(0.15, { scale: new Vec3(1.8, 1.8, 1) }),
                    tween(uo).to(0.15, { opacity: 0 }),
                )
                .call(() => {
                    sp.spriteFrame = null;
                    this._activeFrameFxCount = Math.max(0, this._activeFrameFxCount - 1);
                    this.recycleEffectNode(this._frameFxPool, fx);
                });
        
            chain.start();
        },

        playBrightFlashAt(worldPos: Vec3, size: number, peakOpacity: number = 210) {
            const bright = this.getBrightSpriteFrame();
            if (!bright) return;
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

        playLandEffect(row: number, col: number, frameBudget: number = this.getPlaceGlowFrameBudget(1)) {
            const cn = this.cellNodes[row]?.[col];
            if (!cn) return;
            Tween.stopAllByTarget(cn);
            cn.setScale(1.15, 1.15, 1);
            tween(cn)
                .to(0.1, { scale: new Vec3(0.95, 0.95, 1) }, { easing: 'sineIn' })
                .to(0.08, { scale: new Vec3(1.0, 1.0, 1) })
                .start();
            this.playPlaceGlow(cn, 0.035, 210, frameBudget);
        },

        onFlyAllLanded(targets: { row: number; col: number }[]) {
            this._flyingTargets.clear();
            this.clearForcedSkillHiddenState();
            this._lastPlacedCells = null;
            this.renderBoardCells(targets);
            this.tryGrantLargePlacementBonus(targets.length);
            this.checkColorCompletion();
            this.checkGuideStepComplete();
            this.resetIdleHintTimer();
            if (this.boardModel.isAllLocked()) {
                this.clearEndgameHints(false);
                this.gameWin();
            } else {
                this.refreshEndgameHints('fly-all-landed');
            }
        },

        tryGrantLargePlacementBonus(beanCount: number) {
            const bonusCfg = ECONOMY_NUMERIC_TABLE.reward;
            if (beanCount < bonusCfg.largePlacementBeanThreshold || bonusCfg.largePlacementGoldBonus <= 0) {
                return;
            }
            this.addGold(bonusCfg.largePlacementGoldBonus);
            this.showToastBelowTimer(`单次归位${beanCount}豆，奖励 +${bonusCfg.largePlacementGoldBonus} 金币`, 1.8);
        },

        /** 归位闪光特效：block_finish 帧动画播放（完成效果） */
        playPlaceGlow(
            cellNode: Node,
            frameInterval: number = 0.035,
            flashOpacity: number = 210,
            frameBudget: number = this.getPlaceGlowFrameBudget(1),
        ) {
            const ut = cellNode.getComponent(UITransform)!;
            const worldPos = ut.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            this.playBrightFlashAt(worldPos, this.cellSize + 18, flashOpacity);
            this.playFrameEffectAt(worldPos, 'block_finish-animation_', 26, this.cellSize + 42, frameInterval, 0, frameBudget);
        },

        getWinGlowFrameInterval(cellCount: number): number {
            if (cellCount >= 60) return WIN_GLOW_FAST_INTERVAL_LARGE;
            if (cellCount >= 28) return WIN_GLOW_FAST_INTERVAL_MEDIUM;
            return WIN_GLOW_FAST_INTERVAL_SMALL;
        },

        getWinGlowWaveIndex(row: number, col: number, bw: number, bh: number, waveCount: number): number {
            const maxDiagonal = Math.max(1, bw + bh - 2);
            const diagonalProgress = (row + col) / maxDiagonal;
            return Math.min(waveCount - 1, Math.max(0, Math.round(diagonalProgress * (waveCount - 1))));
        },

        /**
         * 通关扫光改为分波次并发，保留从左上到右下的视觉方向感，
         * 同时避免豆豆很多时因为逐颗排队而把节奏拖慢。
         */
        playWinBoardGlowSweep(
            lockedCells: { row: number; col: number }[],
            bw: number,
            bh: number,
        ): number {
            if (lockedCells.length === 0) return 0;
        
            const frameInterval = this.getWinGlowFrameInterval(lockedCells.length);
            const frameBudget = this.getPlaceGlowFrameBudget(lockedCells.length);
            const flashOpacity = lockedCells.length >= 60 ? 170 : 190;
            const desiredWaveCount = Math.ceil(Math.sqrt(lockedCells.length / 2));
            const waveCount = Math.max(
                1,
                Math.min(
                    lockedCells.length,
                    Math.max(WIN_GLOW_MIN_WAVES, Math.min(WIN_GLOW_MAX_WAVES, desiredWaveCount)),
                ),
            );
            const waves: Array<Array<{ row: number; col: number }>> = Array.from({ length: waveCount }, () => []);
            for (const cell of lockedCells) {
                const waveIndex = this.getWinGlowWaveIndex(cell.row, cell.col, bw, bh, waveCount);
                waves[waveIndex].push(cell);
            }
        
            let lastWaveDelay = 0;
            for (let waveIndex = 0; waveIndex < waves.length; waveIndex++) {
                const wave = waves[waveIndex];
                if (wave.length === 0) continue;
                const delay = waveIndex * WIN_GLOW_WAVE_STEP;
                lastWaveDelay = delay;
                this.scheduleOnce(() => {
                    for (const { row, col } of wave) {
                        const cellNode = this.cellNodes[row]?.[col];
                        if (!cellNode) continue;
                        this.playPlaceGlow(cellNode, frameInterval, flashOpacity, frameBudget);
                    }
                }, delay);
            }
        
            return lastWaveDelay + frameInterval * frameBudget + WIN_GLOW_POST_DELAY;
        },

        /** 放置完成后的清理 + 渲染 + 动画 */
        finishPlace() {
            this.isSelected = false;
            this.currentBlock = null;
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
        
            // 沉下去动画
            if (this._lastPlacedCells && this._lastPlacedCells.length > 0) {
                const frameBudget = this.getPlaceGlowFrameBudget(this._lastPlacedCells.length);
                for (const cell of this._lastPlacedCells) {
                    const cellNode = this.cellNodes[cell.row]?.[cell.col];
                    if (!cellNode) continue;
                    cellNode.setScale(1.2, 1.2, 1);
                    tween(cellNode)
                        .to(0.08, { scale: new Vec3(0.92, 0.92, 1) }, { easing: 'sineIn' })
                        .to(0.06, { scale: new Vec3(1.05, 1.05, 1) })
                        .to(0.06, { scale: new Vec3(1, 1, 1) })
                        .start();
                    this.playPlaceGlow(cellNode, 0.035, 210, frameBudget);
                }
                this._lastPlacedCells = null;
            }
        
            this.checkColorCompletion();
            this.checkGuideStepComplete();
            if (this.boardModel.isAllLocked()) {
                this.clearEndgameHints(false);
                this.gameWin();
            } else {
                this.refreshEndgameHints('finish-place');
            }
        },

        stopPulseTweens() {
            for (const t of this._pulseTweens) t.stop();
            this._pulseTweens.length = 0;
        },

        checkColorCompletion() {
            const bm = this.boardModel;
            for (const cid of bm.getColorIds()) {
                if (this._completedColors.has(cid)) continue;
                if (bm.isColorComplete(cid)) {
                    this._completedColors.add(cid);
                    this.playColorCompleteEffect(cid);
                }
            }
        },

        /** 单色完成特效：对应 pin-dou-dou 的 _playWinColorIfNeeded + _playColorCompletedAni */
        playColorCompleteEffect(colorId: number) {
            const bm = this.boardModel;
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
        
            // 收集该色的所有格子
            const cells: { row: number; col: number }[] = [];
            for (let r = 0; r < bh; r++)
                for (let c = 0; c < bw; c++)
                    if (bm.correctColors[r][c] === colorId)
                        cells.push({ row: r, col: c });
        
            // 单色完成：只播放普通 place 音效（简化）
            AudioMgr.inst.play('winColor');
            AudioMgr.inst.vibrate(40);
        
            // 颜色完成帧动画：每格依次播放完成特效，不再改动格子缩放
            const effectDelayStep = cells.length > MAX_CONCURRENT_FRAME_EFFECTS ? 0.055 : 0.03;
            const frameBudget = this.getPlaceGlowFrameBudget(cells.length);
            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                const cn = this.cellNodes[cell.row]?.[cell.col];
                if (!cn) continue;
        
                // 只播放完成帧动画，避免同色完成时整片格子缩放跳动
                this.scheduleOnce(() => {
                    const worldPos = cn.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                    this.playFrameEffectAt(worldPos, 'block_finish-animation_', 26, this.cellSize + 42, 0.022, 0, frameBudget);
                }, i * effectDelayStep);
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
            for (const n of this.dragNodes) n.destroy();
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

        /** 从暂存槽移除选中的豆豆块（放置前调用） */
        captureSelectedSlotSnapshot(): SlotSnapshotEntry[] {
            const snapshot: SlotSnapshotEntry[] = [];
            for (const slotIndex of this._selectedSlotIndices) {
                const slotBlock = this.slotModel.getBlock(slotIndex);
                if (!slotBlock) {
                    throw new Error(`[GameplaySlot] Selected slot ${slotIndex} is empty before placement`);
                }
                snapshot.push({
                    slotIndex,
                    colorId: slotBlock.colorId,
                    cells: slotBlock.cells.map((cell: { row: number; col: number }) => ({ row: cell.row, col: cell.col })),
                });
            }
            if (snapshot.length === 0) {
                throw new Error('[GameplaySlot] Missing selected slot snapshot before placement');
            }
            return snapshot;
        },

        removeBlockFromSlots() {
            for (const idx of this._selectedSlotIndices) {
                this.slotModel.take(idx);
            }
            this.slotModel['compact']();
            this.renderSlots();
        },

        removeBlockFromSlotsKeepingGaps() {
            for (const idx of this._selectedSlotIndices) {
                this.slotModel.take(idx);
            }
            this.renderSlots();
        },

        compactSlotsAfterSelectionConsume(onComplete?: () => void) {
            const beforeSlots = this.slotModel.getAll().slice();
            const beforeIndexByBlock = new Map<BeanBlockInfo, number>();
            for (let i = 0; i < beforeSlots.length; i++) {
                const block = beforeSlots[i];
                if (block) beforeIndexByBlock.set(block, i);
            }

            this.slotModel['compact']();
            if (!onComplete) {
                this.renderSlots();
                return;
            }

            const afterSlots = this.slotModel.getAll().slice();
            const moves: Array<{ block: BeanBlockInfo; from: number; to: number }> = [];
            for (let to = 0; to < afterSlots.length; to++) {
                const block = afterSlots[to];
                if (!block) continue;
                const from = beforeIndexByBlock.get(block);
                if (typeof from === 'number' && from !== to) {
                    moves.push({ block, from, to });
                }
            }

            const finish = () => {
                this.renderSlots();
                if (onComplete) onComplete();
            };
            if (moves.length === 0 || !this.dragLayer?.isValid) {
                finish();
                return;
            }

            this.renderSlots();

            const layerUT = this.dragLayer.getComponent(UITransform);
            if (!layerUT) {
                finish();
                return;
            }

            const SLOT_COMPACT_MOVE_DUR = 0.22;
            const SLOT_COMPACT_STAGGER = 0.012;
            let remaining = moves.length;
            const markMoveDone = () => {
                remaining--;
                if (remaining <= 0) finish();
            };

            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                const fromNode = this.slotNodes[move.from];
                const toNode = this.slotNodes[move.to];
                const fromUT = fromNode?.getComponent(UITransform) || null;
                const toUT = toNode?.getComponent(UITransform) || null;
                if (!fromNode || !toNode || !fromUT || !toUT) {
                    markMoveDone();
                    continue;
                }

                const sourceWorld = fromUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const targetWorld = toUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const sourceLocal = layerUT.convertToNodeSpaceAR(sourceWorld);
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
                const bean = this.acquireFlyBeanNode(
                    'SlotCompactBean',
                    this.getSlotBeanVisualSize(),
                    this.getBeanSpriteFrame(move.block.colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(sourceLocal.x, sourceLocal.y, 0);
                bean.setScale(1, 1, 1);

                tween(bean)
                    .delay(i * SLOT_COMPACT_STAGGER)
                    .to(SLOT_COMPACT_MOVE_DUR, {
                        position: new Vec3(targetLocal.x, targetLocal.y, 0),
                    }, { easing: 'sineOut' })
                    .call(() => {
                        this.recycleFlyBeanNode(bean);
                        markMoveDone();
                    })
                    .start();
            }
        },

        restoreSlotTailToOriginalSlots(block: BeanBlockInfo, remainingCount: number, selectedSlotSnapshot: SlotSnapshotEntry[]) {
            if (!selectedSlotSnapshot || selectedSlotSnapshot.length === 0) {
                throw new Error('[GameplaySlot] Missing selected slot snapshot for restore');
            }
            if (remainingCount < 0 || remainingCount > block.cells.length) {
                throw new Error(`[GameplaySlot] Invalid remaining count ${remainingCount} for block size ${block.cells.length}`);
            }

            const consumedCount = block.cells.length - remainingCount;
            let cellCursor = 0;
            let restoredCount = 0;

            for (const snapshot of selectedSlotSnapshot) {
                const start = cellCursor;
                const end = start + snapshot.cells.length;
                cellCursor = end;
                if (end <= consumedCount) continue;

                const keepStart = Math.max(consumedCount - start, 0);
                const keptCells = snapshot.cells.slice(keepStart);
                if (keptCells.length === 0) continue;

                const restored = this.slotModel.putAt(snapshot.slotIndex, {
                    colorId: snapshot.colorId,
                    cells: keptCells.map((cell) => ({ row: cell.row, col: cell.col })),
                    isLocked: false,
                    source: 'slot',
                });
                if (!restored) {
                    throw new Error(`[GameplaySlot] Failed to restore slot ${snapshot.slotIndex}`);
                }
                restoredCount += keptCells.length;
            }

            if (restoredCount !== remainingCount) {
                throw new Error(`[GameplaySlot] Restored ${restoredCount} cells, expected ${remainingCount}`);
            }
        },

        /** 将豆豆块恢复到暂存槽原位（放置失败时回退） */
        restoreBlockToSlots(selectedSlotSnapshot: SlotSnapshotEntry[]) {
            const block = this.currentBlock!;
            this.restoreSlotTailToOriginalSlots(block, block.cells.length, selectedSlotSnapshot);
            this.renderSlots();
        },

        // ==================== 倒计时 / 胜负 ====================
        
        tickTimer() {
            if (this.isGameEnd) return;
            if (this._currentLevelUnlimitedTime) return;
            if (this._timerPauseRefs > 0) return;
            this.timeRemain--;
            if (this.timerLabel) {
                this.timerLabel.string = this.formatTime(this.timeRemain);
                if (this.timeRemain <= 30) {
                    this.timerLabel.color = new Color('#D73D2B');
                } else {
                    this.timerLabel.color = new Color('#5A4A3A');
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
            if (this.timeRemain > 0 && this.timeRemain <= 5) AudioMgr.inst.play('tick');
            if (this.timeRemain <= 0) this.gameLose();
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
                }
            }
            if (!this._timerLockedForProp && this._timerPauseRefs > 0) {
                this._timerPauseRefs = 0;
                console.log('[Timer] resumed via bean reselection');
            }
        },

        pauseTimerForProp() {
            this._timerPauseRefs++;
            this._timerLockedForProp = true;
            console.log('[Timer] pauseTimerForProp, refs:', this._timerPauseRefs);
        },

        resumeTimerForProp() {
            if (this._timerPauseRefs > 0) this._timerPauseRefs--;
            console.log('[Timer] resumeTimerForProp, refs:', this._timerPauseRefs);
        },
    });
}
