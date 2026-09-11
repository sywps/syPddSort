import {
    _decorator, Component, Node, UITransform, Sprite, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle,
    Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, instantiate, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel,
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
import { debugPerfSnapshot, debugPerfTrace, isDebugPerfTraceEnabled } from '../DebugPerfTrace';
import { runtimeLog } from '../RuntimeLog';

function requireFriendRankNode(parent: Node, name: string): Node {
    const node = parent.getChildByName(name);
    if (!node) {
        throw new Error(`[leaderboard-prefab] missing node: ${name}`);
    }
    return node;
}

function setFriendRankLoadingVisible(listNode: Node, visible: boolean): void {
    const node = requireFriendRankNode(listNode, 'LeaderboardStatusTitle');
    const label = node.getComponent(Label);
    if (!label) {
        throw new Error('[leaderboard-prefab] missing label on LeaderboardStatusTitle');
    }
    node.active = visible;
}

const GLOBAL_RANK_FRIEND_AVATAR_TIMEOUT_MS = 1800;

function withFriendRankTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
            if (settled) return;
            settled = true;
            timeoutId = null;
            reject(new Error(message));
        }, timeoutMs);

        const finish = (ok: boolean, payload: T | unknown) => {
            if (settled) return;
            settled = true;
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            ok ? resolve(payload as T) : reject(payload);
        };

        promise.then((value) => finish(true, value), (error) => finish(false, error));
    });
}

