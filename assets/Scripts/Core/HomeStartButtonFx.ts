import {
    _decorator,
    Color,
    Component,
    Graphics,
    Node,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
} from 'cc';

const { ccclass } = _decorator;

const FX_ROOT_NAME = 'HomeStartButtonFx-Root';
const FX_SPARKLE_PREFIX = 'HomeStartButtonFx-Sparkle';

const IDLE_BOUNCE_INITIAL_DELAY = 0.5;
const IDLE_BOUNCE_REPEAT_DELAY = 1.45;

type HomeStartButtonSparkleSpec = {
    xRatio: number;
    yRatio: number;
    size: number;
    delay: number;
};

const SPARKLES: HomeStartButtonSparkleSpec[] = [
    { xRatio: -0.42, yRatio: 0.18, size: 11, delay: 0.1 },
    { xRatio: -0.28, yRatio: 0.36, size: 14, delay: 0.42 },
    { xRatio: 0.28, yRatio: 0.36, size: 14, delay: 0.74 },
    { xRatio: 0.42, yRatio: 0.18, size: 11, delay: 1.06 },
    { xRatio: -0.38, yRatio: -0.2, size: 10, delay: 1.38 },
    { xRatio: 0.38, yRatio: -0.2, size: 10, delay: 1.7 },
    { xRatio: -0.1, yRatio: 0.42, size: 10, delay: 2.02 },
    { xRatio: 0.1, yRatio: 0.42, size: 10, delay: 2.34 },
];

@ccclass('HomeStartButtonFx')
export class HomeStartButtonFx extends Component {
    private readonly _basePosition = new Vec3();
    private readonly _baseScale = new Vec3();
    private _baseAngle = 0;
    private _hasBase = false;
    private _fxRoot: Node | null = null;
    private _buttonOpacity: UIOpacity | null = null;
    private _destroying = false;

    configure(): void {
        this.captureBaseState();
        this.prepareFx();
        this.restartFx();
    }

    protected onEnable(): void {
        if (!this.node?.isValid) return;
        this.captureBaseState();
        this.prepareFx();
        this.restartFx();
    }

    protected onDisable(): void {
        this.stopAndReset();
    }

    protected onDestroy(): void {
        this._destroying = true;
        this.stopTweensForOwnedNodes();
        this.restoreBaseState();
        this._fxRoot = null;
        this._buttonOpacity = null;
    }

    private captureBaseState(): void {
        if (this._hasBase) return;
        const runtimeNode = this.node as Node & { __homeSceneBaseScale?: Vec3 };
        const sourceScale = runtimeNode.__homeSceneBaseScale || this.node.scale;
        this._basePosition.set(this.node.position);
        this._baseScale.set(sourceScale.x, sourceScale.y, sourceScale.z);
        this._baseAngle = this.node.angle;
        runtimeNode.__homeSceneBaseScale = this._baseScale.clone();
        this._hasBase = true;
    }

    private prepareFx(): void {
        const transform = this.node.getComponent(UITransform);
        if (!transform) return;
        this.clearFxRoot();
        this._buttonOpacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        this._buttonOpacity.opacity = 255;

        const root = new Node(FX_ROOT_NAME);
        root.layer = this.node.layer;
        this.node.addChild(root);
        root.addComponent(UITransform).setContentSize(transform.width, transform.height);
        root.addComponent(UIOpacity).opacity = 255;
        root.setPosition(0, 0, 0);

        const labelNode = this.node.getChildByName('BtnSub');
        if (labelNode?.isValid) {
            root.setSiblingIndex(labelNode.getSiblingIndex());
        } else {
            root.setSiblingIndex(0);
        }

        SPARKLES.forEach((spec, index) => {
            const sparkle = new Node(`${FX_SPARKLE_PREFIX}-${index}`);
            sparkle.layer = root.layer;
            root.addChild(sparkle);
            sparkle.addComponent(UITransform).setContentSize(spec.size * 2, spec.size * 2);
            sparkle.setPosition(spec.xRatio * transform.width, spec.yRatio * transform.height, 0);
            sparkle.setScale(0.25, 0.25, 1);
            sparkle.addComponent(UIOpacity).opacity = 0;
            this.drawSparkle(sparkle.addComponent(Graphics), spec.size);
        });

        this._fxRoot = root;
    }

    private clearFxRoot(): void {
        if (this._destroying || !this.node?.isValid) {
            this._fxRoot = null;
            return;
        }
        const existing = this.node.getChildByName(FX_ROOT_NAME);
        if (existing?.isValid) {
            this.stopTweensForNode(existing);
            existing.destroy();
        }
        this._fxRoot = null;
    }

    private restartFx(): void {
        if (!this._hasBase || this._destroying) return;
        this.stopTweensForOwnedNodes();
        this.restoreBaseState();
        this.startIdleFx();
    }

    private startIdleFx(): void {
        this.startIdleScaleBounce();
        this.startSparkles();
    }

