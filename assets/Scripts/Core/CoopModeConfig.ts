import type { LevelData } from './LevelConfig';
import type { PvpRuleEvent } from './PvpHumanReplay';

export const COOP_RULES_VERSION = 'coop-pch-v3';
export const COOP_MAX_ELAPSED_MS = 365 * 86400000;
export const COOP_ROUTE_REASON = 'pixel-coop';
export type CoopLevelEntry = { levelId: number; name: string; beanCount: number; collectionId: string; file: string };
export type CoopPost = { id: string; levelId: number; levelHash: string; creatorName: string; creatorDone: boolean; published: boolean; completedCount: number };
export type CoopRun = { id: string; postId: string; role: 'creator' | 'collaborator'; version: number;
    status: 'playing' | 'complete'; elapsedMs: number; completedAt: number | null; displayName: string;
    lastRequestId?: string };
export type CoopOverview = { activeCreated: string | null; activeJoined: string | null; unlocked: Record<string, number> };
export type CoopPendingSave = { requestId: string; version: number; events: PvpRuleEvent[] };

export function coopHalfLevel(full: LevelData, role: CoopRun['role']): LevelData {
    if (full.boardWidth !== 64 || full.boardHeight !== 56 || !['creator', 'collaborator'].includes(role)) throw new Error('合作关卡分区不匹配');
    const start = role === 'creator' ? 0 : 32;
    return { ...full, boardWidth: 32, timeLimit: COOP_MAX_ELAPSED_MS / 1000, autoConveyorFinishSpeed: false,
        correctColorArr: full.correctColorArr.map(row => row.slice(start, start + 32)),
        initRandomColorArr: full.initRandomColorArr.map(row => row.slice(start, start + 32)) };
}
