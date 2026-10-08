const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
function load(file, requireModule = () => ({})) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, require: requireModule, console, Date, Map, Set });
    return exports;
}
const { SettlementAnalytics } = load('assets/Scripts/Core/SettlementAnalytics.ts');
function fixture(level = 42, mode = 'main', target = level + 1) {
    const events = [];
    const tracker = new SettlementAnalytics(e => events.push(e), () => true);
    const context = { roundId: `source-${mode}-${level}`, logicalLevelId: level, physicalLevelId: level + 1000,
        gameplayEntryMode: mode, clientBuildId: 'test-build', extra: { firstLevelExperimentBucket: 'B' } };
    const id = tracker.begin(context, 'win', target ? { logicalLevelId: target, gameplayEntryMode: mode } : null);
    tracker.shown(id, 'win_panel');
    return { tracker, events, id, context };
}
function complete(f, id, level, mode = 'main', success = true) {
    f.tracker.transition(id);
    const context = { roundId: 'target-round', logicalLevelId: level, physicalLevelId: level + 5000, gameplayEntryMode: mode, success };
    f.tracker.levelStarted(context);
    const link = f.tracker.ready(context);
    assert.equal(link.transitionAttemptId, id);
    return context;
}
function terminal(f) { return f.events.filter(e => e.eventName === 'settlement_transition_result').at(-1); }

const high = fixture();
high.context.roundId = 'changed-after-pass';
high.context.extra.firstLevelExperimentBucket = 'C';
high.tracker.shown(high.id, 'basic_win_panel');
assert.equal(high.events.filter(e => e.eventName === 'settlement_shown').length, 1);
const highAttempt = high.tracker.action(high.id, 'next');
assert.equal(high.tracker.action(high.id, 'next'), highAttempt);
assert.equal(high.events.filter(e => e.eventName === 'settlement_action').length, 1);
high.tracker.gate(highAttempt, 'passed', 'vigor');
const targetReady = complete(high, highAttempt, 43);
assert.equal(terminal(high).extra.result, 'playable');
assert.equal(terminal(high).roundId, 'source-main-42', 'source survives pass/session clearing');
assert.equal(terminal(high).extra.firstLevelExperimentBucket, 'B', 'source experiment must remain frozen');
assert.equal(terminal(high).extra.toPhysicalLevelId, 5043);
const before = high.events.length;
high.tracker.ready(targetReady);
high.tracker.shown(high.id, 'stale_callback');
assert.equal(high.events.length, before, 'late callbacks must not duplicate completed flow');

const cancelled = fixture(2);
const a1 = cancelled.tracker.action(cancelled.id, 'next');
cancelled.tracker.gate(a1, 'blocked', 'vigor');
cancelled.tracker.background();
assert(!cancelled.events.some(e => e.eventName === 'settlement_transition_result'), 'background is not failure');
cancelled.tracker.gate(a1, 'cancelled', 'cancelled');
const a2 = cancelled.tracker.action(cancelled.id, 'next');
assert.notEqual(a1, a2, 'new player attempt must get its own identity');
cancelled.tracker.gate(a1, 'passed', 'late_ad_callback');
cancelled.tracker.gate(a2, 'passed', 'vigor_after_reward');
complete(cancelled, a2, 3);
assert.equal(terminal(cancelled).extra.result, 'playable');
assert(!cancelled.events.some(e => e.extra.reason === 'late_ad_callback'));

const rewardRetry = fixture(8);
const retryId = rewardRetry.tracker.action(rewardRetry.id, 'next');
rewardRetry.tracker.gate(retryId, 'failed', 'reward_failed', true);
assert(!terminal(rewardRetry), 'a recoverable reward failure is not a terminal continuation failure');
rewardRetry.tracker.gate(retryId, 'passed', 'vigor_after_reward');
complete(rewardRetry, retryId, 9);
assert.equal(terminal(rewardRetry).extra.result, 'playable');
const endedReward = fixture(8);
const endedRewardId = endedReward.tracker.action(endedReward.id, 'next');
endedReward.tracker.gate(endedRewardId, 'failed', 'reward_failed', true);
endedReward.tracker.gate(endedRewardId, 'failed', 'reward_failed');
assert.equal(terminal(endedReward).extra.result, 'failed', 'an unrecoverable repeat must still end the attempt');

