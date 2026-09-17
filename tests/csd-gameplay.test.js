const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = ts.createSourceFile('controller.ts', fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const cls = source.statements.find(ts.isClassDeclaration);
const names = new Set(['csdElapsed', 'csdReady', 'csdStartupMs', 'csdMonitor', 'csdBoardResults', 'updateCsdInteraction',
  'flushCsdObservations', 'recordCsdBoardResult', 'getCapacityOfferMode', 'isLevelThreeFreeCapacity']);
const members = cls.members.filter(x => names.has(x.name?.getText(source))).map(x => x.getText(source)).join('\n');
const exportsMonitor = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/CsdInteractionMonitor.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsMonitor });
let official = true, blockers = [], now = 1000;
const sandbox = { AnalyticsMgr: { inst: { isCollectionEnabled: () => official } },
  collectActiveBlockInputEvents: () => blockers, CsdInteractionMonitor: exportsMonitor.CsdInteractionMonitor,
  Date: { now: () => now }, PCH_LEVEL_THREE_MAX_CAPACITY: 150 };
vm.runInNewContext(ts.transpileModule(`class Controller { ${members} }; globalThis.Controller = Controller;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, sandbox);
const c = new sandbox.Controller(), events = []; let ready = 0, level = 3;
c.runtime = { _activeGameplayEntryMode: 'main', getActiveLogicalLevelId: () => level, _csdOnInteractionReady: () => ready++ };
c.rules = { bufferCapacity: 120 }; c.analyticsStats = { validActionCount: 0 };
c.isLevelThreeMeasurementActive = () => true;
c.isStartupInteractionReady = () => c.openingPatternState === 'done';
c.isOpeningGuideActive = () => false;
c.isExpectedGuideBlocker = () => false;
c.trackPchFunnelEvent = (eventName, options) => events.push({ eventName, ...options });
assert.equal(c.getCapacityOfferMode('manual_button'), 'free');
c.rules.bufferCapacity = 150; assert.equal(c.getCapacityOfferMode('manual_button'), 'unavailable');
level = 4; assert.equal(c.getCapacityOfferMode('capacity_soft_hint'), 'free'); assert.equal(c.getCapacityOfferMode('manual_button'), 'ad');
level = 5; assert.equal(c.getCapacityOfferMode('capacity_soft_hint'), 'free');
c.runtime._activeGameplayEntryMode = 'theme'; assert.equal(c.getCapacityOfferMode('capacity_soft_hint'), 'ad');
c.runtime._activeGameplayEntryMode = 'main';
c.openingPatternState = 'running'; c.updateCsdInteraction(.5); assert.equal(ready, 0);
c.openingPatternState = 'done'; blockers = [{ path: 'Canvas/StartupLoadingUI' }]; c.updateCsdInteraction(.5); assert.equal(ready, 0);
blockers = []; c.updateCsdInteraction(.5); assert.equal(ready, 1); c.updateCsdInteraction(.5); assert.equal(ready, 1);
assert.equal(events.filter(x => x.eventName === 'csd_input_block_summary').length, 0, 'normal startup is not a blocker failure');
blockers = [{ path: 'Canvas/stale_mask' }]; now += 500; c.updateCsdInteraction(.5);
now += 500; c.updateCsdInteraction(.5); blockers = []; now += 500; c.updateCsdInteraction(.5);
assert.equal(events.filter(x => x.eventName === 'csd_input_block_summary').length, 1);
const previous = events.length; official = false; blockers = [{ path: 'Canvas/stale_mask' }]; c.updateCsdInteraction(5); assert.equal(events.length, previous);
console.log('PASS CSD gameplay: free/ad eligibility, animation/cover readiness, once-only signal, passive recovery');
