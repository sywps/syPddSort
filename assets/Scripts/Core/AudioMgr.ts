/**
 * 全局音效管理 — 中国风 BGM + 轻量 SFX
 *
 * 资源规约：音频源文件放在 GameAssetsBundle/Audio/ 下；构建时会抽取核心 BGM/SFX 到 bootstrap。
 */

import { _decorator, AudioClip, AudioSource, Node, sys, assetManager, director, isValid } from 'cc';
import type { AssetManager } from 'cc';
import {
    AUDIO_BGM_RESOURCE_PATH,
    AUDIO_BGM_VOLUME,
    AUDIO_GAME_BGM_RESOURCE_PATH,
    AUDIO_GAME_BGM_VOLUME,
    AUDIO_HOME_BGM_RESOURCE_PATH,
    AUDIO_HOME_BGM_VOLUME,
    AUDIO_BOOTSTRAP_SFX_NAMES,
    AUDIO_SFX_RESOURCE_PATH,
    AUDIO_SFX_VOLUME,
    AUDIO_SFX_VOLUME_VARIANCE,
    type SfxName,
    type GuideVoiceName,
} from './AudioManifest';
import { GAME_ASSETS_BUNDLE_NAME, LOCAL_BOOTSTRAP_BUNDLE_NAME } from './PackageNames';
import { runtimeLog } from './RuntimeLog';
import { getDouyinMiniGameRuntime } from './MiniGamePlatform';
const { ccclass } = _decorator;
declare const wx: any;

export type { SfxName } from './AudioManifest';

type Bundle = AssetManager.Bundle;
export type VoiceKind = 'judgment' | 'hint' | 'warning' | 'guide' | 'result';
const VOICE_PRIORITY: Record<VoiceKind, number> = { judgment: 0, hint: 1, warning: 2, guide: 3, result: 4 };
export type VoicePlaybackOptions = {
    isCurrent?: () => boolean;
    /** After STARTED, allow the sentence to finish while its scene/session remains valid. */
    finishSentence?: boolean;
    canContinue?: () => boolean;
    onStarted?: () => void;
    onCompleted?: () => void;
    maxDelayMs?: number;
};

const LS_SFX = 'pdd.setting.sfx';
const LS_VOICE = 'pdd.setting.voice';
const LS_BGM = 'pdd.setting.bgm';
const LS_VIB = 'pdd.setting.vib';
const SFX_CHANNEL_COUNT = 8;
const SFX_IDLE_POOL_LIMIT = 10;
const SFX_START_TIMEOUT_MS = 5000;
const AUDIO_LOAD_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];
const GAME_SCENE_SFX_ALLOWLIST = new Set<SfxName>([
    'settle',
    'conveyorEnter',
    'conveyorReturn',
    'button',
    'tick',
    'winColor',
    'winAll',
    'winSettlement',
    'lose',
    'revivePop',
    'judgmentGreat',
    'judgmentExcellent',
    'judgmentAwesome',
    'judgmentAmazing',
    'judgmentPerfect',
    'judgmentUnbelievable',
]);

const BOOTSTRAP_SFX_NAME_SET = new Set<SfxName>(AUDIO_BOOTSTRAP_SFX_NAMES);

@ccclass('AudioMgr')
export class AudioMgr {
    private static _inst: AudioMgr | null = null;
    static get inst(): AudioMgr {
        if (!AudioMgr._inst) AudioMgr._inst = new AudioMgr();
        return AudioMgr._inst;
    }

    private sfxClips: Map<SfxName, AudioClip> = new Map();
    private retainedSfxClips = new Set<AudioClip>();
    private bgmClip: AudioClip | null = null;
    private host: Node | null = null;
    private audioRoot: Node | null = null;
    private sfxSources: AudioSource[] = [];
    private busySfxSources: Set<AudioSource> = new Set();
    private sfxStartTimers = new Map<AudioSource, ReturnType<typeof setTimeout>>();
    private bgmSrc: AudioSource | null = null;
    private readonly reportedUnknownSources = new WeakSet<AudioSource>();
    private guideVoiceSource: AudioSource | null = null;
    private guideVoiceGeneration = 0;
    // One narrator channel, shared by guides, judgments and gameplay voices.
    private activeVoiceKind: VoiceKind | null = null;
    private activeVoiceStarted = false;
    private activeVoiceOptions: VoicePlaybackOptions | null = null;
    private queuedResultVoice: { name: SfxName; options: VoicePlaybackOptions } | null = null;
    private voiceCancellationVersion = 0;
    private voiceLoadTimer: ReturnType<typeof setTimeout> | null = null;
    private preparedGuideVoices = new Map<SfxName, AudioSource>();
    private pendingGuideVoicePreparations = new Set<SfxName>();
    private guideVoicePreparationGeneration = 0;
    private gameAssetsBundle: Bundle | null = null;
    private bootstrapBundle: Bundle | null = null;
    private sfxEnabled = true;
    private voiceEnabled = true;
    private bgmEnabled = true;
    private vibrateEnabled = true;
    private suspended = false;
    private bgmWasPlayingBeforeSuspend = false;
    private externalInterruptionRefs = 0;
    private bgmWasPlayingBeforeExternalInterruption = false;
    private pendingSfxLoads: Set<SfxName> = new Set();
    private sfxLoadCallbacks = new Map<string, Array<(error?: Error) => void>>();
    private pendingAutoplaySfx: Map<SfxName, number> = new Map();
    private gameAssetsBundleCallbacks: Array<(bundle: Bundle | null) => void> | null = null;
    private bootstrapBundleCallbacks: Array<(bundle: Bundle | null) => void> | null = null;
    private bootstrapBundleState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private bootstrapBundleFailures = 0;
    private bootstrapBundleRetryAt = 0;
    private preferRemoteAudio = false;
    private gameAssetsBundleState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private gameAssetsBundleFailures = 0;
    private gameAssetsBundleRetryAt = 0;
    private bgmLoadState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private bgmClipFailures = 0;
    private bgmClipRetryAt = 0;
    private bgmAutoplayRequested = false;
    private bgmWarmupTimer: any = null;
    private bgmResourcePath = AUDIO_BGM_RESOURCE_PATH;
    private bgmVolume = AUDIO_BGM_VOLUME;
    private bgmLoadToken = 0;
    private pendingBgmRestartAfterExternalInterruption = false;

