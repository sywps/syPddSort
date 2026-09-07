'use strict';

const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { createEconomyService, ticketWallet, inventorySnapshot, spendVigor, rewardProgress } = require('./economy');
const { createReplayMatcher, eligibleReplay, loadLevel, rankedPool } = require('./matchmaking');
const { verifySubmission, submissionDigest } = require('./replay-validation');
const { HUMAN_REPLAY_PROTOCOL, HUMAN_REPLAY_VERIFICATION, replayHumanEvents } = require('./bot-runtime/PvpHumanReplay');
const { pixelLevelHash } = require('./bot-runtime/PvpBotReplay');
const {
  cleanString,
  int,
  normalizeTerminal,
  rankFromRating,
  rankFromStars,
  starsFromRating,
  ratingDelta,
  resolveOutcome,
  oppositeOutcome,
  createBotRun,
  publicProfile,
  makeChallengeCode,
  verifyActionPayload,
  normalizeProgressTimeline,
  normalizeBoardTimeline,
  simulatedPlayerName,
  isFriendChallengeJoinReady,
  canSubmitFriendChallenge,
} = require('./core');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const command = db.command;
const replayMatcher = createReplayMatcher(db);

const COLLECTIONS = Object.freeze({
  profiles: 'pvp_profiles',
  matches: 'pvp_matches',
  replays: 'pvp_replays',
  settlements: 'pvp_settlements',
  checkpoints: 'pvp_checkpoints',
});
const RULES_VERSION = 'pvp-pixel-v2';
const LEVEL_PREFIX = 'zt_level_';
const DEFAULT_RATING = 1200;
const MATCH_EXPIRE_MS = 10 * 60 * 1000;
const FRIEND_EXPIRE_MS = 24 * 60 * 60 * 1000;
const economyService = createEconomyService({ db, readDoc });

function requirePixelMatch(value) {
  if (value?.levelPrefix !== LEVEL_PREFIX || value?.rulesVersion !== RULES_VERSION) {
    throw new Error('incompatible pixel-puzzle rules; update client and start a new match');
  }
}

function requirePixelLevel(event) {
  requirePixelMatch(event);
  if (!Number.isInteger(event.levelId) || event.levelId < 1) throw new Error('invalid pixel-puzzle level');
  return event.levelId;
}

function requireOpenId(context) {
  const openid = cleanString(context?.OPENID, 128);
  if (!openid) throw new Error('missing openid');
  return openid;
}

function sanitizeIdentity(event) {
  return {
    displayName: cleanString(event.displayName, 24) || '像素玩家',
    avatarUrl: cleanString(event.avatarUrl, 512),
    clientUuid: cleanString(event.uuid, 64),
  };
}

function initialProfile(openid, identity, now) {
  return {
    openid,
    ...identity,
    rating: DEFAULT_RATING,
    rankStars: 0,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winStreak: 0,
    lossStreak: 0,
    bestWinStreak: 0,
    braveryPoints: 0,
    placementGamesRemaining: 5,
    seasonId: 'S01',
    createdAt: now,
    updatedAt: now,
  };
}

async function readDoc(collectionName, id, transaction = null) {
  try {
    const collection = transaction ? transaction.collection(collectionName) : db.collection(collectionName);
    const result = await collection.doc(id).get();
    return result?.data || null;
  } catch (error) {
    const message = String(error?.message || error?.errMsg || '');
    if (/(not exist|does not exist|not found|不存在)/i.test(message)) return null;
    throw error;
  }
}

async function ensureProfile(openid, event) {
  const identity = sanitizeIdentity(event);
  return db.runTransaction(async transaction => {
    const current = await readDoc(COLLECTIONS.profiles, openid, transaction);
    const now = Date.now();
    if (!current) {
      const profile = initialProfile(openid, identity, now);
      await transaction.collection(COLLECTIONS.profiles).doc(openid).set({ data: profile });
      return profile;
    }
    const patch = { updatedAt: now };
    if (identity.displayName && identity.displayName !== current.displayName) patch.displayName = identity.displayName;
    if (identity.avatarUrl && identity.avatarUrl !== current.avatarUrl) patch.avatarUrl = identity.avatarUrl;
    if (identity.clientUuid && identity.clientUuid !== current.clientUuid) patch.clientUuid = identity.clientUuid;
    if (Object.keys(patch).length > 1) await transaction.collection(COLLECTIONS.profiles).doc(openid).update({ data: patch });
    return { ...current, ...patch };
  });
}

function formatSelfProfile(profile) {
  return {
    ...publicProfile(profile),
    gamesPlayed: int(profile.gamesPlayed),
    wins: int(profile.wins),
    losses: int(profile.losses),
    draws: int(profile.draws),
    winStreak: int(profile.winStreak),
    braveryPoints: int(profile.braveryPoints),
    placementGamesRemaining: Math.max(0, 5 - int(profile.gamesPlayed)),
  };
}

function publicSettlement(settlement) {
  if (!settlement) return null;
  return {
    outcome: settlement.outcome,
    rankStarDelta: int(settlement.rankStarDelta),
    braveryPointsAfter: Math.max(0, int(settlement.braveryPointsAfter)),
    braveryProtected: settlement.braveryProtected === true,
    rankBefore: settlement.rankBefore,
    rankAfter: settlement.rankAfter,
    settledAt: int(settlement.settledAt),
  };
}

async function findHistoricalReplay(openid, levelId, rating) {
  return replayMatcher.find(openid, levelId, rating);
}

