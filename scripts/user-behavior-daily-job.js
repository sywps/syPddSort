#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const CloudBase = require("@cloudbase/manager-node");

const DEFAULT_COLLECTION = "user_behavior";
const DEFAULT_DAILY_COLLECTIONS = [
  "user_behavior",
  "level_record",
  "ad_stat",
  "daily_stat",
  "first_level_funnel",
];
const DEFAULT_EXPORT_FUNCTION_NAME = "exportAnalyticsData";
const DEFAULT_API_PAGE_SIZE = 500;
const DATABASE_API_PAGE_SIZE = 1000;
const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const COLLECTION_CONFIGS = {
  user_behavior: {
    queryField: "timestamp",
    queryMode: "range",
    outputSlug: "user-behavior",
    title: "User Behavior Daily Report",
    analyze: analyzeUserBehaviorFile,
  },
  level_record: {
    queryField: "endTime",
    queryMode: "range",
    outputSlug: "level-record",
    title: "Level Record Daily Report",
    analyze: analyzeLevelRecordFile,
  },
  ad_stat: {
    queryField: "date",
    queryMode: "exact",
    outputSlug: "ad-stat",
    title: "Ad Stat Daily Report",
    analyze: analyzeAdStatFile,
  },
  daily_stat: {
    queryField: "date",
    queryMode: "exact",
    outputSlug: "daily-stat",
    title: "Daily Stat Report",
    analyze: analyzeDailyStatFile,
  },
  first_level_funnel: {
    queryField: "timestamp",
    queryMode: "range",
    outputSlug: "first-level-funnel",
    title: "First Level Funnel Daily Report",
    apiKeyExportMode: "database",
    analyze: analyzeFirstLevelFunnelFile,
  },
};

const FIRST_LEVEL_FUNNEL_STEPS = [
  "app_launch",
  "ab_assigned",
  "bootstrap_level_start",
  "first_level_json_loaded",
  "first_level_json_failed",
  "first_level_ui_ready",
  "tutorial_step_interactive_ready",
  "first_level_any_touch",
  "tutorial_layer_touch_start",
  "tutorial_step_first_touch",
  "tutorial_tap_result",
  "tutorial_fast_tap_ignored",
  "first_touch",
  "first_valid_select",
  "timer_started",
  "first_place_attempt",
  "first_place_success",
  "tutorial_step_show",
  "tutorial_step_done",
  "tutorial_wrong_tap",
  "tutorial_done",
  "level_pass",
  "level_fail",
  "app_hide",
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(argv) {
  const args = {
    pollMs: DEFAULT_POLL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--date" && next) {
      args.date = next;
      i += 1;
    } else if (token === "--input" && next) {
      args.input = next;
      i += 1;
    } else if (token === "--out-dir" && next) {
      args.outDir = next;
      i += 1;
    } else if (token === "--collection" && next) {
      args.collection = next;
      i += 1;
    } else if (token === "--collections" && next) {
      args.collections = next;
      i += 1;
    } else if (token === "--query-field" && next) {
      args.queryField = next;
      i += 1;
    } else if (token === "--poll-ms" && next) {
      args.pollMs = Number(next);
      i += 1;
    } else if (token === "--timeout-ms" && next) {
      args.timeoutMs = Number(next);
      i += 1;
    } else if (token === "--help" || token === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run analytics:daily -- --date 2026-05-24
  node scripts/user-behavior-daily-job.js --collection user_behavior --input ./database_export.json --date 2026-05-24

Environment variables:
  TCB_SECRET_ID   Tencent Cloud SecretId
  TCB_SECRET_KEY  Tencent Cloud SecretKey
  TCB_API_KEY     CloudBase server-side ApiKey for HTTP API mode
  TCB_ENV_ID      CloudBase envId, e.g. cloud1-d5gzq8ia0c404ee3e
  TCB_EXPORT_FUNCTION_NAME  Optional. Defaults to exportAnalyticsData
  TCB_API_BASE_URL Optional. Override HTTP API base URL if needed

Optional arguments:
  --date YYYY-MM-DD        Export and analyze one Shanghai calendar day. Defaults to yesterday.
  --input PATH             Skip export and analyze an existing NDJSON file. Single-collection only.
  --out-dir PATH           Override output directory.
  --collection NAME        Developer/debug only. One collection name, e.g. user_behavior or level_record.
  --collections A,B        Developer/debug only. Multiple collections.
  --query-field NAME       Override date field for single-collection exports.
  --poll-ms NUMBER         Export status polling interval. Defaults to 5000.
  --timeout-ms NUMBER      Export timeout. Defaults to 600000.
`);
}

function parseDateLabel(dateLabel) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLabel)) {
    throw new Error(`Invalid date format: ${dateLabel}. Expected YYYY-MM-DD`);
  }

  const [year, month, day] = dateLabel.split("-").map(Number);
  return { year, month, day };
}

function toShanghaiDayLabel(date = new Date()) {
  const shanghaiNow = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return shanghaiNow.toISOString().slice(0, 10);
}

function addDays(dateLabel, offsetDays) {
  const { year, month, day } = parseDateLabel(dateLabel);
  const utcDate = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return utcDate.toISOString().slice(0, 10);
}

function shanghaiDayRange(dateLabel) {
  const { year, month, day } = parseDateLabel(dateLabel);
  const startUtcMs = Date.UTC(year, month - 1, day) - SHANGHAI_OFFSET_MS;
  const endUtcMs = Date.UTC(year, month - 1, day + 1) - SHANGHAI_OFFSET_MS;
  return { startMs: startUtcMs, endMs: endUtcMs };
}

function getTargetDate(dateArg) {
  if (dateArg) {
    return dateArg;
  }
  return addDays(toShanghaiDayLabel(new Date()), -1);
}

function buildCollectionQueryObject(queryField, queryMode, dateLabel) {
  if (queryMode === "exact") {
    return {
      [queryField]: dateLabel,
    };
  }
  const { startMs, endMs } = shanghaiDayRange(dateLabel);
  return {
    [queryField]: {
      $gte: startMs,
      $lt: endMs,
    },
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createManager() {
  const secretId = requireEnv("TCB_SECRET_ID");
  const secretKey = requireEnv("TCB_SECRET_KEY");
  const envId = requireEnv("TCB_ENV_ID");
  const manager = new CloudBase({
    secretId,
    secretKey,
    envId,
  });
  return {
    manager,
    envId,
  };
}

function createApiKeyBundle() {
  const envId = requireEnv("TCB_ENV_ID");
  const apiKey = requireEnv("TCB_API_KEY");
  const functionName =
    process.env.TCB_EXPORT_FUNCTION_NAME || DEFAULT_EXPORT_FUNCTION_NAME;
  const baseUrl =
    process.env.TCB_API_BASE_URL ||
    `https://${envId}.api.tcloudbasegateway.com`;

  return {
    mode: "apiKey",
    envId,
    apiKey,
    functionName,
    baseUrl,
  };
}

function createExportClient() {
  if (process.env.TCB_API_KEY) {
    return createApiKeyBundle();
  }

  const managerBundle = createManager();
  return {
    mode: "manager",
    ...managerBundle,
  };
}

function normalizeCollectionNames(args) {
  let names = [];
  if (args.collections) {
    names = args.collections.split(",").map((item) => item.trim()).filter(Boolean);
  } else if (args.collection) {
    names = [args.collection];
  } else if (args.input) {
    names = [DEFAULT_COLLECTION];
  } else {
    names = [...DEFAULT_DAILY_COLLECTIONS];
  }

  if (!names.length) {
    throw new Error("No collections were specified");
  }

  for (const name of names) {
    if (!COLLECTION_CONFIGS[name]) {
      throw new Error(
        `Unsupported collection: ${name}. Supported collections: ${Object.keys(COLLECTION_CONFIGS).join(", ")}`,
      );
    }
  }

  return names;
}

function getDefaultOutputDir(dateLabel, collectionNames) {
  if (collectionNames.length === 1) {
    const slug = COLLECTION_CONFIGS[collectionNames[0]].outputSlug;
    return path.join("artifacts", `cloudbase-${slug}`, dateLabel);
  }
  return path.join("artifacts", "cloudbase-daily-report", dateLabel);
}

async function waitForExport(database, jobId, pollMs, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await database.migrateStatus(jobId);
    if (status.Status === "success") {
      return status;
    }
    if (status.Status === "fail") {
      throw new Error(`Export failed: ${status.ErrorMsg || "unknown error"}`);
    }
    await wait(pollMs);
  }

  throw new Error(`Export timed out after ${timeoutMs}ms`);
}

async function downloadToFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
}

function unwrapFunctionResult(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function parseDatabaseValue(value) {
  if (Array.isArray(value)) {
    return value.map(parseDatabaseValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Object.prototype.hasOwnProperty.call(value, "$numberInt")) {
    return Number(value.$numberInt);
  }
  if (Object.prototype.hasOwnProperty.call(value, "$numberLong")) {
    return Number(value.$numberLong);
  }
  if (Object.prototype.hasOwnProperty.call(value, "$numberDouble")) {
    return Number(value.$numberDouble);
  }
  if (Object.prototype.hasOwnProperty.call(value, "$date")) {
    const raw = value.$date;
    if (raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "$numberLong")) {
      return Number(raw.$numberLong);
    }
    return raw;
  }
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    output[key] = parseDatabaseValue(raw);
  }
  return output;
}

