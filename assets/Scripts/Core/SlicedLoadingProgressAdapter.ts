import { Node, Sprite, UITransform } from 'cc';

export interface SlicedLoadingProgressTarget {
    progress: number;
}

export interface SlicedLoadingProgressAdapter extends SlicedLoadingProgressTarget {
    readonly fillNode: Node;
    readonly fillRenderScale: number;
    readonly fillWidth: number;
    readonly fillHeight: number;
    readonly trackWidth: number;
}

const SLICED_RENDER_SCALE = 0.25;
const FILL_INSET = 3;

function requireChild(parent: Node, name: string, context: string): Node {
    const child = parent.getChildByName(name) || null;
    if (!child) {
        throw new Error(`[SlicedLoadingProgress] missing ${context}/${name}`);
    }
    return child;
}

function requireTransform(node: Node, context: string): UITransform {
    const transform = node.getComponent(UITransform) || null;
    if (!transform) {
        throw new Error(`[SlicedLoadingProgress] missing UITransform on ${context}`);
    }
    return transform;
}

function requireSlicedSprite(node: Node, context: string): void {
    const sprite = node.getComponent(Sprite) || null;
    if (!sprite || sprite.type !== Sprite.Type.SLICED) {
        throw new Error(`[SlicedLoadingProgress] ${context} must provide a Sliced Sprite`);
    }
}

function getPositiveSize(transform: UITransform, context: string): { width: number; height: number } {
    const width = Number(transform.width);
    const height = Number(transform.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error(`[SlicedLoadingProgress] ${context} must have a positive UITransform size`);
    }
    return { width, height };
}

export function createSlicedLoadingProgressAdapter(
    trackNode: Node,
    context: string,
): SlicedLoadingProgressAdapter {
    const trackTransform = requireTransform(trackNode, context);
    const trackSpriteNode = requireChild(trackNode, 'TrackSprite', context);
    const progressArea = requireChild(trackNode, 'ProgressBarArea', context);
    const fillNode = requireChild(progressArea, 'ProgressFill', `${context}/ProgressBarArea`);
    const trackSpriteTransform = requireTransform(trackSpriteNode, `${context}/TrackSprite`);
    const progressAreaTransform = requireTransform(progressArea, `${context}/ProgressBarArea`);
    const fillTransform = requireTransform(fillNode, `${context}/ProgressBarArea/ProgressFill`);
    requireSlicedSprite(trackSpriteNode, `${context}/TrackSprite`);
    requireSlicedSprite(fillNode, `${context}/ProgressBarArea/ProgressFill`);

    const getGeometry = () => {
        const { width, height } = getPositiveSize(trackTransform, context);
        return {
            width,
            height,
            fillWidth: Math.max(0, width - FILL_INSET * 2),
            fillHeight: Math.max(0, height - FILL_INSET * 2),
        };
    };

    let current = 0;
    const apply = (value: number) => {
        current = Math.max(0, Math.min(1, Number(value) || 0));
        const geometry = getGeometry();
        progressAreaTransform.setContentSize(geometry.width, geometry.height);
        progressArea.setPosition(0, 0, 0);
        trackSpriteTransform.setContentSize(
            geometry.width / SLICED_RENDER_SCALE,
            geometry.height / SLICED_RENDER_SCALE,
        );
        trackSpriteNode.setPosition(0, 0, 0);
        trackSpriteNode.setScale(SLICED_RENDER_SCALE, SLICED_RENDER_SCALE, 1);
        trackSpriteNode.active = true;

        const width = geometry.fillWidth * current;
        if (width <= 0 || geometry.fillHeight <= 0) {
            fillNode.active = false;
            return;
        }
        fillTransform.setContentSize(
            width / SLICED_RENDER_SCALE,
            geometry.fillHeight / SLICED_RENDER_SCALE,
        );
        fillNode.setPosition(-geometry.fillWidth / 2 + width / 2, 0, 0);
        fillNode.setScale(SLICED_RENDER_SCALE, SLICED_RENDER_SCALE, 1);
        fillNode.active = true;
    };

    const adapter = {} as SlicedLoadingProgressAdapter;
    Object.defineProperties(adapter, {
        progress: {
            get: () => current,
            set: apply,
            enumerable: true,
            configurable: true,
        },
        fillNode: {
            value: fillNode,
            enumerable: true,
        },
        fillRenderScale: {
            value: SLICED_RENDER_SCALE,
            enumerable: true,
        },
        fillWidth: {
            get: () => getGeometry().fillWidth,
            enumerable: true,
        },
        fillHeight: {
            get: () => getGeometry().fillHeight,
            enumerable: true,
        },
        trackWidth: {
            get: () => getGeometry().fillWidth,
            enumerable: true,
        },
    });
    apply(0);
    return adapter;
}
