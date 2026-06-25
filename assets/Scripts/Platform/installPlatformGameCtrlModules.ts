import { installGameCtrlModules } from '../Core/installGameCtrlModules';
import { installDouyinGameCtrlModules } from './Douyin/installDouyinGameCtrlModules';
import {
    getMiniGameApi,
    getMiniGameBuildPlatform,
    hasDouyinBuildMarker,
    isDouyinMiniGameRuntime,
} from '../Core/MiniGamePlatform';

export function installPlatformGameCtrlModules(runtime: any): void {
    const isDouyin = isDouyinMiniGameRuntime();
    console.log('[douyin-sidebar] platform-install-check', {
        buildPlatform: getMiniGameBuildPlatform(),
        hasDouyinMarker: hasDouyinBuildMarker(),
        hasTt: !!getMiniGameApi('tt'),
        isDouyin,
    });
    if (isDouyin) {
        installDouyinGameCtrlModules(runtime);
        return;
    }
    installGameCtrlModules(runtime);
}
