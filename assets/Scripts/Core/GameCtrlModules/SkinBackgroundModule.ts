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
    LS_LEVEL,
    LOCAL_BOOTSTRAP_BUNDLE_NAME,
    Mask,
    Node,
    Prefab,
    Rect,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    UserMgr,
    UserStateSyncMgr,
    assetManager,
    instantiate,
    sys,
} from '../GameCtrlShared';
import { ensureHomeIconIdleWiggle } from '../HomeIconIdleWiggle';
import { runtimeLog, runtimeWarn } from '../RuntimeLog';
import { isLocalBrowserPreview } from '../RemoteDataCdnClient';
import { SkinResourceCdnService, type SkinLiveManifest, type SkinRemoteAsset } from '../SkinResourceCdnService';
import { debugPerfTrace } from '../DebugPerfTrace';

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
    unlockValue: number;
    price: number;
    sort: number;
    enabled: boolean;
    source?: 'cdn' | 'local';
    backgroundAsset?: SkinRemoteAsset | null;
    iconAsset?: SkinRemoteAsset | null;
};

type BackgroundSkinConfig = {
    version: number;
    defaultEquipped: number;
    rows: BackgroundSkinRow[];
    byId: Map<number, BackgroundSkinRow>;
};

const SKIN_CONFIG_PATH = 'Skins/skins';
const LS_EQUIPPED_BACKGROUND_SKIN_STATE = 'pdd.skin.background.equippedState';
const LEGACY_LS_EQUIPPED_BACKGROUND_SKIN = 'pdd.skin.background.equipped';
const LS_OWNED_BACKGROUND_SKINS = 'pdd.skin.background.owned';
const LS_BACKGROUND_SKIN_AD_PROGRESS = 'pdd.skin.background.adProgress';
const LS_BACKGROUND_SKIN_REFRESH_SEQ = 'pdd.skin.background.refreshSeq';
const LS_EQUIPPED_BACKGROUND_SKIN_ROW_CACHE = 'pdd.skin.background.equippedRow';
const DEFAULT_BACKGROUND_SKIN_ID = 1000;
const BACKGROUND_SKIN_RESET_VERSION = 1;
const LS_BACKGROUND_SKIN_RESET_VERSION = 'pdd.skin.background.resetVersion';
const DEFAULT_OWNED_BACKGROUND_SKIN_IDS = [1000, 1001];
const DEFAULT_OWNED_BACKGROUND_SKIN_ID_SET = new Set<number>(DEFAULT_OWNED_BACKGROUND_SKIN_IDS);
const LOCAL_BACKGROUND_SKIN_SHORT_ID_SET = new Set<number>([2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 16, 21, 22, 99]);
const SKIN_PANEL_NAME = 'BackgroundSkinPanelOverlay';
const SKIN_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/BackgroundSkinPanel';
const SKIN_PANEL_SCROLL_CONTENT_NAME = 'SkinScrollContent';
const SKIN_PANEL_CARD_SLOT_PATTERN = /^SkinCardSlot\d+$/;
const GAMEPLAY_BACKGROUND_SKIN_RETRY_DELAYS = [0, 0.25, 0.75, 1.5, 3, 8, 16, 31];
const BACKGROUND_SKIN_PANEL_BUFFER_ROWS = 1;
const BACKGROUND_SKIN_ICON_LOAD_MAX_IN_FLIGHT = 2;

type BackgroundSkinDiagnosticTarget = {
    __PDD_BACKGROUND_SKIN_LAST?: unknown;
};

declare const wx: BackgroundSkinDiagnosticTarget | undefined;
declare const tt: BackgroundSkinDiagnosticTarget | undefined;
declare const GameGlobal: BackgroundSkinDiagnosticTarget | undefined;

function emitBackgroundSkinDiagnostic(phase: string, detail: Record<string, unknown> = {}): void {
    const payload = {
        phase,
        ts: Date.now(),
        ...detail,
    };
    const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const windowScope: any = typeof window !== 'undefined' ? window : null;
    const targets = [
        globalScope,
        windowScope,
        (() => {
            try { return typeof wx !== 'undefined' ? wx : null; } catch (_) { return null; }
        })(),
        (() => {
            try { return typeof tt !== 'undefined' ? tt : null; } catch (_) { return null; }
        })(),
        (() => {
            try { return typeof GameGlobal !== 'undefined' ? GameGlobal : null; } catch (_) { return null; }
        })(),
    ];
    for (const target of targets) {
        if (target) {
            target.__PDD_BACKGROUND_SKIN_LAST = payload;
        }
    }
    debugPerfTrace(`backgroundSkin.${phase}`, payload);
    if (phase !== 'asset-error' && (phase.includes('error') || phase.includes('invalid'))) {
        runtimeWarn('[background-skin]', phase, payload);
    } else {
        runtimeLog('[background-skin]', phase, payload);
    }
}

function toSkinId(value: unknown, fallback: number = 0): number {
    const id = Math.floor(Number(value));
    return Number.isFinite(id) && id > 0 ? id : fallback;
}

function toSkinShortId(value: unknown, fallback: number = 0): number {
    const id = Math.floor(Number(value));
    return Number.isFinite(id) && id >= 0 ? id : fallback;
}

function toBackgroundSkinStorageId(value: unknown, fallback: number = 0): number {
    const id = Math.floor(Number(value));
    if (!Number.isFinite(id)) return fallback;
    if (id === 0) return DEFAULT_BACKGROUND_SKIN_ID;
    if (id > 0 && id < 1000) return id + 1000;
    return id > 0 ? id : fallback;
}

function normalizeBackgroundSkinIdList(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value
        .map((id) => toBackgroundSkinStorageId(id))
        .filter((id) => id > 0)))
        .sort((a, b) => a - b);
}

function normalizeBackgroundSkinAdProgress(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, number> = {};
    const source = value as Record<string, unknown>;
    for (const rawId of Object.keys(source)) {
        const rawCount = source[rawId];
        const id = toBackgroundSkinStorageId(rawId);
        const count = Math.max(0, Math.floor(Number(rawCount) || 0));
        if (id > 0 && count > 0) result[String(id)] = count;
    }
    return result;
}

function mergeBackgroundSkinAdProgress(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
    const result: Record<string, number> = { ...normalizeBackgroundSkinAdProgress(a) };
    const next = normalizeBackgroundSkinAdProgress(b);
    for (const id of Object.keys(next)) {
        const count = next[id];
        result[id] = Math.max(Math.floor(Number(result[id]) || 0), count);
    }
    return result;
}

function isDefaultBackgroundSkinRow(skin: BackgroundSkinRow | null | undefined): boolean {
    return !!skin && (skin.id === DEFAULT_BACKGROUND_SKIN_ID || !!skin.isDefault);
}

function toSkinTimestamp(value: unknown): number {
    const timestamp = Math.floor(Number(value));
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function parseEquippedBackgroundSkinState(raw: unknown): { id: number; updatedAt: number } {
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw || 'null') : raw;
        const id = toBackgroundSkinStorageId(data?.id);
        const updatedAt = toSkinTimestamp(data?.updatedAt);
        return id > 0 && updatedAt > 0 ? { id, updatedAt } : { id: 0, updatedAt: 0 };
    } catch (_) {
        return { id: 0, updatedAt: 0 };
    }
}

function formatLocalBackgroundSkinCode(shortId: number): string {
    const id = Math.max(0, Math.floor(Number(shortId) || 0));
    const padded = id < 10 ? `00${id}` : (id < 100 ? `0${id}` : String(id));
    return `bg_${padded}`;
}

