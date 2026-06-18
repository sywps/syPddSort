import { _decorator, assetManager, Camera, Canvas, Component, director, instantiate, Node, Prefab, UITransform, view } from 'cc';
import {
    AppSession,
    type AppGameplayEntryCoverMode,
    type AppGameplayEntryMode,
    type AppSceneName,
    type AppSceneTransitionCoverMode,
} from './AppSession';
import { SceneRouter } from './SceneRouter';
import {
    SceneTransitionController,
    ensureSceneTransitionController as attachSceneTransitionController,
} from './SceneTransitionController';
import { LOCAL_BOOTSTRAP_BUNDLE_NAME } from './PackageNames';

const { ccclass } = _decorator;
const SCENE_TRANSITION_BUNDLE_NAME = LOCAL_BOOTSTRAP_BUNDLE_NAME;
const SCENE_TRANSITION_PREFAB_PATH = 'UI/Prefabs/Fx/SceneTransition';
const SCENE_TRANSITION_LAYER_NAME = 'SceneTransitionLayer';
const SCENE_TRANSITION_RENDER_LAYER = 1 << 29;

@ccclass('AppRoot')
export class AppRoot extends Component {
    private static _instance: AppRoot | null = null;
    private readonly _session = new AppSession();
    private readonly _router = new SceneRouter(this._session);
    private _sceneTransitionLayer: Node | null = null;
    private _sceneTransitionNode: Node | null = null;
    private _sceneTransitionPrefab: Prefab | null = null;
    private _sceneTransitionPromise: Promise<void> | null = null;
    private _sceneTransitionAction: Promise<void> | null = null;
    private _sceneTransitionResetVersion = 0;
    private _heldSceneTransitionSource = '';

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

    resetSceneTransitionForBoot(): void {
        this._sceneTransitionResetVersion += 1;
        this._heldSceneTransitionSource = '';
        this._sceneTransitionPromise = null;
        this._sceneTransitionAction = null;

        const node = this._sceneTransitionNode?.isValid ? this._sceneTransitionNode : null;
        if (!node) {
            return;
        }

        const controller = node.getComponent(SceneTransitionController);
        if (controller) {
            controller.resetHidden();
        } else {
            node.active = false;
        }
        this.router.logTransitionTrace('[SceneSplitTrace] sceneTransition:resetForBoot');
    }

    forceHideSceneTransition(source: string = 'unknown'): void {
        this._sceneTransitionResetVersion += 1;
        this._heldSceneTransitionSource = '';
        this._sceneTransitionPromise = null;
        this._sceneTransitionAction = null;

        const node = this._sceneTransitionNode?.isValid ? this._sceneTransitionNode : null;
        if (node) {
            const controller = node.getComponent(SceneTransitionController);
            if (controller) {
                controller.resetHidden();
            } else {
                node.active = false;
            }
        }
        this.router.logTransitionTrace('[SceneSplitTrace] sceneTransition:forceHide', { source });
    }

    markHomeVisible(sceneName: AppSceneName = 'Game'): void {
        this.router.attachCurrentScene(sceneName);
        this.session.markVisualState('home');
        this.session.clearGameplayContext();
        this.session.clearStartupCloudHomeRouteRequest();
    }

    shouldDisableSceneTransitionForRoute(targetSceneName: AppSceneName): boolean {
        const currentSceneName = this.session.currentSceneName;
        return (
            (currentSceneName === 'Home' && targetSceneName === 'Game')
            || (currentSceneName === 'Game' && targetSceneName === 'Home')
        );
    }

