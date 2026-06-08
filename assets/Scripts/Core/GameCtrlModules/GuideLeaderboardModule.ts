import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Prefab, instantiate, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, DAILY_SIGNIN_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, REMOTE_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, REMOTE_PRELOAD_TEXTURE_PATHS,
    REMOTE_TEXTURE_SEARCH_DIRS, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY, MAINLINE_SLOT_LOCK_DASH_ALPHA,
    MAINLINE_SLOT_LOCK_ROW_WIDTH, MAINLINE_SLOT_LOCK_ROW_HEIGHT, MAINLINE_SLOT_PANEL_TEXTURE, MAINLINE_SLOT_GROOVE_TEXTURE, MAINLINE_SLOT_TEXTURE_NAMES, SKILL_BUTTON_Y, SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_REMOTE_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_DAILY_SIGNIN_COUNT, LS_DAILY_SIGNIN_LAST_DATE_KEY, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, FIRST_LEVEL_ROUTE_EXPERIMENT_ID, FIRST_LEVEL_ROUTE_WX_TIMEOUT_MS, CLOUD_STATE_RESTORE_TIMEOUT_MS, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, REMOTE_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
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
import { ensureLeaderboardPanelController } from '../Panels/LeaderboardPanelController';

function syncGuideLeaderboardLabelNode(
    parent: Node,
    name: string,
    text: string,
    fontSize: number,
    color: Color,
    width: number,
    height: number,
    x: number,
    y: number,
    horizontalAlign: number = Label.HorizontalAlign.CENTER,
): Label {
    let node = parent.getChildByName(name);
    if (!node) {
        node = new Node(name);
        parent.addChild(node);
        node.layer = parent.layer || Layers.Enum.UI_2D;
    }
    node.setPosition(x, y, 0);
    const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
    ui.setContentSize(width, height);
    const label = node.getComponent(Label) || node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.max(fontSize + 4, height);
    label.color = color;
    label.horizontalAlign = horizontalAlign;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
    node.active = true;
    return label;
}

