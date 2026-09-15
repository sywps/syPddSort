'use strict';

// Server-authoritative records only. Never return identifiers or display names.
const assert = require('assert');
const ratio = (n, d) => d > 0 ? n / d : null;
const countUsers = (rows, field) => new Set(rows.map(r => r[field]).filter(Boolean)).size;
const before = (time, end) => Number.isFinite(time) && time > 0 && time < end;
const within = (time, start, end) => before(time, end) && time >= start;
const complete = (run, end) => run.status === 'complete' && before(run.completedAt, end);

function uniqueRows(rows, fields) {
    assert.ok(Array.isArray(rows), '集合响应不是数组');
    const seen = new Set();
    for (const r of rows) {
        assert.ok(r._id && !seen.has(r._id), '记录ID缺失或重复');
        seen.add(r._id);
        for (const field of fields) assert.ok(r[field] !== undefined && r[field] !== null && r[field] !== '', `记录缺少${field}`);
        for (const field of fields.filter(f => f.endsWith('At'))) assert.ok(Number.isFinite(r[field]) && r[field] > 0, `记录${field}不是有效时间`);
    }
    return rows;
}

function summarizeCoop({ posts, runs }, start, end) {
    uniqueRows(posts, ['id', 'creator', 'levelId', 'createdAt']);
    uniqueRows(runs, ['postId', 'owner', 'role', 'status', 'createdAt']);
    const postMap = new Map(posts.map(p => [p.id, p]));
    assert.equal(postMap.size, posts.length, '合作图ID重复');
    for (const run of runs) {
        assert.ok(postMap.has(run.postId), '合作记录缺少关联图');
        assert.ok(['creator', 'collaborator'].includes(run.role), '未知合作角色');
        assert.ok(['playing', 'complete'].includes(run.status), '未知合作状态');
        if (run.status === 'complete') assert.ok(Number.isFinite(run.completedAt) && run.completedAt >= run.createdAt, '合作完成时间无效');
    }
    const visibleRuns = runs.filter(r => before(r.createdAt, end));
    const byPost = new Map();
    for (const r of visibleRuns) {
        if (!byPost.has(r.postId)) byPost.set(r.postId, []);
        byPost.get(r.postId).push(r);
    }
    const selectedPosts = posts.filter(p => within(p.createdAt, start, end));
    const newRuns = visibleRuns.filter(r => r.createdAt >= start);
    const completedRuns = visibleRuns.filter(r => complete(r, end) && r.completedAt >= start);
    function postStats(ps) {
        const related = p => byPost.get(p.id) || [];
        const ready = p => related(p).some(r => r.role === 'creator' && complete(r, end));
        const joined = p => related(p).some(r => r.role === 'collaborator');
        const paired = p => ready(p) && related(p).some(r => r.role === 'collaborator' && complete(r, end));
        const readyPosts = ps.filter(ready).length, joinedPosts = ps.filter(joined).length, pairedPosts = ps.filter(paired).length;
        return { posts: ps.length, creatorCompletedPosts: readyPosts, joinedPosts, pairedPosts,
            creatorCompletionRate: ratio(readyPosts, ps.length), joinRate: ratio(joinedPosts, readyPosts), pairRate: ratio(pairedPosts, ps.length) };
    }
    function runStats(rs) {
        const completed = rs.filter(r => complete(r, end));
        return { runs: rs.length, users: countUsers(rs, 'owner'), completedRuns: completed.length,
            completedUsers: countUsers(completed, 'owner'), completionRate: ratio(completed.length, rs.length) };
    }
    const levelIds = [...new Set([...selectedPosts.map(p => p.levelId), ...newRuns.map(r => postMap.get(r.postId).levelId)])].sort((a, b) => a - b);
    return {
        status: 'available', ...postStats(selectedPosts), creatorUV: countUsers(selectedPosts, 'creator'),
        newRunUV: countUsers(newRuns, 'owner'), newRuns: newRuns.length,
        completionsInPeriod: completedRuns.length, completedUVInPeriod: countUsers(completedRuns, 'owner'),
        roles: ['creator', 'collaborator'].map(role => ({ role, ...runStats(newRuns.filter(r => r.role === role)) })),
        levels: levelIds.map(levelId => ({ levelId, ...postStats(selectedPosts.filter(p => p.levelId === levelId)),
            ...runStats(newRuns.filter(r => postMap.get(r.postId).levelId === levelId)) })),
        limitations: ['完成率为本期新建个人记录截至观察终点的完成比例，不是游戏尝试通关率。',
            '整图达成＝发起者完成且至少一名协作者完成；多人独立参与，不要求同时在线。',
            '分享曝光→点击→加入、途中失败/退出、广告IPU及D1留存：数据不可得；需专用事件与对局关联。',
            '未使用当前published、creatorDone等可变字段回推历史发布状态。'],
    };
}

