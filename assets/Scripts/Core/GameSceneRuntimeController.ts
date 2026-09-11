import {
    AnalyticsMgr,
    AudioMgr,
    BlockInputEvents,
    Button,
    Label,
    Node,
    PerformanceMgr,
    Sprite,
    SySDKMgr,
    UITransform,
    UserMgr,
    UserStateSyncMgr,
    view,
} from './GameCtrlShared';
import { Director, director, ResolutionPolicy } from 'cc';
import { AppRoot } from './AppRoot';
import { debugPerfFrameStep, debugPerfSnapshot, debugPerfTrace } from './DebugPerfTrace';
import { runtimeWarn } from './RuntimeLog';
import { markStartupTrace, reportWeChatStartupPlayable } from './StartupTrace';
import { resolveStartupRouteDecision } from './StartupRouteService';
import type { PendingGameplayRequest } from './AppSession';
import { getWeChatMiniGameRuntime, isWeChatMiniGameRuntime } from './MiniGamePlatform';

let weChatUpdateManagerBound = false;

function bindWeChatUpdateManagerOnce(): void {
    if (weChatUpdateManagerBound || !isWeChatMiniGameRuntime()) return;
    const wxRuntime = getWeChatMiniGameRuntime();
    const updateManager = typeof wxRuntime?.getUpdateManager === 'function'
        ? wxRuntime.getUpdateManager()
        : null;
    if (!updateManager) return;
    weChatUpdateManagerBound = true;
    try {
        if (typeof updateManager.onUpdateReady === 'function') {
            updateManager.onUpdateReady(() => {
                const applyUpdate = () => {
                    try {
                        updateManager.applyUpdate();
                    } catch (error) {
                        console.error('[MiniGameUpdate] applyUpdate failed:', error);
                    }
                };
                if (typeof wxRuntime.showModal === 'function') {
                    wxRuntime.showModal({
                        title: '请重启小游戏',
                        content: '资源更新中',
                        showCancel: false,
                        confirmText: '立即重启',
                        success: applyUpdate,
                        fail: applyUpdate,
                    });
                } else {
                    applyUpdate();
                }
            });
        }
        if (typeof updateManager.onUpdateFailed === 'function') {
            updateManager.onUpdateFailed(() => {
                console.error('[MiniGameUpdate] update package failed');
            });
        }
    } catch (error) {
        console.error('[MiniGameUpdate] bind failed:', error);
    }
}

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
        bindWeChatUpdateManagerOnce();
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
        void this.startGameSceneRuntime().catch((error) => {
            console.error('[StartupLoading] game startup failed:', error);
            if (!this.runtime.node?.isValid) return;
            const loading = AppRoot.tryGet()?.startupLoading;
            if (loading?.node.active) loading.fail('游戏初始化失败');
            else this.runtime.showRemoteLoadFatalError('startup', 'startup_failed', String(error));
        });
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
        this.runtime.startRenderResourceDiagnostics?.('home-start');
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
        appRoot.clearRouteCoverForBoot();
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName: 'app_launch',
            page: 'app',
            source: 'GameCtrl.startBoot',
        });
        this.prepareSceneFrame('Boot');
        this.runtime.bindUserStateLifecycle();
        this.runtime.startRenderResourceDiagnostics?.('boot-start');
        this.runtime.requireCanvasUiRoot('BootRoot');
        const routeDecision = resolveStartupRouteDecision();
        if (routeDecision.shouldMarkPendingGameplay) {
            appRoot.markGameRequested(routeDecision.levelId, routeDecision.prefix, routeDecision.prefix === 'zt_level_' ? 'theme' : 'main', 'auto', routeDecision.reason);
        }
        markStartupTrace('startup_boot_route_decided', {
            source: 'GameSceneRuntimeController.startBoot',
            reason: routeDecision.reason,
            levelId: routeDecision.levelId,
            pendingGameplay: routeDecision.shouldMarkPendingGameplay,
        });
        this.runtime.scheduleOnce(() => {
            if (!this.runtime.node?.isValid) {
                return;
            }
            if (!appRoot.session.consumeBootRoute()) {
                appRoot.router.logTransitionTrace('[SceneSplitTrace] bootRoute:skipDuplicate');
                return;
            }
            markStartupTrace('startup_route_game_start', {
                source: 'GameSceneRuntimeController.startBoot',
                requestedLevelId: routeDecision.shouldMarkPendingGameplay ? routeDecision.levelId : 0,
                reason: routeDecision.reason,
            });
            const route = routeDecision.reason === 'coop-invite' ? appRoot.router.toHome() : appRoot.router.toGame();
            route.catch((error) => {
                console.error('[SceneSplit] boot route failed:', error);
                appRoot.clearRouteCover('boot-route-error');
            });
        }, 0);
    }

    async startGameSceneRuntime(): Promise<void> {
        if (resolveStartupRouteDecision().reason === 'coop-invite' && !AppRoot.tryGet()?.session.pendingGameplayRequest) {
            await AppRoot.ensure('Game').router.toHome();
            return;
        }
        const previousSceneName = AppRoot.tryGet()?.session.currentSceneName || '';
        const appRoot = AppRoot.ensure('Game');
        debugPerfSnapshot('runtime.game.start', this.runtime, {
            previousSceneName,
        });
        this.markGameFirstFrame(previousSceneName);
        let pendingGameplayRequest = appRoot.session.pendingGameplayRequest;
        if (!pendingGameplayRequest) {
            const directPreviewRoute = resolveStartupRouteDecision();
            if (directPreviewRoute.reason === 'pvp-ranked') {
                appRoot.markGameRequested(
                    directPreviewRoute.levelId,
                    directPreviewRoute.prefix,
                    'theme',
                    'none',
                    directPreviewRoute.reason,
                );
                pendingGameplayRequest = appRoot.session.pendingGameplayRequest;
            }
        }
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
        this.runtime.bindFirstLevelReleaseTouchObserver?.();
        this.bindEarlyGameSettingsButton();
        if (pendingGameplayRequest) {
            this.primePendingGameplayShell(pendingGameplayRequest);
        }
        await this.bindExistingGameLoadingOverlay(!suppressGameplayEntryCover);
        if (!this.runtime.node?.isValid) return;
        if (!suppressGameplayEntryCover) {
            this.runtime.scheduleRewardedAdPreload?.('loading:game-start', 0);
        }
        appRoot.clearRouteCover(suppressGameplayEntryCover ? 'gameplay-entry-no-cover' : 'game-direct-start');
        appRoot.router.logTransitionTrace('[SceneSplitTrace] GameCtrl:skipRouteCover', {
            entryCoverMode: pendingGameplayRequest?.entryCoverMode || 'auto',
            reason: explicitGameplayEntryCover ? 'route-cover-retired' : (suppressGameplayEntryCover ? 'no-cover-entry' : 'no-explicit-cover'),
        });
        debugPerfSnapshot('runtime.game.beforeContinueStartup', this.runtime, {
            pendingGameplayRequest: !!pendingGameplayRequest,
            entryCoverMode: pendingGameplayRequest?.entryCoverMode || '',
        });
        markStartupTrace('startup_continue_start', {
            pendingGameplayRequest: !!pendingGameplayRequest,
            entryCoverMode: pendingGameplayRequest?.entryCoverMode || '',
        });
        this.runtime.startRenderResourceDiagnostics?.('game-start');
        await this.runtime.continueStartup();
    }

    private bindEarlyGameSettingsButton(): void {
        const screenRoot = this.runtime.requireCanvasUiRoot('ScreenRoot');
        const gameplayRoot = this.runtime.requireUiChild(screenRoot, 'GameplayRoot', 'ScreenRoot/GameplayRoot');
        const fixedRoot = this.runtime.requireUiChild(gameplayRoot, 'GameplayFixedRoot', 'GameplayRoot/GameplayFixedRoot');
        const topBar = this.runtime.requireUiChild(fixedRoot, 'TopBarGroup', 'GameplayFixedRoot/TopBarGroup');
        const settingsButton = this.runtime.requireUiChild(topBar, 'Settings', 'TopBarGroup/Settings');
        if (!settingsButton.getComponent(UITransform)) {
            throw new Error('[GameScene] Game.scene is missing UITransform on TopBarGroup/Settings');
        }
        const settingsIcon = this.runtime.requireUiChild(settingsButton, 'SettingsIcon', 'TopBarGroup/Settings/SettingsIcon');
        const settingsSprite = settingsIcon.getComponent(Sprite);
        if (!settingsSprite?.spriteFrame) {
            throw new Error('[GameScene] Game.scene must provide SpriteFrame on TopBarGroup/Settings/SettingsIcon');
        }
        const button = settingsButton.getComponent(Button);
        if (!button) throw new Error('[GameScene] Game.scene is missing Button on TopBarGroup/Settings');
        settingsButton.targetOff(this.runtime);
        settingsButton.on(Button.EventType.CLICK, () => {
            AudioMgr.inst.play('button');
            this.runtime.openSettingsPanel();
        }, this.runtime);
    }

    private async bindExistingGameLoadingOverlay(showOverlay: boolean = true): Promise<void> {
        const appRoot = AppRoot.inst;
        if (!showOverlay) {
            appRoot.startupLoading?.hide();
            this.runtime.setGameplayStartupRootVisible?.(true);
            return;
        }
        this.runtime.setGameplayStartupRootVisible?.(false);
        const loading = await appRoot.ensureStartupLoading();
        if (!this.runtime.node?.isValid) { loading.hide(); return; }
        if (!loading.node.active) loading.show('正在准备关卡…');
        else loading.setStage('正在准备关卡…');
        this.runtime._loadingOverlay = loading.node;
        this.runtime._loadingClosing = false;
        this.runtime._loadingOwnerToken = this.runtime.acquireRuntimeOwner?.('loading', 'startup') || '';
    }

    private primePendingGameplayShell(pending: PendingGameplayRequest): void {
        const levelId = Math.max(1, Math.floor(Number(pending.levelId) || 1));
        if (pending.entryMode === 'main') {
            this.runtime._activePhysicalLevelId = levelId;
            this.runtime._activeLogicalLevelId = levelId;
            this.runtime._activeGameplayEntryMode = 'main';
        } else if (pending.entryMode === 'theme') {
            this.runtime._isThemeLevel = true;
            this.runtime._currentThemeLevelId = levelId;
            this.runtime._activePhysicalLevelId = levelId;
            this.runtime._activeLogicalLevelId = levelId;
            this.runtime._activeGameplayEntryMode = 'theme';
        }
        const screenRoot = this.runtime.requireCanvasUiRoot('ScreenRoot');
        const gameplayRoot = this.runtime.requireUiChild(screenRoot, 'GameplayRoot', 'ScreenRoot/GameplayRoot');
        const fixedRoot = this.runtime.requireUiChild(gameplayRoot, 'GameplayFixedRoot', 'GameplayRoot/GameplayFixedRoot');
        const topBar = this.runtime.requireUiChild(fixedRoot, 'TopBarGroup', 'GameplayFixedRoot/TopBarGroup');
        const normalNode = this.runtime.requireUiChild(topBar, 'LevelTitle', 'TopBarGroup/LevelTitle');
        const level1Node = this.runtime.requireUiChild(topBar, 'LevelTitleLevel1', 'TopBarGroup/LevelTitleLevel1');
        const hideLevelOneTitle = pending.entryMode === 'main' && levelId === 1;
        normalNode.active = !hideLevelOneTitle;
        level1Node.active = false;
        const titleNode = hideLevelOneTitle ? level1Node : normalNode;
        const titlePath = hideLevelOneTitle ? 'TopBarGroup/LevelTitleLevel1' : 'TopBarGroup/LevelTitle';
        const labelNode = this.runtime.requireUiChild(titleNode, 'Label', `${titlePath}/Label`);
        const label = labelNode.getComponent(Label);
        if (!label) {
            throw new Error(`[GameScene] pending startup title is missing Label component on ${titlePath}/Label`);
        }
        label.string = `第${levelId}关`;
        this.runtime.levelLabel = label;
        const timerWrap = this.runtime.requireUiChild(topBar, 'TimerWrap', 'TopBarGroup/TimerWrap');
        timerWrap.active = false;
        markStartupTrace('startup_game_shell_primed', {
            levelId,
            entryMode: pending.entryMode,
        });
    }

    update(dt: number): void {
        debugPerfFrameStep(this.runtime, dt);
        this.runtime.vigorTick(dt);
        this.runtime.updateCoopClock?.(dt);
        this.runtime._pchConveyorGameplayController?.update?.(dt);
        this.runtime.updatePvpBattle?.();
    }

    destroy(): void {
        this.runtime.disposeCoop?.();
        director.off(Director.EVENT_AFTER_DRAW, this.reportStartupPlayableAfterDraw, this);
        const sceneName = this.getRuntimeSceneName();
        this.runtime.cancelRewardedGrantInteraction?.(`scene-destroy:${sceneName}`);
        this.runtime.cancelPendingShareReturn?.(`scene-destroy:${sceneName}`);
        this.runtime.disposeSettingsPanel?.();
        this.runtime._rewardedAdStateUnsubscribe?.();
        this.runtime._rewardedAdStateUnsubscribe = null;
        debugPerfSnapshot('runtime.destroy.before', this.runtime, {
            sceneName,
        });
        if (sceneName === 'Game') {
            AppRoot.tryGet()?.startupLoading?.hide();
            AnalyticsMgr.inst.abandonActiveLevel({
                gameplayStats: this.runtime._pchConveyorGameplayController?.getAnalyticsSnapshot?.() || null,
            });
            SySDKMgr.inst.reportLevelExit(this.runtime.getAnalyticsLevelId());
        }
        this.runtime.scanRenderSpriteFrameHealth?.(`runtime.destroy.before:${sceneName}`, null, { always: true });
        this.runtime.stopRenderResourceDiagnostics?.(`runtime-destroy:${sceneName}`);
        this.runtime.resetFirstLevelReleaseDiagnostics?.();
        this.runtime.unbindFirstLevelReleaseTouchObserver?.();
        this.runtime.disposeShareMenu?.();
        this.runtime.unbindUserStateLifecycle();
        void UserStateSyncMgr.inst.flushPendingSave();
        this.runtime.unscheduleAllCallbacks();
        this.runtime.stopPulseTweens();
        this.runtime.clearBeanSettleMatchFx?.();
        this.runtime.clearPatternCompleteMatchFx?.();
        this.runtime._pchConveyorGameplayController?.stop?.();
        this.runtime.clearIdleHint();
        this.runtime.clearSelectionOverlay();
        this.runtime.clearDragNodes();
        this.runtime.clearSkillUsageWatchdog?.(`scene-destroy:${sceneName}`);
        this.runtime.clearPlacementVisualState?.();
        this.runtime.clearExpandSlotGuide?.();
        this.runtime._gameCirclePanelController?.destroy?.();
        UserMgr.inst.destroyUserInfoButtons();
        const inputRoot: Node = this.runtime._sceneInputRoot || this.runtime.node;
        inputRoot.off(Node.EventType.TOUCH_START, this.runtime.onTouchStart, this.runtime);
        inputRoot.off(Node.EventType.TOUCH_MOVE, this.runtime.onTouchMove, this.runtime);
        inputRoot.off(Node.EventType.TOUCH_END, this.runtime.onTouchEnd, this.runtime);
        inputRoot.off(Node.EventType.TOUCH_CANCEL, this.runtime.onTouchCancel, this.runtime);
        inputRoot.off(Node.EventType.MOUSE_WHEEL, this.runtime.onMouseWheel, this.runtime);
        inputRoot.targetOff(this.runtime);
        this.runtime.node.targetOff(this.runtime);
        this.runtime.deactivateWeChatFriendRank('destroy');
        this.runtime.clearBoardVisualPools?.();
        this.runtime.clearEffectPools();
        this.runtime.clearRuntimeOwners?.();
        this.runtime.cancelSpriteFrameLoadQueue?.(`runtime-destroy:${sceneName}`);
        this.runtime.releaseBeanSkinRuntimeResources?.(`runtime-destroy:${sceneName}`);
        this.runtime.releaseBackgroundSkinCachedSpriteFrames?.(`runtime-destroy:${sceneName}`);
        this.runtime.releaseSceneScopedSpriteFrames?.(sceneName, 'runtime-destroy');
        debugPerfSnapshot('runtime.destroy.after', this.runtime, {
            sceneName,
        });
    }

    private markGameFirstFrame(previousSceneName: string): void {
        if (isWeChatMiniGameRuntime()) {
            director.off(Director.EVENT_AFTER_DRAW, this.reportStartupPlayableAfterDraw, this);
            director.on(Director.EVENT_AFTER_DRAW, this.reportStartupPlayableAfterDraw, this);
        }
        const report = () => {
            if (!this.runtime.node?.isValid) return;
            const renderFrame = Math.max(0, Number((director as any)?.getTotalFrames?.()) || 0);
            markStartupTrace('startup_game_first_frame', {
                previousSceneName,
                renderFrame,
            });
            debugPerfSnapshot('runtime.game.firstFrame', this.runtime, {
                previousSceneName,
                renderFrame,
            });
        };
        const afterDrawEvent = (Director as any)?.EVENT_AFTER_DRAW;
        if (afterDrawEvent && typeof director?.once === 'function') {
            director.once(afterDrawEvent, report, this.runtime);
            return;
        }
        this.runtime.scheduleOnce(report, 0);
    }

    private reportStartupPlayableAfterDraw(): void {
        if (!this.runtime.node?.isValid) {
            director.off(Director.EVENT_AFTER_DRAW, this.reportStartupPlayableAfterDraw, this);
            return;
        }
        if (!this.runtime._pchConveyorGameplayController?.isStartupInteractionReady()
            || this.runtime._loadingOverlay?.activeInHierarchy
            || this.runtime._adShowing
            || Number(this.runtime._modalFocusRefs) > 0
            || this.runtime._placementInputLocked) return;
        director.off(Director.EVENT_AFTER_DRAW, this.reportStartupPlayableAfterDraw, this);
        reportWeChatStartupPlayable(getWeChatMiniGameRuntime());
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

    private startHomeBackgroundServices(): void {
        const canAutoSaveGameState =
            typeof this.runtime.hasReliableLocalUserStateForStartup === 'function'
            && this.runtime.hasReliableLocalUserStateForStartup();
        SySDKMgr.inst.init();
        SySDKMgr.inst.login().then((ready) => {
            if (ready) SySDKMgr.inst.reportLoadFinish();
        });
        UserMgr.inst.touchSession(canAutoSaveGameState);
        void AnalyticsMgr.inst.bootstrap();
        if (canAutoSaveGameState && typeof this.runtime.queueCloudGameStateSync === 'function') {
            this.runtime.queueCloudGameStateSync();
        }
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
