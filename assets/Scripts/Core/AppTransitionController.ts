import {
    _decorator,
    BlockInputEvents,
    Camera,
    Canvas,
    Component,
    Director,
    director,
    Mask,
    Node,
    UITransform,
    view,
} from 'cc';
import type { AppSceneName } from './AppSession';

const { ccclass } = _decorator;
const APP_TRANSITION_LAYER = 1 << 28;
const COVER_DURATION = 0.32;
const REVEAL_DURATION = 0.34;
const IRIS_OVERSCAN = 2;
const BACKGROUND_ASPECT = 960 / 1280;

type AppTransitionState = 'idle' | 'covering' | 'covered' | 'revealing';
type AppTransitionDirection = 'forward' | 'reverse';

interface AppTransitionTransaction {
    key: string;
    targetScene: AppSceneName;
    direction: AppTransitionDirection;
    token: number;
    task: () => Promise<void>;
    taskStarted: boolean;
    taskFinished: boolean;
    ready: boolean;
    error: unknown | null;
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: unknown) => void;
}

@ccclass('AppTransitionController')
export class AppTransitionController extends Component {
    private irisMask!: UITransform;
    private content!: UITransform;
    private background!: UITransform;
    private blocker!: BlockInputEvents;
    private state: AppTransitionState = 'idle';
    private progress = 0;
    private tokenSeed = 0;
    private transaction: AppTransitionTransaction | null = null;
    private afterDraw: (() => void) | null = null;

    initialize(): void {
        const canvas = this.node.getComponent(Canvas);
        const camera = canvas?.cameraComponent;
        const irisMaskNode = this.node.getChildByName('IrisMask');
        const contentNode = irisMaskNode?.getChildByName('Content');
        const backgroundNode = contentNode?.getChildByName('Background');
        const irisMask = irisMaskNode?.getComponent(UITransform);
        const content = contentNode?.getComponent(UITransform);
        const background = backgroundNode?.getComponent(UITransform);
        if (!canvas || !camera || !irisMaskNode?.getComponent(Mask) || !irisMask || !content || !background) {
            throw new Error('[AppTransition] prefab is missing Canvas, Camera, IrisMask, Content or Background');
        }
        this.irisMask = irisMask;
        this.content = content;
        this.background = background;
        this.blocker = this.node.getComponent(BlockInputEvents) || this.node.addComponent(BlockInputEvents);
        camera.visibility = APP_TRANSITION_LAYER;
        camera.priority = 110;
        camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        this.setLayer(this.node);
        this.blocker.enabled = false;
        view.on('canvas-resize', this.resize, this);
        view.on('design-resolution-changed', this.resize, this);
        this.resize();
        this.node.active = false;
    }

    get isTransitioning(): boolean {
        return this.state !== 'idle' && !!this.transaction;
    }

    isTargeting(sceneName: AppSceneName): boolean {
        return this.isTransitioning && this.transaction?.targetScene === sceneName;
    }

    run(
        key: string,
        targetScene: AppSceneName,
        direction: AppTransitionDirection,
        task: () => Promise<void>,
    ): Promise<void> {
        const active = this.transaction;
        if (active) {
            if (active.key === key) return active.promise;
            return Promise.reject(new Error(`[AppTransition] transition already in flight: ${active.key}`));
        }
        let resolve!: () => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<void>((onResolve, onReject) => {
            resolve = onResolve;
            reject = onReject;
        });
        this.transaction = {
            key,
            targetScene,
            direction,
            token: ++this.tokenSeed,
            task,
            taskStarted: false,
            taskFinished: false,
            ready: false,
            error: null,
            promise,
            resolve,
            reject,
        };
        this.cancelAfterDraw();
        this.state = 'covering';
        this.progress = 0;
        this.node.active = true;
        this.blocker.enabled = true;
        this.render();
        return promise;
    }

