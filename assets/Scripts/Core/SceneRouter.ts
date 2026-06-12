import { assetManager, director, SceneAsset } from 'cc';
import { AppSession, type AppSceneName } from './AppSession';

const HOME_ASSETS_BUNDLE_NAME = 'homeAssets';

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
        await this.loadBundledScene(this.homeSceneName, HOME_ASSETS_BUNDLE_NAME);
    }

    async toGame(): Promise<void> {
        await this.loadScene(this.gameSceneName);
    }

    private async loadScene(sceneName: AppSceneName): Promise<void> {
        if (this._transitioning) {
            throw new Error(`[SceneRouter] scene transition already in flight: ${this.session.requestedSceneName}`);
        }
        this._transitioning = true;
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
                    reject(error);
                }
            });
        } finally {
            this._transitioning = false;
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

    private async loadBundledScene(sceneName: AppSceneName, bundleName: string): Promise<void> {
        if (this._transitioning) {
            throw new Error(`[SceneRouter] scene transition already in flight: ${this.session.requestedSceneName}`);
        }
        this._transitioning = true;
        logSceneTrace(
            '[SceneSplitTrace] loadBundledScene:start',
            JSON.stringify({
                from: this.session.currentSceneName,
                requestedBefore: this.session.requestedSceneName,
                to: sceneName,
                bundleName,
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
                        reject(new Error(`[SceneRouter] load bundle ${bundleName} failed: ${bundleErr?.message || 'missing bundle'}`));
                        return;
                    }
                    bundle.loadScene(sceneName, (sceneErr: Error | null, sceneAsset: SceneAsset) => {
                        if (sceneErr || !sceneAsset) {
                            reject(new Error(`[SceneRouter] load scene ${sceneName} from ${bundleName} failed: ${sceneErr?.message || 'missing scene asset'}`));
                            return;
                        }
                        director.runScene(sceneAsset, undefined, () => {
                            this.session.setCurrentSceneName(sceneName);
                            logSceneTrace(
                                '[SceneSplitTrace] loadBundledScene:callback',
                                JSON.stringify({
                                    current: this.session.currentSceneName,
                                    requested: this.session.requestedSceneName,
                                    to: sceneName,
                                    bundleName,
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
            logSceneTrace(
                '[SceneSplitTrace] loadBundledScene:finish',
                JSON.stringify({
                    current: this.session.currentSceneName,
                    requested: this.session.requestedSceneName,
                    to: sceneName,
                    bundleName,
                    visualState: this.session.visualState,
                    hasPendingGameplay: !!this.session.pendingGameplayRequest,
                    hasActiveGameplay: !!this.session.activeGameplayContext,
                }),
            );
        }
    }
}
