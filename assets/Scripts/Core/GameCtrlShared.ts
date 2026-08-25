/**
 * 游戏主控制器 - 加载真实图片资源，匹配参考 UI
 */

import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, ProgressBar, Slider,
    Vec2, Vec3, SpriteFrame, JsonAsset, assetManager,
    Button, Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask, NodePool, sp,
    Prefab, instantiate,
    Game, game, Widget,
} from 'cc';
import type { AssetManager, EventMouse, EventTouch, LabelOutline } from 'cc';
import { AdConfig } from '../Platform/AdConfig';
import { COLOR_HEX } from './LevelConfig';
import type { LevelData, BeanBlockInfo } from './LevelConfig';
import { BoardModel } from './BoardModel';
import { SlotModel } from '../UI/SlotCtrl';
import { AudioMgr, type SfxName } from './AudioMgr';
import { PerformanceMgr } from './PerformanceMgr';
import { AnalyticsMgr } from './AnalyticsMgr';
import { LeaderboardMgr, type LeaderboardEntry, type LeaderboardResult } from './LeaderboardMgr';
import { ECONOMY_NUMERIC_TABLE } from './EconomyConfig';
import { UserMgr } from './UserMgr';
import { UserStateSyncMgr, type CloudGameState, type CloudUserState } from './UserStateSyncMgr';
import {
    getLogicalMainLevelId as mapPhysicalToLogicalLevelId,
    getMainLevelTimeLimitSeconds,
    getPhysicalMainLevelId as mapLogicalToPhysicalLevelId,
    shouldUseMainLevelUnlimitedTime,
} from './LevelRouteService';
import {
    GAME_ASSETS_BUNDLE_NAME,
    HOME_ASSETS_BUNDLE_NAME,
    LEVEL_DATA_BUNDLE_NAME,
    LOCAL_BOOTSTRAP_BUNDLE_NAME,
    LOGICAL_COCOS_CORE_BUNDLE_NAME,
    LOGICAL_GAME_ENTRY_BUNDLE_NAME,
    LOGICAL_GAMEPLAY_BUNDLE_NAME,
    LOGICAL_HOME_BUNDLE_NAME,
    LOGICAL_REMOTE_LEVEL_DATA_BUNDLE_NAME,
    PHYSICAL_COCOS_CORE_BUNDLE_NAME,
    PHYSICAL_GAME_ENTRY_BUNDLE_NAME,
    PHYSICAL_GAMEPLAY_BUNDLE_NAME,
    PHYSICAL_HOME_BUNDLE_NAME,
    PHYSICAL_REMOTE_LEVEL_DATA_BUNDLE_NAME,
} from './PackageNames';
import {
    BOARD_EFFECT_TEXTURE_NAMES,
    BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS,
    COLLECTION_RELEASE_TEXTURE_NAMES,
    COLLECTION_TEXTURE_NAMES,
    DAILY_SIGNIN_RELEASE_TEXTURE_NAMES,
    DAILY_SIGNIN_TEXTURE_NAMES,
    GAMEPLAY_SLOT_TEXTURE_NAMES,
    GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES,
    HOME_MENU_TEXTURE_NAMES,
    LEADERBOARD_RELEASE_TEXTURE_NAMES,
    LEADERBOARD_TEXTURE_NAMES,
    POPUP_UI_TEXTURE_NAMES,
    RECOVER_VIGOR_RELEASE_TEXTURE_NAMES,
    RECOVER_VIGOR_TEXTURE_NAMES,
    RESOURCE_ACQUIRE_RELEASE_TEXTURE_NAMES,
    RESOURCE_ACQUIRE_TEXTURE_NAMES,
    RESULT_PANEL_TEXTURE_NAMES,
    REWARD_RESULT_RELEASE_TEXTURE_NAMES,
    REWARD_RESULT_TEXTURE_NAMES,
    GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_TEXTURE_SEARCH_DIRS,
    SETTINGS_PANEL_RELEASE_TEXTURE_NAMES,
    SETTINGS_PANEL_TEXTURE_NAMES,
    SKILL_BUTTON_TEXTURE_NAMES,
    THEME_PANEL_RELEASE_TEXTURE_NAMES,
    THEME_PANEL_TEXTURE_NAMES,
} from './UiManifest';
import SySDKMgr from './SySDKMgr';

