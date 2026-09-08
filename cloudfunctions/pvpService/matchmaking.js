'use strict';
const crypto = require('crypto');
const catalog = require('./bot-runtime/levels/catalog.json');
const { pixelLevelHash } = require('./bot-runtime/PvpBotReplay');
const { HUMAN_REPLAY_VERIFICATION } = require('./bot-runtime/PvpHumanReplay');
const RULES_VERSION = 'pvp-pixel-v2';
const PREFIX = 'zt_level_';
const humanMatchRating = profile => Math.max(700, (Number.isFinite(profile.rating) ? profile.rating : 1200)
  - ((profile.gamesPlayed || 0) < 5 ? 100 : 0) - Math.min(3, Math.max(0, profile.lossStreak || 0)) * 50);
const dayAt = now => Math.floor((now + 28800000) / 86400000);
const loadLevel = id => {
  if (!catalog.some(level => level.levelId === id)) throw new Error('pixel level not in server catalog');
  return require(`./bot-runtime/levels/zt_level_${id}.json`);
};
function rankedPool(now = Date.now()) {
  const ordered = catalog.filter(level => level.cells >= 200 && level.cells <= 1800 && level.timeLimit <= 300)
    .sort((a, b) => a.cells - b.cells || a.levelId - b.levelId);
  if (ordered.length < 12) throw new Error('ranked pool has insufficient validated level assets');
  const levels = [];
  for (let band = 0; band < 3; band++) {
    const group = ordered.slice(Math.floor(ordered.length * band / 3), Math.floor(ordered.length * (band + 1) / 3));
    for (let offset = 0; offset < 4; offset++) levels.push(group[(dayAt(now) * 4 + offset) % group.length]);
  }
  return { version: `pixel-daily-v1-${dayAt(now)}`, levels };
}
function performanceOf(run, levelId) {
  const item = catalog.find(level => level.levelId === levelId);
  if (!item) throw new Error('unknown performance level');
  const duration = Math.min(1, run.terminalTimeMs / (item.timeLimit * 1000));
  return { levelId, band: Math.floor(item.cells / 400),
    score: run.terminalType === 'PASS' ? 1 + (1 - duration) * 0.5 : run.progress * 0.8 + duration * 0.2 };
}
function targetPerformance(profile, levelId) {
  const band = Math.floor(catalog.find(level => level.levelId === levelId).cells / 400);
  const samples = (profile.replayPerformance || []).filter(item => item.levelId === levelId || item.band === band).map(item => item.score).sort((a, b) => a - b);
  return samples.length ? samples[Math.floor(samples.length / 2)] : null;
}
function eligibleReplay(row, openid, levelId, profile, now) {
  const recent = profile.recentOpponents || [];
  return row.ownerOpenid && row.ownerOpenid !== openid && row.developmentOnly !== true
    && row.verificationLevel === HUMAN_REPLAY_VERIFICATION && row.verified === true
    && row.eligibleForMatchmaking === true && row.completeRun === true && row.useCount < 50 && row.validUntil > now
    && row.levelId === levelId && row.levelPrefix === PREFIX && row.rulesVersion === RULES_VERSION
    && row.levelHash === pixelLevelHash(loadLevel(levelId))
    && ['PASS', 'DEAD_CONVEYOR_FULL', 'DEAD_TIMEOUT'].includes(row.terminalType)
    && Array.isArray(row.boardTimeline) && Array.isArray(row.progressTimeline) && row.progressTimeline.length > 0
    && !recent.some(item => item.replayId === row._id || item.ownerOpenid === row.ownerOpenid);
}
function selectReplay(candidates, openid, levelId, profile, now, random = Math.random) {
  const rating = humanMatchRating(profile);
  const desired = targetPerformance(profile, levelId);
  const valid = candidates.filter(row => eligibleReplay(row, openid, levelId, profile, now));
  for (const range of [75, 125, 200]) {
    const ranked = valid.filter(row => Number.isFinite(row.rating) && Math.abs(row.rating - rating) <= range)
      .map(row => ({ row, cost: Math.abs(row.rating - rating) / 200 * 0.6
        + (desired === null ? 0 : Math.abs(performanceOf(row, levelId).score - desired) * 0.35)
        + row.useCount / 50 * 0.05 } )).sort((a, b) => a.cost - b.cost).slice(0, 6);
    if (!ranked.length) continue;
    const weights = ranked.map(item => 1 / (0.15 + item.cost));
    let ticket = random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < ranked.length; i++) { ticket -= weights[i]; if (ticket <= 0) return ranked[i].row; }
    return ranked[ranked.length - 1].row;
  }
  return null;
}
function createReplayMatcher(db) {
  const random = () => crypto.randomInt(0, 1000000) / 1000000;
  async function find(openid, levelId, profile, now = Date.now()) {
    const levelHash = pixelLevelHash(loadLevel(levelId));
    const bucket = Math.floor(humanMatchRating(profile) / 200);
    const response = await db.collection('pvp_replays').where({ levelId, levelPrefix: PREFIX, rulesVersion: RULES_VERSION,
      levelHash, verificationLevel: HUMAN_REPLAY_VERIFICATION, eligibleForMatchmaking: true,
      ratingBucket: db.command.in([bucket - 1, bucket, bucket + 1]) }).orderBy('createdAt', 'desc').limit(100).get();
    return selectReplay(response.data || [], openid, levelId, profile, now, random);
  }
  async function offer(openid, profile) {
    const pool = rankedPool();
    const novice = (profile.gamesPlayed || 0) < 5;
    const recentLevels = (profile.recentOpponents || []).slice(-3).map(item => item.levelId);
    const levels = (novice ? pool.levels.slice(0, 4) : pool.levels).filter(item => !recentLevels.includes(item.levelId));
    const choices = levels.length ? levels : pool.levels.slice(0, 4);
    const available = await Promise.all(choices.map(async level => ({ level, replay: await find(openid, level.levelId, profile) })));
    const real = available.filter(item => item.replay);
    const source = real.length ? real : available;
    const selected = source[Math.floor(random() * source.length)].level;
    return { levelId: selected.levelId, levelHash: pixelLevelHash(loadLevel(selected.levelId)), poolVersion: pool.version };
  }
  return { find, offer };
}
module.exports = { loadLevel, rankedPool, performanceOf, eligibleReplay, selectReplay, createReplayMatcher };
