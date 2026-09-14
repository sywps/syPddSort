import {
    _decorator,
    Component,
    Node,
    Tween,
    UIOpacity,
    Vec3,
    tween,
} from 'cc';

const { ccclass } = _decorator;

const IDLE_BOUNCE_INITIAL_DELAY = 0.5;
const IDLE_BOUNCE_REPEAT_DELAY = 1.45;

@ccclass('HomeStartButtonFx')
export class HomeStartButtonFx extends Component {
    private readonly _basePosition = new Vec3();
    private readonly _baseScale = new Vec3();
    private _baseAngle = 0;
    private _hasBase = false;
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
        this._buttonOpacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        this._buttonOpacity.opacity = 255;
    }

    private restartFx(): void {
        if (!this._hasBase || this._destroying) return;
        this.stopTweensForOwnedNodes();
        this.restoreBaseState();
        this.startIdleFx();
    }

    private startIdleFx(): void {
        this.startIdleScaleBounce();
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

    private stopTweensForNode(node: Node | null): void {
        if (!node?.isValid) return;
        Tween.stopAllByTarget(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
    }

    private stopTweensForOwnedNodes(): void {
        this.stopTweensForNode(this.node);
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
