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

const FREEZE_HINT_REMAIN_SECONDS = 60;
const GIFT_HINT_REMAIN_SECONDS = 30;
const FREEZE_HINT_DURATION_SECONDS = 8;
const SLOT_REMINDER_MAX_PER_GAME = 3;
const SLOT_REMINDER_COOLDOWN_MS = 22000;

function getActiveLevel(runtime: any): number {
    return typeof runtime.getActiveLogicalLevelId === 'function'
        ? Math.floor(Number(runtime.getActiveLogicalLevelId()) || 0)
        : Math.floor(Number(runtime.levelData?.levelId) || 0);
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

function getContentSize(node: Node, fallbackW: number, fallbackH: number): { width: number; height: number } {
    const ui = node.getComponent(UITransform);
    const width = ui?.contentSize?.width || fallbackW;
    const height = ui?.contentSize?.height || fallbackH;
    return {
        width: Math.max(1, width),
        height: Math.max(1, height),
    };
}

function drawRoundedOutline(node: Node, width: number, height: number, radius: number): void {
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    graphics.clear();
    graphics.lineWidth = 7;
    graphics.strokeColor = new Color(255, 214, 50, 105);
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.stroke();
    graphics.lineWidth = 3;
    graphics.strokeColor = new Color(255, 238, 112, 245);
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.stroke();
}

function ensureGlowNode(target: Node, name: string, padding: number, fallbackW: number, fallbackH: number): Node {
    let glow = target.getChildByName(name);
    if (!glow?.isValid) {
        glow = new Node(name);
        target.addChild(glow);
        glow.addComponent(UITransform);
        glow.addComponent(UIOpacity);
    }
    const size = getContentSize(target, fallbackW, fallbackH);
    const width = size.width + padding * 2;
    const height = size.height + padding * 2;
    const radius = Math.min(24, Math.max(8, Math.min(width, height) / 4));
    glow.layer = Layers.Enum.UI_2D;
    glow.setPosition(0, 0, 0);
    glow.setScale(1, 1, 1);
    glow.getComponent(UITransform)?.setContentSize(width, height);
    drawRoundedOutline(glow, width, height, radius);
    return glow;
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

function cacheTransform(node: Node): void {
    const cache = node as any;
    if (!cache.__adRewardBasePos) {
        cache.__adRewardBasePos = new Vec3(node.position.x, node.position.y, node.position.z);
    }
    if (!cache.__adRewardBaseScale) {
        cache.__adRewardBaseScale = new Vec3(node.scale.x, node.scale.y, node.scale.z);
    }
}

function playShake(node: Node, distance: number, repeat: number, scaleBoost = 1.04): void {
    if (!node?.isValid) return;
    cacheTransform(node);
    restoreTransform(node);
    Tween.stopAllByTarget(node);
    const cache = node as any;
    const pos = cache.__adRewardBasePos as Vec3;
    const scale = cache.__adRewardBaseScale as Vec3;
    tween(node)
        .repeat(repeat, tween(node)
            .to(0.055, { position: new Vec3(pos.x - distance, pos.y, pos.z), scale: new Vec3(scale.x * scaleBoost, scale.y * scaleBoost, scale.z) })
            .to(0.055, { position: new Vec3(pos.x + distance, pos.y, pos.z) })
            .to(0.07, { position: new Vec3(pos.x, pos.y, pos.z), scale: new Vec3(scale.x, scale.y, scale.z) }))
        .call(() => restoreTransform(node))
        .start();
}

function playJump(node: Node, height: number, repeat: number): void {
    if (!node?.isValid) return;
    cacheTransform(node);
    restoreTransform(node);
    Tween.stopAllByTarget(node);
    const cache = node as any;
    const pos = cache.__adRewardBasePos as Vec3;
    const scale = cache.__adRewardBaseScale as Vec3;
    tween(node)
        .repeat(repeat, tween(node)
            .to(0.09, { position: new Vec3(pos.x, pos.y + height, pos.z), scale: new Vec3(scale.x * 1.04, scale.y * 1.04, scale.z) })
            .to(0.11, { position: new Vec3(pos.x, pos.y, pos.z), scale: new Vec3(scale.x, scale.y, scale.z) }))
        .call(() => restoreTransform(node))
        .start();
}

function findLabelNodeByText(root: Node, text: string): Node | null {
    const label = root.getComponent(Label);
    if (label?.string === text) return root;
    for (const child of root.children) {
        const found = findLabelNodeByText(child, text);
        if (found) return found;
    }
    return null;
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
            if (getActiveLevel(this) < SKILL_UNLOCK_FREEZE) return;
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
                && this._adRewardFreezeHintShown
                && !this._adRewardFreezeEntryClicked
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
            const glow = ensureGlowNode(shell, 'AdRewardFreezeGlow', 9, 92, 92);
            this._adRewardFreezeGlowNode = glow;
            glow.active = true;
            const opacity = glow.getComponent(UIOpacity) || glow.addComponent(UIOpacity);
            opacity.opacity = 255;
            Tween.stopAllByTarget(glow);
            Tween.stopAllByTarget(opacity);
            const pulseRepeat = Math.ceil(FREEZE_HINT_DURATION_SECONDS / 0.64);
            tween(opacity).to(0.32, { opacity: 120 }).to(0.32, { opacity: 255 }).union().repeat(pulseRepeat).start();
            tween(glow)
                .to(0.32, { scale: new Vec3(1.05, 1.05, 1) })
                .to(0.32, { scale: new Vec3(1, 1, 1) })
                .union()
                .repeat(pulseRepeat)
                .delay(0.2)
                .call(() => this.clearAdRewardFreezeHintVisual?.())
                .start();

            const icon = shell.getChildByName('ToolIcon');
            if (icon?.isValid) playShake(icon, 4, 10, 1.05);
            const label = findLabelNodeByText(shell, '冻结时间');
            if (label?.isValid) playJump(label, 5, 8);
            this.scheduleOnce?.(() => {
                if (!this._adRewardFreezeHintShown || this._adRewardFreezeEntryClicked) return;
                if (icon?.isValid) playShake(icon, 2, 3, 1.025);
                if (label?.isValid) playJump(label, 3, 2);
            }, FREEZE_HINT_DURATION_SECONDS / 2);
            return true;
        },

        clearAdRewardFreezeHintVisual() {
            const glow = this._adRewardFreezeGlowNode as Node | null;
            this._adRewardFreezeGlowNode = null;
            removeNode(glow);
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
            this._adRewardFreezeEntryClicked = true;
            this.clearAdRewardFreezeHintVisual?.();
            return this.runRewardedGrant('freeze_rescue_60s', () => {
                if (this.isGameEnd) return false;
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
            ensureGlowNode(entry, 'AdRewardGiftGlow', 6, 94, 94);
            Tween.stopAllByTarget(entry);
            Tween.stopAllByTarget(opacity);
            entry.setScale(0.55, 0.55, 1);
            tween(entry)
                .to(0.18, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'backOut' })
                .to(0.1, { scale: new Vec3(1, 1, 1) })
                .delay(0.4)
                .repeatForever(tween(entry)
                    .to(0.28, { scale: new Vec3(1.08, 1.08, 1) })
                    .to(0.28, { scale: new Vec3(1, 1, 1) })
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
            playShake(button, 5, 4, 1.035);
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
            restoreTransform(button);
        },
    });
}
