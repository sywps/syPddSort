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
    POPUP_UI_TEXTURE_NAMES,
    SKILL_BUTTON_TEXTURE_NAMES,
    SKILL_UNLOCK_BROOM,
    SKILL_UNLOCK_MAGNET,
    SKILL_UNLOCK_WAND,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
} from './GameCtrlShared';
import { openCollectionShellOverlay } from './Panels/CollectionShellOverlay';

type AcquireResourceModalOptions = {
    title: string;
    description: string;
    buyLabel: string;
    buyCost: number;
    adLabel: string;
    onBought: () => void;
    onWatchAd: () => void;
    onCancel: () => void;
};

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
        return sprite;
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
                this.updateCountBadge(node, 0, false);
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
                    this.rebuildSkillButtonsUI();
                    handler(true);
                    return;
                }
                runtime._skillActive = true;
                runtime.showTrackedRewardedAd(skill.adType, (success: boolean) => {
                    if (!success) {
                        runtime._skillActive = false;
                        runtime.resumeTimerForProp();
                        return;
                    }
                    runtime._skillActive = false;
                    handler(true);
                }, { waitForCloseBeforeComplete: true });
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
                node.active = false;
                this.updateCountBadge(node, 0, false);
            }
        }
        if (!runtime.levelData || runtime.isGameEnd) {
            return;
        }
        this.buildSkillButtons(skillRoot);
    }

    updateCountBadge(parent: Node, count: number, showWhenZero: boolean = false) {
        const existing = parent.getChildByName('CountBadge');
        const shouldHide = count <= 0 && !showWhenZero;
        if (shouldHide) {
            if (existing?.isValid) {
                existing.active = false;
            }
            return;
        }

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
        bg.fillColor = new Color('#F05A5A');
        bg.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);
        bg.fill();

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
        const displayText = count > 99 ? '99+' : `${Math.max(0, count)}`;
        lblTransform.setContentSize(Math.max(18, badgeW - 8), Math.max(1, badgeH));
        lbl.string = displayText;
    }

    private requireTemplateNode(parent: Node, name: string): Node {
        const node = parent.getChildByName(name);
        if (!node) {
            throw new Error(`[skill-ui-template] missing node: ${name}`);
        }
        node.active = true;
        return node;
    }

    private fillTemplateLabel(
        node: Node,
        text: string,
        fontSize: number,
        color: Color,
        width: number,
        height: number,
    ): Label {
        (node.getComponent(UITransform) || node.addComponent(UITransform)).setContentSize(width, height);
        const label = node.getComponent(Label);
        if (!label) {
            throw new Error(`[skill-ui-template] missing Label on ${node.name}`);
        }
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.max(fontSize + 4, height);
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private configureTemplateButton(
        node: Node,
        labelName: string,
        text: string,
        frame: SpriteFrame,
        width: number,
        height: number,
        color: Color,
        fontSize: number,
        onClick: () => void,
    ) {
        const runtime = this.runtime;
        node.active = true;
        runtime._applySpriteFrame(node, frame, width, height);
        const sprite = node.getComponent(Sprite);
        if (sprite) sprite.color = color;
        const labelNode = this.requireTemplateNode(node, labelName);
        this.fillTemplateLabel(labelNode, text, fontSize, Color.WHITE, Math.max(1, width - 32), Math.max(1, height - 20));
        runtime.bindPanelButton(node, onClick);
    }

    private getSkillGuideIconFrameName(skillName: string): string {
        if (skillName === '刷子') return 'popup_tool_brush_icon';
        if (skillName === '磁铁') return 'popup_tool_magnet_icon';
        return 'popup_tool_wand_icon';
    }

    private configureSkillGuideIcon(content: Node, skillName: string): void {
        const runtime = this.runtime;
        const plateFrame = runtime.getSF('popup_result_preview_plate');
        const iconFrame = runtime.getSF(this.getSkillGuideIconFrameName(skillName));
        if (!plateFrame) {
            throw new Error('[skill-guide] missing sprite frame: popup_result_preview_plate');
        }
        if (!iconFrame) {
            throw new Error(`[skill-guide] missing sprite frame: ${this.getSkillGuideIconFrameName(skillName)}`);
        }

        const slot = this.requireTemplateNode(content, 'CollectionCardSlot_0');
        slot.setPosition(0, 132, 0);
        (slot.getComponent(UITransform) || slot.addComponent(UITransform)).setContentSize(190, 150);
        const card = this.requireTemplateNode(slot, 'Card');
        const frame = this.requireTemplateNode(card, 'CardFrame');
        runtime._applySpriteFrame(frame, plateFrame, 180, 140, Sprite.Type.SLICED);

        const labelNode = card.getChildByName('Lbl');
        if (labelNode) labelNode.active = false;
        const tapHintNode = card.getChildByName('TapHint');
        if (tapHintNode) tapHintNode.active = false;

        let iconNode = frame.getChildByName('SkillGuideIcon');
        if (!iconNode) {
            iconNode = new Node('SkillGuideIcon');
            frame.addChild(iconNode);
            iconNode.addComponent(UITransform);
        }
        iconNode.active = true;
        iconNode.layer = Layers.Enum.UI_2D;
        iconNode.setPosition(0, 2, 0);
        runtime._applySpriteFrame(iconNode, iconFrame, 88, 88);
    }

    showAcquireResourceModal(opt: AcquireResourceModalOptions) {
        const runtime = this.runtime;
        runtime._ensureSpriteFramesByName(POPUP_UI_TEXTURE_NAMES, () => this.openAcquireResourceModalWithReadyFrames(opt));
    }

    private openAcquireResourceModalWithReadyFrames(opt: AcquireResourceModalOptions) {
        const runtime = this.runtime;
        openCollectionShellOverlay(runtime, {
            overlayName: 'AcquireResourceOverlay',
            siblingIndex: 1000,
            onClose: opt.onCancel,
            onReady: ({ overlay, box, close }) => {
                const destroyOverlay = () => {
                    if (overlay.isValid) overlay.destroy();
                };
                const primaryButtonFrame = runtime.getSF('popup_primary_button');
                const secondaryButtonFrame = runtime.getSF('popup_secondary_button');
                if (!primaryButtonFrame) {
                    throw new Error('[acquire-modal] missing sprite frame: popup_primary_button');
                }
                if (!secondaryButtonFrame) {
                    throw new Error('[acquire-modal] missing sprite frame: popup_secondary_button');
                }

                const titleNode = this.requireTemplateNode(box, 'AcquireTitle');
                this.fillTemplateLabel(titleNode, opt.title, 32, new Color('#5A4A3A'), 360, 40);
                const descNode = this.requireTemplateNode(box, 'AcquireDesc');
                this.fillTemplateLabel(descNode, opt.description, 20, new Color('#8A7A6A'), 420, 72);

                const buyBtn = this.requireTemplateNode(box, 'AcquireBuyBtn');
                this.configureTemplateButton(buyBtn, 'AcquireBuyLbl', opt.buyLabel, secondaryButtonFrame, 200, 56, Color.WHITE, 22, () => {
                    AudioMgr.inst.play('button');
                    if (!runtime.spendGold(opt.buyCost)) {
                        runtime.showToast(`金币不足，还差 ${opt.buyCost - runtime.getGold()} 金币`);
                        return;
                    }
                    destroyOverlay();
                    opt.onBought();
                });

                const adBtn = this.requireTemplateNode(box, 'AcquireAdBtn');
                this.configureTemplateButton(adBtn, 'AcquireAdLbl', opt.adLabel, primaryButtonFrame, 200, 56, Color.WHITE, 22, () => {
                    AudioMgr.inst.play('button');
                    destroyOverlay();
                    opt.onWatchAd();
                });

                const cancelBtn = this.requireTemplateNode(box, 'AcquireCancelBtn');
                this.configureTemplateButton(cancelBtn, 'AcquireCancelLbl', '取消', secondaryButtonFrame, 180, 46, Color.WHITE, 20, close);
            },
        });
    }

    showSkillUnlockGuide(skillName: string, onDone: () => void) {
        const runtime = this.runtime;
        const requiredTextures = Array.from(new Set([...POPUP_UI_TEXTURE_NAMES, ...SKILL_BUTTON_TEXTURE_NAMES]));
        runtime._ensureSpriteFramesByName(requiredTextures, () => this.openSkillUnlockGuideWithReadyFrames(skillName, onDone));
    }

    private openSkillUnlockGuideWithReadyFrames(skillName: string, onDone: () => void) {
        const runtime = this.runtime;
        openCollectionShellOverlay(runtime, {
            overlayName: 'SkillGuideOverlay',
            title: '道具解锁',
            siblingIndex: 999,
            onClose: onDone,
            onReady: ({ overlay, box, content, close }) => {
                const descMap: Record<string, string> = {
                    '魔法棒': '在棋盘上框选区域，框内豆豆自动归位',
                    '刷子': '清空暂存槽，所有豆豆飞回正确位置',
                    '磁铁': '随机选一种颜色，全部快速归位',
                };
                this.configureSkillGuideIcon(content, skillName);

                const titleNode = this.requireTemplateNode(content, 'SkillGuideTitle');
                titleNode.setPosition(0, 24, 0);
                this.fillTemplateLabel(titleNode, `${skillName} 已解锁`, 28, new Color('#D4740F'), 460, 50);

                const descNode = this.requireTemplateNode(content, 'SkillGuideDesc');
                descNode.setPosition(0, -48, 0);
                this.fillTemplateLabel(descNode, descMap[skillName] || '', 22, new Color('#5A4A3A'), 460, 72);

                const freeNode = this.requireTemplateNode(content, 'SkillGuideFree');
                freeNode.setPosition(0, -112, 0);
                this.fillTemplateLabel(freeNode, '首次免费使用，点击任意位置开始', 20, new Color(100, 180, 80, 255), 420, 36);

                tween(box).to(0.2, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' }).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
                box.on(Node.EventType.TOUCH_END, () => {
                    if (!overlay.isValid) return;
                    close();
                }, runtime);
            },
        });
    }
}

export function ensureGameplaySkillUiController(runtime: any): GameplaySkillUiController {
    if (!runtime._gameplaySkillUiController) {
        runtime._gameplaySkillUiController = new GameplaySkillUiController(runtime);
    }
    return runtime._gameplaySkillUiController as GameplaySkillUiController;
}