    async requestHomeSceneTransition(source: string = 'unknown', coverMode: AppSceneTransitionCoverMode = 'cover'): Promise<void> {
        const effectiveCoverMode: AppSceneTransitionCoverMode = this.shouldDisableSceneTransitionForRoute('Home') ? 'none' : coverMode;
        this.router.logTransitionTrace('[SceneSplitTrace] requestHomeSceneTransition:start', { source, coverMode, effectiveCoverMode });
        if (effectiveCoverMode === 'none') {
            this.markHomeVisible('Home');
            this.router.logTransitionTrace('[SceneSplitTrace] requestHomeSceneTransition:afterMarkHomeVisible', { source, coverMode: effectiveCoverMode });
            await this.router.toHome();
            this.router.logTransitionTrace('[SceneSplitTrace] requestHomeSceneTransition:afterToHome', { source, coverMode: effectiveCoverMode });
            return;
        }
        await this.playSceneTransition(source, async () => {
            this.markHomeVisible('Home');
            this.router.logTransitionTrace('[SceneSplitTrace] requestHomeSceneTransition:afterMarkHomeVisible', { source, coverMode: effectiveCoverMode });
            await this.router.toHome();
            this.router.logTransitionTrace('[SceneSplitTrace] requestHomeSceneTransition:afterToHome', { source, coverMode: effectiveCoverMode });
        });
    }

    async playSceneTransition(source: string, onCovered: () => void | Promise<void>): Promise<void> {
        if (this._sceneTransitionPromise) {
            return this._sceneTransitionPromise;
        }
        this._sceneTransitionPromise = this.playSceneTransitionImpl(source, onCovered);
        try {
            await this._sceneTransitionPromise;
        } finally {
            this._sceneTransitionPromise = null;
        }
    }

    async beginSceneTransition(source: string): Promise<void> {
        if (this._sceneTransitionAction) {
            await this._sceneTransitionAction;
        }
        if (this._heldSceneTransitionSource) {
            return;
        }
        const action = this.beginSceneTransitionImpl(source);
        this._sceneTransitionAction = action;
        try {
            await action;
        } finally {
            if (this._sceneTransitionAction === action) {
                this._sceneTransitionAction = null;
            }
        }
    }

    async finishSceneTransition(source: string = 'unknown'): Promise<void> {
        if (this._sceneTransitionAction) {
            await this._sceneTransitionAction;
        }
        if (!this._heldSceneTransitionSource) {
            return;
        }
        const action = this.finishSceneTransitionImpl(source);
        this._sceneTransitionAction = action;
        try {
            await action;
        } finally {
            if (this._sceneTransitionAction === action) {
                this._sceneTransitionAction = null;
            }
        }
    }

