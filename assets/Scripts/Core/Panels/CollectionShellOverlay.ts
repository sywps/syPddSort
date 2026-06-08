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

export type CollectionShellOverlayContext = {
    overlay: Node;
    box: Node;
    content: Node;
    pageIndicator: Node;
    leftArrow: Node;
    rightArrow: Node;
    close: () => void;
};

type CollectionShellOverlayOptions = {
    overlayName: string;
    title?: string;
    siblingIndex?: number;
    hidePager?: boolean;
    onClose?: () => void;
    onReady: (context: CollectionShellOverlayContext) => void;
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

export function openCollectionShellOverlay(runtime: any, options: CollectionShellOverlayOptions) {
    const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
    if (popupRoot.getChildByName(options.overlayName)) {
        return;
    }

    const prefabPath = 'UI/Prefabs/Panels/CollectionPanel';
    runtime._withGameAssetsBundle((bundle: Bundle | null) => {
        if (!bundle) {
            console.error(`[collection-shell] gameAssets bundle unavailable for ${options.overlayName}`);
            return;
        }
        bundle.load(prefabPath, Prefab, (err: Error | null, prefab: Prefab | null) => {
            if (err || !prefab) {
                console.error(`[collection-shell] load failed for ${options.overlayName}: ${err?.message || 'prefab missing'}`);
                return;
            }

            const overlay = instantiate(prefab);
            overlay.name = options.overlayName;
            popupRoot.addChild(overlay);
            overlay.setSiblingIndex(options.siblingIndex ?? 1000);
            if (!overlay.getComponent(BlockInputEvents)) {
                overlay.addComponent(BlockInputEvents);
            }

            const box = runtime.requirePanelChild(overlay, 'Box');
            syncPrefabPopupTitle(box, options.title);
            if (!box.getComponent(BlockInputEvents)) {
                box.addComponent(BlockInputEvents);
            }
            const content = runtime.requirePanelChild(box, 'CollContent');
            const pageIndicator = runtime.requirePanelChild(box, 'PageIndicator');
            const leftArrow = runtime.requirePanelChild(overlay, 'ArrowLeft');
            const rightArrow = runtime.requirePanelChild(overlay, 'ArrowRight');
            const close = () => {
                if (!overlay.isValid) return;
                AudioMgr.inst.play('uiPanel');
                options.onClose?.();
                overlay.destroy();
            };

            if (options.hidePager !== false) {
                pageIndicator.active = false;
                leftArrow.active = false;
                rightArrow.active = false;
            }

            const isInsideNode = (node: Node, uiPos: Vec3) => {
                const nodeUT = node.getComponent(UITransform);
                if (!nodeUT) return false;
                const local = nodeUT.convertToNodeSpaceAR(uiPos);
                const size = nodeUT.contentSize;
                return Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2;
            };

            overlay.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                const uiPos = e.getUILocation();
                const point = new Vec3(uiPos.x, uiPos.y, 0);
                if (isInsideNode(box, point)) return;
                if ((leftArrow.active && isInsideNode(leftArrow, point)) || (rightArrow.active && isInsideNode(rightArrow, point))) return;
                close();
            }, runtime);

            runtime.bindPanelButton(runtime.requirePanelChild(box, 'XBtn'), close);

            options.onReady({
                overlay,
                box,
                content,
                pageIndicator,
                leftArrow,
                rightArrow,
                close,
            });
        });
    });
}
