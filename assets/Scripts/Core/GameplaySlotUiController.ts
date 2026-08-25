import {
    AudioMgr,
    Button,
    GUIDE_HAND_BOX_SIZE,
    GUIDE_HAND_SPRITE_SIZE,
    Label,
    Layers,
    LS_EXPAND_USED,
    MAINLINE_SLOT_GROOVE_TEXTURE,
    MAINLINE_SLOT_LOCK_DASH_TEXTURE,
    MAINLINE_SLOT_LOCK_MASK_HEIGHT,
    MAINLINE_SLOT_LOCK_MASK_TEXTURE,
    MAINLINE_SLOT_LOCK_MASK_WIDTH,
    MAINLINE_SLOT_LOCK_ROW_HEIGHT,
    MAINLINE_SLOT_LOCK_ROW_WIDTH,
    MAINLINE_SLOT_MARKER_HEIGHT,
    MAINLINE_SLOT_MARKER_LOCKED_OPACITY,
    MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY,
    MAINLINE_SLOT_MARKER_WIDTH,
    MAINLINE_SLOT_PANEL_EXTRA_HEIGHT,
    MAINLINE_SLOT_PANEL_TEXTURE,
    Node,
    PerformanceMgr,
    SLOT_AREA_CENTER_Y,
    SLOTS_PER_ROW,
    SLOT_ROW_BG_WIDTH,
    Sprite,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    sys,
    tween,
} from './GameCtrlShared';
import { ensureGameplaySkillUiController } from './GameplaySkillUiController';
import {
    getSlotUnlockMode,
    getSlotUnlockModeForPolicy,
    shouldAppendLockedSlotRowAfterUnlock,
    shouldShowGameplaySkillArea,
} from './SlotOnboardingPolicy';
import type { SlotUnlockMode } from './SlotOnboardingPolicy';
import { Widget } from 'cc';

const LOCKED_SLOT_PREVIEW_OPACITY = 168;
const MAINLINE_SCENE_BASE_ROW_COUNT = 2;

type SlotShellSceneLayout = {
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
};

export class GameplaySlotUiController {
    constructor(private readonly runtime: any) {}

    buildSlotArea(root: Node) {
        const runtime = this.runtime;
        runtime.slotAreaNode = runtime.requireUiChild(root, 'SlotArea', 'SlotAreaGroup/SlotArea');
        this.captureSlotAreaSceneAnchor();
        this.applySlotAreaTransform();
        runtime.slotAreaNode.layer = Layers.Enum.UI_2D;
        runtime.slotAreaNode.active = runtime.shouldShowSlotArea();
        this.rebuildSlotNodes();
    }

    private captureSlotAreaSceneAnchor() {
        const runtime = this.runtime;
        if (typeof runtime._slotAreaSceneBasePanelBottomY === 'number') return;
        const slotAreaWidget = runtime.slotAreaNode.getComponent(Widget);
        if (!slotAreaWidget) {
            throw new Error('[GameplayScene] Game.scene is missing Widget component on SlotArea');
        }
        slotAreaWidget.updateAlignment?.();
        const slotAreaUi = runtime.slotAreaNode.getComponent(UITransform);
        if (!slotAreaUi) {
            throw new Error('[GameplayScene] Game.scene is missing UITransform component on SlotArea');
        }
        const panel = runtime.slotAreaNode.getChildByName('SlotPanel');
        const panelUi = panel?.getComponent(UITransform);
        if (!panel?.isValid || !panelUi) {
            throw new Error('[GameplayScene] Game.scene is missing SlotArea/SlotPanel anchor');
        }
        const slotAreaPos = runtime.slotAreaNode.position;
        const slotAreaScale = runtime.slotAreaNode.scale;
        const slotAreaScaleY = Math.abs(slotAreaScale.y || 1);
        runtime._slotAreaSceneBaseX = slotAreaPos.x;
        runtime._slotAreaSceneBaseY = slotAreaPos.y;
        runtime._slotAreaSceneBaseZ = slotAreaPos.z;
        runtime._slotAreaSceneScaleX = slotAreaScale.x;
        runtime._slotAreaSceneScaleY = slotAreaScale.y;
        runtime._slotAreaSceneScaleZ = slotAreaScale.z;
        runtime._slotAreaSceneBaseWidth = slotAreaUi.contentSize.width;
        runtime._slotAreaSceneBaseHeight = slotAreaUi.contentSize.height;
        runtime._slotAreaSceneBaseRowCount = MAINLINE_SCENE_BASE_ROW_COUNT;
        runtime._slotAreaScenePanelLocalX = panel.position.x;
        runtime._slotAreaScenePanelLocalY = panel.position.y;
        runtime._slotAreaScenePanelLocalZ = panel.position.z;
        runtime._slotAreaScenePanelWidth = panelUi.contentSize.width;
        runtime._slotAreaScenePanelHeight = panelUi.contentSize.height;
        runtime._slotAreaSceneBasePanelBottomY = slotAreaPos.y + (panel.position.y - panelUi.contentSize.height / 2) * slotAreaScaleY;
        const singleRowPanel = runtime.slotAreaNode.getChildByName('SlotPanelSingleRow');
        const singleRowPanelUi = singleRowPanel?.getComponent(UITransform);
        if (!singleRowPanel?.isValid || !singleRowPanelUi) {
            throw new Error('[GameplayScene] Game.scene is missing SlotArea/SlotPanelSingleRow anchor');
        }
        runtime._slotAreaSceneSingleRowPanelLocalX = singleRowPanel.position.x;
        runtime._slotAreaSceneSingleRowPanelLocalY = singleRowPanel.position.y;
        runtime._slotAreaSceneSingleRowPanelLocalZ = singleRowPanel.position.z;
        runtime._slotAreaSceneSingleRowPanelWidth = singleRowPanelUi.contentSize.width;
        runtime._slotAreaSceneSingleRowPanelHeight = singleRowPanelUi.contentSize.height;
        const shellLayouts: Array<SlotShellSceneLayout | null> = [];
        const maxSceneSlots = runtime.getMaxSlotRows() * SLOTS_PER_ROW;
        for (let i = 0; i < maxSceneSlots; i++) {
            const shell = panel.getChildByName(this.getSlotShellName(i));
            if (!shell?.isValid) {
                continue;
            }
            const shellUi = shell.getComponent(UITransform);
            if (!shellUi) {
                throw new Error(`[GameplayScene] Game.scene is missing UITransform component on SlotArea/SlotPanel/${this.getSlotShellName(i)}`);
            }
            shellLayouts[i] = {
                x: shell.position.x,
                y: shell.position.y,
                z: shell.position.z,
                width: shellUi.contentSize.width,
                height: shellUi.contentSize.height,
            };
        }
        runtime._slotAreaSceneShellLayouts = shellLayouts;
        if (!runtime.shouldUseMainlineSlotUI()) return;

        const firstRowShell = panel.getChildByName('SlotShell_0');
        const secondRowShell = panel.getChildByName('SlotShell_12');
        if (!firstRowShell?.isValid || !secondRowShell?.isValid) {
            throw new Error('[GameplayScene] Game.scene is missing SlotPanel row spacing anchors');
        }
        const sceneRowSpacing = Math.abs(firstRowShell.position.y - secondRowShell.position.y);
        if (!Number.isFinite(sceneRowSpacing) || sceneRowSpacing <= 0) {
            throw new Error('[GameplayScene] Game.scene slot row spacing anchor is invalid');
        }
        runtime._slotAreaSceneRowSpacing = sceneRowSpacing;
        runtime._slotAreaSceneBaseRowCount = this.resolveSlotAreaSceneBaseRowCount(panelUi, sceneRowSpacing);
        const lockedRowCenterY = panel.position.y + secondRowShell.position.y;
        const captureOverlayLayout = (name: string) => {
            const node = runtime.slotAreaNode.getChildByName(name);
            const ui = node?.getComponent(UITransform);
            if (!node?.isValid || !ui) {
                throw new Error(`[GameplayScene] Game.scene is missing SlotArea/${name} layout anchor`);
            }
            return {
                x: node.position.x,
                yOffset: node.position.y - lockedRowCenterY,
                z: node.position.z,
                width: ui.contentSize.width,
                height: ui.contentSize.height,
                scaleX: node.scale.x,
                scaleY: node.scale.y,
                scaleZ: node.scale.z,
            };
        };
        runtime._slotAreaSceneLockMaskLayout = captureOverlayLayout('SlotRowLockMask');
        runtime._slotAreaSceneLockDashLayout = captureOverlayLayout('SlotRowLockDash');
        runtime._slotAreaSceneLockedBtnLayout = captureOverlayLayout('SlotRowLockedBtn');
    }

