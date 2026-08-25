import {
    BOARD_PLACE_HIT_CELL_RATIO,
    BOARD_PLACE_HIT_MIN_UI,
    BOARD_SELECT_HIT_CELL_RATIO,
    BOARD_SELECT_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_CELL_RATIO,
    BOARD_SLOT_PLACE_HIT_MIN_UI,
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
    Widget,
    view,
} from './GameCtrlShared';
import { BOARD_SLOT_BATCH_MAX_CELLS, BoardSlotBatchRenderer } from './BoardSlotBatchRenderer';
import type { BoardSlotBatchCell } from './BoardSlotBatchRenderer';
import {
    BOARD_OUTLINE_LAYER_NAME,
    BOARD_OUTLINE_TOP_LAYER_NAME,
    buildBoardOutline,
    ensureBoardOutlineLayer,
} from './GameplayBoardOutlineRenderer';
import { debugPerfSnapshot } from './DebugPerfTrace';

const ZOOM_HINT_SCALE_HEADROOM = 0.06;
const GAMEPLAY_TIMER_SCALE = 0.82;
const GAMEPLAY_LEVEL_TITLE_FONT_SIZE = 24;
const GAMEPLAY_LEVEL_TITLE_LINE_HEIGHT = 30;
const GAMEPLAY_LEVEL_TITLE_WIDTH = 180;
const GAMEPLAY_LEVEL_TITLE_HEIGHT = 38;
const GAMEPLAY_LEVEL_TITLE_CENTER_Y = 660;
const GAMEPLAY_TIMER_CENTER_Y = 608;

export function applyGameplayLevelTitleLayout(node: Node, label: Label): void {
    const nodeUi = node.getComponent(UITransform);
    const labelUi = label.node.getComponent(UITransform);
    if (!nodeUi || !labelUi) {
        throw new Error(`[GameplayScene] level title is missing UITransform on ${node.name}`);
    }
    const widget = node.getComponent(Widget);
    if (!widget) {
        throw new Error(`[GameplayScene] level title is missing Widget on ${node.name}`);
    }
    widget.enabled = false;
    node.setPosition(node.position.x, GAMEPLAY_LEVEL_TITLE_CENTER_Y, node.position.z);
    node.setScale(1, 1, 1);
    nodeUi.setContentSize(GAMEPLAY_LEVEL_TITLE_WIDTH, GAMEPLAY_LEVEL_TITLE_HEIGHT);
    labelUi.setContentSize(GAMEPLAY_LEVEL_TITLE_WIDTH, GAMEPLAY_LEVEL_TITLE_HEIGHT);
    label.fontSize = GAMEPLAY_LEVEL_TITLE_FONT_SIZE;
    label.lineHeight = GAMEPLAY_LEVEL_TITLE_LINE_HEIGHT;
    label.enableWrapText = false;
}

export class GameplayViewController {
    constructor(private readonly runtime: any) {}

    private requireSceneSpriteFrame(node: Node, path: string): void {
        const sprite = node.getComponent(Sprite);
        if (!sprite) {
            throw new Error(`[GameplayScene] Game.scene is missing Sprite component on ${path}`);
        }
        if (!sprite.spriteFrame) {
            throw new Error(`[GameplayScene] Game.scene must provide SpriteFrame on ${path}`);
        }
    }

    getGameplayScreenRoot() {
        return this.runtime.requireCanvasUiRoot('ScreenRoot');
    }

    getGameplayRoot() {
        const screenRoot = this.getGameplayScreenRoot();
        return this.runtime.requireUiChild(screenRoot, 'GameplayRoot', 'ScreenRoot/GameplayRoot');
    }

    getGameplayFixedRoot() {
        const gameplayRoot = this.getGameplayRoot();
        return this.runtime.requireUiChild(gameplayRoot, 'GameplayFixedRoot', 'GameplayRoot/GameplayFixedRoot');
    }

