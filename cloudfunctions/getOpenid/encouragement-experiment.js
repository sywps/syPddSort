const { createHash } = require('node:crypto');
const ID = 'encouragement_ab_v1';
function bucket(openid) {
  return createHash('sha256').update(`${ID}:${openid}`, 'utf8').digest().readUInt32BE(0) % 100 < 50 ? 'A' : 'B';
}
function resolveAssignment(openid, current, request, now) {
  const excluded = reason => ({ id: ID, status: 'excluded', content: 'A', enrolledAt: 0, reason });
  if (current?.encouragementExperiment?.id === ID) return current.encouragementExperiment;
  return excluded('experiment_closed');

}
module.exports = { ID, bucket, resolveAssignment };
