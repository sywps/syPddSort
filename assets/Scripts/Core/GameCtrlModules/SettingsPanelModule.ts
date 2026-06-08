import { ensureSettingsPanelController } from '../Panels/SettingsPanelController';

export function installSettingsPanelModule(target: any): void {
    Object.assign(target, {
        openSettingsPanel() {
            return ensureSettingsPanelController(this).open();
        },
    });
}