    getGameplayRuntimeRoot() {
        const gameplayRoot = this.getGameplayRoot();
        return this.runtime.requireUiChild(gameplayRoot, 'GameplayRuntimeRoot', 'GameplayRoot/GameplayRuntimeRoot');
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
        const batchedBoardSlots = this.countBoardSlotBatchCells();
        if (visibleBoardSlots + batchedBoardSlots === 0) {
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
            inputRoot.off(Node.EventType.TOUCH_CANCEL, runtime.onTouchCancel, runtime);
            inputRoot.off(Node.EventType.MOUSE_WHEEL, runtime.onMouseWheel, runtime);
        }
        runtime.node.off(Node.EventType.TOUCH_START, runtime.onTouchStart, runtime);
        runtime.node.off(Node.EventType.TOUCH_MOVE, runtime.onTouchMove, runtime);
        runtime.node.off(Node.EventType.TOUCH_END, runtime.onTouchEnd, runtime);
        runtime.node.off(Node.EventType.TOUCH_CANCEL, runtime.onTouchCancel, runtime);
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
        if (!bgNode.getComponent(UITransform)) {
            throw new Error('[GameplayScene] Game.scene is missing UITransform on BackgroundLayer/BG');
        }
        return bgNode;
    }

    private getNodePoolSize(pool: any): number {
        const size = pool?.size;
        return typeof size === 'function' ? Math.max(0, Number(size.call(pool)) || 0) : 0;
    }

    private recycleBoardNodeGrid(grid: Array<Array<Node | null>>, pool: any, retainLimit: number) {
        if (!Array.isArray(grid)) return;
        for (const row of grid) {
            if (!Array.isArray(row)) continue;
            for (const node of row) {
                if (!node?.isValid) continue;
                Tween.stopAllByTarget(node);
                const sprite = node.getComponent(Sprite);
                if (sprite) {
                    sprite.spriteFrame = null;
                    sprite.enabled = false;
                }
                node.active = false;
                if (typeof pool?.put === 'function' && this.getNodePoolSize(pool) < retainLimit) {
                    pool.put(node);
                } else {
                    node.removeFromParent();
                    node.destroy();
                }
            }
        }
    }

    private trimBoardNodePool(pool: any, retainLimit: number = 0) {
        if (typeof pool?.get !== 'function') return;
        while (this.getNodePoolSize(pool) > retainLimit) {
            const node = pool.get();
            if (!node) break;
            node.destroy();
        }
    }