function toDebugSnippet(value) {
  if (value == null) {
    return "null";
  }

  const text =
    typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function isObjectLike(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractFunctionResultPayload(body) {
  const queue = [body];
  const visited = new Set();

  while (queue.length > 0) {
    const current = unwrapFunctionResult(queue.shift());
    if (
      current == null ||
      typeof current === "number" ||
      typeof current === "boolean"
    ) {
      continue;
    }

    const identity =
      isObjectLike(current) || Array.isArray(current) ? current : null;
    if (identity && visited.has(identity)) {
      continue;
    }
    if (identity) {
      visited.add(identity);
    }

    if (isObjectLike(current)) {
      if (
        Object.prototype.hasOwnProperty.call(current, "ok") ||
        Object.prototype.hasOwnProperty.call(current, "items") ||
        Object.prototype.hasOwnProperty.call(current, "collection")
      ) {
        return current;
      }

      queue.push(current.result);
      queue.push(current.data);
      queue.push(current.response_data);
      queue.push(current.responseData);
      queue.push(current.body);
    }
  }

  return null;
}

async function callCloudFunction(apiKeyBundle, payload) {
  const response = await fetch(
    `${apiKeyBundle.baseUrl}/v1/functions/${encodeURIComponent(
      apiKeyBundle.functionName,
    )}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKeyBundle.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const rawText = await response.text();
  let body = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    body = rawText;
  }

  if (!response.ok) {
    const message =
      (body && (body.message || body.code)) ||
      toDebugSnippet(body) ||
      `HTTP ${response.status} ${response.statusText}`;
    throw new Error(`CloudBase function call failed: ${message}`);
  }

  const result = extractFunctionResultPayload(body);
  if (!result || typeof result !== "object") {
    throw new Error(
      `CloudBase function returned an invalid result payload: ${toDebugSnippet(body)}`,
    );
  }
  if (result.ok !== true) {
    throw new Error(
      `CloudBase function returned an error: ${result.errorMessage || "unknown error"}`,
    );
  }

  return {
    rawBody: body,
    result,
  };
}

async function exportCollectionForDay({
  collection,
  queryField,
  queryMode,
  dateLabel,
  outputDir,
  pollMs,
  timeoutMs,
  managerBundle,
}) {
  const { manager, envId } = managerBundle;
  const query = JSON.stringify(buildCollectionQueryObject(queryField, queryMode, dateLabel));

  const objectKey = `exports/${collection}/${dateLabel}/${collection}-${dateLabel}.json`;
  const localFileName = `database_export-${envId}-${collection}-${dateLabel}.json`;
  const localPath = path.join(outputDir, localFileName);

  const exportResult = await manager.database.export(
    collection,
    { ObjectKey: objectKey },
    {
      FileType: "json",
      Query: query,
    },
  );

  const jobId = exportResult.JobId;
  if (!jobId) {
    throw new Error("Export did not return a JobId");
  }

  const finalStatus = await waitForExport(
    manager.database,
    jobId,
    pollMs,
    timeoutMs,
  );

  if (!finalStatus.FileUrl) {
    throw new Error("Export completed but FileUrl was empty");
  }

  await downloadToFile(finalStatus.FileUrl, localPath);

  return {
    envId,
    collection,
    dateLabel,
    queryField,
    query,
    jobId,
    objectKey,
    localPath,
    recordSuccess: finalStatus.RecordSuccess,
  };
}

async function exportCollectionViaApiKeyForDay({
  collection,
  queryField,
  queryMode,
  dateLabel,
  outputDir,
  apiKeyBundle,
}) {
  const localFileName = `database_export-${apiKeyBundle.envId}-${collection}-${dateLabel}.json`;
  const localPath = path.join(outputDir, localFileName);
  let offset = 0;
  let pageCount = 0;
  let totalRecords = 0;

  fs.writeFileSync(localPath, "");

  while (true) {
    const { result } = await callCloudFunction(apiKeyBundle, {
      collection,
      date: dateLabel,
      queryField,
      pageSize: DEFAULT_API_PAGE_SIZE,
      offset,
    });

    const items = Array.isArray(result.items) ? result.items : [];
    if (items.length > 0) {
      const chunk = items.map((item) => JSON.stringify(item)).join("\n");
      fs.appendFileSync(localPath, `${chunk}\n`);
    }

    pageCount += 1;
    totalRecords += items.length;

    if (!result.hasMore) {
      break;
    }

    if (!Number.isInteger(result.nextOffset) || result.nextOffset <= offset) {
      throw new Error("CloudBase function returned an invalid nextOffset");
    }
    offset = result.nextOffset;
  }

  return {
    mode: "apiKey",
    envId: apiKeyBundle.envId,
    collection,
    dateLabel,
    queryField,
    queryMode,
    localPath,
    functionName: apiKeyBundle.functionName,
    baseUrl: apiKeyBundle.baseUrl,
    pageCount,
    totalRecords,
  };
}

async function exportCollectionViaDatabaseApiForDay({
  collection,
  queryField,
  queryMode,
  dateLabel,
  outputDir,
  apiKeyBundle,
}) {
  const localFileName = `database_export-${apiKeyBundle.envId}-${collection}-${dateLabel}.json`;
  const localPath = path.join(outputDir, localFileName);
  const query = buildCollectionQueryObject(queryField, queryMode, dateLabel);
  const sort = queryMode === "range" ? { [queryField]: 1 } : {};
  let offset = 0;
  let pageCount = 0;
  let totalRecords = 0;

  fs.writeFileSync(localPath, "");

  while (true) {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(DATABASE_API_PAGE_SIZE),
      query: JSON.stringify(query),
      sort: JSON.stringify(sort),
    });
    const url = `${apiKeyBundle.baseUrl}/v1/database/instances/(default)/databases/(default)/collections/${encodeURIComponent(collection)}/documents?${params}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKeyBundle.apiKey}`,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (error) {
      body = text;
    }
    if (!response.ok) {
      const message =
        (body && (body.message || body.code)) ||
        toDebugSnippet(body) ||
        `HTTP ${response.status} ${response.statusText}`;
      throw new Error(`CloudBase database query failed for ${collection}: ${message}`);
    }

    const items = Array.isArray(body?.list) ? body.list.map(parseDatabaseValue) : [];
    if (items.length > 0) {
      const chunk = items.map((item) => JSON.stringify(item)).join("\n");
      fs.appendFileSync(localPath, `${chunk}\n`);
    }
    pageCount += 1;
    totalRecords += items.length;
    if (pageCount === 1 || pageCount % 25 === 0) {
      console.log(`[${collection}] fetched ${totalRecords} records`);
    }
    if (items.length < DATABASE_API_PAGE_SIZE) {
      break;
    }
    offset += DATABASE_API_PAGE_SIZE;
  }

  return {
    mode: "apiKeyDatabase",
    envId: apiKeyBundle.envId,
    collection,
    dateLabel,
    queryField,
    queryMode,
    localPath,
    baseUrl: apiKeyBundle.baseUrl,
    pageCount,
    totalRecords,
  };
}

function writeCsv(filePath, headers, rows) {
  const escapeCell = (value) => {
    const stringValue = value == null ? "" : String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function loadNdjsonRecords(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Failed to parse NDJSON line in ${inputPath}: ${error.message}`);
      }
    });
}

function sortObjectByValueDesc(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}

function numberValue(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function ratio(numerator, denominator) {
  const base = numberValue(denominator);
  if (!base) {
    return 0;
  }
  return Number((numberValue(numerator) / base).toFixed(4));
}

function fixedNumber(value, digits = 2) {
  return Number(numberValue(value).toFixed(digits));
}

function percentText(value) {
  return `${(numberValue(value) * 100).toFixed(1)}%`;
}

function integerText(value) {
  return String(Math.round(numberValue(value)));
}

function getSessionKey(record) {
  return record.sessionId || record.openid || record._id || "";
}

function topMapEntries(map, limit = 20) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function addDetailStat(map, key, sessionKey, userKey) {
  if (!map.has(key)) {
    map.set(key, { key, records: 0, sessions: new Set(), users: new Set() });
  }
  const stat = map.get(key);
  stat.records += 1;
  if (sessionKey) {
    stat.sessions.add(sessionKey);
  }
  if (userKey) {
    stat.users.add(userKey);
  }
}

function topDetailEntries(map, limit = 20) {
  return [...map.values()]
    .sort((a, b) => b.records - a.records)
    .slice(0, limit)
    .map((stat) => ({
      key: stat.key,
      records: stat.records,
      sessions: stat.sessions.size,
      users: stat.users.size,
    }));
}

function quantileSeconds(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) {
    return { count: 0, p50: 0, p75: 0, p90: 0, p95: 0 };
  }
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
  return {
    count: sorted.length,
    p50: fixedNumber(pick(0.5) / 1000, 2),
    p75: fixedNumber(pick(0.75) / 1000, 2),
    p90: fixedNumber(pick(0.9) / 1000, 2),
    p95: fixedNumber(pick(0.95) / 1000, 2),
  };
}

