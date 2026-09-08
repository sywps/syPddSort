'use strict';

const assert = require('assert');
const Module = require('module');
const core = require('../cloudfunctions/pvpService/core');

let currentOpenId = '';
let nextDocumentId = 1;
const collections = new Map();
let transactionTail = Promise.resolve();

function recordsFor(name) {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function matchesCondition(actual, expected) {
  if (!expected || typeof expected !== 'object' || !expected.__command) return actual === expected;
  if (expected.__command === 'in') return expected.values.includes(actual);
  if (expected.__command === 'lt') return actual < expected.value;
  if (expected.__command === 'lte') return actual <= expected.value;
  throw new Error(`unsupported command ${expected.__command}`);
}

function applyPatch(target, patch) {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && value.__command === 'inc') {
      result[key] = Number(result[key] || 0) + value.value;
    } else {
      result[key] = clone(value);
    }
  }
  return result;
}

function documentApi(collectionName, id) {
  return {
    async get() {
      const value = recordsFor(collectionName).get(id);
      if (!value) throw new Error('document does not exist');
      return { data: clone(value) };
    },
    async set({ data }) {
      recordsFor(collectionName).set(id, { ...clone(data), _id: id });
      return {};
    },
    async update({ data }) {
      const current = recordsFor(collectionName).get(id);
      if (!current) throw new Error('document does not exist');
      recordsFor(collectionName).set(id, applyPatch(current, data));
      return {};
    },
  };
}

function queryApi(collectionName, filters = {}, order = [], limitCount = Infinity) {
  return {
    where(nextFilters) {
      return queryApi(collectionName, { ...filters, ...nextFilters }, order, limitCount);
    },
    orderBy(field, direction) {
      return queryApi(collectionName, filters, [...order, { field, direction }], limitCount);
    },
    limit(value) {
      return queryApi(collectionName, filters, order, value);
    },
    async get() {
      const rows = [...recordsFor(collectionName).values()].filter((row) => (
        Object.entries(filters).every(([key, expected]) => matchesCondition(row[key], expected))
      ));
      rows.sort((left, right) => {
        for (const item of order) {
          const delta = Number(left[item.field] || 0) - Number(right[item.field] || 0);
          if (delta !== 0) return item.direction === 'desc' ? -delta : delta;
        }
        return 0;
      });
      return { data: clone(rows.slice(0, limitCount)) };
    },
  };
}

function collectionApi(name) {
  return {
    doc(id) {
      return documentApi(name, id);
    },
    async add({ data }) {
      const id = `match-${nextDocumentId++}`;
      recordsFor(name).set(id, { ...clone(data), _id: id });
      return { _id: id };
    },
    where(filters) {
      return queryApi(name, filters);
    },
    orderBy(field, direction) {
      return queryApi(name).orderBy(field, direction);
    },
  };
}

const database = {
  command: {
    in: (values) => ({ __command: 'in', values }),
    lt: (value) => ({ __command: 'lt', value }),
    lte: (value) => ({ __command: 'lte', value }),
    inc: (value) => ({ __command: 'inc', value }),
  },
  collection: collectionApi,
  async runTransaction(callback) {
    const pending = transactionTail.then(async () => {
      const before = [...collections].map(([name, rows]) => [name, new Map([...rows].map(([id, row]) => [id, clone(row)]))]);
      try { return await callback({ collection: collectionApi }); }
      catch (error) { collections.clear(); for (const [name, rows] of before) collections.set(name, rows); throw error; }
    });
    transactionTail = pending.catch(() => {});
    return pending;
  },
};

const cloudMock = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database: () => database,
  getWXContext: () => ({ OPENID: currentOpenId }),
};

const originalLoad = Module._load;
Module._load = function mockCloudLoad(request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudMock;
  return originalLoad.call(this, request, parent, isMain);
};
const service = require('../cloudfunctions/pvpService/index');
Module._load = originalLoad;

async function callAs(openid, action, data = {}) {
  currentOpenId = openid;
  if (action === 'matchmake' && data.rulesVersion === 'pvp-pixel-v2') {
    data = { replayProtocol: 'pch-events-v1',
      levelHash: require('../cloudfunctions/pvpService/bot-runtime/PvpBotReplay').pixelLevelHash(require(`../cloudfunctions/pvpService/bot-runtime/levels/zt_level_${data.levelId}.json`)), ...data };
  }
  return service.main({ action, displayName: openid === 'creator' ? '发起者' : '挑战者', ...data });
}

async function callExpectingServiceError(openid, action, data = {}) {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await callAs(openid, action, data);
  } finally {
    console.error = originalError;
  }
}

function resultPayload(matchId, terminalTimeMs) {
  const actions = [{ seq: 1, elapsedMs: 1000, row: 0, col: 0, colorId: 1, moved: 1 }];
  const payload = JSON.stringify(actions);
  return {
    matchId,
    terminalType: 'PASS',
    terminalTimeMs,
    progress: 1,
    actionCount: actions.length,
    actionDigest: core.digest(payload),
    checkpointDigest: `checkpoint-${terminalTimeMs}`,
    actionChunks: [{ seqStart: 1, seqEnd: 1, encoding: 'json-v1', payload }],
    progressTimeline: [{ elapsedMs: 0, progress: 0 }, { elapsedMs: terminalTimeMs, progress: 1 }],
    boardTimeline: [{ elapsedMs: terminalTimeMs, addedCells: [{ row: 0, col: 0, colorId: 1 }] }],
    allowReplayOpponent: true,
    trainingConsent: false,
  };
}

