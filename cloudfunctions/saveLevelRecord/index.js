const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const LEVEL_RECORD_COLLECTION = 'level_record';
const PCH_GAMEPLAY_MODE = 'pch_conveyor';
const PCH_GAMEPLAY_SCHEMA_VERSION = 1;
const MAX_GAMEPLAY_STAT_COUNT = 1000000000;

function normalizeCountdownTiming(event) {
  if (event.countdownTimingVersion === undefined) return {}; // Legacy is unknown, never zero.
  if (event.countdownTimingVersion !== 1 || typeof event.countdownTimingApplicable !== 'boolean') {
    throw new Error('Invalid countdown timing version/applicability');
  }
  const fields = { countdownTimingVersion: 1, countdownTimingApplicable: event.countdownTimingApplicable };
  for (const name of ['countdownConsumedSeconds', 'reviveCount', 'addedTimeSeconds']) {
    const value = event[name];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_GAMEPLAY_STAT_COUNT
        || (name === 'reviveCount' && !Number.isInteger(value))) throw new Error('Invalid ' + name);
    fields[name] = value;
  }
  if (!fields.countdownTimingApplicable && fields.countdownConsumedSeconds !== 0) throw new Error('Untimed round has countdown consumption');
  return fields;
}

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

function normalizeRatio(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

function normalizePchGameplayStats(value, gameplayMode, gameplaySchemaVersion) {
  if (gameplayMode !== PCH_GAMEPLAY_MODE || gameplaySchemaVersion !== PCH_GAMEPLAY_SCHEMA_VERSION) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value;
  return {
    magnetUses: normalizeGameplayStatCount(source.magnetUses),
    brushUses: normalizeGameplayStatCount(source.brushUses),
    freezeUses: normalizeGameplayStatCount(source.freezeUses),
    peakBufferCount: normalizeGameplayStatCount(source.peakBufferCount),
    peakBufferRatio: normalizeRatio(source.peakBufferRatio),
    capacityExpandCount: normalizeGameplayStatCount(source.capacityExpandCount),
    validActionCount: normalizeGameplayStatCount(source.validActionCount),
    finalBufferCount: normalizeGameplayStatCount(source.finalBufferCount),
    finalLockedCount: normalizeGameplayStatCount(source.finalLockedCount),
    totalBeanCount: normalizeGameplayStatCount(source.totalBeanCount),
    finalProgressRatio: normalizeRatio(source.finalProgressRatio),
    capacitySoftHintEligibleCount: normalizeGameplayStatCount(source.capacitySoftHintEligibleCount),
    capacitySoftHintShownCount: normalizeGameplayStatCount(source.capacitySoftHintShownCount),
    capacitySoftHintClickCount: normalizeGameplayStatCount(source.capacitySoftHintClickCount),
  };
}

exports.main = async (event = {}) => {
  if (Number(event.csdVersion) >= 3 && event.analyticsEnvironment !== 'wechat_release') {
    return { ok: false, errorMessage: 'CSD requires confirmed release analytics environment' };
  }
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
  const abId = cleanString(event.abId || event.experimentId, 64);
  const abBucket = cleanString(event.abBucket || event.experimentBucket, 64);

  try {
    const collection = db.collection(LEVEL_RECORD_COLLECTION);
    const roundKey = cleanString(event.roundId, 120);
    const id = roundKey ? crypto.createHash('sha256').update(openid + ':' + roundKey).digest('hex') : '';
    const payload = {
      data: {
        openid,
        analyticsSchemaVersion: normalizeGameplayStatCount(event.analyticsSchemaVersion),
        csdVersion: normalizeGameplayStatCount(event.csdVersion),
        analyticsEnvironment: String(event.analyticsEnvironment || '').slice(0, 32),
        sessionId: cleanString(event.sessionId, 96),
        roundId: cleanString(event.roundId, 120),
        clientBuildId: cleanString(event.clientBuildId, 80),
        levelId,
        logicalLevelId: normalizeLevelId(event.logicalLevelId) || levelId,
        physicalLevelId: normalizeLevelId(event.physicalLevelId) || levelId,
        abId,
        abBucket,
        experimentId: cleanString(event.experimentId, 64) || abId,
        experimentBucket: cleanString(event.experimentBucket, 64) || abBucket,
        firstLevelExperimentId: cleanString(event.firstLevelExperimentId, 64),
        beanSelectionExperimentId: cleanString(event.beanSelectionExperimentId, 64),
        beanSelectionExperimentStatus: cleanString(event.beanSelectionExperimentStatus, 16),
        beanSelectionExperimentBucket: cleanString(event.beanSelectionExperimentBucket, 8),
        beanSelectionEnrolledAt: Math.max(0, Number(event.beanSelectionEnrolledAt) || 0),
        beanSelectionExperimentReason: cleanString(event.beanSelectionExperimentReason, 64),
        encouragementExperimentId: cleanString(event.encouragementExperimentId, 64),
        encouragementExperimentStatus: cleanString(event.encouragementExperimentStatus, 16),
        encouragementExperimentBucket: cleanString(event.encouragementExperimentBucket, 8),
        encouragementEnrolledAt: Math.max(0, Number(event.encouragementEnrolledAt) || 0),
        encouragementExperimentReason: cleanString(event.encouragementExperimentReason, 64),
        thirdLevelExperimentId: cleanString(event.thirdLevelExperimentId, 64),
        thirdLevelExperimentStatus: cleanString(event.thirdLevelExperimentStatus, 16),
        thirdLevelExperimentBucket: cleanString(event.thirdLevelExperimentBucket, 8),
        thirdLevelEnrolledAt: Math.max(0, Number(event.thirdLevelEnrolledAt) || 0),
        thirdLevelExperimentReason: cleanString(event.thirdLevelExperimentReason, 64),
        firstLevelExperimentStatus: cleanString(event.firstLevelExperimentStatus, 16),
        firstLevelExperimentBucket: cleanString(event.firstLevelExperimentBucket, 8),
        firstLevelContentVersion: cleanString(event.firstLevelContentVersion, 32),
        firstLevelEnrolledAt: Math.max(0, Number(event.firstLevelEnrolledAt) || 0),
        firstLevelExperimentReason: cleanString(event.firstLevelExperimentReason, 64),
        levelDataSource: cleanString(event.levelDataSource, 48),
        tryCount: normalizeTryCount(event.tryCount),
        passStatus,
        endReason,
        exitReason: cleanString(event.exitReason, 48),
        useAdRevive: normalizeBoolean(event.useAdRevive),
        useShareRevive: normalizeBoolean(event.useShareRevive),
        gameplayMode,
        gameplayEntryMode: normalizeGameplayEntryMode(event.gameplayEntryMode),
        gameplaySchemaVersion,
        failureReason: normalizeFailureReason(event.failureReason),
        gameplayStats: normalizePchGameplayStats(event.gameplayStats, gameplayMode, gameplaySchemaVersion),
        ...normalizeCountdownTiming(event),
        effectiveTimeLimit: normalizeGameplayStatCount(event.effectiveTimeLimit),
        ddaFactor: Math.min(10, Math.max(0, Number(event.ddaFactor) || 0)),
        ddaReason: cleanString(event.ddaReason, 64),
        startTime,
        endTime: endTime >= startTime ? endTime : startTime,
      },
    };
    const addRes = id ? (await collection.doc(id).set(payload), { _id: id }) : await collection.add(payload);

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
