import { _decorator } from 'cc';
import { ensureGameSceneRuntimeController } from './GameSceneRuntimeController';
import { GameRuntimeHost } from './GameRuntimeHost';

const { ccclass } = _decorator;

@ccclass('LoadingSceneCtrl')
export class LoadingSceneCtrl extends GameRuntimeHost {
    start() {
        ensureGameSceneRuntimeController(this).startLoadingSceneRuntime();
    }
}
