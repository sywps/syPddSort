import { assetManager, director, SceneAsset } from 'cc';
import { AppSession, type AppSceneName } from './AppSession';
import {
    HOME_ASSETS_BUNDLE_NAME,
    LOCAL_BOOTSTRAP_BUNDLE_NAME,
    LOGICAL_FIRST_PLAY_BUNDLE_NAME,
    LOGICAL_HOME_BUNDLE_NAME,
} from './PackageNames';
import { debugPerfTrace } from './DebugPerfTrace';

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
    console.log(...args);
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
        await this.loadBundledScene(this.gameSceneName, LOCAL_BOOTSTRAP_BUNDLE_NAME, LOGICAL_FIRST_PLAY_BUNDLE_NAME);
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
        let finalSceneName = sceneName;
        let finalBundleName = bundleName;
        let finalLogicalName = logicalName;
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
                        const startupHomeRoute = sceneName === this.gameSceneName && bundleName === LOCAL_BOOTSTRAP_BUNDLE_NAME
                            ? this.session.consumeStartupCloudHomeRouteForGameRedirect()
                            : null;
                        if (startupHomeRoute) {
                            finalSceneName = this.homeSceneName;
                            finalBundleName = HOME_ASSETS_BUNDLE_NAME;
                            finalLogicalName = LOGICAL_HOME_BUNDLE_NAME;
                            debugPerfTrace('scene.bundle.redirect.beforeRun', {
                                from: this.session.currentSceneName,
                                requestedBefore: this.session.requestedSceneName,
                                loadedScene: sceneName,
                                loadedBundleName: bundleName,
                                loadedLogicalBundle: logicalName,
                                to: this.homeSceneName,
                                bundleName: HOME_ASSETS_BUNDLE_NAME,
                                logicalBundle: LOGICAL_HOME_BUNDLE_NAME,
                                savedLevel: startupHomeRoute.savedLevel,
                                durationMs: Date.now() - startedAt,
                            });
                            this.session.requestScene(this.homeSceneName);
                            assetManager.loadBundle(HOME_ASSETS_BUNDLE_NAME, (homeBundleErr, homeBundle) => {
                                if (homeBundleErr || !homeBundle) {
                                    debugPerfTrace('scene.bundle.redirect.error', {
                                        to: this.homeSceneName,
                                        bundleName: HOME_ASSETS_BUNDLE_NAME,
                                        logicalBundle: LOGICAL_HOME_BUNDLE_NAME,
                                        durationMs: Date.now() - startedAt,
                                        error: homeBundleErr || new Error('missing home bundle'),
                                    });
                                    reject(new Error(`[SceneRouter] redirect to ${LOGICAL_HOME_BUNDLE_NAME}/${HOME_ASSETS_BUNDLE_NAME} failed: ${homeBundleErr?.message || 'missing bundle'}`));
                                    return;
                                }
                                this.session.rememberRoutedBundle(HOME_ASSETS_BUNDLE_NAME, homeBundle);
                                homeBundle.loadScene(this.homeSceneName, (homeSceneErr: Error | null, homeSceneAsset: SceneAsset) => {
                                    if (homeSceneErr || !homeSceneAsset) {
                                        debugPerfTrace('scene.bundle.redirect.scene.error', {
                                            to: this.homeSceneName,
                                            bundleName: HOME_ASSETS_BUNDLE_NAME,
                                            logicalBundle: LOGICAL_HOME_BUNDLE_NAME,
                                            durationMs: Date.now() - startedAt,
                                            error: homeSceneErr || new Error('missing home scene asset'),
                                        });
                                        reject(new Error(`[SceneRouter] redirect load scene ${this.homeSceneName} from ${LOGICAL_HOME_BUNDLE_NAME}/${HOME_ASSETS_BUNDLE_NAME} failed: ${homeSceneErr?.message || 'missing scene asset'}`));
                                        return;
                                    }
                                    debugPerfTrace('scene.bundle.redirect.scene.loaded', {
                                        to: this.homeSceneName,
                                        bundleName: HOME_ASSETS_BUNDLE_NAME,
                                        logicalBundle: LOGICAL_HOME_BUNDLE_NAME,
                                        savedLevel: startupHomeRoute.savedLevel,
                                        durationMs: Date.now() - startedAt,
                                    });
                                    director.runScene(homeSceneAsset, undefined, () => {
                                        this.session.setCurrentSceneName(this.homeSceneName);
                                        debugPerfTrace('scene.bundle.redirect.run.callback', {
                                            current: this.session.currentSceneName,
                                            requested: this.session.requestedSceneName,
                                            to: this.homeSceneName,
                                            bundleName: HOME_ASSETS_BUNDLE_NAME,
                                            logicalBundle: LOGICAL_HOME_BUNDLE_NAME,
                                            savedLevel: startupHomeRoute.savedLevel,
                                            durationMs: Date.now() - startedAt,
                                            visualState: this.session.visualState,
                                            hasPendingGameplay: !!this.session.pendingGameplayRequest,
                                            hasActiveGameplay: !!this.session.activeGameplayContext,
                                        });
                                        resolve();
                                    });
                                });
                            });
                            return;
                        }
                        director.runScene(sceneAsset, undefined, () => {
                            this.session.setCurrentSceneName(sceneName);
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
