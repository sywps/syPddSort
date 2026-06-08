import { _decorator } from 'cc';
import { ensureGameSceneRuntimeController } from './GameSceneRuntimeController';
import { GameRuntimeHost } from './GameRuntimeHost';

const { ccclass } = _decorator;

@ccclass('HomeSceneCtrl')
export class HomeSceneCtrl extends GameRuntimeHost {
    start() {
        ensureGameSceneRuntimeController(this).startHomeSceneRuntime();
    }
}
