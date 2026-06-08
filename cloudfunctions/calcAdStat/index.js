const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const USER_BEHAVIOR_COLLECTION = 'user_behavior';
const AD_STAT_COLLECTION = 'ad_stat';
const PAGE_SIZE = 100;
const MAX_SCAN_SIZE = 50000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function formatShanghaiDate(timestamp) {
  return new Date(timestamp + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function dateToTimestamp(dateStr) {
  return new Date(`${dateStr}T00:00:00+08:00`).getTime();
}

function shiftDate(dateStr, offsetDays) {
  return formatShanghaiDate(dateToTimestamp(dateStr) + offsetDays * ONE_DAY_MS);
}

function resolveTargetDate(event) {
  if (typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
    return event.date;
  }
  return shiftDate(formatShanghaiDate(Date.now()), -1);
}

function cleanAdType(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 64) : 'unknown';
}

async function fetchBehaviorByDate(dateStr) {
  const startTime = dateToTimestamp(dateStr);
  const endTime = startTime + ONE_DAY_MS;
  const collection = db.collection(USER_BEHAVIOR_COLLECTION);
  const result = [];

  for (let skip = 0; skip < MAX_SCAN_SIZE; skip += PAGE_SIZE) {
    const res = await collection
      .where({
        timestamp: _.gte(startTime).and(_.lt(endTime)),
      })
      .orderBy('timestamp', 'asc')
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

async function fetchExistingStats(dateStr) {
  const collection = db.collection(AD_STAT_COLLECTION);
  const result = [];

  for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
    const res = await collection
      .where({ date: dateStr })
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
  const targetDate = resolveTargetDate(event);

  try {
    const behaviorList = await fetchBehaviorByDate(targetDate);
    const statMap = new Map();

    for (const item of behaviorList) {
      if (!['ad_show', 'ad_click', 'ad_finish'].includes(item.eventName)) {
        continue;
      }
      const adType = cleanAdType(item.adType);
      if (!statMap.has(adType)) {
        statMap.set(adType, {
          date: targetDate,
          adType,
          showNum: 0,
          clickNum: 0,
          finishNum: 0,
          userSet: new Set(),
        });
      }
      const stat = statMap.get(adType);
      if (item.eventName === 'ad_show') stat.showNum += 1;
      if (item.eventName === 'ad_click') stat.clickNum += 1;
      if (item.eventName === 'ad_finish') stat.finishNum += 1;
      if (item.openid) stat.userSet.add(item.openid);
    }

    const existingList = await fetchExistingStats(targetDate);
    const existingMap = new Map(existingList.map((item) => [item.adType, item]));
    const touchedTypes = new Set();
    const collection = db.collection(AD_STAT_COLLECTION);

    for (const [adType, stat] of statMap.entries()) {
      const payload = {
        date: targetDate,
        adType,
        showNum: stat.showNum,
        clickNum: stat.clickNum,
        finishNum: stat.finishNum,
        userNum: stat.userSet.size,
      };
      touchedTypes.add(adType);

      if (existingMap.has(adType)) {
        await collection.doc(existingMap.get(adType)._id).update({ data: payload });
      } else {
        await collection.add({ data: payload });
      }
    }

    for (const existing of existingList) {
      if (touchedTypes.has(existing.adType)) continue;
      await collection.doc(existing._id).update({
        data: {
          date: targetDate,
          adType: existing.adType,
          showNum: 0,
          clickNum: 0,
          finishNum: 0,
          userNum: 0,
        },
      });
    }

    return {
      ok: true,
      date: targetDate,
      list: Array.from(statMap.values()).map((item) => ({
        date: item.date,
        adType: item.adType,
        showNum: item.showNum,
        clickNum: item.clickNum,
        finishNum: item.finishNum,
        userNum: item.userSet.size,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'calcAdStat failed',
    };
  }
};
