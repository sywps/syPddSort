#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    reportRoot: path.join("artifacts", "cloudbase-daily-report"),
    outDir: path.join("artifacts", "level-duration-matrix"),
    minPassLevel: 10,
    maxLevelId: 999,
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
    } else if (token === "--min-pass-level" && next) {
      args.minPassLevel = Math.max(1, Math.floor(Number(next) || 10));
      i += 1;
    } else if (token === "--max-level-id" && next) {
      args.maxLevelId = Math.max(1, Math.floor(Number(next) || 999));
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
  npm run analytics:level-duration -- --date-from 2026-06-15 --date-to 2026-06-22

Inputs:
  Reads existing artifacts/cloudbase-daily-report/YYYY-MM-DD/combined_summary.json.

Outputs:
  artifacts/level-duration-matrix/YYYY-MM-DD_to_YYYY-MM-DD/level_duration_long.csv
  artifacts/level-duration-matrix/YYYY-MM-DD_to_YYYY-MM-DD/level_duration_wide.csv
  artifacts/level-duration-matrix/YYYY-MM-DD_to_YYYY-MM-DD/summary.json

Defaults:
  --min-pass-level 10
  --max-level-id 999  Excludes special/challenge levels with levelId >= 1000.
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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadNdjson(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function writeCsv(filePath, headers, rows) {
  const escapeCell = (value) => {
    const stringValue = value == null ? "" : String(value);
    if (/[",\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
    return stringValue;
  };
  fs.writeFileSync(filePath, `${[headers.join(","), ...rows.map((row) => row.map(escapeCell).join(","))].join("\n")}\n`);
}

function hashOpenid(openid) {
  return crypto.createHash("sha256").update(String(openid)).digest("hex").slice(0, 16);
}

function findLevelRecordPath(reportRoot, date) {
  const summaryPath = path.join(reportRoot, date, "combined_summary.json");
  if (!fs.existsSync(summaryPath)) return "";
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  return summary.collections?.level_record?.exportInfo?.localPath || "";
}

function pickQuantile(sortedValues, q) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * q) - 1));
  return Math.round(sortedValues[index]);
}

