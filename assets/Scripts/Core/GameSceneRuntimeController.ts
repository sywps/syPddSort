import {
    AnalyticsMgr,
    AudioMgr,
    Node,
    PerformanceMgr,
    SySDKMgr,
    UITransform,
    UserStateSyncMgr,
    view,
} from './GameCtrlShared';
import { ResolutionPolicy, screen } from 'cc';
import { AppRoot } from './AppRoot';

export class GameSceneRuntimeController {
    constructor(private readonly runtime: any) {}

    getRuntimeSceneName(fallback: string = 'Game'): string {
        const sceneName = String(this.runtime.node?.scene?.name || '').trim();
        if (sceneName) {
            return sceneName;
        }
        const scene = this.runtime.node?.scene;
        const canvas = scene?.getChildByName('Canvas');
        const screenRoot = canvas?.getChildByName('ScreenRoot');
        const bootRoot = this.findScreenOrCanvasRoot(canvas, screenRoot, 'BootRoot');
        const popupRoot = this.findScreenOrCanvasRoot(canvas, screenRoot, 'PopupRoot');
        const overlayRoot = this.findScreenOrCanvasRoot(canvas, screenRoot, 'OverlayRoot');
        const fxRoot = this.findScreenOrCanvasRoot(canvas, screenRoot, 'FxRoot');
        const loadingNode = canvas?.getChildByName('Loading');
        const gameNode = canvas?.getChildByName('Game');
        const gameplayFixedRoot = screenRoot?.getChildByName('GameplayFixedRoot');
        const mainMenuRoot = screenRoot?.getChildByName('MainMenuRoot');
        if (bootRoot?.isValid && loadingNode?.isValid && !screenRoot?.isValid) {
            return 'Loading';
        }
        if (screenRoot?.isValid && mainMenuRoot?.isValid) {
            return 'Home';
        }
        if (
            screenRoot?.isValid &&
            popupRoot?.isValid &&
            overlayRoot?.isValid &&
            fxRoot?.isValid &&
            (gameNode?.isValid || gameplayFixedRoot?.isValid)
        ) {
            return 'Game';
        }
        return fallback;
    }

    start(): void {
        this.runtime.installRuntimeLogGate();
        const sceneName = this.getRuntimeSceneName();
        if (sceneName === 'Home') {
            this.startHomeSceneRuntime();
            return;
        }
        if (sceneName === 'Loading') {
            this.startLoadingSceneRuntime();
            return;
        }
        this.startGameSceneRuntime();
    }

    startHomeSceneRuntime(): void {
        const appRoot = AppRoot.ensure('Home');
        appRoot.router.logTransitionTrace(
            '[SceneSplitTrace] GameCtrl:startHomeSceneRuntime',
        );
        appRoot.markHomeVisible('Home');
        this.prepareSceneFrame('Home');
        AudioMgr.inst.init(this.runtime.node);
        this.runtime.bindUserStateLifecycle();
        this.runtime.requireCanvasUiRoot('ScreenRoot');
        this.runtime.requireCanvasUiRoot('PopupRoot');
        this.runtime.requireCanvasUiRoot('OverlayRoot');
        this.runtime.requireCanvasUiRoot('FxRoot');
        appRoot.router.logTransitionTrace('[SceneSplitTrace] GameCtrl:beforeShowMainMenu');
        this.runtime.showMainMenu();
        appRoot.router.logTransitionTrace('[SceneSplitTrace] GameCtrl:afterShowMainMenu', {
            hasMainMenuNode: !!this.runtime.mainMenuNode,
        });
    }

    startLoadingSceneRuntime(): void {
        const appRoot = AppRoot.ensure('Loading');
        appRoot.markBoot('Loading');
        this.prepareSceneFrame('Loading');
        this.runtime.bindUserStateLifecycle();
        this.runtime.requireCanvasUiRoot('BootRoot');
        this.runtime.showLoadingOverlay();
        this.runtime.scheduleOnce(() => {
            if (!this.runtime.node?.isValid) {
                return;
            }
            void appRoot.router.toGame();
        }, 0);
    }