const { ccclass, property } = _decorator;

type Bundle = AssetManager.Bundle;

const DEFAULT_CELL_SIZE = 62;
const DEFAULT_CELL_GAP = 0;
const PINDD_BEAN_TO_SLOT_RATIO = (121 / 134) * 0.9;
const SLOT_SIZE = 44;
const SLOT_GAP = 7;
const SLOT_HIT_PADDING = 14; // 扩大暂存槽点击命中范围（与高亮环视觉范围一致）
const SELECTED_SLOT_HIT_PADDING = 0;
const SLOT_HIT_PADDING_X_UI = 16;
const SLOT_HIT_PADDING_Y_UI = 24;
const SLOT_UNLOCK_HIT_PADDING_UI = 20;
const SLOT_AREA_HIT_PADDING_UI = 18;
const BOARD_SELECT_HIT_MIN_UI = 26;
const BOARD_PLACE_HIT_MIN_UI = 34;
const BOARD_SLOT_PLACE_HIT_MIN_UI = 52;
const BOARD_SELECT_HIT_CELL_RATIO = 0.5;
const BOARD_PLACE_HIT_CELL_RATIO = 0.7;
const BOARD_SLOT_PLACE_HIT_CELL_RATIO = 1.05;
const SLOTS_PER_ROW = 12;
const DEFAULT_UNLOCKED_SLOT_ROWS = 1;
const SLOT_ROW_BG_WIDTH = 660;
const SLOT_ROW_BG_HEIGHT = 66;
const SLOT_ROW_SPACING = 58;
const SLOT_ROW_EMPTY_WIDTH = 616;
const SLOT_ROW_EMPTY_HEIGHT = 38;
const SLOT_AREA_CENTER_Y = -430;
const SLOT_AREA_SCALE = 0.94;
const DEFAULT_MAX_SLOT_ROWS = 4;
const MAINLINE_MAX_SLOT_ROWS = 5;
const MAINLINE_SLOT_ROW_BG_HEIGHT = 118;
const MAINLINE_SLOT_ROW_SPACING = 54.333333333;
const MAINLINE_SLOT_PANEL_EXTRA_HEIGHT = 14;
const MAINLINE_SLOT_CENTER_SPACING = 50;
const MAINLINE_SLOT_MARKER_WIDTH = 36;
const MAINLINE_SLOT_MARKER_HEIGHT = 38;
const MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY = 220;
const MAINLINE_SLOT_MARKER_LOCKED_OPACITY = 76;
const MAINLINE_SLOT_LOCK_DASH_ALPHA = 255;
const MAINLINE_SLOT_LOCK_ROW_WIDTH = 590;
const MAINLINE_SLOT_LOCK_ROW_HEIGHT = 44;
const MAINLINE_SLOT_LOCK_MASK_WIDTH = 574;
const MAINLINE_SLOT_LOCK_MASK_HEIGHT = 32;
const MAINLINE_SLOT_PANEL_TEXTURE = 'slot_panel_shell_b_ui';
const MAINLINE_SLOT_GROOVE_TEXTURE = 'slot_groove_b_ui';
const MAINLINE_SLOT_LOCK_MASK_TEXTURE = 'slot_row_lock_mask_ui';
const MAINLINE_SLOT_LOCK_DASH_TEXTURE = 'slot_row_lock_dash_ui';
const MAINLINE_SLOT_TEXTURE_NAMES = [
    MAINLINE_SLOT_PANEL_TEXTURE,
    MAINLINE_SLOT_GROOVE_TEXTURE,
    MAINLINE_SLOT_LOCK_MASK_TEXTURE,
    MAINLINE_SLOT_LOCK_DASH_TEXTURE,
];
const MAINLINE_GAMEPLAY_HUD_TEXTURE_NAMES = [
    '倒计时',
    ...SKILL_BUTTON_TEXTURE_NAMES,
];
const MAINLINE_TUTORIAL_TEXTURE_NAMES = [
    'guide_hand',
    'popup_guide_highlight_ring',
    'guide_bubble_frame',
];
const SKILL_BUTTON_Y = -615;
const SKILL_BUTTON_SPACING = 210;
const LOCAL_BOOTSTRAP_LEVEL_ID = 1;
const LOCAL_BOOTSTRAP_LEVEL_IDS = new Set<number>([1]);
const LOCAL_BOOTSTRAP_LEVEL_PREFIX = 'level_';
const LOCAL_BOOTSTRAP_BEAN_DIR = 'Beans';
const LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH = 'Beans/bean-atlas-data';
const LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH = 'Beans/bean-atlas';
const LOCAL_BOOTSTRAP_LEVEL_DIR = 'LevelData';
const LOCAL_BOOTSTRAP_TEXTURE_DIR = 'GameUI';
const LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY = 1.0;
const PINDD_BEAN_VARIANTS: Array<1 | 2 | 4> = [1, 2, 4];
const MAINLINE_SETTLEMENT_PROGRESS_TEXTURE_NAMES = ['进度条', 'progress_fill'];
const LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES = new Set<string>(['设置', ...MAINLINE_SLOT_TEXTURE_NAMES, ...MAINLINE_GAMEPLAY_HUD_TEXTURE_NAMES, ...MAINLINE_TUTORIAL_TEXTURE_NAMES, ...MAINLINE_SETTLEMENT_PROGRESS_TEXTURE_NAMES, ...BOARD_EFFECT_TEXTURE_NAMES]);
const LOCAL_BOOTSTRAP_TEXTURE_NAMES = new Set<string>([...MAINLINE_SLOT_TEXTURE_NAMES, ...MAINLINE_GAMEPLAY_HUD_TEXTURE_NAMES, ...MAINLINE_TUTORIAL_TEXTURE_NAMES, ...MAINLINE_SETTLEMENT_PROGRESS_TEXTURE_NAMES, ...BOARD_EFFECT_TEXTURE_NAMES]);
const MAX_LEADERBOARD_AVATAR_FRAMES = 24;
const LS_LEVEL = 'pdd.level';
const LS_GOLD = 'pdd.gold';
const LS_PROP_EXPAND = 'pdd.prop.expand';
const LS_PROP_WAND = 'pdd.prop.wand';
const LS_PROP_FREEZE = 'pdd.prop.freeze';
const LS_PROP_BRUSH = 'pdd.prop.brush';
const LS_PROP_MAGNET = 'pdd.prop.magnet';
const LS_DAILY_SIGNIN_COUNT = 'pdd.daily_signin.count';
const LS_DAILY_SIGNIN_LAST_DATE_KEY = 'pdd.daily_signin.lastDateKey';
const LS_PINCH_GUIDE = 'pdd.guide.pinch';
const LS_SKILL_WAND_USED = 'pdd.skill.wand';
const LS_SKILL_FREEZE_USED = 'pdd.skill.freeze';
const LS_SKILL_BROOM_USED = 'pdd.skill.broom';
const LS_SKILL_MAGNET_USED = 'pdd.skill.magnet';
const LS_EXPAND_USED = 'pdd.skill.expand';
const LS_USER_STATE_UPDATED_AT = 'pdd.user.state.updatedAt';
const LS_THEME_COMPLETED = 'pdd.theme_completed';
const CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS = 800;
const NEW_USER_STARTER_PROP_COUNT = 3;
const FREEZE_PROP_SECONDS = 90;
const MAX_FLY_BEAN_POOL_SIZE = 24;
const MAX_FRAME_FX_POOL_SIZE = 12;
const MAX_BRIGHT_FLASH_POOL_SIZE = 12;
const MAX_CONCURRENT_FRAME_EFFECTS = 12;
const GAME_ASSETS_EFFECTS_IDLE_WARMUP = false;