    private countBoardVisualCells(correctColors: number[][], width: number, height: number): number {
        let count = 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if ((correctColors[r]?.[c] || 0) > 0) count++;
            }
        }
        return count;
    }

    private acquireBoardSpriteNode(pool: any, name: string, parent: Node, size: number): { node: Node; sprite: Sprite } {
        const node = (typeof pool?.get === 'function' ? pool.get() : null) || new Node(name);
        node.name = name;
        node.layer = Layers.Enum.UI_2D;
        parent.addChild(node);
        let transform = node.getComponent(UITransform);
        if (!transform) transform = node.addComponent(UITransform);
        transform.setContentSize(size, size);
        let sprite = node.getComponent(Sprite);
        if (!sprite) sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = null;
        sprite.enabled = false;
        node.active = true;
        node.setScale(1, 1, 1);
        return { node, sprite };
    }

    private getBoardSlotBatchRenderers(): BoardSlotBatchRenderer[] {
        const runtime = this.runtime;
        const source = Array.isArray(runtime._boardSlotBatchRenderers) ? runtime._boardSlotBatchRenderers : [];
        const renderers: BoardSlotBatchRenderer[] = source.filter(
            (renderer: BoardSlotBatchRenderer | null): renderer is BoardSlotBatchRenderer => !!renderer?.isValid,
        );
        const legacyRenderer = runtime._boardSlotBatchRenderer;
        if (legacyRenderer?.isValid && renderers.indexOf(legacyRenderer) < 0) {
            renderers.unshift(legacyRenderer);
        }
        return renderers;
    }

    private countBoardSlotBatchCells(): number {
        return this.getBoardSlotBatchRenderers().reduce((sum, renderer) => sum + Number(renderer.visibleCellCount || 0), 0);
    }

    private markBoardSlotBatchRenderersForUpdate(): boolean {
        const renderers = this.getBoardSlotBatchRenderers();
        for (const renderer of renderers) {
            renderer.markForUpdateRenderData();
        }
        return renderers.length > 0;
    }

    private prepareBoardSlotBatchRenderer(parent: Node, width: number, height: number, index: number): BoardSlotBatchRenderer {
        const runtime = this.runtime;
        const existingRenderer = Array.isArray(runtime._boardSlotBatchRenderers)
            ? runtime._boardSlotBatchRenderers[index]
            : null;
        const nodeName = index === 0 ? 'BoardSlotBatch' : `BoardSlotBatch_${index}`;
        let batchNode = existingRenderer?.node?.isValid ? existingRenderer.node : null;
        if (!batchNode?.isValid && index === 0 && runtime._boardSlotBatchRenderer?.node?.isValid) {
            batchNode = runtime._boardSlotBatchRenderer.node;
        }
        if (!batchNode?.isValid) {
            batchNode = parent.getChildByName(nodeName);
        }
        if (!batchNode?.isValid) {
            batchNode = new Node(nodeName);
            parent.addChild(batchNode);
        } else if (batchNode.parent !== parent) {
            parent.addChild(batchNode);
        }
        batchNode.name = nodeName;
        batchNode.layer = Layers.Enum.UI_2D;
        batchNode.active = true;
        batchNode.setPosition(0, 0, 0);
        batchNode.setScale(1, 1, 1);
        let transform = batchNode.getComponent(UITransform);
        if (!transform) transform = batchNode.addComponent(UITransform);
        transform.setContentSize(width, height);
        let renderer = batchNode.getComponent(BoardSlotBatchRenderer);
        if (!renderer) renderer = batchNode.addComponent(BoardSlotBatchRenderer);
        return renderer;
    }

    private prepareBoardSlotBatchRenderers(parent: Node, width: number, height: number, batchCount: number): BoardSlotBatchRenderer[] {
        const renderers: BoardSlotBatchRenderer[] = [];
        for (let i = 0; i < batchCount; i++) {
            renderers.push(this.prepareBoardSlotBatchRenderer(parent, width, height, i));
        }
        this.runtime._boardSlotBatchRenderers = renderers;
        this.runtime._boardSlotBatchRenderer = renderers[0] || null;
        return renderers;
    }

    private prepareDragLayer(dragRoot: Node): Node {
        const runtime = this.runtime;
        runtime.clearChildrenExcept(dragRoot, ['DragLayer']);
        let dragLayer = runtime.dragLayer?.isValid ? runtime.dragLayer : dragRoot.getChildByName('DragLayer');
        if (!dragLayer?.isValid) {
            dragLayer = new Node('DragLayer');
            dragRoot.addChild(dragLayer);
        } else if (dragLayer.parent !== dragRoot) {
            dragRoot.addChild(dragLayer);
        }
        const visibleSize = this.getGameplayVisibleSize();
        let transform = dragLayer.getComponent(UITransform);
        if (!transform) transform = dragLayer.addComponent(UITransform);
        transform.setContentSize(visibleSize.width, visibleSize.height);
        dragLayer.layer = Layers.Enum.UI_2D;
        dragLayer.active = true;
        runtime.clearChildrenExcept(dragLayer, []);
        runtime.dragLayer = dragLayer;
        return dragLayer;
    }

    buildUI() {
        const runtime = this.runtime;
        const fixedRoot = this.getGameplayFixedRoot();
        this.requireGameplayBackgroundShell();
        runtime.refreshEquippedGameplayBackground?.(false);
        const runtimeRoot = this.getGameplayRuntimeRoot();
        const backgroundRoot = this.getGameplayRuntimeGroup('BackgroundRuntime');
        const topBarRoot = this.getGameplayFixedGroup('TopBarGroup');
        const boardRoot = this.getGameplayFixedGroup('BoardArea');
        const bottomHudRoot = this.getGameplayBottomHudGroup();
        const slotRoot = this.getGameplayBottomHudChild('SlotAreaGroup');
        const skillRoot = this.getGameplayBottomHudChild('SkillArea');
        const dragRoot = this.getGameplayRuntimeGroup('DragRuntime');
        runtime.clearToastNodes?.();
        Tween.stopAll();
        backgroundRoot.active = true;
        backgroundRoot.destroyAllChildren();
        dragRoot.active = true;
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
        runtime.setupBoardZoomControl?.();
        runtime.buildSkillButtons(skillRoot);
        topBarRoot.setSiblingIndex(Math.max(0, fixedRoot.children.length - 1));

        this.prepareDragLayer(dragRoot);

        runtime.destroyGameplayResultOverlays();

        runtime._sceneInputRoot.on(Node.EventType.TOUCH_START, runtime.onTouchStart, runtime);
        runtime._sceneInputRoot.on(Node.EventType.TOUCH_MOVE, runtime.onTouchMove, runtime);
        runtime._sceneInputRoot.on(Node.EventType.TOUCH_END, runtime.onTouchEnd, runtime);
        runtime._sceneInputRoot.on(Node.EventType.TOUCH_CANCEL, runtime.onTouchCancel, runtime);
        runtime._sceneInputRoot.on(Node.EventType.MOUSE_WHEEL, runtime.onMouseWheel, runtime);

        runtime.refreshEquippedGameplayBackground?.(false);
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
        if (typeof runtime.syncTopHud !== 'function') {
            throw new Error('[TopHud] runtime missing syncTopHud() for Gameplay scene');
        }
        runtime.syncTopHud(root, 'game');
        this.drawLevelTitleLabel(root);
        const timerWrap = runtime.requireUiChild(root, 'TimerWrap', 'TopBarGroup/TimerWrap');
        this.requireSceneSpriteFrame(timerWrap, 'TimerWrap');
        if (Number(runtime.levelData?.levelId) === 1) {
            timerWrap.active = false;
            runtime.timerLabel = null;
            return;
        }
        timerWrap.active = true;
        const timerWidget = timerWrap.getComponent(Widget);
        if (!timerWidget) throw new Error('[GameplayScene] Game.scene is missing Widget component on TimerWrap');
        timerWidget.enabled = false;
        timerWrap.setPosition(timerWrap.position.x, GAMEPLAY_TIMER_CENTER_Y, timerWrap.position.z);
        timerWrap.setScale(GAMEPLAY_TIMER_SCALE, GAMEPLAY_TIMER_SCALE, 1);
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
        if (typeof runtime.syncTopHud !== 'function') {
            throw new Error('[TopHud] runtime missing syncTopHud() for lightweight Gameplay scene');
        }
        runtime.syncTopHud(root, 'game');
        this.drawLevelTitleLabel(root);
        const timerWrap = runtime.requireUiChild(root, 'TimerWrap', 'TopBarGroup/TimerWrap');
        this.requireSceneSpriteFrame(timerWrap, 'TimerWrap');
        if (Number(runtime.levelData?.levelId) === 1) {
            timerWrap.active = false;
            runtime.timerLabel = null;
            return;
        }
        timerWrap.active = true;
        const timerWidget = timerWrap.getComponent(Widget);
        if (!timerWidget) throw new Error('[GameplayScene] Game.scene is missing Widget component on TimerWrap');
        timerWidget.enabled = false;
        timerWrap.setPosition(timerWrap.position.x, GAMEPLAY_TIMER_CENTER_Y, timerWrap.position.z);
        timerWrap.setScale(GAMEPLAY_TIMER_SCALE, GAMEPLAY_TIMER_SCALE, 1);
        const timerNode = runtime.requireUiChild(timerWrap, 'Timer', 'TimerWrap/Timer');
        const timerLabel = timerNode.getComponent(Label);
        if (!timerLabel) throw new Error('[GameplayScene] Game.scene is missing Label component on TimerWrap/Timer');
        timerLabel.string = runtime.formatCurrentTimerText();
        timerLabel.enableWrapText = false;
        runtime.timerLabel = timerLabel;
    }

    drawLevelTitleLabel(parent: Node) {
        const runtime = this.runtime;
        const normalNode = runtime.requireUiChild(parent, 'LevelTitle', 'TopBarGroup/LevelTitle');
        const level1Node = runtime.requireUiChild(parent, 'LevelTitleLevel1', 'TopBarGroup/LevelTitleLevel1');
        const useLevel1Variant = runtime.getActiveLogicalLevelId?.() === 1;
        normalNode.active = !useLevel1Variant;
        level1Node.active = useLevel1Variant;
        const node = useLevel1Variant ? level1Node : normalNode;
        const labelNode = node.getChildByName('Label') || node;
        const label = labelNode.getComponent(Label);
        if (!label) throw new Error(`[GameplayScene] Game.scene is missing Label component on ${useLevel1Variant ? 'TopBarGroup/LevelTitleLevel1/Label' : 'TopBarGroup/LevelTitle/Label'}`);
        applyGameplayLevelTitleLayout(node, label);
        runtime.levelLabel = label;
        runtime.refreshCompletionProgressLabel();
    }

    renderBoardSlots() {
        const runtime = this.runtime;
        if (this.markBoardSlotBatchRenderersForUpdate()) {
            return;
        }
        for (let r = 0; r < runtime.boardModel.height; r++) {
            for (let c = 0; c < runtime.boardModel.width; c++) {
                this.renderLegacyBoardSlotCell(r, c);
            }
        }
    }

    renderBoard() {
        const runtime = this.runtime;
        const hasBatchedSlots = this.markBoardSlotBatchRenderersForUpdate();
        for (let r = 0; r < runtime.boardModel.height; r++) {
            for (let c = 0; c < runtime.boardModel.width; c++) {
                if (!hasBatchedSlots) {
                    this.renderLegacyBoardSlotCell(r, c);
                }
                this.renderCell(r, c);
            }
        }
        runtime.refreshCompletionProgressLabel();
    }

    renderBoardCell(row: number, col: number) {
        if (!this.markBoardSlotBatchRenderersForUpdate()) {
            this.renderLegacyBoardSlotCell(row, col);
        }
        this.renderCell(row, col);
    }

    renderBoardCells(cells: Array<{ row: number; col: number }>) {
        const runtime = this.runtime;
        if (cells.length === 0) return;
        const hasBatchedSlots = this.markBoardSlotBatchRenderersForUpdate();
        const seen = new Set<string>();
        for (const cell of cells) {
            if (cell.row < 0 || cell.row >= runtime.boardModel.height || cell.col < 0 || cell.col >= runtime.boardModel.width) {
                continue;
            }
            const key = `${cell.row},${cell.col}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!hasBatchedSlots) {
                this.renderLegacyBoardSlotCell(cell.row, cell.col);
            }
            this.renderCell(cell.row, cell.col);
        }
        runtime.refreshCompletionProgressLabel();
    }

    renderBoardSlotCell(row: number, col: number) {
        if (this.markBoardSlotBatchRenderersForUpdate()) {
            return;
        }
        this.renderLegacyBoardSlotCell(row, col);
    }

    private renderLegacyBoardSlotCell(row: number, col: number) {
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
        sp.spriteFrame = runtime.requireRenderReadySpriteFrame(
            runtime.getSlotSpriteFrame(correctId),
            `board-slot:${row},${col}:color:${correctId}`,
        );
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
        sp.spriteFrame = runtime.requireRenderReadySpriteFrame(
            runtime.getBeanSpriteFrame(colorId, isLocked),
            `board-bean:${row},${col}:color:${colorId}:locked:${isLocked ? 1 : 0}`,
        );
    }

    getTouchId(touch: any, fallback: number): number {
        if (touch && typeof touch.getID === 'function') {
            const id = touch.getID();
            if (Number.isFinite(id)) {
                return id;
            }
        }
        return fallback;
    }

    getTouchUiPos(touch: any): Vec2 {
        const pos = touch.getUILocation();
        return typeof this.runtime.normalizeGameplayUiPosition === 'function'
            ? this.runtime.normalizeGameplayUiPosition(pos)
            : new Vec2(pos.x, pos.y);
    }

    updateActiveBoardTouches(event: any, removeChanged: boolean = false): number {
        const runtime = this.runtime;
        const allTouches = typeof event?.getAllTouches === 'function'
            ? event.getAllTouches()
            : null;
        if (Array.isArray(allTouches)) {
            const globallyActiveIds = new Set<number>();
            for (let i = 0; i < allTouches.length; i++) {
                globallyActiveIds.add(this.getTouchId(allTouches[i], i));
            }
            const trackedTouchIds = Array.from(runtime.activeBoardTouches.keys()) as number[];
            for (const id of trackedTouchIds) {
                if (!globallyActiveIds.has(id)) {
                    runtime.activeBoardTouches.delete(id);
                }
            }
        }

        const currentTouch = event?.touch || event;
        if (currentTouch && typeof currentTouch.getUILocation === 'function') {
            const id = this.getTouchId(currentTouch, 0);
            if (removeChanged) {
                runtime.activeBoardTouches.delete(id);
            } else {
                runtime.activeBoardTouches.set(id, this.getTouchUiPos(currentTouch));
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

    private fitBoardViewportToSafeRect(boardWidth: number, boardHeight: number, padding: number): void {
        const runtime = this.runtime;
        const safeRect = runtime.getBoardSafeViewportRect();
        const availableW = Math.max(1, safeRect.right - safeRect.left);
        const availableH = Math.max(1, safeRect.top - safeRect.bottom);
        const targetBounds = this.getTargetContentBounds(runtime.levelData.correctColorArr || [], boardWidth, boardHeight);
        const targetCols = Math.max(1, targetBounds.maxCol - targetBounds.minCol + 1);
        const targetRows = Math.max(1, targetBounds.maxRow - targetBounds.minRow + 1);
        const step = runtime.cellSize + runtime.cellGap;
        const targetW = targetCols * step - runtime.cellGap + padding;
        const targetH = targetRows * step - runtime.cellGap + padding;
        const maxDim = Math.max(boardWidth, boardHeight);
        const widthFitRatio = 0.985;
        const heightFitRatio = 0.985;
        const widthScale = availableW * widthFitRatio / Math.max(1, targetW);
        const heightScale = availableH * heightFitRatio / Math.max(1, targetH);
        const rawInitScale = Math.min(widthScale, heightScale);
        const minScale = Number(runtime.constructor.MIN_SCALE) || 0.7;
        const baseMaxScale = Math.max(minScale, Number(runtime.constructor.MAX_SCALE) || 2.2);
        const playableCellUiSize = Math.max(1, Number(runtime.constructor.BOARD_PLAYABLE_CELL_UI_SIZE) || 32);
        const dynamicMaxScaleCap = Math.max(baseMaxScale, Number(runtime.constructor.BOARD_DYNAMIC_MAX_SCALE_CAP) || baseMaxScale);
        const maxScale = Math.max(
            baseMaxScale,
            Math.min(dynamicMaxScaleCap, playableCellUiSize / Math.max(1, runtime.cellSize)),
        );
        runtime.boardViewport.setScaleBounds(minScale, maxScale);
        const levelId = Number(runtime.levelData?.levelId) || 0;
        const baseInitScale = Math.max(
            minScale,
            Math.min(maxScale, Number.isFinite(rawInitScale) && rawInitScale > 0 ? rawInitScale : 1),
        );
        const starterInitialScaleMultiplier = levelId === 2 ? 1.025 : 1;
        const zoomHintScaleHeadroom = runtime._activeGameplayGuideLayoutMode === 'zoom'
            ? Math.min(ZOOM_HINT_SCALE_HEADROOM, Math.max(0, (maxScale - minScale) / 2))
            : 0;
        const initMinScale = minScale + zoomHintScaleHeadroom;
        const initMaxScale = maxScale - zoomHintScaleHeadroom;
        const initScale = Math.max(
            initMinScale,
            Math.min(initMaxScale, baseInitScale * starterInitialScaleMultiplier),
        );
        const targetCenterX = ((targetBounds.minCol + targetBounds.maxCol + 1) / 2 - boardWidth / 2) * step;
        const targetCenterY = (boardHeight / 2 - (targetBounds.minRow + targetBounds.maxRow + 1) / 2) * step;
        const viewportCenterX = (safeRect.left + safeRect.right) / 2;
        const starterBoardLift = levelId === 1 || levelId === 2 ? 64 : 0;
        const viewportCenterY = (safeRect.bottom + safeRect.top) / 2 + starterBoardLift;
        runtime.boardViewport.setViewTransformClamped(
            initScale,
            new Vec2(
                viewportCenterX - targetCenterX * initScale,
                viewportCenterY - targetCenterY * initScale,
            ),
        );
        runtime.boardViewScale = runtime.boardViewport.scale;
        runtime.boardViewport.setHomeFromCurrent();
        const homeTransform = runtime.boardViewport.getHomeTransform();
        runtime.boardHomeScale = homeTransform.scale;
        runtime.boardHomePos = new Vec3(homeTransform.offset.x, homeTransform.offset.y, 0);
    }

    refitBoardViewportToSafeRect(): void {
        const runtime = this.runtime;
        if (!runtime.levelData || !runtime.boardViewport) return;
        const boardWidth = runtime.levelData.boardWidth;
        const boardHeight = runtime.levelData.boardHeight;
        const maxDim = Math.max(boardWidth, boardHeight);
        const padding = maxDim > 20 ? 8 : 28;
        this.fitBoardViewportToSafeRect(boardWidth, boardHeight, padding);
    }

    buildBoard(root: Node) {
        const runtime = this.runtime;
        const buildStartedAt = Date.now();
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
        const boardVisualCellCount = this.countBoardVisualCells(runtime.boardModel.correctColors, bw, bh);
        debugPerfSnapshot('board.build.start', runtime, {
            boardVisualCellCount,
        });
        this.recycleBoardNodeGrid(runtime.cellNodes, runtime._boardCellPool, boardVisualCellCount);
        runtime.clearChildrenExcept(runtime.boardNode, [BOARD_OUTLINE_LAYER_NAME, BOARD_OUTLINE_TOP_LAYER_NAME, 'BoardSlots']);

        runtime.boardSlotsNode = runtime.requireUiChild(runtime.boardNode, 'BoardSlots', 'Board/BoardSlots');
        runtime.boardSlotsNode.layer = Layers.Enum.UI_2D;
        runtime.boardSlotsNode.getComponent(UITransform)?.setContentSize(boardW, boardH);
        runtime.boardSlotsNode.setPosition(0, 0, 0);
        this.recycleBoardNodeGrid(runtime.boardSlotBgNodes, runtime._boardSlotBgPool, boardVisualCellCount);
        runtime.clearChildrenExcept(runtime.boardSlotsNode, []);
        runtime._boardSlotBatchRenderers = [];
        runtime._boardSlotBatchRenderer = null;
        const slotIndex = Math.max(0, runtime.boardNode.children.indexOf(runtime.boardSlotsNode));
        const clearBoardOutlineChildren = runtime.clearChildrenExcept.bind(runtime);
        const outlineStartedAt = Date.now();
        const boardOutlineLayer = ensureBoardOutlineLayer(runtime.boardNode, BOARD_OUTLINE_LAYER_NAME, boardW, boardH, slotIndex + 1, clearBoardOutlineChildren);
        const boardOutlineTopLayer = ensureBoardOutlineLayer(runtime.boardNode, BOARD_OUTLINE_TOP_LAYER_NAME, boardW, boardH, slotIndex + 2, clearBoardOutlineChildren);
        buildBoardOutline(boardOutlineLayer, boardOutlineTopLayer, runtime.boardModel.correctColors, runtime.cellSize, runtime.cellGap, bw, bh);
        const outlineDurationMs = Date.now() - outlineStartedAt;

        this.fitBoardViewportToSafeRect(bw, bh, padding);

        const slotBatchCells: BoardSlotBatchCell[] = [];
        runtime.cellNodes = [];
        runtime.boardSlotBgNodes = [];
        const cellNodeBuildStartedAt = Date.now();
        for (let r = 0; r < bh; r++) {
            runtime.cellNodes[r] = [];
            runtime.boardSlotBgNodes[r] = [];
            for (let c = 0; c < bw; c++) {
                const correctId = runtime.boardModel.correctColors[r]?.[c] || 0;
                if (correctId <= 0) {
                    runtime.cellNodes[r][c] = null;
                    runtime.boardSlotBgNodes[r][c] = null;
                    continue;
                }
                const x = (c - bw / 2 + 0.5) * (runtime.cellSize + runtime.cellGap);
                const y = ((bh / 2 - 0.5) - r) * (runtime.cellSize + runtime.cellGap);

                const slotFrame = runtime.requireRenderReadySpriteFrame(
                    runtime.getSlotSpriteFrame(correctId),
                    `board-slot-batch:${r},${c}:color:${correctId}`,
                );
                slotBatchCells.push({
                    x,
                    y,
                    size: runtime.getBoardSlotVisualSize(),
                    spriteFrame: slotFrame,
                });
                runtime.boardSlotBgNodes[r][c] = null;

                const { node: cell, sprite: sp } = this.acquireBoardSpriteNode(
                    runtime._boardCellPool,
                    `cell_${r}_${c}`,
                    runtime.boardNode,
                    runtime.getBoardBeanVisualSize(),
                );
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                cell.setPosition(x, y);
                runtime.cellNodes[r][c] = cell;
            }
        }
        const cellNodeBuildDurationMs = Date.now() - cellNodeBuildStartedAt;
        const slotBatchStartedAt = Date.now();
        const slotBatchCount = Math.ceil(slotBatchCells.length / BOARD_SLOT_BATCH_MAX_CELLS);
        const slotBatchRenderers = this.prepareBoardSlotBatchRenderers(runtime.boardSlotsNode, boardW, boardH, slotBatchCount);
        for (let i = 0; i < slotBatchRenderers.length; i++) {
            const start = i * BOARD_SLOT_BATCH_MAX_CELLS;
            slotBatchRenderers[i].configure(slotBatchCells.slice(start, start + BOARD_SLOT_BATCH_MAX_CELLS));
        }
        const slotBatchDurationMs = Date.now() - slotBatchStartedAt;
        this.trimBoardNodePool(runtime._boardCellPool, 0);
        this.trimBoardNodePool(runtime._boardSlotBgPool, 0);
        debugPerfSnapshot('board.build.finish', runtime, {
            boardVisualCellCount,
            slotBatchCount,
            outlineDurationMs,
            cellNodeBuildDurationMs,
            slotBatchDurationMs,
            durationMs: Date.now() - buildStartedAt,
        });
    }
}

export function ensureGameplayViewController(runtime: any): GameplayViewController {
    if (!runtime._gameplayViewController) {
        runtime._gameplayViewController = new GameplayViewController(runtime);
    }
    return runtime._gameplayViewController as GameplayViewController;
}