function matchResponse(match, openid) {
  const selfIndex = match.playerAOpenid === openid ? 0 : 1;
  const self = selfIndex === 0 ? match.playerA : match.playerB;
  const opponent = selfIndex === 0 ? match.playerB : match.playerA;
  const publicMatchType = match.matchType === 'friend' ? 'friend' : 'ranked';
  const friendOpponentRun = match.matchType === 'friend'
    ? (selfIndex === 0 ? match.submissions?.b : match.submissions?.a) || null
    : null;
  const opponentRun = friendOpponentRun || match.opponentRun || null;
  return {
    matchId: match._id,
    matchType: publicMatchType,
    status: match.status,
    levelId: match.levelId,
    levelPrefix: match.levelPrefix || 'level_',
    levelSeed: match.levelSeed,
    rulesVersion: match.rulesVersion,
    replayProtocol: match.replayProtocol,
    levelHash: match.levelHash,
    self,
    opponent: opponent ? { ...opponent, opponentType: publicMatchType } : null,
    opponentRun: opponentRun ? {
      terminalType: opponentRun.terminalType,
      terminalTimeMs: opponentRun.terminalTimeMs,
      progress: opponentRun.progress,
      progressTimeline: Array.isArray(opponentRun.progressTimeline) ? opponentRun.progressTimeline : [],
      boardTimeline: Array.isArray(opponentRun.boardTimeline) ? opponentRun.boardTimeline : [],
      boardSeed: cleanString(opponentRun.boardSeed, 128),
    } : null,
    challengeCode: match.challengeCode || '',
    expiresAt: match.expiresAt,
    settlement: publicSettlement((selfIndex === 0 ? match.settlements?.a : match.settlements?.b) || match.settlement),
  };
}

async function addMatch(data) {
  const result = await db.collection(COLLECTIONS.matches).add({ data });
  return { ...data, _id: result._id };
}

async function createRankedMatch(event, openid, profile) {
  const levelId = requirePixelLevel(event);
  const activeMatch = await getActiveMatch(openid);
  if (activeMatch) return activeMatch;
  if (event.replayProtocol !== HUMAN_REPLAY_PROTOCOL) throw new Error('请更新客户端以支持真人回放排位');
  if (!event.levelHash) throw new Error('缺少像素关卡版本');
  if (event.poolVersion) {
    const pools = [rankedPool()];
    if ((Date.now() + 28800000) % 86400000 < 300000) pools.push(rankedPool(Date.now() - 86400000));
    if (!pools.some(pool => pool.version === event.poolVersion && pool.levels.some(level => level.levelId === levelId))) {
      throw new Error('排位关卡池已更新，请重新匹配');
    }
  }
  if (event.levelHash) {
    const level = require(`./bot-runtime/levels/zt_level_${levelId}.json`);
    if (require('./bot-runtime/PvpBotReplay').pixelLevelHash(level) !== event.levelHash) {
      throw new Error('像素关卡版本不一致，请更新客户端和云函数后重试');
    }
  }
  const inventory = await economyService.findInventory(openid);
  const now = Date.now();
  const replay = await findHistoricalReplay(openid, levelId, profile);
  let opponent;
  let opponentRun;
  let matchType;
  if (replay) {
    matchType = 'human_replay';
    opponent = replay.publicProfile;
    opponentRun = {
      replayId: replay._id,
      terminalType: replay.terminalType,
      terminalTimeMs: replay.terminalTimeMs,
      progress: replay.progress,
      progressTimeline: Array.isArray(replay.progressTimeline) ? replay.progressTimeline : [],
      boardTimeline: Array.isArray(replay.boardTimeline) ? replay.boardTimeline : [],
      boardSeed: cleanString(replay.boardSeed, 128),
      policyVersion: '',
    };
  } else {
    matchType = 'bot';
    const botSeed = `${openid}:${now}`;
    opponentRun = createBotRun({ seed: botSeed, rating: profile.rating, levelId,
      gamesPlayed: profile.gamesPlayed, lossStreak: profile.lossStreak });
    opponent = publicProfile({ displayName: simulatedPlayerName(botSeed), rating: opponentRun.rating, gamesPlayed: 12 }, 'bot');
  }
  const matchId = crypto.randomBytes(16).toString('hex');
  return db.runTransaction(async transaction => {
  const current = await readDoc(COLLECTIONS.profiles, openid, transaction);
  if (!current) throw new Error('排位档案不存在');
  const currentInventory = await readDoc('user_profile', inventory._id, transaction);
  if (currentInventory?.openid !== openid) throw new Error('玩家资产归属不符');
  if (current.activeRankedMatchId) {
    const previous = await readDoc(COLLECTIONS.matches, current.activeRankedMatchId, transaction);
    if (previous?.status === 'PLAYING' && previous.expiresAt > now && previous.playerAOpenid === openid) {
      return { ...matchResponse(previous, openid), entryInventory: inventorySnapshot(currentInventory) };
    }
  }
  const wallet = ticketWallet(current, now);
  if (wallet.tickets < 1) throw new Error('门票不足，请先补充门票');
  if (event.economyRevision !== Math.max(0, int(currentInventory.pvpEconomyRevision))) throw new Error('资产已变化，请刷新后重试');
  const inventoryPatch = spendVigor(currentInventory, now);
  const match = {
    _id: matchId,
    matchType,
    status: 'PLAYING',
    playerAOpenid: openid,
    playerBOpenid: '',
    playerA: publicProfile(profile),
    playerB: opponent,
    playerARating: int(profile.rating, DEFAULT_RATING),
    playerBRating: int(replay ? replay.rating : opponentRun.rating, DEFAULT_RATING),
    levelId,
    levelPrefix: LEVEL_PREFIX,
    levelSeed: `${LEVEL_PREFIX}${levelId}`,
    rulesVersion: RULES_VERSION,
    replayProtocol: HUMAN_REPLAY_PROTOCOL,
    levelHash: pixelLevelHash(loadLevel(levelId)),
    allowReplayOpponent: event.allowReplayOpponent === true,
    matchmakingVersion: 'human-pool-v1',
    poolVersion: event.poolVersion || 'direct-level',
    opponentRun,
    submissions: {},
    entryCost: { tickets: 1, vigor: 1, chargedAt: now },
    createdAt: now,
    updatedAt: now,
    expiresAt: now + MATCH_EXPIRE_MS,
  };
  const { _id, ...matchData } = match;
  if (replay) {
    const frozen = await readDoc(COLLECTIONS.replays, replay._id, transaction);
    if (!frozen || !eligibleReplay(frozen, openid, levelId, current, now)) throw new Error('对手记录已更新，请重试匹配');
    await transaction.collection(COLLECTIONS.replays).doc(replay._id).update({ data: { useCount: command.inc(1), lastUsedAt: now } });
  }
  await transaction.collection('user_profile').doc(inventory._id).update({ data: inventoryPatch });
  await transaction.collection(COLLECTIONS.profiles).doc(openid).update({ data: { ...wallet, tickets: wallet.tickets - 1, activeRankedMatchId: matchId,
    recentOpponents: [...(current.recentOpponents || []), { replayId: replay?._id || '', ownerOpenid: replay?.ownerOpenid || '', levelId }].slice(-10),
    [replay ? 'humanReplayMatches' : 'botMatches']: command.inc(1) } });
  await transaction.collection(COLLECTIONS.matches).doc(matchId).set({ data: matchData });
  return { ...matchResponse(match, openid), entryInventory: inventorySnapshot({ ...currentInventory, ...inventoryPatch }) };
  });
}

