'use strict';

const { int, cleanString } = require('./core');
const TICKET_CAPACITY = 3;
const SHARE_DAILY_LIMIT = 2;
const DAY_MS = 86400000;
const VIGOR_CEILING = 10;
const VIGOR_RESTORE_MS = 300000;
const INVENTORY_FIELDS = ['vigor', 'vigorTime', 'gold', 'expandSlotCount', 'magicWandCount', 'freezeCount', 'brushCount', 'magnetCount'];
const RANK_REWARDS = Object.freeze([
  { tier: 'bronze', name: '倔强青铜', minStars: 0, gold: 188, prop: 'magnet', count: 1 },
  { tier: 'silver', name: '秩序白银', minStars: 9, gold: 366, prop: 'brush', count: 1 },
  { tier: 'gold', name: '荣耀黄金', minStars: 18, gold: 688, prop: 'brush', count: 1 },
  { tier: 'platinum', name: '尊贵铂金', minStars: 34, gold: 688, prop: 'magnet', count: 2 },
  { tier: 'diamond', name: '永恒钻石', minStars: 50, gold: 888, prop: 'brush', count: 2 },
  { tier: 'master', name: '至尊星耀', minStars: 75, gold: 1688, prop: 'magnet', count: 2 },
  { tier: 'king', name: '最强王者', minStars: 100, gold: 0, prop: 'magnet', count: 0, pending: true },
]);

function ticketDay(now) { return new Date(now + 8 * 3600000).toISOString().slice(0, 10); }
function ticketWallet(profile, now) {
  const day = ticketDay(now);
  if (profile.ticketDay !== day) return { ticketDay: day, tickets: TICKET_CAPACITY, ticketShares: 0 };
  if (!Number.isInteger(profile.tickets) || profile.tickets < 0 || profile.tickets > TICKET_CAPACITY) throw new Error('门票数据异常，请联系客服');
  return { ticketDay: day, tickets: profile.tickets, ticketShares: Math.max(0, int(profile.ticketShares)) };
}

function inventorySnapshot(profile) {
  if (!profile) throw new Error('玩家存档未就绪，请先完成云同步');
  const result = {};
  for (const key of INVENTORY_FIELDS) {
    if (!Number.isSafeInteger(profile[key]) || profile[key] < 0) throw new Error(`玩家资产字段异常：${key}`);
    result[key] = profile[key];
  }
  result.pvpEconomyRevision = Math.max(0, int(profile.pvpEconomyRevision));
  result.stateUpdatedAt = Math.max(0, int(profile.stateUpdatedAt));
  return result;
}

function spendVigor(profile, now) {
  const current = inventorySnapshot(profile);
  let vigor = Math.min(VIGOR_CEILING, current.vigor);
  let vigorTime = vigor >= VIGOR_CEILING ? 0 : current.vigorTime;
  if (vigor < VIGOR_CEILING && vigorTime > 0 && now >= vigorTime) {
    const restored = Math.floor((now - vigorTime) / VIGOR_RESTORE_MS) + 1;
    vigor = Math.min(VIGOR_CEILING, vigor + restored);
    vigorTime = vigor === VIGOR_CEILING ? 0 : vigorTime + restored * VIGOR_RESTORE_MS;
  }
  if (vigor < 1) throw new Error('体力不足，请先补充体力');
  return { vigor: vigor - 1, vigorTime: vigorTime > 0 ? vigorTime : now + VIGOR_RESTORE_MS,
    pvpEconomyRevision: current.pvpEconomyRevision + 1, stateUpdatedAt: Math.max(now, current.stateUpdatedAt + 1) };
}

function rewardProgress(profile) {
  const seasonId = cleanString(profile.seasonId, 32);
  if (!seasonId) throw new Error('赛季配置未就绪');
  const sameSeason = profile.rewardSeasonId === seasonId;
  return { seasonId, peakStars: Math.max(int(profile.rankStars), sameSeason ? int(profile.seasonPeakStars) : 0),
    claimed: sameSeason ? (profile.rankRewardClaims || {}) : {} };
}

