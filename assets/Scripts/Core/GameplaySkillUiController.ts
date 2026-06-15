import {
    AudioMgr,
    Button,
    Color,
    ECONOMY_NUMERIC_TABLE,
    Graphics,
    Label,
    Layers,
    LS_SKILL_BROOM_USED,
    LS_SKILL_MAGNET_USED,
    LS_SKILL_WAND_USED,
    Node,
    SKILL_UNLOCK_BROOM,
    SKILL_UNLOCK_MAGNET,
    SKILL_UNLOCK_WAND,
    Sprite,
    UIOpacity,
    UITransform,
    Vec3,
} from './GameCtrlShared';

export class GameplaySkillUiController {
    constructor(private readonly runtime: any) {}

    private readonly skillShellKinds = ['wand', 'brush', 'magnet'] as const;

    private getSkillShellName(kind: 'wand' | 'brush' | 'magnet'): string {
        if (kind === 'wand') return 'SkillWand';
        if (kind === 'brush') return 'SkillBrush';
        return 'SkillMagnet';
    }

    private captureSkillAreaSceneLayout(root: Node): { x: number; y: number; z: number; topOffset: number } {
        let topOffset = Number.NEGATIVE_INFINITY;
        for (const kind of this.skillShellKinds) {
            const shell = this.runtime.requireUiChild(root, this.getSkillShellName(kind), `SkillArea/${this.getSkillShellName(kind)}`);
            const transform = shell.getComponent(UITransform);
            if (!transform) {
                throw new Error(`[GameplayScene] Game.scene is missing UITransform component on SkillArea/${shell.name}`);
            }
            const halfH = transform.contentSize.height * Math.abs(shell.scale.y || 1) / 2;
            topOffset = Math.max(topOffset, shell.position.y + halfH);
        }
        if (!Number.isFinite(topOffset)) {
            throw new Error('[GameplayScene] Game.scene has invalid SkillArea layout anchors');
        }
        return {
            x: root.position.x,
            y: root.position.y,
            z: root.position.z,
            topOffset,
        };
    }

    getSkillAreaTopY(): number {
        const fallbackTopY = -615 + 66;
        if (typeof this.runtime.getGameplayBottomHudChild !== 'function' || typeof this.runtime.getGameplayFixedRoot !== 'function') {
            return fallbackTopY;
        }
        const root = this.runtime.getGameplayBottomHudChild('SkillArea');
        if (!root?.isValid) {
            return fallbackTopY;
        }
        const layout = this.captureSkillAreaSceneLayout(root);
        const rootUi = root.getComponent(UITransform);
        const fixedRoot = this.runtime.getGameplayFixedRoot();
        const fixedUi = fixedRoot?.getComponent(UITransform);
        if (rootUi && fixedUi) {
            const worldTop = rootUi.convertToWorldSpaceAR(new Vec3(0, layout.topOffset, 0));
            return fixedUi.convertToNodeSpaceAR(worldTop).y;
        }
        return root.position.y + layout.topOffset;
    }

    private configureSkillShell(node: Node) {
        node.active = true;
        node.layer = Layers.Enum.UI_2D;
        const transform = node.getComponent(UITransform);
        if (!transform) {
            throw new Error(`[GameplayScene] Game.scene is missing UITransform component on SkillArea/${node.name}`);
        }
        const sprite = node.getComponent(Sprite);
        if (!sprite) {
            throw new Error(`[GameplayScene] Game.scene is missing Sprite component on SkillArea/${node.name}`);
        }
        if (!sprite.spriteFrame) {
            throw new Error(`[GameplayScene] Game.scene must provide SpriteFrame on SkillArea/${node.name}`);
        }
        const icon = node.getChildByName('ToolIcon');
        if (!icon?.isValid) {
            throw new Error(`[GameplayScene] Game.scene is missing SkillArea/${node.name}/ToolIcon`);
        }
        icon.active = true;
        icon.layer = Layers.Enum.UI_2D;
        const iconSprite = icon.getComponent(Sprite);
        if (!iconSprite) {
            throw new Error(`[GameplayScene] Game.scene is missing Sprite component on SkillArea/${node.name}/ToolIcon`);
        }
        if (!iconSprite.spriteFrame) {
            throw new Error(`[GameplayScene] Game.scene must provide SpriteFrame on SkillArea/${node.name}/ToolIcon`);
        }
        const adPlayIcon = this.requireSkillAdPlayIcon(node);
        adPlayIcon.active = false;
        return sprite;
    }

