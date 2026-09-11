import {
    AudioMgr,
    Button,
    Bundle,
    Color,
    Graphics,
    ImageAsset,
    Label,
    Node,
    PINDD_BEAN_VARIANTS,
    Rect,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    UserStateSyncMgr,
    assetManager,
    sys,
} from '../GameCtrlShared';
import type { LevelData } from '../GameCtrlShared';
import { runtimeLog, runtimeWarn } from '../RuntimeLog';

export type BeanSkinRow = {
    id: number;
    key: string;
    sort: number;
    isDefault: boolean;
    resourceMode: 'bootstrap_existing' | 'game_assets_atlas';
    atlasDataKey: string;
    atlasTextureKey: string;
    iconKey: string;
    previewColorId: number;
    unlockType: 'default' | 'ad';
    unlockValue: number;
    enabled: boolean;
};

type BeanSkinConfig = {
    version: number;
    defaultEquipped: number;
    rows: BeanSkinRow[];
    byId: Map<number, BeanSkinRow>;
};

type BeanSkinAtlasOwner = {
    skinId: number;
    frames: Map<string, SpriteFrame>;
    texture: Texture2D;
    imageAsset: ImageAsset | null;
    releaseMode: 'asset' | 'dynamic';
    resourcesRetained?: boolean;
    released?: boolean;
};

const BEAN_SKIN_CONFIG_PATH = 'BeanSkins/bean-skins';
const DEFAULT_BEAN_SKIN_ID = 2000;
const BEAN_SKIN_IDS = [2000, 2001, 2002, 2003, 2004];
const BEAN_SKIN_ID_SET = new Set<number>(BEAN_SKIN_IDS);
const LS_OWNED_BEAN_SKINS = 'pdd.skin.bean.owned';
const LS_EQUIPPED_BEAN_SKIN_STATE = 'pdd.skin.bean.equippedState';
const EXPECTED_BEAN_FRAME_COUNT = 60;
const MIN_BEAN_COLOR_ID = 1;
const MAX_BEAN_COLOR_ID = 20;

function normalizeBeanSkinId(value: unknown, fallback: number = 0): number {
    const id = Math.floor(Number(value));
    return BEAN_SKIN_ID_SET.has(id) ? id : fallback;
}