function buildLevelSummary(rows, maxLevel) {
  const byLevel = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.durationMs)) continue;
    if (!byLevel.has(row.levelId)) byLevel.set(row.levelId, []);
    byLevel.get(row.levelId).push(row.durationMs);
  }
  const summary = [];
  for (let levelId = 1; levelId <= maxLevel; levelId += 1) {
    const values = (byLevel.get(levelId) || []).sort((a, b) => a - b);
    summary.push({
      levelId,
      sampleUsers: values.length,
      avgDurationMs: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
      p25Ms: pickQuantile(values, 0.25),
      p50Ms: pickQuantile(values, 0.5),
      p75Ms: pickQuantile(values, 0.75),
      p90Ms: pickQuantile(values, 0.9),
      p95Ms: pickQuantile(values, 0.95),
    });
  }
  return summary;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.dateFrom || !args.dateTo) {
    throw new Error("Missing --date-from/--date-to or --date");
  }
  const dates = dateRange(args.dateFrom, args.dateTo);
  const missingDates = [];
  const users = new Map();
  let skippedSpecialLevelRecords = 0;

  for (const date of dates) {
    const filePath = findLevelRecordPath(args.reportRoot, date);
    if (!filePath || !fs.existsSync(filePath)) {
      missingDates.push(date);
      continue;
    }
    for (const record of loadNdjson(filePath)) {
      const openid = record.openid || "";
      const levelId = Number(record.levelId);
      const startTime = Number(record.startTime) || 0;
      const endTime = Number(record.endTime) || 0;
      const passStatus = Boolean(record.passStatus);
      if (!openid || !Number.isFinite(levelId) || levelId < 1 || !passStatus) continue;
      if (levelId > args.maxLevelId) {
        skippedSpecialLevelRecords += 1;
        continue;
      }
      if (!users.has(openid)) {
        users.set(openid, {
          openid,
          maxPassedLevel: 0,
          levels: new Map(),
        });
      }
      const user = users.get(openid);
      user.maxPassedLevel = Math.max(user.maxPassedLevel, levelId);
      const durationMs = startTime > 0 && endTime > startTime ? endTime - startTime : null;
      const existing = user.levels.get(levelId);
      if (!existing || endTime < existing.passTs) {
        user.levels.set(levelId, {
          levelId,
          date,
          enterTs: startTime || null,
          passTs: endTime || null,
          durationMs,
          tryCount: Number(record.tryCount) || 0,
          useAdRevive: Boolean(record.useAdRevive),
          useShareRevive: Boolean(record.useShareRevive),
        });
      }
    }
  }

  const qualifiedUsers = [...users.values()].filter((user) => user.maxPassedLevel >= args.minPassLevel);
  const maxLevel = qualifiedUsers.reduce((max, user) => Math.max(max, user.maxPassedLevel), 0);
  const longRows = [];
  for (const user of qualifiedUsers.sort((a, b) => a.openid.localeCompare(b.openid))) {
    const openidHash = hashOpenid(user.openid);
    for (let levelId = 1; levelId <= user.maxPassedLevel; levelId += 1) {
      const level = user.levels.get(levelId) || {};
      longRows.push({
        openidHash,
        maxPassedLevel: user.maxPassedLevel,
        levelId,
        date: level.date || "",
        enterTs: level.enterTs || "",
        passTs: level.passTs || "",
        durationMs: level.durationMs == null ? "" : level.durationMs,
        tryCount: level.tryCount || "",
        useAdRevive: level.useAdRevive ? 1 : 0,
        useShareRevive: level.useShareRevive ? 1 : 0,
        quality: level.durationMs == null ? "missing_pass_record_or_time" : "ok",
      });
    }
  }

  const outDir = path.join(args.outDir, `${args.dateFrom}_to_${args.dateTo}`);
  ensureDir(outDir);
  writeCsv(
    path.join(outDir, "level_duration_long.csv"),
    ["openidHash", "maxPassedLevel", "levelId", "date", "enterTs", "passTs", "durationMs", "tryCount", "useAdRevive", "useShareRevive", "quality"],
    longRows.map((row) => [
      row.openidHash,
      row.maxPassedLevel,
      row.levelId,
      row.date,
      row.enterTs,
      row.passTs,
      row.durationMs,
      row.tryCount,
      row.useAdRevive,
      row.useShareRevive,
      row.quality,
    ]),
  );

  writeCsv(
    path.join(outDir, "level_duration_wide.csv"),
    ["openidHash", "maxPassedLevel", ...Array.from({ length: maxLevel }, (_, index) => `L${index + 1}_ms`)],
    qualifiedUsers.map((user) => {
      const row = [hashOpenid(user.openid), user.maxPassedLevel];
      for (let levelId = 1; levelId <= maxLevel; levelId += 1) {
        row.push(user.levels.get(levelId)?.durationMs ?? "");
      }
      return row;
    }),
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    dateFrom: args.dateFrom,
    dateTo: args.dateTo,
    minPassLevel: args.minPassLevel,
    maxLevelId: args.maxLevelId,
    inputDates: dates,
    missingDates,
    skippedSpecialLevelRecords,
    totalPassUsers: users.size,
    qualifiedUsers: qualifiedUsers.length,
    maxLevel,
    outputDir: outDir,
    files: {
      longCsv: path.join(outDir, "level_duration_long.csv"),
      wideCsv: path.join(outDir, "level_duration_wide.csv"),
      summaryJson: path.join(outDir, "summary.json"),
    },
    levelSummary: buildLevelSummary(longRows, maxLevel),
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[level-duration] wrote ${outDir}`);
  console.log(`[level-duration] qualified users: ${qualifiedUsers.length}, max level: ${maxLevel}`);
}

main();