function markdownTable(headers, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const headerLine = `| ${headers.join(" | ")} |`;
  const splitLine = `| ${headers.map(() => "---").join(" | ")} |`;
  if (!safeRows.length) {
    return [headerLine, splitLine, `| ${["暂无数据", ...headers.slice(1).map(() => "")].join(" | ")} |`].join("\n");
  }
  return [
    headerLine,
    splitLine,
    ...safeRows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");
}

function buildAdEventBreakdown(records) {
  const adStats = new Map();

  for (const record of records) {
    const eventName = record.eventName || "";
    if (!["ad_show", "ad_click", "ad_finish"].includes(eventName)) {
      continue;
    }

    const adType =
      typeof record.adType === "string" && record.adType.trim()
        ? record.adType.trim()
        : "unknown";
    const page =
      typeof record.page === "string" && record.page.trim()
        ? record.page.trim()
        : "unknown";
    const label =
      page && page !== "unknown"
        ? (adType.includes(`:${page}`) ? page : `${adType} · ${page}`)
        : adType;
    const key = `${adType}|${page}`;

    if (!adStats.has(key)) {
      adStats.set(key, {
        adType,
        page,
        label,
        showNum: 0,
        clickNum: 0,
        finishNum: 0,
        userSet: new Set(),
      });
    }

    const stat = adStats.get(key);
    if (eventName === "ad_show") {
      stat.showNum += 1;
    } else if (eventName === "ad_click") {
      stat.clickNum += 1;
    } else if (eventName === "ad_finish") {
      stat.finishNum += 1;
    }
    if (record.openid) {
      stat.userSet.add(record.openid);
    }
  }

  const rows = [...adStats.values()]
    .map((stat) => ({
      adType: stat.adType,
      page: stat.page,
      label: stat.label,
      showNum: stat.showNum,
      clickNum: stat.clickNum,
      finishNum: stat.finishNum,
      userNum: stat.userSet.size,
      clickRate: stat.showNum ? Number((stat.clickNum / stat.showNum).toFixed(4)) : 0,
      finishRate: stat.showNum ? Number((stat.finishNum / stat.showNum).toFixed(4)) : 0,
      finishPerClickRate: stat.clickNum
        ? Number((stat.finishNum / stat.clickNum).toFixed(4))
        : 0,
    }))
    .sort((a, b) => {
      if (b.showNum !== a.showNum) {
        return b.showNum - a.showNum;
      }
      return a.label.localeCompare(b.label);
    });

  return rows;
}

function getAdDisplayLabel(row) {
  if (row && typeof row.label === "string" && row.label.trim()) {
    return row.label.trim();
  }
  if (row && typeof row.page === "string" && row.page.trim() && row.page !== "all") {
    return row.page.trim();
  }
  if (row && typeof row.adType === "string" && row.adType.trim()) {
    return row.adType.trim();
  }
  return "unknown";
}

function analyzeUserBehaviorFile({
  inputPath,
  outputDir,
  dateLabel,
  collection,
  envId,
}) {
  const records = loadNdjsonRecords(inputPath);
  const eventCounts = new Map();
  const pageCounts = new Map();
  const enterPv = new Map();
  const passPv = new Map();
  const failPv = new Map();
  const enterUv = new Map();
  const passUv = new Map();
  const failUv = new Map();

  const uniqueUsers = new Set();
  const startUsers = new Set();
  const enterUsers = new Set();
  const passUsers = new Set();
  const adUsers = new Set();
  const levelZeroRecords = [];
  const specialLevelUsers = new Set();

  for (const record of records) {
    const eventName = record.eventName || "";
    const page = record.page || "";
    const levelId = Number.isInteger(record.levelId) ? record.levelId : null;
    const openid = record.openid || "";

    eventCounts.set(eventName, (eventCounts.get(eventName) || 0) + 1);
    pageCounts.set(page, (pageCounts.get(page) || 0) + 1);

    if (openid) {
      uniqueUsers.add(openid);
      if (eventName === "game_start") {
        startUsers.add(openid);
      }
      if (eventName === "enter_level") {
        enterUsers.add(openid);
      }
      if (eventName === "level_pass") {
        passUsers.add(openid);
      }
      if (eventName === "ad_show") {
        adUsers.add(openid);
      }
    }

    if (levelId === 0) {
      levelZeroRecords.push(record);
    }

    if (levelId != null && levelId >= 1000 && openid) {
      specialLevelUsers.add(openid);
    }

    if (levelId == null || levelId < 1) {
      continue;
    }

    if (eventName === "enter_level") {
      enterPv.set(levelId, (enterPv.get(levelId) || 0) + 1);
      if (!enterUv.has(levelId)) {
        enterUv.set(levelId, new Set());
      }
      if (openid) {
        enterUv.get(levelId).add(openid);
      }
    } else if (eventName === "level_pass") {
      passPv.set(levelId, (passPv.get(levelId) || 0) + 1);
      if (!passUv.has(levelId)) {
        passUv.set(levelId, new Set());
      }
      if (openid) {
        passUv.get(levelId).add(openid);
      }
    } else if (eventName === "level_fail") {
      failPv.set(levelId, (failPv.get(levelId) || 0) + 1);
      if (!failUv.has(levelId)) {
        failUv.set(levelId, new Set());
      }
      if (openid) {
        failUv.get(levelId).add(openid);
      }
    }
  }

  const levels = Array.from(
    new Set([...enterPv.keys(), ...passPv.keys(), ...failPv.keys()]),
  ).sort((a, b) => a - b);

  const levelRows = levels.map((levelId) => {
    const enterUvCount = enterUv.has(levelId) ? enterUv.get(levelId).size : 0;
    const passUvCount = passUv.has(levelId) ? passUv.get(levelId).size : 0;
    const failUvCount = failUv.has(levelId) ? failUv.get(levelId).size : 0;
    const enterPvCount = enterPv.get(levelId) || 0;
    const passPvCount = passPv.get(levelId) || 0;
    const failPvCount = failPv.get(levelId) || 0;
    return {
      levelId,
      enterUv: enterUvCount,
      passUv: passUvCount,
      failUv: failUvCount,
      enterPv: enterPvCount,
      passPv: passPvCount,
      failPv: failPvCount,
      uvPassRate: enterUvCount ? passUvCount / enterUvCount : 0,
      pvPassRate: enterPvCount ? passPvCount / enterPvCount : 0,
    };
  });

  const lowPassLevels = levelRows
    .filter((row) => row.enterUv >= 10)
    .sort((a, b) => {
      if (a.uvPassRate !== b.uvPassRate) {
        return a.uvPassRate - b.uvPassRate;
      }
      return b.enterUv - a.enterUv;
    })
    .slice(0, 10);

  const topEnteredLevels = [...levelRows]
    .sort((a, b) => b.enterUv - a.enterUv)
    .slice(0, 10);

  const topFailedLevels = [...levelRows]
    .sort((a, b) => b.failPv - a.failPv)
    .slice(0, 10);
  const adEventBreakdown = buildAdEventBreakdown(records);

  const eventCountObject = sortObjectByValueDesc(eventCounts);
  const pageCountObject = sortObjectByValueDesc(pageCounts);

  const levelOne = levelRows.find((row) => row.levelId === 1) || {
    enterUv: 0,
    passUv: 0,
    failUv: 0,
    enterPv: 0,
  };

  const summary = {
    date: dateLabel,
    envId,
    collection,
    inputPath,
    totalRecords: records.length,
    uniqueUsers: uniqueUsers.size,
    startUsers: startUsers.size,
    enterUsers: enterUsers.size,
    passUsers: passUsers.size,
    adUsers: adUsers.size,
    levelOneEnterUv: levelOne.enterUv,
    levelOnePassUv: levelOne.passUv,
    levelOneFailUv: levelOne.failUv,
    levelOneUvPassRate: levelOne.enterUv
      ? Number((levelOne.passUv / levelOne.enterUv).toFixed(4))
      : 0,
    levelZeroRecordCount: levelZeroRecords.length,
    specialLevelUserCount: specialLevelUsers.size,
    eventCounts: eventCountObject,
    pageCounts: pageCountObject,
    adEventBreakdown,
    levelRows,
    lowPassLevels,
    topEnteredLevels,
    topFailedLevels,
  };

  const jsonPath = path.join(outputDir, "summary.json");
  const markdownPath = path.join(outputDir, "report.md");
  const csvPath = path.join(outputDir, "level_summary.csv");

  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);

  const markdown = [
    `# ${COLLECTION_CONFIGS[collection].title}`,
    ``,
    `- Date: ${dateLabel}`,
    `- Environment: ${envId || "unknown"}`,
    `- Collection: ${collection}`,
    `- Source file: ${inputPath}`,
    ``,
    `## Overview`,
    ``,
    `- Total records: ${summary.totalRecords}`,
    `- Unique users: ${summary.uniqueUsers}`,
    `- Users with game_start: ${summary.startUsers}`,
    `- Users with enter_level: ${summary.enterUsers}`,
    `- Users with any level_pass: ${summary.passUsers}`,
    `- Users with ad_show: ${summary.adUsers}`,
    ``,
    `## Level 1`,
    ``,
    `- Enter UV: ${summary.levelOneEnterUv}`,
    `- Pass UV: ${summary.levelOnePassUv}`,
    `- Fail UV: ${summary.levelOneFailUv}`,
    `- UV pass rate: ${(summary.levelOneUvPassRate * 100).toFixed(1)}%`,
    ``,
    `## Main issues`,
    ``,
    ...summary.lowPassLevels.map(
      (row) =>
        `- Level ${row.levelId}: enter UV ${row.enterUv}, pass UV ${row.passUv}, fail PV ${row.failPv}, UV pass rate ${(row.uvPassRate * 100).toFixed(1)}%`,
    ),
    ``,
    `## Top entered levels`,
    ``,
    ...summary.topEnteredLevels.map(
      (row) =>
        `- Level ${row.levelId}: enter UV ${row.enterUv}, pass UV ${row.passUv}, fail UV ${row.failUv}`,
    ),
    ``,
    `## Notes`,
    ``,
    `- levelId=0 records: ${summary.levelZeroRecordCount}`,
    `- levelId>=1000 users: ${summary.specialLevelUserCount}`,
    `- Event counts: ${JSON.stringify(summary.eventCounts)}`,
    `- Page counts: ${JSON.stringify(summary.pageCounts)}`,
    ``,
  ].join("\n");

  fs.writeFileSync(markdownPath, `${markdown}\n`);

  writeCsv(
    csvPath,
    [
      "levelId",
      "enterUv",
      "passUv",
      "failUv",
      "enterPv",
      "passPv",
      "failPv",
      "uvPassRate",
      "pvPassRate",
    ],
    levelRows.map((row) => [
      row.levelId,
      row.enterUv,
      row.passUv,
      row.failUv,
      row.enterPv,
      row.passPv,
      row.failPv,
      row.uvPassRate.toFixed(4),
      row.pvPassRate.toFixed(4),
    ]),
  );

  return {
    summary,
    files: {
      jsonPath,
      markdownPath,
      csvPath,
    },
  };
}

