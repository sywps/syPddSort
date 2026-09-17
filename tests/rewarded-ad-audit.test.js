const assert = require('node:assert/strict');
const { buildRewardedAdAudit } = require('../scripts/rewarded-ad-audit');
const event = (name, attemptId, more = {}) => ({
  openid: 'user-a', levelId: 3, eventName: name, timestamp: 100,
  extra: { adTransactionId: 'tx', attemptId, ...more },
});
const show = { ...event('rewarded_ad_show', 1), dedupeKey: 'unique-show' };
const audit = buildRewardedAdAudit([
  { openid: 'user-a', levelId: 3, eventName: 'ad_show' },
  { openid: 'user-a', levelId: 3, eventName: 'ad_reward_success', adTransactionId: 'tx', adAttemptId: '1' },
], [
  event('rewarded_ad_request', undefined), show, show,
  event('rewarded_ad_close', 1, { hasIsEnded: true, isEnded: true }),
  event('rewarded_ad_outcome', 1, { outcomeStatus: 'verified_complete' }),
  event('rewarded_ad_reward_success', 1),
  event('rewarded_ad_show', 2),
  event('rewarded_ad_outcome', 2, { outcomeStatus: 'unknown', outcomeReason: 'cancelled:user-retry' }),
  { ...event('rewarded_ad_outcome', 1, { outcomeStatus: 'verified_complete' }), openid: 'user-b' },
  event('rewarded_ad_replenish_requested', 3, { outcomeStatus: 'verified_complete' }),
], 3);
assert.equal(audit.transactionCount, 2, 'same transaction text for another user must not merge');
assert.equal(audit.coverage.funnel.duplicates, 1);
assert.equal(audit.coverage.behavior.missingTransactionOrUser, 1, 'missing ID must not be joined by timestamp');
const tx = audit.transactions[0];
assert.equal(tx.attempts[0].traceCounts.reward, 1, 'behavior reward does not double the funnel count');
assert.deepEqual(tx.attempts[0].issues, []);
assert.deepEqual(tx.attempts[1].outcomeStatuses, ['unknown'], 'retry attempts remain separate');
assert.deepEqual(tx.attempts[2].outcomeStatuses, [], 'legacy callback does not masquerade as full trace');
assert.ok(audit.transactions[1].attempts[0].issues.includes('verified_complete_without_reward_evidence'));
assert.ok(!JSON.stringify(audit).includes('user-a'), 'output must not include the raw openid');
console.log('rewarded-ad-audit.test.js passed');
