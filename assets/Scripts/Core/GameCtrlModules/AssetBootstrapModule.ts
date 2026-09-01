import {
    _decorator, Component, Node, UITransform, Sprite, Color, Label, EventTouch,
    EventMouse, Vec2, Vec3, SpriteFrame, JsonAsset, assetManager, Bundle, Button,
    Graphics, Layers, view, ResolutionPolicy, tween, Tween, sys, UIOpacity,
    ImageAsset, Texture2D, Rect, TextAsset, SubContextView, Size, BlockInputEvents, Mask,
    NodePool, Game, game, AdConfig, COLOR_HEX, BoardModel, SlotModel, AudioMgr,
    PerformanceMgr, AnalyticsMgr, LeaderboardMgr, ECONOMY_NUMERIC_TABLE, UserMgr, UserStateSyncMgr, mapPhysicalToLogicalLevelId, getMainLevelTimeLimitSeconds,
    mapLogicalToPhysicalLevelId, shouldUseMainLevelUnlimitedTime, BOARD_EFFECT_TEXTURE_NAMES, BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS, COLLECTION_RELEASE_TEXTURE_NAMES, COLLECTION_TEXTURE_NAMES, GAMEPLAY_SLOT_TEXTURE_NAMES, GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES, HOME_MENU_TEXTURE_NAMES, LEADERBOARD_RELEASE_TEXTURE_NAMES, LEADERBOARD_TEXTURE_NAMES, POPUP_UI_TEXTURE_NAMES, RECOVER_VIGOR_RELEASE_TEXTURE_NAMES, RECOVER_VIGOR_TEXTURE_NAMES, RESOURCE_ACQUIRE_RELEASE_TEXTURE_NAMES,
    RESOURCE_ACQUIRE_TEXTURE_NAMES, RESULT_PANEL_TEXTURE_NAMES, GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS, GAME_ASSETS_PRELOAD_TEXTURE_PATHS,
    GAME_ASSETS_TEXTURE_SEARCH_DIRS, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, SETTINGS_PANEL_TEXTURE_NAMES, SKILL_BUTTON_TEXTURE_NAMES, SySDKMgr, ccclass, property, DEFAULT_CELL_SIZE,
    DEFAULT_CELL_GAP, PINDD_BEAN_TO_SLOT_RATIO, SLOT_SIZE, SLOT_GAP, SLOT_HIT_PADDING, SELECTED_SLOT_HIT_PADDING, BOARD_SELECT_HIT_MIN_UI, BOARD_PLACE_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_MIN_UI, BOARD_SELECT_HIT_CELL_RATIO, BOARD_PLACE_HIT_CELL_RATIO, BOARD_SLOT_PLACE_HIT_CELL_RATIO, SLOTS_PER_ROW, DEFAULT_UNLOCKED_SLOT_ROWS, SLOT_ROW_BG_WIDTH, SLOT_ROW_BG_HEIGHT,
    SLOT_ROW_SPACING, SLOT_ROW_EMPTY_WIDTH, SLOT_ROW_EMPTY_HEIGHT, SLOT_AREA_CENTER_Y, SLOT_AREA_SCALE, DEFAULT_MAX_SLOT_ROWS, MAINLINE_MAX_SLOT_ROWS, MAINLINE_SLOT_ROW_BG_HEIGHT,
    MAINLINE_SLOT_ROW_SPACING, MAINLINE_SLOT_PANEL_EXTRA_HEIGHT, MAINLINE_SLOT_CENTER_SPACING, MAINLINE_SLOT_MARKER_WIDTH, MAINLINE_SLOT_MARKER_HEIGHT, MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY, MAINLINE_SLOT_MARKER_LOCKED_OPACITY,
    SKILL_BUTTON_SPACING, LOCAL_BOOTSTRAP_LEVEL_ID,
    LOCAL_BOOTSTRAP_LEVEL_IDS, LOCAL_BOOTSTRAP_LEVEL_PREFIX, LOCAL_BOOTSTRAP_BUNDLE_NAME, GAME_ASSETS_BUNDLE_NAME, LEVEL_DATA_BUNDLE_NAME, LOCAL_BOOTSTRAP_BEAN_DIR, LOCAL_BOOTSTRAP_BEAN_ATLAS_DATA_PATH, LOCAL_BOOTSTRAP_BEAN_ATLAS_TEXTURE_PATH, LOCAL_BOOTSTRAP_LEVEL_DIR, LOCAL_BOOTSTRAP_TEXTURE_DIR,
    LOCAL_BOOTSTRAP_GAME_ASSETS_WARM_DELAY, PINDD_BEAN_VARIANTS, LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES, LOCAL_BOOTSTRAP_TEXTURE_NAMES, MAX_LEADERBOARD_AVATAR_FRAMES, LS_LEVEL, LS_GOLD, LS_PROP_EXPAND, LS_PROP_WAND,
    LS_PROP_FREEZE, LS_PROP_BRUSH, LS_PROP_MAGNET, LS_PINCH_GUIDE, LS_SKILL_WAND_USED, LS_SKILL_BROOM_USED, LS_SKILL_MAGNET_USED,
    LS_EXPAND_USED, LS_USER_STATE_UPDATED_AT, CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS, NEW_USER_STARTER_PROP_COUNT,
    MAX_FLY_BEAN_POOL_SIZE, MAX_FRAME_FX_POOL_SIZE, MAX_BRIGHT_FLASH_POOL_SIZE, MAX_CONCURRENT_FRAME_EFFECTS, GAME_ASSETS_EFFECTS_IDLE_WARMUP, SKILL_UNLOCK_WAND, SKILL_UNLOCK_BROOM, SKILL_UNLOCK_MAGNET,
    WIN_GLOW_MIN_WAVES, WIN_GLOW_MAX_WAVES, WIN_GLOW_WAVE_STEP, WIN_GLOW_POST_DELAY, WIN_GLOW_FAST_INTERVAL_LARGE, WIN_GLOW_FAST_INTERVAL_MEDIUM, WIN_GLOW_FAST_INTERVAL_SMALL, GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_FINGERTIP_OFFSET_X, GUIDE_HAND_FINGERTIP_OFFSET_Y, leaderboardAvatarFrameCache, leaderboardAvatarPendingLoads, leaderboardAvatarLoadQueue, leaderboardAvatarLoadLaunchers, leaderboardAvatarLoadInFlight,
    LEADERBOARD_ROW_PITCH, LEADERBOARD_SCROLL_DECAY, LEADERBOARD_SCROLL_MIN_SPEED, LEADERBOARD_AVATAR_MAX_CONCURRENT, FRIEND_AVATAR_CACHE_TTL_MS, FRIEND_RANK_SUBCONTEXT_FPS, FRIEND_RANK_SCROLL_POST_INTERVAL_MS, drainLeaderboardAvatarLoadQueue,
    enqueueLeaderboardAvatarLoad, finishLeaderboardAvatarLoad, createSingleColorSpriteFrame, BoardViewportController
} from '../GameCtrlShared';
import { director, Director, UIRenderer } from 'cc';
import type {
    LevelData, BeanBlockInfo, SfxName, LeaderboardEntry, LeaderboardResult, CloudGameState, CloudUserState, SkillSourceGroup,
    ForcedSkillBoardMove, ForcedSkillSlotMove, ForcedSkillBatch, ForcedSkillStep, ForcedSkillPlan, TutorialMode,
    InventoryPropKind, SafeInsets, RankListEntry, UserStateRestoreStatus, GestureMode, BoardSafeViewportRect, BoardGridCell,
    BoardViewportControllerOptions
} from '../GameCtrlShared';
import { ensureGameplaySkillUiController } from '../GameplaySkillUiController';
import { LevelDataCdnService, normalizeLevelCollectionEntries } from '../LevelDataCdnService';
import type { LevelCollectionEntry } from '../LevelDataCdnService';
import { runtimeLog, runtimeWarn } from '../RuntimeLog';
import { applyLateCloudUserStateToRuntime, deferCloudGameStateSyncDuringStartup, deferLeaderboardProgressDuringStartup, resolveStartupCloudRestorePending } from './StartupCloudRestoreHelper';
import { debugPerfSnapshot, debugPerfTrace, isDebugPerfTraceEnabled } from '../DebugPerfTrace';
import { AppRoot } from '../AppRoot';
import { releasePixelPosterPreviewTree } from '../PixelPosterPreviewRenderer';
import { normalizeStartupLocalLevel, readStartupLocalProgress } from '../StartupLocalProgress';
import { shouldUseLocalLevelDataMirror } from '../RemoteDataCdnClient';

const SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP = 'startup-bootstrap';
const SPRITE_FRAME_SCOPE_SCENE_HOME = 'scene-home';
const SPRITE_FRAME_SCOPE_SCENE_GAME = 'scene-game';
const SPRITE_FRAME_SCOPE_SHARED_UI = 'shared-ui';
const SPRITE_FRAME_SCOPE_DYNAMIC = 'dynamic';
const MAX_CONCURRENT_SPRITE_FRAME_LOADS = 2;
const POST_PLAYABLE_MAX_CONCURRENT_SPRITE_FRAME_LOADS = 1;
const RENDER_RESOURCE_DIAGNOSTIC_INTERVAL_SECONDS = 1.0;
const RENDER_RESOURCE_DIAGNOSTIC_SAMPLE_LIMIT = 12;
const PANEL_TEXTURE_ENSURE_TIMEOUT_MS = 8000;

type RuntimeRendererSpriteFrameOwner = {
    renderer: any;
    spriteFrame: SpriteFrame | null;
    kind: string;
};

const SCENE_HOME_SPRITE_FRAME_NAMES = new Set<string>(HOME_MENU_TEXTURE_NAMES);
const SCENE_GAME_SPRITE_FRAME_NAMES = new Set<string>([
    ...GAMEPLAY_SLOT_TEXTURE_NAMES,
    ...SKILL_BUTTON_TEXTURE_NAMES,
]);
const SHARED_UI_SPRITE_FRAME_NAMES = new Set<string>([
    ...POPUP_UI_TEXTURE_NAMES,
    ...GOLD_SHOP_TEXTURE_NAMES,
    ...RESOURCE_ACQUIRE_TEXTURE_NAMES,
    ...RECOVER_VIGOR_TEXTURE_NAMES,
    ...RESULT_PANEL_TEXTURE_NAMES,
    ...SETTINGS_PANEL_TEXTURE_NAMES,
    ...LEADERBOARD_TEXTURE_NAMES,
    ...COLLECTION_TEXTURE_NAMES,
]);

