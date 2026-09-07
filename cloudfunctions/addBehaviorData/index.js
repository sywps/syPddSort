const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const USER_PROFILE_COLLECTION = 'user_profile';
const USER_BEHAVIOR_COLLECTION = 'user_behavior';
const PCH_GAMEPLAY_MODE = 'pch_conveyor';
const PCH_GAMEPLAY_SCHEMA_VERSION = 1;

function normalizeNonNegativeInt(value) {
  const num = Math.floor(Number(value) || 0);
  return num >= 0 ? num : 0;
}

function cleanString(value, maxLength = 64) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
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

function normalizeActionType(value) {
  const num = Math.floor(Number(value) || 1);
  return num >= 1 && num <= 4 ? num : 1;
}

function normalizeDuration(value) {
  const num = Math.floor(Number(value) || 0);
  return num > 0 ? num : 0;
}

function normalizeLevelId(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : trimmed.slice(0, 64);
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeExperimentLevelId(value) {
  return normalizeLevelId(value);
}

function normalizeGameplayMode(value) {
  return cleanString(value, 32) === PCH_GAMEPLAY_MODE ? PCH_GAMEPLAY_MODE : '';
}

function normalizeGameplayEntryMode(value) {
  const mode = cleanString(value, 16);
  return ['main', 'theme', 'external'].includes(mode) ? mode : '';
}

function normalizeGameplaySchemaVersion(value, gameplayMode) {
  if (gameplayMode !== PCH_GAMEPLAY_MODE) return 0;
  return Math.floor(Number(value) || 0) === PCH_GAMEPLAY_SCHEMA_VERSION
    ? PCH_GAMEPLAY_SCHEMA_VERSION
    : 0;
}

function normalizeFailureReason(value) {
  const reason = cleanString(value, 24);
  return reason === 'timeout' || reason === 'buffer_full' ? reason : '';
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

async function touchUserProfile(openid, timestamp, eventName) {
  const collection = db.collection(USER_PROFILE_COLLECTION);
  const current = await findUserProfile(openid);

  if (!current) {
    await collection.add({
      data: {
        openid,
        channel: '',
        device: '',
        system: '',
        firstLoginTime: timestamp,
        lastLoginTime: timestamp,
        totalPlayTimes: eventName === 'game_start' ? 1 : 0,
        isPay: false,
        createTime: timestamp,
        ...buildInventoryFields(),
      },
    });
    return;
  }

  const patch = {
    lastLoginTime: timestamp,
    ...buildInventoryPatch(current),
  };

  if (eventName === 'game_start') {
    patch.totalPlayTimes = _.inc(1);
  }

  await collection.doc(current._id).update({ data: patch });
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || cleanString(event.openid, 96);

  if (!openid) {
    return {
      ok: false,
      errorMessage: 'missing openid',
    };
  }

  const timestamp = Date.now();
  const gameplayMode = normalizeGameplayMode(event.gameplayMode);
  const data = {
    openid,
    eventName: cleanString(event.eventName, 64),
    levelId: normalizeLevelId(event.levelId),
    page: cleanString(event.page, 64),
    actionType: normalizeActionType(event.actionType),
    shareType: cleanString(event.shareType, 64),
    adType: cleanString(event.adType, 64),
    duration: normalizeDuration(event.duration),
    abId: cleanString(event.abId, 64),
    abBucket: cleanString(event.abBucket, 64),
    logicalLevelId: normalizeExperimentLevelId(event.logicalLevelId),
    physicalLevelId: normalizeExperimentLevelId(event.physicalLevelId),
    smartHintShownCount: normalizeNonNegativeInt(event.smartHintShownCount),
    gameplayMode,
    gameplayEntryMode: normalizeGameplayEntryMode(event.gameplayEntryMode),
    gameplaySchemaVersion: normalizeGameplaySchemaVersion(event.gameplaySchemaVersion, gameplayMode),
    failureReason: normalizeFailureReason(event.failureReason),
    timestamp,
  };

  if (!data.eventName) {
    return {
      ok: false,
      errorMessage: 'missing eventName',
    };
  }

  try {
    const addRes = await db.collection(USER_BEHAVIOR_COLLECTION).add({ data });
    await touchUserProfile(openid, timestamp, data.eventName);
    return {
      ok: true,
      id: addRes?._id || '',
      timestamp,
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'addBehaviorData failed',
    };
  }
};
