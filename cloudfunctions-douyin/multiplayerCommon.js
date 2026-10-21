'use strict';
const common = require('./businessCommon');
const { names, createStore, coopStore } = require('./multiplayerStore');
const REVISION = 'douyin-multiplayer-v1';
const actions = {
    coop: new Set(['catalog', 'level', 'overview', 'history', 'square', 'create', 'participants', 'detail', 'publish', 'join', 'complete']),
    pvp: new Set(['getProfile', 'getRankedLevel', 'getEconomy', 'beginTicketReward', 'claimTicketReward', 'claimRankReward',
        'matchmake', 'confirmMatchEntry', 'getMatch', 'getActiveMatch', 'saveCheckpoint', 'getOpponentState', 'cancelMatch', 'submitResult', 'getLeaderboard', 'getHistory']),
};
function requireDev() {
    if (process.env.CLOUD_ENV !== 'DEV') throw common.failure('ENVIRONMENT_DISABLED', '多人玩法当前仅配置 dev 环境');
}
function validate(params) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw common.failure('INVALID_REQUEST', '请求格式错误');
    const encoded = JSON.stringify(params);
    if (Buffer.byteLength(encoded, 'utf8') > 3 * 1024 * 1024) throw common.failure('REQUEST_TOO_LARGE', '本局操作记录过大，无法提交');
    function visit(value, depth) {
        if (depth > 12) throw common.failure('INVALID_REQUEST', '请求层级过深');
        if (typeof value === 'number' && !Number.isFinite(value)) throw common.failure('INVALID_REQUEST', '请求数字无效');
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key) || key.startsWith('$')) throw common.failure('INVALID_REQUEST', '请求字段无效');
            visit(child, depth + 1);
        }
    }
    visit(params, 0);
}
async function ready(db) {
    await common.ready(db);
    const row = await db.collection(common.COLLECTIONS.meta).findOne({ _id: REVISION });
    if (!row || row.version !== REVISION || row.transactionsVerified !== true) throw common.failure('MULTIPLAYER_SETUP_REQUIRED', '多人玩法尚未配置完成');
}
async function receive(kind, params, context) {
    try {
        requireDev();
        const owner = common.identity(context);
        validate(params);
        if (params.expectedOwner !== owner) throw common.failure('OWNER_MISMATCH', '登录账号已变化，请重新进入游戏');
        if (!actions[kind]?.has(params.action)) throw common.failure('INVALID_ACTION', '此多人玩法功能尚未开放');
        const connection = await common.database();
        await ready(connection.db);
        const store = createStore(connection);
        let result;
        if (kind === 'coop') {
            const execute = require('./multiplayerRuntime').createCoopService(coopStore(store));
            try { result = { ok: true, ...await execute(owner, params) }; }
            catch (error) {
                if (error.businessCode) throw error;
                throw common.failure('COOP_SERVICE_ERROR', error.message || '合作请求失败');
            }
        } else {
            if (params.action === 'cancelMatch') {
                // A failed/lost entry acknowledgement must not turn an uncharged offer into a ranked loss.
                const cancelled = await store.runTransaction(async tx => {
                    const match = (await tx.collection('pvp_matches').doc(String(params.matchId || '')).get()).data;
                    if (!match || match.playerAOpenid !== owner) throw common.failure('MATCH_NOT_OWNED', '对局不存在或不属于当前玩家');
                    if (match.entryCost?.chargedAt > 0 || match.status === 'SETTLED') return false;
                    if (!['PLAYING', 'CANCELLED'].includes(match.status)) throw common.failure('MATCH_EXPIRED', '对局已结束');
                    await tx.collection('pvp_matches').doc(match._id).update({ data: { status: 'CANCELLED', updatedAt: Date.now() } });
                    return true;
                });
                if (cancelled) params = { ...params, action: 'getMatch' };
            }
            // New factory per request: never store a player's identity in a process-global SDK mock.
            const service = require('./multiplayerRuntime').createPvpService({ init() {}, database: () => store,
                getWXContext: () => ({ OPENID: owner }) });
            result = await service.main(params);
        }
        return common.reply({ ...result, ownerKey: owner, multiplayerRevision: REVISION });
    } catch (error) { return common.safeError(error); }
}
const indexes = [
    ['coop_users', { activeCreated: 1 }, 'coop_users_created'],
    ['coop_posts', { published: 1, creatorDone: 1, _id: 1 }, 'coop_square'],
    ['coop_runs', { postId: 1, role: 1, _id: 1 }, 'coop_participants'],
    ['coop_runs', { owner: 1, _id: 1 }, 'coop_history'],
    ['pvp_profiles', { rankStars: -1, rating: -1 }, 'pvp_rank'],
    ['pvp_matches', { playerAOpenid: 1, status: 1, updatedAt: -1 }, 'pvp_player_a'],
    ['pvp_matches', { playerBOpenid: 1, status: 1, updatedAt: -1 }, 'pvp_player_b'],
    ['pvp_matches', { status: 1, expiresAt: 1 }, 'pvp_expiry'],
    ['pvp_replays', { levelId: 1, rulesVersion: 1, verified: 1, eligibleForMatchmaking: 1, createdAt: -1 }, 'pvp_replay_pool'],
    ['pvp_replays', { eligibleForMatchmaking: 1, validUntil: 1 }, 'pvp_replay_expiry'],
    ['pvp_settlements', { openid: 1, settledAt: -1 }, 'pvp_settlement_owner'],
    ['pvp_checkpoints', { ownerOpenid: 1, updatedAt: -1 }, 'pvp_checkpoint_owner'],
    ['pvp_ticket_claims', { ownerOpenid: 1, createdAt: -1 }, 'pvp_ticket_owner'],
    ['pvp_rank_reward_claims', { ownerOpenid: 1, seasonId: 1 }, 'pvp_reward_owner'],
];
async function setup(params, context) {
    if (!common.adminAllowed(context)) return common.adminFailure(context);
    let connection, probe;
    try {
        requireDev(); connection = await common.database(); await common.ready(connection.db);
        for (const [name, fields, index] of indexes) await connection.db.collection(names[name]).createIndex(fields, { name: index });
        probe = 'probe-' + require('crypto').randomBytes(16).toString('hex');
        try {
            await common.transaction(connection.client, async session => {
                for (const name of ['pvp_profiles', 'coop_users']) common.ack(await connection.db.collection(names[name]).insertOne({ _id: probe, probe: true }, { session }));
                throw common.failure('EXPECTED_ROLLBACK');
            });
        } catch (error) { if (error.businessCode !== 'EXPECTED_ROLLBACK') throw error; }
        for (const name of ['pvp_profiles', 'coop_users']) if (await connection.db.collection(names[name]).findOne({ _id: probe })) throw common.failure('TRANSACTION_ROLLBACK_FAILED');
        await common.transaction(connection.client, async session => {
            for (const name of ['pvp_profiles', 'coop_users']) common.ack(await connection.db.collection(names[name]).insertOne({ _id: probe, probe: true }, { session }));
        });
        for (const name of ['pvp_profiles', 'coop_users']) if (!await connection.db.collection(names[name]).findOne({ _id: probe })) throw common.failure('TRANSACTION_COMMIT_FAILED');
        common.ack(await connection.db.collection(common.COLLECTIONS.meta).updateOne({ _id: REVISION }, { $set: { version: REVISION, transactionsVerified: true, verifiedAt: Date.now() } }, { upsert: true }));
        return common.reply({ ok: true, reason: 'MULTIPLAYER_READY', multiplayerRevision: REVISION, transactionsVerified: true,
            collections: [...new Set(indexes.map(([name]) => names[name]))], replaySource: 'douyin-only' });
    } catch (error) { return common.safeError(error); }
    finally {
        if (connection && probe) for (const name of ['pvp_profiles', 'coop_users']) await connection.db.collection(names[name]).deleteOne({ _id: probe }).catch(() => console.error('[DouyinMultiplayer] PROBE_CLEANUP_FAILED'));
    }
}
async function maintenance(params, context) {
    if (!common.adminAllowed(context)) return common.adminFailure(context);
    try {
        requireDev(); const connection = await common.database(); await ready(connection.db);
        const now = Date.now(), matches = connection.db.collection(names.pvp_matches), replays = connection.db.collection(names.pvp_replays);
        const expired = await matches.find({ status: { $in: ['PLAYING', 'WAITING_RESULT'] }, expiresAt: { $lte: now } }).limit(100).toArray();
        let expiredMatches = 0, retiredReplays = 0;
        for (const match of expired) {
            const result = await matches.updateOne({ _id: match._id, status: match.status, expiresAt: { $lte: now } },
                { $set: { status: 'EXPIRED', updatedAt: now, expireReason: 'deadline' } });
            common.ack(result); expiredMatches += result.matchedCount;
        }
        const retired = await replays.find({ eligibleForMatchmaking: true, validUntil: { $lte: now } }).limit(100).toArray();
        for (const replay of retired) {
            const result = await replays.updateOne({ _id: replay._id, eligibleForMatchmaking: true, validUntil: { $lte: now } },
                { $set: { eligibleForMatchmaking: false, retiredAt: now, retireReason: 'expired' } });
            common.ack(result); retiredReplays += result.matchedCount;
        }
        return common.reply({ ok: true, maintenance: { expiredMatches, retiredReplays, hasMore: expired.length === 100 || retired.length === 100 }, multiplayerRevision: REVISION });
    } catch (error) { return common.safeError(error); }
}
module.exports = { receive, setup, maintenance, REVISION };