export function installAssetBootstrapModule(target: any): void {
    Object.assign(target, {
        _cacheSpriteFrame(
            sf: SpriteFrame | null,
            fallbackName?: string,
            options: { releaseMode?: 'asset' | 'dynamic'; imageAsset?: ImageAsset | null; texture?: Texture2D | null; scope?: string } = {},
        ) {
            if (!sf) return;
            const fileName = sf.name || fallbackName;
            if (!fileName) return;
            const previousFrame = this.sfCache.get(fileName) || null;
            const prevMeta = this._spriteFrameCacheMeta.get(fileName) || null;
            if (previousFrame && previousFrame !== sf && prevMeta?.cacheResourceRetained) {
                this._releaseSpriteFrameCacheResource?.(fileName, previousFrame, prevMeta, 'cache-replace');
            }
            this.sfCache.set(fileName, sf);
            const taggedMode = (sf as any).__pddReleaseMode;
            const releaseMode = options.releaseMode || (taggedMode === 'dynamic' ? 'dynamic' : 'asset');
            const taggedImageAsset = (sf as any).__pddSourceImageAsset;
            const taggedTexture = (sf as any).__pddOwnedTexture;
            const owners = prevMeta?.owners instanceof Set ? prevMeta.owners : new Set<string>();
            const retainCount = Number.isFinite(prevMeta?.retainCount) ? Number(prevMeta.retainCount) : owners.size;
            const meta = {
                releaseMode,
                imageAsset: options.imageAsset ?? taggedImageAsset ?? null,
                texture: options.texture ?? taggedTexture ?? null,
                scope: this._inferSpriteFrameScope(fileName, options.scope || prevMeta?.scope),
                owners,
                retainCount,
                cacheResourceRetained: previousFrame === sf && !!prevMeta?.cacheResourceRetained,
                spriteFrameCacheRetained: previousFrame === sf && !!prevMeta?.spriteFrameCacheRetained,
                textureCacheRetained: previousFrame === sf && !!prevMeta?.textureCacheRetained,
                imageAssetCacheRetained: previousFrame === sf && !!prevMeta?.imageAssetCacheRetained,
            };
            this._spriteFrameCacheMeta.set(fileName, meta);
            this._retainSpriteFrameCacheResource?.(fileName, sf, meta);
            this._traceSpriteFrameResource?.(
                'spriteFrame.cache.set',
                fileName,
                sf,
                this._spriteFrameCacheMeta.get(fileName) || null,
                { fallbackName: fallbackName || '' },
            );
        },

        _inferSpriteFrameScope(name: string, explicitScope?: string): string {
            if (explicitScope) return explicitScope;
            if (LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES.has(name) || LOCAL_BOOTSTRAP_TEXTURE_NAMES.has(name)) {
                return SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP;
            }
            if (SCENE_GAME_SPRITE_FRAME_NAMES.has(name)) {
                return SPRITE_FRAME_SCOPE_SCENE_GAME;
            }
            if (SCENE_HOME_SPRITE_FRAME_NAMES.has(name)) {
                return SPRITE_FRAME_SCOPE_SCENE_HOME;
            }
            if (SHARED_UI_SPRITE_FRAME_NAMES.has(name)) {
                return SPRITE_FRAME_SCOPE_SHARED_UI;
            }
            return SPRITE_FRAME_SCOPE_DYNAMIC;
        },

        _getSpriteFrameCacheMetaEntry(name: string, createIfMissing: boolean = false, explicitScope?: string) {
            let meta = this._spriteFrameCacheMeta.get(name) || null;
            if (!meta && createIfMissing) {
                meta = {
                    releaseMode: 'asset',
                    imageAsset: null,
                    texture: null,
                    scope: this._inferSpriteFrameScope(name, explicitScope),
                    owners: new Set<string>(),
                    retainCount: 0,
                    cacheResourceRetained: false,
                    spriteFrameCacheRetained: false,
                    textureCacheRetained: false,
                    imageAssetCacheRetained: false,
                };
                this._spriteFrameCacheMeta.set(name, meta);
            } else if (meta && explicitScope && meta.scope !== explicitScope) {
                meta.scope = explicitScope;
            }
            if (meta && !(meta.owners instanceof Set)) {
                meta.owners = new Set<string>();
            }
            if (meta && !Number.isFinite(meta.retainCount)) {
                meta.retainCount = meta.owners.size;
            }
            return meta;
        },

        _getSpriteFrameInternalTextureForDiagnostics(sf: SpriteFrame | null): Texture2D | null {
            if (!sf) return null;
            return ((sf as any)._texture || null) as Texture2D | null;
        },

        _getSpriteFrameGetterTextureForDiagnostics(sf: SpriteFrame | null): Texture2D | null {
            if (!sf) return null;
            return ((sf as any).texture || null) as Texture2D | null;
        },

        _getSpriteFrameTextureForDiagnostics(sf: SpriteFrame | null): Texture2D | null {
            return this._getSpriteFrameInternalTextureForDiagnostics(sf)
                || this._getSpriteFrameGetterTextureForDiagnostics(sf);
        },

        _getAssetRefCountForDiagnostics(asset: any): number | null {
            const refCount = Number(asset?.refCount);
            return Number.isFinite(refCount) ? refCount : null;
        },

        _getSpriteFrameOwnerPathsForDiagnostics(owners: Record<string, unknown>[] | null | undefined): string[] {
            if (!Array.isArray(owners)) return [];
            return owners
                .map((owner) => typeof owner?.nodePath === 'string' ? owner.nodePath : '')
                .filter((path) => path.length > 0)
                .slice(0, RENDER_RESOURCE_DIAGNOSTIC_SAMPLE_LIMIT);
        },

        _getSpriteFrameOwnerSummariesForDiagnostics(owners: Record<string, unknown>[] | null | undefined): string[] {
            if (!Array.isArray(owners)) return [];
            return owners
                .map((owner) => {
                    const ownerType = typeof owner?.ownerType === 'string' ? owner.ownerType : 'owner';
                    const nodePath = typeof owner?.nodePath === 'string' ? owner.nodePath : '';
                    if (!nodePath) return ownerType;
                    return `${ownerType}:${nodePath}`;
                })
                .filter((summary) => summary.length > 0)
                .slice(0, RENDER_RESOURCE_DIAGNOSTIC_SAMPLE_LIMIT);
        },

        _isSpriteFrameRenderReadyForDiagnostics(sf: SpriteFrame | null): boolean {
            if (!sf?.isValid) return false;
            const texture = this._getSpriteFrameInternalTextureForDiagnostics(sf);
            if (!texture?.isValid) return false;
            return typeof (texture as any).getHash === 'function';
        },

        requireRenderReadySpriteFrame(sf: SpriteFrame | null, reason: string): SpriteFrame {
            const name = sf?.name || '';
            const meta = name ? this._spriteFrameCacheMeta?.get(name) || null : null;
            if (this._isSpriteFrameRenderReadyForDiagnostics(sf)) {
                return sf!;
            }
            const owners = this._findSpriteFrameRenderOwnersForDiagnostics?.(sf) || [];
            this._traceSpriteFrameResource?.('spriteFrame.require.notReady', name, sf, meta, {
                reason,
                ownerPaths: this._getSpriteFrameOwnerPathsForDiagnostics?.(owners),
                ownerSummaries: this._getSpriteFrameOwnerSummariesForDiagnostics?.(owners),
                owners,
            });
            throw new Error(`[assets] required SpriteFrame not render-ready: ${reason}${name ? ` (${name})` : ''}`);
        },

        _reportSpriteFrameGetHashInvalid(sf: SpriteFrame | null, reason: string, phase: string, error?: unknown): void {
            if (!isDebugPerfTraceEnabled()) return;
            const name = sf?.name || '';
            const meta = name ? this._spriteFrameCacheMeta?.get(name) || null : null;
            const owners = this._findSpriteFrameRenderOwnersForDiagnostics?.(sf) || [];
            debugPerfSnapshot('spriteFrame.getHash.invalidTexture', this, {
                reason,
                phase,
                errorMessage: error instanceof Error ? error.message : error ? String(error) : '',
                ownerPaths: this._getSpriteFrameOwnerPathsForDiagnostics?.(owners),
                ownerSummaries: this._getSpriteFrameOwnerSummariesForDiagnostics?.(owners),
                owners,
                ...this._describeSpriteFrameForDiagnostics(name, sf, meta),
            });
        },

        _reportSpriteFrameGetHashThrow(sf: SpriteFrame | null, reason: string, error: unknown, sampleIndex: number): void {
            if (!isDebugPerfTraceEnabled()) return;
            const name = sf?.name || '';
            const meta = name ? this._spriteFrameCacheMeta?.get(name) || null : null;
            const receiver: any = sf || null;
            const internalTexture = this._getSpriteFrameInternalTextureForDiagnostics(sf);
            const getterTexture = this._getSpriteFrameGetterTextureForDiagnostics(sf);
            const owners = this._findSpriteFrameRenderOwnersForDiagnostics?.(sf) || [];
            debugPerfSnapshot('spriteFrame.getHash.throw', this, {
                reason,
                sampleIndex,
                errorName: error instanceof Error ? error.name : '',
                errorMessage: error instanceof Error ? error.message : error ? String(error) : '',
                errorStack: error instanceof Error && error.stack ? String(error.stack).split('\n').slice(0, 8) : [],
                receiverType: receiver?.constructor?.name || typeof receiver,
                receiverOwnKeys: receiver ? Object.keys(receiver).slice(0, 40) : [],
                receiverHasOwnTexture: receiver ? Object.prototype.hasOwnProperty.call(receiver, '_texture') : false,
                receiverTextureFieldType: typeof receiver?._texture,
                receiverGetterTextureType: typeof receiver?.texture,
                internalTextureType: (internalTexture as any)?.constructor?.name || '',
                internalTextureOwnKeys: internalTexture ? Object.keys(internalTexture as any).slice(0, 40) : [],
                getterTextureType: (getterTexture as any)?.constructor?.name || '',
                getterTextureOwnKeys: getterTexture ? Object.keys(getterTexture as any).slice(0, 40) : [],
                ownerPaths: this._getSpriteFrameOwnerPathsForDiagnostics?.(owners),
                ownerSummaries: this._getSpriteFrameOwnerSummariesForDiagnostics?.(owners),
                owners,
                ...this._describeSpriteFrameForDiagnostics(name, sf, meta),
            });
        },

        _quarantineSpriteFrameGetHashThrow(sf: SpriteFrame | null, reason: string, sampleIndex: number): number {
            if (!isDebugPerfTraceEnabled() || !sf) return 0;
            const scene = this.node?.scene;
            if (!scene?.isValid) return 0;
            const name = sf.name || '';
            const meta = name ? this._spriteFrameCacheMeta?.get(name) || null : null;
            const scan = this._collectRenderFrameOwnersForRuntimeScan(scene, `getHash-quarantine:${name || 'unnamed'}`);
            const clearedOwners: Record<string, unknown>[] = [];
            const rememberOwner = (owner: Record<string, unknown>) => {
                if (clearedOwners.length < RENDER_RESOURCE_DIAGNOSTIC_SAMPLE_LIMIT) {
                    clearedOwners.push(owner);
                }
            };
            for (const sprite of scan.sprites) {
                if (!sprite?.isValid || sprite.spriteFrame !== sf) continue;
                rememberOwner({
                    ownerType: 'Sprite',
                    nodePath: this._getNodePathForDiagnostics(sprite.node || null),
                    nodeActive: !!sprite.node?.active,
                    nodeActiveInHierarchy: !!(sprite.node as any)?.activeInHierarchy,
                    enabledBefore: sprite.enabled !== false,
                });
                try {
                    sprite.enabled = false;
                    sprite.spriteFrame = null;
                    sprite.markForUpdateRenderData?.();
                } catch (error) {
                    rememberOwner({
                        ownerType: 'Sprite.clear.failed',
                        nodePath: this._getNodePathForDiagnostics(sprite.node || null),
                        message: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            for (const owner of scan.renderers) {
                const renderer = owner.renderer;
                if (!renderer?.isValid || owner.spriteFrame !== sf) continue;
                rememberOwner({
                    ownerType: owner.kind || 'UIRenderer',
                    nodePath: this._getNodePathForDiagnostics(renderer.node || null),
                    nodeActive: !!renderer.node?.active,
                    nodeActiveInHierarchy: !!(renderer.node as any)?.activeInHierarchy,
                    enabledBefore: renderer.enabled !== false,
                });
                try {
                    renderer.enabled = false;
                    if (typeof renderer.clear === 'function') {
                        renderer.clear();
                    } else {
                        if ('_textureFrame' in renderer) renderer._textureFrame = null;
                        if ('spriteFrame' in renderer) renderer.spriteFrame = null;
                        renderer.destroyRenderData?.();
                        renderer.markForUpdateRenderData?.();
                    }
                } catch (error) {
                    rememberOwner({
                        ownerType: `${owner.kind || 'UIRenderer'}.clear.failed`,
                        nodePath: this._getNodePathForDiagnostics(renderer.node || null),
                        message: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            debugPerfSnapshot('spriteFrame.getHash.quarantine', this, {
                reason,
                sampleIndex,
                clearedOwnerCount: clearedOwners.length,
                clearedOwnerPaths: this._getSpriteFrameOwnerPathsForDiagnostics?.(clearedOwners),
                clearedOwnerSummaries: this._getSpriteFrameOwnerSummariesForDiagnostics?.(clearedOwners),
                clearedOwners,
                scanFailed: scan.failed,
                ...this._describeSpriteFrameForDiagnostics(name, sf, meta),
            });
            return clearedOwners.length;
        },

        installSpriteFrameGetHashProbe(reason: string = 'render-resource-diagnostics'): void {
            if (!isDebugPerfTraceEnabled()) return;
            const proto = (SpriteFrame as any)?.prototype;
            if (!proto || typeof proto.getHash !== 'function') return;
            if (proto.__pddGetHashProbeInstalled) return;
            const originalGetHash = proto.getHash;
            const runtime = this;
            let beforeOriginalReported = false;
            let throwReportCount = 0;
            const maxThrowReports = 8;
            const fallbackHashes = new WeakMap<object, number>();
            let nextFallbackHash = 0x5f3759df;
            Object.defineProperty(proto, '__pddGetHashProbeInstalled', {
                value: true,
                configurable: false,
                enumerable: false,
            });
            proto.getHash = function patchedGetHash(...args: any[]) {
                const sf = this as SpriteFrame | null;
                if (!beforeOriginalReported && !runtime._isSpriteFrameRenderReadyForDiagnostics?.(sf)) {
                    beforeOriginalReported = true;
                    runtime._reportSpriteFrameGetHashInvalid?.(sf, reason, 'before-original');
                }
                try {
                    return originalGetHash.apply(this, args);
                } catch (error) {
                    if (throwReportCount < maxThrowReports) {
                        throwReportCount += 1;
                        runtime._reportSpriteFrameGetHashThrow?.(sf, reason, error, throwReportCount);
                        runtime._quarantineSpriteFrameGetHashThrow?.(sf, reason, throwReportCount);
                    }
                    if (sf && (typeof sf === 'object' || typeof sf === 'function')) {
                        const key = sf as unknown as object;
                        let fallbackHash = fallbackHashes.get(key);
                        if (!Number.isFinite(fallbackHash)) {
                            nextFallbackHash += 1;
                            fallbackHash = nextFallbackHash;
                            fallbackHashes.set(key, fallbackHash);
                        }
                        return fallbackHash;
                    }
                    return 0x5f3759df;
                }
            };
            debugPerfTrace('spriteFrame.getHash.probe.installed', { reason });
        },

        _getSpriteFrameApplyKey(sprite: Sprite | null, nodePath: string): string {
            const spriteId = (sprite as any)?.uuid || (sprite as any)?._id || '';
            const nodeId = (sprite?.node as any)?.uuid || (sprite?.node as any)?._id || '';
            return String(spriteId || nodeId || nodePath || `sprite-${Number(this._spriteFrameApplySeq) || 0}`);
        },

        _scheduleSpriteFrameApplyFlush(): void {
            if (this._spriteFrameApplyFlushScheduled) return;
            this._spriteFrameApplyFlushScheduled = true;
            let queued = false;
            const queueFlush = () => {
                if (queued) return;
                queued = true;
                const flush = () => {
                    this._spriteFrameApplyFlushScheduled = false;
                    this._flushSpriteFrameApplyQueue?.();
                };
                if (typeof this.scheduleOnce === 'function') {
                    this.scheduleOnce(flush, 0);
                    return;
                }
                setTimeout(flush, 0);
            };
            const afterDrawEvent = (Director as any)?.EVENT_AFTER_DRAW;
            if (afterDrawEvent && typeof director?.once === 'function') {
                director.once(afterDrawEvent, queueFlush);
                setTimeout(queueFlush, 80);
                return;
            }
            queueFlush();
        },

        _flushSpriteFrameApplyQueue(): void {
            const pendingMap = this._spriteFrameApplyPending instanceof Map
                ? this._spriteFrameApplyPending
                : new Map<string, any>();
            if (!(this._spriteFrameApplyPending instanceof Map)) {
                this._spriteFrameApplyPending = pendingMap;
            }
            if (pendingMap.size <= 0) return;
            const pending = (Array.from(pendingMap.values()) as any[]).sort((a: any, b: any) => {
                return (Number(a?.applySeq) || 0) - (Number(b?.applySeq) || 0);
            });
            pendingMap.clear();
            for (const entry of pending) {
                const {
                    sprite,
                    sf,
                    reason,
                    options,
                    applySeq,
                    initSeq,
                    nodePath,
                    frameName,
                } = entry;
                if (
                    typeof this._isRuntimeAliveForAsyncCallback === 'function'
                    && !this._isRuntimeAliveForAsyncCallback()
                ) {
                    debugPerfTrace('spriteFrame.apply.skip', { applySeq, reason, frameName, nodePath, skipReason: 'runtime-dead' });
                    continue;
                }
                if ((Number(this._gameplayInitSeq) || 0) !== initSeq) {
                    debugPerfTrace('spriteFrame.apply.skip', { applySeq, reason, frameName, nodePath, skipReason: 'init-seq-changed' });
                    continue;
                }
                if (!sprite?.isValid || !sprite.node?.isValid) {
                    debugPerfTrace('spriteFrame.apply.skip', { applySeq, reason, frameName, nodePath, skipReason: 'sprite-invalid' });
                    continue;
                }
                if (!sf) {
                    if (options?.allowClear && sprite.spriteFrame !== null) {
                        sprite.spriteFrame = null;
                        debugPerfTrace('spriteFrame.apply.clear', { applySeq, reason, nodePath });
                    }
                    continue;
                }
                const meta = frameName ? this._spriteFrameCacheMeta?.get(frameName) : null;
                if (!this._isSpriteFrameRenderReadyForDiagnostics(sf)) {
                    this._traceSpriteFrameResource?.('spriteFrame.apply.notReady', frameName, sf, meta, {
                        applySeq,
                        reason,
                        nodePath,
                        required: !!options?.required,
                    });
                    if (options?.required) {
                        runtimeWarn(`[SpriteFrameApply] required SpriteFrame not render-ready: ${frameName || '(unnamed)'} (${reason})`);
                    }
                    continue;
                }
                if (sprite.spriteFrame === sf && !options?.forceReassign) {
                    this._traceSpriteFrameResource?.('spriteFrame.apply.skipSame', frameName, sf, meta, {
                        applySeq,
                        reason,
                        nodePath,
                    });
                    continue;
                }
                if (sprite.spriteFrame === sf && options?.forceReassign) {
                    sprite.spriteFrame = null;
                    this._traceSpriteFrameResource?.('spriteFrame.apply.forceReassign', frameName, sf, meta, {
                        applySeq,
                        reason,
                        nodePath,
                    });
                }
                sprite.spriteFrame = sf;
                this._traceSpriteFrameResource?.('spriteFrame.apply.success', frameName, sf, meta, {
                    applySeq,
                    reason,
                    nodePath,
                });
            }
        },

        scheduleSpriteFrameApply(
            sprite: Sprite | null,
            sf: SpriteFrame | null,
            reason: string = 'runtime',
            options: { allowClear?: boolean; required?: boolean; forceReassign?: boolean } = {},
        ): boolean {
            const applySeq = (Number(this._spriteFrameApplySeq) || 0) + 1;
            this._spriteFrameApplySeq = applySeq;
            const initSeq = Number(this._gameplayInitSeq) || 0;
            const nodePath = this._getNodePathForDiagnostics?.(sprite?.node || null) || '';
            const frameName = sf?.name || '';
            const key = this._getSpriteFrameApplyKey(sprite, nodePath);
            if (!(this._spriteFrameApplyPending instanceof Map)) {
                this._spriteFrameApplyPending = new Map<string, any>();
            }
            const previous = this._spriteFrameApplyPending.get(key) || null;
            if (previous) {
                debugPerfTrace('spriteFrame.apply.coalesce', {
                    previousSeq: previous.applySeq,
                    applySeq,
                    previousReason: previous.reason,
                    reason,
                    previousFrameName: previous.frameName,
                    frameName,
                    nodePath,
                });
            }
            this._spriteFrameApplyPending.set(key, {
                sprite,
                sf,
                reason,
                options,
                applySeq,
                initSeq,
                nodePath,
                frameName,
            });
            debugPerfTrace('spriteFrame.apply.queue', {
                applySeq,
                reason,
                frameName,
                nodePath,
                coalesced: !!previous,
            });
            this._scheduleSpriteFrameApplyFlush?.();
            return true;
        },

        _describeSpriteFrameForDiagnostics(name: string, sf: SpriteFrame | null, meta?: any): Record<string, unknown> {
            const internalTexture = this._getSpriteFrameInternalTextureForDiagnostics(sf);
            const getterTexture = this._getSpriteFrameGetterTextureForDiagnostics(sf);
            const texture = internalTexture || getterTexture;
            return {
                name,
                sfName: sf?.name || '',
                sfUuid: (sf as any)?._uuid || (sf as any)?.uuid || '',
                sfValid: !!sf?.isValid,
                hasTexture: !!texture,
                hasInternalTexture: !!internalTexture,
                hasGetterTexture: !!getterTexture,
                textureName: (texture as any)?.name || '',
                textureUuid: (texture as any)?._uuid || (texture as any)?.uuid || '',
                textureValid: !!texture?.isValid,
                textureHasGetHash: typeof (texture as any)?.getHash === 'function',
                internalTextureValid: !!internalTexture?.isValid,
                internalTextureHasGetHash: typeof (internalTexture as any)?.getHash === 'function',
                renderReady: this._isSpriteFrameRenderReadyForDiagnostics(sf),
                releaseMode: meta?.releaseMode || '',
                scope: meta?.scope || '',
                retainCount: Number(meta?.retainCount) || 0,
                ownerCount: meta?.owners instanceof Set ? meta.owners.size : 0,
                cacheResourceRetained: !!meta?.cacheResourceRetained,
                spriteFrameCacheRetained: !!meta?.spriteFrameCacheRetained,
                textureCacheRetained: !!meta?.textureCacheRetained,
                imageAssetCacheRetained: !!meta?.imageAssetCacheRetained,
                sfRefCount: this._getAssetRefCountForDiagnostics(sf),
                textureRefCount: this._getAssetRefCountForDiagnostics(texture),
                imageAssetRefCount: this._getAssetRefCountForDiagnostics(meta?.imageAsset),
            };
        },

        _addCacheRef(asset: any, label: string, name: string): boolean {
            if (!asset?.isValid || typeof asset.addRef !== 'function') return false;
            try {
                asset.addRef();
                return true;
            } catch (error) {
                console.warn(`[Memory] addRef failed for ${label}: ${name}`, error);
                return false;
            }
        },

        _decCacheRef(asset: any, label: string, name: string, reason: string): void {
            if (!asset || typeof asset.decRef !== 'function') return;
            try {
                asset.decRef();
            } catch (error) {
                console.warn(`[Memory] decRef failed for ${label}: ${name} (${reason})`, error);
            }
        },

        _retainSpriteFrameCacheResource(name: string, sf: SpriteFrame | null, meta: any): void {
            if (!sf || !meta || meta.cacheResourceRetained) return;
            const texture = (meta.texture || this._getSpriteFrameTextureForDiagnostics(sf)) as Texture2D | null;
            const imageAsset = meta.imageAsset as ImageAsset | null;
            meta.spriteFrameCacheRetained = this._addCacheRef(sf, 'SpriteFrame', name);
            meta.textureCacheRetained = texture ? this._addCacheRef(texture, 'Texture2D', name) : false;
            meta.imageAssetCacheRetained = imageAsset ? this._addCacheRef(imageAsset, 'ImageAsset', name) : false;
            meta.cacheResourceRetained = !!(meta.spriteFrameCacheRetained || meta.textureCacheRetained || meta.imageAssetCacheRetained);
            this._traceSpriteFrameResource?.('spriteFrame.cache.retain', name, sf, meta);
        },

        _releaseSpriteFrameCacheResource(name: string, sf: SpriteFrame | null, meta: any, reason: string): void {
            if (!meta?.cacheResourceRetained) return;
            const texture = (meta.texture || this._getSpriteFrameTextureForDiagnostics(sf)) as Texture2D | null;
            const imageAsset = meta.imageAsset as ImageAsset | null;
            this._traceSpriteFrameResource?.('spriteFrame.cache.releaseRef.before', name, sf, meta, { reason });
            if (meta.imageAssetCacheRetained) {
                this._decCacheRef(imageAsset, 'ImageAsset', name, reason);
                meta.imageAssetCacheRetained = false;
            }
            if (meta.textureCacheRetained) {
                this._decCacheRef(texture, 'Texture2D', name, reason);
                meta.textureCacheRetained = false;
            }
            if (meta.spriteFrameCacheRetained) {
                this._decCacheRef(sf, 'SpriteFrame', name, reason);
                meta.spriteFrameCacheRetained = false;
            }
            meta.cacheResourceRetained = false;
            this._traceSpriteFrameResource?.('spriteFrame.cache.releaseRef.after', name, sf, meta, { reason });
        },

        _getNodePathForDiagnostics(node: Node | null): string {
            const names: string[] = [];
            let cur: Node | null = node;
            let guard = 0;
            while (cur?.isValid && guard < 16) {
                names.unshift(cur.name || '(unnamed)');
                cur = cur.parent || null;
                guard += 1;
            }
            return names.join('/');
        },

        _traceSpriteFrameResource(eventName: string, name: string, sf: SpriteFrame | null, meta?: any, data: Record<string, unknown> = {}) {
            if (!isDebugPerfTraceEnabled()) return;
            debugPerfSnapshot(eventName, this, {
                ...this._describeSpriteFrameForDiagnostics(name, sf, meta),
                ...data,
            });
        },

        scanRenderSpriteFrameHealth(context: string, root?: Node | null, options: { always?: boolean } = {}) {
            if (!isDebugPerfTraceEnabled()) return { spriteCount: 0, invalidCount: 0 };
            const scanRoot = root || this.node?.scene || this.node || null;
            const scan = this._collectRenderFrameOwnersForRuntimeScan(scanRoot, `render-health:${context}`);
            let spriteCount = 0;
            let rendererCount = 0;
            let invalidCount = 0;
            const invalidSamples: Record<string, unknown>[] = [];
            for (const sprite of scan.sprites) {
                if (!sprite?.isValid) continue;
                spriteCount += 1;
                const sf = sprite.spriteFrame || null;
                if (!sf) continue;
                if (this._isSpriteFrameRenderReadyForDiagnostics(sf)) continue;
                invalidCount += 1;
                if (invalidSamples.length >= RENDER_RESOURCE_DIAGNOSTIC_SAMPLE_LIMIT) continue;
                const node = sprite.node || null;
                const name = sf.name || '';
                const meta = name ? this._spriteFrameCacheMeta.get(name) || null : null;
                invalidSamples.push({
                    nodePath: this._getNodePathForDiagnostics(node),
                    nodeActive: !!node?.active,
                    nodeActiveInHierarchy: !!(node as any)?.activeInHierarchy,
                    spriteEnabled: !!sprite.enabled,
                    ...this._describeSpriteFrameForDiagnostics(name, sf, meta),
                });
            }
            for (const owner of scan.renderers) {
                const renderer = owner.renderer;
                if (!renderer?.isValid) continue;
                rendererCount += 1;
                const sf = owner.spriteFrame || null;
                if (!sf) continue;
                if (this._isSpriteFrameRenderReadyForDiagnostics(sf)) continue;
                invalidCount += 1;
                if (invalidSamples.length >= RENDER_RESOURCE_DIAGNOSTIC_SAMPLE_LIMIT) continue;
                const node = renderer.node || null;
                const name = sf.name || '';
                const meta = name ? this._spriteFrameCacheMeta.get(name) || null : null;
                invalidSamples.push({
                    nodePath: this._getNodePathForDiagnostics(node),
                    nodeActive: !!node?.active,
                    nodeActiveInHierarchy: !!(node as any)?.activeInHierarchy,
                    rendererType: owner.kind,
                    rendererEnabled: renderer.enabled !== false,
                    ...this._describeSpriteFrameForDiagnostics(name, sf, meta),
                });
            }
            if (invalidCount > 0 || options.always) {
                debugPerfSnapshot('render.spriteFrame.health', this, {
                    context,
                    spriteCount,
                    rendererCount,
                    invalidCount,
                    invalidSamples,
                    scanFailed: scan.failed,
                });
            }
            return { spriteCount, rendererCount, invalidCount };
        },

        startRenderResourceDiagnostics(reason: string = 'runtime-start') {
            if (!isDebugPerfTraceEnabled()) return;
            this.installSpriteFrameGetHashProbe?.(reason);
            if (this._renderResourceDiagnosticsTick) return;
            const tick = () => {
                if (!this.node?.isValid) return;
                this.scanRenderSpriteFrameHealth?.(`periodic:${reason}`);
            };
            this._renderResourceDiagnosticsTick = tick;
            debugPerfSnapshot('renderResource.diagnostics.start', this, {
                reason,
                intervalSeconds: RENDER_RESOURCE_DIAGNOSTIC_INTERVAL_SECONDS,
            });
            this.schedule(tick, RENDER_RESOURCE_DIAGNOSTIC_INTERVAL_SECONDS);
            this.scheduleOnce(tick, 0);
        },

        stopRenderResourceDiagnostics(reason: string = 'runtime-destroy') {
            const tick = this._renderResourceDiagnosticsTick;
            if (!tick) return;
            this.scanRenderSpriteFrameHealth?.(`stop:${reason}`, null, { always: true });
            this.unschedule(tick);
            this._renderResourceDiagnosticsTick = null;
            debugPerfSnapshot('renderResource.diagnostics.stop', this, {
                reason,
            });
        },

        _getPanelTextureOwnerKey(panelKey: string): string {
            return `panel:${panelKey}`;
        },

        _retainPanelTextureOwner(panelKey: string, names: string[], scope: string = SPRITE_FRAME_SCOPE_SHARED_UI) {
            const owner = this._getPanelTextureOwnerKey(panelKey);
            const uniqueNames = Array.from(new Set(names));
            let retainedNames = 0;
            for (const name of uniqueNames) {
                const sf = this.getSF(name);
                if (!sf) continue;
                retainedNames += 1;
                const meta = this._getSpriteFrameCacheMetaEntry(name, true, scope);
                this._retainSpriteFrameCacheResource?.(name, sf, meta);
                if (!meta.owners.has(owner)) {
                    meta.owners.add(owner);
                    meta.retainCount = (Number(meta.retainCount) || 0) + 1;
                }
            }
            debugPerfSnapshot('panel.texture.retain', this, {
                panelKey,
                owner,
                requestedNames: uniqueNames.length,
                retainedNames,
                scope,
            });
        },

        _releaseSpriteFrameOwner(owner: string, reason: string) {
            if (!owner) return;
            let released = 0;
            for (const [name, meta] of this._spriteFrameCacheMeta.entries()) {
                if (!(meta?.owners instanceof Set) || !meta.owners.has(owner)) continue;
                meta.owners.delete(owner);
                meta.retainCount = Math.max(0, (Number(meta.retainCount) || 0) - 1);
                if (meta.retainCount === 0 && this._canAutoReleaseSpriteFrameScope(meta.scope, reason)) {
                    if (this._releaseSpriteFrameCacheEntry(name, reason)) {
                        released += 1;
                    }
                }
            }
            if (released > 0) {
                runtimeLog(`[Memory] released ${released} owner-held SpriteFrames: ${reason}`);
            }
        },

        _releasePanelTextureOwner(panelKey: string, reason: string) {
            const owner = this._getPanelTextureOwnerKey(panelKey);
            debugPerfSnapshot('panel.texture.release.before', this, {
                panelKey,
                owner,
                reason,
            });
            this._releaseSpriteFrameOwner(owner, reason);
            debugPerfSnapshot('panel.texture.release.after', this, {
                panelKey,
                owner,
                reason,
            });
        },

        _isRuntimeAliveForAsyncCallback(): boolean {
            return !!this?.isValid && !!this.node?.isValid;
        },

        cancelSpriteFrameLoadQueue(reason: string = 'runtime-destroy') {
            const queueSize = Array.isArray(this._spriteFrameLoadQueue) ? this._spriteFrameLoadQueue.length : 0;
            const inFlight = Math.max(0, Number(this._spriteFrameLoadInFlight) || 0);
            const pendingCount = this._pendingSpriteFrameLoads instanceof Map ? this._pendingSpriteFrameLoads.size : 0;
            const pendingApplyCount = this._spriteFrameApplyPending instanceof Map ? this._spriteFrameApplyPending.size : 0;
            if (queueSize === 0 && inFlight === 0 && pendingCount === 0 && pendingApplyCount === 0) return;
            debugPerfTrace('spriteFrame.load.cancel', {
                reason,
                queueSize,
                inFlight,
                pendingCount,
                pendingApplyCount,
            });
            this._spriteFrameLoadQueueCancelled = true;
            this._spriteFrameLoadQueue = [];
            this._spriteFrameLoadInFlight = 0;
            if (this._pendingSpriteFrameLoads instanceof Map) {
                this._pendingSpriteFrameLoads.clear();
            }
            if (this._spriteFrameApplyPending instanceof Map) {
                this._spriteFrameApplyPending.clear();
            }
            this._spriteFrameApplyFlushScheduled = false;
        },

        _canAutoReleaseSpriteFrameScope(scope: string, reason: string): boolean {
            if (scope === SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP) {
                return reason.includes('runtime-destroy');
            }
            if (scope === SPRITE_FRAME_SCOPE_SHARED_UI) {
                return reason.includes('runtime-destroy');
            }
            if (scope === SPRITE_FRAME_SCOPE_SCENE_HOME || scope === SPRITE_FRAME_SCOPE_SCENE_GAME) {
                return reason.includes('scene-destroy') || reason.includes('runtime-destroy');
            }
            return true;
        },

        _getSpriteFrameLoadCandidates(assetPath: string): string[] {
            if (assetPath.endsWith('/spriteFrame')) {
                return [assetPath];
            }
            return [`${assetPath}/spriteFrame`, assetPath];
        },

        _loadSpriteFrameWithCandidates(
            load: (path: string, done: (err: Error | null, sf: SpriteFrame | null) => void) => void,
            candidates: string[],
            callback: (sf: SpriteFrame | null) => void,
        ) {
            const tryLoad = (index: number) => {
                if (index >= candidates.length) {
                    callback(null);
                    return;
                }
                load(candidates[index], (err, sf) => {
                    if (!err && sf) {
                        callback(sf);
                        return;
                    }
                    tryLoad(index + 1);
                });
            };
            tryLoad(0);
        },

        _getRoutedBundle(bundleName: string): Bundle | null {
            try {
                return AppRoot.tryGet()?.session.getRoutedBundle(bundleName) || null;
            } catch (_) {
                return null;
            }
        },

        _preloadGameAssetsTextureSet(bundle: Bundle, onDone?: () => void, paths: string[] = GAME_ASSETS_PRELOAD_TEXTURE_PATHS) {
            if (paths.length === 0) {
                if (onDone) onDone();
                return;
            }
            let remaining = paths.length;
            let loaded = 0;
            const finishOne = () => {
                remaining -= 1;
                if (remaining > 0) return;
                runtimeLog(`[gameAssets] preloaded ${loaded}/${paths.length} startup SpriteFrames`);
                if (onDone) onDone();
            };
            for (const path of paths) {
                const fallbackName = path.slice(path.lastIndexOf('/') + 1);
                this._loadSpriteFrameWithCandidates(
                    (candidate, done) => bundle.load(candidate, SpriteFrame, done),
                    this._getSpriteFrameLoadCandidates(path),
                    (sf) => {
                        if (!sf) {
                            console.warn(`[gameAssets] startup texture load failed: ${path}`, 'SpriteFrame not found');
                        } else {
                            this._cacheSpriteFrame(sf, fallbackName);
                            loaded += 1;
                        }
                        finishOne();
                    },
                );
            }
        },

        getRequiredBoardEffectTextureNames(): string[] {
            return BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS
                .map((path) => path.slice(path.lastIndexOf('/') + 1))
                .filter((name) => !!name);
        },

        getMissingRequiredBoardEffectTextureNames(): string[] {
            return this.getRequiredBoardEffectTextureNames().filter((name) => !this.sfCache.has(name));
        },

        prepareRequiredBoardEffectTextures(
            callback: (result: { ok: boolean; errorCode?: string; errorMessage?: string; missingTextureNames?: string[] }) => void,
            bundle?: Bundle | null,
        ) {
            void bundle;
            const requiredTextureNames = this.getRequiredBoardEffectTextureNames();
            if (requiredTextureNames.length === 0) {
                callback({ ok: true });
                return;
            }
            const verifyLoaded = () => {
                const missingTextureNames = this.getMissingRequiredBoardEffectTextureNames();
                if (missingTextureNames.length > 0) {
                    callback({
                        ok: false,
                        errorCode: 'board_effect_textures_missing',
                        errorMessage: `missing board effect textures: ${missingTextureNames.join(', ')}`,
                        missingTextureNames,
                    });
                    return;
                }
                callback({ ok: true });
            };
            const loadFromBundle = (targetBundle: Bundle | null) => {
                if (!targetBundle) {
                    callback({
                        ok: false,
                        errorCode: 'board_effect_bundle_missing',
                        errorMessage: 'missing bootstrap bundle for board effect textures',
                        missingTextureNames: requiredTextureNames,
                    });
                    return;
                }
                this._preloadBootstrapTexturePathsStrict(BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS, verifyLoaded, targetBundle);
            };
            this._withBootstrapBundle(loadFromBundle);
        },

        _getGameAssetsTextureCandidatePaths(imgName: string): string[] {
            return GAME_ASSETS_TEXTURE_SEARCH_DIRS.reduce<string[]>((paths, dir) => {
                paths.push(...this._getSpriteFrameLoadCandidates(`${dir}/${imgName}`));
                return paths;
            }, []);
        },

        _getGameAssetsImageAssetCandidatePaths(imgName: string): string[] {
            return GAME_ASSETS_TEXTURE_SEARCH_DIRS.map((dir) => `${dir}/${imgName}`);
        },

        _getBootstrapTextureBaseCandidates(imgName: string): string[] {
            const dirs = LOCAL_BOOTSTRAP_TEXTURE_NAMES.has(imgName)
                ? ['GameUI', LOCAL_BOOTSTRAP_TEXTURE_DIR]
                : [LOCAL_BOOTSTRAP_TEXTURE_DIR, 'GameUI'];
            return Array.from(new Set(dirs)).map((dir) => `${dir}/${imgName}`);
        },

        _getBootstrapTextureCandidatePaths(imgName: string): string[] {
            return this._getBootstrapTextureBaseCandidates(imgName).reduce((paths: string[], basePath: string) => {
                paths.push(...this._getSpriteFrameLoadCandidates(basePath));
                return paths;
            }, [] as string[]);
        },

        _getBootstrapImageAssetCandidatePaths(imgName: string): string[] {
            return this._getBootstrapTextureBaseCandidates(imgName);
        },

        _createSpriteFrameFromImageAsset(imgName: string, imgAsset: ImageAsset): SpriteFrame | null {
            const width = imgAsset.width || (imgAsset as any)?.image?.width || 0;
            const height = imgAsset.height || (imgAsset as any)?.image?.height || 0;
            if (!width || !height) {
                return null;
            }
            const texture = new Texture2D();
            texture.image = imgAsset;
            const sf = new SpriteFrame();
            sf.texture = texture;
            sf.rect = new Rect(0, 0, width, height);
            sf.name = imgName;
            (sf as any).__pddReleaseMode = 'dynamic';
            (sf as any).__pddOwnedTexture = texture;
            (sf as any).__pddSourceImageAsset = imgAsset;
            return sf;
        },

        _loadBootstrapImageSpriteFrame(bundle: Bundle, imgName: string, callback: (sf: SpriteFrame | null) => void) {
            const candidates = this._getBootstrapImageAssetCandidatePaths(imgName);
            const tryLoad = (index: number) => {
                if (index >= candidates.length) {
                    callback(null);
                    return;
                }
                bundle.load(candidates[index], ImageAsset, (err, imgAsset) => {
                    if (!err && imgAsset) {
                        const sf = this._createSpriteFrameFromImageAsset(imgName, imgAsset);
                        if (sf) {
                            callback(sf);
                            return;
                        }
                    }
                    tryLoad(index + 1);
                });
            };
            tryLoad(0);
        },

        _loadSpriteFrameFromBootstrapBundle(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            this._withBootstrapBundle((bundle) => {
                if (!bundle) {
                    callback(null);
                    return;
                }
                const candidates = this._getBootstrapTextureCandidatePaths(imgName);
                this._loadSpriteFrameWithCandidates(
                    (candidate, done) => bundle.load(candidate, SpriteFrame, done),
                    candidates,
                    (sf) => {
                        if (sf) {
                            callback(sf);
                            return;
                        }
                        this._loadBootstrapImageSpriteFrame(bundle, imgName, callback);
                    },
                );
            });
        },

        _preloadBootstrapTexturePathsStrict(assetPaths: string[], callback: () => void, bundle?: Bundle | null) {
            const paths = Array.from(new Set(assetPaths.filter((path) => !!path)));
            if (paths.length === 0) {
                callback();
                return;
            }
            const loadFromBundle = (targetBundle: Bundle | null) => {
                if (!targetBundle) {
                    for (const assetPath of paths) {
                        console.warn('[bootstrap] critical UI texture missing:', assetPath);
                    }
                    callback();
                    return;
                }
                let remaining = paths.length;
                const finishOne = () => {
                    remaining -= 1;
                    if (remaining > 0) return;
                    callback();
                };
                for (const assetPath of paths) {
                    const basePath = assetPath.endsWith('/spriteFrame') ? assetPath.slice(0, -'/spriteFrame'.length) : assetPath;
                    const fallbackName = basePath.slice(basePath.lastIndexOf('/') + 1);
                    this._loadSpriteFrameWithCandidates(
                        (candidate, done) => targetBundle.load(candidate, SpriteFrame, done),
                        this._getSpriteFrameLoadCandidates(assetPath),
                        (sf) => {
                            if (sf) {
                                this._cacheSpriteFrame(sf, fallbackName, { scope: SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP });
                                finishOne();
                                return;
                            }
                            this._loadBootstrapImageSpriteFrame(targetBundle, fallbackName, (imageSf) => {
                                if (imageSf) {
                                    this._cacheSpriteFrame(imageSf, fallbackName, { scope: SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP });
                                } else {
                                    console.warn('[bootstrap] critical UI texture missing:', assetPath);
                                }
                                finishOne();
                            });
                        },
                    );
                }
            };
            if (bundle) {
                loadFromBundle(bundle);
                return;
            }
            this._withBootstrapBundle(loadFromBundle);
        },

        _loadSpriteFrameFromBootstrapThenRemote(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            this._loadSpriteFrameFromBootstrapBundle(imgName, (sf) => {
                if (sf) {
                    callback(sf);
                    return;
                }
                this._loadSpriteFrameFromGameAssetsBundle(imgName, callback);
            });
        },

        _withBootstrapBundle(callback: (bundle: Bundle | null) => void) {
            if (this.bootstrapBundle) {
                debugPerfSnapshot('bundle.bootstrap.reuse', this, {
                    bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                });
                callback(this.bootstrapBundle);
                return;
            }
            const routedBundle = this._getRoutedBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME);
            if (routedBundle) {
                this.bootstrapBundle = routedBundle;
                debugPerfSnapshot('bundle.bootstrap.seedFromRoute', this, {
                    bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                });
                callback(routedBundle);
                return;
            }
            if (this._bootstrapBundleLoadingCallbacks) {
                this._bootstrapBundleLoadingCallbacks.push(callback);
                debugPerfTrace('bundle.bootstrap.queue', {
                    bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                    waitingCallbacks: this._bootstrapBundleLoadingCallbacks.length,
                });
                return;
            }
            this._bootstrapBundleLoadingCallbacks = [callback];
            runtimeLog('[bootstrap] loadBundle start');
            const startedAt = Date.now();
            debugPerfSnapshot('bundle.bootstrap.load.start', this, {
                bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
            });
            assetManager.loadBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME, (err, bundle) => {
                if (err || !bundle) {
                    console.warn('[bootstrap] loadBundle failed:', err?.message || 'no bundle');
                    debugPerfSnapshot('bundle.bootstrap.load.error', this, {
                        bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                        durationMs: Date.now() - startedAt,
                        error: err || new Error('no bundle'),
                    });
                } else {
                    runtimeLog('[bootstrap] loadBundle success');
                    this.bootstrapBundle = bundle;
                    debugPerfSnapshot('bundle.bootstrap.load.success', this, {
                        bundleName: LOCAL_BOOTSTRAP_BUNDLE_NAME,
                        durationMs: Date.now() - startedAt,
                    });
                }
                const callbacks = this._bootstrapBundleLoadingCallbacks || [];
                this._bootstrapBundleLoadingCallbacks = null;
                for (const done of callbacks) {
                    done(bundle || null);
                }
            });
        },

        prefetchLocalBootstrapStartupAssets(levelId: number, callback?: (ready: boolean) => void) {
            if (!this.shouldUseLocalBootstrapBundle(levelId, LOCAL_BOOTSTRAP_LEVEL_PREFIX)) {
                callback?.(false);
                return;
            }
            const alreadyReady =
                this._startupBootstrapPrefetchState === 'ready'
                && this._startupBootstrapPrefetchLevelId === levelId
                && this._bootstrapBeanAtlasReady;
            if (alreadyReady) {
                callback?.(true);
                return;
            }
            if (
                this._startupBootstrapPrefetchState === 'loading'
                && this._startupBootstrapPrefetchLevelId === levelId
            ) {
                if (callback) {
                    const callbacks = this._startupBootstrapPrefetchCallbacks || [];
                    callbacks.push(callback);
                    this._startupBootstrapPrefetchCallbacks = callbacks;
                }
                return;
            }

            this._startupBootstrapPrefetchState = 'loading';
            this._startupBootstrapPrefetchLevelId = levelId;
            this._startupBootstrapPrefetchCallbacks = callback ? [callback] : [];

            let levelReady = false;
            let beanReady = false;
            let uiReady = false;
            let bootstrapTextureNames: string[] = [];
            let resolved = false;
            const finish = (ready: boolean) => {
                if (resolved) return;
                resolved = true;
                this._startupBootstrapPrefetchState = ready ? 'ready' : 'failed';
                const callbacks = this._startupBootstrapPrefetchCallbacks || [];
                this._startupBootstrapPrefetchCallbacks = null;
                for (const done of callbacks) {
                    done(ready);
                }
            };
            const tryFinish = () => {
                if (levelReady && beanReady && uiReady) {
                    finish(true);
                }
            };
            const startUiPrefetch = (data: LevelData) => {
                bootstrapTextureNames = Array.from(new Set([
                    ...this.getCriticalUiTextureNamesForLevel(data),
                    ...this.getRequiredBoardEffectTextureNames(),
                ])).filter((name) => this.shouldUseLocalBootstrapTexture(name, levelId));
                if (bootstrapTextureNames.length === 0) {
                    uiReady = true;
                    tryFinish();
                    return;
                }
                this._preloadBootstrapTextureSetStrict(bootstrapTextureNames, () => {
                    uiReady = bootstrapTextureNames.every((name) => this.sfCache.has(name));
                    if (!uiReady) {
                        const missingTextureNames = bootstrapTextureNames.filter((name) => !this.sfCache.has(name));
                        console.warn('[bootstrap] startup prefetch required ui textures missing:', missingTextureNames);
                        finish(false);
                        return;
                    }
                    tryFinish();
                });
            };

            this._loadLocalLevelDataImpl(levelId, (data) => {
                if (!data) {
                    console.warn(`[bootstrap] startup prefetch level data missing: ${LOCAL_BOOTSTRAP_LEVEL_PREFIX}${levelId}`);
                    finish(false);
                    return;
                }
                levelReady = true;
                startUiPrefetch(data);
                tryFinish();
            }, LOCAL_BOOTSTRAP_LEVEL_PREFIX);

            this._ensureBootstrapBeanAtlasLoaded(() => {
                beanReady = !!this._bootstrapBeanAtlasReady;
                if (!beanReady) {
                    console.warn('[bootstrap] startup prefetch bean atlas unavailable');
                    finish(false);
                    return;
                }
                tryFinish();
            });
        },

        releaseStartupBootstrapPrefetchIfUnused(reason: string) {
            const releaseNow = () => {
                this._startupBootstrapPrefetchState = 'released';
                this._startupBootstrapPrefetchLevelId = 0;
                this._startupBootstrapPrefetchReleaseQueued = false;
            };

            if (this._startupBootstrapPrefetchState === 'loading') {
                if (!this._startupBootstrapPrefetchReleaseQueued) {
                    const callbacks = this._startupBootstrapPrefetchCallbacks || [];
                    callbacks.push((ready) => {
                        if (!this.node?.isValid) return;
                        if (ready) {
                            releaseNow();
                        } else {
                            this._startupBootstrapPrefetchState = 'failed';
                            this._startupBootstrapPrefetchLevelId = 0;
                            this._startupBootstrapPrefetchReleaseQueued = false;
                        }
                    });
                    this._startupBootstrapPrefetchCallbacks = callbacks;
                    this._startupBootstrapPrefetchReleaseQueued = true;
                }
                return;
            }
            if (this._startupBootstrapPrefetchState !== 'ready') {
                this._startupBootstrapPrefetchLevelId = 0;
                this._startupBootstrapPrefetchReleaseQueued = false;
                return;
            }
            releaseNow();
        },

        _flushGameAssetsBundleLoadingCallbacks(bundle: Bundle | null) {
            const callbacks = this._gameAssetsBundleLoadingCallbacks || [];
            this._gameAssetsBundleLoadingCallbacks = null;
            for (const done of callbacks) {
                done(bundle);
            }
        },

        _withGameAssetsBundle(callback: (bundle: Bundle | null) => void) {
            if (this.gameAssetsBundle) {
                if (!this._isRuntimeAliveForAsyncCallback()) return;
                debugPerfSnapshot('bundle.gameAssets.reuse', this, {
                    bundleName: GAME_ASSETS_BUNDLE_NAME,
                });
                callback(this.gameAssetsBundle);
                return;
            }
            if (this._gameAssetsBundleLoadingCallbacks) {
                this._gameAssetsBundleLoadingCallbacks.push(callback);
                debugPerfTrace('bundle.gameAssets.queue', {
                    bundleName: GAME_ASSETS_BUNDLE_NAME,
                    waitingCallbacks: this._gameAssetsBundleLoadingCallbacks.length,
                    preloadingGameAssetsBundle: !!this._preloadingBundle,
                });
                return;
            }
            if (this._preloadingBundle) {
                this._gameAssetsBundleLoadingCallbacks = [callback];
                debugPerfTrace('bundle.gameAssets.waitExisting', {
                    bundleName: GAME_ASSETS_BUNDLE_NAME,
                    waitingCallbacks: this._gameAssetsBundleLoadingCallbacks.length,
                });
                const check = () => {
                    if (!this._isRuntimeAliveForAsyncCallback()) {
                        this.unschedule(check);
                        this._gameAssetsBundleLoadingCallbacks = null;
                        debugPerfTrace('bundle.gameAssets.wait.abort.runtimeDead', {
                            bundleName: GAME_ASSETS_BUNDLE_NAME,
                        });
                        return;
                    }
                    if (this.gameAssetsBundle) {
                        this.unschedule(check);
                        debugPerfSnapshot('bundle.gameAssets.wait.success', this, {
                            bundleName: GAME_ASSETS_BUNDLE_NAME,
                        });
                        this._flushGameAssetsBundleLoadingCallbacks(this.gameAssetsBundle);
                        return;
                    }
                    if (!this._preloadingBundle) {
                        this.unschedule(check);
                        debugPerfSnapshot('bundle.gameAssets.wait.missing', this, {
                            bundleName: GAME_ASSETS_BUNDLE_NAME,
                        });
                        this._flushGameAssetsBundleLoadingCallbacks(null);
                    }
                };
                this.schedule(check, 0.05);
                return;
            }
            this._preloadingBundle = true;
            this._gameAssetsBundleLoadingCallbacks = [callback];
            const startedAt = Date.now();
            debugPerfSnapshot('bundle.gameAssets.load.start', this, {
                bundleName: GAME_ASSETS_BUNDLE_NAME,
            });
            assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                this._preloadingBundle = false;
                if (!this._isRuntimeAliveForAsyncCallback()) {
                    this._gameAssetsBundleLoadingCallbacks = null;
                    debugPerfTrace('bundle.gameAssets.load.abort.runtimeDead', {
                        bundleName: GAME_ASSETS_BUNDLE_NAME,
                        durationMs: Date.now() - startedAt,
                    });
                    return;
                }
                if (err || !bundle) {
                    console.warn('loadBundle gameAssets failed:', err?.message);
                    debugPerfSnapshot('bundle.gameAssets.load.error', this, {
                        bundleName: GAME_ASSETS_BUNDLE_NAME,
                        durationMs: Date.now() - startedAt,
                        error: err || new Error('no bundle'),
                    });
                    this._flushGameAssetsBundleLoadingCallbacks(null);
                    return;
                }
                this.gameAssetsBundle = bundle;
                debugPerfSnapshot('bundle.gameAssets.load.success', this, {
                    bundleName: GAME_ASSETS_BUNDLE_NAME,
                    durationMs: Date.now() - startedAt,
                });
                this._flushGameAssetsBundleLoadingCallbacks(bundle);
            });
        },

        _getMiniGameBuildMode(): string {
            const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
            const w: any = typeof window !== 'undefined' ? window : null;
            return String(
                g?.__PDD_WECHAT_BUILD_MODE__
                || w?.__PDD_WECHAT_BUILD_MODE__
                || g?.__PDD_DOUYIN_BUILD_MODE__
                || w?.__PDD_DOUYIN_BUILD_MODE__
                || '',
            );
        },

        _getLevelDataCdnUnavailableError(): Error {
            const diagnostics = LevelDataCdnService.inst.getAvailabilityDiagnostics();
            const baseUrl = String(diagnostics.baseUrl || '');
            const reason = String(diagnostics.reason || diagnostics.liveUnavailableReason || 'unknown');
            return new Error(`level data CDN unavailable: ${reason}; baseUrl=${baseUrl}`);
        },

        _withLevelDataBundle(callback: (bundle: Bundle | null) => void) {
            if (this.levelDataBundle) {
                callback(this.levelDataBundle);
                return;
            }
            if (this._levelDataBundleLoadingCallbacks) {
                this._levelDataBundleLoadingCallbacks.push(callback);
                return;
            }
            this._levelDataBundleLoadingCallbacks = [callback];
            assetManager.loadBundle(LEVEL_DATA_BUNDLE_NAME, (err, bundle) => {
                if (err || !bundle) {
                    console.warn('[LevelDataLoad] loadBundle levelData failed:', err?.message || 'no bundle');
                } else {
                    this.levelDataBundle = bundle;
                }
                const callbacks = this._levelDataBundleLoadingCallbacks || [];
                this._levelDataBundleLoadingCallbacks = null;
                for (const done of callbacks) {
                    done(bundle || null);
                }
            });
        },

        loadCollectionLevelEntries(callback: (entries: LevelCollectionEntry[] | null, err: Error | null) => void) {
            if (!shouldUseLocalLevelDataMirror()) {
                LevelDataCdnService.inst.loadCollectionEntries().then((entries) => {
                    callback(entries, null);
                }).catch((error) => {
                    callback(null, error instanceof Error ? error : new Error(String(error)));
                });
                return;
            }
            this._withLevelDataBundle((bundle) => {
                if (!bundle) {
                    callback(null, new Error('levelData bundle unavailable'));
                    return;
                }
                bundle.load('level-manifest', JsonAsset, (err, jsonAsset) => {
                    if (err || !jsonAsset) {
                        callback(null, err || new Error('level-manifest missing'));
                        return;
                    }
                    try {
                        const manifest = jsonAsset.json as any;
                        if (Number(manifest?.collectionCatalogVersion) !== 1) {
                            throw new Error('level-manifest collectionCatalogVersion unsupported');
                        }
                        if (!Array.isArray(manifest?.entries)) {
                            throw new Error('level-manifest entries missing');
                        }
                        const availableKeys = new Set<string>(manifest.entries.map((entry: any) => {
                            const prefix = String(entry?.prefix || 'level_');
                            return prefix + Number(entry?.levelId);
                        }));
                        const entries = normalizeLevelCollectionEntries(
                            manifest.collectionEntries,
                            'level-manifest collectionEntries',
                        );
                        for (const entry of entries) {
                            if (!availableKeys.has(entry.prefix + entry.levelId)) {
                                throw new Error('level-manifest collection entry missing level: ' + entry.prefix + entry.levelId);
                            }
                        }
                        callback(entries, null);
                    } catch (error) {
                        callback(null, error instanceof Error ? error : new Error(String(error)));
                    }
                });
            });
        },

        _loadLevelDataFromLocalBundle(levelId: number, prefix: string, callback: (data: LevelData | null, source: string, err?: Error | null) => void) {
            const levelPath = this.getLevelDataPath(levelId, prefix);
            const bundlePath = `${prefix}${levelId}`;
            this._withLevelDataBundle((bundle) => {
                if (!bundle) {
                    callback(null, 'level_data_bundle', new Error('levelData bundle unavailable'));
                    return;
                }
                bundle.load(bundlePath, JsonAsset, (err, jsonAsset) => {
                    if (err || !jsonAsset) {
                        callback(null, 'level_data_bundle', err || new Error('missing json asset'));
                        return;
                    }
                    callback(jsonAsset.json as LevelData, 'level_data_bundle', null);
                });
            });
        },

        _loadLevelDataFromConfiguredSource(levelId: number, prefix: string, callback: (data: LevelData | null, source: string, err?: Error | null) => void) {
            if (shouldUseLocalLevelDataMirror()) {
                this._loadLevelDataFromLocalBundle(levelId, prefix, callback);
                return;
            }
            LevelDataCdnService.inst.loadLevel(levelId, prefix).then((cdnLevelData) => {
                if (cdnLevelData) {
                    callback(cdnLevelData, 'level_data_cdn', null);
                    return;
                }
                callback(null, 'level_data_cdn', this._getLevelDataCdnUnavailableError());
            }).catch((err) => {
                callback(null, 'level_data_cdn', err instanceof Error ? err : new Error(String(err)));
            });
        },

        _loadSpriteFrameFromGameAssetsBundle(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            this._withGameAssetsBundle((bundle) => {
                if (!bundle) {
                    callback(null);
                    return;
                }
                const candidates = this._getGameAssetsTextureCandidatePaths(imgName);
                this._loadSpriteFrameWithCandidates(
                    (candidate, done) => bundle.load(candidate, SpriteFrame, done),
                    candidates,
                    (sf) => {
                        if (sf) {
                            callback(sf);
                            return;
                        }
                        this._loadGameAssetsImageSpriteFrame(bundle, imgName, (imageSf) => {
                            if (!imageSf) {
                                console.warn(`[gameAssets] SpriteFrame not found: ${imgName}`);
                            }
                            callback(imageSf);
                        });
                    },
                );
            });
        },

        _loadGameAssetsImageSpriteFrame(bundle: Bundle, imgName: string, callback: (sf: SpriteFrame | null) => void) {
            const candidates = this._getGameAssetsImageAssetCandidatePaths(imgName);
            const tryLoad = (index: number) => {
                if (index >= candidates.length) {
                    callback(null);
                    return;
                }
                bundle.load(candidates[index], ImageAsset, (err, imgAsset) => {
                    if (!err && imgAsset) {
                        const sf = this._createSpriteFrameFromImageAsset(imgName, imgAsset);
                        if (sf) {
                            callback(sf);
                            return;
                        }
                    }
                    tryLoad(index + 1);
                });
            };
            tryLoad(0);
        },

        _getSpriteFrameLoadConcurrencyLimit(): number {
            const runtimeScene = typeof this.getRuntimeSceneName === 'function'
                ? this.getRuntimeSceneName('Game')
                : '';
            if (
                runtimeScene === 'Game'
                && (
                    !!this._postPlayableWarmupRunningTaskName
                    || (Array.isArray(this._postPlayableWarmupQueue) && this._postPlayableWarmupQueue.length > 0)
                    || (this._spriteFrameApplyPending instanceof Map && this._spriteFrameApplyPending.size > 0)
                )
            ) {
                return POST_PLAYABLE_MAX_CONCURRENT_SPRITE_FRAME_LOADS;
            }
            if (this._panelOpenInFlight instanceof Set && this._panelOpenInFlight.size > 0) {
                return POST_PLAYABLE_MAX_CONCURRENT_SPRITE_FRAME_LOADS;
            }
            return MAX_CONCURRENT_SPRITE_FRAME_LOADS;
        },

        _enqueueSpriteFrameLoadTask(imgName: string, task: (done: () => void) => void) {
            if (
                this._spriteFrameLoadQueueCancelled ||
                typeof this._isRuntimeAliveForAsyncCallback !== 'function'
                || !this._isRuntimeAliveForAsyncCallback()
            ) {
                return;
            }
            if (!Array.isArray(this._spriteFrameLoadQueue)) {
                this._spriteFrameLoadQueue = [];
            }
            this._spriteFrameLoadQueue.push({ imgName, task });
            debugPerfSnapshot('spriteFrame.load.queue.push', this, {
                imgName,
                queueSize: this._spriteFrameLoadQueue.length,
                concurrencyLimit: this._getSpriteFrameLoadConcurrencyLimit(),
            });
            if (typeof this._drainSpriteFrameLoadQueue === 'function') {
                this._drainSpriteFrameLoadQueue();
            }
        },

        _drainSpriteFrameLoadQueue() {
            if (
                this._spriteFrameLoadQueueCancelled ||
                typeof this._isRuntimeAliveForAsyncCallback !== 'function'
                || !this._isRuntimeAliveForAsyncCallback()
            ) {
                this._spriteFrameLoadQueue = [];
                this._spriteFrameLoadInFlight = 0;
                return;
            }
            if (!Array.isArray(this._spriteFrameLoadQueue)) {
                this._spriteFrameLoadQueue = [];
            }
            const limit = this._getSpriteFrameLoadConcurrencyLimit();
            while (this._spriteFrameLoadInFlight < limit && this._spriteFrameLoadQueue.length > 0) {
                const entry = this._spriteFrameLoadQueue.shift();
                if (!entry || typeof entry.task !== 'function') continue;
                const taskImgName = String(entry.imgName || '');
                this._spriteFrameLoadInFlight = Math.max(0, Number(this._spriteFrameLoadInFlight) || 0) + 1;
                const startedAt = Date.now();
                debugPerfTrace('spriteFrame.load.start', {
                    imgName: taskImgName,
                    inFlight: this._spriteFrameLoadInFlight,
                    queueSize: this._spriteFrameLoadQueue.length,
                    concurrencyLimit: limit,
                });
                let finished = false;
                const done = () => {
                    if (finished) return;
                    finished = true;
                    this._spriteFrameLoadInFlight = Math.max(0, (Number(this._spriteFrameLoadInFlight) || 0) - 1);
                    debugPerfTrace('spriteFrame.load.finish', {
                        imgName: taskImgName,
                        durationMs: Date.now() - startedAt,
                        inFlight: this._spriteFrameLoadInFlight,
                        queueSize: Array.isArray(this._spriteFrameLoadQueue) ? this._spriteFrameLoadQueue.length : 0,
                        concurrencyLimit: limit,
                    });
                    if (
                        !this._spriteFrameLoadQueueCancelled &&
                        typeof this._isRuntimeAliveForAsyncCallback === 'function'
                        && this._isRuntimeAliveForAsyncCallback()
                        && typeof this._drainSpriteFrameLoadQueue === 'function'
                    ) {
                        this._drainSpriteFrameLoadQueue();
                    }
                };
                try {
                    entry.task(done);
                } catch (error) {
                    debugPerfTrace('spriteFrame.load.error', {
                        imgName: taskImgName,
                        error,
                    });
                    done();
                }
            }
        },

        _loadSpriteFrameByName(imgName: string, callback: (sf: SpriteFrame | null) => void) {
            if (
                this._spriteFrameLoadQueueCancelled ||
                typeof this._isRuntimeAliveForAsyncCallback !== 'function'
                || !this._isRuntimeAliveForAsyncCallback()
            ) {
                return;
            }
            const cached = this.getSF(imgName);
            if (cached) {
                debugPerfTrace('spriteFrame.load.cache.hit', { imgName });
                const runCachedCallback = () => {
                    if (
                        this._spriteFrameLoadQueueCancelled
                        || typeof this._isRuntimeAliveForAsyncCallback !== 'function'
                        || !this._isRuntimeAliveForAsyncCallback()
                    ) {
                        return;
                    }
                    callback(cached);
                };
                if (typeof this.scheduleOnce === 'function') {
                    this.scheduleOnce(runCachedCallback, 0);
                } else {
                    setTimeout(runCachedCallback, 0);
                }
                return;
            }
            const waiters = this._pendingSpriteFrameLoads.get(imgName);
            if (waiters) {
                waiters.push(callback);
                return;
            }
            this._pendingSpriteFrameLoads.set(imgName, [callback]);
            const startedAt = Date.now();
            const resolve = (sf: SpriteFrame | null) => {
                if (sf) {
                    this._cacheSpriteFrame(sf, imgName);
                }
                const callbacks = this._pendingSpriteFrameLoads.get(imgName) || [];
                this._pendingSpriteFrameLoads.delete(imgName);
                debugPerfTrace('spriteFrame.load.resolve', {
                    imgName,
                    success: !!sf,
                    durationMs: Date.now() - startedAt,
                    waiterCount: callbacks.length,
                });
                for (const done of callbacks) {
                    done(sf);
                }
            };
            this._enqueueSpriteFrameLoadTask(imgName, (done) => {
                const finish = (sf: SpriteFrame | null) => {
                    try {
                        if (
                            this._spriteFrameLoadQueueCancelled ||
                            typeof this._isRuntimeAliveForAsyncCallback !== 'function'
                            || !this._isRuntimeAliveForAsyncCallback()
                        ) {
                            if (this._pendingSpriteFrameLoads instanceof Map) {
                                this._pendingSpriteFrameLoads.delete(imgName);
                            }
                            debugPerfTrace('spriteFrame.load.resolve.skip', {
                                imgName,
                                reason: this._spriteFrameLoadQueueCancelled ? 'queue-cancelled' : 'runtime-destroyed',
                                durationMs: Date.now() - startedAt,
                            });
                            return;
                        }
                        resolve(sf);
                    } finally {
                        done();
                    }
                };
                if (!this._isRuntimeAliveForAsyncCallback()) {
                    finish(null);
                    return;
                }
                if (this.shouldUseLocalBootstrapTexture(imgName)) {
                    this._loadSpriteFrameFromBootstrapThenRemote(imgName, finish);
                    return;
                }
                this._loadSpriteFrameFromGameAssetsBundle(imgName, finish);
            });
        },

        _ensureSpriteFramesByName(names: string[], callback: (error?: Error) => void) {
            if (!this._isRuntimeAliveForAsyncCallback()) {
                callback(new Error('[assets] runtime invalid before SpriteFrame ensure'));
                return;
            }
            const uniqueNames = Array.from(new Set(names));
            const missingNames = uniqueNames.filter((name) => !this.getSF(name));
            if (missingNames.length === 0) {
                callback();
                return;
            }
            let remaining = missingNames.length;
            const finishOne = () => {
                if (!this._isRuntimeAliveForAsyncCallback()) return;
                remaining -= 1;
                if (remaining > 0) return;
                const stillMissing = uniqueNames.filter((name) => !this.getSF(name));
                if (stillMissing.length > 0) {
                    callback(new Error(`[assets] missing required SpriteFrames: ${stillMissing.join(', ')}`));
                    return;
                }
                callback();
            };
            for (const name of missingNames) {
                try {
                    this._loadSpriteFrameByName(name, () => {
                        finishOne();
                    });
                } catch (error) {
                    callback(error instanceof Error ? error : new Error(String(error)));
                    return;
                }
            }
        },

        scheduleHomeSharedUiTextureWarmup() {
            if (!this._isRuntimeAliveForAsyncCallback()) return;
            if (typeof this.getRuntimeSceneName === 'function' && this.getRuntimeSceneName('Game') !== 'Home') {
                return;
            }
            if (this._homeSharedUiWarmupState === 'scheduled' || this._homeSharedUiWarmupState === 'loading' || this._homeSharedUiWarmupState === 'ready') {
                return;
            }
            const names = Array.from(new Set([
                ...SETTINGS_PANEL_TEXTURE_NAMES,
                ...LEADERBOARD_TEXTURE_NAMES,
                ...RESOURCE_ACQUIRE_TEXTURE_NAMES,
            ]));
            const initialMissingNames = names.filter((name) => !this.getSF(name));
            if (initialMissingNames.length === 0) {
                this._homeSharedUiWarmupState = 'ready';
                return;
            }
            const token = Date.now();
            const batchSize = 4;
            const batchIntervalSeconds = 0.35;
            let cursor = 0;
            this._homeSharedUiWarmupToken = token;
            this._homeSharedUiWarmupState = 'scheduled';
            debugPerfSnapshot('home.sharedUiWarmup.scheduled', this, {
                requestedNames: names.length,
                missingNames: initialMissingNames.length,
                batchSize,
                batchIntervalSeconds,
            });

            const runNextBatch = () => {
                if (!this._isRuntimeAliveForAsyncCallback() || this._homeSharedUiWarmupToken !== token) {
                    return;
                }
                if (typeof this.getRuntimeSceneName === 'function' && this.getRuntimeSceneName('Game') !== 'Home') {
                    this._homeSharedUiWarmupState = 'aborted';
                    debugPerfTrace('home.sharedUiWarmup.abort.sceneChanged', {
                        token,
                    });
                    return;
                }
                const batch: string[] = [];
                while (cursor < names.length && batch.length < batchSize) {
                    const name = names[cursor++];
                    if (!this.getSF(name)) {
                        batch.push(name);
                    }
                }
                if (batch.length === 0) {
                    if (cursor >= names.length) {
                        this._homeSharedUiWarmupState = 'ready';
                        debugPerfSnapshot('home.sharedUiWarmup.ready', this, {
                            requestedNames: names.length,
                        });
                        return;
                    }
                    this.scheduleOnce(runNextBatch, 0.05);
                    return;
                }

                let pending = batch.length;
                this._homeSharedUiWarmupState = 'loading';
                debugPerfSnapshot('home.sharedUiWarmup.batch.start', this, {
                    batchNames: batch,
                    remainingNames: Math.max(0, names.length - cursor),
                    batchSize,
                });
                const oneDone = () => {
                    pending -= 1;
                    if (pending > 0) return;
                    debugPerfSnapshot('home.sharedUiWarmup.batch.done', this, {
                        batchNames: batch,
                        remainingNames: Math.max(0, names.length - cursor),
                    });
                    this.scheduleOnce(runNextBatch, batchIntervalSeconds);
                };
                for (const name of batch) {
                    this._loadSpriteFrameByName(name, oneDone);
                }
            };

            this.scheduleOnce(runNextBatch, 1.2);
        },

        _openPanelAfterTextures(
            panelKey: string,
            textureNames: string[],
            isAlreadyOpen: () => boolean,
            open: () => void,
            onError?: (error: Error) => void,
        ): boolean {
            if (!this._isRuntimeAliveForAsyncCallback()) {
                onError?.(new Error(`[panel-texture] runtime invalid before loading ${panelKey}`));
                return false;
            }
            if (isAlreadyOpen() || this._panelOpenInFlight.has(panelKey)) return false;
            this._panelOpenInFlight.add(panelKey);
            const uniqueNames = Array.from(new Set(textureNames));
            const missingNames = uniqueNames.filter((name) => !this.getSF(name));
            let settled = false;
            let timeout: any = null;
            const finish = (error?: Error) => {
                if (settled) return;
                settled = true;
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                this._panelOpenInFlight.delete(panelKey);
                if (error) {
                    debugPerfSnapshot('panel.texture.ensure.failed', this, {
                        panelKey,
                        requestedNames: uniqueNames.length,
                        missingNames: uniqueNames.filter((name) => !this.getSF(name)).length,
                        error: error.message,
                    });
                    console.error(`[panel-texture] ${panelKey} failed:`, error);
                    onError?.(error);
                    return;
                }
                if (!this._isRuntimeAliveForAsyncCallback()) {
                    onError?.(new Error(`[panel-texture] runtime invalid after loading ${panelKey}`));
                    return;
                }
                if (isAlreadyOpen()) {
                    onError?.(new Error(`[panel-texture] ${panelKey} open superseded`));
                    return;
                }
                debugPerfSnapshot('panel.texture.ensure.ready', this, {
                    panelKey,
                    requestedNames: uniqueNames.length,
                    missingNames: uniqueNames.filter((name) => !this.getSF(name)).length,
                });
                try {
                    open();
                } catch (openError) {
                    const normalized = openError instanceof Error ? openError : new Error(String(openError));
                    console.error(`[panel-texture] ${panelKey} open failed:`, normalized);
                    onError?.(normalized);
                }
            };
            debugPerfSnapshot('panel.texture.ensure.start', this, {
                panelKey,
                requestedNames: uniqueNames.length,
                missingNames: missingNames.length,
                missingNameSample: missingNames.slice(0, 8),
            });
            timeout = setTimeout(() => {
                finish(new Error(`[panel-texture] ${panelKey} timed out after ${PANEL_TEXTURE_ENSURE_TIMEOUT_MS}ms`));
            }, PANEL_TEXTURE_ENSURE_TIMEOUT_MS);
            this._ensureSpriteFramesByName(textureNames, finish);
            return true;
        },

        _getRendererSpriteFrameForRuntimeScan(renderer: any): SpriteFrame | null {
            if (!renderer?.isValid) return null;
            const candidates = [
                (() => {
                    try { return renderer.textureFrame; } catch (_) { return null; }
                })(),
                renderer._textureFrame,
                renderer.spriteFrame,
            ];
            for (const candidate of candidates) {
                if (!candidate) continue;
                if (candidate instanceof SpriteFrame || typeof candidate.getHash === 'function' || Array.isArray(candidate.uv)) {
                    return candidate as SpriteFrame;
                }
            }
            return null;
        },

        _collectRenderFrameOwnersForRuntimeScan(root: any, context: string): { sprites: Sprite[]; renderers: RuntimeRendererSpriteFrameOwner[]; failed: boolean } {
            const sprites: Sprite[] = [];
            const renderers: RuntimeRendererSpriteFrameOwner[] = [];
            let failed = false;
            if (!root?.isValid) return { sprites, renderers, failed };

            const stack: any[] = [root];
            let guard = 0;
            while (stack.length > 0 && guard < 5000) {
                guard += 1;
                const scanRoot = stack.pop();
                if (!scanRoot?.isValid) continue;
                try {
                    if (typeof scanRoot.getComponent === 'function') {
                        const sprite = scanRoot.getComponent(Sprite);
                        if (sprite?.isValid) {
                            sprites.push(sprite);
                        }
                        if (typeof scanRoot.getComponents === 'function') {
                            const uiRenderers = scanRoot.getComponents(UIRenderer) || [];
                            for (const renderer of uiRenderers) {
                                if (!renderer?.isValid || renderer === sprite) continue;
                                const spriteFrame = this._getRendererSpriteFrameForRuntimeScan(renderer);
                                if (!spriteFrame) continue;
                                renderers.push({
                                    renderer,
                                    spriteFrame,
                                    kind: String(renderer.constructor?.name || renderer.name || 'UIRenderer'),
                                });
                            }
                        }
                    }
                    const children = Array.isArray(scanRoot.children)
                        ? scanRoot.children
                        : Array.isArray(scanRoot._children)
                            ? scanRoot._children
                            : [];
                    for (let i = children.length - 1; i >= 0; i -= 1) {
                        const child = children[i];
                        if (child?.isValid) {
                            stack.push(child);
                        }
                    }
                } catch (error) {
                    failed = true;
                    debugPerfTrace('render.spriteFrame.scan.skip', {
                        context,
                        nodeName: scanRoot?.name || '',
                        message: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            if (guard >= 5000) {
                failed = true;
                debugPerfTrace('render.spriteFrame.scan.limit', { context, limit: 5000 });
            }
            return { sprites, renderers, failed };
        },

        _findSpriteFrameRenderOwnersForDiagnostics(target: SpriteFrame | null): Record<string, unknown>[] {
            if (!target) return [];
            const scene = this.node?.scene;
            if (!scene?.isValid) return [];
            const scan = this._collectRenderFrameOwnersForRuntimeScan(scene, `getHash-owner:${target.name || 'unnamed'}`);
            const owners: Record<string, unknown>[] = [];
            for (const sprite of scan.sprites) {
                if (!sprite?.isValid || sprite.spriteFrame !== target) continue;
                owners.push({
                    ownerType: 'Sprite',
                    nodePath: this._getNodePathForDiagnostics(sprite.node || null),
                    nodeActive: !!sprite.node?.active,
                    nodeActiveInHierarchy: !!(sprite.node as any)?.activeInHierarchy,
                    enabled: sprite.enabled !== false,
                });
                if (owners.length >= RENDER_RESOURCE_DIAGNOSTIC_SAMPLE_LIMIT) return owners;
            }
            for (const owner of scan.renderers) {
                if (!owner.renderer?.isValid || owner.spriteFrame !== target) continue;
                owners.push({
                    ownerType: owner.kind || 'UIRenderer',
                    nodePath: this._getNodePathForDiagnostics(owner.renderer.node || null),
                    nodeActive: !!owner.renderer.node?.active,
                    nodeActiveInHierarchy: !!(owner.renderer.node as any)?.activeInHierarchy,
                    enabled: owner.renderer.enabled !== false,
                });
                if (owners.length >= RENDER_RESOURCE_DIAGNOSTIC_SAMPLE_LIMIT) return owners;
            }
            return owners;
        },

        _collectSpriteComponentsForRuntimeScan(root: any, context: string): { sprites: Sprite[]; failed: boolean } {
            const scan = this._collectRenderFrameOwnersForRuntimeScan(root, context);
            return { sprites: scan.sprites, failed: scan.failed };
        },

        _isSpriteFrameStillInUse(target: SpriteFrame | null): boolean {
            if (!target?.isValid) return false;
            const scene = this.node?.scene;
            if (!scene?.isValid) return false;
            const scan = this._collectRenderFrameOwnersForRuntimeScan(scene, `usage-check:${target.name || 'unknown'}`);
            if (scan.failed) return true;
            for (const sprite of scan.sprites) {
                if (sprite?.isValid && sprite.spriteFrame === target) {
                    return true;
                }
            }
            for (const owner of scan.renderers) {
                if (owner.renderer?.isValid && owner.spriteFrame === target) {
                    return true;
                }
            }
            return false;
        },

        _releaseDynamicSpriteFrame(
            name: string,
            sf: SpriteFrame,
            meta: { imageAsset?: ImageAsset | null; texture?: Texture2D | null } | null,
            reason: string,
        ) {
            const ownedTexture = meta?.texture as Texture2D | null;
            const sourceImageAsset = meta?.imageAsset as ImageAsset | null;
            this._traceSpriteFrameResource?.('spriteFrame.dynamic.release.before', name, sf, meta, {
                reason,
                hasOwnedTexture: !!ownedTexture,
                hasSourceImageAsset: !!sourceImageAsset,
            });
            this._releaseSpriteFrameCacheResource?.(name, sf, meta, reason);
            try {
                if (sf.isValid) {
                    sf.texture = null;
                    sf.destroy();
                }
            } catch (error) {
                console.warn(`[Memory] destroy dynamic SpriteFrame failed: ${name} (${reason})`, error);
            }
            try {
                if (ownedTexture?.isValid) {
                    ownedTexture.destroy();
                }
            } catch (error) {
                console.warn(`[Memory] destroy Texture2D failed: ${name} (${reason})`, error);
            }
            this._traceSpriteFrameResource?.('spriteFrame.dynamic.release.after', name, sf, meta, {
                reason,
                hasOwnedTexture: !!ownedTexture,
                hasSourceImageAsset: !!sourceImageAsset,
            });
        },

        _releaseBootstrapBeanAtlas(reason: string, options: { force?: boolean } = {}): boolean {
            const atlasEntries = Array.from(this._bootstrapAtlasFrameCache.entries()) as Array<[string, SpriteFrame]>;
            const sharedTexture = this._bootstrapBeanAtlasTexture as Texture2D | null;
            const sourceImageAsset = this._bootstrapBeanAtlasImageAsset as ImageAsset | null;
            if (isDebugPerfTraceEnabled()) {
                debugPerfSnapshot('spriteFrame.bootstrapAtlas.release.before', this, {
                    reason,
                    force: !!options.force,
                    frameCount: atlasEntries.length,
                    textureValid: !!sharedTexture?.isValid,
                    imageAssetValid: !!sourceImageAsset?.isValid,
                    sampleFrames: atlasEntries.slice(0, RENDER_RESOURCE_DIAGNOSTIC_SAMPLE_LIMIT)
                        .map(([name, sf]) => this._describeSpriteFrameForDiagnostics(name, sf, this._spriteFrameCacheMeta.get(name) || null)),
                });
            }
            if (atlasEntries.length === 0 && !sharedTexture && !sourceImageAsset) {
                this._bootstrapBeanAtlasReady = false;
                this._bootstrapBeanAtlasTextureReleaseMode = 'asset';
                return false;
            }
            for (const [, sf] of atlasEntries) {
                if (!options.force && this._isSpriteFrameStillInUse(sf)) {
                    return false;
                }
            }
            for (const [name, sf] of atlasEntries) {
                const meta = this._spriteFrameCacheMeta.get(name) || null;
                this._releaseSpriteFrameCacheResource?.(name, sf, meta, reason);
                this.sfCache.delete(name);
                this._spriteFrameCacheMeta.delete(name);
                try {
                    if (sf?.isValid) {
                        sf.texture = null;
                        sf.destroy();
                    }
                } catch (error) {
                    console.warn(`[Memory] destroy bootstrap bean SpriteFrame failed: ${name} (${reason})`, error);
                }
            }
            this._bootstrapAtlasFrameCache.clear();
            this._bootstrapBeanAtlasReady = false;
            this._bootstrapBeanAtlasTexture = null;
            this._bootstrapBeanAtlasImageAsset = null;
            const releaseMode = this._bootstrapBeanAtlasTextureReleaseMode === 'dynamic' ? 'dynamic' : 'asset';
            this._bootstrapBeanAtlasTextureReleaseMode = 'asset';
            try {
                if (releaseMode === 'dynamic') {
                    if (sourceImageAsset?.isValid) {
                        assetManager.releaseAsset(sourceImageAsset);
                    }
                    if (sharedTexture?.isValid) {
                        sharedTexture.destroy();
                    }
                } else if (sharedTexture?.isValid) {
                    assetManager.releaseAsset(sharedTexture);
                }
            } catch (error) {
                console.warn(`[Memory] release bootstrap bean atlas texture failed (${reason})`, error);
            }
            if (atlasEntries.length > 0) {
                runtimeLog(`[Memory] released bootstrap bean atlas frames: ${atlasEntries.length} (${reason})`);
            }
            if (isDebugPerfTraceEnabled()) {
                debugPerfSnapshot('spriteFrame.bootstrapAtlas.release.after', this, {
                    reason,
                    frameCount: atlasEntries.length,
                    releasedTextureMode: releaseMode,
                });
            }
            return atlasEntries.length > 0 || !!sharedTexture || !!sourceImageAsset;
        },

        _releaseManagedSpriteFrame(name: string, sf: SpriteFrame, reason: string, meta?: any) {
            meta = meta || this._spriteFrameCacheMeta.get(name) || null;
            this._traceSpriteFrameResource?.('spriteFrame.asset.release.before', name, sf, meta, {
                reason,
            });
            this._releaseSpriteFrameCacheResource?.(name, sf, meta, reason);
            this._traceSpriteFrameResource?.('spriteFrame.asset.release.after', name, sf, meta, {
                reason,
            });
        },

        _releaseSpriteFrameCacheEntry(name: string, reason: string, options: { force?: boolean; ignoreOwners?: boolean; ignoreUsage?: boolean; ignoreScope?: boolean } = {}): boolean {
            const sf = this.sfCache.get(name);
            if (!sf) return false;
            const meta = this._spriteFrameCacheMeta.get(name) || null;
            if (isDebugPerfTraceEnabled()) {
                this._traceSpriteFrameResource?.('spriteFrame.cache.release.request', name, sf, meta, {
                    reason,
                    options,
                    stillInUse: this._isSpriteFrameStillInUse(sf),
                });
            }
            if (!options.force && !options.ignoreOwners && Number(meta?.retainCount) > 0) {
                return false;
            }
            const scope = String(meta?.scope || this._inferSpriteFrameScope(name));
            if (!options.force && !options.ignoreScope && !this._canAutoReleaseSpriteFrameScope(scope, reason)) {
                return false;
            }
            if (!options.force && !options.ignoreUsage && this._isSpriteFrameStillInUse(sf)) {
                return false;
            }
            this.sfCache.delete(name);
            this._spriteFrameCacheMeta.delete(name);
            if (meta?.releaseMode === 'dynamic') {
                this._releaseDynamicSpriteFrame(name, sf, meta, reason);
            } else {
                this._releaseManagedSpriteFrame(name, sf, reason, meta);
            }
            this.scanRenderSpriteFrameHealth?.(`after-release:${name}:${reason}`);
            return true;
        },

        _releaseCachedSpriteFrames(names: string[], reason: string, options: { force?: boolean; ignoreOwners?: boolean; ignoreUsage?: boolean; ignoreScope?: boolean } = {}) {
            const uniqueNames = Array.from(new Set(names));
            let evicted = 0;
            for (const name of uniqueNames) {
                if (this._releaseSpriteFrameCacheEntry(name, reason, options)) {
                    evicted += 1;
                }
            }
            if (evicted > 0) {
                runtimeLog(`[Memory] released ${evicted} panel SpriteFrames: ${reason}`);
            }
        },

        _scheduleRouteSafeCleanup(callback: () => void, delaySeconds: number = 0, requireRuntimeValid: boolean = false) {
            const run = () => {
                if (requireRuntimeValid && !this.node?.isValid) return;
                callback();
            };
            const setTimer = (globalThis as any).setTimeout;
            if (typeof setTimer === 'function') {
                setTimer(run, Math.max(0, Math.round(delaySeconds * 1000)));
                return;
            }
            this.scheduleOnce(run, delaySeconds);
        },

        _releasePanelTexturesNextFrame(names: string[], reason: string) {
            this._scheduleRouteSafeCleanup(() => this._releaseCachedSpriteFrames(names, reason), 0.05, true);
        },

        _clearSpriteFramesBeforeDestroy(root: Node) {
            if (!root?.isValid) return;
            this.scanRenderSpriteFrameHealth?.(`before-clear-node:${root.name || 'unknown'}`, root);
            releasePixelPosterPreviewTree(root);
            root.active = false;
            const scan = this._collectRenderFrameOwnersForRuntimeScan(root, `panel-destroy:${root.name || 'unknown'}`);
            for (const sp of scan.sprites) {
                if (!sp?.isValid) continue;
                sp.enabled = false;
                sp.spriteFrame = null;
            }
            for (const owner of scan.renderers) {
                const renderer = owner.renderer;
                if (!renderer?.isValid) continue;
                renderer.enabled = false;
                if (typeof renderer.clear === 'function') {
                    renderer.clear();
                } else if ('_textureFrame' in renderer) {
                    renderer._textureFrame = null;
                    renderer.markForUpdateRenderData?.();
                }
            }
            if (root.parent?.isValid) {
                root.removeFromParent();
            }
            this.scanRenderSpriteFrameHealth?.(`after-clear-node:${root.name || 'unknown'}`, root, { always: true });
        },

        _destroyDetachedNodeNextFrame(node: Node) {
            if (!node?.isValid) return;
            // Let Cocos flush disabled UIRenderers before destroying detached panel nodes.
            this._scheduleRouteSafeCleanup(() => {
                if (node?.isValid) {
                    node.destroy();
                }
            }, 0.05);
        },

        _destroyPanelAndReleaseTextures(panel: Node, names: string[], reason: string) {
            if (!panel?.isValid) return;
            this._clearSpriteFramesBeforeDestroy(panel);
            this._destroyDetachedNodeNextFrame(panel);
        },

        _closePanelWithTextureOwner(panel: Node | null, panelKey: string, reason: string) {
            if (panel?.isValid) {
                this._clearSpriteFramesBeforeDestroy(panel);
                this._destroyDetachedNodeNextFrame(panel);
            }
            this._scheduleRouteSafeCleanup(() => this._releasePanelTextureOwner(panelKey, reason), 0.05, true);
        },

        releaseSceneScopedSpriteFrames(sceneName: string, reason: string = 'scene-destroy') {
            const scopes = new Set<string>([SPRITE_FRAME_SCOPE_DYNAMIC]);
            if (reason.includes('runtime-destroy')) {
                scopes.add(SPRITE_FRAME_SCOPE_SHARED_UI);
            }
            if (sceneName === 'Home') {
                scopes.add(SPRITE_FRAME_SCOPE_SCENE_HOME);
            }
            if (sceneName === 'Game' || sceneName === 'Boot') {
                scopes.add(SPRITE_FRAME_SCOPE_SCENE_GAME);
                if (reason.includes('runtime-destroy')) {
                    scopes.add(SPRITE_FRAME_SCOPE_STARTUP_BOOTSTRAP);
                }
            }
            const names = Array.from(this._spriteFrameCacheMeta.entries())
                .filter(([, meta]) => scopes.has(String(meta?.scope || '')))
                .map(([name]) => name);
            debugPerfSnapshot('spriteFrame.sceneScope.release.before', this, {
                sceneName,
                reason,
                scopes: Array.from(scopes),
                candidateNames: names.length,
            });
            this.scanRenderSpriteFrameHealth?.(`before-scene-scope-release:${sceneName}:${reason}`);
            if (names.length > 0) {
                this._releaseCachedSpriteFrames(names, `${reason}:${sceneName}`, {
                    force: true,
                    ignoreOwners: true,
                    ignoreUsage: true,
                    ignoreScope: true,
                });
            }
            if ((sceneName === 'Game' || sceneName === 'Boot') && reason.includes('runtime-destroy')) {
                this._releaseBootstrapBeanAtlas(`${reason}:${sceneName}`, { force: true });
            }
            debugPerfSnapshot('spriteFrame.sceneScope.release.after', this, {
                sceneName,
                reason,
            });
            this.scanRenderSpriteFrameHealth?.(`after-scene-scope-release:${sceneName}:${reason}`, null, { always: true });
        },

        /** 检查豆豆 SpriteFrame 是否已加载 */
        needsBeanReRender(): boolean {
            return this.needsBeanFramesForLevelData(this.levelData);
        },

        normalizeBeanColorId(colorId: number): number | null {
            if (!Number.isFinite(colorId)) return null;
            const normalized = Math.floor(colorId);
            return normalized > 0 ? normalized : null;
        },

        getPinddColorKey(colorId: number): string | null {
            const safeColorId = this.normalizeBeanColorId(colorId);
            if (safeColorId === null) return null;
            const normalized = ((safeColorId - 1) % 21) + 1;
            const n = normalized < 10 ? `00${normalized}` : normalized < 100 ? `0${normalized}` : `${normalized}`;
            return `b${n}`;
        },

        getPinddBeanFrame(colorId: number, variant: 1 | 2 | 4): SpriteFrame | null {
            const key = this.getPinddColorKey(colorId);
            if (!key) return null;
            const cacheKey = `${key}_${variant}`;
            const cached = this.getSF(cacheKey) || null;
            if (cached) return cached;
            const atlasFrame = this._bootstrapAtlasFrameCache.get(cacheKey) || null;
            if (atlasFrame) return atlasFrame;
            console.error('[bean] required bean SpriteFrame missing:', cacheKey);
            return null;
        },

        getBoardSlotVisualSize(): number {
            return this.cellSize;
        },

        getBoardBeanVisualSize(): number {
            const slotSize = this.getBoardSlotVisualSize();
            const targetSize = Math.max(6, Math.round(slotSize * PINDD_BEAN_TO_SLOT_RATIO));
            // 大图案会把 cell 压得很小；这里必须保证豆豆永远不大于格子，避免彼此重叠。
            const maxSafeSize = slotSize <= 10 ? Math.max(4, slotSize - 1) : slotSize;
            return Math.max(4, Math.min(targetSize, maxSafeSize));
        },

        getMaxSlotRows(): number {
            return this.shouldUseMainlineSlotUI() ? MAINLINE_MAX_SLOT_ROWS : DEFAULT_MAX_SLOT_ROWS;
        },

        getSlotRowSpacing(): number {
            if (this.shouldUseMainlineSlotUI()) {
                const sceneRowSpacing = Number(this._slotAreaSceneRowSpacing);
                return Number.isFinite(sceneRowSpacing) && sceneRowSpacing > 0 ? sceneRowSpacing : MAINLINE_SLOT_ROW_SPACING;
            }
            return SLOT_ROW_SPACING;
        },

        getSlotRowBgHeight(): number {
            return this.shouldUseMainlineSlotUI() ? MAINLINE_SLOT_ROW_BG_HEIGHT : SLOT_ROW_BG_HEIGHT;
        },

        getSlotCenterSpacing(): number {
            return this.shouldUseMainlineSlotUI() ? MAINLINE_SLOT_CENTER_SPACING : (SLOT_SIZE + SLOT_GAP);
        },

        getSlotBeanVisualSize(): number {
            return this.shouldUseMainlineSlotUI() ? 38 : SLOT_SIZE;
        },

        getSlotAreaScale(): number {
            return this.shouldUseMainlineSlotUI() ? 0.9 : SLOT_AREA_SCALE;
        },

        getSlotAreaVisualHeight(): number {
            const slotController = this._gameplaySlotUiController;
            if (slotController?.getSlotAreaVisualHeight) {
                return slotController.getSlotAreaVisualHeight();
            }
            const panelHeight = (this.slotRowCount - 1) * this.getSlotRowSpacing() + this.getSlotRowBgHeight();
            const panelExtraHeight = this.shouldUseMainlineSlotUI() ? MAINLINE_SLOT_PANEL_EXTRA_HEIGHT : 14;
            return (panelHeight + panelExtraHeight) * this.getSlotAreaScale();
        },

        getSkillAreaTopY(): number {
            return ensureGameplaySkillUiController(this).getSkillAreaTopY();
        },

        getSlotRowY(rowIndex: number, rowCount: number = this.slotRowCount): number {
            const rowSpacing = this.getSlotRowSpacing();
            return (rowCount - 1) / 2 * rowSpacing - rowIndex * rowSpacing;
        },

        getSlotLocalPosition(index: number, rowCount: number = this.slotRowCount): Vec3 {
            const slotController = this._gameplaySlotUiController;
            if (slotController?.getSlotLocalPosition) {
                return slotController.getSlotLocalPosition(index, rowCount);
            }
            const row = Math.floor(index / SLOTS_PER_ROW);
            const col = index % SLOTS_PER_ROW;
            const x = (col - SLOTS_PER_ROW / 2 + 0.5) * this.getSlotCenterSpacing();
            return new Vec3(x, this.getSlotRowY(row, rowCount), 0);
        },

        setNodeSquareSize(node: Node, size: number) {
            node.getComponent(UITransform)?.setContentSize(size, size);
        },

        /** 通过颜色 ID 获取豆豆精灵图（pindd 可移动态） */
        getBeanSpriteFrame(colorId: number, locked: boolean): SpriteFrame | null {
            return this.getPinddBeanFrame(colorId, locked ? 1 : 2);
        },

        /** 通过颜色 ID 获取棋盘底槽精灵图 */
        getSlotSpriteFrame(colorId: number): SpriteFrame | null {
            return this.getPinddBeanFrame(colorId, 4);
        },

        getBrightSpriteFrame(): SpriteFrame | null {
            return this.getSF('block_bright_pindd');
        },

        requireBrightSpriteFrame(): SpriteFrame {
            const bright = this.getBrightSpriteFrame();
            if (!bright) throw new Error('[assets] missing required SpriteFrame: block_bright_pindd');
            return bright;
        },

        getSphereFlyStarSpriteFrame(): SpriteFrame | null {
            return this.getSF('pdpx_eff_Star_01');
        },

        requireSphereFlyStarSpriteFrame(): SpriteFrame {
            const star = this.getSphereFlyStarSpriteFrame();
            if (!star) throw new Error('[assets] missing required SpriteFrame: pdpx_eff_Star_01');
            return star;
        },

        getSphereFlyTrailSpriteFrame(): SpriteFrame | null {
            return this.getSF('pdpx_eff_Trail_02');
        },

        requireSphereFlyTrailSpriteFrame(): SpriteFrame {
            const trail = this.getSphereFlyTrailSpriteFrame();
            if (!trail) throw new Error('[assets] missing required SpriteFrame: pdpx_eff_Trail_02');
            return trail;
        },

        getWarningMaskSpriteFrame(): SpriteFrame | null {
            return this.getSF('pdpx_eff_Mask_01');
        },

        requireWarningMaskSpriteFrame(): SpriteFrame {
            const mask = this.getWarningMaskSpriteFrame();
            if (!mask) throw new Error('[assets] missing required SpriteFrame: pdpx_eff_Mask_01');
            return mask;
        },

        shouldUseLocalBootstrapBundle(levelId: number, prefix: string = LOCAL_BOOTSTRAP_LEVEL_PREFIX): boolean {
            return LOCAL_BOOTSTRAP_LEVEL_IDS.has(levelId) && prefix === LOCAL_BOOTSTRAP_LEVEL_PREFIX;
        },

        shouldUseLocalBootstrapTexture(imgName: string, levelId: number = this.levelData?.levelId || 0): boolean {
            if (LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES.has(imgName)) {
                return true;
            }
            return this.shouldUseLocalBootstrapBundle(levelId) && LOCAL_BOOTSTRAP_TEXTURE_NAMES.has(imgName);
        },

        attachBrightOverlay(parent: Node, size: number, opacity: number, scale: number = 1.08): Node {
            const bright = this.requireBrightSpriteFrame();
        
            const glow = new Node('BrightOverlay');
            parent.addChild(glow);
            glow.addComponent(UITransform).setContentSize(size, size);
            glow.layer = Layers.Enum.UI_2D;
            glow.setPosition(0, 0, 0);
            glow.setScale(scale, scale, 1);
        
            const sp = glow.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = bright;
        
            const uo = glow.addComponent(UIOpacity);
            uo.opacity = opacity;
            return glow;
        },

        acquireFlyBeanNode(name: string, size: number, spriteFrame: SpriteFrame | null): Node {
            PerformanceMgr.inst.markUserActivity();
            const bean = this._flyBeanPool.get() ?? new Node('PooledFlyBean');
            const activeFlyBeans: Set<Node> = this._activeFlyBeanNodes
                || (this._activeFlyBeanNodes = new Set<Node>());
            activeFlyBeans.add(bean);
            bean.name = name;
            bean.layer = Layers.Enum.UI_2D;
            let transform = bean.getComponent(UITransform);
            if (!transform) transform = bean.addComponent(UITransform);
            transform.setContentSize(size, size);
        
            let sprite = bean.getComponent(Sprite);
            if (!sprite) sprite = bean.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = spriteFrame
                ? this.requireRenderReadySpriteFrame(spriteFrame, `${name}:fly-bean`)
                : null;
            sprite.enabled = true;
        
            const glowSize = size + Math.max(10, Math.round(size * 0.18));
            const bright = this.requireBrightSpriteFrame();
            let glow = bean.getChildByName('BrightOverlay');
            if (!glow) {
                glow = this.attachBrightOverlay(bean, glowSize, 150, 1.04);
            } else {
                glow.layer = Layers.Enum.UI_2D;
                glow.getComponent(UITransform)?.setContentSize(glowSize, glowSize);
                glow.setPosition(0, 0, 0);
                glow.setScale(1.04, 1.04, 1);
                const glowOpacity = glow.getComponent(UIOpacity);
                if (glowOpacity) glowOpacity.opacity = 150;
                const glowSprite = glow.getComponent(Sprite);
                if (glowSprite) {
                    glowSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    glowSprite.spriteFrame = bright;
                } else {
                    throw new Error('[assets] BrightOverlay is missing Sprite');
                }
            }
            if (glow) {
                glow.active = true;
                glow.setSiblingIndex(0);
            }
        
            bean.active = true;
            bean.setScale(1, 1, 1);
            return bean;
        },

        recycleFlyBeanNode(bean: Node) {
            this._activeFlyBeanNodes?.delete?.(bean);
            Tween.stopAllByTarget(bean);
            const sprite = bean.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = null;
            bean.active = false;
            if (this.getNodePoolSize(this._flyBeanPool) >= MAX_FLY_BEAN_POOL_SIZE) {
                bean.destroy();
                return;
            }
            this._flyBeanPool.put(bean);
        },

        clearActiveFlyBeanNodes(reason: string = 'clear'): void {
            const activeFlyBeans: Set<Node> = this._activeFlyBeanNodes
                || (this._activeFlyBeanNodes = new Set<Node>());
            if (activeFlyBeans.size > 0) {
                console.warn(`[fly-bean] recycling ${activeFlyBeans.size} active nodes: ${reason}`);
            }
            for (const bean of Array.from(activeFlyBeans)) {
                activeFlyBeans.delete(bean);
                if (bean?.isValid) {
                    this.recycleFlyBeanNode(bean);
                }
            }
        },

        acquireEffectNode(pool: NodePool, name: string, size: number): { node: Node; sprite: Sprite; opacity: UIOpacity } {
            const fx = pool.get() ?? new Node('PooledEffect');
            fx.name = name;
            fx.layer = Layers.Enum.UI_2D;
            let transform = fx.getComponent(UITransform);
            if (!transform) transform = fx.addComponent(UITransform);
            transform.setContentSize(size, size);
        
            let sprite = fx.getComponent(Sprite);
            if (!sprite) sprite = fx.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = null;
            sprite.enabled = true;
        
            let opacity = fx.getComponent(UIOpacity);
            if (!opacity) opacity = fx.addComponent(UIOpacity);
            opacity.opacity = 255;
        
            fx.active = true;
            fx.angle = 0;
            fx.setScale(1, 1, 1);
            return { node: fx, sprite, opacity };
        },

        recycleEffectNode(pool: NodePool, fx: Node) {
            Tween.stopAllByTarget(fx);
            const opacity = fx.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            const sprite = fx.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = null;
            fx.active = false;
            if (this.getNodePoolSize(pool) >= this.getEffectPoolLimit(pool)) {
                fx.destroy();
                return;
            }
            pool.put(fx);
        },

        clearEffectPools() {
            debugPerfSnapshot('effectPools.clear.before', this);
            this.clearBeanSettleMatchFx?.();
            this.clearFreezeSpineFx?.();
            this.clearActiveFlyBeanNodes?.('effect-pools-clear');
            this._flyBeanPool.clear();
            this._brightFlashPool.clear();
            this._activeBrightFlashCount = 0;
            debugPerfSnapshot('effectPools.clear.after', this);
        },

        clearBoardVisualPools() {
            debugPerfSnapshot('boardVisualPools.clear.before', this);
            this._boardCellPool.clear();
            this._boardSlotBgPool.clear();
            debugPerfSnapshot('boardVisualPools.clear.after', this);
        },

        getNodePoolSize(pool: NodePool): number {
            const size = (pool as any).size;
            return typeof size === 'function' ? Math.max(0, Number(size.call(pool)) || 0) : 0;
        },

        getEffectPoolLimit(pool: NodePool): number {
            if (pool === this._brightFlashPool) return MAX_BRIGHT_FLASH_POOL_SIZE;
            return MAX_BRIGHT_FLASH_POOL_SIZE;
        },

        getSavedLevel(): number {
            const s = sys.localStorage.getItem(LS_LEVEL);
            return normalizeStartupLocalLevel(s) || 1;
        },

        getRawSavedLevelForStartup(): string | null {
            return sys.localStorage.getItem(LS_LEVEL);
        },

        getParsedSavedLevelForStartup(): number | null {
            return normalizeStartupLocalLevel(this.getRawSavedLevelForStartup());
        },

        getStartupLocalProgressState(): 'rawLevelMissing' | 'rawLevelInvalid' | 'local_progress_1' | 'local_progress_gt_1' {
            return readStartupLocalProgress().state;
        },

        getLocalUserStateUpdatedAt(): number {
            const raw = sys.localStorage.getItem(LS_USER_STATE_UPDATED_AT);
            const value = raw ? parseInt(raw) : 0;
            return Number.isFinite(value) && value > 0 ? value : 0;
        },

        setLocalUserStateUpdatedAt(timestamp: number): void {
            const normalized = Math.max(0, Math.floor(Number(timestamp) || 0));
            sys.localStorage.setItem(LS_USER_STATE_UPDATED_AT, normalized.toString());
        },

        hasPlayedBefore(): boolean { return readStartupLocalProgress().hasStoredProgress; },

        hasLocalUserState(): boolean { return this.hasPlayedBefore() || this.getLocalUserStateUpdatedAt() > 0; },

        hasReliableLocalUserStateForStartup(): boolean { return this.getStartupLocalProgressState() === 'local_progress_gt_1'; },

        recordMainlineLevelEntry(levelId: number): void {
            const normalizedLevel = Math.max(1, Math.floor(Number(levelId) || 1));
            const currentLevel = this.getParsedSavedLevelForStartup();
            const nextLevel = Math.max(currentLevel || 0, normalizedLevel);
            if (nextLevel <= 0) return;
            if (currentLevel !== nextLevel || this.getRawSavedLevelForStartup() === null) {
                sys.localStorage.setItem(LS_LEVEL, String(nextLevel));
            }
            UserMgr.inst.markLevelProgress(nextLevel, false, false);
        },

        saveLevelProgress(levelId: number) {
            const normalizedLevel = Math.max(1, Math.floor(Number(levelId) || 1));
            const currentLevel = this.getSavedLevel();
            const nextLevel = Math.max(currentLevel, normalizedLevel);
            if (nextLevel > normalizedLevel) {
                console.warn('[GameCtrl] keep higher cloud savedLevel, skip lower local progress save', { currentLevel, requestedLevel: normalizedLevel, nextLevel });
            }
            sys.localStorage.setItem(LS_LEVEL, '' + nextLevel);
            UserMgr.inst.markLevelProgress(nextLevel, false, false);
            this.queueCloudGameStateSync();
            if (deferLeaderboardProgressDuringStartup(this, nextLevel)) return;
            void LeaderboardMgr.inst.submitProgress(nextLevel, UserMgr.inst.getProfile());
        },

        captureCloudGameState(): CloudGameState {
            const backgroundSkinState = typeof this.captureBackgroundSkinCloudState === 'function'
                ? this.captureBackgroundSkinCloudState()
                : {
                    ownedBackgroundSkinIds: [1000],
                    backgroundSkinAdProgress: {},
                    equippedBackgroundSkinId: 0,
                    equippedBackgroundSkinUpdatedAt: 0,
                    backgroundSkinResetVersion: 0,
                };
            return {
                savedLevel: this.getSavedLevel(),
                vigor: this.getVigor(),
                vigorTime: this.getVigorTime(),
                gold: this.getGold(),
                expandSlotCount: this.getPropCount('expand'),
                magicWandCount: this.getPropCount('wand'),
                freezeCount: this.getPropCount('freeze'),
                brushCount: this.getPropCount('brush'),
                magnetCount: this.getPropCount('magnet'),
                ownedBackgroundSkinIds: Array.isArray(backgroundSkinState.ownedBackgroundSkinIds)
                    ? backgroundSkinState.ownedBackgroundSkinIds as number[]
                    : (typeof this.getOwnedBackgroundSkinIds === 'function' ? this.getOwnedBackgroundSkinIds() : []),
                backgroundSkinAdProgress: backgroundSkinState.backgroundSkinAdProgress && typeof backgroundSkinState.backgroundSkinAdProgress === 'object' ? backgroundSkinState.backgroundSkinAdProgress as Record<string, number> : {},
                equippedBackgroundSkinId: Math.max(0, Math.floor(Number(backgroundSkinState.equippedBackgroundSkinId) || 0)),
                equippedBackgroundSkinUpdatedAt: Math.max(0, Math.floor(Number(backgroundSkinState.equippedBackgroundSkinUpdatedAt) || 0)),
                backgroundSkinResetVersion: Math.max(0, Math.floor(Number(backgroundSkinState.backgroundSkinResetVersion) || 0)),
                stateUpdatedAt: this.getLocalUserStateUpdatedAt(),
            };
        },

        queueCloudGameStateSync(): void {
            if (deferCloudGameStateSyncDuringStartup(this)) return;
            const timestamp = Date.now();
            this.setLocalUserStateUpdatedAt(timestamp);
            const state = this.captureCloudGameState();
            state.stateUpdatedAt = timestamp;
            UserStateSyncMgr.inst.queueSave({ profile: UserMgr.inst.getCloudProfile(), gameState: state });
        },

        async loadRestorableUserStateFromCloud(): Promise<CloudUserState | null> { return UserStateSyncMgr.inst.loadState(); },

        getStartupCloudRestoreStatus(): UserStateRestoreStatus | '' {
            return (this._startupCloudRestoreStatus || '') as UserStateRestoreStatus | '';
        },

        _shouldHoldStartupCloudRestoreForBoot(): boolean {
            const appRoot = AppRoot.tryGet();
            const sceneName = String(this.node?.scene?.name || '');
            return sceneName === 'Boot' || appRoot?.session.currentSceneName === 'Boot';
        },

        beginStartupCloudRestore(hadLocalUserState: boolean): Promise<UserStateRestoreStatus> {
            const existingStatus = this.getStartupCloudRestoreStatus();
            if (existingStatus && existingStatus !== 'cloud_restore_pending') {
                return Promise.resolve(existingStatus);
            }
            if (this._startupCloudRestorePromise) {
                return this._startupCloudRestorePromise;
            }
            const canUseCloudState = UserStateSyncMgr.inst.canUseCloud();
            if (!canUseCloudState) {
                if (!hadLocalUserState) this._startupCloudSaveBlockedForSession = true;
                const status: UserStateRestoreStatus = hadLocalUserState ? 'local_progress_gt_1' : 'cloud_unavailable_unresolved';
                this._startupCloudRestoreStatus = status;
                return Promise.resolve(status);
            }

            this._startupCloudRestorePending = true;
            this._startupCloudSaveBlockedForSession = false;
            this._startupCloudRestoreHadLocalUserState = hadLocalUserState;
            this._startupCloudRestoreStatus = 'cloud_restore_pending';
            debugPerfTrace('startup.cloudRestore.begin', {
                hadLocalUserState,
                sceneName: String(this.node?.scene?.name || ''),
            });
            this._startupCloudRestorePromise = this.loadRestorableUserStateFromCloud().then((lateState) => {
                let status: UserStateRestoreStatus;
                if (!lateState) {
                    status = UserStateSyncMgr.inst.canUseCloud() ? 'cloud_failed_unresolved' : 'cloud_unavailable_unresolved';
                } else if (this._shouldHoldStartupCloudRestoreForBoot()) {
                    status = this.applyCloudUserState(lateState);
                } else {
                    status = applyLateCloudUserStateToRuntime(this, lateState, hadLocalUserState) || 'cloud_failed_unresolved';
                }
                this._startupCloudRestoreStatus = status;
                resolveStartupCloudRestorePending(this, status);
                debugPerfTrace('startup.cloudRestore.done', {
                    status,
                    hadLocalUserState,
                    sceneName: String(this.node?.scene?.name || ''),
                    savedLevel: typeof this.getSavedLevel === 'function' ? this.getSavedLevel() : 0,
                });
                return status;
            }).catch((error) => {
                const status: UserStateRestoreStatus = 'cloud_failed_unresolved';
                this._startupCloudRestoreStatus = status;
                resolveStartupCloudRestorePending(this, status);
                console.warn('[GameCtrl] background cloud user state restore failed:', error);
                return status;
            });
            return this._startupCloudRestorePromise;
        },

        async restoreUserStateFromCloud(hadLocalUserState: boolean): Promise<UserStateRestoreStatus> {
            void this.beginStartupCloudRestore(hadLocalUserState);
            if (hadLocalUserState) {
                return 'local_progress_gt_1';
            }
            const status = this.getStartupCloudRestoreStatus();
            return status && status !== 'cloud_restore_pending' ? status : 'cloud_restore_pending';
        },

        applyLateCloudUserState(state: CloudUserState | null, hadLocalUserState: boolean): void {
            applyLateCloudUserStateToRuntime(this, state, hadLocalUserState);
        },

        applyCloudUserState(restoreResult: CloudUserState): UserStateRestoreStatus {
            const { profile, gameState } = restoreResult;
            if (!profile && !gameState) {
                return 'cloud_confirmed_empty';
            }
        
            if (profile) {
                UserMgr.inst.applyCloudProfile(profile);
            }
        
            if (!gameState) {
                return 'cloud_confirmed_empty';
            }
        
            const cloudSavedLevel = typeof gameState.savedLevel === 'number'
                ? Math.max(0, Math.floor(Number(gameState.savedLevel) || 0))
                : 0;
            const cloudUpdatedAt = Math.max(0, Math.floor(Number(gameState.stateUpdatedAt) || 0));
            const localUpdatedAt = this.getLocalUserStateUpdatedAt();
            const localSavedLevel = this.getSavedLevel();
            const shouldSkipVolatileRestore = cloudUpdatedAt > 0 && localUpdatedAt > cloudUpdatedAt && cloudSavedLevel <= localSavedLevel;
            if (shouldSkipVolatileRestore) {
                console.warn('[GameCtrl] local user state is newer than cloud, skip restore', { localUpdatedAt, cloudUpdatedAt, localSavedLevel, cloudSavedLevel });
            }
            if (typeof this.applyBackgroundSkinCloudState === 'function') {
                this.applyBackgroundSkinCloudState(gameState as any, !shouldSkipVolatileRestore);
            }
        
            const effectiveLevel = Math.max(localSavedLevel, cloudSavedLevel);
            if (effectiveLevel > 0 && (cloudSavedLevel > 0 || readStartupLocalProgress().hasStoredProgress)) {
                sys.localStorage.setItem(LS_LEVEL, String(effectiveLevel));
                UserMgr.inst.markLevelProgress(effectiveLevel, false, false);
            }
            if (typeof this.applyCloudBackgroundSkinState === 'function') {
                const cloudEquippedBackgroundSkinId = gameState.equippedBackgroundSkinId;
                const cloudEquippedBackgroundSkinUpdatedAt = gameState.equippedBackgroundSkinUpdatedAt;
                this.applyCloudBackgroundSkinState(
                    gameState.ownedBackgroundSkinIds,
                    cloudEquippedBackgroundSkinId,
                    cloudEquippedBackgroundSkinUpdatedAt,
                );
                if (cloudEquippedBackgroundSkinId && cloudEquippedBackgroundSkinUpdatedAt && typeof this.refreshEquippedGameplayBackground === 'function') {
                    this.refreshEquippedGameplayBackground(true);
                }
            }
            if (shouldSkipVolatileRestore) {
                this.refreshVigorUI?.();
                this.refreshGoldUI();
                this.syncSkillButtonRuntimeStates?.();
                if (effectiveLevel > cloudSavedLevel && effectiveLevel > 1) return 'local_progress_gt_1';
                return cloudSavedLevel > 1 ? 'cloud_progress_gt_1' : 'cloud_confirmed_empty';
            }
            if (typeof gameState.vigor === 'number') {
                sys.localStorage.setItem((this.constructor as any).LS_VIGOR, String(Math.max(0, Math.floor(gameState.vigor))));
            }
            if (typeof gameState.vigorTime === 'number') {
                sys.localStorage.setItem((this.constructor as any).LS_VIGOR_TIME, String(Math.max(0, Math.floor(gameState.vigorTime))));
            }
            if (typeof gameState.gold === 'number') {
                this.setGold(gameState.gold, { syncCloud: false });
            }
            if (typeof gameState.expandSlotCount === 'number') {
                sys.localStorage.setItem(LS_PROP_EXPAND, String(Math.max(0, Math.floor(gameState.expandSlotCount))));
            }
            if (typeof gameState.magicWandCount === 'number') {
                sys.localStorage.setItem(LS_PROP_WAND, String(Math.max(0, Math.floor(gameState.magicWandCount))));
            }
            if (typeof gameState.freezeCount === 'number') {
                sys.localStorage.setItem(LS_PROP_FREEZE, String(Math.max(0, Math.floor(gameState.freezeCount))));
            }
            if (typeof gameState.brushCount === 'number') {
                sys.localStorage.setItem(LS_PROP_BRUSH, String(Math.max(0, Math.floor(gameState.brushCount))));
            }
            if (typeof gameState.magnetCount === 'number') {
                sys.localStorage.setItem(LS_PROP_MAGNET, String(Math.max(0, Math.floor(gameState.magnetCount))));
            }
            if (cloudUpdatedAt > 0) {
                this.setLocalUserStateUpdatedAt(cloudUpdatedAt);
            }
            this.refreshVigorUI?.();
            this.refreshGoldUI();
            this.syncSkillButtonRuntimeStates?.();
            if (cloudSavedLevel > localSavedLevel && cloudSavedLevel > 1) return 'cloud_progress_gt_1';
            if (effectiveLevel > cloudSavedLevel && effectiveLevel > 1) return 'local_progress_gt_1';
            return cloudSavedLevel > 1 ? 'local_progress_gt_1' : 'cloud_confirmed_empty';
        },

        applyAuthoritativeCloudUserStateFromSave(state: CloudUserState | null): void {
            const gameState = state?.gameState || null;
            if (gameState && typeof this.applyCloudBackgroundSkinState === 'function') {
                this.applyCloudBackgroundSkinState(
                    gameState.ownedBackgroundSkinIds,
                    gameState.equippedBackgroundSkinId,
                    gameState.equippedBackgroundSkinUpdatedAt,
                );
                if (gameState.equippedBackgroundSkinId && gameState.equippedBackgroundSkinUpdatedAt && typeof this.refreshEquippedGameplayBackground === 'function') {
                    this.refreshEquippedGameplayBackground(true);
                }
            }
            const cloudSavedLevel = Math.floor(Number(state?.gameState?.savedLevel) || 0);
            const localSavedLevel = this.getSavedLevel();
            if (cloudSavedLevel > localSavedLevel) {
                applyLateCloudUserStateToRuntime(this, state, true);
                return;
            }
            const cloudUpdatedAt = Math.max(0, Math.floor(Number(gameState?.stateUpdatedAt) || 0));
            if (cloudUpdatedAt > this.getLocalUserStateUpdatedAt()) {
                this.applyCloudUserState(state);
            }
        },

        bindUserStateLifecycle(): void {
            if (this._userStateLifecycleBound) {
                return;
            }
            this._userStateLifecycleBound = true;
            UserStateSyncMgr.inst.setAuthoritativeStateHandler((state) => {
                if (!this.isValid) return;
                this.applyAuthoritativeCloudUserStateFromSave(state);
            });
            game.on(Game.EVENT_HIDE, this.handleGameHideFlushUserState, this);
            game.on(Game.EVENT_SHOW, this.handleGameShowLifecycle, this);
        },

        unbindUserStateLifecycle(): void {
            this.releaseRewardedAdWarmSlot?.('lifecycle-unbind');
            if (!this._userStateLifecycleBound) {
                return;
            }
            this._userStateLifecycleBound = false;
            UserStateSyncMgr.inst.setAuthoritativeStateHandler(null);
            game.off(Game.EVENT_HIDE, this.handleGameHideFlushUserState, this);
            game.off(Game.EVENT_SHOW, this.handleGameShowLifecycle, this);
            this._pendingPostAdSkillAction = null;
        },

        handleGameHideFlushUserState(): void {
            this._gameForeground = false;
            this.resetTouchState?.();
            this.pauseGuideReminderForLifecycle?.();
            this.reportFirstLevelReleaseState?.('app_hide');
            AnalyticsMgr.inst.flushFunnelEvents();
            void UserStateSyncMgr.inst.flushPendingSave();
        },

        handleGameShowLifecycle(): void {
            this._gameForeground = true;
            this.ensureRewardedAdWarmSlot?.('app-foreground');
            this.resetTouchState?.();
            this.auditRuntimeOwnersAfterForeground?.();
            this.resumeGuideReminderForLifecycle?.();
            this.reportFirstLevelReleaseState?.('app_show');
            this.refreshVigorUI?.();
            this.refreshGoldUI?.();
            this.syncSkillButtonRuntimeStates?.();
            this.auditRecoverVigorInteractionState?.('foreground');
            const pendingAction = this._pendingPostAdSkillAction;
            if (!pendingAction) {
                return;
            }
            this._pendingPostAdSkillAction = null;
            this.scheduleOnce(() => {
                if (!this.isValid) return;
                pendingAction();
            }, 0.08);
        },
    });
}
