import {
    AudioMgr,
    Button,
    Color,
    Graphics,
    Label,
    Layers,
    Node,
    Sprite,
    Tween,
    UITransform,
    Vec2,
    Vec3,
    tween,
} from './GameCtrlShared';
import {
    PchConveyorRules,
    type PchSkillBeanSource,
    type PchSkillResult,
} from './PchConveyorRules';

const BELT_STEP_SECONDS = 0.28;
const PCH_TRANSFER_SECONDS = 0.16;
const PCH_ENTRY_STAGGER_SECONDS = 0.012;
const PCH_RETURN_STAGGER_SECONDS = 0.035;
const PCH_RETURN_PULSE_UP_SECONDS = 0.08;
const PCH_RETURN_PULSE_SETTLE_SECONDS = 0.15;
const PCH_SKILL_STAGGER_SECONDS = 0.025;
const PCH_SKILL_TRANSFER_SECONDS = 0.18;
const PCH_EXPAND_CAPACITY = 12;
const PCH_ENTRANCE_SNAP_PROGRESS = 0.032;
const PCH_BELT_DEFAULT_Y = -415;
const PCH_BELT_WITH_SKILLS_Y = -382;
const PCH_BELT_WITH_SKILLS_SCALE = 0.72;
const PCH_SPEED_BUTTON_FALLBACK_SIZE = 85;
const PCH_TOP_BUTTON_GAP = 24;

export class PchConveyorGameplayController {
    private root: Node | null = null;
    private belt: Node | null = null;
    private inputRoot: Node | null = null;
    private statusLabel: Label | null = null;
    private countLabel: Label | null = null;
    private capacityBadge: Node | null = null;
    private entryCountLabel: Label | null = null;
    private entranceNode: Node | null = null;
    private exitNode: Node | null = null;
    private adButton: Node | null = null;
    private speedButton: Node | null = null;
    private rules: PchConveyorRules | null = null;
    private carrierNodes: Node[] = [];
    private flowArrowNodes: Node[] = [];
    private activeFlyBeans = new Set<Node>();
    private activePulseNodes = new Set<Node>();
    private activeReturnAnimations = 0;
    private beltPath: Vec3[] = [];
    private beltPathDistances: number[] = [];
    private beltPathLength = 0;
    private exitPathProgress = 0;
    private beltTravel = 0;
    private manualSpeedMultiplier: 1 | 2 = 1;
    private inputLocked = false;
    private skillMovementPaused = false;
    private skillTimerPauseToken = '';
    private compactLayoutActive: boolean | null = null;
    private legacySlotArea: Node | null = null;
    private legacySlotAreaActive = false;

    constructor(private readonly runtime: any) {
        this.prepareBeltPath();
    }

    start(): void {
        this.stop();
        if (!this.runtime.boardModel || typeof this.runtime.renderBoardCells !== 'function') {
            throw new Error('[pch-core] original board renderer is unavailable');
        }
        if (typeof this.runtime.getBeanSpriteFrame !== 'function'
            || typeof this.runtime.renderBoardCell !== 'function'
            || typeof this.runtime.getBoardCellWorldPosition !== 'function'
            || typeof this.runtime.gameLose !== 'function') {
            throw new Error('[pch-core] original bean sprite or placement feedback is unavailable');
        }
        this.rules = new PchConveyorRules(this.runtime.boardModel);
        this.beltTravel = 0;
        this.inputLocked = false;
        this.activeReturnAnimations = 0;
        this.runtime.detachGameplayInputHandlers?.();

        const fixedRoot = this.runtime.getGameplayFixedRoot();
        this.legacySlotArea = this.runtime.getGameplayBottomHudChild('SlotAreaGroup');
        this.legacySlotAreaActive = !!this.legacySlotArea.active;
        this.legacySlotArea.active = false;

        this.root = this.makeNode('PchCoreGameplay', fixedRoot, 720, 1280, 0, 0);
        this.belt = this.makeNode('PchLoopingConveyor', this.root, 688, 400, 0, PCH_BELT_DEFAULT_Y);
        this.drawConveyorTrack();
        const bottomHud = this.runtime.getGameplayBottomHudGroup();
        this.root.setSiblingIndex(Math.max(0, fixedRoot.children.indexOf(bottomHud)));
        this.inputRoot = this.runtime._sceneInputRoot?.isValid ? this.runtime._sceneInputRoot : fixedRoot;
        this.inputRoot.on(Node.EventType.TOUCH_START, this.onRootTouchStart, this);
        this.inputRoot.on(Node.EventType.TOUCH_MOVE, this.onRootTouchMove, this);
        this.inputRoot.on(Node.EventType.TOUCH_END, this.onRootTouchEnd, this, true);
        this.inputRoot.on(Node.EventType.TOUCH_CANCEL, this.onRootTouchCancel, this);
        this.inputRoot.on(Node.EventType.MOUSE_WHEEL, this.onRootMouseWheel, this);
        this.renderGame();
        this.refreshConveyorLayout();
        this.runtime.refitBoardViewportToSafeRect?.();

        const topBar = this.runtime.getGameplayFixedGroup('TopBarGroup');
        const topHud = topBar.getChildByName('TopHud') || topBar;
        this.buildSpeedButton(topHud);
        topBar.setSiblingIndex(Math.max(0, fixedRoot.children.length - 1));
    }

    stop(): void {
        this.releaseActiveSkillPause();
        if (this.inputRoot?.isValid) {
            this.inputRoot.off(Node.EventType.TOUCH_START, this.onRootTouchStart, this);
            this.inputRoot.off(Node.EventType.TOUCH_MOVE, this.onRootTouchMove, this);
            this.inputRoot.off(Node.EventType.TOUCH_END, this.onRootTouchEnd, this, true);
            this.inputRoot.off(Node.EventType.TOUCH_CANCEL, this.onRootTouchCancel, this);
            this.inputRoot.off(Node.EventType.MOUSE_WHEEL, this.onRootMouseWheel, this);
        }
        for (const bean of this.activeFlyBeans) {
            if (!bean?.isValid) continue;
            Tween.stopAllByTarget(bean);
            bean.destroy();
        }
        for (const node of this.activePulseNodes) {
            if (node?.isValid) Tween.stopAllByTarget(node);
        }
        if (this.root?.isValid) {
            Tween.stopAllByTarget(this.root);
            this.root.destroy();
        }
        if (this.speedButton?.isValid) this.speedButton.destroy();
        if (this.legacySlotArea?.isValid) this.legacySlotArea.active = this.legacySlotAreaActive;
        this.root = null;
        this.belt = null;
        this.inputRoot = null;
        this.statusLabel = null;
        this.countLabel = null;
        this.capacityBadge = null;
        this.entryCountLabel = null;
        this.entranceNode = null;
        this.exitNode = null;
        this.adButton = null;
        this.speedButton = null;
        this.rules = null;
        this.carrierNodes = [];
        this.flowArrowNodes = [];
        this.activeFlyBeans.clear();
        this.activePulseNodes.clear();
        this.activeReturnAnimations = 0;
        this.skillMovementPaused = false;
        this.skillTimerPauseToken = '';
        this.compactLayoutActive = null;
        this.legacySlotArea = null;
        this.legacySlotAreaActive = false;
    }

