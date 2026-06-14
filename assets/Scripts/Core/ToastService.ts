import {
    Color,
    Label,
    Layers,
    Node,
    Sprite,
    SpriteFrame,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    createSingleColorSpriteFrame,
    tween,
} from './GameCtrlShared';
import {
    getDouyinMiniGameRuntime,
    getWeChatMiniGameRuntime,
    isDouyinMiniGameRuntime,
    isWeChatMiniGameRuntime,
} from './MiniGamePlatform';

type ToastViewState = {
    host: Node | null;
    bubble: Node | null;
    labelNode: Node | null;
    label: Label | null;
    bubbleOpacity: UIOpacity | null;
    generatedBackground: SpriteFrame | null;
    generatedView: boolean;
};

type EnsureNodeResult = {
    node: Node;
    created: boolean;
};

const TOAST_HOST_NAME = 'ToastHost';
const TOAST_BUBBLE_NAME = 'ToastBubble';
const TOAST_LABEL_NAME = 'ToastLbl';
const LEGACY_TOAST_NAME = 'Toast';
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

function normalizeToastDurationMs(duration: number): number {
    return Math.max(800, Math.min(4000, Math.round((Number(duration) || 1.5) * 1000)));
}

function showWeChatNativeToast(text: string, duration: number): boolean {
    if (!isWeChatMiniGameRuntime()) return false;
    if (!text) return true;
    const wxRuntime = getWeChatMiniGameRuntime();
    if (!wxRuntime?.showToast) {
        warnOnce(
            'wechat-toast-unavailable',
            '[ToastService] wx.showToast unavailable; skip Cocos toast in WeChat runtime.',
        );
        return true;
    }
    try {
        wxRuntime.showToast({
            title: text,
            icon: 'none',
            duration: normalizeToastDurationMs(duration),
            fail: (error: unknown) => warnOnce(
                'wechat-toast-callback-failed',
                '[ToastService] wx.showToast failed; skip Cocos toast in WeChat runtime:',
                error,
            ),
        });
    } catch (error) {
        warnOnce(
            'wechat-toast-failed',
            '[ToastService] wx.showToast failed; skip Cocos toast in WeChat runtime:',
            error,
        );
    }
    return true;
}

function showDouyinNativeToast(text: string, duration: number): boolean {
    if (!isDouyinMiniGameRuntime()) return false;
    if (!text) return true;
    const ttRuntime = getDouyinMiniGameRuntime();
    if (!ttRuntime?.showToast) return false;
    try {
        ttRuntime.showToast({
            title: text,
            icon: 'none',
            duration: normalizeToastDurationMs(duration),
            fail: (error: unknown) => warnOnce(
                'douyin-toast-callback-failed',
                '[ToastService] tt.showToast failed:',
                error,
            ),
        });
        return true;
    } catch (error) {
        warnOnce('[ToastService] tt.showToast failed:', '[ToastService] tt.showToast failed:', error);
        return false;
    }
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
        generatedBackground: null,
        generatedView: false,
    };
    runtime._toastServiceState = next;
    return next;
}

function ensureChild(parent: Node, name: string): EnsureNodeResult {
    const existing = parent.getChildByName(name);
    if (existing?.isValid) {
        return { node: existing, created: false };
    }
    const node = new Node(name);
    parent.addChild(node);
    node.layer = parent.layer || Layers.Enum.UI_2D;
    return { node, created: true };
}

function setNodeSize(node: Node, width: number, height: number): UITransform {
    const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
    ui.setContentSize(width, height);
    return ui;
}

function getHostSize(host: Node): { width: number; height: number } {
    const size = host.getComponent(UITransform)?.contentSize;
    return {
        width: size?.width || 720,
        height: size?.height || 1280,
    };
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
    if (!host?.isValid || !bubble?.isValid || !labelNode?.isValid || !label) {
        return null;
    }
    const state = getRuntimeToastState(runtime);
    state.host = host;
    state.bubble = bubble;
    state.labelNode = labelNode;
    state.label = label;
    state.bubbleOpacity = bubble.getComponent(UIOpacity) || null;
    state.generatedView = false;
    return state;
}

