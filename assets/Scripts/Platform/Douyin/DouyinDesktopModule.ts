import {
    assetManager, AudioMgr, Button, HOME_ASSETS_BUNDLE_NAME, instantiate,
    Label, Node, Prefab, sys, UITransform,
} from '../../Core/GameCtrlShared';
import { screen, Vec2 } from 'cc';
import type { Bundle } from '../../Core/GameCtrlShared';
import { getDouyinMiniGameRuntime } from '../../Core/MiniGamePlatform';
import { openCollectionShellOverlay } from '../../Core/Panels/CollectionShellOverlay';
import { runtimeWarn } from '../../Core/RuntimeLog';
import { showDouyinDesktopReward } from '../../Core/ChapterRewardView';

const ENTRY_NAME = 'DouyinDesktopTaskButton';
const ENTRY_PATH = 'UI/Prefabs/Buttons/DouyinDesktopTaskButton';
const GUIDE_PATH = 'UI/Prefabs/Panels/DouyinDesktopGuidePanel';
const CLAIMED_KEY = 'pdd.douyin.desktopReward.claimed.v1';
const REWARD_PROPS = ['freeze', 'brush', 'magnet'] as const;
const ATTEMPT_KEY = 'pdd.douyin.desktopReward.attempt.v1';
const RECEIPT_KEY = 'pdd.douyin.desktopReward.receipt.v1';
type DesktopReceipt = { prop: typeof REWARD_PROPS[number]; before: number; after: number; committing?: boolean };

function desktopReceipt(runtime: any): DesktopReceipt {
    const raw = sys.localStorage.getItem(RECEIPT_KEY);
    if (raw) {
        const receipt = JSON.parse(raw) as DesktopReceipt;
        if (!REWARD_PROPS.includes(receipt.prop) || !Number.isSafeInteger(receipt.before)
            || receipt.before < 0 || receipt.after !== receipt.before + 1) throw Error('Invalid desktop reward receipt');
        return receipt;
    }
    const prop = REWARD_PROPS[Math.floor(Math.random() * REWARD_PROPS.length)];
    const before = runtime.getPropCount(prop);
    if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(before + 1)) throw Error('Invalid desktop reward inventory');
    const receipt = { prop, before, after: before + 1 };
    sys.localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
    return receipt;
}

// Same coordinate conversion as Cocos 3.8.8 PAL and the existing sidebar binding.
// addShortcut must run synchronously inside tt.onTouchEnd, not a deferred Cocos click.
export function bindDouyinDesktopGuideTouch(tt: any, button: Node, canUse: () => boolean, onTouch: () => void): (() => void) | null {
    const methods = ['onTouchStart', 'offTouchStart', 'onTouchEnd', 'offTouchEnd', 'onTouchCancel', 'offTouchCancel'];
    if (!methods.every(name => typeof tt?.[name] === 'function')) return null;
    const transform = button.getComponent(UITransform);
    if (!transform) throw new Error('[douyin-desktop] guide button UITransform missing');
    let disposed = false;
    let touchId: number | null = null;
    const enabled = () => !disposed && button.isValid && button.activeInHierarchy
        && button.getComponent(Button)?.interactable && canUse();
    const hit = (touch: any) => Number.isFinite(touch?.clientX) && Number.isFinite(touch?.clientY)
        && transform.hitTest(new Vec2(touch.clientX * screen.devicePixelRatio,
            screen.windowSize.height - touch.clientY * screen.devicePixelRatio));
    const start = (event: any) => {
        touchId = null;
        if (!enabled() || event?.touches?.length > 1) return;
        const touch = event?.changedTouches?.[0];
        if (Number.isFinite(touch?.identifier) && hit(touch)) touchId = touch.identifier;
    };
    const end = (event: any) => {
        const touch = event?.changedTouches?.find((item: any) => item.identifier === touchId);
        if (!touch) return;
        touchId = null;
        if (enabled() && hit(touch)) onTouch();
    };
    const cancel = () => { touchId = null; };
    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        touchId = null;
        tt.offTouchStart(start);
        tt.offTouchEnd(end);
        tt.offTouchCancel(cancel);
    };
    try {
        tt.onTouchStart(start);
        tt.onTouchEnd(end);
        tt.onTouchCancel(cancel);
    } catch (error) {
        cleanup();
        throw error;
    }
    return cleanup;
}

function requireChild(parent: Node, name: string): Node {
    const find = (root: Node): Node | null => {
        const direct = root.getChildByName(name);
        if (direct) return direct;
        for (const child of root.children) { const found = find(child); if (found) return found; }
        return null;
    };
    const result = find(parent);
    if (!result) throw new Error(`[douyin-desktop] missing prefab node: ${name}`);
    return result;
}

