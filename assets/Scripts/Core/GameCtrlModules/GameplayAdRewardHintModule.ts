import {
    AudioMgr,
    Button,
    Color,
    Graphics,
    Label,
    Layers,
    Node,
    SKILL_UNLOCK_FREEZE,
    Sprite,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
} from '../GameCtrlShared';
import type { InventoryPropKind } from '../GameCtrlShared';
import { isGameplaySkillUnlocked } from '../SlotOnboardingPolicy';

const FREEZE_HINT_REMAIN_SECONDS = 60;
const GIFT_HINT_REMAIN_SECONDS = 30;
const FREEZE_HINT_BUBBLE_TEXT = '时间不多啦';
const SLOT_REMINDER_MAX_PER_GAME = 3;
const SLOT_REMINDER_COOLDOWN_MS = 22000;

function getActiveLevel(runtime: any): number {
    return typeof runtime.getActiveLogicalLevelId === 'function'
        ? Math.floor(Number(runtime.getActiveLogicalLevelId()) || 0)
        : Math.floor(Number(runtime.levelData?.levelId) || 0);
}

function getActiveEntryMode(runtime: any): string {
    return runtime._activeGameplayEntryMode
        || (runtime._currentExternalLevelFilePath ? 'external' : (runtime._isThemeLevel ? 'theme' : 'main'));
}

function isTimerGameplay(runtime: any): boolean {
    return !runtime.isGameEnd
        && !runtime._currentLevelUnlimitedTime
        && runtime._timerStarted
        && runtime._guideStep < 0;
}

function setUiLayer(node: Node): void {
    node.layer = Layers.Enum.UI_2D;
    for (const child of node.children) {
        setUiLayer(child);
    }
}

function removeNode(node: Node | null | undefined): void {
    if (!node?.isValid) return;
    Tween.stopAllByTarget(node);
    const opacity = node.getComponent(UIOpacity);
    if (opacity) Tween.stopAllByTarget(opacity);
    node.removeFromParent();
    node.destroy();
}

function restoreTransform(node: Node): void {
    const cache = node as any;
    const pos = cache.__adRewardBasePos as Vec3 | undefined;
    const scale = cache.__adRewardBaseScale as Vec3 | undefined;
    if (pos) node.setPosition(pos.x, pos.y, pos.z);
    if (scale) node.setScale(scale.x, scale.y, scale.z);
}

function restoreScale(node: Node): void {
    const scale = (node as any).__adRewardBaseScale as Vec3 | undefined;
    if (scale) node.setScale(scale.x, scale.y, scale.z);
}

function cacheScale(node: Node): Vec3 {
    const cache = node as any;
    if (!cache.__adRewardBaseScale) {
        cache.__adRewardBaseScale = new Vec3(node.scale.x, node.scale.y, node.scale.z);
    }
    return cache.__adRewardBaseScale as Vec3;
}

function cacheTransform(node: Node): void {
    const cache = node as any;
    if (!cache.__adRewardBasePos) {
        cache.__adRewardBasePos = new Vec3(node.position.x, node.position.y, node.position.z);
    }
    if (!cache.__adRewardBaseScale) {
        cache.__adRewardBaseScale = new Vec3(node.scale.x, node.scale.y, node.scale.z);
    }
}

function playScalePulse(node: Node, peakScale: number, repeat: number, growSeconds: number, shrinkSeconds: number): void {
    if (!node?.isValid) return;
    const scale = cacheScale(node);
    Tween.stopAllByTarget(node);
    restoreScale(node);
    tween(node)
        .repeat(repeat, tween(node)
            .to(growSeconds, { scale: new Vec3(scale.x * peakScale, scale.y * peakScale, scale.z) })
            .to(shrinkSeconds, { scale: new Vec3(scale.x, scale.y, scale.z) }))
        .call(() => restoreScale(node))
        .start();
}

function findFirstLabel(root: Node): Label | null {
    const label = root.getComponent(Label);
    if (label) return label;
    for (const child of root.children) {
        const found = findFirstLabel(child);
        if (found) return found;
    }
    return null;
}

function hideSceneBubble(bubble: Node | null | undefined): void {
    if (!bubble?.isValid) return;
    Tween.stopAllByTarget(bubble);
    const opacity = bubble.getComponent(UIOpacity);
    if (opacity) {
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;
    }
    restoreTransform(bubble);
    bubble.active = false;
}