function syncSceneToastView(runtime: any, overlayHost: Node, text: string, x: number, y: number): ToastViewState {
    const sceneState = findSceneToastView(runtime, overlayHost);
    if (sceneState) {
        sceneState.host!.active = true;
        sceneState.bubble!.active = true;
        sceneState.labelNode!.active = true;
        sceneState.bubble!.setPosition(x, y, 0);
        sceneState.label!.string = text;
        if (sceneState.bubbleOpacity) sceneState.bubbleOpacity.opacity = 245;
        sceneState.host!.setSiblingIndex(Math.max(0, overlayHost.children.length - 1));
        return sceneState;
    }
    warnOnce(
        'toast-scene-node-missing',
        '[ToastService] OverlayRoot/ToastHost/ToastBubble/ToastLbl missing; using non-WeChat preview compatibility node.',
    );
    return syncGeneratedToastView(runtime, overlayHost, text, x, y);
}

function syncGeneratedToastView(runtime: any, overlayHost: Node, text: string, x: number, y: number): ToastViewState {
    const state = getRuntimeToastState(runtime);
    const hostResult = ensureChild(overlayHost, TOAST_HOST_NAME);
    const host = hostResult.node;
    const hostSize = getHostSize(overlayHost);
    host.layer = Layers.Enum.UI_2D;
    host.active = true;
    host.setPosition(0, 0, 0);
    setNodeSize(host, hostSize.width, hostSize.height);
    host.setSiblingIndex(Math.max(0, overlayHost.children.length - 1));

    const bubbleResult = ensureChild(host, TOAST_BUBBLE_NAME);
    const bubble = bubbleResult.node;
    bubble.layer = Layers.Enum.UI_2D;
    bubble.active = true;
    bubble.setPosition(x, y, 0);
    if (bubbleResult.created) {
        setNodeSize(bubble, 460, 104);
    } else if (!bubble.getComponent(UITransform)) {
        setNodeSize(bubble, 460, 104);
    }

    const bubbleSprite = bubble.getComponent(Sprite) || bubble.addComponent(Sprite);
    bubbleSprite.type = Sprite.Type.SIMPLE;
    bubbleSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (!bubbleSprite.spriteFrame) {
        if (!state.generatedBackground) {
            state.generatedBackground = createSingleColorSpriteFrame(new Color(255, 250, 236, 238), 16, 16);
        }
        bubbleSprite.spriteFrame = state.generatedBackground;
    }

    const bubbleOpacity = bubble.getComponent(UIOpacity) || bubble.addComponent(UIOpacity);
    bubbleOpacity.opacity = 245;

    const labelResult = ensureChild(bubble, TOAST_LABEL_NAME);
    const labelNode = labelResult.node;
    labelNode.layer = bubble.layer;
    labelNode.active = true;
    const label = labelNode.getComponent(Label) || labelNode.addComponent(Label);
    label.string = text;
    if (labelResult.created || !labelNode.getComponent(UITransform)) {
        labelNode.setPosition(0, 4, 0);
        setNodeSize(labelNode, 380, 52);
        label.fontSize = 24;
        label.lineHeight = 52;
        label.color = new Color('#5A4A3A');
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
    }

    state.host = host;
    state.bubble = bubble;
    state.labelNode = labelNode;
    state.label = label;
    state.bubbleOpacity = bubbleOpacity;
    state.generatedView = true;
    return state;
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
        if (showWeChatNativeToast(title, duration)) return;
        if (showDouyinNativeToast(title, duration)) return;

        ToastService.clear(runtime);
        const overlayHost = findToastOverlayHost(runtime);
        const state = syncSceneToastView(runtime, overlayHost, title, x, y);
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
        ToastService.showAt(runtime, text, duration, 0, 0);
    }

    static showBelowTimer(runtime: any, text: string, duration: number = 1.5): void {
        const timerNode = runtime.timerLabel?.node;
        const timerWrap = timerNode?.parent;
        const timerUT = timerWrap?.getComponent(UITransform);
        const host = findToastOverlayHost(runtime);
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
