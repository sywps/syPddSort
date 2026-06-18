import {
    AudioMgr,
    BlockInputEvents,
    Bundle,
    Button,
    Color,
    EventTouch,
    GAME_ASSETS_BUNDLE_NAME,
    ImageAsset,
    JsonAsset,
    Label,
    LEADERBOARD_SCROLL_DECAY,
    LEADERBOARD_SCROLL_MIN_SPEED,
    LEVEL_DATA_BUNDLE_NAME,
    Mask,
    Node,
    Prefab,
    Rect,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    assetManager,
    instantiate,
    sys,
} from '../GameCtrlShared';

type BackgroundSkinRow = {
    id: number;
    shortId: number;
    type: 'background';
    code: string;
    name: string;
    isDefault: boolean;
    assetBundle: string;
    assetKey: string;
    iconBundle: string;
    iconKey: string;
    unlockType: string;
    price: number;
    sort: number;
    enabled: boolean;
};

type BackgroundSkinConfig = {
    version: number;
    defaultEquipped: number;
    rows: BackgroundSkinRow[];
    byId: Map<number, BackgroundSkinRow>;
};

const SKIN_CONFIG_PATH = 'Skins/skins';
const LS_EQUIPPED_BACKGROUND_SKIN = 'pdd.skin.background.equipped';
const LS_OWNED_BACKGROUND_SKINS = 'pdd.skin.background.owned';
const DEFAULT_BACKGROUND_SKIN_ID = 1001;
const SKIN_PANEL_NAME = 'BackgroundSkinPanelOverlay';
const SKIN_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/BackgroundSkinPanel';
const SKIN_PANEL_SCROLL_CONTENT_NAME = 'SkinScrollContent';
const SKIN_PANEL_COLUMN_XS = [-142, 142];
const SKIN_PANEL_ROW_PITCH = 350;
const SKIN_PANEL_TOP_ROW_VIEW_Y = 160;

function getLevelDataCdnBaseUrl(): string {
    const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const windowScope: any = typeof window !== 'undefined' ? window : null;
    const value = String(globalScope?.__PDD_LEVEL_DATA_CDN_URL__ || windowScope?.__PDD_LEVEL_DATA_CDN_URL__ || '').trim();
    return value ? value.replace(/\/?$/, '/') : '';
}

function getLevelDataRemoteImageUrl(assetKey: string): string {
    const baseUrl = getLevelDataCdnBaseUrl();
    const imageKey = String(assetKey || '').replace(/\/spriteFrame$/, '').replace(/^\/+/, '');
    return baseUrl && imageKey ? baseUrl + imageKey + '.png' : '';
}

function toSkinId(value: unknown, fallback: number = 0): number {
    const id = Math.floor(Number(value));
    return Number.isFinite(id) && id > 0 ? id : fallback;
}

function createImageSpriteFrame(name: string, imgAsset: ImageAsset): SpriteFrame | null {
    const width = imgAsset.width || (imgAsset as any)?.image?.width || 0;
    const height = imgAsset.height || (imgAsset as any)?.image?.height || 0;
    if (!width || !height) return null;
    const texture = new Texture2D();
    texture.image = imgAsset;
    const frame = new SpriteFrame();
    frame.texture = texture;
    frame.rect = new Rect(0, 0, width, height);
    frame.name = name;
    return frame;
}

function requireSkinPanelChild(parent: Node, name: string, context: string): Node {
    const child = parent.getChildByName(name);
    if (!child?.isValid) {
        throw new Error(`[background-skin-prefab] missing node: ${context}/${name}`);
    }
    return child;
}

function requireSkinPanelLabel(parent: Node, name: string, context: string): Label {
    const node = requireSkinPanelChild(parent, name, context);
    const label = node.getComponent(Label);
    if (!label) {
        throw new Error(`[background-skin-prefab] missing Label: ${context}/${name}`);
    }
    return label;
}

function requireSkinPanelSprite(parent: Node, name: string, context: string): Sprite {
    const node = requireSkinPanelChild(parent, name, context);
    const sprite = node.getComponent(Sprite);
    if (!sprite) {
        throw new Error(`[background-skin-prefab] missing Sprite: ${context}/${name}`);
    }
    return sprite;
}

function tintSkinPanelSprite(parent: Node, name: string, context: string, color: Color): Sprite {
    const sprite = requireSkinPanelSprite(parent, name, context);
    sprite.color = color;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    return sprite;
}

