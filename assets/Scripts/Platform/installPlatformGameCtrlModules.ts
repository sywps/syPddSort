import { installGameCtrlModules } from '../Core/installGameCtrlModules';
import { installDouyinGameCtrlModules } from './Douyin/installDouyinGameCtrlModules';
import { isDouyinMiniGameRuntime } from '../Core/MiniGamePlatform';

export function installPlatformGameCtrlModules(runtime: any): void {
    if (isDouyinMiniGameRuntime()) {
        installDouyinGameCtrlModules(runtime);
        return;
    }
    installGameCtrlModules(runtime);
}