    private getFiniteNumber(value: any, fallback: number): number {
        return Number.isFinite(value) ? value : fallback;
    }

    private resolveSlotAreaSceneBaseRowCount(panelUi: UITransform, sceneRowSpacing: number): number {
        const runtime = this.runtime;
        if (!runtime.shouldUseMainlineSlotUI()) return 1;
        const panelHeight = panelUi.contentSize.height;
        const rowHeight = runtime.getSlotRowBgHeight();
        const spacing = Number(sceneRowSpacing);
        if (!Number.isFinite(panelHeight) || !Number.isFinite(rowHeight) || !Number.isFinite(spacing) || spacing <= 0) {
            return MAINLINE_SCENE_BASE_ROW_COUNT;
        }
        const sceneRows = Math.max(1, Math.round((panelHeight - MAINLINE_SLOT_PANEL_EXTRA_HEIGHT - rowHeight) / spacing + 1));
        return Math.max(MAINLINE_SCENE_BASE_ROW_COUNT, sceneRows);
    }

    private getSlotAreaSceneScaleY(): number {
        return Math.abs(this.getFiniteNumber(this.runtime._slotAreaSceneScaleY, this.runtime.getSlotAreaScale()) || 1);
    }

    private getSlotAreaBaseRowCount(): number {
        const fallback = this.runtime.shouldUseMainlineSlotUI() ? MAINLINE_SCENE_BASE_ROW_COUNT : 1;
        return Math.max(1, Math.floor(this.getFiniteNumber(this.runtime._slotAreaSceneBaseRowCount, fallback)));
    }

    private shouldUseSingleRowSlotPanel(rowCount: number = this.runtime.slotRowCount): boolean {
        const runtime = this.runtime;
        return runtime.shouldUseMainlineSlotUI()
            && this.getActiveGameplayEntryMode() === 'main'
            && runtime.getActiveLogicalLevelId() === 1
            && rowCount === 1
            && this.getFiniteNumber(runtime._slotAreaSceneSingleRowPanelHeight, 0) > 0;
    }

    private getSlotAreaExtraRowsLayoutHeight(rowCount: number = this.runtime.slotRowCount): number {
        if (this.shouldUseSingleRowSlotPanel(rowCount)) return 0;
        const extraRows = Math.max(0, rowCount - this.getSlotAreaBaseRowCount());
        return extraRows * this.runtime.getSlotRowSpacing();
    }

    private getFallbackSlotAreaLayoutHeight(rowCount: number = this.runtime.slotRowCount): number {
        const rowH = this.runtime.getSlotRowBgHeight();
        const rowSpacing = this.runtime.getSlotRowSpacing();
        return (rowCount - 1) * rowSpacing + rowH;
    }

    private getSlotAreaLayoutHeight(rowCount: number = this.runtime.slotRowCount): number {
        if (this.shouldUseSingleRowSlotPanel(rowCount)) {
            return this.getFiniteNumber(this.runtime._slotAreaSceneSingleRowPanelHeight, this.getFallbackSlotAreaLayoutHeight(1));
        }
        const baseHeight = this.getFiniteNumber(this.runtime._slotAreaSceneBaseHeight, this.getFallbackSlotAreaLayoutHeight(this.getSlotAreaBaseRowCount()));
        return baseHeight + this.getSlotAreaExtraRowsLayoutHeight(rowCount);
    }

