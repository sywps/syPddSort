import { _decorator, sys } from 'cc';
import { getDouyinMiniGameRuntime, getWeChatMiniGameRuntime } from './MiniGamePlatform';
import { PlatformCloudMgr } from './PlatformCloudMgr';
import { createDemoPvpBattle, type PvpBattleContext, type PvpBoardTimelinePoint, type PvpLockedCell, type PvpPublicProfile, type PvpReplayProgressPoint, type PvpSettlement, type PvpTerminalType } from './PvpModeConfig';
import { UserMgr } from './UserMgr';
import { createPixelBotReplay, pixelLevelHash } from './PvpBotReplay';
import type { LevelData } from './LevelConfig';
import { HUMAN_REPLAY_PROTOCOL, type PvpReplayEnvelope } from './PvpHumanReplay';
import { PVP_LEVEL_PREFIX, PVP_RULES_VERSION, isPixelPvpMatch } from './PvpModeConfig';
import { UserStateSyncMgr, PVP_ECONOMY_REVISION_KEY, type CloudGameState } from './UserStateSyncMgr';
import { applyLocalWeChatShareMaterial } from '../Platform/WeChatShareReturnService';

const { ccclass } = _decorator;
const CLOUD_FUNCTION_NAME = 'pvpService';
const TRAINING_CONSENT_KEY = 'pdd.pvp.trainingConsent.v1';
const ACTIVE_BATTLE_KEY = 'pdd.pvp.activeBattle.v1';
const PENDING_TICKET_KEY = 'pdd.pvp.pendingTicket.v1';
const REPLAY_CONSENT_KEY = 'pdd.pvp.replayConsent.v1';

export type PvpRankReward = {
    tier: string; name: string; minStars: number; gold: number; prop: 'brush' | 'magnet'; count: number;
    status: 'claimable' | 'claimed' | 'locked' | 'disabled' | 'pending';
};
export type PvpEconomyState = {
    version: number; tickets: number; capacity: number; shareUsed: number; shareLimit: number;
    serverTime: number; resetAt: number; seasonId: string; rewardsEnabled: boolean;
    inventory: Partial<CloudGameState> | null; rewards: PvpRankReward[];
};

export type PvpCloudMatch = {
    matchId: string;
    matchType: 'ranked' | 'friend';
    status: string;
    levelId: number;
    levelPrefix?: string;
    rulesVersion: string;
    replayProtocol?: string;
    levelHash?: string;
    self: PvpPublicProfile;
    opponent: PvpPublicProfile | null;
    opponentRun?: {
        replayId?: string;
        terminalType: PvpTerminalType;
        terminalTimeMs: number;
        progressTimeline?: PvpReplayProgressPoint[];
        boardTimeline?: PvpBoardTimelinePoint[];
        replay?: PvpReplayEnvelope;
        boardSeed?: string;
    } | null;
    challengeCode?: string;
    settlement?: PvpSettlement | null;
    entryInventory?: Partial<CloudGameState>;
    selfCheckpoint?: {
        replay?: PvpReplayEnvelope;
        progress: number;
        logicalTimeMs: number;
        lastSeq: number;
        lockedCells?: PvpLockedCell[];
        boardTimeline?: PvpBoardTimelinePoint[];
    } | null;
};

type CloudResult<T> = { ok: boolean; errorCode?: string; errorMessage?: string } & T;

export type PvpLeaderboardEntry = PvpPublicProfile & {
    rank: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    winStreak: number;
    isSelf?: boolean;
};

export type PvpRankedProfile = PvpPublicProfile & {
    gamesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    winStreak: number;
};

export type PvpSubmission = {
    replay?: PvpReplayEnvelope;
    terminalType: PvpTerminalType;
    terminalTimeMs: number;
    progress: number;
    actions: ReadonlyArray<{ seq: number; elapsedMs: number; row: number; col: number; colorId: number; moved: number }>;
    progressTimeline: ReadonlyArray<PvpReplayProgressPoint>;
    boardTimeline: ReadonlyArray<PvpBoardTimelinePoint>;
};

