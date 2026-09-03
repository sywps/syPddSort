import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button, Prefab, instantiate,
    Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
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
    LS_PROP_FREEZE, LS_PROP_BRUSH, LS_PROP_MAGNET, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
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
import { runtimeLog, runtimeWarn } from '../RuntimeLog';

const RECOVER_VIGOR_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/RecoverVigorPanel';
const DEBUG_RECOVER_VIGOR_LAYOUT = false;
const RECOVER_VIGOR_AD_REWARD = 4;
const RECOVER_VIGOR_SHARE_REWARD = 2;
const RECOVER_VIGOR_SHARE_DAILY_LIMIT = 3;
const RECOVER_VIGOR_SHARE_STATE_KEY = 'pdd.recoverVigor.shareState.v1';

type RecoverVigorShareState = {
    dateKey: string;
    count: number;
};

export type RecoverVigorSource = 'home_hud' | 'home_start' | 'theme_start' | 'restart' | 'next_level' | 'collection_replay';
export type RecoverVigorResultStatus = 'granted' | 'failed' | 'cancelled';
export type RecoverVigorResult = {
    source: RecoverVigorSource;
    status: RecoverVigorResultStatus;
    granted: number;
    vigorAfter: number;
    transactionId: number;
};
export type RecoverVigorOptions = {
    source: RecoverVigorSource;
    levelId?: number;
    gameplayEntryMode?: 'main' | 'theme' | 'external';
    onResult?: (result: RecoverVigorResult) => void;
};

function logRecoverVigorNodeSize(name: string, node: Node | null): void {
    if (!node || !node.isValid) {
        runtimeWarn(`[UI尺寸] ${name}: 节点不存在`);
        return;
    }

    const trans = node.getComponent(UITransform);
    if (!trans) {
        runtimeWarn(`[UI尺寸] ${name}: 没有 UITransform`);
        return;
    }

    const size = trans.contentSize;
    const pos = node.position;
    runtimeLog(
        `[UI尺寸] ${name}: width=${size.width}, height=${size.height}, ` +
        `pos=(${pos.x}, ${pos.y}), active=${node.active}`,
    );
}

