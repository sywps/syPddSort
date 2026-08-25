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
    UIOpacity,
    Vec2,
    Vec3,
    Widget,
    instantiate,
    tween,
} from './GameCtrlShared';
import {
    buildOpeningPatternMoves,
    getOpeningPatternStaggerDelay,
    type OpeningPatternMove,
} from './OpeningPatternTransition';
import {
    PchConveyorRules,
    type PchSkillBeanSource,
    type PchSkillResult,
} from './PchConveyorRules';

const BELT_STEP_SECONDS = 0.28;
const PCH_TRANSFER_SECONDS = 0.16;
const PCH_ENTRY_STAGGER_SECONDS = 0.012;
const PCH_RETURN_TRANSFER_SECONDS = 0.2;
const PCH_RETURN_STAGGER_SECONDS = 0.028;
const PCH_RETURN_PULSE_UP_SECONDS = 0.08;
const PCH_RETURN_PULSE_SETTLE_SECONDS = 0.15;
const PCH_SKILL_STAGGER_SECONDS = 0.028;
const PCH_SKILL_TRANSFER_SECONDS = 0.2;
const PCH_EXPAND_CAPACITY = 12;
const PCH_ENTRANCE_SNAP_PROGRESS = 0.032;
const OPENING_PATTERN_HOLD_SECONDS = 0.26;
const OPENING_PATTERN_MOVE_SECONDS = 0.54;
const INBOUND_SPARK_COUNT = 3;

interface OpeningPatternVisual {
    move: OpeningPatternMove;
    node: Node;
    homePosition: Vec3;
    targetPosition: Vec3;
}

interface ConveyorLayoutBindings {
    node: Node;
    carrierLayer: Node;
    carrierTemplate: Node;
    entranceNode: Node;
    exitNode: Node;
    capacityBadge: Node;
    countLabel: Label;
    entryCountLabel: Label;
    adButton: Node;
}

export class PchConveyorGameplayController {
    private root: Node | null = null;
    private belt: Node | null = null;
    private normalLayout: Node | null = null;
    private compactLayout: Node | null = null;
    private carrierLayer: Node | null = null;
    private carrierTemplate: Node | null = null;
    private inputRoot: Node | null = null;
    private statusLabel: Label | null = null;
    private countLabel: Label | null = null;
    private capacityBadge: Node | null = null;
    private entryCountLabel: Label | null = null;
    private entranceNode: Node | null = null;
    private exitNode: Node | null = null;
    private adButton: Node | null = null;
    private speedButton: Node | null = null;
    private speedInactiveState: Node | null = null;
    private speedActiveState: Node | null = null;
    private speedBadgeLabel: Label | null = null;
    private rules: PchConveyorRules | null = null;
    private carrierNodes: Node[] = [];
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
    private openingPatternVisuals: OpeningPatternVisual[] = [];
    private openingPatternState: 'idle' | 'ready' | 'running' | 'done' = 'idle';
    private openingPatternGeneration = 0;

    constructor(private readonly runtime: any) {
        this.prepareBeltPath();
    }

