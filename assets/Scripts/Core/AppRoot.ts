import { _decorator, assetManager, type AssetManager, Component, director, instantiate, Node, Prefab } from 'cc';
import { AppTransitionController } from './AppTransitionController';
import { StartupLoadingController } from './StartupLoadingController';
import {
    AppSession,
    type AppGameplayEntryCoverMode,
    type AppGameplayEntryMode,
    type AppRouteCoverMode,
    type AppSceneName,
} from './AppSession';
import { SceneRouter } from './SceneRouter';
import { isMiniGameRuntime } from './MiniGamePlatform';
import { AnalyticsMgr } from './AnalyticsMgr';

const { ccclass } = _decorator;
const APP_TRANSITION_BUNDLE_NAME = 'gameAssets';
const APP_TRANSITION_PREFAB_PATH = 'UI/Prefabs/Panels/AppTransition';

@ccclass('AppRoot')
export class AppRoot extends Component {
    private static _instance: AppRoot | null = null;
    private readonly _session = new AppSession();
    private readonly _router = new SceneRouter(this._session);
    appTransition: AppTransitionController | null = null;
    private appTransitionPromise: Promise<AppTransitionController> | null = null;
    private weChatTransitionRequest: {
        key: string; promise: Promise<void>; targetScene: AppSceneName;
        acceptReady?: boolean;
        complete?: (scene: AppSceneName, error: unknown | null) => boolean;
    } | null = null;
    startupLoading: StartupLoadingController | null = null;
    private startupLoadingPromise: Promise<StartupLoadingController> | null = null;

    adoptStartupLoading(canvas: Node): StartupLoadingController {
        if (this.startupLoading?.isValid) throw new Error('[AppRoot] Startup Loading already exists');
        canvas.name = 'StartupLoadingCanvas';
        canvas.setParent(this.node);
        const loading = canvas.addComponent(StartupLoadingController);
        loading.initialize();
        this.startupLoading = loading;
        return loading;
    }

    ensureStartupLoading(): Promise<StartupLoadingController> {
        if (this.startupLoading?.isValid) return Promise.resolve(this.startupLoading);
        if (this.startupLoadingPromise) return this.startupLoadingPromise;
        // Direct Game/editor entry reuses Boot's authored UI without running Boot's route controller.
        this.startupLoadingPromise = new Promise<StartupLoadingController>((resolve, reject) => {
            assetManager.loadBundle('main', (bundleError, bundle) => {
                if (bundleError || !bundle) { reject(bundleError || new Error('[StartupLoading] main bundle missing')); return; }
                bundle.loadScene('Boot', (sceneError, asset) => {
                    if (sceneError || !asset) { reject(sceneError || new Error('[StartupLoading] Boot scene missing')); return; }
                    try {
                        const template = asset.scene.getChildByName('Canvas');
                        if (!template) throw new Error('[StartupLoading] Boot Canvas missing');
                        const canvas = instantiate(template);
                        const routeNode = canvas.getChildByName('Boot');
                        if (!routeNode) throw new Error('[StartupLoading] Boot route node missing');
                        routeNode.removeFromParent();
                        routeNode.destroy();
                        resolve(this.adoptStartupLoading(canvas));
                    } catch (error) { reject(error); }
                });
            });
        }).then((loading) => {
            this.startupLoadingPromise = null;
            return loading;
        }, (error) => {
            this.startupLoadingPromise = null;
            throw error;
        });
        return this.startupLoadingPromise;
    }

