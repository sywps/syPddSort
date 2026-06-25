import {
    AnalyticsMgr,
    AudioMgr,
    Button,
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
import { debugPerfSnapshot, debugPerfTrace } from './DebugPerfTrace';
import { runtimeWarn } from './RuntimeLog';
import { markStartupTrace } from './StartupTrace';

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
        const bootSceneNode = canvas?.getChildByName('Boot');
        const gameNode = canvas?.getChildByName('Game');
        const gameplayRoot = screenRoot?.getChildByName('GameplayRoot');
        const gameplayFixedRoot = gameplayRoot?.getChildByName('GameplayFixedRoot');
        const mainMenuRoot = screenRoot?.getChildByName('MainMenuRoot');
        if (bootRoot?.isValid && bootSceneNode?.isValid && !screenRoot?.isValid) {
            return 'Boot';
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
        if (sceneName === 'Boot') {
            this.startBootSceneRuntime();
            return;
        }
        this.startGameSceneRuntime();
    }

    startHomeSceneRuntime(): void {
        const appRoot = AppRoot.ensure('Home');
        debugPerfSnapshot('runtime.home.start', this.runtime);
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
        debugPerfSnapshot('runtime.home.afterShowMainMenu', this.runtime, {
            hasMainMenuNode: !!this.runtime.mainMenuNode,
        });
        this.runtime.scheduleOnce(() => {
            debugPerfSnapshot('runtime.home.backgroundServices.start', this.runtime);
            this.startHomeBackgroundServices();
        }, 0);
    }

    startBootSceneRuntime(): void {
        const appRoot = AppRoot.ensure('Boot');
        debugPerfSnapshot('runtime.boot.start', this.runtime);
        const bootRouteKey = String((this.runtime.node as any)?.uuid || (this.runtime.node as any)?._id || 'Boot');
        appRoot.session.resetBootRouteGuard(bootRouteKey);
        appRoot.markBoot('Boot');
        appRoot.resetSceneTransitionForBoot();
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName: 'app_launch',
            page: 'app',
            source: 'GameCtrl.startBoot',
        });
        this.prepareSceneFrame('Boot');
        this.runtime.bindUserStateLifecycle();
        this.runtime.requireCanvasUiRoot('BootRoot');
        this.runtime.showLoadingOverlay();
        this.startBootCloudRestoreProbe();
        this.runtime.scheduleOnce(() => {
            if (!this.runtime.node?.isValid) {
                return;
            }
            if (!appRoot.session.consumeBootRoute()) {
                appRoot.router.logTransitionTrace('[SceneSplitTrace] bootRoute:skipDuplicate');
                return;
            }
            const startupGameplayLevel = this.getBootStartupGameplayLevel();
            if (startupGameplayLevel > 1) {
                appRoot.markGameRequested(startupGameplayLevel, 'level_', 'main', 'auto');
            }
            const route = appRoot.router.toGame();
            route.catch((error) => {
                console.error('[SceneSplit] boot route failed:', error);
                appRoot.forceHideSceneTransition('boot-route-error');
            });
        }, 0);
    }

    startGameSceneRuntime(): void {
        const previousSceneName = AppRoot.tryGet()?.session.currentSceneName || '';
        const appRoot = AppRoot.ensure('Game');
        debugPerfSnapshot('runtime.game.start', this.runtime, {
            previousSceneName,
        });
        this.applyResolvedStartupCloudGameplayRequest(appRoot, 'startup-cloud-restore-before-game');
        const pendingGameplayRequest = appRoot.session.pendingGameplayRequest;
        const explicitGameplayEntryCover = pendingGameplayRequest?.entryCoverMode === 'cover';
        const suppressGameplayEntryCover = pendingGameplayRequest?.entryCoverMode === 'none';
        if (pendingGameplayRequest) {
            appRoot.router.attachCurrentScene('Game');
            appRoot.session.markVisualState('boot');
            appRoot.session.clearActiveGameplayContext();
        } else {
            appRoot.markBoot('Game');
        }
        if (previousSceneName !== 'Boot') {
            AnalyticsMgr.inst.trackFunnelEvent({
                eventName: 'app_launch',
                page: 'app',
                source: 'GameCtrl.start',
            });
        }
        this.prepareSceneFrame('Game');
        this.runtime.bindUserStateLifecycle();
        this.runtime.requireCanvasUiRoot('ScreenRoot');
        this.runtime.requireCanvasUiRoot('PopupRoot');
        this.runtime.requireCanvasUiRoot('OverlayRoot');
        this.runtime.requireCanvasUiRoot('FxRoot');
        this.bindEarlyGameSettingsButton();
        this.bindExistingGameLoadingOverlay(!suppressGameplayEntryCover);
        if (appRoot.isSceneTransitionHeld()) {
            appRoot.router.logTransitionTrace('[SceneSplitTrace] GameCtrl:useHeldGameTransition', {
                entryCoverMode: pendingGameplayRequest?.entryCoverMode || 'auto',
            });
        } else if (explicitGameplayEntryCover) {
            void appRoot.beginSceneTransition('game-direct-start').catch((error: unknown) => {
                console.warn('[SceneTransition] direct game startup cover failed:', error);
            });
            appRoot.router.logTransitionTrace('[SceneSplitTrace] GameCtrl:beginDirectGameTransition');
        } else {
            appRoot.forceHideSceneTransition(suppressGameplayEntryCover ? 'gameplay-entry-no-cover' : 'game-direct-start-skip');
            appRoot.router.logTransitionTrace('[SceneSplitTrace] GameCtrl:skipDirectGameTransition', {
                entryCoverMode: pendingGameplayRequest?.entryCoverMode || 'auto',
                reason: suppressGameplayEntryCover ? 'no-cover-entry' : 'no-explicit-cover',
            });
        }
        debugPerfSnapshot('runtime.game.beforeContinueStartup', this.runtime, {
            pendingGameplayRequest: !!pendingGameplayRequest,
            entryCoverMode: pendingGameplayRequest?.entryCoverMode || '',
        });
        markStartupTrace('startup_continue_start', {
            pendingGameplayRequest: !!pendingGameplayRequest,
            entryCoverMode: pendingGameplayRequest?.entryCoverMode || '',
        });
        void this.runtime.continueStartup();
    }

    private bindEarlyGameSettingsButton(): void {
        const screenRoot = this.runtime.requireCanvasUiRoot('ScreenRoot');
        const settingsButton = screenRoot
            .getChildByName('GameplayRoot')
            ?.getChildByName('GameplayFixedRoot')
            ?.getChildByName('TopBarGroup')
            ?.getChildByName('Settings') || null;
        if (!settingsButton?.isValid) return;
        settingsButton.getComponent(Button) || settingsButton.addComponent(Button);
        settingsButton.targetOff(this.runtime);
        settingsButton.on(Button.EventType.CLICK, () => {
            AudioMgr.inst.play('button');
            this.runtime.openSettingsPanel();
        }, this.runtime);
    }

    private bindExistingGameLoadingOverlay(showOverlay: boolean = true): void {
        const bootRoot = this.runtime.requireCanvasUiRoot('BootRoot');
        const layer = this.runtime.requireUiChild(
            bootRoot,
            'StartupLoadingUI',
            'BootRoot/StartupLoadingUI',
        );
        const layerUT = layer.getComponent(UITransform);
        if (!layerUT) {
            throw new Error('[GameScene] Game.scene is missing UITransform on BootRoot/StartupLoadingUI');
        }
        layer.active = showOverlay;
        this.runtime._loadingOverlay = showOverlay ? layer : null;
        this.runtime._loadingClosing = false;
    }

    update(dt: number): void {
        this.runtime.vigorTick(dt);
    }

    destroy(): void {
        const sceneName = this.getRuntimeSceneName();
        debugPerfSnapshot('runtime.destroy.before', this.runtime, {
            sceneName,
        });
        if (sceneName === 'Game') {
            AnalyticsMgr.inst.abandonActiveLevel();
            SySDKMgr.inst.reportLevelExit(this.runtime.getAnalyticsLevelId());
        }
        this.runtime.unbindUserStateLifecycle();
        void UserStateSyncMgr.inst.flushPendingSave();
        this.runtime.unscheduleAllCallbacks();
        this.runtime.stopPulseTweens();
        this.runtime.clearBeanSettleMatchFx?.();
        this.runtime.clearPatternCompleteMatchFx?.();
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
        this.runtime.cancelSpriteFrameLoadQueue?.(`runtime-destroy:${sceneName}`);
        this.runtime.releaseSceneScopedSpriteFrames?.(sceneName, 'scene-destroy');
        debugPerfTrace('runtime.destroy.after', {
            sceneName,
        });
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
        runtimeWarn('[ScreenAdaptDebug:cocos-view]', {
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

    private canUseDefaultStartupRoute(): boolean {
        const pendingSceneGameplayRequest = AppRoot.tryGet()?.session.pendingGameplayRequest;
        if (pendingSceneGameplayRequest) return false;
        const urlLevel = typeof this.runtime.getUrlLevel === 'function' ? this.runtime.getUrlLevel() : 0;
        const urlLevelFile = typeof this.runtime.getUrlLevelFile === 'function' ? this.runtime.getUrlLevelFile() : '';
        if (urlLevel > 0 || urlLevelFile) return false;
        return true;
    }

    private getBootStartupGameplayLevel(): number {
        if (!this.canUseDefaultStartupRoute()) return 0;
        if (
            typeof this.runtime.hasReliableLocalUserStateForStartup === 'function'
            && this.runtime.hasReliableLocalUserStateForStartup()
        ) {
            return typeof this.runtime.getSavedLevel === 'function'
                ? Math.max(1, Math.floor(Number(this.runtime.getSavedLevel()) || 1))
                : 1;
        }
        return this.getResolvedStartupCloudRestoreLevel();
    }

    private getResolvedStartupCloudRestoreLevel(): number {
        const status = typeof this.runtime.getStartupCloudRestoreStatus === 'function'
            ? this.runtime.getStartupCloudRestoreStatus()
            : '';
        if (status !== 'cloud_progress_gt_1') return 0;
        const savedLevel = typeof this.runtime.getSavedLevel === 'function'
            ? Math.max(1, Math.floor(Number(this.runtime.getSavedLevel()) || 1))
            : 1;
        return savedLevel > 1 ? savedLevel : 0;
    }

    private startBootCloudRestoreProbe(): void {
        if (!this.canUseDefaultStartupRoute()) return;
        if (typeof this.runtime.hasReliableLocalUserStateForStartup === 'function' && this.runtime.hasReliableLocalUserStateForStartup()) {
            return;
        }
        if (typeof this.runtime.beginStartupCloudRestore !== 'function') return;
        debugPerfTrace('startup.cloudRestore.bootProbe.begin', {
            sceneName: this.getRuntimeSceneName('Boot'),
        });
        try {
            void Promise.resolve(this.runtime.beginStartupCloudRestore(false))
                .then((status) => {
                    const savedLevel = typeof this.runtime.getSavedLevel === 'function' ? this.runtime.getSavedLevel() : 0;
                    if (status === 'cloud_progress_gt_1' && savedLevel > 1) {
                        const appRoot = AppRoot.tryGet();
                        appRoot?.session.markStartupCloudGameRestoreReady(savedLevel);
                    }
                    debugPerfTrace('startup.cloudRestore.bootProbe.done', {
                        status,
                        savedLevel,
                    });
                })
                .catch((error) => {
                    debugPerfTrace('startup.cloudRestore.bootProbe.error', { error });
                });
        } catch (error) {
            debugPerfTrace('startup.cloudRestore.bootProbe.error', { error });
        }
    }

    private applyResolvedStartupCloudGameplayRequest(appRoot: AppRoot, source: string): boolean {
        const savedLevel = this.getResolvedStartupCloudRestoreLevel();
        if (savedLevel <= 1) return false;
        const pending = appRoot.session.pendingGameplayRequest;
        if (pending && pending.entryMode !== 'main') return false;
        if (pending?.entryMode === 'main' && pending.levelId >= savedLevel) return false;
        const active = appRoot.session.activeGameplayContext;
        if (active && active.entryMode !== 'main') return false;
        if (active?.entryMode === 'main' && active.activeLevelId >= savedLevel) return false;
        appRoot.markGameRequested(savedLevel, 'level_', 'main', 'auto');
        if (typeof this.runtime.releaseStartupBootstrapPrefetchIfUnused === 'function') {
            this.runtime.releaseStartupBootstrapPrefetchIfUnused(source);
        }
        debugPerfSnapshot('startup.cloudRestore.routeGameBeforeGameStartup', this.runtime, {
            source,
            savedLevel,
        });
        return true;
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
