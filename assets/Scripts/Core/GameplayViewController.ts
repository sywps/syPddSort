import {
    AudioMgr,
    BOARD_PLACE_HIT_CELL_RATIO,
    BOARD_PLACE_HIT_MIN_UI,
    BOARD_SELECT_HIT_CELL_RATIO,
    BOARD_SELECT_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_CELL_RATIO,
    BOARD_SLOT_PLACE_HIT_MIN_UI,
    Button,
    DEFAULT_CELL_SIZE,
    Graphics,
    Label,
    Layers,
    MAINLINE_SLOT_GROOVE_TEXTURE,
    Node,
    Sprite,
    Tween,
    UITransform,
    Vec2,
    Vec3,
    view,
} from './GameCtrlShared';

export class GameplayViewController {
    constructor(private readonly runtime: any) {}

    private ensureSettingsIconFrame(iconNode: Node, path: string): void {
        const sprite = iconNode.getComponent(Sprite);
        if (!sprite) {
            throw new Error(`[GameplayScene] Game.scene is missing Sprite component on ${path}`);
        }
        if (!sprite.spriteFrame) {
            const frame = this.runtime.getSF('设置') || this.runtime.getSF('home_settings');
            if (!frame) {
                throw new Error(`[GameplayScene] missing SpriteFrame 设置/home_settings for ${path}`);
            }
            sprite.spriteFrame = frame;
        }
    }

    private ensureTimerWrapFrame(timerWrap: Node): void {
        const sprite = timerWrap.getComponent(Sprite);
        if (!sprite) {
            throw new Error('[GameplayScene] Game.scene is missing Sprite component on TimerWrap');
        }
        if (!sprite.spriteFrame) {
            const frame = this.runtime.getSF('倒计时');
            if (!frame) {
                throw new Error('[GameplayScene] missing gameAssets SpriteFrame 倒计时 for TimerWrap');
            }
            sprite.spriteFrame = frame;
        }
    }

    getGameplayScreenRoot() {
        return this.runtime.requireCanvasUiRoot('ScreenRoot');
    }

    getGameplayFixedRoot() {
        const screenRoot = this.getGameplayScreenRoot();
        return this.runtime.requireUiChild(screenRoot, 'GameplayFixedRoot', 'ScreenRoot/GameplayFixedRoot');
    }

    getGameplayRuntimeRoot() {
        const screenRoot = this.getGameplayScreenRoot();
        return this.runtime.requireUiChild(screenRoot, 'GameplayRuntimeRoot', 'ScreenRoot/GameplayRuntimeRoot');
    }

    getGameplayRuntimeGroup(name: string) {
        const runtimeRoot = this.getGameplayRuntimeRoot();
        return this.runtime.requireUiChild(runtimeRoot, name, `GameplayRuntimeRoot/${name}`);
    }

    getGameplayFixedGroup(name: string) {
        const fixedRoot = this.getGameplayFixedRoot();
        return this.runtime.requireUiChild(fixedRoot, name, `GameplayFixedRoot/${name}`);
    }

    getGameplayBottomHudGroup() {
        const fixedRoot = this.getGameplayFixedRoot();
        return this.runtime.requireUiChild(fixedRoot, 'BottomHudGroup', 'GameplayFixedRoot/BottomHudGroup');
    }

    getGameplayBottomHudChild(name: string) {
        const bottomHudRoot = this.getGameplayBottomHudGroup();
        return this.runtime.requireUiChild(bottomHudRoot, name, `BottomHudGroup/${name}`);
    }

    getGameplayVisibleSize(): { width: number; height: number } {
        const viewSize = view.getVisibleSize();
        const frameSize = view.getFrameSize();
        const fallbackW = this.runtime.constructor.VIEWPORT_WIDTH;
        const fallbackH = this.runtime.constructor.VIEWPORT_HEIGHT;
        let width = Math.max(viewSize.width || 0, fallbackW);
        let height = Math.max(viewSize.height || 0, fallbackH);
        if (frameSize.width > 0 && frameSize.height > 0) {
            const frameAspect = frameSize.width / frameSize.height;
            height = Math.max(height, width / frameAspect);
            width = Math.max(width, height * frameAspect);
        }
        return { width: Math.ceil(width), height: Math.ceil(height) };
    }

