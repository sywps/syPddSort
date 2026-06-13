import { _decorator } from 'cc';
import { ensureGameSceneRuntimeController } from './GameSceneRuntimeController';
import { GameRuntimeHost } from './GameRuntimeHost';

const { ccclass } = _decorator;

@ccclass('BootSceneCtrl')
export class BootSceneCtrl extends GameRuntimeHost {
    start() {
        ensureGameSceneRuntimeController(this).startBootSceneRuntime();
    }
}
