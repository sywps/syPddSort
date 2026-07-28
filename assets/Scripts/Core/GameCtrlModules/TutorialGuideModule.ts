import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel,
    PerformanceMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
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
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, TUTORIAL_ZOOM_SCALE_DELTA, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, createSingleColorSpriteFrame, BoardViewportController
} from '../GameCtrlShared';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';

const SLOT_INTRO_UNLOCK_HAND_TARGET_Y_OFFSET = -16;
const ZOOM_HINT_HAND_TARGET_Y_OFFSET = -180;
const LEVEL_1_HAND_ARTWORK_TARGET_Y_OFFSET = -17;
const LEVEL_2_HAND_ARTWORK_TARGET_Y_OFFSET = -36;
const LEVEL_2_FIRST_SLOT_PLACE_PROMPT_GAP = 20;
const GUIDE_PROMPT_TOP_HUD_SAFE_INSET = 72;

export function installTutorialGuideModule(target: any): void {
    Object.assign(target, {
        getGuidePromptVariantNode(bubble: Node, variantName: 'SingleLinePrompt' | 'SlotIntroPrompt'): Node {
            const variant = bubble.getChildByName(variantName);
            if (!variant?.isValid || !variant.getComponent(UITransform)) {
                throw new Error(`[guide] Game.scene is missing OverlayRoot/TutorialGuidePrompt/${variantName}`);
            }
            return variant;
        },

        activateGuidePromptVariant(bubble: Node, variantName: 'SingleLinePrompt' | 'SlotIntroPrompt'): Label {
            const singleLine = this.getGuidePromptVariantNode(bubble, 'SingleLinePrompt');
            const slotIntro = this.getGuidePromptVariantNode(bubble, 'SlotIntroPrompt');
            singleLine.active = variantName === 'SingleLinePrompt';
            slotIntro.active = variantName === 'SlotIntroPrompt';
            const activeVariant = variantName === 'SingleLinePrompt' ? singleLine : slotIntro;
            const label = activeVariant.getChildByName('PromptLabel')?.getComponent(Label) || null;
            if (!label) {
                throw new Error(`[guide] Game.scene is missing ${variantName}/PromptLabel Label`);
            }
            this._guideBubbleLbl = label;
            return label;
        },

        getGuidePromptVisualHeight(bubble: Node): number {
            const variantName = this._guideMode === 'slot_intro' ? 'SlotIntroPrompt' : 'SingleLinePrompt';
            return this.getGuidePromptVariantNode(bubble, variantName).getComponent(UITransform)!.contentSize.height;
        },

        getGuidePromptVisualWidth(bubble: Node): number {
            const variantName = this._guideMode === 'slot_intro' ? 'SlotIntroPrompt' : 'SingleLinePrompt';
            const variant = this.getGuidePromptVariantNode(bubble, variantName);
            return variant.getChildByName('BubbleBg')?.getComponent(UITransform)?.contentSize.width
                || variant.getComponent(UITransform)!.contentSize.width;
        },

        getGuideCopyParts(copy: string): { plain: string; prefix: string; emphasis: string } {
            const source = typeof copy === 'string' ? copy : '';
            const start = source.indexOf('【');
            const end = start >= 0 ? source.indexOf('】', start + 1) : -1;
            if (start < 0 || end <= start + 1) {
                return { plain: source.replace(/[【】]/g, ''), prefix: '', emphasis: '' };
            }
            const prefix = source.slice(0, start);
            const emphasis = source.slice(start + 1, end);
            const suffix = source.slice(end + 1).replace(/[【】]/g, '');
            return {
                plain: `${prefix}${emphasis}${suffix}`,
                prefix,
                emphasis,
            };
        },

        getGuideInlineEmphasisLabel(variant: Node, nodeName: string): Label {
            const label = variant.getChildByName(nodeName)?.getComponent(Label) || null;
            if (!label) {
                throw new Error(`[guide] Game.scene is missing ${variant.name}/${nodeName} Label`);
            }
            return label;
        },

        getStarterGuideEmphasisNodeName(step: number = this.getGuideVisualStep?.() || 0): string {
            if (this._guideMode !== 'level_1') return 'PromptLabelInlineEmphasis';
            if (step === 2 || step === 3) return 'PromptLabelInlineEmphasisBlue';
            if (step === 1) return 'PromptLabelInlineEmphasisAction';
            return 'PromptLabelInlineEmphasis';
        },

        getSingleLineGuideEmphasisLabels(singleLine: Node): Label[] {
            return [
                'PromptLabelInlineEmphasis',
                'PromptLabelInlineEmphasisBlue',
                'PromptLabelInlineEmphasisAction',
            ].map((name) => this.getGuideInlineEmphasisLabel(singleLine, name));
        },

        restoreGuideBaseLabelColor(label: Label): void {
            const sceneColor = this._guidePromptDefaultLabelColor as Color | null;
            if (!sceneColor) {
                throw new Error('[guide] scene-owned prompt base color is not initialized');
            }
            label.color = new Color(sceneColor.r, sceneColor.g, sceneColor.b, sceneColor.a);
        },

        applyGuideCopyToLabel(baseLabel: Label, emphasisLabel: Label, copy: string): number {
            this.restoreGuideBaseLabelColor(baseLabel);
            const parts = this.getGuideCopyParts(copy);
            baseLabel.string = parts.plain;
            baseLabel.updateRenderData(true);
            emphasisLabel.node.active = true;
            const emphasisTransform = emphasisLabel.node.getComponent(UITransform);
            if (!emphasisTransform) {
                throw new Error(`[guide] Game.scene is missing UITransform: ${emphasisLabel.node.name}`);
            }
            const measure = (value: string): number => {
                if (!value) return 0;
                emphasisLabel.string = value;
                emphasisLabel.updateRenderData(true);
                return emphasisTransform.contentSize.width;
            };
            const fullWidth = measure(parts.plain);
            if (!parts.emphasis) {
                emphasisLabel.node.active = false;
                emphasisLabel.string = '';
                return fullWidth;
            }

            const prefixWidth = measure(parts.prefix);
            const emphasisWidth = measure(parts.emphasis);
            emphasisLabel.string = parts.emphasis;
            emphasisLabel.updateRenderData(true);
            emphasisLabel.node.setPosition(
                baseLabel.node.position.x - fullWidth / 2 + prefixWidth + emphasisWidth / 2,
                baseLabel.node.position.y,
                baseLabel.node.position.z,
            );
            return fullWidth;
        },

        fitSingleLineGuidePromptToText(singleLine: Node, baseLabel: Label, renderedTextWidth: number): void {
            const promptTransform = singleLine.getComponent(UITransform);
            const labelTransform = baseLabel.node.getComponent(UITransform);
            const bubbleBackgroundTransform = singleLine.getChildByName('BubbleBg')?.getComponent(UITransform) || null;
            if (!promptTransform || !labelTransform || !bubbleBackgroundTransform) {
                throw new Error('[guide] Game.scene is missing SingleLinePrompt sizing nodes');
            }

            const promptMaxWidth = promptTransform.contentSize.width;
            const labelMaxWidth = labelTransform.contentSize.width;
            const horizontalPadding = Math.max(0, promptMaxWidth - labelMaxWidth);
            const fittedWidth = Math.min(
                promptMaxWidth,
                Math.max(bubbleBackgroundTransform.contentSize.height, Math.ceil(renderedTextWidth + horizontalPadding)),
            );
            bubbleBackgroundTransform.setContentSize(fittedWidth, bubbleBackgroundTransform.contentSize.height);
        },

        getActiveGuideInlineEmphasisNodes(bubble: Node): Node[] {
            const slotIntro = this.getGuidePromptVariantNode(bubble, 'SlotIntroPrompt');
            const singleLine = this.getGuidePromptVariantNode(bubble, 'SingleLinePrompt');
            const activeVariant = slotIntro.active ? slotIntro : singleLine;
            const names = activeVariant === slotIntro
                ? ['PromptLabelPrimaryEmphasis', 'PromptLabelSecondaryEmphasis']
                : [
                    'PromptLabelInlineEmphasis',
                    'PromptLabelInlineEmphasisBlue',
                    'PromptLabelInlineEmphasisAction',
                ];
            return names.map((name) => this.getGuideInlineEmphasisLabel(activeVariant, name).node);
        },

        styleLevel2GuidePrompt(_gb: Graphics | null, bubble: Node, lbl: Label, primaryText: string) {
            if (this._guideMode === 'slot_intro'
                && typeof this.styleSlotIntroGuidePrompt === 'function') {
                this.styleSlotIntroGuidePrompt(_gb, bubble, lbl, primaryText);
                return;
            }
            if ((this._guideMode === 'level_1' || this._guideMode === 'level_2' || this._guideMode === 'zoom')
                && typeof this.styleStarterGuidePrompt === 'function') {
                this.styleStarterGuidePrompt(_gb, bubble, lbl, primaryText);
                this.adjustStarterGuidePromptForCurrentStep?.(bubble);
                return;
            }
            const activeLabel = this.activateGuidePromptVariant(bubble, 'SingleLinePrompt');
            bubble.active = true;
            const promptHeight = this.getGuidePromptVisualHeight(bubble);
            const centerY = typeof this.getGuidePromptCenterY === 'function'
                ? this.getGuidePromptCenterY(438, promptHeight)
                : 438;
            bubble.setPosition(0, centerY, 0);
            activeLabel.string = this.formatLevel2GuidePrompt(primaryText);
        },

        styleSlotIntroGuidePrompt(_gb: Graphics | null, bubble: Node, lbl: Label, _primaryText: string) {
            bubble.active = true;
            const slotIntro = this.getGuidePromptVariantNode(bubble, 'SlotIntroPrompt');
            const activeLabel = this.activateGuidePromptVariant(bubble, 'SlotIntroPrompt');
            const bg = slotIntro.getChildByName('BubbleBg');
            const bgSprite = bg?.getComponent(Sprite) || null;
            const bubbleUT = slotIntro.getComponent(UITransform);
            const labelUT = activeLabel.node.getComponent(UITransform);
            const secondaryLabel = slotIntro.getChildByName('PromptLabelSecondary')?.getComponent(Label) || null;
            const primaryEmphasisLabel = this.getGuideInlineEmphasisLabel(slotIntro, 'PromptLabelPrimaryEmphasis');
            const secondaryEmphasisLabel = this.getGuideInlineEmphasisLabel(slotIntro, 'PromptLabelSecondaryEmphasis');
            if (!bubbleUT || !labelUT || !bg?.isValid || !bgSprite || !secondaryLabel) {
                throw new Error('[guide] Game.scene is missing level-exp slot intro prompt nodes');
            }

            const primaryText = this.getConfiguredGuideCopy(0, '点击【解锁按钮】');
            const secondaryText = this.getConfiguredGuideCopy(1, '本关【全部免费】');
            bg.active = true;
            this.applyGuideCopyToLabel(activeLabel, primaryEmphasisLabel, primaryText);
            this.applyGuideCopyToLabel(secondaryLabel, secondaryEmphasisLabel, secondaryText);

            this.positionSlotIntroGuidePrompt?.(bubble);
            const layoutToken = `${this._gameplayInitSeq}:${this._guideMode}:${this._guideStep}`;
            this.scheduleOnce?.(() => {
                if (!bubble?.isValid || !bubble.activeInHierarchy) return;
                if (layoutToken !== `${this._gameplayInitSeq}:${this._guideMode}:${this._guideStep}`) return;
                this.positionSlotIntroGuidePrompt?.(bubble);
            }, 0);
        },

        positionSlotIntroGuidePrompt(bubble: Node): void {
            const bubbleUT = this.getGuidePromptVariantNode(bubble, 'SlotIntroPrompt').getComponent(UITransform);
            if (!bubbleUT) {
                throw new Error('[guide] Game.scene is missing UITransform: OverlayRoot/TutorialGuidePrompt');
            }
            const guideBand = this.getSlotIntroGuideBand?.() || null;
            const defaultY = Number.isFinite(guideBand?.centerY) ? guideBand.centerY : 360;
            bubble.setPosition(0, this.clampGuidePromptCenterY(bubble, defaultY), 0);
        },

        refreshSlotIntroGuideLayout(): void {
            if (this._guideMode !== 'slot_intro' || this._guideStep !== 0) return;
            const bubble = this._guideBubble as Node | null;
            if (!bubble?.isValid || !bubble.activeInHierarchy) return;
            this.positionSlotIntroGuidePrompt?.(bubble);
        },

        clampGuidePromptCenterY(bubble: Node, centerY: number): number {
            const rootTransform = bubble.parent?.getComponent(UITransform)
                || (typeof this.requireCanvasUiRoot === 'function' ? this.requireCanvasUiRoot('OverlayRoot') : null)?.getComponent(UITransform);
            const bubbleHeight = this.getGuidePromptVisualHeight?.(bubble)
                || bubble.getComponent(UITransform)?.contentSize.height
                || 154;
            const visibleHalfH = rootTransform ? rootTransform.contentSize.height / 2 : 640;
            const margin = 12;
            const minCenterY = -visibleHalfH + bubbleHeight / 2 + margin;
            const maxCenterY = visibleHalfH - bubbleHeight / 2 - GUIDE_PROMPT_TOP_HUD_SAFE_INSET;
            return Math.max(minCenterY, Math.min(centerY, maxCenterY));
        },

        getConfiguredGuideCopy(step: number, fallback: string): string {
            const copies = this.levelData?.tutorialGuide?.guideCopies;
            const copy = Array.isArray(copies) ? copies[step] : '';
            return typeof copy === 'string' && copy.trim().length > 0 ? copy.trim() : fallback;
        },

        getGuideVisualStep(): number {
            const renderStep = Math.floor(Number(this._guideRenderStep));
            if (Number.isFinite(renderStep) && renderStep >= 0) return renderStep;
            return Math.floor(Number(this._guideStep) || 0);
        },

        getGuidePromptNodeBounds(node: Node | null, bubble: Node): {
            bottom: number;
            top: number;
            centerX: number;
            centerY: number;
            width: number;
            height: number;
        } | null {
            const targetUT = node?.getComponent(UITransform);
            const parentUT = bubble.parent?.getComponent(UITransform)
                || (typeof this.requireCanvasUiRoot === 'function' ? this.requireCanvasUiRoot('OverlayRoot') : null)?.getComponent(UITransform);
            if (!node?.isValid || !targetUT || !parentUT) return null;
            const targetWorldScale = node.getWorldScale(new Vec3());
            const parentWorldScale = (bubble.parent || this._guideLayer?.parent || node.parent)?.getWorldScale(new Vec3()) || new Vec3(1, 1, 1);
            const scaleX = Math.max(0.0001, Math.abs(targetWorldScale.x || 1) / Math.abs(parentWorldScale.x || 1));
            const scaleY = Math.max(0.0001, Math.abs(targetWorldScale.y || 1) / Math.abs(parentWorldScale.y || 1));
            const worldCenter = targetUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const center = parentUT.convertToNodeSpaceAR(worldCenter);
            const width = targetUT.contentSize.width * scaleX;
            const height = targetUT.contentSize.height * scaleY;
            const halfH = targetUT.contentSize.height * scaleY / 2;
            return {
                bottom: center.y - halfH,
                top: center.y + halfH,
                centerX: center.x,
                centerY: center.y,
                width,
                height,
            };
        },

        getGuidePromptCellsBounds(cells: { row: number; col: number }[], bubble: Node): {
            bottom: number;
            top: number;
            centerX: number;
            centerY: number;
            width: number;
            height: number;
        } | null {
            const parentUT = bubble.parent?.getComponent(UITransform)
                || (typeof this.requireCanvasUiRoot === 'function' ? this.requireCanvasUiRoot('OverlayRoot') : null)?.getComponent(UITransform);
            if (!parentUT || !Array.isArray(cells) || cells.length === 0) return null;
            const parentWorldScale = (bubble.parent || this._guideLayer?.parent || this.boardNode?.parent)?.getWorldScale(new Vec3()) || new Vec3(1, 1, 1);
            const parentScaleX = Math.max(0.0001, Math.abs(parentWorldScale.x || 1));
            const parentScaleY = Math.max(0.0001, Math.abs(parentWorldScale.y || 1));
            let minX = Infinity;
            let maxX = -Infinity;
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
                    const halfW = cellUT.contentSize.width * Math.abs(cellScale.x || 1) / parentScaleX / 2;
                    const halfH = cellUT.contentSize.height * Math.abs(cellScale.y || 1) / parentScaleY / 2;
                    minX = Math.min(minX, local.x - halfW);
                    maxX = Math.max(maxX, local.x + halfW);
                    minY = Math.min(minY, local.y - halfH);
                    maxY = Math.max(maxY, local.y + halfH);
                    usedNode = true;
                }
                if (!usedNode) {
                    const world = this.getBoardCellWorldPosition?.(cell.row, cell.col) || null;
                    if (!world) continue;
                    const local = parentUT.convertToNodeSpaceAR(world);
                    const half = Math.max(1, Number(this.getBoardBeanVisualSize?.() || this.cellSize || 1)) / 2;
                    minX = Math.min(minX, local.x - half);
                    maxX = Math.max(maxX, local.x + half);
                    minY = Math.min(minY, local.y - half);
                    maxY = Math.max(maxY, local.y + half);
                }
            }
            if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
            return {
                bottom: minY,
                top: maxY,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                width: maxX - minX,
                height: maxY - minY,
            };
        },

        getNearestGuideCellToBoundsCenter(cells: BoardGridCell[]): BoardGridCell | null {
            if (!cells.length) return null;
            let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
            for (const cell of cells) {
                minRow = Math.min(minRow, cell.row);
                maxRow = Math.max(maxRow, cell.row);
                minCol = Math.min(minCol, cell.col);
                maxCol = Math.max(maxCol, cell.col);
            }
            const centerRow = (minRow + maxRow) / 2;
            const centerCol = (minCol + maxCol) / 2;
            let targetCell = cells[0];
            let bestDistance = Infinity;
            for (const cell of cells) {
                const rowDistance = cell.row - centerRow;
                const colDistance = cell.col - centerCol;
                const distance = rowDistance * rowDistance + colDistance * colDistance;
                if (distance < bestDistance) {
                    targetCell = cell;
                    bestDistance = distance;
                }
            }
            return targetCell;
        },

        getNearestBlockCellToBoundsCenter(block: BeanBlockInfo): BoardGridCell | null {
            return this.getNearestGuideCellToBoundsCenter(block.cells);
        },

        getGuideAllBoardCellsForPrompt(): BoardGridCell[] {
            const cells: BoardGridCell[] = [];
            const width = this.levelData?.boardWidth || this.boardModel?.width || 0;
            const height = this.levelData?.boardHeight || this.boardModel?.height || 0;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) cells.push({ row, col });
            }
            return cells;
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

        getLevel2GuideBoardTargetCell(step: number = Math.floor(Number(this._guideStep) || 0)): BoardGridCell | null {
            if (step === 1 || step === 3) {
                const colorId = step === 1 ? this._guideFirstColorId : this._guideSecondColorId;
                const block = this.findBlockOnBoard?.(colorId);
                return block ? this.getNearestBlockCellToBoundsCenter(block) : null;
            }
            if (step === 4 || step === 6) {
                const colorId = step === 4 ? this._guideSecondColorId : this._guideFirstColorId;
                return this.getNearestGuideCellToBoundsCenter(this.getGuideEmptyTargetCellsForPrompt(colorId));
            }
            return null;
        },

        getLevel2GuideSlotTargetIndices(step: number = Math.floor(Number(this._guideStep) || 0)): number[] {
            const slots = this.slotModel?.getAll?.() || [];
            const usableCount = Math.max(0, Math.min(
                slots.length,
                Number(this.slotModel?.unlockedCount ?? slots.length),
                this.slotNodes?.length || slots.length,
            ));
            if (step === 2) {
                const targetCount = Math.max(1, Number(this.currentBlock?.cells?.length) || 1);
                const indices: number[] = [];
                for (let index = 0; index < usableCount && indices.length < targetCount; index++) {
                    if (!slots[index]) indices.push(index);
                }
                return indices;
            }
            if (step === 5) {
                const indices: number[] = [];
                for (let index = 0; index < usableCount; index++) {
                    if (slots[index]?.colorId === this._guideFirstColorId) indices.push(index);
                }
                return indices;
            }
            return [];
        },

        getNearestGuideSlotIndexToBoundsCenter(indices: number[]): number | null {
            if (!indices.length) return null;
            const bounds = this.getGuideSlotIndicesLayerBounds?.(indices) || null;
            const layerUT = this._guideLayer?.getComponent(UITransform) || null;
            if (!bounds || !layerUT) return indices[0];
            let targetIndex = indices[0];
            let bestDistance = Infinity;
            for (const index of indices) {
                const slotNode = this.slotNodes[index];
                const slotUT = slotNode?.getComponent(UITransform);
                if (!slotNode?.isValid || !slotUT) continue;
                const world = slotUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const local = layerUT.convertToNodeSpaceAR(world);
                const distanceX = local.x - bounds.centerX;
                const distanceY = local.y - bounds.centerY;
                const distance = distanceX * distanceX + distanceY * distanceY;
                if (distance < bestDistance) {
                    targetIndex = index;
                    bestDistance = distance;
                }
            }
            return targetIndex;
        },

        getLevel2GuideSlotTargetIndex(step: number = Math.floor(Number(this._guideStep) || 0)): number | null {
            return this.getNearestGuideSlotIndexToBoundsCenter(this.getLevel2GuideSlotTargetIndices(step));
        },

        getLevel1GuideSlotTargetIndices(step: number = Math.floor(Number(this._guideStep) || 0)): number[] {
            const slots = this.slotModel?.getAll?.() || [];
            const usableCount = Math.max(0, Math.min(
                slots.length,
                Number(this.slotModel?.unlockedCount ?? slots.length),
                this.slotNodes?.length || slots.length,
            ));
            const indices: number[] = [];
            if (step === 1) {
                const targetCount = Math.max(1, Number(this.currentBlock?.cells?.length) || 1);
                for (let index = 0; index < usableCount && indices.length < targetCount; index++) {
                    if (!slots[index]) indices.push(index);
                }
                return indices;
            }
            if (step === 4) {
                for (let index = 0; index < usableCount; index++) {
                    if (slots[index]?.colorId === this._guideFirstColorId) indices.push(index);
                }
            }
            return indices;
        },

        getGuidePromptSlotIndicesBounds(indices: number[], bubble: Node): {
            bottom: number;
            top: number;
            centerX: number;
            centerY: number;
            width: number;
            height: number;
        } | null {
            const bounds = indices
                .map((index) => this.getGuidePromptNodeBounds(this.slotNodes[index] || null, bubble))
                .filter((entry): entry is {
                    bottom: number;
                    top: number;
                    centerX: number;
                    centerY: number;
                    width: number;
                    height: number;
                } => !!entry);
            if (!bounds.length) return null;
            const left = Math.min(...bounds.map((entry) => entry.centerX - entry.width / 2));
            const right = Math.max(...bounds.map((entry) => entry.centerX + entry.width / 2));
            const bottom = Math.min(...bounds.map((entry) => entry.bottom));
            const top = Math.max(...bounds.map((entry) => entry.top));
            return {
                bottom,
                top,
                centerX: (left + right) / 2,
                centerY: (bottom + top) / 2,
                width: right - left,
                height: top - bottom,
            };
        },

        getGuidePromptBoardVisualBounds(bubble: Node): {
            bottom: number;
            top: number;
            centerX: number;
            centerY: number;
            width: number;
            height: number;
        } | null {
            const bounds = this.getGuideAllBoardCellsForPrompt()
                .map(({ row, col }) => this.getGuidePromptNodeBounds(
                    this.cellNodes[row]?.[col] || this.boardSlotBgNodes[row]?.[col] || null,
                    bubble,
                ))
                .filter((entry): entry is {
                    bottom: number;
                    top: number;
                    centerX: number;
                    centerY: number;
                    width: number;
                    height: number;
                } => !!entry);
            if (!bounds.length) return null;
            const left = Math.min(...bounds.map((entry) => entry.centerX - entry.width / 2));
            const right = Math.max(...bounds.map((entry) => entry.centerX + entry.width / 2));
            const bottom = Math.min(...bounds.map((entry) => entry.bottom));
            const top = Math.max(...bounds.map((entry) => entry.top));
            return {
                bottom,
                top,
                centerX: (left + right) / 2,
                centerY: (bottom + top) / 2,
                width: right - left,
                height: top - bottom,
            };
        },

        getGuidePromptTargetBoundsForCurrentStep(bubble: Node): {
            bottom: number;
            top: number;
            centerX: number;
            centerY: number;
            width: number;
            height: number;
            kind: 'slot' | 'board';
        } | null {
            const step = this.getGuideVisualStep();
            if (this._guideMode === 'level_1') {
                if (step === 1 || step === 4) {
                    const bounds = this.getGuidePromptSlotIndicesBounds(
                        this.getLevel1GuideSlotTargetIndices(step),
                        bubble,
                    );
                    return bounds ? { ...bounds, kind: 'slot' } : null;
                }
                if (step === 0 || step === 2) {
                    const colorId = step === 0 ? this._guideFirstColorId : this._guideSecondColorId;
                    const block = this.findBlockOnBoard?.(colorId);
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
            if (this._guideMode === 'zoom') {
                if (step === 0) {
                    const bounds = this.getGuidePromptNodeBounds(this.boardNode || null, bubble);
                    return bounds ? { ...bounds, kind: 'board' } : null;
                }
                return null;
            }
            if (this._guideMode === 'level_2') {
                if (step === 0) {
                    const bounds = this.getGuidePromptNodeBounds(this.getSlotUnlockGuideTarget?.() || this.slotAreaNode || null, bubble);
                    return bounds ? { ...bounds, kind: 'slot' } : null;
                }
                if (step === 2 || step === 5) {
                    const bounds = this.getGuidePromptSlotIndicesBounds(
                        this.getLevel2GuideSlotTargetIndices(step),
                        bubble,
                    );
                    return bounds ? { ...bounds, kind: 'slot' } : null;
                }
                if (step === 1 || step === 3) {
                    const colorId = step === 1 ? this._guideFirstColorId : this._guideSecondColorId;
                    const block = this.findBlockOnBoard?.(colorId);
                    const bounds = this.getGuidePromptCellsBounds(block?.cells || [], bubble);
                    return bounds ? { ...bounds, kind: 'board' } : null;
                }
                if (step === 4 || step === 6) {
                    const colorId = step === 4 ? this._guideSecondColorId : this._guideFirstColorId;
                    const bounds = this.getGuidePromptCellsBounds(
                        this.getGuideEmptyTargetCellsForPrompt(colorId),
                        bubble,
                    );
                    return bounds ? { ...bounds, kind: 'board' } : null;
                }
            }
            if (this._guideMode === 'slot_intro' && step === 0) {
                const bounds = this.getGuidePromptNodeBounds(this.getSlotUnlockGuideTarget?.() || this.slotAreaNode || null, bubble);
                return bounds ? { ...bounds, kind: 'slot' } : null;
            }
            return null;
        },

        clampGuidePromptCenterX(bubble: Node, centerX: number): number {
            const rootTransform = bubble.parent?.getComponent(UITransform)
                || (typeof this.requireCanvasUiRoot === 'function' ? this.requireCanvasUiRoot('OverlayRoot') : null)?.getComponent(UITransform);
            const bubbleWidth = this.getGuidePromptVisualWidth?.(bubble)
                || bubble.getComponent(UITransform)?.contentSize.width
                || 700;
            const visibleHalfW = rootTransform ? rootTransform.contentSize.width / 2 : 360;
            const margin = 12;
            const minX = -visibleHalfW + bubbleWidth / 2 + margin;
            const maxX = visibleHalfW - bubbleWidth / 2 - margin;
            if (minX > maxX) return 0;
            return Math.max(minX, Math.min(centerX, maxX));
        },

        adjustStarterGuidePromptForCurrentStep(bubble: Node) {
            if (this._guideMode !== 'level_1' && this._guideMode !== 'level_2' && this._guideMode !== 'zoom' && this._guideMode !== 'slot_intro') return;
            const bubbleUT = bubble.getComponent(UITransform);
            if (!bubbleUT) return;
            const target = this.getGuidePromptTargetBoundsForCurrentStep(bubble);
            if (!target) return;
            const bubbleHeight = this.getGuidePromptVisualHeight?.(bubble) || bubbleUT.contentSize.height || 154;
            const step = this.getGuideVisualStep();
            const defaultTargetGap = target.kind === 'slot' ? 44 : 16;
            const targetGap = this._guideMode === 'level_2' && step === 2
                ? LEVEL_2_FIRST_SLOT_PLACE_PROMPT_GAP
                : defaultTargetGap;
            const desiredY = target.top + targetGap + bubbleHeight / 2;
            const clampedAboveY = this.clampGuidePromptCenterY(bubble, desiredY);
            let nextY = clampedAboveY;
            if (target.kind === 'board' && clampedAboveY < desiredY - 0.5) {
                const boardBounds = this.getGuidePromptBoardVisualBounds(bubble);
                if (boardBounds) {
                    const belowBoardY = boardBounds.bottom - defaultTargetGap - bubbleHeight / 2;
                    nextY = this.clampGuidePromptCenterY(bubble, belowBoardY);
                }
            }
            const nextX = this._guideMode === 'level_2' && Number.isFinite(target.centerX)
                ? this.clampGuidePromptCenterX(bubble, target.centerX)
                : bubble.position.x;
            bubble.setPosition(nextX, nextY, bubble.position.z);
        },

        styleStarterGuidePrompt(_gb: Graphics | null, bubble: Node, _lbl: Label, primaryText: string) {
            const lbl = this.activateGuidePromptVariant(bubble, 'SingleLinePrompt');
            const singleLine = this.getGuidePromptVariantNode(bubble, 'SingleLinePrompt');
            const emphasisLabels = this.getSingleLineGuideEmphasisLabels(singleLine);
            emphasisLabels.forEach((label: Label) => {
                label.node.active = false;
                label.string = '';
            });
            const emphasisLabel = this.getGuideInlineEmphasisLabel(
                singleLine,
                this.getStarterGuideEmphasisNodeName(),
            );
            bubble.active = true;
            const copy = this._guideMode === 'level_2' || this._guideMode === 'zoom'
                ? this.formatLevel2GuidePrompt(primaryText)
                : this.formatLevel1GuidePrompt(primaryText);
            const renderedTextWidth = this.applyGuideCopyToLabel(lbl, emphasisLabel, copy);
            this.fitSingleLineGuidePromptToText(singleLine, lbl, renderedTextWidth);
            const promptHeight = this.getGuidePromptVisualHeight(bubble);
            const defaultY = Number.isFinite(this._guidePromptDefaultCenterY)
                ? this._guidePromptDefaultCenterY
                : bubble.position.y;
            bubble.setPosition(0, this.getGuidePromptCenterY(defaultY, promptHeight), 0);
        },

        /** Step 0: 选中 firstColorId 豆豆块 */
        guideStep0(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findBlockOnBoard(this._guideFirstColorId);
            if (block) {
                this.autoHighlightBlock(block.cells);
                this.startHandGestureOnNearestBlockCell(block, hand, LEVEL_1_HAND_ARTWORK_TARGET_Y_OFFSET);
            }
        
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(0, '点任意粉色豆豆'));
        },

        guideLevel2UnlockStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightSlotUnlockButtonForGuide(hand);
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(0, '点击解锁按钮'));
        },

        guideSlotIntroStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightSlotUnlockButtonForGuide(hand);
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(0, '免费送一个空位'));
        },

        guideLevel2PickBlockStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findBlockOnBoard(this._guideFirstColorId);
            if (block) {
                this.autoHighlightBlock(block.cells);
                this.startHandGestureOnBoardCell(
                    this.getLevel2GuideBoardTargetCell(1),
                    hand,
                    LEVEL_2_HAND_ARTWORK_TARGET_Y_OFFSET,
                );
            }
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(1, '点击高亮豆子'));
        },

        guideZoomGestureStep(_gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, _hand: Node) {
            const configuredTitle = this.levelData?.tutorialGuide?.title;
            const title = typeof configuredTitle === 'string' && configuredTitle.trim().length > 0
                ? configuredTitle.trim()
                : '双指【缩放】';
            const configuredSubtitle = this.levelData?.tutorialGuide?.subtitle;
            const subtitle = typeof configuredSubtitle === 'string' ? configuredSubtitle.trim() : '';
            this.startGuidePinchReminderAnimation?.();
            this.setBoardZoomControlActive?.(true, true);
            this.styleLevel2GuidePrompt(gb, bubble, lbl, subtitle ? `${title}，${subtitle}` : title);
        },

        guideLevel2PlaceBlockStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightSlotAreaForGuide();
            this.startHandGestureOnGuideSlotIndex(
                this.getLevel2GuideSlotTargetIndex(2),
                hand,
                LEVEL_2_HAND_ARTWORK_TARGET_Y_OFFSET,
            );
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(2, '再点空插槽'));
        },

        guideLevel2PickCounterpartStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findBlockOnBoard(this._guideSecondColorId);
            if (block) {
                this.autoHighlightBlock(block.cells);
                this.startHandGestureOnBoardCell(
                    this.getLevel2GuideBoardTargetCell(3),
                    hand,
                    LEVEL_2_HAND_ARTWORK_TARGET_Y_OFFSET,
                );
            }
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(3, '点击另一组豆子'));
        },

        guideLevel2PlaceCounterpartStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightEmptyTarget(this._guideSecondColorId);
            this.startHandGestureOnBoardCell(
                this.getLevel2GuideBoardTargetCell(4),
                hand,
                LEVEL_2_HAND_ARTWORK_TARGET_Y_OFFSET,
            );
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(4, '再点对应空位'));
        },

        guideLevel2PickBufferedStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findSlotBlock(this._guideFirstColorId);
            if (block) {
                this.autoHighlightSlotBeans(this._guideFirstColorId);
                this.startHandGestureOnGuideSlotIndex(
                    this.getLevel2GuideSlotTargetIndex(5),
                    hand,
                    LEVEL_2_HAND_ARTWORK_TARGET_Y_OFFSET,
                );
            }
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(5, '点击槽内豆子'));
        },

        guideLevel2PlaceBufferedStep(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightEmptyTarget(this._guideFirstColorId);
            this.startHandGestureOnBoardCell(
                this.getLevel2GuideBoardTargetCell(6),
                hand,
                LEVEL_2_HAND_ARTWORK_TARGET_Y_OFFSET,
            );
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(6, '再点最后空位'));
        },

        /** Step 1: 点击暂存槽放入（place 阶段） */
        guideStep1(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightSlotAreaForGuide();
            this.startHandGestureOnGuideSlotIndex(
                this.getNearestGuideSlotIndexToBoundsCenter(this.getLevel1GuideSlotTargetIndices(1)),
                hand,
                LEVEL_1_HAND_ARTWORK_TARGET_Y_OFFSET,
            );
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(1, '再点空插槽'));
        },

        /** Step 2: 选中 secondColorId 豆豆块 */
        guideStep2(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findBlockOnBoard(this._guideSecondColorId);
            if (block) {
                this.autoHighlightBlock(block.cells);
                this.startHandGestureOnNearestBlockCell(block, hand, LEVEL_1_HAND_ARTWORK_TARGET_Y_OFFSET);
            }
        
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(2, '点任意黄色豆豆'));
        },

        /** Step 3: 点击棋盘目标放置 secondColorId（place 阶段） */
        guideStep3(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightEmptyTarget(this._guideSecondColorId);
            this.startHandGestureOnBoardTarget(
                this._guideSecondColorId,
                hand,
                LEVEL_1_HAND_ARTWORK_TARGET_Y_OFFSET,
            );
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(3, '再点黄色空位'));
        },

        /** Step 4: 从暂存槽选中 firstColorId 豆豆 */
        guideStep4(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            const block = this.findSlotBlock(this._guideFirstColorId);
            if (block) {
                this.autoHighlightSlotBeans(this._guideFirstColorId);
                this.startHandGestureOnGuideSlotIndex(
                    this.getNearestGuideSlotIndexToBoundsCenter(this.getLevel1GuideSlotTargetIndices(4)),
                    hand,
                    LEVEL_1_HAND_ARTWORK_TARGET_Y_OFFSET,
                );
            }
        
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(4, '点槽里的粉色豆豆'));
        },

        /** Step 5: 点击棋盘目标放置 firstColorId → 通关（place 阶段） */
        guideStep5(gm: Graphics, gb: Graphics, lbl: Label, bubble: Node, hand: Node) {
            this.highlightEmptyTarget(this._guideFirstColorId);
            this.startHandGestureOnBoardTarget(
                this._guideFirstColorId,
                hand,
                LEVEL_1_HAND_ARTWORK_TARGET_Y_OFFSET,
            );
            this.styleLevel2GuidePrompt(gb, bubble, lbl, this.getConfiguredGuideCopy(5, '再点粉色空位'));
        },

        getGuideBubblePathSource(): Vec3 | null {
            const bubble = this._guideBubble as Node | null;
            const bubbleUT = bubble?.getComponent(UITransform) || null;
            const layerUT = this._guideLayer?.getComponent(UITransform) || null;
            if (!bubble?.isValid || !bubbleUT || !layerUT) return null;
            const height = this.getGuidePromptVisualHeight?.(bubble) || bubbleUT.contentSize.height;
            const world = bubbleUT.convertToWorldSpaceAR(new Vec3(0, -height / 2, 0));
            return layerUT.convertToNodeSpaceAR(world);
        },

        getGuidePathEndpointsForCurrentStep(): { from: Vec3; to: Vec3 } | null {
            if (this._guideMode !== 'level_1' || !this._guideBubble?.isValid || !this._guideLayer?.isValid) return null;
            const targetBounds = this.getGuidePromptTargetBoundsForCurrentStep(this._guideBubble);
            if (!targetBounds) return null;
            const to = this.convertGuideRootPointToLayer?.(
                new Vec3(targetBounds.centerX, targetBounds.centerY, 0),
            ) || null;
            if (!to) return null;
            const step = Math.floor(Number(this._guideStep) || 0);
            let from: Vec3 | null = null;
            if ((step === 1 || step === 3) && this.currentBlock?.source === 'board') {
                const sourceBounds = this.getGuideCellsLayerBounds?.(this.currentBlock.cells || []) || null;
                if (sourceBounds) from = new Vec3(sourceBounds.centerX, sourceBounds.centerY, 0);
            } else if (step === 4) {
                const cells: BoardGridCell[] = [];
                const width = this.levelData?.boardWidth || this.boardModel?.width || 0;
                const height = this.levelData?.boardHeight || this.boardModel?.height || 0;
                for (let row = 0; row < height; row++) {
                    for (let col = 0; col < width; col++) {
                        if (this.boardModel.correctColors[row][col] === this._guideSecondColorId
                            && this.boardModel.locked[row][col]) {
                            cells.push({ row, col });
                        }
                    }
                }
                const sourceBounds = this.getGuideCellsLayerBounds?.(cells) || null;
                if (sourceBounds) from = new Vec3(sourceBounds.centerX, sourceBounds.centerY, 0);
            } else if (step === 5) {
                const sourceBounds = this.getGuideSlotIndicesLayerBounds?.(
                    Array.isArray(this._selectedSlotIndices) ? this._selectedSlotIndices : [],
                ) || null;
                if (sourceBounds) from = new Vec3(sourceBounds.centerX, sourceBounds.centerY, 0);
            }
            if (!from) from = this.getGuideBubblePathSource?.() || null;
            return from ? { from, to } : null;
        },

        shouldPlayInitialGuidePathForStep(step: number = this._guideStep): boolean {
            return this._guideMode === 'level_1' && (step === 1 || step === 3 || step === 4 || step === 5);
        },

        clearGuideReminderTimer(invalidate: boolean = true, preserveRemaining: boolean = false): void {
            const handler = this._guideReminderHandler as (() => void) | null;
            if (preserveRemaining && handler && (Number(this._guideReminderDueAt) || 0) > 0) {
                this._guideReminderRemainingMs = Math.max(
                    0,
                    (Number(this._guideReminderDueAt) || Date.now()) - Date.now(),
                );
            } else if (!preserveRemaining) {
                this._guideReminderRemainingMs = 0;
            }
            if (handler) this.unschedule?.(handler);
            this._guideReminderHandler = null;
            this._guideReminderDueAt = 0;
            if (invalidate) this._guideReminderToken = (Number(this._guideReminderToken) || 0) + 1;
        },

        hideGuideReminderVisuals(): void {
            this._guideReminderVisible = false;
            for (const hand of [this._guideHand, this._guidePinchLeftHand, this._guidePinchRightHand]) {
                if (!hand?.isValid) continue;
                Tween.stopAllByTarget(hand);
                hand.active = false;
            }
            this.setBoardZoomControlActive?.(false, true);
        },

        armGuideReminder(): void {
            const carriedRemainingMs = Math.max(0, Number(this._guideReminderRemainingMs) || 0);
            this.clearGuideReminderTimer(false, carriedRemainingMs > 0);
            if (this._guideStep < 0 || this._guideInputSuspended || this._guideReminderPausedForLifecycle) return;
            const reminderStage = Math.max(0, Math.floor(Number(this._guideReminderStage) || 0));
            if (reminderStage >= 2) {
                this._guideReminderRemainingMs = 0;
                return;
            }
            const token = (Number(this._guideReminderToken) || 0) + 1;
            const step = this._guideStep;
            const mode = this._guideMode;
            const defaultDelaySeconds = [2, 2][reminderStage];
            const remainingMs = carriedRemainingMs > 0
                ? carriedRemainingMs
                : Math.max(0, Number(this._guideReminderRemainingMs) || 0);
            const delaySeconds = remainingMs > 0 ? remainingMs / 1000 : defaultDelaySeconds;
            this._guideReminderRemainingMs = 0;
            this._guideReminderToken = token;
            this._guideReminderDueAt = Date.now() + delaySeconds * 1000;
            this._guideStatus = 'awaiting_action';
            const handler = () => {
                this._guideReminderHandler = null;
                this._guideReminderDueAt = 0;
                if (this._guideReminderToken !== token || this._guideStep !== step || this._guideMode !== mode) return;
                if (this._guideInputSuspended || this._guideReminderPausedForLifecycle || this.isGameEnd) return;
                this._guideReminderStage = reminderStage + 1;
                this.showGuideReminderForCurrentStep?.();
                if (this._guideReminderStage < 2) this.armGuideReminder?.();
            };
            this._guideReminderHandler = handler;
            this.scheduleOnce(handler, delaySeconds);
        },

        showGuideReminderForCurrentStep(): void {
            if (this._guideStep < 0 || this._guideInputSuspended || this._guideReminderPausedForLifecycle) return;
            this._guideReminderVisible = true;
            const reminderStage = Math.max(1, Math.floor(Number(this._guideReminderStage) || 1));
            const isZoomReminder = this._guideMode === 'zoom' && this._guideStep === 0;
            if (isZoomReminder) {
                if (reminderStage === 1) {
                    this.startGuidePinchReminderAnimation?.();
                    this.setBoardZoomControlActive?.(true, true);
                }
            } else if (reminderStage === 1) {
                this.showGuideTargetFeedback?.('reinforce');
                if (this._guideHand?.isValid) {
                    this._guideHand.active = true;
                    this.startGuideHandPulse(this._guideHand, 2);
                }
            } else if (reminderStage === 2) {
                this.showGuideDimMask?.(184, true);
            }
            this.trackFirstLevelFunnel?.('tutorial_reminder_shown', {
                stepId: this._guideStep,
                stepName: this.getFirstLevelGuideStepKey?.(),
                source: 'tutorial',
                success: true,
                extra: {
                    reminderStage,
                    actionEnabled: this._guideStatus === 'awaiting_action',
                    elapsedSinceReadyMs: Math.max(0, Date.now() - (Number(this._guideActionEnabledAt) || Date.now())),
                },
            });
        },

        startGuidePinchReminderAnimation(): void {
            const root = this._guideHandsRoot as Node | null;
            const left = this._guidePinchLeftHand as Node | null;
            const right = this._guidePinchRightHand as Node | null;
            const rootUT = root?.getComponent(UITransform) || null;
            const boardUT = this.boardNode?.getComponent(UITransform) || null;
            if (!root?.isValid || !left?.isValid || !right?.isValid || !rootUT || !boardUT) return;
            const boardWorld = boardUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const center = rootUT.convertToNodeSpaceAR(boardWorld);
            const closeGap = 42;
            const farGap = 150;
            const centerY = center.y + ZOOM_HINT_HAND_TARGET_Y_OFFSET;
            Tween.stopAllByTarget(left);
            Tween.stopAllByTarget(right);
            left.active = true;
            right.active = true;
            left.setPosition(center.x - closeGap, centerY, 0);
            right.setPosition(center.x + closeGap, centerY, 0);
            tween(left)
                .repeatForever(
                    tween(left)
                        .to(0.6, { position: new Vec3(center.x - farGap, centerY, 0) }, { easing: 'sineInOut' })
                        .to(0.6, { position: new Vec3(center.x - closeGap, centerY, 0) }, { easing: 'sineInOut' })
                        .delay(0.25)
                )
                .start();
            tween(right)
                .repeatForever(
                    tween(right)
                        .to(0.6, { position: new Vec3(center.x + farGap, centerY, 0) }, { easing: 'sineInOut' })
                        .to(0.6, { position: new Vec3(center.x + closeGap, centerY, 0) }, { easing: 'sineInOut' })
                        .delay(0.25)
                )
                .start();
        },

        pauseGuideReminderForLifecycle(): void {
            if (this._guideStep < 0) return;
            this._guideReminderPausedForLifecycle = true;
            this.clearGuideReminderTimer(true, true);
            if (this._guideStatus === 'transitioning') {
                this._guidePreviewStep = -1;
                this.clearGuideRuntimeVisuals?.();
                return;
            }
            this.hideGuideReminderVisuals();
        },

        resumeGuideReminderForLifecycle(): void {
            if (!this._guideReminderPausedForLifecycle) return;
            this._guideReminderPausedForLifecycle = false;
            if (this._guideStep < 0 || this._guideInputSuspended || (Number(this._modalFocusRefs) || 0) > 0) return;
            if (this._guideStatus === 'transitioning') {
                if (!this.isPlacementVisualBusy?.()) this.checkGuideStepComplete?.();
                return;
            }
            this._guideReminderVisible = true;
            if (this._guideHand?.isValid) {
                Tween.stopAllByTarget(this._guideHand);
                this._guideHand.active = true;
                this._guideHand.setScale?.(1, 1, 1);
            }
            this.armGuideReminder();
        },

        dismissZoomHint(reason: string = 'dismiss'): boolean {
            if (this._guideMode !== 'zoom' || this._guideStep < 0) return false;
            this.trackFirstLevelFunnel?.('zoom_hint_dismiss', {
                stepId: this._guideStep,
                stepName: this.getFirstLevelGuideStepKey?.(),
                source: reason,
                success: true,
            });
            this.endTutorial?.();
            return true;
        },

        completeZoomTutorialIfThresholdReached(source: string): boolean {
            if (this._guideMode !== 'zoom' || this._guideStep !== 0 || this._guidePhase !== 'zoom') return false;
            const currentScale = Number(this.boardViewport?.scale || this.boardViewScale || 0);
            if (!Number.isFinite(currentScale) || currentScale <= 0) return false;
            const lastScale = Number(this._guideZoomLastScale || this._guideZoomStartScale || currentScale);
            this._guideZoomLastScale = currentScale;
            if (source !== 'pinch' && source !== 'zoom_progress' && source !== 'zoom_button') return false;
            const actualDelta = Math.abs(currentScale - lastScale);
            if (actualDelta <= 0) return false;
            this._guideZoomAccumulatedScaleDelta = (Number(this._guideZoomAccumulatedScaleDelta) || 0) + actualDelta;
            this._guideZoomLastSource = source;
            if (this._guideZoomAccumulatedScaleDelta <= TUTORIAL_ZOOM_SCALE_DELTA) return false;
            return this.dismissZoomHint?.(source) === true;
        },

        showGuideUnavailableFeedback(worldPos: Vec3, reason: 'transitioning' | 'not_ready'): void {
            this.showGuideTapFeedback?.(worldPos, 'busy');
            const previousRenderStep = this._guideRenderStep;
            if (this._guidePreviewVisible && this._guidePreviewStep >= 0) {
                this._guideRenderStep = this._guidePreviewStep;
                this.showGuideTargetFeedback?.('preview');
            } else if (reason === 'not_ready') {
                this.showGuideTargetFeedback?.('reinforce');
            }
            this._guideRenderStep = previousRenderStep;
            this.showToast?.(
                reason === 'transitioning' ? '豆豆正在移动，马上就好' : '正在准备操作，请稍候',
                0.8,
            );
            this.trackFirstLevelFunnel?.('tutorial_unavailable_feedback_shown', {
                stepId: this._guidePreviewVisible ? this._guidePreviewStep : this._guideStep,
                stepName: this.getFirstLevelGuideStepKey?.(),
                source: reason,
                success: true,
                extra: {
                    actionEnabled: false,
                    previewVisible: this._guidePreviewVisible === true,
                    transitionElapsedMs: Math.max(0, Date.now() - (Number(this._guideTransitionStartedAt) || Date.now())),
                },
            });
        },

        isStarterTutorialAutoCorrectMode(): boolean {
            return this._guideMode === 'level_1' || this._guideMode === 'level_2';
        },

        getStarterTutorialExpectedSelectColor(step: number = this._guideStep): number {
            const usesSecondColor = (this._guideMode === 'level_1' && step === 2)
                || (this._guideMode === 'level_2' && step === 3);
            return usesSecondColor ? this._guideSecondColorId : this._guideFirstColorId;
        },

        isStarterTutorialRawTapOnTarget(worldPos: Vec3): boolean {
            const step = this._guideStep;
            if (this._guideMode === 'level_2' && step === 0 && this._guidePhase === 'unlock') {
                return this.isSlotUnlockTargetHit?.(worldPos) === true;
            }
            if (this._guidePhase === 'select' && this.isGuideSelectStep(step)) {
                const colorId = this.getStarterTutorialExpectedSelectColor?.(step) || 0;
                if (this.shouldGuideSelectFromSlot(step)) {
                    const intent = this.resolveSlotTapIntent?.(worldPos, 'none');
                    const slotIndex = intent?.candidate?.slotIndex;
                    return intent?.kind === 'occupiedSlot'
                        && slotIndex != null
                        && this.slotModel?.getBlock?.(slotIndex)?.colorId === colorId;
                }
                const block = this.findBlockOnBoard?.(colorId) || null;
                return !!block && this.isWorldPosNearGuideCells?.(worldPos, block.cells, 'select') === true;
            }
            if (this._guidePhase === 'place' && this.currentBlock) {
                return this.isGuidePlaceTargetHit?.(worldPos) === true;
            }
            return false;
        },

        showStarterTutorialAutoCorrectFeedback(worldPos: Vec3, rawTargetHit: boolean): void {
            this.showGuideTapFeedback?.(worldPos, rawTargetHit ? 'tap' : 'wrong');
            if (rawTargetHit) return;
            this.showGuideTargetFeedback?.('reinforce', 1);
            if (this._guideHand?.isValid) {
                this.playGuideHandTapRipple?.(this._guideHand);
            }
        },

        trySelectGuideBoardColor(colorId: number, step: number = this._guideStep): boolean {
            const block = this.findBlockOnBoard(colorId);
            if (!block) return false;
            const targetCell = this._guideMode === 'level_2'
                ? (this.getLevel2GuideBoardTargetCell(step) || block.cells[0])
                : block.cells[0];
            if (!targetCell) return false;
            const targetWorld = this.getBoardCellWorldPosition(targetCell.row, targetCell.col);
            return targetWorld ? this.trySelectBoard(targetWorld) : false;
        },

        trySelectGuideSlotColor(colorId: number): boolean {
            const all = this.slotModel.getAll();
            for (let i = 0; i < all.length; i++) {
                const block = all[i];
                if (!block || block.colorId !== colorId) continue;
                const slotNode = this.slotNodes[i];
                const slotUT = slotNode?.getComponent(UITransform) || null;
                if (!slotNode?.isValid || !slotUT) continue;
                return this.trySelectSlot(slotUT.convertToWorldSpaceAR(new Vec3(0, 0, 0)));
            }
            return false;
        },

        getGuideAutoCorrectBoardTarget(colorId: number, step: number = this._guideStep): { row: number; col: number } | null {
            if (this._guideMode === 'level_2') {
                return this.getLevel2GuideBoardTargetCell(step);
            }
            return this.getGuideEmptyTargetCellsForPrompt(colorId)[0] || null;
        },

        handleStarterTutorialAutoCorrectTap(worldPos: Vec3): boolean {
            if (!this.isStarterTutorialAutoCorrectMode()) return false;
            const step = this._guideStep;
            const rawTargetHit = this.isStarterTutorialRawTapOnTarget?.(worldPos) === true;
            const rawHitResult = rawTargetHit
                ? 'hit_target'
                : this.getTutorialMissHitResult?.(worldPos) || 'miss_unknown';
            const rawTouchTarget = this.classifyFirstLevelTouchTarget?.(worldPos) || '';
            const reportSuccess = () => {
                this.showStarterTutorialAutoCorrectFeedback?.(worldPos, rawTargetHit);
                this.reportTutorialTapResult?.(worldPos, 'auto_correct_success', true, 'guide_layer', {
                    autoCorrected: !rawTargetHit,
                    rawTargetHit,
                    rawHitResult,
                    rawTouchTarget,
                    selectedSource: this.currentBlock?.source || '',
                    colorId: this.currentBlock?.colorId || 0,
                });
            };

            if (this._guideMode === 'level_2' && step === 0 && this._guidePhase === 'unlock') {
                reportSuccess();
                this.executeGuideSlotUnlock();
                return true;
            }

            if (this._guidePhase === 'select' && this.isGuideSelectStep(step)) {
                const colorId = this.getStarterTutorialExpectedSelectColor?.(step) || 0;
                const selected = this.shouldGuideSelectFromSlot(step)
                    ? this.trySelectGuideSlotColor(colorId)
                    : this.trySelectGuideBoardColor(colorId, step);
                if (!selected || !this.currentBlock || !this.isCorrectBlockForStep(step, this.currentBlock)) {
                    return false;
                }
                reportSuccess();
                this._guidePhase = 'place';
                this.advanceTutorial();
                return true;
            }

            if (this._guidePhase === 'place' && this.currentBlock) {
                if (!this.isCorrectBlockForStep(step - 1, this.currentBlock)) return false;
                if (this.isGuideSlotPlaceStep(step)) {
                    reportSuccess();
                    this.executeGuidePlacement();
                    return true;
                }
                const target = this.getGuideAutoCorrectBoardTarget(this.getGuidePlaceTargetColor(step), step);
                if (!target) return false;
                reportSuccess();
                this.executeGuidePlacement(target.row, target.col);
                return true;
            }

            return false;
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
            if (this._guideStatus === 'transitioning') {
                this.reportTutorialTapResult?.(worldPos, 'ignored_transitioning', false, 'guide_layer', {
                    ignoreReason: 'placement_committed',
                });
                this.showGuideUnavailableFeedback?.(worldPos, 'transitioning');
                return;
            }
            if (this._guideStep < 0 || this._guideStep >= this._guideTotalSteps) {
                this.reportTutorialTapResult?.(worldPos, 'ignored_invalid_step', false, 'guide_layer');
                return;
            }
        
            const step = this._guideStep;

            if (this.isStarterTutorialAutoCorrectMode()) {
                if (!this.handleStarterTutorialAutoCorrectTap(worldPos)) {
                    this.reportTutorialTapResult?.(worldPos, 'auto_correct_failed', false, 'guide_layer', {
                        autoCorrected: false,
                        rawHitResult: this.getTutorialMissHitResult?.(worldPos) || 'miss_unknown',
                        rawTouchTarget: this.classifyFirstLevelTouchTarget?.(worldPos) || '',
                    });
                    this.showGuideWrongTargetHint(worldPos, false);
                }
                return;
            }

            if ((this._guideMode === 'level_2' || this._guideMode === 'slot_intro') && step === 0) {
                if (this.isSlotUnlockTargetHit(worldPos)) {
                    this.reportTutorialTapResult?.(worldPos, 'hit_target', true, 'guide_layer');
                    this.executeGuideSlotUnlock();
                } else {
                    this.showGuideWrongTargetHint(worldPos);
                }
                return;
            }
        
            if (this._guidePhase === 'select') {
                // 选中目标块，成功后直接推进到对应放置步骤。
                if (this.isGuideSelectStep(step)) {
                    let selected = false;
                    if ((this._guideMode === 'level_1' || this._guideMode === 'level_2')
                        && !this.shouldGuideSelectFromSlot(step)) {
                        selected = this.trySelectHighlightedGuideBoardBlock(step, worldPos);
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
                // 放置阶段
                if (!this.currentBlock) {
                    this.reportTutorialTapResult?.(worldPos, 'ignored_not_ready', false, 'guide_layer', {
                        ignoreReason: 'no_current_block',
                    });
                    this.showGuideUnavailableFeedback?.(worldPos, 'not_ready');
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
        
                const target = (this._guideMode === 'level_1' || this._guideMode === 'level_2')
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
            if (this._guideMode === 'zoom') return false;
            if (this._guideMode === 'level_2') return step === 1 || step === 3 || step === 5;
            if (this._guideMode === 'slot_intro') return false;
            return step % 2 === 0;
        },

        isGuideSlotPlaceStep(step: number): boolean {
            return (this._guideMode === 'level_1' && step === 1)
                || (this._guideMode === 'level_2' && step === 2);
        },

        shouldGuideSelectFromSlot(step: number): boolean {
            return (this._guideMode === 'level_1' && step === 4)
                || (this._guideMode === 'level_2' && step === 5);
        },

        getGuidePlaceTargetColor(step: number): number {
            if (this._guideMode === 'level_2') {
                return step === 4 ? this._guideSecondColorId : this._guideFirstColorId;
            }
            return step === 3 ? this._guideSecondColorId : this._guideFirstColorId;
        },

        isGuidePlaceTargetHit(worldPos: Vec3): boolean {
            const step = this._guideStep;
            // 引导中的入槽步骤：点击暂存槽区域。
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

            if (this._guideMode === 'level_1' || this._guideMode === 'level_2' || this._guideMode === 'slot_intro') {
                hand.active = true;
                const unlockHandOffsetY = this._guideMode === 'slot_intro'
                    ? SLOT_INTRO_UNLOCK_HAND_TARGET_Y_OFFSET
                    : (this._guideMode === 'level_2' ? 8 + LEVEL_2_HAND_ARTWORK_TARGET_Y_OFFSET : 8);
                this.setGuideHandTarget(hand, targetLocal.x, targetLocal.y + unlockHandOffsetY);
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
            if (!target || !targetUT) return false;
            const localPos = targetUT.convertToNodeSpaceAR(worldPos);
            return Math.abs(localPos.x) <= targetUT.contentSize.width / 2 + 12
                && Math.abs(localPos.y) <= targetUT.contentSize.height / 2 + 10;
        },

        executeGuideSlotUnlock() {
            const beforeRows = this.slotUnlockedRows;
            if (beforeRows < this.slotRowCount) {
                this.tryUnlockSlotRow();
            }
            if (this.slotUnlockedRows > beforeRows) {
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

        showGuideWrongTargetHint(worldPos?: Vec3, shouldReport: boolean = true) {
            const hitResult = this.getTutorialMissHitResult?.(worldPos) || 'miss_unknown';
            if (shouldReport) {
                this.reportTutorialTapResult?.(worldPos, hitResult, false, 'guide_layer');
            }
            this._guideWrongAttemptCount = Math.max(0, Number(this._guideWrongAttemptCount) || 0) + 1;
            this.showGuideTargetFeedback?.('reinforce');
            if ((this._guideMode === 'level_1' || this._guideMode === 'level_2')
                && this._guideHand?.isValid) {
                this.startGuideWrongTargetHandPulse?.(this._guideHand);
            }
            this.trackFirstLevelFunnel?.('tutorial_wrong_feedback_shown', {
                stepId: this._guideStep,
                stepName: this.getFirstLevelGuideStepKey?.(),
                source: hitResult,
                success: true,
                extra: {
                    wrongAttemptCount: this._guideWrongAttemptCount,
                    targetReinforced: this._guideDimMaskNode?.isValid === true,
                },
            });
        },

        /** 引导期间自动执行放置动作 */
        executeGuidePlacement(nearRow?: number, nearCol?: number) {
            const block = this.currentBlock!;
            const step = this._guideStep;
        
            if (this.isGuideSlotPlaceStep(step)) {
                // 将目标块放入暂存槽
                if (this._guideMode === 'level_2' && step === 2) {
                    this._guideLevel2SlotPlacementSucceeded = false;
                }
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
                const remainingSelection = storedIdxs.length < block.cells.length
                    ? this.createBoardRemainingSelection(block, block.cells.length - storedIdxs.length)
                    : null;
                if (storedIdxs.length < block.cells.length) {
                    this.boardModel.restoreBlock({
                        colorId: block.colorId,
                        cells: block.cells.slice(storedIdxs.length),
                        isLocked: false,
                        source: 'board',
                    });
                }
                if (storedIdxs.length > 0) {
                    if (this._guideMode === 'level_2' && step === 2) {
                        this._guideLevel2SlotPlacementSucceeded = true;
                    }
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
                    this.beginGuidePlacementTransition();
                    this.startFlyToSlots(
                        block.colorId,
                        sources.slice(0, storedIdxs.length),
                        storedIdxs,
                        block.cells,
                        remainingSelection,
                        () => this.previewNextGuideStepDuringPlacement?.(),
                    );
                } else {
                    this.finishPlace();
                }
            } else {
                // 将当前选中块放到对应颜色的棋盘空位。
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
                    this.beginGuidePlacementTransition();
                    const remainingSelection = result.remaining > 0
                        ? (block.source === 'board'
                            ? this.createBoardRemainingSelection(block, result.remaining)
                            : this.createSlotRemainingSelection(block, result.remaining))
                        : null;
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
                    this.startFlyPlace(
                        block.colorId,
                        sources,
                        result.placed,
                        guideDirtyBoardCells,
                        guideDirtySlotIndices,
                        undefined,
                        { awaitLandEffect: false },
                        remainingSelection,
                        () => this.previewNextGuideStepDuringPlacement?.(),
                    );
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

        beginGuidePlacementTransition(): void {
            this._guideStatus = 'transitioning';
            this._guidePreviewStep = -1;
            this._guideRenderStep = -1;
            this._guidePreviewVisible = false;
            this._guideTransitionStartedAt = Date.now();
            this._guideActionEnabledAt = 0;
            this.clearGuideReminderTimer?.();
            this.hideGuideReminderVisuals?.();
            if (this._guideBubble?.isValid) this._guideBubble.active = false;
            if (this._guideMask?.isValid) {
                this._guideMask.getComponent(Graphics)?.clear();
            }
            this.clearGuideHighlight?.();
            this.playGuideSuccessFeedback?.();
            this.armGuideTransitionWatchdog?.();
        },

        clearGuideTransitionWatchdog(invalidate: boolean = true): void {
            const slowHandler = this._guideTransitionSlowHandler as (() => void) | null;
            const hardHandler = this._guideTransitionHardHandler as (() => void) | null;
            if (slowHandler) this.unschedule?.(slowHandler);
            if (hardHandler) this.unschedule?.(hardHandler);
            this._guideTransitionSlowHandler = null;
            this._guideTransitionHardHandler = null;
            if (invalidate) {
                this._guideTransitionWatchdogToken = Math.max(
                    0,
                    Math.floor(Number(this._guideTransitionWatchdogToken) || 0),
                ) + 1;
            }
        },

        armGuideTransitionWatchdog(): void {
            this.clearGuideTransitionWatchdog?.();
            if (typeof this.scheduleOnce !== 'function') return;
            const token = Math.max(
                0,
                Math.floor(Number(this._guideTransitionWatchdogToken) || 0),
            ) + 1;
            this._guideTransitionWatchdogToken = token;
            const step = Math.floor(Number(this._guideStep) || 0);
            const mode = String(this._guideMode || 'none');
            const startedAt = Number(this._guideTransitionStartedAt) || Date.now();
            const isCurrent = () => this._guideTransitionWatchdogToken === token
                && this._guideStatus === 'transitioning'
                && this._guideStep === step
                && this._guideMode === mode;
            const slowHandler = () => {
                this._guideTransitionSlowHandler = null;
                if (!isCurrent()) return;
                this.trackFirstLevelFunnel?.('tutorial_transition_slow', {
                    stepId: step,
                    stepName: `${mode}:${step}:${this._guidePhase || ''}`,
                    source: 'tutorial_transition_watchdog',
                    success: false,
                    errorCode: 'transition_over_1200ms',
                    duration: Math.max(0, Date.now() - startedAt),
                    extra: {
                        previewVisible: this._guidePreviewVisible === true,
                        placementVisualRefs: Math.max(0, Number(this._placementVisualRefs) || 0),
                    },
                });
            };
            const hardHandler = () => {
                this._guideTransitionHardHandler = null;
                if (!isCurrent()) return;
                const duration = Math.max(0, Date.now() - startedAt);
                this._placementAnimationGeneration = Math.max(
                    0,
                    Math.floor(Number(this._placementAnimationGeneration) || 0),
                ) + 1;
                const dragLayer = this.dragLayer as Node | null;
                for (const child of [...(dragLayer?.children || [])]) {
                    if (child?.name !== 'FlyBean') continue;
                    Tween.stopAllByTarget(child);
                    if (child.isValid) this.recycleFlyBeanNode?.(child);
                }
                this.clearPlacementVisualState?.();
                this.resetCellPositions?.();
                this.resetSlotPositions?.();
                this.renderBoard?.();
                this.renderSlots?.();
                this.trackFirstLevelFunnel?.('tutorial_transition_force_complete', {
                    stepId: step,
                    stepName: `${mode}:${step}:${this._guidePhase || ''}`,
                    source: 'tutorial_transition_watchdog',
                    success: true,
                    duration,
                    extra: {
                        stateCommitted: true,
                        releasedPlacementOwner: true,
                    },
                });
                const stateRecognized = this.checkGuideStepComplete?.() === true;
                if (!stateRecognized) {
                    this.trackFirstLevelFunnel?.('tutorial_transition_force_complete_failed', {
                        stepId: step,
                        stepName: `${mode}:${step}:${this._guidePhase || ''}`,
                        source: 'tutorial_transition_watchdog',
                        success: false,
                        errorCode: 'committed_state_not_recognized',
                        duration,
                    });
                    this.showToast?.('本步未完成，请重试', 1.2);
                }
            };
            this._guideTransitionSlowHandler = slowHandler;
            this._guideTransitionHardHandler = hardHandler;
            this.scheduleOnce(slowHandler, 1.2);
            this.scheduleOnce(hardHandler, 3);
        },

        previewNextGuideStepDuringPlacement(): boolean {
            if ((this._guideMode !== 'level_1' && this._guideMode !== 'level_2')
                || this._guideStatus !== 'transitioning') return false;
            if (this._guideInputSuspended || this._guideReminderPausedForLifecycle) return false;
            const currentStep = Math.floor(Number(this._guideStep) || 0);
            const nextStep = currentStep + 1;
            const canPreview = this._guideMode === 'level_1'
                ? (currentStep === 1 || currentStep === 3)
                : (currentStep === 2 || currentStep === 4);
            if (!canPreview || nextStep >= this._guideTotalSteps) return false;
            if (this._guidePreviewStep === nextStep) return true;
            return this.showGuideStep?.(nextStep, { previewOnly: true }) === true;
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
                    switch (step) {
                        case 1: return block.colorId === this._guideFirstColorId && block.source === 'board';
                        case 3: return block.colorId === this._guideSecondColorId && block.source === 'board';
                        case 5: return block.colorId === this._guideFirstColorId && block.source === 'slot';
                        default: return false;
                    }
                case 'zoom':
                    return false;
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

        trySelectHighlightedGuideBoardBlock(step: number, worldPos: Vec3): boolean {
            const usesSecondColor = (this._guideMode === 'level_1' && step === 2)
                || (this._guideMode === 'level_2' && step === 3);
            const colorId = usesSecondColor ? this._guideSecondColorId : this._guideFirstColorId;
            const block = this.findBlockOnBoard(colorId);
            if (!block || !this.isWorldPosNearGuideCells(worldPos, block.cells, 'select')) return false;
            const targetCell = this._guideMode === 'level_2'
                ? this.getLevel2GuideBoardTargetCell(step)
                : block.cells[0];
            if (!targetCell) return false;
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
            if (this._guideMode === 'level_2') {
                return this.getLevel2GuideBoardTargetCell(this._guideStep);
            }
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

        checkGuideStepComplete(): boolean {
            if (this._guideStep < 0 || this._guideStep >= this._guideTotalSteps) return false;
            if (this._guideInputSuspended) return false;
            if (this._guidePhase !== 'place') return false;
        
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
                    switch (step) {
                        case 2:
                            done = this._guideLevel2SlotPlacementSucceeded === true;
                            break;
                        case 4:
                            done = this.isColorFullyLocked(this._guideSecondColorId);
                            break;
                        case 6:
                            done = this.boardModel.isAllLocked();
                            break;
                    }
                    break;
            }
        
            if (done) {
                const isFinalStep = step === this._guideTotalSteps - 1;
                if (isFinalStep) {
                    // 先同步释放引导，再保留延迟 Win 作为 watchdog 等无直接 Win 调用方的兜底。
                    this.endTutorial();
                    this.scheduleOnce(() => this.playPatternCompleteThenWin(), 0.3);
                    return true;
                }
                const hasEarlyPreview = (this._guideMode === 'level_1' || this._guideMode === 'level_2')
                    && this._guideStatus === 'transitioning'
                    && this._guidePreviewStep === step + 1;
                this.scheduleOnce(() => {
                    if (this._guideStep < 0) return;
                    this.advanceTutorial();
                }, hasEarlyPreview ? 0 : 0.2);
                return true;
            } else {
                // 没有正确放置，重置到当前放置步骤重新操作。
                this._guidePhase = 'place';
                this.showGuideStep(step);
                return false;
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

        /** 自动高亮棋盘上的目标豆豆块 — 整个连通块一个统一外轮廓高亮 */
        autoHighlightBlock(cells: { row: number; col: number }[]) {
            this.clearGuideHighlight();
            this._guideHighlightCells = [...cells];
            if (this._guideMode === 'level_1' || this._guideMode === 'level_2' || this._guideMode === 'zoom') {
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
            if (this._guideMode === 'level_1' || this._guideMode === 'level_2' || this._guideMode === 'zoom') {
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
            const bounds = this.getGuideCellsLayerBounds?.(block.cells) || null;
            if (!bounds) return;
            hand.active = true;
            this.setGuideHandTarget(hand, bounds.centerX, bounds.centerY);
            this.startGuideHandPulse(hand);
        },

        startHandGestureOnBoardCell(targetCell: BoardGridCell | null, hand: Node, targetOffsetY: number = 0) {
            if (!targetCell) return;
            const bounds = this.getGuideCellsLayerBounds?.([targetCell]) || null;
            if (!bounds) return;
            hand.active = true;
            this.setGuideHandTarget(hand, bounds.centerX, bounds.centerY + targetOffsetY);
            this.startGuideHandPulse(hand);
        },

        startHandGestureOnNearestBlockCell(block: BeanBlockInfo, hand: Node, targetOffsetY: number = 0) {
            const targetCell = this.getNearestBlockCellToBoundsCenter(block);
            this.startHandGestureOnBoardCell(targetCell, hand, targetOffsetY);
        },

        startHandGestureOnGuideSlotIndex(slotIndex: number | null, hand: Node, targetOffsetY: number = 0) {
            if (slotIndex == null) return;
            const slotNode = this.slotNodes[slotIndex];
            const slotUT = slotNode?.getComponent(UITransform);
            const layerUT = this._guideLayer?.getComponent(UITransform);
            if (!slotNode?.isValid || !slotUT || !layerUT) return;
            const slotWorldCenter = slotUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            const slotCenter = layerUT.convertToNodeSpaceAR(slotWorldCenter);
            hand.active = true;
            this.setGuideHandTarget(hand, slotCenter.x, slotCenter.y + targetOffsetY);
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