    private getSlotPanelLayoutHeight(rowCount: number = this.runtime.slotRowCount): number {
        if (this.shouldUseSingleRowSlotPanel(rowCount)) {
            return this.getFiniteNumber(this.runtime._slotAreaSceneSingleRowPanelHeight, this.getFallbackSlotAreaLayoutHeight(1) + 14);
        }
        const fallbackHeight = this.getFallbackSlotAreaLayoutHeight(this.getSlotAreaBaseRowCount()) + 14;
        const baseHeight = this.getFiniteNumber(this.runtime._slotAreaScenePanelHeight, fallbackHeight);
        return baseHeight + this.getSlotAreaExtraRowsLayoutHeight(rowCount);
    }

    getSlotAreaVisualHeight(): number {
        return this.getSlotAreaLayoutHeight() * this.getSlotAreaSceneScaleY();
    }

    private getFallbackSlotAreaLocalCenterY(): number {
        const runtime = this.runtime;
        const extraRows = Math.max(0, runtime.slotRowCount - this.getSlotAreaBaseRowCount());
        const slotAreaScale = runtime.getSlotAreaScale();
        const legacyCenterY = SLOT_AREA_CENTER_Y + extraRows * runtime.getSlotRowSpacing() * slotAreaScale / 2;
        if (!runtime.shouldUseMainlineSlotUI() || !shouldShowGameplaySkillArea(runtime.getActiveLogicalLevelId(), this.getActiveGameplayEntryMode())) {
            return legacyCenterY;
        }
        const minGapToSkillArea = 20;
        const dynamicCenterY = runtime.getSkillAreaTopY() + minGapToSkillArea + runtime.getSlotAreaVisualHeight() / 2;
        return Math.max(legacyCenterY, dynamicCenterY);
    }

    private getSlotAreaLocalCenterY(): number {
        const baseY = this.getFiniteNumber(this.runtime._slotAreaSceneBaseY, this.getFallbackSlotAreaLocalCenterY());
        return baseY + this.getSlotAreaExtraRowsLayoutHeight() * this.getSlotAreaSceneScaleY() / 2;
    }

    private applySlotAreaTransform() {
        const runtime = this.runtime;
        const slotAreaWidget = runtime.slotAreaNode.getComponent(Widget);
        if (!slotAreaWidget) {
            throw new Error('[GameplayScene] Game.scene is missing Widget component on SlotArea');
        }
        const slotAreaUi = runtime.slotAreaNode.getComponent(UITransform);
        if (slotAreaUi) {
            const width = this.shouldUseSingleRowSlotPanel()
                ? this.getFiniteNumber(runtime._slotAreaSceneSingleRowPanelWidth, SLOT_ROW_BG_WIDTH)
                : this.getFiniteNumber(runtime._slotAreaSceneBaseWidth, SLOT_ROW_BG_WIDTH);
            slotAreaUi.setContentSize(width, this.getSlotAreaLayoutHeight());
        }
        const current = runtime.slotAreaNode.position;
        const z = typeof runtime._slotAreaSceneBaseZ === 'number' ? runtime._slotAreaSceneBaseZ : current.z;
        const scaleX = this.getFiniteNumber(runtime._slotAreaSceneScaleX, runtime.getSlotAreaScale());
        const scaleY = this.getFiniteNumber(runtime._slotAreaSceneScaleY, runtime.getSlotAreaScale());
        const scaleZ = this.getFiniteNumber(runtime._slotAreaSceneScaleZ, 1);
        runtime.slotAreaNode.setScale(scaleX, scaleY, scaleZ);
        runtime.slotAreaNode.setPosition(current.x, current.y, z);
        slotAreaWidget.updateAlignment?.();
    }

    private getSlotAreaCenterYInGameplayRoot(): number {
        const runtime = this.runtime;
        const bottomHudRoot = runtime.slotAreaNode?.parent?.parent;
        if (bottomHudRoot?.isValid && typeof runtime.applyGameplayBottomHudPosition === 'function') {
            runtime.applyGameplayBottomHudPosition(bottomHudRoot);
        }
        const slotUi = runtime.slotAreaNode?.getComponent(UITransform);
        const fixedRoot = typeof runtime.getGameplayFixedRoot === 'function'
            ? runtime.getGameplayFixedRoot()
            : runtime.slotAreaNode?.parent?.parent;
        const fixedUi = fixedRoot?.getComponent(UITransform);
        if (slotUi && fixedUi) {
            const worldCenter = slotUi.convertToWorldSpaceAR(new Vec3(0, 0, 0));
            return fixedUi.convertToNodeSpaceAR(worldCenter).y;
        }
        let y = runtime.slotAreaNode?.position?.y || this.getSlotAreaLocalCenterY();
        let parent = runtime.slotAreaNode?.parent || null;
        while (parent?.isValid && parent !== fixedRoot) {
            y += parent.position.y || 0;
            parent = parent.parent;
        }
        return y;
    }

    getSlotAreaCenterY(): number {
        if (this.runtime.slotAreaNode?.isValid) {
            this.applySlotAreaTransform();
            return this.getSlotAreaCenterYInGameplayRoot();
        }
        return this.getFallbackSlotAreaLocalCenterY();
    }

    private getSlotShellName(index: number): string {
        return `SlotShell_${index}`;
    }

    private getFallbackSlotLocalPosition(index: number, rowCount: number = this.runtime.slotRowCount): Vec3 {
        const row = Math.floor(index / SLOTS_PER_ROW);
        const col = index % SLOTS_PER_ROW;
        const x = (col - SLOTS_PER_ROW / 2 + 0.5) * this.runtime.getSlotCenterSpacing();
        return new Vec3(x, this.runtime.getSlotRowY(row, rowCount), 0);
    }

    private getSlotShellSceneLayout(index: number): SlotShellSceneLayout | null {
        return this.runtime._slotAreaSceneShellLayouts?.[index] || null;
    }