function analyzeLevelRecordFile({
  inputPath,
  outputDir,
  dateLabel,
  collection,
  envId,
}) {
  const records = loadNdjsonRecords(inputPath);
  const uniqueUsers = new Set();
  const passUsers = new Set();
  const adReviveUsers = new Set();
  const shareReviveUsers = new Set();
  const specialLevelUsers = new Set();
  const levelStats = new Map();

  let passRounds = 0;
  let failRounds = 0;
  let adReviveRounds = 0;
  let shareReviveRounds = 0;
  let totalTryCount = 0;
  let totalDurationSeconds = 0;
  let durationCount = 0;

  for (const record of records) {
    const openid = record.openid || "";
    const levelId = Number.isInteger(record.levelId) ? record.levelId : null;
    const tryCount = Number(record.tryCount) || 0;
    const passStatus = Number(record.passStatus) || 0;
    const useAdRevive = Boolean(record.useAdRevive);
    const useShareRevive = Boolean(record.useShareRevive);
    const startTime = Number(record.startTime) || 0;
    const endTime = Number(record.endTime) || 0;
    const durationSeconds =
      startTime > 0 && endTime > startTime
        ? (endTime - startTime) / 1000
        : null;

    if (openid) {
      uniqueUsers.add(openid);
      if (passStatus) {
        passUsers.add(openid);
      }
      if (useAdRevive) {
        adReviveUsers.add(openid);
      }
      if (useShareRevive) {
        shareReviveUsers.add(openid);
      }
    }

    if (levelId != null && levelId >= 1000 && openid) {
      specialLevelUsers.add(openid);
    }

    if (passStatus) {
      passRounds += 1;
    } else {
      failRounds += 1;
    }

    if (useAdRevive) {
      adReviveRounds += 1;
    }
    if (useShareRevive) {
      shareReviveRounds += 1;
    }

    totalTryCount += tryCount;
    if (durationSeconds != null) {
      totalDurationSeconds += durationSeconds;
      durationCount += 1;
    }

    if (levelId == null || levelId < 1) {
      continue;
    }

    if (!levelStats.has(levelId)) {
      levelStats.set(levelId, {
        levelId,
        uniqueUsers: new Set(),
        recordCount: 0,
        passCount: 0,
        failCount: 0,
        adReviveCount: 0,
        shareReviveCount: 0,
        tryCountSum: 0,
        durationSecondsSum: 0,
        durationCount: 0,
      });
    }

    const row = levelStats.get(levelId);
    row.recordCount += 1;
    row.tryCountSum += tryCount;
    if (openid) {
      row.uniqueUsers.add(openid);
    }
    if (passStatus) {
      row.passCount += 1;
    } else {
      row.failCount += 1;
    }
    if (useAdRevive) {
      row.adReviveCount += 1;
    }
    if (useShareRevive) {
      row.shareReviveCount += 1;
    }
    if (durationSeconds != null) {
      row.durationSecondsSum += durationSeconds;
      row.durationCount += 1;
    }
  }

  const levelRows = [...levelStats.values()]
    .map((row) => ({
      levelId: row.levelId,
      uniqueUsers: row.uniqueUsers.size,
      recordCount: row.recordCount,
      passCount: row.passCount,
      failCount: row.failCount,
      passRate: row.recordCount ? row.passCount / row.recordCount : 0,
      adReviveCount: row.adReviveCount,
      shareReviveCount: row.shareReviveCount,
      avgTryCount: row.recordCount ? row.tryCountSum / row.recordCount : 0,
      avgDurationSeconds: row.durationCount
        ? row.durationSecondsSum / row.durationCount
        : 0,
    }))
    .sort((a, b) => a.levelId - b.levelId);

  const topRetryLevels = [...levelRows]
    .filter((row) => row.recordCount >= 5)
    .sort((a, b) => {
      if (b.avgTryCount !== a.avgTryCount) {
        return b.avgTryCount - a.avgTryCount;
      }
      return b.recordCount - a.recordCount;
    })
    .slice(0, 10);

  const lowPassLevels = [...levelRows]
    .filter((row) => row.recordCount >= 5)
    .sort((a, b) => {
      if (a.passRate !== b.passRate) {
        return a.passRate - b.passRate;
      }
      return b.recordCount - a.recordCount;
    })
    .slice(0, 10);

  const topAdReviveLevels = [...levelRows]
    .filter((row) => row.adReviveCount > 0)
    .sort((a, b) => b.adReviveCount - a.adReviveCount)
    .slice(0, 10);

  const levelOne = levelRows.find((row) => row.levelId === 1) || {
    uniqueUsers: 0,
    recordCount: 0,
    passCount: 0,
    failCount: 0,
    passRate: 0,
    avgTryCount: 0,
    avgDurationSeconds: 0,
  };

  const summary = {
    date: dateLabel,
    envId,
    collection,
    inputPath,
    totalRecords: records.length,
    uniqueUsers: uniqueUsers.size,
    passUsers: passUsers.size,
    passRounds,
    failRounds,
    passRate: records.length ? Number((passRounds / records.length).toFixed(4)) : 0,
    adReviveUsers: adReviveUsers.size,
    shareReviveUsers: shareReviveUsers.size,
    adReviveRounds,
    shareReviveRounds,
    avgTryCount: records.length ? Number((totalTryCount / records.length).toFixed(4)) : 0,
    avgDurationSeconds: durationCount
      ? Number((totalDurationSeconds / durationCount).toFixed(2))
      : 0,
    uniqueLevelCount: levelRows.length,
    specialLevelUserCount: specialLevelUsers.size,
    levelOneRecordCount: levelOne.recordCount,
    levelOnePassCount: levelOne.passCount,
    levelOneFailCount: levelOne.failCount,
    levelOnePassRate: Number(levelOne.passRate.toFixed(4)),
    levelOneAvgTryCount: Number(levelOne.avgTryCount.toFixed(4)),
    levelOneAvgDurationSeconds: Number(levelOne.avgDurationSeconds.toFixed(2)),
    levelRows,
    lowPassLevels,
    topRetryLevels,
    topAdReviveLevels,
  };

  const jsonPath = path.join(outputDir, "summary.json");
  const markdownPath = path.join(outputDir, "report.md");
  const csvPath = path.join(outputDir, "level_summary.csv");

  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);

  const markdown = [
    `# ${COLLECTION_CONFIGS[collection].title}`,
    ``,
    `- Date: ${dateLabel}`,
    `- Environment: ${envId || "unknown"}`,
    `- Collection: ${collection}`,
    `- Source file: ${inputPath}`,
    ``,
    `## Overview`,
    ``,
    `- Total records: ${summary.totalRecords}`,
    `- Unique users: ${summary.uniqueUsers}`,
    `- Pass users: ${summary.passUsers}`,
    `- Pass rounds: ${summary.passRounds}`,
    `- Fail rounds: ${summary.failRounds}`,
    `- Pass rate: ${(summary.passRate * 100).toFixed(1)}%`,
    `- Ad revive users: ${summary.adReviveUsers}`,
    `- Share revive users: ${summary.shareReviveUsers}`,
    `- Avg try count: ${summary.avgTryCount.toFixed(2)}`,
    `- Avg duration: ${summary.avgDurationSeconds.toFixed(2)}s`,
    ``,
    `## Level 1`,
    ``,
    `- Record count: ${summary.levelOneRecordCount}`,
    `- Pass count: ${summary.levelOnePassCount}`,
    `- Fail count: ${summary.levelOneFailCount}`,
    `- Pass rate: ${(summary.levelOnePassRate * 100).toFixed(1)}%`,
    `- Avg try count: ${summary.levelOneAvgTryCount.toFixed(2)}`,
    `- Avg duration: ${summary.levelOneAvgDurationSeconds.toFixed(2)}s`,
    ``,
    `## Low pass levels`,
    ``,
    ...summary.lowPassLevels.map(
      (row) =>
        `- Level ${row.levelId}: records ${row.recordCount}, pass rate ${(row.passRate * 100).toFixed(1)}%, avg try ${row.avgTryCount.toFixed(2)}, ad revive ${row.adReviveCount}`,
    ),
    ``,
    `## High retry levels`,
    ``,
    ...summary.topRetryLevels.map(
      (row) =>
        `- Level ${row.levelId}: records ${row.recordCount}, avg try ${row.avgTryCount.toFixed(2)}, pass rate ${(row.passRate * 100).toFixed(1)}%`,
    ),
    ``,
    `## Notes`,
    ``,
    `- levelId>=1000 users: ${summary.specialLevelUserCount}`,
    `- Top ad revive levels: ${JSON.stringify(summary.topAdReviveLevels)}`,
    ``,
  ].join("\n");

  fs.writeFileSync(markdownPath, `${markdown}\n`);

  writeCsv(
    csvPath,
    [
      "levelId",
      "uniqueUsers",
      "recordCount",
      "passCount",
      "failCount",
      "passRate",
      "adReviveCount",
      "shareReviveCount",
      "avgTryCount",
      "avgDurationSeconds",
    ],
    levelRows.map((row) => [
      row.levelId,
      row.uniqueUsers,
      row.recordCount,
      row.passCount,
      row.failCount,
      row.passRate.toFixed(4),
      row.adReviveCount,
      row.shareReviveCount,
      row.avgTryCount.toFixed(4),
      row.avgDurationSeconds.toFixed(2),
    ]),
  );

  return {
    summary,
    files: {
      jsonPath,
      markdownPath,
      csvPath,
    },
  };
}