function showSceneBubble(bubble: Node | null | undefined, text: string): Node | null {
    if (!bubble?.isValid) return null;
    const label = findFirstLabel(bubble);
    if (label) label.string = text;
    cacheTransform(bubble);
    restoreTransform(bubble);
    Tween.stopAllByTarget(bubble);
    const opacity = bubble.getComponent(UIOpacity) || bubble.addComponent(UIOpacity);
    Tween.stopAllByTarget(opacity);
    const cache = bubble as any;
    const pos = cache.__adRewardBasePos as Vec3;
    bubble.active = true;
    bubble.setPosition(pos.x, pos.y - 6, pos.z);
    opacity.opacity = 0;
    tween(bubble)
        .to(0.18, { position: new Vec3(pos.x, pos.y, pos.z) })
        .start();
    tween(opacity)
        .to(0.18, { opacity: 255 })
        .delay(4.6)
        .to(0.2, { opacity: 0 })
        .call(() => hideSceneBubble(bubble))
        .start();
    return bubble;
}

function drawGiftVisual(root: Node): void {
    if (root.getChildByName('GiftVisual')?.isValid) return;
    const visual = new Node('GiftVisual');
    root.addChild(visual);
    visual.layer = Layers.Enum.UI_2D;
    visual.addComponent(UITransform).setContentSize(76, 76);
    const graphics = visual.addComponent(Graphics);
    graphics.fillColor = new Color(255, 177, 54, 255);
    graphics.roundRect(-28, -24, 56, 48, 8);
    graphics.fill();
    graphics.fillColor = new Color(255, 70, 66, 255);
    graphics.rect(-5, -24, 10, 48);
    graphics.fill();
    graphics.rect(-28, 0, 56, 10);
    graphics.fill();
    graphics.strokeColor = new Color(255, 238, 155, 255);
    graphics.lineWidth = 3;
    graphics.roundRect(-28, -24, 56, 48, 8);
    graphics.stroke();
    graphics.fillColor = new Color(255, 90, 82, 255);
    graphics.roundRect(-34, 24, 68, 16, 6);
    graphics.fill();
}

function pickGiftBonusProp(): InventoryPropKind {
    return Math.random() < 0.5 ? 'brush' : 'magnet';
}