function requireLabel(parent: Node, name: string): Label {
    const label = requireChild(parent, name).getComponent(Label);
    if (!label) throw new Error(`[douyin-desktop] missing prefab Label: ${name}`);
    return label;
}

export function installDouyinDesktopModule(target: any): void {
    Object.assign(target, {
        drawDesktopEntry(parent: Node): void {
            const bind = (entry: Node) => {
                entry.active = true;
                const button = entry.getComponent(Button);
                if (!button) throw new Error('[douyin-desktop] entry prefab missing Button');
                entry.targetOff(this);
                entry.on(Button.EventType.CLICK, () => {
                    AudioMgr.inst.play('button');
                    this.openDouyinDesktopGuide();
                }, this);
            };
            const existing = parent.getChildByName(ENTRY_NAME);
            if (existing?.isValid) { bind(existing); return; }
            if (this._douyinDesktopEntryLoadingParent === parent) return;
            this._douyinDesktopEntryLoadingParent = parent;
            const finish = () => {
                if (this._douyinDesktopEntryLoadingParent === parent) this._douyinDesktopEntryLoadingParent = null;
            };
            assetManager.loadBundle(HOME_ASSETS_BUNDLE_NAME, (bundleError: Error | null, bundle: Bundle | null) => {
                if (bundleError || !bundle) {
                    finish();
                    throw new Error(`[douyin-desktop] entry bundle unavailable: ${bundleError?.message || 'missing bundle'}`);
                }
                bundle.load(ENTRY_PATH, Prefab, (error: Error | null, prefab: Prefab | null) => {
                    finish();
                    if (error || !prefab) throw new Error(`[douyin-desktop] entry prefab unavailable: ${error?.message || ENTRY_PATH}`);
                    if (!parent.isValid || !this.mainMenuNode?.isValid || parent.getChildByName(ENTRY_NAME)?.isValid) return;
                    const entry = instantiate(prefab);
                    parent.addChild(entry);
                    bind(entry);
                });
            });
        },

        hasClaimedDouyinDesktopReward(): boolean {
            return sys.localStorage.getItem(CLAIMED_KEY) === '1';
        },

        recoverDouyinDesktopReward(): void {
            if (this.hasClaimedDouyinDesktopReward()) return;
            const raw = sys.localStorage.getItem(RECEIPT_KEY);
            if (!raw) return;
            const receipt = JSON.parse(raw) as DesktopReceipt;
            if (!receipt.committing) return;
            desktopReceipt(this); // Validate persisted recovery data before writing inventory.
            const key = this.getPropStorageKey(receipt.prop);
            // Inventory reads recover this journal first, so it cannot be spent before the marker is saved.
            sys.localStorage.setItem(key, String(receipt.after));
            sys.localStorage.setItem(CLAIMED_KEY, '1');
            this.queueCloudGameStateSync();
        },

        openDouyinDesktopGuide(): void {
            if (this._douyinDesktopGuideOverlay?.isValid || this._douyinDesktopGuideLoading) return;
            this._douyinDesktopGuideLoading = true;
            const reset = () => {
                this._douyinDesktopGuideTouchCleanup?.();
                this._douyinDesktopGuideTouchCleanup = null;
                this._douyinDesktopGuideLoading = false;
                this._douyinDesktopGuideOverlay = null;
                this._douyinDesktopRefresh = null;
            };
            openCollectionShellOverlay(this, {
                overlayName: 'DouyinDesktopGuideOverlay', prefabPath: GUIDE_PATH,
                title: '添加桌面', siblingIndex: 1001, requireActionNodes: false,
                onClose: reset, onError: reset,
                onReady: ({ overlay, box }) => {
                    this._douyinDesktopGuideLoading = false;
                    this._douyinDesktopGuideOverlay = overlay;
                    const enter = requireChild(box, 'EnterBtn');
                    const label = requireLabel(enter, 'EnterLabel');
                    const alive = () => overlay.isValid && overlay.activeInHierarchy && this._douyinDesktopGuideOverlay === overlay;
                    const render = (text: string, enabled: boolean) => {
                        if (!alive()) return;
                        label.string = text;
                        const button = enter.getComponent(Button);
                        if (button) button.interactable = enabled;
                    };
                    const complete = () => render('已完成', false);
                    const tt = getDouyinMiniGameRuntime();
                    // A persisted attempt reopened in a new runtime means the player returned/restarted.
                    let ready = sys.localStorage.getItem(ATTEMPT_KEY) === 'ready'
                        || (!!sys.localStorage.getItem(ATTEMPT_KEY) && !this._douyinDesktopAdding);
                    const refresh = () => {
                        if (this.hasClaimedDouyinDesktopReward()) complete();
                        else render(ready ? '领取奖励' : this._douyinDesktopAdding ? '添加中' : '添加桌面', !this._douyinDesktopAdding);
                    };
                    this._douyinDesktopRefresh = () => {
                        ready = sys.localStorage.getItem(ATTEMPT_KEY) === 'ready';
                        refresh();
                    };
                    const claim = async () => {
                        if (!alive() || this._douyinDesktopClaiming) return;
                        if (this.hasClaimedDouyinDesktopReward()) { complete(); return; }
                        AudioMgr.inst.play('button');
                        this._douyinDesktopClaiming = true;
                        render('领取中', false);
                        try {
                            const receipt = desktopReceipt(this);
                            await showDouyinDesktopReward(this, overlay, receipt.prop, alive, () => {
                                if (this.hasClaimedDouyinDesktopReward()) return;
                                if (!receipt.committing) {
                                    const before = this.getPropCount(receipt.prop);
                                    if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(before + 1)) throw Error('Invalid desktop reward inventory');
                                    sys.localStorage.setItem(RECEIPT_KEY, JSON.stringify({ ...receipt, before, after: before + 1, committing: true }));
                                }
                                this.recoverDouyinDesktopReward();
                                complete();
                            });
                        } catch (error) {
                            runtimeWarn('[douyin-desktop] reward claim failed:', error);
                            render('重试', true);
                        } finally {
                            this._douyinDesktopClaiming = false;
                        }
                    };
                    const add = (nativeGesture: boolean) => {
                        if (!alive() || this._douyinDesktopAdding) return;
                        if (!nativeGesture || typeof tt?.addShortcut !== 'function') {
                            runtimeWarn('[douyin-desktop] addShortcut unavailable for this touch/runtime');
                            render('暂不支持', false);
                            return;
                        }
                        try {
                            const appName = tt.getSystemInfoSync?.()?.appName;
                            if (appName && !['Douyin', 'douyin_lite', 'aweme_hotsoon'].includes(appName)) {
                                runtimeWarn('[douyin-desktop] addShortcut unsupported host:', appName);
                                render('暂不支持', false);
                                return;
                            }
                            AudioMgr.inst.play('button');
                            sys.localStorage.setItem(ATTEMPT_KEY, 'started');
                            this._douyinDesktopAdding = true;
                            render('添加中', false);
                            let hidden = false;
                            const cleanup = () => {
                                tt.offHide?.(hide); tt.offShow?.(show);
                                this._douyinDesktopReturnCleanup = null;
                            };
                            const finish = () => {
                                try {
                                    sys.localStorage.setItem(ATTEMPT_KEY, 'ready');
                                    this._douyinDesktopAdding = false;
                                    cleanup();
                                    this._douyinDesktopRefresh?.();
                                } catch (error) {
                                    runtimeWarn('[douyin-desktop] return state save failed:', error);
                                    this._douyinDesktopAdding = false;
                                    cleanup();
                                    ready = true;
                                    render('重试', true);
                                }
                            };
                            const hide = () => { hidden = true; };
                            const show = () => { if (hidden) finish(); };
                            this._douyinDesktopReturnCleanup?.();
                            this._douyinDesktopReturnCleanup = cleanup;
                            tt.onHide?.(hide); tt.onShow?.(show);
                            this.node?.once(Node.EventType.NODE_DESTROYED, cleanup);
                            tt.addShortcut({
                                success: () => { if (!hidden) finish(); },
                                fail: (error: any) => {
                                    if (Number(error?.errNo) !== 21305) {
                                        runtimeWarn('[douyin-desktop] addShortcut failed:', error);
                                    }
                                    // Cancellation still qualifies, per the approved no-add-verification rule.
                                    if (!hidden) finish();
                                },
                            });
                        } catch (error) {
                            runtimeWarn('[douyin-desktop] addShortcut failed:', error);
                            this._douyinDesktopReturnCleanup?.();
                            this._douyinDesktopAdding = false;
                            render('重试', true);
                        }
                    };
                    if (this.hasClaimedDouyinDesktopReward()) { complete(); return; }
                    const action = (native: boolean) => { if (ready) void claim(); else add(native); };
                    // Keep the normal Button for its visuals; native touch owns real device clicks.
                    this.bindPanelButton(enter, () => {});
                    this._douyinDesktopGuideTouchCleanup = bindDouyinDesktopGuideTouch(
                        tt, enter, alive, () => action(true));
                    if (!this._douyinDesktopGuideTouchCleanup) this.bindPanelButton(enter, () => action(false));
                    else overlay.once(Node.EventType.NODE_DESTROYED, this._douyinDesktopGuideTouchCleanup);
                    refresh();
                },
            });
        },
    });
}
