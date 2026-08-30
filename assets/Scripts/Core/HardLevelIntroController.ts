import {
    BlockInputEvents,
    instantiate,
    Label,
    Node,
    Prefab,
    Rect,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    Widget,
} from 'cc';
import type { Bundle } from './GameCtrlShared';
import type { HardLevelFlag } from './LevelConfig';

const HARD_LEVEL_INTRO_PREFAB_PATH = 'UI/Prefabs/Fx/HardLevelIntro';
const HARD_LEVEL_INTRO_DURATION_SECONDS = 2;
const HARD_LEVEL_INTRO_STAR_FRAME_SIZE = 128;
const HARD_LEVEL_INTRO_STAR_SOURCE_SIZE = 256;
const HARD_LEVEL_INTRO_ARROW_TARGET_X = 353;
const HARD_LEVEL_INTRO_ARROW_PEAK_OPACITY = 153;
const HARD_LEVEL_INTRO_STAR_FRAMES = [
    { nodeName: 'StarUpperLeft', x: 0, y: 0 },
    { nodeName: 'StarTop', x: 128, y: 0 },
    { nodeName: 'StarLeft', x: 0, y: 128 },
    { nodeName: 'StarLowerRight', x: 128, y: 128 },
] as const;
const HARD_LEVEL_INTRO_STAR_PULSES = [
    { starts: [0.5, 0.9], lifetime: 0.34, startAngle: -18, endAngle: 42 },
    { starts: [0.5, 0.9], lifetime: 0.36, startAngle: 12, endAngle: 62 },
    { starts: [0.7], lifetime: 0.46, startAngle: -10, endAngle: 36 },
    { starts: [0.7], lifetime: 0.54, startAngle: 16, endAngle: 76 },
] as const;

type IntroFailureHandler = (error: Error) => void;

interface HardLevelIntroNodes {
    root: Node;
    backdropOpacity: UIOpacity;
    visualsOpacity: UIOpacity;
    banner: Node;
    bannerOpacity: UIOpacity;
    arrowLeftFar: Node;
    arrowLeftNear: Node;
    arrowRightNear: Node;
    arrowRightFar: Node;
    arrowOpacities: UIOpacity[];
    starCluster: Node;
    starOpacity: UIOpacity;
    stars: Array<{ node: Node; opacity: UIOpacity }>;
    badge: Node;
    badgeOpacity: UIOpacity;
    title: Node;
    titleOpacity: UIOpacity;
}

function asError(error: unknown, fallback: string): Error {
    if (error instanceof Error) return error;
    return new Error(String(error || fallback));
}

function requireChild(parent: Node, name: string, path: string): Node {
    const node = parent.getChildByName(name);
    if (!node?.isValid) throw new Error(`[hard-intro] missing prefab node: ${path}`);
    return node;
}

function requireComponent<T>(node: Node, component: new (...args: any[]) => T, path: string): T {
    const resolved = node.getComponent(component as any) as T | null;
    if (!resolved) throw new Error(`[hard-intro] missing ${component.name} on ${path}`);
    return resolved;
}

function requireSprite(node: Node, path: string): Sprite {
    const sprite = requireComponent(node, Sprite, path);
    if (!sprite.spriteFrame) throw new Error(`[hard-intro] missing SpriteFrame on ${path}`);
    return sprite;
}

function setLayerDeep(node: Node, layer: number): void {
    node.layer = layer;
    for (const child of node.children) setLayerDeep(child, layer);
}

function stopTweensDeep(node: Node): void {
    Tween.stopAllByTarget(node);
    const opacity = node.getComponent(UIOpacity);
    if (opacity) Tween.stopAllByTarget(opacity);
    for (const child of node.children) stopTweensDeep(child);
}

export class HardLevelIntroController {
    private generation = 0;
    private root: Node | null = null;
    private ownedStarFrames: SpriteFrame[] = [];

    constructor(private readonly runtime: any) {}

    stop(): void {
        this.generation += 1;
        this.releaseMountedNode();
    }