    getSlotLocalPosition(index: number, rowCount: number = this.runtime.slotRowCount): Vec3 {
        const layout = this.getSlotShellSceneLayout(index);
        if (!layout) {
            return this.getFallbackSlotLocalPosition(index, rowCount);
        }
        if (this.shouldUseSingleRowSlotPanel(rowCount)) {
            return new Vec3(layout.x, 0, layout.z);
        }
        if (rowCount === this.getSlotAreaBaseRowCount()) {
            return new Vec3(layout.x, layout.y, layout.z);
        }
        const fallback = this.getFallbackSlotLocalPosition(index, rowCount);
        return new Vec3(layout.x, fallback.y, layout.z);
    }

    private getSlotBeanNode(shell: Node): Node {
        const bean = shell.getChildByName('Bean');
        if (!bean?.isValid) {
            throw new Error(`[GameplayScene] Game.scene is missing ${shell.name}/Bean`);
        }
        return bean;
    }

    private getOrCreateSlotAreaSpriteChild(name: string): Node {
        const runtime = this.runtime;
        let child = runtime.slotAreaNode.getChildByName(name);
        if (!child?.isValid) {
            child = new Node(name);
            runtime.slotAreaNode.addChild(child);
        }
        if (!child.getComponent(UITransform)) {
            child.addComponent(UITransform);
        }
        if (!child.getComponent(Sprite)) {
            child.addComponent(Sprite);
        }
        return child;
    }

    private hideCountBadge(parent: Node) {
        const badge = parent.getChildByName('CountBadge');
        if (badge?.isValid) {
            badge.active = false;
        }
    }

    private getActiveGameplayEntryMode(): string {
        const runtime = this.runtime;
        return runtime._activeGameplayEntryMode
            || (runtime._currentExternalLevelFilePath ? 'external' : (runtime._isThemeLevel ? 'theme' : 'main'));
    }

    private getCurrentSlotUnlockMode(): SlotUnlockMode {
        const policyMode = getSlotUnlockModeForPolicy(this.runtime._activeSlotRowPolicy, this.runtime.slotUnlockedRows);
        if (policyMode === 'free' || policyMode === 'ad') return policyMode;
        return getSlotUnlockMode(this.runtime.getActiveLogicalLevelId(), this.getActiveGameplayEntryMode());
    }

    private shouldAppendLockedSlotRowAfterCurrentUnlock(): boolean {
        const policyValue = this.runtime._activeSlotRowPolicy?.appendLockedRowAfterUnlock;
        if (typeof policyValue === 'boolean') return policyValue;
        return shouldAppendLockedSlotRowAfterUnlock(this.runtime.getActiveLogicalLevelId(), this.getActiveGameplayEntryMode());
    }

    private getAllRowsUnlockTargetRowCount(): number {
        const runtime = this.runtime;
        const policy = runtime._activeSlotRowPolicy;
        if (!policy?.unlockAllRowsAtOnce) return Math.max(1, Math.floor(Number(runtime.slotRowCount) || 1));
        const configuredTarget = Math.floor(Number(policy.rowCount) || Number(runtime.slotRowCount) || 1);
        return Math.max(
            Math.max(1, Math.floor(Number(runtime.slotRowCount) || 1)),
            Math.min(runtime.getMaxSlotRows(), configuredTarget),
        );
    }

    private hasPendingAllRowsUnlock(): boolean {
        const policy = this.runtime._activeSlotRowPolicy;
        return !!policy?.unlockAllRowsAtOnce
            && this.getAllRowsUnlockTargetRowCount() > Math.max(1, Math.floor(Number(this.runtime.slotRowCount) || 1));
    }

    private destroyLegacySlotUnlockButtonText(buttonNode: Node) {
        const legacyLabel = buttonNode.getChildByName('SlotUnlockModeLabel');
        if (!legacyLabel?.isValid) return;
        legacyLabel.removeFromParent();
        legacyLabel.destroy();
    }

    private requireSlotUnlockAdIcon(buttonNode: Node): Node {
        const icon = buttonNode.getChildByName('SlotUnlockIconAd');
        if (!icon?.isValid) {
            throw new Error('[GameplayScene] Game.scene is missing SlotArea/SlotRowLockedBtn/SlotUnlockIconAd');
        }
        icon.layer = Layers.Enum.UI_2D;
        const transform = icon.getComponent(UITransform);
        if (!transform) {
            throw new Error('[GameplayScene] Game.scene is missing UITransform component on SlotArea/SlotRowLockedBtn/SlotUnlockIconAd');
        }
        const sprite = icon.getComponent(Sprite);
        if (!sprite) {
            throw new Error('[GameplayScene] Game.scene is missing Sprite component on SlotArea/SlotRowLockedBtn/SlotUnlockIconAd');
        }
        if (!sprite.spriteFrame) {
            throw new Error('[GameplayScene] Game.scene must provide SpriteFrame on SlotArea/SlotRowLockedBtn/SlotUnlockIconAd');
        }
        return icon;
    }

    private requireSlotUnlockLabel(buttonNode: Node, childName: string): Node {
        const label = buttonNode.getChildByName(childName);
        if (!label?.isValid) {
            throw new Error(`[GameplayScene] Game.scene is missing SlotArea/SlotRowLockedBtn/${childName}`);
        }
        const transform = label.getComponent(UITransform);
        if (!transform) {
            throw new Error(`[GameplayScene] Game.scene is missing UITransform component on SlotArea/SlotRowLockedBtn/${childName}`);
        }
        const labelComponent = label.getComponent(Label);
        if (!labelComponent) {
            throw new Error(`[GameplayScene] Game.scene is missing Label component on SlotArea/SlotRowLockedBtn/${childName}`);
        }
        label.layer = Layers.Enum.UI_2D;
        return label;
    }