    update(deltaTime: number): void {
        if (!this.rules || this.runtime.isGameEnd) return;
        this.refreshConveyorLayout();
        if (this.skillMovementPaused || this.runtime._adShowing || this.runtime._rewardedGrantTransaction) return;
        const previousTravel = this.beltTravel;
        const speedMultiplier = Math.max(this.manualSpeedMultiplier, this.rules.conveyorSpeedMultiplier);
        this.beltTravel += (Math.max(0, deltaTime) * speedMultiplier) / BELT_STEP_SECONDS;
        for (let carrierIndex = 0; carrierIndex < this.rules.carrierCount; carrierIndex += 1) {
            if (this.didCarrierCrossProgress(carrierIndex, previousTravel, this.beltTravel, 0)) {
                this.handleCarrierAtEntrance(carrierIndex);
            }
            if (this.didCarrierCrossProgress(carrierIndex, previousTravel, this.beltTravel, this.exitPathProgress)) {
                this.handleCarrierAtExit(carrierIndex);
            }
        }
        if (this.checkBufferDeadlock()) return;
        this.updateBeltPositions();
        this.updateFlowArrowPositions();
    }

    private refreshConveyorLayout(): void {
        if (!this.belt?.isValid) return;
        const skillRoot = this.runtime.getGameplayBottomHudChild('SkillArea');
        const compact = ['SkillMagnet', 'SkillBrush', 'SkillFreeze']
            .some((name) => skillRoot.getChildByName(name)?.activeInHierarchy);
        if (this.compactLayoutActive === compact) return;
        this.compactLayoutActive = compact;
        this.belt.setPosition(0, compact ? PCH_BELT_WITH_SKILLS_Y : PCH_BELT_DEFAULT_Y, 0);
        const scale = compact ? PCH_BELT_WITH_SKILLS_SCALE : 1;
        this.belt.setScale(scale, scale, 1);
    }

    getAvoidTopY(): number | null {
        if (!this.belt?.isValid) return null;
        const transform = this.belt.getComponent(UITransform);
        if (!transform) return null;
        return this.belt.position.y + transform.contentSize.height * Math.abs(this.belt.scale.y || 1) / 2;
    }

    getBufferCapacity(): number {
        return this.rules?.bufferCapacity || 0;
    }

    isActive(): boolean {
        return !!this.rules && !!this.root?.isValid;
    }

    hasStoredBeans(): boolean {
        return (this.rules?.bufferCount || 0) > 0;
    }

    isSkillBusy(): boolean {
        return this.activeFlyBeans.size > 0
            || this.activeReturnAnimations > 0
            || this.inputLocked
            || this.runtime._skillActive === true;
    }

    beginSkillUsePause(owner: 'magnet' | 'brush' | 'freeze'): void {
        if (this.skillMovementPaused) return;
        this.skillMovementPaused = true;
        this.skillTimerPauseToken = this.runtime.pauseTimerForProp?.(`pch-skill-${owner}`) || '';
    }

    releaseActiveSkillPause(): void {
        const timerToken = this.skillTimerPauseToken;
        this.skillTimerPauseToken = '';
        this.skillMovementPaused = false;
        if (timerToken) this.runtime.resumeTimerForProp?.(timerToken);
    }

    useClearColorSkill(timerAlreadyPaused: boolean = false): boolean {
        return this.runConveyorSkill('magnet', timerAlreadyPaused, () => this.rules!.forceCompleteRandomColor());
    }

    useClearBufferSkill(timerAlreadyPaused: boolean = false): boolean {
        if (!this.hasStoredBeans()) return false;
        return this.runConveyorSkill('brush', timerAlreadyPaused, () => this.rules!.clearBufferToBoard());
    }

    continueAfterBufferFull(): boolean {
        if (!this.rules || !this.inputLocked || !this.runtime.isGameEnd) return false;
        if (!this.expandCapacity()) return false;
        this.inputLocked = false;
        this.runtime.continueAfterLose(0, true);
        return true;
    }

    private checkBufferDeadlock(): boolean {
        if (!this.rules?.isBufferDeadlocked()) return false;
        this.inputLocked = true;
        if (this.statusLabel) this.statusLabel.string = '暂存槽已满，且没有豆豆可以归位';
        this.runtime.gameLose('buffer-full');
        return true;
    }

    private onRootTouchStart(event: any): void {
        this.runtime.onTouchStart?.(event);
    }

    private onRootTouchMove(event: any): void {
        this.runtime.onTouchMove?.(event);
    }

    private onRootTouchCancel(event: any): void {
        this.runtime.onTouchCancel?.(event);
    }

    private onRootMouseWheel(event: any): void {
        this.runtime.onMouseWheel?.(event);
    }

    private onRootTouchEnd(event: any): void {
        if (!this.rules || this.inputLocked || this.runtime.isGameEnd) return;
        const wasViewportGesture = this.runtime.gestureMode === 'pinching'
            || this.runtime.gestureMode === 'panning'
            || !!this.runtime.suppressTap;
        this.runtime.onTouchCancel?.(event);
        if (wasViewportGesture) {
            event.propagationStopped = true;
            return;
        }
        const rawPos = event?.getUILocation?.();
        if (!rawPos) return;
        const uiPos = typeof this.runtime.normalizeGameplayUiPosition === 'function'
            ? this.runtime.normalizeGameplayUiPosition(rawPos)
            : new Vec2(rawPos.x, rawPos.y);
        if (this.handleScaledSettingsButtonTap(rawPos, uiPos, event)) return;
        if (this.handleScaledSpeedButtonTap(rawPos, uiPos, event)) return;
        if (this.handleScaledCapacityAdTap(rawPos, uiPos, event)) return;
        if (this.handleScaledSkillTap(rawPos, uiPos, event)) return;
        const boardHitPositions = [rawPos];
        if (Math.abs(uiPos.x - rawPos.x) >= 0.5 || Math.abs(uiPos.y - rawPos.y) >= 0.5) {
            boardHitPositions.push(uiPos);
        }
        let cell: { row: number; col: number } | null = null;
        if (typeof this.runtime.resolveBoardTapBlock === 'function') {
            for (const position of boardHitPositions) {
                const resolution = this.runtime.resolveBoardTapBlock(new Vec3(position.x, position.y, 0), false);
                const candidate = resolution?.candidate || null;
                if (!candidate) continue;
                cell = this.rules.cells.find((item) => item.row === candidate.row && item.col === candidate.col) || null;
                if (cell) break;
            }
        }
        if (!cell) {
            cell = this.rules.cells.find((item) => {
                const node = this.runtime.cellNodes?.[item.row]?.[item.col] || null;
                const transform = node?.getComponent(UITransform);
                const bounds = transform?.getBoundingBoxToWorld();
                return !!bounds && boardHitPositions.some((position) => bounds.contains(position));
            }) || null;
        }
        if (!cell) return;
        event.propagationStopped = true;
        this.handleBoardTap(cell.row, cell.col);
    }