async function createFriendChallenge(event, openid, profile) {
  const levelId = requirePixelLevel(event);
  if (await getActiveMatch(openid)) throw new Error('active match already exists');
  const now = Date.now();
  const challengeCode = makeChallengeCode(`${openid}:${now}:${levelId}`);
  const match = await addMatch({
    matchType: 'friend', status: 'PLAYING_CREATOR', challengeCode,
    playerAOpenid: openid, playerBOpenid: '', playerA: publicProfile(profile), playerB: null,
    levelId, levelPrefix: LEVEL_PREFIX, levelSeed: `${LEVEL_PREFIX}${levelId}`,
    rulesVersion: RULES_VERSION, submissions: {}, createdAt: now, updatedAt: now,
    expiresAt: now + FRIEND_EXPIRE_MS,
  });
  return matchResponse(match, openid);
}

async function joinFriendChallenge(event, openid, profile) {
  if (await getActiveMatch(openid)) throw new Error('active match already exists');
  const challengeCode = cleanString(event.challengeCode, 12).toUpperCase();
  if (!challengeCode) throw new Error('missing challenge code');
  const result = await db.collection(COLLECTIONS.matches).where({ challengeCode, matchType: 'friend' }).limit(1).get();
  const match = result.data?.[0];
  if (!match) throw new Error('challenge not found');
  return db.runTransaction(async (transaction) => {
    const current = await readDoc(COLLECTIONS.matches, match._id, transaction);
    if (!current) throw new Error('challenge not found');
    requirePixelMatch(current);
    if (current.expiresAt <= Date.now()) throw new Error('challenge expired');
    if (current.playerAOpenid === openid) throw new Error('cannot join own challenge');
    if (!isFriendChallengeJoinReady(current)) throw new Error('friend challenge result is not ready');
    const playerB = publicProfile(profile, 'friend');
    await transaction.collection(COLLECTIONS.matches).doc(current._id).update({
      data: { playerBOpenid: openid, playerB, status: 'PLAYING_CHALLENGER', updatedAt: Date.now() },
    });
    return matchResponse({ ...current, playerBOpenid: openid, playerB, status: 'PLAYING_CHALLENGER' }, openid);
  });
}

function normalizeSubmission(event, now) {
  const terminalType = normalizeTerminal(event.terminalType);
  const terminalTimeMs = Math.max(1, Math.min(MATCH_EXPIRE_MS, int(event.terminalTimeMs)));
  return {
    terminalType, terminalTimeMs,
    progress: terminalType === 'PASS' ? 1 : Math.max(0, Math.min(0.999, Number(event.progress) || 0)),
    actionCount: Math.max(0, Math.min(4096, int(event.actionCount))),
    actionDigest: cleanString(event.actionDigest, 128),
    checkpointDigest: cleanString(event.checkpointDigest, 128),
    clientFinishedAt: Math.max(0, int(event.clientFinishedAt)),
    receivedAt: now,
  };
}

