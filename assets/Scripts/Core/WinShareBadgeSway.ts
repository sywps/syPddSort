import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;
const SWAY_DEGREES = 6;
const SWAY_SECONDS = 2.4;

@ccclass('WinShareBadgeSway')
export class WinShareBadgeSway extends Component {
    private baseAngle: number | null = null;
    private elapsed = 0;

    onEnable(): void {
        if (this.baseAngle === null) this.baseAngle = this.node.angle;
        this.elapsed = 0;
        this.node.angle = this.baseAngle;
    }

    update(dt: number): void {
        this.elapsed += Math.max(0, dt);
        const ramp = Math.min(1, this.elapsed / 0.35);
        const amplitude = ramp * ramp * (3 - 2 * ramp);
        // The prefab anchors this node at the bubble tip; the button stays still.
        this.node.angle = this.baseAngle! + SWAY_DEGREES * amplitude
            * Math.sin(this.elapsed * Math.PI * 2 / SWAY_SECONDS);
    }

    onDisable(): void {
        if (this.baseAngle !== null) this.node.angle = this.baseAngle;
    }
}