const SKILL_UNLOCK_WAND = 3;
const SKILL_UNLOCK_FREEZE = 3;
const SKILL_UNLOCK_BROOM = 3;
const SKILL_UNLOCK_MAGNET = 3;
const WIN_GLOW_MIN_WAVES = 4;
const WIN_GLOW_MAX_WAVES = 8;
const WIN_GLOW_WAVE_STEP = 0.04;
const WIN_GLOW_POST_DELAY = 0.08;
const WIN_GLOW_FAST_INTERVAL_LARGE = 0.018;
const WIN_GLOW_FAST_INTERVAL_MEDIUM = 0.02;
const WIN_GLOW_FAST_INTERVAL_SMALL = 0.024;
const GUIDE_HAND_BOX_SIZE = 94;
const GUIDE_HAND_SPRITE_SIZE = 88;
const GUIDE_HAND_FINGERTIP_OFFSET_X = -31;
const GUIDE_HAND_FINGERTIP_OFFSET_Y = 24;
const TUTORIAL_ZOOM_SCALE_DELTA = 0.03;

type SkillSourceGroup = {
    colorId: number;
    boardSources: { row: number; col: number }[];
    slotSources: number[];
};

type ForcedSkillBoardMove = {
    colorId: number;
    srcWorld: Vec3;
    target: { row: number; col: number };
    lock: boolean;
};