function summarizePvp({ matches, settlements }, start, end) {
    uniqueRows(matches, ['createdAt', 'playerAOpenid', 'matchType', 'levelId']);
    uniqueRows(settlements, ['matchId', 'openid', 'outcome', 'settledAt']);
    const matchMap = new Map(matches.map(m => [m._id, m]));
    const naturalKeys = new Set();
    for (const s of settlements) {
        const m = matchMap.get(s.matchId);
        assert.ok(m, 'PvP结算缺少关联对局');
        assert.ok([m.playerAOpenid, m.playerBOpenid].includes(s.openid), 'PvP结算用户不属于对局');
        assert.ok(['win', 'lose', 'draw'].includes(s.outcome), '未知PvP结算结果');
        assert.ok(s.settledAt >= m.createdAt, 'PvP结算早于创建');
        const key = `${s.matchId}:${s.openid}`;
        assert.ok(!naturalKeys.has(key), 'PvP人次结算重复'); naturalKeys.add(key);
    }
    for (const m of matches) assert.ok(['bot', 'human_replay', 'friend'].includes(m.matchType), '未知PvP对局类型');
    const current = matches.filter(m => within(m.createdAt, start, end));
    const settledByEnd = settlements.filter(s => before(s.settledAt, end));
    const dailySettlements = settledByEnd.filter(s => s.settledAt >= start);
    const settledIds = new Set(settledByEnd.map(s => s.matchId));
    const humanKeys = new Set(settledByEnd.map(s => `${s.matchId}:${s.openid}`));
    const fullySettled = m => [m.playerAOpenid, m.playerBOpenid].filter(Boolean).every(id => humanKeys.has(`${m._id}:${id}`));
    function matchStats(ms) {
        const ids = new Set(ms.map(m => m._id)), outcomes = settledByEnd.filter(s => ids.has(s.matchId));
        const settledMatches = ms.filter(fullySettled).length;
        const wins = outcomes.filter(s => s.outcome === 'win').length;
        const losses = outcomes.filter(s => s.outcome === 'lose').length;
        return { matches: ms.length, initiatorUV: countUsers(ms, 'playerAOpenid'), settledMatches,
            settlementRate: ratio(settledMatches, ms.length), humanSettlements: outcomes.length,
            wins, losses, draws: outcomes.length - wins - losses, humanWinRate: ratio(wins, outcomes.length),
            partialSettlementMatches: ms.filter(m => settledIds.has(m._id) && !fullySettled(m)).length,
            expiredUnsettled: ms.filter(m => before(m.expiresAt, end) && !fullySettled(m)).length };
    }
    return { status: 'available', ...matchStats(current),
        settlementsInPeriod: dailySettlements.length, settlementUVInPeriod: countUsers(dailySettlements, 'openid'),
        types: ['human_replay', 'bot', 'friend'].map(type => ({ type, ...matchStats(current.filter(m => m.matchType === type)) })),
        levels: [...new Set(current.map(m => m.levelId))].sort((a, b) => a - b).map(levelId => ({ levelId, ...matchStats(current.filter(m => m.levelId === levelId)) })),
        limitations: ['创建对局按createdAt归日；结算流量按settledAt归日，可能包含前日创建的对局。',
            '胜率按真实用户结算人次（含平局）计算；好友对局可能有两个人次，机器人/历史回放对手不计活跃用户。',
            '真人回放不是实时在线匹配；过期未结算根据expiresAt推算，不等于主动退出。',
            '已结算对局要求全部实际参与者都有结算；不完整的人次结算单列为数据质量信号。',
            '匹配请求成功率/耗时、好友接受率、局内广告IPU、流失与留存：数据不可得，不能从创建或结算表补全。'],
    };
}

module.exports = { summarizeCoop, summarizePvp };
