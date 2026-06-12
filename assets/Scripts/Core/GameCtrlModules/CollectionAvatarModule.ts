import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Prefab, instantiate, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel,
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
import { ensureCollectionPanelController } from '../Panels/CollectionPanelController';

function getRankTextColor(rank: number): Color {
    if (rank === 1) return new Color('#D99A16');
    if (rank === 2) return new Color('#6D7F9C');
    if (rank === 3) return new Color('#B97845');
    return new Color('#5A4A3A');
}

function syncCollectionAvatarLabelNode(
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
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
    node.active = true;
    return label;
}

function getCollectionPreviewColor(colorId: number, grayscale: boolean): Color {
    const base = new Color(COLOR_HEX[colorId] || '#CCCCCC');
    if (!grayscale) return base;
    const luma = Math.round(base.r * 0.299 + base.g * 0.587 + base.b * 0.114);
    const softened = Math.max(118, Math.min(218, Math.round(luma * 0.58 + 92)));
    return new Color(softened, softened, softened, 190);
}

export function installCollectionAvatarModule(target: any): void {
    Object.assign(target, {
        /** 从 URL 加载头像到节点 */
        loadAvatarToNode(
            url: string,
            node: Node,
            w: number,
            h: number,
            displayName: string = '',
            options?: { hideFallbackWhenUrlExists?: boolean; hideFallback?: boolean },
        ) {
            const spriteNodeName = 'AvatarSpriteNode';
            let spriteNode = node.getChildByName(spriteNodeName);
            if (!spriteNode) {
                spriteNode = new Node(spriteNodeName);
                node.addChild(spriteNode);
                spriteNode.layer = Layers.Enum.UI_2D;
                spriteNode.setPosition(0, 0);
                spriteNode.addComponent(UITransform).setContentSize(w, h);
            }
            const sp = spriteNode.getComponent(Sprite) || spriteNode.addComponent(Sprite);
            sp.type = Sprite.Type.SIMPLE;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            const ut = spriteNode.getComponent(UITransform);
            if (ut) ut.setContentSize(w, h);
            sp.spriteFrame = null;
            const trimmedName = (displayName || '').trim();
            const shouldHideFallback = !!options?.hideFallback;
            const shouldHideFallbackWhenUrlExists = !!options?.hideFallbackWhenUrlExists;
            const hasAvatarUrl = !!(url || '').trim();
            const fallbackInitial = trimmedName.startsWith('游客')
                ? '游'
                : (trimmedName.charAt(0) || '?');
            const fallbackNodeName = 'AvatarFallbackInitial';
            const ensureFallback = () => {
                let labelNode = node.getChildByName(fallbackNodeName);
                if (!labelNode) {
                    labelNode = new Node(fallbackNodeName);
                    node.addChild(labelNode);
                    labelNode.layer = Layers.Enum.UI_2D;
                }
                const labelTransform = labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform);
                const innerSize = Math.max(24, Math.floor(Math.min(w, h) * 0.76));
                labelTransform.setContentSize(innerSize, innerSize);
                labelNode.setPosition(0, 0);
                let label = labelNode.getComponent(Label);
                if (!label) {
                    label = labelNode.addComponent(Label);
                }
                label.string = fallbackInitial;
                label.fontSize = Math.max(18, Math.floor(Math.min(w, h) * 0.5));
                label.lineHeight = label.fontSize;
                label.color = new Color('#5A4A3A');
                label.horizontalAlign = Label.HorizontalAlign.CENTER;
                label.verticalAlign = Label.VerticalAlign.CENTER;
                label.overflow = Label.Overflow.SHRINK;
                return labelNode;
            };
            const clearFallback = () => {
                node.getChildByName(fallbackNodeName)?.destroy();
            };
            const applySpriteFrame = (frame: SpriteFrame | null) => {
                if (!node.isValid) return;
                if (!frame) {
                    sp.spriteFrame = null;
                    if (shouldHideFallback || (hasAvatarUrl && shouldHideFallbackWhenUrlExists)) {
                        clearFallback();
                    } else {
                        ensureFallback();
                    }
                    return;
                }
                sp.spriteFrame = frame;
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                if (ut) ut.setContentSize(w, h);
                clearFallback();
            };
        
            if (shouldHideFallback || (hasAvatarUrl && shouldHideFallbackWhenUrlExists)) {
                clearFallback();
            } else {
                ensureFallback();
            }
        
            if (!url) {
                return;
            }
        
            const cachedFrame = leaderboardAvatarFrameCache.get(url);
            if (cachedFrame) {
                applySpriteFrame(cachedFrame);
                return;
            }
        
            const pendingLoads = leaderboardAvatarPendingLoads.get(url);
            if (pendingLoads) {
                pendingLoads.push(applySpriteFrame);
                return;
            }
            leaderboardAvatarPendingLoads.set(url, [applySpriteFrame]);
        
            let settled = false;
            const finishLoad = (frame: SpriteFrame | null) => {
                if (settled) return;
                settled = true;
                if (frame) {
                    leaderboardAvatarFrameCache.set(url, frame);
                    while (leaderboardAvatarFrameCache.size > MAX_LEADERBOARD_AVATAR_FRAMES) {
                        const oldestKey = leaderboardAvatarFrameCache.keys().next().value;
                        if (!oldestKey) break;
                        const oldestFrame = leaderboardAvatarFrameCache.get(oldestKey) || null;
                        leaderboardAvatarFrameCache.delete(oldestKey);
                        try {
                            oldestFrame?.texture?.destroy();
                            oldestFrame?.destroy();
                        } catch (err) {
                            console.warn('[Avatar] cache trim destroy failed:', err);
                        }
                    }
                }
                const waiters = leaderboardAvatarPendingLoads.get(url) || [];
                leaderboardAvatarPendingLoads.delete(url);
                for (const waiter of waiters) {
                    waiter(frame);
                }
                finishLeaderboardAvatarLoad();
            };
            const buildSpriteFrameFromCanvas = (canvas: HTMLCanvasElement | any): SpriteFrame | null => {
                try {
                    const imageAsset = new ImageAsset(canvas);
                    const width = imageAsset.width || canvas?.width || 0;
                    const height = imageAsset.height || canvas?.height || 0;
                    if (!width || !height) {
                        return null;
                    }
                    const texture = new Texture2D();
                    texture.image = imageAsset;
                    const frame = new SpriteFrame();
                    frame.texture = texture;
                    frame.rect = new Rect(0, 0, width, height);
                    return frame;
                } catch (err) {
                    console.warn('[Avatar] canvas sprite frame build failed:', err);
                    return null;
                }
            };
            const createAvatarCanvas = (width: number, height: number): HTMLCanvasElement | any | null => {
                try {
                    const doc = typeof document !== 'undefined' ? (document as any) : null;
                    if (doc?.createElement) {
                        const canvas = doc.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        return canvas;
                    }
                } catch (err) {
                    console.warn('[Avatar] document canvas create failed:', err);
                }
        
                try {
                    const wxCanvas = typeof wx?.createOffscreenCanvas === 'function'
                        ? wx.createOffscreenCanvas({ type: '2d', width, height })
                        : null;
                    if (wxCanvas) {
                        wxCanvas.width = width;
                        wxCanvas.height = height;
                        return wxCanvas;
                    }
                } catch (err) {
                    console.warn('[Avatar] offscreen canvas create failed:', err);
                }
        
                return null;
            };
            const makeSpriteFrame = (source: ImageAsset | any): SpriteFrame | null => {
                try {
                    if (source instanceof ImageAsset) {
                        const width = source.width || source?.image?.width || 0;
                        const height = source.height || source?.image?.height || 0;
                        if (!width || !height) {
                            return null;
                        }
                        const texture = new Texture2D();
                        texture.image = source;
                        const frame = new SpriteFrame();
                        frame.texture = texture;
                        frame.rect = new Rect(0, 0, width, height);
                        return frame;
                    }
        
                    const width = source?.width || 0;
                    const height = source?.height || 0;
                    if (!width || !height) {
                        return null;
                    }
        
                    const canvas = createAvatarCanvas(width, height);
                    if (canvas) {
                        const ctx = canvas.getContext?.('2d');
                        if (ctx) {
                            ctx.clearRect(0, 0, width, height);
                            ctx.drawImage(source, 0, 0, width, height);
                            const frameFromCanvas = buildSpriteFrameFromCanvas(canvas);
                            if (frameFromCanvas) {
                                return frameFromCanvas;
                            }
                        }
                    }
        
                    const imageAsset = new ImageAsset(source);
                    const texture = new Texture2D();
                    texture.image = imageAsset;
                    const frame = new SpriteFrame();
                    frame.texture = texture;
                    frame.rect = new Rect(0, 0, width, height);
                    return frame;
                } catch (err) {
                    console.warn('[Avatar] sprite frame build failed:', err);
                    return null;
                }
            };
            const loadRemoteFrame = () => {
                assetManager.loadRemote<ImageAsset>(url, (err, imgAsset) => {
                    if (err || !imgAsset) {
                        console.warn('[Avatar] loadRemote failed:', err);
                        finishLoad(null);
                        return;
                    }
                    finishLoad(makeSpriteFrame(imgAsset));
                });
            };
        
            const wx = this.getWeChatRuntime();
            const tryLoadWithWeChatImage = (src: string, onError: () => void): boolean => {
                const createImage = typeof wx?.createImage === 'function' ? wx.createImage.bind(wx) : null;
                if (!createImage) {
                    return false;
                }
        
                try {
                    const img = createImage();
                    img.onload = () => {
                        const frame = makeSpriteFrame(img);
                        if (frame) {
                            finishLoad(frame);
                            return;
                        }
                        onError();
                    };
                    img.onerror = (err: any) => {
                        console.warn('[Avatar] wx image load failed:', err?.errMsg || err);
                        onError();
                    };
                    img.src = src;
                    return true;
                } catch (err) {
                    console.warn('[Avatar] wx image assign failed:', err);
                    return false;
                }
            };
        
            enqueueLeaderboardAvatarLoad(url, () => {
                if (wx?.downloadFile) {
                    wx.downloadFile({
                        url,
                        success: (res: any) => {
                            if (res.statusCode === 200 && res.tempFilePath) {
                                if (tryLoadWithWeChatImage(res.tempFilePath, loadRemoteFrame)) {
                                    return;
                                }
                            } else {
                                console.warn('[Avatar] downloadFile statusCode:', res.statusCode);
                            }
        
                            if (tryLoadWithWeChatImage(url, loadRemoteFrame)) {
                                return;
                            }
                            loadRemoteFrame();
                        },
                        fail: (err: any) => {
                            console.warn('[Avatar] downloadFile failed:', err);
                            if (tryLoadWithWeChatImage(url, loadRemoteFrame)) {
                                return;
                            }
                            loadRemoteFrame();
                        },
                    });
                    return;
                }
        
                if (tryLoadWithWeChatImage(url, loadRemoteFrame)) {
                    return;
                }
                loadRemoteFrame();
            });
        },

        renderLeaderboardSelfBox(parent: Node, result: LeaderboardResult) {
            const profile = UserMgr.inst.getProfile();
            const progressLevel = result.self?.progressLevel || profile.lastLevelId || 1;
            const resolvedRank = Number(result.self?.rank) > 0 ? Math.floor(Number(result.self?.rank)) : 0;
            const selfEntry: RankListEntry = {
                rank: resolvedRank,
                displayName: result.self?.displayName || profile.displayName,
                avatarUrl: result.self?.avatarUrl || profile.avatarUrl,
                progressLevel,
            };
            this.renderLeaderboardSelfEntry(parent, selfEntry);
        },

        estimateRankByProgress(entries: Array<Pick<RankListEntry, 'progressLevel'>>, progressLevel: number): number {
            const normalizedProgress = Math.max(1, Math.floor(Number(progressLevel) || 1));
            const higherCount = entries.filter((entry) => (Math.floor(Number(entry.progressLevel) || 0)) > normalizedProgress).length;
            return higherCount + 1;
        },

        async buildFriendSelfEntry(profile: ReturnType<typeof UserMgr.inst.getProfile>): Promise<RankListEntry> {
            const progressLevel = profile.lastLevelId || 1;
            const selfEntry: RankListEntry = {
                rank: 0,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
                progressLevel,
            };
            const wx = this.getWeChatRuntime();
            if (!wx?.getFriendCloudStorage) return selfEntry;
        
            try {
                await new Promise((resolve, reject) => {
                    wx.getFriendCloudStorage({
                        keyList: ['score'],
                        success: () => resolve(true),
                        fail: (err: any) => reject(err),
                    });
                });
                selfEntry.rank = 0;
            } catch (err) {
                console.warn('[GameCtrl] buildFriendSelfEntry failed:', err);
            }
            return selfEntry;
        },

        /** 好友排行中显示自己的成绩（授权后调用） */
        async renderSelfInFriendRank(parent: Node, profile: ReturnType<typeof UserMgr.inst.getProfile>) {
            const selfEntry = await this.buildFriendSelfEntry(profile);
            if (!parent.isValid) return;
            this.renderLeaderboardSelfEntry(parent, selfEntry);
        },

        renderLeaderboardSelfEntry(parent: Node, entry: RankListEntry) {
            const displayName = entry.displayName || '微信用户';
            const rankText = entry.rank > 0 ? `第${entry.rank}名` : '未上榜';
            const progressLevel = Math.max(1, Math.floor(Number(entry.progressLevel) || 1));
            const rankColumnX = -218;
            const avatarColumnX = -139;
            const nameColumnX = -2;
            const progressColumnX = 166;
            const rowCenterY = 0;
        
            const parentTransform = parent.getComponent(UITransform);
            const frameW = parentTransform?.width || 596;
            const frameH = parentTransform?.height || 76;
            parentTransform?.setContentSize(frameW, frameH);
            const staleInlineTitle = parent.getChildByName('LeaderboardSelfTagLabel');
            if (staleInlineTitle) staleInlineTitle.active = false;
            const titleParent = parent.parent || parent;
            const titleX = parent.position.x - 218;
            const titleY = parent.position.y + frameH / 2 + 22;
            const titleLabel = syncCollectionAvatarLabelNode(titleParent, 'LeaderboardSelfTitleLabel', '我的成绩', 20, new Color('#7C5A2E'), 130, 28, titleX, titleY);
            titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

            const badgeLabel = syncCollectionAvatarLabelNode(parent, 'LeaderboardSelfBadgeLbl', rankText, 20, getRankTextColor(entry.rank), 74, 30, rankColumnX, rowCenterY);
            badgeLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            badgeLabel.overflow = Label.Overflow.SHRINK;

            const existingAvatar = parent.getChildByName('LeaderboardSelfAvatar');
            const resolvedAvatarNode = existingAvatar || new Node('LeaderboardSelfAvatar');
            if (!existingAvatar) {
                parent.addChild(resolvedAvatarNode);
                resolvedAvatarNode.layer = parent.layer || Layers.Enum.UI_2D;
            }
            (resolvedAvatarNode.getComponent(UITransform) || resolvedAvatarNode.addComponent(UITransform)).setContentSize(44, 44);
            resolvedAvatarNode.setPosition(avatarColumnX, rowCenterY, 0);
            this.loadAvatarToNode(entry.avatarUrl, resolvedAvatarNode, 44, 44, displayName, {
                hideFallback: true,
            });
        
            const nameLabel = syncCollectionAvatarLabelNode(parent, 'LeaderboardSelfName', displayName, 19, new Color('#4C331D'), 190, 30, nameColumnX, rowCenterY, Label.HorizontalAlign.LEFT);
            nameLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
            nameLabel.overflow = Label.Overflow.SHRINK;
        
            const progressLabel = syncCollectionAvatarLabelNode(parent, 'LeaderboardSelfProgress', `第${progressLevel}关`, 19, new Color('#5E4326'), 118, 30, progressColumnX, rowCenterY);
            progressLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            progressLabel.overflow = Label.Overflow.SHRINK;
        },

        // ==================== 图鉴 ====================
        
        collectAllLevelIds(): number[] {
            const ids: number[] = [];
            for (let i = 1; i <= (this.constructor as any).COLLECTION_MAIN_LEVEL_COUNT; i++) ids.push(i);
            for (let i = (this.constructor as any).COLLECTION_SPECIAL_LEVEL_START; i <= (this.constructor as any).COLLECTION_SPECIAL_LEVEL_END; i++) ids.push(i);
            return ids;
        },

        openCollection() {
            return ensureCollectionPanelController(this).open();
        },

        renderCollectionScroll(contentNode?: Node) {
            const viewport = contentNode || this._collectionContentNode;
            if (!viewport) return null;
            const viewportUi = viewport.getComponent(UITransform);
            if (!viewportUi) {
                throw new Error('[collection-scroll] CollContent is missing UITransform');
            }

            const guideSlots = viewport.children
                .filter((child: Node) => /^CollectionCardSlot_\d+$/.test(child.name))
                .sort((a: Node, b: Node) => {
                    const aIdx = Number(a.name.match(/\d+$/)?.[0] || 0);
                    const bIdx = Number(b.name.match(/\d+$/)?.[0] || 0);
                    return aIdx - bIdx;
                });
            const template = guideSlots[0];
            const templateUi = template?.getComponent(UITransform);
            if (!template || !templateUi) {
                throw new Error('[collection-scroll] missing CollectionCardSlot_0 template');
            }

            const oldScrollContent = viewport.getChildByName('CollectionScrollContent');
            if (oldScrollContent) {
                oldScrollContent.removeFromParent();
                oldScrollContent.destroy();
            }

            const mask = viewport.getComponent(Mask) || viewport.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_RECT;

            const rowYs: number[] = Array.from(new Set<number>(guideSlots.map((slot: Node) => Math.round(slot.position.y * 10) / 10)))
                .sort((a: number, b: number) => b - a);
            const topY = rowYs[0] ?? template.position.y;
            const topRowSlots = guideSlots
                .filter((slot: Node) => Math.abs(slot.position.y - topY) < 1)
                .sort((a: Node, b: Node) => a.position.x - b.position.x);
            const columnXs = topRowSlots.length
                ? topRowSlots.map((slot: Node) => slot.position.x)
                : [template.position.x];
            const rowPitch = rowYs.length > 1
                ? Math.max(1, Math.abs(rowYs[0] - rowYs[1]))
                : Math.max(1, templateUi.height + 16);
            const viewportH = viewportUi.height || viewportUi.contentSize.height;
            const viewportW = viewportUi.width || viewportUi.contentSize.width;
            const bottomY = rowYs.length > 1 ? rowYs[rowYs.length - 1] : topY;
            const topPadding = Math.max(0, viewportH / 2 - topY);
            const bottomPadding = rowYs.length > 1 ? Math.max(0, viewportH / 2 + bottomY) : topPadding;

            const allIds = (this._collectionLevelIds?.length ? this._collectionLevelIds : this.collectAllLevelIds()) as number[];
            const savedLevel = this.getSavedLevel();
            const columnCount = Math.max(1, columnXs.length);
            const rowCount = Math.max(1, Math.ceil(allIds.length / columnCount));
            const totalH = Math.max(viewportH, topPadding + Math.max(0, rowCount - 1) * rowPitch + bottomPadding);
            const startY = totalH / 2 - topPadding;

            const scrollContent = new Node('CollectionScrollContent');
            scrollContent.layer = viewport.layer || Layers.Enum.UI_2D;
            viewport.addChild(scrollContent);
            scrollContent.addComponent(UITransform).setContentSize(viewportW, totalH);

            for (const guideSlot of guideSlots) {
                guideSlot.active = false;
            }

            this._collectionPreviewItems = [];
            this._collectionPreviewRowPitch = rowPitch;
            this._collectionPreviewBufferRows = 2;

            for (let idx = 0; idx < allIds.length; idx++) {
                const slot = instantiate(template);
                const levelId = allIds[idx];
                const row = Math.floor(idx / columnCount);
                const col = idx % columnCount;
                const unlocked = levelId <= savedLevel;
                slot.name = `CollectionCardSlotItem_${idx}`;
                slot.active = true;
                slot.layer = scrollContent.layer;
                scrollContent.addChild(slot);
                slot.setPosition(columnXs[col], startY - row * rowPitch, 0);
                const previewInfo = this.drawCollectionCard(slot, levelId, 0, 0, 0, 0, unlocked, savedLevel, {
                    deferPreview: true,
                    lockedPreviewGrayscale: true,
                });
                this._collectionPreviewItems.push({
                    slot,
                    levelId,
                    row,
                    unlocked,
                    rendered: false,
                    card: previewInfo?.card || slot.getChildByName('Card'),
                    previewX: previewInfo?.previewX ?? 0,
                    previewY: previewInfo?.previewY ?? 18,
                    previewW: previewInfo?.previewW ?? Math.max(1, templateUi.width - 56),
                    previewH: previewInfo?.previewH ?? Math.max(1, templateUi.height - 82),
                    grayscale: !unlocked,
                });
            }

            this._collectionContentNode = viewport;
            this._collectionScrollContentNode = scrollContent;
            this._collectionTotalPages = 1;
            this._collectionPage = 0;
            this.setupCollectionScroll(viewport, scrollContent, viewportH, totalH, rowPitch);
            this.renderCollectionVisiblePreviews(viewport, scrollContent, viewportH, rowPitch, 2);
            return scrollContent;
        },

        renderCollectionVisiblePreviews(viewport?: Node, content?: Node, viewH?: number, rowPitch?: number, bufferRows: number = 2) {
            const resolvedViewport = viewport || this._collectionContentNode;
            const resolvedContent = content || this._collectionScrollContentNode;
            const items = this._collectionPreviewItems as Array<any>;
            if (!resolvedViewport || !resolvedContent || !Array.isArray(items) || items.length === 0) return;
            const viewportUi = resolvedViewport.getComponent(UITransform);
            const resolvedViewH = Math.max(1, viewH || viewportUi?.height || viewportUi?.contentSize.height || 1);
            const resolvedRowPitch = Math.max(1, rowPitch || this._collectionPreviewRowPitch || 1);
            const resolvedBufferRows = Math.max(0, Math.floor(Number(bufferRows) || 0));
            const bufferPx = resolvedRowPitch * resolvedBufferRows;
            const minY = -resolvedViewH / 2 - bufferPx - resolvedContent.position.y;
            const maxY = resolvedViewH / 2 + bufferPx - resolvedContent.position.y;

            for (const item of items) {
                if (!item || item.rendered || !item.slot?.isValid || !item.card?.isValid) continue;
                const slotY = item.slot.position.y;
                if (slotY < minY || slotY > maxY) continue;
                item.rendered = true;
                this.drawCollectionPixelPreviewOnCard(
                    item.card,
                    item.levelId,
                    item.previewX,
                    item.previewY,
                    item.previewW,
                    item.previewH,
                    'level_',
                    { grayscale: !!item.grayscale },
                );
            }
        },

        setupCollectionScroll(viewport: Node, content: Node, viewH: number, totalH: number, rowPitch: number = 0) {
            viewport.targetOff(this);
            if (this._collectionScrollInertiaStep) {
                this.unschedule(this._collectionScrollInertiaStep);
                this._collectionScrollInertiaStep = null;
            }
            this._collectionScrollDragging = false;
            this._collectionScrollMoved = false;
            this._collectionScrollSuppressClick = false;

            if (totalH <= viewH + 1) {
                content.setPosition(content.position.x, 0, 0);
                return;
            }

            const halfScroll = (totalH - viewH) / 2;
            const minY = -halfScroll;
            const maxY = halfScroll;
            const dragThreshold = 8;
            content.setPosition(content.position.x, minY, 0);
            let lastY = 0;
            let lastMoveAt = 0;
            let velocity = 0;
            let dragging = false;
            let inertiaStep: ((dt: number) => void) | null = null;
            const renderPreviewWindow = () => {
                this.renderCollectionVisiblePreviews(viewport, content, viewH, rowPitch, 2);
            };

            const stopInertia = () => {
                if (inertiaStep) {
                    this.unschedule(inertiaStep);
                    inertiaStep = null;
                }
                if (this._collectionScrollInertiaStep) {
                    this.unschedule(this._collectionScrollInertiaStep);
                    this._collectionScrollInertiaStep = null;
                }
                velocity = 0;
            };
            const setScrollY = (nextY: number) => {
                const clampedY = Math.max(minY, Math.min(maxY, nextY));
                content.setPosition(content.position.x, clampedY, 0);
                renderPreviewWindow();
                return clampedY;
            };
            const endDrag = () => {
                dragging = false;
                this._collectionScrollDragging = false;
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
                this._collectionScrollInertiaStep = inertiaStep;
                this.schedule(inertiaStep, 0);
            };

            viewport.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
                stopInertia();
                const y = e.getUILocation().y;
                this._collectionScrollStartY = y;
                this._collectionScrollDragging = true;
                this._collectionScrollMoved = false;
                this._collectionScrollSuppressClick = false;
                lastY = y;
                lastMoveAt = Date.now();
                velocity = 0;
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
                if (Math.abs(currentY - this._collectionScrollStartY) > dragThreshold) {
                    this._collectionScrollMoved = true;
                    this._collectionScrollSuppressClick = true;
                }
                setScrollY(content.position.y + delta);
            }, this);

            viewport.on(Node.EventType.TOUCH_END, endDrag, this);
            viewport.on(Node.EventType.TOUCH_CANCEL, endDrag, this);
        },

        getCollectionPreviewBounds(grid: number[][]) {
            let minRow = Number.MAX_SAFE_INTEGER;
            let maxRow = -1;
            let minCol = Number.MAX_SAFE_INTEGER;
            let maxCol = -1;
        
            for (let r = 0; r < grid.length; r++) {
                const row = grid[r];
                for (let c = 0; c < row.length; c++) {
                    if (!row[c]) continue;
                    minRow = Math.min(minRow, r);
                    maxRow = Math.max(maxRow, r);
                    minCol = Math.min(minCol, c);
                    maxCol = Math.max(maxCol, c);
                }
            }
        
            if (maxRow < 0 || maxCol < 0) return null;
            return { minRow, maxRow, minCol, maxCol };
        },

        drawCollectionPatternOnCard(
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
            this.drawLevelPreviewOnCard(card, levelId, offsetX, offsetY, maxW, maxH, prefix, options);
        },

        drawBeanPreviewGrid(
            parent: Node,
            correctArr: number[][],
            bw: number,
            bh: number,
            offsetX: number,
            offsetY: number,
            maxW: number,
            maxH: number,
            options?: {
                drawTargetBackground?: boolean;
                beanScale?: number;
                cropToContent?: boolean;
                maxCellSize?: number;
            },
        ) {
            if (!parent.isValid || !correctArr || bw <= 0 || bh <= 0) return;
        
            let minRow = 0;
            let maxRow = bh - 1;
            let minCol = 0;
            let maxCol = bw - 1;
            if (options?.cropToContent) {
                minRow = bh;
                maxRow = -1;
                minCol = bw;
                maxCol = -1;
                for (let r = 0; r < bh; r++) {
                    for (let c = 0; c < bw; c++) {
                        if (correctArr[r]?.[c] === 0) continue;
                        minRow = Math.min(minRow, r);
                        maxRow = Math.max(maxRow, r);
                        minCol = Math.min(minCol, c);
                        maxCol = Math.max(maxCol, c);
                    }
                }
                if (maxRow < minRow || maxCol < minCol) return;
            }
            const renderW = Math.max(1, maxCol - minCol + 1);
            const renderH = Math.max(1, maxRow - minRow + 1);
            const maxCellW = Math.max(1, Math.floor(maxW / renderW));
            const maxCellH = Math.max(1, Math.floor(maxH / renderH));
            const maxCellSize = Math.max(6, Math.floor(options?.maxCellSize ?? 28));
            const cellSize = Math.min(maxCellW, maxCellH, maxCellSize);
            const cellGap = cellSize > 18 ? 2 : 1;
            const drawTargetBackground = !!options?.drawTargetBackground;
            const beanScale = Math.max(0.35, Math.min(1, options?.beanScale ?? 1));
        
            const preview = new Node('Preview');
            parent.addChild(preview);
            preview.addComponent(UITransform).setContentSize(maxW, maxH);
            preview.layer = Layers.Enum.UI_2D;
            preview.setPosition(offsetX, offsetY);
            const pg = preview.addComponent(Graphics);
        
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    if (correctArr[r][c] === 0) continue;
                    const x = (c - minCol - (renderW - 1) / 2) * (cellSize + cellGap);
                    const y = ((renderH - 1) / 2 - (r - minRow)) * (cellSize + cellGap);
                    const s = cellSize / 2;
                    if (drawTargetBackground) {
                        const targetNode = new Node(`target_${r}_${c}`);
                        targetNode.layer = Layers.Enum.UI_2D;
                        targetNode.addComponent(UITransform).setContentSize(cellSize, cellSize);
                        const targetSp = targetNode.addComponent(Sprite);
                        targetSp.sizeMode = Sprite.SizeMode.CUSTOM;
                        targetSp.spriteFrame = this.getSlotSpriteFrame(correctArr[r][c]);
                        targetNode.setPosition(x, y);
                        preview.addChild(targetNode);
                        continue;
                    }
                    pg.fillColor = new Color(200, 185, 160, 180);
                    pg.circle(x, y, s);
                    pg.fill();
                }
            }
        
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    const cid = correctArr[r][c];
                    if (cid === 0) continue;
                    const x = (c - minCol - (renderW - 1) / 2) * (cellSize + cellGap);
                    const y = ((renderH - 1) / 2 - (r - minRow)) * (cellSize + cellGap);
                    const beanNode = new Node(`bean_${r}_${c}`);
                    beanNode.layer = Layers.Enum.UI_2D;
                    const ut = beanNode.addComponent(UITransform);
                    const beanSize = Math.max(6, Math.floor(cellSize * beanScale));
                    ut.setContentSize(beanSize, beanSize);
                    const sp = beanNode.addComponent(Sprite);
                    sp.sizeMode = Sprite.SizeMode.CUSTOM;
                    sp.spriteFrame = this.getBeanSpriteFrame(cid, false);
                    beanNode.setPosition(x, y);
                    preview.addChild(beanNode);
                }
            }
        },

        /** 在图鉴卡片上绘制像素图预览 */
        drawCollectionPixelPreviewOnCard(
            parent: Node,
            levelId: number,
            offsetX: number,
            offsetY: number,
            maxW: number,
            maxH: number,
            prefix: string = 'level_',
            options?: { grayscale?: boolean },
        ) {
            this.loadLevelData(levelId, (data) => {
                if (!data || !parent.isValid) return;
                const correctArr = data.correctColorArr || [];
                const bounds = this.getCollectionPreviewBounds(correctArr);
                if (!bounds) return;
        
                const rowCount = bounds.maxRow - bounds.minRow + 1;
                const colCount = bounds.maxCol - bounds.minCol + 1;
                const gap = 0;
                const usableW = maxW - 20;
                const usableH = maxH - 20;
                const cellSize = Math.max(
                    5,
                    Math.min(
                        24,
                        Math.floor((usableW - gap * Math.max(0, colCount - 1)) / Math.max(1, colCount)),
                        Math.floor((usableH - gap * Math.max(0, rowCount - 1)) / Math.max(1, rowCount)),
                    ),
                );
                const contentW = colCount * cellSize + Math.max(0, colCount - 1) * gap;
                const contentH = rowCount * cellSize + Math.max(0, rowCount - 1) * gap;
        
                parent.getChildByName('PixelPreview')?.destroy();
                const preview = new Node('PixelPreview');
                parent.addChild(preview);
                preview.layer = Layers.Enum.UI_2D;
                preview.setPosition(offsetX, offsetY);
        
                const pg = preview.addComponent(Graphics);
                // 逐像素绘制方块
                for (let r = 0; r < rowCount; r++) {
                    for (let c = 0; c < colCount; c++) {
                        const colorId = correctArr[bounds.minRow + r][bounds.minCol + c];
                        if (!colorId) continue;
                        const x = -contentW / 2 + c * (cellSize + gap);
                        const y = contentH / 2 - (r + 1) * cellSize - r * gap;
                        pg.fillColor = getCollectionPreviewColor(colorId, !!options?.grayscale);
                        pg.rect(x, y, cellSize, cellSize);
                        pg.fill();
                    }
                }
            }, prefix);
        },

        closeCollectionImageModal() {
            if (this._collectionImageModal) {
                this._collectionImageModal.destroy();
            }
            this._collectionImageModal = null;
        },
    });
}