    applyGameplayBottomHudPosition(root: Node = this.getGameplayBottomHudGroup()) {
        return root;
    }

    assertGameplayVisualReadiness() {
        const runtime = this.runtime;
        if (!runtime.levelData || !runtime.boardModel || !runtime.slotModel) {
            throw new Error('[GameplayVisual] model not ready after buildUI');
        }
        if (!runtime.boardGroup?.isValid || !runtime.boardNode?.isValid) {
            throw new Error('[GameplayVisual] board root missing after buildBoard');
        }
        if (!runtime.slotAreaNode?.isValid) {
            throw new Error('[GameplayVisual] slot area missing after buildSlotArea');
        }
        if (runtime.cellNodes.length === 0 || runtime.boardSlotBgNodes.length === 0) {
            throw new Error('[GameplayVisual] board cell nodes missing after buildBoard');
        }
        if (runtime.slotNodes.length === 0 || runtime.slotMarkerNodes.length === 0) {
            throw new Error('[GameplayVisual] slot nodes missing after buildSlotArea');
        }
        const slotPanel = runtime.slotAreaNode.getChildByName('SlotPanel');
        if (!slotPanel?.isValid) {
            throw new Error('[GameplayVisual] SlotPanel missing after buildSlotArea');
        }
        const panelSprite = slotPanel.getComponent(Sprite);
        const panelGraphics = slotPanel.getComponent(Graphics);
        if (!panelSprite?.spriteFrame && !panelGraphics) {
            throw new Error('[GameplayVisual] SlotPanel has no sprite or placeholder graphics');
        }
        let sampleCorrectId = 0;
        outer:
        for (let r = 0; r < runtime.boardModel.height; r++) {
            for (let c = 0; c < runtime.boardModel.width; c++) {
                const correctId = runtime.boardModel.correctColors[r][c];
                if (correctId > 0) {
                    sampleCorrectId = correctId;
                    break outer;
                }
            }
        }
        if (sampleCorrectId > 0 && !runtime.getSlotSpriteFrame(sampleCorrectId)) {
            throw new Error(`[GameplayVisual] board slot sprite missing for color ${sampleCorrectId}`);
        }
        const sampleMarker = runtime.slotMarkerNodes.find((node: Node) => node?.isValid) || null;
        if (sampleMarker) {
            const markerSprite = sampleMarker.getComponent(Sprite);
            const markerGraphics = sampleMarker.getComponent(Graphics);
            if (markerSprite && !markerSprite.spriteFrame && !markerGraphics) {
                throw new Error(`[GameplayVisual] slot groove sprite missing: ${MAINLINE_SLOT_GROOVE_TEXTURE}`);
            }
        }
        let visibleBoardSlots = 0;
        for (const row of runtime.boardSlotBgNodes) {
            for (const node of row) {
                const sp = node?.getComponent(Sprite) || null;
                if (sp?.enabled && sp.spriteFrame) {
                    visibleBoardSlots++;
                }
            }
        }
        if (visibleBoardSlots === 0) {
            throw new Error('[GameplayVisual] board slot sprites all hidden after render');
        }
        let visibleSlotMarkers = 0;
        for (const marker of runtime.slotMarkerNodes) {
            if (!marker?.isValid || !marker.active) continue;
            const sp = marker.getComponent(Sprite);
            const g = marker.getComponent(Graphics);
            if ((sp && sp.enabled && sp.spriteFrame) || (g && g.enabled)) {
                visibleSlotMarkers++;
            }
        }
        const hasAnySlotBean = runtime.slotModel.getAll().some((block: any) => !!block);
        if (!hasAnySlotBean && visibleSlotMarkers === 0) {
            throw new Error('[GameplayVisual] slot markers all hidden after render');
        }
    }