    private handleScaledSettingsButtonTap(rawPos: { x: number; y: number }, uiPos: Vec2, event: any): boolean {
        if (Math.abs(uiPos.x - rawPos.x) < 0.5 && Math.abs(uiPos.y - rawPos.y) < 0.5) return false;
        const topBar = this.runtime.getGameplayFixedGroup?.('TopBarGroup') || null;
        const node = topBar?.getChildByName('TopHud')?.getChildByName('SettingsButton') || null;
        const transform = node?.getComponent(UITransform);
        const button = node?.getComponent(Button);
        if (!node?.isValid || !node.activeInHierarchy || !transform || !button?.enabled || !button.interactable) return false;
        if (!transform.getBoundingBoxToWorld().contains(uiPos)) return false;
        event.propagationStopped = true;
        this.runtime.scheduleOnce(() => {
            if (!node.isValid || !node.activeInHierarchy || !button.enabled || !button.interactable) return;
            AudioMgr.inst.play('button');
            this.runtime.openSettingsPanel?.();
        }, 0);
        return true;
    }

    private handleScaledSpeedButtonTap(rawPos: { x: number; y: number }, uiPos: Vec2, event: any): boolean {
        if (Math.abs(uiPos.x - rawPos.x) < 0.5 && Math.abs(uiPos.y - rawPos.y) < 0.5) return false;
        const node = this.speedButton;
        const transform = node?.getComponent(UITransform);
        const button = node?.getComponent(Button);
        if (!node?.isValid || !node.activeInHierarchy || !transform || !button?.enabled || !button.interactable) return false;
        if (!transform.getBoundingBoxToWorld().contains(uiPos)) return false;
        event.propagationStopped = true;
        this.runtime.scheduleOnce(() => {
            if (!node.isValid || !node.activeInHierarchy || !button.enabled || !button.interactable) return;
            this.onSpeedButtonTap({ propagationStopped: false });
        }, 0);
        return true;
    }

    private handleScaledCapacityAdTap(rawPos: { x: number; y: number }, uiPos: Vec2, event: any): boolean {
        if (Math.abs(uiPos.x - rawPos.x) < 0.5 && Math.abs(uiPos.y - rawPos.y) < 0.5) return false;
        const node = this.adButton;
        const transform = node?.getComponent(UITransform);
        const button = node?.getComponent(Button);
        if (!node?.isValid || !node.activeInHierarchy || !transform || !button?.enabled || !button.interactable) return false;
        if (!transform.getBoundingBoxToWorld().contains(uiPos)) return false;
        event.propagationStopped = true;
        this.runtime.scheduleOnce(() => {
            if (!node.isValid || !node.activeInHierarchy || !button.enabled || !button.interactable) return;
            this.onCapacityAdTap({ propagationStopped: false });
        }, 0);
        return true;
    }

    private handleScaledSkillTap(rawPos: { x: number; y: number }, uiPos: Vec2, event: any): boolean {
        if (Math.abs(uiPos.x - rawPos.x) < 0.5 && Math.abs(uiPos.y - rawPos.y) < 0.5) return false;
        const skillRoot = this.runtime.getGameplayBottomHudChild?.('SkillArea');
        if (!skillRoot?.isValid || !skillRoot.activeInHierarchy) return false;
        for (const name of ['SkillMagnet', 'SkillBrush', 'SkillFreeze']) {
            const node = skillRoot.getChildByName(name);
            const transform = node?.getComponent(UITransform);
            const button = node?.getComponent(Button);
            if (!node?.isValid || !node.activeInHierarchy || !transform || !button?.enabled || !button.interactable) continue;
            if (!transform.getBoundingBoxToWorld().contains(uiPos)) continue;
            event.propagationStopped = true;
            this.runtime.scheduleOnce(() => {
                if (!node.isValid || !node.activeInHierarchy || !button.enabled || !button.interactable) return;
                node.emit(Button.EventType.CLICK, button);
            }, 0);
            return true;
        }
        return false;
    }

    private handleBoardTap(row: number, col: number): void {
        if (!this.rules) return;
        const block = this.rules.selectBoard(row, col);
        if (!block) {
            if (this.statusLabel) this.statusLabel.string = '请选择棋盘上未归位的相连同色豆豆';
            return;
        }
        const sourceWorldPositions = block.cells.map((cell) => this.getBoardCellWorldPosition(cell.row, cell.col));
        const result = this.rules.storeBlock(block, this.getEntranceCarrierIndex());
        if (result.moved <= 0) {
            if (this.statusLabel) this.statusLabel.string = '传送带已满，请等待出口归位';
            return;
        }
        this.runtime.ensureTimerStarted?.();
        AudioMgr.inst.play('select');
        AudioMgr.inst.vibrateSelect();
        this.runtime.renderBoardCells(result.boardCells);
        this.renderEntranceQueue();
        this.refreshStatus();
        result.boardCells.forEach((_cell, index) => {
            const sourceWorld = sourceWorldPositions[index];
            if (!sourceWorld) throw new Error(`[pch-core] board bean ${index} has no fly source`);
            this.animateBeanIntoConveyor(block.colorId, sourceWorld, index);
        });
        this.runtime.scheduleOnce(() => AudioMgr.inst.play('fly'), 0.08);
        if (result.moved < block.cells.length) {
            if (this.statusLabel) this.statusLabel.string = '空间不足，剩余豆豆保留在棋盘';
        }
    }

    private handleCarrierAtEntrance(carrierIndex: number): boolean {
        if (!this.rules || this.rules.readyEntryCount <= 0) return false;
        const result = this.rules.transferReadyBeansToCarrier(carrierIndex);
        if (result.moved <= 0) return false;
        AudioMgr.inst.play('slot');
        this.renderConveyor();
        this.renderEntranceQueue();
        this.refreshStatus();
        this.playEntranceTransferPulse(result.carrierIndex);
        return true;
    }

    private tryTransferAtCurrentEntrance(): boolean {
        if (!this.rules) return false;
        const carrierIndex = this.getEntranceCarrierIndex();
        const progress = this.wrap01((carrierIndex + this.beltTravel) / this.rules.carrierCount);
        const distance = Math.min(progress, 1 - progress);
        if (distance > PCH_ENTRANCE_SNAP_PROGRESS) return false;
        return this.handleCarrierAtEntrance(carrierIndex);
    }

    private playEntranceTransferPulse(carrierIndex: number): void {
        const nodes = [this.entranceNode, this.carrierNodes[carrierIndex]].filter((node): node is Node => !!node?.isValid);
        for (const node of nodes) {
            Tween.stopAllByTarget(node);
            node.setScale(1, 1, 1);
            this.activePulseNodes.add(node);
            tween(node)
                .to(0.06, { scale: new Vec3(1.12, 1.12, 1) })
                .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .call(() => this.activePulseNodes.delete(node))
                .start();
        }
    }