function profilePatch(profile, delta, outcome, now, rated = true) {
  const gamesPlayed = int(profile.gamesPlayed) + (rated ? 1 : 0);
  const streak = rated ? (outcome === 'win' ? int(profile.winStreak) + 1 : 0) : int(profile.winStreak);
  const braveryGain = 5 + (outcome === 'win' ? 10 : 0) + (outcome === 'win' ? Math.min(5, streak - 1) : 0);
  const currentBravery = Math.max(0, int(profile.braveryPoints));
  const protectedLoss = rated && outcome === 'lose' && currentBravery >= 100 && int(profile.gamesPlayed) >= 5;
  const rating = Math.max(0, int(profile.rating, DEFAULT_RATING) + delta);
  let rankStars = Math.max(0, int(profile.rankStars));
  let rankStarDelta = 0;
  if (rated && gamesPlayed === 5) {
    const placedStars = starsFromRating(rating);
    rankStarDelta = placedStars - rankStars;
    rankStars = placedStars;
  } else if (rated && gamesPlayed > 5) {
    rankStarDelta = outcome === 'win' ? 1 : outcome === 'lose' && !protectedLoss && rankStars > 0 ? -1 : 0;
    rankStars = Math.max(0, rankStars + rankStarDelta);
  }
  return {
    rating, rankStars, rankStarDelta, gamesPlayed,
    ...(rated ? { rewardSeasonId: profile.seasonId, seasonPeakStars: Math.max(rewardProgress(profile).peakStars, rankStars),
      rankRewardClaims: rewardProgress(profile).claimed } : {}),
    wins: int(profile.wins) + (rated && outcome === 'win' ? 1 : 0),
    losses: int(profile.losses) + (rated && outcome === 'lose' ? 1 : 0),
    draws: int(profile.draws) + (rated && outcome === 'draw' ? 1 : 0),
    winStreak: streak, bestWinStreak: Math.max(int(profile.bestWinStreak), streak), updatedAt: now,
    lossStreak: rated ? (outcome === 'lose' ? int(profile.lossStreak) + 1 : 0) : int(profile.lossStreak),
    braveryPoints: Math.max(0, currentBravery - (protectedLoss ? 100 : 0) + (rated ? braveryGain : 0)),
    braveryProtected: protectedLoss,
    placementGamesRemaining: Math.max(0, 5 - gamesPlayed),
  };
}

function persistedProfilePatch(patch) {
  const { rankStarDelta, braveryProtected, ...persisted } = patch;
  return persisted;
}

async function settleMatch(matchId, submitterOpenid, submission, replayRecord = null, replayEnvelope = null) {
  return db.runTransaction(async (transaction) => {
    const match = await readDoc(COLLECTIONS.matches, matchId, transaction);
    if (!match) throw new Error('match not found');
    if (match.playerAOpenid !== submitterOpenid && match.playerBOpenid !== submitterOpenid) throw new Error('not a participant');
    if (match.status === 'SETTLED') {
      const original = match.submissions?.[match.playerAOpenid === submitterOpenid ? 'a' : 'b'];
      if (original?.requestDigest && original.requestDigest !== submission.requestDigest) throw new Error('settled result cannot be changed');
      return matchResponse(match, submitterOpenid);
    }
    if (match.expiresAt <= Date.now()) throw new Error('match expired');
    const side = match.playerAOpenid === submitterOpenid ? 'a' : 'b';
    if (match.submissions?.[side]) {
      if (match.submissions[side].requestDigest !== submission.requestDigest) throw new Error('submitted result cannot be changed');
      return matchResponse(match, submitterOpenid);
    }
    if (replayEnvelope) {
      const checkpoint = await readDoc(COLLECTIONS.checkpoints, `${matchId}_${submitterOpenid}`, transaction);
      if (checkpoint?.replay && JSON.stringify(checkpoint.replay.events) !== JSON.stringify(replayEnvelope.events.slice(0, checkpoint.replay.events.length))) {
        throw new Error('final result cannot rewrite accepted checkpoint');
      }
    }
    if (match.matchType === 'friend') {
      if (!canSubmitFriendChallenge(match.status, side)) throw new Error('friend challenge is not playable for this participant');
    } else if (match.status !== 'PLAYING') {
      throw new Error('match is not playable');
    }
    const submissions = { ...(match.submissions || {}), [side]: submission };
    let otherSubmission = side === 'a' ? submissions.b : submissions.a;
    if (match.matchType !== 'friend') otherSubmission = match.opponentRun;
    if (!otherSubmission) {
      if (match.matchType === 'friend' && side === 'b') throw new Error('friend opponent run is missing');
      const waitingStatus = match.matchType === 'friend' ? 'WAITING_OPPONENT' : 'WAITING_RESULT';
      await transaction.collection(COLLECTIONS.matches).doc(matchId).update({ data: { submissions, status: waitingStatus, updatedAt: Date.now() } });
      return matchResponse({ ...match, submissions, status: waitingStatus }, submitterOpenid);
    }
    const outcome = resolveOutcome(submission.terminalType, submission.terminalTimeMs, otherSubmission.terminalType, otherSubmission.terminalTimeMs);
    const opponentOpenid = side === 'a' ? match.playerBOpenid : match.playerAOpenid;
    const selfProfile = await readDoc(COLLECTIONS.profiles, submitterOpenid, transaction);
    const opponentProfile = opponentOpenid ? await readDoc(COLLECTIONS.profiles, opponentOpenid, transaction) : null;
    const opponentRating = int((side === 'a' ? match.playerBRating : match.playerARating)
      ?? opponentProfile?.rating ?? (side === 'a' ? match.playerB?.rating : match.playerA?.rating), DEFAULT_RATING);
    const rated = match.matchType !== 'friend' && (submission.verificationLevel === HUMAN_REPLAY_VERIFICATION || submission.terminalType === 'FORFEIT');
    const delta = rated ? ratingDelta(selfProfile.rating, opponentRating, outcome, selfProfile.gamesPlayed) : 0;
    const now = Date.now();
    const selfPatch = profilePatch(selfProfile, delta, outcome, now, rated);
    if (submission.completeRun && submission.verificationLevel === HUMAN_REPLAY_VERIFICATION) {
      selfPatch.replayPerformance = [...(selfProfile.replayPerformance || []), submission.performance].slice(-20);
    }
    await transaction.collection(COLLECTIONS.profiles).doc(submitterOpenid).update({ data: persistedProfilePatch(selfPatch) });
    let opponentDelta = -delta;
    let opponentPatch = null;
    if (opponentProfile) {
      opponentDelta = rated ? ratingDelta(opponentProfile.rating, selfProfile.rating, oppositeOutcome(outcome), opponentProfile.gamesPlayed) : 0;
      opponentPatch = profilePatch(opponentProfile, opponentDelta, oppositeOutcome(outcome), now, rated);
      await transaction.collection(COLLECTIONS.profiles).doc(opponentOpenid).update({ data: persistedProfilePatch(opponentPatch) });
    }
    const settlement = {
      outcome, selfOpenid: submitterOpenid, ratingBefore: int(selfProfile.rating), ratingDelta: delta,
      ratingAfter: selfPatch.rating, rankStarDelta: selfPatch.rankStarDelta, braveryPointsAfter: selfPatch.braveryPoints,
      braveryProtected: selfPatch.braveryProtected, rankBefore: rankFromStars(selfProfile.rankStars ?? starsFromRating(selfProfile.rating)), rankAfter: rankFromStars(selfPatch.rankStars),
      settledAt: now,
    };
    const otherSettlement = {
      outcome: oppositeOutcome(outcome), selfOpenid: opponentOpenid,
      ratingBefore: int(opponentProfile?.rating, opponentRating), ratingDelta: opponentProfile ? opponentDelta : 0,
      ratingAfter: opponentPatch ? opponentPatch.rating : opponentRating,
      rankStarDelta: opponentPatch ? opponentPatch.rankStarDelta : 0,
      rankBefore: rankFromStars(opponentProfile?.rankStars ?? starsFromRating(opponentRating)),
      rankAfter: rankFromStars(opponentPatch ? opponentPatch.rankStars : starsFromRating(opponentRating)),
      settledAt: now,
    };
    const settlements = side === 'a' ? { a: settlement, b: otherSettlement } : { a: otherSettlement, b: settlement };
    await transaction.collection(COLLECTIONS.matches).doc(matchId).update({ data: { submissions, settlements, status: 'SETTLED', updatedAt: now } });
    await transaction.collection(COLLECTIONS.settlements).doc(`${matchId}_${submitterOpenid}`).set({ data: { matchId, openid: submitterOpenid, ...settlement } });
    if (replayRecord) {
      const id = `${matchId}_${submitterOpenid}`;
      if (await readDoc(COLLECTIONS.replays, id, transaction)) throw new Error('immutable replay already exists');
      await transaction.collection(COLLECTIONS.replays).doc(id).set({ data: replayRecord });
    }
    if (opponentOpenid) {
      await transaction.collection(COLLECTIONS.settlements).doc(`${matchId}_${opponentOpenid}`).set({ data: { matchId, openid: opponentOpenid, ...otherSettlement } });
    }
    return matchResponse({ ...match, submissions, settlements, status: 'SETTLED' }, submitterOpenid);
  });
}