function analyzeFirstLevelFunnelFile({
  inputPath,
  outputDir,
  dateLabel,
  collection,
  envId,
}) {
  const records = loadNdjsonRecords(inputPath);
  const eventStats = new Map();
  const sourceStats = new Map();
  const errorStats = new Map();
  const touchTargetStats = new Map();
  const layerTouchStepStats = new Map();
  const tapResultStats = new Map();
  const tapResultStepStats = new Map();
  const tapResultDetails = new Map();
  const tapResultStepDetails = new Map();
  const eventStepStats = new Map();
  const sessions = new Map();
  const users = new Set();

  for (const record of records) {
    const eventName = record.eventName || "";
    const sessionKey = getSessionKey(record);
    const userKey = record.openid || "";
    const timestamp = Number(record.timestamp) || 0;
    if (userKey) {
      users.add(userKey);
    }
    if (sessionKey && !sessions.has(sessionKey)) {
      sessions.set(sessionKey, {
        userKey,
        events: new Map(),
        firstTs: timestamp,
        lastTs: timestamp,
      });
    }
    if (sessionKey) {
      const session = sessions.get(sessionKey);
      session.firstTs = Math.min(session.firstTs || timestamp, timestamp);
      session.lastTs = Math.max(session.lastTs || 0, timestamp);
      if (!session.events.has(eventName)) {
        session.events.set(eventName, timestamp);
      }
    }

    if (!eventStats.has(eventName)) {
      eventStats.set(eventName, { eventName, records: 0, sessions: new Set(), users: new Set() });
    }
    const stat = eventStats.get(eventName);
    stat.records += 1;
    if (sessionKey) {
      stat.sessions.add(sessionKey);
    }
    if (userKey) {
      stat.users.add(userKey);
    }

    if (record.source) {
      sourceStats.set(record.source, (sourceStats.get(record.source) || 0) + 1);
    }
    if (record.errorCode) {
      errorStats.set(record.errorCode, (errorStats.get(record.errorCode) || 0) + 1);
    }
    if (eventName === "first_touch" && record.touchTarget) {
      touchTargetStats.set(record.touchTarget, (touchTargetStats.get(record.touchTarget) || 0) + 1);
    }
    if (eventName === "tutorial_layer_touch_start") {
      const key = `${record.stepName || String(record.stepId || "unknown")}|${record.touchTarget || "unknown"}`;
      layerTouchStepStats.set(key, (layerTouchStepStats.get(key) || 0) + 1);
    }
    if (eventName === "tutorial_tap_result") {
      const result = record.errorCode || (record.success ? "success" : "unknown");
      const resultKey = `${result}|${record.touchTarget || "unknown"}`;
      const stepKey = `${record.stepName || String(record.stepId || "unknown")}|${result}|${record.touchTarget || "unknown"}`;
      tapResultStats.set(resultKey, (tapResultStats.get(resultKey) || 0) + 1);
      tapResultStepStats.set(stepKey, (tapResultStepStats.get(stepKey) || 0) + 1);
      addDetailStat(tapResultDetails, resultKey, sessionKey, userKey);
      addDetailStat(tapResultStepDetails, stepKey, sessionKey, userKey);
    }
    if (record.stepName) {
      const key = `${eventName}|${record.stepName}`;
      eventStepStats.set(key, (eventStepStats.get(key) || 0) + 1);
    }
  }

  const steps = FIRST_LEVEL_FUNNEL_STEPS.map((eventName) => {
    const stat = eventStats.get(eventName);
    return {
      eventName,
      records: stat?.records || 0,
      sessions: stat?.sessions.size || 0,
      users: stat?.users.size || 0,
    };
  });
  const eventMap = Object.fromEntries(steps.map((row) => [row.eventName, row]));
  const durationFromLaunchToJsonLoaded = [];
  const durationFromLaunchToUiReady = [];
  const durationFromJsonLoadedToUiReady = [];
  const durationFromUiReadyToAnyTouch = [];
  const durationFromUiReadyToFirstTouch = [];
  const durationFromUiReadyToPass = [];
  const durationFromUiReadyToHide = [];

  for (const session of sessions.values()) {
    const launch = session.events.get("app_launch") || 0;
    const jsonLoaded = session.events.get("first_level_json_loaded") || 0;
    const uiReady = session.events.get("first_level_ui_ready") || 0;
    if (launch > 0 && jsonLoaded > launch) {
      durationFromLaunchToJsonLoaded.push(jsonLoaded - launch);
    }
    if (launch > 0 && uiReady > launch) {
      durationFromLaunchToUiReady.push(uiReady - launch);
    }
    if (jsonLoaded > 0 && uiReady > jsonLoaded) {
      durationFromJsonLoadedToUiReady.push(uiReady - jsonLoaded);
    }
    if (!uiReady) {
      continue;
    }
    const anyTouch = session.events.get("first_level_any_touch") || 0;
    const firstTouch = session.events.get("first_touch") || 0;
    const pass = session.events.get("level_pass") || 0;
    const hide = session.events.get("app_hide") || 0;
    if (anyTouch > uiReady) {
      durationFromUiReadyToAnyTouch.push(anyTouch - uiReady);
    }
    if (firstTouch > uiReady) {
      durationFromUiReadyToFirstTouch.push(firstTouch - uiReady);
    }
    if (pass > uiReady) {
      durationFromUiReadyToPass.push(pass - uiReady);
    }
    if (hide > uiReady) {
      durationFromUiReadyToHide.push(hide - uiReady);
    }
  }

  const summary = {
    date: dateLabel,
    envId,
    collection,
    inputPath,
    totalRecords: records.length,
    totalSessions: sessions.size,
    totalUsers: users.size,
    steps,
    keyRates: {
      jsonLoadedToUiReady: ratio(eventMap.first_level_ui_ready?.sessions, eventMap.first_level_json_loaded?.sessions),
      uiReadyToAnyTouch: ratio(eventMap.first_level_any_touch?.sessions, eventMap.first_level_ui_ready?.sessions),
      uiReadyToGuideLayerTouch: ratio(eventMap.tutorial_layer_touch_start?.sessions, eventMap.first_level_ui_ready?.sessions),
      uiReadyToTutorialTapResult: ratio(eventMap.tutorial_tap_result?.sessions, eventMap.first_level_ui_ready?.sessions),
      anyTouchToTutorialTapResult: ratio(eventMap.tutorial_tap_result?.sessions, eventMap.first_level_any_touch?.sessions),
      anyTouchToFirstValidSelect: ratio(eventMap.first_valid_select?.sessions, eventMap.first_level_any_touch?.sessions),
      firstValidSelectToFirstPlaceSuccess: ratio(eventMap.first_place_success?.sessions, eventMap.first_valid_select?.sessions),
      tutorialDoneToPass: ratio(eventMap.level_pass?.sessions, eventMap.tutorial_done?.sessions),
      uiReadyToPass: ratio(eventMap.level_pass?.sessions, eventMap.first_level_ui_ready?.sessions),
      uiReadyToHide: ratio(eventMap.app_hide?.sessions, eventMap.first_level_ui_ready?.sessions),
    },
    durationSeconds: {
      launchToJsonLoaded: quantileSeconds(durationFromLaunchToJsonLoaded),
      launchToUiReady: quantileSeconds(durationFromLaunchToUiReady),
      jsonLoadedToUiReady: quantileSeconds(durationFromJsonLoadedToUiReady),
      uiReadyToAnyTouch: quantileSeconds(durationFromUiReadyToAnyTouch),
      uiReadyToFirstTouch: quantileSeconds(durationFromUiReadyToFirstTouch),
      uiReadyToPass: quantileSeconds(durationFromUiReadyToPass),
      uiReadyToHide: quantileSeconds(durationFromUiReadyToHide),
    },
    topSources: topMapEntries(sourceStats, 20),
    touchTargets: topMapEntries(touchTargetStats, 20),
    layerTouchSteps: topMapEntries(layerTouchStepStats, 30),
    tapResults: topMapEntries(tapResultStats, 40),
    tapResultSteps: topMapEntries(tapResultStepStats, 80),
    tapResultDetails: topDetailEntries(tapResultDetails, 40),
    tapResultStepDetails: topDetailEntries(tapResultStepDetails, 80),
    eventSteps: topMapEntries(eventStepStats, 80),
    errorCodes: topMapEntries(errorStats, 20),
  };

  const jsonPath = path.join(outputDir, "summary.json");
  const markdownPath = path.join(outputDir, "report.md");
  const csvPath = path.join(outputDir, "funnel_steps.csv");
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    markdownPath,
    [
      `# ${COLLECTION_CONFIGS[collection].title}`,
      ``,
      `- Date: ${dateLabel}`,
      `- Environment: ${envId || "unknown"}`,
      `- Collection: ${collection}`,
      `- Source file: ${inputPath}`,
      ``,
      `## Key Rates`,
      ``,
      `- UI ready -> 任意首触达: ${percentText(summary.keyRates.uiReadyToAnyTouch)}`,
      `- 任意首触达 -> 教程点击有结果: ${percentText(summary.keyRates.anyTouchToTutorialTapResult)}`,
      `- 任意首触达 -> 首次有效选择: ${percentText(summary.keyRates.anyTouchToFirstValidSelect)}`,
      `- UI ready -> L1通过: ${percentText(summary.keyRates.uiReadyToPass)}`,
      ``,
      `## Steps`,
      ``,
      markdownTable(
        ["事件", "records", "sessions", "users"],
        summary.steps.map((row) => [row.eventName, row.records, row.sessions, row.users]),
      ),
      ``,
    ].join("\n"),
  );
  writeCsv(
    csvPath,
    ["eventName", "records", "sessions", "users"],
    summary.steps.map((row) => [row.eventName, row.records, row.sessions, row.users]),
  );

  return {
    summary,
    files: {
      jsonPath,
      markdownPath,
      csvPath,
    },
  };
}

function analyzeAdStatFile({
  inputPath,
  outputDir,
  dateLabel,
  collection,
  envId,
}) {
  const records = loadNdjsonRecords(inputPath);
  const rows = records.map((record) => {
    const showNum = Number(record.showNum) || 0;
    const clickNum = Number(record.clickNum) || 0;
    const finishNum = Number(record.finishNum) || 0;
    const userNum = Number(record.userNum) || 0;
    return {
      adType: typeof record.adType === "string" && record.adType.trim()
        ? record.adType.trim()
        : "unknown",
      date: record.date || dateLabel,
      showNum,
      clickNum,
      finishNum,
      userNum,
      clickRate: showNum ? clickNum / showNum : 0,
      finishRate: showNum ? finishNum / showNum : 0,
      finishPerClickRate: clickNum ? finishNum / clickNum : 0,
    };
  });

  rows.sort((a, b) => b.showNum - a.showNum);

  const totals = rows.reduce(
    (acc, row) => {
      acc.showNum += row.showNum;
      acc.clickNum += row.clickNum;
      acc.finishNum += row.finishNum;
      acc.userNum += row.userNum;
      return acc;
    },
    { showNum: 0, clickNum: 0, finishNum: 0, userNum: 0 },
  );

  const topByShow = [...rows].slice(0, 10);
  const weakFinishRate = rows
    .filter((row) => row.showNum > 0)
    .sort((a, b) => a.finishRate - b.finishRate)
    .slice(0, 10);

  const summary = {
    date: dateLabel,
    envId,
    collection,
    inputPath,
    totalRecords: records.length,
    adTypeCount: rows.length,
    totalShowNum: totals.showNum,
    totalClickNum: totals.clickNum,
    totalFinishNum: totals.finishNum,
    totalUserNum: totals.userNum,
    clickRate: totals.showNum ? Number((totals.clickNum / totals.showNum).toFixed(4)) : 0,
    finishRate: totals.showNum ? Number((totals.finishNum / totals.showNum).toFixed(4)) : 0,
    finishPerClickRate: totals.clickNum
      ? Number((totals.finishNum / totals.clickNum).toFixed(4))
      : 0,
    topByShow,
    weakFinishRate,
  };

  const jsonPath = path.join(outputDir, "summary.json");
  const markdownPath = path.join(outputDir, "report.md");
  const csvPath = path.join(outputDir, "ad_summary.csv");

  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);

  const markdown = [
    `# ${COLLECTION_CONFIGS[collection].title}`,
    ``,
    `- Date: ${dateLabel}`,
    `- Environment: ${envId || "unknown"}`,
    `- Collection: ${collection}`,
    `- Source file: ${inputPath}`,
    ``,
    `## Overview`,
    ``,
    `- Ad types: ${summary.adTypeCount}`,
    `- Total show: ${summary.totalShowNum}`,
    `- Total click: ${summary.totalClickNum}`,
    `- Total finish: ${summary.totalFinishNum}`,
    `- Total user num sum: ${summary.totalUserNum}`,
    `- Click rate: ${(summary.clickRate * 100).toFixed(1)}%`,
    `- Finish rate: ${(summary.finishRate * 100).toFixed(1)}%`,
    `- Finish per click: ${(summary.finishPerClickRate * 100).toFixed(1)}%`,
    ``,
    `## Top ad types by show`,
    ``,
    ...summary.topByShow.map(
      (row) =>
        `- ${row.adType}: show ${row.showNum}, click ${row.clickNum}, finish ${row.finishNum}, finish rate ${(row.finishRate * 100).toFixed(1)}%`,
    ),
    ``,
    `## Weak finish rate`,
    ``,
    ...summary.weakFinishRate.map(
      (row) =>
        `- ${row.adType}: show ${row.showNum}, click ${row.clickNum}, finish ${row.finishNum}, finish rate ${(row.finishRate * 100).toFixed(1)}%`,
    ),
    ``,
  ].join("\n");

  fs.writeFileSync(markdownPath, `${markdown}\n`);

  writeCsv(
    csvPath,
    [
      "date",
      "adType",
      "showNum",
      "clickNum",
      "finishNum",
      "userNum",
      "clickRate",
      "finishRate",
      "finishPerClickRate",
    ],
    rows.map((row) => [
      row.date,
      row.adType,
      row.showNum,
      row.clickNum,
      row.finishNum,
      row.userNum,
      row.clickRate.toFixed(4),
      row.finishRate.toFixed(4),
      row.finishPerClickRate.toFixed(4),
    ]),
  );

  return {
    summary,
    files: {
      jsonPath,
      markdownPath,
      csvPath,
    },
  };
}