    private handleCarrierAtExit(carrierIndex: number): boolean {
        if (!this.rules) return false;
        if (this.rules.topColor(carrierIndex) <= 0) return false;
        const carrierNode = this.carrierNodes[carrierIndex];
        if (!carrierNode?.isValid) {
            throw new Error(`[pch-core] carrier ${carrierIndex} has no visual source`);
        }
        const sourceLayers = this.rules.carriers[carrierIndex].map((_colorId, layerIndex) => {
            const beanNode = carrierNode.getChildByName(`PchStackBean-${carrierIndex}-${layerIndex}`);
            const beanTransform = beanNode?.getComponent(UITransform);
            if (!beanNode?.isValid || !beanTransform) {
                throw new Error(`[pch-core] carrier ${carrierIndex} layer ${layerIndex} has no visual source`);
            }
            return {
                world: beanTransform.convertToWorldSpaceAR(new Vec3()),
                size: Math.max(1, 31 * (this.runtime.getNodeScaleInLayer?.(beanNode, this.root) || 1)),
            };
        }).reverse();
        const result = this.rules.autoPlaceAvailableTop(carrierIndex);
        if (result.moved <= 0) return false;
        this.renderConveyor();
        this.refreshStatus();
        result.boardCells.forEach((target, index) => {
            const source = sourceLayers[index];
            const colorId = result.colorIds[index];
            if (!source || colorId <= 0) {
                throw new Error(`[pch-core] return batch ${carrierIndex}:${index} has no source bean`);
            }
            this.animateBeanReturn(colorId, source.world, source.size, target, index);
        });
        this.playExitPulse();
        if (this.rules.board.isAllLocked()) this.inputLocked = true;
        return true;
    }

    private playExitPulse(): void {
        if (!this.exitNode?.isValid) return;
        Tween.stopAllByTarget(this.exitNode);
        this.exitNode.setScale(1, 1, 1);
        this.activePulseNodes.add(this.exitNode);
        tween(this.exitNode)
            .to(0.08, { scale: new Vec3(1.14, 1.14, 1) })
            .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .call(() => {
                if (this.exitNode) this.activePulseNodes.delete(this.exitNode);
            })
            .start();
    }

    private didCarrierCrossProgress(
        carrierIndex: number,
        previousTravel: number,
        currentTravel: number,
        pathProgress: number,
    ): boolean {
        if (!this.rules) return false;
        const count = this.rules.carrierCount;
        const before = Math.floor((carrierIndex + previousTravel) / count - pathProgress);
        const after = Math.floor((carrierIndex + currentTravel) / count - pathProgress);
        return after > before;
    }

    private animateBeanIntoConveyor(
        colorId: number,
        sourceWorld: Vec3,
        staggerIndex: number,
    ): void {
        if (!this.root || !this.belt) throw new Error('[pch-core] conveyor entry visual root is unavailable');
        const sourceBeanSize = Math.max(1, this.runtime.getBoardFlyBeanSizeInLayer?.(this.root) || 31);
        const bean = this.createFlyBean(`PchInboundBean-${staggerIndex}`, colorId, sourceBeanSize, sourceWorld);
        const rootTransform = this.root.getComponent(UITransform)!;
        const entranceWorld = this.belt.getComponent(UITransform)!.convertToWorldSpaceAR(this.beltPath[0]);
        const targetLocal = rootTransform.convertToNodeSpaceAR(entranceWorld);
        const targetScale = 31 / sourceBeanSize;
        tween(bean)
            .delay(staggerIndex * PCH_ENTRY_STAGGER_SECONDS)
            .to(PCH_TRANSFER_SECONDS, {
                position: targetLocal,
                scale: new Vec3(targetScale, targetScale, 1),
            }, { easing: 'quadIn' })
            .call(() => {
                this.destroyFlyBean(bean);
                this.rules?.markQueuedBeansReady(1);
                this.renderEntranceQueue();
                this.refreshStatus();
                this.tryTransferAtCurrentEntrance();
            })
            .start();
    }

    private animateBeanReturn(
        colorId: number,
        sourceWorld: Vec3,
        sourceBeanSize: number,
        target: { row: number; col: number },
        staggerIndex: number,
    ): void {
        if (!this.root) throw new Error('[pch-core] conveyor return visual root is unavailable');
        const targetWorld = this.getBoardCellWorldPosition(target.row, target.col);
        const rootTransform = this.root.getComponent(UITransform)!;
        const targetLocal = rootTransform.convertToNodeSpaceAR(targetWorld);
        const targetBeanSize = Math.max(1, this.runtime.getBoardFlyBeanSizeInLayer?.(this.root) || sourceBeanSize);
        const bean = this.createFlyBean(`PchReturnBean-${target.row}-${target.col}`, colorId, sourceBeanSize, sourceWorld);
        const targetScale = targetBeanSize / sourceBeanSize;
        this.activeReturnAnimations += 1;
        tween(bean)
            .delay(staggerIndex * PCH_RETURN_STAGGER_SECONDS)
            .call(() => AudioMgr.inst.play('fly'))
            .to(PCH_TRANSFER_SECONDS, {
                position: targetLocal,
                scale: new Vec3(targetScale, targetScale, 1),
            }, { easing: 'quadIn' })
            .call(() => {
                this.destroyFlyBean(bean);
                AudioMgr.inst.play('place');
                AudioMgr.inst.vibratePlace();
                this.runtime.renderBoardCell(target.row, target.col);
                this.playReturnTargetPulse(target);
                this.finishReturnAnimation(target);
            })
            .start();
    }

