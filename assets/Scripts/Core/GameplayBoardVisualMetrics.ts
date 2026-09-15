import { DEFAULT_CELL_SIZE, PINDD_BEAN_TO_SLOT_RATIO } from './GameCtrlShared';

/** Native board dimensions, before the board viewport or a thumbnail scales the whole artwork. */
export function getBoardCellSize(width: number, height: number): number {
    const maxDim = Math.max(width, height);
    const padding = maxDim > 20 ? 8 : 28;
    const minCellSize = maxDim > 48 ? 6 : (maxDim > 32 ? 8 : 12);
    return Math.max(minCellSize, Math.min(DEFAULT_CELL_SIZE, Math.floor((660 - padding) / maxDim)));
}

export function getBoardBeanSize(slotSize: number): number {
    const targetSize = Math.max(6, Math.round(slotSize * PINDD_BEAN_TO_SLOT_RATIO));
    const maxSafeSize = slotSize <= 10 ? Math.max(4, slotSize - 1) : slotSize;
    return Math.max(4, Math.min(targetSize, maxSafeSize));
}
