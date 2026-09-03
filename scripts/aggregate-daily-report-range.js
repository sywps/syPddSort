#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const REPORT_ROOT = path.join(process.cwd(), "artifacts", "cloudbase-daily-report");
const PCH_FUNNEL_EVENT_NAMES = new Set([
  "pch_first_store_success",
  "pch_first_return_success",
  "pch_guide_step_shown",
  "pch_guide_tap_result",
  "pch_guide_step_done",
]);
const RETIRED_PCH_STAT_FIELDS = [
  "selectionAttempts",
  "selectionSuccesses",
  "selectionInvalid",
  "selectionCapacityBlocked",
  "selectionPartial",
  "storedBeanCount",
  "autoReturnedBeanCount",
  "maxBufferOccupancy",
  "bufferFullEpisodes",
  "bufferFullReviveSuccesses",
  "capacityAddedProactiveAd",
  "capacityAddedBufferFullRevive",
  "capacityAddedGuideFree",
  "initialBufferCapacity",
  "finalBufferCapacity",
  "singleSelectionLimit",
  "magnetMovedBeans",
  "brushMovedBeans",
  "manual2xUsed",
  "manual3xUsed",
  "auto5xUsed",
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function assertDateLabel(label, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(label || ""))) {
    throw new Error(`${name} must be YYYY-MM-DD, got ${label || ""}`);
  }
}

