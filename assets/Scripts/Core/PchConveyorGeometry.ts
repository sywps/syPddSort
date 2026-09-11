// Original pixel-puzzle path, shared by rendering and replay verification.
export type RainbowConveyorTableType = 2 | 3;
export const RAINBOW_CONVEYOR_PATHS: Record<RainbowConveyorTableType, ReadonlyArray<readonly [number, number]>> = {
    2: [[-219, -99], [390, -96], [390, 104.2], [152, 104.2], [-396, 104.2], [-390, -92]],
    3: [[-327, -159], [447, -162], [447, 161], [263, 161], [264, 50],
        [163, 50], [-279, 47], [-279, 166.3], [-452, 166.3], [-452, -159]],
};
export const RAINBOW_CONVEYOR_EXIT_POINT_INDEX: Record<RainbowConveyorTableType, number> = { 2: 3, 3: 5 };

const RAINBOW_CONVEYOR_ROUNDED_CORNERS: Record<RainbowConveyorTableType, ReadonlySet<number>> = {
    2: new Set([1, 2, 4, 5]),
    3: new Set([1, 2, 3, 4, 6, 7, 8, 9]),
};
export const RAINBOW_CONVEYOR_CORNER_RADIUS = 40;
const PATH_EPSILON = 1e-6;

type ConveyorPoint = { x: number; y: number };
type ConveyorLineSegment = {
    kind: 'line';
    startDistance: number;
    length: number;
    start: ConveyorPoint;
    end: ConveyorPoint;
    angle: number;
};
type ConveyorArcSegment = {
    kind: 'arc';
    startDistance: number;
    length: number;
    center: ConveyorPoint;
    radius: number;
    startAngle: number;
    sweepAngle: number;
};
type ConveyorSegment = ConveyorLineSegment | ConveyorArcSegment;
type ConveyorCorner = {
    entry: ConveyorPoint;
    exit: ConveyorPoint;
    arc: Omit<ConveyorArcSegment, 'startDistance'> | null;
};

export type RainbowConveyorPathGeometry = {
    segments: ReadonlyArray<ConveyorSegment>;
    totalLength: number;
    waypointDistances: ReadonlyArray<number>;
};

function pointDistance(a: ConveyorPoint, b: ConveyorPoint): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function createRoundedCorner(
    points: ReadonlyArray<ConveyorPoint>,
    index: number,
    radius: number,
    rounded: boolean,
): ConveyorCorner {
    const current = points[index];
    if (!rounded) return { entry: current, exit: current, arc: null };
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const incomingLength = pointDistance(previous, current);
    const outgoingLength = pointDistance(current, next);
    if (incomingLength <= PATH_EPSILON || outgoingLength <= PATH_EPSILON) {
        return { entry: current, exit: current, arc: null };
    }
    const incomingX = (current.x - previous.x) / incomingLength;
    const incomingY = (current.y - previous.y) / incomingLength;
    const outgoingX = (next.x - current.x) / outgoingLength;
    const outgoingY = (next.y - current.y) / outgoingLength;
    const dot = Math.max(-1, Math.min(1, incomingX * outgoingX + incomingY * outgoingY));
    const turnAngle = Math.acos(dot);
    const cross = incomingX * outgoingY - incomingY * outgoingX;
    if (Math.abs(cross) <= PATH_EPSILON || turnAngle <= PATH_EPSILON || turnAngle >= Math.PI - PATH_EPSILON) {
        return { entry: current, exit: current, arc: null };
    }
    const tangentScale = Math.tan(turnAngle / 2);
    const trim = Math.min(radius * tangentScale, incomingLength * 0.45, outgoingLength * 0.45);
    if (trim <= PATH_EPSILON || tangentScale <= PATH_EPSILON) {
        return { entry: current, exit: current, arc: null };
    }
    const effectiveRadius = trim / tangentScale;
    const entry = { x: current.x - incomingX * trim, y: current.y - incomingY * trim };
    const exit = { x: current.x + outgoingX * trim, y: current.y + outgoingY * trim };
    const turnSign = Math.sign(cross);
    const center = {
        x: entry.x - incomingY * turnSign * effectiveRadius,
        y: entry.y + incomingX * turnSign * effectiveRadius,
    };
    const startAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
    const endAngle = Math.atan2(exit.y - center.y, exit.x - center.x);
    let sweepAngle = endAngle - startAngle;
    if (turnSign > 0 && sweepAngle < 0) sweepAngle += Math.PI * 2;
    if (turnSign < 0 && sweepAngle > 0) sweepAngle -= Math.PI * 2;
    return {
        entry,
        exit,
        arc: {
            kind: 'arc',
            length: Math.abs(sweepAngle) * effectiveRadius,
            center,
            radius: effectiveRadius,
            startAngle,
            sweepAngle,
        },
    };
}

