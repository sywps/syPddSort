const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const LEVEL_RECORD_COLLECTION = 'level_record';
const PCH_GAMEPLAY_MODE = 'pch_conveyor';
const PCH_GAMEPLAY_SCHEMA_VERSION = 1;
const MAX_GAMEPLAY_STAT_COUNT = 1000000000;

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

function normalizeEndReason(value, passStatus) {
  const text = cleanString(value, 24);
  if (['pass', 'fail', 'abandon', 'interrupted'].includes(text)) return text;
  return passStatus ? 'pass' : 'fail';
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

function normalizeGameplayStatCount(value) {
  const num = Math.max(0, Math.floor(Number(value) || 0));
  return Math.min(MAX_GAMEPLAY_STAT_COUNT, num);
}

function normalizePchGameplayStats(value, gameplayMode, gameplaySchemaVersion) {
  if (gameplayMode !== PCH_GAMEPLAY_MODE || gameplaySchemaVersion !== PCH_GAMEPLAY_SCHEMA_VERSION) {
    return null;
  }
  const source = value && typeof value === 'object' ? value : {};
  return {
    magnetUses: normalizeGameplayStatCount(source.magnetUses),
    brushUses: normalizeGameplayStatCount(source.brushUses),
    freezeUses: normalizeGameplayStatCount(source.freezeUses),
  };
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
  const passStatus = normalizeBoolean(event.passStatus);
  const endReason = normalizeEndReason(event.endReason, passStatus);
  const gameplayMode = normalizeGameplayMode(event.gameplayMode);
  const gameplaySchemaVersion = normalizeGameplaySchemaVersion(event.gameplaySchemaVersion, gameplayMode);

  try {
    const addRes = await db.collection(LEVEL_RECORD_COLLECTION).add({
      data: {
        openid,
        levelId,
        tryCount: normalizeTryCount(event.tryCount),
        passStatus,
        endReason,
        useAdRevive: normalizeBoolean(event.useAdRevive),
        useShareRevive: normalizeBoolean(event.useShareRevive),
        gameplayMode,
        gameplayEntryMode: normalizeGameplayEntryMode(event.gameplayEntryMode),
        gameplaySchemaVersion,
        failureReason: normalizeFailureReason(event.failureReason),
        gameplayStats: normalizePchGameplayStats(event.gameplayStats, gameplayMode, gameplaySchemaVersion),
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