export function installPlayerMetaStateModule(target: any): void {
    Object.assign(target, {
        getVigor(): number {
            const raw = sys.localStorage.getItem((this.constructor as any).LS_VIGOR);
            let count = raw ? parseInt(raw) : (this.constructor as any).VIGOR_CEILING;
            return isNaN(count) ? (this.constructor as any).VIGOR_CEILING : count;
        },

        setVigor(count: number): void {
            sys.localStorage.setItem((this.constructor as any).LS_VIGOR, count.toString());
            this.queueCloudGameStateSync();
        },

        getVigorTime(): number { const raw = sys.localStorage.getItem((this.constructor as any).LS_VIGOR_TIME); return raw ? parseInt(raw) : 0; },

        setVigorTime(ts: number): void {
            sys.localStorage.setItem((this.constructor as any).LS_VIGOR_TIME, ts.toString());
            this.queueCloudGameStateSync();
        },

        getGold(): number {
            const raw = sys.localStorage.getItem(LS_GOLD);
            const value = raw ? parseInt(raw, 10) : 0;
            return Number.isFinite(value) && value > 0 ? value : 0;
        },

        setGold(value: number, options: { syncCloud?: boolean } = {}): void {
            sys.localStorage.setItem(LS_GOLD, String(Math.max(0, Math.floor(Number(value) || 0))));
            this.refreshGoldUI();
            if (options.syncCloud !== false) {
                this.queueCloudGameStateSync();
            }
        },

        addGold(delta: number): number {
            const next = Math.max(0, this.getGold() + Math.floor(Number(delta) || 0));
            this.setGold(next);
            return next;
        },

        spendGold(cost: number): boolean {
            const normalizedCost = Math.max(0, Math.floor(Number(cost) || 0));
            if (normalizedCost <= 0) return true;
            const current = this.getGold();
            if (current < normalizedCost) {
                return false;
            }
            this.setGold(current - normalizedCost);
            return true;
        },

        getPropStorageKey(kind: InventoryPropKind): string {
            switch (kind) {
                case 'expand': return LS_PROP_EXPAND;
                case 'wand': return LS_PROP_WAND;
                case 'freeze': return LS_PROP_FREEZE;
                case 'brush': return LS_PROP_BRUSH;
                case 'magnet': return LS_PROP_MAGNET;
            }
        },

        getPropCount(kind: InventoryPropKind): number {
            const raw = sys.localStorage.getItem(this.getPropStorageKey(kind));
            const value = raw ? parseInt(raw, 10) : 0;
            return Number.isFinite(value) && value > 0 ? value : 0;
        },

        setPropCount(kind: InventoryPropKind, value: number): void {
            sys.localStorage.setItem(this.getPropStorageKey(kind), String(Math.max(0, Math.floor(Number(value) || 0))));
            this.queueCloudGameStateSync();
        },

        addPropCount(kind: InventoryPropKind, delta: number): number {
            const next = Math.max(0, this.getPropCount(kind) + Math.floor(Number(delta) || 0));
            this.setPropCount(kind, next);
            return next;
        },

        consumePropCount(kind: InventoryPropKind): boolean {
            const current = this.getPropCount(kind);
            if (current <= 0) {
                return false;
            }
            this.setPropCount(kind, current - 1);
            return true;
        },

        grantStarterPropsForNewUser(): void {
            const starterKinds: InventoryPropKind[] = ['freeze', 'brush', 'magnet'];
            let changed = false;
            const freezeStorageKey = this.getPropStorageKey('freeze');
            if (sys.localStorage.getItem(freezeStorageKey) === null) {
                const legacyWandRaw = sys.localStorage.getItem(this.getPropStorageKey('wand'));
                if (legacyWandRaw !== null) {
                    const legacyWandCount = Math.max(0, Math.floor(Number(legacyWandRaw) || 0));
                    sys.localStorage.setItem(freezeStorageKey, String(legacyWandCount));
                    changed = true;
                }
            }
            for (const kind of starterKinds) {
                const storageKey = this.getPropStorageKey(kind);
                if (sys.localStorage.getItem(storageKey) !== null) {
                    continue;
                }
                sys.localStorage.setItem(storageKey, String(NEW_USER_STARTER_PROP_COUNT));
                changed = true;
            }
            if (changed) {
                this.queueCloudGameStateSync();
            }
        },

        refreshGoldUI(): void {
            const text = `${this.getGold()}`;
            if (this._goldCountLbl) {
                this._goldCountLbl.string = text;
            }
            if (this._settlementGoldCountLbl?.isValid) {
                this._settlementGoldCountLbl.string = text;
            }
            if (this._shopGoldLbl) {
                this._shopGoldLbl.string = text;
            }
            this.refreshVisibleGoldCountLabels(text);
        },

        refreshVisibleGoldCountLabels(text: string): void {
            const visit = (node: Node | null): void => {
                if (!node || node.isValid === false || node.activeInHierarchy === false) return;
                if (node.name === 'GoldCount') {
                    const label = node.getComponent(Label);
                    if (label) label.string = text;
                }
                for (const child of node.children) {
                    visit(child);
                }
            };
            visit(this.node?.scene || null);
        },

        /** 消耗体力 */
        costVigor(): boolean {
            const vigor = this.getVigor();
            if (vigor <= 0) return false;
            this.setVigor(vigor - 1);
            if (vigor - 1 < (this.constructor as any).VIGOR_CEILING && this.getVigorTime() <= 0)
                this.setVigorTime(Date.now() + (this.constructor as any).VIGOR_RESTORE_SECONDS * 1000);
            this.refreshVigorUI();
            return true;
        },

        isTutorialVigorFreeLevel(levelId: unknown, entryMode: string = 'main'): boolean {
            if (entryMode !== 'main') return false;
            const normalizedLevelId = Math.max(1, Math.floor(Number(levelId) || 1));
            return normalizedLevelId <= 2;
        },

        costVigorForLevel(levelId: unknown, entryMode: string = 'main'): boolean {
            if (this.isTutorialVigorFreeLevel(levelId, entryMode)) return true;
            return this.costVigor();
        },

        /** 更新体力数据（含离线恢复） */
        updateVigor(): void {
            const ceiling = (this.constructor as any).VIGOR_CEILING, restoreMs = (this.constructor as any).VIGOR_RESTORE_SECONDS * 1000;
            let vigor = this.getVigor(), vigorTime = this.getVigorTime(), now = Date.now();
            if (vigor >= ceiling) { if (vigor !== ceiling) this.setVigor(ceiling); if (vigorTime !== 0) this.setVigorTime(0); return; }
            if (vigorTime <= 0) { vigorTime = now + restoreMs; this.setVigorTime(vigorTime); }
            if (now >= vigorTime) {
                const n = Math.floor((now - vigorTime) / restoreMs) + 1;
                vigor = Math.min(ceiling, vigor + n);
                this.setVigor(vigor);
                if (vigor >= ceiling) this.setVigorTime(0);
                else this.setVigorTime(vigorTime + n * restoreMs);
            }
        },

        getVigorCountdownSec(): number {
            const ceiling = (this.constructor as any).VIGOR_CEILING, restoreMs = (this.constructor as any).VIGOR_RESTORE_SECONDS * 1000;
            const vigor = this.getVigor();
            if (vigor >= ceiling) return 0;
            const vigorTime = this.getVigorTime(), need = Math.max(0, ceiling - vigor), now = Date.now();
            const firstMs = vigorTime > 0 ? Math.max(0, vigorTime - now) : restoreMs;
            return Math.max(0, Math.ceil((firstMs + (need - 1) * restoreMs) / 1000));
        },

        /** 刷新体力 UI */
        refreshVigorUI(): void {
            this.updateVigor();
            const vigor = this.getVigor(), sec = this.getVigorCountdownSec();
            if (this._vigorCountLbl) this._vigorCountLbl.string = `${vigor}/${(this.constructor as any).VIGOR_CEILING}`;
            if (this._vigorTimeLbl) {
                if (vigor >= (this.constructor as any).VIGOR_CEILING) this._vigorTimeLbl.string = '05:00';
                else if (sec <= 0) this._vigorTimeLbl.string = '00:00';
                else { const mm = Math.floor(sec / 60), ss = sec % 60; this._vigorTimeLbl.string = `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`; }
            }
            this.refreshRecoverVigorModalUI?.();
        },

        /** 体力 Tick（每帧 0.2s 刷新） */
        vigorTick(dt: number): void { this._vigorTickDt += dt; if (this._vigorTickDt < 0.2) return; this._vigorTickDt = 0; this.refreshVigorUI(); },

        getRecoverVigorShareDateKey(nowMs: number = Date.now()): string {
            const date = new Date(nowMs);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${year}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
        },

        readRecoverVigorShareState(nowMs: number = Date.now()): RecoverVigorShareState {
            const dateKey = this.getRecoverVigorShareDateKey(nowMs);
            const fallback: RecoverVigorShareState = { dateKey, count: 0 };
            try {
                const raw = sys.localStorage?.getItem(RECOVER_VIGOR_SHARE_STATE_KEY);
                if (!raw) return fallback;
                const parsed = JSON.parse(raw);
                if (!parsed || parsed.dateKey !== dateKey) return fallback;
                return {
                    dateKey,
                    count: Math.max(0, Math.floor(Number(parsed.count) || 0)),
                };
            } catch (error) {
                console.warn('[recover-vigor-share] read state failed:', error);
                return fallback;
            }
        },

        writeRecoverVigorShareState(state: RecoverVigorShareState): void {
            try {
                sys.localStorage?.setItem(RECOVER_VIGOR_SHARE_STATE_KEY, JSON.stringify(state));
            } catch (error) {
                console.warn('[recover-vigor-share] write state failed:', error);
            }
        },

        getRecoverVigorShareRemaining(): number {
            const state = this.readRecoverVigorShareState();
            return Math.max(0, RECOVER_VIGOR_SHARE_DAILY_LIMIT - state.count);
        },

        canRecoverVigorByShare(): boolean {
            return this.getRecoverVigorShareRemaining() > 0;
        },

        recordRecoverVigorShareGrant(): void {
            const state = this.readRecoverVigorShareState();
            this.writeRecoverVigorShareState({
                dateKey: state.dateKey,
                count: Math.min(RECOVER_VIGOR_SHARE_DAILY_LIMIT, state.count + 1),
            });
        },

        grantVigorByAmount(amount: number): number {
            const ceiling = (this.constructor as any).VIGOR_CEILING;
            const current = this.getVigor();
            const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
            if (safeAmount <= 0 || current >= ceiling) return 0;
            const next = Math.min(ceiling, current + safeAmount);
            const granted = Math.max(0, next - current);
            this.setVigor(next);
            if (next >= ceiling) {
                this.setVigorTime(0);
            } else if (this.getVigorTime() <= 0) {
                this.setVigorTime(Date.now() + (this.constructor as any).VIGOR_RESTORE_SECONDS * 1000);
            }
            this.refreshVigorUI();
            return granted;
        },

        ensureRecoverVigorUiNode(parent: Node, name: string, _width: number, _height: number, _x: number, _y: number): Node {
            const node = parent.getChildByName(name);
            if (!node) {
                throw new Error(`[recover-vigor-prefab] missing node: ${parent.name}/${name}`);
            }
            if (!node.getComponent(UITransform)) {
                throw new Error(`[recover-vigor-prefab] missing UITransform: ${parent.name}/${name}`);
            }
            node.active = true;
            return node;
        },

        syncRecoverVigorRoundedBg(node: Node, _width: number, _height: number, _radius: number, _fill: Color, _stroke: Color, _lineWidth: number = 4): void {
            if (!node.getComponent(UITransform)) {
                throw new Error(`[recover-vigor-prefab] missing UITransform: ${node.name}`);
            }
            if (!node.getComponent(Sprite)) {
                throw new Error(`[recover-vigor-prefab] missing Sprite: ${node.name}`);
            }
        },

        syncRecoverVigorSprite(node: Node, textureName: string, _width: number, _height: number): void {
            const sprite = node.getComponent(Sprite);
            if (!sprite) {
                throw new Error(`[recover-vigor-prefab] missing Sprite: ${node.name}`);
            }
            if (!node.getComponent(UITransform)) {
                throw new Error(`[recover-vigor-prefab] missing UITransform: ${node.name}`);
            }
            const applyFrame = (targetSprite: Sprite | null, frame: SpriteFrame | null, reason: string) => {
                if (!targetSprite || !frame) return;
                if (typeof this.scheduleSpriteFrameApply === 'function') {
                    this.scheduleSpriteFrameApply(targetSprite, frame, reason);
                    return;
                }
                targetSprite.spriteFrame = frame;
            };
            const cached = this.getSF?.(textureName) || null;
            if (cached) {
                applyFrame(sprite, cached, `recover-vigor:${textureName}:cache`);
                return;
            }
            if (typeof this._loadSpriteFrameByName !== 'function') return;
            this._loadSpriteFrameByName(textureName, (sf: SpriteFrame | null) => {
                if (!node?.isValid || !sf) return;
                const currentSprite = node.getComponent(Sprite);
                applyFrame(currentSprite, sf, `recover-vigor:${textureName}:load`);
            });
        },

        syncRecoverVigorLabel(node: Node, text: string, _fontSize: number, color: Color, _bold: boolean = false, _outline?: Color): Label {
            const label = node.getComponent(Label);
            if (!label) {
                throw new Error(`[recover-vigor-prefab] missing Label: ${node.name}`);
            }
            label.string = text;
            label.color = color;
            return label;
        },

        syncRecoverVigorButton(button: Node, labelText: string, fill: Color, stroke: Color, interactable: boolean): void {
            this.syncRecoverVigorRoundedBg(button, 168, 64, 18, fill, stroke, 4);
            const sprite = button.getComponent(Sprite);
            if (sprite) {
                sprite.color = interactable ? new Color(255, 255, 255, 255) : new Color(170, 170, 170, 255);
            }
            const buttonComp = button.getComponent(Button) ?? button.addComponent(Button);
            buttonComp.interactable = interactable;
            const opacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity);
            opacity.opacity = interactable ? 255 : 140;

            this.ensureRecoverVigorUiNode(button, 'ActionIcon', 34, 34, -54, 0);
            const labelNode = this.ensureRecoverVigorUiNode(button, 'ActionLabel', 110, 38, 25, 1);
            this.syncRecoverVigorLabel(labelNode, labelText, 30, new Color(255, 255, 255, 255), true, new Color(46, 114, 120, 255));
        },

        syncRecoverVigorRewardCard(
            box: Node,
            cardName: string,
            x: number,
            amount: number,
            buttonText: string,
            buttonFill: Color,
            buttonStroke: Color,
            interactable: boolean,
            limitText: string = '',
        ): { card: Node; button: Node; limitLabel: Label | null } {
            const card = this.ensureRecoverVigorUiNode(box, cardName, 218, 288, x, 0);
            this.syncRecoverVigorRoundedBg(card, 218, 288, 36, new Color(255, 255, 255, 245), new Color(96, 164, 216, 255), 4);

            const icon = this.ensureRecoverVigorUiNode(card, 'VigorIcon', 94, 94, 0, 64);
            this.syncRecoverVigorSprite(icon, 'popup_vigor_icon', 94, 94);

            const amountLabel = this.ensureRecoverVigorUiNode(card, 'AmountLabel', 120, 46, 0, -10);
            this.syncRecoverVigorLabel(amountLabel, `${amount}`, 36, new Color(61, 73, 116, 255), true);

            const button = this.ensureRecoverVigorUiNode(card, 'ActionButton', 168, 64, 0, -94);
            this.syncRecoverVigorButton(button, buttonText, buttonFill, buttonStroke, interactable);

            const limitNode = this.ensureRecoverVigorUiNode(card, 'LimitLabel', 190, 28, 0, -142);
            const limitLabel = this.syncRecoverVigorLabel(
                limitNode,
                limitText,
                22,
                interactable ? new Color(71, 93, 132, 255) : new Color(168, 72, 72, 255),
                false,
            );
            limitNode.active = !!limitText;
            return { card, button, limitLabel: limitNode.active ? limitLabel : null };
        },

        syncRecoverVigorDualRewardPanel(box: Node): { videoButton: Node; shareButton: Node; shareRemainingLabel: Label | null } {
            const iconPlate = box.getChildByName('RecoverVigorIconPlate');
            const oldRecoverBtn = box.getChildByName('RecoverBtn');
            if (iconPlate) iconPlate.active = false;
            if (oldRecoverBtn) oldRecoverBtn.active = false;

            const remaining = this.getRecoverVigorShareRemaining();
            const shareAvailable = remaining > 0;

            const videoCard = this.syncRecoverVigorRewardCard(
                box,
                'RecoverVigorVideoCard',
                -118,
                RECOVER_VIGOR_AD_REWARD,
                '\u770b\u89c6\u9891',
                new Color(68, 179, 238, 255),
                new Color(38, 121, 203, 255),
                true,
            );
            const shareCard = this.syncRecoverVigorRewardCard(
                box,
                'RecoverVigorShareCard',
                118,
                RECOVER_VIGOR_SHARE_REWARD,
                '\u5206\u4eab',
                shareAvailable ? new Color(58, 214, 116, 255) : new Color(170, 170, 170, 255),
                shareAvailable ? new Color(25, 156, 79, 255) : new Color(120, 120, 120, 255),
                shareAvailable,
                shareAvailable ? `\u4eca\u65e5\u5269\u4f59 ${remaining}/${RECOVER_VIGOR_SHARE_DAILY_LIMIT}` : '\u4eca\u65e5\u5df2\u7528\u5b8c',
            );
            return {
                videoButton: videoCard.button,
                shareButton: shareCard.button,
                shareRemainingLabel: shareCard.limitLabel,
            };
        },

        refreshRecoverVigorModalUI(): void {
            const statusLabel = this._recoverVigorStatusLbl as Label | null;
            if (!statusLabel?.node?.isValid) return;
            const ceiling = (this.constructor as any).VIGOR_CEILING;
            const currentVigor = this.getVigor();
            const hasCapacity = currentVigor < ceiling;
            statusLabel.string = `当前体力 ${currentVigor}/${ceiling}`;

            const busy = !!this._recoverVigorBusy;
            const videoButton = this._recoverVigorVideoButton as Node | null;
            if (videoButton?.isValid) {
                this.syncRecoverVigorButton(
                    videoButton,
                    '\u770b\u89c6\u9891',
                    new Color(68, 179, 238, 255),
                    new Color(38, 121, 203, 255),
                    hasCapacity && !busy,
                );
            }

            const remaining = this.getRecoverVigorShareRemaining();
            const shareAvailable = remaining > 0;
            const shareButton = this._recoverVigorShareButton as Node | null;
            if (shareButton?.isValid) {
                this.syncRecoverVigorButton(
                    shareButton,
                    '\u5206\u4eab',
                    shareAvailable ? new Color(58, 214, 116, 255) : new Color(170, 170, 170, 255),
                    shareAvailable ? new Color(25, 156, 79, 255) : new Color(120, 120, 120, 255),
                    hasCapacity && shareAvailable && !busy,
                );
            }
            const shareRemainingLabel = this._recoverVigorShareRemainingLbl as Label | null;
            if (shareRemainingLabel?.node?.isValid) {
                shareRemainingLabel.node.active = true;
                shareRemainingLabel.string = shareAvailable
                    ? `\u4eca\u65e5\u5269\u4f59 ${remaining}/${RECOVER_VIGOR_SHARE_DAILY_LIMIT}`
                    : '\u4eca\u65e5\u5df2\u7528\u5b8c';
                shareRemainingLabel.color = shareAvailable
                    ? new Color(71, 93, 132, 255)
                    : new Color(168, 72, 72, 255);
            }

            const closeButton = this._recoverVigorCloseButton as Node | null;
            if (closeButton?.isValid) {
                const button = closeButton.getComponent(Button) ?? closeButton.addComponent(Button);
                button.interactable = !busy;
                const opacity = closeButton.getComponent(UIOpacity) ?? closeButton.addComponent(UIOpacity);
                opacity.opacity = busy ? 140 : 255;
            }
        },

        setRecoverVigorModalBusy(busy: boolean): void {
            this._recoverVigorBusy = !!busy;
            this.refreshRecoverVigorModalUI();
        },

        clearRecoverVigorModalRuntimeState(): void {
            this._recoverVigorStatusLbl = null;
            this._recoverVigorVideoButton = null;
            this._recoverVigorShareButton = null;
            this._recoverVigorShareRemainingLbl = null;
            this._recoverVigorCloseButton = null;
            this._recoverVigorBusy = false;
            this._recoverVigorTransaction = null;
        },

        auditRecoverVigorInteractionState(reason: string = 'runtime'): void {
            const modal = this._noLivesModal as Node | null;
            if (!modal?.isValid) {
                this._noLivesModal = null;
                this.clearRecoverVigorModalRuntimeState();
                return;
            }
            if (this._recoverVigorBusy && !this._adShowing) {
                const rewardedTransaction = this._rewardedGrantTransaction as { page?: string; phase?: string } | null;
                if (rewardedTransaction?.page === 'vigor_recover' && rewardedTransaction.phase === 'recoverable') {
                    this._recoverVigorBusy = false;
                    this.refreshRecoverVigorModalUI();
                    return;
                }
                console.warn(`[recover-vigor] release stale popup transaction after ${reason}`, this._recoverVigorTransaction);
                this._recoverVigorBusy = false;
                this._recoverVigorTransaction = null;
            }
            this.refreshRecoverVigorModalUI();
        },

        /** 无体力弹窗 */
        showNoLivesAdModal(options: RecoverVigorOptions): void {
            this.openRecoverVigorPrefabModal(options);
        },

        openRecoverVigorPrefabModal(options: RecoverVigorOptions): void {
            const panelKey = 'recover-vigor';
            const prefabLoadKey = 'recover-vigor-prefab';
            this._openPanelAfterTextures(
                panelKey,
                RECOVER_VIGOR_TEXTURE_NAMES,
                () => !!this._noLivesModal || this._panelOpenInFlight.has(prefabLoadKey),
                () => {
                    const popupRoot = this.requireCanvasUiRoot('PopupRoot');
                    this._panelOpenInFlight.add(prefabLoadKey);
                    this._retainPanelTextureOwner('recover-vigor', RECOVER_VIGOR_TEXTURE_NAMES);
                    const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
                    const isOpenTargetAlive = () => isRuntimeAlive() && !!popupRoot?.isValid;
                    const cancelStaleOpen = () => {
                        if (!isRuntimeAlive()) return;
                        this._panelOpenInFlight.delete(prefabLoadKey);
                        this._noLivesModal = null;
                        this.clearRecoverVigorModalRuntimeState();
                        this._releasePanelTextureOwner('recover-vigor', 'recover-vigor-open-stale');
                    };
                    const failOpen = (message: string, overlay?: Node | null) => {
                        this._panelOpenInFlight.delete(prefabLoadKey);
                        if (overlay?.isValid) {
                            this._clearSpriteFramesBeforeDestroy(overlay);
                            this._destroyDetachedNodeNextFrame(overlay);
                        }
                        this._noLivesModal = null;
                        this.clearRecoverVigorModalRuntimeState();
                        this._releasePanelTextureOwner('recover-vigor', 'recover-vigor-open-failed');
                        throw new Error(message);
                    };

                    this._withGameAssetsBundle((bundle: Bundle | null) => {
                        if (!isOpenTargetAlive()) {
                            cancelStaleOpen();
                            return;
                        }
                        if (!bundle) {
                            failOpen('[recover-vigor-prefab] gameAssets bundle unavailable');
                            return;
                        }
                        bundle.load(RECOVER_VIGOR_PANEL_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                            if (!isOpenTargetAlive()) {
                                cancelStaleOpen();
                                return;
                            }
                            this._panelOpenInFlight.delete(prefabLoadKey);
                            if (err || !prefab) {
                                failOpen(`[recover-vigor-prefab] load failed: ${err?.message || 'prefab missing'}`);
                                return;
                            }

                            let modal: Node | null = null;
                            try {
                                popupRoot.getChildByName('RecoverVigorOverlay')?.destroy();
                                modal = instantiate(prefab);
                                modal.name = 'RecoverVigorOverlay';
                                popupRoot.addChild(modal);
                                modal.setSiblingIndex(999);
                                modal.active = true;
                                if (!modal.getComponent(BlockInputEvents)) {
                                    modal.addComponent(BlockInputEvents);
                                }

                                const box = this.requirePanelChild(modal, 'Box');
                                if (!box.getComponent(BlockInputEvents)) {
                                    box.addComponent(BlockInputEvents);
                                }
                                const statusLabel = this.requirePanelChild(box, 'RecoverVigorStatus').getComponent(Label);
                                if (!statusLabel) {
                                    throw new Error('[recover-vigor-prefab] missing RecoverVigorStatus label');
                                }
                                const rewardPanel = this.syncRecoverVigorDualRewardPanel(box);
                                const closeButton = this.requirePanelChild(box, 'XBtn');
                                this._recoverVigorStatusLbl = statusLabel;
                                this._recoverVigorVideoButton = rewardPanel.videoButton;
                                this._recoverVigorShareButton = rewardPanel.shareButton;
                                this._recoverVigorShareRemainingLbl = rewardPanel.shareRemainingLabel;
                                this._recoverVigorCloseButton = closeButton;
                                this._recoverVigorBusy = false;
                                this._recoverVigorTransaction = null;
                                this.refreshRecoverVigorModalUI();
                                if (DEBUG_RECOVER_VIGOR_LAYOUT) {
                                    const modalForLog = modal;
                                    this.scheduleOnce(() => {
                                        const visibleSize = view.getVisibleSize();
                                        runtimeLog(`[UI尺寸] VisibleSize: width=${visibleSize.width}, height=${visibleSize.height}`);
                                        logRecoverVigorNodeSize('PopupRoot', popupRoot);
                                        logRecoverVigorNodeSize('RecoverVigorOverlay', modalForLog);
                                        logRecoverVigorNodeSize('Box', box);
                                        logRecoverVigorNodeSize('Shade', modalForLog.getChildByName('Shade'));
                                        logRecoverVigorNodeSize('XBtn', box.getChildByName('XBtn'));
                                        logRecoverVigorNodeSize('RecoverBtn', box.getChildByName('RecoverBtn'));
                                    }, 0);
                                }

                                let closed = false;
                                const emitResult = (status: RecoverVigorResultStatus, granted: number = 0, transactionId: number = 0) => {
                                    try {
                                        options.onResult?.({
                                            source: options.source,
                                            status,
                                            granted: Math.max(0, Math.floor(Number(granted) || 0)),
                                            vigorAfter: this.getVigor(),
                                            transactionId,
                                        });
                                    } catch (error) {
                                        console.warn('[recover-vigor] result handler failed:', error);
                                    }
                                };
                                const finalizeModal = () => {
                                    if (closed) return;
                                    closed = true;
                                    if (modal?.isValid) {
                                        this._closePanelWithTextureOwner(modal, 'recover-vigor', 'recover-vigor');
                                    } else {
                                        this._releasePanelTextureOwner('recover-vigor', 'recover-vigor');
                                    }
                                    this._noLivesModal = null;
                                    this.clearRecoverVigorModalRuntimeState();
                                };
                                const beginAttempt = (method: string): number => {
                                    if (closed || this._recoverVigorBusy || this._adShowing) return 0;
                                    const rewardedTransaction = this._rewardedGrantTransaction as { page?: string; phase?: string } | null;
                                    const pendingVideoReward = rewardedTransaction?.page === 'vigor_recover'
                                        && rewardedTransaction.phase === 'recoverable';
                                    if (pendingVideoReward) {
                                        this.showToast('奖励确认中，请稍后');
                                        return 0;
                                    }
                                    if (this._recoverVigorTransaction) {
                                        return 0;
                                    }
                                    const transactionId = Math.max(1, Math.floor(Number(this._recoverVigorTransactionSeq) || 0) + 1);
                                    this._recoverVigorTransactionSeq = transactionId;
                                    this._recoverVigorTransaction = {
                                        id: transactionId,
                                        source: options.source,
                                        method,
                                        startedAt: Date.now(),
                                    };
                                    this.setRecoverVigorModalBusy(true);
                                    return transactionId;
                                };
                                const finishAttempt = (transactionId: number, granted: number) => {
                                    if (this._recoverVigorTransaction?.id !== transactionId) return;
                                    this._recoverVigorTransaction = null;
                                    this.setRecoverVigorModalBusy(false);
                                    if (granted > 0) {
                                        finalizeModal();
                                        emitResult('granted', granted, transactionId);
                                        return;
                                    }
                                    emitResult('failed', 0, transactionId);
                                };

                                this.bindPanelButton(closeButton, () => {
                                    if (this._recoverVigorBusy) return;
                                    AudioMgr.inst.play('button');
                                    finalizeModal();
                                    emitResult('cancelled');
                                });

                                this.bindPanelButton(rewardPanel.videoButton, () => {
                                    const transactionId = beginAttempt('video');
                                    if (!transactionId) return;
                                    AudioMgr.inst.play('button');
                                    if (this.getVigor() >= (this.constructor as any).VIGOR_CEILING) {
                                        this.showToast('\u4f53\u529b\u5df2\u7ecf\u6ee1\u4e86');
                                        finishAttempt(transactionId, 0);
                                        return;
                                    }
                                    let grantedAmount = 0;
                                    const started = this.runRewardedGrant('vigor_recover', () => {
                                        grantedAmount = this.grantVigorByAmount(RECOVER_VIGOR_AD_REWARD);
                                        if (grantedAmount <= 0) return false;
                                    }, {
                                        levelId: options.levelId,
                                        gameplayEntryMode: options.gameplayEntryMode,
                                        claimKey: 'vigor_recover:video',
                                        busyFlag: '_adShowing',
                                        adFailToast: '\u5e7f\u544a\u672a\u5b8c\u6210\uff0c\u672a\u83b7\u5f97\u4f53\u529b',
                                        successToast: () => `\u83b7\u5f97${RECOVER_VIGOR_AD_REWARD}\u70b9\u4f53\u529b`,
                                        grantFailToast: '\u4f53\u529b\u53d1\u653e\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
                                        onRecoverable: () => {
                                            if (this._recoverVigorTransaction?.id === transactionId) {
                                                this.setRecoverVigorModalBusy(false);
                                            }
                                        },
                                        onFinally: () => finishAttempt(transactionId, grantedAmount),
                                    });
                                    if (!started && this._recoverVigorTransaction?.id === transactionId) {
                                        finishAttempt(transactionId, 0);
                                    }
                                });

                                this.bindPanelButton(rewardPanel.shareButton, () => {
                                    const transactionId = beginAttempt('share');
                                    if (!transactionId) return;
                                    AudioMgr.inst.play('button');
                                    if (this.getVigor() >= (this.constructor as any).VIGOR_CEILING) {
                                        this.showToast('\u4f53\u529b\u5df2\u7ecf\u6ee1\u4e86');
                                        finishAttempt(transactionId, 0);
                                        return;
                                    }
                                    if (!this.canRecoverVigorByShare()) {
                                        this.showToast('\u4eca\u65e5\u5206\u4eab\u6b21\u6570\u5df2\u7528\u5b8c');
                                        finishAttempt(transactionId, 0);
                                        return;
                                    }
                                    let grantedAmount = 0;
                                    const started = this.runShareGrant('vigor_recover', () => {
                                        grantedAmount = this.grantVigorByAmount(RECOVER_VIGOR_SHARE_REWARD);
                                        if (grantedAmount <= 0) return false;
                                        this.recordRecoverVigorShareGrant();
                                    }, {
                                        shareType: 'vigor_recover_share',
                                        busyFlag: '_shareShowing',
                                        title: () => `\u6211\u5728\u62fc\u8c46\u8c46\u8865\u5145\u4e86\u4f53\u529b\uff0c\u5feb\u6765\u4e00\u8d77\u6311\u6218\uff01`,
                                        query: () => `level=${this.getActiveLogicalLevelId?.() || this.levelData?.levelId || 0}`,
                                        shareFailToast: '\u5206\u4eab\u672a\u5b8c\u6210\uff0c\u672a\u83b7\u5f97\u4f53\u529b',
                                        successToast: () => `\u83b7\u5f97${RECOVER_VIGOR_SHARE_REWARD}\u70b9\u4f53\u529b`,
                                        grantFailToast: '\u4f53\u529b\u53d1\u653e\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
                                        onFinally: () => finishAttempt(transactionId, grantedAmount),
                                    });
                                    if (!started && this._recoverVigorTransaction?.id === transactionId) {
                                        finishAttempt(transactionId, 0);
                                    }
                                });

                                modal.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                                    const boxUT = box.getComponent(UITransform);
                                    if (!boxUT) return;
                                    const uiPos = e.getUILocation();
                                    const local = boxUT.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
                                    const size = boxUT.contentSize;
                                    if (Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2) {
                                        e.propagationStopped = true;
                                        return;
                                    }
                                    if (this._recoverVigorBusy) return;
                                    AudioMgr.inst.play('button');
                                    finalizeModal();
                                    emitResult('cancelled');
                                }, this);

                                this._noLivesModal = modal;
                                this.playPopupOpenAnim?.(modal, box);
                            } catch (error: any) {
                                failOpen(error?.message || '[recover-vigor-prefab] build failed', modal);
                            }
                        });
                    });
                },
            );
        },

        getUrlLevel(): number {
            try {
                const v = parseInt(this.getRuntimeQueryParam('level') || '');
                return v > 0 ? v : 0;
            } catch (_) { return 0; }
        },

        getUrlLevelFile(): string {
            try {
                return this.normalizeExternalLevelFilePath(new URLSearchParams(window.location.search).get('levelfile') || '');
            } catch (_) { return ''; }
        },

        getUrlTheme(): boolean {
            try {
                return new URLSearchParams(window.location.search).get('theme') === '1';
            } catch (_) { return false; }
        },

        getUrlForceGuide(): boolean {
            try {
                return new URLSearchParams(window.location.search).get('guide') === '1';
            } catch (_) { return false; }
        },

        getRuntimeQueryParam(name: string): string {
            try {
                if (typeof window !== 'undefined') {
                    const value = new URLSearchParams(window.location.search).get(name);
                    if (typeof value === 'string' && value.length > 0) return value;
                }
            } catch (_) {}
            try {
                const wx: any = this.getWeChatRuntime();
                const query = wx?.getLaunchOptionsSync?.()?.query;
                const value = query && typeof query === 'object' ? query[name] : '';
                return typeof value === 'string' ? value : String(value || '');
            } catch (_) {
                return '';
            }
        },

        getUrlDebug(): boolean {
            try {
                return this.getRuntimeQueryParam('debug') === '1'
                    || this.getRuntimeQueryParam('log') === '1'
                    || this.getRuntimeQueryParam('ab').trim().length > 0;
            } catch (_) { return false; }
        },

        getPhysicalMainLevelId(logicalLevelId: number): number {
            return mapLogicalToPhysicalLevelId(logicalLevelId);
        },

        getLogicalMainLevelId(physicalLevelId: number): number {
            return mapPhysicalToLogicalLevelId(physicalLevelId);
        },

        playReturnFeedback(worldPos?: Vec3): void {
            if (worldPos) {
                this.showGameplayInvalidTapFeedback?.(worldPos);
            }
        },

        shouldUseMainlineWinSettlementUI(): boolean {
            return !this._isThemeLevel;
        },

        shouldUseMainlineSlotUI(): boolean {
            return true;
        },

        getActiveLogicalLevelId(): number {
            if (this._isThemeLevel) return this._currentThemeLevelId || this.levelData?.levelId || 1;
            return this.getLogicalMainLevelId(this.getActivePhysicalLevelId());
        },

        getActivePhysicalLevelId(): number {
            return Math.max(1, Math.floor(Number(this._activePhysicalLevelId || this.levelData?.levelId || 1) || 1));
        },

        isMainlineMainLevel(): boolean {
            return !this._isThemeLevel;
        },

        shouldUseMainlineUnlimitedTime(logicalLevelId: number): boolean {
            return this.isMainlineMainLevel() && shouldUseMainLevelUnlimitedTime(logicalLevelId);
        },

        getMainlineTimeLimitSeconds(logicalLevelId: number): number | null {
            if (!this.isMainlineMainLevel()) return null;
            return getMainLevelTimeLimitSeconds(logicalLevelId);
        },

        isFirstLevelFunnelActive(): boolean {
            const logicalLevelId = this.getActiveLogicalLevelId();
            return !this._isThemeLevel && (logicalLevelId === 1 || logicalLevelId === 2);
        },
    });
}
