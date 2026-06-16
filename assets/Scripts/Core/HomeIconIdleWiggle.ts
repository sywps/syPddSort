import { _decorator, Component, Node, Vec3 } from 'cc';

const { ccclass } = _decorator;

export interface HomeIconIdleWiggleOptions {
    initialDelay?: number;
    interval?: number;
    angle?: number;
    offsetX?: number;
    offsetY?: number;
    liftDuration?: number;
    shakeDuration?: number;
    returnDuration?: number;
    shakeCount?: number;
}

@ccclass('HomeIconIdleWiggle')
export class HomeIconIdleWiggle extends Component {
    initialDelay = 1.2;
    interval = 2;
    angle = 5;
    offsetX = 2.4;
    offsetY = 4;
    liftDuration = 0.24;
    shakeDuration = 0.78;
    returnDuration = 0.18;
    shakeCount = 3;

    private readonly _basePosition = new Vec3();
    private _baseAngle = 0;
    private _hasBase = false;
    private _elapsed = 0;
    private _nextActionAt = this.initialDelay;
    private _actionElapsed = this.getActionDuration();

    configure(options: HomeIconIdleWiggleOptions = {}): void {
        if (typeof options.initialDelay === 'number') this.initialDelay = Math.max(0, options.initialDelay);
        if (typeof options.interval === 'number') this.interval = Math.max(1.2, options.interval);
        if (typeof options.angle === 'number') this.angle = Math.max(0, options.angle);
        if (typeof options.offsetX === 'number') this.offsetX = Math.max(0, options.offsetX);
        if (typeof options.offsetY === 'number') this.offsetY = Math.max(0, options.offsetY);
        if (typeof options.liftDuration === 'number') this.liftDuration = Math.max(0.12, options.liftDuration);
        if (typeof options.shakeDuration === 'number') this.shakeDuration = Math.max(0.12, options.shakeDuration);
        if (typeof options.returnDuration === 'number') this.returnDuration = Math.max(0.08, options.returnDuration);
        if (typeof options.shakeCount === 'number') this.shakeCount = Math.max(1, Math.floor(options.shakeCount));
        this.captureBaseIfNeeded();
        this.resetTimeline();
        this.applyPose();
    }

    protected onEnable(): void {
        this.captureBaseIfNeeded();
        this.resetTimeline();
        this.applyPose();
    }

    protected onDisable(): void {
        this.stopAndReset();
    }

    protected onDestroy(): void {
        this.stopAndReset();
    }

    protected update(deltaTime: number): void {
        if (!this.node?.isValid || !this._hasBase) return;
        const dt = Math.min(Math.max(0, deltaTime), 0.1);
        this._elapsed += dt;
        if (this._elapsed >= this._nextActionAt) {
            this._actionElapsed = 0;
            this._nextActionAt = this._elapsed + this.interval;
        }
        this.applyPose();
        this._actionElapsed += dt;
    }

    private captureBaseIfNeeded(): void {
        if (this._hasBase) return;
        this._basePosition.set(this.node.position);
        this._baseAngle = this.node.angle;
        this._hasBase = true;
    }

    private resetTimeline(): void {
        this._elapsed = 0;
        this._nextActionAt = this.initialDelay;
        this._actionElapsed = this.getActionDuration();
    }

    private applyPose(): void {
        const shake = this.getActionPose();
        this.node.setPosition(
            this._basePosition.x + shake.x,
            this._basePosition.y + shake.y,
            this._basePosition.z,
        );
        this.node.angle = this._baseAngle + shake.angle;
    }

    private getActionDuration(): number {
        return this.shakeDuration + this.returnDuration;
    }

    private getActionPose(): { x: number; y: number; angle: number } {
        if (this._actionElapsed >= this.getActionDuration()) {
            return { x: 0, y: 0, angle: 0 };
        }
        const shakeProgress = Math.min(1, this._actionElapsed / this.shakeDuration);
        if (shakeProgress < 1) {
            const liftProgress = Math.min(1, this._actionElapsed / this.liftDuration);
            const envelope = Math.sin(Math.PI * shakeProgress);
            const wave = Math.sin(Math.PI * 2 * this.shakeCount * shakeProgress);
            return {
                x: wave * envelope * this.offsetX,
                y: this.easeOutSine(liftProgress) * this.offsetY,
                angle: wave * envelope * this.angle,
            };
        }

        const returnProgress = Math.min(
            1,
            (this._actionElapsed - this.shakeDuration) / this.returnDuration,
        );
        return {
            x: 0,
            y: (1 - this.easeInOutSine(returnProgress)) * this.offsetY,
            angle: 0,
        };
    }

    private easeOutSine(progress: number): number {
        return Math.sin((Math.PI * progress) / 2);
    }

    private easeInOutSine(progress: number): number {
        return -(Math.cos(Math.PI * progress) - 1) / 2;
    }

    private stopAndReset(): void {
        if (!this.node?.isValid || !this._hasBase) return;
        this.node.setPosition(this._basePosition);
        this.node.angle = this._baseAngle;
    }
}

export function ensureHomeIconIdleWiggle(node: Node, options: HomeIconIdleWiggleOptions = {}): HomeIconIdleWiggle {
    const component = node.getComponent(HomeIconIdleWiggle) || node.addComponent(HomeIconIdleWiggle);
    component.configure(options);
    return component;
}
