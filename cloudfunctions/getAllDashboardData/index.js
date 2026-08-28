const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const USER_PROFILE_COLLECTION = 'user_profile';
const USER_BEHAVIOR_COLLECTION = 'user_behavior';
const LEVEL_RECORD_COLLECTION = 'level_record';
const DAILY_STAT_COLLECTION = 'daily_stat';
const FIRST_LEVEL_FUNNEL_COLLECTION = 'first_level_funnel';
const PAGE_SIZE = 100;
const MAX_SCAN_SIZE = 50000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FRONT10_EXPERIMENT_ID = 'ly_0224';
const FRONT10_MAX_LEVEL_ID = 10;
const FRONT10_BUCKETS = ['all', 'base', 'exp', 'unknown'];

const PCH_FUNNEL_STEPS = [
  { key: 'app_launch', label: '启动游戏' },
  { key: 'ab_assigned', label: 'AB 分桶完成' },
  { key: 'first_level_json_loaded', label: '首关数据加载完成' },
  { key: 'first_level_ui_ready', label: '首关 UI ready' },
  { key: 'alive_1s_after_ui_ready', label: 'UI ready 后 1 秒仍在' },
  { key: 'alive_2s_after_ui_ready', label: 'UI ready 后 2 秒仍在' },
  { key: 'alive_3s_after_ui_ready', label: 'UI ready 后 3 秒仍在' },
  { key: 'alive_5s_after_ui_ready', label: 'UI ready 后 5 秒仍在' },
  { key: 'alive_10s_after_ui_ready', label: 'UI ready 后 10 秒仍在' },
  { key: 'first_level_any_touch', label: '首关任意触摸' },
  { key: 'timer_started', label: '倒计时启动' },
  { key: 'pch_first_store_success', label: '首次存入传送带成功' },
  { key: 'pch_first_return_success', label: '首次从传送带归位成功' },
  { key: 'level_pass', label: '首关通过' },
];

const PCH_FUNNEL_DIAGNOSTICS = [
  { key: 'startup_main_loaded', label: '启动 main 脚本加载' },
  { key: 'startup_boot_start', label: 'Boot 场景启动' },
  { key: 'startup_boot_route_decided', label: 'Boot 路由决策完成' },
  { key: 'startup_route_game_start', label: '开始路由 Game' },
  { key: 'startup_bootstrap_load_start', label: 'bootstrap 分包开始加载' },
  { key: 'startup_bootstrap_load_done', label: 'bootstrap 分包加载完成' },
  { key: 'startup_game_scene_load_done', label: 'Game 场景加载完成' },
  { key: 'startup_game_scene_run', label: 'Game 场景运行' },
  { key: 'startup_continue_start', label: 'Game 启动流程开始' },
  { key: 'startup_continue_decision_start', label: '启动关卡决策开始' },
  { key: 'startup_level_data_start', label: '启动关卡数据开始加载' },
  { key: 'startup_level_data_ready', label: '启动关卡数据加载完成' },
  { key: 'startup_first_playable_ready', label: '首屏可玩 ready' },
  { key: 'remote_config_start', label: 'remote 开始加载' },
  { key: 'remote_config_loaded', label: 'remote 加载成功' },
  { key: 'remote_config_failed', label: 'remote 加载失败' },
  { key: 'bootstrap_level_start', label: 'bootstrap 开始加载' },
  { key: 'first_level_json_failed', label: '首关数据加载失败' },
  { key: 'pch_guide_step_shown', label: 'PCH 引导步骤曝光' },
  { key: 'pch_guide_tap_result', label: 'PCH 引导点击结果' },
  { key: 'pch_guide_step_done', label: 'PCH 引导步骤完成' },
  { key: 'level_fail', label: '首关失败' },
  { key: 'app_hide', label: '切后台/退出' },
];