@ccclass('PvpServiceMgr')
export class PvpServiceMgr {
    private static _inst: PvpServiceMgr | null = null;

    static get inst(): PvpServiceMgr {
        if (!PvpServiceMgr._inst) PvpServiceMgr._inst = new PvpServiceMgr();
        return PvpServiceMgr._inst;
    }

    private constructor() {}
    private previewTickets = 3;
    private previewBotProfile = { rating: 1200, gamesPlayed: 0, lossStreak: 0 };
    private previewSettledMatches = new Set<string>();
    private previewMatchSequence = 0;
    private previewTicketShares = 0;
    private previewTicketDay = Math.floor((Date.now() + 28800000) / 86400000);

    private refreshPreviewTicketDay(): void {
        const day = Math.floor((Date.now() + 28800000) / 86400000);
        if (day === this.previewTicketDay) return;
        this.previewTicketDay = day;
        this.previewTickets = 3;
        this.previewTicketShares = 0;
    }

    async simulateTicketReward(source: 'ad' | 'share'): Promise<PvpEconomyState> {
        if (!this.isLocalPreview()) throw new Error('仅本地预览可模拟门票奖励');
        if (source !== 'ad' && source !== 'share') throw new Error('无效的门票获取方式');
        this.refreshPreviewTicketDay();
        if (this.previewTickets >= 3) throw new Error('门票已满，无需补充');
        if (source === 'share' && this.previewTicketShares >= 2) throw new Error('今日分享次数已用完');
        this.previewTickets++;
        if (source === 'share') this.previewTicketShares++;
        return this.getEconomy();
    }

    async syncInventory(runtime: any): Promise<void> {
        if (this.isLocalPreview()) return;
        if (!await PlatformCloudMgr.inst.init()) throw new Error('PVP 云服务不可用');
        if (typeof runtime?.ensureCloudGameStateSyncReady !== 'function' || !await runtime.ensureCloudGameStateSyncReady() || !UserStateSyncMgr.inst.canUseCloud()) {
            throw new Error('资产云同步不可用，未扣体力和门票，请重试');
        }
    }

