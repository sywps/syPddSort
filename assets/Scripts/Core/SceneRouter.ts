import { assetManager, director, SceneAsset, type AssetManager } from 'cc';
import { AppSession, type AppSceneName } from './AppSession';
import {
    HOME_ASSETS_BUNDLE_NAME,
    LOCAL_BOOTSTRAP_BUNDLE_NAME,
    LOGICAL_GAME_ENTRY_BUNDLE_NAME,
    LOGICAL_HOME_BUNDLE_NAME,
} from './PackageNames';
import { debugPerfTrace } from './DebugPerfTrace';
import { runtimeLog } from './RuntimeLog';
import { markStartupTrace } from './StartupTrace';

function isSceneTraceEnabled(): boolean {
    try {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            return params.get('debug') === '1' || params.get('log') === '1' || !!params.get('ab');
        }
    } catch (_) { /* ignore */ }
    try {
        const wx = (globalThis as any).__rawWx || (globalThis as any).wx;
        const query = wx?.getLaunchOptionsSync?.()?.query;
        return query?.debug === '1' || query?.log === '1' || !!query?.ab;
    } catch (_) {
        return false;
    }
}

function logSceneTrace(...args: unknown[]): void {
    if (!isSceneTraceEnabled()) return;
    runtimeLog(...args);
}

export class SceneRouter {
    readonly bootSceneName: AppSceneName = 'Boot';
    readonly homeSceneName: AppSceneName = 'Home';
    readonly gameSceneName: AppSceneName = 'Game';
    private _transitioning = false;
    private _transitionTargetSceneName: AppSceneName | '' = '';
    private _transitionPromise: Promise<void> | null = null;
    private _homeScenePreloadPromise: Promise<void> | null = null;
    private _homeScenePreloaded = false;
    private _homeScenePreloadedAsset: SceneAsset | null = null;

    constructor(private readonly session: AppSession) {}

    get isTransitioning(): boolean {
        return this._transitioning;
    }

    attachCurrentScene(sceneName: AppSceneName): void {
        this.session.setCurrentSceneName(sceneName);
    }

    requestHomeScene(): void {
        this.session.requestScene(this.homeSceneName);
    }

    requestGameScene(): void {
        this.session.requestScene(this.gameSceneName);
    }

    logTransitionTrace(label: string, extra: Record<string, unknown> = {}): void {
        logSceneTrace(
            label,
            JSON.stringify({
                current: this.session.currentSceneName,
                requested: this.session.requestedSceneName,
                visualState: this.session.visualState,
                hasPendingGameplay: !!this.session.pendingGameplayRequest,
                hasActiveGameplay: !!this.session.activeGameplayContext,
                ...extra,
            }),
        );
    }

    async toBoot(): Promise<void> {
        await this.loadScene(this.bootSceneName);
    }

    async toHome(): Promise<void> {
        await this.waitForHomeScenePreloadIfNeeded();
        await this.loadBundledScene(this.homeSceneName, HOME_ASSETS_BUNDLE_NAME, LOGICAL_HOME_BUNDLE_NAME);
    }

    async toGame(): Promise<void> {
        await this.loadBundledScene(this.gameSceneName, LOCAL_BOOTSTRAP_BUNDLE_NAME, LOGICAL_GAME_ENTRY_BUNDLE_NAME);
    }

