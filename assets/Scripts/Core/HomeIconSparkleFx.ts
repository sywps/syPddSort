import {
    _decorator,
    assetManager,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    UIOpacity,
} from 'cc';
import { HOME_ASSETS_BUNDLE_NAME } from './PackageNames';

const { ccclass } = _decorator;

const HOME_ICON_SPARKLE_PATH = 'GameUI/home_icon_sparkle';

interface HomeIconSparklePoint {
    x: number;
    y: number;
    scale: number;
    angle: number;
}

export interface HomeIconSparkleFxOptions {
    initialDelay?: number;
    interval?: number;
    duration?: number;
    size?: number;
    peakOpacity?: number;
    points?: HomeIconSparklePoint[];
}

let cachedSparkleFrame: SpriteFrame | null = null;
let sparkleFrameLoading = false;
let sparkleFrameCallbacks: Array<(frame: SpriteFrame | null) => void> = [];

function loadHomeIconSparkleFrame(callback: (frame: SpriteFrame | null) => void): void {
    if (cachedSparkleFrame?.isValid) {
        callback(cachedSparkleFrame);
        return;
    }
    sparkleFrameCallbacks.push(callback);
    if (sparkleFrameLoading) return;
    sparkleFrameLoading = true;
    assetManager.loadBundle(HOME_ASSETS_BUNDLE_NAME, (bundleErr, bundle) => {
        if (bundleErr || !bundle) {
            console.error(`[HomeIconSparkleFx] failed to load ${HOME_ASSETS_BUNDLE_NAME} bundle`, bundleErr?.message || 'missing bundle');
            finishSparkleFrameLoad(null);
            return;
        }
        const candidates = [`${HOME_ICON_SPARKLE_PATH}/spriteFrame`, HOME_ICON_SPARKLE_PATH];
        const tryLoad = (index: number) => {
            if (index >= candidates.length) {
                console.error(`[HomeIconSparkleFx] missing SpriteFrame: ${HOME_ICON_SPARKLE_PATH}`);
                finishSparkleFrameLoad(null);
                return;
            }
            bundle.load(candidates[index], SpriteFrame, (frameErr, frame) => {
                if (!frameErr && frame) {
                    finishSparkleFrameLoad(frame);
                    return;
                }
                tryLoad(index + 1);
            });
        };
        tryLoad(0);
    });
}

function finishSparkleFrameLoad(frame: SpriteFrame | null): void {
    sparkleFrameLoading = false;
    cachedSparkleFrame = frame;
    const callbacks = sparkleFrameCallbacks;
    sparkleFrameCallbacks = [];
    for (const callback of callbacks) callback(frame);
}

@ccclass('HomeIconSparkleFx')
export class HomeIconSparkleFx extends Component {
    initialDelay = 0.35;
    interval = 0.5;
    duration = 0.36;
    size = 5;
    peakOpacity = 210;
    points: HomeIconSparklePoint[] = [
        { x: -18, y: 24, scale: 0.86, angle: -12 },
        { x: 16, y: 28, scale: 1, angle: 10 },
        { x: 24, y: 4, scale: 0.72, angle: 28 },
        { x: -12, y: -18, scale: 0.78, angle: -24 },
        { x: 6, y: 18, scale: 0.62, angle: 18 },
    ];

    private _sparkleNode: Node | null = null;
    private _sparkleOpacity: UIOpacity | null = null;
    private _elapsed = 0;
    private _nextFlashAt = this.initialDelay;
    private _flashElapsed = this.duration;
    private _pointIndex = 0;
    private _activePoint: HomeIconSparklePoint = this.points[0];

    configure(options: HomeIconSparkleFxOptions = {}): void {
        if (typeof options.initialDelay === 'number') this.initialDelay = Math.max(0, options.initialDelay);
        if (typeof options.interval === 'number') this.interval = Math.max(0.2, options.interval);
        if (typeof options.duration === 'number') this.duration = Math.max(0.1, options.duration);
        if (typeof options.size === 'number') this.size = Math.max(1, options.size);
        if (typeof options.peakOpacity === 'number') this.peakOpacity = Math.max(0, Math.min(255, options.peakOpacity));
        if (Array.isArray(options.points) && options.points.length > 0) this.points = options.points;
        this.ensureSparkleNode();
        this.refreshSparkleSize();
        this.resetTimeline();
        this.applyPose();
    }

