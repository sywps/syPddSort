const ID = 'first_level_abc_v1';
// Deployment of this getOpenid version starts admission for new profiles only.
const ENABLED = true;
function bucket(openid) {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(`${openid}:${ID}`, 'utf8')) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
  }
  const slot = ((crc ^ 0xffffffff) >>> 0) % 100;
  return slot < 34 ? 'A' : slot < 67 ? 'B' : 'C';
}
function resolveAssignment(openid, current, request, now) {
  if (request?.test === true) return { id: ID, status: 'excluded', content: 'A', enrolledAt: 0, reason: 'preview' };
  if (request?.id === ID && typeof request.exclusionReason === 'string' && request.exclusionReason) {
    return { id: ID, status: 'excluded', content: 'A', enrolledAt: 0, reason: request.exclusionReason.slice(0, 64) };
  }
  if (current?.firstLevelExperiment?.id === ID) return current.firstLevelExperiment;
  if (!ENABLED || current || request?.id !== ID || request?.eligible !== true) {
    return { id: ID, status: 'excluded', content: 'A', enrolledAt: 0,
      reason: !ENABLED ? 'experiment_disabled' : current ? 'existing_user' : 'not_eligible' };
  }
  return { id: ID, status: 'enrolled', content: bucket(openid), enrolledAt: now, reason: 'new_user' };
}
module.exports = { ID, bucket, resolveAssignment };
