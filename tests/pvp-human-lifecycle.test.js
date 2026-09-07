'use strict';
const assert = require('assert');
const { callAs, callExpectingServiceError, recordsFor, seedInventory } = require('./pvp-friend-lifecycle.test');
const { controllerReplay } = require('./pvp-human-replay-fixture');
const { replayHumanEvents } = require('../cloudfunctions/pvpService/bot-runtime/PvpHumanReplay');
const { loadLevel, rankedPool } = require('../cloudfunctions/pvpService/matchmaking');
const { digest } = require('../cloudfunctions/pvpService/core');
const originalNow = Date.now;
let now = Date.UTC(2026, 8, 7, 3);
Date.now = () => now;
const rules = { levelId: 3, levelPrefix: 'zt_level_', rulesVersion: 'pvp-pixel-v2', allowReplayOpponent: true, economyRevision: 0 };
async function request(user, action, data = {}) {
  const response = await callAs(user, action, data);
  assert.strictEqual(response.ok, true, `${action}: ${response.errorMessage}`);
  return response;
}
async function player(user) {
  seedInventory(user);
  await request(user, 'getProfile');
  Object.assign(recordsFor('pvp_profiles').get(user), { rating: 1200, gamesPlayed: 30, rankStars: 20 });
}
async function run() {
  const level = loadLevel(3);
  const fixture = controllerReplay(level);
  assert.strictEqual(fixture.terminalType, 'PASS');
  const simulation = replayHumanEvents(level, fixture.envelope);
  const timeline = simulation.finish(fixture.terminalType, fixture.terminalTimeMs);
  const actionJson = JSON.stringify(simulation.actions);
  await player('history-owner');
  const first = (await request('history-owner', 'matchmake', rules)).match;
  const firstStored = recordsFor('pvp_matches').get(first.matchId);
  assert.strictEqual(firstStored.matchType, 'bot');
  assert.strictEqual(firstStored.expiresAt - firstStored.createdAt, 600000);
  const prefix = fixture.envelope.events.slice(0, 300);
  now += prefix[prefix.length - 1][0] + 10;
  const checkpoint = { matchId: first.matchId, logicalTimeMs: prefix[prefix.length - 1][0], progress: 0.99,
    replay: { ...fixture.envelope, events: prefix }, boardTimeline: [], lastSeq: 0 };
  await request('history-owner', 'saveCheckpoint', checkpoint);
  const recovery = (await request('history-owner', 'getActiveMatch')).match;
  assert.deepStrictEqual(recovery.selfCheckpoint.replay.events, prefix, 'recovery must return verified original event history');
  assert.notStrictEqual(recovery.selfCheckpoint.progress, 0.99, 'checkpoint progress must be recomputed');
  const rewritten = JSON.parse(JSON.stringify(checkpoint)); rewritten.replay.events[0][0] = 1;
  const rewrite = await callExpectingServiceError('history-owner', 'saveCheckpoint', rewritten);
  assert.strictEqual(rewrite.ok, false);
  now = firstStored.createdAt + fixture.terminalTimeMs + 500;
  const payload = { matchId: first.matchId, terminalType: fixture.terminalType, terminalTimeMs: fixture.terminalTimeMs,
    progress: 1, actionCount: simulation.actions.length, actionDigest: digest(actionJson),
    actionChunks: [{ seqStart: 1, seqEnd: simulation.actions.length, payload: actionJson, encoding: 'json-v1' }],
    progressTimeline: timeline.progressTimeline, boardTimeline: timeline.boardTimeline,
    replay: fixture.envelope, allowReplayOpponent: true, trainingConsent: false };
  const premature = await callExpectingServiceError('history-owner', 'submitResult', { ...payload, terminalTimeMs: 1 });
  assert.strictEqual(premature.ok, false);
  assert.strictEqual(recordsFor('pvp_matches').get(first.matchId).status, 'PLAYING');
  const beforeRating = recordsFor('pvp_profiles').get('history-owner').rating;
  const replayRows = recordsFor('pvp_replays');
  replayRows.set = () => { throw new Error('injected replay storage failure'); };
  const failedWrite = await callExpectingServiceError('history-owner', 'submitResult', payload);
  assert.strictEqual(failedWrite.ok, false);
  assert.strictEqual(recordsFor('pvp_matches').get(first.matchId).status, 'PLAYING', 'replay failure must roll back settlement');
  assert.strictEqual(recordsFor('pvp_profiles').get('history-owner').rating, beforeRating);
  const accepted = await request('history-owner', 'submitResult', payload);
  assert.strictEqual(accepted.match.settlement.outcome, 'win');
  const replayId = `${first.matchId}_history-owner`;
  const saved = recordsFor('pvp_replays').get(replayId);
  assert.strictEqual(saved.verificationLevel, 'replay-verified-v1');
  assert.strictEqual(saved.eligibleForMatchmaking, true);
  assert.strictEqual(saved.rating, 1200, 'replay must freeze pre-match rating');
  assert.strictEqual(saved.trainingConsent, false, 'replay consent must not imply model-training consent');
  assert.deepStrictEqual(saved.boardTimeline, timeline.boardTimeline);
  const snapshot = JSON.stringify(saved);
  const ownerRating = recordsFor('pvp_profiles').get('history-owner').rating;
  await request('history-owner', 'submitResult', payload);
  assert.strictEqual(JSON.stringify(recordsFor('pvp_replays').get(replayId)), snapshot, 'retry cannot rewrite replay or reset use count');
  assert.strictEqual(recordsFor('pvp_profiles').get('history-owner').rating, ownerRating);
  assert.strictEqual((await callExpectingServiceError('stranger', 'submitResult', payload)).ok, false);
  assert.strictEqual((await callExpectingServiceError('history-owner', 'submitResult', { ...payload, terminalTimeMs: payload.terminalTimeMs + 1 })).ok, false);

  await player('challenger-real');
  const challenge = (await request('challenger-real', 'matchmake', rules)).match;
  const stored = recordsFor('pvp_matches').get(challenge.matchId);
  assert.strictEqual(stored.matchType, 'human_replay', 'verified real history takes priority over bots');
  assert.strictEqual(stored.opponentRun.replayId, replayId);
  assert.deepStrictEqual(challenge.opponentRun.boardTimeline, saved.boardTimeline);
  assert.strictEqual(recordsFor('pvp_replays').get(replayId).useCount, 1);
  const concede = { matchId: challenge.matchId, terminalType: 'FORFEIT', terminalTimeMs: 1000, progress: 0,
    actionCount: 0, actionChunks: [], boardTimeline: [], progressTimeline: [],
    replay: { ...fixture.envelope, events: [[0, 0, 1]] }, allowReplayOpponent: true };
  now += 1100;
  assert.strictEqual((await request('challenger-real', 'submitResult', concede)).match.settlement.outcome, 'lose');
  assert.strictEqual(recordsFor('pvp_profiles').get('history-owner').rating, ownerRating, 'being challenged must not change historical owner rank');
  assert.strictEqual(recordsFor('pvp_replays').get(`${challenge.matchId}_challenger-real`), undefined, 'partial/abandoned run never becomes an opponent');
  const next = (await request('challenger-real', 'matchmake', { ...rules, economyRevision: 1 })).match;
  assert.strictEqual(recordsFor('pvp_matches').get(next.matchId).matchType, 'bot', 'recent same owner/replay must not repeat');
  const offered = await request('history-owner', 'getRankedLevel', { replayProtocol: 'pch-events-v1' });
  assert(rankedPool(now).levels.some(item => item.levelId === offered.level.levelId));
  assert.strictEqual(recordsFor('pvp_profiles').get('history-owner').tickets, 2, 'getting a level offer must not charge');
  await player('private-owner');
  const privateMatch = (await request('private-owner', 'matchmake', { ...rules, allowReplayOpponent: false })).match;
  now += fixture.terminalTimeMs + 500;
  await request('private-owner', 'submitResult', { ...payload, matchId: privateMatch.matchId, allowReplayOpponent: false });
  assert.strictEqual(recordsFor('pvp_replays').get(`${privateMatch.matchId}_private-owner`).eligibleForMatchmaking, false);
  assert.strictEqual((await callExpectingServiceError('private-owner', 'getMatchmakingStats')).ok, false, 'operations stats require maintenance authorization');
  console.log('PVP_HUMAN_LIFECYCLE_TESTS_PASSED');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Date.now = originalNow; });