    private syncSlotUnlockButtonLabels(buttonNode: Node, unlockMode: SlotUnlockMode) {
        const adLabel = this.requireSlotUnlockLabel(buttonNode, 'SlotUnlockLabel');
        const freeLabel = buttonNode.getChildByName('SlotUnlockLabelFree');
        const active = buttonNode.active;
        if (!freeLabel?.isValid) {
            adLabel.active = active;
            return;
        }
        this.requireSlotUnlockLabel(buttonNode, 'SlotUnlockLabelFree');
        adLabel.active = active && unlockMode === 'ad';
        freeLabel.active = active && unlockMode === 'free';
        if (freeLabel.active) {
            freeLabel.setPosition(0, freeLabel.position.y, freeLabel.position.z);
        }
    }

    private syncSlotUnlockButtonModeIcon(buttonNode: Node) {
        this.destroyLegacySlotUnlockButtonText(buttonNode);
        if (!this.runtime.shouldUseMainlineSlotUI()) return;
        const unlockMode = this.getCurrentSlotUnlockMode();
        this.syncSlotUnlockButtonLabels(buttonNode, unlockMode);
        const freeIcon = buttonNode.getChildByName('SlotUnlockIconFree');
        if (freeIcon?.isValid) {
            freeIcon.active = false;
        }
        const adIcon = this.requireSlotUnlockAdIcon(buttonNode);
        const adSprite = adIcon.getComponent(Sprite);
        const adTransform = adIcon.getComponent(UITransform);
        if (!adSprite || !adTransform) {
            throw new Error('[GameplayScene] SlotRowLockedBtn/SlotUnlockIconAd is missing Sprite or UITransform');
        }
        if (!adSprite.spriteFrame) {
            throw new Error('[GameplayScene] Game.scene must provide SpriteFrame on SlotArea/SlotRowLockedBtn/SlotUnlockIconAd');
        }
        adIcon.active = buttonNode.active && unlockMode === 'ad';
    }

    private applyMainlineLockLayout(node: Node, layout: any, rowCenterY: number, fallbackWidth: number, fallbackHeight: number) {
        const x = Number.isFinite(layout?.x) ? layout.x : 0;
        const yOffset = Number.isFinite(layout?.yOffset) ? layout.yOffset : 0;
        const z = Number.isFinite(layout?.z) ? layout.z : 0;
        const width = Number.isFinite(layout?.width) && layout.width > 0 ? layout.width : fallbackWidth;
        const height = Number.isFinite(layout?.height) && layout.height > 0 ? layout.height : fallbackHeight;
        const scaleX = Number.isFinite(layout?.scaleX) ? layout.scaleX : 1;
        const scaleY = Number.isFinite(layout?.scaleY) ? layout.scaleY : 1;
        const scaleZ = Number.isFinite(layout?.scaleZ) ? layout.scaleZ : 1;
        node.setPosition(x, rowCenterY + yOffset, z);
        node.setScale(scaleX, scaleY, scaleZ);
        node.getComponent(UITransform)?.setContentSize(width, height);
    }

