'use strict';

const RANKS = Object.freeze([
  { key: 'bronze', name: '倔强青铜', divisions: 3, starsPerDivision: 3, floor: 0 },
  { key: 'silver', name: '秩序白银', divisions: 3, starsPerDivision: 3, floor: 900 },
  { key: 'gold', name: '荣耀黄金', divisions: 4, starsPerDivision: 4, floor: 1100 },
  { key: 'platinum', name: '尊贵铂金', divisions: 4, starsPerDivision: 4, floor: 1300 },
  { key: 'diamond', name: '永恒钻石', divisions: 5, starsPerDivision: 5, floor: 1500 },
  { key: 'master', name: '至尊星耀', divisions: 5, starsPerDivision: 5, floor: 1750 },
  { key: 'king', name: '最强王者', divisions: 1, starsPerDivision: 25, floor: 2000 },
  { key: 'honor_king', name: '荣耀王者', divisions: 1, starsPerDivision: 50, floor: 2500 },
  { key: 'legend_king', name: '传奇王者', divisions: 1, starsPerDivision: 999, floor: 3000 },
]);

const TERMINALS = new Set(['PASS', 'DEAD_CONVEYOR_FULL', 'DEAD_TIMEOUT', 'FORFEIT', 'SURVIVED_OPPONENT_DEATH']);

function int(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function cleanString(value, maxLength = 64) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeTerminal(value) {
  const terminal = cleanString(value, 32).toUpperCase();
  if (!TERMINALS.has(terminal)) throw new Error('invalid terminal type');
  return terminal;
}

function divisionRoman(index) {
  return ['I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(4, index))] || 'I';
}

function rankFromRating(rawRating) {
  const rating = Math.max(0, int(rawRating, 1000));
  let tierIndex = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (rating >= RANKS[i].floor) tierIndex = i;
  }
  const tier = RANKS[tierIndex];
  if (tierIndex >= 6) {
    const stars = Math.max(0, Math.floor((rating - tier.floor) / 20));
    return { tierKey: tier.key, tierName: tier.name, division: 1, stars, rating, displayName: tier.name };
  }
  const nextFloor = RANKS[tierIndex + 1]?.floor || tier.floor + 200;
  const span = Math.max(1, nextFloor - tier.floor);
  const divisionSpan = span / tier.divisions;
  const progress = Math.max(0, rating - tier.floor);
  const climbed = Math.min(tier.divisions - 1, Math.floor(progress / divisionSpan));
  const division = tier.divisions - climbed;
  const withinDivision = progress - climbed * divisionSpan;
  const stars = Math.min(tier.starsPerDivision - 1, Math.floor(withinDivision / (divisionSpan / tier.starsPerDivision)));
  return {
    tierKey: tier.key,
    tierName: tier.name,
    division,
    stars,
    rating,
    displayName: `${tier.name} ${divisionRoman(division - 1)}`,
  };
}

function starsFromRating(rawRating) {
  const rating = Math.max(0, int(rawRating, 1200));
  if (rating < 900) return Math.max(0, Math.floor((rating - 700) / 22));
  if (rating < 1100) return 9 + Math.floor((rating - 900) / 23);
  if (rating < 1300) return 18 + Math.floor((rating - 1100) / 13);
  if (rating < 1500) return 34 + Math.floor((rating - 1300) / 13);
  if (rating < 1750) return 50 + Math.floor((rating - 1500) / 10);
  if (rating < 2000) return 75 + Math.floor((rating - 1750) / 10);
  return 100 + Math.floor((rating - 2000) / 20);
}

function rankFromStars(rawStars) {
  const totalStars = Math.max(0, int(rawStars));
  const ladder = [
    { key: 'bronze', name: '倔强青铜', divisions: 3, starsPerDivision: 3, start: 0, capacity: 9 },
    { key: 'silver', name: '秩序白银', divisions: 3, starsPerDivision: 3, start: 9, capacity: 9 },
    { key: 'gold', name: '荣耀黄金', divisions: 4, starsPerDivision: 4, start: 18, capacity: 16 },
    { key: 'platinum', name: '尊贵铂金', divisions: 4, starsPerDivision: 4, start: 34, capacity: 16 },
    { key: 'diamond', name: '永恒钻石', divisions: 5, starsPerDivision: 5, start: 50, capacity: 25 },
    { key: 'master', name: '至尊星耀', divisions: 5, starsPerDivision: 5, start: 75, capacity: 25 },
  ];
  const tier = ladder.find((item) => totalStars < item.start + item.capacity);
  if (tier) {
    const within = totalStars - tier.start;
    const climbed = Math.min(tier.divisions - 1, Math.floor(within / tier.starsPerDivision));
    const division = tier.divisions - climbed;
    const stars = within % tier.starsPerDivision;
    return { tierKey: tier.key, tierName: tier.name, division, stars, totalStars, displayName: `${tier.name} ${divisionRoman(division - 1)}` };
  }
  const kingStars = totalStars - 100;
  const tierName = kingStars >= 100 ? '传奇王者' : kingStars >= 50 ? '荣耀王者' : kingStars >= 40 ? '至圣王者' : kingStars >= 30 ? '绝世王者' : kingStars >= 20 ? '无双王者' : kingStars >= 10 ? '非凡王者' : '最强王者';
  return { tierKey: 'king', tierName, division: 1, stars: kingStars, totalStars, displayName: tierName };
}

function expectedScore(selfRating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - selfRating) / 400));
}

