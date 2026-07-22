import {
    AnalyticsMgr,
    AudioMgr,
    BlockInputEvents,
    Button,
    Label,
    LeaderboardMgr,
    Node,
    PerformanceMgr,
    Sprite,
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
            appRoot.markGameRequested(routeDecision.levelId, routeDecision.prefix, 'main', 'auto', routeDecision.reason);
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
            const route = appRoot.router.toGame();
            route.catch((error) => {
                console.error('[SceneSplit] boot route failed:', error);
                appRoot.clearRouteCover('boot-route-error');
            });
        }, 0);
    }

    startGameSceneRuntime(): void {
        const previousSceneName = AppRoot.tryGet()?.session.currentSceneName || '';
        const appRoot = AppRoot.ensure('Game');
        debugPerfSnapshot('runtime.game.start', this.runtime, {
            previousSceneName,
        });
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
        this.runtime.bindFirstLevelReleaseTouchObserver?.();
        this.bindEarlyGameSettingsButton();
        if (pendingGameplayRequest) {
            this.primePendingGameplayShell(pendingGameplayRequest);
        }
        this.bindExistingGameLoadingOverlay(!suppressGameplayEntryCover);
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
        void this.runtime.continueStartup();
    }

    private bindEarlyGameSettingsButton(): void {
        const screenRoot = this.runtime.requireCanvasUiRoot('ScreenRoot');
        const topBar = screenRoot
            .getChildByName('GameplayRoot')
            ?.getChildByName('GameplayFixedRoot')
            ?.getChildByName('TopBarGroup') || null;
        if (topBar?.isValid && typeof this.runtime.syncTopHud === 'function') {
            this.runtime.syncTopHud(topBar, 'game');
        }
        const settingsButton = topBar
            ?.getChildByName('TopHud')
            ?.getChildByName('SettingsButton')
            || topBar?.getChildByName('Settings')
            || null;
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
        const blocker = layer.getComponent(BlockInputEvents) || layer.addComponent(BlockInputEvents);
        blocker.enabled = showOverlay;
        this.runtime._loadingOverlay = showOverlay ? layer : null;
        this.runtime._loadingClosing = false;
        if (showOverlay) {
            const overlayVersion = (this.runtime._loadingOverlayVersion || 0) + 1;
            this.runtime._loadingOverlayVersion = overlayVersion;
            this.configureExistingGameLoadingOverlay(layer);
            this.bindExistingGameLoadingProgress(layer, overlayVersion);
            this.runtime.setGameplayStartupRootVisible?.(false);
            this.promoteLoadingOverlayToFront(layer);
        } else {
            this.runtime.setGameplayStartupRootVisible?.(true);
        }
    }

    private configureExistingGameLoadingOverlay(layer: Node): void {
        const visibleSize = typeof this.runtime._getLoadingVisibleSize === 'function'
            ? this.runtime._getLoadingVisibleSize()
            : view.getVisibleSize();
        const bleed = Math.max(0, Math.floor(Number(this.runtime.constructor.LOADING_COVER_BLEED) || 0));
        const layerUT = layer.getComponent(UITransform);
        if (!layerUT) {
            throw new Error('[GameScene] Game.scene is missing UITransform on BootRoot/StartupLoadingUI');
        }
        layerUT.setContentSize(visibleSize.width, visibleSize.height);
        layer.setPosition(0, 0, 0);

        const cover = this.runtime.requireUiChild(layer, 'LoadingCover', 'StartupLoadingUI/LoadingCover');
        const coverUT = cover.getComponent(UITransform);
        if (!coverUT) {
            throw new Error('[GameScene] Game.scene is missing UITransform on StartupLoadingUI/LoadingCover');
        }
        const coverSprite = cover.getComponent(Sprite);
        if (!coverSprite) {
            throw new Error('[GameScene] Game.scene is missing Sprite on StartupLoadingUI/LoadingCover');
        }
        if (!coverSprite.spriteFrame) {
            const loadingCover = this.runtime.loadingCover || null;
            if (!loadingCover) {
                throw new Error('[GameScene] Game.scene LoadingCover SpriteFrame is missing and GameRuntimeHost.loadingCover is not assigned');
            }
            coverSprite.spriteFrame = loadingCover;
        }
        coverUT.setContentSize(
            Math.ceil(visibleSize.width + bleed * 2),
            Math.ceil(visibleSize.height + bleed * 2),
        );
        cover.setPosition(0, 0, 0);
    }

    private bindExistingGameLoadingProgress(layer: Node, overlayVersion: number): void {
        const group = this.runtime.requireUiChild(
            layer,
            'LoadingProgressGroup',
            'StartupLoadingUI/LoadingProgressGroup',
        );
        const labelNode = this.runtime.requireUiChild(
            group,
            'LoadingPercentLabel',
            'LoadingProgressGroup/LoadingPercentLabel',
        );
        const label = labelNode.getComponent(Label);
        if (!label) {
            throw new Error('[GameScene] Game.scene is missing Label on LoadingProgressGroup/LoadingPercentLabel');
        }
        const shadowNode = group.getChildByName('LoadingPercentLabelShadow') || null;
        const shadowLabel = shadowNode?.getComponent(Label) || null;
        this.runtime._loadingProgressLabel = label;
        this.runtime._loadingProgressLabelShadow = shadowLabel;
        this.runtime._loadingProgressFill = this.createGameLoadingProgressAdapter(group);
        this.runtime._loadingProgress = 0;
        this.runtime._loadingProgressPercent = 0;
        if (typeof this.runtime._setLoadingProgressPercentText === 'function') {
            this.runtime._setLoadingProgressPercentText(0);
        } else {
            label.string = '加载中...0%';
            if (shadowLabel) shadowLabel.string = label.string;
        }
        if (typeof this.runtime._startLoadingProgressIntro === 'function') {
            this.runtime._startLoadingProgressIntro(overlayVersion);
        }
    }

    private createGameLoadingProgressAdapter(group: Node): { progress: number } | null {
        const fill = group.getChildByName('LoadingBarFill') || null;
        const fillUT = fill?.getComponent(UITransform) || null;
        if (!fill?.isValid || !fillUT) return null;
        const fullWidth = Math.max(1, Math.floor(Number(fillUT.width) || 1));
        const fullHeight = Math.max(1, Math.floor(Number(fillUT.height) || 1));
        const highlight = fill.getChildByName('LoadingBarFillHighlight') || null;
        const highlightUT = highlight?.getComponent(UITransform) || null;
        const shine = fill.getChildByName('LoadingBarShine') || null;
        const leftEdge = -fullWidth / 2;
        let current = 0;
        const apply = (value: number) => {
            current = Math.max(0, Math.min(1, Number(value) || 0));
            const width = Math.max(0, fullWidth * current);
            fillUT.setContentSize(width, fullHeight);
            fill.setPosition(leftEdge + width / 2, fill.position.y, fill.position.z);
            if (highlightUT) {
                highlightUT.setContentSize(width, highlightUT.height);
            }
            if (highlight?.isValid) {
                highlight.setPosition(width / 2, highlight.position.y, highlight.position.z);
            }
            if (shine?.isValid) {
                shine.active = current > 0.02 && current < 0.995;
                shine.setPosition(width / 2, shine.position.y, shine.position.z);
            }
        };
        const adapter: { progress: number } = {} as { progress: number };
        Object.defineProperty(adapter, 'progress', {
            get: () => current,
            set: apply,
            enumerable: true,
            configurable: true,
        });
        apply(0);
        return adapter;
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
        const useLevel1Variant = pending.entryMode === 'main' && levelId === 1;
        normalNode.active = !useLevel1Variant;
        level1Node.active = useLevel1Variant;
        const titleNode = useLevel1Variant ? level1Node : normalNode;
        const labelNode = titleNode.getChildByName('Label') || titleNode;
        const label = labelNode.getComponent(Label);
        if (!label) {
            throw new Error(`[GameScene] pending startup title is missing Label component on ${useLevel1Variant ? 'TopBarGroup/LevelTitleLevel1/Label' : 'TopBarGroup/LevelTitle/Label'}`);
        }
        label.string = `第${levelId}关`;
        this.runtime.levelLabel = label;
        const timerWrap = topBar.getChildByName('TimerWrap');
        if (timerWrap?.isValid) {
            timerWrap.active = false;
        }
        markStartupTrace('startup_game_shell_primed', {
            levelId,
            entryMode: pending.entryMode,
        });
    }

    private promoteLoadingOverlayToFront(layer: Node | null): void {
        const overlay = layer?.isValid ? layer : null;
        const bootRoot = overlay?.parent?.isValid ? overlay.parent : null;
        const canvas = bootRoot?.parent?.isValid ? bootRoot.parent : null;
        if (bootRoot && canvas) {
            bootRoot.setSiblingIndex(Math.max(0, canvas.children.length - 1));
        }
        if (overlay?.parent?.isValid) {
            overlay.setSiblingIndex(Math.max(0, overlay.parent.children.length - 1));
        }
    }

    update(dt: number): void {
        this.runtime.vigorTick(dt);
    }

    destroy(): void {
        const sceneName = this.getRuntimeSceneName();
        this.runtime.cancelRewardedGrantInteraction?.(`scene-destroy:${sceneName}`);
        debugPerfSnapshot('runtime.destroy.before', this.runtime, {
            sceneName,
        });
        if (sceneName === 'Game') {
            AnalyticsMgr.inst.abandonActiveLevel();
            SySDKMgr.inst.reportLevelExit(this.runtime.getAnalyticsLevelId());
        }
        this.runtime.scanRenderSpriteFrameHealth?.(`runtime.destroy.before:${sceneName}`, null, { always: true });
        this.runtime.stopRenderResourceDiagnostics?.(`runtime-destroy:${sceneName}`);
        this.runtime.resetFirstLevelReleaseDiagnostics?.();
        this.runtime.unbindFirstLevelReleaseTouchObserver?.();
        this.runtime.unbindUserStateLifecycle();
        void UserStateSyncMgr.inst.flushPendingSave();
        this.runtime.unscheduleAllCallbacks();
        this.runtime.stopPulseTweens();
        this.runtime.clearBeanSettleMatchFx?.();
        this.runtime.clearPatternCompleteMatchFx?.();
        this.runtime.clearIdleHint();
        this.runtime.clearSelectionOverlay();
        this.runtime.clearDragNodes();
        this.runtime.clearExpandSlotGuide?.();
        this.runtime._gameCirclePanelController?.destroy?.();
        UserMgr.inst.destroyUserInfoButtons();
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
        this.runtime.releaseBackgroundSkinCachedSpriteFrames?.(`runtime-destroy:${sceneName}`);
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
