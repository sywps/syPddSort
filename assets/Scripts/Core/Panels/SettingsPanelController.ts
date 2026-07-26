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
const SETTINGS_PREFAB_LOAD_TIMEOUT_MS = 8000;

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
        const next = !currentOn;
        sync(next);
        onToggle(next);
        AudioMgr.inst.play('button');
    }, runtime);
}

export class SettingsPanelController {
    private prefab: Prefab | null = null;
    private prefabLoading = false;
    private prefabCallbacks: Array<(prefab: Prefab | null, error: Error | null) => void> = [];
    private prefabLoadGeneration = 0;
    private prefabLoadTimeout: any = null;
    private disposed = false;
    private activeClose: (() => void) | null = null;

    constructor(private readonly runtime: any) {}

    preload() {
        if (this.disposed || this.prefab?.isValid || this.prefabLoading) return;
        this.ensurePrefabReady(
            () => {},
            () => {},
        );
    }

    private isRuntimeAlive(): boolean {
        const runtime = this.runtime;
        return !this.disposed && !!(runtime?._isRuntimeAliveForAsyncCallback?.() ?? runtime?.isValid);
    }

    private flushPrefabCallbacks(prefab: Prefab | null, error: Error | null): void {
        const callbacks = this.prefabCallbacks;
        this.prefabCallbacks = [];
        for (const callback of callbacks) {
            try {
                callback(prefab, error);
            } catch (callbackError) {
                console.error('[settings-prefab] completion callback failed', callbackError);
            }
        }
    }