function ratingDelta(selfRating, opponentRating, outcome, gamesPlayed = 0) {
  const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  const played = int(gamesPlayed);
  const k = played < 5 ? 64 : played < 30 ? 40 : int(selfRating) >= 2500 ? 16 : 24;
  return Math.round(k * (score - expectedScore(selfRating, opponentRating)));
}

function resolveOutcome(ownTerminal, ownTimeMs, opponentTerminal, opponentTimeMs) {
  const selfType = normalizeTerminal(ownTerminal);
  const otherType = normalizeTerminal(opponentTerminal);
  const selfTime = Math.max(0, int(ownTimeMs));
  const otherTime = Math.max(0, int(opponentTimeMs));
  const selfPass = selfType === 'PASS';
  const otherPass = otherType === 'PASS';
  if (selfType === 'FORFEIT') return otherType === 'FORFEIT' ? 'draw' : 'lose';
  if (otherType === 'FORFEIT') return 'win';
  if (selfType === 'SURVIVED_OPPONENT_DEATH') return otherPass ? 'lose' : 'win';
  if (otherType === 'SURVIVED_OPPONENT_DEATH') return selfPass ? 'win' : 'lose';
  if (selfPass && otherPass) return selfTime === otherTime ? 'draw' : selfTime < otherTime ? 'win' : 'lose';
  if (selfPass !== otherPass) return selfPass ? 'win' : 'lose';
  return selfTime === otherTime ? 'draw' : selfTime > otherTime ? 'win' : 'lose';
}

function oppositeOutcome(outcome) {
  return outcome === 'win' ? 'lose' : outcome === 'lose' ? 'win' : 'draw';
}

