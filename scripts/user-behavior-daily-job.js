#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const CloudBase = require("@cloudbase/manager-node");

const DEFAULT_COLLECTION = "user_behavior";
const DEFAULT_EXPORT_FUNCTION_NAME = "exportAnalyticsData";
const DEFAULT_API_PAGE_SIZE = 500;
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
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(argv) {
  const args = {
    collection: DEFAULT_COLLECTION,
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
  npm run analytics:user-behavior:daily -- --date 2026-05-24
  npm run analytics:level-record:daily -- --date 2026-05-24
  npm run analytics:ad-stat:daily -- --date 2026-05-24
  npm run analytics:daily-stat:daily -- --date 2026-05-24
  npm run analytics:daily:all -- --date 2026-05-24
  node scripts/user-behavior-daily-job.js --input ./database_export.json

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
  --collection NAME        One collection name, e.g. user_behavior or level_record.
  --collections A,B        Multiple collections, e.g. user_behavior,level_record,ad_stat,daily_stat.
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
  const names = args.collections
    ? args.collections.split(",").map((item) => item.trim()).filter(Boolean)
    : [args.collection];

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
  const query =
    queryMode === "exact"
      ? JSON.stringify({
          [queryField]: dateLabel,
        })
      : JSON.stringify((() => {
          const { startMs, endMs } = shanghaiDayRange(dateLabel);
          return {
            [queryField]: {
              $gte: startMs,
              $lt: endMs,
            },
          };
        })());

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

  const jsonPath = path.join(rootOutputDir, "combined_summary.json");
  const markdownPath = path.join(rootOutputDir, "combined_report.md");

  fs.writeFileSync(jsonPath, `${JSON.stringify(combinedSummary, null, 2)}\n`);

  const lines = [
    `# CloudBase Daily Combined Report`,
    ``,
    `- Date: ${dateLabel}`,
    `- Environment: ${envId || "unknown"}`,
    ``,
  ];

  if (combinedSummary.collections.user_behavior) {
    const summary = combinedSummary.collections.user_behavior.summary;
    lines.push(`## user_behavior`);
    lines.push(``);
    lines.push(`- Total records: ${summary.totalRecords}`);
    lines.push(`- Unique users: ${summary.uniqueUsers}`);
    lines.push(`- Enter users: ${summary.enterUsers}`);
    lines.push(`- Level 1 UV pass rate: ${(summary.levelOneUvPassRate * 100).toFixed(1)}%`);
    lines.push(
      `- Main bottlenecks: ${summary.lowPassLevels
        .slice(0, 5)
        .map((row) => `L${row.levelId} ${(row.uvPassRate * 100).toFixed(1)}%`)
        .join(", ")}`,
    );
    lines.push(``);
  }

  if (combinedSummary.collections.level_record) {
    const summary = combinedSummary.collections.level_record.summary;
    lines.push(`## level_record`);
    lines.push(``);
    lines.push(`- Total records: ${summary.totalRecords}`);
    lines.push(`- Unique users: ${summary.uniqueUsers}`);
    lines.push(`- Pass rate: ${(summary.passRate * 100).toFixed(1)}%`);
    lines.push(`- Avg try count: ${summary.avgTryCount.toFixed(2)}`);
    lines.push(`- Avg duration: ${summary.avgDurationSeconds.toFixed(2)}s`);
    lines.push(
      `- High retry levels: ${summary.topRetryLevels
        .slice(0, 5)
        .map((row) => `L${row.levelId} ${row.avgTryCount.toFixed(2)}次`)
        .join(", ")}`,
    );
    lines.push(``);
  }

  if (combinedSummary.collections.ad_stat) {
    const summary = combinedSummary.effectiveAdStat;
    lines.push(`## ad_stat`);
    lines.push(``);
    lines.push(`- Total show: ${summary.totalShowNum}`);
    lines.push(`- Total click: ${summary.totalClickNum}`);
    lines.push(`- Total finish: ${summary.totalFinishNum}`);
    lines.push(`- Click rate: ${(summary.clickRate * 100).toFixed(1)}%`);
    lines.push(`- Finish rate: ${(summary.finishRate * 100).toFixed(1)}%`);
    lines.push(
      `- Top ad types: ${summary.topByShow
        .slice(0, 5)
        .map((row) => `${getAdDisplayLabel(row)}:${row.showNum}`)
        .join(", ")}`,
    );
    if (summary.isFallback) {
      lines.push(`- Note: ad_stat was empty, so ad metrics were derived from user_behavior ad events.`);
    }
    lines.push(``);
  }

  if (combinedSummary.collections.daily_stat) {
    const latest = combinedSummary.effectiveDailyCore;
    lines.push(`## daily_stat`);
    lines.push(``);
    lines.push(`- DAU: ${latest.dau}`);
    lines.push(`- New user: ${latest.newUser == null ? "N/A" : latest.newUser}`);
    lines.push(`- Total play: ${latest.totalPlay}`);
    lines.push(`- Retain1: ${latest.retain1 == null ? "N/A" : `${latest.retain1}%`}`);
    lines.push(`- Retain3: ${latest.retain3 == null ? "N/A" : `${latest.retain3}%`}`);
    lines.push(`- Retain7: ${latest.retain7 == null ? "N/A" : `${latest.retain7}%`}`);
    if (latest.isFallback) {
      lines.push(`- Note: daily_stat was empty, so DAU and total play were derived from user_behavior.`);
    }
    lines.push(``);
  }

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
        exportInfo = await exportCollectionViaApiKeyForDay({
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
