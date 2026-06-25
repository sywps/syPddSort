import {
    assetManager,
    AudioMgr,
    Button,
    HOME_ASSETS_BUNDLE_NAME,
    instantiate,
    Label,
    Node,
    Prefab,
    sys,
    UITransform,
} from '../../Core/GameCtrlShared';
import type { Bundle } from '../../Core/GameCtrlShared';
import { openCollectionShellOverlay } from '../../Core/Panels/CollectionShellOverlay';

const DOUYIN_SIDEBAR_BUTTON_NAME = 'DouyinSidebarTaskButton';
const DOUYIN_SIDEBAR_BUTTON_PREFAB_PATH = 'UI/Prefabs/Buttons/DouyinSidebarTaskButton';
const DOUYIN_SIDEBAR_BUTTON_LABEL_NAME = 'SidebarTaskLbl';
const DOUYIN_SIDEBAR_GUIDE_PREFAB_PATH = 'UI/Prefabs/Panels/GameCirclePanel';
const DOUYIN_SIDEBAR_REWARD_GOLD = 12;
const DOUYIN_SIDEBAR_REWARD_PENDING_DATE_KEY = 'pdd.douyin.sidebarReward.pendingDate';
const DOUYIN_SIDEBAR_REWARD_CLAIMED_DATE_KEY = 'pdd.douyin.sidebarReward.claimedDate';
const DOUYIN_SIDEBAR_BUTTON_TASK_LABEL = '\u4fa7\u680f\n\u4efb\u52a1';
const DOUYIN_SIDEBAR_BUTTON_CLAIM_LABEL = '\u9886\u53d6\n\u5956\u52b1';
const DOUYIN_SIDEBAR_BUTTON_CLAIMED_LABEL = '\u5df2\n\u9886\u53d6';
const DOUYIN_SIDEBAR_GUIDE_COPY = `\u6bcf\u65e5\u4ece\u6296\u97f3\u9996\u9875\u4fa7\u8fb9\u680f\u56de\u5230\u6e38\u620f\uff0c\u5373\u53ef\u9886\u53d6 ${DOUYIN_SIDEBAR_REWARD_GOLD} \u91d1\u5e01\u3002\n\n1. \u70b9\u51fb\u4e0b\u65b9\u6309\u94ae\uff0c\u524d\u5f80\u6296\u97f3\u9996\u9875\u4fa7\u8fb9\u680f\u3002\n2. \u5728\u4fa7\u8fb9\u680f\u70b9\u51fb\u300a\u8f7b\u677e\u62fc\u8c46\u300b\u8fd4\u56de\u6e38\u620f\u3002\n3. \u56de\u5230\u4e3b\u9875\u540e\uff0c\u518d\u70b9\u672c\u5165\u53e3\u9886\u5956\u3002`;

declare const tt: any;

function logSidebar(step: string, data: Record<string, unknown> = {}): void {
    console.log(`[douyin-sidebar] ${step}`, data);
}

function getGlobalScope(): any {
    return typeof globalThis !== 'undefined' ? globalThis as any : null;
}

function getWindowScope(): any {
    return typeof window !== 'undefined' ? window as any : null;
}

function getDirectDouyinApi(): any {
    try {
        return typeof tt !== 'undefined' ? tt : null;
    } catch (_) {
        return null;
    }
}

function getDouyinApi(): any {
    const globalScope = getGlobalScope();
    const windowScope = getWindowScope();
    return globalScope?.tt || windowScope?.tt || getDirectDouyinApi() || null;
}

function getLocalDateKey(date: Date = new Date()): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
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

function setPrefabLabel(parent: Node, name: string, value: string): void {
    const label = requireDeepChild(parent, name).getComponent(Label);
    if (!label) throw new Error(`[douyin-sidebar] guide prefab missing Label: ${name}`);
    label.string = value;
}

function setSidebarButtonLabel(btn: Node, value: string): void {
    const label = requireDeepChild(btn, DOUYIN_SIDEBAR_BUTTON_LABEL_NAME).getComponent(Label);
    if (!label) throw new Error(`[douyin-sidebar] button prefab missing Label: ${DOUYIN_SIDEBAR_BUTTON_LABEL_NAME}`);
    label.string = value;
}