    ensureAppTransition(): Promise<AppTransitionController> {
        if (this.appTransition?.isValid) return Promise.resolve(this.appTransition);
        if (this.appTransitionPromise) return this.appTransitionPromise;
        let finished = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        this.appTransitionPromise = new Promise<AppTransitionController>((resolve, reject) => {
            if (isMiniGameRuntime()) {
                timeout = setTimeout(() => {
                    finished = true;
                    reject(new Error('[AppTransition] optional transition load timed out'));
                }, 5000);
            }
            const loadPrefab = (bundle: AssetManager.Bundle) => bundle.load(APP_TRANSITION_PREFAB_PATH, Prefab, (error, prefab) => {
                if (finished) return;
                if (error || !prefab) {
                    reject(error || new Error('[AppTransition] prefab missing'));
                    return;
                }
                let node: Node | null = null;
                try {
                    node = instantiate(prefab);
                    node.name = 'AppTransitionCanvas';
                    node.setParent(this.node);
                    const controller = node.addComponent(AppTransitionController);
                    controller.initialize();
                    this.appTransition = controller;
                    resolve(controller);
                } catch (initializeError) {
                    if (node?.isValid) node.destroy();
                    reject(initializeError);
                }
            });
            const bundle = assetManager.getBundle(APP_TRANSITION_BUNDLE_NAME);
            if (bundle) {
                loadPrefab(bundle);
                return;
            }
            assetManager.loadBundle(APP_TRANSITION_BUNDLE_NAME, (bundleError, loadedBundle) => {
                if (finished) return;
                if (bundleError || !loadedBundle) {
                    reject(bundleError || new Error('[AppTransition] gameAssets bundle missing'));
                    return;
                }
                try { loadPrefab(loadedBundle); }
                catch (error) { reject(error); }
            });
        }).then((transition) => {
            finished = true;
            if (timeout !== undefined) clearTimeout(timeout);
            this.appTransitionPromise = null;
            return transition;
        }, (error) => {
            finished = true;
            if (timeout !== undefined) clearTimeout(timeout);
            this.appTransitionPromise = null;
            throw error;
        });
        return this.appTransitionPromise;
    }

    private runAppTransition(key: string, scene: AppSceneName, direction: 'forward' | 'reverse', task: () => Promise<void>): Promise<void> {
        if (!isMiniGameRuntime()) {
            return this.ensureAppTransition().then(transition => transition.run(key, scene, direction, task));
        }
        const active = this.weChatTransitionRequest;
        if (active) return active.key === key ? active.promise
            : Promise.reject(new Error(`[AppTransition] transition already in flight: ${active.key}`));
        const promise = (async () => {
            let transition: AppTransitionController;
            try {
                transition = await this.ensureAppTransition();
            } catch (error) {
                console.warn('[AppTransition] optional animation unavailable; continuing original route:', error);
                try {
                    AnalyticsMgr.inst.trackFunnelEvent({ eventName: 'app_transition_asset_failed', success: false,
                        source: 'app_transition', errorCode: 'transition_asset_unavailable', errorMessage: String(error),
                        extra: { targetScene: scene, transitionKey: key } });
                } catch (reportError) { console.warn('[AppTransition] telemetry failed:', reportError); }
                const ready = new Promise<void>((resolve, reject) => {
                    let completed = false;
                    this.weChatTransitionRequest!.complete = (target, failure) => {
                        if (completed || target !== this.weChatTransitionRequest?.targetScene) return false;
                        completed = true;
                        if (failure !== null) reject(failure);
                        else resolve();
                        return true;
                    };
                });
                await Promise.all([Promise.resolve().then(task), ready]);
                return;
            }
            // A gameplay/route failure is not an animation failure: never execute the task twice.
            await transition.run(key, scene, direction, task);
        })().finally(() => {
            if (this.weChatTransitionRequest?.promise === promise) this.weChatTransitionRequest = null;
        });
        this.weChatTransitionRequest = { key, promise, targetScene: scene };
        return promise;
    }

    static tryGet(): AppRoot | null {
        return AppRoot._instance && AppRoot._instance.node?.isValid ? AppRoot._instance : null;
    }

    static get inst(): AppRoot {
        const instance = AppRoot.tryGet();
        if (!instance) {
            throw new Error('[AppRoot] instance is not ready');
        }
        return instance;
    }

    static ensure(sceneName: AppSceneName = 'Game'): AppRoot {
        const existing = AppRoot.tryGet();
        if (existing) {
            existing.router.attachCurrentScene(sceneName);
            return existing;
        }
        const scene = director.getScene();
        if (!scene) {
            throw new Error('[AppRoot] cannot create persistent root without an active scene');
        }
        const node = new Node('AppRoot');
        scene.addChild(node);
        const root = node.addComponent(AppRoot);
        director.addPersistRootNode(node);
        root.router.attachCurrentScene(sceneName);
        return root;
    }

    get session(): AppSession {
        return this._session;
    }

    get router(): SceneRouter {
        return this._router;
    }

    onLoad(): void {
        const existing = AppRoot._instance;
        if (existing && existing !== this) {
            this.node.destroy();
            return;
        }
        AppRoot._instance = this;
        director.addPersistRootNode(this.node);
    }

    onDestroy(): void {
        if (AppRoot._instance === this) {
            AppRoot._instance = null;
        }
    }

    markBoot(sceneName: AppSceneName = 'Game'): void {
        this.router.attachCurrentScene(sceneName);
        this.session.markVisualState('boot');
        this.session.clearGameplayContext();
    }