    async preloadHomeScene(source: string = 'runtime'): Promise<void> {
        if (this._homeScenePreloaded && this.isSceneAssetUsable(this._homeScenePreloadedAsset)) return;
        if (this._homeScenePreloaded && !this.isSceneAssetUsable(this._homeScenePreloadedAsset)) {
            this._homeScenePreloaded = false;
            this._homeScenePreloadedAsset = null;
        }
        if (this._homeScenePreloadPromise) {
            await this._homeScenePreloadPromise;
            return;
        }
        if (this._transitioning && this._transitionTargetSceneName === this.homeSceneName) {
            await (this._transitionPromise || Promise.resolve());
            return;
        }
        const startedAt = Date.now();
        debugPerfTrace('scene.home.preload.start', {
            source,
            current: this.session.currentSceneName,
            requested: this.session.requestedSceneName,
        });
        const preloadPromise = new Promise<void>((resolve, reject) => {
            const loadSceneFromBundle = (bundle: AssetManager.Bundle) => {
                bundle.loadScene(this.homeSceneName, (sceneErr: Error | null, sceneAsset: SceneAsset) => {
                    if (sceneErr || !sceneAsset) {
                        reject(new Error(`[SceneRouter] preload ${LOGICAL_HOME_BUNDLE_NAME}/${HOME_ASSETS_BUNDLE_NAME}/${this.homeSceneName} failed: ${sceneErr?.message || 'missing scene asset'}`));
                        return;
                    }
                    this._homeScenePreloadedAsset = sceneAsset;
                    resolve();
                });
            };
            const cachedBundle = this.session.getRoutedBundle(HOME_ASSETS_BUNDLE_NAME)
                || assetManager.getBundle(HOME_ASSETS_BUNDLE_NAME);
            if (cachedBundle) {
                loadSceneFromBundle(cachedBundle);
                return;
            }
            assetManager.loadBundle(HOME_ASSETS_BUNDLE_NAME, (bundleErr, bundle) => {
                if (bundleErr || !bundle) {
                    reject(new Error(`[SceneRouter] preload ${LOGICAL_HOME_BUNDLE_NAME}/${HOME_ASSETS_BUNDLE_NAME} failed: ${bundleErr?.message || 'missing bundle'}`));
                    return;
                }
                this.session.rememberRoutedBundle(HOME_ASSETS_BUNDLE_NAME, bundle);
                loadSceneFromBundle(bundle);
            });
        }).then(() => {
            this._homeScenePreloaded = true;
            debugPerfTrace('scene.home.preload.done', {
                source,
                durationMs: Date.now() - startedAt,
            });
        }).catch((error) => {
            this._homeScenePreloaded = false;
            this._homeScenePreloadedAsset = null;
            debugPerfTrace('scene.home.preload.error', {
                source,
                durationMs: Date.now() - startedAt,
                error,
            });
            throw error;
        });
        this._homeScenePreloadPromise = preloadPromise;
        try {
            await preloadPromise;
        } finally {
            if (this._homeScenePreloadPromise === preloadPromise) {
                this._homeScenePreloadPromise = null;
            }
        }
    }

    private async waitForHomeScenePreloadIfNeeded(): Promise<void> {
        const preloadPromise = this._homeScenePreloadPromise;
        if (!preloadPromise) return;
        try {
            await preloadPromise;
        } catch (error) {
            debugPerfTrace('scene.home.preload.join.error', { error });
        }
    }

    private isSceneAssetUsable(sceneAsset: SceneAsset | null): sceneAsset is SceneAsset {
        return !!sceneAsset && (sceneAsset as any).isValid !== false;
    }

    private consumePreloadedBundledScene(sceneName: AppSceneName, bundleName: string): SceneAsset | null {
        if (sceneName !== this.homeSceneName || bundleName !== HOME_ASSETS_BUNDLE_NAME) return null;
        if (!this._homeScenePreloaded || !this.isSceneAssetUsable(this._homeScenePreloadedAsset)) {
            this._homeScenePreloaded = false;
            this._homeScenePreloadedAsset = null;
            return null;
        }
        const sceneAsset = this._homeScenePreloadedAsset;
        this._homeScenePreloaded = false;
        this._homeScenePreloadedAsset = null;
        return sceneAsset;
    }