function hash32(input) {
  let hash = 2166136261;
  const source = String(input || '');
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function digest(input) {
  return `fnv1a-${(`00000000${hash32(input).toString(16)}`).slice(-8)}`;
}

function verifyActionPayload(event, submission) {
  const chunks = Array.isArray(event?.actionChunks) ? event.actionChunks : [];
  if (submission.actionCount === 0) {
    if (submission.terminalType === 'PASS') throw new Error('pass result requires action log');
    return [];
  }
  if (submission.actionCount > 4096 || chunks.length !== 1) throw new Error('invalid action chunk count');
  const payload = cleanString(chunks[0]?.payload, 240000);
  if (!payload || digest(payload) !== submission.actionDigest) throw new Error('action digest mismatch');
  let actions;
  try {
    actions = JSON.parse(payload);
  } catch (_) {
    throw new Error('invalid action payload');
  }
  if (!Array.isArray(actions) || actions.length !== submission.actionCount) throw new Error('action count mismatch');
  let lastElapsed = -1;
  actions.forEach((action, index) => {
    const elapsedMs = int(action?.elapsedMs, -1);
    if (int(action?.seq, -1) !== index + 1 || elapsedMs < lastElapsed || elapsedMs > submission.terminalTimeMs) {
      throw new Error('invalid action sequence');
    }
    if (int(action?.row, -1) < 0 || int(action?.col, -1) < 0 || int(action?.colorId, -1) <= 0 || int(action?.moved, -1) <= 0) {
      throw new Error('invalid action command');
    }
    lastElapsed = elapsedMs;
  });
  return actions;
}

function normalizeProgressTimeline(value, terminalTimeMs) {
  if (!Array.isArray(value)) return [];
  if (value.length > 512) throw new Error('progress timeline exceeds limit');
  let lastElapsed = -1;
  let lastProgress = 0;
  return value.map((point) => {
    const elapsedMs = int(point?.elapsedMs, -1);
    const progress = clamp(point?.progress, 0, 1);
    if (elapsedMs < 0 || elapsedMs < lastElapsed || elapsedMs > terminalTimeMs || progress < lastProgress) {
      throw new Error('invalid progress timeline');
    }
    lastElapsed = elapsedMs;
    lastProgress = progress;
    return { elapsedMs, progress };
  });
}

function normalizeBoardTimeline(value, terminalTimeMs) {
  if (!Array.isArray(value)) return [];
  if (value.length > 512) throw new Error('board timeline exceeds point limit');
  const seen = new Set();
  let lastElapsed = -1;
  let totalCells = 0;
  return value.map((point) => {
    const elapsedMs = int(point?.elapsedMs, -1);
    if (elapsedMs < 0 || elapsedMs < lastElapsed || elapsedMs > terminalTimeMs) throw new Error('invalid board timeline');
    const sourceCells = Array.isArray(point?.addedCells) ? point.addedCells : [];
    const addedCells = sourceCells.map((cell) => {
      const row = int(cell?.row, -1);
      const col = int(cell?.col, -1);
      const colorId = int(cell?.colorId, -1);
      if (row < 0 || row > 511 || col < 0 || col > 511 || colorId <= 0 || colorId > 4096) {
        throw new Error('invalid board timeline cell');
      }
      const key = `${row}:${col}`;
      if (seen.has(key)) throw new Error('duplicate board timeline cell');
      seen.add(key);
      totalCells += 1;
      if (totalCells > 4096) throw new Error('board timeline exceeds cell limit');
      return { row, col, colorId };
    });
    if (addedCells.length === 0) throw new Error('empty board timeline point');
    lastElapsed = elapsedMs;
    return { elapsedMs, addedCells };
  });
}

function createSeededRandom(seed) {
  let state = hash32(seed) || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function createBotRun({ seed, rating, levelId, gamesPlayed = 0, lossStreak = 0 }) {
  if (!Number.isInteger(levelId) || levelId < 1) throw new Error('机器人关卡编号无效');
  const level = require(`./bot-runtime/levels/zt_level_${levelId}.json`);
  return require('./bot-runtime/PvpBotReplay').createPixelBotReplay(level, seed, { rating, gamesPlayed, lossStreak });
}

function simulatedPlayerName(seed) {
  const names = ['糖豆小葵', '格子阿辰', '彩虹小满', '拼图小北', '方块桃子', '像素阿乐', '豆豆小森', '小麦拼拼', '星星小岚', '橘子汽水', '可可方糖', '晴天小鹿'];
  return names[hash32(seed) % names.length];
}

function isFriendChallengeJoinReady(match) {
  return match?.status === 'WAITING_OPPONENT'
    && !!match?.submissions?.a
    && !match?.playerBOpenid;
}

function canSubmitFriendChallenge(status, side) {
  if (side === 'a') return status === 'PLAYING_CREATOR' || status === 'PLAYING';
  if (side === 'b') return status === 'PLAYING_CHALLENGER' || status === 'PLAYING';
  return false;
}

function publicProfile(source, opponentType) {
  const rank = rankFromStars(source?.rankStars ?? starsFromRating(source?.rating));
  return {
    displayName: cleanString(source?.displayName, 24) || '像素玩家',
    avatarUrl: cleanString(source?.avatarUrl, 512),
    rankName: int(source?.gamesPlayed) < 5 ? `定位赛 ${int(source?.gamesPlayed)}/5` : rank.displayName,
    stars: rank.stars,
    opponentType,
  };
}

function makeChallengeCode(source) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = hash32(source);
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[value % alphabet.length];
    value = (Math.floor(value / alphabet.length) ^ hash32(`${source}:${i}`)) >>> 0;
  }
  return code;
}

module.exports = {
  RANKS,
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
  digest,
  verifyActionPayload,
  normalizeProgressTimeline,
  normalizeBoardTimeline,
  simulatedPlayerName,
  isFriendChallengeJoinReady,
  canSubmitFriendChallenge,
};
