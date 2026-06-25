import { installGameCtrlModules } from '../../Core/installGameCtrlModules';
import { installDouyinSidebarModule, shouldInstallDouyinSidebarModule } from './DouyinSidebarModule';

export function installDouyinGameCtrlModules(runtime: any): void {
    installGameCtrlModules(runtime);
    const shouldInstallSidebar = shouldInstallDouyinSidebarModule();
    console.log('[douyin-sidebar] douyin-module-install-check', { shouldInstallSidebar });
    if (shouldInstallSidebar) {
        installDouyinSidebarModule(runtime);
    }
}