const theme = fixture(1003, 'theme', 1017);
const ta = theme.tracker.action(theme.id, 'next');
complete(theme, ta, 1017, 'theme');
assert.equal(terminal(theme).extra.toLogicalLevelId, 1017, 'theme route is not source + 1');
const end = fixture(1009, 'theme', null);
assert.equal(end.events[0].extra.hasNextLevel, false);
const ea = end.tracker.action(end.id, 'next');
end.tracker.gate(ea, 'exempt', 'no_next_level');
end.tracker.finish(ea, 'completed', 'no_next_level');
assert.equal(terminal(end).extra.result, 'completed');
assert(!end.events.some(e => e.eventName === 'settlement_transition_start'));

for (const mode of ['coop', 'pvp']) {
    const f = fixture(130, mode, null);
    const attempt = f.tracker.action(f.id, 'home', null);
    f.tracker.finish(attempt, 'returned_home', `${mode}_result`);
    assert.equal(terminal(f).gameplayEntryMode, mode);
    assert.equal(terminal(f).extra.result, 'returned_home');
}
const failed = fixture();
const fa = failed.tracker.action(failed.id, 'next');
failed.tracker.transition(fa);
failed.tracker.failTransition('cdn_failed', 'test');
assert.equal(terminal(failed).extra.result, 'failed');
assert(!failed.events.some(e => e.extra.result === 'playable'));
const blocked = fixture();
complete(blocked, blocked.tracker.action(blocked.id, 'next'), 43, 'main', false);
assert.equal(terminal(blocked).extra.result, 'failed', 'an input-blocked ready event is not success');
const wrongRoute = fixture();
const wa = wrongRoute.tracker.action(wrongRoute.id, 'next'); wrongRoute.tracker.transition(wa);
wrongRoute.tracker.levelStarted({ roundId: 'other', logicalLevelId: 43, gameplayEntryMode: 'theme' });
assert.equal(terminal(wrongRoute).extra.result, 'superseded');
const disabledEvents = [];
const disabled = new SettlementAnalytics(e => disabledEvents.push(e), () => false);
assert.equal(disabled.begin({ roundId: 'r' }, 'win', null), '');
disabled.shown('', 'normal'); disabled.action('', 'next'); disabled.background();
assert.equal(disabledEvents.length, 0, 'non-release telemetry stays disabled');

// Execute the real button/next-level methods with gameplay dependencies isolated.
const runtimeFlow = fixture(2);
const deps = name => name.endsWith('GameCtrlShared') ? { AnalyticsMgr: { inst: { settlement: runtimeFlow.tracker } } } : {};
const { installSettlementHudModule } = load('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts', deps);
const runtime = {};
installSettlementHudModule(runtime);
let vigor = false, spent = 0, transitionCount = 0, callback;
Object.assign(runtime, { _settlementAnalyticsId: runtimeFlow.id, levelData: { levelId: 2 },
    getActiveLogicalLevelId: () => 2, unschedule() {}, saveLevelProgress() {}, setWinPrimaryButtonInteractable() {}, refreshWinAdBonusUI() {},
    costVigorForLevel: () => { if (vigor) { spent++; return true; } return false; },
    isTutorialVigorFreeLevel: () => false, showNoLivesAdModal: opt => { callback = opt.onResult; },
    requestLevelTransition: () => { transitionCount++; return Promise.resolve(true); },
    isValid: true, getRuntimeSceneName: () => 'Game',
});
runtime.handleWinSettlementPrimaryAction();
runtime.handleWinSettlementPrimaryAction();
assert.equal(runtimeFlow.events.filter(e => e.eventName === 'settlement_action').length, 1);
callback({ status: 'cancelled' });
assert.equal(runtime._settlementNextTransitioning, false);
vigor = true;
runtime.handleWinSettlementPrimaryAction();
assert.equal(spent, 1); assert.equal(transitionCount, 1);
assert(!runtimeFlow.events.some(e => e.extra.result === 'playable'), 'route promise alone is not success');

