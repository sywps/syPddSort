const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const LEVEL_RECORD_COLLECTION = 'level_record';
const PAGE_SIZE = 100;
const MAX_SCAN_SIZE = 20000;

function normalizeLevelId(value) {
  const num = Math.floor(Number(value) || 0);
  return num > 0 ? num : 0;
}

function toPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function isAbandonedRecord(item) {
  const reason = String(item?.endReason || '');
  return reason === 'abandon' || reason === 'interrupted';
}

async function fetchAllLevelRecords(levelId) {
  const collection = db.collection(LEVEL_RECORD_COLLECTION);
  const result = [];

  for (let skip = 0; skip < MAX_SCAN_SIZE; skip += PAGE_SIZE) {
    const res = await collection
      .where({ levelId })
      .orderBy('endTime', 'desc')
      .skip(skip)
      .limit(PAGE_SIZE)
      .get();

    const list = Array.isArray(res.data) ? res.data : [];
    result.push(...list);
    if (list.length < PAGE_SIZE) {
      break;
    }
  }

  return result;
}

exports.main = async (event = {}) => {
  const levelId = normalizeLevelId(event.levelId);

  if (!levelId) {
    return {
      ok: false,
      errorMessage: 'missing levelId',
    };
  }

  try {
    const records = await fetchAllLevelRecords(levelId);
    const abandonedCount = records.filter(isAbandonedRecord).length;
    const resultRecords = records.filter((item) => !isAbandonedRecord(item));
    const totalSessionCount = resultRecords.length;
    const totalTryCount = resultRecords.reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item.tryCount) || 1)), 0);
    const passCount = resultRecords.filter((item) => item.passStatus === true).length;
    const failCount = resultRecords.filter((item) => item.passStatus !== true).length;
    const adReviveCount = resultRecords.filter((item) => item.useAdRevive === true).length;

    return {
      ok: true,
      levelId,
      totalTryCount,
      totalSessionCount,
      abandonedCount,
      passCount,
      passRate: toPercent(passCount, totalSessionCount),
      lossRate: toPercent(failCount, totalSessionCount),
      adReviveRate: toPercent(adReviveCount, totalSessionCount),
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'calcLevelRate failed',
    };
  }
};