    start(): void {
        this.stop();
        if (!this.runtime.boardModel
            || typeof this.runtime.renderBoard !== 'function'
            || typeof this.runtime.renderBoardCells !== 'function') {
            throw new Error('[pch-core] original board renderer is unavailable');
        }
        if (typeof this.runtime.getBeanSpriteFrame !== 'function'
            || typeof this.runtime.requireRenderReadySpriteFrame !== 'function'
            || typeof this.runtime.requireBrightSpriteFrame !== 'function'
            || typeof this.runtime.attachBrightOverlay !== 'function'
            || typeof this.runtime.renderBoardCell !== 'function'
            || typeof this.runtime.getBoardCellWorldPosition !== 'function'
            || typeof this.runtime.gameLose !== 'function') {
            throw new Error('[pch-core] original bean sprite or placement feedback is unavailable');
        }
        this.runtime.requireBrightSpriteFrame();
        this.rules = new PchConveyorRules(
            this.runtime.boardModel,
            this.runtime.levelData?.conveyorCapacity,
        );
        this.beltTravel = 0;
        this.inputLocked = true;
        this.activeReturnAnimations = 0;
        this.runtime.detachGameplayInputHandlers?.();

        const fixedRoot = this.runtime.getGameplayFixedRoot();
        this.root = this.requireConveyorNode(fixedRoot, 'PchConveyorRoot', 'GameplayFixedRoot/PchConveyorRoot');
        const normalLayout = this.bindConveyorLayout(this.root, 'NormalLayout');
        const compactLayout = this.bindConveyorLayout(this.root, 'CompactLayout');
        this.clearConveyorLayoutRuntime(normalLayout.node);
        this.clearConveyorLayoutRuntime(compactLayout.node);
        const skillRoot = this.runtime.getGameplayBottomHudChild('SkillArea');
        const useCompactLayout = ['SkillMagnet', 'SkillBrush', 'SkillFreeze']
            .some((name) => skillRoot.getChildByName(name)?.activeInHierarchy);
        normalLayout.node.active = !useCompactLayout;
        compactLayout.node.active = useCompactLayout;
        const activeLayout = useCompactLayout ? compactLayout : normalLayout;
        this.normalLayout = normalLayout.node;
        this.compactLayout = compactLayout.node;
        this.belt = activeLayout.node;
        this.carrierLayer = activeLayout.carrierLayer;
        this.carrierTemplate = activeLayout.carrierTemplate;
        this.entranceNode = activeLayout.entranceNode;
        this.exitNode = activeLayout.exitNode;
        this.capacityBadge = activeLayout.capacityBadge;
        this.countLabel = activeLayout.countLabel;
        this.entryCountLabel = activeLayout.entryCountLabel;
        this.adButton = activeLayout.adButton;
        this.adButton.off(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
        this.adButton.on(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
        this.root.active = true;
        this.inputRoot = this.runtime._sceneInputRoot?.isValid ? this.runtime._sceneInputRoot : fixedRoot;
        this.inputRoot.on(Node.EventType.TOUCH_START, this.onRootTouchStart, this);
        this.inputRoot.on(Node.EventType.TOUCH_MOVE, this.onRootTouchMove, this);
        this.inputRoot.on(Node.EventType.TOUCH_END, this.onRootTouchEnd, this, true);
        this.inputRoot.on(Node.EventType.TOUCH_CANCEL, this.onRootTouchCancel, this);
        this.inputRoot.on(Node.EventType.MOUSE_WHEEL, this.onRootMouseWheel, this);
        this.renderGame();
        this.runtime.refitBoardViewportToSafeRect?.();

        const topBar = this.runtime.getGameplayFixedGroup('TopBarGroup');
        this.bindSpeedButton(topBar);
        this.prepareOpeningPatternShuffle();
    }

    playOpeningPatternShuffle(): void {
        if (this.openingPatternState !== 'ready') {
            throw new Error(`[pch-opening] transition is not ready: ${this.openingPatternState}`);
        }
        if (!this.root?.isValid || !this.rules) {
            throw new Error('[pch-opening] gameplay root is unavailable');
        }
        const visuals = this.openingPatternVisuals;
        if (visuals.length === 0) throw new Error('[pch-opening] transition has no visual beans');
        const generation = this.openingPatternGeneration;
        const stagger = getOpeningPatternStaggerDelay(visuals.length);
        const firstDuration = OPENING_PATTERN_MOVE_SECONDS * 0.46;
        const secondDuration = OPENING_PATTERN_MOVE_SECONDS - firstDuration;
        let remaining = visuals.length;
        this.openingPatternState = 'running';

        visuals.forEach((visual, index) => {
            const spin = this.getOpeningPatternSpin(visual.move);
            const midpoint = this.getOpeningPatternArcMidpoint(visual, index);
            tween(visual.node)
                .delay(OPENING_PATTERN_HOLD_SECONDS + index * stagger)
                .to(firstDuration, {
                    position: midpoint,
                    scale: new Vec3(0.84, 1.06, 1),
                    angle: spin * 0.56,
                }, { easing: 'quadIn' })
                .to(secondDuration, {
                    position: visual.targetPosition,
                    scale: new Vec3(1, 1, 1),
                    angle: spin,
                }, { easing: 'quadOut' })
                .call(() => {
                    if (generation !== this.openingPatternGeneration || this.openingPatternState !== 'running') return;
                    remaining -= 1;
                    if (remaining <= 0) this.completeOpeningPatternShuffle(generation);
                })
                .start();
        });
    }

    private prepareOpeningPatternShuffle(): void {
        const board = this.runtime.boardModel;
        const moves = buildOpeningPatternMoves(board.correctColors, board.currentColors);
        const visuals = moves.map((move): OpeningPatternVisual => {
            const node = this.runtime.cellNodes?.[move.source.row]?.[move.source.col] || null;
            const targetNode = this.runtime.cellNodes?.[move.target.row]?.[move.target.col] || null;
            const sprite = node?.getComponent(Sprite) || null;
            if (!node?.isValid || !targetNode?.isValid || !sprite) {
                throw new Error(
                    `[pch-opening] missing cell visual ${move.source.row},${move.source.col}`
                    + ` -> ${move.target.row},${move.target.col}`,
                );
            }
            return {
                move,
                node,
                homePosition: node.position.clone(),
                targetPosition: targetNode.position.clone(),
            };
        });

        this.openingPatternGeneration += 1;
        this.openingPatternVisuals = visuals;
        this.openingPatternState = 'ready';
        this.inputLocked = true;
        for (const visual of visuals) {
            const sprite = visual.node.getComponent(Sprite)!;
            Tween.stopAllByTarget(visual.node);
            visual.node.active = true;
            visual.node.setPosition(visual.homePosition);
            visual.node.setScale(1, 1, 1);
            visual.node.angle = 0;
            sprite.enabled = true;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.runtime.requireRenderReadySpriteFrame(
                this.runtime.getBeanSpriteFrame(visual.move.colorId, false),
                `pch-opening:${visual.move.source.row},${visual.move.source.col}:color:${visual.move.colorId}`,
            );
        }
    }

    private completeOpeningPatternShuffle(generation: number): void {
        if (generation !== this.openingPatternGeneration || this.openingPatternState !== 'running') return;
        this.openingPatternState = 'done';
        this.restoreOpeningPatternVisuals(false, true);
        this.inputLocked = false;
    }

    private cancelOpeningPatternShuffle(restoreBoard: boolean): void {
        const hadVisuals = this.openingPatternVisuals.length > 0;
        this.openingPatternGeneration += 1;
        this.openingPatternState = 'idle';
        this.restoreOpeningPatternVisuals(true, restoreBoard && hadVisuals);
    }

    private restoreOpeningPatternVisuals(stopTweens: boolean, renderBoard: boolean): void {
        for (const visual of this.openingPatternVisuals) {
            if (!visual.node?.isValid) continue;
            if (stopTweens) Tween.stopAllByTarget(visual.node);
            visual.node.setPosition(visual.homePosition);
            visual.node.setScale(1, 1, 1);
            visual.node.angle = 0;
        }
        this.openingPatternVisuals = [];
        if (renderBoard && this.runtime.boardModel) this.runtime.renderBoard();
    }

    private getOpeningPatternArcMidpoint(visual: OpeningPatternVisual, index: number): Vec3 {
        const dx = visual.targetPosition.x - visual.homePosition.x;
        const dy = visual.targetPosition.y - visual.homePosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.001) return visual.homePosition.clone();
        const arc = Math.min(Math.max(4, Number(this.runtime.cellSize) * 0.72 || 4), distance * 0.18);
        const sign = ((index + visual.move.colorId) & 1) === 0 ? 1 : -1;
        return new Vec3(
            visual.homePosition.x + dx * 0.5 - dy / distance * arc * sign,
            visual.homePosition.y + dy * 0.5 + dx / distance * arc * sign,
            visual.homePosition.z,
        );
    }

    private getOpeningPatternSpin(move: OpeningPatternMove): number {
        const hash = (
            ((move.source.row + 1) * 73856093)
            ^ ((move.source.col + 1) * 19349663)
            ^ (move.colorId * 83492791)
        ) >>> 0;
        const direction = (hash & 1) === 0 ? 1 : -1;
        return direction * (140 + hash % 181);
    }

    stop(): void {
        this.cancelOpeningPatternShuffle(true);
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
            this.stopNodeTreeTweens(bean);
            bean.destroy();
        }
        for (const node of this.activePulseNodes) {
            if (!node?.isValid) continue;
            Tween.stopAllByTarget(node);
            node.setScale(1, 1, 1);
        }
        if (this.root?.isValid) {
            Tween.stopAllByTarget(this.root);
            for (const layout of [this.normalLayout, this.compactLayout]) {
                if (layout?.isValid) this.clearConveyorLayoutRuntime(layout);
            }
            if (this.normalLayout?.isValid) this.normalLayout.active = true;
            if (this.compactLayout?.isValid) this.compactLayout.active = false;
            this.root.active = false;
        }
        if (this.adButton?.isValid) {
            this.adButton.off(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
        }
        if (this.speedButton?.isValid) {
            this.speedButton.off(Node.EventType.TOUCH_END, this.onSpeedButtonTap, this);
            this.speedButton.active = false;
        }
        this.root = null;
        this.belt = null;
        this.normalLayout = null;
        this.compactLayout = null;
        this.carrierLayer = null;
        this.carrierTemplate = null;
        this.inputRoot = null;
        this.statusLabel = null;
        this.countLabel = null;
        this.capacityBadge = null;
        this.entryCountLabel = null;
        this.entranceNode = null;
        this.exitNode = null;
        this.adButton = null;
        this.speedButton = null;
        this.speedInactiveState = null;
        this.speedActiveState = null;
        this.speedBadgeLabel = null;
        this.rules = null;
        this.carrierNodes = [];
        this.activeFlyBeans.clear();
        this.activePulseNodes.clear();
        this.activeReturnAnimations = 0;
        this.inputLocked = false;
        this.skillMovementPaused = false;
        this.skillTimerPauseToken = '';
    }

    update(deltaTime: number): void {
        if (!this.rules || this.runtime.isGameEnd) return;
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
        if (this.hasDirectButtonTarget(event)) return;
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

    private hasDirectButtonTarget(event: any): boolean {
        let node = event?.target as Node | null;
        while (node?.isValid && node !== this.inputRoot) {
            if (node.getComponent(Button)) return true;
            node = node.parent;
        }
        return false;
    }

    private handleScaledSettingsButtonTap(rawPos: { x: number; y: number }, uiPos: Vec2, event: any): boolean {
        if (Math.abs(uiPos.x - rawPos.x) < 0.5 && Math.abs(uiPos.y - rawPos.y) < 0.5) return false;
        const topBar = this.runtime.getGameplayFixedGroup?.('TopBarGroup') || null;
        const node = topBar?.getChildByName('Settings') || null;
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
        const flightDelay = staggerIndex * PCH_ENTRY_STAGGER_SECONDS;
        this.attachInboundStarlight(bean, sourceBeanSize, bean.position.clone(), targetLocal, flightDelay);
        tween(bean)
            .delay(flightDelay)
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
            .to(PCH_RETURN_TRANSFER_SECONDS, {
                position: targetLocal,
                scale: new Vec3(targetScale, targetScale, 1),
            }, { easing: 'sineOut' })
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

    private attachInboundStarlight(
        bean: Node,
        size: number,
        sourceLocal: Vec3,
        targetLocal: Vec3,
        flightDelaySeconds: number,
    ): void {
        const halo = this.runtime.attachBrightOverlay(bean, size * 1.5, 132, 1.08) as Node;
        const haloOpacity = halo?.getComponent(UIOpacity) || null;
        if (!halo?.isValid || !haloOpacity) {
            throw new Error('[pch-starlight] inbound halo is missing UIOpacity');
        }
        halo.name = 'PchInboundHalo';
        halo.setSiblingIndex(0);
        tween(haloOpacity)
            .delay(flightDelaySeconds)
            .to(0.055, { opacity: 225 }, { easing: 'sineOut' })
            .to(0.105, { opacity: 118 }, { easing: 'sineIn' })
            .start();

        const dx = targetLocal.x - sourceLocal.x;
        const dy = targetLocal.y - sourceLocal.y;
        const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        const directionX = dx / distance;
        const directionY = dy / distance;
        const sideX = -directionY;
        const sideY = directionX;
        const sparkleSize = Math.max(7, size * 0.52);
        const lateralOffsets = [-0.42, 0.36, -0.12];

        for (let index = 0; index < INBOUND_SPARK_COUNT; index += 1) {
            const trailDistance = size * (0.72 + index * 0.52);
            const lateral = size * lateralOffsets[index];
            const startX = -directionX * trailDistance + sideX * lateral;
            const startY = -directionY * trailDistance + sideY * lateral;
            const sparkle = this.makeNode(
                `PchInboundSpark-${index}`,
                bean,
                sparkleSize,
                sparkleSize,
                startX,
                startY,
            );
            const graphics = sparkle.addComponent(Graphics);
            this.drawInboundSparkle(graphics, sparkleSize * 0.48, index);
            const opacity = sparkle.addComponent(UIOpacity);
            opacity.opacity = 160;
            const startScale = 0.82 + index * 0.08;
            sparkle.setScale(startScale, startScale, 1);
            const delay = flightDelaySeconds + index * 0.012;
            const drift = size * (0.24 + index * 0.05);
            tween(sparkle)
                .delay(delay)
                .to(0.13, {
                    position: new Vec3(
                        startX - directionX * drift,
                        startY - directionY * drift,
                        0,
                    ),
                    scale: new Vec3(0.32, 0.32, 1),
                    angle: (index % 2 === 0 ? 1 : -1) * (38 + index * 19),
                }, { easing: 'sineOut' })
                .start();
            tween(opacity)
                .delay(delay)
                .to(0.04, { opacity: 255 }, { easing: 'sineOut' })
                .to(0.12, { opacity: 0 }, { easing: 'quadIn' })
                .start();
        }
    }

    private drawInboundSparkle(graphics: Graphics, radius: number, index: number): void {
        const innerRadius = radius * 0.22;
        graphics.fillColor = index === 1
            ? new Color(255, 255, 255, 255)
            : new Color(255, 224, 72, 255);
        for (let point = 0; point < 8; point += 1) {
            const angle = Math.PI / 2 - point * Math.PI / 4;
            const pointRadius = point % 2 === 0 ? radius : innerRadius;
            const x = Math.cos(angle) * pointRadius;
            const y = Math.sin(angle) * pointRadius;
            if (point === 0) graphics.moveTo(x, y);
            else graphics.lineTo(x, y);
        }
        graphics.close();
        graphics.fill();
        graphics.fillColor = Color.WHITE;
        graphics.circle(0, 0, Math.max(0.8, radius * 0.13));
        graphics.fill();
    }

    private stopNodeTreeTweens(node: Node): void {
        for (const child of [...node.children]) this.stopNodeTreeTweens(child);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
        Tween.stopAllByTarget(node);
    }

    private destroyFlyBean(bean: Node): void {
        this.activeFlyBeans.delete(bean);
        if (!bean?.isValid) return;
        this.stopNodeTreeTweens(bean);
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
                .delay(index * PCH_SKILL_STAGGER_SECONDS)
                .to(PCH_SKILL_TRANSFER_SECONDS, {
                    position: targetLocal,
                    scale: new Vec3(targetSize / source.size, targetSize / source.size, 1),
                }, { easing: 'sineOut' })
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
        if (!this.rules || !this.belt || !this.carrierLayer || !this.carrierTemplate) return;
        this.carrierLayer.children
            .filter((node) => node.name.startsWith('PchCarrier-'))
            .forEach((node) => node.destroy());
        this.carrierNodes = [];
        this.rules.carriers.forEach((stack, carrierIndex) => {
            const carrier = instantiate(this.carrierTemplate!);
            carrier.name = `PchCarrier-${carrierIndex}`;
            carrier.active = true;
            this.carrierLayer!.addChild(carrier);
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
            const labelIndex = this.entryCountLabel?.node?.getSiblingIndex() ?? 1;
            bean.setSiblingIndex(Math.max(1, labelIndex));
        });
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

    private requireConveyorNode(parent: Node, name: string, path: string): Node {
        const node = parent.getChildByName(name);
        if (!node?.isValid || !node.getComponent(UITransform)) {
            throw new Error(`[pch-core] Game.scene must provide UITransform on ${path}`);
        }
        return node;
    }

    private requireConveyorSprite(parent: Node, name: string, path: string): Node {
        const node = this.requireConveyorNode(parent, name, path);
        const sprite = node.getComponent(Sprite);
        if (!sprite?.spriteFrame) {
            throw new Error(`[pch-core] Game.scene must provide SpriteFrame on ${path}`);
        }
        return node;
    }

    private requireConveyorLabel(parent: Node, name: string, path: string): Label {
        const node = this.requireConveyorNode(parent, name, path);
        const label = node.getComponent(Label);
        if (!label) throw new Error(`[pch-core] Game.scene must provide Label on ${path}`);
        return label;
    }

    private bindConveyorLayout(root: Node, name: 'NormalLayout' | 'CompactLayout'): ConveyorLayoutBindings {
        const basePath = `GameplayFixedRoot/PchConveyorRoot/${name}`;
        const node = this.requireConveyorNode(root, name, basePath);
        this.requireConveyorSprite(node, 'PchMovingTrack', `${basePath}/PchMovingTrack`);
        const carrierLayer = this.requireConveyorNode(node, 'CarrierLayer', `${basePath}/CarrierLayer`);
        const carrierTemplate = this.requireConveyorNode(
            carrierLayer,
            'PchCarrierTemplate',
            `${basePath}/CarrierLayer/PchCarrierTemplate`,
        );
        if (carrierTemplate.active) {
            throw new Error(`[pch-core] Game.scene carrier template must be inactive on ${basePath}`);
        }
        this.requireConveyorSprite(
            carrierTemplate,
            'Groove',
            `${basePath}/CarrierLayer/PchCarrierTemplate/Groove`,
        );
        const entranceNode = this.requireConveyorNode(node, 'PchEntrance', `${basePath}/PchEntrance`);
        this.requireConveyorSprite(entranceNode, 'Visual', `${basePath}/PchEntrance/Visual`);
        const entryCountLabel = this.requireConveyorLabel(
            entranceNode,
            'EntryCount',
            `${basePath}/PchEntrance/EntryCount`,
        );
        const exitNode = this.requireConveyorNode(node, 'PchExit', `${basePath}/PchExit`);
        this.requireConveyorSprite(exitNode, 'Visual', `${basePath}/PchExit/Visual`);
        const capacityBadge = this.requireConveyorNode(node, 'PchCapacityBadge', `${basePath}/PchCapacityBadge`);
        this.requireConveyorSprite(capacityBadge, 'Visual', `${basePath}/PchCapacityBadge/Visual`);
        const countLabel = this.requireConveyorLabel(
            capacityBadge,
            'CapacityCount',
            `${basePath}/PchCapacityBadge/CapacityCount`,
        );
        const adButton = this.requireConveyorNode(node, 'PchCapacityAdButton', `${basePath}/PchCapacityAdButton`);
        if (!adButton.getComponent(Button)) {
            throw new Error(`[pch-core] Game.scene must provide Button on ${basePath}/PchCapacityAdButton`);
        }
        this.requireConveyorSprite(adButton, 'Visual', `${basePath}/PchCapacityAdButton/Visual`);
        for (const labelName of ['AdLabel', 'ExpandLabel', 'ExpandArrow']) {
            this.requireConveyorLabel(adButton, labelName, `${basePath}/PchCapacityAdButton/${labelName}`);
        }
        return {
            node,
            carrierLayer,
            carrierTemplate,
            entranceNode,
            exitNode,
            capacityBadge,
            countLabel,
            entryCountLabel,
            adButton,
        };
    }

    private clearConveyorLayoutRuntime(layout: Node): void {
        const carrierLayer = layout.getChildByName('CarrierLayer');
        carrierLayer?.children
            .filter((node) => node.name.startsWith('PchCarrier-'))
            .forEach((node) => node.destroy());
        const entrance = layout.getChildByName('PchEntrance');
        entrance?.children
            .filter((node) => node.name.startsWith('PchEntryBean-'))
            .forEach((node) => node.destroy());
        layout.children
            .filter((node) => node.name.startsWith('PchLabel-+'))
            .forEach((node) => node.destroy());
    }

    private bindSpeedButton(parent: Node): void {
        const speedButton = parent.getChildByName('PchSpeedButton');
        if (!speedButton?.isValid) {
            throw new Error('[pch-core] Game.scene is missing TopBarGroup/PchSpeedButton');
        }
        if (!speedButton.getComponent(UITransform)) {
            throw new Error('[pch-core] Game.scene is missing UITransform on TopBarGroup/PchSpeedButton');
        }
        if (!speedButton.getComponent(Widget)) {
            throw new Error('[pch-core] Game.scene is missing Widget on TopBarGroup/PchSpeedButton');
        }
        if (!speedButton.getComponent(Button)) {
            throw new Error('[pch-core] Game.scene is missing Button on TopBarGroup/PchSpeedButton');
        }
        const inactiveState = speedButton.getChildByName('InactiveState');
        const activeState = speedButton.getChildByName('ActiveState');
        const badgeNode = speedButton.getChildByName('PchSpeedBadge');
        const inactiveSprite = inactiveState?.getComponent(Sprite);
        const activeSprite = activeState?.getComponent(Sprite);
        const badgeLabel = badgeNode?.getComponent(Label);
        if (!inactiveState?.isValid || !inactiveState.getComponent(UITransform) || !inactiveSprite?.spriteFrame) {
            throw new Error('[pch-core] Game.scene must provide UITransform and SpriteFrame on TopBarGroup/PchSpeedButton/InactiveState');
        }
        if (!activeState?.isValid || !activeState.getComponent(UITransform) || !activeSprite?.spriteFrame) {
            throw new Error('[pch-core] Game.scene must provide UITransform and SpriteFrame on TopBarGroup/PchSpeedButton/ActiveState');
        }
        if (!badgeNode?.isValid || !badgeNode.getComponent(UITransform) || !badgeLabel) {
            throw new Error('[pch-core] Game.scene must provide UITransform and Label on TopBarGroup/PchSpeedButton/PchSpeedBadge');
        }
        speedButton.off(Node.EventType.TOUCH_END, this.onSpeedButtonTap, this);
        speedButton.on(Node.EventType.TOUCH_END, this.onSpeedButtonTap, this);
        this.speedButton = speedButton;
        this.speedInactiveState = inactiveState;
        this.speedActiveState = activeState;
        this.speedBadgeLabel = badgeLabel;
        speedButton.active = true;
        this.refreshSpeedButtonState();
    }

    private onSpeedButtonTap(event: any): void {
        event.propagationStopped = true;
        if (!this.rules || this.inputLocked || this.runtime.isGameEnd) return;
        this.manualSpeedMultiplier = this.manualSpeedMultiplier === 1 ? 2 : 1;
        AudioMgr.inst.play('button');
        this.refreshSpeedButtonState();
        if (this.statusLabel) {
            this.statusLabel.string = this.manualSpeedMultiplier === 2 ? '2 倍速度已开启' : '已恢复正常速度';
        }
    }

    private refreshSpeedButtonState(): void {
        if (!this.speedButton?.isValid
            || !this.speedInactiveState?.isValid
            || !this.speedActiveState?.isValid
            || !this.speedBadgeLabel?.isValid) return;
        const active = this.manualSpeedMultiplier === 2;
        this.speedInactiveState.active = !active;
        this.speedActiveState.active = active;
        this.speedBadgeLabel.string = active ? '2X' : '1X';
    }

    private updateBeltPositions(): void {
        if (!this.rules) return;
        this.carrierNodes.forEach((node, carrierIndex) => {
            node.setPosition(this.pointOnBeltPath(this.wrap01((carrierIndex + this.beltTravel) / this.rules!.carrierCount)));
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