type ForcedSkillSlotMove = {
    colorId: number;
    srcWorld: Vec3;
    slotIdx: number;
};

type ForcedSkillBatch = {
    boardMoves: ForcedSkillBoardMove[];
    slotMoves: ForcedSkillSlotMove[];
    lockTargets: { row: number; col: number }[];
};

type ForcedSkillStep = {
    colorId: number;
    sourceBoard?: { row: number; col: number };
    sourceSlotIdx?: number;
    target: { row: number; col: number };
    targetLock?: boolean;
    pairedFlight?: boolean;
    displacedBoard?: { colorId: number; target: { row: number; col: number }; lock: boolean };
    displacedSlot?: { colorId: number; slotIdx: number };
    displacedSlotInsertMode?: 'fixed' | 'grouped';
    lockTargets: { row: number; col: number }[];
    hiddenBoardCells: { row: number; col: number }[];
    hiddenSlotIdxs: number[];
};

type ForcedSkillPlan = {
    immediateLockTargets: { row: number; col: number }[];
    steps: ForcedSkillStep[];
    maxStartDelay?: number;
};

type TutorialMode = 'none' | 'level_1' | 'level_2' | 'zoom' | 'slot_intro';
type InventoryPropKind = 'expand' | 'wand' | 'freeze' | 'brush' | 'magnet';
type DailySignInReward = typeof ECONOMY_NUMERIC_TABLE.dailySignIn.rewards[number];

type SafeInsets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

type RankListEntry = Pick<LeaderboardEntry, 'rank' | 'displayName' | 'avatarUrl' | 'progressLevel'>;
type UserStateRestoreStatus =
    | 'local_progress_gt_1'
    | 'cloud_progress_gt_1'
    | 'cloud_confirmed_empty'
    | 'cloud_restore_pending'
    | 'cloud_timeout_unresolved'
    | 'cloud_unavailable_unresolved'
    | 'cloud_failed_unresolved';

const leaderboardAvatarFrameCache = new Map<string, SpriteFrame>();
const leaderboardAvatarPendingLoads = new Map<string, Array<(frame: SpriteFrame | null) => void>>();
const leaderboardAvatarLoadQueue: string[] = [];
const leaderboardAvatarLoadLaunchers = new Map<string, () => void>();
let leaderboardAvatarLoadInFlight = 0;
const LEADERBOARD_ROW_PITCH = 84;
const LEADERBOARD_SCROLL_DECAY = 0.92;
const LEADERBOARD_SCROLL_MIN_SPEED = 48;
const LEADERBOARD_AVATAR_MAX_CONCURRENT = 2;
const FRIEND_AVATAR_CACHE_TTL_MS = 60 * 1000;
const FRIEND_RANK_SUBCONTEXT_FPS = 30;
const FRIEND_RANK_SCROLL_POST_INTERVAL_MS = 16;