function toUtcDate(label) {
  const [year, month, day] = label.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sourceDateRange(from, to) {
  assertDateLabel(from, "from");
  assertDateLabel(to, "to");
  const result = [];
  for (let cursor = toUtcDate(from); cursor <= toUtcDate(to); cursor = new Date(cursor.getTime() + 86400000)) {
    result.push(formatDate(cursor));
  }
  return result;
}

function readSummary(date) {
  const file = path.join(REPORT_ROOT, date, "combined_summary.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Missing source summary: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 4) {
  const n = num(value);
  return Number(n.toFixed(digits));
}

function ratio(numerator, denominator) {
  const base = num(denominator);
  return base > 0 ? round(num(numerator) / base) : 0;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + num(row?.[field]), 0);
}

function weighted(rows, field, weights = ["recordCount", "enterPv", "enterUv", "users", "sessions", "showNum"]) {
  let totalWeight = 0;
  let total = 0;
  for (const row of rows) {
    const value = Number(row?.[field]);
    if (!Number.isFinite(value)) continue;
    const weight = weights.map((key) => num(row?.[key])).find((item) => item > 0) || 1;
    totalWeight += weight;
    total += value * weight;
  }
  return totalWeight > 0 ? round(total / totalWeight, 2) : 0;
}

function weightedMedian(rows, field, weightField = "recordCount") {
  const points = rows
    .map((row) => ({ value: Number(row?.[field]), weight: num(row?.[weightField]) || 1 }))
    .filter((row) => Number.isFinite(row.value) && row.weight > 0)
    .sort((a, b) => a.value - b.value);
  const total = points.reduce((acc, row) => acc + row.weight, 0);
  let seen = 0;
  for (const row of points) {
    seen += row.weight;
    if (seen >= total / 2) return round(row.value, 2);
  }
  return 0;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function levelKey(row) {
  return row?.isTotal || row?.levelId === "All" || row?.levelId === "全部" ? "__all__" : String(row?.levelId ?? "");
}

function levelSort(a, b) {
  if (a.isTotal !== b.isTotal) return a.isTotal ? 1 : -1;
  return num(a.levelId) - num(b.levelId);
}

function diagnoseLevel(row) {
  if (!num(row.enterUv)) return "暂无进入数据";
  if (num(row.enterUv) >= 10 && ratio(row.passUv, row.enterUv) < 0.35 && num(row.failUv) <= 1) {
    return "低通过且显式失败少，优先查中途退出、卡住或日志缺口";
  }
  return row.isTotal ? "全部关卡汇总" : "观察";
}

function aggregateLevelRows(rows) {
  const out = [];
  for (const [key, group] of groupBy(rows, levelKey)) {
    const first = clone(group[0] || {});
    const row = { ...first };
    for (const field of RETIRED_PCH_STAT_FIELDS) delete row[field];
    for (const field of ["enterUv", "enterPv", "passUv", "passPv", "failUv", "failPv", "enterNotPassUv", "silentDropUv", "recordCount", "uniqueUsers", "adReviveCount", "adShowPv", "adFinishPv", "magnetUses", "brushUses", "freezeUses"]) {
      row[field] = sum(group, field);
    }
    row.isTotal = key === "__all__" || !!first.isTotal;
    row.levelId = row.isTotal ? (first.levelId || "All") : Number(first.levelId);
    row.uvPassRate = ratio(row.passUv, row.enterUv);
    row.pvPassRate = ratio(row.passPv, row.enterPv);
    row.passRate = ratio(row.passPv, row.recordCount);
    row.avgTryCount = weighted(group, "avgTryCount", ["recordCount", "enterPv", "enterUv"]);
    row.avgDurationSeconds = weighted(group, "avgDurationSeconds", ["recordCount", "enterPv", "enterUv"]);
    row.medianDurationSeconds = weightedMedian(group, "medianDurationSeconds", "recordCount");
    row.diagnosis = diagnoseLevel(row);
    out.push(row);
  }
  return out.sort(levelSort);
}

function aggregateAdPerformanceRows(rows) {
  const out = [];
  for (const [, group] of groupBy(rows, (row) => `${row?.adType || ""}|${row?.page || ""}|${row?.label || ""}|${row?.isTotal ? "total" : ""}`)) {
    const row = { ...clone(group[0] || {}) };
    for (const field of ["showNum", "clickNum", "finishNum", "userNum"]) row[field] = sum(group, field);
    delete row.clickRate;
    row.showRate = ratio(row.showNum, row.clickNum);
    row.finishRate = ratio(row.finishNum, row.showNum);
    row.finishPerClickRate = ratio(row.finishNum, row.clickNum);
    out.push(row);
  }
  return out.sort((a, b) => num(b.showNum) - num(a.showNum));
}

function aggregateLevelAdRows(rows) {
  const out = [];
  for (const [key, group] of groupBy(rows, levelKey)) {
    const row = { ...clone(group[0] || {}) };
    for (const field of ["enterUv", "passUv", "failUv", "enterNotPassUv", "adShowPv", "adClickPv", "adFinishPv", "adShowUv", "adFinishUv", "notPassWithAdFinishUv", "notPassWithoutAdFinishUv"]) {
      row[field] = sum(group, field);
    }
    row.isTotal = key === "__all__" || !!row.isTotal;
    row.levelId = row.isTotal ? (row.levelId || "全部") : Number(row.levelId);
    row.focus = group.some((item) => !!item.focus);
    row.uvPassRate = ratio(row.passUv, row.enterUv);
    row.adFinishRate = ratio(row.adFinishPv, row.adShowPv);
    row.adFinishPerEnterRate = ratio(row.adFinishUv, row.enterUv);
    row.pureLossRate = ratio(row.notPassWithoutAdFinishUv, row.enterUv);
    row.compensationRate = ratio(row.notPassWithAdFinishUv, row.enterNotPassUv);
    out.push(row);
  }
  return out.sort(levelSort);
}

function aggregateLatency(rows) {
  const latencies = rows.map((row) => row?.latencyToNextMs).filter(Boolean);
  if (!latencies.length) return null;
  const first = clone(latencies[0]);
  for (const field of ["sampleSessions", "validSessions", "pairedSessions", "reversedSessions"]) first[field] = sum(latencies, field);
  const weightRows = latencies.map((row) => ({ ...row, sessions: num(row.sampleSessions) || num(row.validSessions) || num(row.pairedSessions) || 1 }));
  for (const field of ["p1", "p5", "p50", "p95", "p99"]) first[field] = Math.round(weighted(weightRows, field, ["sessions"]));
  first.isReliable = latencies.every((row) => row.isReliable);
  first.note = first.isReliable ? "synthetic weighted daily percentiles; not raw-session recompute" : "事件顺序不稳定，且本合成报告只基于每日摘要加权";
  return first;
}

function aggregateFunnelRows(rows) {
  const pchRows = (rows || []).filter((row) => PCH_FUNNEL_EVENT_NAMES.has(row?.eventName));
  const order = [];
  const grouped = groupBy(pchRows, (row) => row?.eventName || row?.label || "");
  for (const row of pchRows) {
    const key = row?.eventName || row?.label || "";
    if (key && !order.includes(key)) order.push(key);
  }
  const out = order.map((key) => {
    const group = grouped.get(key) || [];
    const row = { ...clone(group[0] || {}) };
    for (const field of ["records", "sessions", "users"]) row[field] = sum(group, field);
    row.latencyToNextMs = aggregateLatency(group);
    return row;
  });
  const start = out[0] || {};
  for (let i = 0; i < out.length; i += 1) {
    out[i].sessionRateFromStart = ratio(out[i].sessions, start.sessions);
    out[i].userRateFromStart = ratio(out[i].users, start.users);
    out[i].sessionStepRate = i === 0 ? 0 : ratio(out[i].sessions, out[i - 1].sessions);
  }
  return out;
}

function aggregateTapRows(rows) {
  const out = [];
  for (const [, group] of groupBy(rows, (row) => row?.key || row?.step || row?.label || "")) {
    const row = { ...clone(group[0] || {}) };
    for (const field of ["records", "sessions", "users"]) row[field] = sum(group, field);
    out.push(row);
  }
  return out.sort((a, b) => num(b.records) - num(a.records));
}

function aggregateReviveAdFunnel(rows) {
  const out = [];
  for (const [, group] of groupBy(rows, (row) => `${row?.levelId ?? row?.logicalLevelId ?? ""}|${row?.page || ""}`)) {
    const first = clone(group[0] || {});
    const levelId = num(first.levelId || first.logicalLevelId);
    if (!levelId || !first.page) continue;
    const row = {
      levelId,
      page: first.page,
      panelShowNum: sum(group, "panelShowNum"),
      clickNum: sum(group, "clickNum"),
      showNum: sum(group, "showNum"),
      finishNum: sum(group, "finishNum"),
      reviveSuccessNum: sum(group, "reviveSuccessNum"),
      userNum: sum(group, "userNum"),
    };
    row.panelClickRate = ratio(row.clickNum, row.panelShowNum);
    row.adShowRate = ratio(row.showNum, row.clickNum);
    row.adFinishRate = ratio(row.finishNum, row.showNum);
    row.reviveSuccessRate = ratio(row.reviveSuccessNum, row.finishNum);
    out.push(row);
  }
  return out.sort((a, b) => a.levelId - b.levelId || a.page.localeCompare(b.page));
}

function aggregateReviveShareFunnel(rows) {
  const out = [];
  for (const [, group] of groupBy(rows, (row) => `${row?.levelId ?? row?.logicalLevelId ?? ""}|${row?.page || ""}`)) {
    const first = clone(group[0] || {});
    const levelId = num(first.levelId || first.logicalLevelId);
    if (!levelId || !first.page) continue;
    const row = {
      levelId,
      page: first.page,
      panelShowNum: sum(group, "panelShowNum"),
      shareClickNum: sum(group, "shareClickNum"),
      qualifiedReturnNum: sum(group, "qualifiedReturnNum"),
      shareReviveSuccessNum: sum(group, "shareReviveSuccessNum"),
      userNum: sum(group, "userNum"),
    };
    row.panelShareClickRate = ratio(row.shareClickNum, row.panelShowNum);
    row.qualifiedReturnRate = ratio(row.qualifiedReturnNum, row.shareClickNum);
    row.shareReviveSuccessRate = ratio(row.shareReviveSuccessNum, row.qualifiedReturnNum);
    out.push(row);
  }
  return out.sort((a, b) => a.levelId - b.levelId || a.page.localeCompare(b.page));
}

function aggregatePixelBeanProgress(items) {
  const values = (items || []).filter(Boolean);
  if (!values.length) return null;
  const levelRows = [];
  for (const [, group] of groupBy(values.flatMap((item) => item.levels || []), (row) => String(row?.levelId || ""))) {
    const levelId = num(group[0]?.levelId);
    if (!levelId) continue;
    const row = {
      levelId,
      enterUv: sum(group, "enterUv"),
      enterPv: sum(group, "enterPv"),
      passUv: sum(group, "passUv"),
      passPv: sum(group, "passPv"),
      failUv: sum(group, "failUv"),
      failPv: sum(group, "failPv"),
    };
    row.uvPassRate = ratio(row.passUv, row.enterUv);
    levelRows.push(row);
  }
  const distribution = [];
  for (const [, group] of groupBy(
    values.flatMap((item) => item.maxEnteredLevelDistribution || []),
    (row) => String(row?.levelId || ""),
  )) {
    const levelId = num(group[0]?.levelId);
    if (levelId) distribution.push({ levelId, users: sum(group, "users") });
  }
  const overallRows = values.map((item) => item.overall || {});
  return {
    scope: "synthetic daily sum; lifecycle gameplayEntryMode=theme with legacy page fallback",
    overall: {
      activeUsers: sum(overallRows, "activeUsers"),
      enterUsers: sum(overallRows, "enterUsers"),
      passUsers: sum(overallRows, "passUsers"),
      failUsers: sum(overallRows, "failUsers"),
      highestEnteredLevel: Math.max(0, ...overallRows.map((row) => num(row.highestEnteredLevel))),
      highestPassedLevel: Math.max(0, ...overallRows.map((row) => num(row.highestPassedLevel))),
    },
    levels: levelRows.sort((a, b) => a.levelId - b.levelId),
    maxEnteredLevelDistribution: distribution.sort((a, b) => a.levelId - b.levelId),
  };
}

function aggregatePixelBeanAds(items) {
  const values = (items || []).filter(Boolean);
  if (!values.length) return null;
  const rows = [];
  for (const [, group] of groupBy(
    values.flatMap((item) => item.rows || []),
    (row) => `${row?.levelId || ""}|${row?.adType || ""}|${row?.page || ""}`,
  )) {
    const first = clone(group[0] || {});
    const row = {
      levelId: num(first.levelId),
      adType: first.adType || "unknown",
      page: first.page || "unknown",
      label: first.label || first.page || "unknown",
      clickNum: sum(group, "clickNum"),
      showNum: sum(group, "showNum"),
      finishNum: sum(group, "finishNum"),
      rewardSuccessNum: sum(group, "rewardSuccessNum"),
      userNum: sum(group, "userNum"),
    };
    if (!row.levelId) continue;
    row.adShowRate = ratio(row.showNum, row.clickNum);
    row.adFinishRate = ratio(row.finishNum, row.showNum);
    row.rewardSuccessRate = ratio(row.rewardSuccessNum, row.finishNum);
    rows.push(row);
  }
  const overallRows = values.map((item) => item.overall || {});
  const overall = {
    clickNum: sum(overallRows, "clickNum"),
    showNum: sum(overallRows, "showNum"),
    finishNum: sum(overallRows, "finishNum"),
    rewardSuccessNum: sum(overallRows, "rewardSuccessNum"),
    userNum: sum(overallRows, "userNum"),
  };
  return {
    scope: "synthetic daily sum; gameplayEntryMode=theme only",
    overall: {
      ...overall,
      adShowRate: ratio(overall.showNum, overall.clickNum),
      adFinishRate: ratio(overall.finishNum, overall.showNum),
      rewardSuccessRate: ratio(overall.rewardSuccessNum, overall.finishNum),
    },
    rows: rows.sort((a, b) => a.levelId - b.levelId || a.page.localeCompare(b.page)),
  };
}

function aggregateCoreMetrics(items, targetDate) {
  const out = { ...clone(items[0] || {}), date: targetDate };
  for (const field of Object.keys(out)) {
    if (typeof out[field] === "number" && !/rate/i.test(field)) out[field] = sum(items, field);
  }
  for (const field of ["l1FunnelStartUv", "l1FunnelPassUv", "l1FunnelUvPassRate", "firstLevelUiReadySessions", "firstLevelAnyTouchSessions", "firstLevelAnyTouchRate"]) {
    delete out[field];
  }
  out.l1EnterUv = sum(items, "l1EnterUv");
  out.l1PassUv = sum(items, "l1PassUv");
  out.l1FailUv = sum(items, "l1FailUv");
  out.l1EnterNotPassUv = sum(items, "l1EnterNotPassUv");
  out.l1UvPassRate = ratio(out.l1PassUv, out.l1EnterUv);
  out.l1LevelEnterUv = sum(items, "l1LevelEnterUv");
  out.l1LevelPassUv = sum(items, "l1LevelPassUv");
  out.l1LevelEnterPassRate = ratio(out.l1LevelPassUv, out.l1LevelEnterUv);
  out.pchFirstStoreSessions = sum(items, "pchFirstStoreSessions");
  out.pchFirstReturnSessions = sum(items, "pchFirstReturnSessions");
  out.pchFirstStoreToReturnRate = ratio(out.pchFirstReturnSessions, out.pchFirstStoreSessions);
  out.adShowPv = sum(items, "adShowPv");
  out.adClickPv = sum(items, "adClickPv");
  out.adFinishPv = sum(items, "adFinishPv");
  out.adFinishRate = ratio(out.adFinishPv, out.adShowPv);
  return out;
}

function aggregateChurn(churns) {
  const first = clone(churns[0] || {});
  first.baseUsers = sum(churns, "baseUsers");
  first.l1PassUsers = sum(churns, "l1PassUsers");
  first.nextDayAvailable = churns.some((row) => row?.nextDayAvailable);
  first.cohorts = [];
  for (const [, group] of groupBy(churns.flatMap((item) => item?.cohorts || []), (row) => row?.key || row?.label || "")) {
    const cohort = { ...clone(group[0] || {}) };
    cohort.users = sum(group, "users");
    cohort.usersWithActions = sum(group, "usersWithActions");
    cohort.actionCoverageRate = ratio(cohort.usersWithActions, cohort.users);
    for (const listName of ["lastActions", "previousActions", "thirdActions", "lastActionPaths"]) {
      cohort[listName] = aggregateTapRows(group.flatMap((item) => item?.[listName] || []))
        .map((row) => ({ ...row, userRate: ratio(row.users, cohort.users) }))
        .slice(0, 20);
    }
    first.cohorts.push(cohort);
  }
  return first;
}

function aggregateExperimentSection(sections, kind) {
  const out = {};
  for (const section of sections) {
    const id = section?.experimentId;
    if (!id) continue;
    if (!out[id]) out[id] = { ...clone(section), groupRows: [], scopeUsers: 0, attributedScopeUsers: 0, unattributedScopeUsers: 0 };
    out[id].scopeUsers += num(section.scopeUsers);
    out[id].attributedScopeUsers += num(section.attributedScopeUsers);
    out[id].unattributedScopeUsers += num(section.unattributedScopeUsers);
    out[id].groupRows.push(...(section.groupRows || []));
  }
  const rowAggregator = {
    firstLevelFunnel: aggregateFunnelRows,
    first20Levels: aggregateLevelRows,
    levelAdRelationship: aggregateLevelAdRows,
    adPerformance: aggregateAdPerformanceRows,
  }[kind] || aggregateTapRows;
  for (const section of Object.values(out)) {
    const groups = [];
    for (const [, groupRows] of groupBy(section.groupRows, (row) => `${row?.bucket || ""}|${row?.groupLabel || ""}|${row?.group || ""}`)) {
      const group = { ...clone(groupRows[0] || {}) };
      group.cohortUsers = sum(groupRows, "cohortUsers");
      group.l1StartUsers = sum(groupRows, "l1StartUsers");
      group.rows = rowAggregator(groupRows.flatMap((row) => row?.rows || []));
      groups.push(group);
    }
    section.groupRows = groups;
  }
  return out;
}

function aggregateLevelNetValue(levelNetValues) {
  const first = clone(levelNetValues.find(Boolean) || {});
  first.rows = aggregateLevelAdRows(levelNetValues.flatMap((item) => item?.rows || [])).map((row) => {
    const sourceRows = levelNetValues.flatMap((item) => item?.rows || []).filter((item) => levelKey(item) === levelKey(row));
    row.recordCount = sum(sourceRows, "recordCount");
    row.observedDurationSeconds = weighted(sourceRows, "observedDurationSeconds", ["recordCount", "enterUv"]);
    row.baselineDurationSeconds = weighted(sourceRows, "baselineDurationSeconds", ["recordCount", "enterUv"]);
    row.adAdjustedDurationSeconds = weighted(sourceRows, "adAdjustedDurationSeconds", ["recordCount", "enterUv"]);
    for (const field of ["challengeFitScore", "durationFitScore", "flowScore", "userExperienceScore", "revenueScore", "adFrictionScore", "levelNetScore"]) {
      row[field] = Math.round(weighted(sourceRows, field, ["enterUv", "recordCount"]));
    }
    return row;
  });
  return first;
}

function aggregateDataQuality(items) {
  const out = { ...clone(items[0] || {}) };
  for (const field of ["firstLevelFunnelScope", "firstLevelFunnelRecords", "firstLevelFunnelSessions", "firstLevelFunnelAllLevelRecords", "firstLevelFunnelAllLevelSessions"]) {
    delete out[field];
  }
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "number") out[key] = sum(items, key);
  }
  out.pchFunnelScope = "logical_levels=1,2,3";
  out.pchFunnelRecords = sum(items, "pchFunnelRecords");
  out.pchFunnelSessions = sum(items, "pchFunnelSessions");
  out.pchFunnelRawRecords = sum(items, "pchFunnelRawRecords");
  return out;
}

