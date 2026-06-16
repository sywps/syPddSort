import { _decorator, BlockInputEvents, Component, Node, Size, Tween, UIOpacity, UITransform, Vec3, view, tween } from 'cc';

const { ccclass } = _decorator;

export interface SceneTransitionPlayOptions {
    expandDuration?: number;
    shrinkDuration?: number;
    holdDuration?: number;
}

const DEFAULT_EXPAND_DURATION = 0.22;
const DEFAULT_SHRINK_DURATION = 0.20;
const DEFAULT_HOLD_DURATION = 0.5;
const LOGO_BASE_SCALE = new Vec3(1, 1, 1);
const LOGO_START_SCALE = new Vec3(0.34, 0.34, 1);
const LOGO_END_SCALE = new Vec3(0.05, 0.05, 1);
const RING_START_SCALE = new Vec3(0.16, 0.16, 1);
const MIDDLE_EXPAND_SCALE = new Vec3(1.65, 1.65, 1);
const INNER_EXPAND_SCALE = new Vec3(1.22, 1.22, 1);
const RING_END_SCALE = new Vec3(0.04, 0.04, 1);
const RING_BREATH_PERIOD = 0.9;
const RING_BREATH_TAU = Math.PI * 2;

@ccclass('SceneTransitionController')
export class SceneTransitionController extends Component {
    private blueBg: Node | null = null;
    private ringOuter: Node | null = null;
    private ringMiddle: Node | null = null;
    private ringInner: Node | null = null;
    private logo: Node | null = null;
    private playing = false;
    private covered = false;
    private coveredAtMs = 0;
    private ringBreathing = false;
    private ringBreathTime = 0;

    protected onLoad(): void {
        this.captureNodes();
        this.ensureInputBlocker();
        this.syncLayout();
    }

    protected onEnable(): void {
        this.captureNodes();
        this.syncLayout();
    }

    protected onDisable(): void {
        this.stopTweens();
        this.stopRingBreathing();
        this.playing = false;
        this.covered = false;
        this.coveredAtMs = 0;
    }

    protected update(dt: number): void {
        if (!this.ringBreathing || !this.covered) return;
        this.ringBreathTime += Math.max(0, dt);
        this.applyRingBreathingPose();
    }

    async play(
        onCovered?: () => void | Promise<void>,
        options: SceneTransitionPlayOptions = {},
    ): Promise<void> {
        await this.beginCover(options);
        const holdDuration = Math.max(0, options.holdDuration ?? DEFAULT_HOLD_DURATION);

        let coveredError: unknown = null;
        if (onCovered) {
            try {
                await onCovered();
            } catch (error) {
                coveredError = error;
            }
        }

        if (holdDuration > 0) {
            await this.delay(holdDuration);
        }

        await this.finishCover(options);
        if (coveredError) {
            throw coveredError;
        }
    }

    async beginCover(options: SceneTransitionPlayOptions = {}): Promise<void> {
        if (this.covered) return;
        if (this.playing) return;
        this.playing = true;
        this.node.active = true;
        this.captureNodes();
        this.ensureInputBlocker();
        this.syncLayout();
        this.stopTweens();
        this.stopRingBreathing();
        this.applyStartPose();

        const expandDuration = Math.max(0.1, options.expandDuration ?? DEFAULT_EXPAND_DURATION);

        await Promise.all([
            this.tweenScale(this.ringMiddle, expandDuration, MIDDLE_EXPAND_SCALE, 'sineOut'),
            this.tweenScale(this.ringInner, expandDuration, INNER_EXPAND_SCALE, 'sineOut'),
            this.tweenScale(this.logo, expandDuration * 0.88, LOGO_BASE_SCALE, 'backOut'),
        ]);

        this.applyCoveredPose();
        this.covered = true;
        this.coveredAtMs = Date.now();
        this.playing = false;
        this.startRingBreathing();
    }

    async finishCover(options: SceneTransitionPlayOptions = {}): Promise<void> {
        if (!this.node.active && !this.covered) return;
        if (this.playing) return;
        this.playing = true;
        this.node.active = true;
        this.captureNodes();
        this.ensureInputBlocker();
        this.syncLayout();
        this.stopRingBreathing();
        this.stopTweens();
        if (!this.covered) {
            this.applyCoveredPose();
            this.coveredAtMs = Date.now();
        }

        const shrinkDuration = Math.max(0.1, options.shrinkDuration ?? DEFAULT_SHRINK_DURATION);
        const holdDuration = Math.max(0, options.holdDuration ?? DEFAULT_HOLD_DURATION);
        const remainingHoldMs = Math.max(0, holdDuration * 1000 - (Date.now() - this.coveredAtMs));
        if (remainingHoldMs > 0) {
            await this.delay(remainingHoldMs / 1000);
        }

        await Promise.all([
            this.tweenScale(this.ringMiddle, shrinkDuration, RING_END_SCALE, 'sineInOut'),
            this.tweenScale(this.ringInner, shrinkDuration, RING_END_SCALE, 'sineInOut'),
            this.tweenScale(this.logo, shrinkDuration * 0.82, LOGO_END_SCALE, 'sineInOut'),
        ]);

        this.node.active = false;
        this.covered = false;
        this.coveredAtMs = 0;
        this.playing = false;
    }

