export interface OpeningPatternCell {
    row: number;
    col: number;
}

export interface OpeningPatternMove {
    colorId: number;
    source: OpeningPatternCell;
    target: OpeningPatternCell;
}

const COMPETITOR_STAGGER_SECONDS = 0.05;
const MAX_OPENING_STAGGER_WINDOW_SECONDS = 0.24;

function assertColorId(value: unknown, label: string): number {
    const colorId = Number(value);
    if (!Number.isInteger(colorId) || colorId < 0) {
        throw new Error(`[opening-pattern] ${label} must be a non-negative integer`);
    }
    return colorId;
}

/**
 * Builds a visual-only bijection from the completed pattern to the authoritative
 * shuffled pattern. Both matrices remain untouched.
 */
export function buildOpeningPatternMoves(
    correctColors: number[][],
    currentColors: number[][],
): OpeningPatternMove[] {
    if (!Array.isArray(correctColors) || correctColors.length === 0) {
        throw new Error('[opening-pattern] correct color matrix is empty');
    }
    if (!Array.isArray(currentColors) || currentColors.length !== correctColors.length) {
        throw new Error('[opening-pattern] current color matrix height mismatch');
    }
    const width = Array.isArray(correctColors[0]) ? correctColors[0].length : 0;
    if (width <= 0) throw new Error('[opening-pattern] correct color matrix width is empty');

    const sources: Array<OpeningPatternCell & { colorId: number }> = [];
    const targetsByColor = new Map<number, OpeningPatternCell[]>();
    for (let row = 0; row < correctColors.length; row += 1) {
        const correctRow = correctColors[row];
        const currentRow = currentColors[row];
        if (!Array.isArray(correctRow) || correctRow.length !== width) {
            throw new Error(`[opening-pattern] correct row ${row} width mismatch`);
        }
        if (!Array.isArray(currentRow) || currentRow.length !== width) {
            throw new Error(`[opening-pattern] current row ${row} width mismatch`);
        }
        for (let col = 0; col < width; col += 1) {
            const correctId = assertColorId(correctRow[col], `correctColors[${row}][${col}]`);
            const currentId = assertColorId(currentRow[col], `currentColors[${row}][${col}]`);
            if ((correctId > 0) !== (currentId > 0)) {
                throw new Error(`[opening-pattern] playable-cell mask mismatch at ${row},${col}`);
            }
            if (correctId > 0) sources.push({ row, col, colorId: correctId });
            if (currentId > 0) {
                const targets = targetsByColor.get(currentId) || [];
                targets.push({ row, col });
                targetsByColor.set(currentId, targets);
            }
        }
    }
    if (sources.length === 0) throw new Error('[opening-pattern] board contains no playable beans');

    const sourceCounts = new Map<number, number>();
    for (const source of sources) {
        sourceCounts.set(source.colorId, (sourceCounts.get(source.colorId) || 0) + 1);
    }
    const allColorIds = new Set([...sourceCounts.keys(), ...targetsByColor.keys()]);
    for (const colorId of allColorIds) {
        const sourceCount = sourceCounts.get(colorId) || 0;
        const targetCount = targetsByColor.get(colorId)?.length || 0;
        if (sourceCount !== targetCount) {
            throw new Error(`[opening-pattern] color ${colorId} count mismatch: ${sourceCount} != ${targetCount}`);
        }
    }

    const targetOffsets = new Map<number, number>();
    return sources.map((source) => {
        const targetIndex = targetOffsets.get(source.colorId) || 0;
        const target = targetsByColor.get(source.colorId)?.[targetIndex] || null;
        if (!target) throw new Error(`[opening-pattern] color ${source.colorId} has no target at index ${targetIndex}`);
        targetOffsets.set(source.colorId, targetIndex + 1);
        return {
            colorId: source.colorId,
            source: { row: source.row, col: source.col },
            target: { row: target.row, col: target.col },
        };
    });
}

export function getOpeningPatternStaggerDelay(moveCount: number): number {
    const count = Math.max(0, Math.floor(Number(moveCount) || 0));
    if (count <= 1) return 0;
    return Math.min(
        COMPETITOR_STAGGER_SECONDS,
        MAX_OPENING_STAGGER_WINDOW_SECONDS / (count - 1),
    );
}
