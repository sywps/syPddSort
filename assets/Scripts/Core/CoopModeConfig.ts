import type { LevelData } from './LevelConfig';
import type { PvpRuleEvent } from './PvpHumanReplay';
import { pixelLevelHash } from './PvpBotReplay';

export const COOP_RULES_VERSION = 'coop-pch-v4';
export const COOP_LEGACY_RULES_VERSION = 'coop-pch-v3';
export const COOP_MAX_ELAPSED_MS = 365 * 86400000;
export const COOP_ROUTE_REASON = 'pixel-coop';
export type CoopLevelEntry = { levelId: number; name: string; beanCount: number; collectionId: string; file: string };
export type CoopPost = { id: string; levelId: number; levelHash: string; creatorName: string; creatorDone: boolean; published: boolean; completedCount: number };
export type CoopRun = { id: string; postId: string; role: 'creator' | 'collaborator'; version: number;
    avatarUrl?: string; avatarId?: number; frameId?: number;
    status: 'playing' | 'complete'; elapsedMs: number; completedAt: number | null; displayName: string;
    lastRequestId?: string };
export type CoopOverview = { activeCreated: string | null; activeJoined: string | null; unlocked: Record<string, number> };
export type CoopPendingSave = { requestId: string; version: number; events: PvpRuleEvent[] };

export type CoopLevelData = LevelData & { coopRegions?: number[][] };

export function coopRegionGrid(full: CoopLevelData, role: CoopRun['role']): number[][] {
    const owner = role === 'creator' ? 1 : 2;
    return full.correctColorArr.map((row, r) => row.map((color, c) =>
        (full.coopRegions ? full.coopRegions[r][c] === owner : (c < 32) === (owner === 1)) ? color : 0));
}

export function coopLevelHash(full: CoopLevelData): string {
    return pixelLevelHash(full) + (full.coopRegions ? '-' + pixelLevelHash({ ...full,
        correctColorArr: full.coopRegions, initRandomColorArr: full.coopRegions }) : '');
}

export function coopHalfLevel(full: CoopLevelData, role: CoopRun['role']): LevelData {
    if (full.boardWidth !== 64 || full.boardHeight !== 56 || !['creator', 'collaborator'].includes(role)) throw new Error('合作关卡分区不匹配');
    if (full.coopRegions) {
        const counts = [0, 0, 0], balances = [new Map<number, number>(), new Map<number, number>(), new Map<number, number>()];
        if (full.coopRegions.length !== full.boardHeight) throw new Error('合作区域高度不匹配');
        for (let r = 0; r < full.boardHeight; r++) {
            if (full.coopRegions[r]?.length !== full.boardWidth || full.correctColorArr[r]?.length !== full.boardWidth
                || full.initRandomColorArr[r]?.length !== full.boardWidth) throw new Error('合作区域宽度不匹配');
            for (let c = 0; c < full.boardWidth; c++) {
                const color = full.correctColorArr[r][c], current = full.initRandomColorArr[r][c], owner = full.coopRegions[r][c];
                if (color ? owner !== 1 && owner !== 2 : owner !== 0 || current !== 0) throw new Error('合作区域归属无效');
                if (color) {
                    if (!Number.isInteger(color) || color < 1 || color > 20 || !Number.isInteger(current) || current < 1 || current > 20) throw new Error('合作颜色无效');
                    counts[owner]++;
                    const balance = balances[owner];
                    balance.set(color, (balance.get(color) || 0) + 1);
                    balance.set(current, (balance.get(current) || 0) - 1);
                }
            }
        }
        if (!counts[1] || !counts[2] || balances.some(balance => Array.from(balance.values()).some(value => value !== 0))) throw new Error('合作区域颜色数量不守恒');
        const owner = role === 'creator' ? 1 : 2;
        return { ...full, timeLimit: COOP_MAX_ELAPSED_MS / 1000, autoConveyorFinishSpeed: false,
            correctColorArr: coopRegionGrid(full, role),
            initRandomColorArr: full.initRandomColorArr.map((row, r) => row.map((color, c) => full.coopRegions![r][c] === owner ? color : 0)) };
    }
    const start = role === 'creator' ? 0 : 32;
    return { ...full, boardWidth: 32, timeLimit: COOP_MAX_ELAPSED_MS / 1000, autoConveyorFinishSpeed: false,
        correctColorArr: full.correctColorArr.map(row => row.slice(start, start + 32)),
        initRandomColorArr: full.initRandomColorArr.map(row => row.slice(start, start + 32)) };
}