    private playReturnTargetPulse(target: { row: number; col: number }): void {
        const targetNode = this.runtime.cellNodes?.[target.row]?.[target.col] || null;
        if (!targetNode?.isValid) return;
        Tween.stopAllByTarget(targetNode);
        targetNode.setScale(1, 1, 1);
        this.activePulseNodes.add(targetNode);
        tween(targetNode)
            .to(PCH_RETURN_PULSE_UP_SECONDS, { scale: new Vec3(1.24, 1.24, 1) })
            .call(() => this.runtime.playBeanSettleMatchFxOnCell?.(target.row, target.col))
            .to(PCH_RETURN_PULSE_SETTLE_SECONDS, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .call(() => {
                this.activePulseNodes.delete(targetNode);
            })
            .start();
    }

    private finishReturnAnimation(target: { row: number; col: number }): void {
        this.activeReturnAnimations = Math.max(0, this.activeReturnAnimations - 1);
        this.runtime.syncSkillButtonRuntimeStates?.();
        this.runtime.checkColorCompletion?.();
        const boardComplete = this.rules?.board.isAllLocked() === true;
        if (!boardComplete) this.runtime.flushPendingColorCompleteEffects?.();
        this.runtime.checkGuideStepComplete?.();
        if (boardComplete && this.activeReturnAnimations === 0) {
            this.runtime.clearEndgameHints?.(false);
            this.runtime.playPatternCompleteThenWin?.();
        } else if (!boardComplete) {
            this.runtime.refreshEndgameHints?.(`pch-return-${target.row}-${target.col}`);
        }
    }

    private createFlyBean(name: string, colorId: number, size: number, worldPosition: Vec3): Node {
        if (!this.root) throw new Error('[pch-core] fly bean root is unavailable');
        const rootTransform = this.root.getComponent(UITransform)!;
        const localPosition = rootTransform.convertToNodeSpaceAR(worldPosition);
        const bean = this.makeNode(name, this.root, size, size, localPosition.x, localPosition.y);
        const sprite = bean.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.runtime.requireRenderReadySpriteFrame(
            this.runtime.getBeanSpriteFrame(colorId, false),
            `${name}:color:${colorId}`,
        );
        this.activeFlyBeans.add(bean);
        return bean;
    }

    private destroyFlyBean(bean: Node): void {
        this.activeFlyBeans.delete(bean);
        if (!bean?.isValid) return;
        Tween.stopAllByTarget(bean);
        bean.destroy();
    }

    private getBoardCellWorldPosition(row: number, col: number): Vec3 {
        const world = this.runtime.getBoardCellWorldPosition?.(row, col) || null;
        if (!world) throw new Error(`[pch-core] board cell ${row},${col} has no world position`);
        return world;
    }

    private renderGame(): void {
        this.runtime.renderBoard();
        this.renderConveyor();
        this.renderEntranceQueue();
        this.refreshStatus();
    }

    private refreshStatus(): void {
        if (!this.rules) return;
        const isFull = this.rules.bufferCount >= this.rules.bufferCapacity;
        if (this.statusLabel) {
            this.statusLabel.string = this.rules.entryCount > 0
                ? `入口等待 ${this.rules.entryCount} 颗 · 格位到达后自动装载`
                : `${this.rules.carrierCount} 个循环位置 · 每位最多叠 3 颗`;
            this.statusLabel.color = isFull ? new Color(202, 56, 82) : new Color(79, 65, 126);
        }
        if (this.countLabel) {
            this.countLabel.string = `${this.rules.bufferCount} / ${this.rules.bufferCapacity}`;
            this.countLabel.color = isFull ? new Color(255, 92, 103) : new Color(255, 237, 74);
        }
        if (this.entryCountLabel) {
            this.entryCountLabel.string = this.rules.entryCount > 0 ? `${this.rules.entryCount}` : '';
        }
        this.runtime.refreshCompletionProgressLabel?.();
        this.runtime.syncSkillButtonRuntimeStates?.();
    }

    private runConveyorSkill(
        kind: 'magnet' | 'brush',
        _timerAlreadyPaused: boolean,
        execute: () => PchSkillResult,
    ): boolean {
        if (!this.rules || !this.root?.isValid || this.runtime.isGameEnd || this.isSkillBusy()) return false;
        this.beginSkillUsePause(kind);
        this.runtime._skillActive = true;
        const skillGeneration = this.runtime.armSkillUsageWatchdog?.(`pch-${kind}`)
            || Math.max(0, Number(this.runtime._activeSkillUsageGeneration) || 0);
        this.inputLocked = true;
        let result: PchSkillResult;
        try {
            result = execute();
        } catch (error) {
            this.inputLocked = false;
            this.runtime.finishSkillUsage?.(skillGeneration);
            throw error;
        }

        const visualMoves = result.moves.map((move) => ({
            move,
            source: this.resolveSkillSourceVisual(move.source),
        }));
        for (const move of result.moves) {
            this.runtime._flyingTargets?.add?.(`${move.target.row},${move.target.col}`);
        }
        this.runtime.renderBoardCells?.(result.boardCells);
        this.renderConveyor();
        this.renderEntranceQueue();
        this.refreshStatus();
        AudioMgr.inst.play(kind === 'brush' ? 'propBrush' : 'propWand');
        AudioMgr.inst.vibratePlace();

        const finish = () => {
            this.inputLocked = false;
            for (const move of result.moves) {
                this.runtime._flyingTargets?.delete?.(`${move.target.row},${move.target.col}`);
            }
            this.runtime.renderBoardCells?.(result.boardCells);
            this.renderConveyor();
            this.renderEntranceQueue();
            this.refreshStatus();
            this.runtime.checkColorCompletion?.();
            const boardComplete = this.rules?.board.isAllLocked() === true;
            this.runtime.checkGuideStepComplete?.();
            this.runtime.finishSkillUsage?.(skillGeneration);
            if (boardComplete) {
                this.runtime.clearEndgameHints?.(false);
                this.runtime.playPatternCompleteThenWin?.();
            } else {
                try {
                    this.runtime.flushPendingColorCompleteEffects?.();
                } catch (error) {
                    console.warn('[pch-skill] optional color-complete effect unavailable:', error);
                }
                this.runtime.refreshEndgameHints?.(`pch-${kind}`);
            }
        };
        if (visualMoves.length === 0) {
            this.runtime.scheduleOnce(finish, 0.05);
            return result.boardCells.length > 0;
        }

        let remaining = visualMoves.length;
        const skillStaggerSeconds = Math.min(
            PCH_SKILL_STAGGER_SECONDS,
            0.56 / Math.max(1, visualMoves.length - 1),
        );
        visualMoves.forEach(({ move, source }, index) => {
            const bean = this.createFlyBean(
                `PchSkill-${kind}-${index}`,
                move.source.colorId,
                source.size,
                source.world,
            );
            const targetWorld = this.getBoardCellWorldPosition(move.target.row, move.target.col);
            const targetLocal = this.root!.getComponent(UITransform)!.convertToNodeSpaceAR(targetWorld);
            const targetSize = Math.max(1, this.runtime.getBoardFlyBeanSizeInLayer?.(this.root) || source.size);
            tween(bean)
                .delay(index * skillStaggerSeconds)
                .to(0.07, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'sineOut' })
                .call(() => AudioMgr.inst.play('fly'))
                .to(PCH_SKILL_TRANSFER_SECONDS, {
                    position: targetLocal,
                    scale: new Vec3(targetSize / source.size, targetSize / source.size, 1),
                }, { easing: 'circOut' })
                .call(() => {
                    this.destroyFlyBean(bean);
                    this.runtime._flyingTargets?.delete?.(`${move.target.row},${move.target.col}`);
                    this.runtime.renderBoardCell?.(move.target.row, move.target.col);
                    AudioMgr.inst.play('place');
                    this.playSkillTargetPulse(move.target, () => {});
                    remaining -= 1;
                    if (remaining <= 0) finish();
                })
                .start();
        });
        return true;
    }