export function installFriendRankModule(target: any): void {
    Object.assign(target, {
        resetLeaderboardListState(listNode: Node) {
            setFriendRankLoadingVisible(listNode, false);
            const viewport = listNode.getChildByName('LeaderboardViewport');
            this.clearLeaderboardScroll(viewport);
            if (viewport) {
                viewport.active = false;
            }
            listNode.getChildByName('OpenDataCanvasHost')?.destroy();
        },

        /** 好友排行旧兜底：主域直接渲染，仅在开放数据域不可用时使用 */
        async showFriendRankList(box: Node, listNode: Node, requestToken?: number) {
            const wx = this.getWeChatRuntime();
            const isCurrentRequest = () => !requestToken || this.isLeaderboardTabRequestCurrent?.(requestToken) !== false;
            this.resetLeaderboardListState(listNode);
        
            setFriendRankLoadingVisible(listNode, true);
        
            if (!wx?.getFriendCloudStorage) {
                setFriendRankLoadingVisible(listNode, false);
                console.warn('[GameCtrl] wx.getFriendCloudStorage unavailable');
                return;
            }
        
            // 确保分数已提交
            const profile = UserMgr.inst.getProfile();
            await LeaderboardMgr.inst.submitProgress(profile.lastLevelId || 1, profile);
            if (!box.isValid || !isCurrentRequest()) return;
        
            try {
                const friendData: any[] = await new Promise((resolve, reject) => {
                    wx.getFriendCloudStorage({
                        keyList: ['score'],
                        success: (res: any) => resolve(res.data || []),
                        fail: (err: any) => reject(err),
                    });
                });
        
                if (!box.isValid || !isCurrentRequest()) return;
                if (!friendData || friendData.length === 0) {
                    setFriendRankLoadingVisible(listNode, false);
                    return;
                }
        
                const entries = this.normalizeFriendRankEntries(friendData);
        
                this.renderFriendRankRows(listNode, entries);
            } catch (err: any) {
                console.warn('[GameCtrl] getFriendCloudStorage failed:', err);
                if (!box.isValid || !isCurrentRequest()) return;
                setFriendRankLoadingVisible(listNode, false);
            }
        },

        /** 从好友数据的 KVDataList 中提取分数 */
        extractFriendScore(item: any): number {
            const kvList = item.KVDataList || [];
            for (const kv of kvList) {
                if (kv.key === 'score' && kv.value) {
                    try {
                        const parsed = JSON.parse(kv.value);
                        if (parsed.wxgame && typeof parsed.wxgame.score === 'number') return parsed.wxgame.score;
                    } catch (_) { /* ignore */ }
                }
            }
            return 0;
        },

        compareFriendRankEntries(
            a: Pick<RankListEntry, 'displayName' | 'avatarUrl' | 'progressLevel'>,
            b: Pick<RankListEntry, 'displayName' | 'avatarUrl' | 'progressLevel'>,
        ): number {
            if (b.progressLevel !== a.progressLevel) {
                return b.progressLevel - a.progressLevel;
            }
            const nameCompare = (a.displayName || '').localeCompare(b.displayName || '');
            if (nameCompare !== 0) {
                return nameCompare;
            }
            return (a.avatarUrl || '').localeCompare(b.avatarUrl || '');
        },

        normalizeFriendRankEntries(friendData: any[]): RankListEntry[] {
            return (friendData || [])
                .map((item: any) => ({
                    rank: 0,
                    displayName: item.nickname || item.nickName || '微信用户',
                    avatarUrl: item.avatarUrl || '',
                    progressLevel: this.extractFriendScore(item),
                }))
                .sort((a, b) => this.compareFriendRankEntries(a, b))
                .slice(0, 100)
                .map((entry, index) => ({
                    ...entry,
                    rank: index + 1,
                }));
        },

        async getWeChatFriendAvatarEntries(forceRefresh: boolean = false): Promise<RankListEntry[]> {
            const now = Date.now();
            if (!forceRefresh && this._friendRankAvatarCache && now - this._friendRankAvatarCacheAt < FRIEND_AVATAR_CACHE_TTL_MS) {
                return this._friendRankAvatarCache;
            }
        
            const wx = this.getWeChatRuntime();
            if (!wx?.getFriendCloudStorage) {
                return this._friendRankAvatarCache || [];
            }
            if (this.isWeChatDevtoolsRuntime?.()) {
                return this._friendRankAvatarCache || [];
            }
        
            try {
                const friendData: any[] = await withFriendRankTimeout(
                    new Promise((resolve, reject) => {
                        wx.getFriendCloudStorage({
                            keyList: ['score'],
                            success: (res: any) => resolve(res.data || []),
                            fail: (err: any) => reject(err),
                        });
                    }),
                    GLOBAL_RANK_FRIEND_AVATAR_TIMEOUT_MS,
                    `getFriendCloudStorage timeout after ${GLOBAL_RANK_FRIEND_AVATAR_TIMEOUT_MS}ms`,
                );
                const entries = this.normalizeFriendRankEntries(friendData)
                    .filter((entry) => !!(entry.avatarUrl || '').trim());
                this._friendRankAvatarCache = entries;
                this._friendRankAvatarCacheAt = Date.now();
                return entries;
            } catch (err) {
                console.warn('[GameCtrl] getWeChatFriendAvatarEntries failed:', err);
                return this._friendRankAvatarCache || [];
            }
        },

        getFriendAvatarFallback(entry: RankListEntry, friendEntries: RankListEntry[]): string {
            const displayName = (entry.displayName || '').trim();
            if (!displayName || !friendEntries.length) {
                return '';
            }
        
            const exactMatch = friendEntries.find((friendEntry) =>
                friendEntry.displayName === displayName &&
                friendEntry.progressLevel === entry.progressLevel &&
                !!friendEntry.avatarUrl,
            );
            if (exactMatch?.avatarUrl) {
                return exactMatch.avatarUrl;
            }
        
            const sameNameMatches = friendEntries.filter((friendEntry) =>
                friendEntry.displayName === displayName && !!friendEntry.avatarUrl,
            );
            if (sameNameMatches.length === 1) {
                return sameNameMatches[0].avatarUrl;
            }
        
            return '';
        },

        mergeFriendAvatarsIntoRankEntries<T extends RankListEntry>(entries: T[], friendEntries: RankListEntry[]): T[] {
            if (!friendEntries.length) {
                return entries;
            }
            return entries.map((entry) => {
                if ((entry.avatarUrl || '').trim()) {
                    return entry;
                }
                const avatarUrl = this.getFriendAvatarFallback(entry, friendEntries);
                return avatarUrl ? { ...entry, avatarUrl } : entry;
            });
        },

        /** 渲染好友排行行（主域兜底时复用全国榜样式） */
        renderFriendRankRows(parent: Node, entries: RankListEntry[]) {
            this.renderLeaderboardRows(parent, entries);
        },

        /** 设置排行榜滚动 */
        clearLeaderboardScroll(viewport: Node | null = this._leaderboardScrollViewport || null) {
            if (viewport?.isValid) {
                viewport.targetOff(this);
            }
            const inertiaStep = this._leaderboardScrollInertiaStep as ((dt: number) => void) | null;
            if (inertiaStep) {
                this.unschedule(inertiaStep);
            }
            this._leaderboardScrollInertiaStep = null;
            if (!viewport || this._leaderboardScrollViewport === viewport) {
                this._leaderboardScrollViewport = null;
            }
        },

        setupLeaderboardScroll(viewport: Node, content: Node, viewH: number, totalH: number) {
            this.clearLeaderboardScroll(viewport);
            this._leaderboardScrollViewport = viewport;
            if (totalH <= viewH) {
                content.setPosition(content.position.x, 0);
                return;
            }
        
            const minY = 0;
            const maxY = totalH - viewH;
            content.setPosition(content.position.x, minY);
            let lastY = 0;
            let lastMoveAt = 0;
            let velocity = 0;
            let dragging = false;
            let inertiaStep: ((dt: number) => void) | null = null;
        
            const stopInertia = () => {
                if (inertiaStep) {
                    this.unschedule(inertiaStep);
                    if (this._leaderboardScrollInertiaStep === inertiaStep) {
                        this._leaderboardScrollInertiaStep = null;
                    }
                    inertiaStep = null;
                }
                velocity = 0;
            };
            const setScrollY = (nextY: number) => {
                const clampedY = Math.max(minY, Math.min(maxY, nextY));
                content.setPosition(content.position.x, clampedY);
                return clampedY;
            };
        
            viewport.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
                stopInertia();
                lastY = e.getUILocation().y;
                lastMoveAt = Date.now();
                dragging = true;
            }, this);
        
            viewport.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
                if (!dragging) return;
                const currentY = e.getUILocation().y;
                const delta = currentY - lastY;
                const now = Date.now();
                const elapsedMs = Math.max(16, now - lastMoveAt);
                lastY = currentY;
                lastMoveAt = now;
                velocity = (delta / elapsedMs) * 1000;
                setScrollY(content.position.y + delta);
            }, this);
        
            const endDrag = () => {
                dragging = false;
                if (Math.abs(velocity) < LEADERBOARD_SCROLL_MIN_SPEED) {
                    return;
                }
                inertiaStep = (dt: number = 1 / 60) => {
                    if (!viewport.isValid || !content.isValid) {
                        stopInertia();
                        return;
                    }
                    const previousY = content.position.y;
                    const nextY = setScrollY(previousY + velocity * dt);
                    if ((nextY === minY && velocity < 0) || (nextY === maxY && velocity > 0)) {
                        stopInertia();
                        return;
                    }
                    velocity *= LEADERBOARD_SCROLL_DECAY;
                    if (Math.abs(velocity) < LEADERBOARD_SCROLL_MIN_SPEED) {
                        stopInertia();
                    }
                };
                this._leaderboardScrollInertiaStep = inertiaStep;
                this.schedule(inertiaStep, 0);
            };
            viewport.on(Node.EventType.TOUCH_END, endDrag, this);
            viewport.on(Node.EventType.TOUCH_CANCEL, endDrag, this);
        },

        /** 显示开放数据域 Canvas（微信好友排行 — SubContextView 备用方案） */
        showOpenDataCanvas(box: Node, listNode: Node) {
            const wx = this.getWeChatRuntime();
            const openDataContext = this.getWeChatOpenDataContext();
            this.deactivateWeChatFriendRank('show-open-data-reset');
            debugPerfSnapshot('friendRank.openData.start', this, {
                hasWx: !!wx,
                hasGetOpenDataContext: !!wx?.getOpenDataContext,
                hasOpenDataContext: !!openDataContext,
                hasPostMessage: !!openDataContext?.postMessage,
                hasCanvas: !!openDataContext?.canvas,
            });
        
            if (isDebugPerfTraceEnabled()) {
                runtimeLog('[GameCtrl] OpenData diagnostic:');
                runtimeLog('  wx available:', !!wx);
                runtimeLog('  getOpenDataContext available:', !!wx?.getOpenDataContext);
                runtimeLog('  openDataContext available:', !!openDataContext);
                runtimeLog('  openDataContext.postMessage available:', !!openDataContext?.postMessage);
                runtimeLog('  openDataContext.canvas available:', !!openDataContext?.canvas);
            }
        
            if (!openDataContext?.postMessage || !openDataContext?.canvas) {
                console.warn('[GameCtrl] openDataContext 不可用. wx:', !!wx, 'openDataContext:', !!openDataContext);
                debugPerfTrace('friendRank.openData.unavailable', {
                    hasWx: !!wx,
                    hasOpenDataContext: !!openDataContext,
                    hasPostMessage: !!openDataContext?.postMessage,
                    hasCanvas: !!openDataContext?.canvas,
                });
                return;
            }
        
            const host = new Node('OpenDataCanvasHost');
            host.active = false;
            listNode.addChild(host);
            host.layer = Layers.Enum.UI_2D;
            // One-time alignment with the saved nationwide viewport, not live Prefab coupling.
            host.setPosition(0, -4.933);
            const hostWidth = 596;
            const hostHeight = 580;
            host.addComponent(UITransform).setContentSize(hostWidth, hostHeight);
            const subContextView = host.addComponent(SubContextView);
            (subContextView as any)._designResolutionSize = new Size(hostWidth, hostHeight);
            subContextView.fps = FRIEND_RANK_SUBCONTEXT_FPS;
            host.active = true;
            this._friendRankOpenDataActive = true;
            debugPerfSnapshot('friendRank.openData.host.created', this, {
                hostWidth,
                hostHeight,
                fps: FRIEND_RANK_SUBCONTEXT_FPS,
            });
        
            // 触摸滚动支持：按像素滚动并补惯性，手感与常见长列表一致。
            this._friendRankScrollOffset = 0;
            this._friendRankTouchStartY = 0;
            this._friendRankLastMoveAt = 0;
            this._friendRankScrollVelocity = 0;
            host.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
                this.stopFriendRankInertia();
                this._friendRankTouchStartY = e.getUILocation().y;
                this._friendRankLastMoveAt = Date.now();
            }, this);
            host.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
                const currentY = e.getUILocation().y;
                const delta = currentY - this._friendRankTouchStartY;
                const now = Date.now();
                const elapsedMs = Math.max(16, now - this._friendRankLastMoveAt);
                this._friendRankTouchStartY = currentY;
                this._friendRankLastMoveAt = now;
                this._friendRankScrollVelocity = (delta / elapsedMs) * 1000;
                this.postFriendRankScroll(openDataContext, this._friendRankScrollOffset + delta);
            }, this);
            host.on(Node.EventType.TOUCH_END, () => {
                this._friendRankTouchStartY = 0;
                this.startFriendRankInertia(openDataContext);
            }, this);
            host.on(Node.EventType.TOUCH_CANCEL, () => {
                this._friendRankTouchStartY = 0;
                this.startFriendRankInertia(openDataContext);
            }, this);
        
            this.scheduleOnce(() => {
                openDataContext.postMessage({ type: 'init', module: 'friend_rank' });
                this.scheduleOnce(() => {
                    openDataContext.postMessage({ type: 'getFriendRankings' });
                }, 0.1);
            }, 0);
        },

        /** 加载全服排行（小游戏平台必须走云函数；本地预览不代表微信全国榜） */
        async loadGlobalLeaderboard(box: Node, listNode: Node, selfBox: Node, requestToken?: number) {
            const isCurrentRequest = () => !requestToken || this.isLeaderboardTabRequestCurrent?.(requestToken) !== false;
            selfBox.active = false;
            this.deactivateWeChatFriendRank('load-global');
            this.resetLeaderboardListState(listNode);
            setFriendRankLoadingVisible(listNode, true);
        
            const profile = UserMgr.inst.getProfile();
            void LeaderboardMgr.inst.submitProgress(profile.lastLevelId || 1, profile);
            let loadFailed = false;
            let result: LeaderboardResult = {
                source: 'local-preview',
                modeLabel: '本地预览数据',
                entries: [],
                self: null,
            };
            try {
                result = await LeaderboardMgr.inst.fetchLeaderboard(100, profile, 'global');
            } catch (err) {
                console.warn('[GameCtrl] loadGlobalLeaderboard failed:', err);
                loadFailed = true;
            }
            if (!box.isValid || !isCurrentRequest()) return;
        
            if (!profile.isGuest && !loadFailed) {
                try {
                    const friendAvatarEntries = await this.getWeChatFriendAvatarEntries();
                    if (!box.isValid || !isCurrentRequest()) return;
                    result = {
                        ...result,
                        entries: this.mergeFriendAvatarsIntoRankEntries(result.entries, friendAvatarEntries),
                        self: result.self
                            ? this.mergeFriendAvatarsIntoRankEntries([result.self], friendAvatarEntries)[0]
                            : result.self,
                    };
                } catch (err) {
                    console.warn('[GameCtrl] friend avatar merge skipped for global leaderboard:', err);
                }
            }
        
            this.resetLeaderboardListState(listNode);
            if (!loadFailed) {
                this.renderLeaderboardRows(listNode, result.entries);
            }
            this.renderLeaderboardSelfBox(selfBox, result);
        },

        getLeaderboardMedalTexture(rank: number): string {
            if (rank === 1) return 'medal_gold_rank_1';
            if (rank === 2) return 'medal_silver_rank_2';
            if (rank === 3) return 'medal_bronze_rank_3';
            return '';
        },

        renderLeaderboardRow(
            parent: Node,
            nodePrefix: string,
            entry: RankListEntry,
            y: number,
            rowIndex: number,
            options?: { badgeText?: string },
        ) {
            const badgeText = options?.badgeText ?? `${entry.rank}`;
            const displayName = entry.displayName || '微信用户';
            const existingRow = parent.getChildByName(`${nodePrefix}Row`);
            const rowTemplate = parent.getChildByName('Leaderboard3Row');
            if (!rowTemplate) {
                throw new Error('[leaderboard-prefab] missing Leaderboard3Row');
            }
            const resolvedRow = existingRow || instantiate(rowTemplate);
            if (!existingRow) {
                resolvedRow.name = `${nodePrefix}Row`;
                parent.addChild(resolvedRow);
                resolvedRow.layer = parent.layer || Layers.Enum.UI_2D;
            }
            resolvedRow.active = true;
            if (rowIndex >= 4) {
                resolvedRow.setPosition(rowTemplate.position.x, y, rowTemplate.position.z);
            }

            const rowBg = requireFriendRankNode(resolvedRow, 'RowBg').getComponent(Sprite);
            if (!rowBg?.spriteFrame) throw new Error('[leaderboard-prefab] RowBg must own its SpriteFrame');

            const badge = requireFriendRankNode(resolvedRow, 'BadgeLbl').getComponent(Label);
            if (!badge) throw new Error('[leaderboard-prefab] missing BadgeLbl label');
            badge.string = badgeText;

            const medalNode = requireFriendRankNode(resolvedRow, 'RankMedal');
            const medalSprite = medalNode.getComponent(Sprite);
            if (!medalSprite) throw new Error('[leaderboard-prefab] missing RankMedal sprite');
            const medalTexture = this.getLeaderboardMedalTexture(entry.rank);
            if (medalTexture) {
                const medalFrame = this.getSF(medalTexture);
                if (!medalFrame) throw new Error(`[leaderboard-assets] missing ${medalTexture} SpriteFrame`);
                medalSprite.spriteFrame = medalFrame;
                medalNode.active = true;
                badge.node.active = false;
            } else {
                medalNode.active = false;
                badge.node.active = true;
            }

            const avatarNode = requireFriendRankNode(resolvedRow, 'Avatar');
            this.loadAvatarToNode(entry.avatarUrl, avatarNode);

            const nameLabel = requireFriendRankNode(resolvedRow, 'Name').getComponent(Label);
            if (!nameLabel) throw new Error('[leaderboard-prefab] missing Name label');
            nameLabel.string = displayName;

            const progressLabel = requireFriendRankNode(resolvedRow, 'Progress').getComponent(Label);
            if (!progressLabel) throw new Error('[leaderboard-prefab] missing Progress label');
            progressLabel.string = `第${entry.progressLevel}关`;
        },

        renderLeaderboardRows(parent: Node, entries: RankListEntry[]) {
            this.resetLeaderboardListState(parent);
        
            if (!entries.length) {
                return;
            }
        
            const bottomPadding = 4;
        
            const viewport = parent.getChildByName('LeaderboardViewport');
            if (!viewport) throw new Error('[leaderboard-prefab] missing LeaderboardViewport');
            viewport.active = true;
            const viewportTransform = viewport.getComponent(UITransform);
            if (!viewportTransform) throw new Error('[leaderboard-prefab] LeaderboardViewport is missing UITransform');
            const viewW = viewportTransform.width || viewportTransform.contentSize.width;
            const viewportH = Math.max(1, viewportTransform.height || viewportTransform.contentSize.height);
            (viewport.getComponent(Mask) || viewport.addComponent(Mask)).type = Mask.Type.GRAPHICS_RECT;
            const content = viewport.getChildByName('LeaderboardContent');
            if (!content) throw new Error('[leaderboard-prefab] missing LeaderboardContent');
            const previewRows = [0, 1, 2, 3].map((index) => requireFriendRankNode(content, `Leaderboard${index}Row`));
            const rowPitch = previewRows[2].position.y - previewRows[3].position.y;
            if (!Number.isFinite(rowPitch) || rowPitch <= 0) {
                throw new Error('[leaderboard-prefab] third and fourth rows must have positive spacing');
            }
            const rowY = (index: number) => index < 4
                ? previewRows[index].position.y
                : previewRows[3].position.y - (index - 3) * rowPitch;
            const lastRow = previewRows[Math.min(entries.length - 1, 3)];
            const lastBg = requireFriendRankNode(lastRow, 'RowBg');
            const bgTransform = lastBg.getComponent(UITransform);
            if (!bgTransform) throw new Error('[leaderboard-prefab] RowBg is missing UITransform');
            const lastBottom = rowY(entries.length - 1) + lastBg.position.y
                - bgTransform.height * bgTransform.anchorPoint.y;
            const totalH = Math.max(viewportH, viewportH / 2 - lastBottom + bottomPadding);
            content.active = true;
            (content.getComponent(UITransform) || content.addComponent(UITransform)).setContentSize(viewW, totalH);
        
            for (let i = 0; i < entries.length; i++) {
                this.renderLeaderboardRow(content, `Leaderboard${i}`, entries[i], rowY(i), i);
            }
            for (let i = entries.length; ; i++) {
                const stale = content.getChildByName(`Leaderboard${i}Row`);
                if (!stale) break;
                stale.active = false;
            }
        
            this.setupLeaderboardScroll(viewport, content, viewportH, totalH);
        },

    });
}