    play(hard: HardLevelFlag, onComplete: () => void, onFailure: IntroFailureHandler): void {
        this.stop();
        if (hard === 0) {
            onComplete();
            return;
        }
        if (hard !== 1) {
            onFailure(new Error(`[hard-intro] unsupported Hard value: ${hard}`));
            return;
        }
        const generation = this.generation;
        if (typeof this.runtime._withGameAssetsBundle !== 'function') {
            this.fail(generation, new Error('[hard-intro] GameAssetsBundle loader is unavailable'), onFailure);
            return;
        }
        this.runtime._withGameAssetsBundle((bundle: Bundle | null) => {
            if (generation !== this.generation) return;
            if (!bundle) {
                this.fail(generation, new Error('[hard-intro] GameAssetsBundle is unavailable'), onFailure);
                return;
            }
            bundle.load(HARD_LEVEL_INTRO_PREFAB_PATH, Prefab, (error: Error | null, prefab: Prefab | null) => {
                if (generation !== this.generation) return;
                if (error || !prefab) {
                    this.fail(
                        generation,
                        asError(error, `[hard-intro] failed to load ${HARD_LEVEL_INTRO_PREFAB_PATH}`),
                        onFailure,
                    );
                    return;
                }
                try {
                    const nodes = this.mount(prefab);
                    this.animate(nodes, generation, onComplete);
                } catch (mountError) {
                    this.fail(generation, asError(mountError, '[hard-intro] prefab mount failed'), onFailure);
                }
            });
        });
    }

    private mount(prefab: Prefab): HardLevelIntroNodes {
        const overlayRoot = this.runtime.requireCanvasUiRoot?.('OverlayRoot') as Node | null;
        if (!overlayRoot?.isValid) throw new Error('[hard-intro] OverlayRoot is unavailable');
        const overlayTransform = requireComponent(overlayRoot, UITransform, 'OverlayRoot');
        const root = instantiate(prefab);
        this.root = root;
        root.name = 'HardLevelIntro';
        overlayRoot.addChild(root);
        root.setPosition(0, 0, 0);
        root.setSiblingIndex(Math.max(0, overlayRoot.children.length - 1));
        setLayerDeep(root, overlayRoot.layer);

        const rootTransform = requireComponent(root, UITransform, 'HardLevelIntro');
        rootTransform.setContentSize(overlayTransform.contentSize);
        const rootWidget = requireComponent(root, Widget, 'HardLevelIntro');
        rootWidget.updateAlignment();
        requireComponent(root, BlockInputEvents, 'HardLevelIntro');

        const backdrop = requireChild(root, 'Backdrop', 'HardLevelIntro/Backdrop');
        requireSprite(backdrop, 'HardLevelIntro/Backdrop');
        const visuals = requireChild(root, 'Visuals', 'HardLevelIntro/Visuals');
        const banner = requireChild(visuals, 'Banner', 'HardLevelIntro/Visuals/Banner');
        const arrowLeftFar = requireChild(visuals, 'ArrowLeftFar', 'HardLevelIntro/Visuals/ArrowLeftFar');
        const arrowLeftNear = requireChild(visuals, 'ArrowLeftNear', 'HardLevelIntro/Visuals/ArrowLeftNear');
        const arrowRightNear = requireChild(visuals, 'ArrowRightNear', 'HardLevelIntro/Visuals/ArrowRightNear');
        const arrowRightFar = requireChild(visuals, 'ArrowRightFar', 'HardLevelIntro/Visuals/ArrowRightFar');
        const starCluster = requireChild(visuals, 'StarCluster', 'HardLevelIntro/Visuals/StarCluster');
        const badge = requireChild(visuals, 'Badge', 'HardLevelIntro/Visuals/Badge');
        const title = requireChild(visuals, 'Title', 'HardLevelIntro/Visuals/Title');

        for (const [node, path] of [
            [banner, 'HardLevelIntro/Visuals/Banner'],
            [arrowLeftFar, 'HardLevelIntro/Visuals/ArrowLeftFar'],
            [arrowLeftNear, 'HardLevelIntro/Visuals/ArrowLeftNear'],
            [arrowRightNear, 'HardLevelIntro/Visuals/ArrowRightNear'],
            [arrowRightFar, 'HardLevelIntro/Visuals/ArrowRightFar'],
            [badge, 'HardLevelIntro/Visuals/Badge'],
        ] as Array<[Node, string]>) {
            requireSprite(node, path);
        }
        const legacyStarSprite = requireComponent(starCluster, Sprite, 'HardLevelIntro/Visuals/StarCluster');
        if (legacyStarSprite.enabled) {
            throw new Error('[hard-intro] StarCluster atlas sprite must stay disabled');
        }
        const stars = this.configureStarSprites(starCluster);
        const titleLabel = requireComponent(title, Label, 'HardLevelIntro/Visuals/Title');
        if (titleLabel.string !== '超级困难') {
            throw new Error(`[hard-intro] unexpected title copy: ${titleLabel.string}`);
        }

        return {
            root,
            backdropOpacity: requireComponent(backdrop, UIOpacity, 'HardLevelIntro/Backdrop'),
            visualsOpacity: requireComponent(visuals, UIOpacity, 'HardLevelIntro/Visuals'),
            banner,
            bannerOpacity: requireComponent(banner, UIOpacity, 'HardLevelIntro/Visuals/Banner'),
            arrowLeftFar,
            arrowLeftNear,
            arrowRightNear,
            arrowRightFar,
            arrowOpacities: [arrowLeftFar, arrowLeftNear, arrowRightNear, arrowRightFar].map((node) => (
                requireComponent(node, UIOpacity, `HardLevelIntro/Visuals/${node.name}`)
            )),
            starCluster,
            starOpacity: requireComponent(starCluster, UIOpacity, 'HardLevelIntro/Visuals/StarCluster'),
            stars,
            badge,
            badgeOpacity: requireComponent(badge, UIOpacity, 'HardLevelIntro/Visuals/Badge'),
            title,
            titleOpacity: requireComponent(title, UIOpacity, 'HardLevelIntro/Visuals/Title'),
        };
    }