    startGameSceneRuntime(): void {
        const appRoot = AppRoot.ensure('Game');
        if (appRoot.session.pendingGameplayRequest) {
            appRoot.router.attachCurrentScene('Game');
            appRoot.session.markVisualState('boot');
            appRoot.session.clearActiveGameplayContext();
        } else {
            appRoot.markBoot('Game');
        }
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName: 'app_launch',
            page: 'app',
            source: 'GameCtrl.start',
        });
        this.prepareSceneFrame('Game');
        this.runtime.bindUserStateLifecycle();
        this.runtime.requireCanvasUiRoot('BootRoot');
        this.runtime.requireCanvasUiRoot('ScreenRoot');
        this.runtime.requireCanvasUiRoot('PopupRoot');
        this.runtime.requireCanvasUiRoot('OverlayRoot');
        this.runtime.requireCanvasUiRoot('FxRoot');
        this.runtime.showLoadingOverlay();
        void this.runtime.continueStartup();
    }

    update(dt: number): void {
        this.runtime.vigorTick(dt);
    }

    destroy(): void {
        if (this.getRuntimeSceneName() === 'Game') {
            AnalyticsMgr.inst.abandonActiveLevel();
            SySDKMgr.inst.reportLevelExit(this.runtime.getAnalyticsLevelId());
        }
        this.runtime.unbindUserStateLifecycle();
        void UserStateSyncMgr.inst.flushPendingSave();
        this.runtime.unscheduleAllCallbacks();
        this.runtime.stopPulseTweens();
        this.runtime.clearIdleHint();
        this.runtime.clearSelectionOverlay();
        this.runtime.clearDragNodes();
        const inputRoot: Node = this.runtime._sceneInputRoot || this.runtime.node;
        inputRoot.off(Node.EventType.TOUCH_START, this.runtime.onTouchStart, this.runtime);
        inputRoot.off(Node.EventType.TOUCH_MOVE, this.runtime.onTouchMove, this.runtime);
        inputRoot.off(Node.EventType.TOUCH_END, this.runtime.onTouchEnd, this.runtime);
        inputRoot.off(Node.EventType.TOUCH_CANCEL, this.runtime.onTouchEnd, this.runtime);
        inputRoot.off(Node.EventType.MOUSE_WHEEL, this.runtime.onMouseWheel, this.runtime);
        inputRoot.targetOff(this.runtime);
        this.runtime.node.targetOff(this.runtime);
        this.runtime.deactivateWeChatFriendRank('destroy');
        this.runtime.clearEffectPools();
    }

    private prepareSceneFrame(sceneName: string = this.getRuntimeSceneName()): void {
        const policy = sceneName === 'Home'
            ? ResolutionPolicy.FIXED_WIDTH
            : ResolutionPolicy.SHOW_ALL;
        view.setDesignResolutionSize(
            this.runtime.constructor.VIEWPORT_WIDTH,
            this.runtime.constructor.VIEWPORT_HEIGHT,
            policy,
        );
        if (sceneName === 'Home') {
            this.syncHomeOverlayRoots();
            this.runtime.scheduleOnce(() => {
                if (this.runtime.node?.isValid) {
                    this.syncHomeOverlayRoots();
                }
            }, 0);
        } else if (sceneName === 'Game') {
            this.syncGameFullscreenRoots();
            this.runtime.scheduleOnce(() => {
                if (this.runtime.node?.isValid) {
                    this.syncGameFullscreenRoots();
                }
            }, 0);
        }
        PerformanceMgr.inst.init();
    }

    private syncHomeOverlayRoots(): void {
        const visibleSize = view.getVisibleSize();
        const scene = this.runtime.node?.scene;
        const canvas = scene?.getChildByName('Canvas');
        if (!canvas) {
            throw new Error('[SceneUI] Home scene is missing root node: Canvas');
        }
        const screenRoot = canvas.getChildByName('ScreenRoot');
        if (!screenRoot) {
            throw new Error('[SceneUI] Home scene is missing root node: ScreenRoot');
        }
        for (const rootName of ['PopupRoot', 'OverlayRoot', 'FxRoot']) {
            const root = this.findScreenOrCanvasRoot(canvas, screenRoot, rootName);
            if (!root) {
                throw new Error(`[SceneUI] Home scene is missing root node: ${rootName}`);
            }
            this.setRequiredRootSize(root, rootName, visibleSize.width, visibleSize.height);
        }
    }

    private syncGameFullscreenRoots(): void {
        const visibleSize = this.getGameFullscreenSize();
        const scene = this.runtime.node?.scene;
        const canvas = scene?.getChildByName('Canvas');
        if (!canvas) {
            throw new Error('[SceneUI] Game scene is missing root node: Canvas');
        }
        const screenRoot = canvas.getChildByName('ScreenRoot');
        if (!screenRoot) {
            throw new Error('[SceneUI] Game scene is missing root node: ScreenRoot');
        }
        for (const rootName of ['PopupRoot', 'OverlayRoot', 'FxRoot', 'BootRoot']) {
            const root = this.findScreenOrCanvasRoot(canvas, screenRoot, rootName);
            if (!root) {
                throw new Error(`[SceneUI] Game scene is missing root node: ${rootName}`);
            }
            this.setRequiredRootSize(root, rootName, visibleSize.width, visibleSize.height);
        }
    }

    private getGameFullscreenSize(): { width: number; height: number } {
        const visibleSize = view.getVisibleSize();
        const frameSize = screen.windowSize;
        const designWidth = this.runtime.constructor.VIEWPORT_WIDTH;
        const designHeight = this.runtime.constructor.VIEWPORT_HEIGHT;
        let width = Math.max(visibleSize.width || 0, designWidth);
        let height = Math.max(visibleSize.height || 0, designHeight);
        if (frameSize.width > 0 && frameSize.height > 0) {
            const frameAspect = frameSize.width / frameSize.height;
            height = Math.max(height, width / frameAspect);
            width = Math.max(width, height * frameAspect);
        }
        return {
            width: Math.ceil(width),
            height: Math.ceil(height),
        };
    }

    private findScreenOrCanvasRoot(
        canvas: Node | null | undefined,
        screenRoot: Node | null | undefined,
        rootName: string,
    ): Node | null {
        return screenRoot?.getChildByName(rootName) || canvas?.getChildByName(rootName) || null;
    }

    private setRequiredRootSize(node: Node, context: string, width: number, height: number): void {
        const uiTransform = node.getComponent(UITransform);
        if (!uiTransform) {
            throw new Error(`[SceneUI] ${context} is missing UITransform`);
        }
        uiTransform.setContentSize(width, height);
    }
}

export function ensureGameSceneRuntimeController(runtime: any): GameSceneRuntimeController {
    if (!runtime._sceneRuntimeController) {
        runtime._sceneRuntimeController = new GameSceneRuntimeController(runtime);
    }
    return runtime._sceneRuntimeController as GameSceneRuntimeController;
}
