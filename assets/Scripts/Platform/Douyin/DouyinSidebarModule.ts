import {
    AudioMgr,
    Button,
    Label,
    Node,
} from '../../Core/GameCtrlShared';

function getGlobalScope(): any {
    return typeof globalThis !== 'undefined' ? globalThis as any : null;
}

function getWindowScope(): any {
    return typeof window !== 'undefined' ? window as any : null;
}

function getDouyinApi(): any {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    return globalScope?.tt || windowScope?.tt || null;
}

export function shouldInstallDouyinSidebarModule(): boolean {
    const tt = getDouyinApi();
    return !!(tt && typeof tt.checkScene === 'function');
}

export function installDouyinSidebarModule(target: any): void {
    Object.assign(target, {
        drawSidebarEntry(parent: Node) {
            const btn = parent.getChildByName('PlatformReservedBtn');
            if (btn?.isValid) {
                btn.active = false;
            }
            const tt = getDouyinApi();
            if (!tt || typeof tt.checkScene !== 'function') return;

            tt.checkScene({
                scene: 'sidebar',
                success: (res: any) => {
                    if (!res?.isExist) return;
                    if (!parent.isValid || !this.mainMenuNode?.isValid) return;
                    this.showDouyinSidebarButton(parent);
                },
                fail: () => {},
            });
        },

        showDouyinSidebarButton(parent: Node) {
            const btn = this.requireUiChild(parent, 'PlatformReservedBtn', 'EntryLayer/PlatformReservedBtn');
            const labelNode = this.requireUiChild(btn, 'PlatformReservedLbl', 'PlatformReservedBtn/PlatformReservedLbl');
            const label = labelNode.getComponent(Label);
            if (!label) throw new Error('[HomeScene] Home.scene is missing Label component on PlatformReservedBtn/PlatformReservedLbl');
            label.string = '侧边栏';

            btn.active = true;
            btn.targetOff(this);
            btn.getComponent(Button) || btn.addComponent(Button);
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                this.openDouyinSidebarScene();
            }, this);
            this.startHomeSceneScalePulse(btn, 1.08, 0.6);
        },

        openDouyinSidebarScene() {
            const tt = getDouyinApi();
            if (!tt || typeof tt.navigateToScene !== 'function') return;
            tt.navigateToScene({
                scene: 'sidebar',
                success: () => {},
                fail: () => {},
            });
        },
    });
}
