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

export function installGameplaySkillWandModule(target: any): void {
    Object.assign(target, {
        // ==================== 道具技能 ====================
        
        /** 魔法棒：在棋盘上显示 6×6 框，拖动定位后松手，框内未锁定豆豆强制还原。（复刻 pdd Spine 骨骼动画效果） */
        useSkillClearArea(timerAlreadyPaused: boolean = false) {
            if (this._skillActive) return; // 防止上次动画未结束时重复触发
            if (!timerAlreadyPaused) this.pauseTimerForProp();
            AudioMgr.inst.play('propWand');
            this._skillActive = true;
            this.resetIdleHintTimer();
            if (this.normalizeSlotBlocksForProps()) this.renderSlots();
            this._wandMode = true;
            this.isSelected = false;
            this.currentBlock = null;
            this.clearDragNodes();
            this.renderBoard();
        
            const step = this.cellSize + this.cellGap;
            const frameW = (this.constructor as any).WAND_GRID_SIZE * step;
            const frameH = (this.constructor as any).WAND_GRID_SIZE * step;
        
            const node = new Node('WandFrame');
            this.boardNode.addChild(node);
            node.addComponent(UITransform).setContentSize(frameW, frameH);
            node.layer = Layers.Enum.UI_2D;
            node.setPosition(0, 0, 0);
            node.addComponent(UIOpacity);
        
            // === 1. 半透明底色（很淡的遮罩） ===
            const bg = node.addComponent(Graphics);
            bg.fillColor = new Color(0, 0, 0, 15);
            bg.roundRect(-frameW / 2, -frameH / 2, frameW, frameH, 6);
            bg.fill();
        
            // === 2. 彩虹外发光边框（彩色宽线，加粗加亮） ===
            const rainbowColors = [
                new Color(255, 80, 80, 140),   // 红
                new Color(255, 180, 50, 140),  // 橙
                new Color(255, 255, 80, 140),  // 黄
                new Color(80, 220, 80, 140),   // 绿
                new Color(80, 180, 255, 140),  // 蓝
                new Color(180, 100, 255, 140), // 紫
            ];
            const glowBorders: Graphics[] = [];
            for (let i = 0; i < rainbowColors.length; i++) {
                const g = node.addComponent(Graphics);
                g.strokeColor = rainbowColors[i];
                g.lineWidth = 6;
                const offset = (i - 2) * 4;
                g.roundRect(-frameW / 2 + offset, -frameH / 2 + offset, frameW - offset * 2, frameH - offset * 2, 8);
                g.stroke();
                glowBorders.push(g);
            }
        
            // === 3. 白色衬底边框 ===
            const whiteBorder = node.addComponent(Graphics);
            whiteBorder.strokeColor = new Color(255, 255, 255, 255);
            whiteBorder.lineWidth = 5;
            whiteBorder.roundRect(-frameW / 2, -frameH / 2, frameW, frameH, 8);
            whiteBorder.stroke();
        
            // === 4. 彩色主边框 ===
            const mainBorder = node.addComponent(Graphics);
            const hueColors = [
                new Color(255, 100, 100, 255),
                new Color(255, 200, 80, 255),
                new Color(100, 220, 100, 255),
                new Color(100, 180, 255, 255),
                new Color(200, 120, 255, 255),
                new Color(255, 100, 200, 255),
            ];
            mainBorder.strokeColor = hueColors[0];
            mainBorder.lineWidth = 5;
            mainBorder.roundRect(-frameW / 2, -frameH / 2, frameW, frameH, 8);
            mainBorder.stroke();
        
            // === 5. 四角彩色圆点装饰（加大） ===
            const cornerOff = 8;
            const cornerColors = [
                new Color(255, 100, 100, 255),
                new Color(100, 220, 100, 255),
                new Color(100, 180, 255, 255),
                new Color(255, 200, 80, 255),
            ];
            const corners = [
                { x: -frameW / 2 + cornerOff, y: frameH / 2 - cornerOff },
                { x: frameW / 2 - cornerOff, y: frameH / 2 - cornerOff },
                { x: -frameW / 2 + cornerOff, y: -frameH / 2 + cornerOff },
                { x: frameW / 2 - cornerOff, y: -frameH / 2 + cornerOff },
            ];
            for (let i = 0; i < corners.length; i++) {
                const corner = corners[i];
                const dot = new Node('WandCornerDot');
                node.addChild(dot);
                dot.addComponent(UITransform).setContentSize(24, 24);
                dot.layer = Layers.Enum.UI_2D;
                dot.setPosition(corner.x, corner.y);
                const dotG = dot.addComponent(Graphics);
                // 白色外圈
                dotG.fillColor = new Color(255, 255, 255, 255);
                dotG.circle(0, 0, 11);
                dotG.fill();
                // 彩色内圈
                dotG.fillColor = cornerColors[i];
                dotG.circle(0, 0, 9);
                dotG.fill();
                // 呼吸动画
                dot.scale = new Vec3(1, 1, 1);
                tween(dot)
                    .to(0.5, { scale: new Vec3(1.4, 1.4, 1) }, { easing: 'sineInOut' })
                    .to(0.5, { scale: new Vec3(0.8, 0.8, 1) }, { easing: 'sineInOut' })
                    .union()
                    .repeatForever()
                    .start();
            }
        
            // === 5. 主边框呼吸脉动（彩虹发光层整体透明度变化） ===
            let glowAlpha = 160;
            let glowDir = -1;
            const pulseGlow = () => {
                if (!node.isValid) return;
                glowAlpha += glowDir * 20;
                if (glowAlpha <= 80) glowDir = 1;
                else if (glowAlpha >= 180) glowDir = -1;
                for (const g of glowBorders) {
                    if (!g.isValid) continue;
                    const c = g.strokeColor;
                    g.strokeColor = new Color(c.r, c.g, c.b, glowAlpha);
                }
                this.scheduleOnce(pulseGlow, 0.12);
            };
            this.scheduleOnce(pulseGlow, 0.12);
        
            // === 6. 主边框彩色轮换 ===
            let hueIdx = 0;
            const rotateHue = () => {
                if (!node.isValid || !mainBorder.isValid) return;
                hueIdx = (hueIdx + 1) % hueColors.length;
                mainBorder.strokeColor = hueColors[hueIdx];
                this.scheduleOnce(rotateHue, 0.3);
            };
            this.scheduleOnce(rotateHue, 0.3);
        
            // === 7. 内部浮动星光粒子（模拟 Spine 粒子效果） ===
            this._wandSparkleNodes = [];
            for (let i = 0; i < 10; i++) {
                const sparkle = this.createWandSparkle();
                node.addChild(sparkle);
                sparkle.setPosition(
                    (Math.random() - 0.5) * (frameW - 30),
                    (Math.random() - 0.5) * (frameH - 30),
                );
                this._wandSparkleNodes.push(sparkle);
                this.animateWandSparkle(sparkle);
            }
        
            this.attachWandHandle(node, frameW, frameH);
            this._wandRectNode = node;
        
            // 提示用户移动魔方框
            this.showToast('拖动魔方框到目标位置，松手生效', 2.5);
        },

        /** 右下角附着一支简化魔法棒，补足 pdd 里 Spine 魔棒的存在感。 */
        attachWandHandle(parent: Node, frameW: number, frameH: number) {
            const wand = new Node('WandHandle');
            parent.addChild(wand);
            wand.addComponent(UITransform).setContentSize(96, 96);
            wand.layer = Layers.Enum.UI_2D;
            wand.setPosition(frameW / 2 - 8, -frameH / 2 + 12, 0);
            wand.angle = -32;
            wand.addComponent(UIOpacity).opacity = 235;
        
            const g = wand.addComponent(Graphics);
            g.lineCap = Graphics.LineCap.ROUND;
            g.lineJoin = Graphics.LineJoin.ROUND;
        
            g.strokeColor = new Color(119, 76, 40, 255);
            g.lineWidth = 8;
            g.moveTo(-20, 20);
            g.lineTo(18, -18);
            g.stroke();
        
            g.strokeColor = new Color(245, 214, 120, 220);
            g.lineWidth = 4;
            g.moveTo(-19, 19);
            g.lineTo(17, -17);
            g.stroke();
        
            g.fillColor = new Color(255, 255, 255, 255);
            g.circle(-24, 24, 8);
            g.fill();
        
            g.fillColor = new Color(255, 214, 79, 255);
            g.moveTo(-24, 37);
            g.lineTo(-20, 28);
            g.lineTo(-11, 24);
            g.lineTo(-20, 20);
            g.lineTo(-24, 11);
            g.lineTo(-28, 20);
            g.lineTo(-37, 24);
            g.lineTo(-28, 28);
            g.close();
            g.fill();
        
            tween(wand)
                .to(0.55, { angle: -24, scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' })
                .to(0.55, { angle: -36, scale: new Vec3(0.96, 0.96, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever()
                .start();
        },

        /** 创建单个星光粒子 */
        createWandSparkle(): Node {
            const sparkle = new Node('WandSparkle');
            sparkle.addComponent(UITransform).setContentSize(8, 8);
            sparkle.layer = Layers.Enum.UI_2D;
            sparkle.addComponent(UIOpacity);
            const g = sparkle.addComponent(Graphics);
            g.fillColor = new Color(255, 255, 255, 200);
            g.circle(0, 0, 3);
            g.fill();
            g.strokeColor = new Color(0, 0, 0, 150);
            g.lineWidth = 1;
            g.circle(0, 0, 3);
            g.stroke();
            return sparkle;
        },

        /** 星光粒子浮动动画 */
        animateWandSparkle(sparkle: Node) {
            const duration = 1.5 + Math.random() * 1.5;
            const targetX = sparkle.position.x + (Math.random() - 0.5) * 40;
            const targetY = sparkle.position.y + (Math.random() - 0.5) * 40;
            tween(sparkle)
                .to(duration / 2, {
                    position: new Vec3(targetX, targetY, 0),
                    scale: new Vec3(1.5, 1.5, 1),
                }, { easing: 'sineOut' })
                .to(duration / 2, {
                    position: new Vec3(sparkle.position.x + (Math.random() - 0.5) * 40,
                        sparkle.position.y + (Math.random() - 0.5) * 40, 0),
                    scale: new Vec3(0.5, 0.5, 1),
                }, { easing: 'sineIn' })
                .call(() => {
                    if (sparkle.isValid) {
                        this.animateWandSparkle(sparkle);
                    }
                })
                .start();
        },

        getWandBoardRect(): { minR: number; maxR: number; minC: number; maxC: number } {
            const node = this._wandRectNode!;
            const pos = node.position;
            const step = this.cellSize + this.cellGap;
            const halfFrame = (this.constructor as any).WAND_GRID_SIZE * step / 2;
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
            const halfGrid = bw / 2 * step;
            const halfGridH = bh / 2 * step;
        
            const left = pos.x - halfFrame;
            const right = pos.x + halfFrame;
            const top = pos.y + halfFrame;
            const bottom = pos.y - halfFrame;
        
            const minC = Math.max(0, Math.floor((left + halfGrid) / step));
            const maxC = Math.min(bw - 1, Math.floor((right + halfGrid - 1) / step));
            const minR = Math.max(0, Math.floor((halfGridH - top) / step));
            const maxR = Math.min(bh - 1, Math.floor((halfGridH - bottom - 1) / step));
        
            return { minR, maxR, minC, maxC };
        },

        executeWandAtCurrentPos() {
            const { minR, maxR, minC, maxC } = this.getWandBoardRect();
            const candidateCells: { row: number; col: number }[] = [];
            for (let r = minR; r <= maxR; r++) {
                for (let c = minC; c <= maxC; c++) {
                    candidateCells.push({ row: r, col: c });
                }
            }
            const groups = this.collectUnmatchedTargetsByColor(candidateCells);
        
            if (groups.length === 0) {
                this.showToast('没有可还原的格子');
                this.finishSkillUsage();
                return;
            }
        
            this.playWandCastEffect();
            this.runWandGroupsSequential(groups);
        },

        playWandCastEffect() {
            if (!this._wandRectNode) return;
            const centerWorld = this._wandRectNode.getComponent(UITransform)?.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            if (!centerWorld) return;
            AudioMgr.inst.play('propWand');
            AudioMgr.inst.vibrate(40);
            this.playBrightFlashAt(centerWorld, this.cellSize * 3.2, 230);
            this.playFrameEffectAt(centerWorld, 'block_match-animation_', 19, this.cellSize * 3.6, 0.014);
        },

        finishWandSequence() {
            this.clearForcedSkillHiddenState();
            this.renderBoard();
            this.renderSlots();
            this.finishSkillUsage();
            this.checkColorCompletion();
            this.checkGuideStepComplete();
            if (this.boardModel.isAllLocked()) {
                this.gameWin();
            }
        },

        runWandGroupsSequential(
            groups: Array<{ colorId: number; targets: { row: number; col: number }[] }>,
            index: number = 0,
        ) {
            if (index >= groups.length) {
                this.finishWandSequence();
                return;
            }
        
            const group = groups[index];
            const plan = this.buildForcedSkillPlan(
                group.colorId,
                this.collectCurrentBoardSkillSources(group.colorId, group.targets.length),
                this.collectCurrentSlotSkillSources(group.colorId),
                group.targets,
            );
            this.playForcedSkillPlan(plan, () => {
                this.runWandGroupsSequential(groups, index + 1);
            });
        },

        normalizeSlotBlocksForProps(): boolean {
            const slots = this.slotModel.getAll();
            let hasMerged = false;
            const singles: BeanBlockInfo[] = [];
        
            for (const block of slots) {
                if (!block) continue;
                if (block.cells.length > 1) hasMerged = true;
                for (const cell of block.cells) {
                    singles.push({
                        colorId: block.colorId,
                        cells: [{ row: cell.row, col: cell.col }],
                        isLocked: false,
                        source: 'slot',
                    });
                }
            }
        
            if (!hasMerged) return false;
        
            for (let i = 0; i < slots.length; i++) {
                const single = singles[i];
                if (single) single.slotIndex = i;
                slots[i] = single ?? null;
            }
            return true;
        },

        collectUnmatchedTargetsByColor(candidateCells?: { row: number; col: number }[]): Array<{ colorId: number; targets: { row: number; col: number }[] }> {
            const groups = new Map<number, { row: number; col: number }[]>();
            const cells: { row: number; col: number }[] = candidateCells ?? [];
            if (!candidateCells) {
                for (let r = 0; r < this.boardModel.height; r++) {
                    for (let c = 0; c < this.boardModel.width; c++) {
                        cells.push({ row: r, col: c });
                    }
                }
            }
        
            for (const cell of cells) {
                const correctColor = this.boardModel.correctColors[cell.row][cell.col];
                if (correctColor === 0) continue;
                if (this.boardModel.locked[cell.row][cell.col]) continue;
                if (this.boardModel.currentColors[cell.row][cell.col] === correctColor) continue;
                if (!groups.has(correctColor)) groups.set(correctColor, []);
                groups.get(correctColor)!.push({ row: cell.row, col: cell.col });
            }
        
            return Array.from(groups.entries()).map(([colorId, targets]) => ({ colorId, targets }));
        },

        collectCurrentSlotSkillSources(colorId: number): number[] {
            const slotSources: number[] = [];
            const slots = this.slotModel.getAll();
            for (let i = 0; i < slots.length; i++) {
                if (slots[i]?.colorId === colorId) slotSources.push(i);
            }
            return slotSources;
        },

        cleanupWandMode() {
            this._wandMode = false;
            this._wandDragStart = null;
            for (const sparkle of this._wandSparkleNodes) {
                if (sparkle && sparkle.isValid) sparkle.destroy();
            }
            this._wandSparkleNodes = [];
            if (this._wandRectNode) {
                this._wandRectNode.destroy();
                this._wandRectNode = null;
            }
        },

        useSkillClearSlot(timerAlreadyPaused: boolean = false) {
            if (!timerAlreadyPaused) this.pauseTimerForProp();
            if (this.normalizeSlotBlocksForProps()) this.renderSlots();
            const slotAllInit = this.slotModel.getAll();
            const slotMovable: { slotIdx: number; colorId: number }[] = [];
            for (let i = 0; i < slotAllInit.length; i++) {
                if (slotAllInit[i]) slotMovable.push({ slotIdx: i, colorId: slotAllInit[i]!.colorId });
            }
            if (slotMovable.length === 0) {
                this.showToast('暂存槽没有豆豆');
                this.resumeTimerForProp();
                return;
            }
            this._skillActive = true;
            this.resetIdleHintTimer();
            const groups = this.buildSkillSourceGroups([], slotMovable);
            this.runForcedSkillPlansForBrush(groups);
        },

        /** 刷子专属：所有计划完成后把暂存槽剩余豆豆倒到棋盘空位。 */
        runForcedSkillPlansForBrush(groups: SkillSourceGroup[]) {
            const plans: ForcedSkillPlan[] = [];
            for (let i = 0; i < groups.length; i++) {
                const group = groups[i];
                plans.push(this.buildForcedSkillPlan(group.colorId, group.boardSources, group.slotSources));
            }
            this.runForcedSkillPlansSequentialNoFinish(plans, 0, () => {
                this.dumpRemainingSlotBeans();
            });
        },

        /** 与 runForcedSkillPlansSequential 相同，但最后不调用 finishSkillUsage。 */
        runForcedSkillPlansSequentialNoFinish(plans: ForcedSkillPlan[], index: number = 0, onComplete?: () => void) {
            if (index >= plans.length) {
                this.renderSlots();
                onComplete?.();
                return;
            }
            this.playForcedSkillPlan(plans[index], () => {
                this.runForcedSkillPlansSequentialNoFinish(plans, index + 1, onComplete);
            });
        },

        /** 与 renderSlots 相同，但指定的槽 idx 先当作空槽显示（供飞行期间占位） */
        renderSlotsWithHidden(hiddenIdxs: Set<number>) {
            const total = this.slotNodes.length;
            for (let i = 0; i < total; i++) {
                this.renderSlotAt(i, hiddenIdxs);
            }
        },

        renderSlotIndices(slotIndices: number[], hiddenIdxs: Set<number> = this._hiddenSlotIndices) {
            const seen = new Set<number>();
            for (const idx of slotIndices) {
                if (seen.has(idx)) continue;
                seen.add(idx);
                this.renderSlotAt(idx, hiddenIdxs);
            }
        },

        renderSlotAt(index: number, hiddenIdxs: Set<number>) {
            if (index < 0 || index >= this.slotNodes.length) return;
            const slot = this.slotNodes[index];
            if (!slot) return;
            const row = Math.floor(index / SLOTS_PER_ROW);
            const isLocked = row >= this.slotUnlockedRows;
            const block = this.slotModel.getBlock(index);
            const beanNode = slot.getChildByName('Bean');
            const sp = beanNode?.getComponent(Sprite) || null;
            const marker = this.slotMarkerNodes[index];
            const markerSp = marker?.getComponent(Sprite) || null;
            const markerOpacity = marker?.getComponent(UIOpacity) || null;
            if (!sp || !marker) return;
        
            const isHidden = hiddenIdxs.has(index) || this._hiddenSlotIndices.has(index);
            const showBean = block && !isHidden;
            if (showBean) {
                if (markerSp) markerSp.enabled = false;
                sp.enabled = true;
                sp.spriteFrame = this.getBeanSpriteFrame(block!.colorId, false);
                slot.setSiblingIndex((slot.parent?.children.length || 1) - 1);
                if (isLocked) {
                    sp.node.getComponent(UIOpacity) || sp.node.addComponent(UIOpacity);
                    sp.node.getComponent(UIOpacity)!.opacity = 100;
                } else {
                    const opacity = sp.node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                }
            } else {
                sp.enabled = false;
                const opacity = sp.node.getComponent(UIOpacity);
                if (opacity) opacity.opacity = 255;
                if (markerSp) {
                    markerSp.enabled = true;
                    markerSp.spriteFrame = this.getSF(MAINLINE_SLOT_GROOVE_TEXTURE) || markerSp.spriteFrame;
                    if (markerOpacity) markerOpacity.opacity = isLocked ? 112 : 255;
                }
            }
        },

        /** 把暂存槽剩余的豆豆全部飞到棋盘空位（刷子最后一步）。优先放匹配颜色的空位，无匹配则放任意空位但不锁定。 */
        dumpRemainingSlotBeans() {
            const bm = this.boardModel;
            const slots = this.slotModel.getAll();
            const moves: { slotIdx: number; targetRow: number; targetCol: number; colorId: number; doLock: boolean }[] = [];
            const usedCells = new Set<string>();
        
            const findMatchingEmpty = (colorId: number): { row: number; col: number } | null => {
                for (let r = 0; r < bm.height; r++) {
                    for (let c = 0; c < bm.width; c++) {
                        const key = `${r},${c}`;
                        if (usedCells.has(key)) continue;
                        if (bm.correctColors[r][c] === colorId && bm.currentColors[r][c] === 0 && !bm.locked[r][c]) {
                            return { row: r, col: c };
                        }
                    }
                }
                return null;
            };
        
            const findAnyEmpty = (): { row: number; col: number } | null => {
                for (let r = 0; r < bm.height; r++) {
                    for (let c = 0; c < bm.width; c++) {
                        const key = `${r},${c}`;
                        if (usedCells.has(key)) continue;
                        if (bm.correctColors[r][c] !== 0 && bm.currentColors[r][c] === 0 && !bm.locked[r][c]) {
                            return { row: r, col: c };
                        }
                    }
                }
                return null;
            };
        
            for (let i = 0; i < slots.length; i++) {
                const block = slots[i];
                if (!block) continue;
                let target = findMatchingEmpty(block.colorId);
                let doLock = true;
                if (!target) {
                    // 没有匹配的空位，找任意空位，不锁定
                    target = findAnyEmpty();
                    doLock = false;
                }
                if (!target) continue; // 没有任何空位了
                usedCells.add(`${target.row},${target.col}`);
                moves.push({ slotIdx: i, targetRow: target.row, targetCol: target.col, colorId: block.colorId, doLock });
            }
        
            if (moves.length === 0) {
                // 没有空位，所有豆豆直接从暂存槽消耗掉
                for (let i = 0; i < slots.length; i++) {
                    if (slots[i]) this.slotModel.take(i);
                }
                this.finishClearSlot();
                return;
            }
        
            // 更新数据：豆豆飞到棋盘空位
            for (const move of moves) {
                bm.currentColors[move.targetRow][move.targetCol] = move.colorId;
                bm.setLocked(move.targetRow, move.targetCol, move.doLock);
                this.slotModel.take(move.slotIdx);
                this._flyingTargets.add(`${move.targetRow},${move.targetCol}`);
            }
            // 暂存槽剩余没有空位可放的豆豆，直接消耗掉
            for (let i = 0; i < slots.length; i++) {
                if (slots[i]) this.slotModel.take(i);
            }
        
            this.renderBoard();
            this.renderSlots();
        
            // 数据已提交，切换到仅动画模式，允许用户触摸交互
            this._skillAnimOnly = true;
        
            const layerUT = this.dragLayer.getComponent(UITransform)!;
            const nodeWorldPos = (node: Node): Vec3 => node.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const STAGGER = 0.028;
            let remaining = moves.length;
        
            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                const slotNode = this.slotNodes[move.slotIdx];
                const srcWorld = slotNode ? nodeWorldPos(slotNode) : new Vec3(0, 0, 0);
                const targetCell = this.cellNodes[move.targetRow][move.targetCol];
                const targetWorld = nodeWorldPos(targetCell);
                const srcLocal = layerUT.convertToNodeSpaceAR(srcWorld);
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
        
                const bean = this.acquireFlyBeanNode(
                    'DumpSlotBean',
                    this.getSlotBeanVisualSize(),
                    this.getBeanSpriteFrame(move.colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(srcLocal.x, srcLocal.y, 0);
                bean.setScale(0.96, 0.96, 1);
        
                tween(bean)
                    .delay(i * STAGGER)
                    .to(0.1, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineOut' })
                    .to(0.1, {
                        position: new Vec3(targetLocal.x, targetLocal.y, 0),
                        scale: new Vec3(1, 1, 1),
                    }, { easing: 'circOut' })
                    .call(() => {
                        AudioMgr.inst.play('place');
                        AudioMgr.inst.vibrate(30);
                        this.recycleFlyBeanNode(bean);
                        this._flyingTargets.delete(`${move.targetRow},${move.targetCol}`);
                        remaining--;
                        if (remaining <= 0) {
                            this.finishClearSlot();
                        }
                    })
                    .start();
            }
        },

        /** 刷子归位完成后的清理 */
        finishClearSlot() {
            this._flyingTargets.clear();
            this.renderBoard();
            this.renderSlots();
            this.checkColorCompletion();
            this.checkGuideStepComplete();
            if (this.boardModel.isAllLocked()) {
                this.gameWin();
            } else {
                this.finishSkillUsage();
            }
        },

        _getColorDisplayName(colorId: number): string {
            const map: Record<number, string> = {
                1: '红', 2: '青', 3: '橙', 4: '棕', 5: '肉粉',
                6: '黄', 7: '深蓝', 8: '紫', 9: '绿', 10: '红',
                11: '深绿', 12: '墨绿', 13: '蓝', 14: '粉', 15: '灰紫',
                16: '褐', 17: '酒红', 18: '藏青', 19: '黑', 20: '白',
            };
            return map[colorId] || '';
        },
    });
}
