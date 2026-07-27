import {
    Color,
    Graphics,
    Layers,
    Node,
    UITransform,
} from './GameCtrlShared';

export const BOARD_OUTLINE_LAYER_NAME = 'BoardOutlineLayer';
export const BOARD_OUTLINE_TOP_LAYER_NAME = 'BoardOutlineTopLayer';

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
const BOARD_OUTLINE_CORNER_RADIUS_MIN = 1.1;
const BOARD_OUTLINE_SHADOW_WIDTH_MIN = 0.72;
const BOARD_OUTLINE_OUTER_WIDTH_MIN = 0.58;
const BOARD_OUTLINE_MAIN_WIDTH_MIN = 0.46;
const BOARD_OUTLINE_INNER_WIDTH_MIN = 0.28;
const BOARD_OUTLINE_HIGHLIGHT_WIDTH_MIN = 0.2;
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
type ClearChildrenExcept = (node: Node, keepNames: string[]) => void;

function isOutlineFilled(correctColors: number[][], row: number, col: number, width: number, height: number): boolean {
    if (row < 0 || row >= height || col < 0 || col >= width) return false;
    return (correctColors[row]?.[col] || 0) > 0;
}

function gridPointKey(point: BoardOutlineGridPoint): string {
    return `${point.col},${point.row}`;
}

function gridEdgeKey(edge: BoardOutlineGridEdge): string {
    return `${gridPointKey(edge.start)}>${gridPointKey(edge.end)}`;
}

function appendBoardOutlineEdge(edges: BoardOutlineGridEdge[], start: BoardOutlineGridPoint, end: BoardOutlineGridPoint): void {
    edges.push({ start, end });
}

function simplifyBoardOutlineLoop(loop: BoardOutlinePoint[]): BoardOutlinePoint[] {
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

function traceBoardOutlineLoops(correctColors: number[][], boardWidth: number, boardHeight: number, step: number): BoardOutlinePoint[][] {
    const edges: BoardOutlineGridEdge[] = [];
    for (let row = 0; row < boardHeight; row++) {
        for (let col = 0; col < boardWidth; col++) {
            if (!isOutlineFilled(correctColors, row, col, boardWidth, boardHeight)) continue;
            if (!isOutlineFilled(correctColors, row - 1, col, boardWidth, boardHeight)) {
                appendBoardOutlineEdge(edges, { col, row }, { col: col + 1, row });
            }
            if (!isOutlineFilled(correctColors, row, col + 1, boardWidth, boardHeight)) {
                appendBoardOutlineEdge(edges, { col: col + 1, row }, { col: col + 1, row: row + 1 });
            }
            if (!isOutlineFilled(correctColors, row + 1, col, boardWidth, boardHeight)) {
                appendBoardOutlineEdge(edges, { col: col + 1, row: row + 1 }, { col, row: row + 1 });
            }
            if (!isOutlineFilled(correctColors, row, col - 1, boardWidth, boardHeight)) {
                appendBoardOutlineEdge(edges, { col, row: row + 1 }, { col, row });
            }
        }
    }

    const outgoing = new Map<string, BoardOutlineGridEdge[]>();
    for (const edge of edges) {
        const key = gridPointKey(edge.start);
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
        if (used.has(gridEdgeKey(firstEdge))) continue;
        const loop: BoardOutlinePoint[] = [toLocalPoint(firstEdge.start)];
        let current = firstEdge;
        let guard = 0;
        while (guard++ < edges.length + 1) {
            used.add(gridEdgeKey(current));
            loop.push(toLocalPoint(current.end));
            if (gridPointKey(current.end) === gridPointKey(firstEdge.start)) break;
            const next = (outgoing.get(gridPointKey(current.end)) || [])
                .find((candidate) => !used.has(gridEdgeKey(candidate)));
            if (!next) break;
            current = next;
        }
        if (loop.length > 2) {
            const closedEnd = loop[loop.length - 1];
            const closedStart = loop[0];
            if (closedEnd.x === closedStart.x && closedEnd.y === closedStart.y) loop.pop();
            const simplified = simplifyBoardOutlineLoop(loop);
            if (simplified.length > 2) loops.push(simplified);
        }
    }

    return loops;
}

function getBoardOutlineLoopSignedArea(loop: BoardOutlinePoint[]): number {
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
        const curr = loop[i];
        const next = loop[(i + 1) % loop.length];
        area += curr.x * next.y - next.x * curr.y;
    }
    return area / 2;
}

