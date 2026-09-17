const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

// Execute the production handlers; only rendering, audio and the SDK boundary are stubbed.
const path = 'assets/Scripts/Core/PchConveyorGameplayController.ts';
const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
const cls = source.statements.find(ts.isClassDeclaration);
const names = new Set(['capacityAdBlockedUntil', 'capacityAdFreshTouchRequired', 'capacityAdTouchId',
    'onOpeningGuideFreeCapacity', 'onCapacityAdTouchStart', 'onCapacityAdTap',
    'resetCapacityAdGesture', 'setExternalInputBlocked', 'showOpeningFeatureGuide', 'stop']);
const members = cls.members.filter(m => names.has(m.name?.getText(source))).map(m => m.getText(source)).join('\n');
let now = 10000;
const box = { Date: { now: () => now }, AudioMgr: { inst: { play() {} } }, UITransform: {},
    Node: { EventType: {} }, console };
vm.runInNewContext(ts.transpileModule(`class Controller { ${members} }; globalThis.Controller = Controller;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, box);
const touch = id => ({ getID: () => id, propagationStopped: false });
let ads = 0, free = 0;
const c = new box.Controller();
const runtime = {
    _activeGameplayEntryMode: 'main', isGameEnd: false,
    getActiveLogicalLevelId: () => 3,
    getGameplayFixedRoot: () => ({ getComponent: () => ({ convertToNodeSpaceAR: x => x }) }),
    showToast() {}, runRewardedGrant() { ads++; },
};
Object.assign(c, {
    runtime, rules: { bufferCapacity: 108 }, adButton: { isValid: true, worldPosition: {} , off() {} },
    inputLocked: true, externalInputBlocked: false,
    openingGuide: { name: 'PchLevelThreeCapacityGuide' },
    expandCapacity() { free++; this.rules.bufferCapacity += 12; return true; },
    trackPchFunnelEvent() {},
    trackOpeningGuideEvent() {}, playCapacityGuideTapRings() {}, reportOpeningGuideTutorialFinish() {},
    dismissOpeningGuide() { this.openingGuide = null; this.inputLocked = false; },
    clearCapacityHint() {},
    // This fixture exercises the paid branch's gesture guard, independently of level-specific free eligibility.
    isLevelThreeFreeCapacity() { return false; }, getCapacityOfferMode() { return 'ad'; },
    flushCsdObservations() {},
});
c.onOpeningGuideFreeCapacity(touch(1));
c.onOpeningGuideFreeCapacity(touch(1));
assert.equal(free, 1, 'a duplicate free-guide touch must not expand twice');
assert.equal(c.rules.bufferCapacity, 120);
assert.equal(c.inputLocked, false, 'the feedback guard must not lock normal gameplay');
c.onCapacityAdTap(touch(1));
for (const delay of [100, 200, 500]) {
    now = 10000 + delay;
    c.onCapacityAdTouchStart(touch(2)); c.onCapacityAdTap(touch(2));
}
now = 10700; c.onCapacityAdTouchStart(touch(3));
now = 11000; c.onCapacityAdTap(touch(3));
assert.equal(ads, 0, 'holding a touch started during the guard must not bypass it');
c.onCapacityAdTap(touch(4));
assert.equal(ads, 0, 'a new touch end without a new touch start is rejected');
c.onCapacityAdTouchStart(touch(5)); c.onCapacityAdTap(touch(6)); c.onCapacityAdTap(touch(5));
assert.equal(ads, 0, 'mismatched multi-touch IDs must not arm an ad');
c.onCapacityAdTouchStart(touch(7)); c.onCapacityAdTap(touch(7));
c.onCapacityAdTap(touch(7));
assert.equal(ads, 1, 'a fresh deliberate gesture opens one ad only');
c.onCapacityAdTouchStart(touch(8)); c.setExternalInputBlocked(true);
c.setExternalInputBlocked(false); c.onCapacityAdTap(touch(8));
assert.equal(ads, 1);

// Execute the real hide/show methods without requiring a live Cocos scene.
const lifecycleFile = 'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts';
const lifecycleSource = ts.createSourceFile(lifecycleFile, fs.readFileSync(lifecycleFile, 'utf8'), ts.ScriptTarget.Latest, true);
const lifecycle = [];
function walk(node) {
    if (ts.isMethodDeclaration(node) && ['handleGameHideFlushUserState', 'handleGameShowLifecycle'].includes(node.name.getText(lifecycleSource))) {
        lifecycle.push(node.getText(lifecycleSource));
    }
    ts.forEachChild(node, walk);
}
walk(lifecycleSource);
box.AnalyticsMgr = { inst: { flushFunnelEvents() {} } };
box.UserStateSyncMgr = { inst: { flushPendingSave() {} } };
vm.runInNewContext(ts.transpileModule(`class Lifecycle { ${lifecycle.join('\n')} }; globalThis.Lifecycle = Lifecycle;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, box);
const life = new box.Lifecycle(); life._pchConveyorGameplayController = c;
c.onCapacityAdTouchStart(touch(9)); life.handleGameHideFlushUserState(); life.handleGameShowLifecycle();
c.onCapacityAdTap(touch(9));
assert.equal(ads, 1, 'background invalidates the unfinished gesture without rearming it');
assert.equal(c.rules.bufferCapacity, 120, 'same-round foreground keeps the free capacity');

// Stop/re-enter uses production cleanup and guide eligibility, with only visual cleanup stubbed.
for (const name of ['reportLevelThreeLeave', 'cancelOpeningPatternShuffle', 'releaseActiveSkillPause',
    'resetTableEntryDoorAnimation', 'resetExitArrowAnimation', 'resetCapacityWarning',
    'clearPchColorCompleteSequence', 'recycleAllSphereFlyEffects', 'clearOpeningGuideNodes']) c[name] = () => {};
for (const name of ['pendingReturnCompletions', 'lastEntranceAudioVisitByCarrier', 'activeSphereFlyEffects']) c[name] = new Map();
for (const name of ['activeFlyBeans', 'activePulseNodes', 'activeReturnBeans']) c[name] = new Set();
c.sphereFlyEffectPool = c.sphereFlyStarPool = { clear() {} };
c.stop();
assert.equal(c.capacityAdFreshTouchRequired, false);
assert.equal(c.capacityAdBlockedUntil, 0);
c.rules = { bufferCapacity: 108 }; c.adButton = { isValid: true, worldPosition: {} };
c.showLevelThreeCapacityGuide = () => { c.openingGuide = { name: 'PchLevelThreeCapacityGuide' }; c.inputLocked = true; };
c.showOpeningFeatureGuide({});
assert.equal(c.openingGuide.name, 'PchLevelThreeCapacityGuide');
life.handleGameHideFlushUserState(); life.handleGameShowLifecycle();
assert.equal(c.openingGuide.name, 'PchLevelThreeCapacityGuide', 'unfinished guide survives same-round foreground');
c.onOpeningGuideFreeCapacity(touch(10));
assert.equal(free, 2, 'reopened mainline level three grants one new free expansion');
assert.equal(c.rules.bufferCapacity, 120, 'the old round expansion is not accumulated');
console.log('pch-capacity-ad-gesture.test.js passed');
