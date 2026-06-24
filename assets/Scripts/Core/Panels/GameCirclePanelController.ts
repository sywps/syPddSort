import { AudioMgr } from '../GameCtrlShared';
import { openCollectionShellOverlay } from './CollectionShellOverlay';

const GAME_CIRCLE_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/GameCirclePanel';
const GAME_CIRCLE_PANEL_TITLE = '\u6e38\u620f\u5708';

export class GameCirclePanelController {
    constructor(private readonly runtime: any) {}

    open(): void {
        const runtime = this.runtime;
        if (runtime._gameCircleOverlay?.isValid) return;
        runtime._gameCircleOverlay = null;

        openCollectionShellOverlay(runtime, {
            overlayName: 'GameCircleOverlay',
            prefabPath: GAME_CIRCLE_PANEL_PREFAB_PATH,
            title: GAME_CIRCLE_PANEL_TITLE,
            siblingIndex: 1001,
            requireActionNodes: false,
            onClose: () => {
                runtime._gameCircleOverlay = null;
            },
            onError: () => {
                runtime._gameCircleOverlay = null;
            },
            onReady: ({ overlay, box }) => {
                runtime._gameCircleOverlay = overlay;
                const enterBtn = runtime.requirePanelChild(box, 'EnterBtn');
                runtime.bindPanelButton(enterBtn, () => {
                    AudioMgr.inst.play('uiPanel');
                    void runtime.enterGameCircle?.();
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