    private constructor() {
        // 从本地存储加载设置（默认开启）
        this.sfxEnabled = sys.localStorage.getItem(LS_SFX) !== '0';
        const savedVoice = sys.localStorage.getItem(LS_VOICE);
        this.voiceEnabled = savedVoice === null ? this.sfxEnabled : savedVoice !== '0';
        // Preserve existing users' mute choice once, then keep voice and SFX independent.
        if (savedVoice === null) sys.localStorage.setItem(LS_VOICE, this.voiceEnabled ? '1' : '0');
        this.bgmEnabled = sys.localStorage.getItem(LS_BGM) !== '0';
        this.vibrateEnabled = sys.localStorage.getItem(LS_VIB) !== '0';
    }

    /** 在游戏启动时调用；内部会把 AudioSource 迁到持久 AudioRoot，避免场景切换销毁 BGM。 */
    init(host: Node) {
        if (!host?.isValid) return;
        const audioHost = this.getOrCreateAudioRoot(host);
        const previousHost = this.host;
        if (previousHost !== audioHost) {
            if (previousHost && isValid(previousHost, true)) {
                previousHost.off(AudioSource.EventType.STARTED, this._handleSfxSourceStarted, this);
                previousHost.off(AudioSource.EventType.ENDED, this._handleSfxSourceEnded, this);
            }
            if (previousHost) {
                this.stopVoice();
                this.pendingAutoplaySfx.clear();
                // Only retire registered sources on the old root, never unknown components.
                for (const source of new Set([...this.sfxSources, this.bgmSrc])) {
                    if (source && isValid(source, true) && source.node === previousHost) {
                        source.stop();
                        source.clip = null;
                        source.destroy();
                    }
                }
            }
        }
        this.host = audioHost;
        this.reconcileSfxSources(audioHost);
        // Rebind idempotently, including recovery from an invalid source layout.
        audioHost.off(AudioSource.EventType.STARTED, this._handleSfxSourceStarted, this);
        audioHost.on(AudioSource.EventType.STARTED, this._handleSfxSourceStarted, this);
        audioHost.off(AudioSource.EventType.ENDED, this._handleSfxSourceEnded, this);
        audioHost.on(AudioSource.EventType.ENDED, this._handleSfxSourceEnded, this);
        const needsBgmSource = !isValid(this.bgmSrc, true) || this.bgmSrc!.node !== audioHost;
        if (needsBgmSource) {
            if (this.bgmSrc && isValid(this.bgmSrc, true)) {
                console.warn('[AudioMgr] BGM source belongs to another node; preserving unconfirmed source');
            }
            this.bgmSrc = audioHost.addComponent(AudioSource);
            this.bgmSrc.playOnAwake = false;
            this.bgmSrc.loop = true;
            this.bgmSrc.volume = this.bgmVolume;
        }
        const knownSources = new Set([...this.sfxSources, this.bgmSrc, this.guideVoiceSource]);
        for (const source of audioHost.getComponents(AudioSource)) {
            if (!isValid(source, true) || knownSources.has(source) || this.reportedUnknownSources.has(source)) continue;
            this.reportedUnknownSources.add(source);
            console.warn('[AudioMgr] Unregistered AudioSource preserved; ownership must be confirmed');
        }
        this.preferRemoteAudio = this._isMinigameEnv();
        // Normal level initialization must not set clip, seek, stop or replay a valid BGM source.
        if (needsBgmSource && this.bgmAutoplayRequested) {
            this.ensureBgmPlaying('audio-init');
        }
    }

    private getOrCreateAudioRoot(fallbackHost: Node): Node {
        if (this.audioRoot?.isValid) return this.audioRoot;
        const scene = director.getScene() || fallbackHost.scene;
        const root = new Node('PddAudioRoot');
        if (scene?.isValid) {
            scene.addChild(root);
        } else {
            fallbackHost.addChild(root);
        }
        try {
            director.addPersistRootNode(root);
        } catch (_) {
            // Cocos may throw if the node is already persistent in hot-reload like flows.
        }
        this.audioRoot = root;
        return root;
    }

    private reconcileSfxSources(audioHost: Node): void {
        const sources = new Set<AudioSource>();
        for (const source of this.sfxSources) {
            if (!isValid(source, true) || source.node !== audioHost
                || source === this.bgmSrc || source === this.guideVoiceSource) {
                console.warn('[AudioMgr] Removed invalid or incorrectly registered SFX source record');
                continue;
            }
            if (sources.has(source)) console.warn('[AudioMgr] Removed duplicate SFX source record');
            sources.add(source);
        }
        this.sfxSources = Array.from(sources);
        for (const source of this.sfxStartTimers.keys()) {
            if (!sources.has(source)) this._clearSfxStartTimer(source);
        }
        for (const source of this.busySfxSources) {
            if (!sources.has(source)) this.busySfxSources.delete(source);
        }
        // Reconcile real playback without stopping it, even if the busy record was lost.
        for (const source of sources) {
            if (source.playing) this.busySfxSources.add(source);
        }
        const initialCount = Math.min(SFX_CHANNEL_COUNT, this._sfxChannelLimit());
        while (this.sfxSources.length < initialCount) {
            const source = audioHost.addComponent(AudioSource);
            source.playOnAwake = false;
            source.loop = false;
            this.sfxSources.push(source);
        }
    }

    private _clearSfxStartTimer(source: AudioSource): void {
        const timer = this.sfxStartTimers.get(source);
        if (timer === undefined) return;
        clearTimeout(timer);
        this.sfxStartTimers.delete(source);
    }

    private _handleSfxSourceStarted(source: AudioSource): void {
        this._clearSfxStartTimer(source);
    }

    private _discardSfxSource(source: AudioSource): void {
        this._clearSfxStartTimer(source);
        this.busySfxSources.delete(source);
        this.sfxSources = this.sfxSources.filter(item => item !== source);
        if (!isValid(source, true)) return;
        source.stop();
        // Invalidate late native loads and never reuse a source with a pending play promise.
        source.clip = null;
        source.destroy();
    }