    isSceneTransitionHeld(): boolean {
        return !!this._heldSceneTransitionSource;
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

    private async playSceneTransitionImpl(source: string, onCovered: () => void | Promise<void>): Promise<void> {
        await this.beginSceneTransition(source);
        let coveredError: unknown = null;
        try {
            await onCovered();
        } catch (error) {
            coveredError = error;
        }
        await this.finishSceneTransition(source);
        if (coveredError) {
            throw coveredError;
        }
    }

    private async beginSceneTransitionImpl(source: string): Promise<void> {
        const resetVersion = this._sceneTransitionResetVersion;
        const controller = await this.ensureSceneTransitionController();
        if (resetVersion !== this._sceneTransitionResetVersion) {
            controller.resetHidden();
            return;
        }
        this.router.logTransitionTrace('[SceneSplitTrace] sceneTransition:play', { source });
        await controller.beginCover();
        if (resetVersion !== this._sceneTransitionResetVersion) {
            controller.resetHidden();
            return;
        }
        this._heldSceneTransitionSource = source;
        this.router.logTransitionTrace('[SceneSplitTrace] sceneTransition:covered', { source });
    }

    private async finishSceneTransitionImpl(source: string): Promise<void> {
        const heldSource = this._heldSceneTransitionSource;
        const controller = await this.ensureSceneTransitionController();
        this.router.logTransitionTrace('[SceneSplitTrace] sceneTransition:reveal', { source, heldSource });
        try {
            await controller.finishCover();
        } finally {
            this._heldSceneTransitionSource = '';
        }
        this.router.logTransitionTrace('[SceneSplitTrace] sceneTransition:finish', { source, heldSource });
    }

    private async ensureSceneTransitionController(): Promise<SceneTransitionController> {
        const node = await this.ensureSceneTransitionNode();
        const controller = attachSceneTransitionController(node);
        return controller;
    }

    private async ensureSceneTransitionNode(): Promise<Node> {
        if (this._sceneTransitionNode?.isValid) {
            this.syncSceneTransitionLayerLayout(this.ensureSceneTransitionLayer());
            this.syncSceneTransitionNodeLayout(this._sceneTransitionNode);
            return this._sceneTransitionNode;
        }
        const prefab = await this.loadSceneTransitionPrefab();
        const layer = this.ensureSceneTransitionLayer();
        const node = instantiate(prefab);
        node.name = 'SceneTransition';
        this.applySceneTransitionLayerRecursive(node);
        layer.addChild(node);
        this.syncSceneTransitionNodeLayout(node);
        this._sceneTransitionNode = node;
        attachSceneTransitionController(node).resetHidden();
        return node;
    }

    private ensureSceneTransitionLayer(): Node {
        if (this._sceneTransitionLayer?.isValid) {
            this.syncSceneTransitionLayerLayout(this._sceneTransitionLayer);
            return this._sceneTransitionLayer;
        }
        const scene = director.getScene();
        if (!scene) {
            throw new Error('[SceneTransition] cannot create transition layer without an active scene');
        }
        const layer = new Node(SCENE_TRANSITION_LAYER_NAME);
        layer.layer = SCENE_TRANSITION_RENDER_LAYER;
        layer.addComponent(UITransform);
        const camera = this.createSceneTransitionCamera(layer);
        const canvas = layer.addComponent(Canvas);
        canvas.cameraComponent = camera;
        canvas.alignCanvasWithScreen = true;
        scene.addChild(layer);
        director.addPersistRootNode(layer);
        this._sceneTransitionLayer = layer;
        this.syncSceneTransitionLayerLayout(layer);
        return layer;
    }

    private syncSceneTransitionLayerLayout(layer: Node): void {
        const ui = layer.getComponent(UITransform);
        const visibleSize = view.getVisibleSize();
        const width = Math.max(720, visibleSize.width);
        const height = Math.max(1280, visibleSize.height);
        ui?.setContentSize(width, height);
        layer.setPosition(0, 0, 0);
        if (layer.parent) {
            layer.setSiblingIndex(Math.max(0, layer.parent.children.length - 1));
        }
    }

    private syncSceneTransitionNodeLayout(node: Node): void {
        node.setPosition(0, 0, 0);
    }

    private createSceneTransitionCamera(layer: Node): Camera {
        const cameraNode = new Node('SceneTransitionCamera');
        cameraNode.layer = SCENE_TRANSITION_RENDER_LAYER;
        cameraNode.setPosition(0, 0, 1000);
        layer.addChild(cameraNode);
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = 640;
        camera.near = 0;
        camera.far = 2000;
        camera.priority = 100;
        camera.visibility = SCENE_TRANSITION_RENDER_LAYER;
        camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        return camera;
    }

    private async loadSceneTransitionPrefab(): Promise<Prefab> {
        if (this._sceneTransitionPrefab) {
            return this._sceneTransitionPrefab;
        }
        const bundle = await new Promise<any>((resolve, reject) => {
            assetManager.loadBundle(SCENE_TRANSITION_BUNDLE_NAME, (err, loadedBundle) => {
                if (err || !loadedBundle) {
                    reject(new Error(`[SceneTransition] load bundle ${SCENE_TRANSITION_BUNDLE_NAME} failed: ${err?.message || 'missing bundle'}`));
                    return;
                }
                resolve(loadedBundle);
            });
        });
        const prefab = await new Promise<Prefab>((resolve, reject) => {
            bundle.load(SCENE_TRANSITION_PREFAB_PATH, Prefab, (err: Error | null, loadedPrefab: Prefab | null) => {
                if (err || !loadedPrefab) {
                    reject(new Error(`[SceneTransition] load prefab ${SCENE_TRANSITION_PREFAB_PATH} failed: ${err?.message || 'missing prefab'}`));
                    return;
                }
                resolve(loadedPrefab);
            });
        });
        this._sceneTransitionPrefab = prefab;
        return prefab;
    }

    private applySceneTransitionLayerRecursive(node: Node): void {
        node.layer = SCENE_TRANSITION_RENDER_LAYER;
        for (const child of node.children) {
            this.applySceneTransitionLayerRecursive(child);
        }
    }
}
