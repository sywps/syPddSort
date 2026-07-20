import { AudioMgr, Node, UITransform, Vec3, view } from '../GameCtrlShared';
import {
    createWeChatGameCircleButton,
    destroyWeChatGameCircleButton,
    getWeChatMiniGameRuntime,
    getWeChatMiniGameWindowInfo,
    type WeChatGameClubButtonHandle,
    type WeChatGameClubButtonStyle,
} from '../MiniGamePlatform';
import { runtimeLog } from '../RuntimeLog';
import { openCollectionShellOverlay } from './CollectionShellOverlay';

const GAME_CIRCLE_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/GameCirclePanel';
const GAME_CIRCLE_PANEL_TITLE = '\u6e38\u620f\u5708';
const GAME_CIRCLE_NATIVE_HIT_PADDING = 12;

function clampRectToWindow(
    style: WeChatGameClubButtonStyle,
    windowSize: { width: number; height: number },
): WeChatGameClubButtonStyle {
    const padding = Math.max(GAME_CIRCLE_NATIVE_HIT_PADDING, Math.min(style.width, style.height) * 0.12);
    const width = Math.min(windowSize.width, Math.max(44, style.width + padding * 2));
    const height = Math.min(windowSize.height, Math.max(44, style.height + padding * 2));
    const left = Math.max(0, Math.min(style.left - padding, windowSize.width - width));
    const top = Math.max(0, Math.min(style.top - padding, windowSize.height - height));
    return {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
    };
}

function resolveUiVisibleLowerLeft(
    visibleSize: { width: number; height: number },
    origin: { x?: number; y?: number } | null | undefined,
    rect?: { left: number; right: number; bottom: number; top: number },
): { x: number; y: number } {
    const epsilon = 1;
    if (
        rect
        && rect.left >= -epsilon
        && rect.right <= visibleSize.width + epsilon
        && rect.bottom >= -epsilon
        && rect.top <= visibleSize.height + epsilon
    ) {
        return { x: 0, y: 0 };
    }
    if (
        rect
        && rect.left >= -visibleSize.width / 2 - epsilon
        && rect.right <= visibleSize.width / 2 + epsilon
        && rect.bottom >= -visibleSize.height / 2 - epsilon
        && rect.top <= visibleSize.height / 2 + epsilon
    ) {
        return { x: -visibleSize.width / 2, y: -visibleSize.height / 2 };
    }
    const originX = Number(origin?.x);
    const originY = Number(origin?.y);
    return {
        x: Number.isFinite(originX) ? originX : 0,
        y: Number.isFinite(originY) ? originY : 0,
    };
}

function resolveNativeButtonStyle(node: Node): WeChatGameClubButtonStyle {
    const ui = node.getComponent(UITransform);
    const windowInfo = getWeChatMiniGameWindowInfo();
    const windowSize = { width: windowInfo.width, height: windowInfo.height };
    const visibleSize = view.getVisibleSize();
    if (!ui) throw new Error('[GameCircle] EnterBtn is missing UITransform');
    if (visibleSize.width <= 0 || visibleSize.height <= 0) {
        throw new Error(`[GameCircle] invalid Cocos visible size: width=${visibleSize.width}, height=${visibleSize.height}`);
    }

    const origin = typeof (view as any).getVisibleOrigin === 'function'
        ? (view as any).getVisibleOrigin()
        : { x: 0, y: 0 };
    const size = ui.contentSize;
    const anchor = ui.anchorPoint;
    const minLocalX = -size.width * anchor.x;
    const maxLocalX = size.width * (1 - anchor.x);
    const minLocalY = -size.height * anchor.y;
    const maxLocalY = size.height * (1 - anchor.y);
    const bottomLeft = ui.convertToWorldSpaceAR(new Vec3(minLocalX, minLocalY, 0));
    const topRight = ui.convertToWorldSpaceAR(new Vec3(maxLocalX, maxLocalY, 0));

    const leftUi = Math.min(bottomLeft.x, topRight.x);
    const rightUi = Math.max(bottomLeft.x, topRight.x);
    const bottomUi = Math.min(bottomLeft.y, topRight.y);
    const topUi = Math.max(bottomLeft.y, topRight.y);
    const visibleLowerLeft = resolveUiVisibleLowerLeft(visibleSize, origin, {
        left: leftUi,
        right: rightUi,
        bottom: bottomUi,
        top: topUi,
    });
    const left = ((leftUi - visibleLowerLeft.x) / visibleSize.width) * windowSize.width;
    const top = (1 - ((topUi - visibleLowerLeft.y) / visibleSize.height)) * windowSize.height;
    const width = ((rightUi - leftUi) / visibleSize.width) * windowSize.width;
    const height = ((topUi - bottomUi) / visibleSize.height) * windowSize.height;

    return clampRectToWindow({
        left: Math.max(0, Math.round(left)),
        top: Math.max(0, Math.round(top)),
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
    }, windowSize);
}

function hasWeChatGameCircleRuntime(): boolean {
    return !!getWeChatMiniGameRuntime();
}

export class GameCirclePanelController {
    constructor(private readonly runtime: any) {}

    destroy(): void {
        this.destroyNativeButton();
        this.runtime._gameCircleOverlay = null;
    }

    private destroyNativeButton(): void {
        const runtime = this.runtime;
        const button = runtime._gameCircleNativeButton as WeChatGameClubButtonHandle | null | undefined;
        runtime._gameCircleNativeButton = null;
        destroyWeChatGameCircleButton(button);
    }

    open(openlink: string): void {
        const runtime = this.runtime;
        if (!hasWeChatGameCircleRuntime()) return;
        if (runtime._gameCircleOverlay?.isValid) return;
        runtime._gameCircleOverlay = null;
        this.destroyNativeButton();

        openCollectionShellOverlay(runtime, {
            overlayName: 'GameCircleOverlay',
            prefabPath: GAME_CIRCLE_PANEL_PREFAB_PATH,
            title: GAME_CIRCLE_PANEL_TITLE,
            siblingIndex: 1001,
            requireActionNodes: false,
            onClose: () => {
                this.destroyNativeButton();
                runtime._gameCircleOverlay = null;
            },
            onError: () => {
                this.destroyNativeButton();
                runtime._gameCircleOverlay = null;
            },
            onReady: ({ overlay, box }) => {
                runtime._gameCircleOverlay = overlay;
                const enterBtn = runtime.requirePanelChild(box, 'EnterBtn');
                const style = resolveNativeButtonStyle(enterBtn);
                const result = createWeChatGameCircleButton(openlink, style, () => {
                    AudioMgr.inst.play('uiPanel');
                });
                runtime._gameCircleNativeButton = result.button;
                runtimeLog('[GameCircle] native button ready:', result.style, result.sdkVersion || '', result.platform || '', result.openlink ? 'openlink' : 'home');
                runtime.bindPanelButton(enterBtn, () => {
                    throw new Error('[GameCircle] Cocos EnterBtn received the tap; wx.createGameClubButton is not covering the visible button');
                });
            },
        });
    }
}

export function ensureGameCirclePanelController(runtime: any): GameCirclePanelController {
    if (!runtime._gameCirclePanelController) {
        runtime._gameCirclePanelController = new GameCirclePanelController(runtime);
    }
    return runtime._gameCirclePanelController as GameCirclePanelController;
}
