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
import { runtimeWarn } from '../RuntimeLog';

type BoardTapCandidate = {
    row: number;
    col: number;
    distSq: number;
    centerDistSq: number;
    visualCoreHit: boolean;
    order: number;
    block?: BeanBlockInfo | null;
};

type BoardTapResolution = {
    candidates: BoardTapCandidate[];
    candidate: BoardTapCandidate | null;
    block: BeanBlockInfo | null;
    source: 'direct' | 'adjacent' | 'miss';
};

export function installBoardInputViewportModule(target: any): void {
    Object.assign(target, {
        getGameplayNodeBoundsInFixedRoot(node: Node | null): { left: number; right: number; bottom: number; top: number } | null {
            if (!node?.isValid || !node.active) return null;
            const nodeUi = node.getComponent(UITransform);
            const fixedRoot = typeof this.getGameplayFixedRoot === 'function' ? this.getGameplayFixedRoot() : null;
            const fixedUi = fixedRoot?.getComponent(UITransform);
            if (!nodeUi || !fixedUi) return null;
            const halfW = nodeUi.contentSize.width / 2;
            const halfH = nodeUi.contentSize.height / 2;
            const corners = [
                new Vec3(-halfW, -halfH, 0),
                new Vec3(-halfW, halfH, 0),
                new Vec3(halfW, -halfH, 0),
                new Vec3(halfW, halfH, 0),
            ];
            let left = Number.POSITIVE_INFINITY;
            let right = Number.NEGATIVE_INFINITY;
            let bottom = Number.POSITIVE_INFINITY;
            let top = Number.NEGATIVE_INFINITY;
            for (const corner of corners) {
                const world = nodeUi.convertToWorldSpaceAR(corner);
                const local = fixedUi.convertToNodeSpaceAR(world);
                left = Math.min(left, local.x);
                right = Math.max(right, local.x);
                bottom = Math.min(bottom, local.y);
                top = Math.max(top, local.y);
            }
            if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(bottom) || !Number.isFinite(top)) return null;
            return { left, right, bottom, top };
        },

        getGameplayNodeVerticalBoundsInFixedRoot(node: Node | null): { bottom: number; top: number } | null {
            const bounds = this.getGameplayNodeBoundsInFixedRoot(node);
            return bounds ? { bottom: bounds.bottom, top: bounds.top } : null;
        },

        mergeVerticalBounds(
            current: { bottom: number; top: number } | null,
            next: { bottom: number; top: number } | null,
        ): { bottom: number; top: number } | null {
            if (!next) return current;
            if (!current) return next;
            return {
                bottom: Math.min(current.bottom, next.bottom),
                top: Math.max(current.top, next.top),
            };
        },

        getGameplayChildrenVerticalBounds(parent: Node | null): { bottom: number; top: number } | null {
            if (!parent?.isValid || !parent.active) return null;
            let bounds: { bottom: number; top: number } | null = null;
            for (const child of parent.children) {
                if (!child?.isValid || !child.active) continue;
                bounds = this.mergeVerticalBounds(bounds, this.getGameplayNodeVerticalBoundsInFixedRoot(child));
            }
            return bounds;
        },

        getTopBarAvoidBottomY(): number | null {
            try {
                const topBar = this.getGameplayFixedGroup?.('TopBarGroup') || null;
                const bounds = this.getGameplayChildrenVerticalBounds(topBar);
                return Number.isFinite(bounds?.bottom) ? bounds!.bottom : null;
            } catch {
                return null;
            }
        },

        getBottomHudAvoidTopY(): number | null {
            let bounds: { bottom: number; top: number } | null = null;
            bounds = this.mergeVerticalBounds(bounds, this.getGameplayNodeVerticalBoundsInFixedRoot(this.slotAreaNode || null));
            try {
                const skillRoot = this.getGameplayBottomHudChild?.('SkillArea') || null;
                bounds = this.mergeVerticalBounds(bounds, this.getGameplayChildrenVerticalBounds(skillRoot));
            } catch {}
            return Number.isFinite(bounds?.top) ? bounds!.top : null;
        },

        getBoardSafeViewportRect(): { left: number; right: number; bottom: number; top: number } {
            const gap = 12;
            const marginX = 18;
            const viewSize = view.getVisibleSize();
            const visibleW = Math.max(viewSize.width || 0, (this.constructor as any).VIEWPORT_WIDTH);
            const visibleH = Math.max(viewSize.height || 0, (this.constructor as any).VIEWPORT_HEIGHT);
            const left = -visibleW / 2 + marginX;
            const right = visibleW / 2 - marginX;
            let top = this.getTopBarY() - 30 - gap;
            const topBarBottom = this.getTopBarAvoidBottomY();
            if (topBarBottom !== null) {
                top = Math.min(top, topBarBottom - gap);
            }
            let bottom = -visibleH / 2 + 180;
            if (this.shouldShowSlotArea() && this.slotAreaNode?.isValid) {
                const slotUT = this.slotAreaNode.getComponent(UITransform);
                const slotScale = Math.abs(this.slotAreaNode.scale.y || 1);
                const slotH = (slotUT?.contentSize.height ?? 0) * slotScale;
                bottom = this.slotAreaNode.position.y + slotH / 2 + gap;
            } else {
                bottom = -visibleH / 2 + 120;
            }
            const bottomHudTop = this.getBottomHudAvoidTopY();
            if (bottomHudTop !== null) {
                bottom = Math.max(bottom, bottomHudTop + gap);
            }
            const rawTop = top;
            const rawBottom = bottom;
            const minViewportH = Math.min(
                Math.max(240, visibleH * 0.34),
                Math.max(120, visibleH - 220),
            );
            if (top <= bottom + minViewportH) {
                const center = (top + bottom) / 2;
                const halfH = minViewportH / 2;
                const minCenter = -visibleH / 2 + 110 + halfH;
                const maxCenter = visibleH / 2 - 110 - halfH;
                const safeCenter = Math.max(minCenter, Math.min(maxCenter, center));
                bottom = safeCenter - halfH;
                top = safeCenter + halfH;
                if (typeof this.getUrlDebug === 'function' && this.getUrlDebug()) {
                    console.warn('[BoardViewport] expanded collapsed safe rect', {
                        rawTop,
                        rawBottom,
                        top,
                        bottom,
                        visibleH,
                    });
                }
            }
            if (top <= bottom + 80) {
                const center = (top + bottom) / 2;
                return {
                    left,
                    right,
                    bottom: center - 40,
                    top: center + 40,
                };
            }
            return { left, right, bottom, top };
        },

        setViewTransformClamped(scale: number, offset: Vec2): void {
            this.boardViewport.setViewTransformClamped(scale, offset);
            this.boardViewScale = this.boardViewport.scale;
            this.refreshBoardZoomControl?.();
        },

        getBoardViewportScaleNormalized(): number {
            return this.boardViewport?.getScaleNormalized?.() ?? 0;
        },

        setBoardViewportScaleNormalized(value: number): void {
            if (!this.boardViewport) return;
            this.boardViewport.setScaleNormalized(value);
            this.boardViewScale = this.boardViewport.scale;
            this.refreshBoardZoomControl?.();
        },

        resetBoardViewportToHome(): void {
            if (!this.boardViewport) return;
            if (typeof this.resetTouchState === 'function') {
                this.resetTouchState();
            }
            this.boardViewport.resetToHome();
            this.boardViewScale = this.boardViewport.scale;
            this.refreshBoardZoomControl?.();
        },

        resetBoardViewportToHomeForSkill(onDone: () => void): void {
            const group = this.boardGroup;
            const viewport = this.boardViewport;
            if (!group?.isValid || !viewport) {
                onDone();
                return;
            }
            if (typeof this.resetTouchState === 'function') {
                this.resetTouchState();
            }

            const home = viewport.getHomeTransform();
            const homeScale = home.scale;
            const homePos = new Vec3(home.offset.x, home.offset.y, 0);
            if (viewport.isAtHome()) {
                viewport.resetToHome();
                this.boardViewScale = viewport.scale;
                this.refreshBoardZoomControl?.();
                onDone();
                return;
            }

            Tween.stopAllByTarget(group);
            tween(group)
                .to(0.22, {
                    position: new Vec3(homePos.x, homePos.y, 0),
                    scale: new Vec3(homeScale, homeScale, 1),
                }, { easing: 'sineOut' })
                .call(() => {
                    viewport.resetToHome();
                    this.boardViewScale = viewport.scale;
                    this.refreshBoardZoomControl?.();
                    onDone();
                })
                .start();
        },

        setGestureMode(mode: GestureMode): void {
            this.gestureMode = mode;
        },

        zoomBoardViewportAround(uiPos: Vec2, boardLocal: Vec2, nextScale: number) {
            this.boardViewport.zoomAround(uiPos, boardLocal, nextScale);
            this.boardViewScale = this.boardViewport.scale;
            this.refreshBoardZoomControl?.();
        },

        beginPinchFromActiveTouches(): boolean {
            const ids = Array.from(this.activeBoardTouches.keys());
            if (ids.length < 2) return false;
            const nextIds: [number, number] = this.pinchTouchIds
                && this.activeBoardTouches.has(this.pinchTouchIds[0])
                && this.activeBoardTouches.has(this.pinchTouchIds[1])
                ? this.pinchTouchIds
                : [ids[0], ids[1]];
            const p1 = this.activeBoardTouches.get(nextIds[0])!;
            const p2 = this.activeBoardTouches.get(nextIds[1])!;
            const center = new Vec2((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
            const anchorLocal = this.uiToBoardLocal(center);
            if (!anchorLocal) return false;
        
            this.setGestureMode('pinching');
            this.suppressTap = true;
            this.pinchTouchIds = nextIds;
            this.pinchStartDist = Math.max(1, Vec2.distance(p1, p2));
            this.pinchStartScale = this.boardViewScale || this.boardGroup.scale.x;
            this.pinchAnchorBoardLocal.set(anchorLocal.x, anchorLocal.y);
            this.totalMoveDistance = 0;
            if (this._pinchGuideLayer) {
                this.closePinchGuide();
            }
            return true;
        },

        handlePinchMoveFromActiveTouches(): boolean {
            if (!this.pinchTouchIds) return false;
            const p1 = this.activeBoardTouches.get(this.pinchTouchIds[0]);
            const p2 = this.activeBoardTouches.get(this.pinchTouchIds[1]);
            if (!p1 || !p2) return false;
        
            const dist = Math.max(1, Vec2.distance(p1, p2));
            const center = new Vec2((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
            const minScale = Number(this.boardViewport?.minScale) || (this.constructor as any).MIN_SCALE;
            const maxScale = Number(this.boardViewport?.maxScale) || (this.constructor as any).MAX_SCALE;
            const nextScale = Math.max(
                minScale,
                Math.min(maxScale, this.pinchStartScale * (dist / this.pinchStartDist)),
            );
            this.zoomBoardViewportAround(center, this.pinchAnchorBoardLocal, nextScale);
            this.suppressTap = true;
            return true;
        },

        onTouchStart(event: EventTouch) {
            if (this.isGameEnd) return;
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) {
                this.resetTouchState();
                return;
            }
            if (this._skillActive && !this._wandMode) {
                this.resetTouchState();
                return;
            }
            PerformanceMgr.inst.markUserActivity();
            const firstTouchUiPos = event.getUILocation();
            const firstTouchWorldPos = new Vec3(firstTouchUiPos.x, firstTouchUiPos.y, 0);
            this.markFirstLevelTouchTiming?.();
            this.reportFirstLevelAnyTouch?.(firstTouchWorldPos, 'board_input', this._guideStep >= 0 ? 'tutorial' : 'free_play');
            if (this.isFirstLevelFunnelActive() && !this._firstFunnelTouchSent) {
                this._firstFunnelTouchSent = true;
                this.trackFirstLevelFunnel('first_touch', {
                    touchTarget: this.classifyFirstLevelTouchTarget(firstTouchWorldPos),
                    source: this._guideStep >= 0 ? 'tutorial' : 'free_play',
                });
            }
            if (this._wandMode) {
                const uiPos = event.getUILocation();
                this._wandDragStart = new Vec2(uiPos.x, uiPos.y);
                if (this._wandRectNode) {
                    this._wandRectStartPos.set(this._wandRectNode.position);
                }
                this.setGestureMode('idle');
                return;
            }
            // 引导期间禁止拖动/缩放，只允许点击
            if (this._guideStep >= 0) {
                const uiPos = event.getUILocation();
                this.setGestureMode('tapCandidate');
                this.panStartPos.set(uiPos.x, uiPos.y);
                return;
            }
            const touchCount = this.updateActiveBoardTouches(event);
            if (touchCount >= 2) {
                this.beginPinchFromActiveTouches();
                return;
            }
            const uiPos = event.getUILocation();
            this.suppressTap = false;
            this.pinchTouchIds = null;
            this.totalMoveDistance = 0;
            this.beginBoardPanFromUiPos(new Vec2(uiPos.x, uiPos.y));
        },

        onTouchMove(event: EventTouch) {
            if (this.isGameEnd) return;
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) {
                this.resetTouchState();
                return;
            }
            if (this._skillActive && !this._wandMode) {
                this.resetTouchState();
                return;
            }
            PerformanceMgr.inst.markUserActivity();
            if (this._wandMode && this._wandDragStart && this._wandRectNode) {
                const uiPos = event.getUILocation();
                const startLocal = this.uiToBoardLocal(this._wandDragStart);
                const currentLocal = this.uiToBoardLocal(uiPos);
                if (!startLocal || !currentLocal) return;
                const dx = currentLocal.x - startLocal.x;
                const dy = currentLocal.y - startLocal.y;
                this._wandRectNode.setPosition(
                    this._wandRectStartPos.x + dx,
                    this._wandRectStartPos.y + dy,
                    0,
                );
                return;
            }
            if (this._guideStep >= 0) return;  // 引导期间禁止拖动
            const touchCount = this.updateActiveBoardTouches(event);
            if (touchCount >= 2) {
                if (this.gestureMode !== 'pinching' || !this.pinchTouchIds) {
                    this.beginPinchFromActiveTouches();
                    return;
                }
                this.handlePinchMoveFromActiveTouches();
                return;
            }
            if (this.gestureMode === 'pinching'
                || (this.suppressTap && this.gestureMode !== 'tapCandidate' && this.gestureMode !== 'panning')) {
                return;
            }
            const uiPos = event.getUILocation();
            const rawDx = uiPos.x - this.panStartPos.x;
            const rawDy = uiPos.y - this.panStartPos.y;
            const parentPos = this.uiToViewportParent(new Vec2(uiPos.x, uiPos.y));
            const dx = parentPos.x - this.panStartParentPos.x;
            const dy = parentPos.y - this.panStartParentPos.y;
            this.totalMoveDistance = Math.max(this.totalMoveDistance, Math.hypot(rawDx, rawDy));
            if (this.gestureMode !== 'panning' && Math.hypot(rawDx, rawDy) > (this.constructor as any).DRAG_THRESHOLD) {
                this.setGestureMode('panning');
                this.suppressTap = true;
            }
            if (this.gestureMode === 'panning') {
                const panSensitivity = (this.constructor as any).BOARD_PAN_SENSITIVITY ?? 1;
                this.setGroupPosClamped(
                    this.panStartGroupPos.x + dx * panSensitivity,
                    this.panStartGroupPos.y + dy * panSensitivity,
                );
            }
        },

        onTouchEnd(event: EventTouch) {
            if (this.isGameEnd) { this.resetTouchState(); return; }
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) { this.resetTouchState(); return; }
            if (this._skillActive && !this._wandMode) { this.resetTouchState(); return; }
            if (this._wandMode && this._wandRectNode) {
                // 如果魔方框没有被移动过，提醒用户先移动
                if (Vec3.equals(this._wandRectNode.position, Vec3.ZERO)) {
                    this.showToast('拖动魔方框到目标位置，松手生效', 2);
                    this.resetTouchState();
                    return;
                }
                this.executeWandAtCurrentPos();
                this.cleanupWandMode();
                this.resetTouchState();
                return;
            }
            // 新手引导期间：限制用户只能操作引导指定的区域
            if (this._guideStep >= 0) {
                if (this.gestureMode === 'tapCandidate') {
                    const uiPos = event.getUILocation();
                    const worldPos = new Vec3(uiPos.x, uiPos.y, 0);
                    this.handleGuideTap(worldPos);
                }
                this.resetTouchState();
                return;
            }
            const touchCount = this.updateActiveBoardTouches(event, true);
            if (this.gestureMode === 'pinching') {
                this.pinchTouchIds = null;
                this.setGestureMode('idle');
                this.suppressTap = true;
                if (touchCount > 0) {
                    const remaining = Array.from(this.activeBoardTouches.values())[0];
                    if (remaining) {
                        this.beginBoardPanFromUiPos(remaining, true);
                        this.suppressTap = true;
                    }
                    return;
                }
                this.resetTouchState();
                return;
            }
            if (this.suppressTap || this.totalMoveDistance > (this.constructor as any).DRAG_THRESHOLD) {
                if (touchCount > 0) return;
                this.resetTouchState();
                return;
            }
            if (this.gestureMode === 'tapCandidate' && !this.suppressTap) {
                const uiPos = event.getUILocation();
                const worldPos = new Vec3(uiPos.x, uiPos.y, 0);
                if (this.isSelected && this.currentBlock) {
                    if (!this.tryReselectOrPlace(worldPos)) {
                        this.handlePlace(worldPos);
                    }
                } else {
                    // 重叠区域优先：先检测暂存槽区域，再检测棋盘区域
                    if (!this.trySelectSlot(worldPos) && !this.isWorldPosInSlotArea(worldPos)) {
                        this.trySelectBoard(worldPos);
                    }
                }
            }
            this.resetTouchState();
        },

        resetTouchState() {
            this.setGestureMode('idle');
            this.suppressTap = false;
            this.activeBoardTouches.clear();
            this.pinchTouchIds = null;
            this.pinchStartDist = 0;
            this.pinchStartScale = this.boardViewScale || (this.boardGroup ? this.boardGroup.scale.x : 1);
            this.totalMoveDistance = 0;
        },

        /** PC 端滚轮缩放棋盘 */
        onMouseWheel(event: EventMouse) {
            if (this.isGameEnd || this._guideStep >= 0) return;
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) return;
            if (this._skillActive && !this._wandMode) return;
            PerformanceMgr.inst.markUserActivity();
        
            const scrollY = event.getScrollY();
            if (scrollY === 0) return;
        
            const currentScale = this.boardViewScale || this.boardGroup.scale.x;
            // 滚轮向上（scrollY > 0）放大，向下缩小
            const delta = scrollY > 0 ? 0.08 : -0.08;
            let newScale = currentScale + delta;
            const minScale = Number(this.boardViewport?.minScale) || (this.constructor as any).MIN_SCALE;
            const maxScale = Number(this.boardViewport?.maxScale) || (this.constructor as any).MAX_SCALE;
            newScale = Math.max(minScale, Math.min(maxScale, newScale));
        
            const uiLoc = typeof (event as any).getUILocation === 'function'
                ? (event as any).getUILocation()
                : null;
            const anchorUi = uiLoc
                ? new Vec2(uiLoc.x, uiLoc.y)
                : new Vec2(
                    Math.max(view.getVisibleSize().width || 0, (this.constructor as any).VIEWPORT_WIDTH) / 2,
                    Math.max(view.getVisibleSize().height || 0, (this.constructor as any).VIEWPORT_HEIGHT) / 2,
                );
            const anchorLocal = this.uiToBoardLocal(anchorUi) || new Vec2(0, 0);
            this.zoomBoardViewportAround(anchorUi, anchorLocal, newScale);
        },

        /** 限制棋盘组位置，保证不与暂存槽重叠 */
        setGroupPosClamped(x: number, y: number) {
            const scale = this.boardViewScale || this.boardGroup.scale.x;
            this.setViewTransformClamped(scale, new Vec2(x, y));
        },

        /** Optional board tap diagnostics, enabled with debugBoardTap=1. */
        traceBoardTapSelection(worldPos: Vec3, candidates: BoardTapCandidate[], block: BeanBlockInfo | null, source: string): void {
            if (typeof this.getRuntimeQueryParam !== 'function' || this.getRuntimeQueryParam('debugBoardTap') !== '1') return;
            const boardLocal = this.worldToBoardLocal(worldPos);
            runtimeWarn('[BoardTapTrace]', JSON.stringify({
                worldPos: { x: Number(worldPos.x.toFixed(2)), y: Number(worldPos.y.toFixed(2)) },
                boardLocal: boardLocal ? { x: Number(boardLocal.x.toFixed(2)), y: Number(boardLocal.y.toFixed(2)) } : null,
                candidates: candidates.slice(0, 6).map((candidate) => ({
                    row: candidate.row,
                    col: candidate.col,
                    dist: Number(Math.sqrt(candidate.distSq).toFixed(2)),
                    centerDist: Number(Math.sqrt(candidate.centerDistSq).toFixed(2)),
                    visualCoreHit: !!candidate.visualCoreHit,
                    currentColor: this.boardModel.currentColors[candidate.row]?.[candidate.col] || 0,
                    correctColor: this.boardModel.correctColors[candidate.row]?.[candidate.col] || 0,
                    locked: !!this.boardModel.locked[candidate.row]?.[candidate.col],
                    blockColor: candidate.block?.colorId || 0,
                })),
                selectedColor: block?.colorId || 0,
                source,
            }));
        },

        getBoardTapVisualHalfSizeLocal(kind: 'select' | 'place' = 'select'): number {
            if (kind !== 'select') return Math.max(1, this.cellSize / 2);
            const visualSize = typeof this.getBoardBeanVisualSize === 'function'
                ? Number(this.getBoardBeanVisualSize())
                : this.cellSize;
            const safeVisualSize = Number.isFinite(visualSize) && visualSize > 0 ? visualSize : this.cellSize;
            return Math.max(1, Math.min(this.cellSize / 2, safeVisualSize / 2));
        },

        compareBoardTapCandidates(a: BoardTapCandidate, b: BoardTapCandidate): number {
            const aBucket = a.visualCoreHit ? 0 : 1;
            const bBucket = b.visualCoreHit ? 0 : 1;
            if (aBucket !== bBucket) return aBucket - bBucket;
            if (a.centerDistSq !== b.centerDistSq) return a.centerDistSq - b.centerDistSq;
            if (a.distSq !== b.distSq) return a.distSq - b.distSq;
            return a.order - b.order;
        },

        resolveBoardTapBlock(worldPos: Vec3, allowAdjacentFallback: boolean = false): BoardTapResolution {
            const candidates = this.getBoardTapCandidates(worldPos);
            if (candidates.length === 0) {
                return { candidates, candidate: null, block: null, source: 'miss' };
            }

            let selectedCandidate: BoardTapCandidate | null = null;
            let selectedBlock: BeanBlockInfo | null = null;
            let source: 'direct' | 'adjacent' | 'miss' = 'miss';
            for (const candidate of candidates) {
                const currentColor = this.boardModel.currentColors[candidate.row]?.[candidate.col] || 0;
                if (currentColor === 0 || this.boardModel.locked[candidate.row]?.[candidate.col]) continue;
                const preferredCorrectColor = this.boardModel.correctColors[candidate.row][candidate.col];
                candidate.block = this.boardModel.getConnectedBlock(candidate.row, candidate.col, preferredCorrectColor);
                if (candidate.block) {
                    selectedCandidate = candidate;
                    selectedBlock = candidate.block;
                    source = 'direct';
                    break;
                }
            }

            if (!selectedBlock && allowAdjacentFallback) {
                for (const candidate of candidates) {
                    const preferredCorrectColor = this.boardModel.correctColors[candidate.row][candidate.col];
                    candidate.block = this.boardModel.getConnectedBlockOrAdjacent(candidate.row, candidate.col, preferredCorrectColor);
                    if (candidate.block) {
                        selectedCandidate = candidate;
                        selectedBlock = candidate.block;
                        source = 'adjacent';
                        break;
                    }
                }
            }

            return { candidates, candidate: selectedCandidate, block: selectedBlock, source };
        },

        applyBoardSelection(block: BeanBlockInfo): void {
            this.currentBlock = block;
            this.isSelected = true;
            this.resetIdleHintTimer();
            this.ensureTimerStarted();
            if (this.isFirstLevelFunnelActive() && !this._firstFunnelSelectSent) {
                this._firstFunnelSelectSent = true;
                this.trackFirstLevelFunnel('first_valid_select', {
                    touchTarget: 'board',
                    source: this._guideStep >= 0 ? 'tutorial' : 'free_play',
                    success: true,
                    extra: { colorId: block.colorId, cellCount: block.cells.length },
                });
            }
            AudioMgr.inst.play('select'); AudioMgr.inst.vibrateSelect();
            this.showSelectionHighlight(block);
        },

        /** 第一次点击棋盘：默认只选中直接命中的连通块。 */
        trySelectBoard(worldPos: Vec3, allowAdjacentFallback: boolean = false): boolean {
            const resolution = this.resolveBoardTapBlock(worldPos, allowAdjacentFallback);
            this.traceBoardTapSelection(worldPos, resolution.candidates, resolution.block, resolution.block ? resolution.source : 'miss');
            if (!resolution.block) {
                return false;
            }
            this.applyBoardSelection(resolution.block);
            return true;
        },

        /** 第一次点击暂存槽：选中同色所有豆豆 */
        trySelectSlot(worldPos: Vec3): boolean {
            if (!this.isSlotAreaInteractive()) return false;
            const slotUT = this.slotAreaNode.getComponent(UITransform)!;
            const localPos = slotUT.convertToNodeSpaceAR(worldPos);
            if (Math.abs(localPos.x) > slotUT.contentSize.width / 2 || Math.abs(localPos.y) > slotUT.contentSize.height / 2) return false;
        
            for (let i = 0; i < this.slotNodes.length; i++) {
                const sp = this.slotNodes[i].position;
                if (Math.abs(localPos.x - sp.x) < (SLOT_SIZE + SLOT_HIT_PADDING) / 2 && Math.abs(localPos.y - sp.y) < (SLOT_SIZE + SLOT_HIT_PADDING) / 2) {
                    const row = Math.floor(i / SLOTS_PER_ROW);
                    // 锁定行只能通过 SlotRowLockedBtn 按钮解锁。
                    if (row >= this.slotUnlockedRows) {
                        return false;
                    }
                    const target = this.slotModel.getBlock(i);
                    if (!target) continue;
                    const colorId = target.colorId;
        
                    // 收集所有同色槽位索引（不真正取出）
                    const slotIndices: number[] = [];
                    const allCells: { row: number; col: number }[] = [];
                    const allBlocks = this.slotModel.getAll();
                    for (let j = 0; j < allBlocks.length; j++) {
                        if (allBlocks[j] && allBlocks[j]!.colorId === colorId) {
                            slotIndices.push(j);
                            allCells.push(...allBlocks[j]!.cells);
                        }
                    }
        
                    this.currentBlock = {
                        colorId,
                        cells: allCells,
                        isLocked: false,
                        source: 'slot',
                    };
                    this._selectedSlotIndices = slotIndices;
                    this.isSelected = true;
                    this.resetIdleHintTimer();
                    this.ensureTimerStarted();
                    if (this.isFirstLevelFunnelActive() && !this._firstFunnelSelectSent) {
                        this._firstFunnelSelectSent = true;
                        this.trackFirstLevelFunnel('first_valid_select', {
                            touchTarget: 'slot',
                            source: this._guideStep >= 0 ? 'tutorial' : 'free_play',
                            success: true,
                            extra: { colorId, cellCount: allCells.length },
                        });
                    }
                    AudioMgr.inst.play('select'); AudioMgr.inst.vibrateSelect();
        
                    // 选中效果：豆豆保持在暂存槽原位，显示高亮选中环
                    this.showSlotSelectionHighlight(slotIndices);
                    return true;
                }
            }
            return false;
        },

        /** 已选中豆豆块时，检测点击位置是否为不同颜色的豆豆块；若是则归还当前块并选中新块 */
        tryReselectOrPlace(worldPos: Vec3): boolean {
            const block = this.currentBlock!;
            const fromSlot = block.source === 'slot';
            const slotAreaHit = this.isWorldPosInSlotArea(worldPos);
        
            const boardTarget = this.getBoardPlaceTargetFromWorldPos(worldPos, block.colorId, fromSlot);
            if (boardTarget && !slotAreaHit) {
                return this.placeCurrentBlockOnBoard(boardTarget);
            }
        
            // 暂存槽优先：重叠区域优先检查暂存槽
            if (slotAreaHit) {
                if (!fromSlot) {
                    return false;
                }
                const slotUT = this.slotAreaNode.getComponent(UITransform)!;
                const slotLocal = slotUT.convertToNodeSpaceAR(worldPos);
                for (let i = 0; i < this.slotNodes.length; i++) {
                    const sp = this.slotNodes[i].position;
                    if (Math.abs(slotLocal.x - sp.x) < SLOT_SIZE / 2 && Math.abs(slotLocal.y - sp.y) < SLOT_SIZE / 2) {
                        const row = Math.floor(i / SLOTS_PER_ROW);
                        // 锁定行不可交互
                        if (row >= this.slotUnlockedRows) return false;
                        const target = this.slotModel.getBlock(i);
                        if (target) {
                            if (target.colorId !== block.colorId) {
                                this.cancelSelection();
                                this.trySelectSlot(worldPos);
                                return true;
                            }
                            // 同色且来自暂存槽 → 取消选中
                            this.playReturnFeedback();
                            this.cancelSelection();
                            return true;
                        }
                    }
                }
                return false;
            }
        
            // 检查棋盘上是否点到了不同颜色的豆豆块。
            const boardResolution = this.resolveBoardTapBlock(worldPos);
            const tappedBoardBlock = boardResolution.block;
            this.traceBoardTapSelection(worldPos, boardResolution.candidates, tappedBoardBlock, tappedBoardBlock ? 'reselect' : 'miss');
            if (tappedBoardBlock) {
                const isSameBlock = !fromSlot && tappedBoardBlock.cells.some((cell) =>
                    block.cells.some((selectedCell) => selectedCell.row === cell.row && selectedCell.col === cell.col)
                );
                if (isSameBlock) {
                    this.playReturnFeedback();
                    this.cancelSelection();
                    return true;
                }
                this.cancelSelection();
                this.applyBoardSelection(tappedBoardBlock);
                return true;
            }

            if (fromSlot && !this.isWorldPosInSlotArea(worldPos) && this.isWorldPosNearBoardPlaceArea(worldPos, true)) {
                this.playReturnFeedback();
                return true;
            }
        
            return false;
        },

        /** 选中棋盘豆豆块：整块上浮 */
        showSelectionHighlight(block: BeanBlockInfo) {
            this.clearDragNodes();
            this.stopPulseTweens();
            this.clearSelectionOverlay();
            this._floatingCells = block.cells.map(c => ({ row: c.row, col: c.col }));
        
            const floatY = Math.max(1, Math.round(this.cellSize * 0.18));
        
            for (const cell of block.cells) {
                const cellNode = this.cellNodes[cell.row]?.[cell.col];
                if (!cellNode) continue;
                Tween.stopAllByTarget(cellNode);
                const origPos = cellNode.position;
                tween(cellNode)
                    .to(0.16, {
                        position: new Vec3(origPos.x, origPos.y + floatY, 0),
                        scale: new Vec3(1.04, 1.04, 1),
                    }, { easing: 'backOut' })
                    .start();
            }
        },

        /** 选中暂存槽豆豆：上浮 */
        showSlotSelectionHighlight(slotIndices: number[]) {
            this.clearDragNodes();
            this.stopPulseTweens();
            this.clearSelectionOverlay();
        
            if (!this.slotModel.getAll()[slotIndices[0]]) return;
            this._floatingSlots = [...slotIndices];
            const floatY = Math.max(5, Math.round(this.cellSize * 0.18));
            for (const idx of slotIndices) {
                const slotNode = this.slotNodes[idx];
                if (!slotNode) continue;
                const beanNode = slotNode.getChildByName('Bean');
                if (!beanNode) continue;
                Tween.stopAllByTarget(beanNode);
                beanNode.setPosition(0, 0, 0);
                beanNode.setScale(1, 1, 1);
                tween(beanNode)
                    .to(0.16, {
                        position: new Vec3(0, floatY, 0),
                        scale: new Vec3(1.04, 1.04, 1),
                    }, { easing: 'backOut' })
                    .start();
            }
        },

        /** 选中特效：原位切到选中豆豆，并播放一次匹配帧 */
        playSelectionLoopOn(parent: Node, effectSize: number, beanSize: number, beanFrame: SpriteFrame | null) {
            const frames = this.getEffectFrames('block_match-animation_', 19);
            if (frames.length === 0) return;
        
            const fx = new Node('selMatchLoop');
            parent.addChild(fx);
            fx.addComponent(UITransform).setContentSize(effectSize, effectSize);
            fx.layer = Layers.Enum.UI_2D;
            fx.setPosition(0, 0, 0);
        
            const selectedBean = new Node('selBean');
            fx.addChild(selectedBean);
            selectedBean.addComponent(UITransform).setContentSize(beanSize, beanSize);
            selectedBean.layer = Layers.Enum.UI_2D;
            const selectedSp = selectedBean.addComponent(Sprite);
            selectedSp.sizeMode = Sprite.SizeMode.CUSTOM;
            selectedSp.spriteFrame = beanFrame;
        
            const matchNode = new Node('selMatchSprite');
            fx.addChild(matchNode);
            matchNode.addComponent(UITransform).setContentSize(
                effectSize + Math.max(8, Math.round(effectSize * 0.14)),
                effectSize + Math.max(8, Math.round(effectSize * 0.14)),
            );
            matchNode.layer = Layers.Enum.UI_2D;
            const sp = matchNode.addComponent(Sprite);
            sp.spriteFrame = frames[0];
            let chain = tween(fx);
            for (let i = 1; i < frames.length; i++) {
                const frame = frames[i];
                chain = chain.delay(0.03).call(() => {
                    if (fx.isValid) sp.spriteFrame = frame;
                });
            }
            chain.start();
        
            this._selectionOverlayNodes.push(fx);
        },

        isWorldPosInSlotArea(worldPos: Vec3): boolean {
            if (!this.isSlotAreaInteractive()) return false;
            const slotUT = this.slotAreaNode.getComponent(UITransform)!;
            const slotLocal = slotUT.convertToNodeSpaceAR(worldPos);
            return Math.abs(slotLocal.x) < slotUT.contentSize.width / 2
                && Math.abs(slotLocal.y) < slotUT.contentSize.height / 2;
        },

        getBoardCellCenterLocal(row: number, col: number): Vec2 {
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
            const step = this.cellSize + this.cellGap;
            return new Vec2(
                (col - bw / 2 + 0.5) * step,
                (bh / 2 - row - 0.5) * step,
            );
        },

        getBoardCellWorldPosition(row: number, col: number): Vec3 | null {
            if (!this.boardNode?.isValid || !this.levelData) return null;
            if (row < 0 || row >= this.levelData.boardHeight || col < 0 || col >= this.levelData.boardWidth) return null;
            const boardUT = this.boardNode.getComponent(UITransform);
            if (!boardUT) return null;
            const center = this.getBoardCellCenterLocal(row, col);
            return boardUT.convertToWorldSpaceAR(new Vec3(center.x, center.y, 0));
        },

        getBoardCellLayerPosition(row: number, col: number, layer: Node): Vec3 | null {
            const world = this.getBoardCellWorldPosition(row, col);
            const layerUT = layer?.getComponent(UITransform) || null;
            if (!world || !layerUT) return null;
            const local = layerUT.convertToNodeSpaceAR(world);
            return new Vec3(local.x, local.y, local.z);
        },

        getBoardTapCandidates(worldPos: Vec3, kind: 'select' | 'place' = 'select'): BoardTapCandidate[] {
            const boardLocal = this.worldToBoardLocal(worldPos);
            if (!boardLocal) return [];
            const tolerance = this.getBoardHitToleranceLocal(kind);
            const centerCell = this.boardLocalToGrid(boardLocal, tolerance);
            if (!centerCell) return [];
            const searchRadius = this.getBoardCandidateRadius(tolerance);
            const maxDistSq = tolerance * tolerance;
            const visualHalf = this.getBoardTapVisualHalfSizeLocal(kind);
            const candidates: BoardTapCandidate[] = [];
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
            let order = 0;
        
            for (let dr = -searchRadius; dr <= searchRadius; dr++) {
                for (let dc = -searchRadius; dc <= searchRadius; dc++) {
                    const row = centerCell.row + dr;
                    const col = centerCell.col + dc;
                    if (row < 0 || row >= bh || col < 0 || col >= bw) continue;
                    const distance = this.getDistanceToBoardCellRect(boardLocal, row, col);
                    const distSq = distance * distance;
                    if (distSq <= maxDistSq) {
                        const center = this.getBoardCellCenterLocal(row, col);
                        const centerDx = boardLocal.x - center.x;
                        const centerDy = boardLocal.y - center.y;
                        candidates.push({
                            row,
                            col,
                            distSq,
                            centerDistSq: centerDx * centerDx + centerDy * centerDy,
                            visualCoreHit: Math.abs(centerDx) <= visualHalf && Math.abs(centerDy) <= visualHalf,
                            order,
                        });
                    }
                    order += 1;
                }
            }
        
            candidates.sort((a, b) => this.compareBoardTapCandidates(a, b));
            return candidates;
        },

        getBoardCellFromWorldPos(worldPos: Vec3): { row: number; col: number } | null {
            const candidate = this.getBoardTapCandidates(worldPos)[0];
            if (candidate) return { row: candidate.row, col: candidate.col };
        
            const boardLocal = this.worldToBoardLocal(worldPos);
            return boardLocal ? this.boardLocalToGrid(boardLocal) : null;
        },

        getBoardPlaceTargetFromWorldPos(worldPos: Vec3, colorId: number, fromSlot: boolean = false): { row: number; col: number } | null {
            const localPos = this.worldToBoardLocal(worldPos);
            if (!localPos) return null;
        
            const tolerance = fromSlot ? this.getSlotBoardPlaceToleranceLocal() : this.getBoardHitToleranceLocal('place');
            const tappedCell = this.boardLocalToGrid(localPos, tolerance);
            if (!tappedCell) return null;
        
            const radius = this.getBoardCandidateRadius(tolerance);
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
            let bestTarget: { row: number; col: number } | null = null;
            let bestScore = Number.POSITIVE_INFINITY;
        
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    const row = tappedCell.row + dr;
                    const col = tappedCell.col + dc;
                    if (row < 0 || row >= bh || col < 0 || col >= bw) continue;
                    if (this.boardModel.correctColors[row][col] !== colorId
                        || this.boardModel.currentColors[row][col] !== 0
                        || this.boardModel.locked[row][col]) continue;
        
                    const distance = this.getDistanceToBoardCellRect(localPos, row, col);
                    if (distance > tolerance) continue;
        
                    const score = distance + Math.max(Math.abs(dr), Math.abs(dc)) * 0.01;
                    if (score < bestScore) {
                        bestScore = score;
                        bestTarget = { row, col };
                    }
                }
            }
        
            return bestTarget;
        },

        isWorldPosNearBoardPlaceArea(worldPos: Vec3, fromSlot: boolean = false): boolean {
            const localPos = this.worldToBoardLocal(worldPos);
            if (!localPos) return false;
            const tolerance = fromSlot ? this.getSlotBoardPlaceToleranceLocal() : this.getBoardHitToleranceLocal('place');
            return this.boardLocalToGrid(localPos, tolerance) !== null;
        },

        placeCurrentBlockOnBoard(target: { row: number; col: number }): boolean {
            const block = this.currentBlock!;
            if (this.isFirstLevelFunnelActive() && !this._firstFunnelPlaceAttemptSent) {
                this._firstFunnelPlaceAttemptSent = true;
                this.trackFirstLevelFunnel('first_place_attempt', {
                    touchTarget: 'board',
                    source: this._guideStep >= 0 ? 'tutorial' : 'free_play',
                    extra: { colorId: block.colorId, sourceBlock: block.source },
                });
            }
            const sources = this.collectSourceWorldPositions(block);
            const dirtyBoardCells = block.source === 'board'
                ? block.cells.map((cell) => ({ row: cell.row, col: cell.col }))
                : [];
            const dirtySlotIndices = [...this._selectedSlotIndices];
            const selectedSlotSnapshot = block.source === 'slot'
                ? this.captureSelectedSlotSnapshot()
                : [];
        
            if (block.source === 'board') {
                this.boardModel.removeBlock(block);
            } else {
                this.removeBlockFromSlotsKeepingGaps();
            }
            const result = this.boardModel.placeBlockMaximize(block, target.row, target.col);
            this._lastPlacedCells = result.placed;
            if (result.placed.length === 0) {
                if (block.source === 'board') {
                    this.boardModel.restoreBlock(block);
                } else {
                    this.restoreBlockToSlots(selectedSlotSnapshot);
                }
                this.playReturnFeedback();
                this.finishPlace();
                return true;
            }
            if (this.isFirstLevelFunnelActive() && !this._firstFunnelPlaceSuccessSent) {
                this._firstFunnelPlaceSuccessSent = true;
                this.trackFirstLevelFunnel('first_place_success', {
                    touchTarget: 'board',
                    source: this._guideStep >= 0 ? 'tutorial' : 'free_play',
                    success: true,
                    extra: { colorId: block.colorId, placedCount: result.placed.length, sourceBlock: block.source },
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
                if (result.remaining > 0) {
                    this.renderSlotIndices(dirtySlotIndices);
                }
            }
            const afterFlyLanded = block.source === 'slot'
                ? (done: () => void) => this.compactSlotsAfterSelectionConsume(done)
                : undefined;
            const flyVisualOptions = this.createFlyPlaceVisualOptions(block);
            this.startFlyPlace(block.colorId, sources, result.placed, dirtyBoardCells, dirtySlotIndices, afterFlyLanded, flyVisualOptions);
            return true;
        },
    });
}
