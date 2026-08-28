import {
    AudioMgr,
    BlockInputEvents,
    Button,
    Bundle,
    DAILY_SIGNIN_TEXTURE_NAMES,
    ECONOMY_NUMERIC_TABLE,
    EventTouch,
    FREEZE_PROP_SECONDS,
    Label,
    Node,
    Prefab,
    RESOURCE_ACQUIRE_TEXTURE_NAMES,
    Tween,
    UITransform,
    Vec3,
    instantiate,
    tween,
} from '../GameCtrlShared';
import type { DailySignInReward, InventoryPropKind } from '../GameCtrlShared';

type ToolAcquireKind = Exclude<InventoryPropKind, 'expand'>;
type ResourceAcquireVariant = ToolAcquireKind | 'gold';

type ResourceAcquireOptions = {
    variant: ResourceAcquireVariant;
    panelKey: string;
    overlayName: string;
    adType: string;
    successToast: string | (() => string);
    grantFailToast: string;
    onAdGrant: () => boolean | void | Promise<boolean | void>;
    buyLabel?: string;
    goldAmountText?: string;
    onBuy?: () => boolean;
    resumeTimerOnClose?: boolean;
    timerPauseToken?: string;
    onInventoryChanged?: () => void;
};

const ACQUIRE_RESOURCE_PANEL_PREFAB_PATH = 'UI/Prefabs/Panels/AcquireResourcePanel';
const RESOURCE_ACQUIRE_PREFAB_LOAD_TIMEOUT_MS = 8000;

function syncPrefabPopupTitle(box: Node, title: string): void {
    const badge = box.getChildByName('PopupTitleBadge');
    const titleNode = badge?.getChildByName('PopupTitleLabel');
    const label = titleNode?.getComponent(Label);
    if (!badge || !titleNode || !label) {
        throw new Error('[popup-prefab] missing prefab title nodes');
    }
    badge.active = true;
    titleNode.active = true;
    label.string = title;
}

function syncRequiredPrefabLabel(parent: Node, childName: string, text: string, errorPrefix: string): Label {
    const labelNode = parent.getChildByName(childName);
    const label = labelNode?.getComponent(Label);
    if (!labelNode || !label) {
        throw new Error(`${errorPrefix} missing Label component on ${parent.name}/${childName}`);
    }
    labelNode.active = true;
    label.string = text;
    label.enableWrapText = false;
    return label;
}

export class CommercePanelController {
    constructor(private readonly runtime: any) {}

    private bindAcquireButton(triggerNode: Node, handler: () => void): void {
        this.runtime.bindPanelButton(triggerNode, handler);
    }

