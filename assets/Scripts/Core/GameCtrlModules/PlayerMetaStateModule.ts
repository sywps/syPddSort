import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button, Prefab, instantiate,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, DAILY_SIGNIN_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, REWARD_RESULT_RELEASE_TEXTURE_NAMES, REWARD_RESULT_TEXTURE_NAMES, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
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
import { isWeChatMiniGameRuntime } from '../MiniGamePlatform';
import { runtimeLog, runtimeWarn } from '../RuntimeLog';

const RECOVER_VIGOR_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/RecoverVigorPanel';
const REWARD_RESULT_POPUP_PREFAB_PATH = 'UI/Prefabs/Panels/RewardResultPopup';
const DEBUG_RECOVER_VIGOR_LAYOUT = false;

type RewardResultPopupItem = {
    iconName: string;
    amountText: string;
    labelText: string;
};

type RewardResultPopupOptions = {
    overlayName?: string;
    title: string;
    subtitle: string;
    items: RewardResultPopupItem[];
    tip?: string;
    confirmText?: string;
    onConfirm?: () => void;
};

type DailySignInPropRewardKey = 'wand' | 'brush' | 'magnet';

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

function syncPlayerMetaPopupTitle(box: Node, title: string): void {
    const badge = box.getChildByName('PopupTitleBadge');
    const titleNode = badge?.getChildByName('PopupTitleLabel');
    const label = titleNode?.getComponent(Label);
    if (!badge || !titleNode || !label) {
        throw new Error('[reward-result-prefab] missing popup title nodes');
    }
    badge.active = true;
    titleNode.active = true;
    label.string = title;
}

function syncExistingPopupLabel(parent: Node, childName: string, text: string, errorPrefix: string): Label {
    const labelNode = parent.getChildByName(childName);
    const label = labelNode?.getComponent(Label);
    if (!labelNode || !label) {
        throw new Error(`${errorPrefix} missing Label component on ${parent.name}/${childName}`);
    }
    labelNode.active = true;
    label.string = text;
    label.enableWrapText = false;
    return label;
}

function getDailySignInPropRewardCount(reward: DailySignInReward, key: DailySignInPropRewardKey): number {
    switch (key) {
        case 'wand':
            return 'wand' in reward ? reward.wand : 0;
        case 'brush':
            return 'brush' in reward ? reward.brush : 0;
        case 'magnet':
            return 'magnet' in reward ? reward.magnet : 0;
        default:
            return 0;
    }
}

function normalizeFirstLevelRouteBucketPayloadValue(value: unknown): FirstLevelRouteVariant | null {
    const text = String(value ?? '').trim().toLowerCase();
    if (text === 'bucket_a' || text === '0' || text === 'a') return 'bucket_a';
    if (text === 'bucket_b' || text === '1' || text === 'b') return 'bucket_b';
    return null;
}

function extractFirstLevelRouteBucketFromPayload(payload: any): FirstLevelRouteVariant | null {
    const seen = new Set<any>();
    const visit = (value: any, depth: number): FirstLevelRouteVariant | null => {
        const direct = normalizeFirstLevelRouteBucketPayloadValue(value);
        if (direct) return direct;
        if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return null;
        seen.add(value);
        for (const key of [FIRST_LEVEL_ROUTE_EXPERIMENT_ID, 'variant', 'value', 'group', 'groupId', 'group_id']) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                const found = visit(value[key], depth + 1);
                if (found) return found;
            }
        }
        for (const child of Array.isArray(value) ? value : Object.values(value)) {
            const found = visit(child, depth + 1);
            if (found) return found;
        }
        return null;
    };
    return visit(payload, 0);
}