    protected onEnable(): void {
        this.ensureSparkleNode();
        this.refreshSparkleSize();
        this.resetTimeline();
        this.applyPose();
    }

    protected onDisable(): void {
        this.hideSparkle();
    }

    protected onDestroy(): void {
        this.hideSparkle();
        if (this._sparkleNode?.isValid) this._sparkleNode.destroy();
        this._sparkleNode = null;
        this._sparkleOpacity = null;
    }

    protected update(deltaTime: number): void {
        if (!this.node?.isValid || !this._sparkleNode?.isValid || !this._sparkleOpacity) return;
        const dt = Math.min(Math.max(0, deltaTime), 0.1);
        this._elapsed += dt;
        if (this._elapsed >= this._nextFlashAt) {
            this.startFlash();
            this._nextFlashAt = this._elapsed + this.interval;
        }
        this.applyPose();
        this._flashElapsed += dt;
    }

    private ensureSparkleNode(): void {
        if (this._sparkleNode?.isValid) {
            this.refreshSparkleSize();
            return;
        }
        const sparkleNode = new Node('HomeIconSparkle');
        this.node.addChild(sparkleNode);
        sparkleNode.layer = this.node.layer;
        sparkleNode.setPosition(0, 0, 0);
        sparkleNode.addComponent(UITransform).setContentSize(this.size, this.size);
        const sprite = sparkleNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const opacity = sparkleNode.addComponent(UIOpacity);
        opacity.opacity = 0;
        this._sparkleNode = sparkleNode;
        this._sparkleOpacity = opacity;
        loadHomeIconSparkleFrame((frame) => {
            if (!frame || !sparkleNode.isValid) return;
            const loadedSprite = sparkleNode.getComponent(Sprite);
            if (loadedSprite) {
                loadedSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                loadedSprite.spriteFrame = frame;
            }
            this.refreshSparkleSize();
        });
    }

    private refreshSparkleSize(): void {
        if (!this._sparkleNode?.isValid) return;
        const transform = this._sparkleNode.getComponent(UITransform) || this._sparkleNode.addComponent(UITransform);
        transform.setContentSize(this.size, this.size);
        const sprite = this._sparkleNode.getComponent(Sprite);
        if (sprite) sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    }

    private resetTimeline(): void {
        this._elapsed = 0;
        this._nextFlashAt = this.initialDelay;
        this._flashElapsed = this.duration;
        this._pointIndex = 0;
        this._activePoint = this.points[0];
        this.hideSparkle();
    }

    private startFlash(): void {
        this._activePoint = this.points[this._pointIndex % this.points.length];
        this._pointIndex += 1;
        this._flashElapsed = 0;
    }

    private applyPose(): void {
        if (!this._sparkleNode?.isValid || !this._sparkleOpacity) return;
        if (this._flashElapsed >= this.duration) {
            this.hideSparkle();
            return;
        }
        const progress = Math.min(1, this._flashElapsed / this.duration);
        const envelope = Math.sin(Math.PI * progress);
        const scale = this._activePoint.scale * (0.45 + envelope * 0.72);
        this._sparkleNode.active = true;
        this._sparkleNode.setPosition(this._activePoint.x, this._activePoint.y, 0);
        this._sparkleNode.setScale(scale, scale, 1);
        this._sparkleNode.angle = this._activePoint.angle + progress * 42;
        this._sparkleOpacity.opacity = Math.round(this.peakOpacity * envelope);
    }

    private hideSparkle(): void {
        if (!this._sparkleNode?.isValid || !this._sparkleOpacity) return;
        this._sparkleOpacity.opacity = 0;
        this._sparkleNode.active = false;
    }
}

export function ensureHomeIconSparkleFx(node: Node, options: HomeIconSparkleFxOptions = {}): HomeIconSparkleFx {
    const component = node.getComponent(HomeIconSparkleFx) || node.addComponent(HomeIconSparkleFx);
    component.configure(options);
    return component;
}
