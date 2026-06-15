import {
    _decorator, Component, Node, UITransform, Sprite, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
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

function requireFriendRankNode(parent: Node, name: string): Node {
    const node = parent.getChildByName(name);
    if (!node) {
        throw new Error(`[leaderboard-prefab] missing node: ${name}`);
    }
    return node;
}

function setFriendRankPrefabLabel(parent: Node, name: string, text: string): Label {
    const node = requireFriendRankNode(parent, name);
    const label = node.getComponent(Label);
    if (!label) {
        throw new Error(`[leaderboard-prefab] missing label on ${name}`);
    }
    label.string = text;
    node.active = true;
    return label;
}

function hideLeaderboardRowTemplate(listNode: Node): void {
    const template = listNode
        .getChildByName('LeaderboardViewport')
        ?.getChildByName('LeaderboardContent')
        ?.getChildByName('LeaderboardRowTemplate');
    if (template) template.active = false;
}

export function installFriendRankModule(target: any): void {
    Object.assign(target, {
        resetLeaderboardListState(listNode: Node) {
            for (const name of [
                'FriendRankLoading',
                'FriendRankNoWx',
                'FriendRankEmpty',
                'FriendRankEmptySub',
                'FriendRankError',
                'FriendRankUnsupported',
                'FriendRankUnsupportedSub',
                'AuthHint',
                'AuthHint2',
                'OpenDataNotAvailable',
                'OpenDataDebug',
                'GlobalLoading',
                'LeaderboardEmpty',
                'LeaderboardEmptySub',
                'LeaderboardHeaderBg',
                'LeaderboardHeaderRank',
                'LeaderboardHeaderPlayer',
                'LeaderboardHeaderProgress',
            ]) {
                const node = listNode.getChildByName(name);
                if (node) node.active = false;
            }
            hideLeaderboardRowTemplate(listNode);
            const viewport = listNode.getChildByName('LeaderboardViewport');
            if (viewport) {
                viewport.active = false;
            }
            listNode.getChildByName('OpenDataCanvasHost')?.destroy();
        },

        /** 好友排行旧兜底：主域直接渲染，仅在开放数据域不可用时使用 */
        async showFriendRankList(box: Node, listNode: Node, hintNode: Node, selfBox: Node, requestToken?: number) {
            const wx = this.getWeChatRuntime();
            const isCurrentRequest = () => !requestToken || this.isLeaderboardTabRequestCurrent?.(requestToken) !== false;
            this.resetLeaderboardListState(listNode);
        
            this.setLeaderboardHintText(hintNode, 'bottom', '仅展示已提交成绩的微信好友');
        
            const loadingLabel = setFriendRankPrefabLabel(listNode, 'FriendRankLoading', '加载好友排行中...');
        
            if (!wx?.getFriendCloudStorage) {
                loadingLabel.node.active = false;
                setFriendRankPrefabLabel(listNode, 'FriendRankNoWx', '当前环境不支持好友排行');
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
                loadingLabel.node.active = false;
        
                if (!friendData || friendData.length === 0) {
                    setFriendRankPrefabLabel(listNode, 'FriendRankEmpty', '暂无好友排行数据');
                    setFriendRankPrefabLabel(listNode, 'FriendRankEmptySub', '先闯几关再回来看看');
                    return;
                }
        
                const entries = this.normalizeFriendRankEntries(friendData);
        
                this.renderFriendRankRows(listNode, entries);
            } catch (err: any) {
                console.warn('[GameCtrl] getFriendCloudStorage failed:', err);
                if (!box.isValid || !isCurrentRequest()) return;
                loadingLabel.node.active = false;
        
                const errMsg = err?.errMsg || '';
                let msg = '加载好友排行失败';
                if (errMsg.includes('privacy') || errMsg.includes('authorize')) msg = '请先同意隐私协议';
                else if (errMsg.includes('login') || errMsg.includes('not exist')) msg = '请先登录微信';
                setFriendRankPrefabLabel(listNode, 'FriendRankError', msg);
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
        
            try {
                const friendData: any[] = await new Promise((resolve, reject) => {
                    wx.getFriendCloudStorage({
                        keyList: ['score'],
                        success: (res: any) => resolve(res.data || []),
                        fail: (err: any) => reject(err),
                    });
                });
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
        setupLeaderboardScroll(viewport: Node, content: Node, viewH: number, totalH: number) {
            if (totalH <= viewH) {
                content.setPosition(content.position.x, 0);
                return;
            }
        
            const halfScroll = (totalH - viewH) / 2;
            const minY = -halfScroll;
            const maxY = halfScroll;
            content.setPosition(content.position.x, minY);
            let lastY = 0;
            let lastMoveAt = 0;
            let velocity = 0;
            let dragging = false;
            let inertiaStep: ((dt: number) => void) | null = null;
        
            const stopInertia = () => {
                if (inertiaStep) {
                    this.unschedule(inertiaStep);
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
                this.schedule(inertiaStep, 0);
            };
            viewport.on(Node.EventType.TOUCH_END, endDrag, this);
            viewport.on(Node.EventType.TOUCH_CANCEL, endDrag, this);
        },

        /** 显示开放数据域 Canvas（微信好友排行 — SubContextView 备用方案） */
        showOpenDataCanvas(box: Node, listNode: Node, hintNode: Node) {
            const wx = this.getWeChatRuntime();
            const openDataContext = this.getWeChatOpenDataContext();
            this.deactivateWeChatFriendRank('show-open-data-reset');
            this.setLeaderboardHintText(hintNode, 'bottom', '仅展示已提交成绩的微信好友');
        
            // 诊断日志
            console.log('[GameCtrl] OpenData diagnostic:');
            console.log('  wx available:', !!wx);
            console.log('  getOpenDataContext available:', !!wx?.getOpenDataContext);
            console.log('  openDataContext available:', !!openDataContext);
            console.log('  openDataContext.postMessage available:', !!openDataContext?.postMessage);
            console.log('  openDataContext.canvas available:', !!openDataContext?.canvas);
        
            if (!openDataContext?.postMessage || !openDataContext?.canvas) {
                setFriendRankPrefabLabel(listNode, 'OpenDataNotAvailable', '当前环境不支持好友排行');
                const dbg = `wx=${!!wx} openDataContext=${!!openDataContext} canvas=${!!openDataContext?.canvas}`;
                setFriendRankPrefabLabel(listNode, 'OpenDataDebug', dbg);
                console.warn('[GameCtrl] openDataContext 不可用. wx:', !!wx, 'openDataContext:', !!openDataContext);
                return;
            }
        
            const host = new Node('OpenDataCanvasHost');
            host.active = false;
            listNode.addChild(host);
            host.layer = Layers.Enum.UI_2D;
            host.setPosition(0, 0);
            const listTransform = listNode.getComponent(UITransform);
            const hostWidth = listTransform?.width || 620;
            const hostHeight = listTransform?.height || 660;
            host.addComponent(UITransform).setContentSize(hostWidth, hostHeight);
            const subContextView = host.addComponent(SubContextView);
            (subContextView as any)._designResolutionSize = new Size(hostWidth, hostHeight);
            subContextView.fps = FRIEND_RANK_SUBCONTEXT_FPS;
            host.active = true;
        
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

        /** 未授权用户在好友排行显示授权按钮 */
        addAuthButtonForGuest(box: Node, overlay: Node, listNode: Node, selfBox: Node, hintNode: Node) {
            const authHint = setFriendRankPrefabLabel(listNode, 'AuthHint', '好友排行需要微信授权').node;
            const authHint2 = setFriendRankPrefabLabel(listNode, 'AuthHint2', '点击下方按钮授权后即可查看').node;
            const authBtn = requireFriendRankNode(box, 'GuestAuthBtn');
            authBtn.active = true;
            authBtn.targetOff(this);
            authBtn.getComponent(Button) || authBtn.addComponent(Button);
            authBtn.on(Button.EventType.CLICK, async () => {
                AudioMgr.inst.play('button');
                // 将设计分辨率坐标 (720×1280) 转换为屏幕物理像素坐标
                const wxRuntime = this.getWeChatRuntime();
                const sysInfo = wxRuntime.getWindowInfo?.() || wxRuntime.getSystemInfoSync?.() || {};
                const designWidth = 720;
                const designHeight = 1280;
                // authBtn 在 box 中的位置: (0, -40)，contentSize: 320×56
                // box 中心在排行榜面板中心 (0, 0) 即屏幕中心
                // Cocos Y-up: -40 表示在中心下方 40px
                // 屏幕 Y-down: 按钮中心 Y = 640 + 40 = 680
                // 设计分辨率下按钮左上角: (360-160, 680-28) = (200, 652)
                // 转换为物理像素
                const scaleX = sysInfo.windowWidth / designWidth;
                const scaleY = sysInfo.windowHeight / designHeight;
                const btnScreenX = 200 * scaleX;
                const btnScreenY = 652 * scaleY;
                const btnScreenW = 320 * scaleX;
                const btnScreenH = 56 * scaleY;
                const ok = await UserMgr.inst.createUserInfoButton(btnScreenX, btnScreenY, btnScreenW, btnScreenH);
                if (!box.isValid) return;
                authBtn.active = false;
                authHint.active = false;
                authHint2.active = false;
                if (ok) {
                    await this.loadWeChatFriendLeaderboard(box, listNode, hintNode, selfBox);
                } else {
                    this.loadGlobalLeaderboard(box, listNode, selfBox, hintNode);
                }
            }, this);
        },

        /** 加载全服排行（云函数 → 本地兜底） */
        async loadGlobalLeaderboard(box: Node, listNode: Node, selfBox: Node, hintNode: Node, requestToken?: number) {
            const isCurrentRequest = () => !requestToken || this.isLeaderboardTabRequestCurrent?.(requestToken) !== false;
            this.clearLeaderboardAuthButtons(box);
            this.deactivateWeChatFriendRank('load-global');
            this.resetLeaderboardListState(listNode);
            const loadingLabel = setFriendRankPrefabLabel(listNode, 'GlobalLoading', '加载中...');
        
            const profile = UserMgr.inst.getProfile();
            await LeaderboardMgr.inst.submitProgress(profile.lastLevelId || 1, profile);
            if (!box.isValid || !isCurrentRequest()) return;
            let result = await LeaderboardMgr.inst.fetchLeaderboard(100, profile, 'global');
            if (!box.isValid || !isCurrentRequest()) return;
        
            if (!profile.isGuest) {
                const friendAvatarEntries = await this.getWeChatFriendAvatarEntries();
                if (!box.isValid || !isCurrentRequest()) return;
                result = {
                    ...result,
                    entries: this.mergeFriendAvatarsIntoRankEntries(result.entries, friendAvatarEntries),
                    self: result.self
                        ? this.mergeFriendAvatarsIntoRankEntries([result.self], friendAvatarEntries)[0]
                        : result.self,
                };
            }
        
            loadingLabel.node.active = false;
        
            this.setLeaderboardHintText(hintNode, 'top', result.source === 'wechat-cloud' && result.entries.length === 0
                ? '云端排行榜暂时为空'
                : '');
        
            this.resetLeaderboardListState(listNode);
            this.renderLeaderboardRows(listNode, result.entries);
            this.renderLeaderboardSelfBox(selfBox, result);
        },

        /** 显示微信授权按钮（保留，用于全服排行的昵称授权） */
        showAuthButton(box: Node, overlay: Node, listNode: Node, selfBox: Node, hintNode: Node) {
            const authBtn = requireFriendRankNode(box, 'AuthBtn');
            authBtn.active = true;
            authBtn.targetOff(this);
            authBtn.getComponent(Button) || authBtn.addComponent(Button);
            authBtn.on(Button.EventType.CLICK, async () => {
                AudioMgr.inst.play('button');
                // 将设计分辨率坐标转换为屏幕物理像素坐标
                const wxRuntime = this.getWeChatRuntime();
                const sysInfo = wxRuntime.getWindowInfo?.() || wxRuntime.getSystemInfoSync?.() || {};
                const designWidth = 720;
                const designHeight = 1280;
                // authBtn 在 box 中的位置: (0, 115)，contentSize: 300×60
                // Cocos Y-up: 115 表示在中心上方 115px
                // 屏幕 Y-down: 按钮中心 Y = 640 - 115 = 525
                // 屏幕左上角: (360-150, 525-30) = (210, 495)
                const scaleX = sysInfo.windowWidth / designWidth;
                const scaleY = sysInfo.windowHeight / designHeight;
                const ok = await UserMgr.inst.createUserInfoButton(210 * scaleX, 495 * scaleY, 300 * scaleX, 60 * scaleY);
                if (!overlay.isValid) return;
                if (ok) {
                    // 授权成功后提交一次进度以更新头像到云端
                    const profile = UserMgr.inst.getProfile();
                    const lvl = profile.lastLevelId || 1;
                    void LeaderboardMgr.inst.submitProgress(lvl, profile);
                    // 重新加载排行榜
                    authBtn.active = false;
                    this.loadGlobalLeaderboard(box, listNode, selfBox, hintNode);
                } else {
                    // 授权失败，隐藏按钮，显示普通内容
                    authBtn.active = false;
                    this.loadGlobalLeaderboard(box, listNode, selfBox, hintNode);
                }
            }, this);
        
            const skipBtn = requireFriendRankNode(box, 'SkipAuthBtn');
            skipBtn.active = true;
            skipBtn.targetOff(this);
            skipBtn.getComponent(Button) || skipBtn.addComponent(Button);
            skipBtn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                if (!overlay.isValid) return;
                authBtn.active = false;
                skipBtn.active = false;
                this.loadGlobalLeaderboard(box, listNode, selfBox, hintNode);
            }, this);
        },

        getLeaderboardRowTexture(rank: number): string {
            return 'popup_list_row_bg';
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
            const rowTemplate = parent.getChildByName('LeaderboardRowTemplate');
            if (!rowTemplate) {
                throw new Error('[leaderboard-prefab] missing LeaderboardRowTemplate');
            }
            rowTemplate.active = false;
            const resolvedRow = existingRow || instantiate(rowTemplate);
            if (!existingRow) {
                resolvedRow.name = `${nodePrefix}Row`;
                parent.addChild(resolvedRow);
                resolvedRow.layer = parent.layer || Layers.Enum.UI_2D;
            }
            resolvedRow.active = true;
            resolvedRow.setPosition(rowTemplate.position.x, y, rowTemplate.position.z);

            const badge = requireFriendRankNode(resolvedRow, 'BadgeLbl').getComponent(Label);
            if (!badge) throw new Error('[leaderboard-prefab] missing BadgeLbl label');
            badge.string = badgeText;

            const avatarNode = requireFriendRankNode(resolvedRow, 'Avatar');
            const avatarSize = avatarNode.getComponent(UITransform)?.contentSize;
            this.loadAvatarToNode(entry.avatarUrl, avatarNode, avatarSize?.width || 44, avatarSize?.height || 44, displayName);

            const nameLabel = requireFriendRankNode(resolvedRow, 'Name').getComponent(Label);
            if (!nameLabel) throw new Error('[leaderboard-prefab] missing Name label');
            nameLabel.string = displayName;

            const progressLabel = requireFriendRankNode(resolvedRow, 'Progress').getComponent(Label);
            if (!progressLabel) throw new Error('[leaderboard-prefab] missing Progress label');
            progressLabel.string = `第${entry.progressLevel}关`;
        },

        renderLeaderboardRows(parent: Node, entries: RankListEntry[]) {
            this.resetLeaderboardListState(parent);
            hideLeaderboardRowTemplate(parent);
        
            if (!entries.length) {
                setFriendRankPrefabLabel(parent, 'LeaderboardEmpty', '暂无排行数据');
                setFriendRankPrefabLabel(parent, 'LeaderboardEmptySub', '先闯几关再回来看看');
                return;
            }
        
            const rowPitch = 84;
            const rowHeight = 78;
            const topPadding = 18;
            const bottomPadding = 8;

            const headerBg = requireFriendRankNode(parent, 'LeaderboardHeaderBg');
            headerBg.active = true;
            headerBg.setSiblingIndex(0);
            setFriendRankPrefabLabel(parent, 'LeaderboardHeaderRank', '排名');
            setFriendRankPrefabLabel(parent, 'LeaderboardHeaderPlayer', '玩家');
            setFriendRankPrefabLabel(parent, 'LeaderboardHeaderProgress', '进度');
        
            const viewport = parent.getChildByName('LeaderboardViewport');
            if (!viewport) throw new Error('[leaderboard-prefab] missing LeaderboardViewport');
            viewport.active = true;
            const viewportTransform = viewport.getComponent(UITransform);
            if (!viewportTransform) throw new Error('[leaderboard-prefab] LeaderboardViewport is missing UITransform');
            const viewW = viewportTransform.width || viewportTransform.contentSize.width;
            const viewportH = Math.max(1, viewportTransform.height || viewportTransform.contentSize.height);
            (viewport.getComponent(Mask) || viewport.addComponent(Mask)).type = Mask.Type.GRAPHICS_RECT;
            const totalH = Math.max(viewportH, topPadding + bottomPadding + entries.length * rowPitch);

            const content = viewport.getChildByName('LeaderboardContent');
            if (!content) throw new Error('[leaderboard-prefab] missing LeaderboardContent');
            content.active = true;
            (content.getComponent(UITransform) || content.addComponent(UITransform)).setContentSize(viewW, totalH);
        
            const startY = totalH / 2 - topPadding - rowHeight / 2;
            for (let i = 0; i < entries.length; i++) {
                this.renderLeaderboardRow(content, `Leaderboard${i}`, entries[i], startY - i * rowPitch, i);
            }
            for (let i = entries.length; ; i++) {
                const stale = content.getChildByName(`Leaderboard${i}Row`);
                if (!stale) break;
                stale.active = false;
            }
        
            this.setupLeaderboardScroll(viewport, content, viewportH, totalH);
        },

        clearLeaderboardAuthButtons(box: Node) {
            const authBtn = box.getChildByName('AuthBtn');
            const guestAuthBtn = box.getChildByName('GuestAuthBtn');
            const skipBtn = box.getChildByName('SkipAuthBtn');
            if (authBtn) {
                authBtn.targetOff(this);
                authBtn.active = false;
            }
            if (guestAuthBtn) {
                guestAuthBtn.targetOff(this);
                guestAuthBtn.active = false;
            }
            if (skipBtn) {
                skipBtn.targetOff(this);
                skipBtn.active = false;
            }
        },
    });
}
