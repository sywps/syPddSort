'use strict';

const assert = require('assert');
const { callAs, callExpectingServiceError, recordsFor, seedInventory, service } = require('./pvp-friend-lifecycle.test');
const { ticketDay, ticketWallet, spendVigor, RANK_REWARDS } = require('../cloudfunctions/pvpService/economy');
const rules = { levelId: 3, levelPrefix: 'zt_level_', rulesVersion: 'pvp-pixel-v2' };
const originalNow = Date.now;
const originalGate = process.env.PVP_RANK_REWARDS_ENABLED;
let now = Date.parse('2026-09-07T04:00:00Z');
Date.now = () => now;
const assets = id => recordsFor('user_profile').get(`assets-${id}`);
const profile = id => recordsFor('pvp_profiles').get(id);
const request = async (id, action, data = {}) => {
  const result = await callAs(id, action, data);
  assert.strictEqual(result.ok, true, `${action}: ${result.errorMessage}`);
  return result;
};
const reject = async (id, action, data, message) => {
  const result = await callExpectingServiceError(id, action, data);
  assert.strictEqual(result.ok, false, `${action} must fail`);
  assert.match(result.errorMessage, message);
};
async function initialize(id, inventory = {}) {
  seedInventory(id, inventory);
  return (await request(id, 'getEconomy')).economy;
}
async function newMatch(id) {
  return (await request(id, 'matchmake', { ...rules, economyRevision: assets(id).pvpEconomyRevision })).match;
}
// Finish the fixture between entry-charge tests; result verification is separately audited.
function finishFixture(match) { recordsFor('pvp_matches').get(match.matchId).status = 'SETTLED'; }
async function offer(id, source, suffix) {
  return (await request(id, 'beginTicketReward', { source, requestId: `request-${suffix}` })).reward;
}

