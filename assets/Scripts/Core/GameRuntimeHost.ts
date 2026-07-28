import { Component, ECONOMY_NUMERIC_TABLE, SpriteFrame, ccclass, property } from './GameCtrlShared';
import { ensureGameSceneRuntimeController } from './GameSceneRuntimeController';
import { initializeGameCtrlState } from './GameCtrlState';
import { installPlatformGameCtrlModules } from '../Platform/installPlatformGameCtrlModules';

@ccclass('GameRuntimeHost')
export class GameRuntimeHost extends Component {
    [key: string]: any;

    protected static readonly REWARDED_CONTINUE_SECONDS = ECONOMY_NUMERIC_TABLE.revive.continueSeconds;
    protected static readonly WAND_GRID_SIZE = 6;
    protected static readonly VIGOR_CEILING = 10;
    protected static readonly VIGOR_RESTORE_SECONDS = 300;
    protected static readonly LS_VIGOR = 'pdd.vigor';
    protected static readonly LS_VIGOR_TIME = 'pdd.vigorTime';
    protected static readonly DRAG_THRESHOLD = 10;
    protected static readonly BOARD_PAN_SENSITIVITY = 0.8;
    protected static readonly MIN_SCALE = 0.8;
    protected static readonly MAX_SCALE = 2.2;
    protected static readonly BOARD_PLAYABLE_CELL_UI_SIZE = 44;
    protected static readonly BOARD_DYNAMIC_MAX_SCALE_CAP = 6.5;
    protected static readonly VIEWPORT_WIDTH = 720;
    protected static readonly VIEWPORT_HEIGHT = 1280;
    protected static readonly LOADING_BAR_WIDTH = 520;
    protected static readonly LOADING_BAR_HEIGHT = 14;
    protected static readonly LOADING_COVER_BLEED = 24;

    @property(SpriteFrame)
    protected loadingCover: SpriteFrame | null = null;

    onLoad() {
        installPlatformGameCtrlModules(this);
        initializeGameCtrlState(this);
        ensureGameSceneRuntimeController(this);
    }

    getRuntimeSceneName(fallback: string = 'Game'): string {
        return ensureGameSceneRuntimeController(this).getRuntimeSceneName(fallback);
    }

    start() {
        ensureGameSceneRuntimeController(this).start();
    }

    update(dt: number) {
        ensureGameSceneRuntimeController(this).update(dt);
    }

    onDestroy() {
        (this._sceneRuntimeController || ensureGameSceneRuntimeController(this)).destroy();
    }
}
