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
    private elapsed = 0;
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
        if (!canvas || !camera || !loading || !cover?.getComponent(Sprite)?.spriteFrame || !label || !track) {
            throw new Error('[StartupLoading] Boot Canvas is missing its authored camera, cover or progress UI');
        }
        this.cover = cover;
        this.label = label;
        this.track = track;
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
        this.progress = createSlicedLoadingProgressAdapter(track, 'StartupLoading/LoadingBarTrack');
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
        this.setStage(stage);
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
        this.closing = true;
        this.afterDraw = () => {
            this.afterDraw = null;
            this.hide();
            onFinished();
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

    update(dt: number): void {
        if (this.failed || !this.progress) return;
        this.elapsed += dt;
        const width = Math.min(120, this.progress.trackWidth);
        const fill = this.progress.fillNode;
        fill.active = true;
        fill.getComponent(UITransform)!.setContentSize(width / this.progress.fillRenderScale, this.progress.fillHeight / this.progress.fillRenderScale);
        fill.setPosition((this.progress.trackWidth - width) * (0.5 - 0.5 * Math.cos(this.elapsed * Math.PI / 1.2) - 0.5), 0, 0);
    }

    onDestroy(): void {
        this.cancelFinish();
        view.off('canvas-resize', this.resize, this);
        view.off('design-resolution-changed', this.resize, this);
    }
}
