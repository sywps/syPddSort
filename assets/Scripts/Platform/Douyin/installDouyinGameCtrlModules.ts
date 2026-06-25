import { installGameCtrlModules } from '../../Core/installGameCtrlModules';
import { runtimeLog } from '../../Core/RuntimeLog';
import { installDouyinSidebarModule, shouldInstallDouyinSidebarModule } from './DouyinSidebarModule';

export function installDouyinGameCtrlModules(runtime: any): void {
    installGameCtrlModules(runtime);
    const shouldInstallSidebar = shouldInstallDouyinSidebarModule();
    runtimeLog('[douyin-sidebar] douyin-module-install-check', { shouldInstallSidebar });
    if (shouldInstallSidebar) {
        installDouyinSidebarModule(runtime);
    }
}