function makeReplayRecord(match, openid, profile, submission, event) {
  if (!submission.completeRun || submission.verificationLevel !== HUMAN_REPLAY_VERIFICATION || !submission.actionCount) return null;
  const rating = int(match.playerAOpenid === openid ? match.playerARating : match.playerBRating, DEFAULT_RATING);
  const payload = JSON.stringify(submission.verifiedActions);
  return {
    ownerOpenid: openid, publicProfile: publicProfile(profile, 'human_replay'), rating, ratingBucket: Math.floor(rating / 200),
    matchId: match._id, levelId: match.levelId, levelPrefix: match.levelPrefix, levelSeed: match.levelSeed, rulesVersion: match.rulesVersion,
    terminalType: submission.terminalType, terminalTimeMs: submission.terminalTimeMs, progress: submission.progress,
    actionCount: submission.verifiedActions.length, actionDigest: require('./core').digest(payload), checkpointDigest: submission.checkpointDigest,
    actionChunks: [{ seqStart: 1, seqEnd: submission.verifiedActions.length, encoding: 'json-v1', payload }],
    progressTimeline: submission.progressTimeline, boardTimeline: submission.boardTimeline,
    replay: event.replay, levelHash: submission.levelHash, requestDigest: submission.requestDigest,
    completeRun: true, verified: true, verificationLevel: HUMAN_REPLAY_VERIFICATION,
    eligibleForMatchmaking: match.allowReplayOpponent === true && event.allowReplayOpponent === true,
    trainingConsent: event.trainingConsent === true, useCount: 0, createdAt: Date.now(), validUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
}

async function getLeaderboard(event, openid) {
  const limit = Math.max(1, Math.min(100, int(event.limit, 50)));
  const result = await db.collection(COLLECTIONS.profiles).orderBy('rankStars', 'desc').orderBy('rating', 'desc').limit(limit).get();
  const entries = (result.data || []).map((profile, index) => ({ rank: index + 1, ...formatSelfProfile(profile), isSelf: profile.openid === openid }));
  return { entries, self: entries.find((entry) => entry.isSelf) || null, totalKnown: false };
}

async function getHistory(event, openid) {
  const limit = Math.max(1, Math.min(50, int(event.limit, 20)));
  const [asA, asB] = await Promise.all([
    db.collection(COLLECTIONS.matches).where({ playerAOpenid: openid, status: command.in(['SETTLED', 'WAITING_OPPONENT', 'WAITING_RESULT']) }).orderBy('updatedAt', 'desc').limit(limit).get(),
    db.collection(COLLECTIONS.matches).where({ playerBOpenid: openid, status: command.in(['SETTLED', 'WAITING_RESULT']) }).orderBy('updatedAt', 'desc').limit(limit).get(),
  ]);
  return [...(asA.data || []), ...(asB.data || [])].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map((match) => matchResponse(match, openid));
}

function isParticipant(match, openid) {
  return match?.playerAOpenid === openid || match?.playerBOpenid === openid;
}

async function getActiveMatch(openid) {
  const statuses = ['PLAYING', 'PLAYING_CREATOR', 'PLAYING_CHALLENGER', 'WAITING_RESULT'];
  const [asA, asB] = await Promise.all([
    db.collection(COLLECTIONS.matches).where({ playerAOpenid: openid, levelPrefix: LEVEL_PREFIX, rulesVersion: RULES_VERSION, status: command.in(statuses) }).orderBy('updatedAt', 'desc').limit(3).get(),
    db.collection(COLLECTIONS.matches).where({ playerBOpenid: openid, levelPrefix: LEVEL_PREFIX, rulesVersion: RULES_VERSION, status: command.in(statuses) }).orderBy('updatedAt', 'desc').limit(3).get(),
  ]);
  const match = [...(asA.data || []), ...(asB.data || [])]
    .filter((row) => int(row.expiresAt) > Date.now())
    .filter((row) => row.status === 'PLAYING'
      || (row.status === 'PLAYING_CREATOR' && row.playerAOpenid === openid && !row.submissions?.a)
      || (row.status === 'PLAYING_CHALLENGER' && row.playerBOpenid === openid && !row.submissions?.b)
      || (row.status === 'WAITING_RESULT' && !(row.playerAOpenid === openid ? row.submissions?.a : row.submissions?.b)))
    .sort((a, b) => int(b.updatedAt) - int(a.updatedAt))[0] || null;
  if (!match) return null;
  const checkpoint = await readDoc(COLLECTIONS.checkpoints, `${match._id}_${openid}`);
  return {
    ...matchResponse(match, openid),
    selfCheckpoint: checkpoint ? {
      progress: checkpoint.progress, logicalTimeMs: checkpoint.logicalTimeMs, lastSeq: checkpoint.lastSeq,
      lockedCells: checkpoint.lockedCells || [], updatedAt: checkpoint.updatedAt,
      replay: checkpoint.replay,
      boardTimeline: checkpoint.boardTimeline || [],
    } : null,
  };
}

function normalizeCheckpoint(event) {
  const lockedCells = Array.isArray(event.lockedCells) ? event.lockedCells.slice(0, 4096).map((cell) => ({
    row: Math.max(0, int(cell?.row)), col: Math.max(0, int(cell?.col)), colorId: Math.max(1, int(cell?.colorId, 1)),
  })) : [];
  return {
    progress: Math.max(0, Math.min(1, Number(event.progress) || 0)),
    logicalTimeMs: Math.max(0, Math.min(MATCH_EXPIRE_MS, int(event.logicalTimeMs))),
    lastSeq: Math.max(0, Math.min(4096, int(event.lastSeq))),
    stateHash: cleanString(event.stateHash, 128),
    lockedCells,
    boardTimeline: normalizeBoardTimeline(event.boardTimeline, Math.max(0, Math.min(MATCH_EXPIRE_MS, int(event.logicalTimeMs)))),
    updatedAt: Date.now(),
  };
}

async function saveCheckpoint(event, openid) {
  const matchId = cleanString(event.matchId, 128);
  const match = await readDoc(COLLECTIONS.matches, matchId);
  if (!match) throw new Error('match not found');
  requirePixelMatch(match);
  if (!isParticipant(match, openid)) throw new Error('not a participant');
  if (!['PLAYING', 'PLAYING_CREATOR', 'PLAYING_CHALLENGER', 'WAITING_RESULT'].includes(match.status)) throw new Error('match is not active');
  if (int(match.expiresAt) <= Date.now()) throw new Error('match expired');
  const checkpoint = normalizeCheckpoint(match.replayProtocol === HUMAN_REPLAY_PROTOCOL ? { ...event, boardTimeline: [] } : event);
  if (match.replayProtocol === HUMAN_REPLAY_PROTOCOL) {
    if (checkpoint.logicalTimeMs > Date.now() - match.createdAt + 5000) throw new Error('checkpoint is ahead of server time');
    const replay = replayHumanEvents(loadLevel(match.levelId), event.replay);
    if (replay.lastTime > checkpoint.logicalTimeMs) throw new Error('checkpoint replay exceeds clock');
    checkpoint.progress = replay.progress;
    checkpoint.boardTimeline = replay.boardTimeline;
    checkpoint.lockedCells = replay.boardTimeline.flatMap(point => point.addedCells);
    checkpoint.lastSeq = replay.actions.length;
    checkpoint.replay = event.replay;
  }
  const checkpointId = `${matchId}_${openid}`;
  return db.runTransaction(async transaction => {
  const active = await readDoc(COLLECTIONS.matches, matchId, transaction);
  if (!active || active.expiresAt <= Date.now() || active.status !== match.status) throw new Error('match is no longer active');
  const previous = await readDoc(COLLECTIONS.checkpoints, checkpointId, transaction);
  if (previous?.replay && checkpoint.replay) {
    if (previous.replay.events.length > checkpoint.replay.events.length) return { acceptedSeq: previous.lastSeq, updatedAt: previous.updatedAt, ignored: true };
    if (JSON.stringify(previous.replay.events) !== JSON.stringify(checkpoint.replay.events.slice(0, previous.replay.events.length))) {
      throw new Error('checkpoint cannot rewrite accepted replay events');
    }
  }
  if (previous && int(previous.lastSeq) > checkpoint.lastSeq) {
    return { acceptedSeq: int(previous.lastSeq), updatedAt: int(previous.updatedAt), ignored: true };
  }
  await transaction.collection(COLLECTIONS.checkpoints).doc(checkpointId).set({ data: {
    matchId, ownerOpenid: openid, rulesVersion: match.rulesVersion, ...checkpoint,
  } });
  return { acceptedSeq: checkpoint.lastSeq, updatedAt: checkpoint.updatedAt, ignored: false };
  });
}

async function getOpponentState(event, openid) {
  const match = await readDoc(COLLECTIONS.matches, cleanString(event.matchId, 128));
  if (!match) throw new Error('match not found');
  if (!isParticipant(match, openid)) throw new Error('not a participant');
  const response = matchResponse(match, openid);
  return { sourceType: response.matchType, opponentRun: response.opponentRun, freshness: 'frozen' };
}

async function cancelOrForfeit(event, openid) {
  const matchId = cleanString(event.matchId, 128);
  const match = await readDoc(COLLECTIONS.matches, matchId);
  if (!match) throw new Error('match not found');
  if (!isParticipant(match, openid)) throw new Error('not a participant');
  if (match.matchType === 'friend' && match.playerAOpenid === openid
    && ['PLAYING_CREATOR', 'WAITING_OPPONENT'].includes(match.status)) {
    await db.collection(COLLECTIONS.matches).doc(matchId).update({ data: { status: 'CANCELLED', cancelReason: 'creator_cancelled', updatedAt: Date.now() } });
    return matchResponse({ ...match, status: 'CANCELLED' }, openid);
  }
  const submission = { terminalType: 'FORFEIT', terminalTimeMs: Math.max(1, int(event.logicalTimeMs, 1)), progress: Math.max(0, Math.min(0.999, Number(event.progress) || 0)), actionCount: 0, actionDigest: '', checkpointDigest: '', clientFinishedAt: Date.now(), receivedAt: Date.now() };
  return settleMatch(matchId, openid, submission);
}

function requireMaintenanceToken(event) {
  const expected = cleanString(process.env.PVP_MAINTENANCE_TOKEN, 256);
  const received = cleanString(event.maintenanceToken, 256);
  if (!expected || received !== expected) throw new Error('maintenance authorization failed');
}

async function runMaintenance(event) {
  requireMaintenanceToken(event);
  const now = Date.now();
  const result = await db.collection(COLLECTIONS.matches)
    .where({ status: command.in(['WAITING_OPPONENT', 'PLAYING', 'PLAYING_CREATOR', 'PLAYING_CHALLENGER', 'WAITING_RESULT']), expiresAt: command.lte(now) })
    .limit(100).get();
  let expired = 0;
  for (const match of result.data || []) {
    await db.collection(COLLECTIONS.matches).doc(match._id).update({ data: { status: 'EXPIRED', updatedAt: now, expireReason: 'deadline' } });
    expired += 1;
  }
  const replayResult = await db.collection(COLLECTIONS.replays)
    .where({ eligibleForMatchmaking: true, validUntil: command.lte(now) }).limit(100).get();
  let retiredReplays = 0;
  for (const replay of replayResult.data || []) {
    await db.collection(COLLECTIONS.replays).doc(replay._id).update({ data: { eligibleForMatchmaking: false, retiredAt: now, retireReason: 'expired' } });
    retiredReplays += 1;
  }
  return { expiredMatches: expired, retiredReplays, hasMore: (result.data || []).length === 100 || (replayResult.data || []).length === 100 };
}

async function seedDevelopmentData(event) {
  requireMaintenanceToken(event);
  if (String(process.env.PVP_ALLOW_DEV_SEED || '') !== 'true') throw new Error('development seed is disabled');
  const levels = Array.isArray(event.levelIds) ? event.levelIds.slice(0, 20).map((value) => Math.max(1, int(value))) : [2, 3, 4, 5];
  const ratings = [950, 1125, 1275, 1450, 1650, 1850, 2100];
  let replays = 0;
  for (const levelId of levels) {
    for (let index = 0; index < ratings.length; index += 1) {
      const rating = ratings[index];
      const run = createBotRun({ seed: `dev-human:${levelId}:${rating}`, rating, levelId });
      const replayId = `dev_pixel_v2_${levelId}_${rating}`;
      await db.collection(COLLECTIONS.replays).doc(replayId).set({ data: {
        ownerOpenid: `dev-seed-${index}`, publicProfile: publicProfile({ displayName: `测试玩家${index + 1}`, rating, gamesPlayed: 30 }, 'human_replay'),
        rating, matchId: `dev-match-${levelId}-${rating}`, levelId, levelPrefix: LEVEL_PREFIX, levelSeed: `${LEVEL_PREFIX}${levelId}`, rulesVersion: RULES_VERSION,
        terminalType: run.terminalType, terminalTimeMs: run.terminalTimeMs, progress: run.progress,
        progressTimeline: run.progressTimeline, actionCount: 0, actionDigest: '', checkpointDigest: '', actionChunks: [],
        boardTimeline: run.boardTimeline, boardSeed: '',
        verified: true, verificationLevel: 'development-seed', eligibleForMatchmaking: true, trainingConsent: false,
        useCount: 0, createdAt: Date.now(), validUntil: Date.now() + 7 * 24 * 60 * 60 * 1000, developmentOnly: true,
      } });
      replays += 1;
    }
  }
  return { levels, replays };
}

exports.main = async (event = {}) => {
  try {
    if (event.action === 'getMatchmakingStats') {
      requireMaintenanceToken(event);
      const result = await db.collection(COLLECTIONS.matches).orderBy('createdAt', 'desc').limit(100).get();
      const rows = (result.data || []).filter(match => match.matchType !== 'friend');
      const count = type => rows.filter(match => match.matchType === type).length;
      const outcomes = type => {
        const settled = rows.filter(match => match.matchType === type && match.status === 'SETTLED' && match.settlements?.a);
        return { settled: settled.length, wins: settled.filter(match => match.settlements.a.outcome === 'win').length };
      };
      return { ok: true, stats: { scope: 'latest-100-matches-sample', rankedMatches: rows.length,
        humanMatches: count('human_replay'), botMatches: count('bot'),
        humanShare: rows.length ? count('human_replay') / rows.length : null,
        humanResults: outcomes('human_replay'), botResults: outcomes('bot'),
        oldestCreatedAt: rows.length ? rows[rows.length - 1].createdAt : null, measuredAt: Date.now() } };
    }
    if (event.action === 'maintenance') return { ok: true, maintenance: await runMaintenance(event) };
    if (event.action === 'seedDevelopmentData') return { ok: true, seed: await seedDevelopmentData(event) };
    const openid = requireOpenId(cloud.getWXContext());
    const profile = await ensureProfile(openid, event);
    switch (event.action) {
      case 'getProfile': return { ok: true, profile: formatSelfProfile(profile) };
      case 'getRankedLevel': {
        if (event.replayProtocol !== HUMAN_REPLAY_PROTOCOL) throw new Error('请更新客户端');
        return { ok: true, level: await replayMatcher.offer(openid, profile) };
      }
      case 'getEconomy': return { ok: true, economy: await economyService.getEconomy(openid) };
      case 'beginTicketReward': return { ok: true, reward: await economyService.beginTicketReward(openid, event) };
      case 'claimTicketReward': return { ok: true, ...(await economyService.claimTicketReward(openid, event)) };
      case 'claimRankReward': return { ok: true, ...(await economyService.claimRankReward(openid, event)) };
      case 'matchmake': return { ok: true, match: await createRankedMatch(event, openid, profile) };
      case 'createFriendChallenge': return { ok: true, match: await createFriendChallenge(event, openid, profile) };
      case 'joinFriendChallenge': return { ok: true, match: await joinFriendChallenge(event, openid, profile) };
      case 'getMatch': {
        const match = await readDoc(COLLECTIONS.matches, cleanString(event.matchId, 128));
        if (!match) throw new Error('match not found');
        if (match.playerAOpenid !== openid && match.playerBOpenid !== openid) throw new Error('not a participant');
        return { ok: true, match: matchResponse(match, openid) };
      }
      case 'getActiveMatch': return { ok: true, match: await getActiveMatch(openid) };
      case 'saveCheckpoint': return { ok: true, checkpoint: await saveCheckpoint(event, openid) };
      case 'getOpponentState': return { ok: true, state: await getOpponentState(event, openid) };
      case 'cancelMatch': return { ok: true, match: await cancelOrForfeit(event, openid) };
      case 'submitResult': {
        const matchId = cleanString(event.matchId, 128);
        const match = await readDoc(COLLECTIONS.matches, matchId);
        if (!match) throw new Error('match not found');
        requirePixelMatch(match);
        if (!isParticipant(match, openid)) throw new Error('not a participant');
        const requestDigest = submissionDigest(event);
        const side = match.playerAOpenid === openid ? 'a' : 'b';
        if (match.submissions?.[side]) {
          if (match.submissions[side].requestDigest !== requestDigest) throw new Error('submitted result cannot be changed');
          return { ok: true, match: matchResponse(match, openid) };
        }
        let submission = normalizeSubmission(event, Date.now());
        verifyActionPayload(event, submission);
        event.progressTimeline = normalizeProgressTimeline(event.progressTimeline, submission.terminalTimeMs);
        event.boardTimeline = normalizeBoardTimeline(event.boardTimeline, submission.terminalTimeMs);
        if (submission.progress > 0 && event.boardTimeline.length === 0) throw new Error('progressed result requires board timeline');
        submission.progressTimeline = event.progressTimeline;
        submission.boardTimeline = event.boardTimeline;
        submission = { ...verifySubmission(match, submission, event, Date.now()), requestDigest };
        const replayRecord = makeReplayRecord(match, openid, profile, submission, event);
        const settled = await settleMatch(matchId, openid, submission, replayRecord, event.replay);
        return { ok: true, match: settled };
      }
      case 'getLeaderboard': return { ok: true, ...(await getLeaderboard(event, openid)) };
      case 'getHistory': return { ok: true, history: await getHistory(event, openid) };
      default: return { ok: false, errorCode: 'UNKNOWN_ACTION', errorMessage: 'unknown action' };
    }
  } catch (error) {
    console.error('[pvpService]', event.action, error);
    return { ok: false, errorCode: 'PVP_SERVICE_ERROR', errorMessage: error?.message || 'pvp service error' };
  }
};

exports.__test = { normalizeSubmission, profilePatch, formatSelfProfile };
