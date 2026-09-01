import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
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
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, GAME_ASSETS_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_BRUSH, LS_PROP_MAGNET, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
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
    InventoryPropKind, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { ensureThemePanelController } from '../Panels/ThemePanelController';
import { openCollectionShellOverlay } from '../Panels/CollectionShellOverlay';
import { runtimeLog, runtimeWarn } from '../RuntimeLog';

function syncDynamicThemeLabelNode(
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

function requireThemeLabelNode(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
): Label {
    const node = parent.getChildByName(name);
    const label = node?.getComponent(Label) || null;
    if (!node?.isValid || !label) {
        throw new Error(`[theme-ui] missing prefab Label: ${parent.name}/${name}`);
    }
    node.setPosition(x, y, 0);
    label.string = text;
    node.active = true;
    return label;
}

export function installThemePanelFlowModule(target: any): void {
    Object.assign(target, {
        openCollectionImageModal(levelId: number, prefix: string = 'level_') {
            this.closeCollectionImageModal();
            const displayLevelId = prefix === 'zt_level_' ? this.getThemeLevelDisplayNumber(levelId) : levelId;
            openCollectionShellOverlay(this, {
                overlayName: 'CollectionImageModal',
                title: `第${displayLevelId}关`,
                siblingIndex: 1001,
                onClose: () => {
                    this._collectionImageModal = null;
                },
                onReady: ({ overlay, content, pageIndicator }) => {
                    this._collectionImageModal = overlay;
                    content.removeAllChildren();
                    if (pageIndicator) {
                        pageIndicator.active = true;
                        pageIndicator.setPosition(0, 408, 0);
                        requireThemeLabelNode(
                            pageIndicator,
                            'PageIndicatorLabel',
                            `第${displayLevelId}关`,
                            0,
                            0,
                        );
                    }
                    this.drawCollectionPatternOnCard(
                        content,
                        levelId,
                        0,
                        10,
                        548,
                        760,
                        prefix,
                        {
                            drawTargetBackground: true,
                            beanScale: 0.78,
                        },
                    );
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

            const titleLabel = syncDynamicThemeLabelNode(
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
                syncDynamicThemeLabelNode(bubble, 'PinchSub', subtitle, 22, new Color('#7162A2'), 330, 32, 0, -18);
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

        getDefaultThemeGroups(): { name: string; levelIds: number[]; levelNames?: string[] }[] {
            return [
                {
                    name: '像素拼图',
                    levelIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                    levelNames: ['第1关', '第2关', '第3关', '第4关', '第5关', '第6关', '第7关', '第8关', '第9关', '第10关'],
                },
                {
                    name: '给阿嬷的情书',
                    levelIds: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
                    levelNames: ['青绿邮筒', '灯下家书', '阿嬷笑颜', '侨批木箱', '望海阿嬷', '归家邮差', '平安侨批', '红印封缄', '雨巷阿嬷', '纸短情长', '煤油灯', '老花镜', '南洋木船', '榕树石磨', '侨批文化馆'],
                },
                { name: '动物', levelIds: [26, 27, 28, 29, 30, 31, 32, 33] },
                { name: '人物', levelIds: [34, 35, 36, 37, 38, 39] },
                { name: '动漫', levelIds: [40, 41, 42, 43] },
                { name: '其他', levelIds: [44, 45, 46, 47, 48] },
            ];
        },

        getThemeGroups(): { name: string; levelIds: number[]; levelNames?: string[] }[] {
            const groups = this._themeGroupsCache || this.getDefaultThemeGroups();
            let displayNumber = 0;
            return groups.map((group) => ({
                ...group,
                levelNames: group.levelIds.map(() => `第${++displayNumber}关`),
            }));
        },

        /**
         * 异步加载 themes.json 到缓存。
         * 从 gameAssets bundle 加载；
         * 任何失败都回退到默认值。
         */
        loadThemeConfig(callback?: () => void) {
            if (this._themeGroupsCache) { if (callback) callback(); return; }
            if (this._themeGroupsLoading) {
                // 简单轮询等待
                const wait = () => {
                    if (!this._themeGroupsLoading) { if (callback) callback(); return; }
                    this.scheduleOnce(wait, 0.1);
                };
                this.scheduleOnce(wait, 0.1);
                return;
            }
            this._themeGroupsLoading = true;
            const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            const onDone = (data: any) => {
                if (!isRuntimeAlive()) return;
                this._themeGroupsLoading = false;
                runtimeLog(`[ThemeConfig] onDone, data=${!!data}, type=${typeof data}`, data ? JSON.stringify(data).slice(0, 200) : 'null');
                const parsed = this.parseThemeConfig(data);
                this._themeGroupsCache = parsed.length > 0 ? parsed : this.getDefaultThemeGroups();
                if (callback) callback();
            };
            runtimeLog(`[ThemeConfig] gameAssetsBundle=${!!this.gameAssetsBundle}`);
            if (this.gameAssetsBundle) {
                this.gameAssetsBundle.load('themes', JsonAsset, (err, jsonAsset) => {
                    if (!isRuntimeAlive()) return;
                    if (err) {
                        runtimeWarn('[ThemeConfig] load themes from gameAssetsBundle FAILED:', err.message);
                        onDone(null);
                    } else {
                        runtimeLog('[ThemeConfig] themes loaded OK from gameAssetsBundle');
                        onDone(jsonAsset.json);
                    }
                });
            } else {
                runtimeLog('[ThemeConfig] loading gameAssets bundle first...');
                assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                    if (!isRuntimeAlive()) return;
                    if (err || !bundle) {
                        runtimeWarn('[ThemeConfig] loadBundle gameAssets FAILED:', err?.message);
                        onDone(null);
                        return;
                    }
                    runtimeLog('[ThemeConfig] gameAssets bundle loaded OK');
                    this.gameAssetsBundle = bundle;
                    bundle.load('themes', JsonAsset, (err2, jsonAsset) => {
                        if (!isRuntimeAlive()) return;
                        if (err2) {
                            runtimeWarn('[ThemeConfig] load themes from bundle FAILED:', err2.message);
                            onDone(null);
                        } else {
                            runtimeLog('[ThemeConfig] themes loaded OK');
                            onDone(jsonAsset.json);
                        }
                    });
                });
            }
        },

        parseThemeConfig(raw: any): { name: string; levelIds: number[]; levelNames?: string[] }[] {
            if (!raw) return [];
            const groupsRaw = Array.isArray(raw) ? raw : raw.groups;
            if (!Array.isArray(groupsRaw)) return [];
            const out: { name: string; levelIds: number[]; levelNames?: string[] }[] = [];
            for (const g of groupsRaw) {
                if (!g || typeof g.name !== 'string' || !Array.isArray(g.levelIds)) continue;
                const ids: number[] = [];
                for (const id of g.levelIds) {
                    const n = Number(id);
                    if (Number.isFinite(n) && n > 0) ids.push(n | 0);
                }
                if (ids.length === 0) continue;
                const names: string[] | undefined = Array.isArray(g.levelNames)
                    ? g.levelNames.map((n: any) => (typeof n === 'string' ? n : ''))
                    : undefined;
                out.push({ name: g.name, levelIds: ids, levelNames: names });
            }
            return out;
        },

        getThemeUnlockKey(): string {
            return 'pdd.theme_unlocked';
        },

        getThemePanelOpenRequirementLevel(): number {
            return 5;
        },

        getThemeUnlockStepLevel(): number {
            return 5;
        },

        canOpenThemePanel(mainLevel: number = this.getSavedLevel()): boolean {
            return true;
        },

        getThemeUnlockQuota(mainLevel: number = this.getSavedLevel()): number {
            return this.getThemeLevelOrder().length;
        },

        getThemeLevelOrder(): number[] {
            const ordered: number[] = [];
            for (const group of this.getThemeGroups()) {
                for (const levelId of group.levelIds) {
                    if (Number.isFinite(levelId) && levelId > 0) {
                        ordered.push(levelId | 0);
                    }
                }
            }
            return ordered;
        },

        getThemeUnlockRequirementLevel(levelId: number): number {
            const ordered = this.getThemeLevelOrder();
            const index = ordered.indexOf(levelId);
            if (index < 0) {
                return this.getThemePanelOpenRequirementLevel();
            }
            return this.getThemeUnlockStepLevel() * (index + 1);
        },

        canUnlockThemeLevelByMainProgress(levelId: number, mainLevel: number = this.getSavedLevel()): boolean {
            return this.getThemeLevelOrder().includes(levelId);
        },

        getThemeDirectPlayLevelId(): number {
            const ordered = this.getThemeLevelOrder();
            if (ordered.length === 0) return 1;
            const completed = this.getThemeCompletedSet();
            return ordered.find((levelId) => !completed.has(levelId)) || ordered[0];
        },

        getThemeLevelDisplayNumber(levelId: number): number {
            const index = this.getThemeLevelOrder().indexOf(levelId);
            return index >= 0 ? index + 1 : 1;
        },

        getNextThemeLevelId(levelId: number): number {
            const ordered = this.getThemeLevelOrder();
            const index = ordered.indexOf(levelId);
            return index >= 0 && index + 1 < ordered.length ? ordered[index + 1] : 0;
        },

        getThemeCompletedSet(): Set<number> {
            try {
                const raw = sys.localStorage.getItem(LS_THEME_COMPLETED) || '';
                const arr = raw ? JSON.parse(raw) as number[] : [];
                return new Set<number>(
                    (Array.isArray(arr) ? arr : [])
                        .map((value) => Math.floor(Number(value) || 0))
                        .filter((value) => value > 0),
                );
            } catch {
                return new Set<number>();
            }
        },

        setThemeCompleted(levelId: number) {
            const unlocked = this.getThemeUnlockedSet();
            unlocked.add(levelId);
            const set = this.getThemeCompletedSet();
            set.add(levelId);
            try {
                const unlockedLevels = Array.from(unlocked).map((value) => Number(value)).sort((a, b) => a - b);
                const completedLevels = Array.from(set).map((value) => Number(value)).sort((a, b) => a - b);
                sys.localStorage.setItem(this.getThemeUnlockKey(), JSON.stringify(unlockedLevels));
                sys.localStorage.setItem(LS_THEME_COMPLETED, JSON.stringify(completedLevels));
                this.queueCloudGameStateSync();
            } catch {
                /* ignore */
            }
        },

        getThemeUnlockedSet(): Set<number> {
            try {
                const raw = sys.localStorage.getItem(this.getThemeUnlockKey()) || '';
                const arr = raw ? JSON.parse(raw) as number[] : [];
                const set = new Set<number>(
                    (Array.isArray(arr) ? arr : [])
                        .map((value) => Math.floor(Number(value) || 0))
                        .filter((value) => value > 0),
                );
                for (const levelId of this.getThemeCompletedSet()) {
                    set.add(levelId);
                }
                for (const levelId of this.getThemeLevelOrder()) {
                    set.add(levelId);
                }
                return set;
            } catch {
                return new Set<number>(this.getThemeLevelOrder());
            }
        },

        setThemeUnlocked(levelId: number): boolean {
            const normalizedLevelId = Math.max(0, Math.floor(Number(levelId) || 0));
            if (normalizedLevelId <= 0) {
                console.error('[theme_unlock] invalid levelId:', levelId);
                return false;
            }
            const set = this.getThemeUnlockedSet();
            set.add(normalizedLevelId);
            const unlockedLevels = Array.from(set)
                .map((value) => Math.floor(Number(value) || 0))
                .filter((value) => value > 0)
                .sort((a, b) => a - b);
            try {
                sys.localStorage.setItem(this.getThemeUnlockKey(), JSON.stringify(unlockedLevels));
            } catch (error) {
                console.error('[theme_unlock] persist unlocked level failed:', { levelId: normalizedLevelId, error });
                return false;
            }
            const verified = this.getThemeUnlockedSet().has(normalizedLevelId);
            if (!verified) {
                console.error('[theme_unlock] unlocked level readback failed:', { levelId: normalizedLevelId, unlockedLevels });
                return false;
            }
            try {
                this.queueCloudGameStateSync();
            } catch (error) {
                console.error('[theme_unlock] queue cloud sync failed:', { levelId: normalizedLevelId, error });
                return false;
            }
            return true;
        },

        openThemePanel() {
            return ensureThemePanelController(this).open();
        },

        renderThemePanelContent(content: Node, contentW: number, scrollH: number) {
            const groups = this.getThemeGroups();
            const completed = this.getThemeCompletedSet();

            const headerTemplate = content.getChildByName('ThemeHeaderTemplate');
            const cardTemplate = content.getChildByName('ThemeCardTemplate');
            if (!headerTemplate || !cardTemplate) {
                throw new Error('[theme-panel] missing ThemeHeaderTemplate or ThemeCardTemplate');
            }
            const headerUi = headerTemplate.getComponent(UITransform);
            const cardUi = cardTemplate.getComponent(UITransform);
            if (!headerUi || !cardUi) {
                throw new Error('[theme-panel] theme templates must provide UITransform');
            }

            const cardW = cardUi.width;
            const cardH = cardUi.height;
            const headerH = headerUi.height;
            const horizontalGap = Math.max(20, contentW - cardW * 2);
            const fallbackLeftX = -cardW / 2 - horizontalGap / 4;
            const leftX = Number.isFinite(cardTemplate.position.x) && Math.abs(cardTemplate.position.x) > 0
                ? cardTemplate.position.x
                : fallbackLeftX;
            const rightX = Number.isFinite(cardTemplate.position.x) && Math.abs(cardTemplate.position.x) > 0
                ? -cardTemplate.position.x
                : cardW / 2 + horizontalGap / 4;
            const templateContentH = content.getComponent(UITransform)?.height || scrollH;
            const templateTopPad = templateContentH / 2 - (headerTemplate.position.y + headerH / 2);
            const templateHeaderCardGap = (headerTemplate.position.y - headerH / 2) - (cardTemplate.position.y + cardH / 2);
            const gapY = 18;
            const sectionGap = 28;
            const topPad = Math.max(0, Number.isFinite(templateTopPad) ? templateTopPad : 18);
            const headerCardGap = Math.max(0, Number.isFinite(templateHeaderCardGap) ? templateHeaderCardGap : 0);
            this._themePreviewItems = [];
            this._themePreviewRowPitch = cardH + gapY;
            this._themePreviewBufferRows = 1;

            let total = topPad;
            for (const grp of groups) {
                total += headerH;
                total += headerCardGap;
                const rows = Math.ceil(grp.levelIds.length / 2);
                total += rows * cardH + (rows - 1) * gapY;
                total += sectionGap;
            }
            total = Math.max(scrollH, total);
            content.getComponent(UITransform)!.setContentSize(contentW, total);

            let cursorY = total / 2 - topPad;

            for (const grp of groups) {
                const headerNode = instantiate(headerTemplate);
                content.addChild(headerNode);
                headerNode.name = `ThemeHeader_${grp.name}`;
                headerNode.active = true;
                headerNode.layer = Layers.Enum.UI_2D;
                headerNode.setPosition(0, cursorY - headerH / 2);
                const themeNameLabel = headerNode.getChildByName('ThemeName')?.getComponent(Label);
                if (!themeNameLabel) {
                    throw new Error('[theme-panel] ThemeHeaderTemplate is missing ThemeName label');
                }
                themeNameLabel.string = grp.name;
                cursorY -= headerH + headerCardGap;
        
                const rows = Math.ceil(grp.levelIds.length / 2);
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < 2; c++) {
                        const idx = r * 2 + c;
                        if (idx >= grp.levelIds.length) break;
                        const lvId = grp.levelIds[idx];
                        const lvName = grp.levelNames && grp.levelNames[idx] ? grp.levelNames[idx] : '';
                        const isCompleted = completed.has(lvId);
                        const isUnlocked = true;
                        const canUnlock = false;
                        const unlockRequirementLevel = this.getThemeUnlockRequirementLevel(lvId);
                        const cx = c === 0 ? leftX : rightX;
                        const cy = cursorY - cardH / 2 - r * (cardH + gapY);
                        const previewInfo = this.drawThemeCard(content, lvId, cx, cy, cardW, cardH, isUnlocked, isCompleted, canUnlock, unlockRequirementLevel, lvName, {
                            deferPreview: true,
                        });
                        this._themePreviewItems.push({
                            card: previewInfo?.card || content.getChildByName(`ThemeCard_${lvId}`),
                            previewContainer: previewInfo?.previewContainer || null,
                            levelId: lvId,
                            rendered: false,
                            previewW: previewInfo?.previewW || Math.max(1, cardW - 24),
                            previewH: previewInfo?.previewH || Math.max(1, cardH - 74),
                        });
                    }
                }
                cursorY -= rows * cardH + (rows - 1) * gapY;
                cursorY -= sectionGap;
            }
        
            // content 中心 y 设为 (totalH - scrollH)/2，让其顶部对齐 scrollNode 顶部
            if (total > scrollH) {
                content.setPosition(0, -(total - scrollH) / 2);
            } else {
                content.setPosition(0, 0);
            }
        },

        renderThemePanelVisiblePreviews(content?: Node, scrollH?: number, bufferRows: number = 1) {
            const resolvedContent = content || this._themeOverlay?.getChildByName('Box')?.getChildByName('Content')?.getChildByName('ThemeScrollContent');
            const items = this._themePreviewItems as Array<any>;
            if (!resolvedContent?.isValid || !Array.isArray(items) || items.length === 0) return;
            const viewH = Math.max(1, Number(scrollH) || 1);
            const rowPitch = Math.max(1, Number(this._themePreviewRowPitch) || 1);
            const bufferPx = rowPitch * Math.max(0, Math.floor(Number(bufferRows) || 0));
            const minY = -viewH / 2 - bufferPx - resolvedContent.position.y;
            const maxY = viewH / 2 + bufferPx - resolvedContent.position.y;

            for (const item of items) {
                if (!item || item.rendered || !item.card?.isValid || !item.previewContainer?.isValid) continue;
                const cardY = item.card.position.y;
                if (cardY < minY || cardY > maxY) continue;
                item.rendered = true;
                this.drawThemePixelPreview(item.previewContainer, item.levelId, 0, 0, item.previewW, item.previewH);
            }
        },
    });
}