    clearRouteCoverForBoot(): void {
        this.router.logTransitionTrace('[SceneSplitTrace] routeCover:clearForBoot');
    }

    clearRouteCover(source: string = 'unknown'): void {
        this.router.logTransitionTrace('[SceneSplitTrace] routeCover:clear', { source });
    }

    homePresentationReady = false;

    markHomeVisible(sceneName: AppSceneName = 'Game'): void {
        if (this.homePresentationReady) this.startupLoading?.hide();
        this.router.attachCurrentScene(sceneName);
        this.session.markVisualState('home');
        this.session.clearGameplayContext();
    }

    async requestHomeRoute(source: string = 'unknown', coverMode: AppRouteCoverMode = 'none'): Promise<void> {
        this.router.logTransitionTrace('[SceneSplitTrace] requestHomeRoute:start', { source, coverMode });
        const route = async () => {
            this.homePresentationReady = false;
            await this.router.toHome();
            this.markHomeVisible('Home');
            this.router.logTransitionTrace('[SceneSplitTrace] requestHomeRoute:afterMarkHomeVisible', { source, coverMode });
        };
        if (coverMode === 'none') await route();
        else {
            await this.runAppTransition('route:Home', 'Home', 'reverse', route);
        }
        this.router.logTransitionTrace('[SceneSplitTrace] requestHomeRoute:afterToHome', { source, coverMode });
    }

    async requestGameplayRoute(
        levelId: number,
        prefix: string,
        entryMode: AppGameplayEntryMode,
        entryCoverMode: AppGameplayEntryCoverMode = 'none',
        routeReason: string = '',
    ): Promise<void> {
        const route = async () => {
            this.markGameRequested(levelId, prefix, entryMode, entryCoverMode, routeReason);
            await this.router.toGame();
        };
        if (entryCoverMode === 'none') {
            await route();
            return;
        }
        await this.runAppTransition(`route:Game:${prefix}${levelId}`, 'Game', 'forward', route);
    }

    async runGameplayTransition(key: string, task: () => void | Promise<void>): Promise<void> {
        await this.runAppTransition(`gameplay:${key}`, 'Game', 'forward', async () => { await task(); });
    }

    isAppTransitionTargeting(sceneName: AppSceneName): boolean {
        return !!this.appTransition?.isTargeting(sceneName)
            || (!!this.weChatTransitionRequest?.complete && this.weChatTransitionRequest.targetScene === sceneName);
    }

    completeAppTransitionAfterDraw(sceneName: AppSceneName, error: unknown | null = null): boolean {
        if (error === null && this.weChatTransitionRequest?.acceptReady === false) return false;
        if (this.weChatTransitionRequest?.complete) return this.weChatTransitionRequest.complete(sceneName, error);
        return this.appTransition?.completeAfterDraw(sceneName, error) || false;
    }

    redirectFailedGameplayTransitionToHome(error: unknown): void {
        if (this.weChatTransitionRequest) this.weChatTransitionRequest.acceptReady = true;
        if (this.weChatTransitionRequest?.complete) {
            const complete = this.weChatTransitionRequest.complete;
            this.weChatTransitionRequest.targetScene = 'Home';
            this.weChatTransitionRequest.complete = (scene, failure) => complete(scene, failure || error);
        }
        this.appTransition?.redirectAfterFailure('Home', error);
    }

    resetAppTransitionReadiness(sceneName: AppSceneName): void {
        if (this.weChatTransitionRequest) this.weChatTransitionRequest.acceptReady = true;
        this.appTransition?.resetReadiness(sceneName);
    }

    holdAppTransitionReadiness(): void {
        if (this.weChatTransitionRequest) this.weChatTransitionRequest.acceptReady = false;
    }

    whenWeChatTransitionFinished(): Promise<void> {
        return this.weChatTransitionRequest?.promise || Promise.resolve();
    }

    markGameRequested(
        levelId: number,
        prefix: string,
        entryMode: AppGameplayEntryMode,
        entryCoverMode: AppGameplayEntryCoverMode = 'auto',
        routeReason: string = '',
    ): void {
        this.router.requestGameScene();
        this.session.markPendingGameplayRequest(levelId, prefix, entryMode, entryCoverMode, routeReason);
    }

    markGameActive(
        activeLevelId: number,
        prefix: string,
        entryMode: AppGameplayEntryMode,
        sceneName: AppSceneName = 'Game',
    ): void {
        this.router.attachCurrentScene(sceneName);
        this.session.markActiveGameplayContext(activeLevelId, prefix, entryMode);
    }

}