function stringifyAbPayloadForLog(payload: unknown): string {
    try {
        const text = JSON.stringify(payload);
        return text.length > 360 ? `${text.slice(0, 360)}...` : text;
    } catch (_) {
        return String(payload);
    }
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

        setGold(value: number): void {
            sys.localStorage.setItem(LS_GOLD, String(Math.max(0, Math.floor(Number(value) || 0))));
            this.refreshGoldUI();
            this.queueCloudGameStateSync();
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
            const starterKinds: InventoryPropKind[] = ['wand', 'brush', 'magnet'];
            let changed = false;
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
            if (this._shopGoldLbl) {
                this._shopGoldLbl.string = text;
            }
        },

        getDailySignInClaimedCount(): number {
            const raw = sys.localStorage.getItem(LS_DAILY_SIGNIN_COUNT);
            const value = raw ? parseInt(raw, 10) : 0;
            return Number.isFinite(value) && value > 0 ? value : 0;
        },

        setDailySignInClaimedCount(value: number): void {
            sys.localStorage.setItem(LS_DAILY_SIGNIN_COUNT, String(Math.max(0, Math.floor(Number(value) || 0))));
            this.queueCloudGameStateSync();
        },

        getDailySignInLastClaimDateKey(): number {
            const raw = sys.localStorage.getItem(LS_DAILY_SIGNIN_LAST_DATE_KEY);
            const value = raw ? parseInt(raw, 10) : 0;
            return Number.isFinite(value) && value > 0 ? value : 0;
        },

        setDailySignInLastClaimDateKey(value: number): void {
            sys.localStorage.setItem(LS_DAILY_SIGNIN_LAST_DATE_KEY, String(Math.max(0, Math.floor(Number(value) || 0))));
            this.queueCloudGameStateSync();
        },

        getTodayDateKey(): number {
            const now = new Date();
            return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        },

        dateFromKey(key: number): Date | null {
            if (!key) return null;
            const year = Math.floor(key / 10000);
            const month = Math.floor((key % 10000) / 100);
            const day = key % 100;
            if (year <= 0 || month <= 0 || day <= 0) return null;
            return new Date(year, month - 1, day, 12, 0, 0, 0);
        },

        isYesterdayDateKey(prevKey: number, todayKey: number): boolean {
            const prev = this.dateFromKey(prevKey);
            const today = this.dateFromKey(todayKey);
            if (!prev || !today) return false;
            const diff = today.getTime() - prev.getTime();
            return diff > 0 && Math.round(diff / 86400000) === 1;
        },

        getDailySignInStatus(): {
            cycleLength: number;
            canClaim: boolean;
            alreadyClaimedToday: boolean;
            nextClaimIndex: number;
            displayClaimedCount: number;
        } {
            const rewards = ECONOMY_NUMERIC_TABLE.dailySignIn.rewards;
            const cycleLength = rewards.length;
            const todayKey = this.getTodayDateKey();
            const lastClaimDateKey = this.getDailySignInLastClaimDateKey();
            const storedCount = Math.max(0, Math.min(this.getDailySignInClaimedCount(), cycleLength));
            if (lastClaimDateKey === todayKey) {
                return {
                    cycleLength,
                    canClaim: false,
                    alreadyClaimedToday: true,
                    nextClaimIndex: Math.max(0, Math.min(storedCount - 1, cycleLength - 1)),
                    displayClaimedCount: storedCount,
                };
            }
        
            const continueStreak = this.isYesterdayDateKey(lastClaimDateKey, todayKey);
            const baseCount = continueStreak ? (storedCount >= cycleLength ? 0 : storedCount) : 0;
            return {
                cycleLength,
                canClaim: true,
                alreadyClaimedToday: false,
                nextClaimIndex: baseCount,
                displayClaimedCount: baseCount,
            };
        },

        buildDailySignInRewardText(reward: DailySignInReward): string[] {
            const lines: string[] = [];
            const wandReward = getDailySignInPropRewardCount(reward, 'wand');
            const brushReward = getDailySignInPropRewardCount(reward, 'brush');
            const magnetReward = getDailySignInPropRewardCount(reward, 'magnet');
            if (reward.gold && reward.gold > 0) lines.push(`+${reward.gold}金币`);
            if (wandReward > 0) lines.push(`魔法棒x${wandReward}`);
            if (brushReward > 0) lines.push(`刷子x${brushReward}`);
            if (magnetReward > 0) lines.push(`磁铁x${magnetReward}`);
            return lines;
        },

        grantDailySignInReward(reward: DailySignInReward): string {
            const wandReward = getDailySignInPropRewardCount(reward, 'wand');
            const brushReward = getDailySignInPropRewardCount(reward, 'brush');
            const magnetReward = getDailySignInPropRewardCount(reward, 'magnet');
            if (reward.gold && reward.gold > 0) this.addGold(reward.gold);
            if (wandReward > 0) this.addPropCount('wand', wandReward);
            if (brushReward > 0) this.addPropCount('brush', brushReward);
            if (magnetReward > 0) this.addPropCount('magnet', magnetReward);
            return this.buildDailySignInRewardText(reward).join('、');
        },

        buildDailySignInRewardResultItems(reward: DailySignInReward): RewardResultPopupItem[] {
            const items: RewardResultPopupItem[] = [];
            const wandReward = getDailySignInPropRewardCount(reward, 'wand');
            const brushReward = getDailySignInPropRewardCount(reward, 'brush');
            const magnetReward = getDailySignInPropRewardCount(reward, 'magnet');
            if (reward.gold && reward.gold > 0) items.push({ iconName: '金币', amountText: `+${reward.gold}`, labelText: '金币' });
            if (wandReward > 0) items.push({ iconName: 'popup_tool_wand_icon', amountText: `x${wandReward}`, labelText: '魔法棒' });
            if (brushReward > 0) items.push({ iconName: 'popup_tool_brush_icon', amountText: `x${brushReward}`, labelText: '刷子' });
            if (magnetReward > 0) items.push({ iconName: 'popup_tool_magnet_icon', amountText: `x${magnetReward}`, labelText: '磁铁' });
            return items;
        },

        showRewardResultPopup(options: RewardResultPopupOptions) {
            const popupRoot = this.requireCanvasUiRoot('PopupRoot');
            const overlayName = options.overlayName || 'RewardResultOverlay';
            const items = options.items.filter((item) => !!item.iconName && !!item.amountText).slice(0, 3);
            if (items.length <= 0) {
                throw new Error('[reward-result] at least one reward item is required');
            }
            if (REWARD_RESULT_TEXTURE_NAMES.some((name: string) => !this.getSF(name))) {
                this._openPanelAfterTextures('reward-result', REWARD_RESULT_TEXTURE_NAMES, () => !!popupRoot.getChildByName(overlayName), () => this.showRewardResultPopup(options));
                return;
            }
            if (popupRoot.getChildByName(overlayName)) return;
            this._retainPanelTextureOwner('reward-result', REWARD_RESULT_TEXTURE_NAMES);

            const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            const isOpenTargetAlive = () => isRuntimeAlive() && !!popupRoot?.isValid;
            const cancelStaleOpen = () => {
                if (!isRuntimeAlive()) return;
                this._releasePanelTextureOwner('reward-result', 'reward-result-open-stale');
            };
            const failOpen = (message: string, overlay?: Node | null) => {
                if (overlay?.isValid) {
                    this._clearSpriteFramesBeforeDestroy(overlay);
                    this._destroyDetachedNodeNextFrame(overlay);
                }
                this._releasePanelTextureOwner('reward-result', 'reward-result-open-failed');
                throw new Error(message);
            };

            this._withGameAssetsBundle((bundle: Bundle | null) => {
                if (!isOpenTargetAlive()) {
                    cancelStaleOpen();
                    return;
                }
                if (!bundle) {
                    failOpen('[reward-result-prefab] gameAssets bundle unavailable');
                    return;
                }
                bundle.load(REWARD_RESULT_POPUP_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                    if (!isOpenTargetAlive()) {
                        cancelStaleOpen();
                        return;
                    }
                    if (err || !prefab) {
                        failOpen(`[reward-result-prefab] load failed: ${err?.message || 'prefab missing'}`);
                        return;
                    }

                    let overlay: Node | null = null;
                    try {
                        overlay = instantiate(prefab);
                        overlay.name = overlayName;
                        popupRoot.addChild(overlay);
                        overlay.setSiblingIndex(999);
                        if (!overlay.getComponent(BlockInputEvents)) overlay.addComponent(BlockInputEvents);

                        const box = this.requirePanelChild(overlay, 'Box');
                        syncPlayerMetaPopupTitle(box, options.title);
                        if (!box.getComponent(BlockInputEvents)) box.addComponent(BlockInputEvents);

                        const closePopup = () => {
                            if (!overlay?.isValid) return;
                            AudioMgr.inst.play('button');
                            this._closePanelWithTextureOwner(overlay, 'reward-result', 'reward-result');
                        };
                        const confirmPopup = () => {
                            if (!overlay?.isValid) return;
                            AudioMgr.inst.play('button');
                            this._closePanelWithTextureOwner(overlay, 'reward-result', 'reward-result-confirm');
                            options.onConfirm?.();
                        };

                        overlay.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                            const boxUT = box.getComponent(UITransform);
                            if (!boxUT) return;
                            const uiPos = e.getUILocation();
                            const local = boxUT.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
                            const size = boxUT.contentSize;
                            if (Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2) return;
                            closePopup();
                        }, this);

                        this.bindPanelButton(this.requirePanelChild(box, 'XBtn'), closePopup);

                        const subtitleLabel = syncExistingPopupLabel(box, 'RewardSubtitle', options.subtitle, '[reward-result-prefab]');
                        subtitleLabel.overflow = Label.Overflow.SHRINK;
                        const tipLabel = syncExistingPopupLabel(box, 'RewardTip', options.tip || '奖励将发放到当前账号', '[reward-result-prefab]');
                        tipLabel.overflow = Label.Overflow.SHRINK;

                        const confirmButton = this.requirePanelChild(box, 'PrimaryButton');
                        syncExistingPopupLabel(confirmButton, 'PrimaryButtonLabel', options.confirmText || '我知道了', '[reward-result-prefab]');
                        this.bindPanelButton(confirmButton, confirmPopup);

                        const template = this.requirePanelChild(box, 'RewardCardTemplate');
                        const cardParent = template.parent;
                        if (!cardParent) {
                            throw new Error('[reward-result-prefab] RewardCardTemplate parent is missing');
                        }
                        for (const child of [...cardParent.children]) {
                            if (child !== template && child.name.startsWith('RewardCardAuto_')) {
                                child.destroy();
                            }
                        }

                        const basePos = template.position.clone();
                        const spacing = items.length >= 3 ? 176 : 214;
                        const startX = basePos.x - ((items.length - 1) * spacing) / 2;
                        for (let i = 0; i < items.length; i++) {
                            const item = items[i];
                            const card = i === 0 ? template : instantiate(template);
                            if (i > 0) {
                                card.name = `RewardCardAuto_${i}`;
                                cardParent.addChild(card);
                            }
                            card.active = true;
                            card.setPosition(startX + i * spacing, basePos.y, basePos.z);

                            const iconNode = this.requirePanelChild(card, 'RewardIcon');
                            const iconSprite = iconNode.getComponent(Sprite);
                            const spriteFrame = this.getSF(item.iconName);
                            if (!iconSprite || !spriteFrame) {
                                throw new Error(`[reward-result-prefab] missing reward icon SpriteFrame: ${item.iconName}`);
                            }
                            iconSprite.spriteFrame = spriteFrame;

                            const amountLabel = syncExistingPopupLabel(card, 'RewardAmountLabel', item.amountText, '[reward-result-prefab]');
                            amountLabel.overflow = Label.Overflow.SHRINK;
                            const nameLabel = syncExistingPopupLabel(card, 'RewardNameLabel', item.labelText, '[reward-result-prefab]');
                            nameLabel.overflow = Label.Overflow.SHRINK;
                        }
                        this.playPopupOpenAnim?.(overlay, box);
                    } catch (error: any) {
                        failOpen(error?.message || '[reward-result-prefab] build failed', overlay);
                    }
                });
            });
        },

        showDailySignInRewardReceipt(reward: DailySignInReward) {
            const items = this.buildDailySignInRewardResultItems(reward);
            const hasPropReward = items.some((item) => item.iconName !== '金币');
            this.showRewardResultPopup({
                overlayName: 'RewardResultOverlay',
                title: '签到成功',
                subtitle: '奖励已到账',
                items,
                tip: hasPropReward ? '道具会在关卡内技能按钮上显示库存' : '奖励将发放到当前账号',
                confirmText: '我知道了',
            });
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
        },

        /** 体力 Tick（每帧 0.2s 刷新） */
        vigorTick(dt: number): void { this._vigorTickDt += dt; if (this._vigorTickDt < 0.2) return; this._vigorTickDt = 0; this.refreshVigorUI(); },

        /** 无体力弹窗 */
        showNoLivesAdModal(onDone: () => void): void {
            this.openRecoverVigorPrefabModal(onDone);
        },

        openRecoverVigorPrefabModal(onDone: () => void): void {
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
                        this._releasePanelTextureOwner('recover-vigor', 'recover-vigor-open-stale');
                    };
                    const failOpen = (message: string, overlay?: Node | null) => {
                        this._panelOpenInFlight.delete(prefabLoadKey);
                        if (overlay?.isValid) {
                            this._clearSpriteFramesBeforeDestroy(overlay);
                            this._destroyDetachedNodeNextFrame(overlay);
                        }
                        this._noLivesModal = null;
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
                                const recoverBtn = this.requirePanelChild(box, 'RecoverBtn');
                                const currentVigor = this.getVigor();
                                const ceiling = (this.constructor as any).VIGOR_CEILING;
                                const statusLabel = this.requirePanelChild(box, 'RecoverVigorStatus').getComponent(Label);
                                if (!statusLabel) {
                                    throw new Error('[recover-vigor-prefab] missing RecoverVigorStatus label');
                                }
                                statusLabel.string = `当前体力 ${currentVigor}/${ceiling}`;
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
                                const finalizeModal = (shouldNotify: boolean) => {
                                    if (closed) return;
                                    closed = true;
                                    if (modal?.isValid) {
                                        this._closePanelWithTextureOwner(modal, 'recover-vigor', 'recover-vigor');
                                    } else {
                                        this._releasePanelTextureOwner('recover-vigor', 'recover-vigor');
                                    }
                                    this._noLivesModal = null;
                                    if (shouldNotify && onDone) onDone();
                                };

                                this.bindPanelButton(this.requirePanelChild(box, 'XBtn'), () => {
                                    AudioMgr.inst.play('button');
                                    finalizeModal(true);
                                });

                                this.bindPanelButton(recoverBtn, () => {
                                    if (this._adShowing) return;
                                    AudioMgr.inst.play('button');
                                    if (this.getVigor() >= (this.constructor as any).VIGOR_CEILING) {
                                        this.showToast('\u4f53\u529b\u5df2\u7ecf\u6ee1\u4e86');
                                        return;
                                    }
                                    finalizeModal(false);
                                    this.runRewardedGrant('vigor_recover', () => {
                                        this.setVigor((this.constructor as any).VIGOR_CEILING);
                                        this.setVigorTime(0);
                                        this.refreshVigorUI();
                                    }, {
                                        busyFlag: '_adShowing',
                                        adFailToast: '\u5e7f\u544a\u672a\u5b8c\u6210\uff0c\u672a\u6062\u590d\u4f53\u529b',
                                        grantFailToast: '\u4f53\u529b\u6062\u590d\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
                                        onFinally: () => {
                                            if (onDone) onDone();
                                        },
                                    });
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
                                    AudioMgr.inst.play('button');
                                    finalizeModal(true);
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
                const p = new URLSearchParams(window.location.search);
                const v = parseInt(p.get('level') || '');
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

        normalizeFirstLevelRouteBucketValue(value: unknown): FirstLevelRouteVariant | null {
            return normalizeFirstLevelRouteBucketPayloadValue(value);
        },

        normalizeFirstLevelRouteUrlBucket(value: unknown): FirstLevelRouteVariant | null {
            const text = String(value ?? '').trim().toLowerCase();
            if (text === 'a') return 'bucket_a';
            if (text === 'b') return 'bucket_b';
            return null;
        },

        shouldUseFirstLevelRouteExperiment(): boolean {
            return isWeChatMiniGameRuntime();
        },

        isFirstLevelRouteExperimentQuery(value: string): boolean {
            const text = value.trim().toLowerCase();
            return text === FIRST_LEVEL_ROUTE_EXPERIMENT_ID;
        },

        logAbExperimentCatalog(reason = ''): void {
            const prefix = reason ? `[PDD_AB] ${reason}\n` : '';
            runtimeWarn(prefix + [
                '[PDD_AB] experiments:',
                `1. ${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}`,
                '   bucket=a: stats/bucket_a only, gameplay stays on mainline route',
                '   bucket=b: stats/bucket_b only, gameplay stays on mainline route',
                '   mainline: level_1 -> level_1',
                '   mainline: level_2 -> level_2',
                '   mainline: level_3 -> level_3',
                '   mainline: level_4 -> level_4',
                '   mainline: level_5 -> level_5',
                `   example: ?ab=${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}&bucket=a`,
                `   example: ?ab=${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}&bucket=b`,
            ].join('\n'));
        },

        applyFirstLevelRouteUrlOverride(): boolean {
            if (!this.shouldUseFirstLevelRouteExperiment()) return false;
            const ab = this.getRuntimeQueryParam('ab').trim();
            if (!ab) return false;
            const normalizedAb = ab.toLowerCase();
            if (normalizedAb === 'all' || normalizedAb === 'list') {
                this.logAbExperimentCatalog();
                return false;
            }
            if (!this.isFirstLevelRouteExperimentQuery(ab)) {
                this.logAbExperimentCatalog(`unknown experiment: ${ab}`);
                return false;
            }
            const bucket = this.getRuntimeQueryParam('bucket').trim();
            const resolvedBucket = this.normalizeFirstLevelRouteUrlBucket(bucket);
            if (!resolvedBucket) {
                this.logAbExperimentCatalog(`unknown bucket for ${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}: ${bucket || '(empty)'}`);
                return false;
            }
            this._firstLevelRouteBucket = resolvedBucket;
            runtimeWarn(`[PDD_AB] forced ${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}: bucket=${bucket}, resolvedBucket=${resolvedBucket}`);
            return true;
        },

        extractFirstLevelRouteBucket(payload: any): FirstLevelRouteVariant | null {
            return extractFirstLevelRouteBucketFromPayload(payload);
        },

        stringifyAbPayload(payload: unknown): string {
            return stringifyAbPayloadForLog(payload);
        },

        async fetchFirstLevelRouteBucketFromWx(): Promise<FirstLevelRouteVariant | null> {
            if (!this.shouldUseFirstLevelRouteExperiment()) return null;
            const wx: any = this.getWeChatRuntime();
            if (!wx) {
                runtimeWarn(`[PDD_AB] ${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}: wx runtime unavailable`);
                return null;
            }
            const hasGameExptInfo = typeof wx.getGameExptInfo === 'function';
            const hasExptInfoSync = typeof wx.getExptInfoSync === 'function';
            let lastDetail = `apis getGameExptInfo=${hasGameExptInfo ? 'yes' : 'no'}, getExptInfoSync=${hasExptInfoSync ? 'yes' : 'no'}`;
            if (typeof wx.getGameExptInfo === 'function') {
                const bucket = await new Promise<FirstLevelRouteVariant | null>((resolve) => {
                    let done = false;
                    const finish = (value: FirstLevelRouteVariant | null, detail?: string) => {
                        if (done) return;
                        done = true;
                        if (detail) lastDetail = detail;
                        resolve(value);
                    };
                    const timer = setTimeout(
                        () => finish(null, `getGameExptInfo timeout ${FIRST_LEVEL_ROUTE_WX_TIMEOUT_MS}ms`),
                        FIRST_LEVEL_ROUTE_WX_TIMEOUT_MS,
                    );
                    try {
                        wx.getGameExptInfo({
                            success: (res: any) => {
                                clearTimeout(timer);
                                const found = extractFirstLevelRouteBucketFromPayload(res);
                                finish(found, `getGameExptInfo success bucket=${found || 'none'} raw=${stringifyAbPayloadForLog(res)}`);
                            },
                            fail: (err: any) => {
                                clearTimeout(timer);
                                finish(null, `getGameExptInfo fail ${stringifyAbPayloadForLog(err)}`);
                            },
                            complete: () => {},
                        });
                    } catch (err) {
                        clearTimeout(timer);
                        finish(null, `getGameExptInfo throw ${stringifyAbPayloadForLog(err)}`);
                    }
                });
                if (bucket) return bucket;
            }
            if (typeof wx.getExptInfoSync === 'function') {
                for (const arg of [[FIRST_LEVEL_ROUTE_EXPERIMENT_ID], FIRST_LEVEL_ROUTE_EXPERIMENT_ID, undefined]) {
                    try {
                        const res = typeof arg === 'undefined' ? wx.getExptInfoSync() : wx.getExptInfoSync(arg);
                        const bucket = extractFirstLevelRouteBucketFromPayload(res);
                        lastDetail = `getExptInfoSync success bucket=${bucket || 'none'} raw=${stringifyAbPayloadForLog(res)}`;
                        if (bucket) return bucket;
                    } catch (err) {
                        lastDetail = `getExptInfoSync throw ${stringifyAbPayloadForLog(err)}`;
                    }
                }
            }
            runtimeWarn(`[PDD_AB] ${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}: no valid wx experiment value, ${lastDetail}`);
            return null;
        },

        startFirstLevelRouteExperimentResolve(): Promise<FirstLevelRouteResolution> {
            if (!this.shouldUseFirstLevelRouteExperiment()) {
                return Promise.resolve({
                    bucket: 'bucket_a',
                    source: 'default',
                });
            }
            if (this.applyFirstLevelRouteUrlOverride()) {
                return Promise.resolve({
                    bucket: this._firstLevelRouteBucket,
                    source: 'url',
                });
            }
            return this.fetchFirstLevelRouteBucketFromWx().then((bucket) => ({
                bucket: bucket || 'bucket_a',
                source: bucket ? 'wechat_experiment' : 'default',
            }));
        },

        async initFirstLevelRouteExperiment(resolveTask?: Promise<FirstLevelRouteResolution>): Promise<void> {
            if (!this.shouldUseFirstLevelRouteExperiment()) {
                this._firstLevelRouteBucket = 'bucket_a';
                return;
            }
            const result = await (resolveTask || this.startFirstLevelRouteExperimentResolve());
            this._firstLevelRouteBucket = result.bucket;
            runtimeWarn(`[PDD_AB] assigned ${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}: source=${result.source}, abBucket=${this._firstLevelRouteBucket}, gameplayRoute=mainline`);
        },

        getPhysicalMainLevelId(logicalLevelId: number): number {
            return mapLogicalToPhysicalLevelId(logicalLevelId);
        },

        getLogicalMainLevelId(physicalLevelId: number): number {
            return mapPhysicalToLogicalLevelId(physicalLevelId);
        },

        playReturnFeedback(): void {
            return;
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
