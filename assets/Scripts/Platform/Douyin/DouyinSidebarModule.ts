import {
    assetManager,
    AudioMgr,
    Button,
    HOME_ASSETS_BUNDLE_NAME,
    instantiate,
    Label,
    Node,
    Prefab,
    SySDKMgr,
    sys,
    UITransform,
} from '../../Core/GameCtrlShared';
import { screen, Vec2 } from 'cc';
import type { Bundle } from '../../Core/GameCtrlShared';
import { getDouyinMiniGameRuntime } from '../../Core/MiniGamePlatform';
import { openCollectionShellOverlay } from '../../Core/Panels/CollectionShellOverlay';
import { runtimeLog, runtimeWarn } from '../../Core/RuntimeLog';
import { AnalyticsMgr } from '../../Core/AnalyticsMgr';

function trackSidebar(eventName: string, success: boolean, source: string): void {
    try { AnalyticsMgr.inst.trackFunnelEvent({ eventName, success, source, page: 'douyin_sidebar' }); }
    catch (_) { console.error('[douyin-sidebar] telemetry failed'); }
}

const DOUYIN_SIDEBAR_BUTTON_NAME = 'DouyinSidebarTaskButton';
const DOUYIN_SIDEBAR_BUTTON_PREFAB_PATH = 'UI/Prefabs/Buttons/DouyinSidebarTaskButton';
const DOUYIN_SIDEBAR_BUTTON_LABEL_NAME = 'SidebarTaskLbl';
const DOUYIN_SIDEBAR_GUIDE_PREFAB_PATH = 'UI/Prefabs/Panels/DouyinSidebarGuidePanel';
const DOUYIN_SIDEBAR_REWARD_PROPS = ['freeze', 'brush', 'magnet'] as const;
const DOUYIN_SIDEBAR_REWARD_COUNT = 1;
const DOUYIN_SIDEBAR_REWARD_CLAIMED_DATE_KEY = 'pdd.douyin.sidebarReward.claimedDate';
const DOUYIN_SIDEBAR_BUTTON_TASK_LABEL = '入口有礼';

// Match Cocos 3.8.8 PAL touch coordinates; the vendor requires a native touch-start gesture.
export function bindDouyinSidebarGuideTouch(tt: any, button: Node, onTouch: () => void): () => void {
    if (typeof tt?.onTouchStart !== 'function' || typeof tt?.offTouchStart !== 'function') {
        throw new Error('[douyin-sidebar] native touch-start API unavailable');
    }
    const transform = button.getComponent(UITransform);
    if (!transform) throw new Error('[douyin-sidebar] guide button UITransform missing');
    let disposed = false;
    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        tt.offTouchStart(handler);
    };
    const handler = (event: any) => {
        if (disposed || !button.isValid || !button.activeInHierarchy) return;
        const touch = event?.changedTouches?.[0];
        if (!Number.isFinite(touch?.clientX) || !Number.isFinite(touch?.clientY)) return;
        const point = new Vec2(touch.clientX * screen.devicePixelRatio,
            screen.windowSize.height - touch.clientY * screen.devicePixelRatio);
        if (!transform.hitTest(point)) return;
        cleanup();
        onTouch();
    };
    tt.onTouchStart(handler);
    return cleanup;
}

function logSidebar(step: string, data: Record<string, unknown> = {}): void {
    runtimeLog(`[douyin-sidebar] ${step}`, data);
}

function pad2(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
}

function getLocalDateKey(date: Date = new Date()): string {
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    return `${date.getFullYear()}${month}${day}`;
}

function findChildDeep(parent: Node, name: string): Node | null {
    const direct = parent.getChildByName(name);
    if (direct) return direct;
    for (const child of parent.children) {
        const matched = findChildDeep(child, name);
        if (matched) return matched;
    }
    return null;
}

function requireDeepChild(parent: Node, name: string): Node {
    const node = findChildDeep(parent, name);
    if (!node) throw new Error(`[douyin-sidebar] guide prefab missing node: ${name}`);
    return node;
}

function setSidebarButtonLabel(btn: Node, value: string): void {
    const label = requireDeepChild(btn, DOUYIN_SIDEBAR_BUTTON_LABEL_NAME).getComponent(Label);
    if (!label) throw new Error(`[douyin-sidebar] button prefab missing Label: ${DOUYIN_SIDEBAR_BUTTON_LABEL_NAME}`);
    label.string = value;
}

export function shouldInstallDouyinSidebarModule(): boolean {
    const tt = getDouyinMiniGameRuntime();
    const shouldInstall = true;
    logSidebar('should-install', {
        hasTt: !!tt,
        hasNavigateToScene: !!(tt && typeof tt.navigateToScene === 'function'),
        hasCheckScene: !!(tt && typeof tt.checkScene === 'function'),
        shouldInstall,
    });
    return shouldInstall;
}