const runtimeReward = fixture(2);
const rewardRuntime = {};
load('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts', name => name.endsWith('GameCtrlShared')
    ? { AnalyticsMgr: { inst: { settlement: runtimeReward.tracker } } } : {}).installSettlementHudModule(rewardRuntime);
let rewardVigor = false, rewardCallback, rewardTransitions = 0;
Object.assign(rewardRuntime, { _settlementAnalyticsId: runtimeReward.id, levelData: { levelId: 2 },
    getActiveLogicalLevelId: () => 2, unschedule() {}, saveLevelProgress() {}, setWinPrimaryButtonInteractable() {}, refreshWinAdBonusUI() {},
    costVigorForLevel: () => rewardVigor, isTutorialVigorFreeLevel: () => false,
    showNoLivesAdModal: opt => { rewardCallback = opt.onResult; }, _noLivesModal: { isValid: true },
    requestLevelTransition: () => { rewardTransitions++; return Promise.resolve(true); },
    isValid: true, getRuntimeSceneName: () => 'Game' });
rewardRuntime.handleWinSettlementPrimaryAction();
rewardCallback({ status: 'failed' });
assert(!terminal(runtimeReward));
rewardVigor = true; rewardCallback({ status: 'granted' });
assert.equal(rewardTransitions, 1);
complete(runtimeReward, runtimeReward.events.find(e => e.eventName === 'settlement_action').extra.transitionAttemptId, 3);
assert.equal(terminal(runtimeReward).extra.result, 'playable');

const themeRuntimeFlow = fixture(1003, 'theme', 1017), themeRuntime = {};
load('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts', name => name.endsWith('GameCtrlShared')
    ? { AnalyticsMgr: { inst: { settlement: themeRuntimeFlow.tracker } } } : {}).installThemeLoadingOverlayModule(themeRuntime);
let themeVigor = false, themeCallback, themeLoads = 0;
Object.assign(themeRuntime, { isValid: true, getRuntimeSceneName: () => 'Game',
    costVigorForLevel: () => themeVigor, showNoLivesAdModal: opt => { themeCallback = opt.onResult; },
    _noLivesModal: { isValid: true }, deactivateMainMenuNode() {}, loadThemeLevel: id => { assert.equal(id, 1017); themeLoads++; },
    requestGameplayTransition: (_, run) => { run(); return Promise.resolve(true); } });
const themeRuntimeAttempt = themeRuntimeFlow.tracker.action(themeRuntimeFlow.id, 'next');
themeRuntime.startThemeLevel(1017, { settlementAttemptId: themeRuntimeAttempt });
themeCallback({ status: 'failed' }); assert(!terminal(themeRuntimeFlow));
themeVigor = true; themeCallback({ status: 'granted' });
assert.equal(themeLoads, 1);
complete(themeRuntimeFlow, themeRuntimeAttempt, 1017, 'theme');
assert.equal(terminal(themeRuntimeFlow).extra.result, 'playable');
console.log('PASS settlement analytics: all-level flow, snapshots, modes, idempotency, cancellation/retry, real button/vigor branches, ready-only success');

const { buildSettlementFlowReport, buildAnalyticsV2Report } = require('../scripts/analytics-v2-report');
const raw = [high, cancelled, rewardRetry, theme, end, failed, blocked, wrongRoute].flatMap(f => f.events)
    .map((e, i) => ({ ...e, openid: 'test-user', eventId: `e${i}`, timestamp: 100 + i,
        analyticsEnvironment: 'wechat_release', csdVersion: 3 }));
