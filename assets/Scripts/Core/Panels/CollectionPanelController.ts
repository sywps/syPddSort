import {
    AudioMgr,
    BlockInputEvents,
    Bundle,
    Button,
    COLLECTION_RELEASE_TEXTURE_NAMES,
    COLLECTION_TEXTURE_NAMES,
    EventTouch,
    Label,
    Mask,
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
        runtime._collectionTotalPages = 1;
        runtime._collectionPage = 0;
        runtime._collectionScrollSuppressClickUntil = 0;

        const prefabPath = 'UI/Prefabs/Panels/CollectionPanel';
        const failOpen = (message: string, overlay?: Node | null) => {
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                overlay.destroy();
            }
            runtime._collectionOverlay = null;
            runtime._collectionContentNode = null;
            runtime._collectionScrollContentNode = null;
            runtime._collectionPageIndicator = null;
            runtime._releasePanelTexturesNextFrame(COLLECTION_RELEASE_TEXTURE_NAMES, 'collection-open-failed');
            console.error(message);
        };

        runtime._withGameAssetsBundle((bundle: Bundle | null) => {
            if (!bundle) {
                failOpen('[collection-prefab] gameAssets bundle unavailable');
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
                    const contentUi = content.getComponent(UITransform);
                    if (!contentUi) {
                        throw new Error('[collection-prefab] missing UITransform on CollContent');
                    }
                    const mask = content.getComponent(Mask) || content.addComponent(Mask);
                    mask.type = Mask.Type.GRAPHICS_RECT;

                    runtime._collectionPageIndicator = runtime.requirePanelChild(box, 'PageIndicator');
                    runtime._collectionPageIndicator.active = false;
                    const leftArrow = overlay.getChildByName('ArrowLeft');
                    const rightArrow = overlay.getChildByName('ArrowRight');
                    if (leftArrow) {
                        leftArrow.active = false;
                        runtime.bindPanelButton(leftArrow, () => {
                            const moved = runtime.changeCollectionPage(-1);
                            if (moved) AudioMgr.inst.play('uiPanel');
                        });
                    }
                    if (rightArrow) {
                        rightArrow.active = false;
                        runtime.bindPanelButton(rightArrow, () => {
                            const moved = runtime.changeCollectionPage(1);
                            if (moved) AudioMgr.inst.play('uiPanel');
                        });
                    }

                    const scrollContent = runtime.renderCollectionPage(0);
                    if (!scrollContent) {
                        throw new Error('[collection-prefab] failed to render collection scroll content');
                    }

                    const activeTouchY = new Map<number, number>();
                    let lastY = 0;
                    let dragDistance = 0;
                    let dragging = false;
                    const getTouchId = (touch: any, fallback: number): number => {
                        if (touch && typeof touch.getID === 'function') return touch.getID();
                        return fallback;
                    };
                    const getTouchY = (touch: any): number => {
                        const pos = touch && typeof touch.getUILocation === 'function' ? touch.getUILocation() : null;
                        return pos?.y ?? 0;
                    };
                    const getTouches = (event: any): any[] => {
                        if (event && typeof event.getAllTouches === 'function') {
                            const touches = event.getAllTouches();
                            if (touches.length) return touches;
                        }
                        if (event && typeof event.getTouches === 'function') return event.getTouches();
                        return event ? [event] : [];
                    };
                    const updateTouches = (event: any, removeChanged: boolean = false): number => {
                        const touches = getTouches(event);
                        const activeIds = new Set<number>();
                        for (let i = 0; i < touches.length; i++) {
                            const touch = touches[i];
                            const id = getTouchId(touch, i);
                            activeIds.add(id);
                            activeTouchY.set(id, getTouchY(touch));
                        }
                        if (!removeChanged) {
                            for (const id of Array.from(activeTouchY.keys())) {
                                if (!activeIds.has(id)) activeTouchY.delete(id);
                            }
                        } else {
                            const changedTouches = event && typeof event.getTouches === 'function' ? event.getTouches() : touches;
                            for (let i = 0; i < changedTouches.length; i++) {
                                activeTouchY.delete(getTouchId(changedTouches[i], i));
                            }
                        }
                        return activeTouchY.size;
                    };
                    const averageTouchY = (): number => {
                        if (!activeTouchY.size) return lastY;
                        let total = 0;
                        for (const y of activeTouchY.values()) total += y;
                        return total / activeTouchY.size;
                    };
                    const setScrollY = (nextY: number): number => {
                        const scrollUi = scrollContent.getComponent(UITransform);
                        const totalH = scrollUi?.height || contentUi.height;
                        const half = Math.max(0, (totalH - contentUi.height) / 2);
                        const clamped = Math.max(-half, Math.min(half, nextY));
                        scrollContent.setPosition(scrollContent.position.x, clamped, 0);
                        return clamped;
                    };

                    content.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
                        updateTouches(e);
                        lastY = averageTouchY();
                        dragDistance = 0;
                        dragging = true;
                        runtime._collectionScrollSuppressClickUntil = 0;
                    }, runtime);
                    content.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
                        if (!dragging) return;
                        updateTouches(e);
                        const currentY = averageTouchY();
                        const dy = currentY - lastY;
                        lastY = currentY;
                        dragDistance += Math.abs(dy);
                        if (dragDistance > 8) {
                            runtime._collectionScrollSuppressClickUntil = Date.now() + 150;
                        }
                        setScrollY(scrollContent.position.y + dy);
                    }, runtime);
                    const endScroll = (e: EventTouch) => {
                        updateTouches(e, true);
                        if (dragDistance > 8) {
                            runtime._collectionScrollSuppressClickUntil = Date.now() + 150;
                        }
                        if (activeTouchY.size > 0) {
                            lastY = averageTouchY();
                            return;
                        }
                        dragging = false;
                    };
                    content.on(Node.EventType.TOUCH_END, endScroll, runtime);
                    content.on(Node.EventType.TOUCH_CANCEL, endScroll, runtime);
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
