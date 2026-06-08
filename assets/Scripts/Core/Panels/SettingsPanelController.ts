import {
    AudioMgr,
    BlockInputEvents,
    Button,
    Node,
    Prefab,
    Sprite,
    SETTINGS_PANEL_RELEASE_TEXTURE_NAMES,
    SETTINGS_PANEL_TEXTURE_NAMES,
    UITransform,
    Vec3,
    instantiate,
} from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';

const SETTINGS_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/SettingsPanel';
const SETTINGS_PREFAB_IN_FLIGHT_KEY = 'settings-prefab';

function buildSettingsToggle(runtime: any, parent: Node, initialOn: boolean, onToggle: (v: boolean) => void) {
    const toggle = parent.getChildByName('PreviewToggleBg');
    const sprite = toggle?.getComponent(Sprite);
    if (!toggle || !sprite) {
        throw new Error('[settings-prefab] missing PreviewToggleBg sprite');
    }
    const knob = toggle.getChildByName('PreviewToggleKnob');
    const textNode = toggle.getChildByName('PreviewToggleText');
    let currentOn = initialOn;
    const sync = (on: boolean) => {
        currentOn = on;
        toggle.active = true;
        const frameName = on ? 'popup_settings_toggle_on' : 'popup_settings_toggle_off';
        const frame = runtime.getSF(frameName);
        if (!frame) {
            throw new Error(`[settings-prefab] missing toggle sprite frame: ${frameName}`);
        }
        sprite.spriteFrame = frame;
        if (knob) knob.active = false;
        if (textNode) textNode.active = false;
    };
    sync(initialOn);
    toggle.targetOff(runtime);
    toggle.getComponent(Button) || toggle.addComponent(Button);
    toggle.on(Button.EventType.CLICK, () => {
        AudioMgr.inst.play('button');
        const next = !currentOn;
        sync(next);
        onToggle(next);
    }, runtime);
}

export class SettingsPanelController {
    constructor(private readonly runtime: any) {}

    open() {
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        if (SETTINGS_PANEL_TEXTURE_NAMES.some((name: string) => !runtime.getSF(name))) {
            runtime._openPanelAfterTextures(
                'settings',
                SETTINGS_PANEL_TEXTURE_NAMES,
                () => !!popupRoot.getChildByName('SettingsOverlay'),
                () => this.open(),
            );
            return;
        }
        if (popupRoot.getChildByName('SettingsOverlay')) return;
        if (runtime._panelOpenInFlight.has(SETTINGS_PREFAB_IN_FLIGHT_KEY)) return;

        runtime._panelOpenInFlight.add(SETTINGS_PREFAB_IN_FLIGHT_KEY);
        runtime.pauseTimerForProp();

        let overlay: Node | null = null;
        let settingsClosed = false;

        const finishFailure = (message: string) => {
            runtime._panelOpenInFlight.delete(SETTINGS_PREFAB_IN_FLIGHT_KEY);
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                overlay.destroy();
            }
            runtime.resumeTimerForProp();
            runtime._releasePanelTexturesNextFrame(SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, 'settings-prefab-failed');
            console.error(message);
        };

        const requireChild = (parent: Node, name: string): Node => {
            const child = parent.getChildByName(name);
            if (!child) {
                throw new Error(`[settings-prefab] missing node: ${name}`);
            }
            return child;
        };

        const bindClick = (node: Node, handler: () => void) => {
            if (!node.getComponent(UITransform)) {
                node.addComponent(UITransform);
            }
            let button = node.getComponent(Button);
            if (!button) {
                button = node.addComponent(Button);
            }
            node.targetOff(runtime);
            node.on(Button.EventType.CLICK, handler, runtime);
        };

        const closeSettings = () => {
            if (settingsClosed || !overlay?.isValid) return;
            settingsClosed = true;
            AudioMgr.inst.play('button');
            runtime.resumeTimerForProp();
            runtime._destroyPanelAndReleaseTextures(overlay, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, 'settings');
        };

        runtime._withGameAssetsBundle((bundle: any) => {
            if (!bundle) {
                finishFailure('[settings-prefab] gameAssets bundle unavailable');
                return;
            }

            bundle.load(SETTINGS_PANEL_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                if (err || !prefab) {
                    finishFailure(`[settings-prefab] load failed: ${err?.message || 'prefab missing'}`);
                    return;
                }

                try {
                    overlay = instantiate(prefab);
                    overlay.name = 'SettingsOverlay';
                    popupRoot.addChild(overlay);
                    overlay.setSiblingIndex(999);
                    if (!overlay.getComponent(BlockInputEvents)) {
                        overlay.addComponent(BlockInputEvents);
                    }

                    const box = requireChild(overlay, 'Box');
                    if (!box.getComponent(BlockInputEvents)) {
                        box.addComponent(BlockInputEvents);
                    }
                    const xBtn = requireChild(box, 'XBtn');
                    const homeBtn = requireChild(box, 'Home');
                    const closeBtn = requireChild(box, 'Close');

                    bindClick(xBtn, closeSettings);
                    bindClick(closeBtn, closeSettings);
                    bindClick(homeBtn, () => {
                        if (settingsClosed || !overlay?.isValid) return;
                        if (runtime.getRuntimeSceneName('Game') === 'Home') {
                            closeSettings();
                            return;
                        }
                        settingsClosed = true;
                        AudioMgr.inst.play('button');
                        runtime.resumeTimerForProp();
                        runtime._destroyPanelAndReleaseTextures(overlay, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, 'settings');
                        void AppRoot.inst.requestHomeSceneTransition('settings');
                    });

                    overlay.on(Node.EventType.TOUCH_END, (event: any) => {
                        const boxTransform = box.getComponent(UITransform);
                        if (!boxTransform) return;
                        const uiPos = event.getUILocation();
                        const local = boxTransform.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
                        const size = boxTransform.contentSize;
                        if (Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2) {
                            return;
                        }
                        closeSettings();
                    }, runtime);

                    const items = [
                        { row: 'SettingsRow0', get: () => AudioMgr.inst.isSfxEnabled(), set: (value: boolean) => AudioMgr.inst.setSfxEnabled(value) },
                        { row: 'SettingsRow1', get: () => AudioMgr.inst.isVibrateEnabled(), set: (value: boolean) => AudioMgr.inst.setVibrateEnabled(value) },
                        { row: 'SettingsRow2', get: () => AudioMgr.inst.isBgmEnabled(), set: (value: boolean) => AudioMgr.inst.setBgmEnabled(value) },
                    ];
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const row = requireChild(box, item.row);
                        const toggleWrap = requireChild(row, 'ToggleWrap');
                        buildSettingsToggle(runtime, toggleWrap, item.get(), (value: boolean) => item.set(value));
                    }

                    runtime._panelOpenInFlight.delete(SETTINGS_PREFAB_IN_FLIGHT_KEY);
                } catch (error: any) {
                    finishFailure(error?.message || '[settings-prefab] build failed');
                }
            });
        });
    }
}

export function ensureSettingsPanelController(runtime: any): SettingsPanelController {
    if (!runtime._settingsPanelController) {
        runtime._settingsPanelController = new SettingsPanelController(runtime);
    }
    return runtime._settingsPanelController as SettingsPanelController;
}
