export const PVP_ROUTE_REASON = 'pvp-ranked';
export const PVP_LEVEL_PREFIX = 'zt_level_';
export const PVP_RULES_VERSION = 'pvp-pixel-v2';

export function isPixelPvpMatch(value: { levelPrefix?: string; rulesVersion?: string } | null | undefined): boolean {
    return value?.levelPrefix === PVP_LEVEL_PREFIX && value?.rulesVersion === PVP_RULES_VERSION;
}

export type PvpOpponentType = 'ranked' | 'friend';
export type PvpTerminalType = 'PASS' | 'DEAD_CONVEYOR_FULL' | 'DEAD_TIMEOUT' | 'FORFEIT' | 'SURVIVED_OPPONENT_DEATH';

export interface PvpPublicProfile {
    displayName: string;
    rankName: string;
    stars: number;
    avatarUrl?: string;
    opponentType?: PvpOpponentType;
}

export interface PvpReplayProgressPoint {
    elapsedMs: number;
    progress: number;
}

export interface PvpLockedCell {
    row: number;
    col: number;
    colorId: number;
}

export interface PvpBoardTimelinePoint {
    elapsedMs: number;
    addedCells: PvpLockedCell[];
}

export interface PvpBattleContext {
    matchId: string;
    levelId: number;
    levelPrefix: typeof PVP_LEVEL_PREFIX;
    rulesVersion: string;
    self: PvpPublicProfile;
    opponent: PvpPublicProfile;
    opponentTargetMs: number;
    opponentTerminalType: PvpTerminalType;
    matchType?: PvpOpponentType;
    opponentReplayId?: string;
    opponentTimeline?: PvpReplayProgressPoint[];
    opponentBoardTimeline?: PvpBoardTimelinePoint[];
    opponentBoardSeed?: string;
    botPolicyVersion?: string;
    replayProtocol?: string;
    levelHash?: string;
    resumeReplay?: import('./PvpHumanReplay').PvpReplayEnvelope;
    resumeBoardTimeline?: PvpBoardTimelinePoint[];
    friendRole?: 'creator' | 'challenger';
    challengeCode?: string;
    startedAtMs: number;
    resumeElapsedMs?: number;
    demo: boolean;
    entryInventory?: Partial<import('./UserStateSyncMgr').CloudGameState>;
}

export interface PvpSettlement {
    outcome: 'win' | 'lose' | 'draw';
    rankStarDelta: number;
    braveryPointsAfter: number;
    braveryProtected?: boolean;
    rankBefore: PvpRankSnapshot;
    rankAfter: PvpRankSnapshot;
    settledAt: number;
}

export interface PvpRankSnapshot {
    displayName: string;
    tierName: string;
    division: number;
    stars: number;
    totalStars?: number;
}

export interface PvpRankedModeConfig {
    mode: 'ranked';
    propsEnabled: false;
    reviveEnabled: false;
    adContinueEnabled: false;
    speedControlEnabled: true;
    temporarySlotsEnabled: false;
    reuseCurrentConveyor: true;
    opponentProgressVisible: true;
    opponentThumbnailVisible: true;
}

export const PVP_RANKED_MODE_CONFIG: Readonly<PvpRankedModeConfig> = Object.freeze({
    mode: 'ranked',
    propsEnabled: false,
    reviveEnabled: false,
    adContinueEnabled: false,
    speedControlEnabled: true,
    temporarySlotsEnabled: false,
    reuseCurrentConveyor: true,
    opponentProgressVisible: true,
    opponentThumbnailVisible: true,
});

export function isPvpRouteReason(value: unknown): boolean {
    return String(value || '') === PVP_ROUTE_REASON;
}

export function clampPvpProgress(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(1, numeric));
}

function pvpHash32(input: string): number {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function resolvePvpBoardTimeline(timeline: ReadonlyArray<PvpBoardTimelinePoint>, elapsedMs: number): PvpLockedCell[] {
    const cells = new Map<string, PvpLockedCell>();
    const currentTime = Math.max(0, Number(elapsedMs) || 0);
    for (const point of timeline || []) {
        if (Number(point.elapsedMs) > currentTime) break;
        for (const cell of point.addedCells || []) {
            const normalized = {
                row: Math.max(0, Math.floor(Number(cell.row) || 0)),
                col: Math.max(0, Math.floor(Number(cell.col) || 0)),
                colorId: Math.max(1, Math.floor(Number(cell.colorId) || 1)),
            };
            cells.set(`${normalized.row}:${normalized.col}`, normalized);
        }
    }
    return [...cells.values()];
}

export function createSeededPvpBoardState(
    cells: ReadonlyArray<PvpLockedCell>,
    seed: string,
    progress: number,
): PvpLockedCell[] {
    const ordered = [...cells].sort((left, right) => {
        const leftScore = pvpHash32(`${seed}:${left.row}:${left.col}`);
        const rightScore = pvpHash32(`${seed}:${right.row}:${right.col}`);
        if (leftScore !== rightScore) return leftScore - rightScore;
        return left.row - right.row || left.col - right.col;
    });
    return ordered.slice(0, Math.floor(ordered.length * clampPvpProgress(progress)));
}

export function createDemoPvpBattle(levelId: number, nowMs: number = Date.now()): PvpBattleContext {
    const normalizedLevel = Math.max(1, Math.floor(Number(levelId) || 1));
    return {
        matchId: `local-demo-${nowMs}`,
        levelId: normalizedLevel,
        levelPrefix: PVP_LEVEL_PREFIX,
        rulesVersion: PVP_RULES_VERSION,
        self: {
            displayName: '拼豆达人',
            rankName: '永恒钻石 III',
            stars: 2,
        },
        opponent: {
            displayName: '糖豆小葵',
            rankName: '永恒钻石 III',
            stars: 2,
            opponentType: 'ranked',
        },
        // Prepared from the loaded pixel level before the battle clock starts.
        opponentTargetMs: 0,
        opponentTerminalType: 'DEAD_TIMEOUT',
        matchType: 'ranked',
        opponentTimeline: [],
        startedAtMs: nowMs,
        demo: true,
        replayProtocol: 'pch-events-v1',
    };
}

export function resolvePvpOutcome(
    ownType: PvpTerminalType,
    ownTimeMs: number,
    opponentType: PvpTerminalType,
    opponentTimeMs: number,
): 'win' | 'lose' | 'draw' {
    const ownPass = ownType === 'PASS';
    const opponentPass = opponentType === 'PASS';
    if (ownType === 'FORFEIT') return opponentType === 'FORFEIT' ? 'draw' : 'lose';
    if (opponentType === 'FORFEIT') return 'win';
    if (ownType === 'SURVIVED_OPPONENT_DEATH') return opponentPass ? 'lose' : 'win';
    if (opponentType === 'SURVIVED_OPPONENT_DEATH') return ownPass ? 'win' : 'lose';
    if (ownPass && opponentPass) {
        if (ownTimeMs === opponentTimeMs) return 'draw';
        return ownTimeMs < opponentTimeMs ? 'win' : 'lose';
    }
    if (ownPass !== opponentPass) return ownPass ? 'win' : 'lose';
    if (ownTimeMs === opponentTimeMs) return 'draw';
    return ownTimeMs > opponentTimeMs ? 'win' : 'lose';
}
