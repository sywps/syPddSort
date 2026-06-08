const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const LEVEL_RECORD_COLLECTION = 'level_record';

function cleanString(value, maxLength = 64) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1;
}

function normalizeTimestamp(value) {
  const num = Math.floor(Number(value) || 0);
  return num > 0 ? num : Date.now();
}

function normalizeLevelId(value) {
  const num = Math.floor(Number(value) || 0);
  return num > 0 ? num : 0;
}

function normalizeTryCount(value) {
  const num = Math.floor(Number(value) || 1);
  return num > 0 ? num : 1;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || cleanString(event.openid, 96);
  const levelId = normalizeLevelId(event.levelId);

  if (!openid) {
    return {
      ok: false,
      errorMessage: 'missing openid',
    };
  }

  if (!levelId) {
    return {
      ok: false,
      errorMessage: 'missing levelId',
    };
  }

  const startTime = normalizeTimestamp(event.startTime);
  const endTime = normalizeTimestamp(event.endTime);

  try {
    const addRes = await db.collection(LEVEL_RECORD_COLLECTION).add({
      data: {
        openid,
        levelId,
        tryCount: normalizeTryCount(event.tryCount),
        passStatus: normalizeBoolean(event.passStatus),
        useAdRevive: normalizeBoolean(event.useAdRevive),
        useShareRevive: normalizeBoolean(event.useShareRevive),
        startTime,
        endTime: endTime >= startTime ? endTime : startTime,
      },
    });

    return {
      ok: true,
      id: addRes?._id || '',
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'saveLevelRecord failed',
    };
  }
};
