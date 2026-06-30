#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DATABASE_API_PAGE_SIZE = 1000;
const EXPERIMENT_GROUP_SPECS = [
  { group: "control", bucket: "A+B", groupLabel: "对照组(A+B)", buckets: ["A", "B"] },
  { group: "treatment", bucket: "C+D", groupLabel: "实验组(C+D)", buckets: ["C", "D"] },
  { group: "null", bucket: "NULL", groupLabel: "NULL", buckets: ["NULL"] },
];
const SALT_COMPUTED_EXPERIMENTS = [
  { experimentId: "level_exp_salt", sourceExperimentId: "level_exp", salt: "level_exp_0623" },
  { experimentId: "tutorial_exp_salt", sourceExperimentId: "tutorial_exp", salt: "tutorial_exp_0623" },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseArgs(argv) {
  const args = {
    reportRoot: path.join("artifacts", "cloudbase-daily-report"),
    outDir: path.join("artifacts", "cloudbase-retention-report"),
    maxOffset: 7,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--date" && next) {
      args.dateFrom = next;
      args.dateTo = next;
      i += 1;
    } else if (token === "--date-from" && next) {
      args.dateFrom = next;
      i += 1;
    } else if (token === "--date-to" && next) {
      args.dateTo = next;
      i += 1;
    } else if (token === "--report-root" && next) {
      args.reportRoot = next;
      i += 1;
    } else if (token === "--out-dir" && next) {
      args.outDir = next;
      i += 1;
    } else if (token === "--max-offset" && next) {
      args.maxOffset = Math.max(1, Math.floor(Number(next) || 7));
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
  npm run analytics:retention -- --date 2026-06-21
  npm run analytics:retention -- --date-from 2026-06-15 --date-to 2026-06-22

Environment variables:
  TCB_API_KEY  CloudBase server-side ApiKey
  TCB_ENV_ID   CloudBase envId
  TCB_API_BASE_URL Optional. Defaults to https://<envId>.api.tcloudbasegateway.com
`);
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    throw new Error(`Invalid date: ${date}. Expected YYYY-MM-DD`);
  }
}

function addDays(date, offset) {
  assertDate(date);
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function dateRange(from, to) {
  assertDate(from);
  assertDate(to);
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    days.push(date);
  }
  return days;
}

function shanghaiDayRange(date) {
  assertDate(date);
  const [year, month, day] = date.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day) - SHANGHAI_OFFSET_MS;
  return { startMs, endMs: startMs + ONE_DAY_MS };
}

function formatShanghaiDate(timestamp) {
  return new Date(Number(timestamp) + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadNdjson(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function parseDatabaseValue(value) {
  if (Array.isArray(value)) return value.map(parseDatabaseValue);
  if (!value || typeof value !== "object") return value;
  if (Object.prototype.hasOwnProperty.call(value, "$numberInt")) return Number(value.$numberInt);
  if (Object.prototype.hasOwnProperty.call(value, "$numberLong")) return Number(value.$numberLong);
  if (Object.prototype.hasOwnProperty.call(value, "$numberDouble")) return Number(value.$numberDouble);
  if (Object.prototype.hasOwnProperty.call(value, "$date")) {
    const raw = value.$date;
    return raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "$numberLong") ? Number(raw.$numberLong) : raw;
  }
  const output = {};
  for (const [key, raw] of Object.entries(value)) output[key] = parseDatabaseValue(raw);
  return output;
}

function createApiKeyBundle() {
  const envId = requireEnv("TCB_ENV_ID");
  return {
    envId,
    apiKey: requireEnv("TCB_API_KEY"),
    baseUrl: process.env.TCB_API_BASE_URL || `https://${envId}.api.tcloudbasegateway.com`,
  };
}

async function fetchProfilesByFirstLoginBefore(apiKeyBundle, endMs) {
  const profiles = new Map();
  for (let offset = 0; ; offset += DATABASE_API_PAGE_SIZE) {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(DATABASE_API_PAGE_SIZE),
      query: JSON.stringify({ firstLoginTime: { $lt: endMs } }),
      sort: JSON.stringify({ firstLoginTime: 1 }),
    });
    const url = `${apiKeyBundle.baseUrl}/v1/database/instances/(default)/databases/(default)/collections/user_profile/documents?${params}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKeyBundle.apiKey}`,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`CloudBase user_profile query failed with status ${response.status}: ${text.slice(0, 300)}`);
    }
    const body = text ? JSON.parse(text) : {};
    const items = Array.isArray(body.list) ? body.list.map(parseDatabaseValue) : [];
    for (const profile of items) {
      if (!profile.openid) continue;
      const firstLoginTime = Number(profile.firstLoginTime || profile.createTime || 0);
      profiles.set(profile.openid, {
        openid: profile.openid,
        firstLoginTime,
        firstLoginDate: firstLoginTime > 0 ? formatShanghaiDate(firstLoginTime) : "",
      });
    }
    if (items.length < DATABASE_API_PAGE_SIZE) break;
  }
  return profiles;
}

