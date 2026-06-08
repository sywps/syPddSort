import {
    AudioMgr,
    BlockInputEvents,
    Bundle,
    Button,
    COLLECTION_RELEASE_TEXTURE_NAMES,
    COLLECTION_TEXTURE_NAMES,
    EventTouch,
    Label,
    Node,
    Prefab,
    UITransform,
    Vec3,
    instantiate,
} from '../GameCtrlShared';

function syncPrefabPopupTitle(box: Node, title: string): void {
    const badge = box.getChildByName('PopupTitleBadge');
    const titleNode = badge?.getChildByName('PopupTitleLabel');
    const label = titleNode?.getComponent(Label);
    if (!badge || !titleNode || !label) {
        throw new Error('[collection-prefab] missing prefab title nodes');
    }
    badge.active = true;
    titleNode.active = true;
    label.string = title;
}

export class CollectionPanelController {
    constructor(private readonly runtime: any) {}

    open() {
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        if (COLLECTION_TEXTURE_NAMES.some((name: string) => !runtime.getSF(name))) {
            runtime._openPanelAfterTextures('collection', COLLECTION_TEXTURE_NAMES, () => !!runtime._collectionOverlay, () => this.open());
            return;
        }
        if (runtime._collectionOverlay) return;

        runtime._collectionLevelIds = runtime.collectAllLevelIds();
        runtime._collectionTotalPages = Math.ceil(runtime._collectionLevelIds.length / 8);
        runtime._collectionPage = 0;

        const prefabPath = 'UI/Prefabs/Panels/CollectionPanel';
        const failOpen = (message: string, overlay?: Node | null) => {
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                overlay.destroy();
            }
            runtime._collectionOverlay = null;
            runtime._collectionContentNode = null;
            runtime._collectionPageIndicator = null;
            runtime._releasePanelTexturesNextFrame(COLLECTION_RELEASE_TEXTURE_NAMES, 'collection-open-failed');
            console.error(message);
        };

        runtime._withRemoteBundle((bundle: Bundle | null) => {
            if (!bundle) {
                failOpen('[collection-prefab] remote bundle unavailable');
                return;
            }
            bundle.load(prefabPath, Prefab, (err: Error | null, prefab: Prefab | null) => {
                if (err || !prefab) {
                    failOpen(`[collection-prefab] load failed: ${err?.message || 'prefab missing'}`);
                    return;
                }
                let overlay: Node | null = null;
                try {
                    overlay = instantiate(prefab);
                    overlay.name = 'CollectionOverlay';
                    popupRoot.addChild(overlay);
                    overlay.setSiblingIndex(999);
                    if (!overlay.getComponent(BlockInputEvents)) overlay.addComponent(BlockInputEvents);
                    runtime._collectionOverlay = overlay;

                    const box = runtime.requirePanelChild(overlay, 'Box');
                    syncPrefabPopupTitle(box, '图鉴');
                    if (!box.getComponent(BlockInputEvents)) box.addComponent(BlockInputEvents);
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
                        const leftArrow = overlay.getChildByName('ArrowLeft');
                        const rightArrow = overlay.getChildByName('ArrowRight');
                        if ((leftArrow && isInsideNode(leftArrow, point)) || (rightArrow && isInsideNode(rightArrow, point))) return;
                        AudioMgr.inst.play('uiPanel');
                        runtime.closeCollection();
                    }, runtime);

                    runtime.bindPanelButton(runtime.requirePanelChild(box, 'XBtn'), () => {
                        AudioMgr.inst.play('uiPanel');
                        runtime.closeCollection();
                    });

                    const content = runtime.requirePanelChild(box, 'CollContent');
                    runtime._collectionContentNode = content;
                    content.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
                        runtime._collectionSwipeStartY = e.getUILocation().y;
                    }, runtime);
                    content.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                        const dy = e.getUILocation().y - runtime._collectionSwipeStartY;
                        if (Math.abs(dy) > 50) {
                            if (dy < 0) runtime.changeCollectionPage(1);
                            else runtime.changeCollectionPage(-1);
                        }
                    }, runtime);

                    runtime._collectionPageIndicator = runtime.requirePanelChild(box, 'PageIndicator');
                    const leftArrow = runtime.requirePanelChild(overlay, 'ArrowLeft');
                    const rightArrow = runtime.requirePanelChild(overlay, 'ArrowRight');
                    leftArrow.active = false;
                    rightArrow.active = false;
                    runtime.bindPanelButton(leftArrow, () => {
                        const moved = runtime.changeCollectionPage(-1);
                        if (moved) AudioMgr.inst.play('uiPanel');
                    });
                    runtime.bindPanelButton(rightArrow, () => {
                        const moved = runtime.changeCollectionPage(1);
                        if (moved) AudioMgr.inst.play('uiPanel');
                    });

                    runtime.renderCollectionPage(0);
                } catch (error) {
                    failOpen(error instanceof Error ? error.message : '[collection-prefab] build failed', overlay);
                }
            });
        });
    }
}

export function ensureCollectionPanelController(runtime: any): CollectionPanelController {
    if (!runtime._collectionPanelController) {
        runtime._collectionPanelController = new CollectionPanelController(runtime);
    }
    return runtime._collectionPanelController as CollectionPanelController;
}
