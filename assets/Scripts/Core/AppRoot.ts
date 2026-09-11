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
        this.appTransitionPromise = new Promise<AppTransitionController>((resolve, reject) => {
            const loadPrefab = (bundle: AssetManager.Bundle) => bundle.load(APP_TRANSITION_PREFAB_PATH, Prefab, (error, prefab) => {
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
                if (bundleError || !loadedBundle) {
                    reject(bundleError || new Error('[AppTransition] gameAssets bundle missing'));
                    return;
                }
                loadPrefab(loadedBundle);
            });
        }).then((transition) => {
            this.appTransitionPromise = null;
            return transition;
        }, (error) => {
            this.appTransitionPromise = null;
            throw error;
        });
        return this.appTransitionPromise;
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

    markHomeVisible(sceneName: AppSceneName = 'Game'): void {
        this.startupLoading?.hide();
        this.router.attachCurrentScene(sceneName);
        this.session.markVisualState('home');
        this.session.clearGameplayContext();
    }

    async requestHomeRoute(source: string = 'unknown', coverMode: AppRouteCoverMode = 'none'): Promise<void> {
        this.router.logTransitionTrace('[SceneSplitTrace] requestHomeRoute:start', { source, coverMode });
        const route = async () => {
            await this.router.toHome();
            this.markHomeVisible('Home');
            this.router.logTransitionTrace('[SceneSplitTrace] requestHomeRoute:afterMarkHomeVisible', { source, coverMode });
        };
        if (coverMode === 'none') await route();
        else {
            const transition = await this.ensureAppTransition();
            await transition.run('route:Home', 'Home', 'reverse', route);
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
        const transition = await this.ensureAppTransition();
        await transition.run(`route:Game:${prefix}${levelId}`, 'Game', 'forward', route);
    }

    isAppTransitionTargeting(sceneName: AppSceneName): boolean {
        return !!this.appTransition?.isTargeting(sceneName);
    }

    completeAppTransitionAfterDraw(sceneName: AppSceneName, error: unknown | null = null): boolean {
        return this.appTransition?.completeAfterDraw(sceneName, error) || false;
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
