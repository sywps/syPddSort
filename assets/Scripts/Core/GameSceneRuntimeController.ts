import {
    AnalyticsMgr,
    AudioMgr,
    LeaderboardMgr,
    Node,
    PerformanceMgr,
    SySDKMgr,
    UITransform,
    UserMgr,
    UserStateSyncMgr,
    view,
} from './GameCtrlShared';
import { ResolutionPolicy } from 'cc';
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
        const gameplayRoot = screenRoot?.getChildByName('GameplayRoot');
        const gameplayFixedRoot = gameplayRoot?.getChildByName('GameplayFixedRoot');
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
        this.runtime.scheduleOnce(() => {
            this.startHomeBackgroundServices();
        }, 0);
    }

    startLoadingSceneRuntime(): void {
        const appRoot = AppRoot.ensure('Loading');
        appRoot.markBoot('Loading');
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName: 'app_launch',
            page: 'app',
            source: 'GameCtrl.startLoading',
        });
        this.prepareSceneFrame('Loading');
        this.runtime.bindUserStateLifecycle();
        this.runtime.requireCanvasUiRoot('BootRoot');
        this.runtime.showLoadingOverlay();
        this.runtime.scheduleOnce(() => {
            if (!this.runtime.node?.isValid) {
                return;
            }
            if (this.shouldRouteLoadingToHome()) {
                void appRoot.router.toHome();
            } else {
                void appRoot.router.toGame();
            }
        }, 0);
    }

    startGameSceneRuntime(): void {
        const previousSceneName = AppRoot.tryGet()?.session.currentSceneName || '';
        const appRoot = AppRoot.ensure('Game');
        if (appRoot.session.pendingGameplayRequest) {
            appRoot.router.attachCurrentScene('Game');
            appRoot.session.markVisualState('boot');
            appRoot.session.clearActiveGameplayContext();
        } else {
            appRoot.markBoot('Game');
        }
        if (previousSceneName !== 'Loading') {
            AnalyticsMgr.inst.trackFunnelEvent({
                eventName: 'app_launch',
                page: 'app',
                source: 'GameCtrl.start',
            });
        }
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
        this.runtime.clearBoardVisualPools?.();
        this.runtime.clearEffectPools();
    }

    private prepareSceneFrame(sceneName: string = this.getRuntimeSceneName()): void {
        view.setDesignResolutionSize(
            this.runtime.constructor.VIEWPORT_WIDTH,
            this.runtime.constructor.VIEWPORT_HEIGHT,
            ResolutionPolicy.FIXED_WIDTH,
        );
        this.logScreenAdaptDebug(sceneName);
        PerformanceMgr.inst.init();
    }

    private logScreenAdaptDebug(sceneName: string): void {
        if (!this.isScreenAdaptDebugEnabled()) return;
        const scene = this.runtime.node?.scene;
        const canvas = scene?.getChildByName('Canvas') || null;
        const screenRoot = canvas?.getChildByName('ScreenRoot') || null;
        const popupRoot = this.findScreenOrCanvasRoot(canvas, screenRoot, 'PopupRoot');
        const overlayRoot = this.findScreenOrCanvasRoot(canvas, screenRoot, 'OverlayRoot');
        const fxRoot = this.findScreenOrCanvasRoot(canvas, screenRoot, 'FxRoot');
        const bootRoot = this.findScreenOrCanvasRoot(canvas, screenRoot, 'BootRoot');
        console.warn('[ScreenAdaptDebug:cocos-view]', {
            stage: 'after-set-design-resolution',
            sceneName,
            wx: this.pickWxScreenInfo(this.readWxScreenInfo()),
            view: {
                frame: this.sizeToPlain(view.getFrameSize()),
                visible: this.sizeToPlain(view.getVisibleSize()),
                design: this.sizeToPlain(view.getDesignResolutionSize()),
            },
            nodes: {
                canvas: this.nodeSizeToPlain(canvas),
                screenRoot: this.nodeSizeToPlain(screenRoot),
                popupRoot: this.nodeSizeToPlain(popupRoot),
                overlayRoot: this.nodeSizeToPlain(overlayRoot),
                fxRoot: this.nodeSizeToPlain(fxRoot),
                bootRoot: this.nodeSizeToPlain(bootRoot),
            },
        });
    }

    private isScreenAdaptDebugEnabled(): boolean {
        const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
        const windowScope: any = typeof window !== 'undefined' ? window : null;
        return !!(globalScope?.__PDD_SCREEN_ADAPT_DEBUG__ || windowScope?.__PDD_SCREEN_ADAPT_DEBUG__);
    }

    private shouldRouteLoadingToHome(): boolean {
        const pendingSceneGameplayRequest = AppRoot.tryGet()?.session.pendingGameplayRequest;
        if (pendingSceneGameplayRequest) return false;
        const urlLevel = typeof this.runtime.getUrlLevel === 'function' ? this.runtime.getUrlLevel() : 0;
        const urlLevelFile = typeof this.runtime.getUrlLevelFile === 'function' ? this.runtime.getUrlLevelFile() : '';
        if (urlLevel > 0 || urlLevelFile) return false;
        return typeof this.runtime.hasReliableLocalUserStateForStartup === 'function'
            && this.runtime.hasReliableLocalUserStateForStartup();
    }

    private startHomeBackgroundServices(): void {
        const canAutoSaveGameState =
            typeof this.runtime.hasReliableLocalUserStateForStartup === 'function'
            && this.runtime.hasReliableLocalUserStateForStartup();
        SySDKMgr.inst.init();
        SySDKMgr.inst.login().then(() => SySDKMgr.inst.reportLoadFinish());
        UserMgr.inst.touchSession(canAutoSaveGameState);
        void AnalyticsMgr.inst.bootstrap();
        if (canAutoSaveGameState && typeof this.runtime.queueCloudGameStateSync === 'function') {
            this.runtime.queueCloudGameStateSync();
        }
        this.runtime.scheduleOnce(() => {
            if (canAutoSaveGameState) {
                const savedLevel = typeof this.runtime.getSavedLevel === 'function' ? this.runtime.getSavedLevel() : 1;
                void LeaderboardMgr.inst.submitProgress(savedLevel, UserMgr.inst.getProfile());
            }
            if (typeof this.runtime._isWeChat === 'function' && this.runtime._isWeChat()) {
                void UserMgr.inst.loginWeChat();
            }
            if (typeof this.runtime.setupShareMenu === 'function') {
                this.runtime.setupShareMenu();
            }
        }, 0.5);
    }

    private readWxScreenInfo(): any {
        const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
        const windowScope: any = typeof window !== 'undefined' ? window : null;
        const wxRuntime = globalScope?.__rawWx || windowScope?.wx || globalScope?.wx || null;
        try {
            if (typeof wxRuntime?.getWindowInfo === 'function') return wxRuntime.getWindowInfo();
            if (typeof wxRuntime?.getSystemInfoSync === 'function') return wxRuntime.getSystemInfoSync();
        } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
        return null;
    }

    private pickWxScreenInfo(raw: any): Record<string, unknown> | null {
        if (!raw) return null;
        return {
            windowWidth: raw.windowWidth,
            windowHeight: raw.windowHeight,
            screenWidth: raw.screenWidth,
            screenHeight: raw.screenHeight,
            pixelRatio: raw.pixelRatio || raw.devicePixelRatio,
            devicePixelRatio: raw.devicePixelRatio,
            safeArea: raw.safeArea,
            platform: raw.platform,
            model: raw.model,
            system: raw.system,
            error: raw.error,
        };
    }

    private sizeToPlain(size: { width?: number; height?: number } | null | undefined): Record<string, number> | null {
        if (!size) return null;
        return {
            width: Math.round(Number(size.width) || 0),
            height: Math.round(Number(size.height) || 0),
        };
    }

    private nodeSizeToPlain(node: Node | null | undefined): Record<string, number | string> | null {
        if (!node?.isValid) return null;
        const transform = node.getComponent(UITransform);
        return {
            name: node.name,
            width: Math.round(Number(transform?.width) || 0),
            height: Math.round(Number(transform?.height) || 0),
            x: Math.round(Number(node.position.x) || 0),
            y: Math.round(Number(node.position.y) || 0),
        };
    }

    private findScreenOrCanvasRoot(
        canvas: Node | null | undefined,
        screenRoot: Node | null | undefined,
        rootName: string,
    ): Node | null {
        return screenRoot?.getChildByName(rootName) || canvas?.getChildByName(rootName) || null;
    }
}

export function ensureGameSceneRuntimeController(runtime: any): GameSceneRuntimeController {
    if (!runtime._sceneRuntimeController) {
        runtime._sceneRuntimeController = new GameSceneRuntimeController(runtime);
    }
    return runtime._sceneRuntimeController as GameSceneRuntimeController;
}