function seedInventory(openid, patch = {}) {
  const record = { _id: `assets-${openid}`, openid, vigor: 10, vigorTime: 0, gold: 100,
    expandSlotCount: 0, magicWandCount: 0, freezeCount: 0, brushCount: 0, magnetCount: 0,
    stateUpdatedAt: 0, pvpEconomyRevision: 0, ...patch };
  recordsFor('user_profile').set(record._id, record);
  return record;
}

async function run() {
  const pixelRules = { levelPrefix: 'zt_level_', rulesVersion: 'pvp-pixel-v2' };
  const created = await callAs('creator', 'createFriendChallenge', { levelId: 3, ...pixelRules });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.match.status, 'PLAYING_CREATOR');
  assert.strictEqual(created.match.opponent, null);
  assert.strictEqual(created.match.opponentRun, null);
  assert(/^[A-Z2-9]{6}$/.test(created.match.challengeCode));

  const earlyJoin = await callExpectingServiceError('challenger', 'joinFriendChallenge', { challengeCode: created.match.challengeCode });
  assert.strictEqual(earlyJoin.ok, false);
  assert.match(earlyJoin.errorMessage, /not ready/);

  const creatorResult = await callAs('creator', 'submitResult', resultPayload(created.match.matchId, 42000));
  assert.strictEqual(creatorResult.ok, true);
  assert.strictEqual(creatorResult.match.status, 'WAITING_OPPONENT');
  assert.strictEqual(creatorResult.match.settlement, null);

  const joined = await callAs('challenger', 'joinFriendChallenge', { challengeCode: created.match.challengeCode });
  assert.strictEqual(joined.ok, true);
  assert.strictEqual(joined.match.status, 'PLAYING_CHALLENGER');
  assert.strictEqual(joined.match.opponent.displayName, '发起者');
  assert.strictEqual(joined.match.opponentRun.terminalTimeMs, 42000);
  assert.deepStrictEqual(joined.match.opponentRun.boardTimeline, resultPayload(created.match.matchId, 42000).boardTimeline);

  const challengerResult = await callAs('challenger', 'submitResult', resultPayload(created.match.matchId, 39000));
  assert.strictEqual(challengerResult.ok, true);
  assert.strictEqual(challengerResult.match.status, 'SETTLED');
  assert.strictEqual(challengerResult.match.settlement.outcome, 'win');
  assert.strictEqual(challengerResult.match.settlement.rankStarDelta, 0);

  const creatorMatch = await callAs('creator', 'getMatch', { matchId: created.match.matchId });
  assert.strictEqual(creatorMatch.match.settlement.outcome, 'lose');
  assert.strictEqual(creatorMatch.match.settlement.rankStarDelta, 0);

  const creatorProfile = await callAs('creator', 'getProfile');
  const challengerProfile = await callAs('challenger', 'getProfile');
  for (const profile of [creatorProfile.profile, challengerProfile.profile]) {
    assert.strictEqual(profile.gamesPlayed, 0);
    assert.strictEqual(profile.stars, 0);
    assert.strictEqual(profile.braveryPoints, 0);
  }

  const creatorHistory = await callAs('creator', 'getHistory', { limit: 10 });
  const challengerHistory = await callAs('challenger', 'getHistory', { limit: 10 });
  assert.strictEqual(creatorHistory.history[0].status, 'SETTLED');
  assert.strictEqual(challengerHistory.history[0].status, 'SETTLED');
  assert.strictEqual(created.match.levelPrefix, 'zt_level_');
  assert.strictEqual(joined.match.rulesVersion, pixelRules.rulesVersion);
  assert.strictEqual(recordsFor('pvp_replays').get(`${created.match.matchId}_creator`), undefined, 'legacy structural friend results must not enter the verified pool');
  const storedReplay = { ownerOpenid: 'legacy-author', publicProfile: {}, rating: 1200, levelId: 3,
    levelPrefix: 'zt_level_', rulesVersion: 'pvp-pixel-v2', verified: true, verificationLevel: 'structural-v1',
    eligibleForMatchmaking: true, useCount: 0, validUntil: Date.now() + 86400000,
    boardTimeline: resultPayload('legacy', 42000).boardTimeline };

  const oldClient = await callExpectingServiceError('old-client', 'matchmake', { levelId: 3 });
  assert.strictEqual(oldClient.ok, false, 'old clients cannot start mainline matches on the new service');
  const wrongPrefix = await callExpectingServiceError('wrong-prefix', 'matchmake', { levelId: 3, ...pixelRules, levelPrefix: 'level_' });
  assert.strictEqual(wrongPrefix.ok, false);

  for (let index = 0; index < 4; index++) {
    recordsFor('pvp_matches').set(`legacy-${index}`, {
      _id: `legacy-${index}`, playerAOpenid: 'ranked-player', playerBOpenid: '',
      matchType: 'bot', status: 'PLAYING', levelId: 3, levelPrefix: 'level_', rulesVersion: 'pvp-ranked-v1',
      updatedAt: Date.now() + index, expiresAt: Date.now() + 600000,
    });
  }
  const oldActive = await callAs('ranked-player', 'getActiveMatch');
  assert.strictEqual(oldActive.match, null, 'legacy mainline matches are excluded without deleting them');
  seedInventory('ranked-player');
  const ranked = await callAs('ranked-player', 'matchmake', { levelId: 3, ...pixelRules, economyRevision: 0 });
  assert.strictEqual(ranked.ok, true);
  assert.strictEqual(ranked.match.levelPrefix, 'zt_level_');
  assert.strictEqual(recordsFor('pvp_matches').get(ranked.match.matchId).matchType, 'bot', 'unverified friend records cannot be reused as real opponents');
  const resumed = await callAs('ranked-player', 'getActiveMatch');
  assert.strictEqual(resumed.match.matchId, ranked.match.matchId, 'new match is found even with more than 3 newer legacy matches');
  assert.strictEqual(recordsFor('pvp_matches').get('legacy-0').status, 'PLAYING', 'migration must not settle or deduct old matches');
  const oldSubmit = await callExpectingServiceError('ranked-player', 'submitResult', resultPayload('legacy-0', 2000));
  assert.strictEqual(oldSubmit.ok, false);

  recordsFor('pvp_replays').set('wrong-board', { ...storedReplay, _id: 'wrong-board', levelId: 9, levelPrefix: 'level_' });
  recordsFor('pvp_replays').set('wrong-rules', { ...storedReplay, _id: 'wrong-rules', levelId: 9, rulesVersion: 'pvp-ranked-v1' });
  seedInventory('bot-player');
  const mismatched = await callExpectingServiceError('bot-player', 'matchmake', { levelId: 9, ...pixelRules, economyRevision: 0, levelHash: 'wrong-board' });
  assert.strictEqual(mismatched.ok, false);
  assert(mismatched.errorMessage.includes('版本不一致'));
  assert.strictEqual(recordsFor('user_profile').get('assets-bot-player').vigor, 10, 'board mismatch must fail before spending');
  const noPixelReplay = await callAs('bot-player', 'matchmake', { levelId: 9, ...pixelRules, economyRevision: 0 });
  assert.strictEqual(noPixelReplay.ok, true);
  assert.strictEqual(recordsFor('pvp_matches').get(noPixelReplay.match.matchId).matchType, 'bot', 'never reuse other namespaces or rules for identical numeric IDs');
  const botMatch = recordsFor('pvp_matches').get(noPixelReplay.match.matchId);
  assert.strictEqual(botMatch.playerBRating, 950, 'novice difficulty must be frozen independently of the public profile');
  assert(botMatch.opponentRun.actions.length > 0);
  assert.deepStrictEqual(noPixelReplay.match.opponentRun.boardTimeline, botMatch.opponentRun.boardTimeline);
  assert.strictEqual(noPixelReplay.match.opponent.rating, undefined, 'hidden MMR stays private');
  const failed = { ...resultPayload(botMatch._id, 2000), terminalType: 'FORFEIT', progress: 0,
    actionCount: 0, actionDigest: '', actionChunks: [], boardTimeline: [], progressTimeline: [{ elapsedMs: 0, progress: 0 }],
    replay: { protocol: 'pch-events-v1', levelHash: botMatch.levelHash, events: [[0, 0, 1]] } };
  const settledBot = await callAs('bot-player', 'submitResult', failed);
  assert.strictEqual(settledBot.ok, true);
  const botPlayer = recordsFor('pvp_profiles').get('bot-player');
  assert.strictEqual(botPlayer.rating, 1200 + core.ratingDelta(1200, 950, 'lose', 0), 'settlement must use frozen bot rating, not 1200 fallback');
  assert.strictEqual(botPlayer.lossStreak, 1);
  await callAs('bot-player', 'submitResult', failed);
  assert.strictEqual(recordsFor('pvp_profiles').get('bot-player').lossStreak, 1, 'duplicate settlement cannot increment loss streak');
  const nextBot = await callAs('bot-player', 'matchmake', { levelId: 9, ...pixelRules, economyRevision: 1 });
  assert.strictEqual(nextBot.ok, true);
  assert(recordsFor('pvp_matches').get(nextBot.match.matchId).playerBRating < 950, 'loss protection must affect the next real match');
  const patch = service.__test.profilePatch(botPlayer, 0, 'win', Date.now());
  assert.strictEqual(patch.lossStreak, 0);
  assert.strictEqual(service.__test.profilePatch(botPlayer, 0, 'win', Date.now(), false).lossStreak, 1, 'friend result must not reset ranked protection');
  console.log('PVP_FRIEND_LIFECYCLE_TESTS_PASSED');
}

module.exports = { callAs, callExpectingServiceError, recordsFor, seedInventory, service };
if (require.main === module) run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