    detachGameplayInputHandlers() {
        const runtime = this.runtime;
        const inputRoot = runtime._sceneInputRoot && runtime._sceneInputRoot.isValid
            ? runtime._sceneInputRoot
            : null;
        if (inputRoot) {
            inputRoot.off(Node.EventType.TOUCH_START, runtime.onTouchStart, runtime);
            inputRoot.off(Node.EventType.TOUCH_MOVE, runtime.onTouchMove, runtime);
            inputRoot.off(Node.EventType.TOUCH_END, runtime.onTouchEnd, runtime);
            inputRoot.off(Node.EventType.TOUCH_CANCEL, runtime.onTouchEnd, runtime);
            inputRoot.off(Node.EventType.MOUSE_WHEEL, runtime.onMouseWheel, runtime);
        }
        runtime.node.off(Node.EventType.TOUCH_START, runtime.onTouchStart, runtime);
        runtime.node.off(Node.EventType.TOUCH_MOVE, runtime.onTouchMove, runtime);
        runtime.node.off(Node.EventType.TOUCH_END, runtime.onTouchEnd, runtime);
        runtime.node.off(Node.EventType.TOUCH_CANCEL, runtime.onTouchEnd, runtime);
        runtime.node.off(Node.EventType.MOUSE_WHEEL, runtime.onMouseWheel, runtime);
        runtime._sceneInputRoot = null;
    }

    requireGameplayBackgroundShell() {
        const backgroundRoot = this.getGameplayFixedGroup('BackgroundLayer');
        const bgNode = backgroundRoot.getChildByName('BG');
        if (!bgNode?.isValid) {
            throw new Error('[GameplayScene] Game.scene is missing BackgroundLayer/BG');
        }
        bgNode.active = true;
        bgNode.layer = Layers.Enum.UI_2D;
        const bgUi = bgNode.getComponent(UITransform);
        if (bgUi) {
            const visibleSize = this.getGameplayVisibleSize();
            bgUi.setContentSize(visibleSize.width, visibleSize.height);
        }
        return bgNode;
    }

    buildUI() {
        const runtime = this.runtime;
        const fixedRoot = this.getGameplayFixedRoot();
        this.requireGameplayBackgroundShell();
        const runtimeRoot = this.getGameplayRuntimeRoot();
        const backgroundRoot = this.getGameplayRuntimeGroup('BackgroundRuntime');
        const topBarRoot = this.getGameplayFixedGroup('TopBarGroup');
        const boardRoot = this.getGameplayFixedGroup('BoardArea');
        const bottomHudRoot = this.getGameplayBottomHudGroup();
        const slotRoot = this.getGameplayBottomHudChild('SlotAreaGroup');
        const skillRoot = this.getGameplayBottomHudChild('SkillArea');
        const dragRoot = this.getGameplayRuntimeGroup('DragRuntime');
        Tween.stopAll();
        for (const group of [backgroundRoot, dragRoot]) {
            group.active = true;
            group.destroyAllChildren();
        }
        boardRoot.active = true;
        bottomHudRoot.active = true;
        slotRoot.active = true;
        skillRoot.active = true;
        runtimeRoot.active = true;
        runtime.timerLabel = null!;
        runtime.completionLabel = null;
        runtime.levelLabel = null!;
        runtime._vigorCountLbl = null;
        runtime._goldCountLbl = null;
        runtime._shopGoldLbl = null;

        runtime._sceneInputRoot = this.getGameplayScreenRoot();
        this.buildTopBar(topBarRoot);
        runtime.buildSlotArea(slotRoot);
        this.buildBoard(boardRoot);
        runtime.buildSkillButtons(skillRoot);
        topBarRoot.setSiblingIndex(Math.max(0, fixedRoot.children.length - 1));

        runtime.dragLayer = new Node('DragLayer');
        dragRoot.addChild(runtime.dragLayer);
        const visibleSize = this.getGameplayVisibleSize();
        runtime.dragLayer.addComponent(UITransform).setContentSize(visibleSize.width, visibleSize.height);
        runtime.dragLayer.layer = Layers.Enum.UI_2D;

        runtime.destroyGameplayResultOverlays();
        runtime.panelWin = runtime.createWinSettlementPanel();
        runtime.panelLose = runtime.createLoseSettlementPanel();
        runtime.panelTimeoutContinue = runtime.createReviveSettlementPanel();

        runtime._sceneInputRoot.on(Node.EventType.TOUCH_START, runtime.onTouchStart, runtime);
        runtime._sceneInputRoot.on(Node.EventType.TOUCH_MOVE, runtime.onTouchMove, runtime);
        runtime._sceneInputRoot.on(Node.EventType.TOUCH_END, runtime.onTouchEnd, runtime);
        runtime._sceneInputRoot.on(Node.EventType.TOUCH_CANCEL, runtime.onTouchEnd, runtime);
        runtime._sceneInputRoot.on(Node.EventType.MOUSE_WHEEL, runtime.onMouseWheel, runtime);
    }

