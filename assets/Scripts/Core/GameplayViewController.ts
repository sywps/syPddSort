import {
    AudioMgr,
    BOARD_PLACE_HIT_CELL_RATIO,
    BOARD_PLACE_HIT_MIN_UI,
    BOARD_SELECT_HIT_CELL_RATIO,
    BOARD_SELECT_HIT_MIN_UI,
    BOARD_SLOT_PLACE_HIT_CELL_RATIO,
    BOARD_SLOT_PLACE_HIT_MIN_UI,
    Button,
    Color,
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
import { BoardSlotBatchRenderer } from './BoardSlotBatchRenderer';
import type { BoardSlotBatchCell } from './BoardSlotBatchRenderer';

const BOARD_OUTLINE_LAYER_NAME = 'BoardOutlineLayer';
const BOARD_OUTLINE_TOP_LAYER_NAME = 'BoardOutlineTopLayer';
const BOARD_OUTLINE_SHADOW_NAME = 'BoardOutlineShadow';
const BOARD_OUTLINE_OUTER_NAME = 'BoardOutlineOuter';
const BOARD_OUTLINE_MAIN_NAME = 'BoardOutlineMain';
const BOARD_OUTLINE_INNER_NAME = 'BoardOutlineInner';
const BOARD_OUTLINE_HIGHLIGHT_NAME = 'BoardOutlineHighlight';
const BOARD_OUTLINE_CORNER_RADIUS_RATIO = 0.19;
const BOARD_OUTLINE_CONVEX_RADIUS_SCALE = 0.86;
const BOARD_OUTLINE_CONCAVE_RADIUS_SCALE = 1.08;
const BOARD_OUTLINE_SHADOW_WIDTH_RATIO = 0.22;
const BOARD_OUTLINE_OUTER_WIDTH_RATIO = 0.17;
const BOARD_OUTLINE_MAIN_WIDTH_RATIO = 0.115;
const BOARD_OUTLINE_INNER_WIDTH_RATIO = 0.048;
const BOARD_OUTLINE_HIGHLIGHT_WIDTH_RATIO = 0.026;
const BOARD_OUTLINE_OUTSET_RATIO = 0.07;
const BOARD_OUTLINE_INNER_OUTSET_RATIO = 0.018;
const BOARD_OUTLINE_HIGHLIGHT_OUTSET_RATIO = 0.044;
const BOARD_OUTLINE_SHADOW_OFFSET_X_RATIO = 0.018;
const BOARD_OUTLINE_SHADOW_OFFSET_Y_RATIO = -0.026;
type BoardOutlinePoint = { x: number; y: number };
type BoardOutlineGridPoint = { col: number; row: number };
type BoardOutlineGridEdge = { start: BoardOutlineGridPoint; end: BoardOutlineGridPoint };
type BoardOutlineCornerKind = 'convex' | 'concave';
type BoardOutlineRoundedCorner = {
    kind: BoardOutlineCornerKind;
    corner: BoardOutlinePoint;
    before: BoardOutlinePoint;
    after: BoardOutlinePoint;
};

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
        const batchedBoardSlots = Number(runtime._boardSlotBatchRenderer?.visibleCellCount || 0);
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

    private ensureBoardOutlineLayer(parent: Node, name: string, width: number, height: number, siblingIndex: number): Node {
        let layer = parent.getChildByName(name);
        if (!layer?.isValid) {
            layer = new Node(name);
            parent.addChild(layer);
        } else if (layer.parent !== parent) {
            parent.addChild(layer);
        }
        layer.layer = Layers.Enum.UI_2D;
        layer.active = true;
        layer.setPosition(0, 0, 0);
        layer.setScale(1, 1, 1);
        layer.setSiblingIndex(siblingIndex);
        let transform = layer.getComponent(UITransform);
        if (!transform) transform = layer.addComponent(UITransform);
        transform.setContentSize(width, height);
        this.runtime.clearChildrenExcept(layer, []);
        return layer;
    }

    private isOutlineFilled(row: number, col: number, width: number, height: number): boolean {
        if (row < 0 || row >= height || col < 0 || col >= width) return false;
        return (this.runtime.boardModel.correctColors[row]?.[col] || 0) > 0;
    }

    private gridPointKey(point: BoardOutlineGridPoint): string {
        return `${point.col},${point.row}`;
    }

    private gridEdgeKey(edge: BoardOutlineGridEdge): string {
        return `${this.gridPointKey(edge.start)}>${this.gridPointKey(edge.end)}`;
    }

    private appendBoardOutlineEdge(edges: BoardOutlineGridEdge[], start: BoardOutlineGridPoint, end: BoardOutlineGridPoint): void {
        edges.push({ start, end });
    }

    private simplifyBoardOutlineLoop(loop: BoardOutlinePoint[]): BoardOutlinePoint[] {
        if (loop.length <= 2) return loop;
        const simplified: BoardOutlinePoint[] = [];
        for (let i = 0; i < loop.length; i++) {
            const prev = loop[(i - 1 + loop.length) % loop.length];
            const curr = loop[i];
            const next = loop[(i + 1) % loop.length];
            const dx1 = curr.x - prev.x;
            const dy1 = curr.y - prev.y;
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;
            if (dx1 * dy2 === dy1 * dx2) continue;
            simplified.push(curr);
        }
        return simplified;
    }

    private traceBoardOutlineLoops(boardWidth: number, boardHeight: number, step: number): BoardOutlinePoint[][] {
        const edges: BoardOutlineGridEdge[] = [];
        for (let row = 0; row < boardHeight; row++) {
            for (let col = 0; col < boardWidth; col++) {
                if (!this.isOutlineFilled(row, col, boardWidth, boardHeight)) continue;
                if (!this.isOutlineFilled(row - 1, col, boardWidth, boardHeight)) {
                    this.appendBoardOutlineEdge(edges, { col, row }, { col: col + 1, row });
                }
                if (!this.isOutlineFilled(row, col + 1, boardWidth, boardHeight)) {
                    this.appendBoardOutlineEdge(edges, { col: col + 1, row }, { col: col + 1, row: row + 1 });
                }
                if (!this.isOutlineFilled(row + 1, col, boardWidth, boardHeight)) {
                    this.appendBoardOutlineEdge(edges, { col: col + 1, row: row + 1 }, { col, row: row + 1 });
                }
                if (!this.isOutlineFilled(row, col - 1, boardWidth, boardHeight)) {
                    this.appendBoardOutlineEdge(edges, { col, row: row + 1 }, { col, row });
                }
            }
        }

        const outgoing = new Map<string, BoardOutlineGridEdge[]>();
        for (const edge of edges) {
            const key = this.gridPointKey(edge.start);
            const list = outgoing.get(key) || [];
            list.push(edge);
            outgoing.set(key, list);
        }

        const used = new Set<string>();
        const toLocalPoint = (point: BoardOutlineGridPoint): BoardOutlinePoint => ({
            x: (point.col - boardWidth / 2) * step,
            y: (boardHeight / 2 - point.row) * step,
        });
        const loops: BoardOutlinePoint[][] = [];

        for (const firstEdge of edges) {
            if (used.has(this.gridEdgeKey(firstEdge))) continue;
            const loop: BoardOutlinePoint[] = [toLocalPoint(firstEdge.start)];
            let current = firstEdge;
            let guard = 0;
            while (guard++ < edges.length + 1) {
                used.add(this.gridEdgeKey(current));
                loop.push(toLocalPoint(current.end));
                if (this.gridPointKey(current.end) === this.gridPointKey(firstEdge.start)) break;
                const next = (outgoing.get(this.gridPointKey(current.end)) || [])
                    .find((candidate) => !used.has(this.gridEdgeKey(candidate)));
                if (!next) break;
                current = next;
            }
            if (loop.length > 2) {
                const closedEnd = loop[loop.length - 1];
                const closedStart = loop[0];
                if (closedEnd.x === closedStart.x && closedEnd.y === closedStart.y) loop.pop();
                const simplified = this.simplifyBoardOutlineLoop(loop);
                if (simplified.length > 2) loops.push(simplified);
            }
        }

        return loops;
    }

    private getBoardOutlineLoopSignedArea(loop: BoardOutlinePoint[]): number {
        let area = 0;
        for (let i = 0; i < loop.length; i++) {
            const curr = loop[i];
            const next = loop[(i + 1) % loop.length];
            area += curr.x * next.y - next.x * curr.y;
        }
        return area / 2;
    }

    private getBoardOutlineCornerKind(loop: BoardOutlinePoint[], index: number, loopSign: number): BoardOutlineCornerKind {
        const prev = loop[(index - 1 + loop.length) % loop.length];
        const curr = loop[index];
        const next = loop[(index + 1) % loop.length];
        const incomingX = curr.x - prev.x;
        const incomingY = curr.y - prev.y;
        const outgoingX = next.x - curr.x;
        const outgoingY = next.y - curr.y;
        const cross = incomingX * outgoingY - incomingY * outgoingX;
        return Math.sign(cross || loopSign) === loopSign ? 'convex' : 'concave';
    }

    private drawRoundedBoardOutlineLoop(graphics: Graphics, loop: BoardOutlinePoint[], radius: number): void {
        if (loop.length < 3) return;
        const loopSign = Math.sign(this.getBoardOutlineLoopSignedArea(loop)) || 1;
        const rounded: BoardOutlineRoundedCorner[] = loop.map((curr, index) => {
            const prev = loop[(index - 1 + loop.length) % loop.length];
            const next = loop[(index + 1) % loop.length];
            const prevLength = Math.hypot(prev.x - curr.x, prev.y - curr.y);
            const nextLength = Math.hypot(next.x - curr.x, next.y - curr.y);
            const kind = this.getBoardOutlineCornerKind(loop, index, loopSign);
            if (prevLength <= 0 || nextLength <= 0) {
                return { kind, corner: curr, before: curr, after: curr };
            }
            const targetRadius = kind === 'concave'
                ? radius * BOARD_OUTLINE_CONCAVE_RADIUS_SCALE
                : radius * BOARD_OUTLINE_CONVEX_RADIUS_SCALE;
            const r = Math.max(0, Math.min(targetRadius, prevLength / 2, nextLength / 2));
            return {
                kind,
                corner: curr,
                before: {
                    x: curr.x + ((prev.x - curr.x) / prevLength) * r,
                    y: curr.y + ((prev.y - curr.y) / prevLength) * r,
                },
                after: {
                    x: curr.x + ((next.x - curr.x) / nextLength) * r,
                    y: curr.y + ((next.y - curr.y) / nextLength) * r,
                },
            };
        });

        graphics.moveTo(rounded[0].after.x, rounded[0].after.y);
        for (let i = 1; i < rounded.length; i++) {
            graphics.lineTo(rounded[i].before.x, rounded[i].before.y);
            graphics.quadraticCurveTo(
                rounded[i].corner.x,
                rounded[i].corner.y,
                rounded[i].after.x,
                rounded[i].after.y,
            );
        }
        graphics.lineTo(rounded[0].before.x, rounded[0].before.y);
        graphics.quadraticCurveTo(
            rounded[0].corner.x,
            rounded[0].corner.y,
            rounded[0].after.x,
            rounded[0].after.y,
        );
        graphics.close();
    }

    private getBoardOutlineInwardNormal(start: BoardOutlinePoint, end: BoardOutlinePoint, loopSign: number, distance: number): BoardOutlinePoint {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length <= 0) return { x: 0, y: 0 };
        if (loopSign > 0) {
            return { x: (-dy / length) * distance, y: (dx / length) * distance };
        }
        return { x: (dy / length) * distance, y: (-dx / length) * distance };
    }

    private getBoardOutlineLineIntersection(a1: BoardOutlinePoint, a2: BoardOutlinePoint, b1: BoardOutlinePoint, b2: BoardOutlinePoint): BoardOutlinePoint | null {
        const ax = a2.x - a1.x;
        const ay = a2.y - a1.y;
        const bx = b2.x - b1.x;
        const by = b2.y - b1.y;
        const cross = ax * by - ay * bx;
        if (Math.abs(cross) < 0.001) return null;
        const cx = b1.x - a1.x;
        const cy = b1.y - a1.y;
        const t = (cx * by - cy * bx) / cross;
        return { x: a1.x + ax * t, y: a1.y + ay * t };
    }

    private offsetBoardOutlineLoop(loop: BoardOutlinePoint[], distance: number): BoardOutlinePoint[] {
        if (loop.length < 3 || Math.abs(distance) < 0.001) return loop;
        const loopSign = Math.sign(this.getBoardOutlineLoopSignedArea(loop)) || 1;
        return loop.map((curr, index) => {
            const prev = loop[(index - 1 + loop.length) % loop.length];
            const next = loop[(index + 1) % loop.length];
            const prevNormal = this.getBoardOutlineInwardNormal(prev, curr, loopSign, distance);
            const nextNormal = this.getBoardOutlineInwardNormal(curr, next, loopSign, distance);
            const prevA = { x: prev.x + prevNormal.x, y: prev.y + prevNormal.y };
            const prevB = { x: curr.x + prevNormal.x, y: curr.y + prevNormal.y };
            const nextA = { x: curr.x + nextNormal.x, y: curr.y + nextNormal.y };
            const nextB = { x: next.x + nextNormal.x, y: next.y + nextNormal.y };
            const intersection = this.getBoardOutlineLineIntersection(prevA, prevB, nextA, nextB);
            if (intersection) return intersection;
            return { x: curr.x + nextNormal.x, y: curr.y + nextNormal.y };
        });
    }

    private offsetBoardOutlineLoops(loops: BoardOutlinePoint[][], distance: number): BoardOutlinePoint[][] {
        return loops
            .map((loop) => this.offsetBoardOutlineLoop(loop, distance))
            .filter((loop) => loop.length > 2);
    }

    private ensureBoardOutlineGraphics(parent: Node, name: string, width: number, height: number, siblingIndex: number, offsetX: number = 0, offsetY: number = 0): Graphics {
        let node = parent.getChildByName(name);
        if (!node?.isValid) {
            node = new Node(name);
            parent.addChild(node);
        }
        node.layer = Layers.Enum.UI_2D;
        node.active = true;
        node.setPosition(offsetX, offsetY, 0);
        node.setScale(1, 1, 1);
        node.setSiblingIndex(siblingIndex);
        let transform = node.getComponent(UITransform);
        if (!transform) transform = node.addComponent(UITransform);
        transform.setContentSize(width, height);
        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();
        graphics.lineCap = Graphics.LineCap.ROUND;
        graphics.lineJoin = Graphics.LineJoin.ROUND;
        return graphics;
    }

    private strokeBoardOutline(graphics: Graphics, loops: BoardOutlinePoint[][], lineWidth: number, color: Color, radius: number): void {
        graphics.clear();
        graphics.lineWidth = lineWidth;
        graphics.strokeColor = color;
        for (const loop of loops) {
            this.drawRoundedBoardOutlineLoop(graphics, loop, radius);
        }
        graphics.stroke();
    }

    private buildBoardOutline(baseLayer: Node, topLayer: Node, boardWidth: number, boardHeight: number): void {
        const step = this.runtime.cellSize + this.runtime.cellGap;
        const loops = this.traceBoardOutlineLoops(boardWidth, boardHeight, step);
        const transform = baseLayer.getComponent(UITransform);
        const width = transform?.width || boardWidth * step;
        const height = transform?.height || boardHeight * step;
        const radius = Math.max(4, step * BOARD_OUTLINE_CORNER_RADIUS_RATIO);
        const shadowWidth = Math.max(6, step * BOARD_OUTLINE_SHADOW_WIDTH_RATIO);
        const outerWidth = Math.max(5, step * BOARD_OUTLINE_OUTER_WIDTH_RATIO);
        const mainWidth = Math.max(4, step * BOARD_OUTLINE_MAIN_WIDTH_RATIO);
        const innerWidth = Math.max(2, step * BOARD_OUTLINE_INNER_WIDTH_RATIO);
        const highlightWidth = Math.max(2, step * BOARD_OUTLINE_HIGHLIGHT_WIDTH_RATIO);
        const outlineOutset = Math.max(mainWidth / 2 + 0.35, step * BOARD_OUTLINE_OUTSET_RATIO);
        const innerOutset = Math.max(0.5, step * BOARD_OUTLINE_INNER_OUTSET_RATIO);
        const highlightOutset = Math.max(highlightWidth / 2 + 0.25, step * BOARD_OUTLINE_HIGHLIGHT_OUTSET_RATIO);
        const outlineRadius = Math.max(4, radius + outlineOutset * 0.45);
        const innerRadius = Math.max(2, radius + innerOutset * 0.2);
        const highlightRadius = Math.max(2, radius + highlightOutset * 0.25);
        const shadowOffsetX = step * BOARD_OUTLINE_SHADOW_OFFSET_X_RATIO;
        const shadowOffsetY = step * BOARD_OUTLINE_SHADOW_OFFSET_Y_RATIO;
        const outlineLoops = this.offsetBoardOutlineLoops(loops, -outlineOutset);
        const innerLoops = this.offsetBoardOutlineLoops(loops, -innerOutset);
        const highlightLoops = this.offsetBoardOutlineLoops(loops, -highlightOutset);

        const shadow = this.ensureBoardOutlineGraphics(baseLayer, BOARD_OUTLINE_SHADOW_NAME, width, height, 0, shadowOffsetX, shadowOffsetY);
        const outer = this.ensureBoardOutlineGraphics(baseLayer, BOARD_OUTLINE_OUTER_NAME, width, height, 1);
        const main = this.ensureBoardOutlineGraphics(baseLayer, BOARD_OUTLINE_MAIN_NAME, width, height, 2);
        const inner = this.ensureBoardOutlineGraphics(topLayer, BOARD_OUTLINE_INNER_NAME, width, height, 0);
        const highlight = this.ensureBoardOutlineGraphics(topLayer, BOARD_OUTLINE_HIGHLIGHT_NAME, width, height, 1);
        this.strokeBoardOutline(shadow, outlineLoops, shadowWidth, new Color(86, 104, 118, 76), outlineRadius);
        this.strokeBoardOutline(outer, outlineLoops, outerWidth, new Color(180, 194, 206, 188), outlineRadius);
        this.strokeBoardOutline(main, outlineLoops, mainWidth, new Color(255, 255, 255, 250), outlineRadius);
        this.strokeBoardOutline(inner, innerLoops, innerWidth, new Color(108, 126, 138, 150), innerRadius);
        this.strokeBoardOutline(highlight, highlightLoops, highlightWidth, new Color(255, 255, 255, 118), highlightRadius);
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

    private prepareBoardSlotBatchRenderer(parent: Node, width: number, height: number): BoardSlotBatchRenderer {
        const runtime = this.runtime;
        let batchNode = runtime._boardSlotBatchRenderer?.node?.isValid
            ? runtime._boardSlotBatchRenderer.node
            : parent.getChildByName('BoardSlotBatch');
        if (!batchNode?.isValid) {
            batchNode = new Node('BoardSlotBatch');
            parent.addChild(batchNode);
        } else if (batchNode.parent !== parent) {
            parent.addChild(batchNode);
        }
        batchNode.layer = Layers.Enum.UI_2D;
        batchNode.active = true;
        batchNode.setPosition(0, 0, 0);
        batchNode.setScale(1, 1, 1);
        let transform = batchNode.getComponent(UITransform);
        if (!transform) transform = batchNode.addComponent(UITransform);
        transform.setContentSize(width, height);
        let renderer = batchNode.getComponent(BoardSlotBatchRenderer);
        if (!renderer) renderer = batchNode.addComponent(BoardSlotBatchRenderer);
        runtime._boardSlotBatchRenderer = renderer;
        return renderer;
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
        const runtimeRoot = this.getGameplayRuntimeRoot();
        const backgroundRoot = this.getGameplayRuntimeGroup('BackgroundRuntime');
        const topBarRoot = this.getGameplayFixedGroup('TopBarGroup');
        const boardRoot = this.getGameplayFixedGroup('BoardArea');
        const bottomHudRoot = this.getGameplayBottomHudGroup();
        const slotRoot = this.getGameplayBottomHudChild('SlotAreaGroup');
        const skillRoot = this.getGameplayBottomHudChild('SkillArea');
        const dragRoot = this.getGameplayRuntimeGroup('DragRuntime');
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
        runtime.buildSkillButtons(skillRoot);
        topBarRoot.setSiblingIndex(Math.max(0, fixedRoot.children.length - 1));

        this.prepareDragLayer(dragRoot);

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
        this.requireSceneSpriteFrame(settingsIcon, 'Settings/SettingsIcon');
        gear.getComponent(Button) || gear.addComponent(Button);
        gear.targetOff(runtime);
        gear.on(Button.EventType.CLICK, () => {
            AudioMgr.inst.play('button');
            runtime.openSettingsPanel();
        }, runtime);
        this.drawLevelTitleLabel(root);
        const timerWrap = runtime.requireUiChild(root, 'TimerWrap', 'TopBarGroup/TimerWrap');
        this.requireSceneSpriteFrame(timerWrap, 'TimerWrap');
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
        this.requireSceneSpriteFrame(settingsIcon, 'Settings/SettingsIcon');
        this.drawLevelTitleLabel(root);
        const timerWrap = runtime.requireUiChild(root, 'TimerWrap', 'TopBarGroup/TimerWrap');
        this.requireSceneSpriteFrame(timerWrap, 'TimerWrap');
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
        if (runtime._boardSlotBatchRenderer?.isValid) {
            runtime._boardSlotBatchRenderer.markForUpdateRenderData();
            return;
        }
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
            const trackedTouchIds = Array.from(runtime.activeBoardTouches.keys()) as number[];
            for (const id of trackedTouchIds) {
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
        const boardVisualCellCount = this.countBoardVisualCells(runtime.boardModel.correctColors, bw, bh);
        this.recycleBoardNodeGrid(runtime.cellNodes, runtime._boardCellPool, boardVisualCellCount);
        runtime.clearChildrenExcept(runtime.boardNode, [BOARD_OUTLINE_LAYER_NAME, BOARD_OUTLINE_TOP_LAYER_NAME, 'BoardSlots']);

        runtime.boardSlotsNode = runtime.requireUiChild(runtime.boardNode, 'BoardSlots', 'Board/BoardSlots');
        runtime.boardSlotsNode.layer = Layers.Enum.UI_2D;
        runtime.boardSlotsNode.getComponent(UITransform)?.setContentSize(boardW, boardH);
        runtime.boardSlotsNode.setPosition(0, 0, 0);
        this.recycleBoardNodeGrid(runtime.boardSlotBgNodes, runtime._boardSlotBgPool, boardVisualCellCount);
        runtime.clearChildrenExcept(runtime.boardSlotsNode, ['BoardSlotBatch']);
        const slotBatchRenderer = this.prepareBoardSlotBatchRenderer(runtime.boardSlotsNode, boardW, boardH);
        const slotIndex = Math.max(0, runtime.boardNode.children.indexOf(runtime.boardSlotsNode));
        const boardOutlineLayer = this.ensureBoardOutlineLayer(runtime.boardNode, BOARD_OUTLINE_LAYER_NAME, boardW, boardH, slotIndex + 1);
        const boardOutlineTopLayer = this.ensureBoardOutlineLayer(runtime.boardNode, BOARD_OUTLINE_TOP_LAYER_NAME, boardW, boardH, slotIndex + 2);
        this.buildBoardOutline(boardOutlineLayer, boardOutlineTopLayer, bw, bh);

        const safeRect = runtime.getBoardSafeViewportRect();
        const availableW = Math.max(1, safeRect.right - safeRect.left);
        const availableH = Math.max(1, safeRect.top - safeRect.bottom);
        const targetBounds = this.getTargetContentBounds(runtime.levelData.correctColorArr || [], bw, bh);
        const targetCols = Math.max(1, targetBounds.maxCol - targetBounds.minCol + 1);
        const targetRows = Math.max(1, targetBounds.maxRow - targetBounds.minRow + 1);
        const step = runtime.cellSize + runtime.cellGap;
        const targetW = targetCols * step - runtime.cellGap + padding;
        const targetH = targetRows * step - runtime.cellGap + padding;
        const widthFitRatio = 0.95;
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

        const slotBatchCells: BoardSlotBatchCell[] = [];
        runtime.cellNodes = [];
        runtime.boardSlotBgNodes = [];
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

                const slotFrame = runtime.getSlotSpriteFrame(correctId);
                if (!slotFrame) {
                    throw new Error(`[BoardSlotBatch] missing slot frame for color ${correctId}`);
                }
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
        slotBatchRenderer.configure(slotBatchCells);
        this.trimBoardNodePool(runtime._boardCellPool, 0);
        this.trimBoardNodePool(runtime._boardSlotBgPool, 0);
    }
}

export function ensureGameplayViewController(runtime: any): GameplayViewController {
    if (!runtime._gameplayViewController) {
        runtime._gameplayViewController = new GameplayViewController(runtime);
    }
    return runtime._gameplayViewController as GameplayViewController;
}
