import {
    _decorator,
    BlockInputEvents,
    Component,
    Label,
    ProgressBar,
    ResolutionPolicy,
    Size,
    Sprite,
    SpriteFrame,
    UITransform,
    view,
} from 'cc';
import { AppRoot } from './AppRoot';
import { resolveStartupRouteDecision } from './StartupRouteService';
import { markStartupTrace } from './StartupTrace';

const { ccclass, property } = _decorator;
const VIEWPORT_WIDTH = 720;
const VIEWPORT_HEIGHT = 1280;

markStartupTrace('startup_main_loaded', { source: 'BootSceneCtrl.module' });

@ccclass('BootSceneCtrl')
export class BootSceneCtrl extends Component {
    @property(SpriteFrame)
    protected loadingCover: SpriteFrame | null = null;

    start() {
        const appRoot = AppRoot.ensure('Boot');
        const bootRouteKey = String((this.node as any)?.uuid || (this.node as any)?._id || 'Boot');
        appRoot.session.resetBootRouteGuard(bootRouteKey);
        appRoot.markBoot('Boot');
        appRoot.resetSceneTransitionForBoot();

        this.prepareBootFrame();
        this.showBootLoadingUi();
        markStartupTrace('app_launch', { source: 'BootSceneCtrl.start' });
        markStartupTrace('startup_boot_start', { source: 'BootSceneCtrl.start' });

        const routeDecision = resolveStartupRouteDecision();
        if (routeDecision.shouldMarkPendingGameplay) {
            appRoot.markGameRequested(routeDecision.levelId, routeDecision.prefix, 'main', 'auto');
        }
        markStartupTrace('startup_boot_route_decided', {
            reason: routeDecision.reason,
            levelId: routeDecision.levelId,
            pendingGameplay: routeDecision.shouldMarkPendingGameplay,
        });

        this.scheduleOnce(() => {
            if (!this.node?.isValid) return;
            if (!appRoot.session.consumeBootRoute()) return;
            markStartupTrace('startup_route_game_start', {
                requestedLevelId: routeDecision.shouldMarkPendingGameplay ? routeDecision.levelId : 0,
                reason: routeDecision.reason,
            });
            void appRoot.router.toGame().catch((error) => {
                console.error('[SceneSplit] boot route failed:', error);
                appRoot.forceHideSceneTransition('boot-route-error');
            });
        }, 0);
    }

    private prepareBootFrame(): void {
        view.setDesignResolutionSize(
            VIEWPORT_WIDTH,
            VIEWPORT_HEIGHT,
            ResolutionPolicy.FIXED_WIDTH,
        );
    }

    private showBootLoadingUi(): void {
        const bootRoot = this.requireCanvasChild('BootRoot');
        const loading = this.requireChild(bootRoot, 'StartupLoadingUI', 'BootRoot/StartupLoadingUI');
        const loadingTransform = loading.getComponent(UITransform);
        if (!loadingTransform) {
            throw new Error('[BootScene] StartupLoadingUI is missing UITransform');
        }
        const visibleSize = this.getVisibleLoadingSize();
        loadingTransform.setContentSize(visibleSize.width, visibleSize.height);
        loading.setPosition(0, 0, 0);
        loading.active = true;
        const blocker = loading.getComponent(BlockInputEvents) || loading.addComponent(BlockInputEvents);
        blocker.enabled = true;

        const cover = loading.getChildByName('LoadingCover');
        const coverSprite = cover?.getComponent(Sprite) || null;
        if (coverSprite && !coverSprite.spriteFrame && this.loadingCover) {
            coverSprite.spriteFrame = this.loadingCover;
        }

        const progressArea = loading
            .getChildByName('LoadingProgressGroup')
            ?.getChildByName('LoadingBarTrack')
            ?.getChildByName('ProgressBarArea') || null;
        const progressBar = progressArea?.getComponent(ProgressBar) || null;
        if (progressBar) progressBar.progress = Math.max(progressBar.progress, 0.05);

        const label = loading
            .getChildByName('LoadingProgressGroup')
            ?.getChildByName('Label')
            ?.getComponent(Label) || null;
        if (label && !label.string) label.string = '加载中...';
    }

    private getVisibleLoadingSize(): Size {
        const viewSize = view.getVisibleSize();
        const frameSize = view.getFrameSize();
        let width = Math.max(viewSize.width || 0, VIEWPORT_WIDTH);
        let height = Math.max(viewSize.height || 0, VIEWPORT_HEIGHT);
        if (frameSize.width > 0 && frameSize.height > 0) {
            const frameAspect = frameSize.width / frameSize.height;
            height = Math.max(height, width / frameAspect);
            width = Math.max(width, height * frameAspect);
        }
        return new Size(Math.ceil(width), Math.ceil(height));
    }

    private requireCanvasChild(name: string) {
        const canvas = this.node.scene?.getChildByName('Canvas') || null;
        if (!canvas) throw new Error('[BootScene] missing Canvas');
        return this.requireChild(canvas, name, `Canvas/${name}`);
    }

    private requireChild(parent: any, name: string, context: string) {
        const child = parent?.getChildByName?.(name) || null;
        if (!child) throw new Error(`[BootScene] missing ${context}`);
        return child;
    }
}