    buildTopBar(root: Node) {
        const runtime = this.runtime;
        if (runtime.shouldHideTopBar()) {
            root.active = false;
            return;
        }
        root.active = true;
        if (runtime.shouldUseLightweightTopBar()) {
            this.buildLightweightTopBar(root);
            return;
        }
        const gear = runtime.requireUiChild(root, 'Settings', 'TopBarGroup/Settings');
        const settingsIcon = runtime.requireUiChild(gear, 'SettingsIcon', 'Settings/SettingsIcon');
        this.ensureSettingsIconFrame(settingsIcon, 'Settings/SettingsIcon');
        gear.getComponent(Button) || gear.addComponent(Button);
        gear.targetOff(runtime);
        gear.on(Button.EventType.CLICK, () => {
            AudioMgr.inst.play('button');
            runtime.openSettingsPanel();
        }, runtime);
        this.drawLevelTitleLabel(root);
        const timerWrap = runtime.requireUiChild(root, 'TimerWrap', 'TopBarGroup/TimerWrap');
        this.ensureTimerWrapFrame(timerWrap);
        const timerNode = runtime.requireUiChild(timerWrap, 'Timer', 'TimerWrap/Timer');
        const timerLabel = timerNode.getComponent(Label);
        if (!timerLabel) throw new Error('[GameplayScene] Game.scene is missing Label component on TimerWrap/Timer');
        timerLabel.string = runtime.formatCurrentTimerText();
        timerLabel.enableWrapText = false;
        runtime.timerLabel = timerLabel;
    }

    buildLightweightTopBar(root: Node) {
        const runtime = this.runtime;
        root.active = true;
        const gearBtn = runtime.requireUiChild(root, 'Settings', 'TopBarGroup/Settings');
        gearBtn.getComponent(Button) || gearBtn.addComponent(Button);
        gearBtn.targetOff(runtime);
        gearBtn.on(Button.EventType.CLICK, () => {
            AudioMgr.inst.play('button');
            runtime.openSettingsPanel();
        }, runtime);
        const settingsIcon = runtime.requireUiChild(gearBtn, 'SettingsIcon', 'Settings/SettingsIcon');
        this.ensureSettingsIconFrame(settingsIcon, 'Settings/SettingsIcon');
        this.drawLevelTitleLabel(root);
        const timerWrap = runtime.requireUiChild(root, 'TimerWrap', 'TopBarGroup/TimerWrap');
        this.ensureTimerWrapFrame(timerWrap);
        const timerNode = runtime.requireUiChild(timerWrap, 'Timer', 'TimerWrap/Timer');
        const timerLabel = timerNode.getComponent(Label);
        if (!timerLabel) throw new Error('[GameplayScene] Game.scene is missing Label component on TimerWrap/Timer');
        timerLabel.string = runtime.formatCurrentTimerText();
        timerLabel.enableWrapText = false;
        runtime.timerLabel = timerLabel;
    }

