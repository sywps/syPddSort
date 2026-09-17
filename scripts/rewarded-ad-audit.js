#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const traceStages = {
  rewarded_ad_request: 'request', rewarded_ad_show: 'show', rewarded_ad_close: 'close',
  rewarded_ad_outcome: 'outcome', rewarded_ad_grant_start: 'grant_start',
  rewarded_ad_reward_success: 'reward', rewarded_ad_grant_failed: 'grant_failed',
  rewarded_ad_after_grant_failed: 'after_grant_failed', rewarded_ad_cancel: 'cancel',
  rewarded_ad_recoverable: 'recoverable', rewarded_ad_wait_pending: 'wait_pending',
};
const behaviorStages = { ad_click: 'request', ad_show: 'show', ad_finish: 'complete', ad_reward_success: 'reward' };

function buildRewardedAdAudit(behavior, funnel, levelId) {
  const transactions = new Map(), seen = new Set();
  const coverage = {};
  for (const [source, records] of [['behavior', behavior], ['funnel', funnel]]) {
    const counts = coverage[source] = { events: 0, duplicates: 0, linked: 0, missingTransactionOrUser: 0, missingAttempt: 0 };
    for (const record of records) {
      if (levelId !== undefined && Number(record.levelId) !== levelId) continue;
      const extra = record.extra || {};
      const stage = source === 'behavior' ? behaviorStages[record.eventName]
        : traceStages[record.eventName] || (record.eventName === 'rewarded_ad_replenish_requested' ? 'legacy_outcome' : '');
      if (!stage) continue;
      const eventKey = record._id || record.dedupeKey;
      const dedupeKey = eventKey ? `${source}:${eventKey}` : '';
      if (dedupeKey && seen.has(dedupeKey)) { counts.duplicates++; continue; }
      if (dedupeKey) seen.add(dedupeKey);
      counts.events++;
      const transactionId = String(record.adTransactionId || extra.adTransactionId || '');
      const user = String(record.openid || '');
      if (!transactionId || !user) { counts.missingTransactionOrUser++; continue; }
      counts.linked++;
      const attempt = String(record.adAttemptId ?? extra.attemptId ?? '');
      const attemptId = attempt && attempt !== '0' ? attempt : null;
      if (!attemptId && stage !== 'request') counts.missingAttempt++;
      const key = JSON.stringify([user, transactionId]);
      if (!transactions.has(key)) transactions.set(key, {
        userKey: crypto.createHash('sha256').update(user).digest('hex').slice(0, 12),
        transactionId, events: [],
      });
      transactions.get(key).events.push({
        source, stage, attemptId, timestamp: Number(record.timestamp) || null,
        levelId: record.levelId, page: record.page || extra.page || '',
        roundId: record.roundId || extra.roundId || null,
        clientBuildId: record.clientBuildId || extra.clientBuildId || null,
        outcomeStatus: extra.outcomeStatus || null,
        reason: extra.outcomeReason || extra.cancelReason || extra.reason || null,
        hasIsEnded: typeof extra.hasIsEnded === 'boolean' ? extra.hasIsEnded : null,
        isEnded: typeof extra.isEnded === 'boolean' ? extra.isEnded : null,
      });
    }
  }
  const rows = [...transactions.values()].map(transaction => {
    transaction.events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const attempts = [...new Set(transaction.events.map(e => e.attemptId).filter(Boolean))].map(attemptId => {
      const events = transaction.events.filter(e => e.attemptId === attemptId);
      const trace = events.filter(e => e.source === 'funnel' && e.stage !== 'legacy_outcome');
      const count = stage => trace.filter(e => e.stage === stage).length;
      const outcomes = trace.filter(e => e.stage === 'outcome').map(e => e.outcomeStatus);
      const issues = [];
      if (count('reward') > 1) issues.push('duplicate_reward_event');
      if (count('reward') && !outcomes.includes('verified_complete')) issues.push('reward_without_verified_outcome_evidence');
      if (outcomes.includes('verified_complete') && !count('reward')) issues.push('verified_complete_without_reward_evidence');
      if (count('show') && !count('outcome') && !count('cancel')) issues.push('show_without_terminal_evidence');
      return { attemptId, traceCounts: Object.fromEntries([...new Set(trace.map(e => e.stage))].map(stage => [stage, count(stage)])),
        outcomeStatuses: outcomes, issues };
    });
    return { ...transaction, attempts };
  });
  return { levelId: levelId ?? null, coverage, transactionCount: rows.length, transactions: rows,
    note: 'Exact user + transaction + attempt joins only. Missing evidence is not failure or zero. Behavior and funnel stages are never added together. Legacy outcomes remain separate.' };
}

function readNdjson(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
    .map((line, index) => {
      try { return JSON.parse(line); }
      catch { throw new Error(`Invalid NDJSON at ${file}:${index + 1}`); }
    });
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length < 3 || args.length > 4) throw new Error('Usage: node scripts/rewarded-ad-audit.js behavior.ndjson funnel.ndjson output.json [levelId]');
    const level = args[3] === undefined ? undefined : Number(args[3]);
    if (level !== undefined && (!Number.isInteger(level) || level < 1)) throw new Error('levelId must be a positive integer');
    const result = buildRewardedAdAudit(readNdjson(args[0]), readNdjson(args[1]), level);
    fs.writeFileSync(args[2], JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ transactionCount: result.transactionCount, coverage: result.coverage }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildRewardedAdAudit };
