import {
    Label,
    Node,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
} from './GameCtrlShared';

type ToastViewState = {
    host: Node | null;
    bubble: Node | null;
    labelNode: Node | null;
    label: Label | null;
    bubbleOpacity: UIOpacity | null;
};

const TOAST_HOST_NAME = 'ToastHost';
const TOAST_BUBBLE_NAME = 'ToastBubble';
const TOAST_LABEL_NAME = 'ToastLbl';
const LEGACY_TOAST_NAME = 'Toast';
const TOAST_HEIGHT = 67;
const TOAST_MIN_WIDTH = 180;
const TOAST_MAX_WIDTH = 610;
const TOAST_HORIZONTAL_PADDING = 72;
const TOAST_LABEL_HEIGHT = 44;
const TOAST_SLOT_GAP = 18;
const TOAST_SCREEN_MARGIN = 24;
const warningKeys = new Set<string>();

function warnOnce(key: string, message: string, error?: unknown): void {
    if (warningKeys.has(key)) return;
    warningKeys.add(key);
    if (error !== undefined) {
        console.warn(message, error);
    } else {
        console.warn(message);
    }
}

function normalizeToastText(text: string): string {
    return String(text || '').trim();
}

function getRuntimeToastState(runtime: any): ToastViewState {
    const state = runtime._toastServiceState as ToastViewState | null;
    if (state) return state;
    const next: ToastViewState = {
        host: null,
        bubble: null,
        labelNode: null,
        label: null,
        bubbleOpacity: null,
    };
    runtime._toastServiceState = next;
    return next;
}

