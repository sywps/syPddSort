import { installGameCtrlModules } from '../../Core/installGameCtrlModules';
import { installDouyinSidebarModule, shouldInstallDouyinSidebarModule } from './DouyinSidebarModule';

export function installDouyinGameCtrlModules(runtime: any): void {
    installGameCtrlModules(runtime);
    if (shouldInstallDouyinSidebarModule()) {
        installDouyinSidebarModule(runtime);
    }
}
