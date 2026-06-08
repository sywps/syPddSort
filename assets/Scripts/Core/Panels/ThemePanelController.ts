import {
    COLLECTION_TEXTURE_NAMES,
    EventTouch,
    Mask,
    Node,
    UITransform,
} from '../GameCtrlShared';
import { openCollectionShellOverlay } from './CollectionShellOverlay';

export class ThemePanelController {
    constructor(private readonly runtime: any) {}

    open() {
        const runtime = this.runtime;
        if (runtime._themeOverlay) return;
        if (!runtime._themeGroupsCache) {
            runtime.loadThemeConfig(() => this.open());
            return;
        }
        const themePanelTextureNames = Array.from(new Set([...COLLECTION_TEXTURE_NAMES, 'home_start_button']));
        if (themePanelTextureNames.some((name: string) => !runtime.getSF(name))) {
            runtime._openPanelAfterTextures('theme', themePanelTextureNames, () => !!runtime._themeOverlay, () => this.open());
            return;
        }
        openCollectionShellOverlay(runtime, {
            overlayName: 'ThemeOverlay',
            title: '主题挑战',
            siblingIndex: 999,
            onClose: () => {
                runtime._themeOverlay = null;
            },
            onReady: ({ overlay, content }) => {
                runtime._themeOverlay = overlay;
                const contentUi = content.getComponent(UITransform);
                if (!contentUi) {
                    throw new Error('[theme-panel] CollectionPanel.prefab is missing UITransform on CollContent');
                }
                const scrollW = contentUi.width;
                const scrollH = contentUi.height;
                const mask = content.getComponent(Mask) || content.addComponent(Mask);
                mask.type = Mask.Type.GRAPHICS_RECT;

                for (const child of content.children) {
                    child.active = child.name === 'ThemeScrollContent';
                }
                const scrollContent = runtime.requirePanelChild(content, 'ThemeScrollContent');
                scrollContent.active = true;
                (scrollContent.getComponent(UITransform) || scrollContent.addComponent(UITransform)).setContentSize(scrollW, 100);
                scrollContent.layer = content.layer;
                scrollContent.setPosition(0, 0);
                for (const child of scrollContent.children) {
                    if (child.name !== 'ThemeCardTemplate') {
                        child.destroy();
                    }
                }
                runtime.requirePanelChild(scrollContent, 'ThemeCardTemplate').active = false;

                runtime.renderThemePanelContent(scrollContent, scrollW, scrollH);

                let lastY = 0;
                let dragging = false;
                const getRange = () => {
                    const totalH = scrollContent.getComponent(UITransform)!.height;
                    const half = Math.max(0, (totalH - scrollH) / 2);
                    return { minY: -half, maxY: half, totalH };
                };
                content.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
                    lastY = e.getUILocation().y;
                    dragging = true;
                }, runtime);
                content.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
                    if (!dragging) return;
                    const cy = e.getUILocation().y;
                    const dy = cy - lastY;
                    lastY = cy;
                    const { minY, maxY, totalH } = getRange();
                    if (totalH <= scrollH) return;
                    const newY = scrollContent.position.y + dy;
                    const clamped = Math.max(minY, Math.min(maxY, newY));
                    scrollContent.setPosition(scrollContent.position.x, clamped);
                }, runtime);
                const endHandler = (_e: EventTouch) => {
                    dragging = false;
                };
                content.on(Node.EventType.TOUCH_END, endHandler, runtime);
                content.on(Node.EventType.TOUCH_CANCEL, endHandler, runtime);
            },
        });
    }
}

export function ensureThemePanelController(runtime: any): ThemePanelController {
    if (!runtime._themePanelController) {
        runtime._themePanelController = new ThemePanelController(runtime);
    }
    return runtime._themePanelController as ThemePanelController;
}