function formatShanghaiDate(timestamp) {
  return new Date(timestamp + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function dateToTimestamp(dateStr) {
  return new Date(`${dateStr}T00:00:00+08:00`).getTime();
}

function shiftDate(dateStr, offsetDays) {
  return formatShanghaiDate(dateToTimestamp(dateStr) + offsetDays * ONE_DAY_MS);
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = shiftDate(current, 1);
  }
  return dates;
}

function clampDays(value) {
  const num = Math.floor(Number(value) || 7);
  return Math.max(1, Math.min(30, num));
}

function clampTopLimit(value) {
  const num = Math.floor(Number(value) || 10);
  return Math.max(1, Math.min(50, num));
}

function toPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function isAbandonedLevelRecord(item) {
  const reason = String(item?.endReason || '');
  return reason === 'abandon' || reason === 'interrupted';
}

async function fetchByDateRange(collectionName, fieldName, startDate, endDate, orderField) {
  const startTime = dateToTimestamp(startDate);
  const endTime = dateToTimestamp(shiftDate(endDate, 1));
  const collection = db.collection(collectionName);
  const result = [];

  for (let skip = 0; skip < MAX_SCAN_SIZE; skip += PAGE_SIZE) {
    const res = await collection
      .where({
        [fieldName]: _.gte(startTime).and(_.lt(endTime)),
      })
      .orderBy(orderField, 'asc')
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

function isCollectionMissing(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('collection') && (message.includes('not exist') || message.includes('not exists'));
}

async function fetchOptionalByDateRange(collectionName, fieldName, startDate, endDate, orderField) {
  try {
    return await fetchByDateRange(collectionName, fieldName, startDate, endDate, orderField);
  } catch (error) {
    if (isCollectionMissing(error)) {
      return [];
    }
    throw error;
  }
}

async function fetchDailyStatRange(startDate, endDate) {
  const collection = db.collection(DAILY_STAT_COLLECTION);
  const result = [];

  for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
    const res = await collection
      .where({
        date: _.gte(startDate).and(_.lte(endDate)),
      })
      .orderBy('date', 'asc')
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

async function buildDailyCore(dateStr) {
  const behaviorList = await fetchByDateRange(USER_BEHAVIOR_COLLECTION, 'timestamp', dateStr, dateStr, 'timestamp');
  const activeUsers = new Set();
  let totalPlay = 0;

  for (const item of behaviorList) {
    if (item.openid) activeUsers.add(item.openid);
    if (item.eventName === 'game_start') totalPlay += 1;
  }

  const newUsers = await fetchProfilesByFirstLogin(dateStr);
  const cohort1 = await fetchProfilesByFirstLogin(shiftDate(dateStr, -1));
  const cohort3 = await fetchProfilesByFirstLogin(shiftDate(dateStr, -3));
  const cohort7 = await fetchProfilesByFirstLogin(shiftDate(dateStr, -7));

  return {
    date: dateStr,
    dau: activeUsers.size,
    newUser: newUsers.length,
    totalPlay,
    retain1: toPercent(cohort1.filter((item) => activeUsers.has(item.openid)).length, cohort1.length),
    retain3: toPercent(cohort3.filter((item) => activeUsers.has(item.openid)).length, cohort3.length),
    retain7: toPercent(cohort7.filter((item) => activeUsers.has(item.openid)).length, cohort7.length),
  };
}

function buildLevelTopLoss(records, topLimit) {
  const levelMap = new Map();

  for (const item of records) {
    const levelId = Math.floor(Number(item.levelId) || 0);
    if (!levelId) continue;
    if (!levelMap.has(levelId)) {
      levelMap.set(levelId, {
        levelId,
        totalTryCount: 0,
        totalSessionCount: 0,
        abandonedCount: 0,
        passCount: 0,
        failCount: 0,
        adReviveCount: 0,
      });
    }
    const stat = levelMap.get(levelId);
    if (isAbandonedLevelRecord(item)) {
      stat.abandonedCount += 1;
      continue;
    }
    stat.totalTryCount += Math.max(1, Math.floor(Number(item.tryCount) || 1));
    stat.totalSessionCount += 1;
    if (item.passStatus === true) stat.passCount += 1;
    if (item.passStatus !== true) stat.failCount += 1;
    if (item.useAdRevive === true) stat.adReviveCount += 1;
  }

  return Array.from(levelMap.values())
    .map((item) => ({
      levelId: item.levelId,
      tryCount: item.totalTryCount,
      passRate: toPercent(item.passCount, item.totalSessionCount),
      lossRate: toPercent(item.failCount, item.totalSessionCount),
      adUseRate: toPercent(item.adReviveCount, item.totalSessionCount),
      abandonedCount: item.abandonedCount,
    }))
    .sort((a, b) => {
      if (b.lossRate !== a.lossRate) return b.lossRate - a.lossRate;
      return b.tryCount - a.tryCount;
    })
    .slice(0, topLimit);
}

function buildAdConversion(behaviorList) {
  const statMap = new Map();
  let totalShowNum = 0;

  for (const item of behaviorList) {
    if (!['ad_show', 'ad_click', 'ad_finish'].includes(item.eventName)) continue;
    const adType = typeof item.adType === 'string' && item.adType.trim() ? item.adType.trim() : 'unknown';
    if (!statMap.has(adType)) {
      statMap.set(adType, {
        adType,
        showNum: 0,
        clickNum: 0,
        finishNum: 0,
        userSet: new Set(),
      });
    }
    const stat = statMap.get(adType);
    if (item.eventName === 'ad_show') {
      stat.showNum += 1;
      totalShowNum += 1;
    }
    if (item.eventName === 'ad_click') stat.clickNum += 1;
    if (item.eventName === 'ad_finish') stat.finishNum += 1;
    if (item.openid) stat.userSet.add(item.openid);
  }

  return Array.from(statMap.values())
    .map((item) => ({
      adType: item.adType,
      showNum: item.showNum,
      clickNum: item.clickNum,
      finishNum: item.finishNum,
      userNum: item.userSet.size,
      showShare: toPercent(item.showNum, totalShowNum),
      adShowRate: toPercent(item.showNum, item.clickNum),
      finishRate: toPercent(item.finishNum, item.showNum),
      finishPerClickRate: toPercent(item.finishNum, item.clickNum),
    }))
    .sort((a, b) => b.showNum - a.showNum);
}

function buildReviveAdFunnel(behaviorList) {
  const revivePages = new Set(['level_revive', 'pch_buffer_full_revive']);
  const eventNames = new Set(['revive_panel_show', 'ad_click', 'ad_show', 'ad_finish', 'revive_success']);
  const statMap = new Map();
  for (const item of behaviorList) {
    const page = typeof item.page === 'string' ? item.page.trim() : '';
    if (!revivePages.has(page) || !eventNames.has(item.eventName)) continue;
    const logicalLevelId = getBehaviorLogicalLevelId(item);
    if (!logicalLevelId) continue;
    const key = `${logicalLevelId}:${page}`;
    if (!statMap.has(key)) {
      statMap.set(key, {
        logicalLevelId,
        page,
        panelShowNum: 0,
        clickNum: 0,
        showNum: 0,
        finishNum: 0,
        reviveSuccessNum: 0,
        users: new Set(),
      });
    }
    const stat = statMap.get(key);
    if (item.eventName === 'revive_panel_show') stat.panelShowNum += 1;
    if (item.eventName === 'ad_click') stat.clickNum += 1;
    if (item.eventName === 'ad_show') stat.showNum += 1;
    if (item.eventName === 'ad_finish') stat.finishNum += 1;
    if (item.eventName === 'revive_success') stat.reviveSuccessNum += 1;
    if (item.openid) stat.users.add(item.openid);
  }
  return Array.from(statMap.values())
    .map((stat) => ({
      logicalLevelId: stat.logicalLevelId,
      page: stat.page,
      panelShowNum: stat.panelShowNum,
      clickNum: stat.clickNum,
      showNum: stat.showNum,
      finishNum: stat.finishNum,
      reviveSuccessNum: stat.reviveSuccessNum,
      userNum: stat.users.size,
      panelClickRate: toPercent(stat.clickNum, stat.panelShowNum),
      adShowRate: toPercent(stat.showNum, stat.clickNum),
      adFinishRate: toPercent(stat.finishNum, stat.showNum),
      reviveSuccessRate: toPercent(stat.reviveSuccessNum, stat.finishNum),
    }))
    .sort((a, b) => a.logicalLevelId - b.logicalLevelId || a.page.localeCompare(b.page));
}

function buildPchSkillUses(levelRecords) {
  const levelMap = new Map();
  for (const item of levelRecords) {
    if (item.gameplayMode !== 'pch_conveyor' || Number(item.gameplaySchemaVersion) !== 1) continue;
    const logicalLevelId = Math.max(0, Math.floor(Number(item.levelId) || 0));
    if (!logicalLevelId) continue;
    if (!levelMap.has(logicalLevelId)) {
      levelMap.set(logicalLevelId, { logicalLevelId, magnetUses: 0, brushUses: 0, freezeUses: 0 });
    }
    const row = levelMap.get(logicalLevelId);
    const stats = item.gameplayStats && typeof item.gameplayStats === 'object' ? item.gameplayStats : {};
    row.magnetUses += normalizeNonNegativeCount(stats.magnetUses);
    row.brushUses += normalizeNonNegativeCount(stats.brushUses);
    row.freezeUses += normalizeNonNegativeCount(stats.freezeUses);
  }
  return Array.from(levelMap.values()).sort((a, b) => a.logicalLevelId - b.logicalLevelId);
}

function buildFunnel(behaviorList) {
  const steps = [
    { key: 'game_start', label: '启动', users: new Set() },
    { key: 'enter_level', label: '进关卡', users: new Set() },
    { key: 'level_fail', label: '失败', users: new Set() },
    { key: 'ad_finish', label: '看广告', users: new Set() },
    { key: 'share_success', label: '分享', users: new Set() },
  ];

  const stepMap = new Map(steps.map((item) => [item.key, item]));
  const activeDayMap = new Map();

  for (const item of behaviorList) {
    if (item.openid && item.timestamp) {
      if (!activeDayMap.has(item.openid)) {
        activeDayMap.set(item.openid, new Set());
      }
      activeDayMap.get(item.openid).add(formatShanghaiDate(Number(item.timestamp) || 0));
    }

    const step = stepMap.get(item.eventName);
    if (step && item.openid) {
      step.users.add(item.openid);
    }
  }

  const retainedUsers = Array.from(activeDayMap.values()).filter((daySet) => daySet.size >= 2).length;
  const funnelList = steps.map((item, index) => {
    const userCount = item.users.size;
    const previous = index === 0 ? userCount : steps[index - 1].users.size;
    return {
      step: item.label,
      userCount,
      conversionRate: index === 0 ? (userCount > 0 ? 100 : 0) : toPercent(userCount, previous),
    };
  });

  funnelList.push({
    step: '留存',
    userCount: retainedUsers,
    conversionRate: toPercent(retainedUsers, steps[0].users.size),
  });

  return funnelList;
}

function normalizeFront10ExperimentBucket(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (text === 'base' || text === 'control' || text === 'a' || text === 'b' || text === 'bucket_a' || text === 'bucket_b') return 'base';
  if (text === 'exp' || text === 'treatment' || text === 'c' || text === 'd' || text === 'bucket_c' || text === 'bucket_d') return 'exp';
  return 'unknown';
}

function getBehaviorLogicalLevelId(item) {
  const candidates = [item?.logicalLevelId, item?.levelId, item?.physicalLevelId];
  for (const value of candidates) {
    const levelId = Math.floor(Number(value));
    if (Number.isFinite(levelId) && levelId > 0) return levelId;
  }
  return 0;
}

function getBehaviorUserKey(item) {
  return item?.openid || item?._openid || '';
}

function isFront10ExperimentRecord(item) {
  return String(item?.abId || '').trim() === FRONT10_EXPERIMENT_ID;
}

function normalizeNonNegativeCount(value) {
  const count = Math.floor(Number(value) || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function createFront10ExperimentLevelStat(logicalLevelId, abBucket) {
  return {
    logicalLevelId,
    abBucket,
    enterCount: 0,
    passCount: 0,
    failCount: 0,
    adShowCount: 0,
    adClickCount: 0,
    adFinishCount: 0,
    smartHintShowCount: 0,
    smartGuidedPassCount: 0,
    smartGuidedPassShownTotal: 0,
    users: new Set(),
    enterUsers: new Set(),
    passUsers: new Set(),
    failUsers: new Set(),
    adShowUsers: new Set(),
    adClickUsers: new Set(),
    adFinishUsers: new Set(),
    smartHintShowUsers: new Set(),
    smartGuidedPassUsers: new Set(),
  };
}

function buildFront10ExperimentStatKey(logicalLevelId, abBucket) {
  return `${logicalLevelId}:${abBucket}`;
}

function ensureFront10ExperimentLevelStat(statMap, logicalLevelId, abBucket) {
  const key = buildFront10ExperimentStatKey(logicalLevelId, abBucket);
  if (!statMap.has(key)) {
    statMap.set(key, createFront10ExperimentLevelStat(logicalLevelId, abBucket));
  }
  return statMap.get(key);
}

function addFront10ExperimentRecord(stat, item) {
  const eventName = typeof item?.eventName === 'string' ? item.eventName.trim() : '';
  const userKey = getBehaviorUserKey(item);
  const smartHintShownCount = normalizeNonNegativeCount(item?.smartHintShownCount);
  if (userKey) stat.users.add(userKey);

  if (eventName === 'enter_level') {
    stat.enterCount += 1;
    if (userKey) stat.enterUsers.add(userKey);
  } else if (eventName === 'level_pass') {
    stat.passCount += 1;
    if (userKey) stat.passUsers.add(userKey);
    if (smartHintShownCount > 0) {
      stat.smartGuidedPassCount += 1;
      stat.smartGuidedPassShownTotal += smartHintShownCount;
      if (userKey) stat.smartGuidedPassUsers.add(userKey);
    }
  } else if (eventName === 'level_fail') {
    stat.failCount += 1;
    if (userKey) stat.failUsers.add(userKey);
  } else if (eventName === 'smart_hint_show') {
    stat.smartHintShowCount += 1;
    if (userKey) stat.smartHintShowUsers.add(userKey);
  } else if (eventName === 'ad_show') {
    stat.adShowCount += 1;
    if (userKey) stat.adShowUsers.add(userKey);
  } else if (eventName === 'ad_click') {
    stat.adClickCount += 1;
    if (userKey) stat.adClickUsers.add(userKey);
  } else if (eventName === 'ad_finish') {
    stat.adFinishCount += 1;
    if (userKey) stat.adFinishUsers.add(userKey);
  }
}

function serializeFront10ExperimentLevelStat(stat) {
  return {
    logicalLevelId: stat.logicalLevelId,
    abBucket: stat.abBucket,
    userCount: stat.users.size,
    enterCount: stat.enterCount,
    enterUsers: stat.enterUsers.size,
    passCount: stat.passCount,
    passUsers: stat.passUsers.size,
    failCount: stat.failCount,
    failUsers: stat.failUsers.size,
    passRate: toPercent(stat.passUsers.size, stat.enterUsers.size),
    adShowCount: stat.adShowCount,
    adShowUsers: stat.adShowUsers.size,
    adClickCount: stat.adClickCount,
    adClickUsers: stat.adClickUsers.size,
    adFinishCount: stat.adFinishCount,
    adFinishUsers: stat.adFinishUsers.size,
    adFinishRate: toPercent(stat.adFinishCount, stat.adShowCount),
    adFinishPerEnterRate: toPercent(stat.adFinishUsers.size, stat.enterUsers.size),
    smartHintShowCount: stat.smartHintShowCount,
    smartHintShowUsers: stat.smartHintShowUsers.size,
    smartHintUsageRate: toPercent(stat.smartHintShowUsers.size, stat.enterUsers.size),
    smartGuidedPassCount: stat.smartGuidedPassCount,
    smartGuidedPassUsers: stat.smartGuidedPassUsers.size,
    smartGuidedPassRate: toPercent(stat.smartGuidedPassUsers.size, stat.passUsers.size),
    smartGuidedPassShownTotal: stat.smartGuidedPassShownTotal,
  };
}

function buildFront10ExperimentStats(behaviorList, opt = {}) {
  const maxLogicalLevelId = Math.max(1, Math.min(50, Math.floor(Number(opt.maxLogicalLevelId) || FRONT10_MAX_LEVEL_ID)));
  const statMap = new Map();

  for (const item of behaviorList) {
    const logicalLevelId = getBehaviorLogicalLevelId(item);
    if (logicalLevelId < 1 || logicalLevelId > maxLogicalLevelId) continue;

    addFront10ExperimentRecord(
      ensureFront10ExperimentLevelStat(statMap, logicalLevelId, 'all'),
      item,
    );

    const abBucket = isFront10ExperimentRecord(item)
      ? normalizeFront10ExperimentBucket(item.abBucket)
      : 'unknown';
    addFront10ExperimentRecord(
      ensureFront10ExperimentLevelStat(statMap, logicalLevelId, abBucket),
      item,
    );
  }

  const bucketOrder = new Map(FRONT10_BUCKETS.map((bucket, index) => [bucket, index]));
  const rows = Array.from(statMap.values())
    .map(serializeFront10ExperimentLevelStat)
    .filter((row) => row.userCount > 0 || row.enterCount > 0 || row.passCount > 0 || row.adShowCount > 0 || row.smartHintShowCount > 0)
    .sort((a, b) => {
      if (a.logicalLevelId !== b.logicalLevelId) return a.logicalLevelId - b.logicalLevelId;
      return (bucketOrder.get(a.abBucket) ?? 99) - (bucketOrder.get(b.abBucket) ?? 99);
    });

  return {
    experimentId: FRONT10_EXPERIMENT_ID,
    maxLogicalLevelId,
    buckets: FRONT10_BUCKETS,
    rows,
  };
}

function normalizeAbBucket(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (text === 'bucket_a') return 'bucket_a';
  if (text === 'bucket_b') return 'bucket_b';
  return 'unknown';
}

function getFunnelSessionKey(item) {
  return item.sessionId || item.openid || item._id || '';
}

function getFunnelLogicalLevelId(item) {
  const candidates = [item?.logicalLevelId, item?.levelId, item?.physicalLevelId];
  for (const value of candidates) {
    const num = Math.floor(Number(value));
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function shouldIncludeFunnelLevelRecord(item, logicalLevelId, includeSessionEvents = false) {
  if (!logicalLevelId) return true;
  const itemLevelId = getFunnelLogicalLevelId(item);
  if (itemLevelId === logicalLevelId) return true;
  return includeSessionEvents && itemLevelId === 0;
}

function createFirstLevelBucket(abBucket) {
  const stepMap = new Map(PCH_FUNNEL_STEPS.map((item) => [item.key, {
    key: item.key,
    label: item.label,
    users: new Set(),
    sessions: new Set(),
  }]));
  const diagnosticMap = new Map(PCH_FUNNEL_DIAGNOSTICS.map((item) => [item.key, {
    key: item.key,
    label: item.label,
    users: new Set(),
    sessions: new Set(),
  }]));
  return { abBucket, stepMap, diagnosticMap };
}

function addFunnelRecord(target, item, sessionKey, userKey) {
  const eventName = typeof item.eventName === 'string' ? item.eventName.trim() : '';
  const step = target.stepMap.get(eventName) || target.diagnosticMap.get(eventName);
  if (!step) return;
  step.sessions.add(sessionKey);
  if (userKey) step.users.add(userKey);
}

function serializeFirstLevelBucket(bucket) {
  let previousSessionCount = 0;
  const steps = PCH_FUNNEL_STEPS.map((item, index) => {
    const step = bucket.stepMap.get(item.key);
    const sessionCount = step ? step.sessions.size : 0;
    const userCount = step ? step.users.size : 0;
    const denominator = index === 0 ? sessionCount : previousSessionCount;
    const conversionRate = index === 0
      ? (sessionCount > 0 ? 100 : 0)
      : toPercent(sessionCount, denominator);
    previousSessionCount = sessionCount;
    return {
      key: item.key,
      step: item.label,
      userCount,
      sessionCount,
      conversionRate,
    };
  });

  const diagnostics = PCH_FUNNEL_DIAGNOSTICS.map((item) => {
    const step = bucket.diagnosticMap.get(item.key);
    return {
      key: item.key,
      step: item.label,
      userCount: step ? step.users.size : 0,
      sessionCount: step ? step.sessions.size : 0,
    };
  });

  return {
    abBucket: bucket.abBucket,
    steps,
    diagnostics,
  };
}

function buildFirstLevelFunnel(records, opt = {}) {
  const logicalLevelId = Math.max(0, Math.floor(Number(opt.logicalLevelId) || 0));
  const includeSessionEvents = opt.includeSessionEvents === true;
  const sessionBucketMap = new Map();
  for (const item of records) {
    if (item.eventName !== 'ab_assigned') continue;
    const sessionKey = getFunnelSessionKey(item);
    if (!sessionKey) continue;
    const bucket = normalizeAbBucket(item.abBucket);
    if (bucket === 'unknown') continue;
    sessionBucketMap.set(sessionKey, bucket);
  }

  const buckets = new Map([
    ['all', createFirstLevelBucket('all')],
    ['bucket_a', createFirstLevelBucket('bucket_a')],
    ['bucket_b', createFirstLevelBucket('bucket_b')],
    ['unknown', createFirstLevelBucket('unknown')],
  ]);

  for (const item of records) {
    const sessionKey = getFunnelSessionKey(item);
    if (!sessionKey) continue;
    if (!shouldIncludeFunnelLevelRecord(item, logicalLevelId, includeSessionEvents)) continue;
    const userKey = item.openid || '';
    const bucket = sessionBucketMap.get(sessionKey) || 'unknown';
    addFunnelRecord(buckets.get('all'), item, sessionKey, userKey);
    addFunnelRecord(buckets.get(bucket) || buckets.get('unknown'), item, sessionKey, userKey);
  }

  return {
    logicalLevelId,
    stepDefinitions: PCH_FUNNEL_STEPS,
    diagnosticDefinitions: PCH_FUNNEL_DIAGNOSTICS,
    groups: ['all', 'bucket_a', 'bucket_b', 'unknown'].map((key) => serializeFirstLevelBucket(buckets.get(key))),
  };
}

function buildOnboardingLevelFunnel(records) {
  return {
    stepDefinitions: PCH_FUNNEL_STEPS,
    diagnosticDefinitions: PCH_FUNNEL_DIAGNOSTICS,
    levels: [
      {
        logicalLevelId: 1,
        label: '第1关',
        groups: buildFirstLevelFunnel(records, { logicalLevelId: 1, includeSessionEvents: true }).groups,
      },
      {
        logicalLevelId: 2,
        label: '第2关',
        groups: buildFirstLevelFunnel(records, { logicalLevelId: 2 }).groups,
      },
      {
        logicalLevelId: 3,
        label: '第3关',
        groups: buildFirstLevelFunnel(records, { logicalLevelId: 3 }).groups,
      },
    ],
  };
}

exports.main = async (event = {}) => {
  const today = formatShanghaiDate(Date.now());
  const endDate = typeof event.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.endDate)
    ? event.endDate
    : today;
  const days = clampDays(event.days);
  const startDate = typeof event.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.startDate)
    ? event.startDate
    : shiftDate(endDate, -(days - 1));
  const topLimit = clampTopLimit(event.topLimit);

  try {
    const safeStartDate = startDate <= endDate ? startDate : endDate;
    const safeEndDate = startDate <= endDate ? endDate : startDate;
    const behaviorList = await fetchByDateRange(USER_BEHAVIOR_COLLECTION, 'timestamp', safeStartDate, safeEndDate, 'timestamp');
    const levelRecords = await fetchByDateRange(LEVEL_RECORD_COLLECTION, 'endTime', safeStartDate, safeEndDate, 'endTime');
    const firstLevelFunnelEvents = await fetchOptionalByDateRange(FIRST_LEVEL_FUNNEL_COLLECTION, 'timestamp', safeStartDate, safeEndDate, 'timestamp');
    const storedTrend = await fetchDailyStatRange(safeStartDate, safeEndDate);
    const storedMap = new Map(storedTrend.map((item) => [item.date, item]));
    const dailyTrend = [];

    for (const date of buildDateRange(safeStartDate, safeEndDate)) {
      if (storedMap.has(date)) {
        dailyTrend.push(storedMap.get(date));
      } else {
        dailyTrend.push(await buildDailyCore(date));
      }
    }

    const overview = await buildDailyCore(safeEndDate);

    return {
      ok: true,
      range: {
        startDate: safeStartDate,
        endDate: safeEndDate,
        days: dailyTrend.length,
      },
      overview,
      dailyTrend,
      levelTopLoss: buildLevelTopLoss(levelRecords, topLimit),
      adConversion: buildAdConversion(behaviorList),
      reviveAdFunnel: buildReviveAdFunnel(behaviorList),
      pchSkillUses: buildPchSkillUses(levelRecords),
      funnel: buildFunnel(behaviorList),
      front10ExperimentStats: buildFront10ExperimentStats(behaviorList),
      pchOnboardingFunnel: buildOnboardingLevelFunnel(firstLevelFunnelEvents),
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'getAllDashboardData failed',
    };
  }
};
