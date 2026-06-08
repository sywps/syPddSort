/**
 * 游戏主控制器 - Gameplay 场景入口壳
 */

import { ccclass } from './GameCtrlShared';
import { ensureGameSceneRuntimeController } from './GameSceneRuntimeController';
import { GameRuntimeHost } from './GameRuntimeHost';

@ccclass('GameCtrl')
export class GameCtrl extends GameRuntimeHost {
    start() {
        ensureGameSceneRuntimeController(this).start();
    }
}