function canUseLocalBackgroundSkinMirror(): boolean {
    const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const windowScope: any = typeof window !== 'undefined' ? window : null;
    return !!(globalScope?.__PDD_USE_LOCAL_SKIN_MIRROR__ || windowScope?.__PDD_USE_LOCAL_SKIN_MIRROR__ || isLocalBrowserPreview());
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
    (frame as any).__pddReleaseMode = 'dynamic';
    (frame as any).__pddOwnedTexture = texture;
    (frame as any).__pddSourceImageAsset = imgAsset;
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

function requireSkinPanelButton(node: Node, context: string): Button {
    const button = node.getComponent(Button);
    if (!button) {
        throw new Error(`[background-skin-prefab] missing Button: ${context}`);
    }
    return button;
}

function bindSkinPanelButton(runtime: any, node: Node, context: string, handler: () => void): Button {
    const button = requireSkinPanelButton(node, context);
    node.targetOff(runtime);
    node.on(Button.EventType.CLICK, handler, runtime);
    return button;
}

export function installSkinBackgroundModule(target: any): void {
    Object.assign(target, {
        _parseBackgroundSkinConfig(json: any): BackgroundSkinConfig {
            const sourceRows = Array.isArray(json?.skins) ? json.skins : [];
            const rows: BackgroundSkinRow[] = sourceRows
                .filter((raw: any) => raw?.type === 'background' && raw.enabled !== false)
                .map((raw: any) => {
                    const row: BackgroundSkinRow = {
                        id: toSkinId(raw.id, -1),
                        shortId: toSkinShortId(raw.shortId, toSkinId(raw.id)),
                        type: 'background',
                        code: String(raw.code || ''),
                        name: String(raw.name || raw.code || raw.id || ''),
                        isDefault: !!raw.isDefault,
                        assetBundle: String(raw.assetBundle || LEVEL_DATA_BUNDLE_NAME),
                        assetKey: String(raw.assetKey || ''),
                        iconBundle: String(raw.iconBundle || GAME_ASSETS_BUNDLE_NAME),
                        iconKey: String(raw.iconKey || ''),
                        unlockType: String(raw.unlockType || 'locked'),
                        unlockValue: Math.max(0, Math.floor(Number(raw.unlockValue) || 0)),
                        price: Math.max(0, Math.floor(Number(raw.price) || 0)),
                        sort: Math.floor(Number(raw.sort) || 0),
                        enabled: true,
                        source: 'local',
                        backgroundAsset: null,
                        iconAsset: null,
                    };
                    if (row.id < 0 || !row.code || !row.assetBundle || (!isDefaultBackgroundSkinRow(row) && !row.assetKey) || !row.iconBundle || !row.iconKey) {
                        throw new Error(`[background-skin] invalid config row: ${JSON.stringify(raw)}`);
                    }
                    if ((row.unlockType === 'level' || row.unlockType === 'ad') && row.unlockValue <= 0) {
                        throw new Error(`[background-skin] invalid unlockValue: ${JSON.stringify(raw)}`);
                    }
                    return row;
                })
                .sort((a, b) => a.sort - b.sort || a.id - b.id);
            if (rows.length === 0) {
                throw new Error('[background-skin] skins config has no enabled background rows');
            }
            const byId = new Map<number, BackgroundSkinRow>();
            for (const row of rows) byId.set(row.id, row);
            const configuredDefault = toSkinId(json?.defaultEquipped, -1);
            const defaultRow = byId.get(configuredDefault) || rows.find((row) => row.isDefault) || rows[0];
            return {
                version: Math.max(1, Math.floor(Number(json?.version) || 1)),
                defaultEquipped: defaultRow.id,
                rows,
                byId,
            };
        },

        _parseBackgroundSkinCdnManifest(manifest: SkinLiveManifest): BackgroundSkinConfig {
            const sourceRows = Array.isArray(manifest?.skins) ? manifest.skins : [];
            const rows: BackgroundSkinRow[] = sourceRows
                .filter((raw: any) => raw?.type === 'background' && raw.enabled !== false)
                .map((raw: any) => {
                    const backgroundAsset = raw.assets?.background || null;
                    const iconAsset = raw.assets?.thumbnail || raw.assets?.icon || null;
                    const row: BackgroundSkinRow = {
                        id: toSkinId(raw.id),
                        shortId: toSkinShortId(raw.shortId, toSkinId(raw.id)),
                        type: 'background',
                        code: String(raw.code || ''),
                        name: String(raw.name || raw.code || raw.id || ''),
                        isDefault: !!raw.isDefault,
                        assetBundle: String(raw.assetBundle || LEVEL_DATA_BUNDLE_NAME),
                        assetKey: String(raw.assetKey || backgroundAsset?.url || ''),
                        iconBundle: String(raw.iconBundle || GAME_ASSETS_BUNDLE_NAME),
                        iconKey: String(raw.iconKey || iconAsset?.url || ''),
                        unlockType: String(raw.unlockType || 'draw'),
                        unlockValue: Math.max(0, Math.floor(Number(raw.unlockValue) || 0)),
                        price: Math.max(0, Math.floor(Number(raw.price) || 0)),
                        sort: Math.floor(Number(raw.sort) || 0),
                        enabled: true,
                        source: 'cdn',
                        backgroundAsset,
                        iconAsset,
                    };
                    if (!row.id || !row.code || !row.backgroundAsset?.url || !row.backgroundAsset?.hash || !row.iconAsset?.url || !row.iconAsset?.hash) {
                        throw new Error(`[background-skin] invalid cdn config row: ${JSON.stringify(raw)}`);
                    }
                    return row;
                })
                .sort((a, b) => a.sort - b.sort || a.id - b.id);
            if (rows.length === 0) {
                throw new Error('[background-skin] skin_live.json has no enabled background rows');
            }
            const byId = new Map<number, BackgroundSkinRow>();
            for (const row of rows) byId.set(row.id, row);
            const configuredDefault = toSkinId(manifest?.defaultEquipped);
            const defaultRow = byId.get(configuredDefault) || rows.find((row) => row.isDefault) || rows[0];
            return {
                version: Math.max(1, Math.floor(Number(manifest?.skinDataVersion ? 1 : 0) || 1)),
                defaultEquipped: defaultRow.id,
                rows,
                byId,
            };
        },

        _loadBackgroundSkinConfig(callback: (config: BackgroundSkinConfig | null, err?: Error | null) => void): void {
            if (this._backgroundSkinConfigCache) {
                this._syncDefaultOwnedBackgroundSkins(this._backgroundSkinConfigCache);
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
            const describeCdnConfigError = (cdnErr?: Error | null): Error => {
                const diagnostics = SkinResourceCdnService.inst.getAvailabilityDiagnostics();
                const reason = cdnErr?.message
                    || String(diagnostics.liveUnavailableReason || diagnostics.reason || 'unknown');
                return new Error(`[background-skin] skin CDN manifest unavailable: ${reason}`);
            };
            const loadLocalConfig = (cdnErr?: Error | null) => {
                if (!canUseLocalBackgroundSkinMirror()) {
                    finish(null, describeCdnConfigError(cdnErr));
                    return;
                }
                this._withGameAssetsBundle((bundle: Bundle | null) => {
                    if (!bundle) {
                        finish(null, cdnErr || new Error('[background-skin] gameAssets bundle unavailable for skins config'));
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
            };
            const shouldRequireSkinCdn = () => {
                if (!canUseLocalBackgroundSkinMirror()) return true;
                const diagnostics = SkinResourceCdnService.inst.getAvailabilityDiagnostics();
                return !!diagnostics.canUse && !!diagnostics.miniGameRuntime;
            };
            const failOrLoadLocalConfig = (cdnErr: Error | null) => {
                if (shouldRequireSkinCdn()) {
                    finish(null, describeCdnConfigError(cdnErr));
                    return;
                }
                loadLocalConfig(cdnErr);
            };
            SkinResourceCdnService.inst.loadManifest().then((manifest) => {
                if (!manifest) {
                    failOrLoadLocalConfig(null);
                    return;
                }
                try {
                    finish(this._parseBackgroundSkinCdnManifest(manifest), null);
                } catch (parseError) {
                    failOrLoadLocalConfig(parseError instanceof Error ? parseError : new Error(String(parseError)));
                }
            }).catch((cdnErr) => {
                failOrLoadLocalConfig(cdnErr instanceof Error ? cdnErr : new Error(String(cdnErr)));
            });
        },

        preloadBackgroundSkinPanel(): void {
            if (this._backgroundSkinPanelPreloading) return;
            this._backgroundSkinPanelPreloading = true;
            const finish = () => {
                this._backgroundSkinPanelPreloading = false;
            };
            this._loadBackgroundSkinConfig((config: BackgroundSkinConfig | null) => {
                if (!this.isValid || !config) {
                    finish();
                    return;
                }
                this._withGameAssetsBundle((bundle: Bundle | null) => {
                    if (!this.isValid || !bundle) {
                        finish();
                        return;
                    }
                    bundle.load(SKIN_PANEL_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                        if (!err && prefab) {
                            this._backgroundSkinPanelPrefab = prefab;
                        }
                        finish();
                    });
                });
            });
        },

        _getBackgroundSkinFrameTextureForCache(sf: SpriteFrame | null): Texture2D | null {
            if (!sf) return null;
            return ((sf as any).__pddOwnedTexture
                || this._getSpriteFrameInternalTextureForDiagnostics?.(sf)
                || (sf as any)._texture
                || (sf as any).texture
                || null) as Texture2D | null;
        },

        _getBackgroundSkinFrameImageAssetForCache(sf: SpriteFrame | null, texture?: Texture2D | null): ImageAsset | null {
            if (!sf) return null;
            return ((sf as any).__pddSourceImageAsset
                || (texture as any)?.image
                || null) as ImageAsset | null;
        },

        _getBackgroundSkinCacheMetaMap(kind: 'frame' | 'icon'): Map<number, any> {
            const key = kind === 'icon' ? '_backgroundSkinIconCacheMeta' : '_backgroundSkinFrameCacheMeta';
            if (!(this[key] instanceof Map)) this[key] = new Map<number, any>();
            return this[key] as Map<number, any>;
        },

        _getBackgroundSkinCacheMap(kind: 'frame' | 'icon'): Map<number, SpriteFrame> {
            const key = kind === 'icon' ? '_backgroundSkinIconCache' : '_backgroundSkinFrameCache';
            if (!(this[key] instanceof Map)) this[key] = new Map<number, SpriteFrame>();
            return this[key] as Map<number, SpriteFrame>;
        },

        _getBackgroundSkinAssetRefCount(asset: any): number | null {
            const refCount = Number(asset?.refCount);
            return Number.isFinite(refCount) ? refCount : null;
        },

        _addBackgroundSkinCacheRef(asset: any, label: string, key: string): boolean {
            if (!asset?.isValid || typeof asset.addRef !== 'function') return false;
            try {
                asset.addRef();
                return true;
            } catch (error) {
                console.warn(`[background-skin] addRef failed for ${label}: ${key}`, error);
                return false;
            }
        },

        _decBackgroundSkinCacheRef(asset: any, label: string, key: string, reason: string): void {
            if (!asset || typeof asset.decRef !== 'function') return;
            try {
                asset.decRef();
            } catch (error) {
                console.warn(`[background-skin] decRef failed for ${label}: ${key} (${reason})`, error);
            }
        },

        _retainBackgroundSkinCacheResource(kind: 'frame' | 'icon', skinId: number, sf: SpriteFrame | null, reason: string): void {
            if (!sf) return;
            const metaMap = this._getBackgroundSkinCacheMetaMap(kind);
            const existing = metaMap.get(skinId);
            if (existing?.sf === sf && existing?.cacheResourceRetained) return;
            if (existing) this._releaseBackgroundSkinCacheResource(kind, skinId, `${reason}:replace`);
            const texture = this._getBackgroundSkinFrameTextureForCache(sf);
            const imageAsset = this._getBackgroundSkinFrameImageAssetForCache(sf, texture);
            const key = `${kind}:${skinId}:${sf.name || ''}`;
            const meta: any = {
                sf,
                texture,
                imageAsset,
                dynamic: (sf as any).__pddReleaseMode === 'dynamic',
                spriteFrameCacheRetained: this._addBackgroundSkinCacheRef(sf, 'SpriteFrame', key),
                textureCacheRetained: texture ? this._addBackgroundSkinCacheRef(texture, 'Texture2D', key) : false,
                imageAssetCacheRetained: imageAsset ? this._addBackgroundSkinCacheRef(imageAsset, 'ImageAsset', key) : false,
            };
            meta.cacheResourceRetained = !!(meta.spriteFrameCacheRetained || meta.textureCacheRetained || meta.imageAssetCacheRetained);
            metaMap.set(skinId, meta);
            debugPerfTrace('backgroundSkin.cache.retain', {
                kind,
                skinId,
                reason,
                frameName: sf.name || '',
                dynamic: meta.dynamic,
                cacheResourceRetained: meta.cacheResourceRetained,
                sfRefCount: this._getBackgroundSkinAssetRefCount(sf),
                textureRefCount: this._getBackgroundSkinAssetRefCount(texture),
                imageAssetRefCount: this._getBackgroundSkinAssetRefCount(imageAsset),
            });
        },

        _releaseBackgroundSkinCacheResource(kind: 'frame' | 'icon', skinId: number, reason: string): void {
            const metaMap = this._getBackgroundSkinCacheMetaMap(kind);
            const meta = metaMap.get(skinId);
            if (!meta) return;
            metaMap.delete(skinId);
            const sf = meta.sf as SpriteFrame | null;
            const texture = (meta.texture || this._getBackgroundSkinFrameTextureForCache(sf)) as Texture2D | null;
            const imageAsset = meta.imageAsset as ImageAsset | null;
            debugPerfTrace('backgroundSkin.cache.release.before', {
                kind,
                skinId,
                reason,
                frameName: sf?.name || '',
                dynamic: !!meta.dynamic,
                sfRefCount: this._getBackgroundSkinAssetRefCount(sf),
                textureRefCount: this._getBackgroundSkinAssetRefCount(texture),
                imageAssetRefCount: this._getBackgroundSkinAssetRefCount(imageAsset),
            });
            if (meta.imageAssetCacheRetained) this._decBackgroundSkinCacheRef(imageAsset, 'ImageAsset', `${kind}:${skinId}`, reason);
            if (meta.textureCacheRetained) this._decBackgroundSkinCacheRef(texture, 'Texture2D', `${kind}:${skinId}`, reason);
            if (meta.spriteFrameCacheRetained) this._decBackgroundSkinCacheRef(sf, 'SpriteFrame', `${kind}:${skinId}`, reason);
            if (meta.dynamic) {
                try {
                    if (imageAsset?.isValid) assetManager.releaseAsset(imageAsset);
                } catch (error) {
                    console.warn(`[background-skin] release ImageAsset failed: ${kind}:${skinId} (${reason})`, error);
                }
                try {
                    if (sf?.isValid) sf.destroy();
                } catch (error) {
                    console.warn(`[background-skin] destroy SpriteFrame failed: ${kind}:${skinId} (${reason})`, error);
                }
                try {
                    if (texture?.isValid) texture.destroy();
                } catch (error) {
                    console.warn(`[background-skin] destroy Texture2D failed: ${kind}:${skinId} (${reason})`, error);
                }
            }
            debugPerfTrace('backgroundSkin.cache.release.after', {
                kind,
                skinId,
                reason,
            });
        },

        _setBackgroundSkinCachedSpriteFrame(kind: 'frame' | 'icon', skinId: number, sf: SpriteFrame, reason: string): void {
            const cache = this._getBackgroundSkinCacheMap(kind);
            const current = cache.get(skinId);
            if (current === sf) {
                this._retainBackgroundSkinCacheResource(kind, skinId, sf, `${reason}:same`);
                return;
            }
            if (current) this._releaseBackgroundSkinCacheResource(kind, skinId, `${reason}:replace`);
            cache.set(skinId, sf);
            this._retainBackgroundSkinCacheResource(kind, skinId, sf, reason);
        },

        _clearBackgroundSkinCachedSpriteFrames(kind: 'frame' | 'icon', reason: string, keep?: { skinId: number; sf: SpriteFrame | null }): void {
            const cache = this._getBackgroundSkinCacheMap(kind);
            const entries = Array.from(cache.entries()) as Array<[number, SpriteFrame]>;
            for (const [skinId, sf] of entries) {
                if (keep && keep.skinId === skinId && keep.sf === sf) continue;
                cache.delete(skinId);
                this._releaseBackgroundSkinCacheResource(kind, skinId, reason);
            }
        },

        _isBackgroundSkinCachedFrame(sf: SpriteFrame | null): boolean {
            if (!sf) return false;
            const frameCache = this._getBackgroundSkinCacheMap('frame');
            for (const cached of frameCache.values()) {
                if (cached === sf) return true;
            }
            return false;
        },

        _detachGameplayBackgroundSkinSpriteFrameForRelease(): void {
            try {
                const bgNode = this.requireGameplayBackgroundShell?.() || null;
                const sprite = bgNode?.isValid ? bgNode.getComponent(Sprite) : null;
                if (sprite?.spriteFrame && this._isBackgroundSkinCachedFrame(sprite.spriteFrame)) {
                    sprite.spriteFrame = null;
                }
            } catch (_) {
                // Best-effort cleanup during scene/runtime destruction.
            }
        },

        releaseBackgroundSkinCachedSpriteFrames(reason: string = 'runtime-destroy'): void {
            this._detachGameplayBackgroundSkinSpriteFrameForRelease();
            this._equippedBackgroundSkinFrame = null;
            this._clearBackgroundSkinCachedSpriteFrames('frame', reason);
            this._clearBackgroundSkinCachedSpriteFrames('icon', reason);
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

        _loadRemoteSkinSpriteFrameAsset(asset: SkinRemoteAsset, pendingKey: string, callback: (sf: SpriteFrame | null, err?: Error | null) => void): void {
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
            const remoteUrl = SkinResourceCdnService.inst.getAssetUrl(asset);
            if (!remoteUrl) {
                finish(null, new Error(`[background-skin] skin CDN url unavailable: ${asset?.url || ''}`));
                return;
            }
            const ext = String(asset.format || '').toLowerCase() === 'jpg' ? '.jpg' : '.png';
            (assetManager as any).loadRemote(remoteUrl, { ext }, (err: Error | null, imgAsset: ImageAsset | null) => {
                const frame = !err && imgAsset ? createImageSpriteFrame(pendingKey, imgAsset) : null;
                finish(frame, frame ? null : (err || new Error(`[background-skin] remote skin image missing: ${remoteUrl}`)));
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
            this._getSkinBundle(bundleName, (bundle: Bundle | null, bundleErr?: Error | null) => {
                if (!bundle) {
                    finish(null, bundleErr || new Error(`[background-skin] bundle unavailable: ${bundleName}`));
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
                            finish(null, new Error(`[background-skin] SpriteFrame missing: bundle=${bundleName}, key=${assetKey}`));
                        });
                    },
                );
            });
        },

        loadBackgroundSkinSpriteFrame(skin: BackgroundSkinRow, callback: (sf: SpriteFrame | null, err?: Error | null) => void): void {
            if (isDefaultBackgroundSkinRow(skin)) {
                callback(null, null);
                return;
            }
            const cached = this._backgroundSkinFrameCache.get(skin.id);
            if (cached) {
                this._retainBackgroundSkinCacheResource('frame', skin.id, cached, 'background-cache-hit');
                callback(cached, null);
                return;
            }
            if (skin.backgroundAsset) {
                const pendingKey = `background:${skin.id}:skinCdn:${skin.backgroundAsset.hash || skin.backgroundAsset.url}`;
                this._loadRemoteSkinSpriteFrameAsset(skin.backgroundAsset, pendingKey, (sf, err) => {
                    if (sf) this._setBackgroundSkinCachedSpriteFrame('frame', skin.id, sf, 'load-background-remote');
                    callback(sf, err || null);
                });
                return;
            }
            const pendingKey = `background:${skin.id}:${skin.assetBundle}:${skin.assetKey}`;
            this._loadSkinSpriteFrameAsset(skin.assetBundle, skin.assetKey, pendingKey, (sf, err) => {
                if (sf && this.getEquippedBackgroundSkinId() === skin.id) {
                    this._setBackgroundSkinCachedSpriteFrame('frame', skin.id, sf, 'load-background-local');
                }
                callback(sf, err || null);
            });
        },

        loadBackgroundSkinIconSpriteFrame(skin: BackgroundSkinRow, callback: (sf: SpriteFrame | null, err?: Error | null) => void): void {
            const cached = this._backgroundSkinIconCache.get(skin.id);
            if (cached) {
                this._retainBackgroundSkinCacheResource('icon', skin.id, cached, 'icon-cache-hit');
                callback(cached, null);
                return;
            }
            if (skin.iconAsset) {
                const pendingKey = `icon:${skin.id}:skinCdn:${skin.iconAsset.hash || skin.iconAsset.url}`;
                this._loadRemoteSkinSpriteFrameAsset(skin.iconAsset, pendingKey, (sf, err) => {
                    if (sf) this._setBackgroundSkinCachedSpriteFrame('icon', skin.id, sf, 'load-icon-remote');
                    callback(sf, err || null);
                });
                return;
            }
            const pendingKey = `icon:${skin.id}:${skin.iconBundle}:${skin.iconKey}`;
            this._loadSkinSpriteFrameAsset(skin.iconBundle, skin.iconKey, pendingKey, (sf, err) => {
                if (sf) this._setBackgroundSkinCachedSpriteFrame('icon', skin.id, sf, 'load-icon-local');
                callback(sf, err || null);
            });
        },

        _cancelBackgroundSkinIconLoads(reason: string): void {
            this._backgroundSkinIconLoadSeq = (Number(this._backgroundSkinIconLoadSeq) || 0) + 1;
            this._backgroundSkinIconLoadQueue = [];
            debugPerfTrace('backgroundSkin.iconLoad.cancel', { reason });
        },

        _drainBackgroundSkinIconLoadQueue(): void {
            const queue = Array.isArray(this._backgroundSkinIconLoadQueue) ? this._backgroundSkinIconLoadQueue : [];
            this._backgroundSkinIconLoadQueue = queue;
            while ((Number(this._backgroundSkinIconLoadInFlight) || 0) < BACKGROUND_SKIN_ICON_LOAD_MAX_IN_FLIGHT && queue.length > 0) {
                const task = queue.shift();
                if (!task || task.seq !== this._backgroundSkinIconLoadSeq || !task.isCurrent()) {
                    continue;
                }
                this._backgroundSkinIconLoadInFlight = (Number(this._backgroundSkinIconLoadInFlight) || 0) + 1;
                this.loadBackgroundSkinIconSpriteFrame(task.skin, (sf: SpriteFrame | null, err?: Error | null) => {
                    this._backgroundSkinIconLoadInFlight = Math.max(0, (Number(this._backgroundSkinIconLoadInFlight) || 0) - 1);
                    const stillCurrent = task.seq === this._backgroundSkinIconLoadSeq && task.isCurrent();
                    if (stillCurrent) {
                        task.callback(sf, err || null);
                    } else if (sf && !this._backgroundSkinPanelOverlay?.isValid && this._backgroundSkinIconCache?.has(task.skin.id)) {
                        this._backgroundSkinIconCache.delete(task.skin.id);
                        this._releaseBackgroundSkinCacheResource('icon', task.skin.id, 'icon-load-canceled');
                    }
                    this._drainBackgroundSkinIconLoadQueue();
                });
            }
        },

        queueBackgroundSkinIconSpriteFrame(
            skin: BackgroundSkinRow,
            isCurrent: () => boolean,
            callback: (sf: SpriteFrame | null, err?: Error | null) => void,
        ): void {
            if (!skin || !isCurrent()) return;
            const seq = Number(this._backgroundSkinIconLoadSeq) || 0;
            const queue = Array.isArray(this._backgroundSkinIconLoadQueue) ? this._backgroundSkinIconLoadQueue : [];
            queue.push({ skin, isCurrent, callback, seq });
            this._backgroundSkinIconLoadQueue = queue;
            this._drainBackgroundSkinIconLoadQueue();
        },

        _rememberEquippedBackgroundFrame(skin: BackgroundSkinRow, sf: SpriteFrame): void {
            this._clearBackgroundSkinCachedSpriteFrames('frame', `remember-equipped:${skin.id}`, { skinId: skin.id, sf });
            this._equippedBackgroundSkinId = skin.id;
            this._equippedBackgroundSkinFrame = sf;
            this._setBackgroundSkinCachedSpriteFrame('frame', skin.id, sf, 'remember-equipped');
        },

        _clearEquippedBackgroundFrame(skin?: BackgroundSkinRow | null): void {
            this._equippedBackgroundSkinId = skin ? skin.id : DEFAULT_BACKGROUND_SKIN_ID;
            this._equippedBackgroundSkinFrame = null;
            this._clearBackgroundSkinCachedSpriteFrames('frame', 'clear-equipped');
        },

        getBackgroundSkinCompletedLevel(): number {
            const profileLevel = Math.max(1, Math.floor(Number(UserMgr.inst.getProfile()?.lastLevelId) || 1));
            const localLevel = Math.max(1, Math.floor(Number(sys.localStorage.getItem(LS_LEVEL)) || 1));
            return Math.max(0, Math.max(profileLevel, localLevel) - 1);
        },

        _readBackgroundSkinAdProgress(): Record<string, number> {
            try {
                const parsed = JSON.parse(sys.localStorage.getItem(LS_BACKGROUND_SKIN_AD_PROGRESS) || '{}');
                return normalizeBackgroundSkinAdProgress(parsed);
            } catch (_) {
                return {};
            }
        },

        _writeBackgroundSkinAdProgress(progress: Record<string, number>): void {
            sys.localStorage.setItem(LS_BACKGROUND_SKIN_AD_PROGRESS, JSON.stringify(normalizeBackgroundSkinAdProgress(progress)));
        },

        getBackgroundSkinAdProgress(id: number): number {
            const safeId = toBackgroundSkinStorageId(id);
            if (!safeId) return 0;
            const progress = this._readBackgroundSkinAdProgress();
            return Math.max(0, Math.floor(Number(progress[String(safeId)]) || 0));
        },

        addBackgroundSkinAdProgress(id: number): number {
            const safeId = toBackgroundSkinStorageId(id);
            if (!safeId) return 0;
            const progress = this._readBackgroundSkinAdProgress();
            const next = this.getBackgroundSkinAdProgress(safeId) + 1;
            progress[String(safeId)] = next;
            this._writeBackgroundSkinAdProgress(progress);
            this.queueCloudGameStateSync?.();
            return next;
        },

        isBackgroundSkinLevelUnlocked(skin: BackgroundSkinRow): boolean {
            return skin.unlockType === 'level' && this.getBackgroundSkinCompletedLevel() >= skin.unlockValue;
        },

        isBackgroundSkinAdUnlocked(skin: BackgroundSkinRow): boolean {
            return skin.unlockType === 'ad' && this.getBackgroundSkinAdProgress(skin.id) >= skin.unlockValue;
        },

        _writeEquippedBackgroundSkinRowCache(skin: BackgroundSkinRow): void {
            const cache = {
                id: skin.id,
                shortId: skin.shortId,
                type: 'background',
                code: skin.code,
                name: skin.name,
                isDefault: !!skin.isDefault,
                assetBundle: skin.assetBundle,
                assetKey: skin.assetKey,
                iconBundle: skin.iconBundle,
                iconKey: skin.iconKey,
                unlockType: skin.unlockType,
                unlockValue: skin.unlockValue,
                price: skin.price,
                sort: skin.sort,
                enabled: skin.enabled !== false,
                source: skin.source || 'local',
                backgroundAsset: skin.backgroundAsset || null,
                iconAsset: skin.iconAsset || null,
            };
            sys.localStorage.setItem(LS_EQUIPPED_BACKGROUND_SKIN_ROW_CACHE, JSON.stringify(cache));
        },

        _clearEquippedBackgroundSkinRowCache(): void {
            sys.localStorage.removeItem(LS_EQUIPPED_BACKGROUND_SKIN_ROW_CACHE);
        },

        _readEquippedBackgroundSkinRowCache(): BackgroundSkinRow | null {
            try {
                const raw = JSON.parse(sys.localStorage.getItem(LS_EQUIPPED_BACKGROUND_SKIN_ROW_CACHE) || 'null');
                const id = toBackgroundSkinStorageId(raw?.id);
                if (!id || id !== this.getEquippedBackgroundSkinId()) return null;
                const backgroundAsset = raw?.backgroundAsset || null;
                const iconAsset = raw?.iconAsset || null;
                const assetBundle = String(raw?.assetBundle || LEVEL_DATA_BUNDLE_NAME);
                const assetKey = String(raw?.assetKey || backgroundAsset?.url || '');
                const iconBundle = String(raw?.iconBundle || GAME_ASSETS_BUNDLE_NAME);
                const iconKey = String(raw?.iconKey || iconAsset?.url || '');
                if (!assetBundle || !assetKey) return null;
                const row: BackgroundSkinRow = {
                    id,
                    shortId: Math.max(0, Math.floor(Number(raw?.shortId) || 0)),
                    type: 'background',
                    code: String(raw?.code || `bg_${id}`),
                    name: String(raw?.name || ''),
                    isDefault: !!raw?.isDefault,
                    assetBundle,
                    assetKey,
                    iconBundle,
                    iconKey,
                    unlockType: String(raw?.unlockType || 'free'),
                    unlockValue: Math.max(0, Math.floor(Number(raw?.unlockValue) || 0)),
                    price: Math.max(0, Math.floor(Number(raw?.price) || 0)),
                    sort: Math.floor(Number(raw?.sort) || 0),
                    enabled: raw?.enabled !== false,
                    source: raw?.source === 'cdn' ? 'cdn' : 'local',
                    backgroundAsset,
                    iconAsset,
                };
                if (!row.backgroundAsset && !canUseLocalBackgroundSkinMirror()) return null;
                return row;
            } catch (_) {
                return null;
            }
        },

        _createLocalEquippedBackgroundSkinRowFromId(): BackgroundSkinRow | null {
            if (!canUseLocalBackgroundSkinMirror()) return null;
            const equippedId = this.getEquippedBackgroundSkinId();
            if (!equippedId) return null;
            if (equippedId === DEFAULT_BACKGROUND_SKIN_ID) {
                return {
                    id: DEFAULT_BACKGROUND_SKIN_ID,
                    shortId: 0,
                    type: 'background',
                    code: 'bg_000',
                    name: '默认皮肤',
                    isDefault: true,
                    assetBundle: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                    assetKey: 'GameUI/bg_game_pindd',
                    iconBundle: GAME_ASSETS_BUNDLE_NAME,
                    iconKey: 'Skins/Icons/bg_000',
                    unlockType: 'default',
                    unlockValue: 0,
                    price: 0,
                    sort: 0,
                    enabled: true,
                    source: 'local',
                    backgroundAsset: null,
                    iconAsset: null,
                };
            }
            const shortId = equippedId >= 1000 ? equippedId - 1000 : equippedId;
            if (!LOCAL_BACKGROUND_SKIN_SHORT_ID_SET.has(shortId)) return null;
            if (!canUseLocalBackgroundSkinMirror()) return null;
            const code = formatLocalBackgroundSkinCode(shortId);
            return {
                id: equippedId,
                shortId,
                type: 'background',
                code,
                name: `背景 ${code.slice(3)}`,
                isDefault: false,
                assetBundle: LEVEL_DATA_BUNDLE_NAME,
                assetKey: `Skins/Background/${code}/background`,
                iconBundle: GAME_ASSETS_BUNDLE_NAME,
                iconKey: `Skins/Icons/${code}`,
                unlockType: 'free',
                unlockValue: 0,
                price: 0,
                sort: shortId,
                enabled: true,
                source: 'local',
                backgroundAsset: null,
                iconAsset: null,
            };
        },

        _readBackgroundSkinOwnedIds(): Set<number> {
            try {
                const parsed = JSON.parse(sys.localStorage.getItem(LS_OWNED_BACKGROUND_SKINS) || '[]');
                return new Set(normalizeBackgroundSkinIdList(parsed));
            } catch (_) {
                return new Set<number>();
            }
        },

        _writeBackgroundSkinOwnedIds(ids: Set<number>): void {
            sys.localStorage.setItem(LS_OWNED_BACKGROUND_SKINS, JSON.stringify(normalizeBackgroundSkinIdList(Array.from(ids))));
        },

        _readBackgroundSkinResetVersion(): number {
            return Math.max(0, Math.floor(Number(sys.localStorage.getItem(LS_BACKGROUND_SKIN_RESET_VERSION)) || 0));
        },

        _writeBackgroundSkinResetVersion(version: number): void {
            sys.localStorage.setItem(LS_BACKGROUND_SKIN_RESET_VERSION, String(Math.max(0, Math.floor(Number(version) || 0))));
        },

        _applyBackgroundSkinResetMigration(syncCloud: boolean = true): boolean {
            if (this._readBackgroundSkinResetVersion() >= BACKGROUND_SKIN_RESET_VERSION) return false;
            const owned = new Set<number>(DEFAULT_OWNED_BACKGROUND_SKIN_IDS);
            this._writeBackgroundSkinOwnedIds(owned);
            this._writeBackgroundSkinAdProgress({});
            const equippedState = this._readEquippedBackgroundSkinState();
            const equippedId = toBackgroundSkinStorageId(equippedState.id);
            if (equippedId && !DEFAULT_OWNED_BACKGROUND_SKIN_ID_SET.has(equippedId)) {
                this._writeEquippedBackgroundSkinState(DEFAULT_BACKGROUND_SKIN_ID, Date.now());
                this._equippedBackgroundSkinId = 0;
                this._equippedBackgroundSkinFrame = null;
                this._clearBackgroundSkinCachedSpriteFrames('frame', 'reset-migration');
                this._clearEquippedBackgroundSkinRowCache();
                this._markBackgroundSkinChanged();
            }
            this._writeBackgroundSkinResetVersion(BACKGROUND_SKIN_RESET_VERSION);
            if (syncCloud) this.syncBackgroundSkinCloudState?.();
            return true;
        },

        _syncDefaultOwnedBackgroundSkins(config: BackgroundSkinConfig): void {
            this._applyBackgroundSkinResetMigration(false);
            const owned = this._readBackgroundSkinOwnedIds();
            let changed = false;
            for (const row of config.rows) {
                if (
                    row.isDefault
                    || row.unlockType === 'default'
                    || row.unlockType === 'free'
                    || this.isBackgroundSkinAdUnlocked(row)
                ) {
                    if (!owned.has(row.id)) changed = true;
                    owned.add(row.id);
                }
            }
            this._writeBackgroundSkinOwnedIds(owned);
            if (changed) this.syncBackgroundSkinCloudState?.();
        },

        isBackgroundSkinOwned(id: number): boolean {
            const config = this._backgroundSkinConfigCache as BackgroundSkinConfig | null;
            const safeId = toBackgroundSkinStorageId(id);
            if (!safeId) return false;
            const row = config?.byId.get(safeId);
            if (row?.isDefault || row?.unlockType === 'default' || row?.unlockType === 'free') return true;
            if (row && this.isBackgroundSkinAdUnlocked(row)) return true;
            return this._readBackgroundSkinOwnedIds().has(safeId);
        },

        grantBackgroundSkin(id: number): boolean {
            const safeId = toBackgroundSkinStorageId(id);
            if (!safeId) return false;
            const owned = this._readBackgroundSkinOwnedIds();
            const hadOwned = owned.has(safeId);
            owned.add(safeId);
            this._writeBackgroundSkinOwnedIds(owned);
            if (!hadOwned) this.syncBackgroundSkinCloudState?.();
            return true;
        },

        captureBackgroundSkinCloudState(): Record<string, unknown> {
            this._applyBackgroundSkinResetMigration(false);
            return {
                ownedBackgroundSkinIds: this.getOwnedBackgroundSkinIds(),
                backgroundSkinAdProgress: normalizeBackgroundSkinAdProgress(this._readBackgroundSkinAdProgress()),
                equippedBackgroundSkinId: this.getCloudSyncEquippedBackgroundSkinId(),
                equippedBackgroundSkinUpdatedAt: this.getCloudSyncEquippedBackgroundSkinUpdatedAt(),
                backgroundSkinResetVersion: Math.max(this._readBackgroundSkinResetVersion(), BACKGROUND_SKIN_RESET_VERSION),
            };
        },

        applyBackgroundSkinCloudState(gameState: Record<string, unknown> | null | undefined, applyEquipped: boolean = true): void {
            if (!gameState || typeof gameState !== 'object') return;
            const cloudResetVersion = Math.max(0, Math.floor(Number(gameState.backgroundSkinResetVersion) || 0));
            if (cloudResetVersion < BACKGROUND_SKIN_RESET_VERSION) {
                this._applyBackgroundSkinResetMigration(true);
                return;
            }
            this._applyBackgroundSkinResetMigration(false);
            this._writeBackgroundSkinResetVersion(cloudResetVersion);
            const owned = this._readBackgroundSkinOwnedIds();
            for (const id of normalizeBackgroundSkinIdList(gameState.ownedBackgroundSkinIds)) owned.add(id);
            for (const id of normalizeBackgroundSkinIdList(gameState.backgroundSkinOwnedIds)) owned.add(id);
            this._writeBackgroundSkinOwnedIds(owned);
            const cloudProgress = normalizeBackgroundSkinAdProgress(gameState.backgroundSkinAdProgress);
            if (Object.keys(cloudProgress).length > 0) {
                this._writeBackgroundSkinAdProgress(mergeBackgroundSkinAdProgress(this._readBackgroundSkinAdProgress(), cloudProgress));
            }
            if (this._backgroundSkinConfigCache) {
                this._syncDefaultOwnedBackgroundSkins(this._backgroundSkinConfigCache);
            }
            if (applyEquipped) {
                this.applyCloudBackgroundSkinState(
                    this.getOwnedBackgroundSkinIds(),
                    gameState.equippedBackgroundSkinId,
                    gameState.equippedBackgroundSkinUpdatedAt,
                );
            }
        },

        _writeEquippedBackgroundSkinState(id: number, updatedAt: number): void {
            const state = {
                id: toBackgroundSkinStorageId(id),
                updatedAt: toSkinTimestamp(updatedAt),
            };
            if (!state.id || !state.updatedAt) {
                sys.localStorage.removeItem(LS_EQUIPPED_BACKGROUND_SKIN_STATE);
                return;
            }
            sys.localStorage.setItem(LS_EQUIPPED_BACKGROUND_SKIN_STATE, JSON.stringify(state));
        },

        _readEquippedBackgroundSkinState(): { id: number; updatedAt: number } {
            const state = parseEquippedBackgroundSkinState(sys.localStorage.getItem(LS_EQUIPPED_BACKGROUND_SKIN_STATE));
            if (state.id) return state;
            const legacyId = toBackgroundSkinStorageId(sys.localStorage.getItem(LEGACY_LS_EQUIPPED_BACKGROUND_SKIN));
            return legacyId ? { id: legacyId, updatedAt: 0 } : { id: 0, updatedAt: 0 };
        },

        _persistEquippedBackgroundSkinSelection(skin: BackgroundSkinRow): void {
            const previousEquippedId = this.getEquippedBackgroundSkinId();
            this._writeEquippedBackgroundSkinState(skin.id, Date.now());
            if (skin.id !== previousEquippedId) this._markBackgroundSkinChanged();
            this._writeEquippedBackgroundSkinRowCache(skin);
            this.queueCloudGameStateSync?.();
            void UserStateSyncMgr.inst.flushPendingSave();
        },

        getStoredEquippedBackgroundSkinId(): number {
            return this._readEquippedBackgroundSkinState().id;
        },

        getEquippedBackgroundSkinUpdatedAt(): number {
            return this._readEquippedBackgroundSkinState().updatedAt;
        },

        getCloudSyncEquippedBackgroundSkinId(): number {
            const storedId = this.getStoredEquippedBackgroundSkinId();
            const updatedAt = this.getEquippedBackgroundSkinUpdatedAt();
            return storedId > 0 && updatedAt > 0 ? storedId : 0;
        },

        getCloudSyncEquippedBackgroundSkinUpdatedAt(): number {
            return this.getCloudSyncEquippedBackgroundSkinId() > 0
                ? this.getEquippedBackgroundSkinUpdatedAt()
                : 0;
        },

        getOwnedBackgroundSkinIds(): number[] {
            const owned = this._readBackgroundSkinOwnedIds() as Set<number>;
            return Array.from(owned).sort((a, b) => a - b);
        },

        getEquippedBackgroundSkinId(): number {
            const storedId = this.getStoredEquippedBackgroundSkinId();
            const config = this._backgroundSkinConfigCache as BackgroundSkinConfig | null;
            if (storedId > 0 && (!config || config.byId.has(storedId))) return storedId;
            return config?.defaultEquipped || DEFAULT_BACKGROUND_SKIN_ID;
        },

        syncBackgroundSkinCloudState(): void {
            if (typeof this.queueCloudGameStateSync === 'function') {
                this.queueCloudGameStateSync();
            }
            void UserStateSyncMgr.inst.flushPendingSave();
        },

        _readBackgroundSkinRefreshSeq(): number {
            const seq = Math.floor(Number(sys.localStorage.getItem(LS_BACKGROUND_SKIN_REFRESH_SEQ)));
            return Number.isFinite(seq) && seq >= 0 ? seq : 0;
        },

        _markBackgroundSkinChanged(): number {
            const nextSeq = this._readBackgroundSkinRefreshSeq() + 1;
            sys.localStorage.setItem(LS_BACKGROUND_SKIN_REFRESH_SEQ, String(nextSeq));
            return nextSeq;
        },

        _isGameplayBackgroundSkinCurrent(): boolean {
            return this._appliedGameplayBackgroundSkinId === this.getEquippedBackgroundSkinId()
                && this._appliedGameplayBackgroundRefreshSeq === this._readBackgroundSkinRefreshSeq();
        },

        applyCloudBackgroundSkinState(ownedIds?: unknown, equippedId?: unknown, equippedUpdatedAt?: unknown): void {
            const owned = this._readBackgroundSkinOwnedIds();
            const incomingOwned = Array.isArray(ownedIds)
                ? ownedIds.map((id) => toBackgroundSkinStorageId(id)).filter(Boolean)
                : [];
            for (const id of incomingOwned) owned.add(id);
            const cloudUpdatedAt = toSkinTimestamp(equippedUpdatedAt);
            const cloudEquippedId = cloudUpdatedAt > 0 ? toBackgroundSkinStorageId(equippedId) : 0;
            if (!cloudEquippedId && (toBackgroundSkinStorageId(equippedId) > 0 || cloudUpdatedAt > 0)) {
                emitBackgroundSkinDiagnostic('cloud-skin-invalid-pair', {
                    incomingEquippedBackgroundSkinId: toBackgroundSkinStorageId(equippedId),
                    incomingEquippedBackgroundSkinUpdatedAt: cloudUpdatedAt,
                    localEquippedBackgroundSkinId: this.getStoredEquippedBackgroundSkinId(),
                    localEquippedBackgroundSkinUpdatedAt: this.getEquippedBackgroundSkinUpdatedAt(),
                });
            }
            if (cloudEquippedId) {
                const localStoredId = this.getStoredEquippedBackgroundSkinId();
                const localUpdatedAt = this.getEquippedBackgroundSkinUpdatedAt();
                const shouldApplyCloud = !localStoredId
                    || cloudUpdatedAt > localUpdatedAt;
                if (!shouldApplyCloud) {
                    emitBackgroundSkinDiagnostic('cloud-skin-skip-local-newer', {
                        cloudEquippedBackgroundSkinId: cloudEquippedId,
                        cloudEquippedBackgroundSkinUpdatedAt: cloudUpdatedAt,
                        localEquippedBackgroundSkinId: localStoredId,
                        localEquippedBackgroundSkinUpdatedAt: localUpdatedAt,
                    });
                    this._writeBackgroundSkinOwnedIds(owned);
                    return;
                }
                const previousEquippedId = this.getEquippedBackgroundSkinId();
                owned.add(cloudEquippedId);
                this._writeEquippedBackgroundSkinState(cloudEquippedId, cloudUpdatedAt);
                this._equippedBackgroundSkinId = 0;
                this._equippedBackgroundSkinFrame = null;
                if (cloudEquippedId !== previousEquippedId) this._clearBackgroundSkinCachedSpriteFrames('frame', 'cloud-skin-applied');
                if (cloudEquippedId !== previousEquippedId) this._clearEquippedBackgroundSkinRowCache();
                if (cloudEquippedId !== previousEquippedId) this._markBackgroundSkinChanged();
                emitBackgroundSkinDiagnostic('cloud-skin-applied', {
                    cloudEquippedBackgroundSkinId: cloudEquippedId,
                    cloudEquippedBackgroundSkinUpdatedAt: cloudUpdatedAt,
                    previousEquippedBackgroundSkinId: previousEquippedId,
                });
            }
            this._writeBackgroundSkinOwnedIds(owned);
        },

        _resolveEquippedBackgroundSkin(config: BackgroundSkinConfig): BackgroundSkinRow {
            const storedId = this.getEquippedBackgroundSkinId();
            const storedRow = config.byId.get(storedId);
            if (storedRow) return storedRow;
            console.warn('[background-skin] equipped skin id not found in config; use default:', storedId);
            return config.byId.get(config.defaultEquipped) || config.rows[0];
        },

        _reportBackgroundSkinError(context: string, skin: BackgroundSkinRow | null, err: unknown): void {
            if (!(this._backgroundSkinAssetErrorKeys instanceof Set)) {
                this._backgroundSkinAssetErrorKeys = new Set<string>();
            }
            const payload = {
                context,
                equippedBackgroundSkinId: this.getEquippedBackgroundSkinId(),
                equippedBackgroundSkinUpdatedAt: this.getEquippedBackgroundSkinUpdatedAt(),
                id: skin?.id || 0,
                shortId: skin?.shortId || 0,
                code: skin?.code || '',
                assetBundle: skin?.assetBundle || '',
                assetKey: skin?.assetKey || '',
                iconBundle: skin?.iconBundle || '',
                iconKey: skin?.iconKey || '',
                source: skin?.source || '',
                backgroundHash: skin?.backgroundAsset?.hash || '',
                iconHash: skin?.iconAsset?.hash || '',
                cdn: SkinResourceCdnService.inst.getAvailabilityDiagnostics(),
                error: err instanceof Error ? err.message : String(err || ''),
            };
            const key = [
                context,
                payload.equippedBackgroundSkinId,
                payload.id,
                payload.source,
                payload.backgroundHash,
                payload.iconHash,
                payload.error,
            ].join('|');
            if (this._backgroundSkinAssetErrorKeys.has(key)) {
                debugPerfTrace('backgroundSkin.assetError.suppressed', payload);
                return;
            }
            this._backgroundSkinAssetErrorKeys.add(key);
            emitBackgroundSkinDiagnostic('asset-error', payload);
            console.warn('[background-skin] asset error', payload);
        },

        _ensureEquippedBackgroundFromConfig(callback?: (ok: boolean, err?: Error | null, skin?: BackgroundSkinRow | null, sf?: SpriteFrame | null) => void): void {
            this._loadBackgroundSkinConfig((config: BackgroundSkinConfig | null, configErr?: Error | null) => {
                if (!config) {
                    this._reportBackgroundSkinError('config', null, configErr);
                    callback?.(false, configErr || new Error('[background-skin] config unavailable'), null, null);
                    return;
                }
                const skin = this._resolveEquippedBackgroundSkin(config);
                if (isDefaultBackgroundSkinRow(skin)) {
                    this._clearEquippedBackgroundFrame(skin);
                    callback?.(true, null, skin, null);
                    return;
                }
                this._persistEquippedBackgroundSkinSelection(skin);
                this.loadBackgroundSkinSpriteFrame(skin, (sf, loadErr) => {
                    if (!sf) {
                        this._reportBackgroundSkinError('ensure-equipped', skin, loadErr);
                        callback?.(false, loadErr || new Error('[background-skin] equipped background missing'), skin, null);
                        return;
                    }
                    this._rememberEquippedBackgroundFrame(skin, sf);
                    this.refreshEquippedGameplayBackground(true);
                    this._writeEquippedBackgroundSkinRowCache(skin);
                    callback?.(true, null, skin, sf);
                });
            });
        },

        ensureEquippedBackgroundReady(callback?: (ok: boolean, err?: Error | null, skin?: BackgroundSkinRow | null, sf?: SpriteFrame | null) => void): void {
            if (!canUseLocalBackgroundSkinMirror()) {
                this._ensureEquippedBackgroundFromConfig(callback);
                return;
            }
            const cachedSkin = this._readEquippedBackgroundSkinRowCache();
            const localSkin = this._createLocalEquippedBackgroundSkinRowFromId();
            const candidates: BackgroundSkinRow[] = [];
            const seen = new Set<string>();
            const addCandidate = (skin: BackgroundSkinRow | null) => {
                if (!skin) return;
                const key = `${skin.id}:${skin.assetBundle}:${skin.assetKey}:${skin.backgroundAsset?.hash || skin.backgroundAsset?.url || ''}`;
                if (seen.has(key)) return;
                seen.add(key);
                candidates.push(skin);
            };
            if (isLocalBrowserPreview()) {
                addCandidate(localSkin);
                addCandidate(cachedSkin);
            } else {
                addCandidate(cachedSkin);
                addCandidate(localSkin);
            }
            const tryCandidate = (index: number) => {
                const skin = candidates[index];
                if (!skin) {
                    this._ensureEquippedBackgroundFromConfig(callback);
                    return;
                }
                this.loadBackgroundSkinSpriteFrame(skin, (sf) => {
                    if (sf) {
                        this._rememberEquippedBackgroundFrame(skin, sf);
                        this._writeEquippedBackgroundSkinRowCache(skin);
                        callback?.(true, null, skin, sf);
                        return;
                    }
                    tryCandidate(index + 1);
                });
            };
            tryCandidate(0);
        },

        _applyBackgroundSkinFrameToGameplayNode(sf: SpriteFrame): boolean {
            const runtimeSceneName = typeof this.getRuntimeSceneName === 'function'
                ? String(this.getRuntimeSceneName('') || '')
                : 'Game';
            if (runtimeSceneName && runtimeSceneName !== 'Game') {
                return false;
            }
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
            if (typeof this.scheduleSpriteFrameApply === 'function') {
                this.scheduleSpriteFrameApply(sprite, sf, `gameplay-background-skin:${sf.name || ''}`, {
                    forceReassign: true,
                });
            } else {
                sprite.spriteFrame = sf;
            }
            sprite.color = Color.WHITE;
            this._appliedGameplayBackgroundSkinId = this.getEquippedBackgroundSkinId();
            this._appliedGameplayBackgroundRefreshSeq = this._readBackgroundSkinRefreshSeq();
            emitBackgroundSkinDiagnostic('gameplay-skin-applied', {
                equippedBackgroundSkinId: this._appliedGameplayBackgroundSkinId,
                refreshSeq: this._appliedGameplayBackgroundRefreshSeq,
                frameName: sf.name || '',
            });
            return true;
        },

        applyPreparedGameplayBackground(): boolean {
            const skinId = this.getEquippedBackgroundSkinId();
            if (skinId === DEFAULT_BACKGROUND_SKIN_ID) return true;
            const prepared = this._equippedBackgroundSkinId === skinId ? this._equippedBackgroundSkinFrame : null;
            const cached = this._backgroundSkinFrameCache.get(skinId);
            const frame = prepared || cached || null;
            return frame ? this._applyBackgroundSkinFrameToGameplayNode(frame) : false;
        },

        applyEquippedGameplayBackground(callback?: (ok: boolean) => void): void {
            this.ensureEquippedBackgroundReady((ok, err, skin, sf) => {
                if (ok && isDefaultBackgroundSkinRow(skin)) {
                    callback?.(true);
                    return;
                }
                if (!ok || !sf) {
                    this._reportBackgroundSkinError('apply-gameplay', skin || null, err);
                    callback?.(false);
                    return;
                }
                callback?.(this._applyBackgroundSkinFrameToGameplayNode(sf));
            });
        },

        refreshEquippedGameplayBackground(force: boolean = false, callback?: (ok: boolean) => void): void {
            const runtimeSceneName = typeof this.getRuntimeSceneName === 'function'
                ? String(this.getRuntimeSceneName('') || '')
                : 'Game';
            if (runtimeSceneName && runtimeSceneName !== 'Game') {
                callback?.(false);
                return;
            }
            if (!force && this._isGameplayBackgroundSkinCurrent()) {
                callback?.(true);
                return;
            }
            if (this.applyPreparedGameplayBackground()) {
                callback?.(true);
                return;
            }
            this.applyEquippedGameplayBackground(callback);
        },

        _refreshEquippedGameplayBackgroundForStartup(): void {
            const token = (Math.max(0, Math.floor(Number(this._gameplayBackgroundSkinRetryToken) || 0)) + 1);
            this._gameplayBackgroundSkinRetryToken = token;
            const schedule = (fn: () => void, delay: number) => {
                if (typeof this.scheduleOnce === 'function') {
                    this.scheduleOnce(fn, delay);
                    return;
                }
                fn();
            };
            const run = (attempt: number) => {
                if (this._gameplayBackgroundSkinRetryToken !== token) return;
                this.refreshEquippedGameplayBackground?.(attempt > 0, (ok: boolean) => {
                    if (ok || this._gameplayBackgroundSkinRetryToken !== token) return;
                    const nextAttempt = attempt + 1;
                    if (nextAttempt >= GAMEPLAY_BACKGROUND_SKIN_RETRY_DELAYS.length) return;
                    schedule(() => run(nextAttempt), GAMEPLAY_BACKGROUND_SKIN_RETRY_DELAYS[nextAttempt]);
                });
            };
            schedule(() => run(0), GAMEPLAY_BACKGROUND_SKIN_RETRY_DELAYS[0]);
        },

        startGameplayWithBackgroundSkinReady(data: any, activeLevelId?: number, init?: () => void): void {
            // 背景皮肤大图在 release 包中来自 skin CDN，不能作为关卡初始化前置条件。
            this._appliedGameplayBackgroundSkinId = 0;
            this._appliedGameplayBackgroundRefreshSeq = -1;
            if (init) init();
            else this.initGame(data, activeLevelId);
            this._refreshEquippedGameplayBackgroundForStartup?.();
        },

        equipBackgroundSkin(id: number, callback?: (ok: boolean, err?: Error | null) => void): void {
            this._loadBackgroundSkinConfig((config: BackgroundSkinConfig | null, err?: Error | null) => {
                const skin = config?.byId.get(toBackgroundSkinStorageId(id)) || null;
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
                if (isDefaultBackgroundSkinRow(skin)) {
                    this._persistEquippedBackgroundSkinSelection(skin);
                    this._clearEquippedBackgroundFrame(skin);
                    this.refreshEquippedGameplayBackground(true);
                    this.showToast?.('已使用', 1.2);
                    callback?.(true, null);
                    return;
                }
                this.loadBackgroundSkinSpriteFrame(skin, (sf, loadErr) => {
                    if (!sf) {
                        this._reportBackgroundSkinError('equip-load', skin, loadErr);
                        this.showToast?.('背景加载失败，请稍后重试', 1.8);
                        callback?.(false, loadErr || new Error(`[background-skin] equip background missing: ${skin.id}`));
                        return;
                    }
                    this._persistEquippedBackgroundSkinSelection(skin);
                    this._rememberEquippedBackgroundFrame(skin, sf);
                    this.refreshEquippedGameplayBackground(true);
                    this.showToast?.('已使用', 1.2);
                    callback?.(true, null);
                });
            });
        },

        watchBackgroundSkinUnlockAd(skin: BackgroundSkinRow, callback?: (ok: boolean) => void): void {
            if (!skin || skin.unlockType !== 'ad') {
                callback?.(false);
                return;
            }
            const need = Math.max(1, skin.unlockValue);
            const before = this.getBackgroundSkinAdProgress(skin.id);
            if (before >= need) {
                this.grantBackgroundSkin(skin.id);
                callback?.(true);
                return;
            }
            if (typeof this.runRewardedGrant !== 'function') {
                this.showToast?.('广告暂不可用，请稍后重试', 1.6);
                callback?.(false);
                return;
            }
            let nextProgress = before;
            let unlocked = false;
            const started = this.runRewardedGrant('background_skin_unlock', () => {
                nextProgress = this.addBackgroundSkinAdProgress(skin.id);
                unlocked = nextProgress >= need;
                if (unlocked) this.grantBackgroundSkin(skin.id);
                return true;
            }, {
                busyFlag: '_backgroundSkinAdUnlocking',
                adFailToast: '广告未完成，未获得解锁进度',
                grantFailToast: '皮肤解锁失败，请重试',
                successToast: () => unlocked ? '皮肤已解锁' : `解锁进度 ${Math.min(nextProgress, need)}/${need}`,
                onFinally: () => callback?.(nextProgress > before),
            });
            if (!started) {
                this.showToast?.('广告加载中，请稍后', 1.2);
                callback?.(false);
            }
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
            ensureHomeIconIdleWiggle(icon);
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
                            requireSkinPanelChild(content, SKIN_PANEL_SCROLL_CONTENT_NAME, 'BackgroundSkinPanel/Box/Content');
                            bindSkinPanelButton(this, close, 'BackgroundSkinPanel/Box/XBtn', () => this.closeBackgroundSkinPanel());
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
            this._backgroundSkinPanelVirtualState = null;
            this._cancelBackgroundSkinIconLoads?.('close-panel');
            const overlay = this._backgroundSkinPanelOverlay;
            this._backgroundSkinPanelOverlay = null;
            if (overlay?.isValid) {
                this._clearSpriteFramesBeforeDestroy?.(overlay);
                this._destroyDetachedNodeNextFrame?.(overlay);
            }
            this._clearBackgroundSkinCachedSpriteFrames('icon', 'close-panel');
        },

        setupBackgroundSkinPanelScroll(
            viewport: Node,
            viewportH: number,
            content: Node,
            totalH: number,
        ): void {
            viewport.targetOff(this);
            if (this._backgroundSkinPanelScrollInertiaStep) {
                this.unschedule(this._backgroundSkinPanelScrollInertiaStep);
                this._backgroundSkinPanelScrollInertiaStep = null;
            }
            this._backgroundSkinScrollSuppressClick = false;
            this._backgroundSkinScrollSuppressClickUntil = 0;

            if (totalH <= viewportH + 1) {
                content.setPosition(content.position.x, 0, 0);
                this.renderBackgroundSkinPanelVisibleCards?.();
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
                this.renderBackgroundSkinPanelVisibleCards?.();
                return clampedY;
            };
            const endDrag = () => {
                dragging = false;
                if (this._backgroundSkinScrollSuppressClick) {
                    this._backgroundSkinScrollSuppressClickUntil = Date.now() + 250;
                }
                if (Math.abs(velocity) < LEADERBOARD_SCROLL_MIN_SPEED) {
                    return;
                }
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
            const mask = content.getComponent(Mask);
            if (!mask) throw new Error('[background-skin-prefab] missing Mask: BackgroundSkinPanel/Box/Content');
            if (mask.type !== Mask.Type.GRAPHICS_RECT) {
                throw new Error('[background-skin-prefab] Content Mask must be GRAPHICS_RECT');
            }
            const scrollContent = requireSkinPanelChild(content, SKIN_PANEL_SCROLL_CONTENT_NAME, 'BackgroundSkinPanel/Box/Content');
            const scrollContentUi = scrollContent.getComponent(UITransform);
            if (!scrollContentUi) {
                throw new Error('[background-skin-prefab] missing UITransform: BackgroundSkinPanel/Box/Content/' + SKIN_PANEL_SCROLL_CONTENT_NAME);
            }
            scrollContent.active = true;
            scrollContent.layer = content.layer;

            const guideSlots = scrollContent.children
                .filter((child: Node) => SKIN_PANEL_CARD_SLOT_PATTERN.test(child.name))
                .sort((a: Node, b: Node) => {
                    const aIdx = Number(a.name.match(/\d+$/)?.[0] || 0);
                    const bIdx = Number(b.name.match(/\d+$/)?.[0] || 0);
                    return aIdx - bIdx;
                });
            const template = guideSlots[0];
            const templateUi = template?.getComponent(UITransform);
            if (!template || !templateUi) {
                throw new Error('[background-skin-prefab] missing SkinCardSlot0 template');
            }

            for (const child of scrollContent.children.slice()) {
                if (!child.name.startsWith('SkinCard_')) continue;
                this._clearSpriteFramesBeforeDestroy?.(child);
                child.destroy();
            }

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
            const bottomY = rowYs.length > 1 ? rowYs[rowYs.length - 1] : topY;
            const topPadding = Math.max(0, viewportH / 2 - topY);
            const bottomPadding = rowYs.length > 1 ? Math.max(0, viewportH / 2 + bottomY) : topPadding;
            const columnCount = Math.max(1, columnXs.length);
            const rowCount = Math.max(1, Math.ceil(rows.length / columnCount));
            const totalH = Math.max(viewportH, topPadding + Math.max(0, rowCount - 1) * rowPitch + bottomPadding);
            const startY = totalH / 2 - topPadding;
            scrollContentUi.setContentSize(viewportW, totalH);
            for (const guideSlot of guideSlots) {
                guideSlot.active = false;
            }

            const visibleEntries: Array<{ card: Node; skin: BackgroundSkinRow }> = [];
            let refreshActions = () => {};
            const consumeSuppressedClick = () => {
                const suppressUntil = Number(this._backgroundSkinScrollSuppressClickUntil) || 0;
                if (this._backgroundSkinScrollSuppressClick && Date.now() <= suppressUntil) {
                    this._backgroundSkinScrollSuppressClick = false;
                    this._backgroundSkinScrollSuppressClickUntil = 0;
                    return true;
                }
                this._backgroundSkinScrollSuppressClick = false;
                this._backgroundSkinScrollSuppressClickUntil = 0;
                return false;
            };

            const bindCardAction = (card: Node, skin: BackgroundSkinRow) => {
                if (!card.isValid) return;
                const owned = this.isBackgroundSkinOwned(skin.id);
                const equippedId = this.getEquippedBackgroundSkinId();
                const action = requireSkinPanelChild(card, 'ActionBtn', card.name);
                const label = requireSkinPanelLabel(action, 'ActionLbl', card.name + '/ActionBtn');
                const adIcon = requireSkinPanelChild(action, 'AdIcon', card.name + '/ActionBtn');
                requireSkinPanelSprite(action, 'AdIcon', card.name + '/ActionBtn');
                const setActionVisual = (showAdIcon: boolean, text: string = '') => {
                    label.node.active = !showAdIcon;
                    adIcon.active = showAdIcon;
                    label.string = text;
                };
                let actionLabel = '';
                let canWatchAd = false;
                let showAdIcon = false;
                if (owned) {
                    actionLabel = skin.id === equippedId ? '已使用' : '使用';
                } else if (skin.unlockType === 'level') {
                    actionLabel = '通关' + skin.unlockValue + '关';
                } else if (skin.unlockType === 'ad') {
                    showAdIcon = true;
                    canWatchAd = true;
                } else {
                    actionLabel = '未获得';
                }
                setActionVisual(showAdIcon, actionLabel);
                action.targetOff(this);
                const actionButton = requireSkinPanelButton(action, card.name + '/ActionBtn');
                const isEquipped = owned && skin.id === equippedId;
                actionButton.interactable = isEquipped || (owned && skin.id !== equippedId) || canWatchAd;
                if (owned && skin.id !== equippedId) {
                    bindSkinPanelButton(this, action, card.name + '/ActionBtn', () => {
                        if (consumeSuppressedClick()) return;
                        const button = action.getComponent(Button);
                        if (button) button.interactable = false;
                        setActionVisual(false, '加载中');
                        this.equipBackgroundSkin(skin.id, (ok) => {
                            if (ok) refreshActions();
                            else {
                                setActionVisual(false, '使用');
                                const activeButton = action.getComponent(Button);
                                if (activeButton) activeButton.interactable = true;
                            }
                        });
                    });
                } else if (canWatchAd) {
                    bindSkinPanelButton(this, action, card.name + '/ActionBtn', () => {
                        if (consumeSuppressedClick()) return;
                        const button = action.getComponent(Button);
                        if (button) button.interactable = false;
                        setActionVisual(true);
                        this.watchBackgroundSkinUnlockAd(skin, () => {
                            refreshActions();
                        });
                    });
                }
            };

            const renderCard = (card: Node, skin: BackgroundSkinRow) => {
                card.active = true;
                card.layer = scrollContent.layer;
                card.name = 'SkinCard_' + skin.id;
                (card as any).__backgroundSkinSlotId = skin.id;
                (card as any).__backgroundSkinIconToken = ((Number((card as any).__backgroundSkinIconToken) || 0) + 1);
                const iconToken = (card as any).__backgroundSkinIconToken;
                const preview = requireSkinPanelChild(card, 'Preview', card.name);
                const previewSprite = requireSkinPanelSprite(card, 'Preview', card.name);
                previewSprite.spriteFrame = null;
                const isCurrentIconTarget = () => {
                    return !!preview.isValid
                        && !!card.isValid
                        && card.active
                        && (card as any).__backgroundSkinSlotId === skin.id
                        && (card as any).__backgroundSkinIconToken === iconToken;
                };
                this.queueBackgroundSkinIconSpriteFrame(skin, isCurrentIconTarget, (sf, err) => {
                    if (!isCurrentIconTarget()) return;
                    if ((card as any).__backgroundSkinSlotId !== skin.id) return;
                    if (!sf) {
                        this._reportBackgroundSkinError('panel-icon', skin, err);
                        return;
                    }
                    if (typeof this.scheduleSpriteFrameApply === 'function') {
                        this.scheduleSpriteFrameApply(previewSprite, sf, `skin-panel-icon:${skin.id}`);
                    } else {
                        previewSprite.spriteFrame = sf;
                    }
                });
                bindCardAction(card, skin);
            };

            refreshActions = () => {
                for (const entry of visibleEntries) {
                    bindCardAction(entry.card, entry.skin);
                }
            };

            const visibleRowCount = Math.max(1, Math.ceil(viewportH / rowPitch) + BACKGROUND_SKIN_PANEL_BUFFER_ROWS * 2);
            const poolSize = Math.min(rows.length, Math.max(columnCount, visibleRowCount * columnCount));
            const pool: Node[] = [];
            for (let i = 0; i < poolSize; i++) {
                const card = instantiate(template);
                card.name = 'SkinCardPool_' + i;
                card.active = false;
                scrollContent.addChild(card);
                pool.push(card);
            }
            this._backgroundSkinPanelVirtualState = {
                rows,
                pool,
                columnXs,
                rowPitch,
                startY,
                columnCount,
                viewportH,
                scrollContent,
                visibleEntries,
                renderCard,
            };
            this.setupBackgroundSkinPanelScroll(content, viewportH, scrollContent, totalH);
            this.renderBackgroundSkinPanelVisibleCards();
        },

        renderBackgroundSkinPanelVisibleCards(): void {
            const state = this._backgroundSkinPanelVirtualState;
            if (!state?.scrollContent?.isValid || !Array.isArray(state.rows) || !Array.isArray(state.pool)) return;
            const rows = state.rows as BackgroundSkinRow[];
            const pool = state.pool as Node[];
            const columnXs = state.columnXs as number[];
            const rowPitch = Math.max(1, Number(state.rowPitch) || 1);
            const startY = Number(state.startY) || 0;
            const columnCount = Math.max(1, Number(state.columnCount) || 1);
            const viewportH = Math.max(1, Number(state.viewportH) || 1);
            const scrollContent = state.scrollContent as Node;
            const bufferPx = rowPitch * BACKGROUND_SKIN_PANEL_BUFFER_ROWS;
            const minY = -viewportH / 2 - bufferPx - scrollContent.position.y;
            const maxY = viewportH / 2 + bufferPx - scrollContent.position.y;
            const visibleIndices: number[] = [];

            for (let index = 0; index < rows.length; index++) {
                const row = Math.floor(index / columnCount);
                const y = startY - row * rowPitch;
                if (y < minY || y > maxY) continue;
                visibleIndices.push(index);
            }

            state.visibleEntries.length = 0;
            for (let i = 0; i < pool.length; i++) {
                const card = pool[i];
                const index = visibleIndices[i];
                if (index === undefined || !card?.isValid) {
                    if (card?.isValid) {
                        (card as any).__backgroundSkinSlotId = 0;
                        card.active = false;
                    }
                    continue;
                }
                const skin = rows[index];
                const row = Math.floor(index / columnCount);
                const col = index % columnCount;
                card.setPosition(columnXs[col] || 0, startY - row * rowPitch, 0);
                if ((card as any).__backgroundSkinSlotId !== skin.id) {
                    state.renderCard(card, skin);
                } else {
                    card.active = true;
                }
                state.visibleEntries.push({ card, skin });
            }
        },

    });
}