function aggregateDailyDiagnosis(summaries, targetDate, sourceDates) {
  const diags = summaries.map((item) => item.dailyDiagnosis || {});
  const first = clone(diags[0] || {});
  const pchFunnelScope = first.pchFunnelScope || { levelIds: [1, 2, 3], label: "logical_levels=1,2,3" };
  for (const field of ["firstLevelFunnelAllLevels", "firstLevelFunnelScope", "firstLevelFunnelAllLevelsScope", "tutorialTapBreakdown", "tutorialTapByStep", "tutorialTapBreakdownAllLevels", "tutorialTapByStepAllLevels"]) {
    delete first[field];
  }
  const first20 = aggregateLevelRows(diags.flatMap((item) => item.first20Levels || []));
  const adRows = aggregateAdPerformanceRows(diags.flatMap((item) => item.adPerformance?.topByShow || []));
  const adOverall = aggregateAdPerformanceRows(diags.map((item) => ({ ...(item.adPerformance?.overall || {}), adType: "all", page: "all", label: "all", isTotal: true })))[0] || {};
  const levelAd = aggregateLevelAdRows(diags.flatMap((item) => item.levelAdRelationship || []));
  const experimentMaps = {};
  for (const kind of ["firstLevelFunnel", "first20Levels", "levelAdRelationship", "adPerformance"]) {
    experimentMaps[kind] = aggregateExperimentSection(diags.flatMap((item) => Object.values(item.experimentBreakdowns?.[kind] || {})), kind);
  }
  return {
    ...first,
    schemaVersion: "11+synthetic-daily-sum",
    generatedAt: new Date().toISOString(),
    synthetic: {
      type: "daily_sum",
      sourceDates,
      note: "UV/PV/count fields are summed by day; no cross-day UID de-duplication. Medians and latency percentiles are weighted daily-summary approximations.",
    },
    coreMetrics: aggregateCoreMetrics(diags.map((item) => item.coreMetrics || {}), targetDate),
    firstLevelFunnel: aggregateFunnelRows(diags.flatMap((item) => item.firstLevelFunnel || [])),
    pchFunnelScope: { ...pchFunnelScope, label: `logical_levels=1,2,3; synthetic daily sum ${sourceDates[0]}..${sourceDates[sourceDates.length - 1]}` },
    guideTapBreakdown: aggregateTapRows(diags.flatMap((item) => item.guideTapBreakdown || [])),
    guideTapByStep: aggregateTapRows(diags.flatMap((item) => item.guideTapByStep || [])),
    reviveAdFunnel: aggregateReviveAdFunnel(diags.flatMap((item) => item.reviveAdFunnel || [])),
    reviveShareFunnel: aggregateReviveShareFunnel(diags.flatMap((item) => item.reviveShareFunnel || [])),
    pixelBeanProgress: aggregatePixelBeanProgress(diags.map((item) => item.pixelBeanProgress)),
    pixelBeanAds: aggregatePixelBeanAds(diags.map((item) => item.pixelBeanAds)),
    first20Levels: first20,
    mainlineBottlenecks: first20.filter((row) => !row.isTotal).sort((a, b) => num(b.enterNotPassUv) - num(a.enterNotPassUv)).slice(0, 10),
    highRetryLevels: first20.filter((row) => !row.isTotal && num(row.avgTryCount) > 1).sort((a, b) => num(b.avgTryCount) - num(a.avgTryCount)).slice(0, 10),
    adPerformance: { source: "synthetic_daily_sum", isFallback: diags.some((item) => item.adPerformance?.isFallback), overall: adOverall, topByShow: adRows },
    firstDayChurnAnalysis: aggregateChurn(diags.map((item) => item.firstDayChurnAnalysis).filter(Boolean)),
    levelAdRelationship: levelAd,
    experimentBreakdowns: { dataQuality: first.experimentBreakdowns?.dataQuality || {}, ...experimentMaps },
    levelNetValue: aggregateLevelNetValue(diags.map((item) => item.levelNetValue).filter(Boolean)),
    dataQuality: aggregateDataQuality(diags.map((item) => item.dataQuality || {})),
    recommendations: [{
      priority: "P0",
      topic: "合成日报口径",
      finding: `${sourceDates[0]} 到 ${sourceDates[sourceDates.length - 1]} 已按天加总到 ${targetDate}。`,
      action: "该报告用于放大样本观察趋势；UV 是每日 UV 相加，不代表跨天去重用户数。",
    }],
  };
}