    rebuildSlotNodes() {
        const runtime = this.runtime;
        runtime.slotNodes = [];
        runtime.slotMarkerNodes = [];

        const totalSlots = runtime.slotModel.totalCount;
        const rowCount = runtime.slotRowCount;
        const maxRows = runtime.getMaxSlotRows();
        this.applySlotAreaTransform();

        const panel = runtime.requireUiChild(runtime.slotAreaNode, 'SlotPanel', 'SlotArea/SlotPanel');
        const singleRowSlotPanel = this.shouldUseSingleRowSlotPanel(rowCount);
        const panelWidth = singleRowSlotPanel
            ? this.getFiniteNumber(runtime._slotAreaSceneSingleRowPanelWidth, 652)
            : (Number.isFinite(runtime._slotAreaScenePanelWidth) && runtime._slotAreaScenePanelWidth > 0 ? runtime._slotAreaScenePanelWidth : 652);
        const panelLocalX = singleRowSlotPanel
            ? this.getFiniteNumber(runtime._slotAreaSceneSingleRowPanelLocalX, 0)
            : (Number.isFinite(runtime._slotAreaScenePanelLocalX) ? runtime._slotAreaScenePanelLocalX : 0);
        const panelLocalY = singleRowSlotPanel
            ? this.getFiniteNumber(runtime._slotAreaSceneSingleRowPanelLocalY, 6)
            : (Number.isFinite(runtime._slotAreaScenePanelLocalY) ? runtime._slotAreaScenePanelLocalY : 6);
        const panelLocalZ = singleRowSlotPanel
            ? this.getFiniteNumber(runtime._slotAreaSceneSingleRowPanelLocalZ, 0)
            : (Number.isFinite(runtime._slotAreaScenePanelLocalZ) ? runtime._slotAreaScenePanelLocalZ : 0);
        panel.getComponent(UITransform)?.setContentSize(panelWidth, this.getSlotPanelLayoutHeight(rowCount));
        panel.setPosition(panelLocalX, panelLocalY, panelLocalZ);
        panel.layer = Layers.Enum.UI_2D;
        const panelSprite = panel.getComponent(Sprite);
        if (!panelSprite) {
            throw new Error('[GameplayScene] Game.scene is missing Sprite component on SlotArea/SlotPanel');
        }
        const panelFrame = runtime.getSF(MAINLINE_SLOT_PANEL_TEXTURE);
        if (panelFrame) {
            panelSprite.spriteFrame = panelFrame;
        }
        panelSprite.type = Sprite.Type.SLICED;
        const hasPendingAllRowsUnlock = this.hasPendingAllRowsUnlock();
        const lockedPreviewRow = runtime.slotUnlockedRows < rowCount
            ? rowCount - 1
            : (hasPendingAllRowsUnlock ? rowCount : -1);

        for (let r = 0; r < maxRows; r++) {
            for (let c = 0; c < SLOTS_PER_ROW; c++) {
                const idx = r * SLOTS_PER_ROW + c;
                const shell = runtime.requireUiChild(panel, this.getSlotShellName(idx), `SlotArea/SlotPanel/${this.getSlotShellName(idx)}`);
                shell.layer = Layers.Enum.UI_2D;
                shell.active = idx < totalSlots;
                if (idx >= totalSlots) {
                    continue;
                }
                const slotPos = this.getSlotLocalPosition(idx, rowCount);
                shell.setPosition(slotPos.x, slotPos.y, slotPos.z);
                const shellLayout = this.getSlotShellSceneLayout(idx);
                const shellWidth = Number.isFinite(shellLayout?.width) ? shellLayout!.width : MAINLINE_SLOT_MARKER_WIDTH;
                const shellHeight = Number.isFinite(shellLayout?.height) ? shellLayout!.height : MAINLINE_SLOT_MARKER_HEIGHT;
                shell.getComponent(UITransform)?.setContentSize(shellWidth, shellHeight);
                const shellSprite = shell.getComponent(Sprite);
                if (!shellSprite) {
                    throw new Error(`[GameplayScene] Game.scene is missing Sprite component on SlotArea/SlotPanel/${this.getSlotShellName(idx)}`);
                }
                shellSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                shellSprite.spriteFrame = runtime.getSF(MAINLINE_SLOT_GROOVE_TEXTURE) || shellSprite.spriteFrame;
                const shellOpacity = shell.getComponent(UIOpacity) || shell.addComponent(UIOpacity);
                const row = Math.floor(idx / SLOTS_PER_ROW);
                shellOpacity.opacity = row >= runtime.slotUnlockedRows
                    ? Math.max(MAINLINE_SLOT_MARKER_LOCKED_OPACITY, LOCKED_SLOT_PREVIEW_OPACITY)
                    : MAINLINE_SLOT_MARKER_UNLOCKED_OPACITY;

                const beanNode = this.getSlotBeanNode(shell);
                beanNode.layer = Layers.Enum.UI_2D;
                beanNode.active = true;
                beanNode.setPosition(0, 0, 0);
                beanNode.getComponent(UITransform)?.setContentSize(runtime.getSlotBeanVisualSize(), runtime.getSlotBeanVisualSize());
                const beanSprite = beanNode.getComponent(Sprite);
                if (!beanSprite) {
                    throw new Error(`[GameplayScene] Game.scene is missing Sprite component on ${shell.name}/Bean`);
                }
                beanSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                beanSprite.enabled = false;

                runtime.slotNodes.push(shell);
                runtime.slotMarkerNodes.push(shell);
            }
        }

        const lockedRowLayoutRowCount = Math.max(rowCount, lockedPreviewRow + 1);
        const lockedRowAnchor = lockedPreviewRow >= 0 ? this.getSlotLocalPosition(lockedPreviewRow * SLOTS_PER_ROW, lockedRowLayoutRowCount) : new Vec3(0, 0, 0);
        const lockRowCenterY = lockedPreviewRow >= 0 ? panel.position.y + lockedRowAnchor.y : 0;
        const lockMask = this.getOrCreateSlotAreaSpriteChild('SlotRowLockMask');
        lockMask.layer = Layers.Enum.UI_2D;
        lockMask.active = lockedPreviewRow >= 0;
        this.applyMainlineLockLayout(lockMask, runtime._slotAreaSceneLockMaskLayout, lockRowCenterY, MAINLINE_SLOT_LOCK_MASK_WIDTH, MAINLINE_SLOT_LOCK_MASK_HEIGHT);
        const lockMaskSprite = lockMask.getComponent(Sprite);
        if (!lockMaskSprite) {
            throw new Error('[GameplayScene] Game.scene is missing Sprite component on SlotArea/SlotRowLockMask');
        }
        lockMaskSprite.spriteFrame = runtime.getSF(MAINLINE_SLOT_LOCK_MASK_TEXTURE) || lockMaskSprite.spriteFrame;
        lockMaskSprite.type = Sprite.Type.SIMPLE;
        const lockMaskOpacity = lockMask.getComponent(UIOpacity) || lockMask.addComponent(UIOpacity);
        lockMaskOpacity.opacity = 255;

        const lockDash = this.getOrCreateSlotAreaSpriteChild('SlotRowLockDash');
        lockDash.layer = Layers.Enum.UI_2D;
        lockDash.active = lockedPreviewRow >= 0;
        this.applyMainlineLockLayout(lockDash, runtime._slotAreaSceneLockDashLayout, lockRowCenterY, MAINLINE_SLOT_LOCK_ROW_WIDTH, MAINLINE_SLOT_LOCK_ROW_HEIGHT);
        const lockDashSprite = lockDash.getComponent(Sprite);
        if (!lockDashSprite) {
            throw new Error('[GameplayScene] Game.scene is missing Sprite component on SlotArea/SlotRowLockDash');
        }
        lockDashSprite.spriteFrame = runtime.getSF(MAINLINE_SLOT_LOCK_DASH_TEXTURE) || lockDashSprite.spriteFrame;
        lockDashSprite.type = Sprite.Type.SIMPLE;
        const lockDashOpacity = lockDash.getComponent(UIOpacity) || lockDash.addComponent(UIOpacity);
        lockDashOpacity.opacity = 255;

        const lockBtn = this.getOrCreateSlotAreaSpriteChild('SlotRowLockedBtn');
        lockBtn.layer = Layers.Enum.UI_2D;
        lockBtn.active = lockedPreviewRow >= 0;
        this.applyMainlineLockLayout(lockBtn, runtime._slotAreaSceneLockedBtnLayout, lockRowCenterY, 132, 42);
        const lockBtnSprite = lockBtn.getComponent(Sprite);
        if (!lockBtnSprite) {
            throw new Error('[GameplayScene] Game.scene is missing Sprite component on SlotArea/SlotRowLockedBtn');
        }
        if (!lockBtnSprite.spriteFrame) {
            throw new Error('[GameplayScene] Game.scene must provide SpriteFrame on SlotArea/SlotRowLockedBtn');
        }
        const lockButton = lockBtn.getComponent(Button) || lockBtn.addComponent(Button);
        lockButton.enabled = lockBtn.active;
        lockBtn.targetOff(runtime);
        lockBtn.on(Button.EventType.CLICK, () => {
            if (typeof runtime.triggerSlotUnlockFromInput === 'function') {
                runtime.triggerSlotUnlockFromInput();
                return;
            }
            this.tryUnlockSlotRow();
        }, runtime);
        this.syncSlotUnlockButtonModeIcon(lockBtn);
        this.hideCountBadge(lockBtn);
        lockMask.setSiblingIndex(1);
        lockDash.setSiblingIndex(2);
        lockBtn.setSiblingIndex(3);
    }

