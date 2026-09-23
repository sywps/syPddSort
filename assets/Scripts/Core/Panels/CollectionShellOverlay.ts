import {
    AudioMgr,
    BlockInputEvents,
    Bundle,
    EventTouch,
    Label,
    Node,
    Prefab,
    UITransform,
    Vec3,
    instantiate,
} from '../GameCtrlShared';
import { releaseCompletedPatternPreviewTree } from '../CompletedPatternPreview';

export type CollectionShellOverlayContext = {
    overlay: Node;
    box: Node;
    content: Node;
    pageIndicator: Node | null;
    leftArrow: Node | null;
    rightArrow: Node | null;
    close: () => void;
};

type CollectionShellOverlayOptions = {
    overlayName: string;
    prefabPath?: string;
    title?: string;
    siblingIndex?: number;
    hidePager?: boolean;
    requireActionNodes?: boolean;
    onClose?: () => void;
    onError?: () => void;
    onReady: (context: CollectionShellOverlayContext) => void;
    onOpened?: (context: CollectionShellOverlayContext) => void;
};

function syncPrefabPopupTitle(box: Node, title?: string): void {
    const badge = box.getChildByName('PopupTitleBadge');
    const titleNode = badge?.getChildByName('PopupTitleLabel');
    const label = titleNode?.getComponent(Label);
    if (!badge || !titleNode || !label) {
        throw new Error('[collection-shell] missing prefab title nodes');
    }
    const hasTitle = !!title;
    badge.active = hasTitle;
    titleNode.active = hasTitle;
    if (hasTitle) label.string = title!;
}

function resolveShellActionNode(overlay: Node, name: 'ArrowLeft' | 'ArrowRight', required: boolean): Node | null {
    const existing = overlay.getChildByName(name);
    if (existing?.isValid) {
        return existing;
    }
    if (!required) {
        return null;
    }
    throw new Error(`[collection-shell] missing node: ${name}`);
}

export function openCollectionShellOverlay(runtime: any, options: CollectionShellOverlayOptions) {
    const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
    const pending: Set<string> = runtime.__pendingArtworkShells ||= new Set<string>();
    if (popupRoot.getChildByName(options.overlayName) || pending.has(options.overlayName)) {
        return;
    }
    pending.add(options.overlayName);
    const collectionOwner = options.overlayName === 'CollectionImageModal' ? runtime._collectionOverlay : null;

    const isRuntimeAlive = () => !!(runtime._isRuntimeAliveForAsyncCallback?.() ?? runtime.isValid);
    const isOpenTargetAlive = () => isRuntimeAlive() && !!popupRoot?.isValid
        && (!collectionOwner || (collectionOwner.isValid && collectionOwner.active && runtime._collectionOverlay === collectionOwner));
    const cancelStaleOpen = () => {
        pending.delete(options.overlayName);
        if (!isRuntimeAlive()) return;
        options.onError?.();
    };
    const prefabPath = options.prefabPath || 'UI/Prefabs/Panels/ArtworkPreview';
    runtime._withGameAssetsBundle((bundle: Bundle | null) => {
        if (!isOpenTargetAlive()) {
            cancelStaleOpen();
            return;
        }
        if (!bundle) {
            pending.delete(options.overlayName);
            options.onError?.();
            console.error(`[collection-shell] gameAssets bundle unavailable for ${options.overlayName}`);
            return;
        }
        bundle.load(prefabPath, Prefab, (err: Error | null, prefab: Prefab | null) => {
            pending.delete(options.overlayName);
            if (!isOpenTargetAlive()) {
                cancelStaleOpen();
                return;
            }
            if (err || !prefab) {
                options.onError?.();
                console.error(`[collection-shell] load failed for ${options.overlayName}: ${err?.message || 'prefab missing'}`);
                return;
            }

            const overlay = instantiate(prefab);
            overlay.active = true;
            overlay.name = options.overlayName;
            popupRoot.addChild(overlay);
            overlay.setSiblingIndex(options.siblingIndex ?? 1000);
            if (!overlay.getComponent(BlockInputEvents)) {
                overlay.addComponent(BlockInputEvents);
            }

            const box = runtime.requirePanelChild(overlay, 'Box');
            syncPrefabPopupTitle(box, options.prefabPath ? options.title : undefined);
            if (!box.getComponent(BlockInputEvents)) {
                box.addComponent(BlockInputEvents);
            }
            const content = runtime.requirePanelChild(box, 'CollContent');
            const pageIndicator = box.getChildByName('PageIndicator');
            const requireActionNodes = options.requireActionNodes ?? options.hidePager === false;
            const leftArrow = resolveShellActionNode(overlay, 'ArrowLeft', requireActionNodes);
            const rightArrow = resolveShellActionNode(overlay, 'ArrowRight', requireActionNodes);
            const close = () => {
                if (!overlay.isValid || !overlay.active) return;
                overlay.active = false;
                AudioMgr.inst.play('button');
                options.onClose?.();
                releaseCompletedPatternPreviewTree(overlay);
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                runtime._destroyDetachedNodeNextFrame(overlay);
            };
            (overlay as any).__collectionDetailClose = close;

            if (options.hidePager !== false) {
                if (pageIndicator) pageIndicator.active = false;
                if (leftArrow) leftArrow.active = false;
                if (rightArrow) rightArrow.active = false;
            }

            const isInsideNode = (node: Node, uiPos: Vec3) => {
                const nodeUT = node.getComponent(UITransform);
                if (!nodeUT) return false;
                const local = nodeUT.convertToNodeSpaceAR(uiPos);
                const size = nodeUT.contentSize;
                return Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2;
            };

            overlay.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                e.propagationStopped = true;
                const uiPos = e.getUILocation();
                const point = new Vec3(uiPos.x, uiPos.y, 0);
                if (isInsideNode(box, point)) return;
                const replay = box.getChildByName('CollectionReplayButton');
                if (replay?.active && isInsideNode(replay, point)) return;
                if ((leftArrow?.active && isInsideNode(leftArrow, point)) || (rightArrow?.active && isInsideNode(rightArrow, point))) return;
                close();
            }, runtime);

            runtime.bindPanelButton(runtime.requirePanelChild(box, 'XBtn'), close);

            try {
                const context: CollectionShellOverlayContext = {
                    overlay,
                    box,
                    content,
                    pageIndicator,
                    leftArrow,
                    rightArrow,
                    close,
                };
                options.onReady(context);
                if (runtime.playPopupOpenAnim) {
                    runtime.playPopupOpenAnim(overlay, box, () => options.onOpened?.(context));
                } else options.onOpened?.(context);
            } catch (error) {
                options.onError?.();
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                runtime._destroyDetachedNodeNextFrame(overlay);
                throw error;
            }
        });
    });
}