async function run() {
  delete process.env.PVP_RANK_REWARDS_ENABLED;
  const initial = await initialize('charge');
  assert.strictEqual(initial.tickets, 3);
  assert.strictEqual(initial.shareUsed, 0);
  assert.strictEqual(initial.resetAt, Date.parse('2026-09-07T16:00:00Z'));
  const simultaneous = await Promise.all([newMatch('charge'), newMatch('charge')]);
  assert.strictEqual(simultaneous[0].matchId, simultaneous[1].matchId, 'concurrent starts return one paid match');
  assert.strictEqual(assets('charge').vigor, 9);
  assert.strictEqual(assets('charge').pvpEconomyRevision, 1);
  assert.strictEqual(profile('charge').tickets, 2);
  assert.strictEqual(recordsFor('pvp_matches').get(simultaneous[0].matchId).entryCost.tickets, 1);
  const repeated = await newMatch('charge');
  assert.strictEqual(repeated.matchId, simultaneous[0].matchId);
  assert.strictEqual(assets('charge').vigor, 9, 'resuming never costs again');
  finishFixture(repeated);
  const beforeRevision = { ...assets('charge') };
  await reject('charge', 'matchmake', { ...rules, economyRevision: 0 }, /资产已变化/);
  assert.deepStrictEqual(assets('charge'), beforeRevision);
  assert.strictEqual(profile('charge').tickets, 2);
  finishFixture(await newMatch('charge'));
  finishFixture(await newMatch('charge'));
  assert.strictEqual(profile('charge').tickets, 0);
  await reject('charge', 'matchmake', { ...rules, economyRevision: 3 }, /门票不足/);
  assert.strictEqual(assets('charge').vigor, 7);

  await initialize('empty', { vigor: 0, vigorTime: now + 300000 });
  await reject('empty', 'matchmake', { ...rules, economyRevision: 0 }, /体力不足/);
  assert.strictEqual(profile('empty').tickets, 3, 'no stamina must not consume a ticket');
  assert.strictEqual(assets('empty').pvpEconomyRevision, 0);
  assert.strictEqual(spendVigor({ ...assets('empty'), vigorTime: now - 300000 }, now).vigor, 1, 'server restores elapsed stamina before charging');
  assert.strictEqual(spendVigor({ ...assets('empty'), vigor: 10, vigorTime: now - 300000 }, now).vigorTime, now + 300000, 'a full stamina wallet must start a fresh recovery timer after spending');

  const cancelled = await offer('charge', 'ad', 'cancelled');
  assert.strictEqual(profile('charge').tickets, 0, 'opening/cancelling an ad must not grant a ticket');
  const first = await offer('charge', 'share', 'share-first');
  assert.strictEqual((await offer('charge', 'share', 'share-first')).claimId, first.claimId, 'offer retry is idempotent');
  await request('charge', 'claimTicketReward', { claimId: first.claimId });
  await request('charge', 'claimTicketReward', { claimId: first.claimId });
  assert.strictEqual(profile('charge').tickets, 1);
  assert.strictEqual(profile('charge').ticketShares, 1);
  const second = await offer('charge', 'share', 'share-second');
  await request('charge', 'claimTicketReward', { claimId: second.claimId });
  await reject('charge', 'beginTicketReward', { source: 'share', requestId: 'request-third-share' }, /今日分享/);
  assert.strictEqual(profile('charge').ticketShares, 2);
  const adA = await offer('charge', 'ad', 'ad-last-slot-a');
  const adB = await offer('charge', 'ad', 'ad-last-slot-b');
  const originalError = console.error;
  console.error = () => {};
  const claimed = await Promise.all([
    callAs('charge', 'claimTicketReward', { claimId: adA.claimId }),
    callAs('charge', 'claimTicketReward', { claimId: adB.claimId }),
  ]).finally(() => { console.error = originalError; });
  assert.strictEqual(claimed.filter(result => result.ok).length, 1, 'last slot can be granted only once');
  assert.strictEqual(profile('charge').tickets, 3);
  assert.strictEqual(profile('charge').ticketShares, 2);
  await reject('charge', 'beginTicketReward', { source: 'ad', requestId: 'request-full' }, /门票已满/);
  await reject('intruder', 'claimTicketReward', { claimId: first.claimId }, /不属于/);
  for (let i = 0; i < 4; i++) {
    // Ticket capacity is consumed by a real new match, not bypassed by an ad counter reset.
    finishFixture(await newMatch('charge'));
    const ad = await offer('charge', 'ad', `unlimited-ad-${i}`);
    await request('charge', 'claimTicketReward', { claimId: ad.claimId });
  }
  assert.strictEqual(profile('charge').ticketShares, 2, 'ads do not spend shares and have no daily count cap');

  now += 600001;
  await reject('charge', 'claimTicketReward', { claimId: cancelled.claimId }, /过期/);
  now = Date.parse('2026-09-07T15:59:59.000Z');
  finishFixture(await newMatch('charge'));
  const crossDayOffer = await offer('charge', 'ad', 'cross-midnight');
  now += 1000;
  assert.strictEqual(ticketDay(now), '2026-09-08');
  const refreshed = (await request('charge', 'getEconomy')).economy;
  assert.strictEqual(refreshed.tickets, 3, 'midnight refills to three, never adds three');
  assert.strictEqual(refreshed.shareUsed, 0);
  assert.strictEqual(profile('charge').ticketShares, 0);
  await reject('charge', 'claimTicketReward', { claimId: crossDayOffer.claimId }, /过期/);
  assert.strictEqual((await request('charge', 'claimTicketReward', { claimId: first.claimId })).repeated, true);
  assert.strictEqual(profile('charge').tickets, 3, 'old successful retry grants nothing next day');
  assert.throws(() => ticketWallet({ ticketDay: ticketDay(now), tickets: -1 }, now), /数据异常/);

  await initialize('prize');
  const prizeRequest = { tier: 'bronze', seasonId: 'S01', economyRevision: 0 };
  await reject('prize', 'claimRankReward', prizeRequest, /暂未开放/);
  assert.strictEqual(assets('prize').gold, 100);
  process.env.PVP_RANK_REWARDS_ENABLED = 'true';
  await reject('prize', 'claimRankReward', { ...prizeRequest, tier: 'silver' }, /尚未达到/);
  assert.deepStrictEqual(RANK_REWARDS.slice(0, 6).map(r => [r.gold, r.prop, r.count]), [
    [188, 'magnet', 1], [366, 'brush', 1], [688, 'brush', 1], [688, 'magnet', 2], [888, 'brush', 2], [1688, 'magnet', 2],
  ]);
  const firstClaim = await request('prize', 'claimRankReward', prizeRequest);
  const again = await request('prize', 'claimRankReward', prizeRequest);
  assert.strictEqual(firstClaim.repeated, false);
  assert.strictEqual(again.repeated, true);
  assert.strictEqual(assets('prize').gold, 288);
  assert.strictEqual(assets('prize').magnetCount, 1);
  assert.strictEqual(assets('prize').pvpEconomyRevision, 1);
  assert.strictEqual(again.economy.inventory.gold, 288, 'return an authoritative balance, never a delta');
  Object.assign(profile('prize'), { rankStars: 17, seasonPeakStars: 18, rewardSeasonId: 'S01' });
  const afterDrop = (await request('prize', 'getEconomy')).economy;
  assert.strictEqual(afterDrop.rewards.find(r => r.tier === 'gold').status, 'claimable');
  await request('prize', 'claimRankReward', { tier: 'gold', seasonId: 'S01', economyRevision: 1 });
  assert.strictEqual(assets('prize').brushCount, 1);
  Object.assign(profile('prize'), { rankStars: 100, seasonPeakStars: 100 });
  await reject('prize', 'claimRankReward', { tier: 'king', seasonId: 'S01', economyRevision: 2 }, /尚未配置/);
  const concurrentRewards = await Promise.all([
    request('prize', 'claimRankReward', { tier: 'diamond', seasonId: 'S01', economyRevision: 2 }),
    request('prize', 'claimRankReward', { tier: 'diamond', seasonId: 'S01', economyRevision: 2 }),
  ]);
  assert.strictEqual(concurrentRewards.filter(r => !r.repeated).length, 1);
  assert.strictEqual(assets('prize').brushCount, 3);
  Object.assign(profile('prize'), { seasonId: 'S02', rankStars: 0 });
  await reject('prize', 'claimRankReward', { ...prizeRequest, economyRevision: 3 }, /赛季已更新/);
  const newSeason = (await request('prize', 'getEconomy')).economy;
  assert.strictEqual(newSeason.rewards[0].status, 'claimable');
  assert.strictEqual(newSeason.rewards.find(r => r.tier === 'gold').status, 'locked', 'previous season peak must not unlock current season prizes');
  await request('prize', 'claimRankReward', { ...prizeRequest, seasonId: 'S02', economyRevision: 3 });
  assert.strictEqual(assets('prize').magnetCount, 2);
  assert.strictEqual(recordsFor('pvp_rank_reward_claims').get('prize_S01_bronze').gold, 188, 'old season receipt remains immutable');
  assert.strictEqual(recordsFor('pvp_rank_reward_claims').get('prize_S02_bronze').count, 1);
  const settled = service.__test.profilePatch({ ...profile('prize'), rankStars: 18, gamesPlayed: 6 }, -12, 'lose', now, true);
  assert.strictEqual(settled.seasonPeakStars, 18, 'dropping a rank must retain the reached tier');
  console.log('PVP_ECONOMY_TESTS_PASSED');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  Date.now = originalNow;
  if (originalGate === undefined) delete process.env.PVP_RANK_REWARDS_ENABLED;
  else process.env.PVP_RANK_REWARDS_ENABLED = originalGate;
});