    private getInFlightSceneLoad(sceneName: AppSceneName): Promise<void> | null {
        if (!this._transitioning) return null;
        if (this._transitionTargetSceneName === sceneName) {
            debugPerfTrace('scene.load.joinInFlight', {
                current: this.session.currentSceneName,
                requested: this.session.requestedSceneName,
                to: sceneName,
                visualState: this.session.visualState,
            });
            logSceneTrace(
                '[SceneSplitTrace] loadScene:joinInFlight',
                JSON.stringify({
                    current: this.session.currentSceneName,
                    requested: this.session.requestedSceneName,
                    to: sceneName,
                    visualState: this.session.visualState,
                }),
            );
            return this._transitionPromise || Promise.resolve();
        }
        throw new Error(`[SceneRouter] scene transition already in flight: ${this.session.requestedSceneName}`);
    }

    private async loadScene(sceneName: AppSceneName): Promise<void> {
        const inFlightSceneLoad = this.getInFlightSceneLoad(sceneName);
        if (inFlightSceneLoad) {
            await inFlightSceneLoad;
            return;
        }
        this._transitioning = true;
        this._transitionTargetSceneName = sceneName;
        const startedAt = Date.now();
        debugPerfTrace('scene.load.start', {
            from: this.session.currentSceneName,
            requestedBefore: this.session.requestedSceneName,
            to: sceneName,
            visualState: this.session.visualState,
            hasPendingGameplay: !!this.session.pendingGameplayRequest,
            hasActiveGameplay: !!this.session.activeGameplayContext,
        });
        logSceneTrace(
            '[SceneSplitTrace] loadScene:start',
            JSON.stringify({
                from: this.session.currentSceneName,
                requestedBefore: this.session.requestedSceneName,
                to: sceneName,
                visualState: this.session.visualState,
                hasPendingGameplay: !!this.session.pendingGameplayRequest,
                hasActiveGameplay: !!this.session.activeGameplayContext,
            }),
        );
        this.session.requestScene(sceneName);
        const loadPromise = new Promise<void>((resolve, reject) => {
            try {
                director.loadScene(sceneName, () => {
                    this.session.setCurrentSceneName(sceneName);
                    debugPerfTrace('scene.load.callback', {
                        current: this.session.currentSceneName,
                        requested: this.session.requestedSceneName,
                        to: sceneName,
                        durationMs: Date.now() - startedAt,
                        visualState: this.session.visualState,
                        hasPendingGameplay: !!this.session.pendingGameplayRequest,
                        hasActiveGameplay: !!this.session.activeGameplayContext,
                    });
                    logSceneTrace(
                        '[SceneSplitTrace] loadScene:callback',
                        JSON.stringify({
                            current: this.session.currentSceneName,
                            requested: this.session.requestedSceneName,
                            to: sceneName,
                            visualState: this.session.visualState,
                            hasPendingGameplay: !!this.session.pendingGameplayRequest,
                            hasActiveGameplay: !!this.session.activeGameplayContext,
                        }),
                    );
                    resolve();
                });
            } catch (error) {
                debugPerfTrace('scene.load.error', {
                    to: sceneName,
                    durationMs: Date.now() - startedAt,
                    error,
                });
                reject(error);
            }
        });
        this._transitionPromise = loadPromise;
        try {
            await loadPromise;
        } finally {
            this._transitioning = false;
            this._transitionTargetSceneName = '';
            this._transitionPromise = null;
            debugPerfTrace('scene.load.finish', {
                current: this.session.currentSceneName,
                requested: this.session.requestedSceneName,
                to: sceneName,
                durationMs: Date.now() - startedAt,
                visualState: this.session.visualState,
                hasPendingGameplay: !!this.session.pendingGameplayRequest,
                hasActiveGameplay: !!this.session.activeGameplayContext,
            });
            logSceneTrace(
                '[SceneSplitTrace] loadScene:finish',
                JSON.stringify({
                    current: this.session.currentSceneName,
                    requested: this.session.requestedSceneName,
                    to: sceneName,
                    visualState: this.session.visualState,
                    hasPendingGameplay: !!this.session.pendingGameplayRequest,
                    hasActiveGameplay: !!this.session.activeGameplayContext,
                }),
            );
        }
    }

