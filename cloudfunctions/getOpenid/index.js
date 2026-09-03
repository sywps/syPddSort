const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { ensurePlayerUid, normalizePlayerUid, PLAYER_UID_FIELD } = require('./playerUid');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;
const USER_PROFILE_COLLECTION = 'user_profile';
const NEW_USER_STARTER_PROP_COUNT = 3;
const BACKFILL_TOKEN_ENV = 'PLAYER_UID_BACKFILL_TOKEN';
const DEFAULT_BACKFILL_BATCH_SIZE = 20;
const MAX_BACKFILL_BATCH_SIZE = 50;

function normalizeNonNegativeInt(value) {
  const num = Math.floor(Number(value) || 0);
  return num >= 0 ? num : 0;
}

function cleanString(value, maxLength = 64) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeBackfillBatchSize(value) {
  const size = Math.floor(Number(value) || DEFAULT_BACKFILL_BATCH_SIZE);
  return Math.max(1, Math.min(MAX_BACKFILL_BATCH_SIZE, size));
}

function isApplyRequested(value) {
  return value === true || value === 'true' || value === 1;
}

function matchesBackfillToken(value) {
  const expected = cleanString(process.env[BACKFILL_TOKEN_ENV], 256);
  const candidate = cleanString(value, 256);
  if (!expected) {
    throw new Error(`missing ${BACKFILL_TOKEN_ENV} environment variable`);
  }
  if (!candidate) return false;
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);
  return expectedBuffer.length === candidateBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
}

function buildInventoryFields(source = {}) {
  const magicWandCount = normalizeNonNegativeInt(source.magicWandCount);
  const freezeCount = Object.prototype.hasOwnProperty.call(source, 'freezeCount')
    ? normalizeNonNegativeInt(source.freezeCount)
    : magicWandCount;
  return {
    gold: normalizeNonNegativeInt(source.gold),
    expandSlotCount: normalizeNonNegativeInt(source.expandSlotCount),
    magicWandCount,
    freezeCount,
    brushCount: normalizeNonNegativeInt(source.brushCount),
    magnetCount: normalizeNonNegativeInt(source.magnetCount),
    addTimeCount: normalizeNonNegativeInt(source.addTimeCount),
  };
}

function buildStarterInventoryFields() {
  return {
    gold: 0,
    expandSlotCount: 0,
    magicWandCount: 0,
    freezeCount: NEW_USER_STARTER_PROP_COUNT,
    brushCount: NEW_USER_STARTER_PROP_COUNT,
    magnetCount: NEW_USER_STARTER_PROP_COUNT,
    addTimeCount: 0,
  };
}

function buildInventoryPatch(source = {}) {
  const next = buildInventoryFields(source);
  const patch = {};
  for (const [key, value] of Object.entries(next)) {
    if (Number(source[key]) !== value) {
      patch[key] = value;
    }
  }
  return patch;
}

function isCollectionMissing(error) {
  const message = String(error?.message || error?.errMsg || '');
  return /collection/i.test(message) && /(not exist|does not exist|不存在)/i.test(message);
}

async function findUserProfile(openid) {
  try {
    const res = await db.collection(USER_PROFILE_COLLECTION).where({ openid }).limit(1).get();
    return Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
  } catch (error) {
    if (isCollectionMissing(error)) {
      throw new Error(`missing ${USER_PROFILE_COLLECTION} collection`);
    }
    throw error;
  }
}

async function ensureProfileUid(profile) {
  const currentUid = normalizePlayerUid(profile?.[PLAYER_UID_FIELD]);
  if (currentUid) return currentUid;
  return ensurePlayerUid(db, profile?._id || '');
}

async function backfillPlayerUids(event) {
  if (!matchesBackfillToken(event.adminToken)) {
    return {
      ok: false,
      errorMessage: 'unauthorized uid backfill request',
    };
  }

  const collection = db.collection(USER_PROFILE_COLLECTION);
  const missingUidQuery = collection.where({ [PLAYER_UID_FIELD]: _.exists(false) });
  const countResult = await missingUidQuery.count();
  const missingProfiles = Math.max(0, Math.floor(Number(countResult?.total) || 0));
  const apply = isApplyRequested(event.apply);

  if (!apply || missingProfiles === 0) {
    return {
      ok: true,
      action: 'backfill',
      dryRun: !apply,
      missingProfiles,
      processed: 0,
      remaining: missingProfiles,
    };
  }

  const batchSize = normalizeBackfillBatchSize(event.batchSize);
  const result = await missingUidQuery.limit(batchSize).get();
  const profiles = Array.isArray(result.data) ? result.data : [];
  let processed = 0;

  for (const profile of profiles) {
    await ensureProfileUid(profile);
    processed += 1;
  }

  return {
    ok: true,
    action: 'backfill',
    dryRun: false,
    missingProfiles,
    processed,
    remaining: Math.max(0, missingProfiles - processed),
  };
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const action = cleanString(event.action, 24) || 'ensure';
  if (action === 'backfill') {
    try {
      return await backfillPlayerUids(event);
    } catch (error) {
      return {
        ok: false,
        errorMessage: error?.message || 'player uid backfill failed',
      };
    }
  }
  if (action !== 'ensure') {
    return {
      ok: false,
      errorMessage: `unsupported action: ${action}`,
    };
  }
  const openid = wxContext.OPENID;

  if (!openid) {
    return {
      ok: false,
      errorMessage: 'missing openid',
    };
  }

  const now = Date.now();
  const channel = cleanString(event.channel);
  const device = cleanString(event.device);
  const system = cleanString(event.system);

  try {
    const collection = db.collection(USER_PROFILE_COLLECTION);
    const current = await findUserProfile(openid);

    if (!current) {
      const profile = {
        openid,
        channel,
        device,
        system,
        firstLoginTime: now,
        lastLoginTime: now,
        totalPlayTimes: 0,
        isPay: false,
        createTime: now,
        ...buildStarterInventoryFields(),
      };

      const addResult = await collection.add({ data: profile });
      profile._id = addResult?._id || '';
      profile[PLAYER_UID_FIELD] = await ensureProfileUid(profile);
      return {
        ok: true,
        openid,
        uid: profile[PLAYER_UID_FIELD],
        isNewUser: true,
        profile,
      };
    }

    const uid = await ensureProfileUid(current);

    const patch = {
      lastLoginTime: now,
      ...buildInventoryPatch(current),
    };

    if (channel && channel !== current.channel) patch.channel = channel;
    if (device && device !== current.device) patch.device = device;
    if (system && system !== current.system) patch.system = system;

    await collection.doc(current._id).update({ data: patch });

    return {
      ok: true,
      openid,
      uid,
      isNewUser: false,
      profile: {
        ...current,
        ...patch,
        [PLAYER_UID_FIELD]: uid,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'getOpenid failed',
    };
  }
};
