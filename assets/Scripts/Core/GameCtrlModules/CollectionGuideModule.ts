import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, Mask,
    NodePool, instantiate, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_TEXTURE_SEARCH_DIRS, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY,
    SKILL_BUTTON_Y, SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, createSingleColorSpriteFrame, BoardViewportController
} from '../GameCtrlShared';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';
import { openCollectionShellOverlay } from '../Panels/CollectionShellOverlay';

export const COLLECTION_REPLAY_ROUTE_REASON = 'collection_replay';

function syncDynamicGuideLabelNode(
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
    overflow: number = Label.Overflow.SHRINK,
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
    label.overflow = overflow;
    label.enableWrapText = false;
    node.active = true;
    return label;
}

function requireCollectionLabelNode(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
): Label {
    const node = parent.getChildByName(name);
    const label = node?.getComponent(Label) || null;
    if (!node?.isValid || !label) {
        throw new Error(`[collection-ui] missing prefab Label: ${parent.name}/${name}`);
    }
    node.setPosition(x, y, 0);
    label.string = text;
    node.active = true;
    return label;
}

export function installCollectionGuideModule(target: any): void {
    Object.assign(target, {
        startCollectionReplay(levelId: number, prefix: string = 'level_'): boolean | Promise<boolean> {
            const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
            const normalizedPrefix = String(prefix || 'level_');
            const gameplayEntryMode = normalizedPrefix === 'zt_level_' ? 'theme' : 'main';
            const startedFromHome = this.getRuntimeSceneName('Game') === 'Home';
            if (this._collectionReplayStarting) return false;

            if (startedFromHome) {
                const appRoot = AppRoot.tryGet();
                if (!appRoot || appRoot.router.isTransitioning || appRoot.session.pendingGameplayRequest) {
                    return false;
                }
            }

            this._collectionReplayStarting = true;
            if (!this.costVigorForLevel(normalizedLevelId, COLLECTION_REPLAY_ROUTE_REASON)) {
                this.showNoLivesAdModal({
                    source: COLLECTION_REPLAY_ROUTE_REASON,
                    levelId: normalizedLevelId,
                    gameplayEntryMode,
                    onResult: (result: any) => {
                        this._collectionReplayStarting = false;
                        if (result?.status !== 'granted' || !this.isValid) return;
                        this.startCollectionReplay(normalizedLevelId, normalizedPrefix);
                    },
                });
                return false;
            }

            const failStart = (error: unknown): false => {
                this._collectionReplayStarting = false;
                console.error('[collection-replay] start failed:', {
                    levelId: normalizedLevelId,
                    prefix: normalizedPrefix,
                    error,
                });
                this.showToast?.('关卡启动失败，请重试');
                return false;
            };

            try {
                this.closeCollection();
                if (startedFromHome) {
                    return this.requestGameplayRoute(
                        normalizedLevelId,
                        normalizedPrefix,
                        false,
                        'none',
                        COLLECTION_REPLAY_ROUTE_REASON,
                    ).then(() => {
                        this._collectionReplayStarting = false;
                        return true;
                    }).catch(failStart);
                }

                this._isThemeLevel = gameplayEntryMode === 'theme';
                this._currentThemeLevelId = this._isThemeLevel ? normalizedLevelId : 0;
                this.deactivateMainMenuNode();
                this.loadLevel(
                    normalizedLevelId,
                    normalizedPrefix,
                    false,
                    COLLECTION_REPLAY_ROUTE_REASON,
                );
                this._collectionReplayStarting = false;
                return true;
            } catch (error) {
                return failStart(error);
            }
        },

        bindCollectionReplayButton(box: Node, levelId: number, prefix: string = 'level_'): Node {
            const button = box.getChildByName('CollectionReplayButton');
            const titleLabel = button?.getChildByName('ReplayTitle')?.getComponent(Label) || null;
            const vigorIcon = button?.getChildByName('VigorIcon') || null;
            const vigorSprite = vigorIcon?.getComponent(Sprite) || null;
            const costLabel = button?.getChildByName('VigorCost')?.getComponent(Label) || null;
            if (
                !button?.isValid
                || !button.getComponent(UITransform)
                || !button.getComponent(Sprite)?.spriteFrame
                || !titleLabel
                || !vigorIcon?.isValid
                || !vigorSprite?.spriteFrame
                || !costLabel
            ) {
                throw new Error('[collection-replay] missing prefab replay button nodes or components');
            }

            titleLabel.string = '重玩本关';
            costLabel.string = '-1';
            button.active = true;

            this.bindPanelButton(button, () => {
                AudioMgr.inst.play('button');
                void this.startCollectionReplay(levelId, prefix);
            });
            return button;
        },

        openCollectionImageModal(levelId: number, prefix: string = 'level_') {
            this.closeCollectionImageModal();
            openCollectionShellOverlay(this, {
                overlayName: 'CollectionImageModal',
                title: `第${levelId}关`,
                siblingIndex: 1001,
                onClose: () => {
                    this._collectionImageModal = null;
                },
                onReady: ({ overlay, box, content, pageIndicator }) => {
                    this._collectionImageModal = overlay;
                    content.removeAllChildren();
                    if (pageIndicator) {
                        pageIndicator.active = true;
                        pageIndicator.setPosition(0, 408, 0);
                        requireCollectionLabelNode(
                            pageIndicator,
                            'PageIndicatorLabel',
                            `第${levelId}关`,
                            0,
                            0,
                        );
                    }
                    this.drawCollectionPatternOnCard(
                        content,
                        levelId,
                        0,
                        70,
                        520,
                        590,
                        prefix,
                        {
                            drawTargetBackground: true,
                            beanScale: 0.78,
                        },
                    );
                    this.bindCollectionReplayButton(box, levelId, prefix);
                },
            });
        },

        drawCollectionCard(
            parent: Node,
            levelId: number,
            cx: number,
            cy: number,
            w: number,
            h: number,
            unlocked: boolean,
            savedLevel: number,
            options?: { deferPreview?: boolean; lockedPreviewGrayscale?: boolean; prefix?: string },
        ) {
            const prefix = options?.prefix || 'level_';
            const card = parent.getChildByName('Card') || parent.children.find((child: Node) => child.name.startsWith('Card_'));
            if (!card) {
                throw new Error('[collection-card] missing Card template node');
            }
            card.name = 'Card';
            card.active = true;
            card.layer = parent.layer || Layers.Enum.UI_2D;
            const frameSprite = card.getComponent(Sprite);
            if (!frameSprite?.spriteFrame) {
                throw new Error('[collection-card] missing Card prefab spriteFrame');
            }
            frameSprite.color = Color.WHITE;
            const frameUi = card.getComponent(UITransform);
            const frameW = frameUi?.width || 248;
            const frameH = frameUi?.height || 193;
            const previewNode = card.getChildByName('PixelPreview');
            if (!previewNode) {
                throw new Error('[collection-card] missing PixelPreview container node');
            }
            previewNode.active = true;
            previewNode.layer = card.layer;
            const previewUi = previewNode.getComponent(UITransform);
            if (!previewUi) {
                throw new Error('[collection-card] missing PixelPreview UITransform');
            }
            const labelNode = card.getChildByName('Lbl');
            const hintNode = card.getChildByName('TapHint');
            const previewX = 0;
            const previewY = 0;
            const previewW = previewUi.width || Math.max(1, frameW - 24);
            const previewH = previewUi.height || Math.max(1, frameH - 74);
            const label = labelNode?.getComponent(Label);
            if (!labelNode || !label) {
                throw new Error('[collection-card] missing Lbl template node');
            }
            labelNode.active = false;
            label.string = '';
            if (hintNode) hintNode.active = false;

            if (!options?.deferPreview) {
                this.drawCollectionPixelPreviewOnCard(
                    card,
                    levelId,
                    previewX,
                    previewY,
                    previewW,
                    previewH,
                    prefix,
                    { grayscale: !unlocked && !!options?.lockedPreviewGrayscale },
                );
            }

            if (unlocked) {
                // 打开图案详情
                if (!card.getComponent(Button)) card.addComponent(Button);
                card.targetOff(this);
                card.on(Button.EventType.CLICK, (e: EventTouch) => {
                    e.propagationStopped = true;
                    if (this._collectionOverlay && this._collectionScrollSuppressClick) {
                        this._collectionScrollSuppressClick = false;
                        return;
                    }
                    AudioMgr.inst.play('button');
                    this.openCollectionImageModal(levelId, prefix);
                }, this);
            } else {
                card.targetOff(this);
            }

            return { card, previewX, previewY, previewW, previewH };
        },

        drawLevelPreviewOnCard(
            card: Node,
            levelId: number,
            offsetX: number,
            offsetY: number,
            maxW: number,
            maxH: number,
            prefix: string = 'level_',
            options?: {
                drawTargetBackground?: boolean;
                beanScale?: number;
            },
        ) {
            this.loadLevelData(levelId, (data) => {
                if (!data || !card.isValid) return;
                this.drawBeanPreviewGrid(card, data.correctColorArr, data.boardWidth, data.boardHeight, offsetX, offsetY, maxW, maxH, options);
            }, prefix);
        },

        closeCollection() {
            this.closeCollectionImageModal();
            if (this._collectionScrollInertiaStep) {
                this.unschedule(this._collectionScrollInertiaStep);
                this._collectionScrollInertiaStep = null;
            }
            if (this._collectionOverlay) {
                this._closePanelWithTextureOwner(this._collectionOverlay, 'collection', 'collection');
            }
            this._collectionPage = 0;
            this._collectionOverlay = null;
            this._collectionContentNode = null;
            this._collectionScrollContentNode = null;
            this._collectionPreviewItems = [];
            this._collectionPreviewRowPitch = 0;
            this._collectionPageIndicator = null;
            this._collectionScrollDragging = false;
            this._collectionScrollMoved = false;
            this._collectionScrollSuppressClick = false;
        },

        // ==================== 缩放引导 ====================
        
        startPinchGuide(options: { title?: string; subtitle?: string; autoCloseSeconds?: number } = {}) {
            if (this.isGameEnd) return;
            if (this._pinchGuideLayer) return;
            const title = options.title || '双指拖动可放大缩小图案';
            const subtitle = options.subtitle || '';
            const autoCloseSeconds = Math.max(0, Number(options.autoCloseSeconds ?? 8) || 0);
            const requiredFrames = ['guide_hand', 'guide_bubble_frame'];
            const guideHandFrame = this.getSF?.('guide_hand') || null;
            const guideBubbleFrame = this.getSF?.('guide_bubble_frame') || null;
            if (!guideHandFrame || !guideBubbleFrame) {
                if (typeof this._ensureSpriteFramesByName === 'function') {
                    this._ensureSpriteFramesByName(requiredFrames, () => this.startPinchGuide(options));
                    return;
                }
                throw new Error('[pinch-guide] missing required SpriteFrames: guide_hand, guide_bubble_frame');
            }
            const root = typeof this.requireCanvasUiRoot === 'function'
                ? this.requireCanvasUiRoot('OverlayRoot')
                : this.node;
            if (root.parent) {
                root.setSiblingIndex(root.parent.children.length - 1);
            }
            const rootTransform = root.getComponent(UITransform);
            const layerWidth = rootTransform?.contentSize.width || 720;
            const layerHeight = rootTransform?.contentSize.height || 1280;
            const visibleHalfH = layerHeight / 2;
            const layer = new Node('PinchGuide');
            root.addChild(layer);
            layer.addComponent(UITransform).setContentSize(layerWidth, layerHeight);
            layer.layer = Layers.Enum.UI_2D;
            layer.setSiblingIndex(Math.max(0, root.children.length - 1));
            this._pinchGuideLayer = layer;

            const bubble = new Node('Bubble');
            layer.addChild(bubble);
            const bubbleText = title;
            const hasSubtitle = subtitle.length > 0;
            const bubbleWidth = hasSubtitle ? 430 : Math.max(560, Math.min(640, bubbleText.length * 40 + 120));
            const bubbleHeight = hasSubtitle ? 132 : 128;
            bubble.addComponent(UITransform).setContentSize(bubbleWidth, bubbleHeight);
            bubble.layer = Layers.Enum.UI_2D;
            const bubbleY = Math.min(visibleHalfH - 150, 430);
            bubble.setPosition(0, bubbleY, 0);
            this._applySpriteFrame(bubble, guideBubbleFrame, bubbleWidth, bubbleHeight, Sprite.Type.SLICED);

            const titleLabel = syncDynamicGuideLabelNode(
                bubble,
                'PinchText',
                bubbleText,
                hasSubtitle ? 32 : 34,
                new Color('#7162A2'),
                bubbleWidth - 112,
                hasSubtitle ? 40 : 64,
                0,
                hasSubtitle ? 18 : 22,
            );
            (titleLabel as Label & { isBold?: boolean }).isBold = true;
            if (hasSubtitle) {
                syncDynamicGuideLabelNode(bubble, 'PinchSub', subtitle, 22, new Color('#7162A2'), 330, 32, 0, -18);
            }

            const handSize = Math.round(GUIDE_HAND_SPRITE_SIZE * 1.15);
            const gestureCenterY = bubble.position.y - 480;
            const nearGap = 74;
            const farGap = 250;
            const setHandFingertip = (hand: Node, targetX: number, targetY: number, mirrored: boolean) => {
                const offsetX = mirrored ? -GUIDE_HAND_FINGERTIP_OFFSET_X : GUIDE_HAND_FINGERTIP_OFFSET_X;
                hand.setPosition(targetX - offsetX, targetY - GUIDE_HAND_FINGERTIP_OFFSET_Y, 0);
            };
            const createPinchHand = (name: string, mirrored: boolean, nearTipX: number, farTipX: number) => {
                const hand = new Node(name);
                layer.addChild(hand);
                hand.addComponent(UITransform).setContentSize(handSize, handSize);
                hand.layer = Layers.Enum.UI_2D;
                this._applySpriteFrame(hand, guideHandFrame, handSize, handSize);
                setHandFingertip(hand, nearTipX, gestureCenterY, mirrored);
                hand.setScale(mirrored ? -1 : 1, 1, 1);
                const nearPos = new Vec3(hand.position.x, hand.position.y, hand.position.z);
                setHandFingertip(hand, farTipX, gestureCenterY, mirrored);
                const farPos = new Vec3(hand.position.x, hand.position.y, hand.position.z);
                hand.setPosition(nearPos);
                tween(hand)
                    .delay(0.18)
                    .repeatForever(
                        tween(hand)
                            .to(0.58, { position: farPos }, { easing: 'sineOut' })
                            .delay(0.36)
                            .to(0.16, { position: nearPos }, { easing: 'quadIn' })
                            .delay(0.16)
                    )
                    .start();
            };
            createPinchHand('PinchGuideLeftHand', true, -nearGap / 2, -farGap / 2);
            createPinchHand('PinchGuideRightHand', false, nearGap / 2, farGap / 2);

            this._pinchGuideAutoCloseHandler = () => {
                if (this._pinchGuideLayer) this.closePinchGuide();
            };
            if (autoCloseSeconds > 0) {
                this.scheduleOnce(this._pinchGuideAutoCloseHandler, autoCloseSeconds);
            }
        },

        closePinchGuide() {
            if (this._pinchGuideAutoCloseHandler) {
                this.unschedule(this._pinchGuideAutoCloseHandler);
                this._pinchGuideAutoCloseHandler = null;
            }
            if (this._pinchGuideLayer) {
                this._pinchGuideLayer.destroy();
            }
            this._pinchGuideLayer = null;
            sys.localStorage.setItem(LS_PINCH_GUIDE, '1');
        },

        // ==================== 内置关卡 ====================
        
        getBuiltinLevel(): LevelData {
            return {
                levelId: 1,
                Hard: 0,
                boardWidth: 8,
                boardHeight: 8,
                timeLimit: 180,
                slotTotalCount: 12,
                conveyorCapacity: 60,
                correctColorArr: [
                    [1,1,1,1,2,2,2,2],[1,1,1,1,2,2,2,2],
                    [1,1,1,1,2,2,2,2],[1,1,1,1,2,2,2,2],
                    [2,2,2,2,1,1,1,1],[2,2,2,2,1,1,1,1],
                    [2,2,2,2,1,1,1,1],[2,2,2,2,1,1,1,1],
                ],
                initRandomColorArr: [
                    [2,2,1,1,2,1,1,2],[1,2,2,1,1,2,1,2],
                    [2,1,2,1,2,1,2,1],[1,1,2,2,1,2,2,1],
                    [1,2,1,2,1,2,1,2],[2,1,1,2,2,1,2,1],
                    [1,2,2,1,2,1,1,2],[2,1,2,1,1,2,2,1],
                ],
            };
        },

    });
}