    private resolveSkillSourceVisual(source: PchSkillBeanSource): { world: Vec3; size: number } {
        if (source.kind === 'board') {
            return {
                world: this.getBoardCellWorldPosition(source.row, source.col),
                size: Math.max(1, this.runtime.getBoardFlyBeanSizeInLayer?.(this.root) || 31),
            };
        }
        if (source.kind === 'carrier') {
            const beanNode = this.carrierNodes[source.carrierIndex]
                ?.getChildByName(`PchStackBean-${source.carrierIndex}-${source.layerIndex}`);
            const transform = beanNode?.getComponent(UITransform);
            if (!beanNode?.isValid || !transform) {
                throw new Error(`[pch-skill] missing carrier source ${source.carrierIndex}:${source.layerIndex}`);
            }
            return {
                world: transform.convertToWorldSpaceAR(new Vec3()),
                size: Math.max(1, 31 * (this.runtime.getNodeScaleInLayer?.(beanNode, this.root) || 1)),
            };
        }
        const beanNode = this.entranceNode?.getChildByName(`PchEntryBean-${source.index}`) || this.entranceNode;
        const transform = beanNode?.getComponent(UITransform);
        if (!beanNode?.isValid || !transform) {
            throw new Error(`[pch-skill] missing entry source ${source.index}`);
        }
        return {
            world: transform.convertToWorldSpaceAR(new Vec3()),
            size: Math.max(1, 30 * (this.runtime.getNodeScaleInLayer?.(beanNode, this.root) || 1)),
        };
    }

    private playSkillTargetPulse(target: { row: number; col: number }, onDone: () => void): void {
        const node = this.runtime.cellNodes?.[target.row]?.[target.col] || null;
        if (!node?.isValid) {
            onDone();
            return;
        }
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        this.activePulseNodes.add(node);
        tween(node)
            .to(0.07, { scale: new Vec3(1.26, 1.26, 1) })
            .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .call(() => {
                this.activePulseNodes.delete(node);
                onDone();
            })
            .start();
    }

    private renderConveyor(): void {
        if (!this.rules || !this.belt) return;
        this.belt.children.filter((node) => node.name.startsWith('PchCarrier-')).forEach((node) => node.destroy());
        this.carrierNodes = [];
        this.rules.carriers.forEach((stack, carrierIndex) => {
            const carrier = this.makeNode(`PchCarrier-${carrierIndex}`, this.belt!, 36, 92, 0, 0);
            const groove = carrier.addComponent(Graphics);
            groove.fillColor = new Color(54, 42, 103, 150);
            groove.roundRect(-18, -18, 36, 36, 10);
            groove.fill();
            groove.lineWidth = 2;
            groove.strokeColor = new Color(255, 255, 255, 90);
            groove.roundRect(-18, -18, 36, 36, 10);
            groove.stroke();
            stack.forEach((colorId, layer) => {
                const bean = this.makeNode(`PchStackBean-${carrierIndex}-${layer}`, carrier, 33, 33, 0, layer * 8);
                const sprite = bean.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = this.runtime.requireRenderReadySpriteFrame(
                    this.runtime.getBeanSpriteFrame(colorId, false),
                    `pch-carrier:${carrierIndex}:layer:${layer}:color:${colorId}`,
                );
                sprite.color = new Color(255, 255, 255, layer === stack.length - 1 ? 255 : 184);
            });
            if (stack.length > 1) {
                this.makeLabel(carrier, `×${stack.length}`, 13, Color.WHITE, 0, -30, 42);
            }
            this.carrierNodes[carrierIndex] = carrier;
        });
        this.updateBeltPositions();
        this.updateFlowArrowPositions();
        for (const overlay of [this.entranceNode, this.exitNode, this.capacityBadge, this.adButton]) {
            if (overlay?.isValid) overlay.setSiblingIndex(Math.max(0, this.belt.children.length - 1));
        }
    }

    private renderEntranceQueue(): void {
        if (!this.rules || !this.entranceNode) return;
        this.entranceNode.children
            .filter((node) => node.name.startsWith('PchEntryBean-'))
            .forEach((node) => node.destroy());
        const visibleColors = this.rules.entryColors.slice(0, Math.min(3, this.rules.readyEntryCount));
        visibleColors.forEach((colorId, layer) => {
            const bean = this.makeNode(`PchEntryBean-${layer}`, this.entranceNode!, 30, 30, 0, 6 + layer * 7);
            const sprite = bean.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.runtime.requireRenderReadySpriteFrame(
                this.runtime.getBeanSpriteFrame(colorId, false),
                `pch-entry:${layer}:color:${colorId}`,
            );
            sprite.color = new Color(255, 255, 255, layer === visibleColors.length - 1 ? 255 : 190);
        });
        if (this.entryCountLabel?.node?.isValid) {
            this.entryCountLabel.node.setSiblingIndex(Math.max(0, this.entranceNode.children.length - 1));
        }
    }

    private prepareBeltPath(): void {
        this.beltPath = [
            new Vec3(-230, -112), new Vec3(-148, -112), new Vec3(30, -112), new Vec3(213, -112),
            new Vec3(266, -112), new Vec3(290, -99), new Vec3(300, -72), new Vec3(300, 86),
            new Vec3(290, 113), new Vec3(266, 128), new Vec3(196, 128), new Vec3(196, 83),
            new Vec3(187, 64), new Vec3(166, 52), new Vec3(0, 52), new Vec3(-166, 52),
            new Vec3(-187, 64), new Vec3(-196, 83), new Vec3(-196, 128), new Vec3(-258, 128),
            new Vec3(-283, 118), new Vec3(-300, 94), new Vec3(-300, -78), new Vec3(-290, -100),
            new Vec3(-266, -112),
        ];
        this.beltPathDistances = [0];
        this.beltPathLength = 0;
        for (let i = 0; i < this.beltPath.length; i += 1) {
            const next = this.beltPath[(i + 1) % this.beltPath.length];
            this.beltPathLength += Vec3.distance(this.beltPath[i], next);
            if (i < this.beltPath.length - 1) this.beltPathDistances.push(this.beltPathLength);
        }
        const exitIndex = this.beltPath.findIndex((point) => point.x === 0 && point.y === 52);
        this.exitPathProgress = this.beltPathDistances[exitIndex] / this.beltPathLength;
    }

    private drawConveyorTrack(): void {
        if (!this.belt) return;
        const track = this.makeNode('PchMovingTrack', this.belt, 688, 300, 0, 0);
        const graphics = track.addComponent(Graphics);
        graphics.lineJoin = Graphics.LineJoin.ROUND;
        graphics.lineCap = Graphics.LineCap.ROUND;
        for (const [width, color, offsetY] of [
            [78, new Color(66, 54, 108, 95), -6],
            [72, new Color(255, 255, 255, 255), 0],
            [66, new Color(178, 183, 198, 255), 0],
            [61, new Color(242, 245, 250, 255), 0],
            [53, new Color(105, 92, 161, 255), 0],
        ] as Array<[number, Color, number]>) {
            this.strokeBeltPath(graphics, width, color, offsetY);
        }
        graphics.lineWidth = 5;
        graphics.strokeColor = new Color(190, 177, 237, 105);
        this.traceArrow(graphics, -110, -112, 0);
        this.traceArrow(graphics, 62, -112, 0);
        this.traceArrow(graphics, 236, -112, 0);
        this.traceArrow(graphics, 300, 7, Math.PI / 2);
        this.traceArrow(graphics, 92, 52, Math.PI);
        this.traceArrow(graphics, -64, 52, Math.PI);
        this.traceArrow(graphics, -300, 8, -Math.PI / 2);
        this.traceArrow(graphics, -243, 128, 0);
        graphics.stroke();
        this.buildEntranceUi();
        this.buildExitUi();
        this.buildCapacityUi();
    }

