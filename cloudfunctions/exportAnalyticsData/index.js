const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const PAGE_SIZE_DEFAULT = 500;
const PAGE_SIZE_MAX = 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const COLLECTION_CONFIGS = {
  user_behavior: {
    queryMode: 'range',
    defaultQueryField: 'timestamp',
    allowedQueryFields: ['timestamp'],
    orderField: 'timestamp',
  },
  level_record: {
    queryMode: 'range',
    defaultQueryField: 'endTime',
    allowedQueryFields: ['endTime', 'startTime'],
    orderField: 'endTime',
  },
  ad_stat: {
    queryMode: 'exact',
    defaultQueryField: 'date',
    allowedQueryFields: ['date'],
    orderField: 'date',
  },
  daily_stat: {
    queryMode: 'exact',
    defaultQueryField: 'date',
    allowedQueryFields: ['date'],
    orderField: 'date',
  },
};

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

function resolvePageSize(value) {
  const parsed = Math.floor(Number(value) || PAGE_SIZE_DEFAULT);
  return Math.max(1, Math.min(PAGE_SIZE_MAX, parsed));
}

function resolveOffset(value) {
  const parsed = Math.floor(Number(value) || 0);
  return Math.max(0, parsed);
}

function resolveCollectionConfig(collectionName, queryField) {
  const config = COLLECTION_CONFIGS[collectionName];
  if (!config) {
    throw new Error(
      `unsupported collection: ${collectionName}. supported collections: ${Object.keys(COLLECTION_CONFIGS).join(', ')}`,
    );
  }

  const finalQueryField = queryField || config.defaultQueryField;
  if (!config.allowedQueryFields.includes(finalQueryField)) {
    throw new Error(
      `unsupported queryField: ${finalQueryField} for ${collectionName}. allowed: ${config.allowedQueryFields.join(', ')}`,
    );
  }

  return {
    ...config,
    queryField: finalQueryField,
  };
}

function buildQuery(queryMode, queryField, dateStr) {
  if (queryMode === 'exact') {
    return { [queryField]: dateStr };
  }

  const startTime = dateToTimestamp(dateStr);
  const endTime = startTime + ONE_DAY_MS;
  return {
    [queryField]: _.gte(startTime).and(_.lt(endTime)),
  };
}

exports.main = async (event = {}) => {
  try {
    const collectionName = typeof event.collection === 'string' ? event.collection.trim() : '';
    if (!collectionName) {
      throw new Error('missing collection');
    }

    const targetDate = resolveTargetDate(event);
    const config = resolveCollectionConfig(collectionName, event.queryField);
    const pageSize = resolvePageSize(event.pageSize);
    const offset = resolveOffset(event.offset);
    const query = buildQuery(config.queryMode, config.queryField, targetDate);

    const res = await db.collection(collectionName)
      .where(query)
      .orderBy(config.orderField, 'asc')
      .skip(offset)
      .limit(pageSize)
      .get();

    const list = Array.isArray(res.data) ? res.data : [];
    const hasMore = list.length === pageSize;

    return {
      ok: true,
      collection: collectionName,
      date: targetDate,
      queryMode: config.queryMode,
      queryField: config.queryField,
      offset,
      pageSize,
      count: list.length,
      hasMore,
      nextOffset: hasMore ? offset + list.length : null,
      items: list,
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'exportAnalyticsData failed',
    };
  }
};
