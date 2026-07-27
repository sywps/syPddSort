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
} from './AudioManifest';
import { GAME_ASSETS_BUNDLE_NAME, LOCAL_BOOTSTRAP_BUNDLE_NAME } from './PackageNames';
import { runtimeLog } from './RuntimeLog';
const { ccclass } = _decorator;
declare const wx: any;

export type { SfxName } from './AudioManifest';

type Bundle = AssetManager.Bundle;

const LS_SFX = 'pdd.setting.sfx';
const LS_BGM = 'pdd.setting.bgm';
const LS_VIB = 'pdd.setting.vib';
const SFX_CHANNEL_COUNT = 8;

const BOOTSTRAP_SFX_NAME_SET = new Set<SfxName>(AUDIO_BOOTSTRAP_SFX_NAMES);

@ccclass('AudioMgr')
export class AudioMgr {
    private static _inst: AudioMgr | null = null;
    static get inst(): AudioMgr {
        if (!AudioMgr._inst) AudioMgr._inst = new AudioMgr();
        return AudioMgr._inst;
    }

    private sfxClips: Map<SfxName, AudioClip> = new Map();
    private bgmClip: AudioClip | null = null;
    private host: Node | null = null;
    private audioRoot: Node | null = null;
    private sfxSources: AudioSource[] = [];
    private busySfxSources: Set<AudioSource> = new Set();
    private sfxSourceCursor = 0;
    private bgmSrc: AudioSource | null = null;
    private gameAssetsBundle: Bundle | null = null;
    private bootstrapBundle: Bundle | null = null;
    private sfxEnabled = true;
    private bgmEnabled = true;
    private vibrateEnabled = true;
    private suspended = false;
    private bgmWasPlayingBeforeSuspend = false;
    private externalInterruptionRefs = 0;
    private bgmWasPlayingBeforeExternalInterruption = false;
    private pendingSfxLoads: Set<SfxName> = new Set();
    private pendingAutoplaySfx: Set<SfxName> = new Set();
    private deferredBootstrapSfxLoads: Set<SfxName> = new Set();
    private deferredSfxLoads: Set<SfxName> = new Set();
    private gameAssetsBundleCallbacks: Array<(bundle: Bundle | null) => void> | null = null;
    private bootstrapBundleCallbacks: Array<(bundle: Bundle | null) => void> | null = null;
    private bootstrapBundleState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private preferRemoteAudio = false;
    private gameAssetsBundleState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private bgmLoadState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private bgmAutoplayRequested = false;
    private bgmWarmupTimer: any = null;
    private bgmResourcePath = AUDIO_BGM_RESOURCE_PATH;
    private bgmVolume = AUDIO_BGM_VOLUME;
    private bgmLoadToken = 0;
    private pendingBgmRestartAfterExternalInterruption = false;

    private constructor() {
        // 从本地存储加载设置（默认开启）
        this.sfxEnabled = sys.localStorage.getItem(LS_SFX) !== '0';
        this.bgmEnabled = sys.localStorage.getItem(LS_BGM) !== '0';
        this.vibrateEnabled = sys.localStorage.getItem(LS_VIB) !== '0';
    }