function configureDouyinSidebarGuideContent(box: Node): void {
    const icon = findChildDeep(box, 'GameCircleIcon');
    if (icon?.isValid) {
        icon.active = false;
    }

    const copyNode = requireDeepChild(box, 'GiftCopyLabel');
    const copyTransform = copyNode.getComponent(UITransform);
    const copyLabel = copyNode.getComponent(Label);
    if (!copyTransform || !copyLabel) {
        throw new Error('[douyin-sidebar] guide prefab missing GiftCopyLabel UI components');
    }

    // Code-owned variant: this Douyin guide reuses GameCirclePanel but displays text only.
    copyNode.setPosition(0, 10, 0);
    copyTransform.setContentSize(390, 245);
    copyLabel.string = DOUYIN_SIDEBAR_GUIDE_COPY;
    copyLabel.fontSize = 20;
    copyLabel.lineHeight = 28;
    copyLabel.enableWrapText = true;
    copyLabel.overflow = Label.Overflow.CLAMP;
    copyLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    copyLabel.verticalAlign = Label.VerticalAlign.CENTER;
}

export function shouldInstallDouyinSidebarModule(): boolean {
    const tt = getDouyinApi();
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

            const tt = getDouyinApi();
            if (!parent.isValid || !this.mainMenuNode?.isValid) {
                logSidebar('draw-entry-skip-invalid-parent', {
                    parentValid: parent.isValid,
                    mainMenuValid: !!this.mainMenuNode?.isValid,
                });
                return;
            }
            logSidebar('draw-entry-show', { hasTt: !!tt });
            this.showDouyinSidebarButton(parent);
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

            logSidebar('load-button-bundle-start', { bundleName: HOME_ASSETS_BUNDLE_NAME });
            assetManager.loadBundle(HOME_ASSETS_BUNDLE_NAME, (bundleErr: Error | null, bundle: Bundle | null) => {
                if (bundleErr || !bundle) {
                    logSidebar('load-button-bundle-failed', { error: bundleErr?.message || 'bundle missing' });
                    throw new Error(`[douyin-sidebar] loadBundle ${HOME_ASSETS_BUNDLE_NAME} failed: ${bundleErr?.message || 'bundle missing'}`);
                }
                logSidebar('load-button-prefab-start', { prefabPath: DOUYIN_SIDEBAR_BUTTON_PREFAB_PATH });
                bundle.load(DOUYIN_SIDEBAR_BUTTON_PREFAB_PATH, Prefab, (prefabErr: Error | null, prefab: Prefab | null) => {
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
                    const btn = instantiate(prefab);
                    btn.name = DOUYIN_SIDEBAR_BUTTON_NAME;
                    parent.addChild(btn);
                    btn.active = true;
                    this.syncDouyinSidebarButtonState(btn);
                    this.bindDouyinSidebarButton(btn);
                    this.startHomeSceneScalePulse?.(btn, 1.08, 0.6);
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
                if (this.tryClaimDouyinSidebarReward('home_entry')) return;
                this.openDouyinSidebarGuide();
            }, this);
        },

        hasClaimedDouyinSidebarRewardToday(): boolean {
            return sys.localStorage.getItem(DOUYIN_SIDEBAR_REWARD_CLAIMED_DATE_KEY) === getLocalDateKey();
        },

        hasPendingDouyinSidebarRewardToday(): boolean {
            return sys.localStorage.getItem(DOUYIN_SIDEBAR_REWARD_PENDING_DATE_KEY) === getLocalDateKey();
        },

        syncDouyinSidebarButtonState(btn?: Node | null): void {
            const target = btn?.isValid ? btn : this._douyinSidebarTaskButton;
            if (!target?.isValid) return;
            const label = this.hasClaimedDouyinSidebarRewardToday()
                ? DOUYIN_SIDEBAR_BUTTON_CLAIMED_LABEL
                : this.hasPendingDouyinSidebarRewardToday()
                    ? DOUYIN_SIDEBAR_BUTTON_CLAIM_LABEL
                    : DOUYIN_SIDEBAR_BUTTON_TASK_LABEL;
            setSidebarButtonLabel(target, label);
            logSidebar('button-label-sync', { label: label.replace('\n', '/') });
        },

        markDouyinSidebarRewardPending(): void {
            if (this.hasClaimedDouyinSidebarRewardToday()) return;
            sys.localStorage.setItem(DOUYIN_SIDEBAR_REWARD_PENDING_DATE_KEY, getLocalDateKey());
            this.syncDouyinSidebarButtonState();
            logSidebar('reward-pending', { rewardGold: DOUYIN_SIDEBAR_REWARD_GOLD });
        },

        clearDouyinSidebarRewardPending(): void {
            sys.localStorage.removeItem(DOUYIN_SIDEBAR_REWARD_PENDING_DATE_KEY);
            this.syncDouyinSidebarButtonState();
        },

        tryClaimDouyinSidebarReward(source: string = 'unknown'): boolean {
            if (this.hasClaimedDouyinSidebarRewardToday()) {
                this.syncDouyinSidebarButtonState();
                this.showToast?.('\u4eca\u5929\u7684\u4fa7\u680f\u5956\u52b1\u5df2\u7ecf\u9886\u8fc7\u5566', 1.6);
                logSidebar('reward-already-claimed', { source });
                return true;
            }
            if (!this.hasPendingDouyinSidebarRewardToday()) {
                return false;
            }
            if (typeof this.addGold !== 'function') {
                throw new Error('[douyin-sidebar] runtime missing addGold() for reward claim');
            }
            this.addGold(DOUYIN_SIDEBAR_REWARD_GOLD);
            sys.localStorage.setItem(DOUYIN_SIDEBAR_REWARD_CLAIMED_DATE_KEY, getLocalDateKey());
            this.clearDouyinSidebarRewardPending();
            this.refreshGoldUI?.();
            this.showToast?.(`\u4fa7\u680f\u4efb\u52a1\u5b8c\u6210\uff0c\u83b7\u5f97${DOUYIN_SIDEBAR_REWARD_GOLD}\u91d1\u5e01`, 2);
            logSidebar('reward-claimed', {
                source,
                rewardGold: DOUYIN_SIDEBAR_REWARD_GOLD,
                nextGold: typeof this.getGold === 'function' ? this.getGold() : null,
            });
            return true;
        },

        openDouyinSidebarGuide() {
            if (this._douyinSidebarGuideOverlay?.isValid) return;
            this._douyinSidebarGuideOverlay = null;
            openCollectionShellOverlay(this, {
                overlayName: 'DouyinSidebarGuideOverlay',
                prefabPath: DOUYIN_SIDEBAR_GUIDE_PREFAB_PATH,
                title: '\u4fa7\u680f\u590d\u8bbf\u4efb\u52a1',
                siblingIndex: 1001,
                requireActionNodes: false,
                onClose: () => {
                    this._douyinSidebarGuideOverlay = null;
                },
                onError: () => {
                    this._douyinSidebarGuideOverlay = null;
                },
                onReady: ({ overlay, box, close }) => {
                    this._douyinSidebarGuideOverlay = overlay;
                    configureDouyinSidebarGuideContent(box);
                    setPrefabLabel(box, 'EnterLabel', '\u53bb\u4fa7\u680f\u9886\u5956');
                    const enterBtn = requireDeepChild(box, 'EnterBtn');
                    this.bindPanelButton(enterBtn, () => {
                        AudioMgr.inst.play('button');
                        this.openDouyinSidebarScene();
                        close();
                    });
                },
            });
        },
        openDouyinSidebarScene() {
            const tt = getDouyinApi();
            if (!tt || typeof tt.navigateToScene !== 'function') {
                console.warn('[douyin-sidebar] tt.navigateToScene unavailable');
                this.showToast?.('\u8bf7\u5728\u6296\u97f3\u4e2d\u6253\u5f00\u4fa7\u680f\u4efb\u52a1', 1.8);
                return;
            }
            if (this.hasClaimedDouyinSidebarRewardToday()) {
                this.showToast?.('\u4eca\u5929\u7684\u4fa7\u680f\u5956\u52b1\u5df2\u7ecf\u9886\u8fc7\u5566', 1.6);
                return;
            }
            this.markDouyinSidebarRewardPending();
            tt.navigateToScene({
                scene: 'sidebar',
                success: () => {
                    logSidebar('navigate-sidebar-success', { rewardGold: DOUYIN_SIDEBAR_REWARD_GOLD });
                },
                fail: (err: any) => {
                    this.clearDouyinSidebarRewardPending();
                    console.warn('[douyin-sidebar] navigateToScene failed:', err);
                    this.showToast?.('\u4fa7\u680f\u6253\u5f00\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', 1.8);
                },
            });
        },
    });
}
