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
    Vec3,
    assetManager,
    instantiate,
    sys,
} from '../GameCtrlShared';
import { ensureHomeIconIdleWiggle } from '../HomeIconIdleWiggle';
import { getMiniGameBuildMode } from '../MiniGamePlatform';
import { SkinResourceCdnService, type SkinLiveManifest, type SkinRemoteAsset } from '../SkinResourceCdnService';

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
const LOCAL_BACKGROUND_SKIN_SHORT_ID_SET = new Set<number>([2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 16, 21, 22, 99]);
const SKIN_PANEL_NAME = 'BackgroundSkinPanelOverlay';
const SKIN_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/BackgroundSkinPanel';
const SKIN_PANEL_SCROLL_CONTENT_NAME = 'SkinScrollContent';
const SKIN_PANEL_COLUMN_XS = [-142, 142];
const SKIN_PANEL_ROW_PITCH = 350;
const SKIN_PANEL_TOP_ROW_VIEW_Y = 160;
const GAMEPLAY_BACKGROUND_SKIN_RETRY_DELAYS = [0, 0.25, 0.75, 1.5, 3, 8, 16, 31];

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
    if (getMiniGameBuildMode() !== 'release') {
        console.warn('[background-skin]', phase, payload);
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
    return getMiniGameBuildMode() !== 'release';
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
                    const iconAsset = raw.assets?.icon || null;
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
                callback(cached, null);
                return;
            }
            if (skin.backgroundAsset) {
                const pendingKey = `background:${skin.id}:skinCdn:${skin.backgroundAsset.hash || skin.backgroundAsset.url}`;
                this._loadRemoteSkinSpriteFrameAsset(skin.backgroundAsset, pendingKey, (sf, err) => {
                    if (sf) this._backgroundSkinFrameCache.set(skin.id, sf);
                    callback(sf, err || null);
                });
                return;
            }
            const pendingKey = `background:${skin.id}:${skin.assetBundle}:${skin.assetKey}`;
            this._loadSkinSpriteFrameAsset(skin.assetBundle, skin.assetKey, pendingKey, (sf, err) => {
                if (sf && this.getEquippedBackgroundSkinId() === skin.id) this._backgroundSkinFrameCache.set(skin.id, sf);
                callback(sf, err || null);
            });
        },

        loadBackgroundSkinIconSpriteFrame(skin: BackgroundSkinRow, callback: (sf: SpriteFrame | null, err?: Error | null) => void): void {
            const cached = this._backgroundSkinIconCache.get(skin.id);
            if (cached) {
                callback(cached, null);
                return;
            }
            if (skin.iconAsset) {
                const pendingKey = `icon:${skin.id}:skinCdn:${skin.iconAsset.hash || skin.iconAsset.url}`;
                this._loadRemoteSkinSpriteFrameAsset(skin.iconAsset, pendingKey, (sf, err) => {
                    if (sf) this._backgroundSkinIconCache.set(skin.id, sf);
                    callback(sf, err || null);
                });
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
            this._backgroundSkinFrameCache.clear();
            this._backgroundSkinFrameCache.set(skin.id, sf);
        },

        _clearEquippedBackgroundFrame(skin?: BackgroundSkinRow | null): void {
            this._equippedBackgroundSkinId = skin ? skin.id : DEFAULT_BACKGROUND_SKIN_ID;
            this._equippedBackgroundSkinFrame = null;
            this._backgroundSkinFrameCache.clear();
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
            this.syncBackgroundSkinCloudState?.();
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

        _syncDefaultOwnedBackgroundSkins(config: BackgroundSkinConfig): void {
            const owned = this._readBackgroundSkinOwnedIds();
            for (const row of config.rows) {
                if (row.isDefault || row.unlockType === 'default' || row.unlockType === 'free' || this.isBackgroundSkinLevelUnlocked(row) || this.isBackgroundSkinAdUnlocked(row)) owned.add(row.id);
            }
            this._writeBackgroundSkinOwnedIds(owned);
        },

        isBackgroundSkinOwned(id: number): boolean {
            const config = this._backgroundSkinConfigCache as BackgroundSkinConfig | null;
            const safeId = toBackgroundSkinStorageId(id);
            if (!safeId) return false;
            const row = config?.byId.get(safeId);
            if (row?.isDefault || row?.unlockType === 'default' || row?.unlockType === 'free') return true;
            if (row && (this.isBackgroundSkinLevelUnlocked(row) || this.isBackgroundSkinAdUnlocked(row))) return true;
            return this._readBackgroundSkinOwnedIds().has(safeId);
        },

        grantBackgroundSkin(id: number): boolean {
            const safeId = toBackgroundSkinStorageId(id);
            if (!safeId) return false;
            const owned = this._readBackgroundSkinOwnedIds();
            const hadOwned = owned.has(safeId);
            owned.add(safeId);
            this._writeBackgroundSkinOwnedIds(owned);
            if (!hadOwned) this.queueCloudGameStateSync?.();
            return true;
        },

        captureBackgroundSkinCloudState(): Record<string, unknown> {
            return {
                ownedBackgroundSkinIds: this.getOwnedBackgroundSkinIds(),
                backgroundSkinAdProgress: normalizeBackgroundSkinAdProgress(this._readBackgroundSkinAdProgress()),
                equippedBackgroundSkinId: this.getCloudSyncEquippedBackgroundSkinId(),
                equippedBackgroundSkinUpdatedAt: this.getCloudSyncEquippedBackgroundSkinUpdatedAt(),
            };
        },

        applyBackgroundSkinCloudState(gameState: Record<string, unknown> | null | undefined, applyEquipped: boolean = true): void {
            if (!gameState || typeof gameState !== 'object') return;
            const owned = this._readBackgroundSkinOwnedIds();
            for (const id of normalizeBackgroundSkinIdList(gameState.ownedBackgroundSkinIds)) owned.add(id);
            for (const id of normalizeBackgroundSkinIdList(gameState.backgroundSkinOwnedIds)) owned.add(id);
            this._writeBackgroundSkinOwnedIds(owned);
            const cloudProgress = normalizeBackgroundSkinAdProgress(gameState.backgroundSkinAdProgress);
            if (Object.keys(cloudProgress).length > 0) {
                this._writeBackgroundSkinAdProgress(mergeBackgroundSkinAdProgress(this._readBackgroundSkinAdProgress(), cloudProgress));
            }
            if (applyEquipped) {
                this.applyCloudBackgroundSkinState(
                    Array.from(owned),
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
            emitBackgroundSkinDiagnostic('asset-error', payload);
            console.error('[background-skin] asset error', payload);
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
            addCandidate(cachedSkin);
            addCandidate(localSkin);
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
            sprite.spriteFrame = sf;
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
                            requireSkinPanelChild(content, 'SkinCardTemplate', 'BackgroundSkinPanel/Box/Content');
                            this.bindPanelButton(close, () => this.closeBackgroundSkinPanel());
                            this._backgroundSkinPanelOverlay = overlay;
                            this.renderBackgroundSkinPanelCards(box, content, config.rows);
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

        setupBackgroundSkinPanelScroll(touchSurface: Node, viewport: Node, content: Node, viewportW: number, viewportH: number, totalH: number): void {
            touchSurface.targetOff(this);
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
            const viewportUi = viewport.getComponent(UITransform);
            const anchorX = viewportUi?.anchorX ?? 0.5;
            const anchorY = viewportUi?.anchorY ?? 0.5;
            const minLocalX = -viewportW * anchorX;
            const maxLocalX = viewportW * (1 - anchorX);
            const minLocalY = -viewportH * anchorY;
            const maxLocalY = viewportH * (1 - anchorY);

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
            const isTouchInsideViewport = (e: EventTouch): boolean => {
                if (!viewportUi || !viewport.isValid) return false;
                const uiPos = e.getUILocation();
                const local = viewportUi.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
                return local.x >= minLocalX && local.x <= maxLocalX && local.y >= minLocalY && local.y <= maxLocalY;
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
                    if (!touchSurface.isValid || !viewport.isValid || !content.isValid) {
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

            touchSurface.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
                if (!isTouchInsideViewport(e)) return;
                stopInertia();
                startY = e.getUILocation().y;
                lastY = startY;
                lastMoveAt = Date.now();
                velocity = 0;
                dragging = true;
                this._backgroundSkinScrollSuppressClick = false;
            }, this, true);
            touchSurface.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
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
            touchSurface.on(Node.EventType.TOUCH_END, endDrag, this, true);
            touchSurface.on(Node.EventType.TOUCH_CANCEL, endDrag, this, true);
        },

        renderBackgroundSkinPanelCards(touchSurface: Node, content: Node, rows: BackgroundSkinRow[]): void {
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
                const actionSpriteColor = !owned && skin.unlockType !== 'ad' ? new Color('#BDBDBD') : Color.WHITE;
                tintSkinPanelSprite(card, 'ActionBtn', card.name, actionSpriteColor);
                const label = requireSkinPanelLabel(action, 'ActionLbl', `${card.name}/ActionBtn`);
                let actionLabel = '';
                let canWatchAd = false;
                if (owned) {
                    actionLabel = skin.id === equippedId ? '已使用' : '使用';
                } else if (skin.unlockType === 'level') {
                    actionLabel = `通关${skin.unlockValue}关`;
                } else if (skin.unlockType === 'ad') {
                    const adProgress = Math.min(this.getBackgroundSkinAdProgress(skin.id), Math.max(1, skin.unlockValue));
                    actionLabel = `看广告 ${adProgress}/${Math.max(1, skin.unlockValue)}`;
                    canWatchAd = true;
                } else {
                    actionLabel = '未获得';
                }
                label.string = actionLabel;
                action.targetOff(this);
                const actionButton = action.getComponent(Button) || action.addComponent(Button);
                actionButton.interactable = (owned && skin.id !== equippedId) || canWatchAd;
                if (owned && skin.id !== equippedId) {
                    this.bindPanelButton(action, () => {
                        if (consumeSuppressedClick()) return;
                        const button = action.getComponent(Button);
                        if (button) button.interactable = false;
                        label.string = '加载中';
                        this.equipBackgroundSkin(skin.id, (ok) => {
                            if (ok) this.renderBackgroundSkinPanelCards(touchSurface, content, rows);
                            else {
                                label.string = '使用';
                                const activeButton = action.getComponent(Button);
                                if (activeButton) activeButton.interactable = true;
                            }
                        });
                    });
                } else if (canWatchAd) {
                    this.bindPanelButton(action, () => {
                        if (consumeSuppressedClick()) return;
                        const button = action.getComponent(Button);
                        if (button) button.interactable = false;
                        label.string = '广告中';
                        this.watchBackgroundSkinUnlockAd(skin, () => {
                            this.renderBackgroundSkinPanelCards(touchSurface, content, rows);
                        });
                    });
                }
            });
            this.setupBackgroundSkinPanelScroll(touchSurface, content, scrollContent, viewportW, viewportH, totalH);
        },
    });
}