    drawLevelTitleLabel(parent: Node) {
        const runtime = this.runtime;
        const node = runtime.requireUiChild(parent, 'LevelTitle', 'TopBarGroup/LevelTitle');
        const labelNode = node.getChildByName('Label') || node;
        const label = labelNode.getComponent(Label);
        if (!label) throw new Error('[GameplayScene] Game.scene is missing Label component on TopBarGroup/LevelTitle/Label');
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.enableWrapText = false;
        label.overflow = Label.Overflow.SHRINK;
        runtime.levelLabel = label;
        runtime.refreshCompletionProgressLabel();
    }

    renderBoardSlots() {
        const runtime = this.runtime;
        for (let r = 0; r < runtime.boardModel.height; r++) {
            for (let c = 0; c < runtime.boardModel.width; c++) {
                this.renderBoardSlotCell(r, c);
            }
        }
    }

    renderBoard() {
        const runtime = this.runtime;
        for (let r = 0; r < runtime.boardModel.height; r++) {
            for (let c = 0; c < runtime.boardModel.width; c++) {
                this.renderBoardSlotCell(r, c);
                this.renderCell(r, c);
            }
        }
        runtime.refreshCompletionProgressLabel();
    }

    renderBoardCell(row: number, col: number) {
        this.renderBoardSlotCell(row, col);
        this.renderCell(row, col);
    }

    renderBoardCells(cells: Array<{ row: number; col: number }>) {
        const runtime = this.runtime;
        if (cells.length === 0) return;
        const seen = new Set<string>();
        for (const cell of cells) {
            if (cell.row < 0 || cell.row >= runtime.boardModel.height || cell.col < 0 || cell.col >= runtime.boardModel.width) {
                continue;
            }
            const key = `${cell.row},${cell.col}`;
            if (seen.has(key)) continue;
            seen.add(key);
            this.renderBoardCell(cell.row, cell.col);
        }
        runtime.refreshCompletionProgressLabel();
    }

    renderBoardSlotCell(row: number, col: number) {
        const runtime = this.runtime;
        const node = runtime.boardSlotBgNodes[row]?.[col] || null;
        if (!node) return;
        const sp = node.getComponent(Sprite);
        if (!sp) return;
        const correctId = runtime.boardModel.correctColors[row][col];
        if (correctId === 0) {
            sp.enabled = false;
            return;
        }
        runtime.setNodeSquareSize(node, runtime.getBoardSlotVisualSize());
        sp.enabled = true;
        sp.spriteFrame = runtime.getSlotSpriteFrame(correctId);
    }

    renderCell(row: number, col: number) {
        const runtime = this.runtime;
        const node = runtime.cellNodes[row]?.[col] || null;
        if (!node) return;
        const sp = node.getComponent(Sprite);
        if (!sp) return;
        const colorIdRaw = runtime.boardModel.currentColors[row][col];
        const correctId = runtime.boardModel.correctColors[row][col];
        const isLocked = runtime.boardModel.locked[row][col];
        if (correctId === 0 && colorIdRaw === 0) {
            sp.enabled = false;
            return;
        }
        const cellKey = `${row},${col}`;
        const isFlyingTarget = runtime._flyingTargets.has(cellKey) || runtime._hiddenBoardCells.has(cellKey);
        const colorId = isFlyingTarget ? 0 : colorIdRaw;
        runtime.setNodeSquareSize(node, runtime.getBoardBeanVisualSize());
        if (colorId === 0) {
            sp.enabled = false;
            return;
        }
        sp.enabled = true;
        sp.spriteFrame = runtime.getBeanSpriteFrame(colorId, isLocked);
    }

    getTouchId(touch: any, fallback: number): number {
        if (touch && typeof touch.getID === 'function') {
            return touch.getID();
        }
        return fallback;
    }