export function installGameplayAdRewardHintModule(target: any): void {
    Object.assign(target, {
        resetAdRewardHintState(timeLimit?: number) {
            this.clearAdRewardHintVisuals?.(true);
            this._adRewardInitialTimeLimit = Math.max(0, Math.floor(Number(timeLimit ?? this.timeRemain) || 0));
            this._adRewardFreezeHintShown = false;
            this._adRewardFreezeEntryClicked = false;
            this._adRewardGiftShown = false;
            this._adRewardGiftRewarded = false;
            this._slotAddReminderCount = 0;
            this._slotAddReminderLastAt = 0;
            this._slotAddReminderFirstFullShown = false;
            this._slotAddReminderHalfTimeShown = false;
        },

        clearAdRewardHintVisuals(destroyGift: boolean = false) {
            this.clearAdRewardFreezeHintVisual?.();
            this.clearAdRewardGiftEntry?.(destroyGift);
            this.clearAdRewardSlotAddReminderVisuals?.();
        },

        checkAdRewardTimedHints() {
            if (!isTimerGameplay(this) || this._adShowing) return;
            if (!isGameplaySkillUnlocked(getActiveLevel(this), getActiveEntryMode(this), SKILL_UNLOCK_FREEZE)) return;
            const initialTime = Number(this._adRewardInitialTimeLimit) || Number(this.timeRemain) || 0;
            const remain = Math.floor(Number(this.timeRemain) || 0);
            if (!this._adRewardFreezeHintShown && initialTime >= FREEZE_HINT_REMAIN_SECONDS && remain <= FREEZE_HINT_REMAIN_SECONDS && remain > GIFT_HINT_REMAIN_SECONDS) {
                this.showAdRewardFreezeHint?.();
            }
            if (!this._slotAddReminderHalfTimeShown && initialTime > 0 && remain <= Math.floor(initialTime / 2)) {
                this._slotAddReminderHalfTimeShown = true;
                this.triggerSlotAddReminder?.('half-time');
            }
            if (!this._adRewardGiftShown
                && !this._adRewardFreezeEntryClicked
                && !this._adRewardGiftRewarded
                && initialTime >= FREEZE_HINT_REMAIN_SECONDS
                && remain <= GIFT_HINT_REMAIN_SECONDS
                && remain > 0) {
                this.showAdRewardGiftEntry?.();
            }
        },

        showAdRewardFreezeHint() {
            const skillRoot = typeof this.getGameplayBottomHudChild === 'function' ? this.getGameplayBottomHudChild('SkillArea') : null;
            const shell = skillRoot?.getChildByName('SkillFreeze');
            if (!shell?.isValid || !shell.activeInHierarchy) return false;
            this._adRewardFreezeHintShown = true;
            removeNode(shell.getChildByName('AdRewardFreezeGlow'));
            playScalePulse(shell, 1.1, 7, 0.34, 0.38);

            this._adRewardFreezeBubbleNode = showSceneBubble(shell.getChildByName('FreezeTimeHintBubble'), FREEZE_HINT_BUBBLE_TEXT);
            return true;
        },

        clearAdRewardFreezeHintVisual() {
            const skillRoot = typeof this.getGameplayBottomHudChild === 'function' ? this.getGameplayBottomHudChild('SkillArea') : null;
            const shell = skillRoot?.getChildByName('SkillFreeze');
            if (shell?.isValid) {
                Tween.stopAllByTarget(shell);
                restoreTransform(shell);
                removeNode(shell.getChildByName('AdRewardFreezeGlow'));
            }
            hideSceneBubble((this._adRewardFreezeBubbleNode as Node | null) || shell?.getChildByName('FreezeTimeHintBubble'));
            this._adRewardFreezeBubbleNode = null;
        },

        markAdRewardFreezeEntryClicked() {
            if (!this._adRewardFreezeHintShown) return;
            this._adRewardFreezeEntryClicked = true;
            this.clearAdRewardFreezeHintVisual?.();
        },

        tryUseAdRewardFreezeRescue(onComplete?: () => void): boolean {
            if (!isTimerGameplay(this) || this._adShowing || this._skillActive) return false;
            if (!this._adRewardFreezeHintShown || this._adRewardFreezeEntryClicked) return false;
            if (Math.floor(Number(this.timeRemain) || 0) > FREEZE_HINT_REMAIN_SECONDS) return false;
            if (Number(this.getPropCount?.('freeze')) > 0) return false;
            this.clearAdRewardFreezeHintVisual?.();
            return this.runRewardedGrant('freeze_rescue_60s', () => {
                if (this.isGameEnd) return false;
                this._adRewardFreezeEntryClicked = true;
                this.markDynamicCountdownAssisted?.();
                this.useSkillFreeze?.(true);
                onComplete?.();
            }, {
                busyFlag: '_adShowing',
                waitForCloseBeforeComplete: true,
                grantFailToast: '冻结时间生效失败，请重试',
            }) === true;
        },

        getOrCreateAdRewardGiftEntry(): Node | null {
            const fixedRoot = typeof this.getGameplayFixedRoot === 'function' ? this.getGameplayFixedRoot() : null;
            if (!fixedRoot?.isValid) return null;
            let entry = fixedRoot.getChildByName('AdRewardGiftEntry');
            if (!entry?.isValid) {
                entry = new Node('AdRewardGiftEntry');
                fixedRoot.addChild(entry);
                entry.addComponent(UITransform).setContentSize(94, 94);
                entry.addComponent(UIOpacity);
                this._adRewardGiftNodeCreated = true;
                const parentUi = fixedRoot.getComponent(UITransform);
                const x = parentUi ? parentUi.contentSize.width / 2 - 86 : 280;
                const y = parentUi ? parentUi.contentSize.height / 2 - 172 : 360;
                entry.setPosition(x, y, 0);
            }
            entry.layer = Layers.Enum.UI_2D;
            entry.active = false;
            const ui = entry.getComponent(UITransform) || entry.addComponent(UITransform);
            if (!ui.contentSize.width || !ui.contentSize.height) ui.setContentSize(94, 94);
            if (!entry.getComponent(UIOpacity)) entry.addComponent(UIOpacity);
            const button = entry.getComponent(Button) || entry.addComponent(Button);
            button.enabled = true;
            entry.targetOff(this);
            entry.on(Button.EventType.CLICK, () => this.tryUseAdRewardGift?.(), this);
            const sprite = entry.getComponent(Sprite);
            if (entry.children.length === 0 && !sprite?.spriteFrame) {
                drawGiftVisual(entry);
            }
            setUiLayer(entry);
            this._adRewardGiftNode = entry;
            return entry;
        },

        showAdRewardGiftEntry() {
            if (!isTimerGameplay(this) || this._adShowing || this._skillActive) return false;
            if (this._adRewardGiftShown || this._adRewardFreezeEntryClicked) return false;
            const entry = this.getOrCreateAdRewardGiftEntry?.();
            if (!entry?.isValid) return false;
            this._adRewardGiftShown = true;
            entry.active = true;
            entry.setSiblingIndex(Math.max(0, entry.parent ? entry.parent.children.length - 1 : 0));
            const opacity = entry.getComponent(UIOpacity) || entry.addComponent(UIOpacity);
            opacity.opacity = 255;
            removeNode(entry.getChildByName('AdRewardGiftGlow'));
            cacheTransform(entry);
            Tween.stopAllByTarget(entry);
            Tween.stopAllByTarget(opacity);
            const baseScale = (entry as any).__adRewardBaseScale as Vec3;
            entry.setScale(baseScale.x * 0.75, baseScale.y * 0.75, baseScale.z);
            tween(entry)
                .to(0.18, { scale: new Vec3(baseScale.x * 1.12, baseScale.y * 1.12, baseScale.z) }, { easing: 'backOut' })
                .to(0.1, { scale: new Vec3(baseScale.x, baseScale.y, baseScale.z) })
                .delay(0.4)
                .repeatForever(tween(entry)
                    .to(0.28, { scale: new Vec3(baseScale.x * 1.06, baseScale.y * 1.06, baseScale.z) })
                    .to(0.28, { scale: new Vec3(baseScale.x, baseScale.y, baseScale.z) })
                    .delay(0.7))
                .start();
            return true;
        },

        clearAdRewardGiftEntry(destroyCreated: boolean = false) {
            const entry = this._adRewardGiftNode as Node | null;
            if (!entry?.isValid) {
                this._adRewardGiftNode = null;
                return;
            }
            Tween.stopAllByTarget(entry);
            const opacity = entry.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            removeNode(entry.getChildByName('AdRewardGiftGlow'));
            restoreTransform(entry);
            if (destroyCreated && this._adRewardGiftNodeCreated) {
                entry.targetOff(this);
                entry.removeFromParent();
                entry.destroy();
                this._adRewardGiftNode = null;
                this._adRewardGiftNodeCreated = false;
                return;
            }
            entry.active = false;
        },

        tryUseAdRewardGift(): boolean {
            if (!isTimerGameplay(this) || this._adShowing || this._skillActive) return false;
            if (!this._adRewardGiftShown || this._adRewardGiftRewarded) return false;
            AudioMgr.inst.play('button');
            return this.runRewardedGrant('rescue_gift_30s', () => {
                if (this.isGameEnd) return false;
                const bonusProp = pickGiftBonusProp();
                this.markDynamicCountdownAssisted?.();
                this.useSkillFreeze?.(true);
                this.addPropCount?.(bonusProp, 1);
                this.rebuildSkillButtonsUI?.();
                this._adRewardGiftRewarded = true;
                this.clearAdRewardGiftEntry?.();
            }, {
                busyFlag: '_adShowing',
                waitForCloseBeforeComplete: true,
                grantFailToast: '救场礼包领取失败，请重试',
            }) === true;
        },

        isSlotAddReminderEligible(): boolean {
            if (this.isGameEnd || this._guideStep >= 0 || this._adShowing || this._skillActive) return false;
            if (!this.slotModel || Number(this.slotUnlockedRows) >= Number(this.slotRowCount)) return false;
            const button = typeof this.getSlotUnlockButtonNode === 'function' ? this.getSlotUnlockButtonNode() : null;
            return !!button?.isValid && button.activeInHierarchy !== false;
        },

        triggerSlotAddReminder(reason: string = 'manual'): boolean {
            if (!this.isSlotAddReminderEligible?.()) return false;
            const now = Date.now();
            const count = Math.floor(Number(this._slotAddReminderCount) || 0);
            const lastAt = Number(this._slotAddReminderLastAt) || 0;
            if (count >= SLOT_REMINDER_MAX_PER_GAME) return false;
            if (lastAt > 0 && now - lastAt < SLOT_REMINDER_COOLDOWN_MS) return false;
            const button = this.getSlotUnlockButtonNode?.();
            if (!button?.isValid) return false;
            this._slotAddReminderCount = count + 1;
            this._slotAddReminderLastAt = now;
            this._slotAddReminderLastReason = reason;
            playScalePulse(button, 1.12, 5, 0.32, 0.36);
            return true;
        },

        checkSlotAddReminderAfterSlotChanged(reason: string = 'slot-change'): void {
            if (this._slotAddReminderFirstFullShown) return;
            if (!this.slotModel || typeof this.slotModel.hasEmptySlot !== 'function') return;
            if (this.slotModel.hasEmptySlot()) return;
            this._slotAddReminderFirstFullShown = true;
            this.triggerSlotAddReminder?.(reason);
        },

        clearAdRewardSlotAddReminderVisuals() {
            const button = typeof this.getSlotUnlockButtonNode === 'function' ? this.getSlotUnlockButtonNode() : null;
            if (!button?.isValid) return;
            Tween.stopAllByTarget(button);
            restoreScale(button);
        },
    });
}