    private requireSkillAdPlayIcon(parent: Node): Node {
        const adPlayIcon = parent.getChildByName('AdPlayIcon');
        if (!adPlayIcon?.isValid) {
            throw new Error(`[GameplayScene] Game.scene is missing ${parent.name}/AdPlayIcon`);
        }
        adPlayIcon.layer = Layers.Enum.UI_2D;
        const transform = adPlayIcon.getComponent(UITransform);
        if (!transform) {
            throw new Error(`[GameplayScene] Game.scene is missing UITransform component on ${parent.name}/AdPlayIcon`);
        }
        const sprite = adPlayIcon.getComponent(Sprite);
        if (!sprite) {
            throw new Error(`[GameplayScene] Game.scene is missing Sprite component on ${parent.name}/AdPlayIcon`);
        }
        if (!sprite.spriteFrame) {
            throw new Error(`[GameplayScene] Game.scene must provide SpriteFrame on ${parent.name}/AdPlayIcon`);
        }
        return adPlayIcon;
    }

    private runAfterAdUiSettled(callback: () => void): void {
        const runtime = this.runtime;
        const run = () => {
            if (!runtime?.isValid) return;
            callback();
        };
        if (typeof runtime?.scheduleOnce === 'function') {
            runtime.scheduleOnce(run, 0.12);
            return;
        }
        run();
    }

