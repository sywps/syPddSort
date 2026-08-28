const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function methodBody(source, methodName) {
    const marker = `${methodName}(`;
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `missing method ${methodName}`);
    const brace = source.indexOf('{', start);
    assert.ok(brace >= 0, `missing body for ${methodName}`);
    let depth = 0;
    for (let index = brace; index < source.length; index += 1) {
        const ch = source[index];
        if (ch === '{') depth += 1;
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(brace, index + 1);
        }
    }
    throw new Error(`unterminated method ${methodName}`);
}

const analytics = read('assets/Scripts/Core/AnalyticsMgr.ts');
const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const addBehaviorData = read('cloudfunctions/addBehaviorData/index.js');
const saveLevelRecord = read('cloudfunctions/saveLevelRecord/index.js');
const calcLevelRate = read('cloudfunctions/calcLevelRate/index.js');
const dashboard = read('cloudfunctions/getAllDashboardData/index.js');
const dailyJob = read('scripts/user-behavior-daily-job.js');

const hideBody = methodBody(analytics, 'handleHide');
assert.ok(!hideBody.includes('abandonActiveLevel'), 'app hide must not finalize the active level as failure/abandon');
assert.ok(hideBody.includes("eventName: 'app_hide'"), 'app hide must still emit app_hide funnel signal');
assert.ok(hideBody.includes("eventName: 'game_exit'"), 'app hide must still emit game_exit behavior signal');

assert.ok(analytics.includes("type LevelRecordEndReason = 'pass' | 'fail' | 'abandon'"), 'analytics must model level record end reason');
assert.ok(analytics.includes("void this.finalizeActiveLevel(false, 'abandon')"), 'level switches/abandon must use abandon endReason');
assert.ok(methodBody(analytics, 'finalizePendingFailedLevel').includes("void this.finalizeActiveLevel(false, 'fail')"), 'pending gameplay failure must finalize as fail');
assert.ok(methodBody(analytics, 'markLevelPassed').includes('normalizePositiveLevelId(levelIdFallback)'), 'pass event must have explicit level fallback');
assert.ok(methodBody(analytics, 'markLevelFailed').includes('normalizePositiveLevelId(levelIdFallback)'), 'fail event must have explicit level fallback');
assert.ok(analytics.includes('endReason,'), 'saveLevelRecord payload must include endReason');
assert.ok(methodBody(analytics, 'trackSmartHintShow').includes("eventName: 'smart_hint_show'"), 'smart idle hints must emit smart_hint_show behavior events');
assert.ok(methodBody(analytics, 'trackSmartHintShow').includes('this.trackFunnelEvent'), 'smart idle hints must also emit funnel events');
assert.ok(methodBody(analytics, 'markLevelPassed').includes('smartHintShownCount'), 'level_pass behavior event must carry smartHintShownCount');

assert.ok(settlement.includes('AnalyticsMgr.inst.markLevelPassed(this.getAnalyticsPage(), logicalLevelId, {'), 'gameWin must pass the runtime logical level id and PCH snapshot');
assert.ok(settlement.includes('AnalyticsMgr.inst.markLevelFailed(this.getAnalyticsPage(), logicalLevelId, {'), 'gameLose must pass the runtime logical level id and PCH failure snapshot');
assert.ok(settlement.includes('const smartHintShownCount = AnalyticsMgr.inst.getSmartHintShownCount()'), 'gameWin funnel event must include smart hint attribution count');
assert.ok(settlement.includes('this.trackSmartIdleHintShown?.(plan)'), 'smart idle hint visual show must be counted only after a path is started');

assert.ok(addBehaviorData.includes('smartHintShownCount: normalizeNonNegativeInt(event.smartHintShownCount)'), 'addBehaviorData must persist smartHintShownCount');
assert.ok(saveLevelRecord.includes('normalizeEndReason'), 'saveLevelRecord must normalize endReason');
assert.ok(saveLevelRecord.includes('endReason,'), 'saveLevelRecord must persist endReason');
assert.ok(calcLevelRate.includes('isAbandonedRecord'), 'calcLevelRate must identify abandoned/interrupted records');
assert.ok(calcLevelRate.includes('resultRecords = records.filter'), 'calcLevelRate must exclude abandoned records from pass/fail denominator');
assert.ok(calcLevelRate.includes('abandonedCount'), 'calcLevelRate must expose abandonedCount for diagnostics');
assert.ok(dashboard.includes('isAbandonedLevelRecord'), 'dashboard cloud function must identify abandoned/interrupted records');
assert.ok(dashboard.includes('stat.abandonedCount += 1'), 'dashboard cloud function must keep abandoned diagnostics');
assert.ok(dashboard.includes('buildFront10ExperimentStats'), 'dashboard must expose front10 experiment level stats');
assert.ok(dashboard.includes("eventName === 'smart_hint_show'"), 'dashboard must count smart_hint_show events');
assert.ok(dashboard.includes('smartGuidedPassUsers'), 'dashboard must expose users who passed after seeing smart hints');
assert.ok(dashboard.includes('smartHintShownCount > 0'), 'dashboard must attribute guided passes from smartHintShownCount');
assert.ok(dashboard.includes('adFinishCount'), 'dashboard must expose per-level completed ad count for the experiment');
assert.ok(dashboard.includes('front10ExperimentStats: buildFront10ExperimentStats(behaviorList)'), 'dashboard response must include front10ExperimentStats');
assert.ok(dailyJob.includes('isAbandonedLevelRecord'), 'daily job must identify abandoned/interrupted records');
assert.ok(dailyJob.includes('resultRecords: resultRounds'), 'daily job summary must report result-record denominator');
assert.ok(dailyJob.includes('abandonedRecords: abandonedRounds'), 'daily job summary must report abandoned records');

console.log('level-analytics-session-lifecycle.test.js passed');
