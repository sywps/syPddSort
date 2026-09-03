const USER_PROFILE_COLLECTION = 'user_profile';
const PLAYER_UID_SEQUENCE_COLLECTION = 'player_uid_sequence';
const PLAYER_UID_SEQUENCE_DOC_ID = 'default';
const PLAYER_UID_FIELD = 'UID';
const PLAYER_UID_MIN = 10000000;
const PLAYER_UID_MAX = 99999999;
const PLAYER_UID_PATTERN = /^[1-9]\d{7}$/;

function normalizePlayerUid(value) {
  if (typeof value !== 'string') return '';
  const uid = value.trim();
  return PLAYER_UID_PATTERN.test(uid) ? uid : '';
}

function isDocumentMissing(error) {
  const message = String(error?.message || error?.errMsg || '');
  return /document/i.test(message) && /(not exist|does not exist|不存在)/i.test(message);
}

function readSnapshotData(snapshot) {
  const data = typeof snapshot?.data === 'function' ? snapshot.data() : null;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

function resolveNextUid(sequence) {
  if (!sequence) return PLAYER_UID_MIN;
  const nextUid = Number(sequence.nextUid);
  if (!Number.isInteger(nextUid) || nextUid < PLAYER_UID_MIN || nextUid > PLAYER_UID_MAX + 1) {
    throw new Error('invalid player uid sequence');
  }
  return nextUid;
}

async function readSequenceInTransaction(transaction, sequenceRef) {
  try {
    return readSnapshotData(await transaction.get(sequenceRef));
  } catch (error) {
    if (isDocumentMissing(error)) return null;
    throw error;
  }
}

async function ensurePlayerUid(db, profileId) {
  if (typeof profileId !== 'string' || !profileId) {
    throw new Error('missing user profile id for uid allocation');
  }

  const profileRef = db.collection(USER_PROFILE_COLLECTION).doc(profileId);
  const sequenceRef = db.collection(PLAYER_UID_SEQUENCE_COLLECTION).doc(PLAYER_UID_SEQUENCE_DOC_ID);
  let assignedUid = '';

  await db.runTransaction(async (transaction) => {
    const profile = readSnapshotData(await transaction.get(profileRef));
    if (!profile) {
      throw new Error('missing user profile during uid allocation');
    }

    const existingUid = normalizePlayerUid(profile[PLAYER_UID_FIELD]);
    if (existingUid) {
      assignedUid = existingUid;
      return;
    }

    const sequence = await readSequenceInTransaction(transaction, sequenceRef);
    const nextUid = resolveNextUid(sequence);
    if (nextUid > PLAYER_UID_MAX) {
      throw new Error('player uid sequence exhausted');
    }

    assignedUid = String(nextUid);
    await transaction.set(sequenceRef, { nextUid: nextUid + 1 });
    await transaction.update(profileRef, { [PLAYER_UID_FIELD]: assignedUid });
  }, 8);

  if (!normalizePlayerUid(assignedUid)) {
    throw new Error('player uid allocation did not return a valid uid');
  }
  return assignedUid;
}

module.exports = {
  PLAYER_UID_MAX,
  PLAYER_UID_FIELD,
  PLAYER_UID_MIN,
  ensurePlayerUid,
  normalizePlayerUid,
};