function getBoardOutlineCornerKind(loop: BoardOutlinePoint[], index: number, loopSign: number): BoardOutlineCornerKind {
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

function drawRoundedBoardOutlineLoop(graphics: Graphics, loop: BoardOutlinePoint[], radius: number): void {
    if (loop.length < 3) return;
    const loopSign = Math.sign(getBoardOutlineLoopSignedArea(loop)) || 1;
    const rounded: BoardOutlineRoundedCorner[] = loop.map((curr, index) => {
        const prev = loop[(index - 1 + loop.length) % loop.length];
        const next = loop[(index + 1) % loop.length];
        const prevLength = Math.hypot(prev.x - curr.x, prev.y - curr.y);
        const nextLength = Math.hypot(next.x - curr.x, next.y - curr.y);
        const kind = getBoardOutlineCornerKind(loop, index, loopSign);
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

function getBoardOutlineInwardNormal(start: BoardOutlinePoint, end: BoardOutlinePoint, loopSign: number, distance: number): BoardOutlinePoint {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) return { x: 0, y: 0 };
    if (loopSign > 0) {
        return { x: (-dy / length) * distance, y: (dx / length) * distance };
    }
    return { x: (dy / length) * distance, y: (-dx / length) * distance };
}

function getBoardOutlineLineIntersection(a1: BoardOutlinePoint, a2: BoardOutlinePoint, b1: BoardOutlinePoint, b2: BoardOutlinePoint): BoardOutlinePoint | null {
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

function offsetBoardOutlineLoop(loop: BoardOutlinePoint[], distance: number): BoardOutlinePoint[] {
    if (loop.length < 3 || Math.abs(distance) < 0.001) return loop;
    const loopSign = Math.sign(getBoardOutlineLoopSignedArea(loop)) || 1;
    return loop.map((curr, index) => {
        const prev = loop[(index - 1 + loop.length) % loop.length];
        const next = loop[(index + 1) % loop.length];
        const prevNormal = getBoardOutlineInwardNormal(prev, curr, loopSign, distance);
        const nextNormal = getBoardOutlineInwardNormal(curr, next, loopSign, distance);
        const prevA = { x: prev.x + prevNormal.x, y: prev.y + prevNormal.y };
        const prevB = { x: curr.x + prevNormal.x, y: curr.y + prevNormal.y };
        const nextA = { x: curr.x + nextNormal.x, y: curr.y + nextNormal.y };
        const nextB = { x: next.x + nextNormal.x, y: next.y + nextNormal.y };
        const intersection = getBoardOutlineLineIntersection(prevA, prevB, nextA, nextB);
        if (intersection) return intersection;
        return { x: curr.x + nextNormal.x, y: curr.y + nextNormal.y };
    });
}

function offsetBoardOutlineLoopsTowardEmpty(loops: BoardOutlinePoint[][], distance: number): BoardOutlinePoint[][] {
    return loops
        .map((loop) => {
            // External loops are clockwise while internal hole loops are counterclockwise.
            const loopSign = Math.sign(getBoardOutlineLoopSignedArea(loop)) || 1;
            const signedDistance = loopSign < 0 ? -distance : distance;
            return offsetBoardOutlineLoop(loop, signedDistance);
        })
        .filter((loop) => loop.length > 2);
}

function getBoardOutlineScaledMetric(step: number, ratio: number, minValue: number): number {
    return Math.max(step * ratio, minValue);
}

function ensureBoardOutlineGraphics(parent: Node, name: string, width: number, height: number, siblingIndex: number, offsetX: number = 0, offsetY: number = 0): Graphics {
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

function strokeBoardOutline(graphics: Graphics, loops: BoardOutlinePoint[][], lineWidth: number, color: Color, radius: number): void {
    graphics.clear();
    graphics.lineWidth = lineWidth;
    graphics.strokeColor = color;
    for (const loop of loops) {
        drawRoundedBoardOutlineLoop(graphics, loop, radius);
    }
    graphics.stroke();
}

export function ensureBoardOutlineLayer(
    parent: Node,
    name: string,
    width: number,
    height: number,
    siblingIndex: number,
    clearChildrenExcept: ClearChildrenExcept,
): Node {
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
    const keepNames = name === BOARD_OUTLINE_LAYER_NAME
        ? [BOARD_OUTLINE_SHADOW_NAME, BOARD_OUTLINE_OUTER_NAME, BOARD_OUTLINE_MAIN_NAME]
        : (name === BOARD_OUTLINE_TOP_LAYER_NAME
            ? [BOARD_OUTLINE_INNER_NAME, BOARD_OUTLINE_HIGHLIGHT_NAME]
            : []);
    clearChildrenExcept(layer, keepNames);
    return layer;
}

export function buildBoardOutline(
    baseLayer: Node,
    topLayer: Node,
    correctColors: number[][],
    cellSize: number,
    cellGap: number,
    boardWidth: number,
    boardHeight: number,
): void {
    const step = cellSize + cellGap;
    const loops = traceBoardOutlineLoops(correctColors, boardWidth, boardHeight, step);
    const transform = baseLayer.getComponent(UITransform);
    const width = transform?.width || boardWidth * step;
    const height = transform?.height || boardHeight * step;
    const radius = getBoardOutlineScaledMetric(step, BOARD_OUTLINE_CORNER_RADIUS_RATIO, BOARD_OUTLINE_CORNER_RADIUS_MIN);
    const shadowWidth = getBoardOutlineScaledMetric(step, BOARD_OUTLINE_SHADOW_WIDTH_RATIO, BOARD_OUTLINE_SHADOW_WIDTH_MIN);
    const outerWidth = getBoardOutlineScaledMetric(step, BOARD_OUTLINE_OUTER_WIDTH_RATIO, BOARD_OUTLINE_OUTER_WIDTH_MIN);
    const mainWidth = getBoardOutlineScaledMetric(step, BOARD_OUTLINE_MAIN_WIDTH_RATIO, BOARD_OUTLINE_MAIN_WIDTH_MIN);
    const innerWidth = getBoardOutlineScaledMetric(step, BOARD_OUTLINE_INNER_WIDTH_RATIO, BOARD_OUTLINE_INNER_WIDTH_MIN);
    const highlightWidth = getBoardOutlineScaledMetric(step, BOARD_OUTLINE_HIGHLIGHT_WIDTH_RATIO, BOARD_OUTLINE_HIGHLIGHT_WIDTH_MIN);
    const outlineOutset = Math.max(mainWidth / 2 + Math.min(0.35, step * 0.055), step * BOARD_OUTLINE_OUTSET_RATIO);
    const innerOutset = Math.max(Math.min(0.5, step * 0.08), step * BOARD_OUTLINE_INNER_OUTSET_RATIO);
    const highlightOutset = Math.max(highlightWidth / 2 + Math.min(0.25, step * 0.04), step * BOARD_OUTLINE_HIGHLIGHT_OUTSET_RATIO);
    const outlineRadius = Math.max(BOARD_OUTLINE_CORNER_RADIUS_MIN, radius + outlineOutset * 0.45);
    const innerRadius = Math.max(BOARD_OUTLINE_CORNER_RADIUS_MIN, radius + innerOutset * 0.2);
    const highlightRadius = Math.max(BOARD_OUTLINE_CORNER_RADIUS_MIN, radius + highlightOutset * 0.25);
    const shadowOffsetX = step * BOARD_OUTLINE_SHADOW_OFFSET_X_RATIO;
    const shadowOffsetY = step * BOARD_OUTLINE_SHADOW_OFFSET_Y_RATIO;
    const outlineLoops = offsetBoardOutlineLoopsTowardEmpty(loops, outlineOutset);
    const innerLoops = offsetBoardOutlineLoopsTowardEmpty(loops, innerOutset);
    const highlightLoops = offsetBoardOutlineLoopsTowardEmpty(loops, highlightOutset);

    const shadow = ensureBoardOutlineGraphics(baseLayer, BOARD_OUTLINE_SHADOW_NAME, width, height, 0, shadowOffsetX, shadowOffsetY);
    const outer = ensureBoardOutlineGraphics(baseLayer, BOARD_OUTLINE_OUTER_NAME, width, height, 1);
    const main = ensureBoardOutlineGraphics(baseLayer, BOARD_OUTLINE_MAIN_NAME, width, height, 2);
    const inner = ensureBoardOutlineGraphics(topLayer, BOARD_OUTLINE_INNER_NAME, width, height, 0);
    const highlight = ensureBoardOutlineGraphics(topLayer, BOARD_OUTLINE_HIGHLIGHT_NAME, width, height, 1);
    strokeBoardOutline(shadow, outlineLoops, shadowWidth, new Color(86, 104, 118, 76), outlineRadius);
    strokeBoardOutline(outer, outlineLoops, outerWidth, new Color(180, 194, 206, 188), outlineRadius);
    strokeBoardOutline(main, outlineLoops, mainWidth, new Color(255, 255, 255, 250), outlineRadius);
    strokeBoardOutline(inner, innerLoops, innerWidth, new Color(108, 126, 138, 150), innerRadius);
    strokeBoardOutline(highlight, highlightLoops, highlightWidth, new Color(255, 255, 255, 118), highlightRadius);
}
