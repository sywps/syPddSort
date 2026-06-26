import { assetManager, director, SceneAsset } from 'cc';
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
        await this.loadBundledScene(this.homeSceneName, HOME_ASSETS_BUNDLE_NAME, LOGICAL_HOME_BUNDLE_NAME);
    }

    async toGame(): Promise<void> {
        await this.loadBundledScene(this.gameSceneName, LOCAL_BOOTSTRAP_BUNDLE_NAME, LOGICAL_GAME_ENTRY_BUNDLE_NAME);
    }

    private async loadScene(sceneName: AppSceneName): Promise<void> {
        if (this._transitioning) {
            throw new Error(`[SceneRouter] scene transition already in flight: ${this.session.requestedSceneName}`);
        }
        this._transitioning = true;
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
        try {
            await new Promise<void>((resolve, reject) => {
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
        } finally {
            this._transitioning = false;
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
        if (this._transitioning) {
            throw new Error(`[SceneRouter] scene transition already in flight: ${this.session.requestedSceneName}`);
        }
        this._transitioning = true;
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
        try {
            await new Promise<void>((resolve, reject) => {
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
                        debugPerfTrace('scene.bundle.scene.loaded', {
                            to: sceneName,
                            bundleName,
                            logicalBundle: logicalName,
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
                    });
                });
            });
        } finally {
            this._transitioning = false;
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