function aggregateCollections(summaries, targetDate) {
  const out = {};
  const names = new Set(summaries.flatMap((item) => Object.keys(item.collections || {})));
  for (const name of names) {
    const entries = summaries.map((item) => item.collections?.[name]).filter(Boolean);
    const first = clone(entries[0] || {});
    const summary = { ...(first.summary || {}), date: targetDate, inputPath: "synthetic daily sum" };
    for (const key of Object.keys(summary)) {
      if (typeof summary[key] === "number" && !/rate/i.test(key)) summary[key] = sum(entries.map((item) => item.summary || {}), key);
    }
    if (summary.eventCounts) summary.eventCounts = mergeNumberMaps(entries.map((item) => item.summary?.eventCounts));
    if (summary.pageCounts) summary.pageCounts = mergeNumberMaps(entries.map((item) => item.summary?.pageCounts));
    if (summary.levelRows) summary.levelRows = aggregateLevelRows(entries.flatMap((item) => item.summary?.levelRows || []));
    if (summary.adEventBreakdown) summary.adEventBreakdown = aggregateAdPerformanceRows(entries.flatMap((item) => item.summary?.adEventBreakdown || []));
    if (summary.topByShow) summary.topByShow = aggregateAdPerformanceRows(entries.flatMap((item) => item.summary?.topByShow || []));
    if (entries.some((item) => item.summary?.pixelBeanProgress)) {
      summary.pixelBeanProgress = aggregatePixelBeanProgress(entries.map((item) => item.summary?.pixelBeanProgress));
    }
    if (entries.some((item) => item.summary?.pixelBeanAds)) {
      summary.pixelBeanAds = aggregatePixelBeanAds(entries.map((item) => item.summary?.pixelBeanAds));
    }
    summary.levelOneUvPassRate = ratio(summary.levelOnePassUv, summary.levelOneEnterUv);
    summary.passRate = ratio(summary.passRounds, num(summary.passRounds) + num(summary.failRounds));
    delete summary.clickRate;
    summary.showRate = ratio(summary.totalShowNum, summary.totalClickNum);
    summary.finishRate = ratio(summary.totalFinishNum, summary.totalShowNum);
    summary.finishPerClickRate = ratio(summary.totalFinishNum, summary.totalClickNum);
    first.exportInfo = { ...(first.exportInfo || {}), totalRecords: sum(entries.map((item) => item.exportInfo || {}), "totalRecords"), synthetic: true };
    first.summary = summary;
    out[name] = first;
  }
  return out;
}