export function installSkinBackgroundModule(target: any): void {
    Object.assign(target, {
        _parseBackgroundSkinConfig(json: any): BackgroundSkinConfig {
            const sourceRows = Array.isArray(json?.skins) ? json.skins : [];
            const rows: BackgroundSkinRow[] = sourceRows
                .filter((raw: any) => raw?.type === 'background' && raw.enabled !== false)
                .map((raw: any) => {
                    const row: BackgroundSkinRow = {
                        id: toSkinId(raw.id),
                        shortId: toSkinId(raw.shortId, toSkinId(raw.id)),
                        type: 'background',
                        code: String(raw.code || ''),
                        name: String(raw.name || raw.code || raw.id || ''),
                        isDefault: !!raw.isDefault,
                        assetBundle: String(raw.assetBundle || LEVEL_DATA_BUNDLE_NAME),
                        assetKey: String(raw.assetKey || ''),
                        iconBundle: String(raw.iconBundle || GAME_ASSETS_BUNDLE_NAME),
                        iconKey: String(raw.iconKey || ''),
                        unlockType: String(raw.unlockType || 'draw'),
                        price: Math.max(0, Math.floor(Number(raw.price) || 0)),
                        sort: Math.floor(Number(raw.sort) || 0),
                        enabled: true,
                    };
                    if (!row.id || !row.code || !row.assetBundle || !row.assetKey || !row.iconBundle || !row.iconKey) {
                        throw new Error(`[background-skin] invalid config row: ${JSON.stringify(raw)}`);
                    }
                    return row;
                })
                .sort((a, b) => a.sort - b.sort || a.id - b.id);
            if (rows.length === 0) {
                throw new Error('[background-skin] skins config has no enabled background rows');
            }
            const byId = new Map<number, BackgroundSkinRow>();
            for (const row of rows) byId.set(row.id, row);
            const configuredDefault = toSkinId(json?.defaultEquipped);
            const defaultRow = byId.get(configuredDefault) || rows.find((row) => row.isDefault) || rows[0];
            return {
                version: Math.max(1, Math.floor(Number(json?.version) || 1)),
                defaultEquipped: defaultRow.id,
                rows,
                byId,
            };
        },

        _loadBackgroundSkinConfig(callback: (config: BackgroundSkinConfig | null, err?: Error | null) => void): void {
            if (this._backgroundSkinConfigCache) {
                callback(this._backgroundSkinConfigCache, null);
                return;
            }
            if (this._backgroundSkinConfigLoadingCallbacks) {
                this._backgroundSkinConfigLoadingCallbacks.push(callback);
                return;
            }
            this._backgroundSkinConfigLoadingCallbacks = [callback];
            const finish = (config: BackgroundSkinConfig | null, err?: Error | null) => {
                if (config) {
                    this._backgroundSkinConfigCache = config;
                    this._syncDefaultOwnedBackgroundSkins(config);
                }
                const callbacks = this._backgroundSkinConfigLoadingCallbacks || [];
                this._backgroundSkinConfigLoadingCallbacks = null;
                for (const done of callbacks) done(config, err || null);
            };
            this._withGameAssetsBundle((bundle: Bundle | null) => {
                if (!bundle) {
                    finish(null, new Error('[background-skin] gameAssets bundle unavailable for skins config'));
                    return;
                }
                bundle.load(SKIN_CONFIG_PATH, JsonAsset, (err: Error | null, jsonAsset: JsonAsset | null) => {
                    if (err || !jsonAsset) {
                        finish(null, new Error(`[background-skin] load ${SKIN_CONFIG_PATH} failed: ${err?.message || 'missing json asset'}`));
                        return;
                    }
                    try {
                        finish(this._parseBackgroundSkinConfig(jsonAsset.json), null);
                    } catch (parseError) {
                        finish(null, parseError instanceof Error ? parseError : new Error(String(parseError)));
                    }
                });
            });
        },

        _getSkinBundle(bundleName: string, callback: (bundle: Bundle | null, err?: Error | null) => void): void {
            const safeName = String(bundleName || '').trim();
            if (!safeName) {
                callback(null, new Error('[background-skin] empty bundle name'));
                return;
            }
            const cached = this._skinBundleCache.get(safeName);
            if (cached) {
                callback(cached, null);
                return;
            }
            if (safeName === LEVEL_DATA_BUNDLE_NAME && this.levelDataBundle) {
                this._skinBundleCache.set(safeName, this.levelDataBundle);
                callback(this.levelDataBundle, null);
                return;
            }
            const routed = this._getRoutedBundle?.(safeName);
            if (routed) {
                this._skinBundleCache.set(safeName, routed);
                callback(routed, null);
                return;
            }
            const pending = this._skinBundleLoadingCallbacks.get(safeName);
            if (pending) {
                pending.push(callback);
                return;
            }
            this._skinBundleLoadingCallbacks.set(safeName, [callback]);
            if (safeName === LEVEL_DATA_BUNDLE_NAME && typeof this._withLevelDataBundle === 'function') {
                this._withLevelDataBundle((bundle: Bundle | null) => {
                    if (bundle) this._skinBundleCache.set(safeName, bundle);
                    const callbacks = this._skinBundleLoadingCallbacks.get(safeName) || [];
                    this._skinBundleLoadingCallbacks.delete(safeName);
                    const finalError = !bundle ? new Error(`[background-skin] loadBundle failed: ${safeName}`) : null;
                    for (const done of callbacks) done(bundle || null, finalError);
                });
                return;
            }
            assetManager.loadBundle(safeName, (err, bundle) => {
                if (bundle) this._skinBundleCache.set(safeName, bundle);
                const callbacks = this._skinBundleLoadingCallbacks.get(safeName) || [];
                this._skinBundleLoadingCallbacks.delete(safeName);
                const finalError = err || (!bundle ? new Error(`[background-skin] loadBundle failed: ${safeName}`) : null);
                for (const done of callbacks) done(bundle || null, finalError);
            });
        },

        _loadLevelDataRemoteSpriteFrame(assetKey: string, pendingKey: string, callback: (sf: SpriteFrame | null, err?: Error | null) => void): void {
            const remoteUrl = getLevelDataRemoteImageUrl(assetKey);
            if (!remoteUrl) {
                callback(null, new Error(`[background-skin] levelData CDN url unavailable: ${assetKey}`));
                return;
            }
            (assetManager as any).loadRemote(remoteUrl, { ext: '.png' }, (err: Error | null, imgAsset: ImageAsset | null) => {
                const frame = !err && imgAsset ? createImageSpriteFrame(pendingKey, imgAsset) : null;
                callback(frame, frame ? null : (err || new Error(`[background-skin] remote image missing: ${remoteUrl}`)));
            });
        },

        _loadSkinSpriteFrameAsset(bundleName: string, assetKey: string, pendingKey: string, callback: (sf: SpriteFrame | null, err?: Error | null) => void): void {
            const pending = this._skinSpriteFrameLoadingCallbacks.get(pendingKey);
            if (pending) {
                pending.push(callback);
                return;
            }
            this._skinSpriteFrameLoadingCallbacks.set(pendingKey, [callback]);
            const finish = (sf: SpriteFrame | null, err?: Error | null) => {
                const callbacks = this._skinSpriteFrameLoadingCallbacks.get(pendingKey) || [];
                this._skinSpriteFrameLoadingCallbacks.delete(pendingKey);
                for (const done of callbacks) done(sf, err || null);
            };
            const finishFromLevelDataRemote = (sourceErr?: Error | null) => {
                if (bundleName !== LEVEL_DATA_BUNDLE_NAME) {
                    finish(null, sourceErr || new Error(`[background-skin] SpriteFrame missing: bundle=${bundleName}, key=${assetKey}`));
                    return;
                }
                this._loadLevelDataRemoteSpriteFrame(assetKey, pendingKey, (remoteFrame: SpriteFrame | null, remoteErr?: Error | null) => {
                    finish(remoteFrame, remoteFrame ? null : (sourceErr || remoteErr || new Error(`[background-skin] levelData remote image missing: ${assetKey}`)));
                });
            };
            this._getSkinBundle(bundleName, (bundle: Bundle | null, bundleErr?: Error | null) => {
                if (!bundle) {
                    finishFromLevelDataRemote(bundleErr || new Error(`[background-skin] bundle unavailable: ${bundleName}`));
                    return;
                }
                const candidates = this._getSpriteFrameLoadCandidates
                    ? this._getSpriteFrameLoadCandidates(assetKey)
                    : [`${assetKey}/spriteFrame`, assetKey];
                this._loadSpriteFrameWithCandidates(
                    (candidate: string, done: (err: Error | null, sf: SpriteFrame | null) => void) => bundle.load(candidate, SpriteFrame, done),
                    candidates,
                    (sf: SpriteFrame | null) => {
                        if (sf) {
                            finish(sf, null);
                            return;
                        }
                        const imageKey = assetKey.replace(/\/spriteFrame$/, '');
                        bundle.load(imageKey, ImageAsset, (imgErr: Error | null, imgAsset: ImageAsset | null) => {
                            const imageFrame = !imgErr && imgAsset ? createImageSpriteFrame(pendingKey, imgAsset) : null;
                            if (imageFrame) {
                                finish(imageFrame, null);
                                return;
                            }
                            finishFromLevelDataRemote(new Error(`[background-skin] SpriteFrame missing: bundle=${bundleName}, key=${assetKey}`));
                        });
                    },
                );
            });
        },

        loadBackgroundSkinSpriteFrame(skin: BackgroundSkinRow, callback: (sf: SpriteFrame | null, err?: Error | null) => void): void {
            const cached = this._backgroundSkinFrameCache.get(skin.id);
            if (cached) {
                callback(cached, null);
                return;
            }
            const pendingKey = `background:${skin.id}:${skin.assetBundle}:${skin.assetKey}`;
            this._loadSkinSpriteFrameAsset(skin.assetBundle, skin.assetKey, pendingKey, (sf, err) => {
                if (sf) this._backgroundSkinFrameCache.set(skin.id, sf);
                callback(sf, err || null);
            });
        },

        loadBackgroundSkinIconSpriteFrame(skin: BackgroundSkinRow, callback: (sf: SpriteFrame | null, err?: Error | null) => void): void {
            const cached = this._backgroundSkinIconCache.get(skin.id);
            if (cached) {
                callback(cached, null);
                return;
            }
            const pendingKey = `icon:${skin.id}:${skin.iconBundle}:${skin.iconKey}`;
            this._loadSkinSpriteFrameAsset(skin.iconBundle, skin.iconKey, pendingKey, (sf, err) => {
                if (sf) this._backgroundSkinIconCache.set(skin.id, sf);
                callback(sf, err || null);
            });
        },

        _rememberEquippedBackgroundFrame(skin: BackgroundSkinRow, sf: SpriteFrame): void {
            this._equippedBackgroundSkinId = skin.id;
            this._equippedBackgroundSkinFrame = sf;
            this._backgroundSkinFrameCache.set(skin.id, sf);
        },

        _readBackgroundSkinOwnedIds(): Set<number> {
            try {
                const parsed = JSON.parse(sys.localStorage.getItem(LS_OWNED_BACKGROUND_SKINS) || '[]');
                return new Set((Array.isArray(parsed) ? parsed : []).map((id) => toSkinId(id)).filter(Boolean));
            } catch (_) {
                return new Set<number>();
            }
        },

        _writeBackgroundSkinOwnedIds(ids: Set<number>): void {
            sys.localStorage.setItem(LS_OWNED_BACKGROUND_SKINS, JSON.stringify(Array.from(ids).sort((a, b) => a - b)));
        },

        _syncDefaultOwnedBackgroundSkins(config: BackgroundSkinConfig): void {
            const owned = this._readBackgroundSkinOwnedIds();
            for (const row of config.rows) {
                if (row.isDefault || row.unlockType === 'default' || row.unlockType === 'free') owned.add(row.id);
            }
            this._writeBackgroundSkinOwnedIds(owned);
        },

        isBackgroundSkinOwned(id: number): boolean {
            const config = this._backgroundSkinConfigCache as BackgroundSkinConfig | null;
            const row = config?.byId.get(toSkinId(id));
            if (row?.isDefault || row?.unlockType === 'default' || row?.unlockType === 'free') return true;
            return this._readBackgroundSkinOwnedIds().has(toSkinId(id));
        },

        grantBackgroundSkin(id: number): boolean {
            const safeId = toSkinId(id);
            if (!safeId) return false;
            const owned = this._readBackgroundSkinOwnedIds();
            owned.add(safeId);
            this._writeBackgroundSkinOwnedIds(owned);
            return true;
        },

        getEquippedBackgroundSkinId(): number {
            const storedId = toSkinId(sys.localStorage.getItem(LS_EQUIPPED_BACKGROUND_SKIN));
            const config = this._backgroundSkinConfigCache as BackgroundSkinConfig | null;
            return storedId || config?.defaultEquipped || DEFAULT_BACKGROUND_SKIN_ID;
        },

        _resolveEquippedBackgroundSkin(config: BackgroundSkinConfig): BackgroundSkinRow {
            const storedId = this.getEquippedBackgroundSkinId();
            const storedRow = config.byId.get(storedId);
            if (storedRow) return storedRow;
            console.warn('[background-skin] equipped skin id not found in config; use default:', storedId);
            return config.byId.get(config.defaultEquipped) || config.rows[0];
        },

        _reportBackgroundSkinError(context: string, skin: BackgroundSkinRow | null, err: unknown): void {
            console.error('[background-skin] asset error', {
                context,
                id: skin?.id || 0,
                shortId: skin?.shortId || 0,
                code: skin?.code || '',
                assetBundle: skin?.assetBundle || '',
                assetKey: skin?.assetKey || '',
                iconBundle: skin?.iconBundle || '',
                iconKey: skin?.iconKey || '',
                error: err instanceof Error ? err.message : String(err || ''),
            });
        },

        ensureEquippedBackgroundReady(callback?: (ok: boolean, err?: Error | null, skin?: BackgroundSkinRow | null, sf?: SpriteFrame | null) => void): void {
            this._loadBackgroundSkinConfig((config: BackgroundSkinConfig | null, configErr?: Error | null) => {
                if (!config) {
                    this._reportBackgroundSkinError('config', null, configErr);
                    callback?.(false, configErr || new Error('[background-skin] config unavailable'), null, null);
                    return;
                }
                const skin = this._resolveEquippedBackgroundSkin(config);
                this.loadBackgroundSkinSpriteFrame(skin, (sf, loadErr) => {
                    if (!sf) {
                        this._reportBackgroundSkinError('ensure-equipped', skin, loadErr);
                        callback?.(false, loadErr || new Error('[background-skin] equipped background missing'), skin, null);
                        return;
                    }
                    this._rememberEquippedBackgroundFrame(skin, sf);
                    callback?.(true, null, skin, sf);
                });
            });
        },

        _applyBackgroundSkinFrameToGameplayNode(sf: SpriteFrame): boolean {
            let bgNode: Node | null = null;
            try {
                bgNode = this.requireGameplayBackgroundShell?.() || null;
            } catch (err) {
                console.warn('[background-skin] gameplay background node unavailable:', err);
                return false;
            }
            if (!bgNode?.isValid) return false;
            const sprite = bgNode.getComponent(Sprite) || bgNode.addComponent(Sprite);
            sprite.type = Sprite.Type.SIMPLE;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = sf;
            sprite.color = Color.WHITE;
            return true;
        },

        applyPreparedGameplayBackground(): boolean {
            const skinId = this.getEquippedBackgroundSkinId();
            const prepared = this._equippedBackgroundSkinId === skinId ? this._equippedBackgroundSkinFrame : null;
            const cached = this._backgroundSkinFrameCache.get(skinId);
            const frame = prepared || cached || null;
            return frame ? this._applyBackgroundSkinFrameToGameplayNode(frame) : false;
        },

        applyEquippedGameplayBackground(callback?: (ok: boolean) => void): void {
            this.ensureEquippedBackgroundReady((ok, err, skin, sf) => {
                if (!ok || !sf) {
                    this._reportBackgroundSkinError('apply-gameplay', skin || null, err);
                    callback?.(false);
                    return;
                }
                callback?.(this._applyBackgroundSkinFrameToGameplayNode(sf));
            });
        },

        startGameplayWithBackgroundSkinReady(data: any, activeLevelId?: number, init?: () => void): void {
            this.ensureEquippedBackgroundReady((ok, err, skin) => {
                if (!ok) {
                    this._reportBackgroundSkinError('gameplay-entry', skin || null, err);
                    this.showToast?.('背景加载失败，已使用当前背景', 1.8);
                }
                if (init) init();
                else this.initGame(data, activeLevelId);
            });
        },

        equipBackgroundSkin(id: number, callback?: (ok: boolean, err?: Error | null) => void): void {
            this._loadBackgroundSkinConfig((config: BackgroundSkinConfig | null, err?: Error | null) => {
                const skin = config?.byId.get(toSkinId(id)) || null;
                if (!config || !skin) {
                    const finalErr = err || new Error(`[background-skin] skin not found: ${id}`);
                    this._reportBackgroundSkinError('equip-config', skin, finalErr);
                    this.showToast?.('背景配置加载失败', 1.6);
                    callback?.(false, finalErr);
                    return;
                }
                if (!this.isBackgroundSkinOwned(skin.id)) {
                    const lockedErr = new Error(`[background-skin] skin not owned: ${skin.id}`);
                    this.showToast?.('暂未获得该背景', 1.4);
                    callback?.(false, lockedErr);
                    return;
                }
                this.loadBackgroundSkinSpriteFrame(skin, (sf, loadErr) => {
                    if (!sf) {
                        this._reportBackgroundSkinError('equip-load', skin, loadErr);
                        this.showToast?.('背景加载失败，请稍后重试', 1.8);
                        callback?.(false, loadErr || new Error('[background-skin] background asset missing'));
                        return;
                    }
                    sys.localStorage.setItem(LS_EQUIPPED_BACKGROUND_SKIN, String(skin.id));
                    this._rememberEquippedBackgroundFrame(skin, sf);
                    this._applyBackgroundSkinFrameToGameplayNode(sf);
                    this.showToast?.('已使用', 1.2);
                    callback?.(true, null);
                });
            });
        },

        drawSkinButton(parent: Node): void {
            const btn = parent.getChildByName('SkinBtn');
            if (!btn?.isValid) {
                throw new Error('[HomeScene] Home.scene is missing SkinBtn under EntryLayer');
            }
            this.requireSceneSpriteFrame?.(btn, 'EntryLayer/SkinBtn');
            const icon = btn.getChildByName('SkinIcon');
            if (!icon?.isValid) {
                throw new Error('[HomeScene] Home.scene is missing SkinIcon under EntryLayer/SkinBtn');
            }
            this.requireSceneSpriteFrame?.(icon, 'EntryLayer/SkinBtn/SkinIcon');
            btn.active = true;
            btn.targetOff(this);
            btn.getComponent(Button) || btn.addComponent(Button);
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('uiPanel');
                this.openBackgroundSkinPanel();
            }, this);
        },

        openBackgroundSkinPanel(): void {
            const popupRoot = this.requireCanvasUiRoot('PopupRoot');
            if (popupRoot.getChildByName(SKIN_PANEL_NAME)) return;
            const isOpenTargetAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid) && !!popupRoot?.isValid;
            const failOpen = (context: string, err: unknown, overlay?: Node | null) => {
                this._reportBackgroundSkinError(context, null, err);
                console.error('[background-skin] skin panel open failed', {
                    context,
                    bundle: GAME_ASSETS_BUNDLE_NAME,
                    prefabPath: SKIN_PANEL_PREFAB_PATH,
                    error: err instanceof Error ? err.message : String(err || ''),
                });
                if (overlay?.isValid) {
                    this._clearSpriteFramesBeforeDestroy?.(overlay);
                    this._destroyDetachedNodeNextFrame?.(overlay);
                }
                this._backgroundSkinPanelOverlay = null;
                this.showToast?.('皮肤界面加载失败，请稍后重试', 1.6);
            };
            this._loadBackgroundSkinConfig((config: BackgroundSkinConfig | null, err?: Error | null) => {
                if (!isOpenTargetAlive()) return;
                if (!config) {
                    failOpen('open-panel-config', err || new Error('[background-skin] config unavailable'));
                    return;
                }
                this._withGameAssetsBundle((bundle: Bundle | null) => {
                    if (!isOpenTargetAlive()) return;
                    if (!bundle) {
                        failOpen('open-panel-bundle', new Error(`[background-skin] bundle unavailable: ${GAME_ASSETS_BUNDLE_NAME}`));
                        return;
                    }
                    bundle.load(SKIN_PANEL_PREFAB_PATH, Prefab, (prefabErr: Error | null, prefab: Prefab | null) => {
                        if (!isOpenTargetAlive()) return;
                        if (popupRoot.getChildByName(SKIN_PANEL_NAME)) return;
                        if (prefabErr || !prefab) {
                            failOpen('open-panel-prefab', prefabErr || new Error(`[background-skin] prefab missing: ${SKIN_PANEL_PREFAB_PATH}`));
                            return;
                        }
                        let overlay: Node | null = null;
                        try {
                            overlay = instantiate(prefab);
                            overlay.name = SKIN_PANEL_NAME;
                            popupRoot.addChild(overlay);
                            overlay.setSiblingIndex(999);
                            if (!overlay.getComponent(BlockInputEvents)) overlay.addComponent(BlockInputEvents);
                            const box = requireSkinPanelChild(overlay, 'Box', 'BackgroundSkinPanel');
                            if (!box.getComponent(BlockInputEvents)) box.addComponent(BlockInputEvents);
                            const close = requireSkinPanelChild(box, 'XBtn', 'BackgroundSkinPanel/Box');
                            const content = requireSkinPanelChild(box, 'Content', 'BackgroundSkinPanel/Box');
                            requireSkinPanelChild(content, 'SkinCardTemplate', 'BackgroundSkinPanel/Box/Content');
                            this.bindPanelButton(close, () => this.closeBackgroundSkinPanel());
                            this._backgroundSkinPanelOverlay = overlay;
                            this.renderBackgroundSkinPanelCards(content, config.rows);
                            this.playPopupOpenAnim?.(overlay, box);
                        } catch (buildErr) {
                            failOpen('open-panel-build', buildErr, overlay);
                        }
                    });
                });
            });
        },

        closeBackgroundSkinPanel(): void {
            if (this._backgroundSkinPanelScrollInertiaStep) {
                this.unschedule(this._backgroundSkinPanelScrollInertiaStep);
                this._backgroundSkinPanelScrollInertiaStep = null;
            }
            const overlay = this._backgroundSkinPanelOverlay;
            this._backgroundSkinPanelOverlay = null;
            if (!overlay?.isValid) return;
            this._clearSpriteFramesBeforeDestroy?.(overlay);
            this._destroyDetachedNodeNextFrame?.(overlay);
        },

        setupBackgroundSkinPanelScroll(viewport: Node, content: Node, viewportH: number, totalH: number): void {
            viewport.targetOff(this);
            if (this._backgroundSkinPanelScrollInertiaStep) {
                this.unschedule(this._backgroundSkinPanelScrollInertiaStep);
                this._backgroundSkinPanelScrollInertiaStep = null;
            }
            this._backgroundSkinScrollSuppressClick = false;
            this._backgroundSkinScrollSuppressClickUntil = 0;

            if (totalH <= viewportH + 1) {
                content.setPosition(content.position.x, 0, 0);
                return;
            }

            const halfScroll = (totalH - viewportH) / 2;
            const minY = -halfScroll;
            const maxY = halfScroll;
            const dragThreshold = 8;
            let startY = 0;
            let lastY = 0;
            let lastMoveAt = 0;
            let velocity = 0;
            let dragging = false;
            let inertiaStep: ((dt: number) => void) | null = null;

            content.setPosition(content.position.x, minY, 0);

            const stopInertia = () => {
                if (inertiaStep) {
                    this.unschedule(inertiaStep);
                    inertiaStep = null;
                }
                if (this._backgroundSkinPanelScrollInertiaStep) {
                    this.unschedule(this._backgroundSkinPanelScrollInertiaStep);
                    this._backgroundSkinPanelScrollInertiaStep = null;
                }
                velocity = 0;
            };
            const setScrollY = (nextY: number) => {
                const clampedY = Math.max(minY, Math.min(maxY, nextY));
                content.setPosition(content.position.x, clampedY, 0);
                return clampedY;
            };
            const endDrag = () => {
                dragging = false;
                if (this._backgroundSkinScrollSuppressClick) {
                    this._backgroundSkinScrollSuppressClickUntil = Date.now() + 250;
                }
                if (Math.abs(velocity) < LEADERBOARD_SCROLL_MIN_SPEED) return;
                inertiaStep = (dt: number = 1 / 60) => {
                    if (!viewport.isValid || !content.isValid) {
                        stopInertia();
                        return;
                    }
                    const nextY = setScrollY(content.position.y + velocity * dt);
                    if ((nextY === minY && velocity < 0) || (nextY === maxY && velocity > 0)) {
                        stopInertia();
                        return;
                    }
                    velocity *= LEADERBOARD_SCROLL_DECAY;
                    if (Math.abs(velocity) < LEADERBOARD_SCROLL_MIN_SPEED) stopInertia();
                };
                this._backgroundSkinPanelScrollInertiaStep = inertiaStep;
                this.schedule(inertiaStep, 0);
            };

            viewport.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
                stopInertia();
                startY = e.getUILocation().y;
                lastY = startY;
                lastMoveAt = Date.now();
                velocity = 0;
                dragging = true;
                this._backgroundSkinScrollSuppressClick = false;
            }, this, true);
            viewport.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
                if (!dragging) return;
                const currentY = e.getUILocation().y;
                const delta = currentY - lastY;
                const now = Date.now();
                const elapsedMs = Math.max(16, now - lastMoveAt);
                lastY = currentY;
                lastMoveAt = now;
                velocity = (delta / elapsedMs) * 1000;
                if (Math.abs(currentY - startY) > dragThreshold) {
                    this._backgroundSkinScrollSuppressClick = true;
                    this._backgroundSkinScrollSuppressClickUntil = Date.now() + 250;
                }
                setScrollY(content.position.y + delta);
            }, this, true);
            viewport.on(Node.EventType.TOUCH_END, endDrag, this, true);
            viewport.on(Node.EventType.TOUCH_CANCEL, endDrag, this, true);
        },

        renderBackgroundSkinPanelCards(content: Node, rows: BackgroundSkinRow[]): void {
            if (!content?.isValid) return;
            const viewportUi = content.getComponent(UITransform);
            if (!viewportUi) throw new Error('[background-skin-prefab] missing UITransform: BackgroundSkinPanel/Box/Content');
            const viewportW = Math.max(1, viewportUi.width || viewportUi.contentSize.width || 1);
            const viewportH = Math.max(1, viewportUi.height || viewportUi.contentSize.height || 1);
            const mask = content.getComponent(Mask) || content.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_RECT;
            const template = requireSkinPanelChild(content, 'SkinCardTemplate', 'BackgroundSkinPanel/Box/Content');
            template.active = false;
            for (const child of content.children.slice()) {
                if (child === template) continue;
                this._clearSpriteFramesBeforeDestroy?.(child);
                child.destroy();
            }
            const rowCount = Math.max(1, Math.ceil(rows.length / SKIN_PANEL_COLUMN_XS.length));
            const topPadding = Math.max(0, viewportH / 2 - SKIN_PANEL_TOP_ROW_VIEW_Y);
            const bottomPadding = topPadding;
            const totalH = Math.max(viewportH, topPadding + Math.max(0, rowCount - 1) * SKIN_PANEL_ROW_PITCH + bottomPadding);
            const startY = totalH / 2 - topPadding;
            const scrollContent = new Node(SKIN_PANEL_SCROLL_CONTENT_NAME);
            scrollContent.layer = content.layer;
            content.addChild(scrollContent);
            scrollContent.addComponent(UITransform).setContentSize(viewportW, totalH);
            const equippedId = this.getEquippedBackgroundSkinId();
            rows.forEach((skin, index) => {
                const col = index % SKIN_PANEL_COLUMN_XS.length;
                const row = Math.floor(index / SKIN_PANEL_COLUMN_XS.length);
                const card = instantiate(template);
                card.name = `SkinCard_${skin.id}`;
                card.active = true;
                card.layer = scrollContent.layer;
                scrollContent.addChild(card);
                card.setPosition(SKIN_PANEL_COLUMN_XS[col], startY - row * SKIN_PANEL_ROW_PITCH, 0);
                tintSkinPanelSprite(card, 'CardBg', card.name, Color.WHITE);
                tintSkinPanelSprite(card, 'PreviewBg', card.name, Color.WHITE);
                const preview = requireSkinPanelChild(card, 'Preview', card.name);
                const previewSprite = requireSkinPanelSprite(card, 'Preview', card.name);
                previewSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                previewSprite.type = Sprite.Type.SIMPLE;
                previewSprite.color = Color.WHITE;
                previewSprite.spriteFrame = null;
                this.loadBackgroundSkinIconSpriteFrame(skin, (sf, err) => {
                    if (!preview.isValid) return;
                    if (!sf) {
                        this._reportBackgroundSkinError('panel-icon', skin, err);
                        return;
                    }
                    previewSprite.spriteFrame = sf;
                });
                const nameNode = card.getChildByName('Name');
                if (nameNode?.isValid) nameNode.active = false;
                const owned = this.isBackgroundSkinOwned(skin.id);
                const action = requireSkinPanelChild(card, 'ActionBtn', card.name);
                tintSkinPanelSprite(card, 'ActionBtn', card.name, !owned ? new Color('#BDBDBD') : Color.WHITE);
                const label = requireSkinPanelLabel(action, 'ActionLbl', `${card.name}/ActionBtn`);
                label.string = !owned ? '未获得' : skin.id === equippedId ? '已使用' : '使用';
                action.targetOff(this);
                if (owned && skin.id !== equippedId) {
                    this.bindPanelButton(action, () => {
                        const suppressUntil = Number(this._backgroundSkinScrollSuppressClickUntil) || 0;
                        if (this._backgroundSkinScrollSuppressClick && Date.now() <= suppressUntil) {
                            this._backgroundSkinScrollSuppressClick = false;
                            this._backgroundSkinScrollSuppressClickUntil = 0;
                            return;
                        }
                        this._backgroundSkinScrollSuppressClick = false;
                        this._backgroundSkinScrollSuppressClickUntil = 0;
                        const button = action.getComponent(Button);
                        if (button) button.interactable = false;
                        label.string = '加载中';
                        this.equipBackgroundSkin(skin.id, (ok) => {
                            if (ok) this.renderBackgroundSkinPanelCards(content, rows);
                            else {
                                label.string = '使用';
                                const activeButton = action.getComponent(Button);
                                if (activeButton) activeButton.interactable = true;
                            }
                        });
                    });
                }
            });
            this.setupBackgroundSkinPanelScroll(content, scrollContent, viewportH, totalH);
        },
    });
}
