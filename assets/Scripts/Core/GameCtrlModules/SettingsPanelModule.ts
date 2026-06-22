import { ensureSettingsPanelController } from '../Panels/SettingsPanelController';

export function installSettingsPanelModule(target: any): void {
    Object.assign(target, {
        preloadSettingsPanel() {
            return ensureSettingsPanelController(this).preload();
        },

        openSettingsPanel() {
            return ensureSettingsPanelController(this).open();
        },
    });
}
