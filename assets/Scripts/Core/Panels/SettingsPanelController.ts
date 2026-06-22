import {
    AudioMgr,
    BlockInputEvents,
    Button,
    Bundle,
    Node,
    Prefab,
    SETTINGS_PANEL_TEXTURE_NAMES,
    UITransform,
    Vec3,
    instantiate,
} from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';

const SETTINGS_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/SettingsPanel';
const SETTINGS_PREFAB_IN_FLIGHT_KEY = 'settings-prefab';

function buildSettingsToggle(runtime: any, parent: Node, initialOn: boolean, onToggle: (v: boolean) => void) {
    const toggle = parent;
    const onState = parent.getChildByName('ToggleOnState');
    const offState = parent.getChildByName('ToggleOffState');
    if (!onState || !offState) {
        throw new Error('[settings-prefab] missing ToggleOnState/ToggleOffState');
    }
    let currentOn = initialOn;
    const sync = (on: boolean) => {
        currentOn = on;
        toggle.active = true;
        onState.active = on;
        offState.active = !on;
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
    private prefab: Prefab | null = null;
    private prefabLoading = false;
    private prefabCallbacks: Array<(prefab: Prefab | null, error: Error | null) => void> = [];

    constructor(private readonly runtime: any) {}

    preload() {
        if (this.prefab?.isValid || this.prefabLoading) return;
        this.ensurePrefabReady(
            () => {},
            () => {},
        );
    }

    private isRuntimeAlive(): boolean {
        const runtime = this.runtime;
        return !!(runtime?._isRuntimeAliveForAsyncCallback?.() ?? runtime?.isValid);
    }

    private ensureSpriteFramesReady(onDone: () => void, onError: (error: Error) => void): void {
        const runtime = this.runtime;
        const uniqueNames = Array.from(new Set(SETTINGS_PANEL_TEXTURE_NAMES));
        const missingNames = uniqueNames.filter((name) => !runtime.getSF(name));
        if (missingNames.length === 0) {
            onDone();
            return;
        }
        let remaining = missingNames.length;
        const finishOne = () => {
            if (!this.isRuntimeAlive()) return;
            remaining -= 1;
            if (remaining > 0) return;
            const stillMissing = uniqueNames.filter((name) => !runtime.getSF(name));
            if (stillMissing.length > 0) {
                onError(new Error(`[settings-prefab] missing panel SpriteFrames: ${stillMissing.join(', ')}`));
                return;
            }
            onDone();
        };
        for (const name of missingNames) {
            runtime._loadSpriteFrameByName(name, () => {
                finishOne();
            });
        }
    }

    private flushPrefabCallbacks(prefab: Prefab | null, error: Error | null): void {
        const callbacks = this.prefabCallbacks;
        this.prefabCallbacks = [];
        for (const callback of callbacks) {
            callback(prefab, error);
        }
    }

    private ensurePrefabReady(
        onDone: (prefab: Prefab) => void,
        onError: (error: Error) => void,
    ): void {
        if (this.prefab?.isValid) {
            onDone(this.prefab);
            return;
        }
        this.prefabCallbacks.push((prefab, error) => {
            if (prefab) {
                onDone(prefab);
            } else {
                onError(error || new Error('[settings-prefab] prefab unavailable'));
            }
        });
        if (this.prefabLoading) return;
        this.prefabLoading = true;

        const fail = (error: Error) => {
            this.prefabLoading = false;
            this.flushPrefabCallbacks(null, error);
        };

        const loadPrefab = () => {
            if (!this.isRuntimeAlive()) {
                fail(new Error('[settings-prefab] runtime invalid before prefab load'));
                return;
            }
            this.runtime._withGameAssetsBundle((bundle: Bundle | null) => {
                if (!this.isRuntimeAlive()) {
                    fail(new Error('[settings-prefab] runtime invalid during prefab load'));
                    return;
                }
                if (!bundle) {
                    fail(new Error('[settings-prefab] gameAssets bundle unavailable'));
                    return;
                }
                bundle.load(SETTINGS_PANEL_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                    if (!this.isRuntimeAlive()) {
                        fail(new Error('[settings-prefab] runtime invalid after prefab load'));
                        return;
                    }
                    if (err || !prefab) {
                        fail(new Error(`[settings-prefab] load failed: ${err?.message || 'prefab missing'}`));
                        return;
                    }
                    this.prefab = prefab;
                    this.prefabLoading = false;
                    this.flushPrefabCallbacks(prefab, null);
                });
            });
        };

        this.ensureSpriteFramesReady(loadPrefab, fail);
    }

    open() {
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        if (popupRoot.getChildByName('SettingsOverlay')) return;
        if (runtime._panelOpenInFlight.has(SETTINGS_PREFAB_IN_FLIGHT_KEY)) return;

        runtime._panelOpenInFlight.add(SETTINGS_PREFAB_IN_FLIGHT_KEY);
        runtime._retainPanelTextureOwner('settings', SETTINGS_PANEL_TEXTURE_NAMES);
        runtime.pauseTimerForProp();

        let overlay: Node | null = null;
        let settingsClosed = false;
        let modalFocusActive = false;
        const isRuntimeAlive = () => !!(runtime._isRuntimeAliveForAsyncCallback?.() ?? runtime.isValid);
        const isOpenTargetAlive = () => isRuntimeAlive() && !!popupRoot?.isValid;

        const beginSettingsModalFocus = () => {
            if (modalFocusActive) return;
            modalFocusActive = true;
            runtime.beginModalFocus?.('settings');
        };

        const endSettingsModalFocus = () => {
            if (!modalFocusActive) return;
            modalFocusActive = false;
            runtime.endModalFocus?.('settings');
        };

        const cancelStaleOpen = () => {
            if (!isRuntimeAlive()) return;
            runtime._panelOpenInFlight.delete(SETTINGS_PREFAB_IN_FLIGHT_KEY);
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                runtime._destroyDetachedNodeNextFrame(overlay);
            }
            endSettingsModalFocus();
            runtime.resumeTimerForProp();
            runtime._releasePanelTextureOwner('settings', 'settings-prefab-stale');
        };

        const finishFailure = (message: string) => {
            runtime._panelOpenInFlight.delete(SETTINGS_PREFAB_IN_FLIGHT_KEY);
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                runtime._destroyDetachedNodeNextFrame(overlay);
            }
            endSettingsModalFocus();
            runtime.resumeTimerForProp();
            runtime._releasePanelTextureOwner('settings', 'settings-prefab-failed');
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
            if (settingsClosed) return;
            settingsClosed = true;
            if (overlay?.isValid) {
                AudioMgr.inst.play('button');
                runtime._closePanelWithTextureOwner(overlay, 'settings', 'settings');
            }
            runtime.resumeTimerForProp();
            endSettingsModalFocus();
        };

        this.ensurePrefabReady((prefab: Prefab) => {
            if (!isOpenTargetAlive()) {
                cancelStaleOpen();
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
                beginSettingsModalFocus();

                const box = requireChild(overlay, 'Box');
                if (!box.getComponent(BlockInputEvents)) {
                    box.addComponent(BlockInputEvents);
                }
                const xBtn = requireChild(box, 'XBtn');
                const homeBtn = requireChild(box, 'Home');
                const closeBtn = requireChild(box, 'Close');
                const showGameplayActions = runtime.getRuntimeSceneName('Game') === 'Game';
                homeBtn.active = showGameplayActions;
                closeBtn.active = showGameplayActions;

                bindClick(xBtn, closeSettings);
                if (showGameplayActions) {
                    bindClick(closeBtn, closeSettings);
                    bindClick(homeBtn, () => {
                        if (settingsClosed || !overlay?.isValid) return;
                        settingsClosed = true;
                        AudioMgr.inst.play('button');
                        runtime.resumeTimerForProp();
                        runtime._closePanelWithTextureOwner(overlay, 'settings', 'settings-home');
                        endSettingsModalFocus();
                        void AppRoot.inst.requestHomeSceneTransition('settings', 'cover');
                    });
                }

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

                runtime.playPopupOpenAnim?.(overlay, box);
                runtime._panelOpenInFlight.delete(SETTINGS_PREFAB_IN_FLIGHT_KEY);
            } catch (error: any) {
                finishFailure(error?.message || '[settings-prefab] build failed');
            }
        }, (error: Error) => {
            finishFailure(error.message || '[settings-prefab] load failed');
        });
    }
}

export function ensureSettingsPanelController(runtime: any): SettingsPanelController {
    if (!runtime._settingsPanelController) {
        runtime._settingsPanelController = new SettingsPanelController(runtime);
    }
    return runtime._settingsPanelController as SettingsPanelController;
}
