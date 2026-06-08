import {
    AudioMgr,
    BlockInputEvents,
    Bundle,
    Button,
    Color,
    DAILY_SIGNIN_RELEASE_TEXTURE_NAMES,
    DAILY_SIGNIN_TEXTURE_NAMES,
    ECONOMY_NUMERIC_TABLE,
    EventTouch,
    GOLD_SHOP_RELEASE_TEXTURE_NAMES,
    GOLD_SHOP_TEXTURE_NAMES,
    Label,
    Node,
    Prefab,
    Sprite,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    instantiate,
    tween,
} from '../GameCtrlShared';
import type { DailySignInReward } from '../GameCtrlShared';

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

export class CommercePanelController {
    constructor(private readonly runtime: any) {}

    openGoldShop() {
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        if (popupRoot.getChildByName('GoldShopOverlay') || runtime._goldShopOpening) return;
        runtime._goldShopOpening = true;
        const prefabPath = 'UI/Prefabs/Panels/GoldShopPanel';
        const rewardedGold = ECONOMY_NUMERIC_TABLE.adReward.goldShopReward;
        runtime._ensureSpriteFramesByName(GOLD_SHOP_TEXTURE_NAMES, () => {
            runtime._goldShopOpening = false;
            if (popupRoot.getChildByName('GoldShopOverlay')) return;

            const buyRows = [
                { title: '补满体力', desc: `恢复到 ${(runtime.constructor as any).VIGOR_CEILING}/${(runtime.constructor as any).VIGOR_CEILING}`, cost: ECONOMY_NUMERIC_TABLE.purchaseCost.fullVigor, priceText: `${ECONOMY_NUMERIC_TABLE.purchaseCost.fullVigor} 金币`, icon: 'vigor' as const, onBuy: () => { if (runtime.getVigor() >= (runtime.constructor as any).VIGOR_CEILING) { runtime.showToast('体力已经满了'); return false; } runtime.setVigor((runtime.constructor as any).VIGOR_CEILING); runtime.setVigorTime(0); runtime.refreshVigorUI(); runtime.showToast('体力已补满'); return true; } },
                { title: '魔法棒 x1', desc: '框选区域后豆子自动归位', cost: ECONOMY_NUMERIC_TABLE.purchaseCost.magicWand, priceText: `${ECONOMY_NUMERIC_TABLE.purchaseCost.magicWand} 金币`, icon: 'wand' as const, onBuy: () => { runtime.addPropCount('wand', 1); runtime.showToast('已购买魔法棒'); return true; } },
                { title: '刷子 x1', desc: '清空暂存槽并归位豆子', cost: ECONOMY_NUMERIC_TABLE.purchaseCost.brush, priceText: `${ECONOMY_NUMERIC_TABLE.purchaseCost.brush} 金币`, icon: 'brush' as const, onBuy: () => { runtime.addPropCount('brush', 1); runtime.showToast('已购买刷子'); return true; } },
                { title: '磁铁 x1', desc: '吸附一种颜色并快速归位', cost: ECONOMY_NUMERIC_TABLE.purchaseCost.magnet, priceText: `${ECONOMY_NUMERIC_TABLE.purchaseCost.magnet} 金币`, icon: 'magnet' as const, onBuy: () => { runtime.addPropCount('magnet', 1); runtime.showToast('已购买磁铁'); return true; } },
            ];

            const requireStaticShopItemIcon = (parent: Node, icon: 'ad' | 'vigor' | 'wand' | 'brush' | 'magnet') => {
                const iconNode = runtime.requirePanelChild(parent, 'PreviewIcon');
                const iconSprite = iconNode.getComponent(Sprite);
                if (!iconSprite || !iconSprite.spriteFrame) {
                    throw new Error(`[gold-shop-prefab] missing static PreviewIcon SpriteFrame for ${icon}`);
                }
                const iconTransform = iconNode.getComponent(UITransform);
                if (!iconTransform || iconTransform.contentSize.width <= 0 || iconTransform.contentSize.height <= 0) {
                    throw new Error(`[gold-shop-prefab] missing static PreviewIcon size for ${icon}`);
                }
                const label = iconNode.getComponent(Label);
                if (label?.enabled && label.string.trim()) {
                    throw new Error(`[gold-shop-prefab] PreviewIcon for ${icon} must be an image, not text`);
                }
                return iconNode;
            };

            const failOpen = (message: string, overlay?: Node | null) => {
                if (overlay?.isValid) {
                    runtime._clearSpriteFramesBeforeDestroy(overlay);
                    overlay.destroy();
                }
                runtime._shopGoldLbl = null;
                runtime._releasePanelTexturesNextFrame(GOLD_SHOP_RELEASE_TEXTURE_NAMES, 'gold-shop-open-failed');
                console.error(message);
            };

            runtime._withGameAssetsBundle((bundle: Bundle | null) => {
                if (!bundle) { failOpen('[gold-shop-prefab] gameAssets bundle unavailable'); return; }
                bundle.load(prefabPath, Prefab, (err: Error | null, prefab: Prefab | null) => {
                    if (err || !prefab) { failOpen(`[gold-shop-prefab] load failed: ${err?.message || 'prefab missing'}`); return; }
                    let overlay: Node | null = null;
                    try {
                        overlay = instantiate(prefab);
                        overlay.name = 'GoldShopOverlay';
                        popupRoot.addChild(overlay);
                        overlay.setSiblingIndex(998);
                        if (!overlay.getComponent(BlockInputEvents)) overlay.addComponent(BlockInputEvents);

                        const closeShop = () => {
                            if (!overlay?.isValid) return;
                            AudioMgr.inst.play('button');
                            runtime._shopGoldLbl = null;
                            runtime._destroyPanelAndReleaseTextures(overlay, GOLD_SHOP_RELEASE_TEXTURE_NAMES, 'gold-shop');
                        };

                        const box = runtime.requirePanelChild(overlay, 'Box');
                        syncPrefabPopupTitle(box, '商城');
                        if (!box.getComponent(BlockInputEvents)) box.addComponent(BlockInputEvents);
                        overlay.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                            const boxUT = box.getComponent(UITransform);
                            if (!boxUT) return;
                            const uiPos = e.getUILocation();
                            const local = boxUT.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
                            const size = boxUT.contentSize;
                            if (Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2) return;
                            closeShop();
                        }, runtime);

                        runtime.bindPanelButton(runtime.requirePanelChild(box, 'XBtn'), closeShop);
                        const goldAnchor = runtime.requirePanelChild(box, 'GoldBalanceAnchor');
                        (goldAnchor.getComponent(UITransform) || goldAnchor.addComponent(UITransform)).setContentSize(154, 42);
                        const goldIcon = runtime.requirePanelChild(goldAnchor, 'GoldBalanceIcon');
                        const goldIconSprite = goldIcon.getComponent(Sprite);
                        if (!goldIconSprite?.spriteFrame) {
                            throw new Error('[gold-shop-prefab] missing static GoldBalanceIcon SpriteFrame');
                        }
                        const goldLabelNode = runtime.requirePanelChild(goldAnchor, 'GoldBalanceLbl');
                        const goldLabel = goldLabelNode.getComponent(Label);
                        if (!goldLabel) throw new Error('[gold-shop-prefab] missing Label component on GoldBalanceLbl');
                        (goldLabelNode.getComponent(UITransform) || goldLabelNode.addComponent(UITransform)).setContentSize(82, 30);
                        goldLabel.string = `${runtime.getGold()}`;
                        goldLabel.fontSize = 22;
                        goldLabel.lineHeight = 30;
                        goldLabel.color = new Color('#6A4A10');
                        goldLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
                        goldLabel.verticalAlign = Label.VerticalAlign.CENTER;
                        goldLabel.overflow = Label.Overflow.SHRINK;
                        goldLabel.enableWrapText = false;
                        runtime._shopGoldLbl = goldLabel;

                        const adRow = runtime.requirePanelChild(box, 'AdRow');
                        const adIconPlate = runtime.requirePanelChild(adRow, 'AdIconPlate');
                        requireStaticShopItemIcon(adIconPlate, 'ad');
                        runtime.fillPanelAnchorLabel(runtime.requirePanelChild(adRow, 'AdTitleAnchor'), 'GoldShopAdTitle', `看广告领 ${rewardedGold} 金币`, 25, new Color('#5A4A3A'), 248, 34, Label.HorizontalAlign.LEFT);
                        runtime.fillPanelAnchorLabel(runtime.requirePanelChild(adRow, 'AdDescAnchor'), 'GoldShopAdDesc', '完整看完自动到账', 17, new Color('#8A7A6A'), 258, 28, Label.HorizontalAlign.LEFT);
                        const adButton = runtime.requirePanelChild(adRow, 'AdButton');
                        runtime.fillPanelAnchorLabel(adButton, 'GoldShopAdBtnLbl', '立即领取', 18, Color.WHITE, 100, 24);
                        runtime.bindPanelButton(adButton, () => {
                            AudioMgr.inst.play('button');
                            runtime.showTrackedRewardedAd('gold_shop_reward', (success: boolean) => {
                                if (!success) return;
                                runtime.addGold(rewardedGold);
                                runtime.showToast(`已获得 ${rewardedGold} 金币`);
                            });
                        });

                        for (let i = 0; i < buyRows.length; i++) {
                            const row = buyRows[i];
                            const rowNode = runtime.requirePanelChild(box, `ItemRow${i}`);
                            requireStaticShopItemIcon(runtime.requirePanelChild(rowNode, 'IconPlate'), row.icon);
                            runtime.fillPanelAnchorLabel(runtime.requirePanelChild(rowNode, 'TitleAnchor'), `GoldShopRowTitle${i}`, row.title, 24, new Color('#5A4A3A'), 238, 32, Label.HorizontalAlign.LEFT);
                            runtime.fillPanelAnchorLabel(runtime.requirePanelChild(rowNode, 'DescAnchor'), `GoldShopRowDesc${i}`, row.desc, 16, new Color('#8A7A6A'), 252, 26, Label.HorizontalAlign.LEFT);
                            const buyButton = runtime.requirePanelChild(rowNode, 'BuyButton');
                            runtime.fillPanelAnchorLabel(buyButton, `GoldShopBuyLbl${i}`, row.priceText, 18, Color.WHITE, 108, 24);
                            runtime.bindPanelButton(buyButton, () => {
                                AudioMgr.inst.play('button');
                                if (!runtime.spendGold(row.cost)) { runtime.showToast(`金币不足，还差 ${row.cost - runtime.getGold()} 金币`); return; }
                                if (!row.onBuy()) { runtime.addGold(row.cost); return; }
                                runtime.refreshGoldUI();
                            });
                        }
                        for (let i = buyRows.length; i < 5; i++) {
                            const unusedRow = box.getChildByName(`ItemRow${i}`);
                            if (unusedRow?.isValid) unusedRow.active = false;
                        }

                        runtime.refreshGoldUI();
                    } catch (error: any) {
                        failOpen(error?.message || '[gold-shop-prefab] build failed', overlay);
                    }
                });
            });
        });
    }

    openDailySignInPanel() {
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        if (DAILY_SIGNIN_TEXTURE_NAMES.some((name: string) => !runtime.getSF(name))) {
            runtime._openPanelAfterTextures('daily-signin', DAILY_SIGNIN_TEXTURE_NAMES, () => !!popupRoot.getChildByName('DailySignInOverlay'), () => this.openDailySignInPanel());
            return;
        }
        if (popupRoot.getChildByName('DailySignInOverlay')) return;

        const prefabPath = 'UI/Prefabs/Panels/DailySignInPanel';
        const status = runtime.getDailySignInStatus();
        const rewards = ECONOMY_NUMERIC_TABLE.dailySignIn.rewards;

        const syncDailyRewardCard = (card: Node, reward: DailySignInReward, index: number, cardState: 'available' | 'claimed' | 'locked') => {
            (card.getComponent(UITransform) || card.addComponent(UITransform)).setContentSize(124, 170);
            const cardBody = runtime.requirePanelChild(card, 'CardBody');
            const cardBodySprite = cardBody.getComponent(Sprite);
            if (!cardBodySprite) throw new Error('[daily-signin-prefab] missing Sprite component on CardBody');
            cardBody.setPosition(0, 0, 0);
            const cardOpacity = cardBody.getComponent(UIOpacity) || cardBody.addComponent(UIOpacity);
            cardBodySprite.color = cardState === 'claimed' ? new Color('#E9E1D5') : new Color('#FFF8EE');
            cardOpacity.opacity = cardState === 'claimed' ? 214 : (cardState === 'locked' ? 238 : 255);
            const dayTag = runtime.requirePanelChild(card, 'DayTag');
            dayTag.setPosition(0, 64, 0);
            const dayTagLabelNode = runtime.requirePanelChild(dayTag, 'DayTagLabel');
            const dayTagLabel = dayTagLabelNode.getComponent(Label);
            if (!dayTagLabel) throw new Error('[daily-signin-prefab] missing Label component on DayTag/DayTagLabel');
            (dayTagLabelNode.getComponent(UITransform) || dayTagLabelNode.addComponent(UITransform)).setContentSize(80, 24);
            dayTagLabel.string = `登录${index + 1}天`;
            dayTagLabel.fontSize = 15;
            dayTagLabel.lineHeight = 24;
            dayTagLabel.color = cardState === 'locked' ? new Color('#A69480') : new Color('#8B5C34');
            const goldIconNode = runtime.requirePanelChild(card, 'GoldIcon');
            goldIconNode.setPosition(0, 12, 0);
            (goldIconNode.getComponent(UITransform) || goldIconNode.addComponent(UITransform)).setContentSize(42, 44);
            const goldTextNode = runtime.requirePanelChild(card, 'GoldText');
            const goldTextLabel = goldTextNode.getComponent(Label);
            if (!goldTextLabel) throw new Error('[daily-signin-prefab] missing Label component on GoldText');
            goldTextLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            goldTextLabel.verticalAlign = Label.VerticalAlign.CENTER;
            goldTextLabel.enableWrapText = true;
            goldTextLabel.overflow = Label.Overflow.SHRINK;
            goldTextLabel.color = cardState === 'claimed' ? new Color('#8E745B') : new Color('#6A4A10');
            let extraReward = '';
            if (reward.wand && reward.wand > 0) extraReward = `魔法棒x${reward.wand}`;
            else if (reward.brush && reward.brush > 0) extraReward = `刷子x${reward.brush}`;
            else if (reward.magnet && reward.magnet > 0) extraReward = `磁铁x${reward.magnet}`;
            goldTextNode.setPosition(0, extraReward ? -30 : -36, 0);
            (goldTextNode.getComponent(UITransform) || goldTextNode.addComponent(UITransform)).setContentSize(extraReward ? 96 : 92, extraReward ? 34 : 36);
            goldTextLabel.fontSize = extraReward ? 12 : 15;
            goldTextLabel.lineHeight = extraReward ? 15 : 20;
            goldTextLabel.string = extraReward ? `+${reward.gold}\n${extraReward}` : `+${reward.gold}`;
            const claimedBadge = runtime.requirePanelChild(card, 'ClaimedBadge');
            claimedBadge.active = cardState === 'claimed';
            if (claimedBadge.active) {
                claimedBadge.setPosition(34, -54, 0);
            }
        };

        const failOpen = (message: string, overlay?: Node | null) => {
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                overlay.destroy();
            }
            runtime._releasePanelTexturesNextFrame(DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, 'daily-signin-open-failed');
            console.error(message);
        };

        runtime._withGameAssetsBundle((bundle: Bundle | null) => {
            if (!bundle) { failOpen('[daily-signin-prefab] gameAssets bundle unavailable'); return; }
            bundle.load(prefabPath, Prefab, (err: Error | null, prefab: Prefab | null) => {
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
                        runtime._destroyPanelAndReleaseTextures(overlay, DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, 'daily-signin');
                    };

                    const box = runtime.requirePanelChild(overlay, 'Box');
                    syncPrefabPopupTitle(box, '签到');
                    const gridPlate = box.getChildByName('GridPlate');
                    if (gridPlate) gridPlate.active = false;
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
                        syncDailyRewardCard(card, reward, i, cardState);
                    }

                    const previewRewardIndex = status.canClaim ? status.nextClaimIndex : Math.max(0, Math.min(status.displayClaimedCount, rewards.length - 1));
                    const rewardLines = runtime.buildDailySignInRewardText(rewards[previewRewardIndex] || rewards[0]);
                    const rewardFrame = runtime.requirePanelChild(box, 'RewardFrame');
                    runtime.requirePanelChild(box, 'RewardLabel').active = false;
                    const rewardTextAnchor = runtime.requirePanelChild(box, 'RewardTextAnchor');
                    rewardTextAnchor.active = true;
                    rewardTextAnchor.setPosition(0, -174, 0);
                    (rewardTextAnchor.getComponent(UITransform) || rewardTextAnchor.addComponent(UITransform)).setContentSize(360, 32);
                    const rewardTextLabel = rewardTextAnchor.getComponent(Label);
                    if (!rewardTextLabel) throw new Error('[daily-signin-prefab] missing RewardTextAnchor label');
                    rewardTextLabel.string = `今日奖励： ${rewardLines.join('、')}`;
                    rewardTextLabel.fontSize = 21;
                    rewardTextLabel.lineHeight = 32;
                    rewardTextLabel.color = new Color('#8B5C34');
                    rewardTextLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
                    rewardTextLabel.verticalAlign = Label.VerticalAlign.CENTER;
                    rewardTextLabel.overflow = Label.Overflow.SHRINK;
                    rewardTextLabel.enableWrapText = false;
                    rewardFrame.setSiblingIndex(box.children.length - 2);
                    rewardTextAnchor.setSiblingIndex(box.children.length - 1);
                    runtime.fillPanelAnchorLabel(runtime.requirePanelChild(box, 'TipAnchor'), 'DailySignInTip', '连续签到可解锁更高奖励，断签将从第一天重新开始', 15, new Color('#594230'), 420, 24, Label.HorizontalAlign.CENTER);

                    const claimButton = runtime.requirePanelChild(box, 'ClaimButton');
                    const claimButtonText = runtime.requirePanelChild(claimButton, 'ClaimButtonText');
                    const claimButtonLabel = claimButtonText.getComponent(Label);
                    if (!claimButtonLabel) throw new Error('[daily-signin-prefab] missing Label component on ClaimButton/ClaimButtonText');
                    claimButton.setScale(1, 1, 1);
                    Tween.stopAllByTarget(claimButton);
                    claimButtonLabel.string = status.canClaim ? '签到领取' : '今日已领取';
                    runtime.bindPanelButton(claimButton, () => {
                        AudioMgr.inst.play('button');
                        if (!status.canClaim) { runtime.showToast('今天已经签到过了'); return; }
                        const reward = rewards[status.nextClaimIndex];
                        if (!reward) return;
                        const rewardSummary = runtime.grantDailySignInReward(reward);
                        runtime.setDailySignInClaimedCount(status.nextClaimIndex + 1);
                        runtime.setDailySignInLastClaimDateKey(runtime.getTodayDateKey());
                        runtime._destroyPanelAndReleaseTextures(overlay!, DAILY_SIGNIN_RELEASE_TEXTURE_NAMES, 'daily-signin-claim');
                        runtime.showMainMenu();
                        runtime.showDailySignInRewardReceipt(reward);
                        runtime.showToast(`签到成功，获得${rewardSummary}`, 2);
                    });
                    if (status.canClaim) {
                        tween(claimButton).repeatForever(tween(claimButton).to(0.9, { scale: new Vec3(1.03, 1.03, 1) }, { easing: 'sineInOut' }).to(0.9, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })).start();
                    }
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