const flow = buildSettlementFlowReport([...raw, raw[0]]);
assert.equal(flow.available, true);
assert(flow.levels.some(x => x.levelId === 42), 'report must include levels beyond the tutorial/first 20');
const themeLast = flow.levels.find(x => x.mode === 'theme' && x.levelId === 1009);
assert.equal(themeLast.noNextLevel, 1); assert.equal(themeLast.nextAttempts, 0);
const l2 = flow.levels.find(x => x.levelId === 2);
assert.equal(l2.nextAttempts, 2); assert.equal(l2.cancelledAttempts, 1); assert.equal(l2.playableAttempts, 1);
assert.equal(l2.unresolvedAttempts, 0);
assert.equal(l2.nextChosenSettlements, 1, 'retry attempts must not inflate settlement conversion');
assert.equal(l2.nextChoiceRateAmongShownEligible, 1); assert.equal(l2.playableRateAmongShownEligible, 1);
assert.equal(l2.actionToPlayableWallMs.samples, 1);
assert.equal(buildSettlementFlowReport([{ eventName: 'level_pass' }]).available, false, 'legacy gaps are unavailable, not zero');
assert.equal(buildSettlementFlowReport(raw.map(x => ({ ...x, analyticsEnvironment: 'trial' }))).available, false);
assert(buildAnalyticsV2Report({ behaviorRecords: [], funnelRecords: raw, levelRecords: [] }).settlementFlow.available);

// Run the actual readiness producers, including the former first-ten-level gate.
function method(file, name, globals) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let found;
    function visit(node) {
        if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) found = node;
        ts.forEachChild(node, visit);
    }
    visit(source); assert(found, `missing method ${name}`);
    const exports = {};
    vm.runInNewContext(ts.transpileModule(`export class Test { ${found.getText(source)} }`, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, ...globals });
    return exports.Test.prototype[name];
}
let readinessCount = 0;
const updateReadiness = method('assets/Scripts/Core/PchConveyorGameplayController.ts', 'updateCsdInteraction', {
    AnalyticsMgr: { inst: { isCollectionEnabled: () => true } }, collectActiveBlockInputEvents: () => [],
    CsdInteractionMonitor: class { constructor() { throw Error('must not expand detailed CSD monitoring'); } },
});
const highRuntime = { _gameForeground: true, _csdOnInteractionReady: () => readinessCount++ };
const controller = { runtime: highRuntime, csdElapsed: 0, csdReady: false,
    isLevelThreeMeasurementActive: () => false, isStartupInteractionReady: () => true,
    isExpectedGuideBlocker: () => false };
updateReadiness.call(controller, 0.5); updateReadiness.call(controller, 0.5);
assert.equal(readinessCount, 1, 'high levels and non-main modes need exactly one ready callback');
const readyEvents = [];
const reportReady = method('assets/Scripts/Core/GameplaySessionController.ts', 'reportLevelInteractionReady', {
    AnalyticsMgr: { inst: { trackFunnelEvent: e => readyEvents.push(e) } }, collectActiveBlockInputEvents: () => [],
});
reportReady.call({}, { getAnalyticsPage: () => 'theme_level', levelData: {} }, 124, 3124, 'theme', 'none');
assert.equal(readyEvents.length, 1); assert.equal(readyEvents[0].success, true);
assert.equal(readyEvents[0].gameplayEntryMode, 'theme'); assert.equal(readyEvents[0].logicalLevelId, 124);
console.log('PASS real readiness producers beyond level 10 and outside mainline; detailed CSD scope unchanged');

// Use the real manager composition and every experiment's actual fields for the payload budget.
const experimentFixtures = Object.fromEntries([
    ['firstLevelExperiment', 'FirstLevelExperiment'], ['beanSelectionExperiment', 'BeanSelectionExperiment'],
    ['encouragementExperiment', 'EncouragementExperiment'], ['thirdLevelExperiment', 'ThirdLevelExperiment'],
].map(([name, file]) => [name, { decision: { id: name, status: 'enrolled', content: 'B', enrolledAt: 1, reason: 'assigned' },
    fields: method(`assets/Scripts/Core/${file}.ts`, 'fields', {}) }]));
