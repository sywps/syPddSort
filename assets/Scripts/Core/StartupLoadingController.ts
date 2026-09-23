import { _decorator, BlockInputEvents, Button, Camera, Canvas, Color, Component, Director, director, Graphics, Label, Node, Sprite, UITransform, view, Widget } from 'cc';
import { createSlicedLoadingProgressAdapter, type SlicedLoadingProgressAdapter } from './SlicedLoadingProgressAdapter';

const { ccclass } = _decorator;
// Dedicated camera visibility keeps the persistent Canvas out of Game's UI camera.
const STARTUP_LAYER = 1 << 27;

@ccclass('StartupLoadingController')
export class StartupLoadingController extends Component {
    private label!: Label;
    private progress!: SlicedLoadingProgressAdapter;
    private cover!: Node;
    private percentage!: Label;
    private completed = new Set<string>();
    private completedPercent = 0;
    private failed = false;
    private closing = false;
    private afterDraw: (() => void) | null = null;
    private restartButton: Node | null = null;
    private track: Node | null = null;
    private restartAction: (() => void) | null = null;
    private stage = '';

    initialize(): void {
        const canvas = this.node.getComponent(Canvas);
        const camera = canvas?.cameraComponent;
        const loading = this.node.getChildByPath('BootRoot/StartupLoadingUI');
        const cover = loading?.getChildByName('LoadingCover');
        const group = loading?.getChildByName('LoadingProgressGroup');
        const label = group?.getChildByName('Label')?.getComponent(Label);
        const track = group?.getChildByName('LoadingBarTrack');
        const percentage = track?.getChildByName('Percentage')?.getComponent(Label);
        if (!canvas || !camera || !loading || !cover?.getComponent(Sprite)?.spriteFrame || !label || !track || !percentage) {
            throw new Error('[StartupLoading] Boot Canvas is missing its authored camera, cover or progress UI');
        }
        this.cover = cover;
        this.label = label;
        this.track = track;
        this.percentage = percentage;
        const restart = new Node('SlowLoadingRestart');
        restart.parent = group!;
        restart.setPosition(track.position);
        restart.addComponent(UITransform).setContentSize(230, 60);
        const background = restart.addComponent(Graphics);
        background.fillColor = new Color(35, 137, 232, 255);
        background.roundRect(-115, -30, 230, 60, 22);
        background.fill();
        restart.addComponent(Button);
        const caption = new Node('Label');
        caption.parent = restart;
        caption.addComponent(UITransform).setContentSize(230, 60);
        const restartLabel = caption.addComponent(Label);
        restartLabel.string = '重启游戏';
        restartLabel.fontSize = 28;
        restartLabel.lineHeight = 34;
        restartLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        restartLabel.verticalAlign = Label.VerticalAlign.CENTER;
        restart.on(Button.EventType.CLICK, () => this.restartAction?.(), this);
        restart.active = false;
        this.restartButton = restart;
        label.enableWrapText = true;
        label.node.getComponent(UITransform)!.setContentSize(580, 110);
        camera.visibility = STARTUP_LAYER;
        camera.priority = 100;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(78, 199, 252, 255);
        const setLayer = (node: Node) => {
            node.layer = STARTUP_LAYER;
            for (const child of node.children) setLayer(child);
        };
        setLayer(this.node);
        const blocker = loading.getComponent(BlockInputEvents) || loading.addComponent(BlockInputEvents);
        blocker.enabled = true;
        this.progress = createSlicedLoadingProgressAdapter(track, 'StartupLoading/LoadingBarTrack', true);
        view.on('canvas-resize', this.resize, this);
        view.on('design-resolution-changed', this.resize, this);
        this.resize();
        this.show('正在加载游戏资源…');
    }