    resetHidden(): void {
        this.stopTweens();
        this.stopRingBreathing();
        this.applyStartPose();
        this.node.active = false;
        this.playing = false;
        this.covered = false;
        this.coveredAtMs = 0;
    }

    private captureNodes(): void {
        this.blueBg = this.node.getChildByName('BlueBg');
        this.ringOuter = this.node.getChildByName('RingOuter');
        this.ringMiddle = this.node.getChildByName('RingMiddle');
        this.ringInner = this.node.getChildByName('RingInner');
        this.logo = this.node.getChildByName('Logo');
    }

    private syncLayout(): void {
        const size = this.getVisibleSize();
        this.setContentSize(this.node, size.width, size.height);
        this.setContentSize(this.blueBg, size.width + 8, size.height + 8);
        this.setContentSize(this.ringOuter, 520, 520);
        this.setContentSize(this.ringMiddle, 520, 520);
        this.setContentSize(this.ringInner, 400, 400);
        this.setContentSize(this.logo, 330, 80);
        for (const node of [this.blueBg, this.ringOuter, this.ringMiddle, this.ringInner, this.logo]) {
            node?.setPosition(0, 0, 0);
        }
    }

    private applyStartPose(): void {
        this.activateVisualNodes();
        this.hideOuterRing();
        this.setScale(this.ringMiddle, RING_START_SCALE);
        this.setScale(this.ringInner, RING_START_SCALE);
        this.setScale(this.logo, LOGO_START_SCALE);
        this.setOpacity(this.ringMiddle, 190);
        this.setOpacity(this.ringInner, 235);
        this.setOpacity(this.logo, 255);
    }

    private applyCoveredPose(): void {
        this.activateVisualNodes();
        this.hideOuterRing();
        this.setScale(this.ringMiddle, MIDDLE_EXPAND_SCALE);
        this.setScale(this.ringInner, INNER_EXPAND_SCALE);
        this.setScale(this.logo, LOGO_BASE_SCALE);
    }

    private activateVisualNodes(): void {
        if (this.ringOuter) this.ringOuter.active = false;
        for (const node of [this.blueBg, this.ringMiddle, this.ringInner, this.logo]) {
            if (node) node.active = true;
        }
    }

    private hideOuterRing(): void {
        if (!this.ringOuter) return;
        this.ringOuter.active = false;
        this.setScale(this.ringOuter, RING_END_SCALE);
        this.setOpacity(this.ringOuter, 0);
    }

    private ensureInputBlocker(): void {
        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }
    }

    private stopTweens(): void {
        for (const node of [this.ringOuter, this.ringMiddle, this.ringInner, this.logo]) {
            if (node) Tween.stopAllByTarget(node);
        }
    }

    private startRingBreathing(): void {
        this.ringBreathTime = 0;
        this.ringBreathing = true;
        this.applyRingBreathingPose();
    }

    private stopRingBreathing(): void {
        this.ringBreathing = false;
        this.ringBreathTime = 0;
    }

    private applyRingBreathingPose(): void {
        this.hideOuterRing();
        this.applyRingBreathingScale(this.ringMiddle, MIDDLE_EXPAND_SCALE, 0.025, 0);
        this.applyRingBreathingScale(this.ringInner, INNER_EXPAND_SCALE, 0.018, 0);
        this.setScale(this.logo, LOGO_BASE_SCALE);
    }

    private applyRingBreathingScale(node: Node | null, baseScale: Vec3, amplitude: number, phase: number): void {
        if (!node) return;
        node.active = true;
        const wave = Math.sin((this.ringBreathTime / RING_BREATH_PERIOD + phase) * RING_BREATH_TAU);
        const factor = 1 + amplitude * wave;
        node.setScale(baseScale.x * factor, baseScale.y * factor, baseScale.z);
    }

    private tweenScale(node: Node | null, duration: number, scale: Vec3, easing: string): Promise<void> {
        if (!node) return Promise.resolve();
        return new Promise(resolve => {
            let finished = false;
            const finishOnce = () => {
                if (finished) return;
                finished = true;
                resolve();
            };
            tween(node)
                .to(duration, { scale: new Vec3(scale.x, scale.y, scale.z) }, { easing: easing as any })
                .call(finishOnce)
                .start();
            this.scheduleOnce(finishOnce, duration + 0.05);
        });
    }

    private delay(duration: number): Promise<void> {
        return new Promise(resolve => {
            this.scheduleOnce(resolve, duration);
        });
    }

    private getVisibleSize(): Size {
        const size = view.getVisibleSize();
        return new Size(Math.max(720, size.width), Math.max(1280, size.height));
    }

    private setContentSize(node: Node | null, width: number, height: number): void {
        const ui = node?.getComponent(UITransform);
        if (ui) ui.setContentSize(width, height);
    }

    private setOpacity(node: Node | null, opacity: number): void {
        if (!node) return;
        const uiOpacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        uiOpacity.opacity = opacity;
    }

    private setScale(node: Node | null, scale: Vec3): void {
        node?.setScale(scale.x, scale.y, scale.z);
    }
}

export function ensureSceneTransitionController(node: Node): SceneTransitionController {
    return node.getComponent(SceneTransitionController) || node.addComponent(SceneTransitionController);
}
