const { createHash } = require('node:crypto');
const ID = 'bean_selection_ab_v1';
function bucket(openid) {
  return createHash('sha256').update(`${ID}:${openid}`, 'utf8').digest().readUInt32BE(0) % 100 < 50 ? 'A' : 'B';
}
function resolveAssignment(openid, current, request, now) {
  const excluded = reason => ({ id: ID, status: 'excluded', content: 'A', enrolledAt: 0, reason });
  if (request?.test === true) return excluded('preview');
  if (request?.id === ID && request.exclusionReason) return excluded(String(request.exclusionReason).slice(0, 64));
  if (current?.beanSelectionExperiment?.id === ID) return current.beanSelectionExperiment;
  if (current || request?.id !== ID || request?.eligible !== true) return excluded(current ? 'existing_user' : 'not_eligible');
  return { id: ID, status: 'enrolled', content: bucket(openid), enrolledAt: now, reason: 'new_user' };
}
module.exports = { ID, bucket, resolveAssignment };