    async getEconomy(): Promise<PvpEconomyState> {
        if (!this.isLocalPreview()) return (await this.call<{ economy: PvpEconomyState }>('getEconomy', {})).economy;
        this.refreshPreviewTicketDay();
        const now = Date.now();
        const tiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'king'];
        const names = ['倔强青铜', '秩序白银', '荣耀黄金', '尊贵铂金', '永恒钻石', '至尊星耀', '最强王者'];
        return { version: 1, tickets: this.previewTickets, capacity: 3, shareUsed: this.previewTicketShares, shareLimit: 2,
            serverTime: now, resetAt: (Math.floor((now + 28800000) / 86400000) + 1) * 86400000 - 28800000,
            seasonId: 'S01', rewardsEnabled: false, inventory: null,
            rewards: tiers.map((tier, index) => ({ tier, name: names[index], minStars: [0, 9, 18, 34, 50, 75, 100][index],
                gold: [188, 366, 688, 688, 888, 1688, 0][index], prop: [0, 3, 5, 6].includes(index) ? 'magnet' : 'brush', count: index === 6 ? 0 : index < 3 ? 1 : 2,
                status: index === 6 ? 'pending' : index < 2 ? 'claimed' : index < 5 ? 'disabled' : 'locked' })),
        };
    }

    async beginTicketReward(source: 'ad' | 'share'): Promise<{ claimId: string; expiresAt: number }> {
        if (this.isLocalPreview()) throw new Error('本地预览不能领取真实门票，请在小游戏内体验');
        const requestId = `ticket_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        return (await this.call<{ reward: { claimId: string; expiresAt: number } }>('beginTicketReward', { source, requestId })).reward;
    }

    hasPendingTicketReward(): boolean { return !this.isLocalPreview() && !!sys.localStorage.getItem(PENDING_TICKET_KEY); }

    async claimTicketReward(claimId?: string): Promise<PvpEconomyState> {
        const pending = claimId || sys.localStorage.getItem(PENDING_TICKET_KEY);
        if (!pending) throw new Error('没有待补领的门票');
        sys.localStorage.setItem(PENDING_TICKET_KEY, pending);
        try {
            const result = await this.call<{ economy: PvpEconomyState }>('claimTicketReward', { claimId: pending });
            sys.localStorage.removeItem(PENDING_TICKET_KEY);
            return result.economy;
        } catch (error) {
            if (/已过期|不属于当前玩家/.test(String((error as Error)?.message))) sys.localStorage.removeItem(PENDING_TICKET_KEY);
            throw error;
        }
    }

    async claimRankReward(tier: string, seasonId: string): Promise<PvpEconomyState> {
        if (this.isLocalPreview()) throw new Error('本地预览不发放真实奖励');
        return (await this.call<{ economy: PvpEconomyState }>('claimRankReward', { tier, seasonId })).economy;
    }

    isLocalPreview(): boolean {
        return PlatformCloudMgr.inst.getPlatform() === 'none';
    }

    preparePreviewBattle(context: PvpBattleContext, level: LevelData): void {
        if (!context.demo || context.botPolicyVersion) return;
        if (!this.isLocalPreview()) throw new Error('正式环境禁止使用本地机器人');
        const run = createPixelBotReplay(level, context.matchId, this.previewBotProfile);
        context.opponentTargetMs = run.terminalTimeMs;
        context.opponentTerminalType = run.terminalType;
        context.opponentTimeline = run.progressTimeline;
        context.opponentBoardTimeline = run.boardTimeline;
        context.opponentReplayId = run.replayId;
        context.opponentBoardSeed = undefined;
        context.botPolicyVersion = run.policyVersion;
        context.levelHash = run.levelHash;
    }

    recordPreviewResult(context: PvpBattleContext, outcome: 'win' | 'lose' | 'draw'): void {
        if (!context.demo || !this.isLocalPreview() || this.previewSettledMatches.has(context.matchId)) return;
        this.previewSettledMatches.add(context.matchId);
        this.previewBotProfile.gamesPlayed++;
        this.previewBotProfile.lossStreak = outcome === 'lose' ? this.previewBotProfile.lossStreak + 1 : 0;
        this.previewBotProfile.rating = Math.max(700, this.previewBotProfile.rating + (outcome === 'win' ? 16 : outcome === 'lose' ? -16 : 0));
    }

    async matchmake(levelId: number, level?: LevelData, poolVersion?: string): Promise<PvpBattleContext> {
        if (this.isLocalPreview()) {
            this.refreshPreviewTicketDay();
            if (this.previewTickets < 1) throw new Error('本地预览门票已用完，请模拟广告或分享补票');
            if (!level) throw new Error('像素关卡尚未加载，不能生成对手');
            const context = createDemoPvpBattle(levelId);
            context.matchId += `-${++this.previewMatchSequence}`;
            this.preparePreviewBattle(context, level);
            this.previewTickets--;
            return context;
        }
        const result = await this.call<{ match: PvpCloudMatch }>('matchmake', { levelId, levelPrefix: PVP_LEVEL_PREFIX, rulesVersion: PVP_RULES_VERSION,
            replayProtocol: HUMAN_REPLAY_PROTOCOL, allowReplayOpponent: this.hasReplayConsent(),
            ...(poolVersion ? { poolVersion } : {}),
            ...(level ? { levelHash: pixelLevelHash(level) } : {}) });
        return this.persistBattle(this.toBattleContext(result.match));
    }

    async getProfile(): Promise<PvpRankedProfile> {
        if (this.isLocalPreview()) return {
            displayName: '拼豆达人', rankName: '永恒钻石 III', stars: 2,
            gamesPlayed: 36, wins: 21, losses: 14, draws: 1, winStreak: 2,
        };
        return (await this.call<{ profile: PvpRankedProfile }>('getProfile', {})).profile;
    }

    async createFriendChallenge(levelId: number): Promise<{ match: PvpCloudMatch; context: PvpBattleContext }> {
        const match = (await this.call<{ match: PvpCloudMatch }>('createFriendChallenge', { levelId, levelPrefix: PVP_LEVEL_PREFIX, rulesVersion: PVP_RULES_VERSION })).match;
        return { match, context: this.persistBattle(this.toBattleContext(match)) };
    }

    async joinFriendChallenge(challengeCode: string): Promise<PvpBattleContext> {
        const result = await this.call<{ match: PvpCloudMatch }>('joinFriendChallenge', { challengeCode });
        return this.persistBattle(this.toBattleContext(result.match));
    }

    async submitResult(context: PvpBattleContext, submission: PvpSubmission): Promise<PvpCloudMatch> {
        if (context.demo) {
            throw new Error('local preview has no authoritative settlement');
        }
        const actionJson = JSON.stringify(submission.actions);
        const result = await this.call<{ match: PvpCloudMatch }>('submitResult', {
            matchId: context.matchId,
            terminalType: submission.terminalType,
            terminalTimeMs: submission.terminalTimeMs,
            progress: submission.progress,
            actionCount: submission.actions.length,
            actionDigest: this.hash(actionJson),
            checkpointDigest: this.hash(`${context.matchId}:${submission.progress}:${submission.terminalTimeMs}`),
            actionChunks: submission.actions.length > 0 ? [{ seqStart: 1, seqEnd: submission.actions.length, encoding: 'json-v1', payload: actionJson }] : [],
            progressTimeline: submission.progressTimeline,
            boardTimeline: submission.boardTimeline,
            replay: submission.replay,
            allowReplayOpponent: this.hasReplayConsent(),
            trainingConsent: this.hasTrainingConsent(),
            clientFinishedAt: Date.now(),
        });
        return result.match;
    }

    async getActiveMatch(): Promise<PvpCloudMatch | null> {
        if (this.isLocalPreview()) return null;
        const match = (await this.call<{ match: PvpCloudMatch | null }>('getActiveMatch', {})).match;
        if (match && !isPixelPvpMatch(match)) throw new Error('云端仍是旧版主线对战，请更新 PVP 云函数');
        return match;
    }

    async getMatch(matchId: string): Promise<PvpCloudMatch> {
        return (await this.call<{ match: PvpCloudMatch }>('getMatch', { matchId })).match;
    }

    async getHistory(limit: number = 20): Promise<PvpCloudMatch[]> {
        if (this.isLocalPreview()) return this.createPreviewHistory().slice(0, limit);
        return (await this.call<{ history: PvpCloudMatch[] }>('getHistory', { limit })).history;
    }

    async saveCheckpoint(
        context: PvpBattleContext,
        logicalTimeMs: number,
        progress: number,
        actions: ReadonlyArray<any>,
        lockedCells: ReadonlyArray<PvpLockedCell>,
        boardTimeline: ReadonlyArray<PvpBoardTimelinePoint>,
        replay?: PvpReplayEnvelope,
    ): Promise<{ acceptedSeq: number; updatedAt: number; ignored: boolean }> {
        return (await this.call<{ checkpoint: { acceptedSeq: number; updatedAt: number; ignored: boolean } }>('saveCheckpoint', {
            matchId: context.matchId, logicalTimeMs, progress, lastSeq: actions.length, replay,
            stateHash: this.hash(JSON.stringify({ progress, lastSeq: actions.length, lockedCells })), lockedCells, boardTimeline,
        })).checkpoint;
    }

    async cancelMatch(context: PvpBattleContext, logicalTimeMs: number, progress: number): Promise<PvpCloudMatch> {
        const match = (await this.call<{ match: PvpCloudMatch }>('cancelMatch', { matchId: context.matchId, logicalTimeMs, progress })).match;
        this.clearPersistedBattle();
        return match;
    }

    loadPersistedBattle(): PvpBattleContext | null {
        try {
            const raw = sys.localStorage.getItem(ACTIVE_BATTLE_KEY);
            if (!raw) return null;
            const value = JSON.parse(raw) as PvpBattleContext;
            return value?.matchId && isPixelPvpMatch(value) ? value : null;
        } catch (_) {
            return null;
        }
    }

    persistBattle(context: PvpBattleContext): PvpBattleContext {
        sys.localStorage.setItem(ACTIVE_BATTLE_KEY, JSON.stringify(context));
        return context;
    }

    clearPersistedBattle(): void {
        sys.localStorage.removeItem(ACTIVE_BATTLE_KEY);
    }

    setTrainingConsent(consented: boolean): void {
        sys.localStorage.setItem(TRAINING_CONSENT_KEY, consented ? '1' : '0');
    }

    hasTrainingConsent(): boolean {
        return sys.localStorage.getItem(TRAINING_CONSENT_KEY) === '1';
    }

    hasReplayConsent(): boolean { return sys.localStorage.getItem(REPLAY_CONSENT_KEY) === '1'; }

    setReplayConsent(value: boolean): void { sys.localStorage.setItem(REPLAY_CONSENT_KEY, value ? '1' : '0'); }

    async getRankedLevel(): Promise<{ levelId: number; levelHash: string; poolVersion: string }> {
        if (this.isLocalPreview()) throw new Error('本地预览使用本地关卡，不请求正式对手池');
        return (await this.call<{ level: { levelId: number; levelHash: string; poolVersion: string } }>('getRankedLevel', {
            replayProtocol: HUMAN_REPLAY_PROTOCOL,
        })).level;
    }

    async getLeaderboard(limit: number = 50): Promise<{ entries: PvpLeaderboardEntry[]; self: PvpLeaderboardEntry | null }> {
        if (this.isLocalPreview()) {
            const names = ['像素旅人', '彩豆队长', '拼图小匠', '方块猫', '拼豆达人', '格子骑士', '彩虹工坊', '像素新星'];
            const entries = names.slice(0, limit).map((displayName, index) => ({
                rank: index + 1, displayName, rankName: index < 2 ? '至尊星耀 V' : '永恒钻石 III', stars: Math.max(0, 4 - index % 5),
                gamesPlayed: 42 - index, wins: 25 - Math.floor(index / 2), losses: 16, draws: 1, winStreak: index % 4,
                isSelf: displayName === '拼豆达人', opponentType: 'ranked' as const,
            }));
            return { entries, self: entries.find((entry) => entry.isSelf) || null };
        }
        return this.call<{ entries: PvpLeaderboardEntry[]; self: PvpLeaderboardEntry | null }>('getLeaderboard', { limit });
    }

    getLaunchChallengeCode(): string {
        const runtime = getWeChatMiniGameRuntime() || getDouyinMiniGameRuntime();
        const launch = runtime?.getEnterOptionsSync?.() || runtime?.getLaunchOptionsSync?.() || {};
        const query = launch?.query && typeof launch.query === 'object' ? launch.query : {};
        return String(query.pvpChallenge || query.challengeCode || '').trim().toUpperCase().slice(0, 12);
    }

    shareFriendChallenge(challengeCode: string): boolean {
        const weChatRuntime = getWeChatMiniGameRuntime();
        const runtime = weChatRuntime || getDouyinMiniGameRuntime();
        if (typeof runtime?.shareAppMessage !== 'function') return false;
        const payload = {
            title: '来和我比一局像素拼图！',
            query: `pvpChallenge=${encodeURIComponent(challengeCode)}`,
        };
        runtime.shareAppMessage(weChatRuntime ? applyLocalWeChatShareMaterial(payload) : payload);
        return true;
    }

    private async call<T>(action: string, data: Record<string, unknown>): Promise<CloudResult<T>> {
        const ready = await PlatformCloudMgr.inst.init();
        if (!ready) throw new Error('PVP 云服务不可用');
        const profile = UserMgr.inst.getProfile();
        const result = await PlatformCloudMgr.inst.callFunction<CloudResult<T>>(CLOUD_FUNCTION_NAME, {
            action,
            uuid: profile.uuid,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            economyRevision: Math.max(0, Number(sys.localStorage.getItem(PVP_ECONOMY_REVISION_KEY)) || 0),
            ...data,
        });
        if (result?.ok !== true) throw new Error(result?.errorMessage || 'PVP 服务请求失败');
        return result;
    }

    toBattleContext(match: PvpCloudMatch): PvpBattleContext {
        if (!isPixelPvpMatch(match)) throw new Error('对局不是当前像素拼图版本，无法进入或恢复');
        const pendingFriend = match?.matchType === 'friend' && !match.opponentRun;
        if (!match || (!match.opponent && !pendingFriend)) throw new Error('匹配数据缺少对手');
        const opponent = match.opponent || {
            displayName: '等待好友',
            rankName: '好友挑战',
            stars: 0,
            opponentType: 'friend' as const,
        };
        return {
            matchId: match.matchId,
            levelId: Math.max(1, Number(match.levelId) || 1),
            levelPrefix: PVP_LEVEL_PREFIX,
            rulesVersion: match.rulesVersion,
            replayProtocol: match.replayProtocol,
            levelHash: match.levelHash,
            resumeReplay: match.selfCheckpoint?.replay,
            self: match.self,
            opponent,
            opponentTargetMs: pendingFriend ? 24 * 60 * 60 * 1000 : Math.max(1, Number(match.opponentRun?.terminalTimeMs) || 1),
            opponentTerminalType: match.opponentRun?.terminalType || 'PASS',
            opponentReplayId: match.opponentRun?.replayId,
            opponentTimeline: match.opponentRun?.progressTimeline || [],
            opponentBoardTimeline: match.opponentRun?.boardTimeline || [],
            opponentBoardSeed: match.opponentRun?.boardSeed || '',
            resumeBoardTimeline: match.selfCheckpoint?.boardTimeline || [],
            matchType: match.matchType,
            friendRole: match.matchType === 'friend' ? (pendingFriend ? 'creator' : 'challenger') : undefined,
            challengeCode: match.challengeCode,
            startedAtMs: Date.now() - Math.max(0, Number(match.selfCheckpoint?.logicalTimeMs) || 0),
            resumeElapsedMs: Math.max(0, Number(match.selfCheckpoint?.logicalTimeMs) || 0),
            demo: false,
            entryInventory: match.entryInventory,
        };
    }

    private hash(input: string): string {
        let value = 2166136261;
        for (let i = 0; i < input.length; i += 1) {
            value ^= input.charCodeAt(i);
            value = Math.imul(value, 16777619);
        }
        return `fnv1a-${(`00000000${(value >>> 0).toString(16)}`).slice(-8)}`;
    }

    private createPreviewHistory(): PvpCloudMatch[] {
        const now = Date.now();
        return [
            { matchId: 'preview-history-1', matchType: 'ranked', status: 'SETTLED', levelId: 12, rulesVersion: 'pvp-ranked-v1', self: { displayName: '拼豆达人', rankName: '永恒钻石 III', stars: 2 }, opponent: { displayName: '像素旅人', rankName: '永恒钻石 II', stars: 1, opponentType: 'ranked' }, settlement: { outcome: 'win', rankStarDelta: 1, braveryPointsAfter: 68, rankBefore: { displayName: '永恒钻石 III', tierName: '永恒钻石', division: 3, stars: 1 }, rankAfter: { displayName: '永恒钻石 III', tierName: '永恒钻石', division: 3, stars: 2 }, settledAt: now - 3600000 } },
            { matchId: 'preview-history-2', matchType: 'ranked', status: 'SETTLED', levelId: 11, rulesVersion: 'pvp-ranked-v1', self: { displayName: '拼豆达人', rankName: '永恒钻石 III', stars: 1 }, opponent: { displayName: '糖豆小葵', rankName: '永恒钻石 III', stars: 2, opponentType: 'ranked' }, settlement: { outcome: 'lose', rankStarDelta: -1, braveryPointsAfter: 52, rankBefore: { displayName: '永恒钻石 III', tierName: '永恒钻石', division: 3, stars: 2 }, rankAfter: { displayName: '永恒钻石 III', tierName: '永恒钻石', division: 3, stars: 1 }, settledAt: now - 86400000 } },
        ];
    }
}
