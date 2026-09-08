import { _decorator, Component, ResolutionPolicy, SpriteFrame, view } from 'cc';
import { AppRoot } from './AppRoot';
import { debugPerfTrace } from './DebugPerfTrace';
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
        appRoot.clearRouteCoverForBoot();

        this.prepareBootFrame();
        this.showBootLoadingUi();
        debugPerfTrace('runtime.boot.start', { source: 'BootSceneCtrl.start' });
        markStartupTrace('app_launch', { source: 'BootSceneCtrl.start' });
        markStartupTrace('startup_boot_start', { source: 'BootSceneCtrl.start' });

        const routeDecision = resolveStartupRouteDecision();
        if (routeDecision.shouldMarkPendingGameplay) {
            appRoot.markGameRequested(routeDecision.levelId, routeDecision.prefix, routeDecision.prefix === 'zt_level_' ? 'theme' : 'main', 'auto', routeDecision.reason);
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
                appRoot.startupLoading?.fail('游戏资源加载失败');
            });
        }, 0);
    }

    private prepareBootFrame(): void {
        view.setDesignResolutionSize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    }

    private showBootLoadingUi(): void {
        const scene = this.node.scene;
        const canvas = scene.getChildByName('Canvas');
        if (!canvas) throw new Error('[BootScene] missing Canvas');
        // Only the authored UI survives the scene switch; the routing component stays in Boot.
        this.node.setParent(scene);
        if (AppRoot.inst.startupLoading?.isValid) {
            canvas.destroy();
            AppRoot.inst.startupLoading.show('正在加载游戏资源…');
            return;
        }
        AppRoot.inst.adoptStartupLoading(canvas);
    }
}