    getTouchUiPos(touch: any): Vec2 {
        const pos = touch.getUILocation();
        return new Vec2(pos.x, pos.y);
    }

    updateActiveBoardTouches(event: any, removeChanged: boolean = false): number {
        const runtime = this.runtime;
        const touches = event.getAllTouches();
        const activeIds = new Set<number>();
        for (let i = 0; i < touches.length; i++) {
            const touch = touches[i] as any;
            const id = this.getTouchId(touch, i);
            activeIds.add(id);
            runtime.activeBoardTouches.set(id, this.getTouchUiPos(touch));
        }
        if (!removeChanged) {
            for (const id of Array.from(runtime.activeBoardTouches.keys())) {
                if (!activeIds.has(id)) {
                    runtime.activeBoardTouches.delete(id);
                }
            }
        } else {
            const changedTouches = typeof event.getTouches === 'function' ? event.getTouches() : touches;
            for (let i = 0; i < changedTouches.length; i++) {
                const touch = changedTouches[i] as any;
                runtime.activeBoardTouches.delete(this.getTouchId(touch, i));
            }
        }
        return runtime.activeBoardTouches.size;
    }

    uiToViewportParent(uiPos: Vec2): Vec2 {
        return this.runtime.boardViewport.uiToViewportParent(uiPos);
    }

    beginBoardPanFromUiPos(uiPos: Vec2, immediate: boolean = false) {
        const runtime = this.runtime;
        if (!runtime.levelData || !runtime.boardGroup || !runtime.boardGroup.isValid) {
            runtime.setGestureMode('idle');
            return;
        }
        runtime.panStartPos.set(uiPos.x, uiPos.y);
        const parentPos = this.uiToViewportParent(uiPos);
        runtime.panStartParentPos.set(parentPos.x, parentPos.y);
        const gp = runtime.boardGroup.position;
        runtime.panStartGroupPos.set(gp.x, gp.y, gp.z);
        runtime.setGestureMode(immediate ? 'panning' : 'tapCandidate');
    }

    worldToBoardLocal(worldPos: Vec3): Vec2 | null {
        return this.runtime.boardViewport.worldToBoardLocal(worldPos);
    }

    uiToBoardLocal(uiPos: Vec2): Vec2 | null {
        return this.runtime.boardViewport.uiToBoardLocal(uiPos);
    }

    boardLocalToGrid(localPos: Vec2, margin: number = 0) {
        const runtime = this.runtime;
        return runtime.boardViewport.boardLocalToGrid(
            localPos,
            runtime.levelData.boardWidth,
            runtime.levelData.boardHeight,
            runtime.cellSize,
            runtime.cellGap,
            margin,
        );
    }

    getDistanceToBoardCellRect(localPos: Vec2, row: number, col: number): number {
        const runtime = this.runtime;
        const center = runtime.getBoardCellCenterLocal(row, col);
        const halfSize = runtime.cellSize / 2;
        const dx = Math.max(Math.abs(localPos.x - center.x) - halfSize, 0);
        const dy = Math.max(Math.abs(localPos.y - center.y) - halfSize, 0);
        return Math.sqrt(dx * dx + dy * dy);
    }

    getBoardHitToleranceLocalByConfig(minUi: number, ratio: number): number {
        const runtime = this.runtime;
        const sourceNode = runtime.boardNode?.isValid ? runtime.boardNode : runtime.boardGroup;
        const worldScale = sourceNode?.isValid
            ? sourceNode.getWorldScale(new Vec3())
            : null;
        const measuredScale = Math.max(
            Math.abs(worldScale?.x || 0),
            Math.abs(worldScale?.y || 0),
            Math.abs(runtime.boardGroup?.scale?.x || 0),
        );
        const scale = Math.max(0.1, measuredScale || 1);
        return Math.max(minUi / scale, runtime.cellSize * ratio);
    }

