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
        acquireRuntimeOwner(scope: string, owner: string): string {
            const normalizedScope = String(scope || 'runtime');
            const normalizedOwner = String(owner || 'anonymous');
            const seq = Math.max(0, Number(this._runtimeOwnerSeq) || 0) + 1;
            this._runtimeOwnerSeq = seq;
            const token = `${normalizedScope}:${seq}:${normalizedOwner}`;
            const scopes: Map<string, Map<string, string>> = this._runtimeOwners
                || (this._runtimeOwners = new Map<string, Map<string, string>>());
            const owners = scopes.get(normalizedScope) || new Map<string, string>();
            owners.set(token, normalizedOwner);
            scopes.set(normalizedScope, owners);
            const metadata: Map<string, any> = this._runtimeOwnerMeta
                || (this._runtimeOwnerMeta = new Map<string, any>());
            metadata.set(token, {
                token,
                scope: normalizedScope,
                owner: normalizedOwner,
                startedAt: Date.now(),
            });
            return token;
        },

        releaseRuntimeOwner(token: string): boolean {
            const normalizedToken = String(token || '');
            if (!normalizedToken) return false;
            const scopes: Map<string, Map<string, string>> = this._runtimeOwners;
            if (!(scopes instanceof Map)) return false;
            for (const [scope, owners] of scopes.entries()) {
                if (!owners.delete(normalizedToken)) continue;
                this._runtimeOwnerMeta?.delete?.(normalizedToken);
                if (owners.size === 0) scopes.delete(scope);
                return true;
            }
            return false;
        },

        releaseRuntimeOwnerByName(scope: string, owner: string): boolean {
            const owners: Map<string, string> | undefined = this._runtimeOwners?.get?.(String(scope || ''));
            if (!(owners instanceof Map)) return false;
            const entries = [...owners.entries()];
            for (let index = entries.length - 1; index >= 0; index -= 1) {
                const [token, currentOwner] = entries[index];
                if (currentOwner !== String(owner || 'anonymous')) continue;
                return this.releaseRuntimeOwner(token);
            }
            return false;
        },

        getRuntimeOwnerCount(scope: string): number {
            const owners = this._runtimeOwners?.get?.(String(scope || ''));
            return owners instanceof Map ? owners.size : 0;
        },

        getRuntimeOwnerDiagnostics(): any[] {
            const metadata: Map<string, any> = this._runtimeOwnerMeta;
            if (!(metadata instanceof Map)) return [];
            const now = Date.now();
            return Array.from(metadata.values())
                .map((entry: any) => ({
                    token: String(entry?.token || ''),
                    scope: String(entry?.scope || ''),
                    owner: String(entry?.owner || ''),
                    startedAt: Math.max(0, Number(entry?.startedAt) || 0),
                    ageMs: Math.max(0, now - (Number(entry?.startedAt) || now)),
                }))
                .sort((a: any, b: any) => b.ageMs - a.ageMs);
        },

        clearRuntimeOwners(scope?: string): void {
            if (!(this._runtimeOwners instanceof Map)) {
                this._runtimeOwners = new Map<string, Map<string, string>>();
                this._runtimeOwnerMeta = new Map<string, any>();
                return;
            }
            if (scope) {
                const normalizedScope = String(scope);
                const owners: Map<string, string> | undefined = this._runtimeOwners.get(normalizedScope);
                if (owners instanceof Map) {
                    for (const token of owners.keys()) {
                        this._runtimeOwnerMeta?.delete?.(token);
                    }
                }
                this._runtimeOwners.delete(normalizedScope);
            } else {
                this._runtimeOwners.clear();
                this._runtimeOwnerMeta?.clear?.();
            }
        },

        auditRuntimeOwnersAfterForeground(): void {
            const canvas = this.node?.scene?.getChildByName('Canvas') || null;
            const screenRoot = canvas?.getChildByName('ScreenRoot') || null;
            const popupRoot = screenRoot?.getChildByName('PopupRoot') || canvas?.getChildByName('PopupRoot') || null;
            this.recoverExpiredPlacementOperationsAfterForeground?.();
            this.recoverSkillUsageAfterForeground?.();
            const rewardTransaction = this._rewardedGrantTransaction as any;
            if ((rewardTransaction?.phase === 'grant' || rewardTransaction?.phase === 'after_grant')
                && Number(rewardTransaction.deadlineAt) > 0
                && Number(rewardTransaction.deadlineAt) <= Date.now()) {
                this.showToast?.('奖励处理超时，请稍后查看到账结果');
                rewardTransaction.cancel?.('foreground-stage-timeout');
            }
            const hasExpectedModal = !!popupRoot?.children?.some?.((child: Node) =>
                child?.isValid && child.activeInHierarchy && !!child.getComponent(BlockInputEvents),
            );
            if (this.getRuntimeOwnerCount('modal') > 0 && !hasExpectedModal) {
                this.clearRuntimeOwners('modal');
                this._modalFocusRefs = 0;
                this.resumeGuideAfterModal?.('foreground-owner-recovery');
            }
            const loadingActive = !!this._loadingOverlay?.isValid && this._loadingOverlay.activeInHierarchy;
            if (this.getRuntimeOwnerCount('loading') > 0 && !loadingActive) {
                this.clearRuntimeOwners('loading');
                this._loadingOwnerToken = '';
            }
            const hasPlacementArtifacts = (Number(this._flyingTargets?.size) || 0) > 0
                || (Number(this._hiddenSlotIndices?.size) || 0) > 0;
            const placementWatchdogCount = Number(this._placementOperationWatchdogs?.size) || 0;
            if (this.getRuntimeOwnerCount('placement') > 0
                && !hasPlacementArtifacts
                && placementWatchdogCount === 0) {
                this.clearRuntimeOwners('placement');
                this._placementVisualRefs = 0;
            }
            const hasSettingsOverlay = !!popupRoot?.children?.some?.((child: Node) =>
                child?.isValid && child.name === 'SettingsOverlay',
            );
            const hasAcquireOverlay = !!popupRoot?.children?.some?.((child: Node) =>
                child?.isValid && child.name.includes('AcquireOverlay'),
            );
            const timerOwners = this.getRuntimeOwnerDiagnostics()
                .filter((entry: any) => entry.scope === 'timer');
            for (const entry of timerOwners) {
                const owner = String(entry.owner || '');
                const orphaned = (owner === 'settings' && !hasSettingsOverlay)
                    || (owner === 'resource-acquire' && !hasAcquireOverlay)
                    || (owner === 'skill-prop' && !this._skillActive);
                if (!orphaned) continue;
                this.releaseRuntimeOwner(entry.token);
                if (String(this._skillTimerPauseToken || '') === String(entry.token || '')) {
                    this._skillTimerPauseToken = '';
                }
                debugPerfTrace('timer.owner.foreground.recovered', entry);
            }
            this._timerPauseRefs = this.getRuntimeOwnerCount('timer');
            this._timerLockedForProp = this._timerPauseRefs > 0;
        },

        beginModalFocus(reason: string = 'modal'): string {
            const token = this.acquireRuntimeOwner('modal', reason);
            this._modalFocusRefs = this.getRuntimeOwnerCount('modal');
            this.suspendGuideForModal(reason);
            return token;
        },

        endModalFocus(tokenOrReason: string = 'modal') {
            const released = String(tokenOrReason || '').startsWith('modal:')
                ? this.releaseRuntimeOwner(tokenOrReason)
                : this.releaseRuntimeOwnerByName('modal', tokenOrReason);
            if (!released && (Number(this._modalFocusRefs) || 0) > 0) {
                debugPerfTrace('modal.owner.release.missing', { tokenOrReason });
            }
            this._modalFocusRefs = this.getRuntimeOwnerCount('modal');
            if (this._modalFocusRefs === 0) {
                this.resumeGuideAfterModal(tokenOrReason);
                const pendingReadyStep = Math.floor(Number(this._pendingTutorialInteractiveReadyStep));
                if (pendingReadyStep >= 0) {
                    this.markTutorialStepInteractiveReadyForFunnel?.(pendingReadyStep);
                }
            }
        },

        suspendGuideForModal(_reason: string = 'modal') {
            this._guideInputSuspended = true;
            if (this._guideStatus === 'transitioning') {
                this._guidePreviewStep = -1;
            }
            this.clearGuideReminderTimer?.(true, true);
            this.hideGuideReminderVisuals?.();
            this.clearGuideRuntimeVisuals(true);
            if (this._guideLayer?.isValid) {
                this._guideLayer.active = false;
            }
        },

        resumeGuideAfterModal(_reason: string = 'modal') {
            if ((Number(this._modalFocusRefs) || 0) > 0) return;
            if (!this._guideInputSuspended) return;
            this._guideInputSuspended = false;
            if (this._guideStep < 0 || this._guideStep >= this._guideTotalSteps) return;
            if (this._guideStatus === 'transitioning') {
                if (!this.isPlacementVisualBusy?.()) this.checkGuideStepComplete?.();
                return;
            }
            if (!this._guideLayer?.isValid) return;
            this._guideLayer.active = true;
            if (this._guideMask?.isValid) {
                this._guideMask.active = true;
            }
            this.showGuideStep(this._guideStep, { resumeOnly: true });
        },

        clearGuideRuntimeVisuals(preserveReminder: boolean = false) {
            this.clearGuideReminderTimer?.(true, preserveReminder);
            this.hideGuideReminderVisuals?.();
            this.clearGuideFeedbackVisuals?.();
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
            const transientNames = new Set([
                'GuideHighlight',
                'GuideTapRing',
                'GuideTargetFeedback',
                'GuideTapFeedback',
            ]);
            for (const child of [...layer.children]) {
                if (!transientNames.has(child.name)) continue;
                Tween.stopAllByTarget(child);
                const opacity = child.getComponent(UIOpacity);
                if (opacity) Tween.stopAllByTarget(opacity);
                child.destroy();
            }
        },

        requireGuideAuthoredTemplate(name: string): Node {
            const root = this.requireCanvasUiRoot?.('OverlayRoot') as Node | null;
            const templates = root?.getChildByName('OverlayTemplates') || null;
            const template = templates?.getChildByName(name) || null;
            if (!template?.isValid) {
                throw new Error(`[guide-feedback] Game.scene is missing OverlayTemplates/${name}`);
            }
            return template;
        },

        setGuideNodeLayerRecursively(node: Node, layer: number): void {
            node.layer = layer;
            for (const child of node.children) {
                this.setGuideNodeLayerRecursively?.(child, layer);
            }
        },

        instantiateGuideAuthoredTemplate(name: string, instanceName: string): Node {
            const layer = this._guideLayer as Node | null;
            if (!layer?.isValid) {
                throw new Error('[guide-feedback] GuideLayer is unavailable');
            }
            const instance = instantiate(this.requireGuideAuthoredTemplate(name));
            instance.name = instanceName;
            instance.active = true;
            layer.addChild(instance);
            this.setGuideNodeLayerRecursively?.(instance, layer.layer);
            return instance;
        },

        destroyGuideFeedbackNode(node: Node | null): void {
            if (!node?.isValid) return;
            Tween.stopAllByTarget(node);
            const opacity = node.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            node.destroy();
        },

        clearGuideFeedbackVisuals(): void {
            this.destroyGuideFeedbackNode?.(this._guideTargetFeedbackNode || null);
            this._guideTargetFeedbackNode = null;
            this.destroyGuideFeedbackNode?.(this._guideDimMaskNode || null);
            this._guideDimMaskNode = null;
            this.destroyGuideFeedbackNode?.(this._guideDemoAssistNode || null);
            this._guideDemoAssistNode = null;
            this._guideDemoPlayingUntil = 0;
            const transientNodes = Array.isArray(this._guideTransientFeedbackNodes)
                ? [...this._guideTransientFeedbackNodes]
                : [];
            this._guideTransientFeedbackNodes = [];
            for (const node of transientNodes) {
                this.destroyGuideFeedbackNode?.(node);
            }
            this._guidePreviewVisible = false;
        },

        convertGuideRootPointToLayer(point: Vec3): Vec3 {
            const layer = this._guideLayer as Node | null;
            const layerUT = layer?.getComponent(UITransform) || null;
            const sourceRoot = this._guideBubble?.parent as Node | null;
            const sourceUT = sourceRoot?.getComponent(UITransform) || null;
            if (!layer?.isValid || !layerUT || !sourceRoot?.isValid || !sourceUT) {
                return point.clone();
            }
            const world = sourceUT.convertToWorldSpaceAR(point);
            return layerUT.convertToNodeSpaceAR(world);
        },

        createGuideFeedbackRing(
            name: string,
            center: Vec3,
            width: number,
            height: number,
            color: Color,
            opacityValue: number,
        ): Node {
            const ring = this.instantiateGuideAuthoredTemplate(
                'GuideFeedbackRingTemplate',
                name,
            );
            const transform = ring.getComponent(UITransform);
            const sprite = ring.getComponent(Sprite);
            const opacity = ring.getComponent(UIOpacity);
            if (!transform || !sprite || !opacity) {
                ring.destroy();
                throw new Error('[guide-feedback] GuideFeedbackRingTemplate is incomplete');
            }
            ring.setPosition(center);
            transform.setContentSize(
                Math.max(92, Math.round(width)),
                Math.max(92, Math.round(height)),
            );
            sprite.color = color;
            opacity.opacity = Math.max(0, Math.min(255, Math.round(opacityValue)));
            return ring;
        },

        showGuideTargetFeedback(
            state: 'preview' | 'actionable' | 'reinforce' | 'success' = 'actionable',
            _reinforceCycles: number = 2,
        ): boolean {
            this.destroyGuideFeedbackNode?.(this._guideTargetFeedbackNode || null);
            this._guideTargetFeedbackNode = null;
            if (state === 'success') {
                const opacity = this._guideDimMaskNode?.getComponent(UIOpacity) || null;
                if (opacity) {
                    Tween.stopAllByTarget(opacity);
                    tween(opacity).to(0.18, { opacity: 112 }, { easing: 'sineOut' }).start();
                }
                return true;
            }
            const dimOpacity = state === 'preview' ? 112 : (state === 'reinforce' ? 172 : 132);
            return this.showGuideDimMask?.(dimOpacity, state === 'reinforce') === true;
        },

        showGuideDimMask(alphaValue: number = 132, animate: boolean = false): boolean {
            const bubble = this._guideBubble as Node | null;
            const layer = this._guideLayer as Node | null;
            const layerUT = layer?.getComponent(UITransform) || null;
            if (!bubble?.isValid || !layer?.isValid || !layerUT) return false;
            const bounds = this.getGuidePromptTargetBoundsForCurrentStep?.(bubble) || null;
            if (!bounds) return false;
            let mask = this._guideDimMaskNode as Node | null;
            if (!mask?.isValid) {
                mask = this.instantiateGuideAuthoredTemplate('GuideDimMaskTemplate', 'GuideDimMask');
                this._guideDimMaskNode = mask;
            }
            mask.active = true;
            mask.setSiblingIndex(0);
            const center = this.convertGuideRootPointToLayer(new Vec3(bounds.centerX, bounds.centerY, 0));
            const halfW = layerUT.contentSize.width / 2;
            const halfH = layerUT.contentSize.height / 2;
            const holeHalfW = Math.max(46, Number(bounds.width || 0) / 2 + 20);
            const holeHalfH = Math.max(46, Number(bounds.height || 0) / 2 + 20);
            const holeLeft = Math.max(-halfW, center.x - holeHalfW);
            const holeRight = Math.min(halfW, center.x + holeHalfW);
            const holeBottom = Math.max(-halfH, center.y - holeHalfH);
            const holeTop = Math.min(halfH, center.y + holeHalfH);
            const setPanel = (name: string, x: number, y: number, width: number, height: number) => {
                const panel = mask!.getChildByName(name);
                const transform = panel?.getComponent(UITransform) || null;
                if (!panel?.isValid || !transform) {
                    throw new Error(`[guide-feedback] GuideDimMaskTemplate is missing ${name}`);
                }
                panel.active = width > 0.5 && height > 0.5;
                if (!panel.active) return;
                transform.setContentSize(Math.max(1, width), Math.max(1, height));
                panel.setPosition(x, y, 0);
            };
            const topHeight = Math.max(0, halfH - holeTop);
            const bottomHeight = Math.max(0, holeBottom + halfH);
            const middleHeight = Math.max(0, holeTop - holeBottom);
            const leftWidth = Math.max(0, holeLeft + halfW);
            const rightWidth = Math.max(0, halfW - holeRight);
            setPanel('GuideDimTop', 0, holeTop + topHeight / 2, halfW * 2, topHeight);
            setPanel('GuideDimBottom', 0, -halfH + bottomHeight / 2, halfW * 2, bottomHeight);
            setPanel('GuideDimLeft', -halfW + leftWidth / 2, (holeTop + holeBottom) / 2, leftWidth, middleHeight);
            setPanel('GuideDimRight', holeRight + rightWidth / 2, (holeTop + holeBottom) / 2, rightWidth, middleHeight);
            const opacity = mask.getComponent(UIOpacity);
            if (!opacity) {
                throw new Error('[guide-feedback] GuideDimMaskTemplate is missing UIOpacity');
            }
            const nextOpacity = Math.max(0, Math.min(196, Math.round(alphaValue)));
            Tween.stopAllByTarget(opacity);
            if (animate) {
                tween(opacity).to(0.18, { opacity: nextOpacity }, { easing: 'sineOut' }).start();
            } else {
                opacity.opacity = nextOpacity;
            }
            return true;
        },

        getGuideVisualToken(): string {
            return [
                Number(this._gameplayInitSeq) || 0,
                this._guideMode || 'none',
                Math.floor(Number(this._guideStep) || 0),
                Number(this._guideActionEnabledAt) || 0,
            ].join(':');
        },

        isGuideVisualTokenCurrent(token: string): boolean {
            return !!token && token === this.getGuideVisualToken()
                && this._guideStep >= 0
                && !this._guideInputSuspended;
        },

        playGuidePathHint(repeatCount: number = 1, source: string = 'reminder'): boolean {
            const endpoints = this.getGuidePathEndpointsForCurrentStep?.() || null;
            if (!endpoints || !this._guideLayer?.isValid) return false;
            const token = this.getGuideVisualToken();
            const count = Math.max(1, Math.min(2, Math.floor(Number(repeatCount) || 1)));
            for (let index = 0; index < count; index++) {
                this.playSingleGuidePathHint?.(
                    endpoints.from,
                    endpoints.to,
                    index * 0.92,
                    token,
                    source,
                );
            }
            return true;
        },

        playSingleGuidePathHint(from: Vec3, to: Vec3, delaySeconds: number, token: string, source: string): void {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (!Number.isFinite(distance) || distance < 1) return;
            const path = this.instantiateGuideAuthoredTemplate('GuidePathHintTemplate', 'GuidePathHint');
            const dotTemplate = path.getChildByName('GuidePathDotTemplate');
            const arrow = path.getChildByName('GuidePathArrow');
            const opacity = path.getComponent(UIOpacity);
            if (!dotTemplate?.isValid || !arrow?.isValid || !opacity) {
                path.destroy();
                throw new Error('[guide-feedback] GuidePathHintTemplate is incomplete');
            }
            path.setSiblingIndex(Math.min(1, Math.max(0, this._guideLayer.children.length - 1)));
            const dotCount = Math.max(3, Math.min(9, Math.ceil(distance / 36)));
            const dots: Node[] = [];
            for (let index = 0; index < dotCount; index++) {
                const dot = instantiate(dotTemplate);
                dot.name = 'GuidePathDot';
                dot.active = false;
                path.addChild(dot);
                this.setGuideNodeLayerRecursively?.(dot, path.layer);
                const t = (index + 1) / (dotCount + 1);
                dot.setPosition(from.x + dx * t, from.y + dy * t, 0);
                dot.setScale(0.48, 0.48, 1);
                dots.push(dot);
            }
            arrow.active = false;
            arrow.setPosition(to);
            arrow.setScale(0.72, 0.72, 1);
            arrow.setRotationFromEuler(0, 0, Math.atan2(dy, dx) * 180 / Math.PI);
            opacity.opacity = 255;
            this._guideTransientFeedbackNodes = Array.isArray(this._guideTransientFeedbackNodes)
                ? this._guideTransientFeedbackNodes
                : [];
            this._guideTransientFeedbackNodes.push(path);
            const revealSpan = 0.46;
            dots.forEach((dot, index) => {
                const revealDelay = delaySeconds + (dotCount <= 1 ? 0 : revealSpan * index / (dotCount - 1));
                tween(dot)
                    .delay(revealDelay)
                    .call(() => {
                        if (!this.isGuideVisualTokenCurrent?.(token) || !dot.isValid) return;
                        dot.active = true;
                    })
                    .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
                    .start();
            });
            tween(arrow)
                .delay(delaySeconds + 0.46)
                .call(() => {
                    if (!this.isGuideVisualTokenCurrent?.(token) || !arrow.isValid) return;
                    arrow.active = true;
                })
                .to(0.12, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineOut' })
                .to(0.06, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
                .start();
            tween(opacity)
                .delay(delaySeconds + 0.58)
                .to(0.12, { opacity: 0 }, { easing: 'quadIn' })
                .call(() => {
                    this._guideTransientFeedbackNodes = (this._guideTransientFeedbackNodes || [])
                        .filter((node: Node) => node !== path);
                    this.destroyGuideFeedbackNode?.(path);
                })
                .start();
            this.trackFirstLevelFunnel?.('tutorial_path_hint_shown', {
                stepId: this._guideStep,
                stepName: this.getFirstLevelGuideStepKey?.(),
                source,
                success: true,
                extra: { dotCount, durationMs: 700, delayMs: Math.round(delaySeconds * 1000) },
            });
        },

        isGuideDemoTouchTarget(target: Node | null): boolean {
            let current = target;
            while (current?.isValid) {
                if (current.name === 'GuideDemoAssist' || current.name === 'GuideDemoButton') return true;
                if (current === this._guideLayer) break;
                current = current.parent;
            }
            return false;
        },

        showGuideDemoAssist(): boolean {
            if (this._guideStep < 0 || !this._guideLayer?.isValid || this._guideInputSuspended) return false;
            if (this._guideDemoAssistNode?.isValid) {
                this._guideDemoAssistNode.active = true;
                return true;
            }
            const assist = this.instantiateGuideAuthoredTemplate('GuideDemoAssistTemplate', 'GuideDemoAssist');
            const buttonNode = assist.getChildByName('GuideDemoButton');
            const button = buttonNode?.getComponent(Button) || null;
            const label = buttonNode?.getChildByName('GuideDemoButtonLabel')?.getComponent(Label) || null;
            const assistUT = assist.getComponent(UITransform);
            const layerUT = this._guideLayer.getComponent(UITransform);
            if (!buttonNode?.isValid || !button || !label || !assistUT || !layerUT) {
                assist.destroy();
                throw new Error('[guide-feedback] GuideDemoAssistTemplate is incomplete');
            }
            const bubble = this._guideBubble as Node | null;
            const bubbleUT = bubble?.getComponent(UITransform) || null;
            let desiredX = 0;
            let desiredY = assist.position.y;
            if (bubble?.isValid && bubbleUT) {
                const promptHeight = Math.max(1, Number(this.getGuidePromptVisualHeight?.(bubble)) || 116);
                const bubbleBottomWorld = bubbleUT.convertToWorldSpaceAR(
                    new Vec3(0, -promptHeight / 2, 0),
                );
                const bubbleBottom = layerUT.convertToNodeSpaceAR(bubbleBottomWorld);
                desiredX = bubbleBottom.x;
                desiredY = bubbleBottom.y - assistUT.contentSize.height / 2 - 12;
                const targetBounds = this.getGuidePromptTargetBoundsForCurrentStep?.(bubble) || null;
                if (targetBounds) {
                    const targetCenter = this.convertGuideRootPointToLayer(
                        new Vec3(targetBounds.centerX, targetBounds.centerY, 0),
                    );
                    const assistHalfW = assistUT.contentSize.width / 2;
                    const assistHalfH = assistUT.contentSize.height / 2;
                    const targetHalfW = Math.max(1, Number(targetBounds.width) || 0) / 2 + 18;
                    const targetHalfH = Math.max(1, Number(targetBounds.height) || 0) / 2 + 18;
                    const overlapsTarget = Math.abs(desiredX - targetCenter.x) < assistHalfW + targetHalfW
                        && Math.abs(desiredY - targetCenter.y) < assistHalfH + targetHalfH;
                    if (overlapsTarget) {
                        const bubbleTopWorld = bubbleUT.convertToWorldSpaceAR(
                            new Vec3(0, promptHeight / 2, 0),
                        );
                        const bubbleTop = layerUT.convertToNodeSpaceAR(bubbleTopWorld);
                        desiredY = bubbleTop.y + assistHalfH + 12;
                    }
                }
            }
            const halfW = layerUT.contentSize.width / 2;
            const halfH = layerUT.contentSize.height / 2;
            desiredX = Math.max(-halfW + assistUT.contentSize.width / 2 + 12, Math.min(
                desiredX,
                halfW - assistUT.contentSize.width / 2 - 12,
            ));
            desiredY = Math.max(-halfH + assistUT.contentSize.height / 2 + 12, Math.min(
                desiredY,
                halfH - assistUT.contentSize.height / 2 - 12,
            ));
            assist.setPosition(desiredX, desiredY, 0);
            assist.setSiblingIndex(this._guideLayer.children.length - 1);
            const stopDemoTouch = (event: EventTouch) => {
                event.propagationStopped = true;
            };
            buttonNode.on(Node.EventType.TOUCH_START, stopDemoTouch, this);
            buttonNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                this.playGuideDemonstration?.();
            }, this);
            this._guideDemoAssistNode = assist;
            return true;
        },

        playGuideDemonstration(): boolean {
            if (!this._guideDemoAssistNode?.isValid || this._guideInputSuspended || this._guideStep < 0) return false;
            const now = Date.now();
            if (now < (Number(this._guideDemoPlayingUntil) || 0)) return false;
            const buttonNode = this._guideDemoAssistNode.getChildByName('GuideDemoButton');
            const button = buttonNode?.getComponent(Button) || null;
            const label = buttonNode?.getChildByName('GuideDemoButtonLabel')?.getComponent(Label) || null;
            if (!button || !label) return false;
            const token = this.getGuideVisualToken();
            this._guideDemoPlayingUntil = now + 1500;
            button.interactable = false;
            label.string = '演示中…';
            this.showGuideTargetFeedback?.('reinforce', 1);
            this.startGuideHandPulse?.(this._guideHand, 1);
            this.playGuidePathHint?.(1, 'demo');
            this.trackFirstLevelFunnel?.('tutorial_demo_requested', {
                stepId: this._guideStep,
                stepName: this.getFirstLevelGuideStepKey?.(),
                source: 'demo_button',
                success: true,
            });
            this.scheduleOnce?.(() => {
                if (!this.isGuideVisualTokenCurrent?.(token)) return;
                if (!button?.isValid || !label?.isValid) return;
                button.interactable = true;
                label.string = '演示一下';
                this._guideDemoPlayingUntil = 0;
            }, 1.5);
            return true;
        },

        playGuideSuccessFeedback(): void {
            this.showGuideTargetFeedback?.('success');
        },

        showGuideTapFeedback(
            worldPos: Vec3,
            state: 'tap' | 'wrong' | 'busy' = 'tap',
        ): void {
            const layer = this._guideLayer as Node | null;
            const layerUT = layer?.getComponent(UITransform) || null;
            if (!layer?.isValid || !layerUT) return;
            const center = layerUT.convertToNodeSpaceAR(worldPos);
            const color = state === 'wrong'
                ? new Color(255, 92, 92, 255)
                : (state === 'busy' ? new Color(115, 174, 255, 255) : new Color(255, 255, 255, 255));
            const ring = this.createGuideFeedbackRing(
                'GuideTapFeedback',
                center,
                state === 'wrong' ? 104 : 88,
                state === 'wrong' ? 104 : 88,
                color,
                state === 'wrong' ? 235 : 205,
            );
            this._guideTransientFeedbackNodes = Array.isArray(this._guideTransientFeedbackNodes)
                ? this._guideTransientFeedbackNodes
                : [];
            this._guideTransientFeedbackNodes.push(ring);
            ring.setScale(0.52, 0.52, 1);
            const opacity = ring.getComponent(UIOpacity)!;
            tween(ring)
                .to(state === 'wrong' ? 0.38 : 0.30, {
                    scale: new Vec3(state === 'wrong' ? 1.36 : 1.18, state === 'wrong' ? 1.36 : 1.18, 1),
                }, { easing: 'sineOut' })
                .call(() => {
                    this._guideTransientFeedbackNodes = (this._guideTransientFeedbackNodes || [])
                        .filter((node: Node) => node !== ring);
                    this.destroyGuideFeedbackNode?.(ring);
                })
                .start();
            tween(opacity)
                .to(state === 'wrong' ? 0.38 : 0.30, { opacity: 0 }, { easing: 'quadIn' })
                .start();
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
            const settingsButtonCandidates: Array<Node | null> = [
                topBar?.getChildByName('TopHud')?.getChildByName('SettingsButton') || null,
                topBar?.getChildByName('Settings') || null,
                topBar?.getChildByName('SettingsButton') || null,
            ];
            const settingsButton = settingsButtonCandidates.find((node) => this.isGuideModalLauncherHit(node, worldPos)) || null;
            if (!settingsButton) return false;
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
            const bounds = this.getGuideCellsLayerBounds?.(block.cells) || null;
            if (!bounds) return;
            hand.active = true;
            this.setGuideHandTarget(hand, bounds.centerX, bounds.centerY + targetOffsetY);
            this.startGuideHandPulse(hand);
        },

        startHandGestureOnBoardTarget(colorId: number, hand: Node, targetOffsetY: number = 0) {
            const targetCenter = this.getGuideBoardTargetCenter(colorId);
            if (!targetCenter) return;
            hand.active = true;
            this.setGuideHandTarget(hand, targetCenter.x, targetCenter.y + targetOffsetY);
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
            const targetCell = this.getNearestGuideCellToBoundsCenter?.(emptyCells) || emptyCells[0];
            const bounds = this.getGuideCellsLayerBounds?.([targetCell]);
            if (!bounds) return null;
            return new Vec3(bounds.centerX, bounds.centerY, 0);
        },

        startGuideHandPulse(hand: Node, cycleCount: number = 2) {
            Tween.stopAllByTarget(hand);
            if (!this._guideReminderVisible) {
                hand.active = false;
                return;
            }
            hand.active = true;
            hand.setScale(1, 1, 1);
            const base = new Vec3(hand.position.x, hand.position.y, hand.position.z);
            if (this._guideSuppressInitialHandPulse) {
                hand.setPosition(base);
                return;
            }
            const cycles = Math.max(1, Math.min(2, Math.floor(Number(cycleCount) || 1)));
            const tapCycle = tween(hand)
                .delay(0.25)
                .to(0.22, {
                    position: new Vec3(base.x, base.y + 16, base.z),
                    scale: new Vec3(1, 1, 1),
                }, { easing: 'sineOut' })
                .to(0.24, {
                    position: new Vec3(base.x, base.y - 6, base.z),
                    scale: new Vec3(0.94, 0.94, 1),
                }, { easing: 'quadIn' })
                .call(() => {
                    if (this._guideMode === 'level_1' || this._guideMode === 'level_2' || this._guideMode === 'zoom') {
                        this.playGuideHandTapRipple?.(hand);
                    }
                })
                .to(0.18, {
                    position: base,
                    scale: new Vec3(1, 1, 1),
                }, { easing: 'sineOut' })
                .delay(0.65);
            tween(hand)
                .repeat(cycles, tapCycle)
                .call(() => {
                    if (!hand.isValid) return;
                    hand.setPosition(base);
                    hand.setScale(1, 1, 1);
                })
                .start();
        },

        startGuideWrongTargetHandPulse(hand: Node, cycleCount: number = 2) {
            Tween.stopAllByTarget(hand);
            if (!this._guideReminderVisible) {
                hand.active = false;
                return;
            }
            hand.active = true;
            hand.setScale(1, 1, 1);
            const base = new Vec3(hand.position.x, hand.position.y, hand.position.z);
            const cycles = Math.max(1, Math.min(2, Math.floor(Number(cycleCount) || 1)));
            const fastTapCycle = tween(hand)
                .to(0.08, {
                    position: new Vec3(base.x, base.y + 12, base.z),
                    scale: new Vec3(1, 1, 1),
                }, { easing: 'sineOut' })
                .to(0.10, {
                    position: new Vec3(base.x, base.y - 4, base.z),
                    scale: new Vec3(0.94, 0.94, 1),
                }, { easing: 'quadIn' })
                .to(0.10, {
                    position: base,
                    scale: new Vec3(1, 1, 1),
                }, { easing: 'sineOut' })
                .delay(0.10);
            tween(hand)
                .repeat(cycles, fastTapCycle)
                .call(() => {
                    if (!hand.isValid) return;
                    hand.setPosition(base);
                    hand.setScale(1, 1, 1);
                })
                .start();
        },

        playGuideHandTapRipple(hand: Node) {
            const layer = this._guideLayer as Node | null;
            const handUT = hand?.getComponent(UITransform) || null;
            if (!layer?.isValid || !hand?.isValid || !handUT) return;
            const fingertipWorld = handUT.convertToWorldSpaceAR(
                new Vec3(GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, 0),
            );
            this.showGuideTapFeedback?.(fingertipWorld, 'tap');
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
            this.clearGuideTransitionWatchdog?.();
            const completedStep = this._guideStep;
            const nextStep = completedStep + 1;
            const hasVisiblePreview = (this._guideMode === 'level_1' || this._guideMode === 'level_2')
                && this._guideStatus === 'transitioning'
                && this._guidePreviewStep === nextStep
                && this._guidePreviewVisible === true
                && this._guideDimMaskNode?.isValid;
            this._guideStatus = 'settling';
            this.clearGuideReminderTimer?.();
            if (!hasVisiblePreview) this.hideGuideReminderVisuals?.();
            this.trackFirstLevelFunnel('tutorial_step_done', {
                stepId: completedStep,
                stepName: `${this._guideMode}:${completedStep}:${this._guidePhase}`,
                source: 'tutorial',
                success: true,
            });
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
            if (this._guideMode === 'slot_intro') {
                return 'unlock';
            }
            if (this._guideMode === 'zoom') {
                return 'zoom';
            }
            if (this._guideMode === 'level_2') {
                if (step === 0) return 'unlock';
                if (step === 1 || step === 3 || step === 5) return 'select';
                if (step === 2 || step === 4 || step === 6) return 'place';
                return 'select';
            }
            return step % 2 === 0 ? 'select' : 'place';
        },

        endTutorial() {
            this.clearGuideTransitionWatchdog?.();
            const completedGuideMode = this._guideMode;
            if (completedGuideMode === 'level_1') {
                this.reportFirstLevelReleaseState?.('tutorial_done_before_cleanup');
            }
            this.trackFirstLevelFunnel('tutorial_done', {
                source: 'tutorial',
                success: true,
            });
            SySDKMgr.inst.reportTutorialFinish();
            this.clearGuideReminderTimer?.();
            this.hideGuideReminderVisuals?.();
            this._guideInputSuspended = false;
            this._guideStep = -1;
            this._guideMode = 'none';
            this._activeGameplayGuideLayoutMode = 'none';
            this._guideTotalSteps = 0;
            this._guideStatus = 'done';
            this._guidePreviewStep = -1;
            this._guideRenderStep = -1;
            this._guidePreviewVisible = false;
            this._guideVisualShownAt = 0;
            this._guideActionEnabledAt = 0;
            this._guideTransitionStartedAt = 0;
            this._guideWrongAttemptCount = 0;
            this._guideReminderStage = 0;
            this._guideReminderDueAt = 0;
            this._guideReminderRemainingMs = 0;
            this._guideReminderVoicePlayed = false;
            this._guideLevel2SlotPlacementSucceeded = false;
            this._guideReminderPausedForLifecycle = false;
            this._lastGuideVoiceToken = '';
            this.clearGuideFeedbackVisuals?.();
            this.clearGuideHighlight();
            if (this._guideBubble?.isValid) {
                this._guideBubble.active = false;
            }
            if (this._guideLayer) {
                if (this._guideHand?.isValid) Tween.stopAllByTarget(this._guideHand);
                this._guideLayer.destroy();
                this._guideLayer = null;
                this._guideMask = null;
                this._guideHand = null;
                this._guideBubble = null;
                this._guideBubbleLbl = null;
                this._guidePromptDefaultLabelColor = null;
                this._guidePromptDefaultCenterY = null;
            }
            if (this._guideHandsRoot?.isValid) {
                this._guideHandsRoot.active = false;
            }
            this._guideHandsRoot = null;
            this._guidePinchLeftHand = null;
            this._guidePinchRightHand = null;
            if (completedGuideMode === 'slot_intro') {
                this.refitBoardViewportToSafeRect?.();
            }
            this.unschedule(this.tickTimer);
            if (!this._currentLevelUnlimitedTime) {
                this.schedule(this.tickTimer, 1);
            }
            this.resetIdleHintTimer();
            if (completedGuideMode === 'level_1') {
                this.resetFirstLevelReleaseDiagnostics?.();
                this.unbindFirstLevelReleaseTouchObserver?.();
            }
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