export function createRoundedConveyorPath(
    tableType: RainbowConveyorTableType = 2,
    scale = 1,
): RainbowConveyorPathGeometry {
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('invalid conveyor path scale');
    const points = RAINBOW_CONVEYOR_PATHS[tableType]
        .map(([x, y]) => ({ x: x * scale, y: y * scale }));
    const roundedCorners = RAINBOW_CONVEYOR_ROUNDED_CORNERS[tableType];
    const corners = points.map((_, index) => createRoundedCorner(
        points,
        index,
        RAINBOW_CONVEYOR_CORNER_RADIUS * scale,
        roundedCorners.has(index),
    ));
    const segments: ConveyorSegment[] = [];
    const waypointDistances = new Array(points.length).fill(0);
    let totalLength = 0;
    for (let index = 0; index < points.length; index += 1) {
        const nextIndex = (index + 1) % points.length;
        const start = corners[index].exit;
        const end = corners[nextIndex].entry;
        const lineLength = pointDistance(start, end);
        if (lineLength > PATH_EPSILON) {
            segments.push({
                kind: 'line',
                startDistance: totalLength,
                length: lineLength,
                start,
                end,
                angle: Math.atan2(end.y - start.y, end.x - start.x),
            });
            totalLength += lineLength;
        }
        const cornerArc = corners[nextIndex].arc;
        if (nextIndex !== 0) waypointDistances[nextIndex] = totalLength + (cornerArc?.length || 0) / 2;
        if (cornerArc && cornerArc.length > PATH_EPSILON) {
            segments.push({ ...cornerArc, startDistance: totalLength });
            totalLength += cornerArc.length;
        }
    }
    if (totalLength <= PATH_EPSILON || !segments.length) throw new Error(`invalid conveyor path for table type ${tableType}`);
    return { segments, totalLength, waypointDistances };
}

export function sampleRoundedConveyorPath(
    path: RainbowConveyorPathGeometry,
    progress: number,
    outPosition: { x: number; y: number },
): number {
    const wrappedProgress = ((progress % 1) + 1) % 1;
    const distance = wrappedProgress * path.totalLength;
    for (let index = 0; index < path.segments.length; index += 1) {
        const segment = path.segments[index];
        const endDistance = segment.startDistance + segment.length;
        if (distance > endDistance && index < path.segments.length - 1) continue;
        const ratio = Math.max(0, Math.min(1, (distance - segment.startDistance) / segment.length));
        if (segment.kind === 'line') {
            outPosition.x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
            outPosition.y = segment.start.y + (segment.end.y - segment.start.y) * ratio;
            return segment.angle * 180 / Math.PI;
        }
        const angle = segment.startAngle + segment.sweepAngle * ratio;
        outPosition.x = segment.center.x + Math.cos(angle) * segment.radius;
        outPosition.y = segment.center.y + Math.sin(angle) * segment.radius;
        const direction = Math.sign(segment.sweepAngle);
        return Math.atan2(Math.cos(angle) * direction, -Math.sin(angle) * direction) * 180 / Math.PI;
    }
    throw new Error('failed to sample conveyor path');
}

export function conveyorExitProgress(tableType: RainbowConveyorTableType = 2): number {
    const path = createRoundedConveyorPath(tableType);
    return path.waypointDistances[RAINBOW_CONVEYOR_EXIT_POINT_INDEX[tableType]] / path.totalLength;
}
