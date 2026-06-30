import {
    _decorator, Component, Node, UITransform, Sprite, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Color, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
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
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, BoardViewportController
} from '../GameCtrlShared';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { ensureLeaderboardPanelController } from '../Panels/LeaderboardPanelController';
import { getWeChatMiniGameRuntime } from '../MiniGamePlatform';
import { ToastService } from '../ToastService';
import { debugPerfTrace } from '../DebugPerfTrace';

function setGuideLeaderboardPrefabLabel(parent: Node, name: string, text: string): Label {
    const node = parent.getChildByName(name);
    if (!node) {
        throw new Error(`[leaderboard-prefab] missing node: ${name}`);
    }
    const label = node.getComponent(Label);
    if (!label) {
        throw new Error(`[leaderboard-prefab] missing label on ${name}`);
    }
    label.string = text;
    node.active = true;
    return label;
}

export function installGuideLeaderboardModule(target: any): void {
    Object.assign(target, {
        beginModalFocus(reason: string = 'modal') {
            this._modalFocusRefs = Math.max(0, Number(this._modalFocusRefs) || 0) + 1;
            this.suspendGuideForModal(reason);
        },

        endModalFocus(reason: string = 'modal') {
            this._modalFocusRefs = Math.max(0, (Number(this._modalFocusRefs) || 0) - 1);
            if (this._modalFocusRefs === 0) {
                this.resumeGuideAfterModal(reason);
            }
        },

        suspendGuideForModal(_reason: string = 'modal') {
            this._guideInputSuspended = true;
            this.clearGuideRuntimeVisuals();
            if (this._guideLayer?.isValid) {
                this._guideLayer.active = false;
            }
        },

        resumeGuideAfterModal(_reason: string = 'modal') {
            if ((Number(this._modalFocusRefs) || 0) > 0) return;
            if (!this._guideInputSuspended) return;
            this._guideInputSuspended = false;
            if (this._guideStep < 0 || this._guideStep >= this._guideTotalSteps) return;
            if (!this._guideLayer?.isValid) return;
            this._guideLayer.active = true;
            if (this._guideMask?.isValid) {
                this._guideMask.active = true;
            }
            this.showGuideStep(this._guideStep);
        },

        clearGuideRuntimeVisuals() {
            if (this._guideHand?.isValid) {
                Tween.stopAllByTarget(this._guideHand);
                this._guideHand.active = false;
            }
            if (this._guideMask?.isValid) {
                const gm = this._guideMask.getComponent(Graphics);
                if (gm) gm.clear();
                this._guideMask.active = false;
            }
            if (this._guideBubble?.isValid) {
                const gb = this._guideBubble.getComponent(Graphics);
                if (gb) gb.clear();
                this._guideBubble.active = false;
            }
            if (typeof this.clearGuideHighlight === 'function') {
                this.clearGuideHighlight();
            }
            const layer = this._guideLayer as Node | null;
            if (!layer?.isValid) return;
            const transientNames = new Set(['GuideHighlight', 'GuideTapRing']);
            for (const child of [...layer.children]) {
                if (!transientNames.has(child.name)) continue;
                Tween.stopAllByTarget(child);
                const opacity = child.getComponent(UIOpacity);
                if (opacity) Tween.stopAllByTarget(opacity);
                child.destroy();
            }
        },

        isGuideModalLauncherHit(node: Node | null, worldPos: Vec3, padding: number = 12): boolean {
            if (!node?.isValid || !node.active) return false;
            const ui = node.getComponent(UITransform);
            if (!ui) return false;
            const local = ui.convertToNodeSpaceAR(worldPos);
            return Math.abs(local.x) <= ui.contentSize.width / 2 + padding
                && Math.abs(local.y) <= ui.contentSize.height / 2 + padding;
        },

        tryHandleGuideSystemModalTap(worldPos: Vec3): boolean {
            const topBar = this.getGameplayFixedGroup?.('TopBarGroup') || null;
            const settingsButton = topBar?.getChildByName('Settings')
                || topBar?.getChildByName('SettingsButton')
                || null;
            if (!this.isGuideModalLauncherHit(settingsButton, worldPos)) return false;
            AudioMgr.inst.play('button');
            this.openSettingsPanel();
            return true;
        },

        raiseGuideHandAboveHighlights(hand?: Node) {
            const layer = this._guideLayer as Node | null;
            const guideHand = hand || this._guideHand;
            if (!layer?.isValid || !guideHand?.isValid || guideHand.parent !== layer) return;

            let nextIndex = 0;
            if (this._guideMask?.isValid && this._guideMask.parent === layer) {
                this._guideMask.setSiblingIndex(nextIndex++);
            }
            for (const child of [...layer.children]) {
                if (child.isValid && (child.name === 'GuideHighlight' || child.name === 'GuideTapRing')) {
                    child.setSiblingIndex(nextIndex++);
                }
            }
            guideHand.setSiblingIndex(nextIndex++);
            if (this._guideBubble?.isValid && this._guideBubble.parent === layer) {
                this._guideBubble.setSiblingIndex(nextIndex++);
            }
        },

        /** 手势引导：手停在豆豆块上方，执行点击动作 */
        startHandGestureToBoard(block: BeanBlockInfo, hand: Node, targetOffsetY: number = 0) {
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
            this.setGuideHandTarget(hand, boardCenter.x + blockX, boardCenter.y + blockY + targetOffsetY);
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
            const base = new Vec3(hand.position.x, hand.position.y, hand.position.z);
            tween(hand)
                .delay(0.3)
                .repeatForever(
                    tween(hand)
                        .to(0.26, { position: new Vec3(base.x, base.y + 18, base.z) }, { easing: 'sineOut' })
                        .to(0.30, { position: new Vec3(base.x, base.y - 8, base.z) }, { easing: 'quadIn' })
                        .call(() => {
                            if (this._guideMode === 'level_1' || this._guideMode === 'level_2') this.playGuideHandTapRipple?.(hand);
                        })
                        .delay(0.22)
                )
                .start();
        },

        playGuideHandTapRipple(hand: Node) {
            const layer = this._guideLayer as Node | null;
            if (!layer?.isValid || !hand?.isValid || hand.parent !== layer) return;

            const ring = new Node('GuideTapRing');
            layer.addChild(ring);
            ring.layer = layer.layer;
            ring.addComponent(UITransform).setContentSize(112, 112);
            const visualFingertipOffsetX = -31;
            const visualFingertipOffsetY = 43;
            ring.setPosition(
                hand.position.x + visualFingertipOffsetX,
                hand.position.y + visualFingertipOffsetY,
                0,
            );
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

            this.raiseGuideHandAboveHighlights(hand);
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
            if (this._guideInputSuspended) return;
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
                    this.scheduleOnce(() => this.playPatternCompleteThenWin(), 0.3);
                }
            } else {
                this._guidePhase = this.getTutorialPhaseForStep(nextStep);
                this.showGuideStep(nextStep);
            }
        },

        getTutorialPhaseForStep(step: number): string {
            if (this._guideMode === 'level_exp_slot_intro') {
                return 'unlock';
            }
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
            this._guideInputSuspended = false;
            this._guideStep = -1;
            this._guideMode = 'none';
            this._guideTotalSteps = 0;
            this._lastGuideVoiceToken = '';
            this.hideTutorialSkipGuidePrompt?.();
            this.clearGuideHighlight();
            if (this._guideBubble?.isValid) {
                this._guideBubble.active = false;
            }
            if (this._guideLayer) {
                Tween.stopAllByTarget(this._guideHand!);
                this._guideLayer.destroy();
                this._guideLayer = null;
                this._guideMask = null;
                this._guideHand = null;
                this._guideBubble = null;
                this._guideBubbleLbl = null;
                this._guidePromptDefaultLabelColor = null;
                this._guidePromptDefaultCenterY = null;
            }
            this.unschedule(this.tickTimer);
            if (!this._currentLevelUnlimitedTime) {
                this.schedule(this.tickTimer, 1);
            }
            this.resetIdleHintTimer();
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

        getToastHost(): Node {
            return ToastService.getToastHost(this);
        },

        destroyToastNode(toast: Node | null) {
            ToastService.destroyLegacyToastNode(this, toast);
        },

        clearToastNodes() {
            ToastService.clear(this);
        },

        showToastAt(text: string, duration: number, x: number, y: number) {
            ToastService.showAt(this, text, duration, x, y);
        },

        /** 弹出提示：在屏幕中央显示临时文本，N秒后自动消失 */
        showToast(text: string, duration: number = 1.5) {
            ToastService.show(this, text, duration);
        },

        showToastBelowTimer(text: string, duration: number = 1.5) {
            ToastService.showBelowTimer(this, text, duration);
        },

        // ==================== 排行榜 ====================
        
        getWeChatRuntime (): any {
            return getWeChatMiniGameRuntime();
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
            const isMiniGame = typeof this._isMiniGame === 'function' ? this._isMiniGame() : this._isWeChat();
            return !sys.isNative
                && typeof window !== 'undefined'
                && !isMiniGame
                && !this._isUrlLevelPreview()
                && this.hasLocalUserState();
        },

        getDefaultEntryLevel(): number {
            return this.getSavedLevel();
        },

        getWeChatOpenDataContext (): any {
            if (!this._isWeChat()) return null;
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
            const shouldNotifyOpenDataContext = !!this._friendRankOpenDataActive;
            const openDataContext = shouldNotifyOpenDataContext ? this.getWeChatOpenDataContext() : null;
            this.stopFriendRankInertia();
            debugPerfTrace('friendRank.openData.deactivate', {
                reason,
                skippedInactiveOpenData: !shouldNotifyOpenDataContext,
                hasOpenDataContext: !!openDataContext,
                hasPostMessage: !!openDataContext?.postMessage,
            });
            if (openDataContext?.postMessage) {
                try {
                    openDataContext.postMessage({ type: 'deactivate', reason });
                } catch (err) {
                    console.warn('[GameCtrl] failed to deactivate openDataContext:', err);
                }
            }
            this._friendRankOpenDataActive = false;
            this._friendRankScrollOffset = 0;
            this._friendRankLastMoveAt = 0;
            this._friendRankTouchStartY = 0;
            this._friendRankPendingScrollOffset = 0;
            this._friendRankLastScrollPostAt = 0;
            this._friendRankScrollPostScheduled = false;
        },

        getLeaderboardHintNode(hintNode: Node, placement: 'top' | 'bottom'): Node {
            const parent = hintNode.parent;
            const topNode = parent?.getChildByName('HintAnchor') || hintNode;
            const bottomNode = parent?.getChildByName('HintBottomAnchor') || topNode;
            topNode.active = placement === 'top';
            if (bottomNode !== topNode) {
                bottomNode.active = placement === 'bottom';
            }
            return placement === 'bottom' ? bottomNode : topNode;
        },

        setLeaderboardHintToTop(hintNode: Node) {
            this.getLeaderboardHintNode(hintNode, 'top');
        },

        setLeaderboardHintToBottom(hintNode: Node) {
            this.getLeaderboardHintNode(hintNode, 'bottom');
        },

        setLeaderboardHintText(hintNode: Node, placement: 'top' | 'bottom', text: string): Label {
            const targetNode = this.getLeaderboardHintNode(hintNode, placement);
            const hintLabel = targetNode.getComponent(Label);
            if (!hintLabel) {
                throw new Error(`[leaderboard-prefab] missing label on ${targetNode.name}`);
            }
            hintLabel.string = text;
            return hintLabel;
        },

        beginLeaderboardTabRequest(tab: 'global' | 'friend'): number {
            this._leaderboardActiveTab = tab;
            this._leaderboardTabRequestId = (this._leaderboardTabRequestId || 0) + 1;
            return this._leaderboardTabRequestId;
        },

        isLeaderboardTabRequestCurrent(requestToken: number): boolean {
            return !requestToken || this._leaderboardTabRequestId === requestToken;
        },

        resetLeaderboardHintState(hintNode: Node) {
            this.setLeaderboardHintText(hintNode, 'top', '');
        },

        async openLeaderboard() {
            return ensureLeaderboardPanelController(this).open();
        },

        async switchLeaderboardTab(box: Node, hintNode: Node, tab: 'global' | 'friend') {
            const listNode = box.getChildByName('LeaderboardList');
            const selfBox = box.getChildByName('LeaderboardSelfBox');
            if (!listNode || !selfBox) return;
            const requestToken = this.beginLeaderboardTabRequest(tab);
        
            this.clearLeaderboardAuthButtons(box);
            this.deactivateWeChatFriendRank(tab === 'global' ? 'switch-to-global' : 'switch-tab-reset');
            this.resetLeaderboardHintState(hintNode);
            this.resetLeaderboardListState?.(listNode);
        
            if (tab === 'global') {
                await this.loadGlobalLeaderboard(box, listNode, selfBox, hintNode, requestToken);
            } else {
                if (!this.getWeChatRuntime()) {
                    if (!this.isLeaderboardTabRequestCurrent(requestToken)) return;
                    this.showUnsupportedFriendLeaderboard(listNode, selfBox, hintNode);
                } else if (UserMgr.inst.isWeChatAuthorized) {
                    await this.loadWeChatFriendLeaderboard(box, listNode, hintNode, selfBox, requestToken);
                } else {
                    if (!this.isLeaderboardTabRequestCurrent(requestToken)) return;
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
            this.setLeaderboardHintText(hintNode, 'bottom', '当前平台暂未接入好友排行');
        
            setGuideLeaderboardPrefabLabel(listNode, 'FriendRankUnsupported', '好友排行暂不可用');
            setGuideLeaderboardPrefabLabel(listNode, 'FriendRankUnsupportedSub', '全国排行可正常查看，好友排行后续接入当前平台能力');
        
            const profile = UserMgr.inst.getProfile();
            this.renderLeaderboardSelfEntry(selfBox, {
                rank: 0,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
                progressLevel: profile.lastLevelId || 1,
            });
        },

        async loadWeChatFriendLeaderboard(box: Node, listNode: Node, hintNode: Node, selfBox: Node, requestToken?: number) {
            const isCurrentRequest = () => !requestToken || this.isLeaderboardTabRequestCurrent?.(requestToken) !== false;
            this.resetLeaderboardListState?.(listNode);
        
            const profile = UserMgr.inst.getProfile();
            void LeaderboardMgr.inst.submitProgress(profile.lastLevelId || 1, profile);
            void this.getWeChatFriendAvatarEntries();
        
            if (this.getWeChatOpenDataContext()) {
                if (!isCurrentRequest()) return;
                this.showOpenDataCanvas(box, listNode, hintNode);
            } else {
                await this.showFriendRankList(box, listNode, hintNode, selfBox, requestToken);
                if (!box.isValid || !isCurrentRequest()) return;
            }
        
            const selfEntry = await this.buildFriendSelfEntry(profile);
            if (!box.isValid || !selfBox.isValid || !isCurrentRequest()) return;
            this.renderLeaderboardSelfEntry(selfBox, selfEntry);
        },
    });
}