const queued = [];
const managerGlobals = { ...experimentFixtures, Date,
    normalizeAnalyticsText: (x, max) => String(x ?? '').slice(0, max),
    normalizeGameplayMode: x => x || '', normalizeGameplaySchemaVersion: x => x || 1,
    resolveClientBuildIdentity: () => ({ id: 'test-build', source: 'test' }), CSD_MEASUREMENT_VERSION: 3 };
const manager = { isCollectionEnabled: () => true, levelSession: { roundId: 'actual-source', logicalLevelId: 42,
    physicalLevelId: 1042, gameplayEntryMode: 'main', gameplayMode: 'pch_conveyor', gameplaySchemaVersion: 1 },
    levelContext: {}, funnelSessionId: 'test-session', funnelEventSeq: 0, appLaunchTime: Date.now(), firstLevelReadyTime: 0,
    resolveChannel: () => 'test', measurements: { accept: () => true }, delivery: { enqueue: (_, event) => queued.push(event) },
    trackFunnelEvent: method('assets/Scripts/Core/AnalyticsMgr.ts', 'trackFunnelEvent', managerGlobals),
    beginSettlement: method('assets/Scripts/Core/AnalyticsMgr.ts', 'beginSettlement', managerGlobals),
};
manager.settlement = new SettlementAnalytics(e => manager.trackFunnelEvent(e), () => true);
const actualId = manager.beginSettlement('win', { logicalLevelId: 43, gameplayEntryMode: 'main' });
manager.levelSession = null; // markLevelPassed clears it in production.
manager.settlement.shown(actualId, 'win_panel');
const actualAttempt = manager.settlement.action(actualId, 'next');
manager.settlement.gate(actualAttempt, 'passed', 'vigor'); manager.settlement.transition(actualAttempt);
experimentFixtures.firstLevelExperiment.decision.content = 'C';
manager.levelSession = { roundId: 'actual-target', logicalLevelId: 43, physicalLevelId: 5043,
    gameplayEntryMode: 'main', gameplayMode: 'pch_conveyor', gameplaySchemaVersion: 1, startTime: Date.now() };
manager.settlement.levelStarted(manager.levelSession);
manager.trackFunnelEvent({ ...readyEvents[0], logicalLevelId: 43, physicalLevelId: 5043, gameplayEntryMode: 'main' });
const actualEnd = queued.find(e => e.extra.result === 'playable');
assert.equal(actualEnd.roundId, 'actual-source'); assert.equal(actualEnd.extra.toRoundId, 'actual-target');
assert.equal(actualEnd.extra.firstLevelExperimentBucket, 'B', 'manager must retain the captured source experiment');
const actualReady = queued.find(e => e.eventName === 'level_interaction_ready');
assert.equal(actualReady.roundId, 'actual-target'); assert.equal(actualReady.extra.transitionAttemptId, actualAttempt);
assert.equal(actualReady.extra.firstLevelExperimentBucket, 'C', 'target ready keeps its own experiment context');
for (const event of queued) assert(Object.keys(event.extra).length <= 45, `${event.eventName} exceeds cloud extra budget`);

async function verifyCloudContract() {
    const documents = [];
    const exports = {};
    vm.runInNewContext(fs.readFileSync('cloudfunctions/addFunnelEvents/index.js', 'utf8'), {
        exports, console, Date, require: name => name === 'wx-server-sdk' ? {
            init() {}, getWXContext: () => ({ OPENID: 'test-user' }), database: () => ({ collection: () => ({
                doc: () => ({ set: async value => documents.push(value.data) }),
            }) }),
        } : require(name),
    });
    const result = await exports.main({ events: queued });
    assert.equal(result.ok, true);
    const saved = documents.find(e => e.extra.result === 'playable');
    assert.equal(saved.extra.transitionAttemptId, actualAttempt);
    assert.equal(saved.extra.toRoundId, 'actual-target');
    assert.equal(saved.extra.result, 'playable');
    for (const event of documents) assert.equal(event.extraDroppedKeyCount, 0);
    console.log('PASS settlement flow report and existing cloud payload compatibility (no cloud writes)');
}
verifyCloudContract().catch(error => { console.error(error); process.exitCode = 1; });