function mergeNumberMaps(maps) {
  const out = {};
  for (const map of maps || []) {
    for (const [key, value] of Object.entries(map || {})) out[key] = num(out[key]) + num(value);
  }
  return out;
}

function buildMarkdown(summary) {
  const core = summary.dailyDiagnosis.coreMetrics || {};
  const first20 = summary.dailyDiagnosis.first20Levels || [];
  const lines = [
    `# 拼豆数据日报看板（合成汇总）`,
    ``,
    `- 日期标签：${summary.date}`,
    `- 源日期：${summary.synthetic.sourceDates.join(", ")}`,
    `- 口径：按天加总 UV/PV/count，不做跨天 UID 去重；时长中位数与漏斗分位为每日摘要加权近似。`,
    ``,
    `## 核心指标`,
    ``,
    `| 指标 | 值 |`,
    `| --- | --- |`,
    `| DAU(日UV加总) | ${core.dau || 0} |`,
    `| L1进入UV(日UV加总) | ${core.l1EnterUv || 0} |`,
    `| L1通过UV(日UV加总) | ${core.l1PassUv || 0} |`,
    `| 前三关首次存入Session | ${core.pchFirstStoreSessions || 0} |`,
    `| 前三关首次归位Session | ${core.pchFirstReturnSessions || 0} |`,
    `| 首次存入到首次归位 | ${(num(core.pchFirstStoreToReturnRate) * 100).toFixed(1)}% |`,
    `| 广告曝光PV | ${core.adShowPv || 0} |`,
    `| 广告完成PV | ${core.adFinishPv || 0} |`,
    ``,
    `## 前20关`,
    ``,
    `| 关卡 | 进入UV | 通过UV | 通过/进入UV | 平均时长 |`,
    `| --- | ---: | ---: | ---: | ---: |`,
    ...first20.slice(0, 20).map((row) => `| L${row.levelId} | ${row.enterUv || 0} | ${row.passUv || 0} | ${(num(row.uvPassRate) * 100).toFixed(1)}% | ${num(row.avgDurationSeconds).toFixed(2)}s |`),
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv);
  const from = args.from;
  const to = args.to;
  const targetDate = args.date;
  assertDateLabel(targetDate, "date");
  const dates = sourceDateRange(from, to);
  const summaries = dates.map(readSummary);
  const output = {
    ...clone(summaries[0]),
    date: targetDate,
    synthetic: {
      type: "daily_sum",
      sourceDates: dates,
      sourceDateRange: { from, to },
      generatedAt: new Date().toISOString(),
      note: "Synthetic report; daily metrics are summed across source dates without cross-day UID de-duplication.",
    },
    collections: aggregateCollections(summaries, targetDate),
    dailyDiagnosis: aggregateDailyDiagnosis(summaries, targetDate, dates),
  };
  output.dailyDiagnosis.coreMetrics.date = targetDate;
  const outDir = path.join(REPORT_ROOT, targetDate);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "combined_summary.json"), `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "combined_report.md"), buildMarkdown(output));
  console.log(`Wrote ${path.join(outDir, "combined_summary.json")}`);
  console.log(`Wrote ${path.join(outDir, "combined_report.md")}`);
}

main();