    onAddSlotRow() {
        this.tryUnlockSlotRow();
    }

    unlockSlotRow(): boolean {
        const runtime = this.runtime;
        const policy = runtime._activeSlotRowPolicy;
        const beforeUnlockedRows = Math.floor(Number(runtime.slotUnlockedRows) || 0);
        const beforeRowCount = Math.floor(Number(runtime.slotRowCount) || 0);
        const beforeUnlockedCount = Math.floor(Number(runtime.slotModel?.unlockedCount) || 0);
        const didAdvance = () => {
            const afterUnlockedRows = Math.floor(Number(runtime.slotUnlockedRows) || 0);
            const afterRowCount = Math.floor(Number(runtime.slotRowCount) || 0);
            const afterUnlockedCount = Math.floor(Number(runtime.slotModel?.unlockedCount) || 0);
            return afterUnlockedRows > beforeUnlockedRows
                || afterRowCount > beforeRowCount
                || afterUnlockedCount > beforeUnlockedCount;
        };
        const currentRows = Math.max(1, Math.floor(Number(runtime.slotUnlockedRows) || 1));
        if (policy?.unlockAllRowsAtOnce) {
            const targetRows = this.getAllRowsUnlockTargetRowCount();
            if (currentRows >= targetRows && runtime.slotRowCount >= targetRows) return false;
            if (runtime.slotRowCount < targetRows) {
                const rowsToAdd = targetRows - runtime.slotRowCount;
                runtime.slotRowCount = targetRows;
                runtime.slotModel.expand(SLOTS_PER_ROW * rowsToAdd);
            }
            runtime.slotUnlockedRows = Math.min(runtime.slotRowCount, Math.max(currentRows + 1, targetRows));
            runtime.slotModel.unlockedCount = SLOTS_PER_ROW * runtime.slotUnlockedRows;
            this.rebuildSlotNodes();
            runtime.renderSlots();
            runtime.clearAdRewardSlotAddReminderVisuals?.();
            return didAdvance();
        }
        if (runtime.slotUnlockedRows >= runtime.slotRowCount) return false;
        const targetRows = policy?.unlockAllRowsAtOnce
            ? Math.max(currentRows + 1, Math.floor(Number(policy.rowCount) || currentRows + 1))
            : currentRows + 1;
        runtime.slotUnlockedRows = Math.min(runtime.slotRowCount, targetRows);
        const configuredRowCount = Math.floor(Number(policy?.rowCount) || 0);
        const rowCountLimit = configuredRowCount > 0
            ? Math.min(runtime.getMaxSlotRows(), configuredRowCount)
            : runtime.getMaxSlotRows();
        while (this.shouldAppendLockedSlotRowAfterCurrentUnlock() && runtime.slotUnlockedRows >= runtime.slotRowCount && runtime.slotRowCount < rowCountLimit) {
            runtime.slotRowCount++;
            runtime.slotModel.expand(SLOTS_PER_ROW);
        }
        runtime.slotModel.unlockedCount = SLOTS_PER_ROW * runtime.slotUnlockedRows;
        this.rebuildSlotNodes();
        runtime.renderSlots();
        runtime.clearAdRewardSlotAddReminderVisuals?.();
        return didAdvance();
    }

    tryUnlockSlotRow(): boolean {
        const runtime = this.runtime;
        if (runtime.slotUnlockedRows >= runtime.slotRowCount && !this.hasPendingAllRowsUnlock()) return false;
        if (runtime.isPlacementVisualBusy?.()) return false;
        if (runtime._skillActive) return false;
        if (runtime._adShowing) return false;
        PerformanceMgr.inst.markUserActivity(3500);
        AudioMgr.inst.play('button');
        if (this.getCurrentSlotUnlockMode() === 'free') {
            const timerToken = runtime.pauseTimerForProp('slot-unlock-free');
            const unlocked = this.unlockSlotRow();
            if (unlocked) {
                runtime.markDynamicCountdownAssisted?.();
                sys.localStorage.setItem(LS_EXPAND_USED, '1');
            }
            runtime.resumeTimerForProp(timerToken || 'slot-unlock-free');
            return unlocked;
        }
        let timerToken = '';
        return runtime.runRewardedGrant('unlock_slot_row', () => {
            const unlocked = this.unlockSlotRow();
            if (!unlocked) return false;
            runtime.markDynamicCountdownAssisted?.();
            return true;
        }, {
            claimKey: `unlock_slot_row:${runtime.getActiveLogicalLevelId?.() || 0}:${runtime.slotUnlockedRows}`,
            busyFlag: '_adShowing',
            onInteractionStarted: () => {
                timerToken = runtime.pauseTimerForProp('slot-unlock-ad');
            },
            onInteractionReleased: () => {
                runtime.resumeTimerForProp(timerToken || 'slot-unlock-ad');
                timerToken = '';
            },
            grantFailToast: '暂存槽增加失败，请重试',
        });
    }

    slotHasBeans(): boolean {
        const pchController = this.runtime._pchConveyorGameplayController;
        if (pchController?.isActive?.()) {
            return pchController.hasStoredBeans?.() === true;
        }
        return this.runtime.slotModel.getAll().some((s: any) => s !== null);
    }

    clearExpandSlotGuide() {
        const runtime = this.runtime;
        const overlay = runtime._slotUnlockGuideLayer;
        if (overlay?.isValid) {
            Tween.stopAllByTarget(overlay);
            overlay.destroy();
        }
        runtime._slotUnlockGuideLayer = null;
    }

