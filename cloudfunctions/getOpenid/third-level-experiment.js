const { createHash } = require('node:crypto');
const ID = 'third_level_abc_v1';
function bucket(openid) {
  return ['A', 'B', 'C'][createHash('sha256').update(`${ID}:${openid}`).digest().readUInt32BE(0) % 3];
}
function resolveAssignment(openid, current, request, now) {
  if (request?.id !== ID || request?.enteringLevel !== 3) return null;
  if (request.test === true) return { id: ID, status: 'excluded', content: 'A', enrolledAt: 0, reason: 'preview' };
  if (current?.thirdLevelExperiment?.id === ID) return current.thirdLevelExperiment;
  const progress = Math.max(Number(current?.savedLevel) || 1, Number(current?.lastLevelId) || 1, Number(request.progress) || 1);
  if (progress > 3) return { id: ID, status: 'excluded', content: 'A', enrolledAt: 0, reason: 'already_past_level_3' };
  return { id: ID, status: 'enrolled', content: bucket(openid), enrolledAt: now, reason: 'first_level_3_entry' };
}
module.exports = { ID, bucket, resolveAssignment };
