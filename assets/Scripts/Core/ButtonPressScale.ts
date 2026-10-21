import { _decorator, Button, Component, EventTouch, Node, Tween, UITransform, Vec3, tween } from 'cc';

const { ccclass, property } = _decorator;

/** Adds press scale to buttons whose native transition already owns their colors. */
@ccclass('ButtonPressScale')
export class ButtonPressScale extends Component {
    @property({ tooltip: '相对原尺寸的按压比例' }) pressScale = 0.95;
    @property({ tooltip: '按下与恢复的过渡时间（秒）' }) duration = 0.08;
    private button: Button | null = null;
    private target: Node | null = null;
    private base: Vec3 | null = null;
    private activeTouch = false;
    private inside = false;
    private motion: Tween<Node> | null = null;

    protected onEnable(): void {
        this.button = this.getComponent(Button);
        this.node.on(Node.EventType.TOUCH_START, this.press, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.move, this);
        this.node.on(Node.EventType.TOUCH_END, this.release, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.release, this);
    }
    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.press, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.move, this);
        this.node.off(Node.EventType.TOUCH_END, this.release, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.release, this);
        this.reset();
    }
    protected update(): void {
        if (this.base && (!this.button?.interactable || !this.button.enabledInHierarchy)) this.reset();
    }
    private press(): void {
        if (!this.button?.interactable || !this.button.enabledInHierarchy || this.activeTouch) return;
        this.motion?.stop();
        this.target = this.button.target || this.node;
        this.base ||= this.target.scale.clone();
        this.activeTouch = this.inside = true;
        this.animate(true);
    }
    private move(event: EventTouch): void {
        if (!this.activeTouch || !event.touch) return;
        const inside = !!this.node.getComponent(UITransform)?.hitTest(event.touch.getLocation(), event.windowId);
        if (inside !== this.inside) { this.inside = inside; this.animate(inside); }
    }
    private release(): void {
        if (!this.activeTouch) return;
        this.activeTouch = this.inside = false;
        this.animate(false);
    }
    private animate(pressed: boolean): void {
        if (!this.target?.isValid || !this.base) return;
        this.motion?.stop();
        const scale = this.base.clone();
        if (pressed) { scale.x *= this.pressScale; scale.y *= this.pressScale; }
        this.motion = tween(this.target).to(this.duration, { scale }).call(() => {
            this.motion = null;
            if (!this.activeTouch) { this.base = null; this.target = null; }
        }).start();
    }
    private reset(): void {
        this.motion?.stop(); this.motion = null;
        if (this.target?.isValid && this.base) this.target.setScale(this.base);
        this.base = null; this.target = null; this.activeTouch = this.inside = false;
    }
}