function analyzeDailyStatFile({
  inputPath,
  outputDir,
  dateLabel,
  collection,
  envId,
}) {
  const records = loadNdjsonRecords(inputPath);
  const rows = records
    .map((record) => ({
      date: record.date || dateLabel,
      dau: Number(record.dau) || 0,
      newUser: Number(record.newUser) || 0,
      totalPlay: Number(record.totalPlay) || 0,
      retain1: Number(record.retain1) || 0,
      retain3: Number(record.retain3) || 0,
      retain7: Number(record.retain7) || 0,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const latest = rows[rows.length - 1] || {
    date: dateLabel,
    dau: 0,
    newUser: 0,
    totalPlay: 0,
    retain1: 0,
    retain3: 0,
    retain7: 0,
  };

  const summary = {
    date: dateLabel,
    envId,
    collection,
    inputPath,
    totalRecords: records.length,
    latest,
    rows,
  };

  const jsonPath = path.join(outputDir, "summary.json");
  const markdownPath = path.join(outputDir, "report.md");
  const csvPath = path.join(outputDir, "daily_core_summary.csv");

  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);

  const markdown = [
    `# ${COLLECTION_CONFIGS[collection].title}`,
    ``,
    `- Date: ${dateLabel}`,
    `- Environment: ${envId || "unknown"}`,
    `- Collection: ${collection}`,
    `- Source file: ${inputPath}`,
    ``,
    `## Latest daily core`,
    ``,
    `- Date: ${latest.date}`,
    `- DAU: ${latest.dau}`,
    `- New user: ${latest.newUser}`,
    `- Total play: ${latest.totalPlay}`,
    `- Retain1: ${latest.retain1}%`,
    `- Retain3: ${latest.retain3}%`,
    `- Retain7: ${latest.retain7}%`,
    ``,
  ].join("\n");

  fs.writeFileSync(markdownPath, `${markdown}\n`);

  writeCsv(
    csvPath,
    ["date", "dau", "newUser", "totalPlay", "retain1", "retain3", "retain7"],
    rows.map((row) => [
      row.date,
      row.dau,
      row.newUser,
      row.totalPlay,
      row.retain1,
      row.retain3,
      row.retain7,
    ]),
  );

  return {
    summary,
    files: {
      jsonPath,
      markdownPath,
      csvPath,
    },
  };
}

function buildEffectiveDailyCore({
  dateLabel,
  userBehaviorSummary,
  dailyStatSummary,
}) {
  if (dailyStatSummary && Number(dailyStatSummary.totalRecords) > 0) {
    return {
      source: "daily_stat",
      isFallback: false,
      ...dailyStatSummary.latest,
    };
  }

  if (userBehaviorSummary) {
    const totalPlay = Number(userBehaviorSummary.eventCounts?.game_start) || 0;
    return {
      source: "user_behavior_fallback",
      isFallback: true,
      date: dateLabel,
      dau: Number(userBehaviorSummary.uniqueUsers) || 0,
      newUser: null,
      totalPlay,
      retain1: null,
      retain3: null,
      retain7: null,
    };
  }

  return {
    source: "empty",
    isFallback: true,
    date: dateLabel,
    dau: 0,
    newUser: null,
    totalPlay: 0,
    retain1: null,
    retain3: null,
    retain7: null,
  };
}

function buildEffectiveAdStat({
  userBehaviorSummary,
  adStatSummary,
}) {
  if (adStatSummary && Number(adStatSummary.totalRecords) > 0) {
    return {
      source: "ad_stat",
      isFallback: false,
      ...adStatSummary,
    };
  }

  const totalShowNum = Number(userBehaviorSummary?.eventCounts?.ad_show) || 0;
  const totalClickNum = Number(userBehaviorSummary?.eventCounts?.ad_click) || 0;
  const totalFinishNum = Number(userBehaviorSummary?.eventCounts?.ad_finish) || 0;
  const clickRate = totalShowNum ? totalClickNum / totalShowNum : 0;
  const finishRate = totalShowNum ? totalFinishNum / totalShowNum : 0;
  const finishPerClickRate = totalClickNum ? totalFinishNum / totalClickNum : 0;
  const breakdownRows = Array.isArray(userBehaviorSummary?.adEventBreakdown)
    ? userBehaviorSummary.adEventBreakdown
    : [];
  const aggregateRow = {
    adType: "user_behavior_fallback",
    page: "all",
    label: "全部广告位",
    date: userBehaviorSummary?.date || "",
    showNum: totalShowNum,
    clickNum: totalClickNum,
    finishNum: totalFinishNum,
    userNum: Number(userBehaviorSummary?.adUsers) || 0,
    clickRate,
    finishRate,
    finishPerClickRate,
  };

  return {
    source: "user_behavior_fallback",
    isFallback: true,
    date: userBehaviorSummary?.date || "",
    envId: userBehaviorSummary?.envId || "",
    collection: "ad_stat",
    inputPath: userBehaviorSummary?.inputPath || "",
    totalRecords: totalShowNum > 0 ? 1 : 0,
    adTypeCount: totalShowNum > 0 ? 1 : 0,
    totalShowNum,
    totalClickNum,
    totalFinishNum,
    totalUserNum: Number(userBehaviorSummary?.adUsers) || 0,
    clickRate: Number(clickRate.toFixed(4)),
    finishRate: Number(finishRate.toFixed(4)),
    finishPerClickRate: Number(finishPerClickRate.toFixed(4)),
    topByShow: breakdownRows.length ? breakdownRows : (totalShowNum > 0 ? [aggregateRow] : []),
    weakFinishRate: breakdownRows.length
      ? [...breakdownRows]
          .filter((row) => Number(row.showNum) > 0)
          .sort((a, b) => {
            if (a.finishRate !== b.finishRate) {
              return a.finishRate - b.finishRate;
            }
            return b.showNum - a.showNum;
          })
          .slice(0, 10)
      : (totalShowNum > 0 ? [aggregateRow] : []),
  };
}

function collectionSummary(combinedSummary, name) {
  return combinedSummary.collections[name]?.summary || null;
}

function rowMapByLevel(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const levelId = Math.max(0, Math.floor(Number(row.levelId) || 0));
    if (levelId > 0) {
      map.set(levelId, row);
    }
  }
  return map;
}

function firstLevelStepMap(funnelSummary) {
  return Object.fromEntries(
    (Array.isArray(funnelSummary?.steps) ? funnelSummary.steps : [])
      .map((row) => [row.eventName, row]),
  );
}

function classifyBottleneck(row) {
  if (!row.enterUv) {
    return "暂无进入数据";
  }
  if (row.uvPassRate < 0.35 && row.failUv <= Math.max(2, row.enterUv * 0.05)) {
    return "低通过且显式失败少，优先查中途退出、卡住或日志缺口";
  }
  if (row.uvPassRate < 0.5 && row.failUv > 0) {
    return "低通过且有失败，优先查关卡难度";
  }
  if (row.avgTryCount >= 1.2) {
    return "平均尝试偏高，检查局部难点和节奏";
  }
  return "观察";
}

function buildFirstLevelFunnelRows({ funnelSummary, userBehaviorSummary }) {
  const stepMap = firstLevelStepMap(funnelSummary);
  const startSessions =
    stepMap.app_launch?.sessions ||
    stepMap.first_level_ui_ready?.sessions ||
    0;
  const startUsers =
    stepMap.app_launch?.users ||
    stepMap.first_level_ui_ready?.users ||
    Number(userBehaviorSummary?.levelOneEnterUv) ||
    0;
  const steps = [
    ["App启动", "app_launch"],
    ["首关JSON加载", "first_level_json_loaded"],
    ["UI ready", "first_level_ui_ready"],
    ["教程可交互", "tutorial_step_interactive_ready"],
    ["任意首触达", "first_level_any_touch"],
    ["教程点击有结果", "tutorial_tap_result"],
    ["首次有效选择", "first_valid_select"],
    ["首次放置成功", "first_place_success"],
    ["教程完成", "tutorial_done"],
    ["L1通过", "level_pass"],
  ];

  let previousSessions = 0;
  return steps.map(([label, eventName]) => {
    const stat = stepMap[eventName] || { records: 0, sessions: 0, users: 0 };
    const row = {
      label,
      eventName,
      records: stat.records || 0,
      sessions: stat.sessions || 0,
      users: stat.users || 0,
      sessionRateFromStart: ratio(stat.sessions, startSessions),
      userRateFromStart: ratio(stat.users, startUsers),
      sessionStepRate: previousSessions ? ratio(stat.sessions, previousSessions) : 0,
    };
    if (stat.sessions > 0 || previousSessions === 0) {
      previousSessions = stat.sessions || previousSessions;
    }
    return row;
  });
}

function buildFirst20Levels({ userBehaviorSummary, levelRecordSummary }) {
  const behaviorByLevel = rowMapByLevel(userBehaviorSummary?.levelRows);
  const recordByLevel = rowMapByLevel(levelRecordSummary?.levelRows);
  const rows = [];
  for (let levelId = 1; levelId <= 20; levelId += 1) {
    const behavior = behaviorByLevel.get(levelId) || {};
    const record = recordByLevel.get(levelId) || {};
    const enterUv = numberValue(behavior.enterUv);
    const passUv = numberValue(behavior.passUv);
    const failUv = numberValue(behavior.failUv);
    const enterNotPassUv = Math.max(0, enterUv - passUv);
    const silentDropUv = Math.max(0, enterNotPassUv - failUv);
    rows.push({
      levelId,
      enterUv,
      enterPv: numberValue(behavior.enterPv),
      passUv,
      passPv: numberValue(behavior.passPv),
      failUv,
      failPv: numberValue(behavior.failPv),
      enterNotPassUv,
      silentDropUv,
      uvPassRate: ratio(passUv, enterUv),
      pvPassRate: ratio(behavior.passPv, behavior.enterPv),
      recordCount: numberValue(record.recordCount),
      uniqueUsers: numberValue(record.uniqueUsers),
      passRate: ratio(record.passCount, record.recordCount),
      avgTryCount: fixedNumber(record.avgTryCount, 2),
      avgDurationSeconds: fixedNumber(record.avgDurationSeconds, 2),
      adReviveCount: numberValue(record.adReviveCount),
      diagnosis: classifyBottleneck({
        enterUv,
        failUv,
        uvPassRate: ratio(passUv, enterUv),
        avgTryCount: numberValue(record.avgTryCount),
      }),
    });
  }
  return rows;
}

function buildMainlineBottlenecks(first20Levels) {
  return [...first20Levels]
    .filter((row) => row.enterUv >= 10)
    .sort((a, b) => {
      if (b.enterNotPassUv !== a.enterNotPassUv) {
        return b.enterNotPassUv - a.enterNotPassUv;
      }
      return a.uvPassRate - b.uvPassRate;
    })
    .slice(0, 12);
}

function buildHighRetryLevels(levelRecordSummary) {
  const rows = Array.isArray(levelRecordSummary?.levelRows)
    ? levelRecordSummary.levelRows
    : (levelRecordSummary?.topRetryLevels || []);
  return [...rows]
    .filter((row) => numberValue(row.recordCount) >= 5 && numberValue(row.avgTryCount) > 1)
    .sort((a, b) => {
      if (numberValue(b.avgTryCount) !== numberValue(a.avgTryCount)) {
        return numberValue(b.avgTryCount) - numberValue(a.avgTryCount);
      }
      return numberValue(b.recordCount) - numberValue(a.recordCount);
    })
    .slice(0, 12)
    .map((row) => ({
      levelId: numberValue(row.levelId),
      uniqueUsers: numberValue(row.uniqueUsers),
      recordCount: numberValue(row.recordCount),
      passRate: ratio(row.passCount, row.recordCount),
      failCount: numberValue(row.failCount),
      avgTryCount: fixedNumber(row.avgTryCount, 2),
      avgDurationSeconds: fixedNumber(row.avgDurationSeconds, 2),
      adReviveCount: numberValue(row.adReviveCount),
    }));
}

function buildDataQuality({ combinedSummary, userBehaviorSummary, first20Levels, funnelSummary }) {
  const warnings = [];
  const l1 = first20Levels[0] || {};
  const l1NotPass = numberValue(l1.enterNotPassUv);
  if (!funnelSummary || numberValue(funnelSummary.totalRecords) === 0) {
    warnings.push("缺少 first_level_funnel 数据，首关细分漏斗不可用。");
  }
  if (!Array.isArray(userBehaviorSummary?.levelRows)) {
    warnings.push("user_behavior summary 缺少完整 levelRows，前20关只能部分回填。");
  }
  if (combinedSummary.effectiveDailyCore?.isFallback) {
    warnings.push("daily_stat 为空或不可用，DAU/总局数由 user_behavior 回推。");
  }
  if (combinedSummary.effectiveAdStat?.isFallback) {
    warnings.push("ad_stat 为空或不可用，广告指标由 user_behavior 广告事件回推。");
  }
  if (l1NotPass > 0 && numberValue(l1.failUv) <= Math.max(2, l1NotPass * 0.05)) {
    warnings.push("L1 进入未通过用户几乎没有显式 level_fail，需按中途退出/卡住/日志缺口解释。");
  }
  return {
    firstLevelFunnelRecords: numberValue(funnelSummary?.totalRecords),
    firstLevelFunnelSessions: numberValue(funnelSummary?.totalSessions),
    adStatSource: combinedSummary.effectiveAdStat?.source || "unknown",
    dailyCoreSource: combinedSummary.effectiveDailyCore?.source || "unknown",
    l1FailCoverageRate: ratio(l1.failUv, l1NotPass),
    warnings,
  };
}

function buildRecommendations({ coreMetrics, funnelRows, tutorialTapBreakdown, mainlineBottlenecks, highRetryLevels, adPerformance }) {
  const recommendations = [];
  const uiReady = funnelRows.find((row) => row.eventName === "first_level_ui_ready");
  const anyTouch = funnelRows.find((row) => row.eventName === "first_level_any_touch");
  const validSelect = funnelRows.find((row) => row.eventName === "first_valid_select");
  const topTapMiss = tutorialTapBreakdown.find((row) => !String(row.key || "").startsWith("success"));

  if (coreMetrics.l1UvPassRate < 0.3) {
    recommendations.push({
      priority: "P0",
      topic: "首关漏斗通过率",
      finding: `App启动到L1通过UV率 ${percentText(coreMetrics.l1UvPassRate)}，低于 30%。`,
      action: "优先评审首关教程、可点击范围、第一步目标表达和第二步放置节奏。",
    });
  }
  if (uiReady && anyTouch && ratio(anyTouch.sessions, uiReady.sessions) < 0.7) {
    recommendations.push({
      priority: "P0",
      topic: "首关首触达",
      finding: `UI ready 后任意首触达率 ${percentText(ratio(anyTouch.sessions, uiReady.sessions))}。`,
      action: "继续优化首屏视觉焦点、手势引导和文案位置，并检查是否存在加载后无响应/遮罩误拦截。",
    });
  }
  if (anyTouch && validSelect && ratio(validSelect.sessions, anyTouch.sessions) < 0.6) {
    recommendations.push({
      priority: "P0",
      topic: "教程点击有效性",
      finding: `任意首触达到首次有效选择转化 ${percentText(ratio(validSelect.sessions, anyTouch.sessions))}。`,
      action: "放宽教程期合法点击、强化目标区域高亮，并按 tutorial_tap_result 的错误类型做专项修复。",
    });
  }
  if (topTapMiss) {
    recommendations.push({
      priority: "P1",
      topic: "误点类型",
      finding: `最高频非成功点击为 ${topTapMiss.key}，PV ${topTapMiss.records}。`,
      action: "优先复查这个点击类型对应的引导步骤、目标判定和视觉暗示。",
    });
  }
  if (mainlineBottlenecks[0]) {
    recommendations.push({
      priority: "P1",
      topic: "主线卡点",
      finding: `最大流失关卡 L${mainlineBottlenecks[0].levelId}，进入未通过UV ${mainlineBottlenecks[0].enterNotPassUv}。`,
      action: "按该关的布局、颜色组合、槽位压力和时间配置做关卡复盘。",
    });
  }
  if (highRetryLevels[0] && highRetryLevels[0].avgTryCount >= 1.2) {
    recommendations.push({
      priority: "P1",
      topic: "高重试关卡",
      finding: `L${highRetryLevels[0].levelId} 平均尝试 ${highRetryLevels[0].avgTryCount}。`,
      action: "检查是否存在局部形状识别难、颜色混淆或槽位不足导致的重复尝试。",
    });
  }
  if (adPerformance.overall.finishRate > 0 && adPerformance.overall.finishRate < 0.4) {
    recommendations.push({
      priority: "P2",
      topic: "广告完成率",
      finding: `广告完成率 ${percentText(adPerformance.overall.finishRate)}。`,
      action: "按广告位检查触发时机、奖励承诺、加载失败和中途退出。",
    });
  }
  return recommendations;
}

function buildDailyDiagnosis(combinedSummary) {
  const userBehaviorSummary = collectionSummary(combinedSummary, "user_behavior");
  const levelRecordSummary = collectionSummary(combinedSummary, "level_record");
  const funnelSummary = collectionSummary(combinedSummary, "first_level_funnel");
  const first20Levels = buildFirst20Levels({ userBehaviorSummary, levelRecordSummary });
  const firstLevelFunnel = buildFirstLevelFunnelRows({ funnelSummary, userBehaviorSummary });
  const mainlineBottlenecks = buildMainlineBottlenecks(first20Levels);
  const highRetryLevels = buildHighRetryLevels(levelRecordSummary);
  const tutorialTapBreakdown = Array.isArray(funnelSummary?.tapResultDetails)
    ? funnelSummary.tapResultDetails
    : [];
  const tutorialTapByStep = Array.isArray(funnelSummary?.tapResultStepDetails)
    ? funnelSummary.tapResultStepDetails
    : [];
  const ad = combinedSummary.effectiveAdStat || {};
  const funnelStart = firstLevelFunnel.find((row) => row.eventName === "app_launch")
    || firstLevelFunnel.find((row) => row.eventName === "first_level_ui_ready")
    || {};
  const funnelPass = firstLevelFunnel.find((row) => row.eventName === "level_pass") || {};
  const l1LevelEnterUv = numberValue(userBehaviorSummary?.levelOneEnterUv);
  const l1LevelPassUv = numberValue(userBehaviorSummary?.levelOnePassUv);
  const coreMetrics = {
    date: combinedSummary.date,
    dau: numberValue(combinedSummary.effectiveDailyCore?.dau),
    totalPlay: numberValue(combinedSummary.effectiveDailyCore?.totalPlay),
    gameStartUsers: numberValue(userBehaviorSummary?.startUsers),
    enterLevelUsers: numberValue(userBehaviorSummary?.enterUsers),
    passUsers: numberValue(userBehaviorSummary?.passUsers),
    l1EnterUv: numberValue(funnelStart.users),
    l1PassUv: numberValue(funnelPass.users),
    l1FailUv: numberValue(userBehaviorSummary?.levelOneFailUv),
    l1EnterNotPassUv: Math.max(0, numberValue(funnelStart.users) - numberValue(funnelPass.users)),
    l1UvPassRate: ratio(funnelPass.users, funnelStart.users),
    l1PassRateDenominator: "first_level_funnel.app_launch.users",
    l1FunnelStartEvent: funnelStart.eventName || "app_launch",
    l1FunnelStartUv: numberValue(funnelStart.users),
    l1FunnelPassUv: numberValue(funnelPass.users),
    l1FunnelUvPassRate: ratio(funnelPass.users, funnelStart.users),
    l1LevelEnterUv,
    l1LevelPassUv,
    l1LevelEnterPassRate: ratio(l1LevelPassUv, l1LevelEnterUv),
    firstLevelUiReadySessions: numberValue(firstLevelFunnel.find((row) => row.eventName === "first_level_ui_ready")?.sessions),
    firstLevelAnyTouchSessions: numberValue(firstLevelFunnel.find((row) => row.eventName === "first_level_any_touch")?.sessions),
    firstLevelAnyTouchRate: ratio(
      firstLevelFunnel.find((row) => row.eventName === "first_level_any_touch")?.sessions,
      firstLevelFunnel.find((row) => row.eventName === "first_level_ui_ready")?.sessions,
    ),
    adShowPv: numberValue(ad.totalShowNum),
    adClickPv: numberValue(ad.totalClickNum),
    adFinishPv: numberValue(ad.totalFinishNum),
    adFinishRate: numberValue(ad.finishRate),
  };
  const adPerformance = {
    source: ad.source || "unknown",
    isFallback: Boolean(ad.isFallback),
    overall: {
      showNum: numberValue(ad.totalShowNum),
      clickNum: numberValue(ad.totalClickNum),
      finishNum: numberValue(ad.totalFinishNum),
      userNum: numberValue(ad.totalUserNum),
      clickRate: numberValue(ad.clickRate),
      finishRate: numberValue(ad.finishRate),
      finishPerClickRate: numberValue(ad.finishPerClickRate),
    },
    topByShow: ad.topByShow || [],
    weakFinishRate: ad.weakFinishRate || [],
  };

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    coreMetrics,
    firstLevelFunnel,
    tutorialTapBreakdown,
    tutorialTapByStep,
    first20Levels,
    mainlineBottlenecks,
    highRetryLevels,
    adPerformance,
    dataQuality: buildDataQuality({ combinedSummary, userBehaviorSummary, first20Levels, funnelSummary }),
    recommendations: buildRecommendations({
      coreMetrics,
      funnelRows: firstLevelFunnel,
      tutorialTapBreakdown,
      mainlineBottlenecks,
      highRetryLevels,
      adPerformance,
    }),
  };
}