function drainLeaderboardAvatarLoadQueue() {
    while (leaderboardAvatarLoadInFlight < LEADERBOARD_AVATAR_MAX_CONCURRENT && leaderboardAvatarLoadQueue.length > 0) {
        const url = leaderboardAvatarLoadQueue.shift();
        if (!url) continue;
        const launcher = leaderboardAvatarLoadLaunchers.get(url);
        if (!launcher) continue;
        leaderboardAvatarLoadLaunchers.delete(url);
        leaderboardAvatarLoadInFlight += 1;
        launcher();
    }
}

function enqueueLeaderboardAvatarLoad(url: string, launcher: () => void) {
    if (leaderboardAvatarLoadLaunchers.has(url)) {
        return;
    }
    leaderboardAvatarLoadLaunchers.set(url, launcher);
    leaderboardAvatarLoadQueue.push(url);
    drainLeaderboardAvatarLoadQueue();
}

function finishLeaderboardAvatarLoad() {
    leaderboardAvatarLoadInFlight = Math.max(0, leaderboardAvatarLoadInFlight - 1);
    drainLeaderboardAvatarLoadQueue();
}

/** 创建纯色 SpriteFrame（pdd 方案：Sprite 替代 Graphics 绘制背景） */
function createSolidColorCanvas(width: number, height: number): HTMLCanvasElement | any {
    try {
        const doc = typeof document !== 'undefined' ? (document as any) : null;
        if (doc?.createElement) {
            const canvas = doc.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
    } catch (_) {
        // Fall through to minigame canvas APIs.
    }

    const globalAny = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
    const windowAny = typeof window !== 'undefined' ? (window as any) : null;
    const wx = globalAny?.wx || globalAny?.__rawWx || windowAny?.wx || null;
    const globalAdapter = windowAny?.__globalAdapter || globalAny?.__globalAdapter || null;

    try {
        const canvas = typeof wx?.createOffscreenCanvas === 'function'
            ? wx.createOffscreenCanvas({ type: '2d', width, height })
            : null;
        if (canvas) {
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
    } catch (_) {
        // Fall through to adapter canvas.
    }

    if (typeof globalAdapter?.createCanvas === 'function') {
        const canvas = globalAdapter.createCanvas();
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    throw new Error('No canvas implementation available for solid color sprite generation');
}

function createSingleColorSpriteFrame(color: Color, width: number, height: number): SpriteFrame {
    const safeWidth = Math.max(1, Math.ceil(width));
    const safeHeight = Math.max(1, Math.ceil(height));
    const canvas = createSolidColorCanvas(safeWidth, safeHeight);
    const ctx = canvas.getContext?.('2d');
    if (!ctx) {
        throw new Error('Canvas 2D context unavailable for solid color sprite generation');
    }
    const alpha = Math.max(0, Math.min(1, color.a / 255));
    ctx.clearRect?.(0, 0, safeWidth, safeHeight);
    ctx.fillStyle = `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${alpha})`;
    ctx.fillRect(0, 0, safeWidth, safeHeight);

    const image = new ImageAsset(canvas);
    const texture = new Texture2D();
    texture.image = image;
    const spFrame = new SpriteFrame();
    spFrame.texture = texture;
    spFrame.rect = new Rect(0, 0, safeWidth, safeHeight);
    (spFrame as any).packingMode = 'none';
    return spFrame;
}

type GestureMode = 'idle' | 'tapCandidate' | 'panning' | 'pinching';
type BoardSafeViewportRect = { left: number; right: number; bottom: number; top: number };
type BoardGridCell = { row: number; col: number };

type BoardViewportControllerOptions = {
    minScale: number;
    maxScale: number;
    fallbackWidth: number;
    fallbackHeight: number;
    getBoardGroup: () => Node | null;
    getBoardNode: () => Node | null;
    getSafeViewportRect: () => BoardSafeViewportRect;
};

class BoardViewportController {
    private viewScale = 1;
    private homeScale = 1;
    private homeOffset = new Vec2(0, 0);

    constructor(private readonly options: BoardViewportControllerOptions) {}

    get scale(): number {
        return this.viewScale;
    }

    get minScale(): number {
        return this.options.minScale;
    }

    get maxScale(): number {
        return this.options.maxScale;
    }

    setScaleBounds(minScale: number, maxScale: number): void {
        const safeMin = Number.isFinite(minScale) && minScale > 0 ? minScale : this.options.minScale;
        const safeMax = Number.isFinite(maxScale) && maxScale >= safeMin ? maxScale : this.options.maxScale;
        this.options.minScale = safeMin;
        this.options.maxScale = Math.max(safeMin, safeMax);
        this.viewScale = this.clampScale(this.viewScale);
        this.homeScale = this.clampScale(this.homeScale);
        this.homeOffset = this.clampOffset(this.homeOffset.x, this.homeOffset.y, this.homeScale);
    }

    setScaleSnapshot(scale: number): void {
        this.viewScale = this.clampScale(scale);
    }

    getScaleNormalized(): number {
        const range = this.options.maxScale - this.options.minScale;
        if (!Number.isFinite(range) || range <= 0) return 0;
        return Math.max(0, Math.min(1, (this.viewScale - this.options.minScale) / range));
    }

    getScaleForNormalized(value: number): number {
        const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
        return this.options.minScale + (this.options.maxScale - this.options.minScale) * normalized;
    }

    setHomeTransform(scale: number, offset: Vec2): void {
        this.homeScale = this.clampScale(scale);
        this.homeOffset = this.clampOffset(offset.x, offset.y, this.homeScale);
    }

    setHomeFromCurrent(): void {
        const group = this.options.getBoardGroup();
        if (!group || !group.isValid) return;
        const currentScale = Number.isFinite(this.viewScale) && this.viewScale > 0
            ? this.viewScale
            : Math.abs(group.scale.x || 1) || 1;
        this.setHomeTransform(currentScale, new Vec2(group.position.x, group.position.y));
    }

    getHomeTransform(): { scale: number; offset: Vec2 } {
        return {
            scale: this.homeScale,
            offset: new Vec2(this.homeOffset.x, this.homeOffset.y),
        };
    }

    isAtHome(scaleTolerance: number = 0.01, offsetTolerance: number = 2): boolean {
        const group = this.options.getBoardGroup();
        if (!group || !group.isValid) return true;
        return Math.abs(this.viewScale - this.homeScale) <= scaleTolerance
            && Math.hypot(group.position.x - this.homeOffset.x, group.position.y - this.homeOffset.y) <= offsetTolerance;
    }

    resetToHome(): void {
        this.setViewTransformClamped(this.homeScale, this.homeOffset);
    }

    uiToViewportParent(uiPos: Vec2): Vec2 {
        const group = this.options.getBoardGroup();
        const parent = group && group.isValid ? (group.parent || null) : null;
        const parentUT = parent?.getComponent(UITransform);
        if (!parentUT) {
            return new Vec2(
                uiPos.x - this.options.fallbackWidth / 2,
                uiPos.y - this.options.fallbackHeight / 2,
            );
        }
        const local = parentUT.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
        return new Vec2(local.x, local.y);
    }

    worldToBoardLocal(worldPos: Vec3): Vec2 | null {
        const boardNode = this.options.getBoardNode();
        if (!boardNode || !boardNode.isValid) return null;
        const boardUT = boardNode.getComponent(UITransform);
        if (!boardUT) return null;
        const local = boardUT.convertToNodeSpaceAR(worldPos);
        return new Vec2(local.x, local.y);
    }

    uiToBoardLocal(uiPos: Vec2): Vec2 | null {
        return this.worldToBoardLocal(new Vec3(uiPos.x, uiPos.y, 0));
    }

    boardLocalToGrid(
        localPos: Vec2,
        boardWidth: number,
        boardHeight: number,
        cellSize: number,
        cellGap: number,
        margin: number = 0,
    ): BoardGridCell | null {
        const boardNode = this.options.getBoardNode();
        if (!boardNode || !boardNode.isValid) return null;
        const boardUT = boardNode.getComponent(UITransform);
        if (!boardUT || boardWidth <= 0 || boardHeight <= 0) return null;
        const halfW = boardUT.contentSize.width / 2;
        const halfH = boardUT.contentSize.height / 2;
        if (Math.abs(localPos.x) > halfW + margin || Math.abs(localPos.y) > halfH + margin) return null;

        const step = cellSize + cellGap;
        let col = Math.floor((localPos.x + boardWidth / 2 * step) / step);
        let row = Math.floor((boardHeight / 2 * step - localPos.y) / step);
        col = Math.max(0, Math.min(boardWidth - 1, col));
        row = Math.max(0, Math.min(boardHeight - 1, row));
        return { row, col };
    }

    setViewTransformClamped(scale: number, offset: Vec2, clampScale: boolean = true): void {
        const group = this.options.getBoardGroup();
        if (!group || !group.isValid) return;
        const finiteScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
        const nextScale = clampScale
            ? this.clampScale(finiteScale)
            : finiteScale;
        const clamped = this.clampOffset(offset.x, offset.y, nextScale);
        this.viewScale = nextScale;
        group.setScale(nextScale, nextScale, 1);
        group.setPosition(clamped.x, clamped.y, 0);
    }

    setScaleNormalized(value: number, anchorParentLocal?: Vec2): void {
        const nextScale = this.getScaleForNormalized(value);
        const group = this.options.getBoardGroup();
        if (!group || !group.isValid) return;
        const anchor = anchorParentLocal || this.getSafeViewportCenter();
        const boardLocal = this.parentPointToBoardLocal(anchor);
        const board = this.options.getBoardNode();
        if (!boardLocal || !board || !board.isValid) {
            this.setViewTransformClamped(nextScale, new Vec2(group.position.x, group.position.y));
            return;
        }
        const boardPos = board.position;
        this.setViewTransformClamped(nextScale, new Vec2(
            anchor.x - (boardPos.x + boardLocal.x) * nextScale,
            anchor.y - (boardPos.y + boardLocal.y) * nextScale,
        ));
    }

    zoomAround(uiPos: Vec2, boardLocal: Vec2, nextScale: number): void {
        const board = this.options.getBoardNode();
        if (!board || !board.isValid) return;
        const parentLocal = this.uiToViewportParent(uiPos);
        const boardPos = board.position;
        this.setViewTransformClamped(nextScale, new Vec2(
            parentLocal.x - (boardPos.x + boardLocal.x) * nextScale,
            parentLocal.y - (boardPos.y + boardLocal.y) * nextScale,
        ));
    }

    private clampScale(scale: number): number {
        const finiteScale = Number.isFinite(scale) && scale > 0 ? scale : this.options.minScale;
        return Math.max(this.options.minScale, Math.min(this.options.maxScale, finiteScale));
    }

    private getSafeViewportCenter(): Vec2 {
        const rect = this.options.getSafeViewportRect();
        return new Vec2((rect.left + rect.right) / 2, (rect.bottom + rect.top) / 2);
    }

    private parentPointToBoardLocal(parentLocal: Vec2): Vec2 | null {
        const group = this.options.getBoardGroup();
        const board = this.options.getBoardNode();
        if (!group || !group.isValid || !board || !board.isValid) return null;
        const scale = Math.max(0.001, this.viewScale || Math.abs(group.scale.x || 1) || 1);
        const boardPos = board.position;
        return new Vec2(
            (parentLocal.x - group.position.x) / scale - boardPos.x,
            (parentLocal.y - group.position.y) / scale - boardPos.y,
        );
    }

    private clampOffset(x: number, y: number, scale: number): Vec2 {
        const boardNode = this.options.getBoardNode();
        if (!boardNode || !boardNode.isValid) return new Vec2(x, y);
        const boardUT = boardNode.getComponent(UITransform);
        if (!boardUT) return new Vec2(x, y);

        const rect = this.options.getSafeViewportRect();
        const viewportW = rect.right - rect.left;
        const viewportH = rect.top - rect.bottom;
        const halfW = boardUT.contentSize.width * scale / 2;
        const halfH = boardUT.contentSize.height * scale / 2;
        const boardW = halfW * 2;
        const boardH = halfH * 2;
        const minVisibleW = Math.min(boardW, Math.max(Math.min(180, viewportW), viewportW * 0.62));
        const minVisibleH = Math.min(boardH, Math.max(Math.min(180, viewportH), viewportH * 0.62));

        const minX = rect.left + minVisibleW - halfW;
        const maxX = rect.right - minVisibleW + halfW;
        const minY = rect.bottom + minVisibleH - halfH;
        const maxY = rect.top - minVisibleH + halfH;
        return new Vec2(
            Math.max(minX, Math.min(maxX, x)),
            Math.max(minY, Math.min(maxY, y)),
        );
    }
}

export {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, ProgressBar, Slider,
    Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask, sp,
    NodePool, Game, game, Widget, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    Prefab, instantiate,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, BOARD_EFFECT_TEXTURE_NAMES, BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, DAILY_SIGNIN_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, POPUP_UI_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, RESOURCE_ACQUIRE_RELEASE_TEXTURE_NAMES, RESOURCE_ACQUIRE_TEXTURE_NAMES, RESULT_PANEL_TEXTURE_NAMES, REWARD_RESULT_RELEASE_TEXTURE_NAMES, REWARD_RESULT_TEXTURE_NAMES, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_TEXTURE_SEARCH_DIRS, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, THEME_PANEL_RELEASE_TEXTURE_NAMES, THEME_PANEL_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, SLOT_HIT_PADDING_X_UI, SLOT_HIT_PADDING_Y_UI,
    SLOT_UNLOCK_HIT_PADDING_UI, SLOT_AREA_HIT_PADDING_UI, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY, MAINLINE_SLOT_LOCK_DASH_ALPHA,
    MAINLINE_SLOT_LOCK_ROW_WIDTH, MAINLINE_SLOT_LOCK_ROW_HEIGHT, MAINLINE_SLOT_LOCK_MASK_WIDTH, MAINLINE_SLOT_LOCK_MASK_HEIGHT, MAINLINE_SLOT_PANEL_TEXTURE, MAINLINE_SLOT_GROOVE_TEXTURE,
    MAINLINE_SLOT_LOCK_MASK_TEXTURE, MAINLINE_SLOT_LOCK_DASH_TEXTURE, MAINLINE_SLOT_TEXTURE_NAMES, SKILL_BUTTON_Y, SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOGICAL_COCOS_CORE_BUNDLE_NAME, LOGICAL_GAME_ENTRY_BUNDLE_NAME, LOGICAL_HOME_BUNDLE_NAME, LOGICAL_GAMEPLAY_BUNDLE_NAME, LOGICAL_REMOTE_LEVEL_DATA_BUNDLE_NAME, PHYSICAL_COCOS_CORE_BUNDLE_NAME, PHYSICAL_GAME_ENTRY_BUNDLE_NAME, PHYSICAL_HOME_BUNDLE_NAME, PHYSICAL_GAMEPLAY_BUNDLE_NAME, PHYSICAL_REMOTE_LEVEL_DATA_BUNDLE_NAME, LOCAL_BOOTSTRAP_BUNDLE_NAME, HOME_ASSETS_BUNDLE_NAME, GAME_ASSETS_BUNDLE_NAME, LEVEL_DATA_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_FREEZE, LS_PROP_BRUSH, LS_PROP_MAGNET, LS_DAILY_SIGNIN_COUNT, LS_DAILY_SIGNIN_LAST_DATE_KEY, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_FREEZE_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, LS_THEME_COMPLETED, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT, FREEZE_PROP_SECONDS,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_FREEZE, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, TUTORIAL_ZOOM_SCALE_DELTA, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, createSingleColorSpriteFrame, BoardViewportController
};

export type {
    Bundle, EventMouse, EventTouch, LabelOutline, LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, DailySignInReward, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
};
