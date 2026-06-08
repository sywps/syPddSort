const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const FUNNEL_COLLECTION = 'first_level_funnel';
const MAX_EVENTS_PER_CALL = 50;

function cleanString(value, maxLength = 128) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeNumber(value, fallback = 0) {
  const num = Math.floor(Number(value));
  return Number.isFinite(num) ? num : fallback;
}

function normalizeNonNegative(value) {
  const num = normalizeNumber(value, 0);
  return num >= 0 ? num : 0;
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

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1;
}

function sanitizeExtra(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, raw] of Object.entries(value).slice(0, 20)) {
    const safeKey = cleanString(key, 64);
    if (!safeKey) continue;
    if (typeof raw === 'string') result[safeKey] = raw.slice(0, 256);
    else if (typeof raw === 'number' && Number.isFinite(raw)) result[safeKey] = raw;
    else if (typeof raw === 'boolean') result[safeKey] = raw;
  }
  return result;
}

function normalizeEvent(raw, openid, defaultSessionId, receivedAt) {
  const eventName = cleanString(raw.eventName, 96);
  if (!eventName) return null;
  const sessionId = cleanString(raw.sessionId, 96) || defaultSessionId;
  const eventSeq = normalizeNonNegative(raw.eventSeq);
  return {
    openid,
    sessionId,
    eventSeq,
    dedupeKey: `${openid}:${sessionId}:${eventSeq}`,
    eventName,
    levelId: normalizeLevelId(raw.levelId),
    page: cleanString(raw.page, 64),
    stepId: normalizeLevelId(raw.stepId),
    stepName: cleanString(raw.stepName, 96),
    touchTarget: cleanString(raw.touchTarget, 32),
    source: cleanString(raw.source, 64),
    success: normalizeBoolean(raw.success),
    errorCode: cleanString(raw.errorCode, 64),
    errorMessage: cleanString(raw.errorMessage, 256),
    duration: normalizeNonNegative(raw.duration),
    abId: cleanString(raw.abId, 64),
    abBucket: cleanString(raw.abBucket, 64),
    logicalLevelId: normalizeLevelId(raw.logicalLevelId),
    physicalLevelId: normalizeLevelId(raw.physicalLevelId),
    elapsedMsFromLaunch: normalizeNonNegative(raw.elapsedMsFromLaunch),
    elapsedMsFromLevelReady: normalizeNonNegative(raw.elapsedMsFromLevelReady),
    timestamp: normalizeNonNegative(raw.timestamp) || receivedAt,
    receivedAt,
    extra: sanitizeExtra(raw.extra),
  };
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

  const rawEvents = Array.isArray(event.events) ? event.events.slice(0, MAX_EVENTS_PER_CALL) : [];
  if (rawEvents.length === 0) {
    return {
      ok: false,
      errorMessage: 'missing events',
    };
  }

  const receivedAt = Date.now();
  const defaultSessionId = cleanString(event.sessionId, 96) || `${openid}:${receivedAt}`;
  const events = rawEvents
    .map((item) => normalizeEvent(item || {}, openid, defaultSessionId, receivedAt))
    .filter(Boolean);

  if (events.length === 0) {
    return {
      ok: false,
      errorMessage: 'no valid events',
    };
  }

  try {
    const collection = db.collection(FUNNEL_COLLECTION);
    const results = await Promise.all(events.map((item) => collection.add({ data: item })));
    return {
      ok: true,
      count: results.length,
      ids: results.map((item) => item?._id || ''),
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'addFunnelEvents failed',
    };
  }
};