    completeAfterDraw(sceneName: AppSceneName, error: unknown | null = null): boolean {
        const active = this.transaction;
        if (!active || active.targetScene !== sceneName || this.afterDraw) return false;
        const token = active.token;
        this.afterDraw = () => {
            this.afterDraw = null;
            const current = this.transaction;
            if (!current || current.token !== token) return;
            current.ready = true;
            if (error !== null) current.error = error;
            this.tryBeginReveal();
        };
        director.once(Director.EVENT_AFTER_DRAW, this.afterDraw, this);
        return true;
    }

    update(dt: number): void {
        if (!this.transaction) return;
        if (this.state === 'covering') {
            this.progress = Math.min(1, this.progress + Math.max(0, dt) / COVER_DURATION);
            this.render();
            if (this.progress >= 1) {
                this.state = 'covered';
                this.startTask();
            }
            return;
        }
        if (this.state === 'covered') {
            this.tryBeginReveal();
            return;
        }
        if (this.state === 'revealing') {
            this.progress = Math.max(0, this.progress - Math.max(0, dt) / REVEAL_DURATION);
            this.render();
            if (this.progress <= 0) this.finishTransaction();
        }
    }

    private startTask(): void {
        const active = this.transaction;
        if (!active || active.taskStarted) return;
        active.taskStarted = true;
        Promise.resolve().then(active.task).then(() => {
            if (this.transaction?.token !== active.token) return;
            active.taskFinished = true;
            this.tryBeginReveal();
        }, (error) => {
            if (this.transaction?.token !== active.token) return;
            active.taskFinished = true;
            active.ready = true;
            active.error = error;
            this.tryBeginReveal();
        });
    }

    private tryBeginReveal(): void {
        const active = this.transaction;
        if (
            !active
            || this.state !== 'covered'
            || !active.taskFinished
            || !active.ready
        ) return;
        this.cancelAfterDraw();
        this.state = 'revealing';
    }

    private finishTransaction(): void {
        const finished = this.transaction;
        if (!finished) return;
        this.cancelAfterDraw();
        this.transaction = null;
        this.state = 'idle';
        this.progress = 0;
        this.blocker.enabled = false;
        this.node.active = false;
        this.irisMask.setContentSize(0, 0);
        if (finished.error !== null) finished.reject(finished.error);
        else finished.resolve();
    }

    private resize(): void {
        const size = view.getVisibleSize();
        this.node.getComponent(UITransform)?.setContentSize(size.width, size.height);
        this.content?.setContentSize(size.width, size.height);
        const backgroundWidth = Math.max(size.width, size.height * BACKGROUND_ASPECT);
        this.background?.setContentSize(backgroundWidth, backgroundWidth / BACKGROUND_ASPECT);
        if (this.node.active) this.render();
    }

    private render(): void {
        if (!this.irisMask) return;
        const size = view.getVisibleSize();
        const maxRadius = Math.hypot(size.width, size.height) * 0.5 + IRIS_OVERSCAN;

        if (this.state === 'covering' || this.state === 'revealing') {
            const t = Math.max(0, Math.min(1, this.progress));
            const radius = maxRadius * t * t;
            const diameter = Math.max(0, radius * 2);
            this.irisMask.setContentSize(diameter, diameter);
            return;
        }

        this.irisMask.setContentSize(maxRadius * 2, maxRadius * 2);
    }

    private setLayer(node: Node): void {
        node.layer = APP_TRANSITION_LAYER;
        for (const child of node.children) this.setLayer(child);
    }

    private cancelAfterDraw(): void {
        if (this.afterDraw) director.off(Director.EVENT_AFTER_DRAW, this.afterDraw, this);
        this.afterDraw = null;
    }

    onDestroy(): void {
        this.cancelAfterDraw();
        view.off('canvas-resize', this.resize, this);
        view.off('design-resolution-changed', this.resize, this);
        const active = this.transaction;
        this.transaction = null;
        this.state = 'idle';
        if (active) active.reject(new Error('[AppTransition] controller destroyed during transition'));
    }
}
