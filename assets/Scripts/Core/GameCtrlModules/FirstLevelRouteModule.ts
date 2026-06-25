import {
    _decorator, Component, Node, UITransform, Sprite, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    view, ResolutionPolicy, tween, Tween, sys, UIOpacity, Color,
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
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, GAME_ASSETS_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_DAILY_SIGNIN_COUNT, LS_DAILY_SIGNIN_LAST_DATE_KEY, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, createSingleColorSpriteFrame, BoardViewportController
} from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';
import { LevelDataCdnService } from '../LevelDataCdnService';
import { isDouyinMiniGameRuntime, isMiniGameRuntime, isWeChatMiniGameRuntime } from '../MiniGamePlatform';
import { debugPerfSnapshot, debugPerfTrace } from '../DebugPerfTrace';
import { runtimeLog, runtimeWarn } from '../RuntimeLog';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';

export function installFirstLevelRouteModule(target: any): void {
    Object.assign(target, {
        trackFirstLevelFunnel(eventName: string, opt: Record<string, unknown> = {}, force: boolean = false): void {
            if (!force && !this.isFirstLevelFunnelActive()) return;
            const experimentPayload = AnalyticsMgr.inst.getTutorialExperimentEventContext();
            const activePhysicalLevelId = this.getActivePhysicalLevelId();
            const activeLogicalLevelId = this.getActiveLogicalLevelId?.() || activePhysicalLevelId;
            AnalyticsMgr.inst.trackFunnelEvent({
                eventName,
                page: this.getAnalyticsPage(),
                levelId: activeLogicalLevelId,
                logicalLevelId: activeLogicalLevelId,
                physicalLevelId: activePhysicalLevelId,
                ...experimentPayload,
                ...opt,
            });
        },

        trackFirstLevelFunnelForLevel(
            levelId: number,
            eventName: string,
            opt: Record<string, unknown> = {},
            force: boolean = false,
        ): void {
            const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
            if (!force && normalizedLevelId !== 1 && normalizedLevelId !== 2) return;
            const experimentPayload = AnalyticsMgr.inst.getTutorialExperimentEventContext();
            AnalyticsMgr.inst.trackFunnelEvent({
                eventName,
                page: 'level_game',
                levelId: normalizedLevelId,
                logicalLevelId: normalizedLevelId,
                physicalLevelId: normalizedLevelId,
                ...experimentPayload,
                ...opt,
            });
        },

        getFirstLevelGuideStepKey(step: number = this._guideStep, phase: string = this._guidePhase): string {
            return `${this._guideMode || 'none'}:${Math.max(-1, Math.floor(Number(step) || 0))}:${phase || ''}`;
        },

        markFirstLevelTouchTiming(now: number = Date.now()): void {
            const lastTouchAt = Number(this._firstLevelLastTouchAt) || 0;
            this._firstLevelLastTouchIntervalMs = lastTouchAt > 0 ? Math.max(0, now - lastTouchAt) : 0;
            this._firstLevelLastTouchAt = now;
        },

        buildFirstLevelGuideExtra(inputLayer: string, hitResult: string = '', extra: Record<string, unknown> = {}): Record<string, unknown> {
            const now = Date.now();
            const stepKey = this.getFirstLevelGuideStepKey();
            const stepShowAt = Number(this._firstLevelGuideStepShowAt?.[stepKey]) || 0;
            const stepReadyAt = Number(this._firstLevelGuideStepReadyAt?.[stepKey]) || 0;
            return {
                guideMode: this._guideMode || 'none',
                guideStep: Math.max(-1, Math.floor(Number(this._guideStep) || 0)),
                guidePhase: this._guidePhase || '',
                inputLayer,
                hitResult,
                msFromStepShow: stepShowAt > 0 ? Math.max(0, now - stepShowAt) : 0,
                msFromStepReady: stepReadyAt > 0 ? Math.max(0, now - stepReadyAt) : 0,
                msSincePrevTouch: Math.max(0, Number(this._firstLevelLastTouchIntervalMs) || 0),
                ...extra,
            };
        },

        buildFirstLevelTouchPositionExtra(worldPos?: Vec3): Record<string, unknown> {
            if (!worldPos) return {};
            const round = (value: number, digits: number = 1): number => {
                const factor = Math.pow(10, digits);
                return Math.round((Number(value) || 0) * factor) / factor;
            };
            const visible = view.getVisibleSize();
            const uiW = Math.max(1, Number(visible.width) || 0);
            const uiH = Math.max(1, Number(visible.height) || 0);
            const payload: Record<string, unknown> = {
                uiX: round(worldPos.x),
                uiY: round(worldPos.y),
                uiW: round(uiW),
                uiH: round(uiH),
                normX: round(worldPos.x / uiW, 4),
                normY: round(worldPos.y / uiH, 4),
            };

            const boardLocal = typeof this.worldToBoardLocal === 'function'
                ? this.worldToBoardLocal(worldPos)
                : null;
            if (boardLocal) {
                payload.boardLocalX = round(boardLocal.x);
                payload.boardLocalY = round(boardLocal.y);
                const cell = typeof this.getBoardCellFromWorldPos === 'function'
                    ? this.getBoardCellFromWorldPos(worldPos)
                    : null;
                if (cell) {
                    payload.boardRow = cell.row;
                    payload.boardCol = cell.col;
                }
                const candidates = typeof this.getBoardTapCandidates === 'function'
                    ? this.getBoardTapCandidates(worldPos)
                    : [];
                const candidate = candidates?.[0];
                if (candidate) {
                    payload.boardHitRow = candidate.row;
                    payload.boardHitCol = candidate.col;
                    payload.boardHitDist = round(Math.sqrt(Math.max(0, Number(candidate.distSq) || 0)));
                    payload.boardCenterDist = round(Math.sqrt(Math.max(0, Number(candidate.centerDistSq) || 0)));
                    payload.boardVisualCoreHit = candidate.visualCoreHit === true;
                }
            }

            const slotUT = this.slotAreaNode?.getComponent(UITransform) || null;
            if (slotUT) {
                const slotLocal = slotUT.convertToNodeSpaceAR(worldPos);
                payload.slotLocalX = round(slotLocal.x);
                payload.slotLocalY = round(slotLocal.y);
                const inSlotArea = Math.abs(slotLocal.x) <= slotUT.contentSize.width / 2
                    && Math.abs(slotLocal.y) <= slotUT.contentSize.height / 2;
                payload.inSlotArea = inSlotArea;
                if (Array.isArray(this.slotNodes) && this.slotNodes.length > 0) {
                    let bestIndex = -1;
                    let bestDistSq = Number.POSITIVE_INFINITY;
                    for (let i = 0; i < this.slotNodes.length; i++) {
                        const slotNode = this.slotNodes[i];
                        if (!slotNode?.isValid) continue;
                        const dx = slotLocal.x - slotNode.position.x;
                        const dy = slotLocal.y - slotNode.position.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < bestDistSq) {
                            bestDistSq = distSq;
                            bestIndex = i;
                        }
                    }
                    if (bestIndex >= 0) {
                        payload.slotIndex = bestIndex;
                        payload.slotDistance = round(Math.sqrt(bestDistSq));
                    }
                }
            }

            return payload;
        },

        reportFirstLevelAnyTouch(worldPos: Vec3, inputLayer: string, source: string = 'tutorial'): void {
            if (!this.isFirstLevelFunnelActive?.()) return;
            if (this._firstLevelAnyTouchSent) return;
            this._firstLevelAnyTouchSent = true;
            const touchTarget = worldPos ? this.classifyFirstLevelTouchTarget(worldPos) : '';
            this.trackFirstLevelFunnel('first_level_any_touch', {
                touchTarget,
                source,
                success: true,
                extra: this.buildFirstLevelGuideExtra(inputLayer, 'touch_start', this.buildFirstLevelTouchPositionExtra(worldPos)),
            });
        },

        markTutorialStepShownForFunnel(step: number): void {
            if (!this.isFirstLevelFunnelActive?.()) return;
            const key = this.getFirstLevelGuideStepKey(step, this._guidePhase);
            this._firstLevelGuideStepShowAt = this._firstLevelGuideStepShowAt || {};
            this._firstLevelGuideStepShowAt[key] = Date.now();
        },

        markTutorialStepInteractiveReadyForFunnel(step: number): void {
            if (!this.isFirstLevelFunnelActive?.()) return;
            if (this._guideStep !== step || this._guideInputSuspended) return;
            const key = this.getFirstLevelGuideStepKey(step, this._guidePhase);
            this._firstLevelGuideStepReadyAt = this._firstLevelGuideStepReadyAt || {};
            this._firstLevelGuideStepReadyAt[key] = Date.now();
            this.trackFirstLevelFunnel('tutorial_step_interactive_ready', {
                stepId: step,
                stepName: key,
                source: 'tutorial',
                success: true,
                extra: this.buildFirstLevelGuideExtra('guide_layer', 'ready'),
            });
        },

        reportTutorialLayerTouchStart(_worldPos: Vec3): void {
        },

        reportTutorialStepFirstTouch(_worldPos: Vec3, _inputLayer: string): void {
        },

        getTutorialMissHitResult(worldPos?: Vec3): string {
            if (!worldPos) return 'miss_unknown';
            const target = this.classifyFirstLevelTouchTarget(worldPos);
            if (target === 'empty') return 'miss_empty';
            if (target === 'board') return 'miss_wrong_block';
            if (target === 'slot') return 'miss_wrong_slot';
            return 'miss_wrong_target';
        },

        getTutorialSelectHitResult(worldPos: Vec3, step: number): string {
            if (this._guideMode === 'level_1' && !this.shouldGuideSelectFromSlot?.(step)) {
                return this.classifyFirstLevelTouchTarget(worldPos) === 'board' ? 'hit_target' : 'hit_tolerant_area';
            }
            return 'hit_target';
        },

        reportTutorialTapResult(
            worldPos: Vec3 | undefined,
            hitResult: string,
            success: boolean = false,
            inputLayer: string = 'guide_layer',
            extra: Record<string, unknown> = {},
        ): void {
            if (!this.isFirstLevelFunnelActive?.()) return;
            const touchTarget = worldPos ? this.classifyFirstLevelTouchTarget(worldPos) : '';
            const payloadExtra = this.buildFirstLevelGuideExtra(inputLayer, hitResult, {
                ...this.buildFirstLevelTouchPositionExtra(worldPos),
                ...extra,
            });
            this.trackFirstLevelFunnel('tutorial_tap_result', {
                stepId: this._guideStep,
                stepName: this.getFirstLevelGuideStepKey(),
                touchTarget,
                source: 'tutorial',
                success,
                errorCode: success ? '' : hitResult,
                extra: payloadExtra,
            });
            const msSincePrevTouch = Number(payloadExtra.msSincePrevTouch) || 0;
            if (!success && hitResult.indexOf('ignored_') === 0 && msSincePrevTouch > 0 && msSincePrevTouch <= 500) {
                this.trackFirstLevelFunnel('tutorial_fast_tap_ignored', {
                    stepId: this._guideStep,
                    stepName: this.getFirstLevelGuideStepKey(),
                    touchTarget,
                    source: 'tutorial',
                    success: false,
                    errorCode: hitResult,
                    extra: payloadExtra,
                });
            }
        },

        getLevelDataPath(levelId: number, prefix: string = 'level_'): string {
            return `LevelData/${prefix}${levelId}`;
        },

        readRuntimeSettings(): any {
            const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
            const w: any = typeof window !== 'undefined' ? window : null;
            return g?.__ccSettings || g?.ccSettings || g?._CCSettings || w?.__ccSettings || w?.ccSettings || w?._CCSettings || null;
        },

        getRuntimeRemoteHash(): string {
            const dataVersion = LevelDataCdnService.inst.getDataVersion();
            if (dataVersion) return dataVersion;
            const settings = this.readRuntimeSettings();
            const fromSettings = settings?.assets?.bundleVers?.gameAssets;
            if (typeof fromSettings === 'string' && fromSettings) return fromSettings;
            const downloader: any = (assetManager as any).downloader;
            const candidates = [
                downloader?.bundleVers?.gameAssets,
                downloader?._bundleVers?.gameAssets,
                downloader?.bundleVers?.get?.('remote'),
                downloader?._bundleVers?.get?.('remote'),
            ];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate) return candidate;
            }
            return '';
        },

        getRuntimeRemoteServer(): string {
            const settings = this.readRuntimeSettings();
            const fromSettings = settings?.assets?.server;
            if (typeof fromSettings === 'string' && fromSettings) return fromSettings;
            const downloader: any = (assetManager as any).downloader;
            const candidates = [
                downloader?.remoteServerAddress,
                downloader?._remoteServerAddress,
                downloader?.remoteServerRoot,
                downloader?._remoteServerRoot,
            ];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate) return candidate;
            }
            return '';
        },

		getLevelDataLoadDiagnostics(
            levelId: number,
            levelPath: string,
            extra: Record<string, unknown> = {},
        ): Record<string, unknown> {
            const levelDataCdn = LevelDataCdnService.inst.getAvailabilityDiagnostics();
            const diagnostics: Record<string, unknown> = {
                remoteHash: this.getRuntimeRemoteHash(),
                remoteServer: this.getRuntimeRemoteServer(),
                levelDataCdn,
                levelDataCdnBaseUrl: levelDataCdn.baseUrl,
                levelDataCdnCanUse: levelDataCdn.canUse,
                levelDataCdnReason: levelDataCdn.reason,
                levelDataCdnLiveUnavailableReason: levelDataCdn.liveUnavailableReason,
                levelId,
                levelPath,
                ...extra,
            };
            return diagnostics;
        },

        reportLevelDataLoadDiagnostic(
            levelId: number,
            eventName: string,
            success: boolean,
            levelPath: string,
            opt: {
                errorCode?: string;
                errorMessage?: string;
                extra?: Record<string, unknown>;
                flush?: boolean;
            } = {},
        ): void {
            const diagnostics = this.getLevelDataLoadDiagnostics(levelId, levelPath, opt.extra || {});
            const logArgs = [`[LevelDataLoad] ${eventName}`, diagnostics];
            if (success) runtimeLog(...logArgs);
            else console.error(...logArgs);
            this.trackFirstLevelFunnelForLevel(levelId, eventName, {
                source: 'level_data',
                success,
                errorCode: opt.errorCode || '',
                errorMessage: opt.errorMessage || '',
                extra: diagnostics,
            }, true);
            if (opt.flush || !success) {
                AnalyticsMgr.inst.flushFunnelEvents();
            }
        },

        stopLevelDataLoadWithFatalError(
            levelId: number,
            levelPath: string,
            eventName: string,
            errorCode: string,
            errorMessage: string,
            extra: Record<string, unknown> = {},
        ): void {
            if (this._levelDataLoadStopped) return;
            this._levelDataLoadStopped = true;
            this._preloadingBundle = false;
            AppRoot.tryGet()?.forceHideSceneTransition('level-data-error');
            this.reportLevelDataLoadDiagnostic(levelId, eventName, false, levelPath, {
                errorCode,
                errorMessage,
                extra,
                flush: true,
            });
            this.showLevelDataLoadFatalError(levelPath, errorCode, errorMessage);
        },

        createLevelDataLoadFatalSpriteNode(parent: Node, name: string, width: number, height: number, color: Color): Node {
            const node = new Node(name);
            node.layer = parent.layer;
            parent.addChild(node);
            const transform = node.addComponent(UITransform);
            transform.setContentSize(width, height);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = createSingleColorSpriteFrame(color, 8, 8);
            return node;
        },

        ensureLevelDataLoadFatalLabel(parent: Node, name: string, y: number, fontSize: number, width: number, height: number): Label {
            let node = parent.getChildByName(name);
            if (!node) {
                node = new Node(name);
                node.layer = parent.layer;
                parent.addChild(node);
            }
            node.active = true;
            node.setPosition(0, y, 0);
            const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
            transform.setContentSize(width, height);
            const label = node.getComponent(Label) || node.addComponent(Label);
            label.fontSize = fontSize;
            label.lineHeight = Math.max(fontSize + 4, Math.round(fontSize * 1.25));
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.color = new Color(255, 255, 255, 255);
            return label;
        },

        ensureLevelDataLoadFatalLayer(overlayRoot: Node, visibleSize: Size): Node {
            let overlayTemplates = overlayRoot.getChildByName('OverlayTemplates');
            if (!overlayTemplates) {
                overlayTemplates = new Node('OverlayTemplates');
                overlayTemplates.layer = overlayRoot.layer;
                overlayRoot.addChild(overlayTemplates);
                overlayTemplates.addComponent(UITransform);
            }

            let layer = overlayTemplates.getChildByName('LevelDataLoadFatalError');
            if (!layer) {
                layer = new Node('LevelDataLoadFatalError');
                layer.layer = overlayTemplates.layer;
                overlayTemplates.addChild(layer);
                layer.addComponent(UITransform);
            }

            let mask = layer.getChildByName('LevelDataLoadFatalErrorMask');
            if (!mask) {
                mask = this.createLevelDataLoadFatalSpriteNode(
                    layer,
                    'LevelDataLoadFatalErrorMask',
                    visibleSize.width,
                    visibleSize.height,
                    new Color(0, 0, 0, 176),
                );
            }
            mask.layer = layer.layer;
            mask.setPosition(0, 0, 0);
            const maskTransform = mask.getComponent(UITransform) || mask.addComponent(UITransform);
            maskTransform.setContentSize(visibleSize.width, visibleSize.height);

            let card = layer.getChildByName('LevelDataLoadFatalErrorCard');
            if (!card) {
                card = this.createLevelDataLoadFatalSpriteNode(
                    layer,
                    'LevelDataLoadFatalErrorCard',
                    560,
                    320,
                    new Color(24, 28, 42, 244),
                );
            }
            card.layer = layer.layer;
            card.setPosition(0, 0, 0);
            const cardTransform = card.getComponent(UITransform) || card.addComponent(UITransform);
            cardTransform.setContentSize(560, 320);

            this.ensureLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorTitle', 108, 34, 500, 48);
            this.ensureLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorHint', 50, 22, 500, 56);
            this.ensureLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorPath', -18, 18, 500, 42);
            this.ensureLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorDetail', -74, 18, 500, 56);
            this.ensureLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorRetry', -132, 18, 500, 36);
            return layer;
        },

        showLevelDataLoadFatalError(levelPath: string, errorCode: string, errorMessage: string): void {
            if (this._remoteLoadErrorOverlay?.isValid) return;
            const visibleSize = this._getLoadingVisibleSize();
            const overlayRoot = this.requireCanvasUiRoot('OverlayRoot');
            const overlayTemplates = overlayRoot.getChildByName('OverlayTemplates') || null;
            const layer = this.ensureLevelDataLoadFatalLayer(overlayRoot, visibleSize);
            this._remoteLoadErrorOverlay = layer;

            const layerTransform = layer.getComponent(UITransform);
            if (!layerTransform) throw new Error('[SceneUI] LevelDataLoadFatalError is missing UITransform');
            layerTransform.setContentSize(visibleSize.width, visibleSize.height);
            const blocker = layer.getComponent(BlockInputEvents) || layer.addComponent(BlockInputEvents);
            blocker.enabled = true;
            layer.active = true;
            const activeOverlayTemplates = overlayTemplates?.isValid ? overlayTemplates : overlayRoot.getChildByName('OverlayTemplates');
            activeOverlayTemplates?.setSiblingIndex(overlayRoot.children.length - 1);
            if (activeOverlayTemplates?.isValid) {
                layer.setSiblingIndex(activeOverlayTemplates.children.length - 1);
            }

            const mask = this.requireUiChild(layer, 'LevelDataLoadFatalErrorMask', 'LevelDataLoadFatalError/LevelDataLoadFatalErrorMask');
            const maskTransform = mask.getComponent(UITransform);
            if (!maskTransform) throw new Error('[SceneUI] LevelDataLoadFatalErrorMask is missing UITransform');
            maskTransform.setContentSize(visibleSize.width, visibleSize.height);
            mask.active = true;

            const card = this.requireUiChild(layer, 'LevelDataLoadFatalErrorCard', 'LevelDataLoadFatalError/LevelDataLoadFatalErrorCard');
            card.active = true;

            const titleLabel = this.requireLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorTitle');
            titleLabel.string = '资源加载失败';

            const hintLabel = this.requireLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorHint');
            hintLabel.string = '请检查资源与配置后重新进入游戏';

            const pathLabel = this.requireLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorPath');
            pathLabel.string = levelPath;

            const detail = `${errorCode}${errorMessage ? ': ' + errorMessage : ''}`;
            const detailLabel = this.requireLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorDetail');
            detailLabel.string = this.truncateLevelDataLoadMessage(detail, 96);

            const retryLabel = this.requireLevelDataLoadFatalLabel(card, 'LevelDataLoadFatalErrorRetry');
            retryLabel.string = '已停止进入默认关卡，避免关卡数据错乱';
        },

        requireLevelDataLoadFatalLabel(parent: Node, name: string): Label {
            const node = this.requireUiChild(parent, name, `LevelDataLoadFatalErrorCard/${name}`);
            const label = node.getComponent(Label);
            if (!label) {
                throw new Error(`[SceneUI] LevelDataLoadFatalErrorCard/${name} is missing Label`);
            }
            node.active = true;
            return label;
        },

        truncateLevelDataLoadMessage(message: string, maxLength: number): string {
            const text = String(message || '').replace(/\s+/g, ' ').trim();
            if (text.length <= maxLength) return text;
            return text.slice(0, Math.max(0, maxLength - 3)) + '...';
        },

        classifyFirstLevelTouchTarget(worldPos: Vec3): string {
            if (this.isSlotAreaInteractive() && this.slotAreaNode) {
                const slotUT = this.slotAreaNode.getComponent(UITransform);
                if (slotUT) {
                    const localPos = slotUT.convertToNodeSpaceAR(worldPos);
                    if (Math.abs(localPos.x) <= slotUT.contentSize.width / 2 && Math.abs(localPos.y) <= slotUT.contentSize.height / 2) {
                        return 'slot';
                    }
                }
            }
            if (this.getBoardTapCandidates(worldPos).length > 0) {
                return 'board';
            }
            return 'empty';
        },

        installRuntimeLogGate() {
        },

        logRuntimeTrace(...args: unknown[]) {
            if (!this.getUrlDebug()) return;
            runtimeLog(...args);
        },

        _startDeferredStartupBackgroundServices(
            canAutoSaveGameStateOnStartup: boolean,
            restoreStatus: UserStateRestoreStatus,
            deferDelaySec: number,
        ) {
            if (this._startupBackgroundServicesStarted) return;
            this._startupBackgroundServicesStarted = true;

            UserMgr.inst.touchSession(canAutoSaveGameStateOnStartup);
            if (restoreStatus === 'cloud_confirmed_empty') {
                this.grantStarterPropsForNewUser();
            }
            if (canAutoSaveGameStateOnStartup) {
                this.queueCloudGameStateSync();
            } else if (this._isWeChat() && restoreStatus !== 'cloud_restore_pending') {
                runtimeWarn('[GameCtrl] skip startup cloud state sync because fresh-install restore is unresolved:', restoreStatus);
            }

            const run = () => {
                if (!this.node?.isValid) return;
                SySDKMgr.inst.init();
                void SySDKMgr.inst.login().then(() => SySDKMgr.inst.reportLoadFinish());
                AudioMgr.inst.init(this.node);
                void AnalyticsMgr.inst.bootstrap();
                this.scheduleOnce(() => {
                    if (canAutoSaveGameStateOnStartup) {
                        void LeaderboardMgr.inst.submitProgress(this.getSavedLevel(), UserMgr.inst.getProfile());
                    }
                    if (this._isWeChat()) {
                        void UserMgr.inst.loginWeChat();
                    }
                    this.setupShareMenu();
                }, 0.5);
            };

            if (deferDelaySec > 0) {
                this.scheduleOnce(run, deferDelaySec);
            } else {
                run();
            }
        },

        async continueStartup() {
            const urlLevel = this.getUrlLevel();
            const urlLevelFile = this.getUrlLevelFile();
            const urlTheme = this.getUrlTheme();
            const startupLocalProgressState = this.getStartupLocalProgressState();
            const hadLocalUserState = startupLocalProgressState === 'local_progress_gt_1';
            const initialDefaultEntryLevel = this.getDefaultEntryLevel();
            const pendingSceneGameplayRequest = AppRoot.tryGet()?.session.pendingGameplayRequest;
            const speculativeStartupLevelId = urlLevelFile ? 0 : (urlLevel > 0 ? urlLevel : initialDefaultEntryLevel);
            const shouldSpeculativeFirstPlayPrefetch =
                !urlLevelFile
                && urlLevel <= 0
                && !pendingSceneGameplayRequest
                && initialDefaultEntryLevel <= 1
                && !hadLocalUserState
                && this.shouldUseLocalBootstrapBundle(speculativeStartupLevelId);
            if (shouldSpeculativeFirstPlayPrefetch) {
                this.prefetchLocalBootstrapStartupAssets(speculativeStartupLevelId);
            }
            // 只有 raw pdd.level > 1 才不阻塞启动；raw pdd.level 为 null 时不能写入默认第 1 关。
            // - 纯新用户：云端返回空数据，继续进第一关
            // - 删小程序的老用户：云端有存档，恢复到上次进度
            const restoreStatus = await this.restoreUserStateFromCloud(hadLocalUserState);
            const defaultEntryLevel = urlLevel > 0 || urlLevelFile
                ? initialDefaultEntryLevel
                : this.getDefaultEntryLevel();
            const startupLevelId = urlLevelFile ? 0 : (urlLevel > 0 ? urlLevel : defaultEntryLevel);
        
            let started = false;
            const urlLevelFileTheme = !!urlLevelFile && (urlTheme || this.isThemeLevelFile(urlLevelFile));
            const startupLevelPrefix = (urlLevel > 0 && urlTheme) ? 'zt_level_' : 'level_';
            if (!urlLevelFile && startupLevelId > 0) {
                this.reportLevelDataLoadDiagnostic(
                    startupLevelId,
                    'level_data_startup_diagnostics',
                    true,
                    this.getLevelDataPath(startupLevelId, startupLevelPrefix),
                    {
                        extra: {
                            initialDefaultEntryLevel,
                            defaultEntryLevel,
                            urlLevel,
                            urlTheme,
                            restoreStatus,
                            startupLocalProgressState,
                            savedLevel: this.getSavedLevel(),
                        },
                    },
                );
            }
            const onReady = () => {
                if (started) return;
                started = true;
                if (urlLevelFile) {
                    this.loadExternalLevelFile(
                        urlLevelFile,
                        urlLevelFileTheme ? 'zt_level_' : 'level_',
                    );
                } else if (urlLevel > 0) {
                    if (urlTheme) {
                        this.loadThemeLevel(urlLevel);
                    } else {
                        this.loadLevel(urlLevel, 'level_', false);
                    }
                } else if (pendingSceneGameplayRequest) {
                    if (pendingSceneGameplayRequest.entryMode === 'theme') {
                        this.loadThemeLevel(pendingSceneGameplayRequest.levelId);
                    } else {
                        this.loadLevel(
                            pendingSceneGameplayRequest.levelId,
                            pendingSceneGameplayRequest.prefix,
                            pendingSceneGameplayRequest.entryMode === 'external',
                        );
                    }
                } else if (defaultEntryLevel <= 1) {
                    // 纯新用户默认从第一关进入
                    this.loadLevel(1);
                } else {
                    this.loadLevel(defaultEntryLevel);
                }
            };
        
            let deferredStartupDelaySec = 0;
            if (!pendingSceneGameplayRequest && startupLevelId > 0 && (sys.isNative || this._isMiniGame() || this._isUrlLevelPreview())) {
                const useLocalBootstrapStartup =
                    urlLevel <= 0 &&
                    defaultEntryLevel <= 1 &&
                    this.shouldUseLocalBootstrapBundle(startupLevelId);
                deferredStartupDelaySec = useLocalBootstrapStartup ? 0.35 : 0;
                if (useLocalBootstrapStartup) {
                    this.startLocalBootstrapLevelFast(startupLevelId, LOCAL_BOOTSTRAP_LEVEL_PREFIX, startupLevelId);
                } else {
                    const fastPrefix = (urlLevel > 0 && urlTheme) ? 'zt_level_' : 'level_';
                    if (urlLevel > 0 && urlTheme) {
                        this._isThemeLevel = true;
                        this._currentThemeLevelId = urlLevel;
                    }
                    this.startGameAssetsLevelFast(startupLevelId, fastPrefix, startupLevelId);
                }
            } else {
                this.preloadAllAssets(onReady);
                // 超时兜底：15秒（给远程 bundle 足够的加载时间）
                this.scheduleOnce(onReady, 15);
            }

            const canAutoSaveGameStateOnStartup =
                restoreStatus === 'local_progress_gt_1' ||
                restoreStatus === 'cloud_progress_gt_1' ||
                restoreStatus === 'cloud_confirmed_empty';
            this._startDeferredStartupBackgroundServices(
                canAutoSaveGameStateOnStartup,
                restoreStatus,
                deferredStartupDelaySec,
            );
        },

        /** 初始化微信/抖音分享菜单 + 被动分享回调（被动转发：右上角胶囊点"转发"） */
        setupShareMenu() {
            const wx: any = this.getWeChatRuntime();
            if (wx) {
                try {
                    if (typeof wx.showShareMenu === 'function') {
                        wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] });
                    }
                    if (typeof wx.onShareAppMessage === 'function') {
                        wx.onShareAppMessage(() => {
                            const lv = this._isThemeLevel ? this._currentThemeLevelId : this.getSavedLevel();
                            const themeName = this._isThemeLevel ? this.findThemeNameByLevelId(lv) : '';
                            return {
                                title: themeName
                                    ? `我在拼豆豆完成了【${themeName}】主题，快来挑战！`
                                    : '一起来玩拼豆豆，可爱又解压！',
                                query: this._isThemeLevel ? `level=${lv}&theme=1` : '',
                                imageUrl: '',
                            };
                        });
                    }
                } catch (e) {
                    console.warn('[setupShareMenu] wx error', e);
                }
            }
            const tt: any = (typeof globalThis !== 'undefined' ? (globalThis as any).tt : null)
                || (typeof window !== 'undefined' ? (window as any).tt : null);
            if (tt && typeof tt.showShareMenu === 'function') {
                try { tt.showShareMenu({ withShareTicket: false }); } catch (e) { /* ignore */ }
            }
        },

        // ==================== 资源加载 ====================
        
        preloadAllAssets(onDone?: () => void) {
            LevelDataCdnService.inst.prefetchLive();
            const finish = () => {
                if (onDone) onDone();
                else this.showMainMenu();
            };
            this.scheduleOnce(finish, 0);
        },

        _isWeChat(): boolean {
            return isWeChatMiniGameRuntime();
        },

        _isDouyin(): boolean {
            return isDouyinMiniGameRuntime();
        },

        _isMiniGame(): boolean {
            return isMiniGameRuntime();
        },

        _isUrlLevelPreview(): boolean {
            try {
                return new URLSearchParams(window.location.search).get('remote') === '1';
            } catch (_) { return false; }
        },

        _loadFromGameAssetsBundle(onDone?: () => void) {
            if (this.gameAssetsBundle) {
                this._preloadGameAssetsTextureSet(this.gameAssetsBundle, () => {
                    if (onDone) onDone(); else this.showMainMenu();
                });
                return;
            }
            this._preloadingBundle = true;
            assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                this._preloadingBundle = false;
                if (err) {
                    console.warn('loadBundle gameAssets failed:', err.message);
                    if (onDone) onDone(); else this.showMainMenu();
                    return;
                }
                this.gameAssetsBundle = bundle;
                this._preloadGameAssetsTextureSet(bundle, () => {
                    if (onDone) onDone(); else this.showMainMenu();
                });
            });
        },

        /** 从图集加载豆豆 SpriteFrame（统一缓存成 b010_1 / b010_2 / b010_4 这类 key） */
        _loadBeanAtlasFromBundle(
            bundle: Bundle,
            onDone?: () => void,
            atlasPath: string = LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH,
            imagePath: string = LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH,
            label: string = 'bootstrap bean-atlas',
        ) {
            if (this._bootstrapBeanAtlasReady) {
                if (onDone) onDone();
                return;
            }
            if (this._bootstrapBeanAtlasLoadingCallbacks) {
                if (onDone) this._bootstrapBeanAtlasLoadingCallbacks.push(onDone);
                return;
            }
            this._bootstrapBeanAtlasLoadingCallbacks = onDone ? [onDone] : [];
            const finish = (ready: boolean) => {
                this._bootstrapBeanAtlasReady = this._bootstrapBeanAtlasReady || ready;
                const callbacks = this._bootstrapBeanAtlasLoadingCallbacks || [];
                this._bootstrapBeanAtlasLoadingCallbacks = null;
                for (const callback of callbacks) callback();
            };
            this._loadAtlasDataFromBundle(bundle, atlasPath, label, (err, atlasData) => {
                if (err || !atlasData) {
                    console.error('[图集] 未找到 bean-atlas-data.json:', err?.message);
                    finish(false);
                    return;
                }
                const frames = atlasData.frames;
                if (!frames) {
                    console.error('[图集] bean-atlas 数据不完整');
                    finish(false);
                    return;
                }
                this._loadAtlasTextureFromBundle(bundle, imagePath, label, (imgErr, texture, textureMeta) => {
                    if (imgErr || !texture) {
                        console.error('[图集] bean-atlas 纹理加载失败:', imgErr?.message);
                        finish(false);
                        return;
                    }
                    this._bootstrapBeanAtlasTexture = texture;
                    this._bootstrapBeanAtlasImageAsset = textureMeta?.imageAsset ?? null;
                    this._bootstrapBeanAtlasTextureReleaseMode = textureMeta?.releaseMode === 'dynamic' ? 'dynamic' : 'asset';
                    let count = 0;
                    for (const name in frames) {
                        const f = frames[name];
                        const sf = new SpriteFrame();
                        sf.texture = texture;
                        sf.rect = new Rect(f.x, f.y, f.w, f.h);
                        sf.name = name;
                        this.sfCache.set(name, sf);
                        this._bootstrapAtlasFrameCache.set(name, sf);
                        count++;
                    }
                    runtimeLog(`[图集] 豆豆图集已加载: ${count} 个 SpriteFrame`);
                    finish(count > 0);
                });
            });
        },

        _prepareBeanFramesForLevelData(data: LevelData, onDone: () => void) {
            if (!this.needsBeanFramesForLevelData(data)) {
                onDone();
                return;
            }
            this._ensureBeanAtlasLoadedForLevelData(data, () => {
                if (!this._hasBeanAtlasReadyForLevelData(data)) {
                    console.error('[bean] required bean SpriteFrames unavailable for level:', data.levelId);
                }
                onDone();
            });
        },

        _hasBeanAtlasReadyForLevelData(data: LevelData): boolean {
            return this._hasBootstrapAtlasFramesForLevelData(data);
        },

        _ensureBeanAtlasLoadedForLevelData(data: LevelData, onDone?: () => void) {
            this._ensureBootstrapBeanAtlasLoaded(onDone);
        },

        _ensureBootstrapBeanAtlasLoaded(onDone?: () => void) {
            if (this._bootstrapBeanAtlasReady) {
                if (onDone) onDone();
                return;
            }
            this._withBootstrapBundle((bundle) => {
                if (!bundle) {
                    console.error('[bootstrap] bean-atlas bundle unavailable');
                    if (onDone) onDone();
                    return;
                }
                this._loadBeanAtlasFromBundle(
                    bundle,
                    onDone,
                    LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH,
                    LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH,
                    'bootstrap bean-atlas',
                );
            });
        },

        _loadAtlasJsonFromBundle(
            bundle: Bundle,
            atlasPath: string,
            label: string,
            callback: (err: Error | null, jsonAsset: JsonAsset | null) => void,
        ) {
            bundle.load(atlasPath, JsonAsset, (err, jsonAsset) => {
                if (!err && jsonAsset) {
                    callback(null, jsonAsset);
                    return;
                }
                const message = err?.message || 'unknown error';
                runtimeWarn(`[图集] ${label}.json 路径加载失败: ${message}`);
                callback(err || new Error(message), null);
            });
        },

        _loadAtlasDataFromBundle(
            bundle: Bundle,
            atlasPath: string,
            label: string,
            callback: (err: Error | null, atlasData: any | null) => void,
        ) {
            bundle.load(atlasPath, TextAsset, (textErr, textAsset) => {
                if (!textErr && textAsset?.text) {
                    try {
                        callback(null, JSON.parse(textAsset.text));
                        return;
                    } catch (parseErr) {
                        const message = parseErr instanceof Error ? parseErr.message : 'atlas parse failed';
                        runtimeWarn(`[图集] ${label}.json 文本解析失败: ${message}`);
                        callback(parseErr instanceof Error ? parseErr : new Error(message), null);
                        return;
                    }
                }
                this._loadAtlasJsonFromBundle(bundle, atlasPath, label, (err, jsonAsset) => {
                    if (!err && jsonAsset?.json) {
                        callback(null, jsonAsset.json as any);
                        return;
                    }
                    const message = textErr?.message || err?.message || 'unknown error';
                    runtimeWarn(`[图集] ${label}.json 加载失败: ${message}`);
                    callback(textErr || err || new Error(message), null);
                });
            });
        },

        _loadAtlasTextureFromBundle(
            bundle: Bundle,
            imagePath: string,
            label: string,
            callback: (
                err: Error | null,
                texture: Texture2D | null,
                meta?: { releaseMode: 'asset' | 'dynamic'; imageAsset?: ImageAsset | null },
            ) => void,
        ) {
            const spriteFrameCandidates = [`${imagePath}/spriteFrame`, imagePath];
            const trySpriteFrame = (index: number) => {
                if (index >= spriteFrameCandidates.length) {
                    tryTexture(0);
                    return;
                }
                bundle.load(spriteFrameCandidates[index], SpriteFrame, (err, spriteFrame) => {
                    const texture = spriteFrame?.texture as Texture2D | null;
                    if (!err && texture) {
                        callback(null, texture, { releaseMode: 'asset', imageAsset: null });
                        return;
                    }
                    trySpriteFrame(index + 1);
                });
            };
            const textureCandidates = [`${imagePath}/texture`, imagePath];
            const tryTexture = (index: number) => {
                if (index >= textureCandidates.length) {
                    tryImageAsset(0);
                    return;
                }
                bundle.load(textureCandidates[index], Texture2D, (err, texture) => {
                    if (!err && texture) {
                        callback(null, texture, { releaseMode: 'asset', imageAsset: null });
                        return;
                    }
                    tryTexture(index + 1);
                });
            };
            const imageCandidates = [imagePath, `${imagePath}/texture`];
            const tryImageAsset = (index: number) => {
                if (index >= imageCandidates.length) {
                    callback(new Error(`[图集] ${label} texture unavailable`), null);
                    return;
                }
                bundle.load(imageCandidates[index], ImageAsset, (err, imgAsset) => {
                    if (!err && imgAsset) {
                        const texture = new Texture2D();
                        texture.image = imgAsset;
                        callback(null, texture, { releaseMode: 'dynamic', imageAsset: imgAsset });
                        return;
                    }
                    tryImageAsset(index + 1);
                });
            };
            trySpriteFrame(0);
        },

        getSF(name: string): SpriteFrame | null {
            return this.sfCache.get(name) || null;
        },
    });
}