export function installGuideLeaderboardModule(target: any): void {
    Object.assign(target, {
        raiseGuideHandAboveHighlights(hand?: Node) {
            const layer = this._guideLayer as Node | null;
            const guideHand = hand || this._guideHand;
            if (!layer?.isValid || !guideHand?.isValid || guideHand.parent !== layer) return;

            let nextIndex = 0;
            if (this._guideMask?.isValid && this._guideMask.parent === layer) {
                this._guideMask.setSiblingIndex(nextIndex++);
            }
            for (const child of [...layer.children]) {
                if (child.isValid && child.name === 'GuideHighlight') {
                    child.setSiblingIndex(nextIndex++);
                }
            }
            guideHand.setSiblingIndex(nextIndex++);
            if (this._guideArrow?.isValid && this._guideArrow.parent === layer) {
                this._guideArrow.setSiblingIndex(nextIndex++);
            }
            if (this._guideBubble?.isValid && this._guideBubble.parent === layer) {
                this._guideBubble.setSiblingIndex(nextIndex++);
            }
        },

        /** 手势引导：手停在豆豆块上方，执行点击动作 */
        startHandGestureToBoard(block: BeanBlockInfo, hand: Node) {
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

        startHandGestureOnBoardTarget(colorId: number, hand: Node) {
            const targetCenter = this.getGuideBoardTargetCenter(colorId);
            if (!targetCenter) return;
            hand.active = true;
            this.setGuideHandTarget(hand, targetCenter.x, targetCenter.y);
            this.startGuideHandPulse(hand);
        },

        getGuideBoardTargetCenter(colorId: number): Vec3 | null {
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
            if (emptyCells.length === 0) return null;
            const bounds = this.getGuideCellsLayerBounds?.(emptyCells);
            if (!bounds) return null;
            return new Vec3(bounds.centerX, bounds.centerY, 0);
        },

        startGuideHandPulse(hand: Node) {
            Tween.stopAllByTarget(hand);
            hand.setScale(1, 1, 1);
            tween(hand)
                .delay(0.3)
                .repeatForever(
                    tween(hand)
                        .to(0.2, { scale: new Vec3(0.8, 0.8, 1) })
                        .delay(0.15)
                        .to(0.2, { scale: new Vec3(1, 1, 1) })
                        .delay(0.6)
                )
                .start();
        },

        setGuideHandTarget(hand: Node, targetX: number, targetY: number) {
            hand.setPosition(
                targetX - GUIDE_HAND_FINGERTIP_OFFSET_X,
                targetY - GUIDE_HAND_FINGERTIP_OFFSET_Y,
                0,
            );
            this.raiseGuideHandAboveHighlights(hand);
        },

        /** 在棋盘上查找指定颜色最大的可操作连通块 */
        findBlockOnBoard(colorId: number): BeanBlockInfo | null {
            const bm = this.boardModel;
            let best: BeanBlockInfo | null = null;
            const visited = Array.from({ length: bm.height }, () => Array(bm.width).fill(false));
            for (let r = 0; r < bm.height; r++) {
                for (let c = 0; c < bm.width; c++) {
                    if (visited[r][c]) continue;
                    if (bm.currentColors[r][c] === colorId && !bm.locked[r][c]) {
                        const block = bm.getConnectedBlock(r, c);
                        if (block) {
                            for (const cell of block.cells) {
                                if (visited[cell.row]) visited[cell.row][cell.col] = true;
                            }
                            if (!best || block.cells.length > best.cells.length) best = block;
                        } else {
                            visited[r][c] = true;
                        }
                    } else {
                        visited[r][c] = true;
                    }
                }
            }
            return best;
        },

        /** 在暂存槽中查找指定颜色的豆豆块 */
        findSlotBlock(colorId: number): BeanBlockInfo | null {
            const all = this.slotModel.getAll();
            for (const b of all) {
                if (b && b.colorId === colorId) return b;
            }
            return null;
        },

        advanceTutorial() {
            if (this._guideStep < 0) return;
            const completedStep = this._guideStep;
            this.trackFirstLevelFunnel('tutorial_step_done', {
                stepId: completedStep,
                stepName: `${this._guideMode}:${completedStep}:${this._guidePhase}`,
                source: 'tutorial',
                success: true,
            });
            const nextStep = this._guideStep + 1;
            if (nextStep >= this._guideTotalSteps) {
                this.endTutorial();
                if (this.boardModel.isAllLocked()) {
                    this.scheduleOnce(() => this.gameWin(), 0.3);
                }
            } else {
                this._guidePhase = this.getTutorialPhaseForStep(nextStep);
                this.showGuideStep(nextStep);
            }
        },

        getTutorialPhaseForStep(step: number): string {
            if (this._guideMode === 'level_2') {
                if (step === 0) return 'unlock';
                if (step === 1) return 'select';
                return 'place';
            }
            return step % 2 === 0 ? 'select' : 'place';
        },

        endTutorial() {
            this.trackFirstLevelFunnel('tutorial_done', {
                source: 'tutorial',
                success: true,
            });
            SySDKMgr.inst.reportTutorialFinish();
            this._guideStep = -1;
            this._guideMode = 'none';
            this._guideTotalSteps = 0;
            this._lastGuideVoiceToken = '';
            this.clearGuideHighlight();
            if (this._guideLayer) {
                Tween.stopAllByTarget(this._guideHand!);
                Tween.stopAllByTarget(this._guideArrow!);
                this._guideLayer.destroy();
                this._guideLayer = null;
                this._guideMask = null;
                this._guideHand = null;
                this._guideBubble = null;
                this._guideBubbleLbl = null;
                this._guideArrow = null;
            }
            this.unschedule(this.tickTimer);
            if (!this._currentLevelUnlimitedTime) {
                this.schedule(this.tickTimer, 1);
            }
            this.resetIdleHintTimer();
        },

        _drawProgressDots(current: number) {
            const total = Math.max(1, this._guideTotalSteps);
            const dotNode = new Node('ProgressBar');
            this._guideLayer!.addChild(dotNode);
            dotNode.addComponent(UITransform).setContentSize(200, 20);
            dotNode.layer = Layers.Enum.UI_2D;
            dotNode.setPosition(0, -520);
            const g = dotNode.addComponent(Graphics);
            const gap = 28;
            const startX = -(total - 1) * gap / 2;
            for (let i = 0; i < total; i++) {
                g.fillColor = i <= current ? new Color('#FFD700') : new Color(255, 255, 255, 80);
                g.circle(startX + i * gap, 0, i === current ? 5 : 3.5);
                g.fill();
            }
        },

        _drawBubbleBg(gb: Graphics, w: number, h: number, borderColor: Color) {
            gb.clear();
            const frame = this.getSF('popup_guide_bubble');
            if (!frame) {
                throw new Error('[guide] missing sprite frame: popup_guide_bubble');
            }
            this._applySpriteFrame(gb.node, frame, w, h, Sprite.Type.SLICED);
        },

        // ==================== 工具方法 ====================

        getCanvasUiHost(): Node {
            return this.node.parent || this.node;
        },

        requireCanvasUiRoot(name: string): Node {
            const host = this.getCanvasUiHost();
            const screenRoot = host.getChildByName('ScreenRoot');
            const node = screenRoot?.getChildByName(name) || host.getChildByName(name);
            if (!node) {
                throw new Error(`[SceneUI] ${this.node?.scene?.name || 'Current scene'} is missing root node: ${name}`);
            }
            return node;
        },

        requireUiChild(parent: Node, name: string, context?: string): Node {
            const node = parent.getChildByName(name);
            if (!node) {
                const parentPath = context || `${parent.name}/${name}`;
                throw new Error(`[SceneUI] ${this.node?.scene?.name || 'Current scene'} is missing node: ${parentPath}`);
            }
            return node;
        },

        clearChildrenExcept(node: Node, keepNames: string[]) {
            const keep = new Set(keepNames);
            for (const child of [...node.children]) {
                if (keep.has(child.name)) continue;
                child.removeFromParent();
                child.destroy();
            }
        },

        deactivateMainMenuNode() {
            const menuRoot = this.findMainMenuRoot();
            if (menuRoot?.isValid) {
                menuRoot.active = false;
            }
            if (this.mainMenuNode?.isValid) {
                this.mainMenuNode.active = false;
            }
            this.mainMenuNode = null;
        },

        _applySpriteFrame(node: Node, sf: SpriteFrame, w: number, h: number, type: any = Sprite.Type.SIMPLE) {
            const sp = node.getComponent(Sprite) || node.addComponent(Sprite);
            sp.type = type;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = sf;
            node.getComponent(UITransform)!.setContentSize(w, h);
        },

        showToastAt(text: string, duration: number, x: number, y: number) {
            const toast = new Node('Toast');
            this.node.addChild(toast);
            toast.addComponent(UITransform).setContentSize(720, 1280);
            toast.layer = Layers.Enum.UI_2D;
            const bubble = new Node('ToastBubble');
            toast.addChild(bubble);
            bubble.layer = Layers.Enum.UI_2D;
            bubble.setPosition(x, y, 0);
            bubble.addComponent(UITransform).setContentSize(420, 100);
            const bubbleFrame = this.getSF('popup_guide_bubble');
            if (!bubbleFrame) {
                throw new Error('[toast] missing sprite frame: popup_guide_bubble');
            }
            this._applySpriteFrame(bubble, bubbleFrame, 420, 100, Sprite.Type.SLICED);
            syncGuideLeaderboardLabelNode(bubble, 'ToastLbl', text, 24, new Color('#5A4A3A'), 340, 48, 0, 4);
        
            tween(bubble).set({ scale: new Vec3(0.5, 0.5, 1) }).to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' }).start();
        
            this.scheduleOnce(() => {
                tween(bubble).to(0.2, { scale: new Vec3(0.8, 0.8, 1) }, { easing: 'sineIn' }).call(() => toast.destroy()).start();
            }, duration);
        },

        /** 弹出提示：在屏幕中央显示一个圆角气泡，N秒后自动消失 */
        showToast(text: string, duration: number = 1.5) {
            this.showToastAt(text, duration, 0, 0);
        },

        showToastBelowTimer(text: string, duration: number = 1.5) {
            const timerNode = this.timerLabel?.node;
            const timerWrap = timerNode?.parent;
            const timerUT = timerWrap?.getComponent(UITransform);
            const rootUT = this.node.getComponent(UITransform);
            if (!timerWrap || !timerUT || !rootUT) {
                this.showToast(text, duration);
                return;
            }
            const worldPos = timerUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const localPos = rootUT.convertToNodeSpaceAR(worldPos);
            this.showToastAt(text, duration, localPos.x, localPos.y - 72);
        },

        // ==================== 排行榜 ====================
        
        getWeChatRuntime (): any {
            const rawWx = typeof globalThis !== 'undefined' ? (globalThis as any).__rawWx : null;
            const windowWx = typeof window !== 'undefined' ? (window as any).wx : null;
            const globalAdapter = typeof window !== 'undefined' ? (window as any).__globalAdapter : null;
            const globalWx = typeof globalThis !== 'undefined' ? (globalThis as any).wx : null;
            return rawWx || windowWx || globalAdapter || globalWx || null;
        },

        isWeChatDevtoolsRuntime(): boolean {
            const wx = this.getWeChatRuntime();
            if (!wx) return false;
            try {
                const info = wx.getDeviceInfo?.() || wx.getSystemInfoSync?.() || {};
                return info?.platform === 'devtools';
            } catch (_) {
                return false;
            }
        },

        shouldUseBrowserMainMenuPreview(): boolean {
            return !sys.isNative
                && typeof window !== 'undefined'
                && !this._isWeChat()
                && !this._isUrlRemote()
                && this.hasLocalUserState();
        },

        getDefaultEntryLevel(): number {
            return this.getSavedLevel();
        },

        getWeChatOpenDataContext (): any {
            return this.getWeChatRuntime()?.getOpenDataContext?.() || null;
        },

        stopFriendRankInertia() {
            if (this._friendRankInertiaStep) {
                this.unschedule(this._friendRankInertiaStep);
                this._friendRankInertiaStep = null;
            }
            this._friendRankScrollVelocity = 0;
        },

        flushFriendRankScroll(openDataContext: any) {
            if (!openDataContext?.postMessage) {
                return;
            }
            const offsetPx = Math.max(0, this._friendRankPendingScrollOffset);
            const offset = offsetPx / LEADERBOARD_ROW_PITCH;
            try {
                openDataContext.postMessage({ type: 'scroll', offset, offsetPx });
                this._friendRankLastScrollPostAt = Date.now();
            } catch (err) {
                console.warn('[GameCtrl] failed to post friend-rank scroll:', err);
            }
        },

        postFriendRankScroll(openDataContext: any, offsetPx: number, force: boolean = false) {
            this._friendRankScrollOffset = Math.max(0, offsetPx);
            this._friendRankPendingScrollOffset = this._friendRankScrollOffset;
            if (!openDataContext?.postMessage) {
                return;
            }
            const now = Date.now();
            if (force || now - this._friendRankLastScrollPostAt >= FRIEND_RANK_SCROLL_POST_INTERVAL_MS) {
                this.flushFriendRankScroll(openDataContext);
                return;
            }
            if (this._friendRankScrollPostScheduled) {
                return;
            }
            this._friendRankScrollPostScheduled = true;
            this.scheduleOnce(() => {
                this._friendRankScrollPostScheduled = false;
                this.flushFriendRankScroll(openDataContext);
            }, 0);
        },

        startFriendRankInertia(openDataContext: any) {
            if (!openDataContext?.postMessage || Math.abs(this._friendRankScrollVelocity) < LEADERBOARD_SCROLL_MIN_SPEED) {
                this.stopFriendRankInertia();
                return;
            }
            this.stopFriendRankInertia();
            this._friendRankInertiaStep = (dt: number = 1 / 60) => {
                if (!openDataContext?.postMessage) {
                    this.stopFriendRankInertia();
                    return;
                }
                if (this._friendRankScrollOffset <= 0 && this._friendRankScrollVelocity < 0) {
                    this.postFriendRankScroll(openDataContext, 0, true);
                    this.stopFriendRankInertia();
                    return;
                }
                this.postFriendRankScroll(openDataContext, this._friendRankScrollOffset + this._friendRankScrollVelocity * dt);
                this._friendRankScrollVelocity *= LEADERBOARD_SCROLL_DECAY;
                if (Math.abs(this._friendRankScrollVelocity) < LEADERBOARD_SCROLL_MIN_SPEED) {
                    this.stopFriendRankInertia();
                }
            };
            this.schedule(this._friendRankInertiaStep, 0);
        },

        deactivateWeChatFriendRank(reason: string = 'unknown') {
            const openDataContext = this.getWeChatOpenDataContext();
            this.stopFriendRankInertia();
            if (openDataContext?.postMessage) {
                try {
                    openDataContext.postMessage({ type: 'deactivate', reason });
                } catch (err) {
                    console.warn('[GameCtrl] failed to deactivate openDataContext:', err);
                }
            }
            this._friendRankScrollOffset = 0;
            this._friendRankLastMoveAt = 0;
            this._friendRankTouchStartY = 0;
            this._friendRankPendingScrollOffset = 0;
            this._friendRankLastScrollPostAt = 0;
            this._friendRankScrollPostScheduled = false;
        },

        setLeaderboardHintToTop(hintNode: Node) {
            hintNode.setPosition(0, 248);
            hintNode.getComponent(UITransform)?.setContentSize(420, 28);
        },

        setLeaderboardHintToBottom(hintNode: Node) {
            hintNode.setPosition(0, -474);
            hintNode.getComponent(UITransform)?.setContentSize(520, 28);
        },

        async openLeaderboard() {
            return ensureLeaderboardPanelController(this).open();
        },

        async switchLeaderboardTab(box: Node, hintNode: Node, tab: 'global' | 'friend') {
            const listNode = box.getChildByName('LeaderboardList');
            const selfBox = box.getChildByName('LeaderboardSelfBox');
            if (!listNode || !selfBox) return;
        
            this.clearLeaderboardAuthButtons(box);
            this.deactivateWeChatFriendRank(tab === 'global' ? 'switch-to-global' : 'switch-tab-reset');
            this.resetLeaderboardListState?.(listNode);
        
            if (tab === 'global') {
                await this.loadGlobalLeaderboard(box, listNode, selfBox, hintNode);
            } else {
                if (!this.getWeChatRuntime()) {
                    this.showUnsupportedFriendLeaderboard(listNode, selfBox, hintNode);
                } else if (UserMgr.inst.isWeChatAuthorized) {
                    await this.loadWeChatFriendLeaderboard(box, listNode, hintNode, selfBox);
                } else {
                    this.addAuthButtonForGuest(box, box.parent, listNode, selfBox, hintNode);
                    const profile = UserMgr.inst.getProfile();
                    this.renderLeaderboardSelfEntry(selfBox, {
                        rank: 0,
                        displayName: profile.displayName,
                        avatarUrl: profile.avatarUrl,
                        progressLevel: profile.lastLevelId || 1,
                    });
                }
            }
        },

        showUnsupportedFriendLeaderboard(listNode: Node, selfBox: Node, hintNode: Node) {
            const hintLabel = hintNode.getComponent(Label);
            if (hintLabel) {
                this.setLeaderboardHintToBottom(hintNode);
                hintLabel.string = '当前平台暂未接入好友排行';
                hintLabel.color = new Color('#B07B4F');
            }
        
            syncGuideLeaderboardLabelNode(listNode, 'FriendRankUnsupported', '好友排行暂不可用', 24, new Color('#8A7A6A'), 360, 40, 0, 96);
            syncGuideLeaderboardLabelNode(listNode, 'FriendRankUnsupportedSub', '全国排行可正常查看，好友排行后续接入当前平台能力', 17, new Color('#B09A84'), 420, 48, 0, 52);
        
            const profile = UserMgr.inst.getProfile();
            this.renderLeaderboardSelfEntry(selfBox, {
                rank: 0,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
                progressLevel: profile.lastLevelId || 1,
            });
        },

        async loadWeChatFriendLeaderboard(box: Node, listNode: Node, hintNode: Node, selfBox: Node) {
            this.resetLeaderboardListState?.(listNode);
        
            const profile = UserMgr.inst.getProfile();
            await LeaderboardMgr.inst.submitProgress(profile.lastLevelId || 1, profile);
            if (!box.isValid) return;
            void this.getWeChatFriendAvatarEntries();
        
            if (this.getWeChatOpenDataContext()) {
                this.showOpenDataCanvas(box, listNode, hintNode);
            } else {
                await this.showFriendRankList(box, listNode, hintNode, selfBox);
                if (!box.isValid) return;
            }
        
            await this.renderSelfInFriendRank(selfBox, profile);
        },
    });
}