    private async loadBundledScene(sceneName: AppSceneName, bundleName: string, logicalName: string): Promise<void> {
        const inFlightSceneLoad = this.getInFlightSceneLoad(sceneName);
        if (inFlightSceneLoad) {
            await inFlightSceneLoad;
            return;
        }
        this._transitioning = true;
        this._transitionTargetSceneName = sceneName;
        const startedAt = Date.now();
        const finalSceneName = sceneName;
        const finalBundleName = bundleName;
        const finalLogicalName = logicalName;
        debugPerfTrace('scene.bundle.load.start', {
            from: this.session.currentSceneName,
            requestedBefore: this.session.requestedSceneName,
            to: sceneName,
            bundleName,
            logicalBundle: logicalName,
            visualState: this.session.visualState,
            hasPendingGameplay: !!this.session.pendingGameplayRequest,
            hasActiveGameplay: !!this.session.activeGameplayContext,
        });
        logSceneTrace(
            '[SceneSplitTrace] loadBundledScene:start',
            JSON.stringify({
                from: this.session.currentSceneName,
                requestedBefore: this.session.requestedSceneName,
                to: sceneName,
                bundleName,
                logicalBundle: logicalName,
                visualState: this.session.visualState,
                hasPendingGameplay: !!this.session.pendingGameplayRequest,
                hasActiveGameplay: !!this.session.activeGameplayContext,
            }),
        );
        this.session.requestScene(sceneName);
        const loadPromise = new Promise<void>((resolve, reject) => {
            if (sceneName === this.gameSceneName && bundleName === LOCAL_BOOTSTRAP_BUNDLE_NAME) {
                markStartupTrace('startup_bootstrap_load_start', { bundleName, sceneName });
            }
            assetManager.loadBundle(bundleName, (bundleErr, bundle) => {
                if (bundleErr || !bundle) {
                    debugPerfTrace('scene.bundle.load.error', {
                        to: sceneName,
                        bundleName,
                        logicalBundle: logicalName,
                        durationMs: Date.now() - startedAt,
                        error: bundleErr || new Error('missing bundle'),
                    });
                    reject(new Error(`[SceneRouter] load ${logicalName}/${bundleName} failed: ${bundleErr?.message || 'missing bundle'}`));
                    return;
                }
                debugPerfTrace('scene.bundle.loaded', {
                    to: sceneName,
                    bundleName,
                    logicalBundle: logicalName,
                    durationMs: Date.now() - startedAt,
                });
                if (sceneName === this.gameSceneName && bundleName === LOCAL_BOOTSTRAP_BUNDLE_NAME) {
                    markStartupTrace('startup_bootstrap_load_done', {
                        bundleName,
                        sceneName,
                        durationMs: Date.now() - startedAt,
                    });
                }
                this.session.rememberRoutedBundle(bundleName, bundle);
                const runLoadedScene = (sceneAsset: SceneAsset, sceneLoadSource: 'bundle' | 'preloaded') => {
                    debugPerfTrace('scene.bundle.scene.loaded', {
                        to: sceneName,
                        bundleName,
                        logicalBundle: logicalName,
                        source: sceneLoadSource,
                        durationMs: Date.now() - startedAt,
                    });
                    if (sceneName === this.gameSceneName && bundleName === LOCAL_BOOTSTRAP_BUNDLE_NAME) {
                        markStartupTrace('startup_game_scene_load_done', {
                            bundleName,
                            sceneName,
                            durationMs: Date.now() - startedAt,
                        });
                    }
                    const startupGameRestore = sceneName === this.gameSceneName && bundleName === LOCAL_BOOTSTRAP_BUNDLE_NAME
                        ? this.session.consumeStartupCloudGameRestoreForGameEntry()
                        : null;
                    if (startupGameRestore) {
                        this.session.markPendingGameplayRequest(
                            startupGameRestore.savedLevel,
                            'level_',
                            'main',
                            'auto',
                        );
                        debugPerfTrace('scene.bundle.gameRestore.beforeRun', {
                            from: this.session.currentSceneName,
                            requestedBefore: this.session.requestedSceneName,
                            loadedScene: sceneName,
                            loadedBundleName: bundleName,
                            loadedLogicalBundle: logicalName,
                            to: sceneName,
                            savedLevel: startupGameRestore.savedLevel,
                            durationMs: Date.now() - startedAt,
                        });
                    }
                    director.runScene(sceneAsset, undefined, () => {
                        this.session.setCurrentSceneName(sceneName);
                        if (sceneName === this.gameSceneName && bundleName === LOCAL_BOOTSTRAP_BUNDLE_NAME) {
                            markStartupTrace('startup_game_scene_run', {
                                bundleName,
                                sceneName,
                                durationMs: Date.now() - startedAt,
                            });
                        }
                        debugPerfTrace('scene.bundle.run.callback', {
                            current: this.session.currentSceneName,
                            requested: this.session.requestedSceneName,
                            to: sceneName,
                            bundleName,
                            logicalBundle: logicalName,
                            durationMs: Date.now() - startedAt,
                            visualState: this.session.visualState,
                            hasPendingGameplay: !!this.session.pendingGameplayRequest,
                            hasActiveGameplay: !!this.session.activeGameplayContext,
                        });
                        logSceneTrace(
                            '[SceneSplitTrace] loadBundledScene:callback',
                            JSON.stringify({
                                current: this.session.currentSceneName,
                                requested: this.session.requestedSceneName,
                                to: sceneName,
                                bundleName,
                                logicalBundle: logicalName,
                                visualState: this.session.visualState,
                                hasPendingGameplay: !!this.session.pendingGameplayRequest,
                                hasActiveGameplay: !!this.session.activeGameplayContext,
                            }),
                        );
                        resolve();
                    });
                };
                const preloadedSceneAsset = this.consumePreloadedBundledScene(sceneName, bundleName);
                if (preloadedSceneAsset) {
                    debugPerfTrace('scene.bundle.scene.reusePreloaded', {
                        to: sceneName,
                        bundleName,
                        logicalBundle: logicalName,
                        durationMs: Date.now() - startedAt,
                    });
                    runLoadedScene(preloadedSceneAsset, 'preloaded');
                    return;
                }
                bundle.loadScene(sceneName, (sceneErr: Error | null, sceneAsset: SceneAsset) => {
                    if (sceneErr || !sceneAsset) {
                        debugPerfTrace('scene.bundle.scene.error', {
                            to: sceneName,
                            bundleName,
                            logicalBundle: logicalName,
                            durationMs: Date.now() - startedAt,
                            error: sceneErr || new Error('missing scene asset'),
                        });
                        reject(new Error(`[SceneRouter] load scene ${sceneName} from ${logicalName}/${bundleName} failed: ${sceneErr?.message || 'missing scene asset'}`));
                        return;
                    }
                    runLoadedScene(sceneAsset, 'bundle');
                });
            });
        });
        this._transitionPromise = loadPromise;
        try {
            await loadPromise;
        } finally {
            this._transitioning = false;
            this._transitionTargetSceneName = '';
            this._transitionPromise = null;
            debugPerfTrace('scene.bundle.load.finish', {
                current: this.session.currentSceneName,
                requested: this.session.requestedSceneName,
                to: finalSceneName,
                bundleName: finalBundleName,
                logicalBundle: finalLogicalName,
                durationMs: Date.now() - startedAt,
                visualState: this.session.visualState,
                hasPendingGameplay: !!this.session.pendingGameplayRequest,
                hasActiveGameplay: !!this.session.activeGameplayContext,
            });
            logSceneTrace(
                '[SceneSplitTrace] loadBundledScene:finish',
                JSON.stringify({
                    current: this.session.currentSceneName,
                    requested: this.session.requestedSceneName,
                    to: finalSceneName,
                    bundleName: finalBundleName,
                    logicalBundle: finalLogicalName,
                    visualState: this.session.visualState,
                    hasPendingGameplay: !!this.session.pendingGameplayRequest,
                    hasActiveGameplay: !!this.session.activeGameplayContext,
                }),
            );
        }
    }
}
