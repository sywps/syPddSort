'use strict';
const crypto = require('crypto');
const { replayHumanEvents, HUMAN_REPLAY_PROTOCOL, HUMAN_REPLAY_VERIFICATION } = require('./bot-runtime/PvpHumanReplay');
const { loadLevel, performanceOf } = require('./matchmaking');
function submissionDigest(event) {
  // Immutable retry identity; ignore telemetry and timestamps of request delivery.
  return crypto.createHash('sha256').update(JSON.stringify([event.terminalType, event.terminalTimeMs,
    event.replay || null, event.actionChunks || [], event.allowReplayOpponent === true, event.trainingConsent === true])).digest('hex');
}
function verifySubmission(match, submission, event, now) {
  if (match.replayProtocol !== HUMAN_REPLAY_PROTOCOL) return { ...submission, verificationLevel: 'legacy-unverified', completeRun: false };
  if (submission.terminalTimeMs > now - match.createdAt + 5000) throw new Error('result is ahead of server time');
  const replay = replayHumanEvents(loadLevel(match.levelId), event.replay);
  const result = replay.finish(submission.terminalType, submission.terminalTimeMs);
  if (submission.terminalType === 'SURVIVED_OPPONENT_DEATH') {
    const opponent = match.opponentRun;
    if (!opponent || !['DEAD_TIMEOUT', 'DEAD_CONVEYOR_FULL'].includes(opponent.terminalType)
      || submission.terminalTimeMs < opponent.terminalTimeMs || replay.rules.isBufferDeadlocked() || replay.completedAt >= 0) {
      throw new Error('opponent has not failed before this result');
    }
  }
  if (match.matchType !== 'friend' && match.opponentRun && result.completeRun
    && submission.terminalTimeMs > match.opponentRun.terminalTimeMs + 1000) throw new Error('result continues after opponent terminal');
  if (replay.actions.length !== submission.actionCount) throw new Error('replay action count mismatch');
  return { ...submission, ...result, verificationLevel: HUMAN_REPLAY_VERIFICATION, levelHash: event.replay.levelHash,
    verifiedActions: replay.actions, performance: performanceOf({ ...submission, progress: result.progress }, match.levelId) };
}
module.exports = { submissionDigest, verifySubmission };