    private _handleSfxSourceEnded(source: AudioSource) {
        this._clearSfxStartTimer(source);
        if (!this.busySfxSources.delete(source)) return;
        this._trimIdleSfxSources();
    }

    private _trimIdleSfxSources(): void {
        let idleCount = 0;
        this.sfxSources = this.sfxSources.filter((source) => {
            if (this.busySfxSources.has(source)) return true;
            if (++idleCount <= SFX_IDLE_POOL_LIMIT) return true;
            source.stop();
            source.clip = null;
            source.destroy();
            return false;
        });
    }

    private _sfxChannelLimit(): number {
        return Math.max(0, Math.floor(AudioSource.maxAudioChannel) - 2);
    }

    private _pendingSfxCount(): number {
        let count = 0;
        for (const value of this.pendingAutoplaySfx.values()) count += value;
        return count;
    }

    private _flushPendingAutoplay(name: SfxName, clip: AudioClip | null): void {
        const count = this.pendingAutoplaySfx.get(name) || 0;
        this.pendingAutoplaySfx.delete(name);
        if (clip) for (let i = 0; i < count; i++) this._playLoadedClip(name, clip);
    }

    private _acquireSfxSource(): AudioSource | null {
        if (this.busySfxSources.size >= this._sfxChannelLimit()) return null;
        for (const source of this.sfxSources) {
            if (source?.isValid && !this.busySfxSources.has(source)) return source;
        }
        if (!this.audioRoot?.isValid || this.sfxSources.length >= this._sfxChannelLimit()) return null;
        const source = this.audioRoot.addComponent(AudioSource);
        source.playOnAwake = false;
        source.loop = false;
        this.sfxSources.push(source);
        return source;
    }

    private _clearBgmWarmupTimer() {
        if (!this.bgmWarmupTimer) return;
        clearTimeout(this.bgmWarmupTimer);
        this.bgmWarmupTimer = null;
    }

    private _isMinigameEnv(): boolean {
        if (sys.isNative) return true;
        const g: any = typeof globalThis !== 'undefined' ? globalThis : null;
        const w: any = typeof window !== 'undefined' ? window : null;
        return !!(g?.__rawWx || w?.wx?.getSystemInfoSync || w?.tt?.getSystemInfoSync);
    }

    private _loadFromBootstrapBundleAuto(onReady?: (bundle: Bundle | null) => void) {
        if (this.bootstrapBundleState === 'loading') {
            if (onReady) {
                if (!this.bootstrapBundleCallbacks) this.bootstrapBundleCallbacks = [];
                this.bootstrapBundleCallbacks.push(onReady);
            }
            return;
        }
        // Another owner may have loaded the bundle since our last failed attempt.
        const cached = assetManager.getBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME);
        if (cached) {
            this.bootstrapBundle = cached;
            this.bootstrapBundleState = 'ready';
            this.bootstrapBundleFailures = 0;
            this.bootstrapBundleRetryAt = 0;
        }
        if (this.bootstrapBundleState === 'ready') {
            onReady?.(this.bootstrapBundle);
            return;
        }
        if (Date.now() < this.bootstrapBundleRetryAt) {
            onReady?.(null);
            return;
        }
        this.bootstrapBundleCallbacks = onReady ? [onReady] : [];
        this.bootstrapBundleState = 'loading';
        assetManager.loadBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME, (err, bundle) => {
            const callbacks = this.bootstrapBundleCallbacks || [];
            this.bootstrapBundleCallbacks = null;
            if (err || !bundle) {
                this.bootstrapBundleState = 'failed';
                const delay = AUDIO_LOAD_RETRY_DELAYS_MS[Math.min(this.bootstrapBundleFailures++, AUDIO_LOAD_RETRY_DELAYS_MS.length - 1)];
                this.bootstrapBundleRetryAt = Date.now() + delay;
                console.warn('[Audio] loadBundle bootstrap 失败，后续请求将在冷却后重试:', err?.message, delay);
                callbacks.forEach((callback) => callback(null));
                return;
            }
            this.bootstrapBundleState = 'ready';
            this.bootstrapBundle = bundle;
            this.bootstrapBundleFailures = 0;
            this.bootstrapBundleRetryAt = 0;
            callbacks.forEach((callback) => callback(bundle));
        });
    }

    private _loadFromGameAssetsBundleAuto(onReady?: (bundle: Bundle | null) => void) {
        if (this.gameAssetsBundleState === 'loading') {
            if (onReady) {
                if (!this.gameAssetsBundleCallbacks) this.gameAssetsBundleCallbacks = [];
                this.gameAssetsBundleCallbacks.push(onReady);
            }
            return;
        }
        const cached = assetManager.getBundle(GAME_ASSETS_BUNDLE_NAME);
        if (cached) {
            this.gameAssetsBundle = cached;
            this.gameAssetsBundleState = 'ready';
            this.gameAssetsBundleFailures = 0;
            this.gameAssetsBundleRetryAt = 0;
        }
        if (this.gameAssetsBundleState === 'ready') {
            onReady?.(this.gameAssetsBundle);
            return;
        }
        if (Date.now() < this.gameAssetsBundleRetryAt) {
            onReady?.(null);
            return;
        }
        this.gameAssetsBundleCallbacks = onReady ? [onReady] : [];
        this.gameAssetsBundleState = 'loading';
        assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
            const callbacks = this.gameAssetsBundleCallbacks || [];
            this.gameAssetsBundleCallbacks = null;
            if (err || !bundle) {
                this.gameAssetsBundleState = 'failed';
                const delay = AUDIO_LOAD_RETRY_DELAYS_MS[Math.min(this.gameAssetsBundleFailures++, AUDIO_LOAD_RETRY_DELAYS_MS.length - 1)];
                this.gameAssetsBundleRetryAt = Date.now() + delay;
                console.warn(`[Audio] loadBundle ${GAME_ASSETS_BUNDLE_NAME} 失败，后续请求将在冷却后重试:`, err?.message, delay);
                callbacks.forEach((callback) => callback(null));
                return;
            }
            this.gameAssetsBundleState = 'ready';
            this.gameAssetsBundle = bundle;
            this.gameAssetsBundleFailures = 0;
            this.gameAssetsBundleRetryAt = 0;
            callbacks.forEach((callback) => callback(bundle));
        });
    }

    private _cacheSfxClip(name: SfxName, clip: AudioClip): void {
        // The manager outlives scenes; a JS Map alone does not own a Cocos asset.
        if (!this.retainedSfxClips.has(clip)) {
            clip.addRef();
            this.retainedSfxClips.add(clip);
        }
        const previous = this.sfxClips.get(name);
        this.sfxClips.set(name, clip);
        if (previous && previous !== clip && !Array.from(this.sfxClips.values()).includes(previous)) {
            if (this.retainedSfxClips.delete(previous) && isValid(previous, true)) previous.decRef();
        }
    }

    private _getCachedSfxClip(name: SfxName): AudioClip | null {
        const clip = this.sfxClips.get(name);
        if (!clip) return null;
        if (isValid(clip, true)) return clip;
        console.error('[Audio] Cached SFX was released; reloading:', name);
        for (const [alias, value] of this.sfxClips) if (value === clip) this.sfxClips.delete(alias);
        this.retainedSfxClips.delete(clip);
        return null;
    }

    private _getCachedBgmClip(): AudioClip | null {
        if (this.bgmClip && !isValid(this.bgmClip, true)) {
            console.error('[Audio] Cached BGM was released; reloading:', this.bgmResourcePath);
            this.bgmSrc?.stop();
            if (this.bgmSrc) this.bgmSrc.clip = null;
            this.bgmClip = null;
            this.bgmLoadState = 'idle';
        }
        return this.bgmClip;
    }

    private _loadSingleSfxFromBundle(bundle: Bundle, name: SfxName, onDone: (clip: AudioClip | null) => void, logMissing: boolean = true) {
        const resourcePath = AUDIO_SFX_RESOURCE_PATH[name];
        bundle.load(resourcePath, AudioClip, (err, clip) => {
            if (!err && clip && isValid(clip, true)) {
                this._cacheSfxClip(name, clip);
                onDone(clip);
                return;
            }
            if (err && logMissing) {
                console.warn(`[Audio] SFX 加载失败: ${name} (${resourcePath}), err=${err.message}`);
            }
            onDone(null);
        });
    }

    private _isSfxAllowedInCurrentScene(name: SfxName): boolean {
        const sceneName = String(director.getScene()?.name || '').trim();
        return sceneName !== 'Game' || GAME_SCENE_SFX_ALLOWLIST.has(name);
    }

    private _playLoadedClip(name: SfxName, clip: AudioClip) {
        if (this.suspended || !this.sfxEnabled || !this._isSfxAllowedInCurrentScene(name)) return;
        let source: AudioSource | null = null;
        try {
            const baseVolume = AUDIO_SFX_VOLUME[name] ?? 0.7;
            const variance = AUDIO_SFX_VOLUME_VARIANCE[name] ?? 0;
            const jitter = variance > 0 ? (Math.random() * 2 - 1) * variance : 0;
            const volume = Math.max(0, Math.min(1, baseVolume * (1 + jitter)));

            source = this._acquireSfxSource();
            if (!source) return;
            source.playOnAwake = false;
            source.loop = false;
            source.clip = clip;
            source.volume = volume;
            this.busySfxSources.add(source);
            const pendingSource = source;
            const timer = setTimeout(() => {
                if (this.sfxStartTimers.get(pendingSource) !== timer) return;
                console.error('[Audio] SFX startup timed out:', name);
                this._discardSfxSource(pendingSource);
            }, SFX_START_TIMEOUT_MS);
            this.sfxStartTimers.set(source, timer);
            source.play();
        } catch (e) {
            if (source) this._discardSfxSource(source);
            console.error('[Audio] SFX playback failed:', name, e);
        }
    }

    private _ensureSfxLoaded(name: SfxName) {
        name = AUDIO_BOOTSTRAP_SFX_NAMES.find((alias) => AUDIO_SFX_RESOURCE_PATH[alias] === AUDIO_SFX_RESOURCE_PATH[name]) || name;
        if (this._getCachedSfxClip(name) || this.pendingSfxLoads.has(name)) {
            return;
        }
        this.pendingSfxLoads.add(name);
        const finish = (clip: AudioClip | null) => {
            this._finishSfxLoad(name, clip);
        };
        const loadFromGameAssets = () => this._loadFromGameAssetsBundleAuto(bundle => {
            if (!bundle) { finish(null); return; }
            this._loadSingleSfxFromBundle(bundle, name, finish);
        });
        if (BOOTSTRAP_SFX_NAME_SET.has(name) && (this.preferRemoteAudio || this.bootstrapBundle)) {
            this._loadFromBootstrapBundleAuto(bundle => {
                if (!bundle) { loadFromGameAssets(); return; }
                this._loadSingleSfxFromBundle(bundle, name, clip => {
                    if (clip) finish(clip);
                    else loadFromGameAssets();
                }, false);
            });
            return;
        }
        loadFromGameAssets();
    }

    private _finishSfxLoad(name: SfxName, clip: AudioClip | null): void {
        this.pendingSfxLoads.delete(name);
        const resourcePath = AUDIO_SFX_RESOURCE_PATH[name];
        for (const alias of AUDIO_BOOTSTRAP_SFX_NAMES) {
            if (AUDIO_SFX_RESOURCE_PATH[alias] !== resourcePath) continue;
            if (clip) this._cacheSfxClip(alias, clip);
            this._flushPendingAutoplay(alias, clip);
        }
        const callbacks = this.sfxLoadCallbacks.get(resourcePath) || [];
        this.sfxLoadCallbacks.delete(resourcePath);
        const error = clip ? undefined : new Error(`[Audio] SFX load failed: ${name} (${resourcePath})`);
        for (const callback of [...callbacks]) {
            try { callback(error); } catch (callbackError) {
                console.error('[Audio] preload callback failed:', callbackError);
            }
        }
    }

    private _playBgmClip() {
        if (!this.bgmEnabled || this.suspended || this.externalInterruptionRefs > 0 || !this.bgmSrc || !this.bgmClip) {
            return;
        }
        this.stopUnexpectedLoopSources();
        try {
            if (this.bgmSrc.clip !== this.bgmClip) this.bgmSrc.clip = this.bgmClip;
            if (!this.bgmSrc.playing) this.bgmSrc.play();
        } catch (e) {
            // WeChat innerAudioContext may throw if audio not ready
        }
    }

    private _restartBgmClip() {
        if (!this.bgmEnabled || this.suspended || this.externalInterruptionRefs > 0 || !this.bgmSrc || !this.bgmClip) {
            return;
        }
        this.stopUnexpectedLoopSources();
        try {
            this.bgmSrc.stop();
            this.bgmSrc.clip = this.bgmClip;
            this.bgmSrc.volume = this.bgmVolume;
            this.bgmSrc.loop = true;
            this.bgmSrc.play();
        } catch (e) {
            // WeChat innerAudioContext may throw if audio not ready
        }
    }

    private stopUnexpectedLoopSources(): void {
        if (!this.audioRoot?.isValid) return;
        // Only SFX registered to this manager are known to be invalid loop owners.
        for (const source of this.sfxSources) {
            if (source === this.bgmSrc || source === this.guideVoiceSource
                || !isValid(source, true) || source.node !== this.audioRoot || !source.loop) continue;
            try {
                source.stop();
            } catch (_) { /* ignore */ }
            try {
                source.loop = false;
                source.clip = null;
            } catch (_) { /* ignore */ }
        }
    }

    private _setBgmVolume(volume: number) {
        this.bgmVolume = Math.max(0, Math.min(1, volume));
        if (this.bgmSrc?.isValid) {
            this.bgmSrc.volume = this.bgmVolume;
        }
    }

    private _setBgmResourcePath(resourcePath: string) {
        const nextPath = resourcePath || AUDIO_BGM_RESOURCE_PATH;
        if (this.bgmResourcePath === nextPath) {
            return;
        }
        this._clearBgmWarmupTimer();
        this.pendingBgmRestartAfterExternalInterruption = false;
        this.bgmResourcePath = nextPath;
        const previousClip = this.bgmClip;
        this.bgmClip = null;
        this.bgmLoadState = 'idle';
        this.bgmClipFailures = 0;
        this.bgmClipRetryAt = 0;
        this.bgmLoadToken += 1;
        if (this.bgmSrc?.isValid) {
            try {
                this.bgmSrc.stop();
                this.bgmSrc.clip = null;
            } catch (_) { /* ignore */ }
        }
        if (previousClip && isValid(previousClip, true)) previousClip.decRef();
    }

    private _retryRequestedBgmPlayback() {
        if (!this.bgmAutoplayRequested || !this.bgmEnabled || this.suspended || this.externalInterruptionRefs > 0 || !this.bgmSrc) {
            return;
        }
        if (this._getCachedBgmClip()) {
            this._playBgmClip();
            return;
        }
        if (this.bgmLoadState === 'idle' || this.bgmLoadState === 'failed') {
            this._ensureBgmLoaded(true);
        }
    }

    private _ensureBgmLoaded(autoPlay: boolean = true) {
        if (!this.bgmEnabled || !this.bgmSrc) {
            return;
        }
        if (autoPlay) this.bgmAutoplayRequested = true;
        if (this._getCachedBgmClip()) {
            if (autoPlay) this._playBgmClip();
            return;
        }
        if (this.bgmLoadState === 'loading' || Date.now() < this.bgmClipRetryAt) {
            return;
        }
        this.bgmLoadState = 'loading';
        const resourcePath = this.bgmResourcePath;
        const loadToken = this.bgmLoadToken;
        const fail = (clipError?: Error) => {
            this.bgmLoadState = 'failed';
            // Bundle failures already have their own cooldown. Count only actual clip failures here.
            if (!clipError) return;
            const delay = AUDIO_LOAD_RETRY_DELAYS_MS[Math.min(this.bgmClipFailures++, AUDIO_LOAD_RETRY_DELAYS_MS.length - 1)];
            this.bgmClipRetryAt = Date.now() + delay;
            console.warn(`[Audio] BGM 加载失败，后续请求将在冷却后重试: ${resourcePath}`, clipError.message, delay);
        };
        const loadFromGameAssets = (localClipError?: Error) => {
            this._loadFromGameAssetsBundleAuto((bundle) => {
                if (loadToken !== this.bgmLoadToken || resourcePath !== this.bgmResourcePath) return;
                if (bundle) {
                    this._loadBgm(bundle, resourcePath, this.bgmAutoplayRequested, loadToken, fail);
                    return;
                }
                fail(localClipError);
            });
        };
        this._loadFromBootstrapBundleAuto((bundle) => {
            if (loadToken !== this.bgmLoadToken || resourcePath !== this.bgmResourcePath) return;
            if (bundle) {
                this._loadBgm(bundle, resourcePath, this.bgmAutoplayRequested, loadToken, loadFromGameAssets);
                return;
            }
            loadFromGameAssets();
        });
    }

    private _loadBgm(
        bundle: Bundle,
        resourcePath: string,
        autoPlay: boolean,
        loadToken: number,
        onMissing: (error: Error) => void,
    ) {
        if (this.bgmClip) {
            this.bgmLoadState = 'ready';
            if (autoPlay) this._playBgmClip();
            return;
        }
        bundle.load(resourcePath, AudioClip, (err, clip) => {
            if (loadToken !== this.bgmLoadToken || resourcePath !== this.bgmResourcePath || this.bgmClip) {
                return;
            }
            if (!err && clip && isValid(clip, true)) {
                clip.addRef();
                this.bgmClip = clip;
                this.bgmLoadState = 'ready';
                this.bgmClipFailures = 0;
                this.bgmClipRetryAt = 0;
                if (autoPlay) this._playBgmClip();
            } else {
                // Keep the request in flight while trying the remote fallback.
                onMissing(err || new Error(`BGM clip missing: ${resourcePath}`));
            }
        });
    }

    isSfxReady(name: SfxName): boolean {
        return !!this._getCachedSfxClip(name);
    }

    warmupBgmAfterInteraction(delayMs: number = 0) {
        if (!this.bgmEnabled || !this.bgmSrc || this._getCachedBgmClip() || this.bgmWarmupTimer || this.bgmLoadState === 'loading') {
            return;
        }
        this.bgmWarmupTimer = setTimeout(() => {
            this.bgmWarmupTimer = null;
            this._ensureBgmLoaded(true);
        }, Math.max(0, delayMs));
    }

    playBgm(resourcePath: string = AUDIO_BGM_RESOURCE_PATH, volume: number = AUDIO_BGM_VOLUME) {
        this._clearBgmWarmupTimer();
        this._setBgmVolume(volume);
        this._setBgmResourcePath(resourcePath);
        this.bgmAutoplayRequested = true;
        this.ensureBgmPlaying('play-bgm');
    }

    playHomeBgm() {
        this.playBgm(AUDIO_HOME_BGM_RESOURCE_PATH, AUDIO_HOME_BGM_VOLUME);
    }

    playGameBgm() {
        this.playBgm(AUDIO_GAME_BGM_RESOURCE_PATH, AUDIO_GAME_BGM_VOLUME);
    }

    ensureBgmPlaying(reason: string = 'ensure'): void {
        if (!this.bgmAutoplayRequested || !this.bgmEnabled || !this.bgmSrc) return;
        if (this.suspended || this.externalInterruptionRefs > 0) {
            this.logAudioLifecycle('defer-ensure-bgm', reason);
            return;
        }
        if (this.pendingBgmRestartAfterExternalInterruption) {
            this.restartBgmFromBeginning(reason);
            return;
        }
        this.logAudioLifecycle('ensure-bgm', reason);
        if (this._getCachedBgmClip()) {
            this._playBgmClip();
            return;
        }
        this._ensureBgmLoaded(true);
    }

    beginExternalInterruption(reason: string = 'external'): void {
        this.externalInterruptionRefs += 1;
        if (this.externalInterruptionRefs > 1) {
            this.logAudioLifecycle('begin-external-nested', reason);
            return;
        }
        this.pendingBgmRestartAfterExternalInterruption = false;
        this.bgmWasPlayingBeforeExternalInterruption = !!this.bgmSrc?.playing || this.bgmAutoplayRequested;
        this.stopSfx();
        this.bgmSrc?.pause();
        this.logAudioLifecycle('begin-external', reason);
    }

    endExternalInterruption(reason: string = 'external'): void {
        this.finishExternalInterruption(reason, false);
    }

    endExternalInterruptionWithBgmRestart(reason: string = 'external'): void {
        this.finishExternalInterruption(reason, true);
    }

    private finishExternalInterruption(reason: string, restartBgm: boolean): void {
        if (this.externalInterruptionRefs > 0) {
            this.externalInterruptionRefs -= 1;
        }
        if (this.externalInterruptionRefs > 0) {
            this.logAudioLifecycle('end-external-nested', reason);
            return;
        }
        const shouldResume = this.bgmWasPlayingBeforeExternalInterruption || this.bgmAutoplayRequested;
        this.bgmWasPlayingBeforeExternalInterruption = false;
        this.logAudioLifecycle(restartBgm ? 'end-external-restart' : 'end-external', reason);
        if (shouldResume) {
            if (restartBgm) {
                this.restartBgmFromBeginning(`external:${reason}`);
            } else {
                this.ensureBgmPlaying(`external:${reason}`);
            }
        } else if (restartBgm) {
            this.pendingBgmRestartAfterExternalInterruption = false;
        }
    }

    private restartBgmFromBeginning(reason: string = 'restart'): void {
        if (!this.bgmAutoplayRequested || !this.bgmEnabled || !this.bgmSrc) {
            this.pendingBgmRestartAfterExternalInterruption = false;
            return;
        }
        if (this.suspended || this.externalInterruptionRefs > 0) {
            this.pendingBgmRestartAfterExternalInterruption = true;
            this.logAudioLifecycle('defer-restart-bgm', reason);
            return;
        }
        this.pendingBgmRestartAfterExternalInterruption = false;
        this.logAudioLifecycle('restart-bgm', reason);
        if (this._getCachedBgmClip()) {
            this._restartBgmClip();
            return;
        }
        this._ensureBgmLoaded(true);
    }

    preload(name: SfxName, onDone?: (error?: Error) => void) {
        if (this._getCachedSfxClip(name)) {
            onDone?.();
            return;
        }
        if (onDone) {
            const resourcePath = AUDIO_SFX_RESOURCE_PATH[name];
            const callbacks = this.sfxLoadCallbacks.get(resourcePath) || [];
            let settled = false;
            const finish = (error?: Error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                const index = callbacks.indexOf(finish);
                if (index >= 0) callbacks.splice(index, 1);
                if (!callbacks.length && this.sfxLoadCallbacks.get(resourcePath) === callbacks) {
                    this.sfxLoadCallbacks.delete(resourcePath);
                }
                onDone(error);
            };
            const timeout = setTimeout(() => finish(new Error(`[Audio] SFX preload timed out: ${name}`)), 5000);
            callbacks.push(finish);
            this.sfxLoadCallbacks.set(resourcePath, callbacks);
        }
        this._ensureSfxLoaded(name);
    }

    play(name: SfxName) {
        this._retryRequestedBgmPlayback();
        if (this.suspended || !this.sfxEnabled || !this.audioRoot?.isValid || !this._isSfxAllowedInCurrentScene(name)) return;
        if (this.busySfxSources.size + this._pendingSfxCount() >= this._sfxChannelLimit()) return;
        const clip = this._getCachedSfxClip(name);
        if (clip) {
            this._playLoadedClip(name, clip);
            return;
        }
        this.pendingAutoplaySfx.set(name, (this.pendingAutoplaySfx.get(name) || 0) + 1);
        this._ensureSfxLoaded(name);
    }

    playGuideVoice(name: GuideVoiceName, isCurrent?: () => boolean): void {
        this.playVoice(name, 'guide', { maxDelayMs: 5000, isCurrent });
    }

    /** Prepare only this level's guide players, without playing or waiting for them. */
    prepareGuideVoices(names: readonly GuideVoiceName[] = ['guideA1', 'guideA2']): void {
        this.releasePreparedGuideVoices();
        if (!this.canPlayVoice() || !this.audioRoot?.isValid) return;
        const generation = this.guideVoicePreparationGeneration;
        for (const name of names) {
            this.pendingGuideVoicePreparations.add(name);
            this.preload(name, (error) => {
                if (generation !== this.guideVoicePreparationGeneration
                    || !this.pendingGuideVoicePreparations.delete(name)) return;
                if (!this.canPlayVoice()) return;
                const clip = this._getCachedSfxClip(name);
                if (error || !clip || !this.audioRoot?.isValid) {
                    console.error('[Audio] Guide voice preparation failed:', name, error);
                    return;
                }
                try {
                    this.preparedGuideVoices.set(name, this.createVoiceSource(name, clip));
                } catch (error) {
                    console.error('[Audio] Guide player preparation failed:', name, error);
                }
            });
        }
    }

    releasePreparedGuideVoices(): void {
        this.guideVoicePreparationGeneration += 1;
        this.pendingGuideVoicePreparations.clear();
        for (const source of this.preparedGuideVoices.values()) this.destroyVoiceSource(source);
        this.preparedGuideVoices.clear();
    }

    private createVoiceSource(name: SfxName, clip: AudioClip): AudioSource {
        const node = new Node('NarratorVoice');
        this.audioRoot!.addChild(node);
        try {
            const source = node.addComponent(AudioSource);
            source.playOnAwake = false;
            source.loop = false;
            source.volume = AUDIO_SFX_VOLUME[name];
            // Setting clip starts Cocos player preparation; play() is reserved for the actual cue.
            source.clip = clip;
            return source;
        } catch (error) {
            node.destroy();
            throw error;
        }
    }

    getVoiceCancellationVersion(): number { return this.voiceCancellationVersion; }

    canPlayVoice(): boolean {
        return this.voiceEnabled && !this.suspended && this.externalInterruptionRefs === 0;
    }

    private isVoiceContextCurrent(): boolean {
        const options = this.activeVoiceOptions;
        const guard = this.activeVoiceStarted && options?.finishSentence
            ? options.canContinue : options?.isCurrent;
        return !guard || guard();
    }

    updateVoicePlayback(): void {
        if (this.queuedResultVoice?.options.isCurrent && !this.queuedResultVoice.options.isCurrent()) {
            this.queuedResultVoice = null;
        }
        if (this.activeVoiceKind && (!this.canPlayVoice() || !this.isVoiceContextCurrent())) this.stopVoice();
    }

    cancelPendingResultVoice(): void {
        this.queuedResultVoice = null;
        if (this.activeVoiceKind === 'result' && !this.activeVoiceStarted) this.stopVoice('result');
    }

    playVoice(name: SfxName, kind: VoiceKind, options: VoicePlaybackOptions = {}): boolean {
        if (!this.canPlayVoice() || (options.isCurrent && !options.isCurrent())) return false;
        if (this.activeVoiceStarted && this.activeVoiceOptions?.finishSentence) {
            if (kind !== 'result') return false;
            this.queuedResultVoice = { name, options };
            return true;
        }
        if (this.activeVoiceKind && VOICE_PRIORITY[this.activeVoiceKind] > VOICE_PRIORITY[kind]) return false;
        this.clearVoiceSource();
        this.pendingGuideVoicePreparations.delete(name);
        this.activeVoiceKind = kind;
        this.activeVoiceOptions = options;
        const generation = this.guideVoiceGeneration;
        const expiresAt = Date.now() + (options.maxDelayMs ?? 1200);
        const expire = () => {
            if (generation !== this.guideVoiceGeneration) return;
            console.error('[Audio] Voice startup timed out:', name);
            this.clearVoiceSource();
        };
        this.voiceLoadTimer = setTimeout(expire, options.maxDelayMs ?? 1200);
        this.preload(name, (error) => {
            if (generation !== this.guideVoiceGeneration) return;
            if (error) {
                this.clearVoiceSource();
                console.error('[Audio] Voice load failed:', name, error);
                return;
            }
            if (Date.now() >= expiresAt) { expire(); return; }
            if (!this.canPlayVoice() || (options.isCurrent && !options.isCurrent())) {
                this.clearVoiceSource();
                return;
            }
            const clip = this._getCachedSfxClip(name);
            if (!clip || !this.audioRoot?.isValid) {
                this.clearVoiceSource();
                console.error('[Audio] Voice is not ready:', name);
                return;
            }
            let source: AudioSource;
            try {
                source = this.preparedGuideVoices.get(name) || this.createVoiceSource(name, clip);
                this.preparedGuideVoices.delete(name);
            } catch (error) {
                this.clearVoiceSource();
                console.error('[Audio] Voice player preparation failed:', name, error);
                return;
            }
            const node = source.node;
            this.guideVoiceSource = source;
            let started = false;
            node.on(AudioSource.EventType.STARTED, () => {
                if (generation !== this.guideVoiceGeneration || this.guideVoiceSource !== source || started) return;
                if (Date.now() >= expiresAt) { expire(); return; }
                if (!this.canPlayVoice() || (options.isCurrent && !options.isCurrent())) {
                    this.clearVoiceSource();
                    return;
                }
                started = true;
                this.activeVoiceStarted = true;
                if (this.voiceLoadTimer !== null) clearTimeout(this.voiceLoadTimer);
                this.voiceLoadTimer = null;
                options.onStarted?.();
            });
            node.on(AudioSource.EventType.ENDED, () => {
                if (generation !== this.guideVoiceGeneration || this.guideVoiceSource !== source) return;
                const completed = started && this.canPlayVoice() && this.isVoiceContextCurrent();
                const queued = completed ? this.queuedResultVoice : null;
                const cancellationVersion = this.voiceCancellationVersion;
                this.clearVoiceSource();
                if (completed) options.onCompleted?.();
                if (queued && cancellationVersion === this.voiceCancellationVersion && !this.activeVoiceKind) {
                    this.playVoice(queued.name, 'result', queued.options);
                }
            });
            try {
                source.play();
            } catch (error) {
                if (generation === this.guideVoiceGeneration) this.clearVoiceSource();
                console.error('[Audio] Voice playback failed:', name, error);
                return;
            }
        });
        return true;
    }

    stopGuideVoice(): void {
        if (this.activeVoiceKind === 'guide') this.clearVoiceSource();
    }

    stopVoice(kind?: VoiceKind): void {
        if (!kind || kind === 'result') this.queuedResultVoice = null;
        if (!kind || kind === 'guide') this.releasePreparedGuideVoices();
        if (kind && this.activeVoiceKind !== kind) return;
        this.voiceCancellationVersion += 1;
        this.clearVoiceSource();
    }

    private clearVoiceSource(): void {
        if (this.voiceLoadTimer !== null) clearTimeout(this.voiceLoadTimer);
        this.voiceLoadTimer = null;
        this.guideVoiceGeneration += 1;
        this.activeVoiceKind = null;
        this.activeVoiceStarted = false;
        this.activeVoiceOptions = null;
        this.queuedResultVoice = null;
        const source = this.guideVoiceSource;
        this.guideVoiceSource = null;
        this.destroyVoiceSource(source);
    }

    private destroyVoiceSource(source: AudioSource | null): void {
        if (!source?.isValid) return;
        source.stop();
        source.clip = null;
        source.node.destroy();
    }

    stopSfx(): void {
        this.stopVoice();
        this.stopEffectSources();
    }

    stopEffectSources(): void {
        this.pendingAutoplaySfx.clear();
        for (const source of this.sfxStartTimers.keys()) this._discardSfxSource(source);
        for (const source of this.sfxSources) {
            if (!source?.isValid) continue;
            try {
                source.stop();
            } catch (_) { /* ignore */ }
        }
        this.busySfxSources.clear();
        this._trimIdleSfxSources();
    }

    /** 触发轻震动（Web 最多 12ms），用于点击/放置等触觉反馈 */
    legacyVibrate(ms: number = 12) {
        if (this.suspended || !this.vibrateEnabled) return;
        try {
            // 微信小游戏
            if (typeof wx !== 'undefined' && typeof wx.vibrateShort === 'function') {
                wx.vibrateShort({ type: 'light' });
                return;
            }
            // 抖音小游戏
            const tt = getDouyinMiniGameRuntime();
            if (tt && typeof tt.vibrateShort === 'function') {
                tt.vibrateShort({});
                return;
            }
            // Web
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(Math.min(ms, 12));
            }
        } catch (_) { /* ignore */ }
    }

    private triggerVibratePattern() {
        if (this.suspended || !this.vibrateEnabled) return;
        try {
            if (typeof wx !== 'undefined' && typeof wx.vibrateShort === 'function') {
                wx.vibrateShort({ type: 'light' });
                return;
            }
            const tt = getDouyinMiniGameRuntime();
            if (tt && typeof tt.vibrateShort === 'function') {
                tt.vibrateShort({});
                return;
            }
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(12);
            }
        } catch (_) { /* ignore */ }
    }

    vibrateSelect() {
        this.triggerVibratePattern();
    }

    vibratePlace() {
        this.triggerVibratePattern();
    }

    vibrate(_ms: number = 12) {
        this.triggerVibratePattern();
    }

    isSfxEnabled() { return this.sfxEnabled; }
    isVoiceEnabled() { return this.voiceEnabled; }
    isBgmEnabled() { return this.bgmEnabled; }
    isVibrateEnabled() { return this.vibrateEnabled; }

    setSfxEnabled(on: boolean) {
        this.sfxEnabled = on;
        sys.localStorage.setItem(LS_SFX, on ? '1' : '0');
        if (!on) this.stopEffectSources();
    }
    setVoiceEnabled(on: boolean) {
        this.voiceEnabled = on;
        sys.localStorage.setItem(LS_VOICE, on ? '1' : '0');
        if (!on) this.stopVoice();
    }
    setBgmEnabled(on: boolean) {
        this.bgmEnabled = on;
        sys.localStorage.setItem(LS_BGM, on ? '1' : '0');
        if (!this.bgmSrc) return;
        if (on) {
            this.bgmAutoplayRequested = true;
            this.ensureBgmPlaying('setting-on');
        } else {
            this.pendingBgmRestartAfterExternalInterruption = false;
            this.stopUnexpectedLoopSources();
            this.bgmSrc.stop();
        }
    }
    setVibrateEnabled(on: boolean) {
        this.vibrateEnabled = on;
        sys.localStorage.setItem(LS_VIB, on ? '1' : '0');
    }

    suspendForBackground() {
        if (this.suspended) return;
        this.suspended = true;
        this.bgmWasPlayingBeforeSuspend = !!this.bgmSrc?.playing || this.bgmAutoplayRequested;
        this.stopSfx();
        this.bgmSrc?.pause();
        this.logAudioLifecycle('suspend-background', 'game-hide');
    }

    resumeFromBackground() {
        if (!this.suspended) return;
        this.suspended = false;
        const shouldResume = this.bgmWasPlayingBeforeSuspend || this.bgmAutoplayRequested;
        if (shouldResume) {
            if (this.pendingBgmRestartAfterExternalInterruption) {
                this.restartBgmFromBeginning('game-show');
            } else {
                this.ensureBgmPlaying('game-show');
            }
        }
        this.bgmWasPlayingBeforeSuspend = false;
    }

    getBgmDebugState(): Record<string, unknown> {
        const liveRootSources = this.audioRoot?.isValid
            ? this.audioRoot.getComponents(AudioSource).filter((source) => isValid(source, true))
            : [];
        return {
            enabled: this.bgmEnabled,
            autoplayRequested: this.bgmAutoplayRequested,
            suspended: this.suspended,
            externalInterruptionRefs: this.externalInterruptionRefs,
            loadState: this.bgmLoadState,
            resourcePath: this.bgmResourcePath,
            hasClip: !!this.bgmClip,
            hasSource: !!this.bgmSrc?.isValid,
            playing: !!this.bgmSrc?.playing,
            hostValid: !!this.host?.isValid,
            audioRootValid: !!this.audioRoot?.isValid,
            liveRootAudioSourceCount: liveRootSources.length,
            playingLoopSourceCount: liveRootSources.filter((source) => source.loop && source.playing).length,
        };
    }

    private logAudioLifecycle(event: string, reason: string): void {
        runtimeLog('[AudioLifecycle]', event, {
            reason,
            bgmEnabled: this.bgmEnabled,
            autoplayRequested: this.bgmAutoplayRequested,
            suspended: this.suspended,
            externalInterruptionRefs: this.externalInterruptionRefs,
            loadState: this.bgmLoadState,
            hasClip: !!this.bgmClip,
            playing: !!this.bgmSrc?.playing,
            resourcePath: this.bgmResourcePath,
            hostValid: !!this.host?.isValid,
        });
    }
}
