import {
    Node,
    SKILL_UNLOCK_FREEZE,
    tween,
    Tween,
    UIOpacity,
    Vec3,
} from '../GameCtrlShared';
import { isGameplaySkillUnlocked } from '../SlotOnboardingPolicy';

const FREEZE_HINT_REMAIN_SECONDS = 60;
const FREEZE_HINT_EXPIRE_SECONDS = 30;
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

export function installGameplayAdRewardHintModule(target: any): void {
    Object.assign(target, {
        resetAdRewardHintState(timeLimit?: number) {
            this.clearAdRewardHintVisuals?.();
            this._adRewardInitialTimeLimit = Math.max(0, Math.floor(Number(timeLimit ?? this.timeRemain) || 0));
            this._adRewardFreezeHintShown = false;
            this._adRewardFreezeEntryClicked = false;
            this._slotAddReminderCount = 0;
            this._slotAddReminderLastAt = 0;
            this._slotAddReminderFirstFullShown = false;
            this._slotAddReminderHalfTimeShown = false;
        },

        clearAdRewardHintVisuals() {
            this.clearAdRewardFreezeHintVisual?.();
            this.clearAdRewardSlotAddReminderVisuals?.();
        },

        checkAdRewardTimedHints() {
            if (!isTimerGameplay(this) || this._adShowing) return;
            if (!isGameplaySkillUnlocked(getActiveLevel(this), getActiveEntryMode(this), SKILL_UNLOCK_FREEZE)) return;
            const initialTime = Number(this._adRewardInitialTimeLimit) || Number(this.timeRemain) || 0;
            const remain = Math.floor(Number(this.timeRemain) || 0);
            if (!this._adRewardFreezeHintShown && initialTime >= FREEZE_HINT_REMAIN_SECONDS && remain <= FREEZE_HINT_REMAIN_SECONDS && remain > FREEZE_HINT_EXPIRE_SECONDS) {
                this.armAdRewardFreezeRescue?.();
            }
            if (!this._slotAddReminderHalfTimeShown && initialTime > 0 && remain <= Math.floor(initialTime / 2)) {
                this._slotAddReminderHalfTimeShown = true;
                this.triggerSlotAddReminder?.('half-time');
            }
        },

        armAdRewardFreezeRescue() {
            const skillRoot = typeof this.getGameplayBottomHudChild === 'function' ? this.getGameplayBottomHudChild('SkillArea') : null;
            const shell = skillRoot?.getChildByName('SkillFreeze');
            if (!shell?.isValid || !shell.activeInHierarchy) return false;
            // Preserve the direct-use ad entry without a countdown bubble or scale pulse.
            this._adRewardFreezeHintShown = true;
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
                grantFailToast: '冻结时间生效失败，请重试',
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
