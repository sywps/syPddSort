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

export function installTutorialGuideModule(target: any): void {
    Object.assign(target, {
        styleLevel2GuidePrompt(_gb: Graphics | null, bubble: Node, lbl: Label, primaryText: string) {
            if ((this._guideMode === 'level_1' || this._guideMode === 'level_2')
                && typeof this.styleStarterGuidePrompt === 'function') {
                this.styleStarterGuidePrompt(_gb, bubble, lbl, primaryText);
                this.adjustStarterGuidePromptForCurrentStep?.(bubble);
                return;
            }
            bubble.active = true;
            const bg = bubble.getChildByName('BubbleBg');
            if (bg?.isValid) bg.active = true;
            const bubbleUT = bubble.getComponent(UITransform);
            if (bubbleUT) bubbleUT.setContentSize(360, 68);
            const labelUT = lbl.node.getComponent(UITransform);
            if (labelUT) labelUT.setContentSize(288, 136);
            lbl.color = new Color('#5A321E');
            lbl.fontSize = 42;
            lbl.lineHeight = 52;
            lbl.enableWrapText = true;
            const centerY = typeof this.getGuidePromptCenterY === 'function'
                ? this.getGuidePromptCenterY(438, 68)
                : 438;
            bubble.setPosition(0, centerY, 0);
            lbl.string = this.formatLevel2GuidePrompt(primaryText);
        },

        clampGuidePromptCenterY(bubble: Node, centerY: number): number {
            const rootTransform = bubble.parent?.getComponent(UITransform)
                || (typeof this.requireCanvasUiRoot === 'function' ? this.requireCanvasUiRoot('OverlayRoot') : null)?.getComponent(UITransform);
            const bubbleHeight = bubble.getComponent(UITransform)?.contentSize.height || 154;
            const visibleHalfH = rootTransform ? rootTransform.contentSize.height / 2 : 640;
            const margin = 12;
            return Math.max(-visibleHalfH + bubbleHeight / 2 + margin, Math.min(centerY, visibleHalfH - bubbleHeight / 2 - margin));
        },

        getGuidePromptNodeBounds(node: Node | null, bubble: Node): { bottom: number; top: number; centerY: number } | null {
            const targetUT = node?.getComponent(UITransform);
            const parentUT = bubble.parent?.getComponent(UITransform)
                || (typeof this.requireCanvasUiRoot === 'function' ? this.requireCanvasUiRoot('OverlayRoot') : null)?.getComponent(UITransform);
            if (!node?.isValid || !targetUT || !parentUT) return null;
            const targetWorldScale = node.getWorldScale(new Vec3());
            const parentWorldScale = (bubble.parent || this._guideLayer?.parent || node.parent)?.getWorldScale(new Vec3()) || new Vec3(1, 1, 1);
            const scaleY = Math.max(0.0001, Math.abs(targetWorldScale.y || 1) / Math.abs(parentWorldScale.y || 1));
            const worldCenter = targetUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const center = parentUT.convertToNodeSpaceAR(worldCenter);
            const halfH = targetUT.contentSize.height * scaleY / 2;
            return {
                bottom: center.y - halfH,
                top: center.y + halfH,
                centerY: center.y,
            };
        },

        getGuidePromptCellsBounds(cells: { row: number; col: number }[], bubble: Node): { bottom: number; top: number; centerY: number } | null {
            const parentUT = bubble.parent?.getComponent(UITransform)
                || (typeof this.requireCanvasUiRoot === 'function' ? this.requireCanvasUiRoot('OverlayRoot') : null)?.getComponent(UITransform);
            if (!parentUT || !Array.isArray(cells) || cells.length === 0) return null;
            const parentWorldScale = (bubble.parent || this._guideLayer?.parent || this.boardNode?.parent)?.getWorldScale(new Vec3()) || new Vec3(1, 1, 1);
            const parentScaleY = Math.max(0.0001, Math.abs(parentWorldScale.y || 1));
            let minY = Infinity;
            let maxY = -Infinity;
            for (const cell of cells) {
                const nodes = [
                    this.cellNodes[cell.row]?.[cell.col],
                    this.boardSlotBgNodes[cell.row]?.[cell.col],
                ];
                let usedNode = false;
                for (const cellNode of nodes) {
                    const cellUT = cellNode?.getComponent(UITransform);
                    if (!cellNode?.isValid || !cellUT) continue;
                    const world = cellUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                    const local = parentUT.convertToNodeSpaceAR(world);
                    const cellScale = cellNode.getWorldScale(new Vec3());
                    const halfH = cellUT.contentSize.height * Math.abs(cellScale.y || 1) / parentScaleY / 2;
                    minY = Math.min(minY, local.y - halfH);
                    maxY = Math.max(maxY, local.y + halfH);
                    usedNode = true;
                }
                if (!usedNode) {
                    const world = this.getBoardCellWorldPosition?.(cell.row, cell.col) || null;
                    if (!world) continue;
                    const local = parentUT.convertToNodeSpaceAR(world);
                    const half = Math.max(1, Number(this.getBoardBeanVisualSize?.() || this.cellSize || 1)) / 2;
                    minY = Math.min(minY, local.y - half);
                    maxY = Math.max(maxY, local.y + half);
                }
            }
            if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
            return {
                bottom: minY,
                top: maxY,
                centerY: (minY + maxY) / 2,
            };
        },

        getGuideEmptyTargetCellsForPrompt(colorId: number): { row: number; col: number }[] {
            const cells: { row: number; col: number }[] = [];
            const bw = this.levelData?.boardWidth || this.boardModel?.width || 0;
            const bh = this.levelData?.boardHeight || this.boardModel?.height || 0;
            for (let r = 0; r < bh; r++) {
                for (let c = 0; c < bw; c++) {
                    if (this.boardModel.currentColors[r][c] === 0
                        && !this.boardModel.locked[r][c]
                        && this.boardModel.correctColors[r][c] === colorId) {
                        cells.push({ row: r, col: c });
                    }
                }
            }
            return cells;
        },

        getGuidePromptTargetBoundsForCurrentStep(bubble: Node): { bottom: number; top: number; centerY: number; kind: 'slot' | 'board' } | null {
            const step = Math.floor(Number(this._guideStep) || 0);
            if (this._guideMode === 'level_1') {
                if (step === 1 || step === 4) {
                    const bounds = this.getGuidePromptNodeBounds(this.slotAreaNode || null, bubble);
                    return bounds ? { ...bounds, kind: 'slot' } : null;
                }
                if (step === 2) {
                    const block = this.findBlockOnBoard?.(this._guideSecondColorId);
                    const bounds = this.getGuidePromptCellsBounds(block?.cells || [], bubble);
                    return bounds ? { ...bounds, kind: 'board' } : null;
                }
                if (step === 3 || step === 5) {
                    const colorId = step === 3 ? this._guideSecondColorId : this._guideFirstColorId;
                    const bounds = this.getGuidePromptCellsBounds(this.getGuideEmptyTargetCellsForPrompt(colorId), bubble);
                    return bounds ? { ...bounds, kind: 'board' } : null;
                }
                return null;
            }
            if (this._guideMode === 'level_2') {
                if (step === 0) {
                    const bounds = this.getGuidePromptNodeBounds(this.getSlotUnlockGuideTarget?.() || this.slotAreaNode || null, bubble);
                    return bounds ? { ...bounds, kind: 'slot' } : null;
                }
                if (step === 2) {
                    const bounds = this.getGuidePromptNodeBounds(this.slotAreaNode || null, bubble);
                    return bounds ? { ...bounds, kind: 'slot' } : null;
                }
            }
            return null;
        },

        adjustStarterGuidePromptForCurrentStep(bubble: Node) {
            if (this._guideMode !== 'level_1' && this._guideMode !== 'level_2') return;
            const bubbleUT = bubble.getComponent(UITransform);
            if (!bubbleUT) return;
            const target = this.getGuidePromptTargetBoundsForCurrentStep(bubble);
            if (!target) return;
            const currentY = bubble.position.y;
            const bubbleHeight = bubbleUT.contentSize.height || 154;
            const targetGap = target.kind === 'slot' ? 44 : 16;
            const desiredY = target.top + targetGap + bubbleHeight / 2;
            const nextY = target.kind === 'slot'
                ? desiredY
                : Math.min(currentY, desiredY);
            bubble.setPosition(bubble.position.x, this.clampGuidePromptCenterY(bubble, nextY), bubble.position.z);
        },

        /** Step 0: 选中 firstColorId 豆豆块 */
        guideStep0(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findBlockOnBoard(this._guideFirstColorId);
            if (block) {
                this.autoHighlightBlock(block.cells);
                this.startHandGestureOnBlock(block, hand);
            }
        
            this.styleLevel2GuidePrompt(gb, bubble, lbl, '点任意粉色豆豆');
        },

        guideLevel2UnlockStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightSlotUnlockButtonForGuide(hand);
            this.styleLevel2GuidePrompt(gb, bubble, lbl, '解锁下方空位');
        },

        guideLevel2PickBlockStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findBlockOnBoard(this._guideFirstColorId);
            if (block) {
                this.autoHighlightBlock(block.cells);
                this.startHandGestureOnBlock(block, hand);
            }
            this.styleLevel2GuidePrompt(gb, bubble, lbl, '点高亮豆豆');
        },

        guideLevel2PlaceBlockStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightSlotAreaForGuide();
            this.startHandGestureOnSlot(hand);
            this.styleLevel2GuidePrompt(gb, bubble, lbl, '放到空槽里');
        },

        /** Step 1: 点击暂存槽放入（place 阶段） */
        guideStep1(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightSlotAreaForGuide();
            this.startHandGestureOnSlot(hand);
            this.styleLevel2GuidePrompt(gb, bubble, lbl, '放到空槽里');
        },

        /** Step 2: 选中 secondColorId 豆豆块 */
        guideStep2(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findBlockOnBoard(this._guideSecondColorId);
            if (block) {
                this.autoHighlightBlock(block.cells);
                const handTargetOffsetY = this._guideMode === 'level_1' ? -40 : 0;
                this.startHandGestureToBoard(block, hand, handTargetOffsetY);
            }
        
            this.styleLevel2GuidePrompt(gb, bubble, lbl, '点任意黄色豆豆');
        },

        /** Step 3: 点击棋盘目标放置 secondColorId（place 阶段） */
        guideStep3(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightEmptyTarget(this._guideSecondColorId);
            this.startHandGestureOnBoardTarget(this._guideSecondColorId, hand);
            this.styleLevel2GuidePrompt(gb, bubble, lbl, '放回黄色空位');
        },

        /** Step 4: 从暂存槽选中 firstColorId 豆豆 */
        guideStep4(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findSlotBlock(this._guideFirstColorId);
            if (block) {
                this.autoHighlightSlotBeans(this._guideFirstColorId);
                this.startHandGestureOnSlot(hand);
            }
        
            this.styleLevel2GuidePrompt(gb, bubble, lbl, '点槽里的粉色豆豆');
        },

        /** Step 5: 点击棋盘目标放置 firstColorId → 通关（place 阶段） */
        guideStep5(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightEmptyTarget(this._guideFirstColorId);
            this.startHandGestureOnBoardTarget(this._guideFirstColorId, hand);
            this.styleLevel2GuidePrompt(gb, bubble, lbl, '放回粉色空位');
        },

        /** 引导期间触摸处理 */
        handleGuideTap(worldPos: Vec3) {
            if (this._guideInputSuspended) {
                this.reportTutorialTapResult?.(worldPos, 'ignored_suspended', false, 'guide_layer');
                return;
            }
            if (this.tryHandleGuideSystemModalTap?.(worldPos)) {
                this.reportTutorialTapResult?.(worldPos, 'modal_consumed', false, 'guide_layer');
                return;
            }
            if (this._guideStep < 0 || this._guideStep >= this._guideTotalSteps) {
                this.reportTutorialTapResult?.(worldPos, 'ignored_invalid_step', false, 'guide_layer');
                this.advanceTutorial();
                return;
            }
        
            const step = this._guideStep;

            if (this._guideMode === 'level_2' && step === 0) {
                if (this.isSlotUnlockTargetHit(worldPos)) {
                    this.reportTutorialTapResult?.(worldPos, 'hit_target', true, 'guide_layer');
                    this.executeGuideSlotUnlock();
                } else {
                    this.showGuideWrongTargetHint(worldPos);
                }
                return;
            }
        
            if (this._guidePhase === 'select') {
                // 偶数步：选中目标块，成功后直接推进到下一步（放置阶段）
                if (this.isGuideSelectStep(step)) {
                    let selected = false;
                    if (this._guideMode === 'level_1' && !this.shouldGuideSelectFromSlot(step)) {
                        selected = this.trySelectFirstLevelGuideBoardBlock(step, worldPos);
                    } else {
                        selected = this.shouldGuideSelectFromSlot(step)
                            ? this.trySelectSlot(worldPos)
                            : this.trySelectBoard(worldPos);
                    }
                    if (selected && this.currentBlock) {
                        if (this.isCorrectBlockForStep(step, this.currentBlock)) {
                            this.reportTutorialTapResult?.(
                                worldPos,
                                this.getTutorialSelectHitResult?.(worldPos, step) || 'hit_target',
                                true,
                                'guide_layer',
                                {
                                    selectedSource: this.currentBlock.source,
                                    colorId: this.currentBlock.colorId,
                                },
                            );
                            this._guidePhase = 'place';
                            this.advanceTutorial();
                        } else {
                            this.reportTutorialTapResult?.(
                                worldPos,
                                'miss_wrong_block',
                                false,
                                'guide_layer',
                                {
                                    selectedSource: this.currentBlock.source,
                                    colorId: this.currentBlock.colorId,
                                },
                            );
                            this.showGuideWrongTargetHint(worldPos, false);
                            this.cancelSelection();
                        }
                    } else {
                        this.reportTutorialTapResult?.(worldPos, this.getTutorialMissHitResult?.(worldPos) || 'miss_empty', false, 'guide_layer');
                        this.showGuideWrongTargetHint(worldPos, false);
                    }
                }
            } else if (this._guidePhase === 'place') {
                // 奇数步：放置阶段
                if (!this.currentBlock) {
                    this.reportTutorialTapResult?.(worldPos, 'ignored_not_ready', false, 'guide_layer', {
                        ignoreReason: 'no_current_block',
                    });
                    return;
                }
                if (this.isGuideSlotPlaceStep(step)) {
                    if (this.isGuidePlaceTargetHit(worldPos)) {
                        this.reportTutorialTapResult?.(
                            worldPos,
                            'hit_target',
                            true,
                            'guide_layer',
                            {
                                selectedSource: this.currentBlock.source,
                                colorId: this.currentBlock.colorId,
                            },
                        );
                        this.executeGuidePlacement();
                    } else {
                        this.showGuideWrongTargetHint(worldPos);
                    }
                    return;
                }
        
                const target = this._guideMode === 'level_1'
                    ? this.getFirstLevelGuideBoardPlaceTarget(worldPos, this.getGuidePlaceTargetColor(step))
                    : this.getBoardPlaceTargetFromWorldPos(worldPos, this.getGuidePlaceTargetColor(step));
                if (target) {
                    this.reportTutorialTapResult?.(
                        worldPos,
                        this._guideMode === 'level_1' && this.classifyFirstLevelTouchTarget(worldPos) !== 'board' ? 'hit_tolerant_area' : 'hit_target',
                        true,
                        'guide_layer',
                        {
                            selectedSource: this.currentBlock.source,
                            colorId: this.currentBlock.colorId,
                        },
                    );
                    this.executeGuidePlacement(target.row, target.col);
                } else {
                    this.showGuideWrongTargetHint(worldPos);
                }
            } else {
                this.reportTutorialTapResult?.(worldPos, 'ignored_invalid_phase', false, 'guide_layer');
            }
        },

        isGuideSelectStep(step: number): boolean {
            if (this._guideMode === 'level_2') return step === 1;
            return step % 2 === 0;
        },

        isGuideSlotPlaceStep(step: number): boolean {
            return (this._guideMode === 'level_1' && step === 1)
                || (this._guideMode === 'level_2' && step === 2);
        },

        shouldGuideSelectFromSlot(step: number): boolean {
            return this._guideMode === 'level_1' && step === 4;
        },

        getGuidePlaceTargetColor(step: number): number {
            return step === 3 ? this._guideSecondColorId : this._guideFirstColorId;
        },

        isGuidePlaceTargetHit(worldPos: Vec3): boolean {
            const step = this._guideStep;
            // level2 Step 1: 点击暂存槽区域
            if (this.isGuideSlotPlaceStep(step)) {
                const slotUT = this.slotAreaNode.getComponent(UITransform)!;
                const localPos = slotUT.convertToNodeSpaceAR(worldPos);
                const padding = this._guideMode === 'level_1' ? 24 : 0;
                return Math.abs(localPos.x) <= slotUT.contentSize.width / 2 + padding
                    && Math.abs(localPos.y) <= slotUT.contentSize.height / 2 + padding;
            }
            return this.getBoardPlaceTargetFromWorldPos(worldPos, this.getGuidePlaceTargetColor(step)) !== null;
        },

        getSlotUnlockGuideTarget(): Node | null {
            return this.slotAreaNode?.getChildByName('SlotRowLockedBtn')
                || this.slotAreaNode?.children.find((child: Node) => child.name.startsWith('SlotRowLockedBtn_'))
                || null;
        },

        highlightSlotUnlockButtonForGuide(hand: Node) {
            const target = this.getSlotUnlockGuideTarget();
            const targetUT = target?.getComponent(UITransform) || null;
            if (!target || !targetUT) return;

            const layerUT = this._guideLayer!.getComponent(UITransform)!;
            const targetWorld = targetUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
            const w = Math.max(150, targetUT.contentSize.width + 26);
            const h = Math.max(58, targetUT.contentSize.height + 18);

            if (this._guideMode === 'level_1' || this._guideMode === 'level_2') {
                this.showGuideSpriteHighlight('guide_slot_highlight', targetLocal.x, targetLocal.y, w, h, 1.035);
                hand.active = true;
                this.setGuideHandTarget(hand, targetLocal.x, targetLocal.y - 16);
                this.startGuideHandPulse(hand);
                return;
            }

            const hl = new Node('GuideHighlight');
            this._guideLayer!.addChild(hl);
            hl.addComponent(UITransform).setContentSize(w, h);
            hl.layer = Layers.Enum.UI_2D;
            hl.setPosition(targetLocal.x, targetLocal.y);

            const g = hl.addComponent(Graphics);
            g.strokeColor = new Color(255, 100, 100, 235);
            g.lineWidth = 4;
            g.roundRect(-w / 2, -h / 2, w, h, 10);
            g.stroke();
            g.fillColor = new Color(255, 215, 0, 30);
            g.roundRect(-w / 2, -h / 2, w, h, 10);
            g.fill();

            const ht = tween(hl)
                .to(0.4, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                .to(0.4, { scale: new Vec3(0.96, 0.96, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever();
            ht.start();
            this._guidePulseTweens.push(ht);

            hand.active = true;
            this.setGuideHandTarget(hand, targetLocal.x, targetLocal.y - 16);
            this.startGuideHandPulse(hand);
        },

        isSlotUnlockTargetHit(worldPos: Vec3): boolean {
            const target = this.getSlotUnlockGuideTarget();
            const targetUT = target?.getComponent(UITransform) || null;
            if (!target || !targetUT) return this.slotUnlockedRows >= this.slotRowCount;
            const localPos = targetUT.convertToNodeSpaceAR(worldPos);
            return Math.abs(localPos.x) <= targetUT.contentSize.width / 2 + 12
                && Math.abs(localPos.y) <= targetUT.contentSize.height / 2 + 10;
        },

        executeGuideSlotUnlock() {
            const beforeRows = this.slotUnlockedRows;
            if (beforeRows < this.slotRowCount) {
                this.tryUnlockSlotRow();
            }
            if (this.slotUnlockedRows > beforeRows || this.slotUnlockedRows >= this.slotRowCount) {
                this.advanceTutorial();
            } else {
                this.showGuideWrongTargetHint();
            }
        },

        highlightSlotAreaForGuide() {
            const layerUT = this._guideLayer!.getComponent(UITransform)!;
            const slotUT = this.slotAreaNode.getComponent(UITransform)!;
            const slotWorld = slotUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const slotLocal = layerUT.convertToNodeSpaceAR(slotWorld);
            const w = slotUT.contentSize.width + 20;
            const h = slotUT.contentSize.height + 16;

            if (this._guideMode === 'level_1' || this._guideMode === 'level_2') {
                this.showGuideSpriteHighlight('guide_slot_highlight', slotLocal.x, slotLocal.y, w, Math.max(70, h), 1.035);
                return;
            }
        
            const hl = new Node('GuideHighlight');
            this._guideLayer!.addChild(hl);
            hl.addComponent(UITransform).setContentSize(w, h);
            hl.layer = Layers.Enum.UI_2D;
            hl.setPosition(slotLocal.x, slotLocal.y);
        
            const g = hl.addComponent(Graphics);
            g.strokeColor = new Color(100, 220, 100, 220);
            g.lineWidth = 4;
            g.roundRect(-w / 2, -h / 2, w, h, 12);
            g.stroke();
            g.fillColor = new Color(100, 220, 100, 30);
            g.roundRect(-w / 2, -h / 2, w, h, 12);
            g.fill();
        
            const ht = tween(hl)
                .to(0.4, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
                .to(0.4, { scale: new Vec3(0.97, 0.97, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever();
            ht.start();
            this._guidePulseTweens.push(ht);
        },

        getStarterGuideWrongTargetHint(_hitResult: string): string {
            if (this._guideMode === 'level_2') {
                if (this._guideStep === 0) return '点下方解锁空位';
                if (this._guideStep === 1) return '点高亮豆豆';
                return '放到空槽里';
            }
            switch (this._guideStep) {
                case 0: return '点任意粉色豆豆';
                case 1: return '放到空槽里';
                case 2: return '点任意黄色豆豆';
                case 3: return '放回黄色空位';
                case 4: return '点槽里的粉色豆豆';
                case 5: return '放回粉色空位';
                default: return '点高亮区域';
            }
        },

        showGuideWrongTargetHint(worldPos?: Vec3, shouldReport: boolean = true) {
            const hitResult = this.getTutorialMissHitResult?.(worldPos) || 'miss_unknown';
            if (shouldReport) {
                this.reportTutorialTapResult?.(worldPos, hitResult, false, 'guide_layer');
            }
            if (!this._guideBubbleLbl) return;
            const step = this._guideStep;
            const phase = this._guidePhase;
            const lbl = this._guideBubbleLbl;
            const origString = lbl.string;
            const origColor = new Color(lbl.color.r, lbl.color.g, lbl.color.b, lbl.color.a);
            if (this._guideMode === 'level_1' || this._guideMode === 'level_2') {
                lbl.string = this.getStarterGuideWrongTargetHint(hitResult);
                lbl.color = new Color('#D45A38');
                const token = Date.now();
                this._guideWrongHintToken = token;
                if (this._guideBubble?.isValid) {
                    Tween.stopAllByTarget(this._guideBubble);
                    this._guideBubble.setScale(1, 1, 1);
                    tween(this._guideBubble)
                        .to(0.08, { scale: new Vec3(1.025, 1.025, 1) }, { easing: 'sineOut' })
                        .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
                        .start();
                }
                this.scheduleOnce(() => {
                    if (this._guideWrongHintToken !== token) return;
                    if (this._guideStep !== step || this._guidePhase !== phase) return;
                    if (this._guideBubbleLbl) {
                        this._guideBubbleLbl.string = origString;
                        this._guideBubbleLbl.color = origColor;
                    }
                }, 0.9);
                return;
            }
            switch (step) {
                case 0: lbl.string = this._guideMode === 'level_2' ? '请点击解锁按钮！' : '请点击目标区域！'; break;
                case 1: lbl.string = this._guideMode === 'level_1' ? '请点击下方暂存槽放入！' : '请点击高亮区域！'; break;
                case 2: lbl.string = this._guideMode === 'level_2' ? '请点击下方暂存槽放入！' : '请点击目标区域！'; break;
                case 3: lbl.string = '请点击高亮区域放置！'; break;
                case 5: lbl.string = '请点击高亮区域放置！'; break;
                default: lbl.string = '请点击目标区域！'; break;
            }
            lbl.color = new Color('#FF4444');
            this.scheduleOnce(() => {
                if (this._guideBubbleLbl) {
                    this._guideBubbleLbl.string = origString;
                    this._guideBubbleLbl.color = origColor;
                }
            }, 1.0);
        },

        /** 引导期间自动执行放置动作 */
        executeGuidePlacement(nearRow?: number, nearCol?: number) {
            const block = this.currentBlock!;
            const step = this._guideStep;
        
            if (this.isGuideSlotPlaceStep(step)) {
                // 将目标块放入暂存槽
                const sources = this.collectSourceWorldPositions(block);
                if (this.isFirstLevelFunnelActive() && !this._firstFunnelPlaceAttemptSent) {
                    this._firstFunnelPlaceAttemptSent = true;
                    this.trackFirstLevelFunnel('first_place_attempt', {
                        touchTarget: 'slot',
                        source: 'tutorial',
                        extra: {
                            colorId: block.colorId,
                            sourceBlock: block.source,
                            guideMode: this._guideMode,
                            guideStep: step,
                            guidePhase: this._guidePhase,
                        },
                    });
                }
                this.boardModel.removeBlock(block);
                const storedIdxs: number[] = [];
                for (const cell of block.cells) {
                    const idx = this.slotModel.store({
                        colorId: block.colorId, cells: [cell],
                        isLocked: false, source: 'slot',
                    });
                    if (idx === -1) break;
                    storedIdxs.push(idx);
                }
                if (storedIdxs.length < block.cells.length) {
                    this.boardModel.restoreBlock({
                        colorId: block.colorId,
                        cells: block.cells.slice(storedIdxs.length),
                        isLocked: false,
                        source: 'board',
                    });
                }
                if (storedIdxs.length > 0) {
                    if (this.isFirstLevelFunnelActive() && !this._firstFunnelPlaceSuccessSent) {
                        this._firstFunnelPlaceSuccessSent = true;
                        this.trackFirstLevelFunnel('first_place_success', {
                            touchTarget: 'slot',
                            source: 'tutorial',
                            success: true,
                            extra: {
                                colorId: block.colorId,
                                placedCount: storedIdxs.length,
                                sourceBlock: block.source,
                                guideMode: this._guideMode,
                                guideStep: step,
                                guidePhase: this._guidePhase,
                            },
                        });
                    }
                    this.startFlyToSlots(block.colorId, sources.slice(0, storedIdxs.length), storedIdxs, block.cells);
                } else {
                    this.finishPlace();
                }
            } else {
                // Step 3/5: 从棋盘放置到棋盘目标（Step 3: secondColorId, Step 5: firstColorId from slot）
                const sources = this.collectSourceWorldPositions(block);
                const guideDirtyBoardCells = block.source === 'board'
                    ? block.cells.map((cell) => ({ row: cell.row, col: cell.col }))
                    : [];
                const guideDirtySlotIndices = [...this._selectedSlotIndices];
                const selectedSlotSnapshot = block.source === 'slot'
                    ? this.captureSelectedSlotSnapshot()
                    : [];
                if (this.isFirstLevelFunnelActive() && !this._firstFunnelPlaceAttemptSent) {
                    this._firstFunnelPlaceAttemptSent = true;
                    this.trackFirstLevelFunnel('first_place_attempt', {
                        touchTarget: 'board',
                        source: 'tutorial',
                        extra: {
                            colorId: block.colorId,
                            sourceBlock: block.source,
                            guideMode: this._guideMode,
                            guideStep: step,
                            guidePhase: this._guidePhase,
                        },
                    });
                }
                if (block.source === 'board') {
                    this.boardModel.removeBlock(block);
                } else {
                    this.removeBlockFromSlotsKeepingGaps();
                }
                const result = this.boardModel.placeBlockMaximize(block, nearRow, nearCol);
                this._lastPlacedCells = result.placed;
                if (result.placed.length > 0) {
                    if (this.isFirstLevelFunnelActive() && !this._firstFunnelPlaceSuccessSent) {
                        this._firstFunnelPlaceSuccessSent = true;
                        this.trackFirstLevelFunnel('first_place_success', {
                            touchTarget: 'board',
                            source: 'tutorial',
                            success: true,
                            extra: {
                                colorId: block.colorId,
                                placedCount: result.placed.length,
                                sourceBlock: block.source,
                                guideMode: this._guideMode,
                                guideStep: step,
                                guidePhase: this._guidePhase,
                            },
                        });
                    }
                    if (result.remaining > 0) {
                        if (block.source === 'board') {
                            this.boardModel.restoreRemaining(block, result.remaining);
                        } else {
                            this.restoreSlotTailToOriginalSlots(block, result.remaining, selectedSlotSnapshot);
                        }
                    }
                    if (block.source === 'slot') {
                        this.compactSlotsAfterSelectionConsume();
                        guideDirtySlotIndices.length = 0;
                        for (let i = 0; i < this.slotNodes.length; i++) {
                            guideDirtySlotIndices.push(i);
                        }
                    }
                    this.startFlyPlace(block.colorId, sources, result.placed, guideDirtyBoardCells, guideDirtySlotIndices);
                } else {
                    if (block.source === 'board') {
                        this.boardModel.restoreBlock(block);
                    } else {
                        this.restoreBlockToSlots(selectedSlotSnapshot);
                    }
                    this.finishPlace();
                }
            }
        },

        /** 判断当前选中的豆豆是否是本步骤需要操作的 */
        isCorrectBlockForStep(step: number, block: BeanBlockInfo): boolean {
            switch (this._guideMode) {
                case 'level_1':
                    switch (step) {
                        case 0: return block.colorId === this._guideFirstColorId && block.source === 'board';
                        case 2: return block.colorId === this._guideSecondColorId && block.source === 'board';
                        case 4: return block.colorId === this._guideFirstColorId && block.source === 'slot';
                        default: return false;
                    }
                case 'level_2':
                    return step === 1
                        && block.colorId === this._guideFirstColorId
                        && block.source === 'board'
                        && block.cells.length > SLOTS_PER_ROW;
                default:
                    return false;
            }
        },

        isWorldPosNearGuideCells(worldPos: Vec3, cells: { row: number; col: number }[], kind: 'select' | 'place' = 'select'): boolean {
            const boardLocal = this.worldToBoardLocal(worldPos);
            if (!boardLocal || cells.length === 0) return false;
            const step = this.cellSize + this.cellGap;
            const tolerance = this.getBoardHitToleranceLocal(kind) * 1.35;
            const padding = Math.max(this.cellSize * 0.7, tolerance);
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const cell of cells) {
                const center = this.getBoardCellCenterLocal(cell.row, cell.col);
                minX = Math.min(minX, center.x - step / 2);
                maxX = Math.max(maxX, center.x + step / 2);
                minY = Math.min(minY, center.y - step / 2);
                maxY = Math.max(maxY, center.y + step / 2);
            }
            return boardLocal.x >= minX - padding
                && boardLocal.x <= maxX + padding
                && boardLocal.y >= minY - padding
                && boardLocal.y <= maxY + padding;
        },

        trySelectFirstLevelGuideBoardBlock(step: number, worldPos: Vec3): boolean {
            const colorId = step === 2 ? this._guideSecondColorId : this._guideFirstColorId;
            const block = this.findBlockOnBoard(colorId);
            if (!block || !this.isWorldPosNearGuideCells(worldPos, block.cells, 'select')) return false;
            const targetCell = block.cells[0];
            const targetWorld = this.getBoardCellWorldPosition(targetCell.row, targetCell.col);
            return targetWorld ? this.trySelectBoard(targetWorld) : false;
        },

        getFirstLevelGuideBoardPlaceTarget(worldPos: Vec3, colorId: number): { row: number; col: number } | null {
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
            const emptyCells: { row: number; col: number }[] = [];
            for (let r = 0; r < bh; r++) {
                for (let c = 0; c < bw; c++) {
                    if (this.boardModel.currentColors[r][c] === 0
                        && !this.boardModel.locked[r][c]
                        && this.boardModel.correctColors[r][c] === colorId) {
                        emptyCells.push({ row: r, col: c });
                    }
                }
            }
            if (!this.isWorldPosNearGuideCells(worldPos, emptyCells, 'place')) return null;
            return emptyCells[0] || null;
        },

        /** 检查当前引导步骤是否完成 */
        isFirstSlotRowFullForGuide(colorId?: number): boolean {
            const all = this.slotModel.getAll();
            let hasTargetColor = !colorId;
            for (let i = 0; i < SLOTS_PER_ROW; i++) {
                const block = all[i];
                if (!block) return false;
                if (colorId && block.colorId === colorId) hasTargetColor = true;
            }
            return hasTargetColor;
        },

        isGuideColorFullyStored(colorId: number): boolean {
            let targetCount = 0;
            for (let r = 0; r < this.boardModel.height; r++) {
                for (let c = 0; c < this.boardModel.width; c++) {
                    if (this.boardModel.correctColors[r][c] === colorId) targetCount++;
                }
            }
            let slotCount = 0;
            for (const block of this.slotModel.getAll()) {
                if (!block || block.colorId !== colorId) continue;
                slotCount += Math.max(1, block.cells?.length || 0);
            }
            return targetCount > 0 && slotCount >= targetCount;
        },

        checkGuideStepComplete() {
            if (this._guideStep < 0 || this._guideStep >= this._guideTotalSteps) return;
            if (this._guideInputSuspended) return;
            if (this._guidePhase !== 'place') return;
        
            const step = this._guideStep;
            let done = false;
        
            switch (this._guideMode) {
                case 'level_1':
                    switch (step) {
                        case 1:
                            // 暂存槽里是否有 firstColorId 的豆豆
                            for (const b of this.slotModel.getAll()) {
                                if (b && b.colorId === this._guideFirstColorId) { done = true; break; }
                            }
                            break;
                        case 3:
                            // secondColorId 是否已全部锁定
                            done = this.isColorFullyLocked(this._guideSecondColorId);
                            break;
                        case 5:
                            // 全部锁定 → 通关
                            done = this.boardModel.isAllLocked();
                            break;
                    }
                    break;
                case 'level_2':
                    if (step === 2) {
                        done = this.isGuideColorFullyStored(this._guideFirstColorId);
                    }
                    break;
            }
        
            if (done) {
                this.scheduleOnce(() => {
                    if (this._guideStep < 0) return;
                    if (this._guideMode === 'level_2' && step === this._guideTotalSteps - 1) {
                        this.endTutorial();
                        return;
                    }
                    if (step === this._guideTotalSteps - 1) {
                        // 最后一步完成，结束引导并通关
                        this.endTutorial();
                        this.scheduleOnce(() => this.playPatternCompleteThenWin(), 0.3);
                    } else {
                        this.advanceTutorial();
                    }
                }, 0.2);
            } else {
                // 没有正确放置，重置到当前步骤重新操作（奇数步始终为 place 阶段）
                this._guidePhase = 'place';
                this.showGuideStep(step);
            }
        },

        isColorFullyLocked(colorId: number): boolean {
            const bm = this.boardModel;
            for (let r = 0; r < bm.height; r++) {
                for (let c = 0; c < bm.width; c++) {
                    if (bm.correctColors[r][c] === colorId && !bm.locked[r][c]) {
                        return false;
                    }
                }
            }
            return true;
        },

        getGuideCellsLayerBounds(cells: { row: number; col: number }[]) {
            const layerUT = this._guideLayer!.getComponent(UITransform)!;
            const layerScale = this._guideLayer!.getWorldScale(new Vec3());
            const layerScaleX = Math.max(0.0001, Math.abs(layerScale.x || 1));
            const layerScaleY = Math.max(0.0001, Math.abs(layerScale.y || 1));
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            let maxCellSize = 0;
            for (const cell of cells) {
                const nodes = [
                    this.cellNodes[cell.row]?.[cell.col],
                    this.boardSlotBgNodes[cell.row]?.[cell.col],
                ];
                for (const cellNode of nodes) {
                    const cellUT = cellNode?.getComponent(UITransform);
                    if (!cellNode?.isValid || !cellUT) continue;
                    const world = cellUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                    const local = layerUT.convertToNodeSpaceAR(world);
                    const cellScale = cellNode.getWorldScale(new Vec3());
                    const halfW = cellUT.contentSize.width * Math.abs(cellScale.x || 1) / layerScaleX / 2;
                    const halfH = cellUT.contentSize.height * Math.abs(cellScale.y || 1) / layerScaleY / 2;
                    minX = Math.min(minX, local.x - halfW);
                    maxX = Math.max(maxX, local.x + halfW);
                    minY = Math.min(minY, local.y - halfH);
                    maxY = Math.max(maxY, local.y + halfH);
                    maxCellSize = Math.max(maxCellSize, halfW * 2, halfH * 2);
                }
                if (!nodes.some((node) => node?.isValid)) {
                    const world = this.getBoardCellWorldPosition?.(cell.row, cell.col) || null;
                    if (!world) continue;
                    const local = layerUT.convertToNodeSpaceAR(world);
                    const size = Math.max(1, Number(this.getBoardBeanVisualSize?.() || this.cellSize || 1));
                    const half = size / 2;
                    minX = Math.min(minX, local.x - half);
                    maxX = Math.max(maxX, local.x + half);
                    minY = Math.min(minY, local.y - half);
                    maxY = Math.max(maxY, local.y + half);
                    maxCellSize = Math.max(maxCellSize, size);
                }
            }
            if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
            const padding = Math.max(24, Math.round(maxCellSize * 0.28));
            return {
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                width: maxX - minX + padding * 2,
                height: maxY - minY + padding * 2,
            };
        },

        getGuideSlotIndicesLayerBounds(idxs: number[]) {
            const layerUT = this._guideLayer!.getComponent(UITransform)!;
            const layerScale = this._guideLayer!.getWorldScale(new Vec3());
            const layerScaleX = Math.max(0.0001, Math.abs(layerScale.x || 1));
            const layerScaleY = Math.max(0.0001, Math.abs(layerScale.y || 1));
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const idx of idxs) {
                const slotNode = this.slotNodes[idx];
                const slotUT = slotNode?.getComponent(UITransform);
                if (!slotNode?.isValid || !slotUT) continue;
                const world = slotUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const local = layerUT.convertToNodeSpaceAR(world);
                const slotScale = slotNode.getWorldScale(new Vec3());
                const halfW = slotUT.contentSize.width * Math.abs(slotScale.x || 1) / layerScaleX / 2;
                const halfH = slotUT.contentSize.height * Math.abs(slotScale.y || 1) / layerScaleY / 2;
                minX = Math.min(minX, local.x - halfW);
                maxX = Math.max(maxX, local.x + halfW);
                minY = Math.min(minY, local.y - halfH);
                maxY = Math.max(maxY, local.y + halfH);
            }
            if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
            const padding = 18;
            return {
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                width: maxX - minX + padding * 2,
                height: maxY - minY + padding * 2,
            };
        },

        showGuideSpriteHighlight(frameName: string, centerX: number, centerY: number, width: number, height: number, pulseScale: number = 1.04) {
            const frame = this.getSF(frameName);
            if (!frame) {
                throw new Error(`[guide] missing guide highlight sprite: ${frameName}`);
            }
            const hl = new Node('GuideHighlight');
            this._guideLayer!.addChild(hl);
            hl.layer = Layers.Enum.UI_2D;
            hl.addComponent(UITransform).setContentSize(width, height);
            hl.setPosition(centerX, centerY, 0);
            this._applySpriteFrame(hl, frame, width, height, Sprite.Type.SLICED);
            const sp = hl.getComponent(Sprite);
            if (sp) sp.color = new Color(255, 255, 255, 255);
            const opacity = hl.getComponent(UIOpacity) || hl.addComponent(UIOpacity);
            opacity.opacity = 255;

            const ht = tween(hl)
                .to(0.46, { scale: new Vec3(pulseScale, pulseScale, 1) }, { easing: 'sineInOut' })
                .to(0.46, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever();
            ht.start();
            this._guidePulseTweens.push(ht);
            this.raiseGuideHandAboveHighlights?.();
            return hl;
        },

        /** 自动高亮棋盘上的目标豆豆块 — 整个连通块一个统一外轮廓高亮 */
        autoHighlightBlock(cells: { row: number; col: number }[]) {
            this.clearGuideHighlight();
            this._guideHighlightCells = [...cells];
            if (this._guideMode === 'level_1' || this._guideMode === 'level_2') {
                const bounds = this.getGuideCellsLayerBounds(cells);
                if (bounds) {
                    this.showGuideSpriteHighlight(
                        'guide_area_highlight',
                        bounds.centerX,
                        bounds.centerY,
                        Math.max(120, bounds.width + 18),
                        Math.max(72, bounds.height + 14),
                        1.035,
                    );
                }
                for (const cell of cells) {
                    const cellNode = this.cellNodes[cell.row]?.[cell.col];
                    if (!cellNode) continue;
                    cellNode.setScale(1.04, 1.04, 1);
                    const ct = tween(cellNode)
                        .to(0.46, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                        .to(0.46, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
                        .union()
                        .repeatForever();
                    ct.start();
                    this._guidePulseTweens.push(ct);
                }
                return;
            }
            const bounds = this.getGuideCellsLayerBounds(cells);
            if (!bounds) return;
        
            // 统一金色外轮廓
            const hl = new Node('GuideHighlight');
            this._guideLayer!.addChild(hl);
            hl.addComponent(UITransform).setContentSize(bounds.width, bounds.height);
            hl.layer = Layers.Enum.UI_2D;
            hl.setPosition(bounds.centerX, bounds.centerY);
        
            const g = hl.addComponent(Graphics);
            g.strokeColor = new Color(255, 215, 0, 220);
            g.lineWidth = 4;
            g.roundRect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, 14);
            g.stroke();
            g.fillColor = new Color(255, 215, 0, 25);
            g.roundRect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, 14);
            g.fill();
        
            // 脉冲
            const ht = tween(hl)
                .to(0.4, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                .to(0.4, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever();
            ht.start();
            this._guidePulseTweens.push(ht);
        
            // 块内所有豆豆轻微脉冲
            for (const cell of cells) {
                const cellNode = this.cellNodes[cell.row]?.[cell.col];
                if (!cellNode) continue;
                cellNode.setScale(1.06, 1.06, 1);
                const ct = tween(cellNode)
                    .to(0.4, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineInOut' })
                    .to(0.4, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
                    .union()
                    .repeatForever();
                ct.start();
                this._guidePulseTweens.push(ct);
            }
        },

        /** 自动高亮暂存槽里的豆豆块 — 整个块统一外轮廓高亮 */
        autoHighlightSlotBeans(colorId: number) {
            this.clearGuideHighlight();
            const layerUT = this._guideLayer!.getComponent(UITransform)!;
            const allBlocks = this.slotModel.getAll();
        
            // 收集所有含目标色的槽位索引
            const idxs: number[] = [];
            for (let i = 0; i < allBlocks.length; i++) {
                if (allBlocks[i] && allBlocks[i]!.colorId === colorId) idxs.push(i);
            }
            if (idxs.length === 0) return;
        
            this._guideHighlightCells = []; // 棋盘格子不需要
            if (this._guideMode === 'level_1' || this._guideMode === 'level_2') {
                const bounds = this.getGuideSlotIndicesLayerBounds(idxs);
                if (bounds) {
                    this.showGuideSpriteHighlight(
                        'guide_slot_highlight',
                        bounds.centerX,
                        bounds.centerY,
                        Math.max(96, bounds.width + 20),
                        Math.max(66, bounds.height + 16),
                        1.035,
                    );
                }
                for (const idx of idxs) {
                    const slotNode = this.slotNodes[idx];
                    if (!slotNode) continue;
                    slotNode.setScale(1.04, 1.04, 1);
                    const ct = tween(slotNode)
                        .to(0.46, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                        .to(0.46, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
                        .union()
                        .repeatForever();
                    ct.start();
                    this._guidePulseTweens.push(ct);
                }
                return;
            }
        
            if (idxs.length === 1) {
                // 只有一个槽，直接高亮它
                const slotNode = this.slotNodes[idxs[0]];
                if (!slotNode) return;
                const worldPos = slotNode.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const localPos = layerUT.convertToNodeSpaceAR(worldPos);
        
                const hl = new Node('GuideHighlight');
                this._guideLayer!.addChild(hl);
                hl.addComponent(UITransform).setContentSize(SLOT_SIZE + 14, SLOT_SIZE + 14);
                hl.layer = Layers.Enum.UI_2D;
                hl.setPosition(localPos.x, localPos.y);
        
                const g = hl.addComponent(Graphics);
                g.strokeColor = new Color(255, 215, 0, 220);
                g.lineWidth = 4;
                g.roundRect(-SLOT_SIZE / 2 - 7, -SLOT_SIZE / 2 - 7, SLOT_SIZE + 14, SLOT_SIZE + 14, 10);
                g.stroke();
                g.fillColor = new Color(255, 215, 0, 25);
                g.roundRect(-SLOT_SIZE / 2 - 7, -SLOT_SIZE / 2 - 7, SLOT_SIZE + 14, SLOT_SIZE + 14, 10);
                g.fill();
        
                const ht = tween(hl)
                    .to(0.4, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineInOut' })
                    .to(0.4, { scale: new Vec3(0.96, 0.96, 1) }, { easing: 'sineInOut' })
                    .union()
                    .repeatForever();
                ht.start();
                this._guidePulseTweens.push(ht);
        
                slotNode.setScale(1.06, 1.06, 1);
                const ct = tween(slotNode)
                    .to(0.4, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineInOut' })
                    .to(0.4, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
                    .union()
                    .repeatForever();
                ct.start();
                this._guidePulseTweens.push(ct);
            } else {
                // 多个槽有同色豆豆，统一包围盒高亮
                // 取最小/最大槽索引，换算成槽位坐标
                const slotPositions = idxs
                    .map((idx) => this.slotNodes[idx]?.position || null)
                    .filter((pos): pos is Vec3 => !!pos);
                if (slotPositions.length === 0) return;
                const minX = Math.min(...slotPositions.map((pos) => pos.x));
                const maxX = Math.max(...slotPositions.map((pos) => pos.x));
                const minY = Math.min(...slotPositions.map((pos) => pos.y));
                const maxY = Math.max(...slotPositions.map((pos) => pos.y));
        
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
        
                // 换算到 slotAreaNode 局部坐标的中心，再转世界 → guideLayer 局部
                const slotAreaUT = this.slotAreaNode.getComponent(UITransform)!;
                const centerWorld = slotAreaUT.convertToWorldSpaceAR(new Vec3(centerX, centerY, 0));
                const centerGuide = layerUT.convertToNodeSpaceAR(centerWorld);
                const blockW = (maxX - minX) + SLOT_SIZE + 14;
                const blockH = (maxY - minY) + SLOT_SIZE + 14;
        
                const hl = new Node('GuideHighlight');
                this._guideLayer!.addChild(hl);
                hl.addComponent(UITransform).setContentSize(blockW, blockH);
                hl.layer = Layers.Enum.UI_2D;
                hl.setPosition(centerGuide.x, centerGuide.y);
        
                const g = hl.addComponent(Graphics);
                g.strokeColor = new Color(255, 215, 0, 220);
                g.lineWidth = 4;
                g.roundRect(-blockW / 2, -blockH / 2, blockW, blockH, 12);
                g.stroke();
                g.fillColor = new Color(255, 215, 0, 25);
                g.roundRect(-blockW / 2, -blockH / 2, blockW, blockH, 12);
                g.fill();
        
                const ht = tween(hl)
                    .to(0.4, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineInOut' })
                    .to(0.4, { scale: new Vec3(0.96, 0.96, 1) }, { easing: 'sineInOut' })
                    .union()
                    .repeatForever();
                ht.start();
                this._guidePulseTweens.push(ht);
        
                // 槽内所有豆豆轻微脉冲
                for (const idx of idxs) {
                    const slotNode = this.slotNodes[idx];
                    if (!slotNode) continue;
                    slotNode.setScale(1.06, 1.06, 1);
                    const ct = tween(slotNode)
                        .to(0.4, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'sineInOut' })
                        .to(0.4, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
                        .union()
                        .repeatForever();
                    ct.start();
                    this._guidePulseTweens.push(ct);
                }
            }
        },

        /** 高亮棋盘上的空位目标区块 — 绿色虚线框 + 轻微脉冲 */
        highlightEmptyTarget(colorId: number) {
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
        
            // 收集所有空位目标格
            const emptyCells: { row: number; col: number }[] = [];
            for (let r = 0; r < bh; r++) {
                for (let c = 0; c < bw; c++) {
                    if (this.boardModel.currentColors[r][c] === 0
                        && !this.boardModel.locked[r][c]
                        && this.boardModel.correctColors[r][c] === colorId) {
                        emptyCells.push({ row: r, col: c });
                    }
                }
            }
            if (emptyCells.length === 0) return;
        
            this._guideHighlightCells = [...emptyCells];
            const bounds = this.getGuideCellsLayerBounds(emptyCells);
            if (!bounds) return;

            if (this._guideMode === 'level_1' || this._guideMode === 'level_2') {
                this.showGuideSpriteHighlight(
                    'guide_area_highlight',
                    bounds.centerX,
                    bounds.centerY,
                    Math.max(120, bounds.width + 18),
                    Math.max(72, bounds.height + 14),
                    1.035,
                );
                return;
            }
        
            const hl = new Node('GuideHighlight');
            this._guideLayer!.addChild(hl);
            hl.addComponent(UITransform).setContentSize(bounds.width, bounds.height);
            hl.layer = Layers.Enum.UI_2D;
            hl.setPosition(bounds.centerX, bounds.centerY);
        
            const g = hl.addComponent(Graphics);
            g.strokeColor = new Color(100, 220, 100, 200);
            g.lineWidth = 3;
            g.roundRect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, 14);
            g.stroke();
            g.fillColor = new Color(100, 220, 100, 30);
            g.roundRect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, 14);
            g.fill();
        
            const ht = tween(hl)
                .to(0.4, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'sineInOut' })
                .to(0.4, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever();
            ht.start();
            this._guidePulseTweens.push(ht);
        },

        /** 清除引导高亮光环（仅移除overlay节点，保留游戏脉冲动画） */
        clearGuideHighlightOverlays() {
            if (!this._guideLayer) return;
            const toRemove: Node[] = [];
            for (const child of this._guideLayer!.children) {
                if (child.name === 'GuideHighlight') toRemove.push(child);
            }
            for (const n of toRemove) { Tween.stopAllByTarget(n); n.destroy(); }
            // 停止引导专用脉冲
            for (const t of this._guidePulseTweens) t.stop();
            this._guidePulseTweens.length = 0;
            // 恢复格子缩放
            this._resetHighlightCellScales();
            this._guideHighlightCells = [];
        },

        /** 完整清除引导高亮（用于切换步骤时） */
        clearGuideHighlight() {
            this.clearGuideHighlightOverlays();
        },

        /** 恢复被高亮的格子/槽的缩放 */
        _resetHighlightCellScales() {
            for (const cell of this._guideHighlightCells) {
                const node = this.cellNodes[cell.row]?.[cell.col];
                if (node) node.setScale(1, 1, 1);
            }
            // 重置所有槽位缩放（简化处理）
            for (const sn of this.slotNodes) {
                if (sn) sn.setScale(1, 1, 1);
            }
        },

        /** 手势引导：手停在棋盘豆豆块上方，执行点击动作（选中） */
        startHandGestureOnBlock(block: BeanBlockInfo, hand: Node) {
            const layerUT = this._guideLayer!.getComponent(UITransform)!;
            const boardUT = this.boardNode.getComponent(UITransform)!;
            const boardWorldCenter = boardUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const boardCenter = layerUT.convertToNodeSpaceAR(boardWorldCenter);
            const step = this.cellSize + this.cellGap;
        
            // 计算豆豆块中心位置
            let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
            for (const cell of block.cells) {
                if (cell.row < minRow) minRow = cell.row;
                if (cell.row > maxRow) maxRow = cell.row;
                if (cell.col < minCol) minCol = cell.col;
                if (cell.col > maxCol) maxCol = cell.col;
            }
            const halfBoard = this.levelData.boardWidth / 2;
            const halfH = this.levelData.boardHeight / 2;
            const blockCenterCol = (minCol + maxCol) / 2;
            const blockCenterRow = (minRow + maxRow) / 2;
            const blockX = (blockCenterCol - halfBoard + 0.5) * step;
            const blockY = (halfH - 0.5 - blockCenterRow) * step;
        
            hand.active = true;
            this.setGuideHandTarget(hand, boardCenter.x + blockX, boardCenter.y + blockY);
            this.startGuideHandPulse(hand);
        },

        /** 手势引导：手停在暂存槽上方，执行点击动作（选中） */
        startHandGestureOnSlot(hand: Node) {
            const layerUT = this._guideLayer!.getComponent(UITransform)!;
            const slotUT = this.slotAreaNode.getComponent(UITransform)!;
            const slotWorldCenter = slotUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const slotCenter = layerUT.convertToNodeSpaceAR(slotWorldCenter);
        
            hand.active = true;
            this.setGuideHandTarget(hand, slotCenter.x, slotCenter.y);
            this.startGuideHandPulse(hand);
        },
    });
}