    private buildEntranceUi(): void {
        if (!this.belt) return;
        this.entranceNode = this.makeNode('PchEntrance', this.belt, 72, 88, -230, -102);
        const graphics = this.entranceNode.addComponent(Graphics);
        graphics.fillColor = new Color(91, 77, 143, 110);
        graphics.roundRect(-32, -39, 64, 82, 12);
        graphics.fill();
        graphics.lineWidth = 7;
        graphics.strokeColor = new Color(255, 255, 255, 255);
        graphics.roundRect(-32, -43, 64, 86, 12);
        graphics.stroke();
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(176, 180, 194, 255);
        graphics.roundRect(-24, -35, 48, 46, 8);
        graphics.stroke();
        graphics.fillColor = new Color(245, 247, 252, 230);
        graphics.roundRect(-20, -31, 40, 38, 6);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(146, 148, 163, 255);
        graphics.moveTo(0, -29);
        graphics.lineTo(0, 5);
        graphics.stroke();
        this.entryCountLabel = this.makeLabel(this.entranceNode, '', 12, new Color(255, 230, 72), 19, 36, 26);
    }

    private buildExitUi(): void {
        if (!this.belt) return;
        this.exitNode = this.makeNode('PchExit', this.belt, 126, 102, 0, 98);
        const graphics = this.exitNode.addComponent(Graphics);
        graphics.fillColor = new Color(151, 178, 239, 80);
        graphics.roundRect(-63, -51, 126, 102, 10);
        graphics.fill();
        graphics.lineWidth = 7;
        graphics.lineCap = Graphics.LineCap.ROUND;
        graphics.lineJoin = Graphics.LineJoin.ROUND;
        graphics.strokeColor = new Color(143, 216, 249, 205);
        this.traceArrow(graphics, -28, 9, Math.PI / 2, 13);
        this.traceArrow(graphics, 28, 9, Math.PI / 2, 13);
        graphics.stroke();
    }

    private buildCapacityUi(): void {
        if (!this.belt) return;
        this.capacityBadge = this.makeNode('PchCapacityBadge', this.belt, 124, 64, -70, -30);
        const badgeGraphics = this.capacityBadge.addComponent(Graphics);
        badgeGraphics.fillColor = new Color(69, 58, 123, 245);
        badgeGraphics.roundRect(-62, -32, 124, 64, 16);
        badgeGraphics.fill();
        badgeGraphics.lineWidth = 4;
        badgeGraphics.strokeColor = new Color(229, 226, 255, 255);
        badgeGraphics.roundRect(-60, -30, 120, 60, 14);
        badgeGraphics.stroke();
        this.countLabel = this.makeLabel(this.capacityBadge, '0 / 60', 21, new Color(255, 236, 82), 0, 0, 112);

        this.adButton = this.makeNode('PchCapacityAdButton', this.belt, 132, 64, 72, -30);
        const graphics = this.adButton.addComponent(Graphics);
        graphics.fillColor = new Color(21, 176, 73, 255);
        graphics.roundRect(-66, -32, 132, 64, 16);
        graphics.fill();
        graphics.lineWidth = 4;
        graphics.strokeColor = new Color(183, 255, 194, 255);
        graphics.roundRect(-64, -30, 128, 60, 14);
        graphics.stroke();
        graphics.fillColor = new Color(73, 74, 151, 255);
        graphics.roundRect(-55, -23, 50, 46, 11);
        graphics.fill();
        graphics.fillColor = new Color(102, 89, 166, 255);
        graphics.roundRect(2, -23, 53, 46, 10);
        graphics.fill();
        this.makeLabel(this.adButton, 'AD', 19, Color.WHITE, -30, 0, 48);
        this.makeLabel(this.adButton, '+12', 18, Color.WHITE, 29, 5, 52);
        this.makeLabel(this.adButton, '≫', 16, new Color(183, 233, 255), 29, -12, 52);
        const button = this.adButton.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.94;
        this.adButton.on(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
    }

    private buildSpeedButton(parent: Node): void {
        parent.getChildByName('PchSpeedButton')?.destroy();
        const settingsButton = parent.getChildByName('SettingsButton') || parent.getChildByName('Settings');
        const settingsButtonSize = settingsButton?.getComponent(UITransform)?.contentSize.width;
        const buttonSize = Math.max(1, Number(settingsButtonSize) || PCH_SPEED_BUTTON_FALLBACK_SIZE);
        const buttonX = settingsButton
            ? settingsButton.position.x + buttonSize + PCH_TOP_BUTTON_GAP
            : -214;
        const buttonY = settingsButton?.position.y ?? 568;
        this.speedButton = this.makeNode('PchSpeedButton', parent, buttonSize, buttonSize, buttonX, buttonY);
        const button = this.speedButton.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.92;
        this.speedButton.on(Node.EventType.TOUCH_END, this.onSpeedButtonTap, this);
        this.speedButton.setSiblingIndex(Math.max(0, parent.children.length - 1));
        this.drawSpeedButton();
    }

    private onSpeedButtonTap(event: any): void {
        event.propagationStopped = true;
        if (!this.rules || this.runtime.isGameEnd) return;
        this.manualSpeedMultiplier = this.manualSpeedMultiplier === 1 ? 2 : 1;
        AudioMgr.inst.play('button');
        this.drawSpeedButton();
        if (this.statusLabel) {
            this.statusLabel.string = this.manualSpeedMultiplier === 2 ? '2 倍速度已开启' : '已恢复正常速度';
        }
    }

    private drawSpeedButton(): void {
        if (!this.speedButton?.isValid) return;
        this.speedButton.children.forEach((child) => child.destroy());
        const graphics = this.speedButton.getComponent(Graphics) || this.speedButton.addComponent(Graphics);
        graphics.clear();
        const active = this.manualSpeedMultiplier === 2;
        const buttonSize = this.speedButton.getComponent(UITransform)?.contentSize.width || 85;
        const scale = buttonSize / 72;
        graphics.fillColor = new Color(52, 45, 136, 255);
        graphics.circle(0, -3 * scale, buttonSize / 2);
        graphics.fill();
        graphics.fillColor = active ? new Color(119, 105, 255, 255) : new Color(99, 91, 220, 255);
        graphics.circle(0, scale, buttonSize / 2 - 2.5);
        graphics.fill();
        graphics.lineWidth = active ? 5 : 3;
        graphics.strokeColor = active ? new Color(255, 237, 86, 255) : new Color(166, 181, 255, 255);
        graphics.circle(0, scale, buttonSize / 2 - 5);
        graphics.stroke();
        graphics.fillColor = Color.WHITE;
        for (const offsetX of [-9, 6]) {
            graphics.moveTo((offsetX - 7) * scale, 15 * scale);
            graphics.lineTo((offsetX + 3) * scale, scale);
            graphics.lineTo((offsetX - 7) * scale, -13 * scale);
            graphics.lineTo(offsetX * scale, -13 * scale);
            graphics.lineTo((offsetX + 11) * scale, scale);
            graphics.lineTo(offsetX * scale, 15 * scale);
            graphics.close();
        }
        graphics.fill();
        const badge = this.makeLabel(
            this.speedButton,
            active ? '2X' : '1X',
            Math.round(18 * scale),
            Color.WHITE,
            30 * scale,
            -28 * scale,
            52 * scale,
        );
        badge.node.name = 'PchSpeedBadge';
        (badge as Label & { isBold?: boolean }).isBold = true;
    }

    private strokeBeltPath(graphics: Graphics, width: number, color: Color, offsetY = 0): void {
        graphics.lineWidth = width;
        graphics.strokeColor = color;
        graphics.moveTo(this.beltPath[0].x, this.beltPath[0].y + offsetY);
        for (let i = 1; i < this.beltPath.length; i += 1) {
            graphics.lineTo(this.beltPath[i].x, this.beltPath[i].y + offsetY);
        }
        graphics.close();
        graphics.stroke();
    }

    private traceArrow(graphics: Graphics, x: number, y: number, angle: number, size = 10): void {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        graphics.moveTo(x - cos * size + sin * size * 0.72, y - sin * size - cos * size * 0.72);
        graphics.lineTo(x, y);
        graphics.lineTo(x - cos * size - sin * size * 0.72, y - sin * size + cos * size * 0.72);
    }

    private updateBeltPositions(): void {
        if (!this.rules) return;
        this.carrierNodes.forEach((node, carrierIndex) => {
            node.setPosition(this.pointOnBeltPath(this.wrap01((carrierIndex + this.beltTravel) / this.rules!.carrierCount)));
        });
    }

    private updateFlowArrowPositions(): void {
        if (this.flowArrowNodes.length === 0) return;
        const normalizedTravel = this.rules && this.rules.carrierCount > 0
            ? this.beltTravel / this.rules.carrierCount
            : 0;
        this.flowArrowNodes.forEach((node, index) => {
            const progress = this.wrap01(index / this.flowArrowNodes.length + normalizedTravel);
            const position = this.pointOnBeltPath(progress);
            const before = this.pointOnBeltPath(this.wrap01(progress - 0.004));
            const after = this.pointOnBeltPath(this.wrap01(progress + 0.004));
            const angleDegrees = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
            node.setPosition(position);
            node.setRotationFromEuler(0, 0, angleDegrees);
            const pulse = 0.9 + 0.12 * Math.sin((normalizedTravel + index / this.flowArrowNodes.length) * Math.PI * 2);
            node.setScale(pulse, pulse, 1);
        });
    }

    private pointOnBeltPath(progress: number): Vec3 {
        const distance = this.wrap01(progress) * this.beltPathLength;
        for (let i = 0; i < this.beltPath.length; i += 1) {
            const startDistance = this.beltPathDistances[i];
            const endDistance = i === this.beltPath.length - 1 ? this.beltPathLength : this.beltPathDistances[i + 1];
            if (distance > endDistance) continue;
            const start = this.beltPath[i];
            const end = this.beltPath[(i + 1) % this.beltPath.length];
            const ratio = endDistance === startDistance ? 0 : (distance - startDistance) / (endDistance - startDistance);
            return new Vec3(start.x + (end.x - start.x) * ratio, start.y + (end.y - start.y) * ratio, 0);
        }
        return this.beltPath[0].clone();
    }

    private getEntranceCarrierIndex(): number {
        if (!this.rules) return 0;
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < this.rules.carrierCount; index += 1) {
            const progress = this.wrap01((index + this.beltTravel) / this.rules.carrierCount);
            const distance = Math.min(progress, 1 - progress);
            if (distance >= nearestDistance) continue;
            nearestDistance = distance;
            nearestIndex = index;
        }
        return nearestIndex;
    }

