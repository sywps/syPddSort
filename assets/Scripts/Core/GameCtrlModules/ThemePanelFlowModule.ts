import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, instantiate, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
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
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
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
        openCollectionImageModal(levelId: number) {
            this.closeCollectionImageModal();
            openCollectionShellOverlay(this, {
                overlayName: 'CollectionImageModal',
                title: `第${levelId}关`,
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
                            `第${levelId}关`,
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
                        'level_',
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
            options?: { deferPreview?: boolean; lockedPreviewGrayscale?: boolean },
        ) {
            const card = parent.getChildByName('Card') || parent.children.find((child: Node) => child.name.startsWith('Card_'));
            if (!card) {
                throw new Error('[collection-card] missing Card template node');
            }
            card.name = 'Card';
            card.active = true;
            card.layer = parent.layer || Layers.Enum.UI_2D;
            const frameNode = card.getChildByName('CardFrame');
            if (!frameNode) {
                throw new Error('[collection-card] missing CardFrame template node');
            }
            frameNode.active = true;
            frameNode.layer = card.layer;
            const frameSprite = frameNode.getComponent(Sprite);
            const frame = this.getSF(unlocked ? 'popup_card_unlocked' : 'popup_card_locked');
            if (!frameSprite || !frame) {
                throw new Error(`[collection-card] missing prefab sprite state: ${unlocked ? 'popup_card_unlocked' : 'popup_card_locked'}`);
            }
            frameSprite.spriteFrame = frame;
            frameSprite.color = Color.WHITE;
            const frameUi = frameNode.getComponent(UITransform);
            const frameW = frameUi?.width || 248;
            const frameH = frameUi?.height || 193;
            card.getChildByName('PixelPreview')?.destroy();
            const labelNode = card.getChildByName('Lbl');
            const hintNode = card.getChildByName('TapHint');
            const previewX = 0;
            const previewY = 18;
            const previewW = frameW - 56;
            const previewH = frameH - 82;
            const label = labelNode?.getComponent(Label);
            if (!labelNode || !label) {
                throw new Error('[collection-card] missing Lbl template node');
            }
            labelNode.active = true;
            label.string = `第${levelId}关`;
            if (hintNode) hintNode.active = false;

            if (!options?.deferPreview) {
                this.drawCollectionPixelPreviewOnCard(
                    card,
                    levelId,
                    previewX,
                    previewY,
                    previewW,
                    previewH,
                    'level_',
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
                    AudioMgr.inst.play('uiPanel');
                    this.openCollectionImageModal(levelId);
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
                const drawPreview = () => {
                    if (!card.isValid) return;
                    if (typeof this.needsBeanFramesForLevelData === 'function' && this.needsBeanFramesForLevelData(data)) {
                        console.error('[collection-preview] bean SpriteFrames unavailable for level:', data.levelId || levelId);
                        return;
                    }
                    this.drawBeanPreviewGrid(card, data.correctColorArr, data.boardWidth, data.boardHeight, offsetX, offsetY, maxW, maxH, options);
                };
                if (typeof this._prepareBeanFramesForLevelData === 'function') {
                    this._prepareBeanFramesForLevelData(data, drawPreview);
                    return;
                }
                drawPreview();
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
        
        startPinchGuide() {
            if (this._pinchGuideLayer) return;
            const root = this.node;
            const layer = new Node('PinchGuide');
            root.addChild(layer);
            layer.addComponent(UITransform).setContentSize(720, 1280);
            layer.layer = Layers.Enum.UI_2D;
            this._pinchGuideLayer = layer;
        
            // 气泡框（移到右上角，不遮挡棋盘）
            const bubble = new Node('Bubble');
            layer.addChild(bubble);
            bubble.addComponent(UITransform).setContentSize(420, 120);
            bubble.layer = Layers.Enum.UI_2D;
            bubble.setPosition(0, 480, 0);
            const bubbleGraphics = bubble.addComponent(Graphics);
            bubbleGraphics.fillColor = new Color('#FFF8EE');
            bubbleGraphics.roundRect(-210, -60, 420, 120, 16);
            bubbleGraphics.fill();
            bubbleGraphics.strokeColor = new Color('#D1B285');
            bubbleGraphics.lineWidth = 2;
            bubbleGraphics.roundRect(-210, -60, 420, 120, 16);
            bubbleGraphics.stroke();
        
            // 提示文字
            syncDynamicThemeLabelNode(bubble, 'PinchText', '双指捏合', 22, new Color('#5A4A3A'), 320, 32, 0, 16);
            syncDynamicThemeLabelNode(bubble, 'PinchSub', '可以放大/缩小棋盘', 18, new Color('#8A7A6A'), 320, 28, 0, -16);
        
            // 捏合手势动画图标（两个手指圆圈）
            const hand = new Node('PinchHand');
            layer.addChild(hand);
            hand.addComponent(UITransform).setContentSize(120, 80);
            hand.layer = Layers.Enum.UI_2D;
            hand.setPosition(0, 420);
            const hg = hand.addComponent(Graphics);
        
            // 左圆圈
            hg.fillColor = new Color(255, 255, 255, 180);
            hg.strokeColor = new Color('#B08A60');
            hg.lineWidth = 2;
            hg.circle(-25, 0, 20);
            hg.fill();
            hg.stroke();
            // 右圆圈
            hg.circle(25, 0, 20);
            hg.fill();
            hg.stroke();
            // 箭头（向内收缩）
            hg.fillColor = new Color('#B08A60');
            hg.moveTo(-10, 0); hg.lineTo(-2, -6); hg.lineTo(-2, 6); hg.close(); hg.fill();
            hg.moveTo(10, 0); hg.lineTo(2, -6); hg.lineTo(2, 6); hg.close(); hg.fill();
        
            // 脉冲动画
            tween(hand)
                .to(0.8, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'sineInOut' })
                .to(0.8, { scale: new Vec3(0.95, 0.95, 1) }, { easing: 'sineInOut' })
                .union()
                .repeatForever()
                .start();
        
            // 8秒后自动关闭
            this.scheduleOnce(() => {
                if (this._pinchGuideLayer) this.closePinchGuide();
            }, 8);
        },

        closePinchGuide() {
            if (this._pinchGuideLayer) {
                this._pinchGuideLayer.destroy();
            }
            this._pinchGuideLayer = null;
            sys.localStorage.setItem(LS_PINCH_GUIDE, '1');
            this.unscheduleAllCallbacks(); // 清除自动关闭的定时器
        },

        // ==================== 内置关卡 ====================
        
        getBuiltinLevel(): LevelData {
            return {
                levelId: 1,
                boardWidth: 8,
                boardHeight: 8,
                timeLimit: 180,
                slotTotalCount: 12,
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
                    name: '主题关卡',
                    levelIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                    levelNames: ['第1关', '第2关', '第3关', '第4关', '第5关', '第6关', '第7关', '第8关', '第9关', '第10关'],
                },
                {
                    name: '给阿嬷的情书',
                    levelIds: [1401, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412, 1413, 1414, 1415],
                    levelNames: ['青绿邮筒', '灯下家书', '阿嬷笑颜', '侨批木箱', '望海阿嬷', '归家邮差', '平安侨批', '红印封缄', '雨巷阿嬷', '纸短情长', '煤油灯', '老花镜', '南洋木船', '榕树石磨', '侨批文化馆'],
                },
                { name: '动物', levelIds: [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008] },
                { name: '人物', levelIds: [1101, 1102, 1103, 1104] },
                { name: '动漫', levelIds: [1201, 1202, 1203, 1204] },
                { name: '其他', levelIds: [1301, 1302, 1303, 1304, 1305] },
            ];
        },

        getThemeGroups(): { name: string; levelIds: number[]; levelNames?: string[] }[] {
            return this._themeGroupsCache || this.getDefaultThemeGroups();
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
            return mainLevel >= this.getThemePanelOpenRequirementLevel();
        },

        getThemeUnlockQuota(mainLevel: number = this.getSavedLevel()): number {
            if (!this.canOpenThemePanel(mainLevel)) {
                return 0;
            }
            return Math.max(0, Math.floor(mainLevel / this.getThemeUnlockStepLevel()));
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
            return mainLevel >= this.getThemeUnlockRequirementLevel(levelId);
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
                return set;
            } catch {
                return new Set<number>(this.getThemeCompletedSet());
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
            const unlocked = this.getThemeUnlockedSet();
            const completed = this.getThemeCompletedSet();
            const mainLevel = this.getSavedLevel();

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
            const leftX = -cardW / 2 - horizontalGap / 4;
            const rightX = cardW / 2 + horizontalGap / 4;
            const gapY = 18;
            const sectionGap = 28;
            const topPad = 18;

            let total = topPad;
            for (const grp of groups) {
                total += headerH;
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
                cursorY -= headerH;
        
                const rows = Math.ceil(grp.levelIds.length / 2);
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < 2; c++) {
                        const idx = r * 2 + c;
                        if (idx >= grp.levelIds.length) break;
                        const lvId = grp.levelIds[idx];
                        const lvName = grp.levelNames && grp.levelNames[idx] ? grp.levelNames[idx] : '';
                        const isCompleted = completed.has(lvId);
                        const isUnlocked = isCompleted || unlocked.has(lvId);
                        const canUnlock = !isUnlocked && this.canUnlockThemeLevelByMainProgress(lvId, mainLevel);
                        const unlockRequirementLevel = this.getThemeUnlockRequirementLevel(lvId);
                        const cx = c === 0 ? leftX : rightX;
                        const cy = cursorY - cardH / 2 - r * (cardH + gapY);
                        this.drawThemeCard(content, lvId, cx, cy, cardW, cardH, isUnlocked, isCompleted, canUnlock, unlockRequirementLevel, lvName);
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
    });
}
