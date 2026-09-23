import {
    AudioMgr,
    BlockInputEvents,
    Bundle,
    COLLECTION_TEXTURE_NAMES,
    Color,
    EventTouch,
    Label,
    Node,
    Prefab,
    UITransform,
    Vec3,
    instantiate,
} from '../GameCtrlShared';
import { CoopServiceMgr } from '../CoopServiceMgr';

type CollectionTab = 'main' | 'theme' | 'coop';

function createCollectionTabs(box: Node, runtime: any): void {
    const root = runtime.requirePanelChild(box, 'CollectionTabs');

    const tabs: Array<{ key: CollectionTab; text: string }> = [
        { key: 'main', text: '主线' },
        { key: 'theme', text: '像素拼图' },
        { key: 'coop', text: '合作' },
    ];
    const redraw = () => {
        for (const tab of tabs) {
            const node = root.getChildByName(`CollectionTab_${tab.key}`);
            if (!node) throw new Error(`[collection-prefab] missing tab: ${tab.key}`);
            const active = runtime._collectionActiveTab === tab.key;
            const label = node.getChildByName('Label')?.getComponent(Label);
            if (!label) throw new Error(`[collection-prefab] missing tab label: ${tab.key}`);
            runtime.requirePanelChild(node, 'Selected').active = active;
            runtime.requirePanelChild(node, 'Idle').active = !active;
            label.color = active ? Color.WHITE : new Color('#6655A7');
            label.enableOutline = active;
        }
    };

    const statusNode = runtime.requirePanelChild(root, 'CollectionTabStatus');
    const statusLabel = statusNode.getComponent(Label);
    if (!statusLabel) throw new Error('[collection-prefab] missing tab status label');
    statusNode.active = false;

    let requestId = 0;
    const selectTab = async (key: CollectionTab) => {
        const request = ++requestId;
        runtime._collectionActiveTab = key;
        redraw();
        const progress = runtime.requirePanelChild(box, 'CollectionProgress');
        progress.active = key !== 'coop';
        statusNode.active = key === 'coop';
        runtime._collectionContentNode.active = key !== 'coop';
        if (key === 'coop') {
            statusLabel.string = '正在读取合作图鉴…';
            try {
                const [catalog, result] = await Promise.all([
                    CoopServiceMgr.inst.catalog(runtime), CoopServiceMgr.inst.overview(),
                ]);
                const levels = await Promise.all(catalog.map(entry => CoopServiceMgr.inst.fullLevel(runtime, entry.levelId)));
                if (!root.isValid || request !== requestId) return;
                runtime._collectionCoopEntries = catalog.map((entry, index) => ({
                    ...entry, prefix: 'coop_level_', unlockLevel: 0,
                    unlocked: !!result.overview.unlocked[entry.collectionId],
                    grid: levels[index].correctColorArr,
                }));
            } catch (error) {
                if (root.isValid && request === requestId) {
                    statusLabel.string = `${error instanceof Error ? error.message : '合作图鉴读取失败'}\n点击「合作」重试`;
                }
                return;
            }
        }
        if (!root.isValid || request !== requestId) return;
        statusNode.active = false;
        runtime._collectionContentNode.active = true;
        try {
            runtime.renderCollectionScroll(runtime._collectionContentNode);
            progress.active = true;
        } catch (error) {
            runtime._collectionContentNode.active = false;
            progress.active = false;
            statusNode.active = true;
            statusLabel.string = `${error instanceof Error ? error.message : '图鉴读取失败'}\n点击分类重试`;
        }
    };
    tabs.forEach((tab) => {
        const node = runtime.requirePanelChild(root, `CollectionTab_${tab.key}`);
        node.on(Node.EventType.TOUCH_END, () => {
            AudioMgr.inst.play('button');
            void selectTab(tab.key);
        }, runtime);
    });
    redraw();
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
            runtime.clearCollectionVirtualState?.();
            runtime._collectionOverlay = null;
            runtime._collectionContentNode = null;
            runtime._collectionScrollContentNode = null;
            runtime._collectionPageIndicator = null;
            runtime._collectionScrollDragging = false;
            runtime._collectionScrollMoved = false;
            runtime._collectionScrollSuppressClick = false;
            runtime._releasePanelTextureOwner('collection', 'collection-open-stale');
        };
        const prefabPath = 'UI/Prefabs/Panels/CollectionPanelV2';
        const failOpen = (message: string, overlay?: Node | null) => {
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                runtime._destroyDetachedNodeNextFrame(overlay);
            }
            runtime.clearCollectionVirtualState?.();
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
                        AudioMgr.inst.play('button');
                        runtime.closeCollection();
                    }, runtime);

                    runtime.bindPanelButton(runtime.requirePanelChild(box, 'XBtn'), () => {
                        AudioMgr.inst.play('button');
                        runtime.closeCollection();
                    });

                    const content = runtime.requirePanelChild(box, 'CollContent');
                    runtime._collectionContentNode = content;
                    runtime._collectionActiveTab = runtime._collectionActiveTab === 'theme' ? 'theme' : 'main';
                    createCollectionTabs(box, runtime);

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
