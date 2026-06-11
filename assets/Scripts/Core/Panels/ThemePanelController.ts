import {
    EventTouch,
    Label,
    LEADERBOARD_SCROLL_DECAY,
    LEADERBOARD_SCROLL_MIN_SPEED,
    Mask,
    Node,
    THEME_PANEL_TEXTURE_NAMES,
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
        if (THEME_PANEL_TEXTURE_NAMES.some((name: string) => !runtime.getSF(name))) {
            runtime._openPanelAfterTextures('theme', THEME_PANEL_TEXTURE_NAMES, () => !!runtime._themeOverlay, () => this.open());
            return;
        }
        openCollectionShellOverlay(runtime, {
            overlayName: 'ThemeOverlay',
            prefabPath: 'UI/Prefabs/Panels/ThemePanel',
            title: '主题挑战',
            siblingIndex: 999,
            requireActionNodes: false,
            onClose: () => {
                runtime._themeOverlay = null;
                runtime._themeScrollSuppressClick = false;
            },
            onReady: ({ overlay, box, content }) => {
                runtime._themeOverlay = overlay;
                const contentUi = content.getComponent(UITransform);
                if (!contentUi) {
                    throw new Error('[theme-panel] ThemePanel.prefab is missing UITransform on CollContent');
                }
                const scrollH = contentUi.height;
                const mask = content.getComponent(Mask);
                if (!mask) {
                    throw new Error('[theme-panel] ThemePanel.prefab is missing Mask on CollContent');
                }
                const ruleNode = box.getChildByName('ThemeRuleLabel');
                const ruleLabel = ruleNode?.getComponent(Label);
                if (ruleNode && ruleLabel) {
                    ruleNode.active = true;
                    ruleLabel.string = `主线第${runtime.getThemePanelOpenRequirementLevel()}关解锁第1关，每过${runtime.getThemeUnlockStepLevel()}关可解锁1个主题关`;
                }

                for (const child of content.children) {
                    child.active = child.name === 'ThemeScrollContent';
                }
                const scrollContent = runtime.requirePanelChild(content, 'ThemeScrollContent');
                scrollContent.active = true;
                scrollContent.layer = content.layer;
                const scrollContentUi = scrollContent.getComponent(UITransform);
                if (!scrollContentUi) {
                    throw new Error('[theme-panel] ThemePanel.prefab is missing UITransform on ThemeScrollContent');
                }
                for (const child of scrollContent.children) {
                    if (child.name !== 'ThemeCardTemplate' && child.name !== 'ThemeHeaderTemplate') {
                        child.destroy();
                    }
                }
                runtime.requirePanelChild(scrollContent, 'ThemeHeaderTemplate').active = false;
                runtime.requirePanelChild(scrollContent, 'ThemeCardTemplate').active = false;

                runtime.renderThemePanelContent(scrollContent, scrollContentUi.width, scrollH);

                let startY = 0;
                let lastY = 0;
                let lastMoveAt = 0;
                let velocity = 0;
                let dragging = false;
                let inertiaStep: ((dt: number) => void) | null = null;
                const dragThreshold = 8;
                const getRange = () => {
                    const totalH = scrollContent.getComponent(UITransform)!.height;
                    const half = Math.max(0, (totalH - scrollH) / 2);
                    return { minY: -half, maxY: half, totalH };
                };
                const stopInertia = () => {
                    if (inertiaStep) {
                        runtime.unschedule(inertiaStep);
                        inertiaStep = null;
                    }
                    velocity = 0;
                };
                const setScrollY = (nextY: number) => {
                    const { minY, maxY, totalH } = getRange();
                    if (totalH <= scrollH) {
                        scrollContent.setPosition(scrollContent.position.x, 0, 0);
                        return 0;
                    }
                    const clamped = Math.max(minY, Math.min(maxY, nextY));
                    scrollContent.setPosition(scrollContent.position.x, clamped, 0);
                    return clamped;
                };
                const endHandler = (_e?: EventTouch) => {
                    dragging = false;
                    if (Math.abs(velocity) < LEADERBOARD_SCROLL_MIN_SPEED) {
                        return;
                    }
                    inertiaStep = (dt: number = 1 / 60) => {
                        if (!content.isValid || !scrollContent.isValid) {
                            stopInertia();
                            return;
                        }
                        const { minY, maxY, totalH } = getRange();
                        if (totalH <= scrollH) {
                            stopInertia();
                            return;
                        }
                        const nextY = setScrollY(scrollContent.position.y + velocity * dt);
                        if ((nextY === minY && velocity < 0) || (nextY === maxY && velocity > 0)) {
                            stopInertia();
                            return;
                        }
                        velocity *= LEADERBOARD_SCROLL_DECAY;
                        if (Math.abs(velocity) < LEADERBOARD_SCROLL_MIN_SPEED) {
                            stopInertia();
                        }
                    };
                    runtime.schedule(inertiaStep, 0);
                };
                content.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
                    stopInertia();
                    startY = e.getUILocation().y;
                    lastY = startY;
                    lastMoveAt = Date.now();
                    velocity = 0;
                    dragging = true;
                    runtime._themeScrollSuppressClick = false;
                }, runtime);
                content.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
                    if (!dragging) return;
                    const cy = e.getUILocation().y;
                    const dy = cy - lastY;
                    const now = Date.now();
                    const elapsedMs = Math.max(16, now - lastMoveAt);
                    lastY = cy;
                    lastMoveAt = now;
                    velocity = (dy / elapsedMs) * 1000;
                    if (Math.abs(cy - startY) > dragThreshold) {
                        runtime._themeScrollSuppressClick = true;
                    }
                    setScrollY(scrollContent.position.y + dy);
                }, runtime);
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