    getBoardHitToleranceLocal(kind: 'select' | 'place'): number {
        const minUi = kind === 'place' ? BOARD_PLACE_HIT_MIN_UI : BOARD_SELECT_HIT_MIN_UI;
        const ratio = kind === 'place' ? BOARD_PLACE_HIT_CELL_RATIO : BOARD_SELECT_HIT_CELL_RATIO;
        return this.getBoardHitToleranceLocalByConfig(minUi, ratio);
    }

    getSlotBoardPlaceToleranceLocal(): number {
        return this.getBoardHitToleranceLocalByConfig(
            BOARD_SLOT_PLACE_HIT_MIN_UI,
            BOARD_SLOT_PLACE_HIT_CELL_RATIO,
        );
    }

    getBoardCandidateRadius(tolerance: number): number {
        const runtime = this.runtime;
        const step = Math.max(1, runtime.cellSize + runtime.cellGap);
        return Math.max(1, Math.min(3, Math.ceil(tolerance / step) + 1));
    }

    private getTargetContentBounds(correctColorArr: number[][], boardWidth: number, boardHeight: number) {
        let minRow = boardHeight;
        let maxRow = -1;
        let minCol = boardWidth;
        let maxCol = -1;
        for (let row = 0; row < boardHeight; row++) {
            const line = correctColorArr[row] || [];
            for (let col = 0; col < boardWidth; col++) {
                if (Math.floor(Number(line[col]) || 0) <= 0) continue;
                minRow = Math.min(minRow, row);
                maxRow = Math.max(maxRow, row);
                minCol = Math.min(minCol, col);
                maxCol = Math.max(maxCol, col);
            }
        }
        if (maxRow < 0) {
            return { minRow: 0, maxRow: Math.max(0, boardHeight - 1), minCol: 0, maxCol: Math.max(0, boardWidth - 1) };
        }
        return { minRow, maxRow, minCol, maxCol };
    }