    private configureStarSprites(starCluster: Node): Array<{ node: Node; opacity: UIOpacity }> {
        const resolved = HARD_LEVEL_INTRO_STAR_FRAMES.map((spec) => {
            const path = `HardLevelIntro/Visuals/StarCluster/${spec.nodeName}`;
            const node = requireChild(starCluster, spec.nodeName, path);
            return {
                spec,
                node,
                sprite: requireSprite(node, path),
                opacity: requireComponent(node, UIOpacity, path),
            };
        });
        const sourceFrame = resolved[0].sprite.spriteFrame;
        const sourceTexture = sourceFrame?.texture;
        const sourceRect = sourceFrame?.rect;
        if (
            !sourceFrame
            || !sourceTexture
            || !sourceRect
            || sourceRect.width !== HARD_LEVEL_INTRO_STAR_SOURCE_SIZE
            || sourceRect.height !== HARD_LEVEL_INTRO_STAR_SOURCE_SIZE
        ) {
            throw new Error('[hard-intro] StarCluster source frame must be 256x256');
        }
        for (const { spec, sprite } of resolved) {
            if (sprite.spriteFrame?.texture !== sourceTexture) {
                throw new Error(`[hard-intro] unexpected star texture on ${spec.nodeName}`);
            }
            const frame = new SpriteFrame();
            frame.name = `hard-intro-${spec.nodeName}`;
            frame.texture = sourceTexture;
            frame.rect = new Rect(
                spec.x,
                spec.y,
                HARD_LEVEL_INTRO_STAR_FRAME_SIZE,
                HARD_LEVEL_INTRO_STAR_FRAME_SIZE,
            );
            this.ownedStarFrames.push(frame);
            sprite.spriteFrame = frame;
        }
        return resolved.map(({ node, opacity }) => ({ node, opacity }));
    }

    private animate(nodes: HardLevelIntroNodes, generation: number, onComplete: () => void): void {
        const { root, backdropOpacity, visualsOpacity, banner, bannerOpacity } = nodes;
        backdropOpacity.opacity = 0;
        visualsOpacity.opacity = 255;
        bannerOpacity.opacity = 0;
        banner.setScale(1, 0, 1);

        const arrowTimelines = [
            { node: nodes.arrowLeftFar, opacity: nodes.arrowOpacities[0], startAt: 0, peakAt: 0.25, endAt: 0.833, targetX: -HARD_LEVEL_INTRO_ARROW_TARGET_X },
            { node: nodes.arrowLeftNear, opacity: nodes.arrowOpacities[1], startAt: 0.1, peakAt: 0.433, endAt: 1.1, targetX: -HARD_LEVEL_INTRO_ARROW_TARGET_X },
            { node: nodes.arrowRightNear, opacity: nodes.arrowOpacities[2], startAt: 0.1, peakAt: 0.433, endAt: 1.1, targetX: HARD_LEVEL_INTRO_ARROW_TARGET_X },
            { node: nodes.arrowRightFar, opacity: nodes.arrowOpacities[3], startAt: 0, peakAt: 0.25, endAt: 0.833, targetX: HARD_LEVEL_INTRO_ARROW_TARGET_X },
        ];
        arrowTimelines.forEach(({ node, opacity, startAt, peakAt, endAt, targetX }) => {
            opacity.opacity = 0;
            tween(node)
                .delay(startAt)
                .to(endAt - startAt, { position: new Vec3(targetX, node.position.y, node.position.z) }, { easing: 'linear' })
                .start();
            tween(opacity)
                .delay(startAt)
                .to(peakAt - startAt, { opacity: HARD_LEVEL_INTRO_ARROW_PEAK_OPACITY }, { easing: 'quadInOut' })
                .to(endAt - peakAt, { opacity: 0 }, { easing: 'quadInOut' })
                .start();
        });

        nodes.starOpacity.opacity = 255;
        nodes.starCluster.setScale(1, 1, 1);
        nodes.starCluster.angle = 0;
        nodes.stars.forEach((star, index) => {
            star.opacity.opacity = 0;
            star.node.setScale(0.02, 0.02, 1);
            this.animateStarPulses(star, HARD_LEVEL_INTRO_STAR_PULSES[index]);
        });
        nodes.badgeOpacity.opacity = 0;
        nodes.badge.setScale(0.25, 0.25, 1);
        nodes.titleOpacity.opacity = 0;
        nodes.title.setScale(0.45, 0.45, 1);

        tween(backdropOpacity).to(0.14, { opacity: 185 }).delay(1.48).to(0.28, { opacity: 0 }).start();
        tween(banner)
            .delay(0.08)
            .call(() => { bannerOpacity.opacity = 255; })
            .to(0.2, { scale: new Vec3(1, 1.18, 1) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
        tween(nodes.badge)
            .delay(0.24)
            .to(0.27, { scale: new Vec3(1.16, 1.16, 1) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
        tween(nodes.badgeOpacity).delay(0.24).to(0.14, { opacity: 255 }).start();
        tween(nodes.title)
            .delay(0.31)
            .to(0.24, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
        tween(nodes.titleOpacity).delay(0.31).to(0.14, { opacity: 255 }).start();
        tween(visualsOpacity).delay(1.68).to(0.25, { opacity: 0 }).start();
        tween(root)
            .delay(HARD_LEVEL_INTRO_DURATION_SECONDS)
            .call(() => this.complete(generation, onComplete))
            .start();
    }

    private animateStarPulses(
        star: { node: Node; opacity: UIOpacity },
        spec: typeof HARD_LEVEL_INTRO_STAR_PULSES[number],
    ): void {
        let elapsed = 0;
        let sequence = tween(star.node);
        for (const startAt of spec.starts) {
            sequence = sequence
                .delay(Math.max(0, startAt - elapsed))
                .call(() => {
                    star.opacity.opacity = 255;
                    star.node.setScale(0.02, 0.02, 1);
                    star.node.angle = spec.startAngle;
                })
                .to(spec.lifetime * 0.18, {
                    scale: new Vec3(1, 1, 1),
                    angle: spec.startAngle + 18,
                }, { easing: 'quadOut' })
                .to(spec.lifetime * 0.26, {
                    scale: new Vec3(0.31, 0.31, 1),
                    angle: spec.startAngle + 30,
                }, { easing: 'quadInOut' })
                .to(spec.lifetime * 0.14, {
                    scale: new Vec3(0.63, 0.63, 1),
                    angle: spec.startAngle + 38,
                }, { easing: 'quadInOut' })
                .to(spec.lifetime * 0.42, {
                    scale: new Vec3(0.02, 0.02, 1),
                    angle: spec.endAngle,
                }, { easing: 'quadIn' })
                .call(() => { star.opacity.opacity = 0; });
            elapsed = startAt + spec.lifetime;
        }
        sequence.start();
    }

    private complete(generation: number, onComplete: () => void): void {
        if (generation !== this.generation) return;
        this.releaseMountedNode();
        this.generation += 1;
        onComplete();
    }

    private fail(generation: number, error: Error, onFailure: IntroFailureHandler): void {
        if (generation !== this.generation) return;
        this.releaseMountedNode();
        this.generation += 1;
        onFailure(error);
    }

    private releaseMountedNode(): void {
        const root = this.root;
        this.root = null;
        if (root?.isValid) {
            stopTweensDeep(root);
            root.destroy();
        }
        const starFrames = this.ownedStarFrames;
        this.ownedStarFrames = [];
        for (const frame of starFrames) {
            if (frame.isValid) frame.destroy();
        }
    }
}

export function ensureHardLevelIntroController(runtime: any): HardLevelIntroController {
    if (!runtime._hardLevelIntroController) {
        runtime._hardLevelIntroController = new HardLevelIntroController(runtime);
    }
    return runtime._hardLevelIntroController as HardLevelIntroController;
}
