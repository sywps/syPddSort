import { Color, Graphics, Layers, Node, UITransform } from 'cc';
import { COLOR_HEX } from './LevelConfig';

export type PixelPosterPreviewMode = 'list' | 'poster' | 'win';

export type PixelPosterPreviewOptions = {
    name?: string;
    offsetX?: number;
    offsetY?: number;
    maxW: number;
    maxH: number;
    mode?: PixelPosterPreviewMode;
    cropToContent?: boolean;
    grayscale?: boolean;
    showBackground?: boolean;
    clearExisting?: boolean;
    padding?: number;
    maxCellSize?: number;
    cellGap?: number;
};

type GridBounds = {
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getGridBounds(grid: number[][], cropToContent: boolean): GridBounds | null {
    const rowCount = grid.length;
    const colCount = grid.reduce((max, row) => Math.max(max, row?.length || 0), 0);
    if (rowCount <= 0 || colCount <= 0) return null;

    if (!cropToContent) {
        return { minRow: 0, maxRow: rowCount - 1, minCol: 0, maxCol: colCount - 1 };
    }

    let minRow = rowCount;
    let maxRow = -1;
    let minCol = colCount;
    let maxCol = -1;
    for (let r = 0; r < rowCount; r++) {
        const row = grid[r] || [];
        for (let c = 0; c < row.length; c++) {
            if (!row[c]) continue;
            minRow = Math.min(minRow, r);
            maxRow = Math.max(maxRow, r);
            minCol = Math.min(minCol, c);
            maxCol = Math.max(maxCol, c);
        }
    }
    if (maxRow < minRow || maxCol < minCol) return null;
    return { minRow, maxRow, minCol, maxCol };
}

function getBaseColor(colorId: number, grayscale: boolean): Color {
    const source = new Color(COLOR_HEX[colorId] || '#CCCCCC');
    if (!grayscale) return source;

    const luma = Math.round(source.r * 0.299 + source.g * 0.587 + source.b * 0.114);
    const softened = clamp(Math.round(luma * 0.58 + 92), 118, 218);
    return new Color(softened, softened, softened, 190);
}

function drawRoundedCell(g: Graphics, x: number, y: number, size: number, color: Color, mode: PixelPosterPreviewMode): void {
    const drawShadow = mode !== 'list' && size >= 10;
    const drawDetail = size >= (mode === 'list' ? 14 : 12);
    const radius = Math.max(0.35, Math.min(1.25, size * 0.055));
    const bleed = Math.max(0.45, Math.min(0.95, size * 0.045));
    const bodyX = x - bleed;
    const bodyY = y - bleed;
    const bodySize = size + bleed * 2;

    if (drawShadow) {
        g.fillColor = new Color(0, 0, 0, mode === 'win' ? 14 : 10);
        g.roundRect(bodyX + size * 0.025, bodyY - size * 0.025, bodySize, bodySize, radius);
        g.fill();
    }

    g.fillColor = color;
    g.roundRect(bodyX, bodyY, bodySize, bodySize, radius);
    g.fill();

    if (!drawDetail) return;

    const detailRadius = Math.max(0.2, Math.min(radius, size * 0.035));
    const highlightH = Math.max(0.5, size * 0.07);
    g.fillColor = new Color(255, 255, 255, mode === 'list' ? 8 : 12);
    g.roundRect(x + size * 0.24, y + size * 0.68, size * 0.52, highlightH, detailRadius);
    g.fill();

    if (mode === 'list') return;

    const shadeH = Math.max(0.5, size * 0.06);
    g.fillColor = new Color(0, 0, 0, mode === 'win' ? 7 : 6);
    g.roundRect(x + size * 0.22, y + size * 0.16, size * 0.56, shadeH, detailRadius);
    g.fill();
}

export function renderPixelPosterPreview(
    parent: Node,
    correctArr: number[][],
    options: PixelPosterPreviewOptions,
): Node | null {
    if (!parent?.isValid || !correctArr || options.maxW <= 0 || options.maxH <= 0) return null;

    const name = options.name || 'PixelPosterPreview';
    if (options.clearExisting !== false) {
        parent.getChildByName(name)?.destroy();
    }

    const mode = options.mode || 'poster';
    const cropToContent = options.cropToContent !== false;
    const bounds = getGridBounds(correctArr, cropToContent);
    if (!bounds) return null;

    const renderRows = Math.max(1, bounds.maxRow - bounds.minRow + 1);
    const renderCols = Math.max(1, bounds.maxCol - bounds.minCol + 1);
    const padding = Math.max(0, Math.floor(options.padding ?? (mode === 'list' ? 10 : 8)));
    const gap = Math.max(0, Math.floor(options.cellGap ?? 0));
    const maxCellSize = Math.max(1, Math.floor(options.maxCellSize ?? (mode === 'list' ? 24 : 42)));
    const availableW = Math.max(1, options.maxW - padding * 2);
    const availableH = Math.max(1, options.maxH - padding * 2);
    const rawCellW = Math.floor((availableW - gap * Math.max(0, renderCols - 1)) / renderCols);
    const rawCellH = Math.floor((availableH - gap * Math.max(0, renderRows - 1)) / renderRows);
    const cellSize = Math.max(1, Math.min(maxCellSize, rawCellW, rawCellH));
    const contentW = renderCols * cellSize + Math.max(0, renderCols - 1) * gap;
    const contentH = renderRows * cellSize + Math.max(0, renderRows - 1) * gap;

    const preview = new Node(name);
    parent.addChild(preview);
    preview.layer = parent.layer || Layers.Enum.UI_2D;
    preview.addComponent(UITransform).setContentSize(options.maxW, options.maxH);
    preview.setPosition(options.offsetX || 0, options.offsetY || 0, 0);

    const g = preview.addComponent(Graphics);
    if (options.showBackground) {
        g.fillColor = new Color(255, 250, 241, mode === 'list' ? 150 : 210);
        g.roundRect(-options.maxW / 2, -options.maxH / 2, options.maxW, options.maxH, 12);
        g.fill();
    }

    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
        const row = correctArr[r] || [];
        for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
            const colorId = row[c] || 0;
            if (!colorId) continue;
            const localCol = c - bounds.minCol;
            const localRow = r - bounds.minRow;
            const x = -contentW / 2 + localCol * (cellSize + gap);
            const y = contentH / 2 - (localRow + 1) * cellSize - localRow * gap;
            drawRoundedCell(g, x, y, cellSize, getBaseColor(colorId, !!options.grayscale), mode);
        }
    }

    return preview;
}