    private onCapacityAdTap(event: any): void {
        event.propagationStopped = true;
        if (!this.rules || this.inputLocked || this.runtime.isGameEnd || this.runtime._adShowing) return;
        if (typeof this.runtime.runRewardedGrant !== 'function') {
            throw new Error('[pch-core] rewarded capacity grant is unavailable');
        }
        AudioMgr.inst.play('button');
        let timerToken = '';
        this.runtime.runRewardedGrant('pch_conveyor_expand', () => {
            const expanded = this.expandCapacity();
            if (expanded) this.runtime.markDynamicCountdownAssisted?.();
            return expanded;
        }, {
            claimKey: `pch_conveyor_expand:${this.runtime.getActiveLogicalLevelId?.() || 0}:${this.rules.bufferCapacity}`,
            busyFlag: '_adShowing',
            onInteractionStarted: () => {
                timerToken = this.runtime.pauseTimerForProp?.('pch-conveyor-expand') || '';
            },
            onInteractionReleased: () => {
                this.runtime.resumeTimerForProp?.(timerToken || 'pch-conveyor-expand');
                timerToken = '';
            },
            grantFailToast: '传送带扩容失败，请重试',
        });
    }

    private expandCapacity(): boolean {
        if (!this.rules) return false;
        const previousCarrierCount = this.rules.carrierCount;
        const phase = this.wrap01(this.beltTravel / previousCarrierCount);
        const added = this.rules.addBufferSlots(PCH_EXPAND_CAPACITY);
        this.beltTravel = phase * this.rules.carrierCount;
        this.renderConveyor();
        this.renderEntranceQueue();
        this.refreshStatus();
        AudioMgr.inst.play('win');
        this.showCapacityBurst(added);
        return added > 0;
    }

    private showCapacityBurst(added: number): void {
        if (!this.belt || !this.adButton) return;
        const burst = this.makeLabel(
            this.belt,
            `+${added}`,
            32,
            new Color(255, 246, 80),
            this.adButton.position.x + 44,
            this.adButton.position.y + 18,
            110,
        );
        burst.node.setScale(0.72, 0.72, 1);
        tween(burst.node)
            .to(0.36, {
                position: new Vec3(this.adButton.position.x + 44, this.adButton.position.y + 92, 0),
                scale: new Vec3(1.22, 1.22, 1),
            }, { easing: 'backOut' })
            .to(0.18, { scale: new Vec3(0.1, 0.1, 1) })
            .call(() => burst.node.destroy())
            .start();
    }

    private wrap01(value: number): number {
        return ((value % 1) + 1) % 1;
    }

    private makeNode(name: string, parent: Node, width: number, height: number, x: number, y: number): Node {
        const node = new Node(name);
        parent.addChild(node);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(x, y, 0);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, height);
        return node;
    }

    private makeLabel(parent: Node, text: string, size: number, color: Color, x: number, y: number, width: number): Label {
        const node = this.makeNode(`PchLabel-${text}`, parent, width, size + 12, x, y);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 5;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

}

export function ensurePchConveyorGameplayController(runtime: any): PchConveyorGameplayController {
    if (!runtime._pchConveyorGameplayController) {
        runtime._pchConveyorGameplayController = new PchConveyorGameplayController(runtime);
    }
    return runtime._pchConveyorGameplayController as PchConveyorGameplayController;
}