    buildSkillButtons(root: Node) {
        const runtime = this.runtime;
        const skills = [
            { kind: 'wand' as const, label: '魔法棒', unlockLevel: SKILL_UNLOCK_WAND, lsKey: LS_SKILL_WAND_USED, goldCost: ECONOMY_NUMERIC_TABLE.purchaseCost.magicWand, adType: 'skill_魔法棒', handler: (timerAlreadyPaused?: boolean) => runtime.useSkillClearArea(timerAlreadyPaused) },
            { kind: 'brush' as const, label: '刷子', unlockLevel: SKILL_UNLOCK_BROOM, lsKey: LS_SKILL_BROOM_USED, goldCost: ECONOMY_NUMERIC_TABLE.purchaseCost.brush, adType: 'skill_刷子', preCheck: () => runtime.slotHasBeans(), handler: (timerAlreadyPaused?: boolean) => runtime.useSkillClearSlot(timerAlreadyPaused) },
            { kind: 'magnet' as const, label: '磁铁', unlockLevel: SKILL_UNLOCK_MAGNET, lsKey: LS_SKILL_MAGNET_USED, goldCost: ECONOMY_NUMERIC_TABLE.purchaseCost.magnet, adType: 'skill_磁铁', handler: (timerAlreadyPaused?: boolean) => runtime.useSkillClearColor(timerAlreadyPaused) },
        ];

        const currentLevel = runtime.getActiveLogicalLevelId();
        if (currentLevel < 2) {
            for (const kind of ['wand', 'brush', 'magnet'] as const) {
                const node = root.getChildByName(this.getSkillShellName(kind));
                if (!node?.isValid) continue;
                node.active = false;
                this.updateCountBadge(node, 0, true);
                node.targetOff(runtime);
            }
            return;
        }

        for (let i = 0; i < skills.length; i++) {
            const skill = skills[i];
            const shell = runtime.requireUiChild(root, this.getSkillShellName(skill.kind), `SkillArea/${this.getSkillShellName(skill.kind)}`);
            const shellOpacity = shell.getComponent(UIOpacity) || shell.addComponent(UIOpacity);
            this.configureSkillShell(shell);
            const button = shell.getComponent(Button) || shell.addComponent(Button);
            shell.targetOff(runtime);

            if (currentLevel < skill.unlockLevel) {
                shellOpacity.opacity = 138;
                this.updateCountBadge(shell, 0, false);
                button.enabled = true;
                shell.on(Button.EventType.CLICK, () => {
                    AudioMgr.inst.play('button');
                    runtime.showToast(`${skill.label}第${skill.unlockLevel}关解锁`, 1.5);
                }, runtime);
                continue;
            }

            shellOpacity.opacity = 255;
            const inventoryCount = runtime.getPropCount(skill.kind);
            this.updateCountBadge(shell, inventoryCount, true);

            const handler = skill.handler;
            const preCheck = skill.preCheck;
            button.enabled = true;
            shell.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                if (runtime.isGameEnd || runtime._skillActive) return;
                if (runtime.isSelected || runtime.currentBlock) {
                    runtime.cancelSelection();
                }
                runtime.pauseTimerForProp();
                if (preCheck && !preCheck()) {
                    runtime.showToast('暂存槽没有豆豆');
                    runtime.resumeTimerForProp();
                    return;
                }
                if (runtime.consumePropCount(skill.kind)) {
                    runtime.markDynamicCountdownAssisted?.();
                    this.rebuildSkillButtonsUI();
                    handler(true);
                    return;
                }
                runtime._skillActive = true;
                const rewardStarted = runtime.runRewardedGrant(skill.adType, () => {
                    return new Promise<void>((resolve, reject) => {
                        this.runAfterAdUiSettled(() => {
                            try {
                                runtime._skillActive = false;
                                runtime.markDynamicCountdownAssisted?.();
                                handler(true);
                                resolve();
                            } catch (error) {
                                runtime._skillActive = false;
                                reject(error);
                            }
                        });
                    });
                }, {
                    busyFlag: '_rewardedSkillAdShowing',
                    waitForCloseBeforeComplete: true,
                    onAdFail: () => {
                        runtime._skillActive = false;
                        this.runAfterAdUiSettled(() => runtime.resumeTimerForProp());
                    },
                    grantFailToast: '道具使用失败，请重试',
                });
                if (!rewardStarted) {
                    runtime._skillActive = false;
                }
            }, runtime);
        }
    }

    rebuildSkillButtonsUI() {
        const runtime = this.runtime;
        const skillNodeNames = ['SkillWand', 'SkillBrush', 'SkillMagnet'];
        const skillRoot = runtime.getGameplayBottomHudChild('SkillArea');
        for (const name of skillNodeNames) {
            const node = skillRoot.getChildByName(name);
            if (node?.isValid) {
                node.targetOff(runtime);
            }
        }
        if (!runtime.levelData || runtime.isGameEnd) {
            for (const name of skillNodeNames) {
                const node = skillRoot.getChildByName(name);
                if (node?.isValid) {
                    node.active = false;
                    this.updateCountBadge(node, 0, true);
                }
            }
            return;
        }
        this.buildSkillButtons(skillRoot);
    }

    updateCountBadge(parent: Node, count: number, showWhenZero: boolean = false) {
        const existing = parent.getChildByName('CountBadge');
        if (count <= 0) {
            if (existing?.isValid) {
                existing.active = false;
            }
            const adPlayIcon = this.requireSkillAdPlayIcon(parent);
            adPlayIcon.active = showWhenZero;
            return;
        }

        const adPlayIcon = this.requireSkillAdPlayIcon(parent);
        adPlayIcon.active = false;

        const badge = existing;
        if (!badge) {
            throw new Error(`[GameplayScene] Game.scene is missing ${parent.name}/CountBadge`);
        }
        badge.active = true;
        badge.layer = Layers.Enum.UI_2D;
        const badgeTransform = badge.getComponent(UITransform);
        if (!badgeTransform) {
            throw new Error(`[GameplayScene] Game.scene is missing UITransform component on ${parent.name}/CountBadge`);
        }
        const badgeW = badgeTransform.contentSize.width;
        const badgeH = badgeTransform.contentSize.height;
        if (badgeW <= 0 || badgeH <= 0) {
            throw new Error(`[GameplayScene] Game.scene has invalid CountBadge size on ${parent.name}`);
        }
        let bg = badge.getComponent(Graphics);
        if (!bg) {
            bg = badge.addComponent(Graphics);
        }
        bg.clear();
        const radius = Math.min(badgeW, badgeH) / 2;
        const strokeWidth = Math.max(2, Math.round(radius * 0.18));
        bg.fillColor = new Color('#43C04F');
        bg.strokeColor = new Color('#000000');
        bg.lineWidth = strokeWidth;
        bg.circle(0, 0, radius - strokeWidth / 2);
        bg.fill();
        bg.stroke();

        let lblNode = badge.getChildByName('CountBadgeLbl');
        if (!lblNode) {
            throw new Error(`[GameplayScene] Game.scene is missing ${parent.name}/CountBadge/CountBadgeLbl`);
        }
        lblNode.active = true;
        lblNode.layer = Layers.Enum.UI_2D;
        const lblTransform = lblNode.getComponent(UITransform);
        if (!lblTransform) {
            throw new Error(`[GameplayScene] Game.scene is missing UITransform component on ${parent.name}/CountBadge/CountBadgeLbl`);
        }
        const lbl = lblNode.getComponent(Label);
        if (!lbl) {
            throw new Error(`[GameplayScene] Game.scene is missing Label component on ${parent.name}/CountBadge/CountBadgeLbl`);
        }
        lbl.overflow = Label.Overflow.SHRINK;
        lbl.enableWrapText = false;
        const displayText = count > 99 ? '99+' : `${count}`;
        lblTransform.setContentSize(Math.max(18, badgeW - 8), Math.max(1, badgeH));
        lbl.string = displayText;
    }

}

export function ensureGameplaySkillUiController(runtime: any): GameplaySkillUiController {
    if (!runtime._gameplaySkillUiController) {
        runtime._gameplaySkillUiController = new GameplaySkillUiController(runtime);
    }
    return runtime._gameplaySkillUiController as GameplaySkillUiController;
}
