// Original pixel-puzzle path, shared by rendering and replay verification.
export type RainbowConveyorTableType = 2 | 3;
export const RAINBOW_CONVEYOR_PATHS: Record<RainbowConveyorTableType, ReadonlyArray<readonly [number, number]>> = {
    2: [[-219, -99], [390, -96], [390, 104.2], [152, 104.2], [-396, 104.2], [-390, -92]],
    3: [[-327, -159], [447, -162], [447, 161], [263, 161], [264, 50],
        [163, 50], [-279, 47], [-279, 166.3], [-452, 166.3], [-452, -159]],
};
export const RAINBOW_CONVEYOR_EXIT_POINT_INDEX: Record<RainbowConveyorTableType, number> = { 2: 3, 3: 5 };
export function conveyorExitProgress(tableType: RainbowConveyorTableType = 2): number {
    const points = RAINBOW_CONVEYOR_PATHS[tableType];
    let length = 0;
    let exit = 0;
    for (let i = 0; i < points.length; i++) {
        const next = points[(i + 1) % points.length];
        // Match the scene's scaled coordinates and arithmetic order.
        const dx = next[0] * 0.6 - points[i][0] * 0.6;
        const dy = next[1] * 0.6 - points[i][1] * 0.6;
        length += Math.sqrt(dx * dx + dy * dy);
        if (i + 1 === RAINBOW_CONVEYOR_EXIT_POINT_INDEX[tableType]) exit = length;
    }
    return exit / length;
}
