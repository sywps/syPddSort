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
    tween,
    Tween,
    UITransform,
    view,
} from 'cc';
import { AppRoot } from './AppRoot';
import { resolveStartupRouteDecision } from './StartupRouteService';
import { markStartupTrace } from './StartupTrace';

const { ccclass, property } = _decorator;
const VIEWPORT_WIDTH = 720;
const VIEWPORT_HEIGHT = 1280;
const BOOT_LOADING_DOT_INTERVAL = 0.28;
const BOOT_LOADING_PROGRESS_STEP_FAST = 0.2;
const BOOT_LOADING_PROGRESS_STEP_SLOW = 0.4;
const BOOT_LOADING_PROGRESS_STEP_TWO_DELAY = 0.22;

markStartupTrace('startup_main_loaded', { source: 'BootSceneCtrl.module' });

@ccclass('BootSceneCtrl')
export class BootSceneCtrl extends Component {
    @property(SpriteFrame)
    protected loadingCover: SpriteFrame | null = null;

    private bootLoadingProgressBar: ProgressBar | null = null;
    private bootLoadingLabel: Label | null = null;
    private bootLoadingProgress = 0;
    private bootLoadingPercent = 0;
    private bootLoadingDotCount = 3;
    private bootLoadingPercentTween: Tween<{ value: number }> | null = null;
    private readonly tickBootLoadingDots = () => {
        this.bootLoadingDotCount = this.bootLoadingDotCount >= 3 ? 1 : this.bootLoadingDotCount + 1;
        this.syncBootLoadingLabel();
    };

    start() {
        const appRoot = AppRoot.ensure('Boot');
        const bootRouteKey = String((this.node as any)?.uuid || (this.node as any)?._id || 'Boot');
        appRoot.session.resetBootRouteGuard(bootRouteKey);
        appRoot.markBoot('Boot');
        appRoot.clearRouteCoverForBoot();

        this.prepareBootFrame();
        this.showBootLoadingUi();
        markStartupTrace('app_launch', { source: 'BootSceneCtrl.start' });
        markStartupTrace('startup_boot_start', { source: 'BootSceneCtrl.start' });

        const routeDecision = resolveStartupRouteDecision();
        if (routeDecision.shouldMarkPendingGameplay) {
            appRoot.markGameRequested(routeDecision.levelId, routeDecision.prefix, 'main', 'auto', routeDecision.reason);
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
                appRoot.clearRouteCover('boot-route-error');
            });
        }, 0);
    }

    onDestroy() {
        this.stopBootLoadingAnimation();
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
        bootRoot.active = true;
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

        const cover = this.requireChild(loading, 'LoadingCover', 'StartupLoadingUI/LoadingCover');
        cover.active = true;
        const coverSprite = cover.getComponent(Sprite);
        if (coverSprite && !coverSprite.spriteFrame && this.loadingCover) {
            coverSprite.spriteFrame = this.loadingCover;
        }

        const progressArea = loading
            .getChildByName('LoadingProgressGroup')
            ?.getChildByName('LoadingBarTrack')
            ?.getChildByName('ProgressBarArea') || null;
        const progressBar = progressArea?.getComponent(ProgressBar) || null;

        const label = loading
            .getChildByName('LoadingProgressGroup')
            ?.getChildByName('Label')
            ?.getComponent(Label) || null;
        this.bootLoadingProgressBar = progressBar;
        this.bootLoadingLabel = label;
        if (label) label.enableWrapText = false;
        this.startBootLoadingProgress();
    }

    private startBootLoadingProgress(): void {
        this.stopBootLoadingAnimation();
        this.bootLoadingProgress = 0;
        this.bootLoadingPercent = 0;
        this.bootLoadingDotCount = 3;
        this.setBootLoadingProgress(0, 0);
        this.schedule(this.tickBootLoadingDots, BOOT_LOADING_DOT_INTERVAL);
        this.scheduleOnce(() => {
            if (!this.node?.isValid) return;
            this.setBootLoadingProgress(0.5, BOOT_LOADING_PROGRESS_STEP_FAST);
        }, 0);
        this.scheduleOnce(() => {
            if (!this.node?.isValid) return;
            this.setBootLoadingProgress(0.8, BOOT_LOADING_PROGRESS_STEP_SLOW);
        }, BOOT_LOADING_PROGRESS_STEP_TWO_DELAY);
    }

    private setBootLoadingProgress(progress: number, duration: number): void {
        const progressBar = this.bootLoadingProgressBar;
        const prev = this.bootLoadingProgress;
        const next = Math.max(prev, Math.max(0, Math.min(1, progress)));
        this.bootLoadingProgress = next;
        this.animateBootLoadingPercent(next, duration);
        if (!progressBar) return;
        Tween.stopAllByTarget(progressBar);
        if (duration <= 0) {
            progressBar.progress = next;
            return;
        }
        tween(progressBar).to(duration, { progress: next }, { easing: 'sineOut' }).start();
    }

    private animateBootLoadingPercent(progress: number, duration: number): void {
        if (this.bootLoadingPercentTween) {
            this.bootLoadingPercentTween.stop();
            this.bootLoadingPercentTween = null;
        }
        const fromPercent = this.bootLoadingPercent;
        const toPercent = Math.max(0, Math.min(100, Math.round(progress * 100)));
        if (duration <= 0 || fromPercent === toPercent) {
            this.bootLoadingPercent = toPercent;
            this.syncBootLoadingLabel();
            return;
        }
        const state = { value: fromPercent };
        this.bootLoadingPercentTween = tween(state)
            .to(duration, { value: toPercent }, {
                easing: 'sineOut',
                onUpdate: (target: { value: number }) => {
                    this.bootLoadingPercent = Math.max(0, Math.min(100, Math.round(target.value)));
                    this.syncBootLoadingLabel();
                },
            })
            .call(() => {
                this.bootLoadingPercent = toPercent;
                this.syncBootLoadingLabel();
                this.bootLoadingPercentTween = null;
            })
            .start();
    }

    private syncBootLoadingLabel(): void {
        if (!this.bootLoadingLabel) return;
        const dots = '.'.repeat(this.bootLoadingDotCount);
        this.bootLoadingLabel.string = `加载中${dots}${this.bootLoadingPercent}%`;
    }

    private stopBootLoadingAnimation(): void {
        this.unschedule(this.tickBootLoadingDots);
        if (this.bootLoadingPercentTween) {
            this.bootLoadingPercentTween.stop();
            this.bootLoadingPercentTween = null;
        }
        if (this.bootLoadingProgressBar) {
            Tween.stopAllByTarget(this.bootLoadingProgressBar);
        }
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
