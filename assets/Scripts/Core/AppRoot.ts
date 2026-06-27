import { _decorator, Component, director, Node } from 'cc';
import {
    AppSession,
    type AppGameplayEntryCoverMode,
    type AppGameplayEntryMode,
    type AppRouteCoverMode,
    type AppSceneName,
} from './AppSession';
import { SceneRouter } from './SceneRouter';

const { ccclass } = _decorator;

@ccclass('AppRoot')
export class AppRoot extends Component {
    private static _instance: AppRoot | null = null;
    private readonly _session = new AppSession();
    private readonly _router = new SceneRouter(this._session);

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
        this.router.attachCurrentScene(sceneName);
        this.session.markVisualState('home');
        this.session.clearGameplayContext();
        this.session.clearStartupCloudGameRestoreRequest();
    }

    async requestHomeRoute(source: string = 'unknown', coverMode: AppRouteCoverMode = 'none'): Promise<void> {
        this.router.logTransitionTrace('[SceneSplitTrace] requestHomeRoute:start', { source, coverMode });
        await this.router.toHome();
        this.markHomeVisible('Home');
        this.router.logTransitionTrace('[SceneSplitTrace] requestHomeRoute:afterMarkHomeVisible', { source, coverMode: 'none' });
        this.router.logTransitionTrace('[SceneSplitTrace] requestHomeRoute:afterToHome', { source, coverMode: 'none' });
    }

    markGameRequested(
        levelId: number,
        prefix: string,
        entryMode: AppGameplayEntryMode,
        entryCoverMode: AppGameplayEntryCoverMode = 'auto',
    ): void {
        this.router.requestGameScene();
        this.session.markPendingGameplayRequest(levelId, prefix, entryMode, entryCoverMode);
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
