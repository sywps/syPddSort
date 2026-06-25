import { installGameCtrlModules } from '../Core/installGameCtrlModules';
import { installDouyinGameCtrlModules } from './Douyin/installDouyinGameCtrlModules';
import { getMiniGameBuildPlatform, isDouyinMiniGameRuntime } from '../Core/MiniGamePlatform';
import { runtimeLog } from '../Core/RuntimeLog';

export function installPlatformGameCtrlModules(runtime: any): void {
    const isDouyin = isDouyinMiniGameRuntime();
    runtimeLog('[platform] install-check', {
        buildPlatform: getMiniGameBuildPlatform(),
        isDouyin,
    });
    if (isDouyin) {
        installDouyinGameCtrlModules(runtime);
        return;
    }
    installGameCtrlModules(runtime);
}
