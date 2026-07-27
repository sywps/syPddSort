import {
    AudioMgr,
    BlockInputEvents,
    Bundle,
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
        if (runtime._collectionOpenPending) return;
        if (!Array.isArray(runtime._collectionLevelEntries) || runtime._collectionLevelEntries.length < 1) {
            const failCatalogLoad = (error: unknown) => {
                runtime._collectionOpenPending = false;
                if (!(runtime._isRuntimeAliveForAsyncCallback?.() ?? runtime.isValid)) return;
                const reason = error instanceof Error ? error.message : String(error || 'unknown error');
                console.error('[collection-catalog] load failed:', reason);
                runtime.showToast?.('图鉴数据加载失败，请稍后重试', 2);
            };
            runtime._collectionOpenPending = true;
            try {
                runtime.loadCollectionLevelEntries((entries: unknown, err: Error | null) => {
                    runtime._collectionOpenPending = false;
                    if (!(runtime._isRuntimeAliveForAsyncCallback?.() ?? runtime.isValid)) return;
                    if (err || !Array.isArray(entries) || entries.length < 1) {
                        failCatalogLoad(err || new Error('collection entries missing'));
                        return;
                    }
                    runtime._collectionLevelEntries = entries;
                    this.open();
                });
            } catch (error) {
                failCatalogLoad(error);
            }
            return;
        }
        runtime._retainPanelTextureOwner('collection', COLLECTION_TEXTURE_NAMES);

        runtime._collectionTotalPages = 1;
        runtime._collectionPage = 0;

        const isRuntimeAlive = () => !!(runtime._isRuntimeAliveForAsyncCallback?.() ?? runtime.isValid);
        const isOpenTargetAlive = () => isRuntimeAlive() && !!popupRoot?.isValid;
        const cancelStaleOpen = () => {
            if (!isRuntimeAlive()) return;
            runtime._collectionOverlay = null;
            runtime._collectionContentNode = null;
            runtime._collectionScrollContentNode = null;
            runtime._collectionPageIndicator = null;
            runtime._collectionScrollDragging = false;
            runtime._collectionScrollMoved = false;
            runtime._collectionScrollSuppressClick = false;
            runtime._releasePanelTextureOwner('collection', 'collection-open-stale');
        };
        const prefabPath = 'UI/Prefabs/Panels/CollectionPanel';
        const failOpen = (message: string, overlay?: Node | null) => {
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                runtime._destroyDetachedNodeNextFrame(overlay);
            }
            runtime._collectionOverlay = null;
            runtime._collectionContentNode = null;
            runtime._collectionScrollContentNode = null;
            runtime._collectionPageIndicator = null;
            runtime._collectionScrollDragging = false;
            runtime._collectionScrollMoved = false;
            runtime._collectionScrollSuppressClick = false;
            runtime._releasePanelTextureOwner('collection', 'collection-open-failed');
            console.error(message);
        };

        runtime._withGameAssetsBundle((bundle: Bundle | null) => {
            if (!isOpenTargetAlive()) {
                cancelStaleOpen();
                return;
            }
            if (!bundle) {
                failOpen('[collection-prefab] gameAssets bundle unavailable');
                return;
            }
            bundle.load(prefabPath, Prefab, (err: Error | null, prefab: Prefab | null) => {
                if (!isOpenTargetAlive()) {
                    cancelStaleOpen();
                    return;
                }
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
                        AudioMgr.inst.play('uiPanel');
                        runtime.closeCollection();
                    }, runtime);

                    runtime.bindPanelButton(runtime.requirePanelChild(box, 'XBtn'), () => {
                        AudioMgr.inst.play('uiPanel');
                        runtime.closeCollection();
                    });

                    const content = runtime.requirePanelChild(box, 'CollContent');
                    runtime._collectionContentNode = content;

                    runtime._collectionPageIndicator = box.getChildByName('PageIndicator');
                    if (runtime._collectionPageIndicator) runtime._collectionPageIndicator.active = false;

                    runtime.renderCollectionScroll(content);
                    runtime.playPopupOpenAnim?.(overlay, box);
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
