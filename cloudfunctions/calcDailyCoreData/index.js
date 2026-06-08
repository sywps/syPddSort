const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const USER_PROFILE_COLLECTION = 'user_profile';
const USER_BEHAVIOR_COLLECTION = 'user_behavior';
const DAILY_STAT_COLLECTION = 'daily_stat';
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

function toPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
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

async function fetchProfilesByFirstLogin(dateStr) {
  const startTime = dateToTimestamp(dateStr);
  const endTime = startTime + ONE_DAY_MS;
  const collection = db.collection(USER_PROFILE_COLLECTION);
  const result = [];

  for (let skip = 0; skip < 10000; skip += PAGE_SIZE) {
    const res = await collection
      .where({
        firstLoginTime: _.gte(startTime).and(_.lt(endTime)),
      })
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

async function findDailyStat(dateStr) {
  const res = await db.collection(DAILY_STAT_COLLECTION).where({ date: dateStr }).limit(1).get();
  return Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
}

async function buildDailyCore(dateStr) {
  const behaviorList = await fetchBehaviorByDate(dateStr);
  const activeUsers = new Set();
  let totalPlay = 0;

  for (const item of behaviorList) {
    if (item.openid) {
      activeUsers.add(item.openid);
    }
    if (item.eventName === 'game_start') {
      totalPlay += 1;
    }
  }

  const newUsers = await fetchProfilesByFirstLogin(dateStr);
  const cohort1 = await fetchProfilesByFirstLogin(shiftDate(dateStr, -1));
  const cohort3 = await fetchProfilesByFirstLogin(shiftDate(dateStr, -3));
  const cohort7 = await fetchProfilesByFirstLogin(shiftDate(dateStr, -7));

  const retained1 = cohort1.filter((item) => activeUsers.has(item.openid)).length;
  const retained3 = cohort3.filter((item) => activeUsers.has(item.openid)).length;
  const retained7 = cohort7.filter((item) => activeUsers.has(item.openid)).length;

  return {
    date: dateStr,
    dau: activeUsers.size,
    newUser: newUsers.length,
    totalPlay,
    retain1: toPercent(retained1, cohort1.length),
    retain3: toPercent(retained3, cohort3.length),
    retain7: toPercent(retained7, cohort7.length),
  };
}

exports.main = async (event = {}) => {
  const targetDate = resolveTargetDate(event);

  try {
    const payload = await buildDailyCore(targetDate);
    const current = await findDailyStat(targetDate);
    const collection = db.collection(DAILY_STAT_COLLECTION);

    if (current) {
      await collection.doc(current._id).update({ data: payload });
    } else {
      await collection.add({ data: payload });
    }

    return {
      ok: true,
      ...payload,
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'calcDailyCoreData failed',
    };
  }
};