    private startIdleScaleBounce(): void {
        const basePosition = this._basePosition.clone();
        const baseScale = this._baseScale.clone();
        const firstPopScale = this.scaleVec3(baseScale, 1.07);
        const firstReboundScale = this.scaleVec3(baseScale, 0.985);
        const secondPopScale = this.scaleVec3(baseScale, 1.04);
        const secondReboundScale = this.scaleVec3(baseScale, 0.995);

        this.node.angle = this._baseAngle;
        this.node.setPosition(basePosition);
        this.node.setScale(baseScale);
        tween(this.node)
            .delay(IDLE_BOUNCE_INITIAL_DELAY)
            .call(() => {
                tween(this.node)
                    .to(0.1, { scale: firstPopScale }, { easing: 'sineOut' })
                    .to(0.11, { scale: firstReboundScale }, { easing: 'sineInOut' })
                    .to(0.1, { scale: baseScale }, { easing: 'sineOut' })
                    .to(0.09, { scale: secondPopScale }, { easing: 'sineOut' })
                    .to(0.1, { scale: secondReboundScale }, { easing: 'sineInOut' })
                    .to(0.12, { scale: baseScale }, { easing: 'sineOut' })
                    .delay(IDLE_BOUNCE_REPEAT_DELAY)
                    .union()
                    .repeatForever()
                    .start();
            })
            .start();
    }

    private startSparkles(): void {
        const root = this._fxRoot;
        if (!root?.isValid) return;
        SPARKLES.forEach((spec, index) => {
            const sparkle = root.getChildByName(`${FX_SPARKLE_PREFIX}-${index}`);
            const opacity = sparkle?.getComponent(UIOpacity) || null;
            if (!sparkle || !opacity) return;
            Tween.stopAllByTarget(sparkle);
            Tween.stopAllByTarget(opacity);
            sparkle.angle = 0;
            sparkle.setScale(0.25, 0.25, 1);
            opacity.opacity = 0;
            tween(sparkle)
                .delay(spec.delay)
                .to(0.18, { scale: new Vec3(1, 1, 1), angle: 45 }, { easing: 'sineOut' })
                .to(0.34, { scale: new Vec3(0.35, 0.35, 1), angle: 90 }, { easing: 'sineIn' })
                .delay(2.2)
                .union()
                .repeatForever()
                .start();
            tween(opacity)
                .delay(spec.delay)
                .to(0.12, { opacity: 235 }, { easing: 'sineOut' })
                .delay(0.18)
                .to(0.22, { opacity: 0 }, { easing: 'sineIn' })
                .delay(2.2)
                .union()
                .repeatForever()
                .start();
        });
    }

    private drawSparkle(graphics: Graphics, size: number): void {
        graphics.clear();
        graphics.fillColor = new Color(255, 246, 180, 228);
        graphics.moveTo(0, size);
        graphics.lineTo(size * 0.26, size * 0.26);
        graphics.lineTo(size, 0);
        graphics.lineTo(size * 0.26, -size * 0.26);
        graphics.lineTo(0, -size);
        graphics.lineTo(-size * 0.26, -size * 0.26);
        graphics.lineTo(-size, 0);
        graphics.lineTo(-size * 0.26, size * 0.26);
        graphics.close();
        graphics.fill();
        graphics.fillColor = new Color(255, 255, 255, 210);
        graphics.moveTo(0, size * 0.42);
        graphics.lineTo(size * 0.16, 0);
        graphics.lineTo(0, -size * 0.42);
        graphics.lineTo(-size * 0.16, 0);
        graphics.close();
        graphics.fill();
    }

    private stopTweensForNode(node: Node | null): void {
        if (!node?.isValid) return;
        Tween.stopAllByTarget(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
    }

    private stopTweensForOwnedNodes(): void {
        this.stopTweensForNode(this.node);
        const root = this._fxRoot?.isValid ? this._fxRoot : null;
        this.stopTweensForNode(root);
        if (!root) return;
        for (const child of root.children.slice()) {
            this.stopTweensForNode(child);
        }
    }

    private stopAndReset(): void {
        if (!this.node?.isValid || this._destroying) return;
        this.stopTweensForOwnedNodes();
        this.restoreBaseState();
    }

    private restoreBaseState(): void {
        if (!this.node?.isValid || !this._hasBase) return;
        this.node.setPosition(this._basePosition);
        this.node.setScale(this._baseScale);
        this.node.angle = this._baseAngle;
        if (this._buttonOpacity?.isValid) this._buttonOpacity.opacity = 255;
    }

    private scaleVec3(base: Vec3, scale: number): Vec3 {
        return new Vec3(base.x * scale, base.y * scale, base.z);
    }
}

export function ensureHomeStartButtonFx(node: Node): HomeStartButtonFx {
    const component = node.getComponent(HomeStartButtonFx) || node.addComponent(HomeStartButtonFx);
    component.configure();
    return component;
}
