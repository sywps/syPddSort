"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAINBOW_CONVEYOR_CORNER_RADIUS = exports.RAINBOW_CONVEYOR_EXIT_POINT_INDEX = exports.RAINBOW_CONVEYOR_PATHS = void 0;
exports.conveyorEntranceCarrier = conveyorEntranceCarrier;
exports.createRoundedConveyorPath = createRoundedConveyorPath;
exports.sampleRoundedConveyorPath = sampleRoundedConveyorPath;
exports.conveyorExitProgress = conveyorExitProgress;
// Original pixel-puzzle path, shared by rendering and replay verification.
function conveyorEntranceCarrier(travel, count) {
    let index = 0;
    let distance = Infinity;
    for (let candidate = 0; candidate < count; candidate++) {
        const progress = ((((candidate + travel) / count) % 1) + 1) % 1;
        const delta = Math.min(progress, 1 - progress);
        if (delta < distance) {
            index = candidate;
            distance = delta;
        }
    }
    return { index, distance };
}
exports.RAINBOW_CONVEYOR_PATHS = {
    2: [[-219, -99], [390, -96], [390, 104.2], [152, 104.2], [-396, 104.2], [-390, -92]],
    3: [[-327, -159], [447, -162], [447, 161], [263, 161], [264, 50],
        [163, 50], [-279, 47], [-279, 166.3], [-452, 166.3], [-452, -159]],
};
exports.RAINBOW_CONVEYOR_EXIT_POINT_INDEX = { 2: 3, 3: 5 };
const RAINBOW_CONVEYOR_ROUNDED_CORNERS = {
    2: new Set([1, 2, 4, 5]),
    3: new Set([1, 2, 3, 4, 6, 7, 8, 9]),
};
exports.RAINBOW_CONVEYOR_CORNER_RADIUS = 40;
const PATH_EPSILON = 1e-6;
const SMOOTH_CORNER_TRIM = 48;
const TURN_RAMP_FRACTION = 0.15;
const TURN_SAMPLES = 256;
function pointDistance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}
function createRoundedCorner(points, index, radius, rounded) {
    const current = points[index];
    if (!rounded)
        return { entry: current, exit: current, arc: null };
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
    if (turnSign > 0 && sweepAngle < 0)
        sweepAngle += Math.PI * 2;
    if (turnSign < 0 && sweepAngle > 0)
        sweepAngle -= Math.PI * 2;
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
// Integrate a heading whose curvature ramps up/down at the straight joins.
// Sampling is by accumulated distance, not by curve parameter or a time tween.
function smoothCorner(corner) {
    const arc = corner.arc;
    if (!arc || arc.kind !== 'arc')
        return corner;
    const startAngle = arc.startAngle + Math.sign(arc.sweepAngle) * Math.PI / 2;
    const heading = (t) => {
        const ramp = TURN_RAMP_FRACTION;
        const fraction = t < ramp ? t * t / (2 * ramp * (1 - ramp))
            : t > 1 - ramp ? 1 - (1 - t) ** 2 / (2 * ramp * (1 - ramp))
                : (t - ramp / 2) / (1 - ramp);
        return startAngle + arc.sweepAngle * fraction;
    };
    const integrated = [{ x: 0, y: 0, angle: startAngle }];
    for (let i = 1; i <= TURN_SAMPLES; i++) {
        const previous = integrated[i - 1];
        const angle = heading(i / TURN_SAMPLES);
        integrated.push({
            x: previous.x + (Math.cos(previous.angle) + Math.cos(angle)) / (2 * TURN_SAMPLES),
            y: previous.y + (Math.sin(previous.angle) + Math.sin(angle)) / (2 * TURN_SAMPLES),
            angle,
        });
    }
    const end = integrated[TURN_SAMPLES];
    const scale = pointDistance(corner.entry, corner.exit) / Math.hypot(end.x, end.y);
    let length = 0;
    const samples = integrated.map((point, index) => {
        const position = index === TURN_SAMPLES ? corner.exit : {
            x: corner.entry.x + point.x * scale,
            y: corner.entry.y + point.y * scale,
        };
        if (index > 0)
            length += Math.hypot(point.x - integrated[index - 1].x, point.y - integrated[index - 1].y) * scale;
        return { ...position, distance: length, angle: point.angle };
    });
    return { entry: corner.entry, exit: corner.exit, arc: { kind: 'smooth', length, samples } };
}
function buildConveyorPath(tableType = 2, scale = 1, smoothTrimBeforeExit = 0, smoothTrimAfterExit = smoothTrimBeforeExit) {
    if (!Number.isFinite(scale) || scale <= 0)
        throw new Error('invalid conveyor path scale');
    const points = exports.RAINBOW_CONVEYOR_PATHS[tableType]
        .map(([x, y]) => ({ x: x * scale, y: y * scale }));
    const roundedCorners = RAINBOW_CONVEYOR_ROUNDED_CORNERS[tableType];
    const corners = points.map((_, index) => {
        const trim = index < exports.RAINBOW_CONVEYOR_EXIT_POINT_INDEX[tableType]
            ? smoothTrimBeforeExit : smoothTrimAfterExit;
        const corner = createRoundedCorner(points, index, (trim || exports.RAINBOW_CONVEYOR_CORNER_RADIUS) * scale, roundedCorners.has(index));
        return trim ? smoothCorner(corner) : corner;
    });
    const segments = [];
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
        if (nextIndex !== 0)
            waypointDistances[nextIndex] = totalLength + ((cornerArc === null || cornerArc === void 0 ? void 0 : cornerArc.length) || 0) / 2;
        if (cornerArc && cornerArc.length > PATH_EPSILON) {
            segments.push({ ...cornerArc, startDistance: totalLength });
            totalLength += cornerArc.length;
        }
    }
    if (totalLength <= PATH_EPSILON || !segments.length)
        throw new Error(`invalid conveyor path for table type ${tableType}`);
    return { segments, totalLength, waypointDistances };
}
function createRoundedConveyorPath(tableType = 2, scale = 1) {
    // Only table 2 is used by the active layout; leave the retired table 3 unchanged.
    if (tableType !== 2)
        return buildConveyorPath(tableType, scale);
    const legacy = buildConveyorPath(tableType, scale);
    const exitIndex = exports.RAINBOW_CONVEYOR_EXIT_POINT_INDEX[tableType];
    const exitProgress = legacy.waypointDistances[exitIndex] / legacy.totalLength;
    const base = buildConveyorPath(tableType, scale, SMOOTH_CORNER_TRIM);
    const probe = buildConveyorPath(tableType, scale, SMOOTH_CORNER_TRIM, SMOOTH_CORNER_TRIM + 1);
    // Corner lengths vary linearly with trim here. Balance the return side so
    // old replay exit crossings stay identical while the entire path is uniform-speed.
    const wantedLength = base.waypointDistances[exitIndex] / exitProgress;
    const afterTrim = SMOOTH_CORNER_TRIM + (wantedLength - base.totalLength)
        / (probe.totalLength - base.totalLength);
    if (!Number.isFinite(afterTrim) || afterTrim < 40 || afterTrim > 72) {
        throw new Error('smooth conveyor trim cannot preserve replay exit');
    }
    const result = buildConveyorPath(tableType, scale, SMOOTH_CORNER_TRIM, afterTrim);
    if (Math.abs(result.waypointDistances[exitIndex] / result.totalLength - exitProgress) > 1e-12) {
        throw new Error('smooth conveyor replay exit mismatch');
    }
    return result;
}
function sampleRoundedConveyorPath(path, progress, outPosition) {
    const wrappedProgress = ((progress % 1) + 1) % 1;
    const distance = wrappedProgress * path.totalLength;
    for (let index = 0; index < path.segments.length; index += 1) {
        const segment = path.segments[index];
        const endDistance = segment.startDistance + segment.length;
        if (distance > endDistance && index < path.segments.length - 1)
            continue;
        const ratio = Math.max(0, Math.min(1, (distance - segment.startDistance) / segment.length));
        if (segment.kind === 'line') {
            outPosition.x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
            outPosition.y = segment.start.y + (segment.end.y - segment.start.y) * ratio;
            return segment.angle * 180 / Math.PI;
        }
        if (segment.kind === 'smooth') {
            const target = ratio * segment.length;
            let low = 0;
            let high = segment.samples.length - 1;
            while (high - low > 1) {
                const middle = (low + high) >>> 1;
                if (segment.samples[middle].distance <= target)
                    low = middle;
                else
                    high = middle;
            }
            const a = segment.samples[low];
            const b = segment.samples[high];
            const mix = (target - a.distance) / (b.distance - a.distance);
            outPosition.x = a.x + (b.x - a.x) * mix;
            outPosition.y = a.y + (b.y - a.y) * mix;
            return (a.angle + (b.angle - a.angle) * mix) * 180 / Math.PI;
        }
        const angle = segment.startAngle + segment.sweepAngle * ratio;
        outPosition.x = segment.center.x + Math.cos(angle) * segment.radius;
        outPosition.y = segment.center.y + Math.sin(angle) * segment.radius;
        const direction = Math.sign(segment.sweepAngle);
        return Math.atan2(Math.cos(angle) * direction, -Math.sin(angle) * direction) * 180 / Math.PI;
    }
    throw new Error('failed to sample conveyor path');
}
function conveyorExitProgress(tableType = 2) {
    // This is a replay protocol boundary. Do not change historical gate timing.
    const path = buildConveyorPath(tableType);
    return path.waypointDistances[exports.RAINBOW_CONVEYOR_EXIT_POINT_INDEX[tableType]] / path.totalLength;
}