function getHostSize(host: Node): { width: number; height: number } {
    const size = host.getComponent(UITransform)?.contentSize;
    return {
        width: size?.width || 720,
        height: size?.height || 1280,
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function hasGameplaySlotArea(runtime: any): boolean {
    return !!runtime?.slotAreaNode?.isValid && runtime.slotAreaNode.activeInHierarchy !== false;
}

function getSlotAreaToastPosition(runtime: any, overlayHost: Node): Vec3 | null {
    if (!hasGameplaySlotArea(runtime)) return null;
    const slotUi = runtime.slotAreaNode.getComponent(UITransform);
    const hostUi = overlayHost.getComponent(UITransform);
    if (!slotUi || !hostUi) return null;
    const topWorld = slotUi.convertToWorldSpaceAR(new Vec3(0, slotUi.contentSize.height / 2, 0));
    const topLocal = hostUi.convertToNodeSpaceAR(topWorld);
    const hostSize = getHostSize(overlayHost);
    const halfHeight = TOAST_HEIGHT / 2;
    const minY = -hostSize.height / 2 + halfHeight + TOAST_SCREEN_MARGIN;
    const maxY = hostSize.height / 2 - halfHeight - TOAST_SCREEN_MARGIN;
    const y = clamp(topLocal.y + halfHeight + TOAST_SLOT_GAP, minY, maxY);
    return new Vec3(0, y, 0);
}

function stopToastTweens(state: ToastViewState): void {
    if (state.host?.isValid) Tween.stopAllByTarget(state.host);
    if (state.bubble?.isValid) Tween.stopAllByTarget(state.bubble);
    if (state.bubbleOpacity) Tween.stopAllByTarget(state.bubbleOpacity);
}

function findToastOverlayHost(runtime: any): Node {
    try {
        return typeof runtime.requireCanvasUiRoot === 'function'
            ? runtime.requireCanvasUiRoot('OverlayRoot')
            : runtime.node;
    } catch (_) {
        return runtime.node;
    }
}

function findSceneToastView(runtime: any, overlayHost: Node): ToastViewState | null {
    const host = overlayHost.getChildByName(TOAST_HOST_NAME);
    const bubble = host?.getChildByName(TOAST_BUBBLE_NAME);
    const labelNode = bubble?.getChildByName(TOAST_LABEL_NAME);
    const label = labelNode?.getComponent(Label) || null;
    const bubbleOpacity = bubble?.getComponent(UIOpacity) || null;
    if (!host?.isValid || !bubble?.isValid || !labelNode?.isValid || !label || !bubbleOpacity) {
        return null;
    }
    const state = getRuntimeToastState(runtime);
    state.host = host;
    state.bubble = bubble;
    state.labelNode = labelNode;
    state.label = label;
    state.bubbleOpacity = bubbleOpacity;
    return state;
}

function fitSceneToastToText(state: ToastViewState): void {
    const bubbleTransform = state.bubble?.getComponent(UITransform) || null;
    const labelTransform = state.labelNode?.getComponent(UITransform) || null;
    if (!bubbleTransform || !labelTransform || !state.label) {
        warnOnce(
            'toast-scene-sizing-node-missing',
            '[ToastService] ToastBubble/ToastLbl sizing components missing; keep scene default size.',
        );
        return;
    }
    state.label.overflow = Label.Overflow.NONE;
    state.label.updateRenderData(true);
    const bubbleWidth = clamp(
        Math.ceil(labelTransform.contentSize.width + TOAST_HORIZONTAL_PADDING),
        TOAST_MIN_WIDTH,
        TOAST_MAX_WIDTH,
    );
    bubbleTransform.setContentSize(bubbleWidth, TOAST_HEIGHT);
    labelTransform.setContentSize(
        Math.max(1, bubbleWidth - TOAST_HORIZONTAL_PADDING),
        TOAST_LABEL_HEIGHT,
    );
    state.label.overflow = Label.Overflow.CLAMP;
    state.label.updateRenderData(true);
}

function syncSceneToastView(runtime: any, overlayHost: Node, text: string, x: number, y: number): ToastViewState | null {
    const sceneState = findSceneToastView(runtime, overlayHost);
    if (sceneState) {
        sceneState.host!.active = true;
        sceneState.bubble!.active = true;
        sceneState.labelNode!.active = true;
        sceneState.bubble!.setPosition(x, y, 0);
        sceneState.label!.string = text;
        fitSceneToastToText(sceneState);
        if (sceneState.bubbleOpacity) sceneState.bubbleOpacity.opacity = 245;
        sceneState.host!.setSiblingIndex(Math.max(0, overlayHost.children.length - 1));
        return sceneState;
    }
    warnOnce(
        'toast-scene-node-missing',
        '[ToastService] OverlayRoot/ToastHost/ToastBubble/ToastLbl missing or incomplete; toast skipped.',
    );
    return null;
}

export class ToastService {
    static getToastHost(runtime: any): Node {
        return findToastOverlayHost(runtime);
    }

    static destroyLegacyToastNode(runtime: any, toast: Node | null): void {
        if (!toast?.isValid) return;
        const bubble = toast.getChildByName(TOAST_BUBBLE_NAME);
        if (bubble?.isValid) {
            Tween.stopAllByTarget(bubble);
            const opacity = bubble.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
        }
        Tween.stopAllByTarget(toast);
        toast.removeFromParent();
        toast.destroy();
        if (Array.isArray(runtime._toastNodes)) {
            runtime._toastNodes = runtime._toastNodes.filter((node: Node) => node?.isValid && node !== toast);
        }
    }

    static clear(runtime: any): void {
        const state = getRuntimeToastState(runtime);
        stopToastTweens(state);
        if (state.host?.isValid) {
            state.host.active = false;
        }
        if (state.bubble?.isValid) {
            state.bubble.active = false;
            state.bubble.setScale(1, 1, 1);
        }
        if (state.bubbleOpacity) {
            state.bubbleOpacity.opacity = 245;
        }

        const tracked = Array.isArray(runtime._toastNodes) ? [...runtime._toastNodes] : [];
        const hosts = [runtime.node, findToastOverlayHost(runtime)];
        const seenHosts = new Set<Node>();
        for (const host of hosts) {
            if (!host?.isValid || seenHosts.has(host)) continue;
            seenHosts.add(host);
            for (const child of [...host.children]) {
                if (child.name === LEGACY_TOAST_NAME) tracked.push(child);
            }
        }
        const seenToast = new Set<Node>();
        for (const toast of tracked) {
            if (!toast || seenToast.has(toast)) continue;
            seenToast.add(toast);
            ToastService.destroyLegacyToastNode(runtime, toast);
        }
        runtime._toastNodes = [];
    }

    static showAt(runtime: any, text: string, duration: number, x: number, y: number): void {
        const title = normalizeToastText(text);
        if (!title) return;

        ToastService.clear(runtime);
        const overlayHost = findToastOverlayHost(runtime);
        const state = syncSceneToastView(runtime, overlayHost, title, x, y);
        if (!state) return;
        const host = state.host!;
        const bubble = state.bubble!;
        const bubbleOpacity = state.bubbleOpacity!;

        tween(bubble)
            .set({ scale: new Vec3(0.5, 0.5, 1) })
            .to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
            .start();

        let closing = false;
        const hideToast = () => {
            if (closing) return;
            closing = true;
            stopToastTweens(state);
            if (state.host?.isValid) state.host.active = false;
            if (state.bubble?.isValid) {
                state.bubble.active = false;
                state.bubble.setScale(1, 1, 1);
            }
            if (state.bubbleOpacity) state.bubbleOpacity.opacity = 245;
        };
        const startDismiss = () => {
            if (!host.isValid || !bubble.isValid) {
                hideToast();
                return;
            }
            Tween.stopAllByTarget(bubble);
            Tween.stopAllByTarget(bubbleOpacity);
            tween(bubbleOpacity)
                .to(0.2, { opacity: 0 }, { easing: 'sineIn' })
                .call(hideToast)
                .start();
            tween(bubble)
                .to(0.2, { scale: new Vec3(0.8, 0.8, 1) }, { easing: 'sineIn' })
                .call(hideToast)
                .start();
        };
        tween(host)
            .delay(Math.max(0, Number(duration) || 1.5))
            .call(startDismiss)
            .delay(0.35)
            .call(hideToast)
            .start();
    }

    static show(runtime: any, text: string, duration: number = 1.5): void {
        const host = findToastOverlayHost(runtime);
        const slotPos = getSlotAreaToastPosition(runtime, host);
        ToastService.showAt(runtime, text, duration, slotPos?.x ?? 0, slotPos?.y ?? 0);
    }

    static showBelowTimer(runtime: any, text: string, duration: number = 1.5): void {
        const host = findToastOverlayHost(runtime);
        const slotPos = getSlotAreaToastPosition(runtime, host);
        if (slotPos) {
            ToastService.showAt(runtime, text, duration, slotPos.x, slotPos.y);
            return;
        }
        const timerNode = runtime.timerLabel?.node;
        const timerWrap = timerNode?.parent;
        const timerUT = timerWrap?.getComponent(UITransform);
        const hostUT = host?.getComponent(UITransform);
        if (!timerWrap || !timerUT || !hostUT) {
            ToastService.show(runtime, text, duration);
            return;
        }
        const worldPos = timerUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
        const localPos = hostUT.convertToNodeSpaceAR(worldPos);
        ToastService.showAt(runtime, text, duration, localPos.x, localPos.y - 72);
    }
}