function normalizeBeanSkinIdList(value: unknown): number[] {
    const values = Array.isArray(value) ? value : [];
    const ids = values
        .map((id) => normalizeBeanSkinId(id))
        .filter((id) => id > 0);
    ids.push(DEFAULT_BEAN_SKIN_ID);
    return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function normalizeTimestamp(value: unknown): number {
    const timestamp = Math.floor(Number(value));
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function parseEquippedBeanSkinState(raw: string | null): { id: number; updatedAt: number } {
    if (!raw) return { id: 0, updatedAt: 0 };
    try {
        const parsed = JSON.parse(raw);
        return {
            id: normalizeBeanSkinId(parsed?.id),
            updatedAt: normalizeTimestamp(parsed?.updatedAt),
        };
    } catch (_) {
        return { id: 0, updatedAt: 0 };
    }
}

function expectedBeanFrameNames(): string[] {
    const names: string[] = [];
    for (let colorId = MIN_BEAN_COLOR_ID; colorId <= MAX_BEAN_COLOR_ID; colorId++) {
        const colorKey = `b${colorId < 10 ? `00${colorId}` : `0${colorId}`}`;
        for (const variant of PINDD_BEAN_VARIANTS) names.push(`${colorKey}_${variant}`);
    }
    return names;
}

const EXPECTED_BEAN_FRAME_NAMES = expectedBeanFrameNames();

function requireBeanPanelChild(parent: Node, name: string, context: string): Node {
    const child = parent.getChildByName(name);
    if (!child?.isValid) throw new Error(`[bean-skin-panel] missing node: ${context}/${name}`);
    return child;
}

function requireBeanPanelSprite(parent: Node, name: string, context: string): Sprite {
    const node = requireBeanPanelChild(parent, name, context);
    const sprite = node.getComponent(Sprite);
    if (!sprite) throw new Error(`[bean-skin-panel] missing Sprite: ${context}/${name}`);
    return sprite;
}

function requireBeanPanelLabel(parent: Node, name: string, context: string): Label {
    const node = requireBeanPanelChild(parent, name, context);
    const label = node.getComponent(Label);
    if (!label) throw new Error(`[bean-skin-panel] missing Label: ${context}/${name}`);
    return label;
}

function bindBeanPanelAction(runtime: any, node: Node, handler: () => void): Button {
    node.targetOff(runtime);
    const button = node.getComponent(Button);
    if (!button) throw new Error(`[bean-skin-panel] missing Button: ${node.name}`);
    button.interactable = true;
    node.on(Button.EventType.CLICK, handler, runtime);
    return button;
}

function parseBeanSkinConfig(json: any): BeanSkinConfig {
    const sourceRows = Array.isArray(json?.skins) ? json.skins : [];
    const rows = sourceRows
        .filter((raw: any) => raw?.enabled !== false)
        .map((raw: any): BeanSkinRow => {
            const id = normalizeBeanSkinId(raw?.id);
            const expectedIndex = id > 0 ? id - DEFAULT_BEAN_SKIN_ID + 1 : 0;
            const expectedKey = expectedIndex > 0 ? `bean_skin_0${expectedIndex}` : '';
            const resourceMode = String(raw?.resourceMode || '') as BeanSkinRow['resourceMode'];
            const unlockType = String(raw?.unlockType || '') as BeanSkinRow['unlockType'];
            const row: BeanSkinRow = {
                id,
                key: String(raw?.key || ''),
                sort: Math.floor(Number(raw?.sort) || 0),
                isDefault: !!raw?.isDefault,
                resourceMode,
                atlasDataKey: String(raw?.atlasDataKey || ''),
                atlasTextureKey: String(raw?.atlasTextureKey || ''),
                iconKey: String(raw?.iconKey || ''),
                previewColorId: Math.floor(Number(raw?.previewColorId) || 0),
                unlockType,
                unlockValue: Math.max(0, Math.floor(Number(raw?.unlockValue) || 0)),
                enabled: true,
            };
            const isDefault = id === DEFAULT_BEAN_SKIN_ID;
            if (!id || row.key !== expectedKey || row.sort !== expectedIndex || row.isDefault !== isDefault) {
                throw new Error(`[bean-skin] invalid identity row: ${JSON.stringify(raw)}`);
            }
            if (!row.iconKey || row.previewColorId < MIN_BEAN_COLOR_ID || row.previewColorId > MAX_BEAN_COLOR_ID) {
                throw new Error(`[bean-skin] invalid preview row: ${JSON.stringify(raw)}`);
            }
            if (isDefault) {
                if (row.resourceMode !== 'bootstrap_existing' || row.unlockType !== 'default' || row.unlockValue !== 0) {
                    throw new Error(`[bean-skin] invalid default row: ${JSON.stringify(raw)}`);
                }
            } else if (
                row.resourceMode !== 'game_assets_atlas'
                || !row.atlasDataKey
                || !row.atlasTextureKey
                || row.unlockType !== 'ad'
                || row.unlockValue !== 1
            ) {
                throw new Error(`[bean-skin] invalid unlock/resource row: ${JSON.stringify(raw)}`);
            }
            return row;
        })
        .sort((a: BeanSkinRow, b: BeanSkinRow) => a.sort - b.sort || a.id - b.id);
    if (rows.length !== BEAN_SKIN_IDS.length || rows.some((row, index) => row.id !== BEAN_SKIN_IDS[index])) {
        throw new Error(`[bean-skin] catalog must contain exactly ids ${BEAN_SKIN_IDS.join(',')}`);
    }
    if (normalizeBeanSkinId(json?.defaultEquipped) !== DEFAULT_BEAN_SKIN_ID) {
        throw new Error(`[bean-skin] catalog default must be ${DEFAULT_BEAN_SKIN_ID}`);
    }
    return {
        version: Math.max(1, Math.floor(Number(json?.version) || 1)),
        defaultEquipped: DEFAULT_BEAN_SKIN_ID,
        rows,
        byId: new Map(rows.map((row) => [row.id, row])),
    };
}

export function installBeanSkinModule(target: any): void {
    Object.assign(target, {
        _loadBeanSkinConfig(callback: (config: BeanSkinConfig | null, err?: Error | null) => void): void {
            if (this._beanSkinConfigCache) {
                callback(this._beanSkinConfigCache, null);
                return;
            }
            if (this._beanSkinConfigLoadingCallbacks) {
                this._beanSkinConfigLoadingCallbacks.push(callback);
                return;
            }
            this._beanSkinConfigLoadingCallbacks = [callback];
            const finish = (config: BeanSkinConfig | null, err?: Error | null) => {
                if (config) this._beanSkinConfigCache = config;
                const callbacks = this._beanSkinConfigLoadingCallbacks || [];
                this._beanSkinConfigLoadingCallbacks = null;
                for (const done of callbacks) done(config, err || null);
            };
            this._withGameAssetsBundle((bundle: Bundle | null) => {
                if (!bundle) {
                    finish(null, new Error('[bean-skin] gameAssets bundle unavailable'));
                    return;
                }
                this._loadAtlasDataFromBundle(bundle, BEAN_SKIN_CONFIG_PATH, 'bean-skin catalog', (err: Error | null, json: any) => {
                    if (err || !json) {
                        finish(null, err || new Error('[bean-skin] catalog unavailable'));
                        return;
                    }
                    try {
                        finish(parseBeanSkinConfig(json), null);
                    } catch (parseErr) {
                        finish(null, parseErr instanceof Error ? parseErr : new Error('[bean-skin] catalog invalid'));
                    }
                });
            });
        },

        loadBeanSkinIconSpriteFrame(
            skin: BeanSkinRow,
            callback: (frame: SpriteFrame | null, err?: Error | null) => void,
        ): void {
            const isCurrent = () => !this._beanSkinIconLoadsCancelled
                && !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            if (!isCurrent()) return;
            const cached = this._beanSkinIconCache.get(skin.id) as SpriteFrame | undefined;
            if (cached?.isValid) {
                callback(cached, null);
                return;
            }
            const queued = this._beanSkinIconLoadingCallbacks.get(skin.id) as Array<(frame: SpriteFrame | null, err?: Error | null) => void> | undefined;
            if (queued) {
                queued.push(callback);
                return;
            }
            this._beanSkinIconLoadingCallbacks.set(skin.id, [callback]);
            const finish = (frame: SpriteFrame | null, err?: Error | null) => {
                if (!isCurrent()) {
                    this._beanSkinIconLoadingCallbacks.delete(skin.id);
                    if (frame?.isValid) {
                        // Schedule reference-checked cleanup without invalidating another scene's icon.
                        frame.addRef();
                        frame.decRef();
                    }
                    return;
                }
                if (frame) {
                    frame.addRef();
                    this._beanSkinIconCache.set(skin.id, frame);
                }
                const callbacks = this._beanSkinIconLoadingCallbacks.get(skin.id) || [];
                this._beanSkinIconLoadingCallbacks.delete(skin.id);
                for (const done of callbacks) {
                    if (!isCurrent()) break;
                    done(frame, err || null);
                }
            };
            this._withGameAssetsBundle((bundle: Bundle | null) => {
                if (!bundle) {
                    finish(null, new Error('[bean-skin] icon bundle unavailable'));
                    return;
                }
                const candidates = [`${skin.iconKey}/spriteFrame`, skin.iconKey];
                const tryCandidate = (index: number) => {
                    if (!isCurrent()) {
                        finish(null);
                        return;
                    }
                    if (index >= candidates.length) {
                        finish(null, new Error(`[bean-skin] icon missing: ${skin.iconKey}`));
                        return;
                    }
                    bundle.load(candidates[index], SpriteFrame, (err: Error | null, frame: SpriteFrame | null) => {
                        if (!err && frame) {
                            finish(frame, null);
                            return;
                        }
                        tryCandidate(index + 1);
                    });
                };
                tryCandidate(0);
            });
        },

        _readBeanSkinOwnedIds(): Set<number> {
            try {
                const parsed = JSON.parse(sys.localStorage.getItem(LS_OWNED_BEAN_SKINS) || '[]');
                return new Set(normalizeBeanSkinIdList(parsed));
            } catch (_) {
                return new Set<number>([DEFAULT_BEAN_SKIN_ID]);
            }
        },

        _writeBeanSkinOwnedIds(ids: Set<number>): void {
            sys.localStorage.setItem(LS_OWNED_BEAN_SKINS, JSON.stringify(normalizeBeanSkinIdList(Array.from(ids))));
        },

        getOwnedBeanSkinIds(): number[] {
            return Array.from(this._readBeanSkinOwnedIds() as Set<number>).sort((a, b) => a - b);
        },

        isBeanSkinOwned(id: number): boolean {
            const safeId = normalizeBeanSkinId(id);
            return safeId > 0 && this._readBeanSkinOwnedIds().has(safeId);
        },

        grantBeanSkin(id: number): boolean {
            const safeId = normalizeBeanSkinId(id);
            if (!safeId) return false;
            const owned = this._readBeanSkinOwnedIds();
            const hadOwned = owned.has(safeId);
            owned.add(safeId);
            this._writeBeanSkinOwnedIds(owned);
            if (!hadOwned) this.queueCloudGameStateSync?.();
            return true;
        },

        _readEquippedBeanSkinState(): { id: number; updatedAt: number } {
            return parseEquippedBeanSkinState(sys.localStorage.getItem(LS_EQUIPPED_BEAN_SKIN_STATE));
        },

        _writeEquippedBeanSkinState(id: number, updatedAt: number): void {
            const safeId = normalizeBeanSkinId(id);
            const safeUpdatedAt = normalizeTimestamp(updatedAt);
            if (!safeId || !safeUpdatedAt) {
                sys.localStorage.removeItem(LS_EQUIPPED_BEAN_SKIN_STATE);
                return;
            }
            sys.localStorage.setItem(LS_EQUIPPED_BEAN_SKIN_STATE, JSON.stringify({ id: safeId, updatedAt: safeUpdatedAt }));
        },

        getEquippedBeanSkinId(): number {
            const cachedId = normalizeBeanSkinId(this._equippedBeanSkinId);
            if (cachedId && this.isBeanSkinOwned(cachedId)) return cachedId;
            const storedId = this._readEquippedBeanSkinState().id;
            const equippedId = storedId && this.isBeanSkinOwned(storedId) ? storedId : DEFAULT_BEAN_SKIN_ID;
            this._equippedBeanSkinId = equippedId;
            return equippedId;
        },

        getEquippedBeanSkinUpdatedAt(): number {
            const state = this._readEquippedBeanSkinState();
            return state.id && this.isBeanSkinOwned(state.id) ? state.updatedAt : 0;
        },

        getRuntimeBeanSkinId(): number {
            return normalizeBeanSkinId(this._appliedBeanSkinId) || this.getEquippedBeanSkinId();
        },

        _persistEquippedBeanSkinSelection(id: number): void {
            const safeId = normalizeBeanSkinId(id);
            if (!safeId || !this.isBeanSkinOwned(safeId)) {
                throw new Error(`[bean-skin] cannot equip unowned skin: ${id}`);
            }
            this._writeEquippedBeanSkinState(safeId, Date.now());
            this._equippedBeanSkinId = safeId;
            this.queueCloudGameStateSync?.();
            void UserStateSyncMgr.inst.flushPendingSave();
        },

        captureBeanSkinCloudState(): Record<string, unknown> {
            const state = this._readEquippedBeanSkinState();
            const equippedId = state.id && this.isBeanSkinOwned(state.id) && state.updatedAt > 0 ? state.id : 0;
            return {
                ownedBeanSkinIds: this.getOwnedBeanSkinIds(),
                equippedBeanSkinId: equippedId,
                equippedBeanSkinUpdatedAt: equippedId ? state.updatedAt : 0,
            };
        },

        applyBeanSkinCloudState(gameState: Record<string, unknown> | null | undefined): void {
            if (!gameState || typeof gameState !== 'object') return;
            const owned = this._readBeanSkinOwnedIds();
            for (const id of normalizeBeanSkinIdList(gameState.ownedBeanSkinIds)) owned.add(id);
            this._writeBeanSkinOwnedIds(owned);
            const local = this._readEquippedBeanSkinState();
            const cloudId = normalizeBeanSkinId(gameState.equippedBeanSkinId);
            const cloudUpdatedAt = normalizeTimestamp(gameState.equippedBeanSkinUpdatedAt);
            const cloudPairValid = cloudId > 0 && cloudUpdatedAt > 0 && owned.has(cloudId);
            if (cloudPairValid && cloudUpdatedAt > local.updatedAt) {
                this._writeEquippedBeanSkinState(cloudId, cloudUpdatedAt);
                this._equippedBeanSkinId = cloudId;
                if (this.getRuntimeSceneName?.('Home') !== 'Game') this._appliedBeanSkinId = 0;
            } else {
                this._equippedBeanSkinId = local.id && owned.has(local.id) ? local.id : DEFAULT_BEAN_SKIN_ID;
            }
            this.refreshBeanSkinPanelCards?.();
        },

        _hasCompleteBeanSkinFrameMap(frames: Map<string, SpriteFrame> | null | undefined): boolean {
            if (!frames || frames.size < EXPECTED_BEAN_FRAME_COUNT) return false;
            return EXPECTED_BEAN_FRAME_NAMES.every((name) => {
                const frame = frames.get(name);
                return !!frame?.isValid && !!frame.texture?.isValid;
            });
        },

        _createBeanSkinAtlasOwner(
            skinId: number,
            atlasData: any,
            texture: Texture2D,
            textureMeta?: { releaseMode: 'asset' | 'dynamic'; imageAsset?: ImageAsset | null },
        ): BeanSkinAtlasOwner {
            const sourceFrames = atlasData?.frames;
            if (!sourceFrames || typeof sourceFrames !== 'object' || Array.isArray(sourceFrames)) {
                throw new Error(`[bean-skin] atlas ${skinId} has no frame map`);
            }
            const frameNames = Object.keys(sourceFrames).sort();
            const expectedNames = [...EXPECTED_BEAN_FRAME_NAMES].sort();
            if (frameNames.length !== EXPECTED_BEAN_FRAME_COUNT || frameNames.some((name, index) => name !== expectedNames[index])) {
                throw new Error(`[bean-skin] atlas ${skinId} must contain exactly ${EXPECTED_BEAN_FRAME_COUNT} expected frames`);
            }
            const textureWidth = Math.max(1, Math.floor(Number((texture as any).width) || 1024));
            const textureHeight = Math.max(1, Math.floor(Number((texture as any).height) || 1024));
            const frames = new Map<string, SpriteFrame>();
            for (const name of expectedNames) {
                const raw = sourceFrames[name];
                const x = Math.floor(Number(raw?.x));
                const y = Math.floor(Number(raw?.y));
                const width = Math.floor(Number(raw?.w));
                const height = Math.floor(Number(raw?.h));
                if (
                    !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)
                    || x < 0 || y < 0 || width <= 0 || height <= 0
                    || x + width > textureWidth || y + height > textureHeight
                ) {
                    throw new Error(`[bean-skin] invalid frame rect ${skinId}/${name}`);
                }
                const frame = new SpriteFrame();
                frame.texture = texture;
                frame.rect = new Rect(x, y, width, height);
                frame.name = name;
                frames.set(name, frame);
            }
            const imageAsset = textureMeta?.imageAsset || null;
            texture.addRef();
            imageAsset?.addRef();
            return {
                skinId,
                frames,
                texture,
                imageAsset,
                resourcesRetained: true,
                releaseMode: textureMeta?.releaseMode === 'dynamic' ? 'dynamic' : 'asset',
            };
        },

        _releaseBeanSkinAtlasOwner(owner: BeanSkinAtlasOwner | null, reason: string): void {
            if (!owner || owner.released) return;
            owner.released = true;
            for (const frame of owner.frames.values()) {
                try {
                    if (frame?.isValid) {
                        frame.texture = null;
                        frame.destroy();
                    }
                } catch (error) {
                    runtimeWarn(`[bean-skin] frame release failed (${reason})`, error);
                }
            }
            owner.frames.clear();
            try {
                // A canceled load has no owner yet; balance a temporary ref to request safe cleanup.
                if (!owner.resourcesRetained) {
                    if (owner.texture?.isValid) owner.texture.addRef();
                    if (owner.imageAsset?.isValid) owner.imageAsset.addRef();
                }
                if (owner.imageAsset?.isValid) owner.imageAsset.decRef();
                if (owner.texture?.isValid) owner.texture.decRef();
                owner.resourcesRetained = false;
            } catch (error) {
                runtimeWarn(`[bean-skin] texture release failed (${reason})`, error);
            }
        },

        _replaceActiveBeanSkinAtlasOwner(owner: BeanSkinAtlasOwner, reason: string): void {
            const previous = this._activeBeanSkinAtlasOwner as BeanSkinAtlasOwner | null;
            this._activeBeanSkinAtlasOwner = owner;
            if (previous && previous !== owner) this._releaseBeanSkinAtlasOwner(previous, `${reason}:replace`);
        },

        _ensureBeanSkinAtlasLoaded(id: number, callback: (ok: boolean, err?: Error | null) => void): void {
            const isCurrent = () => !this._beanSkinAtlasLoadsCancelled
                && !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            if (!isCurrent()) return;
            const safeId = normalizeBeanSkinId(id);
            if (!safeId) {
                callback(false, new Error(`[bean-skin] invalid skin id: ${id}`));
                return;
            }
            if (safeId === DEFAULT_BEAN_SKIN_ID) {
                this._ensureBootstrapBeanAtlasLoaded(() => {
                    if (!isCurrent()) return;
                    callback(this._hasCompleteBeanSkinFrameMap(this._bootstrapAtlasFrameCache), null);
                });
                return;
            }
            const activeOwner = this._activeBeanSkinAtlasOwner as BeanSkinAtlasOwner | null;
            if (activeOwner?.skinId === safeId && this._hasCompleteBeanSkinFrameMap(activeOwner.frames)) {
                callback(true, null);
                return;
            }
            if (this._beanSkinAtlasLoadingId) {
                if (this._beanSkinAtlasLoadingId === safeId) {
                    this._beanSkinAtlasLoadingCallbacks.push(callback);
                } else {
                    callback(false, new Error(`[bean-skin] atlas load busy: ${this._beanSkinAtlasLoadingId}`));
                }
                return;
            }
            this._beanSkinAtlasLoadingId = safeId;
            this._beanSkinAtlasLoadingCallbacks = [callback];
            const finish = (ok: boolean, err?: Error | null) => {
                const callbacks = this._beanSkinAtlasLoadingCallbacks || [];
                this._beanSkinAtlasLoadingId = 0;
                this._beanSkinAtlasLoadingCallbacks = [];
                for (const done of callbacks) {
                    if (!isCurrent()) break;
                    done(ok, err || null);
                }
            };
            this._loadBeanSkinConfig((config: BeanSkinConfig | null, configErr?: Error | null) => {
                if (!isCurrent()) { finish(false); return; }
                const row = config?.byId.get(safeId) || null;
                if (!row || row.resourceMode !== 'game_assets_atlas') {
                    finish(false, configErr || new Error(`[bean-skin] catalog row missing: ${safeId}`));
                    return;
                }
                this._withGameAssetsBundle((bundle: Bundle | null) => {
                    if (!isCurrent()) { finish(false); return; }
                    if (!bundle) {
                        finish(false, new Error('[bean-skin] gameAssets bundle unavailable'));
                        return;
                    }
                    this._loadAtlasDataFromBundle(bundle, row.atlasDataKey, `bean-skin ${safeId}`, (dataErr: Error | null, atlasData: any) => {
                        if (!isCurrent()) { finish(false); return; }
                        if (dataErr || !atlasData) {
                            finish(false, dataErr || new Error(`[bean-skin] atlas data missing: ${safeId}`));
                            return;
                        }
                        this._loadAtlasTextureFromBundle(bundle, row.atlasTextureKey, `bean-skin ${safeId}`, (
                            textureErr: Error | null,
                            texture: Texture2D | null,
                            textureMeta?: { releaseMode: 'asset' | 'dynamic'; imageAsset?: ImageAsset | null },
                        ) => {
                            if (!isCurrent()) {
                                if (texture) this._releaseBeanSkinAtlasOwner({
                                    skinId: safeId,
                                    frames: new Map<string, SpriteFrame>(),
                                    texture,
                                    imageAsset: textureMeta?.imageAsset || null,
                                    releaseMode: textureMeta?.releaseMode === 'dynamic' ? 'dynamic' : 'asset',
                                }, 'atlas-load-canceled');
                                finish(false);
                                return;
                            }
                            if (textureErr || !texture) {
                                finish(false, textureErr || new Error(`[bean-skin] atlas texture missing: ${safeId}`));
                                return;
                            }
                            let owner: BeanSkinAtlasOwner | null = null;
                            try {
                                owner = this._createBeanSkinAtlasOwner(safeId, atlasData, texture, textureMeta);
                                if (!this._hasCompleteBeanSkinFrameMap(owner.frames)) {
                                    throw new Error(`[bean-skin] atlas validation failed: ${safeId}`);
                                }
                                this._replaceActiveBeanSkinAtlasOwner(owner, 'atlas-loaded');
                                runtimeLog(`[bean-skin] active atlas ready: ${safeId} (${owner.frames.size} frames)`);
                                finish(true, null);
                            } catch (ownerErr) {
                                this._releaseBeanSkinAtlasOwner(owner || {
                                    skinId: safeId,
                                    frames: new Map<string, SpriteFrame>(),
                                    texture,
                                    imageAsset: textureMeta?.imageAsset || null,
                                    releaseMode: textureMeta?.releaseMode === 'dynamic' ? 'dynamic' : 'asset',
                                }, 'atlas-invalid');
                                finish(false, ownerErr instanceof Error ? ownerErr : new Error(`[bean-skin] atlas invalid: ${safeId}`));
                            }
                        });
                    });
                });
            });
        },

        ensureEquippedBeanSkinLoadedForLevelData(data: LevelData, onDone: () => void): void {
            const equippedId = this.getEquippedBeanSkinId();
            this._ensureBeanSkinAtlasLoaded(equippedId, (ok: boolean, err?: Error | null) => {
                if (!ok) console.error(`[bean-skin] equipped atlas unavailable: ${equippedId}`, err || 'unknown error');
                else this._appliedBeanSkinId = equippedId;
                onDone();
            });
        },

        hasEquippedBeanSkinFramesForLevelData(data: LevelData | null): boolean {
            const equippedId = this.getRuntimeBeanSkinId();
            const frameMap = equippedId === DEFAULT_BEAN_SKIN_ID
                ? this._bootstrapAtlasFrameCache as Map<string, SpriteFrame>
                : (this._activeBeanSkinAtlasOwner?.skinId === equippedId ? this._activeBeanSkinAtlasOwner.frames : null);
            if (!this._hasCompleteBeanSkinFrameMap(frameMap)) return false;
            const colorIds = this.getLevelColorIds(data);
            if (colorIds.length === 0) return true;
            for (const colorId of colorIds) {
                const key = this.getPinddColorKey(colorId);
                if (!key) return false;
                for (const variant of PINDD_BEAN_VARIANTS) {
                    if (!frameMap?.has(`${key}_${variant}`)) return false;
                }
            }
            return true;
        },

        getEquippedBeanSkinFrame(cacheKey: string): SpriteFrame | null | undefined {
            const equippedId = this.getRuntimeBeanSkinId();
            if (equippedId === DEFAULT_BEAN_SKIN_ID) return undefined;
            const owner = this._activeBeanSkinAtlasOwner as BeanSkinAtlasOwner | null;
            return owner?.skinId === equippedId ? owner.frames.get(cacheKey) || null : null;
        },

        setupBeanSkinPanelTabs(box: Node, backgroundContent: Node): void {
            if (!box?.isValid || !backgroundContent?.isValid) {
                throw new Error('[bean-skin-panel] panel root unavailable');
            }
            if (!backgroundContent.getComponent(UITransform)) {
                throw new Error('[bean-skin-panel] background Content has no UITransform');
            }
            const beanContent = requireBeanPanelChild(box, 'BeanSkinPage', 'BackgroundSkinPanel/Box');
            if (!beanContent.getComponent(UITransform)) {
                throw new Error('[bean-skin-panel] BeanSkinPage has no UITransform');
            }
            const tabsRoot = requireBeanPanelChild(box, 'SkinCategoryTabs', 'BackgroundSkinPanel/Box');
            if (!tabsRoot.getComponent(UITransform)) {
                throw new Error('[bean-skin-panel] SkinCategoryTabs has no UITransform');
            }
            this._backgroundSkinPanelContent = backgroundContent;
            this._beanSkinPanelContent = beanContent;
            this._beanSkinPanelActiveTab = 'background';
            backgroundContent.active = true;
            beanContent.active = false;
            const tabs = [
                { key: 'background', text: '背景' },
                { key: 'bean', text: '豆豆' },
            ];
            for (const tab of tabs) {
                const tabNode = requireBeanPanelChild(tabsRoot, `SkinCategoryTab_${tab.key}`, 'BackgroundSkinPanel/Box/SkinCategoryTabs');
                if (!tabNode.getComponent(UITransform) || !tabNode.getComponent(Graphics)) {
                    throw new Error(`[bean-skin-panel] incomplete tab node: ${tabNode.name}`);
                }
                const label = requireBeanPanelLabel(tabNode, 'Label', `BackgroundSkinPanel/Box/SkinCategoryTabs/${tabNode.name}`);
                label.string = tab.text;
                tabNode.targetOff(this);
                tabNode.on(Node.EventType.TOUCH_END, () => {
                    if (this._beanSkinPanelActiveTab === tab.key) return;
                    AudioMgr.inst.play('button');
                    this.switchSkinPanelCategory(tab.key);
                }, this);
            }
            this.redrawSkinPanelCategoryTabs();
            this._loadBeanSkinConfig((config: BeanSkinConfig | null, err?: Error | null) => {
                if (!beanContent.isValid) return;
                if (!config) {
                    console.error('[bean-skin-panel] catalog load failed:', err || 'unknown error');
                    this._showBeanSkinPanelLoadError(beanContent);
                    return;
                }
                this.renderBeanSkinPanelCards(beanContent, config.rows);
            });
        },

        redrawSkinPanelCategoryTabs(): void {
            const box = this._backgroundSkinPanelOverlay?.getChildByName('Box') as Node | null;
            const tabsRoot = box?.getChildByName('SkinCategoryTabs') || null;
            if (!tabsRoot?.isValid) return;
            for (const key of ['background', 'bean']) {
                const tabNode = tabsRoot.getChildByName(`SkinCategoryTab_${key}`);
                const graphics = tabNode?.getComponent(Graphics);
                const label = tabNode?.getChildByName('Label')?.getComponent(Label);
                if (!graphics || !label) continue;
                const active = this._beanSkinPanelActiveTab === key;
                graphics.clear();
                graphics.fillColor = active ? new Color('#7E68E8') : new Color('#E9E4FF');
                graphics.roundRect(-100, -26, 200, 52, 26);
                graphics.fill();
                label.color = active ? new Color('#FFFFFF') : new Color('#6655A7');
            }
        },

        switchSkinPanelCategory(key: string): void {
            const next = key === 'bean' ? 'bean' : 'background';
            this._beanSkinPanelActiveTab = next;
            if (this._backgroundSkinPanelContent?.isValid) this._backgroundSkinPanelContent.active = next === 'background';
            if (this._beanSkinPanelContent?.isValid) this._beanSkinPanelContent.active = next === 'bean';
            this.redrawSkinPanelCategoryTabs();
        },

        _showBeanSkinPanelLoadError(content: Node): void {
            const cardList = requireBeanPanelChild(content, 'CardList', 'BeanSkinPage');
            const errorNode = requireBeanPanelChild(cardList, 'BeanSkinLoadError', 'BeanSkinPage/CardList');
            requireBeanPanelLabel(cardList, 'BeanSkinLoadError', 'BeanSkinPage/CardList');
            for (const child of cardList.children) child.active = child === errorNode;
        },

        renderBeanSkinPanelCards(content: Node, rows: BeanSkinRow[]): void {
            if (!content?.isValid) return;
            const cardList = requireBeanPanelChild(content, 'CardList', 'BeanSkinPage');
            if (!cardList.getComponent(UITransform)) throw new Error('[bean-skin-panel] CardList has no UITransform');
            const cardNodes = BEAN_SKIN_IDS.map((_, index) => {
                const slot = index + 1;
                return requireBeanPanelChild(cardList, `BeanSkinCard_${slot < 10 ? `0${slot}` : slot}`, 'BeanSkinPage/CardList');
            });
            if (rows.length !== cardNodes.length) {
                throw new Error(`[bean-skin-panel] prefab/config card count mismatch: ${cardNodes.length}/${rows.length}`);
            }
            requireBeanPanelChild(cardList, 'BeanSkinLoadError', 'BeanSkinPage/CardList').active = false;
            const cards: Array<{ card: Node; skin: BeanSkinRow }> = [];
            rows.forEach((skin, index) => {
                const card = cardNodes[index];
                card.active = true;
                const preview = requireBeanPanelChild(card, 'Preview', card.name);
                const previewSprite = requireBeanPanelSprite(card, 'Preview', card.name);
                previewSprite.spriteFrame = null;
                requireBeanPanelChild(card, 'ActionBtn', card.name);
                const iconToken = ((Number((card as any).__beanSkinIconToken) || 0) + 1);
                (card as any).__beanSkinIconToken = iconToken;
                this.loadBeanSkinIconSpriteFrame(skin, (frame: SpriteFrame | null, err?: Error | null) => {
                    if (!card.isValid || !preview.isValid || (card as any).__beanSkinIconToken !== iconToken) return;
                    if (!frame) {
                        console.error(`[bean-skin-panel] icon load failed: ${skin.id}`, err || 'unknown error');
                        return;
                    }
                    if (typeof this.scheduleSpriteFrameApply === 'function') {
                        this.scheduleSpriteFrameApply(previewSprite, frame, `bean-skin-icon:${skin.id}`);
                    } else {
                        previewSprite.spriteFrame = frame;
                    }
                });
                cards.push({ card, skin });
            });
            this._beanSkinPanelCards = cards;
            this.refreshBeanSkinPanelCards();
        },

        refreshBeanSkinPanelCards(): void {
            const cards = Array.isArray(this._beanSkinPanelCards) ? this._beanSkinPanelCards : [];
            for (const entry of cards) {
                if (entry?.card?.isValid) this._bindBeanSkinCardAction(entry.card, entry.skin);
            }
        },

        _bindBeanSkinCardAction(card: Node, skin: BeanSkinRow): void {
            const action = requireBeanPanelChild(card, 'ActionBtn', card.name);
            const actionLabel = requireBeanPanelLabel(action, 'ActionLbl', `${card.name}/ActionBtn`);
            const adIcon = requireBeanPanelChild(action, 'AdIcon', `${card.name}/ActionBtn`);
            requireBeanPanelSprite(action, 'AdIcon', `${card.name}/ActionBtn`);
            const owned = this.isBeanSkinOwned(skin.id);
            const equipped = owned && this.getEquippedBeanSkinId() === skin.id;
            actionLabel.node.active = owned;
            actionLabel.string = equipped ? '已使用' : '使用';
            adIcon.active = !owned;
            action.targetOff(this);
            const button = action.getComponent(Button);
            if (!button) throw new Error(`[bean-skin-panel] missing Button: ${card.name}/ActionBtn`);
            button.interactable = !equipped;
            if (equipped) return;
            if (owned) {
                bindBeanPanelAction(this, action, () => {
                    const activeButton = action.getComponent(Button);
                    if (activeButton) activeButton.interactable = false;
                    actionLabel.string = '加载中';
                    this.equipBeanSkin(skin.id, (ok: boolean) => {
                        if (ok) this.showToast?.('已切换，下一局生效', 1.4);
                        else this.showToast?.('豆豆皮肤加载失败，请稍后重试', 1.8);
                        this.refreshBeanSkinPanelCards();
                    });
                });
                return;
            }
            bindBeanPanelAction(this, action, () => {
                const activeButton = action.getComponent(Button);
                if (activeButton) activeButton.interactable = false;
                this.watchBeanSkinUnlockAd(skin, () => this.refreshBeanSkinPanelCards());
            });
        },

        disposeBeanSkinPanel(): void {
            this._backgroundSkinPanelContent = null;
            this._beanSkinPanelContent = null;
            this._beanSkinPanelCards = [];
            this._beanSkinPanelActiveTab = 'background';
        },

        equipBeanSkin(id: number, callback?: (ok: boolean, err?: Error | null) => void): void {
            const safeId = normalizeBeanSkinId(id);
            if (!safeId || !this.isBeanSkinOwned(safeId)) {
                const err = new Error(`[bean-skin] skin not owned: ${id}`);
                callback?.(false, err);
                return;
            }
            this._ensureBeanSkinAtlasLoaded(safeId, (ok: boolean, err?: Error | null) => {
                if (!ok) {
                    callback?.(false, err || new Error(`[bean-skin] equip failed: ${safeId}`));
                    return;
                }
                this._persistEquippedBeanSkinSelection(safeId);
                this._appliedBeanSkinId = 0;
                if (safeId === DEFAULT_BEAN_SKIN_ID) {
                    const owner = this._activeBeanSkinAtlasOwner as BeanSkinAtlasOwner | null;
                    this._activeBeanSkinAtlasOwner = null;
                    this._releaseBeanSkinAtlasOwner(owner, 'equip-default');
                } else {
                    this._releaseBootstrapBeanAtlas?.('equip-non-default');
                }
                callback?.(true, null);
            });
        },

        watchBeanSkinUnlockAd(skin: BeanSkinRow, callback?: (ok: boolean) => void): void {
            if (!skin || skin.unlockType !== 'ad' || skin.unlockValue !== 1 || this.isBeanSkinOwned(skin.id)) {
                callback?.(false);
                return;
            }
            if (typeof this.runRewardedGrant !== 'function') {
                this.showToast?.('广告暂不可用，请稍后重试', 1.6);
                callback?.(false);
                return;
            }
            let granted = false;
            let equipped = false;
            const started = this.runRewardedGrant('bean_skin_unlock', () => {
                granted = this.grantBeanSkin(skin.id);
                return granted;
            }, {
                claimKey: `bean_skin_unlock:${skin.id}`,
                busyFlag: '_beanSkinAdUnlocking',
                adFailToast: '广告未完成，未获得皮肤',
                grantFailToast: '豆豆皮肤解锁失败，请重试',
                successToast: '豆豆皮肤已解锁',
                afterGrantFailToast: '皮肤已解锁，资源加载失败，请稍后使用',
                afterGrant: () => new Promise<boolean>((resolve) => {
                    this.equipBeanSkin(skin.id, (ok: boolean) => {
                        equipped = ok;
                        resolve(ok);
                    });
                }),
                onFinally: () => callback?.(granted && equipped),
            });
            if (!started) {
                this.showToast?.('广告加载中，请稍后', 1.2);
                callback?.(false);
            }
        },

        releaseBeanSkinRuntimeResources(reason: string = 'runtime-destroy'): void {
            this._beanSkinAtlasLoadsCancelled = true;
            this._beanSkinIconLoadsCancelled = true;
            this._beanSkinAtlasLoadingId = 0;
            this._beanSkinAtlasLoadingCallbacks = [];
            for (const entry of this._beanSkinPanelCards || []) {
                const preview = entry?.card?.getChildByName?.('Preview')?.getComponent?.(Sprite) || null;
                if (preview) preview.spriteFrame = null;
            }
            for (const frame of this._beanSkinIconCache.values() as Iterable<SpriteFrame>) {
                try {
                    if (frame?.isValid) frame.decRef();
                } catch (error) {
                    runtimeWarn(`[bean-skin] icon release failed (${reason})`, error);
                }
            }
            this._beanSkinIconCache.clear();
            this._beanSkinIconLoadingCallbacks.clear();
            this.disposeBeanSkinPanel();
            const owner = this._activeBeanSkinAtlasOwner as BeanSkinAtlasOwner | null;
            this._activeBeanSkinAtlasOwner = null;
            this._releaseBeanSkinAtlasOwner(owner, reason);
        },
    });
}
