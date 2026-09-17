const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function method(file, name) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let found;
  const visit = node => { if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) found = node.getText(ast); ts.forEachChild(node, visit); };
  visit(ast); assert.ok(found); return found;
}
function harness(body, scope) {
  vm.runInNewContext(ts.transpileModule(`class Harness { ${body} }; globalThis.Harness = Harness;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, scope);
  return new scope.Harness();
}
const timers = [], records = []; let draw;
const runtime = harness(method('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts', 'scheduleFirstLevelReleaseDiagnostics'), {
  Director: { EVENT_AFTER_DRAW: 'draw' }, director: { once: (e, fn) => { draw = fn; }, off() { draw = null; }, getTotalFrames: () => 1 },
  setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
});
Object.assign(runtime, { _firstLevelReleaseDiagToken: 1, _gameForeground: true,
  isFirstLevelReleaseDiagnosticsActive: () => true, scheduleOnce() {}, reportFirstLevelReleaseState: event => records.push(event) });
runtime.scheduleFirstLevelReleaseDiagnostics(); runtime._gameForeground = false; timers[0]();
assert.equal(records.length, 0, 'background draw timeout must not be a failure');
runtime._gameForeground = true; runtime.scheduleFirstLevelReleaseDiagnostics(); draw();
assert.deepEqual(records, ['after_draw_confirmed']);
runtime.scheduleFirstLevelReleaseDiagnostics(); runtime._firstLevelReleaseDiagToken++; timers.at(-1)();
assert.equal(records.length, 1, 'stale round timer must not report');
const effects = []; let counted = 0;
const skill = harness(method('assets/Scripts/Core/GameCtrlModules/GameplaySkillWandModule.ts', 'useSkillFreeze'), {
  AnalyticsMgr: { inst: { trackFunnelEvent: e => effects.push(e) } },
  PerformanceMgr: { inst: { markUserActivity() {} } }, FREEZE_PROP_SECONDS: 90,
});
Object.assign(skill, { _pchConveyorGameplayController: { isActive: () => true, beginSkillUsePause() {}, recordFreezeUse() { counted++; } },
  _rewardedGrantTransaction: { analyticsTransactionId: 'fixture' }, scheduleOnce() {}, unschedule() {}, resetIdleHintTimer() {}, finishSkillUsage() {} });
skill.useSkillFreeze(true); assert.equal(skill._freezeTimeLeft, 90); assert.equal(counted, 1);
assert.equal(effects[0].extra.adTransactionId, 'fixture'); assert.equal(effects[0].success, true);
skill.useSkillFreeze(true); assert.equal(counted, 1); assert.equal(effects.at(-1).errorCode, 'skill_already_active');
skill._skillActive = false; skill.playFreezeSpineFx = () => { throw Error('visual'); };
assert.throws(() => skill.useSkillFreeze(true), /visual/);
assert.equal(counted, 2, 'applied timer effect is counted even if subsequent optional visuals throw');
console.log('PASS CSD draw foreground/stale-round guards and freeze effect/counter consistency');