function formatEconomy(profile, now, inventory = null) {
  const wallet = ticketWallet(profile, now);
  const rewards = rewardProgress(profile);
  const rewardsEnabled = String(process.env.PVP_RANK_REWARDS_ENABLED || '') === 'true';
  return { version: 1, serverTime: now, resetAt: (Math.floor((now + 8 * 3600000) / DAY_MS) + 1) * DAY_MS - 8 * 3600000,
    tickets: wallet.tickets, capacity: TICKET_CAPACITY, shareUsed: wallet.ticketShares, shareLimit: SHARE_DAILY_LIMIT,
    seasonId: rewards.seasonId, rewardsEnabled, inventory,
    rewards: RANK_REWARDS.map(item => ({ ...item, status: item.pending ? 'pending' : rewards.claimed[item.tier] ? 'claimed'
      : rewards.peakStars >= item.minStars ? (rewardsEnabled ? 'claimable' : 'disabled') : 'locked' })) };
}

function createEconomyService({ db, readDoc }) {
  async function findInventory(openid) {
    const result = await db.collection('user_profile').where({ openid }).limit(2).get();
    if (result.data?.length !== 1) throw new Error('玩家存档未就绪或存在冲突，请先完成云同步');
    return result.data[0];
  }
  async function getEconomy(openid) {
    const inventory = await findInventory(openid);
    return db.runTransaction(async tx => {
      const profile = await readDoc('pvp_profiles', openid, tx);
      if (!profile) throw new Error('排位档案不存在');
      const currentInventory = await readDoc('user_profile', inventory._id, tx);
      if (currentInventory?.openid !== openid) throw new Error('玩家资产归属不符');
      const now = Date.now();
      const wallet = ticketWallet(profile, now);
      await tx.collection('pvp_profiles').doc(openid).update({ data: wallet });
      return formatEconomy({ ...profile, ...wallet }, now, inventorySnapshot(currentInventory));
    });
  }
  async function beginTicketReward(openid, event) {
    const source = event.source;
    if (!['ad', 'share'].includes(source)) throw new Error('无效的门票获取方式');
    const requestId = cleanString(event.requestId, 80);
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) throw new Error('无效的奖励请求编号');
    const claimId = `${openid}_${requestId}`;
    return db.runTransaction(async tx => {
      const old = await readDoc('pvp_ticket_claims', claimId, tx);
      if (old) {
        if (old.ownerOpenid !== openid || old.source !== source) throw new Error('奖励请求冲突');
        return { claimId, source, status: old.status, expiresAt: old.expiresAt };
      }
      const profile = await readDoc('pvp_profiles', openid, tx);
      if (!profile) throw new Error('排位档案不存在');
      const now = Date.now();
      const wallet = ticketWallet(profile, now);
      if (wallet.tickets >= TICKET_CAPACITY) throw new Error('门票已满，无需补充');
      if (source === 'share' && wallet.ticketShares >= SHARE_DAILY_LIMIT) throw new Error('今日分享次数已用完');
      const expiresAt = now + 600000;
      await tx.collection('pvp_ticket_claims').doc(claimId).set({ data: {
        ownerOpenid: openid, source, status: 'PENDING', ticketDay: wallet.ticketDay, createdAt: now, expiresAt,
      } });
      return { claimId, source, status: 'PENDING', expiresAt };
    });
  }
  async function claimTicketReward(openid, event) {
    const claimId = cleanString(event.claimId, 220);
    return db.runTransaction(async tx => {
      const claim = await readDoc('pvp_ticket_claims', claimId, tx);
      if (!claim || claim.ownerOpenid !== openid) throw new Error('门票奖励不存在或不属于当前玩家');
      const profile = await readDoc('pvp_profiles', openid, tx);
      if (!profile) throw new Error('排位档案不存在');
      const now = Date.now();
      const wallet = ticketWallet(profile, now);
      if (claim.status === 'CLAIMED') return { economy: formatEconomy({ ...profile, ...wallet }, now), repeated: true };
      if (claim.expiresAt <= now || claim.ticketDay !== wallet.ticketDay) throw new Error('门票奖励已过期，请重新获取');
      if (wallet.tickets >= TICKET_CAPACITY) throw new Error('门票已满，未消耗领取次数');
      if (claim.source === 'share' && wallet.ticketShares >= SHARE_DAILY_LIMIT) throw new Error('今日分享次数已用完');
      wallet.tickets++;
      if (claim.source === 'share') wallet.ticketShares++;
      await tx.collection('pvp_profiles').doc(openid).update({ data: wallet });
      await tx.collection('pvp_ticket_claims').doc(claimId).update({ data: { status: 'CLAIMED', claimedAt: now } });
      return { economy: formatEconomy({ ...profile, ...wallet }, now), repeated: false };
    });
  }
  async function claimRankReward(openid, event) {
    const reward = RANK_REWARDS.find(item => item.tier === event.tier);
    if (!reward || reward.pending) throw new Error('该段位奖励尚未配置');
    const inventory = await findInventory(openid);
    return db.runTransaction(async tx => {
      const profile = await readDoc('pvp_profiles', openid, tx);
      if (!profile) throw new Error('排位档案不存在');
      const progress = rewardProgress(profile);
      if (event.seasonId !== progress.seasonId) throw new Error('赛季已更新，请刷新奖励页');
      const currentInventory = await readDoc('user_profile', inventory._id, tx);
      if (currentInventory?.openid !== openid) throw new Error('玩家资产归属不符');
      const current = inventorySnapshot(currentInventory);
      const now = Date.now();
      const receiptId = `${openid}_${progress.seasonId}_${reward.tier}`;
      const receipt = await readDoc('pvp_rank_reward_claims', receiptId, tx);
      if (receipt || progress.claimed[reward.tier]) return { economy: formatEconomy(profile, now, current), repeated: true };
      if (String(process.env.PVP_RANK_REWARDS_ENABLED || '') !== 'true') throw new Error('段位奖励暂未开放');
      if (progress.peakStars < reward.minStars) throw new Error('尚未达到该段位');
      if (event.economyRevision !== current.pvpEconomyRevision) throw new Error('资产已变化，请刷新后重试');
      const propField = `${reward.prop}Count`;
      const patch = { gold: current.gold + reward.gold, [propField]: current[propField] + reward.count,
        pvpEconomyRevision: current.pvpEconomyRevision + 1, stateUpdatedAt: Math.max(now, current.stateUpdatedAt + 1) };
      await tx.collection('user_profile').doc(inventory._id).update({ data: patch });
      const rewardPatch = { rewardSeasonId: progress.seasonId, seasonPeakStars: progress.peakStars,
        rankRewardClaims: { ...progress.claimed, [reward.tier]: now } };
      await tx.collection('pvp_profiles').doc(openid).update({ data: rewardPatch });
      await tx.collection('pvp_rank_reward_claims').doc(receiptId).set({ data: {
        ownerOpenid: openid, seasonId: progress.seasonId, tier: reward.tier, claimedAt: now,
        gold: reward.gold, prop: reward.prop, count: reward.count, economyRevision: patch.pvpEconomyRevision,
      } });
      return { economy: formatEconomy({ ...profile, ...rewardPatch }, now, inventorySnapshot({ ...currentInventory, ...patch })), repeated: false };
    });
  }
  return { findInventory, getEconomy, beginTicketReward, claimTicketReward, claimRankReward };
}

module.exports = { ticketDay, ticketWallet, inventorySnapshot, spendVigor, rewardProgress, formatEconomy, createEconomyService, RANK_REWARDS };