function writeCombinedOutputs({
  rootOutputDir,
  dateLabel,
  envId,
  resultByCollection,
}) {
  const combinedSummary = {
    date: dateLabel,
    envId,
    collections: {},
  };

  for (const [collection, result] of Object.entries(resultByCollection)) {
    combinedSummary.collections[collection] = {
      exportInfo: result.exportInfo,
      reportFiles: result.analysis.files,
      summary: result.analysis.summary,
    };
  }

  combinedSummary.effectiveDailyCore = buildEffectiveDailyCore({
    dateLabel,
    userBehaviorSummary: combinedSummary.collections.user_behavior?.summary || null,
    dailyStatSummary: combinedSummary.collections.daily_stat?.summary || null,
  });
  combinedSummary.effectiveAdStat = buildEffectiveAdStat({
    userBehaviorSummary: combinedSummary.collections.user_behavior?.summary || null,
    adStatSummary: combinedSummary.collections.ad_stat?.summary || null,
  });
  combinedSummary.dailyDiagnosis = buildDailyDiagnosis(combinedSummary);

  const jsonPath = path.join(rootOutputDir, "combined_summary.json");
  const markdownPath = path.join(rootOutputDir, "combined_report.md");

  const diagnosis = combinedSummary.dailyDiagnosis;
  const core = diagnosis.coreMetrics;
  const qualityWarnings = diagnosis.dataQuality.warnings || [];
  fs.writeFileSync(jsonPath, `${JSON.stringify(combinedSummary, null, 2)}\n`);

  const lines = [
    `# syGamePdd Daily Diagnosis Report`,
    ``,
    `- Date: ${dateLabel}`,
    `- Environment: ${envId || "unknown"}`,
    `- Schema: dailyDiagnosis v${diagnosis.schemaVersion}`,
    ``,
    `## 今日核心结论`,
    ``,
    ...diagnosis.recommendations.slice(0, 6).map(
      (item) => `- **${item.priority} ${item.topic}**：${item.finding} ${item.action}`,
    ),
    ...(diagnosis.recommendations.length ? [] : [`- 暂无达到阈值的自动建议。`]),
    ``,
    `## 核心指标`,
    ``,
    markdownTable(
      ["指标", "数值", "说明"],
      [
        ["DAU", integerText(core.dau), `source=${combinedSummary.effectiveDailyCore.source}`],
        ["总局数", integerText(core.totalPlay), "daily_stat 或 user_behavior 回推"],
        ["game_start UV", integerText(core.gameStartUsers), "user_behavior"],
        ["enter_level UV", integerText(core.enterLevelUsers), "user_behavior"],
        ["任意通关 UV", integerText(core.passUsers), "user_behavior"],
        ["首关漏斗起点UV", integerText(core.l1EnterUv), `first_level_funnel ${core.l1FunnelStartEvent || "app_launch"}`],
        ["L1通过UV", integerText(core.l1PassUv), "first_level_funnel level_pass"],
        ["首关漏斗UV通过率", percentText(core.l1UvPassRate), "level_pass UV / app_launch UV"],
        ["L1进入后UV通过率", percentText(core.l1LevelEnterPassRate), "user_behavior level_pass UV / level_enter UV"],
        ["UI ready 后任意首触达率", percentText(core.firstLevelAnyTouchRate), "first_level_funnel session口径"],
        ["广告完成率", percentText(core.adFinishRate), `source=${diagnosis.adPerformance.source}`],
      ],
    ),
    ``,
    `## 首关/教程漏斗`,
    ``,
    markdownTable(
      ["步骤", "事件", "UV", "UV占App启动", "Session", "Session占App启动", "上一步转化", "PV/records"],
      diagnosis.firstLevelFunnel.map((row) => [
        row.label,
        row.eventName,
        integerText(row.users),
        percentText(row.userRateFromStart),
        integerText(row.sessions),
        percentText(row.sessionRateFromStart),
        row.sessionStepRate ? percentText(row.sessionStepRate) : "-",
        integerText(row.records),
      ]),
    ),
    ``,
    `## 教程点击结果分布`,
    ``,
    markdownTable(
      ["类型", "PV", "Session", "UV", "PV占比"],
      diagnosis.tutorialTapBreakdown.map((row) => [
        row.key,
        integerText(row.records),
        integerText(row.sessions),
        integerText(row.users),
        percentText(ratio(row.records, diagnosis.tutorialTapBreakdown.reduce((sum, item) => sum + numberValue(item.records), 0))),
      ]),
    ),
    ``,
    `## 前20关全量表现`,
    ``,
    markdownTable(
      ["关卡", "进入UV", "通过UV", "失败UV", "进入未通过UV", "UV通过率", "记录局数", "平均尝试", "平均时长", "广告续关", "判断"],
      diagnosis.first20Levels.map((row) => [
        `L${row.levelId}`,
        integerText(row.enterUv),
        integerText(row.passUv),
        integerText(row.failUv),
        integerText(row.enterNotPassUv),
        percentText(row.uvPassRate),
        integerText(row.recordCount),
        row.avgTryCount.toFixed(2),
        `${row.avgDurationSeconds.toFixed(1)}s`,
        integerText(row.adReviveCount),
        row.diagnosis,
      ]),
    ),
    ``,
    `## 主线卡点表`,
    ``,
    markdownTable(
      ["关卡", "进入UV", "通过UV", "流失UV", "UV通过率", "显式失败UV", "无失败未通过UV", "平均尝试", "判断"],
      diagnosis.mainlineBottlenecks.map((row) => [
        `L${row.levelId}`,
        integerText(row.enterUv),
        integerText(row.passUv),
        integerText(row.enterNotPassUv),
        percentText(row.uvPassRate),
        integerText(row.failUv),
        integerText(row.silentDropUv),
        row.avgTryCount.toFixed(2),
        row.diagnosis,
      ]),
    ),
    ``,
    `## 高重试关卡表`,
    ``,
    markdownTable(
      ["关卡", "记录数", "唯一用户", "通过率", "平均尝试", "平均时长", "失败局数", "广告续关"],
      diagnosis.highRetryLevels.map((row) => [
        `L${row.levelId}`,
        integerText(row.recordCount),
        integerText(row.uniqueUsers),
        percentText(row.passRate),
        row.avgTryCount.toFixed(2),
        `${row.avgDurationSeconds.toFixed(1)}s`,
        integerText(row.failCount),
        integerText(row.adReviveCount),
      ]),
    ),
    ``,
    `## 广告表现`,
    ``,
    markdownTable(
      ["广告位", "展示PV", "点击PV", "完成PV", "触达UV", "点击率", "完成率", "点击后完成率"],
      diagnosis.adPerformance.topByShow.map((row) => [
        getAdDisplayLabel(row),
        integerText(row.showNum),
        integerText(row.clickNum),
        integerText(row.finishNum),
        integerText(row.userNum),
        percentText(row.clickRate),
        percentText(row.finishRate),
        percentText(row.finishPerClickRate),
      ]),
    ),
    ``,
    `## 数据质量与日志覆盖`,
    ``,
    markdownTable(
      ["检查项", "结果"],
      [
        ["first_level_funnel records", integerText(diagnosis.dataQuality.firstLevelFunnelRecords)],
        ["first_level_funnel sessions", integerText(diagnosis.dataQuality.firstLevelFunnelSessions)],
        ["daily core source", diagnosis.dataQuality.dailyCoreSource],
        ["ad source", diagnosis.dataQuality.adStatSource],
        ["L1 fail覆盖率", percentText(diagnosis.dataQuality.l1FailCoverageRate)],
      ],
    ),
    ``,
    ...(qualityWarnings.length
      ? [`### 告警`, ``, ...qualityWarnings.map((item) => `- ${item}`), ``]
      : [`### 告警`, ``, `- 暂无。`, ``]),
  ];

  fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`);

  return { jsonPath, markdownPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const collectionNames = normalizeCollectionNames(args);
  const dateLabel = getTargetDate(args.date);
  const rootOutputDir = path.resolve(
    args.outDir || getDefaultOutputDir(dateLabel, collectionNames),
  );
  ensureDir(rootOutputDir);

  if (args.input && collectionNames.length !== 1) {
    throw new Error("--input only supports single-collection mode");
  }

  const shouldExport = !args.input;
  const exportClient = shouldExport ? createExportClient() : null;
  const envId = exportClient ? exportClient.envId : process.env.TCB_ENV_ID || "";
  const resultByCollection = {};

  for (const collection of collectionNames) {
    const config = COLLECTION_CONFIGS[collection];
    const collectionOutputDir =
      collectionNames.length === 1
        ? rootOutputDir
        : path.join(rootOutputDir, collection);
    ensureDir(collectionOutputDir);

    let inputPath = args.input ? path.resolve(args.input) : "";
    let exportInfo = null;

    if (!inputPath) {
      if (exportClient.mode === "apiKey") {
        const exportViaApiKey = config.apiKeyExportMode === "database"
          ? exportCollectionViaDatabaseApiForDay
          : exportCollectionViaApiKeyForDay;
        exportInfo = await exportViaApiKey({
          collection,
          queryField: args.queryField || config.queryField,
          queryMode: config.queryMode,
          dateLabel,
          outputDir: collectionOutputDir,
          apiKeyBundle: exportClient,
        });
      } else {
        exportInfo = await exportCollectionForDay({
          collection,
          queryField: args.queryField || config.queryField,
          queryMode: config.queryMode,
          dateLabel,
          outputDir: collectionOutputDir,
          pollMs: args.pollMs,
          timeoutMs: args.timeoutMs,
          managerBundle: exportClient,
        });
      }
      inputPath = exportInfo.localPath;
    }

    const analysis = config.analyze({
      inputPath,
      outputDir: collectionOutputDir,
      dateLabel,
      collection,
      envId,
    });

    resultByCollection[collection] = {
      exportInfo,
      analysis,
    };
  }

  let combinedFiles = null;
  if (collectionNames.length > 1) {
    combinedFiles = writeCombinedOutputs({
      rootOutputDir,
      dateLabel,
      envId,
      resultByCollection,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        date: dateLabel,
        outputDir: rootOutputDir,
        envId,
        collections: Object.fromEntries(
          Object.entries(resultByCollection).map(([collection, result]) => [
            collection,
            {
              exportInfo: result.exportInfo,
              reportFiles: result.analysis.files,
              summary: result.analysis.summary,
            },
          ]),
        ),
        combinedFiles,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
