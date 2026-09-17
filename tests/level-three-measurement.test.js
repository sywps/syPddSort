const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');
const file = 'assets/Scripts/Core/PchConveyorGameplayController.ts';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const cls = source.statements.find(ts.isClassDeclaration);
const names = new Set(['isLevelThreeMeasurementActive', 'levelThreeSnapshot', 'reportLevelThreeLeave', 'reportLevelThreeProgress']);
const methods = cls.members.filter(m => names.has(m.name?.getText(source))).map(m => m.getText(source)).join('\n');
let roundId = 'round3';
const box = { AnalyticsMgr: { inst: { getCurrentRoundId: () => roundId, flushFunnelEvents: () => {} } } };
vm.runInNewContext(ts.transpileModule(`class Measurement { ${methods} }; globalThis.Measurement = Measurement;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, box);
const c = new box.Measurement();
const events = [];
Object.assign(c, {
    runtime: { _activeGameplayEntryMode: 'main', getActiveLogicalLevelId: () => 3, isGameEnd: false },
    rules: { cells: Array.from({ length: 100 }, () => ({ locked: false })), bufferCount: 42, bufferCapacity: 120 },
    analyticsStats: { validActionCount: 7, capacityExpandCount: 1 },
    levelThreeRoundId: 'round3', levelThreeGuideDoneAt: 10,
    levelThreeProgressSent: new Set(), levelThreeLeaveSent: new Set(), firstStoreEventSent: true,
    trackPchFunnelEvent: (name, options) => events.push({ name, ...options }),
    flushCsdObservations() {},
});
c.reportLevelThreeProgress();
assert.equal(events.length, 0);
c.rules.cells.slice(0, 80).forEach(cell => { cell.locked = true; });
c.reportLevelThreeProgress(); c.reportLevelThreeProgress();
assert.deepEqual(events.map(e => e.name), ['level_progress', 'level_progress', 'level_progress']);
assert.deepEqual(events.map(e => e.extra.progressPercent), [25, 50, 75]);
c.runtime._adShowing = true; c.reportLevelThreeLeave('background');
assert.equal(events.length, 3, 'ad hide must not count as background snapshot');
c.runtime._adShowing = false;
c.reportLevelThreeLeave('background'); c.reportLevelThreeLeave('background');
c.reportLevelThreeLeave('leave'); c.reportLevelThreeLeave('leave');
assert.equal(events.length, 5, 'background and leave are bounded independently');
assert.equal(events[3].extra.progressRatio, .8);
assert.equal(events[3].extra.bufferCount, 42);
assert.equal(events[3].extra.validActionCount, 7);
roundId = 'new-round'; c.levelThreeLeaveSent.clear(); c.reportLevelThreeLeave('leave');
assert.equal(events.length, 5, 'old controller cannot report into a new round');
roundId = 'round4';
const c4 = new box.Measurement();
Object.assign(c4, c, { levelThreeRoundId: '', levelThreeLeaveSent: new Set(), runtime: { ...c.runtime, getActiveLogicalLevelId: () => 4 } });
c4.reportLevelThreeLeave('leave');
assert.equal(events.length, 6, 'level four is measured with its own round');
c4.runtime.getActiveLogicalLevelId = () => 11; c4.levelThreeLeaveSent.clear(); c4.reportLevelThreeLeave('leave');
assert.equal(events.length, 6, 'level eleven is outside the first-ten measurement');
console.log('level-three-measurement.test.js passed');
