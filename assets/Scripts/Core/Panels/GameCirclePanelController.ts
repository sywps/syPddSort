import { AudioMgr, Node, UITransform, Vec3, view } from '../GameCtrlShared';
import {
    createWeChatGameCircleButton,
    destroyWeChatGameCircleButton,
    getWeChatMiniGameWindowSize,
    type WeChatGameClubButtonHandle,
    type WeChatGameClubButtonStyle,
    type WeChatGameCircleButtonResult,
} from '../MiniGamePlatform';
import { openCollectionShellOverlay } from './CollectionShellOverlay';

const GAME_CIRCLE_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/GameCirclePanel';
const GAME_CIRCLE_PANEL_TITLE = '\u6e38\u620f\u5708';

function resolveNativeButtonStyle(node: Node): WeChatGameClubButtonStyle | null {
    const ui = node.getComponent(UITransform);
    const windowSize = getWeChatMiniGameWindowSize();
    const visibleSize = view.getVisibleSize();
    if (!ui || !windowSize || visibleSize.width <= 0 || visibleSize.height <= 0) return null;

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
    const left = ((leftUi - origin.x) / visibleSize.width) * windowSize.width;
    const top = (1 - ((topUi - origin.y) / visibleSize.height)) * windowSize.height;
    const width = ((rightUi - leftUi) / visibleSize.width) * windowSize.width;
    const height = ((topUi - bottomUi) / visibleSize.height) * windowSize.height;

    return {
        left: Math.max(0, Math.round(left)),
        top: Math.max(0, Math.round(top)),
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
    };
}

export class GameCirclePanelController {
    constructor(private readonly runtime: any) {}

    private destroyNativeButton(): void {
        const runtime = this.runtime;
        const button = runtime._gameCircleNativeButton as WeChatGameClubButtonHandle | null | undefined;
        runtime._gameCircleNativeButton = null;
        destroyWeChatGameCircleButton(button);
    }

    open(openlink: string): void {
        const runtime = this.runtime;
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
                const result: WeChatGameCircleButtonResult = style
                    ? createWeChatGameCircleButton(openlink, style, () => {
                        AudioMgr.inst.play('uiPanel');
                    })
                    : { ok: false, message: '游戏圈按钮位置无效' };
                if (result.ok && result.button) {
                    runtime._gameCircleNativeButton = result.button;
                    return;
                }
                console.warn('[GameCircle] native button unavailable:', result.rawError || result.message);
                runtime.bindPanelButton(enterBtn, () => {
                    AudioMgr.inst.play('uiPanel');
                    runtime.showToast?.(result.message || '当前微信版本暂不支持游戏圈按钮', 1.8);
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