    private ensurePrefabReady(
        onDone: (prefab: Prefab) => void,
        onError: (error: Error) => void,
    ): void {
        if (this.disposed) {
            onError(new Error('[settings-prefab] controller disposed'));
            return;
        }
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
        const generation = ++this.prefabLoadGeneration;
        let settled = false;

        const finish = (prefab: Prefab | null, error: Error | null) => {
            if (settled || generation !== this.prefabLoadGeneration) return;
            settled = true;
            if (this.prefabLoadTimeout) {
                clearTimeout(this.prefabLoadTimeout);
                this.prefabLoadTimeout = null;
            }
            this.prefabLoading = false;
            if (prefab) {
                this.prefab = prefab;
            }
            this.flushPrefabCallbacks(prefab, error);
        };
        const fail = (error: Error) => finish(null, error);
        this.prefabLoadTimeout = setTimeout(() => {
            fail(new Error(`[settings-prefab] load timed out after ${SETTINGS_PREFAB_LOAD_TIMEOUT_MS}ms`));
        }, SETTINGS_PREFAB_LOAD_TIMEOUT_MS);

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
                try {
                    bundle.load(SETTINGS_PANEL_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                        if (!this.isRuntimeAlive()) {
                            fail(new Error('[settings-prefab] runtime invalid after prefab load'));
                            return;
                        }
                        if (err || !prefab) {
                            fail(new Error(`[settings-prefab] load failed: ${err?.message || 'prefab missing'}`));
                            return;
                        }
                        finish(prefab, null);
                    });
                } catch (error: any) {
                    fail(new Error(error?.message || '[settings-prefab] bundle load threw'));
                }
            });
        };

        try {
            loadPrefab();
        } catch (error: any) {
            fail(new Error(error?.message || '[settings-prefab] load threw'));
        }
    }

    dispose(): void {
        if (this.disposed) return;
        const activeClose = this.activeClose;
        this.activeClose = null;
        activeClose?.();
        this.disposed = true;
        this.prefabLoadGeneration += 1;
        if (this.prefabLoadTimeout) {
            clearTimeout(this.prefabLoadTimeout);
            this.prefabLoadTimeout = null;
        }
        this.prefabLoading = false;
        this.flushPrefabCallbacks(null, new Error('[settings-prefab] controller disposed'));
    }

    open() {
        if (this.disposed) return;
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        if (popupRoot.getChildByName('SettingsOverlay')) return;
        if (runtime._panelOpenInFlight.has(SETTINGS_PREFAB_IN_FLIGHT_KEY)) return;

        let overlay: Node | null = null;
        let settingsClosed = false;
        let homeRouteInFlight = false;
        let modalFocusActive = false;
        let modalFocusToken = '';
        let settingsTimerToken = '';
        let timerPauseActive = false;
        let textureOwnerActive = false;
        let openInFlightActive = true;
        const isRuntimeAlive = () => !!(runtime._isRuntimeAliveForAsyncCallback?.() ?? runtime.isValid);
        const isOpenTargetAlive = () => isRuntimeAlive() && !!popupRoot?.isValid;

        runtime._panelOpenInFlight.add(SETTINGS_PREFAB_IN_FLIGHT_KEY);
        try {
            runtime._retainPanelTextureOwner('settings', SETTINGS_PANEL_TEXTURE_NAMES);
            textureOwnerActive = true;
            settingsTimerToken = runtime.pauseTimerForProp('settings') || '';
            timerPauseActive = true;
        } catch (error) {
            runtime._panelOpenInFlight.delete(SETTINGS_PREFAB_IN_FLIGHT_KEY);
            if (textureOwnerActive) {
                try {
                    runtime._releasePanelTextureOwner('settings', 'settings-open-acquire-failed');
                } catch (releaseError) {
                    console.error('[settings-prefab] acquire rollback failed', releaseError);
                }
            }
            console.error('[settings-prefab] lock acquisition failed', error);
            return;
        }

        const clearOpenInFlight = () => {
            if (!openInFlightActive) return;
            openInFlightActive = false;
            runtime._panelOpenInFlight.delete(SETTINGS_PREFAB_IN_FLIGHT_KEY);
        };

        const resumeSettingsTimer = () => {
            if (!timerPauseActive) return;
            timerPauseActive = false;
            try {
                runtime.resumeTimerForProp(settingsTimerToken || 'settings');
            } catch (error) {
                console.error('[settings-prefab] timer release failed', error);
            }
        };

        const beginSettingsModalFocus = () => {
            if (modalFocusActive) return;
            modalFocusActive = true;
            modalFocusToken = runtime.beginModalFocus?.('settings') || '';
        };

        const endSettingsModalFocus = () => {
            if (!modalFocusActive) return;
            modalFocusActive = false;
            try {
                runtime.endModalFocus?.(modalFocusToken || 'settings');
            } catch (error) {
                console.error('[settings-prefab] modal release failed', error);
            }
            modalFocusToken = '';
        };

        const hideSettingsBlocker = () => {
            try {
                if (overlay?.isValid) {
                    overlay.active = false;
                    const blocker = overlay.getComponent(BlockInputEvents);
                    if (blocker) blocker.enabled = false;
                }
            } catch (error) {
                console.error('[settings-prefab] blocker disable failed', error);
            }
        };

        const releaseTextureOwnerNow = (reason: string) => {
            if (!textureOwnerActive) return;
            textureOwnerActive = false;
            try {
                runtime._releasePanelTextureOwner('settings', reason);
            } catch (error) {
                console.error(`[settings-prefab] texture owner release failed: ${reason}`, error);
            }
        };

        const teardownSettingsVisual = (reason: string) => {
            const overlayToClose = overlay;
            if (!overlayToClose?.isValid) {
                releaseTextureOwnerNow(reason);
                return;
            }
            try {
                runtime._closePanelWithTextureOwner(overlayToClose, 'settings', reason);
                textureOwnerActive = false;
            } catch (error) {
                console.error(`[settings-prefab] close teardown failed: ${reason}`, error);
                try {
                    runtime._clearSpriteFramesBeforeDestroy(overlayToClose);
                    runtime._destroyDetachedNodeNextFrame(overlayToClose);
                } catch (fallbackError) {
                    console.error(`[settings-prefab] fallback teardown failed: ${reason}`, fallbackError);
                }
                releaseTextureOwnerNow(`${reason}-fallback`);
            }
        };

        const finalizeSettings = (reason: string, playSound: boolean): boolean => {
            if (settingsClosed) return false;
            settingsClosed = true;
            if (this.activeClose === disposeClose) {
                this.activeClose = null;
            }
            clearOpenInFlight();
            hideSettingsBlocker();
            resumeSettingsTimer();
            endSettingsModalFocus();
            if (playSound) {
                try {
                    AudioMgr.inst.play('button');
                } catch (error) {
                    console.warn(`[settings-prefab] close sound failed: ${reason}`, error);
                }
            }
            teardownSettingsVisual(reason);
            return true;
        };
        const disposeClose = () => {
            finalizeSettings('settings-dispose', false);
        };
        this.activeClose = disposeClose;

        const cancelStaleOpen = () => {
            finalizeSettings('settings-prefab-stale', false);
        };

        const finishFailure = (message: string) => {
            finalizeSettings('settings-prefab-failed', false);
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

        const closeSettings = () => finalizeSettings('settings', true);

        const requestHomeRouteFromSettings = async () => {
            if (!AppRoot.tryGet()) {
                AppRoot.ensure('Game');
            }
            if (typeof runtime.requestHomeRoute === 'function') {
                await runtime.requestHomeRoute('settings', 'none');
                return;
            }
            await AppRoot.inst.requestHomeRoute('settings', 'none');
        };

        this.ensurePrefabReady((prefab: Prefab) => {
            if (settingsClosed) return;
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
                if (showGameplayActions) {
                    const router = AppRoot.tryGet()?.router;
                    if (router && typeof router.preloadHomeScene === 'function') {
                        void router.preloadHomeScene('settings-home-intent').catch(() => {});
                    }
                }

                bindClick(xBtn, closeSettings);
                if (showGameplayActions) {
                    bindClick(closeBtn, closeSettings);
                    bindClick(homeBtn, () => {
                        if (settingsClosed || homeRouteInFlight || !overlay?.isValid) return;
                        homeRouteInFlight = true;
                        if (!finalizeSettings('settings-home', true)) return;
                        void requestHomeRouteFromSettings().catch((error: unknown) => {
                            homeRouteInFlight = false;
                            console.error('[settings-prefab] home route failed:', error);
                        });
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
                clearOpenInFlight();
            } catch (error: any) {
                finishFailure(error?.message || '[settings-prefab] build failed');
            }
        }, (error: Error) => {
            if (settingsClosed) return;
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