    isFirstUnlockedSlotRowFull(): boolean {
        const slots = this.runtime.slotModel?.getAll?.() || [];
        for (let i = 0; i < SLOTS_PER_ROW; i++) {
            if (!slots[i]) return false;
        }
        return true;
    }

    showExpandSlotGuide() {
        const runtime = this.runtime;
        this.clearExpandSlotGuide();
        if (runtime._guideStep >= 0) return;
        if (!runtime.getUrlForceGuide() && sys.localStorage.getItem(LS_EXPAND_USED) === '1') return;
        const currentLevel = typeof runtime.getActiveLogicalLevelId === 'function'
            ? runtime.getActiveLogicalLevelId()
            : 0;
        if (currentLevel === 2 && !runtime.getUrlForceGuide() && !this.isFirstUnlockedSlotRowFull()) return;
        const addBtn = runtime.slotAreaNode.getChildByName('AddBtnWrap');
        const unlockBtn = runtime.slotAreaNode.getChildByName('SlotRowLockedBtn')
            || runtime.slotAreaNode.children.find((child: Node) => child.name.startsWith('SlotRowLockedBtn_'))
            || null;
        const targetNode = unlockBtn || addBtn;
        if (!targetNode) return;
        PerformanceMgr.inst.markUserActivity(8000);
        const guideMode: 'expand' | 'unlock' = unlockBtn ? 'unlock' : 'expand';
        const targetUT = targetNode.getComponent(UITransform);
        if (!targetUT) return;
        if (!runtime.getSF('guide_hand') || !runtime.getSF('popup_guide_highlight_ring')) {
            runtime._ensureSpriteFramesByName(['guide_hand', 'popup_guide_highlight_ring'], () => this.showExpandSlotGuide());
            return;
        }
        const guideHandFrame = runtime.getSF('guide_hand');
        if (!guideHandFrame) {
            throw new Error('[slot-guide] missing sprite frame: guide_hand');
        }

        const overlayParent = typeof runtime.requireCanvasUiRoot === 'function'
            ? runtime.requireCanvasUiRoot('OverlayRoot')
            : runtime.node;
        if (overlayParent.parent) {
            overlayParent.setSiblingIndex(overlayParent.parent.children.length - 1);
        }
        const overlay = new Node('SlotUnlockHandGuide');
        overlayParent.addChild(overlay);
        runtime._slotUnlockGuideLayer = overlay;
        overlay.addComponent(UITransform).setContentSize(720, 1280);
        overlay.layer = Layers.Enum.UI_2D;
        overlay.setSiblingIndex(Math.max(0, overlayParent.children.length - 1));

        const layerUT = overlay.getComponent(UITransform)!;
        const targetWorld = targetUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
        const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
        const hlW = Math.max(160, targetUT.contentSize.width + 20);
        const hlH = Math.max(50, targetUT.contentSize.height + 16);
        const hl = new Node('SlotUnlockGuideHighlight');
        overlay.addChild(hl);
        hl.addComponent(UITransform).setContentSize(hlW, hlH);
        hl.layer = Layers.Enum.UI_2D;
        hl.setPosition(targetLocal.x, targetLocal.y);
        const highlightFrame = runtime.getSF('popup_guide_highlight_ring');
        if (!highlightFrame) {
            throw new Error('[slot-guide] missing sprite frame: popup_guide_highlight_ring');
        }
        const ringSize = Math.max(118, Math.max(hlW, hlH) + 40);
        runtime._applySpriteFrame(hl, highlightFrame, ringSize, ringSize);
        tween(hl).to(0.5, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'sineInOut' }).to(0.5, { scale: new Vec3(0.95, 0.95, 1) }, { easing: 'sineInOut' }).union().repeatForever().start();

        const hand = new Node('SlotUnlockGuideHand');
        overlay.addChild(hand);
        hand.addComponent(UITransform).setContentSize(GUIDE_HAND_BOX_SIZE, GUIDE_HAND_BOX_SIZE);
        hand.layer = Layers.Enum.UI_2D;
        runtime._applySpriteFrame(hand, guideHandFrame, GUIDE_HAND_SPRITE_SIZE, GUIDE_HAND_SPRITE_SIZE);
        if (typeof runtime.setGuideHandTarget === 'function') {
            runtime.setGuideHandTarget(hand, targetLocal.x, targetLocal.y);
        } else {
            hand.setPosition(targetLocal.x + 28, targetLocal.y - 28, 0);
        }
        if (typeof runtime.startGuideHandPulse === 'function') {
            runtime.startGuideHandPulse(hand);
        } else {
            tween(hand).to(0.2, { scale: new Vec3(0.8, 0.8, 1) }).to(0.2, { scale: new Vec3(1, 1, 1) }).delay(0.6).union().repeatForever().start();
        }

        overlay.on(Node.EventType.TOUCH_END, (event: any) => {
            const uiPos = event.getUILocation();
            const worldPos = new Vec3(uiPos.x, uiPos.y, 0);
            const localInTarget = targetUT.convertToNodeSpaceAR(worldPos);
            const hitTarget = Math.abs(localInTarget.x) <= targetUT.contentSize.width / 2
                && Math.abs(localInTarget.y) <= targetUT.contentSize.height / 2;
            if (!hitTarget) return;
            Tween.stopAllByTarget(hand);
            Tween.stopAllByTarget(hl);
            overlay.destroy();
            runtime._slotUnlockGuideLayer = null;
            sys.localStorage.setItem(LS_EXPAND_USED, '1');
            if (guideMode === 'expand') {
                this.onAddSlotRow();
                return;
            }
            this.tryUnlockSlotRow();
        }, runtime);
    }
}

export function ensureGameplaySlotUiController(runtime: any): GameplaySlotUiController {
    if (!runtime._gameplaySlotUiController) {
        runtime._gameplaySlotUiController = new GameplaySlotUiController(runtime);
    }
    return runtime._gameplaySlotUiController as GameplaySlotUiController;
}