    /** 在游戏启动时调用；内部会把 AudioSource 迁到持久 AudioRoot，避免场景切换销毁 BGM。 */
    init(host: Node) {
        if (!host?.isValid) return;
        const audioHost = this.getOrCreateAudioRoot(host);
        if (this.host === audioHost
            && this.host?.isValid
            && this.hasExactAudioSourceLayout(audioHost)) return;
        this.disposeAudioSources(audioHost);
        this.host = audioHost;
        for (let i = 0; i < SFX_CHANNEL_COUNT; i++) {
            const source = audioHost.addComponent(AudioSource);
            source.playOnAwake = false;
            source.loop = false;
            this.sfxSources.push(source);
        }
        audioHost.on(AudioSource.EventType.ENDED, this._handleSfxSourceEnded, this);
        this.bgmSrc = audioHost.addComponent(AudioSource);
        this.bgmSrc.playOnAwake = false;
        this.bgmSrc.loop = true;
        this.bgmSrc.volume = this.bgmVolume;
        this.preferRemoteAudio = this._isMinigameEnv();
        if (this.bgmAutoplayRequested) {
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

    private hasExactAudioSourceLayout(audioHost: Node): boolean {
        if (this.sfxSources.length !== SFX_CHANNEL_COUNT || !isValid(this.bgmSrc, true)) {
            return false;
        }
        const trackedSources = [...this.sfxSources, this.bgmSrc];
        if (trackedSources.some((source) => !isValid(source, true))) {
            return false;
        }
        const trackedSourceSet = new Set(trackedSources);
        if (trackedSourceSet.size !== SFX_CHANNEL_COUNT + 1) {
            return false;
        }
        const liveRootSources = audioHost.getComponents(AudioSource).filter((source) => isValid(source, true));
        return liveRootSources.length === SFX_CHANNEL_COUNT + 1
            && liveRootSources.every((source) => trackedSourceSet.has(source));
    }

    private disposeAudioSources(audioHost: Node): void {
        audioHost.off(AudioSource.EventType.ENDED, this._handleSfxSourceEnded, this);
        this.pendingAutoplaySfx.clear();
        this.busySfxSources.clear();
        this.sfxSourceCursor = 0;
        for (const source of audioHost.getComponents(AudioSource)) {
            if (!isValid(source, true)) continue;
            try {
                source.stop();
            } catch (_) { /* ignore */ }
            try {
                source.clip = null;
            } catch (_) { /* ignore */ }
            try {
                source.destroy();
            } catch (_) { /* ignore */ }
        }
        this.sfxSources = [];
        this.bgmSrc = null;
    }

    private _handleSfxSourceEnded(source: AudioSource) {
        this.busySfxSources.delete(source);
    }

    private _acquireSfxSource(): AudioSource | null {
        const sources = this.sfxSources.filter((source) => source?.isValid);
        if (sources.length === 0) return null;
        for (let offset = 0; offset < sources.length; offset++) {
            const index = (this.sfxSourceCursor + offset) % sources.length;
            const source = sources[index];
            if (this.busySfxSources.has(source)) continue;
            this.sfxSourceCursor = (index + 1) % sources.length;
            return source;
        }
        const index = this.sfxSourceCursor % sources.length;
        const source = sources[index];
        this.sfxSourceCursor = (index + 1) % sources.length;
        this.busySfxSources.delete(source);
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
        if (this.bootstrapBundleState === 'ready') {
            if (onReady) onReady(this.bootstrapBundle);
            return;
        }
        if (this.bootstrapBundleState === 'failed') {
            if (onReady) onReady(null);
            return;
        }
        if (this.bootstrapBundleState === 'loading') {
            if (onReady) {
                if (!this.bootstrapBundleCallbacks) this.bootstrapBundleCallbacks = [];
                this.bootstrapBundleCallbacks.push(onReady);
            }
            return;
        }
        this.bootstrapBundleCallbacks = onReady ? [onReady] : [];
        this.bootstrapBundleState = 'loading';
        assetManager.loadBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME, (err, bundle) => {
            const callbacks = this.bootstrapBundleCallbacks || [];
            this.bootstrapBundleCallbacks = null;
            if (err || !bundle) {
                this.bootstrapBundleState = 'failed';
                console.warn('[Audio] loadBundle bootstrap 失败，继续等待 remote:', err?.message);
                this._flushDeferredBootstrapSfxLoads();
                callbacks.forEach((callback) => callback(null));
                return;
            }
            this.bootstrapBundleState = 'ready';
            this.bootstrapBundle = bundle;
            this._flushDeferredBootstrapSfxLoads();
            callbacks.forEach((callback) => callback(bundle));
        });
    }

    private _loadFromGameAssetsBundleAuto(onReady?: (bundle: Bundle | null) => void) {
        if (this.gameAssetsBundleState === 'ready') {
            if (onReady) onReady(this.gameAssetsBundle);
            return;
        }
        if (this.gameAssetsBundleState === 'failed') {
            if (onReady) onReady(null);
            return;
        }
        if (this.gameAssetsBundleState === 'loading') {
            if (onReady) {
                if (!this.gameAssetsBundleCallbacks) this.gameAssetsBundleCallbacks = [];
                this.gameAssetsBundleCallbacks.push(onReady);
            }
            return;
        }
        this.gameAssetsBundleCallbacks = onReady ? [onReady] : [];
        this.gameAssetsBundleState = 'loading';
        assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
            const callbacks = this.gameAssetsBundleCallbacks || [];
            this.gameAssetsBundleCallbacks = null;
            if (err || !bundle) {
                this.gameAssetsBundleState = 'failed';
                console.warn(`[Audio] loadBundle ${GAME_ASSETS_BUNDLE_NAME} 失败:`, err?.message);
                this._flushDeferredSfxLoads();
                callbacks.forEach((callback) => callback(null));
                return;
            }
            this.gameAssetsBundleState = 'ready';
            this.gameAssetsBundle = bundle;
            this._flushDeferredSfxLoads();
            callbacks.forEach((callback) => callback(bundle));
        });
    }

    private _flushDeferredBootstrapSfxLoads() {
        if (this.deferredBootstrapSfxLoads.size === 0) {
            return;
        }
        const pendingNames = Array.from(this.deferredBootstrapSfxLoads);
        this.deferredBootstrapSfxLoads.clear();
        for (const name of pendingNames) {
            const clip = this.sfxClips.get(name);
            if (clip) {
                if (this.pendingAutoplaySfx.delete(name)) {
                    this._playLoadedClip(name, clip);
                }
                continue;
            }
            this._ensureSfxLoaded(name);
        }
    }

    private _flushDeferredSfxLoads() {
        if (this.deferredSfxLoads.size === 0) {
            return;
        }
        const pendingNames = Array.from(this.deferredSfxLoads);
        this.deferredSfxLoads.clear();
        for (const name of pendingNames) {
            const clip = this.sfxClips.get(name);
            if (clip) {
                if (this.pendingAutoplaySfx.delete(name)) {
                    this._playLoadedClip(name, clip);
                }
                continue;
            }
            this._ensureSfxLoaded(name);
        }
    }

    private _loadSingleSfxFromBundle(bundle: Bundle, name: SfxName, onDone: (clip: AudioClip | null) => void, logMissing: boolean = true) {
        const resourcePath = AUDIO_SFX_RESOURCE_PATH[name];
        bundle.load(resourcePath, AudioClip, (err, clip) => {
            if (!err && clip) {
                this.sfxClips.set(name, clip);
                onDone(clip);
                return;
            }
            if (err && logMissing) {
                console.warn(`[Audio] SFX 加载失败: ${name} (${resourcePath}), err=${err.message}`);
            }
            onDone(null);
        });
    }

    private _playLoadedClip(name: SfxName, clip: AudioClip) {
        if (this.suspended || !this.sfxEnabled) return;
        const source = this._acquireSfxSource();
        if (!source) return;
        try {
            const baseVolume = AUDIO_SFX_VOLUME[name] ?? 0.7;
            const variance = AUDIO_SFX_VOLUME_VARIANCE[name] ?? 0;
            const jitter = variance > 0 ? (Math.random() * 2 - 1) * variance : 0;
            const volume = Math.max(0, Math.min(1, baseVolume * (1 + jitter)));
            source.stop();
            source.playOnAwake = false;
            source.loop = false;
            source.clip = clip;
            source.volume = volume;
            this.busySfxSources.add(source);
            source.play();
        } catch (e) {
            this.busySfxSources.delete(source);
            // WeChat innerAudioContext may throw if audio not ready
        }
    }

    private _ensureSfxLoaded(name: SfxName) {
        if (this.sfxClips.has(name) || this.pendingSfxLoads.has(name)) {
            return;
        }
        if (this.preferRemoteAudio && BOOTSTRAP_SFX_NAME_SET.has(name) && !this.bootstrapBundle && this.bootstrapBundleState !== 'failed') {
            this.deferredBootstrapSfxLoads.add(name);
            if (this.bootstrapBundleState === 'idle') {
                this._loadFromBootstrapBundleAuto();
            }
            return;
        }
        if (this.bootstrapBundle && BOOTSTRAP_SFX_NAME_SET.has(name)) {
            this.pendingSfxLoads.add(name);
            const finish = (clip: AudioClip | null) => {
                this.pendingSfxLoads.delete(name);
                if (clip && this.pendingAutoplaySfx.delete(name)) {
                    this._playLoadedClip(name, clip);
                    return;
                }
                this.pendingAutoplaySfx.delete(name);
            };
            this._loadSingleSfxFromBundle(this.bootstrapBundle, name, (clip) => {
                if (clip) {
                    finish(clip);
                    return;
                }
                this._loadFromGameAssetsBundleAuto((bundle) => {
                    if (!bundle) {
                        finish(null);
                        return;
                    }
                    this._loadSingleSfxFromBundle(bundle, name, finish);
                });
            }, false);
            return;
        }
        if (!this.gameAssetsBundle) {
            if (this.gameAssetsBundleState === 'failed') {
                console.warn(`[Audio] gameAssets bundle unavailable, skip SFX: ${name}`);
                this.pendingAutoplaySfx.delete(name);
                return;
            }
            this.deferredSfxLoads.add(name);
            if (this.gameAssetsBundleState === 'idle') {
                this._loadFromGameAssetsBundleAuto();
            }
            return;
        }
        this.pendingSfxLoads.add(name);
        const finish = (clip: AudioClip | null) => {
            this.pendingSfxLoads.delete(name);
            if (clip && this.pendingAutoplaySfx.delete(name)) {
                this._playLoadedClip(name, clip);
                return;
            }
            this.pendingAutoplaySfx.delete(name);
        };
        if (this.gameAssetsBundle) {
            this._loadSingleSfxFromBundle(this.gameAssetsBundle, name, finish);
            return;
        }
        finish(null);
    }

    private _playBgmClip() {
        if (!this.bgmEnabled || this.suspended || this.externalInterruptionRefs > 0 || !this.bgmSrc || !this.bgmClip) {
            return;
        }
        this.stopUnexpectedLoopSources();
        try {
            this.bgmSrc.clip = this.bgmClip;
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
        for (const source of this.audioRoot.getComponents(AudioSource)) {
            if (source === this.bgmSrc || !isValid(source, true) || !source.loop) continue;
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
        this.bgmClip = null;
        this.bgmLoadState = 'idle';
        this.bgmLoadToken += 1;
        if (this.bgmSrc?.isValid) {
            try {
                this.bgmSrc.stop();
                this.bgmSrc.clip = null;
            } catch (_) { /* ignore */ }
        }
    }

    private _retryRequestedBgmPlayback() {
        if (!this.bgmAutoplayRequested || !this.bgmEnabled || this.suspended || this.externalInterruptionRefs > 0 || !this.bgmSrc) {
            return;
        }
        if (this.bgmClip) {
            this._playBgmClip();
            return;
        }
        if (this.bgmLoadState === 'idle') {
            this._ensureBgmLoaded(true);
        }
    }

    private _ensureBgmLoaded(autoPlay: boolean = true) {
        if (!this.bgmEnabled || !this.bgmSrc) {
            return;
        }
        if (autoPlay) this.bgmAutoplayRequested = true;
        if (this.bgmClip) {
            if (autoPlay) this._playBgmClip();
            return;
        }
        if (this.bgmLoadState === 'loading') {
            return;
        }
        this.bgmLoadState = 'loading';
        const resourcePath = this.bgmResourcePath;
        const loadToken = this.bgmLoadToken;
        const loadFromGameAssets = () => {
            this._loadFromGameAssetsBundleAuto((bundle) => {
                if (loadToken !== this.bgmLoadToken || resourcePath !== this.bgmResourcePath) return;
                if (bundle) {
                    this._loadBgm(bundle, resourcePath, this.bgmAutoplayRequested, loadToken);
                    return;
                }
                this.bgmLoadState = 'failed';
            });
        };
        if (this.bootstrapBundleState !== 'failed') {
            this._loadFromBootstrapBundleAuto((bundle) => {
                if (loadToken !== this.bgmLoadToken || resourcePath !== this.bgmResourcePath) return;
                if (bundle) {
                    this._loadBgm(bundle, resourcePath, this.bgmAutoplayRequested, loadToken, loadFromGameAssets);
                    return;
                }
                loadFromGameAssets();
            });
            return;
        }
        loadFromGameAssets();
    }

    private _loadBgm(
        bundle: Bundle,
        resourcePath: string,
        autoPlay: boolean = true,
        loadToken: number = this.bgmLoadToken,
        onMissing?: () => void,
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
            if (!err && clip) {
                this.bgmClip = clip;
                this.bgmLoadState = 'ready';
                if (autoPlay) this._playBgmClip();
            } else {
                if (onMissing) {
                    this.bgmLoadState = 'idle';
                    onMissing();
                    return;
                }
                this.bgmLoadState = 'failed';
                console.warn(`[Audio] BGM 加载失败: ${resourcePath}`, err?.message);
            }
        });
    }

    preloadGameplayAudioSet(): void {
        this._setBgmVolume(AUDIO_GAME_BGM_VOLUME);
        this._setBgmResourcePath(AUDIO_GAME_BGM_RESOURCE_PATH);
        this._ensureBgmLoaded(false);
        for (const name of AUDIO_BOOTSTRAP_SFX_NAMES) {
            this.preload(name);
        }
    }

    warmupBgmAfterInteraction(delayMs: number = 0) {
        if (!this.bgmEnabled || !this.bgmSrc || this.bgmClip || this.bgmWarmupTimer || this.bgmLoadState === 'loading') {
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
        if (this.bgmClip) {
            this._playBgmClip();
            return;
        }
        if (this.bgmLoadState === 'failed') {
            this.bgmLoadState = 'idle';
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
        if (this.bgmClip) {
            this._restartBgmClip();
            return;
        }
        if (this.bgmLoadState === 'failed') {
            this.bgmLoadState = 'idle';
        }
        this._ensureBgmLoaded(true);
    }

    preload(name: SfxName) {
        if (this.sfxClips.has(name)) return;
        this._ensureSfxLoaded(name);
    }

    play(name: SfxName) {
        this._retryRequestedBgmPlayback();
        if (this.suspended || !this.sfxEnabled || this.sfxSources.length === 0) return;
        const clip = this.sfxClips.get(name);
        if (clip) {
            this._playLoadedClip(name, clip);
            return;
        }
        this.pendingAutoplaySfx.add(name);
        this._ensureSfxLoaded(name);
    }

    stopSfx(): void {
        this.pendingAutoplaySfx.clear();
        for (const source of this.sfxSources) {
            if (!source?.isValid) continue;
            try {
                source.stop();
            } catch (_) { /* ignore */ }
        }
        this.busySfxSources.clear();
    }

    /** 触发短震动（默认 30ms），用于点击/放置等触觉反馈 */
    legacyVibrate(ms: number = 30) {
        if (this.suspended || !this.vibrateEnabled) return;
        try {
            // 微信小游戏
            if (typeof wx !== 'undefined' && typeof wx.vibrateShort === 'function') {
                wx.vibrateShort({});
                return;
            }
            // 抖音小游戏
            const w: any = typeof window !== 'undefined' ? window : null;
            if (w && w.tt && typeof w.tt.vibrateShort === 'function') {
                w.tt.vibrateShort({});
                return;
            }
            // Web
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(ms);
            }
        } catch (_) { /* ignore */ }
    }

    private triggerVibratePattern(kind: 'select' | 'place') {
        if (this.suspended || !this.vibrateEnabled) return;
        try {
            if (typeof wx !== 'undefined' && typeof wx.vibrateShort === 'function') {
                const option: any = kind === 'select' ? { type: 'medium' } : { type: 'light' };
                try {
                    wx.vibrateShort(option);
                } catch (_) {
                    wx.vibrateShort({});
                }
                return;
            }
            const w: any = typeof window !== 'undefined' ? window : null;
            if (w && w.tt && typeof w.tt.vibrateShort === 'function') {
                w.tt.vibrateShort({});
                return;
            }
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(kind === 'select' ? 24 : 12);
            }
        } catch (_) { /* ignore */ }
    }

    vibrateSelect() {
        this.triggerVibratePattern('select');
    }

    vibratePlace() {
        this.triggerVibratePattern('place');
    }

    vibrate(ms: number = 30) {
        this.triggerVibratePattern(ms <= 20 ? 'select' : 'place');
    }

    isSfxEnabled() { return this.sfxEnabled; }
    isBgmEnabled() { return this.bgmEnabled; }
    isVibrateEnabled() { return this.vibrateEnabled; }

    setSfxEnabled(on: boolean) {
        this.sfxEnabled = on;
        sys.localStorage.setItem(LS_SFX, on ? '1' : '0');
        if (!on) this.stopSfx();
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
