'use strict';
const assert = require('node:assert/strict'), Module = require('module');
const mongo = require('./helpers/douyin-multiplayer-mongo').createMongo();
process.env.CLOUD_ENV = 'DEV'; process.env.BUSINESS_ENVIRONMENT = 'douyin_dev';
process.env.MONGODB_URI = 'test-only'; process.env.MONGODB_DB = 'test-only';
const load = Module._load;
Module._load = function(id, ...args) { if (id === 'mongodb') return { MongoClient: mongo.MongoClient }; return load.call(this, id, ...args); };
const common = require('../cloudfunctions-douyin/businessCommon');
const setup = require('../cloudfunctions-douyin/multiplayerSetup');
const coop = require('../cloudfunctions-douyin/coopService'), pvp = require('../cloudfunctions-douyin/pvpService');
const maintenance = require('../cloudfunctions-douyin/multiplayerMaintenance');
process.env.PDD_REPLAY_TEST_PLATFORM = 'douyin';
const { controllerReplay } = require('./pvp-human-replay-fixture');
const { coopHalfLevel, COOP_RULES_VERSION } = require('../cloudfunctions-douyin/multiplayer/coop/runtime/CoopModeConfig');
const { pixelLevelHash } = require('../cloudfunctions-douyin/multiplayer/pvp/bot-runtime/PvpBotReplay');
const { replayHumanEvents } = require('../cloudfunctions-douyin/multiplayer/pvp/bot-runtime/PvpHumanReplay');
const { digest } = require('../cloudfunctions-douyin/multiplayer/pvp/core');
const context = user => ({ trigger: 'online', headers: { 'x-tt-source': 'APP', 'x-tt-appid': 'ttf45082ed6a36c15802', 'x-tt-envid': 'env-nvk6FNcrq5', 'x-tt-openid': user } });
const owner = user => common.identity(context(user));
const request = (service, user, action, extra = {}) => service({ action, expectedOwner: owner(user), ...extra }, context(user));
const ok = value => { assert.equal(value.ok, true, JSON.stringify(value)); return value; };
const originalNow = Date.now; let now = Date.UTC(2026, 9, 12, 1); Date.now = () => now;
async function initialize(user) {
    ok(await common.receive('syncUserState', { action: 'save', expectedOwner: owner(user), gameState: {
        savedLevel: 4, vigor: 10, vigorTime: 0, gold: 1000, expandSlotCount: 0, magicWandCount: 0,
        freezeCount: 0, brushCount: 0, magnetCount: 0, stateUpdatedAt: now, pvpEconomyRevision: 0,
    } }, context(user)));
}
async function main() {
    assert.equal((await setup({}, context('A'))).ok, false, 'players cannot initialize');
    ok(await require('../cloudfunctions-douyin/businessSetup')({}, { trigger: 'test' }));
    assert.equal((await request(coop, 'A', 'overview')).errorCode, 'MULTIPLAYER_SETUP_REQUIRED');
    ok(await setup({}, { trigger: 'test' })); ok(await setup({}, { trigger: 'test' }));
    const transport = require('./douyin-business-cloud.test').client({ call(name, params) {
        if (name === 'coopService') return coop(params, context('A'));
        if (name === 'pvpService') return pvp(params, context('A'));
        return common.receive(name, params, context('A'));
    } });
    assert.equal(await transport.manager.init(), true);
    ok(await transport.manager.callFunction('coopService', { action: 'overview', rulesVersion: COOP_RULES_VERSION }));
    ok(await transport.manager.callFunction('pvpService', { action: 'getProfile' }));
    assert.equal(transport.calls.at(-1).init.body.expectedOwner, owner('A'), 'native cloud transport binds trusted owner');
    assert.equal((await coop({ action: 'overview', expectedOwner: owner('B') }, context('A'))).errorCode, 'OWNER_MISMATCH');
    assert.equal((await pvp({ action: 'getProfile' }, { ...context('A'), trigger: 'test' })).errorCode, 'IDENTITY_REQUIRED');
    assert.equal((await request(pvp, 'A', 'seedDevelopmentData')).ok, false);
    assert.equal((await request(pvp, 'A', 'maintenance')).ok, false);
    assert.equal((await maintenance({}, context('A'))).ok, false);
    assert.equal((await request(coop, 'A', 'overview', JSON.parse('{"__proto__":{}}'))).ok, false);
    const c = (user, action, extra) => request(coop, user, action, { rulesVersion: COOP_RULES_VERSION, ...extra });
    const created = ok(await c('A', 'create', { levelId: 1 }));
    const postId = created.post.id;
    assert.equal(ok(await c('A', 'create', { levelId: 1 })).post.id, postId);
    assert.equal((await c('B', 'join', { postId })).ok, false);
    const full = ok(await c('A', 'level', { levelId: 1 })).level;
    for (const [user, role] of [['A', 'creator'], ['B', 'collaborator'], ['C', 'collaborator']]) {
        if (user !== 'A') ok(await c(user, 'join', { postId }));
        const fixture = controllerReplay({ ...coopHalfLevel(full, role), timeLimit: 600 });
        assert.equal(fixture.terminalType, 'PASS'); now += 600000;
        const detail = ok(await c(user, 'detail', { postId }));
        const payload = { postId, version: detail.run.version, requestId: 'abcdef1234567890-' + user.charCodeAt(0), events: fixture.envelope.events };
        const result = ok(await c(user, 'complete', payload));
        assert.equal(result.run.status, 'complete');
        assert.equal(ok(await c(user, 'complete', payload)).run.version, result.run.version);
        if (user === 'A') ok(await c(user, 'publish', { postId, published: true }));
        if (user === 'B') assert.equal(Object.keys(ok(await c('C', 'overview')).overview.unlocked).length, 0);
    }
    for (const user of ['A', 'B', 'C']) assert.equal(Object.keys(ok(await c(user, 'overview')).overview.unlocked).length, 1);
    assert.equal(ok(await c('A', 'detail', { postId })).post.completedCount, 2);
    assert(mongo.rows('douyin_coop_runs').every(row => !row.events && !row.checkpoint), 'coop retains completion only');
    await Promise.all(['A', 'B', 'C'].map(initialize));
    const level = require('../cloudfunctions-douyin/multiplayer/pvp/bot-runtime/levels/zt_level_3.json');
    const fixture = controllerReplay(level); assert.equal(fixture.terminalType, 'PASS');
    const args = { levelId: 3, levelPrefix: 'zt_level_', rulesVersion: 'pvp-pixel-v2', replayProtocol: 'pch-events-v1', levelHash: pixelLevelHash(level), allowReplayOpponent: true, economyRevision: 0 };
    const first = ok(await request(pvp, 'A', 'matchmake', args)).match;
    assert.equal(first.opponent.opponentType, 'bot');
    const entries = await Promise.all([1, 2].map(() => request(pvp, 'A', 'confirmMatchEntry', { matchId: first.matchId, economyRevision: 0 })));
    entries.forEach(ok);
    assert.equal(mongo.rows('douyin_user_profile').find(row => row._id === owner('A')).vigor, 9);
    assert.equal(mongo.rows('douyin_pvp_profiles').find(row => row._id === owner('A')).tickets, 2);
    const prefix = fixture.envelope.events.slice(0, 300); now += prefix.at(-1)[0] + 10;
    ok(await request(pvp, 'A', 'saveCheckpoint', { matchId: first.matchId, logicalTimeMs: prefix.at(-1)[0], replay: { ...fixture.envelope, events: prefix } }));
    assert.deepEqual(ok(await request(pvp, 'A', 'getActiveMatch')).match.selfCheckpoint.replay.events, prefix);
    assert.equal((await request(pvp, 'B', 'getMatch', { matchId: first.matchId })).ok, false);
    const replay = replayHumanEvents(level, fixture.envelope), timeline = replay.finish(fixture.terminalType, fixture.terminalTimeMs);
    const payload = JSON.stringify(replay.actions);
    const submission = { matchId: first.matchId, terminalType: fixture.terminalType, terminalTimeMs: fixture.terminalTimeMs,
        progress: 1, actionCount: replay.actions.length, actionDigest: digest(payload),
        actionChunks: [{ seqStart: 1, seqEnd: replay.actions.length, payload, encoding: 'json-v1' }],
        progressTimeline: timeline.progressTimeline, boardTimeline: timeline.boardTimeline, replay: fixture.envelope, allowReplayOpponent: true };
    now += fixture.terminalTimeMs + 500;
    const before = mongo.snapshot(); mongo.failNext('douyin_pvp_replays');
    assert.equal((await request(pvp, 'A', 'submitResult', submission)).ok, false);
    assert.equal(mongo.rows('douyin_pvp_matches').find(row => row._id === first.matchId).status, 'PLAYING');
    assert.deepEqual(mongo.rows('douyin_pvp_profiles'), Object.values(before.douyin_pvp_profiles), 'failed replay write rolls back rank');
    ok(await request(pvp, 'A', 'submitResult', submission)); ok(await request(pvp, 'A', 'submitResult', submission));
    assert.equal(mongo.rows('douyin_pvp_replays').length, 1);
    const next = ok(await request(pvp, 'B', 'matchmake', args)).match;
    assert.equal(next.opponent.opponentType, 'human_replay');
    const ownerRank = mongo.rows('douyin_pvp_profiles').find(row => row._id === owner('A')).rankStars;
    ok(await request(pvp, 'B', 'confirmMatchEntry', { matchId: next.matchId, economyRevision: 0 })); now += 1000;
    ok(await request(pvp, 'B', 'cancelMatch', { matchId: next.matchId, logicalTimeMs: 1000, progress: 0 }));
    assert.equal(mongo.rows('douyin_pvp_profiles').find(row => row._id === owner('A')).rankStars, ownerRank);
    assert(mongo.rows('douyin_pvp_replays').every(row => row.ownerOpenid === owner('A')), 'only Douyin account replay exists');
    mongo.failNext('douyin_pvp_replays', 'read');
    const failed = await request(pvp, 'C', 'matchmake', args); assert.equal(failed.ok, false); assert(!JSON.stringify(failed).includes('secret'));
    assert.equal(mongo.rows('douyin_pvp_matches').length, 2, 'database failure cannot turn into bot match');
    const uncharged = ok(await request(pvp, 'C', 'matchmake', args)).match;
    const rankBeforeCancel = mongo.rows('douyin_pvp_profiles').find(row => row._id === owner('C')).gamesPlayed;
    assert.equal(ok(await request(pvp, 'C', 'cancelMatch', { matchId: uncharged.matchId })).match.status, 'CANCELLED');
    assert.equal(ok(await request(pvp, 'C', 'cancelMatch', { matchId: uncharged.matchId })).match.status, 'CANCELLED');
    assert.equal(mongo.rows('douyin_pvp_profiles').find(row => row._id === owner('C')).gamesPlayed, rankBeforeCancel);
    assert.equal(mongo.rows('douyin_user_profile').find(row => row._id === owner('C')).vigor, 10);
    ok(await common.receive('syncUserState', { action: 'save', expectedOwner: owner('A'), gameState: { vigor: 10, gold: 9999, pvpEconomyRevision: 0, stateUpdatedAt: now } }, context('A')));
    assert.equal(mongo.rows('douyin_user_profile').find(row => row._id === owner('A')).vigor, 9, 'stale device cannot undo entry cost');
    const reward = ok(await request(pvp, 'A', 'beginTicketReward', { source: 'ad', requestId: 'ticket_request_01' })).reward;
    const tickets = await Promise.all([1, 2].map(() => request(pvp, 'A', 'claimTicketReward', { claimId: reward.claimId }))); tickets.forEach(ok);
    assert.equal(tickets[1].economy.tickets, 3);
    assert.equal((await request(pvp, 'B', 'claimTicketReward', { claimId: reward.claimId })).ok, false);
    const rankClaim = { tier: 'bronze', seasonId: 'S01', economyRevision: 1 };
    assert.equal((await request(pvp, 'A', 'claimRankReward', rankClaim)).ok, false, 'rank prizes stay closed until explicitly enabled');
    process.env.PVP_RANK_REWARDS_ENABLED = 'true';
    const beforePrize = mongo.rows('douyin_user_profile').find(row => row._id === owner('A'));
    const prizes = await Promise.all([1, 2].map(() => request(pvp, 'A', 'claimRankReward', rankClaim))); prizes.forEach(ok);
    const afterPrize = mongo.rows('douyin_user_profile').find(row => row._id === owner('A'));
    assert.equal(afterPrize.gold, beforePrize.gold + 188); assert.equal(afterPrize.magnetCount, beforePrize.magnetCount + 1);
    assert.equal(afterPrize.pvpEconomyRevision, 2); assert.equal(mongo.rows('douyin_pvp_rank_reward_claims').length, 1);
    delete process.env.PVP_RANK_REWARDS_ENABLED;
    const toExpire = ok(await request(pvp, 'C', 'matchmake', args)).match;
    now += 31 * 86400000;
    const cleanup = ok(await maintenance({}, { trigger: 'test' }));
    assert.equal(cleanup.maintenance.expiredMatches, 1); assert.equal(cleanup.maintenance.retiredReplays, 1);
    assert.equal(mongo.rows('douyin_pvp_matches').find(row => row._id === first.matchId).status, 'SETTLED');
    assert.equal(mongo.rows('douyin_pvp_matches').find(row => row._id === toExpire.matchId).status, 'EXPIRED');
    const devOwner = owner('A'); process.env.CLOUD_ENV = 'PROD';
    assert.equal((await pvp({ action: 'getProfile', expectedOwner: devOwner }, context('A'))).errorCode, 'ENVIRONMENT_DISABLED');
    console.log('PASS Douyin multiplayer: trusted identity, manual setup, 3-player coop, PVP bot -> Douyin replay, atomic entry/settlement/rewards, resume, stale save, failures and admin boundaries (Mongo mocked)');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Date.now = originalNow; Module._load = load; });