    buildBoard(root: Node) {
        const runtime = this.runtime;
        const bw = runtime.levelData.boardWidth;
        const bh = runtime.levelData.boardHeight;
        const maxBoardPx = 660;
        const maxDim = Math.max(bw, bh);
        runtime.cellGap = 0;
        const padding = maxDim > 20 ? 8 : 28;
        const minCellSize = maxDim > 48 ? 6 : (maxDim > 32 ? 8 : 12);
        runtime.cellSize = Math.min(DEFAULT_CELL_SIZE, Math.floor((maxBoardPx - (maxDim - 1) * runtime.cellGap - padding) / maxDim));
        runtime.cellSize = Math.max(minCellSize, runtime.cellSize);

        const boardW = bw * (runtime.cellSize + runtime.cellGap) - runtime.cellGap + padding;
        const boardH = bh * (runtime.cellSize + runtime.cellGap) - runtime.cellGap + padding;
        runtime.boardGroup = runtime.requireUiChild(root, 'BoardGroup', 'BoardArea/BoardGroup');
        runtime.boardGroup.layer = Layers.Enum.UI_2D;
        runtime.boardGroup.setScale(1, 1, 1);

        runtime.boardNode = runtime.requireUiChild(runtime.boardGroup, 'Board', 'BoardGroup/Board');
        runtime.boardNode.layer = Layers.Enum.UI_2D;
        runtime.boardNode.getComponent(UITransform)?.setContentSize(boardW, boardH);
        runtime.boardNode.setPosition(0, 0, 0);
        runtime.clearChildrenExcept(runtime.boardNode, ['BoardBg', 'BoardSlots']);

        const boardBg = runtime.requireUiChild(runtime.boardNode, 'BoardBg', 'Board/BoardBg');
        boardBg.layer = Layers.Enum.UI_2D;
        boardBg.getComponent(UITransform)?.setContentSize(boardW, boardH);
        boardBg.setPosition(0, 0, 0);

        runtime.boardSlotsNode = runtime.requireUiChild(runtime.boardNode, 'BoardSlots', 'Board/BoardSlots');
        runtime.boardSlotsNode.layer = Layers.Enum.UI_2D;
        runtime.boardSlotsNode.getComponent(UITransform)?.setContentSize(boardW, boardH);
        runtime.boardSlotsNode.setPosition(0, 0, 0);
        runtime.clearChildrenExcept(runtime.boardSlotsNode, []);

        const safeRect = runtime.getBoardSafeViewportRect();
        const availableW = Math.max(1, safeRect.right - safeRect.left);
        const availableH = Math.max(1, safeRect.top - safeRect.bottom);
        const targetBounds = this.getTargetContentBounds(runtime.levelData.correctColorArr || [], bw, bh);
        const targetCols = Math.max(1, targetBounds.maxCol - targetBounds.minCol + 1);
        const targetRows = Math.max(1, targetBounds.maxRow - targetBounds.minRow + 1);
        const step = runtime.cellSize + runtime.cellGap;
        const targetW = targetCols * step - runtime.cellGap + padding;
        const targetH = targetRows * step - runtime.cellGap + padding;
        const widthFitRatio = 0.9;
        const heightFitRatio = maxDim >= 24 ? 0.84 : 0.9;
        const widthScale = availableW * widthFitRatio / Math.max(1, targetW);
        const heightScale = availableH * heightFitRatio / Math.max(1, targetH);
        const initScale = Math.min(widthScale, heightScale);
        const targetCenterX = ((targetBounds.minCol + targetBounds.maxCol + 1) / 2 - bw / 2) * step;
        const targetCenterY = (bh / 2 - (targetBounds.minRow + targetBounds.maxRow + 1) / 2) * step;
        const viewportCenterX = (safeRect.left + safeRect.right) / 2;
        const viewportCenterY = (safeRect.bottom + safeRect.top) / 2;
        runtime.boardViewport.setViewTransformClamped(
            initScale,
            new Vec2(
                viewportCenterX - targetCenterX * initScale,
                viewportCenterY - targetCenterY * initScale,
            ),
            false,
        );
        runtime.boardViewScale = runtime.boardViewport.scale;
        runtime.boardHomeScale = runtime.boardViewport.scale;
        runtime.boardHomePos = new Vec3(runtime.boardGroup.position.x, runtime.boardGroup.position.y, 0);

        runtime.cellNodes = [];
        runtime.boardSlotBgNodes = [];
        for (let r = 0; r < bh; r++) {
            runtime.cellNodes[r] = [];
            runtime.boardSlotBgNodes[r] = [];
            for (let c = 0; c < bw; c++) {
                const x = (c - bw / 2 + 0.5) * (runtime.cellSize + runtime.cellGap);
                const y = ((bh / 2 - 0.5) - r) * (runtime.cellSize + runtime.cellGap);

                const slotBg = new Node(`slotbg_${r}_${c}`);
                runtime.boardSlotsNode.addChild(slotBg);
                slotBg.addComponent(UITransform).setContentSize(runtime.getBoardSlotVisualSize(), runtime.getBoardSlotVisualSize());
                slotBg.layer = Layers.Enum.UI_2D;
                const slotSp = slotBg.addComponent(Sprite);
                slotSp.sizeMode = Sprite.SizeMode.CUSTOM;
                slotBg.setPosition(x, y);
                runtime.boardSlotBgNodes[r][c] = slotBg;

                const cell = new Node(`cell_${r}_${c}`);
                runtime.boardNode.addChild(cell);
                cell.addComponent(UITransform).setContentSize(runtime.getBoardBeanVisualSize(), runtime.getBoardBeanVisualSize());
                cell.layer = Layers.Enum.UI_2D;
                const sp = cell.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                cell.setPosition(x, y);
                runtime.cellNodes[r][c] = cell;
            }
        }
    }
}

export function ensureGameplayViewController(runtime: any): GameplayViewController {
    if (!runtime._gameplayViewController) {
        runtime._gameplayViewController = new GameplayViewController(runtime);
    }
    return runtime._gameplayViewController as GameplayViewController;
}