export function installDouyinSidebarModule(target: any): void {
    Object.assign(target, {
        drawSidebarEntry(parent: Node) {
            logSidebar('draw-entry-start', {
                parentName: parent.name,
                parentValid: parent.isValid,
                mainMenuValid: !!this.mainMenuNode?.isValid,
                childCount: parent.children.length,
            });
            const reservedBtn = parent.getChildByName('PlatformReservedBtn');
            if (reservedBtn?.isValid) {
                reservedBtn.active = false;
            }
            const existing = parent.getChildByName(DOUYIN_SIDEBAR_BUTTON_NAME);
            if (existing?.isValid) {
                existing.active = false;
            }

            if (!parent.isValid || !this.mainMenuNode?.isValid) {
                logSidebar('draw-entry-skip-invalid-parent', {
                    parentValid: parent.isValid,
                    mainMenuValid: !!this.mainMenuNode?.isValid,
                });
                return;
            }
            this._douyinSidebarUnsubscribe?.();
            this._douyinSidebarUnsubscribe = SySDKMgr.inst.subscribeDouyinSidebar(() => {
                if (!parent.isValid || !this.mainMenuNode?.isValid) return;
                this.showDouyinSidebarButton(parent);
            });
            SySDKMgr.inst.refreshDouyinSidebar();
        },

        showDouyinSidebarButton(parent: Node) {
            const existing = parent.getChildByName(DOUYIN_SIDEBAR_BUTTON_NAME);
            if (existing?.isValid) {
                existing.active = true;
                this.syncDouyinSidebarButtonState(existing);
                this.bindDouyinSidebarButton(existing);
                logSidebar('show-existing-button', {
                    active: existing.active,
                    position: existing.position.toString(),
                });
                return;
            }

            if (this._douyinSidebarButtonLoadingParent === parent) return;
            this._douyinSidebarButtonLoadingParent = parent;
            const finishLoad = () => {
                if (this._douyinSidebarButtonLoadingParent === parent) this._douyinSidebarButtonLoadingParent = null;
            };
            logSidebar('load-button-bundle-start', { bundleName: HOME_ASSETS_BUNDLE_NAME });
            assetManager.loadBundle(HOME_ASSETS_BUNDLE_NAME, (bundleErr: Error | null, bundle: Bundle | null) => {
                if (bundleErr || !bundle) {
                    finishLoad();
                    logSidebar('load-button-bundle-failed', { error: bundleErr?.message || 'bundle missing' });
                    throw new Error(`[douyin-sidebar] loadBundle ${HOME_ASSETS_BUNDLE_NAME} failed: ${bundleErr?.message || 'bundle missing'}`);
                }
                logSidebar('load-button-prefab-start', { prefabPath: DOUYIN_SIDEBAR_BUTTON_PREFAB_PATH });
                bundle.load(DOUYIN_SIDEBAR_BUTTON_PREFAB_PATH, Prefab, (prefabErr: Error | null, prefab: Prefab | null) => {
                    finishLoad();
                    if (prefabErr || !prefab) {
                        logSidebar('load-button-prefab-failed', { error: prefabErr?.message || DOUYIN_SIDEBAR_BUTTON_PREFAB_PATH });
                        throw new Error(`[douyin-sidebar] load prefab failed: ${prefabErr?.message || DOUYIN_SIDEBAR_BUTTON_PREFAB_PATH}`);
                    }
                    if (!parent.isValid || !this.mainMenuNode?.isValid) {
                        logSidebar('instantiate-skip-invalid-parent', {
                            parentValid: parent.isValid,
                            mainMenuValid: !!this.mainMenuNode?.isValid,
                        });
                        return;
                    }
                    if (parent.getChildByName(DOUYIN_SIDEBAR_BUTTON_NAME)?.isValid) return;
                    const btn = instantiate(prefab);
                    btn.name = DOUYIN_SIDEBAR_BUTTON_NAME;
                    parent.addChild(btn);
                    btn.active = true;
                    this.syncDouyinSidebarButtonState(btn);
                    this.bindDouyinSidebarButton(btn);
                    logSidebar('button-added', {
                        active: btn.active,
                        parentName: parent.name,
                        position: btn.position.toString(),
                        childCount: parent.children.length,
                    });
                });
            });
        },

        bindDouyinSidebarButton(btn: Node) {
            const button = btn.getComponent(Button);
            if (!button) throw new Error('[douyin-sidebar] sidebar button prefab is missing Button component');
            this._douyinSidebarTaskButton = btn;
            this.syncDouyinSidebarButtonState(btn);
            btn.targetOff(this);
            btn.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                this.openDouyinSidebarGuide();
            }, this);
        },

        hasClaimedDouyinSidebarRewardToday(): boolean {
            return sys.localStorage.getItem(DOUYIN_SIDEBAR_REWARD_CLAIMED_DATE_KEY) === getLocalDateKey();
        },

        hasPendingDouyinSidebarRewardToday(): boolean {
            const state = SySDKMgr.inst.getDouyinSidebarState();
            return state.canShow && state.eligibleToday;
        },

        syncDouyinSidebarButtonState(btn?: Node | null): void {
            const target = btn?.isValid ? btn : this._douyinSidebarTaskButton;
            if (!target?.isValid) return;
            const label = DOUYIN_SIDEBAR_BUTTON_TASK_LABEL;
            setSidebarButtonLabel(target, label);
            logSidebar('button-label-sync', { label: label.replace('\n', '/') });
        },

        tryClaimDouyinSidebarReward(source: string = 'unknown'): boolean {
            if (this._douyinSidebarClaiming) return true;
            if (this.hasClaimedDouyinSidebarRewardToday()) {
                this.syncDouyinSidebarButtonState();
                logSidebar('reward-already-claimed', { source });
                return true;
            }
            if (!this.hasPendingDouyinSidebarRewardToday()) {
                return false;
            }
            if (typeof this.addPropCount !== 'function') {
                throw new Error('[douyin-sidebar] runtime missing addPropCount() for reward claim');
            }
            this._douyinSidebarClaiming = true;
            const rewardProp = DOUYIN_SIDEBAR_REWARD_PROPS[Math.floor(Math.random() * DOUYIN_SIDEBAR_REWARD_PROPS.length)];
            try {
                this.addPropCount(rewardProp, DOUYIN_SIDEBAR_REWARD_COUNT);
                // Same-device daily claim only. Server-side identity/day/idempotency awaits Douyin Cloud.
                sys.localStorage.setItem(DOUYIN_SIDEBAR_REWARD_CLAIMED_DATE_KEY, getLocalDateKey());
                trackSidebar('douyin_sidebar_reward_result', true, source);
            } catch (error) {
                trackSidebar('douyin_sidebar_reward_result', false, source);
                throw error;
            } finally {
                this._douyinSidebarClaiming = false;
            }
            this.syncDouyinSidebarButtonState();
            logSidebar('reward-claimed', {
                source,
                rewardProp,
                rewardCount: DOUYIN_SIDEBAR_REWARD_COUNT,
            });
            return true;
        },

        openDouyinSidebarGuide() {
            if (this._douyinSidebarGuideOverlay?.isValid || this._douyinSidebarGuideLoading) return;
            this._douyinSidebarGuideLoading = true;
            this._douyinSidebarGuideOverlay = null;
            openCollectionShellOverlay(this, {
                overlayName: 'DouyinSidebarGuideOverlay',
                prefabPath: DOUYIN_SIDEBAR_GUIDE_PREFAB_PATH,
                title: '入口有礼',
                siblingIndex: 1001,
                requireActionNodes: false,
                onClose: () => {
                    this._douyinSidebarGuideLoading = false;
                    this._douyinSidebarGuideTouchCleanup?.();
                    this._douyinSidebarGuideTouchCleanup = null;
                    this._douyinSidebarGuideOverlay = null;
                },
                onError: () => {
                    this._douyinSidebarGuideLoading = false;
                    this._douyinSidebarGuideTouchCleanup?.();
                    this._douyinSidebarGuideTouchCleanup = null;
                    this._douyinSidebarGuideOverlay = null;
                },
                onReady: ({ overlay, box, close }) => {
                    this._douyinSidebarGuideLoading = false;
                    this._douyinSidebarGuideOverlay = overlay;
                    const enterBtn = requireDeepChild(box, 'EnterBtn');
                    const enterLabel = requireDeepChild(enterBtn, 'EnterLabel').getComponent(Label);
                    if (!enterLabel) throw new Error('[douyin-sidebar] guide prefab missing EnterLabel component');
                    this._douyinSidebarGuideTouchCleanup?.();
                    this._douyinSidebarGuideTouchCleanup = null;
                    // Claim only after the panel is ready; completion is shown inside it.
                    this.tryClaimDouyinSidebarReward('home_entry');
                    if (this.hasClaimedDouyinSidebarRewardToday()) {
                        enterLabel.string = '已完成';
                        const button = enterBtn.getComponent(Button);
                        if (button) button.interactable = false;
                        return;
                    }
                    this._douyinSidebarGuideTouchCleanup = bindDouyinSidebarGuideTouch(getDouyinMiniGameRuntime(), enterBtn, () => {
                        AudioMgr.inst.play('button');
                        this.openDouyinSidebarScene();
                        close();
                    });
                },
            });
        },
        openDouyinSidebarScene() {
            if (this.hasClaimedDouyinSidebarRewardToday()) {
                return;
            }
            void SySDKMgr.inst.openDouyinSidebar().then(
                () => {
                    logSidebar('navigate-sidebar-success', { rewardProps: DOUYIN_SIDEBAR_REWARD_PROPS, rewardCount: DOUYIN_SIDEBAR_REWARD_COUNT });
                    trackSidebar('douyin_sidebar_guide_result', true, 'sdk_guide');
                },
                (err: any) => {
                    trackSidebar('douyin_sidebar_guide_result', false, 'sdk_guide');
                    runtimeWarn('[douyin-sidebar] navigateToScene failed:', err);
                    this.showToast?.('\u4fa7\u680f\u6253\u5f00\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', 1.8);
                },
            );
        },
    });
}