    private resize(): void {
        if (!this.cover?.isValid) return;
        const size = view.getVisibleSize();
        this.node.getComponent(UITransform)!.setContentSize(size.width, size.height);
        const loading = this.cover.parent!;
        loading.getComponent(UITransform)!.setContentSize(size.width, size.height);
        // Fill the screen without stretching; tall phones crop only the artwork's side margins.
        const frame = this.cover.getComponent(Sprite)!.spriteFrame!;
        const scale = Math.max(size.width / frame.originalSize.width, size.height / frame.originalSize.height);
        const widget = this.cover.getComponent(Widget);
        if (widget) widget.enabled = false;
        this.cover.getComponent(UITransform)!.setContentSize(frame.originalSize.width * scale, frame.originalSize.height * scale);
        this.cover.setPosition(0, 0, 0);
        // Keep the bar and slow-load restart action in the artwork's gap above the health notice.
        this.track!.parent!.setPosition(0, -frame.originalSize.height * scale * 0.28, 0);
    }

    show(stage: string): void {
        this.cancelFinish();
        this.clearSlowLoading();
        this.failed = false;
        this.node.active = true;
        this.completed.clear();
        this.completedPercent = 0;
        this.renderProgress(0);
        this.setStage(stage);
    }

    // Weighted startup work, not downloaded bytes. Aliases share one completion slot.
    noteMilestone(event: string): void {
        if (this.failed || this.closing || !this.node.active) return;
        const tasks: Record<string, [string, number]> = {
            'scene-ready': ['scene', 20],
            'route-ready': ['route', 15],
            'external-level-json-loaded': ['data', 20],
            'local-level-json-loaded': ['data', 20],
            'first-level-json-loaded': ['data', 20],
            'bean-atlas-ready': ['beans', 15],
            'bean-atlas-not-required': ['beans', 15],
            'critical-ui-ready': ['ui', 15],
            'board-effects-ready': ['effects', 10],
        };
        const task = tasks[event.replace(/_/g, '-')];
        if (!task || this.completed.has(task[0])) return;
        this.completed.add(task[0]);
        this.completedPercent += task[1];
        this.renderProgress(this.completedPercent);
    }

    private renderProgress(percent: number): void {
        this.progress.progress = percent / 100;
        this.percentage.string = `${percent}%`;
    }

    setStage(stage: string): void {
        if (!this.failed && !this.closing && this.node.active) {
            this.stage = stage;
            if (!this.restartAction) this.label.string = stage;
        }
    }

    showSlowLoading(restart: () => void): void {
        if (this.failed || this.closing || !this.node.active) return;
        this.restartAction = restart;
        this.label.string = '加载较慢，请稍候';
        if (this.track) this.track.active = false;
        if (this.restartButton) this.restartButton.active = true;
    }

    clearSlowLoading(): void {
        this.restartAction = null;
        if (this.restartButton) this.restartButton.active = false;
        if (this.track) this.track.active = true;
        if (!this.failed && this.label) this.label.string = this.stage;
    }

    fail(message: string): void {
        this.cancelFinish();
        this.clearSlowLoading();
        this.failed = true;
        this.node.active = true;
        this.label.string = `${message}\n请退出后重新进入游戏`;
        this.progress.fillNode.active = false;
    }

    finishAfterDraw(onFinished: () => void): void {
        if (this.failed || this.closing) return;
        if (!this.node.active) { onFinished(); return; }
        this.clearSlowLoading();
        // The caller certifies all required work (including route-specific assets) is ready.
        this.renderProgress(99);
        this.closing = true;
        this.afterDraw = () => {
            this.renderProgress(100);
            // Render the completed state once; no timer or minimum hold is added.
            this.afterDraw = () => {
                this.afterDraw = null;
                this.hide();
                onFinished();
            };
            director.once(Director.EVENT_AFTER_DRAW, this.afterDraw, this);
        };
        director.once(Director.EVENT_AFTER_DRAW, this.afterDraw, this);
    }

    hide(): void {
        this.cancelFinish();
        this.clearSlowLoading();
        this.node.active = false;
    }

    private cancelFinish(): void {
        if (this.afterDraw) director.off(Director.EVENT_AFTER_DRAW, this.afterDraw, this);
        this.afterDraw = null;
        this.closing = false;
    }

    onDestroy(): void {
        this.cancelFinish();
        view.off('canvas-resize', this.resize, this);
        view.off('design-resolution-changed', this.resize, this);
    }
}