function findBehaviorPath(reportRoot, date) {
  const summaryPath = path.join(reportRoot, date, "combined_summary.json");
  if (!fs.existsSync(summaryPath)) return "";
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  return summary.collections?.user_behavior?.exportInfo?.localPath || "";
}

function loadDailyUserSets(reportRoot, dates) {
  const activeByDate = new Map();
  const l1PassByDate = new Map();
  const missingDates = [];
  for (const date of dates) {
    const behaviorPath = findBehaviorPath(reportRoot, date);
    if (!behaviorPath || !fs.existsSync(behaviorPath)) {
      activeByDate.set(date, null);
      l1PassByDate.set(date, null);
      missingDates.push(date);
      continue;
    }
    const active = new Set();
    const l1Pass = new Set();
    for (const record of loadNdjson(behaviorPath)) {
      const openid = record.openid || "";
      if (!openid) continue;
      active.add(openid);
      if (record.eventName === "level_pass" && Number(record.levelId) === 1) {
        l1Pass.add(openid);
      }
    }
    activeByDate.set(date, active);
    l1PassByDate.set(date, l1Pass);
  }
  return { activeByDate, l1PassByDate, missingDates };
}

function unionPassUsersUntil(l1PassByDate, date) {
  const users = new Set();
  for (const [day, set] of l1PassByDate.entries()) {
    if (day > date || !set) continue;
    for (const openid of set) users.add(openid);
  }
  return users;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function fnv1aHash(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function bucketFromSalt(openid, experimentId, salt) {
  if (!openid) return "NULL";
  const slot = fnv1aHash(`${experimentId}:${salt}:${openid}`) % 100;
  if (slot < 25) return "A";
  if (slot < 50) return "B";
  if (slot < 75) return "C";
  return "D";
}

function buildRetentionRows(cohortUsers, activeByDate, baseDate, maxOffset) {
  const baseCount = cohortUsers.size;
  const retainedByOffset = [];
  const t1Date = addDays(baseDate, 1);
  const t1Active = activeByDate.get(t1Date);
  const t1Users = t1Active ? intersectionSet(cohortUsers, t1Active) : null;
  const t1Count = t1Users ? t1Users.size : null;
  for (let offset = 1; offset <= maxOffset; offset += 1) {
    const date = addDays(baseDate, offset);
    const active = activeByDate.get(date);
    const retainedUsers = active ? countIntersection(cohortUsers, active) : null;
    const retainedFromT1Users = active && t1Users ? countIntersection(t1Users, active) : null;
    retainedByOffset.push({
      offset,
      date,
      retainedUsers,
      retainedFromT1Users,
      rateFromT: retainedUsers == null ? null : ratio(retainedUsers, baseCount),
      rateFromT1: retainedFromT1Users == null || t1Count == null ? null : ratio(retainedFromT1Users, t1Count),
    });
  }
  return { baseUsers: baseCount, t1Users: t1Count, retainedByOffset };
}

function intersectDateRange(missingDates, from, to) {
  return missingDates.filter((date) => date >= from && date <= to);
}

function countIntersection(left, right) {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

function intersectionSet(left, right) {
  const users = new Set();
  for (const item of left) {
    if (right.has(item)) users.add(item);
  }
  return users;
}

function splitCohorts(activeUsers, profiles, baseDate, effectivePassUsers = null) {
  const cohorts = {
    all: new Set(),
    new: new Set(),
    old: new Set(),
    unknown: new Set(),
  };
  for (const openid of activeUsers || []) {
    if (effectivePassUsers && !effectivePassUsers.has(openid)) continue;
    cohorts.all.add(openid);
    const profile = profiles.get(openid);
    if (!profile?.firstLoginDate) {
      cohorts.unknown.add(openid);
    } else if (profile.firstLoginDate === baseDate) {
      cohorts.new.add(openid);
    } else if (profile.firstLoginDate < baseDate) {
      cohorts.old.add(openid);
    } else {
      cohorts.unknown.add(openid);
    }
  }
  return cohorts;
}

function buildExperimentBucketRows(baseUsers, profiles, baseDate, activeByDate, maxOffset, experiment) {
  return EXPERIMENT_GROUP_SPECS.map((spec) => {
    const users = new Set();
    for (const openid of baseUsers || []) {
      const bucket = bucketFromSalt(openid, experiment.sourceExperimentId, experiment.salt);
      if (spec.buckets.includes(bucket)) users.add(openid);
    }
    const cohorts = splitCohorts(users, profiles, baseDate);
    return {
      rowType: "group",
      experimentId: experiment.experimentId,
      sourceExperimentId: experiment.sourceExperimentId,
      salt: experiment.salt,
      bucket: spec.bucket,
      group: spec.group,
      groupLabel: spec.groupLabel,
      cohortUsers: users.size,
      cohorts: Object.fromEntries(
        Object.entries(cohorts).map(([name, cohortUsers]) => [
          name,
          buildRetentionRows(cohortUsers, activeByDate, baseDate, maxOffset),
        ]),
      ),
    };
  });
}

function buildExperimentRetention({ activeUsers, effectivePassUsers, profiles, date, activeByDate, maxOffset }) {
  const effectiveActiveUsers = new Set();
  for (const openid of activeUsers || []) {
    if (effectivePassUsers.has(openid)) effectiveActiveUsers.add(openid);
  }
  const buildScope = (scopeUsers) => Object.fromEntries(
    SALT_COMPUTED_EXPERIMENTS.map((experiment) => [
      experiment.experimentId,
      {
        experimentId: experiment.experimentId,
        sourceExperimentId: experiment.sourceExperimentId,
        salt: experiment.salt,
        scopeUsers: scopeUsers.size,
        groupRows: buildExperimentBucketRows(scopeUsers, profiles, date, activeByDate, maxOffset, experiment),
      },
    ]),
  );
  return {
    allUsers: buildScope(activeUsers),
    effectiveUsers: buildScope(effectiveActiveUsers),
  };
}

function buildDateReport({ date, activeByDate, l1PassByDate, profiles, maxOffset, missingDates, historyFrom }) {
  const activeUsers = activeByDate.get(date) || new Set();
  const effectivePassUsers = unionPassUsersUntil(l1PassByDate, date);
  const allCohorts = splitCohorts(activeUsers, profiles, date);
  const effectiveCohorts = splitCohorts(activeUsers, profiles, date, effectivePassUsers);
  const missingHistoryDates = intersectDateRange(missingDates, historyFrom, date);
  const missingRetentionDates = intersectDateRange(missingDates, addDays(date, 1), addDays(date, maxOffset));
  const toMetrics = (cohorts) => Object.fromEntries(
    Object.entries(cohorts).map(([name, users]) => [name, buildRetentionRows(users, activeByDate, date, maxOffset)]),
  );
  return {
    schemaVersion: 1,
    date,
    historyFrom,
    maxOffset,
    generatedAt: new Date().toISOString(),
    cohortDefinitions: {
      activeUser: "user_behavior 当天出现过 openid",
      newUser: "user_profile.firstLoginTime 属于 T 当天",
      oldUser: "user_profile.firstLoginTime 早于 T 当天",
      effectiveUser: "T 当天活跃，且在 T 当天或过往 user_behavior 中出现过 level_pass + levelId=1",
      experimentBucket: "只使用 openid + salt 的 hash 分桶；缺失 openid 归入 NULL，不使用埋点实验字段",
    },
    allUsers: toMetrics(allCohorts),
    effectiveUsers: toMetrics(effectiveCohorts),
    experimentRetention: buildExperimentRetention({
      activeUsers,
      effectivePassUsers,
      profiles,
      date,
      activeByDate,
      maxOffset,
    }),
    dataQuality: {
      baseActiveUsers: activeUsers.size,
      effectivePassUsersKnownUntilDate: effectivePassUsers.size,
      profileUsersLoaded: profiles.size,
      unknownProfileUsers: allCohorts.unknown.size,
      missingDailyReportDates: Array.from(new Set([...missingHistoryDates, ...missingRetentionDates])),
      missingHistoryDates,
      missingRetentionDates,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.dateFrom || !args.dateTo) {
    throw new Error("Missing --date or --date-from/--date-to");
  }
  const reportDates = dateRange(args.dateFrom, args.dateTo);
  const neededEndDate = addDays(args.dateTo, args.maxOffset);
  const availableDates = fs.readdirSync(args.reportRoot).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort();
  const historyFrom = availableDates.find((date) => date <= args.dateFrom) || args.dateFrom;
  const loadDates = dateRange(historyFrom, neededEndDate);
  const { activeByDate, l1PassByDate, missingDates } = loadDailyUserSets(args.reportRoot, loadDates);
  const profileEndMs = shanghaiDayRange(addDays(args.dateTo, 1)).startMs;
  const profiles = await fetchProfilesByFirstLoginBefore(createApiKeyBundle(), profileEndMs);

  ensureDir(args.outDir);
  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dateFrom: args.dateFrom,
    dateTo: args.dateTo,
    historyFrom,
    maxOffset: args.maxOffset,
    dates: reportDates,
    reportRoot: args.outDir,
  };
  for (const date of reportDates) {
    const report = buildDateReport({ date, activeByDate, l1PassByDate, profiles, maxOffset: args.maxOffset, missingDates, historyFrom });
    const dateDir = path.join(args.outDir, date);
    ensureDir(dateDir);
    fs.writeFileSync(path.join(dateDir, "retention_summary.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[retention] wrote ${dateDir}/retention_summary.json`);
  }
  fs.writeFileSync(path.join(args.outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`[retention] wrote ${path.join(args.outDir, "index.json")}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