    preloadAcquireResourcePanel(): void {
        const runtime = this.runtime;
        if (runtime._acquireResourcePanelPrefabPreloading) return;
        runtime._acquireResourcePanelPrefabPreloading = true;
        runtime._withGameAssetsBundle((bundle: Bundle | null) => {
            runtime._acquireResourcePanelPrefabPreloading = false;
            if (!bundle) return;
            bundle.load(ACQUIRE_RESOURCE_PANEL_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                if (!err && prefab) {
                    runtime._acquireResourcePanelPrefab = prefab;
                }
            });
        });
    }

    private setAcquireVariantActive(parent: Node, activeName: string, names: string[]): void {
        for (const name of names) {
            const node = this.runtime.requirePanelChild(parent, name);
            node.active = name === activeName;
        }
    }

    private setAcquireLabelText(parent: Node, childName: string, text: string): Label {
        const label = syncRequiredPrefabLabel(parent, childName, text, '[resource-acquire-prefab]');
        label.enableWrapText = false;
        return label;
    }

    private setAcquireInsufficientGoldTipActive(box: Node, active: boolean): void {
        const tip = this.runtime.requirePanelChild(box, 'AcquireInsufficientGoldTip');
        tip.active = active;
    }

    private syncAcquireVariant(box: Node, options: ResourceAcquireOptions): void {
        const runtime = this.runtime;
        const titleBadge = runtime.requirePanelChild(box, 'PopupTitleBadge');
        const titleByVariant: Record<ResourceAcquireVariant, string> = {
            gold: 'TitleGold',
            wand: 'TitleWand',
            freeze: 'TitleFreeze',
            brush: 'TitleBrush',
            magnet: 'TitleMagnet',
        };
        const iconByVariant: Record<ResourceAcquireVariant, string> = {
            gold: 'IconGold',
            wand: 'IconWand',
            freeze: 'IconFreeze',
            brush: 'IconBrush',
            magnet: 'IconMagnet',
        };
        const textByVariant: Record<ResourceAcquireVariant, string> = {
            gold: 'GoldAmountLabel',
            wand: 'TextWand',
            freeze: 'TextFreeze',
            brush: 'TextBrush',
            magnet: 'TextMagnet',
        };
        this.setAcquireVariantActive(titleBadge, titleByVariant[options.variant], ['TitleGold', 'TitleWand', 'TitleFreeze', 'TitleBrush', 'TitleMagnet']);
        this.setAcquireVariantActive(box, iconByVariant[options.variant], ['IconGold', 'IconWand', 'IconFreeze', 'IconBrush', 'IconMagnet']);
        this.setAcquireVariantActive(box, textByVariant[options.variant], ['GoldAmountLabel', 'TextWand', 'TextFreeze', 'TextBrush', 'TextMagnet']);

        const goldDesc = runtime.requirePanelChild(box, 'GoldDesc');
        const toolBuyBtn = runtime.requirePanelChild(box, 'AcquireBuyBtn');
        const toolAdBtn = runtime.requirePanelChild(box, 'AcquireAdBtn');
        const goldAdBtn = runtime.requirePanelChild(box, 'AcquireGoldAdBtn');
        const cancelBtn = runtime.requirePanelChild(box, 'AcquireCancelBtn');
        const isGold = options.variant === 'gold';
        goldDesc.active = isGold;
        toolBuyBtn.active = !isGold;
        toolAdBtn.active = !isGold;
        goldAdBtn.active = isGold;
        cancelBtn.active = false;
        this.setAcquireInsufficientGoldTipActive(box, false);

        if (isGold) {
            this.setAcquireLabelText(box, 'GoldAmountLabel', options.goldAmountText || '');
            return;
        }
        if (!options.buyLabel) {
            throw new Error('[resource-acquire-prefab] tool acquire panel requires buyLabel');
        }
        this.setAcquireLabelText(toolBuyBtn, 'AcquireBuyLbl', options.buyLabel);
    }

    private openResourceAcquirePanel(options: ResourceAcquireOptions): boolean {
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        const isAlreadyOpen = () => !!popupRoot.getChildByName(options.overlayName);
        if (RESOURCE_ACQUIRE_TEXTURE_NAMES.some((name: string) => !runtime.getSF(name))) {
            return runtime._openPanelAfterTextures(
                options.panelKey,
                RESOURCE_ACQUIRE_TEXTURE_NAMES,
                isAlreadyOpen,
                () => {
                    if (this.openResourceAcquirePanel(options)) return;
                    if (options.resumeTimerOnClose) {
                        runtime.resumeTimerForProp?.(options.timerPauseToken || 'resource-acquire');
                    }
                },
                (error: Error) => {
                    if (options.resumeTimerOnClose) {
                        runtime.resumeTimerForProp?.(options.timerPauseToken || 'resource-acquire');
                    }
                    runtime.showToast?.('资源加载失败，请重试');
                    console.error('[resource-acquire] texture preparation failed:', error);
                },
            );
        }
        if (isAlreadyOpen()) return false;
        const prefabLoadKey = `${options.panelKey}-prefab`;
        if (runtime._panelOpenInFlight.has(prefabLoadKey)) return false;
        runtime._panelOpenInFlight.add(prefabLoadKey);
        let modalFocusActive = false;
        let modalFocusToken = '';
        let timerPauseActive = !!options.resumeTimerOnClose;
        let textureOwnerActive = false;
        let openAttemptFinished = false;
        let prefabLoadTimeout: any = null;

        try {
            runtime._retainPanelTextureOwner(options.panelKey, RESOURCE_ACQUIRE_TEXTURE_NAMES);
            textureOwnerActive = true;
        } catch (error) {
            runtime._panelOpenInFlight.delete(prefabLoadKey);
            if (timerPauseActive) {
                timerPauseActive = false;
                try {
                    runtime.resumeTimerForProp?.(options.timerPauseToken || 'resource-acquire');
                } catch (timerError) {
                    console.error('[resource-acquire] timer rollback failed:', timerError);
                }
            }
            console.error('[resource-acquire] texture owner acquisition failed:', error);
            return false;
        }

        const clearPrefabLoadTimeout = () => {
            if (!prefabLoadTimeout) return;
            clearTimeout(prefabLoadTimeout);
            prefabLoadTimeout = null;
        };

        const finishOpenAttempt = (): boolean => {
            if (openAttemptFinished) return false;
            openAttemptFinished = true;
            clearPrefabLoadTimeout();
            runtime._panelOpenInFlight.delete(prefabLoadKey);
            return true;
        };

        const resumeAcquireTimer = () => {
            if (!timerPauseActive) return;
            timerPauseActive = false;
            try {
                runtime.resumeTimerForProp?.(options.timerPauseToken || 'resource-acquire');
            } catch (error) {
                console.error('[resource-acquire] timer release failed:', error);
            }
        };

        const releaseTextureOwnerNow = (reason: string) => {
            if (!textureOwnerActive) return;
            textureOwnerActive = false;
            try {
                runtime._releasePanelTextureOwner(options.panelKey, reason);
            } catch (error) {
                console.error(`[resource-acquire] texture owner release failed: ${reason}`, error);
            }
        };

        const beginAcquireModalFocus = () => {
            if (modalFocusActive) return;
            modalFocusActive = true;
            modalFocusToken = runtime.beginModalFocus?.('resource-acquire') || '';
        };

        const endAcquireModalFocus = () => {
            if (!modalFocusActive) return;
            modalFocusActive = false;
            try {
                runtime.endModalFocus?.(modalFocusToken || 'resource-acquire');
            } catch (error) {
                console.error('[resource-acquire] modal release failed:', error);
            }
            modalFocusToken = '';
        };

        const isRuntimeAlive = () => !!(runtime._isRuntimeAliveForAsyncCallback?.() ?? runtime.isValid);
        const isOpenTargetAlive = () => isRuntimeAlive() && !!popupRoot?.isValid;
        const cancelStaleOpen = () => {
            if (!finishOpenAttempt()) return;
            endAcquireModalFocus();
            resumeAcquireTimer();
            releaseTextureOwnerNow('resource-acquire-open-stale');
        };

        const failOpen = (message: string, overlay?: Node | null) => {
            if (!finishOpenAttempt()) return;
            if (overlay?.isValid) {
                overlay.active = false;
                const blocker = overlay.getComponent(BlockInputEvents);
                if (blocker) blocker.enabled = false;
            }
            endAcquireModalFocus();
            resumeAcquireTimer();
            if (overlay?.isValid) {
                try {
                    runtime._closePanelWithTextureOwner(overlay, options.panelKey, 'resource-acquire-open-failed');
                    textureOwnerActive = false;
                } catch (error) {
                    console.error('[resource-acquire] failed-open teardown failed:', error);
                    releaseTextureOwnerNow('resource-acquire-open-failed-fallback');
                }
            } else {
                releaseTextureOwnerNow('resource-acquire-open-failed');
            }
            console.error(message);
        };

        prefabLoadTimeout = setTimeout(() => {
            failOpen(`[resource-acquire-prefab] load timed out after ${RESOURCE_ACQUIRE_PREFAB_LOAD_TIMEOUT_MS}ms`);
        }, RESOURCE_ACQUIRE_PREFAB_LOAD_TIMEOUT_MS);

        const loadAcquirePrefab = () => runtime._withGameAssetsBundle((bundle: Bundle | null) => {
            if (openAttemptFinished) return;
            if (!isOpenTargetAlive()) {
                cancelStaleOpen();
                return;
            }
            if (!bundle) { failOpen('[resource-acquire-prefab] gameAssets bundle unavailable'); return; }
            try {
                bundle.load(ACQUIRE_RESOURCE_PANEL_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                if (openAttemptFinished) return;
                if (!isOpenTargetAlive()) {
                    cancelStaleOpen();
                    return;
                }
                if (err || !prefab) { failOpen(`[resource-acquire-prefab] load failed: ${err?.message || 'prefab missing'}`); return; }
                let overlay: Node | null = null;
                let closed = false;
                let stopAdSpinner: () => void = () => {};
                const closePanel = (resumeTimer = !!options.resumeTimerOnClose, playSound = true) => {
                    if (closed) return;
                    closed = true;
                    if (overlay?.isValid) {
                        overlay.active = false;
                        const blocker = overlay.getComponent(BlockInputEvents);
                        if (blocker) blocker.enabled = false;
                    }
                    endAcquireModalFocus();
                    if (resumeTimer) resumeAcquireTimer();
                    try {
                        stopAdSpinner();
                    } catch (error) {
                        console.warn('[resource-acquire] spinner cleanup failed:', error);
                    }
                    if (playSound) {
                        try {
                            AudioMgr.inst.play('button');
                        } catch (error) {
                            console.warn('[resource-acquire] close sound failed:', error);
                        }
                    }
                    if (overlay?.isValid) {
                        try {
                            runtime._closePanelWithTextureOwner(overlay, options.panelKey, 'resource-acquire');
                            textureOwnerActive = false;
                        } catch (error) {
                            console.error('[resource-acquire] close teardown failed:', error);
                            releaseTextureOwnerNow('resource-acquire-close-fallback');
                        }
                    } else {
                        releaseTextureOwnerNow('resource-acquire-close');
                    }
                };

                try {
                    overlay = instantiate(prefab);
                    overlay.name = options.overlayName;
                    popupRoot.addChild(overlay);
                    overlay.setSiblingIndex(999);
                    if (!overlay.getComponent(BlockInputEvents)) overlay.addComponent(BlockInputEvents);
                    beginAcquireModalFocus();

                    const box = runtime.requirePanelChild(overlay, 'Box');
                    this.syncAcquireVariant(box, options);
                    if (!box.getComponent(BlockInputEvents)) box.addComponent(BlockInputEvents);
                    const panelTransaction = () => {
                        const transaction = runtime._rewardedGrantTransaction;
                        return transaction?.page === options.adType ? transaction : null;
                    };
                    const requestPanelClose = () => {
                        const transaction = panelTransaction();
                        if (transaction?.phase === 'recoverable') {
                            runtime.showToast?.('奖励确认中，请稍后');
                            return;
                        }
                        if (transaction?.phase === 'grant') {
                            runtime.cancelRewardedGrantInteraction?.('resource-acquire-grant-cancel');
                            closePanel();
                            return;
                        }
                        if (transaction) {
                            runtime.cancelRewardedGrantInteraction?.('resource-acquire-close');
                        }
                        closePanel();
                    };
                    overlay.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                        const boxUT = box.getComponent(UITransform);
                        if (!boxUT) return;
                        const uiPos = e.getUILocation();
                        const local = boxUT.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
                        const size = boxUT.contentSize;
                        if (Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2) {
                            e.propagationStopped = true;
                            return;
                        }
                        requestPanelClose();
                    }, runtime);

                    runtime.bindPanelButton(runtime.requirePanelChild(box, 'XBtn'), requestPanelClose);

                    const buyBtn = runtime.requirePanelChild(box, 'AcquireBuyBtn');
                    const adBtn = runtime.requirePanelChild(box, 'AcquireAdBtn');
                    const goldAdBtn = runtime.requirePanelChild(box, 'AcquireGoldAdBtn');
                    const cancelBtn = runtime.requirePanelChild(box, 'AcquireCancelBtn');
                    const activeAdBtn = options.variant === 'gold' ? goldAdBtn : adBtn;
                    const activeAdLabelName = options.variant === 'gold' ? 'AcquireGoldAdLbl' : 'AcquireAdLbl';
                    const activeAdIconName = options.variant === 'gold' ? 'AcquireGoldAdIcon' : 'AcquireAdIcon';
                    const activeAdIcon = runtime.requirePanelChild(activeAdBtn, activeAdIconName);
                    const activeAdButton = activeAdBtn.getComponent(Button) || activeAdBtn.addComponent(Button);
                    const buyButton = buyBtn.getComponent(Button) || buyBtn.addComponent(Button);
                    let adGrantSucceeded = false;
                    let adFailureLabel = '看广告领取';

                    const setAdSpinnerActive = (active: boolean) => {
                        Tween.stopAllByTarget(activeAdIcon);
                        activeAdIcon.angle = 0;
                        if (active) {
                            tween(activeAdIcon)
                                .by(0.8, { angle: -360 })
                                .repeatForever()
                                .start();
                        }
                    };
                    stopAdSpinner = () => setAdSpinnerActive(false);
                    const setCancelAction = (active: boolean, text: string = '') => {
                        cancelBtn.active = active;
                        if (active) {
                            this.setAcquireLabelText(cancelBtn, 'AcquireCancelLbl', text);
                        }
                    };
                    const setAdPanelState = (
                        text: string,
                        busy: boolean,
                        spinning: boolean,
                        cancelText: string = '',
                    ) => {
                        if (closed) return;
                        if (overlay?.isValid) overlay.active = true;
                        beginAcquireModalFocus();
                        this.setAcquireLabelText(activeAdBtn, activeAdLabelName, text);
                        activeAdButton.interactable = !busy;
                        buyButton.interactable = !busy;
                        setAdSpinnerActive(spinning);
                        setCancelAction(!!cancelText, cancelText);
                    };
                    const hidePanelForNativeAd = () => {
                        if (closed) return;
                        stopAdSpinner();
                        setCancelAction(false);
                        endAcquireModalFocus();
                        if (overlay?.isValid) overlay.active = false;
                    };
                    setAdPanelState('看广告领取', false, false);

                    if (options.onBuy && options.buyLabel) {
                        runtime.bindPanelButton(buyBtn, () => {
                            AudioMgr.inst.play('button');
                            this.setAcquireInsufficientGoldTipActive(box, false);
                            if (!options.onBuy?.()) {
                                this.setAcquireInsufficientGoldTipActive(box, true);
                                return;
                            }
                            options.onInventoryChanged?.();
                            closePanel(!!options.resumeTimerOnClose, false);
                        });
                    }

                    runtime.bindPanelButton(cancelBtn, () => {
                        const transaction = panelTransaction();
                        if (!transaction) {
                            setCancelAction(false);
                            return;
                        }
                        if (transaction.phase === 'recoverable') {
                            runtime.showToast?.('奖励确认中，请稍后');
                            return;
                        }
                        adFailureLabel = transaction.phase === 'recoverable_endable'
                            ? '重新加载广告'
                            : '看广告领取';
                        runtime.cancelRewardedGrantInteraction?.(
                            transaction.phase === 'recoverable_endable'
                                ? 'resource-acquire-end-wait'
                                : 'resource-acquire-cancel',
                        );
                        setAdPanelState(adFailureLabel, false, false);
                    });

                    this.bindAcquireButton(activeAdBtn, () => {
                        if (runtime._adShowing || panelTransaction()) return;
                        AudioMgr.inst.play('button');
                        adGrantSucceeded = false;
                        adFailureLabel = '看广告领取';
                        const started = runtime.runRewardedGrant(options.adType, () => {
                            return Promise.resolve(options.onAdGrant()).then((grantResult) => {
                                if (grantResult !== false) {
                                    adGrantSucceeded = true;
                                    options.onInventoryChanged?.();
                                }
                                return grantResult;
                            });
                        }, {
                            busyFlag: '_adShowing',
                            suppressPendingStrip: true,
                            successToast: options.successToast,
                            grantFailToast: options.grantFailToast,
                            onInteractionStarted: hidePanelForNativeAd,
                            onAdShown: hidePanelForNativeAd,
                            onRecoverable: () => {
                                setAdPanelState('正在确认结果…', true, true);
                            },
                            onRecoverableEndable: () => {
                                setAdPanelState('正在确认结果…', true, true, '结束等待');
                            },
                            onAdComplete: (success: boolean, outcome: any) => {
                                if (success) {
                                    adFailureLabel = '重新领取';
                                    return;
                                }
                                adFailureLabel = outcome?.status === 'verified_incomplete'
                                    ? '再看一次'
                                    : '重新加载广告';
                                setAdPanelState(adFailureLabel, false, false);
                            },
                            onAdFail: () => {
                                setAdPanelState(adFailureLabel, false, false);
                            },
                            onFinally: () => {
                                if (closed) return;
                                if (adGrantSucceeded) {
                                    closePanel(!!options.resumeTimerOnClose, false);
                                    return;
                                }
                                setAdPanelState(adFailureLabel, false, false);
                            },
                        });
                        if (!started) {
                            setAdPanelState('重新加载广告', false, false);
                        }
                    });

                    runtime.playPopupOpenAnim?.(overlay, box);
                    finishOpenAttempt();
                } catch (error: any) {
                    failOpen(error?.message || '[resource-acquire-prefab] build failed', overlay);
                }
                });
            } catch (error: any) {
                failOpen(error?.message || '[resource-acquire-prefab] bundle load threw');
            }
        });
        try {
            loadAcquirePrefab();
        } catch (error: any) {
            failOpen(error?.message || '[resource-acquire-prefab] load threw');
        }
        return true;
    }

    openGoldAcquirePanel(): boolean {
        const rewardedGold = ECONOMY_NUMERIC_TABLE.adReward.goldShopReward;
        return this.openResourceAcquirePanel({
            variant: 'gold',
            panelKey: 'gold-acquire',
            overlayName: 'GoldAcquireOverlay',
            goldAmountText: `金币 x${rewardedGold}`,
            adType: 'gold_acquire_reward',
            successToast: () => `已获得 ${rewardedGold} 金币`,
            grantFailToast: '金币领取失败，请重试',
            onAdGrant: () => {
                this.runtime.addGold(rewardedGold);
                this.runtime.refreshGoldUI?.();
            },
        });
    }

    private getToolAcquireMeta(kind: ToolAcquireKind): { itemLabel: string; cost: number; adType: string } {
        if (kind === 'wand') {
            return { itemLabel: '魔法棒', cost: ECONOMY_NUMERIC_TABLE.purchaseCost.magicWand, adType: 'skill_wand_acquire' };
        }
        if (kind === 'freeze') {
            return { itemLabel: '\u51bb\u7ed3', cost: ECONOMY_NUMERIC_TABLE.purchaseCost.freeze, adType: 'skill_freeze_acquire' };
        }
        if (kind === 'brush') {
            return { itemLabel: '刷子', cost: ECONOMY_NUMERIC_TABLE.purchaseCost.brush, adType: 'skill_brush_acquire' };
        }
        return { itemLabel: '磁铁', cost: ECONOMY_NUMERIC_TABLE.purchaseCost.magnet, adType: 'skill_magnet_acquire' };
    }

    openToolAcquirePanel(
        kind: ToolAcquireKind,
        options: {
            resumeTimerOnClose?: boolean;
            timerPauseToken?: string;
            onInventoryChanged?: () => void;
            onAdGrant?: () => boolean | void | Promise<boolean | void>;
        } = {},
    ): boolean {
        const meta = this.getToolAcquireMeta(kind);
        return this.openResourceAcquirePanel({
            variant: kind,
            panelKey: `tool-acquire-${kind}`,
            overlayName: `ToolAcquireOverlay_${kind}`,
            buyLabel: `${meta.cost}`,
            adType: meta.adType,
            successToast: '',
            grantFailToast: `${meta.itemLabel}领取失败，请重试`,
            resumeTimerOnClose: options.resumeTimerOnClose,
            timerPauseToken: options.timerPauseToken,
            onInventoryChanged: options.onInventoryChanged,
            onBuy: () => {
                if (!this.runtime.spendGold(meta.cost)) {
                    return false;
                }
                this.runtime.addPropCount(kind, 1);
                return true;
            },
            onAdGrant: () => {
                if (options.onAdGrant) {
                    return options.onAdGrant();
                }
                this.runtime.addPropCount(kind, 1);
            },
        });
    }

    openGoldShop(): boolean {
        return this.openGoldAcquirePanel();
    }

    openDailySignInPanel() {
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        if (DAILY_SIGNIN_TEXTURE_NAMES.some((name: string) => !runtime.getSF(name))) {
            runtime._openPanelAfterTextures('daily-signin', DAILY_SIGNIN_TEXTURE_NAMES, () => !!popupRoot.getChildByName('DailySignInOverlay'), () => this.openDailySignInPanel());
            return;
        }
        if (popupRoot.getChildByName('DailySignInOverlay')) return;
        runtime._retainPanelTextureOwner('daily-signin', DAILY_SIGNIN_TEXTURE_NAMES);

        const prefabPath = 'UI/Prefabs/Panels/DailySignInPanel';
        const status = runtime.getDailySignInStatus();
        const rewards = ECONOMY_NUMERIC_TABLE.dailySignIn.rewards;
        const isRuntimeAlive = () => !!(runtime._isRuntimeAliveForAsyncCallback?.() ?? runtime.isValid);
        const isOpenTargetAlive = () => isRuntimeAlive() && !!popupRoot?.isValid;
        const cancelStaleOpen = () => {
            if (!isRuntimeAlive()) return;
            runtime._releasePanelTextureOwner('daily-signin', 'daily-signin-open-stale');
        };

        const formatDailyExtraReward = (reward: DailySignInReward): string => {
            const rewardProps = reward as DailySignInReward & { wand?: number; freeze?: number; brush?: number; magnet?: number };
            if (rewardProps.freeze && rewardProps.freeze > 0) return `\u51bb\u7ed3x${rewardProps.freeze}`;
            if (rewardProps.wand && rewardProps.wand > 0) return `魔法棒x${rewardProps.wand}`;
            if (rewardProps.brush && rewardProps.brush > 0) return `刷子x${rewardProps.brush}`;
            if (rewardProps.magnet && rewardProps.magnet > 0) return `磁铁x${rewardProps.magnet}`;
            return '';
        };

        const syncDailyRewardCard = (card: Node, reward: DailySignInReward, cardState: 'available' | 'claimed' | 'locked') => {
            const goldTextNode = runtime.requirePanelChild(card, 'GoldText');
            const goldTextLabel = goldTextNode.getComponent(Label);
            if (!goldTextLabel) throw new Error('[daily-signin-prefab] missing Label component on GoldText');
            const goldReward = reward.gold && reward.gold > 0 ? `x${reward.gold}` : '';
            const extraReward = formatDailyExtraReward(reward);
            goldTextLabel.string = [goldReward, extraReward].filter(Boolean).join('\n');
            const claimedBadge = runtime.requirePanelChild(card, 'ClaimedBadge');
            claimedBadge.active = cardState === 'claimed';
        };

        const failOpen = (message: string, overlay?: Node | null) => {
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                runtime._destroyDetachedNodeNextFrame(overlay);
            }
            runtime._releasePanelTextureOwner('daily-signin', 'daily-signin-open-failed');
            console.error(message);
        };

        runtime._withGameAssetsBundle((bundle: Bundle | null) => {
            if (!isOpenTargetAlive()) {
                cancelStaleOpen();
                return;
            }
            if (!bundle) { failOpen('[daily-signin-prefab] gameAssets bundle unavailable'); return; }
            bundle.load(prefabPath, Prefab, (err: Error | null, prefab: Prefab | null) => {
                if (!isOpenTargetAlive()) {
                    cancelStaleOpen();
                    return;
                }
                if (err || !prefab) { failOpen(`[daily-signin-prefab] load failed: ${err?.message || 'prefab missing'}`); return; }
                let overlay: Node | null = null;
                try {
                    overlay = instantiate(prefab);
                    overlay.name = 'DailySignInOverlay';
                    popupRoot.addChild(overlay);
                    overlay.setSiblingIndex(999);
                    if (!overlay.getComponent(BlockInputEvents)) overlay.addComponent(BlockInputEvents);

                    const closePanel = () => {
                        if (!overlay?.isValid) return;
                        AudioMgr.inst.play('button');
                        runtime._closePanelWithTextureOwner(overlay, 'daily-signin', 'daily-signin');
                    };

                    const box = runtime.requirePanelChild(overlay, 'Box');
                    syncPrefabPopupTitle(box, '签到');
                    if (!box.getComponent(BlockInputEvents)) box.addComponent(BlockInputEvents);
                    overlay.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                        const boxUT = box.getComponent(UITransform);
                        if (!boxUT) return;
                        const uiPos = e.getUILocation();
                        const local = boxUT.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
                        const size = boxUT.contentSize;
                        if (Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2) return;
                        closePanel();
                    }, runtime);
                    runtime.bindPanelButton(runtime.requirePanelChild(box, 'CloseButton'), closePanel);

                    const gridRoot = runtime.requirePanelChild(box, 'GridRoot');
                    for (let i = 0; i < rewards.length; i++) {
                        const reward = rewards[i];
                        const card = runtime.requirePanelChild(gridRoot, `PreviewCard${i}`);
                        card.active = true;
                        const cardState = status.canClaim && i === status.nextClaimIndex ? 'available' : i < status.displayClaimedCount ? 'claimed' : 'locked';
                        syncDailyRewardCard(card, reward, cardState);
                    }

                    const claimButton = runtime.requirePanelChild(box, 'ClaimButton');
                    const claimButtonText = runtime.requirePanelChild(claimButton, 'ClaimButtonText');
                    const claimButtonLabel = claimButtonText.getComponent(Label);
                    if (!claimButtonLabel) throw new Error('[daily-signin-prefab] missing Label component on ClaimButton/ClaimButtonText');
                    claimButtonLabel.string = status.canClaim ? '签到领取' : '今日已领取';
                    runtime.bindPanelButton(claimButton, () => {
                        AudioMgr.inst.play('button');
                        if (!status.canClaim) { runtime.showToast('今天已经签到过了'); return; }
                        const reward = rewards[status.nextClaimIndex];
                        if (!reward) return;
                        let rewardSummary = '';
                        try {
                            rewardSummary = runtime.grantDailySignInReward(reward);
                        } catch (error) {
                            console.warn('[daily-signin] reward grant failed:', error);
                            runtime.showToast('签到奖励发放失败，请重试');
                            return;
                        }
                        runtime.setDailySignInClaimedCount(status.nextClaimIndex + 1);
                        runtime.setDailySignInLastClaimDateKey(runtime.getTodayDateKey());
                        runtime._suppressHomeStartUntil = Date.now() + 350;
                        runtime._closePanelWithTextureOwner(overlay!, 'daily-signin', 'daily-signin-claim');
                        runtime.refreshGoldUI();
                        runtime.showDailySignInRewardReceipt(reward);
                        runtime.showToast(`签到成功，获得${rewardSummary}`, 2);
                    });
                    runtime.playPopupOpenAnim?.(overlay, box);
                } catch (error: any) {
                    failOpen(error?.message || '[daily-signin-prefab] build failed', overlay);
                }
            });
        });
    }
}

export function ensureCommercePanelController(runtime: any): CommercePanelController {
    if (!runtime._commercePanelController) {
        runtime._commercePanelController = new CommercePanelController(runtime);
    }
    return runtime._commercePanelController as CommercePanelController;
}
